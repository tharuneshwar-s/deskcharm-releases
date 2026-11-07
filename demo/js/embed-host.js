// Runs the overlay embedded in another page — the website hero (docs/) and the charm preview
// in Settings — when the page is loaded with `?embed`. Without `?embed` it does nothing and the
// overlay talks to Tauri as usual.
//
// It provides window.DeskHostApi, a stand-in for the parts of the Tauri API js/app.js uses, so
// an embedded charm can never touch a real window or broadcast real events. The embedding page
// plays the part the desktop app's Rust side plays, through window.parent.DeskEmbedHost:
//   config()          → the config to show (sent as `current-config` when the overlay asks)
//   setCapture(on)    ← the overlay wants the mouse (charm hovered) or not
// and drives the overlay with window.DeskEmbed.fire(event, payload), e.g. `cursor-pos`,
// `preview-config`, `smart-hide`.
(function() {
    if (!/[?&]embed(\b|=|&|$)/.test(location.search)) return;

    var handlers = {};

    function fire(name, payload) {
        (handlers[name] || []).forEach(function(h) { h({ payload: payload }); });
    }

    function host() {
        try {
            return window.parent !== window ? window.parent.DeskEmbedHost : null;
        } catch (e) {
            return null; // embedded cross-origin: run standalone
        }
    }

    window.DeskHostApi = {
        core: {
            invoke: function() { return Promise.resolve(null); },
            convertFileSrc: function(p) { return p; }
        },
        window: {
            getCurrentWindow: function() {
                return {
                    setIgnoreCursorEvents: function(ignore) {
                        var h = host();
                        if (h && h.setCapture) h.setCapture(!ignore);
                        return Promise.resolve();
                    },
                    show: function() { return Promise.resolve(); },
                    hide: function() { return Promise.resolve(); },
                    isVisible: function() { return Promise.resolve(true); }
                };
            }
        },
        event: {
            listen: function(name, cb) {
                (handlers[name] = handlers[name] || []).push(cb);
                return Promise.resolve(function() {});
            },
            // Nothing leaves the embed; only the overlay's config request is answered.
            emit: function(name) {
                if (name === 'request-config') {
                    var h = host();
                    if (h) setTimeout(function() { fire('current-config', h.config()); }, 0);
                }
                return Promise.resolve();
            }
        }
    };

    window.DeskEmbed = { fire: fire };

    // Touch screens: a swipe that starts on the charm or a bead drags it; anywhere else (including
    // the rope) it scrolls the page as usual.
    document.addEventListener('touchstart', function(e) {
        var t = e.target;
        if (t && t.closest && t.closest('#layer-charms') && t.tagName !== 'path') e.preventDefault();
    }, { passive: false });
})();
