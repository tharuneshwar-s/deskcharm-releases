// DeskCharm Pro in the overlay: keeps the licence status (src-tauri/src/license.rs:
// license_status, `license-changed`) on world.license, re-applies the saved config when it changes
// (app.js gates it through DeskPro.effective: fallback charm, one charm, focus guard and calendar
// quiet off on the free tier; settings stay saved), and shows the gentle trial cues once each:
// trial day 5, day 7 and "trial ended" (src/js/pro.js dueCue). Shown cues live in localStorage.
// Embedded (website, Settings preview) there is no status: everything stays unlocked, no cues.

import { registerFeature } from '../features.js';
import { OverlayUI } from '../overlay-ui.js';
import { t } from '../i18n.js';
import '../pro.js';

const KEY = 'deskcharm.pro-cues';
const CUE_MS = 8000;
const CHECK_MS = 60 * 1000;

let world = null;
let ui = null;
let cue = null;   // { text, until }

function seen() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function markSeen(key) {
    const s = seen();
    s[key] = true;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function maybeCue() {
    if (!world || cue || world.onboarding || world.hidden) return;
    const due = globalThis.DeskPro.dueCue(world.license, seen());
    if (!due) return;
    markSeen(due.key);
    cue = { text: t(due.text, due.vars), until: Date.now() + CUE_MS };
    world.keepAwake?.(CUE_MS);
}

function setStatus(status) {
    if (!status) return;
    world.license = status;
    world.reapplyConfig?.();
    maybeCue();
}

registerFeature({
    onInit(w) {
        world = w;
        ui = new OverlayUI(w.layers.ui, 1);
        const invoke = window.__TAURI__?.core?.invoke;
        if (!invoke) return;
        invoke('license_status').then(setStatus, () => {});
        w.listen('license-changed', (e) => setStatus(e.payload));
        setInterval(maybeCue, CHECK_MS);
    },

    onRender(w, now, dt) {
        const view = w.charms[0]?.view;
        if (!view) return;
        if (cue && Date.now() >= cue.until) cue = null;
        ui.follow(view, dt);
        ui.setCue(cue ? cue.text : null, true);
        if (ui.render(dt)) w.keepAwake?.(200);
    },
});
