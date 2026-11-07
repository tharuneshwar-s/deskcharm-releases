// Focus tasks: "What are you working on?" when a focus session starts, the task on the charm's
// timer line during focus ("24:12 · Write report"), and "Done? Click the charm ✔" when the
// focus phase ends (click = done, ignore = the task stays open and carries over).
//
// The overlay is click-through and can't take typing, so the question is asked in a tiny
// always-on-top window next to the charm (src/task-prompt.html, opened by src-tauri/src/tasks.rs
// on `task-prompt` { x, y }). It answers with `task-chosen` { id, text } | { skip: true }.
// Tasks live in Rust (tasks.json); this module only invokes tasks_complete.
// Events in: wellness-command (a { task } rides along when picked from the quick menu),
// task-chosen, task-command ({ action: 'done' | 'prompt' | 'set', task }), desk:focus (wellness.js).
// Event out: task-current ({ id, text } | null) so the quick menu can offer "Done".

import { registerFeature } from '../features.js';
import { tx, t } from '../i18n.js';
import { focusRunning, focusPhaseActive, setFocusLabel, focusNotice } from './wellness.js';

const DONE_ASK_MS = 60 * 1000;     // break-start "Done?" cue
const STOP_ASK_MS = 15 * 1000;     // after stopping focus by hand
const PROMPT_DELAY_MS = 400;       // lets a task picked from the menu arrive first

/**
 * What to do on a focus session change (`state` from wellness.js desk:focus).
 * Returns 'prompt' (ask for a task), 'ask-done' (cue "Done?"), 'end' (ask "Done?" and forget
 * the task on the charm) or null.
 */
export function focusAction(state, { current, skipped }) {
    switch (state) {
        case 'start': return current ? null : 'prompt';
        case 'focus': return current || skipped ? null : 'prompt';
        case 'break': return current ? 'ask-done' : null;
        case 'stop': return current ? 'end' : null;
        default: return null;
    }
}

/** A `task-chosen` / menu payload → { id, text } or null. */
export function parseTask(p) {
    if (!p || p.skip || !Number.isFinite(Number(p.id))) return null;
    const text = String(p.text || '').trim();
    return text ? { id: Number(p.id), text } : null;
}

let world = null;
let current = null;    // { id, text }
let skipped = false;   // Esc in the prompt: don't ask again this session

function invoke(cmd, args) {
    const core = (window.DeskHostApi || window.__TAURI__)?.core;
    return core ? core.invoke(cmd, args) : Promise.reject(new Error('no backend'));
}

function setCurrent(task) {
    current = task;
    setFocusLabel(task ? task.text : null);
    world.emit('task-current', task);
}

function prompt() {
    const view = world.charms[0]?.view;
    const end = view?.rope?.end;
    const at = view && end !== undefined ? { x: Math.round(view.rx[end]), y: Math.round(view.ry[end]) } : {};
    world.emit('task-prompt', at);
}

function markDone(task) {
    if (!task) return;
    invoke('tasks_complete', { id: task.id }).catch(() => {});
    if (current && current.id === task.id) setCurrent(null);
    focusNotice(tx('Task done ✔'), null, 4000, null);
}

function askDone(ms, sub) {
    const task = current;
    focusNotice(tx('Done? Click the charm ✔'), sub, ms, () => markDone(task));
}

function onFocus(state) {
    if (state === 'start') skipped = false;
    // A task picked from the quick menu arrives with the same command, just after this.
    const run = () => {
        switch (focusAction(state, { current, skipped })) {
            case 'prompt': if (focusPhaseActive()) prompt(); break;
            case 'ask-done': askDone(DONE_ASK_MS, null); break;
            case 'end':
                askDone(STOP_ASK_MS, t('Ignore to keep it for later'));
                setCurrent(null);
                break;
        }
    };
    if (state === 'start') setTimeout(run, PROMPT_DELAY_MS);
    else run();
}

function onCommand(p) {
    switch (p && p.action) {
        case 'done': markDone(current); break;
        case 'prompt': prompt(); break;
        case 'set': { const task = parseTask(p.task); if (task && focusRunning()) setCurrent(task); break; }
    }
}

registerFeature({
    onInit(w) {
        world = w;
        window.addEventListener('desk:focus', (e) => onFocus(e.detail && e.detail.state));
        w.listen('wellness-command', (e) => {
            const p = e.payload || {};
            const task = p.action === 'focus' ? parseTask(p.task) : null;
            if (task) setCurrent(task);
        });
        w.listen('task-chosen', (e) => {
            if (!focusRunning()) return;
            const task = parseTask(e.payload);
            if (task) setCurrent(task);
            else skipped = true;
        });
        w.listen('task-command', (e) => onCommand(e.payload));
        // Reload: nothing is running, so nothing is on the charm.
        w.emit('task-current', null);
    },
});
