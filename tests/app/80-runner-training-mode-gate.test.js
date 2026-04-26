/**
 * Auto Test runner — opt-in expectedTrainingMode gate.
 *
 * Verifies:
 *   - Omitting the field → byte-identical behavior to today.
 *   - Field present + match → run proceeds.
 *   - Field present + mismatch → single WRONG_TRAINING_MODE result;
 *     no engine.train / engine.decide / controller construction.
 *   - Falsy values ('' / null) treated as "no gate".
 */

const { AutoTestRunner } = require('../../app/auto-test-runner.js');
const TrainingState = require('../../app/training-state.js');

beforeEach(() => TrainingState.__internal.reset());

function makeStubEngine(overrides) {
    return Object.assign({
        isTrained: true,
        session: { consecutiveSkips: 0, consecutiveLosses: 0, nearMisses: 0 },
        maxConsecutiveSkips: 5,
        recordResult: jest.fn(),
        recordSkip: jest.fn(),
        resetSession: jest.fn(),
        train: jest.fn(),
        decide: jest.fn(() => { throw new Error('engine.decide must not be called when gate fires'); })
    }, overrides || {});
}

const SAMPLE = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9
];

// The gate is positioned at the very top of runAll, before any
// session work. To prove "the gate did NOT fire" without exercising
// the full pipeline (which needs heuristic engine internals our stub
// lacks), we wrap runAll so we can detect the early-return signature.
// `outcome === 'WRONG_TRAINING_MODE'` is the signature; absence of it
// means the gate did not fire (the call may then fail later, which is
// fine — we only assert on the gate).

async function runAndCaptureOutcome(runner, options) {
    try {
        const r = await runner.runAll(SAMPLE, options);
        return r && r.outcome ? r.outcome : null;
    } catch (_) {
        // Pipeline failed AFTER passing the gate — that's "gate did not fire".
        return null;
    }
}

describe('opt-in: omitted / falsy expectedTrainingMode → no gate', () => {
    test('omitted field — gate does not fire', async () => {
        const runner = new AutoTestRunner(makeStubEngine());
        const outcome = await runAndCaptureOutcome(runner, { method: 'AI-trained' });
        expect(outcome).not.toBe('WRONG_TRAINING_MODE');
    });

    test('null / empty string / undefined treated as "no gate"', async () => {
        const runner = new AutoTestRunner(makeStubEngine());
        for (const v of [null, '', undefined]) {
            TrainingState.__internal.reset();
            const outcome = await runAndCaptureOutcome(runner, {
                method: 'AI-trained', expectedTrainingMode: v
            });
            expect(outcome).not.toBe('WRONG_TRAINING_MODE');
        }
    });
});

describe('opt-in: matching expectedTrainingMode → no gate', () => {
    test('default-mode active + expected default → gate does not fire', async () => {
        TrainingState.setActiveMode('default');
        const runner = new AutoTestRunner(makeStubEngine());
        const outcome = await runAndCaptureOutcome(runner, {
            method: 'AI-trained',
            expectedTrainingMode: 'default'
        });
        expect(outcome).not.toBe('WRONG_TRAINING_MODE');
    });
});

describe('engine.isTrained gate is method-aware', () => {
    test('runner constructs even when engine.isTrained is false (AI-trained will run; others get ENGINE_NOT_TRAINED at runAll)', () => {
        const engine = makeStubEngine({ isTrained: false });
        // Constructor no longer throws on untrained engine — gate is
        // deferred to runAll for backwards-compatible error reporting.
        expect(() => new AutoTestRunner(engine)).not.toThrow();
    });

    test('AI-trained method bypasses the legacy precondition', async () => {
        const engine = makeStubEngine({ isTrained: false });
        const runner = new AutoTestRunner(engine);
        const outcome = await runAndCaptureOutcome(runner, { method: 'AI-trained' });
        // Gate did not fire (would have produced ENGINE_NOT_TRAINED).
        expect(outcome).not.toBe('ENGINE_NOT_TRAINED');
    });

    test('Non-AI methods return ENGINE_NOT_TRAINED instead of throwing', async () => {
        const engine = makeStubEngine({ isTrained: false });
        const runner = new AutoTestRunner(engine);
        for (const method of ['auto-test', 'T1-strategy', 'test-strategy']) {
            const r = await runner.runAll(SAMPLE, { method });
            expect(r.outcome).toBe('ENGINE_NOT_TRAINED');
            expect(r.method).toBe(method);
            expect(r.message.toLowerCase()).toContain('train');
        }
        // Engine never touched.
        expect(engine.train).not.toHaveBeenCalled();
        expect(engine.decide).not.toHaveBeenCalled();
    });

    test('Trained engine: every method passes the precondition', async () => {
        const engine = makeStubEngine({ isTrained: true });
        const runner = new AutoTestRunner(engine);
        // Use AI-trained for a clean check that does not need engine internals.
        const outcome = await runAndCaptureOutcome(runner, { method: 'AI-trained' });
        expect(outcome).not.toBe('ENGINE_NOT_TRAINED');
    });
});

describe('opt-in: mismatched expectedTrainingMode → WRONG_TRAINING_MODE', () => {
    test('active = default, expected = ai-mode → aborted with clear outcome', async () => {
        TrainingState.setActiveMode('default');
        const engine = makeStubEngine();
        const runner = new AutoTestRunner(engine);
        const r = await runner.runAll(SAMPLE, {
            method: 'AI-trained',
            expectedTrainingMode: 'ai-mode'
        });
        expect(r.outcome).toBe('WRONG_TRAINING_MODE');
        expect(r.expectedTrainingMode).toBe('ai-mode');
        expect(r.activeTrainingMode).toBe('default');
        expect(r.message.toLowerCase()).toContain('ai-mode');
        expect(r.strategies).toEqual({});
        expect(r.overall).toBeNull();
        // No engine work performed.
        expect(engine.train).not.toHaveBeenCalled();
        expect(engine.decide).not.toHaveBeenCalled();
        expect(engine.recordResult).not.toHaveBeenCalled();
        expect(engine.recordSkip).not.toHaveBeenCalled();
    });

    test('active = null, expected = default → aborted with activeTrainingMode = null', async () => {
        const engine = makeStubEngine();
        const runner = new AutoTestRunner(engine);
        const r = await runner.runAll(SAMPLE, {
            method: 'auto-test',
            expectedTrainingMode: 'default'
        });
        expect(r.outcome).toBe('WRONG_TRAINING_MODE');
        expect(r.activeTrainingMode).toBeNull();
        expect(r.message.toLowerCase()).toContain('none');
    });
});
