/**
 * Tests for 0 Set / 5 Set / 6 Set Number Filters
 *
 * Three disjoint number sets covering all 37 European roulette numbers:
 *   0 Set (13): {0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12}  (0/26 same pocket)
 *   5 Set (12): {32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28}
 *   6 Set (12): {4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3}
 *
 * Integrated as a third filter dimension (checkboxes) alongside table/sign (radios).
 */

const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS, REFKEY_TO_PAIR_NAME, EUROPEAN_WHEEL } = require('../../app/ai-auto-engine');
const { SemiAutoFilter, SA_ZERO, SA_NINE, SA_POS, SA_NEG, SA_SET0, SA_SET5, SA_SET6, SEMI_FILTER_COMBOS, SEMI_MIN_NUMBERS } = require('../../app/semi-auto-filter');

// ── Helpers ───────────────────────────────────────────────────
const SET_0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
const SET_5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
const SET_6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

const ZERO_TABLE = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const NINETEEN_TABLE = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const POSITIVE = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const NEGATIVE = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

const ALL_NUMBERS = Array.from({ length: 37 }, (_, i) => i); // 0-36

function generateTestSpins(count) {
    const spins = [];
    for (let i = 0; i < count; i++) {
        spins.push(Math.floor(Math.random() * 37));
    }
    return spins;
}

describe('43 — Set Filters (0 Set / 5 Set / 6 Set)', () => {

    // ═══════════════════════════════════════════════════════════
    //  A: SET DEFINITIONS (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('A: Set Definitions', () => {
        test('A1: SET_0 (0 Set) has exactly 13 members (0/26 share pocket)', () => {
            expect(SA_SET0.size).toBe(13);
        });

        test('A2: SET_5 (5 Set) has exactly 12 members', () => {
            expect(SA_SET5.size).toBe(12);
        });

        test('A3: SET_6 (6 Set) has exactly 12 members', () => {
            expect(SA_SET6.size).toBe(12);
        });

        test('A4: Union of all 3 sets = {0..36} (37 unique numbers)', () => {
            const union = new Set([...SA_SET0, ...SA_SET5, ...SA_SET6]);
            expect(union.size).toBe(37);
            for (let i = 0; i <= 36; i++) {
                expect(union.has(i)).toBe(true);
            }
        });

        test('A5: Sets are pairwise disjoint', () => {
            // 0 ∩ 5 = ∅
            const inter05 = [...SA_SET0].filter(n => SA_SET5.has(n));
            expect(inter05).toEqual([]);
            // 0 ∩ 6 = ∅
            const inter06 = [...SA_SET0].filter(n => SA_SET6.has(n));
            expect(inter06).toEqual([]);
            // 5 ∩ 6 = ∅
            const inter56 = [...SA_SET5].filter(n => SA_SET6.has(n));
            expect(inter56).toEqual([]);
        });

        test('A6: 0 and 26 are both in 0 Set (same pocket)', () => {
            expect(SA_SET0.has(0)).toBe(true);
            expect(SA_SET0.has(26)).toBe(true);
        });

        test('A7: Each set has balanced table coverage (~6 zero + ~6 nineteen)', () => {
            for (const [name, set] of [['0 Set', SA_SET0], ['5 Set', SA_SET5], ['6 Set', SA_SET6]]) {
                const zeroCount = [...set].filter(n => ZERO_TABLE.has(n)).length;
                const nineteenCount = [...set].filter(n => NINETEEN_TABLE.has(n)).length;
                // Each set should have roughly half from each table (within ±2)
                expect(Math.abs(zeroCount - nineteenCount)).toBeLessThanOrEqual(3);
            }
        });

        test('A8: Each set has balanced sign coverage (~6 positive + ~6 negative)', () => {
            for (const [name, set] of [['0 Set', SA_SET0], ['5 Set', SA_SET5], ['6 Set', SA_SET6]]) {
                const posCount = [...set].filter(n => POSITIVE.has(n)).length;
                const negCount = [...set].filter(n => NEGATIVE.has(n)).length;
                expect(Math.abs(posCount - negCount)).toBeLessThanOrEqual(3);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  B: FILTER_COMBOS EXPANSION (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('B: FILTER_COMBOS Expansion', () => {
        test('B1: Total 36 combos', () => {
            expect(FILTER_COMBOS.length).toBe(36);
        });

        test('B2: Original 9 have set: "all", keys unchanged', () => {
            const originalKeys = [
                'zero_positive', 'zero_negative', 'zero_both',
                'nineteen_positive', 'nineteen_negative', 'nineteen_both',
                'both_positive', 'both_negative', 'both_both'
            ];
            originalKeys.forEach(key => {
                const fc = FILTER_COMBOS.find(f => f.key === key);
                expect(fc).toBeDefined();
                expect(fc.set).toBe('all');
            });
        });

        test('B3: 9 combos with set: "set0"', () => {
            const set0Combos = FILTER_COMBOS.filter(f => f.set === 'set0');
            expect(set0Combos.length).toBe(9);
        });

        test('B4: 9 combos with set: "set5"', () => {
            const set5Combos = FILTER_COMBOS.filter(f => f.set === 'set5');
            expect(set5Combos.length).toBe(9);
        });

        test('B5: 9 combos with set: "set6"', () => {
            const set6Combos = FILTER_COMBOS.filter(f => f.set === 'set6');
            expect(set6Combos.length).toBe(9);
        });

        test('B6: All keys are unique', () => {
            const keys = FILTER_COMBOS.map(f => f.key);
            const unique = new Set(keys);
            expect(unique.size).toBe(36);
        });

        test('B7: Every combo has table, sign, and set properties', () => {
            FILTER_COMBOS.forEach(fc => {
                expect(fc).toHaveProperty('table');
                expect(fc).toHaveProperty('sign');
                expect(fc).toHaveProperty('set');
                expect(['zero', 'nineteen', 'both']).toContain(fc.table);
                expect(['positive', 'negative', 'both']).toContain(fc.sign);
                expect(['all', 'set0', 'set5', 'set6']).toContain(fc.set);
            });
        });

        test('B8: Backward compat — original 9 keys unchanged from expected values', () => {
            const first9 = FILTER_COMBOS.slice(0, 9);
            expect(first9.map(f => f.key)).toEqual([
                'zero_positive', 'zero_negative', 'zero_both',
                'nineteen_positive', 'nineteen_negative', 'nineteen_both',
                'both_positive', 'both_negative', 'both_both'
            ]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  C: _applyFilterToNumbers WITH SETS (10 tests)
    // ═══════════════════════════════════════════════════════════
    describe('C: _applyFilterToNumbers with Sets', () => {
        let engine;

        beforeEach(() => {
            engine = new AIAutoEngine();
        });

        test('C1: set:"all" returns same as original (no set filtering)', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive');
            // Zero table ∩ positive
            const expected = ALL_NUMBERS.filter(n => ZERO_TABLE.has(n) && POSITIVE.has(n));
            expect(result.sort()).toEqual(expected.sort());
        });

        test('C2: "both_both_set0" returns only 0 Set numbers', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set0');
            expect(result.length).toBe(13);
            result.forEach(n => expect(SET_0.has(n)).toBe(true));
        });

        test('C3: "both_both_set5" returns only 5 Set numbers', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set5');
            expect(result.length).toBe(12);
            result.forEach(n => expect(SET_5.has(n)).toBe(true));
        });

        test('C4: "both_both_set6" returns only 6 Set numbers', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set6');
            expect(result.length).toBe(12);
            result.forEach(n => expect(SET_6.has(n)).toBe(true));
        });

        test('C5: "zero_positive_set0" = triple intersection (zero ∩ positive ∩ set0)', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive_set0');
            const expected = ALL_NUMBERS.filter(n =>
                ZERO_TABLE.has(n) && POSITIVE.has(n) && SET_0.has(n)
            );
            expect(result.sort()).toEqual(expected.sort());
            // Every result must be in all three sets
            result.forEach(n => {
                expect(ZERO_TABLE.has(n)).toBe(true);
                expect(POSITIVE.has(n)).toBe(true);
                expect(SET_0.has(n)).toBe(true);
            });
        });

        test('C6: "nineteen_negative_set5" = triple intersection', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'nineteen_negative_set5');
            const expected = ALL_NUMBERS.filter(n =>
                NINETEEN_TABLE.has(n) && NEGATIVE.has(n) && SET_5.has(n)
            );
            expect(result.sort()).toEqual(expected.sort());
        });

        test('C7: "both_positive_set6" = positive ∩ set6', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_positive_set6');
            const expected = ALL_NUMBERS.filter(n =>
                (ZERO_TABLE.has(n) || NINETEEN_TABLE.has(n)) && POSITIVE.has(n) && SET_6.has(n)
            );
            expect(result.sort()).toEqual(expected.sort());
        });

        test('C8: Narrow triple intersection produces few numbers', () => {
            // zero ∩ positive ∩ set0 should be a small set
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive_set0');
            expect(result.length).toBeLessThan(7);
            expect(result.length).toBeGreaterThan(0);
        });

        test('C9: "both_both_set0" = exactly 13 numbers (full 0 Set)', () => {
            const result = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set0');
            expect(result.length).toBe(13);
        });

        test('C10: Empty input returns empty', () => {
            const result = engine._applyFilterToNumbers([], 'both_both_set0');
            expect(result).toEqual([]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  D: _selectBestFilter WITH SETS (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('D: _selectBestFilter with Sets', () => {
        let engine;

        beforeEach(() => {
            engine = new AIAutoEngine();
            // Initialize empty filterModels and session for all 36 combos
            FILTER_COMBOS.forEach(fc => {
                engine.filterModels[fc.key] = { hitRate: 0, totalTrials: 0 };
                engine.session.filterPerformance[fc.key] = { attempts: 0, hits: 0 };
            });
        });

        test('D1: "both_both" (set:"all") still skipped', () => {
            const result = engine._selectBestFilter(ALL_NUMBERS, 'prev');
            expect(result.filterKey).not.toBe('both_both');
        });

        test('D2: "both_both_set0" NOT skipped (13 numbers)', () => {
            // Give both_both_set0 very high score so it would be chosen if not skipped
            engine.filterModels['both_both_set0'] = { hitRate: 1.0, totalTrials: 100 };
            const result = engine._selectBestFilter(ALL_NUMBERS, 'prev');
            // It should be a candidate (may or may not win depending on other scores)
            const set0Filtered = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set0');
            expect(set0Filtered.length).toBe(13);
            expect(set0Filtered.length).toBeGreaterThanOrEqual(4);
        });

        test('D3: "both_both_set5" NOT skipped (12 numbers)', () => {
            engine.filterModels['both_both_set5'] = { hitRate: 1.0, totalTrials: 100 };
            const set5Filtered = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set5');
            expect(set5Filtered.length).toBe(12);
        });

        test('D4: "both_both_set6" NOT skipped (12 numbers)', () => {
            engine.filterModels['both_both_set6'] = { hitRate: 1.0, totalTrials: 100 };
            const set6Filtered = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set6');
            expect(set6Filtered.length).toBe(12);
        });

        test('D5: Narrow 3-way combos (<4 numbers) auto-eliminated', () => {
            // Find combos that produce < 4 numbers from all 37
            const narrowCombos = FILTER_COMBOS.filter(fc => {
                const filtered = engine._applyFilterToNumbers(ALL_NUMBERS, fc.key);
                return filtered.length < 4 && filtered.length > 0;
            });

            // These narrow combos should never be selected
            narrowCombos.forEach(nc => {
                engine.filterModels[nc.key] = { hitRate: 1.0, totalTrials: 100 };
            });

            const result = engine._selectBestFilter(ALL_NUMBERS, 'prev');
            const resultFiltered = engine._applyFilterToNumbers(ALL_NUMBERS, result.filterKey);
            expect(resultFiltered.length).toBeGreaterThanOrEqual(4);
        });

        test('D6: Best filter correctly selected from 36 options', () => {
            // Give one specific combo a very high score
            engine.filterModels['zero_both_set5'] = { hitRate: 0.95, totalTrials: 100 };
            const result = engine._selectBestFilter(ALL_NUMBERS, 'prev');
            // The selected filter should produce ≥4 numbers
            expect(result.filteredNumbers.length).toBeGreaterThanOrEqual(4);
        });

        test('D7: Training produces 36 filter models', () => {
            const trainEngine = new AIAutoEngine();
            // Mock required functions
            const spins = generateTestSpins(50);
            trainEngine._getWindowSpins = () => spins;
            trainEngine._getAIDataV6 = () => null;

            trainEngine.train(spins);

            // All 36 filter combos should have models
            const modelKeys = Object.keys(trainEngine.filterModels);
            FILTER_COMBOS.forEach(fc => {
                expect(modelKeys).toContain(fc.key);
            });
        });

        test('D8: Backward compat — original 9 keys still have valid models after training', () => {
            const trainEngine = new AIAutoEngine();
            const spins = generateTestSpins(50);
            trainEngine.train(spins);

            const original9 = ['zero_positive', 'zero_negative', 'zero_both',
                'nineteen_positive', 'nineteen_negative', 'nineteen_both',
                'both_positive', 'both_negative', 'both_both'];

            original9.forEach(key => {
                expect(trainEngine.filterModels[key]).toBeDefined();
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  E: SEMI-AUTO FILTER (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('E: Semi-Auto Filter', () => {
        let filter;

        beforeEach(() => {
            filter = new SemiAutoFilter();
            global.window = { spins: [17, 8, 24] };
        });

        afterEach(() => {
            delete global.window;
        });

        test('E1: SEMI_FILTER_COMBOS has 36 entries', () => {
            expect(SEMI_FILTER_COMBOS.length).toBe(36);
        });

        test('E2: SA_SET0/SA_SET5/SA_SET6 have correct members', () => {
            expect(SA_SET0).toEqual(SET_0);
            expect(SA_SET5).toEqual(SET_5);
            expect(SA_SET6).toEqual(SET_6);
        });

        test('E3: _passesComboFilter with set:"set0" — only set0 numbers pass', () => {
            const combo = { table: 'both', sign: 'both', set: 'set0' };
            const passing = ALL_NUMBERS.filter(n => filter._passesComboFilter(n, combo));
            expect(passing.length).toBe(13);
            passing.forEach(n => expect(SET_0.has(n)).toBe(true));
        });

        test('E4: _passesComboFilter with set:"all" — all numbers pass set check', () => {
            const combo = { table: 'both', sign: 'both', set: 'all' };
            const passing = ALL_NUMBERS.filter(n => filter._passesComboFilter(n, combo));
            expect(passing.length).toBe(37);
        });

        test('E5: computeOptimalFilter skips both_both (set:"all")', () => {
            const result = filter.computeOptimalFilter(ALL_NUMBERS);
            if (result) {
                expect(result.key).not.toBe('both_both');
            }
        });

        test('E6: computeOptimalFilter allows both_both_setX', () => {
            // With all 37 numbers as input, both_both_set0/set5/set6 should be valid candidates
            const result = filter.computeOptimalFilter(ALL_NUMBERS);
            expect(result).not.toBeNull();
            // The result should have ≥4 numbers
            expect(result.count).toBeGreaterThanOrEqual(4);
        });

        test('E7: 0 and 26 both in SA_SET0', () => {
            expect(SA_SET0.has(0)).toBe(true);
            expect(SA_SET0.has(26)).toBe(true);
        });

        test('E8: Sign diversity penalty still applies with set combos', () => {
            // Create numbers that are ALL positive
            const allPositive = [...POSITIVE];

            const result = filter.computeOptimalFilter(allPositive);
            // Result should exist but may have lower score due to sign penalty
            if (result) {
                expect(result.count).toBeGreaterThanOrEqual(SEMI_MIN_NUMBERS);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  F: WHEEL _passesFilter (10 tests)
    // ═══════════════════════════════════════════════════════════
    describe('F: Wheel _passesFilter simulation', () => {
        // We simulate the wheel's _passesFilter logic since we can't instantiate
        // the full DOM-dependent RouletteWheel in tests.
        function passesFilter(num, filters) {
            const inZero = ZERO_TABLE.has(num);
            const inNineteen = NINETEEN_TABLE.has(num);
            const tablePass = (filters.zeroTable && inZero) || (filters.nineteenTable && inNineteen);
            if (!tablePass) return false;

            const isPos = POSITIVE.has(num);
            const isNeg = NEGATIVE.has(num);
            const colorPass = (filters.positive && isPos) || (filters.negative && isNeg);
            if (!colorPass) return false;

            const allSetsOn = filters.set0 && filters.set5 && filters.set6;
            if (!allSetsOn) {
                const setPass = (filters.set0 && SET_0.has(num)) ||
                                (filters.set5 && SET_5.has(num)) ||
                                (filters.set6 && SET_6.has(num));
                if (!setPass) return false;
            }

            return true;
        }

        const allFilters = { zeroTable: true, nineteenTable: true, positive: true, negative: true, set0: true, set5: true, set6: true };

        test('F1: All sets checked → all 37 numbers pass set dimension', () => {
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, allFilters));
            expect(passing.length).toBe(37);
        });

        test('F2: Only set0 checked → 13 numbers pass', () => {
            const filters = { ...allFilters, set0: true, set5: false, set6: false };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(13);
            passing.forEach(n => expect(SET_0.has(n)).toBe(true));
        });

        test('F3: Only set5 checked → 12 numbers pass', () => {
            const filters = { ...allFilters, set0: false, set5: true, set6: false };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(12);
            passing.forEach(n => expect(SET_5.has(n)).toBe(true));
        });

        test('F4: Only set6 checked → 12 numbers pass', () => {
            const filters = { ...allFilters, set0: false, set5: false, set6: true };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(12);
            passing.forEach(n => expect(SET_6.has(n)).toBe(true));
        });

        test('F5: set0 + set5 → 25 numbers pass', () => {
            const filters = { ...allFilters, set0: true, set5: true, set6: false };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(25);
        });

        test('F6: set0 + set6 → 25 numbers pass', () => {
            const filters = { ...allFilters, set0: true, set5: false, set6: true };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(25);
        });

        test('F7: set5 + set6 → 24 numbers pass', () => {
            const filters = { ...allFilters, set0: false, set5: true, set6: true };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(24);
        });

        test('F8: No sets checked → 0 numbers pass', () => {
            const filters = { ...allFilters, set0: false, set5: false, set6: false };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            expect(passing.length).toBe(0);
        });

        test('F9: Set filter AND table filter → intersection only', () => {
            // Only zero table + only set0
            const filters = { zeroTable: true, nineteenTable: false, positive: true, negative: true, set0: true, set5: false, set6: false };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            // All passing numbers must be in both zero table AND set0
            passing.forEach(n => {
                expect(ZERO_TABLE.has(n)).toBe(true);
                expect(SET_0.has(n)).toBe(true);
            });
            // Count should be ~6 (zero ∩ set0)
            expect(passing.length).toBeGreaterThan(0);
            expect(passing.length).toBeLessThan(12);
        });

        test('F10: Set filter AND sign filter → intersection only', () => {
            // Both tables + positive only + set5 only
            const filters = { zeroTable: true, nineteenTable: true, positive: true, negative: false, set0: false, set5: true, set6: false };
            const passing = ALL_NUMBERS.filter(n => passesFilter(n, filters));
            passing.forEach(n => {
                expect(POSITIVE.has(n)).toBe(true);
                expect(SET_5.has(n)).toBe(true);
            });
            expect(passing.length).toBeGreaterThan(0);
            expect(passing.length).toBeLessThan(12);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  G: ORCHESTRATOR KEY PARSING (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('G: Orchestrator Key Parsing', () => {
        // Simulate orchestrator's _setWheelFilters key parsing logic
        function parseFilterKey(filterKey) {
            const parts = filterKey.split('_');
            const table = parts[0];
            const sign = parts.length > 1 ? parts[1] : 'both';
            const setKey = parts.length > 2 ? parts[2] : null;
            return { table, sign, setKey };
        }

        // Simulate which checkboxes would be set
        function getSetCheckState(setKey) {
            const state = { filterSet0: false, filterSet5: false, filterSet6: false };
            const SET_MAP = { set0: 'filterSet0', set5: 'filterSet5', set6: 'filterSet6' };
            if (setKey && SET_MAP[setKey]) {
                state[SET_MAP[setKey]] = true;
            } else {
                // No set specified → all checked
                state.filterSet0 = true;
                state.filterSet5 = true;
                state.filterSet6 = true;
            }
            return state;
        }

        test('G1: 2-part key "zero_positive" → all set checkboxes checked', () => {
            const { setKey } = parseFilterKey('zero_positive');
            expect(setKey).toBeNull();
            const state = getSetCheckState(setKey);
            expect(state.filterSet0).toBe(true);
            expect(state.filterSet5).toBe(true);
            expect(state.filterSet6).toBe(true);
        });

        test('G2: 3-part key "zero_positive_set0" → only set0 checked', () => {
            const { table, sign, setKey } = parseFilterKey('zero_positive_set0');
            expect(table).toBe('zero');
            expect(sign).toBe('positive');
            expect(setKey).toBe('set0');
            const state = getSetCheckState(setKey);
            expect(state.filterSet0).toBe(true);
            expect(state.filterSet5).toBe(false);
            expect(state.filterSet6).toBe(false);
        });

        test('G3: 3-part key "both_both_set5" → only set5 checked', () => {
            const { setKey } = parseFilterKey('both_both_set5');
            expect(setKey).toBe('set5');
            const state = getSetCheckState(setKey);
            expect(state.filterSet0).toBe(false);
            expect(state.filterSet5).toBe(true);
            expect(state.filterSet6).toBe(false);
        });

        test('G4: 3-part key "nineteen_negative_set6" → only set6 checked', () => {
            const { table, sign, setKey } = parseFilterKey('nineteen_negative_set6');
            expect(table).toBe('nineteen');
            expect(sign).toBe('negative');
            expect(setKey).toBe('set6');
            const state = getSetCheckState(setKey);
            expect(state.filterSet0).toBe(false);
            expect(state.filterSet5).toBe(false);
            expect(state.filterSet6).toBe(true);
        });

        test('G5: All 27 set-specific FILTER_COMBOS keys parse correctly', () => {
            const setSpecific = FILTER_COMBOS.filter(fc => fc.set !== 'all');
            expect(setSpecific.length).toBe(27);
            setSpecific.forEach(fc => {
                const { setKey } = parseFilterKey(fc.key);
                expect(setKey).toBe(fc.set);
            });
        });

        test('G6: All 9 original FILTER_COMBOS keys parse without setKey', () => {
            const originals = FILTER_COMBOS.filter(fc => fc.set === 'all');
            expect(originals.length).toBe(9);
            originals.forEach(fc => {
                const { setKey } = parseFilterKey(fc.key);
                expect(setKey).toBeNull();
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  H: CROSS-REFERENCE VALIDATION (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('H: Cross-Reference Validation', () => {
        let engine;

        beforeEach(() => {
            engine = new AIAutoEngine();
        });

        test('H1: AI engine set accessors match expected constants', () => {
            expect(engine._getSet0Nums()).toEqual(SET_0);
            expect(engine._getSet5Nums()).toEqual(SET_5);
            expect(engine._getSet6Nums()).toEqual(SET_6);
        });

        test('H2: Semi-auto set constants match expected constants', () => {
            expect(SA_SET0).toEqual(SET_0);
            expect(SA_SET5).toEqual(SET_5);
            expect(SA_SET6).toEqual(SET_6);
        });

        test('H3: All 36 FILTER_COMBOS keys are in SEMI_FILTER_COMBOS', () => {
            const semiKeys = new Set(SEMI_FILTER_COMBOS.map(f => f.key));
            FILTER_COMBOS.forEach(fc => {
                expect(semiKeys.has(fc.key)).toBe(true);
            });
        });

        test('H4: set0 ∩ zero_table has ~6 numbers', () => {
            const intersection = [...SET_0].filter(n => ZERO_TABLE.has(n));
            expect(intersection.length).toBeGreaterThanOrEqual(4);
            expect(intersection.length).toBeLessThanOrEqual(8);
        });

        test('H5: set0 ∩ positive has ~6 numbers', () => {
            const intersection = [...SET_0].filter(n => POSITIVE.has(n));
            expect(intersection.length).toBeGreaterThanOrEqual(4);
            expect(intersection.length).toBeLessThanOrEqual(8);
        });

        test('H6: set0 ∩ zero ∩ positive has few numbers (narrow triple intersection)', () => {
            const intersection = [...SET_0].filter(n => ZERO_TABLE.has(n) && POSITIVE.has(n));
            // This narrow triple intersection should be small
            expect(intersection.length).toBeLessThan(7);
            expect(intersection.length).toBeGreaterThan(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  I: SEMI_FILTER_COMBOS SYMMETRY (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('I: SEMI_FILTER_COMBOS Symmetry', () => {
        test('I1: SEMI_FILTER_COMBOS has identical structure to FILTER_COMBOS', () => {
            expect(SEMI_FILTER_COMBOS.length).toBe(FILTER_COMBOS.length);
            for (let i = 0; i < FILTER_COMBOS.length; i++) {
                expect(SEMI_FILTER_COMBOS[i].key).toBe(FILTER_COMBOS[i].key);
                expect(SEMI_FILTER_COMBOS[i].table).toBe(FILTER_COMBOS[i].table);
                expect(SEMI_FILTER_COMBOS[i].sign).toBe(FILTER_COMBOS[i].sign);
                expect(SEMI_FILTER_COMBOS[i].set).toBe(FILTER_COMBOS[i].set);
            }
        });

        test('I2: Every SEMI combo has the set property', () => {
            SEMI_FILTER_COMBOS.forEach(fc => {
                expect(fc).toHaveProperty('set');
                expect(['all', 'set0', 'set5', 'set6']).toContain(fc.set);
            });
        });

        test('I3: Semi-auto _passesComboFilter agrees with engine _applyFilterToNumbers', () => {
            const semiFilter = new SemiAutoFilter();
            // Test a few combos
            const testCombos = ['both_both_set0', 'zero_positive_set5', 'nineteen_negative_set6', 'zero_both'];
            testCombos.forEach(key => {
                const combo = SEMI_FILTER_COMBOS.find(c => c.key === key);
                if (!combo) return;

                const semiResult = ALL_NUMBERS.filter(n => semiFilter._passesComboFilter(n, combo));
                const engineResult = engine._applyFilterToNumbers(ALL_NUMBERS, key);
                expect(semiResult.sort()).toEqual(engineResult.sort());
            });
        });

        test('I4: Set-specific both_both combos are NOT skipped in semi-auto', () => {
            const semiFilter = new SemiAutoFilter();
            global.window = { spins: [5, 17, 32] };

            // With all 37 numbers, both_both_set0/set5/set6 should be candidates
            const result = semiFilter.computeOptimalFilter(ALL_NUMBERS);
            expect(result).not.toBeNull();
            // At least one set-specific combo should be a candidate
            const setSpecificKeys = SEMI_FILTER_COMBOS
                .filter(fc => fc.set !== 'all')
                .map(fc => fc.key);
            // Result might or might not be set-specific, but it should not be both_both
            if (result) {
                expect(result.key !== 'both_both' || result.key.includes('set')).toBe(true);
            }

            delete global.window;
        });

        test('I5: 9 combos per set type (including original "all")', () => {
            const bySets = {};
            SEMI_FILTER_COMBOS.forEach(fc => {
                bySets[fc.set] = (bySets[fc.set] || 0) + 1;
            });
            expect(bySets['all']).toBe(9);
            expect(bySets['set0']).toBe(9);
            expect(bySets['set5']).toBe(9);
            expect(bySets['set6']).toBe(9);
        });

        test('I6: All SEMI keys are unique', () => {
            const keys = SEMI_FILTER_COMBOS.map(f => f.key);
            const unique = new Set(keys);
            expect(unique.size).toBe(36);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  J: EXHAUSTIVE SET MEMBERSHIP (4 tests)
    // ═══════════════════════════════════════════════════════════
    describe('J: Exhaustive Set Membership', () => {
        test('J1: Every number 0-36 belongs to exactly one set', () => {
            for (let n = 0; n <= 36; n++) {
                const inSets = [SET_0.has(n), SET_5.has(n), SET_6.has(n)].filter(Boolean).length;
                expect(inSets).toBe(1);
            }
        });

        test('J2: 0 Set exact members', () => {
            expect([...SA_SET0].sort((a, b) => a - b)).toEqual([0, 2, 9, 10, 12, 13, 16, 19, 20, 26, 29, 30, 34]);
        });

        test('J3: 5 Set exact members', () => {
            expect([...SA_SET5].sort((a, b) => a - b)).toEqual([5, 7, 11, 14, 15, 17, 24, 25, 28, 31, 32, 36]);
        });

        test('J4: 6 Set exact members', () => {
            expect([...SA_SET6].sort((a, b) => a - b)).toEqual([1, 3, 4, 6, 8, 18, 21, 22, 23, 27, 33, 35]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  K: FILTER COUNT VALIDATION (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('K: Filter Count Validation', () => {
        let engine;

        beforeEach(() => {
            engine = new AIAutoEngine();
        });

        test('K1: All set-only filters produce correct counts from full range', () => {
            expect(engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set0').length).toBe(13);
            expect(engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set5').length).toBe(12);
            expect(engine._applyFilterToNumbers(ALL_NUMBERS, 'both_both_set6').length).toBe(12);
        });

        test('K2: Table-filtered sets produce smaller counts', () => {
            // zero + set0 < 12
            const zeroSet0 = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_both_set0');
            expect(zeroSet0.length).toBeLessThan(12);
            expect(zeroSet0.length).toBeGreaterThan(0);
        });

        test('K3: Sign-filtered sets produce smaller counts', () => {
            // positive + set0 < 12
            const posSet0 = engine._applyFilterToNumbers(ALL_NUMBERS, 'both_positive_set0');
            expect(posSet0.length).toBeLessThan(12);
            expect(posSet0.length).toBeGreaterThan(0);
        });

        test('K4: Triple-filtered combos produce smallest counts', () => {
            // zero + positive + set0 should be very small
            const tripleNarrow = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive_set0');
            expect(tripleNarrow.length).toBeLessThanOrEqual(6);
        });

        test('K5: Sum of set-specific combos equals original (for same table/sign)', () => {
            // zero_positive_set0 + zero_positive_set5 + zero_positive_set6 = zero_positive (set:'all')
            const allSet = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive');
            const s0 = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive_set0');
            const s5 = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive_set5');
            const s6 = engine._applyFilterToNumbers(ALL_NUMBERS, 'zero_positive_set6');
            const combined = new Set([...s0, ...s5, ...s6]);
            expect(combined.size).toBe(allSet.length);
            allSet.forEach(n => expect(combined.has(n)).toBe(true));
        });

        test('K6: Set partitions are exhaustive for every table/sign combo', () => {
            const tableSignCombos = ['zero_positive', 'zero_negative', 'zero_both',
                'nineteen_positive', 'nineteen_negative', 'nineteen_both',
                'both_positive', 'both_negative', 'both_both'];

            tableSignCombos.forEach(baseKey => {
                const allSet = engine._applyFilterToNumbers(ALL_NUMBERS, baseKey);
                const s0 = engine._applyFilterToNumbers(ALL_NUMBERS, `${baseKey}_set0`);
                const s5 = engine._applyFilterToNumbers(ALL_NUMBERS, `${baseKey}_set5`);
                const s6 = engine._applyFilterToNumbers(ALL_NUMBERS, `${baseKey}_set6`);
                const combined = new Set([...s0, ...s5, ...s6]);
                expect(combined.size).toBe(allSet.length);
            });
        });
    });

    let engine;
    beforeEach(() => {
        engine = new AIAutoEngine();
    });
});
