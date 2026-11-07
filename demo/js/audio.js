// Web Audio synth for chimes. Respects the "Sound effects" setting via setMuted().
// Melody mode (config melody_chimes) turns motion chimes into notes from a calm C major
// pentatonic scale; with it off, motion keeps the single bell. Contact sounds (beads,
// charm–charm clacks, the hook) exist in both modes and share a small budget so bursts of
// collisions never turn into noise.

const CHIME_COOLDOWN_MS = 600;
/** C major pentatonic, C5 → C7 (two octaves plus the top C). Any two notes sound calm together. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
const TOP = SCALE.length - 1;
const C4 = 261.63;

// Shared budget for incidental sounds: ~4 per second sustained, bursts of up to 4.
const BUDGET_RATE = 4;
const BUDGET_MAX = 4;

let ctx = null;
let muted = false;
let melody = true;
let lastBell = 0;
let tokens = BUDGET_MAX;
let tokensAt = 0;
const lastByKind = new Map();
/** Scale degree of the last melody note; new notes move from here by small steps. */
let walk = 4;

const muteListeners = new Set();

export function setMuted(value) {
    if (value === muted) return;
    muted = value;
    for (const fn of muteListeners) fn(muted);
}

/** Call `fn(muted)` whenever the global mute (config sound_effects) changes. Returns an unsubscribe. */
export function onMuteChange(fn) {
    muteListeners.add(fn);
    return () => muteListeners.delete(fn);
}

export function isMuted() {
    return muted;
}

/** Melody chimes on/off (config melody_chimes). */
export function setMelody(value) {
    melody = value;
}

export function isMelody() {
    return melody;
}

/** The shared AudioContext (created on first use, resumed if suspended). */
export function audioContext() {
    return context();
}

function context() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

function clampDegree(d) {
    return Math.max(0, Math.min(TOP, Math.round(d)));
}

/**
 * Rate limit for incidental sounds: a per-kind minimum gap plus the shared budget.
 * Returns false when muted, so callers can skip work.
 */
function allow(kind, minGapMs) {
    if (muted) return false;
    const now = performance.now();
    if (now - (lastByKind.get(kind) ?? -Infinity) < minGapMs) return false;
    tokens = Math.min(BUDGET_MAX, tokens + ((now - tokensAt) / 1000) * BUDGET_RATE);
    tokensAt = now;
    if (tokens < 1) return false;
    tokens -= 1;
    lastByKind.set(kind, now);
    return true;
}

/** One decaying partial. `delay` is seconds from now. No-op when muted. */
export function tone(freq, peak, decay, delay = 0, type = 'sine') {
    if (muted) return;
    const ac = context();
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + decay + 0.05);
}

/** Soft chime note: fundamental with faint octave and twelfth. */
function chimeNote(freq, peak, decay, delay = 0) {
    tone(freq, peak, decay, delay);
    tone(freq * 2, peak * 0.22, decay * 0.55, delay);
    tone(freq * 3, peak * 0.07, decay * 0.35, delay);
}

/** Bell with harmonics. Rate-limited so rapid triggers don't stack into noise. */
export function playBell() {
    if (muted) return;
    const now = performance.now();
    if (now - lastBell < CHIME_COOLDOWN_MS) return;
    lastBell = now;
    tone(880, 0.12, 0.8);
    tone(1760, 0.035, 0.6);
    tone(2640, 0.015, 0.4);
}

/**
 * Melody note for a swing passing through the bottom. Faster swings sit higher, so a
 * decaying swing plays a slowly falling line; the melody moves at most two scale steps at
 * a time and never repeats a note back to back. `dir` (±1) is the swing direction.
 */
export function swingNote(speed, dir) {
    if (!allow('swing', 380)) return;
    const target = clampDegree(1.5 + speed * 1.6);
    let next = walk + Math.max(-2, Math.min(2, target - walk));
    if (next === walk) next += dir >= 0 ? 1 : -1;
    if (next > TOP) next = TOP - 1;
    if (next < 0) next = 1;
    walk = next;
    chimeNote(SCALE[walk], Math.min(0.075, 0.025 + speed * 0.012), 1.8);
}

/** End of a drag/fling: the bell, or with melody on a note pitched by the fling speed. */
export function releaseChime(speed) {
    if (!melody) {
        playBell();
        return;
    }
    if (muted) return;
    const now = performance.now();
    if (now - lastBell < CHIME_COOLDOWN_MS) return;
    lastBell = now;
    walk = clampDegree(3 + speed * 0.35);
    chimeNote(SCALE[walk], 0.09, 2.0);
    chimeNote(SCALE[Math.max(0, walk - 2)], 0.035, 1.6, 0.11);
}

/**
 * Bead touching a bead (or the charm). `pitch` 0..1 picks the note (higher bead = higher
 * note); without melody it is a short wooden click.
 */
export function beadClick(speed, pitch) {
    if (!allow('bead', 70)) return;
    const peak = Math.min(0.05, 0.012 + speed * 0.012);
    if (melody) {
        const f = SCALE[clampDegree(5 + pitch * 5)];
        tone(f, peak, 0.35);
        tone(f * 2, peak * 0.15, 0.15);
    } else {
        tone(1900 + pitch * 300, peak * 0.6, 0.045, 0, 'triangle');
        tone(950 + pitch * 150, peak * 0.5, 0.07);
    }
}

/** Charm–charm collision: a soft low clack (a low pentatonic note with melody on). */
export function clack(speed) {
    if (!allow('clack', 140)) return;
    const peak = Math.min(0.08, 0.02 + speed * 0.01);
    tone(2400, peak * 0.15, 0.03, 0, 'triangle');
    if (melody) {
        const f = SCALE[clampDegree(Math.min(4, speed * 0.5))] / 2;
        chimeNote(f, peak, 0.9);
    } else {
        tone(420, peak, 0.12, 0, 'triangle');
        tone(1260, peak * 0.3, 0.06);
    }
}

/** Rope winding onto the hook (`turns` wound so far) or the last coil slipping off. */
export function hookNote(kind, turns = 1) {
    if (!allow('hook', 150)) return;
    if (kind === 'unwound') {
        if (melody) chimeNote(SCALE[0], 0.045, 1.6);
        else tone(660, 0.04, 0.5);
        return;
    }
    const f = melody ? SCALE[clampDegree(4 + turns * 2)] : 1320;
    tone(f, 0.035, 0.4);
    tone(f * 1.5, 0.01, 0.2, 0.03);
}

/** Feedback for a rapid "smash" click; rises with the stress energy `level` 0..1. */
export function smashTap(level) {
    if (muted) return;
    const now = performance.now();
    if (now - (lastByKind.get('tap') ?? -Infinity) < 50) return;
    lastByKind.set('tap', now);
    const f = melody ? SCALE[clampDegree(level * 7)] : 600 + level * 500;
    tone(f, 0.03, 0.14, 0, 'triangle');
}

/** Soft, slow C major (add 9) arpeggio over a low C: the calming release. */
export function calmChord() {
    if (muted) return;
    tone(C4, 0.04, 3.4);
    chimeNote(SCALE[0], 0.05, 3.0, 0.0);
    chimeNote(SCALE[2], 0.04, 2.9, 0.09);
    chimeNote(SCALE[3], 0.035, 2.8, 0.18);
    chimeNote(SCALE[6], 0.025, 2.6, 0.3);
    tone(SCALE[8], 0.012, 2.2, 0.42);
}

/** Soft "mew" for character charms: two short rising sine tones. */
export function mew() {
    if (muted) return;
    const now = performance.now();
    if (now - (lastByKind.get('mew') ?? -Infinity) < 300) return;
    lastByKind.set('mew', now);
    tone(880, 0.035, 0.1, 0);
    tone(1320, 0.03, 0.16, 0.08);
}
