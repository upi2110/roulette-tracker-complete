/**
 * Auto Test UI — In-app backtesting panel with tabbed results
 *
 * Provides file upload, progress tracking, and tabbed result display
 * (Overview + 3 Strategy tabs + Session Detail).
 * Uses CSS-only charts (no external library).
 */

// Auto Test method options exposed by the Load-File-area dropdown.
// Labels are user-facing and must match exactly.
//   - 'auto-test'     : the ORIGINAL Auto Test behaviour (default).
//   - 'T1-strategy'   : alternate T1 test method.
//   - 'test-strategy' : alternate generic test method.
// The runner currently does not branch on this value — its behaviour
// is identical for every option. This constant exists so the canonical
// list and default cannot drift out of sync between the UI, the
// runner's runAll default, and the tests.
const AUTO_TEST_METHODS = ['auto-test', 'T1-strategy', 'test-strategy'];
const AUTO_TEST_DEFAULT_METHOD = 'auto-test';

class AutoTestUI {
    constructor() {
        this.testSpins = null;       // number[] — loaded test data
        this.testFileName = null;    // string — loaded file name
        this.result = null;          // FullTestResult — last run result
        this.activeTab = 'overview'; // Current tab
        this.isRunning = false;
        // Selected Auto Test method from the header dropdown. Default is
        // 'test-strategy' so the runner's existing behaviour is preserved
        // until a future task wires 'T1-strategy' into the run path.
        this.testMethod = AUTO_TEST_DEFAULT_METHOD;

        this.createUI();
        this.setupEventListeners();

        console.log('✅ Auto Test UI initialized');
    }

    /**
     * Create the auto-test panel inside #autoTestContainer.
     */
    createUI() {
        const container = document.getElementById('autoTestContainer');
        if (!container) {
            console.warn('⚠️ autoTestContainer not found — auto test UI skipped');
            return;
        }

        container.innerHTML = `
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:10px;border:2px solid #0f3460;overflow:hidden;">
                <!-- Header -->
                <div id="autoTestHeader" style="background:linear-gradient(135deg,#e94560 0%,#0f3460 100%);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;">
                    <h3 style="margin:0;color:white;font-size:14px;font-weight:700;">🧪 AUTO TEST</h3>
                    <div style="display:flex;gap:8px;">
                        <button id="autoTestLoadBtn" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.3);border-radius:5px;cursor:pointer;background:rgba(255,255,255,0.15);color:white;">📂 Load File</button>
                        <select id="autoTestMethodSelect" title="Auto Test method" style="padding:6px 8px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.3);border-radius:5px;cursor:pointer;background:rgba(255,255,255,0.15);color:white;">
                            <option value="auto-test" selected>auto-test</option>
                            <option value="T1-strategy">T1-strategy</option>
                            <option value="test-strategy">test-strategy</option>
                        </select>
                        <button id="autoTestRunBtn" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid #22c55e;border-radius:5px;cursor:pointer;background:#22c55e;color:#000;" disabled>▶ Run Test</button>
                        <button id="autoTestExportBtn" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid #3b82f6;border-radius:5px;cursor:pointer;background:#3b82f6;color:white;" disabled>📊 Export Excel</button>
                        <button id="autoTestSubmitBtn" title="Send the completed Auto Test result to the Result-testing tab for manual verification" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid #6366f1;border-radius:5px;cursor:pointer;background:#6366f1;color:white;" disabled>🧾 Submit-to test</button>
                    </div>
                </div>

                <!-- File info + manual input -->
                <div style="padding:8px 16px;border-bottom:1px solid #0f3460;">
                    <div id="autoTestFileInfo" style="font-size:11px;color:#94a3b8;margin-bottom:4px;">No test data loaded</div>
                    <details style="color:#94a3b8;font-size:10px;">
                        <summary style="cursor:pointer;">Or paste numbers manually</summary>
                        <textarea id="autoTestManualInput" placeholder="Paste spin numbers (one per line, oldest first)" style="width:100%;height:60px;margin-top:4px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;font-size:10px;padding:4px;resize:vertical;"></textarea>
                        <button id="autoTestParseBtn" style="margin-top:4px;padding:4px 10px;font-size:10px;border:1px solid #64748b;border-radius:3px;cursor:pointer;background:#334155;color:#e2e8f0;">Parse Input</button>
                    </details>
                </div>

                <!-- Progress -->
                <div id="autoTestProgress" style="display:none;padding:8px 16px;">
                    <div style="background:#334155;border-radius:4px;height:8px;overflow:hidden;">
                        <div id="autoTestProgressBar" style="background:linear-gradient(90deg,#22c55e,#3b82f6);height:100%;width:0%;transition:width 0.3s;"></div>
                    </div>
                    <div id="autoTestProgressText" style="font-size:10px;color:#94a3b8;text-align:center;margin-top:2px;">0%</div>
                </div>

                <!-- Tabs -->
                <div id="autoTestTabs" style="display:none;padding:0 16px;border-bottom:1px solid #0f3460;">
                    <div style="display:flex;gap:0;">
                        <button class="auto-test-tab active" data-tab="overview" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid #3b82f6;cursor:pointer;background:transparent;color:#3b82f6;">Overview</button>
                        <button class="auto-test-tab" data-tab="strategy1" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 1</button>
                        <button class="auto-test-tab" data-tab="strategy2" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 2</button>
                        <button class="auto-test-tab" data-tab="strategy3" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 3</button>
                    </div>
                </div>

                <!-- Content area -->
                <div id="autoTestContent" style="padding:16px;min-height:100px;color:#e2e8f0;font-size:12px;">
                    <div style="text-align:center;color:#64748b;padding:20px;">Load test data and click Run to start backtesting</div>
                </div>
            </div>
        `;
    }

    /**
     * Set up button and tab event listeners.
     */
    setupEventListeners() {
        const loadBtn = document.getElementById('autoTestLoadBtn');
        const runBtn = document.getElementById('autoTestRunBtn');
        const exportBtn = document.getElementById('autoTestExportBtn');
        const submitBtn = document.getElementById('autoTestSubmitBtn');
        const parseBtn = document.getElementById('autoTestParseBtn');
        const methodSel = document.getElementById('autoTestMethodSelect');

        if (loadBtn) loadBtn.addEventListener('click', () => this.loadTestFile());
        if (runBtn) runBtn.addEventListener('click', () => this.runTest());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportExcel());
        if (submitBtn) submitBtn.addEventListener('click', () => this.submitToResultTesting());
        if (parseBtn) parseBtn.addEventListener('click', () => this.parseManualInput());
        if (methodSel) {
            // Initialise the dropdown's visible value from the UI state so
            // the DOM and this.testMethod are in sync on first paint.
            methodSel.value = this.testMethod;
            methodSel.addEventListener('change', () => {
                const v = methodSel.value;
                // Only accept known method strings — anything else is
                // silently ignored so we cannot leak junk into the run path.
                if (AUTO_TEST_METHODS.includes(v)) this.testMethod = v;
            });
        }

        // Tab click handlers
        const tabContainer = document.getElementById('autoTestTabs');
        if (tabContainer) {
            tabContainer.addEventListener('click', (e) => {
                const tabBtn = e.target.closest('.auto-test-tab');
                if (tabBtn && tabBtn.dataset.tab) {
                    this.switchTab(tabBtn.dataset.tab);
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DATA LOADING
    // ═══════════════════════════════════════════════════════════

    /**
     * Load test data from file via Electron IPC.
     */
    async loadTestFile() {
        const fileInfo = document.getElementById('autoTestFileInfo');

        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.openTestFile === 'function') {
            try {
                const fileData = await window.aiAPI.openTestFile();
                if (!fileData) {
                    // User cancelled
                    return;
                }
                this._parseAndStore(fileData.content, fileData.filename);
            } catch (err) {
                if (fileInfo) fileInfo.textContent = `Error: ${err.message}`;
                console.error('❌ Failed to load test file:', err);
            }
        } else {
            if (fileInfo) fileInfo.textContent = 'File dialog not available — paste numbers manually';
        }
    }

    /**
     * Parse manual text input from textarea.
     */
    parseManualInput() {
        const textarea = document.getElementById('autoTestManualInput');
        if (!textarea || !textarea.value.trim()) {
            const fileInfo = document.getElementById('autoTestFileInfo');
            if (fileInfo) fileInfo.textContent = 'No input to parse';
            return;
        }
        this._parseAndStore(textarea.value, 'manual-input');
    }

    /**
     * Parse text content and store as test spins.
     */
    _parseAndStore(text, filename) {
        const fileInfo = document.getElementById('autoTestFileInfo');
        const runBtn = document.getElementById('autoTestRunBtn');

        try {
            // Use AIDataLoader if available, else inline parse
            const loader = (typeof window !== 'undefined' && window.AIDataLoader)
                ? new window.AIDataLoader()
                : this._getDataLoader();

            if (!loader) {
                throw new Error('Data loader not available');
            }

            const parsed = loader.parseTextContent(text, filename);
            this.testSpins = parsed.spins;
            this.testFileName = filename;

            if (fileInfo) fileInfo.textContent = `✅ Loaded ${parsed.length} spins from ${filename}`;
            if (runBtn) runBtn.disabled = false;

            console.log(`✅ Test data loaded: ${parsed.length} spins from ${filename}`);
        } catch (err) {
            if (fileInfo) fileInfo.textContent = `❌ Parse error: ${err.message}`;
            this.testSpins = null;
            if (runBtn) runBtn.disabled = true;
        }
    }

    /**
     * Get a data loader instance (for test/Node environments).
     */
    _getDataLoader() {
        if (typeof AIDataLoader !== 'undefined') return new AIDataLoader();
        if (typeof window !== 'undefined' && window.AIDataLoader) return new window.AIDataLoader();
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  RUNNING
    // ═══════════════════════════════════════════════════════════

    /**
     * Run the backtest.
     */
    async runTest() {
        const engine = this._getEngine();
        if (!engine || !engine.isTrained) {
            this._showError('Engine not trained. Click TRAIN first.');
            return;
        }
        if (!this.testSpins || this.testSpins.length < 5) {
            this._showError('Load test data first (need at least 5 spins).');
            return;
        }
        if (this.isRunning) return;

        this.isRunning = true;
        const runBtn = document.getElementById('autoTestRunBtn');
        const exportBtn = document.getElementById('autoTestExportBtn');
        const submitBtn = document.getElementById('autoTestSubmitBtn');
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ Running...'; }
        if (exportBtn) exportBtn.disabled = true;
        if (submitBtn) submitBtn.disabled = true;

        this.updateProgress(0, 'Starting...');

        try {
            const RunnerClass = this._getRunnerClass();
            if (!RunnerClass) throw new Error('AutoTestRunner not available');

            const runner = new RunnerClass(engine);
            // Carry the header-dropdown selection through to the runner so
            // future consumers can branch on the method. The runner echoes
            // it onto result.method. Current behaviour of 'test-strategy'
            // is unchanged — this is pass-through plumbing only.
            this.result = await runner.runAll(
                this.testSpins,
                {
                    testFile: this.testFileName || 'manual',
                    batchSize: 20,
                    method: this.testMethod
                },
                (pct, msg) => this.updateProgress(pct, msg)
            );

            this.updateProgress(100, 'Complete!');
            this._showTabs();
            this.renderOverview(this.result);

            // Attach the full spin array the user ran so downstream
            // consumers (Result-testing panel) can load it without
            // reaching back into AutoTestUI internals.
            if (this.result && Array.isArray(this.testSpins)) {
                this.result.testSpins = this.testSpins.slice();
            }

            if (exportBtn) exportBtn.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
            console.log('✅ Backtest complete:', this.result.testFile);
        } catch (err) {
            this._showError(`Test failed: ${err.message}`);
            console.error('❌ Backtest failed:', err);
        } finally {
            this.isRunning = false;
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run Test'; }
        }
    }

    _getEngine() {
        if (typeof window !== 'undefined' && window.aiAutoEngine) return window.aiAutoEngine;
        return null;
    }

    _getRunnerClass() {
        if (typeof AutoTestRunner !== 'undefined') return AutoTestRunner;
        if (typeof window !== 'undefined' && window.AutoTestRunner) return window.AutoTestRunner;
        return null;
    }

    /**
     * Hand the last completed Auto Test result over to the
     * Result-testing panel. No-op when no run has completed or the
     * panel isn't initialised yet. Returns true/false so tests can
     * assert the hand-off without mocking window plumbing.
     */
    submitToResultTesting() {
        if (!this.result) return false;
        const panel = (typeof window !== 'undefined') ? window.resultTestingPanel : null;
        if (!panel || typeof panel.submit !== 'function') return false;
        const ok = panel.submit(this.result);
        return ok !== false;
    }

    // ═══════════════════════════════════════════════════════════
    //  EXCEL EXPORT
    // ═══════════════════════════════════════════════════════════

    async exportExcel() {
        if (!this.result) return;

        try {
            const ExcelJSModule = this._getExcelJS();
            if (!ExcelJSModule) {
                this._showError('ExcelJS not available');
                return;
            }

            const ReportClass = this._getReportClass();
            if (!ReportClass) {
                this._showError('AutoTestReport not available');
                return;
            }

            const reportGen = new ReportClass(ExcelJSModule);
            const workbook = reportGen.generate(this.result);
            await reportGen.saveToFile(workbook);

            console.log('✅ Excel report exported');
        } catch (err) {
            this._showError(`Export failed: ${err.message}`);
            console.error('❌ Export failed:', err);
        }
    }

    _getExcelJS() {
        if (typeof ExcelJS !== 'undefined') return ExcelJS;
        if (typeof window !== 'undefined' && window.ExcelJS) return window.ExcelJS;
        if (typeof require !== 'undefined') {
            try { return require('exceljs'); } catch (e) { return null; }
        }
        return null;
    }

    _getReportClass() {
        if (typeof AutoTestReport !== 'undefined') return AutoTestReport;
        if (typeof window !== 'undefined' && window.AutoTestReport) return window.AutoTestReport;
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  PROGRESS & TABS
    // ═══════════════════════════════════════════════════════════

    updateProgress(percent, message) {
        const progressDiv = document.getElementById('autoTestProgress');
        const bar = document.getElementById('autoTestProgressBar');
        const text = document.getElementById('autoTestProgressText');

        if (progressDiv) progressDiv.style.display = 'block';
        if (bar) bar.style.width = `${percent}%`;
        if (text) text.textContent = message || `${percent}%`;
    }

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        const tabs = document.querySelectorAll('.auto-test-tab');
        tabs.forEach(tab => {
            const isActive = tab.dataset.tab === tabName;
            tab.style.borderBottomColor = isActive ? '#3b82f6' : 'transparent';
            tab.style.color = isActive ? '#3b82f6' : '#94a3b8';
            if (isActive) tab.classList.add('active');
            else tab.classList.remove('active');
        });

        // Render tab content
        if (!this.result) return;
        const content = document.getElementById('autoTestContent');
        if (!content) return;

        if (tabName === 'overview') {
            this.renderOverview(this.result);
        } else if (tabName.startsWith('strategy')) {
            const num = parseInt(tabName.replace('strategy', ''));
            this.renderStrategyTab(num, this.result.strategies[num]);
        }
    }

    _showTabs() {
        const tabDiv = document.getElementById('autoTestTabs');
        if (tabDiv) tabDiv.style.display = 'block';
    }

    _showError(msg) {
        const content = document.getElementById('autoTestContent');
        if (content) {
            content.innerHTML = `<div style="color:#ef4444;text-align:center;padding:16px;">❌ ${msg}</div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  RENDER: OVERVIEW
    // ═══════════════════════════════════════════════════════════

    renderOverview(result) {
        const content = document.getElementById('autoTestContent');
        if (!content) return;

        const strategyNames = { 1: '🟢 Aggressive', 2: '🔵 Conservative', 3: '🟣 Cautious' };
        const colors = { 1: '#28a745', 2: '#007bff', 3: '#6f42c1' };

        let bestStrategy = 1;
        let bestWinRate = 0;
        for (const num of [1, 2, 3]) {
            const wr = result.strategies[num].summary.winRate;
            if (wr > bestWinRate) { bestWinRate = wr; bestStrategy = num; }
        }

        let html = `
            <div style="margin-bottom:12px;font-size:11px;color:#94a3b8;">
                Test: ${result.testFile} | ${result.totalTestSpins} spins | ${result.timestamp}
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                    <tr style="background:#1e293b;">
                        <th style="padding:6px;text-align:left;border:1px solid #334155;">Strategy</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Sessions</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Wins</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Busts</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Win%</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Avg P&L</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Total Win $</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Total Loss $</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Total P&L</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Avg Spins</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;">Max Spins</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const num of [1, 2, 3]) {
            const s = result.strategies[num].summary;
            const isBest = num === bestStrategy && bestWinRate > 0;
            const rowBg = isBest ? 'rgba(34,197,94,0.1)' : 'transparent';
            // Dollar totals. Fall back to 0 defensively in case an older
            // session result object (cached in memory) predates the
            // totalWon/totalLost fields — the main runner always sets them.
            const totalWon = typeof s.totalWon === 'number' ? s.totalWon : 0;
            const totalLost = typeof s.totalLost === 'number' ? s.totalLost : 0;
            const totalPL = typeof s.totalProfit === 'number' ? s.totalProfit : (totalWon - totalLost);
            html += `
                <tr style="background:${rowBg};">
                    <td style="padding:6px;border:1px solid #334155;color:${colors[num]};font-weight:700;">${strategyNames[num]}${isBest ? ' ⭐' : ''}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;">${s.totalSessions}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#22c55e;">${s.wins}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#ef4444;">${s.busts}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;font-weight:700;">${(s.winRate * 100).toFixed(1)}%</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:${s.avgProfit >= 0 ? '#22c55e' : '#ef4444'};">$${s.avgProfit.toFixed(0)}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#22c55e;" data-field="totalWon">$${totalWon.toFixed(0)}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#ef4444;" data-field="totalLost">$${totalLost.toFixed(0)}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;font-weight:700;color:${totalPL >= 0 ? '#22c55e' : '#ef4444'};" data-field="totalPL">$${totalPL.toFixed(0)}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;">${s.avgSpinsToWin || '--'}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:${(s.maxSpinsToWin || 0) > 50 ? '#f59e0b' : '#94a3b8'};">${s.maxSpinsToWin || '--'}</td>
                </tr>`;
        }

        html += '</tbody></table>';

        // Bar charts
        html += '<div style="margin-top:16px;">';
        for (const num of [1, 2, 3]) {
            const s = result.strategies[num].summary;
            const total = s.totalSessions || 1;
            const winPct = (s.wins / total * 100).toFixed(0);
            const bustPct = (s.busts / total * 100).toFixed(0);
            const incPct = (s.incomplete / total * 100).toFixed(0);
            html += `
                <div style="margin-bottom:8px;">
                    <div style="font-size:10px;color:${colors[num]};margin-bottom:2px;">Strategy ${num}</div>
                    <div style="display:flex;height:16px;border-radius:3px;overflow:hidden;background:#1e293b;">
                        <div style="width:${winPct}%;background:#22c55e;" title="Win ${winPct}%"></div>
                        <div style="width:${bustPct}%;background:#ef4444;" title="Bust ${bustPct}%"></div>
                        <div style="width:${incPct}%;background:#64748b;" title="Incomplete ${incPct}%"></div>
                    </div>
                </div>`;
        }
        html += '</div>';

        if (bestWinRate > 0) {
            html += `<div style="margin-top:12px;text-align:center;font-size:12px;font-weight:700;color:#22c55e;">
                Best: ${strategyNames[bestStrategy]} with ${(bestWinRate * 100).toFixed(1)}% win rate
            </div>`;
        }

        content.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════════
    //  RENDER: STRATEGY TAB
    // ═══════════════════════════════════════════════════════════

    renderStrategyTab(strategyNum, data) {
        const content = document.getElementById('autoTestContent');
        if (!content) return;

        if (!data || data.sessions.length === 0) {
            content.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;">No sessions for this strategy</div>';
            return;
        }

        const s = data.summary;
        let html = `
            <div style="margin-bottom:12px;font-size:11px;color:#94a3b8;">
                Sessions: ${s.totalSessions} | Wins: ${s.wins} | Busts: ${s.busts} | Win Rate: ${(s.winRate * 100).toFixed(1)}%
            </div>
            <div style="max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:10px;">
                <thead>
                    <tr style="background:#1e293b;position:sticky;top:0;">
                        <th style="padding:4px;border:1px solid #334155;">#</th>
                        <th style="padding:4px;border:1px solid #334155;">Start</th>
                        <th style="padding:4px;border:1px solid #334155;">Outcome</th>
                        <th style="padding:4px;border:1px solid #334155;">Spins</th>
                        <th style="padding:4px;border:1px solid #334155;">Bets</th>
                        <th style="padding:4px;border:1px solid #334155;">Win%</th>
                        <th style="padding:4px;border:1px solid #334155;">Profit</th>
                        <th style="padding:4px;border:1px solid #334155;">Drawdown</th>
                    </tr>
                </thead>
                <tbody>`;

        data.sessions.forEach((session, idx) => {
            const outcomeColor = session.outcome === 'WIN' ? '#22c55e'
                : session.outcome === 'BUST' ? '#ef4444' : '#64748b';
            const profitColor = session.finalProfit >= 0 ? '#22c55e' : '#ef4444';

            html += `
                <tr class="session-row" data-start="${session.startIdx}" data-strategy="${strategyNum}" style="cursor:pointer;" title="Click for details">
                    <td style="padding:4px;text-align:center;border:1px solid #334155;">${idx + 1}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;">${session.startIdx}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;color:${outcomeColor};font-weight:700;">${session.outcome}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;">${session.totalSpins}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;">${session.totalBets}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;">${(session.winRate * 100).toFixed(0)}%</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;color:${profitColor};">$${session.finalProfit.toFixed(0)}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;">$${session.maxDrawdown.toFixed(0)}</td>
                </tr>`;
        });

        html += '</tbody></table></div>';
        content.innerHTML = html;

        // Add click handlers for session detail
        content.querySelectorAll('.session-row').forEach(row => {
            row.addEventListener('click', () => {
                const startIdx = parseInt(row.dataset.start);
                const strat = parseInt(row.dataset.strategy);
                this.showSessionDetail(startIdx, strat);
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  RENDER: SESSION DETAIL
    // ═══════════════════════════════════════════════════════════

    showSessionDetail(startIdx, strategyNum) {
        if (!this.result) return;
        const content = document.getElementById('autoTestContent');
        if (!content) return;

        const sessions = this.result.strategies[strategyNum].sessions;
        const session = sessions.find(s => s.startIdx === startIdx);
        if (!session) return;

        this.renderSessionDetail(session);
    }

    renderSessionDetail(session) {
        const content = document.getElementById('autoTestContent');
        if (!content) return;

        const outcomeColor = session.outcome === 'WIN' ? '#22c55e'
            : session.outcome === 'BUST' ? '#ef4444' : '#64748b';

        let html = `
            <div style="margin-bottom:12px;">
                <button id="autoTestBackBtn" style="padding:4px 10px;font-size:10px;border:1px solid #64748b;border-radius:3px;cursor:pointer;background:#334155;color:#e2e8f0;margin-bottom:8px;">← Back</button>
                <div style="display:flex;gap:16px;align-items:center;">
                    <span style="font-size:14px;font-weight:700;color:${outcomeColor};">${session.outcome}</span>
                    <span style="font-size:11px;color:#94a3b8;">Start: ${session.startIdx} | Strategy: ${session.strategy}</span>
                    <span style="font-size:11px;color:#94a3b8;">Bets: ${session.totalBets} | Wins: ${session.wins} | Losses: ${session.losses}</span>
                    <span style="font-size:11px;font-weight:700;color:${session.finalProfit >= 0 ? '#22c55e' : '#ef4444'};">P&L: $${session.finalProfit.toFixed(0)}</span>
                </div>
            </div>`;

        // Mini P&L sparkline
        if (session.steps.length > 0) {
            const maxBankroll = Math.max(...session.steps.map(s => s.bankroll));
            const minBankroll = Math.min(...session.steps.map(s => s.bankroll));
            const range = maxBankroll - minBankroll || 1;

            html += '<div style="display:flex;align-items:end;height:40px;gap:1px;margin-bottom:12px;background:#1e293b;border-radius:4px;padding:4px;">';
            const maxBars = Math.min(session.steps.length, 200);
            const step = Math.max(1, Math.floor(session.steps.length / maxBars));
            for (let i = 0; i < session.steps.length; i += step) {
                const s = session.steps[i];
                const height = ((s.bankroll - minBankroll) / range * 32) + 2;
                const color = s.bankroll >= 4000 ? '#22c55e' : '#ef4444';
                html += `<div style="width:2px;height:${height}px;background:${color};border-radius:1px;" title="Step ${i}: $${s.bankroll}"></div>`;
            }
            html += '</div>';
        }

        // Step-by-step table
        html += `
            <div style="max-height:300px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:9px;">
                <thead>
                    <tr style="background:#1e293b;position:sticky;top:0;">
                        <th style="padding:3px;border:1px solid #334155;">Step</th>
                        <th style="padding:3px;border:1px solid #334155;">Spin</th>
                        <th style="padding:3px;border:1px solid #334155;">Action</th>
                        <th style="padding:3px;border:1px solid #334155;">Pair</th>
                        <th style="padding:3px;border:1px solid #334155;">Filter</th>
                        <th style="padding:3px;border:1px solid #334155;">Nums</th>
                        <th style="padding:3px;border:1px solid #334155;">Conf</th>
                        <th style="padding:3px;border:1px solid #334155;">Hit</th>
                        <th style="padding:3px;border:1px solid #334155;">P&L</th>
                        <th style="padding:3px;border:1px solid #334155;">Bankroll</th>
                    </tr>
                </thead>
                <tbody>`;

        session.steps.forEach((s, idx) => {
            const hitDisplay = s.action === 'BET' ? (s.hit ? '✅' : '❌') : '--';
            const pnlColor = s.pnl > 0 ? '#22c55e' : s.pnl < 0 ? '#ef4444' : '#64748b';
            html += `
                <tr>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${idx + 1}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${s.spinNumber}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;font-weight:700;">${s.action}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${s.selectedPair || '--'}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${s.selectedFilter || '--'}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${s.numbersCount}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${s.confidence}%</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">${hitDisplay}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;color:${pnlColor};">${s.pnl !== 0 ? '$' + s.pnl : '--'}</td>
                    <td style="padding:3px;text-align:center;border:1px solid #334155;">$${s.bankroll.toLocaleString()}</td>
                </tr>`;
        });

        html += '</tbody></table></div>';
        content.innerHTML = html;

        // Back button handler
        const backBtn = document.getElementById('autoTestBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.switchTab(this.activeTab);
            });
        }
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutoTestUI, AUTO_TEST_METHODS, AUTO_TEST_DEFAULT_METHOD };
}
if (typeof window !== 'undefined') {
    // Create instance after DOM loaded
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.autoTestUI = new AutoTestUI();
            console.log('✅ Auto Test UI active');
        }, 600);
    });
}

console.log('✅ Auto Test UI script loaded');
