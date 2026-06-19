/**
 * signals/index.js — registry + single entry point.
 *
 * The aggregator imports evaluateAll() from here, not each signal
 * individually. Adding/removing a signal = edit SIGNALS below; no
 * other code changes.
 *
 * User-locked rule set (2026-06-19):
 *   1 — sign-streak           (POS / NEG spin-history streak)
 *   2 — table-streak          (ZERO / NINETEEN spin-history streak)
 *   3 — set-carry             (SET_0 / SET_5 / SET_6 carry)
 *   4 — sub-anchor-pattern    (T1 + T2 sub-anchor cluster)
 *   6 — cross-cell-rotation   (T1 + T2 alternation)
 *   7 — cross-table-conv      (T3 golden-pair)
 *
 * Removed: Rule 5 (side-only-streak), Rule 8 (decay), Rule 9
 *          (T3 cooldown), Rule 10 (wait-cap), Rule 11 (loss-streak floor).
 */

(function () {
'use strict';

let signStreak, tableStreak, setCarry,
    subAnchorPattern, crossCellRotate, crossTableConv;

if (typeof require === 'function') {
    signStreak       = require('./sign-streak.js');
    tableStreak      = require('./table-streak.js');
    setCarry         = require('./set-carry.js');
    subAnchorPattern = require('./sub-anchor-pattern.js');
    crossCellRotate  = require('./cross-cell-rotation.js');
    crossTableConv   = require('./cross-table-conv.js');
} else if (typeof window !== 'undefined' && window.StrategyAnalyserSignals) {
    const S = window.StrategyAnalyserSignals;
    signStreak       = S.signStreak;
    tableStreak      = S.tableStreak;
    setCarry         = S.setCarry;
    subAnchorPattern = S.subAnchorPattern;
    crossCellRotate  = S.crossCellRotation;
    crossTableConv   = S.crossTableConv;
}

// Each entry: { id, signal }. The id lets the aggregator look up the
// per-rule weight + per-rule enable flag from session opts.
const RULES = [
    { id: 'signStreak',       signal: signStreak },
    { id: 'tableStreak',      signal: tableStreak },
    { id: 'setCarry',         signal: setCarry },
    { id: 'subAnchorPattern', signal: subAnchorPattern },
    { id: 'crossCellRotate',  signal: crossCellRotate },
    { id: 'crossTableConv',   signal: crossTableConv }
].filter(r => r.signal);

/**
 * Evaluate every enabled signal against the snapshot.
 *
 * opts.disabledRules — optional Set/Array of rule ids to skip.
 *   When the Test(Lab) weightage UI unchecks a rule, the orchestrator
 *   passes its id in here.
 *
 * Each signal entry's weight is the signal's internal share already
 * multiplied by its locked global weight. The aggregator uses it as-is.
 */
function evaluateAll(snap, sessionState, opts) {
    const out = [];
    const disabled = (opts && opts.disabledRules)
        ? (opts.disabledRules instanceof Set
            ? opts.disabledRules
            : new Set(opts.disabledRules))
        : null;
    for (const rule of RULES) {
        if (disabled && disabled.has(rule.id)) continue;
        try {
            const entries = rule.signal.evaluate(snap, sessionState, opts || {});
            if (Array.isArray(entries)) {
                for (const e of entries) {
                    if (e && e.fired) {
                        e._ruleId = rule.id;        // back-reference for the popup
                        out.push(e);
                    }
                }
            }
        } catch (e) {
            if (typeof console !== 'undefined') {
                console.warn('Signal ' + (rule.signal.NAME || rule.id) + ' threw:', e && e.message);
            }
        }
    }
    return out;
}

const _api = { evaluateAll, RULES };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignalsIndex = _api;
}

})();
