// Pointer state machine for charms: hover → press → drag | squeeze, bead slide, mouse capture.
// The overlay is click-through except while the cursor is over a charm or a bead (or a press
// is active).
//
//   idle ──hover charm──▶ pressed ──move>4px──▶ dragging ──release──▶ fling (chime)
//                           └──held 250 ms──▶ squeezing ──release──▶ pop back
//   idle ──hover bead───▶ (press) sliding: the bead follows the cursor along the rope
//
// Cursor input has two sources: the host's polled `cursor-pos` (the only one while the window is
// click-through) and the webview's own pointer events (only while it captures the mouse). Pointer
// events are fresher, so while they flow the polled position is ignored; mixing the two made the
// cursor jump back and forth by the poll's delivery delay.

import { playBell, releaseChime } from './audio.js';

const DRAG_THRESHOLD = 4;         // px of movement before a press becomes a drag
const HOLD_MS = 250;              // press without moving this long = squeeze
const DRAG_STIFFNESS = 0.04;      // rope stretch stiffness while dragging (1 = rigid)
const RELEASE_RAMP_S = 0.3;       // rope firms back up over this long after release
const BREATH_DELAY_MS = 600;      // cursor resting this long starts the breathing glow
const HOVER_MARGIN = 8;           // px around the charm body that already counts as on it
const VELOCITY_TAU_MS = 16;       // smoothing of the cursor velocity used for the passive push
const VELOCITY_GAP_MS = 100;      // longer between samples = the cursor rested (velocity restarts)
const FLING_WINDOW_MS = 60;       // release velocity: cursor motion over this much recent history
const FLING_STALE_MS = 40;        // cursor resting this long before release = no fling
const POINTER_FRESH_MS = 50;      // pointer events this recent win over the polled cursor-pos
const HISTORY = 32;
const FIXED_DT = 1 / 120;
const STEP_MS = FIXED_DT * 1000;
// Raw updates arrive as the input arrives instead of once per frame (secure contexts only).
const MOVE_EVENT = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove';

export function createInteraction({ appWindow, emit, svgEl }) {
    /** Cursor in overlay px; vx/vy smoothed velocity in px per physics step; t last sample time. */
    const mouse = { x: -1e6, y: -1e6, vx: 0, vy: 0, t: -Infinity, active: false };
    let mouseTimer = null;
    // Ring buffer of recent cursor samples (performance.now() ms), for the release velocity.
    const histT = new Float64Array(HISTORY);
    const histX = new Float64Array(HISTORY);
    const histY = new Float64Array(HISTORY);
    let histCount = 0;
    let lastPointerAt = -Infinity;

    let enabled = true;
    let state = 'idle';               // idle | pressed | squeezing | dragging | sliding
    let suspended = false;            // smart hiding: no hover, capture or presses while faded out
    let views = [];
    let target = null;                // CharmView under the cursor / being held
    let targetBead = -1;              // bead of `target` under the cursor / being slid, or -1
    let hoverSince = 0;
    let capturing = false;
    let pressX = 0, pressY = 0;
    let holdTimer = null;
    /** Grab point in the held charm's own (rotated) frame, relative to its attachment point. */
    let grabLX = 0, grabLY = 0;
    const held = { x: 0, y: 0 };
    let releaseRamp = 1;              // 0 → 1 after a release; rope stiffness eases back to rigid
    let releasedRope = null;
    /** During a drag/fling only the release chime plays; motion chimes resume once settled. */
    let suppressMotionChime = false;
    const listeners = { click: [], release: [], aux: [] };
    /** Extra clickable regions outside the charms: { hit(x, y) → bool, press() }. */
    const hotspots = [];

    function hotspotAt(x, y) {
        for (const h of hotspots) if (h.hit(x, y)) return h;
        return null;
    }

    /** Record a cursor sample taken at time t (ms, performance.now() clock). */
    function trackMouse(nx, ny, t = performance.now()) {
        const dt = t - mouse.t;
        if (dt > VELOCITY_GAP_MS) {
            mouse.vx = mouse.vy = 0;
        } else if (dt > 0) {
            const k = 1 - Math.exp(-dt / VELOCITY_TAU_MS);
            const toStep = STEP_MS / dt;
            mouse.vx += ((nx - mouse.x) * toStep - mouse.vx) * k;
            mouse.vy += ((ny - mouse.y) * toStep - mouse.vy) * k;
        }
        if (nx !== mouse.x || ny !== mouse.y) {
            const h = histCount++ % HISTORY;
            histT[h] = t;
            histX[h] = nx;
            histY[h] = ny;
        }
        if (dt > 0) mouse.t = t;
        mouse.x = nx;
        mouse.y = ny;
        mouse.active = true;
        clearTimeout(mouseTimer);
        mouseTimer = setTimeout(() => { mouse.active = false; mouse.vx = mouse.vy = 0; }, 150);
    }

    /** Forget motion history: the next sample starts from rest (touch lands, pointer teleports). */
    function restartMotion() {
        mouse.t = -Infinity;
        mouse.vx = mouse.vy = 0;
        histCount = 0;
    }

    /** Cursor velocity over the last moments before time `now`, px per step; 0 if it was resting. */
    function releaseVelocity(now) {
        const n = Math.min(histCount, HISTORY);
        const last = (histCount - 1) % HISTORY;
        if (n < 2 || now - histT[last] > FLING_STALE_MS) return { vx: 0, vy: 0 };
        let first = last;
        for (let j = 1; j < n; j++) {
            const k = (histCount - 1 - j) % HISTORY;
            if (histT[last] - histT[k] > FLING_WINDOW_MS) break;
            first = k;
        }
        const span = histT[last] - histT[first];
        if (span < 4) return { vx: 0, vy: 0 };
        const toStep = STEP_MS / span;
        return { vx: (histX[last] - histX[first]) * toStep, vy: (histY[last] - histY[first]) * toStep };
    }

    function setCapture(on) {
        if (on === capturing) return;
        capturing = on;
        appWindow.setIgnoreCursorEvents(!on);
    }

    /** What is under the cursor: beads first (small, drawn over the rope), then charm bodies. */
    function hitTest(mx, my) {
        // Last drawn is on top
        for (let i = views.length - 1; i >= 0; i--) {
            const bead = views[i].hitBead(mx, my);
            if (bead >= 0) return { view: views[i], bead };
        }
        for (let i = views.length - 1; i >= 0; i--) {
            if (views[i].hit(mx, my, HOVER_MARGIN)) return { view: views[i], bead: -1 };
        }
        return null;
    }

    /** Hover + capture from the current cursor (also run per polled sample, not only per frame). */
    function hover(now) {
        if (!enabled || suspended) {
            setTarget(null, -1);
            setCapture(false);
            return;
        }
        if (state !== 'idle') {
            setCapture(true);
            return;
        }
        const over = hitTest(mouse.x, mouse.y);
        const view = over ? over.view : null;
        if (view && view !== target) hoverSince = now;
        setTarget(view, over ? over.bead : -1);
        setCapture(!!view || !!hotspotAt(mouse.x, mouse.y));
    }

    function setTarget(view, bead) {
        if (target && target !== view) target.activeBead = -1;
        target = view;
        targetBead = view ? bead : -1;
        if (view) view.activeBead = targetBead;
    }

    function startDrag() {
        clearTimeout(holdTimer);
        state = 'dragging';
        const rope = target.rope;
        rope.held = true;
        // Keep the exact point that was grabbed under the cursor, in the charm's rotating frame,
        // so the charm pivots around the hand instead of jumping or spinning on grab.
        const a = target.angle * Math.PI / 180;
        const c = Math.cos(a), s = Math.sin(a);
        const dx = pressX - rope.px[rope.end];
        const dy = pressY - rope.py[rope.end];
        grabLX = dx * c + dy * s;
        grabLY = -dx * s + dy * c;
        suppressMotionChime = true;
    }

    /** Where the held charm's attachment point goes for the current cursor and charm angle. */
    function heldPoint() {
        const a = target.angle * Math.PI / 180;
        const c = Math.cos(a), s = Math.sin(a);
        held.x = mouse.x - (grabLX * c - grabLY * s);
        held.y = mouse.y - (grabLX * s + grabLY * c);
        return held;
    }

    /** Let go; `fling` carries the hand's recent motion into the charm. */
    function endDrag(fling) {
        const rope = target.rope;
        rope.held = false;
        const v = fling ? releaseVelocity(performance.now()) : { vx: 0, vy: 0 };
        rope.setEndVelocity(v.vx, v.vy);
        releasedRope = rope;
        releaseRamp = 0;
    }

    /** End whatever press is active (drag or bead slide) without click/release events. */
    function endPress() {
        clearTimeout(holdTimer);
        if (state === 'dragging') endDrag(false);
        else if (state === 'sliding') target.rope.releaseBead();
        state = 'idle';
    }

    function cancel() {
        endPress();
        setTarget(null, -1);
        setCapture(false);
    }

    window.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !enabled || suspended) return;
        lastPointerAt = performance.now();
        if (e.pointerType !== 'mouse') restartMotion(); // a touch lands: no jump velocity
        trackMouse(e.clientX, e.clientY, e.timeStamp);
        // Touch has no hover, and a fast mouse may reach the charm between frames: hit-test here.
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) setTarget(hit.view, hit.bead);
        if (!target) {
            const spot = hotspotAt(e.clientX, e.clientY);
            if (spot) spot.press();
            return;
        }
        pressX = e.clientX;
        pressY = e.clientY;
        svgEl.setPointerCapture(e.pointerId);
        clearTimeout(holdTimer);
        if (targetBead >= 0) {
            state = 'sliding';
            target.rope.grabBead(targetBead);
            return;
        }
        state = 'pressed';
        holdTimer = setTimeout(() => {
            if (state === 'pressed') state = 'squeezing';
        }, HOLD_MS);
    });

    window.addEventListener(MOVE_EVENT, (e) => {
        lastPointerAt = performance.now();
        // Every hardware sample since the last event, with its own timestamp (smooth, exact velocity).
        const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        if (list.length) for (const c of list) trackMouse(c.clientX, c.clientY, c.timeStamp);
        else trackMouse(e.clientX, e.clientY, e.timeStamp);
        if ((state === 'pressed' || state === 'squeezing') &&
            Math.hypot(e.clientX - pressX, e.clientY - pressY) > DRAG_THRESHOLD) {
            startDrag();
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (e.button !== 0) return;
        lastPointerAt = performance.now();
        trackMouse(e.clientX, e.clientY, e.timeStamp);
        clearTimeout(holdTimer);
        if (state === 'dragging') {
            endDrag(true);
            releaseChime(target.rope.endSpeed());
            for (const f of listeners.release) f(target);
        } else if (state === 'sliding') {
            target.rope.releaseBead();
        } else if (state === 'pressed' && target) {
            for (const f of listeners.click) f(target);
        }
        // squeezing: the squeeze spring pops back on its own once state leaves 'squeezing'
        state = 'idle';
    });

    window.addEventListener('pointercancel', () => endPress());

    window.addEventListener('dblclick', () => {
        if (!enabled || !target || targetBead >= 0) return;
        playBell();
    });

    window.addEventListener('auxclick', (e) => {
        if (e.button === 1 && enabled && target) for (const f of listeners.aux) f(target);
    });

    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (enabled && target && state === 'idle') emit('show-quick-menu');
    });

    return {
        mouse,

        /** Polled cursor from the host (`cursor-pos`). Ignored while pointer events are flowing. */
        hostCursor(x, y) {
            const now = performance.now();
            if (now - lastPointerAt < POINTER_FRESH_MS) return;
            trackMouse(x, y, now);
            hover(now); // capture the mouse now, not a frame later, so a quick grab lands
        },

        /** Add a clickable region outside the charms: { hit(x, y) → bool, press() }. */
        addHotspot(h) { hotspots.push(h); },

        setViews(list) {
            views = list;
            if (target && !views.includes(target)) cancel();
        },

        setEnabled(value) {
            enabled = value;
            if (!enabled) cancel();
        },

        /** Suspend all interaction (overlay hidden): ends any press and releases mouse capture. */
        setSuspended(value) {
            suspended = value;
            if (suspended) cancel();
        },

        get state() { return state; },
        get target() { return target; },
        /** Bead of `target` under the cursor or being slid, or -1. */
        get targetBead() { return targetBead; },
        get suppressMotionChime() { return suppressMotionChime; },

        /** Subscribe to 'click' (press-release without drag) or 'release' (end of a drag). */
        on(event, fn) { listeners[event].push(fn); },

        /** Per-frame hover update; toggles OS mouse capture. */
        update(now) {
            hover(now);
        },

        /**
         * Right before drawing (after the views' prepare()): put the held charm exactly under the
         * latest cursor, so the drag shows this frame's input instead of the last physics step's.
         */
        syncHeld() {
            if (state !== 'dragging') return;
            const rope = target.rope;
            const p = heldPoint();
            rope.px[rope.end] = target.rx[rope.end] = p.x;
            rope.py[rope.end] = target.ry[rope.end] = p.y;
        },

        /** Whether `view` should show the breathing glow (cursor resting on the charm itself). */
        isBreathing(view, now) {
            return enabled && view === target && targetBead < 0 && state === 'idle' &&
                now - hoverSince > BREATH_DELAY_MS;
        },

        /** Before integration: rope stiffness for the held / just-released rope. */
        preStep() {
            if (state === 'dragging') {
                target.rope.stretchStiffness = DRAG_STIFFNESS;
            } else if (releaseRamp < 1) {
                releaseRamp = Math.min(1, releaseRamp + FIXED_DT / RELEASE_RAMP_S);
                releasedRope.stretchStiffness = DRAG_STIFFNESS + (1 - DRAG_STIFFNESS) * releaseRamp * releaseRamp;
            }
        },

        /** After integration, before constraints: the held charm or bead follows the cursor. */
        applyDrag() {
            if (state === 'sliding') {
                target.rope.dragBeadTo(mouse.x, mouse.y);
                return;
            }
            if (state !== 'dragging') return;
            const rope = target.rope;
            const p = heldPoint();
            rope.px[rope.end] = p.x;
            rope.py[rope.end] = p.y;
        },

        /** After constraints: motion chime suppression ends once the flung charm settles. */
        postStep() {
            if (suppressMotionChime && state !== 'dragging' && releaseRamp >= 1 &&
                (!releasedRope || releasedRope.endSpeed() < 0.5)) {
                suppressMotionChime = false;
            }
        },

        /** Whether passive cursor push should apply (not while hovering or holding a charm). */
        allowPush() {
            return mouse.active && state === 'idle' && !target;
        },

        isSqueezing(view) {
            return state === 'squeezing' && view === target;
        },
    };
}
