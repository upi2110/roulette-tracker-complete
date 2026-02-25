/**
 * TESTS: RouletteWheel, AutoUpdateOrchestrator, AIIntegrationV6
 *
 * These three modules had ZERO test coverage.
 * Tests cover constructor logic, filter state, highlight management,
 * orchestrator mode switching, and integration class fallback behavior.
 *
 * 95+ tests across sections A-N
 */

const fs = require('fs');
const path = require('path');
const { setupDOM } = require('../test-setup');

// Number sets matching roulette-wheel.js source
const ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// ── Canvas mock ───────────────────────────────────────

function mockCanvasContext() {
    // Mock 2D context for jsdom (no real canvas support)
    return {
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
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
    };
}

function setupCanvasMock() {
    // Patch HTMLCanvasElement.prototype.getContext if needed
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type) {
        if (type === '2d') {
            if (!this._mockCtx) {
                this._mockCtx = mockCanvasContext();
            }
            return this._mockCtx;
        }
        return origGetContext.call(this, type);
    };
}

// ── Loader helpers ────────────────────────────────────

function loadRouletteWheel() {
    let src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'), 'utf-8');
    // Strip const declarations of number sets (they conflict with test file scope)
    // and replace with var so they can be overridden in the function scope
    src = src.replace(/^const (ZERO_TABLE_NUMS|NINETEEN_TABLE_NUMS|POSITIVE_NUMS|NEGATIVE_NUMS)/gm, 'var $1');
    // Also remove the DOMContentLoaded auto-instantiation and global assignment at bottom
    src = src.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);/g, '');
    src = src.replace(/window\.rouletteWheel\s*=\s*null;/, '');

    const factory = new Function('document', 'window', 'console', 'setTimeout', 'setInterval', `
        ${src}
        return RouletteWheel;
    `);
    return factory(
        globalThis.document,
        globalThis.window || {},
        globalThis.console,
        globalThis.setTimeout,
        globalThis.setInterval
    );
}

function loadOrchestrator() {
    let src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'auto-update-orchestrator.js'), 'utf-8');
    // Remove DOMContentLoaded listener and global instance creation
    src = src.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);/g, '');
    src = src.replace(/const autoUpdateOrchestrator = new AutoUpdateOrchestrator\(\);/, '');
    src = src.replace(/window\.autoUpdateOrchestrator = autoUpdateOrchestrator;/, '');

    const factory = new Function('document', 'window', 'console', 'setTimeout', 'setInterval', `
        ${src}
        return AutoUpdateOrchestrator;
    `);
    return factory(
        globalThis.document,
        globalThis.window || {},
        globalThis.console,
        globalThis.setTimeout,
        () => 0  // don't start setInterval in tests
    );
}

function loadAIIntegration() {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ai-integration.js'), 'utf-8');
    const wrappedCode = `
        (function() {
            const console = globalThis.console;
            const document = { addEventListener: () => {}, querySelector: () => null };
            const window = globalThis.window || {};

            ${src}

            return AIIntegrationV6;
        })()
    `;
    return eval(wrappedCode);
}

// ═══════════════════════════════════════════════════════
// A: RouletteWheel — constructor & initialization
// ═══════════════════════════════════════════════════════

describe('A: RouletteWheel constructor', () => {
    let RouletteWheel, wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('A1: wheelOrder has 37 numbers (European)', () => {
        expect(wheel.wheelOrder).toHaveLength(37);
    });

    test('A2: wheelOrder starts with 0', () => {
        expect(wheel.wheelOrder[0]).toBe(0);
    });

    test('A3: wheelOrder ends with 26', () => {
        expect(wheel.wheelOrder[36]).toBe(26);
    });

    test('A4: wheelOrder contains all 37 numbers (0-36)', () => {
        const sorted = [...wheel.wheelOrder].sort((a, b) => a - b);
        expect(sorted).toEqual(Array.from({ length: 37 }, (_, i) => i));
    });

    test('A5: redNumbers has 18 entries', () => {
        expect(wheel.redNumbers).toHaveLength(18);
    });

    test('A6: blackNumbers has 18 entries', () => {
        expect(wheel.blackNumbers).toHaveLength(18);
    });

    test('A7: redNumbers + blackNumbers + green(0) = 37', () => {
        const allColors = new Set([...wheel.redNumbers, ...wheel.blackNumbers, 0]);
        expect(allColors.size).toBe(37);
    });

    test('A8: sortOrder has 37 entries', () => {
        expect(wheel.sortOrder).toHaveLength(37);
    });

    test('A9: sortOrder starts from 26 (clockwise from 0/26 pocket)', () => {
        expect(wheel.sortOrder[0]).toBe(26);
    });

    test('A10: wheelPos maps all 37 numbers to indices', () => {
        for (let n = 0; n <= 36; n++) {
            expect(wheel.wheelPos[n]).toBeDefined();
        }
    });

    test('A11: default filters — zeroTable true, nineteenTable false', () => {
        expect(wheel.filters.zeroTable).toBe(true);
        expect(wheel.filters.nineteenTable).toBe(false);
    });

    test('A12: default filters — positive true, negative true', () => {
        expect(wheel.filters.positive).toBe(true);
        expect(wheel.filters.negative).toBe(true);
    });

    test('A13: starts with empty anchorGroups', () => {
        expect(wheel.anchorGroups).toEqual([]);
    });

    test('A14: starts with empty numberInfo', () => {
        expect(Object.keys(wheel.numberInfo)).toHaveLength(0);
    });

    test('A15: _rawPrediction is null initially', () => {
        expect(wheel._rawPrediction).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// B: RouletteWheel — _passesFilter logic
// ═══════════════════════════════════════════════════════

describe('B: RouletteWheel _passesFilter', () => {
    let wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('B1: All filters on → all 37 numbers pass', () => {
        wheel.filters = { zeroTable: true, nineteenTable: true, positive: true, negative: true, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(true);
        }
    });

    test('B2: Only zeroTable → only zero-table numbers pass', () => {
        wheel.filters = { zeroTable: true, nineteenTable: false, positive: true, negative: true, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(ZERO_TABLE_NUMS.has(n));
        }
    });

    test('B3: Only nineteenTable → only nineteen-table numbers pass', () => {
        wheel.filters = { zeroTable: false, nineteenTable: true, positive: true, negative: true, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(NINETEEN_TABLE_NUMS.has(n));
        }
    });

    test('B4: Only positive → only positive numbers pass', () => {
        wheel.filters = { zeroTable: true, nineteenTable: true, positive: true, negative: false, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(POSITIVE_NUMS.has(n));
        }
    });

    test('B5: Only negative → only negative numbers pass', () => {
        wheel.filters = { zeroTable: true, nineteenTable: true, positive: false, negative: true, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(NEGATIVE_NUMS.has(n));
        }
    });

    test('B6: zero_positive filter → intersection', () => {
        wheel.filters = { zeroTable: true, nineteenTable: false, positive: true, negative: false, set0: true, set5: true, set6: true };
        let count = 0;
        for (let n = 0; n <= 36; n++) {
            const expected = ZERO_TABLE_NUMS.has(n) && POSITIVE_NUMS.has(n);
            expect(wheel._passesFilter(n)).toBe(expected);
            if (expected) count++;
        }
        expect(count).toBeGreaterThan(0);
    });

    test('B7: nineteen_negative filter → intersection', () => {
        wheel.filters = { zeroTable: false, nineteenTable: true, positive: false, negative: true, set0: true, set5: true, set6: true };
        let count = 0;
        for (let n = 0; n <= 36; n++) {
            const expected = NINETEEN_TABLE_NUMS.has(n) && NEGATIVE_NUMS.has(n);
            expect(wheel._passesFilter(n)).toBe(expected);
            if (expected) count++;
        }
        expect(count).toBeGreaterThan(0);
    });

    test('B8: No tables selected → no numbers pass', () => {
        wheel.filters = { zeroTable: false, nineteenTable: false, positive: true, negative: true, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(false);
        }
    });

    test('B9: No signs selected → no numbers pass', () => {
        wheel.filters = { zeroTable: true, nineteenTable: true, positive: false, negative: false, set0: true, set5: true, set6: true };
        for (let n = 0; n <= 36; n++) {
            expect(wheel._passesFilter(n)).toBe(false);
        }
    });
});

// ═══════════════════════════════════════════════════════
// C: RouletteWheel — updateHighlights
// ═══════════════════════════════════════════════════════

describe('C: RouletteWheel updateHighlights', () => {
    let wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('C1: stores raw prediction after updateHighlights', () => {
        wheel.updateHighlights([5], [10], [{ anchor: 5, group: [4, 5, 6], type: '±1' }], [20]);
        expect(wheel._rawPrediction).not.toBeNull();
    });

    test('C2: rawPrediction contains anchors, loose, anchorGroups, extraNumbers', () => {
        const anchors = [5];
        const loose = [10];
        const groups = [{ anchor: 5, group: [4, 5, 6], type: '±1' }];
        const extra = [20, 21];
        wheel.updateHighlights(anchors, loose, groups, extra);

        expect(wheel._rawPrediction.anchors).toEqual(anchors);
        expect(wheel._rawPrediction.loose).toEqual(loose);
        expect(wheel._rawPrediction.anchorGroups).toEqual(groups);
        expect(wheel._rawPrediction.extraNumbers).toEqual(extra);
    });

    test('C3: rawPrediction.prediction.numbers includes all primary numbers', () => {
        wheel.updateHighlights([5], [10], [{ anchor: 5, group: [4, 5, 6], type: '±1' }], []);
        const nums = wheel._rawPrediction.prediction.numbers;
        expect(nums).toContain(4);
        expect(nums).toContain(5);
        expect(nums).toContain(6);
        expect(nums).toContain(10);
    });

    test('C4: empty arrays → empty rawPrediction', () => {
        wheel.updateHighlights([], [], [], []);
        expect(wheel._rawPrediction).not.toBeNull();
        expect(wheel._rawPrediction.anchors).toEqual([]);
    });

    test('C5: prediction object passed through', () => {
        const pred = { numbers: [1, 2, 3], signal: 'BET NOW', confidence: 85 };
        wheel.updateHighlights([], [], [], [], pred);
        expect(wheel._rawPrediction.prediction.signal).toBe('BET NOW');
        expect(wheel._rawPrediction.prediction.confidence).toBe(85);
    });
});

// ═══════════════════════════════════════════════════════
// D: RouletteWheel — clearHighlights
// ═══════════════════════════════════════════════════════

describe('D: RouletteWheel clearHighlights', () => {
    let wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('D1: clearHighlights resets anchorGroups', () => {
        wheel.anchorGroups = [{ anchor: 5, group: [4, 5, 6] }];
        wheel.clearHighlights();
        expect(wheel.anchorGroups).toEqual([]);
    });

    test('D2: clearHighlights resets looseNumbers', () => {
        wheel.looseNumbers = [10, 20];
        wheel.clearHighlights();
        expect(wheel.looseNumbers).toEqual([]);
    });

    test('D3: clearHighlights resets extraNumbers', () => {
        wheel.extraNumbers = [30];
        wheel.clearHighlights();
        expect(wheel.extraNumbers).toEqual([]);
    });

    test('D4: clearHighlights resets numberInfo', () => {
        wheel.numberInfo = { 5: { category: 'primary', isAnchor: true } };
        wheel.clearHighlights();
        expect(Object.keys(wheel.numberInfo)).toHaveLength(0);
    });

    test('D5: clearHighlights sets _rawPrediction to null', () => {
        wheel._rawPrediction = { anchors: [5] };
        wheel.clearHighlights();
        expect(wheel._rawPrediction).toBeNull();
    });

    test('D6: clearHighlights resets extraAnchorGroups and extraLoose', () => {
        wheel.extraAnchorGroups = [{ anchor: 20 }];
        wheel.extraLoose = [25];
        wheel.clearHighlights();
        expect(wheel.extraAnchorGroups).toEqual([]);
        expect(wheel.extraLoose).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════
// E: RouletteWheel — _getHighlightPos
// ═══════════════════════════════════════════════════════

describe('E: RouletteWheel _getHighlightPos', () => {
    let wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('E1: Returns position for valid number 0', () => {
        const pos = wheel._getHighlightPos(0);
        expect(pos).not.toBeNull();
        expect(pos).toHaveProperty('x');
        expect(pos).toHaveProperty('y');
    });

    test('E2: Returns position for all 37 numbers', () => {
        for (let n = 0; n <= 36; n++) {
            const pos = wheel._getHighlightPos(n);
            expect(pos).not.toBeNull();
        }
    });

    test('E3: Returns null for invalid number 37', () => {
        const pos = wheel._getHighlightPos(37);
        expect(pos).toBeNull();
    });

    test('E4: Returns null for negative number', () => {
        const pos = wheel._getHighlightPos(-1);
        expect(pos).toBeNull();
    });

    test('E5: Positions are within canvas bounds (400x420)', () => {
        for (let n = 0; n <= 36; n++) {
            const pos = wheel._getHighlightPos(n);
            expect(pos.x).toBeGreaterThan(-10);
            expect(pos.x).toBeLessThan(410);
            expect(pos.y).toBeGreaterThan(-10);
            expect(pos.y).toBeLessThan(430);
        }
    });

    test('E6: Different numbers get different positions', () => {
        const pos0 = wheel._getHighlightPos(0);
        const pos1 = wheel._getHighlightPos(32); // adjacent to 0 on wheel
        expect(pos0.x).not.toBeCloseTo(pos1.x, 0);
    });
});

// ═══════════════════════════════════════════════════════
// F: RouletteWheel — _onFilterChange
// ═══════════════════════════════════════════════════════

describe('F: RouletteWheel _onFilterChange', () => {
    let wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('F1: Checking filter19Table sets nineteenTable=true, zeroTable=false', () => {
        document.getElementById('filter0Table').checked = false;
        document.getElementById('filter19Table').checked = true;
        document.getElementById('filterBothTables').checked = false;
        wheel._onFilterChange();
        expect(wheel.filters.zeroTable).toBe(false);
        expect(wheel.filters.nineteenTable).toBe(true);
    });

    test('F2: Checking filterBothTables sets both to true', () => {
        document.getElementById('filter0Table').checked = false;
        document.getElementById('filter19Table').checked = false;
        document.getElementById('filterBothTables').checked = true;
        wheel._onFilterChange();
        expect(wheel.filters.zeroTable).toBe(true);
        expect(wheel.filters.nineteenTable).toBe(true);
    });

    test('F3: Checking filterPositive sets positive=true, negative=false', () => {
        document.getElementById('filterPositive').checked = true;
        document.getElementById('filterNegative').checked = false;
        document.getElementById('filterBothSigns').checked = false;
        wheel._onFilterChange();
        expect(wheel.filters.positive).toBe(true);
        expect(wheel.filters.negative).toBe(false);
    });

    test('F4: Checking filterNegative sets positive=false, negative=true', () => {
        document.getElementById('filterPositive').checked = false;
        document.getElementById('filterNegative').checked = true;
        document.getElementById('filterBothSigns').checked = false;
        wheel._onFilterChange();
        expect(wheel.filters.positive).toBe(false);
        expect(wheel.filters.negative).toBe(true);
    });

    test('F5: Checking filterBothSigns sets both to true', () => {
        document.getElementById('filterPositive').checked = false;
        document.getElementById('filterNegative').checked = false;
        document.getElementById('filterBothSigns').checked = true;
        wheel._onFilterChange();
        expect(wheel.filters.positive).toBe(true);
        expect(wheel.filters.negative).toBe(true);
    });

    test('F6: Default state (filter0Table + filterBothSigns)', () => {
        // Already default from setupDOM
        wheel._onFilterChange();
        expect(wheel.filters.zeroTable).toBe(true);
        expect(wheel.filters.nineteenTable).toBe(false);
        expect(wheel.filters.positive).toBe(true);
        expect(wheel.filters.negative).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// G: RouletteWheel — _updateFromRaw & numberInfo
// ═══════════════════════════════════════════════════════

describe('G: RouletteWheel _updateFromRaw', () => {
    let wheel;

    beforeEach(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('G1: Sets anchorGroups from input', () => {
        const groups = [{ anchor: 5, group: [4, 5, 6], type: '±1' }];
        wheel._updateFromRaw([5], [10], groups, []);
        expect(wheel.anchorGroups).toEqual(groups);
    });

    test('G2: Sets looseNumbers from input', () => {
        wheel._updateFromRaw([], [10, 20], [], []);
        expect(wheel.looseNumbers).toEqual([10, 20]);
    });

    test('G3: Sets extraNumbers from input', () => {
        wheel._updateFromRaw([], [], [], [30, 31]);
        expect(wheel.extraNumbers).toEqual([30, 31]);
    });

    test('G4: Builds numberInfo from anchor groups (primary category)', () => {
        const groups = [{ anchor: 5, group: [4, 5, 6], type: '±1' }];
        wheel._updateFromRaw([5], [], groups, []);
        expect(wheel.numberInfo[5]).toEqual({ category: 'primary', isAnchor: true, type: '±1' });
        expect(wheel.numberInfo[4]).toEqual({ category: 'primary', isAnchor: false, type: '±1' });
        expect(wheel.numberInfo[6]).toEqual({ category: 'primary', isAnchor: false, type: '±1' });
    });

    test('G5: Loose numbers get primary category, isAnchor=false', () => {
        wheel._updateFromRaw([], [10], [], []);
        expect(wheel.numberInfo[10]).toEqual({ category: 'primary', isAnchor: false, type: null });
    });

    test('G6: Empty input → empty numberInfo', () => {
        wheel._updateFromRaw([], [], [], []);
        expect(Object.keys(wheel.numberInfo)).toHaveLength(0);
    });

    test('G7: Handles null/undefined gracefully', () => {
        wheel._updateFromRaw(null, null, null, null);
        expect(wheel.anchorGroups).toEqual([]);
        expect(wheel.looseNumbers).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════
// H: RouletteWheel — number set invariants
// ═══════════════════════════════════════════════════════

describe('H: RouletteWheel number set invariants', () => {
    let wheel;

    beforeAll(() => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        wheel = new RouletteWheel();
    });

    test('H1: POSITIVE and NEGATIVE are disjoint', () => {
        for (const n of POSITIVE_NUMS) {
            expect(NEGATIVE_NUMS.has(n)).toBe(false);
        }
    });

    test('H2: POSITIVE + NEGATIVE = all 37 numbers', () => {
        const union = new Set([...POSITIVE_NUMS, ...NEGATIVE_NUMS]);
        expect(union.size).toBe(37);
    });

    test('H3: ZERO_TABLE has 19 numbers', () => {
        expect(ZERO_TABLE_NUMS.size).toBe(19);
    });

    test('H4: NINETEEN_TABLE has 18 numbers', () => {
        expect(NINETEEN_TABLE_NUMS.size).toBe(18);
    });

    test('H5: ZERO + NINETEEN = all 37 numbers', () => {
        const union = new Set([...ZERO_TABLE_NUMS, ...NINETEEN_TABLE_NUMS]);
        expect(union.size).toBe(37);
    });

    test('H6: ZERO and NINETEEN are disjoint', () => {
        for (const n of ZERO_TABLE_NUMS) {
            expect(NINETEEN_TABLE_NUMS.has(n)).toBe(false);
        }
    });

    test('H7: wheel POSITIVE matches global POSITIVE_NUMS', () => {
        expect(wheel.POSITIVE).toEqual(POSITIVE_NUMS);
    });

    test('H8: wheel NEGATIVE matches global NEGATIVE_NUMS', () => {
        expect(wheel.NEGATIVE).toEqual(NEGATIVE_NUMS);
    });
});

// ═══════════════════════════════════════════════════════
// I: AutoUpdateOrchestrator — constructor & state
// ═══════════════════════════════════════════════════════

describe('I: AutoUpdateOrchestrator constructor', () => {
    let Orchestrator;

    beforeAll(() => {
        Orchestrator = loadOrchestrator();
    });

    test('I1: Starts with lastSpinCount = 0', () => {
        const orch = new Orchestrator();
        expect(orch.lastSpinCount).toBe(0);
    });

    test('I2: Starts enabled', () => {
        const orch = new Orchestrator();
        expect(orch.isEnabled).toBe(true);
    });

    test('I3: Session not started initially', () => {
        const orch = new Orchestrator();
        expect(orch.sessionStarted).toBe(false);
    });

    test('I4: Auto mode off by default', () => {
        const orch = new Orchestrator();
        expect(orch.autoMode).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════
// J: AutoUpdateOrchestrator — mode switching
// ═══════════════════════════════════════════════════════

describe('J: AutoUpdateOrchestrator mode switching', () => {
    let orch;

    beforeEach(() => {
        const Orchestrator = loadOrchestrator();
        orch = new Orchestrator();
    });

    test('J1: enable() sets isEnabled to true', () => {
        orch.isEnabled = false;
        orch.enable();
        expect(orch.isEnabled).toBe(true);
    });

    test('J2: disable() sets isEnabled to false', () => {
        orch.disable();
        expect(orch.isEnabled).toBe(false);
    });

    test('J3: setAutoMode(true) enables auto mode', () => {
        orch.setAutoMode(true);
        expect(orch.autoMode).toBe(true);
    });

    test('J4: setAutoMode(false) disables auto mode', () => {
        orch.setAutoMode(true);
        orch.setAutoMode(false);
        expect(orch.autoMode).toBe(false);
    });

    test('J5: reset() resets all state', () => {
        orch.lastSpinCount = 100;
        orch.sessionStarted = true;
        orch.autoMode = true;
        orch.reset();
        expect(orch.lastSpinCount).toBe(0);
        expect(orch.sessionStarted).toBe(false);
        expect(orch.autoMode).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════
// K: AutoUpdateOrchestrator — _setWheelFilters
// ═══════════════════════════════════════════════════════

describe('K: AutoUpdateOrchestrator _setWheelFilters', () => {
    let orch;

    beforeEach(() => {
        setupDOM();
        const Orchestrator = loadOrchestrator();
        orch = new Orchestrator();
    });

    test('K1: _setWheelFilters("zero_positive") sets correct radios', () => {
        orch._setWheelFilters('zero_positive');
        expect(document.getElementById('filter0Table').checked).toBe(true);
        expect(document.getElementById('filter19Table').checked).toBe(false);
        expect(document.getElementById('filterBothTables').checked).toBe(false);
        expect(document.getElementById('filterPositive').checked).toBe(true);
        expect(document.getElementById('filterNegative').checked).toBe(false);
        expect(document.getElementById('filterBothSigns').checked).toBe(false);
    });

    test('K2: _setWheelFilters("nineteen_negative") sets correct radios', () => {
        orch._setWheelFilters('nineteen_negative');
        expect(document.getElementById('filter0Table').checked).toBe(false);
        expect(document.getElementById('filter19Table').checked).toBe(true);
        expect(document.getElementById('filterPositive').checked).toBe(false);
        expect(document.getElementById('filterNegative').checked).toBe(true);
    });

    test('K3: _setWheelFilters("both_both") sets both radios', () => {
        orch._setWheelFilters('both_both');
        expect(document.getElementById('filterBothTables').checked).toBe(true);
        expect(document.getElementById('filterBothSigns').checked).toBe(true);
    });

    test('K4: _setWheelFilters("zero_both") sets zero table, both signs', () => {
        orch._setWheelFilters('zero_both');
        expect(document.getElementById('filter0Table').checked).toBe(true);
        expect(document.getElementById('filterBothSigns').checked).toBe(true);
    });

    test('K5: _setWheelFilters("both_negative") sets both tables, negative sign', () => {
        orch._setWheelFilters('both_negative');
        expect(document.getElementById('filterBothTables').checked).toBe(true);
        expect(document.getElementById('filterNegative').checked).toBe(true);
    });

    test('K6: _setWheelFilters(null) does nothing (no crash)', () => {
        expect(() => orch._setWheelFilters(null)).not.toThrow();
    });

    test('K7: _setWheelFilters(undefined) does nothing', () => {
        expect(() => orch._setWheelFilters(undefined)).not.toThrow();
    });

    test('K8: _setWheelFilters calls rouletteWheel._onFilterChange if available', () => {
        const mockFn = jest.fn();
        window.rouletteWheel = { _onFilterChange: mockFn };
        orch._setWheelFilters('zero_positive');
        expect(mockFn).toHaveBeenCalled();
        delete window.rouletteWheel;
    });
});

// ═══════════════════════════════════════════════════════
// L: AIIntegrationV6 — constructor & fallbacks
// ═══════════════════════════════════════════════════════

describe('L: AIIntegrationV6 constructor', () => {
    let AIIntegrationV6;

    beforeAll(() => {
        AIIntegrationV6 = loadAIIntegration();
    });

    test('L1: Starts not connected', () => {
        const ai = new AIIntegrationV6();
        expect(ai.connected).toBe(false);
    });

    test('L2: Default mode is v6', () => {
        const ai = new AIIntegrationV6();
        expect(ai.currentMode).toBe('v6');
    });

    test('L3: api is null when window.aiAPI not set', () => {
        const ai = new AIIntegrationV6();
        expect(ai.api).toBeFalsy();
    });

    test('L4: testConnection returns false when no api', async () => {
        const ai = new AIIntegrationV6();
        const result = await ai.testConnection();
        expect(result).toBe(false);
    });

    test('L5: getPredictionV6 returns null when no api', async () => {
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([]);
        expect(result).toBeNull();
    });

    test('L6: getPredictionV5 always returns null (fallback stub)', async () => {
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV5([1, 2, 3]);
        expect(result).toBeNull();
    });

    test('L7: startSession returns null when no api', async () => {
        const ai = new AIIntegrationV6();
        const result = await ai.startSession(4000, 100);
        expect(result).toBeNull();
    });

    test('L8: processResult returns null when no api', async () => {
        const ai = new AIIntegrationV6();
        const result = await ai.processResult(5, true);
        expect(result).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// M: AIIntegrationV6 — with mock API
// ═══════════════════════════════════════════════════════

describe('M: AIIntegrationV6 with mock API', () => {
    let AIIntegrationV6;

    beforeAll(() => {
        AIIntegrationV6 = loadAIIntegration();
    });

    afterEach(() => {
        delete window.aiAPI;
    });

    test('M1: testConnection returns true with working api', async () => {
        window.aiAPI = { testConnection: async () => true };
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.testConnection();
        expect(result).toBe(true);
        expect(ai.connected).toBe(true);
    });

    test('M2: testConnection returns false when api throws', async () => {
        window.aiAPI = { testConnection: async () => { throw new Error('fail'); } };
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.testConnection();
        expect(result).toBe(false);
        expect(ai.connected).toBe(false);
    });

    test('M3: startSession passes bankroll and target to api', async () => {
        const mockStart = jest.fn().mockResolvedValue({ session_id: 'test123' });
        window.aiAPI = { startSession: mockStart };
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.startSession(5000, 200);
        expect(mockStart).toHaveBeenCalledWith(5000, 200);
        expect(result).toEqual({ session_id: 'test123' });
    });

    test('M4: processResult passes betPerNumber and hit', async () => {
        const mockProcess = jest.fn().mockResolvedValue({ pnl: 175 });
        window.aiAPI = { processResult: mockProcess };
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.processResult(5, true);
        expect(mockProcess).toHaveBeenCalledWith(5, true);
        expect(result).toEqual({ pnl: 175 });
    });

    test('M5: startSession catches errors gracefully', async () => {
        window.aiAPI = { startSession: async () => { throw new Error('network fail'); } };
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.startSession(4000, 100);
        expect(result).toBeNull();
    });

    test('M6: processResult catches errors gracefully', async () => {
        window.aiAPI = { processResult: async () => { throw new Error('timeout'); } };
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.processResult(5, false);
        expect(result).toBeNull();
    });

    test('M7: getPrediction dispatches to V6 by default', async () => {
        const ai = new AIIntegrationV6();
        ai.currentMode = 'v6';
        // Without API, V6 returns null
        const result = await ai.getPrediction([1, 2, 3]);
        expect(result).toBeNull();
    });

    test('M8: getPrediction dispatches to V5 when mode is v5', async () => {
        const ai = new AIIntegrationV6();
        ai.currentMode = 'v5';
        const result = await ai.getPrediction([1, 2, 3]);
        expect(result).toBeNull(); // V5 stub always returns null
    });
});

// ═══════════════════════════════════════════════════════
// N: Cross-module integration
// ═══════════════════════════════════════════════════════

describe('N: Cross-module integration', () => {
    test('N1: Orchestrator _setWheelFilters maps all 36 combos correctly', () => {
        setupDOM();
        const Orchestrator = loadOrchestrator();
        const orch = new Orchestrator();

        const tables = ['zero', 'nineteen', 'both'];
        const signs = ['positive', 'negative', 'both'];
        const sets = [null, 'set0', 'set5', 'set6'];  // null = no set key (all sets on)

        const combos = [];
        for (const t of tables) {
            for (const s of signs) {
                for (const st of sets) {
                    combos.push(st ? `${t}_${s}_${st}` : `${t}_${s}`);
                }
            }
        }
        expect(combos.length).toBe(36);

        for (const combo of combos) {
            orch._setWheelFilters(combo);
            const parts = combo.split('_');
            const table = parts[0];
            const sign = parts[1];
            const setKey = parts.length > 2 ? parts[2] : null;

            if (table === 'zero') {
                expect(document.getElementById('filter0Table').checked).toBe(true);
            } else if (table === 'nineteen') {
                expect(document.getElementById('filter19Table').checked).toBe(true);
            } else {
                expect(document.getElementById('filterBothTables').checked).toBe(true);
            }

            if (sign === 'positive') {
                expect(document.getElementById('filterPositive').checked).toBe(true);
            } else if (sign === 'negative') {
                expect(document.getElementById('filterNegative').checked).toBe(true);
            } else {
                expect(document.getElementById('filterBothSigns').checked).toBe(true);
            }

            // Verify set checkboxes
            const SET_MAP = { set0: 'filterSet0', set5: 'filterSet5', set6: 'filterSet6' };
            if (setKey) {
                // Only the specified set should be checked
                for (const [key, id] of Object.entries(SET_MAP)) {
                    expect(document.getElementById(id).checked).toBe(key === setKey);
                }
            } else {
                // No set specified — all sets should be checked
                for (const id of Object.values(SET_MAP)) {
                    expect(document.getElementById(id).checked).toBe(true);
                }
            }
        }
    });

    test('N2: RouletteWheel filter counts match number set intersections', () => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        const wheel = new RouletteWheel();

        // Test zero_positive count
        wheel.filters = { zeroTable: true, nineteenTable: false, positive: true, negative: false, set0: true, set5: true, set6: true };
        let count = 0;
        for (let n = 0; n <= 36; n++) {
            if (wheel._passesFilter(n)) count++;
        }
        // Count should match intersection of ZERO_TABLE and POSITIVE
        let expected = 0;
        for (const n of ZERO_TABLE_NUMS) {
            if (POSITIVE_NUMS.has(n)) expected++;
        }
        expect(count).toBe(expected);
    });

    test('N3: AIIntegrationV6 getPredictionV6 returns null with < 3 spins', async () => {
        const AIIntegrationV6 = loadAIIntegration();
        window.aiAPI = { getPredictionWithTableData: jest.fn() };
        window.spins = [{ actual: 5 }, { actual: 10 }]; // Only 2 spins
        const ai = new AIIntegrationV6();
        ai.api = window.aiAPI;
        const result = await ai.getPredictionV6([5, 10]);
        expect(result).toBeNull();
        expect(window.aiAPI.getPredictionWithTableData).not.toHaveBeenCalled();
        delete window.aiAPI;
        delete window.spins;
    });

    test('N4: Orchestrator loadPairsForManualSelection calls aiPanel.loadAvailablePairs', () => {
        const Orchestrator = loadOrchestrator();
        const orch = new Orchestrator();
        const mockLoad = jest.fn();
        window.aiPanel = { loadAvailablePairs: mockLoad };
        orch.loadPairsForManualSelection();
        expect(mockLoad).toHaveBeenCalled();
        delete window.aiPanel;
    });

    test('N5: Orchestrator loadPairsForManualSelection tolerates missing aiPanel', () => {
        const Orchestrator = loadOrchestrator();
        const orch = new Orchestrator();
        window.aiPanel = null;
        expect(() => orch.loadPairsForManualSelection()).not.toThrow();
        delete window.aiPanel;
    });

    test('N6: Wheel _updateFilteredCount updates DOM', () => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        const wheel = new RouletteWheel();

        wheel._updateFilteredCount(10);
        const el = document.getElementById('filteredCount');
        expect(el.textContent).toBe('Bet: 10 nums');
    });

    test('N7: Wheel _updateFilteredCount null clears text', () => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        const wheel = new RouletteWheel();

        wheel._updateFilteredCount(5);
        wheel._updateFilteredCount(null);
        const el = document.getElementById('filteredCount');
        expect(el.textContent).toBe('');
    });

    test('N8: Wheel _syncMoneyPanel calls moneyPanel.setPrediction', () => {
        setupDOM();
        setupCanvasMock();
        const RouletteWheel = loadRouletteWheel();
        const wheel = new RouletteWheel();

        const mockSet = jest.fn();
        window.moneyPanel = { setPrediction: mockSet };
        wheel._syncMoneyPanel({ numbers: [1, 2, 3] });
        expect(mockSet).toHaveBeenCalledWith({ numbers: [1, 2, 3] });
        delete window.moneyPanel;
    });
});
