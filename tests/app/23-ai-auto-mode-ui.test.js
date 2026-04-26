/**
 * Test Suite 23: AI Auto Mode UI — 100% Coverage
 *
 * Tests the AIAutoModeUI class: toggle, training, status display,
 * decision display, and pair selection visibility.
 *
 * Uses jest-environment-jsdom — no explicit jsdom import needed.
 */

// Setup DOM elements needed by AIAutoModeUI before requiring the module
function setupAutoModeDOM() {
    document.body.innerHTML = `
        <div id="aiSelectionPanel">
            <div id="aiPanelContent">
                <div class="table-selection-section" data-table="3"></div>
                <div class="table-selection-section" data-table="2"></div>
                <div class="table-selection-section" data-table="1"></div>
            </div>
        </div>
    `;
}

let AIAutoModeUI;

beforeAll(() => {
    setupAutoModeDOM();
    const mod = require('../../app/ai-auto-mode-ui');
    AIAutoModeUI = mod.AIAutoModeUI;
});

describe('AIAutoModeUI', () => {
    let ui;

    beforeEach(() => {
        // Reset DOM for each test
        setupAutoModeDOM();

        // Reset window objects
        window.aiAutoEngine = null;
        window.aiAutoModeUI = null;
        window.aiDataLoader = null;
        window.autoUpdateOrchestrator = null;
        window.aiAPI = null;

        ui = new AIAutoModeUI();
    });

    // ═══════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    describe('constructor', () => {
        test('initializes with isAutoMode = false', () => {
            expect(ui.isAutoMode).toBe(false);
        });

        test('initializes with null engine', () => {
            expect(ui.engine).toBeNull();
        });

        test('initializes with null dataLoader', () => {
            expect(ui.dataLoader).toBeNull();
        });

        test('creates UI elements', () => {
            expect(document.getElementById('autoModeSection')).not.toBeNull();
        });

        test('creates manual mode button', () => {
            expect(document.getElementById('manualModeBtn')).not.toBeNull();
        });

        test('creates auto mode button', () => {
            expect(document.getElementById('autoModeBtn')).not.toBeNull();
        });

        test('creates train button', () => {
            expect(document.getElementById('trainBtn')).not.toBeNull();
        });

        test('creates auto mode status div (hidden)', () => {
            const statusDiv = document.getElementById('autoModeStatus');
            expect(statusDiv).not.toBeNull();
            expect(statusDiv.style.display).toBe('none');
        });

        test('creates training status div', () => {
            expect(document.getElementById('trainingStatus')).not.toBeNull();
        });

        test('creates decision display div', () => {
            expect(document.getElementById('currentDecision')).not.toBeNull();
        });

        test('creates skip counter div', () => {
            expect(document.getElementById('skipCounter')).not.toBeNull();
        });

        test('creates training progress elements', () => {
            expect(document.getElementById('trainingProgress')).not.toBeNull();
            expect(document.getElementById('trainingProgressFill')).not.toBeNull();
            expect(document.getElementById('trainingProgressText')).not.toBeNull();
        });

        test('creates trainingStatusBar (hidden by default)', () => {
            const bar = document.getElementById('trainingStatusBar');
            expect(bar).not.toBeNull();
            expect(bar.style.display).toBe('none');
        });

        test('trainingStatus is inside trainingStatusBar, not autoModeStatus', () => {
            const bar = document.getElementById('trainingStatusBar');
            const status = document.getElementById('trainingStatus');
            expect(bar.contains(status)).toBe(true);
        });

        test('currentDecision is inside autoModeStatus', () => {
            const autoStatus = document.getElementById('autoModeStatus');
            const decision = document.getElementById('currentDecision');
            expect(autoStatus.contains(decision)).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  createUI
    // ═══════════════════════════════════════════════════════════

    describe('createUI', () => {
        test('inserts autoModeSection as first child of aiPanelContent', () => {
            const panelContent = document.getElementById('aiPanelContent');
            expect(panelContent.firstChild.id).toBe('autoModeSection');
        });

        test('handles missing aiPanelContent gracefully', () => {
            // Remove the element
            document.body.innerHTML = '<div></div>';
            // Should not throw
            const ui2 = new AIAutoModeUI();
            expect(ui2.isAutoMode).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  toggleMode
    // ═══════════════════════════════════════════════════════════

    describe('toggleMode', () => {
        test('does not switch to AUTO when engine not trained', () => {
            ui.toggleMode();
            expect(ui.isAutoMode).toBe(false);
        });

        test('shows visible warning when AUTO clicked without training', () => {
            jest.useFakeTimers();
            ui.engine = null;
            window.aiAutoEngine = null;
            ui.toggleMode();
            expect(ui.isAutoMode).toBe(false);

            // trainingStatusBar should be visible with warning message
            const bar = document.getElementById('trainingStatusBar');
            expect(bar.style.display).toBe('block');
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('Train first');

            // Clean up flash timer
            jest.runAllTimers();
            jest.useRealTimers();
        });

        test('does not switch to AUTO when engine is null', () => {
            jest.useFakeTimers();
            ui.engine = null;
            window.aiAutoEngine = null;
            ui.toggleMode();
            expect(ui.isAutoMode).toBe(false);
            jest.runAllTimers();
            jest.useRealTimers();
        });

        test('switches to AUTO when engine is trained', () => {
            const mockEngine = {
                isTrained: true,
                enable: jest.fn(),
                disable: jest.fn()
            };
            ui.engine = mockEngine;

            ui.toggleMode();
            expect(ui.isAutoMode).toBe(true);
            expect(mockEngine.enable).toHaveBeenCalled();
        });

        test('switches back to MANUAL from AUTO', () => {
            const mockEngine = {
                isTrained: true,
                enable: jest.fn(),
                disable: jest.fn()
            };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            expect(ui.isAutoMode).toBe(true);

            ui.toggleMode(); // → MANUAL
            expect(ui.isAutoMode).toBe(false);
            expect(mockEngine.disable).toHaveBeenCalled();
        });

        test('shows autoModeStatus when in AUTO mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            const statusDiv = document.getElementById('autoModeStatus');
            expect(statusDiv.style.display).toBe('block');
        });

        test('hides autoModeStatus when in MANUAL mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            ui.toggleMode(); // → MANUAL
            const statusDiv = document.getElementById('autoModeStatus');
            expect(statusDiv.style.display).toBe('none');
        });

        test('updates orchestrator when switching to AUTO', () => {
            const mockOrchestrator = { setAutoMode: jest.fn() };
            window.autoUpdateOrchestrator = mockOrchestrator;
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            expect(mockOrchestrator.setAutoMode).toHaveBeenCalledWith(true);
        });

        test('updates orchestrator when switching to MANUAL', () => {
            const mockOrchestrator = { setAutoMode: jest.fn() };
            window.autoUpdateOrchestrator = mockOrchestrator;
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            ui.toggleMode(); // → MANUAL
            expect(mockOrchestrator.setAutoMode).toHaveBeenCalledWith(false);
        });

        test('hides table-selection-section elements in AUTO mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            const sections = document.querySelectorAll('.table-selection-section');
            sections.forEach(s => {
                expect(s.style.display).toBe('none');
            });
        });

        test('shows table-selection-section elements in MANUAL mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            ui.toggleMode(); // → MANUAL
            const sections = document.querySelectorAll('.table-selection-section');
            sections.forEach(s => {
                expect(s.style.display).toBe('block');
            });
        });

        test('uses window.aiAutoEngine as fallback when engine is null', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            window.aiAutoEngine = mockEngine;
            ui.engine = null;

            ui.toggleMode(); // → AUTO
            expect(ui.isAutoMode).toBe(true);
            expect(mockEngine.enable).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _updateModeButtons
    // ═══════════════════════════════════════════════════════════

    describe('_updateModeButtons', () => {
        // jsdom may return colors as rgb() — use helper
        function colorMatches(actual, expected) {
            return actual === expected || actual.includes(expected.replace('#', ''));
        }

        test('manual button highlighted when in manual mode', () => {
            ui.currentMode = 'manual';
            ui._updateModeButtons();

            const manualBtn = document.getElementById('manualModeBtn');
            // jsdom normalizes hex colors → check value was set
            expect(manualBtn.style.background).not.toBe('transparent');
            expect(manualBtn.style.color).not.toBe('');
        });

        test('auto button highlighted when in auto mode', () => {
            ui.currentMode = 'auto';
            ui._updateModeButtons();

            const autoBtn = document.getElementById('autoModeBtn');
            expect(autoBtn.style.background).not.toBe('transparent');
            expect(autoBtn.style.color).not.toBe('');
        });

        test('manual button dimmed when in auto mode', () => {
            ui.currentMode = 'auto';
            ui._updateModeButtons();

            const manualBtn = document.getElementById('manualModeBtn');
            expect(manualBtn.style.background).toBe('transparent');
        });

        test('auto button dimmed when in manual mode', () => {
            ui.currentMode = 'manual';
            ui._updateModeButtons();

            const autoBtn = document.getElementById('autoModeBtn');
            expect(autoBtn.style.background).toBe('transparent');
        });

        test('semi button highlighted when in semi mode', () => {
            ui.currentMode = 'semi';
            ui._updateModeButtons();

            const semiBtn = document.getElementById('semiAutoModeBtn');
            expect(semiBtn.style.background).not.toBe('transparent');
            expect(semiBtn.style.color).toBe('white');
        });

        test('semi button dimmed when in manual mode', () => {
            ui.currentMode = 'manual';
            ui._updateModeButtons();

            const semiBtn = document.getElementById('semiAutoModeBtn');
            expect(semiBtn.style.background).toBe('transparent');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  setupEventListeners
    // ═══════════════════════════════════════════════════════════

    describe('event listeners', () => {
        test('manual button click triggers toggleMode when in auto mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            expect(ui.isAutoMode).toBe(true);

            const manualBtn = document.getElementById('manualModeBtn');
            manualBtn.click();
            expect(ui.isAutoMode).toBe(false);
        });

        test('auto button click triggers toggleMode when in manual mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            expect(ui.isAutoMode).toBe(false);

            const autoBtn = document.getElementById('autoModeBtn');
            autoBtn.click();
            expect(ui.isAutoMode).toBe(true);
        });

        test('manual button does nothing when already in manual mode', () => {
            expect(ui.isAutoMode).toBe(false);

            const manualBtn = document.getElementById('manualModeBtn');
            manualBtn.click();
            expect(ui.isAutoMode).toBe(false);
        });

        test('auto button does nothing when already in auto mode', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            expect(ui.isAutoMode).toBe(true);

            const autoBtn = document.getElementById('autoModeBtn');
            autoBtn.click();
            expect(ui.isAutoMode).toBe(true);
        });

        test('train button click triggers startTraining', () => {
            const spy = jest.spyOn(ui, 'startTraining').mockResolvedValue(undefined);
            const trainBtn = document.getElementById('trainBtn');
            trainBtn.click();
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  startTraining
    // ═══════════════════════════════════════════════════════════

    describe('startTraining', () => {
        test('returns early when dataLoader and engine not available', async () => {
            ui.dataLoader = null;
            ui.engine = null;
            window.aiDataLoader = null;
            window.aiAutoEngine = null;

            await ui.startTraining();
            // Should not throw; just logs error
        });

        test('shows trainingStatusBar when training starts', async () => {
            ui.dataLoader = { loadMultiple: jest.fn() };
            ui.engine = { train: jest.fn() };
            window.aiAPI = null;

            const bar = document.getElementById('trainingStatusBar');
            expect(bar.style.display).toBe('none');

            await ui.startTraining();
            expect(bar.style.display).toBe('block');
        });

        test('shows "No data files" when IPC returns no files', async () => {
            ui.dataLoader = { loadMultiple: jest.fn() };
            ui.engine = { train: jest.fn() };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue({ files: [] })
            };

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('No data files');
        });

        test('shows "No data files" when no IPC available', async () => {
            ui.dataLoader = { loadMultiple: jest.fn() };
            ui.engine = { train: jest.fn() };
            window.aiAPI = null;

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('No data files');
        });

        test('trains successfully with IPC data', async () => {
            const mockFiles = [
                { filename: 'test.txt', content: '10\n5\n1' }
            ];

            ui.dataLoader = {
                loadMultiple: jest.fn().mockReturnValue({
                    sessions: [{ spins: [1, 5, 10], length: 3 }],
                    totalSpins: 3,
                    errors: []
                })
            };

            ui.engine = {
                train: jest.fn().mockReturnValue({
                    totalSpins: 3,
                    overallHitRate: 0.5
                }),
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
                })
            };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue({ files: mockFiles })
            };

            await ui.startTraining();

            expect(ui.dataLoader.loadMultiple).toHaveBeenCalledWith(mockFiles);
            expect(ui.engine.train).toHaveBeenCalled();
        });

        test('handles no valid sessions after parsing', async () => {
            ui.dataLoader = {
                loadMultiple: jest.fn().mockReturnValue({
                    sessions: [],
                    totalSpins: 0,
                    errors: ['bad file']
                })
            };
            ui.engine = { train: jest.fn() };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue({
                    files: [{ filename: 'bad.txt', content: 'abc' }]
                })
            };

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('No valid sessions');
        });

        test('handles training error gracefully', async () => {
            ui.dataLoader = {
                loadMultiple: jest.fn().mockReturnValue({
                    sessions: [{ spins: [1, 2, 3] }],
                    totalSpins: 3,
                    errors: []
                })
            };
            ui.engine = {
                train: jest.fn().mockImplementation(() => {
                    throw new Error('Training exploded');
                })
            };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue({
                    files: [{ filename: 'test.txt', content: '1\n2\n3' }]
                })
            };

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('Training error');
        });

        test('uses window.aiDataLoader and aiAutoEngine as fallbacks', async () => {
            const mockLoader = {
                loadMultiple: jest.fn().mockReturnValue({ sessions: [], totalSpins: 0, errors: [] })
            };
            const mockEngine = { train: jest.fn() };

            ui.dataLoader = null;
            ui.engine = null;
            window.aiDataLoader = mockLoader;
            window.aiAutoEngine = mockEngine;
            window.aiAPI = { loadHistoricalData: jest.fn().mockResolvedValue({ files: [{ filename: 'f.txt', content: '1\n2' }] }) };

            await ui.startTraining();
            expect(mockLoader.loadMultiple).toHaveBeenCalled();
        });

        test('converts sessions to plain number arrays for training', async () => {
            const mockFiles = [{ filename: 'test.txt', content: '10\n5\n1\n20\n15' }];
            let trainedData = null;

            ui.dataLoader = {
                loadMultiple: jest.fn().mockReturnValue({
                    sessions: [{ spins: [15, 20, 1, 5, 10], length: 5 }],
                    totalSpins: 5,
                    errors: []
                })
            };

            ui.engine = {
                train: jest.fn().mockImplementation((sessions) => {
                    trainedData = sessions;
                    return { totalSpins: 5, overallHitRate: 0.3 };
                }),
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
                })
            };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue({ files: mockFiles })
            };

            await ui.startTraining();
            expect(trainedData).toEqual([[15, 20, 1, 5, 10]]);
        });

        test('handles IPC returning error object', async () => {
            ui.dataLoader = { loadMultiple: jest.fn() };
            ui.engine = { train: jest.fn() };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue({ error: 'folder not found' })
            };

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('No data files');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  updateDecisionDisplay
    // ═══════════════════════════════════════════════════════════

    describe('updateDecisionDisplay', () => {
        test('displays BET decision with pair, filter, and confidence', () => {
            ui.updateDecisionDisplay({
                action: 'BET',
                selectedPair: 'prevPlus1',
                selectedFilter: 'zero_positive',
                confidence: 72
            });

            const decisionEl = document.getElementById('currentDecision');
            expect(decisionEl.textContent).toContain('prevPlus1');
            expect(decisionEl.textContent).toContain('zero_positive');
            expect(decisionEl.textContent).toContain('72');
            // Color is set (jsdom may normalize hex → rgb)
            expect(decisionEl.style.color).toBeTruthy();
        });

        test('displays SKIP decision with reason', () => {
            ui.updateDecisionDisplay({
                action: 'SKIP',
                reason: 'Low confidence 42%'
            });

            const decisionEl = document.getElementById('currentDecision');
            expect(decisionEl.textContent).toContain('SKIP');
            expect(decisionEl.textContent).toContain('Low confidence 42%');
            expect(decisionEl.style.color).toBeTruthy();
        });

        test('updates skip counter', () => {
            const mockEngine = {
                session: { consecutiveSkips: 3 },
                maxConsecutiveSkips: 5
            };
            ui.engine = mockEngine;

            ui.updateDecisionDisplay({ action: 'SKIP', reason: 'test' });
            const skipEl = document.getElementById('skipCounter');
            expect(skipEl.textContent).toContain('3/5');
        });

        test('handles missing engine for skip counter', () => {
            ui.engine = null;
            window.aiAutoEngine = null;

            ui.updateDecisionDisplay({ action: 'SKIP', reason: 'test' });
            const skipEl = document.getElementById('skipCounter');
            expect(skipEl.textContent).toContain('0/');
        });

        test('uses window.aiAutoEngine as fallback for skip counter', () => {
            ui.engine = null;
            window.aiAutoEngine = {
                session: { consecutiveSkips: 2 },
                maxConsecutiveSkips: 5
            };

            ui.updateDecisionDisplay({ action: 'SKIP', reason: 'test' });
            const skipEl = document.getElementById('skipCounter');
            expect(skipEl.textContent).toContain('2/5');
        });

        test('handles null decision fields', () => {
            ui.updateDecisionDisplay({
                action: 'BET',
                selectedPair: null,
                selectedFilter: null,
                confidence: 0
            });

            const decisionEl = document.getElementById('currentDecision');
            expect(decisionEl).not.toBeNull();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  updateTrainingProgress
    // ═══════════════════════════════════════════════════════════

    describe('updateTrainingProgress', () => {
        test('shows progress bar when percent > 0', () => {
            ui.updateTrainingProgress(50, 'Training...');
            const progressDiv = document.getElementById('trainingProgress');
            expect(progressDiv.style.display).toBe('block');
        });

        test('hides progress bar when percent is 0', () => {
            ui.updateTrainingProgress(0, 'Error');
            const progressDiv = document.getElementById('trainingProgress');
            expect(progressDiv.style.display).toBe('none');
        });

        test('sets progress fill width', () => {
            ui.updateTrainingProgress(75, 'Almost done...');
            const fill = document.getElementById('trainingProgressFill');
            expect(fill.style.width).toBe('75%');
        });

        test('sets progress text message', () => {
            ui.updateTrainingProgress(50, 'Training on 100 spins...');
            const text = document.getElementById('trainingProgressText');
            expect(text.textContent).toBe('Training on 100 spins...');
        });

        test('uses percent as text when no message provided', () => {
            ui.updateTrainingProgress(42);
            const text = document.getElementById('trainingProgressText');
            expect(text.textContent).toBe('42%');
        });

        test('updates training status element', () => {
            ui.updateTrainingProgress(100, 'Complete!');
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toBe('Complete!');
        });

        test('handles 100% progress', () => {
            ui.updateTrainingProgress(100, 'Done');
            const fill = document.getElementById('trainingProgressFill');
            expect(fill.style.width).toBe('100%');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  renderStatus
    // ═══════════════════════════════════════════════════════════

    describe('renderStatus', () => {
        // Reset TrainingState between tests so Fix-3 tests that set an
        // active mode do not leak into "Not trained" / "Trained" tests
        // that assume no active mode.
        beforeEach(() => {
            try { require('../../app/training-state').__internal.reset(); }
            catch (_) { /* module not loaded yet */ }
        });

        test('shows trained status with pair count', () => {
            const mockEngine = {
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: {
                        totalBets: 0,
                        wins: 0,
                        losses: 0,
                        sessionWinRate: 0
                    }
                })
            };
            ui.engine = mockEngine;

            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('Trained');
            expect(statusEl.textContent).toContain('6 pairs');
            expect(statusEl.style.color).toBeTruthy();
        });

        test('shows trainingStatusBar when engine is trained', () => {
            const mockEngine = {
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
                })
            };
            ui.engine = mockEngine;

            const bar = document.getElementById('trainingStatusBar');
            expect(bar.style.display).toBe('none');

            ui.renderStatus();
            expect(bar.style.display).toBe('block');
        });

        test('shows session stats when bets have been made', () => {
            const mockEngine = {
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: {
                        totalBets: 10,
                        wins: 6,
                        losses: 4,
                        sessionWinRate: 0.6
                    }
                })
            };
            ui.engine = mockEngine;

            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('6W');
            expect(statusEl.textContent).toContain('4L');
            expect(statusEl.textContent).toContain('60%');
        });

        test('shows untrained status when not trained', () => {
            const mockEngine = { isTrained: false };
            ui.engine = mockEngine;

            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('Not trained');
            expect(statusEl.style.color).toBeTruthy();
        });

        test('handles missing engine gracefully', () => {
            ui.engine = null;
            window.aiAutoEngine = null;
            // Should not throw
            ui.renderStatus();
        });

        test('Fix 3: trained line surfaces the active TRAIN mode (not just generic pair count)', () => {
            const TS = require('../../app/training-state');
            TS.__internal.reset();
            TS.setActiveMode('default');
            const mockEngine = {
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
                })
            };
            ui.engine = mockEngine;
            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            // Backwards-compatible substrings ("Trained", "6 pairs") preserved.
            expect(statusEl.textContent).toContain('Trained');
            expect(statusEl.textContent).toContain('6 pairs');
            // New: explicit active mode label.
            expect(statusEl.textContent).toContain('Default mode');
            TS.__internal.reset();
        });

        test('Fix 3: untrained engine + placeholder active mode shows "Active mode: …" (not the legacy generic line)', () => {
            const TS = require('../../app/training-state');
            TS.__internal.reset();
            TS.setActiveMode('ai-mode');
            const mockEngine = { isTrained: false };
            ui.engine = mockEngine;
            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('Active mode');
            expect(statusEl.textContent).toContain('AI-mode');
            expect(statusEl.textContent).toContain('placeholder');
            TS.__internal.reset();
        });

        test('uses window.aiAutoEngine as fallback', () => {
            ui.engine = null;
            window.aiAutoEngine = {
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: { totalBets: 0, wins: 0, losses: 0, sessionWinRate: 0 }
                })
            };

            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('Trained');
        });

        test('renderStatus with session but no wins', () => {
            const mockEngine = {
                isTrained: true,
                getState: jest.fn().mockReturnValue({
                    pairModelCount: 6,
                    sessionStats: {
                        totalBets: 5,
                        wins: 0,
                        losses: 5,
                        sessionWinRate: 0
                    }
                })
            };
            ui.engine = mockEngine;
            ui.renderStatus();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('0W');
            expect(statusEl.textContent).toContain('5L');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _showTrainingStatusBar
    // ═══════════════════════════════════════════════════════════

    describe('_showTrainingStatusBar', () => {
        test('shows the training status bar', () => {
            ui._showTrainingStatusBar(true);
            const bar = document.getElementById('trainingStatusBar');
            expect(bar.style.display).toBe('block');
        });

        test('hides the training status bar', () => {
            ui._showTrainingStatusBar(true);
            ui._showTrainingStatusBar(false);
            const bar = document.getElementById('trainingStatusBar');
            expect(bar.style.display).toBe('none');
        });

        test('handles missing trainingStatusBar element', () => {
            const bar = document.getElementById('trainingStatusBar');
            if (bar) bar.remove();
            // Should not throw
            ui._showTrainingStatusBar(true);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _flashTrainButton
    // ═══════════════════════════════════════════════════════════

    describe('_flashTrainButton', () => {
        test('flashes the TRAIN button 6 times', () => {
            jest.useFakeTimers();

            ui._flashTrainButton();
            const trainBtn = document.getElementById('trainBtn');

            // After first interval (200ms), background should change
            jest.advanceTimersByTime(200);
            expect(trainBtn.style.background).toBeTruthy();

            // After all 6 flashes (6 * 200ms = 1200ms), should settle
            jest.advanceTimersByTime(1000);
            expect(trainBtn.style.color).toBeTruthy();

            jest.useRealTimers();
        });

        test('handles missing trainBtn element', () => {
            const trainBtn = document.getElementById('trainBtn');
            if (trainBtn) trainBtn.remove();
            // Should not throw
            ui._flashTrainButton();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  togglePairSelection
    // ═══════════════════════════════════════════════════════════

    describe('togglePairSelection', () => {
        test('hides sections when showManual is false', () => {
            ui.togglePairSelection(false);
            const sections = document.querySelectorAll('.table-selection-section');
            sections.forEach(s => {
                expect(s.style.display).toBe('none');
            });
        });

        test('shows sections when showManual is true', () => {
            ui.togglePairSelection(false); // Hide first
            ui.togglePairSelection(true);
            const sections = document.querySelectorAll('.table-selection-section');
            sections.forEach(s => {
                expect(s.style.display).toBe('block');
            });
        });

        test('handles empty section list gracefully', () => {
            // Remove all sections temporarily
            const sections = document.querySelectorAll('.table-selection-section');
            sections.forEach(s => s.remove());

            // Should not throw
            ui.togglePairSelection(true);
            ui.togglePairSelection(false);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  EDGE CASES & MISSING DOM ELEMENTS
    // ═══════════════════════════════════════════════════════════

    describe('edge cases', () => {
        test('multiple toggleMode calls maintain consistency', () => {
            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            ui.toggleMode(); // → AUTO
            ui.toggleMode(); // → MANUAL
            ui.toggleMode(); // → AUTO
            ui.toggleMode(); // → MANUAL

            expect(ui.isAutoMode).toBe(false);
        });

        test('updateTrainingProgress handles zero percent', () => {
            ui.updateTrainingProgress(0, 'Failed');
            const progressDiv = document.getElementById('trainingProgress');
            expect(progressDiv.style.display).toBe('none');
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toBe('Failed');
        });

        test('toggleMode to MANUAL with null engine does not throw', () => {
            // Manually set auto mode without going through toggleMode
            ui.isAutoMode = true;
            ui.engine = null;
            window.aiAutoEngine = null;

            // Should not throw even though engine is null
            ui.toggleMode(); // → MANUAL
            expect(ui.isAutoMode).toBe(false);
        });

        test('toggleMode when autoModeStatus element is missing', () => {
            // Remove the status div
            const statusDiv = document.getElementById('autoModeStatus');
            if (statusDiv) statusDiv.remove();

            const mockEngine = { isTrained: true, enable: jest.fn(), disable: jest.fn() };
            ui.engine = mockEngine;

            // Should not throw
            ui.toggleMode(); // → AUTO
            expect(ui.isAutoMode).toBe(true);
        });

        test('_updateModeButtons when buttons do not exist', () => {
            // Remove buttons
            const manualBtn = document.getElementById('manualModeBtn');
            const autoBtn = document.getElementById('autoModeBtn');
            if (manualBtn) manualBtn.remove();
            if (autoBtn) autoBtn.remove();

            // Should not throw
            ui._updateModeButtons();
        });

        test('setupEventListeners when buttons do not exist', () => {
            // Create UI with no panel content (no buttons created)
            document.body.innerHTML = '<div></div>';
            const ui2 = new AIAutoModeUI();
            // Listeners attached to null buttons should not throw
            expect(ui2.isAutoMode).toBe(false);
        });

        test('updateDecisionDisplay when DOM elements are missing', () => {
            // Remove decision and skip elements
            const decisionEl = document.getElementById('currentDecision');
            const skipEl = document.getElementById('skipCounter');
            if (decisionEl) decisionEl.remove();
            if (skipEl) skipEl.remove();

            // Should not throw
            ui.updateDecisionDisplay({
                action: 'BET',
                selectedPair: 'prev',
                selectedFilter: 'zero_positive',
                confidence: 80
            });
        });

        test('updateTrainingProgress when DOM elements are missing', () => {
            // Remove all progress elements
            const progressDiv = document.getElementById('trainingProgress');
            const fillDiv = document.getElementById('trainingProgressFill');
            const textDiv = document.getElementById('trainingProgressText');
            const statusEl = document.getElementById('trainingStatus');
            if (progressDiv) progressDiv.remove();
            if (fillDiv) fillDiv.remove();
            if (textDiv) textDiv.remove();
            if (statusEl) statusEl.remove();

            // Should not throw
            ui.updateTrainingProgress(50, 'Testing...');
        });

        test('updateTrainingProgress with empty string message does not update status', () => {
            ui.updateTrainingProgress(50, '');
            const statusEl = document.getElementById('trainingStatus');
            // Empty string is falsy, so statusEl text should NOT be updated
            expect(statusEl.textContent).not.toBe('');
        });

        test('renderStatus when trainingStatus element is missing', () => {
            const statusEl = document.getElementById('trainingStatus');
            if (statusEl) statusEl.remove();

            const mockEngine = { isTrained: true, getState: jest.fn() };
            ui.engine = mockEngine;

            // Should return early without throwing
            ui.renderStatus();
            expect(mockEngine.getState).not.toHaveBeenCalled();
        });

        test('startTraining when IPC loadHistoricalData returns null', async () => {
            ui.dataLoader = { loadMultiple: jest.fn() };
            ui.engine = { train: jest.fn() };

            window.aiAPI = {
                loadHistoricalData: jest.fn().mockResolvedValue(null)
            };

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('No data files');
        });

        test('startTraining when aiAPI exists but loadHistoricalData is not a function', async () => {
            ui.dataLoader = { loadMultiple: jest.fn() };
            ui.engine = { train: jest.fn() };

            window.aiAPI = { someOtherMethod: true };

            await ui.startTraining();
            const statusEl = document.getElementById('trainingStatus');
            expect(statusEl.textContent).toContain('No data files');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  MODULE-LEVEL CODE
    // ═══════════════════════════════════════════════════════════

    describe('module-level initialization', () => {
        test('DOMContentLoaded + setTimeout creates window.aiAutoModeUI', () => {
            jest.useFakeTimers();

            // Reset DOM with aiPanelContent present
            setupAutoModeDOM();
            window.aiAutoModeUI = null;
            window.aiAutoEngine = { some: 'engine' };
            window.aiDataLoader = { some: 'loader' };

            // Dispatch DOMContentLoaded event
            const event = new Event('DOMContentLoaded');
            document.dispatchEvent(event);

            // The setTimeout is 500ms — advance timers
            jest.advanceTimersByTime(500);

            // The handler creates a new AIAutoModeUI and assigns engine/dataLoader
            expect(window.aiAutoModeUI).not.toBeNull();
            expect(window.aiAutoModeUI).toBeInstanceOf(AIAutoModeUI);
            expect(window.aiAutoModeUI.engine).toBe(window.aiAutoEngine);
            expect(window.aiAutoModeUI.dataLoader).toBe(window.aiDataLoader);

            jest.useRealTimers();
        });
    });
});

// ═══════════════════════════════════════════════════════════
//  MODULE-LEVEL CODE WITH GLOBALS
//  (Separate describe to test module re-require with AIDataLoader/AIAutoEngine defined)
// ═══════════════════════════════════════════════════════════

describe('AIAutoModeUI module-level with globals defined', () => {
    test('uses real AIDataLoader and AIAutoEngine when globally available', () => {
        // Define mock global classes before requiring the module fresh
        jest.resetModules();

        setupAutoModeDOM();

        class MockDataLoader { constructor() { this._mock = true; } }
        class MockEngine { constructor() { this._mock = true; } }

        global.AIDataLoader = MockDataLoader;
        global.AIAutoEngine = MockEngine;

        // Re-require the module — module-level code will run again
        require('../../app/ai-auto-mode-ui');

        // The module-level code should use the real classes, not fallback
        expect(window.aiDataLoader).toBeInstanceOf(MockDataLoader);
        expect(window.aiAutoEngine).toBeInstanceOf(MockEngine);
        expect(window.aiDataLoader._mock).toBe(true);
        expect(window.aiAutoEngine._mock).toBe(true);

        // Clean up globals
        delete global.AIDataLoader;
        delete global.AIAutoEngine;
    });
});
