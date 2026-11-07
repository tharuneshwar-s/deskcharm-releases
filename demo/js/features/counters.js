// Counters (Settings › Calm › Counters): things the user wants to count during the day ("Pushups",
// "Fruit 🍎"…). Each counter has a daily goal, a time window (from–to, may wrap past midnight;
// from === to = all day) and asks every `every_min` minutes inside it: a visitor (job 'counter',
// or the counter's own visitor) asks '<name>? <emoji>' (or the counter's own message, Pro, as
// typed) with YES / NO through `desk:visitor-job`. YES counts one (+ insights-event
// { kind: 'counter', id }, ring pulse and a '{name} {n}/{goal}' cue); NO / no answer snoozes
// SNOOZE_MIN; a refused visit (hidden, call, visitors off, another visit out) retries after RETRY_MIN.
// No asks once today's goal is reached.
//
// Timing is WALL CLOCK (not screen time like water/nudges): the window is clock times, so
// "every 60 min between 09:00 and 18:00" means what it says. Coming back from sleep or opening the
// window asks at once if an ask is due; one counter asks at a time.
//
// Today's counts: localStorage (per local day) merged with insights_day's counters on start.
// Rings: counters with ring:true get a small ring beside the hook (features/rings.js; up to 2).
// Visitors card "Try it" for the counter job: `desk:counter-try` → the first counter asks now.

import { registerFeature } from '../features.js';
import { DEV } from '../dev.js';
import { t } from '../i18n.js';
import { setRing, pulseRing, MAX_COUNTER_RINGS } from './rings.js';

const TICK_MS = 15 * 1000;
const MIN = 60 * 1000;
export const SNOOZE_MIN = 20;
export const RETRY_MIN = 2;
const KEY = 'deskcharm.counters';
const COLORS = ['#f5b971', '#c9a0ff'];

/** Minutes since midnight for "HH:MM" (null when malformed). */
export function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
}

/** Is minute-of-day `m` inside from–to? to < from wraps past midnight; equal (or bad) = all day. */
export function inWindow(m, from, to) {
    const a = parseHM(from), b = parseHM(to);
    if (a === null || b === null || a === b) return true;
    return a < b ? m >= a && m < b : m >= a || m < b;
}

/** A counter from config with every field in range. */
export function normalize(c) {
    const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || d));
    return {
        id: String(c?.id || ''),
        name: String(c?.name || '').slice(0, 24),
        emoji: String(c?.emoji || ''),
        goal: n(c?.goal, 1, 50, 8),
        every_min: n(c?.every_min, 15, 240, 60),
        from: parseHM(c?.from) === null ? '09:00' : c.from,
        to: parseHM(c?.to) === null ? '18:00' : c.to,
        visitor: String(c?.visitor || ''),
        message: String(c?.message || ''),
        ring: c?.ring !== false,
    };
}

/** Schedule state for one counter: the next time (ms) it may ask. Starts a full interval out. */
export function schedule(c, now) {
    return { next: now + c.every_min * MIN };
}

/** Due: inside the window, interval passed, goal not reached. */
export function isDue(s, c, now, count) {
    const d = new Date(now);
    return count < c.goal && now >= s.next && inWindow(d.getHours() * 60 + d.getMinutes(), c.from, c.to);
}

/** After trying to ask: sent → wait as if snoozed until the answer; refused → look again soon. */
export function attempted(s, now, sent) {
    s.next = now + (sent ? SNOOZE_MIN : RETRY_MIN) * MIN;
}

/** The answer: 'yes' → a full interval; 'no' / 'ignored' → SNOOZE_MIN. */
export function answered(s, c, now, action) {
    s.next = now + (action === 'yes' ? c.every_min : SNOOZE_MIN) * MIN;
}

// ---- Today's counts ------------------------------------------------------------------------

function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

let store = { day: today(), counts: {} };

function counts() {
    if (store.day !== today()) store = { day: today(), counts: {} };
    return store.counts;
}

function load() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v && v.day === today() && v.counts) store = { day: v.day, counts: { ...v.counts } };
    } catch { /* storage unavailable */ }
}

function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
}

/** Merge insights' counts for today (the larger wins: either may be ahead). */
export function mergeCounts(local, fromInsights) {
    const out = { ...local };
    for (const k in fromInsights || {}) out[k] = Math.max(out[k] || 0, Number(fromInsights[k]) || 0);
    return out;
}

export function countOf(id) {
    return counts()[id] || 0;
}

// ---- Feature -------------------------------------------------------------------------------

let list = [];                      // normalized counters
const S = new Map();                // id → schedule
let askingSince = 0;                // one counter question out at a time (Date.now() of the ask)
const ASK_STALE_MS = 5 * MIN;       // safety: a visit that never answered frees the slot
let ringCount = 0;

function ringed() {
    return list.filter((c) => c.ring).slice(0, MAX_COUNTER_RINGS);
}

function syncRings() {
    for (let i = 0; i < ringCount; i++) setRing('counter:' + i, null);
    const r = ringed();
    r.forEach((c, i) => {
        setRing('counter:' + i, {
            order: 1 + i, icon: c.emoji || '✓', color: COLORS[i % COLORS.length],
            get: () => ({ n: countOf(c.id), goal: c.goal }),
        });
    });
    ringCount = r.length;
}

/** The counter's ring, or a cue-only key (its cue shows where the first ring sits). */
function ringKey(id) {
    const i = ringed().findIndex((c) => c.id === id);
    return i < 0 ? 'cue:' + id : 'counter:' + i;
}

function counted(world, c) {
    counts()[c.id] = countOf(c.id) + 1;
    persist();
    world.emit?.('insights-event', { kind: 'counter', id: c.id });
    const cue = t('{name} {n}/{goal}', { name: c.name, n: countOf(c.id), goal: c.goal });
    pulseRing(ringKey(c.id), world, cue);
}

/** Ask counter `c` now; true when a visitor took the job. `over` (Settings Try it): { id, message }. */
function ask(world, c, over = {}) {
    if (askingSince && Date.now() - askingSince < ASK_STALE_MS) return false;
    let done = false;
    const detail = {
        job: 'counter',
        // Own question: Pro (free keeps the saved text for when Pro is back).
        data: { name: c.name, emoji: c.emoji, message: over.message || (globalThis.DeskPro?.isPro(world.license) !== false ? c.message : '') },
        onAnswer(action) {
            if (done) return;
            done = true;
            askingSince = 0;
            const s = S.get(c.id);
            if (s) answered(s, c, Date.now(), action);
            if (action === 'yes') counted(world, c);
        },
    };
    const who = over.id || c.visitor;
    if (who && who !== 'auto') detail.id = who;
    askingSince = Date.now();
    window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail }));
    if (!detail.sent && !done) askingSince = 0;
    return !!detail.sent;
}

function tick(world) {
    const now = Date.now();
    for (const c of list) {
        const s = S.get(c.id);
        if (!s || !isDue(s, c, now, countOf(c.id))) continue;
        attempted(s, now, ask(world, c));
    }
}

registerFeature({
    onInit(world) {
        if (/[?&]embed/.test(location.search) && !/[?&]visitors/.test(location.search)) return;
        load();
        const core = (window.DeskHostApi || window.__TAURI__)?.core;
        core?.invoke('insights_day', {}).then((day) => {
            store.counts = mergeCounts(counts(), day?.counters);
            persist();
            world.keepAwake?.(100);
        }, () => {});
        setInterval(() => tick(world), TICK_MS);
        window.addEventListener('desk:counter-try', (e) => {
            const c = list[0];
            if (!c) return;
            const s = S.get(c.id);
            const sent = ask(world, c, e.detail || {});
            if (s) attempted(s, Date.now(), sent);
        });
        if (DEV) window.DeskCounters = { now: (i = 0) => list[i] && ask(world, list[i]), counts: () => ({ ...counts() }) };
    },

    onConfig(cfg) {
        if (!Array.isArray(cfg.counters)) return;
        const now = Date.now();
        list = cfg.counters.map(normalize).filter((c) => c.id && c.name);
        for (const c of list) {
            const s = S.get(c.id);
            // New counter, or its interval changed: a full interval from now.
            if (!s || s.every !== c.every_min) S.set(c.id, { ...schedule(c, now), every: c.every_min });
        }
        for (const id of [...S.keys()]) if (!list.some((c) => c.id === id)) S.delete(id);
        syncRings();
    },
});
