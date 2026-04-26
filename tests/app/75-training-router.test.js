/**
 * TRAIN mode router — pure dispatcher tests.
 */

const {
    TRAINING_MODES,
    TRAINING_DEFAULT_MODE,
    TRAINING_MODE_META,
    runTraining
} = require('../../app/training-router.js');
const TrainingState = require('../../app/training-state.js');

beforeEach(() => TrainingState.__internal.reset());

describe('module shape', () => {
    test('TRAINING_MODES = [default, user-mode, ai-mode, hybrid-mode]', () => {
        expect(TRAINING_MODES).toEqual(['default', 'user-mode', 'ai-mode', 'hybrid-mode']);
    });

    test('TRAINING_DEFAULT_MODE = default', () => {
        expect(TRAINING_DEFAULT_MODE).toBe('default');
    });

    test('TRAINING_MODE_META has an entry per mode with id/label/requiresEngineTrain', () => {
        TRAINING_MODES.forEach(id => {
            const meta = TRAINING_MODE_META[id];
            expect(meta).toBeTruthy();
            expect(meta.id).toBe(id);
            expect(typeof meta.label).toBe('string');
            expect(typeof meta.requiresEngineTrain).toBe('boolean');
        });
        // Only Default mode runs the legacy engine.train pipeline.
        expect(TRAINING_MODE_META['default'].requiresEngineTrain).toBe(true);
        expect(TRAINING_MODE_META['user-mode'].requiresEngineTrain).toBe(false);
        expect(TRAINING_MODE_META['ai-mode'].requiresEngineTrain).toBe(false);
        expect(TRAINING_MODE_META['hybrid-mode'].requiresEngineTrain).toBe(false);
    });
});

describe('dispatch', () => {
    function makeCtx(overrides) {
        const status = [];
        return Object.assign({
            defaultModeHandler: jest.fn(async () => 'default-ran'),
            userModeHandler:    jest.fn(async () => 'user-ran'),
            aiModeHandler:      jest.fn(async () => 'ai-ran'),
            hybridModeHandler:  jest.fn(async () => 'hybrid-ran'),
            onStatus: jest.fn((m) => status.push(m)),
            __status: status
        }, overrides || {});
    }

    test('default invokes only the default-mode handler and reports ranEngineTrain=true', async () => {
        const ctx = makeCtx();
        const r = await runTraining('default', ctx);
        expect(r.mode).toBe('default');
        expect(r.ok).toBe(true);
        expect(r.ranEngineTrain).toBe(true);
        expect(r.result).toBe('default-ran');
        expect(ctx.defaultModeHandler).toHaveBeenCalledTimes(1);
        expect(ctx.userModeHandler).not.toHaveBeenCalled();
        expect(ctx.aiModeHandler).not.toHaveBeenCalled();
        expect(ctx.hybridModeHandler).not.toHaveBeenCalled();
    });

    test('user-mode invokes only the user-mode handler and reports ranEngineTrain=false', async () => {
        const ctx = makeCtx();
        const r = await runTraining('user-mode', ctx);
        expect(r.mode).toBe('user-mode');
        expect(r.ok).toBe(true);
        expect(r.ranEngineTrain).toBe(false);
        expect(r.result).toBe('user-ran');
        expect(ctx.userModeHandler).toHaveBeenCalledTimes(1);
        expect(ctx.defaultModeHandler).not.toHaveBeenCalled();
        expect(ctx.aiModeHandler).not.toHaveBeenCalled();
        expect(ctx.hybridModeHandler).not.toHaveBeenCalled();
    });

    test('ai-mode invokes only the ai-mode handler and reports ranEngineTrain=false', async () => {
        const ctx = makeCtx();
        const r = await runTraining('ai-mode', ctx);
        expect(r.mode).toBe('ai-mode');
        expect(r.ok).toBe(true);
        expect(r.ranEngineTrain).toBe(false);
        expect(ctx.aiModeHandler).toHaveBeenCalledTimes(1);
        expect(ctx.userModeHandler).not.toHaveBeenCalled();
        expect(ctx.hybridModeHandler).not.toHaveBeenCalled();
    });

    test('hybrid-mode invokes only the hybrid handler and reports ranEngineTrain=false', async () => {
        const ctx = makeCtx();
        const r = await runTraining('hybrid-mode', ctx);
        expect(r.mode).toBe('hybrid-mode');
        expect(r.ok).toBe(true);
        expect(r.ranEngineTrain).toBe(false);
        expect(ctx.hybridModeHandler).toHaveBeenCalledTimes(1);
        expect(ctx.userModeHandler).not.toHaveBeenCalled();
        expect(ctx.aiModeHandler).not.toHaveBeenCalled();
    });

    test('unknown mode falls back to default and emits a status with the unknown name', async () => {
        const ctx = makeCtx();
        const r = await runTraining('something-else', ctx);
        expect(r.mode).toBe('default');
        expect(r.ok).toBe(true);
        expect(ctx.defaultModeHandler).toHaveBeenCalledTimes(1);
        expect(ctx.__status.some(m => m.includes('something-else'))).toBe(true);
    });

    test('handler that throws returns ok:false and emits a status; never throws', async () => {
        const ctx = makeCtx({
            aiModeHandler: jest.fn(async () => { throw new Error('boom'); })
        });
        const r = await runTraining('ai-mode', ctx);
        expect(r.ok).toBe(false);
        expect(r.message).toMatch(/boom/);
        expect(ctx.__status.some(m => m.includes('boom'))).toBe(true);
    });

    test('missing handler returns ok:false with a clear message', async () => {
        const r = await runTraining('default', { onStatus: jest.fn() });
        expect(r.ok).toBe(false);
        expect(r.message).toMatch(/No handler/);
    });
});

describe('registry recording', () => {
    function makeCtx(overrides) {
        return Object.assign({
            defaultModeHandler: jest.fn(async () => 'default-ran'),
            userModeHandler:    jest.fn(async () => ({ mode: 'user-mode',   skipped: true })),
            aiModeHandler:      jest.fn(async () => ({ mode: 'ai-mode',     skipped: true })),
            hybridModeHandler:  jest.fn(async () => ({ mode: 'hybrid-mode', skipped: true })),
            onStatus: () => {}
        }, overrides || {});
    }

    test('default-mode success records a marker, sets active mode, and reports lastTrained', async () => {
        const r = await runTraining('default', makeCtx());
        expect(r.ok).toBe(true);
        expect(r.lastTrained).toBeTruthy();
        expect(r.lastTrained.modeId).toBe('default');
        expect(typeof r.lastTrained.timestamp).toBe('number');
        expect(TrainingState.hasStore('default')).toBe(true);
        expect(TrainingState.getActiveMode()).toBe('default');
    });

    test('placeholder modes (user/ai/hybrid) skip the registry and leave active mode unchanged', async () => {
        for (const m of ['user-mode', 'ai-mode', 'hybrid-mode']) {
            TrainingState.__internal.reset();
            const r = await runTraining(m, makeCtx());
            expect(r.ok).toBe(true);
            expect(r.lastTrained).toBeUndefined();
            expect(TrainingState.hasStore(m)).toBe(false);
            expect(TrainingState.getActiveMode()).toBeNull();
        }
    });

    test('a real (non-skipped) future user-mode payload would mark active correctly', async () => {
        const ctx = makeCtx({
            userModeHandler: jest.fn(async () => ({ mode: 'user-mode', stats: { spins: 100 } }))
        });
        const r = await runTraining('user-mode', ctx);
        expect(r.lastTrained).toEqual({ modeId: 'user-mode', timestamp: expect.any(Number) });
        expect(TrainingState.hasStore('user-mode')).toBe(true);
        expect(TrainingState.getActiveMode()).toBe('user-mode');
    });

    test('failed default handler does NOT mark active', async () => {
        TrainingState.setActiveMode('ai-mode'); // pre-existing active marker
        const ctx = makeCtx({
            defaultModeHandler: jest.fn(async () => { throw new Error('train-fail'); })
        });
        const r = await runTraining('default', ctx);
        expect(r.ok).toBe(false);
        expect(TrainingState.getActiveMode()).toBe('ai-mode'); // unchanged
        expect(TrainingState.hasStore('default')).toBe(false);
    });
});
