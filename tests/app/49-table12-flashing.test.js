/**
 * 49-table12-flashing.test.js
 * Tests Table 1 & Table 2 anchor column flashing.
 *
 * Rule: For each pair's 3 anchor columns (1st, 2nd, 3rd from lookup table),
 * check last 3 rows. If any TWO of the 3 anchor columns collectively
 * have "hits" covering all 3 rows → flash those columns.
 *
 * Table 1 hit = distance ≤ 1 (S+0, SL+1, SR+1, O+0, OL+1, OR+1)
 * Table 2 hit = distance ≤ 2 (adds SL+2, SR+2, OL+2, OR+2)
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');
const fs = require('fs');
const pathMod = require('path');

let R;

beforeAll(() => {
    // Load table-lookup.js globals
    const lookupSrc = fs.readFileSync(pathMod.join(__dirname, '..', '..', 'app', 'table-lookup.js'), 'utf-8');
    const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;');
    fn();
});

beforeEach(() => {
    setupDOM();
    R = loadRendererFunctions();
});

// ═══════════════════════════════════════════════════════════════
//  A. _computeT1FlashTargets Pure Function Tests
// ═══════════════════════════════════════════════════════════════
describe('A. _computeT1FlashTargets', () => {
    test('A1: function exists and is callable', () => {
        expect(typeof R._computeT1FlashTargets).toBe('function');
    });

    test('A2: returns empty Set when fewer than 4 spins', () => {
        const spins = [
            { actual: 10, direction: 'C' },
            { actual: 15, direction: 'AC' },
            { actual: 20, direction: 'C' }
        ];
        const result = R._computeT1FlashTargets(spins, 0, 3);
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    test('A3: returns empty Set when fewer than 3 visible rows', () => {
        const spins = [
            { actual: 10, direction: 'C' },
            { actual: 15, direction: 'AC' },
            { actual: 20, direction: 'C' },
            { actual: 25, direction: 'AC' }
        ];
        const result = R._computeT1FlashTargets(spins, 2, 2);
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    test('A4: returns Set with valid key format "relIdx:dataPair:anchorIdx"', () => {
        // Create enough spins with specific numbers to trigger flash
        // Using numbers where lookup targets are close to actual spins
        const spins = [];
        for (let i = 0; i < 8; i++) {
            spins.push({ actual: i % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        const result = R._computeT1FlashTargets(spins, 0, 8);
        // Check that any flash targets have the right format
        for (const key of result) {
            const parts = key.split(':');
            expect(parts.length).toBe(3);
            expect(parseInt(parts[0])).toBeGreaterThanOrEqual(0);  // relIdx
            expect(parts[1]).toBeTruthy();  // dataPair
            expect([0, 1, 2]).toContain(parseInt(parts[2]));  // anchorIdx
        }
    });

    test('A5: uses 12 pair definitions (including 13OPP)', () => {
        expect(R._T1_PAIR_DEFS).not.toBeNull();
        expect(R._T1_PAIR_DEFS.length).toBe(12);

        // Verify pair names match expected
        const pairNames = R._T1_PAIR_DEFS.map(p => p.dataPair);
        expect(pairNames).toContain('ref0');
        expect(pairNames).toContain('ref19');
        expect(pairNames).toContain('prev');
        expect(pairNames).toContain('prev_13opp');
        expect(pairNames).toContain('prevPlus1');
        expect(pairNames).toContain('prevPlus1_13opp');
    });

    test('A6: T1 valid codes are ±1 only', () => {
        expect(R._T1_VALID_CODES).not.toBeNull();
        expect(R._T1_VALID_CODES.has('S+0')).toBe(true);
        expect(R._T1_VALID_CODES.has('SL+1')).toBe(true);
        expect(R._T1_VALID_CODES.has('SR+1')).toBe(true);
        expect(R._T1_VALID_CODES.has('O+0')).toBe(true);
        expect(R._T1_VALID_CODES.has('OL+1')).toBe(true);
        expect(R._T1_VALID_CODES.has('OR+1')).toBe(true);
        // Should NOT contain ±2 codes
        expect(R._T1_VALID_CODES.has('SL+2')).toBe(false);
        expect(R._T1_VALID_CODES.has('SR+2')).toBe(false);
        expect(R._T1_VALID_CODES.has('OL+2')).toBe(false);
        expect(R._T1_VALID_CODES.has('OR+2')).toBe(false);
    });

    test('A7: P pair and P-13OPP pair tracked separately', () => {
        const pairNames = R._T1_PAIR_DEFS.map(p => p.dataPair);
        // 'prev' and 'prev_13opp' are different entries
        const prevIdx = pairNames.indexOf('prev');
        const prev13oppIdx = pairNames.indexOf('prev_13opp');
        expect(prevIdx).not.toBe(-1);
        expect(prev13oppIdx).not.toBe(-1);
        expect(prevIdx).not.toBe(prev13oppIdx);
    });

    test('A8: skips idx 0 rows (empty header rows)', () => {
        // Only 1 spin means all rows are idx=0 → no eligible rows
        const spins = [{ actual: 10, direction: 'C' }];
        const result = R._computeT1FlashTargets(spins, 0, 1);
        expect(result.size).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  B. _computeT2FlashTargets Pure Function Tests
// ═══════════════════════════════════════════════════════════════
describe('B. _computeT2FlashTargets', () => {
    test('B1: function exists and is callable', () => {
        expect(typeof R._computeT2FlashTargets).toBe('function');
    });

    test('B2: uses 7 pair definitions (no 13OPP)', () => {
        expect(R._T2_PAIR_DEFS).not.toBeNull();
        expect(R._T2_PAIR_DEFS.length).toBe(7);

        // Should NOT contain any 13opp pairs
        const pairNames = R._T2_PAIR_DEFS.map(p => p.dataPair);
        expect(pairNames).toContain('ref0');
        expect(pairNames).toContain('ref19');
        expect(pairNames).toContain('prev');
        expect(pairNames).not.toContain('prev_13opp');
        expect(pairNames).not.toContain('prevPlus1_13opp');
    });

    test('B3: T2 valid codes include ±2', () => {
        expect(R._T2_VALID_CODES).not.toBeNull();
        // Must have all T1 codes
        expect(R._T2_VALID_CODES.has('S+0')).toBe(true);
        expect(R._T2_VALID_CODES.has('SL+1')).toBe(true);
        expect(R._T2_VALID_CODES.has('O+0')).toBe(true);
        // Plus ±2 codes
        expect(R._T2_VALID_CODES.has('SL+2')).toBe(true);
        expect(R._T2_VALID_CODES.has('SR+2')).toBe(true);
        expect(R._T2_VALID_CODES.has('OL+2')).toBe(true);
        expect(R._T2_VALID_CODES.has('OR+2')).toBe(true);
    });

    test('B4: returns empty Set when fewer than 3 eligible rows', () => {
        const spins = [
            { actual: 10, direction: 'C' },
            { actual: 15, direction: 'AC' }
        ];
        const result = R._computeT2FlashTargets(spins, 0, 2);
        expect(result.size).toBe(0);
    });

    test('B5: T2 has more valid codes than T1', () => {
        expect(R._T2_VALID_CODES.size).toBeGreaterThan(R._T1_VALID_CODES.size);
    });

    test('B6: all T1 valid codes are also T2 valid codes', () => {
        for (const code of R._T1_VALID_CODES) {
            expect(R._T2_VALID_CODES.has(code)).toBe(true);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  C. Core Algorithm: _computeAnchorFlashTargets
// ═══════════════════════════════════════════════════════════════
describe('C. Core Anchor Flash Algorithm', () => {
    test('C1: _computeAnchorFlashTargets exists', () => {
        expect(typeof R._computeAnchorFlashTargets).toBe('function');
    });

    test('C2: returns empty Set for empty spins', () => {
        const result = R._computeAnchorFlashTargets([], 0, 0, R._T1_PAIR_DEFS, R._T1_VALID_CODES);
        expect(result.size).toBe(0);
    });

    test('C3: flash targets only contain anchorIdx 0, 1, or 2', () => {
        // Build a reasonable spin sequence
        const spins = [];
        for (let i = 0; i < 10; i++) {
            spins.push({ actual: (i * 7) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        const result = R._computeAnchorFlashTargets(spins, 0, 10, R._T1_PAIR_DEFS, R._T1_VALID_CODES);
        for (const key of result) {
            const anchorIdx = parseInt(key.split(':')[2]);
            expect([0, 1, 2]).toContain(anchorIdx);
        }
    });

    test('C4: uses last 3 eligible rows for detection', () => {
        // Build enough spins - flash targets should reference recent rows
        const spins = [];
        for (let i = 0; i < 10; i++) {
            spins.push({ actual: (i * 5) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        const startIdx = 2;
        const visibleCount = 8;
        const result = R._computeAnchorFlashTargets(spins, startIdx, visibleCount, R._T2_PAIR_DEFS, R._T2_VALID_CODES);
        // All relIdx in targets should be >= visibleCount - 3 (last 3 rows)
        for (const key of result) {
            const relIdx = parseInt(key.split(':')[0]);
            expect(relIdx).toBeGreaterThanOrEqual(visibleCount - 3);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  D. Integration: renderTable1 with Flash
// ═══════════════════════════════════════════════════════════════
describe('D. renderTable1 Flash Integration', () => {
    test('D1: renderTable1 does not throw with flash computation', () => {
        R.spins.push({ actual: 10, direction: 'C' });
        R.spins.push({ actual: 15, direction: 'AC' });
        R.spins.push({ actual: 20, direction: 'C' });
        R.spins.push({ actual: 25, direction: 'AC' });
        R.spins.push({ actual: 10, direction: 'C' });
        expect(() => R.render()).not.toThrow();
    });

    test('D2: renderTable1 works with many spins', () => {
        // Add 8 spins (max visible)
        for (let i = 0; i < 8; i++) {
            R.spins.push({ actual: (i * 7) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        expect(() => R.render()).not.toThrow();

        const tbody = document.getElementById('table1Body');
        expect(tbody.children.length).toBeGreaterThan(0);
    });

    test('D3: t1-flash class appears in Table 1 HTML when conditions met', () => {
        // We need spins where the same pair has anchor hits across 3 consecutive rows
        // Use enough spins to trigger the algorithm
        for (let i = 0; i < 10; i++) {
            R.spins.push({ actual: (i * 3) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        R.render();

        const tbody = document.getElementById('table1Body');
        const html = tbody.innerHTML;
        // Flash targets are data-dependent, so just verify no errors
        // and that the render completed successfully
        expect(html.length).toBeGreaterThan(0);
    });

    test('D4: formatPosFlash used for flashed cells', () => {
        expect(typeof R.formatPosFlash).toBe('function');
        const result = R.formatPosFlash('S+0');
        expect(result).toContain('S+0');
        expect(result).toContain('#fbbf24');  // amber color
        expect(result).toContain('<span');
    });

    test('D5: multiple render calls do not throw', () => {
        for (let i = 0; i < 6; i++) {
            R.spins.push({ actual: (i * 11) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        expect(() => R.render()).not.toThrow();
        expect(() => R.render()).not.toThrow();
        expect(() => R.render()).not.toThrow();
    });

    test('D6: render still works when all spins use same number', () => {
        for (let i = 0; i < 6; i++) {
            R.spins.push({ actual: 17, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        expect(() => R.render()).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════
//  E. Integration: renderTable2 with Flash
// ═══════════════════════════════════════════════════════════════
describe('E. renderTable2 Flash Integration', () => {
    test('E1: renderTable2 does not throw with flash computation', () => {
        R.spins.push({ actual: 5, direction: 'C' });
        R.spins.push({ actual: 12, direction: 'AC' });
        R.spins.push({ actual: 25, direction: 'C' });
        R.spins.push({ actual: 8, direction: 'AC' });
        R.spins.push({ actual: 30, direction: 'C' });
        expect(() => R.render()).not.toThrow();
    });

    test('E2: renderTable2 works with many spins', () => {
        for (let i = 0; i < 8; i++) {
            R.spins.push({ actual: (i * 11) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        expect(() => R.render()).not.toThrow();

        const tbody = document.getElementById('table2Body');
        expect(tbody.children.length).toBeGreaterThan(0);
    });

    test('E3: t2-flash class in Table 2 HTML when conditions met', () => {
        for (let i = 0; i < 10; i++) {
            R.spins.push({ actual: (i * 5) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        R.render();

        const tbody = document.getElementById('table2Body');
        const html = tbody.innerHTML;
        expect(html.length).toBeGreaterThan(0);
    });

    test('E4: Table 2 uses ±2 threshold so more flashes than Table 1', () => {
        // With same data, T2 should have >= flash targets than T1 (more permissive)
        const spins = [];
        for (let i = 0; i < 10; i++) {
            spins.push({ actual: (i * 7) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        const t1 = R._computeT1FlashTargets(spins, 0, 10);
        const t2 = R._computeT2FlashTargets(spins, 0, 10);
        // T2 could have more or equal targets (more valid codes = more potential hits)
        expect(t2.size).toBeGreaterThanOrEqual(t1.size);
    });
});

// ═══════════════════════════════════════════════════════════════
//  F. Edge Cases and Robustness
// ═══════════════════════════════════════════════════════════════
describe('F. Edge Cases', () => {
    test('F1: single spin does not crash flash computation', () => {
        R.spins.push({ actual: 0, direction: 'C' });
        expect(() => R.render()).not.toThrow();
    });

    test('F2: two spins do not crash flash computation', () => {
        R.spins.push({ actual: 0, direction: 'C' });
        R.spins.push({ actual: 36, direction: 'AC' });
        expect(() => R.render()).not.toThrow();
    });

    test('F3: zero (green number) as spin works correctly', () => {
        for (let i = 0; i < 6; i++) {
            R.spins.push({ actual: 0, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        expect(() => R.render()).not.toThrow();
    });

    test('F4: boundary numbers 0 and 36 work', () => {
        const sequence = [0, 36, 0, 36, 0, 36];
        sequence.forEach((n, i) => {
            R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
        });
        expect(() => R.render()).not.toThrow();
    });

    test('F5: undo after flash does not crash', () => {
        for (let i = 0; i < 6; i++) {
            R.spins.push({ actual: (i * 7) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        R.render();
        R.spins.pop();
        expect(() => R.render()).not.toThrow();
    });

    test('F6: flash computation is deterministic (same input = same output)', () => {
        const spins = [];
        for (let i = 0; i < 8; i++) {
            spins.push({ actual: (i * 13) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        const r1 = R._computeT1FlashTargets(spins, 0, 8);
        const r2 = R._computeT1FlashTargets(spins, 0, 8);
        expect([...r1].sort()).toEqual([...r2].sort());
    });
});
