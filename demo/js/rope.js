// Verlet rope with a fixed anchor (point 0) and a heavy charm at the free end.
// Beads slide along the rope at continuous positions (worry beads), and flinging the charm
// around the anchor winds the rope onto the hook, which then slowly slips back off.

export const N_POINTS = 15;
export const BASE_SEG = 21;
/** Initial bead positions (rope point indices). Beads then live at continuous positions. */
export const BEAD_POINTS = [11, 12, 13];
/** Radius of the hook peg the rope winds around; one wrap uses 2π·HOOK_R of rope. */
export const HOOK_R = 4.5;
export const HOOK_C = 2 * Math.PI * HOOK_R;

const GRAVITY = 0.13;
const BASE_DAMPING = 0.993;
const SPEED_DRAG = 0.0012;
const CONSTRAINT_ITERS = 6;
const MAX_STEP_V = 45;            // px per physics step; keeps flings from exploding
// Reduced motion: thicker air and a lower speed cap, so flings stay short and slow.
const REDUCED_DAMPING = 0.985;   // swings die out in ~1 s instead of several
const REDUCED_MAX_STEP_V = 16;

const PUSH_RADIUS = 115;
const PUSH_STRENGTH = 0.035;

// Beads. Lengths in px; bead speeds in px per step along the rope, + = toward the charm.
const BEAD_GAP_PX = 12;           // center spacing of two touching beads
const BEAD_CHARM_GAP_PX = 10;     // the lowest bead rests this far above the charm attachment
const BEAD_S_MIN = 6;             // beads stay on the lower part of the rope (point index)
const BEAD_GRIP = GRAVITY * 1.6;  // static friction: a calmly hanging rope holds beads in place
const BEAD_KINETIC = GRAVITY * 1.25; // sliding friction above gravity, so slides come to rest
const BEAD_DAMPING = 0.97;
const BEAD_TOUCH_SLACK = 0.05;    // beads closer than gap·(1 + this) count as still touching
const BEAD_MAX_V = 10;
const BEAD_BOUNCE = 0.3;          // restitution of bead–bead and bead–charm contacts
const BEAD_CLICK_V = 0.5;         // contact speed that produces a click event
const BEAD_ACCEL_SMOOTH = 0.3;    // low-pass on the rope acceleration seen by a bead (solver jitter)
const BEAD_DRAG_MAX_DS = 0.6;     // max travel of a dragged bead per step, in segments
const BEAD_TUG = 0.0025;          // holding a bead tugs the rope toward the cursor (per px)
const BEAD_TUG_MAX_PX = 40;

// Hook wrap
const WRAP_MIN_R = 25;            // closer to the hook than this, the winding angle is undefined
const WRAP_MAX_TURNS = 3;
const WRAP_MAX_FRACTION = 0.4;    // never wind more than this share of the rope
const WRAP_RATE = 0.6;            // px per step the wound length can change (no yank on wind)
const UNWIND_GRIP_STEPS = 90;     // a fresh wrap holds ~0.75 s before it starts to slip
const UNWIND_ACC = 0.0008;        // px/step² slip acceleration with the charm hanging straight down
const UNWIND_MAX_V = 0.35;        // px per step
const TWO_PI = Math.PI * 2;

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

export class Rope {
    constructor(anchorX, anchorY, seg = BASE_SEG) {
        const n = N_POINTS;
        this.n = n;
        this.end = n - 1;
        this.seg = seg;
        this.anchorX = anchorX;
        this.anchorY = anchorY;
        this.px = new Float64Array(n);
        this.py = new Float64Array(n);
        this.ox = new Float64Array(n);
        this.oy = new Float64Array(n);
        this.mass = new Float64Array(n);
        this.invMass = new Float64Array(n);
        /** Positions before the latest physics step; the view interpolates between them and px/py. */
        this.prevX = new Float64Array(n);
        this.prevY = new Float64Array(n);
        /** Stretch stiffness of segments (1 = rigid). Lowered while dragging. */
        this.stretchStiffness = 1;
        /** True while the user holds the charm: the end point ignores inertia and rope pull. */
        this.held = false;
        /**
         * Reduced motion (set by app.js): higher damping, lower speed cap, and flings no longer
         * wind the rope onto the hook (coils already wound stay and slip off as usual).
         */
        this.reducedMotion = false;

        const nb = BEAD_POINTS.length;
        /** Bead positions as continuous rope parameters (point index + fraction), top to bottom. */
        this.beadS = Float64Array.from(BEAD_POINTS);
        this.prevBeadS = Float64Array.from(BEAD_POINTS);
        this.beadV = new Float64Array(nb);
        this.beadMVX = new Float64Array(nb);  // rope velocity under each bead, last step
        this.beadMVY = new Float64Array(nb);
        this.beadAX = new Float64Array(nb);   // smoothed rope acceleration under each bead
        this.beadAY = new Float64Array(nb);
        /** Index of the bead held by the cursor, or -1. */
        this.heldBead = -1;
        /** Contact state from the last step: pair k/k+1 at [k], lowest bead on the charm at [last]. */
        this.beadTouching = new Uint8Array(nb);

        /** Rope length currently wound on the hook, px (eases toward wrapTarget). */
        this.wrapLen = 0;
        this.wrapTarget = 0;
        /** Winding direction of the coils on the hook: +1 or -1 (screen rotation sense). */
        this.wrapDir = 1;
        /** Rotation of the coils in radians; advances as rope winds on or slips off. */
        this.coilPhase = 0;
        this.wrapAngle = 0;               // charm angle around the hook, unwrapped, mod one turn
        this.wrapTheta = 0;               // last raw angle
        this.wrapTracking = false;
        this.unwindV = 0;
        this.unwindHold = 0;

        /**
         * Contact/wrap events from the last solve(), for sound and effects. Cleared at the
         * start of the next solve(). { type: 'bead' | 'beadCharm' | 'wrap' | 'unwrap' | 'unwound', speed?, bead? }
         */
        this.events = [];

        this.charmMass = 5.0;
        this.beadMass = 2.5;
        this.reset();
    }

    /** Hang straight down at rest, beads at their default spots, nothing wound. */
    reset() {
        for (let i = 0; i < this.n; i++) {
            this.px[i] = this.ox[i] = this.anchorX;
            this.py[i] = this.oy[i] = this.anchorY + i * this.seg;
        }
        this.beadS.set(BEAD_POINTS);
        this.beadV.fill(0);
        this.beadMVX.fill(0);
        this.beadMVY.fill(0);
        this.beadAX.fill(0);
        this.beadAY.fill(0);
        this.beadTouching.fill(0);
        this.wrapLen = this.wrapTarget = this.unwindV = 0;
        this.wrapTracking = false;
        this.updateMasses();
        this.snapshot();
    }

    /** Remember the current state as the start of the next step (render interpolation). */
    snapshot() {
        this.prevX.set(this.px);
        this.prevY.set(this.py);
        this.prevBeadS.set(this.beadS);
    }

    /** Stop all motion in place (idle sleep: drops a sub-pixel residual swing). */
    settle() {
        this.ox.set(this.px);
        this.oy.set(this.py);
        this.beadV.fill(0);
        this.snapshot();
    }

    setMasses(charmMass, beadMass) {
        this.charmMass = charmMass;
        this.beadMass = beadMass;
        this.updateMasses();
    }

    /**
     * Rope points weigh 1; the charm weighs on the last two points (keeps its angle steady);
     * each bead's extra weight is split between the two points it sits between.
     */
    updateMasses() {
        const { mass, invMass, n, end, beadS } = this;
        for (let i = 1; i < n; i++) mass[i] = i >= end - 1 ? this.charmMass : 1.0;
        const extra = this.beadMass - 1.0;
        for (let k = 0; k < beadS.length; k++) {
            const i = Math.floor(beadS[k]);
            const f = beadS[k] - i;
            if (i < end - 1) mass[i] += extra * (1 - f);
            if (i + 1 < end - 1) mass[i + 1] += extra * f;
        }
        mass[0] = Infinity; // anchor is immovable
        for (let i = 0; i < n; i++) {
            invMass[i] = mass[i] === Infinity ? 0 : 1.0 / mass[i];
        }
    }

    /** Change segment length, scaling the current shape about the anchor (no velocity kick). */
    setSegment(seg) {
        if (Math.abs(seg - this.seg) <= 0.5) return;
        const ratio = seg / this.seg;
        this.seg = seg;
        const { px, py, ox, oy } = this;
        for (let i = 1; i < this.n; i++) {
            px[i] = px[0] + (px[i] - px[0]) * ratio;
            py[i] = py[0] + (py[i] - py[0]) * ratio;
            ox[i] = px[i];
            oy[i] = py[i];
        }
        this.wrapTarget = Math.min(this.wrapTarget, this.maxWrap());
        this.wrapLen = Math.min(this.wrapLen, this.maxWrap());
        this.snapshot();
    }

    /** Move the anchor, translating the whole rope with it (no velocity kick). */
    moveAnchor(x, y = this.anchorY) {
        const dx = x - this.anchorX;
        const dy = y - this.anchorY;
        if (dx === 0 && dy === 0) return;
        this.anchorX = x;
        this.anchorY = y;
        for (let i = 0; i < this.n; i++) {
            this.px[i] += dx;
            this.ox[i] += dx;
            this.prevX[i] += dx;
            this.py[i] += dy;
            this.oy[i] += dy;
            this.prevY[i] += dy;
        }
    }

    /** Rest length of one segment once the wound part of the rope is taken off. */
    segEff() {
        return this.seg - this.wrapLen / (this.n - 1);
    }

    /** Most rope that can be on the hook: ~3 turns, but never most of the rope. */
    maxWrap() {
        return Math.min(WRAP_MAX_TURNS * HOOK_C, WRAP_MAX_FRACTION * this.seg * (this.n - 1));
    }

    /** Verlet integration with gravity, speed-dependent air drag, idle sway and wind. */
    integrate({ t, calm, idleSway, wind }) {
        const { px, py, ox, oy, n, end } = this;
        for (let i = 1; i < n; i++) {
            let vx = px[i] - ox[i];
            let vy = py[i] - oy[i];

            const speed = Math.hypot(vx, vy);
            let damping = Math.max(0.95, BASE_DAMPING - SPEED_DRAG * speed);
            // Breathing mode: the charm settles toward stillness
            if (calm) damping = Math.min(damping, 0.97);
            if (this.reducedMotion) damping = Math.min(damping, REDUCED_DAMPING);
            vx *= damping;
            vy *= damping;
            const maxV = this.reducedMotion ? REDUCED_MAX_STEP_V : MAX_STEP_V;
            if (speed * damping > maxV) {
                const k = maxV / (speed * damping);
                vx *= k;
                vy *= k;
            }

            ox[i] = px[i];
            oy[i] = py[i];

            // The held charm moves only with the cursor; its old position still records the
            // last movement, which becomes the fling velocity on release.
            if (this.held && i === end) continue;

            px[i] += vx;
            py[i] += vy + GRAVITY;

            const w = i / (n - 1);
            if (idleSway && !calm) {
                px[i] += (Math.sin(t * 0.3) * 0.012 + Math.sin(t * 0.7 + 0.7) * 0.006) * w;
            }
            if (wind) {
                px[i] += wind.vx * w;
                py[i] += wind.vy * w;
            }
        }
    }

    /**
     * Passive cursor push: the cursor brushing past swings the chain.
     * (cx, cy) is the visual charm center; (mvx, mvy) the smoothed cursor velocity.
     */
    push(mouseX, mouseY, mvx, mvy, cx, cy) {
        const mouseSpeed = Math.hypot(mvx, mvy);
        if (mouseSpeed <= 0.5) return;
        const { px, py, ox, oy, invMass, n, end } = this;
        const dirX = mvx / mouseSpeed;
        const dirY = mvy / mouseSpeed;
        const clampedSpeed = Math.min(mouseSpeed, 25);

        const d = Math.hypot(cx - mouseX, cy - mouseY);
        if (d < PUSH_RADIUS) {
            const proximity = (PUSH_RADIUS - d) / PUSH_RADIUS;
            const impulse = proximity * proximity * clampedSpeed * PUSH_STRENGTH;
            // Pendulum weighting: bottom moves most; heavy charm moves less per force
            for (let i = 1; i < n; i++) {
                const pendulumWeight = (i / (n - 1)) * (i / (n - 1));
                const accel = impulse * pendulumWeight * invMass[i];
                ox[i] -= dirX * accel;
                oy[i] -= dirY * accel * 0.4;
            }
        }

        // Direct rope point hits
        for (let i = 3; i < end; i++) {
            const rd = Math.hypot(px[i] - mouseX, py[i] - mouseY);
            if (rd < 35) {
                const proximity = (35 - rd) / 35;
                const impulse = proximity * proximity * clampedSpeed * PUSH_STRENGTH * 0.6;
                for (let j = i; j < n; j++) {
                    const w = (j - i + 1) / (n - i);
                    const accel = impulse * w * invMass[j];
                    ox[j] -= dirX * accel;
                    oy[j] -= dirY * accel * 0.35;
                }
            }
        }
    }

    /**
     * One physics step's constraint phase: rope segments, then bead sliding and hook winding,
     * which both read the solved motion of the rope.
     */
    solve() {
        this.solveConstraints();
        if (!Number.isFinite(this.px[this.end]) || !Number.isFinite(this.py[this.end])) {
            // Should never happen; if a bad input ever poisons the state, re-hang instead of vanishing.
            this.reset();
            return;
        }
        this.events.length = 0;
        this.slideBeads();
        this.trackWrap();
        this.updateMasses();
    }

    /**
     * Mass-weighted distance constraints. Stretched segments are softened by
     * stretchStiffness, so a soft rope pulls back harder the further it is stretched.
     */
    solveConstraints() {
        const { px, py, invMass, n, end } = this;
        const seg = this.segEff();
        for (let k = 0; k < CONSTRAINT_ITERS; k++) {
            px[0] = this.anchorX;
            py[0] = this.anchorY;

            for (let i = 0; i < n - 1; i++) {
                const dx = px[i + 1] - px[i];
                const dy = py[i + 1] - py[i];
                const d = Math.hypot(dx, dy);
                if (d === 0) continue;

                let diff = (seg - d) / d;
                if (d > seg) diff *= this.stretchStiffness;
                const sx = dx * diff;
                const sy = dy * diff;

                const imA = invMass[i];
                // While held, the hand holds the charm: the rope cannot pull it away
                const imB = this.held && i + 1 === end ? 0 : invMass[i + 1];
                const sum = imA + imB;
                if (sum === 0) continue;
                px[i] -= sx * (imA / sum);
                py[i] -= sy * (imA / sum);
                px[i + 1] += sx * (imB / sum);
                py[i + 1] += sy * (imB / sum);
            }
        }
    }

    // ========== BEADS ==========

    /**
     * Slide free beads along the rope. In the rope's own (accelerating) frame a bead feels
     * gravity minus the rope's acceleration; the along-rope part of that must beat static
     * friction to start a slide. A calm hanging rope holds the beads, while a hard swing
     * (centripetal pull) or a jerk sends them sliding toward the charm.
     */
    slideBeads() {
        const { px, py, ox, oy, end, beadS: s, beadV: v } = this;
        for (let k = 0; k < s.length; k++) {
            const i = clamp(Math.floor(s[k]), 0, end - 1);
            const f = s[k] - i;
            const mvx = (px[i] - ox[i]) * (1 - f) + (px[i + 1] - ox[i + 1]) * f;
            const mvy = (py[i] - oy[i]) * (1 - f) + (py[i + 1] - oy[i + 1]) * f;
            this.beadAX[k] += (mvx - this.beadMVX[k] - this.beadAX[k]) * BEAD_ACCEL_SMOOTH;
            this.beadAY[k] += (mvy - this.beadMVY[k] - this.beadAY[k]) * BEAD_ACCEL_SMOOTH;
            this.beadMVX[k] = mvx;
            this.beadMVY[k] = mvy;

            if (k === this.heldBead) continue;
            const dx = px[i + 1] - px[i];
            const dy = py[i + 1] - py[i];
            const len = Math.hypot(dx, dy);
            if (len < 1e-3) continue;

            const pull = (-this.beadAX[k] * dx + (GRAVITY - this.beadAY[k]) * dy) / len;
            let vk = v[k];
            if (vk === 0 && Math.abs(pull) <= BEAD_GRIP) continue;
            vk += pull;
            vk = Math.abs(vk) <= BEAD_KINETIC ? 0 : vk - Math.sign(vk) * BEAD_KINETIC;
            v[k] = clamp(vk * BEAD_DAMPING, -BEAD_MAX_V, BEAD_MAX_V);
            s[k] += v[k] / Math.max(len, 1);
        }
        this.resolveBeads();
    }

    /**
     * Keep beads in order with a minimum spacing, inside [BEAD_S_MIN, above the charm].
     * A held bead is authoritative and pushes the others along like abacus beads.
     */
    resolveBeads() {
        const { beadS: s, beadV: v } = this;
        const last = s.length - 1;
        const h = this.heldBead;
        const segEff = Math.max(1, this.segEff());
        const sMin = BEAD_S_MIN;
        const sMax = this.end - BEAD_CHARM_GAP_PX / segEff;
        const gap = Math.min(BEAD_GAP_PX / segEff, (sMax - sMin) / Math.max(1, last));

        if (h >= 0) {
            const lo = sMin + h * gap;
            const hi = sMax - (last - h) * gap;
            // Pressed against the stack: the hand keeps pushing but nothing moves, so no
            // speed is carried into the beads (otherwise they would click every step).
            if (s[h] >= hi) {
                s[h] = hi;
                if (v[h] > 0) v[h] = 0;
            } else if (s[h] <= lo) {
                s[h] = lo;
                if (v[h] < 0) v[h] = 0;
            }
        }

        const touching = this.beadTouching;
        if (h !== last && s[last] > sMax) {
            if (!touching[last] && v[last] > BEAD_CLICK_V) {
                this.events.push({ type: 'beadCharm', speed: v[last], bead: last });
            }
            s[last] = sMax;
            if (v[last] > 0) v[last] = -v[last] * BEAD_BOUNCE;
        }
        // Bottom-up: settle each bead on the one below it (unless the upper one is held).
        for (let k = last - 1; k >= 0; k--) this.beadContact(k, gap, k === h);
        if (h !== 0 && s[0] < sMin) {
            s[0] = sMin;
            if (v[0] < 0) v[0] = 0;
        }
        // Top-down: anything pushed up against the top limit pushes the beads below back down.
        for (let k = 0; k < last; k++) this.beadContact(k, gap, k + 1 !== h);

        // Contacts click only when they begin, not while beads stay pressed together.
        const slack = gap * BEAD_TOUCH_SLACK;
        for (let k = 0; k < last; k++) touching[k] = s[k + 1] - s[k] <= gap + slack ? 1 : 0;
        touching[last] = s[last] >= sMax - slack ? 1 : 0;
    }

    /** Separate bead k from bead k+1 (moving the lower or upper one) and exchange momentum. */
    beadContact(k, gap, moveLower) {
        const { beadS: s, beadV: v } = this;
        const b = k + 1;
        if (s[b] - s[k] >= gap) return;
        if (moveLower) s[b] = s[k] + gap;
        else s[k] = s[b] - gap;
        const closing = v[k] - v[b];
        if (closing <= 0) return;
        if (!this.beadTouching[k] && closing > BEAD_CLICK_V) {
            this.events.push({ type: 'bead', speed: closing, bead: k });
        }
        // A held bead carries the bead it pushes along with it (one click on contact, then
        // a steady push); free beads bounce off each other softly.
        if (k === this.heldBead) {
            v[b] = v[k];
        } else if (b === this.heldBead) {
            v[k] = v[b];
        } else {
            const mid = (v[k] + v[b]) / 2;
            v[k] = mid - BEAD_BOUNCE * closing / 2;
            v[b] = mid + BEAD_BOUNCE * closing / 2;
        }
    }

    grabBead(k) {
        this.heldBead = k;
    }

    /** Let go: the bead keeps its last drag speed as a little flick. */
    releaseBead() {
        this.heldBead = -1;
    }

    /**
     * Move the held bead toward the point on the rope nearest the cursor (searched near
     * the bead, so a folded rope can't make it jump), and tug the string toward the hand.
     * Called after integration, before solve().
     */
    dragBeadTo(x, y) {
        const k = this.heldBead;
        if (k < 0) return;
        const { px, py, invMass, end, beadS: s, beadV: v } = this;
        const cur = s[k];
        const ci = clamp(Math.floor(cur), 0, end - 1);
        let best = cur;
        let bestD = Infinity;
        for (let j = Math.max(1, ci - 3); j <= Math.min(end - 1, ci + 3); j++) {
            const dx = px[j + 1] - px[j];
            const dy = py[j + 1] - py[j];
            const l2 = dx * dx + dy * dy;
            const t = l2 > 1e-6 ? clamp(((x - px[j]) * dx + (y - py[j]) * dy) / l2, 0, 1) : 0;
            const qx = px[j] + dx * t - x;
            const qy = py[j] + dy * t - y;
            const d = qx * qx + qy * qy;
            if (d < bestD) {
                bestD = d;
                best = j + t;
            }
        }
        const ds = clamp(best - cur, -BEAD_DRAG_MAX_DS, BEAD_DRAG_MAX_DS);
        s[k] = cur + ds;
        const len = Math.hypot(px[ci + 1] - px[ci], py[ci + 1] - py[ci]);
        v[k] = v[k] * 0.5 + ds * len * 0.5;

        const i = clamp(Math.floor(s[k]), 0, end - 1);
        const f = s[k] - i;
        const bx = px[i] + (px[i + 1] - px[i]) * f;
        const by = py[i] + (py[i + 1] - py[i]) * f;
        const tx = x - bx;
        const ty = y - by;
        const dist = Math.hypot(tx, ty);
        if (dist > 0.5) {
            const force = Math.min(dist, BEAD_TUG_MAX_PX) * BEAD_TUG / dist;
            px[i] += tx * force * (1 - f) * invMass[i];
            py[i] += ty * force * (1 - f) * invMass[i];
            px[i + 1] += tx * force * f * invMass[i + 1];
            py[i + 1] += ty * force * f * invMass[i + 1];
        }
    }

    // ========== HOOK WRAP ==========

    /**
     * Track the charm's unwrapped angle around the hook. Each full turn in one direction
     * winds one hook circumference of rope on (the opposite turn takes one off). Wound rope
     * grips briefly, then slips off under the charm's weight, faster and faster like a spool.
     * Per-step angle changes stay well under π (MAX_STEP_V vs WRAP_MIN_R), so a fast fling
     * can't skip a turn; near the hook the angle is undefined and tracking restarts.
     */
    trackWrap() {
        const { px, py, end } = this;
        const dx = px[end] - this.anchorX;
        const dy = py[end] - this.anchorY;
        const r = Math.hypot(dx, dy);
        if (r < WRAP_MIN_R) {
            this.wrapTracking = false;
        } else {
            const theta = Math.atan2(dx, dy); // 0 = hanging straight down
            if (this.wrapTracking) {
                let d = theta - this.wrapTheta;
                if (d > Math.PI) d -= TWO_PI;
                else if (d < -Math.PI) d += TWO_PI;
                this.wrapAngle += d;
                if (this.wrapAngle >= TWO_PI) {
                    this.wrapAngle -= TWO_PI;
                    this.windTurn(1);
                } else if (this.wrapAngle <= -TWO_PI) {
                    this.wrapAngle += TWO_PI;
                    this.windTurn(-1);
                }
            } else {
                this.wrapAngle = theta;
                this.wrapTracking = true;
            }
            this.wrapTheta = theta;
        }

        if (this.wrapTarget > 0) {
            if (this.held) {
                this.unwindV = 0;
            } else if (this.unwindHold > 0) {
                this.unwindHold--;
            } else {
                // Slip is driven by rope tension: strongest with the charm hanging below the hook.
                const tension = r >= WRAP_MIN_R ? Math.max(0, dy / r) : 0;
                this.unwindV = Math.min(UNWIND_MAX_V, this.unwindV * (tension > 0 ? 1 : 0.95) + UNWIND_ACC * tension);
                this.wrapTarget = Math.max(0, this.wrapTarget - this.unwindV);
            }
        } else {
            this.unwindV = 0;
        }

        const prev = this.wrapLen;
        const change = clamp(this.wrapTarget - prev, -WRAP_RATE, WRAP_RATE);
        this.wrapLen = prev + change;
        this.coilPhase += change / HOOK_R;
        if (prev > 0 && this.wrapLen <= 0) {
            this.wrapLen = 0;
            this.events.push({ type: 'unwound' });
        }
    }

    windTurn(dir) {
        if (this.reducedMotion) return; // no wrap flourish; the angle keeps tracking
        if (this.wrapTarget > 0 && dir !== this.wrapDir) {
            this.wrapTarget = Math.max(0, this.wrapTarget - HOOK_C);
            this.events.push({ type: 'unwrap' });
        } else {
            if (this.wrapTarget <= 0) this.wrapDir = dir;
            const before = this.wrapTarget;
            this.wrapTarget = Math.min(this.maxWrap(), this.wrapTarget + HOOK_C);
            if (this.wrapTarget > before) this.events.push({ type: 'wrap', turns: this.wrapTarget / HOOK_C });
        }
        this.unwindV = 0;
        this.unwindHold = UNWIND_GRIP_STEPS;
    }

    /** Speed of the charm end point, px per step. */
    endSpeed() {
        const e = this.end;
        return Math.hypot(this.px[e] - this.ox[e], this.py[e] - this.oy[e]);
    }

    /** Set the charm end's velocity (px per step), e.g. a fling on release; capped like integrate(). */
    setEndVelocity(vx, vy) {
        const e = this.end;
        const maxV = this.reducedMotion ? REDUCED_MAX_STEP_V : MAX_STEP_V;
        const speed = Math.hypot(vx, vy);
        if (speed > maxV) {
            vx *= maxV / speed;
            vy *= maxV / speed;
        }
        this.ox[e] = this.px[e] - vx;
        this.oy[e] = this.py[e] - vy;
    }
}
