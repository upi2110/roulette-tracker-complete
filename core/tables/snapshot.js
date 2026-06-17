/**
 * ████████████████████████████████████████████████████████████████████
 *  🔒 LOCKED FILE — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL 🔒
 * ████████████████████████████████████████████████████████████████████
 *
 *  This file defines the snapshot DATA SHAPE the analyser will read.
 *  Changing the shape (renaming fields, dropping fields, restructuring
 *  meta/table1/table2/table3) breaks the analyser silently. Locked.
 *
 *  Companion locked files: [[locked-projections-file]],
 *  [[locked-snapshot-html-writer]].
 *
 * ████████████████████████████████████████████████████████████████████
 *
 * core/tables/snapshot.js — produce a JSON snapshot of T1/T2/T3
 * matching exactly what the Electron renderer paints.
 *
 * Reads from the LOCKED projections module. Does not duplicate math.
 *
 * Shape:
 *   {
 *     meta:   { spinCount, spins, lastSpin, prevSpin, timestamp },
 *     table1: { nextProjections, rows },
 *     table2: { nextProjections, rows },
 *     table3: { nextProjections, rows }
 *   }
 *
 * Pure function — pass spins in, get JSON out. Runs in Node or browser.
 */

(function (root) {
    'use strict';

    // Resolve projections module — Node or browser.
    const P = (typeof require === 'function')
        ? require('./projections.js')
        : (typeof window !== 'undefined' ? window.CoreTables : null);

    if (!P) {
        const msg = 'core/tables/snapshot.js: cannot find CoreTables — load projections.js first.';
        if (typeof console !== 'undefined') console.error(msg);
        throw new Error(msg);
    }

    /**
     * Build a complete snapshot of all three tables.
     *
     * @param {Array<number>} spinsArr - oldest-to-newest list of spin
     *   actuals (e.g. [32, 15, 4, 21, 2, 25, 17])
     * @param {Object} [opts]
     * @param {string} [opts.timestamp] - ISO 8601 string; default = ''.
     *   Caller provides it so tests stay deterministic (the lock-down
     *   workflow forbids Date.now() inside snapshot code).
     * @returns {Object} snapshot
     */
    function snapshot(spinsArr, opts) {
        const o = opts || {};
        const spins = Array.isArray(spinsArr) ? spinsArr.slice() : [];
        const spinCount = spins.length;
        const lastSpin = spinCount >= 1 ? spins[spinCount - 1] : null;
        const prevSpin = spinCount >= 2 ? spins[spinCount - 2] : null;
        // visibleFamilies: null = show all (default). Array = restrict
        // the HTML writer to just these family names (matches Electron's
        // "Pairs (N/12)" dropdown). Forwarded into meta untouched so the
        // writer (and any other consumer) can filter consistently.
        const visibleFamilies = (Array.isArray(o.visibleFamilies))
            ? o.visibleFamilies.slice()
            : null;

        return {
            meta: {
                spinCount,
                spins,
                lastSpin,
                prevSpin,
                timestamp: o.timestamp || '',
                visibleFamilies
            },
            table1: {
                nextProjections: P.getTable1NextProjections(spins),
                rows:            P.computeTableRows(spins, 'T1')
            },
            table2: {
                nextProjections: P.getTable2NextProjections(spins),
                rows:            P.computeTableRows(spins, 'T2')
            },
            table3: {
                nextProjections: P.getTable3NextProjections(spins),
                rows:            P.computeTable3Rows(spins)
            }
        };
    }

    // ── Public API ────────────────────────────────────────────────
    const api = { snapshot };
    if (typeof window !== 'undefined') {
        window.CoreTablesSnapshot = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
