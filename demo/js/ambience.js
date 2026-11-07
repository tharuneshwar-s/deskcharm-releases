// Ambient sounds (config `ambience`), synthesized live in Web Audio — no files.
//
//   rain    filtered noise bed + random droplet ticks
//   wind    band-passed noise, slow LFOs on pitch and level, plus scheduled gusts
//   ocean   low-passed noise with a swell envelope every 8–12 s
//   temple  soft low drone + sparse bell strikes with a long decay
//   chimes  sparse random pentatonic wind chimes over a faint breeze
//
// CPU: every sound reads one shared looping noise buffer per AudioContext; there is no
// per-sample JS. Discrete events (drops, waves, bells, chimes) are scheduled a little ahead
// on the audio clock by `schedule(until)`, so the same voice renders in an OfflineAudioContext.
//
// Also exported: the pure session/fade state machine the overlay feature runs
// (resolveAmbience + stepAmbience), kept free of audio so it can be unit-tested.

export const SOUNDS = ['rain', 'wind', 'ocean', 'temple', 'chimes'];
export const FADE_MS = 2000;
/** Sound played during breathing/focus sessions when the chosen sound is 'off'. */
export const SESSION_DEFAULT = 'rain';

// ========== STATE MACHINE (pure) ==========

/**
 * Which sound should be playing now, or null for silence.
 *   sound         config ambience ('off' | one of SOUNDS)
 *   withSessions  config ambience_with_sessions
 *   session       a breathing or focus session is running
 *   muted         global mute (sound_effects off)
 *   hidden        smart hiding active, or the overlay window is hidden
 */
export function resolveAmbience({ sound, withSessions, session, muted, hidden }) {
    if (muted || hidden) return null;
    if (SOUNDS.includes(sound)) return sound;
    if (withSessions && session) return SESSION_DEFAULT;
    return null;
}

export const IDLE = Object.freeze({ phase: 'idle', sound: null, until: 0 });

/**
 * Advance the player toward `target` (a sound or null). Returns { state, actions } where
 * actions are { type: 'start', sound } (begin silent and fade in), 'fade-in', 'fade-out' and
 * 'stop'. A sound switch fades the old one out fully before the new one starts.
 */
export function stepAmbience(state, target, now, fadeMs = FADE_MS) {
    const actions = [];
    let s = state;
    // Loop so a finished fade-out can start the next sound in the same step.
    for (let guard = 0; guard < 3; guard++) {
        if (s.phase === 'idle') {
            if (target) {
                actions.push({ type: 'start', sound: target });
                s = { phase: 'in', sound: target, until: now + fadeMs };
            }
            break;
        }
        if (s.phase === 'out') {
            if (target === s.sound) {
                actions.push({ type: 'fade-in' });
                s = { phase: 'in', sound: s.sound, until: now + fadeMs };
                break;
            }
            if (now < s.until) break;
            actions.push({ type: 'stop' });
            s = IDLE;
            continue;
        }
        // 'in' or 'on'
        if (target !== s.sound) {
            actions.push({ type: 'fade-out' });
            s = { phase: 'out', sound: s.sound, until: now + fadeMs };
            break;
        }
        if (s.phase === 'in' && now >= s.until) s = { phase: 'on', sound: s.sound, until: 0 };
        break;
    }
    return { state: s, actions };
}

/** Master gain for a 0–100 volume: perceptual curve, full scale stays clear of clipping. */
export function volumeGain(volume) {
    const v = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
    return 0.8 * v * v;
}

// ========== SYNTHS ==========

const noiseBuffers = new WeakMap();
const NOISE_SECONDS = 4;

/** One looping white-noise buffer per context, shared by every voice. */
function noiseBuffer(ac) {
    let buf = noiseBuffers.get(ac);
    if (!buf) {
        buf = ac.createBuffer(1, Math.round(ac.sampleRate * NOISE_SECONDS), ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        noiseBuffers.set(ac, buf);
    }
    return buf;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Builds one sound's graph into `out` and returns { schedule(until), stop(when) }.
 * schedule() adds discrete events up to audio time `until`.
 */
function buildVoice(ac, sound, out) {
    const t0 = ac.currentTime;
    const sources = [];
    const timers = [];

    function noise(gain, filters) {
        const src = ac.createBufferSource();
        src.buffer = noiseBuffer(ac);
        src.loop = true;
        let node = src;
        for (const f of filters) {
            const bq = ac.createBiquadFilter();
            bq.type = f.type;
            bq.frequency.value = f.freq;
            if (f.q != null) bq.Q.value = f.q;
            node.connect(bq);
            node = bq;
            f.node = bq;
        }
        const g = ac.createGain();
        g.gain.value = gain;
        node.connect(g).connect(out);
        src.start(t0, rand(0, NOISE_SECONDS));
        sources.push(src);
        return g;
    }

    function osc(freq, type = 'sine') {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.start(t0);
        sources.push(o);
        return o;
    }

    /** Sine partials with exponential decay, struck at `t`. */
    function strike(t, freq, partials, dest = out) {
        for (const [ratio, amp, decay] of partials) {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.frequency.value = freq * ratio;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(amp, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
            o.connect(g).connect(dest);
            o.start(t);
            o.stop(t + decay + 0.05);
        }
    }

    /** Recurring event: `fire(t)` then wait `gap()` seconds. */
    function every(first, gap, fire) {
        timers.push({ next: t0 + first, gap, fire });
    }

    switch (sound) {
        case 'rain': {
            noise(0.22, [{ type: 'highpass', freq: 400 }, { type: 'lowpass', freq: 3200 }]);
            noise(0.16, [{ type: 'lowpass', freq: 700 }]);
            const buf = noiseBuffer(ac);
            every(0.05, () => rand(0.03, 0.22), (t) => {
                const src = ac.createBufferSource();
                src.buffer = buf;
                const bp = ac.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = rand(1800, 5500);
                bp.Q.value = 6;
                const g = ac.createGain();
                const peak = rand(0.25, 0.9);
                const decay = rand(0.015, 0.05);
                g.gain.setValueAtTime(peak, t);
                g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
                src.connect(bp).connect(g).connect(out);
                src.start(t, rand(0, NOISE_SECONDS - 0.1), decay + 0.02);
            });
            break;
        }
        case 'wind': {
            const body = [{ type: 'bandpass', freq: 420, q: 0.9 }];
            const level = noise(0.55, body);
            const whistle = [{ type: 'bandpass', freq: 1300, q: 6 }];
            const hiss = noise(0.12, whistle);
            // Slow LFOs: pitch wander and breathing level.
            const lfo1 = osc(0.071);
            const d1 = ac.createGain();
            d1.gain.value = 220;
            lfo1.connect(d1).connect(body[0].node.frequency);
            const lfo1b = ac.createGain();
            lfo1b.gain.value = 500;
            lfo1.connect(lfo1b).connect(whistle[0].node.frequency);
            const lfo2 = osc(0.043);
            const d2 = ac.createGain();
            d2.gain.value = 0.2;
            lfo2.connect(d2).connect(level.gain);
            // Gusts: a swell on top of the LFOs every few seconds.
            const gust = ac.createGain();
            gust.gain.value = 0.6;
            level.disconnect();
            hiss.disconnect();
            level.connect(gust);
            hiss.connect(gust);
            gust.connect(out);
            every(rand(1, 3), () => rand(4, 9), (t) => {
                const len = rand(2, 4);
                gust.gain.setTargetAtTime(rand(0.85, 1.05), t, len * 0.3);
                gust.gain.setTargetAtTime(0.55, t + len, len * 0.4);
            });
            break;
        }
        case 'ocean': {
            const surf = [{ type: 'lowpass', freq: 400, q: 0.5 }];
            const swell = noise(0.1, surf);
            noise(0.18, [{ type: 'lowpass', freq: 180 }]);
            every(0, () => rand(8, 12), (t) => {
                const period = rand(8, 12);
                const rise = period * 0.4;
                const lp = surf[0].node.frequency;
                swell.gain.setValueAtTime(0.1, t);
                swell.gain.linearRampToValueAtTime(rand(0.55, 0.75), t + rise);
                swell.gain.exponentialRampToValueAtTime(0.1, t + period * 0.95);
                lp.setValueAtTime(350, t);
                lp.linearRampToValueAtTime(rand(1300, 1900), t + rise);
                lp.exponentialRampToValueAtTime(350, t + period * 0.95);
                return period; // next wave starts as this one ends
            });
            break;
        }
        case 'temple': {
            const drone = ac.createGain();
            drone.gain.value = 0.05;
            const lp = ac.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 600;
            drone.connect(lp).connect(out);
            for (const [f, type] of [[110, 'sine'], [110.35, 'sine'], [165, 'triangle'], [55, 'sine']]) osc(f, type).connect(drone);
            const lfo = osc(0.05);
            const depth = ac.createGain();
            depth.gain.value = 0.02;
            lfo.connect(depth).connect(drone.gain);
            every(0.4, () => rand(7, 15), (t) => {
                strike(t, pick([146.83, 196.0, 220.0]), [
                    [1, 0.3, 9], [2.0, 0.14, 6], [2.76, 0.1, 4], [4.07, 0.05, 2.5], [5.4, 0.03, 1.5],
                ]);
            });
            break;
        }
        case 'chimes': {
            noise(0.035, [{ type: 'lowpass', freq: 1000 }]);
            const notes = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02];
            every(0.3, () => rand(1.5, 5), (t) => {
                const n = 1 + Math.floor(Math.random() * 3);
                let at = t;
                for (let i = 0; i < n; i++) {
                    const v = rand(0.5, 1);
                    strike(at, pick(notes), [[1, 0.16 * v, 3.5], [2.76, 0.05 * v, 1.5], [5.4, 0.02 * v, 0.6]]);
                    at += rand(0.08, 0.4);
                }
            });
            break;
        }
    }

    return {
        schedule(until) {
            for (const tm of timers) {
                while (tm.next < until) {
                    const gap = tm.fire(tm.next);
                    tm.next += typeof gap === 'number' ? gap : tm.gap();
                }
            }
        },
        stop(when) {
            for (const s of sources) {
                try { s.stop(when); } catch { /* already stopped */ }
            }
            timers.length = 0;
        },
    };
}

/** Render `sound` into any (Offline)AudioContext: returns the voice; caller schedules. */
export function createVoice(ac, sound, destination) {
    return buildVoice(ac, sound, destination);
}

const LOOKAHEAD_S = 1.5;
const TICK_MS = 500;

/**
 * A live player on `ac`: one sound at a time with fades. Volume and fade gains are separate
 * so a volume change never cancels a fade.
 */
export class AmbiencePlayer {
    constructor(ac) {
        this.ac = ac;
        this.volume = ac.createGain();
        this.volume.gain.value = volumeGain(40);
        this.volume.connect(ac.destination);
        this.fade = null;
        this.voice = null;
        this.timer = 0;
    }

    setVolume(volume) {
        this.volume.gain.setTargetAtTime(volumeGain(volume), this.ac.currentTime, 0.1);
    }

    /** Start `sound` silent and fade it in. Stops whatever was playing. */
    start(sound, fadeMs = FADE_MS) {
        this.stop();
        const ac = this.ac;
        this.fade = ac.createGain();
        this.fade.gain.value = 0;
        this.fade.connect(this.volume);
        this.voice = buildVoice(ac, sound, this.fade);
        this.voice.schedule(ac.currentTime + LOOKAHEAD_S);
        this.timer = setInterval(() => this.voice?.schedule(this.ac.currentTime + LOOKAHEAD_S), TICK_MS);
        this.fadeIn(fadeMs);
    }

    fadeIn(fadeMs = FADE_MS) {
        this.rampTo(1, fadeMs);
    }

    fadeOut(fadeMs = FADE_MS) {
        this.rampTo(0, fadeMs);
    }

    rampTo(value, fadeMs) {
        if (!this.fade) return;
        const g = this.fade.gain;
        const now = this.ac.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(value, now + fadeMs / 1000);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = 0;
        if (this.voice) this.voice.stop(this.ac.currentTime + 0.05);
        if (this.fade) {
            const f = this.fade;
            setTimeout(() => f.disconnect(), 200);
        }
        this.voice = null;
        this.fade = null;
    }
}
