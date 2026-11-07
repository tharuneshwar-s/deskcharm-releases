// First-run tips (config `onboarding_done` false): the charm shows three cues in turn, each
// advancing when you do it — fling it (drag + release), rest the cursor on it (the breathing glow
// starts), right-click it (the quick menu opens). A small × beside the cue skips the rest.
// When finished or skipped the overlay emits `onboarding-done` { done: true }; Rust saves it
// (src-tauri/src/ritual.rs). Settings › General › "Show the tips again" sets it back to false.
// Not shown on the website / Settings preview (embed) unless the page URL has `tips`.

import { registerFeature } from '../features.js';
import { tx } from '../i18n.js';
import { OverlayUI, charmCenter } from '../overlay-ui.js';
import { BASE_CHARM_H } from '../charm.js';
import { DEV } from '../dev.js';

export const STEPS = ['fling', 'rest', 'menu'];
const CUES = { fling: tx('Grab me and fling'), rest: tx('Rest your cursor on me'), menu: tx('Right-click me') };
const DONE_CUE = tx('You’re all set ✨');
const DONE_MS = 3500;
const START_DELAY_MS = 1500;     // let the charm settle after launch before the first cue

/** Step machine: { i, done, skipped }. */
export function createTips() {
    return { i: 0, done: false, skipped: false };
}

export function currentStep(s) {
    return s.done ? null : STEPS[s.i];
}

/** Apply a user action ('fling' | 'rest' | 'menu' | 'skip'); returns whether the state changed. */
export function advance(s, action) {
    if (s.done) return false;
    if (action === 'skip') {
        s.done = true;
        s.skipped = true;
        return true;
    }
    if (action !== STEPS[s.i]) return false;
    s.i++;
    if (s.i >= STEPS.length) s.done = true;
    return true;
}

let world = null;
let ui = null;
let tips = null;           // running tips, or null
let startAt = 0;
let doneUntil = 0;
let allowed = true;

function mainView() {
    return world.charms[0]?.view;
}

function act(action) {
    if (!tips || performance.now() < startAt) return;
    if (!advance(tips, action)) return;
    if (tips.done) finish(!tips.skipped);
}

function finish(completed) {
    tips = null;
    world.onboarding = false;
    doneUntil = completed ? performance.now() + DONE_MS : 0;
    world.config.onboarding_done = true;
    world.emit('onboarding-done', { done: true });
    world.keepAwake?.(DONE_MS + 600);
}

function start() {
    tips = createTips();
    world.onboarding = true;
    startAt = performance.now() + START_DELAY_MS;
    world.keepAwake?.(START_DELAY_MS + 1000);
}

function overCharm(x, y) {
    const view = mainView();
    if (!view) return false;
    const c = charmCenter(view);
    return Math.hypot(x - c.x, y - c.y) <= BASE_CHARM_H * view.scale * 0.6;
}

registerFeature({
    onInit(w) {
        world = w;
        allowed = !window.DeskHostApi || /[?&]tips\b/.test(location.search);
        ui = new OverlayUI(w.layers.ui, 3);   // above wellness (2) and ritual (1) cues
        w.interaction.addHotspot({
            hit: (x, y) => !!tips && ui.closeHit(x, y),
            press: () => act('skip'),
        });
        w.interaction.on('release', (view) => { if (view === mainView()) act('fling'); });
        window.addEventListener('contextmenu', (e) => {
            if (tips && currentStep(tips) === 'menu' && overCharm(e.clientX, e.clientY)) act('menu');
        });
        if (DEV) window.DeskTips = { start, skip: () => act('skip'), state: () => tips };
    },

    onConfig(cfg) {
        if (!allowed || cfg.onboarding_done === undefined) return;
        if (cfg.onboarding_done === false && !tips) start();
        else if (cfg.onboarding_done === true && tips) { tips = null; world.onboarding = false; }
    },

    onRender(w, now, dt) {
        const view = mainView();
        if (!view) return;
        const t = performance.now();
        let cue = null;
        if (tips && t >= startAt) {
            if (currentStep(tips) === 'rest' && w.interaction.isBreathing(view, now)) act('rest');
            if (tips) cue = CUES[currentStep(tips)];
        } else if (t < doneUntil) {
            cue = DONE_CUE;
        }
        ui.setClose(!!tips);
        ui.follow(view, dt);
        ui.setCue(cue);
        // The tips are static text: stay awake only while they fade (input wakes the loop for the steps).
        if (ui.render(dt)) w.keepAwake?.(200);
    },
});
