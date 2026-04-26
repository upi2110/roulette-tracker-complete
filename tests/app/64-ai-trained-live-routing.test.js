/**
 * Phase 1 Step 4: live-mode wiring for AI-trained.
 *
 * UI-side:
 *   - AIAutoModeUI exposes an aiTrainedModeBtn
 *   - setMode('ai-trained') updates state and orchestrator
 *   - engine is NOT enabled; semiFilter is disabled
 *
 * Orchestrator-side:
 *   - setDecisionMode('ai-trained') sticks
 *   - handleAutoMode() routes to window.aiTrainedController.decide
 *   - WAIT / SHADOW_PREDICT / PROTECTION / TERMINATE_SESSION do NOT place bets
 *   - BET places a money-panel prediction but does NOT use user pairs / filters
 *   - engine session counters are untouched on the ai-trained path
 *
 * Loaded without touching any other existing test file.
 */

const fs = require('fs');
const path = require('path');

const {
    AITrainedController,
    ACTION
} = require('../../app/ai-trained-controller.js');

// ─── UI: reuse the harness pattern from suite 23 ────────────────────────

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

let AIAutoModeUI;
beforeAll(() => {
    setupAutoModeDOM();
    const mod = require('../../app/ai-auto-mode-ui');
    AIAutoModeUI = mod.AIAutoModeUI;
});

describe('Step 4 — AIAutoModeUI: AI-trained button + setMode', () => {
    let ui;

    beforeEach(() => {
        setupAutoModeDOM();
        window.aiAutoEngine = null;
        window.aiAutoModeUI = null;
        window.aiDataLoader = null;
        window.autoUpdateOrchestrator = null;
        window.aiTrainedController = null;
        // Expose controller class globally for lazy-init inside setMode('ai-trained')
        window.AITrainedController = AITrainedController;
        ui = new AIAutoModeUI();
    });

    afterEach(() => {
        delete window.AITrainedController;
        delete window.aiTrainedController;
    });

    test('AI-trained button appears in the mode bar', () => {
        expect(document.getElementById('aiTrainedModeBtn')).not.toBeNull();
    });

    test('setMode("ai-trained") does NOT require a trained engine', () => {
        const mockEngine = {
            isTrained: false,
            enable: jest.fn(),
            disable: jest.fn()
        };
        const mockOrch = {
            setAutoMode: jest.fn(),
            setDecisionMode: jest.fn()
        };
        window.aiAutoEngine = mockEngine;
        window.autoUpdateOrchestrator = mockOrch;

        ui.setMode('ai-trained');

        expect(ui.currentMode).toBe('ai-trained');
        expect(ui.isAutoMode).toBe(true);
        expect(ui.isSemiAutoMode).toBe(false);
        expect(mockEngine.enable).not.toHaveBeenCalled();   // engine must stay off
        expect(mockEngine.disable).toHaveBeenCalled();
        expect(mockOrch.setAutoMode).toHaveBeenCalledWith(true);
        expect(mockOrch.setDecisionMode).toHaveBeenCalledWith('ai-trained');
    });

    test('setMode("ai-trained") lazily creates window.aiTrainedController', () => {
        window.autoUpdateOrchestrator = { setAutoMode: () => {}, setDecisionMode: () => {} };
        expect(window.aiTrainedController).toBeFalsy();
        ui.setMode('ai-trained');
        expect(window.aiTrainedController).toBeTruthy();
        expect(typeof window.aiTrainedController.decide).toBe('function');
    });

    test('switching back from ai-trained to manual disables auto and resets decisionMode', () => {
        const mockOrch = {
            setAutoMode: jest.fn(),
            setDecisionMode: jest.fn()
        };
        window.autoUpdateOrchestrator = mockOrch;
        ui.setMode('ai-trained');
        mockOrch.setAutoMode.mockClear();
        mockOrch.setDecisionMode.mockClear();

        ui.setMode('manual');
        expect(ui.currentMode).toBe('manual');
        expect(ui.isAutoMode).toBe(false);
        expect(mockOrch.setAutoMode).toHaveBeenCalledWith(false);
        expect(mockOrch.setDecisionMode).toHaveBeenCalledWith('auto');
    });

    test('mode button highlight tracks currentMode', () => {
        window.autoUpdateOrchestrator = { setAutoMode: () => {}, setDecisionMode: () => {} };
        ui.setMode('ai-trained');
        const btn = document.getElementById('aiTrainedModeBtn');
        expect(btn.style.background.toLowerCase()).toContain('rgb(168, 85, 247)'); // #a855f7
    });

    test('pair selection is hidden in ai-trained mode (no user pairs)', () => {
        window.autoUpdateOrchestrator = { setAutoMode: () => {}, setDecisionMode: () => {} };
        ui.setMode('ai-trained');
        const sections = document.querySelectorAll('.table-selection-section');
        sections.forEach(s => {
            expect(s.style.display).toBe('none');
        });
    });
});

// ─── Orchestrator: load via wrap-and-eval (same as suite 13) ──────────

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
    return eval(wrappedCode);
}

const AutoUpdateOrchestrator = loadOrchestratorClass();

function makeController() { return new AITrainedController(); }

// Seed window.spins in the shape the orchestrator reads ({ actual: n }).
function seedWindowSpins(nums) {
    window.spins = nums.map(n => ({ actual: n }));
}

const SAMPLE = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9
];

describe('Step 4 — Orchestrator: setDecisionMode accepts ai-trained', () => {
    test('new value is accepted and round-trips', () => {
        const orch = new AutoUpdateOrchestrator();
        orch.setDecisionMode('ai-trained');
        expect(orch.decisionMode).toBe('ai-trained');
        orch.setDecisionMode('t1-strategy');
        expect(orch.decisionMode).toBe('t1-strategy');
        orch.setDecisionMode('auto');
        expect(orch.decisionMode).toBe('auto');
        orch.setDecisionMode('bogus');
        expect(orch.decisionMode).toBe('auto'); // normalised
    });
});

describe('Step 4 — Orchestrator: handleAutoMode routes ai-trained', () => {
    let orch;
    beforeEach(() => {
        orch = new AutoUpdateOrchestrator();
        orch.setAutoMode(true);
        orch.setDecisionMode('ai-trained');
        window.aiTrainedController = makeController();
        window.aiAutoEngine = {
            isEnabled: false,
            recordSkip: jest.fn(),
            lastDecision: 'prev',
            // Spies to prove engine is never touched on ai-trained path:
            decide: jest.fn(() => { throw new Error('engine.decide must not be called'); })
        };
        window.moneyPanel = { setPrediction: jest.fn(), pendingBet: {} };
        window.aiPanel = {
            clearSelections: jest.fn(),
            _handleTable3Selection: jest.fn(),
            loadAvailablePairs: jest.fn()
        };
        window.rouletteWheel = { clearHighlights: jest.fn(), _onFilterChange: jest.fn() };
    });

    afterEach(() => {
        delete window.aiTrainedController;
        delete window.aiAutoEngine;
        delete window.moneyPanel;
        delete window.aiPanel;
        delete window.rouletteWheel;
        delete window.spins;
    });

    test('WARMUP (idx 0..3): non-bet, no moneyPanel.setPrediction, pendingBet cleared', async () => {
        for (let n = 1; n <= 4; n++) {
            seedWindowSpins(SAMPLE.slice(0, n));
            window.moneyPanel.setPrediction.mockClear();
            window.moneyPanel.pendingBet = { leftover: true };
            await orch.handleAutoMode();
            expect(window.moneyPanel.setPrediction).not.toHaveBeenCalled();
            expect(window.moneyPanel.pendingBet).toBeNull();
        }
        expect(window.aiAutoEngine.decide).not.toHaveBeenCalled();
        expect(window.aiAutoEngine.recordSkip).not.toHaveBeenCalled();
        expect(window.aiAutoEngine.lastDecision).toBe('prev');  // untouched
    });

    test('SHADOW (idx 4..6): SHADOW_PREDICT → no live bet, no user-pair UI calls', async () => {
        for (let n = 5; n <= 7; n++) {
            seedWindowSpins(SAMPLE.slice(0, n));
            window.moneyPanel.setPrediction.mockClear();
            window.aiPanel._handleTable3Selection.mockClear();
            await orch.handleAutoMode();
            expect(window.moneyPanel.setPrediction).not.toHaveBeenCalled();
            expect(window.aiPanel._handleTable3Selection).not.toHaveBeenCalled();
        }
        expect(window.aiAutoEngine.decide).not.toHaveBeenCalled();
    });

    test('BET: moneyPanel.setPrediction called; aiPanel / wheel-filter path skipped (no user pair)', async () => {
        // Force a BET by injecting a controller that always returns BET.
        window.aiTrainedController = {
            decide: () => ({
                action: ACTION.BET,
                selectedPair: null,
                selectedFilter: null,
                numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                confidence: 0.75,
                reason: 'forced-bet-for-test',
                phase: 'ACTIVE',
                zone: { label: 'test', numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
                diagnostics: { entropy: 0.5, conflict: 0.2, historianMatch: 0.6, clusterStrength: 0.7, driftScore: 0.1, lossStreak: 0, ghostWin: false, spinIndex: 10, spinsSeen: 10 },
                reasoning: { signals: [], rejected: [] }
            })
        };
        seedWindowSpins(SAMPLE.slice(0, 11));
        await orch.handleAutoMode();

        expect(window.moneyPanel.setPrediction).toHaveBeenCalledTimes(1);
        const call = window.moneyPanel.setPrediction.mock.calls[0][0];
        expect(call.numbers.length).toBeLessThanOrEqual(12);
        expect(call.signal).toBe('BET NOW');
        expect(call.confidence).toBe(75); // 0.75 → 75%

        // User-pair UI must NOT be touched on ai-trained path
        expect(window.aiPanel._handleTable3Selection).not.toHaveBeenCalled();
        expect(window.rouletteWheel._onFilterChange).not.toHaveBeenCalled();

        // Engine must not be used or mutated
        expect(window.aiAutoEngine.decide).not.toHaveBeenCalled();
        expect(window.aiAutoEngine.lastDecision).toBe('prev');
    });

    test('Non-ai-trained path is unchanged: auto still uses engine.decide', async () => {
        orch.setDecisionMode('auto');
        window.aiAutoEngine.isEnabled = true;
        window.aiAutoEngine.decide = jest.fn(() => ({
            action: 'SKIP',
            selectedPair: null,
            selectedFilter: null,
            numbers: [],
            confidence: 0,
            reason: 'stub'
        }));
        seedWindowSpins(SAMPLE.slice(0, 10));
        await orch.handleAutoMode();
        expect(window.aiAutoEngine.decide).toHaveBeenCalled();
    });
});
