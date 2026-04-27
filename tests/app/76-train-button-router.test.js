/**
 * UI integration for the TRAIN mode router.
 *
 * Verifies the dropdown next to TRAIN, default selection, click routing,
 * and that the legacy `_flashTrainButton()` still operates on `#trainBtn`.
 */

function setupDOM() {
    document.body.innerHTML = `
        <div id="aiSelectionPanel">
            <div id="aiPanelContent">
                <div class="table-selection-section" data-table="3"></div>
            </div>
        </div>
    `;
}

let AIAutoModeUI;
beforeAll(() => {
    setupDOM();
    ({ AIAutoModeUI } = require('../../app/ai-auto-mode-ui'));
});

beforeEach(() => {
    setupDOM();
    window.aiAutoEngine = null;
    window.aiAutoModeUI = null;
    window.aiDataLoader = null;
    window.autoUpdateOrchestrator = null;
});

describe('UI dropdown', () => {
    test('#trainingModeSelect exists with four options', () => {
        const ui = new AIAutoModeUI();
        const sel = document.getElementById('trainingModeSelect');
        expect(sel).not.toBeNull();
        const values = Array.from(sel.options).map(o => o.value);
        expect(values).toEqual(['default', 'user-mode', 'ai-mode', 'hybrid-mode']);
    });

    test('default training mode is "default"', () => {
        const ui = new AIAutoModeUI();
        const sel = document.getElementById('trainingModeSelect');
        expect(ui.selectedTrainingMode).toBe('default');
        expect(sel.value).toBe('default');
    });

    test('legacy #trainBtn still exists alongside the new dropdown', () => {
        new AIAutoModeUI();
        expect(document.getElementById('trainBtn')).not.toBeNull();
        expect(document.getElementById('trainingModeSelect')).not.toBeNull();
    });

    test('invalid select value does not overwrite selectedTrainingMode', () => {
        const ui = new AIAutoModeUI();
        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'bogus-mode';
        sel.dispatchEvent(new Event('change'));
        expect(ui.selectedTrainingMode).toBe('default');
        // Dropdown also restored to the current state.
        expect(sel.value).toBe('default');
    });

    test('valid select value updates selectedTrainingMode', () => {
        const ui = new AIAutoModeUI();
        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'user-mode';
        sel.dispatchEvent(new Event('change'));
        expect(ui.selectedTrainingMode).toBe('user-mode');
        sel.value = 'ai-mode';
        sel.dispatchEvent(new Event('change'));
        expect(ui.selectedTrainingMode).toBe('ai-mode');
        sel.value = 'hybrid-mode';
        sel.dispatchEvent(new Event('change'));
        expect(ui.selectedTrainingMode).toBe('hybrid-mode');
    });
});

describe('click routing', () => {
    test('default-mode click invokes the legacy startTraining() pipeline', async () => {
        const ui = new AIAutoModeUI();
        const startSpy = jest.spyOn(ui, 'startTraining').mockImplementation(async () => 'legacy-ran');
        const userSpy = jest.spyOn(ui, '_handleUserModeTraining');
        const aiSpy = jest.spyOn(ui, '_handleAiModeTraining');
        const hybSpy = jest.spyOn(ui, '_handleHybridModeTraining');

        // Default selection — no dropdown change required.
        await ui.runSelectedTraining();
        expect(startSpy).toHaveBeenCalledTimes(1);
        expect(userSpy).not.toHaveBeenCalled();
        expect(aiSpy).not.toHaveBeenCalled();
        expect(hybSpy).not.toHaveBeenCalled();
    });

    test('user-mode click does NOT call engine.train; shows the not-implemented status', async () => {
        const ui = new AIAutoModeUI();
        const fakeEngine = {
            train: jest.fn(),
            isTrained: false,
            sequenceModel: null,
            learningVersion: 'v1',
            getState: () => ({
                pairModelCount: 0,
                sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
            }),
            session: { consecutiveSkips: 0 }
        };
        ui.engine = fakeEngine;
        ui.dataLoader = { loadMultiple: jest.fn() };

        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'user-mode';
        sel.dispatchEvent(new Event('change'));
        await ui.runSelectedTraining();

        expect(fakeEngine.train).not.toHaveBeenCalled();
        const status = document.getElementById('trainingStatus');
        // Change 3 (Synopsis Timing Fix) — placeholder modes overwrite
        // status with the rich one-liner: "<Mode> · run #N · placeholder
        // (not implemented in this build) · HH:MM:SS".
        expect(status.textContent.toLowerCase()).toContain('not implemented in this build');
    });

    test('ai-mode click does NOT call engine.train; shows the AI-mode status', async () => {
        const ui = new AIAutoModeUI();
        const fakeEngine = {
            train: jest.fn(),
            isTrained: false,
            sequenceModel: null,
            learningVersion: 'v1',
            getState: () => ({
                pairModelCount: 0,
                sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
            }),
            session: { consecutiveSkips: 0 }
        };
        ui.engine = fakeEngine;
        ui.dataLoader = { loadMultiple: jest.fn() };

        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'ai-mode';
        sel.dispatchEvent(new Event('change'));
        await ui.runSelectedTraining();

        expect(fakeEngine.train).not.toHaveBeenCalled();
        const status = document.getElementById('trainingStatus');
        expect(status.textContent.toLowerCase()).toContain('learns live');
    });

    test('hybrid-mode click does NOT call engine.train; shows the not-implemented status', async () => {
        const ui = new AIAutoModeUI();
        const fakeEngine = {
            train: jest.fn(),
            isTrained: false,
            sequenceModel: null,
            learningVersion: 'v1',
            getState: () => ({
                pairModelCount: 0,
                sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
            }),
            session: { consecutiveSkips: 0 }
        };
        ui.engine = fakeEngine;
        ui.dataLoader = { loadMultiple: jest.fn() };

        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'hybrid-mode';
        sel.dispatchEvent(new Event('change'));
        await ui.runSelectedTraining();

        expect(fakeEngine.train).not.toHaveBeenCalled();
        const status = document.getElementById('trainingStatus');
        // Change 3 (Synopsis Timing Fix) — placeholder modes overwrite
        // status with the rich one-liner: "<Mode> · run #N · placeholder
        // (not implemented in this build) · HH:MM:SS".
        expect(status.textContent.toLowerCase()).toContain('not implemented in this build');
    });
});

describe('mode-isolation reset hooks', () => {
    test('TRAIN-mode change wipes AI-trained controller and strategy cache', () => {
        const ui = new AIAutoModeUI();
        // Step 6 cutover: ai-auto-mode-ui.js now reads from strategies/.
        const sm = require('../../strategies/ai-trained/ai-trained-strategy.js');
        const spyAll = jest.spyOn(sm, 'resetAITrainedStrategyAll');
        const ctrl = { resetSession: jest.fn() };
        window.aiTrainedController = ctrl;

        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'ai-mode';
        sel.dispatchEvent(new Event('change'));

        expect(spyAll).toHaveBeenCalledTimes(1);
        expect(ctrl.resetSession).toHaveBeenCalledTimes(1);
        spyAll.mockRestore();
        delete window.aiTrainedController;
    });

    test('TRAIN click wipes AI-trained state regardless of selected mode', async () => {
        const ui = new AIAutoModeUI();
        // Step 6 cutover: ai-auto-mode-ui.js now reads from strategies/.
        const sm = require('../../strategies/ai-trained/ai-trained-strategy.js');
        const spyAll = jest.spyOn(sm, 'resetAITrainedStrategyAll');
        const ctrl = { resetSession: jest.fn() };
        window.aiTrainedController = ctrl;
        jest.spyOn(ui, 'startTraining').mockImplementation(async () => 'ok');

        await ui.runSelectedTraining();           // default mode
        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'hybrid-mode';
        sel.dispatchEvent(new Event('change'));   // 1 reset (change)
        await ui.runSelectedTraining();           // 1 more reset (click)

        // 1 reset on the first click + 1 on dropdown change + 1 on the
        // second click = 3.
        expect(spyAll).toHaveBeenCalledTimes(3);
        expect(ctrl.resetSession).toHaveBeenCalledTimes(3);
        spyAll.mockRestore();
        delete window.aiTrainedController;
    });

    test('default-mode click status carries active-mode label and run number', async () => {
        const ui = new AIAutoModeUI();
        jest.spyOn(ui, 'startTraining').mockImplementation(async () => 'ok');
        // Step 2 cutover: reset BOTH old and new TrainingState so neither
        // leaks (ai-auto-mode-ui.js now reads/writes training/).
        const TrainingState = require('../../training/training-state.js');
        TrainingState.__internal.reset();
        try { require('../../training/training-state.js').__internal.reset(); } catch (_) {}
        await ui.runSelectedTraining();
        const status = document.getElementById('trainingStatus');
        // Mode-specific synopsis must always identify Default mode and
        // the run counter so the user sees a per-click line, not the
        // generic legacy "Trained (N pairs)" string in isolation.
        expect(status.textContent).toContain('Default mode');
        expect(status.textContent).toContain('run #1');
    });

    test('AI-mode click status reads "Active mode: AI-mode (run #1) (placeholder)"', async () => {
        const ui = new AIAutoModeUI();
        // Step 2 cutover: reset BOTH old and new TrainingState so neither
        // leaks (ai-auto-mode-ui.js now reads/writes training/).
        const TrainingState = require('../../training/training-state.js');
        TrainingState.__internal.reset();
        try { require('../../training/training-state.js').__internal.reset(); } catch (_) {}
        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'ai-mode';
        sel.dispatchEvent(new Event('change'));
        await ui.runSelectedTraining();
        const status = document.getElementById('trainingStatus');
        expect(status.textContent).toContain('AI-mode');
        expect(status.textContent).toContain('run #1');
        expect(status.textContent.toLowerCase()).toContain('placeholder');
    });

    test('direct engine.train(...) bypassing runSelectedTraining publishes the default synopsis + banner', () => {
        const ui = new AIAutoModeUI();
        // Step 2 cutover: reset BOTH old and new TrainingState so neither
        // leaks (ai-auto-mode-ui.js now reads/writes training/).
        const TrainingState = require('../../training/training-state.js');
        TrainingState.__internal.reset();
        try { require('../../training/training-state.js').__internal.reset(); } catch (_) {}
        // Real engine ref so the monkey-patch installs (not a jest mock).
        const engine = {
            train: function (sessions) {
                return { totalSpins: 100, overallHitRate: 0.5, pairStats: {}, filterStats: {} };
            },
            sequenceModel: { isTrained: true },
            learningVersion: 'v2',
            isTrained: true,
            getState: () => ({
                pairModelCount: 5,
                sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
            }),
            session: { consecutiveSkips: 0 }
        };
        ui.engine = engine;
        // Install the wrapper without going through runSelectedTraining.
        ui._ensureEngineTrainPatch();
        // Now call engine.train directly — the wrapper publishes.
        engine.train([[1, 2, 3], [4, 5, 6]]);

        // _trainingSynopses['default'] is populated.
        expect(ui._trainingSynopses['default']).toBeTruthy();
        expect(ui._trainingSynopses['default'].runIndex).toBe(1);
        // Progress text carries the rich one-liner.
        const progress = document.getElementById('trainingProgressText');
        expect(progress.textContent).toContain('Default mode');
        expect(progress.textContent).toContain('run #1');
        // Active mode marker set by the wrapper when none was set.
        expect(TrainingState.getActiveMode()).toBe('default');
    });

    test('Fix 2: progress text shows mode + run number after each click', async () => {
        const ui = new AIAutoModeUI();
        jest.spyOn(ui, 'startTraining').mockImplementation(async () => 'ok');
        // Step 2 cutover: reset BOTH old and new TrainingState so neither
        // leaks (ai-auto-mode-ui.js now reads/writes training/).
        const TrainingState = require('../../training/training-state.js');
        TrainingState.__internal.reset();
        try { require('../../training/training-state.js').__internal.reset(); } catch (_) {}

        const progress = document.getElementById('trainingProgressText');

        // First click — Default mode (default selection)
        await ui.runSelectedTraining();
        const firstText = progress.textContent;
        expect(firstText).toContain('Default mode');
        expect(firstText).toContain('run #1');

        // Switch to AI-mode and click — placeholder line.
        const sel = document.getElementById('trainingModeSelect');
        sel.value = 'ai-mode';
        sel.dispatchEvent(new Event('change'));
        await ui.runSelectedTraining();
        expect(progress.textContent).toContain('AI-mode');
        expect(progress.textContent.toLowerCase()).toContain('placeholder');

        // Switch to Hybrid-mode — different placeholder note.
        sel.value = 'hybrid-mode';
        sel.dispatchEvent(new Event('change'));
        await ui.runSelectedTraining();
        expect(progress.textContent).toContain('Hybrid-mode');
        expect(progress.textContent.toLowerCase()).toContain('not implemented');
    });

    test('Fix 2: repeated default clicks show distinct run numbers (not stale text)', async () => {
        const ui = new AIAutoModeUI();
        jest.spyOn(ui, 'startTraining').mockImplementation(async () => 'ok');
        // Step 2 cutover: reset BOTH old and new TrainingState so neither
        // leaks (ai-auto-mode-ui.js now reads/writes training/).
        const TrainingState = require('../../training/training-state.js');
        TrainingState.__internal.reset();
        try { require('../../training/training-state.js').__internal.reset(); } catch (_) {}

        const progress = document.getElementById('trainingProgressText');
        await ui.runSelectedTraining();
        const t1 = progress.textContent;
        await ui.runSelectedTraining();
        const t2 = progress.textContent;
        await ui.runSelectedTraining();
        const t3 = progress.textContent;
        expect(t1).toContain('run #1');
        expect(t2).toContain('run #2');
        expect(t3).toContain('run #3');
    });
});

describe('legacy _flashTrainButton still works on #trainBtn', () => {
    test('flashing the train button does not throw and toggles its style', () => {
        jest.useFakeTimers();
        const ui = new AIAutoModeUI();
        const btn = document.getElementById('trainBtn');
        const beforeBg = btn.style.background;
        ui._flashTrainButton();
        // Advance through one flash interval.
        jest.advanceTimersByTime(200);
        // No throw, button still in DOM.
        expect(document.getElementById('trainBtn')).toBe(btn);
        // After all 6 ticks the background settles to amber.
        jest.advanceTimersByTime(2000);
        expect(['#f59e0b', 'rgb(245, 158, 11)']).toContain(btn.style.background);
        expect(beforeBg).toBeDefined();
        jest.useRealTimers();
    });
});
