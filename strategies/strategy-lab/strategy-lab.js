/**
 * Strategy-Lab — Pair-Intersection Strategy (V1)
 *
 * SHARED source-of-truth for both Auto Test (method='test') and live
 * mode (decisionMode='test'). Both contexts call the SAME functions in
 * this module with the same signature, guaranteeing 100% parity:
 *
 *   - selectBestPair(engine)
 *       → returns the pair refKey with the highest training hit-rate
 *         (engine.pairModels[refKey].hitRate). Called once at session
 *         start; the caller then stores the locked refKey and reuses
 *         it for every spin in the session.
 *
 *   - decideStrategyLab(engine, spins, idx, ctx)
 *       → ctx = { lockedPairRefKey, includeGrey, greyNumbers }
 *       → returns { action, selectedPair, selectedFilter, numbers,
 *                   confidence, reason } matching the AutoTestRunner's
 *         _simulateDecision shape so existing P&L / recordResult /
 *         step-logging plumbing is unchanged.
 *
 * Algorithm (V1):
 *   1. Caller passes a session-locked pair refKey (selected by
 *      selectBestPair at session start).
 *   2. Compute the engine's pair projection at idx:
 *          proj = engine._computeProjectionForPair(spins, idx, refKey)
 *      → { numbers, anchors (purple), neighbors (green) }
 *   3. Build four "column" number sets that mirror the table-renderer's
 *      T1 / T2 / T3 projections for the locked pair:
 *          T1[pair]      = expandAnchorsToBetNumbers(purple, []) ±1
 *          T2[pair]      = expandTargetsToBetNumbers(purple, 2)
 *          T2[pair_13op] = expandTargetsToBetNumbers(green,  2)
 *          T3[pair]      = proj.numbers (purple+green ±1, full set)
 *   4. Bet = T1 ∩ T2[pair] ∩ T2[13opp] ∩ T3.
 *   5. If !ctx.includeGrey, remove ctx.greyNumbers from the result.
 *   6. If the result is empty → SKIP (no bet placed this spin).
 *
 * This is V1; we will iterate as testing reveals what works. The
 * algorithm intentionally does NOT use the engine's session
 * confidence / filter / set-prediction heuristics — the locked pair
 * IS the strategy. Confidence is reported as 100 when a non-empty
 * intersection exists (the strategy itself has no probabilistic
 * gate), so the runner's downstream confidence threshold is bypassed
 * for this method.
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.StrategyLab = api;
        // Convenience aliases used by the live orchestrator + AT runner.
        window.selectBestPairForStrategyLab = api.selectBestPair;
        window.decideStrategyLab = api.decideStrategyLab;
    }
}(this, function () {

    /**
     * Pick the pair refKey with the highest training hit-rate.
     *
     * @param {Object} engine - Trained AIAutoEngine instance.
     * @returns {string|null} refKey, or null if no pair has a model.
     */
    function selectBestPair(engine) {
        if (!engine || !engine.pairModels) return null;
        let bestKey = null;
        let bestRate = -Infinity;
        for (const refKey of Object.keys(engine.pairModels)) {
            const m = engine.pairModels[refKey];
            if (!m) continue;
            // Accept either hitRate (legacy) or winRate (newer naming).
            const rate = (typeof m.hitRate === 'number') ? m.hitRate
                       : (typeof m.winRate === 'number') ? m.winRate
                       : -Infinity;
            if (rate > bestRate) {
                bestRate = rate;
                bestKey = refKey;
            }
        }
        return bestKey;
    }

    /**
     * Build the per-table source number sets for the locked pair.
     *
     * The include-grey toggle changes WHICH source sets participate and
     * how WIDE they are — not what gets tacked on at the end. So we
     * return both the "tight" (no-grey) and "wide" (with-grey) variants
     * and let the caller pick based on the toggle:
     *
     *   includeGrey = false → bet = T1.tight ∩ T2.tight ∩ T3.tight
     *     (the pair's purple-side anchors only, no 13-opp half).
     *
     *   includeGrey = true  → bet = T1.wide ∩ T2.wide ∩ T2_13opp.wide ∩ T3.wide
     *     (the pair's full prediction = purple + green expanded; T2's
     *      13-opp half participates as a fourth source).
     *
     * Same engine helpers are used for both variants so AT and live
     * produce identical numbers for the same spin history.
     */
    function _computeColumnSources(engine, spins, idx, refKey) {
        const proj = engine._computeProjectionForPair(spins, idx, refKey);
        if (!proj || !proj.numbers || proj.numbers.length === 0) return null;

        const purple = proj.anchors || [];
        const green  = proj.neighbors || [];

        // ── TIGHT (no-grey) sources: purple-only ──
        const t1Tight = engine._getExpandAnchorsToBetNumbers(purple, []) || [];
        const t2Tight = (purple.length > 0)
            ? (engine._getExpandTargetsToBetNumbers(purple, 2) || [])
            : [];
        const t3Tight = engine._getExpandAnchorsToBetNumbers(purple, []) || [];

        // ── WIDE (with-grey) sources: purple + green ──
        const t1Wide = engine._getExpandAnchorsToBetNumbers(purple, green) || [];
        const t2Wide = (purple.length > 0)
            ? (engine._getExpandTargetsToBetNumbers(purple, 2) || [])
            : [];
        const t2_13oppWide = (green.length > 0)
            ? (engine._getExpandTargetsToBetNumbers(green, 2) || [])
            : [];
        const t3Wide = proj.numbers.slice();

        return {
            tight: {
                t1: new Set(t1Tight),
                t2: new Set(t2Tight),
                t3: new Set(t3Tight)
            },
            wide: {
                t1: new Set(t1Wide),
                t2: new Set(t2Wide),
                t2_13opp: new Set(t2_13oppWide),
                t3: new Set(t3Wide)
            }
        };
    }

    /**
     * Intersection of an arbitrary array of Sets. If any source is empty
     * the result is empty — an absent source means "this column has no
     * candidates", which strictly excludes everything.
     */
    function _intersectSets(sets) {
        if (!sets || sets.length === 0) return [];
        for (const s of sets) {
            if (!s || s.size === 0) return [];
        }
        // Start from the smallest set for efficiency.
        const sorted = sets.slice().sort((a, b) => a.size - b.size);
        const out = [];
        for (const n of sorted[0]) {
            let inAll = true;
            for (let i = 1; i < sorted.length; i++) {
                if (!sorted[i].has(n)) { inAll = false; break; }
            }
            if (inAll) out.push(n);
        }
        return out;
    }

    /**
     * Decide for one spin.
     *
     * @param {Object} engine
     * @param {number[]} spins - Spin history up to and including idx-1.
     * @param {number} idx - Current decision index.
     * @param {Object} ctx
     * @param {string} ctx.lockedPairRefKey - Pair locked at session start.
     * @param {boolean} [ctx.includeGrey=true] - Whether to keep grey
     *     numbers in the bet. When false, ctx.greyNumbers are removed.
     * @param {number[]|Set<number>} [ctx.greyNumbers] - Grey numbers
     *     reported by the caller (live: wheel.extraLoose+extraAnchors;
     *     AT: V1 passes [] — strategy treats as no greys).
     * @returns {{action, selectedPair, selectedFilter, numbers, confidence, reason}}
     */
    function decideStrategyLab(engine, spins, idx, ctx) {
        const skip = (reason) => ({
            action: 'SKIP',
            selectedPair: null,
            selectedFilter: null,
            numbers: [],
            confidence: 0,
            reason: reason
        });

        if (!engine || !Array.isArray(spins) || idx < 3) {
            return skip('Insufficient history');
        }

        const refKey = ctx && ctx.lockedPairRefKey;
        if (!refKey) {
            return skip('Strategy-Lab: no locked pair (call selectBestPair at session start)');
        }

        const cols = _computeColumnSources(engine, spins, idx, refKey);
        if (!cols) return skip('Strategy-Lab: no projection for locked pair');

        // ── INCLUDE-GREY SEMANTICS ──
        // The toggle changes WHICH sources are intersected and how WIDE
        // each source is. The bet is always the intersection — never a
        // raw append.
        //   OFF: T1.tight ∩ T2.tight ∩ T3.tight (purple-only, 3 sources)
        //   ON : T1.wide ∩ T2.wide ∩ T2_13opp.wide ∩ T3.wide
        //        (full purple+green, 4 sources — the 13-opp half joins).
        const includeGrey = (ctx && typeof ctx.includeGrey === 'boolean') ? ctx.includeGrey : true;
        const sources = includeGrey
            ? [cols.wide.t1, cols.wide.t2, cols.wide.t2_13opp, cols.wide.t3]
            : [cols.tight.t1, cols.tight.t2, cols.tight.t3];

        let intersection = _intersectSets(sources);

        if (intersection.length === 0) {
            return skip('Strategy-Lab: empty intersection for locked pair');
        }

        // The pair name surfaced to UI / reports must be the camelCase
        // form the AI panel + tables use ('prevPlus1', 'prevPrevMinus1'),
        // NOT the engine's snake_case refKey ('prev_plus_1'), otherwise
        // _handleTable3Selection silently fails to highlight the column
        // and the live-test cascade never auto-selects the locked pair.
        // Inlined map mirrors REFKEY_TO_PAIR_NAME in
        // services/ai-auto-engine/ai-auto-engine.js so this module stays
        // self-contained for both browser and Node test contexts.
        const REFKEY_TO_PAIR_NAME_LOCAL = {
            'prev':              'prev',
            'prev_plus_1':       'prevPlus1',
            'prev_minus_1':      'prevMinus1',
            'prev_plus_2':       'prevPlus2',
            'prev_minus_2':      'prevMinus2',
            'prev_prev':         'prevPrev',
            'prev_prev_plus_1':  'prevPrevPlus1',
            'prev_prev_minus_1': 'prevPrevMinus1',
            'prev_prev_plus_2':  'prevPrevPlus2',
            'prev_prev_minus_2': 'prevPrevMinus2'
        };
        const pairName = REFKEY_TO_PAIR_NAME_LOCAL[refKey] || refKey;

        return {
            action: 'BET',
            selectedPair: pairName,
            selectedFilter: null,
            numbers: intersection,
            confidence: 100,
            reason: `Strategy-Lab pair=${pairName} bet=${intersection.length} ${includeGrey ? '(grey: ON, 4-source ∩)' : '(grey: OFF, 3-source ∩)'}`
        };
    }

    return {
        selectBestPair: selectBestPair,
        decideStrategyLab: decideStrategyLab,
        // Exposed for tests.
        _computeColumnSources: _computeColumnSources,
        _intersectSets: _intersectSets
    };
}));
