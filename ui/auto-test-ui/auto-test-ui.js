/**
 * Auto Test UI — In-app backtesting panel with tabbed results
 *
 * Provides file upload, progress tracking, and tabbed result display
 * (Overview + 3 Strategy tabs + Session Detail).
 * Uses CSS-only charts (no external library).
 */

// Auto Test method options exposed by the Load-File-area dropdown.
// Labels are user-facing and must match exactly.
//   - 'auto-test'   : the ORIGINAL Auto Test behaviour (default).
//   - 'T1-strategy' : alternate T1 test method.
//   - 'test'        : Strategy-Lab sandbox where experimental strategies
//                     are plugged in for evaluation before promotion.
//                     Currently shares the default _simulateDecision
//                     pipeline.
// The runner currently does not branch on 'auto-test' vs 'test' — they
// share behaviour today. This constant exists so the canonical list and
// default cannot drift out of sync between the UI, the runner's runAll
// default, and the tests.
const AUTO_TEST_METHODS = ['auto-test', 'T1-strategy', 'test', 'AI-trained', 'manual', 'manual-test'];
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
                <div id="autoTestHeader" style="background:linear-gradient(135deg,#e94560 0%,#0f3460 100%);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <h3 style="margin:0;color:white;font-size:14px;font-weight:700;">🧪 AUTO TEST</h3>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button id="autoTestLoadBtn" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.3);border-radius:5px;cursor:pointer;background:rgba(255,255,255,0.15);color:white;">📂 Load File</button>
                        <select id="autoTestDataFolderSelect" title="Select a file from app/data/ — populates testSpins instantly. Same effect as Load File, but no native dialog." style="padding:6px 8px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.3);border-radius:5px;cursor:pointer;background:rgba(255,255,255,0.15);color:white;max-width:180px;">
                            <option value="">— data/ folder —</option>
                        </select>
                        <select id="autoTestMethodSelect" title="Auto Test method" style="padding:6px 8px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,0.3);border-radius:5px;cursor:pointer;background:rgba(255,255,255,0.15);color:white;">
                            <option value="auto-test" selected>auto-test</option>
                            <option value="T1-strategy">T1-strategy</option>
                            <option value="test">test (strategy lab)</option>
                            <option value="3t-selection">3T-Selection</option>
                            <option value="analytics">📊 Analytics (T2×T3)</option>
                            <option value="AI-trained">AI-trained</option>
                            <option value="manual">manual</option>
                            <option value="manual-test">manual-test (file + manual selections)</option>
                        </select>
                        <button id="autoTestRunBtn" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid #22c55e;border-radius:5px;cursor:pointer;background:#22c55e;color:#000;" disabled>▶ Run Test</button>
                        <button id="autoTestExportBtn" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid #3b82f6;border-radius:5px;cursor:pointer;background:#3b82f6;color:white;" disabled>📊 Export Excel</button>
                        <button id="autoTestSubmitBtn" title="Send the completed Auto Test result to the Result-testing tab for manual verification" style="padding:6px 12px;font-size:11px;font-weight:700;border:1px solid #6366f1;border-radius:5px;cursor:pointer;background:#6366f1;color:white;" disabled>🧾 Submit-to test</button>
                        <span id="autoTestTrainingBadge" title="Active trained mode (read from TrainingState)" style="margin-left:8px;padding:6px 8px;font-size:10px;font-weight:700;border:1px solid rgba(255,255,255,0.3);border-radius:5px;background:rgba(255,255,255,0.08);color:#cbd5e1;">Training: —</span>
                    </div>
                </div>

                <!-- Per-method parameters area. Visibility / contents are
                     swapped by _renderMethodParams() based on the method
                     dropdown. Methods that do not declare params keep
                     this row hidden so the original UI is untouched and
                     the runner falls back to its built-in defaults. -->
                <div id="autoTestMethodParams" style="display:none;padding:6px 16px;border-bottom:1px solid #0f3460;background:rgba(15,52,96,0.35);"></div>

                <!-- File info + manual input -->
                <div style="padding:8px 16px;border-bottom:1px solid #0f3460;">
                    <div id="autoTestFileInfo" style="font-size:11px;color:#94a3b8;margin-bottom:4px;">No test data loaded</div>
                    <div id="autoTestManualSection" style="display:none;color:#cbd5e1;font-size:11px;margin-top:4px;">
                        <div style="margin-bottom:4px;font-weight:600;color:#fbbf24;">✏️ Manual entry — paste or type spin numbers below (oldest first), then click Parse Input</div>
                        <div style="margin:4px 0 6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <label for="autoTestManualStrategy" style="color:#fbbf24;font-weight:600;">Strategy:</label>
                            <select id="autoTestManualStrategy" title="Which strategy should generate predictions for the manual run" style="padding:4px 8px;font-size:11px;font-weight:600;border:1px solid #fbbf24;border-radius:4px;background:#1e293b;color:#e2e8f0;">
                                <option value="auto-test">auto-test</option>
                                <option value="T1-strategy">T1-strategy</option>
                                <option value="test">test (strategy lab)</option>
                                <option value="3t-selection">3T-Selection</option>
                                <option value="analytics">📊 Analytics (T2×T3)</option>
                                <option value="AI-trained" selected>AI-trained</option>
                            </select>
                            <span style="color:#94a3b8;font-size:10px;">(predictions will be generated using this strategy so you can compare against a live session)</span>
                        </div>
                        <textarea id="autoTestManualInput" placeholder="e.g.&#10;17&#10;32&#10;5&#10;28&#10;...&#10;(commas, spaces, or newlines all work)" style="width:100%;height:120px;background:#1e293b;color:#e2e8f0;border:1px solid #fbbf24;border-radius:4px;font-size:12px;padding:6px;resize:vertical;font-family:monospace;"></textarea>
                        <div style="margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <button id="autoTestParseBtn" style="padding:6px 14px;font-size:11px;font-weight:700;border:1px solid #fbbf24;border-radius:4px;cursor:pointer;background:#fbbf24;color:#000;">Parse Input</button>
                            <span id="autoTestManualStatus" style="font-size:11px;color:#94a3b8;"></span>
                        </div>
                    </div>

                    <!-- Manual-test config (separate from the 'manual' textarea-based
                         comparison mode). Visible only when method === 'manual-test'.
                         User picks pairs (one or more) per table + a few env toggles
                         that mirror the live wheel/AI panel's manual-mode controls,
                         then clicks Run as usual. Selections are snapshot-locked at
                         run time and held for the whole session. -->
                    <div id="autoTestManualTestSection" style="display:none;color:#cbd5e1;font-size:11px;margin-top:4px;border-top:1px dashed #334155;padding-top:6px;">
                        <div style="margin-bottom:6px;font-weight:600;color:#22d3ee;">🛠️ manual-test — load a file, pick env toggles + pairs, then Run (no engine training required)</div>
                        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
                            <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #22d3ee;border-radius:4px;background:rgba(34,211,238,0.08);">
                                <input type="checkbox" id="autoTestMtInverse"> Inverse
                            </label>
                            <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #22d3ee;border-radius:4px;background:rgba(34,211,238,0.08);">
                                <input type="checkbox" id="autoTestMtT3Halfs"> T3 halfs
                            </label>
                            <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #22d3ee;border-radius:4px;background:rgba(34,211,238,0.08);">
                                <input type="checkbox" id="autoTestMtIncludeGrey"> Include grey
                            </label>
                            <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #22d3ee;border-radius:4px;background:rgba(34,211,238,0.08);" title="Freeze the 1st/2nd/3rd ref pick for T1 & T2. When ON, you pick which sub-anchors to use per pair via the 1/2/3 buttons that appear next to each selected pill.">
                                <input type="checkbox" id="autoTestMtT1T2Breaks"> T1/T2 break
                            </label>
                            <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #22d3ee;border-radius:4px;background:rgba(34,211,238,0.08);" title="Wait-for-trigger: only place a bet AFTER a spin lands in the current bet pool. Win → keep betting. Loss → wait for next trigger.">
                                <input type="checkbox" id="autoTestMtSameMode"> Same
                            </label>
                            <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #22d3ee;border-radius:4px;background:rgba(34,211,238,0.08);" title="Bet on the wheel filters (Table/Sign/Set/Inverse) instead of pair predictions. If pairs are also selected, intersects pair-pool ∩ wheel-pool.">
                                <input type="checkbox" id="autoTestMtWheelMode"> Wheel mode
                            </label>
                        </div>
                        <!-- Table / Sign / Set filters — same controls as the live Wheel panel.
                             Captured into manualTestConfig at Run time and applied to the bet set. -->
                        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px 8px;background:rgba(15,23,42,0.5);border-radius:5px;">
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <span style="font-size:10px;font-weight:700;color:#22d3ee;min-width:40px;">Table:</span>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#86efac;">
                                    <input type="radio" name="autoTestMtTable" value="0"> 0
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#c4b5fd;">
                                    <input type="radio" name="autoTestMtTable" value="19"> 19
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#93c5fd;">
                                    <input type="radio" name="autoTestMtTable" value="both" checked> Both
                                </label>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <span style="font-size:10px;font-weight:700;color:#22d3ee;min-width:40px;">2/12:</span>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#7dd3fc;">
                                    <input type="radio" name="autoTestMt212" value="2"> 2
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#fde047;">
                                    <input type="radio" name="autoTestMt212" value="12"> 12
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#93c5fd;">
                                    <input type="radio" name="autoTestMt212" value="both" checked> Both
                                </label>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <span style="font-size:10px;font-weight:700;color:#22d3ee;min-width:40px;">Sign:</span>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#86efac;">
                                    <input type="radio" name="autoTestMtSign" value="positive"> +ve
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#cbd5e1;">
                                    <input type="radio" name="autoTestMtSign" value="negative"> -ve
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#93c5fd;">
                                    <input type="radio" name="autoTestMtSign" value="both" checked> Both
                                </label>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <span style="font-size:10px;font-weight:700;color:#22d3ee;min-width:40px;">Set:</span>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#fbbf24;">
                                    <input type="checkbox" id="autoTestMtSet0" checked> 0
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#10b981;">
                                    <input type="checkbox" id="autoTestMtSet5" checked> 5
                                </label>
                                <label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;color:#a78bfa;">
                                    <input type="checkbox" id="autoTestMtSet6" checked> 6
                                </label>
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:5px;">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <strong style="color:#fbbf24;min-width:30px;">T1:</strong>
                                <div id="autoTestMtT1Pills" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <strong style="color:#34d399;min-width:30px;">T2:</strong>
                                <div id="autoTestMtT2Pills" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <strong style="color:#60a5fa;min-width:30px;">T3:</strong>
                                <div id="autoTestMtT3Pills" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
                            </div>
                        </div>
                        <div style="margin-top:6px;font-size:10px;color:#94a3b8;">
                            <span id="autoTestMtSummary">No pairs selected. Use the live tables to see which pair keys are available, or click pills below to toggle.</span>
                        </div>
                    </div>
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
                        <button class="auto-test-tab" data-tab="strategy4" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 4</button>
                        <button class="auto-test-tab" data-tab="strategy5" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 5</button>
                        <button class="auto-test-tab" data-tab="strategy6" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 6</button>
                        <button class="auto-test-tab" data-tab="strategy7" style="padding:8px 16px;font-size:11px;font-weight:600;border:none;border-bottom:2px solid transparent;cursor:pointer;background:transparent;color:#94a3b8;">Strategy 7</button>
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

        // 📂 data/ folder dropdown — populate once on init via the
        // existing aiAPI.loadHistoricalData() IPC handler (reads .txt
        // files from app/data/). When the user picks a file, parse its
        // content via _parseAndStore — exactly what Load File does
        // after the open-file dialog, just without the dialog.
        const folderSel = document.getElementById('autoTestDataFolderSelect');
        if (folderSel) {
            this._dataFolderCache = null;   // {filename: content, ...}
            const populate = async () => {
                try {
                    if (!window.aiAPI || typeof window.aiAPI.loadHistoricalData !== 'function') return;
                    const res = await window.aiAPI.loadHistoricalData();
                    const files = (res && Array.isArray(res.files)) ? res.files : [];
                    this._dataFolderCache = {};
                    // Reset options to the placeholder, then append.
                    while (folderSel.options.length > 1) folderSel.remove(1);
                    files.sort((a, b) => a.filename.localeCompare(b.filename));
                    for (const f of files) {
                        this._dataFolderCache[f.filename] = f.content;
                        const opt = document.createElement('option');
                        opt.value = f.filename;
                        opt.textContent = f.filename;
                        folderSel.appendChild(opt);
                    }
                    if (files.length === 0) {
                        folderSel.options[0].textContent = '— data/ folder (empty) —';
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to populate data folder list:', e && e.message);
                }
            };
            populate();
            folderSel.addEventListener('change', () => {
                const name = folderSel.value;
                if (!name) return;
                const content = this._dataFolderCache && this._dataFolderCache[name];
                if (content == null) {
                    console.warn(`⚠️ No cached content for ${name}; re-loading folder…`);
                    populate();
                    return;
                }
                this._parseAndStore(content, name);
            });
        }

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
                // Refresh the Training badge so any mismatch warning
                // updates the moment the method changes.
                this._refreshTrainingBadge();
                this._applyMethodVisibility();
                this._renderMethodParams();
            });
        }
        // Apply initial show/hide for manual-entry section based on default method.
        this._applyMethodVisibility();
        // Initial paint of the per-method parameters row (empty for the
        // default method; populated when the user picks 'test').
        this._renderMethodParams();
        // Initial badge paint — read whatever active mode the registry
        // has at construction time (typically null until the user trains).
        this._refreshTrainingBadge();

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
        const status   = document.getElementById('autoTestManualStatus');
        const fileInfo = document.getElementById('autoTestFileInfo');
        const runBtn   = document.getElementById('autoTestRunBtn');

        const setStatus = (msg, color) => {
            if (status) {
                status.textContent = msg;
                status.style.color = color || '#94a3b8';
            }
            if (fileInfo) fileInfo.textContent = msg;
        };

        if (!textarea || !textarea.value.trim()) {
            setStatus('⚠️ No input to parse — paste numbers above first', '#f87171');
            return;
        }

        // Lenient tokenizer — split on anything that is not a digit, then
        // keep entries that fall in the valid roulette range (0-36). This
        // accepts newlines, commas, spaces, tabs, and mixed delimiters,
        // which the strict line-based loader rejects.
        const raw = textarea.value;
        const tokens = raw.split(/[^0-9]+/).filter(t => t.length > 0);
        const spins = [];
        const bad   = [];
        for (const t of tokens) {
            const n = parseInt(t, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 36) spins.push(n);
            else bad.push(t);
        }

        if (spins.length === 0) {
            setStatus(`❌ Parse error: no valid spin numbers found (0-36)`, '#f87171');
            this.testSpins = null;
            if (runBtn) runBtn.disabled = true;
            return;
        }

        this.testSpins    = spins;
        this.testFileName = 'manual-input';
        if (runBtn) runBtn.disabled = false;

        const skipped = bad.length ? ` (skipped ${bad.length} invalid token${bad.length === 1 ? '' : 's'})` : '';
        setStatus(`✅ Parsed ${spins.length} spin${spins.length === 1 ? '' : 's'} — ready to Run Test${skipped}`, '#22c55e');
        console.log(`✅ Manual input parsed: ${spins.length} spins${skipped}`);
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
        // Refresh the Training badge before each run so the user sees
        // exactly which mode the run will be scored against.
        this._refreshTrainingBadge();
        const engine = this._getEngine();
        if (!engine) {
            this._showError('Engine not available.');
            return;
        }
        // Method-gated precondition. AI-trained Auto Test does NOT
        // require the legacy `engine.isTrained` gate — it uses its own
        // controller. Every other method retains the original behavior.
        //
        // 'manual' is a router: the user picks the real strategy via the
        // sub-dropdown. Resolve the *effective* method for gating so a
        // manual run targeting AI-trained is not blocked by isTrained.
        let effectiveMethod = this.testMethod;
        if (effectiveMethod === 'manual' && typeof document !== 'undefined') {
            const sel = document.getElementById('autoTestManualStrategy');
            if (sel && sel.value) effectiveMethod = sel.value;
        }
        // manual-test uses user-supplied pair selections — no engine
        // training needed. Same exemption AI-trained already has.
        if (effectiveMethod !== 'AI-trained' && effectiveMethod !== 'manual-test' && !engine.isTrained) {
            // Surface WHY the method is blocked: which TRAIN mode the
            // method requires, and which mode is currently active. The
            // user may have clicked TRAIN with a placeholder mode
            // (User/AI/Hybrid) which never calls engine.train().
            const expected = _expectedTrainingModeFor(effectiveMethod);
            const labels = {
                'default':     'Default mode',
                'user-mode':   'User-mode',
                'ai-mode':     'AI-mode',
                'hybrid-mode': 'Hybrid-mode'
            };
            let TS = null;
            if (typeof require === 'function') {
                // Step 3 cutover: prefer the new training/ folder.
                // Browser still uses window.TrainingState set by the
                // app/ <script> tag.
                try { TS = require('../../training/training-state.js'); }
                catch (_) { /* fall through */ }
            }
            if (!TS && typeof window !== 'undefined' && window.TrainingState) {
                TS = window.TrainingState;
            }
            const active = TS ? TS.getActiveMode() : null;
            const activeLabel = active ? (labels[active] || active) : 'none';
            const expectedLabel = expected ? (labels[expected] || expected) : null;
            const methodLabel = (this.testMethod === 'manual')
                ? `manual → ${effectiveMethod}`
                : this.testMethod;
            const msg = expectedLabel
                ? `Engine not trained. The "${methodLabel}" method requires ${expectedLabel} training. Active training mode: ${activeLabel}. Select "${expectedLabel}" in the TRAIN dropdown and click TRAIN.`
                : 'Engine not trained. Click TRAIN first.';
            this._showError(msg);
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
            // When method='manual', the user picks which strategy should
            // generate predictions via the sub-dropdown. Pass that through
            // as `manualStrategy` so the runner can dispatch to the
            // matching decision pipeline while still reporting the run as
            // 'manual' on the result.
            let manualStrategy = null;
            if (this.testMethod === 'manual' && typeof document !== 'undefined') {
                const sel = document.getElementById('autoTestManualStrategy');
                if (sel && sel.value) manualStrategy = sel.value;
            }
            // Step 1 (UI only): snapshot the manual-test config so it's
            // visible in the console for verification. The runner does
            // NOT consume it yet — that's Step 2. Until then a
            // manual-test run executes the existing default pipeline
            // (auto-test behaviour) so it never blows up.
            let manualTestConfig = null;
            if (this.testMethod === 'manual-test') {
                manualTestConfig = this._captureManualTestConfig();
                console.log('🛠️ manual-test config snapshot (Step 1 — runner integration pending):', manualTestConfig);
            }
            this.result = await runner.runAll(
                this.testSpins,
                {
                    testFile: this.testFileName || 'manual',
                    batchSize: 20,
                    method: this.testMethod,
                    manualStrategy: manualStrategy,
                    manualTestConfig: manualTestConfig
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

        // Disable the export / run buttons while building the workbook
        // so the user can't fire a second export on top of the first.
        const exportBtn = document.getElementById('autoTestExportBtn');
        const runBtn    = document.getElementById('autoTestRunBtn');
        const prevExportLabel = exportBtn ? exportBtn.textContent : null;
        if (exportBtn) { exportBtn.disabled = true; exportBtn.textContent = '⏳ Exporting…'; }
        if (runBtn) runBtn.disabled = true;

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
            // Prefer the async path so the renderer stays responsive on
            // large runs (500+ sessions × 5 strategies = thousands of
            // detail sheets). Falls back to the sync generate() if the
            // currently-loaded module predates the async addition.
            const progressCb = (pct, msg) => this.updateProgress(pct, msg);
            const workbook = (typeof reportGen.generateAsync === 'function')
                ? await reportGen.generateAsync(this.result, progressCb)
                : reportGen.generate(this.result);
            this.updateProgress(98, 'Writing file…');
            await reportGen.saveToFile(workbook);
            this.updateProgress(100, 'Export complete');

            console.log('✅ Excel report exported');
        } catch (err) {
            this._showError(`Export failed: ${err.message}`);
            console.error('❌ Export failed:', err);
        } finally {
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = prevExportLabel || '📊 Export Excel';
            }
            if (runBtn) runBtn.disabled = false;
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

        // Defensive: if the runner returned a degraded result (e.g.
        // ENGINE_NOT_TRAINED, WRONG_TRAINING_MODE) the strategies map is
        // empty and overall is null. Surface the message instead of
        // crashing on result.strategies[num].summary.
        const hasStrategies = result && result.strategies
            && result.strategies[1] && result.strategies[1].summary
            && result.strategies[2] && result.strategies[2].summary
            && result.strategies[3] && result.strategies[3].summary
            && result.strategies[4] && result.strategies[4].summary;
        if (!hasStrategies) {
            const reason = (result && (result.message || result.outcome)) || 'No strategy data returned';
            content.innerHTML = `
                <div style="padding:16px;border:1px solid #f59e0b;border-radius:6px;background:rgba(245,158,11,0.08);color:#fbbf24;font-size:12px;">
                    <div style="font-weight:700;margin-bottom:6px;">⚠️ Auto Test did not produce results</div>
                    <div style="color:#e2e8f0;">${reason}</div>
                </div>`;
            return;
        }

        const strategyNames = { 1: '🟢 Aggressive', 2: '🔵 Conservative', 3: '🟣 Cautious', 4: '🛡️ Defensive', 5: '🧠 Logical', 6: '🪶 Super Cautious', 7: '➖ Flat Bet' };
        const colors = { 1: '#28a745', 2: '#007bff', 3: '#6f42c1', 4: '#0f766e', 5: '#4338ca', 6: '#475569' };

        let bestStrategy = 1;
        let bestWinRate = 0;
        for (const num of [1, 2, 3, 4, 5, 6, 7]) {
            // Defensive: runner may not emit every strategy slot
            // (e.g. Flat Bet S7 was added later — older runners skip it).
            if (!result.strategies[num] || !result.strategies[num].summary) continue;
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
                        <th style="padding:6px;text-align:center;border:1px solid #334155;" title="Longest run of consecutive SKIPs in any session">Max Skip Streak</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;" title="Longest losing streak in any session">Max Loss Streak</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;" title="Longest winning streak in any session">Max Win Streak</th>
                        <th style="padding:6px;text-align:center;border:1px solid #334155;" title="Largest peak-to-trough drop across any session">Max DD $</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const num of [1, 2, 3, 4, 5, 6, 7]) {
            if (!result.strategies[num] || !result.strategies[num].summary) continue;
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
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#f59e0b;">${s.maxConsecutiveSkips || 0}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#ef4444;">${s.maxConsecutiveLosses || 0}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#22c55e;">${s.maxConsecutiveWins || 0}</td>
                    <td style="padding:6px;text-align:center;border:1px solid #334155;color:#ef4444;">$${(s.maxDrawdown || 0).toFixed(0)}</td>
                </tr>`;
        }

        html += '</tbody></table>';

        // Bar charts
        html += '<div style="margin-top:16px;">';
        for (const num of [1, 2, 3, 4, 5, 6, 7]) {
            if (!result.strategies[num] || !result.strategies[num].summary) continue;
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
            <div style="margin-bottom:12px;font-size:11px;color:#cbd5e1;display:flex;gap:14px;flex-wrap:wrap;">
                <span title="Longest run of consecutive SKIPs in any session">⏭️ Max Skip Streak: <b style="color:#f59e0b;">${s.maxConsecutiveSkips || 0}</b></span>
                <span title="Longest losing streak in any session">❌ Max Loss Streak: <b style="color:#ef4444;">${s.maxConsecutiveLosses || 0}</b></span>
                <span title="Longest winning streak in any session">✅ Max Win Streak: <b style="color:#22c55e;">${s.maxConsecutiveWins || 0}</b></span>
                <span title="Largest peak-to-trough drop across any session">📉 Max Drawdown: <b style="color:#ef4444;">$${(s.maxDrawdown || 0).toFixed(0)}</b></span>
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
                        <th style="padding:4px;border:1px solid #334155;" title="Longest consecutive SKIPs">Skip Strk</th>
                        <th style="padding:4px;border:1px solid #334155;" title="Longest consecutive losses">Loss Strk</th>
                        <th style="padding:4px;border:1px solid #334155;" title="Longest consecutive wins">Win Strk</th>
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
                    <td style="padding:4px;text-align:center;border:1px solid #334155;color:#f59e0b;">${session.maxConsecutiveSkips || 0}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;color:#ef4444;">${session.maxConsecutiveLosses || 0}</td>
                    <td style="padding:4px;text-align:center;border:1px solid #334155;color:#22c55e;">${session.maxConsecutiveWins || 0}</td>
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

    /**
     * Update the Training: X badge from the mode-namespaced TrainingState
     * registry. Read-only; never blocks a run. When the chosen Auto Test
     * method does not align with the registry's active mode, the badge
     * receives a non-blocking warning style and tooltip.
     *
     * No-op when the badge element or TrainingState module is absent.
     */
    /**
     * Show the manual-entry section and hide the Load-File button when
     * the user picks the 'manual' method from the header dropdown. For
     * every other method the manual section collapses and Load File
     * comes back. Safe to call before the DOM is fully painted — every
     * lookup is null-guarded.
     */
    _applyMethodVisibility() {
        if (typeof document === 'undefined') return;
        const isManual = (this.testMethod === 'manual');
        const isManualTest = (this.testMethod === 'manual-test');
        const manualSec = document.getElementById('autoTestManualSection');
        const manualTestSec = document.getElementById('autoTestManualTestSection');
        const loadBtn   = document.getElementById('autoTestLoadBtn');
        // 'manual'      — textarea entry, hides Load File.
        // 'manual-test' — file-loaded run with manual env + pair config,
        //                 keeps Load File visible. The two sections live
        //                 in the same container so we toggle them
        //                 independently.
        if (manualSec)     manualSec.style.display     = isManual     ? 'block' : 'none';
        if (manualTestSec) manualTestSec.style.display = isManualTest ? 'block' : 'none';
        if (loadBtn)       loadBtn.style.display       = isManual     ? 'none'  : '';
        if (isManualTest) this._renderManualTestPills();
    }

    /**
     * Render the pair-selection pills for manual-test mode. Pulls the
     * currently-available pair lists from window.aiPanel (which keeps
     * them in sync with the live tables) so the user sees the same
     * pair keys they'd see in the live AI prediction panel. Pills are
     * click-to-toggle; the in-memory selection is held on this
     * instance and snapshotted into the run options when Run is
     * pressed.
     *
     * Defensive: if aiPanel hasn't loaded pairs yet (not enough spins)
     * the pills areas show a placeholder note. Idempotent — safe to
     * re-call when the user adds more spins.
     */
    _renderManualTestPills() {
        if (typeof document === 'undefined') return;
        if (!this._mtSelections) {
            this._mtSelections = { t1: new Set(), t2: new Set(), t3: new Set() };
        }
        // Per-pair primary-ref selections used when "T1/T2 break" is ON.
        // Shape: { t1: { 'prevPlus1': Set(['first','second']) }, t2: {...} }.
        // Defaulted to all 3 refs the first time a pair is touched while
        // the toggle is ON. Persists across re-renders so the user's
        // 1/2/3 picks survive add/remove operations on other pairs.
        if (!this._mtRefSelections) {
            this._mtRefSelections = { t1: {}, t2: {} };
        }
        // Mirror the live wheel-panel "T1/T2 break" toggle into the
        // local checkbox on first render. Read window.t1t2Breaks if
        // available; otherwise fall back to whatever the local
        // checkbox currently shows (default OFF).
        const breakCb = document.getElementById('autoTestMtT1T2Breaks');
        if (breakCb && !breakCb._autoTestMtSynced) {
            breakCb._autoTestMtSynced = true;
            if (typeof window !== 'undefined' && typeof window.t1t2Breaks === 'boolean') {
                breakCb.checked = window.t1t2Breaks;
            }
            // Toggle in the panel broadcasts to the wheel panel via
            // the shared event so the two stay in sync. Re-renders
            // pills so sub-toggles appear/disappear.
            breakCb.addEventListener('change', () => {
                const v = !!breakCb.checked;
                if (typeof window !== 'undefined') {
                    window.t1t2Breaks = v;
                    try { localStorage.setItem('strategyLab.t1t2Breaks', v ? '1' : '0'); } catch (_) {}
                    try { window.dispatchEvent(new CustomEvent('t1t2BreaksChanged', { detail: { value: v } })); } catch (_) {}
                }
                this._renderManualTestPills();
            });
            // Listen for the same event so a wheel-panel flip keeps
            // this checkbox in sync.
            window.addEventListener('t1t2BreaksChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (breakCb.checked !== v) {
                    breakCb.checked = v;
                    this._renderManualTestPills();
                }
            });
        }
        const t1t2BreaksOn = !!(breakCb && breakCb.checked);

        // Mirror the live wheel-panel "Same" toggle into the local
        // checkbox on first render. Same plumbing pattern as T1/T2
        // break: bidirectional sync via 'sameModeChanged' event.
        const sameCb = document.getElementById('autoTestMtSameMode');
        if (sameCb && !sameCb._autoTestMtSynced) {
            sameCb._autoTestMtSynced = true;
            if (typeof window !== 'undefined' && typeof window.sameMode === 'boolean') {
                sameCb.checked = window.sameMode;
            }
            sameCb.addEventListener('change', () => {
                const v = !!sameCb.checked;
                if (typeof window !== 'undefined') {
                    window.sameMode = v;
                    try { localStorage.setItem('strategyLab.sameMode', v ? '1' : '0'); } catch (_) {}
                    try { window.dispatchEvent(new CustomEvent('sameModeChanged', { detail: { value: v } })); } catch (_) {}
                }
            });
            window.addEventListener('sameModeChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (sameCb.checked !== v) sameCb.checked = v;
            });
        }

        // Mirror the live wheel-panel "Wheel mode" toggle.
        const wheelCb = document.getElementById('autoTestMtWheelMode');
        if (wheelCb && !wheelCb._autoTestMtSynced) {
            wheelCb._autoTestMtSynced = true;
            if (typeof window !== 'undefined' && typeof window.wheelMode === 'boolean') {
                wheelCb.checked = window.wheelMode;
            }
            wheelCb.addEventListener('change', () => {
                const v = !!wheelCb.checked;
                if (typeof window !== 'undefined') {
                    window.wheelMode = v;
                    try { localStorage.setItem('strategyLab.wheelMode', v ? '1' : '0'); } catch (_) {}
                    try { window.dispatchEvent(new CustomEvent('wheelModeChanged', { detail: { value: v } })); } catch (_) {}
                }
            });
            window.addEventListener('wheelModeChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (wheelCb.checked !== v) wheelCb.checked = v;
            });
        }
        // Static pair-key list — doesn't depend on the live AI panel
        // having spins. These are the symbolic ref-keys used across the
        // whole codebase; the runner will compute the actual numbers
        // per spin from the loaded test file.
        const T12_PAIRS = [
            { key: 'ref0',                   display: '0' },
            { key: 'ref19',                  display: '19' },
            { key: 'prev',                   display: 'P' },
            { key: 'prev_13opp',             display: 'P-13OPP' },
            { key: 'prevPlus1',              display: 'P+1' },
            { key: 'prevPlus1_13opp',        display: 'P+1-13OPP' },
            { key: 'prevMinus1',             display: 'P-1' },
            { key: 'prevMinus1_13opp',       display: 'P-1-13OPP' },
            { key: 'prevPlus2',              display: 'P+2' },
            { key: 'prevPlus2_13opp',        display: 'P+2-13OPP' },
            { key: 'prevMinus2',             display: 'P-2' },
            { key: 'prevMinus2_13opp',       display: 'P-2-13OPP' },
            { key: 'prevPrev',               display: 'PP' },
            { key: 'prevPrev_13opp',         display: 'PP-13OPP' },
            { key: 'prevPrevPlus1',          display: 'PP+1' },
            { key: 'prevPrevPlus1_13opp',    display: 'PP+1-13OPP' },
            { key: 'prevPrevMinus1',         display: 'PP-1' },
            { key: 'prevPrevMinus1_13opp',   display: 'PP-1-13OPP' },
            { key: 'prevPrevPlus2',          display: 'PP+2' },
            { key: 'prevPrevPlus2_13opp',    display: 'PP+2-13OPP' },
            { key: 'prevPrevMinus2',         display: 'PP-2' },
            { key: 'prevPrevMinus2_13opp',   display: 'PP-2-13OPP' }
        ];
        // T3 uses the same 10 base pair families (no _13opp variants
        // unless T3-halfs is ON — in that case each splits into _pair
        // and _13opp half).
        const T3_BASE = [
            { key: 'prev',           display: 'P' },
            { key: 'prevPlus1',      display: 'P+1' },
            { key: 'prevMinus1',     display: 'P-1' },
            { key: 'prevPlus2',      display: 'P+2' },
            { key: 'prevMinus2',     display: 'P-2' },
            { key: 'prevPrev',       display: 'PP' },
            { key: 'prevPrevPlus1',  display: 'PP+1' },
            { key: 'prevPrevMinus1', display: 'PP-1' },
            { key: 'prevPrevPlus2',  display: 'PP+2' },
            { key: 'prevPrevMinus2', display: 'PP-2' }
        ];
        const t3HalfsCb = document.getElementById('autoTestMtT3Halfs');
        const halfsOn = !!(t3HalfsCb && t3HalfsCb.checked);
        const t3 = halfsOn
            ? T3_BASE.flatMap(p => [
                { key: p.key + '_pair',  display: p.display },
                { key: p.key + '_13opp', display: p.display + '-13OPP' }
            ])
            : T3_BASE;
        const t1 = T12_PAIRS;
        const t2 = T12_PAIRS;

        // tableKey ∈ {'t1','t2','t3'} — drives whether sub-anchor 1/2/3
        // toggles are rendered next to a selected pill (only t1/t2 when
        // T1/T2 break is ON).
        const draw = (hostId, pairs, sel, accent, tableKey) => {
            const host = document.getElementById(hostId);
            if (!host) return;
            host.innerHTML = '';
            if (pairs.length === 0) {
                host.innerHTML = '<span style="color:#64748b;font-size:10px;font-style:italic;">no pairs available (add spins)</span>';
                return;
            }
            pairs.forEach(p => {
                // Inline wrapper so the pill and its 1/2/3 sub-toggles
                // (when shown) stay glued together as a unit. Adds a
                // tiny bottom margin so wrapping doesn't crush rows.
                const wrap = document.createElement('span');
                wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-bottom:2px;';

                const pill = document.createElement('span');
                const on = sel.has(p.key);
                pill.textContent = p.display || p.key;
                pill.title = p.key;
                pill.style.cssText = `
                    padding:2px 8px;font-size:10px;font-weight:700;border-radius:3px 0 0 3px;cursor:pointer;
                    border:1px solid ${on ? accent : '#475569'};
                    background:${on ? accent : 'rgba(71,85,105,0.2)'};
                    color:${on ? '#0f172a' : '#cbd5e1'};
                    user-select:none;
                `;
                pill.addEventListener('click', () => {
                    if (sel.has(p.key)) {
                        sel.delete(p.key);
                        // Also drop any ref-selection state for this pair
                        // so re-selecting it later starts with the
                        // default-all-3 again.
                        if ((tableKey === 't1' || tableKey === 't2') && this._mtRefSelections[tableKey]) {
                            delete this._mtRefSelections[tableKey][p.key];
                        }
                    } else {
                        sel.add(p.key);
                        // Pre-populate per-pair ref selection to all 3
                        // refs the first time it's added while
                        // T1/T2 break is ON.
                        if ((tableKey === 't1' || tableKey === 't2') && t1t2BreaksOn) {
                            if (!this._mtRefSelections[tableKey][p.key]) {
                                this._mtRefSelections[tableKey][p.key] = new Set(['first', 'second', 'third']);
                            }
                        }
                    }
                    this._renderManualTestPills();
                });
                wrap.appendChild(pill);

                // Sub-anchor toggles — only for T1/T2 pairs that are
                // currently selected AND the T1/T2 break toggle is ON.
                // T3 pairs never get these (T3 has its own halfs system).
                if (on && t1t2BreaksOn && (tableKey === 't1' || tableKey === 't2')) {
                    // Ensure a default ref-selection exists for this pair.
                    if (!this._mtRefSelections[tableKey][p.key]) {
                        this._mtRefSelections[tableKey][p.key] = new Set(['first', 'second', 'third']);
                    }
                    const refSel = this._mtRefSelections[tableKey][p.key];
                    const SUB = [
                        { key: 'first',  label: '1' },
                        { key: 'second', label: '2' },
                        { key: 'third',  label: '3' }
                    ];
                    SUB.forEach((s, i) => {
                        const btn = document.createElement('span');
                        const subOn = refSel.has(s.key);
                        btn.textContent = s.label;
                        btn.title = `${s.key} ref`;
                        const isLast = (i === SUB.length - 1);
                        btn.style.cssText = `
                            padding:2px 5px;font-size:10px;font-weight:700;cursor:pointer;
                            border:1px solid ${subOn ? accent : '#475569'};
                            border-left:none;
                            border-radius:${isLast ? '0 3px 3px 0' : '0'};
                            background:${subOn ? accent : 'rgba(71,85,105,0.2)'};
                            color:${subOn ? '#0f172a' : '#cbd5e1'};
                            user-select:none;
                            min-width:14px;text-align:center;
                        `;
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (refSel.has(s.key)) refSel.delete(s.key);
                            else                   refSel.add(s.key);
                            this._renderManualTestPills();
                        });
                        wrap.appendChild(btn);
                    });
                }

                host.appendChild(wrap);
            });
        };

        draw('autoTestMtT1Pills', t1, this._mtSelections.t1, '#fbbf24', 't1');
        draw('autoTestMtT2Pills', t2, this._mtSelections.t2, '#34d399', 't2');
        draw('autoTestMtT3Pills', t3, this._mtSelections.t3, '#60a5fa', 't3');

        // Wire the T3-halfs checkbox to re-render T3 pills (drop any
        // selected keys that no longer exist in the new list — e.g.,
        // switching halfs ON drops 'prevPlus1' since it becomes
        // 'prevPlus1_pair' / 'prevPlus1_13opp'). Bind once.
        if (t3HalfsCb && !t3HalfsCb._autoTestMtBound) {
            t3HalfsCb._autoTestMtBound = true;
            t3HalfsCb.addEventListener('change', () => {
                // Drop selections that don't exist in the new t3 key set
                const newKeys = new Set((t3HalfsCb.checked
                    ? T3_BASE.flatMap(p => [p.key + '_pair', p.key + '_13opp'])
                    : T3_BASE.map(p => p.key)));
                this._mtSelections.t3.forEach(k => { if (!newKeys.has(k)) this._mtSelections.t3.delete(k); });
                this._renderManualTestPills();
            });
        }

        const summary = document.getElementById('autoTestMtSummary');
        if (summary) {
            const total = this._mtSelections.t1.size + this._mtSelections.t2.size + this._mtSelections.t3.size;
            if (total === 0) {
                summary.textContent = 'No pairs selected. Click pills above to choose. Toggles + selections lock at Run time.';
                summary.style.color = '#94a3b8';
            } else {
                const t1Sel = [...this._mtSelections.t1].join(', ') || '—';
                const t2Sel = [...this._mtSelections.t2].join(', ') || '—';
                const t3Sel = [...this._mtSelections.t3].join(', ') || '—';
                summary.textContent = `${total} pair(s) selected | T1: ${t1Sel} | T2: ${t2Sel} | T3: ${t3Sel}`;
                summary.style.color = '#cbd5e1';
            }
        }
    }

    /**
     * Snapshot the manual-test config when the user presses Run. The
     * runner consumes this object via options.manualTestConfig in
     * Step 2 (runner integration — not yet wired). For Step 1 we
     * just capture and log it so the UI can be verified visually.
     */
    _captureManualTestConfig() {
        if (typeof document === 'undefined') return null;
        const cb = (id) => {
            const el = document.getElementById(id);
            return !!(el && el.checked);
        };
        const radio = (name) => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            return checked ? checked.value : null;
        };
        // Snapshot per-pair ref selections when T1/T2 break is ON.
        // Only pairs currently selected in T1/T2 contribute; serialised
        // as plain arrays for the runner / Excel renderer. When the
        // toggle is OFF the runner ignores refSelections and falls
        // back to the existing auto-ref + grey logic, so this field
        // is harmless when present but unused.
        const t1t2BreaksOn = cb('autoTestMtT1T2Breaks');
        const refSelections = { t1: {}, t2: {} };
        if (t1t2BreaksOn && this._mtRefSelections) {
            ['t1','t2'].forEach(tk => {
                const sel = (tk === 't1') ? this._mtSelections.t1 : this._mtSelections.t2;
                sel.forEach(pairKey => {
                    const refs = this._mtRefSelections[tk] && this._mtRefSelections[tk][pairKey];
                    refSelections[tk][pairKey] = refs
                        ? [...refs]
                        : ['first', 'second', 'third'];
                });
            });
        }
        return {
            inverse:      cb('autoTestMtInverse'),
            t3Halfs:      cb('autoTestMtT3Halfs'),
            includeGrey:  cb('autoTestMtIncludeGrey'),
            t1t2Breaks:   t1t2BreaksOn,
            sameMode:     cb('autoTestMtSameMode'),
            wheelMode:    cb('autoTestMtWheelMode'),
            filters: {
                table:   radio('autoTestMtTable') || 'both',
                table212: radio('autoTestMt212')  || 'both',
                sign:    radio('autoTestMtSign')  || 'both',
                sets:    {
                    set0: cb('autoTestMtSet0'),
                    set5: cb('autoTestMtSet5'),
                    set6: cb('autoTestMtSet6')
                }
            },
            selections: {
                t1: this._mtSelections ? [...this._mtSelections.t1] : [],
                t2: this._mtSelections ? [...this._mtSelections.t2] : [],
                t3: this._mtSelections ? [...this._mtSelections.t3] : []
            },
            refSelections: refSelections
        };
    }

    /**
     * Per-method parameters area. Populates #autoTestMethodParams based
     * on the currently selected method. Methods with no declared params
     * keep the row hidden so the runner falls back to its built-in
     * defaults — i.e. when no params are exposed, behaviour is unchanged
     * from before this UI existed.
     *
     * Currently wired:
     *   - 'test' → "include grey numbers" checkbox. Mirrored with the
     *     AI-panel checkbox via window.strategyLabIncludeGrey + the
     *     'strategyLabIncludeGreyChanged' window event so all three UIs
     *     (AI panel, wheel panel, Auto Test panel) stay in sync.
     */
    _renderMethodParams() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('autoTestMethodParams');
        if (!host) return;

        if (this.testMethod === 'test') {
            const cur = (typeof window !== 'undefined' && typeof window.strategyLabIncludeGrey === 'boolean')
                ? window.strategyLabIncludeGrey : false;   // default OFF (2026-06-21)
            host.style.display = '';
            host.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:#cbd5e1;">
                    <span style="color:#14b8a6;font-weight:700;">🧪 Strategy-Lab params:</span>
                    <label style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #14b8a6;border-radius:4px;background:rgba(20,184,166,0.1);">
                        <input type="checkbox" id="autoTestParamGrey" ${cur ? 'checked' : ''}> include grey numbers
                    </label>
                    <span style="color:#94a3b8;font-size:10px;">(applied to lab + live; unticked filters greys out of the bet)</span>
                </div>`;
            const cb = document.getElementById('autoTestParamGrey');
            if (cb) {
                // Stay in sync if another UI (AI panel, wheel panel)
                // toggles the same setting while this row is visible.
                if (typeof window !== 'undefined') {
                    const onChanged = (e) => {
                        const v = !!(e && e.detail && e.detail.value);
                        if (cb.checked !== v) cb.checked = v;
                    };
                    if (this._autoTestParamGreyListener) {
                        window.removeEventListener('strategyLabIncludeGreyChanged', this._autoTestParamGreyListener);
                    }
                    this._autoTestParamGreyListener = onChanged;
                    window.addEventListener('strategyLabIncludeGreyChanged', onChanged);
                }
                cb.addEventListener('change', () => {
                    if (typeof window !== 'undefined') {
                        window.strategyLabIncludeGrey = !!cb.checked;
                        if (window.autoTestRunner) {
                            window.autoTestRunner._strategyLabIncludeGrey = !!cb.checked;
                        }
                        try { localStorage.setItem('strategyLab.includeGrey', cb.checked ? '1' : '0'); } catch (_) {}
                        // Tell the other mirrored UIs (AI panel, wheel
                        // panel) to refresh their checkbox state.
                        try {
                            window.dispatchEvent(new CustomEvent('strategyLabIncludeGreyChanged', { detail: { value: !!cb.checked } }));
                        } catch (_) {}
                    }
                });
            }
        } else {
            host.style.display = 'none';
            host.innerHTML = '';
        }
    }

    _refreshTrainingBadge() {
        const badge = (typeof document !== 'undefined')
            ? document.getElementById('autoTestTrainingBadge') : null;
        if (!badge) return;
        let TS = null;
        if (typeof require === 'function') {
            // Step 3 cutover: prefer the new training/ folder.
            try { TS = require('../../training/training-state.js'); }
            catch (_) { /* fall through */ }
        }
        if (!TS && typeof window !== 'undefined' && window.TrainingState) {
            TS = window.TrainingState;
        }
        const active = TS ? TS.getActiveMode() : null;
        const labels = {
            'default':     'Default mode',
            'user-mode':   'User-mode',
            'ai-mode':     'AI-mode',
            'hybrid-mode': 'Hybrid-mode'
        };
        badge.textContent = active
            ? `Training: ${labels[active] || active}`
            : 'Training: —';
        // Method-vs-active mismatch is informational only.
        const expected = _expectedTrainingModeFor(this.testMethod);
        const mismatch = active && expected && active !== expected;
        if (mismatch) {
            badge.style.background = 'rgba(239,68,68,0.20)';
            badge.style.borderColor = '#ef4444';
            badge.title = `Auto Test method "${this.testMethod}" expects training mode "${expected}", but active mode is "${active}".`;
        } else {
            badge.style.background = 'rgba(255,255,255,0.08)';
            badge.style.borderColor = 'rgba(255,255,255,0.3)';
            badge.title = 'Active trained mode (read from TrainingState)';
        }
    }
}

/**
 * Map an Auto Test method to the training mode that "should" have
 * produced its model state. Returns null when the mapping is undefined
 * (e.g. test-strategy has no opinion).
 */
function _expectedTrainingModeFor(method) {
    if (method === 'AI-trained') return 'ai-mode';
    if (method === 'auto-test')  return 'default';
    if (method === 'T1-strategy') return 'default';
    return null;
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
