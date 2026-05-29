/**
 * AI Auto Mode UI — Toggle, training, status display
 * Lives inside the AI Predictions tab (#aiSelectionPanel)
 */

class AIAutoModeUI {
    constructor() {
        this.isAutoMode = false;
        this.isSemiAutoMode = false;
        // 'manual' | 'semi' | 'auto' | 't1-strategy' | 'ai-trained' | 'test'.
        // The mode buttons are organized into three top-level tabs:
        //   - "Manual" tab → sub-options: MANUAL, SEMI
        //   - "Auto" tab   → sub-options: AUTO, T1-strategy, AI-trained
        //   - "Test (Lab)" tab → single sub-option: test (set on tab click)
        // `activeTab` is the visible tab; it auto-syncs to whichever tab
        // owns the currentMode so a programmatic setMode keeps the UI
        // coherent.
        // t1-strategy behaves exactly like 'auto' at the engine-enable
        // layer (engine is enabled, orchestrator is in auto mode) but
        // instructs the orchestrator to route live decisions through
        // the T1 policy from app/t1-strategy.js — the same helper the
        // Auto Test runner uses. No duplication of T1 algorithm here.
        // ai-trained is the System AI Adaptive Training mode. It does
        // NOT use the heuristic engine or user-defined pairs; every
        // spin is routed through window.aiTrainedController.decide().
        this.currentMode = 'manual';
        // Active top-level tab — drives which sub-button row is visible.
        // Auto-synced to currentMode; default is 'manual'.
        this.activeTab = 'manual';
        this.engine = null;      // Will be set to window.aiAutoEngine
        this.dataLoader = null;  // Will be set to window.aiDataLoader

        // TRAIN button mode router. Possible values:
        //   'default' | 'user-mode' | 'ai-mode' | 'hybrid-mode'.
        // 'default' = the existing legacy training pipeline (engine.train);
        // it is the initial selection so any user who never opens the
        // dropdown sees zero behavior change.
        this.selectedTrainingMode = 'default';

        // Per-mode training synopsis store. Each entry is either null
        // (mode never trained) or:
        //   { trainedAt, totalSpins?, totalSessions?, pairCount?,
        //     hitRate?, sequenceModelTrained?, v2?, reserved?, prev? }
        // Used by the "Last training synopsis" collapsible below the
        // mode buttons. Pure UI bookkeeping; never read by the runner.
        this._trainingSynopses = {
            'default':     null,
            'user-mode':   null,
            'ai-mode':     null,
            'hybrid-mode': null
        };

        this.createUI();
        this.setupEventListeners();
        // Initial paint of the four "never trained" cards so users see
        // the synopsis layout immediately (collapsed by default).
        try { this._renderTrainingSynopses(); } catch (_) { /* best-effort */ }

        console.log('✅ AI Auto Mode UI initialized');
    }

    /**
     * Create the auto-mode toggle bar inside the AI prediction panel.
     * Inserted at the top of #aiPanelContent, before table selection sections.
     */
    createUI() {
        const panelContent = document.getElementById('aiPanelContent');
        if (!panelContent) {
            console.warn('⚠️ aiPanelContent not found — auto mode UI skipped');
            return;
        }

        const autoSection = document.createElement('div');
        autoSection.id = 'autoModeSection';
        autoSection.style.cssText = 'padding:8px 12px;background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:8px;margin-bottom:8px;';
        autoSection.innerHTML = `
            <!-- Tabs row: top-level mode groupings -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <button id="manualTabBtn" data-tab="manual" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #3b82f6;border-radius:6px;cursor:pointer;
                    background:#3b82f6;color:white;
                ">📝 Manual</button>
                <button id="autoTabBtn" data-tab="auto" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #64748b;border-radius:6px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">🤖 Auto</button>
                <button id="testTabBtn" data-tab="test" title="Strategy Lab — sandbox mode for evaluating experimental strategies" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #64748b;border-radius:6px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">🧪 Test (Lab)</button>
                <select id="trainingModeSelect" title="Choose how the app trains" style="
                    flex:0 0 auto;padding:6px 6px;font-size:11px;font-weight:700;
                    border:2px solid #f59e0b;border-radius:6px;cursor:pointer;
                    background:#fff7ed;color:#92400e;
                ">
                    <option value="default" selected>Default mode</option>
                    <option value="user-mode">User-mode</option>
                    <option value="ai-mode">AI-mode</option>
                    <option value="hybrid-mode">Hybrid-mode</option>
                </select>
                <button id="trainBtn" style="
                    padding:6px 16px;font-size:11px;font-weight:700;
                    border:2px solid #f59e0b;border-radius:6px;cursor:pointer;
                    background:#f59e0b;color:#000;
                ">🎓 TRAIN</button>
            </div>

            <!-- Sub-row: shows the sub-options of the active tab.
                 'Test (Lab)' tab has no sub-row — clicking the tab sets
                 the mode directly. -->
            <div id="modeSubRow" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:4px 6px;background:rgba(15,23,42,0.45);border-radius:6px;">
                <!-- Manual tab sub-buttons -->
                <button id="manualModeBtn" data-tab-group="manual" style="
                    flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #3b82f6;border-radius:5px;cursor:pointer;
                    background:#3b82f6;color:white;
                ">MANUAL</button>
                <button id="semiAutoModeBtn" data-tab-group="manual" style="
                    flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #64748b;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">SEMI</button>
                <!-- Analytics: T2 × T3 wheel-consensus (window.AnalyticsStrategy).
                     Lives under the MANUAL tab — runs without training (uses
                     only the engine's deterministic projection helpers).
                     Numbers-only output; decides BET/WAIT on its own from the
                     overlap of the two tables' projected wheel patterns. -->
                <button id="analyticsModeBtn" data-tab-group="manual" title="Analytics — T2 × T3 wheel-consensus: bets 12 numbers when the two tables' projections align, with +/- and 0/19 confirmation. No training needed." style="
                    display:none;flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #0ea5e9;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">📊 Analytics</button>
                <!-- Auto tab sub-buttons -->
                <button id="autoModeBtn" data-tab-group="auto" style="
                    display:none;flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #64748b;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">AUTO</button>
                <button id="t1StrategyModeBtn" data-tab-group="auto" title="Same T1 decision policy as Auto Test" style="
                    display:none;flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #64748b;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">T1-strategy</button>
                <button id="aiTrainedModeBtn" data-tab-group="auto" title="System AI Adaptive Training Mode — phase-aware, evidence-gated bets" style="
                    display:none;flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #64748b;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">AI-trained</button>
                <!-- 3T-Selection: production copy of the Strategy-Lab algorithm.
                     Independent module (window.Strategy3T) so it can evolve
                     separately from the Test (Lab) sandbox. -->
                <button id="threeTSelectionModeBtn" data-tab-group="auto" title="3T-Selection — pair-intersection across T1, T2, T2·13, T3 (production copy of Strategy-Lab)" style="
                    display:none;flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #64748b;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">3T-Selection</button>
                <!-- Test tab placeholder (single mode; tab click sets it) -->
                <button id="testLabModeBtn" data-tab-group="test" title="Strategy Lab — sandbox mode for evaluating experimental strategies in live play" style="
                    display:none;flex:1;padding:5px 10px;font-size:11px;font-weight:700;
                    border:2px solid #14b8a6;border-radius:5px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">test (lab)</button>
                <!-- Strategy-Lab options: include/exclude grey numbers in
                     the bet. Read by both live (StrategyLab decide) and
                     Auto Test runner via the same global flag, so live
                     and lab parity is maintained. -->
                <label id="strategyLabGreyToggleWrap" data-tab-group="test" title="When unchecked, grey numbers (extra anchors / loose) are removed from the bet" style="
                    display:none;flex:0 0 auto;font-size:11px;color:#cbd5e1;
                    padding:4px 8px;border:1px solid #14b8a6;border-radius:5px;
                    background:rgba(20,184,166,0.08);cursor:pointer;user-select:none;
                ">
                    <input type="checkbox" id="strategyLabGreyToggle" checked style="margin-right:4px;vertical-align:middle;">include grey numbers
                </label>
            </div>
            <div id="trainingStatusBar" style="display:none;margin-bottom:4px;">
                <div id="trainingStatus" style="font-size:10px;color:#94a3b8;margin-bottom:2px;">Not trained</div>
                <div id="trainingProgress" style="display:none;margin-top:4px;">
                    <div style="background:#475569;border-radius:4px;height:6px;overflow:hidden;">
                        <div id="trainingProgressFill" style="background:#22c55e;height:100%;width:0%;transition:width 0.3s;"></div>
                    </div>
                    <div id="trainingProgressText" style="font-size:9px;color:#94a3b8;text-align:center;margin-top:2px;">0%</div>
                </div>
            </div>
            <!-- Last training synopsis — collapsible per-mode summary.
                 Pure read-out; never affects training behavior. -->
            <div id="trainingSynopsisSection" style="margin-bottom:4px;">
                <div id="trainingSynopsisHeader"
                     style="background:#334155;color:#cbd5e1;padding:4px 8px;font-size:10px;font-weight:700;border-radius:4px;cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;"
                     onclick="const n=document.getElementById('trainingSynopsisBody'); if(n) n.style.display = (n.style.display==='none' ? 'block' : 'none');">
                    📋 Last training synopsis
                    <span id="trainingSynopsisCounter" style="margin-left:auto;color:#94a3b8;font-weight:600;">0/4 trained</span>
                </div>
                <div id="trainingSynopsisBody"
                     style="display:none;background:#0f172a;border:1px solid #334155;border-top:none;border-radius:0 0 4px 4px;padding:6px;">
                    <div id="trainingSynopsisCards" style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;"></div>
                </div>
            </div>
            <div id="aiVersionToggle" style="display:none;margin-bottom:4px;">
                <label style="font-size:10px;color:#94a3b8;cursor:pointer;user-select:none;">
                    <input type="checkbox" id="aiV2Toggle" checked style="margin-right:4px;">
                    AI Learning v2 (Bayesian)
                </label>
            </div>
            <div id="autoModeStatus" style="display:none;">
                <div id="currentDecision" style="font-size:11px;color:#e2e8f0;font-weight:600;margin-bottom:2px;">--</div>
                <div id="skipCounter" style="font-size:10px;color:#94a3b8;">Skips: 0/5</div>
            </div>
        `;

        // Insert at the top of panel content
        panelContent.insertBefore(autoSection, panelContent.firstChild);
    }

    setupEventListeners() {
        const manualBtn = document.getElementById('manualModeBtn');
        const semiBtn = document.getElementById('semiAutoModeBtn');
        const autoBtn = document.getElementById('autoModeBtn');
        const trainBtn = document.getElementById('trainBtn');

        if (manualBtn) {
            manualBtn.addEventListener('click', () => {
                if (this.currentMode !== 'manual') this.setMode('manual');
            });
        }

        if (semiBtn) {
            semiBtn.addEventListener('click', () => {
                if (this.currentMode !== 'semi') this.setMode('semi');
            });
        }

        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                if (this.currentMode !== 'auto') this.setMode('auto');
            });
        }

        const t1Btn = document.getElementById('t1StrategyModeBtn');
        if (t1Btn) {
            t1Btn.addEventListener('click', () => {
                if (this.currentMode !== 't1-strategy') this.setMode('t1-strategy');
            });
        }

        const aiTrainedBtn = document.getElementById('aiTrainedModeBtn');
        if (aiTrainedBtn) {
            aiTrainedBtn.addEventListener('click', () => {
                if (this.currentMode !== 'ai-trained') this.setMode('ai-trained');
            });
        }

        const threeTBtn = document.getElementById('threeTSelectionModeBtn');
        if (threeTBtn) {
            threeTBtn.addEventListener('click', () => {
                if (this.currentMode !== '3t-selection') this.setMode('3t-selection');
            });
        }

        const testLabBtn = document.getElementById('testLabModeBtn');
        if (testLabBtn) {
            testLabBtn.addEventListener('click', () => {
                if (this.currentMode !== 'test') this.setMode('test');
            });
        }

        const analyticsBtn = document.getElementById('analyticsModeBtn');
        if (analyticsBtn) {
            analyticsBtn.addEventListener('click', () => {
                if (this.currentMode !== 'analytics') this.setMode('analytics');
            });
        }

        // Tab clicks. Switching to a tab swaps the sub-row visibility but
        // does NOT change currentMode (the sub-buttons do that), so the
        // user can browse without committing. Exception: the Test (Lab)
        // tab has only one sub-option, so a tab click sets mode='test'
        // directly for one-click access.
        const tabButtons = ['manualTabBtn', 'autoTabBtn', 'testTabBtn'];
        tabButtons.forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab');
                if (tab === 'test') {
                    // Single-mode tab: act immediately.
                    if (this.currentMode !== 'test') this.setMode('test');
                    else this._setActiveTab('test');
                } else {
                    this._setActiveTab(tab);
                }
            });
        });

        // Initial sub-row paint matches the default activeTab.
        this._setActiveTab(this.activeTab);

        // Strategy-Lab: include-grey toggle. Persisted in localStorage so
        // the choice survives reloads. Mirrored to:
        //   - window.strategyLabIncludeGrey (live orchestrator reads it)
        //   - window.autoTestRunner._strategyLabIncludeGrey (Auto Test
        //     runner reads it, set lazily before runAll if available).
        // Default is true (include grey).
        const greyToggle = document.getElementById('strategyLabGreyToggle');
        if (greyToggle) {
            try {
                const saved = localStorage.getItem('strategyLab.includeGrey');
                if (saved === '0') greyToggle.checked = false;
                else if (saved === '1') greyToggle.checked = true;
            } catch (_) { /* ignore */ }
            const sync = (broadcast) => {
                const v = !!greyToggle.checked;
                if (typeof window !== 'undefined') {
                    window.strategyLabIncludeGrey = v;
                    if (window.autoTestRunner) {
                        window.autoTestRunner._strategyLabIncludeGrey = v;
                    }
                }
                try { localStorage.setItem('strategyLab.includeGrey', v ? '1' : '0'); } catch (_) {}
                if (broadcast) {
                    try {
                        window.dispatchEvent(new CustomEvent('strategyLabIncludeGreyChanged', { detail: { value: v } }));
                    } catch (_) {}
                }
            };
            sync(false); // Initial mirror — no broadcast on first paint.
            greyToggle.addEventListener('change', () => sync(true));
            // Listen for sibling checkboxes (Auto Test params, wheel
            // panel) so all mirrored UIs stay coherent.
            window.addEventListener('strategyLabIncludeGreyChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (greyToggle.checked !== v) greyToggle.checked = v;
            });
        }

        // GBM model toggle removed — Test Lab uses the marginal scorer.
        // Force flags off so any leftover localStorage value is ignored.
        if (typeof window !== 'undefined') {
            window.testLabUseModel        = false;
            window.testLabMarginThreshold = 0;
            try { localStorage.removeItem('testLab.useModel'); } catch (_) {}
            try { localStorage.removeItem('testLab.marginThreshold'); } catch (_) {}
        }

        if (trainBtn) {
            // Click is now routed through the training-mode router.
            // For 'user-mode' (default) the router invokes startTraining()
            // unchanged, preserving every legacy code path.
            trainBtn.addEventListener('click', () => this.runSelectedTraining());
        }

        const trainingModeSel = document.getElementById('trainingModeSelect');
        if (trainingModeSel) {
            trainingModeSel.value = this.selectedTrainingMode;
            trainingModeSel.addEventListener('change', () => {
                const allowed = ['default', 'user-mode', 'ai-mode', 'hybrid-mode'];
                const v = trainingModeSel.value;
                if (allowed.indexOf(v) !== -1) {
                    this.selectedTrainingMode = v;
                    // Mode-isolation contract: switching the TRAIN-mode
                    // selector wipes any AI-trained controller state so a
                    // future training pipeline cannot piggyback on stale
                    // counters from a different mode. Idempotent and
                    // engine-untouching (Phase 2 invariants preserved).
                    this._resetAITrainedIsolation();
                } else {
                    // Reject unknown values; restore the dropdown to the
                    // current state to avoid silent drift.
                    trainingModeSel.value = this.selectedTrainingMode;
                }
            });
        }

        const v2Toggle = document.getElementById('aiV2Toggle');
        if (v2Toggle) {
            v2Toggle.addEventListener('change', (e) => {
                const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);
                if (engine) {
                    engine.setLearningVersion(e.target.checked ? 'v2' : 'v1');
                    const versionLabel = e.target.checked ? 'v2 (Bayesian AI)' : 'v1 (Static)';
                    console.log(`🧠 AI version switched to ${versionLabel}`);
                }
            });
        }
    }

    /**
     * Set mode: 'manual', 'semi', or 'auto'.
     * Replaces the old toggleMode() — supports 3-way switching.
     */
    setMode(mode) {
        const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);
        const semiFilter = typeof window !== 'undefined' ? window.semiAutoFilter : null;

        if (mode === 'ai-trained') {
            // AI-trained live mode. Does NOT use the heuristic engine
            // or user-defined pairs. Every live spin is routed through
            // window.aiTrainedController.decide() by the orchestrator.
            // The heuristic engine is explicitly left disabled so its
            // session counters and retrain logic cannot be mutated by
            // the AI-trained path.
            this.currentMode = 'ai-trained';
            this.isAutoMode = true;       // orchestrator runs in auto-tick loop
            this.isSemiAutoMode = false;
            if (engine) engine.disable();
            if (semiFilter) semiFilter.disable();

            // Roll back any 'auto'-mode parity tweaks (Auto-Test pnl
            // flag + retrain-interval pins). Safe to call whether or
            // not 'auto' was previously selected.
            this._restoreAutoParity(engine);

            // Lazily create the controller singleton.
            if (typeof window !== 'undefined' && !window.aiTrainedController) {
                const Ctor = (typeof AITrainedController !== 'undefined')
                    ? AITrainedController
                    : (window.AITrainedController || null);
                if (Ctor) window.aiTrainedController = new Ctor();
            }

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(true);
                if (typeof window.autoUpdateOrchestrator.setDecisionMode === 'function') {
                    window.autoUpdateOrchestrator.setDecisionMode('ai-trained');
                }
            }

        } else if (mode === 'analytics') {
            // Analytics (T2 × T3 consensus). Mirrors the AI-trained
            // wiring: the heuristic engine is DISABLED (analytics only
            // uses the engine's deterministic projection helpers, never
            // engine.decide()), so the money panel's "engine decided
            // SKIP" guard (which blocks bets when the engine is enabled
            // and lastDecision is null) is bypassed and analytics' own
            // BET/SKIP is authoritative. No training gate — the projection
            // helpers are deterministic from spin history.
            this.currentMode = 'analytics';
            this.isAutoMode = true;
            this.isSemiAutoMode = false;
            if (engine) engine.disable();
            if (semiFilter) semiFilter.disable();
            this._restoreAutoParity(engine);
            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(true);
                if (typeof window.autoUpdateOrchestrator.setDecisionMode === 'function') {
                    window.autoUpdateOrchestrator.setDecisionMode('analytics');
                }
            }

        } else if (mode === 'auto' || mode === 't1-strategy' || mode === 'test' || mode === '3t-selection') {
            // Switching to an engine-driven live mode — requires trained
            // engine. Both 'auto' and 't1-strategy' share the engine-
            // enable + orchestrator auto-on plumbing; the only
            // difference is which decision function the orchestrator
            // calls per-spin (see setDecisionMode below).
            if (!engine || !engine.isTrained) {
                console.warn(`⚠️ Cannot switch to ${mode.toUpperCase()} — engine not trained`);
                this._showTrainingStatusBar(true);
                this.updateTrainingProgress(0, '⚠️ Train first! Click 🎓 TRAIN to load data');
                this._flashTrainButton();
                return;
            }

            this.currentMode = mode;
            this.isAutoMode = true;         // engine-driven live decisions
            this.isSemiAutoMode = false;
            engine.enable();
            if (semiFilter) semiFilter.disable();

            // ── AUTO-mode parity with Auto Test runner ──
            // Only applies to mode === 'auto'. T1-strategy branch is
            // explicitly NOT touched (per backlog rule "do not touch
            // T1-strategy in this task"). For AUTO we align the live
            // engine state with what the Auto Test runner sets up per
            // session (see app/auto-test-runner.js:143-151):
            //   1. engine.resetSession()  — zero out accumulated
            //      session.consecutiveSkips / sessionWinRate /
            //      pairFilterCross so _computeConfidence starts from
            //      a clean slate, matching the runner's pre-session
            //      reset.
            //   2. Save + disable retrain triggers. Runner freezes
            //      the model for the whole backtest; live was
            //      leaving them active, so the model could mutate
            //      mid-session and produce divergent decisions.
            //   3. Tell moneyPanel to use Auto-Test-parity pnl math
            //      for the upcoming session (flag-gated so Manual /
            //      Semi / T1 are byte-for-byte unchanged).
            if (mode === 'auto') {
                try {
                    engine.resetSession();
                    if (this._savedRetrainInterval === undefined) {
                        this._savedRetrainInterval = engine._retrainInterval;
                        this._savedRetrainLossStreak = engine._retrainLossStreak;
                    }
                    engine._retrainInterval = Infinity;
                    engine._retrainLossStreak = Infinity;
                } catch (_) { /* best-effort */ }
                const mp = (typeof window !== 'undefined') ? window.moneyPanel : null;
                if (mp) mp._useAutoTestPnl = true;
            }

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(true);
                // Tell the orchestrator WHICH decision policy to use
                // per-spin. Falls through harmlessly if setDecisionMode
                // is not present (older orchestrator build).
                if (typeof window.autoUpdateOrchestrator.setDecisionMode === 'function') {
                    // Map UI mode → orchestrator decisionMode. 't1-strategy',
                    // 'test' (Strategy-Lab sandbox) and '3t-selection'
                    // (production copy) each have their own decision branch
                    // in the orchestrator. Everything else falls through
                    // to 'auto'.
                    let decisionMode;
                    if (mode === 't1-strategy')      decisionMode = 't1-strategy';
                    else if (mode === 'test')        decisionMode = 'test';
                    else if (mode === '3t-selection') decisionMode = '3t-selection';
                    else if (mode === 'analytics')   decisionMode = 'analytics';
                    else                             decisionMode = 'auto';
                    window.autoUpdateOrchestrator.setDecisionMode(decisionMode);
                }
            }

        } else if (mode === 'semi') {
            // Switching to SEMI-AUTO — user picks pair, system picks filter
            this.currentMode = 'semi';
            this.isAutoMode = false;
            this.isSemiAutoMode = true;
            if (engine) engine.disable();
            if (semiFilter) semiFilter.enable();

            this._restoreAutoParity(engine);

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(false);
                // Reset the decision-mode flag so a future AUTO
                // re-selection picks the default (non-T1) path.
                if (typeof window.autoUpdateOrchestrator.setDecisionMode === 'function') {
                    window.autoUpdateOrchestrator.setDecisionMode('auto');
                }
            }

        } else {
            // Switching to MANUAL
            this.currentMode = 'manual';
            this.isAutoMode = false;
            this.isSemiAutoMode = false;
            if (engine) engine.disable();
            if (semiFilter) semiFilter.disable();

            this._restoreAutoParity(engine);

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(false);
                if (typeof window.autoUpdateOrchestrator.setDecisionMode === 'function') {
                    window.autoUpdateOrchestrator.setDecisionMode('auto');
                }
            }
        }

        // ── Disable User-Friendly on any mode change ──
        // UF is its own overlay (T1/T2/T3 sub-row injected at runtime).
        // It stays "enabled" across mode switches unless we explicitly
        // tear it down — which left a Manual mode session still
        // auto-stamping bets and showing the UF status pill. Disable
        // it here so switching modes always lands in a clean state;
        // the user re-enables by clicking T1/T2/T3 again.
        try {
            if (typeof window !== 'undefined'
             && window.userFriendlyTrigger
             && window.userFriendlyTrigger.enabled
             && typeof window.userFriendlyTrigger.disable === 'function') {
                window.userFriendlyTrigger.disable();
            }
        } catch (_) { /* defensive — never block setMode */ }

        // Auto-sync the visible tab to the tab that owns the new mode so
        // a programmatic setMode() (or sub-button click) keeps the UI
        // coherent without requiring the user to also click a tab.
        this._setActiveTab(this._tabForMode(this.currentMode));
        this._updateModeButtons();
        // SEMI and MANUAL show pair selection; engine-driven modes
        // (AUTO, T1-strategy, AI-trained) hide it — the system picks
        // the numbers and user-defined pairs are not used.
        const engineDriven = (
            this.currentMode === 'auto' ||
            this.currentMode === 't1-strategy' ||
            this.currentMode === 'ai-trained' ||
            this.currentMode === 'test' ||
            this.currentMode === '3t-selection'
        );
        this.togglePairSelection(!engineDriven);

        // Phase 2 — let the AI Prediction Panel react to a Test-Lab
        // entry/exit so it can hide/show T3 and run the autopilot
        // without waiting for the next spin.
        try { if (window.aiPanel && typeof window.aiPanel.refreshTestLabUI === 'function') window.aiPanel.refreshTestLabUI(); } catch (_) { /* swallow */ }

        const statusDiv = document.getElementById('autoModeStatus');
        if (statusDiv) {
            statusDiv.style.display = this.isAutoMode ? 'block' : 'none';
        }

        console.log(`🔄 Mode switched to ${this.currentMode.toUpperCase()}`);
    }

    /**
     * Roll back the AUTO-mode parity tweaks applied on setMode('auto').
     * Idempotent — safe to call from any non-AUTO path. Restores the
     * engine's saved retrain intervals and clears the moneyPanel's
     * Auto-Test-parity pnl flag so Manual / Semi / T1-strategy see the
     * original behaviour.
     */
    _restoreAutoParity(engine) {
        if (engine && this._savedRetrainInterval !== undefined) {
            try {
                engine._retrainInterval = this._savedRetrainInterval;
                engine._retrainLossStreak = this._savedRetrainLossStreak;
            } catch (_) { /* best-effort */ }
            this._savedRetrainInterval = undefined;
            this._savedRetrainLossStreak = undefined;
        }
        const mp = (typeof window !== 'undefined') ? window.moneyPanel : null;
        if (mp) mp._useAutoTestPnl = false;
    }

    /**
     * Legacy toggle for backward compat — delegates to setMode.
     */
    toggleMode() {
        if (this.isAutoMode) {
            this.setMode('manual');
        } else {
            this.setMode('auto');
        }
    }

    /**
     * Map a mode value to the top-level tab that owns it.
     * Used when setMode() is called programmatically or via a sub-button
     * so the visible tab stays in sync with currentMode.
     */
    _tabForMode(mode) {
        if (mode === 'manual' || mode === 'semi' || mode === 'analytics') return 'manual';
        if (mode === 'auto' || mode === 't1-strategy' || mode === 'ai-trained' || mode === '3t-selection') return 'auto';
        if (mode === 'test') return 'test';
        return 'manual';
    }

    /**
     * Switch the visible top-level tab. Only toggles which sub-buttons
     * are shown and the tab-button highlight; does NOT change currentMode.
     * Tab='test' shows the single test sub-button (informational only —
     * the tab click itself sets mode='test' for that case).
     */
    _setActiveTab(tab) {
        const allowed = ['manual', 'auto', 'test'];
        if (allowed.indexOf(tab) === -1) tab = 'manual';

        // ── Disable User-Friendly when leaving the Auto tab ──
        // The USER-FRIENDLY sub-button + panel live in data-tab-group=
        // "auto". When the user clicks Manual or Test up top, the sub-
        // row visibility flips but UF would otherwise stay armed in
        // the background (still listening for spins, still stamping
        // bets via the interceptors). Tear it down here so UF only
        // runs while the Auto tab is the visible one. The user
        // re-arms by switching back to Auto + clicking 🤝 USER-FRIENDLY.
        const leavingAuto = (this.activeTab === 'auto' && tab !== 'auto');
        if (leavingAuto) {
            try {
                if (typeof window !== 'undefined'
                 && window.userFriendlyTrigger
                 && window.userFriendlyTrigger.enabled
                 && typeof window.userFriendlyTrigger.disable === 'function') {
                    window.userFriendlyTrigger.disable();
                }
            } catch (_) { /* defensive — never block tab switch */ }
        }

        this.activeTab = tab;

        // Tab highlight: blue accent for whichever tab is active.
        const TAB_ACCENT = { manual: '#3b82f6', auto: '#22c55e', test: '#14b8a6' };
        ['manualTabBtn', 'autoTabBtn', 'testTabBtn'].forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const t = btn.getAttribute('data-tab');
            const accent = TAB_ACCENT[t] || '#3b82f6';
            const active = (t === tab);
            btn.style.background  = active ? accent : 'transparent';
            btn.style.color       = active ? 'white' : '#94a3b8';
            btn.style.borderColor = active ? accent : '#64748b';
        });

        // Sub-row visibility: show only the buttons whose data-tab-group
        // matches the active tab.
        const subButtons = document.querySelectorAll('#modeSubRow [data-tab-group]');
        subButtons.forEach((el) => {
            el.style.display = (el.getAttribute('data-tab-group') === tab) ? '' : 'none';
        });
    }

    _updateModeButtons() {
        const manualBtn = document.getElementById('manualModeBtn');
        const semiBtn = document.getElementById('semiAutoModeBtn');
        const autoBtn = document.getElementById('autoModeBtn');

        const mode = this.currentMode;

        if (manualBtn) {
            manualBtn.style.background = mode === 'manual' ? '#3b82f6' : 'transparent';
            manualBtn.style.color = mode === 'manual' ? 'white' : '#94a3b8';
            manualBtn.style.borderColor = mode === 'manual' ? '#3b82f6' : '#64748b';
        }

        if (semiBtn) {
            semiBtn.style.background = mode === 'semi' ? '#f97316' : 'transparent';
            semiBtn.style.color = mode === 'semi' ? 'white' : '#94a3b8';
            semiBtn.style.borderColor = mode === 'semi' ? '#f97316' : '#64748b';
        }

        if (autoBtn) {
            autoBtn.style.background = mode === 'auto' ? '#22c55e' : 'transparent';
            autoBtn.style.color = mode === 'auto' ? 'white' : '#94a3b8';
            autoBtn.style.borderColor = mode === 'auto' ? '#22c55e' : '#64748b';
        }

        const t1Btn = document.getElementById('t1StrategyModeBtn');
        if (t1Btn) {
            // Use a distinct indigo to visually separate from AUTO's green.
            t1Btn.style.background = mode === 't1-strategy' ? '#6366f1' : 'transparent';
            t1Btn.style.color = mode === 't1-strategy' ? 'white' : '#94a3b8';
            t1Btn.style.borderColor = mode === 't1-strategy' ? '#6366f1' : '#64748b';
        }

        const aiTrainedBtn = document.getElementById('aiTrainedModeBtn');
        if (aiTrainedBtn) {
            // Magenta accent — distinct from AUTO (green) and T1 (indigo).
            aiTrainedBtn.style.background = mode === 'ai-trained' ? '#a855f7' : 'transparent';
            aiTrainedBtn.style.color = mode === 'ai-trained' ? 'white' : '#94a3b8';
            aiTrainedBtn.style.borderColor = mode === 'ai-trained' ? '#a855f7' : '#64748b';
        }

        const threeTBtn = document.getElementById('threeTSelectionModeBtn');
        if (threeTBtn) {
            // Sky blue accent — distinct from AI-trained (magenta) /
            // Test-Lab (teal). 3T-Selection is the production sibling.
            threeTBtn.style.background = mode === '3t-selection' ? '#0ea5e9' : 'transparent';
            threeTBtn.style.color = mode === '3t-selection' ? 'white' : '#94a3b8';
            threeTBtn.style.borderColor = mode === '3t-selection' ? '#0ea5e9' : '#64748b';
        }

        const analyticsBtn = document.getElementById('analyticsModeBtn');
        if (analyticsBtn) {
            // Cyan accent for the Analytics consensus mode.
            analyticsBtn.style.background = mode === 'analytics' ? '#0ea5e9' : 'transparent';
            analyticsBtn.style.color = mode === 'analytics' ? 'white' : '#94a3b8';
            analyticsBtn.style.borderColor = mode === 'analytics' ? '#0ea5e9' : '#64748b';
        }

        const testLabBtn = document.getElementById('testLabModeBtn');
        if (testLabBtn) {
            // Teal accent — distinct from all other modes; signals sandbox.
            testLabBtn.style.background = mode === 'test' ? '#14b8a6' : 'transparent';
            testLabBtn.style.color = mode === 'test' ? 'white' : '#94a3b8';
            testLabBtn.style.borderColor = mode === 'test' ? '#14b8a6' : '#64748b';
        }
    }

    /**
     * Trigger training on historical data files.
     */
    async startTraining() {
        const loader = this.dataLoader || (typeof window !== 'undefined' ? window.aiDataLoader : null);
        const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);

        if (!loader || !engine) {
            console.error('❌ Data loader or engine not available');
            return;
        }

        // Show training status bar (always visible, regardless of mode)
        this._showTrainingStatusBar(true);
        this.updateTrainingProgress(0, 'Loading data files...');

        try {
            let files = [];

            // Try IPC first (Electron)
            if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.loadHistoricalData === 'function') {
                const result = await window.aiAPI.loadHistoricalData();
                if (result && result.files) {
                    files = result.files;
                }
            }

            if (files.length === 0) {
                this.updateTrainingProgress(0, 'No data files found in app/data/');
                console.warn('⚠️ No training data files found');
                return;
            }

            this.updateTrainingProgress(20, `Parsing ${files.length} file(s)...`);

            const loadResult = loader.loadMultiple(files);

            if (loadResult.sessions.length === 0) {
                this.updateTrainingProgress(0, 'No valid sessions found');
                return;
            }

            this.updateTrainingProgress(50, `Training on ${loadResult.totalSpins} spins...`);

            // Convert sessions to plain number arrays for training
            const sessionArrays = loadResult.sessions.map(s => s.spins);
            const trainResult = engine.train(sessionArrays);

            // Wire sequence model to semi-auto filter
            if (typeof window !== 'undefined' && window.semiAutoFilter && engine.sequenceModel) {
                window.semiAutoFilter.setSequenceModel(engine.sequenceModel);
            }

            const seqNote = engine.sequenceModel && engine.sequenceModel.isTrained ? ' + sequences' : '';
            const v2Note = engine.learningVersion === 'v2' ? ' + Bayesian AI' : '';
            this.updateTrainingProgress(100, `Trained on ${trainResult.totalSpins} spins — Hit rate: ${Math.round(trainResult.overallHitRate * 100)}%${seqNote}${v2Note}`);

            this.renderStatus();

            console.log('✅ Training complete:', trainResult);

        } catch (error) {
            this.updateTrainingProgress(0, `Training error: ${error.message}`);
            console.error('❌ Training failed:', error);
        }
    }

    /**
     * Update the decision display.
     */
    updateDecisionDisplay(decision) {
        const decisionEl = document.getElementById('currentDecision');
        const skipEl = document.getElementById('skipCounter');

        // Analytics table-trace: light up the T2/T3 pair columns the
        // engine relied on (or clear when this isn't an Analytics
        // decision). Best-effort — never break the decision flow.
        try {
            if (typeof window !== 'undefined' && window.analyticsHighlight) {
                if (decision && decision.analytics) {
                    window.analyticsHighlight.apply({
                        t2Pairs: decision.analytics.t2Pairs,
                        t2Pair: decision.analytics.t2Pair,
                        t3Pairs: decision.analytics.t3Pairs,
                        isBet: decision.action === 'BET'
                    });
                } else {
                    window.analyticsHighlight.clear();
                }
            }
        } catch (_) {}

        // Cache the last Analytics decision on the AI panel so the
        // "🔬 Selection Process" popup can show how it picked the numbers
        // (alignment %, contributing T2/T3 pairs with their numbers, the
        // 12 picks, confirmation skews). Cleared when a non-analytics
        // decision arrives.
        try {
            if (typeof window !== 'undefined' && window.aiPanel) {
                if (decision && decision.analytics) {
                    window.aiPanel._lastAnalyticsDecision = Object.assign({
                        action: decision.action,
                        ts: new Date().toLocaleTimeString()
                    }, decision.analytics);
                } else {
                    window.aiPanel._lastAnalyticsDecision = null;
                }
            }
        } catch (_) {}

        if (decisionEl) {
            if (decision && decision.analytics) {
                // ── Analytics (T2 × T3 consensus): clear WHY explanation ──
                // Renders the alignment, the T2/T3 pairs the engine relied
                // on, the +/- and 0/19 confirmation, and the proposed
                // numbers — so the AI tab explains every pick.
                const a = decision.analytics;
                const isBet = decision.action === 'BET';
                const t3 = (a.t3Pairs && a.t3Pairs.length) ? a.t3Pairs.join(', ') : '—';
                const t2 = a.t2Pair || '—';
                const align = Math.round((a.align || 0) * 100);
                const conf = Math.round(a.confidence || 0);
                const nums = (a.pickNums || []).slice().sort((x, y) => x - y).join(', ');
                const cf = a.confirm || {};
                const pn = cf.pnLabel ? `${cf.pnLabel} ${Math.max(cf.pos, cf.neg)}/${cf.total}` : '—';
                const z19 = cf.z19Label ? `${cf.z19Label} ${Math.max(cf.zero, cf.nine)}/${cf.total}` : '—';
                const thr = Math.round((a.alignThreshold || 0.6) * 100);
                decisionEl.style.color = isBet ? '#22c55e' : '#f59e0b';
                decisionEl.innerHTML =
                    `<div style="font-weight:800;font-size:13px;">${isBet ? '🟢 ANALYTICS — BET' : '🔴 ANALYTICS — WAIT'}</div>`
                    // Plain-English sentence first, so the user understands instantly.
                    + `<div style="font-size:11px;margin:3px 0;color:#e2e8f0;line-height:1.35;">${a.summary || decision.reason || ''}</div>`
                    // Then the numeric breakdown.
                    + `<div style="font-size:10px;color:#94a3b8;">`
                    + `T2×T3 agreement: <b style="color:${isBet ? '#22c55e' : '#f59e0b'};">${align}%</b> (need ${thr}%) `
                    + `· confidence <b>${conf}%</b><br>`
                    + `Relied on → <b>T2 pair:</b> ${t2} &nbsp; <b>T3 pairs:</b> ${t3}<br>`
                    + `Confirmation → colour/side ${pn} · 0/19 ${z19}`
                    + (isBet ? `<br><b>${(a.pickNums || []).length} numbers:</b> ${nums}` : '')
                    + `</div>`;
            } else if (decision.action === 'BET') {
                decisionEl.textContent = `🎯 ${decision.selectedPair} | ${decision.selectedFilter} | Conf: ${decision.confidence}%`;
                decisionEl.style.color = '#22c55e';
            } else {
                decisionEl.textContent = `⏭️ SKIP — ${decision.reason}`;
                decisionEl.style.color = '#f59e0b';
            }
        }

        if (skipEl) {
            const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);
            const skips = engine ? engine.session.consecutiveSkips : 0;
            const max = engine ? engine.maxConsecutiveSkips : 5;
            skipEl.textContent = `Skips: ${skips}/${max}`;
        }

        // Forward the AI-trained envelope (if any) to the AI-mode tab.
        // The orchestrator attaches `decision.aiTrained` when the live
        // decisionMode is 'ai-trained' — see app/auto-update-orchestrator.js.
        // Non-AI-trained modes do not set this field, so the AI-mode
        // tab is never touched from manual / semi / auto / T1 paths.
        if (decision && decision.aiTrained
                && typeof window !== 'undefined'
                && window.aiModeTab
                && typeof window.aiModeTab.render === 'function') {
            try { window.aiModeTab.render(decision.aiTrained); }
            catch (_) { /* render is best-effort; never break the decision flow */ }
        }
    }

    /**
     * Update training progress bar.
     */
    updateTrainingProgress(percent, message) {
        const progressDiv = document.getElementById('trainingProgress');
        const fillDiv = document.getElementById('trainingProgressFill');
        const textDiv = document.getElementById('trainingProgressText');

        if (progressDiv) {
            progressDiv.style.display = percent > 0 ? 'block' : 'none';
        }
        if (fillDiv) {
            fillDiv.style.width = `${percent}%`;
        }
        if (textDiv) {
            textDiv.textContent = message || `${percent}%`;
        }

        // Update training status
        const statusEl = document.getElementById('trainingStatus');
        if (statusEl && message) {
            statusEl.textContent = message;
        }
    }

    /**
     * Render current status summary.
     */
    renderStatus() {
        const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);
        const statusEl = document.getElementById('trainingStatus');

        if (!statusEl || !engine) return;

        // Mode-aware status: surface the active TRAIN-mode (read from
        // TrainingState) alongside the engine training state, so the
        // line never falls back to a generic "Trained (N pairs)" string
        // that hides which mode is active.
        const activeMode = this._readActiveTrainingMode();
        const labels = {
            'default':     'Default mode',
            'user-mode':   'User-mode',
            'ai-mode':     'AI-mode',
            'hybrid-mode': 'Hybrid-mode'
        };
        const synopsis = (activeMode && this._trainingSynopses)
            ? this._trainingSynopses[activeMode] : null;
        const runStr = (synopsis && synopsis.runIndex)
            ? ` (run #${synopsis.runIndex})` : '';
        const activeStr = activeMode
            ? ` · active: ${labels[activeMode] || activeMode}${runStr}`
            : '';
        // Placeholder modes (anything other than 'default') do not own
        // engine weights — annotate so the user knows the engine count
        // (if any) reflects a prior Default-mode click, not the active mode.
        const placeholderStr = (activeMode && activeMode !== 'default')
            ? ' (placeholder)' : '';

        if (engine.isTrained) {
            const state = engine.getState();
            const sessionStr = state.sessionStats.totalBets > 0
                ? ` | Session: ${state.sessionStats.wins}W/${state.sessionStats.losses}L (${Math.round(state.sessionStats.sessionWinRate * 100)}%)`
                : '';
            const versionStr = engine.learningVersion === 'v2' ? ' | v2 Bayesian' : ' | v1 Static';
            statusEl.textContent = `✅ Trained (${state.pairModelCount} pairs)${activeStr}${placeholderStr}${sessionStr}${versionStr}`;
            statusEl.style.color = '#22c55e';
            this._showTrainingStatusBar(true);

            // Show v1/v2 toggle after training
            const toggleDiv = document.getElementById('aiVersionToggle');
            if (toggleDiv) toggleDiv.style.display = 'block';
        } else if (activeMode) {
            // No engine training, but a mode (likely a placeholder) was
            // clicked. Surface that explicitly so the user does not see
            // the legacy "Not trained — click TRAIN" generic line.
            statusEl.textContent = `Active mode: ${labels[activeMode] || activeMode}${runStr}${placeholderStr}`;
            statusEl.style.color = '#94a3b8';
        } else {
            statusEl.textContent = 'Not trained — click TRAIN to load data';
            statusEl.style.color = '#94a3b8';
        }
    }

    /**
     * Resolve TrainingState.getActiveMode() lazily. Returns null when
     * the registry is missing or has no active mode.
     */
    _readActiveTrainingMode() {
        let TS = null;
        if (typeof require === 'function') {
            // Step 2 cutover: prefer the new training/ folder over the
            // app/ original. Browser still loads app/ via <script> tags
            // for the window mirror; Node tests resolve through this
            // require path.
            try { TS = require('../training/training-state.js'); }
            catch (_) { /* fall through */ }
        }
        if (!TS && typeof window !== 'undefined' && window.TrainingState) {
            TS = window.TrainingState;
        }
        return (TS && typeof TS.getActiveMode === 'function') ? TS.getActiveMode() : null;
    }

    /**
     * Click handler for the TRAIN button. Routes through the
     * training-mode router (app/training-router.js). User-mode keeps
     * the legacy startTraining() path. AI-mode and hybrid-mode emit
     * status messages without touching engine.train().
     */
    async runSelectedTraining() {
        // Mode-isolation contract: every TRAIN click wipes AI-trained
        // controller state before the new training pipeline runs. This
        // prevents stale counters from a previous mode/run leaking
        // into the next mode's training. No effect on the heuristic
        // engine — Default mode still owns engine.train() exclusively.
        this._resetAITrainedIsolation();

        // Lazily monkey-patch engine.train so the synopsis can read the
        // result without modifying startTraining()'s body. Idempotent.
        this._ensureEngineTrainPatch();
        const modeAtClick = this.selectedTrainingMode;

        let routerApi = null;
        if (typeof require === 'function') {
            // Step 2 cutover: prefer the new training/ folder over the
            // app/ original. Browser still uses window.TrainingRouter
            // populated by the app/ script tag.
            try { routerApi = require('../training/training-router.js'); }
            catch (_) { /* fall through to window */ }
        }
        if (!routerApi && typeof window !== 'undefined' && window.TrainingRouter) {
            routerApi = window.TrainingRouter;
        }
        const ctx = {
            // 'default' maps to the existing legacy training pipeline.
            // 'user-mode' is now an explicit non-legacy option that does
            // NOT call engine.train() (placeholder until the user-defined
            // training pipeline lands).
            defaultModeHandler: () => this.startTraining(),
            userModeHandler:    () => this._handleUserModeTraining(),
            aiModeHandler:      () => this._handleAiModeTraining(),
            hybridModeHandler:  () => this._handleHybridModeTraining(),
            onStatus: (msg) => this.updateTrainingProgress(0, msg)
        };
        if (!routerApi || typeof routerApi.runTraining !== 'function') {
            // Defensive fallback — without the router, behave exactly as
            // before: run the legacy training pipeline.
            return ctx.defaultModeHandler();
        }
        const result = await routerApi.runTraining(this.selectedTrainingMode, ctx);
        // For Default mode the engine.train monkey-patch wrapper has
        // already published the synopsis (active mode + renderStatus +
        // progress text). The calls below are still needed for
        // placeholder modes (user/ai/hybrid) where engine.train does
        // NOT fire. They are also idempotent for Default — they just
        // re-write the same text.
        try { this._recordTrainingSynopsis(modeAtClick, result); }
        catch (_) { /* best-effort */ }

        // Overwrite the visible progress text with a mode-specific
        // single-line summary. The legacy startTraining() body already
        // wrote a generic "Trained on N spins …" line; we replace it
        // here so the user sees the active mode + run number + deltas
        // without having to expand the synopsis collapsible.
        try { this._writeTrainingProgressText(modeAtClick); }
        catch (_) { /* best-effort */ }

        return result;
    }

    /**
     * Render a single rich line into #trainingProgressText (and mirror
     * into #trainingStatus when no mode-specific text is present yet).
     * Pure UI; reads only from this._trainingSynopses[modeId].
     */
    _writeTrainingProgressText(modeId) {
        if (typeof document === 'undefined') return;
        const progressEl = document.getElementById('trainingProgressText');
        const statusEl   = document.getElementById('trainingStatus');
        if (!progressEl && !statusEl) return;

        const labels = {
            'default':     'Default mode',
            'user-mode':   'User-mode',
            'ai-mode':     'AI-mode',
            'hybrid-mode': 'Hybrid-mode'
        };
        const s = this._trainingSynopses && this._trainingSynopses[modeId];
        const fmtTime = (ts) => {
            if (!ts) return '';
            try { return new Date(ts).toLocaleTimeString(); }
            catch (_) { return ''; }
        };
        const fmtPct = (x) => (typeof x === 'number')
            ? `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`
            : '—';
        const delta = (curr, prev, suffix) => {
            if (typeof curr !== 'number' || typeof prev !== 'number') return '';
            const d = curr - prev;
            if (d === 0) return '';
            const sign = d > 0 ? '+' : '';
            return (suffix === '%')
                ? ` (${sign}${Math.round(d * 100)}%)`
                : ` (${sign}${d})`;
        };

        let line;
        if (!s) {
            line = `${labels[modeId] || modeId} · click registered`;
        } else if (s.reserved) {
            const note = (modeId === 'ai-mode')
                ? 'placeholder (controller learns live; no pre-training pipeline)'
                : 'placeholder (not implemented in this build)';
            line = `${labels[modeId]} · run #${s.runIndex || 1} · ${note} · ${fmtTime(s.trainedAt)}`;
        } else if (s.totalSpins != null || s.pairCount != null) {
            const prev = s.prev || {};
            const sessions = (s.totalSessions != null) ? `${s.totalSessions} sessions / ` : '';
            const spins    = (s.totalSpins != null) ? `${s.totalSpins.toLocaleString()} spins` : '— spins';
            const pairs    = (s.pairCount != null) ? `pairs ${s.pairCount}${delta(s.pairCount, prev.pairCount, '#')}` : '';
            const hit      = (s.hitRate != null) ? `hit ${fmtPct(s.hitRate)}${delta(s.hitRate, prev.hitRate, '%')}` : '';
            const seq      = s.sequenceModelTrained ? 'sequences ✓' : 'sequences —';
            const ver      = s.v2 ? 'v2' : 'v1';
            line = [
                `${labels[modeId]} · run #${s.runIndex || 1}`,
                `${sessions}${spins}`,
                pairs, hit, seq, ver, fmtTime(s.trainedAt)
            ].filter(Boolean).join(' · ');
        } else {
            // Default click that did not produce a result (engine stub).
            line = `${labels[modeId] || modeId} · run #${s.runIndex || 1} · training did not produce a result · ${fmtTime(s.trainedAt)}`;
        }

        if (progressEl) progressEl.textContent = line;
        // Mirror policy:
        //   - Placeholder modes (user/ai/hybrid): always overwrite the
        //     status field so prior Default-mode text never leaks
        //     through when the user switches modes.
        //   - Default mode: only mirror when status doesn't already
        //     carry the "Default mode" label, so the richer
        //     active-mode-aware renderStatus() line wins.
        if (statusEl) {
            const isPlaceholder = (modeId !== 'default');
            const labelMissing = (!statusEl.textContent || statusEl.textContent.indexOf(labels[modeId]) === -1);
            if (isPlaceholder || labelMissing) {
                statusEl.textContent = line;
            }
        }
    }

    /**
     * Lazily monkey-patch engine.train so the synopsis can read its
     * return value without modifying startTraining()'s body. Idempotent.
     */
    _ensureEngineTrainPatch() {
        const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);
        if (!engine || engine._aiSynopsisPatched) return;
        if (typeof engine.train !== 'function') return;
        // Do NOT wrap jest spies / mocks — replacing them breaks
        // toHaveBeenCalled assertions in test stubs. The synopsis is a
        // best-effort UI feature; missing train results are tolerated.
        if (engine.train && (engine.train.mock || engine.train._isMockFunction)) return;
        const orig = engine.train.bind(engine);
        const self = this;
        engine.train = function (...args) {
            const r = orig(...args);
            // Capture phase — never throws; minimal best-effort writes
            // onto the engine for downstream readers.
            try {
                engine._lastTrainResult = r;
                engine._lastTrainAt = Date.now();
                engine._lastTrainSessionCount = Array.isArray(args[0]) ? args[0].length : null;
            } catch (_) { /* best-effort */ }
            // Publication phase — moves the synopsis write here so the
            // visible banner cannot be skipped by a downstream throw in
            // startTraining() / runSelectedTraining(). Wrapped in a wide
            // try/catch; the catch is a true no-op.
            try {
                let TS = null;
                if (typeof require === 'function') {
                    // Step 2 cutover: prefer the new training/ folder.
                    try { TS = require('../training/training-state.js'); }
                    catch (_) { /* fall through */ }
                }
                if (!TS && typeof window !== 'undefined' && window.TrainingState) {
                    TS = window.TrainingState;
                }
                if (TS && typeof TS.getActiveMode === 'function'
                        && typeof TS.setActiveMode === 'function'
                        && !TS.getActiveMode()) {
                    // Only mark default active when no mode is set yet —
                    // never override a placeholder mode that may have
                    // been recorded by its handler.
                    TS.setActiveMode('default');
                }
                if (typeof self._recordTrainingSynopsis === 'function') {
                    self._recordTrainingSynopsis('default', { ok: true, ranEngineTrain: true });
                }
                if (typeof self.renderStatus === 'function') {
                    self.renderStatus();
                }
                if (typeof self._writeTrainingProgressText === 'function') {
                    self._writeTrainingProgressText('default');
                }
            } catch (_) { /* best-effort — never block engine.train */ }
            return r;
        };
        engine._aiSynopsisPatched = true;
    }

    /**
     * Capture a per-mode synopsis after a TRAIN click. Default-mode
     * pulls real numbers from engine.train's captured result; placeholder
     * modes (User-mode / AI-mode / Hybrid-mode) record only the click
     * event since they don't yet have a training pipeline.
     */
    _recordTrainingSynopsis(modeId, routerResult) {
        if (!modeId || !this._trainingSynopses.hasOwnProperty(modeId)) return;
        const prev = this._trainingSynopses[modeId];
        const okFromRouter = !!(routerResult && routerResult.ok);

        if (modeId === 'default') {
            const engine = this.engine || (typeof window !== 'undefined' ? window.aiAutoEngine : null);
            const tr = engine && engine._lastTrainResult;
            if (engine && tr) {
                const pairCount = (tr.pairCount != null) ? tr.pairCount
                    : (typeof engine.getState === 'function'
                        ? (engine.getState().pairModelCount || 0)
                        : null);
                const hitRate = (typeof tr.overallHitRate === 'number') ? tr.overallHitRate : null;
                this._trainingSynopses[modeId] = {
                    trainedAt: engine._lastTrainAt || Date.now(),
                    totalSpins: tr.totalSpins != null ? tr.totalSpins : null,
                    totalSessions: engine._lastTrainSessionCount,
                    pairCount,
                    hitRate,
                    sequenceModelTrained: !!(engine.sequenceModel && engine.sequenceModel.isTrained),
                    v2: engine.learningVersion === 'v2',
                    runIndex: (prev && typeof prev.runIndex === 'number') ? prev.runIndex + 1 : 1,
                    prev: prev ? {
                        pairCount: prev.pairCount,
                        hitRate: prev.hitRate,
                        totalSpins: prev.totalSpins
                    } : null
                };
            } else {
                // Default click that did not actually train (engine stub
                // in tests, or training error). Always advance the run
                // counter so repeated clicks remain distinguishable.
                this._trainingSynopses[modeId] = {
                    trainedAt: Date.now(),
                    reserved: false,
                    ok: okFromRouter,
                    runIndex: (prev && typeof prev.runIndex === 'number') ? prev.runIndex + 1 : 1
                };
            }
        } else {
            // Placeholder modes — record the click only.
            this._trainingSynopses[modeId] = {
                trainedAt: Date.now(),
                reserved: true,
                ok: okFromRouter,
                runIndex: (prev && typeof prev.runIndex === 'number') ? prev.runIndex + 1 : 1
            };
        }

        try { this._renderTrainingSynopses(); }
        catch (_) { /* best-effort */ }
    }

    _renderTrainingSynopses() {
        if (typeof document === 'undefined') return;
        const cards = document.getElementById('trainingSynopsisCards');
        const counter = document.getElementById('trainingSynopsisCounter');
        if (!cards) return;

        const labels = {
            'default':     'Default mode',
            'user-mode':   'User-mode',
            'ai-mode':     'AI-mode',
            'hybrid-mode': 'Hybrid-mode'
        };
        const order = ['default', 'user-mode', 'ai-mode', 'hybrid-mode'];

        const fmtTime = (ts) => {
            if (!ts) return '—';
            try {
                const d = new Date(ts);
                return d.toLocaleTimeString();
            } catch (_) { return '—'; }
        };
        const fmtPct = (x) => (typeof x === 'number')
            ? `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`
            : '—';
        const delta = (curr, prev, suffix) => {
            if (typeof curr !== 'number' || typeof prev !== 'number') return '';
            const d = curr - prev;
            if (d === 0) return '';
            const sign = d > 0 ? '+' : '';
            const v = (suffix === '%') ? `${sign}${Math.round(d * 100)}%` : `${sign}${d}`;
            const color = d > 0 ? '#86efac' : '#fca5a5';
            return ` <span style="color:${color}">(${v})</span>`;
        };

        let trainedCount = 0;
        const html = order.map(id => {
            const s = this._trainingSynopses[id];
            const isActive = (this.selectedTrainingMode === id);
            const ring = isActive ? '#a855f7' : '#334155';

            if (!s) {
                return `<div data-mode="${id}" style="border:1px solid ${ring};border-radius:4px;padding:6px 8px;background:#1e293b;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                        <span style="font-weight:700;color:#cbd5e1;font-size:10px;">${labels[id]}</span>
                        <span style="margin-left:auto;font-size:9px;color:#64748b;">never trained</span>
                    </div>
                    <div style="font-size:9px;color:#64748b;">—</div>
                </div>`;
            }
            trainedCount++;
            if (s.reserved) {
                return `<div data-mode="${id}" style="border:1px solid ${ring};border-radius:4px;padding:6px 8px;background:#1e293b;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                        <span style="font-weight:700;color:#cbd5e1;font-size:10px;">${labels[id]}</span>
                        <span style="margin-left:auto;font-size:9px;color:#fbbf24;">reserved (no pipeline yet)</span>
                    </div>
                    <div style="font-size:9px;color:#94a3b8;">click #${s.runIndex} • ${fmtTime(s.trainedAt)}</div>
                </div>`;
            }
            // Default-mode card with real training data.
            const prev = s.prev || {};
            const seqNote = s.sequenceModelTrained ? '✓' : '—';
            const v2Note = s.v2 ? 'v2' : 'v1';
            return `<div data-mode="${id}" style="border:1px solid ${ring};border-radius:4px;padding:6px 8px;background:#1e293b;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                    <span style="font-weight:700;color:#cbd5e1;font-size:10px;">${labels[id]}</span>
                    <span style="margin-left:auto;font-size:9px;color:#94a3b8;">run #${s.runIndex} • ${fmtTime(s.trainedAt)}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px 8px;font-size:9px;color:#cbd5e1;">
                    <span>spins: <strong>${s.totalSpins != null ? s.totalSpins.toLocaleString() : '—'}</strong>${delta(s.totalSpins, prev.totalSpins, '#')}</span>
                    <span>sessions: <strong>${s.totalSessions != null ? s.totalSessions : '—'}</strong></span>
                    <span>pairs: <strong>${s.pairCount != null ? s.pairCount : '—'}</strong>${delta(s.pairCount, prev.pairCount, '#')}</span>
                    <span>hit rate: <strong>${fmtPct(s.hitRate)}</strong>${delta(s.hitRate, prev.hitRate, '%')}</span>
                    <span>sequences: <strong>${seqNote}</strong></span>
                    <span>learning: <strong>${v2Note}</strong></span>
                </div>
            </div>`;
        }).join('');

        cards.innerHTML = html;
        if (counter) counter.textContent = `${trainedCount}/4 trained`;
    }

    /**
     * Wipe AI-trained controller state across both ownership scopes:
     *   - the live singleton (window.aiTrainedController)
     *   - the Auto Test strategy module's per-engine WeakMap cache
     * Engine session counters are NOT touched.
     */
    _resetAITrainedIsolation() {
        // Strategy cache (Auto Test side).
        let strategyMod = null;
        if (typeof require === 'function') {
            // Step 6 cutover: prefer the new strategies/ai-trained/ folder
            // so the WeakMap we wipe here is the SAME WeakMap the runner
            // (also cut over in Step 5) reads from. Without this, TRAIN-mode
            // changes would silently fail to clear the runner's cache.
            try { strategyMod = require('../strategies/ai-trained/ai-trained-strategy.js'); }
            catch (_) { /* fall through */ }
        }
        if (!strategyMod && typeof window !== 'undefined' && window.AITrainedStrategyAPI) {
            strategyMod = window.AITrainedStrategyAPI;
        }
        if (strategyMod && typeof strategyMod.resetAITrainedStrategyAll === 'function') {
            try { strategyMod.resetAITrainedStrategyAll(); } catch (_) { /* best-effort */ }
        }
        // Live singleton (live AI-mode tab + orchestrator feedback path).
        if (typeof window !== 'undefined'
                && window.aiTrainedController
                && typeof window.aiTrainedController.resetSession === 'function') {
            try { window.aiTrainedController.resetSession(); } catch (_) { /* best-effort */ }
        }
    }

    /**
     * User-mode TRAIN handler — placeholder. Reserved for the future
     * user-defined training pipeline. Never falls back to the legacy
     * (Default-mode) pipeline; users must select Default-mode explicitly
     * if they want engine.train() to run.
     */
    _handleUserModeTraining() {
        this._showTrainingStatusBar(true);
        // Same rationale as the AI-mode / Hybrid-mode handlers — do not
        // call renderStatus(); it would overwrite this message with the
        // legacy "Not trained — click TRAIN" string.
        this.updateTrainingProgress(
            0,
            'User-mode training not yet implemented in this build'
        );
        return { mode: 'user-mode', skipped: true };
    }

    /**
     * AI-mode TRAIN handler — Phase 1 of the router.
     * AI-trained learns live (Phase 1/2 controller). No pre-training
     * pipeline runs here; we never call engine.train(). Status only.
     */
    _handleAiModeTraining() {
        this._showTrainingStatusBar(true);
        // Do NOT call renderStatus() here: it would overwrite this
        // message with the engine.isTrained text (and the engine has
        // intentionally not been trained on the AI-mode router path).
        this.updateTrainingProgress(
            100,
            'AI-mode: AI-trained learns live — no pre-training required'
        );
        return { mode: 'ai-mode', skipped: true };
    }

    /**
     * Hybrid-mode TRAIN handler — placeholder. Never silently falls back
     * to user-mode; reports the not-implemented status so the user knows
     * to switch modes explicitly.
     */
    _handleHybridModeTraining() {
        this._showTrainingStatusBar(true);
        // Same rationale as _handleAiModeTraining for skipping renderStatus().
        this.updateTrainingProgress(
            0,
            'Hybrid-mode training not yet implemented in this build'
        );
        return { mode: 'hybrid-mode', skipped: true };
    }

    /**
     * Flash the TRAIN button to draw attention.
     */
    _flashTrainButton() {
        const trainBtn = document.getElementById('trainBtn');
        if (!trainBtn) return;

        const original = trainBtn.style.cssText;
        let count = 0;
        const flash = setInterval(() => {
            trainBtn.style.background = count % 2 === 0 ? '#ef4444' : '#f59e0b';
            trainBtn.style.color = count % 2 === 0 ? 'white' : '#000';
            count++;
            if (count >= 6) {
                clearInterval(flash);
                trainBtn.style.background = '#f59e0b';
                trainBtn.style.color = '#000';
            }
        }, 200);
    }

    /**
     * Show/hide the training status bar.
     * This bar is always visible during and after training, regardless of mode.
     */
    _showTrainingStatusBar(visible) {
        const bar = document.getElementById('trainingStatusBar');
        if (bar) {
            bar.style.display = visible ? 'block' : 'none';
        }
    }

    /**
     * Show/hide the manual pair selection sections.
     */
    togglePairSelection(showManual) {
        const sections = document.querySelectorAll('.table-selection-section');
        sections.forEach(section => {
            section.style.display = showManual ? 'block' : 'none';
        });
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIAutoModeUI };
}
if (typeof window !== 'undefined') {
    // Create instances
    window.aiDataLoader = new (typeof AIDataLoader !== 'undefined' ? AIDataLoader : class {})();
    window.aiAutoEngine = new (typeof AIAutoEngine !== 'undefined' ? AIAutoEngine : class {})();

    // Create UI after DOM loaded
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.aiAutoModeUI = new AIAutoModeUI();
            window.aiAutoModeUI.engine = window.aiAutoEngine;
            window.aiAutoModeUI.dataLoader = window.aiDataLoader;
            console.log('✅ AI Auto Mode UI active');
        }, 500); // After AI panel creates its elements
    });
}

console.log('✅ AI Auto Mode UI script loaded');
