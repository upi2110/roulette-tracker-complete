/**
 * Auto Test Runner — Backtesting simulation engine
 *
 * Runs sessions from each starting position in test data × 3 betting strategies.
 * Uses AI engine internal methods directly on plain number arrays (no DOM dependency).
 *
 * Reuses from ai-auto-engine.js:
 *   engine._getFlashingPairsFromHistory(spins, idx)
 *   engine._computeProjectionForPair(spins, idx, refKey)
 *   engine._applyFilterToNumbers(numbers, filterKey)
 *   engine._scorePair(refKey, pairData)
 *   engine._selectBestFilter(numbers)
 *   engine._computeConfidence(pairScore, filterScore, numbers)
 *   engine.recordResult(), engine.recordSkip(), engine.resetSession()
 *
 * Method dispatch:
 *   'auto-test' / 'test-strategy' → _simulateDecision() (unchanged).
 *   'T1-strategy'                 → decideT1Strategy() from t1-strategy.js.
 */

// Resolve the T1 strategy helper in both Node (tests) and browser
// (Electron) contexts. If it's unavailable for any reason, the runner
// silently falls back to _simulateDecision — the method label still
// round-trips on result.method, which keeps 'auto-test'/'test-strategy'
// safe from accidental regression.
let _decideT1Strategy = null;
try {
    // Node path — test harnesses load this file via require().
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
        // eslint-disable-next-line global-require
        // Stage B: canonical T1 helper lives under strategies/t1/.
        _decideT1Strategy = require('../strategies/t1/t1-strategy').decideT1Strategy;
    }
} catch (_) { /* browser path handled below */ }
if (!_decideT1Strategy && typeof window !== 'undefined' && typeof window.decideT1Strategy === 'function') {
    _decideT1Strategy = window.decideT1Strategy;
}

// Pair refKey → display name mapping (same as ai-auto-engine.js)
const TEST_REFKEY_TO_PAIR_NAME = {
    'prev': 'prev',
    'prev_plus_1': 'prevPlus1',
    'prev_minus_1': 'prevMinus1',
    'prev_plus_2': 'prevPlus2',
    'prev_minus_2': 'prevMinus2',
    'prev_prev': 'prevPrev'
};


const STRATEGY_NAMES = {
    1: 'Aggressive',
    2: 'Conservative',
    3: 'Cautious'
};

class AutoTestRunner {
    /**
     * @param {AIAutoEngine} engine - A TRAINED AIAutoEngine instance
     */
    constructor(engine, sessionConfig) {
        if (!engine) {
            throw new Error('AutoTestRunner requires an AIAutoEngine instance');
        }
        // Defer the legacy `engine.isTrained` check from constructor to
        // runAll(). The AI-trained method does NOT consume engine pair
        // models / sequence model and so does not need the engine to be
        // trained. Every other method still gets the same precondition,
        // surfaced inside runAll() as a clear ENGINE_NOT_TRAINED row so
        // callers see the same error semantics as before.
        this._engineMaybeUntrained = !engine.isTrained;
        this.engine = engine;

        // Session parameters — tunable via constructor or setSessionConfig()
        // Defaults: $10 bet cap, reset after 5 consecutive losses (benchmarked optimal)
        this._sessionConfig = Object.assign({
            STARTING_BANKROLL: 4000,
            TARGET_PROFIT: 100,
            MIN_BET: 2,
            MAX_BET: 10,
            LOSS_STREAK_RESET: 5,
            MAX_RESETS: 5,
            STOP_LOSS: 0            // 0 = use bankroll <= 0 as bust condition
        }, sessionConfig || {});
    }

    /**
     * Update session configuration for benchmarking.
     * @param {Object} config - Partial config to merge
     */
    setSessionConfig(config) {
        Object.assign(this._sessionConfig, config);
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN ENTRY POINT
    // ═══════════════════════════════════════════════════════════

    /**
     * Run the full test across all starting positions and strategies.
     *
     * @param {number[]} testSpins - Chronological array of spin numbers (0-36)
     * @param {Object} [options={}]
     * @param {number} [options.batchSize=20] - Sessions per setTimeout batch
     * @param {string} [options.testFile='manual'] - Test file name
     * @param {Function} [progressCallback] - (percent, message) => void
     * @returns {Promise<FullTestResult>}
     */
    async runAll(testSpins, options = {}, progressCallback) {
        const batchSize = options.batchSize || 20;
        const testFile = options.testFile || 'manual';
        // Auto Test method selected in the UI header dropdown. Passed
        // through to the returned result and stored on the runner so
        // _simulateDecision can branch on it. 'auto-test' and
        // 'test-strategy' share the default pipeline; 'T1-strategy'
        // dispatches to decideT1Strategy in t1-strategy.js.
        // Default 'auto-test' matches AUTO_TEST_DEFAULT_METHOD in
        // app/auto-test-ui.js (the original Auto Test mode).
        const method = typeof options.method === 'string' && options.method
            ? options.method
            : 'auto-test';
        this._currentMethod = method;

        // Mode-isolation opt-in gate. The caller may pass
        // `expectedTrainingMode` to assert that Auto Test is being run
        // against the model state produced by a specific TRAIN-mode.
        // If the registry's active mode does not match, the run is
        // aborted with a clear `WRONG_TRAINING_MODE` outcome and zero
        // sessions are executed.
        //
        // When the field is absent / null / empty string, the gate is
        // bypassed entirely and behavior is byte-identical to today.
        // Method-gated `engine.isTrained` precondition. AI-trained does
        // not consume engine internals, so it bypasses the legacy gate.
        // Every other method gets the same blocking semantics as before
        // — surfaced as ENGINE_NOT_TRAINED instead of a constructor throw.
        if (this._engineMaybeUntrained && method !== 'AI-trained') {
            return {
                testFile,
                method,
                totalTestSpins: testSpins ? testSpins.length : 0,
                trainedOn: 'N/A',
                timestamp: new Date().toISOString(),
                outcome: 'ENGINE_NOT_TRAINED',
                message: `Engine must be trained before running "${method}". Click TRAIN (Default mode) first.`,
                strategies: {},
                overall: null
            };
        }

        const expectedTrainingMode = (typeof options.expectedTrainingMode === 'string' && options.expectedTrainingMode)
            ? options.expectedTrainingMode
            : null;
        if (expectedTrainingMode) {
            let TS = null;
            try {
                // Step 3 cutover: prefer the new training/ folder.
                if (typeof require === 'function') TS = require('../training/training-state.js');
            } catch (_) { /* fall through */ }
            if (!TS && typeof window !== 'undefined' && window.TrainingState) {
                TS = window.TrainingState;
            }
            const activeTrainingMode = TS ? TS.getActiveMode() : null;
            if (activeTrainingMode !== expectedTrainingMode) {
                return {
                    testFile,
                    method,
                    totalTestSpins: testSpins ? testSpins.length : 0,
                    trainedOn: 'N/A',
                    timestamp: new Date().toISOString(),
                    expectedTrainingMode,
                    activeTrainingMode,
                    outcome: 'WRONG_TRAINING_MODE',
                    message: `Trained mode "${activeTrainingMode || 'none'}" does not match expected "${expectedTrainingMode}" — Auto Test aborted.`,
                    strategies: {},
                    overall: null
                };
            }
        }

        if (!testSpins || testSpins.length < 5) {
            return {
                testFile,
                method,
                totalTestSpins: testSpins ? testSpins.length : 0,
                trainedOn: 'N/A',
                timestamp: new Date().toISOString(),
                strategies: {
                    1: { sessions: [], summary: this._emptyStrategySummary() },
                    2: { sessions: [], summary: this._emptyStrategySummary() },
                    3: { sessions: [], summary: this._emptyStrategySummary() }
                }
            };
        }

        const allSessions = { 1: [], 2: [], 3: [] };

        // Total work: each starting position × 3 strategies
        // We need at least 4 spins from startIdx, so max start = testSpins.length - 5
        const maxStart = testSpins.length - 5;
        const totalWork = (maxStart + 1) * 3;
        let completed = 0;

        // Disable retrain during batch testing — training data is sufficient.
        // Risk management (bet cap + loss-streak reset) handles bust prevention.
        const savedRetrainInterval = this.engine._retrainInterval;
        const savedRetrainLossStreak = this.engine._retrainLossStreak;
        this.engine._retrainInterval = Infinity;
        this.engine._retrainLossStreak = Infinity;

        for (let startIdx = 0; startIdx <= maxStart; startIdx++) {
            for (const strategy of [1, 2, 3]) {
                // Reset engine session between simulations
                this.engine.resetSession();

                const result = this._runSession(testSpins, startIdx, strategy);
                allSessions[strategy].push(result);

                completed++;
                if (progressCallback) {
                    const pct = Math.round((completed / totalWork) * 100);
                    progressCallback(pct, `Session ${completed}/${totalWork} (Start: ${startIdx}, Strategy: ${strategy})`);
                }

                // Yield after every session — runs like live, one at a time
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // Restore live retrain settings
        this.engine._retrainInterval = savedRetrainInterval;
        this.engine._retrainLossStreak = savedRetrainLossStreak;

        const result = {
            testFile,
            method,
            totalTestSpins: testSpins.length,
            trainedOn: `${Object.keys(this.engine.pairModels).length} pairs trained`,
            timestamp: new Date().toISOString(),
            strategies: {
                1: { sessions: allSessions[1], summary: this._computeSummary(allSessions[1]) },
                2: { sessions: allSessions[2], summary: this._computeSummary(allSessions[2]) },
                3: { sessions: allSessions[3], summary: this._computeSummary(allSessions[3]) }
            }
        };

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    //  SESSION SIMULATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Simulate one complete session from a starting position with a given strategy.
     *
     * @param {number[]} testSpins - Full chronological test data
     * @param {number} startIdx - Index to start from
     * @param {number} strategy - 1=Aggressive, 2=Conservative, 3=Cautious
     * @returns {SessionResult}
     */
    _runSession(testSpins, startIdx, strategy) {
        const { STARTING_BANKROLL, TARGET_PROFIT, MIN_BET, MAX_BET, LOSS_STREAK_RESET, MAX_RESETS, STOP_LOSS } = this._sessionConfig;

        const sessionState = {
            bankroll: STARTING_BANKROLL,
            profit: 0,
            betPerNumber: MIN_BET,
            totalBets: 0,
            totalSkips: 0,
            wins: 0,
            losses: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            maxDrawdown: 0,
            peakProfit: 0,
            reanalyzeCount: 0
        };

        const steps = [];

        // AI-trained feedback boundary: reset the per-engine controller
        // and the adapter's prior-decision slot at each session start.
        // Scoped to 'AI-trained' so 'auto-test' and 'T1-strategy' paths
        // are byte-identical to before this change.
        if (this._currentMethod === 'AI-trained') {
            try {
                // Step 5 cutover: prefer the new strategies/ai-trained/ folder.
                // Browser still loads app/ via <script> tags for window.*.
                const mod = (typeof require === 'function') ? require('../strategies/ai-trained/ai-trained-strategy.js') : null;
                if (mod && typeof mod.resetAITrainedStrategy === 'function') {
                    mod.resetAITrainedStrategy(this.engine);
                } else if (typeof resetAITrainedStrategy === 'function') {
                    resetAITrainedStrategy(this.engine);
                }
            } catch (_) { /* best-effort */ }
            this._lastAITrained = null;
        }

        // ── PHASE 1: WATCH (3 spins — observe only) ──
        for (let w = 0; w < 3 && (startIdx + w) < testSpins.length; w++) {
            const wi = startIdx + w;
            steps.push({
                spinIdx: wi,
                spinNumber: testSpins[wi],
                nextNumber: (wi + 1 < testSpins.length) ? testSpins[wi + 1] : null,
                action: 'WATCH',
                selectedPair: null,
                selectedFilter: null,
                predictedNumbers: [],
                confidence: 0,
                betPerNumber: sessionState.betPerNumber,
                numbersCount: 0,
                hit: false,
                pnl: 0,
                bankroll: sessionState.bankroll,
                cumulativeProfit: sessionState.profit
            });
        }

        // ── PHASE 2: LIVE — bet with risk management ──
        for (let i = startIdx + 3; i < testSpins.length - 1; i++) {
            const decision = this._simulateDecision(testSpins, i);

            if (decision.action === 'BET') {
                const nextActual = testSpins[i + 1];
                const hit = decision.numbers.includes(nextActual);
                const numbersCount = decision.numbers.length;
                const betUsed = sessionState.betPerNumber; // save BEFORE strategy adjusts it
                const pnl = this._calculatePnL(betUsed, numbersCount, hit);

                // Update bankroll
                sessionState.bankroll += pnl;
                sessionState.profit += pnl;
                sessionState.totalBets++;

                if (hit) {
                    sessionState.wins++;
                    sessionState.consecutiveWins++;
                    sessionState.consecutiveLosses = 0;
                } else {
                    sessionState.losses++;
                    sessionState.consecutiveLosses++;
                    sessionState.consecutiveWins = 0;
                }

                // Track peak and drawdown
                if (sessionState.profit > sessionState.peakProfit) {
                    sessionState.peakProfit = sessionState.profit;
                }
                const drawdown = sessionState.peakProfit - sessionState.profit;
                if (drawdown > sessionState.maxDrawdown) {
                    sessionState.maxDrawdown = drawdown;
                }

                // Apply strategy for next bet, then enforce MAX_BET cap
                sessionState.betPerNumber = Math.min(
                    this._applyStrategy(strategy, hit, sessionState),
                    MAX_BET
                );

                // Record result for engine session adaptation
                const refKey = decision.selectedPair
                    ? (Object.entries(TEST_REFKEY_TO_PAIR_NAME).find(([k, v]) => v === decision.selectedPair) || [decision.selectedPair])[0]
                    : 'unknown';
                this.engine.recordResult(refKey, decision.selectedFilter || 'both_both', hit, nextActual, decision.numbers);

                steps.push(Object.assign({
                    spinIdx: i,
                    spinNumber: testSpins[i],
                    nextNumber: nextActual,
                    action: 'BET',
                    selectedPair: decision.selectedPair,
                    selectedFilter: decision.selectedFilter,
                    predictedNumbers: decision.numbers,
                    confidence: decision.confidence,
                    betPerNumber: betUsed, // actual bet used for THIS row's P&L
                    numbersCount,
                    hit,
                    pnl,
                    bankroll: sessionState.bankroll,
                    cumulativeProfit: sessionState.profit
                }, decision.aiTrained ? { aiTrained: decision.aiTrained } : {}));

                // Check WIN
                if (sessionState.profit >= TARGET_PROFIT) {
                    return this._buildSessionResult(startIdx, strategy, 'WIN', sessionState, steps);
                }

                // Check BUST (bankroll depleted or stop-loss hit)
                const bustThreshold = STOP_LOSS > 0 ? (STARTING_BANKROLL - STOP_LOSS) : 0;
                if (sessionState.bankroll <= bustThreshold) {
                    return this._buildSessionResult(startIdx, strategy, 'BUST', sessionState, steps);
                }

                // ── LOSS STREAK PROTECTION: reset bet to stop escalation ──
                if (sessionState.consecutiveLosses >= LOSS_STREAK_RESET && sessionState.reanalyzeCount < MAX_RESETS) {
                    sessionState.reanalyzeCount++;

                    // Reset bet to minimum — stops escalation death spiral
                    sessionState.betPerNumber = MIN_BET;
                    sessionState.consecutiveLosses = 0;

                    steps.push({
                        spinIdx: i,
                        spinNumber: testSpins[i],
                        nextNumber: null,
                        action: 'REANALYZE',
                        selectedPair: decision.selectedPair,
                        selectedFilter: decision.selectedFilter,
                        predictedNumbers: [],
                        confidence: 0,
                        betPerNumber: MIN_BET,
                        numbersCount: 0,
                        hit: false,
                        pnl: 0,
                        bankroll: sessionState.bankroll,
                        cumulativeProfit: sessionState.profit
                    });
                }
            } else {
                // SKIP
                sessionState.totalSkips++;
                this.engine.recordSkip();

                steps.push(Object.assign({
                    spinIdx: i,
                    spinNumber: testSpins[i],
                    nextNumber: testSpins[i + 1],
                    action: 'SKIP',
                    selectedPair: null,
                    selectedFilter: null,
                    predictedNumbers: [],
                    confidence: decision.confidence,
                    betPerNumber: sessionState.betPerNumber,
                    numbersCount: 0,
                    hit: false,
                    pnl: 0,
                    bankroll: sessionState.bankroll,
                    cumulativeProfit: sessionState.profit
                }, decision.aiTrained ? { aiTrained: decision.aiTrained } : {}));
            }
        }

        // Ran out of spins
        return this._buildSessionResult(startIdx, strategy, 'INCOMPLETE', sessionState, steps);
    }

    /**
     * Build a SessionResult object from session state.
     */
    _buildSessionResult(startIdx, strategy, outcome, state, steps) {
        const nonBetActions = steps.filter(s => s.action === 'WATCH' || s.action === 'REANALYZE').length;
        const result = {
            startIdx,
            strategy,
            outcome,
            finalBankroll: state.bankroll,
            finalProfit: state.profit,
            totalSpins: steps.length - nonBetActions,
            totalBets: state.totalBets,
            totalSkips: state.totalSkips,
            wins: state.wins,
            losses: state.losses,
            winRate: state.totalBets > 0 ? state.wins / state.totalBets : 0,
            maxDrawdown: state.maxDrawdown,
            peakProfit: state.peakProfit,
            reanalyzeCount: state.reanalyzeCount || 0,
            steps
        };
        // AI-trained-only additions. Attached via Object.assign so legacy
        // method outputs keep their exact key set and ordering.
        if (this._currentMethod === 'AI-trained') {
            try {
                // Step 5 cutover: prefer the new strategies/ai-trained/ folder.
                const loggerMod = (typeof require === 'function') ? require('../strategies/ai-trained/ai-trained-logger.js') : null;
                const aggregate = loggerMod
                    ? loggerMod.aggregateAITrainedSteps
                    : (typeof aggregateAITrainedSteps === 'function' ? aggregateAITrainedSteps : null);
                if (aggregate) {
                    result.method = 'AI-trained';
                    result.aiTrainedSummary = aggregate(steps);
                }
            } catch (_) { /* best-effort — legacy output unaffected */ }
        }
        return result;
    }

    // T2 Flash Simulation — delegates to engine.simulateT2FlashAndNumbers()
    // (shared implementation ensures Auto mode and Test mode produce identical predictions)

    // ═══════════════════════════════════════════════════════════
    //  DECISION SIMULATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Simulate a decision at spin index idx using engine internals.
     * Combines T3 flash + T2 flash + Set prediction pipeline.
     * Mirrors engine.decide() but works on plain number arrays.
     *
     * @param {number[]} testSpins - Full test data
     * @param {number} idx - Current index to make decision at
     * @param {Set} [blacklistedPairs] - Pairs to skip (failed in this session)
     * @returns {{ action: string, selectedPair: string|null, selectedFilter: string|null,
     *             numbers: number[], confidence: number, reason: string }}
     */
    _simulateDecision(testSpins, idx, blacklistedPairs) {
        // Method dispatch: 'T1-strategy' uses its own decision policy
        // (see app/t1-strategy.js). 'auto-test' and 'test-strategy'
        // share this default pipeline — their behaviour is byte-
        // identical to before the T1-strategy feature was added.
        if (this._currentMethod === 'T1-strategy' && typeof _decideT1Strategy === 'function') {
            return _decideT1Strategy(this.engine, testSpins, idx);
        }
        if (this._currentMethod === 'AI-trained') {
            return this._aiTrainedAdapter(testSpins, idx);
        }

        const skipResult = (reason) => {
            this.engine._currentDecisionSpins = null; // Clean up on skip
            return {
                action: 'SKIP',
                selectedPair: null,
                selectedFilter: null,
                numbers: [],
                confidence: 0,
                reason
            };
        };

        if (idx < 3) return skipResult('Insufficient history');

        // Set current decision spins on engine so inner methods (_scorePair, _selectBestFilter)
        // use the correct spins instead of _getWindowSpins() (which may differ in test context)
        this.engine._currentDecisionSpins = testSpins.slice(0, idx + 1);

        // ── Step 1: T3 Flash Detection + Pair Selection (existing) ──
        const flashingPairs = this.engine._getFlashingPairsFromHistory(testSpins, idx);
        let t3Numbers = [];
        let t3BestPair = null;

        if (flashingPairs.size > 0) {
            const t3Candidates = [];
            for (const [refKey, flashInfo] of flashingPairs) {
                // Skip blacklisted pairs
                const pairName = TEST_REFKEY_TO_PAIR_NAME[refKey] || refKey;
                if (blacklistedPairs && blacklistedPairs.has(pairName)) continue;

                const projection = this.engine._computeProjectionForPair(testSpins, idx, refKey);
                if (projection && projection.numbers.length > 0) {
                    t3Candidates.push({ refKey, pairName, numbers: projection.numbers, data: projection });
                }
            }
            if (t3Candidates.length > 0) {
                const scored = t3Candidates.map(c => ({ ...c, score: this.engine._scorePair(c.refKey, c) }));
                scored.sort((a, b) => b.score - a.score);
                t3BestPair = scored[0];
                t3Numbers = t3BestPair.numbers;
            }
        }

        // ── Step 2: T2 Flash Detection + NEXT Row Numbers ──
        const t2Data = this.engine.simulateT2FlashAndNumbers(testSpins, idx);
        const t2Numbers = t2Data ? t2Data.numbers : [];

        // ── Must have at least one source ──
        if (t3Numbers.length === 0 && t2Numbers.length === 0) {
            return skipResult('No T2 or T3 flash data available');
        }

        // ── Step 3: Combine T2 + T3 Numbers ──
        const combinedSet = new Set([...t3Numbers, ...t2Numbers]);
        const combinedNumbers = Array.from(combinedSet);

        // ── Step 4: Predict Best Set ──
        const recentSpins = testSpins.slice(Math.max(0, idx - 10), idx);
        const setPrediction = this.engine._predictBestSet(combinedNumbers, recentSpins);

        // ── Step 5: Apply both_both_setN Filter ──
        const filteredNumbers = this.engine._applyFilterToNumbers(combinedNumbers, setPrediction.filterKey);

        // ── Step 6: Confidence + BET/SKIP ──
        const pairScore = t3BestPair ? this.engine._scorePair(t3BestPair.refKey, t3BestPair) : 0.5;
        const confidence = this.engine._computeConfidence(pairScore, setPrediction.score, filteredNumbers);

        const effectiveThreshold = this.engine.confidenceThreshold;
        const forcebet = this.engine.session.consecutiveSkips >= this.engine.maxConsecutiveSkips;

        // Clean up decision spins context
        this.engine._currentDecisionSpins = null;

        if (confidence >= effectiveThreshold || forcebet) {
            const pairName = t3BestPair ? t3BestPair.pairName : (t2Data ? t2Data.dataPair : 'unknown');
            return {
                action: 'BET',
                selectedPair: pairName,
                selectedFilter: setPrediction.filterKey,
                numbers: filteredNumbers,
                confidence,
                reason: forcebet && confidence < effectiveThreshold
                    ? `Forced bet after ${this.engine.session.consecutiveSkips} skips`
                    : `T2:${t2Data ? t2Data.dataPair : 'none'}+T3:${t3BestPair ? t3BestPair.pairName : 'none'} → ${setPrediction.filterKey} (conf: ${confidence}%)`
            };
        }

        return skipResult(`Low confidence ${confidence}% < ${effectiveThreshold}%`);
    }

    // ───────────────────────────────────────────────────────────
    //  AI-trained adapter (Phase 1, Step 3)
    //  Thin, method-gated. Delegates all logic to AITrainedController
    //  via decideAITrainedStrategy(). Maps WAIT / SHADOW_PREDICT /
    //  PROTECTION / TERMINATE_SESSION to the runner's 'SKIP' action
    //  so they are never treated as bets (no P&L, no bankroll change).
    //  BET passes through with controller-capped (<=12) numbers.
    //  The original controller decision is preserved under `aiTrained`.
    // ───────────────────────────────────────────────────────────
    _aiTrainedAdapter(testSpins, idx) {
        const strategyMod = (typeof require === 'function')
            // Step 5 cutover: prefer the new strategies/ai-trained/ folder.
            ? (function(){ try { return require('../strategies/ai-trained/ai-trained-strategy.js'); } catch(_) { return null; } })()
            : null;
        const decide = strategyMod
            ? strategyMod.decideAITrainedStrategy
            : (typeof decideAITrainedStrategy === 'function' ? decideAITrainedStrategy : null);

        if (!decide) {
            return {
                action: 'SKIP',
                selectedPair: null,
                selectedFilter: null,
                numbers: [],
                confidence: 0,
                reason: 'AI-trained strategy unavailable'
            };
        }

        // Resolve the prior AI-trained decision before producing a new
        // one. The decision at prior.idx predicts testSpins[prior.idx+1];
        // when this adapter runs at idx, that outcome is observable.
        this._resolvePriorAITrainedDecision(testSpins, idx, strategyMod);

        const aiDecision = decide(this.engine, testSpins, idx);

        // Track the new decision so the NEXT adapter call can resolve it.
        // The reference we store is the SAME object that will be written
        // into step.aiTrained (see BET/SKIP push sites). Mutations here
        // (e.g. shadowHit write-back) propagate into the step log.
        this._lastAITrained = { idx, decision: aiDecision };
        const confidencePct = Math.round((aiDecision.confidence || 0) * 100);

        if (aiDecision.action === 'BET') {
            return {
                action: 'BET',
                selectedPair: null,        // AI-trained never uses user pairs
                selectedFilter: null,
                numbers: aiDecision.numbers,
                confidence: confidencePct,
                reason: `AI-trained ${aiDecision.phase}: ${aiDecision.reason}`,
                aiTrained: aiDecision
            };
        }

        // WAIT, SHADOW_PREDICT, PROTECTION, TERMINATE_SESSION, RETRAIN
        // are all non-bets from the runner's point of view.
        return {
            action: 'SKIP',
            selectedPair: null,
            selectedFilter: null,
            numbers: [],
            confidence: confidencePct,
            reason: `AI-trained ${aiDecision.phase} ${aiDecision.action}: ${aiDecision.reason}`,
            aiTrained: aiDecision
        };
    }

    /**
     * Feed the prior AI-trained decision's outcome back into the cached
     * controller. Called from `_aiTrainedAdapter` at the top of every
     * tick. The decision at prior.idx predicts testSpins[prior.idx + 1];
     * when the adapter runs at idx, that cell is observable.
     *
     * - Prior BET  → controller.recordResult({hit, actual, ...})
     * - Prior SHADOW_PREDICT → controller.recordShadow({actual, ...}),
     *                          and write `shadowHit` back onto the
     *                          stored decision so the step log carries it.
     * - WAIT / PROTECTION / RETRAIN / TERMINATE_SESSION → no-op.
     */
    _resolvePriorAITrainedDecision(testSpins, idx, strategyMod) {
        const prior = this._lastAITrained;
        if (!prior || !prior.decision) return;
        const outcomeIdx = prior.idx + 1;
        // Guard: the outcome must be observable at or before the current tick.
        if (outcomeIdx >= testSpins.length || outcomeIdx > idx) {
            return;
        }
        const actual = testSpins[outcomeIdx];

        // Resolve the controller instance from the strategy module's
        // per-engine cache. Falls back to a no-op if the strategy module
        // is not loaded (e.g. stubbed tests).
        const getCtrl = strategyMod && strategyMod.__internal && strategyMod.__internal._getController;
        const controller = getCtrl ? getCtrl(this.engine) : null;

        const action = prior.decision.action;
        if (action === 'BET') {
            const nums = Array.isArray(prior.decision.numbers) ? prior.decision.numbers : [];
            const hit = nums.includes(actual);
            if (controller && typeof controller.recordResult === 'function') {
                controller.recordResult({ idx: prior.idx, hit, actual, decision: prior.decision });
            }
        } else if (action === 'SHADOW_PREDICT') {
            const shadowNums = Array.isArray(prior.decision.shadowNumbers) ? prior.decision.shadowNumbers : [];
            const shadowHit = shadowNums.includes(actual);
            if (controller && typeof controller.recordShadow === 'function') {
                controller.recordShadow({ idx: prior.idx, actual, decision: prior.decision });
            }
            // Mutate the SAME object that was stored in step.aiTrained
            // so the audit log carries the resolved flag.
            prior.decision.shadowHit = shadowHit;
        }
        // WAIT / PROTECTION / RETRAIN / TERMINATE_SESSION carry no outcome.
        this._lastAITrained = null;
    }

    // ═══════════════════════════════════════════════════════════
    //  STRATEGY & P&L
    // ═══════════════════════════════════════════════════════════

    /**
     * Calculate profit/loss for a single bet.
     *
     * Roulette: 35:1 on one number. You bet on multiple numbers.
     * Win = betPerNumber × 35 - (betPerNumber × numbersCount) + betPerNumber
     *     = betPerNumber × (36 - numbersCount)
     * Loss = -(betPerNumber × numbersCount)
     *
     * @param {number} betPerNumber - Bet amount per number
     * @param {number} numbersCount - How many numbers bet on
     * @param {boolean} hit - Whether the actual number was in predicted set
     * @returns {number} Net change (positive or negative)
     */
    _calculatePnL(betPerNumber, numbersCount, hit) {
        if (hit) {
            // Win: get 35× on the winning number, lose on all others
            return betPerNumber * 35 - betPerNumber * (numbersCount - 1);
        }
        // Loss: lose all bets
        return -(betPerNumber * numbersCount);
    }

    /**
     * Apply betting strategy to determine next bet amount.
     * Replicates money-management-panel.js logic.
     *
     * @param {number} strategy - 1=Aggressive, 2=Conservative, 3=Cautious
     * @param {boolean} hit - Whether last bet won
     * @param {Object} state - Session state with consecutiveLosses, consecutiveWins, betPerNumber
     * @returns {number} New betPerNumber (min $2)
     */
    _applyStrategy(strategy, hit, state) {
        const MIN_BET = 2;
        let bet = state.betPerNumber;

        if (strategy === 1) {
            // Strategy 1: Aggressive — +$1 each loss, -$1 each win
            if (hit) {
                bet = Math.max(MIN_BET, bet - 1);
            } else {
                bet = bet + 1;
            }
        } else if (strategy === 2) {
            // Strategy 2: Conservative — +$1 after 2 consecutive losses, -$1 after 2 consecutive wins
            if (hit) {
                if (state.consecutiveWins >= 2) {
                    bet = Math.max(MIN_BET, bet - 1);
                    state.consecutiveWins = 0; // Reset after adjustment
                }
            } else {
                if (state.consecutiveLosses >= 2) {
                    bet = bet + 1;
                    state.consecutiveLosses = 0; // Reset after adjustment
                }
            }
        } else if (strategy === 3) {
            // Strategy 3: Cautious — +$2 after 3 consecutive losses, -$1 after 2 consecutive wins
            if (hit) {
                if (state.consecutiveWins >= 2) {
                    bet = Math.max(MIN_BET, bet - 1);
                    state.consecutiveWins = 0; // Reset after adjustment
                }
            } else {
                if (state.consecutiveLosses >= 3) {
                    bet = bet + 2;
                    state.consecutiveLosses = 0; // Reset after adjustment
                }
            }
        }

        return bet;
    }

    // ═══════════════════════════════════════════════════════════
    //  SUMMARY COMPUTATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Compute summary statistics for a set of sessions.
     *
     * @param {SessionResult[]} sessions
     * @returns {StrategySummary}
     */
    _computeSummary(sessions) {
        if (sessions.length === 0) return this._emptyStrategySummary();

        const wins = sessions.filter(s => s.outcome === 'WIN');
        const busts = sessions.filter(s => s.outcome === 'BUST');
        const incomplete = sessions.filter(s => s.outcome === 'INCOMPLETE');

        const decidedSessions = wins.length + busts.length;

        // Average spins to win/bust
        const avgSpinsToWin = wins.length > 0
            ? wins.reduce((sum, s) => sum + s.totalSpins, 0) / wins.length
            : 0;
        const avgSpinsToBust = busts.length > 0
            ? busts.reduce((sum, s) => sum + s.totalSpins, 0) / busts.length
            : 0;

        // Max spins to win (worst winning session)
        const maxSpinsToWin = wins.length > 0
            ? Math.max(...wins.map(s => s.totalSpins))
            : 0;

        // Decided sessions = wins + busts (skip incomplete only)
        const decided = [...wins, ...busts];

        // Total profit from decided sessions (excludes incomplete)
        const totalProfit = decided.reduce((sum, s) => sum + s.finalProfit, 0);

        // Average profit from decided sessions (excludes incomplete)
        const avgProfit = decided.length > 0 ? totalProfit / decided.length : 0;

        // Gross won / lost dollar totals across every BET step in every
        // decided session. A winning bet's payout is step.pnl > 0; a
        // losing bet's stake loss is step.pnl < 0. We sum gross positives
        // and gross negatives separately so the report can show:
        //   Total Win $  = sum of positive pnl steps
        //   Total Loss $ = absolute sum of negative pnl steps (positive $)
        //   Total P&L    = totalWon - totalLost (== totalProfit)
        // Nothing in the session math itself is changed — this is a
        // derivation layered on top of the existing step.pnl values.
        let totalWon = 0;
        let totalLost = 0;
        for (const s of decided) {
            if (!Array.isArray(s.steps)) continue;
            for (const step of s.steps) {
                if (typeof step.pnl !== 'number') continue;
                if (step.pnl > 0) totalWon += step.pnl;
                else if (step.pnl < 0) totalLost += -step.pnl;
            }
        }

        // Max drawdown across all sessions
        const maxDrawdown = Math.max(0, ...sessions.map(s => s.maxDrawdown));

        // Best/worst session
        let bestSession = { startIdx: 0, finalProfit: -Infinity };
        let worstSession = { startIdx: 0, finalProfit: Infinity };
        for (const s of sessions) {
            if (s.finalProfit > bestSession.finalProfit) {
                bestSession = { startIdx: s.startIdx, finalProfit: s.finalProfit };
            }
            if (s.finalProfit < worstSession.finalProfit) {
                worstSession = { startIdx: s.startIdx, finalProfit: s.finalProfit };
            }
        }

        return {
            totalSessions: sessions.length,
            wins: wins.length,
            busts: busts.length,
            incomplete: incomplete.length,
            winRate: decidedSessions > 0 ? wins.length / decidedSessions : 0,
            avgSpinsToWin: Math.round(avgSpinsToWin * 10) / 10,
            maxSpinsToWin,
            avgSpinsToBust: Math.round(avgSpinsToBust * 10) / 10,
            totalProfit: Math.round(totalProfit * 100) / 100,
            totalWon: Math.round(totalWon * 100) / 100,
            totalLost: Math.round(totalLost * 100) / 100,
            avgProfit: Math.round(avgProfit * 100) / 100,
            maxDrawdown: Math.round(maxDrawdown * 100) / 100,
            bestSession,
            worstSession
        };
    }

    /**
     * Return an empty strategy summary (for no data).
     */
    _emptyStrategySummary() {
        return {
            totalSessions: 0,
            wins: 0,
            busts: 0,
            incomplete: 0,
            winRate: 0,
            avgSpinsToWin: 0,
            maxSpinsToWin: 0,
            avgSpinsToBust: 0,
            totalProfit: 0,
            totalWon: 0,
            totalLost: 0,
            avgProfit: 0,
            maxDrawdown: 0,
            bestSession: { startIdx: 0, finalProfit: 0 },
            worstSession: { startIdx: 0, finalProfit: 0 }
        };
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutoTestRunner, TEST_REFKEY_TO_PAIR_NAME, STRATEGY_NAMES };
}
if (typeof window !== 'undefined') {
    window.AutoTestRunner = AutoTestRunner;
}

console.log('✅ Auto Test Runner script loaded');
