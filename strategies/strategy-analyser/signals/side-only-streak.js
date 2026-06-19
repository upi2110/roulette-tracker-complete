/**
 * signals/side-only-streak.js — Rule #5 ("all came in my opposite").
 *
 * For each pair-family on T1 and T2 (both halves), look at the last N
 * hits' position codes. If every code starts with the SAME side letter
 * (S or O), this is a side-only streak.
 *
 *   • S-only streak → vote sameSide pool for that pair
 *   • O-only streak → vote oppSide pool for that pair
 *
 * The MISSING side (third anchor on the opposite) gets a smaller
 * vote — matches the user's "we also can't ignore the third anchor"
 * line in the strategy text.
 *
 * Same pair-streak decay as sub-anchor-pattern (rule #8).
 */

'use strict';

const NAME      = 'side-only-streak';
const BASE_WGT  = 0.60;
const LOOK_BACK = 3;

function _decay(length) {
    if (length <= 2) return 0;
    if (length <= 4) return 1.0;
    if (length === 5) return 0.4;
    return 0;
}

function _sideOfCode(code) {
    if (!code || code === 'XX') return null;
    return code.charAt(0) === 'S' ? 'S' : (code.charAt(0) === 'O' ? 'O' : null);
}

function _evalTable(tableData, tableLabel) {
    const out = [];
    const rows = tableData && tableData.rows;
    const proj = tableData && tableData.nextProjections;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK || !proj) return out;

    const lastRow = rows[rows.length - 1];
    const families = lastRow && lastRow.perPair ? Object.keys(lastRow.perPair) : [];

    families.forEach(famKey => {
        ['pair', '13opp'].forEach(half => {
            const pairKey = (half === '13opp') ? (famKey + '_13opp') : famKey;
            const projEntry = proj[pairKey];
            if (!projEntry) return;

            // Walk back, collect side-of-codes from anchor cells that
            // actually saw a hit. Bail at the first non-side row.
            let topSide = null;
            let streakRows = 0;
            for (let i = rows.length - 1; i >= Math.max(0, rows.length - LOOK_BACK); i--) {
                const ent = rows[i].perPair && rows[i].perPair[famKey];
                if (!ent) break;
                const codes = (half === '13opp') ? ent.oppCodes : ent.codes;
                if (!codes) break;
                // Collect sides for any cell with a valid code.
                const sides = ['first','second','third']
                    .map(p => _sideOfCode(codes[p]))
                    .filter(s => s !== null);
                if (sides.length === 0) break;     // missed row
                // All same side in this row?
                if (sides.some(s => s !== sides[0])) break;
                if (topSide === null) topSide = sides[0];
                else if (topSide !== sides[0]) break;
                streakRows++;
            }
            if (streakRows < 2 || !topSide) return;

            const decay = _decay(streakRows);
            if (decay <= 0) return;
            const wgt = BASE_WGT * decay;

            // Union sameSide / oppSide across first/second/third for the pair.
            const sideSet = new Set();
            const oppSet  = new Set();
            ['first','second','third'].forEach(pos => {
                const cell = projEntry[pos] || {};
                (cell.sameSide || []).forEach(n => sideSet.add(n));
                (cell.oppSide  || []).forEach(n => oppSet .add(n));
            });

            const votedSide = (topSide === 'S') ? sideSet : oppSet;
            const otherSide = (topSide === 'S') ? oppSet  : sideSet;

            out.push({
                name:       NAME + '/' + tableLabel + '/' + pairKey + '/continuation',
                fired:      true,
                candidates: votedSide,
                weight:     wgt,
                reason:     `${tableLabel} ${pairKey}: last ${streakRows} hits all ${topSide}-side — `
                          + `vote ${topSide}-side (decay ${decay.toFixed(2)}).`,
                details:    { table: tableLabel, pairKey, side: topSide, streakRows, decay }
            });
            // Missing-side hedge — the third anchor on the opposite that
            // hasn't fired yet. Half-weight per the strategy text.
            if (otherSide.size > 0) {
                out.push({
                    name:       NAME + '/' + tableLabel + '/' + pairKey + '/missing-side',
                    fired:      true,
                    candidates: otherSide,
                    weight:     wgt * 0.5,
                    reason:     `${tableLabel} ${pairKey}: opposite side `
                              + `(${topSide === 'S' ? 'O' : 'S'}) has NOT hit yet — hedge.`,
                    details:    { table: tableLabel, pairKey, otherSide: topSide === 'S' ? 'O' : 'S' }
                });
            }
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

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.sideOnlyStreak = _api;
}
