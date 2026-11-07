// Desk visitor (Christmas): a little reindeer with a glowing red nose, a jingle-bell collar and a
// gift box on its back. Drawn from a sprite atlas (src/visitors/christmas-real.webp + .json:
// 8 trot frames, idle, hop, a 2-frame shake and the gift opening); the nose glow and the burst of
// snowflakes and stars are SVG overlays.
// Act: nose glows → a hop → shakes so the bells jingle → the gift pops open and snowflakes and
// stars fly out → "Merry Christmas!" → trots on.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import ATLAS from '../../visitors/christmas-real.json' with { type: 'json' };

// The packer scales `hop` together with a copy of `idle` (so the tucked leap keeps the standing
// size); only its second cell is the hop.
const META = { ...ATLAS, clips: { ...ATLAS.clips, hop: ATLAS.clips.hop.slice(1) } };
const K = 0.36;
const S = sprite(META, { image: 'visitors/christmas-real.webp', scale: K, shadow: { rx: 54 } });

// Nose (idle / trot / hop cells) and the gift box top (gift cell), atlas px from the feet.
const NOSE = [121, -269], GIFT = [-60, -296];
const GOLD = '#f2c14a';

function star(parent, fill) {
    return el('path', { d: 'M0,-5 L1.4,-1.6 L5,-1.5 L2.2,0.9 L3.1,4.5 L0,2.5 L-3.1,4.5 L-2.2,0.9 L-5,-1.5 L-1.4,-1.6 Z', fill }, parent);
}

function flake(parent) {
    const g = el('g', {}, parent);
    el('path', { d: 'M0,-5 L0,5 M-4.3,-2.5 L4.3,2.5 M-4.3,2.5 L4.3,-2.5', stroke: '#7fb6e6', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, g);
    el('circle', { r: 1.4, fill: '#bfe0fb' }, g);
    return g;
}

const REST = { pose: 'idle', nose: 0.3, lift: 0 };

const ACT = [
    [0.00, {}],
    [0.35, { nose: 1 }],
    [0.65, { pose: 'hop' }],
    [0.82, { lift: 26 }],
    [1.05, { pose: 'idle', lift: 0 }],
    [1.30, { pose: 'shake' }],
    [2.00, { pose: 'gift', nose: 0.6 }],
    [3.20, { pose: 'idle' }],
    [3.50, {}],
];

const BURST_AT = 2.0, BURST_S = 1.1;

function jingle(delay) {
    [2350, 2050, 2600].forEach((f, i) => tone(f, 0.03, 0.12, delay + i * 0.06, 'triangle'));
}

registerVisitor({
    id: 'christmas',
    name: 'Reindeer',
    group: 'festival',
    fact: 'Reindeer are the only deer where both males and females grow antlers.',
    festival: 'christmas',
    hello: 'Ho ho ho! 🎄',
    yelp: 'Eep! 🦌',
    speed: 130,
    stride: 110,
    hit: { w: 60, h: Math.round(S.height) },
    reach: S.reach,
    rest: REST,
    act: ACT,
    events: [
        { t: 1.32, run() { jingle(0); } },
        { t: 1.62, run() { jingle(0); } },
        { t: BURST_AT, run(ctx) { ctx.say('Merry Christmas! 🎁', 2.5); tone(1568, 0.03, 0.3, 0, 'sine'); tone(2093, 0.025, 0.4, 0.08, 'sine'); } },
    ],
    build(root) {
        const parts = S.parts.build(root);
        const fx = el('g', {}, root);
        const glow = el('circle', { cx: NOSE[0] * K, cy: NOSE[1] * K, r: 9, fill: '#ff5a4a', opacity: 0.25 }, fx);
        const glow2 = el('circle', { cx: NOSE[0] * K, cy: NOSE[1] * K, r: 6, fill: '#ff7a6a', opacity: 0.3 }, fx);
        const burst = el('g', { transform: `translate(${GIFT[0] * K},${GIFT[1] * K})`, style: 'display:none' }, root);
        const sparks = [];
        for (let i = 0; i < 7; i++) sparks.push(i % 2 ? star(burst, i % 4 === 1 ? GOLD : '#ffb020') : flake(burst));
        return { ...parts, fx, glow, glow2, burst, sparks };
    },
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        const f = (v) => v.toFixed(2);
        if (p.lift > 0.01) r.body.setAttribute('transform', `translate(0,${f(-p.lift)}) ${r.body.getAttribute('transform') || ''}`);
        // nose glow pulse (the nose faces forward in the idle, trot and hop cells)
        const facing = p.walkFrame >= 0 || p.pose === 'idle' || p.pose === 'hop';
        r.fx.style.display = facing ? '' : 'none';
        if (facing) {
            const g = p.nose * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(ctx.t * 5)));
            const x = NOSE[0] * K, y = NOSE[1] * K;
            r.fx.setAttribute('transform', `translate(0,${f(-p.lift)})`);
            r.glow.setAttribute('opacity', f(0.12 + 0.35 * g));
            r.glow.setAttribute('transform', `translate(${f(x)},${f(y)}) scale(${f(0.8 + 0.7 * g)}) translate(${f(-x)},${f(-y)})`);
            r.glow2.setAttribute('opacity', f(0.15 + 0.4 * g));
        }
        // the gift's burst of snowflakes and stars
        const u = ctx.mode === 'act' ? (ctx.t - BURST_AT) / BURST_S : -1;
        const on = u > 0 && u < 1;
        r.burst.style.display = on ? '' : 'none';
        if (on) {
            r.sparks.forEach((s, i) => {
                const a = (-90 + (i - 3) * 22) * Math.PI / 180;
                const d = 10 + 55 * Math.sqrt(u) * (0.75 + 0.1 * (i % 3));
                s.setAttribute('transform', `translate(${f(Math.cos(a) * d)},${f(Math.sin(a) * d)}) rotate(${f(u * 200 * (i % 2 ? 1 : -1))}) scale(${f(0.6 + 0.6 * Math.min(1, u * 4))})`);
                s.setAttribute('opacity', f(Math.min(1, u * 6) * (1 - u * u)));
            });
        }
    },
});
