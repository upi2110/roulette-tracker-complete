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
 *   app/renderer-3tables.js   lines  96–167
 *     getNumberAtPosition, flipPositionCode, generateAnchors
 *   app/renderer-3tables.js   lines 192–205
 *     expandAnchorsToBetNumbers
 *   app/renderer-3tables.js   lines 604–650
 *     calculateReferences (engine refKey resolver for T3)
 *   app/renderer-3tables.js   lines 3140–3204
 *     T3 NEXT-row computation (extracted into getTable3NextProjections)
 *
 * Any drift would be a bug; if a future change touches the renderer
 * math, mirror it here too.
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
     * Same flat-array shape as the renderer's helper.
     */
    function expandTargetsToBetNumbers(targets, neighborRange) {
        const split = expandTargetsWithSides(targets, neighborRange);
        return split.all;
    }

    /**
     * Same expansion, but returns the same-side and opposite-side
     * halves separately so the analyser can tell which side a number
     * came from. Critical for "same side streak → next bet must also
     * be same side" analytics.
     *
     * sameSide = target + ±neighborRange wheel-neighbours of TARGET.
     * oppSide  = REGULAR_OPPOSITES[target] + ±neighborRange
     *            wheel-neighbours of THAT opposite.
     * all      = sameSide ∪ oppSide (deduped, same as the flat version).
     */
    function expandTargetsWithSides(targets, neighborRange) {
        const sameSet = new Set();
        const oppSet  = new Set();

        targets.forEach(target => {
            const idx = getWheel36Index(target);
            if (idx !== -1) {
                for (let offset = -neighborRange; offset <= neighborRange; offset++) {
                    getNumbersAtPocket(idx + offset).forEach(n => sameSet.add(n));
                }
            }
            const opposite = REGULAR_OPPOSITES[target];
            if (opposite !== undefined) {
                const oppIdx = getWheel36Index(opposite);
                if (oppIdx !== -1) {
                    for (let offset = -neighborRange; offset <= neighborRange; offset++) {
                        getNumbersAtPocket(oppIdx + offset).forEach(n => oppSet.add(n));
                    }
                }
            }
        });
        const all = new Set([...sameSet, ...oppSet]);
        return {
            sameSide: Array.from(sameSet).sort((a, b) => a - b),
            oppSide:  Array.from(oppSet ).sort((a, b) => a - b),
            all:      Array.from(all    )
        };
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

        const cell = (target) => {
            const split = expandTargetsWithSides([target], neighborRange);
            return {
                targets:  [target],
                sameSide: split.sameSide,    // target's wheel ±N
                oppSide:  split.oppSide,     // REGULAR_OPPOSITE[target]'s wheel ±N
                numbers:  split.all          // union (kept for back-compat)
            };
        };

        Object.entries(pairs).forEach(([pairKey, refNum]) => {
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];
            const refLookup = getLookupRow(refNum);
            const oppLookup = getLookupRow(ref13Opp);

            if (refLookup) {
                projections[pairKey] = {
                    first:  cell(refLookup.first),
                    second: cell(refLookup.second),
                    third:  cell(refLookup.third)
                };
            }
            if (oppLookup) {
                projections[pairKey + '_13opp'] = {
                    first:  cell(oppLookup.first),
                    second: cell(oppLookup.second),
                    third:  cell(oppLookup.third)
                };
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

    // ── T3 math ───────────────────────────────────────────────────
    // T3 doesn't use the LOOKUP_TABLE columns. Instead, for each pair
    // it derives anchors from the LAST spin's position-code against
    // the PREVIOUS state's references (one-spin-back refs). The
    // anchors are then wheel-expanded into bet numbers.

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

    /**
     * Expand purple + green anchors into the bet-number pool. Each
     * anchor gets ±1 wheel-neighbour expansion. Same flat-array shape
     * as renderer-3tables.js expandAnchorsToBetNumbers.
     */
    function expandAnchorsToBetNumbers(purpleAnchors, greenAnchors) {
        const split = expandAnchorsWithSides(purpleAnchors, greenAnchors);
        return split.all;
    }

    /**
     * Same expansion, but keeps same-side (purple-derived) and
     * opposite-side (green-derived) halves separate. Critical for
     * "if last 2-3 hits were same-side, the next should also be
     * same-side" analytics.
     */
    function expandAnchorsWithSides(purpleAnchors, greenAnchors) {
        const sameSet = new Set();
        const oppSet  = new Set();
        const expandInto = (anchors, target) => {
            anchors.forEach(anchor => {
                const idx = getWheel36Index(anchor);
                if (idx === -1) return;
                for (let offset = -1; offset <= 1; offset++) {
                    getNumbersAtPocket(idx + offset).forEach(n => target.add(n));
                }
            });
        };
        expandInto(purpleAnchors, sameSet);
        expandInto(greenAnchors,  oppSet);
        const all = new Set([...sameSet, ...oppSet]);
        return {
            sameSide: Array.from(sameSet).sort((a, b) => a - b),
            oppSide:  Array.from(oppSet ).sort((a, b) => a - b),
            all:      Array.from(all    )
        };
    }

    /**
     * Engine refKey resolver — mirrors calculateReferences in the
     * renderer (lines 604–650). Handles the 0 / 36 wrap-around
     * edge cases for prev and prevPrev branches identically.
     */
    function calculateReferences(prev, prevPrev) {
        const refs = { prev: prev, prev_prev: prevPrev };

        if (prev === 36) {
            refs.prev_plus_1  = 35; refs.prev_plus_2  = 34;
            refs.prev_minus_1 = 35; refs.prev_minus_2 = 34;
        } else if (prev === 0) {
            refs.prev_minus_1 = 10; refs.prev_minus_2 = 9;
            refs.prev_plus_1  = 1;  refs.prev_plus_2  = 2;
        } else {
            refs.prev_plus_1  = Math.min(prev + 1, 36);
            refs.prev_plus_2  = Math.min(prev + 2, 36);
            refs.prev_minus_1 = Math.max(prev - 1, 0);
            refs.prev_minus_2 = Math.max(prev - 2, 0);
        }

        if (prevPrev === 36) {
            refs.prev_prev_plus_1  = 35; refs.prev_prev_plus_2  = 34;
            refs.prev_prev_minus_1 = 35; refs.prev_prev_minus_2 = 34;
        } else if (prevPrev === 0) {
            refs.prev_prev_minus_1 = 10; refs.prev_prev_minus_2 = 9;
            refs.prev_prev_plus_1  = 1;  refs.prev_prev_plus_2  = 2;
        } else if (prevPrev != null) {
            refs.prev_prev_plus_1  = Math.min(prevPrev + 1, 36);
            refs.prev_prev_plus_2  = Math.min(prevPrev + 2, 36);
            refs.prev_prev_minus_1 = Math.max(prevPrev - 1, 0);
            refs.prev_prev_minus_2 = Math.max(prevPrev - 2, 0);
        }
        return refs;
    }

    // T3 pair-group definitions. engineRefKey is the snake_case key
    // calculateReferences emits; dataPair is the camelCase key used
    // everywhere else (AI panel, snapshot, etc.). Mirrors
    // T3_COLUMN_GROUPS in renderer-3tables.js line 2842.
    const T3_PAIR_GROUPS = [
        { engineRefKey: 'prev_plus_1',       dataPair: 'prevPlus1' },
        { engineRefKey: 'prev_minus_1',      dataPair: 'prevMinus1' },
        { engineRefKey: 'prev_prev_plus_1',  dataPair: 'prevPrevPlus1' },
        { engineRefKey: 'prev_prev_minus_1', dataPair: 'prevPrevMinus1' },
        { engineRefKey: 'prev',              dataPair: 'prev' },
        { engineRefKey: 'prev_prev',         dataPair: 'prevPrev' },
        { engineRefKey: 'prev_plus_2',       dataPair: 'prevPlus2' },
        { engineRefKey: 'prev_minus_2',      dataPair: 'prevMinus2' },
        { engineRefKey: 'prev_prev_plus_2',  dataPair: 'prevPrevPlus2' },
        { engineRefKey: 'prev_prev_minus_2', dataPair: 'prevPrevMinus2' }
    ];

    /**
     * NEXT-row projections for Table 3.
     *
     * Per pair (engineRefKey):
     *   refNum     = current refs[refKey]      (built from spins[-1], spins[-2])
     *   prevRefNum = prev refs[refKey]         (built from spins[-2], spins[-3])
     *   usePosCode = code of prevRefNum vs last actual; if XX, falls
     *                back to prevRef13Opp's code (matches renderer).
     *   anchors    = generateAnchors(refNum, ref13Opp, usePosCode)
     *   bet pool   = anchors ±1 wheel-neighbours (purple + green)
     *
     * Output shape mirrors window.table3DisplayProjections so any
     * caller can swap directly.
     *
     * @param {Array<number>} spinsArr - plain number array
     * @returns {Object} { dataPair: { purple, green, pairPurple,
     *   pairGreen, oppPurple, oppGreen, numbers }, … }
     */
    function getTable3NextProjections(spinsArr) {
        if (!Array.isArray(spinsArr) || spinsArr.length < 2) return {};

        const lastSpin     = spinsArr[spinsArr.length - 1];
        const lastLastSpin = spinsArr[spinsArr.length - 2];
        const refs = calculateReferences(lastSpin, lastLastSpin);

        // prevRefs = state ONE spin earlier — built from spins[-2] and
        // spins[-3]. When only 2 spins exist, renderer falls back to
        // (prevPrev, prevPrev) so we match that.
        const prevPrev2 = spinsArr.length > 2 ? spinsArr[spinsArr.length - 3] : lastLastSpin;
        const prevRefs  = calculateReferences(lastLastSpin, prevPrev2);

        const projections = {};
        T3_PAIR_GROUPS.forEach(grp => {
            const refKey = grp.engineRefKey;
            const refNum = refs[refKey];
            if (refNum == null || Number.isNaN(refNum)) return;
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];

            const prevRefNum   = prevRefs[refKey];
            const prevRef13Opp = DIGIT_13_OPPOSITES[prevRefNum];

            const prevPair   = (prevRefNum   != null) ? calculatePositionCode(prevRefNum,   lastSpin) : 'XX';
            const prevPair13 = (prevRef13Opp != null) ? calculatePositionCode(prevRef13Opp, lastSpin) : 'XX';
            const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;

            const merged = generateAnchors(refNum, ref13Opp, usePosCode);

            // Half-anchors (pair-side vs 13opp-side) — same logic as
            // renderer-3tables.js lines 3186–3195. Used by the T3-
            // halfs display mode AND by the snapshot tool when the
            // analyser wants to see which half a number came from.
            let pairAnchors = [], oppAnchors = [];
            if (usePosCode && usePosCode !== 'XX') {
                const aPairA = getNumberAtPosition(refNum,   usePosCode);
                const aPairB = getNumberAtPosition(refNum,   flipPositionCode(usePosCode));
                const aOppA  = getNumberAtPosition(ref13Opp, usePosCode);
                const aOppB  = getNumberAtPosition(ref13Opp, flipPositionCode(usePosCode));
                [aPairA, aPairB].forEach(a => { if (a !== null && !pairAnchors.includes(a)) pairAnchors.push(a); });
                [aOppA,  aOppB ].forEach(a => { if (a !== null && !oppAnchors .includes(a)) oppAnchors .push(a); });
            }
            const pairGreen = pairAnchors.map(a => REGULAR_OPPOSITES[a]).filter(a => a !== undefined);
            const oppGreen  = oppAnchors .map(a => REGULAR_OPPOSITES[a]).filter(a => a !== undefined);

            // Bet pool (anchors ±1 wheel-neighbours). Same-side =
            // expansion around purple anchors; opp-side = expansion
            // around green anchors. The analyser can compare actuals
            // against sameSide / oppSide separately to detect "two
            // hits in a row on the same side".
            const split = expandAnchorsWithSides(merged.purple, merged.green);

            projections[grp.dataPair] = {
                refNum, ref13Opp,
                usePosCode,
                purple:     merged.purple,
                green:      merged.green,
                pairPurple: pairAnchors,
                pairGreen,
                oppPurple:  oppAnchors,
                oppGreen,
                sameSide:   split.sameSide,
                oppSide:    split.oppSide,
                numbers:    split.all
            };
        });
        return projections;
    }

    /**
     * Per-historical-row T3 anchors — for each spin idx ≥ 2,
     * recompute the same anchors / bet pool the renderer painted on
     * that row, plus a flag for whether the actual at idx hit the
     * anchors or the bet pool. Useful for the snapshot tool's table
     * view.
     */
    function computeTable3Rows(spinsArr) {
        if (!Array.isArray(spinsArr) || spinsArr.length < 3) return [];
        const rows = [];
        for (let i = 2; i < spinsArr.length; i++) {
            const slice = spinsArr.slice(0, i);  // state "as of" idx-1
            const projAtRow = getTable3NextProjections(slice);
            const actual = spinsArr[i];
            const perPair = {};
            Object.entries(projAtRow).forEach(([pairKey, p]) => {
                const anchorSet  = new Set([...(p.purple || []), ...(p.green || [])]);
                const betSet     = new Set(p.numbers  || []);
                const sameSet    = new Set(p.sameSide || []);
                const oppSet     = new Set(p.oppSide  || []);
                perPair[pairKey] = {
                    refNum:       p.refNum,
                    ref13Opp:     p.ref13Opp,
                    usePosCode:   p.usePosCode,
                    purple:       p.purple,
                    green:        p.green,
                    sameSide:     p.sameSide,
                    oppSide:      p.oppSide,
                    numbers:      p.numbers,
                    hitAnchor:    anchorSet.has(actual),
                    hitBetPool:   betSet.has(actual),
                    hitSameSide:  sameSet.has(actual),
                    hitOppSide:   oppSet.has(actual)
                };
            });
            rows.push({ spinIndex: i, actual, perPair });
        }
        return rows;
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
        TABLE1_VALID, TABLE2_VALID, LOOKUP_TABLE, T3_PAIR_GROUPS,
        // T1/T2 helpers
        getLookupRow,
        getWheel36Index, getNumbersAtPocket,
        calculateWheelDistance, calculatePositionCode,
        expandTargetsToBetNumbers, expandTargetsWithSides,
        // T3 helpers
        getNumberAtPosition, flipPositionCode, generateAnchors,
        expandAnchorsToBetNumbers, expandAnchorsWithSides,
        calculateReferences,
        // NEXT-row projections (T1, T2, T3)
        getTable1NextProjections,
        getTable2NextProjections,
        getTable3NextProjections,
        // Per-spin row data
        computeTableRows,
        computeTable3Rows
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
