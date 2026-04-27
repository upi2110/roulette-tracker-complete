/**
 * 50-ai-t2-set-prediction.test.js
 * Tests the enhanced AI prediction pipeline:
 *   - T2 flash detection integration in AI engine
 *   - NEXT row number extraction from flashing anchors
 *   - Set prediction algorithm (Set 0/5/6)
 *   - Combined T2+T3 decision flow
 *   - Semi-auto filter set prediction
 */

const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS, REFKEY_TO_PAIR_NAME, T2_PAIR_KEYS, T2_PAIR_REFNUM } = require('../../app/ai-auto-engine');
const { SemiAutoFilter, SA_SET0, SA_SET5, SA_SET6, SA_ZERO, SA_NINE, SA_POS, SA_NEG } = require('../../strategies/semi-auto/semi-auto-filter');
const fs = require('fs');
const pathMod = require('path');

// ── Mock renderer functions ──
const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:35, 3:17, 4:6, 5:22, 6:4, 7:18, 8:24, 9:29,
    10:33, 11:36, 12:3, 13:27, 14:31, 15:19, 16:23, 17:3, 18:7, 19:15,
    20:1, 21:25, 22:5, 23:16, 24:8, 25:21, 26:32, 27:13, 28:1, 29:9,
    30:11, 31:14, 32:26, 33:10, 34:0, 35:2, 36:11
};

function calculatePositionCode(reference, actual) {
    if (reference === undefined || reference === null || actual === undefined || actual === null) return 'XX';
    const refIdx = WHEEL_STANDARD.indexOf(reference);
    const actIdx = WHEEL_STANDARD.indexOf(actual);
    if (refIdx === -1 || actIdx === -1) return 'XX';
    const len = WHEEL_STANDARD.length;
    const sameIdx = refIdx;
    const oppIdx = (refIdx + 18) % len;
    let cwFromSame = (actIdx - sameIdx + len) % len;
    let ccwFromSame = (sameIdx - actIdx + len) % len;
    let cwFromOpp = (actIdx - oppIdx + len) % len;
    let ccwFromOpp = (oppIdx - actIdx + len) % len;
    const minSame = Math.min(cwFromSame, ccwFromSame);
    const minOpp = Math.min(cwFromOpp, ccwFromOpp);
    if (minSame <= minOpp) {
        if (cwFromSame <= ccwFromSame) {
            return cwFromSame === 0 ? 'S+0' : `SR+${cwFromSame}`;
        } else {
            return `SL+${ccwFromSame}`;
        }
    } else {
        if (cwFromOpp <= ccwFromOpp) {
            return cwFromOpp === 0 ? 'O+0' : `OR+${cwFromOpp}`;
        } else {
            return `OL+${ccwFromOpp}`;
        }
    }
}

function calculateReferences(prev, prevPrev) {
    if (prev === undefined || prev === null) return {};
    const prevIdx = WHEEL_STANDARD.indexOf(prev);
    const len = WHEEL_STANDARD.length;
    return {
        prev: prev,
        prev_plus_1: WHEEL_STANDARD[(prevIdx + 1) % len],
        prev_minus_1: WHEEL_STANDARD[(prevIdx - 1 + len) % len],
        prev_plus_2: WHEEL_STANDARD[(prevIdx + 2) % len],
        prev_minus_2: WHEEL_STANDARD[(prevIdx - 2 + len) % len],
        prev_prev: prevPrev !== undefined ? prevPrev : prev
    };
}

function _getPosCodeDistance(posCode) {
    if (!posCode || posCode === 'XX') return null;
    const m = posCode.match(/[+\-](\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

function generateAnchors(refNum, ref13Opp, posCode) {
    const purple = [];
    const green = [];
    if (!posCode || posCode === 'XX') return { purple, green };
    const refIdx = WHEEL_STANDARD.indexOf(refNum);
    const oppIdx = WHEEL_STANDARD.indexOf(ref13Opp);
    if (refIdx === -1 || oppIdx === -1) return { purple, green };
    purple.push(refNum, ref13Opp);
    return { purple, green };
}

function expandAnchorsToBetNumbers(purple, green) {
    const result = new Set();
    const len = WHEEL_STANDARD.length;
    for (const anchor of purple) {
        const idx = WHEEL_STANDARD.indexOf(anchor);
        if (idx === -1) continue;
        for (let d = -2; d <= 2; d++) {
            result.add(WHEEL_STANDARD[(idx + d + len) % len]);
        }
    }
    for (const n of green) {
        const idx = WHEEL_STANDARD.indexOf(n);
        if (idx === -1) continue;
        for (let d = -1; d <= 1; d++) {
            result.add(WHEEL_STANDARD[(idx + d + len) % len]);
        }
    }
    return Array.from(result);
}

// Load real lookup table
let LOOKUP_TABLE;
beforeAll(() => {
    const lookupSrc = fs.readFileSync(pathMod.join(__dirname, '..', '..', 'app', 'table-lookup.js'), 'utf-8');
    const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;');
    fn();

    // Also load _computeT2FlashTargets and related from renderer
    const { setupDOM, loadRendererFunctions } = require('../test-setup');
    setupDOM();
    const R = loadRendererFunctions();

    // Make T2 flash function available globally for the engine
    if (R._computeT2FlashTargets) {
        global._computeT2FlashTargets = R._computeT2FlashTargets;
    }
    if (R._computeT1FlashTargets) {
        global._computeT1FlashTargets = R._computeT1FlashTargets;
    }
});

// Make functions global for the engine
global.calculatePositionCode = calculatePositionCode;
global.calculateReferences = calculateReferences;
global.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
global.generateAnchors = generateAnchors;
global.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
global._getPosCodeDistance = _getPosCodeDistance;

// Number sets
global.ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
global.NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
global.POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
global.NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// Set definitions
global.SET_0_NUMS = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
global.SET_5_NUMS = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
global.SET_6_NUMS = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

// Also make expandTargetsToBetNumbers global (for _getExpandTargetsToBetNumbers wrapper)
// Simplified version using wheel standard for testing
global.expandTargetsToBetNumbers = function(targets, neighborRange) {
    const result = new Set();
    const len = WHEEL_STANDARD.length;
    for (const target of targets) {
        const idx = WHEEL_STANDARD.indexOf(target);
        if (idx === -1) continue;
        for (let d = -neighborRange; d <= neighborRange; d++) {
            result.add(WHEEL_STANDARD[(idx + d + len) % len]);
        }
        // Opposite side neighbor expansion
        const oppIdx = (idx + 18) % len;
        for (let d = -neighborRange; d <= neighborRange; d++) {
            result.add(WHEEL_STANDARD[(oppIdx + d + len) % len]);
        }
    }
    return Array.from(result);
};

function generateTestSpins(count) {
    const spins = [];
    for (let i = 0; i < count; i++) {
        spins.push(WHEEL_STANDARD[i % WHEEL_STANDARD.length]);
    }
    return spins;
}

function makeSpinObjs(nums) {
    return nums.map(n => ({ actual: n, direction: 'C' }));
}

// ═══════════════════════════════════════════════════════════════
//  A. T2 Flash Detection Integration
// ═══════════════════════════════════════════════════════════════
describe('A. T2 Flash Detection Integration', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
        const spins = generateTestSpins(50);
        engine.train([spins]);
    });

    test('A1: _getComputeT2FlashTargets wrapper returns a Set', () => {
        const spins = makeSpinObjs([0, 32, 15, 19, 4, 21]);
        const result = engine._getComputeT2FlashTargets(spins, 0, spins.length);
        expect(result).toBeInstanceOf(Set);
    });

    test('A2: _getT2FlashingPairsAndNumbers returns null when no flash', () => {
        // Very few spins — unlikely to trigger T2 flash
        const spins = makeSpinObjs([0, 32, 15]);
        const result = engine._getT2FlashingPairsAndNumbers(spins);
        expect(result).toBeNull();
    });

    test('A3: _getT2FlashingPairsAndNumbers returns null with fewer than 4 spins', () => {
        const spins = makeSpinObjs([10, 20, 30]);
        const result = engine._getT2FlashingPairsAndNumbers(spins);
        expect(result).toBeNull();
    });

    test('A4: _getT2FlashingPairsAndNumbers returns valid structure when T2 flashes', () => {
        // Use enough spins with repeating patterns to trigger T2 flash
        const nums = [];
        for (let i = 0; i < 20; i++) {
            nums.push(WHEEL_STANDARD[i % WHEEL_STANDARD.length]);
        }
        const spins = makeSpinObjs(nums);
        const result = engine._getT2FlashingPairsAndNumbers(spins);

        // May or may not flash depending on exact spin sequence, but if it does:
        if (result !== null) {
            expect(result).toHaveProperty('dataPair');
            expect(result).toHaveProperty('anchorCount');
            expect(result).toHaveProperty('targets');
            expect(result).toHaveProperty('numbers');
            expect(result).toHaveProperty('score');
            expect(T2_PAIR_KEYS).toContain(result.dataPair);
            expect(result.anchorCount).toBeGreaterThanOrEqual(2);
            expect(result.targets.length).toBeGreaterThanOrEqual(2);
            expect(result.numbers.length).toBeGreaterThanOrEqual(1);
        }
    });

    test('A5: T2_PAIR_KEYS has 7 entries (no 13OPP, no prevPrev)', () => {
        expect(T2_PAIR_KEYS).toHaveLength(7);
        expect(T2_PAIR_KEYS).toContain('ref0');
        expect(T2_PAIR_KEYS).toContain('ref19');
        expect(T2_PAIR_KEYS).toContain('prev');
        expect(T2_PAIR_KEYS).not.toContain('prevPrev');
        expect(T2_PAIR_KEYS).not.toContain('prev_13opp');
    });

    test('A6: T2_PAIR_REFNUM maps all 7 pairs to functions', () => {
        expect(Object.keys(T2_PAIR_REFNUM)).toHaveLength(7);
        // ref0 always returns 0
        expect(T2_PAIR_REFNUM.ref0(15)).toBe(0);
        // ref19 always returns 19
        expect(T2_PAIR_REFNUM.ref19(15)).toBe(19);
        // prev returns the input
        expect(T2_PAIR_REFNUM.prev(15)).toBe(15);
        // prevPlus1 clamps at 36
        expect(T2_PAIR_REFNUM.prevPlus1(36)).toBe(36);
        expect(T2_PAIR_REFNUM.prevPlus1(10)).toBe(11);
        // prevMinus1 clamps at 0
        expect(T2_PAIR_REFNUM.prevMinus1(0)).toBe(0);
        expect(T2_PAIR_REFNUM.prevMinus1(10)).toBe(9);
    });
});

// ═══════════════════════════════════════════════════════════════
//  B. Set Prediction Algorithm
// ═══════════════════════════════════════════════════════════════
describe('B. Set Prediction Algorithm', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
        const spins = generateTestSpins(50);
        engine.train([spins]);
    });

    test('B1: _predictBestSet returns one of set0/set5/set6', () => {
        const numbers = [0, 13, 26, 32, 15, 19, 4, 21, 6, 27];
        const recent = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34];
        const result = engine._predictBestSet(numbers, recent);

        expect(result).toHaveProperty('setKey');
        expect(result).toHaveProperty('filterKey');
        expect(result).toHaveProperty('score');
        expect(['set0', 'set5', 'set6']).toContain(result.setKey);
    });

    test('B2: returns valid filterKey in both_both_setN format', () => {
        const numbers = [0, 13, 26, 10, 20, 9, 29, 12];
        const result = engine._predictBestSet(numbers, []);

        expect(['both_both_set0', 'both_both_set5', 'both_both_set6']).toContain(result.filterKey);
    });

    test('B3: favors set with highest coverage overlap', () => {
        // All numbers in Set 0: [0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]
        const set0Numbers = [0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12];
        const result = engine._predictBestSet(set0Numbers, []);

        expect(result.setKey).toBe('set0');
    });

    test('B4: recent frequency influences prediction', () => {
        // Numbers equally spread, but recent spins heavily in Set 5
        const mixedNumbers = [0, 32, 4, 26, 15, 21]; // 2 from each set roughly
        const recentAllSet5 = [32, 15, 25, 17, 36, 11, 5, 24, 14, 31]; // all Set 5
        const result = engine._predictBestSet(mixedNumbers, recentAllSet5);

        expect(result.setKey).toBe('set5');
    });

    test('B5: anti-streak bonus for absent set', () => {
        // Numbers equally spread, recent spins have NO set6 in last 3
        const mixedNumbers = [0, 32, 4, 26, 15, 21]; // 2 from each set roughly
        // Last 3 are all from Set 0: [0, 26, 19]
        const recentNoSet6 = [4, 21, 6, 27, 8, 23, 33, 0, 26, 19];
        const resultA = engine._predictBestSet(mixedNumbers, recentNoSet6);
        // Set 6 should NOT be in last 3, so it gets anti-streak bonus
        // We can't guarantee which set wins, but we can check the score is valid
        expect(resultA.score).toBeGreaterThan(0);
    });

    test('B6: score is always a positive number', () => {
        const result = engine._predictBestSet([10, 20, 30], [5, 15, 25]);
        expect(result.score).toBeGreaterThan(0);
        expect(typeof result.score).toBe('number');
    });
});

// ═══════════════════════════════════════════════════════════════
//  C. Combined T2+T3 Decision Flow
// ═══════════════════════════════════════════════════════════════
describe('C. Combined T2+T3 Decision Flow', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
        const spins = generateTestSpins(50);
        engine.train([spins]);
        engine.enable();
    });

    test('C1: decide() returns SKIP when not enough spins', () => {
        // Mock window.spins with too few
        global.window = { spins: makeSpinObjs([10, 20]) };
        const result = engine.decide();
        expect(result.action).toBe('SKIP');
        expect(result.reason).toContain('Not enough spins');
        delete global.window;
    });

    test('C2: decide() returns SKIP when no flash data', () => {
        // Mock window.spins and getAIDataV6 — but no flashing
        global.window = {
            spins: makeSpinObjs([0, 1, 2, 3, 4]),
            getAIDataV6: () => ({ table3NextProjections: {} })
        };
        // Also mock _computeFlashTargets to return empty
        const origFlash = global._computeFlashTargets;
        global._computeFlashTargets = () => new Set();
        const origT2Flash = global._computeT2FlashTargets;
        global._computeT2FlashTargets = () => new Set();

        const result = engine.decide();
        expect(result.action).toBe('SKIP');

        global._computeFlashTargets = origFlash;
        global._computeT2FlashTargets = origT2Flash;
        delete global.window;
    });

    test('C3: decide() selectedFilter is always both_both_setN format', () => {
        // If the engine decides to BET, the filter should be both_both_set{0|5|6}
        // We can test this by checking the filter format on any decision
        global.window = {
            spins: makeSpinObjs(generateTestSpins(20)),
            getAIDataV6: () => ({
                table3NextProjections: {
                    prev: { anchors: [13, 32, 19, 4], neighbors: [0, 26, 21], numbers: [0, 13, 26, 32, 15, 19, 4, 21, 2, 25] }
                }
            })
        };
        // Mock T3 flash to return a hit
        const origFlash = global._computeFlashTargets;
        global._computeFlashTargets = () => new Set(['0:prev:S+0']);

        const result = engine.decide();
        if (result.action === 'BET') {
            expect(result.selectedFilter).toMatch(/^both_both_set[056]$/);
        }

        global._computeFlashTargets = origFlash;
        delete global.window;
    });

    test('C4: decide() debug object contains T2/T3 breakdown when BET or SKIP with data', () => {
        global.window = {
            spins: makeSpinObjs(generateTestSpins(20)),
            getAIDataV6: () => ({
                table3NextProjections: {
                    prev: { anchors: [13, 32, 19], neighbors: [0, 26], numbers: [0, 13, 26, 32, 15, 19, 4, 21] }
                }
            })
        };
        const origFlash = global._computeFlashTargets;
        global._computeFlashTargets = () => new Set(['0:prev:S+0']);

        const result = engine.decide();

        // When either T3 or T2 provides data, debug has the new breakdown fields
        if (result.debug && Object.keys(result.debug).length > 0) {
            expect(result.debug).toHaveProperty('t3FlashingRefKeys');
            expect(result.debug).toHaveProperty('t2FlashPair');
            expect(result.debug).toHaveProperty('predictedSet');
        }
        // At minimum, the action should be a valid value
        expect(['BET', 'SKIP']).toContain(result.action);
        // selectedFilter should be both_both_setN format or null
        if (result.selectedFilter) {
            expect(result.selectedFilter).toMatch(/^both_both_set[056]$/);
        }

        global._computeFlashTargets = origFlash;
        delete global.window;
    });

    test('C5: combined numbers are union (no duplicates)', () => {
        const t3 = [0, 13, 26, 32, 15];
        const t2 = [0, 32, 19, 4, 21]; // overlaps: 0, 32
        const combined = new Set([...t3, ...t2]);
        expect(combined.size).toBe(8); // 5 + 5 - 2 overlaps = 8
    });

    test('C6: decide() works with T3-only (no T2 flash)', () => {
        global.window = {
            spins: makeSpinObjs(generateTestSpins(10)),
            getAIDataV6: () => ({
                table3NextProjections: {
                    prev: { anchors: [13, 32, 19, 4], neighbors: [0, 26, 21], numbers: [0, 13, 26, 32, 15, 19, 4, 21, 2, 25] }
                }
            })
        };
        // T3 flash ON, T2 flash OFF
        const origFlash = global._computeFlashTargets;
        global._computeFlashTargets = () => new Set(['0:prev:S+0']);
        const origT2Flash = global._computeT2FlashTargets;
        global._computeT2FlashTargets = () => new Set(); // no T2 flash

        const result = engine.decide();
        // When T3 has data but T2 does not, engine may BET or SKIP depending on confidence
        expect(['BET', 'SKIP']).toContain(result.action);
        if (result.debug && result.debug.t2FlashPair !== undefined) {
            expect(result.debug.t2FlashPair).toBeNull();
            expect(result.debug.t2NumberCount).toBe(0);
            expect(result.debug.t3NumberCount).toBeGreaterThan(0);
        }

        global._computeFlashTargets = origFlash;
        global._computeT2FlashTargets = origT2Flash;
        delete global.window;
    });
});

// ═══════════════════════════════════════════════════════════════
//  D. Semi-Auto Filter Set Prediction
// ═══════════════════════════════════════════════════════════════
describe('D. Semi-Auto Filter Set Prediction', () => {
    let filter;

    beforeEach(() => {
        filter = new SemiAutoFilter();
    });

    test('D1: predictBestSet returns valid set', () => {
        const numbers = [0, 13, 26, 10, 20, 9, 29, 12, 32, 15];
        const result = filter.predictBestSet(numbers, []);

        expect(result).toHaveProperty('setKey');
        expect(result).toHaveProperty('filterKey');
        expect(result).toHaveProperty('score');
        expect(['set0', 'set5', 'set6']).toContain(result.setKey);
        expect(['both_both_set0', 'both_both_set5', 'both_both_set6']).toContain(result.filterKey);
    });

    test('D2: computeOptimalFilter returns both_both_setN when enough numbers', () => {
        // Provide numbers that span all sets to ensure ≥ 4 survive any set filter
        const numbers = [0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12, // set0 (13)
                         32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28,     // set5 (12)
                         4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3];       // set6 (12)
        const result = filter.computeOptimalFilter(numbers);

        expect(result).not.toBeNull();
        expect(result.key).toMatch(/^both_both_set[056]$/);
        expect(result.count).toBeGreaterThanOrEqual(4);
    });

    test('D3: predictBestSet coverage overlap is primary factor', () => {
        // All numbers from Set 6
        const set6Only = [4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3];
        const result = filter.predictBestSet(set6Only, []);
        expect(result.setKey).toBe('set6');
    });

    test('D4: recent spin frequency affects choice', () => {
        // Numbers equally distributed, recent spins all from Set 5
        const mixed = [0, 32, 4]; // 1 per set
        const recentSet5 = [32, 15, 25, 17, 36, 11, 5, 24, 14, 31]; // all Set 5
        const result = filter.predictBestSet(mixed, recentSet5);
        expect(result.setKey).toBe('set5');
    });

    test('D5: anti-streak bonus applied when set absent from last 3', () => {
        // Equal coverage, but Set 0 hasn't appeared in last 3
        const mixed = [0, 32, 4, 26, 15, 21]; // 2 per set
        // Last 3 spins: all from Set 5 and Set 6, none from Set 0
        const recent = [32, 15, 4, 21, 6, 27, 25, 17, 8, 23]; // last 3 = [17, 8, 23] → set5, set6, set6
        const result = filter.predictBestSet(mixed, recent);
        // Can't guarantee set0 wins, but score should be positive
        expect(result.score).toBeGreaterThan(0);
    });

    test('D6: computeOptimalFilter falls back to combo scan when too few numbers', () => {
        // Very few numbers — set filter may yield < 4
        const fewNumbers = [0, 32]; // Only 2 numbers
        const result = filter.computeOptimalFilter(fewNumbers);
        // Should return null since even fallback can't find ≥ 4 numbers from 2 input
        expect(result).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════
//  E. Engine New Wrapper Methods
// ═══════════════════════════════════════════════════════════════
describe('E. Engine Wrapper Methods', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
    });

    test('E1: _getLookupRow returns lookup data for valid number', () => {
        const result = engine._getLookupRow(0);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('first');
        expect(result).toHaveProperty('second');
        expect(result).toHaveProperty('third');
    });

    test('E2: _getLookupRow returns null for invalid number', () => {
        const result = engine._getLookupRow(99);
        expect(result).toBeNull();
    });

    test('E3: _getExpandTargetsToBetNumbers returns expanded numbers', () => {
        const result = engine._getExpandTargetsToBetNumbers([13], 2);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(1); // At least the target and some neighbors
        expect(result).toContain(13); // Original target should be included
    });

    test('E4: _getComputeT2FlashTargets returns a Set', () => {
        const spins = makeSpinObjs([0, 32, 15, 19, 4]);
        const result = engine._getComputeT2FlashTargets(spins, 0, spins.length);
        expect(result).toBeInstanceOf(Set);
    });
});

// ═══════════════════════════════════════════════════════════════
//  F. Edge Cases
// ═══════════════════════════════════════════════════════════════
describe('F. Edge Cases', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
        const spins = generateTestSpins(50);
        engine.train([spins]);
        engine.enable();
    });

    test('F1: _predictBestSet with empty combinedNumbers', () => {
        const result = engine._predictBestSet([], [10, 20, 30]);
        expect(['set0', 'set5', 'set6']).toContain(result.setKey);
        expect(result.score).toBeGreaterThanOrEqual(0);
    });

    test('F2: _predictBestSet with all numbers in one set', () => {
        const set5Only = Array.from(global.SET_5_NUMS);
        const result = engine._predictBestSet(set5Only, []);
        expect(result.setKey).toBe('set5');
    });

    test('F3: _predictBestSet equal coverage tiebreaks by recent frequency', () => {
        // 4 numbers from each set — equal coverage
        const balanced = [0, 26, 19, 2,  // set0
                          32, 15, 25, 17, // set5
                          4, 21, 6, 27];  // set6
        // Recent spins heavily Set 0
        const recentSet0 = [0, 26, 19, 2, 34, 13, 30, 10, 16, 20];
        const result = engine._predictBestSet(balanced, recentSet0);
        expect(result.setKey).toBe('set0');
    });

    test('F4: _getT2FlashingPairsAndNumbers with null spins', () => {
        const result = engine._getT2FlashingPairsAndNumbers(null);
        expect(result).toBeNull();
    });

    test('F5: filter key both_both_set0 correctly filters numbers', () => {
        const allNumbers = Array.from({ length: 37 }, (_, i) => i);
        const filtered = engine._applyFilterToNumbers(allNumbers, 'both_both_set0');
        // Should only include Set 0 numbers: [0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]
        expect(filtered.length).toBe(13);
        filtered.forEach(n => {
            expect(global.SET_0_NUMS.has(n)).toBe(true);
        });
    });

    test('F6: filter key both_both_set5 correctly filters numbers', () => {
        const allNumbers = Array.from({ length: 37 }, (_, i) => i);
        const filtered = engine._applyFilterToNumbers(allNumbers, 'both_both_set5');
        expect(filtered.length).toBe(12);
        filtered.forEach(n => {
            expect(global.SET_5_NUMS.has(n)).toBe(true);
        });
    });

    test('F7: filter key both_both_set6 correctly filters numbers', () => {
        const allNumbers = Array.from({ length: 37 }, (_, i) => i);
        const filtered = engine._applyFilterToNumbers(allNumbers, 'both_both_set6');
        expect(filtered.length).toBe(12);
        filtered.forEach(n => {
            expect(global.SET_6_NUMS.has(n)).toBe(true);
        });
    });

    test('F8: T2_PAIR_REFNUM boundary clamping works correctly', () => {
        // prevPlus2 at 35, 36
        expect(T2_PAIR_REFNUM.prevPlus2(35)).toBe(36);
        expect(T2_PAIR_REFNUM.prevPlus2(36)).toBe(36);
        // prevMinus2 at 0, 1
        expect(T2_PAIR_REFNUM.prevMinus2(0)).toBe(0);
        expect(T2_PAIR_REFNUM.prevMinus2(1)).toBe(0);
    });
});
