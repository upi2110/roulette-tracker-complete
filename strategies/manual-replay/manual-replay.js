/**
 * Manual Replay — pure prediction math for Auto-Test "manual-test" mode.
 *
 * What this module is
 * --------------------
 * A self-contained re-implementation of the math the live AI Prediction
 * panel uses when the user is in manual mode (i.e. the user has clicked
 * pair headers in T1 / T2 / T3 and the panel computes the intersection
 * of those pairs' projections).
 *
 * Why it exists
 * -------------
 * The Auto Test runner cannot call the live UI's getPredictions() because
 * that function reads window.spins, the rendered tables, and a handful of
 * other DOM-coupled globals. Running a backtest needs the SAME math but
 * driven from an arbitrary spin history (the loaded test file). Re-using
 * engine internals via strategy-lab's _buildPairSources turned out to be
 * fragile (caused Electron blank-screen crashes during a run).
 *
 * Parity guarantee
 * ----------------
 * Every helper here is a byte-for-byte copy of the corresponding
 * function in:
 *   - app/renderer-3tables.js  (calculateReferences, calculatePositionCode,
 *                               getNumberAtPosition, generateAnchors,
 *                               expandAnchorsToBetNumbers,
 *                               expandTargetsToBetNumbers, ...)
 *   - roulette-wheel/table-lookup.js (LOOKUP_TABLE, getLookupRow)
 *
 * The only difference is that everything takes `spinHistory` as an
 * explicit parameter instead of reading window.spins, and nothing
 * writes to window globals or the DOM.
 *
 * If the live functions are ever changed, this file must be updated
 * in lockstep — otherwise live and backtest will diverge. The
 * comments next to each copied helper name the source function.
 */

(function (root) {
    'use strict';

    // ── Constants (verbatim from renderer-3tables.js / table-lookup.js) ──
    const WHEEL_NO_ZERO = [26,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const WHEEL_36 = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3];

    const REGULAR_OPPOSITES = {
        0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
        10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
        19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
        28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
    };

    const DIGIT_13_OPPOSITES = {
        0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
        10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
        19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
        28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
    };

    // Lookup table (T1/T2 projections). Verbatim from table-lookup.js.
    const LOOKUP_TABLE = [
        [0,13,20,26],[32,36,14,32],[15,11,31,15],[19,30,9,19],[4,8,22,4],
        [21,23,18,21],[2,10,29,2],[25,5,7,25],[17,24,28,17],[34,16,12,34],
        [6,33,35,6],[27,1,3,27],[13,20,26,13],[36,14,32,36],[11,31,15,11],
        [30,9,19,30],[8,22,4,8],[23,18,21,23],[10,29,2,10],[5,7,25,5],
        [24,28,17,24],[16,12,34,16],[33,35,6,33],[1,3,27,1],[20,26,13,20],
        [14,32,36,14],[31,15,11,31],[9,19,30,9],[22,4,8,22],[18,21,23,18],
        [29,2,10,29],[7,25,5,7],[28,17,24,28],[12,34,16,12],[35,6,33,35],
        [3,27,1,3],[26,13,20,26]
    ];

    function getLookupRow(num) {
        const row = LOOKUP_TABLE.find(r => r[0] === num);
        return row ? { first: row[1], second: row[2], third: row[3] } : null;
    }

    // ── Wheel-distance / position-code math (verbatim) ──
    function calculateWheelDistance(fromIdx, targetNumber, direction) {
        let currentIdx = fromIdx;
        let distance = 0;
        let skippedZero = false;
        for (let i = 0; i < 10; i++) {
            currentIdx = ((currentIdx + direction) % 37 + 37) % 37;
            const currentNum = WHEEL_NO_ZERO[currentIdx];
            if (currentNum === 26 && !skippedZero) {
                skippedZero = true;
                if (targetNumber === 26) { distance++; return distance; }
                continue;
            }
            distance++;
            if (currentNum === targetNumber) return distance;
            if (distance >= 4) break;
        }
        return 999;
    }

    function calculatePositionCode(reference, actual) {
        const refNum = reference === 0 ? 26 : reference;
        const actNum = actual === 0 ? 26 : actual;
        if (refNum === actNum) return 'S+0';
        const refIdx = WHEEL_NO_ZERO.indexOf(refNum);
        const leftDist  = calculateWheelDistance(refIdx, actNum, -1);
        const rightDist = calculateWheelDistance(refIdx, actNum, 1);
        if (leftDist  >= 1 && leftDist  <= 4) return `SL+${leftDist}`;
        if (rightDist >= 1 && rightDist <= 4) return `SR+${rightDist}`;
        const opposite = REGULAR_OPPOSITES[reference];
        const oppNum = opposite === 0 ? 26 : opposite;
        if (actNum === oppNum) return 'O+0';
        const oppIdx = WHEEL_NO_ZERO.indexOf(oppNum);
        const leftDistOpp  = calculateWheelDistance(oppIdx, actNum, -1);
        const rightDistOpp = calculateWheelDistance(oppIdx, actNum, 1);
        if (leftDistOpp  >= 1 && leftDistOpp  <= 4) return `OL+${leftDistOpp}`;
        if (rightDistOpp >= 1 && rightDistOpp <= 4) return `OR+${rightDistOpp}`;
        return 'XX';
    }

    function getNumberAtPosition(refNum, posCode) {
        const ref = refNum === 0 ? 26 : refNum;
        const refIdx = (ref === 26) ? 0 : WHEEL_NO_ZERO.indexOf(ref);
        if (posCode === 'S+0') return refNum;
        if (posCode === 'XX')  return null;
        const match = posCode.match(/^(S|O)(L|R)([+-])(\d+)$/);
        if (!match) {
            if (posCode === 'O+0') return REGULAR_OPPOSITES[refNum];
            return null;
        }
        const [, side, direction, sign, distStr] = match;
        const distance = parseInt(distStr, 10);
        let startIdx;
        if (side === 'S') {
            startIdx = refIdx;
        } else {
            const oppNum = REGULAR_OPPOSITES[refNum];
            const opp = oppNum === 0 ? 26 : oppNum;
            startIdx = (opp === 26) ? 0 : WHEEL_NO_ZERO.indexOf(opp);
        }
        let currentIdx = startIdx;
        let stepsRemaining = distance;
        const moveDirection = (sign === '+')
            ? (direction === 'R' ? 1 : -1)
            : (direction === 'R' ? -1 : 1);
        let skippedZero = false;
        while (stepsRemaining > 0) {
            currentIdx = ((currentIdx + moveDirection) % 37 + 37) % 37;
            const currentNum = WHEEL_NO_ZERO[currentIdx];
            if (currentNum === 26 && !skippedZero) {
                skippedZero = true;
            } else if (currentNum !== 26 || skippedZero) {
                stepsRemaining--;
            }
        }
        const resultNum = WHEEL_NO_ZERO[currentIdx];
        if (resultNum === undefined) return null;
        return resultNum === 26 ? 0 : resultNum;
    }

    function flipPositionCode(posCode) {
        if (posCode === 'XX' || posCode === 'S+0' || posCode === 'O+0') return posCode;
        return posCode.replace(/([+-])/, m => m === '+' ? '-' : '+');
    }

    function generateAnchors(refNum, ref13Opp, prevPosCode) {
        const purpleAnchors = [];
        if (prevPosCode === 'XX') return { purple: [], green: [] };
        const a1 = getNumberAtPosition(refNum,   prevPosCode);
        const a2 = getNumberAtPosition(refNum,   flipPositionCode(prevPosCode));
        const a3 = getNumberAtPosition(ref13Opp, prevPosCode);
        const a4 = getNumberAtPosition(ref13Opp, flipPositionCode(prevPosCode));
        [a1, a2, a3, a4].forEach(a => {
            if (a !== null && !purpleAnchors.includes(a)) purpleAnchors.push(a);
        });
        const greenAnchors = purpleAnchors.map(a => REGULAR_OPPOSITES[a]).filter(a => a !== undefined);
        return { purple: purpleAnchors, green: greenAnchors };
    }

    function getWheel36Index(num) {
        if (num === 26) return 0;
        return WHEEL_36.indexOf(num);
    }
    function getNumbersAtPocket(pocketIdx) {
        const idx = ((pocketIdx % 36) + 36) % 36;
        if (idx === 0) return [0, 26];
        return [WHEEL_36[idx]];
    }
    function expandAnchorsToBetNumbers(purple, green) {
        const out = new Set();
        [...purple, ...green].forEach(a => {
            const idx = getWheel36Index(a);
            if (idx === -1) return;
            for (let off = -1; off <= 1; off++) {
                getNumbersAtPocket(idx + off).forEach(n => out.add(n));
            }
        });
        return Array.from(out);
    }
    function expandTargetsToBetNumbers(targets, neighborRange) {
        const out = new Set();
        targets.forEach(t => {
            const idx = getWheel36Index(t);
            if (idx !== -1) {
                for (let off = -neighborRange; off <= neighborRange; off++) {
                    getNumbersAtPocket(idx + off).forEach(n => out.add(n));
                }
            }
            const opp = REGULAR_OPPOSITES[t];
            if (opp !== undefined) {
                const oppIdx = getWheel36Index(opp);
                if (oppIdx !== -1) {
                    for (let off = -neighborRange; off <= neighborRange; off++) {
                        getNumbersAtPocket(oppIdx + off).forEach(n => out.add(n));
                    }
                }
            }
        });
        return Array.from(out);
    }

    // ── Reference numbers per pair (verbatim from calculateReferences) ──
    function calculateReferences(prev, prevPrev) {
        const refs = { prev: prev, prev_prev: prevPrev };
        if (prev === 36) {
            refs.prev_plus_1 = 35; refs.prev_plus_2 = 34;
            refs.prev_minus_1 = 35; refs.prev_minus_2 = 34;
        } else if (prev === 0) {
            refs.prev_minus_1 = 10; refs.prev_minus_2 = 9;
            refs.prev_plus_1 = 1;   refs.prev_plus_2 = 2;
        } else {
            refs.prev_plus_1  = Math.min(prev + 1, 36);
            refs.prev_plus_2  = Math.min(prev + 2, 36);
            refs.prev_minus_1 = Math.max(prev - 1, 0);
            refs.prev_minus_2 = Math.max(prev - 2, 0);
        }
        if (prevPrev === 36) {
            refs.prev_prev_plus_1 = 35; refs.prev_prev_plus_2 = 34;
            refs.prev_prev_minus_1 = 35; refs.prev_prev_minus_2 = 34;
        } else if (prevPrev === 0) {
            refs.prev_prev_minus_1 = 10; refs.prev_prev_minus_2 = 9;
            refs.prev_prev_plus_1 = 1;   refs.prev_prev_plus_2 = 2;
        } else if (prevPrev != null) {
            refs.prev_prev_plus_1  = Math.min(prevPrev + 1, 36);
            refs.prev_prev_plus_2  = Math.min(prevPrev + 2, 36);
            refs.prev_prev_minus_1 = Math.max(prevPrev - 1, 0);
            refs.prev_prev_minus_2 = Math.max(prevPrev - 2, 0);
        }
        return refs;
    }

    // ── Pair-key → engine-refKey conversion (camelCase ↔ snake_case) ──
    // Live UI uses camelCase (e.g. 'prevPlus1'), engine math here uses
    // snake_case (e.g. 'prev_plus_1'). Bridges both.
    const CAMEL_TO_SNAKE = {
        prev: 'prev', prevPlus1: 'prev_plus_1', prevMinus1: 'prev_minus_1',
        prevPlus2: 'prev_plus_2', prevMinus2: 'prev_minus_2',
        prevPrev: 'prev_prev',
        prevPrevPlus1: 'prev_prev_plus_1', prevPrevMinus1: 'prev_prev_minus_1',
        prevPrevPlus2: 'prev_prev_plus_2', prevPrevMinus2: 'prev_prev_minus_2'
    };

    function _stripHalfSuffix(key) {
        // Returns { base, half } where half ∈ { null, 'pair', '13opp' }.
        // Used for both T1/T2 _13opp keys and T3 _pair / _13opp halves.
        if (typeof key !== 'string') return { base: key, half: null };
        if (key.endsWith('_pair'))  return { base: key.slice(0, -'_pair'.length),  half: 'pair'  };
        if (key.endsWith('_13opp')) return { base: key.slice(0, -'_13opp'.length), half: '13opp' };
        return { base: key, half: null };
    }

    function _refNumForPairKey(refs, baseKey, half) {
        // baseKey is camelCase. Returns the reference number, picking the
        // 13-opposite when half==='13opp', the base ref otherwise.
        if (baseKey === 'ref0')  return half === '13opp' ? 19 : 0;
        if (baseKey === 'ref19') return half === '13opp' ? 0  : 19;
        const snake = CAMEL_TO_SNAKE[baseKey];
        if (!snake) return null;
        const ref = refs[snake];
        if (ref == null) return null;
        return half === '13opp' ? DIGIT_13_OPPOSITES[ref] : ref;
    }

    // ── Auto-ref selection (mirrors app/renderer-3tables.js getAutoSelectedRefs) ──
    // Walks back through spinHistory and picks the FIRST TWO unique refs
    // (first/second/third) whose target produced a valid position code
    // at that historical spin. The remaining ref is the "extra" — only
    // included in the bet when includeGrey is ON. Pure port: same valid-
    // code lists, same chronological walk-back, same fallback to
    // [first, second] when fewer than 2 hits found.
    //
    // Returns { primaryRefs: Set<'first'|'second'|'third'>, extraRef:'first'|'second'|'third'|undefined }.
    function _autoSelectedRefs(spinHistory, baseKey, half, tableId) {
        // is13Opp half tells us which side of the pair to use, applied
        // AFTER computing refNum from the base key.
        const TABLE1_VALID = ['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1'];
        const TABLE2_VALID = TABLE1_VALID.concat(['SL+2', 'SR+2', 'OL+2', 'OR+2']);
        const validCodes = (tableId === 'table1') ? TABLE1_VALID : TABLE2_VALID;

        const foundRefs = [];
        // i = current index (the "actual"); prev = spinHistory[i-1]
        for (let i = spinHistory.length - 1; i >= 1 && foundRefs.length < 2; i--) {
            const actual = spinHistory[i];
            const prev = spinHistory[i - 1];
            const prevPrev = (i >= 2) ? spinHistory[i - 2] : null;

            let refNum;
            switch (baseKey) {
                case 'ref0':       refNum = 0; break;
                case 'ref19':      refNum = 19; break;
                case 'prev':       refNum = prev; break;
                case 'prevPlus1':  refNum = Math.min(prev + 1, 36); break;
                case 'prevMinus1': refNum = Math.max(prev - 1, 0); break;
                case 'prevPlus2':  refNum = Math.min(prev + 2, 36); break;
                case 'prevMinus2': refNum = Math.max(prev - 2, 0); break;
                case 'prevPrev':        refNum = (prevPrev !== null) ? prevPrev : null; break;
                case 'prevPrevPlus1':   refNum = (prevPrev !== null) ? Math.min(prevPrev + 1, 36) : null; break;
                case 'prevPrevMinus1':  refNum = (prevPrev !== null) ? Math.max(prevPrev - 1, 0)  : null; break;
                case 'prevPrevPlus2':   refNum = (prevPrev !== null) ? Math.min(prevPrev + 2, 36) : null; break;
                case 'prevPrevMinus2':  refNum = (prevPrev !== null) ? Math.max(prevPrev - 2, 0)  : null; break;
                default: continue;
            }
            if (refNum == null) continue;
            if (half === '13opp') refNum = DIGIT_13_OPPOSITES[refNum];

            const row = getLookupRow(refNum);
            if (!row) continue;
            const targets = { first: row.first, second: row.second, third: row.third };
            for (const [refKey, target] of Object.entries(targets)) {
                if (foundRefs.includes(refKey)) continue;
                const code = calculatePositionCode(target, actual);
                if (code === 'XX' || !validCodes.includes(code)) continue;
                foundRefs.push(refKey);
                if (foundRefs.length >= 2) break;
            }
        }

        // Fallback to [first, second] order if fewer than 2 hits found.
        for (const col of ['first', 'second', 'third']) {
            if (foundRefs.length >= 2) break;
            if (!foundRefs.includes(col)) foundRefs.push(col);
        }
        const extraRef = ['first', 'second', 'third'].find(c => !foundRefs.includes(c));
        return { primaryRefs: new Set(foundRefs), extraRef };
    }

    // ── T1 / T2 pair number set (mirrors getTable1/2NextProjections) ──
    // Live mode picks 2 of 3 refs as "primary" via _autoSelectedRefs;
    // the 3rd is the "extra/grey" ref, only included when the Include
    // Grey toggle is ON. Pre-Fix-A this function unioned ALL three
    // refs unconditionally, which made every prediction roughly 2×
    // the size it should have been (the source of the auto-vs-live
    // divergence reported in the S4-Start319 comparison).
    function _t12PairSet(spinHistory, baseKey, half, neighborRange, tableId, includeGrey, explicitRefs) {
        if (spinHistory.length < 1) return new Set();
        const last = spinHistory[spinHistory.length - 1];
        const prevPrev = spinHistory.length >= 2 ? spinHistory[spinHistory.length - 2] : null;
        const refs = calculateReferences(last, prevPrev);
        const refNum = _refNumForPairKey(refs, baseKey, half);
        if (refNum == null) return new Set();
        const row = getLookupRow(refNum);
        if (!row) return new Set();

        // Ref selection has two modes:
        //
        // (a) Auto mode — default. When the caller passes no
        //     explicitRefs, fall back to _autoSelectedRefs which walks
        //     spin history and picks the 2 most-recent-hit columns.
        //     The 3rd ref is folded in iff includeGrey is true.
        //
        // (b) Manual override mode — caller passes explicitRefs (an
        //     array or Set of 'first'/'second'/'third' subset). This
        //     is the T1/T2 break path: the user has chosen exactly
        //     which sub-anchors to use, so we IGNORE auto-pick and
        //     IGNORE includeGrey (they have full control). Used for
        //     both the per-pair 1/2/3 sub-toggles in auto-test and,
        //     in future, for any path that wants deterministic refs.
        let refsToUse;
        if (explicitRefs && (Array.isArray(explicitRefs) ? explicitRefs.length : explicitRefs.size) > 0) {
            refsToUse = new Set(Array.isArray(explicitRefs) ? explicitRefs : [...explicitRefs]);
        } else {
            // Auto-ref valid-code set: live ALWAYS uses 'table2' codes
            // for both T1 and T2 auto-ref selection (see
            // _handleTable12PairToggle + _refreshAutoPickedPairs in
            // ui/ai-prediction-panel.js).
            const auto = _autoSelectedRefs(spinHistory, baseKey, half, 'table2');
            refsToUse = new Set(auto.primaryRefs);
            if (includeGrey && auto.extraRef) refsToUse.add(auto.extraRef);
        }

        const out = new Set();
        refsToUse.forEach(k => {
            const target = row[k];
            if (target != null) {
                expandTargetsToBetNumbers([target], neighborRange).forEach(n => out.add(n));
            }
        });
        return out;
    }

    // ── T3 pair number set (mirrors getNextRowProjections in renderer) ──
    function _t3PairSet(spinHistory, baseKey, half, useHalfs) {
        if (spinHistory.length < 2) return new Set();
        const last     = spinHistory[spinHistory.length - 1];
        const lastLast = spinHistory[spinHistory.length - 2];
        const refs = calculateReferences(last, lastLast);
        // prev refs (for derive prev posCode) — exactly as renderTable3 does.
        const prevPrevPrev = spinHistory.length >= 3 ? spinHistory[spinHistory.length - 3] : lastLast;
        const prevRefs = calculateReferences(lastLast, prevPrevPrev);

        const snake = CAMEL_TO_SNAKE[baseKey];
        if (!snake) return new Set();
        const prevRefNum   = prevRefs[snake];
        if (prevRefNum == null) return new Set();
        const prevRef13Opp = DIGIT_13_OPPOSITES[prevRefNum];
        const prevPair   = calculatePositionCode(prevRefNum,   last);
        const prevPair13 = calculatePositionCode(prevRef13Opp, last);
        const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;

        const refNum   = refs[snake];
        if (refNum == null) return new Set();
        const ref13Opp = DIGIT_13_OPPOSITES[refNum];

        if (useHalfs && half) {
            // T3-halfs: split into pair-half (a1,a2) and 13opp-half (a3,a4).
            let anchors = [];
            if (usePosCode && usePosCode !== 'XX') {
                if (half === 'pair') {
                    const a = getNumberAtPosition(refNum, usePosCode);
                    const b = getNumberAtPosition(refNum, flipPositionCode(usePosCode));
                    [a, b].forEach(x => { if (x !== null && !anchors.includes(x)) anchors.push(x); });
                } else {
                    const a = getNumberAtPosition(ref13Opp, usePosCode);
                    const b = getNumberAtPosition(ref13Opp, flipPositionCode(usePosCode));
                    [a, b].forEach(x => { if (x !== null && !anchors.includes(x)) anchors.push(x); });
                }
            }
            const opps = anchors.map(a => REGULAR_OPPOSITES[a]).filter(x => x !== undefined);
            return new Set(expandAnchorsToBetNumbers(anchors, opps));
        }

        // Merged (default) — same generateAnchors call live mode uses.
        const { purple, green } = generateAnchors(refNum, ref13Opp, usePosCode);
        return new Set(expandAnchorsToBetNumbers(purple, green));
    }

    // ── Filter sets (mirror the live Wheel panel) ──
    const TABLE_0_NUMS  = new Set([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5]);
    const TABLE_19_NUMS = new Set([19,15,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);
    const POSITIVE_NUMS = new Set([3,26,0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23]);
    const NEGATIVE_NUMS = new Set([10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35]);
    const SET0_NUMS = new Set([0,26,3,35,12,28,7,29,18,22,9,31,14,20,1,33,16,24,5,10]);
    const SET5_NUMS = new Set([23,8,30,11,36,13,27,6,34,17,25,2,21,4,19,15,32]);
    const SET6_NUMS = new Set([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);

    function _applyFilters(nums, filters) {
        if (!filters) return nums;
        let out = nums.slice();
        if (filters.table === '0')  out = out.filter(n => TABLE_0_NUMS.has(n));
        if (filters.table === '19') out = out.filter(n => TABLE_19_NUMS.has(n));
        if (filters.sign === 'positive') out = out.filter(n => POSITIVE_NUMS.has(n));
        if (filters.sign === 'negative') out = out.filter(n => NEGATIVE_NUMS.has(n));
        if (filters.sets) {
            const allowed = new Set();
            if (filters.sets.set0) SET0_NUMS.forEach(n => allowed.add(n));
            if (filters.sets.set5) SET5_NUMS.forEach(n => allowed.add(n));
            if (filters.sets.set6) SET6_NUMS.forEach(n => allowed.add(n));
            if (allowed.size > 0) out = out.filter(n => allowed.has(n));
        }
        return out;
    }

    // ── Public entry point ──
    /**
     * computeManualPrediction(spinHistory, selections, env)
     *
     * @param {number[]} spinHistory  Plain numbers, oldest → newest, up
     *   to and including the spin at decision time.
     * @param {{t1:string[], t2:string[], t3:string[]}} selections  Pair
     *   keys (camelCase as used in the live AI panel). T3 keys may
     *   carry _pair / _13opp suffix when env.t3Halfs is true.
     * @param {{inverse:boolean, includeGrey:boolean, t3Halfs:boolean,
     *          filters:{table,sign,sets}}} env
     * @returns {{action:'BET'|'SKIP', numbers:number[], reason:string,
     *           perPair:Array<{key:string, table:string, count:number}>}}
     */
    function computeManualPrediction(spinHistory, selections, env) {
        env = env || {};
        const filters = env.filters || null;
        const inverse = !!env.inverse;
        const t3Halfs = !!env.t3Halfs;
        // Fix A: honour the Include Grey toggle. Default OFF — same as
        // live manual mode's default — so we DON'T fold in the 3rd
        // "extra/grey" ref unless the user explicitly enables it.
        const includeGrey = !!env.includeGrey;
        // refSelections: per-pair explicit ref override used when the
        // "T1/T2 break" toggle is ON. Shape:
        //   { t1: { 'prevPlus1': ['first','second'], ... },
        //     t2: { 'prevPlus1': ['first'], ... } }
        // When a pair has an entry, those refs are used INSTEAD OF
        // auto-pick AND includeGrey is ignored for that pair. When a
        // pair has no entry (toggle OFF, or that specific pair wasn't
        // touched), behaviour falls back to auto-pick + includeGrey.
        const refSelections = (env.refSelections && typeof env.refSelections === 'object') ? env.refSelections : { t1: {}, t2: {} };
        const _explicitFor = (tk, key) => {
            const tableRefs = refSelections[tk] || {};
            const arr = tableRefs[key];
            return Array.isArray(arr) ? arr : null;
        };

        if (!Array.isArray(spinHistory) || spinHistory.length < 2) {
            return { action:'SKIP', numbers:[], reason:'Insufficient history (need ≥ 2 spins)', perPair:[] };
        }

        const perPairSets = [];
        const perPair = [];

        // T1 — neighborRange = 1, valid-code set for auto-ref selection = TABLE1_VALID
        (selections.t1 || []).forEach(k => {
            const { base, half } = _stripHalfSuffix(k);
            const explicit = _explicitFor('t1', k);
            const s = _t12PairSet(spinHistory, base, half, 1, 'table1', includeGrey, explicit);
            if (s.size > 0) {
                perPairSets.push(s);
                perPair.push({ key: k, table: 'T1', count: s.size, refs: explicit || null });
            }
        });

        // T2 — neighborRange = 2, valid-code set = TABLE2_VALID
        (selections.t2 || []).forEach(k => {
            const { base, half } = _stripHalfSuffix(k);
            const explicit = _explicitFor('t2', k);
            const s = _t12PairSet(spinHistory, base, half, 2, 'table2', includeGrey, explicit);
            if (s.size > 0) {
                perPairSets.push(s);
                perPair.push({ key: k, table: 'T2', count: s.size, refs: explicit || null });
            }
        });

        // T3 — anchor-based
        (selections.t3 || []).forEach(k => {
            const { base, half } = _stripHalfSuffix(k);
            const s = _t3PairSet(spinHistory, base, half, t3Halfs);
            if (s.size > 0) {
                perPairSets.push(s);
                perPair.push({ key: k, table: 'T3', count: s.size });
            }
        });

        if (perPairSets.length === 0) {
            return { action:'SKIP', numbers:[], reason:'No pairs produced a number set', perPair };
        }

        // Per-pair INTERSECTION — same as live manual mode.
        let intersection = new Set(perPairSets[0]);
        for (let i = 1; i < perPairSets.length; i++) {
            const next = perPairSets[i];
            intersection = new Set([...intersection].filter(n => next.has(n)));
        }

        let nums = [...intersection];

        if (inverse) {
            const sel = new Set(nums);
            const universe = [];
            for (let n = 0; n <= 36; n++) universe.push(n);
            nums = universe.filter(n => !sel.has(n));
        }

        nums = _applyFilters(nums, filters);

        if (nums.length === 0) {
            return { action:'SKIP', numbers:[], reason:'Empty after intersection / inverse / filters', perPair };
        }

        return {
            action: 'BET',
            numbers: nums.sort((a,b)=>a-b),
            reason: `${perPairSets.length} pair(s) → ${nums.length} numbers (grey ${includeGrey?'ON':'OFF'}, inverse ${inverse?'ON':'OFF'})`,
            perPair
        };
    }

    const api = { computeManualPrediction };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.ManualReplay = api;
    }
}(typeof window !== 'undefined' ? window : globalThis));
