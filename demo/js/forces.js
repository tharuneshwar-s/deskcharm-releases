// Ambient wind registry. Feature modules (music, typing, weather, window shake...) each own a
// named wind source; ropes apply the sum every physics step, weighted toward the free end.
// Units: px per physics step² (gravity is 0.13 for scale).

const winds = new Map();

/** Set or clear (0, 0) a named wind source. */
export function setWind(id, vx, vy = 0) {
    if (vx === 0 && vy === 0) winds.delete(id);
    else winds.set(id, { vx, vy });
}

/** Sum of all active wind sources. */
export function totalWind() {
    let vx = 0, vy = 0;
    for (const w of winds.values()) {
        vx += w.vx;
        vy += w.vy;
    }
    return { vx, vy };
}
