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

        // Which decision policy to use when autoMode is on:
        //   'auto'        → window.aiAutoEngine.decide() (default pipeline)
        //   't1-strategy' → window.decideT1Strategy(engine, spinsArr, idx)
        //   'ai-trained'  → window.aiTrainedController.decide(spinsArr, idx)
        // T1-strategy reuses the exact helper from app/t1-strategy.js
        // that Auto Test's runner uses. No T1 algorithm duplication.
        // ai-trained uses the System AI Adaptive Training controller;
        // it does NOT require the heuristic engine to be enabled.
        this.decisionMode = 'auto';

        // Live AI-trained feedback — stores the most recent decision so
        // the next spin can resolve it (recordResult for BET, recordShadow
        // for SHADOW_PREDICT). Separate from the Auto Test controller cache.
        this._lastAITrainedLive = null;

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

                const aiTrainedActive = this.autoMode && this.decisionMode === 'ai-trained';
                const engineAutoActive = this.autoMode && window.aiAutoEngine && window.aiAutoEngine.isEnabled;
                if (aiTrainedActive || engineAutoActive) {
                    // AUTO / T1-strategy / AI-trained: system makes the decision.
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

        // 1. Load pairs (populates getAIDataV6). Skipped for ai-trained
        //    since that path does NOT use user-defined pairs and does
        //    not read table projections.
        if (this.decisionMode !== 'ai-trained') {
            this.loadPairsForManualSelection();
        }

        // Small delay to ensure table3DisplayProjections is populated
        await new Promise(r => setTimeout(r, 150));

        // 2. Get engine decision — route through the T1-strategy helper
        //    when the user selected that live mode, otherwise fall
        //    through to the engine's default pipeline. The T1 helper
        //    lives in app/t1-strategy.js and is the same one Auto Test
        //    uses, so both paths share a single source of T1 logic.
        //    ai-trained routes through window.aiTrainedController.
        let decision;
        if (this.decisionMode === 'ai-trained' && window.aiTrainedController
                && typeof window.aiTrainedController.decide === 'function') {
            const spinsArr = Array.isArray(window.spins)
                ? window.spins
                    .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
                    .filter(n => n !== null)
                : [];
            const idx = Math.max(0, spinsArr.length - 1);

            // Resolve the prior AI-trained decision against the newly
            // revealed outcome BEFORE generating the next decision. The
            // controller's counters thus evolve one spin at a time,
            // mirroring the Auto Test runner's feedback timing.
            this._resolvePriorAITrainedLive(spinsArr);

            const aiDecision = window.aiTrainedController.decide(spinsArr, idx);
            // Store for the NEXT tick's feedback resolver. The reference
            // stored is the same object the AI-mode tab renders and the
            // decision envelope carries under `aiTrained`, so any
            // shadowHit write-back is visible to every consumer.
            this._lastAITrainedLive = { idx, decision: aiDecision };
            // Adapt to the orchestrator's BET/SKIP contract. WAIT,
            // SHADOW_PREDICT, PROTECTION, TERMINATE_SESSION, RETRAIN
            // are all non-bets: no money-panel setPrediction, no
            // wheel filter change, no UI pair selection.
            const isBet = (aiDecision.action === 'BET');
            decision = {
                action: isBet ? 'BET' : 'SKIP',
                selectedPair: null,
                selectedFilter: null,
                numbers: isBet ? aiDecision.numbers : [],
                confidence: Math.round((aiDecision.confidence || 0) * 100),
                reason: `AI-trained ${aiDecision.phase} ${aiDecision.action}: ${aiDecision.reason}`,
                aiTrained: aiDecision
            };
            console.log('🤖 AI-TRAINED DECISION:', decision);
        } else if (this.decisionMode === 't1-strategy' && typeof window.decideT1Strategy === 'function') {
            const spinsArr = Array.isArray(window.spins)
                ? window.spins
                    .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
                    .filter(n => n !== null)
                : [];
            const idx = spinsArr.length - 1;
            decision = window.decideT1Strategy(window.aiAutoEngine, spinsArr, idx);
            console.log('🤖 T1-STRATEGY DECISION:', decision);
        } else {
            decision = window.aiAutoEngine.decide();
            console.log('🤖 AUTO DECISION:', decision);
        }

        // 3. Store decision on engine for feedback loop
        // money-management-panel reads this after bet resolves to call engine.recordResult()
        // Skipped for ai-trained: the heuristic engine is not involved
        // and its lastDecision state must not be mutated by this path.
        if (this.decisionMode !== 'ai-trained' && window.aiAutoEngine) {
            window.aiAutoEngine.lastDecision = decision.action === 'BET' ? {
                selectedPair: decision.selectedPair,
                selectedFilter: decision.selectedFilter,
                numbers: decision.numbers
            } : null;
        }

        // 4. Update UI
        if (window.aiAutoModeUI) {
            window.aiAutoModeUI.updateDecisionDisplay(decision);
        }

        // 5. Execute decision
        if (decision.action === 'BET') {
            // ── AUTO-MODE PARITY FIX ──
            // Historically the live AUTO path placed a bet only
            // AFTER the aiPanel → _autoTriggerPredictions (800 ms
            // debounce) → wheel → moneyPanel.setPrediction cascade
            // completed. If the user entered the next spin within
            // that 800 ms window, pendingBet was still null and the
            // bet was silently missed. The Auto Test runner has no
            // cascade — pnl resolves on the same tick as the
            // decision. To align live AUTO with runner timing, we
            // push the pendingBet DIRECTLY into moneyPanel here in
            // 'auto' decisionMode so the bet lands synchronously.
            // The aiPanel + wheel UI updates below still run for
            // visibility, but the bet placement no longer depends
            // on them.
            //
            // Scoped to 'auto' only. 't1-strategy' keeps its
            // existing cascade path (per backlog rule: do not touch
            // T1 in this task). 'semi' and 'manual' never reach
            // this function.
            if ((this.decisionMode === 'auto' || this.decisionMode === 'ai-trained')
                && window.moneyPanel
                && typeof window.moneyPanel.setPrediction === 'function') {
                try {
                    window.moneyPanel.setPrediction({
                        numbers: decision.numbers,
                        signal: 'BET NOW',
                        confidence: decision.confidence
                    });
                } catch (_) { /* best-effort */ }
            }

            // a. Clear old selections + select the chosen pair.
            //    AI-trained does NOT use user-defined pairs, so skip.
            if (this.decisionMode !== 'ai-trained' && window.aiPanel) {
                window.aiPanel.clearSelections();
                window.aiPanel._handleTable3Selection(decision.selectedPair, true);
            }

            // b. Set wheel filters programmatically.
            //    AI-trained has no selectedFilter, so skip.
            if (this.decisionMode !== 'ai-trained') {
                this._setWheelFilters(decision.selectedFilter);
            }

            // c. The prediction cascade below (aiPanel →
            //    _autoTriggerPredictions 800 ms debounce → wheel →
            //    moneyPanel.setPrediction) still runs for the UI,
            //    but is no longer the primary source of pendingBet
            //    in AUTO mode — see direct setPrediction call above.

        } else {
            // SKIP — clear stale UI from previous BET.
            // AI-trained maintains its own state; never touch engine
            // session counters from this path.
            if (this.decisionMode !== 'ai-trained' && window.aiAutoEngine
                    && typeof window.aiAutoEngine.recordSkip === 'function') {
                window.aiAutoEngine.recordSkip();
            }
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

    /**
     * Choose the live-decision policy routed from handleAutoMode().
     * Accepts 'auto' (default engine pipeline) or 't1-strategy' (the
     * same T1 decision policy used by Auto Test). Unknown values are
     * silently normalised to 'auto' so a typo cannot leave the live
     * flow in an unreachable state.
     */
    setDecisionMode(mode) {
        const prev = this.decisionMode;
        if (mode === 't1-strategy') this.decisionMode = 't1-strategy';
        else if (mode === 'ai-trained') this.decisionMode = 'ai-trained';
        else this.decisionMode = 'auto';
        // Drop any queued AI-trained feedback when leaving ai-trained,
        // so a later re-entry cannot misattribute an old decision to a
        // freshly arrived spin.
        if (prev === 'ai-trained' && this.decisionMode !== 'ai-trained') {
            this._lastAITrainedLive = null;
        }
        console.log(`🤖 Decision mode → ${this.decisionMode}`);
    }

    /**
     * Feed the prior AI-trained live decision's outcome back into the
     * window.aiTrainedController. The decision at prior.idx predicts
     * the spin at prior.idx + 1; once that cell appears in spinsArr,
     * it is the observable outcome.
     *
     * - Prior BET → recordResult({hit, actual, ...})
     * - Prior SHADOW_PREDICT → recordShadow({actual, ...}) + shadowHit write-back
     * - WAIT / RETRAIN / PROTECTION / TERMINATE_SESSION → no-op
     *
     * Never touches the heuristic engine's session counters.
     */
    _resolvePriorAITrainedLive(spinsArr) {
        const prior = this._lastAITrainedLive;
        if (!prior || !prior.decision) return;
        const outcomeIdx = prior.idx + 1;
        if (!Array.isArray(spinsArr) || outcomeIdx >= spinsArr.length) return;
        const actual = spinsArr[outcomeIdx];
        const ctrl = (typeof window !== 'undefined') ? window.aiTrainedController : null;
        if (!ctrl) { this._lastAITrainedLive = null; return; }

        const action = prior.decision.action;
        if (action === 'BET') {
            const nums = Array.isArray(prior.decision.numbers) ? prior.decision.numbers : [];
            const hit = nums.includes(actual);
            if (typeof ctrl.recordResult === 'function') {
                try { ctrl.recordResult({ idx: prior.idx, hit, actual, decision: prior.decision }); }
                catch (_) { /* best-effort */ }
            }
        } else if (action === 'SHADOW_PREDICT') {
            const shadowNums = Array.isArray(prior.decision.shadowNumbers) ? prior.decision.shadowNumbers : [];
            const shadowHit = shadowNums.includes(actual);
            if (typeof ctrl.recordShadow === 'function') {
                try { ctrl.recordShadow({ idx: prior.idx, actual, decision: prior.decision }); }
                catch (_) { /* best-effort */ }
            }
            // Mutate the SAME object referenced by the AI-mode tab render
            // so the live diagnostics carry the resolved flag.
            prior.decision.shadowHit = shadowHit;
        }
        // WAIT / PROTECTION / RETRAIN / TERMINATE_SESSION carry no outcome.
        this._lastAITrainedLive = null;
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
        this._lastAITrainedLive = null;
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
