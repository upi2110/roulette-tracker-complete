/**
 * signals/cross-table-conv.js — Rule 7: T3 golden-pair signal.
 *
 * User-locked spec (2026-06-19):
 *
 * Scope: T3 ONLY. Each pair-family is treated as ONE combined group
 * (P-side and 13-opp-side together — NOT split).
 *
 * "Gold-highlighted cell" definition (PARKED — see Backlog #1):
 *   For now this uses the same algorithm Electron and the HTML mirror
 *   use today: position-code distance match between consecutive rows.
 *   A cell goes gold when its position-code distance is within ±1 of
 *   some cell's distance on the adjacent row (cross-side matching
 *   allowed). The chain walks back from the newest pair-of-rows and
 *   stops at the first non-match.
 *
 *   The user has flagged this semantic as wrong (should be hitBetPool-
 *   based). When that discussion resolves, swap the detector below and
 *   this signal logic stays unchanged.
 *
 * Qualifying condition:
 *   A pair-family qualifies if BOTH of the latest 2 T3 rows have at
 *   least one gold cell on that pair (any of pair-side or 13-opp-side
 *   counts — combined view).
 *
 * Selection:
 *   For each qualifying pair, count the bottom-up streak — how many
 *   consecutive rows starting from the newest have at least one gold
 *   cell on this pair. The shortest streak wins.
 *
 *   • Single winner → vote that pair's full T3 bet pool (pair.numbers,
 *     which is already sameSide ∪ oppSide with ±1 wheel neighbours).
 *   • Tie → vote the INTERSECTION of the tied pairs' bet pools.
 *   • Empty intersection → fall back to UNION of the tied pairs.
 *
 * Skip when no pair-family qualifies or T3 has fewer than 2 rows.
 */

(function () {
'use strict';

const _T = (typeof require === 'function')
    ? require('../../../core/tables/projections.js')
    : (typeof window !== 'undefined' ? window.CoreTables : null);

const NAME     = 'cross-table-conv';
const BASE_WGT = 1.00;   // intra-rule fraction (single vote)

// ── Gold-flash detection (mirror of Electron's algorithm) ──────────
function _distOf(code) {
    if (!code || code === 'XX') return null;
    if (code === 'S+0' || code === 'O+0') return 0;
    const m = String(code).match(/[+-](\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

function _t3RowInfo(rows, families) {
    if (!_T) return [];
    return rows.map(row => {
        const info = {};
        families.forEach(fam => {
            const e = row.perPair && row.perPair[fam];
            if (!e) { info[fam] = null; return; }
            const pairCode    = (e.refNum   != null) ? _T.calculatePositionCode(e.refNum,   row.actual) : 'XX';
            const pair13Code  = (e.ref13Opp != null) ? _T.calculatePositionCode(e.ref13Opp, row.actual) : 'XX';
            info[fam] = {
                pairDist:   _distOf(pairCode),
                pair13Dist: _distOf(pair13Code)
            };
        });
        return info;
    });
}

/**
 * Returns a Set of "rowIdx:famKey:cellType" strings (cellType ∈
 * {pair, pair13Opp}). Same chain-walk semantics as the HTML writer
 * and Electron renderer.
 */
function _computeGoldFlash(rows, families) {
    const out = new Set();
    if (rows.length < 2 || !_T) return out;
    const info = _t3RowInfo(rows, families);
    families.forEach(fam => {
        for (let i = rows.length - 2; i >= 0; i--) {
            const upper = info[i] && info[i][fam];
            const lower = info[i + 1] && info[i + 1][fam];
            if (!upper || !lower) break;
            const uList = [];
            const lList = [];
            if (upper.pairDist   != null) uList.push({ dist: upper.pairDist,   cell: 'pair' });
            if (upper.pair13Dist != null) uList.push({ dist: upper.pair13Dist, cell: 'pair13Opp' });
            if (lower.pairDist   != null) lList.push({ dist: lower.pairDist,   cell: 'pair' });
            if (lower.pair13Dist != null) lList.push({ dist: lower.pair13Dist, cell: 'pair13Opp' });
            if (!uList.length || !lList.length) break;
            let matched = null;
            for (const u of uList) {
                for (const l of lList) {
                    if (Math.abs(u.dist - l.dist) <= 1) { matched = { u, l }; break; }
                }
                if (matched) break;
            }
            if (!matched) break;
            out.add(i       + ':' + fam + ':' + matched.u.cell);
            out.add((i + 1) + ':' + fam + ':' + matched.l.cell);
        }
    });
    return out;
}

function _rowHasGoldForFam(flashSet, rowIdx, fam) {
    return flashSet.has(rowIdx + ':' + fam + ':pair')
        || flashSet.has(rowIdx + ':' + fam + ':pair13Opp');
}

function evaluate(snap, sessionState, opts) {
    if (!snap || !snap.table3) return [];
    const t3   = snap.table3;
    const rows = t3.rows || [];
    if (rows.length < 2) return [];
    const proj     = t3.nextProjections || {};
    const families = Object.keys(proj);
    if (families.length === 0) return [];

    const flashSet = _computeGoldFlash(rows, families);
    const lastIdx  = rows.length - 1;

    // 1. Find qualifying pairs: gold on BOTH latest 2 rows.
    const qualifying = families.filter(fam =>
        _rowHasGoldForFam(flashSet, lastIdx,     fam) &&
        _rowHasGoldForFam(flashSet, lastIdx - 1, fam)
    );
    if (qualifying.length === 0) return [];

    // 2. Bottom-up streak per qualifying pair.
    const streaks = {};
    qualifying.forEach(fam => {
        let n = 0;
        for (let i = lastIdx; i >= 0; i--) {
            if (_rowHasGoldForFam(flashSet, i, fam)) n++;
            else break;
        }
        streaks[fam] = n;
    });

    // 3. Shortest-streak winner(s).
    const minStreak = Math.min(...qualifying.map(f => streaks[f]));
    const winners   = qualifying.filter(f => streaks[f] === minStreak);

    // 4. Build candidate set.
    let candidates;
    let mode;
    if (winners.length === 1) {
        candidates = new Set((proj[winners[0]] && proj[winners[0]].numbers) || []);
        mode = 'single';
    } else {
        // Tie → intersection, fall back to union if empty.
        const pools = winners.map(f => new Set((proj[f] && proj[f].numbers) || []));
        const inter = new Set();
        if (pools.length > 0) {
            for (const n of pools[0]) {
                if (pools.every(p => p.has(n))) inter.add(n);
            }
        }
        if (inter.size > 0) {
            candidates = inter;
            mode = 'tie-intersection';
        } else {
            const uni = new Set();
            pools.forEach(p => p.forEach(n => uni.add(n)));
            candidates = uni;
            mode = 'tie-union-fallback';
        }
    }
    if (candidates.size === 0) return [];

    const reason = (winners.length === 1)
        ? `T3 golden-pair: ${winners[0]} qualifies (gold on last 2 rows, `
          + `bottom-up streak=${minStreak}). Vote ${candidates.size} bet-pool numbers.`
        : `T3 golden-pair tie (${winners.join(', ')}) — bottom-up streak=${minStreak}. `
          + `Mode=${mode}, vote ${candidates.size} number${candidates.size === 1 ? '' : 's'}.`;

    return [{
        name:        NAME + '/' + winners.join('+'),
        fired:       true,
        candidates,
        weight:      BASE_WGT,
        reason,
        details:     { winners, minStreak, mode, allQualifying: qualifying, streaks }
    }];
}

const _api = { evaluate, NAME, BASE_WGT };
if (typeof module !== 'undefined' && module.exports) module.exports = _api;
if (typeof window !== 'undefined') {
    window.StrategyAnalyserSignals = window.StrategyAnalyserSignals || {};
    window.StrategyAnalyserSignals.crossTableConv = _api;
}

})();
