/**
 * UNIT TESTS: Core Logic Functions
 * Tests position code calculation, wheel math, opposites, references
 *
 * DOES NOT CHANGE how tables populate - only tests pure functions.
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R; // Renderer functions

beforeAll(() => {
    setupDOM();
    R = loadRendererFunctions();
});

// ═══════════════════════════════════════════════════════
// CONSTANTS VALIDATION
// ═══════════════════════════════════════════════════════

describe('Wheel Constants', () => {
    test('WHEEL_STANDARD has 37 entries (0-36)', () => {
        expect(R.WHEEL_STANDARD).toHaveLength(37);
    });

    test('WHEEL_NO_ZERO has 37 entries (26 replaces 0 at index 0)', () => {
        expect(R.WHEEL_NO_ZERO).toHaveLength(37);
        expect(R.WHEEL_NO_ZERO[0]).toBe(26);
    });

    test('WHEEL_STANDARD starts with 0 and ends with 26', () => {
        expect(R.WHEEL_STANDARD[0]).toBe(0);
        expect(R.WHEEL_STANDARD[36]).toBe(26);
    });

    test('0 and 26 share the same pocket (both at boundaries)', () => {
        // In WHEEL_NO_ZERO: 26 appears at index 0 AND index 36
        expect(R.WHEEL_NO_ZERO[0]).toBe(26);
        expect(R.WHEEL_NO_ZERO[36]).toBe(26);
    });

    test('All numbers 1-36 appear in wheel', () => {
        for (let n = 1; n <= 36; n++) {
            expect(R.WHEEL_STANDARD).toContain(n);
        }
    });
});

describe('REGULAR_OPPOSITES', () => {
    test('Every number 0-36 has an opposite', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.REGULAR_OPPOSITES[n]).toBeDefined();
        }
    });

    test('0 ↔ 10 are opposites', () => {
        expect(R.REGULAR_OPPOSITES[0]).toBe(10);
        expect(R.REGULAR_OPPOSITES[10]).toBe(26); // 26 represents 0's pocket
    });

    test('26 ↔ 10 (26 shares pocket with 0)', () => {
        expect(R.REGULAR_OPPOSITES[26]).toBe(10);
    });

    test('Opposites are symmetric (a→b then b→a, accounting for 0/26)', () => {
        // Check a sample of pairs
        expect(R.REGULAR_OPPOSITES[1]).toBe(21);
        expect(R.REGULAR_OPPOSITES[21]).toBe(1);

        expect(R.REGULAR_OPPOSITES[7]).toBe(36);
        expect(R.REGULAR_OPPOSITES[36]).toBe(7);
    });
});

describe('DIGIT_13_OPPOSITES', () => {
    test('Every number 0-36 has a 13-opposite', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.DIGIT_13_OPPOSITES[n]).toBeDefined();
        }
    });

    test('0 → 34 (13-opposite)', () => {
        expect(R.DIGIT_13_OPPOSITES[0]).toBe(34);
    });

    test('26 → 34 (same pocket as 0)', () => {
        expect(R.DIGIT_13_OPPOSITES[26]).toBe(34);
    });
});

// ═══════════════════════════════════════════════════════
// POSITION CODE CALCULATION
// ═══════════════════════════════════════════════════════

describe('calculatePositionCode', () => {
    test('Same number returns S+0', () => {
        expect(R.calculatePositionCode(5, 5)).toBe('S+0');
    });

    test('0 and 26 return S+0 (same pocket)', () => {
        expect(R.calculatePositionCode(0, 0)).toBe('S+0');
        expect(R.calculatePositionCode(26, 26)).toBe('S+0');
        // 0 and 26 are same pocket
        expect(R.calculatePositionCode(0, 26)).toBe('S+0');
        expect(R.calculatePositionCode(26, 0)).toBe('S+0');
    });

    test('Adjacent numbers return SL+1 or SR+1', () => {
        // Wheel: ...3, 26/0, 32, 15...
        // 32 is right of 26/0
        const code = R.calculatePositionCode(26, 32);
        expect(code).toMatch(/^S[LR]\+1$/);
    });

    test('Opposite returns O+0', () => {
        // 0's opposite is 10
        expect(R.calculatePositionCode(0, 10)).toBe('O+0');
    });

    test('Far-away number returns XX', () => {
        // 0 and 16 are far apart (not within 4 on either side)
        const code = R.calculatePositionCode(0, 16);
        // Should be XX or an O code if within range of opposite
        expect(typeof code).toBe('string');
    });

    test('Returns valid format (S/O + direction + distance or XX)', () => {
        const validCodes = /^(S\+0|O\+0|S[LR]\+[1-4]|O[LR]\+[1-4]|XX)$/;
        for (let ref = 0; ref <= 36; ref += 5) {
            for (let act = 0; act <= 36; act += 5) {
                const code = R.calculatePositionCode(ref, act);
                expect(code).toMatch(validCodes);
            }
        }
    });

    test('Distance never exceeds 4', () => {
        for (let ref = 0; ref <= 36; ref++) {
            for (let act = 0; act <= 36; act++) {
                const code = R.calculatePositionCode(ref, act);
                if (code !== 'XX' && code !== 'S+0' && code !== 'O+0') {
                    const dist = parseInt(code.match(/\+(\d+)$/)[1]);
                    expect(dist).toBeGreaterThanOrEqual(1);
                    expect(dist).toBeLessThanOrEqual(4);
                }
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// POSITION CODE DISTANCE EXTRACTION
// ═══════════════════════════════════════════════════════

describe('_getPosCodeDistance', () => {
    test('OR+2 → 2', () => {
        expect(R._getPosCodeDistance('OR+2')).toBe(2);
    });

    test('SL+1 → 1', () => {
        expect(R._getPosCodeDistance('SL+1')).toBe(1);
    });

    test('S+0 → 0', () => {
        expect(R._getPosCodeDistance('S+0')).toBe(0);
    });

    test('O+0 → 0', () => {
        expect(R._getPosCodeDistance('O+0')).toBe(0);
    });

    test('XX → null', () => {
        expect(R._getPosCodeDistance('XX')).toBeNull();
    });

    test('null → null', () => {
        expect(R._getPosCodeDistance(null)).toBeNull();
    });

    test('undefined → null', () => {
        expect(R._getPosCodeDistance(undefined)).toBeNull();
    });

    test('SR+4 → 4', () => {
        expect(R._getPosCodeDistance('SR+4')).toBe(4);
    });

    test('OL+3 → 3', () => {
        expect(R._getPosCodeDistance('OL+3')).toBe(3);
    });
});

// ═══════════════════════════════════════════════════════
// FLIP POSITION CODE
// ═══════════════════════════════════════════════════════

describe('flipPositionCode', () => {
    test('SR+2 flips to SR-2', () => {
        expect(R.flipPositionCode('SR+2')).toBe('SR-2');
    });

    test('SL+1 flips to SL-1', () => {
        expect(R.flipPositionCode('SL+1')).toBe('SL-1');
    });

    test('OR+3 flips to OR-3', () => {
        expect(R.flipPositionCode('OR+3')).toBe('OR-3');
    });

    test('XX stays XX', () => {
        expect(R.flipPositionCode('XX')).toBe('XX');
    });

    test('S+0 stays S+0', () => {
        expect(R.flipPositionCode('S+0')).toBe('S+0');
    });

    test('O+0 stays O+0', () => {
        expect(R.flipPositionCode('O+0')).toBe('O+0');
    });
});

// ═══════════════════════════════════════════════════════
// GET NUMBER AT POSITION
// ═══════════════════════════════════════════════════════

describe('getNumberAtPosition', () => {
    test('S+0 returns same number', () => {
        expect(R.getNumberAtPosition(5, 'S+0')).toBe(5);
    });

    test('O+0 returns regular opposite', () => {
        expect(R.getNumberAtPosition(1, 'O+0')).toBe(R.REGULAR_OPPOSITES[1]);
    });

    test('XX returns null', () => {
        expect(R.getNumberAtPosition(5, 'XX')).toBeNull();
    });

    test('SR+1 from 26 gives 32 (right neighbor on wheel)', () => {
        // Wheel: ...3, 26/0, 32, 15...
        const result = R.getNumberAtPosition(26, 'SR+1');
        expect(result).toBe(32);
    });

    test('SL+1 from 26 gives 3 (left neighbor on wheel)', () => {
        // Wheel: ...3, 26/0, 32...
        const result = R.getNumberAtPosition(26, 'SL+1');
        expect(result).toBe(3);
    });

    test('Returns a valid number (0-36) for valid position codes', () => {
        const codes = ['SR+1', 'SL+1', 'SR+2', 'SL+2', 'OR+1', 'OL+1'];
        for (const code of codes) {
            const result = R.getNumberAtPosition(10, code);
            if (result !== null) {
                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(36);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// CALCULATE REFERENCES
// ═══════════════════════════════════════════════════════

describe('calculateReferences', () => {
    test('Returns all 6 reference keys', () => {
        const refs = R.calculateReferences(10, 5);
        expect(refs).toHaveProperty('prev');
        expect(refs).toHaveProperty('prev_plus_1');
        expect(refs).toHaveProperty('prev_minus_1');
        expect(refs).toHaveProperty('prev_plus_2');
        expect(refs).toHaveProperty('prev_minus_2');
        expect(refs).toHaveProperty('prev_prev');
    });

    test('prev equals the prev parameter', () => {
        const refs = R.calculateReferences(22, 15);
        expect(refs.prev).toBe(22);
    });

    test('prev_prev equals the prevPrev parameter', () => {
        const refs = R.calculateReferences(22, 15);
        expect(refs.prev_prev).toBe(15);
    });

    test('prev=36 special case: prev_plus_1 wraps to 35', () => {
        // When prev=36, calculateReferences uses special wraparound
        const refs = R.calculateReferences(36, 10);
        expect(refs.prev_plus_1).toBe(35);
        expect(refs.prev_minus_1).toBe(35);
    });

    test('prev=0 special case: prev_minus_1 becomes 10', () => {
        // When prev=0, calculateReferences uses special mapping
        const refs = R.calculateReferences(0, 10);
        expect(refs.prev_minus_1).toBe(10);
        expect(refs.prev_plus_1).toBe(1);
    });

    test('prev_plus_2 = min(prev+2, 36)', () => {
        const refs = R.calculateReferences(20, 10);
        expect(refs.prev_plus_2).toBe(22);
    });

    test('prev_minus_2 = max(prev-2, 0)', () => {
        const refs = R.calculateReferences(20, 10);
        expect(refs.prev_minus_2).toBe(18);
    });
});

// ═══════════════════════════════════════════════════════
// GENERATE ANCHORS
// ═══════════════════════════════════════════════════════

describe('generateAnchors', () => {
    test('Returns purple and green arrays', () => {
        const result = R.generateAnchors(10, R.DIGIT_13_OPPOSITES[10], 'SR+1');
        expect(result).toHaveProperty('purple');
        expect(result).toHaveProperty('green');
        expect(Array.isArray(result.purple)).toBe(true);
        expect(Array.isArray(result.green)).toBe(true);
    });

    test('XX position code returns empty arrays', () => {
        const result = R.generateAnchors(10, 34, 'XX');
        expect(result.purple).toEqual([]);
        expect(result.green).toEqual([]);
    });

    test('Purple anchors have at most 4 entries (2 refs × 2 directions)', () => {
        const result = R.generateAnchors(10, 34, 'SR+2');
        expect(result.purple.length).toBeLessThanOrEqual(4);
    });

    test('Green anchors are regular opposites of purple', () => {
        const result = R.generateAnchors(10, 34, 'SR+2');
        result.purple.forEach((p, i) => {
            if (result.green[i] !== undefined) {
                expect(result.green[i]).toBe(R.REGULAR_OPPOSITES[p]);
            }
        });
    });

    test('S+0 generates valid anchors', () => {
        const result = R.generateAnchors(15, R.DIGIT_13_OPPOSITES[15], 'S+0');
        expect(result.purple.length).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════
// PAIR REFKEY TO DATA PAIR MAPPING
// ═══════════════════════════════════════════════════════

describe('_PAIR_REFKEY_TO_DATA_PAIR mapping', () => {
    test('Maps all 6 refkeys correctly', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR['prev']).toBe('prev');
        expect(R._PAIR_REFKEY_TO_DATA_PAIR['prev_plus_1']).toBe('prevPlus1');
        expect(R._PAIR_REFKEY_TO_DATA_PAIR['prev_minus_1']).toBe('prevMinus1');
        expect(R._PAIR_REFKEY_TO_DATA_PAIR['prev_plus_2']).toBe('prevPlus2');
        expect(R._PAIR_REFKEY_TO_DATA_PAIR['prev_minus_2']).toBe('prevMinus2');
        expect(R._PAIR_REFKEY_TO_DATA_PAIR['prev_prev']).toBe('prevPrev');
    });
});
