/**
 * signals/set-carry.js — Rule 3: Spin-history set carry-forward.
 *
 * User-locked spec (2026-06-19 — revised):
 *
 *   • Window: last 5 spins (or fewer if history shorter).
 *   • Three sets from partitions.js: SET_0 (13 nums), SET_5 (12),
 *     SET_6 (12). Every wheel number is in exactly one.
 *   • SET_0 is "invisible" — does not break or trigger the rule.
 *
 *   • If only SET_5 appears among non-SET_0 spins → anchor = SET_5, fire.
 *   • If only SET_6 appears among non-SET_0 spins → anchor = SET_6, fire.
 *   • If BOTH SET_5 and SET_6 appear in the window → SKIP (mixed).
 *   • If all 5 spins are SET_0 (no anchor) → SKIP.
 *   • If 5 same-anchor spins in a row with NO SET_0 in between
 *     (e.g. 5,5,5,5,5 or 6,6,6,6,6) → SKIP (too long).
 *
 *   • Vote when firing:
 *       - Anchor numbers carry ~2/3 of the rule's weight.
 *       - SET_0 numbers carry ~1/3 of the rule's weight.
 *       - Rival set never voted.
 *
 *   • Per-entry weights are intra-rule fractions (BASE 1.00 split
 *     by the 2/3 ↔ 1/3 ratio). The aggregator multiplies by the
 *     rule's effective global share.
 */

(function () {
'use strict';

const _P = (typeof require === 'function')
    ? require('../partitions.js')
    : (typeof window !== 'undefined' ? window.StrategyAnalyserPartitions : {});
const { SET_0, SET_5, SET_6, setOf } = _P;

const NAME         = 'set-carry';
const BASE_WGT     = 1.00;       // intra-rule total
const ANCHOR_FRAC  = 2 / 3;
const NEUTRAL_FRAC = 1 / 3;
const WINDOW       = 5;
const SETS         = { SET_0, SET_5, SET_6 };

function evaluate(snap, sessionState, opts) {
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < 1) return [];

    const recent = spins.slice(-WINDOW);
    let count5 = 0, count6 = 0, count0 = 0;
    for (const s of recent) {
        const which = setOf(s);
        if (which === 'SET_5') count5++;
        else if (which === 'SET_6') count6++;
        else if (which === 'SET_0') count0++;
    }

    // Mixed → skip.
    if (count5 > 0 && count6 > 0) return [];
    // No anchor present at all → skip.
    if (count5 === 0 && count6 === 0) return [];
    // 5 same-anchor in a row with NO SET_0 (full window of single anchor) → skip.
    if (recent.length === WINDOW && count0 === 0
        && (count5 === WINDOW || count6 === WINDOW)) {
        return [];
    }

    const anchor      = count5 > 0 ? 'SET_5' : 'SET_6';
    const anchorCount = count5 > 0 ? count5 : count6;

    return [{
        name:        NAME + '-anchor',
        fired:       true,
        candidates:  new Set(SETS[anchor]),
        weight:      BASE_WGT * ANCHOR_FRAC,
        reason:      `Last ${recent.length} spins (SET_0 invisible): `
                   + `${anchorCount}× ${anchor}, ${count0}× SET_0 — vote ${anchor} `
                   + `(${(ANCHOR_FRAC * 100).toFixed(0)}% of rule weight).`,
        details:     { anchor, anchorCount, count0, window: recent.length, share: ANCHOR_FRAC }
    }, {
        name:        NAME + '-neutral',
        fired:       true,
        candidates:  new Set(SETS.SET_0),
        weight:      BASE_WGT * NEUTRAL_FRAC,
        reason:      `Carry SET_0 alongside anchor (${(NEUTRAL_FRAC * 100).toFixed(0)}% of rule weight).`,
        details:     { anchor, share: NEUTRAL_FRAC }
    }];
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.setCarry = _api;
}

})();
