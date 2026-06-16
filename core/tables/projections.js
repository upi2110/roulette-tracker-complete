/**
 * core/tables/projections.js — pure projection math, no DOM.
 *
 * Headless mirror of the Electron renderer's table math. Used by the
 * snapshot tool so an analyser (or any consumer) can see exactly the
 * same numbers the live tables paint, without parsing the DOM.
 *
 * SAFETY GUARANTEE
 * ----------------
 * This file does NOT replace anything in app/renderer-3tables.js. The
 * renderer still uses its own inline copies of these functions and
 * paints the live tables the same way it always did. This module is a
 * faithful copy, runnable in both browser (exposed via window.CoreTables)
 * and Node.js (module.exports). Loading order in the Electron app is
 * irrelevant — nothing here mutates global state.
 *
 * SOURCE PARITY
 * -------------
 * Code is copied verbatim from:
 *   roulette-wheel/table-lookup.js     LOOKUP_TABLE, getLookupRow
 *   app/renderer-3tables.js   lines  1–242
 *     REGULAR_OPPOSITES, DIGIT_13_OPPOSITES, WHEEL_NO_ZERO, WHEEL_36,
 *     calculatePositionCode, calculateWheelDistance,
 *     getWheel36Index, getNumbersAtPocket, expandTargetsToBetNumbers
 *   app/renderer-3tables.js   lines 249–374
 *     getTable1NextProjections, getTable2NextProjections
 *     (refactored to accept a spins array argument instead of reading
 *      the renderer's `spins` global — same math otherwise)
 *
 * Any drift would be a bug; if a future change touches the renderer
 * math, mirror it here too. T3 projections will be added in a
 * follow-up commit (Commit 1B).
 */

(function (root) {
    'use strict';

    // ── Wheel constants ───────────────────────────────────────────
    // The wheel arrays match the Electron renderer 1:1.

    const WHEEL_NO_ZERO = [26, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11,
        30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

    // 36-pocket European wheel: 0 and 26 share pocket index 0.
    const WHEEL_36 = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11,
        30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];

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

    // Position-code sets that count as "valid hits" per table.
    const TABLE1_VALID = new Set(['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1']);
    const TABLE2_VALID = new Set(['S+0', 'SL+1', 'SR+1', 'SL+2', 'SR+2',
                                  'O+0', 'OL+1', 'OR+1', 'OL+2', 'OR+2']);

    // ── Lookup table ──────────────────────────────────────────────
    // Format: [Number, 1st, 2nd, 3rd]
    const LOOKUP_TABLE = [
        [0, 13, 20, 26],   [32, 36, 14, 32],  [15, 11, 31, 15],  [19, 30, 9, 19],
        [4, 8, 22, 4],     [21, 23, 18, 21],  [2, 10, 29, 2],    [25, 5, 7, 25],
        [17, 24, 28, 17],  [34, 16, 12, 34],  [6, 33, 35, 6],    [27, 1, 3, 27],
        [13, 20, 26, 13],  [36, 14, 32, 36],  [11, 31, 15, 11],  [30, 9, 19, 30],
        [8, 22, 4, 8],     [23, 18, 21, 23],  [10, 29, 2, 10],   [5, 7, 25, 5],
        [24, 28, 17, 24],  [16, 12, 34, 16],  [33, 35, 6, 33],   [1, 3, 27, 1],
        [20, 26, 13, 20],  [14, 32, 36, 14],  [31, 15, 11, 31],  [9, 19, 30, 9],
        [22, 4, 8, 22],    [18, 21, 23, 18],  [29, 2, 10, 29],   [7, 25, 5, 7],
        [28, 17, 24, 28],  [12, 34, 16, 12],  [35, 6, 33, 35],   [3, 27, 1, 3],
        [26, 13, 20, 26]
    ];

    function getLookupRow(num) {
        const row = LOOKUP_TABLE.find(r => r[0] === num);
        return row ? { first: row[1], second: row[2], third: row[3] } : null;
    }

    // ── Wheel-index helpers ───────────────────────────────────────

    function getWheel36Index(num) {
        if (num === 26) return 0;     // 26 shares pocket with 0
        return WHEEL_36.indexOf(num);
    }

    function getNumbersAtPocket(pocketIdx) {
        const idx = ((pocketIdx % 36) + 36) % 36;
        if (idx === 0) return [0, 26];
        return [WHEEL_36[idx]];
    }

    // ── Position-code math ────────────────────────────────────────

    function calculateWheelDistance(fromIdx, targetNumber, direction) {
        let currentIdx = fromIdx;
        let distance = 0;
        let skippedZero = false;

        for (let i = 0; i < 10; i++) {
            currentIdx = ((currentIdx + direction) % 37 + 37) % 37;
            const currentNum = WHEEL_NO_ZERO[currentIdx];

            if (currentNum === 26 && !skippedZero) {
                skippedZero = true;
                if (targetNumber === 26) {
                    distance++;
                    return distance;
                }
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

    // ── Neighbour-expansion ───────────────────────────────────────
    /**
     * Expand target numbers to include ±neighborRange wheel neighbours
     * on BOTH same and opposite sides. T1 uses ±1, T2 uses ±2.
     */
    function expandTargetsToBetNumbers(targets, neighborRange) {
        const betNumbers = new Set();

        targets.forEach(target => {
            const idx = getWheel36Index(target);
            if (idx !== -1) {
                for (let offset = -neighborRange; offset <= neighborRange; offset++) {
                    getNumbersAtPocket(idx + offset).forEach(n => betNumbers.add(n));
                }
            }
            const opposite = REGULAR_OPPOSITES[target];
            if (opposite !== undefined) {
                const oppIdx = getWheel36Index(opposite);
                if (oppIdx !== -1) {
                    for (let offset = -neighborRange; offset <= neighborRange; offset++) {
                        getNumbersAtPocket(oppIdx + offset).forEach(n => betNumbers.add(n));
                    }
                }
            }
        });
        return Array.from(betNumbers);
    }

    // ── Pair-family resolver ──────────────────────────────────────
    // Renderer-3tables.js builds the same pairs map in both T1 and T2
    // projection functions. Factor it out here so the two table
    // accessors share the same logic.
    function _buildPairsMap(lastSpin, prevPrev) {
        const pairs = {
            ref0:       0,
            ref19:      19,
            prev:       lastSpin,
            prevPlus1:  Math.min(lastSpin + 1, 36),
            prevMinus1: Math.max(lastSpin - 1, 0),
            prevPlus2:  Math.min(lastSpin + 2, 36),
            prevMinus2: Math.max(lastSpin - 2, 0)
        };
        if (prevPrev !== null && prevPrev !== undefined) {
            pairs.prevPrev       = prevPrev;
            pairs.prevPrevPlus1  = Math.min(prevPrev + 1, 36);
            pairs.prevPrevMinus1 = Math.max(prevPrev - 1, 0);
            pairs.prevPrevPlus2  = Math.min(prevPrev + 2, 36);
            pairs.prevPrevMinus2 = Math.max(prevPrev - 2, 0);
        }
        return pairs;
    }

    function _buildProjections(spinsArr, neighborRange) {
        if (!Array.isArray(spinsArr) || spinsArr.length < 1) return {};

        const lastSpin = spinsArr[spinsArr.length - 1];
        const prevPrev = spinsArr.length >= 2 ? spinsArr[spinsArr.length - 2] : null;
        const projections = {};
        const pairs = _buildPairsMap(lastSpin, prevPrev);

        Object.entries(pairs).forEach(([pairKey, refNum]) => {
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];
            const refLookup = getLookupRow(refNum);
            const oppLookup = getLookupRow(ref13Opp);

            if (refLookup) {
                projections[pairKey] = {};
                ['first', 'second', 'third'].forEach(refKey => {
                    const numbers = expandTargetsToBetNumbers([refLookup[refKey]], neighborRange);
                    projections[pairKey][refKey] = {
                        targets: [refLookup[refKey]],
                        numbers: numbers
                    };
                });
            }

            if (oppLookup) {
                projections[pairKey + '_13opp'] = {};
                ['first', 'second', 'third'].forEach(refKey => {
                    const numbers = expandTargetsToBetNumbers([oppLookup[refKey]], neighborRange);
                    projections[pairKey + '_13opp'][refKey] = {
                        targets: [oppLookup[refKey]],
                        numbers: numbers
                    };
                });
            }
        });
        return projections;
    }

    /**
     * NEXT-row projections for Table 1 (±1 expansion).
     * @param {Array<number>} spinsArr - plain number array
     * @returns {Object} { pairKey: { first:{targets,numbers}, … }, pairKey_13opp:{…}, … }
     */
    function getTable1NextProjections(spinsArr) {
        return _buildProjections(spinsArr, 1);
    }

    /**
     * NEXT-row projections for Table 2 (±2 expansion).
     */
    function getTable2NextProjections(spinsArr) {
        return _buildProjections(spinsArr, 2);
    }

    // ── Per-row table data (for the snapshot tool) ────────────────
    /**
     * For each historical spin, compute the per-pair position codes +
     * whether the actual hit was VALID for T1 / T2. This is the raw
     * data the snapshot tool will pivot into a grid the user can read.
     *
     * @param {Array<number>} spinsArr
     * @param {'T1'|'T2'} tableId
     * @returns {Array} rows — one entry per spin idx ≥ 2:
     *   { spinIndex, actual, perPair: { prev: {refNum, codes, hits}, … } }
     */
    function computeTableRows(spinsArr, tableId) {
        if (!Array.isArray(spinsArr) || spinsArr.length < 3) return [];
        const validSet = tableId === 'T2' ? TABLE2_VALID : TABLE1_VALID;
        const neighborRange = tableId === 'T2' ? 2 : 1;
        const rows = [];

        for (let i = 2; i < spinsArr.length; i++) {
            // Row "i" uses spins[i-1] and spins[i-2] as the pair refs
            // (the same rule renderTable1/2 use).
            const actual = spinsArr[i];
            const prev   = spinsArr[i - 1];
            const prev2  = spinsArr[i - 2];
            const pairs  = _buildPairsMap(prev, prev2);

            const perPair = {};
            Object.entries(pairs).forEach(([pairKey, refNum]) => {
                const ref13Opp  = DIGIT_13_OPPOSITES[refNum];
                const refLookup = getLookupRow(refNum);
                const oppLookup = getLookupRow(ref13Opp);

                const codeFor = (lookup) => {
                    if (!lookup) return { first: 'XX', second: 'XX', third: 'XX' };
                    return {
                        first:  calculatePositionCode(lookup.first,  actual),
                        second: calculatePositionCode(lookup.second, actual),
                        third:  calculatePositionCode(lookup.third,  actual)
                    };
                };
                const isHit = codes => ({
                    first:  validSet.has(codes.first),
                    second: validSet.has(codes.second),
                    third:  validSet.has(codes.third)
                });

                const refCodes = codeFor(refLookup);
                const oppCodes = codeFor(oppLookup);

                perPair[pairKey] = {
                    refNum,
                    ref13Opp,
                    refLookup,
                    oppLookup,
                    codes:   refCodes,
                    hits:    isHit(refCodes),
                    oppCodes,
                    oppHits: isHit(oppCodes)
                };
            });

            rows.push({ spinIndex: i, actual, prev, prev2, perPair });
        }
        return rows;
    }

    // ── Public API ────────────────────────────────────────────────
    const api = {
        // Constants
        WHEEL_NO_ZERO, WHEEL_36, REGULAR_OPPOSITES, DIGIT_13_OPPOSITES,
        TABLE1_VALID, TABLE2_VALID, LOOKUP_TABLE,
        // Helpers
        getLookupRow,
        getWheel36Index, getNumbersAtPocket,
        calculateWheelDistance, calculatePositionCode,
        expandTargetsToBetNumbers,
        // NEXT-row projections (T1, T2). T3 in follow-up Commit 1B.
        getTable1NextProjections,
        getTable2NextProjections,
        // Per-spin row data
        computeTableRows
    };

    // Browser: attach to window.CoreTables — does NOT replace any
    // existing globals the renderer uses.
    if (typeof window !== 'undefined') {
        window.CoreTables = api;
    }
    // Node: module.exports for the snapshot CLI.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
