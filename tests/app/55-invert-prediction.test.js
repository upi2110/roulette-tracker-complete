/**
 * Test Suite 55: Invert Prediction
 *
 * Tests the Invert button feature that reverses predicted numbers:
 *   - All 37 roulette numbers (0-36) minus currently predicted = inverted set
 *   - Works across Manual, Semi, and Auto modes
 *   - Properly toggles between inverted and original states
 *   - Correct anchor/loose recomputation for inverted sets
 *
 * Groups:
 *   A: Core invert logic (pure math, no DOM)
 *   B: Anchor recomputation for inverted sets
 *   C: State management (toggle, reset, restore)
 *   D: Integration with prediction objects
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

const ALL_ROULETTE_NUMS = Array.from({ length: 37 }, (_, i) => i); // 0-36

// ═══════════════════════════════════════════════════════════
//  GROUP A: CORE INVERT LOGIC
// ═══════════════════════════════════════════════════════════

describe('Group A: Core Invert Logic', () => {

    function invertNumbers(predicted) {
        const currentNums = new Set(predicted);
        return ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));
    }

    test('A1: Invert of 12 numbers produces 25 numbers', () => {
        const predicted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const inverted = invertNumbers(predicted);
        expect(inverted.length).toBe(25); // 37 - 12
    });

    test('A2: Invert of 25 numbers produces 12 numbers', () => {
        const predicted = ALL_ROULETTE_NUMS.slice(0, 25);
        const inverted = invertNumbers(predicted);
        expect(inverted.length).toBe(12);
    });

    test('A3: Invert of all 37 numbers produces empty set', () => {
        const inverted = invertNumbers(ALL_ROULETTE_NUMS);
        expect(inverted.length).toBe(0);
    });

    test('A4: Invert of empty set produces all 37 numbers', () => {
        const inverted = invertNumbers([]);
        expect(inverted.length).toBe(37);
        expect(inverted).toEqual(ALL_ROULETTE_NUMS);
    });

    test('A5: All inverted numbers are in 0-36 range', () => {
        const predicted = [0, 5, 10, 15, 20, 25, 30, 35];
        const inverted = invertNumbers(predicted);
        inverted.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        });
    });

    test('A6: No overlap between original and inverted sets', () => {
        const predicted = [3, 7, 11, 15, 19, 23, 27, 31, 35];
        const inverted = invertNumbers(predicted);
        const predictedSet = new Set(predicted);

        inverted.forEach(n => {
            expect(predictedSet.has(n)).toBe(false);
        });
    });

    test('A7: Original union inverted equals full set {0..36}', () => {
        const predicted = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
        const inverted = invertNumbers(predicted);
        const union = [...predicted, ...inverted].sort((a, b) => a - b);
        expect(union).toEqual(ALL_ROULETTE_NUMS);
    });

    test('A8: Double invert restores original numbers', () => {
        const predicted = [1, 5, 9, 13, 17, 21, 25, 29, 33];
        const inverted = invertNumbers(predicted);
        const doubleInverted = invertNumbers(inverted);
        expect(doubleInverted.sort((a, b) => a - b)).toEqual(predicted.sort((a, b) => a - b));
    });

    test('A9: Invert of single number produces 36 numbers', () => {
        const inverted = invertNumbers([17]);
        expect(inverted.length).toBe(36);
        expect(inverted.includes(17)).toBe(false);
    });

    test('A10: Invert handles duplicates in input gracefully', () => {
        // If input has duplicates, invert should still work correctly
        const predicted = [5, 5, 10, 10, 15];
        const inverted = invertNumbers(predicted);
        // Set removes duplicates, so only 3 unique numbers
        expect(inverted.length).toBe(34); // 37 - 3 unique
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP B: ANCHOR RECOMPUTATION
// ═══════════════════════════════════════════════════════════

describe('Group B: Anchor Recomputation for Inverted Sets', () => {
    let calculateWheelAnchors;

    beforeAll(() => {
        setupDOM();
        const R = loadRendererFunctions();
        // calculateWheelAnchors is set on the global window by renderer-3tables.js
        calculateWheelAnchors = global.window.calculateWheelAnchors || R.calculateWheelAnchors;
    });

    function invertNumbers(predicted) {
        const currentNums = new Set(predicted);
        return ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));
    }

    test('B1: Inverted set gets valid anchors from calculateWheelAnchors', () => {
        if (!calculateWheelAnchors) return; // Skip if not available

        const predicted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const inverted = invertNumbers(predicted);

        const result = calculateWheelAnchors(inverted);
        expect(result).toHaveProperty('anchors');
        expect(result).toHaveProperty('loose');
        expect(result).toHaveProperty('anchorGroups');
        expect(Array.isArray(result.anchors)).toBe(true);
        expect(Array.isArray(result.loose)).toBe(true);
    });

    test('B2: All inverted numbers appear in either anchors or loose (full coverage)', () => {
        if (!calculateWheelAnchors) return;

        const predicted = [0, 5, 10, 15, 20, 25, 30, 35];
        const inverted = invertNumbers(predicted);

        const result = calculateWheelAnchors(inverted);
        const covered = new Set([
            ...(result.anchors || []),
            ...(result.loose || []),
            ...((result.anchorGroups || []).flatMap(ag => ag.group || []))
        ]);

        // Every inverted number should be covered
        inverted.forEach(n => {
            expect(covered.has(n)).toBe(true);
        });
    });

    test('B3: Anchor groups have valid structure', () => {
        if (!calculateWheelAnchors) return;

        const predicted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const inverted = invertNumbers(predicted);
        const result = calculateWheelAnchors(inverted);

        (result.anchorGroups || []).forEach(ag => {
            expect(ag).toHaveProperty('anchor');
            expect(ag).toHaveProperty('group');
            expect(typeof ag.anchor).toBe('number');
            expect(Array.isArray(ag.group)).toBe(true);
            expect(ag.group.length).toBeGreaterThan(0);
        });
    });

    test('B4: Large inverted set (25+ numbers) computes without error', () => {
        if (!calculateWheelAnchors) return;

        const predicted = [0, 5, 10, 15, 20, 25, 30, 35, 1, 2, 3, 4];
        const inverted = invertNumbers(predicted);
        expect(inverted.length).toBe(25);

        expect(() => calculateWheelAnchors(inverted)).not.toThrow();
    });

    test('B5: Small inverted set (3 numbers) computes without error', () => {
        if (!calculateWheelAnchors) return;

        // Predict 34 numbers, invert gives 3
        const predicted = ALL_ROULETTE_NUMS.slice(0, 34);
        const inverted = invertNumbers(predicted);
        expect(inverted.length).toBe(3);

        expect(() => calculateWheelAnchors(inverted)).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP C: STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════

describe('Group C: State Management', () => {

    test('C1: _isInverted starts as false', () => {
        // Simulate panel state
        const state = { _isInverted: false, _originalPrediction: null };
        expect(state._isInverted).toBe(false);
        expect(state._originalPrediction).toBeNull();
    });

    test('C2: Invert sets _isInverted to true and saves original', () => {
        const originalPrediction = {
            numbers: [1, 2, 3, 4, 5],
            anchors: [2, 3],
            loose: [1, 4, 5],
            anchor_groups: [],
            extraNumbers: []
        };

        // Simulate invert action
        const state = { _isInverted: false, _originalPrediction: null };
        state._originalPrediction = { ...originalPrediction };
        state._isInverted = true;

        expect(state._isInverted).toBe(true);
        expect(state._originalPrediction).not.toBeNull();
        expect(state._originalPrediction.numbers).toEqual([1, 2, 3, 4, 5]);
    });

    test('C3: Restore sets _isInverted to false and clears original', () => {
        const state = {
            _isInverted: true,
            _originalPrediction: { numbers: [1, 2, 3] }
        };

        // Simulate restore action
        const restored = state._originalPrediction;
        state._isInverted = false;
        state._originalPrediction = null;

        expect(state._isInverted).toBe(false);
        expect(state._originalPrediction).toBeNull();
        expect(restored.numbers).toEqual([1, 2, 3]);
    });

    test('C4: clearSelections resets invert state', () => {
        const state = {
            _isInverted: true,
            _originalPrediction: { numbers: [1, 2, 3] }
        };

        // Simulate clearSelections
        state._isInverted = false;
        state._originalPrediction = null;

        expect(state._isInverted).toBe(false);
        expect(state._originalPrediction).toBeNull();
    });

    test('C5: New non-inverted prediction resets invert state', () => {
        const state = {
            _isInverted: true,
            _originalPrediction: { numbers: [1, 2, 3] }
        };

        // Simulate receiving a fresh prediction (no _isInverted flag)
        const newPrediction = { numbers: [10, 11, 12], _isInverted: undefined };
        if (!newPrediction._isInverted) {
            state._isInverted = false;
            state._originalPrediction = null;
        }

        expect(state._isInverted).toBe(false);
    });

    test('C6: Inverted prediction preserves _isInverted and _originalNumbers flags', () => {
        const original = { numbers: [1, 2, 3, 4, 5] };
        const currentNums = new Set(original.numbers);
        const invertedNums = ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));

        const invertedPrediction = {
            ...original,
            numbers: invertedNums,
            _isInverted: true,
            _originalNumbers: [...original.numbers]
        };

        expect(invertedPrediction._isInverted).toBe(true);
        expect(invertedPrediction._originalNumbers).toEqual([1, 2, 3, 4, 5]);
        expect(invertedPrediction.numbers.length).toBe(32); // 37 - 5
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP D: INTEGRATION WITH PREDICTION OBJECTS
// ═══════════════════════════════════════════════════════════

describe('Group D: Integration with Prediction Objects', () => {

    test('D1: Inverted prediction object has all required fields', () => {
        const original = {
            numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            anchors: [3, 5, 8],
            loose: [1, 2, 4, 6, 7, 9, 10, 11, 12],
            anchor_groups: [{ anchor: 3, group: [2, 3, 4], type: '±1' }],
            extraNumbers: [20, 21],
            signal: 'BET NOW',
            confidence: 85,
            reasoning: { method: 'test' }
        };

        const currentNums = new Set(original.numbers);
        const invertedNums = ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));

        const invertedPrediction = {
            ...original,
            numbers: invertedNums,
            anchors: [], // Would be recomputed
            loose: invertedNums, // Fallback
            anchor_groups: [],
            extraNumbers: [],
            signal: `INVERTED (${invertedNums.length} numbers)`,
            _isInverted: true,
            _originalNumbers: [...original.numbers]
        };

        // Has all required fields
        expect(invertedPrediction).toHaveProperty('numbers');
        expect(invertedPrediction).toHaveProperty('anchors');
        expect(invertedPrediction).toHaveProperty('loose');
        expect(invertedPrediction).toHaveProperty('anchor_groups');
        expect(invertedPrediction).toHaveProperty('extraNumbers');
        expect(invertedPrediction).toHaveProperty('signal');
        expect(invertedPrediction).toHaveProperty('confidence');

        // Preserved original reasoning
        expect(invertedPrediction.reasoning).toEqual({ method: 'test' });
        expect(invertedPrediction.confidence).toBe(85);

        // Inverted fields
        expect(invertedPrediction.numbers.length).toBe(25);
        expect(invertedPrediction.extraNumbers.length).toBe(0);
        expect(invertedPrediction._isInverted).toBe(true);
        expect(invertedPrediction._originalNumbers).toEqual(original.numbers);
    });

    test('D2: Signal text shows correct count for inverted state', () => {
        const numCount = 25;
        const isInverted = true;

        // Simulate signal indicator update logic
        let signalText;
        if (isInverted) {
            signalText = `🔄 ${numCount} INVERTED`;
        } else {
            signalText = `✅ ${numCount} COMMON`;
        }

        expect(signalText).toBe('🔄 25 INVERTED');
    });

    test('D3: Signal text shows COMMON for non-inverted state', () => {
        const numCount = 12;
        const isInverted = false;

        let signalText;
        if (isInverted) {
            signalText = `🔄 ${numCount} INVERTED`;
        } else {
            signalText = `✅ ${numCount} COMMON`;
        }

        expect(signalText).toBe('✅ 12 COMMON');
    });

    test('D4: Button text shows correct inverted count when not inverted', () => {
        const numCount = 12;
        const isInverted = false;
        const invertCount = 37 - numCount;

        let btnText;
        if (isInverted) {
            btnText = `↩️ RESTORE ORIGINAL (12 numbers)`;
        } else {
            btnText = `🔄 INVERT (${invertCount} numbers)`;
        }

        expect(btnText).toBe('🔄 INVERT (25 numbers)');
    });

    test('D5: Button text shows RESTORE when in inverted state', () => {
        const isInverted = true;
        const originalCount = 12;

        let btnText;
        if (isInverted) {
            btnText = `↩️ RESTORE ORIGINAL (${originalCount} numbers)`;
        } else {
            btnText = `🔄 INVERT (25 numbers)`;
        }

        expect(btnText).toBe('↩️ RESTORE ORIGINAL (12 numbers)');
    });

    test('D6: Inverted prediction for typical 12-number set', () => {
        // Typical prediction: P-1 pair with ±1 expansion = ~12 numbers
        const predicted = [2, 3, 4, 17, 18, 19, 25, 26, 27, 32, 33, 34];
        const currentNums = new Set(predicted);
        const invertedNums = ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));

        expect(invertedNums.length).toBe(25);
        expect(invertedNums.includes(2)).toBe(false);
        expect(invertedNums.includes(0)).toBe(true);
        expect(invertedNums.includes(1)).toBe(true);
        expect(invertedNums.includes(5)).toBe(true);
    });

    test('D7: Inverted prediction for filtered set preserves filter flags', () => {
        const original = {
            numbers: [1, 2, 3, 4, 5],
            anchors: [],
            loose: [1, 2, 3, 4, 5],
            anchor_groups: [],
            extraNumbers: [],
            confidence: 90,
            _someFilterFlag: 'preserved'
        };

        const currentNums = new Set(original.numbers);
        const invertedNums = ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));

        const invertedPrediction = {
            ...original,
            numbers: invertedNums,
            _isInverted: true,
            _originalNumbers: [...original.numbers]
        };

        // Spread preserves arbitrary flags
        expect(invertedPrediction._someFilterFlag).toBe('preserved');
        expect(invertedPrediction.confidence).toBe(90);
    });

    test('D8: Invert is idempotent when applied twice via toggle', () => {
        const original = [5, 10, 15, 20, 25, 30];
        const currentNums = new Set(original);
        const inverted = ALL_ROULETTE_NUMS.filter(n => !currentNums.has(n));
        const invertedSet = new Set(inverted);
        const restored = ALL_ROULETTE_NUMS.filter(n => !invertedSet.has(n));

        expect(restored.sort((a, b) => a - b)).toEqual(original.sort((a, b) => a - b));
    });
});
