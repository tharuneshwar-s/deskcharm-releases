// "Reacts to your PC": consumers of the native env-* events (src-tauri/src/reactive.rs).
//
//   env-audio-level { level 0..1, beat }  music sway: a wind that flips side on beats
//   env-typing-rate { kps }               typing breeze: a steady, gusty wind from the screen edge
//   env-window-move { vx, vy }            window shake: a dragged window "bumps the desk"
//
// Every effect eases in and out; the native sources stop emitting when switched off, and the
// winds are cleared here at the same time so nothing lingers.

import { registerFeature } from '../features.js';
import { setWind } from '../forces.js';

// ---- music sway ----
const MUSIC_WIND = 0.03;            // px/step² at full loudness
const MUSIC_LEVEL_EASE = 0.02;      // per-step blend toward the reported level
const MUSIC_WIND_EASE = 0.025;      // per-step blend of the wind toward its side (soft flips)
// Flipping on every beat would jitter; ~1 s between flips is close to half the pendulum's
// period, so the charm sways in time instead of shivering.
const MUSIC_MIN_FLIP_MS = 850;
const MUSIC_IDLE_FLIP_MS = 1700;    // ambient music without a clear beat still sways slowly
const SIGNAL_TIMEOUT_MS = 400;      // no event for this long = source went quiet

// ---- typing breeze ----
const TYPING_WIND = 0.024;          // px/step² at TYPING_FULL_KPS and above
const TYPING_FULL_KPS = 8;
const TYPING_EASE = 0.008;          // per-step blend (~1 s to build up / die down)
const TYPING_TIMEOUT_MS = 1500;
const IDLE_AFTER_MS = 60000;        // no typing and no cursor movement this long = idle
const IDLE_RAMP_IN = 1 / (120 * 5); // idle calm fades in over 5 s...
const IDLE_RAMP_OUT = 1 / (120 * 0.5); // ...and out over 0.5 s when the user is back
const IDLE_DAMP = 0.006;            // extra per-step velocity damping at full idle calm

// ---- window shake ----
const SHAKE_FOLLOW = 0.2;           // per-step blend of the smoothed window velocity
const SHAKE_GAIN = 0.05;            // charm kick per unit of window acceleration
const SHAKE_MAX_KICK = 0.3;         // px/step cap per step
const SHAKE_VERTICAL = 0.5;         // vertical bumps feel heavier; scale them down
const SHAKE_TIMEOUT_MS = 120;

let musicOn = false;
let typingOn = false;
let shakeOn = true;

const music = { target: 0, level: 0, side: 1, wind: 0, lastFlip: 0, lastEvent: 0 };
const typing = { target: 0, kps: 0, lastEvent: 0, lastActive: 0, lastCursor: 0, calm: 0 };
const shake = { tx: 0, ty: 0, vx: 0, vy: 0, lastEvent: 0 };

function resetMusic() {
    music.target = music.level = music.wind = 0;
    setWind('music', 0, 0);
}

function resetTyping() {
    typing.target = typing.kps = typing.calm = 0;
    setWind('typing', 0, 0);
}

function resetShake() {
    shake.tx = shake.ty = shake.vx = shake.vy = 0;
}

function stepMusic(now) {
    if (now - music.lastEvent > SIGNAL_TIMEOUT_MS) music.target = 0;
    music.level += (music.target - music.level) * MUSIC_LEVEL_EASE;
    if (music.level > 0.02 && now - music.lastFlip > MUSIC_IDLE_FLIP_MS) {
        music.side = -music.side;
        music.lastFlip = now;
    }
    music.wind += (music.side * MUSIC_WIND * music.level - music.wind) * MUSIC_WIND_EASE;
    if (music.target === 0 && Math.abs(music.wind) < 1e-4) resetMusic();
    else setWind('music', music.wind, 0);
}

function stepTyping(world, now) {
    if (now - typing.lastEvent > TYPING_TIMEOUT_MS) typing.target = 0;
    typing.kps += (typing.target - typing.kps) * TYPING_EASE;

    const x = Math.min(typing.kps / TYPING_FULL_KPS, 1);
    const eased = 1 - (1 - x) * (1 - x);
    if (eased < 1e-3) {
        setWind('typing', 0, 0);
    } else {
        // Blow away from the screen edge the charm hangs at, with slow gusts so it never
        // reads as a static tilt.
        const dir = world.config.position === 'top-left' ? 1 : -1;
        const t = now / 1000;
        const gust = 0.75 + 0.25 * Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1);
        setWind('typing', dir * TYPING_WIND * eased * gust, 0);
    }

    // Idle calm: nobody typing or moving the mouse for a minute → the charm settles.
    const idle = now - Math.max(typing.lastActive, typing.lastCursor) > IDLE_AFTER_MS;
    typing.calm = idle
        ? Math.min(1, typing.calm + IDLE_RAMP_IN)
        : Math.max(0, typing.calm - IDLE_RAMP_OUT);
    if (typing.calm === 0 || world.interaction.state !== 'idle') return;
    const keep = 1 - IDLE_DAMP * typing.calm;
    for (const c of world.charms) {
        const { px, py, ox, oy, n } = c.rope;
        // Runs after integration: shrinking (p - o) removes velocity for the next step.
        for (let i = 1; i < n; i++) {
            px[i] = ox[i] + (px[i] - ox[i]) * keep;
            py[i] = oy[i] + (py[i] - oy[i]) * keep;
        }
    }
}

function stepShake(world, now) {
    if (now - shake.lastEvent > SHAKE_TIMEOUT_MS) shake.tx = shake.ty = 0;
    const pvx = shake.vx, pvy = shake.vy;
    shake.vx += (shake.tx - shake.vx) * SHAKE_FOLLOW;
    shake.vy += (shake.ty - shake.vy) * SHAKE_FOLLOW;
    // Inertia: when the "desk" accelerates one way, the charm lags the other way.
    const clamp = (v) => Math.max(-SHAKE_MAX_KICK, Math.min(SHAKE_MAX_KICK, v));
    const kx = clamp(-(shake.vx - pvx) * SHAKE_GAIN);
    const ky = clamp(-(shake.vy - pvy) * SHAKE_GAIN * SHAKE_VERTICAL);
    if (Math.abs(kx) < 1e-4 && Math.abs(ky) < 1e-4) return;
    for (const c of world.charms) {
        const rope = c.rope;
        if (rope.held) continue;
        const { px, py, n } = rope;
        // Added after integration without moving the old positions = a velocity kick,
        // weighted toward the free end like the winds.
        for (let i = 1; i < n; i++) {
            const w = i / (n - 1);
            px[i] += kx * w;
            py[i] += ky * w;
        }
    }
}

registerFeature({
    onInit(world) {
        const now = performance.now();
        typing.lastActive = typing.lastCursor = now;

        world.listen('env-audio-level', (e) => {
            if (!musicOn) return;
            const { level, beat } = e.payload;
            const t = performance.now();
            music.target = Math.max(0, Math.min(1, level));
            music.lastEvent = t;
            if (beat && t - music.lastFlip > MUSIC_MIN_FLIP_MS) {
                music.side = -music.side;
                music.lastFlip = t;
            }
        });
        world.listen('env-typing-rate', (e) => {
            if (!typingOn) return;
            const t = performance.now();
            typing.target = Math.max(0, e.payload.kps);
            typing.lastEvent = t;
            if (typing.target > 0) typing.lastActive = t;
        });
        world.listen('cursor-pos', () => {
            typing.lastCursor = performance.now();
        });
        world.listen('env-window-move', (e) => {
            if (!shakeOn) return;
            shake.tx = e.payload.vx;
            shake.ty = e.payload.vy;
            shake.lastEvent = performance.now();
        });
    },

    onConfig(cfg) {
        if (cfg.music_sway !== undefined && cfg.music_sway !== musicOn) {
            musicOn = cfg.music_sway;
            if (!musicOn) resetMusic();
        }
        if (cfg.typing_breeze !== undefined && cfg.typing_breeze !== typingOn) {
            typingOn = cfg.typing_breeze;
            if (!typingOn) resetTyping();
            // Fresh start: don't count the time the breeze was off as idle time.
            else typing.lastActive = performance.now();
        }
        if (cfg.window_shake !== undefined && cfg.window_shake !== shakeOn) {
            shakeOn = cfg.window_shake;
            if (!shakeOn) resetShake();
        }
    },

    onStep(world) {
        const now = performance.now();
        if (musicOn) stepMusic(now);
        if (typingOn) stepTyping(world, now);
        if (shakeOn) stepShake(world, now);
    },
});
