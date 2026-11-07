// Festival visitor (Holi): a young runner in a colour-splashed white kurta, drawn from a sprite
// atlas (src/visitors/holi-real.webp + .json: 8 run frames, plus idle, scoop, throw, laugh, wipe).
// He dashes in with a bowl of gulal, scoops a fistful and flings it up in a burst of colour
// (nudging the charms; the powder cloud is SVG), laughs "Bura na mano, Holi hai!", wipes the
// powder off his face and runs on.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/holi-real.json' with { type: 'json' };

const K = 0.3;                    // atlas px → screen px
const S = sprite(META, { image: 'visitors/holi-real.webp', scale: K, shadow: { rx: 30 } });
const COLOURS = ['#ff3d8b', '#ffd21f', '#ff8a1c', '#3a8bff'];

// The throw render is packed with the raised arm inside the figure height; scale it back up.
const POSE_K = { throw: 1.15 };
const HAND = [-135 * 1.15 * K, -475 * 1.15 * K];   // the throwing hand (burst origin), screen px

function build(root) {
    const sp = S.parts.build(root);
    // The burst: puffs that fly up and out from the throwing hand and fade.
    const burst = el('g', { style: 'display:none' }, root);
    const puffs = [];
    for (let i = 0; i < 16; i++) {
        const g = el('g', {}, burst);
        const c = COLOURS[i % 4];
        el('circle', { cx: 0, cy: 0, r: 4.5, fill: c, opacity: 0.85 }, g);
        el('circle', { cx: 2.5, cy: 1.5, r: 3, fill: c, opacity: 0.6 }, g);
        const ang = (-160 + (140 * i) / 15 + ((i * 37) % 11) - 5) * (Math.PI / 180);
        const v = 46 + ((i * 53) % 34);
        puffs.push({ g, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, grow: 1.4 + ((i * 29) % 10) / 8 });
    }
    return { sp, burst, puffs, shown: '' };
}

// pw: burst progress 0 … 1 while puff is 'on'.
const REST = { pose: 'idle', pw: 0, puff: 'off' };

const ACT = [
    [0.00, {}],
    [0.30, { pose: 'scoop' }],
    [0.75, { pose: 'throw', puff: 'on', pw: 0 }],
    [1.25, { pose: 'laugh', pw: 0.45 }],
    [1.85, { pw: 0.92 }],
    [2.05, { pw: 1, puff: 'off' }],
    [2.15, { pose: 'wipe' }],
    [2.95, { pose: 'laugh' }],
    [3.50, {}],
];

registerVisitor({
    id: 'holi',
    name: 'Holi colour runner',
    group: 'festival',
    fact: 'Gulal, the coloured powder of Holi, was traditionally made from flowers.',
    tricks: 'Throws colour that nudges your charm',
    festival: 'holi',
    hello: 'Happy Holi! 🎨',
    speed: 240,
    stride: 190,
    hit: { w: 30, h: Math.round(S.height) },
    reach: S.reach,
    rest: REST,
    act: ACT,
    events: [
        { t: 0.8, run: (ctx) => { ctx.kickCharms(1.5, -0.5); tone(330, 0.04, 0.12, 0, 'triangle'); tone(660, 0.03, 0.25, 0.04, 'sine'); } },
        { t: 1.0, run: (ctx) => ctx.say('Bura na mano, Holi hai! 🌈', 2.5) },
    ],
    build,
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r.sp, p, ctx);
        const pk = p.walkFrame >= 0 ? 0 : POSE_K[p.pose];
        if (pk) r.sp.body.setAttribute('transform', `scale(${pk})`);

        if (p.puff !== r.shown) {
            r.burst.style.display = p.puff === 'on' ? '' : 'none';
            r.shown = p.puff;
        }
        if (p.puff === 'on') {
            const f = (v) => v.toFixed(2);
            const u = Math.min(1, Math.max(0, p.pw));
            const op = (1 - u) * (1 - u * 0.3);
            for (const q of r.puffs) {
                const x = HAND[0] + q.vx * u * 1.3, y = HAND[1] + q.vy * u * 1.3 + 70 * u * u;
                q.g.setAttribute('transform', `translate(${f(x)},${f(y)}) scale(${f(0.5 + q.grow * u)})`);
                q.g.setAttribute('opacity', f(op));
            }
        }
    },
});
