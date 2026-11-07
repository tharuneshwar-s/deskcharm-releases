// Living charm (config `living_charm`): the painted eye of the eye charms (catalog entries with an
// `eye`, see src/charms.js) comes alive. An SVG eye is laid exactly over the painted one inside the
// charm body (CharmView.eyeLayer), so it swings and squeezes with the charm:
//   patch      sclera-white disc hiding the painted iris, feathered into the painted white
//   iris       iris + pupil, moved by the look offset, clipped to the white
//   highlight  fixed glint (it stays put while the iris moves: reads as glass)
//   lids       top / bottom lids in the charm's glass colour
//
// Moods (highest priority first):
//   sleep / drowsy  no input for 5 min (1 min between 23:00 and 06:00): lids sag, then close
//   wake            input while drowsy/asleep: two slow blinks + a small stretch, then awake
//   dizzy           2+ wraps around the hook; iris circles until 2 s after the spin stops
//   startled        loud music beat / hard window shake: wide eye + a small jump (0.6 s)
//   wide            flung hard or released after a long drag: lids open, pupil shrinks (1.5 s)
//   glance          on the hour: a 1 s look at the top-right clock
//   happy           breathing glow on (resting cursor, guided breathing): lower lid squints
//   awake           iris eases toward the cursor; small saccades while the cursor rests
// Blinks every 3–7 s, a double blink when the cursor arrives on the charm.
// Reduced motion: blinks (and dozing off) only — no gaze, saccades, dizzy circles or jumps.
// Not wired: smash release (smash.js has no event), env-foreground glance.
//
// Idle CPU: animates only while something changes (calls world.keepAwake then); a resting eye
// lets the overlay sleep, and blinks are started by its slow check frames.

import { registerFeature } from '../features.js';
import { BASE_CHARM_W, BASE_CHARM_H } from '../charm.js';
import { mew } from '../audio.js';
import { DEV } from '../dev.js';

const SVGNS = 'http://www.w3.org/2000/svg';

const LOOK_MAX = 0.4;               // iris travel, fraction of the white's radius
const LOOK_SOFT_PX = 160;           // cursor distance giving half the travel
const LOOK_TAU_S = 0.08;            // iris easing
const LID_TAU_S = 0.12;             // mood lid easing
const BLINK_CLOSE_MS = 80;
const BLINK_OPEN_MS = 120;
const SLOW_BLINK = 3;               // wake blinks take this much longer
const DOUBLE_BLINK_GAP_MS = 260;
const SACCADE_AFTER_MS = 1500;      // cursor resting this long: small eye darts
const DROWSY_AFTER_MS = 5 * 60 * 1000;
const NIGHT_DROWSY_AFTER_MS = 60 * 1000;
const DROWSY_MS = 6000;             // lids sag, then close
const WAKE_MS = 1600;
const WIDE_MS = 1500;
const WIDE_SPEED = 6;               // px/step at release
const LONG_DRAG_MS = 2000;
const STARTLE_MS = 600;
const STARTLE_COOLDOWN_MS = 4000;
const LOUD_BEAT = 0.75;
const SHAKE_STARTLE = 25;           // env-window-move speed
const DIZZY_TURNS = 2;
const DIZZY_HOLD_MS = 2000;
const GLANCE_MS = 1000;
const EPS = 0.02;

// ========== PURE HELPERS (unit-tested) ==========
/** Lid closure 0..1 of a blink started `ms` ago (`slow` stretches it); 0 once over. */
export function blinkClose(ms, slow = 1) {
    const c = BLINK_CLOSE_MS * slow;
    const o = BLINK_OPEN_MS * slow;
    if (ms < 0 || ms >= c + o) return 0;
    return ms < c ? ms / c : 1 - (ms - c) / o;
}

/** Blink length in ms. */
export function blinkLength(slow = 1) {
    return (BLINK_CLOSE_MS + BLINK_OPEN_MS) * slow;
}

/** Iris offset toward a target (dx, dy) px away: saturates smoothly at maxR. */
export function lookOffset(dx, dy, maxR, soft = LOOK_SOFT_PX) {
    const d = Math.hypot(dx, dy);
    if (!(d > 1e-6)) return { x: 0, y: 0 };
    const k = (maxR / (d + soft));
    return { x: dx * k, y: dy * k };
}

export function isNight(hour) {
    return hour >= 23 || hour < 6;
}

/** Whether `idleMs` without input sends the charm to sleep at local `hour`. */
export function drowsyDue(idleMs, hour) {
    return idleMs >= (isNight(hour) ? NIGHT_DROWSY_AFTER_MS : DROWSY_AFTER_MS);
}

/** Lid targets { top, bottom } (0 open … 1 meets the centre) and pupil scale for a mood. */
export function moodLook(mood, progress = 0) {
    switch (mood) {
        case 'sleep': return { top: 1, bottom: 1, pupil: 1 };
        case 'drowsy': return { top: Math.min(1, 0.25 + 0.75 * progress * progress), bottom: Math.min(1, progress * 0.6), pupil: 1 };
        case 'wide': return { top: 0, bottom: 0, pupil: 0.72 };
        case 'startled': return { top: 0, bottom: 0, pupil: 0.62 };
        case 'dizzy': return { top: 0.18, bottom: 0.1, pupil: 0.9 };
        case 'happy': return { top: 0.12, bottom: 0.42, pupil: 1.05 };
        case 'soft': return { top: 0.4, bottom: 0.14, pupil: 1.08 };
        default: return { top: 0, bottom: 0, pupil: 1 };
    }
}

// ========== COLOURS ==========
function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
        Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
    return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ========== STATE ==========
let world = null;
let enabled = true;
let catalogEyes = null;             // id → eye, from src/charms.js (charm data saved before eyes existed)
const eyes = new Map();             // CharmView → eye drawing
let uid = 0;

let mood = 'awake';
let moodStart = 0;
let moodUntil = 0;
let lastInput = performance.now();
let blinks = [];                    // [{ at, slow }]
let nextBlink = performance.now() + 3000 + Math.random() * 4000;
let hoverView = null;
let dragSince = 0;
let wasDragging = false;
let lastStartle = -Infinity;
let spinning = false;
let lastHourKey = '';
let saccade = { x: 0, y: 0 };
let nextSaccade = 0;
let lastCursorX = NaN, lastCursorY = NaN, cursorStill = 0;

function el(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

function eyeFor(data) {
    if (!data) return null;
    return data.eye || catalogEyes?.get(data.id) || null;
}

/** Builds (or rebuilds after a charm/size change) the SVG eye of `view`; null when it has none. */
function eyeOf(view) {
    const spec = enabled ? eyeFor(view.data) : null;
    const key = spec ? `${view.data.id}|${view.scale}` : '';
    let e = eyes.get(view);
    if (e && e.key === key) return e;
    view.eyeLayer.replaceChildren();
    if (!spec) {
        eyes.delete(view);
        return null;
    }
    if (spec.type === 'cat') return catFaceOf(view, spec, key);
    const w = BASE_CHARM_W * view.scale;
    const cx = -w / 2 + spec.cx * w;
    const cy = -8 * view.scale + spec.cy * w;
    const R = spec.r * w, I = spec.iris * w, P = spec.pupil * w;
    // Iris rest centre (painted iris is not always concentric with the white).
    const ix = -w / 2 + (spec.ix ?? spec.cx) * w;
    const iy = -8 * view.scale + (spec.iy ?? spec.cy) * w;
    const n = ++uid;
    const iris = spec.color || '#5ccdf2';
    const glass = view.data.outer || (view.data.beadColors && view.data.beadColors[0]) || '#2140bf';
    const g = view.eyeLayer;
    const defs = el('defs', {}, g);
    el('circle', { cx, cy, r: R * 0.99 }, el('clipPath', { id: `lvClip${n}` }, defs));
    const patchG = el('radialGradient', { id: `lvPatch${n}` }, defs);
    el('stop', { offset: 0.93, 'stop-color': '#f2f3f5' }, patchG);
    el('stop', { offset: 1, 'stop-color': '#f1f2f3', 'stop-opacity': 0 }, patchG);
    const irisG = el('radialGradient', { id: `lvIris${n}`, cx: 0.45, cy: 0.42, r: 0.6 }, defs);
    el('stop', { offset: 0.35, 'stop-color': shade(iris, 0.25) }, irisG);
    el('stop', { offset: 0.8, 'stop-color': iris }, irisG);
    el('stop', { offset: 1, 'stop-color': shade(iris, -0.25) }, irisG);
    const lidG = el('linearGradient', { id: `lvLid${n}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': shade(glass, -0.3) }, lidG);
    el('stop', { offset: 0.85, 'stop-color': glass }, lidG);
    el('stop', { offset: 1, 'stop-color': shade(glass, 0.25) }, lidG);
    const lidGB = el('linearGradient', { id: `lvLidB${n}`, x1: 0, y1: 1, x2: 0, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': shade(glass, -0.3) }, lidGB);
    el('stop', { offset: 0.85, 'stop-color': glass }, lidGB);
    el('stop', { offset: 1, 'stop-color': shade(glass, 0.25) }, lidGB);

    const clip = el('g', { 'clip-path': `url(#lvClip${n})` }, g);
    el('circle', { cx: ix, cy: iy, r: I * 1.22, fill: `url(#lvPatch${n})` }, clip);
    const irisNode = el('g', {}, clip);
    el('circle', { cx: ix, cy: iy, r: I, fill: `url(#lvIris${n})` }, irisNode);
    el('circle', { cx: ix, cy: iy, r: I * 0.98, fill: 'none', stroke: shade(iris, -0.35), 'stroke-width': I * 0.04, opacity: 0.5 }, irisNode);
    const pupil = el('circle', { cx: ix, cy: iy, r: P, fill: '#0b0b12' }, irisNode);
    // Fixed glint (painted-on glass highlight): does not follow the iris.
    const gx = ix - P * 0.42, gy = iy - P * 0.5;
    el('ellipse', { cx: gx, cy: gy, rx: P * 0.34, ry: P * 0.2, fill: '#fff', opacity: 0.9, transform: `rotate(-35 ${gx} ${gy})` }, clip);
    el('circle', { cx: ix + P * 0.45, cy: iy + P * 0.42, r: P * 0.08, fill: '#fff', opacity: 0.6 }, clip);
    const lidTop = el('path', { fill: `url(#lvLid${n})` }, clip);
    const lidBottom = el('path', { fill: `url(#lvLidB${n})` }, clip);
    const lineTop = el('path', { fill: 'none', stroke: shade(glass, -0.5), 'stroke-width': Math.max(0.4, R * 0.04), opacity: 0.7 }, clip);
    const lineBottom = el('path', { fill: 'none', stroke: shade(glass, -0.5), 'stroke-width': Math.max(0.4, R * 0.04), opacity: 0.7 }, clip);

    e = { key, cx, cy, R, I, P, irisNode, pupil, lidTop, lidBottom, lineTop, lineBottom,
        ox: 0, oy: 0, top: 0, bottom: 0, pupilK: 1, drawn: '' };
    eyes.set(view, e);
    return e;
}

/** Lid edge for closure t (0 open, 1 at the centre); the edge bows toward the opening. */
function lidPaths(e, t, top) {
    const { cx, cy, R } = e;
    const s = top ? 1 : -1;
    const y = cy - s * R * (1 - t * 1.02);
    const bow = s * R * 0.45 * (1 - t * 0.6);
    const far = cy - s * (R + 2);
    const edge = `M${(cx - R - 2).toFixed(2)},${y.toFixed(2)} Q${cx.toFixed(2)},${(y + bow).toFixed(2)} ${(cx + R + 2).toFixed(2)},${y.toFixed(2)}`;
    return { fill: `${edge} L${(cx + R + 2).toFixed(2)},${far.toFixed(2)} L${(cx - R - 2).toFixed(2)},${far.toFixed(2)}Z`, edge };
}

function hideEyes() {
    for (const view of eyes.keys()) view.eyeLayer.replaceChildren();
    eyes.clear();
}

// ========== CAT FACE (eye.type 'cat') ==========
// A character charm painted with a blank face: the whole face is SVG. Expressions: happy `^ ^` (default),
// open round eyes following the cursor on hover (blinking), `> <` when dizzy / flung hard, `- -` with a
// floating z asleep. Music beats float ♪ notes beside the head and bob the face; a click or squeeze
// mews and twinkles the star badge. Spec fields are fractions of the image: lx / rx / ey eye centres,
// my mouth, w eye half-width (of the image width), star { u, v } badge, aspect image width / height.

/** Expression drawn on a cat face for mood `m` (`hovered`: cursor on / holding a charm — either one, so two cats look together). */
export function catExpression(m, hovered) {
    if (m === 'sleep' || m === 'drowsy') return 'sleep';
    if (m === 'dizzy' || m === 'wide') return 'dizzy';
    if (hovered || m === 'startled' || m === 'glance' || m === 'wake') return 'open';
    return 'happy';
}

function catFaceOf(view, spec, key) {
    const s = view.scale;
    const W = BASE_CHARM_W * s, H = BASE_CHARM_H * s;
    const a = spec.aspect || 1;
    const rw = Math.min(W, H * a), rh = rw / a;          // image is drawn xMidYMin meet
    const px = (u) => -rw / 2 + u * rw;
    const py = (v) => -8 * s + v * rh;
    const R = spec.w * rw;
    const ink = spec.ink || '#222';
    const ey = py(spec.ey), my = py(spec.my);
    const g = view.eyeLayer;
    const face = el('g', {}, g);
    const line = { fill: 'none', stroke: ink, 'stroke-width': (R * 0.42).toFixed(2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const f = (n) => n.toFixed(2);
    const sides = [[px(spec.lx), 1], [px(spec.rx), -1]].map(([x, dir]) => {
        const happy = el('path', { ...line, d: `M${f(x - R)},${f(ey + R * 0.35)} Q${f(x)},${f(ey - R * 0.8)} ${f(x + R)},${f(ey + R * 0.35)}` }, face);
        const dizzy = el('path', { ...line, d: `M${f(x - dir * R * 0.6)},${f(ey - R * 0.6)} L${f(x + dir * R * 0.6)},${f(ey)} L${f(x - dir * R * 0.6)},${f(ey + R * 0.6)}` }, face);
        const sleep = el('path', { ...line, d: `M${f(x - R)},${f(ey + R * 0.15)} L${f(x + R)},${f(ey + R * 0.15)}` }, face);
        const open = el('g', {}, face);
        el('ellipse', { cx: x, cy: ey, rx: R * 0.62, ry: R * 0.82, fill: ink }, open);
        el('circle', { cx: x - R * 0.2, cy: ey - R * 0.32, r: R * 0.2, fill: '#fff', opacity: 0.9 }, open);
        return { x, happy, dizzy, sleep, open };
    });
    const mx = (px(spec.lx) + px(spec.rx)) / 2, M = R * 0.55;
    el('path', { ...line, 'stroke-width': f(R * 0.34), d: `M${f(mx - M * 1.1)},${f(my - M * 0.2)} Q${f(mx - M * 0.55)},${f(my + M)} ${f(mx)},${f(my)} Q${f(mx + M * 0.55)},${f(my + M)} ${f(mx + M * 1.1)},${f(my - M * 0.2)}` }, face);
    const font = 'Segoe UI Symbol, Segoe UI, sans-serif';
    const z = el('text', { x: px(0.8), y: py(0.14), 'font-size': f(R * 2.6), 'font-family': font, 'font-weight': 700,
        fill: '#7a8ad0', stroke: '#fff', 'stroke-width': f(R * 0.3), 'paint-order': 'stroke', 'text-anchor': 'middle' }, g);
    z.textContent = 'z';
    const notes = el('g', {}, g);
    const sx = px(spec.star.u), sy = py(spec.star.v), sr = R * 2.8;
    const sparkle = el('path', { fill: '#fff', stroke: '#fff8c0', 'stroke-width': f(R * 0.12),
        d: `M0,${f(-sr)} Q0,0 ${f(sr)},0 Q0,0 0,${f(sr)} Q0,0 ${f(-sr)},0 Q0,0 0,${f(-sr)}Z` }, g);
    const e = { key, cat: true, cx: mx, cy: ey, R, face, sides, z, notes, sparkle, sx, sy,
        noteX: [px(0.08), px(0.92)], noteY: py(0.3), noteSize: R * 3, noteFont: font, noteList: [], rh,
        ox: 0, oy: 0, squeezed: false, twinkleAt: -Infinity, drawn: '' };
    eyes.set(view, e);
    return e;
}

const BOB_MS = 260;
const NOTE_MS = 1700;
const NOTE_GAP_MS = 380;
const MAX_NOTES = 4;
const TWINKLE_MS = 700;
const Z_PERIOD_MS = 7000;
const Z_PUFF_MS = 2400;
const Z_PUFFS_FOR_MS = 2 * 60 * 1000;  // after this long asleep the z rests still (idle CPU)
let lastBeat = -Infinity;
let lastNote = -Infinity;
let noteSide = 0;

function catBeat(now) {
    if (![...eyes.values()].some((e) => e.cat)) return;
    lastBeat = now;
    world.keepAwake?.();
    if (world.reducedMotion || now - lastNote < NOTE_GAP_MS) return;
    lastNote = now;
    noteSide ^= 1;
    for (const e of eyes.values()) {
        if (!e.cat || e.noteList.length >= MAX_NOTES) continue;
        const node = el('text', { x: e.noteX[noteSide], y: e.noteY, 'font-size': e.noteSize.toFixed(2), 'font-family': e.noteFont,
            fill: '#3a2a6a', stroke: '#fff', 'stroke-width': (e.R * 0.25).toFixed(2), 'paint-order': 'stroke', 'text-anchor': 'middle', opacity: 0 }, e.notes);
        node.textContent = Math.random() < 0.5 ? '♪' : '♫';
        e.noteList.push({ at: now, node, dir: noteSide ? 1 : -1 });
    }
}

function catPoke(e, now) {
    mew();
    e.twinkleAt = now;
    world.keepAwake?.();
}

/** Draws one cat face; true while it is animating. */
function renderCat(view, e, now, m, b, kLook) {
    const reduced = world.reducedMotion;
    const expr = catExpression(m, !!world.interaction.target);
    const squeezed = world.interaction.isSqueezing(view);
    if (squeezed && !e.squeezed) catPoke(e, now);
    e.squeezed = squeezed;
    let animating = false;

    const t = expr === 'open' ? lookTarget(view, e, now, m) : { x: 0, y: 0 };
    e.ox += (t.x - e.ox) * kLook;
    e.oy += (t.y - e.oy) * kLook;
    if (Math.abs(t.x - e.ox) > EPS || Math.abs(t.y - e.oy) > EPS) animating = true;
    let bob = 0;
    const kb = (now - lastBeat) / BOB_MS;
    if (!reduced && kb >= 0 && kb < 1) {
        bob = Math.sin(kb * Math.PI) * e.R * 0.5;
        animating = true;
    }
    const lid = expr === 'open' ? Math.max(0.05, 1 - b) : 1;
    const key = `${expr},${e.ox.toFixed(2)},${e.oy.toFixed(2)},${lid.toFixed(3)},${bob.toFixed(2)}`;
    if (key !== e.drawn) {
        e.drawn = key;
        e.face.setAttribute('transform', `translate(0,${bob.toFixed(2)})`);
        for (const sd of e.sides) {
            sd.happy.style.display = expr === 'happy' ? '' : 'none';
            sd.dizzy.style.display = expr === 'dizzy' ? '' : 'none';
            sd.sleep.style.display = expr === 'sleep' ? '' : 'none';
            sd.open.style.display = expr === 'open' ? '' : 'none';
            if (expr === 'open') {
                sd.open.setAttribute('transform', `translate(${(sd.x + e.ox).toFixed(2)},${(e.cy + e.oy).toFixed(2)}) scale(1,${lid.toFixed(3)}) translate(${(-sd.x).toFixed(2)},${(-e.cy).toFixed(2)})`);
            }
        }
    }

    // Floating z while asleep: a puff every few seconds, resting faintly in between. After a
    // couple of minutes it stays still, so a sleeping charm lets the overlay sleep too.
    if (mood === 'sleep') {
        const asleep = now - moodStart;
        const p = asleep % Z_PERIOD_MS;
        const k = reduced || asleep > Z_PUFFS_FOR_MS || p >= Z_PUFF_MS ? 0 : p / Z_PUFF_MS;
        if (k > 0) animating = true;
        e.z.style.display = '';
        e.z.setAttribute('transform', `translate(${(k * e.R * 2).toFixed(2)},${(-k * e.R * 5).toFixed(2)})`);
        e.z.setAttribute('opacity', (k ? 1 - k * k : 0.8).toFixed(3));
    } else e.z.style.display = 'none';

    e.noteList = e.noteList.filter((n) => {
        const k = (now - n.at) / NOTE_MS;
        if (k >= 1 || reduced) { n.node.remove(); return false; }
        const dx = n.dir * (k * e.R * 2.5 + Math.sin(k * Math.PI * 3) * e.R * 0.8);
        n.node.setAttribute('transform', `translate(${dx.toFixed(2)},${(-k * e.rh * 0.14).toFixed(2)})`);
        n.node.setAttribute('opacity', (k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.5) / 0.5)).toFixed(3));
        return true;
    });
    if (e.noteList.length) animating = true;

    const kt = (now - e.twinkleAt) / TWINKLE_MS;
    if (kt >= 0 && kt < 1) {
        e.sparkle.style.display = '';
        e.sparkle.setAttribute('transform', `translate(${e.sx.toFixed(2)},${e.sy.toFixed(2)}) rotate(${(kt * 90).toFixed(1)}) scale(${Math.sin(kt * Math.PI).toFixed(3)})`);
        animating = true;
    } else e.sparkle.style.display = 'none';
    return animating;
}

// ========== MOODS ==========
function setMood(m, now, ms = 0) {
    mood = m;
    moodStart = now;
    moodUntil = ms ? now + ms : Infinity;
}

function blink(now, slow = 1) {
    blinks.push({ at: now, slow });
}

function noteInput() {
    const now = performance.now();
    lastInput = now;
    if (mood === 'sleep' || mood === 'drowsy') {
        setMood('wake', now, WAKE_MS);
        blink(now + 150, SLOW_BLINK);
        blink(now + 150 + blinkLength(SLOW_BLINK) + 250, SLOW_BLINK);
        stretch();
    }
}

/** Small upward bounce of the main charm (wake stretch, startle jump). */
function stretch(amount = 1.6) {
    if (!world || world.reducedMotion) return;
    const rope = world.charms[0]?.rope;
    if (!rope || rope.held) return;
    for (let i = rope.end - 2; i <= rope.end; i++) rope.oy[i] += amount * (i - rope.end + 3) / 3;
    world.keepAwake?.(400);
}

function startle(now) {
    if (world.reducedMotion || now - lastStartle < STARTLE_COOLDOWN_MS) return;
    if (mood === 'sleep' || mood === 'drowsy' || mood === 'wake') return;
    lastStartle = now;
    setMood('startled', now, STARTLE_MS);
    stretch(2.2);
}

function updateMood(now) {
    const reduced = world.reducedMotion;
    const busy = world.interaction.state !== 'idle';
    if (mood !== 'sleep' && mood !== 'drowsy' && mood !== 'wake' && !busy &&
        drowsyDue(now - lastInput, new Date().getHours())) {
        setMood('drowsy', now);
    }
    if (mood === 'drowsy' && now - moodStart >= DROWSY_MS) setMood('sleep', now);
    if (now >= moodUntil) {
        if (mood === 'dizzy' && spinning) moodUntil = now + DIZZY_HOLD_MS;
        else setMood('awake', now);
    }
    if (reduced && mood !== 'sleep' && mood !== 'drowsy' && mood !== 'wake') {
        if (mood !== 'awake') setMood('awake', now);
        return;
    }
    // Glance at the clock on the hour (once per hour, only from plain awake).
    const d = new Date();
    const hourKey = `${d.getDate()}-${d.getHours()}`;
    if (d.getMinutes() === 0 && hourKey !== lastHourKey && mood === 'awake') setMood('glance', now, GLANCE_MS);
    if (d.getMinutes() === 0) lastHourKey = hourKey;
}

/** Mood shown this frame: a resting-cursor / breathing glow makes a plain awake eye happy. */
function shownMood() {
    if (mood === 'awake' && !world.reducedMotion && world.charms.some((c) => eyes.has(c.view) && c.view.glowFade > 0.5)) return 'happy';
    return mood;
}

// ========== RENDER ==========
function lookTarget(view, e, now, m) {
    if (world.reducedMotion || m === 'sleep' || m === 'drowsy') return { x: 0, y: 0 };
    const maxR = LOOK_MAX * e.R;
    if (m === 'dizzy') {
        const a = now / 1000 * Math.PI * 2 * 1.3;
        return { x: Math.cos(a) * maxR * 0.85, y: Math.sin(a) * maxR * 0.85 };
    }
    // Eye centre on screen: charm transform translate(end) rotate(angle) applied to (cx, cy).
    const end = view.rope.end;
    const a = view.angle * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const wx = view.rx[end] + e.cx * c - e.cy * s;
    const wy = view.ry[end] + e.cx * s + e.cy * c;
    let tx, ty;
    if (m === 'glance') {
        tx = window.innerWidth;
        ty = 0;
    } else {
        const mouse = world.interaction.mouse;
        if (mouse.x < -1e5) return { x: 0, y: 0 };
        tx = mouse.x;
        ty = mouse.y;
    }
    // Into the charm's own (rotated) frame.
    const dx = tx - wx, dy = ty - wy;
    const off = lookOffset(dx * c + dy * s, -dx * s + dy * c, maxR);
    if (m === 'awake' || m === 'happy') {
        off.x += saccade.x * maxR;
        off.y += saccade.y * maxR;
    }
    return off;
}

function updateSaccade(now) {
    const mouse = world.interaction.mouse;
    if (mouse.x !== lastCursorX || mouse.y !== lastCursorY) {
        lastCursorX = mouse.x;
        lastCursorY = mouse.y;
        cursorStill = now;
        saccade = { x: 0, y: 0 };
        return;
    }
    if (world.reducedMotion || now - cursorStill < SACCADE_AFTER_MS || now < nextSaccade) return;
    nextSaccade = now + 700 + Math.random() * 1800;
    saccade = Math.random() < 0.35 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 0.35, y: (Math.random() - 0.5) * 0.25 };
}

function blinkLevel(now) {
    let v = 0;
    blinks = blinks.filter((b) => now < b.at + blinkLength(b.slow));
    for (const b of blinks) v = Math.max(v, blinkClose(now - b.at, b.slow));
    return v;
}

function render(now, dt) {
    updateMood(now);
    updateSaccade(now);
    const m = shownMood();

    // Hover start: double blink. Drag tracking for "released after a long drag".
    const target = world.interaction.target;
    if (target !== hoverView) {
        if (target && eyes.has(target) && mood !== 'sleep') {
            blink(now);
            blink(now + blinkLength() + DOUBLE_BLINK_GAP_MS - 120);
        }
        hoverView = target;
    }
    const dragging = world.interaction.state === 'dragging';
    if (dragging && !wasDragging) dragSince = now;
    wasDragging = dragging;

    if (mood !== 'sleep' && mood !== 'drowsy' && now >= nextBlink) {
        blink(now);
        nextBlink = now + 3000 + Math.random() * 4000;
    }
    const b = blinkLevel(now);

    const look = moodLook(m, mood === 'drowsy' ? (now - moodStart) / DROWSY_MS : 0);
    const kLook = 1 - Math.exp(-dt / LOOK_TAU_S);
    const kLid = 1 - Math.exp(-dt / LID_TAU_S);
    let animating = b > 0 || blinks.length > 0 || mood === 'dizzy' || mood === 'drowsy' || mood === 'wake' ||
        mood === 'startled' || mood === 'wide' || mood === 'glance';

    for (const c of world.charms) {
        const e = eyeOf(c.view);
        if (!e) continue;
        if (e.cat) {
            if (renderCat(c.view, e, now, m, b, kLook)) animating = true;
            continue;
        }
        const t = lookTarget(c.view, e, now, m);
        e.ox += (t.x - e.ox) * kLook;
        e.oy += (t.y - e.oy) * kLook;
        e.top += (look.top - e.top) * kLid;
        e.bottom += (look.bottom - e.bottom) * kLid;
        e.pupilK += (look.pupil - e.pupilK) * kLid;
        if (Math.abs(t.x - e.ox) > EPS || Math.abs(t.y - e.oy) > EPS || Math.abs(look.top - e.top) > 0.003 ||
            Math.abs(look.bottom - e.bottom) > 0.003 || Math.abs(look.pupil - e.pupilK) > 0.003) animating = true;

        const top = Math.min(1, Math.max(e.top, b));
        const bottom = Math.min(1, Math.max(e.bottom, b));
        const key = `${e.ox.toFixed(2)},${e.oy.toFixed(2)},${top.toFixed(3)},${bottom.toFixed(3)},${e.pupilK.toFixed(3)}`;
        if (key === e.drawn) continue;
        e.drawn = key;
        e.irisNode.setAttribute('transform', `translate(${e.ox.toFixed(2)},${e.oy.toFixed(2)})`);
        e.pupil.setAttribute('r', (e.P * e.pupilK).toFixed(2));
        const lt = lidPaths(e, top, true);
        const lb = lidPaths(e, bottom, false);
        e.lidTop.setAttribute('d', lt.fill);
        e.lineTop.setAttribute('d', lt.edge);
        e.lidBottom.setAttribute('d', lb.fill);
        e.lineBottom.setAttribute('d', lb.edge);
        const showTop = top > 0.001 ? '' : 'none';
        const showBottom = bottom > 0.001 ? '' : 'none';
        e.lidTop.style.display = e.lineTop.style.display = showTop;
        e.lidBottom.style.display = e.lineBottom.style.display = showBottom;
    }
    for (const view of eyes.keys()) {
        if (!world.charms.some((c) => c.view === view)) eyes.delete(view);
    }
    if (animating && eyes.size) world.keepAwake?.();
}

registerFeature({
    onInit(w) {
        world = w;
        // Catalog eyes for charm data saved before the `eye` field existed (and the built-in default).
        import('../../charms.js').then(() => {
            const cat = window.DeskCharmCatalog;
            if (!cat) return;
            catalogEyes = new Map();
            for (const g of cat.categories) for (const c of g.charms) if (c.eye) catalogEyes.set(c.id, c.eye);
            w.keepAwake?.();
        }, () => {});

        w.listen('cursor-pos', noteInput);
        for (const type of ['pointerdown', 'pointermove']) window.addEventListener(type, noteInput, { passive: true });

        w.interaction.on('click', (view) => {
            const e = eyes.get(view);
            if (e?.cat) catPoke(e, performance.now());
        });
        // Other features show a brief mood (mood check-in: 'soft' after a low mood, 'happy').
        window.addEventListener('desk:living-mood', (e) => {
            const { mood: m, ms } = e.detail || {};
            if (!['soft', 'happy'].includes(m) || mood === 'sleep') return;
            setMood(m, performance.now(), ms || 4000);
            w.keepAwake?.(ms || 4000);
        });
        w.interaction.on('release', (view) => {
            if (!eyes.has(view) || w.reducedMotion) return;
            const now = performance.now();
            if (view.rope.endSpeed() >= WIDE_SPEED || now - dragSince >= LONG_DRAG_MS) {
                if (mood !== 'dizzy') setMood('wide', now, WIDE_MS);
            }
        });
        w.listen('env-audio-level', (e) => {
            const p = e.payload || {};
            if (p.beat && enabled && !w.hidden) catBeat(performance.now());
            if (w.config.music_sway && p.beat && p.level >= LOUD_BEAT) startle(performance.now());
        });
        w.listen('env-window-move', (e) => {
            const p = e.payload || {};
            if (w.config.window_shake !== false && Math.hypot(p.vx || 0, p.vy || 0) >= SHAKE_STARTLE) startle(performance.now());
        });
    },

    onConfig(cfg) {
        if (cfg.living_charm !== undefined && !!cfg.living_charm !== enabled) {
            enabled = !!cfg.living_charm;
            if (!enabled) hideEyes();
        }
    },

    onStep(w) {
        if (!enabled) return;
        let spin = false;
        for (const c of w.charms) {
            if (!eyes.has(c.view)) continue;
            for (const ev of c.rope.events) {
                if (ev.type === 'wrap' && ev.turns >= DIZZY_TURNS && !w.reducedMotion &&
                    mood !== 'sleep' && mood !== 'drowsy') {
                    setMood('dizzy', performance.now(), DIZZY_HOLD_MS);
                }
            }
            if (c.rope.endSpeed() > 1 || c.rope.held) spin = true;
        }
        spinning = spin;
    },

    onRender(w, now, dt) {
        if (!enabled || w.hidden) return;
        render(now, dt);
    },
});

// Dev console / test harness: force a mood ('awake' | 'happy' | 'wide' | 'dizzy' | 'startled' | 'drowsy' | 'sleep' | 'wake' | 'glance').
if (DEV) window.DeskLiving = {
    mood(m, ms = 0) {
        setMood(m, performance.now(), ms);
        if (m === 'sleep') lastInput = -Infinity;
        world?.keepAwake?.(ms || 1000);
    },
    blink() { blink(performance.now()); world?.keepAwake?.(300); },
    /** Cat faces: a music beat (♪ note + bob) / a click (mew + star twinkle). */
    beat() { catBeat(performance.now()); },
    poke() { for (const e of eyes.values()) if (e.cat) catPoke(e, performance.now()); },
    get state() { return { mood, eyes: eyes.size }; },
};
