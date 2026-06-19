/**
 * signals/sub-anchor-pattern.js — Rule #4 (the "P-1-13o" example).
 *
 * For each pair-family on T1 and T2, look at the last N rows. Count
 * which sub-anchors {first, second, third} were hit (or oppHits for
 * the 13-opp variant). If hits cluster on ≤ 2 of the 3 sub-anchors,
 * this is the user's "P-1-13o: last 3 actuals from first+second only"
 * pattern.
 *
 * When it fires, vote for:
 *   • the bet pool of the HIT sub-anchors  (continuation)
 *   • the bet pool of the MISSING sub-anchor (the "didn't yet" anchor)
 *
 * Weight = BASE × pair-streak-decay × (T1 ±1 / T2 ±2 don't change
 * the weight — both tables get the same base). Emits one signal entry
 * per (table, pair-family, half-side).
 */

'use strict';

const NAME      = 'sub-anchor-pattern';
const BASE_WGT  = 0.90;
const LOOK_BACK = 3;     // examine the last 3 historical rows

function _decay(length) {
    // Pair-streak position policy (rule #8):
    //   1-2 → wait     (weight 0; signal does not fire)
    //   3-4 → bet      (full weight)
    //   5   → wait unless corroborated  (weight × 0.4)
    //   6+  → exhausted (weight 0)
    if (length <= 2) return 0;
    if (length <= 4) return 1.0;
    if (length === 5) return 0.4;
    return 0;
}

function _evalTable(tableData, tableLabel, opts) {
    const out = [];
    const rows = tableData && tableData.rows;
    const proj = tableData && tableData.nextProjections;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK || !proj) return out;

    // Discover pair families present in the most recent row.
    const lastRow = rows[rows.length - 1];
    const families = lastRow && lastRow.perPair ? Object.keys(lastRow.perPair) : [];

    families.forEach(famKey => {
        // For BOTH halves (pair, 13-opp):
        ['pair', '13opp'].forEach(half => {
            const pairKey = (half === '13opp') ? (famKey + '_13opp') : famKey;
            const projEntry = proj[pairKey];
            if (!projEntry) return;

            // Count per-position hits in last N rows.
            const counts = { first: 0, second: 0, third: 0 };
            let streakRows = 0;
            for (let i = rows.length - 1; i >= Math.max(0, rows.length - LOOK_BACK); i--) {
                const ent = rows[i].perPair && rows[i].perPair[famKey];
                if (!ent) break;
                const hits = (half === '13opp') ? ent.oppHits : ent.hits;
                if (!hits) break;
                const anyHit = !!(hits.first || hits.second || hits.third);
                if (!anyHit) break;   // missed row → streak broken
                if (hits.first)  counts.first++;
                if (hits.second) counts.second++;
                if (hits.third)  counts.third++;
                streakRows++;
            }

            if (streakRows < 2) return;   // need at least 2 consecutive hits

            // How many distinct sub-anchors saw hits?
            const distinctHit = ['first','second','third'].filter(k => counts[k] > 0);
            if (distinctHit.length === 0 || distinctHit.length === 3) return;
            // cluster condition: hits on ≤ 2 of 3 sub-anchors

            const decay = _decay(streakRows);
            if (decay <= 0) return;
            const wgt = BASE_WGT * decay;

            // Continuation candidates — hit anchors' bet pools.
            const cont = new Set();
            distinctHit.forEach(pos => {
                ((projEntry[pos] && projEntry[pos].numbers) || []).forEach(n => cont.add(n));
            });
            // Missing-anchor candidates.
            const missing = ['first','second','third'].filter(k => counts[k] === 0);
            const miss = new Set();
            missing.forEach(pos => {
                ((projEntry[pos] && projEntry[pos].numbers) || []).forEach(n => miss.add(n));
            });

            out.push({
                name:        NAME + '/' + tableLabel + '/' + pairKey + '/continuation',
                fired:       true,
                candidates:  cont,
                weight:      wgt,
                reason:      `${tableLabel} ${pairKey}: last ${streakRows} hits on `
                           + distinctHit.join('+') + ' only — vote continuation '
                           + `(decay ${decay.toFixed(2)}).`,
                details:     { table: tableLabel, pairKey, hitPositions: distinctHit,
                               counts, streakRows, decay }
            });
            // The "missing anchor" theory — fires with HALF the weight
            // because it's the "what hasn't come yet" hedge.
            if (miss.size > 0) {
                out.push({
                    name:        NAME + '/' + tableLabel + '/' + pairKey + '/missing-anchor',
                    fired:       true,
                    candidates:  miss,
                    weight:      wgt * 0.5,
                    reason:      `${tableLabel} ${pairKey}: ${missing.join('+')} have NOT `
                               + 'hit — vote missing anchor.',
                    details:     { table: tableLabel, pairKey, missingPositions: missing,
                                   counts, streakRows }
                });
            }
        });
    });
    return out;
}

function evaluate(snap, sessionState, opts) {
    if (!snap) return [];
    return [].concat(
        _evalTable(snap.table1, 'T1', opts),
        _evalTable(snap.table2, 'T2', opts)
    );
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.subAnchorPattern = _api;
}
