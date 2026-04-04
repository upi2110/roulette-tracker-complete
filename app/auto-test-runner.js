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

        // Prediction mode: controls which number source the backtest uses
        // 'default'     = T3+T2 union + set filter (original backtest behavior)
        // 'T1_INT_T2'   = T1 ∩ T2 intersection + set filter
        this.predictionMode = (sessionConfig && sessionConfig.predictionMode) || 'default';

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
            predictionMode: this.predictionMode,
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
            const decision = this.predictionMode === 'T1_INT_T2'
                ? this._simulateT1IntersectT2Decision(testSpins, i)
                : this._simulateDecision(testSpins, i);

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

    // ═══════════════════════════════════════════════════════════
    //  T1 ∩ T2 DECISION — Alternative prediction mode
    //  Uses T1 lookup-table projections (±1 neighbors) intersected
    //  with T2 flash numbers for confirmed, high-quality signals.
    // ═══════════════════════════════════════════════════════════

    _simulateT1IntersectT2Decision(testSpins, idx) {
        const skipResult = (reason) => {
            this.engine._currentDecisionSpins = null;
            return { action: 'SKIP', selectedPair: null, selectedFilter: null, numbers: [], confidence: 0, reason };
        };

        if (idx < 3) return skipResult('Insufficient history');
        this.engine._currentDecisionSpins = testSpins.slice(0, idx + 1);

        // ── T1: Compute lookup-table projections with ±1 neighbors ──
        const lastSpin = testSpins[idx];
        const DIGIT_13 = this.engine._getDigit13OppositeMap ? this.engine._getDigit13OppositeMap() : null;
        const getD13 = (n) => {
            try { return this.engine._getDigit13Opposite(n); } catch(e) { return null; }
        };

        const t1Pairs = {
            ref0: 0, ref19: 19,
            prev: lastSpin,
            prevPlus1: Math.min(lastSpin + 1, 36),
            prevMinus1: Math.max(lastSpin - 1, 0),
            prevPlus2: Math.min(lastSpin + 2, 36),
            prevMinus2: Math.max(lastSpin - 2, 0)
        };

        const t1AllNumbers = new Set();
        for (const [pairKey, refNum] of Object.entries(t1Pairs)) {
            const ref13Opp = getD13(refNum);
            // Primary ref lookup
            const refLookup = this.engine._getLookupRow(refNum);
            if (refLookup) {
                for (const refKey of ['first', 'second', 'third']) {
                    const target = refLookup[refKey];
                    if (target !== undefined) {
                        // ±1 neighbor expansion (T1 style)
                        const nums = this.engine._getExpandTargetsToBetNumbers([target], 1);
                        nums.forEach(n => t1AllNumbers.add(n));
                    }
                }
            }
            // 13-opposite ref lookup
            if (ref13Opp !== null && ref13Opp !== undefined) {
                const oppLookup = this.engine._getLookupRow(ref13Opp);
                if (oppLookup) {
                    for (const refKey of ['first', 'second', 'third']) {
                        const target = oppLookup[refKey];
                        if (target !== undefined) {
                            const nums = this.engine._getExpandTargetsToBetNumbers([target], 1);
                            nums.forEach(n => t1AllNumbers.add(n));
                        }
                    }
                }
            }
        }

        if (t1AllNumbers.size === 0) {
            this.engine._currentDecisionSpins = null;
            return skipResult('No T1 projections');
        }

        // ── T2: Get flash-based numbers ──
        const t2Data = this.engine.simulateT2FlashAndNumbers(testSpins, idx);
        const t2Numbers = t2Data ? t2Data.numbers : [];

        // ── Intersect T1 ∩ T2 ──
        let pool;
        if (t2Numbers.length > 0) {
            const t1Set = t1AllNumbers;
            const intersection = t2Numbers.filter(n => t1Set.has(n));
            // Use intersection if >= 4 numbers, otherwise fall back to T1+T2 union
            pool = intersection.length >= 4 ? intersection : Array.from(new Set([...t1AllNumbers, ...t2Numbers]));
        } else {
            pool = Array.from(t1AllNumbers);
        }

        // 0/26 pairing
        if (pool.includes(0) && !pool.includes(26)) pool.push(26);
        if (pool.includes(26) && !pool.includes(0)) pool.push(0);

        // Set prediction + filter
        const recentSpins = testSpins.slice(Math.max(0, idx - 10), idx);
        const setPrediction = this.engine._predictBestSet(pool, recentSpins);
        const filteredNumbers = this.engine._applyFilterToNumbers(pool, setPrediction.filterKey);

        if (filteredNumbers.length === 0) {
            this.engine._currentDecisionSpins = null;
            return skipResult('No numbers after filter');
        }

        // Confidence + BET/SKIP
        const confidence = this.engine._computeConfidence(0.5, setPrediction.score, filteredNumbers);
        const effectiveThreshold = this.engine.confidenceThreshold;
        const forcebet = this.engine.session.consecutiveSkips >= this.engine.maxConsecutiveSkips;

        this.engine._currentDecisionSpins = null;

        if (confidence >= effectiveThreshold || forcebet) {
            return {
                action: 'BET',
                selectedPair: 'T1∩T2',
                selectedFilter: setPrediction.filterKey,
                numbers: filteredNumbers,
                confidence,
                reason: `T1∩T2 → ${setPrediction.filterKey} (${filteredNumbers.length} nums, conf: ${confidence}%)`
            };
        }
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
