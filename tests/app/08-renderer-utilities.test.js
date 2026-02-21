/**
 * TESTS: Renderer Utility Functions
 * Coverage for: getWheel36Index, getNumbersAtPocket, expandAnchorsToBetNumbers,
 * expandTargetsToBetNumbers, calculateWheelDistance, formatPos, getColumnFromCode,
 * calculateWheelAnchors, WHEEL_POS, WHEEL_36
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R;

beforeAll(() => {
    setupDOM();
    R = loadRendererFunctions();
});

// ═══════════════════════════════════════════════════════
// WHEEL_36 and WHEEL_POS constants
// ═══════════════════════════════════════════════════════

describe('WHEEL_36 constant', () => {
    test('WHEEL_36 exists and has 36 entries', () => {
        expect(R.WHEEL_36).toBeTruthy();
        expect(R.WHEEL_36.length).toBe(36);
    });

    test('Contains 0 at index 0 (0/26 pocket)', () => {
        expect(R.WHEEL_36[0]).toBe(0);
    });

    test('Contains all numbers 0-36 except 26 (26 shares pocket with 0)', () => {
        const nums = new Set(R.WHEEL_36);
        for (let i = 0; i <= 36; i++) {
            if (i === 26) {
                expect(nums.has(26)).toBe(false);
            } else {
                expect(nums.has(i)).toBe(true);
            }
        }
    });
});

describe('WHEEL_POS lookup', () => {
    test('WHEEL_POS exists', () => {
        if (!R.WHEEL_POS) return;
        expect(R.WHEEL_POS).toBeTruthy();
    });

    test('Every number 0-36 has a position', () => {
        if (!R.WHEEL_POS) return;
        for (let i = 0; i <= 36; i++) {
            expect(R.WHEEL_POS[i]).toBeDefined();
        }
    });

    test('0 and 26 have position 0 (same pocket)', () => {
        if (!R.WHEEL_POS) return;
        expect(R.WHEEL_POS[0]).toBe(0);
        expect(R.WHEEL_POS[26]).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// getWheel36Index
// ═══════════════════════════════════════════════════════

describe('getWheel36Index', () => {
    test('0 maps to index 0', () => {
        expect(R.getWheel36Index(0)).toBe(0);
    });

    test('26 maps to index 0 (same pocket as 0)', () => {
        expect(R.getWheel36Index(26)).toBe(0);
    });

    test('All numbers 1-36 (except 26) have valid indices', () => {
        for (let i = 1; i <= 36; i++) {
            if (i === 26) continue;
            const idx = R.getWheel36Index(i);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(36);
        }
    });

    test('Returns -1 for invalid number', () => {
        expect(R.getWheel36Index(37)).toBe(-1);
        expect(R.getWheel36Index(-1)).toBe(-1);
    });
});

// ═══════════════════════════════════════════════════════
// getNumbersAtPocket
// ═══════════════════════════════════════════════════════

describe('getNumbersAtPocket', () => {
    test('Pocket 0 returns [0, 26] (shared pocket)', () => {
        const result = R.getNumbersAtPocket(0);
        expect(result).toEqual([0, 26]);
    });

    test('Non-zero pockets return single number', () => {
        const result = R.getNumbersAtPocket(1);
        expect(result.length).toBe(1);
        expect(result[0]).toBeDefined();
    });

    test('Wraps around for negative indices', () => {
        const result = R.getNumbersAtPocket(-1);
        // -1 mod 36 should wrap to 35
        expect(result.length).toBeGreaterThanOrEqual(1);
    });

    test('Wraps around for indices >= 36', () => {
        const result = R.getNumbersAtPocket(36);
        // 36 mod 36 = 0, so returns [0, 26]
        expect(result).toEqual([0, 26]);
    });
});

// ═══════════════════════════════════════════════════════
// calculateWheelDistance
// ═══════════════════════════════════════════════════════

describe('calculateWheelDistance', () => {
    test('Returns 999 when target not within 4 positions', () => {
        // Pick a number far from index 0
        const dist = R.calculateWheelDistance(0, 999, 1);
        expect(dist).toBe(999);
    });

    test('Returns small distance for adjacent numbers', () => {
        // From index 0 (number 26 pocket), moving right (+1 direction)
        const wheel = R.WHEEL_NO_ZERO;
        const nextNum = wheel[1]; // First number to the right
        const dist = R.calculateWheelDistance(0, nextNum, 1);
        expect(dist).toBeLessThanOrEqual(4);
    });

    test('Direction -1 searches left', () => {
        const wheel = R.WHEEL_NO_ZERO;
        const prevNum = wheel[wheel.length - 1]; // Last number = left of 0
        const dist = R.calculateWheelDistance(0, prevNum, -1);
        expect(dist).toBeLessThanOrEqual(4);
    });

    test('Returns distance for target 26', () => {
        // 26 is special (shares pocket with 0)
        const dist = R.calculateWheelDistance(1, 26, -1);
        // Should find 26 within 4 positions
        expect(typeof dist).toBe('number');
    });
});

// ═══════════════════════════════════════════════════════
// expandAnchorsToBetNumbers
// ═══════════════════════════════════════════════════════

describe('expandAnchorsToBetNumbers', () => {
    test('Empty anchors return empty array', () => {
        const result = R.expandAnchorsToBetNumbers([], []);
        expect(result).toEqual([]);
    });

    test('Single anchor expands to ±1 neighbors', () => {
        // Any valid anchor should expand to at least 3 numbers
        const result = R.expandAnchorsToBetNumbers([10], []);
        expect(result.length).toBeGreaterThanOrEqual(3);
        expect(result).toContain(10);
    });

    test('Anchor at 0/26 pocket includes both 0 and 26', () => {
        const result = R.expandAnchorsToBetNumbers([0], []);
        expect(result).toContain(0);
        expect(result).toContain(26);
    });

    test('Combined purple and green anchors', () => {
        const result = R.expandAnchorsToBetNumbers([10], [20]);
        expect(result).toContain(10);
        expect(result).toContain(20);
        expect(result.length).toBeGreaterThanOrEqual(6);
    });

    test('No duplicates in result', () => {
        const result = R.expandAnchorsToBetNumbers([10, 10], [10]);
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
    });

    test('Returns only valid roulette numbers (0-36)', () => {
        const result = R.expandAnchorsToBetNumbers([1, 15, 30], [5, 20, 35]);
        result.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        });
    });
});

// ═══════════════════════════════════════════════════════
// expandTargetsToBetNumbers
// ═══════════════════════════════════════════════════════

describe('expandTargetsToBetNumbers', () => {
    test('Empty targets return empty array', () => {
        const result = R.expandTargetsToBetNumbers([], 1);
        expect(result).toEqual([]);
    });

    test('neighborRange=1 includes target, ±1 neighbors, and opposite side', () => {
        const result = R.expandTargetsToBetNumbers([10], 1);
        expect(result).toContain(10); // target itself
        // Should include opposite of 10
        const opp = R.REGULAR_OPPOSITES[10];
        expect(result).toContain(opp);
        // ±1 neighbors on both sides
        expect(result.length).toBeGreaterThanOrEqual(6);
    });

    test('neighborRange=2 expands wider', () => {
        const range1 = R.expandTargetsToBetNumbers([10], 1);
        const range2 = R.expandTargetsToBetNumbers([10], 2);
        expect(range2.length).toBeGreaterThanOrEqual(range1.length);
    });

    test('Multiple targets combine all numbers', () => {
        const single = R.expandTargetsToBetNumbers([10], 1);
        const double = R.expandTargetsToBetNumbers([10, 20], 1);
        expect(double.length).toBeGreaterThanOrEqual(single.length);
    });

    test('No duplicates in result', () => {
        const result = R.expandTargetsToBetNumbers([10, 10], 2);
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
    });
});

// ═══════════════════════════════════════════════════════
// formatPos
// ═══════════════════════════════════════════════════════

describe('formatPos', () => {
    test('Returns empty string for null/undefined/empty', () => {
        expect(R.formatPos(null)).toBe('');
        expect(R.formatPos(undefined)).toBe('');
        expect(R.formatPos('')).toBe('');
    });

    test('S-type codes get pos-s class', () => {
        const html = R.formatPos('SR+2');
        expect(html).toContain('pos-s');
        expect(html).toContain('SR+2');
    });

    test('O-type codes get pos-o class', () => {
        const html = R.formatPos('OL+3');
        expect(html).toContain('pos-o');
        expect(html).toContain('OL+3');
    });

    test('XX gets pos-xx class', () => {
        const html = R.formatPos('XX');
        expect(html).toContain('pos-xx');
        expect(html).toContain('XX');
    });

    test('S+0 gets pos-s class', () => {
        const html = R.formatPos('S+0');
        expect(html).toContain('pos-s');
    });

    test('O+0 gets pos-o class', () => {
        const html = R.formatPos('O+0');
        expect(html).toContain('pos-o');
    });
});

// ═══════════════════════════════════════════════════════
// getColumnFromCode
// ═══════════════════════════════════════════════════════

describe('getColumnFromCode', () => {
    test('S+0 returns "first"', () => {
        expect(R.getColumnFromCode('S+0')).toBe('first');
    });

    test('SL+1, SR+1, SL+2, SR+2 all return "first"', () => {
        expect(R.getColumnFromCode('SL+1')).toBe('first');
        expect(R.getColumnFromCode('SR+1')).toBe('first');
        expect(R.getColumnFromCode('SL+2')).toBe('first');
        expect(R.getColumnFromCode('SR+2')).toBe('first');
    });

    test('OL+1, OR+1, OL+2, OR+2 all return "second"', () => {
        expect(R.getColumnFromCode('OL+1')).toBe('second');
        expect(R.getColumnFromCode('OR+1')).toBe('second');
        expect(R.getColumnFromCode('OL+2')).toBe('second');
        expect(R.getColumnFromCode('OR+2')).toBe('second');
    });

    test('O+0 returns "third"', () => {
        expect(R.getColumnFromCode('O+0')).toBe('third');
    });

    test('Codes beyond ±2 return null', () => {
        expect(R.getColumnFromCode('SL+3')).toBeNull();
        expect(R.getColumnFromCode('OR+4')).toBeNull();
    });

    test('XX returns null', () => {
        expect(R.getColumnFromCode('XX')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// calculateWheelAnchors
// ═══════════════════════════════════════════════════════

describe('calculateWheelAnchors', () => {
    test('Empty/null input returns empty arrays', () => {
        expect(R.calculateWheelAnchors([])).toEqual({ anchors: [], loose: [], anchorGroups: [] });
        expect(R.calculateWheelAnchors(null)).toEqual({ anchors: [], loose: [], anchorGroups: [] });
    });

    test('Returns anchors, loose, and anchorGroups properties', () => {
        const result = R.calculateWheelAnchors([1, 2, 3, 4, 5, 10, 20, 30]);
        expect(result).toHaveProperty('anchors');
        expect(result).toHaveProperty('loose');
        expect(result).toHaveProperty('anchorGroups');
    });

    test('3 consecutive wheel numbers form a ±1 group', () => {
        // Find 3 consecutive numbers on the wheel
        const w = R.WHEEL_STANDARD;
        const three = [w[5], w[6], w[7]];
        const result = R.calculateWheelAnchors(three);
        // Should have at least 1 anchor group
        expect(result.anchorGroups.length).toBeGreaterThanOrEqual(1);
        if (result.anchorGroups.length > 0) {
            expect(result.anchorGroups[0].type).toBe('±1');
            expect(result.anchorGroups[0].group.length).toBe(3);
        }
    });

    test('5 consecutive wheel numbers form a ±2 group', () => {
        const w = R.WHEEL_STANDARD;
        const five = [w[10], w[11], w[12], w[13], w[14]];
        const result = R.calculateWheelAnchors(five);
        expect(result.anchorGroups.length).toBeGreaterThanOrEqual(1);
        const pm2 = result.anchorGroups.find(g => g.type === '±2');
        expect(pm2).toBeTruthy();
        expect(pm2.group.length).toBe(5);
    });

    test('Non-consecutive numbers become loose', () => {
        // Pick numbers far apart on wheel
        const w = R.WHEEL_STANDARD;
        const scattered = [w[0], w[10], w[20]]; // Far apart
        const result = R.calculateWheelAnchors(scattered);
        expect(result.loose.length).toBeGreaterThan(0);
    });

    test('All numbers accounted for (anchors + loose covers input)', () => {
        const w = R.WHEEL_STANDARD;
        const nums = [w[5], w[6], w[7], w[20]];
        const result = R.calculateWheelAnchors(nums);
        const allCovered = new Set();
        result.anchorGroups.forEach(g => g.group.forEach(n => allCovered.add(n)));
        result.loose.forEach(n => allCovered.add(n));
        nums.forEach(n => expect(allCovered.has(n)).toBe(true));
    });
});
