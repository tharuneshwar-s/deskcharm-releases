// Theme look on the overlay (themes are defined in src/themes.js and applied by Settings):
//   charm_style  { rope, ropeHi, rs, beadType, beadColors, beadSmall } laid over the main and the
//                second charm's own catalog styling (null = their own rope and beads)
//   accent_glow  '#rrggbb' soft static aura behind every shown charm, the main one and the second
//                (beside or in the opposite corner) ('' = none). It only follows the charms when a
//                frame is drawn anyway; it never keeps the loop awake.
// Imported after features/toys.js so the second charm already exists when this restyles it.

import { registerFeature } from '../features.js';
import { BASE_CHARM_W, BASE_CHARM_H } from '../charm.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const GLOW_OPACITY = 0.2;
const STYLE_KEYS = ['rope', 'ropeHi', 'rs', 'beadType', 'beadColors', 'beadSmall'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Catalog charm data with the theme's rope and bead fields laid over it (a copy; null style = as is). */
export function styledCharm(data, style) {
    if (!data || !style || typeof style !== 'object') return data;
    const out = { ...data };
    for (const k of STYLE_KEYS) if (style[k] != null) out[k] = style[k];
    return out;
}

/** One aura ellipse per shown charm (index-aligned with world.charms), made on first need. */
const glows = [];
let glowColor = '';
let backLayer = null;

function glowAt(i) {
    if (!glows[i]) {
        const g = document.createElementNS(SVGNS, 'ellipse');
        g.setAttribute('filter', 'url(#glowBlur)');
        g.setAttribute('pointer-events', 'none');
        g.setAttribute('opacity', GLOW_OPACITY);
        g.setAttribute('fill', glowColor);
        // Under everything else in the back layer (the wellness aura draws over it).
        backLayer.insertBefore(g, backLayer.firstChild);
        glows[i] = g;
    }
    return glows[i];
}

function restyle(world) {
    const style = world.config.charm_style;
    const [main, ...rest] = world.charms;
    if (main && world.config.charm_data) main.view.applyCharm(styledCharm(world.config.charm_data, style));
    const second = world.config.second_charm_data;
    if (second) for (const c of rest) c.view.applyCharm(styledCharm(second, style));
}

registerFeature({
    onInit(w) {
        backLayer = w.layers.back;
    },
    onConfig(cfg, w) {
        if (cfg.charm_style !== undefined || cfg.charm_data !== undefined || cfg.second_charm_data !== undefined ||
            cfg.second_charm !== undefined) {
            restyle(w);
        }
        if (cfg.accent_glow !== undefined) {
            glowColor = HEX_RE.test(cfg.accent_glow || '') ? cfg.accent_glow : '';
            for (const g of glows) {
                if (glowColor) g.setAttribute('fill', glowColor);
                else g.style.display = 'none';
            }
        }
    },
    onRender(w) {
        if (!glowColor || w.hidden) return;
        const n = w.charms.length;
        for (let i = 0; i < n; i++) {
            const view = w.charms[i].view;
            const g = glowAt(i);
            const end = view.rope.end;
            if (g.style.display) g.style.display = '';
            g.setAttribute('transform', `translate(${view.rx[end].toFixed(1)},${view.ry[end].toFixed(1)}) rotate(${view.angle.toFixed(2)})`);
            g.setAttribute('cy', view.centerY().toFixed(1));
            g.setAttribute('rx', (BASE_CHARM_W * view.scale * 0.5).toFixed(1));
            g.setAttribute('ry', (BASE_CHARM_H * view.scale * 0.5).toFixed(1));
        }
        // A removed second charm leaves its aura behind: hide the spare ones.
        for (let i = n; i < glows.length; i++) glows[i].style.display = 'none';
    }
});
