/**
 * 58-ai-mode-t1-strategy.test.js
 *
 * Tests for the new AI prediction-panel mode "T1-strategy":
 *   - Button renders next to AUTO in the mode bar.
 *   - Selecting it flips currentMode, enables the engine, switches the
 *     orchestrator into auto mode, and tells the orchestrator to route
 *     decisions through the T1 policy.
 *   - The orchestrator's setDecisionMode routes handleAutoMode() to
 *     window.decideT1Strategy when selected; otherwise to engine.decide().
 *   - Existing manual / semi / auto modes still work.
 *   - Switching away from T1 resets the decision mode back to 'auto'.
 */

function setupAutoModeDOM() {
    document.body.innerHTML = `
        <div id="aiSelectionPanel">
            <div id="aiPanelContent">
                <div class="table-selection-section" data-table="3"></div>
                <div class="table-selection-section" data-table="2"></div>
                <div class="table-selection-section" data-table="1"></div>
            </div>
        </div>
    `;
}

// Load the mode UI once; the module caches AIAutoModeUI on require.
let AIAutoModeUI;
beforeAll(() => {
    setupAutoModeDOM();
    AIAutoModeUI = require('../../app/ai-auto-mode-ui').AIAutoModeUI;
});

function makeTrainedEngineStub() {
    // Engine stub with the minimal API the orchestrator's post-decide
    // code path touches (recordSkip is called on SKIP outcomes, for
    // example). Keeps the stub small but functional.
    return {
        isTrained: true,
        isEnabled: false,
        enable() { this.isEnabled = true; },
        disable() { this.isEnabled = false; },
        confidenceThreshold: 55,
        maxConsecutiveSkips: 8,
        session: { consecutiveSkips: 0 },
        setLearningVersion() {},
        decide() { return { action: 'SKIP', selectedPair: null, selectedFilter: null, numbers: [], confidence: 0, reason: 'stub' }; },
        recordSkip() { /* no-op stub so orchestrator's SKIP branch is safe */ },
        recordResult() {}
    };
}

function makeOrchestratorStub() {
    const calls = { setAutoMode: [], setDecisionMode: [] };
    const o = {
        autoMode: false,
        decisionMode: 'auto',
        setAutoMode(x) { this.autoMode = !!x; calls.setAutoMode.push(!!x); },
        setDecisionMode(m) { this.decisionMode = (m === 't1-strategy') ? 't1-strategy' : 'auto'; calls.setDecisionMode.push(this.decisionMode); }
    };
    o._calls = calls;
    return o;
}

let ui;
beforeEach(() => {
    setupAutoModeDOM();
    window.aiAutoEngine = makeTrainedEngineStub();
    window.autoUpdateOrchestrator = makeOrchestratorStub();
    window.aiAutoModeUI = null;
    window.semiAutoFilter = null;
    window.aiDataLoader = null;
    window.aiAPI = null;
    ui = new AIAutoModeUI();
});

// ═══════════════════════════════════════════════════════════════════
//  A. Button rendering and placement
// ═══════════════════════════════════════════════════════════════════
describe('A. T1-strategy button', () => {
    test('A1: #t1StrategyModeBtn renders inside the mode bar', () => {
        const btn = document.getElementById('t1StrategyModeBtn');
        expect(btn).not.toBeNull();
        expect(btn.tagName).toBe('BUTTON');
    });

    test('A2: button is the next sibling of the AUTO button (placed right after it)', () => {
        const autoBtn = document.getElementById('autoModeBtn');
        const t1Btn = document.getElementById('t1StrategyModeBtn');
        expect(autoBtn.nextElementSibling).toBe(t1Btn);
    });

    test('A3: button label is exactly "T1-strategy"', () => {
        expect(document.getElementById('t1StrategyModeBtn').textContent.trim()).toBe('T1-strategy');
    });

    test('A4: existing mode buttons are still rendered', () => {
        expect(document.getElementById('manualModeBtn')).not.toBeNull();
        expect(document.getElementById('semiAutoModeBtn')).not.toBeNull();
        expect(document.getElementById('autoModeBtn')).not.toBeNull();
        expect(document.getElementById('trainBtn')).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════
//  B. setMode('t1-strategy') behaviour
// ═══════════════════════════════════════════════════════════════════
describe('B. setMode("t1-strategy")', () => {
    test('B1: flips currentMode to "t1-strategy" and enables the engine', () => {
        ui.setMode('t1-strategy');
        expect(ui.currentMode).toBe('t1-strategy');
        expect(window.aiAutoEngine.isEnabled).toBe(true);
        expect(ui.isAutoMode).toBe(true);
        expect(ui.isSemiAutoMode).toBe(false);
    });

    test('B2: orchestrator is put into autoMode=true', () => {
        ui.setMode('t1-strategy');
        expect(window.autoUpdateOrchestrator.autoMode).toBe(true);
        expect(window.autoUpdateOrchestrator._calls.setAutoMode).toContain(true);
    });

    test('B3: orchestrator setDecisionMode is called with "t1-strategy"', () => {
        ui.setMode('t1-strategy');
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('t1-strategy');
        expect(window.autoUpdateOrchestrator._calls.setDecisionMode).toContain('t1-strategy');
    });

    test('B4: T1 button renders as the "selected" style after switching', () => {
        ui.setMode('t1-strategy');
        const t1Btn = document.getElementById('t1StrategyModeBtn');
        expect(t1Btn.style.color).toBe('white');
        // Inline indigo tone (either hex or rgb form — jsdom normalises).
        expect(t1Btn.style.background === '#6366f1' || t1Btn.style.background === 'rgb(99, 102, 241)').toBe(true);
    });

    test('B5: other mode buttons are deselected styling when T1 is active', () => {
        ui.setMode('t1-strategy');
        const auto = document.getElementById('autoModeBtn');
        const semi = document.getElementById('semiAutoModeBtn');
        const manual = document.getElementById('manualModeBtn');
        expect(auto.style.background).not.toBe('#22c55e');
        expect(semi.style.background).not.toBe('#f97316');
        expect(manual.style.background).not.toBe('#3b82f6');
    });

    test('B6: switching requires a trained engine (same guard as AUTO)', () => {
        window.aiAutoEngine = Object.assign(makeTrainedEngineStub(), { isTrained: false });
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        setupAutoModeDOM();
        const freshUI = new AIAutoModeUI();
        freshUI.setMode('t1-strategy');
        expect(freshUI.currentMode).toBe('manual'); // stays put
        expect(window.autoUpdateOrchestrator.autoMode).toBe(false);
    });

    test('B7: clicking the button flips the mode end-to-end', () => {
        const btn = document.getElementById('t1StrategyModeBtn');
        btn.click();
        expect(ui.currentMode).toBe('t1-strategy');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  C. Existing modes still work + isolation
// ═══════════════════════════════════════════════════════════════════
describe('C. Existing modes unchanged', () => {
    test('C1: setMode("manual") disables engine and resets decisionMode to auto', () => {
        ui.setMode('t1-strategy');
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('t1-strategy');
        ui.setMode('manual');
        expect(ui.currentMode).toBe('manual');
        expect(window.aiAutoEngine.isEnabled).toBe(false);
        expect(window.autoUpdateOrchestrator.autoMode).toBe(false);
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('auto');
    });

    test('C2: setMode("semi") disables engine and resets decisionMode to auto', () => {
        ui.setMode('t1-strategy');
        ui.setMode('semi');
        expect(ui.currentMode).toBe('semi');
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('auto');
    });

    test('C3: setMode("auto") enables engine with decisionMode=auto', () => {
        ui.setMode('t1-strategy');
        ui.setMode('auto');
        expect(ui.currentMode).toBe('auto');
        expect(window.aiAutoEngine.isEnabled).toBe(true);
        expect(window.autoUpdateOrchestrator.autoMode).toBe(true);
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('auto');
    });

    test('C4: auto → t1-strategy flip updates orchestrator.decisionMode', () => {
        ui.setMode('auto');
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('auto');
        ui.setMode('t1-strategy');
        expect(window.autoUpdateOrchestrator.decisionMode).toBe('t1-strategy');
    });

    test('C5: pair selection is hidden under auto AND t1-strategy (engine-driven)', () => {
        // togglePairSelection is a method on AIAutoModeUI; spy on it to
        // observe its argument on each switch.
        const seen = [];
        ui.togglePairSelection = (v) => seen.push(!!v);
        ui.setMode('t1-strategy');
        expect(seen[seen.length - 1]).toBe(false); // engine-driven hides pairs
        ui.setMode('auto');
        expect(seen[seen.length - 1]).toBe(false);
        ui.setMode('semi');
        expect(seen[seen.length - 1]).toBe(true);  // user picks pair in semi
        ui.setMode('manual');
        expect(seen[seen.length - 1]).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  D. Orchestrator dispatch (reuses the Auto Test T1 helper)
// ═══════════════════════════════════════════════════════════════════
// The orchestrator is loaded fresh here because its top-level code
// touches window.rouletteWheel / panels etc. We only exercise the
// decision-mode branch.
describe('D. Orchestrator dispatch', () => {
    // Reload orchestrator into an isolated sandbox so we can exercise
    // setDecisionMode + handleAutoMode without also running its
    // setInterval listener.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'auto-update-orchestrator.js'), 'utf-8');

    function loadOrchestrator() {
        const origSetInterval = global.setInterval;
        global.setInterval = () => 0; // swallow the polling loop
        const wrapped = `
            (function() {
                ${src}
                return { AutoUpdateOrchestrator };
            })()
        `;
        try {
            const m = eval(wrapped);
            return m.AutoUpdateOrchestrator;
        } finally {
            global.setInterval = origSetInterval;
        }
    }

    test('D1: default decisionMode is "auto" at construction', () => {
        const AUO = loadOrchestrator();
        const o = new AUO();
        expect(o.decisionMode).toBe('auto');
    });

    test('D2: setDecisionMode("t1-strategy") / setDecisionMode("auto") round-trip', () => {
        const AUO = loadOrchestrator();
        const o = new AUO();
        o.setDecisionMode('t1-strategy');
        expect(o.decisionMode).toBe('t1-strategy');
        o.setDecisionMode('auto');
        expect(o.decisionMode).toBe('auto');
    });

    test('D3: setDecisionMode normalises unknown strings to "auto"', () => {
        const AUO = loadOrchestrator();
        const o = new AUO();
        o.setDecisionMode('t1-strategy');
        o.setDecisionMode('nonsense');
        expect(o.decisionMode).toBe('auto');
        o.setDecisionMode(null);
        expect(o.decisionMode).toBe('auto');
    });

    test('D4: handleAutoMode calls window.decideT1Strategy when decisionMode is "t1-strategy"', async () => {
        const AUO = loadOrchestrator();
        const o = new AUO();
        o.setDecisionMode('t1-strategy');
        const t1Calls = [];
        window.decideT1Strategy = (eng, spins, idx) => {
            t1Calls.push({ engine: eng, spins: [...spins], idx });
            return { action: 'SKIP', selectedPair: null, selectedFilter: null, numbers: [], confidence: 0, reason: 'T1 stub' };
        };
        const engine = makeTrainedEngineStub();
        window.aiAutoEngine = engine;
        window.spins = [{ actual: 10 }, { actual: 15 }, { actual: 20 }, { actual: 18 }, { actual: 29 }];
        // Stub out the parts handleAutoMode calls downstream so they
        // don't blow up without their DOM.
        window.aiPanel = { clearSelections() {}, _handleTable3Selection() {}, loadAvailablePairs() {} };
        window.rouletteWheel = { _onFilterChange() {} };
        window.aiAutoModeUI = { updateDecisionDisplay() {} };
        await o.handleAutoMode();
        expect(t1Calls.length).toBe(1);
        expect(t1Calls[0].spins).toEqual([10, 15, 20, 18, 29]);
        expect(t1Calls[0].idx).toBe(4);
        delete window.decideT1Strategy;
    });

    test('D5: handleAutoMode uses engine.decide() when decisionMode is "auto" (default)', async () => {
        const AUO = loadOrchestrator();
        const o = new AUO();
        // decisionMode stays at default 'auto'.
        const decideCalls = [];
        const engine = makeTrainedEngineStub();
        engine.decide = () => {
            decideCalls.push(true);
            return { action: 'SKIP', selectedPair: null, selectedFilter: null, numbers: [], confidence: 0, reason: 'engine stub' };
        };
        window.aiAutoEngine = engine;
        window.decideT1Strategy = () => { throw new Error('T1 should not be called in auto mode'); };
        window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 3 }, { actual: 4 }, { actual: 5 }];
        window.aiPanel = { clearSelections() {}, _handleTable3Selection() {}, loadAvailablePairs() {} };
        window.rouletteWheel = { _onFilterChange() {} };
        window.aiAutoModeUI = { updateDecisionDisplay() {} };
        await o.handleAutoMode();
        expect(decideCalls.length).toBe(1);
        delete window.decideT1Strategy;
    });

    test('D6: handleAutoMode falls back to engine.decide() when window.decideT1Strategy is missing', async () => {
        const AUO = loadOrchestrator();
        const o = new AUO();
        o.setDecisionMode('t1-strategy');
        delete window.decideT1Strategy;
        const decideCalls = [];
        const engine = makeTrainedEngineStub();
        engine.decide = () => { decideCalls.push(true); return { action: 'SKIP', selectedPair: null, selectedFilter: null, numbers: [], confidence: 0, reason: 'fallback' }; };
        window.aiAutoEngine = engine;
        window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 3 }, { actual: 4 }, { actual: 5 }];
        window.aiPanel = { clearSelections() {}, _handleTable3Selection() {}, loadAvailablePairs() {} };
        window.rouletteWheel = { _onFilterChange() {} };
        window.aiAutoModeUI = { updateDecisionDisplay() {} };
        await o.handleAutoMode();
        expect(decideCalls.length).toBe(1);
    });
});
