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

'use strict';

const signStreak       = require('./sign-streak.js');
const tableStreak      = require('./table-streak.js');
const setCarry         = require('./set-carry.js');
const subAnchorPattern = require('./sub-anchor-pattern.js');
const sideOnlyStreak   = require('./side-only-streak.js');
const crossCellRotate  = require('./cross-cell-rotation.js');
const crossTableConv   = require('./cross-table-conv.js');

const SIGNALS = [
    signStreak,
    tableStreak,
    setCarry,
    subAnchorPattern,
    sideOnlyStreak,
    crossCellRotate,
    crossTableConv
];

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

module.exports = { evaluateAll, SIGNALS };
