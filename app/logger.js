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

    // Serialiser that handles the things JSON.stringify silently
    // breaks on: Set, Map, BigInt, circular refs, undefined.
    // The previous logger used raw JSON.stringify → a Set serialised
    // as {} and a circular object as "[object Object]" → log lines
    // like "🧪 STRATEGY-ANALYSER DECISION: Object", which made
    // post-mortem debugging impossible.
    function _safe(value, depth) {
        if (depth == null) depth = 0;
        if (depth > 6) return '[depth>6]';
        if (value === null || value === undefined) return value;
        if (typeof value === 'bigint') return String(value) + 'n';
        if (typeof value === 'function') return '[function ' + (value.name || 'anon') + ']';
        if (value instanceof Set) return { _type: 'Set', size: value.size, values: Array.from(value).slice(0, 50) };
        if (value instanceof Map) return { _type: 'Map', size: value.size, entries: Array.from(value.entries()).slice(0, 50) };
        if (value instanceof Error) return { _type: 'Error', message: value.message, stack: value.stack };
        if (Array.isArray(value)) {
            if (value.length > 200) return { _type: 'Array', length: value.length, head: value.slice(0, 50).map(v => _safe(v, depth + 1)) };
            return value.map(v => _safe(v, depth + 1));
        }
        if (typeof value === 'object') {
            const seen = _safe._seen || (_safe._seen = new WeakSet());
            if (seen.has(value)) return '[circular]';
            seen.add(value);
            const out = {};
            for (const k of Object.keys(value)) {
                try { out[k] = _safe(value[k], depth + 1); }
                catch (_) { out[k] = '[unserialisable]'; }
            }
            seen.delete(value);
            return out;
        }
        return value;
    }

    function fmt(level, args) {
        const ts = new Date().toISOString();
        const parts = args.map(a => {
            if (typeof a === 'string') return a;
            if (typeof a === 'number' || typeof a === 'boolean' || a === null || a === undefined) return String(a);
            try { _safe._seen = new WeakSet(); return JSON.stringify(_safe(a)); }
            catch (_) { return String(a); }
            finally { _safe._seen = null; }
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
