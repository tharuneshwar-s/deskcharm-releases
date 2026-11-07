// One or two charms: where the anchors hang and which charm is charm 2. Pure functions (tested
// in test/two-charms.test.mjs); used by app.js (main anchor) and features/toys.js (charm 2).
// Config: charm_count (1|2), second_charm / second_charm_data (remembered while charm_count is 1),
// second_place ('beside'|'opposite'), second_size / second_length (% like charm_size / string_length).

export const ANCHOR_MARGIN = 170;   // logical px from the monitor edge to a rope anchor
const BESIDE_MIN_DX = 70;           // px between the two anchors, at least
const BESIDE_GAP = 16;              // px between the two charm bodies at rest

/** Screen x of the main anchor: `offset` px from the margin of the chosen top corner. */
export function mainAnchorX(position, offset, width) {
    const edge = position === 'top-left' ? ANCHOR_MARGIN : width - ANCHOR_MARGIN;
    return edge + offset;
}

/** Opposite corner: the main anchor mirrored across the screen centre (offset mirrored too). */
export function oppositeAnchorX(position, offset, width) {
    return width - mainAnchorX(position, offset, width);
}

/** Beside: anchor offset from the main one, toward the screen centre, bodies `BESIDE_GAP` apart. */
export function besideDX(position, mainRadius, secondRadius) {
    const dist = Math.max(BESIDE_MIN_DX, mainRadius + secondRadius + BESIDE_GAP);
    return position === 'top-left' ? dist : -dist;
}

/** charm_count: 1 or 2; anything else (configs from before the field) means one charm. */
export function charmCount(cfg) {
    return cfg.charm_count === 2 ? 2 : 1;
}

/**
 * Charm 2 to show: { id, data } or null with one charm. With none chosen (or its data missing)
 * the catalog's default for the main charm (`catalog.defaultSecond`, src/charms.js) when known.
 */
export function secondChoice(cfg, catalog) {
    if (charmCount(cfg) !== 2) return null;
    if (cfg.second_charm && cfg.second_charm_data) return { id: cfg.second_charm, data: cfg.second_charm_data };
    if (!catalog) return null;
    if (cfg.second_charm) {
        for (const cat of catalog.categories) {
            const hit = cat.charms.find((c) => c.id === cfg.second_charm);
            if (hit) return { id: hit.id, data: hit };
        }
    }
    const d = catalog.defaultSecond(cfg.charm || '');
    return d ? { id: d.id, data: d } : null;
}

/** Charm 2 scale and rope length (%), defaulting to the main charm's. */
export function secondSize(cfg) {
    return {
        size: cfg.second_size || cfg.charm_size || 100,
        length: cfg.second_length || cfg.string_length || 70,
    };
}
