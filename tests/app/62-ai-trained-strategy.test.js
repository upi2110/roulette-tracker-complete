/**
 * Phase 1 Step 2 tests for the AI-trained backtest strategy wrapper.
 * Additive; does not touch any other files.
 */
const {
    decideAITrainedStrategy,
    resetAITrainedStrategy
} = require('../../app/ai-trained-strategy.js');
const {
    AITrainedController,
    PHASE,
    ACTION,
    MAX_BET_NUMBERS
} = require('../../app/ai-trained-controller.js');

const SAMPLE_SPINS = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26, 0,
    32, 15, 19, 4, 21, 2, 25
];

const VALID_ACTIONS = new Set(Object.values(ACTION));
const VALID_PHASES = new Set(Object.values(PHASE));

function assertDecisionShape(d) {
    expect(d).toBeTruthy();
    expect(VALID_ACTIONS.has(d.action)).toBe(true);
    expect(d.selectedPair).toBeNull();
    expect(Array.isArray(d.numbers)).toBe(true);
    expect(d.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
    expect(typeof d.confidence).toBe('number');
    expect(VALID_PHASES.has(d.phase)).toBe(true);
    expect(d.diagnostics).toBeTruthy();
    expect(d.reasoning).toBeTruthy();
    expect(Array.isArray(d.reasoning.signals)).toBe(true);
    expect(Array.isArray(d.reasoning.rejected)).toBe(true);
}

describe('decideAITrainedStrategy — schema parity with controller', () => {
    test('matches controller output for the same inputs (fresh state)', () => {
        const controller = new AITrainedController();
        for (let i = 0; i < SAMPLE_SPINS.length; i++) {
            // controller receives history up-to-idx, same slicing the wrapper uses.
            const expected = controller.decide(SAMPLE_SPINS.slice(0, i), i);
            const got = decideAITrainedStrategy(
                null, SAMPLE_SPINS, i,
                { controller: new AITrainedController() }
            );
            // Inject a fresh controller into the wrapper to mirror the expected
            // stateless comparison above — both sides see the same history at idx.
            const viaInjected = (() => {
                const c = new AITrainedController();
                return c.decide(SAMPLE_SPINS.slice(0, i), i);
            })();
            assertDecisionShape(got);
            expect(got).toEqual(viaInjected);
            // And structurally equal to the baseline controller (same invariants).
            expect(got.action).toEqual(expected.action);
            expect(got.numbers).toEqual(expected.numbers);
            expect(got.phase).toEqual(expected.phase);
        }
    });
});

describe('decideAITrainedStrategy — determinism', () => {
    test('same input, same output (engine-cached path)', () => {
        const engineA = { id: 'A' };
        const engineB = { id: 'B' };
        // Prime both caches with the same sequence.
        const seqA = [];
        const seqB = [];
        for (let i = 0; i < 12; i++) {
            seqA.push(decideAITrainedStrategy(engineA, SAMPLE_SPINS, i));
            seqB.push(decideAITrainedStrategy(engineB, SAMPLE_SPINS, i));
        }
        expect(seqA).toEqual(seqB);
        resetAITrainedStrategy(engineA);
        resetAITrainedStrategy(engineB);
    });

    test('idx === 0 resets cached controller (new session)', () => {
        const engine = { id: 'session-boundary' };
        // Run a bad streak to move into a stateful regime.
        const fakeBet = { action: ACTION.BET };
        const c = decideAITrainedStrategy(engine, SAMPLE_SPINS, 5);
        expect(c).toBeTruthy();
        // Inject synthetic losses into the cached controller.
        const cached = require('../../app/ai-trained-strategy.js')
            .__internal._getController(engine);
        for (let i = 0; i < 10; i++) {
            cached.recordResult({ idx: 10 + i, hit: false, actual: 0, decision: fakeBet });
        }
        expect(cached.snapshot().lossStreak).toBeGreaterThan(0);
        // idx === 0 implicitly resets.
        decideAITrainedStrategy(engine, SAMPLE_SPINS, 0);
        expect(cached.snapshot().lossStreak).toBe(0);
        resetAITrainedStrategy(engine);
    });
});

describe('decideAITrainedStrategy — invariants', () => {
    test('WAIT stays non-bet', () => {
        for (let i = 0; i <= 3; i++) {
            const d = decideAITrainedStrategy(null, SAMPLE_SPINS, i,
                { controller: new AITrainedController() });
            expect(d.action).toBe(ACTION.WAIT);
            expect(d.numbers).toEqual([]);
        }
    });

    test('SHADOW_PREDICT stays shadow-only: numbers empty, shadowNumbers populated', () => {
        for (let i = 4; i <= 6; i++) {
            const d = decideAITrainedStrategy(null, SAMPLE_SPINS, i,
                { controller: new AITrainedController() });
            expect(d.action).toBe(ACTION.SHADOW_PREDICT);
            expect(d.numbers).toEqual([]);
            expect(Array.isArray(d.shadowNumbers)).toBe(true);
            expect(d.shadowNumbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
        }
    });

    test('BET remains capped at 12 unique valid numbers with null selectedPair', () => {
        for (let i = 7; i < SAMPLE_SPINS.length; i++) {
            const d = decideAITrainedStrategy(null, SAMPLE_SPINS, i,
                { controller: new AITrainedController() });
            if (d.action === ACTION.BET) {
                expect(d.numbers.length).toBeGreaterThan(0);
                expect(d.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
                expect(new Set(d.numbers).size).toBe(d.numbers.length);
                d.numbers.forEach(n => {
                    expect(Number.isInteger(n)).toBe(true);
                    expect(n).toBeGreaterThanOrEqual(0);
                    expect(n).toBeLessThanOrEqual(36);
                });
                expect(d.selectedPair).toBeNull();
            }
        }
    });

    test('does not read window.spins or DOM', () => {
        // Poison window.spins with a wrong value. If the wrapper reached for
        // it, the decision would differ from one made with an explicit history.
        const hadWindow = (typeof window !== 'undefined');
        const prev = hadWindow ? window.spins : undefined;
        if (hadWindow) window.spins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const viaWrapper = decideAITrainedStrategy(null, SAMPLE_SPINS, 10,
            { controller: new AITrainedController() });
        const viaController = new AITrainedController()
            .decide(SAMPLE_SPINS.slice(0, 10), 10);

        if (hadWindow) window.spins = prev;

        assertDecisionShape(viaWrapper);
        expect(viaWrapper).toEqual(viaController);
    });

    test('does not mutate the engine argument', () => {
        const engine = { trained: true, session: { bets: 0 } };
        const before = JSON.stringify(engine);
        for (let i = 0; i < 12; i++) {
            decideAITrainedStrategy(engine, SAMPLE_SPINS, i);
        }
        expect(JSON.stringify(engine)).toBe(before);
        resetAITrainedStrategy(engine);
    });

    test('historySlice="all" still respects schema and caps', () => {
        const d = decideAITrainedStrategy(null, SAMPLE_SPINS, 10,
            { controller: new AITrainedController(), historySlice: 'all' });
        assertDecisionShape(d);
        expect(d.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
    });

    test('input validation: bad testSpins / idx throws', () => {
        expect(() => decideAITrainedStrategy(null, null, 0)).toThrow(TypeError);
        expect(() => decideAITrainedStrategy(null, SAMPLE_SPINS, -1)).toThrow(TypeError);
        expect(() => decideAITrainedStrategy(null, SAMPLE_SPINS, 1.5)).toThrow(TypeError);
    });
});
