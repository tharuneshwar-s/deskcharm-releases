// Stretch & posture nudges: every `stretch_interval_min` / `posture_interval_min` minutes of screen
// time, the stretch / posture visitor comes (job 'stretch' | 'posture', features/visitors.js): the
// yogi floats in and demonstrates (visitors/yogi.js, opts.nudge), or another visitor asks with
// Done / Later (visitors/jobs.js). Done counts (a full interval until the next); ignoring it asks
// again after SNOOZE_MIN. Screen time is counted like the water reminder (features/water.js): gaps longer than
// MAX_GAP_MS don't count, being away AWAY_RESET_MS starts the interval again, and while the overlay
// is hidden nothing counts. Quiet hours / calls / visitors off: desk:visitor-job refuses, and we
// look again after RETRY_MIN.
//
// Config: stretch_reminders, stretch_interval_min (15–180), posture_reminders,
// posture_interval_min (10–120). Settings › Calm "Try it now" sends `nudge-command` { kind };
// Visitors "Try it" sends window `desk:nudge-try` { kind, id?, message? }.

import { registerFeature } from '../features.js';
import { DEV } from '../dev.js';

const TICK_MS = 15 * 1000;
const MIN = 60 * 1000;
export const SNOOZE_MIN = 15;
export const RETRY_MIN = 2;
export const MAX_GAP_MS = 90 * 1000;
export const AWAY_RESET_MS = 10 * MIN;

/** One reminder's screen-time schedule (pure; tested in test/nudges.test.mjs). */
export function schedule(intervalMin) {
    return { on: false, intervalMs: intervalMin * MIN, accum: 0, dueExtra: 0 };
}

/** Count `gap` ms of screen time; true when the reminder is due. */
export function advance(s, gap, hidden) {
    if (!s.on) return false;
    if (gap >= AWAY_RESET_MS) { s.accum = 0; s.dueExtra = 0; return false; }
    if (gap > 0 && gap <= MAX_GAP_MS && !hidden) s.accum += gap;
    return s.accum >= s.intervalMs + s.dueExtra;
}

/** After trying to send: sent → wait for an answer as if snoozed; refused → look again soon. */
export function attempted(s, sent) {
    if (sent) { s.accum = 0; s.dueExtra = SNOOZE_MIN * MIN - s.intervalMs; }
    else s.accum = s.intervalMs + s.dueExtra - RETRY_MIN * MIN;
}

/** The yogi's answer: 'done' → a full interval; anything else → snooze. */
export function answered(s, action) {
    s.accum = 0;
    s.dueExtra = action === 'done' ? 0 : SNOOZE_MIN * MIN - s.intervalMs;
}

export function setOn(s, on) {
    if (on && !s.on) { s.accum = 0; s.dueExtra = 0; }
    s.on = !!on;
}

export function setIntervalMin(s, min, lo, hi, dflt) {
    s.intervalMs = Math.min(hi, Math.max(lo, Number(min) || dflt)) * MIN;
}

const S = { stretch: schedule(60), posture: schedule(30) };
let last = Date.now();

function nudge(kind, id, message) {
    const detail = { job: kind, id, message };
    window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail }));
    return !!detail.sent;
}

function tick(world) {
    const now = Date.now();
    const gap = now - last;
    last = now;
    let busy = false;                 // one yogi at a time: the other waits for a retry
    for (const kind of ['stretch', 'posture']) {
        const s = S[kind];
        if (!advance(s, gap, world.hidden)) continue;
        attempted(s, !busy && (busy = nudge(kind)));
    }
}

registerFeature({
    onInit(world) {
        if (/[?&]embed/.test(location.search) && !/[?&]visitors/.test(location.search)) return;
        window.addEventListener('desk:nudge', (e) => {
            const s = S[e.detail?.kind];
            if (s) answered(s, e.detail.action);
        });
        setInterval(() => tick(world), TICK_MS);
        if (DEV) window.DeskNudges = { now: (kind) => nudge(kind) };
        window.addEventListener('desk:nudge-try', (e) => {
            const d = e.detail || {};
            if (S[d.kind]) nudge(d.kind, d.id, d.message);
        });
        world.listen('nudge-command', (e) => {
            const kind = e.payload?.kind;
            if (S[kind]) nudge(kind);
        });
    },

    onConfig(cfg) {
        if (cfg.stretch_reminders !== undefined) setOn(S.stretch, cfg.stretch_reminders);
        if (cfg.posture_reminders !== undefined) setOn(S.posture, cfg.posture_reminders);
        if (cfg.stretch_interval_min !== undefined) setIntervalMin(S.stretch, cfg.stretch_interval_min, 15, 180, 60);
        if (cfg.posture_interval_min !== undefined) setIntervalMin(S.posture, cfg.posture_interval_min, 10, 120, 30);
    },
});
