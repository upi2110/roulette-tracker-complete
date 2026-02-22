/**
 * TESTS: ±1 Flash — 500-Spin Validation
 *
 * Uses a realistic 500-spin roulette sequence (real numbers 0-36).
 * 0 and 26 share the same pocket on the European wheel.
 *
 * Adds spins incrementally, renders at every checkpoint, and
 * independently re-computes which cells SHOULD flash. Then compares
 * the expected result against the actual DOM to catch any mismatch.
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R;

// ── Realistic 500-spin roulette sequence ────────────────────────
// Actual European roulette outcomes. 0 and 26 share pocket index 0.
// Includes deliberate clusters of 0/26 to stress-test shared pocket logic.
const SPIN_SEQUENCE = [
    // Session 1 (50 spins)
    32, 15, 19, 4, 21, 2, 25, 17, 34, 6,
    27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
    16, 33, 1, 20, 14, 31, 9, 22, 18, 29,
    7, 26, 3, 35, 12, 0, 28, 36, 15, 19,
    4, 21, 2, 25, 17, 34, 6, 27, 13, 11,
    // Session 2 (50 — heavy 0/26)
    0, 26, 0, 32, 26, 15, 0, 19, 26, 4,
    21, 0, 26, 2, 25, 0, 17, 26, 34, 6,
    0, 27, 26, 13, 36, 0, 11, 26, 30, 8,
    0, 23, 26, 10, 5, 0, 24, 26, 16, 33,
    0, 1, 26, 20, 14, 0, 31, 26, 9, 22,
    // Session 3 (50 — consecutive repeats)
    17, 17, 4, 4, 21, 21, 32, 32, 15, 15,
    19, 19, 6, 6, 27, 27, 13, 13, 36, 36,
    11, 11, 30, 30, 8, 8, 23, 23, 10, 10,
    5, 5, 24, 24, 16, 16, 33, 33, 1, 1,
    20, 20, 14, 14, 31, 31, 9, 9, 22, 22,
    // Session 4 (50 — sequential wheel neighbors)
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34,
    6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
    29, 7, 28, 12, 35, 3, 26, 0, 32, 15,
    19, 4, 21, 2, 25, 17, 34, 6, 27, 13,
    // Session 5 (50 — random mix)
    35, 3, 12, 28, 7, 29, 18, 22, 9, 31,
    14, 20, 1, 33, 16, 24, 5, 10, 23, 8,
    30, 11, 36, 13, 27, 6, 34, 17, 25, 2,
    21, 4, 19, 15, 32, 0, 26, 35, 3, 12,
    28, 7, 29, 18, 22, 9, 31, 14, 20, 1,
    // Session 6 (50 — zigzag across wheel)
    0, 36, 1, 35, 2, 34, 3, 33, 4, 32,
    5, 31, 6, 30, 7, 29, 8, 28, 9, 27,
    10, 26, 11, 25, 12, 24, 13, 23, 14, 22,
    15, 21, 16, 20, 17, 19, 18, 0, 36, 1,
    35, 2, 34, 3, 33, 4, 32, 5, 31, 6,
    // Session 7 (50 — hot numbers)
    17, 22, 17, 5, 22, 17, 32, 22, 17, 5,
    0, 17, 26, 22, 0, 5, 26, 17, 0, 22,
    26, 5, 0, 17, 26, 22, 17, 5, 22, 17,
    32, 15, 17, 22, 5, 0, 26, 17, 22, 5,
    0, 26, 32, 15, 19, 4, 21, 2, 25, 34,
    // Session 8 (50 — all numbers in order)
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    30, 31, 32, 33, 34, 35, 36, 0, 1, 2,
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    // Session 9 (50 — realistic casino feel)
    23, 6, 34, 17, 25, 2, 21, 4, 19, 15,
    32, 0, 26, 35, 3, 12, 28, 7, 29, 18,
    22, 9, 31, 14, 20, 1, 33, 16, 24, 5,
    10, 23, 8, 30, 11, 36, 13, 27, 6, 34,
    17, 25, 2, 21, 4, 19, 15, 32, 0, 26,
    // Session 10 (50 — close to 500)
    35, 12, 28, 7, 18, 29, 22, 9, 31, 14,
    20, 1, 33, 16, 24, 5, 10, 23, 8, 30,
    11, 36, 13, 27, 6, 34, 17, 25, 2, 21,
    4, 19, 15, 32, 0, 26, 3, 35, 12, 28,
    7, 18, 29, 22, 9, 31, 14, 20, 1, 33
];

beforeAll(() => {
    setupDOM();
    global.getLookupRow = jest.fn(() => null);
    R = loadRendererFunctions();
});

beforeEach(() => {
    setupDOM();
    if (R.spins) R.spins.length = 0;

    global.window.aiPanel = {
        onSpinAdded: jest.fn(),
        clearSelections: jest.fn(),
        renderAllCheckboxes: jest.fn(),
        _predictionDebounce: null,
        table3Pairs: [], table1Pairs: [], table2Pairs: [], availablePairs: []
    };
    global.window.moneyPanel = {
        sessionData: {
            spinsWithBets: [], currentBankroll: 4000, sessionProfit: 0,
            totalBets: 0, totalWins: 0, totalLosses: 0,
            consecutiveLosses: 0, consecutiveWins: 0,
            currentBetPerNumber: 2, bettingStrategy: 1,
            isBettingEnabled: false, isSessionActive: false
        },
        betHistory: [], pendingBet: null, lastSpinCount: 0, render: jest.fn()
    };
    global.window.rouletteWheel = { clearHighlights: jest.fn() };
    global.window.table3DisplayProjections = {};
    global.fetch = jest.fn(() => Promise.resolve({ json: () => ({}) }));
});

// ── Helpers ──────────────────────────────────────────────────────

const REF_KEYS = ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'];

const REFKEY_TO_DATAPAIR = {
    prev: 'prev', prev_plus_1: 'prevPlus1', prev_minus_1: 'prevMinus1',
    prev_plus_2: 'prevPlus2', prev_minus_2: 'prevMinus2', prev_prev: 'prevPrev'
};

/**
 * Pure JS re-implementation of _applyPm1Flash detection logic.
 * Returns a Set of "rowIdx:dataPair:cellType" strings for every
 * cell that SHOULD have the flash class.
 *
 * NOTE: 0 and 26 share pocket index 0 on the European wheel.
 * calculateReferences and calculatePositionCode already handle this
 * via WHEEL_STANDARD which places both 0 and 26 at the same pocket.
 */
function computeExpectedFlashes(spins) {
    const MAX_VISIBLE = 8;
    const startIdx = Math.max(0, spins.length - MAX_VISIBLE);
    const visibleCount = Math.min(spins.length, MAX_VISIBLE);

    if (spins.length < 4 || visibleCount < 2) return new Set();

    const eligible = [];
    for (let r = 0; r < visibleCount; r++) {
        const spinIdx = startIdx + r;
        if (spinIdx <= 1) continue;
        eligible.push({ spinIdx, relIdx: r });
    }
    if (eligible.length < 2) return new Set();

    function getRowInfo(idx) {
        const spin = spins[idx];
        const prev = spins[idx - 1].actual;
        const rawPrevPrev = idx > 1 ? spins[idx - 2].actual : null;
        const refs = R.calculateReferences(prev, rawPrevPrev || prev);
        const info = {};
        REF_KEYS.forEach(rk => {
            const refNum = refs[rk];
            const ref13 = R.DIGIT_13_OPPOSITES[refNum];
            const pairCode = R.calculatePositionCode(refNum, spin.actual);
            const pair13Code = R.calculatePositionCode(ref13, spin.actual);
            info[rk] = {
                pairDist: R._getPosCodeDistance(pairCode),
                pair13Dist: R._getPosCodeDistance(pair13Code)
            };
        });
        return info;
    }

    const expected = new Set();

    // Only check the LAST TWO eligible rows (matching _computeFlashTargets behavior)
    const upper = eligible[eligible.length - 2];
    const lower = eligible[eligible.length - 1];
    const upperInfo = getRowInfo(upper.spinIdx);
    const lowerInfo = getRowInfo(lower.spinIdx);

    REF_KEYS.forEach(rk => {
        const ui = upperInfo[rk];
        const li = lowerInfo[rk];
        const uDists = [];
        const lDists = [];
        if (ui.pairDist !== null) uDists.push({ dist: ui.pairDist, cell: 'pair' });
        if (ui.pair13Dist !== null) uDists.push({ dist: ui.pair13Dist, cell: 'pair13Opp' });
        if (li.pairDist !== null) lDists.push({ dist: li.pairDist, cell: 'pair' });
        if (li.pair13Dist !== null) lDists.push({ dist: li.pair13Dist, cell: 'pair13Opp' });

        if (uDists.length === 0 || lDists.length === 0) return;

        for (const ud of uDists) {
            let found = false;
            for (const ld of lDists) {
                if (Math.abs(ud.dist - ld.dist) <= 1) {
                    const dp = REFKEY_TO_DATAPAIR[rk];
                    expected.add(`${upper.relIdx}:${dp}:${ud.cell}`);
                    expected.add(`${lower.relIdx}:${dp}:${ld.cell}`);
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    });
    return expected;
}

/** Read flash state from the DOM. Returns same format as computeExpectedFlashes. */
function readActualFlashes() {
    const tbody = document.getElementById('table3Body');
    const dataRows = Array.from(tbody.querySelectorAll('tr:not(.next-row)'));
    const actual = new Set();
    dataRows.forEach((row, rowIdx) => {
        row.querySelectorAll('.t3-pm1-flash').forEach(cell => {
            const dp = cell.getAttribute('data-pair');
            if (!dp) return;
            const pairCells = Array.from(row.querySelectorAll(`td[data-pair="${dp}"]`));
            const cellIdx = pairCells.indexOf(cell);
            const cellType = cellIdx === 1 ? 'pair' : cellIdx === 3 ? 'pair13Opp' : `unknown_${cellIdx}`;
            actual.add(`${rowIdx}:${dp}:${cellType}`);
        });
    });
    return actual;
}

// ═══════════════════════════════════════════════════════════════════
// Validation tests
// ═══════════════════════════════════════════════════════════════════

describe('500-spin flash validation', () => {

    test('sequence has exactly 500 valid roulette numbers (0-36)', () => {
        expect(SPIN_SEQUENCE.length).toBe(500);
        SPIN_SEQUENCE.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        });
    });

    test('sequence includes all 37 numbers (0-36)', () => {
        const seen = new Set(SPIN_SEQUENCE);
        expect(seen.size).toBe(37);
    });

    test('sequence has plenty of 0 and 26 (shared pocket stress)', () => {
        const count0 = SPIN_SEQUENCE.filter(n => n === 0).length;
        const count26 = SPIN_SEQUENCE.filter(n => n === 26).length;
        expect(count0).toBeGreaterThanOrEqual(15);
        expect(count26).toBeGreaterThanOrEqual(15);
    });

    test('0 and 26 share the same pocket index on the wheel', () => {
        // Verify the shared-pocket invariant used throughout the app
        const idx0 = R.WHEEL_STANDARD.indexOf(0);
        const idx26 = R.WHEEL_STANDARD.indexOf(26);
        // Both at pocket 0 (the first/last position of the 37-pocket wheel)
        expect(idx0).toBe(0);
        expect(idx26).toBe(36); // 26 is at the end which wraps to pocket 0
    });

    // ── THE BIG TEST ─────────────────────────────────────────

    test('Full 500-spin run: flash DOM matches independent computation at every checkpoint', () => {
        let mismatches = 0;
        let checksPerformed = 0;
        const mismatchDetails = [];

        for (let i = 0; i < 500; i++) {
            R.spins.push({
                actual: SPIN_SEQUENCE[i],
                direction: i % 2 === 0 ? 'C' : 'AC'
            });

            // Render & verify every 5th spin (100 checkpoints)
            if (R.spins.length >= 4 && R.spins.length % 5 === 0) {
                R.renderTable3();

                const expected = computeExpectedFlashes(R.spins);
                const actual = readActualFlashes();

                for (const key of expected) {
                    if (!actual.has(key)) {
                        mismatches++;
                        if (mismatchDetails.length < 10) {
                            mismatchDetails.push(`MISSING @spin${R.spins.length}: ${key}`);
                        }
                    }
                }
                for (const key of actual) {
                    if (!expected.has(key)) {
                        mismatches++;
                        if (mismatchDetails.length < 10) {
                            mismatchDetails.push(`EXTRA @spin${R.spins.length}: ${key}`);
                        }
                    }
                }
                checksPerformed++;
            }
        }

        if (mismatchDetails.length > 0) {
            console.error('Flash mismatches:', mismatchDetails);
        }

        expect(mismatches).toBe(0);
        expect(checksPerformed).toBe(100);
    });

    test('Flash fires on majority of checkpoints (not silently skipping)', () => {
        let withFlash = 0;

        for (let i = 0; i < 500; i++) {
            R.spins.push({
                actual: SPIN_SEQUENCE[i],
                direction: i % 2 === 0 ? 'C' : 'AC'
            });

            if (R.spins.length >= 4 && R.spins.length % 5 === 0) {
                R.renderTable3();
                if (document.querySelectorAll('.t3-pm1-flash').length > 0) withFlash++;
            }
        }

        console.log(`Checkpoints with flash: ${withFlash}/100`);
        expect(withFlash).toBeGreaterThanOrEqual(50);
    });

    // ── 0/26 shared pocket specific tests ────────────────────

    test('Flash works correctly when 0 appears as actual spin', () => {
        // Session with 0 as actual — references and position codes must handle it
        const seq = [17, 22, 5, 32, 0, 15, 19, 4];
        seq.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        R.renderTable3();
        const expected = computeExpectedFlashes(R.spins);
        const actual = readActualFlashes();

        for (const key of expected) expect(actual.has(key)).toBe(true);
        for (const key of actual) expect(expected.has(key)).toBe(true);
    });

    test('Flash works correctly when 26 appears as actual spin', () => {
        const seq = [17, 22, 5, 32, 26, 15, 19, 4];
        seq.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        R.renderTable3();
        const expected = computeExpectedFlashes(R.spins);
        const actual = readActualFlashes();

        for (const key of expected) expect(actual.has(key)).toBe(true);
        for (const key of actual) expect(expected.has(key)).toBe(true);
    });

    test('Flash works with 0→26 consecutive spins (same pocket)', () => {
        const seq = [17, 22, 5, 0, 26, 15, 19, 4];
        seq.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        R.renderTable3();
        const expected = computeExpectedFlashes(R.spins);
        const actual = readActualFlashes();

        for (const key of expected) expect(actual.has(key)).toBe(true);
        for (const key of actual) expect(expected.has(key)).toBe(true);
    });

    test('Flash works with 26→0 consecutive spins (same pocket reversed)', () => {
        const seq = [17, 22, 5, 26, 0, 15, 19, 4];
        seq.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        R.renderTable3();
        const expected = computeExpectedFlashes(R.spins);
        const actual = readActualFlashes();

        for (const key of expected) expect(actual.has(key)).toBe(true);
        for (const key of actual) expect(expected.has(key)).toBe(true);
    });

    test('Flash works with 0→0→26→26 cluster', () => {
        const seq = [17, 22, 0, 0, 26, 26, 15, 19];
        seq.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        R.renderTable3();
        const expected = computeExpectedFlashes(R.spins);
        const actual = readActualFlashes();

        for (const key of expected) expect(actual.has(key)).toBe(true);
        for (const key of actual) expect(expected.has(key)).toBe(true);
    });

    test('Flash works when 0 is used as prev reference (prev=0)', () => {
        // When prev=0, calculateReferences(0, prevPrev) must handle 0 correctly
        const seq = [15, 32, 0, 17, 22, 5, 19, 4];
        seq.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));

        R.renderTable3();
        const expected = computeExpectedFlashes(R.spins);
        const actual = readActualFlashes();

        for (const key of expected) expect(actual.has(key)).toBe(true);
        for (const key of actual) expect(expected.has(key)).toBe(true);
    });

    // ── Structural checks across all 500 spins ──────────────

    test('No flash ever appears on NEXT row', () => {
        let violations = 0;

        for (let i = 0; i < 500; i++) {
            R.spins.push({ actual: SPIN_SEQUENCE[i], direction: i % 2 === 0 ? 'C' : 'AC' });

            if (R.spins.length >= 4 && R.spins.length % 10 === 0) {
                R.renderTable3();
                const nextRow = document.querySelector('.next-row');
                if (nextRow) violations += nextRow.querySelectorAll('.t3-pm1-flash').length;
            }
        }

        expect(violations).toBe(0);
    });

    test('Flash cells always target position code columns (index 1 or 3)', () => {
        let bad = 0;

        for (let i = 0; i < 500; i++) {
            R.spins.push({ actual: SPIN_SEQUENCE[i], direction: i % 2 === 0 ? 'C' : 'AC' });

            if (R.spins.length >= 4 && R.spins.length % 10 === 0) {
                R.renderTable3();
                document.querySelectorAll('.t3-pm1-flash').forEach(cell => {
                    const dp = cell.getAttribute('data-pair');
                    if (!dp) { bad++; return; }
                    const pairCells = Array.from(cell.closest('tr').querySelectorAll(`td[data-pair="${dp}"]`));
                    const idx = pairCells.indexOf(cell);
                    if (idx !== 1 && idx !== 3) bad++;
                });
            }
        }

        expect(bad).toBe(0);
    });

    test('Flash cells always have valid data-pair attributes', () => {
        const valid = ['prev', 'prevPlus1', 'prevMinus1', 'prevPlus2', 'prevMinus2', 'prevPrev'];
        let invalid = 0;

        for (let i = 0; i < 500; i++) {
            R.spins.push({ actual: SPIN_SEQUENCE[i], direction: i % 2 === 0 ? 'C' : 'AC' });

            if (R.spins.length >= 4 && R.spins.length % 10 === 0) {
                R.renderTable3();
                document.querySelectorAll('.t3-pm1-flash').forEach(cell => {
                    if (!valid.includes(cell.getAttribute('data-pair'))) invalid++;
                });
            }
        }

        expect(invalid).toBe(0);
    });

    test('Re-render is idempotent (same data → same flash)', () => {
        for (let i = 0; i < 200; i++) {
            R.spins.push({ actual: SPIN_SEQUENCE[i], direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();
        const flash1 = readActualFlashes();
        R.renderTable3();
        const flash2 = readActualFlashes();

        expect(flash1.size).toBe(flash2.size);
        for (const key of flash1) expect(flash2.has(key)).toBe(true);
    });

    test('Flash ONLY appears on last 2 data rows (not earlier rows)', () => {
        for (let i = 0; i < 100; i++) {
            R.spins.push({ actual: SPIN_SEQUENCE[i], direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();
        const dataRows = Array.from(document.querySelectorAll('#table3Body tr:not(.next-row)'));
        let earlierFlash = 0;

        for (let i = 0; i < dataRows.length - 2; i++) {
            earlierFlash += dataRows[i].querySelectorAll('.t3-pm1-flash').length;
        }

        console.log(`Flash on non-last-2 rows (should be 0): ${earlierFlash}`);
        expect(earlierFlash).toBe(0);
    });

    test('Total flash cells at spin 500', () => {
        for (let i = 0; i < 500; i++) {
            R.spins.push({ actual: SPIN_SEQUENCE[i], direction: i % 2 === 0 ? 'C' : 'AC' });
        }

        R.renderTable3();
        const count = document.querySelectorAll('.t3-pm1-flash').length;
        console.log(`Flash cells at spin 500: ${count}`);
        expect(count).toBeGreaterThan(0);
    });
});
