// Smart hiding and reduced motion: consumers of src-tauri/src/smart_hide.rs.
//
//   smart-hide    { hidden, reason }  a fullscreen app or a call: app.js fades the overlay out
//                                     over 0.5 s, pauses physics and releases mouse capture
//   system-motion { animations }      Windows "Animation effects"; followed when reduced_motion
//                                     is 'auto'
//
// Effective reduced motion = reduced_motion 'on', or 'auto' while Windows animations are off.
// It is published as world.reducedMotion (app.js forwards it to every rope and charm view);
// features read the flag each step/frame, so a Settings preview calms everything live.

import { registerFeature } from '../features.js';

let world = null;
/** 'auto' | 'on' | 'off' */
let mode = 'auto';
/** What Windows last reported; assume animations on until told otherwise. */
let systemAnimations = true;

function sync() {
    if (!world) return;
    const reduced = mode === 'on' || (mode === 'auto' && !systemAnimations);
    if (reduced !== world.reducedMotion) world.setReducedMotion(reduced);
}

registerFeature({
    onInit(w) {
        world = w;
        w.listen('smart-hide', (e) => w.setHidden(!!e.payload.hidden));
        w.listen('system-motion', (e) => {
            systemAnimations = e.payload.animations !== false;
            sync();
        });
    },

    onConfig(cfg) {
        if (cfg.reduced_motion !== undefined) {
            mode = cfg.reduced_motion === 'on' || cfg.reduced_motion === 'off' ? cfg.reduced_motion : 'auto';
            sync();
        }
    },
});
