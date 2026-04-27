/**
 * Phase 2 Step 4 — live orchestrator feedback loop.
 *
 * Verifies:
 *   - prior BET decision drives recordResult on the live controller
 *   - prior SHADOW_PREDICT decision drives recordShadow and writes shadowHit back
 *   - engine session counters are NOT mutated on ai-trained path
 *   - switching decisionMode away from ai-trained drops the queued feedback
 *   - non-ai-trained modes (auto) are byte-identical (no new behavior)
 */

const fs = require('fs');
const path = require('path');

const { AITrainedController, ACTION, PHASE } =
    require('../../strategies/ai-trained/ai-trained-controller.js');

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

const SAMPLE = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22
];

function seedWindowSpins(nums) {
    window.spins = nums.map(n => ({ actual: n }));
}

function freshEnv() {
    window.aiAutoEngine = {
        isEnabled: false,
        recordResult: jest.fn(),
        recordSkip: jest.fn(),
        lastDecision: null,
        decide: jest.fn(() => { throw new Error('engine.decide must not be called on ai-trained'); }),
        session: { bets: 0, wins: 0, losses: 0, consecutiveSkips: 0 }
    };
    window.aiTrainedController = new AITrainedController();
    window.moneyPanel = { setPrediction: jest.fn(), pendingBet: {} };
    window.aiPanel = {
        clearSelections: jest.fn(),
        _handleTable3Selection: jest.fn(),
        loadAvailablePairs: jest.fn()
    };
    window.rouletteWheel = { clearHighlights: jest.fn(), _onFilterChange: jest.fn() };
}

function teardown() {
    delete window.aiAutoEngine;
    delete window.aiTrainedController;
    delete window.moneyPanel;
    delete window.aiPanel;
    delete window.rouletteWheel;
    delete window.spins;
}

describe('Step 4 — orchestrator live AI-trained feedback', () => {
    let orch;

    beforeEach(() => {
        freshEnv();
        orch = new AutoUpdateOrchestrator();
        orch.setAutoMode(true);
        orch.setDecisionMode('ai-trained');
    });
    afterEach(teardown);

    test('prior BET → recordResult called with correct hit on next tick', async () => {
        // Force a BET at idx=10 by installing a scripted controller.
        const scripted = {
            decide: jest.fn((spins, idx) => ({
                action: ACTION.BET, phase: PHASE.ACTIVE,
                selectedPair: null, selectedFilter: null,
                numbers: [spins[idx]],   // always "hit" on the current number
                confidence: 0.8, reason: 'stub',
                zone: null,
                diagnostics: { entropy: 0, conflict: 0, historianMatch: 0,
                               clusterStrength: 0, driftScore: 0,
                               lossStreak: 0, ghostWin: false,
                               spinIndex: idx, spinsSeen: spins.length },
                reasoning: { signals: [], rejected: [] }
            })),
            recordResult: jest.fn(),
            recordShadow: jest.fn()
        };
        window.aiTrainedController = scripted;

        // Tick 1: prior=null, produces first decision at idx=10.
        seedWindowSpins(SAMPLE.slice(0, 11));
        await orch.handleAutoMode();
        expect(scripted.recordResult).not.toHaveBeenCalled();  // nothing to resolve yet
        expect(orch._lastAITrainedLive).toBeTruthy();
        expect(orch._lastAITrainedLive.idx).toBe(10);

        // Tick 2: new spin arrives at index 11. Outcome for prior is spinsArr[11].
        seedWindowSpins(SAMPLE.slice(0, 12));
        await orch.handleAutoMode();
        expect(scripted.recordResult).toHaveBeenCalledTimes(1);
        const arg = scripted.recordResult.mock.calls[0][0];
        expect(arg).toHaveProperty('idx', 10);
        expect(typeof arg.hit).toBe('boolean');
        // numbers = [spinsArr[10]] = SAMPLE[10] = 10; outcome = SAMPLE[11] = 5 → miss.
        expect(arg.hit).toBe(false);
        expect(arg.actual).toBe(SAMPLE[11]);
    });

    test('prior SHADOW_PREDICT → recordShadow called + shadowHit written back', async () => {
        // Use the real controller: shadow phase is idx 4..6.
        // Tick 1 at idx=5 (spinsArr length 6): SHADOW_PREDICT emitted.
        seedWindowSpins(SAMPLE.slice(0, 6));
        await orch.handleAutoMode();
        const priorDec = orch._lastAITrainedLive && orch._lastAITrainedLive.decision;
        expect(priorDec).toBeTruthy();
        expect(priorDec.action).toBe(ACTION.SHADOW_PREDICT);
        expect(priorDec.shadowHit).toBeUndefined();   // not yet resolved

        // Tick 2 at idx=6: outcome for prior is spinsArr[6] = SAMPLE[6] = 11.
        seedWindowSpins(SAMPLE.slice(0, 7));
        await orch.handleAutoMode();
        // shadowHit written back on the SAME object reference.
        expect(typeof priorDec.shadowHit).toBe('boolean');
        // Controller shadowsSeen advanced.
        expect(window.aiTrainedController.state.shadowsSeen).toBeGreaterThan(0);
    });

    test('engine session counters are NEVER mutated on ai-trained path', async () => {
        // Drive several ticks and assert engine.lastDecision / recordResult / recordSkip untouched.
        for (let n = 5; n <= 12; n++) {
            seedWindowSpins(SAMPLE.slice(0, n));
            await orch.handleAutoMode();
        }
        expect(window.aiAutoEngine.recordResult).not.toHaveBeenCalled();
        expect(window.aiAutoEngine.recordSkip).not.toHaveBeenCalled();
        expect(window.aiAutoEngine.decide).not.toHaveBeenCalled();
        expect(window.aiAutoEngine.lastDecision).toBeNull();
    });

    test('switching decisionMode away from ai-trained drops queued feedback', async () => {
        seedWindowSpins(SAMPLE.slice(0, 11));
        await orch.handleAutoMode();
        expect(orch._lastAITrainedLive).toBeTruthy();

        orch.setDecisionMode('auto');
        expect(orch._lastAITrainedLive).toBeNull();

        // Re-entering ai-trained with no prior does not replay the stale decision.
        orch.setDecisionMode('ai-trained');
        expect(orch._lastAITrainedLive).toBeNull();
    });
});

describe('Step 4 — non-ai-trained paths untouched', () => {
    let orch;

    beforeEach(() => {
        freshEnv();
        orch = new AutoUpdateOrchestrator();
        orch.setAutoMode(true);
    });
    afterEach(teardown);

    test("'auto' mode still delegates to engine.decide and never calls the AI-trained controller", async () => {
        orch.setDecisionMode('auto');
        window.aiAutoEngine.isEnabled = true;
        window.aiAutoEngine.decide = jest.fn(() => ({
            action: 'SKIP', selectedPair: null, selectedFilter: null,
            numbers: [], confidence: 0, reason: 'stub'
        }));
        const trainedSpy = jest.spyOn(window.aiTrainedController, 'decide');

        seedWindowSpins(SAMPLE.slice(0, 10));
        await orch.handleAutoMode();

        expect(window.aiAutoEngine.decide).toHaveBeenCalled();
        expect(trainedSpy).not.toHaveBeenCalled();
        expect(orch._lastAITrainedLive).toBeNull();
    });
});
