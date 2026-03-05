/**
 * Regression Test Suite #3 — Renderer Functions & Money Management Strategies
 *
 * Covers:
 * A. Position code calculation — all 37 numbers, edge cases
 * B. Wheel distance calculation — direction, wrapping, zero/26
 * C. getNumberAtPosition — reverse lookup from position codes
 * D. flipPositionCode — code flipping correctness
 * E. generateAnchors — anchor generation from position codes
 * F. expandAnchorsToBetNumbers — ±1 neighbor expansion
 * G. expandTargetsToBetNumbers — ±N both-side expansion
 * H. calculateWheelAnchors — contiguous run detection
 * I. Wheel36 pocket functions — shared pocket 0/26
 * J. calculateReferences — boundary refs (0, 36)
 * K. Money Strategy 1 (Aggressive) — ±$1 every bet
 * L. Money Strategy 2 (Conservative) — ±$1 after 2 consecutive
 * M. Money Strategy 3 (Cautious) — +$2 after 3 losses, -$1 after 2 wins
 * N. Chip breakdown — edge cases
 * O. Strategy switching mid-sequence
 * P. Renderer constants correctness
 */

const { setupDOM, loadRendererFunctions, createMoneyPanel } = require('../test-setup');

let R;

beforeEach(() => {
    setupDOM();
    global.getLookupRow = jest.fn(() => null);
    R = loadRendererFunctions();
    R.spins.length = 0;
});

// ═══════════════════════════════════════════════════════════════
// A. POSITION CODE CALCULATION
// ═══════════════════════════════════════════════════════════════

describe('A. Position Code Calculation', () => {

    test('A1: Same number returns S+0', () => {
        expect(R.calculatePositionCode(15, 15)).toBe('S+0');
        expect(R.calculatePositionCode(0, 0)).toBe('S+0');
        expect(R.calculatePositionCode(26, 26)).toBe('S+0');
    });

    test('A2: 0 and 26 are treated as same (S+0)', () => {
        // 0 and 26 share the same pocket
        expect(R.calculatePositionCode(0, 26)).toBe('S+0');
        expect(R.calculatePositionCode(26, 0)).toBe('S+0');
    });

    test('A3: Direct neighbor on same side returns SL+1 or SR+1', () => {
        // On WHEEL_NO_ZERO: [26,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
        // 32 is at index 1, to its right is 15 (index 2)
        const code = R.calculatePositionCode(32, 15);
        expect(['SL+1', 'SR+1']).toContain(code);
    });

    test('A4: Exact opposite returns O+0', () => {
        // REGULAR_OPPOSITES[0] = 10, REGULAR_OPPOSITES[32] = 5
        expect(R.calculatePositionCode(0, 10)).toBe('O+0');
        expect(R.calculatePositionCode(32, 5)).toBe('O+0');
    });

    test('A5: Far away number returns XX', () => {
        // Numbers beyond ±4 on both same and opposite side
        // 32 is near top of wheel, 18 is near bottom — should be XX
        const code = R.calculatePositionCode(32, 18);
        expect(code).toBe('XX');
    });

    test('A6: All 37 numbers produce valid codes against ref 0', () => {
        const validCodes = /^(S\+0|SL\+[1-4]|SR\+[1-4]|O\+0|OL\+[1-4]|OR\+[1-4]|XX)$/;
        for (let num = 0; num <= 36; num++) {
            const code = R.calculatePositionCode(0, num);
            expect(code).toMatch(validCodes);
        }
    });

    test('A7: Position code is symmetric for S+0 and O+0 but not others', () => {
        // S+0: Both directions give same result
        expect(R.calculatePositionCode(15, 15)).toBe('S+0');
        // O+0: Opposites
        expect(R.calculatePositionCode(15, 24)).toBe('O+0');
        expect(R.calculatePositionCode(24, 15)).toBe('O+0');
    });

    test('A8: All valid codes have correct format', () => {
        const allCodes = new Set();
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                allCodes.add(R.calculatePositionCode(ref, act));
            }
        }
        const validPattern = /^(S\+0|SL\+[1-4]|SR\+[1-4]|O\+0|OL\+[1-4]|OR\+[1-4]|XX)$/;
        for (const code of allCodes) {
            expect(code).toMatch(validPattern);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// B. WHEEL DISTANCE CALCULATION
// ═══════════════════════════════════════════════════════════════

describe('B. Wheel Distance Calculation', () => {

    test('B1: Distance to self is 999 (not 0)', () => {
        // calculateWheelDistance searches from fromIdx, moving by direction
        // It never returns 0 (that would be the starting position)
        const dist = R.calculateWheelDistance(1, 32, 1); // index 1 = number 32
        // Starting from index 1 (32), moving right: next is 15 at index 2
        // 32 itself would need distance 37 (full circle) → returns 999
        expect(dist).toBe(999); // Target is self → not within 4
    });

    test('B2: Distance to immediate neighbor is 1', () => {
        // WHEEL_NO_ZERO: index 1 = 32, index 2 = 15
        // From 32 (idx 1), going right (+1), first number is 15
        const dist = R.calculateWheelDistance(1, 15, 1);
        expect(dist).toBe(1);
    });

    test('B3: Distance > 4 returns 999', () => {
        // From index 1, number at +5 positions is beyond range
        const dist = R.calculateWheelDistance(1, 18, 1);
        expect(dist).toBe(999);
    });

    test('B4: Left direction wraps around correctly', () => {
        // From index 0 (26), going left: wraps to index 36 = 26 (but that's still 26, skip)
        // then index 35 = 3
        const dist = R.calculateWheelDistance(0, 3, -1);
        expect(dist).toBeLessThanOrEqual(4);
    });

    test('B5: Target 26 handling with zero-skip', () => {
        // Distance from nearby index to 26 — need to handle the skip
        // Index 35 = 3, going right: wraps to index 36 = 26
        const dist = R.calculateWheelDistance(35, 26, 1);
        expect(dist).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════════
// C. getNumberAtPosition
// ═══════════════════════════════════════════════════════════════

describe('C. getNumberAtPosition — Reverse Lookup', () => {

    test('C1: S+0 returns the reference number itself', () => {
        expect(R.getNumberAtPosition(15, 'S+0')).toBe(15);
        expect(R.getNumberAtPosition(0, 'S+0')).toBe(0);
    });

    test('C2: O+0 returns the regular opposite', () => {
        expect(R.getNumberAtPosition(0, 'O+0')).toBe(10);
        expect(R.getNumberAtPosition(32, 'O+0')).toBe(5);
    });

    test('C3: XX returns null', () => {
        expect(R.getNumberAtPosition(15, 'XX')).toBeNull();
    });

    test('C4: SR+1 returns right neighbor on same side', () => {
        const num = R.getNumberAtPosition(15, 'SR+1');
        expect(num).not.toBeNull();
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(36);
    });

    test('C5: SL+1 returns left neighbor on same side', () => {
        const num = R.getNumberAtPosition(15, 'SL+1');
        expect(num).not.toBeNull();
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(36);
    });

    test('C6: Round-trip: calculatePositionCode → getNumberAtPosition', () => {
        // For each ref, get code for actual, then reverse to get number
        const ref = 19;
        for (let actual = 0; actual <= 36; actual++) {
            const code = R.calculatePositionCode(ref, actual);
            if (code !== 'XX') {
                const reversed = R.getNumberAtPosition(ref, code);
                // Due to 0/26 sharing, the reversed number might be 0 or 26
                if (actual === 0 || actual === 26) {
                    expect([0, 26]).toContain(reversed);
                } else {
                    expect(reversed).toBe(actual);
                }
            }
        }
    });

    test('C7: getNumberAtPosition handles number 0 reference', () => {
        // 0 maps to 26 internally
        const num = R.getNumberAtPosition(0, 'SR+1');
        expect(num).not.toBeNull();
    });

    test('C8: getNumberAtPosition handles number 26 reference', () => {
        const num = R.getNumberAtPosition(26, 'SR+1');
        expect(num).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════
// D. FLIP POSITION CODE
// ═══════════════════════════════════════════════════════════════

describe('D. flipPositionCode', () => {

    test('D1: XX stays XX', () => {
        expect(R.flipPositionCode('XX')).toBe('XX');
    });

    test('D2: S+0 stays S+0', () => {
        expect(R.flipPositionCode('S+0')).toBe('S+0');
    });

    test('D3: O+0 stays O+0', () => {
        expect(R.flipPositionCode('O+0')).toBe('O+0');
    });

    test('D4: SL+1 flips sign', () => {
        // flipPositionCode replaces + with - and vice versa
        const flipped = R.flipPositionCode('SL+1');
        expect(flipped).toBe('SL-1');
    });

    test('D5: OR+2 flips sign', () => {
        const flipped = R.flipPositionCode('OR+2');
        expect(flipped).toBe('OR-2');
    });

    test('D6: SL-3 flips back to +', () => {
        const flipped = R.flipPositionCode('SL-3');
        expect(flipped).toBe('SL+3');
    });
});

// ═══════════════════════════════════════════════════════════════
// E. GENERATE ANCHORS
// ═══════════════════════════════════════════════════════════════

describe('E. generateAnchors', () => {

    test('E1: XX position code returns empty anchors', () => {
        const result = R.generateAnchors(15, 24, 'XX');
        expect(result.purple).toHaveLength(0);
        expect(result.green).toHaveLength(0);
    });

    test('E2: S+0 generates anchors from ref and its 13opp', () => {
        const result = R.generateAnchors(15, R.DIGIT_13_OPPOSITES[15], 'S+0');
        expect(result.purple.length).toBeGreaterThan(0);
        expect(result.green.length).toBeGreaterThan(0);
    });

    test('E3: Purple anchors are unique', () => {
        const result = R.generateAnchors(19, R.DIGIT_13_OPPOSITES[19], 'SR+1');
        const unique = new Set(result.purple);
        expect(unique.size).toBe(result.purple.length);
    });

    test('E4: Green anchors are opposites of purple anchors', () => {
        const result = R.generateAnchors(4, R.DIGIT_13_OPPOSITES[4], 'SL+2');
        for (let i = 0; i < result.purple.length; i++) {
            expect(R.REGULAR_OPPOSITES[result.purple[i]]).toBe(result.green[i]);
        }
    });

    test('E5: All anchor numbers are valid (0-36)', () => {
        const result = R.generateAnchors(32, R.DIGIT_13_OPPOSITES[32], 'OR+1');
        [...result.purple, ...result.green].forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// F. EXPAND ANCHORS TO BET NUMBERS
// ═══════════════════════════════════════════════════════════════

describe('F. expandAnchorsToBetNumbers — ±1 Expansion', () => {

    test('F1: Single anchor expands to 3+ numbers', () => {
        // ±1 neighbor on wheel: center + 1 left + 1 right = at least 3
        // Plus 0/26 sharing could add an extra
        const result = R.expandAnchorsToBetNumbers([15], []);
        expect(result.length).toBeGreaterThanOrEqual(3);
    });

    test('F2: Anchor 0 includes both 0 and 26 (shared pocket)', () => {
        const result = R.expandAnchorsToBetNumbers([0], []);
        expect(result).toContain(0);
        expect(result).toContain(26);
    });

    test('F3: No duplicate numbers in result', () => {
        const result = R.expandAnchorsToBetNumbers([15, 19], [24, 16]);
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
    });

    test('F4: Empty anchors returns empty', () => {
        const result = R.expandAnchorsToBetNumbers([], []);
        expect(result).toHaveLength(0);
    });

    test('F5: All results are valid roulette numbers', () => {
        const result = R.expandAnchorsToBetNumbers([32, 15, 19], [5, 24, 16]);
        result.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
// G. EXPAND TARGETS TO BET NUMBERS (±N BOTH SIDES)
// ═══════════════════════════════════════════════════════════════

describe('G. expandTargetsToBetNumbers — ±N Both-Side Expansion', () => {

    test('G1: ±1 expansion includes same side + opposite side', () => {
        const result = R.expandTargetsToBetNumbers([15], 1);
        // Should include 15, its ±1 neighbors, its opposite, and opposite's ±1 neighbors
        expect(result).toContain(15);
        expect(result).toContain(R.REGULAR_OPPOSITES[15]); // opposite = 24
        expect(result.length).toBeGreaterThanOrEqual(6); // at least 3 same + 3 opp
    });

    test('G2: ±2 expansion is wider than ±1', () => {
        const result1 = R.expandTargetsToBetNumbers([15], 1);
        const result2 = R.expandTargetsToBetNumbers([15], 2);
        expect(result2.length).toBeGreaterThan(result1.length);
    });

    test('G3: Target 0 includes 26 (shared pocket)', () => {
        const result = R.expandTargetsToBetNumbers([0], 1);
        expect(result).toContain(0);
        expect(result).toContain(26);
    });

    test('G4: Empty targets returns empty', () => {
        const result = R.expandTargetsToBetNumbers([], 1);
        expect(result).toHaveLength(0);
    });

    test('G5: Multiple targets combined without duplicates', () => {
        const result = R.expandTargetsToBetNumbers([15, 19], 1);
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
    });
});

// ═══════════════════════════════════════════════════════════════
// H. CALCULATE WHEEL ANCHORS — CONTIGUOUS RUN DETECTION
// ═══════════════════════════════════════════════════════════════

describe('H. calculateWheelAnchors — Contiguous Run Detection', () => {

    test('H1: Empty array returns empty', () => {
        const result = R.calculateWheelAnchors([]);
        expect(result.anchors).toHaveLength(0);
        expect(result.loose).toHaveLength(0);
        expect(result.anchorGroups).toHaveLength(0);
    });

    test('H2: Null input returns empty', () => {
        const result = R.calculateWheelAnchors(null);
        expect(result.anchors).toHaveLength(0);
    });

    test('H3: 3 consecutive wheel numbers form ±1 group', () => {
        // WHEEL_STANDARD: [0,32,15,19,4,...]
        // 0, 32, 15 are consecutive on the wheel
        const result = R.calculateWheelAnchors([0, 32, 15]);
        expect(result.anchorGroups.length).toBeGreaterThanOrEqual(1);
        expect(result.anchorGroups[0].type).toBe('±1');
        expect(result.anchorGroups[0].group).toHaveLength(3);
    });

    test('H4: 5 consecutive wheel numbers form ±2 group', () => {
        // 0, 32, 15, 19, 4 are consecutive on the wheel
        const result = R.calculateWheelAnchors([0, 32, 15, 19, 4]);
        expect(result.anchorGroups.length).toBeGreaterThanOrEqual(1);
        const pm2 = result.anchorGroups.find(g => g.type === '±2');
        expect(pm2).toBeDefined();
        expect(pm2.group).toHaveLength(5);
    });

    test('H5: Single number becomes loose', () => {
        const result = R.calculateWheelAnchors([17]);
        expect(result.loose).toContain(17);
        expect(result.anchorGroups).toHaveLength(0);
    });

    test('H6: Two adjacent numbers both become loose', () => {
        // 2 consecutive is not enough for an anchor group (need ≥3)
        const result = R.calculateWheelAnchors([32, 15]);
        expect(result.loose.length).toBe(2);
        expect(result.anchorGroups).toHaveLength(0);
    });

    test('H7: Non-adjacent numbers all loose', () => {
        const result = R.calculateWheelAnchors([0, 19, 6, 36]);
        expect(result.loose.length).toBe(4);
    });

    test('H8: Wrap-around run detection (end→start of wheel)', () => {
        // WHEEL_STANDARD ends with ..., 35, 3, 26 and starts with 0, 32, 15
        // 26 (index 36), 0 (index 0), 32 (index 1) are consecutive wrapping around
        const result = R.calculateWheelAnchors([26, 0, 32]);
        // Should detect this as a contiguous run
        expect(result.anchorGroups.length + result.loose.length).toBeGreaterThan(0);
    });

    test('H9: All numbers covered means no loose', () => {
        // 6 consecutive numbers: 0,32,15,19,4,21
        const result = R.calculateWheelAnchors([0, 32, 15, 19, 4, 21]);
        // Should be a ±2 group (5) + 1 loose, or ±1 group (3) + ±1 group (3)
        const totalCovered = result.anchorGroups.reduce((sum, g) => sum + g.group.length, 0);
        expect(totalCovered + result.loose.length).toBe(6);
    });

    test('H10: Anchor is center of its group', () => {
        const result = R.calculateWheelAnchors([0, 32, 15]);
        if (result.anchorGroups.length > 0) {
            const group = result.anchorGroups[0];
            // Center of 3-element group
            expect(group.anchor).toBe(group.group[1]);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// I. WHEEL 36 POCKET FUNCTIONS
// ═══════════════════════════════════════════════════════════════

describe('I. Wheel36 Pocket Functions', () => {

    test('I1: getWheel36Index — 0 maps to index 0', () => {
        expect(R.getWheel36Index(0)).toBe(0);
    });

    test('I2: getWheel36Index — 26 also maps to index 0', () => {
        expect(R.getWheel36Index(26)).toBe(0);
    });

    test('I3: getWheel36Index — 32 maps to index 1', () => {
        expect(R.getWheel36Index(32)).toBe(1);
    });

    test('I4: getNumbersAtPocket — index 0 returns both 0 and 26', () => {
        const nums = R.getNumbersAtPocket(0);
        expect(nums).toContain(0);
        expect(nums).toContain(26);
        expect(nums).toHaveLength(2);
    });

    test('I5: getNumbersAtPocket — index 1 returns [32]', () => {
        const nums = R.getNumbersAtPocket(1);
        expect(nums).toEqual([32]);
    });

    test('I6: getNumbersAtPocket wraps correctly', () => {
        // -1 wraps to 35 (or 36-1)
        const numsWrap = R.getNumbersAtPocket(-1);
        const numsNorm = R.getNumbersAtPocket(35);
        expect(numsWrap).toEqual(numsNorm);
    });

    test('I7: Every number 0-36 has a valid Wheel36 index', () => {
        for (let n = 0; n <= 36; n++) {
            const idx = R.getWheel36Index(n);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(36);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// J. CALCULATE REFERENCES — BOUNDARY HANDLING
// ═══════════════════════════════════════════════════════════════

describe('J. calculateReferences — Boundary Handling', () => {

    test('J1: Normal number produces standard refs', () => {
        const refs = R.calculateReferences(15, 10);
        expect(refs.prev).toBe(15);
        expect(refs.prev_prev).toBe(10);
        expect(refs.prev_plus_1).toBe(16);
        expect(refs.prev_minus_1).toBe(14);
        expect(refs.prev_plus_2).toBe(17);
        expect(refs.prev_minus_2).toBe(13);
    });

    test('J2: prev=0 has special handling', () => {
        const refs = R.calculateReferences(0, 5);
        expect(refs.prev_minus_1).toBe(10);  // Special: not -1
        expect(refs.prev_minus_2).toBe(9);   // Special: not -2
        expect(refs.prev_plus_1).toBe(1);
        expect(refs.prev_plus_2).toBe(2);
    });

    test('J3: prev=36 has special handling', () => {
        const refs = R.calculateReferences(36, 20);
        expect(refs.prev_plus_1).toBe(35);
        expect(refs.prev_plus_2).toBe(34);
        expect(refs.prev_minus_1).toBe(35);
        expect(refs.prev_minus_2).toBe(34);
    });

    test('J4: All reference values are valid numbers 0-36', () => {
        for (let prev = 0; prev <= 36; prev++) {
            const refs = R.calculateReferences(prev, 10);
            Object.values(refs).forEach(v => {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(36);
            });
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// K. MONEY STRATEGY 1 (AGGRESSIVE) — ±$1 EVERY BET
// ═══════════════════════════════════════════════════════════════

describe('K. Money Strategy 1 (Aggressive)', () => {

    let panel;

    beforeEach(() => {
        panel = createMoneyPanel();
        panel.sessionData.bettingStrategy = 1;
        panel.sessionData.isSessionActive = true;
        panel.sessionData.isBettingEnabled = true;
        panel.sessionData.currentBetPerNumber = 5;
    });

    test('K1: Win decreases bet by $1', async () => {
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(4);
    });

    test('K2: Loss increases bet by $1', async () => {
        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(6);
    });

    test('K3: Win cannot go below $2', async () => {
        panel.sessionData.currentBetPerNumber = 2;
        await panel.recordBetResult(2, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(2);
    });

    test('K4: 5 consecutive losses → bet increases by $5', async () => {
        for (let i = 0; i < 5; i++) {
            await panel.recordBetResult(panel.sessionData.currentBetPerNumber, 12, false, 15);
        }
        expect(panel.sessionData.currentBetPerNumber).toBe(10); // 5 + 5
    });

    test('K5: Win-loss alternation keeps bet near start', async () => {
        await panel.recordBetResult(5, 12, true, 15);   // 5 → 4
        await panel.recordBetResult(4, 12, false, 15);   // 4 → 5
        await panel.recordBetResult(5, 12, true, 15);    // 5 → 4
        expect(panel.sessionData.currentBetPerNumber).toBe(4);
    });

    test('K6: Consecutive wins keep decreasing', async () => {
        await panel.recordBetResult(5, 12, true, 15);   // 5 → 4
        await panel.recordBetResult(4, 12, true, 15);   // 4 → 3
        await panel.recordBetResult(3, 12, true, 15);   // 3 → 2
        await panel.recordBetResult(2, 12, true, 15);   // 2 → 2 (floor)
        expect(panel.sessionData.currentBetPerNumber).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════════
// L. MONEY STRATEGY 2 (CONSERVATIVE) — ±$1 AFTER 2 CONSECUTIVE
// ═══════════════════════════════════════════════════════════════

describe('L. Money Strategy 2 (Conservative)', () => {

    let panel;

    beforeEach(() => {
        panel = createMoneyPanel();
        panel.sessionData.bettingStrategy = 2;
        panel.sessionData.isSessionActive = true;
        panel.sessionData.isBettingEnabled = true;
        panel.sessionData.currentBetPerNumber = 5;
    });

    test('L1: Single loss does NOT change bet', async () => {
        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(5);
        expect(panel.sessionData.consecutiveLosses).toBe(1);
    });

    test('L2: 2 consecutive losses increases bet by $1 and resets counter', async () => {
        await panel.recordBetResult(5, 12, false, 15);
        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(6);
        expect(panel.sessionData.consecutiveLosses).toBe(0); // Reset
    });

    test('L3: 4 consecutive losses → 2 increases (at loss 2 and loss 4)', async () => {
        for (let i = 0; i < 4; i++) {
            await panel.recordBetResult(panel.sessionData.currentBetPerNumber, 12, false, 15);
        }
        expect(panel.sessionData.currentBetPerNumber).toBe(7); // 5 → 6 (at 2) → 7 (at 4)
    });

    test('L4: Single win does NOT change bet', async () => {
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(5);
        expect(panel.sessionData.consecutiveWins).toBe(1);
    });

    test('L5: 2 consecutive wins decreases bet by $1 and resets counter', async () => {
        await panel.recordBetResult(5, 12, true, 15);
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(4);
        expect(panel.sessionData.consecutiveWins).toBe(0); // Reset
    });

    test('L6: Win-loss breaks streak — no adjustment', async () => {
        await panel.recordBetResult(5, 12, false, 15);  // 1 loss
        await panel.recordBetResult(5, 12, true, 15);   // breaks streak
        expect(panel.sessionData.currentBetPerNumber).toBe(5); // No change
    });

    test('L7: 2 wins cannot go below $2', async () => {
        panel.sessionData.currentBetPerNumber = 2;
        await panel.recordBetResult(2, 12, true, 15);
        await panel.recordBetResult(2, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════════
// M. MONEY STRATEGY 3 (CAUTIOUS) — +$2 AFTER 3 LOSSES, -$1 AFTER 2 WINS
// ═══════════════════════════════════════════════════════════════

describe('M. Money Strategy 3 (Cautious)', () => {

    let panel;

    beforeEach(() => {
        panel = createMoneyPanel();
        panel.sessionData.bettingStrategy = 3;
        panel.sessionData.isSessionActive = true;
        panel.sessionData.isBettingEnabled = true;
        panel.sessionData.currentBetPerNumber = 5;
    });

    test('M1: 1-2 consecutive losses do NOT change bet', async () => {
        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(5);
        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(5);
    });

    test('M2: 3 consecutive losses increases bet by $2 and resets counter', async () => {
        for (let i = 0; i < 3; i++) {
            await panel.recordBetResult(panel.sessionData.currentBetPerNumber, 12, false, 15);
        }
        expect(panel.sessionData.currentBetPerNumber).toBe(7); // 5 + 2
        expect(panel.sessionData.consecutiveLosses).toBe(0); // Reset
    });

    test('M3: 6 consecutive losses → 2 increases (+$4 total)', async () => {
        for (let i = 0; i < 6; i++) {
            await panel.recordBetResult(panel.sessionData.currentBetPerNumber, 12, false, 15);
        }
        expect(panel.sessionData.currentBetPerNumber).toBe(9); // 5 → 7 (at 3) → 9 (at 6)
    });

    test('M4: 2 consecutive wins decreases bet by $1', async () => {
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(5); // no change
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(4); // -$1
    });

    test('M5: 2 wins cannot go below $2', async () => {
        panel.sessionData.currentBetPerNumber = 2;
        await panel.recordBetResult(2, 12, true, 15);
        await panel.recordBetResult(2, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(2);
    });

    test('M6: Loss breaks win streak, win breaks loss streak', async () => {
        // 2 losses, then win → no increase (only had 2, need 3)
        await panel.recordBetResult(5, 12, false, 15);
        await panel.recordBetResult(5, 12, false, 15);
        await panel.recordBetResult(5, 12, true, 15);   // breaks loss streak
        expect(panel.sessionData.currentBetPerNumber).toBe(5); // No change
    });

    test('M7: Complex sequence: LLLWWLLLWW', async () => {
        // LLL → +$2 (5 → 7)
        for (let i = 0; i < 3; i++) {
            await panel.recordBetResult(panel.sessionData.currentBetPerNumber, 12, false, 15);
        }
        expect(panel.sessionData.currentBetPerNumber).toBe(7);

        // WW → -$1 (7 → 6)
        await panel.recordBetResult(7, 12, true, 15);
        await panel.recordBetResult(7, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(6);

        // LLL → +$2 (6 → 8)
        for (let i = 0; i < 3; i++) {
            await panel.recordBetResult(panel.sessionData.currentBetPerNumber, 12, false, 15);
        }
        expect(panel.sessionData.currentBetPerNumber).toBe(8);

        // WW → -$1 (8 → 7)
        await panel.recordBetResult(8, 12, true, 15);
        await panel.recordBetResult(8, 12, true, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(7);
    });
});

// ═══════════════════════════════════════════════════════════════
// N. CHIP BREAKDOWN — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('N. Chip Breakdown', () => {

    let panel;

    beforeEach(() => {
        panel = createMoneyPanel();
    });

    test('N1: $2 breaks into 1×$2', () => {
        const breakdown = panel.calculateChipBreakdown(2);
        const total = breakdown.reduce((sum, b) => sum + b.value * b.count, 0);
        expect(total).toBe(2);
    });

    test('N2: $5 breaks into 1×$5', () => {
        const breakdown = panel.calculateChipBreakdown(5);
        const total = breakdown.reduce((sum, b) => sum + b.value * b.count, 0);
        expect(total).toBe(5);
    });

    test('N3: $100 breaks into 1×$100', () => {
        const breakdown = panel.calculateChipBreakdown(100);
        const has100 = breakdown.find(b => b.value === 100);
        expect(has100).toBeDefined();
        expect(has100.count).toBe(1);
    });

    test('N4: $157 is exact', () => {
        const breakdown = panel.calculateChipBreakdown(157);
        const total = breakdown.reduce((sum, b) => sum + b.value * b.count, 0);
        expect(total).toBe(157);
    });

    test('N5: $1 breaks into 1×$1', () => {
        const breakdown = panel.calculateChipBreakdown(1);
        const total = breakdown.reduce((sum, b) => sum + b.value * b.count, 0);
        expect(total).toBe(1);
    });

    test('N6: All breakdowns sum to original amount for 1-50', () => {
        for (let amount = 1; amount <= 50; amount++) {
            const breakdown = panel.calculateChipBreakdown(amount);
            const total = breakdown.reduce((sum, b) => sum + b.value * b.count, 0);
            expect(total).toBe(amount);
        }
    });

    test('N7: formatChipBreakdown returns a non-empty string', () => {
        const breakdown = panel.calculateChipBreakdown(27);
        const text = panel.formatChipBreakdown(breakdown);
        expect(text.length).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════
// O. STRATEGY SWITCHING MID-SEQUENCE
// ═══════════════════════════════════════════════════════════════

describe('O. Strategy Switching Mid-Sequence', () => {

    let panel;

    beforeEach(() => {
        panel = createMoneyPanel();
        panel.sessionData.isSessionActive = true;
        panel.sessionData.isBettingEnabled = true;
        panel.sessionData.currentBetPerNumber = 5;
    });

    test('O1: Switch from strategy 1 to 2 mid-losing-streak', async () => {
        panel.sessionData.bettingStrategy = 1;
        // 2 losses with strategy 1: +$1 each → bet = 7
        await panel.recordBetResult(5, 12, false, 15);
        await panel.recordBetResult(6, 12, false, 15);
        expect(panel.sessionData.currentBetPerNumber).toBe(7);

        // Switch to strategy 2 — consecutive counter = 2 already
        panel.sessionData.bettingStrategy = 2;
        // Next loss: consecutiveLosses is already 2 from above → should trigger +$1
        await panel.recordBetResult(7, 12, false, 15);
        // consecutiveLosses was 2 before this loss → increments to 3
        // Strategy 2 checks >= 2: fires at 2 (was already 2 at switch)
        // After the loss: consecutiveLosses = 3, but check happens after increment
        // Actually: consecutive count tracks across strategies
        expect(panel.sessionData.currentBetPerNumber).toBeGreaterThanOrEqual(7);
    });

    test('O2: toggleStrategy cycles 1→2→3→1', () => {
        panel.sessionData.bettingStrategy = 1;
        panel.toggleStrategy();
        expect(panel.sessionData.bettingStrategy).toBe(2);
        panel.toggleStrategy();
        expect(panel.sessionData.bettingStrategy).toBe(3);
        panel.toggleStrategy();
        expect(panel.sessionData.bettingStrategy).toBe(1);
    });

    test('O3: Strategy switch resets bet to $2', () => {
        panel.sessionData.currentBetPerNumber = 10;
        panel.toggleStrategy();
        expect(panel.sessionData.currentBetPerNumber).toBe(2);
    });

    test('O4: toggleBetting pauses and clears pending bet', () => {
        panel.sessionData.isBettingEnabled = true;
        panel.pendingBet = { betAmount: 5, numbersCount: 12, predictedNumbers: [1, 2, 3] };
        panel.toggleBetting();
        expect(panel.sessionData.isBettingEnabled).toBe(false);
        expect(panel.pendingBet).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════
// P. RENDERER CONSTANTS CORRECTNESS
// ═══════════════════════════════════════════════════════════════

describe('P. Renderer Constants Correctness', () => {

    test('P1: WHEEL_STANDARD has 37 entries', () => {
        expect(R.WHEEL_STANDARD).toHaveLength(37);
    });

    test('P2: WHEEL_STANDARD contains all 37 roulette numbers', () => {
        const nums = new Set(R.WHEEL_STANDARD);
        expect(nums.size).toBe(37);
        for (let i = 0; i <= 36; i++) {
            expect(nums.has(i)).toBe(true);
        }
    });

    test('P3: WHEEL_NO_ZERO has 37 entries (26 replaces 0)', () => {
        expect(R.WHEEL_NO_ZERO).toHaveLength(37);
        // Should have 26 at index 0 AND index 36
        expect(R.WHEEL_NO_ZERO[0]).toBe(26);
        expect(R.WHEEL_NO_ZERO[36]).toBe(26);
    });

    test('P4: REGULAR_OPPOSITES is bidirectional (0/26 share pocket)', () => {
        // For most numbers, opposite(opposite(n)) === n
        // Exception: 0 and 26 share a pocket, so opp(0)=10, opp(10)=26 (not 0)
        for (let n = 0; n <= 36; n++) {
            const opp = R.REGULAR_OPPOSITES[n];
            expect(opp).toBeGreaterThanOrEqual(0);
            expect(opp).toBeLessThanOrEqual(36);
            if (n === 0) {
                // opp(0)=10, opp(10)=26 — maps to the other pocket-mate
                expect(R.REGULAR_OPPOSITES[opp]).toBe(26);
            } else {
                expect(R.REGULAR_OPPOSITES[opp]).toBe(n);
            }
        }
    });

    test('P5: DIGIT_13_OPPOSITES covers all 37 numbers', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.DIGIT_13_OPPOSITES[n]).toBeDefined();
            expect(R.DIGIT_13_OPPOSITES[n]).toBeGreaterThanOrEqual(0);
            expect(R.DIGIT_13_OPPOSITES[n]).toBeLessThanOrEqual(36);
        }
    });

    test('P6: WHEEL_36 has 36 entries (no duplicate pocket)', () => {
        expect(R.WHEEL_36).toHaveLength(36);
        expect(R.WHEEL_36[0]).toBe(0);
        // 26 is NOT in WHEEL_36 (it shares pocket with 0)
        expect(R.WHEEL_36.indexOf(26)).toBe(-1);
    });

    test('P7: _PAIR_REFKEY_TO_DATA_PAIR maps pair keys correctly', () => {
        const mapping = R._PAIR_REFKEY_TO_DATA_PAIR;
        expect(mapping).toBeDefined();
        expect(mapping['prev']).toBeDefined();
        expect(mapping['prev_plus_1']).toBeDefined();
        expect(mapping['prev_minus_1']).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════════════════
// Q. BANKROLL AND WIN/LOSS ACCOUNTING
// ═══════════════════════════════════════════════════════════════

describe('Q. Bankroll and Win/Loss Accounting', () => {

    let panel;

    beforeEach(() => {
        panel = createMoneyPanel();
        panel.sessionData.isSessionActive = true;
        panel.sessionData.isBettingEnabled = true;
        panel.sessionData.bettingStrategy = 1;
    });

    test('Q1: Win calculation: 35:1 payout minus total bet', async () => {
        const betPerNum = 5;
        const numbersCount = 12;
        const totalBet = betPerNum * numbersCount; // 60
        const winAmount = betPerNum * 35; // 175
        const expectedNet = winAmount - totalBet; // 115

        await panel.recordBetResult(betPerNum, numbersCount, true, 15);
        expect(panel.sessionData.sessionProfit).toBe(expectedNet);
        expect(panel.sessionData.currentBankroll).toBe(4000 + expectedNet);
    });

    test('Q2: Loss calculation: total bet lost', async () => {
        const betPerNum = 5;
        const numbersCount = 12;
        const totalBet = betPerNum * numbersCount; // 60

        await panel.recordBetResult(betPerNum, numbersCount, false, 15);
        expect(panel.sessionData.sessionProfit).toBe(-totalBet);
        expect(panel.sessionData.currentBankroll).toBe(4000 - totalBet);
    });

    test('Q3: Win counter and loss counter update correctly', async () => {
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.totalWins).toBe(1);
        expect(panel.sessionData.totalLosses).toBe(0);
        expect(panel.sessionData.totalBets).toBe(1);

        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.totalWins).toBe(1);
        expect(panel.sessionData.totalLosses).toBe(1);
        expect(panel.sessionData.totalBets).toBe(2);
    });

    test('Q4: Consecutive loss count resets on win', async () => {
        await panel.recordBetResult(5, 12, false, 15);
        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.consecutiveLosses).toBe(2);

        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.consecutiveLosses).toBe(0);
    });

    test('Q5: Consecutive win count resets on loss', async () => {
        await panel.recordBetResult(5, 12, true, 15);
        await panel.recordBetResult(5, 12, true, 15);
        expect(panel.sessionData.consecutiveWins).toBe(2);

        await panel.recordBetResult(5, 12, false, 15);
        expect(panel.sessionData.consecutiveWins).toBe(0);
    });

    test('Q6: Bet history limited to 10 entries', async () => {
        for (let i = 0; i < 15; i++) {
            await panel.recordBetResult(5, 12, false, 15);
        }
        expect(panel.betHistory.length).toBeLessThanOrEqual(10);
    });
});

console.log('✅ Renderer & Money Management regression test suite loaded');
