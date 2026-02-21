/**
 * TESTS: Auto-Update Orchestrator
 * Coverage for: AutoUpdateOrchestrator class — constructor defaults,
 * enable/disable toggling, reset, pair loading, session management,
 * and interval-based spin detection via setupListeners.
 */

const fs = require('fs');
const path = require('path');

let AutoUpdateOrchestrator;

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

    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load AutoUpdateOrchestrator:', e.message);
        return null;
    }
}

// ─── Setup & Teardown ────────────────────────────────────────────────

let orchestrator;

beforeEach(() => {
    AutoUpdateOrchestrator = loadOrchestratorClass();

    // Fresh window globals
    global.window = global.window || {};
    global.window.spins = [];
    global.window.aiPanel = undefined;
    global.window.aiIntegrationV6 = undefined;
    global.window.aiIntegration = undefined;

    orchestrator = new AutoUpdateOrchestrator();
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ─── 1. Constructor ──────────────────────────────────────────────────

describe('AutoUpdateOrchestrator - Constructor', () => {
    test('initializes lastSpinCount to 0', () => {
        expect(orchestrator.lastSpinCount).toBe(0);
    });

    test('initializes isEnabled to true', () => {
        expect(orchestrator.isEnabled).toBe(true);
    });

    test('initializes sessionStarted to false', () => {
        expect(orchestrator.sessionStarted).toBe(false);
    });

    test('logs initialization message', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation();
        const inst = new AutoUpdateOrchestrator();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Auto-Update Orchestrator initialized'));
        spy.mockRestore();
    });
});

// ─── 2. enable() ────────────────────────────────────────────────────

describe('AutoUpdateOrchestrator - enable()', () => {
    test('sets isEnabled to true', () => {
        orchestrator.isEnabled = false;
        orchestrator.enable();
        expect(orchestrator.isEnabled).toBe(true);
    });

    test('logs enable message', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation();
        orchestrator.enable();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Auto-update enabled'));
        spy.mockRestore();
    });
});

// ─── 3. disable() ───────────────────────────────────────────────────

describe('AutoUpdateOrchestrator - disable()', () => {
    test('sets isEnabled to false', () => {
        orchestrator.disable();
        expect(orchestrator.isEnabled).toBe(false);
    });

    test('logs disable message', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation();
        orchestrator.disable();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Auto-update disabled'));
        spy.mockRestore();
    });
});

// ─── 4. reset() ─────────────────────────────────────────────────────

describe('AutoUpdateOrchestrator - reset()', () => {
    test('resets lastSpinCount to 0', () => {
        orchestrator.lastSpinCount = 42;
        orchestrator.reset();
        expect(orchestrator.lastSpinCount).toBe(0);
    });

    test('resets sessionStarted to false', () => {
        orchestrator.sessionStarted = true;
        orchestrator.reset();
        expect(orchestrator.sessionStarted).toBe(false);
    });

    test('logs reset message', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation();
        orchestrator.reset();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Auto-update orchestrator reset'));
        spy.mockRestore();
    });

    test('does not change isEnabled', () => {
        orchestrator.isEnabled = false;
        orchestrator.reset();
        expect(orchestrator.isEnabled).toBe(false);
    });
});

// ─── 5. loadPairsForManualSelection() ───────────────────────────────

describe('AutoUpdateOrchestrator - loadPairsForManualSelection()', () => {
    test('calls loadAvailablePairs when aiPanel is available', () => {
        const mockLoadPairs = jest.fn();
        global.window.aiPanel = { loadAvailablePairs: mockLoadPairs };

        orchestrator.loadPairsForManualSelection();
        expect(mockLoadPairs).toHaveBeenCalledTimes(1);
    });

    test('logs loading message when aiPanel is available', () => {
        global.window.aiPanel = { loadAvailablePairs: jest.fn() };
        const spy = jest.spyOn(console, 'log').mockImplementation();

        orchestrator.loadPairsForManualSelection();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Loading pairs for manual selection'));
        spy.mockRestore();
    });

    test('handles missing aiPanel gracefully', () => {
        global.window.aiPanel = undefined;
        expect(() => orchestrator.loadPairsForManualSelection()).not.toThrow();
    });

    test('warns when aiPanel is not available', () => {
        global.window.aiPanel = undefined;
        const spy = jest.spyOn(console, 'warn').mockImplementation();

        orchestrator.loadPairsForManualSelection();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('AI panel not available'));
        spy.mockRestore();
    });

    test('handles aiPanel without loadAvailablePairs function', () => {
        global.window.aiPanel = { loadAvailablePairs: 'not-a-function' };
        const spy = jest.spyOn(console, 'warn').mockImplementation();

        orchestrator.loadPairsForManualSelection();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('AI panel not available'));
        spy.mockRestore();
    });

    test('handles aiPanel being null', () => {
        global.window.aiPanel = null;
        expect(() => orchestrator.loadPairsForManualSelection()).not.toThrow();
    });
});

// ─── 6. startSessionFirst() ─────────────────────────────────────────

describe('AutoUpdateOrchestrator - startSessionFirst()', () => {
    test('calls integration.startSession(4000, 100) with aiIntegrationV6', async () => {
        const mockStartSession = jest.fn().mockResolvedValue({ status: 'ok' });
        global.window.aiIntegrationV6 = { startSession: mockStartSession };

        await orchestrator.startSessionFirst();
        expect(mockStartSession).toHaveBeenCalledWith(4000, 100);
    });

    test('sets sessionStarted to true on success', async () => {
        global.window.aiIntegrationV6 = {
            startSession: jest.fn().mockResolvedValue({ status: 'ok' }),
        };

        expect(orchestrator.sessionStarted).toBe(false);
        await orchestrator.startSessionFirst();
        expect(orchestrator.sessionStarted).toBe(true);
    });

    test('logs success message on session start', async () => {
        global.window.aiIntegrationV6 = {
            startSession: jest.fn().mockResolvedValue('session-ok'),
        };
        const spy = jest.spyOn(console, 'log').mockImplementation();

        await orchestrator.startSessionFirst();
        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('Session started'),
            expect.anything()
        );
        spy.mockRestore();
    });

    test('falls back to aiIntegration when aiIntegrationV6 is missing', async () => {
        const mockStartSession = jest.fn().mockResolvedValue({ status: 'ok' });
        global.window.aiIntegrationV6 = undefined;
        global.window.aiIntegration = { startSession: mockStartSession };

        await orchestrator.startSessionFirst();
        expect(mockStartSession).toHaveBeenCalledWith(4000, 100);
        expect(orchestrator.sessionStarted).toBe(true);
    });

    test('prefers aiIntegrationV6 over aiIntegration when both exist', async () => {
        const mockV6 = jest.fn().mockResolvedValue('v6');
        const mockLegacy = jest.fn().mockResolvedValue('legacy');
        global.window.aiIntegrationV6 = { startSession: mockV6 };
        global.window.aiIntegration = { startSession: mockLegacy };

        await orchestrator.startSessionFirst();
        expect(mockV6).toHaveBeenCalledTimes(1);
        expect(mockLegacy).not.toHaveBeenCalled();
    });

    test('handles missing integration gracefully', async () => {
        global.window.aiIntegrationV6 = undefined;
        global.window.aiIntegration = undefined;
        const spy = jest.spyOn(console, 'error').mockImplementation();

        await expect(orchestrator.startSessionFirst()).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('AI Integration not found'));
        expect(orchestrator.sessionStarted).toBe(false);
        spy.mockRestore();
    });

    test('does not set sessionStarted when integration is missing', async () => {
        global.window.aiIntegrationV6 = undefined;
        global.window.aiIntegration = undefined;
        jest.spyOn(console, 'error').mockImplementation();

        await orchestrator.startSessionFirst();
        expect(orchestrator.sessionStarted).toBe(false);
    });

    test('handles error thrown by startSession', async () => {
        const err = new Error('session-failure');
        global.window.aiIntegrationV6 = {
            startSession: jest.fn().mockRejectedValue(err),
        };
        const spy = jest.spyOn(console, 'error').mockImplementation();

        await expect(orchestrator.startSessionFirst()).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to start session'),
            expect.any(Error)
        );
        expect(orchestrator.sessionStarted).toBe(false);
        spy.mockRestore();
    });

    test('does not set sessionStarted on error', async () => {
        global.window.aiIntegrationV6 = {
            startSession: jest.fn().mockRejectedValue(new Error('boom')),
        };
        jest.spyOn(console, 'error').mockImplementation();

        await orchestrator.startSessionFirst();
        expect(orchestrator.sessionStarted).toBe(false);
    });
});

// ─── 7. setupListeners() ────────────────────────────────────────────

describe('AutoUpdateOrchestrator - setupListeners()', () => {
    let realSetInterval;

    beforeEach(() => {
        jest.useFakeTimers();
        // The eval-loaded class has its own setInterval stub, so we need
        // to re-create an instance that uses the real (now-faked) setInterval.
        // We do this by reloading the class with the global setInterval exposed.
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'auto-update-orchestrator.js'),
            'utf-8'
        );

        const wrappedCode = `
            (function() {
                const setTimeout = globalThis.setTimeout;
                const setInterval = globalThis.setInterval;
                const document = { addEventListener: () => {} };
                const window = globalThis.window || {};
                const console = globalThis.console;
                ${src}
                return AutoUpdateOrchestrator;
            })()
        `;
        const Cls = eval(wrappedCode);
        orchestrator = new Cls();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('setInterval is called when setupListeners is invoked', () => {
        // The interval-based tests already prove setInterval works
        // (advanceTimersByTime triggers the callback). Here we verify
        // the interval fires on the expected 500ms cadence.
        jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        jest.spyOn(orchestrator, 'startSessionFirst').mockResolvedValue();
        orchestrator.setupListeners();

        global.window.spins = [1];

        // Should NOT have triggered yet at 499ms
        jest.advanceTimersByTime(499);
        expect(orchestrator.lastSpinCount).toBe(0);

        // Should trigger at 500ms
        jest.advanceTimersByTime(1);
        expect(orchestrator.lastSpinCount).toBe(1);
    });

    test('does nothing when isEnabled is false', () => {
        orchestrator.disable();
        orchestrator.setupListeners();

        global.window.spins = [1, 2, 3];
        const loadSpy = jest.spyOn(orchestrator, 'loadPairsForManualSelection');

        jest.advanceTimersByTime(1000);
        expect(loadSpy).not.toHaveBeenCalled();
    });

    test('detects new spins and calls loadPairsForManualSelection', () => {
        const loadSpy = jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        orchestrator.setupListeners();

        // Simulate a new spin
        global.window.spins = [10];
        jest.advanceTimersByTime(500);

        expect(loadSpy).toHaveBeenCalledTimes(1);
    });

    test('updates lastSpinCount when new spins are detected', () => {
        jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        jest.spyOn(orchestrator, 'startSessionFirst').mockResolvedValue();
        orchestrator.setupListeners();

        global.window.spins = [10, 20];
        jest.advanceTimersByTime(500);

        expect(orchestrator.lastSpinCount).toBe(2);
    });

    test('calls startSessionFirst when session has not started', () => {
        jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        const startSpy = jest.spyOn(orchestrator, 'startSessionFirst').mockResolvedValue();
        orchestrator.sessionStarted = false;
        orchestrator.setupListeners();

        global.window.spins = [10];
        jest.advanceTimersByTime(500);

        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    test('does not call startSessionFirst when session is already started', () => {
        jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        const startSpy = jest.spyOn(orchestrator, 'startSessionFirst').mockResolvedValue();
        orchestrator.sessionStarted = true;
        orchestrator.setupListeners();

        global.window.spins = [10];
        jest.advanceTimersByTime(500);

        expect(startSpy).not.toHaveBeenCalled();
    });

    test('does not trigger when spin count has not increased', () => {
        const loadSpy = jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        orchestrator.lastSpinCount = 5;
        orchestrator.setupListeners();

        global.window.spins = [1, 2, 3, 4, 5];
        jest.advanceTimersByTime(500);

        expect(loadSpy).not.toHaveBeenCalled();
    });

    test('handles window.spins being undefined', () => {
        const loadSpy = jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        orchestrator.setupListeners();

        global.window.spins = undefined;
        jest.advanceTimersByTime(500);

        expect(loadSpy).not.toHaveBeenCalled();
    });

    test('triggers multiple times as spins accumulate', () => {
        const loadSpy = jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        jest.spyOn(orchestrator, 'startSessionFirst').mockResolvedValue();
        orchestrator.setupListeners();

        // First spin
        global.window.spins = [10];
        jest.advanceTimersByTime(500);
        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(orchestrator.lastSpinCount).toBe(1);

        // Second spin
        global.window.spins = [10, 20];
        jest.advanceTimersByTime(500);
        expect(loadSpy).toHaveBeenCalledTimes(2);
        expect(orchestrator.lastSpinCount).toBe(2);
    });

    test('does not trigger when spin count decreases', () => {
        const loadSpy = jest.spyOn(orchestrator, 'loadPairsForManualSelection').mockImplementation();
        orchestrator.lastSpinCount = 10;
        orchestrator.setupListeners();

        global.window.spins = [1, 2, 3]; // 3 < 10
        jest.advanceTimersByTime(500);

        expect(loadSpy).not.toHaveBeenCalled();
    });
});
