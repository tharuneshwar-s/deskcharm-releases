// Idle CPU: the overlay stops its animation loop while nothing on screen can change.
// app.js gathers the inputs every frame; this module only decides (pure, unit-tested).
//
// Idle sway rule ("deep calm"): idle sway is motion, so it keeps the loop running — but once the
// user has not touched the mouse for DEEP_CALM_MS the sway is switched off (the charm already
// settles then: reactive.js damps it after the same minute), and the overlay can sleep.

/** Largest per-step speed (px) of any rope point / bead still counted as "at rest". */
export const REST_SPEED = 0.004;
/** Cursor quiet this long before sleeping (hover, push and the living eye follow it). */
export const CURSOR_QUIET_MS = 1000;
/** No cursor input this long: idle sway fades out so the overlay can sleep. */
export const DEEP_CALM_MS = 60000;

/**
 * Peak motion of a rope + its view, in px per step (squeeze/angle/wrap folded in).
 * Duck-typed: { px, py, ox, oy, n, beadS, prevBeadS, wrapLen, wrapTarget, held, heldBead } and
 * { squeeze, squeezeVel }.
 */
export function ropeMotion(rope, view) {
    let m = 0;
    for (let i = 1; i < rope.n; i++) {
        m = Math.max(m, Math.abs(rope.px[i] - rope.ox[i]), Math.abs(rope.py[i] - rope.oy[i]));
    }
    for (let k = 0; k < rope.beadS.length; k++) m = Math.max(m, Math.abs(rope.beadS[k] - rope.prevBeadS[k]));
    m = Math.max(m, Math.abs(rope.wrapTarget - rope.wrapLen));
    if (view) m = Math.max(m, Math.abs(view.squeeze), Math.abs(view.squeezeVel) * 0.01);
    return m;
}

/**
 * Whether the overlay may stop animating.
 * @param {object} s
 *   motion          max ropeMotion() over all charms
 *   interacting     press / drag / hover target active
 *   cursorQuietMs   ms since the cursor last moved
 *   wind            any ambient wind (forces.js) non-zero
 *   fading          smart-hide fade still running
 *   visitorActive   a desk visitor is out
 *   awakeUntil      keepAwake deadline (ms), compared with `now`
 *   now             ms
 *   swaying         idle sway currently applied
 */
export function isStill(s) {
    return s.motion < REST_SPEED &&
        !s.interacting &&
        s.cursorQuietMs >= CURSOR_QUIET_MS &&
        !s.wind &&
        !s.fading &&
        !s.visitorActive &&
        !s.swaying &&
        s.now >= s.awakeUntil;
}
