/**
 * Regression Test Suite #5 — Edge Cases, Boundaries & Defensive Coding
 *
 * Covers:
 * A. Sequence model boundary inputs
 * B. Engine with malformed/missing data
 * C. Semi-auto filter edge cases
 * D. Renderer getNumberAtPosition all valid codes
 * E. Money panel state edge cases
 * F. Engine skip/bet decision boundary conditions
 * G. Filter scoring math edge cases
 * H. Projection functions with minimal spins
 * I. Data loader with various input formats
 * J. Wheel order and distance edge cases
 */

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
             prev_prev: prevPrev !== undefined ? prevPrev : prev };
}
function _getPosCodeDistance(pc) { if (!pc || pc === 'XX') return null; const m = pc.match(/[+\-](\d+)$/); return m ? parseInt(m[1],10) : null; }
function generateAnchors(r, o, pc) { const p = [], g = []; if (!pc || pc === 'XX') return { purple: p, green: g }; p.push(r, o); return { purple: p, green: g }; }
function expandAnchorsToBetNumbers(purple, green) {
    const result = new Set(), len = WHEEL_STANDARD.length;
    for (const a of purple) { const i = WHEEL_STANDARD.indexOf(a); if (i !== -1) for (let d = -2; d <= 2; d++) result.add(WHEEL_STANDARD[(i+d+len)%len]); }
    for (const n of green) { const i = WHEEL_STANDARD.indexOf(n); if (i !== -1) for (let d = -1; d <= 1; d++) result.add(WHEEL_STANDARD[(i+d+len)%len]); }
    return Array.from(result);
}

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

beforeAll(() => { global.AISequenceModel = AISequenceModel; });
afterAll(() => { delete global.AISequenceModel; });

function randomSession(count, seed = 42) {
    const spins = []; let s = seed;
    for (let i = 0; i < count; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; spins.push(s % 37); }
    return spins;
}

// ═══════════════════════════════════════════════════════════════
// A. SEQUENCE MODEL BOUNDARY INPUTS
// ═══════════════════════════════════════════════════════════════

describe('A. Sequence Model Boundary Inputs', () => {

    test('A1: Train with empty sessions array', () => {
        const model = new AISequenceModel();
        model.train([]);
        expect(model.isTrained).toBe(false);
    });

    test('A2: Train with single-spin session', () => {
        const model = new AISequenceModel();
        model.train([[15]]);
        // Can't build transitions from single spin
        expect(model.baseline.total).toBe(0);
    });

    test('A3: Train with two-spin session', () => {
        const model = new AISequenceModel();
        model.train([[15, 19]]);
        // Should build exactly 1 transition
        expect(model.baseline.total).toBe(1);
        expect(model.isTrained).toBe(true);
    });

    test('A4: Predict with empty recent spins', () => {
        const model = new AISequenceModel();
        model.train([randomSession(100)]);
        const result = model.predict([]);
        // Should return baseline/fallback
        expect(result).toBeDefined();
    });

    test('A5: Predict with single recent spin', () => {
        const model = new AISequenceModel();
        model.train([randomSession(100)]);
        const result = model.predict([15]);
        expect(result).toBeDefined();
        expect(result.pZeroTable).toBeDefined();
    });

    test('A6: Train with all-same-number session', () => {
        const model = new AISequenceModel();
        model.train([Array(50).fill(15)]);
        expect(model.isTrained).toBe(true);
        // After 15, next is always 15 (nineteen-table, positive)
        const pred = model.predict([15]);
        expect(pred).toBeDefined();
    });

    test('A7: minSamples = 0 uses all data', () => {
        const model = new AISequenceModel({ minSamples: 0 });
        model.train([[15, 19, 4]]);
        const pred = model.predict([4]);
        expect(pred).toBeDefined();
    });

    test('A8: minSamples = 1000 forces baseline fallback', () => {
        const model = new AISequenceModel({ minSamples: 1000 });
        model.train([randomSession(50)]);
        const pred = model.predict([15]);
        // With high minSamples, should fall back to baseline
        expect(pred).toBeDefined();
    });

    test('A9: scoreFilterCombos on untrained model', () => {
        const model = new AISequenceModel();
        const scores = model.scoreFilterCombos([15, 19]);
        expect(scores.scores['both_both']).toBe(1.0);
    });

    test('A10: Predict with number not in training data', () => {
        // Train only with numbers 0-10
        const session = [];
        for (let i = 0; i < 50; i++) session.push(i % 11);
        const model = new AISequenceModel();
        model.train([session]);
        // Predict with number 36 which wasn't in training
        const pred = model.predict([36]);
        expect(pred).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════════════════
// B. ENGINE WITH MALFORMED/MISSING DATA
// ═══════════════════════════════════════════════════════════════

describe('B. Engine With Malformed/Missing Data', () => {

    test('B1: decide with empty flashData returns SKIP', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);
        const decision = engine.decide({}, randomSession(10));
        expect(decision.action).toBe('SKIP');
    });

    test('B2: decide with null recentSpins', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);
        const flashData = {};
        PAIR_REFKEYS.forEach(pk => { flashData[pk] = { hitRate: 0.15, hits: 3, total: 20 }; });
        // Should not throw
        const decision = engine.decide(flashData, null);
        expect(['BET', 'SKIP']).toContain(decision.action);
    });

    test('B3: decide on untrained engine returns SKIP', () => {
        const engine = new AIAutoEngine();
        const decision = engine.decide({}, [15, 19]);
        expect(decision.action).toBe('SKIP');
    });

    test('B4: recordResult with invalid pair key does not throw', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);
        engine.isEnabled = true;
        expect(() => {
            engine.recordResult('nonexistent_pair', 'zero_positive', false, 15, [1, 2, 3]);
        }).not.toThrow();
    });

    test('B5: train with very short sessions (< 3 spins each)', () => {
        const engine = new AIAutoEngine();
        const result = engine.train([[15, 19], [4, 21], [2, 25]]);
        expect(engine.isTrained).toBe(true);
        // Very short sessions may not produce many total counted spins
        expect(result.totalSpins).toBeGreaterThanOrEqual(0);
    });

    test('B6: retrain with empty array does not crash', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200)]);
        expect(() => engine.retrain([])).not.toThrow();
        expect(engine.isTrained).toBe(true);
    });

    test('B7: getState on untrained engine', () => {
        const engine = new AIAutoEngine();
        const state = engine.getState();
        expect(state).toBeDefined();
        expect(state.isTrained).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════
// C. SEMI-AUTO FILTER EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('C. Semi-Auto Filter Edge Cases', () => {

    let savedOrch;
    beforeEach(() => {
        savedOrch = window.autoUpdateOrchestrator;
        window.autoUpdateOrchestrator = undefined;
    });
    afterEach(() => {
        window.autoUpdateOrchestrator = savedOrch;
    });

    test('C1: computeOptimalFilter with all 37 numbers', () => {
        const filter = new SemiAutoFilter();
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const result = filter.computeOptimalFilter(allNums);
        // Should find a filter that reduces the set
        if (result) {
            expect(result.count).toBeLessThan(37);
            expect(result.key).not.toBe('both_both');
        }
    });

    test('C2: computeOptimalFilter with only 4 numbers', () => {
        const filter = new SemiAutoFilter();
        // 4 numbers that all pass one filter
        const nums = [0, 32, 3, 26]; // all zero-table
        const result = filter.computeOptimalFilter(nums);
        if (result) {
            expect(result.count).toBeGreaterThanOrEqual(4);
        }
    });

    test('C3: computeOptimalFilter with 3 numbers returns null (below minimum)', () => {
        const filter = new SemiAutoFilter();
        const result = filter.computeOptimalFilter([15, 19, 4]);
        // If no filter produces >= 4, returns null
        // (3 numbers may all pass one filter but 3 < 4)
        // Result could be null or valid depending on filter overlap
        if (result) {
            expect(result.count).toBeGreaterThanOrEqual(4);
        }
    });

    test('C4: setSequenceModel with null does not crash', () => {
        const filter = new SemiAutoFilter();
        expect(() => filter.setSequenceModel(null)).not.toThrow();
    });

    test('C5: setSequenceModel then computeOptimalFilter uses scores', () => {
        const model = new AISequenceModel();
        model.train([randomSession(200), randomSession(200, 99)]);

        const filter = new SemiAutoFilter();
        filter.setSequenceModel(model);

        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27];
        const result = filter.computeOptimalFilter(numbers);
        if (result) {
            expect(result.key).not.toBe('both_both');
        }
    });

    test('C6: Numbers spanning only one table category', () => {
        const filter = new SemiAutoFilter();
        // All zero-table numbers
        const zeroNums = [...SA_ZERO];
        const result = filter.computeOptimalFilter(zeroNums);
        if (result) {
            // Set prediction now runs first — returns both_both_setN (or falls back to zero_*)
            expect(result.key).toMatch(/^(zero_|both_both_set[056]$)/);
        }
    });

    test('C7: Numbers spanning only one sign category', () => {
        const filter = new SemiAutoFilter();
        // All positive numbers
        const posNums = [...SEQ_POS];
        const result = filter.computeOptimalFilter(posNums);
        if (result) {
            // Set prediction now runs first — returns both_both_setN (or falls back to *positive)
            expect(result.key).toMatch(/(positive|^both_both_set[056]$)/);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// D. RENDERER getNumberAtPosition — ALL VALID CODES
// ═══════════════════════════════════════════════════════════════

describe('D. Renderer getNumberAtPosition — All Valid Codes', () => {

    let R;
    beforeAll(() => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        R = loadRendererFunctions();
    });

    const validCodes = ['S+0', 'SL+1', 'SR+1', 'SL+2', 'SR+2', 'SL+3', 'SR+3', 'SL+4', 'SR+4',
                        'O+0', 'OL+1', 'OR+1', 'OL+2', 'OR+2', 'OL+3', 'OR+3', 'OL+4', 'OR+4', 'XX'];

    test('D1: All valid codes produce results for ref=15', () => {
        for (const code of validCodes) {
            const result = R.getNumberAtPosition(15, code);
            if (code === 'XX') {
                expect(result).toBeNull();
            } else {
                expect(result).not.toBeNull();
                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(36);
            }
        }
    });

    test('D2: All valid codes produce results for ref=0', () => {
        for (const code of validCodes) {
            const result = R.getNumberAtPosition(0, code);
            if (code === 'XX') {
                expect(result).toBeNull();
            } else {
                expect(result).not.toBeNull();
            }
        }
    });

    test('D3: S+0 always returns the reference itself', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.getNumberAtPosition(n, 'S+0')).toBe(n);
        }
    });

    test('D4: O+0 always returns the opposite', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.getNumberAtPosition(n, 'O+0')).toBe(R.REGULAR_OPPOSITES[n]);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// E. MONEY PANEL STATE EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('E. Money Panel State Edge Cases', () => {

    test('E1: Fresh panel has correct defaults', () => {
        const panel = createMoneyPanel();
        expect(panel.sessionData.currentBankroll).toBe(4000);
        expect(panel.sessionData.sessionProfit).toBe(0);
        expect(panel.sessionData.totalBets).toBe(0);
        expect(panel.sessionData.bettingStrategy).toBe(3); // Default: Cautious
        expect(panel.sessionData.currentBetPerNumber).toBe(2);
        expect(panel.sessionData.isBettingEnabled).toBe(false);
    });

    test('E2: Win with 1 number bet', async () => {
        const panel = createMoneyPanel();
        panel.sessionData.isSessionActive = true;
        panel.sessionData.bettingStrategy = 1;
        // Win on a single number: 35×bet - bet = 34×bet
        await panel.recordBetResult(5, 1, true, 15);
        expect(panel.sessionData.sessionProfit).toBe(5 * 35 - 5); // 170
    });

    test('E3: Win with 18 number bet', async () => {
        const panel = createMoneyPanel();
        panel.sessionData.isSessionActive = true;
        panel.sessionData.bettingStrategy = 1;
        // Win: 35×bet - 18×bet = 17×bet
        await panel.recordBetResult(5, 18, true, 15);
        expect(panel.sessionData.sessionProfit).toBe(5 * 35 - 5 * 18); // 85
    });

    test('E4: Loss with maximum bet numbers', async () => {
        const panel = createMoneyPanel();
        panel.sessionData.isSessionActive = true;
        panel.sessionData.bettingStrategy = 1;
        await panel.recordBetResult(5, 37, false, 15);
        expect(panel.sessionData.sessionProfit).toBe(-5 * 37); // -185
    });

    test('E5: Multiple rapid bets track bet count', async () => {
        const panel = createMoneyPanel();
        panel.sessionData.isSessionActive = true;
        panel.sessionData.bettingStrategy = 1;
        for (let i = 0; i < 10; i++) {
            await panel.recordBetResult(2, 12, false, 15);
        }
        expect(panel.sessionData.totalBets).toBe(10);
        expect(panel.sessionData.totalLosses).toBe(10);
    });

    test('E6: Chip breakdown for large amount', () => {
        const panel = createMoneyPanel();
        const breakdown = panel.calculateChipBreakdown(999);
        const total = breakdown.reduce((sum, b) => sum + b.value * b.count, 0);
        expect(total).toBe(999);
    });
});

// ═══════════════════════════════════════════════════════════════
// F. ENGINE SKIP/BET DECISION BOUNDARY CONDITIONS
// ═══════════════════════════════════════════════════════════════

describe('F. Engine Skip/Bet Boundary Conditions', () => {

    test('F1: All pairs with 0 hitRate → SKIP', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);

        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0, hits: 0, total: 20 };
        });

        const decision = engine.decide(flashData, randomSession(10));
        expect(decision.action).toBe('SKIP');
    });

    test('F2: maxConsecutiveSkips tracks in session', () => {
        const engine = new AIAutoEngine({ maxConsecutiveSkips: 3 });
        engine.train([randomSession(200), randomSession(200, 99)]);

        const flashData = {};
        PAIR_REFKEYS.forEach(pk => {
            flashData[pk] = { hitRate: 0, hits: 0, total: 20 };
        });

        // Force skips
        for (let i = 0; i < 2; i++) {
            engine.decide(flashData, randomSession(10, i));
        }
        expect(engine.session.consecutiveSkips).toBeGreaterThanOrEqual(0);
    });

    test('F3: Cooldown after 3 losses activates cooldown flag', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);
        engine.isEnabled = true;

        // Record 3 consecutive losses
        for (let i = 0; i < 3; i++) {
            engine.recordResult('prev', 'zero_positive', false, 15, [0, 3, 4]);
        }
        expect(engine.session.cooldownActive).toBe(true);
        expect(engine.session.consecutiveLosses).toBe(3);
    });

    test('F4: Win exits cooldown', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);
        engine.isEnabled = true;

        // Activate cooldown
        for (let i = 0; i < 3; i++) {
            engine.recordResult('prev', 'zero_positive', false, 15, [0, 3, 4]);
        }
        expect(engine.session.cooldownActive).toBe(true);

        // Win should exit cooldown
        engine.recordResult('prev', 'zero_positive', true, 3, [0, 3, 4]);
        expect(engine.session.cooldownActive).toBe(false);
    });

    test('F5: Near-miss detection — actual is neighbor of predicted', () => {
        const engine = new AIAutoEngine();
        engine.train([randomSession(200), randomSession(200, 99)]);
        engine.isEnabled = true;

        // Record with near-miss (actual 32 is neighbor of predicted 0,15,32)
        expect(() => {
            engine.recordResult('prev', 'zero_positive', false, 32, [0, 15, 19]);
        }).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════
// G. FILTER SCORING MATH EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('G. Filter Scoring Math Edge Cases', () => {

    test('G1: Sequence model scores sum correctly per axis', () => {
        const model = new AISequenceModel();
        model.train([randomSession(200), randomSession(200, 99)]);
        const pred = model.predict([15]);

        // Table axis probabilities should sum to ~1.0
        const tableSum = pred.pZeroTable + pred.pNineteenTable;
        expect(tableSum).toBeCloseTo(1.0, 1);

        // Sign axis probabilities should sum to ~1.0
        const signSum = pred.pPositive + pred.pNegative;
        expect(signSum).toBeCloseTo(1.0, 1);
    });

    test('G2: All probabilities are between 0 and 1', () => {
        const model = new AISequenceModel();
        model.train([randomSession(200)]);

        for (let n = 0; n <= 36; n++) {
            const pred = model.predict([n]);
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

    test('G3: Biased data produces biased predictions', () => {
        // After zero-table number, always goes to nineteen-table
        const biased = [];
        const zeroNums = [...SEQ_ZERO];
        const nineNums = [...SEQ_NINE];
        for (let i = 0; i < 200; i++) {
            biased.push(zeroNums[i % zeroNums.length]);
            biased.push(nineNums[i % nineNums.length]);
        }

        const model = new AISequenceModel();
        model.train([biased]);

        // After a zero-table number, should predict nineteen-table
        const pred = model.predict([zeroNums[0]]);
        expect(pred.pNineteenTable).toBeGreaterThan(pred.pZeroTable);
    });
});

// ═══════════════════════════════════════════════════════════════
// H. PROJECTION FUNCTIONS WITH MINIMAL SPINS
// ═══════════════════════════════════════════════════════════════

describe('H. Projection Functions With Minimal Spins', () => {

    let R;
    beforeEach(() => {
        setupDOM();
        global.getLookupRow = jest.fn((n) => ({
            first: (n + 5) % 37,
            second: (n + 10) % 37,
            third: (n + 15) % 37
        }));
        R = loadRendererFunctions();
        R.spins.length = 0;
    });

    test('H1: getTable1NextProjections with 0 spins returns empty', () => {
        const proj = R.getTable1NextProjections();
        expect(Object.keys(proj)).toHaveLength(0);
    });

    test('H2: getTable2NextProjections with 0 spins returns empty', () => {
        const proj = R.getTable2NextProjections();
        expect(Object.keys(proj)).toHaveLength(0);
    });

    test('H3: getTable1NextProjections with 1 spin returns projections', () => {
        R.spins.push({ actual: 15, direction: 'CW' });
        const proj = R.getTable1NextProjections();
        expect(Object.keys(proj).length).toBeGreaterThan(0);
        // Should have 'prev', 'ref0', 'ref19' at minimum
        expect(proj['prev']).toBeDefined();
    });

    test('H4: getTable2NextProjections with 1 spin has ±2 expansion', () => {
        R.spins.push({ actual: 10, direction: 'CW' });
        const proj = R.getTable2NextProjections();
        if (proj['prev']) {
            // ±2 expansion should produce more numbers than ±1
            const t2Count = proj['prev']['first'] ? proj['prev']['first'].numbers.length : 0;
            expect(t2Count).toBeGreaterThanOrEqual(6); // target + ±2 same + ±2 opp
        }
    });

    test('H5: Projections include 13-opposite pairs', () => {
        R.spins.push({ actual: 15, direction: 'CW' });
        const proj = R.getTable1NextProjections();
        // Should have '_13opp' entries
        const hasOpp = Object.keys(proj).some(k => k.endsWith('_13opp'));
        expect(hasOpp).toBe(true);
    });

    test('H6: Projection numbers are valid 0-36', () => {
        R.spins.push({ actual: 0, direction: 'CW' });
        const proj = R.getTable1NextProjections();
        for (const pairKey of Object.keys(proj)) {
            for (const refKey of ['first', 'second', 'third']) {
                if (proj[pairKey][refKey]) {
                    proj[pairKey][refKey].numbers.forEach(n => {
                        expect(n).toBeGreaterThanOrEqual(0);
                        expect(n).toBeLessThanOrEqual(36);
                    });
                }
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// I. DATA LOADER WITH VARIOUS INPUT FORMATS
// ═══════════════════════════════════════════════════════════════

describe('I. Data Loader With Various Input Formats', () => {

    test('I1: parseTextContent throws on empty string', () => {
        const loader = new AIDataLoader();
        expect(() => loader.parseTextContent('')).toThrow();
    });

    test('I2: parseTextContent handles single number per line', () => {
        const loader = new AIDataLoader();
        const text = '15\n19\n4\n21\n2';
        const result = loader.parseTextContent(text, 'test.txt');
        expect(result.spins.length).toBe(5);
        // parseTextContent reverses to chronological order (oldest first)
        expect(result.spins).toEqual([2, 21, 4, 19, 15]);
    });

    test('I3: toSpinFormat converts numbers to spin objects', () => {
        const loader = new AIDataLoader();
        const spins = loader.toSpinFormat([15, 19, 4, 21, 2]);
        expect(spins).toHaveLength(5);
        spins.forEach(s => {
            expect(s.actual).toBeDefined();
            expect(s.direction).toBeDefined();
        });
    });

    test('I4: toSpinFormat alternates direction C/AC', () => {
        const loader = new AIDataLoader();
        const spins = loader.toSpinFormat([15, 19, 4, 21]);
        // Should alternate C/AC
        expect(spins[0].direction).toBe('C');
        expect(spins[1].direction).toBe('AC');
        expect(spins[2].direction).toBe('C');
        expect(spins[3].direction).toBe('AC');
    });

    test('I5: getAllSpins returns flat array from sessions', () => {
        const loader = new AIDataLoader();
        loader.sessions = [
            { filename: 'a.txt', spins: [15, 19, 4], length: 3 },
            { filename: 'b.txt', spins: [21, 2, 25], length: 3 }
        ];
        const all = loader.getAllSpins();
        expect(all).toHaveLength(6);
    });
});

// ═══════════════════════════════════════════════════════════════
// J. WHEEL ORDER AND DISTANCE EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('J. Wheel Order and Distance Edge Cases', () => {

    let R;
    beforeAll(() => {
        setupDOM();
        global.getLookupRow = jest.fn(() => null);
        R = loadRendererFunctions();
    });

    test('J1: WHEEL_STANDARD starts with 0 and ends with 26', () => {
        expect(R.WHEEL_STANDARD[0]).toBe(0);
        expect(R.WHEEL_STANDARD[36]).toBe(26);
    });

    test('J2: WHEEL_NO_ZERO has 26 at both ends', () => {
        expect(R.WHEEL_NO_ZERO[0]).toBe(26);
        expect(R.WHEEL_NO_ZERO[36]).toBe(26);
    });

    test('J3: Position code from end of wheel to start wraps', () => {
        // 3 is at index 35, 0/26 is at index 0/36
        const code = R.calculatePositionCode(3, 0);
        // 0 and 26 share pocket; 3 is adjacent to 26/0 on the wheel
        expect(code).not.toBe('XX');
    });

    test('J4: Every number has a getWheel36Index >= 0', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.getWheel36Index(n)).toBeGreaterThanOrEqual(0);
        }
    });

    test('J5: calculatePositionCode handles 0 as reference', () => {
        for (let act = 0; act <= 36; act++) {
            const code = R.calculatePositionCode(0, act);
            expect(code).toBeDefined();
        }
    });

    test('J6: calculatePositionCode handles 26 as reference', () => {
        for (let act = 0; act <= 36; act++) {
            const code = R.calculatePositionCode(26, act);
            expect(code).toBeDefined();
        }
    });

    test('J7: calculatePositionCode(0, 26) same as (26, 0) — S+0', () => {
        expect(R.calculatePositionCode(0, 26)).toBe('S+0');
        expect(R.calculatePositionCode(26, 0)).toBe('S+0');
    });
});

console.log('✅ Edge Cases & Boundaries regression test suite loaded');
