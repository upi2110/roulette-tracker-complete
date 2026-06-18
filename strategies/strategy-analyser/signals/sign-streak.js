/**
 * signals/sign-streak.js — Rule #1 (positive / negative).
 *
 * Reads snap.meta.spins. Looks at the most recent K spins. If the
 * last N (N >= 2) actuals all live in the same sign-partition, emits
 *   • sign-streak-same  — votes for the same partition  weight: base × decay(N)
 *   • sign-streak-anti  — votes for the OPPOSITE partition
 *                         weight: base × (1 - decay(N))
 *
 * As N grows the SAME-side weight decays and the ANTI weight grows —
 * matching the user's rule that long streaks become un-credible and
 * the opposite becomes likely.
 */

'use strict';

const { POSITIVE_NUMS, NEGATIVE_NUMS, signOf, streakDecay } = require('../partitions.js');

const NAME      = 'sign-streak';
const BASE_WGT  = 0.30;
const LOOK_BACK = 6;       // examine the last 6 spins max

function evaluate(snap, sessionState, opts) {
    const out = [];
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < 2) return out;

    // Compute current streak length (in same sign) ending at last spin.
    const tailSign = signOf(spins[spins.length - 1]);
    if (!tailSign) return out;   // last actual is 0 / 26 (no sign) — no streak

    let length = 1;
    for (let i = spins.length - 2; i >= 0 && length < LOOK_BACK; i--) {
        if (signOf(spins[i]) === tailSign) length++;
        else break;
    }

    if (length < 2) return out;  // need at least 2 in a row to call it a streak

    const sameSet = (tailSign === 'POS') ? POSITIVE_NUMS : NEGATIVE_NUMS;
    const oppSet  = (tailSign === 'POS') ? NEGATIVE_NUMS : POSITIVE_NUMS;
    const decay   = streakDecay(length);

    const sameWgt = BASE_WGT * decay;
    const antiWgt = BASE_WGT * (1 - decay);

    if (sameWgt > 0) {
        out.push({
            name:        NAME + '-same',
            fired:       true,
            candidates:  new Set(sameSet),
            weight:      sameWgt,
            reason:      `Last ${length} actuals are all ${tailSign} — `
                       + `vote ${tailSign} (decay ${decay.toFixed(2)}).`,
            details:     { sign: tailSign, length, decay, base: BASE_WGT }
        });
    }
    if (antiWgt > 0) {
        out.push({
            name:        NAME + '-anti',
            fired:       true,
            candidates:  new Set(oppSet),
            weight:      antiWgt,
            reason:      `Streak length ${length} — credibility decayed; `
                       + `vote OPPOSITE (${tailSign === 'POS' ? 'NEG' : 'POS'}) `
                       + `with weight ${antiWgt.toFixed(2)}.`,
            details:     { sign: tailSign, length, decay, antiWgt }
        });
    }
    return out;
}

module.exports = { evaluate, NAME, BASE_WGT };
