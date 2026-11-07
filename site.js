// Website behaviour: OS-aware download buttons, the live charm in the hero, scroll reveal.
document.documentElement.classList.add('js');

// ========== DOWNLOADS FOR THE VISITOR'S OS ==========
(function() {
    var ua = navigator.userAgent;
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    var os = /Win/i.test(platform + ua) ? 'windows'
        : /Mac/i.test(platform) && !/iPhone|iPad/i.test(ua) ? 'macos'
        : /Linux/i.test(platform) && !/Android/i.test(ua) ? 'linux'
        : null;
    if (!os) return; // phones/tablets: keep the generic "Download" → all options

    var card = document.querySelector('.dl[data-os="' + os + '"]');
    var link = card && card.querySelector('a.btn');
    var names = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

    var hero = document.getElementById('hero-download');
    if (link) {
        hero.href = link.href;
        hero.textContent = 'Download for ' + names[os] + (os === 'windows' ? '' : ' (untested)');
        document.getElementById('hero-other').textContent = 'Other platforms';
    }

    card.classList.add('current');
    card.parentNode.insertBefore(card, card.parentNode.firstChild);

    var help = document.querySelector('.install details[data-os="' + os + '"]');
    if (help) help.open = true;
})();

// ========== LIVE CHARM ==========
// The hero runs the real overlay (docs/demo, copied from src/ by scripts/build-site-demo.mjs) in a
// transparent frame. Like the desktop app, the frame ignores the mouse until the charm is hovered:
// this page forwards the cursor position, and the overlay asks for the mouse when it's over the
// charm (setIgnoreCursorEvents → setCapture). Touch screens have no hover, so there the frame only
// covers the charm's own box and always takes input.
(function() {
    var frame = document.getElementById('charm-demo');
    var wrap = document.getElementById('hero-wrap');
    var slot = document.getElementById('charm-slot');
    var soundBtn = document.getElementById('sound-toggle');
    if (!frame || !slot) return;

    /** Overlay rope anchor sits this far from the left edge for position 'top-left' (js/app.js). */
    var ANCHOR_MARGIN = 170;
    // No hover (phones, tablets): the frame always takes input inside the charm's box.
    var touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    // One-column hero (narrow window or phone): the charm hangs in its own box below the text.
    var stackedQuery = window.matchMedia('(max-width: 900px)');
    var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var soundOn = false;
    var ready = false;
    var lastMouse = null;
    /** The overlay wants the mouse (charm hovered or held). */
    var captured = false;
    var isBoxed = false;

    var BASE = {
        position: 'top-left',
        charm: 'nazar-blue',
        charm_data: {
            id: 'nazar-blue', image: 'nazar-blue.png', weight: 'medium',
            rope: '#6B4423', ropeHi: '#b58b5c', rs: 'rope',
            beadType: 'evil-eye', beadColors: ['#2140bf', '#73ccfa', '#0d0d1a'], beadSmall: '#e9ebf2'
        },
        charm_size: 120, string_length: 70, opacity: 1,
        idle_animation: true, cursor_interaction: true, drag_interaction: true, melody_chimes: true,
        second_charm: '', second_charm_data: null,
        break_reminders: false, eye_rest: false, day_night: false, festival_themes: false,
        music_sway: false, typing_breeze: false, window_shake: false, weather_wind: false,
        hide_fullscreen: false, hide_from_capture: false, hide_during_calls: false, app_tracking: false
    };

    function demo() {
        try {
            return frame.contentWindow && frame.contentWindow.DeskEmbed;
        } catch (e) {
            return null;
        }
    }

    function send(name, payload) {
        var d = demo();
        if (d) d.fire(name, payload);
    }

    /**
     * Frame position. Wide layout with a mouse: the whole hero, so the charm can be flung over the
     * text while clicks pass through. One-column layout or touch: only the charm's box, so it
     * never hangs over the text and touches outside it scroll the page.
     */
    function place() {
        var boxed = touch || stackedQuery.matches;
        if (boxed) {
            var w = wrap.getBoundingClientRect();
            var s = slot.getBoundingClientRect();
            frame.style.left = (s.left - w.left) + 'px';
            frame.style.top = (s.top - w.top) + 'px';
            frame.style.width = s.width + 'px';
            frame.style.height = s.height + 'px';
        } else {
            frame.style.left = frame.style.top = frame.style.width = frame.style.height = '';
        }
        // Boxed, the frame covers only the charm's area, so it can always take input (no hover
        // needed — works for touch, pens and mice alike). Wide, it follows the charm's hover.
        frame.style.pointerEvents = boxed ? 'auto' : (captured ? 'auto' : 'none');
        wrap.classList.toggle('boxed', boxed);
        isBoxed = boxed;
    }

    /** Anchor offset that hangs the charm over the middle of its slot. */
    function offset() {
        var f = frame.getBoundingClientRect();
        var s = slot.getBoundingClientRect();
        return Math.round(s.left + s.width / 2 - f.left - ANCHOR_MARGIN);
    }

    function config() {
        return Object.assign({}, BASE, {
            offset: offset(),
            sound_effects: soundOn,
            reduced_motion: reducedQuery.matches ? 'on' : 'off'
        });
    }

    window.DeskEmbedHost = {
        config: function() {
            if (!ready) {
                ready = true;
                // Let the first config place the charm before fading it in (no jump from the
                // overlay's default position).
                setTimeout(function() { wrap.classList.add('live'); }, 150);
                watchFirstTouch();
            }
            return config();
        },
        setCapture: function(on) {
            captured = on;
            if (!isBoxed) frame.style.pointerEvents = on ? 'auto' : 'none';
        }
    };

    function relayout() {
        place();
        if (ready) send('preview-config', { position: 'top-left', offset: offset() });
    }

    function forward(x, y) {
        var f = frame.getBoundingClientRect();
        send('cursor-pos', [x - f.left, y - f.top]);
    }

    if (!touch) {
        document.addEventListener('pointermove', function(e) {
            if (e.pointerType !== 'mouse') return;
            lastMouse = [e.clientX, e.clientY];
            forward(e.clientX, e.clientY);
        }, { passive: true });
        // The page moved under a still cursor: tell the charm where the cursor is now.
        window.addEventListener('scroll', function() {
            if (lastMouse) forward(lastMouse[0], lastMouse[1]);
        }, { passive: true });
    }

    function watchFirstTouch() {
        try {
            frame.contentWindow.addEventListener('pointerdown', function() {
                slot.classList.add('touched');
            }, { once: true });
        } catch (e) { /* hint just stays */ }
    }

    // Pause the charm while the hero is off screen (the overlay's own smart-hide).
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function(entries) {
            send('smart-hide', { hidden: !entries[0].isIntersecting, reason: null });
        }).observe(frame);
    }

    soundBtn.addEventListener('click', function() {
        soundOn = !soundOn;
        soundBtn.setAttribute('aria-pressed', String(soundOn));
        soundBtn.querySelector('span').textContent = soundOn ? 'Sound on' : 'Sound off';
        send('preview-config', { sound_effects: soundOn });
    });

    var onReduced = function() { send('preview-config', { reduced_motion: reducedQuery.matches ? 'on' : 'off' }); };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);

    document.documentElement.classList.toggle('touch', touch);
    window.addEventListener('resize', relayout);
    // The frame may load before or after this script: push the config on load either way.
    frame.addEventListener('load', function() {
        place();
        if (demo()) send('current-config', window.DeskEmbedHost.config());
    });
    place();
})();

// ========== SCROLL REVEAL ==========
(function() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        items.forEach(function(el) { el.classList.add('in'); });
        return;
    }
    var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
            if (e.isIntersecting) {
                e.target.classList.add('in');
                io.unobserve(e.target);
            }
        });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function(el) { io.observe(el); });
})();
