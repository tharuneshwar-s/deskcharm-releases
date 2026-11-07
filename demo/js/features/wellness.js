// Wellness: guided breathing, break reminders, a 25/5 focus timer and 20-20-20 eye rest.
//
// Breathing and focus are started from the charm's right-click menu: Rust forwards the choice
// as `wellness-command` ({ action: 'breathe', minutes } | 'stop-breathe' | 'focus' |
// 'stop-focus'), and this module reports what is running back with `wellness-state`
// ({ breathing, focus }) so the menu can offer the matching "Stop" item.
// Reminders come from config: break_reminders / break_interval_min / eye_rest.
//
// All timers are wall-clock based (Date.now()) and checked from a coarse interval, so frame
// drops or a hidden overlay never stretch a session. Reminder intervals count only time the
// overlay is actually visible.

import { registerFeature } from '../features.js';
import { tone } from '../audio.js';
import { OverlayUI } from '../overlay-ui.js';
import { BASE_CHARM_W, BASE_CHARM_H } from '../charm.js';
import { t, tx } from '../i18n.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const FIXED_DT = 1 / 120;

// Breathing: same 4 s / 6 s rhythm as the charm's breathing glow (charm.js) so both line up.
const BREATH_IN_MS = 4000;
const BREATH_OUT_MS = 6000;
const BREATH_CYCLE_MS = BREATH_IN_MS + BREATH_OUT_MS;
const BREATH_RISE_PX = 20;
const BREATH_MINUTES = [1, 3, 5];
// Anchor offset low-pass (time constant 0.5 s): smooths start/stop without lagging the rhythm.
const ANCHOR_SMOOTH = 1 - Math.exp(-FIXED_DT / 0.5);
const ANCHOR_REST_EPS = 0.02;     // px; below this the anchor snaps exactly back to rest

const FOCUS_MS = 25 * 60 * 1000;
const FOCUS_BREAK_MS = 5 * 60 * 1000;
const PHASE_CUE_MS = 5000;        // "Time for a break" / "Back to focus" cue length
const TODAY_MS = 6000;            // quick menu "Today" card
const NUDGE_MS = 8000;            // app-switching nudge
const UPDATE_MS = 12000;          // "update ready" notice

const BREAK_REMINDER_MS = 10 * 1000;
const BREAK_SWING = 0.9;          // px/step end-point velocity: a ~30 px nudge, not a fling
const EYE_REST_EVERY_MS = 20 * 60 * 1000;
const EYE_REST_MS = 20 * 1000;

const TICK_MS = 500;
const VISIBILITY_POLL_MS = 5000;
const MAX_TICK_GAP_MS = 90 * 1000;  // longer gaps (sleep, frozen webview) don't count as screen time
const AWAY_RESET_MS = 5 * 60 * 1000; // away this long = already had a break; restart reminder clocks

const AURA_FOCUS = [255, 128, 72];
const AURA_BREAK = [86, 204, 140];
const AURA_STRETCH = [255, 206, 110];
const AURA_EYES = [110, 214, 222];
const RING_BREATH = '#cfeaff';
const RING_EYES = '#a8f0e6';
const TIMER_FOCUS = '#ffc2a0';
const TIMER_BREAK = '#b6f0cf';

let world = null;
let ui = null;
/** Aura per charm view ({ g, ellipse }), created on first use. */
const auras = new Map();

/** Running breathing session; `end` is pulled in on stop. Kept until the anchor is home. */
let breath = null;              // { start, end, ended }
let anchorOffset = 0;
let anchorOwned = false;

let focus = null;               // { start, phase, pendingMs } — pendingMs: focus time not yet logged
/** Focus task shown on the timer line (features/tasks.js); user text, never translated. */
let focusLabel = null;
let phaseCue = null;            // { text, until }
/** Short message near the charm: Today card / switching nudge. { text, sub, until, onClick } */
let notice = null;

let reminder = null;            // { kind: 'break' | 'eye', start, end }
let pendingSwing = false;

let breakOn = false;
let breakIntervalMs = 45 * 60 * 1000;
let eyeOn = false;
let breakAccum = 0;
let eyeAccum = 0;

let windowVisible = true;
let lastTick = Date.now();
let lastVisibilityPoll = 0;

const aur = { color: [...AURA_FOCUS], op: 0 };

// ========== SOUNDS (tone() is silent when muted) ==========
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880.0, C6 = 1046.5;

function chimeRise() {
    tone(C5, 0.05, 2.2);
    tone(G5, 0.035, 2.4, 0.2);
    tone(C6, 0.02, 2.6, 0.4);
}

function chimeFall() {
    tone(C6, 0.025, 2.0);
    tone(G5, 0.035, 2.2, 0.2);
    tone(C5, 0.05, 2.6, 0.4);
}

function chimeSoft() {
    tone(E5, 0.04, 1.8);
    tone(A5, 0.025, 1.6, 0.16);
}

// ========== HELPERS ==========
function mainCharm() {
    return world.charms[0];
}

/** 0 → 1 over the inhale, 1 → 0 over the exhale, cosine-eased (matches charm.js). */
function breathLevel(ms) {
    const p = ((ms % BREATH_CYCLE_MS) + BREATH_CYCLE_MS) % BREATH_CYCLE_MS;
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
    return p < BREATH_IN_MS ? ease(p / BREATH_IN_MS) : 1 - ease((p - BREATH_IN_MS) / BREATH_OUT_MS);
}

function breathing(now = Date.now()) {
    return !!breath && !breath.ended && now < breath.end;
}

function formatMMSS(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Focus phase index: even = focus, odd = break. */
function focusPhase(elapsed) {
    const cycle = FOCUS_MS + FOCUS_BREAK_MS;
    return 2 * Math.floor(elapsed / cycle) + (elapsed % cycle >= FOCUS_MS ? 1 : 0);
}

function emitState() {
    world.emit('wellness-state', { breathing: breathing(), focus: !!focus });
}

/** Calm-activity log for focus insights (src-tauri/src/insights). */
function logActivity(kind, minutes) {
    world.emit('insights-event', minutes === undefined ? { kind } : { kind, minutes });
}

/** Logs focus time accrued since the last whole minute was logged. */
function flushFocus(minMs) {
    if (focus && focus.pendingMs >= minMs) {
        logActivity('focus', focus.pendingMs / 60000);
        focus.pendingMs = 0;
    }
}

// ========== SESSIONS ==========
function startBreathing(minutes) {
    const m = BREATH_MINUTES.includes(minutes) ? minutes : 1;
    const now = Date.now();
    breath = { start: now, end: now + m * 60 * 1000, ended: false };
    // A guided session already counts as a pause from the screen (logged as a break taken).
    if (reminder) endReminder(false, true);
    chimeRise();
    emitState();
}

/** Ends the session; the anchor then eases home in onStep. */
function finishBreathing() {
    if (!breath || breath.ended) return;
    breath.ended = true;
    breath.end = Math.min(breath.end, Date.now());
    const minutes = (breath.end - breath.start) / 60000;
    if (minutes >= 0.1) logActivity('breathing', minutes);
    chimeFall();
    emitState();
    // Anchor already home (it is only released after the session ends): nothing left to ease.
    if (!anchorOwned) breath = null;
}

function startFocus() {
    focus = { start: Date.now(), phase: 0, pendingMs: 0 };
    phaseCue = { text: tx('Focus · 25 min'), until: Date.now() + PHASE_CUE_MS };
    chimeRise();
    emitState();
    focusEvent('start');
}

function stopFocus() {
    if (!focus) return;
    flushFocus(6000);
    focus = null;
    phaseCue = null;
    chimeFall();
    emitState();
    focusEvent('stop');
}

function startReminder(kind, id, message) {
    const now = Date.now();
    reminder = { kind, start: now, end: now + (kind === 'eye' ? EYE_REST_MS : BREAK_REMINDER_MS) };
    if (kind === 'break') pendingSwing = true;
    chimeSoft();
    // The break / eye-rest visitor (chai-wala, eye-rest bird, or whoever "Who visits for what"
    // picks; nobody for "Charm only") comes alongside the cue. `id` / `message`: Visitors "Try it".
    window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail: { job: kind === 'eye' ? 'eye_rest' : 'break', id, message } }));
}

/**
 * `completed`: the reminder ran its course (eye rest: the chime tells the user to look back).
 * `taken`: counts as done for insights even if ended early (turned into a breathing session).
 */
function endReminder(completed, taken = completed) {
    if (!reminder) return;
    if (completed && reminder.kind === 'eye') chimeRise();
    if (reminder.kind === 'eye') logActivity(taken ? 'eye-rest' : 'eye-rest-dismissed');
    else logActivity(taken ? 'break-taken' : 'break-dismissed');
    reminder = null;
}

/** Shows a notice unless something more important (breathing, a reminder) is on screen. */
function showNotice(text, sub, ms, onClick) {
    if (breathing() || reminder) return false;
    notice = { text, sub, until: Date.now() + ms, onClick };
    return true;
}

/** Focus session changes for features/tasks.js: 'start' | 'break' | 'focus' (break over) | 'stop'. */
function focusEvent(state) {
    window.dispatchEvent(new CustomEvent('desk:focus', { detail: { state } }));
}

export function focusRunning() {
    return !!focus;
}

/** True while the current focus session is in a focus (not break) phase. */
export function focusPhaseActive() {
    return !!focus && focus.phase % 2 === 0;
}

/** Text appended to the focus timer ("24:12 · Write report"); null clears it. */
export function setFocusLabel(text) {
    focusLabel = text ? String(text) : null;
}

/** A notice by the charm for other features; clicking the charm runs `onClick`. */
export function focusNotice(text, sub, ms, onClick) {
    return showNotice(text, sub, ms, onClick);
}

function shortLabel(text) {
    return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}

/** `one` / `many` are templates with {n}: t('{n} break') / t('{n} breaks'). */
function plural(n, one, many) {
    return t(n === 1 ? one : many, { n });
}

/** Quick menu "Today": today's calm numbers + streak. */
function onToday(e) {
    const { today, streak } = e.payload || {};
    if (!today) return;
    const parts = [];
    if (today.focus_min >= 1) parts.push(t('{n} min focus', { n: Math.round(today.focus_min) }));
    if (today.breathing_min >= 0.5) parts.push(t('{n} min breathing', { n: Math.round(today.breathing_min) }));
    if (today.breaks_taken) parts.push(plural(today.breaks_taken, '{n} break', '{n} breaks'));
    if (today.eye_rests) parts.push(plural(today.eye_rests, '{n} eye rest', '{n} eye rests'));
    if (today.stress_releases) parts.push(plural(today.stress_releases, '{n} release', '{n} releases'));
    const text = parts.length ? t('Today · {parts}', { parts: parts.slice(0, 3).join(' · ') }) : tx('Today · nothing yet — breathe a little?');
    const sub = streak > 0 ? t('{n}-day calm streak', { n: streak }) : null;
    // The Today card was explicitly asked for, so it may replace a reminder cue briefly.
    notice = { text, sub, until: Date.now() + TODAY_MS, onClick: null };
}

/** App switching nudge (insights tracker): clicking the charm starts a 1-minute breath. */
function onNudge() {
    showNotice(tx('Lots of switching — breathe for a minute?'), tx('Click the charm to start'), NUDGE_MS, () => startBreathing(1));
}

/** Auto-update found a new version (src-tauri/src/updates.rs): clicking opens Settings. */
function onUpdate(e) {
    const v = e.payload && e.payload.available;
    if (!v) return;
    showNotice(t('DeskCharm {v} is ready', { v }), tx('Click the charm to update'), UPDATE_MS, () => world.emit('open-settings'));
}

function onCommand(e) {
    const p = e.payload || {};
    switch (p.action) {
        case 'breathe': startBreathing(Number(p.minutes)); break;
        case 'stop-breathe': finishBreathing(); break;
        case 'focus': startFocus(); break;
        case 'stop-focus': stopFocus(); break;
        // From a desk visitor (chai-wala): the break reminder counts as taken.
        case 'take-break': if (reminder && reminder.kind === 'break') endReminder(true); break;
        // Visitors "Try it" (features/visitors.js): this reminder now, with that visitor / line.
        case 'remind': if (!reminder && (p.kind === 'eye' || p.kind === 'break')) startReminder(p.kind, p.id, p.message); break;
    }
}

// ========== TIMEKEEPING ==========
function overlayVisible() {
    return windowVisible && !document.hidden;
}

function pollVisibility(now) {
    if (now - lastVisibilityPoll < VISIBILITY_POLL_MS) return;
    lastVisibilityPoll = now;
    world.appWindow.isVisible().then((v) => { windowVisible = v; }, () => {});
}

function tick() {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    pollVisibility(now);

    if (gap >= AWAY_RESET_MS) {
        breakAccum = 0;
        eyeAccum = 0;
    } else if (gap > 0 && gap <= MAX_TICK_GAP_MS && overlayVisible()) {
        if (breakOn) breakAccum += gap;
        if (eyeOn) eyeAccum += gap;
    }

    // Focus time (focus phases only) is logged a minute at a time.
    if (focus && focus.phase % 2 === 0 && gap > 0 && gap <= MAX_TICK_GAP_MS) {
        focus.pendingMs += gap;
        flushFocus(60000);
    }

    if (breath && !breath.ended && now >= breath.end) finishBreathing();

    if (focus) {
        const phase = focusPhase(now - focus.start);
        if (phase !== focus.phase) {
            focus.phase = phase;
            const onBreak = phase % 2 === 1;
            phaseCue = { text: onBreak ? tx('Time for a break') : tx('Back to focus'), until: now + PHASE_CUE_MS };
            if (onBreak) chimeFall();
            else chimeRise();
            focusEvent(onBreak ? 'break' : 'focus');
        }
    }

    if (reminder && now >= reminder.end) endReminder(true);
    // Reminders wait while a breathing session runs, and never stack.
    if (!reminder && !breathing(now)) {
        if (eyeOn && eyeAccum >= EYE_REST_EVERY_MS) {
            eyeAccum = 0;
            startReminder('eye');
        } else if (breakOn && breakAccum >= breakIntervalMs) {
            breakAccum = 0;
            startReminder('break');
        }
    }
}

// ========== PHYSICS ==========
/** Moves the main anchor with the breath; snaps exactly back to rest once the session is over. */
function stepBreathAnchor() {
    const now = Date.now();
    const active = breathing(now);
    if (!active && !anchorOwned) return;
    anchorOwned = true;

    const target = active ? -BREATH_RISE_PX * breathLevel(now - breath.start) : 0;
    anchorOffset += (target - anchorOffset) * ANCHOR_SMOOTH;

    const main = mainCharm();
    const restX = world.anchorX(main.anchorDX);
    const restY = world.anchorY;
    if (!active && Math.abs(anchorOffset) < ANCHOR_REST_EPS) {
        anchorOffset = 0;
        anchorOwned = false;
        if (breath && breath.ended) breath = null;
        main.rope.moveAnchor(restX, restY);
        return;
    }
    main.rope.moveAnchor(restX, restY + anchorOffset);
}

/** Break reminder nudge: a small sideways swing toward the screen middle, bottom-weighted. */
function applySwing() {
    const rope = mainCharm().rope;
    if (rope.held) return;
    pendingSwing = false;
    const dir = rope.anchorX > window.innerWidth / 2 ? -1 : 1;
    const { ox, n } = rope;
    for (let i = 1; i < n; i++) {
        const w = i / (n - 1);
        ox[i] -= dir * BREAK_SWING * w * w;
    }
}

// ========== RENDER ==========
function createAura(layer) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('pointer-events', 'none');
    g.style.display = 'none';
    const ellipse = document.createElementNS(SVGNS, 'ellipse');
    ellipse.setAttribute('filter', 'url(#glowBlur)');
    ellipse.setAttribute('opacity', 0);
    g.appendChild(ellipse);
    layer.appendChild(g);
    return { g, ellipse };
}

/**
 * Colored aura behind every charm: focus/break tint, or a brighter pulse during a reminder.
 * Separate from the charms' own glow so it never fights hover breathing or day/night tinting.
 */
function renderAura(now, dt) {
    const wall = Date.now();
    let color = null;
    let level = 0;
    if (reminder) {
        const pulse = 0.5 - 0.5 * Math.cos(((wall - reminder.start) / 2500) * 2 * Math.PI);
        color = reminder.kind === 'eye' ? AURA_EYES : AURA_STRETCH;
        level = 0.2 + 0.25 * pulse;
    } else if (focus) {
        // Steady glow (no pulse) so a 25-min session doesn't hold the overlay at full frame rate;
        // the timer text updates on the loop's slow check frames.
        color = focus.phase % 2 === 1 ? AURA_BREAK : AURA_FOCUS;
        level = 0.19;
    }

    const k = 1 - Math.exp(-2.5 * dt);
    aur.op += (level - aur.op) * k;
    if (color) for (let i = 0; i < 3; i++) aur.color[i] += (color[i] - aur.color[i]) * k;
    if (aur.op < 0.004 && !color) {
        aur.op = 0;
        for (const a of auras.values()) a.g.style.display = 'none';
        return false;
    }

    for (const [view, a] of auras) {
        if (!world.charms.some((c) => c.view === view)) {
            a.g.remove();
            auras.delete(view);
        }
    }
    const fill = `rgb(${aur.color.map(Math.round).join(',')})`;
    for (const { view } of world.charms) {
        let a = auras.get(view);
        if (!a) auras.set(view, a = createAura(world.layers.back));
        const { rx, ry } = view;
        const end = view.rope.end;
        a.g.style.display = '';
        a.g.setAttribute('transform', `translate(${rx[end].toFixed(1)},${ry[end].toFixed(1)}) rotate(${view.angle.toFixed(2)})`);
        const e = a.ellipse;
        e.setAttribute('cy', view.centerY().toFixed(1));
        e.setAttribute('rx', (BASE_CHARM_W * view.scale * 0.46).toFixed(1));
        e.setAttribute('ry', (BASE_CHARM_H * view.scale * 0.46).toFixed(1));
        e.setAttribute('fill', fill);
        e.setAttribute('opacity', aur.op.toFixed(3));
    }
    // Still easing toward the target (opacity or colour) or pulsing for a reminder.
    return !!reminder || Math.abs(level - aur.op) > 0.004 || (color && color.some((c, i) => Math.abs(c - aur.color[i]) > 1));
}

function renderUI(now, dt) {
    const wall = Date.now();
    const view = mainCharm().view;

    // Breathing glow on every charm, following the session clock so the pulse lines up with the
    // anchor motion. The cue, ring and timer stay with the main charm.
    const active = breathing(wall);
    for (const c of world.charms) {
        c.view.forceGlow = active;
        if (active) c.view.breathStart = now - (wall - breath.start);
    }

    let cue = null;
    let ring = null;
    let ringColor = RING_BREATH;
    if (active) {
        const elapsed = wall - breath.start;
        cue = elapsed % BREATH_CYCLE_MS < BREATH_IN_MS ? tx('Breathe in…') : tx('Breathe out…');
        ring = elapsed / (breath.end - breath.start);
    } else if (reminder) {
        if (reminder.kind === 'eye') {
            cue = tx('Look 20 ft away');
            ring = 1 - (wall - reminder.start) / EYE_REST_MS;
            ringColor = RING_EYES;
        } else {
            cue = tx('Time to stretch');
        }
    } else if (notice && wall < notice.until) {
        cue = notice.text;
    } else if (phaseCue && wall < phaseCue.until) {
        cue = phaseCue.text;
    }
    if (notice && wall >= notice.until) notice = null;

    if (focus) {
        const elapsed = wall - focus.start;
        const cycle = FOCUS_MS + FOCUS_BREAK_MS;
        const inCycle = elapsed % cycle;
        if (focus.phase % 2 === 1) ui.setTimer(t('Break {time}', { time: formatMMSS(cycle - inCycle) }), TIMER_BREAK);
        else ui.setTimer(focusLabel ? `${formatMMSS(FOCUS_MS - inCycle)} · ${shortLabel(focusLabel)}` : formatMMSS(FOCUS_MS - inCycle), TIMER_FOCUS);
    } else if (notice && notice.sub) {
        ui.setTimer(notice.sub, TIMER_FOCUS);
    } else {
        ui.setTimer(null);
    }

    ui.follow(view, dt);
    ui.setCue(cue);
    ui.setRing(ring, ringColor);
    return ui.render(dt);
}

// ========== FEATURE ==========
registerFeature({
    onInit(w) {
        world = w;
        ui = new OverlayUI(w.layers.ui, 2);   // below onboarding tips (3), above ritual messages (1)
        w.listen('wellness-command', onCommand);
        // Same commands from inside the overlay (desk visitors), without a round trip through Rust.
        window.addEventListener('desk:wellness-command', (e) => onCommand({ payload: e.detail }));
        w.listen('insights-today', onToday);
        w.listen('insights-nudge', onNudge);
        w.listen('update-available', onUpdate);
        // Clicking the charm dismisses an active reminder early, or acts on a notice.
        w.interaction.on('click', (view) => {
            if (view !== mainCharm().view) return;
            if (reminder) {
                endReminder(false);
            } else if (notice) {
                const act = notice.onClick;
                notice = null;
                if (act) act();
            }
        });
        setInterval(tick, TICK_MS);
        // Sync Rust's menu state (e.g. after an overlay reload, nothing is running).
        emitState();
    },

    onConfig(cfg) {
        if (cfg.break_reminders !== undefined) {
            const on = !!cfg.break_reminders;
            if (on && !breakOn) breakAccum = 0;
            if (!on && reminder && reminder.kind === 'break') endReminder(false);
            breakOn = on;
        }
        if (cfg.break_interval_min !== undefined) {
            const min = Math.min(120, Math.max(15, Number(cfg.break_interval_min) || 45));
            breakIntervalMs = min * 60 * 1000;
        }
        if (cfg.eye_rest !== undefined) {
            const on = !!cfg.eye_rest;
            if (on && !eyeOn) eyeAccum = 0;
            if (!on && reminder && reminder.kind === 'eye') endReminder(false);
            eyeOn = on;
        }
    },

    onStep() {
        stepBreathAnchor();
        if (pendingSwing) applySwing();
    },

    onRender(w, now, dt) {
        const auraMoving = renderAura(now, dt);
        const uiFading = renderUI(now, dt);
        // Reminder pulse, aura easing, cue fades and the breathing anchor animate; a steady focus
        // session does not (its timer ticks on the slow check frames).
        if (auraMoving || uiFading || reminder || anchorOwned || pendingSwing || breathing()) {
            w.keepAwake?.();
        }
    },
});
