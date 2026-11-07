// Desk visitor: a baby elephant in a little red-and-gold headcloth, drawn from a sprite atlas
// (src/visitors/elephant-real.webp + .json: idle, 8 walk frames, trumpet, spray, stomp).
// Stops, lifts its trunk and trumpets, sprays a small arc of water (nudging the charm),
// stomps happily, walks on. The water droplets are SVG circles drawn over the sprite.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import ATLAS from '../../visitors/elephant-real.json' with { type: 'json' };

// The packer puts every frame in one height-matched clip ("all") so poses keep a shared scale.
const A = ATLAS.clips.all;
const META = { ...ATLAS, clips: { idle: [A[0]], walk: A.slice(1, 9), trumpet: [A[9]], spray: [A[10]], stomp: [A[11]] } };
const SCALE = 0.3;
const S = sprite(META, { image: 'visitors/elephant-real.webp', scale: SCALE, shadow: { rx: 62 } });

const WATER = '#7cc4ec';
const DROPS = 10;
// Trunk tip of the spray pose, in atlas px from the feet anchor (cell centre, feetY).
const TIP = [228 * SCALE, -404 * SCALE];

const T_TRUMPET = 0.3, T_SPRAY = 1.4, T_STOMP = 2.6, T_END = 3.8;

registerVisitor({
    id: 'elephant',
    name: 'Baby elephant',
    group: 'everyday',
    fact: 'A baby elephant can stand and walk within hours of being born.',
    tricks: 'Sprays water at your charm',
    speed: 120,
    stride: 95,
    hit: { w: 140, h: Math.round(S.height) },
    reach: S.reach,
    rest: { pose: 'idle', spray: 0 },
    act: [
        [0.0, {}],
        [T_TRUMPET, { pose: 'trumpet' }],
        [T_SPRAY, { pose: 'spray', spray: 0 }],
        [T_SPRAY + 0.1, { spray: 0 }],
        [T_SPRAY + 0.9, { spray: 1 }],
        [T_STOMP, { pose: 'stomp', spray: 0 }],
        [T_STOMP + 0.5, { pose: 'idle' }],
        [T_STOMP + 0.8, { pose: 'stomp' }],
        [T_END - 0.3, { pose: 'idle' }],
        [T_END, {}],
    ],
    events: [
        { t: T_TRUMPET + 0.2, run() { tone(300, 0.04, 0.22, 0, 'sawtooth'); tone(450, 0.04, 0.35, 0.16, 'triangle'); } },
        { t: T_SPRAY + 0.2, run(ctx) { ctx.kickCharms(2.2, 0); } },
    ],
    build(root) {
        const parts = S.parts.build(root);
        parts.drops = [];
        for (let i = 0; i < DROPS; i++) parts.drops.push(el('circle', { r: 2.6 + (i % 3) * 0.9, fill: WATER, opacity: 0 }, root));
        return parts;
    },
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        const sp = p.walkFrame >= 0 ? 0 : p.spray || 0;
        if (sp > 0 && sp < 1) {
            r.drops.forEach((d, i) => {
                const u = sp * 1.7 - i * 0.07;       // each droplet trails the one before
                if (u <= 0 || u >= 1) { d.setAttribute('opacity', 0); return; }
                const vx = 80 + (i % 4) * 9, vy = -110 - (i % 3) * 14;
                d.setAttribute('transform', `translate(${(TIP[0] + vx * u).toFixed(2)},${(TIP[1] + vy * u + 190 * u * u).toFixed(2)})`);
                d.setAttribute('opacity', (0.95 * (1 - u * u)).toFixed(2));
            });
            r.spraying = true;
        } else if (r.spraying) {
            for (const d of r.drops) d.setAttribute('opacity', 0);
            r.spraying = false;
        }
    },
});
