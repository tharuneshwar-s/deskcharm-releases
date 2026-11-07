// Today's glasses of water (Settings › Calm › Water reminder). Stored per local day in
// localStorage, so it survives restarts and starts again at 0 each morning.

const KEY = 'deskcharm.water';

let goal = 8;

function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function read() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        return v && v.day === today() ? v.glasses : 0;
    } catch {
        return 0;
    }
}

export function glasses() {
    return read();
}

/** One more glass today; returns the new count. */
export function drank() {
    const n = read() + 1;
    try { localStorage.setItem(KEY, JSON.stringify({ day: today(), glasses: n })); } catch { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent('desk:water-changed', { detail: { glasses: n, goal } }));
    return n;
}

export function waterGoal() {
    return goal;
}

export function setWaterGoal(n) {
    goal = Math.max(1, Math.min(20, Math.round(n) || 8));
}
