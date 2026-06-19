/**
 * signals/sub-anchor-pattern.js — Rule 4: T1+T2 sub-anchor cluster.
 *
 * User-locked spec (2026-06-19):
 *
 * Pre-conditions per (table ∈ {T1, T2}, pair-family, side ∈ {P, 13-opp}):
 *   • STRICT: all 3 of the last 3 spins must have a hit on this side
 *     (any miss → don't fire).
 *
 * Three scenarios based on distinct hit sub-anchors across the 3 spins:
 *
 *   A — cluster of EXACTLY 2 sub-anchors (e.g. hits on first + second only):
 *       FIRE with split:
 *         40% to hit sub-anchor #1
 *         40% to hit sub-anchor #2
 *         20% to the remaining (non-hit) sub-anchor
 *
 *   B — cluster of EXACTLY 1 sub-anchor (e.g. all 3 hit first):
 *       FIRE with split:
 *         30% to hit sub-anchor (this side)
 *         30% to 13-opp side's same-position sub-anchor numbers + wheel ±1 neighbours
 *         20% to each of the two non-hit sub-anchors (this side)
 *
 *   C — cluster of 3 (last 3 span all sub-anchors):
 *       WAIT (don't fire).
 *
 * Per-entry weight = BASE × split-fraction.
 *
 * Emits one signal entry per non-trivial split slot so the aggregator
 * scores each slot's candidates separately.
 */

(function () {
'use strict';

const _T = (typeof require === 'function')
    ? require('../../../core/tables/projections.js')
    : (typeof window !== 'undefined' ? window.CoreTables : null);

const NAME       = 'sub-anchor-pattern';
const BASE_WGT   = 1.00;   // intra-rule total; splits below sum to <=1   // user-locked global weight (was 0.90)
const LOOK_BACK  = 3;

function _wheelPlusMinus1(numbers) {
    if (!_T || !Array.isArray(numbers)) return new Set(numbers || []);
    const out = new Set(numbers);
    for (const n of numbers) {
        const idx = _T.getWheel36Index(n);
        if (idx < 0) continue;
        _T.getNumbersAtPocket(idx - 1).forEach(m => out.add(m));
        _T.getNumbersAtPocket(idx + 1).forEach(m => out.add(m));
    }
    return out;
}

function _evalSide(tableData, tableLabel, famKey, side /* 'pair' | '13opp' */) {
    const out = [];
    const rows = tableData && tableData.rows;
    const proj = tableData && tableData.nextProjections;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK || !proj) return out;

    const pairKey = (side === '13opp') ? (famKey + '_13opp') : famKey;
    const projEntry = proj[pairKey];
    if (!projEntry) return out;

    // Strict last-3: every row must have a hit on this side; bail otherwise.
    const counts = { first: 0, second: 0, third: 0 };
    for (let i = rows.length - 1; i >= rows.length - LOOK_BACK; i--) {
        const ent = rows[i].perPair && rows[i].perPair[famKey];
        if (!ent) return out;
        const hits = (side === '13opp') ? ent.oppHits : ent.hits;
        if (!hits) return out;
        const anyHit = !!(hits.first || hits.second || hits.third);
        if (!anyHit) return out;
        if (hits.first)  counts.first++;
        if (hits.second) counts.second++;
        if (hits.third)  counts.third++;
    }

    const hitSlots = ['first','second','third'].filter(k => counts[k] > 0);
    const missSlots = ['first','second','third'].filter(k => counts[k] === 0);

    // Scenario C — cluster of 3 → wait.
    if (hitSlots.length === 3) return out;

    const labelSide  = (side === '13opp') ? '13-opp' : 'pair';
    const baseHeader = `${tableLabel} ${famKey} (${labelSide})`;

    if (hitSlots.length === 2) {
        // Scenario A — cluster of 2 → 40 / 40 / 20.
        hitSlots.forEach(pos => {
            const cell = projEntry[pos] || {};
            const cands = new Set(cell.numbers || []);
            if (cands.size === 0) return;
            out.push({
                name:        NAME + '/' + tableLabel + '/' + pairKey + '/A-hit-' + pos,
                fired:       true,
                candidates:  cands,
                weight:      BASE_WGT * 0.40,
                reason:      `${baseHeader}: last 3 spins clustered on ${hitSlots.join('+')} — `
                           + `vote ${pos} (40% of rule weight).`,
                details:     { table: tableLabel, pairKey, side, scenario: 'A', slot: pos, share: 0.40 }
            });
        });
        if (missSlots.length === 1) {
            const pos  = missSlots[0];
            const cell = projEntry[pos] || {};
            const cands = new Set(cell.numbers || []);
            if (cands.size > 0) {
                out.push({
                    name:        NAME + '/' + tableLabel + '/' + pairKey + '/A-miss-' + pos,
                    fired:       true,
                    candidates:  cands,
                    weight:      BASE_WGT * 0.20,
                    reason:      `${baseHeader}: ${pos} has NOT hit yet — vote ${pos} (20%).`,
                    details:     { table: tableLabel, pairKey, side, scenario: 'A', slot: pos, share: 0.20 }
                });
            }
        }
        return out;
    }

    if (hitSlots.length === 1) {
        // Scenario B — cluster of 1 → 30% same-side hit + 30% 13-opp mirror
        // (with wheel ±1) + 20% each to the two non-hit same-side sub-anchors.
        const hitPos = hitSlots[0];
        const sameCell = projEntry[hitPos] || {};
        const sameCands = new Set(sameCell.numbers || []);
        if (sameCands.size > 0) {
            out.push({
                name:        NAME + '/' + tableLabel + '/' + pairKey + '/B-hit-' + hitPos,
                fired:       true,
                candidates:  sameCands,
                weight:      BASE_WGT * 0.30,
                reason:      `${baseHeader}: all 3 spins hit on ${hitPos} only — `
                           + `vote ${hitPos} (30% of rule weight).`,
                details:     { table: tableLabel, pairKey, side, scenario: 'B', slot: hitPos, share: 0.30 }
            });
        }
        // 13-opp mirror — same-position sub-anchor on the OPPOSITE half + wheel ±1.
        const oppPairKey = (side === '13opp') ? famKey : (famKey + '_13opp');
        const oppProjEntry = proj[oppPairKey];
        if (oppProjEntry) {
            const oppCell = oppProjEntry[hitPos] || {};
            const oppNums = Array.isArray(oppCell.numbers) ? oppCell.numbers : [];
            const mirror = _wheelPlusMinus1(oppNums);
            if (mirror.size > 0) {
                out.push({
                    name:        NAME + '/' + tableLabel + '/' + pairKey + '/B-mirror-' + hitPos,
                    fired:       true,
                    candidates:  mirror,
                    weight:      BASE_WGT * 0.30,
                    reason:      `${baseHeader}: 13-opp side / ${hitPos} mirror (with wheel ±1) — `
                               + `vote mirror (30%).`,
                    details:     { table: tableLabel, pairKey, side, scenario: 'B', slot: hitPos,
                                   mirrorPairKey: oppPairKey, share: 0.30 }
                });
            }
        }
        // 20% each to the two non-hit sub-anchors on this side.
        missSlots.forEach(pos => {
            const cell = projEntry[pos] || {};
            const cands = new Set(cell.numbers || []);
            if (cands.size === 0) return;
            out.push({
                name:        NAME + '/' + tableLabel + '/' + pairKey + '/B-miss-' + pos,
                fired:       true,
                candidates:  cands,
                weight:      BASE_WGT * 0.20,
                reason:      `${baseHeader}: ${pos} did NOT hit — vote ${pos} (20%).`,
                details:     { table: tableLabel, pairKey, side, scenario: 'B', slot: pos, share: 0.20 }
            });
        });
        return out;
    }

    return out;
}

function _evalTable(tableData, tableLabel) {
    const out = [];
    const rows = tableData && tableData.rows;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK) return out;
    const lastRow = rows[rows.length - 1];
    const families = lastRow && lastRow.perPair ? Object.keys(lastRow.perPair) : [];
    families.forEach(fam => {
        out.push(..._evalSide(tableData, tableLabel, fam, 'pair'));
        out.push(..._evalSide(tableData, tableLabel, fam, '13opp'));
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
    window.StrategyAnalyserSignals.subAnchorPattern = _api;
}

})();
