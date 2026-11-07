// SVG view for one rope + beads + charm image + hook, with squeeze and breathing-glow effects.

import { BEAD_POINTS, HOOK_R, HOOK_C } from './rope.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export const BASE_CHARM_W = 134.4;
export const BASE_CHARM_H = 150;
const HIT_SHRINK = 0.42;          // hit/glow ellipse radii as a fraction of the image box
const HANG = 72;                  // attachment → visual center distance at 100% size
const SQUEEZE_AMT = 0.08;         // squash amount at full squeeze
const SQUEEZE_K = 500;            // squeeze spring stiffness (1/s²)
const FIXED_DT = 1 / 120;
const ANGLE_TAU_S = 0.13;         // charm rotation follows the rope with this time constant
const BREATH_IN_S = 4;
const BREATH_OUT_S = 6;
const BEAD_HIT_R = 11;            // px; beads are small, so the grab circle is generous
const BEAD_ACTIVE_SCALE = 1.18;   // hovered / held bead grows slightly
const BODY_RADIUS = 0.4;          // charm–charm collision radius as a fraction of the image width
const HOOK_METAL = '#9a8a68';
const HOOK_METAL_HI = '#cdbd96';
const COIL_SAMPLES_PER_TURN = 20;

export const WEIGHT_MASS = { light: 2.5, medium: 5.0, heavy: 8.0, massive: 12.0 };
export const WEIGHT_BEAD = { light: 1.5, medium: 2.5, heavy: 3.5, massive: 5.0 };

const ROPE_STYLES = {
    'rope':   { w: 2.4, hiW: 0.8, dash: '',      hiOp: 0.7 },
    'chain':  { w: 2.8, hiW: 1.0, dash: '4 2',   hiOp: 0.6 },
    'thread': { w: 1.6, hiW: 0.5, dash: '',      hiOp: 0.8 },
    'wire':   { w: 1.2, hiW: 0.4, dash: '',      hiOp: 0.5 },
    'braid':  { w: 3.0, hiW: 1.2, dash: '6 1',   hiOp: 0.65 },
    'dotted': { w: 2.0, hiW: 0.6, dash: '1.5 2', hiOp: 0.7 },
    'thick':  { w: 3.2, hiW: 1.0, dash: '',      hiOp: 0.5 },
    'dashed': { w: 2.2, hiW: 0.7, dash: '3 2',   hiOp: 0.7 },
};

const BEAD_TEMPLATES = {
    'evil-eye': (c) => `<circle r="8.2" fill="${c[0]}"/><circle r="5.08" fill="#fff"/><circle r="3.12" fill="${c[1]}"/><circle r="1.48" fill="${c[2]}"/>`,
    'gem': (c) => `<circle r="7" fill="${c[0]}" stroke="${c[1]}" stroke-width="1"/><ellipse rx="3.5" ry="2" cx="-1" cy="-2" fill="${c[1]}" opacity=".4"/><circle r="1.2" cx="-2" cy="-2.5" fill="#fff" opacity=".7"/>`,
    'metal': (c) => `<circle r="6.5" fill="${c[0]}" stroke="${c[1]}" stroke-width=".7"/><ellipse rx="4" ry="1.5" cx="0" cy="-1.5" fill="${c[1]}" opacity=".35"/><circle r="1" cx="-1.8" cy="-2" fill="#fff" opacity=".5"/>`,
    'glow': (c) => `<circle r="8" fill="${c[0]}" opacity=".5"/><circle r="5.5" fill="${c[1]}" opacity=".7"/><circle r="2.5" fill="${c[2]}" opacity=".9"/>`,
    'crystal': (c) => `<rect x="-5" y="-7" width="10" height="14" rx="2" fill="${c[0]}" transform="rotate(15)"/><rect x="-3" y="-5" width="6" height="10" rx="1" fill="${c[1]}" opacity=".4" transform="rotate(15)"/><circle r="1" cx="-1" cy="-3" fill="#fff" opacity=".6"/>`,
    'wood': (c) => `<circle r="6.5" fill="${c[0]}"/><ellipse rx="6" ry="1" fill="${c[2]}" opacity=".3"/><ellipse rx="5.5" ry="0.8" cy="2" fill="${c[2]}" opacity=".2"/><circle r="1" cx="-1.5" cy="-2" fill="${c[1]}" opacity=".3"/>`,
    'pearl': (c) => `<circle r="7" fill="${c[0]}"/><circle r="6" fill="${c[1]}" opacity=".5"/><ellipse rx="3.5" ry="2.5" cx="-1" cy="-1.5" fill="${c[2]}" opacity=".5"/><circle r="1.5" cx="-2" cy="-2.5" fill="#fff" opacity=".7"/>`,
    'ornate': (c) => `<circle r="7.5" fill="${c[0]}"/><circle r="5.5" fill="${c[1]}" opacity=".6"/><circle r="7.5" fill="none" stroke="${c[2]}" stroke-width=".8" stroke-dasharray="3 2"/><circle r="1.2" cx="-1.5" cy="-2" fill="#fff" opacity=".5"/>`
};

function smallBeadSvg(color) {
    return `<circle r="5.2" fill="${color}" stroke="${color}" stroke-width=".6" opacity=".85"/><circle r="1.3" cx="-1.66" cy="-1.87" fill="#fff" opacity=".6"/>`;
}

function el(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

function breathLevel(seconds) {
    const cycle = BREATH_IN_S + BREATH_OUT_S;
    const p = ((seconds % cycle) + cycle) % cycle;
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
    return p < BREATH_IN_S ? ease(p / BREATH_IN_S) : 1 - ease((p - BREATH_IN_S) / BREATH_OUT_S);
}

export class CharmView {
    constructor(layer, rope) {
        this.rope = rope;
        this.scale = 1;
        this.hasImage = true;
        /** Rendered charm rotation in degrees (SVG convention), low-pass filtered. */
        this.angle = 0;
        this.squeeze = 0;
        this.squeezeVel = 0;
        this.glowFade = 0;
        this.breathStart = 0;
        this.wasBreathing = false;
        /** Features (e.g. guided breathing) set this to keep the breathing glow on without hover. */
        this.forceGlow = false;
        /**
         * Reduced motion (set by app.js): the hover glow holds steady instead of pulsing, the
         * glow never scales, and the coil texture on the hook stays put.
         */
        this.reducedMotion = false;

        this.group = el('g', {}, layer);
        // Small peg at the top screen edge the rope hangs from (and winds around).
        this.hook = el('g', { opacity: 0.85 }, this.group);
        this.hookStem = el('rect', { x: -1.1, width: 2.2, rx: 1, fill: HOOK_METAL }, this.hook);
        el('circle', { cx: 0, cy: -HOOK_R, r: HOOK_R, fill: HOOK_METAL, stroke: HOOK_METAL_HI, 'stroke-width': 0.8 }, this.hook);
        el('circle', { cx: 0, cy: -HOOK_R, r: 1.3, fill: '#4a4232' }, this.hook);
        this.hookY = NaN;
        this.ropeMain = el('path', { fill: 'none', 'stroke-linecap': 'round', d: '' }, this.group);
        this.ropeHi = el('path', { fill: 'none', 'stroke-linecap': 'round', d: '' }, this.group);
        // Rope wound on the hook, drawn over the free rope.
        this.coils = el('g', { style: 'display:none' }, this.group);
        this.coilMain = el('path', { fill: 'none', 'stroke-linecap': 'round' }, this.coils);
        this.coilHi = el('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': '2.5 2' }, this.coils);
        this.beads = BEAD_POINTS.map(() => el('g', {}, this.group));
        /** Rendered bead centers (screen px), used for hit-testing. */
        this.beadPos = BEAD_POINTS.map(() => ({ x: -1e6, y: -1e6, a: 0 }));
        /** Bead under the cursor or being slid (-1 = none); drawn slightly larger. */
        this.activeBead = -1;
        this.ropeW = 2.4;
        /** Drawn rope points: the physics state interpolated to the frame time (see render). */
        this.rx = Float64Array.from(rope.px);
        this.ry = Float64Array.from(rope.py);
        this.rBeadS = Float64Array.from(rope.beadS);
        this.glowWrap = el('g', { style: 'display:none' }, this.group);
        this.glow = el('ellipse', { cx: 0, cy: 67, rx: 56, ry: 63, fill: '#73ccfa', filter: 'url(#glowBlur)', opacity: 0 }, this.glowWrap);
        this.charm = el('g', { filter: 'url(#dgShadow)' }, this.group);
        this.body = el('g', {}, this.charm);
        this.image = el('image', { preserveAspectRatio: 'xMidYMin meet' }, this.body);
        /** Drawn over the image inside the body (swings and squeezes with it); features/living.js owns it. */
        this.eyeLayer = el('g', { 'pointer-events': 'none' }, this.body);
        /** Last applied catalog entry (features read e.g. `data.eye`). */
        this.data = null;
        this.setScale(1);
    }

    remove() {
        this.group.remove();
    }

    applyCharm(data) {
        if (!data) return;
        this.data = data;
        if (data.rope) {
            this.ropeMain.setAttribute('stroke', data.rope);
            this.coilMain.setAttribute('stroke', data.rope);
        }
        if (data.ropeHi) {
            this.ropeHi.setAttribute('stroke', data.ropeHi);
            this.coilHi.setAttribute('stroke', data.ropeHi);
        }

        const rs = ROPE_STYLES[data.rs] || ROPE_STYLES['rope'];
        this.ropeMain.setAttribute('stroke-width', rs.w);
        this.ropeMain.setAttribute('stroke-dasharray', rs.dash);
        this.ropeHi.setAttribute('stroke-width', rs.hiW);
        this.ropeHi.setAttribute('stroke-dasharray', rs.dash);
        this.ropeHi.setAttribute('opacity', rs.hiOp);
        this.ropeW = rs.w;
        this.coilMain.setAttribute('stroke-width', rs.w);
        this.coilHi.setAttribute('stroke-width', rs.hiW);
        this.coilHi.setAttribute('opacity', rs.hiOp);

        const [b1, b2, b3] = this.beads;
        if (data.beadType && data.beadColors && BEAD_TEMPLATES[data.beadType]) {
            b2.innerHTML = BEAD_TEMPLATES[data.beadType](data.beadColors);
        }
        if (data.beadSmall) {
            b1.innerHTML = smallBeadSvg(data.beadSmall);
            b3.innerHTML = smallBeadSvg(data.beadSmall);
        }
        // Breathing glow takes the charm's main bead color.
        if (data.beadColors && data.beadColors[0]) {
            this.glow.setAttribute('fill', data.beadColors[0]);
        }

        this.hasImage = !!data.image;
        if (data.image) {
            this.image.setAttribute('href', data.image);
            this.image.removeAttribute('visibility');
        } else {
            this.image.setAttribute('visibility', 'hidden');
        }
        if (data.weight) {
            this.rope.setMasses(WEIGHT_MASS[data.weight] || 5.0, WEIGHT_BEAD[data.weight] || 2.5);
        }
    }

    setScale(scale) {
        this.scale = scale;
        const w = BASE_CHARM_W * scale;
        const h = BASE_CHARM_H * scale;
        this.image.setAttribute('width', w);
        this.image.setAttribute('height', h);
        this.image.setAttribute('x', -w / 2);
        this.image.setAttribute('y', -8 * scale);
        this.glow.setAttribute('rx', w * HIT_SHRINK);
        this.glow.setAttribute('ry', h * HIT_SHRINK);
        this.glow.setAttribute('cy', this.centerY());
    }

    /** Charm visual center, y offset from the attachment point in the charm's local frame. */
    centerY() {
        return -8 * this.scale + (BASE_CHARM_H * this.scale) / 2;
    }

    /** Visual charm center in screen coordinates (for cursor push). */
    pushCenter() {
        const a = this.angle * Math.PI / 180;
        const { rx, ry } = this;
        const end = this.rope.end;
        return { x: rx[end] - HANG * Math.sin(a), y: ry[end] + HANG * Math.cos(a) };
    }

    /** True when (mx, my) is inside the charm's elliptical hit area, grown by `margin` px. */
    hit(mx, my, margin = 0) {
        if (!this.hasImage) return false;
        const a = this.angle * Math.PI / 180;
        const { rx, ry } = this;
        const end = this.rope.end;
        const dx = mx - rx[end];
        const dy = my - ry[end];
        const c = Math.cos(a), s = Math.sin(a);
        // Inverse of the SVG rotate(a) applied to the charm group.
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const nx = lx / (BASE_CHARM_W * this.scale * HIT_SHRINK + margin);
        const ny = (ly - this.centerY()) / (BASE_CHARM_H * this.scale * HIT_SHRINK + margin);
        return nx * nx + ny * ny <= 1;
    }

    /** Index of the bead under (mx, my), nearest first, or -1. Uses last rendered positions. */
    hitBead(mx, my) {
        let best = -1;
        let bestD = BEAD_HIT_R * BEAD_HIT_R;
        this.beadPos.forEach((p, k) => {
            const d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
            if (d <= bestD) {
                bestD = d;
                best = k;
            }
        });
        return best;
    }

    /** Charm visual center in screen coordinates, scaled with the charm size. */
    bodyCenter() {
        const a = this.angle * Math.PI / 180;
        const { px, py, end } = this.rope;
        const cy = this.centerY();
        return { x: px[end] - cy * Math.sin(a), y: py[end] + cy * Math.cos(a) };
    }

    /** Circle approximation of the charm body (charm–charm collisions, effect rings). */
    bodyRadius() {
        return BASE_CHARM_W * this.scale * BODY_RADIUS;
    }

    /** Squeeze spring, one fixed physics step. Pops back with a wobble when released. */
    stepSqueeze(squeezing) {
        const target = squeezing ? 1 : 0;
        const damp = target ? 30 : 9;
        this.squeezeVel += ((target - this.squeeze) * SQUEEZE_K - this.squeezeVel * damp) * FIXED_DT;
        this.squeeze += this.squeezeVel * FIXED_DT;
    }

    /** SVG rotation (degrees) that points a downward-hanging element along the drawn rope at point i. */
    localAngle(i) {
        const { rx, ry } = this;
        const end = this.rope.end;
        const prev = Math.max(0, i - 1);
        const next = Math.min(end, i + 1);
        return -Math.atan2(rx[next] - rx[prev], ry[next] - ry[prev]) * (180 / Math.PI);
    }

    buildPath() {
        const { rx: px, ry: py } = this;
        const { n, end } = this.rope;
        let d = `M${px[0].toFixed(1)},${py[0].toFixed(1)}`;
        for (let i = 1; i < n - 1; i++) {
            const mx = (px[i] + px[i + 1]) / 2;
            const my = (py[i] + py[i + 1]) / 2;
            d += ` Q${px[i].toFixed(1)},${py[i].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
        }
        d += ` L${px[end].toFixed(1)},${py[end].toFixed(1)}`;
        return d;
    }

    /**
     * Point on the drawn rope curve at continuous rope parameter s (point index + fraction),
     * written into `out` with the SVG rotation `a` that hangs an element along the curve.
     * Mirrors buildPath(): the quadratic piece around point i runs from mid(i-1,i) to
     * mid(i,i+1) with p[i] as control; the first piece starts at p[0], the last is a line.
     */
    curvePoint(s, out) {
        const { rx: px, ry: py } = this;
        const end = this.rope.end;
        let x0, y0, cx, cy, x1, y1, u;
        if (s >= end - 0.5) {
            x0 = (px[end - 1] + px[end]) / 2;
            y0 = (py[end - 1] + py[end]) / 2;
            x1 = px[end];
            y1 = py[end];
            cx = (x0 + x1) / 2;
            cy = (y0 + y1) / 2;
            u = Math.min(1, (s - (end - 0.5)) / 0.5);
        } else if (s < 1.5) {
            x0 = px[0];
            y0 = py[0];
            cx = px[1];
            cy = py[1];
            x1 = (px[1] + px[2]) / 2;
            y1 = (py[1] + py[2]) / 2;
            u = Math.max(0, s / 1.5);
        } else {
            const i = Math.floor(s + 0.5);
            x0 = (px[i - 1] + px[i]) / 2;
            y0 = (py[i - 1] + py[i]) / 2;
            cx = px[i];
            cy = py[i];
            x1 = (px[i] + px[i + 1]) / 2;
            y1 = (py[i] + py[i + 1]) / 2;
            u = s - (i - 0.5);
        }
        const v = 1 - u;
        out.x = v * v * x0 + 2 * u * v * cx + u * u * x1;
        out.y = v * v * y0 + 2 * u * v * cy + u * u * y1;
        let tx = v * (cx - x0) + u * (x1 - cx);
        let ty = v * (cy - y0) + u * (y1 - cy);
        if (tx === 0 && ty === 0) {
            tx = x1 - x0;
            ty = y1 - y0;
        }
        out.a = -Math.atan2(tx, ty) * (180 / Math.PI);
        return out;
    }

    /**
     * Hook peg at the anchor (stem reaching up to the screen edge), plus the rope wound on
     * it as an outward spiral ending at the bottom of the peg where the free rope leaves.
     */
    renderHook() {
        const rope = this.rope;
        const ax = rope.anchorX;
        const ay = rope.anchorY;
        const t = `translate(${ax.toFixed(1)},${ay.toFixed(1)})`;
        this.hook.setAttribute('transform', t);
        if (ay !== this.hookY) {
            this.hookY = ay;
            const top = -ay - 2;
            this.hookStem.setAttribute('y', top.toFixed(1));
            this.hookStem.setAttribute('height', Math.max(0, -HOOK_R - top).toFixed(1));
        }

        const turns = rope.wrapLen / HOOK_C;
        if (turns < 0.01) {
            this.coils.style.display = 'none';
            return;
        }
        this.coils.style.display = '';
        this.coils.setAttribute('transform', t);
        const w = this.ropeW || 2.4;
        const dir = rope.wrapDir;
        const total = turns * Math.PI * 2;
        const samples = Math.max(4, Math.ceil(turns * COIL_SAMPLES_PER_TURN));
        let d = '';
        for (let j = 0; j <= samples; j++) {
            const u = j / samples;
            // Winding sense: a charm circling with increasing angle (dir +1) goes counter-
            // clockwise on screen (decreasing SVG angle), so the earlier, inner coil lies at
            // larger SVG angles and the outermost coil ends at the bottom (π/2).
            const phi = Math.PI / 2 + dir * total * (1 - u);
            const r = HOOK_R + w * (0.5 + 0.6 * turns * u);
            const x = r * Math.cos(phi);
            const y = -HOOK_R + r * Math.sin(phi);
            d += `${j ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
        }
        this.coilMain.setAttribute('d', d);
        this.coilHi.setAttribute('d', d);
        // Texture creeps along the coil as rope winds on or slips off: the spool turning.
        // Reduced motion keeps the coils static.
        if (!this.reducedMotion) {
            this.coilHi.setAttribute('stroke-dashoffset', (rope.coilPhase * HOOK_R).toFixed(2));
        }
    }

    /**
     * Before drawing: drawn positions at fraction `alpha` (0…1) of the way from the previous
     * physics step to the latest one (smooth at any refresh rate), and the charm rotation.
     * A held charm end is not interpolated; interaction.syncHeld() then puts it under the cursor.
     */
    prepare(dt, alpha) {
        const rope = this.rope;
        const { rx, ry, rBeadS } = this;
        const { px, py, prevX, prevY, end } = rope;
        for (let i = 0; i < rope.n; i++) {
            rx[i] = prevX[i] + (px[i] - prevX[i]) * alpha;
            ry[i] = prevY[i] + (py[i] - prevY[i]) * alpha;
        }
        if (rope.held) {
            rx[end] = px[end];
            ry[end] = py[end];
        }
        for (let k = 0; k < rBeadS.length; k++) {
            rBeadS[k] = rope.prevBeadS[k] + (rope.beadS[k] - rope.prevBeadS[k]) * alpha;
        }
        // A held charm keeps the angle it was grabbed at: the hand holds it, so it must not
        // twist around the grab point. Once released it eases back to hanging along the rope.
        if (rope.held) return;
        // Low-pass filtered rotation (time-based, so it feels the same at 60 and 240 Hz),
        // kept in (-180, 180] so it never winds up.
        let diff = this.localAngle(end) - this.angle;
        diff -= 360 * Math.round(diff / 360);
        this.angle += diff * (1 - Math.exp(-dt / ANGLE_TAU_S));
        this.angle -= 360 * Math.round(this.angle / 360);
    }

    render(now, dt, breathing) {
        const { rx, ry, rBeadS } = this;
        const end = this.rope.end;
        const path = this.buildPath();
        this.ropeMain.setAttribute('d', path);
        this.ropeHi.setAttribute('d', path);

        this.renderHook();

        this.beadPos.forEach((p, k) => {
            this.curvePoint(rBeadS[k], p);
            const grow = k === this.activeBead ? ` scale(${BEAD_ACTIVE_SCALE})` : '';
            this.beads[k].setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${p.a.toFixed(2)})${grow}`);
        });

        const base = `translate(${rx[end].toFixed(1)},${ry[end].toFixed(1)}) rotate(${this.angle.toFixed(2)})`;
        this.charm.setAttribute('transform', base);

        // Squeeze squashes about the charm center
        const cy = this.centerY();
        const sx = 1 + SQUEEZE_AMT * this.squeeze;
        const sy = 1 - SQUEEZE_AMT * this.squeeze;
        this.body.setAttribute('transform', `translate(0,${cy.toFixed(1)}) scale(${sx.toFixed(3)},${sy.toFixed(3)}) translate(0,${(-cy).toFixed(1)})`);

        // Breathing glow: 4 s inhale / 6 s exhale pulse, fades in/out over 1 s
        breathing = breathing || this.forceGlow;
        if (breathing && !this.wasBreathing) this.breathStart = now;
        this.wasBreathing = breathing;
        this.glowFade = breathing ? Math.min(1, this.glowFade + dt) : Math.max(0, this.glowFade - dt);

        if (this.glowFade > 0) {
            // Reduced motion: no swelling; the hover glow is steady. Guided breathing (forceGlow)
            // keeps its slow brightness cue, since that is what paces the exercise.
            let level = breathLevel((now - this.breathStart) / 1000);
            let scale = 0.9 + 0.2 * level;
            if (this.reducedMotion) {
                if (!this.forceGlow) level = 0.5;
                scale = 1;
            }
            this.glowWrap.style.display = '';
            this.glowWrap.setAttribute('transform', base);
            this.glow.setAttribute('transform', `translate(0,${cy.toFixed(1)}) scale(${scale.toFixed(3)}) translate(0,${(-cy).toFixed(1)})`);
            this.glow.setAttribute('opacity', (this.glowFade * (0.12 + 0.5 * level)).toFixed(3));
        } else {
            this.glowWrap.style.display = 'none';
        }
    }
}
