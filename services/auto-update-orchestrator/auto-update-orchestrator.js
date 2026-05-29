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
                // Analytics runs with the heuristic engine DISABLED (it only
                // uses the engine's deterministic projection helpers), so it
                // isn't caught by engineAutoActive. Recognise it explicitly so the
                // orchestrator still makes a per-spin decision. Same shape as
                // the ai-trained gate (also engine-disabled).
                const analyticsActive = this.autoMode && this.decisionMode === 'analytics';
                if (aiTrainedActive || engineAutoActive || analyticsActive) {
                    // AUTO / T1-strategy / AI-trained / Analytics: system decides.
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

            // ── PHASE 1 GUARD: WATCH (first 3 spins, observe only) ──
            // The Auto Test runner does NOT consult the controller for
            // the first 3 spins (auto-test-runner.js:299-318 pushes
            // WATCH placeholders without calling decide()). The
            // controller therefore has internal state advanced by ~3
            // fewer calls in AT than in live by the time the first
            // BET-eligible decision is made. Live mode must mirror
            // this exactly: skip controller.decide() while
            // spinsArr.length <= 3 and emit a WATCH-equivalent SKIP.
            // Without this guard, every per-spin confidence and phase
            // transition is shifted one step earlier in live, causing
            // the live BET to fire one spin before AT's BET does and
            // every downstream decision/strategy adjustment to drift.
            if (spinsArr.length <= 3) {
                const aiDecision = {
                    action: 'WAIT',
                    phase: 'WARMUP',
                    numbers: [],
                    confidence: 0,
                    reason: 'WATCH phase placeholder (parity with auto-test runner)',
                    diagnostics: {
                        entropy: 0, conflict: 0, historianMatch: 0,
                        clusterStrength: 0, driftScore: 0,
                        lossStreak: 0, ghostWin: false,
                        spinIndex: spinsArr.length - 1,
                        spinsSeen: spinsArr.length
                    },
                    reasoning: { signals: [], rejected: [] }
                };
                this._lastAITrainedLive = null;
                decision = {
                    action: 'SKIP',
                    selectedPair: null,
                    selectedFilter: null,
                    numbers: [],
                    confidence: 0,
                    reason: 'AI-trained WATCH phase (placeholder, no controller call)',
                    aiTrained: aiDecision
                };
                console.log('🤖 AI-TRAINED WATCH (skip controller.decide()):', decision);
            } else {
                const idx = Math.max(0, spinsArr.length - 1);

                // Resolve the prior AI-trained decision against the newly
                // revealed outcome BEFORE generating the next decision. The
                // controller's counters thus evolve one spin at a time,
                // mirroring the Auto Test runner's feedback timing.
                this._resolvePriorAITrainedLive(spinsArr);

                // ── PARITY-WITH-AUTO-TEST SLICE ──
                // The Auto Test runner reaches the controller via the
                // strategy adapter (`decideAITrainedStrategy`) which
                // calls `controller.decide(testSpins.slice(0, idx), idx)`
                // — i.e. the spins STRICTLY BEFORE the just-revealed
                // outcome at idx. Live mode previously called
                // `controller.decide(spinsArr, idx)` directly, passing
                // ONE EXTRA spin (the just-entered outcome) into the
                // controller's diagnostic windows. That extra spin
                // shifts entropy/historianMatch/driftScore by one
                // step, which makes live confidence and decisions
                // diverge from the Auto Test report on the same input.
                // We mirror the adapter exactly here so AT and LIVE
                // produce byte-identical decisions for the same
                // (spinsArr, idx) pair.
                const history = spinsArr.slice(0, idx);
                const aiDecision = window.aiTrainedController.decide(history, idx);
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
            }
        } else if (this.decisionMode === 't1-strategy' && typeof window.decideT1Strategy === 'function') {
            const spinsArr = Array.isArray(window.spins)
                ? window.spins
                    .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
                    .filter(n => n !== null)
                : [];
            const idx = spinsArr.length - 1;
            decision = window.decideT1Strategy(window.aiAutoEngine, spinsArr, idx);
            console.log('🤖 T1-STRATEGY DECISION:', decision);
        } else if (this.decisionMode === 'test' && window.StrategyLab) {
            // Strategy-Lab live path. Same module as Auto Test
            // (method='test'), so a backtest of the current session would
            // produce identical decisions for the same spin history.
            const spinsArr = Array.isArray(window.spins)
                ? window.spins
                    .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
                    .filter(n => n !== null)
                : [];
            const idx = spinsArr.length - 1;

            // Phase 2 — Test Lab: the AI Prediction Panel autopilot
            // (_runTestLabAutopilot) drives T1 pair selection and
            // rotation on miss. Take the locked pair from the
            // autopilot's current T1 selection so the strategy-lab
            // intersection rotates with it. Fall back to selectBestPair
            // only on cold start (autopilot hasn't picked yet).
            let _autopilotPair = null;
            try {
                const _sel = window.aiPanel && window.aiPanel.table1Selections;
                if (_sel) {
                    const _keys = Object.keys(_sel);
                    if (_keys.length > 0) _autopilotPair = _keys[0];
                }
            } catch (_) { /* ignore */ }
            if (_autopilotPair) {
                this._strategyLabLockedPair = _autopilotPair;
            } else if (!this._strategyLabLockedPair) {
                this._strategyLabLockedPair = window.StrategyLab.selectBestPair(window.aiAutoEngine);
            }

            // Grey numbers: the wheel exposes its own primary vs grey
            // split. We pull the current grey set from the wheel so the
            // user's "include grey" toggle has the same source-of-truth
            // they see on screen. Empty if wheel not available.
            let greyNumbers = [];
            const w = window.rouletteWheel;
            if (w) {
                if (Array.isArray(w.extraLoose)) {
                    greyNumbers = greyNumbers.concat(w.extraLoose);
                }
                if (Array.isArray(w.extraAnchorGroups)) {
                    for (const g of w.extraAnchorGroups) {
                        if (Array.isArray(g)) greyNumbers = greyNumbers.concat(g);
                        else if (g && Array.isArray(g.numbers)) greyNumbers = greyNumbers.concat(g.numbers);
                    }
                }
            }

            const includeGrey = (typeof window.strategyLabIncludeGrey === 'boolean')
                ? window.strategyLabIncludeGrey
                : true;

            decision = window.StrategyLab.decideStrategyLab(
                window.aiAutoEngine, spinsArr, idx,
                {
                    lockedPairRefKey: this._strategyLabLockedPair,
                    includeGrey: includeGrey,
                    greyNumbers: greyNumbers
                }
            );
            console.log('🧪 STRATEGY-LAB DECISION:', decision);
        } else if (this.decisionMode === '3t-selection' && window.Strategy3T) {
            // 3T-Selection live path — production copy of the Strategy-Lab
            // algorithm. Independent module + namespace + locked-pair var
            // from Test (Lab) so each can be modified without affecting
            // the other.
            const spinsArr = Array.isArray(window.spins)
                ? window.spins
                    .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
                    .filter(n => n !== null)
                : [];
            const idx = spinsArr.length - 1;

            // 3T-Selection lock: ONE pair, picked once, sticks for the
            // entire session. Two ways the pair gets set:
            //   1) User picks a T1 pair manually → that's the lock.
            //      (Override at any time.)
            //   2) If user hasn't picked AND no prior lock,
            //      Strategy3T.selectBestPair() auto-picks the best
            //      historical pair → that's the lock.
            //
            // The lock is cleared only by setDecisionMode (leaving the
            // mode). The orchestrator does NOT clear or re-toggle
            // selections after each BET/SKIP (cascade removed), so a
            // user manual override truly persists.
            let _userPair = null;
            try {
                const _sel = window.aiPanel && window.aiPanel.table1Selections;
                if (_sel) {
                    const _keys = Object.keys(_sel);
                    if (_keys.length > 0) _userPair = _keys[0];
                }
            } catch (_) { /* ignore */ }
            if (_userPair) {
                if (this._3tLockedPair !== _userPair) {
                    console.log(`🎯 3T-Selection: locked pair → ${_userPair} (from user T1 selection)`);
                }
                this._3tLockedPair = _userPair;
            } else if (!this._3tLockedPair) {
                this._3tLockedPair = window.Strategy3T.selectBestPair(window.aiAutoEngine);
                if (this._3tLockedPair) {
                    console.log(`🎯 3T-Selection: auto-picked pair → ${this._3tLockedPair} (Strategy3T.selectBestPair)`);
                    // ONE-TIME UI populate so the user can see what's
                    // locked. Selects T3 + T1 + T2 + T2_13opp for the
                    // locked pair. After this initial click, the
                    // orchestrator NEVER re-toggles selections; if the
                    // user clicks a different pair mid-session, the
                    // _userPair read above picks it up next decision.
                    try {
                        const refkeyMap = window.Strategy3T.REFKEY_TO_PAIR || {};
                        const camelPair = refkeyMap[this._3tLockedPair] || this._3tLockedPair;
                        if (window.aiPanel) {
                            try { window.aiPanel._handleTable3Selection(camelPair, true); } catch (_) {}
                            try { window.aiPanel._handleTable12PairToggle('table1', camelPair, true); } catch (_) {}
                            try { window.aiPanel._handleTable12PairToggle('table2', camelPair, true); } catch (_) {}
                            try { window.aiPanel._handleTable12PairToggle('table2', camelPair + '_13opp', true); } catch (_) {}
                        }
                    } catch (e) { console.warn('🎯 3T-Selection initial UI populate failed:', e && e.message); }
                } else {
                    console.warn('🎯 3T-Selection: selectBestPair returned NULL — engine has no pairModels yet. Spin will SKIP until engine trains.');
                }
            }

            // Grey numbers: same wheel-derived source as the Test (Lab)
            // path so the user's "include grey" toggle is honoured here too.
            let greyNumbers = [];
            const w = window.rouletteWheel;
            if (w) {
                if (Array.isArray(w.extraLoose)) {
                    greyNumbers = greyNumbers.concat(w.extraLoose);
                }
                if (Array.isArray(w.extraAnchorGroups)) {
                    for (const g of w.extraAnchorGroups) {
                        if (Array.isArray(g)) greyNumbers = greyNumbers.concat(g);
                        else if (g && Array.isArray(g.numbers)) greyNumbers = greyNumbers.concat(g.numbers);
                    }
                }
            }

            const includeGrey = (typeof window.strategyLabIncludeGrey === 'boolean')
                ? window.strategyLabIncludeGrey
                : true;

            decision = window.Strategy3T.decideStrategyLab(
                window.aiAutoEngine, spinsArr, idx,
                {
                    lockedPairRefKey: this._3tLockedPair,
                    includeGrey: includeGrey,
                    greyNumbers: greyNumbers
                }
            );
            console.log('🎯 3T-SELECTION DECISION:', decision);
        } else if (this.decisionMode === 'analytics' && window.AnalyticsStrategy
                && typeof window.AnalyticsStrategy.decide === 'function') {
            // Analytics (T2 × T3 wheel-consensus). Uses the SAME engine
            // projection helpers as the backtest (_getCalculateReferences /
            // _getLookupRow / _computeProjectionForPair over ALL pairs), so
            // live and Auto-Test produce identical decisions for identical
            // history. Numbers-only output → propagated like 'ai-trained'
            // (direct setPrediction + wheel highlight, no pair cascade).
            const spinsArr = Array.isArray(window.spins)
                ? window.spins
                    .map(s => (s && typeof s.actual === 'number') ? s.actual : null)
                    .filter(n => n !== null)
                : [];
            const idx = spinsArr.length - 1;
            const params = (typeof window !== 'undefined' && window.analyticsParams) ? window.analyticsParams : null;
            decision = window.AnalyticsStrategy.decide(window.aiAutoEngine, spinsArr, idx, { params: params });
            console.log('🧠 ANALYTICS DECISION:', decision);
        } else {
            decision = window.aiAutoEngine.decide();
            console.log('🤖 AUTO DECISION:', decision);
        }

        // 3. Store decision on engine for feedback loop
        // money-management-panel reads this after bet resolves to call engine.recordResult()
        // Skipped for ai-trained: the heuristic engine is not involved
        // and its lastDecision state must not be mutated by this path.
        if (this.decisionMode !== 'ai-trained' && this.decisionMode !== 'analytics' && window.aiAutoEngine) {
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
            if ((this.decisionMode === 'auto' || this.decisionMode === 'ai-trained' || this.decisionMode === 'analytics')
                && window.moneyPanel
                && typeof window.moneyPanel.setPrediction === 'function') {
                try {
                    // ── PARITY-WITH-RUNNER OFF-BY-ONE FIX ──
                    // The Auto Test runner decides AFTER seeing N spins
                    // and resolves the bet on spin N+1. To mirror that
                    // exactly in live mode, we stamp pendingBet with
                    // the spin count at decision time. The money panel
                    // only resolves the bet once spins.length advances
                    // past this stamp — i.e. on the NEXT spin the user
                    // enters, not the spin that triggered the decision.
                    // Without this stamp, moneyPanel.setupSpinListener
                    // resolves the bet immediately on the same spin
                    // that caused the orchestrator to decide BET,
                    // shifting every bet outcome by one spin.
                    const placedAtSpinCount = Array.isArray(window.spins)
                        ? window.spins.length : 0;
                    window.moneyPanel.setPrediction({
                        numbers: decision.numbers,
                        signal: 'BET NOW',
                        confidence: decision.confidence,
                        placedAtSpinCount
                    });
                } catch (_) { /* best-effort */ }
            }

            // AI-trained: also notify the roulette wheel for visibility.
            // AUTO/T1 reach the wheel via the cascade below
            // (aiPanel._handleTable3Selection → _autoTriggerPredictions →
            // getPredictions → wheel.updateHighlights). AI-trained skips
            // that cascade because it has no user-pair / wheel-filter
            // contract — but the user still expects to see the predicted
            // numbers highlighted on the wheel AND the AI prediction
            // panel populated. The wheel's _applyFilters → _syncAIPanel
            // cascade fans the prediction out to both UIs, but only when
            // the call passes a real anchor structure (empty anchors/
            // loose results in nothing rendered). We compute the anchor
            // structure from decision.numbers via the existing
            // calculateWheelAnchors helper so the wheel and panel both
            // light up. Read-only with respect to the AI-trained
            // controller — no decision logic, money math, or controller
            // state is touched.
            if ((this.decisionMode === 'ai-trained' || this.decisionMode === 'analytics')
                && window.rouletteWheel
                && typeof window.rouletteWheel.updateHighlights === 'function') {
                try {
                    const nums = Array.isArray(decision.numbers) ? decision.numbers : [];
                    let anchors = [], loose = nums.slice(), anchorGroups = [];
                    if (typeof window.calculateWheelAnchors === 'function' && nums.length > 0) {
                        try {
                            const r = window.calculateWheelAnchors(nums);
                            anchors      = r.anchors      || [];
                            loose        = r.loose        || [];
                            anchorGroups = r.anchorGroups || [];
                        } catch (_) {
                            // Fall back to "all numbers as loose" — wheel
                            // renders loose with the same highlight as
                            // primary numbers.
                            loose = nums.slice();
                        }
                    }
                    window.rouletteWheel.updateHighlights(
                        anchors, loose, anchorGroups, [],
                        {
                            numbers: nums,
                            signal: 'BET NOW',
                            confidence: decision.confidence
                        }
                    );
                } catch (_) { /* best-effort, never break the decision */ }
            }

            // a. Clear old selections + select the chosen pair.
            //    AI-trained does NOT use user-defined pairs, so skip.
            //    Strategy-Lab ('test'): clear, then programmatically
            //    select the locked pair across T1, T2 (pair half +
            //    13-opp half) and T3 so V6's intersection produces the
            //    bet — matching the spec "select pair from T1, same
            //    pair + 13-opp from T2, same pair from T3".
            // 3T-Selection is now USER-DRIVEN: the user manually picks
            // the T1 pair and that becomes the locked pair. The
            // orchestrator MUST NOT clear or rewrite the user's pair
            // selections after each BET — that would overwrite their
            // manual choice every spin. So 3t-selection skips this
            // whole clear-then-reselect cascade.
            //
            // Test Lab keeps the cascade (autopilot drives the lock and
            // the reselect propagates the autopilot's pair to the V6
            // bet path). AUTO / T1-strategy / etc. keep original
            // behavior (clear + reselect T3 with the engine's pick).
            if (this.decisionMode !== 'ai-trained'
                && this.decisionMode !== '3t-selection'
                && this.decisionMode !== 'analytics'
                && window.aiPanel) {
                window.aiPanel.clearSelections();
                if (this.decisionMode === 'test') {
                    // Phase 2 — Test Lab no longer uses T3. Only reselect
                    // T1 + T2 (pair + its 13-opposite). Use the shared
                    // helper so ref0 ↔ ref19 is treated as the mutual
                    // 13-opposite pair (NOT 'ref0_13opp', which would
                    // be redundant with ref19).
                    const pair = decision.selectedPair;
                    if (pair) {
                        const _oppFn = k => (k === 'ref0' ? 'ref19' : (k === 'ref19' ? 'ref0' : (k.endsWith('_13opp') ? k.slice(0, -'_13opp'.length) : k + '_13opp')));
                        const _opp = _oppFn(pair);
                        try { window.aiPanel._handleTable12PairToggle('table1', pair, true); } catch (_) {}
                        try { window.aiPanel._handleTable12PairToggle('table2', pair, true); } catch (_) {}
                        try { window.aiPanel._handleTable12PairToggle('table2', _opp, true); } catch (_) {}
                    }
                } else {
                    window.aiPanel._handleTable3Selection(decision.selectedPair, true);
                }
            }

            // b. Set wheel filters programmatically.
            //    AI-trained has no selectedFilter, so skip.
            if (this.decisionMode !== 'ai-trained' && this.decisionMode !== 'analytics') {
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
            if (this.decisionMode !== 'ai-trained' && this.decisionMode !== 'analytics' && window.aiAutoEngine
                    && typeof window.aiAutoEngine.recordSkip === 'function') {
                window.aiAutoEngine.recordSkip();
            }
            // Two modes preserve selections across SKIP for different
            // reasons:
            //   • 'test'         — autopilot drives the lock; clearing
            //                      would wipe the autopilot's pick and
            //                      force a re-seed every empty-
            //                      intersection spin.
            //   • '3t-selection' — USER picked the pair manually; the
            //                      strategy uses it every spin. Clearing
            //                      on SKIP would wipe the user's pick
            //                      and the next spin would have no pair
            //                      to bet on.
            // All other modes (t1-strategy, auto, ai-trained) keep the
            // original SKIP behavior — clear so stale UI doesn't leak.
            const _keepSelections = (
                this.decisionMode === 'test' ||
                this.decisionMode === '3t-selection'
            );
            if (window.aiPanel && !_keepSelections) {
                window.aiPanel.clearSelections();
            }
            if (window.rouletteWheel && typeof window.rouletteWheel.clearHighlights === 'function') {
                window.rouletteWheel.clearHighlights();
            }
            // ── PARITY GUARD ──
            // Do NOT null out window.moneyPanel.pendingBet here
            // unconditionally. If the previous spin placed a BET that
            // hasn't been resolved yet (placedAtSpinCount === current
            // spin count, awaiting the next spin), nulling it would
            // silently destroy that bet — exactly the bug AT does NOT
            // have, since the AT runner records the bet immediately on
            // testSpins[i+1]. Resolve any stale pendingBet first; only
            // clear when there is genuinely nothing to resolve and
            // the prior decision was actually a non-bet.
            if (window.moneyPanel && window.moneyPanel.pendingBet) {
                const pb = window.moneyPanel.pendingBet;
                const liveSpins = Array.isArray(window.spins) ? window.spins : null;
                const currentCount = liveSpins ? liveSpins.length : 0;
                if (typeof pb.placedAtSpinCount === 'number'
                    && pb.placedAtSpinCount < currentCount
                    && liveSpins
                    && liveSpins[pb.placedAtSpinCount]) {
                    const resolutionEntry = liveSpins[pb.placedAtSpinCount];
                    const resolutionActual = (resolutionEntry && typeof resolutionEntry.actual === 'number')
                        ? resolutionEntry.actual : null;
                    if (resolutionActual !== null && Array.isArray(pb.predictedNumbers)) {
                        const hit = pb.predictedNumbers.includes(resolutionActual);
                        try {
                            window.moneyPanel.recordBetResult(
                                pb.betAmount,
                                pb.numbersCount,
                                hit,
                                resolutionActual,
                                pb.predictedNumbers
                            );
                        } catch (_) { /* best-effort */ }
                    }
                }
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
        else if (mode === 'test') this.decisionMode = 'test';
        else if (mode === '3t-selection') this.decisionMode = '3t-selection';
        else if (mode === 'analytics') this.decisionMode = 'analytics';
        else this.decisionMode = 'auto';
        // Drop any queued AI-trained feedback when leaving ai-trained,
        // so a later re-entry cannot misattribute an old decision to a
        // freshly arrived spin.
        if (prev === 'ai-trained' && this.decisionMode !== 'ai-trained') {
            this._lastAITrainedLive = null;
        }
        // Strategy-Lab: clear the locked pair when leaving 'test' so a
        // future re-entry re-picks based on the latest pairModels.
        if (prev === 'test' && this.decisionMode !== 'test') {
            this._strategyLabLockedPair = null;
        }
        // 3T-Selection: same lifecycle, separate locked-pair var so
        // switching between 'test' and '3t-selection' doesn't leak state.
        if (prev === '3t-selection' && this.decisionMode !== '3t-selection') {
            this._3tLockedPair = null;
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

        // ─── PARITY-WITH-AUTO-TEST GATE ─────────────────────────────
        // The Auto Test runner cannot reach the controller's per-engine
        // cache from the Electron renderer (its `require()` for the
        // strategy module returns null because the strategy is loaded
        // via <script> tag, not CommonJS). As a result, AT never feeds
        // hit/miss outcomes back into the controller — its lossStreak
        // stays at 0 forever, and AT never enters RETRAIN/RECOVERY.
        //
        // To give the user 100% parity between AT and LIVE on the same
        // spin sequence, LIVE must also NOT feed outcomes back into the
        // controller. We keep the shadowHit write-back (cosmetic, for
        // diagnostics rendering) and the bookkeeping reset, but skip
        // the actual recordResult / recordShadow calls.
        //
        // If you ever re-enable controller feedback in LIVE, also add a
        // global fallback in the Auto Test runner's
        // _resolvePriorAITrainedDecision to read
        // globalThis.AITrainedStrategyAPI.__internal._getController
        // when require() returns null, otherwise the divergence returns.
        const action = prior.decision.action;
        if (action === 'SHADOW_PREDICT') {
            const shadowNums = Array.isArray(prior.decision.shadowNumbers) ? prior.decision.shadowNumbers : [];
            const shadowHit = shadowNums.includes(actual);
            // Mutate the SAME object referenced by the AI-mode tab render
            // so the live diagnostics carry the resolved flag.
            prior.decision.shadowHit = shadowHit;
        }
        // BET / WAIT / PROTECTION / RETRAIN / TERMINATE_SESSION carry no
        // controller-state side-effects in parity mode.
        void ctrl; void actual;
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
