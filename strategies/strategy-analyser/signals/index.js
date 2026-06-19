/**
 * signals/index.js — registry + single entry point.
 *
 * The aggregator (Phase 3) imports evaluateAll() from here, NOT each
 * signal individually. Adding a new signal = add it to SIGNALS below;
 * no other code changes.
 *
 * Each signal's evaluate() returns ARRAY of entries (possibly empty).
 * evaluateAll() concatenates them into one flat list.
 */

// IIFE — see partitions.js header.
(function () {
'use strict';

// Dual-mode: in Node, require each signal file. In browser, the
// signals attached themselves to window.StrategyAnalyserSignals when
// their script tags loaded — read from there.
let signStreak, tableStreak, setCarry, subAnchorPattern,
    sideOnlyStreak, crossCellRotate, crossTableConv;

if (typeof require === 'function') {
    signStreak       = require('./sign-streak.js');
    tableStreak      = require('./table-streak.js');
    setCarry         = require('./set-carry.js');
    subAnchorPattern = require('./sub-anchor-pattern.js');
    sideOnlyStreak   = require('./side-only-streak.js');
    crossCellRotate  = require('./cross-cell-rotation.js');
    crossTableConv   = require('./cross-table-conv.js');
} else if (typeof window !== 'undefined' && window.StrategyAnalyserSignals) {
    const S = window.StrategyAnalyserSignals;
    signStreak       = S.signStreak;
    tableStreak      = S.tableStreak;
    setCarry         = S.setCarry;
    subAnchorPattern = S.subAnchorPattern;
    sideOnlyStreak   = S.sideOnlyStreak;
    crossCellRotate  = S.crossCellRotation;
    crossTableConv   = S.crossTableConv;
}

const SIGNALS = [
    signStreak, tableStreak, setCarry,
    subAnchorPattern, sideOnlyStreak,
    crossCellRotate, crossTableConv
].filter(Boolean);

/**
 * Evaluate every registered signal against the snapshot.
 *
 * @param {Object} snap          output of CoreTablesSnapshot.snapshot(spins)
 * @param {Object} sessionState  per-caller state (pair streaks, T3 cooldowns)
 * @param {Object} opts          override params (Phase 4 wires settings UI)
 * @returns {Array} flat list of fired signal entries
 *                  [{ name, fired, candidates, weight, reason, details }, …]
 */
function evaluateAll(snap, sessionState, opts) {
    const out = [];
    for (const sig of SIGNALS) {
        try {
            const entries = sig.evaluate(snap, sessionState, opts || {});
            if (Array.isArray(entries)) {
                for (const e of entries) {
                    if (e && e.fired) out.push(e);
                }
            }
        } catch (e) {
            // A buggy signal must not crash the whole brain — log and skip.
            if (typeof console !== 'undefined') {
                console.warn('Signal ' + (sig.NAME || '?') + ' threw:', e && e.message);
            }
        }
    }
    return out;
}

const _api = { evaluateAll, SIGNALS };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignalsIndex = _api;
}

})();
