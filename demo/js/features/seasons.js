// Time & seasons: day/night mood, festival decorations and live weather wind.
// Config: day_night (default on), festival_themes (default on), weather_wind (default off).
//
// Testing previews (independent of config and the date):
//   overlay URL query      index.html?festival=diwali        (any id in FESTIVAL_IDS)
//   overlay devtools       DeskSeasons.previewFestival('holi')   / previewFestival(null) to clear
//                          DeskSeasons.previewHour(21.5)          / previewHour(null) to clear
//                          DeskSeasons.burst()                    New Year midnight burst now
//                          DeskSeasons.status()                   current festival / mood / weather

import { registerFeature } from '../features.js';
import { activeFestival, FESTIVAL_IDS } from '../festivals.js';
import { createDecor, ensureDecorDefs, setDecorReducedMotion } from '../festival-decor.js';
import { setWeatherEnabled, stepWeather, weatherStatus } from '../weather.js';

const FIXED_DT = 1 / 120;
const CLOCK_MS = 1000;             // date/hour re-evaluated once a second
const MOOD_TAU_S = 1.5;            // easing toward the mood target (the target itself moves over minutes)
const DECOR_FADE_S = 1.2;
const DECOR_DX = 46;               // decoration point: px beside the main anchor…
const DECOR_Y = 22;                // …and px below the top edge
const NIGHT_SWAY_CUT = 0.4;        // fraction of the idle sway removed at full night

// ========== DAY / NIGHT ==========
// Mood keyframes by local hour. Night (19:00–06:00) gives the drop shadow a warm amber, lamp-lit
// look and warms the breathing glow; dawn/dusk pass through a soft gold.
const DAY = { shadow: [0x1b, 0x24, 0x40], opacity: 0.22, dy: 14, tint: [255, 255, 255], tintMix: 0, night: 0 };
const GOLD = { shadow: [0x8a, 0x5c, 0x1e], opacity: 0.26, dy: 12, tint: [255, 214, 122], tintMix: 0.25, night: 0.4 };
const NIGHT = { shadow: [0x7a, 0x48, 0x12], opacity: 0.3, dy: 10, tint: [255, 176, 72], tintMix: 0.35, night: 1 };
const MOOD_KEYS = [
    [0, NIGHT], [5.25, NIGHT], [6, GOLD], [7.5, DAY],
    [17, DAY], [18.25, GOLD], [19, NIGHT], [24, NIGHT],
];

function lerp(a, b, k) {
    return a + (b - a) * k;
}

function blend(a, b, k) {
    return {
        shadow: a.shadow.map((v, i) => lerp(v, b.shadow[i], k)),
        opacity: lerp(a.opacity, b.opacity, k),
        dy: lerp(a.dy, b.dy, k),
        tint: a.tint.map((v, i) => lerp(v, b.tint[i], k)),
        tintMix: lerp(a.tintMix, b.tintMix, k),
        night: lerp(a.night, b.night, k),
    };
}

function moodAt(hour) {
    for (let i = 1; i < MOOD_KEYS.length; i++) {
        const [h1, m1] = MOOD_KEYS[i];
        if (hour <= h1) {
            const [h0, m0] = MOOD_KEYS[i - 1];
            const k = (hour - h0) / (h1 - h0);
            return blend(m0, m1, k * k * (3 - 2 * k));
        }
    }
    return NIGHT;
}

function parseHex(color) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// ========== STATE ==========
let world = null;
let dayNight = true;
let festivalsOn = true;
let previewHour = null;
let previewFestival = null;

let mood = blend(DAY, DAY, 0);
let moodTarget = DAY;
let shadowNode = null;
let shadowKey = '';
/** CharmView → { base: charm's own glow colour, set: colour we last wrote }. */
const glowTints = new WeakMap();

let nextClock = 0;
let lastDateKey = '';
/** { id, decor, back, front, fade, leaving } — the current decoration, plus ones fading out. */
let decors = [];
/** Set when the New Year midnight burst should play on the next frame. */
let pendingBurst = false;

function wantedFestival() {
    if (previewFestival) return previewFestival;
    if (!festivalsOn) return null;
    const f = activeFestival(new Date());
    return f ? f.id : null;
}

function startDecor(id) {
    const back = world.layers.back.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
    const front = world.layers.front.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
    for (const g of [back, front]) {
        g.setAttribute('pointer-events', 'none');
        g.setAttribute('opacity', 0);
    }
    const decor = createDecor(id, back, front);
    if (!decor) {
        back.remove();
        front.remove();
        return;
    }
    decors.push({ id, decor, back, front, fade: 0, leaving: false });
}

function syncFestival() {
    const id = wantedFestival();
    const current = decors.find((d) => !d.leaving);
    if (current && current.id === id) return;
    if (current) current.leaving = true;
    if (id) {
        startDecor(id);
        // A New Year preview shows the midnight burst straight away.
        if (id === 'newyear' && previewFestival === 'newyear') pendingBurst = true;
    }
}

function decorScene() {
    const ax = world.anchorX(0);
    let side = ax > window.innerWidth / 2 ? -1 : 1;     // toward the screen's middle
    // Keep clear of a second charm hanging on that side.
    if (world.charms.some((c) => c.anchorDX && Math.sign(c.anchorDX) === side && Math.abs(c.anchorDX) < DECOR_DX + 70)) {
        side = -side;
    }
    return { x: ax + side * DECOR_DX, y: DECOR_Y, side, charms: world.charms };
}

function clockTick() {
    const date = new Date();
    const hour = previewHour ?? date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    moodTarget = dayNight ? moodAt(hour) : DAY;

    // New Year: sparkle burst when the clock crosses midnight into Jan 1.
    const key = `${date.getMonth()}-${date.getDate()}`;
    if (lastDateKey === '11-31' && key === '0-1') pendingBurst = true;
    lastDateKey = key;

    syncFestival();
}

// ========== RENDER HELPERS ==========
function applyMood(dt) {
    const k = 1 - Math.exp(-dt / MOOD_TAU_S);
    mood = blend(mood, moodTarget, k);

    if (shadowNode) {
        const color = toHex(mood.shadow);
        const op = mood.opacity.toFixed(3);
        const dy = mood.dy.toFixed(1);
        const key = color + op + dy;
        if (key !== shadowKey) {
            shadowKey = key;
            shadowNode.setAttribute('flood-color', color);
            shadowNode.setAttribute('flood-opacity', op);
            shadowNode.setAttribute('dy', dy);
        }
    }

    for (const c of world.charms) {
        const glow = c.view.glow;
        if (!glow) continue;
        let t = glowTints.get(c.view);
        const attr = glow.getAttribute('fill');
        // The charm (re)applied its own colour since we last tinted: that is the new base.
        if (!t || attr !== t.set) {
            t = { base: attr, set: attr };
            glowTints.set(c.view, t);
        }
        const base = parseHex(t.base);
        if (!base) continue;
        const mixed = toHex(base.map((v, i) => lerp(v, mood.tint[i], mood.tintMix)));
        if (mixed !== t.set) {
            glow.setAttribute('fill', mixed);
            t.set = mixed;
        }
    }
}

function renderDecors(now, dt) {
    if (!decors.length) return;
    const scene = decorScene();
    if (pendingBurst) {
        const ny = decors.find((d) => !d.leaving && d.id === 'newyear');
        if (ny && ny.decor.burst) ny.decor.burst(scene);
        pendingBurst = false;
    }
    for (const d of decors) {
        d.fade = d.leaving ? Math.max(0, d.fade - dt / DECOR_FADE_S) : Math.min(1, d.fade + dt / DECOR_FADE_S);
        const op = d.fade.toFixed(3);
        d.back.setAttribute('opacity', op);
        d.front.setAttribute('opacity', op);
        d.decor.render(now, dt, scene);
    }
    decors = decors.filter((d) => {
        if (d.leaving && d.fade <= 0) {
            d.back.remove();
            d.front.remove();
            return false;
        }
        return true;
    });
}

function activeDecor() {
    return decors.find((d) => !d.leaving);
}

// ========== FEATURE ==========
registerFeature({
    onInit(w) {
        world = w;
        const svg = w.layers.back.ownerSVGElement;
        ensureDecorDefs(svg);
        shadowNode = svg.querySelector('#dgShadow feDropShadow');

        const q = new URLSearchParams(window.location.search).get('festival');
        if (q && FESTIVAL_IDS.includes(q)) previewFestival = q;

        w.interaction.on('release', (view) => activeDecor()?.decor.onRelease?.(view));
        w.interaction.on('click', (view) => activeDecor()?.decor.onClick?.(view));

        window.DeskSeasons = {
            festivals: FESTIVAL_IDS,
            previewFestival(id) {
                previewFestival = id && FESTIVAL_IDS.includes(id) ? id : null;
                syncFestival();
            },
            previewHour(hour) {
                previewHour = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : null;
                clockTick();
            },
            burst() {
                pendingBurst = true;
            },
            status() {
                return {
                    festival: activeDecor()?.id ?? null,
                    today: activeFestival(new Date()),
                    mood: { ...mood },
                    weather: weatherStatus(),
                };
            },
        };
        clockTick();
    },

    onConfig(cfg) {
        if (cfg.day_night !== undefined) dayNight = !!cfg.day_night;
        if (cfg.festival_themes !== undefined) festivalsOn = !!cfg.festival_themes;
        if (cfg.weather_wind !== undefined) setWeatherEnabled(!!cfg.weather_wind);
        if (world) clockTick();
    },

    onStep(w) {
        stepWeather(FIXED_DT);

        // Calmer idle sway at night: take back part of the sway Rope.integrate() just added.
        // Mirrors the sway term in rope.js (same conditions: idle animation on, not reduced
        // motion, not calm/held) — otherwise this would push the charm instead of calming it.
        if (mood.night < 0.01 || !w.idleSway) return;
        const t = performance.now() / 1000;
        const sway = (Math.sin(t * 0.3) * 0.012 + Math.sin(t * 0.7 + 0.7) * 0.006) * NIGHT_SWAY_CUT * mood.night;
        for (const c of w.charms) {
            const rope = c.rope;
            if (c.view.glowFade > 0.5 && !rope.held) continue;
            const last = rope.n - 1;
            for (let i = 1; i < rope.n; i++) {
                if (rope.held && i === rope.end) continue;
                rope.px[i] -= sway * (i / last);
            }
        }
    },

    onRender(w, now, dt) {
        setDecorReducedMotion(w.reducedMotion);
        if (now >= nextClock) {
            nextClock = now + CLOCK_MS;
            clockTick();
        }
        applyMood(dt);
        renderDecors(now, dt);
        // Decorations animate continuously (flames, snow, sparkles) unless reduced motion holds
        // them still; a mood change (day/night toggled) eases over a few seconds.
        if ((decors.length && (!w.reducedMotion || decors.some((d) => d.fade < 1))) ||
            Math.abs(mood.night - moodTarget.night) > 0.01 || Math.abs(mood.opacity - moodTarget.opacity) > 0.002) {
            w.keepAwake?.();
        }
    },
});
