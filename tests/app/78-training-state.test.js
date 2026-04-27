/**
 * TrainingState — pure mode-namespaced registry.
 */

const TS = require('../../training/training-state.js');
const {
    TRAINING_STATE_MODES,
    getStore, setStore, clearStore, hasStore,
    getActiveMode, setActiveMode, clearActiveMode,
    __internal
} = TS;

beforeEach(() => __internal.reset());

describe('module shape', () => {
    test('TRAINING_STATE_MODES = [default, user-mode, ai-mode, hybrid-mode]', () => {
        expect(TRAINING_STATE_MODES).toEqual(['default', 'user-mode', 'ai-mode', 'hybrid-mode']);
    });

    test('all reserved slots start null', () => {
        for (const id of TRAINING_STATE_MODES) {
            expect(getStore(id)).toBeNull();
            expect(hasStore(id)).toBe(false);
        }
        expect(getActiveMode()).toBeNull();
    });
});

describe('per-mode isolation', () => {
    test('writing one mode never mutates another (all 6 cross-pairings)', () => {
        for (let i = 0; i < TRAINING_STATE_MODES.length; i++) {
            for (let j = 0; j < TRAINING_STATE_MODES.length; j++) {
                if (i === j) continue;
                __internal.reset();
                const a = TRAINING_STATE_MODES[i];
                const b = TRAINING_STATE_MODES[j];
                setStore(a, { marker: a });
                expect(getStore(a)).toEqual({ marker: a });
                expect(getStore(b)).toBeNull();
                expect(hasStore(a)).toBe(true);
                expect(hasStore(b)).toBe(false);
            }
        }
    });

    test('clearStore only clears its own slot', () => {
        setStore('default',     { v: 1 });
        setStore('user-mode',   { v: 2 });
        setStore('ai-mode',     { v: 3 });
        setStore('hybrid-mode', { v: 4 });
        clearStore('ai-mode');
        expect(getStore('ai-mode')).toBeNull();
        expect(getStore('default')).toEqual({ v: 1 });
        expect(getStore('user-mode')).toEqual({ v: 2 });
        expect(getStore('hybrid-mode')).toEqual({ v: 4 });
    });
});

describe('input safety', () => {
    test('unknown / malformed mode ids are rejected; no mutation', () => {
        for (const bad of [undefined, null, '', 'unknown', 42, {}, []]) {
            expect(getStore(bad)).toBeNull();
            expect(hasStore(bad)).toBe(false);
            expect(setStore(bad, { x: 1 })).toBe(false);
            expect(clearStore(bad)).toBe(false);
            expect(setActiveMode(bad)).toBe(false);
        }
        // Untouched: every canonical slot still null.
        for (const id of TRAINING_STATE_MODES) expect(getStore(id)).toBeNull();
        expect(getActiveMode()).toBeNull();
    });

    test('setStore(mode, undefined) is treated as a clear (slot becomes null)', () => {
        setStore('default', { v: 1 });
        expect(hasStore('default')).toBe(true);
        setStore('default', undefined);
        expect(getStore('default')).toBeNull();
        expect(hasStore('default')).toBe(false);
    });
});

describe('active mode', () => {
    test('setActiveMode accepts only canonical ids', () => {
        expect(setActiveMode('ai-mode')).toBe(true);
        expect(getActiveMode()).toBe('ai-mode');
        // Bad input does not overwrite previous value.
        expect(setActiveMode('bogus')).toBe(false);
        expect(getActiveMode()).toBe('ai-mode');
        expect(setActiveMode(null)).toBe(false);
        expect(getActiveMode()).toBe('ai-mode');
    });

    test('setActiveMode is independent of setStore', () => {
        // Setting active does not write a payload.
        setActiveMode('default');
        expect(hasStore('default')).toBe(false);
        // Writing payload does not change active.
        clearActiveMode();
        setStore('user-mode', { v: 1 });
        expect(getActiveMode()).toBeNull();
    });

    test('clearActiveMode resets only the active marker', () => {
        setStore('default', { x: 1 });
        setActiveMode('default');
        clearActiveMode();
        expect(getActiveMode()).toBeNull();
        expect(getStore('default')).toEqual({ x: 1 });
    });
});

describe('__internal.reset', () => {
    test('wipes every slot and the active marker', () => {
        for (const id of TRAINING_STATE_MODES) setStore(id, { v: id });
        setActiveMode('hybrid-mode');
        __internal.reset();
        for (const id of TRAINING_STATE_MODES) expect(getStore(id)).toBeNull();
        expect(getActiveMode()).toBeNull();
    });
});
