// Desk visitor: a cheeky rhesus macaque (sprite atlas src/visitors/monkey-real.webp + .json:
// 8 scamper frames, plus idle, look up, scratch, crouch, leap and grin poses). It scampers in,
// stops under the main charm, looks up, scratches its head, crouches and leaps — and steals the
// charm's last bead. It lands grinning, shows the bead off and scampers away with it. The bead
// comes back 10 s after it leaves, at once if you click it ("Okay, okay!") or fling a charm at it.
//
// The stolen bead is a clone of the charm's bead drawing, positioned at the monkey's hand in each
// pose (HAND, atlas-cell px). The leap is the leap sprite translated up by the pose number `lift`.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/monkey-real.json' with { type: 'json' };

const K = 0.19;                   // atlas px → screen px for a pose drawn at size 1
const S = sprite(META, { image: 'visitors/monkey-real.webp', scale: K, shadow: false });
const FEET = META.feetY;

// Every clip is packed at the same height; SIZE restores the poses' real relative sizes.
const SIZE = { idle: 0.95, walk: 0.95, lookup: 1.15, scratch: 1.1, crouch: 0.95, leap: 1.75, grin: 1.15 };
// Where its (front) hand is in each pose, in atlas px from the cell's centre line (x) and top (y).
// On all fours it carries the bead in its mouth.
const HAND = { idle: [172, 106], walk: [174, 108], lookup: [77, 300], scratch: [36, 236], crouch: [190, 300], leap: [77, 36], grin: [88, 94] };

// ========== THEFT STATE (one monkey at a time) ==========

let held = null;        // clone <g> in its hand
let heldK = -1;         // bead index it holds (hidden on the charm)
let timer = null;       // pending return after it left
let pendingK = -1;
let gaveUp = false;     // dropped the bead this visit: replays don't steal again

/** Put a bead that is on its way back (left-screen timer) back now. */
function flushPending(ctx) {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const k = pendingK;
    pendingK = -1;
    ctx.showBead(k);
}

/** Drop whatever it holds and show the bead on the charm again. */
function returnNow(ctx) {
    flushPending(ctx);
    if (heldK < 0) return false;
    held?.remove();
    held = null;
    ctx.showBead(heldK);
    heldK = -1;
    return true;
}

let rig = null;         // parts of the built drawing (for attaching the bead)

function steal(ctx) {
    if (gaveUp || heldK >= 0) return;
    flushPending(ctx);
    const k = ctx.beadCount() - 1;
    if (k < 0) return;
    ctx.hideBead(k);
    heldK = k;
    held = ctx.cloneBead(k);
    if (held && rig) rig.hand.appendChild(held);
}

// ========== DRAWING ==========

function build(root) {
    const shadow = el('ellipse', { cx: 4, cy: 0, rx: 30, ry: 5, fill: '#000', opacity: 0.2 }, root);
    const fig = el('g', {}, root);
    const parts = S.parts.build(fig);
    const hand = el('g', {}, fig);
    rig = { ...parts, shadow, fig, hand };
    if (held) hand.appendChild(held);
    return rig;
}

// ========== POSES ==========

const ACT = [
    [0.00, {}],
    [0.40, { pose: 'lookup' }],
    [0.80, { pose: 'scratch' }],
    [1.85, { pose: 'lookup' }],
    [2.25, { pose: 'crouch' }],
    [2.60, { pose: 'leap', lift: 0 }],
    [2.75, { lift: 72 }],
    [2.90, { lift: 68 }],
    [3.20, { pose: 'crouch', lift: 0 }],
    [3.45, { pose: 'grin' }],
    [4.50, {}],
];

function chuckle() {
    for (let i = 0; i < 3; i++) tone(620 + i * 90, 0.035, 0.08, i * 0.12, 'triangle');
}

registerVisitor({
    id: 'monkey',
    name: 'Monkey',
    group: 'everyday',
    fact: 'Monkeys groom each other to make friends and keep the peace.',
    tricks: 'Borrows a bead from your charm',
    speed: 190,
    stride: 110,                  // px per walk cycle (8 frames)
    hit: { w: 50, h: 110 },
    reach: S.reach,
    stopAtCharm: true,
    hello: 'Ooh ooh! 🐒',
    yelp: 'Eek! 🙈',
    rest: { pose: 'idle', lift: 0 },
    act: ACT,
    events: [
        { t: 2.75, run(ctx) { steal(ctx); } },
        { t: 3.25, run(ctx) {
            if (heldK < 0) return;
            ctx.say('Mine! 😜', 1.8);
            chuckle();
        } },
    ],
    build,
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        const pose = p.walkFrame >= 0 ? 'walk' : (SIZE[p.pose] ? p.pose : 'idle');
        const s = SIZE[pose], lift = p.lift || 0;
        r.fig.setAttribute('transform', `translate(0,${(-lift).toFixed(2)}) scale(${s})`);
        const k = Math.max(0.35, 1 - lift / 160);
        r.shadow.setAttribute('transform', `scale(${(k * s).toFixed(3)},1)`);
        r.shadow.setAttribute('opacity', (0.2 * k).toFixed(3));
        if (held) {
            const [hx, hy] = HAND[pose];
            r.hand.setAttribute('transform', `translate(${(hx * K).toFixed(2)},${((hy - FEET) * K).toFixed(2)}) scale(${(0.9 / s).toFixed(3)})`);
        }
    },
    onClick(ctx) {
        if (returnNow(ctx)) {
            gaveUp = true;
            ctx.say('Okay, okay! 🙊', 1.6);
        }
    },
    onStartle(ctx) {
        if (returnNow(ctx)) gaveUp = true;
    },
    onLeave(ctx) {
        gaveUp = false;
        flushPending(ctx);
        if (heldK < 0) return;
        held?.remove();
        held = null;
        pendingK = heldK;
        heldK = -1;
        timer = setTimeout(() => {
            timer = null;
            const k = pendingK;
            pendingK = -1;
            ctx.showBead(k);
        }, 10000);
    },
});
