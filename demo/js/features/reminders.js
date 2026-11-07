// Reminders (the user's own; Settings › Calm › Reminders). Rust owns the schedule
// (src-tauri/src/reminders.rs) and sends `reminder-due` { id, text, visitor } when one is due
// (it also shows the Windows notification). Here: a soft chime and the text beside the charm
// exactly as typed (no t()), and, if a visitor was chosen ('auto': job 'reminder' via "Who visits
// for what"; an id: that visitor; '': none) and visitors are on, it comes and asks the text with
// Done / Later (desk:visitor-job → engine opts.reminder). The answer goes back as
// `reminder-ack` { id, action: 'done' | 'later' | 'ignored' }; Rust snoozes Later 10 min and an
// ignored one 10 min once. A visitor that can't come right now (another one is out, hidden, a
// call) is tried again every RETRY_MS for RETRY_FOR_MS; then only the cue and notification remain.

import { registerFeature } from '../features.js';
import { OverlayUI } from '../overlay-ui.js';
import { tone } from '../audio.js';
import { DEV } from '../dev.js';

const CUE_MS = 9000;
const RETRY_MS = 15 * 1000;
const RETRY_FOR_MS = 2 * 60 * 1000;
const MAX_TEXT = 80;

let world = null;
let ui = null;
let cue = null;                   // { text, until }
const waiting = new Map();        // reminder id → { text, visitor, until } (visitor not out yet)

function chime() {
    tone(783.99, 0.03, 1.6);
    tone(1046.5, 0.022, 1.8, 0.2);
}

function ack(id, action) {
    world.emit('reminder-ack', { id, action });
}

/**
 * Send `visitor` ('auto' or an id) with the reminder question; false if it can't come now (true
 * also when nobody does this job: "Charm only"; then there is nothing to retry).
 */
function sendVisitor(id, text, visitor) {
    if (!world.config.visitors) return false;
    const detail = {
        job: 'reminder',
        id: visitor === 'auto' ? undefined : visitor,
        data: { text },
        onAnswer: (action) => ack(id, action),
    };
    window.dispatchEvent(new CustomEvent('desk:visitor-job', { detail }));
    return !!detail.sent || detail.visitor === '';
}

function deliver(p) {
    const text = String(p?.text || '').trim().slice(0, MAX_TEXT);
    if (!text) return;
    const id = String(p.id || '');
    chime();
    cue = { text, until: Date.now() + CUE_MS };
    world.keepAwake?.(CUE_MS);
    const visitor = String(p.visitor || '');
    if (visitor && !sendVisitor(id, text, visitor) && world.config.visitors) {
        waiting.set(id, { text, visitor, until: Date.now() + RETRY_FOR_MS });
    }
}

function retry() {
    const now = Date.now();
    for (const [id, w] of waiting) {
        if (now > w.until || sendVisitor(id, w.text, w.visitor)) waiting.delete(id);
    }
}

registerFeature({
    onInit(w) {
        world = w;
        ui = new OverlayUI(w.layers.ui, 2.5);   // above ritual (1) and wellness (2), below onboarding tips (3)
        w.listen('reminder-due', (e) => deliver(e.payload));
        setInterval(retry, RETRY_MS);
        if (DEV) window.DeskReminders = { fire: (text = 'Call mum 📞', visitor = 'vijay') => deliver({ id: 'dev', text, visitor }) };
    },

    onRender(w, now, dt) {
        const view = w.charms[0]?.view;
        if (!view) return;
        if (cue && Date.now() >= cue.until) cue = null;
        ui.follow(view, dt);
        ui.setCue(cue && !w.onboarding ? cue.text : null, true);
        if (ui.render(dt)) w.keepAwake?.(200);
    },
});
