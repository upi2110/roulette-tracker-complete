/**
 * signals/sign-streak.js — Rule 1: Spin-history sign streak (POS / NEG).
 *
 * User-locked spec (2026-06-19):
 *   • Categories from partitions.js: POSITIVE (19 nums incl. 0, 26) /
 *     NEGATIVE (18 nums). Every spin is one or the other.
 *   • Walk back from the latest spin; count consecutive spins in the
 *     same camp → streak length N.
 *   • If N ∈ {2, 3, 4} → vote that same camp's number pool.
 *   • If N ≥ 5 → DO NOT FIRE (let other rules decide).
 *   • If N = 1 → DO NOT FIRE.
 *   • NEVER vote the opposite camp.
 *   • Vote split is uniform across the camp's numbers (single-pool vote).
 */

(function () {
'use strict';

const _P = (typeof require === 'function')
    ? require('../partitions.js')
    : (typeof window !== 'undefined' ? window.StrategyAnalyserPartitions : {});
const { POSITIVE_NUMS, NEGATIVE_NUMS, signOf } = _P;

const NAME      = 'sign-streak';
const BASE_WGT  = 0.80;   // user-locked global weight (was 0.30)
const MIN_FIRE  = 2;      // streak must reach this length
const MAX_FIRE  = 4;      // above this → skip entirely

function evaluate(snap, sessionState, opts) {
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < MIN_FIRE) return [];

    const tailSign = signOf(spins[spins.length - 1]);
    if (!tailSign) return [];   // defensive — partitions cover 0..36 so this shouldn't happen

    let length = 1;
    for (let i = spins.length - 2; i >= 0; i--) {
        if (signOf(spins[i]) === tailSign) length++;
        else break;
        if (length > MAX_FIRE) return [];   // ≥ 5 → skip
    }
    if (length < MIN_FIRE) return [];       // 1 → skip
    if (length > MAX_FIRE) return [];       // ≥ 5 → skip

    const camp = (tailSign === 'POS') ? POSITIVE_NUMS : NEGATIVE_NUMS;
    return [{
        name:        NAME + '-same',
        fired:       true,
        candidates:  new Set(camp),
        weight:      BASE_WGT,
        reason:      `Last ${length} spins all ${tailSign} — vote ${tailSign} camp `
                   + `(${camp.size} numbers).`,
        details:     { sign: tailSign, length, baseWeight: BASE_WGT }
    }];
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.signStreak = _api;
}

})();
