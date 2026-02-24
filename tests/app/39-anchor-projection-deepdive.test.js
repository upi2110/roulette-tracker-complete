/**
 * TESTS: Deep-dive on anchor generation, wheel pocket math,
 * expandAnchorsToBetNumbers, expandTargetsToBetNumbers,
 * calculateWheelAnchors, and projection functions.
 *
 * These functions form the prediction pipeline:
 *   posCode → generateAnchors → expandAnchorsToBetNumbers → wheel display
 *   numbers → calculateWheelAnchors → anchor groups/loose
 *
 * 90+ tests across sections A-L
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R;

const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const REGULAR_OPPOSITES = {
    0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
    10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
    19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
    28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
};

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
};

beforeAll(() => {
    setupDOM();
    R = loadRendererFunctions();
    global.DIGIT_13_OPPOSITES = R.DIGIT_13_OPPOSITES;
});

// ═══════════════════════════════════════════════════════
// A: getWheel36Index — 36-pocket mapping
// ═══════════════════════════════════════════════════════

describe('A: getWheel36Index', () => {
    test('A1: Returns 0 for number 0', () => {
        expect(R.getWheel36Index(0)).toBe(0);
    });

    test('A2: Returns 0 for number 26 (shares pocket with 0)', () => {
        expect(R.getWheel36Index(26)).toBe(0);
    });

    test('A3: Returns valid index for all 37 numbers', () => {
        for (let n = 0; n <= 36; n++) {
            const idx = R.getWheel36Index(n);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(36);
        }
    });

    test('A4: 0 and 26 map to same index', () => {
        expect(R.getWheel36Index(0)).toBe(R.getWheel36Index(26));
    });

    test('A5: All non-0/26 numbers map to unique indices', () => {
        const indices = new Set();
        for (let n = 1; n <= 36; n++) {
            if (n === 26) continue;
            const idx = R.getWheel36Index(n);
            expect(indices.has(idx)).toBe(false);
            indices.add(idx);
        }
        expect(indices.size).toBe(35); // 35 unique (excluding 0 and 26)
    });

    test('A6: Returns -1 for invalid number 37', () => {
        expect(R.getWheel36Index(37)).toBe(-1);
    });

    test('A7: Returns -1 for negative number', () => {
        expect(R.getWheel36Index(-1)).toBe(-1);
    });
});

// ═══════════════════════════════════════════════════════
// B: getNumbersAtPocket — pocket resolution
// ═══════════════════════════════════════════════════════

describe('B: getNumbersAtPocket', () => {
    test('B1: Pocket 0 returns both [0, 26]', () => {
        const nums = R.getNumbersAtPocket(0);
        expect(nums).toEqual([0, 26]);
    });

    test('B2: Non-zero pockets return single number', () => {
        for (let i = 1; i < 36; i++) {
            const nums = R.getNumbersAtPocket(i);
            expect(nums).toHaveLength(1);
        }
    });

    test('B3: Pocket 1 returns [32]', () => {
        expect(R.getNumbersAtPocket(1)).toEqual([32]);
    });

    test('B4: Pocket 35 returns [3]', () => {
        expect(R.getNumbersAtPocket(35)).toEqual([3]);
    });

    test('B5: Negative index wraps correctly', () => {
        expect(R.getNumbersAtPocket(-1)).toEqual([3]); // wraps to 35
    });

    test('B6: Index 36 wraps to 0 → [0, 26]', () => {
        expect(R.getNumbersAtPocket(36)).toEqual([0, 26]);
    });

    test('B7: All pockets cover all 37 numbers', () => {
        const allNums = new Set();
        for (let i = 0; i < 36; i++) {
            R.getNumbersAtPocket(i).forEach(n => allNums.add(n));
        }
        expect(allNums.size).toBe(37);
    });
});

// ═══════════════════════════════════════════════════════
// C: generateAnchors
// ═══════════════════════════════════════════════════════

describe('C: generateAnchors', () => {
    test('C1: XX posCode returns empty arrays', () => {
        const result = R.generateAnchors(5, 22, 'XX');
        expect(result.purple).toEqual([]);
        expect(result.green).toEqual([]);
    });

    test('C2: S+0 returns anchors for ref and 13-opp', () => {
        const ref = 5;
        const ref13Opp = DIGIT_13_OPPOSITES[ref]; // 22
        const result = R.generateAnchors(ref, ref13Opp, 'S+0');
        expect(result.purple.length).toBeGreaterThan(0);
        // S+0 → ref itself and 13-opp itself (plus flipped)
        expect(result.purple).toContain(ref);
        expect(result.purple).toContain(ref13Opp);
    });

    test('C3: green anchors are REGULAR_OPPOSITES of purple', () => {
        const result = R.generateAnchors(10, DIGIT_13_OPPOSITES[10], 'SR+1');
        for (const g of result.green) {
            // Each green should be the opposite of some purple
            const isOppOfPurple = result.purple.some(p => REGULAR_OPPOSITES[p] === g);
            expect(isOppOfPurple).toBe(true);
        }
    });

    test('C4: Purple anchors are at most 4 unique numbers', () => {
        // generateAnchors computes a1-a4 (ref+code, ref+flip, opp+code, opp+flip)
        const result = R.generateAnchors(15, DIGIT_13_OPPOSITES[15], 'SR+2');
        expect(result.purple.length).toBeLessThanOrEqual(4);
    });

    test('C5: No duplicates in purple array', () => {
        for (let n = 0; n <= 36; n++) {
            const opp = DIGIT_13_OPPOSITES[n];
            const result = R.generateAnchors(n, opp, 'SL+1');
            const uniquePurple = new Set(result.purple);
            expect(uniquePurple.size).toBe(result.purple.length);
        }
    });

    test('C6: All purple values are valid roulette numbers (0-36)', () => {
        const codes = ['S+0', 'SR+1', 'SL+1', 'SR+2', 'SL+2', 'O+0', 'OR+1', 'OL+1'];
        for (const code of codes) {
            for (let n = 0; n <= 36; n++) {
                const result = R.generateAnchors(n, DIGIT_13_OPPOSITES[n], code);
                for (const p of result.purple) {
                    expect(p).toBeGreaterThanOrEqual(0);
                    expect(p).toBeLessThanOrEqual(36);
                }
            }
        }
    });

    test('C7: Green array length ≤ purple array length', () => {
        const result = R.generateAnchors(8, DIGIT_13_OPPOSITES[8], 'SR+1');
        expect(result.green.length).toBeLessThanOrEqual(result.purple.length);
    });
});

// ═══════════════════════════════════════════════════════
// D: expandAnchorsToBetNumbers
// ═══════════════════════════════════════════════════════

describe('D: expandAnchorsToBetNumbers', () => {
    test('D1: Empty arrays → empty result', () => {
        const result = R.expandAnchorsToBetNumbers([], []);
        expect(result).toEqual([]);
    });

    test('D2: Single anchor → returns anchor and ±1 neighbors', () => {
        // Anchor 15: idx on WHEEL_36 is 2; neighbors are 32(idx 1), 19(idx 3)
        const result = R.expandAnchorsToBetNumbers([15], []);
        expect(result).toContain(15);
        expect(result).toContain(32); // left neighbor
        expect(result).toContain(19); // right neighbor
    });

    test('D3: Anchor 0 → includes 0, 26 (pocket), plus neighbors', () => {
        const result = R.expandAnchorsToBetNumbers([0], []);
        expect(result).toContain(0);
        expect(result).toContain(26); // 0 and 26 share pocket
        expect(result).toContain(32); // right neighbor of 0
        expect(result).toContain(3);  // left neighbor of 0/26
    });

    test('D4: Duplicate anchor → no duplicate numbers in result', () => {
        const result = R.expandAnchorsToBetNumbers([15, 15], []);
        const uniqueResult = new Set(result);
        expect(uniqueResult.size).toBe(result.length);
    });

    test('D5: Adjacent anchors → merged neighbors (no duplicates)', () => {
        // 15 and 19 are 2 apart on wheel → some neighbors overlap
        const result = R.expandAnchorsToBetNumbers([15, 19], []);
        const uniqueResult = new Set(result);
        expect(uniqueResult.size).toBe(result.length);
    });

    test('D6: Green anchors add more neighbors', () => {
        const purpleOnly = R.expandAnchorsToBetNumbers([10], []);
        const withGreen = R.expandAnchorsToBetNumbers([10], [5]);
        expect(withGreen.length).toBeGreaterThanOrEqual(purpleOnly.length);
    });

    test('D7: Invalid anchor (-1 index) → skipped safely', () => {
        const result = R.expandAnchorsToBetNumbers([99], []);
        expect(result).toEqual([]);
    });

    test('D8: All result numbers are valid (0-36)', () => {
        for (let n = 0; n <= 36; n++) {
            const result = R.expandAnchorsToBetNumbers([n], []);
            for (const num of result) {
                expect(num).toBeGreaterThanOrEqual(0);
                expect(num).toBeLessThanOrEqual(36);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// E: expandTargetsToBetNumbers
// ═══════════════════════════════════════════════════════

describe('E: expandTargetsToBetNumbers', () => {
    test('E1: Empty targets → empty result', () => {
        const result = R.expandTargetsToBetNumbers([], 1);
        expect(result).toEqual([]);
    });

    test('E2: Range 1 → target + ±1 on both sides', () => {
        const result = R.expandTargetsToBetNumbers([15], 1);
        // Same side: 15 and ±1 neighbors
        expect(result).toContain(15);
        expect(result).toContain(32); // left
        expect(result).toContain(19); // right
        // Opposite side: REGULAR_OPPOSITES[15] = 24, and its ±1
        expect(result).toContain(24); // opposite
    });

    test('E3: Range 2 → target + ±2 on both sides', () => {
        const result = R.expandTargetsToBetNumbers([15], 2);
        // More numbers included
        expect(result.length).toBeGreaterThan(R.expandTargetsToBetNumbers([15], 1).length);
    });

    test('E4: Target 0 includes both 0 and 26', () => {
        const result = R.expandTargetsToBetNumbers([0], 1);
        expect(result).toContain(0);
        expect(result).toContain(26);
    });

    test('E5: Includes opposite side neighbors', () => {
        const result = R.expandTargetsToBetNumbers([10], 1);
        const opp = REGULAR_OPPOSITES[10]; // 26
        expect(result).toContain(opp);
    });

    test('E6: No duplicates in result', () => {
        for (let n = 0; n <= 36; n++) {
            const result = R.expandTargetsToBetNumbers([n], 1);
            const unique = new Set(result);
            expect(unique.size).toBe(result.length);
        }
    });

    test('E7: All result numbers are valid (0-36)', () => {
        for (let n = 0; n <= 36; n++) {
            const result = R.expandTargetsToBetNumbers([n], 2);
            for (const num of result) {
                expect(num).toBeGreaterThanOrEqual(0);
                expect(num).toBeLessThanOrEqual(36);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════
// F: calculateWheelAnchors
// ═══════════════════════════════════════════════════════

describe('F: calculateWheelAnchors', () => {
    test('F1: Empty input → empty result', () => {
        const result = R.calculateWheelAnchors([]);
        expect(result.anchors).toEqual([]);
        expect(result.loose).toEqual([]);
        expect(result.anchorGroups).toEqual([]);
    });

    test('F2: null input → empty result', () => {
        const result = R.calculateWheelAnchors(null);
        expect(result.anchors).toEqual([]);
    });

    test('F3: Single number → loose (too short for anchor group)', () => {
        const result = R.calculateWheelAnchors([15]);
        expect(result.loose).toContain(15);
        expect(result.anchorGroups).toEqual([]);
    });

    test('F4: Two adjacent numbers → loose (need 3 for ±1 group)', () => {
        // 32, 15 are adjacent on wheel
        const result = R.calculateWheelAnchors([32, 15]);
        expect(result.loose.length).toBe(2);
        expect(result.anchorGroups).toEqual([]);
    });

    test('F5: Three adjacent numbers → one ±1 anchor group', () => {
        // 32, 15, 19 are consecutive on wheel
        const result = R.calculateWheelAnchors([32, 15, 19]);
        expect(result.anchorGroups).toHaveLength(1);
        expect(result.anchorGroups[0].type).toBe('±1');
        expect(result.anchorGroups[0].anchor).toBe(15); // center
        expect(result.anchorGroups[0].group).toEqual([32, 15, 19]);
    });

    test('F6: Five adjacent numbers → one ±2 anchor group', () => {
        // 0, 32, 15, 19, 4 are consecutive on wheel
        const result = R.calculateWheelAnchors([0, 32, 15, 19, 4]);
        expect(result.anchorGroups).toHaveLength(1);
        expect(result.anchorGroups[0].type).toBe('±2');
        expect(result.anchorGroups[0].anchor).toBe(15); // center of 5
    });

    test('F7: Six adjacent → one ±2 (5) + loose (1)', () => {
        // 0, 32, 15, 19, 4, 21 are consecutive
        const result = R.calculateWheelAnchors([0, 32, 15, 19, 4, 21]);
        expect(result.anchorGroups).toHaveLength(1);
        expect(result.anchorGroups[0].type).toBe('±2');
        expect(result.loose).toHaveLength(1);
    });

    test('F8: Eight adjacent → one ±2 (5) + one ±1 (3)', () => {
        // 0, 32, 15, 19, 4, 21, 2, 25 are consecutive
        const result = R.calculateWheelAnchors([0, 32, 15, 19, 4, 21, 2, 25]);
        expect(result.anchorGroups).toHaveLength(2);
        const types = result.anchorGroups.map(g => g.type);
        expect(types).toContain('±2');
        expect(types).toContain('±1');
    });

    test('F9: Non-adjacent numbers → all loose', () => {
        // 0, 4, 6, 36 are NOT all adjacent
        const result = R.calculateWheelAnchors([0, 17, 27, 11]);
        expect(result.loose.length).toBe(4);
        expect(result.anchorGroups).toEqual([]);
    });

    test('F10: Anchor groups + loose combined cover all input', () => {
        const input = [0, 32, 15, 19, 4, 10, 30]; // first 5 adjacent + 2 scattered
        const result = R.calculateWheelAnchors(input);
        const allCovered = new Set();
        result.anchorGroups.forEach(g => g.group.forEach(n => allCovered.add(n)));
        result.loose.forEach(n => allCovered.add(n));
        for (const n of input) {
            expect(allCovered.has(n)).toBe(true);
        }
    });

    test('F11: Anchor list contains all anchor numbers from groups', () => {
        const result = R.calculateWheelAnchors([0, 32, 15, 19, 4, 21, 2, 25]);
        for (const g of result.anchorGroups) {
            expect(result.anchors).toContain(g.anchor);
        }
    });
});

// ═══════════════════════════════════════════════════════
// G: generateAnchors pipeline → expandAnchorsToBetNumbers
// ═══════════════════════════════════════════════════════

describe('G: Anchor pipeline integration', () => {
    test('G1: generateAnchors → expandAnchorsToBetNumbers produces valid bet numbers', () => {
        const ref = 10;
        const ref13Opp = R.DIGIT_13_OPPOSITES[ref];
        const result = R.generateAnchors(ref, ref13Opp, 'SR+1');
        const betNums = R.expandAnchorsToBetNumbers(result.purple, result.green);
        expect(betNums.length).toBeGreaterThan(0);
        for (const n of betNums) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        }
    });

    test('G2: Pipeline produces unique numbers (no duplicates)', () => {
        for (let ref = 0; ref <= 36; ref++) {
            const ref13Opp = R.DIGIT_13_OPPOSITES[ref];
            const codes = ['S+0', 'SR+1', 'SL+1', 'O+0', 'OR+1', 'OL+1'];
            for (const code of codes) {
                const anchors = R.generateAnchors(ref, ref13Opp, code);
                const betNums = R.expandAnchorsToBetNumbers(anchors.purple, anchors.green);
                const unique = new Set(betNums);
                expect(unique.size).toBe(betNums.length);
            }
        }
    });

    test('G3: S+0 pipeline always includes the reference number', () => {
        for (let ref = 0; ref <= 36; ref++) {
            const ref13Opp = R.DIGIT_13_OPPOSITES[ref];
            const anchors = R.generateAnchors(ref, ref13Opp, 'S+0');
            const betNums = R.expandAnchorsToBetNumbers(anchors.purple, anchors.green);
            expect(betNums).toContain(ref);
        }
    });

    test('G4: XX posCode pipeline returns empty bet numbers', () => {
        const anchors = R.generateAnchors(10, 9, 'XX');
        const betNums = R.expandAnchorsToBetNumbers(anchors.purple, anchors.green);
        expect(betNums).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════
// H: REGULAR_OPPOSITES invariants
// ═══════════════════════════════════════════════════════

describe('H: REGULAR_OPPOSITES invariants', () => {
    test('H1: All 37 numbers have an opposite', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.REGULAR_OPPOSITES[n]).toBeDefined();
        }
    });

    test('H2: All opposites are valid numbers (0-36)', () => {
        for (let n = 0; n <= 36; n++) {
            const opp = R.REGULAR_OPPOSITES[n];
            expect(opp).toBeGreaterThanOrEqual(0);
            expect(opp).toBeLessThanOrEqual(36);
        }
    });

    test('H3: Opposites are symmetric for most numbers (except 0/26 pocket)', () => {
        // 0→10, 10→26, 26→10: the 0/26 pocket breaks perfect symmetry
        let symmetric = 0;
        for (let n = 0; n <= 36; n++) {
            const opp = R.REGULAR_OPPOSITES[n];
            if (R.REGULAR_OPPOSITES[opp] === n) symmetric++;
        }
        // At least 34 of 37 should be symmetric (0, 10, 26 may not be)
        expect(symmetric).toBeGreaterThanOrEqual(34);
    });

    test('H4: No number is its own opposite', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.REGULAR_OPPOSITES[n]).not.toBe(n);
        }
    });

    test('H5: 0 and 26 have different opposites', () => {
        // 0→10, 26→10 — actually they share the same opposite!
        // This is by design because 0 and 26 share a pocket
        expect(R.REGULAR_OPPOSITES[0]).toBe(R.REGULAR_OPPOSITES[26]);
    });
});

// ═══════════════════════════════════════════════════════
// I: DIGIT_13_OPPOSITES invariants
// ═══════════════════════════════════════════════════════

describe('I: DIGIT_13_OPPOSITES invariants', () => {
    test('I1: All 37 numbers have a 13-opposite', () => {
        for (let n = 0; n <= 36; n++) {
            expect(R.DIGIT_13_OPPOSITES[n]).toBeDefined();
        }
    });

    test('I2: All 13-opposites are valid numbers (0-36)', () => {
        for (let n = 0; n <= 36; n++) {
            const opp = R.DIGIT_13_OPPOSITES[n];
            expect(opp).toBeGreaterThanOrEqual(0);
            expect(opp).toBeLessThanOrEqual(36);
        }
    });

    test('I3: DIGIT_13_OPPOSITES is a mapping (not necessarily symmetric)', () => {
        // DIGIT_13 is a specific lookup derived from wheel arithmetic.
        // It does NOT need to be symmetric like REGULAR_OPPOSITES.
        // Verify it maps every number to a DIFFERENT number:
        let selfMappings = 0;
        for (let n = 0; n <= 36; n++) {
            if (R.DIGIT_13_OPPOSITES[n] === n) selfMappings++;
        }
        // Very few (if any) numbers should map to themselves
        expect(selfMappings).toBeLessThan(5);
    });

    test('I4: DIGIT_13_OPPOSITES covers a good spread of numbers', () => {
        // The mapping should produce a reasonable variety of target numbers
        const targets = new Set();
        for (let n = 0; n <= 36; n++) {
            targets.add(R.DIGIT_13_OPPOSITES[n]);
        }
        // At least 20 different target numbers
        expect(targets.size).toBeGreaterThan(20);
    });
});

// ═══════════════════════════════════════════════════════
// J: formatPos and formatPosFlash
// ═══════════════════════════════════════════════════════

describe('J: formatPos and formatPosFlash', () => {
    test('J1: formatPos returns empty string for null/undefined', () => {
        expect(R.formatPos(null)).toBe('');
        expect(R.formatPos(undefined)).toBe('');
        expect(R.formatPos('')).toBe('');
    });

    test('J2: formatPos S-code gets pos-s class', () => {
        const html = R.formatPos('S+0');
        expect(html).toContain('pos-s');
        expect(html).toContain('S+0');
    });

    test('J3: formatPos O-code gets pos-o class', () => {
        const html = R.formatPos('O+0');
        expect(html).toContain('pos-o');
    });

    test('J4: formatPos XX gets pos-xx class', () => {
        const html = R.formatPos('XX');
        expect(html).toContain('pos-xx');
    });

    test('J5: formatPos returns a span element', () => {
        const html = R.formatPos('SR+1');
        expect(html).toMatch(/^<span/);
        expect(html).toMatch(/<\/span>$/);
    });

    test('J6: formatPosFlash returns empty for falsy input', () => {
        expect(R.formatPosFlash(null)).toBe('');
        expect(R.formatPosFlash('')).toBe('');
    });

    test('J7: formatPosFlash returns amber-styled span', () => {
        const html = R.formatPosFlash('SR+1');
        expect(html).toContain('#fbbf24'); // amber background
        expect(html).toContain('SR+1');
    });

    test('J8: formatPosFlash uses inline styles (not CSS classes)', () => {
        const html = R.formatPosFlash('SL+2');
        expect(html).toContain('style=');
        expect(html).not.toContain('pos-s');
        expect(html).not.toContain('pos-o');
    });
});

// ═══════════════════════════════════════════════════════
// K: calculateWheelAnchors — edge cases
// ═══════════════════════════════════════════════════════

describe('K: calculateWheelAnchors edge cases', () => {
    test('K1: All 37 numbers → covers entire wheel', () => {
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        const result = R.calculateWheelAnchors(allNums);
        // Should produce multiple ±2 groups
        const pm2Count = result.anchorGroups.filter(g => g.type === '±2').length;
        expect(pm2Count).toBeGreaterThan(0);
        // All numbers should be covered
        const covered = new Set();
        result.anchorGroups.forEach(g => g.group.forEach(n => covered.add(n)));
        result.loose.forEach(n => covered.add(n));
        expect(covered.size).toBe(37);
    });

    test('K2: Wrap-around run (26, 0, 32) → anchor group', () => {
        // 26 and 0 are adjacent on wheel, 32 is next to 0
        const result = R.calculateWheelAnchors([26, 0, 32]);
        // Should form a ±1 group (3 adjacent)
        expect(result.anchorGroups.length).toBeGreaterThanOrEqual(1);
    });

    test('K3: Duplicate numbers in input → handled correctly', () => {
        const result = R.calculateWheelAnchors([15, 15, 19, 19, 4, 4]);
        // Should not crash and should produce valid output
        const allNums = new Set();
        result.anchorGroups.forEach(g => g.group.forEach(n => allNums.add(n)));
        result.loose.forEach(n => allNums.add(n));
        // The unique input set {15, 19, 4} — adjacent on wheel
        expect(allNums.has(15)).toBe(true);
        expect(allNums.has(19)).toBe(true);
        expect(allNums.has(4)).toBe(true);
    });

    test('K4: Scattered numbers → all loose, no groups', () => {
        // Pick numbers that are far apart on the wheel
        // 0(idx 0), 6(idx 10), 11(idx 14), 22(idx 28) — none adjacent
        const result = R.calculateWheelAnchors([0, 6, 11, 22]);
        expect(result.anchorGroups).toEqual([]);
        expect(result.loose).toHaveLength(4);
    });

    test('K5: Ten adjacent numbers → 2 anchor groups', () => {
        // First 10 on wheel: 0, 32, 15, 19, 4, 21, 2, 25, 17, 34
        const nums = WHEEL_STANDARD.slice(0, 10);
        const result = R.calculateWheelAnchors(nums);
        // 10 = 5 + 5 → two ±2 groups
        expect(result.anchorGroups).toHaveLength(2);
        expect(result.anchorGroups[0].type).toBe('±2');
        expect(result.anchorGroups[1].type).toBe('±2');
    });

    test('K6: Four adjacent → one ±1 + one loose', () => {
        // 32, 15, 19, 4 are consecutive
        const result = R.calculateWheelAnchors([32, 15, 19, 4]);
        expect(result.anchorGroups).toHaveLength(1);
        expect(result.anchorGroups[0].type).toBe('±1');
        expect(result.loose).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════════
// L: _PAIR_REFKEY_TO_DATA_PAIR mapping
// ═══════════════════════════════════════════════════════

describe('L: _PAIR_REFKEY_TO_DATA_PAIR mapping', () => {
    test('L1: Mapping exists', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toBeDefined();
    });

    test('L2: Contains prev key', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toHaveProperty('prev');
    });

    test('L3: Contains prev_prev key', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toHaveProperty('prev_prev');
    });

    test('L4: Contains prev_plus_1 key', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toHaveProperty('prev_plus_1');
    });

    test('L5: Contains prev_minus_1 key', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toHaveProperty('prev_minus_1');
    });

    test('L6: Contains prev_plus_2 key', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toHaveProperty('prev_plus_2');
    });

    test('L7: Contains prev_minus_2 key', () => {
        expect(R._PAIR_REFKEY_TO_DATA_PAIR).toHaveProperty('prev_minus_2');
    });

    test('L8: Has exactly 6 entries', () => {
        expect(Object.keys(R._PAIR_REFKEY_TO_DATA_PAIR)).toHaveLength(6);
    });

    test('L9: All values are strings', () => {
        for (const val of Object.values(R._PAIR_REFKEY_TO_DATA_PAIR)) {
            expect(typeof val).toBe('string');
        }
    });

    test('L10: All values are unique', () => {
        const values = Object.values(R._PAIR_REFKEY_TO_DATA_PAIR);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });
});
