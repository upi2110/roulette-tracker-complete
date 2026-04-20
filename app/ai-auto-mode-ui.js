/**
 * AI Auto Mode UI — Toggle, training, status display
 * Lives inside the AI Predictions tab (#aiSelectionPanel)
 */

class AIAutoModeUI {
    constructor() {
        this.isAutoMode = false;
        this.isSemiAutoMode = false;
        // 'manual' | 'semi' | 'auto' | 't1-strategy'.
        // t1-strategy behaves exactly like 'auto' at the engine-enable
        // layer (engine is enabled, orchestrator is in auto mode) but
        // instructs the orchestrator to route live decisions through
        // the T1 policy from app/t1-strategy.js — the same helper the
        // Auto Test runner uses. No duplication of T1 algorithm here.
        this.currentMode = 'manual';
        this.engine = null;      // Will be set to window.aiAutoEngine
        this.dataLoader = null;  // Will be set to window.aiDataLoader

        this.createUI();
        this.setupEventListeners();

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
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <button id="manualModeBtn" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #3b82f6;border-radius:6px;cursor:pointer;
                    background:#3b82f6;color:white;
                ">MANUAL</button>
                <button id="semiAutoModeBtn" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #64748b;border-radius:6px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">SEMI</button>
                <button id="autoModeBtn" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #64748b;border-radius:6px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">AUTO</button>
                <button id="t1StrategyModeBtn" title="Same T1 decision policy as Auto Test" style="
                    flex:1;padding:6px 12px;font-size:12px;font-weight:700;
                    border:2px solid #64748b;border-radius:6px;cursor:pointer;
                    background:transparent;color:#94a3b8;
                ">T1-strategy</button>
                <button id="trainBtn" style="
                    padding:6px 16px;font-size:11px;font-weight:700;
                    border:2px solid #f59e0b;border-radius:6px;cursor:pointer;
                    background:#f59e0b;color:#000;
                ">🎓 TRAIN</button>
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

        if (trainBtn) {
            trainBtn.addEventListener('click', () => this.startTraining());
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

        if (mode === 'auto' || mode === 't1-strategy') {
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
                    window.autoUpdateOrchestrator.setDecisionMode(
                        mode === 't1-strategy' ? 't1-strategy' : 'auto'
                    );
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

        this._updateModeButtons();
        // SEMI and MANUAL show pair selection; engine-driven modes
        // (AUTO and T1-strategy) hide it — the engine picks the pair.
        const engineDriven = (this.currentMode === 'auto' || this.currentMode === 't1-strategy');
        this.togglePairSelection(!engineDriven);

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

        if (decisionEl) {
            if (decision.action === 'BET') {
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

        if (engine.isTrained) {
            const state = engine.getState();
            const sessionStr = state.sessionStats.totalBets > 0
                ? ` | Session: ${state.sessionStats.wins}W/${state.sessionStats.losses}L (${Math.round(state.sessionStats.sessionWinRate * 100)}%)`
                : '';
            const versionStr = engine.learningVersion === 'v2' ? ' | v2 Bayesian' : ' | v1 Static';
            statusEl.textContent = `✅ Trained (${state.pairModelCount} pairs)${sessionStr}${versionStr}`;
            statusEl.style.color = '#22c55e';
            this._showTrainingStatusBar(true);

            // Show v1/v2 toggle after training
            const toggleDiv = document.getElementById('aiVersionToggle');
            if (toggleDiv) toggleDiv.style.display = 'block';
        } else {
            statusEl.textContent = 'Not trained — click TRAIN to load data';
            statusEl.style.color = '#94a3b8';
        }
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
