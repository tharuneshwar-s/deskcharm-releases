// Live weather wind: approximate location from the IP address, current wind from Open-Meteo,
// refreshed every 30 minutes while enabled. Every network failure resolves to "no data": the
// wind fades out and the fetch is retried later. Nothing is logged and nothing throws.
//
// Hosts (CSP connect-src in tauri.conf.json): ipwho.is, ipapi.co (fallback), api.open-meteo.com.

import { setWind } from './forces.js';

const REFRESH_MS = 30 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const MAX_BASE = 0.03;             // px/step² at ≥ 45 km/h; gusts add up to +50 % (gravity is 0.13)
const FULL_KMH = 45;
const RAMP_S = 4;                  // fade in/out time so toggling never jerks the rope
const WIND_ID = 'weather';
// Gust periods (s): 9, 23 and 4.7 never line up, so the variation doesn't feel periodic.
const GUST_W1 = (Math.PI * 2) / 9;
const GUST_W2 = (Math.PI * 2) / 23;
const GUST_W3 = (Math.PI * 2) / 4.7;

let enabled = false;
let generation = 0;                // bumps on every toggle so late responses are ignored
let timer = null;
let place = null;                  // { lat, lon }, rounded — cached for the session
/** Last good reading { kmh, dirDeg, gustiness }; kept after it goes stale so the wind can fade. */
let reading = null;
let live = false;                  // enabled and the reading is current
let amp = 0;                       // 0..1 fade
let windSet = false;

/** GET JSON with a timeout. Resolves null on any failure (offline, blocked, bad JSON, HTTP error). */
async function getJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(t);
    }
}

function coords(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    // Two decimals (~1 km) is plenty for wind and keeps the request coarse.
    return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

async function locate() {
    const a = await getJson('https://ipwho.is/?fields=success,latitude,longitude');
    if (a && a.success !== false) {
        const c = coords(Number(a.latitude), Number(a.longitude));
        if (c) return c;
    }
    const b = await getJson('https://ipapi.co/json/');
    if (b && !b.error) return coords(Number(b.latitude), Number(b.longitude));
    return null;
}

async function refresh() {
    const gen = generation;
    timer = null;
    try {
        if (!place) place = await locate();
        if (gen !== generation) return;

        let ok = false;
        if (place) {
            const data = await getJson('https://api.open-meteo.com/v1/forecast' +
                `?latitude=${place.lat}&longitude=${place.lon}` +
                '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh');
            if (gen !== generation) return;
            const c = data && data.current;
            const kmh = c ? Number(c.wind_speed_10m) : NaN;
            const dirDeg = c ? Number(c.wind_direction_10m) : NaN;
            if (Number.isFinite(kmh) && Number.isFinite(dirDeg)) {
                const gusts = Number(c.wind_gusts_10m);
                const gustiness = Number.isFinite(gusts) && kmh > 1
                    ? Math.min(1, Math.max(0.2, (gusts - kmh) / kmh))
                    : 0.4;
                reading = { kmh: Math.max(0, kmh), dirDeg, gustiness };
                ok = true;
            }
        }
        live = ok;
        timer = setTimeout(refresh, ok ? REFRESH_MS : RETRY_MS);
    } catch {
        // Defensive: getJson never rejects, but a refresh must never surface an error.
        if (gen !== generation) return;
        live = false;
        timer = setTimeout(refresh, RETRY_MS);
    }
}

function onOnline() {
    // Back online after a failure: fetch now instead of waiting for the retry timer.
    if (enabled && !live) {
        clearTimeout(timer);
        refresh();
    }
}

export function setWeatherEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    generation++;
    clearTimeout(timer);
    timer = null;
    live = false;
    if (on) {
        window.addEventListener('online', onOnline);
        refresh();
    } else {
        window.removeEventListener('online', onOnline);
    }
}

/**
 * Per physics step (dt in seconds): base wind from the live speed, horizontal sign from the
 * direction, with a slow gusting variation so the charm sways instead of only leaning.
 */
export function stepWeather(dt) {
    const target = live ? 1 : 0;
    if (amp !== target) amp += Math.sign(target - amp) * Math.min(Math.abs(target - amp), dt / RAMP_S);
    if (amp <= 0 || !reading) {
        if (windSet) {
            setWind(WIND_ID, 0);
            windSet = false;
        }
        return;
    }

    const base = MAX_BASE * Math.sqrt(Math.min(1, reading.kmh / FULL_KMH));
    // Meteorological direction is where the wind comes FROM (0° = north, 90° = east); it blows
    // toward dir + 180°. With west = screen left, its eastward component is -sin(dir). A wind
    // along the screen's depth still sways a hanging charm, so keep at least 35 % of it.
    const east = -Math.sin(reading.dirDeg * Math.PI / 180);
    const side = (east < 0 ? -1 : 1) * (0.35 + 0.65 * Math.abs(east));
    const t = performance.now() / 1000;
    const gust = 0.5 * Math.sin(t * GUST_W1) + 0.3 * Math.sin(t * GUST_W2 + 1.3) + 0.2 * Math.sin(t * GUST_W3 + 2.1);
    const vx = side * base * (1 + 0.5 * reading.gustiness * gust) * amp;
    setWind(WIND_ID, vx, 0);
    windSet = vx !== 0;
}

/** Status for previews/debugging: { enabled, live, kmh, dirDeg } (kmh/dirDeg null when unknown). */
export function weatherStatus() {
    return { enabled, live, kmh: reading ? reading.kmh : null, dirDeg: reading ? reading.dirDeg : null };
}
