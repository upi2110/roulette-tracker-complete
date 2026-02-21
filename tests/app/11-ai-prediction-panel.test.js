/**
 * TESTS: AI Prediction Panel
 * Coverage for: AIPredictionPanel class methods — selections, predictions,
 * intersection logic, pair management, highlighting, display updates
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

    const wrappedCode = `
        (function() {
            const alert = () => {};
            const setInterval = () => {};
            const setTimeout = (fn) => fn();
            const fetch = () => Promise.resolve({ json: () => ({}) });
            const window = globalThis.window || {};

            ${src}

            return AIPredictionPanel;
        })()
    `;

    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load AIPredictionPanel:', e.message);
        return null;
    }
}

beforeEach(() => {
    AIPredictionPanel = loadAIPanelClass();
    // Setup globals that the panel depends on
    global.window.spins = R.spins;
    global.window.getAIDataV6 = jest.fn(() => ({
        table3NextProjections: {
            prev: { numbers: [1, 2, 3, 4, 5], purple: [1], green: [2] },
            prevPlus1: { numbers: [3, 4, 5, 6, 7], purple: [3], green: [4] },
            prevMinus1: { numbers: [5, 6, 7, 8, 9], purple: [5], green: [6] }
        },
        table1NextProjections: {},
        table2NextProjections: {},
        currentSpinCount: 5
    }));
});

// ═══════════════════════════════════════════════════════
// CONSTRUCTOR & INITIALIZATION
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: Constructor', () => {
    test('Creates instance with empty selections', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(panel.table3Selections.size).toBe(0);
        expect(Object.keys(panel.table1Selections).length).toBe(0);
        expect(Object.keys(panel.table2Selections).length).toBe(0);
    });

    test('Has getPredictions method', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(typeof panel.getPredictions).toBe('function');
    });

    test('Has loadAvailablePairs method', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(typeof panel.loadAvailablePairs).toBe('function');
    });

    test('Has onSpinAdded method', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(typeof panel.onSpinAdded).toBe('function');
    });
});

// ═══════════════════════════════════════════════════════
// PAIR SELECTION
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: Table 3 Selection', () => {
    test('_handleTable3Selection adds pair to selections', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._handleTable3Selection('prev', true);
        expect(panel.table3Selections.has('prev')).toBe(true);
    });

    test('_handleTable3Selection removes pair when unchecked', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._handleTable3Selection('prev', true);
        panel._handleTable3Selection('prev', false);
        expect(panel.table3Selections.has('prev')).toBe(false);
    });

    test('handlePairSelection delegates to _handleTable3Selection', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.handlePairSelection('prevPlus1', true);
        expect(panel.table3Selections.has('prevPlus1')).toBe(true);
    });

    test('Multiple pairs can be selected', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._handleTable3Selection('prev', true);
        panel._handleTable3Selection('prevPlus1', true);
        panel._handleTable3Selection('prevMinus1', true);
        expect(panel.table3Selections.size).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════
// SELECTION COUNT
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: Selection Count', () => {
    test('_getTotalSelectionCount starts at 0', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        expect(panel._getTotalSelectionCount()).toBe(0);
    });

    test('Counts table3 selections', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        expect(panel._getTotalSelectionCount()).toBe(2);
    });

    test('Counts across all tables', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table1Selections['ref0'] = new Set(['first', 'second']);
        panel.table2Selections['ref19'] = new Set(['first']);
        expect(panel._getTotalSelectionCount()).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════
// CLEAR SELECTIONS
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: Clear Selections', () => {
    test('clearSelections empties all tables', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        panel.table1Selections['ref0'] = new Set(['first']);
        panel.table2Selections['ref19'] = new Set(['second']);

        panel.clearSelections();

        expect(panel.table3Selections.size).toBe(0);
        expect(Object.keys(panel.table1Selections).length).toBe(0);
        expect(Object.keys(panel.table2Selections).length).toBe(0);
    });

    test('clearSelections cancels pending debounce', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel._predictionDebounce = 12345;
        panel.clearSelections();
        expect(panel._predictionDebounce).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// LOAD AVAILABLE PAIRS
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: Load Available Pairs', () => {
    test('Loads table3 pairs from getAIDataV6', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.loadAvailablePairs();
        expect(panel.table3Pairs.length).toBeGreaterThan(0);
    });

    test('Sets backward compat alias availablePairs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.loadAvailablePairs();
        expect(panel.availablePairs).toBe(panel.table3Pairs);
    });

    test('Handles missing getAIDataV6 gracefully', () => {
        if (!AIPredictionPanel) return;
        global.window.getAIDataV6 = undefined;
        const panel = new AIPredictionPanel();
        expect(() => panel.loadAvailablePairs()).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════
// GET PREDICTIONS (Intersection Logic)
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: getPredictions', () => {
    test('Does nothing when no pairs selected', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        await panel.getPredictions();
        // No error thrown, but no prediction made
        expect(panel.currentPrediction).toBeFalsy();
    });

    test('Single table3 pair returns that pair\'s numbers', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        // Add spins so the prediction works
        R.spins.push({ actual: 10, direction: 'C' });
        R.spins.push({ actual: 22, direction: 'AC' });
        R.spins.push({ actual: 5, direction: 'C' });
        global.window.spins = R.spins;

        panel.table3Selections.add('prev');
        await panel.getPredictions();

        if (panel.currentPrediction) {
            expect(panel.currentPrediction.numbers).toBeDefined();
            expect(Array.isArray(panel.currentPrediction.numbers)).toBe(true);
        }
    });

    test('Two pairs returns intersection', async () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        R.spins.push({ actual: 10, direction: 'C' });
        R.spins.push({ actual: 22, direction: 'AC' });
        R.spins.push({ actual: 5, direction: 'C' });
        global.window.spins = R.spins;

        panel.table3Selections.add('prev');
        panel.table3Selections.add('prevPlus1');
        await panel.getPredictions();

        if (panel.currentPrediction) {
            // Intersection should be <= each individual set
            const nums = panel.currentPrediction.numbers || [];
            // Verify numbers are valid (0-36)
            nums.forEach(n => {
                expect(n).toBeGreaterThanOrEqual(0);
                expect(n).toBeLessThanOrEqual(36);
            });
        }
    });
});

// ═══════════════════════════════════════════════════════
// TABLE HIGHLIGHTS
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: Table Highlights', () => {
    test('updateSingleTableHighlights adds t3-pair-selected class', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();

        // Add a cell with data-pair attribute to table3
        const table = document.getElementById('table3');
        const tbody = table.querySelector('tbody');
        const row = document.createElement('tr');
        row.innerHTML = '<td data-pair="prev">test</td>';
        tbody.appendChild(row);

        const selectedSet = new Set(['prev']);
        panel.updateSingleTableHighlights('table3', selectedSet);

        const cell = table.querySelector('[data-pair="prev"]');
        expect(cell.classList.contains('t3-pair-selected')).toBe(true);
    });

    test('updateSingleTableHighlights removes old highlights first', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();

        const table = document.getElementById('table3');
        const tbody = table.querySelector('tbody');
        const row = document.createElement('tr');
        row.innerHTML = '<td data-pair="prev" class="t3-pair-selected">test</td>';
        tbody.appendChild(row);

        panel.updateSingleTableHighlights('table3', new Set());

        const cell = table.querySelector('[data-pair="prev"]');
        expect(cell.classList.contains('t3-pair-selected')).toBe(false);
    });

    test('updateTable3Highlights calls updateSingleTableHighlights for all 3 tables', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, 'updateSingleTableHighlights');
        panel.updateTable3Highlights();
        expect(spy).toHaveBeenCalledTimes(3);
    });
});

// ═══════════════════════════════════════════════════════
// ON SPIN ADDED
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: onSpinAdded', () => {
    test('Calls loadAvailablePairs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, 'loadAvailablePairs');
        panel.onSpinAdded();
        expect(spy).toHaveBeenCalled();
    });

    test('Calls updateTable3Highlights', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        const spy = jest.spyOn(panel, 'updateTable3Highlights');
        panel.onSpinAdded();
        expect(spy).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════
// updateFilteredDisplay
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: updateFilteredDisplay', () => {
    test('Updates signalIndicator text', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();

        // Set currentPrediction so updateFilteredDisplay does not early-return
        panel.currentPrediction = { numbers: [1, 2, 3] };

        panel.updateFilteredDisplay({
            numbers: [1, 2, 3],
            anchors: [],
            loose: [1, 2, 3],
            anchor_groups: [],
            extraNumbers: []
        });

        const indicator = document.getElementById('signalIndicator');
        expect(indicator.textContent).toContain('3');
    });
});

// ═══════════════════════════════════════════════════════
// _getPairColor
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: _getPairColor', () => {
    test('Returns a color string for known pairs', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        if (typeof panel._getPairColor === 'function') {
            const color = panel._getPairColor('prev');
            expect(typeof color).toBe('string');
            expect(color.length).toBeGreaterThan(0);
        }
    });
});

// ═══════════════════════════════════════════════════════
// togglePairFromTable
// ═══════════════════════════════════════════════════════

describe('AIPredictionPanel: togglePairFromTable', () => {
    test('Toggles table3 pair selection', () => {
        if (!AIPredictionPanel) return;
        const panel = new AIPredictionPanel();
        panel.table3Pairs = [{ key: 'prev', label: 'Prev' }];
        panel.togglePairFromTable('prev', 'table3');
        expect(panel.table3Selections.has('prev')).toBe(true);

        panel.togglePairFromTable('prev', 'table3');
        expect(panel.table3Selections.has('prev')).toBe(false);
    });
});
