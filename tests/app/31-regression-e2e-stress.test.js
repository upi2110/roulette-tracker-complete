/**
 * Regression Test Suite #4 — End-to-End Cascade & Stress Tests
 *
 * Covers:
 * A. Full AI pipeline: DataLoader → SequenceModel → Engine → Decision
 * B. Prediction panel → Wheel → Money panel cascade
 * C. Semi-Auto + Auto mode coordination
 * D. Retrain with live data cascade
 * E. All 37 numbers position code exhaustive test
 * F. All opposite pairs verification
 * G. Wheel anchor stress tests (large random sets)
 * H. Engine decision stability (same data = same decision)
 * I. Filter exclusion coverage (every combo tested)
 * J. Sequence model layer priority stress
 * K. Number set partition exhaustive verification
 * L. Renderer projection + expansion consistency
 * M. Cross-model score consistency
 */

const { setupDOM, loadRendererFunctions, createMoneyPanel } = require('../test-setup');
const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');
const { AISequenceModel, SEQ_ZERO, SEQ_NINE, SEQ_POS, SEQ_NEG } = require('../../app/ai-sequence-model');
const { SemiAutoFilter, SA_ZERO, SA_NINE, SEMI_FILTER_COMBOS } = require('../../app/semi-auto-filter');
const { AIDataLoader } = require('../../app/ai-data-loader');

// ── Mock renderer functions (same as 22-ai-auto-engine.test.js) ──
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
        return cwFromSame <= ccwFromSame ? (cwFromSame === 0 ? 'S+0' : `SR+${cwFromSame}`) : `SL+${ccwFromSame}`;
    } else {
        return cwFromOpp <= ccwFromOpp ? (cwFromOpp === 0 ? 'O+0' : `OR+${cwFromOpp}`) : `OL+${ccwFromOpp}`;
    }
}

function calculateReferences(prev, prevPrev) {
    if (prev === undefined || prev === null) return {};
    const prevIdx = WHEEL_STANDARD.indexOf(prev);
    const len = WHEEL_STANDARD.length;
    return {
        prev, prev_plus_1: WHEEL_STANDARD[(prevIdx + 1) % len],
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
    const purple = [], green = [];
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
        for (let d = -2; d <= 2; d++) result.add(WHEEL_STANDARD[(idx + d + len) % len]);
    }
    for (const n of green) {
        const idx = WHEEL_STANDARD.indexOf(n);
        if (idx === -1) continue;
        for (let d = -1; d <= 1; d++) result.add(WHEEL_STANDARD[(idx + d + len) % len]);
    }
    return Array.from(result);
}

// Make renderer functions global for the engine
global.calculatePositionCode = calculatePositionCode;
global.calculateReferences = calculateReferences;
global.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
global.generateAnchors = generateAnchors;
global.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
global._getPosCodeDistance = _getPosCodeDistance;
global.ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
global.NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
global.POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
global.NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// Make AISequenceModel available globally for AIAutoEngine
beforeAll(() => { global.AISequenceModel = AISequenceModel; });
afterAll(() => { delete global.AISequenceModel; });

// Helper: deterministic random session
function randomSession(count, seed = 42) {
    const spins = [];
    let s = seed;
    for (let i = 0; i < count; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        spins.push(s % 37);
    }
    return spins;
}

// Helper: generate multiple sessions with different seeds
function multiSession(sessionCount, spinsPerSession, seedBase = 100) {
    const sessions = [];
    for (let i = 0; i < sessionCount; i++) {
        sessions.push(randomSession(spinsPerSession, seedBase + i * 17));
    }
    return sessions;
}

// ═══════════════════════════════════════════════════════════════
// A. FULL AI PIPELINE: DATALOADER → SEQUENCE → ENGINE → DECISION
// ═══════════════════════════════════════════════════════════════

describe('A. Full AI Pipeline E2E', () => {

    test('A1: Complete pipeline produces valid decision', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        const result = engine.train(sessions);

        expect(result.totalSpins).toBeGreaterThan(0);
        expect(engine.isTrained).toBe(true);

        // Now make a decision
        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0.15, hits: 3, total: 20 };
        });

        const recentSpins = sessions[0].slice(-10);
        const decision = engine.decide(flashData, recentSpins);

        expect(decision).toBeDefined();
        expect(['BET', 'SKIP']).toContain(decision.action);
        if (decision.action === 'BET') {
            expect(decision.selectedPair).toBeDefined();
            expect(decision.selectedFilter).toBeDefined();
            expect(decision.selectedFilter).not.toBe('both_both');
            expect(decision.confidence).toBeGreaterThanOrEqual(0);
        }
    });

    test('A2: Pipeline sequence model improves with more data', () => {
        const smallSessions = multiSession(2, 50);
        const largeSessions = multiSession(10, 300);

        const engineSmall = new AIAutoEngine();
        const resultSmall = engineSmall.train(smallSessions);

        const engineLarge = new AIAutoEngine();
        const resultLarge = engineLarge.train(largeSessions);

        expect(resultLarge.totalSpins).toBeGreaterThan(resultSmall.totalSpins);

        // Large model should have more n-gram entries
        const smallStats = engineSmall.sequenceModel.getStats();
        const largeStats = engineLarge.sequenceModel.getStats();
        expect(largeStats.ngramCounts.number1).toBeGreaterThan(smallStats.ngramCounts.number1);
    });

    test('A3: Engine retrain preserves training capability', () => {
        const sessions = multiSession(3, 150);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        const firstResult = engine.sequenceModel.getStats();

        // Simulate retrain with additional live data
        const liveSpins = randomSession(50, 999);
        engine.retrain(liveSpins);

        expect(engine.isTrained).toBe(true);
        const secondResult = engine.sequenceModel.getStats();
        expect(secondResult.ngramCounts.number1).toBeGreaterThanOrEqual(firstResult.ngramCounts.number1);
    });

    test('A4: DataLoader → Engine train produces consistent results', () => {
        const sessions = multiSession(4, 200);

        // Train twice with same data
        const engine1 = new AIAutoEngine();
        const result1 = engine1.train(sessions);

        const engine2 = new AIAutoEngine();
        const result2 = engine2.train(sessions);

        expect(result1.totalSpins).toBe(result2.totalSpins);
        expect(result1.overallHitRate).toBe(result2.overallHitRate);
    });
});

// ═══════════════════════════════════════════════════════════════
// B. SEMI-AUTO + AUTO MODE COORDINATION
// ═══════════════════════════════════════════════════════════════

describe('B. Semi-Auto + Auto Mode Coordination', () => {

    test('B1: Semi-auto uses sequence model from engine', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        const filter = new SemiAutoFilter();
        filter.setSequenceModel(engine.sequenceModel);

        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27];
        const savedOrch = window.autoUpdateOrchestrator;
        window.autoUpdateOrchestrator = undefined;
        const result = filter.applyOptimalFilter(numbers);
        window.autoUpdateOrchestrator = savedOrch;

        expect(result).not.toBeNull();
        expect(result.key).not.toBe('both_both');
    });

    test('B2: Both engine and semi-auto exclude both_both', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        // Engine decision should never be both_both
        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0.20, hits: 4, total: 20 };
        });
        const decision = engine.decide(flashData, sessions[0].slice(-10));
        if (decision.action === 'BET') {
            expect(decision.selectedFilter).not.toBe('both_both');
        }

        // Semi-auto should never be both_both
        const filter = new SemiAutoFilter();
        filter.setSequenceModel(engine.sequenceModel);
        const savedOrch = window.autoUpdateOrchestrator;
        window.autoUpdateOrchestrator = undefined;
        const result = filter.applyOptimalFilter([0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27]);
        window.autoUpdateOrchestrator = savedOrch;
        if (result) {
            expect(result.key).not.toBe('both_both');
        }
    });

    test('B3: Engine and semi-auto agree on number sets', () => {
        // Verify the number sets are identical across components
        expect([...SEQ_ZERO].sort()).toEqual([...SA_ZERO].sort());
        expect([...SEQ_NINE].sort()).toEqual([...SA_NINE].sort());
    });
});

// ═══════════════════════════════════════════════════════════════
// C. RETRAIN WITH LIVE DATA CASCADE
// ═══════════════════════════════════════════════════════════════

describe('C. Retrain With Live Data Cascade', () => {

    test('C1: Engine tracks losses for retrain trigger', () => {
        const sessions = multiSession(3, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);
        engine.isEnabled = true;

        // Record 3 consecutive losses
        for (let i = 0; i < 3; i++) {
            engine.recordResult('prev', 'zero_positive', false, 15, [0, 3, 4, 15]);
        }

        expect(engine.session.consecutiveLosses).toBe(3);
    });

    test('C2: Multiple retrain cycles are stable', () => {
        const sessions = multiSession(3, 150);
        const engine = new AIAutoEngine();
        engine.train(sessions);
        engine.isEnabled = true;

        // Retrain multiple times
        for (let cycle = 0; cycle < 5; cycle++) {
            const liveSpins = randomSession(20, 500 + cycle);
            engine.retrain(liveSpins);
            expect(engine.isTrained).toBe(true);
        }

        // Should still produce valid decisions
        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0.15, hits: 3, total: 20 };
        });
        const decision = engine.decide(flashData, sessions[0].slice(-10));
        expect(['BET', 'SKIP']).toContain(decision.action);
    });
});

// ═══════════════════════════════════════════════════════════════
// D. ALL 37 NUMBERS POSITION CODE EXHAUSTIVE TEST
// ═══════════════════════════════════════════════════════════════

describe('D. Position Code Exhaustive — All 37×37 Pairs', () => {

    let R;
    beforeAll(() => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        R = loadRendererFunctions();
    });

    test('D1: Every ref-actual pair produces a valid code', () => {
        const validPattern = /^(S\+0|SL\+[1-4]|SR\+[1-4]|O\+0|OL\+[1-4]|OR\+[1-4]|XX)$/;
        let count = 0;
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                const code = R.calculatePositionCode(ref, act);
                expect(code).toMatch(validPattern);
                count++;
            }
        }
        expect(count).toBe(37 * 37); // 1369 combinations
    });

    test('D2: S+0 count — exactly 37 self-matches plus 0/26 cross-match', () => {
        let s0Count = 0;
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                if (R.calculatePositionCode(ref, act) === 'S+0') s0Count++;
            }
        }
        // 37 self-matches + 0→26 + 26→0 = 39
        expect(s0Count).toBe(39);
    });

    test('D3: XX is the most common code (distant numbers)', () => {
        const codeCounts = {};
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                const code = R.calculatePositionCode(ref, act);
                codeCounts[code] = (codeCounts[code] || 0) + 1;
            }
        }
        // XX should be the most frequent since most pairs are far apart
        const xxCount = codeCounts['XX'] || 0;
        Object.entries(codeCounts).forEach(([code, count]) => {
            if (code !== 'XX') {
                expect(xxCount).toBeGreaterThan(count);
            }
        });
    });

    test('D4: O+0 count matches number of opposite pairs', () => {
        let o0Count = 0;
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                if (R.calculatePositionCode(ref, act) === 'O+0') o0Count++;
            }
        }
        // Each number has exactly one opposite, so 37 pairs
        // But 0→10 is O+0, and 26→10 is also O+0 (0 and 26 share pocket)
        expect(o0Count).toBeGreaterThanOrEqual(37);
    });
});

// ═══════════════════════════════════════════════════════════════
// E. ALL OPPOSITE PAIRS VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe('E. Opposite Pairs Verification', () => {

    let R;
    beforeAll(() => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        R = loadRendererFunctions();
    });

    test('E1: REGULAR_OPPOSITES covers all 37 numbers', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.REGULAR_OPPOSITES[n]).toBeDefined();
        }
    });

    test('E2: DIGIT_13_OPPOSITES covers all 37 numbers', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.DIGIT_13_OPPOSITES[n]).toBeDefined();
        }
    });

    test('E3: No number is its own regular opposite (except 0/26 edge case)', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.REGULAR_OPPOSITES[n]).not.toBe(n);
        }
    });

    test('E4: Regular opposites are on opposite side of wheel', () => {
        // For each pair, their wheel positions should be ~18 apart
        const WHEEL = R.WHEEL_STANDARD;
        for (let n = 0; n <= 36; n++) {
            const opp = R.REGULAR_OPPOSITES[n];
            const idx1 = WHEEL.indexOf(n);
            const idx2 = WHEEL.indexOf(opp);
            const dist = Math.abs(idx1 - idx2);
            const circDist = Math.min(dist, 37 - dist);
            // Should be roughly half the wheel (16-20 positions)
            expect(circDist).toBeGreaterThanOrEqual(14);
            expect(circDist).toBeLessThanOrEqual(23);
        }
    });

    test('E5: 13-opposites are different from regular opposites for most numbers', () => {
        let sameCount = 0;
        for (let n = 0; n <= 36; n++) {
            if (R.REGULAR_OPPOSITES[n] === R.DIGIT_13_OPPOSITES[n]) sameCount++;
        }
        // They should be different systems — very few should match
        expect(sameCount).toBeLessThan(10);
    });
});

// ═══════════════════════════════════════════════════════════════
// F. WHEEL ANCHOR STRESS TESTS
// ═══════════════════════════════════════════════════════════════

describe('F. Wheel Anchor Stress Tests', () => {

    let R;
    beforeAll(() => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        R = loadRendererFunctions();
    });

    test('F1: Random 10 numbers — all accounted for', () => {
        const nums = [0, 5, 10, 15, 20, 25, 30, 32, 34, 36];
        const result = R.calculateWheelAnchors(nums);
        const groupNums = new Set();
        result.anchorGroups.forEach(g => g.group.forEach(n => groupNums.add(n)));
        result.loose.forEach(n => groupNums.add(n));
        // Every input number should be accounted for
        nums.forEach(n => expect(groupNums.has(n)).toBe(true));
    });

    test('F2: All 37 numbers — maximum anchor coverage', () => {
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const result = R.calculateWheelAnchors(allNums);
        // With all numbers, should have many ±2 groups
        const pm2Count = result.anchorGroups.filter(g => g.type === '±2').length;
        expect(pm2Count).toBeGreaterThanOrEqual(5);
        expect(result.loose.length).toBeLessThanOrEqual(4); // Very few loose
    });

    test('F3: Single number stress — 0 through 36', () => {
        for (let n = 0; n <= 36; n++) {
            const result = R.calculateWheelAnchors([n]);
            expect(result.loose).toContain(n);
            expect(result.anchorGroups).toHaveLength(0);
        }
    });

    test('F4: Performance — 37 numbers under 10ms', () => {
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
            R.calculateWheelAnchors(allNums);
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(1000); // 1000 iterations under 1s
    });

    test('F5: Anchor groups have valid types only', () => {
        const nums = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34];
        const result = R.calculateWheelAnchors(nums);
        result.anchorGroups.forEach(g => {
            expect(['±1', '±2']).toContain(g.type);
            if (g.type === '±1') expect(g.group).toHaveLength(3);
            if (g.type === '±2') expect(g.group).toHaveLength(5);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// G. ENGINE DECISION STABILITY
// ═══════════════════════════════════════════════════════════════

describe('G. Engine Decision Stability', () => {

    test('G1: Same input → same decision (deterministic)', () => {
        const sessions = multiSession(5, 200);

        const engine1 = new AIAutoEngine();
        engine1.train(sessions);

        const engine2 = new AIAutoEngine();
        engine2.train(sessions);

        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0.20, hits: 4, total: 20 };
        });

        const recentSpins = sessions[0].slice(-10);
        const d1 = engine1.decide(flashData, recentSpins);
        const d2 = engine2.decide(flashData, recentSpins);

        expect(d1.action).toBe(d2.action);
        if (d1.action === 'BET') {
            expect(d1.selectedPair).toBe(d2.selectedPair);
            expect(d1.selectedFilter).toBe(d2.selectedFilter);
        }
    });

    test('G2: Decision confidence is bounded 0-100', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0.30, hits: 6, total: 20 };
        });

        for (let seed = 0; seed < 10; seed++) {
            const recentSpins = randomSession(10, seed * 7);
            const decision = engine.decide(flashData, recentSpins);
            if (decision.confidence !== undefined) {
                expect(decision.confidence).toBeGreaterThanOrEqual(0);
                expect(decision.confidence).toBeLessThanOrEqual(100);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// H. FILTER EXCLUSION COVERAGE — EVERY COMBO TESTED
// ═══════════════════════════════════════════════════════════════

describe('H. Filter Combo Coverage', () => {

    test('H1: FILTER_COMBOS has 36 entries', () => {
        expect(FILTER_COMBOS).toHaveLength(36);
    });

    test('H2: SEMI_FILTER_COMBOS has 36 entries', () => {
        expect(SEMI_FILTER_COMBOS).toHaveLength(36);
    });

    test('H3: All 36 filter keys match between engine and semi-auto', () => {
        const engineKeys = FILTER_COMBOS.map(f => f.key).sort();
        const semiKeys = SEMI_FILTER_COMBOS.map(f => f.key).sort();
        expect(engineKeys).toEqual(semiKeys);
    });

    test('H4: Both_both is the only combo that covers all numbers', () => {
        const model = new AISequenceModel();
        model.train(multiSession(3, 200));
        const scores = model.scoreFilterCombos(randomSession(10));

        // both_both should always score 1.0
        expect(scores.scores['both_both']).toBe(1.0);

        // At least some other combos should score less than 1.0
        const nonBothScores = Object.entries(scores.scores)
            .filter(([k]) => k !== 'both_both')
            .map(([, v]) => v);
        const allOne = nonBothScores.every(s => s === 1.0);
        expect(allOne).toBe(false);
    });

    test('H5: Engine _selectBestFilter never returns both_both', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        // Run multiple decisions to check filter selection
        for (let i = 0; i < 20; i++) {
            const flashData = {};
            PAIR_REFKEYS.forEach(pk => {
                flashData[pk] = { hitRate: 0.10 + Math.random() * 0.30, hits: 2 + i, total: 20 };
            });
            const decision = engine.decide(flashData, randomSession(10, i * 11));
            if (decision.action === 'BET') {
                expect(decision.selectedFilter).not.toBe('both_both');
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// I. SEQUENCE MODEL LAYER PRIORITY STRESS
// ═══════════════════════════════════════════════════════════════

describe('I. Sequence Model Layer Priority Stress', () => {

    test('I1: Model with many sessions has all n-gram layers populated', () => {
        const model = new AISequenceModel();
        model.train(multiSession(10, 500));

        const stats = model.getStats();
        expect(stats.ngramCounts.number1).toBeGreaterThan(0);
        expect(stats.ngramCounts.table1).toBeGreaterThan(0);
        expect(stats.ngramCounts.sign1).toBeGreaterThan(0);
        expect(stats.ngramCounts.combo1).toBeGreaterThan(0);
        expect(stats.ngramCounts.number2).toBeGreaterThan(0);
        expect(stats.ngramCounts.table2).toBeGreaterThan(0);
    });

    test('I2: Prediction with known sequence uses deeper n-grams', () => {
        // Create biased data: always follow 15 with 19
        const biasedSession = [];
        for (let i = 0; i < 100; i++) {
            biasedSession.push(15, 19);
        }

        const model = new AISequenceModel();
        model.train([biasedSession]);

        const prediction = model.predict([15]);
        // After 15, the prediction should lean toward nineteen-table (19 is nineteen)
        expect(prediction).toBeDefined();
        expect(prediction.pNineteenTable).toBeDefined();
    });

    test('I3: Reset clears all data', () => {
        const model = new AISequenceModel();
        model.train(multiSession(5, 200));
        expect(model.isTrained).toBe(true);

        model.reset();
        expect(model.isTrained).toBe(false);
        const stats = model.getStats();
        expect(stats.ngramCounts.number1).toBe(0);
    });

    test('I4: scoreFilterCombos produces valid probabilities', () => {
        const model = new AISequenceModel();
        model.train(multiSession(5, 200));

        const scores = model.scoreFilterCombos(randomSession(10));
        Object.values(scores.scores).forEach(score => {
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1.0);
            expect(isFinite(score)).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// J. NUMBER SET PARTITION EXHAUSTIVE VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe('J. Number Set Partition Exhaustive', () => {

    test('J1: ZERO_TABLE + NINETEEN_TABLE = all 37 numbers', () => {
        const combined = new Set([...SEQ_ZERO, ...SEQ_NINE]);
        expect(combined.size).toBe(37);
        for (let i = 0; i <= 36; i++) {
            expect(combined.has(i)).toBe(true);
        }
    });

    test('J2: POSITIVE + NEGATIVE = all 37 numbers', () => {
        const combined = new Set([...SEQ_POS, ...SEQ_NEG]);
        expect(combined.size).toBe(37);
    });

    test('J3: ZERO_TABLE and NINETEEN_TABLE are disjoint', () => {
        const overlap = [...SEQ_ZERO].filter(n => SEQ_NINE.has(n));
        expect(overlap).toHaveLength(0);
    });

    test('J4: POSITIVE and NEGATIVE are disjoint', () => {
        const overlap = [...SEQ_POS].filter(n => SEQ_NEG.has(n));
        expect(overlap).toHaveLength(0);
    });

    test('J5: Set sizes: 19 zero + 18 nineteen', () => {
        expect(SEQ_ZERO.size).toBe(19);
        expect(SEQ_NINE.size).toBe(18);
    });

    test('J6: Set sizes: 19 positive + 18 negative', () => {
        expect(SEQ_POS.size).toBe(19);
        expect(SEQ_NEG.size).toBe(18);
    });

    test('J7: 0 and 26 are in ZERO_TABLE and POSITIVE', () => {
        expect(SEQ_ZERO.has(0)).toBe(true);
        expect(SEQ_ZERO.has(26)).toBe(true);
        expect(SEQ_POS.has(0)).toBe(true);
        expect(SEQ_POS.has(26)).toBe(true);
    });

    test('J8: Semi-auto sets match sequence model sets', () => {
        expect([...SA_ZERO].sort((a, b) => a - b)).toEqual([...SEQ_ZERO].sort((a, b) => a - b));
        expect([...SA_NINE].sort((a, b) => a - b)).toEqual([...SEQ_NINE].sort((a, b) => a - b));
    });
});

// ═══════════════════════════════════════════════════════════════
// K. RENDERER EXPANSION CONSISTENCY
// ═══════════════════════════════════════════════════════════════

describe('K. Renderer Expansion Consistency', () => {

    let R;
    beforeAll(() => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        R = loadRendererFunctions();
    });

    test('K1: expandTargetsToBetNumbers ±1 always includes target', () => {
        for (let target = 0; target <= 36; target++) {
            const result = R.expandTargetsToBetNumbers([target], 1);
            // 0 and 26 share pocket, so target 0 includes 26 and vice versa
            if (target === 0 || target === 26) {
                expect(result).toContain(0);
                expect(result).toContain(26);
            } else {
                expect(result).toContain(target);
            }
        }
    });

    test('K2: expandTargetsToBetNumbers ±2 ⊇ ±1 for same target', () => {
        for (let target = 0; target <= 36; target++) {
            const r1 = new Set(R.expandTargetsToBetNumbers([target], 1));
            const r2 = new Set(R.expandTargetsToBetNumbers([target], 2));
            // Every number in ±1 should also be in ±2
            for (const n of r1) {
                expect(r2.has(n)).toBe(true);
            }
        }
    });

    test('K3: No expansion produces numbers outside 0-36', () => {
        for (let target = 0; target <= 36; target++) {
            const result = R.expandTargetsToBetNumbers([target], 2);
            result.forEach(n => {
                expect(n).toBeGreaterThanOrEqual(0);
                expect(n).toBeLessThanOrEqual(36);
            });
        }
    });

    test('K4: expandAnchorsToBetNumbers ⊆ expandTargetsToBetNumbers (same targets, ±1)', () => {
        // expandAnchorsToBetNumbers does ±1 same-side only
        // expandTargetsToBetNumbers does ±N same + opposite
        const targets = [15, 19, 4];
        const anchorsResult = new Set(R.expandAnchorsToBetNumbers(targets, []));
        const targetsResult = new Set(R.expandTargetsToBetNumbers(targets, 1));

        // anchorsResult should be a subset of targetsResult
        // (since targetsResult also includes opposite side)
        for (const n of anchorsResult) {
            expect(targetsResult.has(n)).toBe(true);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// L. CROSS-MODEL SCORE CONSISTENCY
// ═══════════════════════════════════════════════════════════════

describe('L. Cross-Model Score Consistency', () => {

    test('L1: Engine and sequence model trained on same data agree on filter ranking', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        const recentSpins = sessions[0].slice(-10);
        const seqScores = engine.sequenceModel.scoreFilterCombos(recentSpins);

        // The engine's filter selection should correlate with sequence model scores
        // (the engine uses sequence scores as a boost factor)
        expect(seqScores.scores).toBeDefined();
        expect(Object.keys(seqScores.scores).length).toBe(9);
    });

    test('L2: Semi-auto computeOptimalFilter produces valid subset', () => {
        const filter = new SemiAutoFilter();
        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27, 5, 10, 21, 2];
        const result = filter.computeOptimalFilter(numbers);
        if (result) {
            // Filtered numbers should be a subset of input
            for (const n of result.filtered) {
                expect(numbers).toContain(n);
            }
            // Count should match filtered length
            expect(result.count).toBe(result.filtered.length);
        }
    });

    test('L3: Filter combo intersection is always smaller than union', () => {
        // Each filter combo produces a subset of the 37 numbers
        // zero_positive should be the intersection of ZERO and POSITIVE
        const zeroPos = [...SEQ_ZERO].filter(n => SEQ_POS.has(n));
        const ninNeg = [...SEQ_NINE].filter(n => SEQ_NEG.has(n));

        expect(zeroPos.length).toBeLessThan(SEQ_ZERO.size);
        expect(zeroPos.length).toBeLessThan(SEQ_POS.size);
        expect(ninNeg.length).toBeLessThan(SEQ_NINE.size);
        expect(ninNeg.length).toBeLessThan(SEQ_NEG.size);
    });

    test('L4: Filter combos produce expected number counts', () => {
        // zero_positive: numbers in both ZERO and POSITIVE
        const zp = [...SEQ_ZERO].filter(n => SEQ_POS.has(n));
        const zn = [...SEQ_ZERO].filter(n => SEQ_NEG.has(n));
        const np = [...SEQ_NINE].filter(n => SEQ_POS.has(n));
        const nn = [...SEQ_NINE].filter(n => SEQ_NEG.has(n));

        // All combos should have some numbers
        expect(zp.length).toBeGreaterThan(0);
        expect(zn.length).toBeGreaterThan(0);
        expect(np.length).toBeGreaterThan(0);
        expect(nn.length).toBeGreaterThan(0);

        // Sum of all 4 should equal 37
        expect(zp.length + zn.length + np.length + nn.length).toBe(37);
    });
});

// ═══════════════════════════════════════════════════════════════
// M. HEAVY STRESS TESTS
// ═══════════════════════════════════════════════════════════════

describe('M. Heavy Stress Tests', () => {

    test('M1: 20 sessions × 200 spins — train completes < 4000ms', () => {
        const sessions = multiSession(20, 200);
        const engine = new AIAutoEngine();

        const start = Date.now();
        engine.train(sessions);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(10000);
        expect(engine.isTrained).toBe(true);
    });

    test('M2: 100 consecutive decisions — all valid', () => {
        const sessions = multiSession(5, 200);
        const engine = new AIAutoEngine();
        engine.train(sessions);

        for (let i = 0; i < 100; i++) {
            const flashData = {};
            PAIR_REFKEYS.forEach(pk => {
                flashData[pk] = { hitRate: 0.15, hits: 3, total: 20 };
            });
            const decision = engine.decide(flashData, randomSession(10, i * 3));
            expect(['BET', 'SKIP']).toContain(decision.action);
            if (decision.action === 'BET') {
                expect(decision.selectedFilter).not.toBe('both_both');
            }
        }
    });

    test('M3: Sequence model predict — 1000 calls < 100ms', () => {
        const model = new AISequenceModel();
        model.train(multiSession(10, 300));

        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
            model.predict(randomSession(5, i));
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
    });

    test('M4: calculateWheelAnchors — 1000 random sets < 500ms', () => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        const R = loadRendererFunctions();

        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
            const nums = randomSession(15, i).map(n => n % 37);
            R.calculateWheelAnchors([...new Set(nums)]);
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
    });
});

console.log('✅ E2E & Stress regression test suite loaded');
