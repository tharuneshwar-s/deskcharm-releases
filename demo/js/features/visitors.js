// Desk visitors: every so often a small character walks along the top of the taskbar, stops,
// does its act and walks off (see visitors/engine.js). Click a visitor to replay its act.
// Sent on demand from the quick menu or Settings (`visitor-command`), or by middle-clicking
// the charm. Settings › Visitors configures them.
//
// Config (defaults for every visitor):
//   visitors            on/off
//   visitor_frequency   'rare' | 'sometimes' | 'often'
//   visitor_size        's' | 'm' | 'l'
//   visitor_direction   'ltr' | 'rtl' | 'random'
//   visitor_stop        'left' | 'center' | 'right' | 'random'
//   visitor_sounds / visitor_bubbles / visitor_tricks / visitor_reactions   on/off
//   visitor_quiet       quiet hours on/off; visitor_quiet_from / visitor_quiet_to 'HH:MM'
//   visitors_quiet_in_calls  no scheduled visits, and other features' visitors (water, stretch…)
//                       wait, while the microphone is in use (`env-call` { active } from Rust)
//   calendar_quiet      busy calendar blocks (`env-busy` { active, until }) count as quiet hours
//   festival_themes     (Seasons page) festival visitors only come while this is on
//   visitor_prefs       { [id]: overrides } — only what differs from the defaults:
//     on (bool), weight (0 less | 1 normal | 2 more), size ('s'|'m'|'l'), speed ('slow'|'quick'),
//     dir ('ltr'|'rtl'|'random'), stop ('left'|'center'|'right'|'random'), sounds / bubbles /
//     tricks / hello / dance / flee (bool), variant (id), name, greeting (text),
//     times (subset of ['morning', 'afternoon', 'evening', 'night'])
//
// `visitor-command` payloads: { action: 'send', id? } | { action: 'pause', minutes } | { action: 'resume' }
// Each visit is reported as `visitor-visited` { id } (Settings visit log).
//
// Who visits for what (src/js/visitor-jobs.js): every feature visit is a job. Features dispatch
// window `desk:visitor-job` { job, id?, data?, say?, message?, onAnswer? }; jobVisit() picks the
// visitor (`id` unless missing / 'auto', else DeskVisitorJobs.visitorFor; 'charm' = nobody) and
// sends it with its own act for the job (vijay water, yogi stretch / posture, chai break, bird
// eye rest) or the generic job act (visitors/jobs.js). It sets detail.sent and detail.visitor.
// Settings "Try it": `visitor-job-command` { job, id?, message? } runs the job now through its
// feature (message: unsaved custom line, for this try only).

import { registerFeature } from '../features.js';
import { t, tx } from '../i18n.js';
import { DEV } from '../dev.js';
import { createRunner, visitors } from '../visitors/engine.js';
import { activeFestival } from '../festivals.js';
import '../pro.js';
import '../visitor-jobs.js';
import '../visitors/elephant.js';
import '../visitors/cat.js';
import '../visitors/peacock.js';
import '../visitors/vijay.js';
import '../visitors/yogi.js';
import '../visitors/chai.js';
import '../visitors/bird.js';
import '../visitors/monkey.js';
import '../visitors/diwali.js';
import '../visitors/holi.js';
import '../visitors/pongal.js';
import '../visitors/christmas.js';

const EVERY_MIN = { rare: 60, sometimes: 20, often: 5 };
const SIZE = { s: 0.7, m: 1, l: 1.4 };
const ACT_SPEED = { slow: 0.75, normal: 1, quick: 1.3 };
const STOP = { left: 0.25, center: 0.5, right: 0.75 };
const WEIGHT = [0.4, 1, 2.5];     // weight: less / normal / more
const RETRY_MS = 60 * 1000;       // busy (hidden, typing hard, quiet hours) at visit time: look again later
const TYPING_BUSY_KPS = 3;
const TYPING_BUSY_MS = 4000;
const FESTIVAL_SHARE = 0.5;       // during a festival, about half the visits are its visitors
const STARTLE_SPEED = 14;         // charm end speed (px per physics step) that scares a visitor
const STARTLE_RANGE = 260;        // px between the released charm and the visitor
const cfg = {
    visitors: true, visitor_frequency: 'rare', visitor_size: 'm', visitor_direction: 'ltr',
    visitor_stop: 'center', visitor_sounds: true, visitor_bubbles: true, visitor_tricks: true,
    visitor_reactions: true, visitor_quiet: false, visitor_quiet_from: '22:00', visitor_quiet_to: '07:00',
    visitor_prefs: {}, festival_themes: true, user_name: '', water_reminder: true,
    visitors_quiet_in_calls: true, calendar_quiet: false,
};

let runner = null;
let overlay = null;               // the world (set in onInit)
let pausedUntil = 0;
let next = Infinity;
let lastId = '';
let lastTyping = -Infinity;
let onCall = false;
let busy = { active: false, until: null };
let featureVisit = false;         // the visitor out was sent by another feature (desk:visitor-job)
// ?festival=<id> previews a festival (same switch the seasons feature uses).
const previewFestival = new URLSearchParams(location.search).get('festival');

const prefs = (id) => cfg.visitor_prefs[id] || {};

function festivalNow() {
    if (previewFestival) return previewFestival;
    return cfg.festival_themes ? activeFestival(new Date())?.id ?? null : null;
}

function intervalMs() {
    return (EVERY_MIN[cfg.visitor_frequency] || EVERY_MIN.rare) * 60 * 1000;
}

function schedule(now, first = false) {
    const base = intervalMs();
    // The first visit comes sooner than a full interval; later ones jitter around it.
    next = now + base * (first ? 0.3 + Math.random() * 0.3 : 0.75 + Math.random() * 0.5);
}

function minutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? (+m[1] % 24) * 60 + (+m[2] % 60) : null;
}

/** Inside the quiet hours (a window that may wrap past midnight). */
function inQuietHours(date = new Date()) {
    if (!cfg.visitor_quiet) return false;
    const a = minutes(cfg.visitor_quiet_from), b = minutes(cfg.visitor_quiet_to);
    if (a === null || b === null || a === b) return false;
    const t = date.getHours() * 60 + date.getMinutes();
    return a < b ? t >= a && t < b : t >= a || t < b;
}

/** On a call (and visitors should keep away from calls). */
function inCall() {
    return !!(cfg.visitors_quiet_in_calls && onCall);
}

/** Inside a busy calendar block. */
function inBusy(now = Date.now()) {
    return !!(cfg.calendar_quiet && busy.active && (busy.until == null || now < busy.until));
}

/** 'morning' 5–12, 'afternoon' 12–17, 'evening' 17–21, 'night' 21–5. */
function partOfDay(date = new Date()) {
    const h = date.getHours();
    return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';
}

/** Allowed to come by on its own now: switched on and inside its times of day. */
function available(v) {
    const p = prefs(v.id);
    if (p.on === false) return false;
    return !Array.isArray(p.times) || p.times.includes(partOfDay());
}

function weightOf(v) {
    return WEIGHT[prefs(v.id).weight ?? 1] ?? 1;
}

function weightedPick(pool) {
    let r = Math.random() * pool.reduce((s, v) => s + weightOf(v), 0);
    for (const v of pool) {
        r -= weightOf(v);
        if (r <= 0) return v;
    }
    return pool[pool.length - 1];
}

function pick(id) {
    const list = visitors();
    if (id) return list.find((v) => v.id === id) || null;
    // Cue-only visitors (chai-wala, eye-rest bird) come with their reminder, not at random;
    // festival visitors only during their festival.
    const fest = festivalNow();
    const ok = (v) => available(v) && !v.cueOnly && (!v.festival || v.festival === fest);
    const festPool = list.filter((v) => ok(v) && v.festival);
    if (festPool.length && Math.random() < FESTIVAL_SHARE) return weightedPick(festPool);
    const pool = list.filter((v) => ok(v) && !v.festival);
    if (!pool.length) return festPool.length ? weightedPick(festPool) : null;
    const fresh = pool.length > 1 ? pool.filter((v) => v.id !== lastId) : pool;
    return weightedPick(fresh);
}

/** The runner options for one visit of `def`: its own settings over the defaults. */
function visitOptions(def) {
    const p = prefs(def.id);
    const dirPref = p.dir || cfg.visitor_direction;
    const dir = dirPref === 'rtl' ? -1 : dirPref === 'random' ? (Math.random() < 0.5 ? 1 : -1) : 1;
    const stopPref = p.stop || cfg.visitor_stop;
    let stop = stopPref === 'random' ? 0.2 + Math.random() * 0.6 : STOP[stopPref] ?? STOP.center;
    const main = overlay.charms[0];
    if (def.stopAtCharm && main) stop = Math.min(0.95, Math.max(0.05, main.rope.anchorX / innerWidth));
    const reactions = cfg.visitor_reactions;
    return {
        dir, stop,
        scale: SIZE[p.size || cfg.visitor_size] || 1,
        actSpeed: ACT_SPEED[p.speed] || 1,
        variant: p.variant || '',
        sounds: p.sounds ?? cfg.visitor_sounds,
        bubbles: p.bubbles ?? cfg.visitor_bubbles,
        tricks: p.tricks ?? cfg.visitor_tricks,
        hello: p.hello ?? reactions,
        dance: p.dance ?? reactions,
        flee: p.flee ?? reactions,
        greeting: line(def.id, 'hello') || (p.greeting || '').slice(0, 24),
        bye: line(def.id, 'bye'),
        // The water buddy (Vijay) asks his question on every visit while the water reminder is on,
        // not only when the reminder timer sends him.
        water: cfg.water_reminder,
    };
}

/**
 * Send a visitor now (`id` or a random available one). Explicit requests ignore pause, quiet
 * hours and times of day. `say`: bubble when it stops. `force`: replace a visitor already out,
 * unless it is waiting for an answer to a question (e.g. the water ask) — then this one waits.
 * `extra`: more runner options for this visit (e.g. { water: true }).
 */
function send(id, { say, force, extra } = {}) {
    const def = pick(id);
    if (!def || !runner) return false;
    if (force) {
        if (runner.asking) return false;
        runner.stop();
    }
    const opts = visitOptions(def);
    if (!runner.start(def, { ...opts, ...extra, userName: cfg.user_name, say: say || opts.greeting })) return false;
    lastId = def.id;
    overlay.emit('visitor-visited', { id: def.id });
    return true;
}

/** Scheduled visits and greetings: on, not paused, not in quiet hours / a call / a busy block, not hidden. */
function welcome(world) {
    return cfg.visitors && Date.now() >= pausedUntil && !inQuietHours() && !inCall() && !inBusy() && !world.hidden;
}

const GREET_KEY = 'deskcharm.visitorGreeted';
const GREET_FROM_HOUR = 5;

function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** First activity of the day (from 05:00): a visitor comes by to say good morning. */
function maybeGreet(world) {
    const d = new Date();
    if (d.getHours() < GREET_FROM_HOUR || !welcome(world) || runner.active) return;
    let last = null;
    try { last = localStorage.getItem(GREET_KEY); } catch { /* storage unavailable */ }
    if (last === todayKey(d)) return;
    try { localStorage.setItem(GREET_KEY, todayKey(d)); } catch { /* storage unavailable */ }
    jobVisit({ job: 'greeting', say: d.getHours() < 12 ? tx('Good morning! ☀️') : tx('Hello again! 👋') });
}

const Jobs = () => globalThis.DeskVisitorJobs;

/** Pro: visitor `id`'s own hello / bye line (as typed), or ''. */
function line(id, kind) {
    return overlay ? Jobs().visitorLine(id, kind, overlay.config, overlay.license) : '';
}

/** Runner options for `id` doing `job`: its own act when it has one, else the generic job act. */
function jobExtra(d, id) {
    const job = d.job;
    if (job === 'reminder') {
        // Vijay's water question waits for his own visits.
        return { water: false, reminder: { text: String(d.data?.text || ''), onAnswer: d.onAnswer } };
    }
    const message = typeof d.message === 'string' ? d.message.trim() : Jobs().jobMessage(job, overlay.config, overlay.license);
    if (Jobs().hasSpecialAct(id, job)) {
        // jobMessage: the user's own line for the specialist's question / offer, shown as typed.
        if (job === 'water') return { water: true, jobMessage: message };
        if (job === 'stretch' || job === 'posture') return { nudge: job, jobMessage: message };
        return { jobMessage: message, sayRaw: !!message };
    }
    return { water: false, job: { id: job, data: d.data, say: d.say, message, onAnswer: d.onAnswer } };
}

/** Specialists' arrival line (chai-wala, eye-rest bird); the generic act asks its own question. */
const SPECIAL_SAY = { break: tx('Chai break? ☕'), eye_rest: tx('Look far away 👀') };

/**
 * A feature's job visit (see the header). Refused (sent = false) while hidden, on a call, with
 * visitors off, the chosen visitor switched off, or another feature's visitor out.
 */
function jobVisit(d) {
    d.sent = false;
    d.visitor = '';
    if (!runner || !Jobs().job(d.job)) return false;
    const id = d.id === 'charm' ? '' : d.id && d.id !== 'auto' ? d.id : Jobs().visitorFor(d.job, overlay.config, overlay.license);
    d.visitor = id;
    if (!id || !cfg.visitors || overlay.hidden || inCall() || prefs(id).on === false || (runner.active && featureVisit)) return false;
    const extra = jobExtra(d, id);
    const special = Jobs().hasSpecialAct(id, d.job);
    const say = special ? extra.jobMessage || SPECIAL_SAY[d.job] : undefined;
    d.sent = send(id, { say, force: true, extra });
    if (d.sent) featureVisit = true;
    return d.sent;
}

/** Settings "Try it": run `job` now through its feature (`id`, `message`: this try only). */
function tryJob({ job, id, message } = {}) {
    const fire = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
    const over = { id, message: typeof message === 'string' && message.trim() ? message : undefined };
    if (job === 'water') fire('desk:water-try', over);
    else if (job === 'stretch' || job === 'posture') fire('desk:nudge-try', { kind: job, ...over });
    else if (job === 'break' || job === 'eye_rest') fire('desk:wellness-command', { action: 'remind', kind: job === 'eye_rest' ? 'eye' : 'break', ...over });
    else if (job === 'reminder') jobVisit({ job, id, data: { text: message || t('Your reminder, right on time ⏰') }, onAnswer() {} });
    else if (job === 'counter') fire('desk:counter-try', over);
    else if (job) jobVisit({ job, ...over, say: job === 'greeting' ? tx('Good morning! ☀️') : undefined });
}

registerFeature({
    onInit(world) {
        // Not in the website hero or the Settings preview (?embed), unless asked for with ?visitors.
        if (/[?&]embed/.test(location.search) && !/[?&]visitors/.test(location.search)) return;
        overlay = world;
        runner = createRunner({ layer: world.layers.ui.ownerSVGElement, interaction: world.interaction, world });
        schedule(performance.now(), true);

        world.listen('visitor-command', (e) => {
            const p = e.payload || {};
            if (p.action === 'send') send(p.id);
            else if (p.action === 'pause') {
                pausedUntil = Date.now() + (p.minutes || 60) * 60 * 1000;
                runner.stop();
            } else if (p.action === 'resume') pausedUntil = 0;
        });
        world.listen('env-typing-rate', (e) => {
            if (e.payload.kps >= TYPING_BUSY_KPS) lastTyping = performance.now();
        });
        world.listen('env-call', (e) => { onCall = !!e.payload?.active; });
        world.listen('env-busy', (e) => {
            busy = { active: !!e.payload?.active, until: e.payload?.until ?? null };
        });
        world.interaction.on('aux', () => send());
        // Other features' visits (water, stretch, reminders, counters…): see jobVisit(). It replaces
        // a visitor that is just passing by, but never another feature's visit (that one would be
        // lost); the sender retries later instead.
        window.addEventListener('desk:visitor-job', (e) => jobVisit(e.detail || {}));
        world.listen('visitor-job-command', (e) => tryJob(e.payload || {}));
        // A charm flung hard toward a visitor scares it off.
        world.interaction.on('release', (view) => {
            if (!runner.active) return;
            const rope = view.rope;
            const e = rope.end;
            const vx = rope.px[e] - rope.ox[e];
            const dx = runner.state.x - rope.px[e];
            if (rope.endSpeed() >= STARTLE_SPEED && Math.abs(dx) <= STARTLE_RANGE + Math.abs(vx) * 20 && vx * dx >= 0) {
                runner.startle();
            }
        });
        // Music sway beats: whoever is out hops along.
        world.listen('env-audio-level', (e) => {
            const p = e.payload;
            if (!p?.beat) return;
            runner.beat(Math.min(1, 0.5 + (p.level || 0)));
        });
        let lastMove = 0;
        world.listen('cursor-pos', () => {
            const now = performance.now();
            if (now - lastMove > 30000) maybeGreet(world);   // checked at most every 30 s
            lastMove = now;
        });
        // Dev console / test harness only: DeskVisitors.send('cat'), DeskVisitors.runner.state
        if (DEV) window.DeskVisitors = { send, job: jobVisit, tryJob, runner, list: visitors, inQuietHours, inCall, inBusy, welcome: () => welcome(world), visitOptions, greet: () => maybeGreet(world) };
    },

    onConfig(c) {
        const freqBefore = cfg.visitor_frequency;
        for (const k in cfg) if (c[k] !== undefined && c[k] !== null) cfg[k] = c[k];
        if (!cfg.visitor_prefs || typeof cfg.visitor_prefs !== 'object') cfg.visitor_prefs = {};
        if (c.visitors === false) runner?.stop();
        if (cfg.visitor_frequency !== freqBefore) schedule(performance.now());
    },

    onRender(world, now, dt) {
        if (!runner) return;
        if (!runner.active && cfg.visitors && now >= next) {
            const busy = !welcome(world) || now - lastTyping < TYPING_BUSY_MS;
            if (busy) next = now + RETRY_MS;
            else {
                send();
                schedule(now);
            }
        }
        runner.render(now, dt);
        world.visitorActive = runner.active;
        if (!runner.active) featureVisit = false;
    },
});
