/**
 * ████████████████████████████████████████████████████████████████████
 *  🔒 LOCKED FILE — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL 🔒
 * ████████████████████████████████████████████████████████████████████
 *
 *  This is the renderer → main-process spin/family detection pipe.
 *  Verified by the user on 2026-06-16. Changing the polling cadence,
 *  fingerprint logic, or the data it forwards (spins + visibleFamilies)
 *  silently breaks live snapshot refresh. Locked.
 *
 *  Companion locked files: [[locked-projections-file]],
 *  [[locked-snapshot-pipeline]], [[locked-snapshot-html-writer]].
 *
 * ████████████████████████████████████████████████████████████████████
 *
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

    // Fingerprint of the last spin list we sent to the snapshot writer.
    // Comparing the fingerprint (not just length) catches:
    //   • new spins added                     (length grows)
    //   • RESET                               (length drops to 0)
    //   • UNDO                                (length drops by ≥1)
    //   • a single spin EDITED in place       (length same, value changed)
    //   • bulk historical-data load           (length jumps)
    //   • training corpus pre-load on launch  (initial non-zero state)
    let _lastFingerprint = '__unset__';
    let _inFlight  = false;
    let _failures  = 0;   // for backoff if main process throws repeatedly

    function _snapshotSpins() {
        // window.spins is the array of { actual, direction, ... } entries
        // the renderer maintains. We only need the actual numbers.
        if (!Array.isArray(window.spins)) return null;
        return window.spins
            .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
            .filter(n => n !== null);
    }

    function _visibleFamiliesPerTable() {
        // 2026-06-21: per-table pair filters (T1/T2/T3 buttons next to
        // the universal one). Return { T1, T2, T3 } sorted arrays so
        // the snapshot writer + analyser can scope per-table.
        try {
            if (typeof window.getVisiblePairFamiliesForTable === 'function') {
                return {
                    T1: Array.from(window.getVisiblePairFamiliesForTable('T1')).sort(),
                    T2: Array.from(window.getVisiblePairFamiliesForTable('T2')).sort(),
                    T3: Array.from(window.getVisiblePairFamiliesForTable('T3')).sort()
                };
            }
        } catch (_) {}
        return null;
    }
    function _visibleFamilies() {
        // The renderer exposes its "Pairs (N/12)" dropdown state via
        // window.getVisiblePairFamilies(). Return as a sorted array so
        // the snapshot writer can filter what it renders.
        try {
            if (typeof window.getVisiblePairFamilies === 'function') {
                return Array.from(window.getVisiblePairFamilies()).sort();
            }
        } catch (_) {}
        return null;     // null = "no filter — show all" (default)
    }

    function _selections() {
        // Read what the user has selected in the AI prediction panel.
        // Shape:
        //   table1Selections / table2Selections — plain objects, keys
        //     are pairKey, values truthy when selected (Object.keys
        //     filtered by truthiness gives the selected pair keys).
        //   table3Selections — a Set of pairKey strings.
        // Return as plain sorted arrays so the snapshot writer can
        // render them deterministically.
        const out = { table1: [], table2: [], table3: [] };
        try {
            const p = window.aiPanel;
            if (!p) return out;
            const t1 = p.table1Selections || {};
            const t2 = p.table2Selections || {};
            const t3 = p.table3Selections;
            out.table1 = Object.keys(t1).filter(k => !!t1[k]).sort();
            out.table2 = Object.keys(t2).filter(k => !!t2[k]).sort();
            out.table3 = (t3 && typeof t3.forEach === 'function')
                ? Array.from(t3).sort()
                : (Array.isArray(t3) ? t3.slice().sort() : []);
        } catch (_) {}
        return out;
    }

    function _filters() {
        // Read the wheel filter panel state. Plain pass-through.
        try {
            const w = window.rouletteWheel;
            if (w && w.filters && typeof w.filters === 'object') {
                return Object.assign({}, w.filters);
            }
        } catch (_) {}
        return null;
    }

    function _fingerprint(arr, fams, sels, filt) {
        // Cheap O(n) fingerprint covering everything the writer cares
        // about. Any change in spins, families filter, AI-panel
        // selections, or wheel filters fires a refresh.
        const selStr = sels
            ? 't1:' + sels.table1.join(',') + ';t2:' + sels.table2.join(',') + ';t3:' + sels.table3.join(',')
            : '';
        const fStr = filt ? JSON.stringify(filt) : '';
        return arr.length + ':' + arr.join(',')
            + '|F:' + (fams ? fams.join(',') : '*')
            + '|S:' + selStr
            + '|W:' + fStr;
    }

    async function _maybeRefresh() {
        if (_inFlight) return;
        if (!window.aiAPI || typeof window.aiAPI.refreshSnapshot !== 'function') return;

        const spins = _snapshotSpins();
        if (!spins) return;
        const families        = _visibleFamilies();
        const familiesByTable = _visibleFamiliesPerTable();
        const selections      = _selections();
        const filters         = _filters();

        // Per-table sets folded into the fingerprint so toggling any of
        // the new T1/T2/T3 dropdowns re-fires the snapshot write.
        const fpExtras = familiesByTable
            ? '|PT:' + ['T1','T2','T3'].map(t => t + ':' + (familiesByTable[t] || []).join(',')).join(';')
            : '';
        const fp = _fingerprint(spins, families, selections, filters) + fpExtras;
        if (fp === _lastFingerprint) return;     // no change since last write
        _lastFingerprint = fp;

        _inFlight = true;
        try {
            const r = await window.aiAPI.refreshSnapshot(spins, {
                visibleFamilies: families,
                visibleFamiliesPerTable: familiesByTable,
                selections,
                filters
            });
            if (r && r.ok) {
                _failures = 0;
                console.log(`📸 Snapshot refreshed (${r.spinCount} spins → spin-${r.idx})`);
            } else if (r && !r.ok) {
                _failures++;
                console.warn('📸 Snapshot refresh returned error:', r.error);
                // On failure clear the fingerprint so we retry next tick
                // instead of getting stuck waiting for the next change.
                _lastFingerprint = '__retry__';
            }
        } catch (e) {
            _failures++;
            console.warn('📸 Snapshot refresh threw:', e && e.message);
            _lastFingerprint = '__retry__';
        } finally {
            _inFlight = false;
        }
    }

    function _start() {
        // First check immediately to capture any pre-loaded training
        // spins from the engine's startup sequence, then poll every
        // 250ms so the browser tab feels real-time.
        setTimeout(_maybeRefresh, 250);
        setInterval(_maybeRefresh, 250);
        console.log('📸 Snapshot bridge: armed (polling window.spins every 250ms)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }
})();
