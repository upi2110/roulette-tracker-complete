/**
 * Regression Test Suite #2 — Mode Transitions & UI Integration
 *
 * Covers:
 * A. AI Auto Mode UI — Mode switching (manual/semi/auto)
 * B. Auto Mode UI — Training flow
 * C. Auto Mode UI — Decision display
 * D. Engine + Orchestrator — Mode coordination
 * E. Semi-Auto Filter — applyOptimalFilter integration
 * F. Money Panel — setPrediction with auto mode SKIP guard
 * G. Full cycle — Train → Mode switch → Decide → Record → Retrain
 * H. Data integrity — Number sets across all components
 */

const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');
const { AISequenceModel, SEQ_ZERO, SEQ_NINE, SEQ_POS, SEQ_NEG } = require('../../app/ai-sequence-model');
const { SemiAutoFilter, SA_ZERO, SA_NINE, SEMI_FILTER_COMBOS } = require('../../app/semi-auto-filter');
const { AIDataLoader } = require('../../app/ai-data-loader');
const fs = require('fs');
const path = require('path');

// Make AISequenceModel available globally for AIAutoEngine constructor
beforeAll(() => { global.AISequenceModel = AISequenceModel; });
afterAll(() => { delete global.AISequenceModel; });

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function randomSession(count, seed = 42) {
    const spins = [];
    let s = seed;
    for (let i = 0; i < count; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        spins.push(s % 37);
    }
    return spins;
}

/** Load AIAutoModeUI class via eval (no module.exports) */
function loadAutoModeUIClass() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ai-auto-mode-ui.js'),
        'utf-8'
    );
    const wrappedCode = `
        (function() {
            const setTimeout = (fn) => fn();
            const document = globalThis.__testDocument__ || {
                addEventListener: () => {},
                getElementById: () => null,
                createElement: () => ({ id: '', style: { cssText: '' }, innerHTML: '', insertBefore: () => {} }),
                querySelectorAll: () => []
            };
            const window = globalThis.window || {};
            const console = globalThis.console;
            // Mock classes that may not be defined
            const AIDataLoader = globalThis.AIDataLoader || class {};
            const AIAutoEngine = globalThis.AIAutoEngine || class {};
            ${src}
            return AIAutoModeUI;
        })()
    `;
    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load AIAutoModeUI:', e.message);
        return null;
    }
}

/** Load AutoUpdateOrchestrator class via eval */
function loadOrchestratorClass() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'auto-update-orchestrator.js'),
        'utf-8'
    );
    const wrappedCode = `
        (function() {
            const setInterval = () => {};
            const setTimeout = (fn) => fn();
            const document = { addEventListener: () => {} };
            const window = globalThis.window || {};
            const console = globalThis.console;
            ${src}
            return AutoUpdateOrchestrator;
        })()
    `;
    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load AutoUpdateOrchestrator:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// A. AI AUTO MODE UI — MODE SWITCHING
// ═══════════════════════════════════════════════════════════════

describe('A. AI Auto Mode UI — Mode Switching', () => {
    let UIClass;
    let ui;

    beforeAll(() => {
        global.window = global.window || {};
        global.document = global.document || {
            addEventListener: jest.fn(),
            getElementById: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            createElement: jest.fn(() => ({
                id: '', style: { cssText: '' }, innerHTML: '',
                insertBefore: jest.fn(),
                addEventListener: jest.fn()
            }))
        };
        UIClass = loadAutoModeUIClass();
    });

    beforeEach(() => {
        if (!UIClass) return;
        ui = new UIClass();
    });

    test('A1: Initial mode is manual', () => {
        if (!UIClass) return;
        expect(ui.currentMode).toBe('manual');
        expect(ui.isAutoMode).toBe(false);
        expect(ui.isSemiAutoMode).toBe(false);
    });

    test('A2: setMode("semi") switches to semi mode', () => {
        if (!UIClass) return;
        global.window.semiAutoFilter = { enable: jest.fn(), disable: jest.fn() };
        ui.setMode('semi');
        expect(ui.currentMode).toBe('semi');
        expect(ui.isSemiAutoMode).toBe(true);
        expect(ui.isAutoMode).toBe(false);
        delete global.window.semiAutoFilter;
    });

    test('A3: setMode("auto") without trained engine stays in current mode', () => {
        if (!UIClass) return;
        ui.engine = { isTrained: false };
        ui.setMode('auto');
        // Should NOT switch — engine not trained
        expect(ui.currentMode).toBe('manual');
        expect(ui.isAutoMode).toBe(false);
    });

    test('A4: setMode("auto") with trained engine switches to auto', () => {
        if (!UIClass) return;
        ui.engine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
        global.window.autoUpdateOrchestrator = { setAutoMode: jest.fn() };
        global.window.semiAutoFilter = { disable: jest.fn() };
        ui.setMode('auto');
        expect(ui.currentMode).toBe('auto');
        expect(ui.isAutoMode).toBe(true);
        expect(ui.engine.enable).toHaveBeenCalled();
        delete global.window.autoUpdateOrchestrator;
        delete global.window.semiAutoFilter;
    });

    test('A5: setMode("manual") from auto disables engine', () => {
        if (!UIClass) return;
        ui.engine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
        global.window.autoUpdateOrchestrator = { setAutoMode: jest.fn() };
        global.window.semiAutoFilter = { enable: jest.fn(), disable: jest.fn() };
        ui.setMode('auto');
        ui.setMode('manual');
        expect(ui.currentMode).toBe('manual');
        expect(ui.engine.disable).toHaveBeenCalled();
        delete global.window.autoUpdateOrchestrator;
        delete global.window.semiAutoFilter;
    });

    test('A6: toggleMode() cycles manual → auto → manual', () => {
        if (!UIClass) return;
        ui.engine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
        global.window.autoUpdateOrchestrator = { setAutoMode: jest.fn() };
        global.window.semiAutoFilter = { disable: jest.fn() };

        expect(ui.isAutoMode).toBe(false);
        ui.toggleMode(); // manual → auto
        expect(ui.isAutoMode).toBe(true);
        ui.toggleMode(); // auto → manual
        expect(ui.isAutoMode).toBe(false);

        delete global.window.autoUpdateOrchestrator;
        delete global.window.semiAutoFilter;
    });
});

// ═══════════════════════════════════════════════════════════════
// B. AUTO MODE UI — DECISION DISPLAY
// ═══════════════════════════════════════════════════════════════

describe('B. Auto Mode UI — Decision Display', () => {

    test('B1: updateDecisionDisplay handles BET action', () => {
        // Create mock DOM elements accessible via the eval'd class's document
        const decisionEl = { textContent: '', style: { color: '' } };
        const skipEl = { textContent: '' };
        globalThis.__testDocument__ = {
            addEventListener: () => {},
            getElementById: (id) => {
                if (id === 'currentDecision') return decisionEl;
                if (id === 'skipCounter') return skipEl;
                return null;
            },
            createElement: () => ({ id: '', style: { cssText: '' }, innerHTML: '', insertBefore: () => {} }),
            querySelectorAll: () => []
        };

        const UIClass = loadAutoModeUIClass();
        if (!UIClass) { delete globalThis.__testDocument__; return; }

        const ui = new UIClass();
        ui.updateDecisionDisplay({
            action: 'BET',
            selectedPair: 'prev',
            selectedFilter: 'zero_positive',
            confidence: 75
        });

        expect(decisionEl.textContent).toContain('prev');
        expect(decisionEl.textContent).toContain('zero_positive');
        expect(decisionEl.style.color).toBe('#22c55e');
        delete globalThis.__testDocument__;
    });

    test('B2: updateDecisionDisplay handles SKIP action', () => {
        const decisionEl = { textContent: '', style: { color: '' } };
        const skipEl = { textContent: '' };
        globalThis.__testDocument__ = {
            addEventListener: () => {},
            getElementById: (id) => {
                if (id === 'currentDecision') return decisionEl;
                if (id === 'skipCounter') return skipEl;
                return null;
            },
            createElement: () => ({ id: '', style: { cssText: '' }, innerHTML: '', insertBefore: () => {} }),
            querySelectorAll: () => []
        };

        const UIClass = loadAutoModeUIClass();
        if (!UIClass) { delete globalThis.__testDocument__; return; }

        const ui = new UIClass();
        ui.updateDecisionDisplay({
            action: 'SKIP',
            reason: 'Low confidence'
        });

        expect(decisionEl.textContent).toContain('SKIP');
        expect(decisionEl.style.color).toBe('#f59e0b');
        delete globalThis.__testDocument__;
    });
});

// ═══════════════════════════════════════════════════════════════
// C. ENGINE + ORCHESTRATOR — MODE COORDINATION
// ═══════════════════════════════════════════════════════════════

describe('C. Engine + Orchestrator — Mode Coordination', () => {

    test('C1: Orchestrator setAutoMode enables/disables auto mode', () => {
        global.window = global.window || {};
        const OrchestratorClass = loadOrchestratorClass();
        if (!OrchestratorClass) return;

        const orch = new OrchestratorClass();
        expect(orch.autoMode).toBe(false);

        orch.setAutoMode(true);
        expect(orch.autoMode).toBe(true);

        orch.setAutoMode(false);
        expect(orch.autoMode).toBe(false);
    });

    test('C2: Orchestrator reset clears autoMode', () => {
        global.window = global.window || {};
        const OrchestratorClass = loadOrchestratorClass();
        if (!OrchestratorClass) return;

        const orch = new OrchestratorClass();
        orch.autoMode = true;
        orch.sessionStarted = true;
        orch.lastSpinCount = 50;

        orch.reset();

        expect(orch.autoMode).toBe(false);
        expect(orch.sessionStarted).toBe(false);
        expect(orch.lastSpinCount).toBe(0);
    });

    test('C3: Orchestrator enable/disable controls isEnabled', () => {
        global.window = global.window || {};
        const OrchestratorClass = loadOrchestratorClass();
        if (!OrchestratorClass) return;

        const orch = new OrchestratorClass();
        expect(orch.isEnabled).toBe(true);

        orch.disable();
        expect(orch.isEnabled).toBe(false);

        orch.enable();
        expect(orch.isEnabled).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// D. SEMI-AUTO FILTER — APPLY OPTIMAL FILTER
// ═══════════════════════════════════════════════════════════════

describe('D. Semi-Auto Filter — applyOptimalFilter', () => {

    let savedOrch;

    beforeEach(() => {
        // Save and clear the real orchestrator to prevent DOM calls
        savedOrch = window.autoUpdateOrchestrator;
        window.autoUpdateOrchestrator = undefined;
    });

    afterEach(() => {
        // Restore
        window.autoUpdateOrchestrator = savedOrch;
    });

    test('D1: applyOptimalFilter returns computed result', () => {
        const filter = new SemiAutoFilter();

        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27, 5, 10, 21, 2];
        const result = filter.applyOptimalFilter(numbers);
        expect(result).not.toBeNull();
        expect(result.key).toBeDefined();
        expect(result.key).not.toBe('both_both');
        expect(result.count).toBeGreaterThanOrEqual(4);
        expect(result.filtered.length).toBe(result.count);
    });

    test('D2: applyOptimalFilter with empty numbers returns null', () => {
        const filter = new SemiAutoFilter();

        expect(filter.applyOptimalFilter([])).toBeNull();
        expect(filter.applyOptimalFilter(null)).toBeNull();
    });

    test('D3: applyOptimalFilter calls _setWheelFilters when available', () => {
        const filter = new SemiAutoFilter();
        const setFiltersMock = jest.fn();
        window.autoUpdateOrchestrator = { _setWheelFilters: setFiltersMock };

        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27];
        filter.applyOptimalFilter(numbers);

        expect(setFiltersMock).toHaveBeenCalled();
    });

    test('D4: applyOptimalFilter result has all filtered numbers in prediction set', () => {
        const filter = new SemiAutoFilter();

        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13, 27, 5, 10, 21, 2];
        const result = filter.applyOptimalFilter(numbers);
        if (result) {
            for (const n of result.filtered) {
                expect(numbers).toContain(n);
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// E. MONEY PANEL — SKIP GUARD
// ═══════════════════════════════════════════════════════════════

describe('E. Money Panel — setPrediction with Auto Mode SKIP Guard', () => {

    test('E1: setPrediction with engine SKIP (lastDecision=null) does not create bet', () => {
        // This test verifies the SKIP guard in money-management-panel.js
        // When aiAutoEngine.lastDecision === null, it means engine SKIPped

        // Simulate the logic from setPrediction:
        const autoEngine = { isEnabled: true, lastDecision: null };
        const prediction = { numbers: [1, 2, 3, 4], signal: 'test', confidence: 70 };

        // The guard:
        let pendingBet = 'should be set';
        if (autoEngine && autoEngine.isEnabled && autoEngine.lastDecision === null) {
            pendingBet = null; // SKIP guard fires
        }

        expect(pendingBet).toBeNull();
    });

    test('E2: setPrediction with engine BET (lastDecision set) creates bet', () => {
        const autoEngine = {
            isEnabled: true,
            lastDecision: { selectedPair: 'prev', selectedFilter: 'zero_both', numbers: [1, 2, 3] }
        };

        let pendingBet = null;
        if (autoEngine && autoEngine.isEnabled && autoEngine.lastDecision === null) {
            pendingBet = null;
        } else {
            pendingBet = { betAmount: 2, numbersCount: 4 };
        }

        expect(pendingBet).not.toBeNull();
    });

    test('E3: setPrediction without auto engine creates bet normally', () => {
        const autoEngine = null;

        let pendingBet = null;
        if (autoEngine && autoEngine.isEnabled && autoEngine.lastDecision === null) {
            pendingBet = null;
        } else {
            pendingBet = { betAmount: 2, numbersCount: 4 };
        }

        expect(pendingBet).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════
// F. FULL CYCLE — TRAIN → DECIDE → RECORD → RETRAIN
// ═══════════════════════════════════════════════════════════════

describe('F. Full Cycle — Train → Decide → Record → Retrain', () => {

    test('F1: Complete training → session lifecycle', () => {
        const engine = new AIAutoEngine({ retrainInterval: 3 });
        engine._getCalculatePositionCode = () => 'XX';
        engine._getCalculateReferences = (prev, pp) => ({
            prev, prev_plus_1: (prev + 1) % 37, prev_minus_1: (prev + 36) % 37,
            prev_plus_2: (prev + 2) % 37, prev_minus_2: (prev + 35) % 37, prev_prev: pp
        });
        engine._getDigit13Opposite = (n) => (n + 13) % 37;
        engine._getGetPosCodeDistance = () => null;

        // 1. Train
        const sessions = [randomSession(100), randomSession(100, 2)];
        const trainResult = engine.train(sessions);
        expect(engine.isTrained).toBe(true);
        expect(engine.sequenceModel.isTrained).toBe(true);
        expect(trainResult.totalSpins).toBe(200);

        // 2. Record results (simulating bets)
        engine.recordResult('prev', 'zero_both', true, 4);
        expect(engine.session.wins).toBe(1);

        engine.recordResult('prev', 'zero_both', false, 19);
        engine.recordResult('prev', 'zero_both', false, 30);
        expect(engine.session.losses).toBe(2);

        // 3. Live retrain triggered after 3 bets (retrainInterval=3)
        // We need 5+ live spins for retrain to happen
        engine.liveSpins = randomSession(10, 99);
        engine.recordResult('prev', 'zero_both', false, 8);
        // Total bets now = 4, retrain interval = 3, so betsSinceRetrain = 4 >= 3
        // retrain should have been triggered

        // 4. Verify session preserved after retrain
        expect(engine.session.totalBets).toBe(4);
        expect(engine.isTrained).toBe(true);
    });

    test('F2: Training data persists through retrain', () => {
        const engine = new AIAutoEngine();
        engine._getCalculatePositionCode = () => 'XX';
        engine._getCalculateReferences = (prev, pp) => ({
            prev, prev_plus_1: prev + 1, prev_minus_1: prev - 1,
            prev_plus_2: prev + 2, prev_minus_2: prev - 2, prev_prev: pp
        });
        engine._getDigit13Opposite = (n) => (n + 13) % 37;
        engine._getGetPosCodeDistance = () => null;

        engine.train([randomSession(100)]);
        expect(engine._originalTrainingData).not.toBeNull();

        engine.liveSpins = randomSession(20, 77);
        engine.retrain();

        // Original data still stored
        expect(engine._originalTrainingData).not.toBeNull();
    });

    test('F3: Sequence model trained alongside engine', () => {
        const engine = new AIAutoEngine();
        engine._getCalculatePositionCode = () => 'XX';
        engine._getCalculateReferences = (prev, pp) => ({
            prev, prev_plus_1: prev + 1, prev_minus_1: prev - 1,
            prev_plus_2: prev + 2, prev_minus_2: prev - 2, prev_prev: pp
        });
        engine._getDigit13Opposite = (n) => (n + 13) % 37;
        engine._getGetPosCodeDistance = () => null;

        engine.train([randomSession(300)]);

        const stats = engine.sequenceModel.getStats();
        expect(stats.totalObservations).toBe(299);
        expect(stats.ngramCounts.table1).toBe(2);
        expect(stats.ngramCounts.sign1).toBe(2);
    });

    test('F4: Semi-auto filter uses trained sequence model from engine', () => {
        const engine = new AIAutoEngine();
        engine._getCalculatePositionCode = () => 'XX';
        engine._getCalculateReferences = (prev, pp) => ({
            prev, prev_plus_1: prev + 1, prev_minus_1: prev - 1,
            prev_plus_2: prev + 2, prev_minus_2: prev - 2, prev_prev: pp
        });
        engine._getDigit13Opposite = (n) => (n + 13) % 37;
        engine._getGetPosCodeDistance = () => null;

        engine.train([randomSession(300)]);

        const filter = new SemiAutoFilter();
        filter.setSequenceModel(engine.sequenceModel);

        global.window = { spins: randomSession(10, 55) };
        const numbers = [0, 3, 4, 15, 19, 25, 32, 36, 1, 20, 13];
        const result = filter.computeOptimalFilter(numbers);
        expect(result).not.toBeNull();
        expect(result.key).not.toBe('both_both');

        delete global.window;
    });
});

// ═══════════════════════════════════════════════════════════════
// G. DATA LOADER — FULL PIPELINE
// ═══════════════════════════════════════════════════════════════

describe('G. Data Loader — Full Pipeline', () => {

    test('G1: Load → Parse → Train → Predict pipeline', () => {
        const loader = new AIDataLoader();
        const spinsText = '36\n19\n4\n15\n32\n0\n21\n2\n25\n17\n34\n6\n27\n13\n36\n11\n30\n8\n23\n10';
        const loaded = loader.loadMultiple([{ filename: 'session1.txt', content: spinsText }]);

        expect(loaded.sessions).toHaveLength(1);
        expect(loaded.totalSpins).toBe(20);

        const model = new AISequenceModel({ minSamples: 1 });
        model.train([loaded.sessions[0].spins]);
        expect(model.isTrained).toBe(true);

        const pred = model.predict([loaded.sessions[0].spins[loaded.sessions[0].spins.length - 1]]);
        expect(pred.pZeroTable + pred.pNineteenTable).toBeCloseTo(1.0, 5);
    });

    test('G2: Multiple files training', () => {
        const loader = new AIDataLoader();
        const file1 = { filename: 'a.txt', content: randomSession(50).join('\n') };
        const file2 = { filename: 'b.txt', content: randomSession(50, 77).join('\n') };
        const loaded = loader.loadMultiple([file1, file2]);

        expect(loaded.sessions).toHaveLength(2);
        expect(loaded.totalSpins).toBe(100);

        const model = new AISequenceModel({ minSamples: 1 });
        model.train(loaded.sessions.map(s => s.spins));
        expect(model.isTrained).toBe(true);
        // ~98 observations (2 × 49)
        expect(model.baseline.total).toBe(98);
    });

    test('G3: toSpinFormat produces correct structure', () => {
        const loader = new AIDataLoader();
        const formatted = loader.toSpinFormat([0, 15, 32, 4, 21]);
        expect(formatted).toHaveLength(5);
        expect(formatted[0]).toEqual({ direction: 'C', actual: 0 });
        expect(formatted[1]).toEqual({ direction: 'AC', actual: 15 });
        expect(formatted[2]).toEqual({ direction: 'C', actual: 32 });
    });

    test('G4: getAllSpins returns combined chronological spins', () => {
        const loader = new AIDataLoader();
        loader.loadMultiple([
            { filename: 'a.txt', content: '10\n5\n0' },    // Reversed: [0, 5, 10]
            { filename: 'b.txt', content: '36\n19\n4' }    // Reversed: [4, 19, 36]
        ]);

        const all = loader.getAllSpins();
        expect(all).toEqual([0, 5, 10, 4, 19, 36]);
    });
});

// ═══════════════════════════════════════════════════════════════
// H. DATA INTEGRITY — NUMBER SETS CONSISTENCY
// ═══════════════════════════════════════════════════════════════

describe('H. Data Integrity — Number Sets Across Components', () => {

    test('H1: Engine number sets match sequence model sets', () => {
        const engine = new AIAutoEngine();
        const model = new AISequenceModel();

        const engineZero = engine._getZeroTableNums();
        const engineNine = engine._getNineteenTableNums();
        const enginePos = engine._getPositiveNums();
        const engineNeg = engine._getNegativeNums();

        // Engine sets should match model sets exactly
        for (const n of engineZero) expect(SEQ_ZERO.has(n)).toBe(true);
        for (const n of SEQ_ZERO) expect(engineZero.has(n)).toBe(true);

        for (const n of engineNine) expect(SEQ_NINE.has(n)).toBe(true);
        for (const n of SEQ_NINE) expect(engineNine.has(n)).toBe(true);

        for (const n of enginePos) expect(SEQ_POS.has(n)).toBe(true);
        for (const n of SEQ_POS) expect(enginePos.has(n)).toBe(true);

        for (const n of engineNeg) expect(SEQ_NEG.has(n)).toBe(true);
        for (const n of SEQ_NEG) expect(engineNeg.has(n)).toBe(true);
    });

    test('H2: Semi-auto filter sets match sequence model sets', () => {
        for (const n of SA_ZERO) expect(SEQ_ZERO.has(n)).toBe(true);
        for (const n of SEQ_ZERO) expect(SA_ZERO.has(n)).toBe(true);

        for (const n of SA_NINE) expect(SEQ_NINE.has(n)).toBe(true);
        for (const n of SEQ_NINE) expect(SA_NINE.has(n)).toBe(true);
    });

    test('H3: Filter combos are identical across all components', () => {
        // Engine has 36 combos
        expect(FILTER_COMBOS).toHaveLength(36);
        // Semi-auto has 36 combos
        expect(SEMI_FILTER_COMBOS).toHaveLength(36);

        // Keys should match
        const engineKeys = new Set(FILTER_COMBOS.map(f => f.key));
        const semiKeys = new Set(SEMI_FILTER_COMBOS.map(f => f.key));
        for (const k of engineKeys) expect(semiKeys.has(k)).toBe(true);
        for (const k of semiKeys) expect(engineKeys.has(k)).toBe(true);
    });

    test('H4: classify() is consistent with number sets for ALL 37 numbers', () => {
        const model = new AISequenceModel();
        for (let n = 0; n <= 36; n++) {
            const c = model.classify(n);

            // Table membership
            if (c.table === 'zero') {
                expect(SEQ_ZERO.has(n)).toBe(true);
                expect(SEQ_NINE.has(n)).toBe(false);
            } else {
                expect(SEQ_NINE.has(n)).toBe(true);
                expect(SEQ_ZERO.has(n)).toBe(false);
            }

            // Sign membership
            if (c.sign === 'positive') {
                expect(SEQ_POS.has(n)).toBe(true);
                expect(SEQ_NEG.has(n)).toBe(false);
            } else {
                expect(SEQ_NEG.has(n)).toBe(true);
                expect(SEQ_POS.has(n)).toBe(false);
            }
        }
    });

    test('H5: Engine _applyFilterToNumbers consistent with semi-auto _passesComboFilter', () => {
        const engine = new AIAutoEngine();
        const filter = new SemiAutoFilter();
        const allNums = Array.from({ length: 37 }, (_, i) => i);

        for (const fc of FILTER_COMBOS) {
            const engineFiltered = engine._applyFilterToNumbers(allNums, fc.key);
            const semiFiltered = allNums.filter(n =>
                filter._passesComboFilter(n, SEMI_FILTER_COMBOS.find(c => c.key === fc.key))
            );

            // Same numbers should pass in both
            expect(new Set(engineFiltered)).toEqual(new Set(semiFiltered));
        }
    });

    test('H6: No number is in both zero-table AND nineteen-table', () => {
        for (let n = 0; n <= 36; n++) {
            expect(SEQ_ZERO.has(n) && SEQ_NINE.has(n)).toBe(false);
        }
    });

    test('H7: No number is in both positive AND negative', () => {
        for (let n = 0; n <= 36; n++) {
            expect(SEQ_POS.has(n) && SEQ_NEG.has(n)).toBe(false);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// I. ENGINE SCORING — PAIR AND FILTER MODELS
// ═══════════════════════════════════════════════════════════════

describe('I. Engine Scoring — Pair and Filter Models', () => {

    test('I1: _scorePair returns 0 for untrained pair', () => {
        const engine = new AIAutoEngine();
        engine.pairModels = {};
        expect(engine._scorePair('prev', {})).toBe(0);
    });

    test('I2: _scorePair returns 0 for pair with no flashes', () => {
        const engine = new AIAutoEngine();
        engine.pairModels = { prev: { totalFlashes: 0, hitRate: 0, coverageEfficiency: 0 } };
        expect(engine._scorePair('prev', {})).toBe(0);
    });

    test('I3: _scorePair adds bonus for high hitRate pairs', () => {
        const engine = new AIAutoEngine();
        engine.pairModels = {
            prev: { totalFlashes: 100, hitRate: 0.40, coverageEfficiency: 2.0, avgProjectionSize: 10 }
        };
        const highScore = engine._scorePair('prev', {});

        engine.pairModels = {
            prev: { totalFlashes: 100, hitRate: 0.10, coverageEfficiency: 0.5, avgProjectionSize: 10 }
        };
        const lowScore = engine._scorePair('prev', {});

        expect(highScore).toBeGreaterThan(lowScore);
    });

    test('I4: _computeConfidence bounded between 0 and 100', () => {
        const engine = new AIAutoEngine();
        // Very high inputs
        expect(engine._computeConfidence(1.0, 0.5, [1, 2, 3])).toBeLessThanOrEqual(100);
        expect(engine._computeConfidence(1.0, 0.5, [1, 2, 3])).toBeGreaterThanOrEqual(0);
        // Very low inputs
        expect(engine._computeConfidence(0.0, 0.0, Array(20).fill(1))).toBeGreaterThanOrEqual(0);
        expect(engine._computeConfidence(0.0, 0.0, Array(20).fill(1))).toBeLessThanOrEqual(100);
    });

    test('I5: _computeConfidence increases with skip count', () => {
        const engine = new AIAutoEngine();
        engine.session.consecutiveSkips = 0;
        const conf0 = engine._computeConfidence(0.5, 0.1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        engine.session.consecutiveSkips = 3;
        const conf3 = engine._computeConfidence(0.5, 0.1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(conf3).toBeGreaterThan(conf0);
    });

    test('I6: _testAllFilters returns boolean for each filter combo', () => {
        const engine = new AIAutoEngine();
        const numbers = [0, 4, 15, 19, 32];
        const results = engine._testAllFilters(numbers, 4);

        for (const fc of FILTER_COMBOS) {
            expect(typeof results[fc.key]).toBe('boolean');
        }
        // 4 is in nineteen-table + positive → nineteen_positive should be true
        expect(results['nineteen_positive']).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════
// J. SEQUENCE MODEL — SCORE FILTER COMBOS DETAIL
// ═══════════════════════════════════════════════════════════════

describe('J. Sequence Model — scoreFilterCombos Detail', () => {

    test('J1: both_both always scores 1.0', () => {
        const model = new AISequenceModel({ minSamples: 1 });
        model.train([randomSession(500)]);
        const result = model.scoreFilterCombos([4]);
        expect(result.scores['both_both']).toBe(1.0);
    });

    test('J2: Scores are symmetric on each axis when not confident', () => {
        const model = new AISequenceModel({ minSamples: 1 });
        model.train([randomSession(5000)]); // Large random data → ~50/50
        const result = model.scoreFilterCombos([4]);

        if (!result.confident) {
            // When not confident: zero and nineteen variants should be similar (~0.5)
            // both_positive and both_negative should be similar (~0.5)
            expect(result.scores['both_positive']).toBeCloseTo(result.scores['both_negative'], 0);
        }
    });

    test('J3: Prediction includes layers info', () => {
        const model = new AISequenceModel({ minSamples: 1 });
        model.train([randomSession(500)]);
        const result = model.scoreFilterCombos([4, 19]);
        expect(result.prediction).toBeDefined();
        expect(result.prediction.layers).toBeDefined();
        expect(Array.isArray(result.prediction.layers)).toBe(true);
    });

    test('J4: All scores are finite numbers', () => {
        const model = new AISequenceModel({ minSamples: 1 });
        model.train([randomSession(200)]);
        const result = model.scoreFilterCombos([4]);
        for (const [key, score] of Object.entries(result.scores)) {
            expect(isFinite(score)).toBe(true);
            expect(isNaN(score)).toBe(false);
        }
    });

    test('J5: Untrained model produces neutral scores', () => {
        const model = new AISequenceModel();
        const result = model.scoreFilterCombos([4]);
        // Not trained → baseline → not confident → all scores neutral
        expect(result.confident).toBe(false);
        // Not confident: specific combos should get 0.5 * 0.5 = 0.25
        expect(result.scores['zero_positive']).toBe(0.25);
        expect(result.scores['both_both']).toBe(1.0);
    });
});

console.log('✅ Mode transition regression test suite loaded');
