/**
 * signals/table-streak.js — Rule #2 (zero table / nineteen table).
 *
 * Mirror of sign-streak but on the 0-table / 19-table partition.
 * Same shape, same decay curve, same anti-streak emission.
 */

'use strict';

const { ZERO_TABLE, NINETEEN_TABLE, tableOf, streakDecay } = require('../partitions.js');

const NAME      = 'table-streak';
const BASE_WGT  = 0.30;
const LOOK_BACK = 6;

function evaluate(snap, sessionState, opts) {
    const out = [];
    const spins = (snap && snap.meta && snap.meta.spins) || [];
    if (spins.length < 2) return out;

    const tailTable = tableOf(spins[spins.length - 1]);
    if (!tailTable) return out;

    let length = 1;
    for (let i = spins.length - 2; i >= 0 && length < LOOK_BACK; i--) {
        if (tableOf(spins[i]) === tailTable) length++;
        else break;
    }
    if (length < 2) return out;

    const sameSet = (tailTable === 'ZERO') ? ZERO_TABLE : NINETEEN_TABLE;
    const oppSet  = (tailTable === 'ZERO') ? NINETEEN_TABLE : ZERO_TABLE;
    const decay   = streakDecay(length);
    const sameWgt = BASE_WGT * decay;
    const antiWgt = BASE_WGT * (1 - decay);

    if (sameWgt > 0) {
        out.push({
            name:        NAME + '-same',
            fired:       true,
            candidates:  new Set(sameSet),
            weight:      sameWgt,
            reason:      `Last ${length} actuals all from ${tailTable} table — `
                       + `vote same (decay ${decay.toFixed(2)}).`,
            details:     { table: tailTable, length, decay }
        });
    }
    if (antiWgt > 0) {
        out.push({
            name:        NAME + '-anti',
            fired:       true,
            candidates:  new Set(oppSet),
            weight:      antiWgt,
            reason:      `Streak length ${length} on ${tailTable} table — `
                       + `vote OPPOSITE table (weight ${antiWgt.toFixed(2)}).`,
            details:     { table: tailTable, length, decay, antiWgt }
        });
    }
    return out;
}

module.exports = { evaluate, NAME, BASE_WGT };
