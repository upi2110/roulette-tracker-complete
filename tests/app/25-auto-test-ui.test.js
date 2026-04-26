/**
 * Test Suite 25: Auto Test UI — 100% Coverage
 *
 * Tests the AutoTestUI class: panel creation, file loading, manual input,
 * test running, progress tracking, tab switching, and rendering
 * (overview, strategy tabs, session detail).
 *
 * Uses mock engine, runner, and data loader to isolate UI logic.
 */

const { setupDOM } = require('../test-setup');
const { AutoTestUI } = require('../../app/auto-test-ui');

// ── Helpers ──

/**
 * Create a mock trained engine with minimal API surface.
 */
function createMockEngine() {
    return {
        isTrained: true,
        pairModels: { prev: {}, prev_plus_1: {} },
        confidenceThreshold: 65,
        maxConsecutiveSkips: 5,
        session: { consecutiveSkips: 0 },
        resetSession: jest.fn(),
        recordResult: jest.fn(),
        recordSkip: jest.fn(),
        _getFlashingPairsFromHistory: jest.fn().mockReturnValue(new Map()),
        _computeProjectionForPair: jest.fn().mockReturnValue(null),
        _scorePair: jest.fn().mockReturnValue(50),
        _selectBestFilter: jest.fn().mockReturnValue({ filterKey: 'both_both', score: 50, filteredNumbers: [1, 2, 3] }),
        _computeConfidence: jest.fn().mockReturnValue(70)
    };
}

/**
 * Create a mock FullTestResult for rendering tests.
 */
function createMockResult() {
    const makeSummary = (wins, busts, incomplete, winRate, avgProfit, extras = {}) => ({
        totalSessions: wins + busts + incomplete,
        wins,
        busts,
        incomplete,
        winRate,
        avgSpinsToWin: 25,
        avgSpinsToBust: 40,
        avgProfit,
        maxDrawdown: 500,
        // Dollar totals added for the report-summary feature. Defaults
        // yield a sensible net (totalProfit = totalWon - totalLost) so
        // downstream render/report tests see consistent values.
        totalWon: extras.totalWon ?? 1500,
        totalLost: extras.totalLost ?? 900,
        totalProfit: extras.totalProfit ?? 600,
        bestSession: { startIdx: 0, finalProfit: 100 },
        worstSession: { startIdx: 10, finalProfit: -4000 }
    });

    const makeSession = (startIdx, outcome, finalProfit, strategy) => ({
        startIdx,
        strategy,
        outcome,
        finalBankroll: 4000 + finalProfit,
        finalProfit,
        totalSpins: 30,
        totalBets: 20,
        totalSkips: 10,
        wins: outcome === 'WIN' ? 8 : 3,
        losses: outcome === 'WIN' ? 12 : 17,
        winRate: outcome === 'WIN' ? 0.4 : 0.15,
        maxDrawdown: outcome === 'WIN' ? 200 : 3000,
        peakProfit: outcome === 'WIN' ? 100 : 50,
        steps: [
            {
                spinIdx: startIdx + 3,
                spinNumber: 17,
                nextNumber: 5,
                action: 'BET',
                selectedPair: 'prev',
                selectedFilter: 'zero_positive',
                predictedNumbers: [5, 17, 22],
                confidence: 72,
                betPerNumber: 2,
                numbersCount: 3,
                hit: true,
                pnl: 66,
                bankroll: 4066,
                cumulativeProfit: 66
            },
            {
                spinIdx: startIdx + 4,
                spinNumber: 5,
                nextNumber: 22,
                action: 'SKIP',
                selectedPair: null,
                selectedFilter: null,
                predictedNumbers: [],
                confidence: 30,
                betPerNumber: 2,
                numbersCount: 0,
                hit: false,
                pnl: 0,
                bankroll: 4066,
                cumulativeProfit: 66
            },
            {
                spinIdx: startIdx + 5,
                spinNumber: 22,
                nextNumber: 33,
                action: 'BET',
                selectedPair: 'prevPlus1',
                selectedFilter: 'both_both',
                predictedNumbers: [10, 15],
                confidence: 68,
                betPerNumber: 2,
                numbersCount: 2,
                hit: false,
                pnl: -4,
                bankroll: 4062,
                cumulativeProfit: 62
            }
        ]
    });

    return {
        testFile: 'test-session.txt',
        totalTestSpins: 100,
        trainedOn: '2 pairs trained',
        timestamp: '2026-01-15T10:00:00Z',
        strategies: {
            1: {
                sessions: [
                    makeSession(0, 'WIN', 100, 1),
                    makeSession(1, 'BUST', -4000, 1),
                    makeSession(2, 'INCOMPLETE', -50, 1)
                ],
                summary: makeSummary(1, 1, 1, 0.5, -1316.67)
            },
            2: {
                sessions: [
                    makeSession(0, 'WIN', 100, 2),
                    makeSession(1, 'WIN', 100, 2),
                    makeSession(2, 'BUST', -4000, 2)
                ],
                summary: makeSummary(2, 1, 0, 0.667, -1266.67)
            },
            3: {
                sessions: [
                    makeSession(0, 'WIN', 100, 3),
                    makeSession(1, 'WIN', 100, 3),
                    makeSession(2, 'WIN', 100, 3)
                ],
                summary: makeSummary(3, 0, 0, 1.0, 100)
            }
        }
    };
}

/**
 * Create a mock AIDataLoader on window.
 */
function installMockDataLoader(spins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36]) {
    window.AIDataLoader = class {
        parseTextContent(text, filename) {
            return {
                spins,
                length: spins.length,
                filename
            };
        }
    };
}

/**
 * Install mock AutoTestRunner on global scope.
 */
function installMockRunner(result) {
    // Reset the capture-store so each test sees a fresh value.
    global.__lastRunnerOptions = null;
    global.AutoTestRunner = class {
        constructor(engine) {
            if (!engine) throw new Error('Engine required');
            if (!engine.isTrained) throw new Error('Engine not trained');
        }
        async runAll(testSpins, options, progressCb) {
            // Capture for method-pass-through assertions.
            global.__lastRunnerOptions = options;
            if (progressCb) {
                progressCb(50, 'Running...');
                progressCb(100, 'Done');
            }
            return result || createMockResult();
        }
    };
}

/**
 * Install mock AutoTestReport on global scope.
 */
function installMockReport() {
    global.AutoTestReport = class {
        constructor(exceljs) {
            this.exceljs = exceljs;
        }
        generate(result) { return { sheets: 5 }; }
        async saveToFile(wb) { return true; }
    };
}

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════

describe('Test Suite 25: AutoTestUI', () => {
    let ui;

    beforeEach(() => {
        setupDOM();
        // Clean globals
        delete window.aiAutoEngine;
        delete window.AIDataLoader;
        delete global.AutoTestRunner;
        delete global.AutoTestReport;
        delete global.ExcelJS;
    });

    afterEach(() => {
        delete window.aiAutoEngine;
        delete window.AIDataLoader;
        delete global.AutoTestRunner;
        delete global.AutoTestReport;
        delete global.ExcelJS;
    });

    // ─── A. Constructor + createUI ───
    describe('A. Constructor + createUI', () => {
        test('A1: constructor initializes state', () => {
            ui = new AutoTestUI();
            expect(ui.testSpins).toBeNull();
            expect(ui.testFileName).toBeNull();
            expect(ui.result).toBeNull();
            expect(ui.activeTab).toBe('overview');
            expect(ui.isRunning).toBe(false);
        });

        test('A2: createUI populates container with all elements', () => {
            ui = new AutoTestUI();
            expect(document.getElementById('autoTestHeader')).not.toBeNull();
            expect(document.getElementById('autoTestLoadBtn')).not.toBeNull();
            expect(document.getElementById('autoTestRunBtn')).not.toBeNull();
            expect(document.getElementById('autoTestExportBtn')).not.toBeNull();
            expect(document.getElementById('autoTestManualInput')).not.toBeNull();
            expect(document.getElementById('autoTestProgress')).not.toBeNull();
            expect(document.getElementById('autoTestTabs')).not.toBeNull();
            expect(document.getElementById('autoTestContent')).not.toBeNull();
        });

        test('A3: Run button starts disabled', () => {
            ui = new AutoTestUI();
            const runBtn = document.getElementById('autoTestRunBtn');
            expect(runBtn.disabled).toBe(true);
        });

        test('A4: Export button starts disabled', () => {
            ui = new AutoTestUI();
            const exportBtn = document.getElementById('autoTestExportBtn');
            expect(exportBtn.disabled).toBe(true);
        });

        test('A5: handles missing container gracefully', () => {
            document.getElementById('autoTestContainer').remove();
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            ui = new AutoTestUI();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('autoTestContainer not found'));
            consoleSpy.mockRestore();
        });

        test('A6: tabs section initially hidden', () => {
            ui = new AutoTestUI();
            const tabs = document.getElementById('autoTestTabs');
            expect(tabs.style.display).toBe('none');
        });

        test('A7: progress section initially hidden', () => {
            ui = new AutoTestUI();
            const progress = document.getElementById('autoTestProgress');
            expect(progress.style.display).toBe('none');
        });
    });

    // ─── B. loadTestFile ───
    describe('B. loadTestFile', () => {
        test('B1: calls aiAPI.openTestFile and parses data', async () => {
            installMockDataLoader();
            ui = new AutoTestUI();

            window.aiAPI = {
                openTestFile: jest.fn().mockResolvedValue({
                    filename: 'session1.txt',
                    content: '5\n17\n22\n33\n10\n8\n15\n2\n0\n36'
                })
            };

            await ui.loadTestFile();

            expect(window.aiAPI.openTestFile).toHaveBeenCalled();
            expect(ui.testSpins).toEqual([5, 17, 22, 33, 10, 8, 15, 2, 0, 36]);
            expect(ui.testFileName).toBe('session1.txt');

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('10 spins');
            expect(fileInfo.textContent).toContain('session1.txt');

            delete window.aiAPI;
        });

        test('B2: handles user cancel (null return)', async () => {
            ui = new AutoTestUI();

            window.aiAPI = {
                openTestFile: jest.fn().mockResolvedValue(null)
            };

            await ui.loadTestFile();
            expect(ui.testSpins).toBeNull();

            delete window.aiAPI;
        });

        test('B3: handles openTestFile error', async () => {
            ui = new AutoTestUI();

            window.aiAPI = {
                openTestFile: jest.fn().mockRejectedValue(new Error('dialog failed'))
            };

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            await ui.loadTestFile();

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('Error');
            expect(fileInfo.textContent).toContain('dialog failed');
            consoleSpy.mockRestore();

            delete window.aiAPI;
        });

        test('B4: shows message when aiAPI not available', async () => {
            ui = new AutoTestUI();
            // No window.aiAPI set

            await ui.loadTestFile();

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('not available');
        });

        test('B5: enables Run button after successful load', async () => {
            installMockDataLoader();
            ui = new AutoTestUI();

            window.aiAPI = {
                openTestFile: jest.fn().mockResolvedValue({
                    filename: 'test.txt',
                    content: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10'
                })
            };

            const runBtn = document.getElementById('autoTestRunBtn');
            expect(runBtn.disabled).toBe(true);

            await ui.loadTestFile();
            expect(runBtn.disabled).toBe(false);

            delete window.aiAPI;
        });
    });

    // ─── C. parseManualInput ───
    describe('C. parseManualInput', () => {
        test('C1: parses textarea content and stores spins', () => {
            installMockDataLoader();
            ui = new AutoTestUI();

            const textarea = document.getElementById('autoTestManualInput');
            textarea.value = '5\n17\n22\n33\n10\n8\n15\n2\n0\n36';

            ui.parseManualInput();

            expect(ui.testSpins).toEqual([5, 17, 22, 33, 10, 8, 15, 2, 0, 36]);
            expect(ui.testFileName).toBe('manual-input');
        });

        test('C2: shows info when no input', () => {
            ui = new AutoTestUI();

            const textarea = document.getElementById('autoTestManualInput');
            textarea.value = '';

            ui.parseManualInput();

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('No input');
        });

        test('C3: shows info when textarea is whitespace only', () => {
            ui = new AutoTestUI();

            const textarea = document.getElementById('autoTestManualInput');
            textarea.value = '   \n  \n  ';

            ui.parseManualInput();

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('No input');
        });

        test('C4: handles parse error gracefully', () => {
            // Install a loader that throws
            window.AIDataLoader = class {
                parseTextContent() { throw new Error('Invalid data'); }
            };
            ui = new AutoTestUI();

            const textarea = document.getElementById('autoTestManualInput');
            textarea.value = 'bad data xyz';

            ui.parseManualInput();

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('Parse error');
            expect(ui.testSpins).toBeNull();
        });

        test('C5: disables Run button on parse error', () => {
            window.AIDataLoader = class {
                parseTextContent() { throw new Error('bad'); }
            };
            ui = new AutoTestUI();

            const textarea = document.getElementById('autoTestManualInput');
            textarea.value = 'invalid';

            // Manually enable run button first
            document.getElementById('autoTestRunBtn').disabled = false;

            ui.parseManualInput();
            expect(document.getElementById('autoTestRunBtn').disabled).toBe(true);
        });
    });

    // ─── D. _parseAndStore ───
    describe('D. _parseAndStore', () => {
        test('D1: uses AIDataLoader from window', () => {
            installMockDataLoader([1, 2, 3, 4, 5]);
            ui = new AutoTestUI();

            ui._parseAndStore('1\n2\n3\n4\n5', 'test.txt');

            expect(ui.testSpins).toEqual([1, 2, 3, 4, 5]);
        });

        test('D2: shows error when no data loader available', () => {
            ui = new AutoTestUI();

            ui._parseAndStore('1\n2\n3', 'test.txt');

            const fileInfo = document.getElementById('autoTestFileInfo');
            expect(fileInfo.textContent).toContain('error');
        });
    });

    // ─── E. runTest ───
    describe('E. runTest', () => {
        test('E1: shows error when engine not available', async () => {
            ui = new AutoTestUI();
            ui.testSpins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

            await ui.runTest();

            const content = document.getElementById('autoTestContent');
            // Engine missing → message changed to make the missing-engine
            // case distinct from the untrained-engine case (Mode Parity Fix 1).
            expect(content.innerHTML).toContain('Engine not available');
        });

        test('E2: shows error when engine not trained — naming the required TRAIN mode', async () => {
            window.aiAutoEngine = { isTrained: false };
            ui = new AutoTestUI();
            ui.testSpins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            // Default method is 'auto-test' which requires Default mode TRAIN.

            await ui.runTest();

            const content = document.getElementById('autoTestContent');
            // Original substring preserved (legacy test contract).
            expect(content.innerHTML).toContain('Engine not trained');
            // New: error names the required TRAIN mode + active mode so
            // the user knows which dropdown to change.
            expect(content.innerHTML).toContain('Default mode');
            expect(content.innerHTML).toContain('Active training mode');
        });

        test('E2b: error reflects the active training mode when a placeholder TRAIN was clicked', async () => {
            const TS = require('../../app/training-state');
            TS.__internal.reset();
            TS.setActiveMode('ai-mode');   // user clicked AI-mode TRAIN
            window.aiAutoEngine = { isTrained: false };
            ui = new AutoTestUI();
            ui.testSpins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            // Default method is 'auto-test' (legacy). Active is AI-mode (placeholder).
            await ui.runTest();
            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('AI-mode');           // active
            expect(content.innerHTML).toContain('Default mode');      // expected
            TS.__internal.reset();
        });

        test('E3: shows error when no test data loaded', async () => {
            window.aiAutoEngine = createMockEngine();
            ui = new AutoTestUI();

            await ui.runTest();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Load test data');
        });

        test('E4: shows error when test data too short', async () => {
            window.aiAutoEngine = createMockEngine();
            ui = new AutoTestUI();
            ui.testSpins = [1, 2, 3]; // Less than 5

            await ui.runTest();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Load test data');
        });

        test('E5: runs successfully with valid data', async () => {
            window.aiAutoEngine = createMockEngine();
            const mockResult = createMockResult();
            installMockRunner(mockResult);

            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            ui.testFileName = 'test.txt';

            await ui.runTest();

            expect(ui.result).toBe(mockResult);
            expect(ui.isRunning).toBe(false);

            // Tabs should be visible
            const tabs = document.getElementById('autoTestTabs');
            expect(tabs.style.display).toBe('block');

            // Export button should be enabled
            const exportBtn = document.getElementById('autoTestExportBtn');
            expect(exportBtn.disabled).toBe(false);
        });

        test('E6: updates progress bar during run', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();

            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];

            await ui.runTest();

            const progressDiv = document.getElementById('autoTestProgress');
            expect(progressDiv.style.display).toBe('block');
        });

        test('E7: prevents double-run', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();

            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            ui.isRunning = true;

            await ui.runTest();

            // Should not have set result since isRunning was true
            expect(ui.result).toBeNull();
        });

        test('E8: restores button text after run', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();

            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];

            await ui.runTest();

            const runBtn = document.getElementById('autoTestRunBtn');
            expect(runBtn.textContent).toBe('▶ Run Test');
            expect(runBtn.disabled).toBe(false);
        });

        test('E9: handles runner error gracefully', async () => {
            window.aiAutoEngine = createMockEngine();
            global.AutoTestRunner = class {
                constructor() {}
                async runAll() { throw new Error('Simulation crashed'); }
            };

            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            await ui.runTest();
            consoleSpy.mockRestore();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Test failed');
            expect(ui.isRunning).toBe(false);
        });

        test('E10: shows error when runner class not available', async () => {
            window.aiAutoEngine = createMockEngine();
            // No AutoTestRunner installed

            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            await ui.runTest();
            consoleSpy.mockRestore();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('not available');
        });
    });

    // ─── F. updateProgress ───
    describe('F. updateProgress', () => {
        test('F1: shows progress section and updates bar', () => {
            ui = new AutoTestUI();

            ui.updateProgress(50, 'Halfway there');

            const progressDiv = document.getElementById('autoTestProgress');
            const bar = document.getElementById('autoTestProgressBar');
            const text = document.getElementById('autoTestProgressText');

            expect(progressDiv.style.display).toBe('block');
            expect(bar.style.width).toBe('50%');
            expect(text.textContent).toBe('Halfway there');
        });

        test('F2: shows percentage when no message', () => {
            ui = new AutoTestUI();

            ui.updateProgress(75);

            const text = document.getElementById('autoTestProgressText');
            expect(text.textContent).toBe('75%');
        });

        test('F3: handles 0% and 100%', () => {
            ui = new AutoTestUI();

            ui.updateProgress(0, 'Starting');
            expect(document.getElementById('autoTestProgressBar').style.width).toBe('0%');

            ui.updateProgress(100, 'Done');
            expect(document.getElementById('autoTestProgressBar').style.width).toBe('100%');
        });
    });

    // ─── G. switchTab ───
    describe('G. switchTab', () => {
        test('G1: switches active tab', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();

            ui.switchTab('strategy1');

            expect(ui.activeTab).toBe('strategy1');

            // Check tab button styling
            const tabs = document.querySelectorAll('.auto-test-tab');
            const strategy1Tab = Array.from(tabs).find(t => t.dataset.tab === 'strategy1');
            expect(strategy1Tab.classList.contains('active')).toBe(true);
        });

        test('G2: deactivates other tabs', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();

            ui.switchTab('strategy2');

            const tabs = document.querySelectorAll('.auto-test-tab');
            const overviewTab = Array.from(tabs).find(t => t.dataset.tab === 'overview');
            expect(overviewTab.classList.contains('active')).toBe(false);
        });

        test('G3: renders overview when switching to overview', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            const spy = jest.spyOn(ui, 'renderOverview');

            ui.switchTab('overview');

            expect(spy).toHaveBeenCalledWith(ui.result);
            spy.mockRestore();
        });

        test('G4: renders strategy tab when switching', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            const spy = jest.spyOn(ui, 'renderStrategyTab');

            ui.switchTab('strategy2');

            expect(spy).toHaveBeenCalledWith(2, ui.result.strategies[2]);
            spy.mockRestore();
        });

        test('G5: no-op when no result', () => {
            ui = new AutoTestUI();
            ui.result = null;

            // Should not throw
            ui.switchTab('strategy1');
            expect(ui.activeTab).toBe('strategy1');
        });

        test('G6: tab click event triggers switchTab', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            const spy = jest.spyOn(ui, 'switchTab');

            const tabs = document.querySelectorAll('.auto-test-tab');
            const strategy3Tab = Array.from(tabs).find(t => t.dataset.tab === 'strategy3');
            strategy3Tab.click();

            expect(spy).toHaveBeenCalledWith('strategy3');
            spy.mockRestore();
        });
    });

    // ─── H. renderOverview ───
    describe('H. renderOverview', () => {
        test('H1: renders strategy comparison table', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderOverview(result);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Aggressive');
            expect(content.innerHTML).toContain('Conservative');
            expect(content.innerHTML).toContain('Cautious');
        });

        test('H2: shows test file info', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderOverview(result);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('test-session.txt');
            expect(content.innerHTML).toContain('100 spins');
        });

        test('H3: highlights best strategy with star', () => {
            ui = new AutoTestUI();
            const result = createMockResult();
            // Strategy 3 has 100% win rate — should be best

            ui.renderOverview(result);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('⭐');
            expect(content.innerHTML).toContain('Cautious');
            expect(content.innerHTML).toContain('Best:');
        });

        test('H4: shows win rate percentages', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderOverview(result);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('50.0%'); // Strategy 1
            expect(content.innerHTML).toContain('100.0%'); // Strategy 3
        });

        test('H5: renders bar charts for each strategy', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderOverview(result);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Strategy 1');
            expect(content.innerHTML).toContain('Strategy 2');
            expect(content.innerHTML).toContain('Strategy 3');
        });

        test('H6: handles zero win rate (no best highlighted)', () => {
            ui = new AutoTestUI();
            const result = createMockResult();
            // Set all win rates to 0
            result.strategies[1].summary.winRate = 0;
            result.strategies[2].summary.winRate = 0;
            result.strategies[3].summary.winRate = 0;

            ui.renderOverview(result);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).not.toContain('⭐');
        });

        test('H7: overview includes the three dollar-total column headers', () => {
            // The new Total Win $, Total Loss $, Total P&L columns must
            // appear in the on-screen report's header row.
            ui = new AutoTestUI();
            const result = createMockResult();
            ui.renderOverview(result);
            const html = document.getElementById('autoTestContent').innerHTML;
            expect(html).toContain('Total Win $');
            expect(html).toContain('Total Loss $');
            expect(html).toContain('Total P&amp;L'); // & is HTML-escaped
        });

        test('H8: overview renders correct dollar-total values per strategy', () => {
            // Each strategy's row must show $<totalWon>, $<totalLost>, $<totalProfit>
            // using the mock summary values.
            ui = new AutoTestUI();
            const result = createMockResult();
            result.strategies[1].summary.totalWon = 3200;
            result.strategies[1].summary.totalLost = 1800;
            result.strategies[1].summary.totalProfit = 1400;
            ui.renderOverview(result);
            const html = document.getElementById('autoTestContent').innerHTML;
            // totalWon cell carries data-field="totalWon" for anchoring
            const winMatch = html.match(/data-field="totalWon"[^>]*>\$(\d[\d,]*)/);
            const lossMatch = html.match(/data-field="totalLost"[^>]*>\$(\d[\d,]*)/);
            const plMatch = html.match(/data-field="totalPL"[^>]*>\$(-?\d[\d,]*)/);
            expect(winMatch).not.toBeNull();
            expect(lossMatch).not.toBeNull();
            expect(plMatch).not.toBeNull();
            // Strategy 1 is the first row — first match corresponds to it.
            expect(winMatch[1]).toBe('3200');
            expect(lossMatch[1]).toBe('1800');
            expect(plMatch[1]).toBe('1400');
        });

        test('H9: overview still renders existing headers (no regression)', () => {
            ui = new AutoTestUI();
            const result = createMockResult();
            ui.renderOverview(result);
            const html = document.getElementById('autoTestContent').innerHTML;
            // Each of the existing header labels must still render.
            for (const h of ['Strategy', 'Sessions', 'Wins', 'Busts', 'Win%', 'Avg P&amp;L', 'Avg Spins', 'Max Spins']) {
                expect(html).toContain(h);
            }
        });

        test('H10: report works across multiple modes — renders all three strategy rows with totals', () => {
            // Each of the three strategies (1/2/3) must have its own
            // populated dollar-total cells in the UI.
            ui = new AutoTestUI();
            const result = createMockResult();
            result.strategies[1].summary.totalWon = 1000;
            result.strategies[1].summary.totalLost = 400;
            result.strategies[1].summary.totalProfit = 600;
            result.strategies[2].summary.totalWon = 2000;
            result.strategies[2].summary.totalLost = 1500;
            result.strategies[2].summary.totalProfit = 500;
            result.strategies[3].summary.totalWon = 3000;
            result.strategies[3].summary.totalLost = 500;
            result.strategies[3].summary.totalProfit = 2500;
            ui.renderOverview(result);
            const html = document.getElementById('autoTestContent').innerHTML;
            const wonMatches = [...html.matchAll(/data-field="totalWon"[^>]*>\$(\d[\d,]*)/g)].map(m => m[1]);
            const lostMatches = [...html.matchAll(/data-field="totalLost"[^>]*>\$(\d[\d,]*)/g)].map(m => m[1]);
            const plMatches = [...html.matchAll(/data-field="totalPL"[^>]*>\$(-?\d[\d,]*)/g)].map(m => m[1]);
            expect(wonMatches).toEqual(['1000', '2000', '3000']);
            expect(lostMatches).toEqual(['400', '1500', '500']);
            expect(plMatches).toEqual(['600', '500', '2500']);
        });
    });

    // ─── I. renderStrategyTab ───
    describe('I. renderStrategyTab', () => {
        test('I1: renders session rows', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderStrategyTab(1, result.strategies[1]);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('WIN');
            expect(content.innerHTML).toContain('BUST');
            expect(content.innerHTML).toContain('INCOMPLETE');
        });

        test('I2: shows summary stats', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderStrategyTab(1, result.strategies[1]);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Sessions: 3');
            expect(content.innerHTML).toContain('Wins: 1');
            expect(content.innerHTML).toContain('Busts: 1');
        });

        test('I3: handles empty strategy data', () => {
            ui = new AutoTestUI();

            ui.renderStrategyTab(1, { sessions: [], summary: {} });

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('No sessions');
        });

        test('I4: handles null data', () => {
            ui = new AutoTestUI();

            ui.renderStrategyTab(1, null);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('No sessions');
        });

        test('I5: session rows have click handlers', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            const spy = jest.spyOn(ui, 'showSessionDetail');

            ui.renderStrategyTab(1, ui.result.strategies[1]);

            // Click first row
            const rows = document.querySelectorAll('.session-row');
            expect(rows.length).toBe(3);
            rows[0].click();

            expect(spy).toHaveBeenCalledWith(0, 1); // startIdx=0, strategy=1
            spy.mockRestore();
        });

        test('I6: shows profit with color coding', () => {
            ui = new AutoTestUI();
            const result = createMockResult();

            ui.renderStrategyTab(1, result.strategies[1]);

            const content = document.getElementById('autoTestContent');
            // WIN session has positive profit (green)
            expect(content.innerHTML).toContain('#22c55e');
            // BUST session has negative profit (red)
            expect(content.innerHTML).toContain('#ef4444');
        });
    });

    // ─── J. showSessionDetail ───
    describe('J. showSessionDetail', () => {
        test('J1: finds and renders correct session', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            const spy = jest.spyOn(ui, 'renderSessionDetail');

            ui.showSessionDetail(0, 1);

            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({ startIdx: 0, strategy: 1 })
            );
            spy.mockRestore();
        });

        test('J2: handles no result', () => {
            ui = new AutoTestUI();
            ui.result = null;

            // Should not throw
            ui.showSessionDetail(0, 1);
        });

        test('J3: handles session not found', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            const spy = jest.spyOn(ui, 'renderSessionDetail');

            ui.showSessionDetail(999, 1); // Non-existent startIdx

            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    // ─── K. renderSessionDetail ───
    describe('K. renderSessionDetail', () => {
        test('K1: renders session outcome and stats', () => {
            ui = new AutoTestUI();
            const session = createMockResult().strategies[1].sessions[0]; // WIN

            ui.renderSessionDetail(session);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('WIN');
            expect(content.innerHTML).toContain('Start: 0');
            expect(content.innerHTML).toContain('Bets:');
        });

        test('K2: renders step-by-step table', () => {
            ui = new AutoTestUI();
            const session = createMockResult().strategies[1].sessions[0];

            ui.renderSessionDetail(session);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('BET');
            expect(content.innerHTML).toContain('SKIP');
            expect(content.innerHTML).toContain('prev');
            expect(content.innerHTML).toContain('zero_positive');
        });

        test('K3: renders P&L sparkline', () => {
            ui = new AutoTestUI();
            const session = createMockResult().strategies[1].sessions[0];

            ui.renderSessionDetail(session);

            const content = document.getElementById('autoTestContent');
            // Sparkline uses step-related titles
            expect(content.innerHTML).toContain('Step 0:');
        });

        test('K4: hit/miss display shows correct icons', () => {
            ui = new AutoTestUI();
            const session = createMockResult().strategies[1].sessions[0];

            ui.renderSessionDetail(session);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('✅'); // hit=true
            expect(content.innerHTML).toContain('❌'); // hit=false on BET
            expect(content.innerHTML).toContain('--');  // SKIP action
        });

        test('K5: back button navigates to active tab', () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            ui.activeTab = 'strategy1';
            const spy = jest.spyOn(ui, 'switchTab');

            const session = ui.result.strategies[1].sessions[0];
            ui.renderSessionDetail(session);

            const backBtn = document.getElementById('autoTestBackBtn');
            expect(backBtn).not.toBeNull();
            backBtn.click();

            expect(spy).toHaveBeenCalledWith('strategy1');
            spy.mockRestore();
        });

        test('K6: renders BUST session with red styling', () => {
            ui = new AutoTestUI();
            const session = createMockResult().strategies[1].sessions[1]; // BUST

            ui.renderSessionDetail(session);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('BUST');
            expect(content.innerHTML).toContain('#ef4444');
        });

        test('K7: handles session with no steps', () => {
            ui = new AutoTestUI();
            const session = {
                startIdx: 0,
                strategy: 1,
                outcome: 'INCOMPLETE',
                finalBankroll: 4000,
                finalProfit: 0,
                totalBets: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                maxDrawdown: 0,
                peakProfit: 0,
                steps: []
            };

            // Should not throw
            ui.renderSessionDetail(session);

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('INCOMPLETE');
        });
    });

    // ─── L. exportExcel ───
    describe('L. exportExcel', () => {
        test('L1: no-op when no result', async () => {
            ui = new AutoTestUI();
            ui.result = null;

            // Should not throw
            await ui.exportExcel();
        });

        test('L2: shows error when ExcelJS not available', async () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            // Mock _getExcelJS to return null (exceljs may be installed in test env)
            ui._getExcelJS = () => null;

            await ui.exportExcel();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('ExcelJS not available');
        });

        test('L3: shows error when report class not available', async () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();
            global.ExcelJS = { Workbook: class {} };

            await ui.exportExcel();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('AutoTestReport not available');
        });

        test('L4: generates and saves report successfully', async () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();

            global.ExcelJS = { Workbook: class {} };
            installMockReport();

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            await ui.exportExcel();

            // Should have logged success (check before restore)
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Excel report exported'));
            consoleSpy.mockRestore();
        });

        test('L5: handles export error', async () => {
            ui = new AutoTestUI();
            ui.result = createMockResult();

            global.ExcelJS = { Workbook: class {} };
            global.AutoTestReport = class {
                constructor() {}
                generate() { throw new Error('Format error'); }
            };

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            await ui.exportExcel();
            consoleSpy.mockRestore();

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Export failed');
        });
    });

    // ─── M. Event listeners ───
    describe('M. Event listeners', () => {
        test('M1: Load button triggers loadTestFile', () => {
            ui = new AutoTestUI();
            const spy = jest.spyOn(ui, 'loadTestFile').mockResolvedValue();

            document.getElementById('autoTestLoadBtn').click();

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        test('M2: Run button triggers runTest', () => {
            ui = new AutoTestUI();
            const spy = jest.spyOn(ui, 'runTest').mockResolvedValue();

            // Enable the button (it starts disabled)
            const runBtn = document.getElementById('autoTestRunBtn');
            runBtn.disabled = false;
            runBtn.click();

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        test('M3: Export button triggers exportExcel', () => {
            ui = new AutoTestUI();
            const spy = jest.spyOn(ui, 'exportExcel').mockResolvedValue();

            // Enable the button (it starts disabled)
            const exportBtn = document.getElementById('autoTestExportBtn');
            exportBtn.disabled = false;
            exportBtn.click();

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        test('M4: Parse button triggers parseManualInput', () => {
            ui = new AutoTestUI();
            const spy = jest.spyOn(ui, 'parseManualInput');

            document.getElementById('autoTestParseBtn').click();

            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    // ─── N. _showTabs, _showError, _getEngine, _getRunnerClass, _getExcelJS, _getReportClass ───
    describe('N. Helper methods', () => {
        test('N1: _showTabs makes tabs visible', () => {
            ui = new AutoTestUI();

            ui._showTabs();

            const tabs = document.getElementById('autoTestTabs');
            expect(tabs.style.display).toBe('block');
        });

        test('N2: _showError displays error message', () => {
            ui = new AutoTestUI();

            ui._showError('Something went wrong');

            const content = document.getElementById('autoTestContent');
            expect(content.innerHTML).toContain('Something went wrong');
            expect(content.innerHTML).toContain('#ef4444');
        });

        test('N3: _getEngine returns window.aiAutoEngine', () => {
            ui = new AutoTestUI();
            const engine = createMockEngine();
            window.aiAutoEngine = engine;

            expect(ui._getEngine()).toBe(engine);
        });

        test('N4: _getEngine returns null when not set', () => {
            ui = new AutoTestUI();
            delete window.aiAutoEngine;

            expect(ui._getEngine()).toBeNull();
        });

        test('N5: _getRunnerClass returns global AutoTestRunner', () => {
            ui = new AutoTestUI();
            global.AutoTestRunner = class TestRunner {};

            expect(ui._getRunnerClass()).toBe(global.AutoTestRunner);
        });

        test('N6: _getRunnerClass returns null when not available', () => {
            ui = new AutoTestUI();
            delete global.AutoTestRunner;

            expect(ui._getRunnerClass()).toBeNull();
        });

        test('N7: _getExcelJS returns global ExcelJS', () => {
            ui = new AutoTestUI();
            global.ExcelJS = { Workbook: class {} };

            expect(ui._getExcelJS()).toBe(global.ExcelJS);
        });

        test('N8: _getReportClass returns global AutoTestReport', () => {
            ui = new AutoTestUI();
            global.AutoTestReport = class TestReport {};

            expect(ui._getReportClass()).toBe(global.AutoTestReport);
        });

        test('N9: _getReportClass returns null when not available', () => {
            ui = new AutoTestUI();
            delete global.AutoTestReport;

            expect(ui._getReportClass()).toBeNull();
        });

        test('N10: _getDataLoader returns null when not available', () => {
            ui = new AutoTestUI();
            delete window.AIDataLoader;

            expect(ui._getDataLoader()).toBeNull();
        });
    });

    // ─── O. Auto Test method dropdown ───────────────────────────
    //
    // The header next to Load File carries a two-option dropdown
    // that lets the user pick which Auto Test method should run.
    // Exact option labels: 'T1-strategy' and 'test-strategy'.
    // Selecting the dropdown must flow through to runner.runAll()
    // via options.method without altering the existing test-strategy
    // behaviour.
    //
    describe('O. Method dropdown (T1-strategy / test-strategy)', () => {
        test('O1: constructor seeds testMethod to the default (auto-test — the original Auto Test mode)', () => {
            ui = new AutoTestUI();
            expect(ui.testMethod).toBe('auto-test');
        });

        test('O2: dropdown element is rendered in the header', () => {
            ui = new AutoTestUI();
            const header = document.getElementById('autoTestHeader');
            const sel = document.getElementById('autoTestMethodSelect');
            expect(sel).not.toBeNull();
            expect(sel.tagName).toBe('SELECT');
            // It must live inside the header block alongside Load File / Run / Export
            expect(header.contains(sel)).toBe(true);
        });

        test('O3: dropdown is placed right next to (after) the Load File button', () => {
            ui = new AutoTestUI();
            const loadBtn = document.getElementById('autoTestLoadBtn');
            const sel = document.getElementById('autoTestMethodSelect');
            // nextElementSibling is the dropdown — they sit side-by-side.
            expect(loadBtn.nextElementSibling).toBe(sel);
        });

        test('O4: dropdown has the required labels (auto-test + T1-strategy + test-strategy + AI-trained)', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            const opts = Array.from(sel.querySelectorAll('option'));
            expect(opts.length).toBe(4);
            const values = opts.map(o => o.value);
            const texts = opts.map(o => o.textContent);
            // Order doesn't matter for values/labels — all four must be present.
            expect(values).toEqual(expect.arrayContaining(['auto-test', 'T1-strategy', 'test-strategy', 'AI-trained']));
            expect(texts).toEqual(expect.arrayContaining(['auto-test', 'T1-strategy', 'test-strategy', 'AI-trained']));
        });

        test('O5: dropdown labels are EXACTLY the strings requested (no whitespace / underscore drift)', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            const texts = Array.from(sel.querySelectorAll('option')).map(o => o.textContent);
            // Canonical labels must be present exactly (case-sensitive).
            expect(texts).toContain('auto-test');
            expect(texts).toContain('T1-strategy');
            expect(texts).toContain('test-strategy');
            // Reject whitespace- or underscore-separated variants.
            for (const t of texts) {
                expect(t).not.toMatch(/^T1\s+strategy$|^T1_strategy$|^test\s+strategy$|^test_strategy$|^auto\s+test$|^auto_test$/);
            }
        });

        test('O6: initial DOM selection matches the default testMethod (auto-test)', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            expect(sel.value).toBe('auto-test');
        });

        test('O7: changing the dropdown updates this.testMethod', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            sel.value = 'T1-strategy';
            sel.dispatchEvent(new Event('change'));
            expect(ui.testMethod).toBe('T1-strategy');
            // And can be switched back.
            sel.value = 'test-strategy';
            sel.dispatchEvent(new Event('change'));
            expect(ui.testMethod).toBe('test-strategy');
        });

        test('O8: unknown dropdown values do not leak into testMethod', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            const before = ui.testMethod;
            // Manually inject a bad value that isn't in AUTO_TEST_METHODS.
            sel.value = 'xyz-not-a-method';
            sel.dispatchEvent(new Event('change'));
            expect(ui.testMethod).toBe(before);
        });

        test('O9: runTest passes the selected method through runner.runAll options (default: auto-test)', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();
            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            await ui.runTest();
            expect(global.__lastRunnerOptions).toBeTruthy();
            // Default is the original Auto Test mode.
            expect(global.__lastRunnerOptions.method).toBe('auto-test');
        });

        test('O10: runTest passes method=T1-strategy when dropdown selects T1-strategy', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();
            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            // Simulate user selecting T1-strategy in the dropdown.
            const sel = document.getElementById('autoTestMethodSelect');
            sel.value = 'T1-strategy';
            sel.dispatchEvent(new Event('change'));
            await ui.runTest();
            expect(global.__lastRunnerOptions.method).toBe('T1-strategy');
        });

        test('O11: pre-existing options (testFile, batchSize) still pass through unchanged', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();
            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            ui.testFileName = 'mysession.txt';
            await ui.runTest();
            const opts = global.__lastRunnerOptions;
            expect(opts.testFile).toBe('mysession.txt');
            expect(opts.batchSize).toBe(20);
        });

        test('O12: AUTO_TEST_METHODS constant is exported with the canonical labels', () => {
            // The canonical list of method strings is exposed so callers
            // (tests and future consumers) cannot drift out of sync.
            const mod = require('../../app/auto-test-ui');
            expect(mod.AUTO_TEST_METHODS).toEqual(['auto-test', 'T1-strategy', 'test-strategy', 'AI-trained']);
            expect(mod.AUTO_TEST_DEFAULT_METHOD).toBe('auto-test');
        });

        // ─── Original Auto Test mode coverage ───────────────────
        //
        // The original Auto Test mode must remain selectable and the
        // default choice. T1-strategy and test-strategy are additive
        // alternatives — they must not displace or mask the original.
        //
        test('O13: the original Auto Test option ("auto-test") exists and is the default selection', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            // Exists as one of the options.
            const values = Array.from(sel.querySelectorAll('option')).map(o => o.value);
            expect(values).toContain('auto-test');
            // And it is the currently selected one at boot.
            expect(sel.value).toBe('auto-test');
            expect(ui.testMethod).toBe('auto-test');
        });

        test('O14: selecting "auto-test" updates ui.testMethod back to the original mode', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            // First move away from the default…
            sel.value = 'T1-strategy';
            sel.dispatchEvent(new Event('change'));
            expect(ui.testMethod).toBe('T1-strategy');
            // …then return to the original Auto Test mode.
            sel.value = 'auto-test';
            sel.dispatchEvent(new Event('change'));
            expect(ui.testMethod).toBe('auto-test');
        });

        test('O15: runTest passes method="auto-test" when the original option is selected', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();
            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            const sel = document.getElementById('autoTestMethodSelect');
            // Explicitly pick auto-test (even though it is also the default).
            sel.value = 'auto-test';
            sel.dispatchEvent(new Event('change'));
            await ui.runTest();
            expect(global.__lastRunnerOptions.method).toBe('auto-test');
        });

        test('O16: all three modes are independently selectable and wired end-to-end', async () => {
            window.aiAutoEngine = createMockEngine();
            installMockRunner();
            ui = new AutoTestUI();
            ui.testSpins = [5, 17, 22, 33, 10, 8, 15, 2, 0, 36];
            const sel = document.getElementById('autoTestMethodSelect');

            const observed = [];
            for (const v of ['auto-test', 'T1-strategy', 'test-strategy']) {
                sel.value = v;
                sel.dispatchEvent(new Event('change'));
                await ui.runTest();
                observed.push(global.__lastRunnerOptions.method);
            }
            expect(observed).toEqual(['auto-test', 'T1-strategy', 'test-strategy']);
        });

        test('O17: the original auto-test option is the FIRST option in DOM order (primary choice)', () => {
            ui = new AutoTestUI();
            const sel = document.getElementById('autoTestMethodSelect');
            const firstOpt = sel.querySelector('option');
            expect(firstOpt.value).toBe('auto-test');
            expect(firstOpt.textContent).toBe('auto-test');
        });

        test('O18: training badge exists, defaults to "Training: —", and lives after the button group', () => {
            ui = new AutoTestUI();
            const badge = document.getElementById('autoTestTrainingBadge');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe('Training: —');
            // O3 invariant — Load File still followed by the method dropdown.
            const loadBtn = document.getElementById('autoTestLoadBtn');
            const sel = document.getElementById('autoTestMethodSelect');
            expect(loadBtn.nextElementSibling).toBe(sel);
        });

        test('O19: badge reflects TrainingState.getActiveMode() after a refresh', () => {
            const TS = require('../../app/training-state');
            TS.__internal.reset();
            ui = new AutoTestUI();
            // Simulate a successful default-mode training.
            TS.setActiveMode('default');
            ui._refreshTrainingBadge();
            const badge = document.getElementById('autoTestTrainingBadge');
            expect(badge.textContent).toBe('Training: Default mode');
        });

        test('O20: method/active mismatch surfaces a non-blocking warning style on the badge', () => {
            const TS = require('../../app/training-state');
            TS.__internal.reset();
            ui = new AutoTestUI();
            // Active = default, but user picks AI-trained → expected ai-mode.
            TS.setActiveMode('default');
            const sel = document.getElementById('autoTestMethodSelect');
            sel.value = 'AI-trained';
            sel.dispatchEvent(new Event('change'));
            const badge = document.getElementById('autoTestTrainingBadge');
            expect(badge.title.toLowerCase()).toContain('ai-mode');
            expect(badge.title.toLowerCase()).toContain('default');
            // Mismatch warning style applied.
            expect(badge.style.borderColor.toLowerCase()).toContain('239');
        });
    });
});
