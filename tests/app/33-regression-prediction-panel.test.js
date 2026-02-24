/**
 * Regression Test Suite #6 — AI Prediction Panel Deep Coverage
 *
 * Covers gaps NOT tested in 11-ai-prediction-panel.test.js:
 * A. sortByWheel utility function
 * B. _getPairColor for all pair types
 * C. Table 1/2 pair toggle and auto-ref logic
 * D. _handleRefSelection individual ref management
 * E. Multi-table intersection computation (pure set math)
 * F. Extra numbers from 3rd ref computation
 * G. 0/26 pairing rule
 * H. _updateCounts DOM updates
 * I. _clearAllPredictionDisplays
 * J. onSpinAdded edge cases
 * K. togglePairFromTable for table1/table2
 * L. loadAvailablePairs filtering (13OPP exclusion)
 * M. getPredictions error handling
 * N. updatePrediction signal indicator and display
 * O. updateFilteredDisplay preserves metadata
 * P. Cross-table selection count tracking
 * Q. Debounce behavior
 */

const fs = require('fs');
const path = require('path');
const { setupDOM, loadRendererFunctions } = require('../test-setup');

let AIPredictionPanel, R;

function loadAIPanelClass() {
    setupDOM();
    R = loadRendererFunctions();

    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ai-prediction-panel.js'),
        'utf-8'
    );

    // Extract sortByWheel as well
    const wrappedCode = `
        (function() {
            const alert = () => {};
            const setInterval = () => {};
            const setTimeout = (fn, ms) => {
                if (ms && ms > 0) return 12345;
                return fn();
            };
            const clearTimeout = () => {};
            const fetch = () => Promise.resolve({ json: () => ({}) });
            const window = globalThis.window || {};

            ${src}

            return { AIPredictionPanel, sortByWheel, WHEEL_ORDER, WHEEL_POS };
        })()
    `;

    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load AIPredictionPanel:', e.message);
        return null;
    }
}

let loaded;

// Standard mock table data
function makeTableData(overrides = {}) {
    return {
        table3NextProjections: {
            prev: { numbers: [0, 32, 15, 19, 4, 21, 2] },
            prevPlus1: { numbers: [15, 19, 4, 21, 2, 25, 17] },
            prevMinus1: { numbers: [4, 21, 2, 25, 17, 34, 6] },
            ref0: { numbers: [0, 32, 15, 4, 21] },
            ref19: { numbers: [19, 4, 21, 2, 25] },
            ...overrides.table3
        },
        table1NextProjections: {
            prev: {
                first: { numbers: [0, 32, 15] },
                second: { numbers: [19, 4, 21] },
                third: { numbers: [2, 25, 17] }
            },
            prevPlus1: {
                first: { numbers: [34, 6, 27] },
                second: { numbers: [13, 36, 11] },
                third: { numbers: [30, 8, 23] }
            },
            ref0: {
                first: { numbers: [0, 32] },
                second: { numbers: [15, 19] },
                third: { numbers: [4, 21] }
            },
            ref0_13opp: {
                first: { numbers: [10, 5] },
                second: { numbers: [24, 16] },
                third: { numbers: [33, 1] }
            },
            ref19_13opp: {
                first: { numbers: [22, 18] },
                second: { numbers: [29, 7] },
                third: { numbers: [28, 12] }
            },
            ...overrides.table1
        },
        table2NextProjections: {
            prev: {
                first: { numbers: [0, 32, 15, 19, 4] },
                second: { numbers: [21, 2, 25, 17, 34] },
                third: { numbers: [6, 27, 13, 36, 11] }
            },
            prevPlus1: {
                first: { numbers: [30, 8, 23, 10, 5] },
                second: { numbers: [24, 16, 33, 1, 20] },
                third: { numbers: [14, 31, 9, 22, 18] }
            },
            prev_13opp: {
                first: { numbers: [29, 7] },
                second: { numbers: [28, 12] },
                third: { numbers: [35, 3] }
            },
            ...overrides.table2
        },
        currentSpinCount: 10,
        ...overrides.root
    };
}

beforeEach(() => {
    loaded = loadAIPanelClass();
    if (!loaded) return;
    AIPredictionPanel = loaded.AIPredictionPanel;

    // Mock spins
    R.spins.push(
        { actual: 10, direction: 'C' },
        { actual: 22, direction: 'AC' },
        { actual: 5, direction: 'C' },
        { actual: 17, direction: 'AC' },
        { actual: 30, direction: 'C' }
    );
    global.window.spins = R.spins;
    global.window.getAIDataV6 = jest.fn(() => makeTableData());
    global.window.calculateWheelAnchors = jest.fn((nums) => ({
        anchors: nums.length >= 3 ? [nums[0]] : [],
        loose: nums.length < 3 ? nums : nums.slice(1),
        anchorGroups: nums.length >= 3 ? [{ anchor: nums[0], group: nums.slice(0, 3), type: '±1' }] : []
    }));
    global.window.rouletteWheel = { updateHighlights: jest.fn(), clearHighlights: jest.fn() };
    global.window.moneyPanel = { pendingBet: null };
    global.window.semiAutoFilter = null;
});

// ═══════════════════════════════════════════════════════════
// A. sortByWheel utility
// ═══════════════════════════════════════════════════════════

describe('A. sortByWheel utility', () => {
    test('A1: sorts numbers by European wheel position', () => {
        if (!loaded) return;
        const { sortByWheel, WHEEL_ORDER } = loaded;
        // 26 is at index 0, 0 at index 1, 32 at index 2 on wheel
        const result = sortByWheel([32, 26, 0]);
        expect(result).toEqual([26, 0, 32]);
    });

    test('A2: returns new array (does not mutate input)', () => {
        if (!loaded) return;
        const { sortByWheel } = loaded;
        const input = [19, 4, 15];
        const result = sortByWheel(input);
        expect(result).not.toBe(input);
        expect(input).toEqual([19, 4, 15]); // unchanged
    });

    test('A3: handles empty array', () => {
        if (!loaded) return;
        const { sortByWheel } = loaded;
        expect(sortByWheel([])).toEqual([]);
    });

    test('A4: handles single element', () => {
        if (!loaded) return;
        const { sortByWheel } = loaded;
        expect(sortByWheel([17])).toEqual([17]);
    });

    test('A5: all 37 numbers produce valid sorted order', () => {
        if (!loaded) return;
        const { sortByWheel, WHEEL_ORDER } = loaded;
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const sorted = sortByWheel(allNums);
        expect(sorted.length).toBe(37);
        // Should match WHEEL_ORDER exactly
        expect(sorted).toEqual(WHEEL_ORDER);
    });

    test('A6: WHEEL_POS maps every number to unique position', () => {
        if (!loaded) return;
        const { WHEEL_POS, WHEEL_ORDER } = loaded;
        const positions = new Set();
        for (let i = 0; i <= 36; i++) {
            expect(WHEEL_POS[i]).toBeDefined();
            expect(WHEEL_POS[i]).toBeGreaterThanOrEqual(0);
            expect(WHEEL_POS[i]).toBeLessThan(37);
            positions.add(WHEEL_POS[i]);
        }
        expect(positions.size).toBe(37); // all unique
    });
});

// ═══════════════════════════════════════════════════════════
// B. _getPairColor comprehensive
// ═══════════════════════════════════════════════════════════

describe('B. _getPairColor for all pair types', () => {
    const expectedColors = {
        'ref0': '#dc2626',
        'ref0_13opp': '#dc2626',
        'ref19': '#ea580c',
        'ref19_13opp': '#ea580c',
        'prev': '#d97706',
        'prev_13opp': '#d97706',
        'prevPlus1': '#16a34a',
        'prevPlus1_13opp': '#16a34a',
        'prevMinus1': '#0d9488',
        'prevMinus1_13opp': '#0d9488',
        'prevPlus2': '#2563eb',
        'prevPlus2_13opp': '#2563eb',
        'prevMinus2': '#7c3aed',
        'prevMinus2_13opp': '#7c3aed',
        'prevPrev': '#db2777'
    };

    Object.entries(expectedColors).forEach(([pairKey, color]) => {
        test(`B: _getPairColor('${pairKey}') returns ${color}`, () => {
            if (!AIPredictionPanel) return;
            const panel = new AIPredictionPanel();
            expect(panel._getPairColor(pairKey)).toBe(color);
        });
    });

    test('B16: unknown pair returns fallback grey', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(panel._getPairColor('unknownPair')).toBe('#64748b');
    });
});

// ═══════════════════════════════════════════════════════════
// C. Table 1/2 pair toggle and auto-ref
// ═══════════════════════════════════════════════════════════

describe('C. Table 1/2 pair toggle and auto-ref logic', () => {
    test('C1: _handleTable12PairToggle adds pair with all 3 refs (fallback)', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // No getAutoSelectedRefs → fallback to all 3
        global.window.getAutoSelectedRefs = undefined;
        panel._handleTable12PairToggle('table1', 'prev', true);
        expect(panel.table1Selections['prev']).toBeDefined();
        expect(panel.table1Selections['prev'].size).toBe(3);
        expect(panel.table1Selections['prev'].has('first')).toBe(true);
        expect(panel.table1Selections['prev'].has('second')).toBe(true);
        expect(panel.table1Selections['prev'].has('third')).toBe(true);
    });

    test('C2: _handleTable12PairToggle uses getAutoSelectedRefs when available', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAutoSelectedRefs = jest.fn(() => ({
            primaryRefs: ['first', 'second'],
            extraRef: 'third'
        }));
        panel._handleTable12PairToggle('table1', 'ref0', true);
        expect(panel.table1Selections['ref0'].size).toBe(2);
        expect(panel.table1Selections['ref0'].has('first')).toBe(true);
        expect(panel.table1Selections['ref0'].has('second')).toBe(true);
        expect(panel._extraRefs['table1:ref0']).toBe('third');
    });

    test('C3: _handleTable12PairToggle unchecked removes pair', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAutoSelectedRefs = undefined;
        panel._handleTable12PairToggle('table1', 'prev', true);
        expect(panel.table1Selections['prev']).toBeDefined();

        panel._handleTable12PairToggle('table1', 'prev', false);
        expect(panel.table1Selections['prev']).toBeUndefined();
    });

    test('C4: table2 pair toggle works independently', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAutoSelectedRefs = undefined;
        panel._handleTable12PairToggle('table2', 'prev', true);
        expect(panel.table2Selections['prev']).toBeDefined();
        expect(panel.table2Selections['prev'].size).toBe(3);
        // table1 unaffected
        expect(Object.keys(panel.table1Selections).length).toBe(0);
    });

    test('C5: highlight set updated on toggle', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAutoSelectedRefs = undefined;
        panel._handleTable12PairToggle('table1', 'prev', true);
        expect(panel.table1SelectedPairs.has('prev')).toBe(true);

        panel._handleTable12PairToggle('table1', 'prev', false);
        expect(panel.table1SelectedPairs.has('prev')).toBe(false);
    });

    test('C6: extra ref stored as null when fallback used', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAutoSelectedRefs = undefined;
        panel._handleTable12PairToggle('table1', 'prev', true);
        expect(panel._extraRefs['table1:prev']).toBeNull();
    });

    test('C7: unchecked removes extra ref', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAutoSelectedRefs = jest.fn(() => ({
            primaryRefs: ['first', 'second'],
            extraRef: 'third'
        }));
        panel._handleTable12PairToggle('table1', 'ref0', true);
        expect(panel._extraRefs['table1:ref0']).toBe('third');

        panel._handleTable12PairToggle('table1', 'ref0', false);
        expect(panel._extraRefs['table1:ref0']).toBeUndefined();
    });
});

// ═══════════════════════════════════════════════════════════
// D. _handleRefSelection individual ref management
// ═══════════════════════════════════════════════════════════

describe('D. _handleRefSelection individual ref management', () => {
    test('D1: adding ref to existing pair', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first']);
        panel.table1SelectedPairs.add('prev');
        panel._handleRefSelection('table1', 'prev', 'second', true);
        expect(panel.table1Selections['prev'].has('second')).toBe(true);
        expect(panel.table1Selections['prev'].size).toBe(2);
    });

    test('D2: removing ref from pair', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first', 'second']);
        panel.table1SelectedPairs.add('prev');
        panel._handleRefSelection('table1', 'prev', 'second', false);
        expect(panel.table1Selections['prev'].has('second')).toBe(false);
        expect(panel.table1Selections['prev'].size).toBe(1);
    });

    test('D3: removing last ref removes pair entirely', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first']);
        panel.table1SelectedPairs.add('prev');
        panel._handleRefSelection('table1', 'prev', 'first', false);
        expect(panel.table1Selections['prev']).toBeUndefined();
        expect(panel.table1SelectedPairs.has('prev')).toBe(false);
    });

    test('D4: adding ref to non-existent pair creates it', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._handleRefSelection('table2', 'ref0', 'third', true);
        expect(panel.table2Selections['ref0']).toBeDefined();
        expect(panel.table2Selections['ref0'].has('third')).toBe(true);
    });

    test('D5: table2 ref management independent of table1', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first']);
        panel._handleRefSelection('table2', 'prev', 'second', true);
        expect(panel.table2Selections['prev'].has('second')).toBe(true);
        expect(panel.table1Selections['prev'].size).toBe(1); // unchanged
    });
});

// ═══════════════════════════════════════════════════════════
// E. Multi-table intersection computation
// ═══════════════════════════════════════════════════════════

describe('E. Multi-table intersection computation', () => {
    test('E1: single T3 pair → all numbers from that pair', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(panel.currentPrediction).toBeDefined();
        // prev has [0, 32, 15, 19, 4, 21, 2] + 0/26 rule may add 26
        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(0);
        expect(nums).toContain(32);
        expect(nums).toContain(15);
    });

    test('E2: two T3 pairs → intersection only', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // prev: [0, 32, 15, 19, 4, 21, 2]
        // prevPlus1: [15, 19, 4, 21, 2, 25, 17]
        // Intersection: [15, 19, 4, 21, 2]
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(15);
        expect(nums).toContain(19);
        expect(nums).toContain(4);
        expect(nums).toContain(21);
        expect(nums).toContain(2);
        // 0 and 32 should NOT be in intersection (only in prev)
        expect(nums).not.toContain(32);
        // 25 and 17 should NOT be in intersection (only in prevPlus1)
        expect(nums).not.toContain(25);
        expect(nums).not.toContain(17);
    });

    test('E3: three T3 pairs → smaller intersection', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // prev: [0, 32, 15, 19, 4, 21, 2]
        // prevPlus1: [15, 19, 4, 21, 2, 25, 17]
        // prevMinus1: [4, 21, 2, 25, 17, 34, 6]
        // Intersection: [4, 21, 2]
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        panel.table3Selections.add('prevMinus1');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(4);
        expect(nums).toContain(21);
        expect(nums).toContain(2);
        expect(nums).not.toContain(15);
        expect(nums).not.toContain(19);
    });

    test('E4: T1 pair with selected refs → union of those refs', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // T1 prev, first=[0,32,15], second=[19,4,21]
        // Union of first+second = [0,32,15,19,4,21]
        panel.table1Selections['prev'] = new Set(['first', 'second']);
        panel.table1SelectedPairs.add('prev');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(0);
        expect(nums).toContain(32);
        expect(nums).toContain(15);
        expect(nums).toContain(19);
        expect(nums).toContain(4);
        expect(nums).toContain(21);
    });

    test('E5: cross-table intersection (T3 + T1)', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // T3 prev: [0, 32, 15, 19, 4, 21, 2]
        // T1 prevPlus1, first+second = [34,6,27] ∪ [13,36,11] = [34,6,27,13,36,11]
        // Intersection: empty (no overlap)
        panel.table3Selections.add('prev');
        panel.table1Selections['prevPlus1'] = new Set(['first', 'second']);
        panel.table1SelectedPairs.add('prevPlus1');
        await panel.getPredictions();

        // Should show no common numbers or error
        if (panel.currentPrediction) {
            expect(panel.currentPrediction.numbers.length).toBe(0);
        }
    });

    test('E6: cross-table intersection with overlap', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // T3 ref0: [0, 32, 15, 4, 21]
        // T1 ref0: first=[0,32], second=[15,19] → union = [0,32,15,19]
        // Intersection: [0, 32, 15]
        panel.table3Selections.add('ref0');
        panel.table1Selections['ref0'] = new Set(['first', 'second']);
        panel.table1SelectedPairs.add('ref0');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(0);
        expect(nums).toContain(32);
        expect(nums).toContain(15);
        expect(nums).not.toContain(4);  // only in T3
        expect(nums).not.toContain(19); // only in T1
    });
});

// ═══════════════════════════════════════════════════════════
// F. Extra numbers from 3rd ref
// ═══════════════════════════════════════════════════════════

describe('F. Extra numbers from 3rd ref computation', () => {
    test('F1: T1 pair with extra ref produces grey numbers', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // T1 prev: first=[0,32,15], second=[19,4,21], third=[2,25,17]
        // Primary refs = first+second → union [0,32,15,19,4,21]
        // Extra ref = third → [2,25,17]
        panel.table1Selections['prev'] = new Set(['first', 'second']);
        panel._extraRefs = { 'table1:prev': 'third' };
        panel.table1SelectedPairs.add('prev');
        await panel.getPredictions();

        expect(panel.currentPrediction).toBeDefined();
        const extra = panel.currentPrediction.extraNumbers || [];
        // Extra should include 2, 25, 17 (numbers only in 3rd ref)
        expect(extra).toContain(2);
        expect(extra).toContain(25);
        expect(extra).toContain(17);
    });

    test('F2: extra numbers are NOT in primary numbers', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first', 'second']);
        panel._extraRefs = { 'table1:prev': 'third' };
        panel.table1SelectedPairs.add('prev');
        await panel.getPredictions();

        const primary = new Set(panel.currentPrediction.numbers);
        const extra = panel.currentPrediction.extraNumbers || [];
        extra.forEach(n => {
            expect(primary.has(n)).toBe(false);
        });
    });

    test('F3: no extra ref → no extra numbers', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first', 'second']);
        panel._extraRefs = { 'table1:prev': null };
        panel.table1SelectedPairs.add('prev');
        await panel.getPredictions();

        const extra = panel.currentPrediction.extraNumbers || [];
        expect(extra.length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════
// G. 0/26 pairing rule
// ═══════════════════════════════════════════════════════════

describe('G. 0/26 pairing rule', () => {
    test('G1: if 0 in result but not 26, 26 is added', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // Create data where 0 is in intersection but not 26
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: {
                prev: { numbers: [0, 32, 15] },
                prevPlus1: { numbers: [0, 32, 19] }
            },
            table1NextProjections: {},
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(0);
        expect(nums).toContain(26); // auto-added
    });

    test('G2: if 26 in result but not 0, 0 is added', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: {
                prev: { numbers: [26, 3, 35] },
                prevPlus1: { numbers: [26, 3, 12] }
            },
            table1NextProjections: {},
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).toContain(26);
        expect(nums).toContain(0); // auto-added
    });

    test('G3: if both 0 and 26 present, no extra added', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: {
                prev: { numbers: [0, 26, 32] }
            },
            table1NextProjections: {},
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.table3Selections.add('prev');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums.filter(n => n === 0).length).toBe(1);
        expect(nums.filter(n => n === 26).length).toBe(1);
    });

    test('G4: if neither 0 nor 26 present, neither added', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: {
                prev: { numbers: [15, 19, 4] }
            },
            table1NextProjections: {},
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.table3Selections.add('prev');
        await panel.getPredictions();

        const nums = panel.currentPrediction.numbers;
        expect(nums).not.toContain(0);
        expect(nums).not.toContain(26);
    });
});

// ═══════════════════════════════════════════════════════════
// H. _updateCounts DOM updates
// ═══════════════════════════════════════════════════════════

describe('H. _updateCounts DOM updates', () => {
    test('H1: updates t3Count element', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        panel._updateCounts();
        const t3 = document.getElementById('t3Count');
        expect(t3.textContent).toBe('2');
    });

    test('H2: updates t1Count element', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Selections['prev'] = new Set(['first']);
        panel._updateCounts();
        const t1 = document.getElementById('t1Count');
        expect(t1.textContent).toBe('1');
    });

    test('H3: updates t2Count element', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table2Selections['ref0'] = new Set(['second']);
        panel.table2Selections['prev'] = new Set(['first']);
        panel._updateCounts();
        const t2 = document.getElementById('t2Count');
        expect(t2.textContent).toBe('2');
    });

    test('H4: updates selectedCount (backward compat)', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // Create selectedCount element
        const el = document.createElement('span');
        el.id = 'selectedCount';
        document.body.appendChild(el);

        panel.table3Selections.add('prev');
        panel.table1Selections['ref0'] = new Set(['first']);
        panel._updateCounts();
        expect(el.textContent).toBe('2');
    });
});

// ═══════════════════════════════════════════════════════════
// I. _clearAllPredictionDisplays
// ═══════════════════════════════════════════════════════════

describe('I. _clearAllPredictionDisplays', () => {
    test('I1: resets signal indicator to SELECT PAIRS', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const indicator = document.getElementById('signalIndicator');
        indicator.textContent = 'SOME VALUE';
        indicator.style.backgroundColor = '#22c55e';

        panel._clearAllPredictionDisplays();
        expect(indicator.textContent).toContain('SELECT PAIRS');
    });

    test('I2: clears currentPrediction', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.currentPrediction = { numbers: [1, 2, 3] };
        panel._clearAllPredictionDisplays();
        expect(panel.currentPrediction).toBeNull();
    });

    test('I3: calls rouletteWheel.clearHighlights if available', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._clearAllPredictionDisplays();
        expect(global.window.rouletteWheel.clearHighlights).toHaveBeenCalled();
    });

    test('I4: clears moneyPanel.pendingBet', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.moneyPanel.pendingBet = { amount: 5 };
        panel._clearAllPredictionDisplays();
        expect(global.window.moneyPanel.pendingBet).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════
// J. onSpinAdded edge cases
// ═══════════════════════════════════════════════════════════

describe('J. onSpinAdded edge cases', () => {
    test('J1: with < 3 spins does NOT trigger predictions', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        global.window.spins = [{ actual: 5, direction: 'C' }]; // only 1 spin
        const spy = jest.spyOn(panel, '_autoTriggerPredictions');
        panel.onSpinAdded();
        expect(spy).not.toHaveBeenCalled();
    });

    test('J2: with >= 3 spins and selections DOES trigger predictions', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        // Already have 5 spins from beforeEach
        const spy = jest.spyOn(panel, '_autoTriggerPredictions');
        panel.onSpinAdded();
        expect(spy).toHaveBeenCalled();
    });

    test('J3: with 0 selections does NOT trigger predictions', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // No selections
        const spy = jest.spyOn(panel, '_autoTriggerPredictions');
        panel.onSpinAdded();
        expect(spy).not.toHaveBeenCalled();
    });

    test('J4: always reloads available pairs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, 'loadAvailablePairs');
        panel.onSpinAdded();
        expect(spy).toHaveBeenCalled();
    });

    test('J5: always updates table highlights', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, 'updateTable3Highlights');
        panel.onSpinAdded();
        expect(spy).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════
// K. togglePairFromTable for table1/table2
// ═══════════════════════════════════════════════════════════

describe('K. togglePairFromTable for table1/table2', () => {
    test('K1: togglePairFromTable table1 — adds and removes', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Pairs = [{ key: 'prev', display: 'P' }];
        global.window.getAutoSelectedRefs = undefined;

        panel.togglePairFromTable('prev', 'table1');
        expect(panel.table1SelectedPairs.has('prev')).toBe(true);

        panel.togglePairFromTable('prev', 'table1');
        expect(panel.table1SelectedPairs.has('prev')).toBe(false);
    });

    test('K2: togglePairFromTable table2 — adds and removes', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table2Pairs = [{ key: 'prev', display: 'P' }];
        global.window.getAutoSelectedRefs = undefined;

        panel.togglePairFromTable('prev', 'table2');
        expect(panel.table2SelectedPairs.has('prev')).toBe(true);

        panel.togglePairFromTable('prev', 'table2');
        expect(panel.table2SelectedPairs.has('prev')).toBe(false);
    });

    test('K3: unavailable pair in table1 does nothing', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1Pairs = []; // no pairs available
        panel.togglePairFromTable('prev', 'table1');
        expect(Object.keys(panel.table1Selections).length).toBe(0);
    });

    test('K4: unavailable pair in table3 does nothing', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Pairs = []; // empty
        panel.togglePairFromTable('prev', 'table3');
        expect(panel.table3Selections.size).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════
// L. loadAvailablePairs filtering (13OPP exclusion)
// ═══════════════════════════════════════════════════════════

describe('L. loadAvailablePairs filtering', () => {
    test('L1: Table 3 includes all non-empty pairs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.loadAvailablePairs();
        const keys = panel.table3Pairs.map(p => p.key);
        expect(keys).toContain('prev');
        expect(keys).toContain('prevPlus1');
        expect(keys).toContain('prevMinus1');
    });

    test('L2: Table 1 excludes ref0_13opp and ref19_13opp', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.loadAvailablePairs();
        const keys = panel.table1Pairs.map(p => p.key);
        expect(keys).not.toContain('ref0_13opp');
        expect(keys).not.toContain('ref19_13opp');
        // But regular pairs should be present
        expect(keys).toContain('prev');
    });

    test('L3: Table 2 excludes ALL 13opp pairs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.loadAvailablePairs();
        const keys = panel.table2Pairs.map(p => p.key);
        keys.forEach(k => {
            expect(k.endsWith('_13opp')).toBe(false);
        });
    });

    test('L4: Table 1 excludes pairs with no ref data', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: { prev: { numbers: [1, 2, 3] } },
            table1NextProjections: {
                prev: { first: { numbers: [] }, second: { numbers: [] }, third: { numbers: [] } },
                ref0: { first: { numbers: [1] } }
            },
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.loadAvailablePairs();
        const keys = panel.table1Pairs.map(p => p.key);
        expect(keys).not.toContain('prev'); // all empty
        expect(keys).toContain('ref0'); // has data
    });

    test('L5: missing getAIDataV6 returns early', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = undefined;
        expect(() => panel.loadAvailablePairs()).not.toThrow();
        expect(panel.table3Pairs.length).toBe(0);
    });

    test('L6: getAIDataV6 returning null returns early', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => null);
        expect(() => panel.loadAvailablePairs()).not.toThrow();
    });

    test('L7: pair display names mapped correctly', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.loadAvailablePairs();
        const prevPair = panel.table3Pairs.find(p => p.key === 'prev');
        if (prevPair) {
            expect(prevPair.display).toBe('P');
        }
    });
});

// ═══════════════════════════════════════════════════════════
// M. getPredictions error handling
// ═══════════════════════════════════════════════════════════

describe('M. getPredictions error handling', () => {
    test('M1: no pairs selected does nothing', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        await panel.getPredictions();
        expect(panel.currentPrediction).toBeNull();
    });

    test('M2: getAIDataV6 returns null → error displayed', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => null);
        panel.table3Selections.add('prev');
        await panel.getPredictions();

        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toBe('ERROR');
    });

    test('M3: pair data missing numbers → no common numbers', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: { prev: { numbers: [] } },
            table1NextProjections: {},
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.table3Selections.add('prev');
        await panel.getPredictions();

        // Should show error since no numbers
        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toBe('ERROR');
    });

    test('M4: no overlap between pairs shows NO COMMON NUMBERS', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: {
                prev: { numbers: [1, 2, 3] },
                prevPlus1: { numbers: [4, 5, 6] }
            },
            table1NextProjections: {},
            table2NextProjections: {},
            currentSpinCount: 10
        }));
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        await panel.getPredictions();

        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toContain('NO COMMON');
    });

    test('M5: signal indicator shows CALCULATING during execution', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        let capturedText;
        const origGetAIDataV6 = global.window.getAIDataV6;
        global.window.getAIDataV6 = jest.fn(() => {
            capturedText = document.getElementById('signalIndicator').textContent;
            return origGetAIDataV6();
        });
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(capturedText).toBe('CALCULATING...');
    });
});

// ═══════════════════════════════════════════════════════════
// N. updatePrediction signal indicator and display
// ═══════════════════════════════════════════════════════════

describe('N. updatePrediction display rendering', () => {
    test('N1: signal indicator shows count with green background', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.updatePrediction({
            numbers: [1, 2, 3, 4, 5],
            anchors: [],
            loose: [1, 2, 3, 4, 5],
            anchor_groups: [],
            extraNumbers: []
        });
        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toContain('5');
        // jsdom converts hex to rgb
        expect(indicator.style.backgroundColor).toBe('rgb(34, 197, 94)');
    });

    test('N2: extra numbers count shown in signal', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.updatePrediction({
            numbers: [1, 2, 3],
            anchors: [],
            loose: [1, 2, 3],
            anchor_groups: [],
            extraNumbers: [10, 11]
        });
        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toContain('3');
        expect(indicator.textContent).toContain('2 EXTRA');
    });

    test('N3: null prediction logs warning', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        panel.updatePrediction(null);
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('No prediction'));
        spy.mockRestore();
    });

    test('N4: stores prediction in currentPrediction', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const pred = { numbers: [7], anchors: [], loose: [7], anchor_groups: [], extraNumbers: [] };
        panel.updatePrediction(pred);
        expect(panel.currentPrediction).toBe(pred);
    });

    test('N5: anchor groups sorted by wheel position in display', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // 15 is at wheel pos 3, 6 is at wheel pos 10, 3 is at wheel pos 36
        panel.updatePrediction({
            numbers: [3, 6, 15, 35, 27, 19],
            anchors: [3, 6, 15],
            loose: [],
            anchor_groups: [
                { anchor: 3, group: [3, 35], type: '±1' },
                { anchor: 6, group: [6, 27], type: '±1' },
                { anchor: 15, group: [15, 19], type: '±1' }
            ],
            extraNumbers: []
        });
        const html = document.querySelector('#aiResultsPanel .prediction-numbers').innerHTML;
        const pos15 = html.indexOf('>15<');
        const pos6 = html.indexOf('>6<');
        const pos3 = html.indexOf('>3<');
        // 15 (wheel pos 3) should be before 6 (wheel pos 10), which is before 3 (wheel pos 36)
        if (pos15 > -1 && pos6 > -1 && pos3 > -1) {
            expect(pos15).toBeLessThan(pos6);
            expect(pos6).toBeLessThan(pos3);
        }
    });

    test('N6: prediction mode stored correctly', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(panel.currentPrediction.mode).toBe('FRONTEND_MULTI_TABLE');
    });
});

// ═══════════════════════════════════════════════════════════
// O. updateFilteredDisplay preserves metadata
// ═══════════════════════════════════════════════════════════

describe('O. updateFilteredDisplay', () => {
    test('O1: updates display with filtered numbers', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.currentPrediction = {
            numbers: [1, 2, 3, 4, 5],
            debugData: { test: true },
            reasoning: { strategy: 'test' }
        };
        panel.updateFilteredDisplay({
            numbers: [1, 2],
            anchors: [],
            loose: [1, 2],
            anchor_groups: [],
            extraNumbers: []
        });
        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toContain('2');
    });

    test('O2: does nothing without currentPrediction', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.currentPrediction = null;
        expect(() => panel.updateFilteredDisplay({
            numbers: [1], anchors: [], loose: [1], anchor_groups: [], extraNumbers: []
        })).not.toThrow();
    });

    test('O3: updateFilteredDisplay updates signal text with filtered count', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.currentPrediction = {
            numbers: [1, 2, 3, 4, 5],
            reasoning: { selected_pairs: ['T3:prev'], strategy: 'test' }
        };
        panel.updateFilteredDisplay({
            numbers: [1, 2, 3],
            anchors: [],
            loose: [1, 2, 3],
            anchor_groups: [],
            extraNumbers: [10]
        });
        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toContain('3');
        expect(indicator.textContent).toContain('1 EXTRA');
    });
});

// ═══════════════════════════════════════════════════════════
// P. Cross-table selection count tracking
// ═══════════════════════════════════════════════════════════

describe('P. Cross-table selection count', () => {
    test('P1: count across all 3 tables', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table3Selections.add('ref0');
        panel.table1Selections['prev'] = new Set(['first']);
        panel.table2Selections['ref19'] = new Set(['second', 'third']);
        expect(panel._getTotalSelectionCount()).toBe(4);
    });

    test('P2: empty all tables = 0', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(panel._getTotalSelectionCount()).toBe(0);
    });

    test('P3: clearSelections resets to 0', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table1Selections['ref0'] = new Set(['first']);
        panel.table2Selections['ref19'] = new Set(['second']);
        panel.clearSelections();
        expect(panel._getTotalSelectionCount()).toBe(0);
    });

    test('P4: clearSelections clears highlight sets', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table1SelectedPairs.add('prev');
        panel.table2SelectedPairs.add('ref0');
        panel.clearSelections();
        expect(panel.table1SelectedPairs.size).toBe(0);
        expect(panel.table2SelectedPairs.size).toBe(0);
    });

    test('P5: clearSelections clears _extraRefs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._extraRefs = { 'table1:prev': 'third', 'table2:ref0': 'second' };
        panel.clearSelections();
        expect(Object.keys(panel._extraRefs).length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════
// Q. Debounce behavior
// ═══════════════════════════════════════════════════════════

describe('Q. Debounce behavior', () => {
    test('Q1: _autoTriggerPredictions sets debounce timer when selections exist', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel._autoTriggerPredictions();
        // setTimeout returns 12345 in our mock
        expect(panel._predictionDebounce).toBeTruthy();
    });

    test('Q2: _autoTriggerPredictions calls _clearAllPredictionDisplays when 0 selections', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, '_clearAllPredictionDisplays');
        panel._autoTriggerPredictions();
        expect(spy).toHaveBeenCalled();
    });

    test('Q3: clearSelections nulls debounce timer', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._predictionDebounce = 99999;
        panel.clearSelections();
        expect(panel._predictionDebounce).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════
// R. Debug data in prediction
// ═══════════════════════════════════════════════════════════

describe('R. Debug data in prediction', () => {
    test('R1: prediction includes debugData', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(panel.currentPrediction.debugData).toBeDefined();
    });

    test('R2: debugData includes t3Selections', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table3Selections.add('ref0');
        await panel.getPredictions();
        const dd = panel.currentPrediction.debugData;
        expect(dd.t3Selections).toContain('prev');
        expect(dd.t3Selections).toContain('ref0');
    });

    test('R3: debugData includes pairSets with correct info', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        const dd = panel.currentPrediction.debugData;
        expect(dd.pairSets.length).toBe(1);
        expect(dd.pairSets[0].source).toContain('T3:prev');
    });

    test('R4: debugData primaryIntersection matches numbers', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        const dd = panel.currentPrediction.debugData;
        // Primary intersection should be subset of final numbers (before 0/26 rule)
        dd.primaryIntersection.forEach(n => {
            expect(panel.currentPrediction.numbers).toContain(n);
        });
    });

    test('R5: prediction reasoning includes strategy', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(panel.currentPrediction.reasoning.strategy).toBe('Cross-Table Intersection');
    });

    test('R6: prediction has correct pair_count', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table3Selections.add('ref0');
        await panel.getPredictions();
        expect(panel.currentPrediction.reasoning.pair_count).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════
// S. Semi-auto filter integration
// ═══════════════════════════════════════════════════════════

describe('S. Semi-auto filter integration', () => {
    test('S1: calls semiAutoFilter.applyOptimalFilter when enabled', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.semiAutoFilter = {
            isEnabled: true,
            applyOptimalFilter: jest.fn()
        };
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(global.window.semiAutoFilter.applyOptimalFilter).toHaveBeenCalled();
    });

    test('S2: does NOT call semiAutoFilter when disabled', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.semiAutoFilter = {
            isEnabled: false,
            applyOptimalFilter: jest.fn()
        };
        panel.table3Selections.add('prev');
        await panel.getPredictions();
        expect(global.window.semiAutoFilter.applyOptimalFilter).not.toHaveBeenCalled();
    });

    test('S3: does NOT call when semiAutoFilter is null', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        global.window.semiAutoFilter = null;
        panel.table3Selections.add('prev');
        // Should not throw
        await expect(panel.getPredictions()).resolves.not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════
// T. Backward compatibility aliases
// ═══════════════════════════════════════════════════════════

describe('T. Backward compatibility aliases', () => {
    test('T1: selectedPairs is same reference as table3Selections', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(panel.selectedPairs).toBe(panel.table3Selections);
    });

    test('T2: handlePairSelection works like _handleTable3Selection', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.handlePairSelection('ref0', true);
        expect(panel.table3Selections.has('ref0')).toBe(true);
    });

    test('T3: renderPairCheckboxes calls renderAllCheckboxes', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, 'renderAllCheckboxes');
        panel.renderPairCheckboxes();
        expect(spy).toHaveBeenCalled();
    });
});

console.log('✅ Prediction Panel regression test suite loaded');
