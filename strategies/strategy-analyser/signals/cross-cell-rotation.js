/**
 * signals/cross-cell-rotation.js — Rule 6: T1+T2 cross-cell alternation.
 *
 * User-locked spec (2026-06-19):
 *
 * Trigger: per (table ∈ {T1, T2}, pair-family), look at the last 4 spins.
 * Label each as:
 *   P    — only pair-side got a hit this spin
 *   13O  — only 13-opp side got a hit this spin
 *   BOTH — both sides hit (DISALLOWED — breaks the pattern)
 *   NONE — no hit on either side (DISALLOWED — breaks the pattern)
 *
 * Fire only when the last 4 rows form a STRICT alternation
 * (P↔13O↔P↔13O or its mirror 13O↔P↔13O↔P). Any BOTH or NONE row
 * inside the window breaks the alternation → don't fire.
 *
 * Predicted side = opposite of the most recent labelled hit:
 *   last = P    → predict 13O
 *   last = 13O  → predict P
 *
 * Vote split (on the predicted side): look at the 2 PAST hits on the
 * predicted side in the 4-row window (the rows labelled with the
 * predicted side). Count distinct sub-anchor slots hit:
 *
 *   2 distinct slots:
 *     40% to most-recent slot
 *     40% to 2nd-most-recent slot
 *     20% to remaining slot
 *
 *   1 distinct slot (both past hits used the same slot):
 *     50% to that slot
 *     25% to each of the other two slots
 *
 *   3 distinct slots: don't fire (no rule specified by user; safest is skip).
 *
 * Mutually exclusive with Rule 4 on the same pair-family by definition:
 *   Rule 4 needs last-3 all on same side; Rule 6 needs alternation.
 */

(function () {
'use strict';

const NAME      = 'cross-cell-rotation';
const BASE_WGT  = 1.00;   // intra-rule total; splits below sum to <=1   // user-locked global weight (was 0.70)
const LOOK_BACK = 4;

function _labelRow(perPairEntry) {
    if (!perPairEntry) return 'NONE';
    const h  = perPairEntry.hits    || {};
    const oh = perPairEntry.oppHits || {};
    const pairHit = !!(h.first || h.second || h.third);
    const oppHit  = !!(oh.first || oh.second || oh.third);
    if (pairHit && oppHit)  return 'BOTH';
    if (pairHit && !oppHit) return 'P';
    if (oppHit && !pairHit) return '13O';
    return 'NONE';
}

function _isAlternating4(labels) {
    if (labels.length !== 4) return false;
    for (const l of labels) if (l !== 'P' && l !== '13O') return false;
    return labels[0] !== labels[1]
        && labels[1] !== labels[2]
        && labels[2] !== labels[3];
}

function _slotsHit(perPairEntry, side /* 'P' | '13O' */) {
    if (!perPairEntry) return [];
    const obj = (side === 'P') ? (perPairEntry.hits || {}) : (perPairEntry.oppHits || {});
    return ['first','second','third'].filter(s => obj[s]);
}

function _evalFamily(tableData, tableLabel, famKey) {
    const out = [];
    const rows = tableData && tableData.rows;
    const proj = tableData && tableData.nextProjections;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK || !proj) return out;

    const window = rows.slice(-LOOK_BACK);
    const labels = window.map(r => _labelRow(r.perPair && r.perPair[famKey]));
    if (!_isAlternating4(labels)) return out;

    const lastLabel = labels[labels.length - 1];
    const predicted = (lastLabel === 'P') ? '13O' : 'P';
    const predictedPairKey = (predicted === 'P') ? famKey : (famKey + '_13opp');
    const projEntry = proj[predictedPairKey];
    if (!projEntry) return out;

    // Collect distinct slots hit on the predicted side across past
    // predicted-side rows (newest first → preserves "most recent" order).
    const distinctOrder = [];
    const seen = new Set();
    for (let i = window.length - 1; i >= 0; i--) {
        if (labels[i] !== predicted) continue;
        const slots = _slotsHit(window[i].perPair && window[i].perPair[famKey], predicted);
        for (const s of slots) {
            if (!seen.has(s)) { seen.add(s); distinctOrder.push(s); }
        }
    }

    // 3 distinct slots → don't fire (no user-spec split).
    if (distinctOrder.length === 0 || distinctOrder.length === 3) return out;

    const allSlots = ['first', 'second', 'third'];
    const baseHeader = `${tableLabel} ${famKey}: alternation [${labels.join('→')}] → predict ${predicted}`;

    function _push(slot, share, tag) {
        const cell = projEntry[slot] || {};
        const cands = new Set(cell.numbers || []);
        if (cands.size === 0) return;
        out.push({
            name:        NAME + '/' + tableLabel + '/' + famKey + '/' + tag,
            fired:       true,
            candidates:  cands,
            weight:      BASE_WGT * share,
            reason:      `${baseHeader} — vote ${slot} (${(share * 100).toFixed(0)}%).`,
            details:     { table: tableLabel, famKey, predicted, slot, share }
        });
    }

    if (distinctOrder.length === 2) {
        const mostRecent = distinctOrder[0];
        const secondMost = distinctOrder[1];
        const remaining  = allSlots.find(s => s !== mostRecent && s !== secondMost);
        _push(mostRecent, 0.40, '2-most-' + mostRecent);
        _push(secondMost, 0.40, '2-second-' + secondMost);
        if (remaining) _push(remaining, 0.20, '2-rest-' + remaining);
    } else {
        // 1 distinct slot
        const only = distinctOrder[0];
        const others = allSlots.filter(s => s !== only);
        _push(only, 0.50, '1-hit-' + only);
        others.forEach(s => _push(s, 0.25, '1-rest-' + s));
    }

    return out;
}

function _evalTable(tableData, tableLabel) {
    const out = [];
    const rows = tableData && tableData.rows;
    if (!Array.isArray(rows) || rows.length < LOOK_BACK) return out;
    const lastRow = rows[rows.length - 1];
    const families = lastRow && lastRow.perPair ? Object.keys(lastRow.perPair) : [];
    families.forEach(fam => { out.push(..._evalFamily(tableData, tableLabel, fam)); });
    return out;
}

function evaluate(snap, sessionState, opts) {
    // T1 only — T2 dropped 2026-06-19 per user spec.
    if (!snap) return [];
    return _evalTable(snap.table1, 'T1');
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.crossCellRotation = _api;
}

})();
