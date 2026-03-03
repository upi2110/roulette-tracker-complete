/**
 * SessionRecorder — Records live session data step-by-step during Auto/Semi/Manual play.
 *
 * Fields match the test report exactly:
 *   step, spinNumber, nextNumber, action, selectedPair, selectedFilter,
 *   predictedNumbers, confidence, betPerNumber, numbersCount, hit, pnl,
 *   bankroll, cumulativeProfit
 *
 * Usage:
 *   window.sessionRecorder.startSession(4000, 100, 1);
 *   window.sessionRecorder.recordWatch(2, 30, 4000);
 *   window.sessionRecorder.recordDecision(18, decision, 2, 4000);
 *   window.sessionRecorder.updateLastBetResult(6, false, -26, 3974, -26);
 *   window.sessionRecorder.downloadSession();
 */

class SessionRecorder {
    constructor() {
        this._active = false;
        this._steps = [];
        this._stepCounter = 0;
        this._sessionConfig = {
            startingBankroll: 4000,
            targetProfit: 100,
            strategy: 1,
            mode: 'auto'
        };
        this._sessionState = {
            totalBets: 0,
            totalSkips: 0,
            wins: 0,
            losses: 0,
            peakProfit: 0,
            maxDrawdown: 0,
            reanalyzeCount: 0
        };
        this._startTime = null;
    }

    get isActive() {
        return this._active;
    }

    get stepCount() {
        return this._steps.length;
    }

    /**
     * Start a new recording session.
     * @param {number} startingBankroll
     * @param {number} targetProfit
     * @param {number} strategy - 1=Aggressive, 2=Conservative, 3=Cautious
     * @param {string} mode - 'auto' | 'semi' | 'manual'
     */
    startSession(startingBankroll = 4000, targetProfit = 100, strategy = 1, mode = 'auto') {
        this._active = true;
        this._steps = [];
        this._stepCounter = 0;
        this._sessionConfig = { startingBankroll, targetProfit, strategy, mode };
        this._sessionState = {
            totalBets: 0,
            totalSkips: 0,
            wins: 0,
            losses: 0,
            peakProfit: 0,
            maxDrawdown: 0,
            reanalyzeCount: 0
        };
        this._startTime = new Date();
        console.log(`[RECORDER] Session started | bankroll=$${startingBankroll} | target=$${targetProfit} | strategy=${strategy} | mode=${mode}`);
    }

    /**
     * Record a WATCH step (first 3 spins, observe only).
     */
    recordWatch(spinNumber, nextNumber, bankroll) {
        if (!this._active) return;
        this._stepCounter++;
        this._steps.push({
            spinIdx: this._stepCounter - 1,
            spinNumber,
            nextNumber: nextNumber != null ? nextNumber : null,
            action: 'WATCH',
            selectedPair: null,
            selectedFilter: null,
            predictedNumbers: [],
            confidence: 0,
            betPerNumber: 0,
            numbersCount: 0,
            hit: false,
            pnl: 0,
            bankroll,
            cumulativeProfit: bankroll - this._sessionConfig.startingBankroll
        });
        this._updateUI();
    }

    /**
     * Record a BET or SKIP decision (before the result is known for BETs).
     * For SKIP: step is complete immediately.
     * For BET: call updateLastBetResult() when the next spin resolves.
     */
    recordDecision(spinNumber, decision, betPerNumber, bankroll) {
        if (!this._active) return;
        this._stepCounter++;

        const isBet = decision.action === 'BET';
        const numbersCount = isBet ? (decision.numbers || []).length : 0;

        this._steps.push({
            spinIdx: this._stepCounter - 1,
            spinNumber,
            nextNumber: null, // filled in by updateLastBetResult for BETs
            action: decision.action,
            selectedPair: decision.selectedPair || null,
            selectedFilter: decision.selectedFilter || null,
            predictedNumbers: isBet ? [...(decision.numbers || [])] : [],
            confidence: decision.confidence || 0,
            betPerNumber: betPerNumber,
            numbersCount,
            hit: false,       // updated by updateLastBetResult
            pnl: 0,           // updated by updateLastBetResult
            bankroll,         // updated by updateLastBetResult
            cumulativeProfit: bankroll - this._sessionConfig.startingBankroll
        });

        if (!isBet) {
            this._sessionState.totalSkips++;
        }

        this._updateUI();
    }

    /**
     * Update the last BET step with the actual result (after the next spin resolves).
     */
    updateLastBetResult(nextNumber, hit, pnl, bankroll, cumulativeProfit) {
        if (!this._active) return;

        // Find last BET step that hasn't been resolved yet (nextNumber is null)
        for (let i = this._steps.length - 1; i >= 0; i--) {
            if (this._steps[i].action === 'BET' && this._steps[i].nextNumber === null) {
                this._steps[i].nextNumber = nextNumber;
                this._steps[i].hit = hit;
                this._steps[i].pnl = pnl;
                this._steps[i].bankroll = bankroll;
                this._steps[i].cumulativeProfit = cumulativeProfit;

                this._sessionState.totalBets++;
                if (hit) {
                    this._sessionState.wins++;
                } else {
                    this._sessionState.losses++;
                }

                // Track peak and drawdown
                if (cumulativeProfit > this._sessionState.peakProfit) {
                    this._sessionState.peakProfit = cumulativeProfit;
                }
                const drawdown = this._sessionState.peakProfit - cumulativeProfit;
                if (drawdown > this._sessionState.maxDrawdown) {
                    this._sessionState.maxDrawdown = drawdown;
                }

                break;
            }
        }
        this._updateUI();
    }

    /**
     * Record a REANALYZE step (loss streak reset).
     */
    recordReanalyze(spinNumber, bankroll, cumulativeProfit) {
        if (!this._active) return;
        this._stepCounter++;
        this._sessionState.reanalyzeCount++;
        this._steps.push({
            spinIdx: this._stepCounter - 1,
            spinNumber,
            nextNumber: null,
            action: 'REANALYZE',
            selectedPair: null,
            selectedFilter: null,
            predictedNumbers: [],
            confidence: 0,
            betPerNumber: 0,
            numbersCount: 0,
            hit: false,
            pnl: 0,
            bankroll,
            cumulativeProfit
        });
        this._updateUI();
    }

    /**
     * End the recording session.
     */
    endSession(outcome) {
        if (!this._active) return;
        this._active = false;
        const lastStep = this._steps[this._steps.length - 1];
        const profit = lastStep ? lastStep.cumulativeProfit : 0;
        console.log(`[RECORDER] Session ended | outcome=${outcome || 'manual'} | profit=$${profit} | steps=${this._steps.length} | bets=${this._sessionState.totalBets}`);
        this._updateUI();
    }

    /**
     * Get all recorded steps (for export).
     */
    getSteps() {
        return [...this._steps];
    }

    /**
     * Get session result in the same format as AutoTestRunner._buildSessionResult().
     */
    getSessionResult() {
        const lastStep = this._steps[this._steps.length - 1];
        const profit = lastStep ? lastStep.cumulativeProfit : 0;
        const bankroll = lastStep ? lastStep.bankroll : this._sessionConfig.startingBankroll;

        let outcome = 'INCOMPLETE';
        if (profit >= this._sessionConfig.targetProfit) outcome = 'WIN';
        else if (bankroll <= 0) outcome = 'BUST';

        const nonBetActions = this._steps.filter(s => s.action === 'WATCH' || s.action === 'REANALYZE').length;

        return {
            startIdx: 0,
            strategy: this._sessionConfig.strategy,
            outcome,
            finalBankroll: bankroll,
            finalProfit: profit,
            profit,
            totalSpins: this._steps.length - nonBetActions,
            totalBets: this._sessionState.totalBets,
            totalSkips: this._sessionState.totalSkips,
            wins: this._sessionState.wins,
            losses: this._sessionState.losses,
            winRate: this._sessionState.totalBets > 0 ? this._sessionState.wins / this._sessionState.totalBets : 0,
            maxDrawdown: this._sessionState.maxDrawdown,
            peakProfit: this._sessionState.peakProfit,
            reanalyzeCount: this._sessionState.reanalyzeCount,
            steps: this._steps,
            mode: this._sessionConfig.mode,
            startTime: this._startTime ? this._startTime.toISOString() : null
        };
    }

    /**
     * Reset recorder for a new session.
     */
    reset() {
        this._active = false;
        this._steps = [];
        this._stepCounter = 0;
        this._startTime = null;
        this._sessionState = {
            totalBets: 0, totalSkips: 0, wins: 0, losses: 0,
            peakProfit: 0, maxDrawdown: 0, reanalyzeCount: 0
        };
        this._updateUI();
    }

    /**
     * Update session status in UI (if the element exists).
     */
    _updateUI() {
        const el = document.getElementById('sessionRecordingStatus');
        if (el) {
            if (this._active) {
                const bets = this._sessionState.totalBets;
                const lastStep = this._steps[this._steps.length - 1];
                const profit = lastStep ? lastStep.cumulativeProfit : 0;
                el.textContent = `Recording: ${this._steps.length} steps | ${bets} bets | $${profit}`;
                el.style.color = profit >= 0 ? '#4CAF50' : '#f44336';
            } else if (this._steps.length > 0) {
                el.textContent = `Session ended: ${this._steps.length} steps`;
                el.style.color = '#888';
            } else {
                el.textContent = 'Not recording';
                el.style.color = '#888';
            }
        }

        // Enable/disable download button
        const btn = document.getElementById('downloadSessionBtn');
        if (btn) {
            btn.disabled = this._steps.length === 0;
        }
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.sessionRecorder = new SessionRecorder();
}

// For Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SessionRecorder };
}

console.log('✅ Session Recorder loaded');
