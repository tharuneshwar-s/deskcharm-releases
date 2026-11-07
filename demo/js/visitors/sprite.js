// Realistic visitors drawn from a sprite atlas (a WebP grid of pre-rendered poses, built by
// scripts/sprites/pack.mjs from green-screen images). A sprite visitor is an ordinary engine
// visitor whose act keys set `pose` (an atlas clip name); walking plays the `walk` clip.
//
//   import META from '../../visitors/cat-real.json' with { type: 'json' };
//   const S = sprite(META, { image: 'visitors/cat-real.webp', scale: 0.4 });
//   registerVisitor({ ...S.parts, rest: { pose: 'idle' }, act: [...], ... });
//
// `S.parts` supplies build / walk / draw. Clips with several frames (e.g. a 2-frame tail flick)
// loop at `fps` while held. META is the packer's JSON: { cellW, cellH, feetY, cols, rows, clips }.

import { el } from './engine.js';

/**
 * opts: image (atlas WebP path relative to src/), scale (atlas px → screen px at Medium),
 *       fps (multi-frame clip rate, default 8), shadow ({ rx, ry, opacity } or false),
 *       breathe (idle vertical breath amount, default 0.008; 0 = off).
 */
export function sprite(meta, opts) {
    const { cellW, cellH, feetY, cols, clips } = meta;
    const rows = meta.rows ?? Math.floor(Math.max(...Object.values(clips).flat()) / cols) + 1;
    const K = opts.scale;
    const fps = opts.fps ?? 8;
    const breatheAmt = opts.breathe ?? 0.008;
    const shadow = opts.shadow === false ? null : { rx: cellW * K * 0.32, ry: 6, opacity: 0.2, ...opts.shadow };
    const walk = clips.walk || clips.idle;
    for (const [name, list] of Object.entries(clips)) {
        if (!Array.isArray(list) || !list.length) throw new Error(`sprite ${opts.image}: clip "${name}" is empty`);
    }

    return {
        meta,
        clips,
        /** Height of the figure on screen at Medium (for `hit.h`). */
        height: (feetY - (meta.topY ?? 0)) * K,
        /** Half-width of the sprite frame on screen at Medium (for the def's `reach`). */
        reach: cellW / 2 * K,
        parts: {
            build(root) {
                if (shadow) el('ellipse', { cx: 0, cy: 0, rx: shadow.rx, ry: shadow.ry, fill: '#000', opacity: shadow.opacity }, root);
                const body = el('g', {}, root);
                const frame = el('svg', {
                    x: -cellW / 2 * K, y: -feetY * K, width: cellW * K, height: cellH * K,
                    viewBox: `0 0 ${cellW} ${cellH}`, overflow: 'hidden',
                }, body);
                el('image', { href: opts.image, width: cellW * cols, height: cellH * rows }, frame);
                return { body, frame, shown: -1 };
            },
            walk(p, phase, a) {
                p.walkFrame = a > 0.5 ? Math.floor(((phase / (2 * Math.PI)) % 1 + 1) % 1 * walk.length) : -1;
            },
            draw(parts, p, ctx) {
                let cell;
                if (p.walkFrame >= 0) cell = walk[p.walkFrame];
                else {
                    const clip = clips[p.pose] || clips.idle || walk;
                    cell = clip.length > 1 ? clip[Math.floor((performance.now() / 1000) * fps) % clip.length] : clip[0];
                }
                if (cell !== parts.shown) {
                    parts.shown = cell;
                    parts.frame.setAttribute('viewBox', `${(cell % cols) * cellW} ${Math.floor(cell / cols) * cellH} ${cellW} ${cellH}`);
                }
                // Standing still: a slow breath (tiny vertical scale from the feet); none with reduced motion.
                const still = p.walkFrame >= 0 || ctx.world.reducedMotion || !breatheAmt;
                const k = still ? 1 : 1 + breatheAmt * Math.sin(performance.now() / 650);
                parts.body.setAttribute('transform', `scale(1,${k.toFixed(4)})`);
            },
        },
    };
}
