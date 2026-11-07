// Mood check-in (Settings › Calm › Mood check-in; quick menu "How do you feel? ▸").
// Scale: 1 😞 · 2 🙁 · 3 😐 · 4 🙂 · 5 😄. Rust (src-tauri/src/mood.rs) stores every check-in in
// insights (per day: sum, count, last).
//   - Daily ask (mood_checkin, mood_time "HH:MM"): once a day at/after mood_time, on the first
//     activity, unless hidden, focusing, breathing, on a call, in quiet hours or a busy calendar
//     block. The charm asks "How are you feeling?" with the five faces as click targets below it;
//     ignored for 60 s = dismissed for today. A pick → `mood-log { score }` to Rust.
//   - Quick menu: Rust stores it and sends `mood-command { action: 'logged', score }`.
//   - Reaction: 1–2 → soft eyes, "Sorry it's a rough one. Breathe with me?" (clicking the charm
//     starts 1 min of breathing) and, with visitors on, a cheer-up visitor (job 'mood_cheer',
//     features/visitors.js) at most once a day.
//     4–5 → a brief happy eye and a sparkle.
// Schedule state lives in localStorage.

import { registerFeature } from '../features.js';
import { OverlayUI } from '../overlay-ui.js';
import { BASE_CHARM_H } from '../charm.js';
import { focusRunning } from './wellness.js';
import { t } from '../i18n.js';
import { DEV } from '../dev.js';

const KEY = 'deskcharm.mood';
export const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
const ASK_MS = 60 * 1000;
const SOFT_MS = 25 * 1000;
const THANKS_MS = 3500;
const SPARKLE_MS = 1400;
const TICK_MS = 30 * 1000;
const ACTIVITY_THROTTLE_MS = 20 * 1000;
const FACE_GAP = 34;              // px between face centres
const FACE_HIT_R = 15;

// ========== SCHEDULE (pure; tested in test/mood.test.mjs) ==========
const pad = (n) => String(n).padStart(2, '0');

export function dayKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:MM" → minutes after midnight (null if invalid). */
export function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
}

export function emptyState() {
    return { asked: null, cheered: null };
}

/** Inside the quiet-hours window `from`–`to` ("HH:MM", may wrap past midnight). */
export function inWindow(now, from, to) {
    const a = parseHM(from), b = parseHM(to);
    if (a === null || b === null || a === b) return false;
    const m = now.getHours() * 60 + now.getMinutes();
    return a < b ? m >= a && m < b : m >= a || m < b;
}

/** The daily question is due: switched on, not asked (nor logged) today, and mood_time has passed. */
export function askDue(state, now, cfg) {
    if (cfg.mood_checkin === false || state.asked === dayKey(now)) return false;
    const at = parseHM(cfg.mood_time) ?? 15 * 60;
    return now.getHours() * 60 + now.getMinutes() >= at;
}

/**
 * Nothing stops the question right now. `env`: { hidden, focus, breathing, call, busy }.
 * Quiet hours are the visitors' (visitor_quiet, visitor_quiet_from / _to).
 */
export function askAllowed(env, now, cfg) {
    if (env.hidden || env.focus || env.breathing || env.call || env.busy) return false;
    return !(cfg.visitor_quiet && inWindow(now, cfg.visitor_quiet_from, cfg.visitor_quiet_to));
}

/** What a score triggers: 'low' (1–2), 'ok' (3), 'happy' (4–5); null if out of range. */
export function reactionOf(score) {
    if (!(score >= 1 && score <= 5) || !Number.isInteger(score)) return null;
    return score <= 2 ? 'low' : score === 3 ? 'ok' : 'happy';
}

// ========== FEATURE ==========
let world = null;
let ui = null;
let state = emptyState();
/** Showing the question: { until }. */
let ask = null;
/** Current cue: { text, until, onClick }. */
let notice = null;
let sparkleAt = 0;
let breathingUntil = 0;
let onCall = false;
let busy = { active: false, until: null };
let lastActivity = 0;
let facesG = null;
let faceNodes = [];
let facesOp = 0;
let sparkleG = null;

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

function env() {
    const now = Date.now();
    return {
        hidden: world.hidden || world.onboarding,
        focus: focusRunning(),
        breathing: now < breathingUntil,
        call: onCall,
        busy: !!(world.config.calendar_quiet && busy.active && (busy.until == null || now < busy.until)),
    };
}

function check(activity) {
    if (!activity || ask) return;
    const now = new Date();
    if (!askDue(state, now, world.config) || !askAllowed(env(), now, world.config) || ui.yielded()) return;
    startAsk();
}

function startAsk() {
    state.asked = dayKey(new Date());
    save();
    notice = null;
    ask = { until: Date.now() + ASK_MS };
    facePos = null;
    world.keepAwake?.(1500);
}

function onActivity() {
    const t0 = performance.now();
    if (t0 - lastActivity < ACTIVITY_THROTTLE_MS) return;
    lastActivity = t0;
    check(true);
}

function onWellness(p) {
    if (p?.action === 'breathe') breathingUntil = Date.now() + (Number(p.minutes) || 1) * 60000 + 2000;
    else if (p?.action === 'stop-breathe') breathingUntil = 0;
}

/** A mood was logged (`fromAsk`: picked from the faces, so tell Rust to store it). */
function logged(score, fromAsk) {
    const kind = reactionOf(score);
    if (!kind) return;
    if (fromAsk) world.emit('mood-log', { score });
    // Logged today one way or the other: no need to ask any more.
    const today = dayKey(new Date());
    state.asked = today;
    ask = null;
    const living = (mood, ms) => window.dispatchEvent(new CustomEvent('desk:living-mood', { detail: { mood, ms } }));
    if (kind === 'low') {
        living('soft', SOFT_MS);
        notice = {
            text: t('Sorry it’s a rough one. Breathe with me?'),
            until: Date.now() + SOFT_MS,
            onClick: () => window.dispatchEvent(new CustomEvent('desk:wellness-command', {
                detail: { action: 'breathe', minutes: 1 },
            })),
        };
        if (world.config.visitors !== false && state.cheered !== today) {
            const detail = { job: 'mood_cheer' };
            window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail }));
            if (detail.sent) state.cheered = today;
        }
    } else {
        notice = { text: t('Thanks for checking in 💛'), until: Date.now() + THANKS_MS, onClick: null };
        if (kind === 'happy') {
            living('happy', 2500);
            sparkleAt = Date.now();
        }
    }
    save();
    world.keepAwake?.(2000);
}

/** Centres of the five faces (one row under the question). While the cursor is near the row it
 *  stays put, so a swinging charm never moves a face out from under the pointer. */
let facePos = null;
function facePositions() {
    const m = world.interaction.mouse;
    if (facePos && Math.abs(m.y - facePos[0].y) < 40 &&
        m.x > facePos[0].x - 40 && m.x < facePos[facePos.length - 1].x + 40) return facePos;
    const y = ui.cy + ui.radius + 50;
    const half = (FACES.length - 1) / 2;
    const minX = FACE_GAP * half + 16;
    const maxX = (globalThis.innerWidth || 0) - FACE_GAP * half - 16;
    const cx = maxX > minX ? Math.min(maxX, Math.max(minX, ui.cx)) : ui.cx;
    facePos = FACES.map((_, i) => ({ x: cx + (i - half) * FACE_GAP, y }));
    return facePos;
}

function faceAt(x, y) {
    if (!ask || facesOp < 0.5) return -1;
    return facePositions().findIndex((p) => Math.hypot(x - p.x, y - p.y) <= FACE_HIT_R);
}

function createFaces(layer) {
    const NS = 'http://www.w3.org/2000/svg';
    facesG = document.createElementNS(NS, 'g');
    facesG.setAttribute('pointer-events', 'none');
    facesG.style.display = 'none';
    faceNodes = FACES.map((f) => {
        const n = document.createElementNS(NS, 'text');
        n.setAttribute('font-size', '24');
        n.setAttribute('text-anchor', 'middle');
        n.setAttribute('dominant-baseline', 'central');
        n.setAttribute('filter', 'url(#uiHalo)');
        n.textContent = f;
        facesG.appendChild(n);
        return n;
    });
    layer.appendChild(facesG);

    sparkleG = document.createElementNS(NS, 'g');
    sparkleG.setAttribute('pointer-events', 'none');
    sparkleG.style.display = 'none';
    for (let i = 0; i < 6; i++) {
        const s = document.createElementNS(NS, 'text');
        s.setAttribute('text-anchor', 'middle');
        s.setAttribute('dominant-baseline', 'central');
        s.setAttribute('fill', i % 2 ? '#fff6c8' : '#ffffff');
        s.textContent = '✦';
        sparkleG.appendChild(s);
    }
    layer.appendChild(sparkleG);
}

function renderFaces(dt) {
    const want = !!ask && !ui.yielded();
    facesOp = want ? Math.min(1, facesOp + dt / 0.6) : Math.max(0, facesOp - dt / 0.4);
    facesG.style.display = facesOp > 0 ? '' : 'none';
    if (facesOp <= 0) return false;
    const hover = world.interaction.mouse ? faceAt(world.interaction.mouse.x, world.interaction.mouse.y) : -1;
    facePositions().forEach((p, i) => {
        const n = faceNodes[i];
        const s = i === hover ? 1.25 : 1;
        n.setAttribute('x', p.x.toFixed(1));
        n.setAttribute('y', p.y.toFixed(1));
        n.setAttribute('font-size', (24 * s).toFixed(1));
    });
    facesG.setAttribute('opacity', facesOp.toFixed(3));
    return facesOp < 1 && want || facesOp > 0 && !want;
}

function renderSparkle(view) {
    const age = Date.now() - sparkleAt;
    if (!sparkleAt || age >= SPARKLE_MS || world.reducedMotion) {
        sparkleG.style.display = 'none';
        return false;
    }
    const p = age / SPARKLE_MS;
    const r0 = BASE_CHARM_H * view.scale * 0.45;
    sparkleG.style.display = '';
    [...sparkleG.childNodes].forEach((s, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const r = r0 + 26 * p;
        s.setAttribute('x', (ui.cx + Math.cos(a) * r).toFixed(1));
        s.setAttribute('y', (ui.cy + Math.sin(a) * r).toFixed(1));
        s.setAttribute('font-size', (10 + 6 * Math.sin(Math.PI * p) + (i % 2) * 3).toFixed(1));
        s.setAttribute('opacity', Math.sin(Math.PI * p).toFixed(3));
    });
    return true;
}

registerFeature({
    onInit(w) {
        world = w;
        load();
        ui = new OverlayUI(w.layers.ui, 1.5);   // above ritual (1), below wellness (2) and onboarding (3)
        createFaces(w.layers.ui);
        w.interaction.addHotspot({
            hit: (x, y) => faceAt(x, y) >= 0,
            press: () => {
                const m = w.interaction.mouse;
                const i = m ? faceAt(m.x, m.y) : -1;
                if (i >= 0) logged(i + 1, true);
            },
        });
        w.interaction.on('click', (view) => {
            if (view !== mainView() || !notice?.onClick || Date.now() >= notice.until) return;
            const act = notice.onClick;
            notice = null;
            act();
        });
        w.listen('mood-command', (e) => {
            if (e.payload?.action === 'logged') logged(Number(e.payload.score), false);
        });
        w.listen('wellness-command', (e) => onWellness(e.payload));
        window.addEventListener('desk:wellness-command', (e) => onWellness(e.detail));
        w.listen('env-call', (e) => { onCall = !!e.payload?.active; });
        w.listen('env-busy', (e) => { busy = { active: !!e.payload?.active, until: e.payload?.until ?? null }; });
        w.listen('cursor-pos', onActivity);
        window.addEventListener('pointermove', onActivity);
        setInterval(() => { if (ask && Date.now() >= ask.until) ask = null; }, TICK_MS);
        if (DEV) {
            window.DeskMood = {
                ask: startAsk,
                log: (score) => logged(score, true),
                state: () => state,
                reset: () => { state = emptyState(); save(); },
            };
        }
    },

    onConfig() {
        if (world.config.mood_checkin === false) ask = null;
    },

    onRender(w, now, dt) {
        const view = mainView();
        if (!view) return;
        const wall = Date.now();
        if (ask && (wall >= ask.until || w.hidden)) ask = null;
        if (notice && wall >= notice.until) notice = null;
        ui.follow(view, dt);
        ui.setCue(ask ? t('How are you feeling?') : notice ? notice.text : null, true);
        const fading = ui.render(dt);
        const faces = renderFaces(dt);
        const sparkle = renderSparkle(view);
        if (fading || faces || sparkle || ask) w.keepAwake?.(200);
    },
});
