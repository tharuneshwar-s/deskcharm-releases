// Desk visitor (Pongal): a village girl in a red pavadai, green blouse and gold davani carries a
// decorated pongal pot on her hip and a sugarcane stalk over her shoulder. Drawn from a sprite
// atlas (src/visitors/pongal-real.webp + .json: 8 walk frames, idle, potdown, celebrate, pickup).
// Act: sets the pot down → it boils over (animated SVG foam over the pot) → arms up,
// "Pongalo Pongal!" → picks the pot up again and walks on.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/pongal-real.json' with { type: 'json' };

const K = 0.34;
const S = sprite(META, { image: 'visitors/pongal-real.webp', scale: K, shadow: { rx: 44 } });

// Pot mouth in the `celebrate` cell, relative to the feet (atlas px), and its half-width.
const MOUTH_X = 63, MOUTH_Y = -100, MOUTH_R = 25;

/** Boil-over foam drawn around (0, 0) = centre of the pot mouth, mouth half-width 11 units. */
function buildFoam(parent) {
    const foam = el('g', { opacity: 0 }, parent);
    const dome = el('g', {}, foam);
    el('path', { d: 'M-11,0 Q-13,-8 -6,-9 Q-3,-15 3,-12 Q10,-13 11,-6 Q14,-2 11,0 Z', fill: '#fff', stroke: '#c9d6e2', 'stroke-width': 1 }, dome);
    el('path', { d: 'M-11,0 Q-14,7 -12,13 Q-9,7 -8,1 Z M10,0 Q14,8 12,14 Q9,7 7,1 Z', fill: '#fff', stroke: '#c9d6e2', 'stroke-width': 1 }, dome);
    el('path', { d: 'M-6,-5 Q0,-8 6,-5', fill: 'none', stroke: '#e6ecf2', 'stroke-width': 1.4 }, dome);
    const bubbles = [];
    for (let i = 0; i < 8; i++) bubbles.push(el('circle', { cx: 0, cy: 0, r: 2.6 + (i % 3) * 1.2, fill: '#fff', stroke: '#b9c8d6', 'stroke-width': 0.9 }, foam));
    return { foam, dome, bubbles };
}

const REST = { pose: 'idle', foam: 0 };

const ACT = [
    [0.00, {}],
    [0.20, { pose: 'potdown' }],
    [1.05, { pose: 'celebrate' }],
    [1.25, { foam: 0.3 }],
    [1.70, { foam: 1 }],
    [3.00, { foam: 0.8 }],
    [3.15, { pose: 'pickup', foam: 0 }],
    [3.85, { pose: 'pickup' }],
    [4.05, {}],
];

const SAY_AT = 1.7;

registerVisitor({
    id: 'pongal',
    name: 'Pongal pot carrier',
    group: 'festival',
    fact: 'Letting the Pongal pot boil over is a wish for a year of plenty.',
    festival: 'pongal',
    hello: 'Happy Pongal! 🌾',
    yelp: 'Aiyo! The pot! 😱',
    speed: 95,
    stride: 90,
    hit: { w: 40, h: Math.round(S.height) },
    reach: S.reach,
    rest: REST,
    act: ACT,
    events: [{
        t: SAY_AT,
        run(ctx) {
            ctx.say('Pongalo Pongal! 🎉', 2.5);
            [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.04, 0.22, i * 0.12, 'triangle'));
        },
    }],
    build(root) {
        const parts = S.parts.build(root);
        const s = MOUTH_R / 11 * K;
        const at = el('g', { transform: `translate(${MOUTH_X * K},${MOUTH_Y * K}) scale(${s.toFixed(3)})` }, root);
        return { ...parts, ...buildFoam(at) };
    },
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        const f = (v) => v.toFixed(2);
        const on = p.foam > 0.01 && p.walkFrame < 0 && p.pose === 'celebrate';
        r.foam.setAttribute('opacity', on ? f(Math.min(1, p.foam * 1.6)) : '0');
        if (!on) return;
        // boil over: the dome swells, bubbles rise from the rim and pop
        r.dome.setAttribute('transform', `scale(${f(0.7 + 0.6 * p.foam)},${f(0.5 + 0.9 * p.foam + 0.08 * Math.sin(ctx.t * 14))})`);
        r.bubbles.forEach((b, i) => {
            const u = (ctx.t * 0.9 + i / 8) % 1;
            const side = i % 2 ? 1 : -1;
            b.setAttribute('transform', `translate(${f(side * (2 + i * 1.6) + side * u * 8)},${f(-9 - u * 40 * p.foam)}) scale(${f(0.5 + u * 0.7)})`);
            b.setAttribute('opacity', f(p.foam * (1 - u)));
        });
    },
});
