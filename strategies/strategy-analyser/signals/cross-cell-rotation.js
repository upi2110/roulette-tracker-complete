/**
 * signals/cross-cell-rotation.js — Rule #6 (the PP+1 alternation example).
 *
 * User text:
 *   "One hit from pp+1, 13 opposite. After that, it hit pp+1. then
 *    pp+1-13opp. After that, it hit pp-1. Again, it hits pp+1, 13
 *    opposite. The next possibility is pp+1."
 *
 * Per pair-family on T1 / T2, walk the last N rows and label each row
 * as "pair half hit" (any hits on first/second/third) or "13opp half
 * hit" (any oppHits) or "neither / both / break". If the most recent
 * pattern is a clean alternation (e.g. P → 13o → P → 13o), predict
 * the NEXT cell to be the opposite of the last hit.
 */

'use strict';

const NAME      = 'cross-cell-rotation';
const BASE_WGT  = 0.70;
const LOOK_BACK = 4;     // need 4 rows to spot a clear alternation

function _hitHalf(perPairEntry) {
    if (!perPairEntry) return null;
    const h  = perPairEntry.hits    || {};
    const oh = perPairEntry.oppHits || {};
    const pairHit = !!(h.first || h.second || h.third);
    const oppHit  = !!(oh.first || oh.second || oh.third);
    if (pairHit && !oppHit) return 'P';
    if (oppHit && !pairHit) return '13O';
    if (pairHit && oppHit)  return 'BOTH';
    return 'NONE';
}

function _evalTable(tableData, tableLabel) {
    const out = [];
    const rows = tableData && tableData.rows;
    const proj = tableData && tableData.nextProjections;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK || !proj) return out;

    const lastRow = rows[rows.length - 1];
    const families = lastRow && lastRow.perPair ? Object.keys(lastRow.perPair) : [];

    families.forEach(famKey => {
        // Collect last LOOK_BACK row labels.
        const halves = [];
        for (let i = rows.length - LOOK_BACK; i < rows.length; i++) {
            if (i < 0) { halves.push('NONE'); continue; }
            const ent = rows[i].perPair && rows[i].perPair[famKey];
            halves.push(_hitHalf(ent));
        }
        // Need at least 3 clean half-hits to detect an alternation.
        const clean = halves.filter(s => s === 'P' || s === '13O');
        if (clean.length < 3) return;

        // Check alternation across the clean tail.
        let alternating = true;
        for (let i = 1; i < clean.length; i++) {
            if (clean[i] === clean[i - 1]) { alternating = false; break; }
        }
        if (!alternating) return;

        // Predict the opposite of the last clean hit.
        const lastClean = clean[clean.length - 1];
        const predict   = (lastClean === 'P') ? '13O' : 'P';
        const predictPairKey = (predict === 'P') ? famKey : (famKey + '_13opp');
        const projEntry = proj[predictPairKey];
        if (!projEntry) return;

        const candidates = new Set();
        ['first','second','third'].forEach(pos => {
            ((projEntry[pos] && projEntry[pos].numbers) || []).forEach(n => candidates.add(n));
        });
        if (candidates.size === 0) return;

        out.push({
            name:       NAME + '/' + tableLabel + '/' + famKey,
            fired:      true,
            candidates,
            weight:     BASE_WGT,
            reason:     `${tableLabel} ${famKey}: alternation [${clean.join('→')}] — `
                      + `predict next = ${predict}.`,
            details:    { table: tableLabel, famKey, halves: clean, predict, predictPairKey }
        });
    });
    return out;
}

function evaluate(snap, sessionState, opts) {
    if (!snap) return [];
    return [].concat(
        _evalTable(snap.table1, 'T1'),
        _evalTable(snap.table2, 'T2')
    );
}

module.exports = { evaluate, NAME, BASE_WGT };
