// SVG festival decorations drawn beside the rope anchor and around the charms.
// Everything is small and soft on purpose: the overlay sits on top of the user's desktop.
//
// createDecor(id, back, front) → { render(now, dt, scene), onRelease(view), onClick(view), burst(scene) }
//   back / front  <g> groups owned by the caller (in world.layers.back / world.layers.front)
//   scene         { x, y, charms } — x/y is the decoration point beside the main anchor

const SVGNS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

function el(tag, attrs, parent) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Reduced motion: no particles or puffs; flames, ornaments and snow hold still. */
let reduced = false;
export function setDecorReducedMotion(on) {
    reduced = on;
}

/** Shared gradients/filters, added once to the overlay's <defs>. */
export function ensureDecorDefs(svg) {
    if (svg.querySelector('#ssGlow')) return;
    const defs = svg.querySelector('defs') || el('defs', {}, svg);
    defs.insertAdjacentHTML('beforeend', `
        <filter id="ssGlow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="3.5"/></filter>
        <filter id="ssPuff" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="ssShade" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" flood-color="#000" flood-opacity=".35"/>
        </filter>
        <radialGradient id="ssFlame" cx="50%" cy="75%" r="65%">
            <stop offset="0" stop-color="#fffbe6"/><stop offset=".45" stop-color="#ffd447"/><stop offset="1" stop-color="#ff7a1a"/>
        </radialGradient>`);
}

/** Visual charm center in screen space (falls back to the rope end before the first render). */
function charmCenter(charm) {
    return charm.view.pushCenter ? charm.view.pushCenter() : { x: charm.rope.px[charm.rope.end], y: charm.rope.py[charm.rope.end] };
}

/** Charm end velocity in px/s (rope stores one physics step of motion, 120 steps/s). */
function charmVelocity(charm) {
    const { px, py, ox, oy, end } = charm.rope;
    return { vx: (px[end] - ox[end]) * 120, vy: (py[end] - oy[end]) * 120 };
}

// ========== SPARKLES (Diwali, New Year) ==========
const STAR_PATH = 'M0,-1 Q0,0 1,0 Q0,0 0,1 Q0,0 -1,0 Q0,0 0,-1Z';

/** Fixed pool of twinkling four-point stars. */
class Sparkles {
    constructor(parent, size) {
        this.items = [];
        for (let i = 0; i < size; i++) {
            const node = el('path', { d: STAR_PATH, opacity: 0, style: 'display:none' }, parent);
            this.items.push({ node, active: false, x: 0, y: 0, vx: 0, vy: 0, size: 1, life: 0, max: 1, spin: 0 });
        }
    }

    spawn(x, y, vx, vy, size, life, color) {
        if (reduced) return;
        const s = this.items.find((it) => !it.active);
        if (!s) return;
        Object.assign(s, { active: true, x, y, vx, vy, size, life: 0, max: life, spin: rand(-40, 40) });
        s.node.setAttribute('fill', color);
        s.node.style.display = '';
    }

    render(dt) {
        for (const s of this.items) {
            if (!s.active) continue;
            s.life += dt;
            if (s.life >= s.max) {
                s.active = false;
                s.node.style.display = 'none';
                continue;
            }
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= 1 - 1.2 * dt;            // bursts slow down and hang in the air
            s.vy = s.vy * (1 - 1.2 * dt) + 6 * dt;
            const p = s.life / s.max;
            const tw = Math.sin(Math.PI * p);
            const r = s.size * (0.6 + 0.4 * tw);
            s.node.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)}) rotate(${(s.spin * s.life).toFixed(1)}) scale(${r.toFixed(2)})`);
            s.node.setAttribute('opacity', (0.9 * tw).toFixed(3));
        }
    }
}

// ========== DIWALI: diya with a flickering flame + golden sparkles ==========
function diwali(back, front) {
    const root = el('g', { filter: 'url(#ssShade)' }, back);
    const glow = el('ellipse', { cx: 15, cy: -9, rx: 13, ry: 15, fill: '#ffb347', opacity: 0.3, filter: 'url(#ssGlow)' }, root);
    el('path', { d: 'M10,0.5 Q15.5,-0.5 16.5,-3.5 Q13.5,-1.8 11,-1.4Z', fill: '#a8481f' }, root);
    el('path', { d: 'M-12,0 Q-11,8.5 0,8.5 Q11,8.5 12,0 Q6,2.6 0,2.6 Q-6,2.6 -12,0Z', fill: '#b4532a' }, root);
    el('path', { d: 'M-12,0 Q0,3.6 12,0', fill: 'none', stroke: '#e3924f', 'stroke-width': 1.2, 'stroke-linecap': 'round' }, root);
    for (const x of [-6, 0, 6]) el('circle', { cx: x, cy: 5.4, r: 0.9, fill: '#f6c76a' }, root);
    const flame = el('path', { d: 'M0,0 C-2.6,-2 -2.1,-6 0,-10.5 C2.1,-6 2.6,-2 0,0Z', fill: 'url(#ssFlame)' }, root);

    const sparkles = new Sparkles(front, 8);
    let nextSparkle = 0;

    return {
        render(now, dt, scene) {
            const t = reduced ? 0 : now / 1000;
            root.setAttribute('transform', `translate(${scene.x.toFixed(1)},${scene.y.toFixed(1)})`);
            const f = reduced ? 1 : 1 + 0.1 * Math.sin(t * 13.1) + 0.07 * Math.sin(t * 7.3 + 1) + 0.04 * Math.sin(t * 23.7 + 2);
            const lean = reduced ? 0 : 4 * Math.sin(t * 2.1) + 2 * Math.sin(t * 5.3);
            flame.setAttribute('transform', `translate(16,-3.6) rotate(${lean.toFixed(1)}) scale(${(2 - f).toFixed(3)},${f.toFixed(3)})`);
            glow.setAttribute('opacity', (0.22 + 0.12 * (f - 0.8)).toFixed(3));

            if (now >= nextSparkle) {
                nextSparkle = now + rand(1800, 4200);
                const c = charmCenter(scene.charms[0]);
                const a = rand(0, TAU);
                const d = rand(35, 75);
                sparkles.spawn(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.8, rand(-4, 4), rand(-12, -6), rand(3, 5), rand(1.2, 1.8), pick(['#ffd75e', '#ffc23a', '#fff1a8']));
            }
            sparkles.render(dt);
        },
    };
}

// ========== NAVRATRI: marigold beads along every rope ==========
const MARIGOLD_POINTS = [3, 5, 7, 9];       // upper rope only; points 11–13 carry the beads
const MARIGOLDS = [
    { fill: '#f28a1a', edge: '#c65d08', heart: '#a94a06' },
    { fill: '#f7c21f', edge: '#d39a08', heart: '#b07c06' },
];

function navratri(back, front) {
    const groups = new Map();          // charm → [<g>, ...]

    function flowers(charm) {
        let list = groups.get(charm);
        if (!list) {
            const g = el('g', { filter: 'url(#ssShade)' }, front);
            list = MARIGOLD_POINTS.map((_, k) => {
                const c = MARIGOLDS[k % 2];
                const f = el('g', {}, g);
                el('circle', { r: 4.4, fill: c.fill }, f);
                el('circle', { r: 4.4, fill: 'none', stroke: c.edge, 'stroke-width': 1.3, 'stroke-dasharray': '1.3 1.1' }, f);
                el('circle', { r: 2.6, fill: 'none', stroke: c.edge, 'stroke-width': 0.8, 'stroke-dasharray': '1 0.9', opacity: 0.8 }, f);
                el('circle', { r: 1.3, fill: c.heart }, f);
                return f;
            });
            list.group = g;
            groups.set(charm, list);
        }
        return list;
    }

    return {
        render(now, dt, scene) {
            for (const [charm, list] of groups) {
                if (!scene.charms.includes(charm)) {
                    list.group.remove();
                    groups.delete(charm);
                }
            }
            for (const charm of scene.charms) {
                const list = flowers(charm);
                const { rx: px, ry: py } = charm.view;
                MARIGOLD_POINTS.forEach((p, k) => {
                    list[k].setAttribute('transform', `translate(${px[p].toFixed(1)},${py[p].toFixed(1)}) rotate(${charm.view.localAngle(p).toFixed(1)})`);
                });
            }
        },
    };
}

// ========== HOLI: tiny gulal mounds + colour powder puffs on fling/click ==========
const GULAL = ['#ff5fa2', '#ffd23f', '#3ddc97', '#4cc9f0', '#b15cff', '#ff8c42'];

function holi(back, front) {
    const mounds = el('g', { filter: 'url(#ssShade)' }, back);
    [[-8, '#ff5fa2'], [0, '#ffd23f'], [8, '#3ddc97']].forEach(([x, color]) => {
        el('path', { d: `M${x - 4.5},0 Q${x - 3},-6 ${x},-6.4 Q${x + 3},-6 ${x + 4.5},0Z`, fill: color }, mounds);
    });
    el('path', { d: 'M-14,0 Q0,5 14,0Z', fill: '#c9a27a' }, mounds);  // shallow plate

    const puffLayer = el('g', { filter: 'url(#ssPuff)' }, front);
    const puffs = [];
    for (let i = 0; i < 18; i++) {
        puffs.push({ node: el('circle', { r: 0, opacity: 0, style: 'display:none' }, puffLayer), active: false });
    }

    function puff(charm, count, strength) {
        if (reduced) return;
        const c = charmCenter(charm);
        const v = charmVelocity(charm);
        for (let i = 0; i < count; i++) {
            const p = puffs.find((q) => !q.active);
            if (!p) return;
            const a = rand(0, TAU);
            const s = rand(15, 40) * strength;
            Object.assign(p, {
                active: true, life: 0, max: rand(1.4, 2.2),
                x: c.x + rand(-14, 14), y: c.y + rand(-14, 14),
                vx: v.vx * 0.25 + Math.cos(a) * s, vy: v.vy * 0.25 + Math.sin(a) * s - 8,
                r0: rand(5, 9), r1: rand(20, 32) * strength,
            });
            p.node.setAttribute('fill', pick(GULAL));
            p.node.style.display = '';
        }
    }

    function viewCharm(scene, view) {
        return scene.charms.find((c) => c.view === view);
    }

    let lastScene = null;
    return {
        render(now, dt, scene) {
            lastScene = scene;
            mounds.setAttribute('transform', `translate(${scene.x.toFixed(1)},${(scene.y + 4).toFixed(1)})`);
            for (const p of puffs) {
                if (!p.active) continue;
                p.life += dt;
                if (p.life >= p.max) {
                    p.active = false;
                    p.node.style.display = 'none';
                    continue;
                }
                const k = p.life / p.max;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vx *= 1 - 1.5 * dt;
                p.vy *= 1 - 1.5 * dt;
                const ease = 1 - (1 - k) * (1 - k);
                p.node.setAttribute('cx', p.x.toFixed(1));
                p.node.setAttribute('cy', p.y.toFixed(1));
                p.node.setAttribute('r', (p.r0 + (p.r1 - p.r0) * ease).toFixed(1));
                p.node.setAttribute('opacity', (0.5 * (1 - k) * Math.min(1, k * 8)).toFixed(3));
            }
        },
        onRelease(view) {
            const charm = lastScene && viewCharm(lastScene, view);
            if (charm) puff(charm, 6, 1);
        },
        onClick(view) {
            const charm = lastScene && viewCharm(lastScene, view);
            if (charm) puff(charm, 3, 0.7);
        },
    };
}

// ========== CHRISTMAS: snowflakes drifting around the charm ==========
function christmas(back, front) {
    const layer = el('g', { filter: 'url(#ssShade)' }, front);
    const flakes = [];
    for (let i = 0; i < 12; i++) {
        const size = rand(1.6, 3.6);
        const node = el('g', {}, layer);
        if (size > 2.6) {
            for (const a of [0, 60, 120]) {
                el('line', { x1: 0, y1: -size, x2: 0, y2: size, stroke: '#fff', 'stroke-width': 0.8, 'stroke-linecap': 'round', transform: `rotate(${a})` }, node);
            }
        } else {
            el('circle', { r: size * 0.6, fill: '#fff' }, node);
        }
        flakes.push({ node, size, dx: rand(-110, 110), y: rand(0, 300), speed: rand(9, 20), sway: rand(5, 13), phase: rand(0, TAU), spin: rand(-30, 30) });
    }

    return {
        render(now, dt, scene) {
            // Reduced motion: flakes stay where they are, without sway or spin.
            const t = reduced ? 0 : now / 1000;
            const main = scene.charms[0];
            const bottom = Math.max(140, main.rope.py[main.rope.end] + 150);
            const cx = main.rope.anchorX;
            for (const f of flakes) {
                if (!reduced) f.y += f.speed * dt;
                if (f.y > bottom) {
                    f.y = rand(-10, 0);
                    f.dx = rand(-110, 110);
                }
                const x = cx + f.dx + Math.sin(t * 0.6 + f.phase) * f.sway;
                // Fade in at the top of the screen and out near the bottom of the drift area.
                const op = 0.9 * Math.min(1, (f.y + 10) / 30, (bottom - f.y) / 50);
                f.node.setAttribute('transform', `translate(${x.toFixed(1)},${f.y.toFixed(1)}) rotate(${(f.spin * t).toFixed(1)})`);
                f.node.setAttribute('opacity', Math.max(0, op).toFixed(3));
            }
        },
    };
}

// ========== EID: crescent and star hanging on a thread ==========
function eid(back, front) {
    const pivot = el('g', { filter: 'url(#ssShade)' }, back);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 21, stroke: '#c9a14a', 'stroke-width': 0.8 }, pivot);
    const glow = el('circle', { cx: 0, cy: 30, r: 12, fill: '#ffe08a', opacity: 0.25, filter: 'url(#ssGlow)' }, pivot);
    el('path', { d: 'M5.09,-7.42 A9,9 0 1 0 5.09,7.42 A7.5,7.5 0 1 1 5.09,-7.42Z', transform: 'translate(0,30)', fill: '#f2c14e', stroke: '#b8862b', 'stroke-width': 0.6 }, pivot);
    const star = el('path', { d: starPath(3.2, 1.35), transform: 'translate(8,29)', fill: '#ffe39a', stroke: '#b8862b', 'stroke-width': 0.4 }, pivot);

    return {
        render(now, dt, scene) {
            const t = reduced ? 0 : now / 1000;
            const swing = 4 * Math.sin(t * 0.8) + 1.5 * Math.sin(t * 1.9 + 1);
            // The ornament hangs from the top edge of the screen, beside the anchor.
            pivot.setAttribute('transform', `translate(${scene.x.toFixed(1)},0) rotate(${swing.toFixed(2)})`);
            const shimmer = 0.5 + 0.5 * Math.sin(t * 1.7);
            glow.setAttribute('opacity', (0.18 + 0.14 * shimmer).toFixed(3));
            star.setAttribute('opacity', (0.75 + 0.25 * shimmer).toFixed(3));
        },
    };
}

function starPath(outer, inner) {
    let d = '';
    for (let i = 0; i < 10; i++) {
        const r = i % 2 ? inner : outer;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
    }
    return d + 'Z';
}

// ========== NEW YEAR: occasional silver/gold twinkles; a sparkle burst at midnight ==========
function newyear(back, front) {
    const sparkles = new Sparkles(front, 24);
    let nextSparkle = 0;
    const colors = ['#ffd75e', '#f4f6ff', '#ffe9a8', '#cfe3ff'];

    return {
        render(now, dt, scene) {
            if (now >= nextSparkle) {
                nextSparkle = now + rand(2500, 6000);
                const c = charmCenter(scene.charms[0]);
                const a = rand(0, TAU);
                const d = rand(40, 80);
                sparkles.spawn(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.8, 0, rand(-10, -5), rand(2.5, 4), rand(1.2, 1.8), pick(colors));
            }
            sparkles.render(dt);
        },
        burst(scene) {
            const c = charmCenter(scene.charms[0]);
            for (let i = 0; i < 18; i++) {
                const a = (i / 18) * TAU + rand(-0.15, 0.15);
                const s = rand(45, 95);
                sparkles.spawn(c.x, c.y, Math.cos(a) * s, Math.sin(a) * s, rand(3, 5), rand(1.3, 2), pick(colors));
            }
        },
    };
}

// ========== PONGAL: sugarcane pair behind a small rice-flour kolam ==========
function pongal(back, front) {
    const root = el('g', { filter: 'url(#ssShade)' }, back);
    for (const dir of [-1, 1]) {
        const cane = el('g', { transform: `rotate(${dir * 22})` }, root);
        el('line', { x1: 0, y1: 12, x2: 0, y2: -16, stroke: '#5f8f35', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, cane);
        for (const y of [6, 0, -6, -12]) el('line', { x1: -1.4, y1: y, x2: 1.4, y2: y, stroke: '#3d6620', 'stroke-width': 0.8 }, cane);
        el('path', { d: 'M0,-16 Q-6,-21 -9,-19 Q-5,-18 0,-15Z', fill: '#8cc152' }, cane);
        el('path', { d: 'M0,-16 Q5,-23 8,-22 Q4,-19 0,-15Z', fill: '#7ab342' }, cane);
    }
    // Kolam: four looping petals around a dot grid, rice-flour white with a soft brown underline
    // so it stays visible on light wallpapers.
    const kolam = el('g', { transform: 'translate(0,9)' }, root);
    el('circle', { r: 9.5, fill: '#7a3f1d', opacity: 0.55 }, kolam);
    for (const [stroke, w] of [['#5a2e14', 1.8], ['#fffaf0', 0.8]]) {
        for (const a of [0, 45, 90, 135]) {
            el('ellipse', { rx: 7.5, ry: 2.6, fill: 'none', stroke, 'stroke-width': w, transform: `rotate(${a})` }, kolam);
        }
    }
    for (const [x, y] of [[0, 0], [4.8, 4.8], [-4.8, 4.8], [4.8, -4.8], [-4.8, -4.8]]) {
        el('circle', { cx: x, cy: y, r: 0.9, fill: '#fffaf0' }, kolam);
    }

    return {
        render(now, dt, scene) {
            root.setAttribute('transform', `translate(${scene.x.toFixed(1)},${scene.y.toFixed(1)})`);
        },
    };
}

const BUILDERS = { diwali, navratri, holi, christmas, eid, newyear, pongal };

/** Decoration for a festival id, or null for an unknown id. */
export function createDecor(id, back, front) {
    const build = BUILDERS[id];
    return build ? build(back, front) : null;
}
