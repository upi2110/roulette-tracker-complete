/**
 * Tests for SemiAutoFilter — Semi-Auto Filter Mode (Third Strategy)
 *
 * User picks pair manually → system auto-selects filter combo
 * that produces fewest numbers ≥ 4. Tiebreaker: more numbers
 * from same table as last spin actual.
 */

const { SemiAutoFilter, SA_ZERO, SA_NINE, SA_POS, SA_NEG, SA_SET0, SA_SET5, SA_SET6, SEMI_FILTER_COMBOS, SEMI_MIN_NUMBERS } = require('../../app/semi-auto-filter');

describe('SemiAutoFilter', () => {
    let filter;

    beforeEach(() => {
        filter = new SemiAutoFilter();
        // Reset window.spins
        global.window = { spins: [] };
    });

    afterEach(() => {
        delete global.window;
    });

    // ═════════════════════════════════════════════════════
    //  A: ENABLE / DISABLE
    // ═════════════════════════════════════════════════════

    test('A1: starts disabled', () => {
        expect(filter.isEnabled).toBe(false);
    });

    test('A2: enable() sets isEnabled true', () => {
        filter.enable();
        expect(filter.isEnabled).toBe(true);
    });

    test('A3: disable() sets isEnabled false', () => {
        filter.enable();
        filter.disable();
        expect(filter.isEnabled).toBe(false);
    });

    // ═════════════════════════════════════════════════════
    //  B: NUMBER SETS INTEGRITY
    // ═════════════════════════════════════════════════════

    test('B1: SA_ZERO has 19 numbers', () => {
        expect(SA_ZERO.size).toBe(19);
    });

    test('B2: SA_NINE has 18 numbers', () => {
        expect(SA_NINE.size).toBe(18);
    });

    test('B3: SA_POS has 19 numbers', () => {
        expect(SA_POS.size).toBe(19);
    });

    test('B4: SA_NEG has 18 numbers', () => {
        expect(SA_NEG.size).toBe(18);
    });

    test('B5: Zero and Nineteen tables are disjoint and cover 0-36', () => {
        const all = new Set([...SA_ZERO, ...SA_NINE]);
        expect(all.size).toBe(37); // 0-36
        // Disjoint
        for (const n of SA_ZERO) {
            expect(SA_NINE.has(n)).toBe(false);
        }
    });

    test('B6: Positive and Negative are disjoint and cover 0-36', () => {
        const all = new Set([...SA_POS, ...SA_NEG]);
        expect(all.size).toBe(37);
        for (const n of SA_POS) {
            expect(SA_NEG.has(n)).toBe(false);
        }
    });

    test('B7: SEMI_FILTER_COMBOS has 36 entries', () => {
        expect(SEMI_FILTER_COMBOS.length).toBe(36);
    });

    test('B8: SEMI_MIN_NUMBERS is 4', () => {
        expect(SEMI_MIN_NUMBERS).toBe(4);
    });

    // ═════════════════════════════════════════════════════
    //  C: _passesComboFilter — individual filter logic
    // ═════════════════════════════════════════════════════

    test('C1: zero_positive passes only numbers in ZERO ∩ POSITIVE', () => {
        const combo = { table: 'zero', sign: 'positive' };
        const expected = [...SA_ZERO].filter(n => SA_POS.has(n));
        for (let n = 0; n <= 36; n++) {
            const passes = filter._passesComboFilter(n, combo);
            expect(passes).toBe(expected.includes(n));
        }
    });

    test('C2: zero_negative passes only numbers in ZERO ∩ NEGATIVE', () => {
        const combo = { table: 'zero', sign: 'negative' };
        for (let n = 0; n <= 36; n++) {
            const expected = SA_ZERO.has(n) && SA_NEG.has(n);
            expect(filter._passesComboFilter(n, combo)).toBe(expected);
        }
    });

    test('C3: nineteen_positive passes only numbers in NINETEEN ∩ POSITIVE', () => {
        const combo = { table: 'nineteen', sign: 'positive' };
        for (let n = 0; n <= 36; n++) {
            const expected = SA_NINE.has(n) && SA_POS.has(n);
            expect(filter._passesComboFilter(n, combo)).toBe(expected);
        }
    });

    test('C4: nineteen_negative passes only numbers in NINETEEN ∩ NEGATIVE', () => {
        const combo = { table: 'nineteen', sign: 'negative' };
        for (let n = 0; n <= 36; n++) {
            const expected = SA_NINE.has(n) && SA_NEG.has(n);
            expect(filter._passesComboFilter(n, combo)).toBe(expected);
        }
    });

    test('C5: both_both passes ALL 37 numbers', () => {
        const combo = { table: 'both', sign: 'both' };
        for (let n = 0; n <= 36; n++) {
            expect(filter._passesComboFilter(n, combo)).toBe(true);
        }
    });

    test('C6: zero_both passes all zero-table numbers', () => {
        const combo = { table: 'zero', sign: 'both' };
        for (let n = 0; n <= 36; n++) {
            expect(filter._passesComboFilter(n, combo)).toBe(SA_ZERO.has(n));
        }
    });

    test('C7: nineteen_both passes all nineteen-table numbers', () => {
        const combo = { table: 'nineteen', sign: 'both' };
        for (let n = 0; n <= 36; n++) {
            expect(filter._passesComboFilter(n, combo)).toBe(SA_NINE.has(n));
        }
    });

    test('C8: both_positive passes all positive numbers', () => {
        const combo = { table: 'both', sign: 'positive' };
        for (let n = 0; n <= 36; n++) {
            expect(filter._passesComboFilter(n, combo)).toBe(SA_POS.has(n));
        }
    });

    test('C9: both_negative passes all negative numbers', () => {
        const combo = { table: 'both', sign: 'negative' };
        for (let n = 0; n <= 36; n++) {
            expect(filter._passesComboFilter(n, combo)).toBe(SA_NEG.has(n));
        }
    });

    // ═════════════════════════════════════════════════════
    //  D: computeOptimalFilter — core logic
    // ═════════════════════════════════════════════════════

    test('D1: returns null for empty prediction numbers', () => {
        expect(filter.computeOptimalFilter([])).toBeNull();
    });

    test('D2: returns null for null/undefined', () => {
        expect(filter.computeOptimalFilter(null)).toBeNull();
        expect(filter.computeOptimalFilter(undefined)).toBeNull();
    });

    test('D3: returns optimal combo considering count and sign diversity', () => {
        // Use numbers that span both tables & both signs
        // so multiple combos produce different counts
        const numbers = [0, 3, 26, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6];
        const result = filter.computeOptimalFilter(numbers);
        expect(result).not.toBeNull();
        expect(result.count).toBeGreaterThanOrEqual(4);

        // The optimal filter should prefer mixed-sign filters over pure-one-sign
        // even if the pure-one-sign has fewer numbers, because sign diversity
        // penalty (-0.06) makes mixed filters more competitive.
        // Result should be a valid filter with >= 4 numbers
        expect(result.filtered.length).toBe(result.count);
        // All filtered numbers should pass the combo filter
        const combo = SEMI_FILTER_COMBOS.find(c => c.key === result.key);
        expect(combo).toBeDefined();
        result.filtered.forEach(n => {
            expect(filter._passesComboFilter(n, combo)).toBe(true);
        });
    });

    test('D4: skips combos producing < 4 numbers', () => {
        // Use only 3 zero-positive numbers — zero_positive should produce 3, skip it
        const zeroPos = [...SA_ZERO].filter(n => SA_POS.has(n)).slice(0, 3);
        // Add enough nineteen-table numbers to make at least one combo valid
        const ninePos = [...SA_NINE].filter(n => SA_POS.has(n)).slice(0, 5);
        const numbers = [...zeroPos, ...ninePos];

        const result = filter.computeOptimalFilter(numbers);
        expect(result).not.toBeNull();
        // zero_positive should have only 3 numbers, so it can't be selected
        if (result.key === 'zero_positive') {
            // This should NOT happen
            expect(result.count).toBeGreaterThanOrEqual(4);
        }
        expect(result.count).toBeGreaterThanOrEqual(4);
    });

    test('D5: returns null when no combo produces ≥ 4 numbers', () => {
        // Just 3 numbers — no combo can produce ≥ 4
        const result = filter.computeOptimalFilter([0, 3, 26]);
        // both_both gives 3, which is < 4
        expect(result).toBeNull();
    });

    test('D6: exactly 4 numbers in a combo is accepted (boundary)', () => {
        // Pick exactly 4 zero-positive numbers
        const zeroPos = [...SA_ZERO].filter(n => SA_POS.has(n)).slice(0, 4);
        const result = filter.computeOptimalFilter(zeroPos);
        expect(result).not.toBeNull();
        expect(result.count).toBe(4);
    });

    test('D7: prefers smaller count over larger count', () => {
        // Create numbers where zero_positive has 5 and nineteen_positive has 7
        const zeroPos = [...SA_ZERO].filter(n => SA_POS.has(n)).slice(0, 5);
        const ninePos = [...SA_NINE].filter(n => SA_POS.has(n)).slice(0, 7);
        const numbers = [...zeroPos, ...ninePos];

        const result = filter.computeOptimalFilter(numbers);
        expect(result).not.toBeNull();
        // Should prefer 5 over 7
        expect(result.count).toBeLessThanOrEqual(5);
    });

    test('D8: both_both returns all numbers (no filtering)', () => {
        const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const bothBoth = numbers.filter(n => filter._passesComboFilter(n, { table: 'both', sign: 'both' }));
        expect(bothBoth.length).toBe(numbers.length);
    });

    // ═════════════════════════════════════════════════════
    //  E: TIEBREAKER — last actual's table
    // ═════════════════════════════════════════════════════

    test('E1: tiebreaker returns 0 when no last actual', () => {
        expect(filter._computeTiebreak([0, 3, 26], null)).toBe(0);
        expect(filter._computeTiebreak([0, 3, 26], undefined)).toBe(0);
    });

    test('E2: tiebreaker counts zero-table numbers when last actual is zero-table', () => {
        // lastActual = 0 (zero table)
        const filtered = [0, 3, 26, 15, 19]; // 0,3,26 = zero table; 15,19 = nineteen table
        const count = filter._computeTiebreak(filtered, 0);
        expect(count).toBe(3); // 0, 3, 26 are zero table
    });

    test('E3: tiebreaker counts nineteen-table numbers when last actual is nineteen-table', () => {
        // lastActual = 19 (nineteen table)
        const filtered = [0, 3, 15, 19, 4]; // 0,3 = zero; 15,19,4 = nineteen
        const count = filter._computeTiebreak(filtered, 19);
        expect(count).toBe(3); // 15, 19, 4 are nineteen table
    });

    test('E4: tiebreaker with equal-count combos — prefers higher tiebreak', () => {
        // Build numbers where two combos give the same count but different tiebreaks
        // Last actual = 0 (zero table) → prefer combo with more zero-table numbers
        window.spins = [0];

        // 6 zero-positive numbers
        const zeroPos = [...SA_ZERO].filter(n => SA_POS.has(n)).slice(0, 6);
        // 6 nineteen-positive numbers
        const ninePos = [...SA_NINE].filter(n => SA_POS.has(n)).slice(0, 6);
        const numbers = [...zeroPos, ...ninePos];

        const result = filter.computeOptimalFilter(numbers);
        expect(result).not.toBeNull();
        // Both zero_positive and nineteen_positive have 6 numbers
        // Tiebreaker: lastActual=0 (zero table) → zero_positive has 6 zero-table, nineteen_positive has 0
        // So zero_positive should win
        expect(result.key).toBe('zero_positive');
    });

    test('E5: tiebreaker with last actual from nineteen table', () => {
        window.spins = [19]; // nineteen table

        // 5 zero-negative numbers
        const zeroNeg = [...SA_ZERO].filter(n => SA_NEG.has(n)).slice(0, 5);
        // 5 nineteen-negative numbers
        const nineNeg = [...SA_NINE].filter(n => SA_NEG.has(n)).slice(0, 5);
        const numbers = [...zeroNeg, ...nineNeg];

        const result = filter.computeOptimalFilter(numbers);
        expect(result).not.toBeNull();
        // Both combos have 5. Last actual=19 (nineteen) → nineteen_negative has 5 nineteen numbers
        expect(result.key).toBe('nineteen_negative');
    });

    // ═════════════════════════════════════════════════════
    //  F: applyOptimalFilter — integration
    // ═════════════════════════════════════════════════════

    test('F1: applyOptimalFilter calls _setWheelFilters when result found', () => {
        let calledWith = null;
        window.autoUpdateOrchestrator = {
            _setWheelFilters: (key) => { calledWith = key; }
        };

        const numbers = [...SA_ZERO].filter(n => SA_POS.has(n)).slice(0, 5);
        const result = filter.applyOptimalFilter(numbers);
        expect(result).not.toBeNull();
        expect(calledWith).toBe(result.key);
    });

    test('F2: applyOptimalFilter returns null and does not call _setWheelFilters when no combo qualifies', () => {
        let called = false;
        window.autoUpdateOrchestrator = {
            _setWheelFilters: () => { called = true; }
        };

        const result = filter.applyOptimalFilter([0, 3, 26]); // only 3 numbers
        expect(result).toBeNull();
        expect(called).toBe(false);
    });

    test('F3: applyOptimalFilter works without orchestrator (no crash)', () => {
        delete window.autoUpdateOrchestrator;
        const numbers = [...SA_ZERO].filter(n => SA_POS.has(n)).slice(0, 5);
        const result = filter.applyOptimalFilter(numbers);
        expect(result).not.toBeNull(); // still computes, just doesn't apply
    });

    // ═════════════════════════════════════════════════════
    //  G: EDGE CASES
    // ═════════════════════════════════════════════════════

    test('G1: all numbers from one table — both_* combos equal that tables combos', () => {
        // All zero-table numbers
        const zeroNums = [...SA_ZERO];
        const result = filter.computeOptimalFilter(zeroNums);
        expect(result).not.toBeNull();
        // Smallest combo should be zero_positive or zero_negative (intersections)
        expect(result.key).toMatch(/^zero_/);
    });

    test('G2: all numbers from one sign — *_positive or *_negative combos match', () => {
        // All positive numbers
        const posNums = [...SA_POS];
        const result = filter.computeOptimalFilter(posNums);
        expect(result).not.toBeNull();
        // Should pick a table-filtered combo (zero or nineteen) since those give fewer
        expect(result.key).toMatch(/_positive$/);
    });

    test('G3: large number set — both_both not preferred when tighter combos exist', () => {
        // All 37 numbers
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const result = filter.computeOptimalFilter(allNums);
        expect(result).not.toBeNull();
        // both_both gives 37 — should NOT be selected
        expect(result.key).not.toBe('both_both');
        expect(result.count).toBeLessThan(37);
    });

    test('G4: duplicate numbers in input handled correctly', () => {
        const numbers = [0, 0, 3, 3, 26, 26, 32, 32]; // duplicates
        const result = filter.computeOptimalFilter(numbers);
        // Duplicates pass through filter — count reflects duplicates
        expect(result).not.toBeNull();
        expect(result.count).toBeGreaterThanOrEqual(4);
    });

    test('G5: numbers outside 0-36 are filtered out by all combos', () => {
        const numbers = [37, 38, 39, 40, 41]; // all invalid
        const result = filter.computeOptimalFilter(numbers);
        // No valid numbers pass any filter
        expect(result).toBeNull();
    });

    // ═════════════════════════════════════════════════════
    //  H: SPECIFIC FILTER COMBO VERIFICATION
    // ═════════════════════════════════════════════════════

    test('H1: zero_positive intersection is correct', () => {
        const expected = [...SA_ZERO].filter(n => SA_POS.has(n));
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const filtered = allNums.filter(n => filter._passesComboFilter(n, { table: 'zero', sign: 'positive' }));
        expect(new Set(filtered)).toEqual(new Set(expected));
    });

    test('H2: nineteen_negative intersection is correct', () => {
        const expected = [...SA_NINE].filter(n => SA_NEG.has(n));
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const filtered = allNums.filter(n => filter._passesComboFilter(n, { table: 'nineteen', sign: 'negative' }));
        expect(new Set(filtered)).toEqual(new Set(expected));
    });

    test('H3: each combo produces correct count from full 0-36', () => {
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const setMap = { set0: SA_SET0, set5: SA_SET5, set6: SA_SET6 };

        function expectedCount(combo) {
            // Determine table filter
            let tableNums;
            if (combo.table === 'both') tableNums = allNums;
            else if (combo.table === 'zero') tableNums = allNums.filter(n => SA_ZERO.has(n));
            else tableNums = allNums.filter(n => SA_NINE.has(n));

            // Apply sign filter
            let filtered;
            if (combo.sign === 'both') filtered = tableNums;
            else if (combo.sign === 'positive') filtered = tableNums.filter(n => SA_POS.has(n));
            else filtered = tableNums.filter(n => SA_NEG.has(n));

            // Apply set filter
            if (combo.set && combo.set !== 'all') {
                const setNums = setMap[combo.set];
                filtered = filtered.filter(n => setNums.has(n));
            }
            return filtered.length;
        }

        for (const combo of SEMI_FILTER_COMBOS) {
            const filtered = allNums.filter(n => filter._passesComboFilter(n, combo));
            expect(filtered.length).toBe(expectedCount(combo));
        }
    });

    // ═════════════════════════════════════════════════════
    //  I: CONFIDENCE-AWARE FILTER SCORING
    // ═════════════════════════════════════════════════════

    test('I1: without sequence model, still picks valid filter', () => {
        filter.sequenceModel = null;
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const result = filter.computeOptimalFilter(allNums);
        expect(result).not.toBeNull();
        expect(result.count).toBeGreaterThanOrEqual(4);
    });

    test('I2: with confident sequence model, favors predicted filter', () => {
        const { AISequenceModel } = require('../../app/ai-sequence-model');
        const mockModel = new AISequenceModel({ minSamples: 1 });
        // Override scoreFilterCombos to return confident zero prediction
        mockModel.isTrained = true;
        mockModel.scoreFilterCombos = () => ({
            scores: {
                zero_positive: 0.70, zero_negative: 0.70, zero_both: 0.70,
                nineteen_positive: 0.30, nineteen_negative: 0.30, nineteen_both: 0.30,
                both_positive: 0.50, both_negative: 0.50, both_both: 1.0
            },
            prediction: { confident: true, tableConfident: true, signConfident: false },
            confident: true
        });
        filter.setSequenceModel(mockModel);

        const origWindow = global.window;
        global.window = { spins: [4] };
        try {
            const allNums = Array.from({ length: 37 }, (_, i) => i);
            const result = filter.computeOptimalFilter(allNums);
            expect(result).not.toBeNull();
            // Should favor zero_* when confident about zero table
            expect(result.key).toMatch(/^zero/);
        } finally {
            global.window = origWindow;
        }
    });

    test('I3: with NOT confident sequence model, avoids double-restrictive filters', () => {
        const { AISequenceModel } = require('../../app/ai-sequence-model');
        const mockModel = new AISequenceModel({ minSamples: 1 });
        mockModel.isTrained = true;
        mockModel.scoreFilterCombos = () => ({
            scores: {
                zero_positive: 0.25, zero_negative: 0.25, zero_both: 0.50,
                nineteen_positive: 0.25, nineteen_negative: 0.25, nineteen_both: 0.50,
                both_positive: 0.50, both_negative: 0.50, both_both: 1.0
            },
            prediction: { confident: false, tableConfident: false, signConfident: false },
            confident: false
        });
        filter.setSequenceModel(mockModel);

        const origWindow = global.window;
        global.window = { spins: [4] };
        try {
            const allNums = Array.from({ length: 37 }, (_, i) => i);
            const result = filter.computeOptimalFilter(allNums);
            expect(result).not.toBeNull();
            // Should NOT pick double-restrictive (e.g. zero_positive)
            const parts = result.key.split('_');
            const isDoubleRestrict = parts[0] !== 'both' && parts[1] !== 'both';
            expect(isDoubleRestrict).toBe(false);
        } finally {
            global.window = origWindow;
        }
    });

    test('I4: setSequenceModel correctly stores and clears model', () => {
        expect(filter.sequenceModel).toBeNull();
        const { AISequenceModel } = require('../../app/ai-sequence-model');
        const model = new AISequenceModel();
        filter.setSequenceModel(model);
        expect(filter.sequenceModel).toBe(model);
        filter.setSequenceModel(null);
        expect(filter.sequenceModel).toBeNull();
    });
});
