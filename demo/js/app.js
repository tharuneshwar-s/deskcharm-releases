// Overlay bootstrap: Tauri wiring, config, charms, and the fixed-step main loop.
// The overlay window covers the whole monitor and is click-through except over a charm.

import './error-log.js';
import { Rope, BASE_SEG } from './rope.js';
import { CharmView } from './charm.js';
import { createInteraction } from './interaction.js';
import { setMuted } from './audio.js';
import { setLanguage } from './i18n.js';
import { totalWind } from './forces.js';
import { isStill, ropeMotion, DEEP_CALM_MS } from './stillness.js';
import { initFeatures, configFeatures, stepFeatures, renderFeatures } from './features.js';
import { mainAnchorX } from './two-charms.js';
import '../charms.js';   // DeskCharmCatalog: which pack a charm is in (Pro gating)
import './pro.js';
import './features/wellness.js';
import './features/seasons.js';
import './features/reactive.js';
import './features/toys.js';
import './features/smash.js';
import './features/smart-hide.js';
import './features/visitors.js';
import './features/water.js';
import './features/counters.js';
import './features/nudges.js';
import './features/focus-guard.js';
import './features/living.js';
import './features/ambience.js';
import './features/onboarding.js';
import './features/ritual.js';
import './features/tasks.js';
import './features/reminders.js';
import './features/theme.js';
import './features/mood.js';
import './features/pro.js';

const FIXED_DT = 1 / 120;
const ANCHOR_Y = 18;              // hook peg just inside the top screen edge (see CharmView)
const DEFAULT_SEG = BASE_SEG * 0.7;
const HIDE_FADE_S = 0.5;          // smart-hide fade out / in
const HIDDEN_FRAME_MS = 250;      // while fully hidden: physics paused, features ticked at 4 Hz
const REDUCED_WIND = 0.3;         // reduced motion: ambient winds (music, typing, weather) at 30 %

// Embedded (website hero, Settings preview) the page provides a stand-in API; see embed-host.js.
const api = window.DeskHostApi || window.__TAURI__;
const { getCurrentWindow } = api.window;
const { listen, emit } = api.event;
const appWindow = getCurrentWindow();

// Click-through by default; capture is enabled only while the cursor is over a charm.
await appWindow.setIgnoreCursorEvents(true);

const svgEl = document.querySelector('.dg-svg');
const layers = {
    back: document.getElementById('layer-back'),
    charms: document.getElementById('layer-charms'),
    front: document.getElementById('layer-front'),
    ui: document.getElementById('layer-ui'),
};

const interaction = createInteraction({ appWindow, emit, svgEl });

/**
 * Shared state handed to feature modules (see features.js).
 *   charms       [{ rope, view, anchorDX, anchorAt, ownScale, ownSeg }] — charms[0] is the main charm;
 *                anchorAt() → absolute anchor x (else main anchor + anchorDX; anchorDX is kept in step),
 *                ownScale / ownSeg: size and rope segment of their own (else the main charm's)
 *   anchorX(dx)  screen x of an anchor offset dx from the main anchor
 *   addCharm(anchorDX, charmData) / removeCharm(charm) / placeAnchors()
 *   config       last full or merged config
 *   hidden       smart hiding active (fullscreen app / call): the overlay fades out, then
 *                physics pauses and mouse capture is released. Set with setHidden(bool).
 *   reducedMotion  effective reduced motion (settings + Windows); set with setReducedMotion(bool)
 */
const world = {
    charms: [],
    layers,
    interaction,
    config: {},
    emit,
    listen,
    appWindow,
    anchorX: (dx = 0) => baseAnchorX + dx,
    anchorY: ANCHOR_Y,
    addCharm,
    placeAnchors,
    removeCharm,
    hidden: false,
    reducedMotion: false,
    setHidden,
    setReducedMotion,
    /** Keep the animation loop running for at least `ms` more (features call it while animating). */
    keepAwake,
    /** Idle sway currently applied by the ropes (off with idle_animation, reduced motion, deep calm). */
    idleSway: true,
    /** Set by features/visitors.js while a visitor is out. */
    visitorActive: false,
};

let position = 'top-right';
let offset = 0;
let baseAnchorX = anchorXFor(position, offset);
let seg = DEFAULT_SEG;
let charmScale = 1;
let idleAnimation = true;
let cursorInteraction = true;
let userOpacity = 1;
/** Smart-hide fade factor, 0 (hidden) … 1 (shown); multiplies the user's opacity. */
let shown = 1;

// Idle sleep (see the main loop): declared up here because events can arrive during startup awaits.
const SLEEP_CHECK_MS = 500;
const KEEP_AWAKE_MIN_MS = 100;
let lastInputAt = performance.now();
let awakeUntil = 0;
let asleep = false;
let checkTimer = null;
let lastTime = performance.now();
let accumulator = 0;
let paused = false;

function anchorXFor(pos, off) {
    return mainAnchorX(pos, off, window.innerWidth);
}

function applyOpacity() {
    svgEl.style.opacity = userOpacity * shown;
}

/** Smart hiding (features/smart-hide.js). Independent of the tray/hotkey hide, which hides the window. */
function setHidden(on) {
    if (on === world.hidden) return;
    world.hidden = on;
    interaction.setSuspended(on);
    wake();
}

function setReducedMotion(on) {
    world.reducedMotion = on;
    for (const c of world.charms) {
        c.rope.reducedMotion = on;
        c.view.reducedMotion = on;
    }
}

function addCharm(anchorDX, charmData) {
    const rope = new Rope(baseAnchorX + anchorDX, ANCHOR_Y, seg);
    const view = new CharmView(layers.charms, rope);
    view.setScale(charmScale);
    view.applyCharm(charmData);
    const charm = { rope, view, anchorDX, anchorAt: null, ownScale: null, ownSeg: null };
    rope.reducedMotion = view.reducedMotion = world.reducedMotion;
    world.charms.push(charm);
    interaction.setViews(world.charms.map((c) => c.view));
    return charm;
}

function removeCharm(charm) {
    const i = world.charms.indexOf(charm);
    if (i <= 0) return; // the main charm is permanent
    world.charms.splice(i, 1);
    charm.view.remove();
    interaction.setViews(world.charms.map((c) => c.view));
}

function placeAnchors() {
    baseAnchorX = anchorXFor(position, offset);
    for (const c of world.charms) {
        if (c.anchorAt) c.anchorDX = c.anchorAt() - baseAnchorX;
        c.rope.moveAnchor(baseAnchorX + c.anchorDX, ANCHOR_Y);
    }
}

function fitCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    svgEl.setAttribute('width', w);
    svgEl.setAttribute('height', h);
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
}

fitCanvas();
window.addEventListener('resize', () => {
    fitCanvas();
    placeAnchors();
});

// ========== MAIN CHARM ==========
const DEFAULT_CHARM = { id: 'nazar-blue', image: 'nazar-blue.png', rope: '#6B4423', ropeHi: '#b58b5c', rs: 'rope', beadType: 'evil-eye', beadColors: ['#2140bf', '#73ccfa', '#0d0d1a'], beadSmall: '#e9ebf2', weight: 'medium' };
addCharm(0, DEFAULT_CHARM);

// ========== CONFIG ==========
// DeskCharm Pro (features/pro.js keeps world.license): the free tier shows a gated copy of the
// saved config (src/js/pro.js effective); the saved config itself is kept for when Pro is back.
let savedConfig = {};
function gate(cfg) {
    savedConfig = Object.assign({}, savedConfig, cfg);
    const over = globalThis.DeskPro.effective(savedConfig, world.license, globalThis.DeskCharmCatalog, new Date());
    if (!over) return cfg;
    const out = Object.assign({}, cfg, over);
    if ('charm' in over) out.charm_data = over.charm_data || DEFAULT_CHARM;
    return out;
}
world.reapplyConfig = () => {
    if (Object.keys(savedConfig).length) applyConfig(savedConfig);
};

function applyConfig(cfg) {
    wake();
    cfg = gate(cfg);
    Object.assign(world.config, cfg);
    if (cfg.ui_language !== undefined) setLanguage(cfg.ui_language);
    if (cfg.idle_animation !== undefined) idleAnimation = cfg.idle_animation;
    if (cfg.cursor_interaction !== undefined) cursorInteraction = cfg.cursor_interaction;
    if (cfg.sound_effects !== undefined) setMuted(!cfg.sound_effects);
    if (cfg.drag_interaction !== undefined) interaction.setEnabled(cfg.drag_interaction);
    if (cfg.opacity !== undefined) {
        userOpacity = cfg.opacity;
        applyOpacity();
    }

    const main = world.charms[0];
    if (cfg.charm_data) main.view.applyCharm(cfg.charm_data);

    if (cfg.charm_size !== undefined) {
        charmScale = cfg.charm_size / 100;
        for (const c of world.charms) if (c.ownScale == null) c.view.setScale(charmScale);
    }
    if (cfg.string_length !== undefined) {
        seg = BASE_SEG * (cfg.string_length / 100);
        for (const c of world.charms) if (c.ownSeg == null) c.rope.setSegment(seg);
    }
    if (cfg.position !== undefined) position = cfg.position;
    if (cfg.offset !== undefined) offset = cfg.offset;
    placeAnchors();

    configFeatures(cfg, world);
}

let windowShown = false;
function showWindow() {
    if (!windowShown) {
        windowShown = true;
        requestAnimationFrame(() => appWindow.show());
    }
}
function onConfig(e) {
    applyConfig(e.payload);
    showWindow();
}

// Every overlay event a feature subscribes to (water/wellness commands, env-*, insights…) wakes the loop.
world.listen = (name, fn) => listen(name, (e) => {
    wake();
    fn(e);
});
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) {
    window.addEventListener(type, noteInput, { passive: true });
}
for (const type of ['desk:visitor-job', 'desk:wellness-command']) {
    window.addEventListener(type, () => keepAwake(), { capture: true });
}

initFeatures(world);

await listen('cursor-pos', (e) => {
    noteInput();
    const [x, y] = e.payload;
    interaction.hostCursor(x, y);
});
// config-changed: after a save. current-config: reply to request-config, and the saved config
// re-sent when Settings closes (discarding an unsaved preview).
await listen('config-changed', onConfig);
await listen('current-config', onConfig);
await listen('preview-config', (e) => applyConfig(e.payload));
emit('request-config');
setTimeout(showWindow, 2000);

// ========== MAIN LOOP ==========
// Sleeps (no requestAnimationFrame) while everything is still; see stillness.js. Woken by input,
// config, any overlay event a feature listens to, desk:* commands and world.keepAwake(); a slow
// check frame every SLEEP_CHECK_MS lets time-driven features (clock, timers, blinks) run meanwhile.
function noteInput() {
    lastInputAt = performance.now();
    wake();
}

function keepAwake(ms = 0) {
    awakeUntil = Math.max(awakeUntil, performance.now() + Math.max(ms, KEEP_AWAKE_MIN_MS));
    wake();
}

function resume() {
    asleep = false;
    clearTimeout(checkTimer);
    // No catch-up burst for the time asleep: the first frame back starts the clock (dt 0).
    lastTime = -1;
    accumulator = 0;
    requestAnimationFrame(animate);
}

function wake() {
    if (asleep) resume();
}

function sleep() {
    asleep = true;
    // Drop the sub-pixel residual swing so the next wake starts from exact rest.
    for (const c of world.charms) c.rope.settle();
    checkTimer = setTimeout(() => { if (asleep) resume(); }, SLEEP_CHECK_MS);
}

function anglesSettled() {
    for (const c of world.charms) {
        let d = c.view.localAngle(c.rope.end) - c.view.angle;
        d -= 360 * Math.round(d / 360);
        if (Math.abs(d) > 0.05) return false;
    }
    return true;
}

function stillNow(now) {
    const w = totalWind();
    let motion = 0;
    for (const c of world.charms) motion = Math.max(motion, ropeMotion(c.rope, c.view));
    return isStill({
        motion,
        interacting: interaction.state !== 'idle' || !!interaction.target || world.charms.some((c) => c.view.glowFade > 0),
        cursorQuietMs: now - lastInputAt,
        wind: w.vx !== 0 || w.vy !== 0,
        fading: shown !== (world.hidden ? 0 : 1),
        visitorActive: world.visitorActive,
        awakeUntil,
        now,
        swaying: world.idleSway,
    }) && anglesSettled();
}

function step() {
    const t = performance.now() / 1000;
    const total = totalWind();
    const windK = world.reducedMotion ? REDUCED_WIND : 1;
    const wind = { vx: total.vx * windK, vy: total.vy * windK };
    const anyWind = wind.vx !== 0 || wind.vy !== 0;
    // Deep calm: no cursor input for a minute switches the idle sway off, so the overlay can sleep.
    const idleSway = world.idleSway = idleAnimation && !world.reducedMotion &&
        performance.now() - lastInputAt < DEEP_CALM_MS;

    for (const c of world.charms) c.rope.snapshot();
    interaction.preStep();
    for (const c of world.charms) {
        const calm = c.view.glowFade > 0.5 && !c.rope.held;
        c.rope.integrate({ t, calm, idleSway, wind: anyWind ? wind : null });
    }

    if (cursorInteraction && interaction.allowPush()) {
        const m = interaction.mouse;
        for (const c of world.charms) {
            const center = c.view.pushCenter();
            c.rope.push(m.x, m.y, m.vx, m.vy, center.x, center.y);
        }
    }

    interaction.applyDrag();
    stepFeatures(world);
    for (const c of world.charms) c.rope.solve();
    interaction.postStep();

    // Motion chimes (bell / melody notes) are played by features/toys.js.
    for (const c of world.charms) c.view.stepSqueeze(interaction.isSqueezing(c.view));
}

function animate(now) {
    if (lastTime < 0) lastTime = now;
    const dt = Math.min(Math.max(0, now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Smart hiding: fade the whole overlay (on top of the user's opacity), and once it is
    // invisible stop simulating and drawing charms; features still tick, slowly, for timers.
    const target = world.hidden ? 0 : 1;
    if (shown !== target) {
        shown = target > shown ? Math.min(1, shown + dt / HIDE_FADE_S) : Math.max(0, shown - dt / HIDE_FADE_S);
        applyOpacity();
    }
    if (world.hidden && shown === 0) {
        paused = true;
        renderFeatures(world, now, dt);
        setTimeout(() => requestAnimationFrame(animate), HIDDEN_FRAME_MS);
        return;
    }
    if (paused) {
        // Resuming: no catch-up steps for the time spent hidden; the rope picks up where it paused.
        paused = false;
        accumulator = 0;
    } else {
        accumulator += dt;
    }

    while (accumulator >= FIXED_DT) {
        step();
        accumulator -= FIXED_DT;
    }

    interaction.update(now);
    const alpha = accumulator / FIXED_DT;
    for (const c of world.charms) c.view.prepare(dt, alpha);
    interaction.syncHeld();
    for (const c of world.charms) c.view.render(now, dt, interaction.isBreathing(c.view, now));
    renderFeatures(world, now, dt);
    if (stillNow(performance.now())) sleep();
    else requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
