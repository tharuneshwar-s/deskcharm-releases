// Uncaught errors and unhandled promise rejections → the local error log (Rust `log_js_error`,
// src-tauri/src/logs.rs; rate-limited there, never sent anywhere). Classic script: loaded by
// settings.html with <script src> and imported for its side effect at the top of app.js.
(function() {
    if (window.__deskErrorLog) return;
    window.__deskErrorLog = true;
    var name = /settings/.test(location.pathname) ? 'settings' : 'main';
    function send(message, stack) {
        var t = window.__TAURI__;
        if (!(t && t.core)) return;
        try {
            t.core.invoke('log_js_error', { window: name, message: String(message).slice(0, 2000), stack: stack ? String(stack).slice(0, 4000) : null })
                .catch(function() {});
        } catch (_) {}
    }
    window.addEventListener('error', function(e) {
        var where = e.filename ? ' (' + e.filename + ':' + e.lineno + ':' + e.colno + ')' : '';
        send((e.message || 'Error') + where, e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', function(e) {
        var r = e.reason;
        send('Unhandled rejection: ' + (r && r.message ? r.message : r), r && r.stack);
    });
})();
