// "What are you working on?" window (src/task-prompt.html), opened by src-tauri/src/tasks.rs
// next to the charm when a focus session starts. Type a new task or pick an open one; Enter
// starts it, Esc skips. Answers the overlay with `task-chosen` { id, text } | { skip: true }
// and hides itself (Rust reuses the window and sends `task-prompt-refresh` to reload the list).
// Language comes from ?lang= (the overlay's ui_language).

import { setLanguage, t } from './i18n.js';

const api = window.__TAURI__;
const input = document.getElementById('text');
const list = document.getElementById('list');
let tasks = [];
let sel = -1;
let busy = false;

function applyLanguage() {
    setLanguage(new URLSearchParams(location.search).get('lang'));
    document.getElementById('title').textContent = t('What are you working on?');
    document.getElementById('pick-label').textContent = t('Or pick an open task');
    document.getElementById('hint').textContent = t('Enter to start · Esc to skip');
    input.placeholder = t('e.g. Write the report');
}

function invoke(cmd, args) {
    return api ? api.core.invoke(cmd, args) : Promise.reject(new Error('no backend'));
}

function render() {
    list.innerHTML = '';
    document.getElementById('pick-label').hidden = !tasks.length;
    tasks.forEach((task, i) => {
        const li = document.createElement('li');
        li.textContent = task.text;
        li.title = task.text;
        li.setAttribute('role', 'option');
        li.classList.toggle('sel', i === sel);
        li.onclick = () => choose(task);
        list.appendChild(li);
    });
}

let shownAt = 0;

async function load() {
    busy = false;
    sel = -1;
    shownAt = Date.now();
    input.value = '';
    try {
        tasks = (await invoke('tasks_list')).filter((x) => !x.done).slice(0, 8);
    } catch {
        tasks = [];
    }
    // The first open task is highlighted, so Enter on an empty box carries it on (typing a new
    // task clears the highlight).
    sel = tasks.length ? 0 : -1;
    render();
    input.focus();
}

async function close(payload) {
    if (api) {
        await api.event.emit('task-chosen', payload);
        await api.window.getCurrentWindow().hide();
    }
}

function choose(task) {
    if (busy) return;
    busy = true;
    close({ id: task.id, text: task.text });
}

async function submit() {
    if (busy) return;
    const text = input.value.trim();
    if (!text) {
        if (sel >= 0) choose(tasks[sel]);
        return;
    }
    busy = true;
    try {
        const task = await invoke('tasks_add', { text });
        await close({ id: task.id, text: task.text });
    } catch {
        busy = false;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) { busy = true; close({ skip: true }); }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && tasks.length) {
        e.preventDefault();
        sel = e.key === 'ArrowDown' ? Math.min(tasks.length - 1, sel + 1) : Math.max(-1, sel - 1);
        if (sel >= 0) input.value = '';
        render();
    }
});
input.addEventListener('input', () => { if (sel !== -1) { sel = -1; render(); } });
// Clicking elsewhere = skip, so an always-on-top window never lingers (ignore the blur that
// can come right as the window is shown).
window.addEventListener('blur', () => {
    if (!busy && Date.now() - shownAt > 800) { busy = true; close({ skip: true }); }
});

applyLanguage();
load();
if (api) {
    api.event.listen('task-prompt-refresh', (e) => {
        if (e.payload && e.payload.lang) history.replaceState(null, '', `?lang=${e.payload.lang}`);
        applyLanguage();
        load();
    });
}
