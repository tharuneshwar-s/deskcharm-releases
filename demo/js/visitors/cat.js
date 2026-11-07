// Desk visitor: an orange tabby drawn from a sprite atlas (src/visitors/cat-real.webp + .json:
// idle, 8 walk frames, stretch/yawn, sit, paw lick, slow blink, tail curled). Pads in, stretches
// with a big yawn, sits, licks a paw, gives the viewer a slow "cat kiss" blink with its tail
// curled round its feet, then carries on.

import { registerVisitor, tone } from './engine.js';
import { sprite } from './sprite.js';
import ATLAS from '../../visitors/cat-real.json' with { type: 'json' };

// The packer puts every frame in one height-matched clip ("all") so poses keep a shared scale.
const A = ATLAS.clips.all;
const META = {
    ...ATLAS,
    clips: { idle: [A[0]], walk: A.slice(1, 9), stretch: [A[9]], sit: [A[10]], lick: [A[11]], blink: [A[12]], curl: [A[13]] },
};
const S = sprite(META, { image: 'visitors/cat-real.webp', scale: 0.26, shadow: { rx: 50 } });

registerVisitor({
    id: 'cat',
    name: 'Cat',
    group: 'everyday',
    fact: 'A slow blink from a cat is a sign of trust — try blinking back.',
    speed: 140,
    stride: 85,
    stopAt: 0.6,
    hit: { w: 100, h: Math.round(S.height) },
    reach: S.reach,
    rest: { pose: 'idle' },
    act: [
        [0.0, {}],
        [0.3, { pose: 'stretch' }],
        [1.5, { pose: 'sit' }],
        [2.0, { pose: 'lick' }],
        [2.9, { pose: 'curl' }],
        [3.2, { pose: 'blink' }],
        [3.75, { pose: 'curl' }],
        [4.1, { pose: 'idle' }],
        [4.3, {}],
    ],
    events: [{
        t: 1.1,
        run() {
            tone(700, 0.035, 0.12, 0, 'sine');
            tone(880, 0.03, 0.18, 0.08, 'sine');
        },
    }],
    ...S.parts,
});
