// Generic job acts (Settings › Visitors › "Who visits for what", src/js/visitor-jobs.js): any
// visitor without its own act for a job does this instead. The engine runs it when a visit has
// opts.job ({ id, data, say, message, onAnswer }): on arrival the visitor stops (its own act and
// act events are skipped), asks the job's question with the job's buttons (or says its line), and
// walks off when the job calls leave(seconds). Outcomes match the specialists (vijay water, yogi
// stretch / posture, chai break, bird eye rest):
//   water        YES → +1 glass (water.js drank: insights via desk:water-changed) + desk:water
//                drank; NO → 15 min / 30 min / 1 hour → desk:water later; no answer → ignored
//   stretch / posture  Done → insights-event stretch + desk:nudge done; Later / none → ignored
//   break        Take it → desk:wellness-command take-break
//   eye_rest     a 20 s countdown bubble
//   mood_cheer / focus_nudge / greeting   says its line
//   counter      '<name>? <emoji>' YES / NO → onAnswer('yes'|'no'|'ignored') exactly once
// `message`: the user's own line (Pro, as typed) replacing the default question / line.

import { drank, waterGoal } from '../water.js';
import { t } from '../i18n.js';

export const JOB_ASK_S = 20;      // seconds to answer before it counts as ignored
export const SNOOZE_ASK_S = 12;
export const EYE_REST_S = 20;
const SNOOZES = [{ label: '15 min', minutes: 15 }, { label: '30 min', minutes: 30 }, { label: '1 hour', minutes: 60 }];
const LINE_S = 3.5;

function event(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Default line of `id` from the job table (a t() template), translated with `vars`. */
function line(id, vars) {
    const j = globalThis.DeskVisitorJobs?.job(id);
    return j?.line ? t(j.line, vars) : '';
}

/**
 * Start job `job` on the visitor behind `ctx` (engine ctx: say, ask, world, opts). `leave(s)`:
 * walk off after s seconds. Returns { tick(dt), cancel() }: tick runs every act frame while no
 * question is open; cancel() reports a still-open answer as ignored (the visit was cut short).
 */
export function runJob(ctx, job, leave) {
    const own = (job.message || '').trim();
    const ask = (text, buttons, seconds, onTimeout) => ctx.ask(text, buttons, seconds, onTimeout, true);
    const speak = (text, s = LINE_S) => { ctx.say(text, s, true); leave(s); };
    let pending = null;               // reports 'ignored' if the visit ends before an answer
    const once = (fn) => {
        let done = false;
        const f = (...a) => { if (done) return; done = true; pending = null; fn(...a); };
        pending = () => f('ignored');
        return f;
    };
    let tick = null;

    switch (job.id) {
        case 'water': {
            const name = (ctx.opts.userName || '').trim();
            const q = own || (name ? t('Hey {name}, drink some water? 💧', { name }) : line('water'));
            const answer = once((action, minutes) => event('desk:water', minutes ? { action, minutes } : { action }));
            ask(q, [
                {
                    label: 'YES', primary: true,
                    onPress() {
                        const n = drank();
                        answer('drank');
                        speak(t('Glass counted 💧 {n}/{goal}', { n, goal: waterGoal() }), 2.6);
                    },
                },
                {
                    label: 'NO',
                    onPress() {
                        ask(t('When should I come back?'), SNOOZES.map((s, i) => ({
                            label: s.label, primary: i === 0,
                            onPress() { answer('later', s.minutes); leave(1); },
                        })), SNOOZE_ASK_S, () => { answer('later'); leave(0.5); });
                    },
                },
            ], JOB_ASK_S, () => { answer('ignored'); leave(0.5); });
            break;
        }
        case 'stretch':
        case 'posture': {
            const kind = job.id;
            const answer = once((action) => event('desk:nudge', { kind, action }));
            ask(own || line(kind), [
                {
                    label: 'Done', primary: true,
                    onPress() {
                        ctx.world.emit?.('insights-event', { kind: 'stretch' });
                        answer('done');
                        speak(t('Nice! 💪'), 2.5);
                    },
                },
                { label: 'Later', onPress() { answer('ignored'); leave(0.8); } },
            ], JOB_ASK_S, () => { answer('ignored'); leave(0.5); });
            break;
        }
        case 'break':
            ask(own || line('break'), [
                {
                    label: 'Take it', primary: true,
                    onPress() {
                        event('desk:wellness-command', { action: 'take-break' });
                        speak('☕', 1.5);
                    },
                },
                { label: 'Not now', onPress() { leave(0.8); } },
            ], JOB_ASK_S, () => leave(0.5));
            break;
        case 'eye_rest': {
            let left = EYE_REST_S;
            tick = (dt) => {
                left -= dt;
                if (left <= 0) { tick = null; speak('👍', 1.5); return; }
                const n = Math.ceil(left);
                ctx.say(own ? `${own} ${n}` : t('Look 20 ft away 👀 {n}', { n }), 1.2, true);
            };
            leave(Infinity);
            break;
        }
        case 'counter': {
            const d = job.data || {};
            const answer = once((action) => job.onAnswer?.(action));
            const q = String(d.message || '').trim() || own ||
                t('{name}? {emoji}', { name: String(d.name || ''), emoji: String(d.emoji || '') }).trim();
            ask(q, [
                { label: 'YES', primary: true, onPress() { answer('yes'); speak('👍', 1.5); } },
                { label: 'NO', onPress() { answer('no'); leave(0.8); } },
            ], JOB_ASK_S, () => { answer('ignored'); leave(0.5); });
            break;
        }
        default:
            // mood_cheer, focus_nudge, greeting: one line (the sender's, e.g. good morning / hello again).
            speak(own || (job.say ? t(job.say) : line(job.id)) || t('Hi! 👋'));
    }

    return {
        tick(dt) { tick?.(dt); },
        cancel() { pending?.(); },
    };
}
