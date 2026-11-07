// Eye-rest bird: a common myna drawn from a sprite atlas (src/visitors/bird-real.webp + .json:
// 8 flight frames, plus idle, land, gaze, a 2-frame tail flick and take-off). Flies in, lands,
// gazes far away for the 20-20-20 rule (~20 s), flicks its tail, then flies off.

import { registerVisitor, tone } from './engine.js';
import { sprite } from './sprite.js';
import META from '../../visitors/bird-real.json' with { type: 'json' };

const CLIPS = { ...META.clips, fly: META.clips.walk };
const S = sprite({ ...META, clips: CLIPS }, { image: 'visitors/bird-real.webp', scale: 0.24, fps: 12, shadow: { rx: 26, ry: 4 } });
const LIFT = 50;                  // px above the taskbar while flying

registerVisitor({
    id: 'bird',
    name: 'Eye-rest bird',
    group: 'wellness',
    fact: 'Mynas can copy human speech — and other birds’ songs.',
    cueOnly: true,
    speed: 180,
    stride: 90,
    hit: { w: 40, h: Math.round(S.height) },
    reach: S.reach,
    rest: { pose: 'idle', fly: 1, hop: 0 },
    act: [
        [0.0, { pose: 'fly' }],
        [0.9, { pose: 'land', fly: 0.18 }],
        [1.25, { pose: 'idle', fly: 0 }],
        [1.5, { hop: 7 }],
        [1.75, { hop: 0 }],
        [2.7, { pose: 'gaze' }],
        [6.0, { pose: 'idle' }],
        [6.8, { pose: 'gaze' }],
        [10.0, { pose: 'flick' }],
        [10.6, { pose: 'gaze' }],
        [17.4, { pose: 'idle' }],
        [18.6, { hop: 0 }],
        [18.8, { hop: 5 }],
        [19.0, { hop: 0 }],
        [19.4, { pose: 'takeoff' }],
        [19.9, { pose: 'fly' }],
        [20.3, { fly: 1 }],
        [20.6, {}],
    ],
    hello: 'Tweet! 🐦',
    events: [
        { t: 1, run: (ctx) => ctx.say(ctx.opts.jobMessage || 'Look 20 ft away 👀', 4, !!ctx.opts.jobMessage) },
        { t: 18.5, run: (ctx) => {
            ctx.say('Nice! 🐦', 1.5);
            tone(2200, 0.03, 0.09, 0, 'sine');
            tone(2800, 0.03, 0.12, 0.12, 'sine');
        } },
    ],
    build(root) {
        const parts = S.parts.build(root);
        parts.shadow = root.firstChild;
        return parts;
    },
    walk(p, phase, a) {
        S.parts.walk(p, phase * 2, a);              // two wing beats per stride
        p.wave = Math.sin(phase) * 6 * a;          // gentle rise and fall
    },
    draw(r, p, ctx) {
        S.parts.draw(r, p, ctx);
        const lift = p.fly * LIFT + (p.wave || 0) + p.hop;
        const k = r.body.getAttribute('transform') || '';
        r.body.setAttribute('transform', `translate(0,${(-lift).toFixed(2)}) ${k}`);
        const sh = Math.max(0.5, 1 - lift / 110);
        r.shadow.setAttribute('transform', `scale(${sh.toFixed(2)})`);
        r.shadow.setAttribute('opacity', (0.2 * sh).toFixed(2));
    },
});
