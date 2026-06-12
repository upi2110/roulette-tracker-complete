/**
 * Manual-Enhance Strategy — auto-selection helper for Manual mode.
 *
 * NOT a decision strategy (does not call decide()). Instead, when the
 * user picks a pair from Table 3 while the Manual-Enhance sub-mode is
 * active, this module returns the auto-cascade of T1/T2 pair selections
 * dictated by the user's two "variable" toggles.
 *
 * Behaviour summary:
 *   • T2 toggle ON  → auto-select BOTH the pair AND its `_13opp` in T2.
 *   • T1 toggle ON  → auto-select ONLY the side whose latest spin
 *     produced a valid T1 code (S+0, SL±1, O+0, OL±1, OR+1, SR+1).
 *     "Valid" = code is one of those 6 (i.e. distance ≤ 1, non-XX).
 *     • If pair's ref column is valid → select pair.
 *     • Else if 13opp column is valid → select pair_13opp.
 *     • Else (both XX) → do not add anything for T1.
 *   • Both toggles ON → both rules apply.
 *
 * Both T1 hits in the SAME latest row never happens (only one of the
 * two columns can produce a valid code at any given row by the table's
 * construction), so we don't tie-break.
 *
 * The strategy is purely a pair-selection helper — the existing
 * AI Prediction Panel math then computes the intersection across the
 * selected pairs as it always does.
 */
(function () {
    'use strict';

    // The 6 T1-valid position codes — distance ≤ 1.
    const T1_VALID_CODES = new Set(['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1']);

    /**
     * Compute auto-cascade selections.
     *
     * @param {object} opts
     * @param {string} opts.t3Pair      camelCase pair the user picked in T3 (e.g. 'prev').
     * @param {boolean} opts.t1On       T1 variable toggle state.
     * @param {boolean} opts.t2On       T2 variable toggle state.
     * @param {object}  opts.engine     window.aiAutoEngine — for position-code helpers.
     * @param {number[]} opts.spins     Plain spin numbers (latest at end).
     * @returns {{t1: string[], t2: string[]}}
     *   t1 → array of camelCase pair keys to select in Table 1
     *        (zero or one element).
     *   t2 → array of camelCase pair keys to select in Table 2
     *        (zero or two elements: [pair, pair_13opp]).
     */
    function getAutoSelections(opts) {
        const t3Pair = opts && opts.t3Pair;
        if (typeof t3Pair !== 'string' || !t3Pair) return { t1: [], t2: [] };

        const result = { t1: [], t2: [] };

        // T2 — both sides if toggle on. Simple, deterministic.
        if (opts.t2On) {
            result.t2 = [t3Pair, t3Pair + '_13opp'];
        }

        // T1 — pick the side that has a valid (non-XX, dist ≤ 1) code
        // at the latest row.
        if (opts.t1On) {
            const t1Pair = _pickT1Side(t3Pair, opts.engine, opts.spins);
            if (t1Pair) result.t1 = [t1Pair];
        }

        return result;
    }

    function _pickT1Side(t3Pair, engine, spins) {
        if (!engine || !Array.isArray(spins) || spins.length < 2) return null;
        if (typeof engine._getCalculateReferences !== 'function') return null;
        if (typeof engine._getCalculatePositionCode !== 'function') return null;
        if (typeof engine._getDigit13Opposite !== 'function') return null;

        // Map camelCase → engine snake_case for refs lookup.
        const refKey = _toSnake(t3Pair);

        let refs;
        try {
            refs = engine._getCalculateReferences(spins[spins.length - 1], spins[spins.length - 2]);
        } catch (_) { return null; }
        if (!refs) return null;

        const refNum = refs[refKey];
        if (typeof refNum !== 'number') return null;

        let opp = null;
        try { opp = engine._getDigit13Opposite(refNum); } catch (_) { /* ignore */ }

        const latest = spins[spins.length - 1];
        const codeRef = _safeCode(engine, refNum, latest);
        const codeOpp = (typeof opp === 'number') ? _safeCode(engine, opp, latest) : null;

        if (codeRef && T1_VALID_CODES.has(codeRef)) return t3Pair;
        if (codeOpp && T1_VALID_CODES.has(codeOpp)) return t3Pair + '_13opp';
        return null;
    }

    function _safeCode(engine, refNum, actual) {
        try { return engine._getCalculatePositionCode(refNum, actual); }
        catch (_) { return null; }
    }

    function _toSnake(camel) {
        return camel.replace(/([a-z])([A-Z0-9])/g, (_, a, b) => a + '_' + b.toLowerCase());
    }

    const api = {
        getAutoSelections: getAutoSelections,
        T1_VALID_CODES: T1_VALID_CODES,
        // exposed for tests
        _pickT1Side: _pickT1Side,
        _toSnake: _toSnake
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.ManualEnhanceStrategy = api;
    }
})();
