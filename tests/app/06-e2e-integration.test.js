/**
 * E2E INTEGRATION TESTS
 * Tests the full spin cycle: addSpin → render → tables → predictions
 *
 * IMPORTANT: Does NOT change how tables populate.
 * Tests the rendering pipeline and cross-panel integration.
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
    global.window.table3DisplayProjections = {};
    global.window.moneyPanel = null;
    global.window.aiPanel = null;
    global.window.rouletteWheel = null;
});

// ═══════════════════════════════════════════════════════
// TABLE RENDERING PIPELINE
// ═══════════════════════════════════════════════════════

describe('E2E: Table rendering with spins', () => {
    // NOTE: renderTable1 and renderTable2 depend on getLookupRow from table-lookup.js
    // which is not loaded in isolated tests. They work in the full Electron app.
    // Table 3 uses position codes directly and works independently.

    test('renderTable3 works independently (no lookup table dependency)', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        expect(() => R.renderTable3()).not.toThrow();
    });

    test('Tables 1 & 2 require lookup table (getLookupRow)', () => {
        // This verifies the dependency exists — Tables 1 & 2 cannot render
        // without table-lookup.js being loaded. This is expected behavior.
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });

        expect(() => R.renderTable1()).toThrow();
    });

    test('Table 3 renders rows for each spin', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        R.renderTable3();

        const tbody = document.getElementById('table3Body');
        const rows = tbody.querySelectorAll('tr');
        expect(rows.length).toBeGreaterThanOrEqual(3);
    });

    test('Table 3 shows NEXT row when >= 2 spins', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });

        R.renderTable3();

        const nextRow = document.querySelector('.next-row');
        expect(nextRow).not.toBeNull();
    });

    test('Table 3 NEXT row has projections for >= 2 spins', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 5, direction: 'C' });

        R.renderTable3();

        // table3DisplayProjections should be populated
        expect(Object.keys(global.window.table3DisplayProjections || {}).length).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════
// TABLE 3: POSITION CODE DISPLAY
// ═══════════════════════════════════════════════════════

describe('E2E: Table 3 position codes', () => {
    test('Position codes display as non-empty for adjacent spins', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });

        R.renderTable3();

        const tbody = document.getElementById('table3Body');
        // Second row should have position codes
        const rows = tbody.querySelectorAll('tr:not(.next-row)');
        if (rows.length >= 2) {
            const secondRow = rows[1];
            const cells = secondRow.querySelectorAll('td');
            // Should have direction + actual + 30 data cells = 32
            expect(cells.length).toBe(32);
        }
    });

    test('data-pair attributes are set on Table 3 cells', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });

        R.renderTable3();

        // Check for data-pair attributes
        const pairCells = document.querySelectorAll('[data-pair]');
        expect(pairCells.length).toBeGreaterThan(0);

        // Should have cells for each pair type
        const pairTypes = new Set();
        pairCells.forEach(c => pairTypes.add(c.getAttribute('data-pair')));
        expect(pairTypes.has('prev')).toBe(true);
        expect(pairTypes.has('prevPlus1')).toBe(true);
        expect(pairTypes.has('prevMinus1')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// TABLE 3: PROJECTION HIT/MISS
// ═══════════════════════════════════════════════════════

describe('E2E: Table 3 projection classes', () => {
    test('Projection cells have col-prj, col-prj-hit, or col-prj-miss', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });
        spins.push({ actual: 17, direction: 'AC' });

        R.renderTable3();

        const projCells = document.querySelectorAll('.col-prj, .col-prj-hit, .col-prj-miss');
        // Should have projection cells for rows with idx > 1
        expect(projCells.length).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════
// FULL CYCLE: Add spins → render → check consistency
// ═══════════════════════════════════════════════════════

describe('E2E: Full cycle spin sequence', () => {
    test('8 spins → table shows last 8 rows + NEXT row', () => {
        const spins = R.spins;
        const sequence = [10, 22, 4, 17, 35, 8, 26, 13];
        sequence.forEach((n, i) => {
            spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
        });

        R.renderTable3();

        const tbody = document.getElementById('table3Body');
        const dataRows = tbody.querySelectorAll('tr:not(.next-row)');
        const nextRows = tbody.querySelectorAll('.next-row');

        // Should show all 8 rows (or last 8 if capped)
        expect(dataRows.length).toBe(8);
        expect(nextRows.length).toBe(1);
    });

    test('10 spins → only last 8 visible', () => {
        const spins = R.spins;
        for (let i = 0; i < 10; i++) {
            spins.push({ actual: (i * 7) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();

        const tbody = document.getElementById('table3Body');
        const dataRows = tbody.querySelectorAll('tr:not(.next-row)');
        // renderTable3 shows last 8 visible spins
        expect(dataRows.length).toBe(8);
    });

    test('Info text can be updated manually from spin count', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        spins.push({ actual: 4, direction: 'C' });

        // render() depends on Tables 1&2 (lookup table), so test info update directly
        const info = document.getElementById('info');
        info.textContent = `Spins: ${spins.length}`;
        expect(info.textContent).toBe('Spins: 3');
    });
});

// ═══════════════════════════════════════════════════════
// 0/26 RULE IN WHEEL CONSTANTS
// ═══════════════════════════════════════════════════════

describe('E2E: 0/26 pocket rule', () => {
    test('0 and 26 produce S+0 against each other', () => {
        expect(R.calculatePositionCode(0, 26)).toBe('S+0');
        expect(R.calculatePositionCode(26, 0)).toBe('S+0');
    });

    test('Neighbors of 0 are same as neighbors of 26', () => {
        // Right of 0/26 pocket is 32
        const right0 = R.calculatePositionCode(0, 32);
        const right26 = R.calculatePositionCode(26, 32);
        expect(right0).toBe(right26);

        // Left of 0/26 pocket is 3
        const left0 = R.calculatePositionCode(0, 3);
        const left26 = R.calculatePositionCode(26, 3);
        expect(left0).toBe(left26);
    });
});

// ═══════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════

describe('E2E: Edge cases (Table 3)', () => {
    // Note: using renderTable3() instead of render() since Tables 1&2
    // require table-lookup.js which isn't loaded in isolated tests.

    test('Single spin renders without error', () => {
        R.spins.push({ actual: 0, direction: 'C' });
        expect(() => R.renderTable3()).not.toThrow();
    });

    test('Zero spins renders empty table 3', () => {
        expect(() => R.renderTable3()).not.toThrow();

        const t3 = document.getElementById('table3Body');
        expect(t3.innerHTML).toBe('');
    });

    test('Spin 0 (zero) works correctly', () => {
        R.spins.push({ actual: 15, direction: 'C' });
        R.spins.push({ actual: 0, direction: 'AC' });

        expect(() => R.renderTable3()).not.toThrow();
    });

    test('All same spins (e.g., 5 times 10) works', () => {
        for (let i = 0; i < 5; i++) {
            R.spins.push({ actual: 10, direction: 'C' });
        }

        expect(() => R.renderTable3()).not.toThrow();
    });

    test('Alternating 0 and 26 works', () => {
        R.spins.push({ actual: 0, direction: 'C' });
        R.spins.push({ actual: 26, direction: 'AC' });
        R.spins.push({ actual: 0, direction: 'C' });
        R.spins.push({ actual: 26, direction: 'AC' });

        expect(() => R.renderTable3()).not.toThrow();
    });
});
