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
        // Use the LATEST pair (idx, idx-1) — the convention everywhere
        // else in the codebase. The previous (idx-1, idx-2) call was an
        // off-by-one that made `prev` resolve to the second-to-last spin
        // (e.g. 21) instead of the latest (29). Confirmed end-to-end via
        // console: spinsArr=[14,20,21,29], the chip "prev contributed
        // 11/15/31" came from ref 21's lookup, not ref 29's — wrong.
        try { refs = engine._getCalculateReferences(spins[idx], spins[idx - 1]); } catch (_) {}
        if (!refs) return { t2Points, t3Points, t2ByPair, t3ByPair };

        // Respect the user's "Pairs (X/12)" visibility filter. Tables and
        // the V6 engine both restrict to window.getVisiblePairFamilies();
        // analytics was the odd one out, contributing chips for pairs the
        // user had hidden from the tables. Filter pairKeys to the visible
        // set (in camelCase, matching family labels).
        let visibleSet = null;
        try {
            if (typeof window !== 'undefined' && typeof window.getVisiblePairFamilies === 'function') {
                visibleSet = window.getVisiblePairFamilies();
            }
        } catch (_) {}
        const pairKeys = Object.keys(refs).filter(k => {
            if (!visibleSet) return true;            // no filter API → keep all (safe default)
            return visibleSet.has(toCamel(k));
        });

        // ── Helpers ───────────────────────────────────────────────────
        const REG_OPP = (typeof window !== 'undefined' && window.REGULAR_OPPOSITES)
            ? window.REGULAR_OPPOSITES : null;
        const flipNum = (n) => (REG_OPP && typeof REG_OPP[n] === 'number') ? REG_OPP[n] : n;
        const flipSet = (arr) => arr.map(flipNum);
        const codeDistance = (code) => {
            if (!code || code === 'XX') return null;
            if (typeof engine._getGetPosCodeDistance === 'function') {
                try { const d = engine._getGetPosCodeDistance(code); if (typeof d === 'number') return d; } catch (_) {}
            }
            const m = String(code).match(/[+\-](\d+)$/);
            return m ? parseInt(m[1], 10) : null;
        };

        // FLASH GATE — per single reference (NOT per pair). The user
        // requires T2's `ref` column and `_13opp` column to be evaluated
        // independently, exactly like the gold highlighter does cell-by-
        // cell (it adds `${relIdx}:${refKey}:pair` and `…:pair13Opp` as
        // separate entries). So this predicate takes ONE reference
        // number and asks: do its last 2 spins' distances chain ±1?
        //   • T3 uses maxDist=1 (strict).
        //   • T2 uses maxDist=2 (allows +2 codes).
        function isRefFlashActive(refNum, maxDist) {
            if (idx < 1 || typeof refNum !== 'number') return false;
            const d0 = codeDistance(engine._getCalculatePositionCode(refNum, spins[idx]));
            const d1 = codeDistance(engine._getCalculatePositionCode(refNum, spins[idx - 1]));
            if (d0 === null || d1 === null) return false;
            if (d0 > maxDist || d1 > maxDist) return false;
            return Math.abs(d0 - d1) <= 1;
        }

        // T3 gold uses CROSS-CELL chain matching (renderer
        // _computeFlashTargets lines 2316-2338). For the pair, both
        // pair-cell and pair13opp-cell distances at the LATEST row are
        // candidates; same at the PRIOR row. ANY (u, l) pair within ±1
        // → gold. So `SR+4` (pair) chains with `OL+4` (pair13opp) just
        // because |4 - 4| = 0. No maxDist cap. Single-ref check misses
        // these cross-cell golds.
        function isT3PairFlashActive(refNum, opp) {
            if (idx < 1) return false;
            const upper = [];
            const lower = [];
            if (typeof refNum === 'number') {
                const u = codeDistance(engine._getCalculatePositionCode(refNum, spins[idx]));
                const l = codeDistance(engine._getCalculatePositionCode(refNum, spins[idx - 1]));
                if (u !== null) upper.push(u);
                if (l !== null) lower.push(l);
            }
            if (typeof opp === 'number') {
                const u = codeDistance(engine._getCalculatePositionCode(opp, spins[idx]));
                const l = codeDistance(engine._getCalculatePositionCode(opp, spins[idx - 1]));
                if (u !== null) upper.push(u);
                if (l !== null) lower.push(l);
            }
            if (!upper.length || !lower.length) return false;
            for (const u of upper) for (const l of lower) {
                if (Math.abs(u - l) <= 1) return true;
            }
            return false;
        }

        // T2 NEXT-row anchor candidates per side (ref + 13-opp).
        // Source: engine's lookup row first/second/third — the same
        // numbers shown in T2's NEXT row in the UI.
        function t2AnchorsForRef(refNum) {
            const lk = engine._getLookupRow(refNum);
            if (!lk) return [];
            return [lk.first, lk.second, lk.third].filter(t => typeof t === 'number');
        }

        // T3 NEXT-row anchors per pair — the engine's purple anchors
        // (already code-driven via generateAnchors() internally).
        function t3AnchorsForPair(refKey) {
            try {
                const proj = engine._computeProjectionForPair(spins, idx + 1, refKey);
                if (!proj) return [];
                return (proj.anchors || []).filter(n => typeof n === 'number');
            } catch (_) { return []; }
        }

        // Wheel-arc overlap score between two number sets. Counts direct
        // intersections + ±1 wheel-neighbour matches (so picks landing
        // one pocket apart still count as "same arc"). Higher = better.
        function arcOverlap(setA, setB) {
            if (!setA.length || !setB.length) return 0;
            const aIdx = new Set(setA.map(posOf).filter(i => i >= 0));
            let score = 0;
            setB.forEach(n => {
                const i = posOf(n); if (i < 0) return;
                if (aIdx.has(i)) score += 2;
                else if (aIdx.has((i + 1) % RING) || aIdx.has((i - 1 + RING) % RING)) score += 1;
            });
            return score;
        }

        // ── Per-pair selection chain ──────────────────────────────────
        // Per user spec: T2's `ref` column and `_13opp` column are
        // INDEPENDENT entities. Each gets its own flash gate, its own
        // anchor source, and its own orientation decision (as-is vs
        // wheel-flipped) chosen by cross-table arc agreement with T3.
        //
        //   T3 is a single column per pair (no _13opp variant) — so it
        //   has one flash gate and one anchor set.
        //
        // Algorithm per pair:
        //   1. T3 flash gate → if false, the pair contributes nothing
        //      (no anchor to align T2 sub-columns against; matches the
        //      "must be highlighted in both tables" rule).
        //   2. For each T2 sub-column independently (ref, ref-13opp):
        //        a. its own flash gate (chain ±1 on that ref's distances).
        //        b. build its lookup-row anchors.
        //        c. choose orientation by max arc-overlap vs T3 anchors
        //           (also tried as-is and flipped — best of 4 combos).
        //        d. accumulate the surviving anchors.
        //   3. The pair's final T2 set = union of surviving sub-cols.
        //      The pair's final T3 set = the orientation that best
        //      matched at least one surviving T2 sub-col.
        //   4. If both T2 sub-cols dropped → pair contributes nothing.
        // MIN_OVERLAP = 0 → cross-table arc match is preferred but not
        // required. Pairs that pass the flash gate always contribute;
        // density consensus then ranks the pool. Setting > 0 re-enables
        // strict arc-agreement filtering (was too strict in practice and
        // caused all-SKIPs even when gold-highlighted pairs were present).
        const MIN_OVERLAP = 0;
        if (typeof engine._getLookupRow === 'function'
                && typeof engine._getCalculatePositionCode === 'function'
                && typeof engine._computeProjectionForPair === 'function') {
            pairKeys.forEach(refKey => {
                const refNum = refs[refKey];
                if (typeof refNum !== 'number') return;
                let opp = null;
                try { opp = engine._getDigit13Opposite(refNum); } catch (_) {}

                // (1) T3 flash gate — cross-cell chain between pair-cell
                //     and pair13opp-cell distances over the latest 2
                //     spins, no maxDist cap. Matches renderer gold
                //     exactly: SR+4 ↔ OL+4 lights gold because |4-4|≤1.
                if (!isT3PairFlashActive(refNum, opp)) return;
                const t3AsIs = [...new Set(t3AnchorsForPair(refKey))];
                if (!t3AsIs.length) return;
                const t3Flip = flipSet(t3AsIs);

                // (2) Evaluate T2's `ref` and `_13opp` sub-columns
                //     independently. Each must pass its OWN flash gate.
                const t2Acc = [];
                let bestT3Variant = null; let bestT3Score = -1;

                const evaluateSubCol = (subRefNum) => {
                    if (typeof subRefNum !== 'number') return;
                    if (!isRefFlashActive(subRefNum, 2)) return;     // (2a)
                    const subAsIs = t2AnchorsForRef(subRefNum);       // (2b)
                    if (!subAsIs.length) return;
                    const subFlip = flipSet(subAsIs);

                    // (2c) Best of 4 (T2-orient × T3-orient) for THIS sub-col.
                    // Even when the best score is 0 (T2/T3 don't share an arc
                    // for any orientation), we KEEP the pair — the flash gate
                    // already confirmed it's a valid signal. We just take the
                    // 'asIs/asIs' default and let density consensus rank the
                    // pool naturally. MIN_OVERLAP > 0 was too strict because
                    // T2 lookup numbers and T3 generated anchors live in very
                    // different number spaces, so direct wheel overlap is
                    // rare even on legitimate signals.
                    const combos = [
                        { t2: subAsIs, t3: t3AsIs }, { t2: subAsIs, t3: t3Flip },
                        { t2: subFlip, t3: t3AsIs }, { t2: subFlip, t3: t3Flip }
                    ];
                    let bestLocal = combos[0]; let bestLocalScore = -1;
                    combos.forEach(c => {
                        const s = arcOverlap(c.t2, c.t3);
                        if (s > bestLocalScore) { bestLocalScore = s; bestLocal = c; }
                    });
                    // Soft floor — only reject if MIN_OVERLAP > 0 explicitly.
                    // Current default 0 → never reject for overlap alone.
                    if (MIN_OVERLAP > 0 && bestLocalScore < MIN_OVERLAP) return;

                    // (2d) Accumulate this sub-col's winning T2 set;
                    //      track the T3 variant that won so we can pick
                    //      ONE final T3 orientation for the pair.
                    bestLocal.t2.forEach(n => t2Acc.push(n));
                    if (bestLocalScore > bestT3Score) {
                        bestT3Score = bestLocalScore;
                        bestT3Variant = bestLocal.t3;
                    }
                };

                evaluateSubCol(refNum);   // T2 ref column
                evaluateSubCol(opp);      // T2 _13opp column

                // (4) If both sub-cols dropped → pair contributes nothing.
                if (!t2Acc.length || !bestT3Variant) return;

                // (3) Record the pair's combined T2 set + winning T3 orientation.
                t2ByPair[refKey] = [...new Set(t2Acc)];
                t3ByPair[refKey] = bestT3Variant;
                t2ByPair[refKey].forEach(n => t2Points.push(n));
                bestT3Variant.forEach(n => t3Points.push(n));
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
        // Need at least 3 spins (idx ≥ 2) — gatherPoints reads spins[idx]
        // and spins[idx-1] for refs, plus spins[idx-2] via the engine's
        // _computeProjectionForPair when called with idx+1. Used to be
        // `idx < 3` (need 4 spins) which was off by one after the prior
        // idx-shift fix.
        if (!engine || !Array.isArray(spins) || idx < 2) {
            return skip(`Analytics: insufficient history (have ${Array.isArray(spins) ? spins.length : 0} spins, need ≥ 3)`);
        }

        const params = (ctx && ctx.params) ? ctx.params : null;
        const { t2Points, t3Points, t2ByPair, t3ByPair } = gatherPoints(engine, spins, idx);
        if (t2Points.length === 0 || t3Points.length === 0) {
            // Distinguish the "history" reason from the "no pair passed
            // validation" reason. With ≥ 3 spins, an empty result means
            // the flash/arc-overlap gates rejected every visible pair —
            // not a history shortage. Misleading "need ≥ 3 spins" was
            // confusing the user when they already had 4+ spins.
            return skip('Analytics: no pair passed the flash + cross-table validation this spin '
                + `(${t2Points.length === 0 ? 'T2' : 'T3'} empty after gates). `
                + 'Either no gold-highlighted pair exists, or no orientation aligned T2 with T3.');
        }

        const r = computeConsensus(t2Points, t3Points, params);
        if (!r.ready) return skip('Analytics: ' + r.reason);

        // COLOUR/SIDE STICKINESS: the user's rule — "previous both are
        // negative, so picks should also be negative." Look at the last
        // 2 actual spins; if both fall on the same +/- class, strip the
        // opposite class out of the pick pool. Falls back gracefully if
        // the filter would empty the pool (keeps the picks rather than
        // produce a meaningless empty bet).
        try {
            const a = spins[idx], b = spins[idx - 1];
            const aPos = POSITIVE_NUMS.has(a), bPos = POSITIVE_NUMS.has(b);
            const aNeg = NEGATIVE_NUMS.has(a), bNeg = NEGATIVE_NUMS.has(b);
            let keep = null;
            if (aPos && bPos) keep = POSITIVE_NUMS;
            else if (aNeg && bNeg) keep = NEGATIVE_NUMS;
            if (keep) {
                const filtered = r.pickNums.filter(n => keep.has(n));
                if (filtered.length >= 4) {
                    r.pickNums = filtered;
                    r.picks = r.picks.filter(p => keep.has(p.num)
                        || (typeof p.alt === 'number' && keep.has(p.alt)));
                }
            }
        } catch (_) {}

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
        // INTERSECTION ONLY: a pair counts as "contributing" — and is
        // therefore highlighted/listed — only if it landed numbers in BOTH
        // T2 AND T3 picks. A pair that drove T2 alone (or T3 alone) is
        // weak evidence and was confusing in the UI (e.g. PP-1 showing on
        // T2 but not T3). Trim both detail maps to the intersection so the
        // chip lists, highlight, and per-pair details all stay in sync.
        const _t2Keys = new Set(Object.keys(t2DetailsByPair));
        const _t3Keys = new Set(Object.keys(t3DetailsByPair));
        const _bothSet = new Set([..._t2Keys].filter(k => _t3Keys.has(k)));
        Object.keys(t2DetailsByPair).forEach(k => { if (!_bothSet.has(k)) delete t2DetailsByPair[k]; });
        Object.keys(t3DetailsByPair).forEach(k => { if (!_bothSet.has(k)) delete t3DetailsByPair[k]; });
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
