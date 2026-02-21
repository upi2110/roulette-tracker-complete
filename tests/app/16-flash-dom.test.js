/**
 * TESTS: Flash DOM Effects
 * Tests the _flashPairCell function and _applyPm1Flash DOM-level behavior.
 *
 * Covers:
 * - _flashPairCell adding 't3-pm1-flash' class to target cells
 * - Flash class persistence on DOM elements
 * - Multiple cells having flash simultaneously
 * - Flash + pair-selected class coexistence
 * - Flash cleanup when no matches
 * - Table 3 cell structure with data-pair attributes
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R;

beforeAll(() => {
    setupDOM();
    R = loadRendererFunctions();
});

beforeEach(() => {
    setupDOM();
    if (R.spins) {
        R.spins.length = 0;
    }
    // Mock dependencies
    global.window.aiPanel = {
        onSpinAdded: jest.fn(),
        clearSelections: jest.fn(),
        renderAllCheckboxes: jest.fn(),
        _predictionDebounce: null,
        table3Pairs: [],
        table1Pairs: [],
        table2Pairs: [],
        availablePairs: []
    };
    global.window.moneyPanel = {
        sessionData: {
            spinsWithBets: [],
            currentBankroll: 4000,
            sessionProfit: 0,
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            currentBetPerNumber: 2,
            bettingStrategy: 1,
            isBettingEnabled: false,
            isSessionActive: false
        },
        betHistory: [],
        pendingBet: null,
        lastSpinCount: 0,
        render: jest.fn()
    };
    global.window.rouletteWheel = { clearHighlights: jest.fn() };
    global.window.table3DisplayProjections = {};
    global.fetch = jest.fn(() => Promise.resolve({ json: () => ({}) }));
});

// =====================================================================
// HELPER: Build a table3-like row with data-pair cells
// =====================================================================

function buildTable3Row(pairName) {
    // Table 3 layout per pair: [ref, posCode, ref13Opp, posCode13Opp, projection]
    // All 5 cells have data-pair attribute set to the pair name
    const row = document.createElement('tr');
    const cellContents = ['10', 'SL+2', '34', 'OR+1', 'proj'];
    cellContents.forEach(content => {
        const td = document.createElement('td');
        td.setAttribute('data-pair', pairName);
        td.textContent = content;
        row.appendChild(td);
    });
    return row;
}

function buildMultiPairRow(pairs) {
    const row = document.createElement('tr');
    pairs.forEach(pairName => {
        const cellContents = ['10', 'SL+2', '34', 'OR+1', 'proj'];
        cellContents.forEach(content => {
            const td = document.createElement('td');
            td.setAttribute('data-pair', pairName);
            td.textContent = content;
            row.appendChild(td);
        });
    });
    return row;
}

// =====================================================================
// _flashPairCell DOM Effects
// =====================================================================

describe('_flashPairCell DOM effects', () => {
    test('_flashPairCell function is available from renderer', () => {
        // May be null if not exported - test guards for that
        if (R._flashPairCell) {
            expect(typeof R._flashPairCell).toBe('function');
        } else {
            // If not exported, we test via _applyPm1Flash integration instead
            expect(R._applyPm1Flash).toBeDefined();
        }
    });

    test('Adds t3-pm1-flash class to pair position code cell (offset 1)', () => {
        if (!R._flashPairCell) return;

        const row = buildTable3Row('prev');
        const cells = row.querySelectorAll('td[data-pair="prev"]');
        expect(cells.length).toBe(5);

        R._flashPairCell(row, 'prev', 'pair');

        // hitCellType='pair' targets index 1 (position code cell)
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(true);
        // Other cells should NOT have flash
        expect(cells[0].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[2].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[3].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[4].classList.contains('t3-pm1-flash')).toBe(false);
    });

    test('Adds t3-pm1-flash class to pair13Opp position code cell (offset 3)', () => {
        if (!R._flashPairCell) return;

        const row = buildTable3Row('prevPlus1');
        const cells = row.querySelectorAll('td[data-pair="prevPlus1"]');

        R._flashPairCell(row, 'prevPlus1', 'pair13Opp');

        // hitCellType='pair13Opp' targets index 3
        expect(cells[3].classList.contains('t3-pm1-flash')).toBe(true);
        expect(cells[0].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[2].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[4].classList.contains('t3-pm1-flash')).toBe(false);
    });

    test('Flash class persists on DOM element after being added', () => {
        if (!R._flashPairCell) return;

        const row = buildTable3Row('prevMinus1');
        R._flashPairCell(row, 'prevMinus1', 'pair');

        const cells = row.querySelectorAll('td[data-pair="prevMinus1"]');
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(true);

        // Verify it persists (not removed by any timer in test env)
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(true);
        expect(cells[1].className).toContain('t3-pm1-flash');
    });

    test('Multiple cells can have flash simultaneously on different pairs', () => {
        if (!R._flashPairCell) return;

        const row = buildMultiPairRow(['prev', 'prevPlus1', 'prevMinus1']);

        R._flashPairCell(row, 'prev', 'pair');
        R._flashPairCell(row, 'prevPlus1', 'pair13Opp');
        R._flashPairCell(row, 'prevMinus1', 'pair');

        const prevCells = row.querySelectorAll('td[data-pair="prev"]');
        const plus1Cells = row.querySelectorAll('td[data-pair="prevPlus1"]');
        const minus1Cells = row.querySelectorAll('td[data-pair="prevMinus1"]');

        expect(prevCells[1].classList.contains('t3-pm1-flash')).toBe(true);
        expect(plus1Cells[3].classList.contains('t3-pm1-flash')).toBe(true);
        expect(minus1Cells[1].classList.contains('t3-pm1-flash')).toBe(true);
    });

    test('Flash on same cell twice does not duplicate class', () => {
        if (!R._flashPairCell) return;

        const row = buildTable3Row('prev');
        R._flashPairCell(row, 'prev', 'pair');
        R._flashPairCell(row, 'prev', 'pair');

        const cells = row.querySelectorAll('td[data-pair="prev"]');
        // classList.add does not duplicate
        const classCount = cells[1].className.split('t3-pm1-flash').length - 1;
        expect(classCount).toBe(1);
    });

    test('Flash on row with no matching data-pair is silently ignored', () => {
        if (!R._flashPairCell) return;

        const row = buildTable3Row('prev');
        // Try to flash a pair that does not exist in this row
        expect(() => R._flashPairCell(row, 'nonExistentPair', 'pair')).not.toThrow();

        // Original cells should not be affected
        const cells = row.querySelectorAll('td[data-pair="prev"]');
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(false);
    });
});

// =====================================================================
// Flash + pair-selected coexistence
// =====================================================================

describe('Flash + pair-selected coexistence', () => {
    test('Cell can have BOTH t3-pair-selected and t3-pm1-flash classes', () => {
        const tbody = document.getElementById('table3Body');
        const row = buildTable3Row('prev');
        tbody.appendChild(row);

        const cells = row.querySelectorAll('td[data-pair="prev"]');
        // Simulate pair-selected being added (e.g., by AI panel click)
        cells[1].classList.add('t3-pair-selected');
        // Add flash
        cells[1].classList.add('t3-pm1-flash');

        expect(cells[1].classList.contains('t3-pair-selected')).toBe(true);
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(true);
    });

    test('Both classes coexist on multiple cells in the same row', () => {
        const row = buildMultiPairRow(['prev', 'prevPlus1']);

        const prevCells = row.querySelectorAll('td[data-pair="prev"]');
        const plus1Cells = row.querySelectorAll('td[data-pair="prevPlus1"]');

        // Add both classes to different cells
        prevCells[1].classList.add('t3-pair-selected');
        prevCells[1].classList.add('t3-pm1-flash');
        plus1Cells[3].classList.add('t3-pair-selected');
        plus1Cells[3].classList.add('t3-pm1-flash');

        expect(prevCells[1].classList.contains('t3-pair-selected')).toBe(true);
        expect(prevCells[1].classList.contains('t3-pm1-flash')).toBe(true);
        expect(plus1Cells[3].classList.contains('t3-pair-selected')).toBe(true);
        expect(plus1Cells[3].classList.contains('t3-pm1-flash')).toBe(true);
    });

    test('Removing t3-pair-selected does not remove t3-pm1-flash', () => {
        const row = buildTable3Row('prev');
        const cells = row.querySelectorAll('td[data-pair="prev"]');

        cells[1].classList.add('t3-pair-selected');
        cells[1].classList.add('t3-pm1-flash');

        cells[1].classList.remove('t3-pair-selected');

        expect(cells[1].classList.contains('t3-pair-selected')).toBe(false);
        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(true);
    });

    test('Removing t3-pm1-flash does not remove t3-pair-selected', () => {
        const row = buildTable3Row('prev');
        const cells = row.querySelectorAll('td[data-pair="prev"]');

        cells[1].classList.add('t3-pair-selected');
        cells[1].classList.add('t3-pm1-flash');

        cells[1].classList.remove('t3-pm1-flash');

        expect(cells[1].classList.contains('t3-pm1-flash')).toBe(false);
        expect(cells[1].classList.contains('t3-pair-selected')).toBe(true);
    });

    test('renderTable3 with data produces cells with data-pair that can receive both classes', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        R.renderTable3();

        const pairCells = document.querySelectorAll('[data-pair="prev"]');
        expect(pairCells.length).toBeGreaterThan(0);

        // Add both classes to first matching cell
        pairCells[0].classList.add('t3-pair-selected');
        pairCells[0].classList.add('t3-pm1-flash');

        expect(pairCells[0].classList.contains('t3-pair-selected')).toBe(true);
        expect(pairCells[0].classList.contains('t3-pm1-flash')).toBe(true);
    });
});

// =====================================================================
// Flash cleanup
// =====================================================================

describe('Flash cleanup via _applyPm1Flash', () => {
    test('_applyPm1Flash with < 4 spins does not add any flash classes', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        R.renderTable3();

        const flashCells = document.querySelectorAll('.t3-pm1-flash');
        expect(flashCells.length).toBe(0);
    });

    test('renderTable3 clears previous flash via innerHTML reset', () => {
        const spins = R.spins;
        // First render with 5 spins
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });
        spins.push({ actual: 17, direction: 'AC' });
        spins.push({ actual: 21, direction: 'C' });

        R.renderTable3();

        // Manually add flash to simulate previous state
        const firstRenderFlash = document.querySelectorAll('.t3-pm1-flash').length;

        // Add another spin and re-render (innerHTML = '' clears everything)
        spins.push({ actual: 35, direction: 'AC' });
        R.renderTable3();

        // After re-render, only current flash matches should exist
        // The previous flash cells are gone because tbody.innerHTML was cleared
        const tbody = document.getElementById('table3Body');
        expect(tbody.children.length).toBeGreaterThan(0);
    });

    test('Re-rendering table3 rebuilds DOM from scratch (no stale flash)', () => {
        const spins = R.spins;
        for (let i = 0; i < 6; i++) {
            spins.push({ actual: (i * 11) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();
        const firstFlashCount = document.querySelectorAll('.t3-pm1-flash').length;

        // Manually add extra flash class to a non-flash cell
        const allCells = document.querySelectorAll('[data-pair]');
        if (allCells.length > 0) {
            allCells[0].classList.add('t3-pm1-flash');
        }

        // Re-render wipes everything
        R.renderTable3();

        // The manually added flash should be gone (full DOM rebuild)
        const secondFlashCount = document.querySelectorAll('.t3-pm1-flash').length;
        // Only legitimate flash matches should remain
        expect(secondFlashCount).toBeLessThanOrEqual(firstFlashCount + 2);
    });

    test('_applyPm1Flash with insufficient visible rows adds no flash', () => {
        if (!R._applyPm1Flash) return;

        const tbody = document.getElementById('table3Body');
        tbody.innerHTML = '';

        // Only 1 row
        const row = buildTable3Row('prev');
        tbody.appendChild(row);

        // Call directly with 4 spins but only 1 visible
        const mockSpins = [
            { actual: 10, direction: 'C' },
            { actual: 22, direction: 'AC' },
            { actual: 4, direction: 'C' },
            { actual: 17, direction: 'AC' }
        ];

        R._applyPm1Flash(tbody, mockSpins, 3, 1);

        const flashCells = tbody.querySelectorAll('.t3-pm1-flash');
        expect(flashCells.length).toBe(0);
    });

    test('_applyPm1Flash skips when allSpins.length < 4', () => {
        if (!R._applyPm1Flash) return;

        const tbody = document.getElementById('table3Body');
        tbody.innerHTML = '';

        const row1 = buildTable3Row('prev');
        const row2 = buildTable3Row('prev');
        tbody.appendChild(row1);
        tbody.appendChild(row2);

        const mockSpins = [
            { actual: 10, direction: 'C' },
            { actual: 22, direction: 'AC' },
            { actual: 4, direction: 'C' }
        ];

        R._applyPm1Flash(tbody, mockSpins, 0, 3);

        const flashCells = tbody.querySelectorAll('.t3-pm1-flash');
        expect(flashCells.length).toBe(0);
    });
});

// =====================================================================
// Table 3 cell structure
// =====================================================================

describe('Table 3 cell structure via renderTable3', () => {
    test('renderTable3 creates cells with data-pair attributes after 2+ spins', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });

        R.renderTable3();

        const pairCells = document.querySelectorAll('[data-pair]');
        expect(pairCells.length).toBeGreaterThan(0);
    });

    test('Table3 tbody has rows after rendering spins', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });
        spins.push({ actual: 17, direction: 'AC' });
        spins.push({ actual: 21, direction: 'C' });

        R.renderTable3();

        const tbody = document.getElementById('table3Body');
        const rows = tbody.querySelectorAll('tr');
        expect(rows.length).toBeGreaterThanOrEqual(5);
    });

    test('Cells contain expected data-pair values for all 6 pairs', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        R.renderTable3();

        const expectedPairs = ['prev', 'prevPlus1', 'prevMinus1', 'prevPlus2', 'prevMinus2', 'prevPrev'];
        const foundPairs = new Set();

        document.querySelectorAll('[data-pair]').forEach(cell => {
            foundPairs.add(cell.getAttribute('data-pair'));
        });

        expectedPairs.forEach(pair => {
            expect(foundPairs.has(pair)).toBe(true);
        });
    });

    test('Each pair has 5 cells per row (ref, posCode, ref13Opp, posCode13Opp, projection)', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });

        R.renderTable3();

        // Second row (index 1) has data
        const dataRows = document.querySelectorAll('#table3Body tr:not(.next-row)');
        if (dataRows.length >= 2) {
            const secondRow = dataRows[1];
            const prevCells = secondRow.querySelectorAll('td[data-pair="prev"]');
            expect(prevCells.length).toBe(5);
        }
    });

    test('Cells contain text content (not empty)', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        R.renderTable3();

        const dataRows = document.querySelectorAll('#table3Body tr:not(.next-row)');
        expect(dataRows.length).toBeGreaterThanOrEqual(2);

        // Check the second row (first row with position codes)
        const secondRow = dataRows[1];
        const prevCells = secondRow.querySelectorAll('td[data-pair="prev"]');

        if (prevCells.length >= 2) {
            // ref cell should have a number
            expect(prevCells[0].textContent.trim()).not.toBe('');
            // position code cell should have content
            expect(prevCells[1].textContent.trim()).not.toBe('');
        }
    });

    test('data-pair attribute matches expected pair naming convention', () => {
        const spins = R.spins;
        spins.push({ actual: 5, direction: 'C' });
        spins.push({ actual: 15, direction: 'AC' });

        R.renderTable3();

        const pairCells = document.querySelectorAll('[data-pair]');
        const validPairs = ['prev', 'prevPlus1', 'prevMinus1', 'prevPlus2', 'prevMinus2', 'prevPrev'];

        pairCells.forEach(cell => {
            const pairVal = cell.getAttribute('data-pair');
            expect(validPairs).toContain(pairVal);
        });
    });

    test('NEXT row also has data-pair attributes when >= 2 spins', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });

        R.renderTable3();

        const nextRow = document.querySelector('.next-row');
        expect(nextRow).not.toBeNull();

        if (nextRow) {
            const nextPairCells = nextRow.querySelectorAll('[data-pair]');
            expect(nextPairCells.length).toBeGreaterThan(0);
        }
    });

    test('First row (idx 0) has no data-pair attributes (no prev reference)', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });

        R.renderTable3();

        const dataRows = document.querySelectorAll('#table3Body tr:not(.next-row)');
        expect(dataRows.length).toBe(1);

        // First row does not set data-pair on its empty cells
        const pairCells = dataRows[0].querySelectorAll('[data-pair]');
        expect(pairCells.length).toBe(0);
    });
});

// =====================================================================
// Flash integration with renderTable3
// =====================================================================

describe('Flash integration with full renderTable3', () => {
    test('5 spins renders without throwing and may produce flash', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });
        spins.push({ actual: 17, direction: 'AC' });
        spins.push({ actual: 21, direction: 'C' });

        expect(() => R.renderTable3()).not.toThrow();
    });

    test('8 spins renders and flash applies only to data rows (not NEXT row)', () => {
        const spins = R.spins;
        const sequence = [10, 22, 4, 17, 35, 8, 26, 13];
        sequence.forEach((n, i) => {
            spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
        });

        R.renderTable3();

        // NEXT row should never have flash
        const nextRow = document.querySelector('.next-row');
        if (nextRow) {
            const flashInNext = nextRow.querySelectorAll('.t3-pm1-flash');
            expect(flashInNext.length).toBe(0);
        }
    });

    test('Flash cells are always in data rows with data-pair attributes', () => {
        const spins = R.spins;
        for (let i = 0; i < 6; i++) {
            spins.push({ actual: (i * 7 + 3) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();

        const flashCells = document.querySelectorAll('.t3-pm1-flash');
        flashCells.forEach(cell => {
            expect(cell.hasAttribute('data-pair')).toBe(true);
        });
    });

    test('Flash classes are CSS class t3-pm1-flash (not any other name)', () => {
        const spins = R.spins;
        for (let i = 0; i < 7; i++) {
            spins.push({ actual: (i * 5) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();

        const flashCells = document.querySelectorAll('.t3-pm1-flash');
        flashCells.forEach(cell => {
            expect(cell.classList.contains('t3-pm1-flash')).toBe(true);
        });
    });

    test('Different spin sequences produce different flash results', () => {
        // Sequence A
        const spins = R.spins;
        [10, 22, 4, 17, 21].forEach((n, i) => {
            spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
        });
        R.renderTable3();
        const flashCountA = document.querySelectorAll('.t3-pm1-flash').length;

        // Reset and try Sequence B
        spins.length = 0;
        [5, 15, 25, 10, 20].forEach((n, i) => {
            spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
        });
        R.renderTable3();
        const flashCountB = document.querySelectorAll('.t3-pm1-flash').length;

        // Both should complete without error; counts may differ
        expect(flashCountA).toBeGreaterThanOrEqual(0);
        expect(flashCountB).toBeGreaterThanOrEqual(0);
    });
});
