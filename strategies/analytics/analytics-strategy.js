/**
 * Analytics Strategy — T2 × T3 Wheel-Consensus decision module
 * ============================================================
 *
 * A self-contained decision strategy that plugs into BOTH:
 *   • the live Auto-mode path (auto-update-orchestrator decisionMode='analytics'), and
 *   • the offline backtest (auto-test-runner method='analytics'),
 * exactly like StrategyLab / Strategy3T. Both callers invoke
 *   AnalyticsStrategy.decide(engine, spins, idx, ctx)
 * with the same engine instance + (spins, idx), so live and backtest
 * produce identical decisions for identical history.
 *
 * Idea (per user): watch TABLE 2 and TABLE 3 and decide on its own when
 * their wheel patterns line up. Table 1 is NOT used. Method (deliberately
 * not rule-matching position codes):
 *   1. Turn each table's projected points into a probability field over
 *      the 36-pocket wheel ring (circular Gaussian kernels). It compares
 *      the FULL set of pairs the user sees in the tables (NOT a "flash"
 *      subset), computed via engine helpers that take (spins, idx) so
 *      live and backtest match:
 *        T2 → _getCalculateReferences + _getLookupRow per pair
 *             (each pair's first/second/third targets + its 13-opposite)
 *        T3 → _computeProjectionForPair per pair (anchors + opposites)
 *   2. ALIGNMENT = Bhattacharyya overlap Σ√(dT2·dT3) ∈ [0,1]. "Same side
 *      / same pattern" emerges from where the two fields coincide.
 *   3. CONSENSUS field = √(dT2·dT3) (geometric mean) — mass only where
 *      both agree. The proposed numbers are its top-N pockets.
 *   4. CONFIRMATION = how strongly the picks skew to one +/- class and
 *      one 0/19 table. Strong skew raises confidence.
 *   5. CONFIDENCE = tunable weighted blend; SIGNAL = BET when alignment
 *      and confidence clear thresholds, else SKIP.
 *
 * Pure + dependency-free (only reads the engine methods passed in). Every
 * threshold/weight is overridable via ctx.params so the UI can tune live
 * and the backtest can pass the same params.
 */
(function () {
    'use strict';

    // ── Wheel constants (mirror renderer-3tables.js WHEEL_36 +
    //    roulette-wheel.js partitions). 0 and 26 share pocket index 0. ──
    const WHEEL_36 = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11,
        30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
    const RING = WHEEL_36.length; // 36
    const POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
    const NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);
    const ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
    const NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);

    const DEFAULTS = {
        sigma: 1.6,            // kernel width (pockets)
        alignThreshold: 0.60,  // min T2×T3 overlap to BET (PRIMARY gate)
        confThreshold: 45,     // soft confidence floor (rarely blocks once aligned)
        pickCount: 12,         // pockets to propose (0/26 pocket adds both numbers)
        confirmBonus: 15       // max confidence % added by +/- & 0/19 agreement
    };

    const posOf = (n) => (n === 26 ? 0 : WHEEL_36.indexOf(n));
    const numAt = (idx) => WHEEL_36[((idx % RING) + RING) % RING];
    const ringDist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, RING - d); };

    function density(numbers, sigma) {
        const d = new Array(RING).fill(0);
        const s = Math.max(0.3, sigma);
        const twoS2 = 2 * s * s;
        let any = false;
        numbers.forEach(n => {
            const c = posOf(n);
            if (c < 0) return;
            any = true;
            for (let i = 0; i < RING; i++) {
                const dist = ringDist(i, c);
                d[i] += Math.exp(-(dist * dist) / twoS2);
            }
        });
        if (!any) return null;
        const sum = d.reduce((a, b) => a + b, 0);
        if (sum <= 0) return null;
        for (let i = 0; i < RING; i++) d[i] /= sum;
        return d;
    }

    /**
     * Pure consensus computation from two lists of projected numbers.
     * Returns the full analytics result (alignment, picks, confidence,
     * confirmation, signal). Used by both decide() and the live panel.
     */
    function computeConsensus(t2Points, t3Points, params) {
        const p = Object.assign({}, DEFAULTS, params || {});
        const dT2 = density(t2Points, p.sigma);
        const dT3 = density(t3Points, p.sigma);
        if (!dT2 || !dT3) {
            return { ready: false, reason: 'No T2/T3 projection points' };
        }
        let bc = 0;
        const consensus = new Array(RING).fill(0);
        for (let i = 0; i < RING; i++) {
            const g = Math.sqrt(dT2[i] * dT3[i]);
            consensus[i] = g; bc += g;
        }
        const align = bc; // Σ√(p·q)
        const cSum = consensus.reduce((a, b) => a + b, 0);
        if (cSum > 0) for (let i = 0; i < RING; i++) consensus[i] /= cSum;

        // Peak sharpness via normalized entropy.
        let entropy = 0;
        for (let i = 0; i < RING; i++) { const v = consensus[i]; if (v > 0) entropy += -v * Math.log(v); }
        const sharpness = Math.log(RING) > 0 ? (1 - entropy / Math.log(RING)) : 0;

        const N = Math.max(1, Math.min(RING, p.pickCount));
        const top = consensus
            .map((v, i) => ({ i, v }))
            .sort((a, b) => b.v - a.v)
            .slice(0, N)
            .filter(o => o.v > 0);
        // Map pockets → numbers. The 0/26 pocket (index 0) is SHARED, so
        // selecting it bets BOTH 0 and 26 (matches the physical wheel and
        // the rest of the app). This is why 26 was never appearing before.
        const picks = [];
        const pickNums = [];
        top.forEach(o => {
            if (o.i === 0) {
                picks.push({ num: 0, alt: 26, pos: 0, weight: o.v });
                pickNums.push(0, 26);
            } else {
                const n = numAt(o.i);
                picks.push({ num: n, pos: o.i, weight: o.v });
                pickNums.push(n);
            }
        });

        const pos = pickNums.filter(n => POSITIVE_NUMS.has(n)).length;
        const neg = pickNums.filter(n => NEGATIVE_NUMS.has(n)).length;
        const zero = pickNums.filter(n => ZERO_TABLE_NUMS.has(n)).length;
        const nine = pickNums.filter(n => NINETEEN_TABLE_NUMS.has(n)).length;
        const total = pickNums.length || 1;
        const pnSkew = Math.max(pos, neg) / total;
        const z19Skew = Math.max(zero, nine) / total;
        // Confirmation is EXTRA: 0 when the picks split evenly, up to 1
        // when they all fall on one +/- class AND one 0/19 table.
        const confirmConf = (Math.max(0, (pnSkew - 0.5) * 2) + Math.max(0, (z19Skew - 0.5) * 2)) / 2;

        // Confidence is ALIGNMENT-driven (that's the whole signal), with a
        // small bonus from +/- & 0/19 agreement. So "aligned 85%" reads as
        // ~85% confidence — not dragged down by unrelated terms.
        const confidence = Math.min(100, Math.round(100 * align + (p.confirmBonus || 0) * confirmConf));
        const signal = (align >= p.alignThreshold && confidence >= p.confThreshold) ? 'BET' : 'WAIT';

        return {
            ready: true,
            align, confidence, signal, sharpness,
            picks, pickNums,
            confirm: {
                pos, neg, zero, nine, total, pnSkew, z19Skew,
                pnLabel: pos >= neg ? 'Positive' : 'Negative',
                z19Label: zero >= nine ? '0-table' : '19-table'
            },
            params: p
        };
    }

    // snake_case engine refKey → camelCase pair name (table data-pair).
    function toCamel(key) {
        return (typeof key === 'string') ? key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()) : '';
    }

    // ── Gather the FULL T2 / T3 projected points at (spins, idx) ──
    // Compares ALL pairs the user sees in the tables — NOT just the
    // engine's "flash" pairs (which use a stricter, different notion than
    // the golden cells on screen and were causing "no flash" skips). The
    // wheel-overlap alignment itself is what discriminates BET vs WAIT.
    //
    //   T2 → each pair's lookup targets (first/second/third) + its
    //        13-opposite's targets — exactly getTable2NextProjections.
    //   T3 → each pair's anchors + opposites via _computeProjectionForPair
    //        (the same routine the renderer uses for the displayed T3).
    //
    // All via engine helpers that take (spins, idx), so live and backtest
    // produce identical results. Returns per-pair maps so the caller can
    // figure out which pairs actually drove the aligned region.
    function gatherPoints(engine, spins, idx) {
        const t2Points = [], t3Points = [];
        const t2ByPair = {}, t3ByPair = {};
        if (!engine || idx < 2) return { t2Points, t3Points, t2ByPair, t3ByPair };

        let refs = null;
        try { refs = engine._getCalculateReferences(spins[idx - 1], spins[idx - 2]); } catch (_) {}
        if (!refs) return { t2Points, t3Points, t2ByPair, t3ByPair };
        const pairKeys = Object.keys(refs);

        // T2 — lookup targets for every pair (+ its 13-opposite).
        if (typeof engine._getLookupRow === 'function') {
            pairKeys.forEach(refKey => {
                const refNum = refs[refKey];
                if (typeof refNum !== 'number') return;
                const acc = [];
                const lk = engine._getLookupRow(refNum);
                if (lk) [lk.first, lk.second, lk.third].forEach(t => { if (typeof t === 'number') acc.push(t); });
                let opp = null;
                try { opp = engine._getDigit13Opposite(refNum); } catch (_) {}
                if (typeof opp === 'number') {
                    const lko = engine._getLookupRow(opp);
                    if (lko) [lko.first, lko.second, lko.third].forEach(t => { if (typeof t === 'number') acc.push(t); });
                }
                if (acc.length) {
                    t2ByPair[refKey] = acc;
                    acc.forEach(n => t2Points.push(n));
                }
            });
        }

        // T3 — anchors + opposites for every pair (no flash gate).
        if (typeof engine._computeProjectionForPair === 'function') {
            pairKeys.forEach(refKey => {
                try {
                    const proj = engine._computeProjectionForPair(spins, idx, refKey);
                    if (proj) {
                        const acc = [];
                        (proj.anchors || []).forEach(n => { if (typeof n === 'number') acc.push(n); });
                        (proj.neighbors || []).forEach(n => { if (typeof n === 'number') acc.push(n); });
                        if (acc.length) {
                            t3ByPair[refKey] = acc;
                            acc.forEach(n => t3Points.push(n));
                        }
                    }
                } catch (_) {}
            });
        }

        return { t2Points, t3Points, t2ByPair, t3ByPair };
    }

    /**
     * Decision entry — same contract as StrategyLab.decideStrategyLab:
     *   returns { action, selectedPair, selectedFilter, numbers, confidence, reason }
     * plus an `analytics` field carrying the full breakdown for the UI.
     */
    function decide(engine, spins, idx, ctx) {
        const skip = (reason) => ({
            action: 'SKIP', selectedPair: null, selectedFilter: null,
            numbers: [], confidence: 0, reason: reason, analytics: null
        });
        if (!engine || !Array.isArray(spins) || idx < 3) return skip('Analytics: insufficient history');

        const params = (ctx && ctx.params) ? ctx.params : null;
        const { t2Points, t3Points, t2ByPair, t3ByPair } = gatherPoints(engine, spins, idx);
        if (t2Points.length === 0 || t3Points.length === 0) {
            return skip(`Analytics: no ${t2Points.length === 0 ? 'T2' : 'T3'} projections yet (need ≥ 3 spins)`);
        }

        const r = computeConsensus(t2Points, t3Points, params);
        if (!r.ready) return skip('Analytics: ' + r.reason);

        // Which pairs actually drove the aligned region? A pair "contributes"
        // if any of its projected numbers landed in the proposed pool. This
        // is what we surface + highlight (meaningful, vs "all pairs").
        // We also build per-pair "details" maps (pair → numbers it contributed)
        // so the Selection Process popup can show exactly WHICH numbers each
        // pair brought to the final 12.
        const pickSet = new Set(r.pickNums);
        const t2DetailsByPair = {};
        Object.keys(t2ByPair).forEach(k => {
            const contributed = t2ByPair[k].filter(n => pickSet.has(n));
            if (contributed.length) t2DetailsByPair[toCamel(k)] = contributed.slice().sort((a, b) => a - b);
        });
        const t3DetailsByPair = {};
        Object.keys(t3ByPair).forEach(k => {
            const contributed = t3ByPair[k].filter(n => pickSet.has(n));
            if (contributed.length) t3DetailsByPair[toCamel(k)] = contributed.slice().sort((a, b) => a - b);
        });
        const contribT2 = Object.keys(t2DetailsByPair);
        const contribT3 = Object.keys(t3DetailsByPair);

        const alignPct = Math.round(r.align * 100);
        const thrPct = Math.round((r.params.alignThreshold || 0.6) * 100);
        const cf = r.confirm;
        const pnTxt = `${cf.pnLabel} ${Math.max(cf.pos, cf.neg)}/${cf.total}`;
        const z19Txt = `${cf.z19Label} ${Math.max(cf.zero, cf.nine)}/${cf.total}`;
        const t2Names = contribT2.length ? contribT2.join(', ') : '—';
        const t3Names = contribT3.length ? contribT3.join(', ') : '—';
        const numsTxt = r.pickNums.slice().sort((a, b) => a - b).join(', ');

        // Plain-language WHY — readable to a player, not just codes.
        let summary;
        if (r.signal === 'BET') {
            summary = `Table 2 and Table 3 agree ${alignPct}% — both projecting into the same part of the wheel, so this is a BET. `
                + `Betting these ${r.pickNums.length} numbers: ${numsTxt}. `
                + `Extra confirmation — colour/side skew: ${pnTxt}; table split: ${z19Txt}. `
                + `(Contributing pairs — T2: ${t2Names}; T3: ${t3Names}.)`;
        } else {
            summary = `No bet — Table 2 and Table 3 only agree ${alignPct}% (need ${thrPct}%). `
                + `Their projections point to different parts of the wheel, so there is no clear overlap to bet on.`;
        }

        // t2Pair/t3Pairs carry the CONTRIBUTING pairs for the UI + table
        // highlight (camelCase = table data-pair).
        const analytics = Object.assign({
            t2Pair: contribT2.join(', ') || null,
            t2Pairs: contribT2,
            t3Pairs: contribT3,
            t2DetailsByPair,
            t3DetailsByPair,
            summary,
            alignThreshold: r.params.alignThreshold
        }, r);

        if (r.signal !== 'BET') {
            const s = skip(summary);
            s.analytics = analytics;
            return s;
        }

        return {
            action: 'BET',
            selectedPair: 'analytics',
            selectedFilter: null,
            numbers: r.pickNums.slice(),
            confidence: Math.round(r.confidence),
            reason: summary,
            analytics: analytics
        };
    }

    const api = {
        decide: decide,
        computeConsensus: computeConsensus,
        gatherPoints: gatherPoints,
        DEFAULTS: DEFAULTS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.AnalyticsStrategy = api;
    }
})();
