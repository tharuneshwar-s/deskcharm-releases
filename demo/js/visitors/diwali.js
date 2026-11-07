// Festival visitor (Diwali): a small boy in a marigold kurta, drawn from a sprite atlas
// (src/visitors/diwali-real.webp + .json: 8 walk frames, plus idle, setdown, namaste, light, proud).
// He carefully carries a lit clay diya, sets it down, does namaste, lights a second diya from the
// first (tiny spark), wishes "Happy Diwali", picks the first one up again and walks on; the second
// stays behind and fades. Flames, glow and the clay lamps on the ground are SVG drawn over the
// sprite at the diya positions.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/diwali-real.json' with { type: 'json' };

const K = 0.235;                  // atlas px → screen px
const S = sprite(META, { image: 'visitors/diwali-real.webp', scale: K, shadow: { rx: 26 } });
const CLAY = '#b4532a', CLAY_SH = '#8a3a1c', CLAY_HI = '#d77a45';
const DIYA = 0.6;                 // SVG diya scale (matches the clay lamp in the renders)

// Crouching renders are packed at full figure height; shrink them to the standing boy's scale.
const POSE_K = { setdown: 0.62, light: 0.62 };
// Rim of the diya in his hands per pose, atlas px from the feet (before POSE_K).
const HELD = { idle: [18, -333], walk: [81, -320], setdown: [122, -33], light: [129, -136] };
const D1X = 76, D2X = 112;        // ground diyas, atlas px from the feet (standing scale)

function diya(parent) {
    const g = el('g', {}, parent);
    const glow = el('circle', { cx: 0, cy: -12, r: 13, fill: '#ffcf4a', opacity: 0 }, g);
    const flame = el('g', {}, g);
    el('path', { d: 'M0,-13 C3.5,-7 4.5,-3 3.2,-0.8 Q0,1.6 -3.2,-0.8 C-4.5,-3 -3.5,-7 0,-13 Z', fill: '#ff8a1c' }, flame);
    el('path', { d: 'M0,-9.5 C2.4,-5.2 2.9,-2.6 2,-1 Q0,0.6 -2,-1 C-2.9,-2.6 -2.4,-5.2 0,-9.5 Z', fill: '#ffd23a' }, flame);
    el('path', { d: 'M0,-5.2 C1.2,-3 1.3,-1.6 0.8,-0.8 Q0,-0.2 -0.8,-0.8 C-1.3,-1.6 -1.2,-3 0,-5.2 Z', fill: '#fff8de' }, flame);
    const clay = el('g', {}, g);
    el('path', { d: 'M-9,-5 Q-8,0.5 0,0.5 Q8,0.5 9,-5 Z', fill: CLAY }, clay);
    el('path', { d: 'M-4,0.3 Q0,1.2 4,0.3 L3,-1.5 L-3,-1.5 Z', fill: CLAY_SH }, clay);
    el('ellipse', { cx: 0, cy: -5, rx: 9, ry: 2, fill: CLAY_HI }, clay);
    el('ellipse', { cx: 0, cy: -5, rx: 6.5, ry: 1.1, fill: '#5a2412' }, clay);
    el('path', { d: 'M9,-5 L12,-6.5 L9.5,-4 Z', fill: CLAY }, clay);
    return { g, glow, flame, clay };
}

function build(root) {
    const sp = S.parts.build(root);
    const diyas = [diya(root), diya(root)];
    const spark = el('g', { style: 'display:none' }, root);
    el('path', { d: 'M0,-5 L1.2,-1.2 L5,0 L1.2,1.2 L0,5 L-1.2,1.2 L-5,0 L-1.2,-1.2 Z', fill: '#fff3a8' }, spark);
    el('circle', { cx: 0, cy: 0, r: 1.6, fill: '#fff' }, spark);
    return { sp, diyas, spark, clock: 0 };
}

/** Screen position of the diya rim in his hands for this frame's pose. */
function heldAt(p) {
    const key = p.walkFrame >= 0 ? 'walk' : p.pose;
    const [x, y] = HELD[key] || HELD.idle;
    const k = (p.walkFrame >= 0 ? 1 : POSE_K[p.pose] || 1) * K;
    return [x * k, y * k];
}

// h1 / h2: where each diya is: 'hand' (carried, clay in the render), 'ground', 'off' (h2 only).
const REST = { pose: 'idle', lit1: 1, lit2: 0, op2: 0, glow: 0, spark: 0, h1: 'hand', h2: 'off' };

const ACT = [
    [0.00, {}],
    [0.35, { pose: 'setdown' }],
    [1.05, { h1: 'ground', glow: 1 }],
    [1.40, { pose: 'namaste' }],
    [2.25, { pose: 'light', h2: 'hand', op2: 1 }],
    [2.90, { spark: 0 }],
    [3.00, { spark: 1, lit2: 1 }],
    [3.25, { spark: 0 }],
    [3.40, { pose: 'proud', h2: 'ground', glow: 1 }],
    [4.60, { pose: 'setdown' }],
    [5.10, { pose: 'idle', h1: 'hand' }],
    [5.70, { op2: 0.15, glow: 0 }],
];

registerVisitor({
    id: 'diwali',
    name: 'Diwali lamp kid',
    group: 'festival',
    fact: 'Diyas are small clay lamps, lit in rows to welcome light on Diwali.',
    festival: 'diwali',
    hello: 'Happy Diwali! 🪔',
    speed: 62,
    stride: 70,
    hit: { w: 26, h: Math.round(S.height) },
    reach: S.reach,
    rest: REST,
    act: ACT,
    events: [
        { t: 3.0, run: () => { tone(1568, 0.03, 0.25); tone(2093, 0.02, 0.35, 0.05); } },
        { t: 3.5, run: (ctx) => ctx.say('Happy Diwali! ✨', 2.5) },
    ],
    build,
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r.sp, p, ctx);
        const pk = p.walkFrame >= 0 ? 1 : POSE_K[p.pose];
        if (pk) r.sp.body.setAttribute('transform', `scale(${pk})`);

        const f = (v) => v.toFixed(2);
        r.clock += Math.min(ctx.dt || 0, 0.05);
        const t = r.clock;
        const hand = heldAt(p);
        // In the setdown pose the render's own diya sits where the ground one goes: draw no clay.
        const groundClay = p.pose !== 'setdown' || p.walkFrame >= 0;
        const place = [
            p.h1 === 'hand' ? hand : [D1X * K, 0],
            p.h2 === 'hand' ? hand : [D2X * K, 0],
        ];
        const pulse = 0.22 + 0.08 * Math.sin(t * 3.1);
        r.diyas.forEach((d, i) => {
            const where = i === 0 ? p.h1 : p.h2;
            d.g.style.display = where === 'off' ? 'none' : '';
            if (where === 'off') return;
            const ground = where === 'ground';
            d.clay.style.display = ground && groundClay ? '' : 'none';
            const [x, y] = place[i];
            const lit = i === 0 ? p.lit1 : p.lit2;
            // Hand positions are the rim; the SVG diya's rim sits 5 units above its origin.
            d.g.setAttribute('transform', `translate(${f(x)},${f(ground ? y : y + 5 * DIYA)}) scale(${DIYA})`);
            d.g.setAttribute('opacity', f(i === 0 ? 1 : p.op2));
            // Smooth flicker: sums of sines on the running clock (no per-frame jitter).
            const ph = t + i * 1.7;
            const sy = lit * (1 + 0.1 * Math.sin(ph * 11) + 0.05 * Math.sin(ph * 17.3));
            const sx = lit * (1 - 0.05 * Math.sin(ph * 11 + 0.6));
            const rot = 5 * Math.sin(ph * 6.3) + 2 * Math.sin(ph * 13.1);
            d.flame.setAttribute('transform', `translate(0,-5.5) rotate(${f(rot)}) scale(${f(Math.max(0.001, sx))},${f(Math.max(0.001, sy))})`);
            const glow = ground ? p.glow : 0.7;
            d.glow.setAttribute('opacity', f(lit * glow * (pulse + 0.05 * Math.sin(t * 5.3 + i))));
            d.glow.setAttribute('transform', `translate(0,-5) scale(${f(1 + 0.08 * Math.sin(t * 3.1 + i))}) translate(0,5)`);
        });
        if (p.spark > 0.02) {
            r.spark.style.display = '';
            const [x, y] = place[1];
            r.spark.setAttribute('transform', `translate(${f(x)},${f(y + 2)}) rotate(${f(t * 400)}) scale(${f(p.spark * 0.7)})`);
        } else r.spark.style.display = 'none';
    },
});
