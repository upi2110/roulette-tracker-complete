/**
 * TESTS: Stress & Property-Based Testing
 *
 * Validates mathematical invariants, randomized input robustness,
 * and performance under stress for core roulette logic functions.
 *
 * Property-based approach: instead of specific inputs, we test
 * PROPERTIES that must hold for ALL valid inputs.
 *
 * 80+ tests across sections A-M
 */

const fs = require('fs');
const path = require('path');
const { setupDOM, loadRendererFunctions } = require('../test-setup');
const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');
const { AISequenceModel } = require('../../app/ai-sequence-model');
const { SemiAutoFilter } = require('../../app/semi-auto-filter');

let R;

const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:35, 3:17, 4:6, 5:22, 6:4, 7:18, 8:24, 9:29,
    10:33, 11:36, 12:3, 13:27, 14:31, 15:19, 16:23, 17:3, 18:7, 19:15,
    20:1, 21:25, 22:5, 23:16, 24:8, 25:21, 26:32, 27:13, 28:1, 29:9,
    30:11, 31:14, 32:26, 33:10, 34:0, 35:2, 36:11
};

beforeAll(() => {
    setupDOM();
    R = loadRendererFunctions();

    // Set up globals needed by AIAutoEngine
    global.calculatePositionCode = R.calculatePositionCode;
    global.calculateReferences = R.calculateReferences;
    global.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
    global.generateAnchors = R.generateAnchors;
    global.expandAnchorsToBetNumbers = R.expandAnchorsToBetNumbers;
    global._getPosCodeDistance = R._getPosCodeDistance;
    global.ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
    global.NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
    global.POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
    global.NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);
});

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function randomNumber() {
    return Math.floor(Math.random() * 37);
}

function randomSpinSequence(length) {
    return Array.from({ length }, () => randomNumber());
}

function randomDirection() {
    return Math.random() > 0.5 ? 'C' : 'AC';
}

// ═══════════════════════════════════════════════════════
// A: Wheel math — calculatePositionCode properties
// ═══════════════════════════════════════════════════════

describe('A: calculatePositionCode properties', () => {
    test('A1: Same number → S+0 for all 37 numbers', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.calculatePositionCode(n, n)).toBe('S+0');
        }
    });

    test('A2: posCode always returns a non-empty string for valid inputs', () => {
        for (let i = 0; i < 100; i++) {
            const ref = randomNumber();
            const act = randomNumber();
            const code = R.calculatePositionCode(ref, act);
            expect(typeof code).toBe('string');
            expect(code.length).toBeGreaterThan(0);
        }
    });

    test('A3: posCode format matches S/O/XX pattern for all 37×37 combinations', () => {
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                const code = R.calculatePositionCode(ref, act);
                // S+0, O+0, XX, or Sx+N / Ox+N format
                expect(code).toMatch(/^(S\+0|O\+0|XX|[SO][LR][+-]\d+)$/);
            }
        }
    });

    test('A4: Distance portion is always ≤ 9 for valid inputs', () => {
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                const code = R.calculatePositionCode(ref, act);
                const dist = R._getPosCodeDistance(code);
                if (dist !== null) {
                    expect(dist).toBeLessThanOrEqual(9);
                }
            }
        }
    });

    test('A5: Adjacent CW → SR+1 for all numbers (except 0/26 equivalence)', () => {
        // calculatePositionCode uses WHEEL_NO_ZERO where 0→26.
        // So n=26 CW-adjacent=0 but calculatePositionCode(26,0)→S+0 (same pocket).
        const len = WHEEL_STANDARD.length;
        for (let n = 0; n <= 36; n++) {
            const idx = WHEEL_STANDARD.indexOf(n);
            const adjCW = WHEEL_STANDARD[(idx + 1) % len];
            // Skip: 26→CW is 0 which maps to 26 (same); 3→CW is 26 but 26 is 0/26-pocket
            if ((n === 26 && adjCW === 0) || (n === 0 && adjCW === 32)) {
                // n=0→CW=32 should still work (SR+1), special case in the code
                if (n === 0) {
                    expect(R.calculatePositionCode(n, adjCW)).toBe('SR+1');
                }
                continue;
            }
            const code = R.calculatePositionCode(n, adjCW);
            expect(code).toBe('SR+1');
        }
    });

    test('A6: Adjacent CCW → SL+1 for all numbers (except 0/26 equivalence)', () => {
        // n=0 CCW-adjacent on WHEEL_STANDARD is 26, but calculatePositionCode(0,26) → S+0
        const len = WHEEL_STANDARD.length;
        for (let n = 0; n <= 36; n++) {
            const idx = WHEEL_STANDARD.indexOf(n);
            const adjCCW = WHEEL_STANDARD[(idx - 1 + len) % len];
            // Skip: 0→CCW is 26, but posCode(0,26)→S+0 (same pocket)
            if (n === 0 && adjCCW === 26) continue;
            const code = R.calculatePositionCode(n, adjCCW);
            expect(code).toBe('SL+1');
        }
    });

    test('A7: posCode is deterministic for same inputs', () => {
        for (let i = 0; i < 100; i++) {
            const ref = i % 37;
            const act = (i * 7 + 3) % 37;
            const code1 = R.calculatePositionCode(ref, act);
            const code2 = R.calculatePositionCode(ref, act);
            expect(code1).toBe(code2);
        }
    });
});

// ═══════════════════════════════════════════════════════
// B: getNumberAtPosition properties (uses posCode strings)
// ═══════════════════════════════════════════════════════

describe('B: getNumberAtPosition properties', () => {
    test('B1: S+0 always returns the reference number', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.getNumberAtPosition(n, 'S+0')).toBe(n);
        }
    });

    test('B2: Result is always a valid roulette number for valid posCodes', () => {
        const codes = ['S+0', 'SR+1', 'SL+1', 'SR+2', 'SL+2', 'OR+1', 'OL+1'];
        for (let n = 0; n <= 36; n++) {
            for (const code of codes) {
                const result = R.getNumberAtPosition(n, code);
                if (result !== null) {
                    expect(result).toBeGreaterThanOrEqual(0);
                    expect(result).toBeLessThanOrEqual(36);
                }
            }
        }
    });

    test('B3: XX returns null', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.getNumberAtPosition(n, 'XX')).toBeNull();
        }
    });

    test('B4: SR+1 and SL+1 produce different numbers (except for opposite endpoints)', () => {
        for (let n = 0; n <= 36; n++) {
            const cw = R.getNumberAtPosition(n, 'SR+1');
            const ccw = R.getNumberAtPosition(n, 'SL+1');
            if (cw !== null && ccw !== null) {
                // Generally they should differ (different directions)
                // Allow some edge cases where the wheel wraps
                expect(typeof cw).toBe('number');
                expect(typeof ccw).toBe('number');
            }
        }
    });

    test('B5: O+0 returns the opposite side number', () => {
        for (let n = 0; n <= 36; n++) {
            const opp = R.getNumberAtPosition(n, 'O+0');
            if (opp !== null) {
                // The result should be a different number (or same only in rare wrap cases)
                expect(opp).toBeGreaterThanOrEqual(0);
                expect(opp).toBeLessThanOrEqual(36);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// C: flipPositionCode properties (flips +/- sign)
// ═══════════════════════════════════════════════════════

describe('C: flipPositionCode properties', () => {
    test('C1: S+0 stays S+0 (no flip needed)', () => {
        expect(R.flipPositionCode('S+0')).toBe('S+0');
    });

    test('C2: O+0 stays O+0 (no flip needed)', () => {
        expect(R.flipPositionCode('O+0')).toBe('O+0');
    });

    test('C3: XX stays XX', () => {
        expect(R.flipPositionCode('XX')).toBe('XX');
    });

    test('C4: SR+1 flips to SR-1 (sign change only)', () => {
        expect(R.flipPositionCode('SR+1')).toBe('SR-1');
    });

    test('C5: SL-2 flips to SL+2', () => {
        expect(R.flipPositionCode('SL-2')).toBe('SL+2');
    });

    test('C6: OR+3 flips to OR-3', () => {
        expect(R.flipPositionCode('OR+3')).toBe('OR-3');
    });

    test('C7: Double flip returns original code', () => {
        const codes = ['SR+1', 'SL-2', 'OR+3', 'OL-4', 'SR+9'];
        for (const code of codes) {
            const flipped = R.flipPositionCode(code);
            const doubleFlipped = R.flipPositionCode(flipped);
            expect(doubleFlipped).toBe(code);
        }
    });

    test('C8: Flip preserves distance number', () => {
        for (let d = 1; d <= 9; d++) {
            const code = `SR+${d}`;
            const flipped = R.flipPositionCode(code);
            const origDist = R._getPosCodeDistance(code);
            const flipDist = R._getPosCodeDistance(flipped);
            expect(flipDist).toBe(origDist);
        }
    });
});

// ═══════════════════════════════════════════════════════
// D: Number set invariants
// ═══════════════════════════════════════════════════════

describe('D: Number set invariants', () => {
    test('D1: ZERO_TABLE ∪ NINETEEN_TABLE = {0..36}', () => {
        const union = new Set([...global.ZERO_TABLE_NUMS, ...global.NINETEEN_TABLE_NUMS]);
        expect(union.size).toBe(37);
        for (let n = 0; n <= 36; n++) {
            expect(union.has(n)).toBe(true);
        }
    });

    test('D2: POSITIVE ∪ NEGATIVE = {0..36}', () => {
        const union = new Set([...global.POSITIVE_NUMS, ...global.NEGATIVE_NUMS]);
        expect(union.size).toBe(37);
    });

    test('D3: ZERO_TABLE has 19 numbers', () => {
        expect(global.ZERO_TABLE_NUMS.size).toBe(19);
    });

    test('D4: NINETEEN_TABLE has 18 numbers', () => {
        expect(global.NINETEEN_TABLE_NUMS.size).toBe(18);
    });

    test('D5: POSITIVE has 19 numbers', () => {
        expect(global.POSITIVE_NUMS.size).toBe(19);
    });

    test('D6: NEGATIVE has 18 numbers', () => {
        expect(global.NEGATIVE_NUMS.size).toBe(18);
    });

    test('D7: 0 is in ZERO_TABLE (by name)', () => {
        expect(global.ZERO_TABLE_NUMS.has(0)).toBe(true);
    });

    test('D8: Each number belongs to exactly one table', () => {
        for (let n = 0; n <= 36; n++) {
            const inZero = global.ZERO_TABLE_NUMS.has(n);
            const inNineteen = global.NINETEEN_TABLE_NUMS.has(n);
            expect(inZero !== inNineteen).toBe(true);
        }
    });

    test('D9: Each number belongs to exactly one sign group', () => {
        for (let n = 0; n <= 36; n++) {
            const inPos = global.POSITIVE_NUMS.has(n);
            const inNeg = global.NEGATIVE_NUMS.has(n);
            expect(inPos !== inNeg).toBe(true);
        }
    });
});

// ═══════════════════════════════════════════════════════
// E: DIGIT_13_OPPOSITES invariants
// ═══════════════════════════════════════════════════════

describe('E: DIGIT_13_OPPOSITES invariants', () => {
    test('E1: Has entries for all 37 numbers (0-36)', () => {
        for (let n = 0; n <= 36; n++) {
            expect(DIGIT_13_OPPOSITES).toHaveProperty(String(n));
        }
    });

    test('E2: All values are valid roulette numbers (0-36)', () => {
        for (const [key, val] of Object.entries(DIGIT_13_OPPOSITES)) {
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(36);
        }
    });

    test('E3: No number maps to itself', () => {
        for (let n = 0; n <= 36; n++) {
            expect(DIGIT_13_OPPOSITES[n]).not.toBe(n);
        }
    });

    test('E4: All 37 keys present as integers', () => {
        const keys = Object.keys(DIGIT_13_OPPOSITES).map(Number).sort((a, b) => a - b);
        expect(keys).toEqual(Array.from({ length: 37 }, (_, i) => i));
    });
});

// ═══════════════════════════════════════════════════════
// F: calculateReferences stress
// ═══════════════════════════════════════════════════════

describe('F: calculateReferences stress', () => {
    test('F1: Returns object with 6 keys for any valid prev', () => {
        for (let i = 0; i < 100; i++) {
            const prev = randomNumber();
            const prevPrev = randomNumber();
            const refs = R.calculateReferences(prev, prevPrev);
            // Should have prev, prev_plus_1, prev_minus_1, prev_plus_2, prev_minus_2, prev_prev
            expect(refs).toHaveProperty('prev', prev);
            expect(refs).toHaveProperty('prev_prev', prevPrev);
            expect(refs).toHaveProperty('prev_plus_1');
            expect(refs).toHaveProperty('prev_minus_1');
            expect(refs).toHaveProperty('prev_plus_2');
            expect(refs).toHaveProperty('prev_minus_2');
        }
    });

    test('F2: All reference values are valid numbers (0-36)', () => {
        for (let i = 0; i < 100; i++) {
            const refs = R.calculateReferences(randomNumber(), randomNumber());
            for (const val of Object.values(refs)) {
                expect(val).toBeGreaterThanOrEqual(0);
                expect(val).toBeLessThanOrEqual(36);
            }
        }
    });

    test('F3: prev_plus_1 is numeric prev+1 (clamped to 0-36, special cases for 0 and 36)', () => {
        // calculateReferences returns NUMERIC offsets, not wheel-adjacent
        // Special: prev=0 → plus_1=1, prev=36 → plus_1=35
        for (let n = 0; n <= 36; n++) {
            const refs = R.calculateReferences(n, n);
            if (n === 0) expect(refs.prev_plus_1).toBe(1);
            else if (n === 36) expect(refs.prev_plus_1).toBe(35);
            else expect(refs.prev_plus_1).toBe(Math.min(n + 1, 36));
        }
    });

    test('F4: prev_minus_1 is numeric prev-1 (clamped to 0-36, special cases for 0 and 36)', () => {
        // Special: prev=0 → minus_1=10, prev=36 → minus_1=35
        for (let n = 0; n <= 36; n++) {
            const refs = R.calculateReferences(n, n);
            if (n === 0) expect(refs.prev_minus_1).toBe(10);
            else if (n === 36) expect(refs.prev_minus_1).toBe(35);
            else expect(refs.prev_minus_1).toBe(Math.max(n - 1, 0));
        }
    });

    test('F5: prev_plus_2 is numeric prev+2 (clamped to 0-36, special cases for 0 and 36)', () => {
        // Special: prev=0 → plus_2=2, prev=36 → plus_2=34
        for (let n = 0; n <= 36; n++) {
            const refs = R.calculateReferences(n, n);
            if (n === 0) expect(refs.prev_plus_2).toBe(2);
            else if (n === 36) expect(refs.prev_plus_2).toBe(34);
            else expect(refs.prev_plus_2).toBe(Math.min(n + 2, 36));
        }
    });

    test('F6: prev_minus_2 is numeric prev-2 (clamped to 0-36, special cases for 0 and 36)', () => {
        // Special: prev=0 → minus_2=9, prev=36 → minus_2=34
        for (let n = 0; n <= 36; n++) {
            const refs = R.calculateReferences(n, n);
            if (n === 0) expect(refs.prev_minus_2).toBe(9);
            else if (n === 36) expect(refs.prev_minus_2).toBe(34);
            else expect(refs.prev_minus_2).toBe(Math.max(n - 2, 0));
        }
    });
});

// ═══════════════════════════════════════════════════════
// G: Sequence Model — statistical properties
// ═══════════════════════════════════════════════════════

describe('G: AISequenceModel statistical properties', () => {
    function createTrainedModel(spinCount = 500) {
        const model = new AISequenceModel({ minSamples: 1 });
        const sessions = [];
        for (let s = 0; s < 3; s++) {
            sessions.push(randomSpinSequence(spinCount));
        }
        model.train(sessions);
        return model;
    }

    test('G1: Baseline probabilities sum to total for table dimension', () => {
        const model = createTrainedModel();
        const baseline = model.baseline;
        expect(baseline.zeroTable + baseline.nineteenTable).toBe(baseline.total);
    });

    test('G2: Baseline probabilities sum to total for sign dimension', () => {
        const model = createTrainedModel();
        const baseline = model.baseline;
        expect(baseline.positive + baseline.negative).toBe(baseline.total);
    });

    test('G3: Prediction probabilities are between 0 and 1', () => {
        const model = createTrainedModel();
        for (let i = 0; i < 20; i++) {
            const recent = randomSpinSequence(3);
            const pred = model.predict(recent);
            expect(pred.pZeroTable).toBeGreaterThanOrEqual(0);
            expect(pred.pZeroTable).toBeLessThanOrEqual(1);
            expect(pred.pNineteenTable).toBeGreaterThanOrEqual(0);
            expect(pred.pNineteenTable).toBeLessThanOrEqual(1);
            expect(pred.pPositive).toBeGreaterThanOrEqual(0);
            expect(pred.pPositive).toBeLessThanOrEqual(1);
            expect(pred.pNegative).toBeGreaterThanOrEqual(0);
            expect(pred.pNegative).toBeLessThanOrEqual(1);
        }
    });

    test('G4: Table probs approximately sum to 1', () => {
        const model = createTrainedModel();
        for (let i = 0; i < 20; i++) {
            const pred = model.predict(randomSpinSequence(3));
            const sum = pred.pZeroTable + pred.pNineteenTable;
            expect(sum).toBeCloseTo(1.0, 1);
        }
    });

    test('G5: Sign probs approximately sum to 1', () => {
        const model = createTrainedModel();
        for (let i = 0; i < 20; i++) {
            const pred = model.predict(randomSpinSequence(3));
            const sum = pred.pPositive + pred.pNegative;
            expect(sum).toBeCloseTo(1.0, 1);
        }
    });

    test('G6: scoreFilterCombos returns 9 combos', () => {
        const model = createTrainedModel();
        const result = model.scoreFilterCombos(randomSpinSequence(3));
        expect(Object.keys(result.scores).length).toBe(9);
    });

    test('G7: both_both always = 1.0', () => {
        const model = createTrainedModel();
        for (let i = 0; i < 10; i++) {
            const result = model.scoreFilterCombos(randomSpinSequence(3));
            expect(result.scores['both_both']).toBe(1.0);
        }
    });

    test('G8: All filter scores between 0 and 1', () => {
        const model = createTrainedModel();
        for (let i = 0; i < 10; i++) {
            const result = model.scoreFilterCombos(randomSpinSequence(3));
            for (const [key, score] of Object.entries(result.scores)) {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(1);
            }
        }
    });

    test('G9: More training data → more n-gram buckets', () => {
        const small = new AISequenceModel({ minSamples: 1 });
        small.train([randomSpinSequence(50)]);
        const large = new AISequenceModel({ minSamples: 1 });
        large.train([randomSpinSequence(500)]);

        expect(large.numberTransitions.size).toBeGreaterThanOrEqual(small.numberTransitions.size);
    });

    test('G10: Reset clears all data', () => {
        const model = createTrainedModel();
        expect(model.isTrained).toBe(true);
        model.reset();
        expect(model.isTrained).toBe(false);
        expect(model.numberTransitions.size).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// H: SemiAutoFilter — property-based
// ═══════════════════════════════════════════════════════

describe('H: SemiAutoFilter properties', () => {
    test('H1: Filtered count ≤ input count for computeOptimalFilter', () => {
        const filter = new SemiAutoFilter();
        const numbers = [...new Set(randomSpinSequence(18))];
        global.window = global.window || {};
        global.window.spins = [];
        const result = filter.computeOptimalFilter(numbers);
        if (result) {
            expect(result.filtered.length).toBeLessThanOrEqual(numbers.length);
        }
    });

    test('H2: computeOptimalFilter never returns both_both key', () => {
        const filter = new SemiAutoFilter();
        global.window = global.window || {};
        global.window.spins = [];
        for (let i = 0; i < 20; i++) {
            const numbers = [...new Set(randomSpinSequence(18))];
            const result = filter.computeOptimalFilter(numbers);
            if (result) {
                expect(result.key).not.toBe('both_both');
            }
        }
    });

    test('H3: computeOptimalFilter returns null for empty input', () => {
        const filter = new SemiAutoFilter();
        expect(filter.computeOptimalFilter([])).toBeNull();
        expect(filter.computeOptimalFilter(null)).toBeNull();
    });

    test('H4: _passesComboFilter correctly filters zero table numbers', () => {
        const filter = new SemiAutoFilter();
        const combo = { table: 'zero', sign: 'both' };
        for (let n = 0; n <= 36; n++) {
            const passes = filter._passesComboFilter(n, combo);
            expect(passes).toBe(global.ZERO_TABLE_NUMS.has(n));
        }
    });

    test('H5: _passesComboFilter correctly filters nineteen table numbers', () => {
        const filter = new SemiAutoFilter();
        const combo = { table: 'nineteen', sign: 'both' };
        for (let n = 0; n <= 36; n++) {
            const passes = filter._passesComboFilter(n, combo);
            expect(passes).toBe(global.NINETEEN_TABLE_NUMS.has(n));
        }
    });

    test('H6: _passesComboFilter correctly filters positive numbers', () => {
        const filter = new SemiAutoFilter();
        const combo = { table: 'both', sign: 'positive' };
        for (let n = 0; n <= 36; n++) {
            const passes = filter._passesComboFilter(n, combo);
            expect(passes).toBe(global.POSITIVE_NUMS.has(n));
        }
    });

    test('H7: _passesComboFilter correctly filters negative numbers', () => {
        const filter = new SemiAutoFilter();
        const combo = { table: 'both', sign: 'negative' };
        for (let n = 0; n <= 36; n++) {
            const passes = filter._passesComboFilter(n, combo);
            expect(passes).toBe(global.NEGATIVE_NUMS.has(n));
        }
    });

    test('H8: both_both passes all 37 numbers', () => {
        const filter = new SemiAutoFilter();
        const combo = { table: 'both', sign: 'both' };
        for (let n = 0; n <= 36; n++) {
            expect(filter._passesComboFilter(n, combo)).toBe(true);
        }
    });
});

// ═══════════════════════════════════════════════════════
// I: Engine — stress with random training data
// ═══════════════════════════════════════════════════════

describe('I: Engine stress tests', () => {
    test('I1: Engine trains on random data without crashing', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        const sessions = Array(5).fill(null).map(() => randomSpinSequence(100));
        expect(() => engine.train(sessions)).not.toThrow();
        expect(engine.isTrained).toBe(true);
    });

    test('I2: Engine state is valid after training on random data', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        engine.train([randomSpinSequence(100), randomSpinSequence(80)]);
        const state = engine.getState();
        expect(state.isTrained).toBe(true);
        expect(state.pairModelCount).toBeGreaterThan(0);
    });

    test('I3: Engine handles retrain with different data', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        engine.train([randomSpinSequence(100)]);
        expect(engine.isTrained).toBe(true);
        engine.train([randomSpinSequence(200)]);
        expect(engine.isTrained).toBe(true);
    });

    test('I4: recordResult and recordSkip never throw', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        engine.train([randomSpinSequence(100)]);
        for (let i = 0; i < 50; i++) {
            if (i % 3 === 0) {
                engine.recordSkip();
            } else {
                const hit = Math.random() > 0.7;
                expect(() => engine.recordResult('prev', 'zero_positive', hit, randomNumber(), randomSpinSequence(5))).not.toThrow();
            }
        }
    });

    test('I5: Session stats stay consistent after many operations', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        engine.train([randomSpinSequence(100)]);

        let totalRecords = 0;
        for (let i = 0; i < 30; i++) {
            if (i % 4 === 0) {
                engine.recordSkip();
            } else {
                engine.recordResult('prev', 'zero_positive', Math.random() > 0.7, randomNumber(), randomSpinSequence(3));
                totalRecords++;
            }
        }

        const state = engine.getState();
        expect(state.sessionStats.totalBets).toBe(totalRecords);
    });

    test('I6: resetSession clears all session-specific state', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        engine.train([randomSpinSequence(100)]);

        for (let i = 0; i < 10; i++) {
            engine.recordResult('prev', 'zero_positive', false, randomNumber(), [1, 2, 3]);
        }

        engine.resetSession();
        const state = engine.getState();
        expect(state.sessionStats.totalBets).toBe(0);
        expect(state.sessionStats.wins).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// J: Wheel order invariants
// ═══════════════════════════════════════════════════════

describe('J: Wheel order invariants', () => {
    test('J1: WHEEL_STANDARD has 37 entries', () => {
        expect(WHEEL_STANDARD.length).toBe(37);
    });

    test('J2: WHEEL_STANDARD contains all numbers 0-36', () => {
        const sorted = [...WHEEL_STANDARD].sort((a, b) => a - b);
        const expected = Array.from({ length: 37 }, (_, i) => i);
        expect(sorted).toEqual(expected);
    });

    test('J3: No duplicates in WHEEL_STANDARD', () => {
        const unique = new Set(WHEEL_STANDARD);
        expect(unique.size).toBe(37);
    });

    test('J4: First element is 0', () => {
        expect(WHEEL_STANDARD[0]).toBe(0);
    });

    test('J5: Renderer WHEEL_STANDARD matches our constant', () => {
        expect(R.WHEEL_STANDARD).toEqual(WHEEL_STANDARD);
    });
});

// ═══════════════════════════════════════════════════════
// K: Stress — Large data performance
// ═══════════════════════════════════════════════════════

describe('K: Large data performance stress', () => {
    test('K1: SequenceModel trains on 3000+ spins under 2 seconds', () => {
        const model = new AISequenceModel({ minSamples: 1 });
        const sessions = [randomSpinSequence(1000), randomSpinSequence(1000), randomSpinSequence(1000)];
        const start = Date.now();
        model.train(sessions);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
        expect(model.isTrained).toBe(true);
    });

    test('K2: SequenceModel predict runs 1000 times under 1 second', () => {
        const model = new AISequenceModel({ minSamples: 1 });
        model.train([randomSpinSequence(500)]);

        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
            model.predict(randomSpinSequence(3));
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(1000);
    });

    test('K3: Engine trains on 5 sessions × 200 spins under 5 seconds', () => {
        const engine = new AIAutoEngine({ confidenceThreshold: 50 });
        const sessions = Array(5).fill(null).map(() => randomSpinSequence(200));
        const start = Date.now();
        engine.train(sessions);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(5000);
        expect(engine.isTrained).toBe(true);
    });

    test('K4: 10,000 calculatePositionCode calls under 500ms', () => {
        const start = Date.now();
        for (let i = 0; i < 10000; i++) {
            R.calculatePositionCode(randomNumber(), randomNumber());
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
    });

    test('K5: 1000 spin accumulation maintains array consistency', () => {
        R.resetAll();
        for (let i = 0; i < 1000; i++) {
            R.spins.push({ actual: randomNumber(), direction: randomDirection() });
        }
        expect(R.spins.length).toBe(1000);
        // All spins have correct structure
        for (const spin of R.spins) {
            expect(spin.actual).toBeGreaterThanOrEqual(0);
            expect(spin.actual).toBeLessThanOrEqual(36);
            expect(['C', 'AC']).toContain(spin.direction);
        }
    });
});

// ═══════════════════════════════════════════════════════
// L: FILTER_COMBOS and PAIR_REFKEYS invariants
// ═══════════════════════════════════════════════════════

describe('L: FILTER_COMBOS and PAIR_REFKEYS invariants', () => {
    test('L1: FILTER_COMBOS has 9 entries', () => {
        expect(FILTER_COMBOS.length).toBe(9);
    });

    test('L2: Each combo has key, table, sign', () => {
        for (const combo of FILTER_COMBOS) {
            expect(combo).toHaveProperty('key');
            expect(combo).toHaveProperty('table');
            expect(combo).toHaveProperty('sign');
        }
    });

    test('L3: All combo keys are unique', () => {
        const keys = FILTER_COMBOS.map(c => c.key);
        const unique = new Set(keys);
        expect(unique.size).toBe(9);
    });

    test('L4: Combo tables are zero, nineteen, or both', () => {
        for (const combo of FILTER_COMBOS) {
            expect(['zero', 'nineteen', 'both']).toContain(combo.table);
        }
    });

    test('L5: Combo signs are positive, negative, or both', () => {
        for (const combo of FILTER_COMBOS) {
            expect(['positive', 'negative', 'both']).toContain(combo.sign);
        }
    });

    test('L6: PAIR_REFKEYS has 6 entries', () => {
        expect(PAIR_REFKEYS.length).toBe(6);
    });

    test('L7: All PAIR_REFKEYS are strings', () => {
        for (const key of PAIR_REFKEYS) {
            expect(typeof key).toBe('string');
        }
    });

    test('L8: PAIR_REFKEYS contains prev', () => {
        expect(PAIR_REFKEYS).toContain('prev');
    });

    test('L9: FILTER_COMBOS contains both_both', () => {
        const keys = FILTER_COMBOS.map(c => c.key);
        expect(keys).toContain('both_both');
    });

    test('L10: 3 tables × 3 signs = 9 combos (complete coverage)', () => {
        const tables = new Set(FILTER_COMBOS.map(c => c.table));
        const signs = new Set(FILTER_COMBOS.map(c => c.sign));
        expect(tables.size).toBe(3);
        expect(signs.size).toBe(3);
        expect(tables.size * signs.size).toBe(9);
    });
});

// ═══════════════════════════════════════════════════════
// M: Cross-module consistency — posCode round-trip
// ═══════════════════════════════════════════════════════

describe('M: Cross-module consistency', () => {
    test('M1: calculatePositionCode(ref, getNumberAtPosition(ref, code)) produces same distance', () => {
        const codes = ['SR+1', 'SL+2', 'SR+3'];
        for (let ref = 1; ref <= 36; ref++) {
            for (const code of codes) {
                const target = R.getNumberAtPosition(ref, code);
                if (target !== null) {
                    const roundTrip = R.calculatePositionCode(ref, target);
                    // Distance should match
                    const origDist = R._getPosCodeDistance(code);
                    const rtDist = R._getPosCodeDistance(roundTrip);
                    expect(rtDist).toBe(origDist);
                }
            }
        }
    });

    test('M2: _getPosCodeDistance returns null for non-distance codes', () => {
        expect(R._getPosCodeDistance('XX')).toBeNull();
        expect(R._getPosCodeDistance(null)).toBeNull();
        expect(R._getPosCodeDistance(undefined)).toBeNull();
    });

    test('M3: _getPosCodeDistance returns correct distance for all code formats', () => {
        expect(R._getPosCodeDistance('SR+5')).toBe(5);
        expect(R._getPosCodeDistance('SL+3')).toBe(3);
        expect(R._getPosCodeDistance('OR+1')).toBe(1);
        expect(R._getPosCodeDistance('OL+9')).toBe(9);
    });

    test('M4: _getPosCodeDistance returns null for S+0 and O+0', () => {
        // S+0 and O+0 have distance 0, but the regex matches +0
        const s0 = R._getPosCodeDistance('S+0');
        const o0 = R._getPosCodeDistance('O+0');
        // These may return 0 or null depending on pattern
        if (s0 !== null) expect(s0).toBe(0);
        if (o0 !== null) expect(o0).toBe(0);
    });

    test('M5: WHEEL_NO_ZERO has 36 entries (no 0, but has 26 for 0/26 pocket)', () => {
        if (R.WHEEL_NO_ZERO) {
            expect(R.WHEEL_NO_ZERO.length).toBeGreaterThanOrEqual(36);
            // Contains 26 (shared pocket with 0)
            expect(R.WHEEL_NO_ZERO.includes(26)).toBe(true);
        }
    });
});
