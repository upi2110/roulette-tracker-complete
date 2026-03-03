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
 */

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
        if (!engine.isTrained) {
            throw new Error('Engine must be trained before running tests');
        }
        this.engine = engine;
        this._enableLogging = false; // Set to true for detailed decision logs
        this._logBuffer = [];        // Verbose log buffer (flushed per session)
        this._logFilename = null;    // Current log filename

        // Session parameters — tunable via constructor or setSessionConfig()
        // Defaults: $10 bet cap, reset after 5 consecutive losses (benchmarked optimal)
        this._sessionConfig = Object.assign({
            STARTING_BANKROLL: 4000,
            TARGET_PROFIT: 100,
            MIN_BET: 2,
            MAX_BET: 10,
            LOSS_STREAK_RESET: 5,
            MAX_RESETS: 5,
            STOP_LOSS: 0,           // 0 = use bankroll <= 0 as bust condition
            MAX_SESSION_SPINS: 60   // Safety net: cap total spins per session
        }, sessionConfig || {});
    }

    /**
     * Write a verbose log line to the buffer (flushed to file per session via IPC).
     */
    _vlog(source, level, message, data) {
        if (!this._enableLogging) return;
        const ts = new Date().toISOString().slice(11, 23);
        const line = `[${ts}] [${source}] [${level}] ${message}` + (data ? ` | ${JSON.stringify(data)}` : '') + '\n';
        this._logBuffer.push(line);
    }

    /**
     * Flush log buffer to file via IPC (if available).
     */
    async _flushLog() {
        if (this._logBuffer.length === 0 || !this._logFilename) return;
        const content = this._logBuffer.join('');
        this._logBuffer = [];
        if (typeof window !== 'undefined' && window.aiAPI && window.aiAPI.appendSessionLog) {
            await window.aiAPI.appendSessionLog(this._logFilename, content);
        }
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

        if (!testSpins || testSpins.length < 5) {
            return {
                testFile,
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

        // Snapshot engine learning state BEFORE test loop.
        // recordResult() mutates pairBayesian, pairModels.hitRate, filterModels.hitRate
        // across sessions. Restore pristine state before each session so every session
        // sees the same engine state as a fresh live session would.
        const savedBayesian = JSON.parse(JSON.stringify(this.engine.pairBayesian || {}));
        const savedBayesianCount = this.engine._totalBayesianDecisions || 0;
        const savedPairModels = JSON.parse(JSON.stringify(this.engine.pairModels || {}));
        const savedFilterModels = JSON.parse(JSON.stringify(this.engine.filterModels || {}));

        // Verbose: start log file and snapshot engine state
        if (this._enableLogging) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            this._logFilename = `test-runner-${ts}.log`;
            this._logBuffer = [];
            this._vlog('RUNNER', 'INFO', 'Test run started', { testFile, totalSpins: testSpins.length, maxStart, totalWork });
            this._vlog('RUNNER', 'INFO', 'Engine State Snapshot (pre-test)', {
                isTrained: this.engine.isTrained,
                learningVersion: this.engine.learningVersion,
                totalBayesianDecisions: savedBayesianCount,
                pairBayesianSnapshot: Object.fromEntries(
                    Object.entries(savedBayesian).map(([k, v]) => [k, { alpha: v.alpha, beta: v.beta, mean: +(v.alpha / (v.alpha + v.beta)).toFixed(4) }])
                ),
                pairModelHitRates: Object.fromEntries(
                    Object.entries(savedPairModels).map(([k, v]) => [k, { hitRate: +(v.hitRate || 0).toFixed(4), covEff: +(v.coverageEfficiency || 0).toFixed(4), totalFlashes: v.totalFlashes }])
                )
            });
        }

        for (let startIdx = 0; startIdx <= maxStart; startIdx++) {
            for (const strategy of [1, 2, 3]) {
                // Reset engine session AND restore pristine learning state
                this.engine.resetSession();
                this.engine.pairBayesian = JSON.parse(JSON.stringify(savedBayesian));
                this.engine._totalBayesianDecisions = savedBayesianCount;
                this.engine.pairModels = JSON.parse(JSON.stringify(savedPairModels));
                this.engine.filterModels = JSON.parse(JSON.stringify(savedFilterModels));

                const result = this._runSession(testSpins, startIdx, strategy);
                allSessions[strategy].push(result);

                completed++;
                if (progressCallback) {
                    const pct = Math.round((completed / totalWork) * 100);
                    progressCallback(pct, `Session ${completed}/${totalWork} (Start: ${startIdx}, Strategy: ${strategy})`);
                }

                // Yield after every session — runs like live, one at a time
                await new Promise(r => setTimeout(r, 0));

                // Flush verbose logs every 50 sessions to avoid huge buffer
                if (this._enableLogging && completed % 50 === 0) {
                    await this._flushLog();
                }
            }
        }

        // Flush remaining verbose logs
        if (this._enableLogging) {
            this._vlog('RUNNER', 'INFO', 'Test run complete', { completed, totalWork });
            await this._flushLog();
        }

        // Restore original engine learning state (undo any mutations from last session)
        this.engine.pairBayesian = savedBayesian;
        this.engine._totalBayesianDecisions = savedBayesianCount;
        this.engine.pairModels = savedPairModels;
        this.engine.filterModels = savedFilterModels;

        // Restore live retrain settings
        this.engine._retrainInterval = savedRetrainInterval;
        this.engine._retrainLossStreak = savedRetrainLossStreak;

        const result = {
            testFile,
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
        const { STARTING_BANKROLL, TARGET_PROFIT, MIN_BET, MAX_BET, LOSS_STREAK_RESET, MAX_RESETS, STOP_LOSS, MAX_SESSION_SPINS } = this._sessionConfig;

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
            // Session-scoped spins: only pass spins from startIdx onwards.
            // This matches live mode where decide() only has window.spins (what user entered).
            const sessionSpins = testSpins.slice(startIdx, i + 1);
            const decision = this._simulateDecision(sessionSpins, sessionSpins.length - 1);

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
                // (must happen before recovery bet cap so trend state is updated)
                const refKey = decision.selectedPair
                    ? (Object.entries(TEST_REFKEY_TO_PAIR_NAME).find(([k, v]) => v === decision.selectedPair) || [decision.selectedPair])[0]
                    : 'unknown';
                this.engine.recordResult(refKey, decision.selectedFilter || 'both_both', hit, nextActual, decision.numbers);

                steps.push({
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
                });

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

                steps.push({
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
                });
            }

            // Safety net: cap session at MAX_SESSION_SPINS total steps
            if (MAX_SESSION_SPINS > 0 && steps.length >= MAX_SESSION_SPINS) {
                return this._buildSessionResult(startIdx, strategy, 'INCOMPLETE', sessionState, steps);
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
        return {
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
        const skipResult = (reason) => {
            this.engine._currentDecisionSpins = null; // Clean up on skip
            if (this._enableLogging) console.log(`[TEST-LOG] _simulateDecision() → SKIP: ${reason}`);
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

        const decisionSpins = testSpins.slice(0, idx + 1);
        if (this._enableLogging) console.log(`[TEST-LOG] _simulateDecision() | spinCount=${decisionSpins.length} | idx=${idx} | spins=[${decisionSpins.join(',')}] | trendState=${this.engine.session.trendState} | totalBets=${this.engine.session.totalBets}`);

        // Set current decision spins on engine so inner methods (_scorePair, _selectBestFilter)
        // use the correct spins instead of _getWindowSpins() (which may differ in test context)
        this.engine._currentDecisionSpins = decisionSpins;

        // ── Resolve previous shadow tracking ──
        this.engine._resolvePendingShadow(testSpins, idx);

        // ── Step 1: T3 Flash Detection + Pair Selection (existing) ──
        const flashingPairs = this.engine._getFlashingPairsFromHistory(testSpins, idx);
        let t3Numbers = [];
        let t3BestPair = null;
        let t3Candidates = [];
        let t3Scored = null;

        if (flashingPairs.size > 0) {
            for (const [refKey, flashInfo] of flashingPairs) {
                // Skip blacklisted pairs (explicit param)
                const pairName = TEST_REFKEY_TO_PAIR_NAME[refKey] || refKey;
                if (blacklistedPairs && blacklistedPairs.has(pairName)) continue;

                const projection = this.engine._computeProjectionForPair(testSpins, idx, refKey);
                if (projection && projection.numbers.length > 0) {
                    t3Candidates.push({ refKey, pairName, numbers: projection.numbers, data: projection });
                }
            }
            if (t3Candidates.length > 0) {
                t3Scored = t3Candidates.map(c => ({ ...c, score: this.engine._scorePair(c.refKey, c) }));
                t3Scored.sort((a, b) => b.score - a.score);
                t3BestPair = t3Scored[0];
                t3Numbers = t3BestPair.numbers;
            }
        }
        if (this._enableLogging) console.log(`[TEST-LOG] Step1 T3: flashingPairs=${flashingPairs.size} | bestPair=${t3BestPair ? t3BestPair.pairName : 'none'} | t3Numbers=[${t3Numbers.join(',')}]`);

        // Verbose: Bayesian breakdown for each candidate
        if (this._enableLogging && t3Candidates.length > 0) {
            const scoredRef = t3Scored || t3Candidates;
            const scoredDetails = scoredRef.map(c => {
                const bay = this.engine.pairBayesian ? this.engine.pairBayesian[c.refKey] : null;
                const model = this.engine.pairModels ? this.engine.pairModels[c.refKey] : null;
                return {
                    pair: c.pairName, refKey: c.refKey, finalScore: +(c.score || 0).toFixed(4),
                    bayesian: bay ? { alpha: bay.alpha, beta: bay.beta, mean: +(bay.alpha / (bay.alpha + bay.beta)).toFixed(4) } : null,
                    totalBayesianDecisions: this.engine._totalBayesianDecisions,
                    modelHitRate: model ? +(model.hitRate || 0).toFixed(4) : null,
                    modelCoverageEff: model ? +(model.coverageEfficiency || 0).toFixed(4) : null
                };
            });
            this._vlog('RUNNER', 'DEBUG', 'Step1 Candidate Bayesian Scores', { scoredDetails });
            console.log(`[TEST-LOG] Step1 Bayesian:`, JSON.stringify(scoredDetails));
        }

        // ── Step 2: T2 Flash Detection + NEXT Row Numbers ──
        const t2Data = this.engine.simulateT2FlashAndNumbers(testSpins, idx);
        const t2Numbers = t2Data ? t2Data.numbers : [];
        if (this._enableLogging) console.log(`[TEST-LOG] Step2 T2: dataPair=${t2Data ? t2Data.dataPair : 'none'} | anchorCount=${t2Data ? t2Data.anchorCount : 0} | t2Numbers=[${t2Numbers.join(',')}]`);

        // ── Must have at least one source ──
        if (t3Numbers.length === 0 && t2Numbers.length === 0) {
            return skipResult('No T2 or T3 flash data available');
        }

        // ── Step 3: Combine T2 + T3 Numbers ──
        const combinedSet = new Set([...t3Numbers, ...t2Numbers]);
        const combinedNumbers = Array.from(combinedSet);
        if (this._enableLogging) console.log(`[TEST-LOG] Step3 Combined: ${combinedNumbers.length} numbers [${[...combinedNumbers].sort((a,b)=>a-b).join(',')}]`);

        // ── Step 4: Predict Best Set ──
        const recentSpins = testSpins.slice(Math.max(0, idx - 10), idx);
        const setPrediction = this.engine._predictBestSet(combinedNumbers, recentSpins);
        if (this._enableLogging) console.log(`[TEST-LOG] Step4 SetPrediction: filterKey=${setPrediction.filterKey} | setKey=${setPrediction.setKey} | score=${setPrediction.score}`);

        // ── Step 5: Apply Filter (RECOVERY → adaptive look-back filter) ──
        let filterKey = setPrediction.filterKey;
        if (this.engine.session.trendState === 'RECOVERY') {
            filterKey = this.engine._pickRecoveryFilter(recentSpins, combinedNumbers);
            if (this._enableLogging) console.log(`[TEST-LOG] Step5 RECOVERY filter override: ${setPrediction.filterKey} → ${filterKey}`);
        }
        const filteredNumbers = this.engine._applyFilterToNumbers(combinedNumbers, filterKey);
        if (this._enableLogging) console.log(`[TEST-LOG] Step5 Filter: ${filterKey} → ${filteredNumbers.length} numbers [${[...filteredNumbers].sort((a,b)=>a-b).join(',')}]`);

        // ── Step 6: Confidence + BET/SKIP ──
        const pairScore = t3BestPair ? this.engine._scorePair(t3BestPair.refKey, t3BestPair) : 0.5;
        const confidence = this.engine._computeConfidence(pairScore, setPrediction.score, filteredNumbers);

        const effectiveThreshold = this.engine._getEffectiveThreshold();
        const forcebet = this.engine.session.consecutiveSkips >= this.engine.maxConsecutiveSkips;

        // ── Store shadow projections for deferred resolution ──
        this.engine._storeShadowProjections(testSpins, idx, flashingPairs, t2Data);

        // Clean up decision spins context
        this.engine._currentDecisionSpins = null;

        // Verbose: full decision summary to file
        if (this._enableLogging) {
            this._vlog('RUNNER', 'DECISION', `Step6 | spins=[${decisionSpins.join(',')}]`, {
                action: (confidence >= effectiveThreshold || forcebet) ? 'BET' : 'SKIP',
                pair: t3BestPair ? t3BestPair.pairName : (t2Data ? t2Data.dataPair : null),
                filter: filterKey, confidence, effectiveThreshold, pairScore: +pairScore.toFixed(4),
                setScore: setPrediction.score, forcebet,
                flashingKeys: Array.from(flashingPairs.keys()),
                t3Numbers: [...t3Numbers].sort((a, b) => a - b),
                t2Numbers: [...t2Numbers].sort((a, b) => a - b),
                filteredNumbers: [...filteredNumbers].sort((a, b) => a - b),
                trendState: this.engine.session.trendState,
                totalBets: this.engine.session.totalBets
            });
        }

        if (confidence >= effectiveThreshold || forcebet) {
            const pairName = t3BestPair ? t3BestPair.pairName : (t2Data ? t2Data.dataPair : 'unknown');
            if (this._enableLogging) console.log(`[TEST-LOG] Step6 Decision: action=BET | conf=${confidence}% | threshold=${effectiveThreshold}% | forcebet=${forcebet} | pair=${pairName} | filter=${filterKey}`);
            return {
                action: 'BET',
                selectedPair: pairName,
                selectedFilter: filterKey,
                numbers: filteredNumbers,
                confidence,
                reason: forcebet && confidence < effectiveThreshold
                    ? `Forced bet after ${this.engine.session.consecutiveSkips} skips`
                    : `T2:${t2Data ? t2Data.dataPair : 'none'}+T3:${t3BestPair ? t3BestPair.pairName : 'none'} → ${filterKey} (conf: ${confidence}%)`
            };
        }

        if (this._enableLogging) console.log(`[TEST-LOG] Step6 Decision: action=SKIP | conf=${confidence}% | threshold=${effectiveThreshold}% | consecutiveSkips=${this.engine.session.consecutiveSkips}`);
        return skipResult(`Low confidence ${confidence}% < ${effectiveThreshold}%`);
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

        // Incomplete session losses (real losses from sessions that didn't finish)
        const incompleteLoss = incomplete.reduce((sum, s) => sum + s.finalProfit, 0);
        const avgIncompleteLoss = incomplete.length > 0 ? incompleteLoss / incomplete.length : 0;

        // Real total P&L — includes ALL sessions (wins, busts, AND incomplete)
        const realTotalPnL = sessions.reduce((sum, s) => sum + s.finalProfit, 0);
        const realAvgPnL = sessions.length > 0 ? realTotalPnL / sessions.length : 0;

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
            avgProfit: Math.round(avgProfit * 100) / 100,
            incompleteLoss: Math.round(incompleteLoss * 100) / 100,
            avgIncompleteLoss: Math.round(avgIncompleteLoss * 100) / 100,
            realTotalPnL: Math.round(realTotalPnL * 100) / 100,
            realAvgPnL: Math.round(realAvgPnL * 100) / 100,
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
            avgProfit: 0,
            incompleteLoss: 0,
            avgIncompleteLoss: 0,
            realTotalPnL: 0,
            realAvgPnL: 0,
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
