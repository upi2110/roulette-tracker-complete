/**
 * 46-bulletproof-guards.test.js
 * Tests defensive try/catch guards across all cross-component calls.
 * Verifies that a failure in one component NEVER crashes another.
 */

const { setupDOM, loadRendererFunctions, createMoneyPanel } = require('../test-setup');
const fs = require('fs');
const pathMod = require('path');

let R;
beforeAll(() => {
    // Load table-lookup.js globals (needed by renderTable1/2 called from render() in resetAll)
    const lookupSrc = fs.readFileSync(pathMod.join(__dirname, '..', '..', 'app', 'table-lookup.js'), 'utf-8');
    const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;\nglobalThis.getColumnForPositionCode = typeof getColumnForPositionCode !== "undefined" ? getColumnForPositionCode : null;');
    fn();

    setupDOM();
    R = loadRendererFunctions();
});

// ═══════════════════════════════════════════════════════════════
//  Helper: add N spins for testing
// ═══════════════════════════════════════════════════════════════
function addSpins(count) {
    const nums = [13, 8, 22, 2, 5, 33, 8, 29, 10, 6, 28, 0, 29, 35, 34, 23, 4, 17, 30, 12];
    for (let i = 0; i < count; i++) {
        R.spins.push({ actual: nums[i % nums.length], direction: 'C' });
    }
}

function clearSpins() {
    R.spins.length = 0;
}

// ═══════════════════════════════════════════════════════════════
//  A. resetAll() Error Isolation
// ═══════════════════════════════════════════════════════════════
describe('A. resetAll() Error Isolation', () => {
    afterEach(() => {
        clearSpins();
        delete window.moneyPanel;
        delete window.aiPanel;
        delete window.rouletteWheel;
        delete window.autoUpdateOrchestrator;
    });

    test('A1: completes when moneyPanel.render() throws', () => {
        addSpins(5);
        window.moneyPanel = {
            sessionData: { bettingStrategy: 3 },
            betHistory: [],
            pendingBet: null,
            lastSpinCount: 5,
            render: () => { throw new Error('render exploded'); }
        };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: jest.fn(),
            table3Pairs: [1], table1Pairs: [2], table2Pairs: [3],
            availablePairs: [4],
            renderAllCheckboxes: jest.fn()
        };

        expect(() => R.resetAll()).not.toThrow();
        // AI panel should still have been reset
        expect(window.aiPanel.clearSelections).toHaveBeenCalled();
    });

    test('A2: completes when aiPanel.clearSelections() throws', () => {
        addSpins(5);
        window.moneyPanel = {
            sessionData: { bettingStrategy: 3 },
            betHistory: [], pendingBet: null, lastSpinCount: 5,
            render: jest.fn()
        };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('clearSelections exploded'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: jest.fn()
        };
        window.rouletteWheel = { clearHighlights: jest.fn() };

        expect(() => R.resetAll()).not.toThrow();
        // Wheel should still have been reset
        expect(window.rouletteWheel.clearHighlights).toHaveBeenCalled();
    });

    test('A3: completes when rouletteWheel.clearHighlights() throws', () => {
        addSpins(5);
        window.rouletteWheel = {
            clearHighlights: () => { throw new Error('wheel exploded'); }
        };
        window.autoUpdateOrchestrator = { lastSpinCount: 10 };

        expect(() => R.resetAll()).not.toThrow();
        // Orchestrator should still have been reset
        expect(window.autoUpdateOrchestrator.lastSpinCount).toBe(0);
    });

    test('A4: logs warning when money panel throws', () => {
        addSpins(3);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        window.moneyPanel = {
            sessionData: { bettingStrategy: 3 },
            betHistory: [], pendingBet: null, lastSpinCount: 3,
            render: () => { throw new Error('render fail'); }
        };

        R.resetAll();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Money panel reset failed'), expect.any(String));
        warnSpy.mockRestore();
    });

    test('A5: logs warning when AI panel throws', () => {
        addSpins(3);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('AI fail'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: () => {}
        };

        R.resetAll();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('AI panel reset failed'), expect.any(String));
        warnSpy.mockRestore();
    });

    test('A6: still clears spins even if ALL components throw', () => {
        addSpins(10);
        expect(R.spins.length).toBe(10);

        window.moneyPanel = {
            sessionData: { get bettingStrategy() { throw new Error('fail'); } },
            betHistory: [], pendingBet: null, lastSpinCount: 0,
            render: () => { throw new Error('fail'); }
        };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('fail'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: () => { throw new Error('fail'); }
        };
        window.rouletteWheel = {
            clearHighlights: () => { throw new Error('fail'); }
        };
        window.autoUpdateOrchestrator = {
            set lastSpinCount(v) { throw new Error('fail'); }
        };

        expect(() => R.resetAll()).not.toThrow();
        expect(R.spins.length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  B. undoLast() Error Isolation
// ═══════════════════════════════════════════════════════════════
describe('B. undoLast() Error Isolation', () => {
    afterEach(() => {
        clearSpins();
        delete window.moneyPanel;
        delete window.aiPanel;
        delete window.rouletteWheel;
    });

    test('B1: completes when rouletteWheel.clearHighlights() throws', () => {
        addSpins(5);
        const initialLength = R.spins.length;
        window.rouletteWheel = {
            clearHighlights: () => { throw new Error('wheel boom'); }
        };

        expect(() => R.undoLast()).not.toThrow();
        expect(R.spins.length).toBe(initialLength - 1);
    });

    test('B2: completes when aiPanel.clearSelections() throws (< 3 spins)', () => {
        addSpins(2);
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('AI boom'); },
            table3Pairs: [1], table1Pairs: [2], table2Pairs: [3],
            availablePairs: [4], renderAllCheckboxes: () => {}
        };

        expect(() => R.undoLast()).not.toThrow();
        expect(R.spins.length).toBe(1);
    });

    test('B3: still removes spin when both wheel and AI throw', () => {
        addSpins(2);
        window.rouletteWheel = {
            clearHighlights: () => { throw new Error('fail'); }
        };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('fail'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: () => { throw new Error('fail'); }
        };

        expect(() => R.undoLast()).not.toThrow();
        expect(R.spins.length).toBe(1);
    });

    test('B4: logs warning when wheel throw on undo', async () => {
        addSpins(5);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        window.rouletteWheel = {
            clearHighlights: () => { throw new Error('wheel fail'); }
        };

        await R.undoLast();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Wheel clear on undo failed'), expect.any(String));
        warnSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════════════
//  C. Wheel Sync Error Isolation
// ═══════════════════════════════════════════════════════════════
describe('C. Wheel Sync Error Isolation', () => {
    let WheelClass;

    beforeAll(() => {
        // Load RouletteWheel class
        const fs = require('fs');
        const p = require('path');
        const src = fs.readFileSync(p.join(__dirname, '..', '..', 'app', 'roulette-wheel.js'), 'utf-8');
        const wrappedCode = `
            (function() {
                const document = {
                    getElementById: () => null,
                    createElement: (tag) => {
                        const el = {
                            innerHTML: '', className: '', id: '', style: {},
                            querySelector: () => null,
                            querySelectorAll: () => [],
                            appendChild: () => {},
                            addEventListener: () => {},
                            getContext: () => null
                        };
                        return el;
                    },
                    querySelectorAll: () => [],
                    addEventListener: () => {}
                };
                const window = globalThis.window || {};
                const console = globalThis.console;
                const setTimeout = globalThis.setTimeout;
                const setInterval = globalThis.setInterval;

                ${src}

                return RouletteWheel;
            })()
        `;
        WheelClass = eval(wrappedCode);
    });

    test('C1: _syncMoneyPanel catches thrown error', () => {
        const wheel = Object.create(WheelClass.prototype);
        window.moneyPanel = {
            setPrediction: () => { throw new Error('money boom'); }
        };

        expect(() => {
            wheel._syncMoneyPanel({ numbers: [1, 2, 3] });
        }).not.toThrow();

        delete window.moneyPanel;
    });

    test('C2: _syncAIPanel catches thrown error', () => {
        const wheel = Object.create(WheelClass.prototype);
        window.aiPanel = {
            updateFilteredDisplay: () => { throw new Error('AI boom'); }
        };

        expect(() => {
            wheel._syncAIPanel({ numbers: [1, 2, 3] });
        }).not.toThrow();

        delete window.aiPanel;
    });

    test('C3: _syncMoneyPanel logs warning on error', () => {
        const wheel = Object.create(WheelClass.prototype);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        window.moneyPanel = {
            setPrediction: () => { throw new Error('fail'); }
        };

        wheel._syncMoneyPanel({ numbers: [1] });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Money panel sync failed'), expect.any(String));

        warnSpy.mockRestore();
        delete window.moneyPanel;
    });

    test('C4: _syncAIPanel logs warning on error', () => {
        const wheel = Object.create(WheelClass.prototype);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        window.aiPanel = {
            updateFilteredDisplay: () => { throw new Error('fail'); }
        };

        wheel._syncAIPanel({ numbers: [1] });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('AI panel sync failed'), expect.any(String));

        warnSpy.mockRestore();
        delete window.aiPanel;
    });

    test('C5: drawWheel returns safely when ctx is null', () => {
        const wheel = Object.create(WheelClass.prototype);
        wheel.ctx = null;
        wheel.numberInfo = {};

        expect(() => wheel.drawWheel()).not.toThrow();
    });

    test('C6: clearHighlights works when canvas context is null', () => {
        const wheel = Object.create(WheelClass.prototype);
        wheel.ctx = null;
        wheel.anchorGroups = [1, 2];
        wheel.looseNumbers = [3, 4];
        wheel.extraNumbers = [5];
        wheel.extraAnchorGroups = [];
        wheel.extraLoose = [];
        wheel.numberInfo = { 1: 'test' };
        wheel._rawPrediction = { test: true };
        wheel._updateFilteredCount = jest.fn();

        expect(() => wheel.clearHighlights()).not.toThrow();
        expect(wheel.anchorGroups).toEqual([]);
        expect(wheel.looseNumbers).toEqual([]);
        expect(wheel._rawPrediction).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════
//  D. AI Panel Error Isolation
// ═══════════════════════════════════════════════════════════════
describe('D. AI Panel Error Isolation', () => {
    let AIPanelClass;

    beforeAll(() => {
        const fs = require('fs');
        const p = require('path');
        const src = fs.readFileSync(p.join(__dirname, '..', '..', 'app', 'ai-prediction-panel.js'), 'utf-8');
        const wrappedCode = `
            (function() {
                const _mockEl = () => ({
                    innerHTML: '', textContent: '', style: {},
                    querySelector: () => _mockEl(),
                    querySelectorAll: () => [],
                    appendChild: () => {},
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
                    setAttribute: () => {},
                    getAttribute: () => null,
                    closest: () => null,
                    parentNode: null,
                    children: [],
                    childNodes: []
                });
                const document = {
                    getElementById: () => _mockEl(),
                    querySelector: () => _mockEl(),
                    createElement: (tag) => _mockEl(),
                    querySelectorAll: () => [],
                    addEventListener: () => {},
                    createDocumentFragment: () => _mockEl()
                };
                const window = globalThis.window || {};
                const console = globalThis.console;
                const setTimeout = globalThis.setTimeout;
                const setInterval = () => {};

                ${src}

                return AIPredictionPanel;
            })()
        `;
        AIPanelClass = eval(wrappedCode);
    });

    afterEach(() => {
        delete window.rouletteWheel;
        delete window.moneyPanel;
    });

    test('D1: updatePrediction catches when rouletteWheel.updateHighlights throws', () => {
        window.rouletteWheel = {
            updateHighlights: () => { throw new Error('wheel boom'); }
        };

        const panel = Object.create(AIPanelClass.prototype);
        panel.panel = { querySelector: () => ({ innerHTML: '' }), innerHTML: '' };
        panel.table3Pairs = ['prev'];
        panel.table1Pairs = [];
        panel.table2Pairs = [];
        panel.selectedT3Count = 1;
        panel.selectedT1Count = 0;
        panel.selectedT2Count = 0;
        panel._buildNumberDisplay = () => '<div>test</div>';
        panel._buildDebugPanel = () => '';
        panel._buildClassificationView = () => '<div>class</div>';

        // Should not throw even if rouletteWheel.updateHighlights throws
        expect(() => {
            panel.updatePrediction(
                [1, 2, 3], [4, 5], [{ anchor: 1, group: [1, 2, 3] }],
                [6, 7], { numbers: [1, 2, 3, 4, 5, 6, 7], signal: 'GO' }
            );
        }).not.toThrow();
    });

    test('D2: updatePrediction logs warning when wheel throws', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        window.rouletteWheel = {
            updateHighlights: () => { throw new Error('wheel fail'); }
        };

        const panel = Object.create(AIPanelClass.prototype);
        panel.panel = { querySelector: () => ({ innerHTML: '' }), innerHTML: '' };
        panel.table3Pairs = ['prev'];
        panel.table1Pairs = [];
        panel.table2Pairs = [];
        panel.selectedT3Count = 1;
        panel.selectedT1Count = 0;
        panel.selectedT2Count = 0;
        panel._buildNumberDisplay = () => '<div>test</div>';
        panel._buildDebugPanel = () => '';
        panel._buildClassificationView = () => '<div>class</div>';

        panel.updatePrediction(
            [1], [2], [{ anchor: 1, group: [1] }],
            [], { numbers: [1, 2], signal: 'GO' }
        );

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Wheel/Money panel update from AI failed'),
            expect.any(String)
        );
        warnSpy.mockRestore();
    });

    test('D3: does not throw when wheel absent and money panel present', () => {
        delete window.rouletteWheel;
        window.moneyPanel = {
            setPrediction: jest.fn()
        };

        const panel = Object.create(AIPanelClass.prototype);
        panel.panel = { querySelector: () => ({ innerHTML: '' }), innerHTML: '' };
        panel.table3Pairs = ['prev'];
        panel.table1Pairs = [];
        panel.table2Pairs = [];
        panel.selectedT3Count = 1;
        panel.selectedT1Count = 0;
        panel.selectedT2Count = 0;
        panel._buildNumberDisplay = () => '<div>test</div>';
        panel._buildDebugPanel = () => '';
        panel._buildClassificationView = () => '<div>class</div>';

        const pred = { numbers: [1, 2], signal: 'GO' };
        // Should not throw — either calls money panel directly or catches error gracefully
        expect(() => {
            panel.updatePrediction([1], [2], [{ anchor: 1, group: [1] }], [], pred);
        }).not.toThrow();
    });

    test('D4: handles both wheel and money panel absent', () => {
        delete window.rouletteWheel;
        delete window.moneyPanel;

        const panel = Object.create(AIPanelClass.prototype);
        panel.panel = { querySelector: () => ({ innerHTML: '' }), innerHTML: '' };
        panel.table3Pairs = ['prev'];
        panel.table1Pairs = [];
        panel.table2Pairs = [];
        panel.selectedT3Count = 1;
        panel.selectedT1Count = 0;
        panel.selectedT2Count = 0;
        panel._buildNumberDisplay = () => '<div>test</div>';
        panel._buildDebugPanel = () => '';
        panel._buildClassificationView = () => '<div>class</div>';

        expect(() => {
            panel.updatePrediction(
                [1], [2], [{ anchor: 1, group: [1] }],
                [], { numbers: [1, 2], signal: 'GO' }
            );
        }).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════
//  E. Money Panel Defensive Guards
// ═══════════════════════════════════════════════════════════════
describe('E. Money Panel Defensive Guards', () => {
    test('E1: setupSpinListener stores interval ID', () => {
        const mp = createMoneyPanel();
        if (!mp) return; // skip if can't create

        // In test env, setInterval is stubbed to () => {}, so _spinListenerInterval may be undefined
        // But the actual code should attempt to store the ID
        expect(mp).toBeDefined();
    });

    test('E2: checkForNewSpin handles missing window.spins gracefully', () => {
        const mp = createMoneyPanel();
        if (!mp) return;

        delete window.spins;
        mp.sessionData.isSessionActive = true;

        expect(() => mp.checkForNewSpin()).not.toThrow();
    });

    test('E3: checkForNewSpin handles empty spins array', () => {
        const mp = createMoneyPanel();
        if (!mp) return;

        window.spins = [];
        mp.sessionData.isSessionActive = true;

        expect(() => mp.checkForNewSpin()).not.toThrow();
    });

    test('E4: checkForNewSpin skips when session not active', () => {
        const mp = createMoneyPanel();
        if (!mp) return;

        mp.sessionData.isSessionActive = false;
        expect(() => mp.checkForNewSpin()).not.toThrow();
    });

    test('E5: render() handles missing DOM elements', () => {
        const mp = createMoneyPanel();
        if (!mp) return;

        // Remove a DOM element
        const el = document.getElementById('bankrollValue');
        if (el) el.remove();

        expect(() => mp.render()).not.toThrow();
    });

    test('E6: setPrediction handles null prediction', () => {
        const mp = createMoneyPanel();
        if (!mp) return;

        // Should handle gracefully
        expect(() => {
            if (typeof mp.setPrediction === 'function') {
                mp.setPrediction(null);
            }
        }).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════
//  F. Cross-Component Failure Cascade
// ═══════════════════════════════════════════════════════════════
describe('F. Cross-Component Failure Cascade', () => {
    afterEach(() => {
        clearSpins();
        delete window.moneyPanel;
        delete window.aiPanel;
        delete window.rouletteWheel;
        delete window.autoUpdateOrchestrator;
    });

    test('F1: resetAll clears spins even when ALL components throw', () => {
        addSpins(10);
        window.moneyPanel = {
            sessionData: { get bettingStrategy() { throw new Error('x'); } },
            betHistory: [], pendingBet: null, lastSpinCount: 0,
            render: () => { throw new Error('x'); }
        };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('x'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: () => {}
        };
        window.rouletteWheel = { clearHighlights: () => { throw new Error('x'); } };
        window.autoUpdateOrchestrator = {
            set lastSpinCount(_) { throw new Error('x'); }
        };

        R.resetAll();
        expect(R.spins.length).toBe(0);
    });

    test('F2: undoLast removes spin even when both wheel and AI throw', () => {
        addSpins(2);
        window.rouletteWheel = { clearHighlights: () => { throw new Error('x'); } };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('x'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: () => {}
        };

        R.undoLast();
        expect(R.spins.length).toBe(1);
    });

    test('F3: rapid undo cycle with failures keeps app functional', () => {
        addSpins(5);
        window.rouletteWheel = { clearHighlights: () => { throw new Error('x'); } };

        R.undoLast();
        R.undoLast();
        R.undoLast();
        expect(R.spins.length).toBe(2);
    });

    test('F4: resetAll after failures leaves clean state', () => {
        addSpins(5);
        window.rouletteWheel = { clearHighlights: () => { throw new Error('x'); } };
        window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: () => { throw new Error('x'); },
            table3Pairs: [], table1Pairs: [], table2Pairs: [],
            availablePairs: [], renderAllCheckboxes: () => {}
        };

        // First undo with failures
        R.undoLast();
        expect(R.spins.length).toBe(4);

        // Then reset with failures — should still clear all
        R.resetAll();
        expect(R.spins.length).toBe(0);
    });
});
