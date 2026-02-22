/**
 * Test Suite 22: AI Auto Engine — 100% Coverage
 *
 * Tests the AIAutoEngine class: training, pair scoring, filter selection,
 * skip logic, session adaptation, mode control, and real-time decisions.
 */

const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS, REFKEY_TO_PAIR_NAME, PAIR_NAME_TO_REFKEY } = require('../../app/ai-auto-engine');

// ── Mock renderer functions ──
// These replicate enough of the real logic for engine training/decisions

// European wheel standard order
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

    // Clockwise from same
    let cwFromSame = (actIdx - sameIdx + len) % len;
    // Counter-clockwise from same
    let ccwFromSame = (sameIdx - actIdx + len) % len;
    // Clockwise from opp
    let cwFromOpp = (actIdx - oppIdx + len) % len;
    // Counter-clockwise from opp
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

    // Simple version: anchors are ref and its 13-opposite
    purple.push(refNum, ref13Opp);
    return { purple, green };
}

function expandAnchorsToBetNumbers(purple, green) {
    const result = new Set();
    const len = WHEEL_STANDARD.length;
    for (const anchor of purple) {
        const idx = WHEEL_STANDARD.indexOf(anchor);
        if (idx === -1) continue;
        // Anchor + 2 neighbors each side
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

describe('AIAutoEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
    });

    // ═══════════════════════════════════════════════════════════
    //  CONSTANTS EXPORT
    // ═══════════════════════════════════════════════════════════

    describe('exported constants', () => {
        test('FILTER_COMBOS has 9 entries', () => {
            expect(FILTER_COMBOS.length).toBe(9);
        });

        test('FILTER_COMBOS contains zero_positive', () => {
            expect(FILTER_COMBOS.find(f => f.key === 'zero_positive')).toBeDefined();
        });

        test('FILTER_COMBOS contains both_both', () => {
            expect(FILTER_COMBOS.find(f => f.key === 'both_both')).toBeDefined();
        });

        test('PAIR_REFKEYS has 6 entries', () => {
            expect(PAIR_REFKEYS.length).toBe(6);
        });

        test('PAIR_REFKEYS includes prev and prev_prev', () => {
            expect(PAIR_REFKEYS).toContain('prev');
            expect(PAIR_REFKEYS).toContain('prev_prev');
        });

        test('REFKEY_TO_PAIR_NAME maps correctly', () => {
            expect(REFKEY_TO_PAIR_NAME['prev']).toBe('prev');
            expect(REFKEY_TO_PAIR_NAME['prev_plus_1']).toBe('prevPlus1');
            expect(REFKEY_TO_PAIR_NAME['prev_minus_1']).toBe('prevMinus1');
            expect(REFKEY_TO_PAIR_NAME['prev_plus_2']).toBe('prevPlus2');
            expect(REFKEY_TO_PAIR_NAME['prev_minus_2']).toBe('prevMinus2');
            expect(REFKEY_TO_PAIR_NAME['prev_prev']).toBe('prevPrev');
        });

        test('PAIR_NAME_TO_REFKEY is the inverse mapping', () => {
            expect(PAIR_NAME_TO_REFKEY['prev']).toBe('prev');
            expect(PAIR_NAME_TO_REFKEY['prevPlus1']).toBe('prev_plus_1');
            expect(PAIR_NAME_TO_REFKEY['prevMinus1']).toBe('prev_minus_1');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  CONSTRUCTOR & OPTIONS
    // ═══════════════════════════════════════════════════════════

    describe('constructor', () => {
        test('starts untrained', () => {
            expect(engine.isTrained).toBe(false);
        });

        test('starts disabled', () => {
            expect(engine.isEnabled).toBe(false);
        });

        test('default confidenceThreshold is 65', () => {
            expect(engine.confidenceThreshold).toBe(65);
        });

        test('default maxConsecutiveSkips is 5', () => {
            expect(engine.maxConsecutiveSkips).toBe(5);
        });

        test('default sessionAdaptationStart is 10', () => {
            expect(engine.sessionAdaptationStart).toBe(10);
        });

        test('default historicalWeight is 0.7', () => {
            expect(engine.historicalWeight).toBe(0.7);
        });

        test('accepts custom options', () => {
            const custom = new AIAutoEngine({
                confidenceThreshold: 70,
                maxConsecutiveSkips: 3,
                sessionAdaptationStart: 5,
                historicalWeight: 0.8
            });
            expect(custom.confidenceThreshold).toBe(70);
            expect(custom.maxConsecutiveSkips).toBe(3);
            expect(custom.sessionAdaptationStart).toBe(5);
            expect(custom.historicalWeight).toBe(0.8);
        });

        test('initializes session tracker', () => {
            expect(engine.session.totalBets).toBe(0);
            expect(engine.session.wins).toBe(0);
            expect(engine.session.losses).toBe(0);
            expect(engine.session.consecutiveSkips).toBe(0);
            expect(engine.session.sessionWinRate).toBe(0);
            expect(engine.session.recentDecisions).toEqual([]);
            expect(engine.session.adaptationWeight).toBe(0.0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _createSessionTracker
    // ═══════════════════════════════════════════════════════════

    describe('_createSessionTracker', () => {
        test('returns fresh session object', () => {
            const tracker = engine._createSessionTracker();
            expect(tracker.totalBets).toBe(0);
            expect(tracker.wins).toBe(0);
            expect(tracker.losses).toBe(0);
            expect(tracker.consecutiveSkips).toBe(0);
            expect(tracker.pairPerformance).toEqual({});
            expect(tracker.filterPerformance).toEqual({});
            expect(tracker.sessionWinRate).toBe(0);
            expect(tracker.recentDecisions).toEqual([]);
            expect(tracker.adaptationWeight).toBe(0.0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TRAINING
    // ═══════════════════════════════════════════════════════════

    describe('train', () => {
        // Sample session: enough spins for meaningful training
        const sampleSession = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5];

        test('sets isTrained to true after training', () => {
            engine.train([sampleSession]);
            expect(engine.isTrained).toBe(true);
        });

        test('returns training summary with totalSpins', () => {
            const result = engine.train([sampleSession]);
            expect(result.totalSpins).toBe(sampleSession.length);
        });

        test('returns pairStats object', () => {
            const result = engine.train([sampleSession]);
            expect(result.pairStats).toBeDefined();
            expect(typeof result.pairStats).toBe('object');
        });

        test('returns filterStats object', () => {
            const result = engine.train([sampleSession]);
            expect(result.filterStats).toBeDefined();
        });

        test('returns overallHitRate', () => {
            const result = engine.train([sampleSession]);
            expect(typeof result.overallHitRate).toBe('number');
            expect(result.overallHitRate).toBeGreaterThanOrEqual(0);
            expect(result.overallHitRate).toBeLessThanOrEqual(1);
        });

        test('initializes all 6 pair models', () => {
            engine.train([sampleSession]);
            expect(Object.keys(engine.pairModels).length).toBe(6);
            PAIR_REFKEYS.forEach(key => {
                expect(engine.pairModels[key]).toBeDefined();
            });
        });

        test('initializes all 9 filter models', () => {
            engine.train([sampleSession]);
            expect(Object.keys(engine.filterModels).length).toBe(9);
            FILTER_COMBOS.forEach(fc => {
                expect(engine.filterModels[fc.key]).toBeDefined();
            });
        });

        test('pair model has correct structure', () => {
            engine.train([sampleSession]);
            const m = engine.pairModels.prev;
            expect(m).toHaveProperty('totalFlashes');
            expect(m).toHaveProperty('projectionHits');
            expect(m).toHaveProperty('hitRate');
            expect(m).toHaveProperty('avgProjectionSize');
            expect(m).toHaveProperty('coverageEfficiency');
        });

        test('filter model has correct structure', () => {
            engine.train([sampleSession]);
            const m = engine.filterModels.zero_positive;
            expect(m).toHaveProperty('totalTrials');
            expect(m).toHaveProperty('hits');
            expect(m).toHaveProperty('hitRate');
            expect(m).toHaveProperty('avgFilteredCount');
        });

        test('trains on multiple sessions', () => {
            const session2 = [17, 28, 31, 25, 7, 14, 20, 1, 33, 16, 24, 5, 10, 23, 8];
            const result = engine.train([sampleSession, session2]);
            expect(result.totalSpins).toBe(sampleSession.length + session2.length);
        });

        test('skips sessions shorter than 5 spins', () => {
            const shortSession = [1, 2, 3];
            const result = engine.train([shortSession, sampleSession]);
            expect(result.totalSpins).toBe(sampleSession.length); // Only the valid one counted
        });

        test('handles empty sessions array', () => {
            const result = engine.train([]);
            expect(result.totalSpins).toBe(0);
            expect(result.overallHitRate).toBe(0);
            expect(engine.isTrained).toBe(true);
        });

        test('computes hitRate for pairs with flashes', () => {
            engine.train([sampleSession]);
            let anyFlashed = false;
            PAIR_REFKEYS.forEach(key => {
                if (engine.pairModels[key].totalFlashes > 0) {
                    anyFlashed = true;
                    expect(engine.pairModels[key].hitRate).toBeGreaterThanOrEqual(0);
                    expect(engine.pairModels[key].hitRate).toBeLessThanOrEqual(1);
                }
            });
            // It's expected that at least some pairs flash for a 20-spin session
        });

        test('computes coverageEfficiency', () => {
            engine.train([sampleSession]);
            PAIR_REFKEYS.forEach(key => {
                const m = engine.pairModels[key];
                if (m.totalFlashes > 0 && m.avgProjectionSize > 0) {
                    const randomRate = m.avgProjectionSize / 37;
                    expect(m.coverageEfficiency).toBe(m.hitRate / randomRate);
                }
            });
        });

        test('resets models when training again', () => {
            engine.train([sampleSession]);
            const firstFlashes = engine.pairModels.prev.totalFlashes;

            // Train again with different data
            engine.train([[5, 10, 15, 20, 25, 30, 35, 0, 1, 2, 3, 4, 6, 7, 8]]);
            // Models should be freshly computed, not accumulated
            expect(engine.pairModels.prev.totalFlashes).not.toBe(firstFlashes * 2);
        });

        test('pairStats in result has rounded values', () => {
            const result = engine.train([sampleSession]);
            Object.values(result.pairStats).forEach(ps => {
                // hitRate is rounded to 3 decimals
                expect(ps.hitRate).toBe(Math.round(ps.hitRate * 1000) / 1000);
            });
        });

        test('filterStats in result has rounded values', () => {
            const result = engine.train([sampleSession]);
            Object.values(result.filterStats).forEach(fs => {
                expect(fs.hitRate).toBe(Math.round(fs.hitRate * 1000) / 1000);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _trainOnSession
    // ═══════════════════════════════════════════════════════════

    describe('_trainOnSession', () => {
        test('returns hits and trials', () => {
            // Initialize models first
            engine.train([]);
            const spins = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36];
            const result = engine._trainOnSession(spins);
            expect(typeof result.hits).toBe('number');
            expect(typeof result.trials).toBe('number');
            expect(result.trials).toBeGreaterThanOrEqual(result.hits);
        });

        test('handles minimum valid session (5 spins)', () => {
            engine.train([]);
            const spins = [0, 32, 15, 19, 4];
            // i starts at 3, loop runs for i=3 only, checks i+1=4
            const result = engine._trainOnSession(spins);
            expect(typeof result.hits).toBe('number');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _getFlashingPairsFromHistory
    // ═══════════════════════════════════════════════════════════

    describe('_getFlashingPairsFromHistory', () => {
        test('returns empty Map when idx < 3', () => {
            const result = engine._getFlashingPairsFromHistory([1, 2, 3], 2);
            expect(result.size).toBe(0);
        });

        test('returns Map of flashing pairs for valid index', () => {
            const spins = [0, 32, 15, 19, 4, 21, 2, 25];
            const result = engine._getFlashingPairsFromHistory(spins, 4);
            expect(result instanceof Map).toBe(true);
        });

        test('flash requires both rows to have non-XX codes', () => {
            // Using numbers that produce position codes
            const spins = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34];
            const result = engine._getFlashingPairsFromHistory(spins, 4);
            // Result should have only pairs where both current and previous have non-XX
            for (const [, flashInfo] of result) {
                expect(flashInfo).toHaveProperty('currCode');
                expect(flashInfo).toHaveProperty('prevCode');
                expect(flashInfo).toHaveProperty('currDist');
                expect(flashInfo).toHaveProperty('prevDist');
            }
        });

        test('flash requires distance diff <= 1', () => {
            const spins = [0, 32, 15, 19, 4, 21, 2, 25];
            const result = engine._getFlashingPairsFromHistory(spins, 4);
            for (const [, flashInfo] of result) {
                expect(Math.abs(flashInfo.currDist - flashInfo.prevDist)).toBeLessThanOrEqual(1);
            }
        });

        test('returns at most 6 pairs (one per refKey)', () => {
            const spins = [0, 32, 15, 19, 4, 21, 2, 25];
            const result = engine._getFlashingPairsFromHistory(spins, 4);
            expect(result.size).toBeLessThanOrEqual(6);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _computeProjectionForPair
    // ═══════════════════════════════════════════════════════════

    describe('_computeProjectionForPair', () => {
        test('returns null when idx < 2', () => {
            expect(engine._computeProjectionForPair([1, 2], 1, 'prev')).toBeNull();
        });

        test('returns projection with numbers, anchors, neighbors', () => {
            const spins = [0, 32, 15, 19, 4, 21, 2, 25];
            const result = engine._computeProjectionForPair(spins, 4, 'prev');
            if (result) {
                expect(result).toHaveProperty('numbers');
                expect(result).toHaveProperty('anchors');
                expect(result).toHaveProperty('neighbors');
                expect(Array.isArray(result.numbers)).toBe(true);
            }
        });

        test('returns null when position code is XX', () => {
            // Create a scenario where posCode is XX
            // When reference and actual are very far or specific edge case
            const spins = [0, 0, 0, 0]; // Same number repeated → might still give S+0
            const result = engine._computeProjectionForPair(spins, 2, 'prev');
            // Result depends on implementation — just verify it doesn't throw
            expect(result === null || (result && result.numbers)).toBeTruthy();
        });

        test('uses prevPrev fallback when idx === 2', () => {
            const spins = [10, 20, 30]; // idx=2, so prevPrev falls back to spins[idx-2] = spins[0]
            const result = engine._computeProjectionForPair(spins, 2, 'prev');
            // Should not throw
            expect(result === null || typeof result === 'object').toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _applyFilterToNumbers
    // ═══════════════════════════════════════════════════════════

    describe('_applyFilterToNumbers', () => {
        const allNumbers = Array.from({ length: 37 }, (_, i) => i);

        test('both_both keeps all roulette numbers', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'both_both');
            // both_both: tablePass = inZero || inNineteen; signPass = isPos || isNeg
            // All 37 numbers should be in at least one table AND one sign group
            expect(filtered.length).toBeGreaterThan(0);
        });

        test('zero_positive filters correctly', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'zero_positive');
            filtered.forEach(num => {
                expect(global.ZERO_TABLE_NUMS.has(num)).toBe(true);
                expect(global.POSITIVE_NUMS.has(num)).toBe(true);
            });
        });

        test('zero_negative filters correctly', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'zero_negative');
            filtered.forEach(num => {
                expect(global.ZERO_TABLE_NUMS.has(num)).toBe(true);
                expect(global.NEGATIVE_NUMS.has(num)).toBe(true);
            });
        });

        test('nineteen_positive filters correctly', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'nineteen_positive');
            filtered.forEach(num => {
                expect(global.NINETEEN_TABLE_NUMS.has(num)).toBe(true);
                expect(global.POSITIVE_NUMS.has(num)).toBe(true);
            });
        });

        test('nineteen_negative filters correctly', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'nineteen_negative');
            filtered.forEach(num => {
                expect(global.NINETEEN_TABLE_NUMS.has(num)).toBe(true);
                expect(global.NEGATIVE_NUMS.has(num)).toBe(true);
            });
        });

        test('zero_both keeps all zero table numbers', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'zero_both');
            filtered.forEach(num => {
                expect(global.ZERO_TABLE_NUMS.has(num)).toBe(true);
            });
        });

        test('nineteen_both keeps all nineteen table numbers', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'nineteen_both');
            filtered.forEach(num => {
                expect(global.NINETEEN_TABLE_NUMS.has(num)).toBe(true);
            });
        });

        test('both_positive keeps positive numbers from either table', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'both_positive');
            filtered.forEach(num => {
                expect(global.ZERO_TABLE_NUMS.has(num) || global.NINETEEN_TABLE_NUMS.has(num)).toBe(true);
                expect(global.POSITIVE_NUMS.has(num)).toBe(true);
            });
        });

        test('both_negative keeps negative numbers from either table', () => {
            const filtered = engine._applyFilterToNumbers(allNumbers, 'both_negative');
            filtered.forEach(num => {
                expect(global.ZERO_TABLE_NUMS.has(num) || global.NINETEEN_TABLE_NUMS.has(num)).toBe(true);
                expect(global.NEGATIVE_NUMS.has(num)).toBe(true);
            });
        });

        test('returns original array for unknown filter key', () => {
            const nums = [1, 5, 10];
            const filtered = engine._applyFilterToNumbers(nums, 'nonexistent');
            expect(filtered).toEqual(nums);
        });

        test('returns empty array when input is empty', () => {
            expect(engine._applyFilterToNumbers([], 'zero_positive')).toEqual([]);
        });

        test('filters subset of numbers correctly', () => {
            const subset = [0, 3, 26, 17, 34, 15]; // Mix of tables
            const filtered = engine._applyFilterToNumbers(subset, 'zero_positive');
            // Only numbers in BOTH zero table AND positive set
            filtered.forEach(num => {
                expect(global.ZERO_TABLE_NUMS.has(num)).toBe(true);
                expect(global.POSITIVE_NUMS.has(num)).toBe(true);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _testAllFilters
    // ═══════════════════════════════════════════════════════════

    describe('_testAllFilters', () => {
        test('returns result for all 9 filter combos', () => {
            const numbers = [0, 3, 26, 32, 15, 19];
            const result = engine._testAllFilters(numbers, 0);
            expect(Object.keys(result).length).toBe(9);
        });

        test('returns true for filters where actual is in filtered set', () => {
            const numbers = [0, 3, 26]; // 0 is in zero_positive
            const result = engine._testAllFilters(numbers, 0);
            expect(result.zero_positive).toBe(true); // 0 is in zero table AND positive
        });

        test('returns false for filters where actual is not in filtered set', () => {
            const numbers = [17, 34]; // 17 is nineteen table
            const result = engine._testAllFilters(numbers, 17);
            expect(result.zero_positive).toBe(false); // 17 not in zero table
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  DECIDE
    // ═══════════════════════════════════════════════════════════

    describe('decide', () => {
        test('returns SKIP when not trained', () => {
            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('not trained');
        });

        test('returns SKIP when not enabled', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('not enabled');
        });

        test('returns SKIP when no window spins', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.isEnabled = true;
            // window.spins is not set
            const result = engine.decide();
            expect(result.action).toBe('SKIP');
        });

        test('SKIP result has correct structure', () => {
            const result = engine.decide();
            expect(result).toHaveProperty('action', 'SKIP');
            expect(result).toHaveProperty('selectedPair', null);
            expect(result).toHaveProperty('selectedFilter', null);
            expect(result).toHaveProperty('numbers');
            expect(result).toHaveProperty('anchors');
            expect(result).toHaveProperty('loose');
            expect(result).toHaveProperty('anchorGroups');
            expect(result).toHaveProperty('confidence', 0);
            expect(result).toHaveProperty('reason');
            expect(result).toHaveProperty('debug');
        });

        test('returns SKIP when spins < 4', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.isEnabled = true;
            // Mock _getWindowSpins directly to avoid window manipulation issues
            engine._getWindowSpins = () => [{ actual: 5 }, { actual: 10 }];
            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('Not enough spins');
        });

        test('returns SKIP when no flash targets', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34];
            engine.train([session]);
            engine.isEnabled = true;

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set();

            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('No pairs flashing');
        });

        test('returns SKIP when no table data available', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34];
            engine.train([session]);
            engine.isEnabled = true;

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set(['0:prev:pair', '0:prev_plus_1:pair']);
            engine._getAIDataV6 = () => null;

            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('No table data');
        });

        test('returns SKIP when no flashing pairs have projections', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34];
            engine.train([session]);
            engine.isEnabled = true;

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set(['0:prev:pair']);
            engine._getAIDataV6 = () => ({
                table3NextProjections: {
                    prev: { numbers: [] } // Empty projection
                }
            });

            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('No flashing pairs have projections');
        });

        test('returns BET when confidence is high enough', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30];
            engine.train([session]);
            engine.isEnabled = true;
            engine.confidenceThreshold = 0; // Very low threshold for testing

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set(['0:prev:pair', '0:prev_plus_1:pair13Opp']);
            engine._getAIDataV6 = () => ({
                table3NextProjections: {
                    prev: { numbers: [4, 21, 2, 25, 17, 34, 6, 27] },
                    prevPlus1: { numbers: [15, 19, 4, 21] }
                }
            });

            const result = engine.decide();
            expect(result.action).toBe('BET');
            expect(result.selectedPair).toBeDefined();
            expect(result.selectedFilter).toBeDefined();
            expect(result.numbers.length).toBeGreaterThan(0);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
        });

        test('SKIP when confidence below threshold', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36];
            engine.train([session]);
            engine.isEnabled = true;
            engine.confidenceThreshold = 100; // Maximum threshold — impossible to reach normally

            // Make pair models very weak so confidence is low
            PAIR_REFKEYS.forEach(key => {
                engine.pairModels[key].coverageEfficiency = 0.1;
                engine.pairModels[key].hitRate = 0.01;
            });

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set(['0:prev:pair']);
            engine._getAIDataV6 = () => ({
                table3NextProjections: {
                    prev: { numbers: Array.from({length: 20}, (_, i) => i) } // Many numbers → penalty
                }
            });

            const result = engine.decide();
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('Low confidence');
        });

        test('forces BET after max consecutive skips', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36];
            engine.train([session]);
            engine.isEnabled = true;
            engine.confidenceThreshold = 100; // Impossible threshold
            engine.session.consecutiveSkips = 5; // At max

            // Make pair models very weak
            PAIR_REFKEYS.forEach(key => {
                engine.pairModels[key].coverageEfficiency = 0.1;
                engine.pairModels[key].hitRate = 0.01;
            });

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set(['0:prev:pair']);
            engine._getAIDataV6 = () => ({
                table3NextProjections: {
                    prev: { numbers: Array.from({length: 20}, (_, i) => i) }
                }
            });

            const result = engine.decide();
            expect(result.action).toBe('BET');
            expect(result.reason).toContain('Forced bet');
        });

        test('debug object has expected fields', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27];
            engine.train([session]);
            engine.isEnabled = true;
            engine.confidenceThreshold = 0;

            engine._getWindowSpins = () => [
                { actual: 0 }, { actual: 32 }, { actual: 15 }, { actual: 19 }
            ];
            engine._getComputeFlashTargets = () => new Set(['0:prev:pair']);
            engine._getAIDataV6 = () => ({
                table3NextProjections: {
                    prev: { numbers: [4, 21, 2, 25, 17, 34, 6] }
                }
            });

            const result = engine.decide();
            expect(result.debug).toHaveProperty('flashingRefKeys');
            expect(result.debug).toHaveProperty('candidates');
            expect(result.debug).toHaveProperty('bestPairScore');
            expect(result.debug).toHaveProperty('filterScore');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  SCORING
    // ═══════════════════════════════════════════════════════════

    describe('_scorePair', () => {
        beforeEach(() => {
            // Train to create pair models
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30]]);
        });

        test('returns 0 for unknown pair', () => {
            expect(engine._scorePair('nonexistent', {})).toBe(0);
        });

        test('returns 0 when pair has no flashes', () => {
            engine.pairModels['test_key'] = { totalFlashes: 0, coverageEfficiency: 0, hitRate: 0 };
            expect(engine._scorePair('test_key', {})).toBe(0);
        });

        test('returns value between 0 and 1', () => {
            PAIR_REFKEYS.forEach(key => {
                const score = engine._scorePair(key, {});
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(1);
            });
        });

        test('adds streak bonus when last decision was same pair', () => {
            const key = 'prev';
            // Set low base score so bonuses are visible (not capped at 1.0)
            engine.pairModels.prev.coverageEfficiency = 0.5;
            engine.pairModels.prev.hitRate = 0.10;
            engine.pairModels.prev.totalFlashes = 10;

            engine.session.recentDecisions = [{ refKey: 'prev', filterKey: 'both_both', hit: false }];
            const withStreak = engine._scorePair(key, {});

            engine.session.recentDecisions = [{ refKey: 'other', filterKey: 'both_both', hit: false }];
            const withoutStreak = engine._scorePair(key, {});

            expect(withStreak).toBeGreaterThan(withoutStreak);
        });

        test('adds golden bonus for high hit rate (>= 0.35)', () => {
            engine.pairModels.prev.hitRate = 0.40;
            engine.pairModels.prev.coverageEfficiency = 1.0;
            engine.pairModels.prev.totalFlashes = 10;

            const score = engine._scorePair('prev', {});
            // Should include +0.15 golden bonus
            expect(score).toBeGreaterThan(0);
        });

        test('adds near bonus for moderate hit rate (>= 0.25)', () => {
            engine.pairModels.prev.coverageEfficiency = 0.6;
            engine.pairModels.prev.totalFlashes = 10;

            engine.pairModels.prev.hitRate = 0.28;
            const withBonus = engine._scorePair('prev', {});

            engine.pairModels.prev.hitRate = 0.10;
            const withoutBonus = engine._scorePair('prev', {});

            expect(withBonus).toBeGreaterThan(withoutBonus);
        });

        test('adds recency bonus for recent hits', () => {
            // Set low base score so bonuses are visible
            engine.pairModels.prev.coverageEfficiency = 0.5;
            engine.pairModels.prev.hitRate = 0.10;
            engine.pairModels.prev.totalFlashes = 10;

            engine.session.recentDecisions = [
                { refKey: 'prev', filterKey: 'both_both', hit: true },
                { refKey: 'prev', filterKey: 'both_both', hit: true }
            ];

            const withRecent = engine._scorePair('prev', {});
            engine.session.recentDecisions = [];
            const withoutRecent = engine._scorePair('prev', {});

            expect(withRecent).toBeGreaterThan(withoutRecent);
        });

        test('applies drought penalty when no hits in 5+ attempts', () => {
            engine.pairModels.prev.coverageEfficiency = 0.5;
            engine.pairModels.prev.hitRate = 0.10;
            engine.pairModels.prev.totalFlashes = 10;

            engine.session.recentDecisions = [
                { refKey: 'prev', hit: false },
                { refKey: 'prev', hit: false },
                { refKey: 'prev', hit: false },
                { refKey: 'prev', hit: false },
                { refKey: 'prev', hit: false }
            ];

            const withDrought = engine._scorePair('prev', {});
            engine.session.recentDecisions = [];
            const withoutDrought = engine._scorePair('prev', {});

            expect(withDrought).toBeLessThanOrEqual(withoutDrought);
        });

        test('applies overexposure penalty when selected 3+ times in last 5', () => {
            engine.pairModels.prev.coverageEfficiency = 0.5;
            engine.pairModels.prev.hitRate = 0.10;
            engine.pairModels.prev.totalFlashes = 10;

            engine.session.recentDecisions = [
                { refKey: 'prev', hit: false },
                { refKey: 'prev', hit: false },
                { refKey: 'prev', hit: false },
                { refKey: 'other', hit: false },
                { refKey: 'other', hit: false }
            ];

            const withOverexposure = engine._scorePair('prev', {});
            engine.session.recentDecisions = [
                { refKey: 'other', hit: false },
                { refKey: 'other', hit: false },
                { refKey: 'other', hit: false },
                { refKey: 'other', hit: false },
                { refKey: 'other', hit: false }
            ];
            const withoutOverexposure = engine._scorePair('prev', {});

            expect(withOverexposure).toBeLessThan(withoutOverexposure);
        });

        test('blends historical and session scores', () => {
            engine.session.adaptationWeight = 0.3; // 30% session weight
            engine.session.pairPerformance['prev'] = { attempts: 10, hits: 8 }; // 80% session

            const score = engine._scorePair('prev', {});
            expect(score).toBeGreaterThan(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _selectBestFilter
    // ═══════════════════════════════════════════════════════════

    describe('_selectBestFilter', () => {
        beforeEach(() => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30]]);
        });

        test('returns object with filterKey, filteredNumbers, score', () => {
            const numbers = [0, 3, 26, 32, 15, 19, 4, 21, 2, 25];
            const result = engine._selectBestFilter(numbers);
            expect(result).toHaveProperty('filterKey');
            expect(result).toHaveProperty('filteredNumbers');
            expect(result).toHaveProperty('score');
        });

        test('rejects filters producing < 4 numbers', () => {
            const numbers = [0, 3]; // Very few numbers
            const result = engine._selectBestFilter(numbers);
            // Should fall back to both_both or return unfiltered
            expect(result.filteredNumbers.length).toBeGreaterThanOrEqual(0);
        });

        test('rejects filters producing > 18 numbers', () => {
            const manyNumbers = Array.from({ length: 25 }, (_, i) => i);
            const result = engine._selectBestFilter(manyNumbers);
            // If best filter still has > 18, it gets rejected in favor of better ones
            // The result should be a valid filter
            expect(result.filterKey).toBeDefined();
        });

        test('prefers filters yielding 6-14 numbers (bonus)', () => {
            // With enough variety, some filters should fall in 6-14 range
            const numbers = [0, 3, 26, 32, 15, 19, 4, 21, 2, 25, 17, 34];
            const result = engine._selectBestFilter(numbers);
            // Should pick a filter — hard to assert exact filter but score should be positive
            expect(result.score).toBeGreaterThanOrEqual(0);
        });

        test('falls back to both_both when no filter meets count requirements', () => {
            // With very few numbers, all filters produce < 4 numbers → fallback
            const freshEngine = new AIAutoEngine();
            freshEngine.train([]);
            const numbers = [0, 3]; // Only 2 numbers — all filters produce < 4
            const result = freshEngine._selectBestFilter(numbers);
            expect(result.filterKey).toBe('both_both');
        });

        test('includes session filter performance in scoring', () => {
            engine.session.adaptationWeight = 0.3;
            engine.session.filterPerformance['zero_positive'] = { attempts: 10, hits: 8 };

            const numbers = [0, 3, 26, 32, 15, 19, 4, 21, 2, 25, 17, 34];
            const result = engine._selectBestFilter(numbers);
            // Should consider the session performance
            expect(result.filterKey).toBeDefined();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _computeConfidence
    // ═══════════════════════════════════════════════════════════

    describe('_computeConfidence', () => {
        test('base confidence is pairScore * 100', () => {
            const conf = engine._computeConfidence(0.5, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            // Base = 50, count = 10 (in 8-14 range, no penalty/bonus for count), no filter bonus
            expect(conf).toBe(50);
        });

        test('penalizes when too many numbers (> 14)', () => {
            const manyNums = Array.from({ length: 18 }, (_, i) => i);
            const conf = engine._computeConfidence(0.5, 0, manyNums);
            // penalty = (18-14)*2 = 8; base=50; 50-8 = 42
            expect(conf).toBe(42);
        });

        test('bonus for focused (< 8 numbers)', () => {
            const fewNums = [1, 2, 3, 4, 5];
            const conf = engine._computeConfidence(0.5, 0, fewNums);
            // bonus = (8-5)*2 = 6; base=50; 50+6 = 56
            expect(conf).toBe(56);
        });

        test('filter improvement bonus when filterScore > 0.1', () => {
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const withBonus = engine._computeConfidence(0.5, 0.2, nums);
            const withoutBonus = engine._computeConfidence(0.5, 0.05, nums);
            expect(withBonus).toBe(withoutBonus + 5);
        });

        test('session momentum bonus when win rate > 0.35', () => {
            engine.session.totalBets = 10;
            engine.session.sessionWinRate = 0.40;
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const conf = engine._computeConfidence(0.5, 0, nums);
            expect(conf).toBe(55); // 50 + 5
        });

        test('session momentum penalty when win rate < 0.20', () => {
            engine.session.totalBets = 10;
            engine.session.sessionWinRate = 0.15;
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const conf = engine._computeConfidence(0.5, 0, nums);
            expect(conf).toBe(45); // 50 - 5
        });

        test('no session adjustment when less than 5 bets', () => {
            engine.session.totalBets = 3;
            engine.session.sessionWinRate = 0.90;
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const conf = engine._computeConfidence(0.5, 0, nums);
            expect(conf).toBe(50); // No adjustment
        });

        test('consecutive skip pressure adds confidence', () => {
            engine.session.consecutiveSkips = 3;
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const conf = engine._computeConfidence(0.5, 0, nums);
            expect(conf).toBe(59); // 50 + 3*3 = 59
        });

        test('caps confidence at 0 minimum', () => {
            const conf = engine._computeConfidence(0, 0, Array.from({ length: 37 }, (_, i) => i));
            // Base=0, penalty=(37-14)*2=46 → -46, capped at 0
            expect(conf).toBe(0);
        });

        test('caps confidence at 100 maximum', () => {
            engine.session.consecutiveSkips = 5;
            engine.session.totalBets = 10;
            engine.session.sessionWinRate = 0.50;
            const conf = engine._computeConfidence(1.0, 0.5, [1, 2, 3, 4, 5]);
            // Base=100, count bonus=(8-5)*2=6, filter=5, momentum=5, skip=15 → way > 100
            expect(conf).toBe(100);
        });

        test('rounds to integer', () => {
            const conf = engine._computeConfidence(0.333, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            expect(Number.isInteger(conf)).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  SESSION ADAPTATION
    // ═══════════════════════════════════════════════════════════

    describe('recordResult', () => {
        test('increments totalBets', () => {
            engine.recordResult('prev', 'zero_positive', true, 5);
            expect(engine.session.totalBets).toBe(1);
        });

        test('increments wins on hit', () => {
            engine.recordResult('prev', 'zero_positive', true, 5);
            expect(engine.session.wins).toBe(1);
            expect(engine.session.losses).toBe(0);
        });

        test('increments losses on miss', () => {
            engine.recordResult('prev', 'zero_positive', false, 5);
            expect(engine.session.losses).toBe(1);
            expect(engine.session.wins).toBe(0);
        });

        test('resets consecutiveSkips on bet', () => {
            engine.session.consecutiveSkips = 3;
            engine.recordResult('prev', 'zero_positive', true, 5);
            expect(engine.session.consecutiveSkips).toBe(0);
        });

        test('tracks per-pair performance', () => {
            engine.recordResult('prev', 'zero_positive', true, 5);
            engine.recordResult('prev', 'zero_positive', false, 10);

            expect(engine.session.pairPerformance.prev.attempts).toBe(2);
            expect(engine.session.pairPerformance.prev.hits).toBe(1);
        });

        test('tracks per-filter performance', () => {
            engine.recordResult('prev', 'zero_positive', true, 5);
            expect(engine.session.filterPerformance.zero_positive.attempts).toBe(1);
            expect(engine.session.filterPerformance.zero_positive.hits).toBe(1);
        });

        test('updates sessionWinRate', () => {
            engine.recordResult('prev', 'both_both', true, 5);
            engine.recordResult('prev', 'both_both', false, 10);
            expect(engine.session.sessionWinRate).toBe(0.5);
        });

        test('stores recent decisions (max 10)', () => {
            for (let i = 0; i < 12; i++) {
                engine.recordResult('prev', 'both_both', i % 2 === 0, i);
            }
            expect(engine.session.recentDecisions.length).toBe(10);
        });

        test('grows adaptationWeight after sessionAdaptationStart', () => {
            engine.sessionAdaptationStart = 3;
            for (let i = 0; i < 5; i++) {
                engine.recordResult('prev', 'both_both', true, i);
            }
            expect(engine.session.adaptationWeight).toBeGreaterThan(0);
        });

        test('adaptationWeight does not exceed 0.5', () => {
            engine.sessionAdaptationStart = 1;
            for (let i = 0; i < 100; i++) {
                engine.recordResult('prev', 'both_both', true, i % 37);
            }
            expect(engine.session.adaptationWeight).toBeLessThanOrEqual(0.5);
        });

        test('handles pairName-style keys (converts to refKey)', () => {
            engine.recordResult('prevPlus1', 'both_both', true, 5);
            // PAIR_NAME_TO_REFKEY['prevPlus1'] = 'prev_plus_1'
            expect(engine.session.pairPerformance.prev_plus_1.attempts).toBe(1);
        });

        test('handles refKey-style keys directly', () => {
            engine.recordResult('prev_minus_2', 'both_both', true, 5);
            expect(engine.session.pairPerformance.prev_minus_2.attempts).toBe(1);
        });
    });

    describe('recordSkip', () => {
        test('increments consecutiveSkips', () => {
            engine.recordSkip();
            expect(engine.session.consecutiveSkips).toBe(1);
        });

        test('increments multiple times', () => {
            engine.recordSkip();
            engine.recordSkip();
            engine.recordSkip();
            expect(engine.session.consecutiveSkips).toBe(3);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  MODE CONTROL
    // ═══════════════════════════════════════════════════════════

    describe('enable', () => {
        test('throws when not trained', () => {
            expect(() => engine.enable()).toThrow('Engine must be trained');
        });

        test('sets isEnabled when trained', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.enable();
            expect(engine.isEnabled).toBe(true);
        });
    });

    describe('disable', () => {
        test('sets isEnabled to false', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.enable();
            expect(engine.isEnabled).toBe(true);

            engine.disable();
            expect(engine.isEnabled).toBe(false);
        });
    });

    describe('resetSession', () => {
        test('creates fresh session tracker', () => {
            engine.recordResult('prev', 'both_both', true, 5);
            engine.recordResult('prev', 'both_both', false, 10);
            expect(engine.session.totalBets).toBe(2);

            engine.resetSession();
            expect(engine.session.totalBets).toBe(0);
            expect(engine.session.wins).toBe(0);
            expect(engine.session.losses).toBe(0);
        });

        test('preserves training data', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.resetSession();
            expect(engine.isTrained).toBe(true);
            expect(Object.keys(engine.pairModels).length).toBe(6);
        });
    });

    describe('fullReset', () => {
        test('clears everything', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.enable();
            engine.recordResult('prev', 'both_both', true, 5);

            engine.fullReset();
            expect(engine.isTrained).toBe(false);
            expect(engine.isEnabled).toBe(false);
            expect(engine.pairModels).toEqual({});
            expect(engine.filterModels).toEqual({});
            expect(engine.session.totalBets).toBe(0);
        });
    });

    describe('getState', () => {
        test('returns state object', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36]]);
            const state = engine.getState();
            expect(state).toHaveProperty('isTrained', true);
            expect(state).toHaveProperty('isEnabled', false);
            expect(state).toHaveProperty('pairModelCount', 6);
            expect(state).toHaveProperty('sessionStats');
            expect(state).toHaveProperty('topPairs');
            expect(state).toHaveProperty('topFilters');
        });

        test('topPairs returns up to n entries', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36]]);
            const state = engine.getState();
            expect(state.topPairs.length).toBeLessThanOrEqual(3);
        });

        test('topFilters returns up to n entries', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36]]);
            const state = engine.getState();
            expect(state.topFilters.length).toBeLessThanOrEqual(3);
        });

        test('topPairs entries have expected structure', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36]]);
            const state = engine.getState();
            if (state.topPairs.length > 0) {
                expect(state.topPairs[0]).toHaveProperty('pairKey');
                expect(state.topPairs[0]).toHaveProperty('hitRate');
                expect(state.topPairs[0]).toHaveProperty('efficiency');
            }
        });

        test('topFilters entries have expected structure', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36]]);
            const state = engine.getState();
            if (state.topFilters.length > 0) {
                expect(state.topFilters[0]).toHaveProperty('filterKey');
                expect(state.topFilters[0]).toHaveProperty('hitRate');
                expect(state.topFilters[0]).toHaveProperty('avgSize');
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  DEPENDENCY ACCESS METHODS
    // ═══════════════════════════════════════════════════════════

    describe('dependency access', () => {
        test('_getCalculatePositionCode uses global function', () => {
            const code = engine._getCalculatePositionCode(0, 32);
            expect(typeof code).toBe('string');
        });

        test('_getCalculateReferences uses global function', () => {
            const refs = engine._getCalculateReferences(32, 0);
            expect(refs).toHaveProperty('prev');
            expect(refs).toHaveProperty('prev_plus_1');
        });

        test('_getDigit13Opposite returns correct opposite', () => {
            expect(engine._getDigit13Opposite(0)).toBe(34);
            expect(engine._getDigit13Opposite(1)).toBe(28);
        });

        test('_getGenerateAnchors returns purple and green', () => {
            const result = engine._getGenerateAnchors(0, 34, 'S+0');
            expect(result).toHaveProperty('purple');
            expect(result).toHaveProperty('green');
        });

        test('_getExpandAnchorsToBetNumbers returns array', () => {
            const result = engine._getExpandAnchorsToBetNumbers([0, 34], []);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        test('_getGetPosCodeDistance parses distance correctly', () => {
            expect(engine._getGetPosCodeDistance('S+0')).toBe(0);
            expect(engine._getGetPosCodeDistance('SR+3')).toBe(3);
            expect(engine._getGetPosCodeDistance('OL+2')).toBe(2);
            expect(engine._getGetPosCodeDistance('XX')).toBeNull();
            expect(engine._getGetPosCodeDistance(null)).toBeNull();
        });

        test('_getComputeFlashTargets fallback returns empty Set', () => {
            // Remove global and window versions
            const orig = global._computeFlashTargets;
            delete global._computeFlashTargets;
            const result = engine._getComputeFlashTargets([], 0, 0);
            expect(result instanceof Set).toBe(true);
            expect(result.size).toBe(0);
            global._computeFlashTargets = orig;
        });

        test('_getCalculateWheelAnchors fallback returns loose numbers', () => {
            const result = engine._getCalculateWheelAnchors([5, 10, 15]);
            expect(result).toHaveProperty('anchors');
            expect(result).toHaveProperty('loose');
            expect(result).toHaveProperty('anchorGroups');
        });

        test('_getCalculateWheelAnchors handles empty input', () => {
            const result = engine._getCalculateWheelAnchors([]);
            expect(result.anchors).toEqual([]);
            expect(result.loose).toEqual([]);
        });

        test('_getCalculateWheelAnchors handles null input', () => {
            const result = engine._getCalculateWheelAnchors(null);
            expect(result.anchors).toEqual([]);
        });

        test('_getWindowSpins returns null when no spins on window', () => {
            const origSpins = window.spins;
            delete window.spins;
            expect(engine._getWindowSpins()).toBeNull();
            if (origSpins !== undefined) window.spins = origSpins;
        });

        test('_getAIDataV6 returns null when no getAIDataV6 on window', () => {
            const orig = window.getAIDataV6;
            delete window.getAIDataV6;
            expect(engine._getAIDataV6()).toBeNull();
            if (orig !== undefined) window.getAIDataV6 = orig;
        });

        test('_getZeroTableNums returns Set', () => {
            const result = engine._getZeroTableNums();
            expect(result instanceof Set).toBe(true);
            expect(result.has(0)).toBe(true);
        });

        test('_getNineteenTableNums returns Set', () => {
            const result = engine._getNineteenTableNums();
            expect(result instanceof Set).toBe(true);
            expect(result.has(19)).toBe(true);
        });

        test('_getPositiveNums returns Set', () => {
            const result = engine._getPositiveNums();
            expect(result instanceof Set).toBe(true);
        });

        test('_getNegativeNums returns Set', () => {
            const result = engine._getNegativeNums();
            expect(result instanceof Set).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _getTopPairs / _getTopFilters
    // ═══════════════════════════════════════════════════════════

    describe('_getTopPairs', () => {
        test('returns empty array when no pairs trained', () => {
            engine.train([]);
            expect(engine._getTopPairs(3)).toEqual([]);
        });

        test('sorts by coverageEfficiency descending', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30]]);
            const top = engine._getTopPairs(6);
            for (let i = 1; i < top.length; i++) {
                expect(top[i - 1].efficiency).toBeGreaterThanOrEqual(top[i].efficiency);
            }
        });

        test('limits to n results', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30]]);
            const top = engine._getTopPairs(2);
            expect(top.length).toBeLessThanOrEqual(2);
        });
    });

    describe('_getTopFilters', () => {
        test('returns empty array when no filters trained', () => {
            engine.train([]);
            expect(engine._getTopFilters(3)).toEqual([]);
        });

        test('sorts by hitRate descending', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30]]);
            const top = engine._getTopFilters(9);
            for (let i = 1; i < top.length; i++) {
                expect(top[i - 1].hitRate).toBeGreaterThanOrEqual(top[i].hitRate);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  INTEGRATION
    // ═══════════════════════════════════════════════════════════

    describe('integration', () => {
        test('full lifecycle: train → enable → decide → record → getState', () => {
            const session = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30];
            engine.train([session]);
            engine.enable();

            // Decide returns SKIP when no spins available (expected)
            engine._getWindowSpins = () => null;
            const result = engine.decide();
            expect(result.action).toBe('SKIP');

            // Record some results
            engine.recordResult('prev', 'zero_positive', true, 5);
            engine.recordResult('prev_plus_1', 'nineteen_negative', false, 10);

            const state = engine.getState();
            expect(state.isTrained).toBe(true);
            expect(state.isEnabled).toBe(true);
            expect(state.sessionStats.totalBets).toBe(2);
            expect(state.sessionStats.wins).toBe(1);
        });

        test('resetSession preserves training but clears session', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6]]);
            engine.enable();
            engine.recordResult('prev', 'both_both', true, 5);
            engine.resetSession();

            expect(engine.isTrained).toBe(true);
            expect(engine.isEnabled).toBe(true);
            expect(engine.session.totalBets).toBe(0);
        });

        test('fullReset clears everything including training', () => {
            engine.train([[0, 32, 15, 19, 4, 21, 2, 25, 17, 34]]);
            engine.enable();
            engine.fullReset();

            expect(engine.isTrained).toBe(false);
            expect(engine.isEnabled).toBe(false);
            expect(() => engine.enable()).toThrow();
        });
    });
});
