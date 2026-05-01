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
     * Build the four "column" number sets for the locked pair using
     * engine internals so AT and live produce identical results.
     */
    function _computeFourColumnNumbers(engine, spins, idx, refKey) {
        const proj = engine._computeProjectionForPair(spins, idx, refKey);
        if (!proj || !proj.numbers || proj.numbers.length === 0) return null;

        const purple = proj.anchors || [];
        const green  = proj.neighbors || [];

        // T1 pair half: anchors only, ±1 neighbor expansion.
        const t1Pair = engine._getExpandAnchorsToBetNumbers(purple, []) || [];
        // T2 pair half: pair-side targets expanded ±2.
        const t2Pair = (purple.length > 0)
            ? (engine._getExpandTargetsToBetNumbers(purple, 2) || [])
            : [];
        // T2 13-opp half: 13-opp-side targets expanded ±2.
        const t2_13opp = (green.length > 0)
            ? (engine._getExpandTargetsToBetNumbers(green, 2) || [])
            : [];
        // T3 pair: full pair prediction (anchors + neighbors merged).
        const t3Pair = proj.numbers || [];

        return {
            t1Pair: new Set(t1Pair),
            t2Pair: new Set(t2Pair),
            t2_13opp: new Set(t2_13opp),
            t3Pair: new Set(t3Pair)
        };
    }

    /**
     * Intersection of four number sets.
     */
    function _intersectFour(a, b, c, d) {
        const out = [];
        for (const n of a) {
            if (b.has(n) && c.has(n) && d.has(n)) out.push(n);
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

        const cols = _computeFourColumnNumbers(engine, spins, idx, refKey);
        if (!cols) return skip('Strategy-Lab: no projection for locked pair');

        let intersection = _intersectFour(cols.t1Pair, cols.t2Pair, cols.t2_13opp, cols.t3Pair);

        const includeGrey = (ctx && typeof ctx.includeGrey === 'boolean') ? ctx.includeGrey : true;
        if (!includeGrey && ctx && ctx.greyNumbers) {
            const greySet = (ctx.greyNumbers instanceof Set)
                ? ctx.greyNumbers
                : new Set(ctx.greyNumbers);
            intersection = intersection.filter((n) => !greySet.has(n));
        }

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
            reason: `Strategy-Lab pair=${pairName} ∩(T1,T2,T2_13opp,T3)=${intersection.length}${includeGrey ? '' : ' (grey filtered)'}`
        };
    }

    return {
        selectBestPair: selectBestPair,
        decideStrategyLab: decideStrategyLab,
        // Exposed for tests.
        _computeFourColumnNumbers: _computeFourColumnNumbers,
        _intersectFour: _intersectFour
    };
}));
