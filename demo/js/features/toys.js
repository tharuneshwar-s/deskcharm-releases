// Stress toys: chime melodies, charm 2 (one or two charms; see two-charms.js) with charm–charm
// collisions, and the sounds of bead contacts and the hook wrap. Bead sliding and hook winding
// physics live in rope.js (they read the solved rope); this module turns their events into sound.

import { registerFeature } from '../features.js';
import { playBell, swingNote, beadClick, clack, hookNote, setMelody, isMelody } from '../audio.js';
import { BASE_SEG } from '../rope.js';
import { besideDX, oppositeAnchorX, secondChoice, secondSize } from '../two-charms.js';

const MOTION_BELL_SPEED = 3.0;    // px/step: the classic bell on fast charm movement
const SWING_NOTE_SPEED = 1.0;     // px/step charm speed through the bottom of a swing for a note
const SIDE_DEADBAND = 2;          // px either side of the anchor before a swing counts as crossed
const CLACK_SPEED = 0.6;          // px/step closing speed that makes a clack
const COLLIDE_BOUNCE = 0.35;      // restitution: charms knock softly, never ping apart
const MAX_KNOCK_V = 12;           // px/step a collision may add to a charm (calm under flings)

/** Charm 2's world entry ({ rope, view, anchorDX, … }), or null. */
let second = null;
let secondId = '';
let opposite = false;
/** src/charms.js, loaded on first need (charm 2 turned on with none chosen); null until then. */
let catalog = null;
let catalogLoading = false;
/** Per-rope swing state for melody passes: which side of the anchor the charm is on. */
const swingSide = new WeakMap();

/** The overlay doesn't ship the catalog in its bundle; Settings normally saves charm 2's data. */
function loadCatalog(world) {
    if (catalog || catalogLoading) return;
    catalogLoading = true;
    const s = document.createElement('script');
    s.src = 'charms.js';
    s.onload = () => {
        catalog = window.DeskCharmCatalog || null;
        if (catalog) syncSecond(world, {});
    };
    document.head.appendChild(s);
}

/** Create, restyle, size, place or remove charm 2 to match the merged config. */
function syncSecond(world, cfg) {
    const conf = world.config;
    const pick = secondChoice(conf, catalog);
    if (!pick) {
        if (second) world.removeCharm(second);
        second = null;
        secondId = '';
        if (conf.charm_count === 2 || (conf.charm_count == null && conf.second_charm)) loadCatalog(world);
        return;
    }

    if (!second) {
        second = world.addCharm(0, pick.data);
    } else if (pick.id !== secondId || cfg.second_charm_data !== undefined) {
        second.view.applyCharm(pick.data);
    }
    secondId = pick.id;

    const { size, length } = secondSize(conf);
    if (second.ownScale !== size / 100) {
        second.ownScale = size / 100;
        second.view.setScale(second.ownScale);
    }
    const seg = BASE_SEG * (length / 100);
    if (second.ownSeg !== seg) {
        second.ownSeg = seg;
        second.rope.setSegment(seg);
    }

    const pos = conf.position || 'top-right';
    opposite = conf.second_place === 'opposite';
    if (opposite) {
        second.anchorAt = () => oppositeAnchorX(pos, conf.offset || 0, window.innerWidth);
    } else {
        second.anchorAt = null;
        second.anchorDX = besideDX(pos, world.charms[0].view.bodyRadius(), second.view.bodyRadius());
    }
    world.placeAnchors();
}

/** Sounds for the bead contacts and hook winding the rope reported in its last solve(). */
function playRopeEvents(rope) {
    const lastBead = rope.beadS.length - 1;
    for (const ev of rope.events) {
        if (ev.type === 'bead') beadClick(ev.speed, 1 - ev.bead / Math.max(1, lastBead));
        else if (ev.type === 'beadCharm') beadClick(ev.speed, 0);
        else if (ev.type === 'wrap') hookNote('wrap', ev.turns);
        else if (ev.type === 'unwrap') hookNote('wrap', 1);
        else if (ev.type === 'unwound') hookNote('unwound');
    }
}

/**
 * Motion chimes. Melody off: the classic bell on fast movement (not during a drag/fling).
 * Melody on: a note each time the charm swings through the bottom, pitched by its speed.
 */
function motionChime(world, rope) {
    const e = rope.end;
    const vx = rope.px[e] - rope.ox[e];
    const speed = rope.endSpeed();
    if (!isMelody()) {
        if (!world.interaction.suppressMotionChime && speed > MOTION_BELL_SPEED) playBell();
        return;
    }
    const dx = rope.px[e] - rope.anchorX;
    const prev = swingSide.get(rope) || 0;
    const side = dx > SIDE_DEADBAND ? 1 : dx < -SIDE_DEADBAND ? -1 : prev;
    swingSide.set(rope, side);
    if (prev !== 0 && side !== prev && !rope.held && rope.py[e] > rope.anchorY && speed > SWING_NOTE_SPEED) {
        swingNote(speed, Math.sign(vx));
    }
}

/**
 * Charm–charm collision on circle approximations of the bodies. Overlap is removed without
 * adding velocity (old positions move too); the approach speed is then reflected with a soft
 * restitution. A swept test catches a charm yanked clean through the other in one step.
 */
function collide(a, b) {
    const A = a.rope, B = b.rope;
    if (A.held && B.held) return;
    const R = a.view.bodyRadius() + b.view.bodyRadius();
    const ca = a.view.bodyCenter();
    const cb = b.view.bodyCenter();
    const ea = A.end, eb = B.end;
    const vax = A.px[ea] - A.ox[ea], vay = A.py[ea] - A.oy[ea];
    const vbx = B.px[eb] - B.ox[eb], vby = B.py[eb] - B.oy[eb];
    const rvx = vbx - vax, rvy = vby - vay;
    const relX = cb.x - ca.x, relY = cb.y - ca.y;
    let dist = Math.hypot(relX, relY);
    let nx, ny;
    if (dist < R) {
        if (dist > 1e-6) {
            nx = relX / dist;
            ny = relY / dist;
        } else {
            nx = 1;
            ny = 0;
        }
    } else {
        const p0x = relX - rvx, p0y = relY - rvy;
        const l2 = rvx * rvx + rvy * rvy;
        if (l2 < 1e-6) return;
        const t = Math.max(0, Math.min(1, -(p0x * rvx + p0y * rvy) / l2));
        if (Math.hypot(p0x + rvx * t, p0y + rvy * t) >= R) return;
        // Tunnelled this step: push back out on the side it came from.
        const d0 = Math.hypot(p0x, p0y);
        if (d0 < 1e-6) return;
        nx = p0x / d0;
        ny = p0y / d0;
        dist = relX * nx + relY * ny;
    }

    const wa = A.held ? 0 : A.invMass[ea];
    const wb = B.held ? 0 : B.invMass[eb];
    const wsum = wa + wb;
    if (wsum === 0) return;
    const overlap = R - dist;

    const closing = -(rvx * nx + rvy * ny);
    let impulse = 0;
    if (closing > 0) {
        impulse = (1 + COLLIDE_BOUNCE) * closing / wsum;
        if (closing > CLACK_SPEED) clack(closing);
    }
    shift(A, -nx, -ny, overlap * wa / wsum, Math.min(MAX_KNOCK_V, impulse * wa));
    shift(B, nx, ny, overlap * wb / wsum, Math.min(MAX_KNOCK_V, impulse * wb));
}

/** Move a charm (its two heavy end points) by `dist` along (nx, ny) and add `dv` px/step. */
function shift(rope, nx, ny, dist, dv) {
    if (rope.held) return;
    for (let i = rope.end - 1; i <= rope.end; i++) {
        rope.px[i] += nx * dist;
        rope.py[i] += ny * dist;
        rope.ox[i] += nx * (dist - dv);
        rope.oy[i] += ny * (dist - dv);
    }
}

registerFeature({
    onConfig(cfg, world) {
        if (cfg.melody_chimes !== undefined) setMelody(cfg.melody_chimes);
        if (['second_charm', 'second_charm_data', 'charm_count', 'second_place', 'second_size', 'second_length',
            'charm', 'position', 'offset', 'charm_size', 'string_length'].some((k) => cfg[k] !== undefined)) {
            syncSecond(world, cfg);
        }
    },

    onStep(world) {
        const charms = world.charms;
        for (const c of charms) {
            playRopeEvents(c.rope);
            motionChime(world, c.rope);
        }
        // Opposite corners never meet: no collisions to test.
        if (opposite) return;
        for (let i = 0; i < charms.length; i++) {
            for (let j = i + 1; j < charms.length; j++) collide(charms[i], charms[j]);
        }
    },
});
