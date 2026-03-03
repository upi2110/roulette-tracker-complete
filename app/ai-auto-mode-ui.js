/**
 * AI Auto Mode UI — Toggle, training, status display
 * Lives inside the AI Predictions tab (#aiSelectionPanel)
 */

class AIAutoModeUI {
    constructor() {
        this.isAutoMode = false;
        this.isSemiAutoMode = false;
        this.currentMode = 'manual'; // 'manual' | 'semi' | 'auto'
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
            <div id="sessionControls" style="margin-top:6px;padding-top:6px;border-top:1px solid #475569;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <button id="downloadSessionBtn" disabled style="
                    padding:4px 10px;font-size:10px;font-weight:700;
                    border:1px solid #64748b;border-radius:4px;cursor:pointer;
                    background:#334155;color:#94a3b8;
                ">Download Session</button>
                <label style="font-size:10px;color:#94a3b8;cursor:pointer;user-select:none;display:flex;align-items:center;gap:3px;">
                    <input type="checkbox" id="verboseToggle" style="margin:0;">
                    Verbose Logs
                </label>
                <span id="sessionRecordingStatus" style="font-size:10px;color:#888;margin-left:auto;">Not recording</span>
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

        // ── Session controls ──
        const downloadBtn = document.getElementById('downloadSessionBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this._downloadSession());
        }

        const verboseToggle = document.getElementById('verboseToggle');
        if (verboseToggle) {
            verboseToggle.addEventListener('change', (e) => {
                if (window.verboseLogger) {
                    window.verboseLogger.enabled = e.target.checked;
                    if (e.target.checked && !window.verboseLogger._sessionActive) {
                        window.verboseLogger.startSession();
                    }
                    console.log(`[UI] Verbose logging ${e.target.checked ? 'ENABLED' : 'DISABLED'}`);
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

        if (mode === 'auto') {
            // Switching to AUTO — requires trained engine
            if (!engine || !engine.isTrained) {
                console.warn('⚠️ Cannot switch to AUTO — engine not trained');
                this._showTrainingStatusBar(true);
                this.updateTrainingProgress(0, '⚠️ Train first! Click 🎓 TRAIN to load data');
                this._flashTrainButton();
                return;
            }

            this.currentMode = 'auto';
            this.isAutoMode = true;
            this.isSemiAutoMode = false;
            engine.enable();
            if (semiFilter) semiFilter.disable();

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(true);
            }

            // Auto-start session recording
            this._autoStartRecording('auto');

        } else if (mode === 'semi') {
            // Switching to SEMI-AUTO — user picks pair, system picks filter
            this.currentMode = 'semi';
            this.isAutoMode = false;
            this.isSemiAutoMode = true;
            if (engine) engine.disable();
            if (semiFilter) semiFilter.enable();

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(false);
            }

            // Auto-start session recording
            this._autoStartRecording('semi');

        } else {
            // Switching to MANUAL
            this.currentMode = 'manual';
            this.isAutoMode = false;
            this.isSemiAutoMode = false;
            if (engine) engine.disable();
            if (semiFilter) semiFilter.disable();

            if (typeof window !== 'undefined' && window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.setAutoMode(false);
            }
        }

        this._updateModeButtons();
        // SEMI and MANUAL both show pair selection; AUTO hides it
        this.togglePairSelection(this.currentMode !== 'auto');

        const statusDiv = document.getElementById('autoModeStatus');
        if (statusDiv) {
            statusDiv.style.display = this.isAutoMode ? 'block' : 'none';
        }

        console.log(`🔄 Mode switched to ${this.currentMode.toUpperCase()}`);
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
     * Auto-start session recording when switching to auto/semi mode.
     */
    _autoStartRecording(mode) {
        if (window.sessionRecorder && !window.sessionRecorder.isActive) {
            const bankroll = window.moneyPanel ? window.moneyPanel.sessionData.currentBankroll : 4000;
            const target = window.moneyPanel ? window.moneyPanel.sessionData.sessionTarget : 100;
            const strategy = window.moneyPanel ? window.moneyPanel.sessionData.bettingStrategy : 1;
            window.sessionRecorder.startSession(bankroll, target, strategy, mode);

            // Also start verbose logger session if enabled
            if (window.verboseLogger && window.verboseLogger.enabled && !window.verboseLogger._sessionActive) {
                window.verboseLogger.startSession();
            }
        }
    }

    /**
     * Download recorded session as Excel file (same format as test report).
     */
    _downloadSession() {
        if (!window.sessionRecorder || window.sessionRecorder.stepCount === 0) {
            console.warn('No session data to download');
            return;
        }

        const result = window.sessionRecorder.getSessionResult();

        // Use LiveSessionExport if available
        if (typeof LiveSessionExport !== 'undefined') {
            const exporter = new LiveSessionExport();
            exporter.generateAndDownload(result);
        } else {
            console.error('LiveSessionExport not loaded');
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
