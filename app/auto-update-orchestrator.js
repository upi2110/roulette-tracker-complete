/**
 * Auto-Update Orchestrator - SUPPORTS MANUAL & AUTO MODES
 * Coordinates updates between all panels.
 * MANUAL: Loads available pairs when new spins added (user selects manually)
 * AUTO: Engine makes all decisions automatically (pair, filter, bet/skip)
 */

class AutoUpdateOrchestrator {
    constructor() {
        this.lastSpinCount = 0;
        this.isEnabled = true;
        this.sessionStarted = false;
        this._sessionStarting = false; // guard against multiple startSessionFirst() calls
        this._engineResetDone = false;  // tracks if engine.resetSession() was called for this session
        this.autoMode = false;  // NEW: auto mode flag

        console.log('🔧 Auto-Update Orchestrator initialized');
    }

    setupListeners() {
        // Monitor for new spins
        setInterval(() => {
            if (!this.isEnabled) return;

            const currentCount = window.spins ? window.spins.length : 0;

            if (currentCount > this.lastSpinCount) {
                const latestSpin = window.spins ? window.spins[window.spins.length - 1] : null;
                const latestVal = latestSpin ? (typeof latestSpin === 'number' ? latestSpin : latestSpin.actual) : '?';
                console.log(`[ORCH-LOG] New spin detected! Count: ${currentCount} | latest: ${latestVal} | prev: ${this.lastSpinCount}`);
                console.log(`🔄 New spin detected! Count: ${currentCount}`);

                // Start session if needed (guard prevents multiple concurrent calls)
                if (!this.sessionStarted && !this._sessionStarting) {
                    console.log('[ORCH-LOG] Session not started yet — starting first...');
                    console.log('🚀 Starting session FIRST...');
                    this._sessionStarting = true;
                    this.startSessionFirst();
                }

                // CRITICAL: Reset engine session SYNCHRONOUSLY on first spin detection.
                // startSessionFirst() is async (IPC call) — its resetSession() fires late.
                // Without this, decide() runs with stale session state (non-zero
                // consecutiveSkips, wrong trendState), causing BET/SKIP divergence
                // from the test runner which resets synchronously.
                if (!this._engineResetDone && window.aiAutoEngine && typeof window.aiAutoEngine.resetSession === 'function') {
                    window.aiAutoEngine.resetSession();
                    this._engineResetDone = true;
                    console.log('[ORCH-LOG] Engine session reset SYNCHRONOUSLY (matches test runner)');
                }

                if (this.autoMode && window.aiAutoEngine && window.aiAutoEngine.isEnabled) {
                    // AUTO MODE: Engine makes all decisions
                    this.handleAutoMode();
                } else {
                    // MANUAL MODE: Load pairs for user selection
                    this.loadPairsForManualSelection();
                }

                this.lastSpinCount = currentCount;
            }
        }, 500);
    }

    /**
     * Load available pairs when spins are added (manual mode)
     */
    loadPairsForManualSelection() {
        if (window.aiPanel && typeof window.aiPanel.loadAvailablePairs === 'function') {
            console.log('📊 Loading pairs for manual selection...');
            window.aiPanel.loadAvailablePairs();
        } else {
            console.warn('⚠️ AI panel not available for pair loading');
        }
    }

    /**
     * Handle auto-mode decision pipeline.
     * Called when a new spin is detected and auto mode is enabled.
     */
    async handleAutoMode() {
        const spinCount = window.spins ? window.spins.length : 0;
        const spinsArr = window.spins ? window.spins.map(s => typeof s === 'number' ? s : s.actual) : [];
        console.log(`[ORCH-LOG] handleAutoMode() | spinCount=${spinCount} | spins=[${spinsArr.join(',')}]`);

        // ── WATCH PHASE: Need at least 4 spins before making decisions ──
        // Matches test runner behavior: first 3 spins are WATCH (observe-only),
        // first real decision happens at spin index 3 (4th spin).
        // Without this guard, recordSkip() was called for "not enough spins" skips,
        // inflating consecutiveSkips/sessionSpinCount and causing prediction offset.
        if (spinCount < 4) {
            console.log(`[ORCH-LOG] WATCH phase: ${spinCount}/4 spins — observing only (no decide/recordSkip)`);

            // ── Session Recorder: WATCH step ──
            if (window.sessionRecorder && window.sessionRecorder.isActive) {
                const spinVal = spinsArr[spinsArr.length - 1];
                const bankroll = window.moneyPanel ? window.moneyPanel.sessionData.currentBankroll : 4000;
                window.sessionRecorder.recordWatch(spinVal, null, bankroll);
            }
            // ── Verbose Logger: WATCH ──
            if (window.verboseLogger && window.verboseLogger.enabled) {
                window.verboseLogger.log('ORCH', 'INFO', `WATCH phase: spin #${spinCount}/4`, {
                    spinValue: spinsArr[spinsArr.length - 1],
                    allSpins: spinsArr
                });
            }

            // Still load pairs so table display updates
            this.loadPairsForManualSelection();
            return;
        }

        console.log('🤖 AUTO MODE: Processing new spin...');

        // 1. Load pairs (populates getAIDataV6)
        this.loadPairsForManualSelection();

        // Small delay to ensure table3DisplayProjections is populated
        await new Promise(r => setTimeout(r, 150));

        // 2. Get engine decision
        console.log(`[ORCH-LOG] Calling decide() with window.spins.length=${window.spins ? window.spins.length : 0}`);
        const decision = window.aiAutoEngine.decide();
        console.log(`[ORCH-LOG] Decision result: action=${decision.action} | pair=${decision.selectedPair} | filter=${decision.selectedFilter} | conf=${decision.confidence}% | numbers=[${decision.numbers ? decision.numbers.join(',') : ''}]`);
        console.log('🤖 AUTO DECISION:', decision);

        // ── Session Recorder: BET/SKIP decision ──
        if (window.sessionRecorder && window.sessionRecorder.isActive) {
            const betPerNum = window.moneyPanel ? window.moneyPanel.sessionData.currentBetPerNumber : 2;
            const bankroll = window.moneyPanel ? window.moneyPanel.sessionData.currentBankroll : 4000;
            window.sessionRecorder.recordDecision(spinsArr[spinsArr.length - 1], decision, betPerNum, bankroll);
        }
        // ── Verbose Logger: Decision details ──
        if (window.verboseLogger && window.verboseLogger.enabled) {
            const engine = window.aiAutoEngine;
            window.verboseLogger.log('ORCH', 'DECISION', `decide() → ${decision.action}`, {
                action: decision.action,
                pair: decision.selectedPair,
                filter: decision.selectedFilter,
                confidence: decision.confidence,
                numbersCount: decision.numbers ? decision.numbers.length : 0,
                numbers: decision.numbers ? decision.numbers.sort((a, b) => a - b) : [],
                reason: decision.reason,
                debug: decision.debug || {},
                engineSession: engine ? {
                    trendState: engine.session.trendState,
                    totalBets: engine.session.totalBets,
                    consecutiveSkips: engine.session.consecutiveSkips,
                    consecutiveLosses: engine.session.consecutiveLosses,
                    wins: engine.session.wins,
                    losses: engine.session.losses
                } : null
            });
        }

        // 3. Store decision on engine for feedback loop
        // money-management-panel reads this after bet resolves to call engine.recordResult()
        window.aiAutoEngine.lastDecision = decision.action === 'BET' ? {
            selectedPair: decision.selectedPair,
            selectedFilter: decision.selectedFilter,
            numbers: decision.numbers
        } : null;

        // 4. Update UI
        if (window.aiAutoModeUI) {
            window.aiAutoModeUI.updateDecisionDisplay(decision);
        }

        // 5. Execute decision
        if (decision.action === 'BET') {
            // a. Clear old selections + select the chosen pair
            if (window.aiPanel) {
                window.aiPanel.clearSelections();
                window.aiPanel._handleTable3Selection(decision.selectedPair, true);
            }

            // b. Set wheel filters programmatically
            this._setWheelFilters(decision.selectedFilter);

            // c. Wait for prediction cascade (debounced 800ms in aiPanel._autoTriggerPredictions)
            // The cascade: aiPanel._handleTable3Selection() → _autoTriggerPredictions() →
            //   getPredictions() → updatePrediction() →
            //     rouletteWheel.updateHighlights() →
            //       wheel._applyFilters() →
            //         wheel._syncMoneyPanel() → moneyPanel.setPrediction()

        } else {
            // SKIP — clear stale UI from previous BET
            window.aiAutoEngine.recordSkip();
            if (window.aiPanel) {
                window.aiPanel.clearSelections();
            }
            if (window.rouletteWheel && typeof window.rouletteWheel.clearHighlights === 'function') {
                window.rouletteWheel.clearHighlights();
            }
            if (window.moneyPanel) {
                window.moneyPanel.pendingBet = null;
            }
            console.log('🤖 AUTO: Skipped this spin (UI cleared)');
        }
    }

    /**
     * Programmatically set wheel filter radio buttons.
     * @param {string} filterKey - e.g., 'zero_positive', 'nineteen_negative', 'both_both'
     */
    _setWheelFilters(filterKey) {
        if (!filterKey) return;

        const parts = filterKey.split('_');
        const table = parts[0];
        const sign = parts.length > 1 ? parts[1] : 'both';
        const setKey = parts.length > 2 ? parts[2] : null; // 'set0', 'set5', 'set6', or null

        // Set table radio
        const TABLE_IDS = ['filter0Table', 'filter19Table', 'filterBothTables'];
        const tableId = table === 'zero' ? 'filter0Table'
                      : table === 'nineteen' ? 'filter19Table'
                      : 'filterBothTables';
        TABLE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = (id === tableId);
        });

        // Set sign radio
        const SIGN_IDS = ['filterPositive', 'filterNegative', 'filterBothSigns'];
        const signId = sign === 'positive' ? 'filterPositive'
                     : sign === 'negative' ? 'filterNegative'
                     : 'filterBothSigns';
        SIGN_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = (id === signId);
        });

        // Set checkboxes: if a specific set is chosen, check only that one;
        // otherwise (no set key = original 2-part key) check all sets
        const SET_MAP = { set0: 'filterSet0', set5: 'filterSet5', set6: 'filterSet6' };
        if (setKey && SET_MAP[setKey]) {
            Object.entries(SET_MAP).forEach(([key, id]) => {
                const el = document.getElementById(id);
                if (el) el.checked = (key === setKey);
            });
        } else {
            // No set specified — check all sets
            Object.values(SET_MAP).forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = true;
            });
        }

        // Trigger filter change on wheel
        if (window.rouletteWheel && typeof window.rouletteWheel._onFilterChange === 'function') {
            window.rouletteWheel._onFilterChange();
        }

        console.log(`🎡 Wheel filters set: ${filterKey} → table=${tableId}, sign=${signId}${setKey ? ', set=' + setKey : ''}`);
    }

    /**
     * Enable/disable auto mode
     */
    setAutoMode(enabled) {
        this.autoMode = enabled;
        console.log(`🤖 Auto mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    async startSessionFirst() {
        try {
            // Use V6 integration
            const integration = window.aiIntegrationV6 || window.aiIntegration;

            if (!integration) {
                console.error('❌ AI Integration not found!');
                this._sessionStarting = false;
                return;
            }

            const result = await integration.startSession(4000, 100);
            console.log('✅ Session started:', result);
            this.sessionStarted = true;
            this._sessionStarting = false;

            // Engine resetSession() is now called SYNCHRONOUSLY in setupListeners
            // when the first spin is detected (via _engineResetDone flag).
            // No need to call it again here — it was already done before decide() runs.
            console.log('✅ Backend session started (engine already reset synchronously)');

        } catch (error) {
            console.error('❌ Failed to start session:', error);
            this._sessionStarting = false;
        }
    }

    enable() {
        this.isEnabled = true;
        console.log('✅ Auto-update enabled');
    }

    disable() {
        this.isEnabled = false;
        console.log('⏸️ Auto-update disabled');
    }

    reset() {
        this.lastSpinCount = 0;
        this.sessionStarted = false;
        this._sessionStarting = false;
        this._engineResetDone = false;
        this.autoMode = false;
        console.log('🔄 Auto-update orchestrator reset');
    }
}

// Create global instance
const autoUpdateOrchestrator = new AutoUpdateOrchestrator();

// Start listening for changes
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 Setting up auto-update listeners...');

    // Wait for all panels to be ready
    setTimeout(() => {
        autoUpdateOrchestrator.setupListeners();
        console.log('✅ Auto-update orchestrator active');
    }, 300); // Wait for all panels to initialize
});

// Export for global access
window.autoUpdateOrchestrator = autoUpdateOrchestrator;

console.log('✅ Auto-Update Orchestrator script loaded');
