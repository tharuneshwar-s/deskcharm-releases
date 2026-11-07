// Desk visitor: a peacock (sprite atlas src/visitors/peacock-real.webp + .json: 8 strut frames,
// a side idle and two fanned front frames). It struts in, stops, turns to face the viewer, fans
// its train into a shimmering semicircle of eye-spot feathers, folds it and walks on.
// The turn is a quick horizontal squash between the side and front sprites (pose number `sq`).

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/peacock-real.json' with { type: 'json' };

const S = sprite(META, { image: 'visitors/peacock-real.webp', scale: 0.32, fps: 3, shadow: false });
const FAN = 1.35;                 // fanned front sprite's size relative to the side view

const REST = { pose: 'idle', sq: 1, bow: 0 };

const ACT = [
    [0.00, {}],
    [0.20, {}],
    [0.45, { pose: 'fan', sq: 0.15 }],
    [1.35, { sq: 1 }],
    [1.55, { bow: 2 }],
    [2.55, { bow: 0 }],
    [2.75, {}],
    [3.30, { pose: 'idle', sq: 0.15 }],
    [3.80, {}],
];

registerVisitor({
    id: 'peacock',
    name: 'Peacock',
    group: 'everyday',
    fact: 'A peacock’s train can have around 200 feathers, each with its own eye-spot.',
    tricks: 'Fans a little gust at your charm',
    speed: 110,
    stride: 90,                   // px per walk cycle (8 frames)
    hit: { w: 60, h: 130 },
    reach: S.reach,
    rest: REST,
    act: ACT,
    events: [
        { t: 1.3, run: (ctx) => ctx.kickCharms?.(0.8, -1.2) },
        { t: 1.6, run: () => { tone(660, 0.035, 0.25, 0, 'triangle'); tone(880, 0.03, 0.35, 0.18, 'triangle'); } },
    ],
    build(root) {
        const shadow = el('ellipse', { cx: -10, cy: 0, rx: 44, ry: 5, fill: '#000', opacity: 0.18 }, root);
        const fig = el('g', {}, root);
        return { ...S.parts.build(fig), shadow, fig };
    },
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        const fan = p.walkFrame < 0 && p.pose === 'fan';
        const sq = p.walkFrame >= 0 ? 1 : p.sq;
        const sx = (fan ? FAN : 1) * sq, sy = fan ? FAN * (0.6 + 0.4 * sq) : 1;
        r.fig.setAttribute('transform', `translate(0,${(p.bow || 0).toFixed(2)}) scale(${sx.toFixed(3)},${sy.toFixed(3)})`);
        r.shadow.setAttribute('transform', `scale(${(fan ? 0.8 : Math.max(0.4, sq)).toFixed(3)},1)`);
    },
});
