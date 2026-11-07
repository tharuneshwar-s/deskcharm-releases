// Smash-to-calm: rapid clicks on a charm build "stress energy", shown as a thin ring filling
// around it. At full the ring releases a sparkle burst and a calming chord, and the charm
// settles. Energy drains slowly once the clicking stops.

import { registerFeature } from '../features.js';
import { smashTap, calmChord } from '../audio.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const FIXED_DT = 1 / 120;

const RAPID_WINDOW_MS = 1200;     // clicks this close together count as "rapid"
const RAPID_CLICKS = 3;           // energy builds from the 3rd rapid click on
const ENERGY_PER_CLICK = 0.1;
const DECAY_DELAY_MS = 1200;      // energy holds this long after the last click...
const DECAY_PER_S = 0.12;         // ...then drains slowly
const TAP_KICK = 1.2;             // px/step nudge each click gives the charm
const SETTLE_S = 1.6;             // extra damping after the release
const SETTLE_KEEP = 0.9;          // velocity kept per step at the start of settling
const RING_GAP = 10;              // ring radius beyond the charm body
const FLASH_S = 0.6;              // released ring expands and fades over this long
const BURST_COUNT = 28;
const RING_EMPTY = [168, 216, 255];   // soft blue while filling starts...
const RING_FULL = [255, 210, 122];    // ...warming to gold when full

/** Per-charm state, keyed by CharmView. */
const states = new Map();
/** Live sparkle particles. */
const particles = [];
let layer = null;

function el(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

function stateFor(view) {
    let st = states.get(view);
    if (!st) {
        const g = el('g', { style: 'display:none', 'pointer-events': 'none' }, layer);
        st = {
            clicks: [],
            energy: 0,
            shown: 0,
            lastClick: 0,
            settle: 0,
            flash: 0,
            g,
            track: el('circle', { fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.18, 'stroke-width': 1.2 }, g),
            arc: el('circle', { fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', transform: 'rotate(-90)' }, g),
        };
        states.set(view, st);
    }
    return st;
}

function mixColor(t) {
    return `rgb(${RING_EMPTY.map((c, i) => Math.round(c + (RING_FULL[i] - c) * t)).join(',')})`;
}

function onClick(world, view) {
    const charm = world.charms.find((c) => c.view === view);
    if (!charm) return;
    const st = stateFor(view);
    const now = performance.now();
    st.clicks = st.clicks.filter((t) => now - t < RAPID_WINDOW_MS);
    st.clicks.push(now);
    st.lastClick = now;
    if (st.clicks.length < 2) return;

    if (st.clicks.length >= RAPID_CLICKS) st.energy = Math.min(1, st.energy + ENERGY_PER_CLICK);
    smashTap(st.energy);

    // Each rapid click knocks the charm a little, more as the energy builds.
    const rope = charm.rope;
    const side = Math.random() < 0.5 ? -1 : 1;
    const kick = TAP_KICK * (0.6 + 0.6 * st.energy);
    for (let i = rope.end - 1; i <= rope.end; i++) {
        rope.ox[i] -= side * kick;
        rope.oy[i] += kick * 0.5;
    }

    if (st.energy >= 1) {
        release(view, st, world.reducedMotion);
        world.emit('insights-event', { kind: 'stress-release' });
    }
}

/** Full ring: sparkles (not with reduced motion), chord, settle. */
function release(view, st, reduced) {
    st.energy = 0;
    st.clicks = [];
    st.flash = 1;
    st.settle = SETTLE_S;
    calmChord();
    if (reduced) return;

    const c = view.bodyCenter();
    const r = view.bodyRadius();
    const palette = [view.glow.getAttribute('fill') || '#73ccfa', '#fff6d8', '#ffd27a', '#ffffff'];
    for (let i = 0; i < BURST_COUNT; i++) {
        const a = (i / BURST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 140 + Math.random() * 180;
        const size = 2.5 + Math.random() * 3;
        const color = palette[i % palette.length];
        const node = i % 3 === 0
            ? el('circle', { r: (size * 0.5).toFixed(2), fill: color }, layer)
            : el('path', { d: starPath(size), fill: color }, layer);
        node.setAttribute('pointer-events', 'none');
        const life = 0.7 + Math.random() * 0.5;
        particles.push({
            node,
            x: c.x + Math.cos(a) * r * 0.6,
            y: c.y + Math.sin(a) * r * 0.6,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            rot: Math.random() * 90,
            spin: (Math.random() - 0.5) * 360,
            life,
            max: life,
        });
    }
}

/** Four-point sparkle of radius s. */
function starPath(s) {
    const k = s * 0.28;
    const f = (v) => v.toFixed(2);
    return `M0,${f(-s)}L${f(k)},${f(-k)}L${f(s)},0L${f(k)},${f(k)}L0,${f(s)}L${f(-k)},${f(k)}L${f(-s)},0L${f(-k)},${f(-k)}Z`;
}

function renderRing(view, st, now, dt, reduced) {
    if (now - st.lastClick > DECAY_DELAY_MS) st.energy = Math.max(0, st.energy - DECAY_PER_S * dt);
    st.shown += (st.energy - st.shown) * Math.min(1, dt * 10);
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt / FLASH_S);

    if (st.shown < 0.005 && st.flash <= 0) {
        st.shown = 0;
        st.g.style.display = 'none';
        return;
    }
    const c = view.bodyCenter();
    const base = view.bodyRadius() + RING_GAP;
    st.g.style.display = '';
    st.g.setAttribute('transform', `translate(${c.x.toFixed(1)},${c.y.toFixed(1)})`);

    if (st.flash > 0) {
        // Released: the full ring swells outward and fades (reduced motion: fades in place).
        const r = base * (reduced ? 1 : 1 + 0.5 * (1 - st.flash));
        st.track.setAttribute('r', r.toFixed(1));
        st.track.setAttribute('stroke-opacity', 0);
        st.arc.setAttribute('r', r.toFixed(1));
        st.arc.setAttribute('stroke', mixColor(1));
        st.arc.setAttribute('stroke-dasharray', 'none');
        st.arc.setAttribute('opacity', (st.flash * st.flash).toFixed(3));
        if (st.energy > 0) st.flash = 0; // clicking again: back to filling
        return;
    }
    const circ = 2 * Math.PI * base;
    const fade = Math.min(1, st.shown * 6);
    // Near full, the ring breathes slightly to show it's about to release (steady when reduced).
    const pulse = st.shown > 0.8 && !reduced ? 0.85 + 0.15 * Math.sin(now / 90) : 1;
    st.track.setAttribute('r', base.toFixed(1));
    st.track.setAttribute('stroke-opacity', (0.18 * fade).toFixed(3));
    st.arc.setAttribute('r', base.toFixed(1));
    st.arc.setAttribute('stroke', mixColor(st.shown));
    st.arc.setAttribute('stroke-dasharray', `${(circ * st.shown).toFixed(1)} ${circ.toFixed(1)}`);
    st.arc.setAttribute('opacity', (fade * pulse).toFixed(3));
}

function renderParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
            p.node.remove();
            particles.splice(i, 1);
            continue;
        }
        const drag = Math.max(0, 1 - 2.2 * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + 70 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        const t = p.life / p.max;
        p.node.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${p.rot.toFixed(1)}) scale(${(0.4 + 0.6 * t).toFixed(3)})`);
        p.node.setAttribute('opacity', Math.pow(t, 0.7).toFixed(3));
    }
}

registerFeature({
    onInit(world) {
        layer = world.layers.front;
        world.interaction.on('click', (view) => onClick(world, view));
    },

    /** After a release the charm settles: velocities are damped hard, easing off over SETTLE_S. */
    onStep(world) {
        for (const c of world.charms) {
            const st = states.get(c.view);
            if (!st || st.settle <= 0) continue;
            const rope = c.rope;
            if (rope.held) {
                st.settle = 0;
                continue;
            }
            const keep = SETTLE_KEEP + (1 - SETTLE_KEEP) * (1 - st.settle / SETTLE_S);
            for (let i = 1; i < rope.n; i++) {
                rope.ox[i] = rope.px[i] - (rope.px[i] - rope.ox[i]) * keep;
                rope.oy[i] = rope.py[i] - (rope.py[i] - rope.oy[i]) * keep;
            }
            st.settle -= FIXED_DT;
        }
    },

    onRender(world, now, dt) {
        for (const [view, st] of states) {
            if (!world.charms.some((c) => c.view === view)) {
                // Charm removed (second charm turned off): drop its ring.
                st.g.remove();
                states.delete(view);
                continue;
            }
            renderRing(view, st, now, dt, world.reducedMotion);
        }
        if (particles.length) renderParticles(dt);
        for (const st of states.values()) {
            if (st.energy > 0 || st.shown >= 0.005 || st.flash > 0 || st.settle > 0) {
                world.keepAwake?.();
                break;
            }
        }
        if (particles.length) world.keepAwake?.();
    },
});
