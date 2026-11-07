// Focus guard: during a focus session Rust (src-tauri/src/focus_guard.rs) reports a listed
// distracting app in front as `env-distraction` { app }. The focus visitor (job 'focus_nudge',
// features/visitors.js) walks over and asks "Back to focus? 🎯" — at most once every NUDGE_GAP_MS. Config: focus_guard (on/off); the app
// list (focus_guard_apps) is only used in Rust.

import { registerFeature } from '../features.js';

export const NUDGE_GAP_MS = 5 * 60 * 1000;

let on = false;
let lastNudge = -Infinity;

/** A nudge may go out now (opt-in on, last one long enough ago). */
export function mayNudge(now = Date.now()) {
    return on && now - lastNudge >= NUDGE_GAP_MS;
}

/** Handle one distraction report; returns whether a visitor was sent. */
export function onDistraction(now = Date.now()) {
    if (!mayNudge(now)) return false;
    const detail = { job: 'focus_nudge' };
    window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail }));
    if (detail.sent) lastNudge = now;
    return !!detail.sent;
}

registerFeature({
    onInit(world) {
        world.listen('env-distraction', () => onDistraction());
    },
    onConfig(cfg) {
        if (cfg.focus_guard !== undefined) on = !!cfg.focus_guard;
    },
});
