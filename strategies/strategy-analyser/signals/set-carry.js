/**
 * signals/set-carry.js — Rule 3: Spin-history set carry-forward.
 *
 * User-locked spec (2026-06-19):
 *   • Three sets from partitions.js: SET_0 (13 nums), SET_5 (12),
 *     SET_6 (12). Every wheel number is in exactly one.
 *   • Walk back from the latest spin to find the most recent ANCHOR
 *     spin — defined as a spin in SET_5 or SET_6. Any SET_0 spins
 *     encountered along the way are SKIPPED, not used as anchor.
 *   • When an anchor is found:
 *       anchor=SET_5 → vote SET_5 numbers (~2/3 weight) + SET_0 (~1/3).
 *       anchor=SET_6 → vote SET_6 numbers (~2/3 weight) + SET_0 (~1/3).
 *   • NEVER vote the rival set (SET_5 fires → never vote SET_6, and
 *     vice versa).
 *   • If the active set has streaked 5+ in a row → skip (let other
 *     rules decide).
 *   • If no SET_5/SET_6 anywhere in history → skip.
 *
 * Vote weight per signal entry is the *fraction of the rule's global
 * weight* — the aggregator multiplies by global weight. 2/3 and 1/3
 * are the locked ratios.
 */

(function () {
'use strict';

const _P = (typeof require === 'function')
    ? require('../partitions.js')
    : (typeof window !== 'undefined' ? window.StrategyAnalyserPartitions : {});
const { SET_0, SET_5, SET_6, setOf } = _P;

const NAME       = 'set-carry';
const BASE_WGT   = 1.00;   // intra-rule total; split below
const ANCHOR_FRAC = 2 / 3; // share of the rule's weight for the anchor set
const NEUTRAL_FRAC = 1 / 3; // share for SET_0
const MAX_STREAK = 4;      // ≥ 5 same-set in a row → skip

const SETS = { SET_0, SET_5, SET_6 };

function evaluate(snap, sessionState, opts) {
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < 1) return [];

    // Find most-recent SET_5 / SET_6 anchor, skipping SET_0 spins.
    let anchorIdx = -1;
    for (let i = spins.length - 1; i >= 0; i--) {
        const s = setOf(spins[i]);
        if (s === 'SET_5' || s === 'SET_6') { anchorIdx = i; break; }
    }
    if (anchorIdx < 0) return [];

    const anchorSet = setOf(spins[anchorIdx]);

    // Streak check: how many consecutive spins back from the latest are
    // in the same set as the latest? If that streak ≥ 5, skip.
    const tail = setOf(spins[spins.length - 1]);
    if (tail) {
        let length = 1;
        for (let i = spins.length - 2; i >= 0; i--) {
            if (setOf(spins[i]) === tail) length++;
            else break;
            if (length > MAX_STREAK) return [];
        }
    }

    return [{
        name:        NAME + '-anchor',
        fired:       true,
        candidates:  new Set(SETS[anchorSet]),
        weight:      BASE_WGT * ANCHOR_FRAC,
        reason:      `Most recent SET_5/SET_6 anchor was ${anchorSet} `
                   + `(${spins.length - anchorIdx - 1} spins ago) — `
                   + `vote ${anchorSet} (${ANCHOR_FRAC.toFixed(2)} of rule weight).`,
        details:     { anchor: anchorSet, anchorIdx, baseWeight: BASE_WGT, share: ANCHOR_FRAC }
    }, {
        name:        NAME + '-neutral',
        fired:       true,
        candidates:  new Set(SETS.SET_0),
        weight:      BASE_WGT * NEUTRAL_FRAC,
        reason:      `Carry SET_0 alongside anchor (${NEUTRAL_FRAC.toFixed(2)} of rule weight).`,
        details:     { anchor: anchorSet, baseWeight: BASE_WGT, share: NEUTRAL_FRAC }
    }];
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.setCarry = _api;
}

})();
