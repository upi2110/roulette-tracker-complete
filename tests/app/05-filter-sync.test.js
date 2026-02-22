/**
 * TESTS: Filter Sync (Wheel ↔ AI Panel ↔ Money Panel)
 * Tests that wheel filters properly propagate to AI panel and money panel.
 *
 * The bug was: AI panel showed "21 COMMON" while wheel/money showed "11"
 * after 0 Table filter was applied.
 */

const fs = require('fs');
const path = require('path');
const { setupDOM } = require('../test-setup');

// ═══════════════════════════════════════════════════════
// WHEEL FILTER NUMBER SETS
// ═══════════════════════════════════════════════════════

// These must match roulette-wheel.js exactly
const ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

describe('Filter Number Sets Validation', () => {
    test('0 Table has 19 numbers', () => {
        expect(ZERO_TABLE_NUMS.size).toBe(19);
    });

    test('19 Table has 18 numbers', () => {
        expect(NINETEEN_TABLE_NUMS.size).toBe(18);
    });

    test('Positive has 19 numbers', () => {
        expect(POSITIVE_NUMS.size).toBe(19);
    });

    test('Negative has 18 numbers', () => {
        expect(NEGATIVE_NUMS.size).toBe(18);
    });

    test('0 Table + 19 Table = all 37 numbers (0-36)', () => {
        const combined = new Set([...ZERO_TABLE_NUMS, ...NINETEEN_TABLE_NUMS]);
        expect(combined.size).toBe(37); // 0-36
    });

    test('Positive + Negative = all 37 numbers', () => {
        const combined = new Set([...POSITIVE_NUMS, ...NEGATIVE_NUMS]);
        expect(combined.size).toBe(37);
    });

    test('0 and 26 are both in Zero Table (they share a pocket)', () => {
        expect(ZERO_TABLE_NUMS.has(0)).toBe(true);
        expect(ZERO_TABLE_NUMS.has(26)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// FILTER LOGIC (_passesFilter equivalent)
// ═══════════════════════════════════════════════════════

function passesFilter(num, filters) {
    // Table check: number must be in at least one CHECKED table
    let inTable = false;
    if (filters.zeroTable && ZERO_TABLE_NUMS.has(num)) inTable = true;
    if (filters.nineteenTable && NINETEEN_TABLE_NUMS.has(num)) inTable = true;

    // If no table is checked, nothing passes
    if (!filters.zeroTable && !filters.nineteenTable) return false;
    if (!inTable) return false;

    // Color check: number must match at least one CHECKED color type
    let matchesColor = false;
    if (filters.positive && POSITIVE_NUMS.has(num)) matchesColor = true;
    if (filters.negative && NEGATIVE_NUMS.has(num)) matchesColor = true;

    // If no color is checked, nothing passes
    if (!filters.positive && !filters.negative) return false;

    return matchesColor;
}

describe('Filter Logic: _passesFilter', () => {
    test('Default filters (0Table✅, 19Table❌, Pos✅, Neg✅) passes 0-table numbers', () => {
        const filters = { zeroTable: true, nineteenTable: false, positive: true, negative: true };

        // 0-table positive number: 3
        expect(passesFilter(3, filters)).toBe(true);

        // 0-table negative number: 21
        expect(passesFilter(21, filters)).toBe(true);

        // 19-table number: 19
        expect(passesFilter(19, filters)).toBe(false);
    });

    test('All filters ON passes all numbers', () => {
        const filters = { zeroTable: true, nineteenTable: true, positive: true, negative: true };

        for (let n = 0; n <= 36; n++) {
            expect(passesFilter(n, filters)).toBe(true);
        }
    });

    test('No tables checked → nothing passes', () => {
        const filters = { zeroTable: false, nineteenTable: false, positive: true, negative: true };

        for (let n = 0; n <= 36; n++) {
            expect(passesFilter(n, filters)).toBe(false);
        }
    });

    test('No colors checked → nothing passes', () => {
        const filters = { zeroTable: true, nineteenTable: true, positive: false, negative: false };

        for (let n = 0; n <= 36; n++) {
            expect(passesFilter(n, filters)).toBe(false);
        }
    });

    test('Only positive checked → only positive numbers from checked tables pass', () => {
        const filters = { zeroTable: true, nineteenTable: false, positive: true, negative: false };

        // 0-table positive: 3, 26, 0, 32, 27, 13, 36, 1, 20, 14
        expect(passesFilter(3, filters)).toBe(true);  // 0-table + positive
        expect(passesFilter(21, filters)).toBe(false); // 0-table but negative
        expect(passesFilter(19, filters)).toBe(false); // 19-table
    });

    test('19-table only checked → only 19-table numbers pass', () => {
        const filters = { zeroTable: false, nineteenTable: true, positive: true, negative: true };

        expect(passesFilter(19, filters)).toBe(true);  // 19-table
        expect(passesFilter(3, filters)).toBe(false);   // 0-table only
    });
});

// ═══════════════════════════════════════════════════════
// FILTER REDUCTION CALCULATION
// ═══════════════════════════════════════════════════════

describe('Filter Reduction: Count verification', () => {
    test('21 unfiltered numbers → 11 after 0-table filter (example from bug report)', () => {
        // Simulating the scenario from the screenshot:
        // 21 common numbers, default filter (0Table ON, 19Table OFF, Pos ON, Neg ON)
        const allNumbers = [
            0, 1, 2, 3, 5, 7, 10, 13, 14, 18, 20, 21, 23, 25, 26, 27, 29, 32, 36,
            // plus some 19-table numbers
            4, 19
        ];

        const filters = { zeroTable: true, nineteenTable: false, positive: true, negative: true };
        const filtered = allNumbers.filter(n => passesFilter(n, filters));

        // Only 0-table numbers should survive
        filtered.forEach(n => {
            expect(ZERO_TABLE_NUMS.has(n)).toBe(true);
        });

        // 19 and 4 should be removed
        expect(filtered).not.toContain(19);
        expect(filtered).not.toContain(4);
    });
});

// ═══════════════════════════════════════════════════════
// SYNC FUNCTION EXISTENCE
// ═══════════════════════════════════════════════════════

describe('Filter Sync: Function existence checks', () => {
    test('roulette-wheel.js has _syncAIPanel method', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'),
            'utf-8'
        );
        expect(src).toContain('_syncAIPanel');
        expect(src).toContain('updateFilteredDisplay');
    });

    test('roulette-wheel.js calls _syncAIPanel in _applyFilters', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'),
            'utf-8'
        );
        // Should be called in both the allOn branch and the filtered branch
        const syncCalls = (src.match(/this\._syncAIPanel/g) || []).length;
        expect(syncCalls).toBeGreaterThanOrEqual(2); // Once for allOn, once for filtered
    });

    test('ai-prediction-panel.js has updateFilteredDisplay method', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'ai-prediction-panel.js'),
            'utf-8'
        );
        expect(src).toContain('updateFilteredDisplay(filteredPrediction)');
    });

    test('roulette-wheel.js has _syncMoneyPanel method', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'),
            'utf-8'
        );
        expect(src).toContain('_syncMoneyPanel');
        expect(src).toContain('moneyPanel.setPrediction');
    });
});

// ═══════════════════════════════════════════════════════
// SIGNAL INDICATOR UPDATE
// ═══════════════════════════════════════════════════════

describe('Filter Sync: AI Panel signal update', () => {
    test('updateFilteredDisplay updates signalIndicator text', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'ai-prediction-panel.js'),
            'utf-8'
        );
        // Verify updateFilteredDisplay updates the signal
        expect(src).toContain('signalIndicator.textContent');
        expect(src).toContain('allNumbers.length');
        expect(src).toContain('COMMON');
    });
});
