/**
 * signals/table-streak.js — Rule 2: Spin-history table streak.
 *
 * User-locked spec (2026-06-19) — same shape as Rule 1 but on the
 * ZERO-table / NINETEEN-table partition:
 *   • ZERO table = 19 nums; NINETEEN table = 18 nums (full wheel).
 *   • Streak length N from latest spin backwards in same table.
 *   • N ∈ {2, 3, 4} → vote that table only.
 *   • N ≥ 5 → skip entirely. N = 1 → skip.
 *   • Never vote the opposite table.
 */

(function () {
'use strict';

const _P = (typeof require === 'function')
    ? require('../partitions.js')
    : (typeof window !== 'undefined' ? window.StrategyAnalyserPartitions : {});
const { ZERO_TABLE, NINETEEN_TABLE, tableOf } = _P;

const NAME      = 'table-streak';
const BASE_WGT  = 0.80;   // user-locked global weight (was 0.30)
const MIN_FIRE  = 2;
const MAX_FIRE  = 4;

function evaluate(snap, sessionState, opts) {
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < MIN_FIRE) return [];

    const tail = tableOf(spins[spins.length - 1]);
    if (!tail) return [];

    let length = 1;
    for (let i = spins.length - 2; i >= 0; i--) {
        if (tableOf(spins[i]) === tail) length++;
        else break;
        if (length > MAX_FIRE) return [];
    }
    if (length < MIN_FIRE || length > MAX_FIRE) return [];

    const tbl = (tail === 'ZERO') ? ZERO_TABLE : NINETEEN_TABLE;
    return [{
        name:        NAME + '-same',
        fired:       true,
        candidates:  new Set(tbl),
        weight:      BASE_WGT,
        reason:      `Last ${length} spins all from ${tail} table — vote ${tail} `
                   + `(${tbl.size} numbers).`,
        details:     { table: tail, length, baseWeight: BASE_WGT }
    }];
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.tableStreak = _api;
}

})();
