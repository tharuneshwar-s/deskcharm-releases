// Desk visitor: the yogi, a rendered figurine in a saffron robe, drawn from a sprite atlas
// (src/visitors/yogi-real.webp + .json; sources and spec in art/visitors/yogi/). He floats
// cross-legged across the taskbar with a gentle bob, settles lower and:
//   random visit: three slow breaths (inhale / exhale poses), then a namaste.
//   opts.nudge 'stretch' (features/nudges.js): "Stretch with me 🙆" — arms overhead, side bend,
//     neck roll, namaste.
//   opts.nudge 'posture': "Sit tall 🧘" — upright spine, namaste.
// Click: on a nudge it counts as done ("Nice! 💪", insights-event { kind: 'stretch' },
// desk:nudge { kind, action: 'done' }); otherwise it starts a 1-minute breathing session.
// A nudge visit that leaves without a click reports desk:nudge { kind, action: 'ignored' }.

import { registerVisitor, tone } from './engine.js';
import { sprite } from './sprite.js';
import ATLAS from '../../visitors/yogi-real.json' with { type: 'json' };

// The packer keeps every pose in one clip ("poses") so they share one scale; name them here.
const NAMES = ['idle', 'inhale', 'exhale', 'namaste', 'overhead', 'sidebend', 'neck', 'posture'];
const META = { ...ATLAS, clips: Object.fromEntries(NAMES.map((n, i) => [n, [ATLAS.clips.poses[i]]])) };
const S = sprite(META, { image: 'visitors/yogi-real.webp', scale: 0.3, shadow: { rx: 40 }, breathe: 0 });

const BOB_PX = 3.5, BOB_RATE = 1.6;   // float bob amplitude (px) and speed (rad/s)

// Act segments (s): breaths 0 … 10.6, stretch, posture, done (after a click), end.
const T_SETTLE = 0.9, T_NAMASTE = 9.4;
const T_STRETCH = 11.0, T_SIDE = 13.8, T_NECK = 16.6, T_S_BOW = 19.4;
const T_POSTURE = 21.0, T_P_BOW = 25.0;
const T_DONE = 26.6, T_END = 28.0;

function send(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

registerVisitor({
    id: 'yogi',
    name: 'Yogi',
    group: 'everyday',
    fact: 'Breathing out longer than you breathe in helps your body calm down.',
    speed: 70,
    stride: 120,
    hit: { w: 60, h: Math.round(S.height) + 14 },
    reach: S.reach,
    rest: { pose: 'idle', fly: 14 },
    act: [
        [0.0, {}],
        [T_SETTLE, { fly: 6 }],
        [2.4, { pose: 'inhale' }], [3.6, { pose: 'exhale' }],
        [5.0, { pose: 'inhale' }], [6.2, { pose: 'exhale' }],
        [7.6, { pose: 'inhale' }], [8.8, { pose: 'exhale' }],
        [T_NAMASTE, { pose: 'namaste', fly: 10 }],
        [10.6, { pose: 'idle' }],
        [T_STRETCH, { pose: 'overhead', fly: 6 }],
        [T_SIDE, { pose: 'sidebend' }],
        [T_NECK, { pose: 'neck' }],
        [T_S_BOW, { pose: 'namaste' }],
        [T_POSTURE, { pose: 'posture', fly: 6 }],
        [T_P_BOW, { pose: 'namaste' }],
        [T_DONE, { pose: 'namaste', fly: 8 }],
        [T_END, {}],
    ],
    hello: 'Namaste 🙏',
    events: [
        {
            t: 0.3,
            run(ctx) {
                const o = ctx.opts;
                if (o.nudge && o.nudgeDone) { ctx.jump(T_DONE); return; }
                // jobMessage: the user's own opening line (Pro), as typed.
                if (o.nudge === 'stretch') { ctx.jump(T_STRETCH); ctx.say(o.jobMessage || 'Stretch with me 🙆', 3, !!o.jobMessage); return; }
                if (o.nudge === 'posture') { ctx.jump(T_POSTURE); ctx.say(o.jobMessage || 'Sit tall 🧘', 3, !!o.jobMessage); return; }
                ctx.say('Breathe with me 🌿', 3);
            },
        },
        ...[T_SETTLE + 0.1, 3.6, 6.2].map((t) => ({ t, run: () => tone(220, 0.03, 1.4, 0, 'sine') })),
        { t: 10.5, run: (ctx) => ctx.jump(T_END) },                     // breaths done
        { t: T_SIDE + 0.1, run: (ctx) => ctx.say('Lean to the side', 2.2) },
        { t: T_NECK + 0.1, run: (ctx) => ctx.say('Roll your neck gently', 2.2) },
        { t: T_POSTURE - 0.1, run: (ctx) => ctx.jump(T_END) },           // stretch done
        { t: T_POSTURE + 1.2, run: (ctx) => ctx.say('Shoulders back, chin level', 2.4) },
        { t: T_DONE - 0.1, run: (ctx) => ctx.jump(T_END) },              // posture done
    ],
    ...S.parts,
    draw(parts, p, ctx) {
        S.parts.draw(parts, p, ctx);
        const bob = ctx.world.reducedMotion ? 0 : BOB_PX * Math.sin((performance.now() / 1000) * BOB_RATE);
        parts.body.setAttribute('transform', `translate(0,${(-(p.fly ?? 0) - bob).toFixed(2)})`);
    },
    onClick(ctx) {
        const o = ctx.opts;
        if (o.nudge) {
            if (!o.nudgeDone) {
                o.nudgeDone = true;
                ctx.world.emit?.('insights-event', { kind: 'stretch' });
                send('desk:nudge', { kind: o.nudge, action: 'done' });
            }
            ctx.say('Nice! 💪', 2.5);
            return;
        }
        send('desk:wellness-command', { action: 'breathe', minutes: 1 });
        ctx.say('Let\'s breathe — 1 min', 2.5);
    },
    onLeave(ctx) {
        const o = ctx.opts;
        if (o.nudge && !o.nudgeDone) send('desk:nudge', { kind: o.nudge, action: 'ignored' });
    },
});
