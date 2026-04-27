/**
 * resetAITrainedStrategyAll — clears every cached AI-trained controller
 * (null-engine slot + per-engine WeakMap entries).
 */

const sm = require('../../strategies/ai-trained/ai-trained-strategy.js');
const { decideAITrainedStrategy, resetAITrainedStrategy, resetAITrainedStrategyAll, __internal } = sm;
const { ACTION } = require('../../strategies/ai-trained/ai-trained-controller.js');

const SAMPLE = [17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20];

beforeEach(() => resetAITrainedStrategyAll());

describe('resetAITrainedStrategyAll', () => {
    test('cold call is a no-op (does not throw, no side effects)', () => {
        expect(() => resetAITrainedStrategyAll()).not.toThrow();
        // The next decide constructs a fresh controller.
        const d = decideAITrainedStrategy(null, SAMPLE, 0);
        expect(d).toBeTruthy();
    });

    test('clears the null-engine slot so next decide starts fresh', () => {
        // Drive several decisions to populate counters via recordResult.
        const fakeBet = { action: ACTION.BET };
        const ctrl = __internal._getController(null);
        ctrl.recordResult({ idx: 10, hit: false, actual: 0, decision: fakeBet });
        ctrl.recordResult({ idx: 11, hit: false, actual: 0, decision: fakeBet });
        expect(ctrl.state.lossStreak).toBe(2);

        resetAITrainedStrategyAll();
        const fresh = __internal._getController(null);
        expect(fresh).not.toBe(ctrl);
        expect(fresh.state.lossStreak).toBe(0);
    });

    test('clears every per-engine WeakMap entry the strategy module has seen', () => {
        const engineA = { id: 'A' };
        const engineB = { id: 'B' };
        // Seed both via decide().
        decideAITrainedStrategy(engineA, SAMPLE, 5);
        decideAITrainedStrategy(engineB, SAMPLE, 5);
        const ctrlA = __internal._getController(engineA);
        const ctrlB = __internal._getController(engineB);
        const fakeBet = { action: ACTION.BET };
        ctrlA.recordResult({ idx: 10, hit: false, actual: 0, decision: fakeBet });
        ctrlB.recordResult({ idx: 10, hit: false, actual: 0, decision: fakeBet });
        expect(ctrlA.state.lossStreak).toBe(1);
        expect(ctrlB.state.lossStreak).toBe(1);

        resetAITrainedStrategyAll();

        const freshA = __internal._getController(engineA);
        const freshB = __internal._getController(engineB);
        expect(freshA).not.toBe(ctrlA);
        expect(freshB).not.toBe(ctrlB);
        expect(freshA.state.lossStreak).toBe(0);
        expect(freshB.state.lossStreak).toBe(0);
    });

    test('single-engine reset still works after a global reset', () => {
        const engine = { id: 'X' };
        decideAITrainedStrategy(engine, SAMPLE, 5);
        resetAITrainedStrategyAll();
        // After global wipe, single-engine reset on a fresh engine is a no-op.
        expect(() => resetAITrainedStrategy(engine)).not.toThrow();
    });

    test('idempotent — calling twice is safe', () => {
        decideAITrainedStrategy({ id: 'X' }, SAMPLE, 5);
        resetAITrainedStrategyAll();
        expect(() => resetAITrainedStrategyAll()).not.toThrow();
    });
});
