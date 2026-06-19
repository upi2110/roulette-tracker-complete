/**
 * signals/cross-table-conv.js — Rule #7 (T1 ∧ T2 ∧ T3 confluence).
 *
 * A pair-family fires on T1 AND T2 AND T3 simultaneously at the
 * latest row. Strongest single-spin signal (BASE_WGT 1.20).
 *
 * Candidates = T3 nextProjections[family].numbers (T3's bet pool —
 * already side-split into purple+green via the locked pipeline).
 */

'use strict';

const NAME     = 'cross-table-conv';
const BASE_WGT = 1.20;

function _hitOnTable(tableData, famKey) {
    const rows = tableData && tableData.rows;
    if (!Array.isArray(rows) || !rows.length) return false;
    const lastRow = rows[rows.length - 1];
    const ent = lastRow && lastRow.perPair && lastRow.perPair[famKey];
    if (!ent) return false;
    // T1 / T2 entry: hits/oppHits are objects.
    if (ent.hits || ent.oppHits) {
        const h  = ent.hits    || {};
        const oh = ent.oppHits || {};
        return !!(h.first || h.second || h.third || oh.first || oh.second || oh.third);
    }
    // T3 entry: hitAnchor / hitBetPool flags.
    return !!(ent.hitAnchor || ent.hitBetPool);
}

function evaluate(snap, sessionState, opts) {
    if (!snap) return [];
    const out = [];
    const t3Proj = (snap.table3 && snap.table3.nextProjections) || {};
    const families = Object.keys(t3Proj);

    families.forEach(famKey => {
        const t1Hit = _hitOnTable(snap.table1, famKey);
        const t2Hit = _hitOnTable(snap.table2, famKey);
        const t3Hit = _hitOnTable(snap.table3, famKey);
        if (!(t1Hit && t2Hit && t3Hit)) return;

        const projEntry = t3Proj[famKey];
        const candidates = new Set(projEntry.numbers || []);
        if (candidates.size === 0) return;

        out.push({
            name:       NAME + '/' + famKey,
            fired:      true,
            candidates,
            weight:     BASE_WGT,
            reason:     `${famKey} hit on T1 ∧ T2 ∧ T3 this spin — `
                      + `cross-table confluence (strongest signal).`,
            details:    { famKey, refNum: projEntry.refNum, ref13Opp: projEntry.ref13Opp,
                          usePosCode: projEntry.usePosCode }
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
