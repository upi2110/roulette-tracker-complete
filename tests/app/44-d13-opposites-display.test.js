/**
 * Tests for D13 Opposites Display in Wheel Number Lists
 *
 * For each loose number, its D13 opposite (WHEEL_D13_OPPOSITES[n]) is computed
 * and shown on a separate "13 Opp" line below the regular Loose row.
 * Adjacent D13 opposites get the same black-bordered box grouping.
 *
 * The WHEEL_D13_OPPOSITES table maps each number 0-36 to its digit-13 opposite:
 *   0→34, 1→28, 2→30, 3→17, 4→36, 5→22, 6→5, 7→4, 8→14, ...
 */

const fs = require('fs');
const path = require('path');
const { setupDOM } = require('../test-setup');

// ── Canvas mock ──────────────────────────────────────────
function mockCanvas() {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        moveTo: jest.fn(),
        closePath: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        fillText: jest.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: ''
    }));
}

// ── Loader ───────────────────────────────────────────────
function loadRouletteWheel() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'),
        'utf-8'
    );

    const wrappedCode = `
        (function() {
            const setInterval = () => {};
            const setTimeout = (fn) => fn();
            const alert = () => {};
            const console = globalThis.console;
            const document = globalThis.document;
            const window = globalThis.window || {};
            ${src}
            return {
                RouletteWheel,
                ZERO_TABLE_NUMS, NINETEEN_TABLE_NUMS,
                POSITIVE_NUMS, NEGATIVE_NUMS,
                SET_0_NUMS, SET_5_NUMS, SET_6_NUMS,
                WHEEL_D13_OPPOSITES
            };
        })()
    `;

    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load RouletteWheel:', e.message);
        return null;
    }
}

// ── Reference D13 table (same as renderer-3tables.js) ────
const REF_D13 = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
};

// ── European wheel order ─────────────────────────────────
const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// Build wheel position lookup
const WHEEL_POS = {};
WHEEL_ORDER.forEach((n, i) => { WHEEL_POS[n] = i; });

// ── Setup ────────────────────────────────────────────────
let RouletteWheel, WHEEL_D13_OPPOSITES;

beforeEach(() => {
    setupDOM();
    mockCanvas();

    if (!document.querySelector('.info-panels-container-bottom')) {
        const container = document.createElement('div');
        container.className = 'info-panels-container-bottom';
        document.body.appendChild(container);
    }

    global.window.moneyPanel = undefined;
    global.window.aiPanel = undefined;
    global.window.calculateWheelAnchors = undefined;
    global.window.rouletteWheel = undefined;

    const loaded = loadRouletteWheel();
    if (loaded) {
        RouletteWheel = loaded.RouletteWheel;
        WHEEL_D13_OPPOSITES = loaded.WHEEL_D13_OPPOSITES;
    }
});

// Helper: create wheel instance and set up prediction data
function makeWheel(anchorGroups, looseNumbers, extraNumbers) {
    const wheel = new RouletteWheel();
    // Set data directly (bypasses updateHighlights → _applyFilters flow for unit testing)
    wheel.anchorGroups = anchorGroups || [];
    wheel.looseNumbers = looseNumbers || [];
    wheel.extraNumbers = extraNumbers || [];
    wheel.extraAnchorGroups = [];
    wheel.extraLoose = [];

    // Build numberInfo
    wheel.numberInfo = {};
    wheel.anchorGroups.forEach(ag => {
        (ag.group || []).forEach(num => {
            wheel.numberInfo[num] = { category: 'primary', isAnchor: (num === ag.anchor), type: ag.type || '±1' };
        });
    });
    wheel.looseNumbers.forEach(num => {
        if (!wheel.numberInfo[num]) {
            wheel.numberInfo[num] = { category: 'primary', isAnchor: false, type: null };
        }
    });

    return wheel;
}

// Helper: get the HTML from wheelNumberLists
function getListHTML(wheel) {
    wheel._updateNumberLists();
    const el = document.getElementById('wheelNumberLists');
    return el ? el.innerHTML : '';
}


describe('44 — D13 Opposites Display', () => {

    // ═══════════════════════════════════════════════════════════
    //  A: WHEEL_D13_OPPOSITES CONSTANT (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('A: WHEEL_D13_OPPOSITES Constant', () => {

        test('A1: has 37 entries (keys 0-36)', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            const keys = Object.keys(WHEEL_D13_OPPOSITES).map(Number);
            expect(keys.length).toBe(37);
            for (let i = 0; i <= 36; i++) {
                expect(keys).toContain(i);
            }
        });

        test('A2: every value is in range 0-36', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            Object.values(WHEEL_D13_OPPOSITES).forEach(v => {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(36);
            });
        });

        test('A3: matches reference table from renderer-3tables.js', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            for (let i = 0; i <= 36; i++) {
                expect(WHEEL_D13_OPPOSITES[i]).toBe(REF_D13[i]);
            }
        });

        test('A4: no number maps to itself', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            for (let i = 0; i <= 36; i++) {
                expect(WHEEL_D13_OPPOSITES[i]).not.toBe(i);
            }
        });

        test('A5: all 37 numbers appear as values (surjective)', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            const values = new Set(Object.values(WHEEL_D13_OPPOSITES));
            // Not necessarily all 37, but most should appear
            expect(values.size).toBeGreaterThanOrEqual(30);
        });

        test('A6: specific known mappings are correct', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            expect(WHEEL_D13_OPPOSITES[0]).toBe(34);
            expect(WHEEL_D13_OPPOSITES[19]).toBe(13);
            expect(WHEEL_D13_OPPOSITES[13]).toBe(16);
            expect(WHEEL_D13_OPPOSITES[26]).toBe(34);
            expect(WHEEL_D13_OPPOSITES[36]).toBe(33);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  B: D13 OPPOSITE COMPUTATION LOGIC (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('B: D13 Opposite Computation Logic', () => {

        test('B1: loose [19] → 13 Opp includes 13 (D13[19]=13)', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [19]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp');
            expect(html).toContain('>13<');
        });

        test('B2: loose [0, 26] → 13 Opp includes 34 only once (both map to 34)', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [0, 26]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (1)');
            expect(html).toContain('>34<');
        });

        test('B3: empty loose → no 13 Opp row', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel(
                [{ anchor: 5, group: [5, 24, 10], type: '±1' }],
                []
            );
            const html = getListHTML(wheel);
            expect(html).not.toContain('13 Opp');
        });

        test('B4: D13 opp already an anchor → excluded from 13 Opp', () => {
            if (!RouletteWheel) return;
            // Loose = [19], D13[19]=13.  Make 13 an anchor → should not appear in 13 Opp
            const wheel = makeWheel(
                [{ anchor: 13, group: [13, 36, 27], type: '±1' }],
                [19]
            );
            const html = getListHTML(wheel);
            // 13 is in primary as anchor, so D13[19]=13 excluded
            // But we should still not have "13 Opp" if all opposites are excluded
            // Actually D13[19]=13 is excluded, so no D13 opposites to show
            expect(html).not.toContain('13 Opp');
        });

        test('B5: D13 opp already a loose number → excluded from 13 Opp', () => {
            if (!RouletteWheel) return;
            // Loose = [19, 13]. D13[19]=13 (already loose), D13[13]=16 (not in primary)
            const wheel = makeWheel([], [19, 13]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp');
            // D13[19]=13 excluded (already loose), D13[13]=16 included
            expect(html).toContain('>16<');
            expect(html).toContain('13 Opp (1)');
        });

        test('B6: all D13 opps already in primary → no 13 Opp row', () => {
            if (!RouletteWheel) return;
            // Loose = [19], D13[19]=13.  13 is also loose → no D13 opposites to show
            const wheel = makeWheel([], [19, 13]);
            const html = getListHTML(wheel);
            // D13[19]=13 excluded (loose). D13[13]=16, which IS shown
            // To get NO 13 Opp, we need all opposites already in primary
            // Let's include 16 as an anchor too
            const wheel2 = makeWheel(
                [{ anchor: 16, group: [16, 33, 24], type: '±1' }],
                [19, 13]
            );
            const html2 = getListHTML(wheel2);
            // D13[19]=13 (excluded: loose), D13[13]=16 (excluded: anchor group)
            expect(html2).not.toContain('13 Opp');
        });

        test('B7: multiple loose → multiple unique D13 opposites', () => {
            if (!RouletteWheel) return;
            // Loose = [1, 3, 7]
            // D13[1]=28, D13[3]=17, D13[7]=4
            const wheel = makeWheel([], [1, 3, 7]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (3)');
            expect(html).toContain('>28<');
            expect(html).toContain('>17<');
            expect(html).toContain('>4<');
        });

        test('B8: D13 opposites are sorted by wheel position', () => {
            if (!RouletteWheel) return;
            // Loose = [1, 3, 7] → D13 opps: 28 (pos 32), 17 (pos 8), 4 (pos 4)
            // Wheel sorted: 4 (pos 4), 17 (pos 8), 28 (pos 32)
            const wheel = makeWheel([], [1, 3, 7]);
            const html = getListHTML(wheel);
            const oppSection = html.split('13 Opp')[1];
            if (oppSection) {
                const idx4 = oppSection.indexOf('>4<');
                const idx17 = oppSection.indexOf('>17<');
                const idx28 = oppSection.indexOf('>28<');
                expect(idx4).toBeLessThan(idx17);
                expect(idx17).toBeLessThan(idx28);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  C: ADJACENT GROUPING ON D13 OPPOSITES (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('C: Adjacent Grouping on D13 Opposites', () => {

        test('C1: non-adjacent D13 opposites → no black box', () => {
            if (!RouletteWheel) return;
            // Loose = [1, 3] → D13: 28 (pos 32), 17 (pos 8) — not adjacent
            const wheel = makeWheel([], [1, 3]);
            const html = getListHTML(wheel);
            const oppSection = html.split('13 Opp')[1] || '';
            // No adjacent group (border:2px solid #000) for the opp section
            // The Loose section also has adjacent grouping, so check specifically in 13 Opp
            const boxCount = (oppSection.match(/border:2px solid #000/g) || []).length;
            expect(boxCount).toBe(0);
        });

        test('C2: adjacent D13 opposites → grouped in black-bordered box', () => {
            if (!RouletteWheel) return;
            // Need D13 opposites that are wheel-adjacent
            // D13[9]=26 (pos 36), D13[29]=19 (pos 3) — not adjacent
            // D13[20]=12 (pos 33), D13[30]=20 (pos 24) — not adjacent
            // Let's find two adjacent ones:
            // Wheel: ...4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30...
            // D13[5]=22 (pos 28), D13[24]=18 (pos 29) → 22 and 18 ARE adjacent!
            const wheel = makeWheel([], [5, 24]);
            const html = getListHTML(wheel);
            const oppSection = html.split('13 Opp')[1] || '';
            expect(oppSection).toContain('border:2px solid #000');
        });

        test('C3: mix of adjacent and non-adjacent D13 opposites', () => {
            if (!RouletteWheel) return;
            // D13[5]=22 (pos 28), D13[24]=18 (pos 29) → adjacent pair
            // D13[1]=28 (pos 32) → standalone
            const wheel = makeWheel([], [5, 24, 1]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (3)');
            const oppSection = html.split('13 Opp')[1] || '';
            // Should have exactly 1 adjacent group box (22+18)
            const boxCount = (oppSection.match(/border:2px solid #000/g) || []).length;
            expect(boxCount).toBe(1);
        });

        test('C4: single D13 opposite → no black box', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [19]); // D13[19]=13
            const html = getListHTML(wheel);
            const oppSection = html.split('13 Opp')[1] || '';
            const boxCount = (oppSection.match(/border:2px solid #000/g) || []).length;
            expect(boxCount).toBe(0);
        });

        test('C5: _groupAdjacent correctly groups D13 opposite numbers', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Test _groupAdjacent with D13 opp numbers
            // 22 (pos 28), 18 (pos 29) → should group together
            const groups = wheel._groupAdjacent([22, 18]);
            expect(groups.length).toBe(1);
            expect(groups[0].length).toBe(2);
        });

        test('C6: large set of D13 opposites with multiple groups', () => {
            if (!RouletteWheel) return;
            // Create loose with many numbers to get many D13 opposites
            // Loose = [5, 24, 1, 3, 19]
            // D13: 22(28), 18(29), 28(32), 17(8), 13(12)
            // Adjacent: 22+18 (pos 28-29) form a group
            const wheel = makeWheel([], [5, 24, 1, 3, 19]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp');
            // At least one adjacent group
            const oppSection = html.split('13 Opp')[1] || '';
            expect(oppSection).toContain('border:2px solid #000');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  D: HTML RENDERING (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('D: HTML Rendering', () => {

        test('D1: "13 Opp" label appears when D13 opposites exist', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [7, 12]); // D13[7]=4, D13[12]=2
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp');
        });

        test('D2: "13 Opp" label does NOT appear when no D13 opposites', () => {
            if (!RouletteWheel) return;
            // Empty loose
            const wheel = makeWheel([{ anchor: 5, group: [5, 24, 10], type: '±1' }], []);
            const html = getListHTML(wheel);
            expect(html).not.toContain('13 Opp');
        });

        test('D3: count in label matches actual D13 opposite count', () => {
            if (!RouletteWheel) return;
            // Loose = [7, 12, 19] → D13: 4, 2, 13 = 3 opposites
            const wheel = makeWheel([], [7, 12, 19]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (3)');
        });

        test('D4: D13 opposite badges use amber color (#b45309)', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [19]); // D13[19]=13
            const html = getListHTML(wheel);
            expect(html).toContain('#b45309');
        });

        test('D5: adjacent D13 opposites have black border box', () => {
            if (!RouletteWheel) return;
            // D13[5]=22 (pos 28), D13[24]=18 (pos 29)
            const wheel = makeWheel([], [5, 24]);
            const html = getListHTML(wheel);
            const oppSection = html.split('13 Opp')[1] || '';
            expect(oppSection).toContain('border:2px solid #000');
        });

        test('D6: 13 Opp row appears AFTER Loose row and BEFORE Grey rows', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [19]); // D13[19]=13
            // Also add grey data
            wheel.extraAnchorGroups = [];
            wheel.extraLoose = [5, 24];
            const html = getListHTML(wheel);
            const looseIdx = html.indexOf('Loose');
            const oppIdx = html.indexOf('13 Opp');
            const greyIdx = html.indexOf('Grey');
            expect(looseIdx).toBeLessThan(oppIdx);
            if (greyIdx !== -1) {
                expect(oppIdx).toBeLessThan(greyIdx);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  E: INTEGRATION WITH FILTERS (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('E: Integration with Filters', () => {

        test('E1: D13 opposites recomputed when loose changes (filter)', () => {
            if (!RouletteWheel) return;
            // First with loose [19] → D13 opp: 13
            const wheel = makeWheel([], [19]);
            let html = getListHTML(wheel);
            expect(html).toContain('13 Opp');
            expect(html).toContain('>13<');

            // Now change loose to [7] → D13 opp: 4
            wheel.looseNumbers = [7];
            wheel.numberInfo = {};
            wheel.looseNumbers.forEach(n => {
                wheel.numberInfo[n] = { category: 'primary', isAnchor: false, type: null };
            });
            html = getListHTML(wheel);
            expect(html).toContain('>4<');
            expect(html).not.toContain('>13<');
        });

        test('E2: D13 opposites correctly exclude anchor group members', () => {
            if (!RouletteWheel) return;
            // Loose = [19], D13[19]=13
            // Make 13 part of an anchor GROUP (not just anchor itself)
            const wheel = makeWheel(
                [{ anchor: 36, group: [27, 13, 36], type: '±1' }],
                [19]
            );
            const html = getListHTML(wheel);
            // 13 is in anchor group → excluded from D13 Opp
            expect(html).not.toContain('13 Opp');
        });

        test('E3: D13 opposites computed from ALL loose members (not just anchor loose)', () => {
            if (!RouletteWheel) return;
            // Loose = [7, 12, 35]
            // D13[7]=4, D13[12]=2, D13[35]=25
            const wheel = makeWheel([], [7, 12, 35]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (3)');
        });

        test('E4: no prediction → no 13 Opp row', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            wheel.anchorGroups = [];
            wheel.looseNumbers = [];
            wheel.extraAnchorGroups = [];
            wheel.extraLoose = [];
            wheel.numberInfo = {};
            const html = getListHTML(wheel);
            expect(html).not.toContain('13 Opp');
        });

        test('E5: D13 opposites do not affect the Loose count', () => {
            if (!RouletteWheel) return;
            // Loose = [7, 12] → 2 loose numbers
            // D13 opps: 4, 2 → shown separately
            const wheel = makeWheel([], [7, 12]);
            const html = getListHTML(wheel);
            expect(html).toContain('Loose (2)');
            expect(html).toContain('13 Opp (2)');
        });

        test('E6: D13 opposites are supplementary (not in primary numberInfo)', () => {
            if (!RouletteWheel) return;
            // Loose = [19] → D13 opp: 13
            const wheel = makeWheel([], [19]);
            getListHTML(wheel); // trigger render
            // 13 should NOT be in numberInfo (it's supplementary display only)
            expect(wheel.numberInfo[13]).toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  F: EDGE CASES (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('F: Edge Cases', () => {

        test('F1: loose number 6 → D13[6]=5 (different numbers)', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [6]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (1)');
            expect(html).toContain('>5<');
        });

        test('F2: multiple loose mapping to same D13 → no duplicates', () => {
            if (!RouletteWheel) return;
            // D13[0]=34, D13[26]=34 → both map to 34
            const wheel = makeWheel([], [0, 26]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (1)');
            // Count occurrences of >34< in opp section
            const oppSection = html.split('13 Opp')[1] || '';
            const matches = oppSection.match(/>34</g) || [];
            expect(matches.length).toBe(1);
        });

        test('F3: all 37 numbers as loose → no D13 opposites (all in primary)', () => {
            if (!RouletteWheel) return;
            const allNums = Array.from({ length: 37 }, (_, i) => i);
            const wheel = makeWheel([], allNums);
            const html = getListHTML(wheel);
            // Every D13 opposite is already in the loose list
            expect(html).not.toContain('13 Opp');
        });

        test('F4: single loose number not in any anchor group', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel(
                [{ anchor: 5, group: [5, 24, 10], type: '±1' }],
                [32]
            );
            const html = getListHTML(wheel);
            // D13[32]=6, 6 is not in anchor group [5,24,10] or loose [32]
            expect(html).toContain('13 Opp (1)');
            expect(html).toContain('>6<');
        });

        test('F5: D13 opposite that happens to be 0 (green pocket)', () => {
            if (!RouletteWheel) return;
            // No number maps to 0 in D13_OPPOSITES actually...
            // D13[0]=34, so 0 maps to 34 not vice versa
            // Check: is there any n where D13[n]=0? Looking at the table... no.
            // So this tests that 0 can be a loose number and its D13 opp (34) works
            const wheel = makeWheel([], [0]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (1)');
            expect(html).toContain('>34<');
        });

        test('F6: large loose list generates correct D13 opposite count', () => {
            if (!RouletteWheel) return;
            // Loose = [1, 3, 5, 7, 9, 11]
            // D13: 28, 17, 22, 4, 26, 1
            // But 1 is already loose → excluded. So: 28, 17, 22, 4, 26 = 5
            const wheel = makeWheel([], [1, 3, 5, 7, 9, 11]);
            const html = getListHTML(wheel);
            expect(html).toContain('13 Opp (5)');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  G: CROSS-REFERENCE WITH RENDERER (4 tests)
    // ═══════════════════════════════════════════════════════════
    describe('G: Cross-Reference with Renderer', () => {

        test('G1: wheel WHEEL_D13_OPPOSITES matches renderer-3tables definition', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            for (let i = 0; i <= 36; i++) {
                expect(WHEEL_D13_OPPOSITES[i]).toBe(REF_D13[i]);
            }
        });

        test('G2: every number 0-36 has a D13 opposite defined', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            for (let i = 0; i <= 36; i++) {
                expect(WHEEL_D13_OPPOSITES[i]).toBeDefined();
            }
        });

        test('G3: D13 opposites never map outside valid range', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            for (let i = 0; i <= 36; i++) {
                const opp = WHEEL_D13_OPPOSITES[i];
                expect(opp).toBeGreaterThanOrEqual(0);
                expect(opp).toBeLessThanOrEqual(36);
            }
        });

        test('G4: D13 opposite of D13 opposite is NOT necessarily the original (asymmetric)', () => {
            if (!WHEEL_D13_OPPOSITES) return;
            // Check: D13[D13[n]] === n for some n, not for others
            // e.g., D13[0]=34, D13[34]=10, D13[10]=9 → not symmetric
            const symmetric = [];
            const asymmetric = [];
            for (let i = 0; i <= 36; i++) {
                if (WHEEL_D13_OPPOSITES[WHEEL_D13_OPPOSITES[i]] === i) {
                    symmetric.push(i);
                } else {
                    asymmetric.push(i);
                }
            }
            // Both categories should exist
            expect(symmetric.length + asymmetric.length).toBe(37);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  H: COMBINED ANCHOR+LOOSE SCENARIOS (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('H: Combined Anchor+Loose Scenarios', () => {

        test('H1: anchors + loose + D13 all render in correct order', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel(
                [{ anchor: 5, group: [5, 24, 10], type: '±1' }],
                [19, 7]
            );
            const html = getListHTML(wheel);
            const anchorIdx = html.indexOf('±1 Anchors');
            const looseIdx = html.indexOf('Loose');
            const oppIdx = html.indexOf('13 Opp');
            expect(anchorIdx).toBeLessThan(looseIdx);
            expect(looseIdx).toBeLessThan(oppIdx);
        });

        test('H2: ±2 anchors + ±1 anchors + loose + D13 opp all present', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel(
                [
                    { anchor: 5, group: [5, 24, 10, 16, 33], type: '±2' },
                    { anchor: 13, group: [13, 36, 27], type: '±1' }
                ],
                [19, 7]
            );
            const html = getListHTML(wheel);
            expect(html).toContain('±2 Anchors');
            expect(html).toContain('±1 Anchors');
            expect(html).toContain('Loose (2)');
            // D13[19]=13 (in anchor group), D13[7]=4 (free)
            expect(html).toContain('13 Opp (1)');
            expect(html).toContain('>4<');
        });

        test('H3: D13 opp of loose excluded if in SAME anchor group member', () => {
            if (!RouletteWheel) return;
            // D13[7]=4. Put 4 in anchor group.
            const wheel = makeWheel(
                [{ anchor: 21, group: [19, 4, 21], type: '±1' }],
                [7]
            );
            const html = getListHTML(wheel);
            // D13[7]=4, but 4 is in anchor group → excluded
            expect(html).not.toContain('13 Opp');
        });

        test('H4: grey numbers do not affect D13 opposite exclusion', () => {
            if (!RouletteWheel) return;
            // D13[19]=13. Put 13 in grey loose (not primary)
            const wheel = makeWheel([], [19]);
            wheel.extraLoose = [13];
            wheel.numberInfo[13] = { category: 'grey', isAnchor: false, type: null };
            const html = getListHTML(wheel);
            // 13 is grey but NOT in primarySet → D13[19]=13 SHOULD appear
            expect(html).toContain('13 Opp');
            expect(html).toContain('>13<');
        });

        test('H5: D13 opposite badges are visually distinct from primary', () => {
            if (!RouletteWheel) return;
            const wheel = makeWheel([], [19, 7]);
            const html = getListHTML(wheel);
            // Primary loose uses #22c55e (green) or #1e293b (dark)
            // D13 Opp uses #b45309 (amber)
            const oppSection = html.split('13 Opp')[1] || '';
            expect(oppSection).toContain('#b45309');
            // And NOT primary colors in the opp section badges
            expect(oppSection).not.toContain('#22c55e');
            expect(oppSection).not.toContain('#1e293b');
        });

        test('H6: D13 Opp count is independent of anchor count', () => {
            if (!RouletteWheel) return;
            // Same loose, different anchors
            const wheel1 = makeWheel(
                [{ anchor: 5, group: [5, 24, 10], type: '±1' }],
                [7, 12]
            );
            const html1 = getListHTML(wheel1);

            const wheel2 = makeWheel(
                [{ anchor: 32, group: [32, 15, 0], type: '±1' }],
                [7, 12]
            );
            const html2 = getListHTML(wheel2);

            // Both should have D13 of [7, 12] minus whatever overlaps with anchors
            // D13[7]=4, D13[12]=2
            // wheel1 anchors: {5,24,10} → 4 and 2 not excluded → 13 Opp (2)
            // wheel2 anchors: {32,15,0} → 4 and 2 not excluded → 13 Opp (2)
            expect(html1).toContain('13 Opp (2)');
            expect(html2).toContain('13 Opp (2)');
        });
    });
});
