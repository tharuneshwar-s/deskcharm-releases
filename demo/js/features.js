// Feature plug-in registry. A feature module calls registerFeature() at import time and is
// imported once from app.js. All hooks are optional.
//
//   onInit(world)               after the world exists, before the first frame
//   onConfig(cfg, world)        every config/preview update (cfg may be partial)
//   onStep(world)               each fixed 120 Hz physics step, after ropes integrate,
//                               before constraints are solved
//   onRender(world, now, dt)    once per animation frame, after charms render
//
// `world` is created in app.js; see its definition for the available fields.

const features = [];

export function registerFeature(feature) {
    features.push(feature);
}

export function initFeatures(world) {
    for (const f of features) f.onInit?.(world);
}

export function configFeatures(cfg, world) {
    for (const f of features) f.onConfig?.(cfg, world);
}

export function stepFeatures(world) {
    for (const f of features) f.onStep?.(world);
}

export function renderFeatures(world, now, dt) {
    for (const f of features) f.onRender?.(world, now, dt);
}
