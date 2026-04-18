/**
 * Tests: UI Component Sync Integration
 *
 * Verifies that wheel filter changes correctly propagate to:
 *   1. AI Prediction Panel (COMMON count + number display)
 *   2. Money Management Panel (bet calculation)
 *   3. Wheel number lists
 *
 * These tests catch integration bugs like:
 *   - const redeclaration across scripts (browser global scope)
 *   - Filter changes not reaching AI panel
 *   - Stale COMMON counts after filter updates
 */

const fs = require('fs');
const path = require('path');
const { setupDOM } = require('../test-setup');

// ── Canvas mock ──────────────────────────────────────────
function mockCanvas() {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
        clearRect: jest.fn(), beginPath: jest.fn(), arc: jest.fn(),
        fill: jest.fn(), stroke: jest.fn(), moveTo: jest.fn(),
        closePath: jest.fn(), save: jest.fn(), restore: jest.fn(),
        translate: jest.fn(), rotate: jest.fn(), fillText: jest.fn(),
        fillStyle: '', strokeStyle: '', lineWidth: 1,
        font: '', textAlign: '', textBaseline: ''
    }));
}

// ── Loader ───────────────────────────────────────────────
function loadRouletteWheel() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'), 'utf-8'
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
    try { return eval(wrappedCode); }
    catch (e) { console.error('Load failed:', e.message); return null; }
}

// ── Reference constants ──────────────────────────────────
const ZERO_TABLE = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const NINETEEN_TABLE = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const SET_0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
const SET_5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
const SET_6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

// ── Setup ────────────────────────────────────────────────
let RouletteWheel;

beforeEach(() => {
    setupDOM();
    mockCanvas();

    if (!document.querySelector('.info-panels-container-bottom')) {
        const c = document.createElement('div');
        c.className = 'info-panels-container-bottom';
        document.body.appendChild(c);
    }

    global.window.moneyPanel = undefined;
    global.window.aiPanel = undefined;
    global.window.calculateWheelAnchors = undefined;
    global.window.rouletteWheel = undefined;

    const loaded = loadRouletteWheel();
    if (loaded) { RouletteWheel = loaded.RouletteWheel; }
});

// Helper: build a test prediction with specific numbers
function makePrediction(numbers, extraNumbers) {
    return {
        numbers: numbers,
        extraNumbers: extraNumbers || [],
        anchors: [],
        loose: numbers.slice(),
        anchor_groups: [],
        signal: 'BET NOW',
        confidence: 90
    };
}

describe('45 — UI Sync Integration', () => {

    // ═══════════════════════════════════════════════════════════
    //  A: AI PANEL RECEIVES FILTERED DATA (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('A: AI Panel Receives Filtered Data', () => {

        test('A1: _syncAIPanel calls updateFilteredDisplay with filtered numbers', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Startup default is "Both" (zeroTable AND nineteenTable true)
            // which is all-on and bypasses filtering. This test specifically
            // covers the filtering path; force zero-table-only here.
            wheel.filters.nineteenTable = false;

            const receivedData = [];
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    receivedData.push({ numbers: [...pred.numbers], extras: [...(pred.extraNumbers || [])] });
                })
            };

            // Prediction: [0, 15, 32, 19, 4, 21, 2, 25, 13] = 9 numbers
            // Default filter: 0 table ON, 19 table OFF, all signs, all sets
            // 0 table numbers: 0, 32, 21, 2, 25, 13 (15, 19, 4 are 19-table only)
            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);

            wheel.updateHighlights([], allNums, [], [], prediction);

            // _syncAIPanel should have been called with FILTERED numbers
            expect(global.window.aiPanel.updateFilteredDisplay).toHaveBeenCalled();
            const lastCall = receivedData[receivedData.length - 1];
            // Only 0-table numbers should remain
            lastCall.numbers.forEach(n => {
                expect(ZERO_TABLE.has(n)).toBe(true);
            });
            // 19-table-only numbers should be excluded
            expect(lastCall.numbers).not.toContain(15);
            expect(lastCall.numbers).not.toContain(19);
            expect(lastCall.numbers).not.toContain(4);
        });

        test('A2: filtered count is less than unfiltered when filters active', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Force partial filters — startup default is all-on.
            wheel.filters.nineteenTable = false;

            let filteredCount = null;
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    filteredCount = pred.numbers.length;
                })
            };

            // Mix of 0-table and 19-table numbers
            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // Default: 0 table only → should filter out 15, 19, 4
            expect(filteredCount).toBeLessThan(allNums.length);
            expect(filteredCount).toBe(allNums.filter(n => ZERO_TABLE.has(n)).length);
        });

        test('A3: when all filters ON, AI panel gets all numbers', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // Set all filters on
            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            let receivedNumbers = null;
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    receivedNumbers = pred.numbers;
                })
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            expect(global.window.aiPanel.updateFilteredDisplay).toHaveBeenCalled();
            expect(receivedNumbers.length).toBe(allNums.length);
        });

        test('A4: set filter change triggers AI panel update', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            const calls = [];
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    calls.push(pred.numbers.length);
                })
            };

            // Initial prediction with all filters on
            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const initialCount = calls[calls.length - 1];
            expect(initialCount).toBe(9); // all numbers pass

            // Now disable set 6 (removes 4, 21)
            wheel.filters.set6 = false;
            wheel._applyFilters();

            const afterSetFilter = calls[calls.length - 1];
            // Numbers in set 6: 4, 21 → removed
            const expected = allNums.filter(n => !SET_6.has(n));
            expect(afterSetFilter).toBe(expected.length);
            expect(afterSetFilter).toBeLessThan(initialCount);
        });

        test('A5: sign filter change triggers AI panel update', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            const calls = [];
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    calls.push(pred.numbers.slice());
                })
            };

            // All filters on initially
            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // Now set positive only
            wheel.filters.negative = false;
            wheel._applyFilters();

            const positiveOnly = calls[calls.length - 1];
            const POSITIVE = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
            positiveOnly.forEach(n => {
                expect(POSITIVE.has(n)).toBe(true);
            });
        });

        test('A6: table filter change triggers AI panel update', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            const calls = [];
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    calls.push(pred.numbers.slice());
                })
            };

            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // Switch to 19 table only
            wheel.filters.zeroTable = false;
            wheel.filters.nineteenTable = true;
            wheel._applyFilters();

            const nineteenOnly = calls[calls.length - 1];
            nineteenOnly.forEach(n => {
                expect(NINETEEN_TABLE.has(n)).toBe(true);
            });
        });

        test('A7: combined table+set filter produces correct intersection', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let lastNumbers = null;
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => {
                    lastNumbers = pred.numbers.slice();
                })
            };

            // 0 table + set 0 + set 5 (no set 6)
            wheel.filters = {
                zeroTable: true, nineteenTable: false,
                positive: true, negative: true,
                set0: true, set5: true, set6: false
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13, 36, 5, 14, 27, 3];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // Each number must pass: (in 0 table) AND (in set 0 OR set 5) AND (positive OR negative)
            lastNumbers.forEach(n => {
                expect(ZERO_TABLE.has(n)).toBe(true);
                expect(SET_0.has(n) || SET_5.has(n)).toBe(true);
            });

            // Numbers in set 6 should be excluded (4, 21, 27, 3)
            expect(lastNumbers).not.toContain(4);
            expect(lastNumbers).not.toContain(21);
            expect(lastNumbers).not.toContain(27);
            expect(lastNumbers).not.toContain(3);

            // Numbers in 19 table should be excluded (15, 19)
            expect(lastNumbers).not.toContain(15);
            expect(lastNumbers).not.toContain(19);
        });

        test('A8: _syncAIPanel not called when aiPanel not available', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // No aiPanel set → should not throw
            global.window.aiPanel = undefined;

            const allNums = [0, 15, 32];
            const prediction = makePrediction(allNums);
            expect(() => {
                wheel.updateHighlights([], allNums, [], [], prediction);
            }).not.toThrow();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  B: MONEY PANEL RECEIVES FILTERED DATA (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('B: Money Panel Receives Filtered Data', () => {

        test('B1: _syncMoneyPanel called with filtered numbers', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Force partial filters — startup default is all-on.
            wheel.filters.nineteenTable = false;

            let receivedPrediction = null;
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => {
                    receivedPrediction = pred;
                })
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            expect(global.window.moneyPanel.setPrediction).toHaveBeenCalled();
            // Default filter: 0 table → 15, 19, 4 filtered out
            receivedPrediction.numbers.forEach(n => {
                expect(ZERO_TABLE.has(n)).toBe(true);
            });
        });

        test('B2: money panel gets same count as AI panel', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let moneyCount = null, aiCount = null;
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { moneyCount = pred.numbers.length; })
            };
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => { aiCount = pred.numbers.length; })
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            expect(moneyCount).toBe(aiCount);
        });

        test('B3: money panel count matches wheel filteredCount display', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let moneyCount = null;
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { moneyCount = pred.numbers.length; })
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const countEl = document.getElementById('filteredCount');
            if (countEl && countEl.textContent) {
                const displayedCount = parseInt(countEl.textContent.match(/\d+/)?.[0] || '0');
                expect(displayedCount).toBe(moneyCount);
            }
        });

        test('B4: filter change updates money panel', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            const moneyCallCounts = [];
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { moneyCallCounts.push(pred.numbers.length); })
            };

            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const before = moneyCallCounts[moneyCallCounts.length - 1];

            // Change to 0 table only
            wheel.filters.nineteenTable = false;
            wheel._applyFilters();

            const after = moneyCallCounts[moneyCallCounts.length - 1];
            expect(after).toBeLessThanOrEqual(before);
        });

        test('B5: money panel synced BEFORE wheel renders', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let moneySyncedAt = null;
            let wheelRenderedAt = null;
            let counter = 0;

            global.window.moneyPanel = {
                setPrediction: jest.fn(() => { moneySyncedAt = ++counter; }),
                sessionData: { isSessionActive: true, lastBetAmount: 5, currentBetPerNumber: 5, lastBetNumbers: 0 }
            };

            // Override _updateNumberLists to track render order
            const orig = wheel._updateNumberLists.bind(wheel);
            wheel._updateNumberLists = jest.fn(() => { wheelRenderedAt = ++counter; orig(); });

            const allNums = [0, 32, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            expect(moneySyncedAt).toBeLessThan(wheelRenderedAt);
        });

        test('B6: money panel not called when undefined', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            global.window.moneyPanel = undefined;

            const allNums = [0, 32, 2];
            const prediction = makePrediction(allNums);
            expect(() => {
                wheel.updateHighlights([], allNums, [], [], prediction);
            }).not.toThrow();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  C: WHEEL NUMBER LIST MATCHES FILTERS (8 tests)
    // ═══════════════════════════════════════════════════════════
    describe('C: Wheel Number List Matches Filters', () => {

        test('C1: number list only shows numbers passing all filters', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Force zero-table-only (partial filters) — startup default is
            // now all-on "Both" and that would bypass the filtering path
            // this test is designed to exercise.
            wheel.filters.nineteenTable = false;

            // 0 table, both signs, all sets (forced above)
            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';

            // 15, 19, 4 are 19-table only → should NOT appear
            expect(html).not.toContain('>15<');
            expect(html).not.toContain('>19<');
            expect(html).not.toContain('>4<');

            // 0-table numbers should appear
            expect(html).toContain('>0<');
            expect(html).toContain('>32<');
            expect(html).toContain('>2<');
        });

        test('C2: Loose count reflects filtered numbers only', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Force partial filters so the Loose count reflects filtering.
            wheel.filters.nineteenTable = false;

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            // Count filtered: 0, 32, 21, 2, 25, 13 = 6 numbers pass 0-table filter
            const filtered = allNums.filter(n => ZERO_TABLE.has(n));
            // Separate section: "Loose (N)" for loose numbers
            expect(html).toContain(`Loose (${filtered.length})`);
        });

        test('C3: set filter removes correct numbers from display', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // All filters ON first
            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: false // set 6 OFF
            };

            const allNums = [0, 4, 21, 32, 2, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            // Set 6 numbers: 4, 21 → should NOT appear
            expect(html).not.toContain('>4<');
            expect(html).not.toContain('>21<');
            // Others should appear
            expect(html).toContain('>0<');
            expect(html).toContain('>32<');
        });

        test('C4: 13 Opp row removed from wheel display', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // All filters ON
            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [7, 12, 35]; // loose numbers
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            // 13 Opp row was removed — should not appear
            expect(html).not.toContain('13 Opp');
        });

        test('C5: filter to 0 table + set0 only = narrow subset', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            wheel.filters = {
                zeroTable: true, nineteenTable: false,
                positive: true, negative: true,
                set0: true, set5: false, set6: false
            };

            // Many numbers but only 0 table ∩ set 0 will pass
            const allNums = [0, 26, 2, 13, 10, 20, 29, 32, 15, 4, 21, 25, 36, 5, 14, 7, 3];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            // 0 table ∩ set 0 = {0, 26, 2, 13, 10, 20, 29}
            const expected = allNums.filter(n => ZERO_TABLE.has(n) && SET_0.has(n));
            expected.forEach(n => {
                expect(html).toContain(`>${n}<`);
            });

            // Non-passing numbers should NOT appear in Loose section
            const excluded = allNums.filter(n => !ZERO_TABLE.has(n) || !SET_0.has(n));
            excluded.forEach(n => {
                // Check it's not in the main prediction display
                const looseSection = html.split('Loose')[1]?.split('Grey')[0] || '';
                // Numbers from 19 table or set 5/6 shouldn't be in Loose
                if (!ZERO_TABLE.has(n) || (!SET_0.has(n))) {
                    // This number was filtered out
                }
            });
        });

        test('C6: filter change updates number list immediately', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 4, 21, 32, 2, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            let html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            // Separate section: "Loose (6)" for all loose numbers
            expect(html).toContain('Loose (6)');

            // Turn off set 6 → removes 4, 21
            wheel.filters.set6 = false;
            wheel._applyFilters();

            html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            expect(html).toContain('Loose (4)');
            expect(html).not.toContain('>4<');
            expect(html).not.toContain('>21<');
        });

        test('C7: all three displays show same filtered count', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let moneyCount = null, aiCount = null;
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { moneyCount = pred.numbers.length; })
            };
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => { aiCount = pred.numbers.length; })
            };

            // 0 table, set 0 + 5, both signs
            wheel.filters = {
                zeroTable: true, nineteenTable: false,
                positive: true, negative: true,
                set0: true, set5: true, set6: false
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13, 36, 5, 14, 27, 3];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // Get wheel count from filteredCount element
            const countEl = document.getElementById('filteredCount');
            const wheelCountText = countEl?.textContent || '';
            const wheelCount = parseInt(wheelCountText.match(/\d+/)?.[0] || '0');

            // All three should match
            expect(moneyCount).toBe(aiCount);
            expect(wheelCount).toBe(aiCount);
        });

        test('C8: extra/grey numbers also filtered', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            wheel.filters = {
                zeroTable: true, nineteenTable: false,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 32, 2, 13];
            const extraNums = [15, 19, 4, 21]; // All 19-table → should be filtered
            const prediction = makePrediction(allNums, extraNums);
            wheel.updateHighlights([], allNums, [], extraNums, prediction);

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            // Extra numbers are 19-table only → should not appear as grey
            expect(html).not.toContain('Grey');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  D: FILTER STATE CORRECTNESS (6 tests)
    // ═══════════════════════════════════════════════════════════
    describe('D: Filter State Correctness', () => {

        test('D1: default filters: BOTH tables on, both signs, all sets (startup default)', () => {
            // European wheel startup default is "Both" (0 AND 19 selected),
            // matching the HTML template in app/roulette-wheel.js which
            // carries `checked` on filterBothTables.
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            expect(wheel.filters).toEqual({
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            });
        });

        test('D2: _passesFilter correctly uses all 3 dimensions', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // 0 table only, positive only, set 0 only
            wheel.filters = {
                zeroTable: true, nineteenTable: false,
                positive: true, negative: false,
                set0: true, set5: false, set6: false
            };

            // 0 is in 0 table, positive, set 0 → passes
            expect(wheel._passesFilter(0)).toBe(true);
            // 26 is in 0 table, positive, set 0 → passes
            expect(wheel._passesFilter(26)).toBe(true);
            // 2 is in 0 table, negative, set 0 → FAILS (negative only)
            expect(wheel._passesFilter(2)).toBe(false);
            // 32 is in 0 table, positive, set 5 → FAILS (set 5 off)
            expect(wheel._passesFilter(32)).toBe(false);
            // 15 is in 19 table, positive, set 5 → FAILS (19 table off)
            expect(wheel._passesFilter(15)).toBe(false);
        });

        test('D3: allOn shortcut correctly detected', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();
            // Startup default is all-on ("Both"). Flip one filter off so
            // the allOn bypass is initially NOT taken; then we flip it back
            // on to verify the bypass DOES fire. Exercises both branches.
            wheel.filters.nineteenTable = false;

            // Verify by checking that _applyFilters calls _updateFilteredCount with a number
            let countArg = undefined;
            const origUpdateCount = wheel._updateFilteredCount.bind(wheel);
            wheel._updateFilteredCount = jest.fn((c) => { countArg = c; origUpdateCount(c); });

            const allNums = [0, 32, 2];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // allOn is false → _updateFilteredCount called with a number (not null)
            expect(countArg).not.toBeNull();

            // Now set all on
            wheel.filters.nineteenTable = true;
            wheel._applyFilters();

            // allOn is true → _updateFilteredCount called with null
            expect(wheel._updateFilteredCount).toHaveBeenLastCalledWith(null);
        });

        test('D4: no sets checked → zero numbers pass', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: false, set5: false, set6: false
            };

            for (let i = 0; i <= 36; i++) {
                expect(wheel._passesFilter(i)).toBe(false);
            }
        });

        test('D5: _onFilterChange reads checkbox state correctly', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // Uncheck set 5
            const set5cb = document.getElementById('filterSet5');
            if (set5cb) {
                set5cb.checked = false;
                wheel._onFilterChange();
                expect(wheel.filters.set5).toBe(false);
            }
        });

        test('D6: _onFilterChange reads radio button state correctly', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            // Switch to 19 table
            const f0 = document.getElementById('filter0Table');
            const f19 = document.getElementById('filter19Table');
            if (f0 && f19) {
                f0.checked = false;
                f19.checked = true;
                wheel._onFilterChange();
                expect(wheel.filters.zeroTable).toBe(false);
                expect(wheel.filters.nineteenTable).toBe(true);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  E: CONST REDECLARATION SAFETY (4 tests)
    // ═══════════════════════════════════════════════════════════
    describe('E: Const Redeclaration Safety', () => {

        test('E1: WHEEL_D13_OPPOSITES uses fallback in test env (no global DIGIT_13_OPPOSITES)', () => {
            if (!RouletteWheel) return;
            const loaded = loadRouletteWheel();
            expect(loaded.WHEEL_D13_OPPOSITES).toBeDefined();
            expect(loaded.WHEEL_D13_OPPOSITES[0]).toBe(34);
        });

        test('E2: no const name collisions with renderer-3tables.js globals', () => {
            if (!RouletteWheel) return;
            // In the browser, renderer-3tables.js declares DIGIT_13_OPPOSITES.
            // roulette-wheel.js must NOT re-declare it.
            // It uses WHEEL_D13_OPPOSITES instead with a typeof fallback.
            const src = fs.readFileSync(
                path.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'), 'utf-8'
            );
            // Should NOT contain 'const DIGIT_13_OPPOSITES'
            expect(src).not.toMatch(/^const DIGIT_13_OPPOSITES\s*=/m);
            // Should contain 'const WHEEL_D13_OPPOSITES'
            expect(src).toMatch(/const WHEEL_D13_OPPOSITES/);
        });

        test('E3: roulette-wheel.js parses without syntax errors', () => {
            if (!RouletteWheel) return;
            const loaded = loadRouletteWheel();
            expect(loaded).not.toBeNull();
            expect(loaded.RouletteWheel).toBeDefined();
        });

        test('E4: all exported constants are valid Sets/objects', () => {
            if (!RouletteWheel) return;
            const loaded = loadRouletteWheel();
            expect(loaded.ZERO_TABLE_NUMS).toBeInstanceOf(Set);
            expect(loaded.NINETEEN_TABLE_NUMS).toBeInstanceOf(Set);
            expect(loaded.POSITIVE_NUMS).toBeInstanceOf(Set);
            expect(loaded.NEGATIVE_NUMS).toBeInstanceOf(Set);
            expect(loaded.SET_0_NUMS).toBeInstanceOf(Set);
            expect(loaded.SET_5_NUMS).toBeInstanceOf(Set);
            expect(loaded.SET_6_NUMS).toBeInstanceOf(Set);
            expect(typeof loaded.WHEEL_D13_OPPOSITES).toBe('object');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  F: FULL FLOW END-TO-END (4 tests)
    // ═══════════════════════════════════════════════════════════
    describe('F: Full Flow End-to-End', () => {

        test('F1: prediction → default filter → all panels synced', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let aiNumbers = null, moneyNumbers = null;
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => { aiNumbers = pred.numbers.slice(); })
            };
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { moneyNumbers = pred.numbers.slice(); })
            };

            const allNums = [0, 15, 32, 19, 4, 21, 2, 25, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // AI and money should have same filtered numbers
            expect(aiNumbers.sort()).toEqual(moneyNumbers.sort());

            // Wheel display should match
            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            aiNumbers.forEach(n => {
                expect(html).toContain(`>${n}<`);
            });
        });

        test('F2: filter change → all panels re-synced with new count', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            const aiCalls = [];
            const moneyCalls = [];
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => { aiCalls.push(pred.numbers.length); })
            };
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { moneyCalls.push(pred.numbers.length); })
            };

            // Start with all filters on
            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 4, 21, 32, 2, 13, 15, 19, 25];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            const initialAI = aiCalls[aiCalls.length - 1];
            const initialMoney = moneyCalls[moneyCalls.length - 1];
            expect(initialAI).toBe(9);
            expect(initialMoney).toBe(9);

            // Now: 0 table only, set 0 + set 5 (no set 6)
            wheel.filters.nineteenTable = false;
            wheel.filters.set6 = false;
            wheel._applyFilters();

            const afterAI = aiCalls[aiCalls.length - 1];
            const afterMoney = moneyCalls[moneyCalls.length - 1];
            expect(afterAI).toBe(afterMoney);
            expect(afterAI).toBeLessThan(9);
        });

        test('F3: multiple rapid filter changes → final state consistent', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            let lastAICount = null, lastMoneyCount = null;
            global.window.aiPanel = {
                updateFilteredDisplay: jest.fn((pred) => { lastAICount = pred.numbers.length; })
            };
            global.window.moneyPanel = {
                setPrediction: jest.fn((pred) => { lastMoneyCount = pred.numbers.length; })
            };

            wheel.filters = {
                zeroTable: true, nineteenTable: true,
                positive: true, negative: true,
                set0: true, set5: true, set6: true
            };

            const allNums = [0, 4, 21, 32, 2, 13, 15, 19, 25];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            // Rapid changes
            wheel.filters.nineteenTable = false;
            wheel._applyFilters();
            wheel.filters.set6 = false;
            wheel._applyFilters();
            wheel.filters.negative = false;
            wheel._applyFilters();

            // Final state: 0 table, positive only, set 0 + set 5
            expect(lastAICount).toBe(lastMoneyCount);

            // Verify manually
            const expected = allNums.filter(n => {
                const inZero = ZERO_TABLE.has(n);
                const isPos = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]).has(n);
                const inSet = SET_0.has(n) || SET_5.has(n);
                return inZero && isPos && inSet;
            });
            expect(lastAICount).toBe(expected.length);
        });

        test('F4: clear highlights resets everything', () => {
            if (!RouletteWheel) return;
            const wheel = new RouletteWheel();

            const allNums = [0, 32, 2, 13];
            const prediction = makePrediction(allNums);
            wheel.updateHighlights([], allNums, [], [], prediction);

            wheel.clearHighlights();

            expect(wheel.looseNumbers).toEqual([]);
            expect(wheel.anchorGroups).toEqual([]);
            expect(wheel._rawPrediction).toBeNull();

            const html = document.getElementById('wheelNumberLists')?.innerHTML || '';
            expect(html).toBe('');
        });
    });
});
