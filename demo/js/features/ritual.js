// Daily ritual (Settings › Calm › Daily ritual), all optional:
//   - Morning greeting: first activity of the day (from 05:00) → soft chime + "Good morning ☀️".
//     When desk visitors are on, the visitor's own good-morning visit (features/visitors.js) is
//     the greeting and the charm stays quiet.
//   - Today's intention (config daily_intention { day: 'YYYY-MM-DD', text }): shown while the
//     cursor rests on the charm; ignored once its day is over (cleared at midnight).
//   - Evening wind-down at ritual_winddown_time: warm glow + cue; clicking the charm starts a
//     breathing session (wellness supports 1/3/5 min, so 1 min).
//   - Weekly reflection: Sunday evening, a short card from insights_range (7 days), plus water
//     and intentions counted here.
// Schedule state (what already happened today / this week) lives in localStorage.

import { registerFeature } from '../features.js';
import { OverlayUI, charmCenter } from '../overlay-ui.js';
import { BASE_CHARM_H } from '../charm.js';
import { tone } from '../audio.js';
import { glasses } from '../water.js';
import { t, tx } from '../i18n.js';
import { DEV } from '../dev.js';

const KEY = 'deskcharm.ritual';
const GREET_FROM_HOUR = 5;
const WINDDOWN_WINDOW_MIN = 180;   // a wind-down missed by more than 3 h is skipped for the day
const WEEKLY_FROM_HOUR = 18;
const WINDDOWN_BREATHE_MIN = 1;
const GREETING_MS = 6000;
const WINDDOWN_MS = 10 * 60 * 1000;
const WEEKLY_LINE_MS = 4500;
const TICK_MS = 30 * 1000;
const ACTIVITY_THROTTLE_MS = 30 * 1000;
const WARM = [255, 170, 90];

// ========== SCHEDULE (pure) ==========
const pad = (n) => String(n).padStart(2, '0');

/** Local day 'YYYY-MM-DD' (same format as daily_intention.day). */
export function dayKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The week's key: the day key of the Sunday that starts it. */
export function weekKey(d) {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    return dayKey(s);
}

/** "HH:MM" → minutes after midnight (fallback 21:30). */
export function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m || +m[1] > 23 || +m[2] > 59) return 21 * 60 + 30;
    return +m[1] * 60 + +m[2];
}

export function emptyState() {
    return { greeted: null, winddown: null, weekly: null, intentionDays: [], water: {} };
}

/** Which rituals are due now: subset of ['greeting', 'winddown', 'weekly'] (not yet marked). */
export function dueRituals(state, now, cfg) {
    const out = [];
    const today = dayKey(now);
    const mins = now.getHours() * 60 + now.getMinutes();
    if (cfg.ritual_greeting !== false && now.getHours() >= GREET_FROM_HOUR && state.greeted !== today) out.push('greeting');
    if (cfg.ritual_winddown === true && state.winddown !== today) {
        const at = parseHM(cfg.ritual_winddown_time);
        if (mins >= at && mins < at + WINDDOWN_WINDOW_MIN) out.push('winddown');
    }
    if (cfg.ritual_weekly !== false && now.getDay() === 0 && now.getHours() >= WEEKLY_FROM_HOUR &&
        state.weekly !== weekKey(now)) out.push('weekly');
    return out;
}

export function markDone(state, kind, now) {
    if (kind === 'greeting') state.greeted = dayKey(now);
    else if (kind === 'winddown') state.winddown = dayKey(now);
    else if (kind === 'weekly') state.weekly = weekKey(now);
}

/** Today's intention text, or null (missing, empty or from another day). */
export function todayIntention(cfg, now) {
    const it = cfg.daily_intention;
    if (!it || typeof it !== 'object' || it.day !== dayKey(now)) return null;
    const text = String(it.text || '').trim();
    return text || null;
}

/** Day keys of the last `n` days ending today. */
function lastDays(now, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    return out;
}

/** Note that an intention was set today, and today's water count; drops data older than 8 days. */
export function recordDay(state, now, { intention, water }) {
    const today = dayKey(now);
    const keep = new Set(lastDays(now, 8));
    if (intention && !state.intentionDays.includes(today)) state.intentionDays.push(today);
    state.intentionDays = state.intentionDays.filter((d) => keep.has(d));
    if (water != null) state.water[today] = Math.max(state.water[today] || 0, water);
    for (const d of Object.keys(state.water)) if (!keep.has(d)) delete state.water[d];
}

/** The weekly card's lines. `range`: insights_range result ({ days, streak }) or null. */
export function weeklyLines(state, now, range) {
    const week = new Set(lastDays(now, 7));
    const kept = state.intentionDays.filter((d) => week.has(d)).length;
    const water = Object.entries(state.water).filter(([d]) => week.has(d)).reduce((a, [, n]) => a + n, 0);
    const lines = [t('Your week 🌿')];
    if (range && Array.isArray(range.days)) {
        let focus = 0, breath = 0, breaks = 0;
        for (const d of range.days) {
            focus += d.focus_min || 0;
            breath += d.breathing_min || 0;
            breaks += d.breaks_taken || 0;
        }
        lines.push(t('{calm} calm min · {b} breathing', { calm: Math.round(focus + breath), b: Math.round(breath) }));
        lines.push(t('{n} breaks · {w} glasses 💧', { n: breaks, w: water }));
        lines.push(t('{s}-day streak · {k} intentions', { s: range.streak || 0, k: kept }));
    } else {
        lines.push(t('{w} glasses 💧 · {k} intentions', { w: water, k: kept }));
    }
    return lines;
}

// ========== FEATURE ==========
let world = null;
let ui = null;
let glow = null;
let glowOp = 0;
let state = emptyState();
/** Current message: { lines, sub, start, until, lineMs, warm, onClick }. */
let notice = null;
let lastActivity = 0;
/** A breathing session (wellness) owns the cue line until then; ritual messages wait. */
let quietUntil = 0;

function onWellness(p) {
    if (p?.action === 'breathe') quietUntil = Date.now() + (Number(p.minutes) || 1) * 60000 + 2000;
    else if (p?.action === 'stop-breathe') quietUntil = 0;
}

function load() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v && typeof v === 'object') state = Object.assign(emptyState(), v);
    } catch { /* storage unavailable */ }
}

function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function mainView() {
    return world.charms[0]?.view;
}

function show(n) {
    notice = Object.assign({ start: Date.now(), lineMs: 0, sub: null, warm: false, onClick: null }, n);
    world.keepAwake?.(Math.min(n.until - Date.now(), 15000));
}

function chimeSoft() {
    tone(659.25, 0.035, 1.8);
    tone(880, 0.022, 1.7, 0.18);
    tone(1318.51, 0.012, 2.0, 0.36);
}

function greet(now) {
    // The visitors' good-morning visit is the greeting when they are on.
    if (world.config.visitors) return;
    chimeSoft();
    const h = now.getHours();
    const text = h < 12 ? tx('Good morning ☀️') : h < 17 ? tx('Good afternoon 🌤️') : tx('Good evening 🌆');
    show({ lines: [t(text)], until: Date.now() + GREETING_MS });
}

function windDown() {
    chimeSoft();
    show({
        lines: [t('Time to wind down 🌙')],
        sub: t('Click for {n} min breathing', { n: WINDDOWN_BREATHE_MIN }),
        until: Date.now() + WINDDOWN_MS,
        warm: true,
        onClick: () => window.dispatchEvent(new CustomEvent('desk:wellness-command', {
            detail: { action: 'breathe', minutes: WINDDOWN_BREATHE_MIN },
        })),
    });
}

async function weekly(now) {
    let range = null;
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
        try { range = await invoke('insights_range', { days: 7 }); } catch { /* insights unavailable */ }
    }
    const lines = weeklyLines(state, now, range);
    show({ lines, lineMs: WEEKLY_LINE_MS, until: Date.now() + lines.length * WEEKLY_LINE_MS * 2, sub: t('Click to close') });
}

/** Check the schedule; `activity` = the user just did something (only then may we greet). */
function check(activity) {
    if (world.hidden || world.onboarding || Date.now() < quietUntil) return;
    const now = new Date();
    recordDay(state, now, { intention: !!todayIntention(world.config, now), water: glasses() });
    const due = dueRituals(state, now, world.config);
    // One at a time: never interrupt a showing message, nor a wellness cue / timer (they share the spot).
    const busy = (notice && Date.now() < notice.until) || ui.yielded();
    for (const kind of due) {
        if (kind === 'greeting' && !activity) continue;
        if (busy) break;
        markDone(state, kind, now);
        if (kind === 'greeting') greet(now);
        else if (kind === 'winddown') windDown();
        else weekly(now);
        break;
    }
    save();
}

function onActivity() {
    const t0 = performance.now();
    if (t0 - lastActivity < ACTIVITY_THROTTLE_MS) return;
    lastActivity = t0;
    check(true);
}

function createGlow(layer) {
    const svg = layer.ownerSVGElement;
    const NS = 'http://www.w3.org/2000/svg';
    if (svg && !svg.getElementById?.('ritualWarm')) {
        const defs = svg.querySelector('defs') || svg.appendChild(document.createElementNS(NS, 'defs'));
        const g = document.createElementNS(NS, 'radialGradient');
        g.setAttribute('id', 'ritualWarm');
        for (const [off, op] of [['0%', 0.55], ['55%', 0.22], ['100%', 0]]) {
            const s = document.createElementNS(NS, 'stop');
            s.setAttribute('offset', off);
            s.setAttribute('stop-color', `rgb(${WARM.join(',')})`);
            s.setAttribute('stop-opacity', op);
            g.appendChild(s);
        }
        defs.appendChild(g);
    }
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('fill', 'url(#ritualWarm)');
    c.setAttribute('pointer-events', 'none');
    c.style.display = 'none';
    layer.appendChild(c);
    return c;
}

registerFeature({
    onInit(w) {
        world = w;
        load();
        ui = new OverlayUI(w.layers.ui, 1);   // below onboarding tips (3) and wellness cues (2)
        glow = createGlow(w.layers.back);
        w.listen('cursor-pos', onActivity);
        w.listen('wellness-command', (e) => onWellness(e.payload));
        window.addEventListener('desk:wellness-command', (e) => onWellness(e.detail));
        window.addEventListener('pointermove', onActivity);
        w.interaction.on('click', (view) => {
            if (view !== mainView() || !notice || Date.now() >= notice.until) return;
            const act = notice.onClick;
            notice = null;
            act?.();
        });
        setInterval(() => check(false), TICK_MS);
        if (DEV) {
            window.DeskRitual = {
                greet: () => greet(new Date()),
                windDown,
                weekly: () => weekly(new Date()),
                state: () => state,
                reset: () => { state = emptyState(); save(); },
            };
        }
    },

    onConfig() {
        if (world.config.ritual_winddown !== true && notice?.warm) notice = null;
    },

    onRender(w, now, dt) {
        const view = mainView();
        if (!view) return;
        const wall = Date.now();
        if (notice && wall >= notice.until) notice = null;
        let cue = null;
        let sub = null;
        const quiet = w.onboarding || wall < quietUntil;
        if (notice && !quiet) {
            const i = notice.lineMs ? Math.floor((wall - notice.start) / notice.lineMs) % notice.lines.length : 0;
            cue = notice.lines[i];
            sub = notice.sub;
            if (notice.warm) w.keepAwake?.(1000);   // the warm glow pulses (and fades, below)
        } else if (!quiet && w.config.ritual_intention !== false && w.interaction.isBreathing(view, now)) {
            const text = todayIntention(w.config, new Date());
            if (text) cue = t('Today: {text}', { text });
        }

        // Warm glow behind the charm during the wind-down offer.
        const target = notice?.warm && !w.onboarding ? 1 : 0;
        glowOp += (target - glowOp) * Math.min(1, dt * 2);
        if (glowOp < 0.01 && target === 0) {
            glowOp = 0;
            glow.style.display = 'none';
        } else {
            const c = charmCenter(view);
            const pulse = 0.8 + 0.2 * Math.sin(wall / 1600);
            glow.style.display = '';
            glow.setAttribute('cx', c.x.toFixed(1));
            glow.setAttribute('cy', c.y.toFixed(1));
            glow.setAttribute('r', (BASE_CHARM_H * view.scale * 0.95).toFixed(1));
            glow.setAttribute('opacity', (glowOp * pulse).toFixed(3));
        }

        ui.follow(view, dt);
        ui.setCue(cue);
        ui.setTimer(sub, '#ffd6a8');
        if (ui.render(dt) || glowOp > 0) w.keepAwake?.(200);
    },
});
