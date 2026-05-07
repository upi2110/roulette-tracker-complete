/**
 * Strategy-Lab — Pair-Intersection Strategy (V1.3)
 *
 * SHARED source-of-truth for both Auto Test (method='test') and live
 * mode (decisionMode='test'). Mirrors V6's per-ref auto-selection so
 * the bet is the same intersection the live AI panel computes.
 *
 * Algorithm (per spin, after the session-start pair lock):
 *   1. For each of T1, T2, T2_13opp: auto-select 2 "primary" refs
 *      (the refs that recently HIT for this pair on this table) and
 *      one "extra" ref (the ref that did not).
 *   2. Compute the per-ref number sets (engine._getExpandTargetsToBet
 *      Numbers with ±1 ring for T1, ±2 for T2). Per-pair-per-table:
 *         primary = union of selected primary refs' numbers
 *         extra   = the extra ref's numbers
 *   3. (T3 removed in Phase 2 — Test Lab now intersects only T1 ∩ T2
 *      ∩ T2_13opp. The 3T-Selection variant retains the T3 source.)
 *   4. Build pairSets   = [T1.primary, T2.primary, T2_13opp.primary]
 *      Build extendedSets = [T1.primary∪extra, T2.primary∪extra,
 *                            T2_13opp.primary∪extra]
 *   5. primaryIntersection  = ∩ pairSets
 *      extendedIntersection = ∩ extendedSets
 *   6. Bet:
 *         includeGrey = false → bet = primaryIntersection
 *         includeGrey = true  → bet = extendedIntersection
 *      (Empty intersection → SKIP for that spin.)
 *
 * Pair lock: caller picks once at session start via selectBestPair()
 * and reuses for every spin in the session. selectBestPair returns the
 * engine refKey ('prev_plus_1' etc.); decideStrategyLab translates to
 * camelCase pairKey ('prevPlus1') internally for the per-ref logic.
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.StrategyLab = api;
        window.selectBestPairForStrategyLab = api.selectBestPair;
        window.decideStrategyLab = api.decideStrategyLab;
    }
}(this, function () {

    // refKey (snake_case, engine pair-model key) → camelCase pairKey used
    // by the table renderer + AI panel + auto-ref selection logic.
    const REFKEY_TO_PAIR = {
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

    // Valid hit-codes per table — must match
    // app/renderer-3tables.js getAutoSelectedRefs.
    const TABLE1_VALID = ['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1'];
    const TABLE2_VALID = [...TABLE1_VALID, 'SL+2', 'SR+2', 'OL+2', 'OR+2'];

    // ─────────────────────────────────────────────────────────────
    //  Pair selection
    // ─────────────────────────────────────────────────────────────

    function selectBestPair(engine) {
        if (!engine || !engine.pairModels) return null;
        let bestKey = null;
        let bestRate = -Infinity;
        for (const refKey of Object.keys(engine.pairModels)) {
            const m = engine.pairModels[refKey];
            if (!m) continue;
            const rate = (typeof m.hitRate === 'number') ? m.hitRate
                       : (typeof m.winRate === 'number') ? m.winRate
                       : -Infinity;
            if (rate > bestRate) { bestRate = rate; bestKey = refKey; }
        }
        return bestKey;
    }

    // ─────────────────────────────────────────────────────────────
    //  Pair refNum derivation — ports the renderer's pair table
    //  ('prev', 'prevPlus1', …) to a refNum given the spin history.
    //  spinAt = spins[i] (the row whose actual we are checking)
    //  prevAt = spins[i - 1]
    //  twoAgoAt = spins[i - 2]  (only used for prevPrev family)
    // ─────────────────────────────────────────────────────────────

    function _refNumFor(basePairKey, prevAt, twoAgoAt) {
        switch (basePairKey) {
            case 'ref0':            return 0;
            case 'ref19':           return 19;
            case 'prev':            return prevAt;
            case 'prevPlus1':       return Math.min(prevAt + 1, 36);
            case 'prevMinus1':      return Math.max(prevAt - 1, 0);
            case 'prevPlus2':       return Math.min(prevAt + 2, 36);
            case 'prevMinus2':      return Math.max(prevAt - 2, 0);
            case 'prevPrev':        return (typeof twoAgoAt === 'number') ? twoAgoAt : null;
            case 'prevPrevPlus1':   return (typeof twoAgoAt === 'number') ? Math.min(twoAgoAt + 1, 36) : null;
            case 'prevPrevMinus1':  return (typeof twoAgoAt === 'number') ? Math.max(twoAgoAt - 1, 0) : null;
            case 'prevPrevPlus2':   return (typeof twoAgoAt === 'number') ? Math.min(twoAgoAt + 2, 36) : null;
            case 'prevPrevMinus2':  return (typeof twoAgoAt === 'number') ? Math.max(twoAgoAt - 2, 0) : null;
            default:                return null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Auto-selected refs — port of app/renderer-3tables.js
    //  getAutoSelectedRefs(). Walks back through the spin history
    //  finding which 2 of {first, second, third} target columns
    //  recently HIT for this pair on this table. The remaining one
    //  is the "extra" (= grey) ref.
    // ─────────────────────────────────────────────────────────────

    function _autoSelectedRefs(engine, spins, idx, pairKey, tableId) {
        const is13Opp = pairKey.endsWith('_13opp');
        const basePairKey = pairKey.replace('_13opp', '');
        const validCodes = (tableId === 'table1') ? TABLE1_VALID : TABLE2_VALID;
        const foundRefs = [];

        // i must have prev (i-1) and (for prevPrev family) i-2 available.
        for (let i = idx - 1; i >= 1 && foundRefs.length < 2; i--) {
            const actual = spins[i];
            const prev   = spins[i - 1];
            const twoAgo = (i >= 2) ? spins[i - 2] : null;

            let refNum = _refNumFor(basePairKey, prev, twoAgo);
            if (refNum === null) continue;
            if (is13Opp) refNum = engine._getDigit13Opposite(refNum);
            if (typeof refNum !== 'number') continue;

            const lookupRow = engine._getLookupRow(refNum);
            if (!lookupRow) continue;

            const targets = { first: lookupRow.first, second: lookupRow.second, third: lookupRow.third };
            for (const refKey of ['first', 'second', 'third']) {
                if (foundRefs.includes(refKey)) continue;
                const target = targets[refKey];
                if (typeof target !== 'number') continue;
                const code = engine._getCalculatePositionCode(target, actual);
                if (code === 'XX') continue;
                if (!validCodes.includes(code)) continue;
                foundRefs.push(refKey);
                if (foundRefs.length >= 2) break;
            }
        }

        // Fallback: if fewer than 2 found, fill in column order.
        for (const col of ['first', 'second', 'third']) {
            if (foundRefs.length >= 2) break;
            if (!foundRefs.includes(col)) foundRefs.push(col);
        }
        const extraRef = ['first', 'second', 'third'].find(c => !foundRefs.includes(c));
        return { primaryRefs: new Set(foundRefs), extraRef };
    }

    // ─────────────────────────────────────────────────────────────
    //  Per-table-per-pair number sets at idx.
    //  Mirrors getTable1NextProjections / getTable2NextProjections:
    //  one number set per ref ({first/second/third}.numbers) where
    //  numbers = expandTargetsToBetNumbers([target], neighborRange).
    // ─────────────────────────────────────────────────────────────

    function _tableProjectionsForPair(engine, spins, idx, basePairKey, neighborRange) {
        if (!Array.isArray(spins) || idx < 1) return null;
        const lastSpin = spins[idx - 1];
        const prevPrev = (idx >= 2) ? spins[idx - 2] : null;

        const refNum = _refNumFor(basePairKey, lastSpin, prevPrev);
        if (refNum === null || typeof refNum !== 'number') return null;
        const opp = engine._getDigit13Opposite(refNum);
        const refLookup = engine._getLookupRow(refNum);
        const oppLookup = engine._getLookupRow(opp);

        const out = {};
        if (refLookup) {
            out.pair = {};
            for (const refKey of ['first', 'second', 'third']) {
                const target = refLookup[refKey];
                const numbers = (typeof target === 'number')
                    ? engine._getExpandTargetsToBetNumbers([target], neighborRange)
                    : [];
                out.pair[refKey] = new Set(numbers || []);
            }
        }
        if (oppLookup) {
            out.opp = {};
            for (const refKey of ['first', 'second', 'third']) {
                const target = oppLookup[refKey];
                const numbers = (typeof target === 'number')
                    ? engine._getExpandTargetsToBetNumbers([target], neighborRange)
                    : [];
                out.opp[refKey] = new Set(numbers || []);
            }
        }
        return out;
    }

    function _unionSets(sets) {
        const out = new Set();
        for (const s of sets) {
            if (!s) continue;
            for (const n of s) out.add(n);
        }
        return out;
    }

    function _intersectSets(sets) {
        if (!sets || sets.length === 0) return [];
        for (const s of sets) {
            if (!s || s.size === 0) return [];
        }
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
     * Build the pair-source sets for the locked pair, returning both
     * primary-only sets and primary+extra ("extended") sets per pair-
     * source. Mirrors V6 in app/ai-prediction-panel.js getPredictions().
     */
    function _buildPairSources(engine, spins, idx, refKey) {
        // Phase 2 — accept either half of a 13-opposite pair as the
        // locked refKey. _tableProjectionsForPair always returns
        // {pair, opp} where `pair` = projection at refNum and
        // `opp` = projection at digit-13-opposite(refNum). When the
        // locked half is _13opp we swap roles so T1 reads from .opp
        // and T2_13opp reads from .pair.
        //
        // SPECIAL CASE — ref0 / ref19:
        //   By user spec these are mutual 13-opposites: ref0 ↔ ref19.
        //   But mathematically DIGIT_13_OPPOSITES[0]=34 (≠19) and
        //   DIGIT_13_OPPOSITES[19]=13 (≠0). The default code path
        //   would therefore project ref0's "opp" at refNum=34 and
        //   ref19's "opp" at refNum=13 — both wrong, producing empty
        //   intersections vs V6's panel cascade (which correctly
        //   uses ref19 = refNum 19 as ref0's 13-opp twin).
        //   Fix: build projections explicitly using refNum=0 and
        //   refNum=19 for these two pair-keys, bypassing the
        //   digit-13-opposite logic.
        const buildProjFromRow = (row, neighborRange) => {
            const out = {};
            for (const k of ['first','second','third']) {
                const tgt = row && row[k];
                const nums = (typeof tgt === 'number')
                    ? engine._getExpandTargetsToBetNumbers([tgt], neighborRange)
                    : [];
                out[k] = new Set(nums || []);
            }
            return out;
        };

        let baseKeyRaw, isOppLock;
        let t1ProjRaw, t2ProjRaw;
        let baseCamel, oppCamel;

        if (refKey === 'ref0' || refKey === 'ref19') {
            const lockedNum = (refKey === 'ref0') ? 0 : 19;
            const oppNum    = (refKey === 'ref0') ? 19 : 0;
            const lockedRow = engine._getLookupRow(lockedNum);
            const oppRow    = engine._getLookupRow(oppNum);
            if (!lockedRow || !oppRow) return null;
            // Pair = locked side, opp = mutual partner. NO swap.
            t1ProjRaw = { pair: buildProjFromRow(lockedRow, 1), opp: buildProjFromRow(oppRow, 1) };
            t2ProjRaw = { pair: buildProjFromRow(lockedRow, 2), opp: buildProjFromRow(oppRow, 2) };
            baseKeyRaw = refKey;
            isOppLock  = false;
            baseCamel  = refKey;
            oppCamel   = (refKey === 'ref0') ? 'ref19' : 'ref0';
        } else {
            if (typeof refKey === 'string' && refKey.endsWith('_13opp')) {
                baseKeyRaw = refKey.slice(0, -'_13opp'.length);
                isOppLock  = true;
            } else {
                baseKeyRaw = refKey;
                isOppLock  = false;
            }
            baseCamel = REFKEY_TO_PAIR[baseKeyRaw] || baseKeyRaw;
            oppCamel  = baseCamel + '_13opp';
            t1ProjRaw = _tableProjectionsForPair(engine, spins, idx, baseCamel, 1);
            t2ProjRaw = _tableProjectionsForPair(engine, spins, idx, baseCamel, 2);
        }
        if (!t1ProjRaw || !t1ProjRaw.pair) return null;
        if (!t2ProjRaw || !t2ProjRaw.pair || !t2ProjRaw.opp) return null;

        const t1Proj = isOppLock
            ? { pair: t1ProjRaw.opp, opp: t1ProjRaw.pair }
            : t1ProjRaw;
        const t2Proj = isOppLock
            ? { pair: t2ProjRaw.opp, opp: t2ProjRaw.pair }
            : t2ProjRaw;
        const camelPair = baseCamel;
        const opp13Pair = oppCamel;

        // T3 removed from Test-Lab intersection (Phase 2). The strategy
        // now intersects only T1 ∩ T2 ∩ T2_13opp; T3 is no longer used
        // here. The 3T-Selection copy still uses T3 — change scoped to
        // Test Lab only.

        // Per-source primary/extra split using auto-ref selection. The
        // pair-key passed here drives history-walking inside
        // getAutoSelectedRefs, so use the locked side for T1 + T2 and
        // the opposite side for T2_13opp.
        const t1PairKey = isOppLock ? oppCamel  : baseCamel;
        const t2OppKey  = isOppLock ? baseCamel : oppCamel;
        const a1   = _autoSelectedRefs(engine, spins, idx, t1PairKey, 'table1');
        const a2   = _autoSelectedRefs(engine, spins, idx, t1PairKey, 'table2');
        const a2op = _autoSelectedRefs(engine, spins, idx, t2OppKey,  'table2');

        const t1Primary = _unionSets([...a1.primaryRefs].map(r => t1Proj.pair[r]));
        const t1Extra   = t1Proj.pair[a1.extraRef] || new Set();
        const t2Primary = _unionSets([...a2.primaryRefs].map(r => t2Proj.pair[r]));
        const t2Extra   = t2Proj.pair[a2.extraRef] || new Set();
        const t2oppPrim = _unionSets([...a2op.primaryRefs].map(r => t2Proj.opp[r]));
        const t2oppExtr = t2Proj.opp[a2op.extraRef] || new Set();

        return {
            primary: {
                t1:       t1Primary,
                t2:       t2Primary,
                t2_13opp: t2oppPrim
            },
            extended: {
                t1:       _unionSets([t1Primary, t1Extra]),
                t2:       _unionSets([t2Primary, t2Extra]),
                t2_13opp: _unionSets([t2oppPrim, t2oppExtr])
            },
            // Surfaced for debug / tests.
            autoRefs: { t1: a1, t2: a2, t2_13opp: a2op }
        };
    }

    // ─────────────────────────────────────────────────────────────
    //  Decide
    // ─────────────────────────────────────────────────────────────

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

        const sources = _buildPairSources(engine, spins, idx, refKey);
        if (!sources) return skip('Strategy-Lab: no projection for locked pair');

        const includeGrey = (ctx && typeof ctx.includeGrey === 'boolean') ? ctx.includeGrey : true;
        const setList = includeGrey
            ? [sources.extended.t1, sources.extended.t2, sources.extended.t2_13opp]
            : [sources.primary.t1,  sources.primary.t2,  sources.primary.t2_13opp];

        const intersection = _intersectSets(setList);
        if (intersection.length === 0) {
            return skip(`Strategy-Lab: empty intersection (grey ${includeGrey ? 'ON' : 'OFF'})`);
        }

        const pairName = REFKEY_TO_PAIR[refKey] || refKey;
        return {
            action: 'BET',
            selectedPair: pairName,
            selectedFilter: null,
            numbers: intersection,
            confidence: 100,
            reason: `Strategy-Lab pair=${pairName} bet=${intersection.length} (grey ${includeGrey ? 'ON, primary+extra' : 'OFF, primary only'})`
        };
    }

    return {
        selectBestPair: selectBestPair,
        decideStrategyLab: decideStrategyLab,
        // Exposed for tests.
        _refNumFor: _refNumFor,
        _autoSelectedRefs: _autoSelectedRefs,
        _tableProjectionsForPair: _tableProjectionsForPair,
        _buildPairSources: _buildPairSources,
        _intersectSets: _intersectSets,
        _unionSets: _unionSets,
        REFKEY_TO_PAIR: REFKEY_TO_PAIR
    };
}));
