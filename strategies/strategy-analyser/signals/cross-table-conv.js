/**
 * signals/cross-table-conv.js — Rule #7 (T1 ∧ T2 ∧ T3 confluence).
 *
 * User-spec rewrite 2026-06-19 (second correctness fix):
 *
 *   Confluence is a SUSTAINED multi-spin pattern across all 3
 *   tables — not a single-spin alignment. It fires per pair-family
 *   per side when ALL of:
 *
 *     T1: last LOOK_BACK consecutive spins, on this side, all hit,
 *         and hits cluster on exactly 2 of {first, second, third}
 *         sub-anchors  (i.e. same shape as sub-anchor-pattern).
 *
 *     T2: same condition as T1.
 *
 *     T3: "golden hits" — at least MIN_GOLDEN of the last LOOK_BACK
 *         T3 rows had hitAnchor=true on this family. (Anchor cells
 *         are the purple/green specials — the highest-conviction
 *         T3 picks.)
 *
 *   Side is checked independently:
 *     /same → uses T1.hits, T2.hits, T3 same-side anchor history
 *     /opp  → uses T1.oppHits, T2.oppHits, T3 opp-side history
 *
 *   Candidates: when /same fires → T3 sameSide bet pool;
 *               when /opp fires  → T3 oppSide bet pool;
 *               fallback → T3 numbers (full bet pool).
 *
 *   Weight unchanged (1.20).
 *
 *   PRIOR BUG: this signal used to fire on ANY single-spin hit on
 *   any side per table, claiming "T1 ∧ T2 ∧ T3 confluence" when in
 *   reality each table hit on a different side. Logged as the most
 *   damaging analyser correctness defect.
 */

// IIFE — see partitions.js header.
(function () {
'use strict';

const NAME       = 'cross-table-conv';
const BASE_WGT   = 1.20;
const LOOK_BACK  = 3;     // last N rows considered "recent"
const MIN_GOLDEN = 2;     // ≥ this many T3 anchor hits in LOOK_BACK

/**
 * Check the 2-of-3 sub-anchor cluster condition on T1 or T2 for one
 * side over the last LOOK_BACK consecutive rows.
 *
 * Returns { fired: bool, distinctHit: Array<'first'|'second'|'third'>,
 *           counts: {first, second, third}, streakRows }
 *
 *   • Streak breaks on any row that had no hit on this side at all.
 *   • "Cluster" = distinct hit positions over the streak ∈ {1, 2}.
 *     (3 means all three sub-anchors hit — not a cluster.)
 *   • LOOK_BACK consecutive hits are required (no misses inside).
 */
function _clusterCheck(tableData, famKey, side /* 'same' | 'opp' */) {
    const result = { fired: false, distinctHit: [], counts: { first:0, second:0, third:0 }, streakRows: 0 };
    const rows = tableData && tableData.rows;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK) return result;

    for (let i = rows.length - 1; i >= Math.max(0, rows.length - LOOK_BACK); i--) {
        const ent = rows[i].perPair && rows[i].perPair[famKey];
        if (!ent) break;
        const hits = (side === 'same') ? ent.hits : ent.oppHits;
        if (!hits) break;
        const anyHit = !!(hits.first || hits.second || hits.third);
        if (!anyHit) break;
        if (hits.first)  result.counts.first++;
        if (hits.second) result.counts.second++;
        if (hits.third)  result.counts.third++;
        result.streakRows++;
    }

    if (result.streakRows < LOOK_BACK) return result;
    const distinct = ['first','second','third'].filter(k => result.counts[k] > 0);
    if (distinct.length < 1 || distinct.length > 2) return result;
    result.distinctHit = distinct;
    result.fired = true;
    return result;
}

/**
 * Count T3 "golden" anchor hits for one family on one side over the
 * last LOOK_BACK rows. Golden = hitAnchor=true (actual fell on a
 * purple/green anchor cell). Side filter: same → hitSameSide must
 * also be true; opp → hitOppSide must also be true.
 *
 * Returns the count (0..LOOK_BACK).
 */
function _goldenCount(table3, famKey, side) {
    const rows = table3 && table3.rows;
    if (!Array.isArray(rows) || !rows.length) return 0;
    let count = 0;
    for (let i = rows.length - 1; i >= Math.max(0, rows.length - LOOK_BACK); i--) {
        const ent = rows[i].perPair && rows[i].perPair[famKey];
        if (!ent) continue;
        if (!ent.hitAnchor) continue;
        if (side === 'same' && !ent.hitSameSide) continue;
        if (side === 'opp'  && !ent.hitOppSide)  continue;
        count++;
    }
    return count;
}

function evaluate(snap, sessionState, opts) {
    if (!snap) return [];
    const out = [];
    const t3Proj = (snap.table3 && snap.table3.nextProjections) || {};
    const families = Object.keys(t3Proj);

    families.forEach(famKey => {
        const projEntry = t3Proj[famKey];

        ['same', 'opp'].forEach(side => {
            const t1 = _clusterCheck(snap.table1, famKey, side);
            if (!t1.fired) return;
            const t2 = _clusterCheck(snap.table2, famKey, side);
            if (!t2.fired) return;
            const golden = _goldenCount(snap.table3, famKey, side);
            if (golden < MIN_GOLDEN) return;

            // Candidate pool: prefer the side-specific T3 numbers;
            // fall back to the full bet pool if a side-split isn't
            // available on this nextProjections entry.
            const sidePool = (side === 'same') ? projEntry.sameSide : projEntry.oppSide;
            const cands = new Set((Array.isArray(sidePool) && sidePool.length)
                ? sidePool
                : (projEntry.numbers || []));
            if (cands.size === 0) return;

            const sideLabel = (side === 'same') ? 'SAME (P)' : 'OPP (P-13opp)';
            const t1Hits = t1.distinctHit.join('+');
            const t2Hits = t2.distinctHit.join('+');
            out.push({
                name:       NAME + '/' + famKey + '/' + side,
                fired:      true,
                candidates: cands,
                weight:     BASE_WGT,
                reason:     `${famKey} ${sideLabel} confluence: `
                          + `T1 ${LOOK_BACK}-row cluster on ${t1Hits}, `
                          + `T2 ${LOOK_BACK}-row cluster on ${t2Hits}, `
                          + `T3 ${golden}/${LOOK_BACK} golden anchor hits.`,
                details:    {
                    famKey, side,
                    refNum: projEntry.refNum, ref13Opp: projEntry.ref13Opp,
                    t1: { distinctHit: t1.distinctHit, counts: t1.counts, streakRows: t1.streakRows },
                    t2: { distinctHit: t2.distinctHit, counts: t2.counts, streakRows: t2.streakRows },
                    t3: { goldenHits: golden, lookBack: LOOK_BACK, minGolden: MIN_GOLDEN }
                }
            });
        });
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
