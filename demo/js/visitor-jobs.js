// Who visits for what (Settings › Visitors › "Who visits for what"): the one place that decides
// which visitor does a job (water, stretch, a reminder, a counter…). Pure functions shared by the
// overlay (features/visitors.js resolves every feature visit here) and Settings.
// Classic script that also works as a side-effect ES module import: defines
// globalThis.DeskVisitorJobs (needs src/js/pro.js for the licence check).
//
// Config (lib.rs AppConfig):
//   visitor_mode          'auto' | 'favourite' | 'custom' (Pro; free falls back to Auto)
//   visitor_favourite     visitor id for every job ('' = Auto)
//   visitor_jobs          Custom: { job: visitor id | 'auto' | 'charm' }
//   visitor_job_messages  Pro: { job: text } shown as typed instead of the default line
//   visitor_lines         Pro: { visitor id: { hello, bye } } shown as typed
//   visitor_prefs[id].on  false = that visitor is switched off (never chosen)
//
// Auto: the job's specialist most of the time; OTHER_SHARE of the time (or when no specialist is
// on) another enabled everyday visitor. A visitor without a special act for the job does the
// generic job act (visitors/jobs.js). visitorFor() returns '' for "charm only" (by choice, or
// nobody available): the feature keeps its charm cue and sends no one.
(function() {
    /** Marks overlay text for translation (scripts/i18n-strings.mjs); the overlay calls t() on it. */
    function tx(text) { return text; }

    var OTHER_SHARE = 0.25;
    var EVERYDAY = ['elephant', 'cat', 'peacock', 'monkey', 'yogi', 'vijay'];
    var MAX_MESSAGE = 80;
    var MAX_LINE = 40;

    // label: Settings row; line: the generic act's default question / line (t() template);
    // specialists: Auto's best fit; charm: 'Charm only' is offered.
    var JOBS = [
        { id: 'water', label: 'Water', specialists: ['vijay'], charm: false, line: tx('Drink some water? 💧') },
        { id: 'stretch', label: 'Stretch', specialists: ['yogi'], charm: false, line: tx('Time to stretch? 🙆') },
        { id: 'posture', label: 'Posture', specialists: ['yogi'], charm: false, line: tx('Sit tall? 🧘') },
        { id: 'break', label: 'Break', specialists: ['chai'], charm: true, line: tx('Chai break? ☕') },
        { id: 'eye_rest', label: 'Eye rest', specialists: ['bird'], charm: true, line: tx('Look 20 ft away 👀') },
        { id: 'reminder', label: 'Reminders', specialists: [], charm: true, line: '' },
        { id: 'focus_nudge', label: 'Focus guard', specialists: [], charm: true, line: tx('Back to focus? 🎯') },
        { id: 'mood_cheer', label: 'Mood cheer', specialists: ['cat', 'vijay'], charm: true, line: tx('You’ve got this! 💛') },
        { id: 'greeting', label: 'Morning hello', specialists: [], charm: true, line: tx('Good morning! ☀️') },
        { id: 'counter', label: 'Counters', specialists: [], charm: false, line: tx('{name}? {emoji}') }
    ];
    var BY_ID = {};
    for (var i = 0; i < JOBS.length; i++) BY_ID[JOBS[i].id] = JOBS[i];

    // Visitors with their own act for a job; everyone else does the generic job act.
    var SPECIAL_ACTS = { vijay: ['water'], yogi: ['stretch', 'posture'], chai: ['break'], bird: ['eye_rest'] };

    function job(id) { return BY_ID[id] || null; }

    function hasSpecialAct(visitorId, jobId) {
        var acts = SPECIAL_ACTS[visitorId];
        return !!acts && acts.indexOf(jobId) >= 0;
    }

    function pro(license) {
        var P = globalThis.DeskPro;
        return P ? P.isPro(license) : !license || license.tier !== 'free';
    }

    function enabled(cfg, id) {
        var prefs = (cfg && cfg.visitor_prefs) || {};
        return !!id && !(prefs[id] && prefs[id].on === false);
    }

    /** The mode in effect: Custom needs Pro (free → Auto; the saved choice is kept). */
    function modeOf(cfg, license) {
        var m = cfg && cfg.visitor_mode;
        if (m === 'favourite') return m;
        if (m === 'custom') return pro(license) ? m : 'auto';
        return 'auto';
    }

    function pickOne(list, rand) {
        return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
    }

    function auto(j, cfg, rand, everyday) {
        var specs = j.specialists.filter(function(id) { return enabled(cfg, id); });
        var others = everyday.filter(function(id) { return enabled(cfg, id) && specs.indexOf(id) < 0; });
        if (specs.length && (!others.length || rand() >= OTHER_SHARE)) return pickOne(specs, rand);
        return others.length ? pickOne(others, rand) : '';
    }

    /**
     * Visitor id for `jobId` under `cfg` and licence `license`, or '' for charm only / nobody.
     * opts: { rand (0…1, default Math.random), everyday (ids of the everyday visitors) }.
     */
    function visitorFor(jobId, cfg, license, opts) {
        var j = job(jobId);
        if (!j) return '';
        opts = opts || {};
        var rand = opts.rand || Math.random;
        var everyday = opts.everyday || EVERYDAY;
        cfg = cfg || {};
        var mode = modeOf(cfg, license);
        if (mode === 'favourite' && enabled(cfg, cfg.visitor_favourite)) return cfg.visitor_favourite;
        if (mode === 'custom') {
            var v = (cfg.visitor_jobs || {})[jobId];
            if (v === 'charm' && j.charm) return '';
            if (v && v !== 'auto' && v !== 'charm' && enabled(cfg, v)) return v;
        }
        return auto(j, cfg, rand, everyday);
    }

    /** Pro: the user's own line for `jobId` (shown as typed), or '' (use the default). */
    function jobMessage(jobId, cfg, license) {
        if (!pro(license)) return '';
        var m = cfg && cfg.visitor_job_messages && cfg.visitor_job_messages[jobId];
        return typeof m === 'string' ? m.trim().slice(0, MAX_MESSAGE) : '';
    }

    /** Pro: visitor `id`'s own 'hello' or 'bye' line (shown as typed), or ''. */
    function visitorLine(id, kind, cfg, license) {
        if (!pro(license)) return '';
        var l = cfg && cfg.visitor_lines && cfg.visitor_lines[id];
        var s = l && l[kind];
        return typeof s === 'string' ? s.trim().slice(0, MAX_LINE) : '';
    }

    globalThis.DeskVisitorJobs = {
        JOBS: JOBS,
        EVERYDAY: EVERYDAY,
        OTHER_SHARE: OTHER_SHARE,
        SPECIAL_ACTS: SPECIAL_ACTS,
        MAX_MESSAGE: MAX_MESSAGE,
        MAX_LINE: MAX_LINE,
        job: job,
        hasSpecialAct: hasSpecialAct,
        modeOf: modeOf,
        visitorFor: visitorFor,
        jobMessage: jobMessage,
        visitorLine: visitorLine
    };
})();
