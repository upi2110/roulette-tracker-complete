/**
 * signals/cross-table-conv.js — Rule #7 (T1 ∧ T2 ∧ T3 confluence).
 *
 * STRICTER same-side semantics (correctness fix 2026-06-19):
 *
 *   Previously this signal fired when ANY hit existed on any side
 *   on each table — meaning T1 could hit on the P-side while T2 hit
 *   on the P-13opp side and the signal still claimed "confluence".
 *   That's not confluence; that's two different bets being conflated.
 *
 *   It now fires only when all three tables hit on the SAME side at
 *   the latest row. The signal is split into two variants:
 *
 *     cross-table-conv/{fam}/same   →  T1.hits ∧ T2.hits ∧ T3.same
 *     cross-table-conv/{fam}/opp    →  T1.oppHits ∧ T2.oppHits ∧ T3.opp
 *
 *   Candidates for /same   = T3 nextProjections[fam].sameSide
 *   Candidates for /opp    = T3 nextProjections[fam].oppSide
 *   (fallback to full bet pool if a side-split isn't present)
 *
 *   Weight unchanged (1.20) — this is still the strongest single
 *   signal; the fix is correctness, not weighting.
 */

// IIFE — see partitions.js header.
(function () {
'use strict';

const NAME     = 'cross-table-conv';
const BASE_WGT = 1.20;

function _sideHit(tableEnt, side /* 'same' | 'opp' */) {
    if (!tableEnt) return false;
    // T1 / T2 entry: hits/oppHits are { first, second, third } booleans.
    if (tableEnt.hits || tableEnt.oppHits) {
        const obj = (side === 'same')
            ? (tableEnt.hits    || {})
            : (tableEnt.oppHits || {});
        return !!(obj.first || obj.second || obj.third);
    }
    // T3 entry: hitSameSide / hitOppSide are direct booleans (per
    // core/tables/projections.js computeTable3RowsHistorical).
    if (side === 'same') return !!tableEnt.hitSameSide;
    if (side === 'opp')  return !!tableEnt.hitOppSide;
    return false;
}

function _lastEnt(tableData, famKey) {
    const rows = tableData && tableData.rows;
    if (!Array.isArray(rows) || !rows.length) return null;
    const lastRow = rows[rows.length - 1];
    return (lastRow && lastRow.perPair) ? (lastRow.perPair[famKey] || null) : null;
}

function evaluate(snap, sessionState, opts) {
    if (!snap) return [];
    const out = [];
    const t3Proj = (snap.table3 && snap.table3.nextProjections) || {};
    const families = Object.keys(t3Proj);

    families.forEach(famKey => {
        const t1Ent = _lastEnt(snap.table1, famKey);
        const t2Ent = _lastEnt(snap.table2, famKey);
        const t3Ent = _lastEnt(snap.table3, famKey);
        if (!t1Ent || !t2Ent || !t3Ent) return;

        const projEntry = t3Proj[famKey];

        // SAME-side confluence.
        if (_sideHit(t1Ent, 'same') && _sideHit(t2Ent, 'same') && _sideHit(t3Ent, 'same')) {
            const cands = new Set((projEntry.sameSide && projEntry.sameSide.length)
                ? projEntry.sameSide
                : (projEntry.numbers || []));
            if (cands.size > 0) {
                out.push({
                    name:       NAME + '/' + famKey + '/same',
                    fired:      true,
                    candidates: cands,
                    weight:     BASE_WGT,
                    reason:     `${famKey} hit on SAME side on T1 ∧ T2 ∧ T3 this spin `
                              + `— true cross-table confluence (strongest signal).`,
                    details:    { famKey, side: 'same', refNum: projEntry.refNum,
                                  ref13Opp: projEntry.ref13Opp, usePosCode: projEntry.usePosCode }
                });
            }
        }
        // OPP-side confluence.
        if (_sideHit(t1Ent, 'opp') && _sideHit(t2Ent, 'opp') && _sideHit(t3Ent, 'opp')) {
            const cands = new Set((projEntry.oppSide && projEntry.oppSide.length)
                ? projEntry.oppSide
                : (projEntry.numbers || []));
            if (cands.size > 0) {
                out.push({
                    name:       NAME + '/' + famKey + '/opp',
                    fired:      true,
                    candidates: cands,
                    weight:     BASE_WGT,
                    reason:     `${famKey} hit on OPP side (13opp) on T1 ∧ T2 ∧ T3 this spin `
                              + `— true cross-table confluence (strongest signal).`,
                    details:    { famKey, side: 'opp', refNum: projEntry.refNum,
                                  ref13Opp: projEntry.ref13Opp, usePosCode: projEntry.usePosCode }
                });
            }
        }
    });
    return out;
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.crossTableConv = _api;
}

})();
