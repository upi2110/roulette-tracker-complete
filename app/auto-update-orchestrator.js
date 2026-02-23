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
        this.autoMode = false;  // NEW: auto mode flag

        console.log('🔧 Auto-Update Orchestrator initialized');
    }

    setupListeners() {
        // Monitor for new spins
        setInterval(() => {
            if (!this.isEnabled) return;

            const currentCount = window.spins ? window.spins.length : 0;

            if (currentCount > this.lastSpinCount) {
                console.log(`🔄 New spin detected! Count: ${currentCount}`);

                // Start session if needed
                if (!this.sessionStarted) {
                    console.log('🚀 Starting session FIRST...');
                    this.startSessionFirst();
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
        console.log('🤖 AUTO MODE: Processing new spin...');

        // 1. Load pairs (populates getAIDataV6)
        this.loadPairsForManualSelection();

        // Small delay to ensure table3DisplayProjections is populated
        await new Promise(r => setTimeout(r, 150));

        // 2. Get engine decision
        const decision = window.aiAutoEngine.decide();
        console.log('🤖 AUTO DECISION:', decision);

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
            // SKIP
            window.aiAutoEngine.recordSkip();
            if (window.moneyPanel) {
                window.moneyPanel.pendingBet = null;
            }
            console.log('🤖 AUTO: Skipped this spin');
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

        // Trigger filter change on wheel
        if (window.rouletteWheel && typeof window.rouletteWheel._onFilterChange === 'function') {
            window.rouletteWheel._onFilterChange();
        }

        console.log(`🎡 Wheel filters set: ${filterKey} → table=${tableId}, sign=${signId}`);
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
                return;
            }

            const result = await integration.startSession(4000, 100);
            console.log('✅ Session started:', result);
            this.sessionStarted = true;

        } catch (error) {
            console.error('❌ Failed to start session:', error);
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
