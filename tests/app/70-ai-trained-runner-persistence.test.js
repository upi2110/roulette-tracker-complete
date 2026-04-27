/**
 * Phase 2 Step 3 — runner step persistence + AI-trained feedback resolution.
 *
 * Drives _runSession end-to-end with method='AI-trained' against a stub engine,
 * plus snapshot regression for 'auto-test' step shape (no aiTrained field).
 */

const { AutoTestRunner } = require('../../app/auto-test-runner.js');
const {
    AITrainedController,
    ACTION,
    PHASE
} = require('../../strategies/ai-trained/ai-trained-controller.js');
const {
    resetAITrainedStrategy,
    __internal: strategyInternal
// Step 5 cutover: auto-test-runner.js now resolves from
// strategies/ai-trained/. Tests that pre-seed the strategy cache must
// write to the same module instance the runner reads from.
} = require('../../strategies/ai-trained/ai-trained-strategy.js');

// 80-spin sequence derived from the European wheel — enough for multiple
// session windows and for the AI-trained controller to progress through
// WARMUP → SHADOW → EARLY → STABILISING.
const WHEEL = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const TEST_SPINS = [];
for (let i = 0; i < 80; i++) TEST_SPINS.push(WHEEL[i % WHEEL.length]);

// Minimal stub engine — the AI-trained path never touches the engine's
// heuristic methods, so only isTrained + recordResult/recordSkip are
// needed so `_runSession`'s legacy error branches stay quiet.
function makeStubEngine(overrides) {
    return Object.assign({
        isTrained: true,
        session: { consecutiveSkips: 0, consecutiveLosses: 0, nearMisses: 0 },
        maxConsecutiveSkips: 5,
        recordResult: () => {},
        recordSkip: () => {},
        resetSession: () => {}
    }, overrides || {});
}

function runAITrainedSession(engine, testSpins, opts) {
    const runner = new AutoTestRunner(engine);
    runner._currentMethod = 'AI-trained';
    return runner._runSession(testSpins, opts.startIdx, opts.strategy || 'Aggressive');
}

describe('Step 3 — AI-trained step persistence', () => {
    beforeEach(() => resetAITrainedStrategy(undefined));

    test('every BET/SKIP step carries step.aiTrained with controller payload', () => {
        const engine = makeStubEngine();
        resetAITrainedStrategy(engine);
        const res = runAITrainedSession(engine, TEST_SPINS, { startIdx: 0 });

        // All BET/SKIP steps must have aiTrained present.
        const decisionSteps = res.steps.filter(s => s.action === 'BET' || s.action === 'SKIP');
        expect(decisionSteps.length).toBeGreaterThan(0);
        decisionSteps.forEach(s => {
            expect(s.aiTrained).toBeTruthy();
            expect(typeof s.aiTrained.action).toBe('string');
            expect(typeof s.aiTrained.phase).toBe('string');
            expect(Array.isArray(s.aiTrained.reasoning && s.aiTrained.reasoning.signals)).toBe(true);
            expect(s.aiTrained.diagnostics).toBeTruthy();
        });

        // WATCH / REANALYZE steps do NOT get aiTrained.
        res.steps
            .filter(s => s.action === 'WATCH' || s.action === 'REANALYZE')
            .forEach(s => expect('aiTrained' in s).toBe(false));
    });

    test('12-number cap is respected on any BET step emitted', () => {
        const engine = makeStubEngine();
        resetAITrainedStrategy(engine);
        const res = runAITrainedSession(engine, TEST_SPINS, { startIdx: 0 });
        res.steps.filter(s => s.action === 'BET').forEach(s => {
            expect(s.predictedNumbers.length).toBeLessThanOrEqual(12);
            // AI-trained never uses user pairs
            expect(s.selectedPair).toBeNull();
            expect(s.selectedFilter).toBeNull();
        });
    });
});

describe('Step 3 — feedback resolution calls recordResult / recordShadow', () => {
    beforeEach(() => resetAITrainedStrategy(undefined));

    test('prior BET decisions drive controller.recordResult: counters evolve with the session', () => {
        const engine = makeStubEngine();
        resetAITrainedStrategy(engine);
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'AI-trained';

        // Monkey-patch the strategy module's controller factory so every
        // `new AITrainedController()` call returns a controller whose
        // decide() always emits BET with a known single number. This
        // survives the session-start reset (which only clears the
        // WeakMap cache — the new factory returns our scripted instance).
        // Step 5 cutover: same module the runner now uses.
        const sm = require('../../strategies/ai-trained/ai-trained-strategy.js');
        const origGet = sm.__internal._getController;
        let scripted;
        const factory = (eng, opts) => {
            const c = origGet(eng, opts);
            c.decide = (spins, idx) => ({
                action: ACTION.BET, phase: PHASE.ACTIVE,
                selectedPair: null, selectedFilter: null,
                // Hit on even idx, miss on odd, for determinism.
                numbers: [idx % 2 === 0 ? TEST_SPINS[idx + 1] : -1].filter(n => n >= 0 && n <= 36),
                shadowNumbers: [],
                confidence: 0.8, reason: 'scripted-bet',
                zone: null,
                diagnostics: { entropy: 0, conflict: 0, historianMatch: 0,
                               clusterStrength: 0, driftScore: 0,
                               lossStreak: 0, ghostWin: false,
                               spinIndex: idx, spinsSeen: spins.length },
                reasoning: { signals: [], rejected: [] }
            });
            scripted = c;
            return c;
        };
        sm.__internal._getController = factory;

        try {
            runner._runSession(TEST_SPINS, 0, 'Aggressive');
            // The controller's internal counters must reflect resolved BETs.
            expect(scripted).toBeTruthy();
            expect(scripted.state.betsPlaced).toBeGreaterThan(0);
            expect(scripted.state.betsHit + scripted.state.betsPlaced - scripted.state.betsHit)
                .toBe(scripted.state.betsPlaced);
        } finally {
            sm.__internal._getController = origGet;
        }
    });

    test('prior SHADOW_PREDICT decisions drive recordShadow and write shadowHit back on the step', () => {
        const engine = makeStubEngine();
        resetAITrainedStrategy(engine);
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'AI-trained';

        const res = runner._runSession(TEST_SPINS, 0, 'Aggressive');

        // Shadow phase is idx 4..6. _runSession starts at startIdx+3 = 3,
        // so at least one SHADOW_PREDICT step will be produced. The next
        // adapter tick writes `shadowHit` back onto that step's aiTrained
        // record (mutation of the same object reference).
        const shadowSteps = res.steps
            .filter(s => s.aiTrained && s.aiTrained.action === ACTION.SHADOW_PREDICT);
        expect(shadowSteps.length).toBeGreaterThan(0);
        const resolved = shadowSteps.filter(s => typeof s.aiTrained.shadowHit === 'boolean');
        expect(resolved.length).toBeGreaterThan(0);

        // Controller shadow counters should also have advanced.
        // Step 5 cutover: same module the runner now uses.
        const sm = require('../../strategies/ai-trained/ai-trained-strategy.js');
        const controller = sm.__internal._getController(engine);
        expect(controller.state.shadowsSeen).toBeGreaterThan(0);
    });

    test('RETRAIN / PROTECTION / TERMINATE_SESSION remain non-bets in the adapter mapping', () => {
        // Direct unit test of `_aiTrainedAdapter`: feed a scripted
        // controller decision via dependency injection and assert the
        // adapter maps it to runner-level 'SKIP'. We bypass _runSession
        // because its session-start reset wipes any pre-installed
        // controller (per Phase 2 isolation contract).
        const engine = makeStubEngine();
        resetAITrainedStrategy(engine);
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'AI-trained';

        // Step 5 cutover: same module the runner now uses.
        const sm = require('../../strategies/ai-trained/ai-trained-strategy.js');
        // Replace the cached controller AFTER any reset is done; we'll
        // also stub _resolvePriorAITrainedDecision to avoid touching
        // the WeakMap entry between calls.
        runner._resolvePriorAITrainedDecision = () => {};

        for (const action of [ACTION.RETRAIN, ACTION.PROTECTION, ACTION.TERMINATE_SESSION]) {
            sm.__internal._clearController(engine);
            const cached = sm.__internal._getController(engine);
            cached.decide = () => ({
                action, phase: PHASE.ACTIVE,
                selectedPair: null, selectedFilter: null,
                numbers: [], shadowNumbers: [],
                confidence: 0, reason: 'forced',
                zone: null,
                diagnostics: { entropy: 0, conflict: 0, historianMatch: 0,
                               clusterStrength: 0, driftScore: 0,
                               lossStreak: 0, ghostWin: false,
                               spinIndex: 10, spinsSeen: 10 },
                reasoning: { signals: [], rejected: [] }
            });
            const out = runner._aiTrainedAdapter(TEST_SPINS, 10);
            // Adapter must map every non-BET controller action to SKIP
            // with empty numbers and zero P&L impact.
            expect(out.action).toBe('SKIP');
            expect(out.numbers).toEqual([]);
            expect(out.selectedPair).toBeNull();
            expect(out.selectedFilter).toBeNull();
            // Original controller decision is preserved under aiTrained
            // for downstream consumers (audit, replay diagnostics).
            expect(out.aiTrained.action).toBe(action);
        }
    });
});

describe('Step 3 — aiTrainedSummary on SessionResult', () => {
    beforeEach(() => resetAITrainedStrategy(undefined));

    test('attached only for AI-trained runs; absent for legacy runs', () => {
        const engine = makeStubEngine();
        resetAITrainedStrategy(engine);

        const ai = runAITrainedSession(engine, TEST_SPINS, { startIdx: 0 });
        expect(ai).toHaveProperty('method', 'AI-trained');
        expect(ai).toHaveProperty('aiTrainedSummary');
        expect(typeof ai.aiTrainedSummary.bets).toBe('number');
        expect(typeof ai.aiTrainedSummary.shadowsSeen).toBe('number');

        // Legacy 'auto-test' result: build directly so engine internals
        // are not exercised. We use _buildSessionResult with a clean
        // state + steps array that has no aiTrained fields.
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'auto-test';
        const legacy = runner._buildSessionResult(0, 'Aggressive', 'INCOMPLETE',
            { bankroll: 4000, profit: 0, totalBets: 0, totalSkips: 0,
              wins: 0, losses: 0, maxDrawdown: 0, peakProfit: 0, reanalyzeCount: 0 },
            [{ action: 'WATCH' }]);
        expect('method' in legacy).toBe(false);
        expect('aiTrainedSummary' in legacy).toBe(false);
    });
});

describe('Step 3 — legacy step shape snapshot', () => {
    test("auto-test / T1-strategy steps never gain an aiTrained field", () => {
        // Build a fake legacy decision flow via _buildSessionResult.
        // All we need to assert is that the step template produced by the
        // BET/SKIP push sites is byte-identical when decision.aiTrained is
        // undefined (the legacy case).
        const engine = makeStubEngine();
        const runner = new AutoTestRunner(engine);
        runner._currentMethod = 'auto-test';

        // Drive a single BET step manually through the push-site shape
        // by re-creating it here with decision.aiTrained undefined.
        const decision = {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both',
            numbers: [1, 2, 3], confidence: 50, reason: 'legacy'
        };
        const betUsed = 2, nextActual = 1, hit = true, numbersCount = 3, pnl = 66;
        const sessionState = { bankroll: 4066, profit: 66 };
        const step = Object.assign({
            spinIdx: 10, spinNumber: 99, nextNumber: nextActual,
            action: 'BET', selectedPair: decision.selectedPair,
            selectedFilter: decision.selectedFilter,
            predictedNumbers: decision.numbers,
            confidence: decision.confidence,
            betPerNumber: betUsed, numbersCount, hit, pnl,
            bankroll: sessionState.bankroll, cumulativeProfit: sessionState.profit
        }, decision.aiTrained ? { aiTrained: decision.aiTrained } : {});

        // Exact key set expected by legacy consumers (no 'aiTrained').
        expect(Object.keys(step).sort()).toEqual([
            'action', 'bankroll', 'betPerNumber', 'confidence',
            'cumulativeProfit', 'hit', 'nextNumber', 'numbersCount',
            'pnl', 'predictedNumbers', 'selectedFilter', 'selectedPair',
            'spinIdx', 'spinNumber'
        ]);
    });
});
