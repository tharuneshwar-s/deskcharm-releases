// Water reminder: every `water_interval_min` minutes of screen time, the water visitor (job
// 'water', features/visitors.js: Vijay with his steel tumbler, or whoever "Who visits for what"
// picks, doing the generic job act) asks you to drink some water. YES counts a glass
// (water.js); NO asks how long to wait (15 min / 30 min / 1 hour) and snoozes that long; no
// answer asks again after SNOOZE_MIN.
//
// Config: water_reminder (on/off), water_interval_min (15–180), water_goal (glasses per day),
// user_name (used in his question). Quiet hours and smart hiding follow the visitors' rules:
// a reminder due while hidden waits until the overlay is back.
// Settings › Calm "Try it now" (and, in dev builds, the console: DeskWater.now()) send one at once via
// `water-command` { action: 'ask' }; Visitors "Try it" via window `desk:water-try` { id?, message? };
// the water hotkey sends `water-command` { action: 'drank' }: one glass, a short cue, and a full
// interval until the next ask.
//
// Every glass (however it was counted) is logged as insights-event { kind: 'water' }.
//
// Water ring: while the reminder is on, a small progress ring with a droplet sits beside the
// main charm's hook (features/rings.js, first in the row) showing today's glasses / goal; it
// pulses when a glass is added.
//
// desk:water events (from the visitor): { action: 'drank' | 'later' | 'ignored', minutes? } —
// 'later' snoozes `minutes` (default SNOOZE_MIN).

import { registerFeature } from '../features.js';
import { DEV } from '../dev.js';
import { t } from '../i18n.js';
import { setRing, pulseRing } from './rings.js';
import { drank, glasses, waterGoal, setWaterGoal } from '../water.js';

const TICK_MS = 15 * 1000;
export const SNOOZE_MIN = 20;
const RETRY_MIN = 2;              // couldn't show (hidden, visitors off): look again soon
const MAX_GAP_MS = 90 * 1000;     // longer gaps (sleep, frozen webview) don't count as screen time
const AWAY_RESET_MS = 10 * 60 * 1000; // away this long: start the interval again

const CUE_MS = 2600;
const C_ARC = '#8cc4ff';

let on = true;
let intervalMs = 60 * 60 * 1000;
let accum = 0;                    // screen time since the last reminder (ms)
let dueExtra = 0;                 // snooze: extra ms required before the next ask
let last = Date.now();

/** Send the water visitor (`id`: a particular one, `message`: this ask's own line). */
function ask(id, message) {
    const detail = { job: 'water', id, message };
    window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail }));
    return !!detail.sent;
}

/** Wait `minutes` (instead of a full interval) before the next ask. */
function snooze(minutes) {
    accum = 0;
    dueExtra = minutes * 60 * 1000 - intervalMs;
}

function tick(world) {
    const now = Date.now();
    const gap = now - last;
    last = now;
    if (!on) return;
    if (gap >= AWAY_RESET_MS) { accum = 0; dueExtra = 0; return; }
    if (gap > 0 && gap <= MAX_GAP_MS && !world.hidden) accum += gap;
    if (accum >= intervalMs + dueExtra) {
        if (ask()) {
            // Until he gets an answer (desk:water), treat it as snoozed — also covers a visit
            // that ends without one (visitors switched off, overlay hidden mid-visit).
            snooze(SNOOZE_MIN);
        } else {
            accum = intervalMs + dueExtra - RETRY_MIN * 60 * 1000;
        }
    }
}

let cueText = '';                 // cue for the next glass (the hotkey's confirmation)

function onGlass(world) {
    pulseRing('water', world, cueText);
    cueText = '';
    world.emit?.('insights-event', { kind: 'water' });
}

function syncRing() {
    setRing('water', on ? { order: 0, icon: 'drop', color: C_ARC, get: () => ({ n: glasses(), goal: waterGoal() }) } : null);
}

/** The water hotkey: one glass, a cue, and a full interval before the next ask. */
export function drankNow(world) {
    cueText = t('Glass counted 💧 {n}/{goal}', { n: glasses() + 1, goal: waterGoal() });
    const n = drank();
    window.dispatchEvent(new CustomEvent('desk:water', { detail: { action: 'drank' } }));
    world.keepAwake?.(CUE_MS + 100);
    return n;
}

registerFeature({
    onInit(world) {
        if (/[?&]embed/.test(location.search) && !/[?&]visitors/.test(location.search)) return;
        window.addEventListener('desk:water', (e) => {
            const a = e.detail?.action;
            // Drank: a full interval until the next one. Later: the chosen snooze; ignored: SNOOZE_MIN.
            if (a === 'drank') { accum = 0; dueExtra = 0; return; }
            const m = Number(e.detail?.minutes);
            snooze(a === 'later' && m > 0 && m <= 24 * 60 ? m : SNOOZE_MIN);
        });
        window.addEventListener('desk:water-changed', () => onGlass(world));
        setInterval(() => tick(world), TICK_MS);
        syncRing();
        if (DEV) window.DeskWater = { now: () => ask(), drank: () => drankNow(world) };
        window.addEventListener('desk:water-try', (e) => ask(e.detail?.id, e.detail?.message));
        world.listen('water-command', (e) => {
            const a = e.payload?.action;
            if (a === 'ask') ask();
            else if (a === 'drank') drankNow(world);
        });
    },

    onConfig(cfg) {
        if (cfg.water_reminder !== undefined) {
            if (cfg.water_reminder && !on) { accum = 0; dueExtra = 0; }
            on = !!cfg.water_reminder;
        }
        if (cfg.water_interval_min !== undefined) {
            intervalMs = Math.min(180, Math.max(15, Number(cfg.water_interval_min) || 60)) * 60 * 1000;
        }
        if (cfg.water_goal !== undefined) setWaterGoal(Number(cfg.water_goal));
        syncRing();
    },
});
