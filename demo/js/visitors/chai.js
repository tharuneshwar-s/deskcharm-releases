// Desk visitor: cheerful chai-wala on a maroon bicycle with a steel kettle and a crate of glasses
// on the rear carrier, drawn from a sprite atlas (src/visitors/chai-real.webp + .json: 8 riding
// frames, plus idle, brake, bell and chai poses). Rides in, brakes, rings the bell twice, lifts a
// glass of chai toward the viewer (steam wisps drawn over the sprite), then rides off.
// Cue-only: sent by the take-a-break reminder; clicking him starts the break.

import { registerVisitor, el, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/chai-real.json' with { type: 'json' };

const K = 0.34;
const S = sprite(META, { image: 'visitors/chai-real.webp', scale: K, shadow: { rx: 70 } });
const GLASS = { x: 0, y: -(META.feetY - 95) * K };   // top of the raised glass in the chai pose

const T_BRAKE = 0.0, T_BELL = 0.5, T_CHAI = 1.3, T_DOWN = 3.6, T_END = 4.0;

registerVisitor({
    id: 'chai',
    name: 'Chai-wala',
    group: 'wellness',
    fact: 'Short breaks every hour help you stay focused for longer.',
    speed: 200,
    stride: 140,                  // px per pedal turn (8 frames)
    hit: { w: 60, h: Math.round(S.height) },
    reach: S.reach,
    rest: { pose: 'idle', steam: 0 },
    act: [
        [T_BRAKE, { pose: 'brake' }],
        [T_BELL, { pose: 'bell' }],
        [T_CHAI, { pose: 'chai', steam: 0 }],
        [T_CHAI + 0.3, { steam: 1 }],
        [T_DOWN, { steam: 0 }],
        [T_DOWN + 0.05, { pose: 'idle' }],
        [T_END, {}],
    ],
    events: [
        { t: T_BELL + 0.05, run: () => tone(1800, 0.03, 0.35, 0, 'triangle') },
        { t: T_BELL + 0.2, run: () => tone(1800, 0.03, 0.45, 0, 'triangle') },
    ],
    hello: 'Chai? ☕',
    cueOnly: true,
    build(root) {
        const parts = S.parts.build(root);
        const steam = el('g', { transform: `translate(${GLASS.x},${GLASS.y.toFixed(1)})`, opacity: 0 }, root);
        parts.steam = steam;
        parts.wisps = [0, 1, 2].map(() => el('path', {
            d: 'M0,0 Q-3,-4 0,-8 Q3,-12 0,-16', stroke: '#ffffff', 'stroke-width': 2,
            fill: 'none', 'stroke-linecap': 'round', opacity: 0,
        }, steam));
        return parts;
    },
    walk: S.parts.walk,
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        r.steam.setAttribute('opacity', p.steam.toFixed(2));
        if (p.steam > 0.01) {
            r.wisps.forEach((s, i) => {
                const k = (ctx.t * 0.7 + i / 3) % 1;
                s.setAttribute('transform', `translate(${(i - 1) * 3.5},${(-k * 16).toFixed(2)}) scale(${(0.6 + k * 0.5).toFixed(2)})`);
                s.setAttribute('opacity', (Math.sin(k * Math.PI) * 0.85).toFixed(2));
            });
        }
    },
    onClick(ctx) {
        window.dispatchEvent(new CustomEvent('desk:wellness-command', { detail: { action: 'take-break' } }));
        ctx.say('Enjoy your break!', 2.5);
    },
});
