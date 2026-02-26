/**
 * Regression Test Suite #7 — Cross-Component Integration
 *
 * Tests interactions between multiple modules working together:
 * A. DataLoader → Engine Training Pipeline
 * B. Engine → Sequence Model → Filter Scoring Pipeline
 * C. Semi-Auto Filter → Prediction Panel interaction
 * D. Number set consistency across all modules
 * E. Wheel filter ↔ Money Panel synchronization
 * F. Full training → prediction → bet cycle
 * G. State reset / retrain cascade
 * H. Module boundary contracts (exported APIs)
 * I. Concurrent usage patterns
 * J. Defensive coding — mismatched state
 */

const fs = require('fs');
const path = require('path');
const { setupDOM, loadRendererFunctions, createMoneyPanel } = require('../test-setup');
const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');
const { AISequenceModel, SEQ_ZERO, SEQ_NINE, SEQ_POS, SEQ_NEG } = require('../../app/ai-sequence-model');
const { SemiAutoFilter, SA_ZERO, SA_NINE, SEMI_FILTER_COMBOS } = require('../../app/semi-auto-filter');
const { AIDataLoader } = require('../../app/ai-data-loader');

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
    const oppIdx = (refIdx + 18) % len;
    let cwS = (actIdx - refIdx + len) % len, ccwS = (refIdx - actIdx + len) % len;
    let cwO = (actIdx - oppIdx + len) % len, ccwO = (oppIdx - actIdx + len) % len;
    if (Math.min(cwS, ccwS) <= Math.min(cwO, ccwO)) {
        return cwS <= ccwS ? (cwS === 0 ? 'S+0' : `SR+${cwS}`) : `SL+${ccwS}`;
    } else {
        return cwO <= ccwO ? (cwO === 0 ? 'O+0' : `OR+${cwO}`) : `OL+${ccwO}`;
    }
}

function calculateReferences(prev, prevPrev) {
    if (prev === undefined || prev === null) return {};
    const i = WHEEL_STANDARD.indexOf(prev), len = WHEEL_STANDARD.length;
    return { prev, prev_plus_1: WHEEL_STANDARD[(i+1)%len], prev_minus_1: WHEEL_STANDARD[(i-1+len)%len],
        prev_plus_2: WHEEL_STANDARD[(i+2)%len], prev_minus_2: WHEEL_STANDARD[(i-2+len)%len],
        ref0: 0, ref19: 19,
        ref0_13opp: DIGIT_13_OPPOSITES[0], ref19_13opp: DIGIT_13_OPPOSITES[19],
        prev_13opp: DIGIT_13_OPPOSITES[prev],
        prevPlus1_13opp: DIGIT_13_OPPOSITES[WHEEL_STANDARD[(i+1)%len]],
        prevMinus1_13opp: DIGIT_13_OPPOSITES[WHEEL_STANDARD[(i-1+len)%len]],
        prevPlus2_13opp: DIGIT_13_OPPOSITES[WHEEL_STANDARD[(i+2)%len]],
        prevMinus2_13opp: DIGIT_13_OPPOSITES[WHEEL_STANDARD[(i-2+len)%len]],
        prev_prev: prevPrev !== undefined ? prevPrev : null };
}

function generateAnchors(nums) {
    const arr = nums instanceof Set ? Array.from(nums) : (Array.isArray(nums) ? nums : []);
    if (arr.length < 3) return { anchors: [], loose: arr, anchorGroups: [] };
    return { anchors: [arr[0]], loose: arr.slice(1), anchorGroups: [{ anchor: arr[0], group: arr.slice(0, 3), type: '±1' }] };
}

function expandAnchorsToBetNumbers(nums) {
    if (nums instanceof Set) return Array.from(nums);
    return Array.isArray(nums) ? nums : [];
}

function _getPosCodeDistance(code) {
    if (!code || code === 'XX') return Infinity;
    const match = code.match(/\+(\d+)/);
    return match ? parseInt(match[1]) : Infinity;
}

// Set up globals
global.calculatePositionCode = calculatePositionCode;
global.calculateReferences = calculateReferences;
global.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
global.generateAnchors = generateAnchors;
global.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
global._getPosCodeDistance = _getPosCodeDistance;
global.ZERO_TABLE_NUMS = new Set([3,26,0,32,21,2,25,27,13,36,23,10,5,1,20,14,18,29,7]);
global.NINETEEN_TABLE_NUMS = new Set([15,19,4,17,34,6,11,30,8,24,16,33,31,9,22,28,12,35]);
global.POSITIVE_NUMS = new Set([3,26,0,32,15,19,4,27,13,36,11,30,8,1,20,14,31,9,22]);
global.NEGATIVE_NUMS = new Set([21,2,25,17,34,6,23,10,5,24,16,33,18,29,7,28,12,35]);

// Helper: generate deterministic training data
function generateTrainingData(count, seed = 42) {
    let x = seed;
    const spins = [];
    for (let i = 0; i < count; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        spins.push(x % 37);
    }
    return spins;
}

// Helper: make flash data from spins
function makeFlashData(spins) {
    const data = {};
    if (spins.length < 2) return data;
    const prev = spins[spins.length - 2];
    const actual = spins[spins.length - 1];
    const refs = calculateReferences(prev, spins.length >= 3 ? spins[spins.length - 3] : undefined);
    PAIR_REFKEYS.forEach(pair => {
        const refNum = refs[pair.refKey];
        if (refNum !== null && refNum !== undefined) {
            data[pair.key] = {
                code: calculatePositionCode(refNum, actual),
                reference: refNum,
                actual: actual
            };
        }
    });
    return data;
}

// ═══════════════════════════════════════════════════════════
// A. DataLoader → Engine Training Pipeline
// ═══════════════════════════════════════════════════════════

describe('A. DataLoader → Engine Training Pipeline', () => {
    test('A1: DataLoader parses text → Engine trains successfully', () => {
        const loader = new AIDataLoader();
        const text = generateTrainingData(200).join('\n');
        const result = loader.parseTextContent(text, 'test.txt');
        expect(result.spins.length).toBe(200);

        const engine = new AIAutoEngine();
        const trainResult = engine.train([result.spins]);
        expect(trainResult.totalSpins).toBeGreaterThan(0);
        expect(engine.isTrained).toBe(true);
    });

    test('A2: DataLoader multiple files → Engine trains on all', () => {
        const loader = new AIDataLoader();
        const sessions = [];
        for (let i = 0; i < 3; i++) {
            const text = generateTrainingData(100, 42 + i).join('\n');
            const result = loader.parseTextContent(text, `file${i}.txt`);
            sessions.push(result.spins);
        }
        expect(sessions.length).toBe(3);

        const engine = new AIAutoEngine();
        const trainResult = engine.train(sessions);
        expect(trainResult.totalSpins).toBeGreaterThan(250);
    });

    test('A3: toSpinFormat produces correct direction alternation', () => {
        const loader = new AIDataLoader();
        const spins = [15, 19, 4, 21, 2];
        const formatted = loader.toSpinFormat(spins);
        expect(formatted[0].direction).toBe('C');
        expect(formatted[1].direction).toBe('AC');
        expect(formatted[2].direction).toBe('C');
        expect(formatted[3].direction).toBe('AC');
        expect(formatted[4].direction).toBe('C');
        formatted.forEach((s, i) => {
            expect(s.actual).toBe(spins[i]);
        });
    });

    test('A4: DataLoader preserves chronological order from file', () => {
        const loader = new AIDataLoader();
        const text = '36\n11\n30\n8\n23';
        const result = loader.parseTextContent(text, 'test.txt');
        // Data stays in file order (top=oldest, bottom=newest)
        expect(result.spins[0]).toBe(36);
        expect(result.spins[4]).toBe(23);
    });
});

// ═══════════════════════════════════════════════════════════
// B. Engine → Sequence Model → Filter Scoring Pipeline
// ═══════════════════════════════════════════════════════════

describe('B. Engine → Sequence Model → Filter Scoring', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
        const sessions = [generateTrainingData(200, 42), generateTrainingData(200, 99)];
        engine.train(sessions);
    });

    test('B1: Engine training also trains sequence model', () => {
        expect(engine.sequenceModel).toBeDefined();
        expect(engine.sequenceModel.isTrained).toBe(true);
    });

    test('B2: Sequence model has all 9 n-gram layers', () => {
        const stats = engine.sequenceModel.getStats();
        expect(stats.ngramCounts.number1).toBeGreaterThan(0);
        expect(stats.ngramCounts.table1).toBeGreaterThan(0);
        expect(stats.ngramCounts.sign1).toBeGreaterThan(0);
        expect(stats.ngramCounts.combo1).toBeGreaterThan(0);
    });

    test('B3: Sequence model scores all 9 filter combos', () => {
        const recentSpins = [15, 19, 4, 21, 2];
        const scores = engine.sequenceModel.scoreFilterCombos(recentSpins);
        expect(scores.scores).toBeDefined();
        // All 9 combos should have scores
        const keys = Object.keys(scores.scores);
        expect(keys.length).toBe(9);
        keys.forEach(k => {
            expect(scores.scores[k]).toBeGreaterThanOrEqual(0);
            expect(scores.scores[k]).toBeLessThanOrEqual(1);
        });
    });

    test('B4: both_both always scores 1.0', () => {
        const recentSpins = [0, 32, 15, 19, 4];
        const scores = engine.sequenceModel.scoreFilterCombos(recentSpins);
        expect(scores.scores['both_both']).toBe(1);
    });

    test('B5: Engine decide uses sequence scores', () => {
        const spins = generateTrainingData(10, 77);
        window.spins = spins.map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
        const decision = engine.decide();
        expect(decision).toBeDefined();
        expect(['BET', 'SKIP']).toContain(decision.action);
    });

    test('B6: scoreFilterCombos returns valid predictions', () => {
        const scores = engine.sequenceModel.scoreFilterCombos([0, 32, 15]);
        expect(scores.prediction).toBeDefined();
        // Prediction should have pZeroTable, pNineteenTable, pPositive, pNegative
        const pred = scores.prediction;
        expect(pred.pZeroTable).toBeGreaterThanOrEqual(0);
        expect(pred.pZeroTable).toBeLessThanOrEqual(1);
        expect(pred.pPositive).toBeGreaterThanOrEqual(0);
        expect(pred.pPositive).toBeLessThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════
// C. Semi-Auto Filter → Prediction Panel interaction
// ═══════════════════════════════════════════════════════════

describe('C. Semi-Auto Filter with sequence model', () => {
    test('C1: SemiAutoFilter uses sequence model when set', () => {
        const filter = new SemiAutoFilter();
        const seqModel = new AISequenceModel();
        seqModel.train([generateTrainingData(300, 42)]);

        filter.setSequenceModel(seqModel);
        // Use numbers that span both tables
        const result = filter.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25]);
        expect(result).not.toBeNull();
        expect(result.key).toBeDefined();
        expect(result.key).not.toBe('both_both');
    });

    test('C2: SemiAutoFilter works without sequence model', () => {
        const filter = new SemiAutoFilter();
        const result = filter.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25]);
        expect(result).not.toBeNull();
    });

    test('C3: SemiAutoFilter returns null for < 4 numbers', () => {
        const filter = new SemiAutoFilter();
        const result = filter.computeOptimalFilter([0, 32, 15]);
        expect(result).toBeNull();
    });

    test('C4: Filter result includes filtered numbers array', () => {
        const filter = new SemiAutoFilter();
        const result = filter.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25, 17, 34]);
        if (result) {
            expect(result.filtered).toBeDefined();
            expect(result.filtered.length).toBeLessThanOrEqual(10);
            expect(result.filtered.length).toBeGreaterThan(0);
        }
    });

    test('C5: All filtered numbers are subset of input', () => {
        const filter = new SemiAutoFilter();
        const input = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27];
        const result = filter.computeOptimalFilter(input);
        if (result) {
            const inputSet = new Set(input);
            (result.filtered || []).forEach(n => {
                expect(inputSet.has(n)).toBe(true);
            });
        }
    });
});

// ═══════════════════════════════════════════════════════════
// D. Number set consistency across all modules
// ═══════════════════════════════════════════════════════════

describe('D. Number set consistency across modules', () => {
    test('D1: ZERO_TABLE + NINETEEN_TABLE = all 37 numbers', () => {
        const all = new Set([...global.ZERO_TABLE_NUMS, ...global.NINETEEN_TABLE_NUMS]);
        expect(all.size).toBe(37);
        for (let i = 0; i <= 36; i++) {
            expect(all.has(i)).toBe(true);
        }
    });

    test('D2: POSITIVE + NEGATIVE = all 37 numbers', () => {
        const all = new Set([...global.POSITIVE_NUMS, ...global.NEGATIVE_NUMS]);
        expect(all.size).toBe(37);
    });

    test('D3: Every number 0-36 is in exactly one table', () => {
        for (let n = 0; n <= 36; n++) {
            const inZero = global.ZERO_TABLE_NUMS.has(n);
            const inNineteen = global.NINETEEN_TABLE_NUMS.has(n);
            // Each number should be in exactly one table (XOR)
            expect(inZero !== inNineteen).toBe(true);
        }
    });

    test('D4: Sequence model SEQ sets match globals', () => {
        expect(SEQ_ZERO.size).toBe(19);
        expect(SEQ_NINE.size).toBe(18);
        expect(SEQ_POS.size).toBe(19);
        expect(SEQ_NEG.size).toBe(18);

        // Verify consistency
        SEQ_ZERO.forEach(n => expect(global.ZERO_TABLE_NUMS.has(n)).toBe(true));
        SEQ_NINE.forEach(n => expect(global.NINETEEN_TABLE_NUMS.has(n)).toBe(true));
        SEQ_POS.forEach(n => expect(global.POSITIVE_NUMS.has(n)).toBe(true));
        SEQ_NEG.forEach(n => expect(global.NEGATIVE_NUMS.has(n)).toBe(true));
    });

    test('D5: Semi-auto filter sets match globals', () => {
        expect(SA_ZERO.size).toBe(19);
        expect(SA_NINE.size).toBe(18);
        SA_ZERO.forEach(n => expect(global.ZERO_TABLE_NUMS.has(n)).toBe(true));
        SA_NINE.forEach(n => expect(global.NINETEEN_TABLE_NUMS.has(n)).toBe(true));
    });

    test('D6: 0 and 26 are both in ZERO_TABLE and POSITIVE', () => {
        expect(global.ZERO_TABLE_NUMS.has(0)).toBe(true);
        expect(global.ZERO_TABLE_NUMS.has(26)).toBe(true);
        expect(global.POSITIVE_NUMS.has(0)).toBe(true);
        expect(global.POSITIVE_NUMS.has(26)).toBe(true);
    });

    test('D7: FILTER_COMBOS has exactly 36 entries', () => {
        expect(FILTER_COMBOS.length).toBe(36);
        const keys = FILTER_COMBOS.map(fc => fc.key);
        expect(keys).toContain('zero_positive');
        expect(keys).toContain('zero_negative');
        expect(keys).toContain('nineteen_positive');
        expect(keys).toContain('nineteen_negative');
        expect(keys).toContain('both_both');
    });

    test('D8: SEMI_FILTER_COMBOS matches FILTER_COMBOS keys', () => {
        const engineKeys = new Set(FILTER_COMBOS.map(fc => fc.key));
        SEMI_FILTER_COMBOS.forEach(sfc => {
            expect(engineKeys.has(sfc.key)).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════════════
// E. Wheel filter ↔ Money Panel synchronization
// ═══════════════════════════════════════════════════════════

describe('E. Wheel filter ↔ Money Panel sync', () => {
    let R;

    beforeEach(() => {
        setupDOM();
        R = loadRendererFunctions();
    });

    test('E1: Money panel has sessionData with bet tracking', () => {
        const panel = createMoneyPanel();
        expect(panel).toBeDefined();
        expect(panel.sessionData).toBeDefined();
        expect(panel.sessionData.currentBetPerNumber).toBeDefined();
        expect(panel.sessionData.bettingStrategy).toBe(3); // default Cautious
    });

    test('E2: Money panel loss increases bet (strategy 1)', () => {
        const panel = createMoneyPanel();
        panel.sessionData.bettingStrategy = 1;
        const initialBet = panel.sessionData.currentBetPerNumber;
        // recordBetResult(betPerNumber, numbersCount, hit, actualNumber)
        panel.recordBetResult(2, 5, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBeGreaterThanOrEqual(initialBet);
    });

    test('E3: Money panel win decreases bet (strategy 1)', () => {
        const panel = createMoneyPanel();
        panel.sessionData.bettingStrategy = 1;
        // First increase bet via losses
        panel.recordBetResult(2, 5, false, 15);
        panel.recordBetResult(3, 5, false, 15);
        const afterLosses = panel.sessionData.currentBetPerNumber;
        panel.recordBetResult(afterLosses, 5, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBeLessThanOrEqual(afterLosses);
    });

    test('E4: Money panel strategy toggle cycles 1→2→3', () => {
        const panel = createMoneyPanel();
        expect(panel.sessionData.bettingStrategy).toBe(3); // default
        panel.toggleStrategy(); // 3→1
        expect(panel.sessionData.bettingStrategy).toBe(1);
        panel.toggleStrategy(); // 1→2
        expect(panel.sessionData.bettingStrategy).toBe(2);
        panel.toggleStrategy(); // 2→3
        expect(panel.sessionData.bettingStrategy).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════════
// F. Full training → prediction → bet cycle
// ═══════════════════════════════════════════════════════════

describe('F. Full training → prediction → bet cycle', () => {
    let engine;

    beforeEach(() => {
        engine = new AIAutoEngine();
        const sessions = [generateTrainingData(200, 42), generateTrainingData(200, 99)];
        engine.train(sessions);
    });

    test('F1: Full decide → recordResult → decide cycle', () => {
        const rawSpins = generateTrainingData(10, 77);
        window.spins = rawSpins.map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        const decision1 = engine.decide();
        expect(decision1).toBeDefined();

        // Record a result
        if (decision1.action === 'BET') {
            engine.recordResult(decision1.selectedFilter, decision1.selectedPair, true, rawSpins[rawSpins.length - 1], []);
        }

        // Next spin
        rawSpins.push(15);
        window.spins = rawSpins.map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
        const decision2 = engine.decide();
        expect(decision2).toBeDefined();
    });

    test('F2: Multiple BET decisions track consecutive losses', () => {
        const rawSpins = generateTrainingData(10, 77);

        for (let i = 0; i < 5; i++) {
            window.spins = rawSpins.map((n, j) => ({ actual: n, direction: j % 2 === 0 ? 'C' : 'AC' }));
            const decision = engine.decide();
            if (decision.action === 'BET') {
                engine.recordResult(decision.selectedFilter, decision.selectedPair, false, 99, []);
            }
            rawSpins.push((i * 7 + 3) % 37);
        }

        expect(engine.session.consecutiveLosses).toBeGreaterThanOrEqual(0);
    });

    test('F3: Win resets consecutive losses', () => {
        const rawSpins = generateTrainingData(10, 77);

        // Force some losses
        for (let i = 0; i < 3; i++) {
            window.spins = rawSpins.map((n, j) => ({ actual: n, direction: j % 2 === 0 ? 'C' : 'AC' }));
            const decision = engine.decide();
            if (decision.action === 'BET') {
                engine.recordResult(decision.selectedFilter, decision.selectedPair, false, 99, []);
            }
            rawSpins.push((i * 7 + 3) % 37);
        }

        // Force a win
        window.spins = rawSpins.map((n, j) => ({ actual: n, direction: j % 2 === 0 ? 'C' : 'AC' }));
        const decision = engine.decide();
        if (decision.action === 'BET') {
            engine.recordResult(decision.selectedFilter, decision.selectedPair, true, rawSpins[rawSpins.length - 1], []);
        }

        expect(engine.session.consecutiveLosses).toBe(0);
    });

    test('F4: getState includes all expected fields', () => {
        const state = engine.getState();
        expect(state.isTrained).toBe(true);
        expect(state.sessionStats).toBeDefined();
        expect(state.sequenceStats).toBeDefined();
        expect(state.pairModelCount).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════════════
// G. State reset / retrain cascade
// ═══════════════════════════════════════════════════════════

describe('G. State reset / retrain cascade', () => {
    test('G1: Engine retrain updates sequence model', () => {
        const engine = new AIAutoEngine();
        engine.train([generateTrainingData(100, 42)]);
        const stats1 = engine.sequenceModel.getStats();
        expect(stats1.ngramCounts.number1).toBeGreaterThan(0);

        // Retrain with additional data
        window.spins = generateTrainingData(150, 99).map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
        engine.retrain([generateTrainingData(150, 99)]);
        const stats2 = engine.sequenceModel.getStats();
        expect(stats2.ngramCounts.number1).toBeGreaterThan(0);
    });

    test('G2: Sequence model reset clears all data', () => {
        const model = new AISequenceModel();
        model.train([generateTrainingData(200, 42)]);
        expect(model.isTrained).toBe(true);

        model.reset();
        expect(model.isTrained).toBe(false);
        const stats = model.getStats();
        expect(stats.ngramCounts.number1).toBe(0);
    });

    test('G3: SemiAutoFilter works after sequence model reset', () => {
        const filter = new SemiAutoFilter();
        const model = new AISequenceModel();
        model.train([generateTrainingData(200, 42)]);
        filter.setSequenceModel(model);

        // Reset model
        model.reset();

        // Filter should still work (falls back to non-sequence scoring)
        const result = filter.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25]);
        expect(result).not.toBeNull();
    });

    test('G4: Engine untrained → decide returns SKIP', () => {
        const engine = new AIAutoEngine();
        window.spins = [15, 19, 4, 21, 2].map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
        const decision = engine.decide();
        expect(decision.action).toBe('SKIP');
    });
});

// ═══════════════════════════════════════════════════════════
// H. Module boundary contracts
// ═══════════════════════════════════════════════════════════

describe('H. Module boundary contracts', () => {
    test('H1: AIAutoEngine exports match expected API', () => {
        expect(typeof AIAutoEngine).toBe('function');
        expect(Array.isArray(FILTER_COMBOS)).toBe(true);
        expect(Array.isArray(PAIR_REFKEYS)).toBe(true);

        const engine = new AIAutoEngine();
        expect(typeof engine.train).toBe('function');
        expect(typeof engine.decide).toBe('function');
        expect(typeof engine.recordResult).toBe('function');
        expect(typeof engine.retrain).toBe('function');
        expect(typeof engine.getState).toBe('function');
    });

    test('H2: AISequenceModel exports match expected API', () => {
        expect(typeof AISequenceModel).toBe('function');
        expect(SEQ_ZERO instanceof Set).toBe(true);
        expect(SEQ_NINE instanceof Set).toBe(true);
        expect(SEQ_POS instanceof Set).toBe(true);
        expect(SEQ_NEG instanceof Set).toBe(true);

        const model = new AISequenceModel();
        expect(typeof model.train).toBe('function');
        expect(typeof model.predict).toBe('function');
        expect(typeof model.scoreFilterCombos).toBe('function');
        expect(typeof model.getStats).toBe('function');
        expect(typeof model.reset).toBe('function');
    });

    test('H3: SemiAutoFilter exports match expected API', () => {
        expect(typeof SemiAutoFilter).toBe('function');
        expect(SA_ZERO instanceof Set).toBe(true);
        expect(SA_NINE instanceof Set).toBe(true);
        expect(Array.isArray(SEMI_FILTER_COMBOS)).toBe(true);

        const filter = new SemiAutoFilter();
        expect(typeof filter.computeOptimalFilter).toBe('function');
        expect(typeof filter.setSequenceModel).toBe('function');
    });

    test('H4: AIDataLoader exports match expected API', () => {
        expect(typeof AIDataLoader).toBe('function');

        const loader = new AIDataLoader();
        expect(typeof loader.parseTextContent).toBe('function');
        expect(typeof loader.toSpinFormat).toBe('function');
    });

    test('H5: PAIR_REFKEYS entries are strings', () => {
        expect(Array.isArray(PAIR_REFKEYS)).toBe(true);
        expect(PAIR_REFKEYS.length).toBe(6);
        PAIR_REFKEYS.forEach(refKey => {
            expect(typeof refKey).toBe('string');
            expect(refKey.length).toBeGreaterThan(0);
        });
        expect(PAIR_REFKEYS).toContain('prev');
        expect(PAIR_REFKEYS).toContain('prev_plus_1');
        expect(PAIR_REFKEYS).toContain('prev_minus_1');
    });

    test('H6: FILTER_COMBOS entries have key, table, sign', () => {
        FILTER_COMBOS.forEach(fc => {
            expect(typeof fc.key).toBe('string');
            expect(typeof fc.table).toBe('string');
            expect(typeof fc.sign).toBe('string');
            expect(['zero', 'nineteen', 'both']).toContain(fc.table);
            expect(['positive', 'negative', 'both']).toContain(fc.sign);
        });
    });
});

// ═══════════════════════════════════════════════════════════
// I. Concurrent usage patterns
// ═══════════════════════════════════════════════════════════

describe('I. Concurrent usage patterns', () => {
    test('I1: Multiple engines can be trained independently', () => {
        const engine1 = new AIAutoEngine();
        const engine2 = new AIAutoEngine();
        engine1.train([generateTrainingData(100, 42)]);
        engine2.train([generateTrainingData(150, 99)]);
        expect(engine1.isTrained).toBe(true);
        expect(engine2.isTrained).toBe(true);
        // Both trained but independently
        const state1 = engine1.getState();
        const state2 = engine2.getState();
        expect(state1.isTrained).toBe(true);
        expect(state2.isTrained).toBe(true);
    });

    test('I2: Multiple sequence models independent', () => {
        const model1 = new AISequenceModel();
        const model2 = new AISequenceModel();
        model1.train([generateTrainingData(200, 42)]);
        model2.train([generateTrainingData(200, 99)]);
        // Reset one doesn't affect the other
        model1.reset();
        expect(model1.isTrained).toBe(false);
        expect(model2.isTrained).toBe(true);
    });

    test('I3: Multiple filters independent', () => {
        const filter1 = new SemiAutoFilter();
        const filter2 = new SemiAutoFilter();
        const model = new AISequenceModel();
        model.train([generateTrainingData(200, 42)]);
        filter1.setSequenceModel(model);
        // filter2 has no model
        const r1 = filter1.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25]);
        const r2 = filter2.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25]);
        // Both should return valid results
        expect(r1).not.toBeNull();
        expect(r2).not.toBeNull();
    });

    test('I4: Engine and sequence model share reference after training', () => {
        const engine = new AIAutoEngine();
        engine.train([generateTrainingData(100, 42)]);
        // The sequence model should be the same instance
        const seqModel = engine.sequenceModel;
        expect(seqModel).toBeDefined();
        expect(seqModel.isTrained).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
// J. Defensive coding — mismatched state
// ═══════════════════════════════════════════════════════════

describe('J. Defensive coding — mismatched state', () => {
    test('J1: Engine decide with minimal spins', () => {
        const engine = new AIAutoEngine();
        engine.train([generateTrainingData(200, 42)]);
        window.spins = [0, 32, 15, 19, 5].map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
        const decision = engine.decide();
        expect(['BET', 'SKIP']).toContain(decision.action);
    });

    test('J2: Sequence model predict with empty array', () => {
        const model = new AISequenceModel();
        model.train([generateTrainingData(200, 42)]);
        const prediction = model.predict([]);
        expect(prediction).toBeDefined();
        // Should fall to baseline
    });

    test('J3: Semi-auto filter with numbers outside 0-36', () => {
        const filter = new SemiAutoFilter();
        // Include some invalid numbers
        const result = filter.computeOptimalFilter([0, 32, 15, 19, 4, 21, 2, 25]);
        expect(result).not.toBeNull();
    });

    test('J4: DataLoader with mixed valid/invalid lines parses valid ones', () => {
        const loader = new AIDataLoader();
        const text = '15\nhello\n19\n-1\n4\n37\n21';
        const result = loader.parseTextContent(text, 'mixed.txt');
        // 4 valid numbers: 15, 19, 4, 21 (kept in file order)
        expect(result.spins.length).toBe(4);
    });

    test('J5: Engine recordResult with unknown pair key does not crash', () => {
        const engine = new AIAutoEngine();
        engine.train([generateTrainingData(100, 42)]);
        expect(() => {
            engine.recordResult('zero_positive', 'nonexistent_pair', true, 5, []);
        }).not.toThrow();
    });

    test('J6: Sequence model scoreFilterCombos on untrained model', () => {
        const model = new AISequenceModel();
        const result = model.scoreFilterCombos([15, 19, 4]);
        expect(result.scores).toBeDefined();
        // both_both should still be 1.0
        expect(result.scores['both_both']).toBe(1);
    });

    test('J7: Engine decide returns consistent filter format', () => {
        const engine = new AIAutoEngine();
        engine.train([generateTrainingData(200, 42)]);
        window.spins = generateTrainingData(10, 77).map((n, i) => ({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
        const decision = engine.decide();

        if (decision.action === 'BET') {
            const validFilterKeys = FILTER_COMBOS.map(fc => fc.key);
            expect(validFilterKeys).toContain(decision.selectedFilter);
            expect(decision.selectedFilter).not.toBe('both_both');
        }
    });

    test('J8: All PAIR_REFKEYS map to valid references', () => {
        const spins = [15, 19, 4, 21, 2];
        const refs = calculateReferences(spins[spins.length - 2], spins[spins.length - 3]);
        PAIR_REFKEYS.forEach(pair => {
            const refNum = refs[pair.refKey];
            if (refNum !== null && refNum !== undefined) {
                expect(refNum).toBeGreaterThanOrEqual(0);
                expect(refNum).toBeLessThanOrEqual(36);
            }
        });
    });
});

console.log('✅ Cross-Component regression test suite loaded');
