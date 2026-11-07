// Ambient sounds in the overlay (config ambience / ambience_volume / ambience_with_sessions).
// Synths and the pure state machine live in js/ambience.js; this module feeds it the inputs:
//   session  breathing/focus running (`wellness-state` from features/wellness.js, plus
//            `wellness-command` so a menu start is heard before the state echo arrives)
//   muted    global mute (sound_effects off), via audio.js onMuteChange
//   hidden   smart hiding (world.hidden) or the overlay window / page hidden
// Every change fades over ~2 s; a hidden overlay fades out and then stops the graph.

import { registerFeature } from '../features.js';
import { audioContext, isMuted, onMuteChange } from '../audio.js';
import { AmbiencePlayer, IDLE, resolveAmbience, stepAmbience } from '../ambience.js';

const TICK_MS = 250;
const VISIBILITY_POLL_MS = 2000;

let world = null;
let player = null;
let state = IDLE;
let sound = 'off';
let volume = 40;
let withSessions = true;
let breathing = false;
let focus = false;
let windowVisible = true;
let lastPoll = 0;
let lastHidden = false;
let timer = 0;

function hidden() {
    return !!world?.hidden || !windowVisible || document.hidden;
}

function update() {
    const now = Date.now();
    if (world && now - lastPoll >= VISIBILITY_POLL_MS) {
        lastPoll = now;
        world.appWindow?.isVisible?.().then((v) => { windowVisible = v; }, () => {});
    }
    const target = resolveAmbience({ sound, withSessions, session: breathing || focus, muted: isMuted(), hidden: hidden() });
    if (!target && state.phase === 'idle') {
        clearInterval(timer);
        timer = 0;
        return;
    }
    const { state: next, actions } = stepAmbience(state, target, now);
    state = next;
    for (const a of actions) {
        if (a.type === 'start') {
            if (!player) player = new AmbiencePlayer(audioContext());
            player.setVolume(volume);
            player.start(a.sound);
        } else if (a.type === 'fade-in') player.fadeIn();
        else if (a.type === 'fade-out') player.fadeOut();
        else if (a.type === 'stop') player.stop();
    }
}

/** Run the state machine now and keep ticking until everything is silent again. */
function kick() {
    update();
    if (!timer && state.phase !== 'idle') timer = setInterval(update, TICK_MS);
}

function onWellnessCommand(e) {
    switch (e.payload?.action) {
        case 'breathe': breathing = true; break;
        case 'stop-breathe': breathing = false; break;
        case 'focus': focus = true; break;
        case 'stop-focus': focus = false; break;
        default: return;
    }
    kick();
}

registerFeature({
    onInit(w) {
        world = w;
        w.listen('wellness-state', (e) => {
            breathing = !!e.payload?.breathing;
            focus = !!e.payload?.focus;
            kick();
        });
        w.listen('wellness-command', onWellnessCommand);
        onMuteChange(kick);
        document.addEventListener('visibilitychange', kick);
        // Tray "Hide" hides the window without an event: re-check slowly while silent.
        setInterval(() => { if (!timer) kick(); }, VISIBILITY_POLL_MS);
    },
    onConfig(cfg) {
        if (cfg.ambience !== undefined) sound = cfg.ambience;
        if (cfg.ambience_with_sessions !== undefined) withSessions = cfg.ambience_with_sessions;
        if (cfg.ambience_volume !== undefined) {
            volume = cfg.ambience_volume;
            player?.setVolume(volume);
        }
        kick();
    },
    onRender(w) {
        // Smart hiding flips world.hidden without an event.
        if (w.hidden !== lastHidden) {
            lastHidden = w.hidden;
            kick();
        }
    },
});
