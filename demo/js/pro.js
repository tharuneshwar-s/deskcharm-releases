// DeskCharm Pro: free vs Pro decisions shared by Settings and the overlay (pure functions).
// Classic script that also works as a side-effect ES module import: defines globalThis.DeskPro.
// Licence status comes from Rust (src-tauri/src/license.rs): license_status / license-changed
// { tier: 'pro'|'trial'|'free', source, trial_days_left, trial_ends, key_id? }.
//
// Free: Nazar + Gods + this month's rotating pack, the first custom charm, one charm, Insights
// last 7 days. Pro (and the 7-day trial): every pack, unlimited custom charms, two charms,
// Insights history + This week, focus guard, calendar quiet. Trial end is a gentle fallback:
// saved settings are kept; only what is shown or running changes (effective()).
(function() {
    var FREE_PACKS = ['nazar', 'gods'];
    // Month → rotating free pack (Jan … Dec), docs/plan/pricing-and-integrations.md §2.1.
    var ROTATION = ['temple', 'crystals', 'lucky', 'zodiac', 'friends', 'birthstones',
        'crystals', 'temple', 'zodiac', 'lucky', 'friends', 'birthstones'];
    var PRICE_LABEL = '₹69';
    // Pro card + upsell: launch price, then the regular price (₹ only; website checkout).
    var PRICE_TEXT = '₹69 launch / ₹99';
    var FREE_INSIGHT_DAYS = 7;
    var FALLBACK_CHARM_ID = 'nazar-blue';
    var FREE_COUNTERS = 1;
    var FREE_TRACKED_REMINDERS = 3;
    /** Marks overlay text for translation (scripts/i18n-strings.mjs); the overlay calls t() on it. */
    function tx(text) { return text; }

    /** Rotating free pack for `month` (1–12) or a Date (local month). */
    function freePackFor(month) {
        var m = month instanceof Date ? month.getMonth() : Number(month) - 1;
        return ROTATION[((m % 12) + 12) % 12];
    }

    /** Unknown status (no Tauri: website demo, Settings preview) counts as unlocked. */
    function isPro(status) {
        return !status || status.tier !== 'free';
    }

    function isFreePack(packId, date) {
        return FREE_PACKS.indexOf(packId) >= 0 || packId === freePackFor(date || new Date());
    }

    /** Pack id of catalog charm `id` ('custom' for user charms), or null. */
    function packOf(id, catalog) {
        if (typeof id === 'string' && id.indexOf('custom-') === 0) return 'custom';
        var cats = (catalog && catalog.categories) || [];
        for (var c = 0; c < cats.length; c++) {
            for (var i = 0; i < cats[c].charms.length; i++) if (cats[c].charms[i].id === id) return cats[c].id;
        }
        return null;
    }

    /** Index of custom charm `id` in the user's list (config custom_charms), -1 if absent. */
    function customIndex(id, customCharms) {
        var list = customCharms || [];
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
        return -1;
    }

    /**
     * Free-tier charm (regardless of licence): free or this month's pack, the first custom charm,
     * or the charm last picked while it was free (a rotating-pack charm keeps hanging after the
     * month changes until the user changes charm). Unknown ids (not in the catalog) are free.
     */
    function charmIsFree(id, cfg, catalog, date) {
        if (!id) return true;
        var last = cfg && cfg.last_free_charm;
        if (last && last.id === id) return true;
        var pack = packOf(id, catalog);
        if (pack === 'custom') return customIndex(id, cfg && cfg.custom_charms) === 0;
        if (pack === null) return true;
        return isFreePack(pack, date);
    }

    /** Can the user add another custom charm? */
    function canAddCustom(status, customCount) {
        return isPro(status) || (customCount || 0) < 1;
    }

    /** Can the user add another counter (Settings › Calm › Counters)? */
    function canAddCounter(status, count) {
        return isPro(status) || (count || 0) < FREE_COUNTERS;
    }

    /** Can one more reminder be tracked ("Track it")? `trackedCount` = already tracked. */
    function canTrackReminder(status, trackedCount) {
        return isPro(status) || (trackedCount || 0) < FREE_TRACKED_REMINDERS;
    }

    function insightDays(status, kept) {
        return isPro(status) ? kept : Math.min(kept, FREE_INSIGHT_DAYS);
    }

    /**
     * Overrides that make a saved config free-tier for the overlay (null = nothing to change).
     * The saved config is never rewritten: everything returns once Pro is back.
     * A locked charm falls back to last_free_charm (charm_data = it), or to Classic Blue with
     * charm_data null (the caller supplies that data).
     */
    function effective(cfg, status, catalog, date) {
        if (isPro(status) || !cfg) return null;
        var out = {};
        var changed = false;
        if (!charmIsFree(cfg.charm, cfg, catalog, date)) {
            var last = cfg.last_free_charm && cfg.last_free_charm.id ? cfg.last_free_charm : null;
            out.charm = last ? last.id : FALLBACK_CHARM_ID;
            out.charm_data = last;
            changed = true;
        }
        if (cfg.charm_count === 2) { out.charm_count = 1; changed = true; }
        if (cfg.focus_guard) { out.focus_guard = false; changed = true; }
        if (cfg.calendar_quiet) { out.calendar_quiet = false; changed = true; }
        if (Array.isArray(cfg.counters) && cfg.counters.length > FREE_COUNTERS) {
            out.counters = cfg.counters.slice(0, FREE_COUNTERS);
            changed = true;
        }
        return changed ? out : null;
    }

    /**
     * The one overlay cue due for this status, or null: trial day 5 and day 7 (one each), and the
     * trial-ended cue once. `seen` = { [key]: true } of cues already shown.
     * Returns { key, text, vars } (text is a t() template).
     */
    function dueCue(status, seen) {
        if (!status) return null;
        seen = seen || {};
        var cue = null;
        if (status.tier === 'trial') {
            var left = status.trial_days_left;
            // Day 5 (3 days left counting today): "2 days of Pro left" after today; day 7 = last day.
            if (left === 3) cue = { key: 'trial-day5-' + status.trial_ends, text: tx('{n} days of Pro left ✨'), vars: { n: 2 } };
            else if (left === 1) cue = { key: 'trial-day7-' + status.trial_ends, text: tx('Last day of your Pro trial ✨'), vars: {} };
        } else if (status.tier === 'free' && status.trial_days_left === 0) {
            cue = { key: 'trial-ended-' + status.trial_ends, text: tx('Your Pro trial ended — lifetime Pro is {price}'), vars: { price: PRICE_LABEL } };
        }
        return cue && !seen[cue.key] ? cue : null;
    }

    globalThis.DeskPro = {
        FREE_PACKS: FREE_PACKS,
        ROTATION: ROTATION,
        PRICE_LABEL: PRICE_LABEL,
        PRICE_TEXT: PRICE_TEXT,
        FREE_INSIGHT_DAYS: FREE_INSIGHT_DAYS,
        FALLBACK_CHARM_ID: FALLBACK_CHARM_ID,
        freePackFor: freePackFor,
        isPro: isPro,
        isFreePack: isFreePack,
        packOf: packOf,
        charmIsFree: charmIsFree,
        canAddCustom: canAddCustom,
        FREE_COUNTERS: FREE_COUNTERS,
        FREE_TRACKED_REMINDERS: FREE_TRACKED_REMINDERS,
        canAddCounter: canAddCounter,
        canTrackReminder: canTrackReminder,
        insightDays: insightDays,
        effective: effective,
        dueCue: dueCue
    };
})();
