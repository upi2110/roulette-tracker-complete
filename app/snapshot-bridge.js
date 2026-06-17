/**
 * snapshot-bridge.js — keep snapshots/current.{html,xlsx} in sync
 * with window.spins.
 *
 * Strategy
 * --------
 * Poll window.spins every 500ms. When the spin count changes,
 * call aiAPI.refreshSnapshot(spinsAsNumbers). The main process
 * writes the snapshot files; the open browser tab auto-refreshes
 * every 2s and picks up the new HTML without any user action.
 *
 * Why polling (not an event)
 * --------------------------
 * The renderer doesn't expose a "spins changed" event the bridge
 * could subscribe to. spins is a plain array mutated in-place by
 * many places (manual entry, undo, reset, training load). Polling
 * the length is the lowest-risk way to catch every change without
 * patching every mutator.
 *
 * Performance
 * -----------
 * Two checks per second, no work unless the count actually changed.
 * Snapshot generation itself runs in the main process (out of the
 * renderer's critical path); the renderer just dispatches.
 *
 * Failure mode
 * ------------
 * If aiAPI isn't ready, the bridge silently skips and tries again
 * next tick. Never throws into the renderer.
 *
 * Lock contract
 * -------------
 * This file does NOT modify window.spins, the engine, or any
 * existing UI. It is a pure read → dispatch pipe. The math itself
 * lives in core/tables/projections.js, which is locked.
 */

(function () {
    'use strict';

    let _lastCount = -1;
    let _inFlight  = false;

    function _snapshotSpins() {
        // window.spins is the array of { actual, direction, ... } entries
        // the renderer maintains. We only need the actual numbers.
        if (!Array.isArray(window.spins)) return null;
        return window.spins
            .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
            .filter(n => n !== null);
    }

    async function _maybeRefresh() {
        if (_inFlight) return;
        if (!window.aiAPI || typeof window.aiAPI.refreshSnapshot !== 'function') return;

        const spins = _snapshotSpins();
        if (!spins) return;

        if (spins.length === _lastCount) return;     // no change
        _lastCount = spins.length;

        _inFlight = true;
        try {
            const r = await window.aiAPI.refreshSnapshot(spins);
            if (r && r.ok) {
                console.log(`📸 Snapshot refreshed (${r.spinCount} spins → spin-${r.idx})`);
            } else if (r && !r.ok) {
                console.warn('📸 Snapshot refresh returned error:', r.error);
            }
        } catch (e) {
            console.warn('📸 Snapshot refresh threw:', e && e.message);
        } finally {
            _inFlight = false;
        }
    }

    function _start() {
        // First check shortly after load to capture any pre-loaded
        // training spins, then poll.
        setTimeout(_maybeRefresh, 1500);
        setInterval(_maybeRefresh, 500);
        console.log('📸 Snapshot bridge: armed (polling window.spins every 500ms)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }
})();
