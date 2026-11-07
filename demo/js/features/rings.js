// Small progress rings beside the main charm's hook: today's water glasses (features/water.js)
// and up to MAX_COUNTER_RINGS counters with ring:true (features/counters.js). Up to MAX_RINGS sit
// in one row along the top edge, right of the hook (left of it near the screen's right edge;
// ringLayout), so they never cover the charm.
// Each shows its droplet or emoji inside the ring and "n/goal" beside it; the arc turns green
// at the goal. A pulse (quick grow + brighter; only the brightness with reduced motion) marks
// a new count, and a short cue line shows under the ring. Hidden while smart hiding.
// The overlay is kept awake only while a pulse or cue animates.
//
// API: setRing(key, item | null) with item { order, icon: 'drop' | emoji, color, get() → { n, goal } };
// pulseRing(key, world, cue?) after a count (cue: already-translated text, '' for none).

import { registerFeature } from '../features.js';

const SVGNS = 'http://www.w3.org/2000/svg';
export const MAX_RINGS = 3;
export const MAX_COUNTER_RINGS = 2;
export const RING_DX = 17;        // first ring centre, right of the hook
export const RING_Y = 13;
export const RING_R = 6.5;
export const SLOT_W = 52;         // ring + its "n/goal" label + gap
const RING_LEN = 2 * Math.PI * RING_R;
const CUE_DY = RING_R + 13;       // cue line baseline under the row
export const PULSE_MS = 900;
export const CUE_MS = 2600;
export const C_DONE = '#7fe0c0';

const items = new Map();          // key → item
const pulses = new Map();         // key → { at, cue, until }
let pool = [];                    // ring DOM groups
let cueNode = null;
let shown = '';

const LABEL_W = 28;              // widest "n/goal" label ("50/50")

/**
 * Ring centres (relative to the hook x) for `count` rings: one row right of the hook, or, when
 * that would run past the screen's right edge (`roomRight` px from the hook), left of it (each
 * label still right of its ring, the last one ending clear of the hook).
 */
export function ringLayout(count, roomRight = Infinity) {
    const n = Math.min(count, MAX_RINGS);
    const right = RING_DX + (n - 1) * SLOT_W + RING_R + 5 + LABEL_W;
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ x: right <= roomRight ? RING_DX + i * SLOT_W : -(RING_DX + RING_R + 5 + LABEL_W) - (n - 1 - i) * SLOT_W, y: RING_Y });
    }
    return out;
}

/** Pulse shape over 0…1 of PULSE_MS: quick rise, slow settle. */
export function pulseLevel(f) {
    if (f < 0 || f >= 1) return 0;
    return f < 0.2 ? f / 0.2 : (1 - f) / 0.8;
}

/** The rings to draw, in order (water first), at most MAX_RINGS. */
export function visibleRings(list) {
    return list.slice().sort((a, b) => a.order - b.order).slice(0, MAX_RINGS);
}

export function setRing(key, item) {
    if (item) items.set(key, { ...item, key });
    else { items.delete(key); pulses.delete(key); }
    shown = '';
}

export function pulseRing(key, world, cue = '') {
    const at = performance.now();
    pulses.set(key, { at, cue, until: cue ? at + CUE_MS : 0 });
    world?.keepAwake?.((cue ? CUE_MS : PULSE_MS) + 100);
}

function svg(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    parent.appendChild(node);
    return node;
}

const TEXT_STYLE = 'font-family: system-ui, "Segoe UI", "Segoe UI Emoji", sans-serif; font-variant-numeric: tabular-nums';

function createRing(layer) {
    const g = svg('g', { 'pointer-events': 'none', style: 'display:none' }, layer);
    const body = svg('g', {}, g);
    svg('circle', { r: RING_R, fill: 'rgba(12,16,28,0.28)', stroke: 'rgba(12,16,28,0.25)', 'stroke-width': 3.5 }, body);
    svg('circle', { r: RING_R, fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 1.4 }, body);
    const arc = svg('circle', {
        r: RING_R, fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round',
        transform: 'rotate(-90)', 'stroke-dasharray': `0 ${RING_LEN}`,
    }, body);
    const drop = svg('path', { d: 'M0,-3.6 C1.6,-1.4 2.6,0 2.6,1.1 A2.6,2.6 0 0 1 -2.6,1.1 C-2.6,0 -1.6,-1.4 0,-3.6 Z' }, body);
    const emoji = svg('text', { 'text-anchor': 'middle', y: 2.9, 'font-size': 7.5, style: TEXT_STYLE }, body);
    const label = svg('text', {
        x: RING_R + 5, y: 3.6, 'font-size': 10.5, 'font-weight': 600, fill: 'rgba(255,255,255,0.82)',
        stroke: 'rgba(12,16,28,0.55)', 'stroke-width': 2.6, 'paint-order': 'stroke', style: TEXT_STYLE,
    }, g);
    return { g, body, arc, drop, emoji, label };
}

function render(world, now) {
    if (!pool.length) return;
    const list = world.hidden || !world.charms.length ? [] : visibleRings([...items.values()]);
    const x0 = world.anchorX ? world.anchorX(0) : 0;
    const viewW = window.innerWidth || Infinity;
    const pos = ringLayout(list.length, viewW - x0);
    const left = pos.length > 0 && pos[0].x < 0;
    const states = list.map((it) => {
        const { n, goal } = it.get();
        const p = pulses.get(it.key);
        return { it, n, goal, p: p ? pulseLevel((now - p.at) / PULSE_MS) : 0, cue: p && now < p.until ? p.cue : '' };
    });
    let loose = '';                // a cue for something without a ring (a counter with ring off)
    if (!world.hidden) {
        for (const [k, p] of pulses) if (now < p.until && !list.some((it) => it.key === k)) { loose = p.cue; break; }
    }
    const key = `${x0}|${viewW}|${world.reducedMotion}|${loose}|` + states.map((s) => `${s.it.key}:${s.it.icon}:${s.n}/${s.goal}:${s.p.toFixed(3)}:${s.cue}`).join('|');
    if (key === shown) return;
    shown = key;

    let cue = null;
    pool.forEach((r, i) => {
        const s = states[i];
        if (!s) { r.g.style.display = 'none'; return; }
        const goal = Math.max(1, s.goal);
        const done = s.n >= goal;
        const frac = Math.min(1, s.n / goal);
        const color = done ? C_DONE : s.it.color;
        r.g.style.display = '';
        r.g.setAttribute('transform', `translate(${(x0 + pos[i].x).toFixed(1)},${pos[i].y})`);
        r.arc.setAttribute('stroke-dasharray', `${(frac * RING_LEN).toFixed(2)} ${RING_LEN.toFixed(2)}`);
        r.arc.setAttribute('stroke', color);
        r.arc.style.display = frac > 0 ? '' : 'none';
        const isDrop = s.it.icon === 'drop';
        r.drop.style.display = isDrop ? '' : 'none';
        r.drop.setAttribute('fill', color);
        r.drop.setAttribute('opacity', (0.75 + 0.25 * s.p).toFixed(3));
        r.emoji.style.display = isDrop ? 'none' : '';
        r.emoji.textContent = isDrop ? '' : s.it.icon;
        r.body.setAttribute('transform', world.reducedMotion || s.p === 0 ? '' : `scale(${(1 + 0.22 * s.p).toFixed(3)})`);
        r.g.setAttribute('opacity', (0.78 + 0.22 * s.p).toFixed(3));
        r.label.textContent = `${s.n}/${s.goal}`;
        if (s.cue && !cue) cue = s.cue;
    });
    if (!cue) cue = loose;
    // The cue line sits under the row, starting at its hook-side end (cue text runs away from the hook,
    // or toward it when the row had to go left near the screen edge).
    const roomy = ringLayout(MAX_RINGS, viewW - x0)[0].x > 0;
    cueNode.style.display = cue ? '' : 'none';
    if (cue) {
        cueNode.setAttribute('x', (roomy && !left ? x0 + RING_DX - RING_R : x0 - 8).toFixed(1));
        cueNode.setAttribute('text-anchor', roomy && !left ? 'start' : 'end');
        cueNode.textContent = cue;
    }
}

registerFeature({
    onInit(world) {
        if (!world.layers?.ui) return;
        for (let i = 0; i < MAX_RINGS; i++) pool.push(createRing(world.layers.ui));
        cueNode = svg('text', {
            y: RING_Y + CUE_DY, 'font-size': 10.5, 'font-weight': 600, fill: 'rgba(255,255,255,0.9)',
            stroke: 'rgba(12,16,28,0.55)', 'stroke-width': 2.6, 'paint-order': 'stroke', style: `display:none; ${TEXT_STYLE}`,
            'pointer-events': 'none',
        }, world.layers.ui);
    },
    onConfig() { shown = ''; },
    onRender(world, now) { render(world, now); },
});
