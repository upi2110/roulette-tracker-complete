// Renderer-side session logger.
// Patches console.log / info / warn / error so every line is mirrored
// to the per-session frontend log file via aiAPI.appendLog. Captures:
//   - All existing app console output (clicks, decisions, bets,
//     predictions, file events, errors, …)
//   - Unhandled errors and promise rejections
// The original console output is preserved so DevTools still shows it.
//
// Loaded as the FIRST script in app/index-3tables.html so subsequent
// scripts' console output is captured from the very first load event.
(function (globalRef) {
    'use strict';
    if (!globalRef || globalRef.__sessionLoggerInstalled) return;
    globalRef.__sessionLoggerInstalled = true;

    const orig = {
        log:   console.log.bind(console),
        info:  console.info.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
    };

    function fmt(level, args) {
        const ts = new Date().toISOString();
        const parts = args.map(a => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); }
            catch (_) { return String(a); }
        });
        return `[${ts}] ${level.padEnd(5)} ${parts.join(' ')}`;
    }

    function forward(level, args) {
        try {
            const line = fmt(level, args);
            if (globalRef.aiAPI && typeof globalRef.aiAPI.appendLog === 'function') {
                // Fire-and-forget; do not await — keep console.* synchronous.
                globalRef.aiAPI.appendLog(line);
            }
        } catch (_) { /* never block the UI on logging */ }
    }

    console.log   = function (...a) { forward('LOG',   a); orig.log.apply(console, a); };
    console.info  = function (...a) { forward('INFO',  a); orig.info.apply(console, a); };
    console.warn  = function (...a) { forward('WARN',  a); orig.warn.apply(console, a); };
    console.error = function (...a) { forward('ERROR', a); orig.error.apply(console, a); };
    console.debug = function (...a) { forward('DEBUG', a); orig.debug.apply(console, a); };

    if (typeof globalRef.addEventListener === 'function') {
        globalRef.addEventListener('error', (ev) => {
            try { forward('ERROR', [`[unhandled] ${ev.message} at ${ev.filename}:${ev.lineno}:${ev.colno}`]); }
            catch (_) {}
        });
        globalRef.addEventListener('unhandledrejection', (ev) => {
            try { forward('ERROR', [`[unhandled-rejection]`, (ev.reason && ev.reason.message) || ev.reason]); }
            catch (_) {}
        });
    }

    // Surface install confirmation so we can verify the logger is
    // actually mirroring from the very first session line.
    console.log('[session-logger] frontend logger installed; mirroring console.* to aiAPI.appendLog');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
