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
    constructor(engine) {
        if (!engine) {
            throw new Error('AutoTestRunner requires an AIAutoEngine instance');
        }
        if (!engine.isTrained) {
            throw new Error('Engine must be trained before running tests');
        }
        this.engine = engine;
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
            }

            // Yield to event loop every batchSize starting positions
            if (startIdx > 0 && startIdx % batchSize === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

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
        const STARTING_BANKROLL = 4000;
        const TARGET_PROFIT = 100;
        const MIN_BET = 2;

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
            peakProfit: 0
        };

        const steps = [];

        // Need at least idx and idx+1, and idx needs 3 prior spins for flash detection
        // So effective start for decisions is startIdx + 3, checking spins[i+1] exists
        for (let i = startIdx + 3; i < testSpins.length - 1; i++) {
            const decision = this._simulateDecision(testSpins, i);

            if (decision.action === 'BET') {
                const nextActual = testSpins[i + 1];
                const hit = decision.numbers.includes(nextActual);
                const numbersCount = decision.numbers.length;
                const pnl = this._calculatePnL(sessionState.betPerNumber, numbersCount, hit);

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

                // Apply strategy for next bet
                sessionState.betPerNumber = this._applyStrategy(strategy, hit, sessionState);

                // Record result for engine session adaptation
                const refKey = decision.selectedPair
                    ? (Object.entries(TEST_REFKEY_TO_PAIR_NAME).find(([k, v]) => v === decision.selectedPair) || [decision.selectedPair])[0]
                    : 'unknown';
                this.engine.recordResult(refKey, decision.selectedFilter || 'both_both', hit, nextActual);

                steps.push({
                    spinIdx: i,
                    spinNumber: testSpins[i],
                    nextNumber: nextActual,
                    action: 'BET',
                    selectedPair: decision.selectedPair,
                    selectedFilter: decision.selectedFilter,
                    predictedNumbers: decision.numbers,
                    confidence: decision.confidence,
                    betPerNumber: sessionState.betPerNumber,
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

                // Check BUST
                if (sessionState.bankroll <= 0) {
                    return this._buildSessionResult(startIdx, strategy, 'BUST', sessionState, steps);
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
        return {
            startIdx,
            strategy,
            outcome,
            finalBankroll: state.bankroll,
            finalProfit: state.profit,
            totalSpins: steps.length,
            totalBets: state.totalBets,
            totalSkips: state.totalSkips,
            wins: state.wins,
            losses: state.losses,
            winRate: state.totalBets > 0 ? state.wins / state.totalBets : 0,
            maxDrawdown: state.maxDrawdown,
            peakProfit: state.peakProfit,
            steps
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  DECISION SIMULATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Simulate a decision at spin index idx using engine internals.
     * Mirrors engine.decide() but works on plain number arrays.
     *
     * @param {number[]} testSpins - Full test data
     * @param {number} idx - Current index to make decision at
     * @returns {{ action: string, selectedPair: string|null, selectedFilter: string|null,
     *             numbers: number[], confidence: number, reason: string }}
     */
    _simulateDecision(testSpins, idx) {
        const skipResult = (reason) => ({
            action: 'SKIP',
            selectedPair: null,
            selectedFilter: null,
            numbers: [],
            confidence: 0,
            reason
        });

        if (idx < 3) return skipResult('Insufficient history');

        // 1. Find flashing pairs at this index
        const flashingPairs = this.engine._getFlashingPairsFromHistory(testSpins, idx);
        if (flashingPairs.size === 0) return skipResult('No pairs flashing');

        // 2. Compute projections for each flashing pair
        const candidates = [];
        for (const [refKey, flashInfo] of flashingPairs) {
            const projection = this.engine._computeProjectionForPair(testSpins, idx, refKey);
            if (projection && projection.numbers.length > 0) {
                const pairName = TEST_REFKEY_TO_PAIR_NAME[refKey] || refKey;
                candidates.push({
                    refKey,
                    pairName,
                    numbers: projection.numbers,
                    data: projection
                });
            }
        }

        if (candidates.length === 0) return skipResult('No projections for flashing pairs');

        // 3. Score each candidate pair
        const scored = candidates.map(c => ({
            ...c,
            score: this.engine._scorePair(c.refKey, c)
        }));
        scored.sort((a, b) => b.score - a.score);

        const bestPair = scored[0];

        // 4. Select best filter
        const filterResult = this.engine._selectBestFilter(bestPair.numbers);

        // 5. Compute confidence
        const confidence = this.engine._computeConfidence(
            bestPair.score, filterResult.score, filterResult.filteredNumbers
        );

        // 6. Skip logic
        const forcebet = this.engine.session.consecutiveSkips >= this.engine.maxConsecutiveSkips;

        if (confidence >= this.engine.confidenceThreshold || forcebet) {
            return {
                action: 'BET',
                selectedPair: bestPair.pairName,
                selectedFilter: filterResult.filterKey,
                numbers: filterResult.filteredNumbers,
                confidence,
                reason: forcebet && confidence < this.engine.confidenceThreshold
                    ? `Forced bet after ${this.engine.session.consecutiveSkips} skips`
                    : `Pair ${bestPair.pairName} with ${filterResult.filterKey} (conf: ${confidence}%)`
            };
        }

        return skipResult(`Low confidence ${confidence}% < ${this.engine.confidenceThreshold}%`);
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

        // Average profit (across all sessions)
        const avgProfit = sessions.reduce((sum, s) => sum + s.finalProfit, 0) / sessions.length;

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
            avgSpinsToBust: Math.round(avgSpinsToBust * 10) / 10,
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
            avgSpinsToBust: 0,
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
