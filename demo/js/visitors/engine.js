// Desk visitors: small characters that walk along the top of the taskbar, stop, do a short act
// and walk off. This file holds the parts every visitor shares: the registry, the pose clips,
// and the runner that moves one visitor across the screen. Scheduling and config live in
// features/visitors.js; each visitor's drawing and act live in its own file next to this one.
//
// A visitor definition:
//   id, name           stable id (config) and display name (Settings)
//   group              'everyday' | 'wellness' | 'festival' (Settings gallery)
//   fact               one-line fun fact (Settings "Visitor of the day")
//   variants           [{ id, name, colors }]: looks to choose from; the first is the default.
//                      `colors` maps the drawing's own colours to the variant's
//                      ({ '#c8433a': '#2f6fd0', … }); buildVariant() recolours the built SVG.
//   tricks             optional label of what it does to the charm (Settings "Charm trick" row);
//                      with tricks off, kickCharms / bead helpers become no-ops
//   speed              walking speed, px/s
//   stride             px travelled per walk cycle (step rate = speed / stride: no foot sliding)
//   hit                { w, h }: clickable box, half-width and height above the feet
//   reach              optional: farthest the walking drawing reaches from its centre line, px;
//                      it enters and leaves that far (at least OFF) beyond the screen edge
//   rest               rest pose: numbers are interpolated, strings (eyes, mouth…) switch
//   act                [[t, partialPose], …] act clip; each key carries the previous key's
//                      values forward, and the last key returns to `rest`
//   events             optional [{ t, run(ctx) }]: fired once when the act passes `t`
//   build(root, el)    draw the character facing right, feet at (0, 0), 1 unit = 1 px;
//                      returns its parts
//   walk(pose, phase, amp)  add walk-cycle offsets to `pose` in place (amp 0 … 1)
//   draw(parts, pose, ctx)  write the pose to the parts; ctx = { blink, mode, t, dt, dir, world,
//                      say(text, seconds), kickCharms(vx, vy), beadCount(), hideBead(k),
//                      showBead(k), cloneBead(k) }
//   onClick(ctx)       optional: extra action when clicked (the act replays either way)
//   hello              optional: bubble text when the cursor passes close (default 'Hi! 👋')
//   yelp               optional: bubble text when startled (default 'Whoa! 😱')
//   cueOnly            optional: never picked at random; sent by a feature (e.g. a reminder)
//   festival           optional: festival id (festivals.js); only comes during that festival
//   stopAtCharm        optional: stops under the main charm instead of the configured stop
//   onStartle(ctx)     optional: a charm was flung at it (it yelps and hurries off)
//   onLeave(ctx)       optional: it has left the screen (or was stopped)

import { tone as audioTone } from '../audio.js';
import { t as translate, tx } from '../i18n.js';
import { runJob } from './jobs.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const OFF = 90;                   // start / end this far beyond the screen edges
const AMP_TAU = 0.09;             // walk ↔ act blend time constant (s)
const FADE_S = 0.35;              // reduced motion: fade in / out instead of walking
const BLINK_MS = 130;
const HOVER_PAD = 40;             // px around the hit box where a passing cursor gets a hello
const HOP_TAU = 0.12;

let visitSounds = true;           // sounds of the visitor that is out now (per-visitor setting)

/** audio.js tone() for visitors: silent when this visitor's sounds are off (mute still applies). */
export function tone(...args) {
    if (visitSounds) audioTone(...args);
}

const registry = [];

export function registerVisitor(def) {
    const keys = [];
    let cur = { ...def.rest };
    def.act.forEach(([t, p], i) => {
        cur = i === def.act.length - 1 ? { ...def.rest, ...p } : { ...cur, ...p };
        keys.push({ t, pose: cur });
    });
    def.keys = keys;
    def.actS = keys[keys.length - 1].t;
    def.num = Object.keys(def.rest).filter((k) => typeof def.rest[k] === 'number');
    def.discrete = Object.keys(def.rest).filter((k) => typeof def.rest[k] !== 'number');
    if (!def.variants?.length) def.variants = [{ id: 'default', name: 'Default', colors: {} }];
    registry.push(def);
}

export function visitors() {
    return registry;
}

/** Variant `id` of `def`, or its first (default) variant. */
export function variantOf(def, id) {
    return def.variants.find((v) => v.id === id) || def.variants[0];
}

const PAINT = ['fill', 'stroke', 'stop-color'];

/**
 * Build `def` into `root` in variant `variantId`: the visitor draws itself in its own colours,
 * then every fill / stroke listed in the variant's `colors` map is swapped. Returns the parts.
 */
export function buildVariant(def, root, variantId) {
    const parts = def.build(root, el);
    const map = variantOf(def, variantId).colors || {};
    const swap = {};
    for (const k in map) swap[k.toLowerCase()] = map[k];
    if (Object.keys(swap).length) {
        for (const n of root.querySelectorAll('*')) {
            for (const a of PAINT) {
                const v = n.getAttribute(a);
                if (v && swap[v.toLowerCase()]) n.setAttribute(a, swap[v.toLowerCase()]);
            }
        }
    }
    return parts;
}

export function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
}

const ease = (u) => u * u * (3 - 2 * u);

/** Pose of `def`'s act at time t (s) into `out`. */
function sampleAct(def, t, out) {
    const keys = def.keys;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1] || a;
    const span = b.t - a.t;
    const u = span > 0 ? ease(Math.min(1, Math.max(0, (t - a.t) / span))) : 1;
    for (const k of def.num) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * u;
    // Strings switch at the start of a segment; at the very end of the act they reach the last key.
    const d = u >= 1 && t >= b.t ? b.pose : a.pose;
    for (const k of def.discrete) out[k] = d[k];
    return out;
}

const noop = () => {};

/**
 * Draw `def` into `parts` outside the overlay (Settings cards and preview stage): at act time
 * `t`, or walking at `phase` when `walk` is set. Overlay effects (say, charms, beads) are no-ops.
 */
export function drawPreview(def, parts, t, { walk = false, phase = 0, blink = false } = {}) {
    const pose = sampleAct(def, walk ? def.actS : Math.max(0, Math.min(t, def.actS)), { ...def.rest });
    def.walk(pose, phase, walk ? 1 : 0);
    def.draw(parts, pose, {
        blink, mode: walk ? 'in' : 'act', t, dt: 1 / 60, dir: 1, world: { charms: [] },
        say: noop, ask: noop, jump: noop, opts: { ...DEFAULT_OPTS },
        kickCharms: noop, beadCount: () => 0, hideBead: noop, showBead: noop, cloneBead: () => null,
    });
}

/** The taskbar's top edge in overlay px (the work area's bottom); the window bottom if unknown. */
export function floorY() {
    const bottom = (screen.availTop || 0) + screen.availHeight - window.screenY;
    return bottom > 0 && bottom <= innerHeight ? bottom : innerHeight;
}

/** Per-visit options with their defaults (see createRunner().start). */
const DEFAULT_OPTS = {
    dir: 1, stop: 0.5, say: '', scale: 1, actSpeed: 1, variant: '',
    sounds: true, bubbles: true, tricks: true, hello: true, dance: true, flee: true, greeting: '',
    reminder: null, job: null, bye: '', jobMessage: '', sayRaw: false,
};

/** How long a reminder question waits for Done / Later before it counts as ignored (s). */
export const REMINDER_ASK_S = 120;

/**
 * Moves one visitor at a time: in from one screen edge → act at the stop point → out the far
 * edge. Walking right to left mirrors the drawing. Clicking the visitor replays its act, then
 * it carries on walking.
 */
export function createRunner({ layer, interaction, world }) {
    const root = el('g', { 'pointer-events': 'none', style: 'display:none' }, layer);
    let drawing = null;           // the current visitor's <g>; built per visit, removed when it leaves
    const st = { def: null, parts: null, mode: 'off', dir: 1, x: 0, stopX: 0, gt: 0, phase: 0, amp: 0, fade: 1, fired: 0, blinkAt: 0, blinkUntil: 0, hop: 0, boost: 1 };
    let o = { ...DEFAULT_OPTS };  // options of the current visit
    let pose = {};
    let onDone = null;

    // Speech bubble: outside the (mirrored) visitor group so its text never flips. A live region,
    // so screen readers announce what the visitor says.
    const bubble = el('g', { 'pointer-events': 'none', style: 'display:none', role: 'status', 'aria-live': 'polite' }, layer);
    const bubbleBox = el('rect', { rx: 10, fill: '#ffffff', stroke: '#1c2033', 'stroke-opacity': 0.18, 'stroke-width': 1 }, bubble);
    el('path', { d: 'M-6,0 L0,8 L6,0 Z', fill: '#ffffff' }, bubble);
    const bubbleText = el('text', { 'text-anchor': 'middle', 'font-family': 'Segoe UI, system-ui, sans-serif', 'font-size': 13, 'font-weight': 600, fill: '#1c2033', y: -9 }, bubble);
    let sayUntil = 0, sayText = '';

    // Question mode: the bubble shows a line and buttons; the act holds until one is pressed.
    const buttonsG = el('g', {}, bubble);
    let buttons = [];             // [{ x, y, w, h, onPress }] in bubble space
    let bubbleX = 0, bubbleY = 0;
    let holdUntil = 0, onHoldEnd = null;

    function layoutBubble(w, h) {
        bubbleBox.setAttribute('x', -w / 2);
        bubbleBox.setAttribute('y', -h);
        bubbleBox.setAttribute('width', w);
        bubbleBox.setAttribute('height', h);
    }

    function clearButtons() {
        buttonsG.textContent = '';
        buttons = [];
        bubbleText.setAttribute('y', -9);
    }

    /** `raw`: show `text` exactly as given (already translated, or the user's own words). */
    function say(text, seconds = 2.5, raw = false) {
        if (!text || !o.bubbles) return;
        if (!raw) text = translate(text);
        if (buttons.length) return;   // a question is on screen; don't cover it
        sayUntil = performance.now() + seconds * 1000;
        if (text === sayText) return;
        sayText = text;
        bubbleText.textContent = text;
        layoutBubble(Math.max(40, bubbleText.getComputedTextLength() + 22), 28);
    }

    /**
     * Ask a question: `text` and buttons [{ label, primary, onPress }]. The act pauses until a
     * button is pressed or `seconds` pass (then `onTimeout`). Shown even with bubbles off.
     * `raw`: show `text` exactly as given (the user's own words, e.g. a reminder), not via t().
     */
    function ask(text, list, seconds, onTimeout, raw = false) {
        if (!raw) text = translate(text);
        clearButtons();
        sayText = text;
        bubbleText.textContent = text;
        const BH = 26, GAP = 8, PAD = 12;
        const nodes = list.map((b) => {
            const label = translate(b.label);
            const g = el('g', { style: 'cursor:pointer', role: 'button', 'aria-label': label }, buttonsG);
            const r = el('rect', { rx: 8, height: BH, fill: b.primary ? '#4f6bff' : '#eef0f6', stroke: b.primary ? 'none' : '#c9cedd' }, g);
            const t = el('text', { 'text-anchor': 'middle', 'font-family': 'Segoe UI, system-ui, sans-serif', 'font-size': 12.5, 'font-weight': 600, fill: b.primary ? '#ffffff' : '#1c2033', y: BH / 2 + 4.5 }, g);
            t.textContent = label;
            return { b, g, r, t, w: Math.max(64, t.getComputedTextLength() + 26) };
        });
        const rowW = nodes.reduce((s, n) => s + n.w, 0) + GAP * (nodes.length - 1);
        const textW = bubbleText.getComputedTextLength();
        const W = Math.max(rowW, textW) + PAD * 2, H = 28 + BH + 14;
        let x = -rowW / 2;
        const y = -BH - 10;
        for (const n of nodes) {
            n.r.setAttribute('width', n.w);
            n.g.setAttribute('transform', `translate(${x.toFixed(1)},${y})`);
            n.t.setAttribute('x', n.w / 2);
            const btn = n.b;
            buttons.push({ x, y, w: n.w, h: BH, onPress: () => { endQuestion(); btn.onPress?.(); } });
            x += n.w + GAP;
        }
        bubbleText.setAttribute('y', y - 10);
        layoutBubble(W, H);
        sayUntil = Infinity;
        holdUntil = performance.now() + seconds * 1000;
        onHoldEnd = onTimeout || null;
    }

    function endQuestion() {
        holdUntil = 0;
        onHoldEnd = null;
        clearButtons();
        sayUntil = 0;
        sayText = '';
        bubble.style.display = 'none';
    }

    /** Jump the act to time t (s), skipping the events in between. */
    function jump(t) {
        st.gt = t;
        const events = st.def.events || [];
        st.fired = 0;
        while (st.fired < events.length && events[st.fired].t <= t) st.fired++;
    }

    interaction.addHotspot({
        hit(x, y) {
            if (st.mode === 'off' || !buttons.length) return false;
            return buttons.some((b) => x >= bubbleX + b.x && x <= bubbleX + b.x + b.w && y >= bubbleY + b.y && y <= bubbleY + b.y + b.h);
        },
        press() {
            const m = interaction.mouse;
            const b = buttons.find((b) => m.x >= bubbleX + b.x && m.x <= bubbleX + b.x + b.w && m.y >= bubbleY + b.y && m.y <= bubbleY + b.y + b.h);
            b?.onPress();
        },
    });

    interaction.addHotspot({
        hit(x, y) {
            if (st.mode === 'off' || !st.def) return false;
            const f = floorY();
            const { w, h } = st.def.hit;
            return Math.abs(x - st.x) <= w * o.scale && y <= f && y >= f - h * o.scale;
        },
        press() {
            if (buttons.length || st.job) return;   // answer the question first; a job act doesn't replay
            st.def.onClick?.(ctx);
            startAct();
        },
    });

    function startAct() {
        st.mode = 'act';
        st.gt = 0;
        st.fired = 0;
        if (st.greet) {
            say(st.greet, 3.5, o.sayRaw);   // sayRaw: the user's own job line (chai-wala / bird)
            st.greet = '';
        }
        if (o.reminder && !st.reminded) {
            st.reminded = true;
            askReminder(o.reminder);
        }
        if (o.job && !st.job) {
            st.jobLeave = Infinity;
            st.job = runJob(ctx, o.job, (s) => { st.jobLeave = s; });
        }
    }

    // A reminder visit (opts.reminder { text, onAnswer(action) }): on arrival, before its own act,
    // the visitor asks the reminder text (as typed) with Done / Later. onAnswer gets 'done',
    // 'later' or 'ignored' (no answer in REMINDER_ASK_S, startled, or stopped) exactly once.
    let reminderAnswer = null;
    function askReminder(r) {
        let answered = false;
        const answer = (action) => {
            if (answered) return;
            answered = true;
            reminderAnswer = null;
            r.onAnswer?.(action);
        };
        reminderAnswer = answer;
        ask(r.text, [
            { label: 'Done', primary: true, onPress() { answer('done'); say('👍', 1.5); } },
            { label: 'Later', onPress() { answer('later'); say(tx('See you in 10 min ⏰'), 2); } },
        ], REMINDER_ASK_S, () => answer('ignored'), true);
    }

    /** Draw `def` in `variant` for this visit (released again in stop(), so images don't linger). */
    function build(def, variant) {
        drawing?.remove();
        drawing = el('g', {}, root);
        return buildVariant(def, drawing, variantOf(def, variant).id);
    }

    const charm = (k) => (o.tricks ? world.charms[0]?.view.beads[k] : null);
    const ctx = {
        world,
        blink: false, mode: 'off', t: 0, dt: 0,
        /** Show a speech bubble above the visitor for `seconds` (unless bubbles are off). */
        say,
        /** Ask a question with buttons (see ask() above); the act pauses meanwhile. */
        ask,
        /** Jump the act to time t (s). */
        jump,
        /** Options of this visit (start opts: water, userName, …). */
        get opts() { return o; },
        /** +1 walking right, −1 walking left (drawing mirrored). */
        dir: 1,
        /** Give every charm a push (px per physics step) in the visitor's facing frame. */
        kickCharms(vx, vy = 0) {
            if (!o.tricks) return;
            vx *= st.dir;
            for (const c of world.charms) {
                const { ox, oy, n } = c.rope;
                for (let i = 1; i < n; i++) {
                    const w = i / (n - 1);
                    ox[i] -= vx * w;
                    oy[i] -= vy * w;
                }
            }
        },
        /** Main charm's beads (0 while charm tricks are off): hide bead k (borrowed) / show it again. */
        beadCount() {
            return o.tricks ? world.charms[0]?.view.beads.length ?? 0 : 0;
        },
        hideBead(k) {
            const b = charm(k);
            if (b) b.style.visibility = 'hidden';
        },
        showBead(k) {
            // Always allowed, so a borrowed bead comes back even if tricks were switched off meanwhile.
            const b = world.charms[0]?.view.beads[k];
            if (b) b.style.visibility = '';
        },
        /** A deep clone of bead k's drawing (for a visitor to carry), or null. */
        cloneBead(k) {
            const b = charm(k);
            if (!b) return null;
            const g = el('g', {});
            for (const c of b.childNodes) g.appendChild(c.cloneNode(true));
            return g;
        },
    };

    return {
        get active() { return st.mode !== 'off'; },
        get current() { return st.def; },
        /** A question (ask()) is waiting for an answer. */
        get asking() { return st.mode !== 'off' && buttons.length > 0; },
        state: st,

        /** A music beat (0…1): the visitor hops to it. */
        beat(strength = 1) {
            if (st.mode !== 'off' && o.dance && !world.reducedMotion) st.hop = Math.max(st.hop, strength);
        },

        /** Something scared it (a charm flung at it): a jump, a yelp, and it hurries off. */
        startle() {
            if (st.mode === 'off' || !o.flee || (st.mode === 'out' && st.boost > 1)) return;
            if (buttons.length) {
                const f = onHoldEnd;
                endQuestion();
                f?.();
            }
            st.def.onStartle?.(ctx);
            say(st.def.yelp || tx('Whoa! 😱'), 1.4);
            if (world.reducedMotion) return;
            st.hop = 1.4;
            st.boost = 2.6;
            // Run on toward the far edge, whichever side it is facing.
            st.mode = 'out';
        },

        /**
         * Send `def` across; `done` runs when it has left. Ignored while one is out.
         * opts (all optional, see DEFAULT_OPTS): dir (+1 / −1), stop (0…1 of the screen width),
         * say (bubble when it stops), scale, actSpeed, variant, sounds, bubbles, tricks,
         * hello / dance / flee (reactions), greeting (custom hello text), reminder
         * ({ text, onAnswer }: asks `text` as typed with Done / Later on arrival; see askReminder),
         * job ({ id, data, say, message, onAnswer }: the generic job act of visitors/jobs.js instead
         * of its own act), bye (said as typed as it leaves the act).
         */
        start(def, opts = {}, done) {
            if (st.mode !== 'off') return false;
            o = { ...DEFAULT_OPTS, ...opts };
            visitSounds = o.sounds;
            endQuestion();
            const parts = build(def, o.variant);
            st.def = def;
            st.parts = parts;
            st.dir = ctx.dir = o.dir === -1 ? -1 : 1;
            st.stopX = innerWidth * (o.stop ?? def.stopAt ?? 0.5);
            const reduced = world.reducedMotion;
            // Enter and leave fully off-screen: wide figures (a peacock's tail) need more than OFF.
            st.off = Math.max(OFF, (def.reach ?? 0) + 8) * o.scale;
            st.x = reduced ? st.stopX : st.dir > 0 ? -st.off : innerWidth + st.off;
            st.mode = reduced ? 'act' : 'in';
            st.gt = 0;
            st.fired = 0;
            st.amp = reduced ? 0 : 1;
            st.fade = reduced ? 0 : 1;
            st.blinkAt = performance.now() + 1500 + Math.random() * 2500;
            st.hop = 0;
            st.helloed = false;
            st.reminded = false;
            st.job = null;
            st.byed = false;
            reminderAnswer = null;
            st.greet = o.say || '';
            pose = { ...def.rest };
            onDone = done || null;
            root.style.display = '';
            if (reduced) startAct();
            return true;
        },

        stop() {
            if (st.mode === 'off') return;
            st.mode = 'off';
            st.def?.onLeave?.(ctx);
            root.style.display = 'none';
            drawing?.remove();
            drawing = null;
            bubble.style.display = 'none';
            sayUntil = 0;
            reminderAnswer?.('ignored');
            if (st.job) st.job.cancel();
            else o.job?.onAnswer?.('ignored');   // left (startled, stopped) before it could ask
            st.job = null;
            endQuestion();
            const f = onDone;
            onDone = null;
            f?.();
        },

        /**
         * One frame. A visitor that throws is removed (and logged) instead of taking down the
         * overlay's whole animation loop, which would freeze the charm too.
         */
        render(now, dt) {
            try {
                this.frame(now, dt);
            } catch (e) {
                console.error(`Visitor "${st.def?.id}" failed and was removed:`, e);
                try { this.stop(); } catch { st.mode = 'off'; root.style.display = 'none'; }
                endQuestion();
            }
        },

        frame(now, dt) {
            if (st.mode === 'off') return;
            const def = st.def;
            const scale = o.scale;
            dt = Math.min(dt, 0.05);
            const reduced = world.reducedMotion;

            if (st.mode === 'in' || st.mode === 'out') {
                const v = def.speed * scale * st.boost;
                st.x += st.dir * v * dt;
                st.phase += (v / (def.stride * scale)) * dt * Math.PI * 2;
                st.amp += (1 - st.amp) * (1 - Math.exp(-dt / AMP_TAU));
                if (st.mode === 'in' && st.dir * (st.x - st.stopX) >= 0) {
                    st.x = st.stopX;
                    startAct();
                } else if (st.mode === 'out' && (st.x > innerWidth + st.off || st.x < -st.off)) {
                    this.stop();
                    return;
                }
            } else {
                if (holdUntil) {
                    if (performance.now() >= holdUntil) {
                        const f = onHoldEnd;
                        endQuestion();
                        f?.();
                    }
                } else if (st.job) {
                    // Generic job act: hold at rest until the job says leave, then end the act.
                    if (st.gt < def.actS) {
                        st.job.tick(dt);
                        st.jobLeave -= dt;
                        if (st.jobLeave <= 0) jump(def.actS);
                    }
                } else {
                    st.gt += dt * o.actSpeed;
                }
                st.amp *= Math.exp(-dt / AMP_TAU);
                const events = def.events;
                while (!st.job && events && st.fired < events.length && st.gt >= events[st.fired].t) {
                    events[st.fired++].run(ctx);
                }
                if (st.gt >= def.actS) {
                    if (o.bye && !st.byed) { st.byed = true; say(o.bye, 2.2, true); }
                    if (reduced) {
                        st.fade -= dt / FADE_S;
                        if (st.fade <= 0) { this.stop(); return; }
                    } else {
                        st.mode = st.dir * (st.x - st.stopX) < -1 ? 'in' : 'out';
                    }
                } else if (reduced) {
                    st.fade = Math.min(1, st.fade + dt / FADE_S);
                }
            }

            sampleAct(def, st.mode === 'act' ? Math.min(st.gt, def.actS) : def.actS, pose);
            def.walk(pose, st.phase, st.amp);

            if (now > st.blinkAt) {
                st.blinkAt = now + 2500 + Math.random() * 3000;
                st.blinkUntil = now + BLINK_MS;
            }
            ctx.blink = now < st.blinkUntil;
            ctx.mode = st.mode;
            ctx.t = st.gt;
            ctx.dt = dt;

            // A cursor passing close by while it walks gets one hello per visit.
            const m = interaction.mouse;
            const f = floorY();
            const { w, h } = def.hit;
            if (o.hello && !st.helloed && st.mode !== 'act' && m.active &&
                Math.abs(m.x - st.x) <= w * scale + HOVER_PAD && m.y <= f && m.y >= f - h * scale - HOVER_PAD) {
                st.helloed = true;
                say(o.greeting || def.hello || tx('Hi! 👋'), 1.8);
                if (!reduced) st.hop = Math.max(st.hop, 0.6);
            }
            st.hop *= Math.exp(-dt / HOP_TAU);
            const lift = st.hop * 8 * scale;

            root.setAttribute('transform', `translate(${st.x.toFixed(1)},${(f - lift).toFixed(1)}) scale(${st.dir * scale},${scale})`);
            root.setAttribute('opacity', st.fade.toFixed(3));
            def.draw(st.parts, pose, ctx);

            if (now < sayUntil) {
                bubble.style.display = '';
                const bx = Math.min(innerWidth - 140, Math.max(140, st.x));
                bubbleX = bx;
                bubbleY = f - h * scale - lift - 10;
                bubble.setAttribute('transform', `translate(${bx.toFixed(1)},${bubbleY.toFixed(1)})`);
                bubble.setAttribute('opacity', st.fade.toFixed(3));
            } else if (sayText) {
                bubble.style.display = 'none';
                sayText = '';
            }
        },
    };
}
