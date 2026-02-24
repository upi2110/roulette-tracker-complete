/**
 * TESTS: Table Lookup — Regression & Full Coverage
 *
 * Tests for: getLookupRow, getColumnForPositionCode, getProjectionFromLookup
 * Also validates the LOOKUP_TABLE data integrity (37 rows, 0-36 coverage,
 * all values in valid range, no duplicates in first column).
 *
 * 70+ tests across sections A-L
 */

const path = require('path');
const fs = require('fs');

// Load table-lookup.js — it doesn't use module.exports, so we eval it
let getLookupRow, getColumnForPositionCode, getProjectionFromLookup, LOOKUP_TABLE;

function loadTableLookup() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'table-lookup.js'),
        'utf-8'
    );
    const wrappedCode = `
        (function() {
            ${src}
            return { getLookupRow, getColumnForPositionCode, getProjectionFromLookup, LOOKUP_TABLE };
        })()
    `;
    return eval(wrappedCode);
}

beforeEach(() => {
    const mod = loadTableLookup();
    getLookupRow = mod.getLookupRow;
    getColumnForPositionCode = mod.getColumnForPositionCode;
    getProjectionFromLookup = mod.getProjectionFromLookup;
    LOOKUP_TABLE = mod.LOOKUP_TABLE;
});

// ═══════════════════════════════════════════════════════
// A: LOOKUP_TABLE Data Integrity
// ═══════════════════════════════════════════════════════

describe('A: LOOKUP_TABLE data integrity', () => {
    test('A1: Table has exactly 37 rows (one per roulette number)', () => {
        expect(LOOKUP_TABLE.length).toBe(37);
    });

    test('A2: Each row has exactly 4 elements [number, 1st, 2nd, 3rd]', () => {
        for (const row of LOOKUP_TABLE) {
            expect(row.length).toBe(4);
        }
    });

    test('A3: First column covers all numbers 0-36', () => {
        const firstCol = LOOKUP_TABLE.map(r => r[0]).sort((a, b) => a - b);
        const expected = Array.from({ length: 37 }, (_, i) => i);
        expect(firstCol).toEqual(expected);
    });

    test('A4: No duplicate numbers in first column', () => {
        const firstCol = LOOKUP_TABLE.map(r => r[0]);
        const unique = new Set(firstCol);
        expect(unique.size).toBe(37);
    });

    test('A5: All projection values (1st, 2nd, 3rd) are in range 0-36', () => {
        for (const row of LOOKUP_TABLE) {
            for (let col = 1; col <= 3; col++) {
                expect(row[col]).toBeGreaterThanOrEqual(0);
                expect(row[col]).toBeLessThanOrEqual(36);
            }
        }
    });

    test('A6: All values in the table are integers', () => {
        for (const row of LOOKUP_TABLE) {
            for (const val of row) {
                expect(Number.isInteger(val)).toBe(true);
            }
        }
    });

    test('A7: First row starts with 0', () => {
        expect(LOOKUP_TABLE[0][0]).toBe(0);
    });

    test('A8: Table follows European wheel sequence in first column', () => {
        // The lookup table first column follows the European wheel order
        const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
        const firstCol = LOOKUP_TABLE.map(r => r[0]);
        expect(firstCol).toEqual(WHEEL);
    });
});

// ═══════════════════════════════════════════════════════
// B: getLookupRow — Basic functionality
// ═══════════════════════════════════════════════════════

describe('B: getLookupRow basic', () => {
    test('B1: Returns object with first, second, third for valid number', () => {
        const row = getLookupRow(0);
        expect(row).not.toBeNull();
        expect(row).toHaveProperty('first');
        expect(row).toHaveProperty('second');
        expect(row).toHaveProperty('third');
    });

    test('B2: Returns correct projections for 0', () => {
        const row = getLookupRow(0);
        expect(row.first).toBe(13);
        expect(row.second).toBe(20);
        expect(row.third).toBe(26);
    });

    test('B3: Returns correct projections for 32', () => {
        const row = getLookupRow(32);
        expect(row.first).toBe(36);
        expect(row.second).toBe(14);
        expect(row.third).toBe(0);
    });

    test('B4: Returns correct projections for 26 (last in wheel)', () => {
        const row = getLookupRow(26);
        expect(row.first).toBe(27);
        expect(row.second).toBe(1);
        expect(row.third).toBe(3);
    });

    test('B5: Returns null for number not in table (-1)', () => {
        expect(getLookupRow(-1)).toBeNull();
    });

    test('B6: Returns null for number not in table (37)', () => {
        expect(getLookupRow(37)).toBeNull();
    });

    test('B7: Returns null for undefined', () => {
        expect(getLookupRow(undefined)).toBeNull();
    });

    test('B8: Returns null for null', () => {
        expect(getLookupRow(null)).toBeNull();
    });

    test('B9: Returns null for string', () => {
        expect(getLookupRow('0')).toBeNull();
    });

    test('B10: Returns null for NaN', () => {
        expect(getLookupRow(NaN)).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// C: getLookupRow — All 37 numbers
// ═══════════════════════════════════════════════════════

describe('C: getLookupRow for all 37 numbers', () => {
    for (let num = 0; num <= 36; num++) {
        test(`C${num + 1}: getLookupRow(${num}) returns valid row`, () => {
            const row = getLookupRow(num);
            expect(row).not.toBeNull();
            expect(typeof row.first).toBe('number');
            expect(typeof row.second).toBe('number');
            expect(typeof row.third).toBe('number');
            expect(row.first).toBeGreaterThanOrEqual(0);
            expect(row.first).toBeLessThanOrEqual(36);
            expect(row.second).toBeGreaterThanOrEqual(0);
            expect(row.second).toBeLessThanOrEqual(36);
            expect(row.third).toBeGreaterThanOrEqual(0);
            expect(row.third).toBeLessThanOrEqual(36);
        });
    }
});

// ═══════════════════════════════════════════════════════
// D: getColumnForPositionCode — Same-side codes
// ═══════════════════════════════════════════════════════

describe('D: getColumnForPositionCode same-side codes', () => {
    test('D1: S+0 maps to first', () => {
        expect(getColumnForPositionCode('S+0')).toBe('first');
    });

    test('D2: SL+1 maps to first', () => {
        expect(getColumnForPositionCode('SL+1')).toBe('first');
    });

    test('D3: SL-1 maps to first', () => {
        expect(getColumnForPositionCode('SL-1')).toBe('first');
    });

    test('D4: SR+1 maps to first', () => {
        expect(getColumnForPositionCode('SR+1')).toBe('first');
    });

    test('D5: SR-1 maps to first', () => {
        expect(getColumnForPositionCode('SR-1')).toBe('first');
    });

    test('D6: SR+2 maps to first (extended)', () => {
        expect(getColumnForPositionCode('SR+2')).toBe('first');
    });

    test('D7: SR-2 maps to first (extended)', () => {
        expect(getColumnForPositionCode('SR-2')).toBe('first');
    });

    test('D8: SL+2 maps to first (extended)', () => {
        expect(getColumnForPositionCode('SL+2')).toBe('first');
    });

    test('D9: SL-2 maps to first (extended)', () => {
        expect(getColumnForPositionCode('SL-2')).toBe('first');
    });
});

// ═══════════════════════════════════════════════════════
// E: getColumnForPositionCode — Opposite-side codes
// ═══════════════════════════════════════════════════════

describe('E: getColumnForPositionCode opposite-side codes', () => {
    test('E1: OR+1 maps to second', () => {
        expect(getColumnForPositionCode('OR+1')).toBe('second');
    });

    test('E2: OR-1 maps to second', () => {
        expect(getColumnForPositionCode('OR-1')).toBe('second');
    });

    test('E3: OL+1 maps to second', () => {
        expect(getColumnForPositionCode('OL+1')).toBe('second');
    });

    test('E4: OL-1 maps to second', () => {
        expect(getColumnForPositionCode('OL-1')).toBe('second');
    });

    test('E5: OR+2 maps to second (extended)', () => {
        expect(getColumnForPositionCode('OR+2')).toBe('second');
    });

    test('E6: OR-2 maps to second (extended)', () => {
        expect(getColumnForPositionCode('OR-2')).toBe('second');
    });

    test('E7: OL+2 maps to second (extended)', () => {
        expect(getColumnForPositionCode('OL+2')).toBe('second');
    });

    test('E8: OL-2 maps to second (extended)', () => {
        expect(getColumnForPositionCode('OL-2')).toBe('second');
    });

    test('E9: O+0 maps to third', () => {
        expect(getColumnForPositionCode('O+0')).toBe('third');
    });
});

// ═══════════════════════════════════════════════════════
// F: getColumnForPositionCode — Invalid/edge cases
// ═══════════════════════════════════════════════════════

describe('F: getColumnForPositionCode invalid codes', () => {
    test('F1: XX returns null', () => {
        expect(getColumnForPositionCode('XX')).toBeNull();
    });

    test('F2: Empty string returns null', () => {
        expect(getColumnForPositionCode('')).toBeNull();
    });

    test('F3: null returns null', () => {
        expect(getColumnForPositionCode(null)).toBeNull();
    });

    test('F4: undefined returns null', () => {
        expect(getColumnForPositionCode(undefined)).toBeNull();
    });

    test('F5: Random string returns null', () => {
        expect(getColumnForPositionCode('HELLO')).toBeNull();
    });

    test('F6: SR+3 returns null (not in mapping)', () => {
        expect(getColumnForPositionCode('SR+3')).toBeNull();
    });

    test('F7: OR+3 returns null (not in mapping)', () => {
        expect(getColumnForPositionCode('OR+3')).toBeNull();
    });

    test('F8: Lowercase sr+1 returns null (case sensitive)', () => {
        expect(getColumnForPositionCode('sr+1')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// G: getProjectionFromLookup — Valid cases
// ═══════════════════════════════════════════════════════

describe('G: getProjectionFromLookup valid cases', () => {
    test('G1: refNum=0, posCode=S+0 returns first column (13)', () => {
        expect(getProjectionFromLookup(0, 'S+0')).toBe(13);
    });

    test('G2: refNum=0, posCode=OR+1 returns second column (20)', () => {
        expect(getProjectionFromLookup(0, 'OR+1')).toBe(20);
    });

    test('G3: refNum=0, posCode=O+0 returns third column (26)', () => {
        expect(getProjectionFromLookup(0, 'O+0')).toBe(26);
    });

    test('G4: refNum=32, posCode=SL+1 returns first (36)', () => {
        expect(getProjectionFromLookup(32, 'SL+1')).toBe(36);
    });

    test('G5: refNum=32, posCode=OL+1 returns second (14)', () => {
        expect(getProjectionFromLookup(32, 'OL+1')).toBe(14);
    });

    test('G6: refNum=32, posCode=O+0 returns third (0)', () => {
        expect(getProjectionFromLookup(32, 'O+0')).toBe(0);
    });

    test('G7: refNum=15, posCode=SR+2 returns first (11)', () => {
        expect(getProjectionFromLookup(15, 'SR+2')).toBe(11);
    });

    test('G8: refNum=26, posCode=S+0 returns first (27)', () => {
        expect(getProjectionFromLookup(26, 'S+0')).toBe(27);
    });

    test('G9: refNum=26, posCode=O+0 returns third (3)', () => {
        expect(getProjectionFromLookup(26, 'O+0')).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════
// H: getProjectionFromLookup — Invalid cases
// ═══════════════════════════════════════════════════════

describe('H: getProjectionFromLookup invalid cases', () => {
    test('H1: XX posCode returns null', () => {
        expect(getProjectionFromLookup(0, 'XX')).toBeNull();
    });

    test('H2: Invalid refNum returns null', () => {
        expect(getProjectionFromLookup(99, 'S+0')).toBeNull();
    });

    test('H3: Invalid posCode returns null', () => {
        expect(getProjectionFromLookup(0, 'INVALID')).toBeNull();
    });

    test('H4: Both invalid returns null', () => {
        expect(getProjectionFromLookup(99, 'INVALID')).toBeNull();
    });

    test('H5: null refNum returns null', () => {
        expect(getProjectionFromLookup(null, 'S+0')).toBeNull();
    });

    test('H6: null posCode returns null', () => {
        expect(getProjectionFromLookup(0, null)).toBeNull();
    });

    test('H7: undefined refNum returns null', () => {
        expect(getProjectionFromLookup(undefined, 'S+0')).toBeNull();
    });

    test('H8: Negative refNum returns null', () => {
        expect(getProjectionFromLookup(-1, 'S+0')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// I: Cross-validation — All columns reachable
// ═══════════════════════════════════════════════════════

describe('I: Cross-validation', () => {
    test('I1: Every same-side code produces first column', () => {
        const sameSideCodes = ['S+0', 'SL+1', 'SL-1', 'SR+1', 'SR-1', 'SR+2', 'SR-2', 'SL+2', 'SL-2'];
        for (const code of sameSideCodes) {
            const result = getProjectionFromLookup(0, code);
            expect(result).toBe(13); // first column for row 0
        }
    });

    test('I2: Every opposite-side ±1/±2 code produces second column', () => {
        const oppSideCodes = ['OR+1', 'OR-1', 'OL+1', 'OL-1', 'OR+2', 'OR-2', 'OL+2', 'OL-2'];
        for (const code of oppSideCodes) {
            const result = getProjectionFromLookup(0, code);
            expect(result).toBe(20); // second column for row 0
        }
    });

    test('I3: O+0 produces third column', () => {
        expect(getProjectionFromLookup(0, 'O+0')).toBe(26); // third column for row 0
    });

    test('I4: getLookupRow and getProjectionFromLookup agree', () => {
        for (let num = 0; num <= 36; num++) {
            const row = getLookupRow(num);
            if (row) {
                expect(getProjectionFromLookup(num, 'S+0')).toBe(row.first);
                expect(getProjectionFromLookup(num, 'OR+1')).toBe(row.second);
                expect(getProjectionFromLookup(num, 'O+0')).toBe(row.third);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// J: Lookup pattern validation — Cyclic shift property
// ═══════════════════════════════════════════════════════

describe('J: Lookup pattern validation', () => {
    test('J1: First column of row N matches number at N+12 position in wheel', () => {
        // The lookup table has a cyclic shift relationship
        // Row 0: [0, 13, 20, 26] — 13 is 12 positions ahead in wheel
        // Verify the pattern holds for at least the known first few rows
        const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

        // For each row, verify the first projection
        for (let i = 0; i < LOOKUP_TABLE.length; i++) {
            const rowNum = LOOKUP_TABLE[i][0];
            const firstProj = LOOKUP_TABLE[i][1];
            const wheelIdx = WHEEL.indexOf(rowNum);
            const expectedFirstIdx = (wheelIdx + 12) % 37;
            expect(firstProj).toBe(WHEEL[expectedFirstIdx]);
        }
    });

    test('J2: Second column follows 24-position shift in wheel', () => {
        const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

        for (let i = 0; i < LOOKUP_TABLE.length; i++) {
            const rowNum = LOOKUP_TABLE[i][0];
            const secondProj = LOOKUP_TABLE[i][2];
            const wheelIdx = WHEEL.indexOf(rowNum);
            const expectedSecondIdx = (wheelIdx + 24) % 37;
            expect(secondProj).toBe(WHEEL[expectedSecondIdx]);
        }
    });

    test('J3: Third column follows opposite (shift by 36 ≡ -1 mod 37) in wheel', () => {
        const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

        for (let i = 0; i < LOOKUP_TABLE.length; i++) {
            const rowNum = LOOKUP_TABLE[i][0];
            const thirdProj = LOOKUP_TABLE[i][3];
            const wheelIdx = WHEEL.indexOf(rowNum);
            // Third column: verify it's the correct shift
            const expectedThirdIdx = (wheelIdx + 36) % 37;
            expect(thirdProj).toBe(WHEEL[expectedThirdIdx]);
        }
    });
});

// ═══════════════════════════════════════════════════════
// K: Performance and boundary tests
// ═══════════════════════════════════════════════════════

describe('K: Performance and boundary tests', () => {
    test('K1: 10,000 lookups complete quickly', () => {
        const start = Date.now();
        for (let i = 0; i < 10000; i++) {
            getLookupRow(i % 37);
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(1000);
    });

    test('K2: 10,000 projection lookups complete quickly', () => {
        const codes = ['S+0', 'OR+1', 'O+0', 'SL+1', 'SR-2', 'OL+2'];
        const start = Date.now();
        for (let i = 0; i < 10000; i++) {
            getProjectionFromLookup(i % 37, codes[i % codes.length]);
        }
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(1000);
    });

    test('K3: Repeated calls return same result (deterministic)', () => {
        const r1 = getLookupRow(17);
        const r2 = getLookupRow(17);
        expect(r1).toEqual(r2);
    });

    test('K4: getProjectionFromLookup is deterministic', () => {
        const p1 = getProjectionFromLookup(19, 'SR+1');
        const p2 = getProjectionFromLookup(19, 'SR+1');
        expect(p1).toBe(p2);
    });
});

// ═══════════════════════════════════════════════════════
// L: Specific lookup verifications
// ═══════════════════════════════════════════════════════

describe('L: Specific lookup verifications', () => {
    test('L1: Number 15 row is [15, 11, 31, 32]', () => {
        const row = getLookupRow(15);
        expect(row.first).toBe(11);
        expect(row.second).toBe(31);
        expect(row.third).toBe(32);
    });

    test('L2: Number 19 row is [19, 30, 9, 15]', () => {
        const row = getLookupRow(19);
        expect(row.first).toBe(30);
        expect(row.second).toBe(9);
        expect(row.third).toBe(15);
    });

    test('L3: Number 4 row is [4, 8, 22, 19]', () => {
        const row = getLookupRow(4);
        expect(row.first).toBe(8);
        expect(row.second).toBe(22);
        expect(row.third).toBe(19);
    });

    test('L4: Number 36 row is [36, 14, 0, 13]', () => {
        const row = getLookupRow(36);
        expect(row.first).toBe(14);
        expect(row.second).toBe(0);
        expect(row.third).toBe(13);
    });

    test('L5: Number 13 row is [13, 20, 26, 27]', () => {
        const row = getLookupRow(13);
        expect(row.first).toBe(20);
        expect(row.second).toBe(26);
        expect(row.third).toBe(27);
    });

    test('L6: Number 3 row is [3, 6, 33, 35]', () => {
        const row = getLookupRow(3);
        expect(row.first).toBe(6);
        expect(row.second).toBe(33);
        expect(row.third).toBe(35);
    });

    test('L7: Number 35 row is [35, 34, 16, 12]', () => {
        const row = getLookupRow(35);
        expect(row.first).toBe(34);
        expect(row.second).toBe(16);
        expect(row.third).toBe(12);
    });

    test('L8: Number 1 row is [1, 3, 6, 33]', () => {
        const row = getLookupRow(1);
        expect(row.first).toBe(3);
        expect(row.second).toBe(6);
        expect(row.third).toBe(33);
    });
});
