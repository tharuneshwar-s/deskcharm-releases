// Small calm overlay UI drawn next to a charm: a text cue, a thin progress ring and a timer.
// Everything lives in one <g> inside the given SVG layer and never takes pointer events
// (mouse capture is decided by charm hit-tests only, so these never block clicks).
//
// Usage per frame: follow(view, dt), then setCue / setRing / setTimer, then render(dt).
// Text has a dark halo + soft shadow so it reads on both light and dark wallpapers.

import { BASE_CHARM_H } from './charm.js';
import { t } from './i18n.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const FONT = "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
const HALO_FILTER_ID = 'uiHalo';
const RING_RADIUS = 0.58;         // ring radius as a fraction of the charm image height
const FOLLOW_RATE = 5;            // 1/s; how quickly the UI catches up to a swinging charm
const FADE_IN_S = 0.7;
const FADE_OUT_S = 0.5;
const CLOSE_HIT_R = 12;          // px around the × that counts as a click on it

function el(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

/** Soft dark shadow behind light text: legible on white desktops without a visible box. */
function ensureHaloFilter(svg) {
    if (svg.getElementById(HALO_FILTER_ID)) return;
    const defs = svg.querySelector('defs') || el('defs', {}, svg);
    const f = el('filter', { id: HALO_FILTER_ID, x: '-30%', y: '-60%', width: '160%', height: '220%' }, defs);
    el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 2.4, result: 'blur' }, f);
    el('feFlood', { 'flood-color': '#0b1020', 'flood-opacity': 0.5 }, f);
    el('feComposite', { in2: 'blur', operator: 'in', result: 'shadow' }, f);
    const merge = el('feMerge', {}, f);
    el('feMergeNode', { in: 'shadow' }, merge);
    el('feMergeNode', { in: 'SourceGraphic' }, merge);
}

function textNode(parent, size, weight) {
    return el('text', {
        'font-family': FONT,
        'font-size': size,
        'font-weight': weight,
        'letter-spacing': 0.3,
        fill: '#ffffff',
        stroke: 'rgba(12,16,28,0.45)',
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke',
        filter: `url(#${HALO_FILTER_ID})`,
        opacity: 0,
    }, parent);
}

/** Opacity that eases toward 0 or 1 at the cue fade rates. */
function fade(current, visible, dt) {
    return visible ? Math.min(1, current + dt / FADE_IN_S) : Math.max(0, current - dt / FADE_OUT_S);
}

/** Visual center of a charm in screen coordinates (its image center, following rotation). */
export function charmCenter(view) {
    const { rx: px, ry: py } = view;
    const end = view.rope.end;
    const a = view.angle * Math.PI / 180;
    const cy = view.centerY();
    return { x: px[end] - cy * Math.sin(a), y: py[end] + cy * Math.cos(a) };
}

/** Every OverlayUI on the page: they share the spot under the charm (see `priority`). */
const instances = [];

export class OverlayUI {
    /**
     * `priority`: several features own an OverlayUI at the same spot (onboarding tips, wellness
     * cues/timers, ritual messages). While a higher-priority UI shows anything, lower ones fade
     * out instead of drawing text on top of it.
     */
    constructor(layer, priority = 0) {
        this.priority = priority;
        instances.push(this);
        ensureHaloFilter(layer.ownerSVGElement);
        this.group = el('g', { 'pointer-events': 'none', style: 'display:none' }, layer);

        // Ring: dark halo, faint full track, then the progress arc (starts at 12 o'clock).
        this.ringGroup = el('g', { opacity: 0 }, this.group);
        this.ringHalo = el('circle', { fill: 'none', stroke: 'rgba(12,16,28,0.22)', 'stroke-width': 4.5 }, this.ringGroup);
        this.ringTrack = el('circle', { fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 1.6 }, this.ringGroup);
        this.ringArc = el('circle', { fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-linecap': 'round' }, this.ringGroup);

        // Two cue nodes so a new cue cross-fades over the old one.
        this.cues = [textNode(this.group, 15, 500), textNode(this.group, 15, 500)];
        this.cueOp = [0, 0];
        this.cueText = [null, null];
        this.cueCur = 0;

        this.timer = textNode(this.group, 13, 600);
        this.timer.setAttribute('text-anchor', 'middle');
        this.timer.setAttribute('style', 'font-variant-numeric: tabular-nums');
        this.timerOp = 0;
        this.timerShown = null;

        this.ringProgress = null;
        this.ringOp = 0;
        this.ringShownP = -1;
        this.radius = 0;
        this.cx = 0;
        this.cy = 0;
        this.placed = false;
        this.wantTimer = false;

        // Optional small "×" right of the cue (e.g. skip the first-run tips). The UI never takes
        // pointer events itself: owners register closeHit() as an interaction hotspot.
        this.close = textNode(this.group, 17, 600);
        this.close.textContent = '×';
        this.close.setAttribute('text-anchor', 'middle');
        this.closeOp = 0;
        this.wantClose = false;
        this.closeX = 0;
        this.closeY = 0;
    }

    /** Whether this UI currently wants to show a cue, ring or timer. */
    wants() {
        return this.cueText[this.cueCur] !== null || this.ringProgress !== null || this.wantTimer;
    }

    /** A higher-priority OverlayUI is showing something: this one must wait. */
    yielded() {
        return instances.some((o) => o !== this && o.priority > this.priority && o.wants());
    }

    /** Show the small × beside the cue (only while a cue is visible). */
    setClose(on) {
        this.wantClose = !!on;
    }

    /** Whether screen point (x, y) is on the visible ×. */
    closeHit(x, y) {
        return this.closeOp > 0.5 && Math.hypot(x - this.closeX, y - this.closeY) <= CLOSE_HIT_R;
    }

    /** Track the charm's visual center, low-pass filtered so the UI doesn't jitter with swings. */
    follow(view, dt) {
        const c = charmCenter(view);
        this.radius = BASE_CHARM_H * view.scale * RING_RADIUS;
        if (!this.placed) {
            this.cx = c.x;
            this.cy = c.y;
            this.placed = true;
            return;
        }
        const k = 1 - Math.exp(-FOLLOW_RATE * dt);
        this.cx += (c.x - this.cx) * k;
        this.cy += (c.y - this.cy) * k;
    }

    /**
     * Show `text` beside the charm (cross-fading from the previous cue); null fades it out.
     * `raw`: show it exactly as given (the user's own words), not via t().
     */
    setCue(text, raw = false) {
        if (text !== null && !raw) text = t(text);
        if (text === this.cueText[this.cueCur]) return;
        if (text === null) {
            this.cueText[this.cueCur] = null;
            return;
        }
        this.cueCur = 1 - this.cueCur;
        this.cueText[this.cueCur] = text;
        this.cueText[1 - this.cueCur] = null;
        this.cues[this.cueCur].textContent = text;
    }

    /** Ring fill 0..1 drawn clockwise from the top; null hides the ring. */
    setRing(progress, color = '#ffffff') {
        this.ringProgress = progress === null ? null : Math.min(1, Math.max(0, progress));
        if (this.ringArc.getAttribute('stroke') !== color) this.ringArc.setAttribute('stroke', color);
    }

    /** Small text centered under the charm; null hides it. */
    setTimer(text, color = '#ffffff') {
        if (text !== null) text = t(text);
        this.wantTimer = text !== null;
        if (text === null || text === this.timerShown) return;
        this.timerShown = text;
        this.timer.textContent = text;
        if (this.timer.getAttribute('fill') !== color) this.timer.setAttribute('fill', color);
    }

    /** Draw one frame; returns whether something is still fading (the caller keeps the loop awake). */
    render(dt) {
        const off = this.yielded();
        const want = [
            !off && this.cueText[0] !== null && this.cueCur === 0,
            !off && this.cueText[1] !== null && this.cueCur === 1,
            !off && this.ringProgress !== null,
            !off && this.wantTimer,
            !off && this.wantClose && this.cueText[this.cueCur] !== null,
        ];
        for (let i = 0; i < 2; i++) this.cueOp[i] = fade(this.cueOp[i], want[i], dt);
        this.ringOp = fade(this.ringOp, want[2], dt);
        this.timerOp = fade(this.timerOp, want[3], dt);
        this.closeOp = fade(this.closeOp, want[4], dt);
        const ops = [this.cueOp[0], this.cueOp[1], this.ringOp, this.timerOp, this.closeOp];
        const fading = ops.some((op, i) => op !== (want[i] ? 1 : 0));

        const anyVisible = this.cueOp[0] > 0 || this.cueOp[1] > 0 || this.ringOp > 0 || this.timerOp > 0 || this.closeOp > 0;
        this.group.style.display = anyVisible ? '' : 'none';
        if (!anyVisible) return fading;

        const { cx, cy } = this;
        const r = this.radius;

        // Cue text sits centered below the charm: the space beside it may hold a second charm
        // or festival decorations, but below is always free. Near a screen edge the text slides
        // inward so it is never cut off (the × needs room on the right).
        const cueY = cy + r + 20;
        const closeRoom = want[4] ? 28 : 0;
        for (let i = 0; i < 2; i++) {
            const node = this.cues[i];
            node.setAttribute('opacity', this.cueOp[i].toFixed(3));
            if (this.cueOp[i] > 0) {
                node.setAttribute('x', clampX(cx, textWidth(node), closeRoom).toFixed(1));
                node.setAttribute('y', cueY.toFixed(1));
                node.setAttribute('text-anchor', 'middle');
            }
        }

        this.ringGroup.setAttribute('opacity', this.ringOp.toFixed(3));
        if (this.ringOp > 0) {
            const circ = 2 * Math.PI * r;
            for (const c of [this.ringHalo, this.ringTrack, this.ringArc]) {
                c.setAttribute('cx', cx.toFixed(1));
                c.setAttribute('cy', cy.toFixed(1));
                c.setAttribute('r', r.toFixed(1));
            }
            // Keep the last progress while fading out instead of snapping to empty.
            if (this.ringProgress !== null) this.ringShownP = this.ringProgress;
            const p = Math.max(0, this.ringShownP);
            this.ringArc.setAttribute('stroke-dasharray', `${(circ * p).toFixed(1)} ${circ.toFixed(1)}`);
            this.ringArc.setAttribute('transform', `rotate(-90 ${cx.toFixed(1)} ${cy.toFixed(1)})`);
            this.ringArc.setAttribute('visibility', p > 0.001 ? 'visible' : 'hidden');
        }

        this.close.setAttribute('opacity', this.closeOp.toFixed(3));
        if (this.closeOp > 0) {
            const node = this.cues[this.cueCur];
            const w = textWidth(node);
            this.closeX = clampX(cx, w, closeRoom) + w / 2 + 14;
            this.closeY = cueY - 5;
            this.close.setAttribute('x', this.closeX.toFixed(1));
            this.close.setAttribute('y', (cueY + 1).toFixed(1));
        }

        this.timer.setAttribute('opacity', (this.timerOp * 0.92).toFixed(3));
        if (this.timerOp > 0) {
            // One line lower when a cue is showing, so they never overlap.
            const cueShown = this.cueOp[0] > 0 || this.cueOp[1] > 0;
            this.timer.setAttribute('x', clampX(cx, textWidth(this.timer), 0).toFixed(1));
            this.timer.setAttribute('y', (cueY + (cueShown ? 18 : 0)).toFixed(1));
        }
        return fading;
    }
}

/** Rendered width of an SVG text node (estimate when not laid out, e.g. in tests). */
function textWidth(node) {
    let w = 0;
    try { w = node.getComputedTextLength(); } catch { /* not laid out (tests) */ }
    return w || (node.textContent || '').length * 7.5;
}

/** Centre x for text of width `w` so it stays on screen, with `rightRoom` px spare on the right. */
export function clampX(cx, w, rightRoom = 0, screenW = globalThis.innerWidth || 0) {
    const MARGIN = 10;
    if (!screenW) return cx;
    const min = MARGIN + w / 2;
    const max = screenW - MARGIN - rightRoom - w / 2;
    return max < min ? screenW / 2 : Math.min(max, Math.max(min, cx));
}
