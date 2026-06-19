/**
 * signals/set-carry.js — Rule #3 (SET_0 / SET_5 / SET_6 carry-forward).
 *
 * If the last actual lives in SET_5 → vote for SET_5 numbers.
 * If the last actual lives in SET_6 → vote for SET_6 numbers.
 * If the last actual lives in SET_0 → "neutral" — vote SET_0 with
 *                                     a damped base weight (×0.5).
 *
 * Same anti-streak decay as the other carry signals: if the last N
 * actuals all land in the same active set, the SAME vote decays and
 * the OPPOSITE-set vote grows. We split the opposite vote evenly
 * across the two non-active sets.
 */

// IIFE — see partitions.js header.
(function () {
'use strict';

const _P = (typeof require === 'function')
    ? require('../partitions.js')
    : (typeof window !== 'undefined' ? window.StrategyAnalyserPartitions : {});
const { SET_0, SET_5, SET_6, setOf, streakDecay } = _P;

const NAME      = 'set-carry';
const BASE_WGT  = 0.25;
const NEUTRAL_DAMPING = 0.5;  // SET_0 is "neutral" — half weight
const LOOK_BACK = 6;

const SETS = { SET_0, SET_5, SET_6 };

function evaluate(snap, sessionState, opts) {
    const out = [];
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < 1) return out;

    const tailSet = setOf(spins[spins.length - 1]);
    if (!tailSet) return out;

    // Streak length
    let length = 1;
    for (let i = spins.length - 2; i >= 0 && length < LOOK_BACK; i--) {
        if (setOf(spins[i]) === tailSet) length++;
        else break;
    }

    const decay   = streakDecay(length);
    const damping = (tailSet === 'SET_0') ? NEUTRAL_DAMPING : 1.0;
    const sameWgt = BASE_WGT * decay * damping;
    const antiWgt = BASE_WGT * (1 - decay) * damping;

    if (sameWgt > 0) {
        out.push({
            name:        NAME + '-same',
            fired:       true,
            candidates:  new Set(SETS[tailSet]),
            weight:      sameWgt,
            reason:      `Last actual in ${tailSet}`
                       + (length >= 2 ? ` (streak ${length})` : '')
                       + ` — vote same set (weight ${sameWgt.toFixed(2)}).`,
            details:     { set: tailSet, length, decay, damping }
        });
    }

    if (antiWgt > 0 && length >= 2) {
        // Split anti weight across the OTHER two sets.
        const others = ['SET_0', 'SET_5', 'SET_6'].filter(k => k !== tailSet);
        const halfWgt = antiWgt / others.length;
        others.forEach(k => {
            out.push({
                name:        NAME + '-anti-' + k,
                fired:       true,
                candidates:  new Set(SETS[k]),
                weight:      halfWgt,
                reason:      `Streak ${length} on ${tailSet} — `
                           + `cycle to ${k} (weight ${halfWgt.toFixed(2)}).`,
                details:     { set: k, srcStreak: length, fromSet: tailSet }
            });
        });
    }
    return out;
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.setCarry = _api;
}

})();
