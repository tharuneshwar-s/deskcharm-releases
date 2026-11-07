// Desk visitor: Vijay, the water buddy. A rendered figurine in a red shirt and white veshti,
// drawn from a sprite atlas (src/visitors/vijay-real.webp + .json: 8 walk frames, plus idle,
// ask, thumbs up, hand on hip, sip, wave, vanakkam, happy and sad poses).
//
// Every visit starts with a vanakkam: "Vanakkam nanba! 🙏".
//   water reminder on (opts.water — every visit, however he was sent): he offers the tumbler and
//     asks "Hey <name>, drink some water? 💧" with YES / NO.
//       YES → happy, "Verithanam 🔥", +1 glass, waves bye.
//       NO → "When should I come back?" with 15 min / 30 min / 1 hour (the reminder snoozes that
//         long; no pick in 12 s = 20 min), then sad, "Please drink some water 🥺", then
//         "Rendey rendu perukku naduvula than inga potiye...".
//       No answer to the first question in 20 s → the same sad lines; asks again in 20 min.
//   water reminder off: hand on hip, a sip, a wave.

import { registerVisitor } from './engine.js';
import { sprite } from './sprite.js';
import { drank, glasses, waterGoal } from '../water.js';
import { t, tx } from '../i18n.js';
import META from '../../visitors/vijay-real.json' with { type: 'json' };

// Atlas clips: idle, thumbs, hip, sip, wave, ask, walk (8), vanakkam, happy, sad.
const S = sprite(META, { image: 'visitors/vijay-real.webp', scale: 0.43, shadow: { rx: 48 } });
const ASK_S = 20;                 // seconds to answer before it counts as "no"
const SNOOZE_ASK_S = 12;         // seconds to pick a snooze before the default (20 min)
const SNOOZES = [{ label: '15 min', minutes: 15 }, { label: '30 min', minutes: 30 }, { label: '1 hour', minutes: 60 }];

// Act segments (s). Water visits: vanakkam → ask → (YES) happy → wave → end
//                                                 → (NO)  sad → end.
// Random visits: vanakkam → hip → sip → wave → end.
const T_VANAKKAM = 0.2, T_ASK = 2.6, T_HAPPY = 3.0, T_BYE = 5.6, T_SAD = 7.0, T_HIP = 12.2;
const T_SIP = 13.4, T_WAVE = 14.6, T_END = 15.6;

function event(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** NO, or no answer: sad, then the two lines. `minutes`: the chosen snooze, if any. */
function sad(ctx, action, minutes) {
    ctx.jump(T_SAD);
    ctx.say('Please drink some water 🥺', 2.4);
    event('desk:water', minutes ? { action, minutes } : { action });
}

/** NO: ask when to come back, then the sad lines. */
function askSnooze(ctx) {
    ctx.ask('When should I come back?', SNOOZES.map((s, i) => ({
        label: s.label, primary: i === 0,
        onPress() { sad(ctx, 'later', s.minutes); },
    })), SNOOZE_ASK_S, () => sad(ctx, 'later'));
}

registerVisitor({
    id: 'vijay',
    name: 'Vijay',
    group: 'wellness',
    fact: 'Drinking water through the day keeps you sharp — a glass every hour or so adds up.',
    hello: 'Vanakkam nanba! 🙏',
    yelp: 'Hey, careful! 😅',
    speed: 95,
    stride: 120,                  // px per walk cycle (8 frames)
    hit: { w: 42, h: 215 },
    reach: S.reach,
    rest: { pose: 'idle' },
    act: [
        [0.0, {}],
        [T_VANAKKAM, { pose: 'vanakkam' }],
        [T_ASK, { pose: 'ask' }],
        [T_HAPPY, { pose: 'happy' }],
        [T_BYE, { pose: 'wave' }],
        [T_SAD, { pose: 'sad' }],
        [T_HIP, { pose: 'hip' }],
        [T_SIP, { pose: 'sip' }],
        [T_WAVE, { pose: 'wave' }],
        [T_END, {}],
    ],
    events: [
        { t: T_VANAKKAM + 0.05, run(ctx) { ctx.say(ctx.opts.greeting || 'Vanakkam nanba! 🙏', 2.2); } },
        {
            t: T_ASK,
            run(ctx) {
                if (!ctx.opts.water) { ctx.jump(T_HIP); return; }
                const name = (ctx.opts.userName || '').trim();
                const own = ctx.opts.jobMessage;   // the user's own water line (Pro), as typed
                ctx.ask(own || (name ? t('Hey {name}, drink some water? 💧', { name }) : tx('Hey, drink some water? 💧')), [
                    {
                        label: 'YES', primary: true,
                        onPress() {
                            const n = drank();
                            ctx.jump(T_HAPPY);
                            const goal = waterGoal();
                            ctx.say(t(n >= goal ? tx('Verithanam 🔥 Goal done! {n}/{goal}') : tx('Verithanam 🔥 {n}/{goal}'), { n, goal }), 2.6);
                            event('desk:water', { action: 'drank' });
                        },
                    },
                    { label: 'NO', onPress() { askSnooze(ctx); } },
                ], ASK_S, () => sad(ctx, 'ignored'), !!own);
            },
        },
        // YES path: after the goodbye wave, leave (skip the sad segment).
        { t: T_SAD - 0.1, run(ctx) { ctx.jump(T_END); } },
        // NO path: the second line, then leave (skip the random-visit segment).
        { t: T_SAD + 2.5, run(ctx) { ctx.say('Rendey rendu perukku naduvula than inga potiye...', 2.6); } },
        { t: T_HIP - 0.1, run(ctx) { ctx.jump(T_END); } },
        // Random visit: today's count while he sips.
        { t: T_SIP + 0.1, run(ctx) { ctx.say(t('{n}/{goal} glasses today 💧', { n: glasses(), goal: waterGoal() }), 2); } },
    ],
    ...S.parts,
});
