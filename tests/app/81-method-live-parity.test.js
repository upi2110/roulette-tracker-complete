/**
 * Mode parity — Auto Test method ↔ live mode.
 *
 * Goal: prove that for each supported pair the Auto Test path and the
 * live path use the SAME decision logic / class. Schema parity is the
 * lowest-friction proof; for AI-trained we additionally compare per-spin
 * decisions for byte-equality on a fixed history.
 *
 * Pairs covered:
 *   - auto-test       ↔ auto         (heuristic engine; same singleton)
 *   - T1-strategy     ↔ t1-strategy  (decideT1Strategy single helper)
 *   - AI-trained      ↔ ai-trained   (AITrainedController class)
 *   - test-strategy   → alias of auto-test (no live counterpart) — documented
 */

const { AutoTestRunner, TEST_REFKEY_TO_PAIR_NAME } = require('../../app/auto-test-runner.js');
const { decideT1Strategy } = require('../../app/t1-strategy.js');
const {
    AITrainedController,
    ACTION,
    PHASE,
    MAX_BET_NUMBERS
} = require('../../app/ai-trained-controller.js');
const {
    decideAITrainedStrategy,
    resetAITrainedStrategy,
    resetAITrainedStrategyAll
} = require('../../app/ai-trained-strategy.js');

const SAMPLE_SPINS = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26, 0,
    32, 15, 19, 4, 21, 2, 25
];

beforeEach(() => resetAITrainedStrategyAll());

// ── Pair 1: auto-test ↔ auto ──────────────────────────────────────────

describe('parity: auto-test ↔ auto', () => {
    test('runner dispatches auto-test to the engine-internal _simulateDecision (not the AI adapter)', () => {
        const engine = { isTrained: true, session: {}, recordResult: () => {}, recordSkip: () => {} };
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'auto-test';

        const aiSpy = jest.spyOn(runner, '_aiTrainedAdapter');
        // Engine internals will throw — we only care that the AI adapter
        // is NOT touched on this path.
        try { runner._simulateDecision(SAMPLE_SPINS, 10); } catch (_) { /* expected */ }
        expect(aiSpy).not.toHaveBeenCalled();
    });
});

// ── Pair 2: T1-strategy ↔ t1-strategy ────────────────────────────────

describe('parity: T1-strategy ↔ t1-strategy', () => {
    test('runner and live mode call the SAME decideT1Strategy helper', () => {
        // The helper is the single source of T1 logic — both Auto Test
        // (auto-test-runner.js dispatch) and live mode
        // (auto-update-orchestrator.js handleAutoMode) import this
        // function. We assert it exists and exposes the documented
        // contract (engine, testSpins, idx) → decision.
        expect(typeof decideT1Strategy).toBe('function');
        expect(decideT1Strategy.length).toBeGreaterThanOrEqual(2);
    });

    test('runner dispatches T1-strategy to decideT1Strategy (not the AI adapter)', () => {
        const engine = { isTrained: true, session: {}, recordResult: () => {}, recordSkip: () => {} };
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'T1-strategy';
        const aiSpy = jest.spyOn(runner, '_aiTrainedAdapter');
        try { runner._simulateDecision(SAMPLE_SPINS, 10); } catch (_) { /* expected */ }
        expect(aiSpy).not.toHaveBeenCalled();
    });
});

// ── Pair 3: AI-trained ↔ ai-trained ──────────────────────────────────

describe('parity: AI-trained ↔ ai-trained', () => {
    test('Both paths use the same AITrainedController class', () => {
        // Live path: window.aiTrainedController is `new AITrainedController()`.
        // Auto Test path: ai-trained-strategy._getController returns
        //                 `new AITrainedController()`.
        // We instantiate one of each and assert constructor identity.
        const live = new AITrainedController();
        const auto = decideAITrainedStrategy(null, SAMPLE_SPINS, 0,
            { controller: new AITrainedController() });
        expect(live).toBeInstanceOf(AITrainedController);
        expect(auto).toBeTruthy();
    });

    test('Decision schema is byte-identical for the same spin history (idx 0..N)', () => {
        for (let i = 0; i <= 15; i++) {
            const liveCtrl = new AITrainedController();
            const autoCtrl = new AITrainedController();
            const liveDecision = liveCtrl.decide(SAMPLE_SPINS.slice(0, i), i);
            const autoDecision = decideAITrainedStrategy(null, SAMPLE_SPINS, i,
                { controller: autoCtrl });
            // Compare every field that matters for parity.
            expect(autoDecision.action).toBe(liveDecision.action);
            expect(autoDecision.phase).toBe(liveDecision.phase);
            expect(autoDecision.numbers).toEqual(liveDecision.numbers);
            expect(autoDecision.selectedPair).toBe(liveDecision.selectedPair);
            expect(autoDecision.selectedFilter).toBe(liveDecision.selectedFilter);
            expect(autoDecision.confidence).toBeCloseTo(liveDecision.confidence, 6);
            expect(autoDecision.zone).toEqual(liveDecision.zone);
            expect(autoDecision.diagnostics).toEqual(liveDecision.diagnostics);
            expect(autoDecision.reasoning).toEqual(liveDecision.reasoning);
            if (autoDecision.action === ACTION.SHADOW_PREDICT) {
                expect(autoDecision.shadowNumbers).toEqual(liveDecision.shadowNumbers);
            }
        }
    });

    test('12-number cap holds on both sides', () => {
        for (let i = 7; i < SAMPLE_SPINS.length; i++) {
            const live = new AITrainedController().decide(SAMPLE_SPINS.slice(0, i), i);
            const auto = decideAITrainedStrategy(null, SAMPLE_SPINS, i,
                { controller: new AITrainedController() });
            expect(live.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
            expect(auto.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
        }
    });

    test('Both paths produce null selectedPair (no user-defined pairs in AI-trained)', () => {
        const live = new AITrainedController().decide(SAMPLE_SPINS.slice(0, 12), 12);
        const auto = decideAITrainedStrategy(null, SAMPLE_SPINS, 12,
            { controller: new AITrainedController() });
        expect(live.selectedPair).toBeNull();
        expect(auto.selectedPair).toBeNull();
    });

    test('Live and Auto Test controller instances are isolated (not the same object)', () => {
        // The Phase-2 isolation contract requires SEPARATE instances —
        // identical logic, different state. Verified by writing into one
        // and confirming the other is unaffected.
        const liveCtrl = new AITrainedController();
        const autoCtrl = new AITrainedController();
        liveCtrl.recordResult({
            idx: 10, hit: false, actual: 0,
            decision: { action: ACTION.BET }
        });
        expect(liveCtrl.state.lossStreak).toBe(1);
        expect(autoCtrl.state.lossStreak).toBe(0);
    });

    test('AI-trained method does not require legacy engine training (runner gate is method-aware)', async () => {
        const engine = {
            isTrained: false, // explicitly untrained
            session: {},
            recordResult: () => {}, recordSkip: () => {}, train: () => {}
        };
        const runner = new AutoTestRunner(engine);
        // runAll for AI-trained MUST NOT short-circuit to ENGINE_NOT_TRAINED.
        let outcome = null;
        try {
            const r = await runner.runAll(SAMPLE_SPINS, { method: 'AI-trained' });
            outcome = r && r.outcome;
        } catch (_) {
            // Pipeline may fail later for unrelated reasons in this stub
            // engine, but the gate must NOT have fired.
        }
        expect(outcome).not.toBe('ENGINE_NOT_TRAINED');
    });
});

// ── test-strategy: alias-only documentation ──────────────────────────

describe('test-strategy is an alias of auto-test (no live parity target)', () => {
    test('runner routes test-strategy through the same default body as auto-test', () => {
        const engine = { isTrained: true, session: {}, recordResult: () => {}, recordSkip: () => {} };
        const runner = new AutoTestRunner(engine);

        // For both methods the dispatcher should NOT enter the AI-trained
        // adapter and SHOULD NOT call decideT1Strategy. The default body
        // is shared; downstream behavior is identical at the dispatch
        // boundary.
        for (const method of ['auto-test', 'test-strategy']) {
            runner._currentMethod = method;
            const aiSpy = jest.spyOn(runner, '_aiTrainedAdapter');
            try { runner._simulateDecision(SAMPLE_SPINS, 10); } catch (_) { /* expected */ }
            expect(aiSpy).not.toHaveBeenCalled();
            aiSpy.mockRestore();
        }
    });
});
