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
        _decideT1Strategy = require('../../strategies/t1/t1-strategy').decideT1Strategy;
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
    'prev_prev': 'prevPrev',
    // NEW (slice 2a) — must mirror REFKEY_TO_PAIR_NAME in
    // services/ai-auto-engine/ai-auto-engine.js. The Auto Test
    // runner uses this map to label step rows by pair name; if it
    // diverges from the engine's map, the AT report's "Pair" column
    // will fall back to the raw refKey for the new pairs.
    'prev_prev_plus_1':  'prevPrevPlus1',
    'prev_prev_minus_1': 'prevPrevMinus1',
    'prev_prev_plus_2':  'prevPrevPlus2',
    'prev_prev_minus_2': 'prevPrevMinus2'
};


const STRATEGY_NAMES = {
    1: 'Aggressive',
    2: 'Conservative',
    3: 'Cautious',
    4: 'Defensive',
    5: 'Logical',
    6: 'Super Cautious'
};

// ─────────────────────────────────────────────────────────────────
// Wheel-mode helper sets — mirror the live Wheel panel's Table /
// Sign / Set / Inverse filters. Numbers grouped identically to the
// matching sets in strategies/manual-replay/manual-replay.js so the
// auto-test wheel-pool matches what the live wheel produces from
// the same toggles. Used only when manual-test config has
// wheelMode: true; otherwise unreferenced.
// ─────────────────────────────────────────────────────────────────
const _MT_WHEEL_TABLE_0  = new Set([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5]);
const _MT_WHEEL_TABLE_19 = new Set([19,15,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);
const _MT_WHEEL_POSITIVE = new Set([3,26,0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23]);
const _MT_WHEEL_NEGATIVE = new Set([10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35]);
const _MT_WHEEL_SET0 = new Set([0,26,3,35,12,28,7,29,18,22,9,31,14,20,1,33,16,24,5,10]);
const _MT_WHEEL_SET5 = new Set([23,8,30,11,36,13,27,6,34,17,25,2,21,4,19,15,32]);
const _MT_WHEEL_SET6 = new Set([0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]);

/**
 * Build the wheel-mode bet pool for a manual-test run. Applies
 * Table → Sign → Set membership against the 0–36 universe, then
 * optionally inverts. When no set boxes are ticked the function
 * treats it as "all sets allowed" (matches the live wheel's
 * implicit fallback so the user doesn't end up with an empty pool
 * by ticking no Set checkboxes).
 *
 * @param {{filters:Object, inverse:boolean}} cfg
 * @returns {number[]} sorted array of bet numbers
 */
function _manualTestWheelPool(cfg) {
    const filters = (cfg && cfg.filters) || {};
    const sets = filters.sets || {};
    const setsAny = !!(sets.set0 || sets.set5 || sets.set6);

    const passes = (n) => {
        if (filters.table === '0'  && !_MT_WHEEL_TABLE_0.has(n))  return false;
        if (filters.table === '19' && !_MT_WHEEL_TABLE_19.has(n)) return false;
        if (filters.sign === 'positive' && !_MT_WHEEL_POSITIVE.has(n)) return false;
        if (filters.sign === 'negative' && !_MT_WHEEL_NEGATIVE.has(n)) return false;
        if (setsAny) {
            const inAllowedSet =
                (sets.set0 && _MT_WHEEL_SET0.has(n)) ||
                (sets.set5 && _MT_WHEEL_SET5.has(n)) ||
                (sets.set6 && _MT_WHEEL_SET6.has(n));
            if (!inAllowedSet) return false;
        }
        return true;
    };

    let pool = [];
    for (let n = 0; n <= 36; n++) if (passes(n)) pool.push(n);
    if (cfg && cfg.inverse) {
        const sel = new Set(pool);
        const universe = [];
        for (let n = 0; n <= 36; n++) universe.push(n);
        pool = universe.filter(n => !sel.has(n));
    }
    return pool;
}

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
        // 'manual' is exposed in the Auto Test dropdown so the user
        // can run a side-by-side comparison against a live session.
        // The user picks which strategy actually generates predictions
        // via the manual-section sub-dropdown; we route through that
        // strategy's pipeline while still reporting the run as 'manual'.
        // Falls back to 'AI-trained' for back-compat with older callers
        // that did not pass `manualStrategy`.
        // 'test' = Strategy-Lab sandbox. Currently shares the default
        // _simulateDecision pipeline; will be the integration point for
        // experimental strategies pending evaluation.
        const KNOWN_MANUAL_STRATS = ['auto-test', 'T1-strategy', 'test', '3t-selection', 'AI-trained'];
        const requestedManualStrat = (typeof options.manualStrategy === 'string' && KNOWN_MANUAL_STRATS.includes(options.manualStrategy))
            ? options.manualStrategy
            : 'AI-trained';
        this._currentMethod  = (method === 'manual') ? requestedManualStrat : method;
        this._reportedMethod = method;

        // manual-test: snapshot the user's UI config on the runner so
        // _simulateDecision can read it without touching any globals.
        // Pure additive — when method !== 'manual-test' this field is
        // null and no existing code path is affected.
        this._manualTestConfig = (method === 'manual-test' && options.manualTestConfig)
            ? options.manualTestConfig
            : null;

        // Strategy-Lab parity: if the include-grey flag wasn't already
        // set on this runner (e.g. AI panel mirrored it when the user
        // toggled the checkbox), pull the latest value from window /
        // localStorage so the lab matches what live would do today.
        if (typeof this._strategyLabIncludeGrey !== 'boolean') {
            if (typeof window !== 'undefined' && typeof window.strategyLabIncludeGrey === 'boolean') {
                this._strategyLabIncludeGrey = window.strategyLabIncludeGrey;
            } else {
                try {
                    const saved = (typeof localStorage !== 'undefined')
                        ? localStorage.getItem('strategyLab.includeGrey')
                        : null;
                    // Default OFF (user pref 2026-06-21): only treat
                    // saved === '1' as ON; anything else (null, '0') → OFF.
                    this._strategyLabIncludeGrey = (saved === '1');
                } catch (_) {
                    this._strategyLabIncludeGrey = false;
                }
            }
        }

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
        // Use the *effective* method (manual → resolved sub-strategy) so a
        // manual run targeting AI-trained correctly bypasses the legacy
        // engine.isTrained gate. Without this, manual→AI-trained returns
        // ENGINE_NOT_TRAINED with empty strategies and the renderer
        // crashes on result.strategies[1].summary.
        // manual-test uses user-supplied pair keys + a self-contained
        // projection helper — no engine training required. Same
        // exemption AI-trained has.
        if (this._engineMaybeUntrained && this._currentMethod !== 'AI-trained' && this._currentMethod !== 'manual-test') {
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
                if (typeof require === 'function') TS = require('../../training/training-state.js');
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
                    3: { sessions: [], summary: this._emptyStrategySummary() },
                    4: { sessions: [], summary: this._emptyStrategySummary() },
                    5: { sessions: [], summary: this._emptyStrategySummary() }
                }
            };
        }

        // Backlog C — pair-rotation parity for method='test'. Pre-fetch
        // the persisted training records once so the AT runner can build
        // a per-session active-pair schedule using the same recommender
        const allSessions = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

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

        // ── PAIR MODEL SNAPSHOT ──
        // Without this, every BET inside a session calls
        // engine.recordResult() which mutates pairModels[refKey].hitRate.
        // Two consecutive Auto Test runs (e.g. include-grey ON vs OFF)
        // therefore start from different baseline hit-rates, which leads
        // Strategy-Lab's selectBestPair() to lock a different pair on
        // session #1 of run #2 — making the runs incomparable.
        // We deep-snapshot pairModels here and restore after the batch
        // so every run starts from the same trained baseline regardless
        // of what previous runs did to the in-memory model.
        let _pairModelsSnapshot = null;
        try {
            if (this.engine.pairModels) {
                _pairModelsSnapshot = JSON.parse(JSON.stringify(this.engine.pairModels));
            }
        } catch (_) { /* best-effort */ }
        const _restorePairModels = () => {
            if (_pairModelsSnapshot && this.engine.pairModels) {
                for (const k of Object.keys(_pairModelsSnapshot)) {
                    this.engine.pairModels[k] = JSON.parse(JSON.stringify(_pairModelsSnapshot[k]));
                }
            }
        };

        for (let startIdx = 0; startIdx <= maxStart; startIdx++) {
            for (const strategy of [1, 2, 3, 4, 5, 6]) {
                // Reset engine session between simulations
                this.engine.resetSession();
                // Restore the trained pair-model baseline so each
                // session's selectBestPair sees identical hit-rates.
                // Without this, run-to-run pair selection drifts as
                // recordResult mutates the model across sessions.
                _restorePairModels();

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
        // Restore the original trained pair-model so the live engine
        // is in the same state the user trained it in (Auto Test runs
        // must not leave the live model mutated).
        _restorePairModels();

        const result = {
            testFile,
            method,
            totalTestSpins: testSpins.length,
            trainedOn: `${Object.keys(this.engine.pairModels).length} pairs trained`,
            timestamp: new Date().toISOString(),
            // Surface the manual-test config (env toggles + filters +
            // pair selections) on the result so the Excel report can
            // echo exactly what the user picked. Null for every other
            // method — the report only renders the config block when
            // method === 'manual-test' AND this is populated.
            manualTestConfig: (method === 'manual-test') ? this._manualTestConfig : null,
            strategies: {
                1: { sessions: allSessions[1], summary: this._computeSummary(allSessions[1]) },
                2: { sessions: allSessions[2], summary: this._computeSummary(allSessions[2]) },
                3: { sessions: allSessions[3], summary: this._computeSummary(allSessions[3]) },
                4: { sessions: allSessions[4], summary: this._computeSummary(allSessions[4]) },
                5: { sessions: allSessions[5], summary: this._computeSummary(allSessions[5]) },
                6: { sessions: allSessions[6], summary: this._computeSummary(allSessions[6]) }
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

        // Expose the session's start index on the runner so the
        // manual-test branch in _simulateDecision can slice history
        // to session-only spins (matches a fresh live session's
        // auto-ref walk-back depth). Pure additive — only the
        // manual-test branch reads this field; every other path
        // ignores it. Reset per-session so multi-session runs are
        // independent.
        this._currentSessionStartIdx = startIdx;

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
            // Cumulative loss tallies — mirror live money panel
            // (sessionData.s2LossTally / s4LossTally). Single wins do
            // NOT reset these; only an explicit bet-size change does.
            s2LossTally: 0,
            s4LossTally: 0,
            // Streak peaks captured per session for the report.
            maxConsecutiveLosses: 0,
            maxConsecutiveWins: 0,
            consecutiveSkips: 0,
            maxConsecutiveSkips: 0,
            maxDrawdown: 0,
            peakProfit: 0,
            reanalyzeCount: 0,
            // Strategy-5 LOGICAL — fractional escalation accumulators
            // (miss adds N/4, hit adds 1.0). Reset per session.
            s5LossUnits: 0,
            s5WinUnits:  0
        };

        const steps = [];

        // Strategy-Lab pair lock-in: clear the previous session's locked
        // pair so the next session re-picks based on current pairModels
        // hit-rates. Per spec: "we don't change once we select. we use
        // the same thing until we finish the session".
        if (this._currentMethod === 'test') {
            this._lockedTestPair = null;
            // StrategyAnalyser session boundary — fresh state every
            // backtest session so streak counters / T3 cooldowns /
            // consecutive-WAIT counter don't bleed across sessions.
            this._analyserSessionState = null;
        }
        // 3T-Selection pair lock-in: same lifecycle, separate var so the
        // two methods can run in parallel without leaking state.
        if (this._currentMethod === '3t-selection') {
            this._locked3TPair = null;
        }

        // AI-trained feedback boundary: reset the per-engine controller
        // and the adapter's prior-decision slot at each session start.
        // Scoped to 'AI-trained' so 'auto-test' and 'T1-strategy' paths
        // are byte-identical to before this change.
        if (this._currentMethod === 'AI-trained') {
            try {
                // Step 5 cutover: prefer the new strategies/ai-trained/ folder.
                // Browser still loads app/ via <script> tags for window.*.
                const mod = (typeof require === 'function') ? require('../../strategies/ai-trained/ai-trained-strategy.js') : null;
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
        // Trigger gate: Same OR Wheel mode (manualTestConfig) →
        // wait-for-trigger betting. Starts WAITING; arms when the
        // latest spin lands in the current bet pool; bets on the
        // next spin; WIN keeps armed; LOSS disarms. With BOTH ON,
        // the bet pool is already pair ∩ wheel (intersection happens
        // in _simulateDecision), so "spin in pool" naturally
        // satisfies the AND condition the user specified. When BOTH
        // toggles are OFF (or any other method runs), the gate is
        // inactive and every BET proceeds as today.
        const triggerGateOn = !!(this._manualTestConfig
            && (this._manualTestConfig.sameMode === true || this._manualTestConfig.wheelMode === true));
        sessionState.sameArmed = false;

        for (let i = startIdx + 3; i < testSpins.length - 1; i++) {
            const decision = this._simulateDecision(testSpins, i);

            // Trigger gate: when active, only allow the BET path if
            // we're armed. Otherwise, check if the LATEST spin
            // (testSpins[i]) is in the predicted pool — if yes,
            // arm; either way emit a SKIP step for this spin so
            // the per-spin log stays continuous, and DO NOT touch
            // consecutiveLosses / consecutiveSkips / bankroll.
            if (triggerGateOn && decision.action === 'BET' && !sessionState.sameArmed) {
                const latest = testSpins[i];
                if (decision.numbers.includes(latest)) {
                    sessionState.sameArmed = true;
                }
                steps.push({
                    spinIdx: i,
                    spinNumber: testSpins[i],
                    nextNumber: testSpins[i + 1],
                    action: 'SKIP',
                    selectedPair: decision.selectedPair,
                    selectedFilter: decision.selectedFilter,
                    predictedNumbers: decision.numbers,
                    confidence: 0,
                    betPerNumber: sessionState.betPerNumber,
                    numbersCount: decision.numbers.length,
                    hit: false,
                    pnl: 0,
                    bankroll: sessionState.bankroll,
                    cumulativeProfit: sessionState.profit,
                    sameWaiting: !sessionState.sameArmed,
                    sameArmedNow: sessionState.sameArmed,
                    reason: sessionState.sameArmed
                        ? 'trigger-gate: armed (' + latest + ' in pool)'
                        : 'trigger-gate: waiting for trigger'
                });
                continue;
            }

            if (decision.action === 'BET') {
                const nextActual = testSpins[i + 1];
                const hit = decision.numbers.includes(nextActual);
                const numbersCount = decision.numbers.length;
                // Strategy 5 applies session-target cap + N/4 linear
                // scaling at bet placement. Other strategies use the
                // base bet directly.
                let betUsed;
                if (strategy === 5) {
                    const target  = STARTING_BANKROLL + 100;
                    const remaining = target - sessionState.bankroll;
                    const fromCap = (remaining > 0) ? Math.floor(remaining / 32) : 0;
                    const capped  = Math.max(MIN_BET, fromCap);
                    const baseBet = Math.min(sessionState.betPerNumber, capped);
                    const ref     = 4;
                    const N_managed = Math.max(1, Math.min(numbersCount, ref));
                    betUsed = Math.max(1, Math.floor(baseBet * (N_managed / ref)));
                } else if (strategy === 6) {
                    // S6 Super Cautious — two-cap bet placement:
                    //   1) Hard ceiling: s6MaxBet (default 5) — already
                    //      enforced by _applyStrategy on each loss step,
                    //      but clamp here defensively in case the base
                    //      bet drifted (e.g. switch from another S).
                    //   2) Smart cap: scale so a normal win does NOT
                    //      overshoot remaining-to-target. floor at $1
                    //      (not MIN_BET) per the live spec — allow a
                    //      sub-min bet to LAND the target precisely.
                    const S6_MAX = 5;
                    const S6_MIN = 2;
                    const target    = STARTING_BANKROLL + 100;
                    const remaining = target - sessionState.bankroll;
                    let baseBet = Math.min(sessionState.betPerNumber, S6_MAX);
                    if (remaining > 0 && numbersCount < 36) {
                        const maxProfitIfWin = baseBet * (36 - numbersCount);
                        if (maxProfitIfWin > remaining) {
                            const safe = Math.max(1, Math.floor(remaining / (36 - numbersCount)));
                            baseBet = Math.min(baseBet, safe);
                        }
                    }
                    betUsed = Math.max(1, Math.min(baseBet, S6_MAX));
                    // Note: betUsed CAN be below S6_MIN ($2) when the
                    // smart-cap demands it to avoid overshooting target.
                    void S6_MIN; // silence-the-linter (declared for spec clarity)
                } else {
                    betUsed = sessionState.betPerNumber; // save BEFORE strategy adjusts it
                }
                const pnl = this._calculatePnL(betUsed, numbersCount, hit);

                // Update bankroll
                sessionState.bankroll += pnl;
                sessionState.profit += pnl;
                sessionState.totalBets++;

                if (hit) {
                    sessionState.wins++;
                    sessionState.consecutiveWins++;
                    sessionState.consecutiveLosses = 0;
                    // Trigger gate: WIN keeps us armed (continue betting).
                } else {
                    sessionState.losses++;
                    sessionState.consecutiveLosses++;
                    sessionState.consecutiveWins = 0;
                    // Trigger gate (Same OR Wheel mode): LOSS disarms —
                    // wait for next trigger spin in pool.
                    if (triggerGateOn) sessionState.sameArmed = false;
                }
                // A BET breaks any active SKIP streak.
                sessionState.consecutiveSkips = 0;
                // Track peak streaks for the session report.
                if (sessionState.consecutiveLosses > sessionState.maxConsecutiveLosses) {
                    sessionState.maxConsecutiveLosses = sessionState.consecutiveLosses;
                }
                if (sessionState.consecutiveWins > sessionState.maxConsecutiveWins) {
                    sessionState.maxConsecutiveWins = sessionState.consecutiveWins;
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
                    this._applyStrategy(strategy, hit, sessionState, numbersCount),
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
                // Scoped OFF for manual-test — live has no anti-death-spiral
                // reset, so the auto-test must not introduce one. Without
                // this guard, the runner silently caps S4 escalation at 5
                // consecutive losses (resetting bet to $2) which prevents
                // the S4 6-loss escalation from ever firing and emits the
                // "BET RESET / Loss streak" step rows the user observed.
                // Other methods keep the existing safety net unchanged.
                if (this._currentMethod !== 'manual-test'
                    && sessionState.consecutiveLosses >= LOSS_STREAK_RESET
                    && sessionState.reanalyzeCount < MAX_RESETS) {
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
                sessionState.consecutiveSkips++;
                if (sessionState.consecutiveSkips > sessionState.maxConsecutiveSkips) {
                    sessionState.maxConsecutiveSkips = sessionState.consecutiveSkips;
                }
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
            // Per-session peak streaks. Max[Consecutive]{Skips,Losses,Wins}
            // are the longest run of that action within this session.
            maxConsecutiveSkips: state.maxConsecutiveSkips || 0,
            maxConsecutiveLosses: state.maxConsecutiveLosses || 0,
            maxConsecutiveWins: state.maxConsecutiveWins || 0,
            reanalyzeCount: state.reanalyzeCount || 0,
            steps
        };
        // AI-trained-only additions. Attached via Object.assign so legacy
        // method outputs keep their exact key set and ordering.
        if (this._currentMethod === 'AI-trained') {
            try {
                // Step 5 cutover: prefer the new strategies/ai-trained/ folder.
                const loggerMod = (typeof require === 'function') ? require('../../strategies/ai-trained/ai-trained-logger.js') : null;
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

        // ── manual-test ──────────────────────────────────────────
        // Pure-math replay of the live manual-mode prediction. Reads
        // ONLY the spin history (testSpins[0..idx]) + the user's
        // locked env / pair selections. Does NOT call engine methods
        // or touch DOM globals — see strategies/manual-replay for
        // the parity contract with the live UI.
        if (this._currentMethod === 'manual-test') {
            const cfg = this._manualTestConfig;
            if (!cfg) {
                return { action:'SKIP', selectedPair:null, selectedFilter:null, numbers:[], confidence:0, reason:'manual-test: no config' };
            }
            // Lazy-load (same pattern as the 'test' branch below).
            let MR = null;
            try {
                if (typeof require === 'function') MR = require('../../strategies/manual-replay/manual-replay.js');
            } catch (_) { /* fall through */ }
            if (!MR && typeof window !== 'undefined' && window.ManualReplay) MR = window.ManualReplay;
            if (!MR || typeof MR.computeManualPrediction !== 'function') {
                return { action:'SKIP', selectedPair:null, selectedFilter:null, numbers:[], confidence:0, reason:'manual-test: manual-replay module unavailable' };
            }

            // Session-scope walk-back: only the current session's spins
            // are visible to the auto-ref selector inside manual-replay.
            // This mirrors a fresh live session that enters spins from
            // the session's start point — without this, the runner
            // feeds the entire file (testSpins[0..idx]) and the
            // auto-ref walk-back finds different "most recent hits"
            // than a short live session would, producing different
            // 2-of-3 ref picks and divergent predictions.
            //
            // sessionStart is stashed on the runner by _runSession (see
            // this._currentSessionStartIdx). Defensive fallback to 0 so
            // a direct call to _simulateDecision (tests etc.) still
            // works — that path was unreachable in normal runs anyway.
            //
            // Scoped to manual-test only — every other method (auto,
            // T1-strategy, test, 3t-selection, AI-trained, manual) is
            // untouched and continues to receive whatever history its
            // own decision path expects.
            const sessionStart = (typeof this._currentSessionStartIdx === 'number') ? this._currentSessionStartIdx : 0;
            const history = testSpins.slice(sessionStart, idx + 1);
            // Pass through refSelections so manual-replay can honour the
            // user's per-pair 1/2/3 sub-anchor picks when the T1/T2
            // break toggle was ON at config-capture time. When OFF,
            // refSelections is { t1:{}, t2:{} } and manual-replay
            // falls back to auto-pick + includeGrey as before.
            const result = MR.computeManualPrediction(history, cfg.selections || {}, {
                inverse:       !!cfg.inverse,
                includeGrey:   !!cfg.includeGrey,
                t3Halfs:       !!cfg.t3Halfs,
                filters:       cfg.filters || null,
                refSelections: cfg.refSelections || { t1: {}, t2: {} }
            });

            // Wheel mode override: when ON, the wheel's Table/Sign/Set
            // filters become the bet pool source. Two interactions
            // (matches the live behaviour from the wheel panel):
            //
            //   - With pair selections + non-empty manual-replay BET:
            //     intersect pair-pool ∩ wheel-pool. Wheel filters act
            //     as a hard mask. Already applied INSIDE manual-replay
            //     via cfg.filters (computeManualPrediction filters its
            //     output through the same Table/Sign/Set sets), so
            //     here we re-apply against the 0–36 universe only when
            //     fallback is needed.
            //   - With NO pair selections (manual-replay returns
            //     SKIP "No pairs produced a number set"): synthesise
            //     a BET from the wheel-pool directly.
            //
            // The wheel-pool itself uses cfg.filters via the helper
            // _manualTestWheelPool. The inverse toggle is applied
            // there too so a flipped wheel reads correctly.
            const wheelOn = !!cfg.wheelMode;
            let wheelPool = null;
            if (wheelOn) {
                wheelPool = _manualTestWheelPool(cfg);
            }

            if (result.action === 'SKIP') {
                // Wheel-only fallback: no pair pool → use wheel-pool
                // as the bet (when wheelMode is ON and wheel-pool is
                // non-empty). Otherwise the original SKIP stands.
                if (wheelOn && Array.isArray(wheelPool) && wheelPool.length > 0) {
                    return {
                        action: 'BET',
                        selectedPair: 'wheel',
                        selectedFilter: 'wheel-mode',
                        numbers: wheelPool.slice().sort((a, b) => a - b),
                        confidence: 100,
                        reason: 'wheel-mode: bet ' + wheelPool.length + ' numbers from wheel filters (no pair selected)'
                    };
                }
                return {
                    action: 'SKIP',
                    selectedPair: null,
                    selectedFilter: null,
                    numbers: [],
                    confidence: 0,
                    reason: 'manual-test: ' + result.reason
                };
            }
            // selectedPair = a stable label so the report's "Pair"
            // column doesn't misleadingly show only one of multiple
            // selected keys. The full set of selections is surfaced
            // by the Overview "Manual-test Config" block and the
            // per-sheet one-liner header (auto-test-report.js).
            // Money management / hit detection only need result.numbers.
            const allKeys = [
                ...(cfg.selections?.t1 || []),
                ...(cfg.selections?.t2 || []),
                ...(cfg.selections?.t3 || [])
            ];
            const label = (allKeys.length === 1) ? allKeys[0] : 'manual';

            // Pair-pool ∩ wheel-pool intersection when both modes apply.
            // result.numbers has already been filtered by cfg.filters
            // inside manual-replay; the wheel-pool reapplication here
            // is idempotent. Kept explicit so the path is obvious in
            // the log + so a future change to manual-replay's filter
            // order can't silently drop wheel-mode coverage.
            let finalNumbers = result.numbers;
            if (wheelOn && Array.isArray(wheelPool)) {
                const wp = new Set(wheelPool);
                finalNumbers = finalNumbers.filter(n => wp.has(n));
                if (finalNumbers.length === 0) {
                    return {
                        action: 'SKIP',
                        selectedPair: null,
                        selectedFilter: null,
                        numbers: [],
                        confidence: 0,
                        reason: 'manual-test: empty after wheel-pool intersection'
                    };
                }
            }
            return {
                action: 'BET',
                selectedPair: label,
                selectedFilter: 'manual-test',
                numbers: finalNumbers,
                confidence: 100,
                reason: 'manual-test: ' + result.reason + (wheelOn ? ' [wheel-mode]' : '')
            };
        }

        // ── Strategy-Lab ('test' method) ──
        // Locked-pair pair-intersection strategy. The strategy is the
        // SAME module used in live mode (decisionMode='test'), so backtest
        // results are guaranteed to match what live would do for the same
        // input. Pair is locked at session start (see _runSession reset)
        // and reused for every spin in the session.
        if (this._currentMethod === 'test') {
            // Test(Lab) — StrategyAnalyser. SHARED module with the live
            // orchestrator (decisionMode='test'). Same source file, same
            // decide() function, same logic. Live and backtest are
            // guaranteed to produce identical decisions for identical
            // (spins, idx, params, sessionState seed).
            //
            // Each runner session owns its own sessionState. _runSession
            // clears _analyserSessionState at the session boundary so
            // streak counters / T3 cooldowns don't leak across sessions.
            const SA = (typeof require === 'function')
                ? (function () { try { return require('../../strategies/strategy-analyser/strategy-analyser.js'); } catch (_) { return null; } }())
                : (typeof window !== 'undefined' ? window.StrategyAnalyser : null);
            if (!SA) {
                return {
                    action: 'SKIP',
                    selectedPair: null,
                    selectedFilter: null,
                    numbers: [],
                    confidence: 0,
                    reason: 'StrategyAnalyser module not loaded'
                };
            }
            if (!this._analyserSessionState) {
                this._analyserSessionState = SA.createSessionState();
            }
            return SA.decide(this.engine, testSpins, idx, {
                sessionState: this._analyserSessionState,
                params:       this._analyserParams || {}
            });
        }

        // ── 3T-Selection ('3t-selection' method) ──
        // Independent production copy of the Strategy-Lab algorithm.
        // Loaded from strategies/strategy-3t-selection/ and exposed under
        // window.Strategy3T so it can be modified independently of the
        // Test (Lab) sandbox. Locked-pair var also separate.
        if (this._currentMethod === '3t-selection') {
            const S3T = (typeof require === 'function')
                ? (function () { try { return require('../../strategies/strategy-3t-selection/strategy-3t-selection.js'); } catch (_) { return null; } }())
                : (typeof window !== 'undefined' ? window.Strategy3T : null);
            if (!S3T) {
                return {
                    action: 'SKIP',
                    selectedPair: null,
                    selectedFilter: null,
                    numbers: [],
                    confidence: 0,
                    reason: '3T-Selection module not loaded'
                };
            }
            if (!this._locked3TPair) {
                this._locked3TPair = S3T.selectBestPair(this.engine);
            }
            return S3T.decideStrategyLab(this.engine, testSpins, idx, {
                lockedPairRefKey: this._locked3TPair,
                includeGrey: (typeof this._strategyLabIncludeGrey === 'boolean')
                    ? this._strategyLabIncludeGrey
                    : true,
                greyNumbers: []
            });
        }

        // ── Analytics ('analytics' method) ──
        // T2 × T3 wheel-consensus. Stateless (no locked pair) — compares
        // ALL pairs' projections via the engine's deterministic helpers
        // (_getCalculateReferences / _getLookupRow / _computeProjectionForPair),
        // so a backtest reproduces the live Analytics decisions exactly for
        // identical history. See strategies/analytics/analytics-strategy.js.
        if (this._currentMethod === 'analytics') {
            const AN = (typeof require === 'function')
                ? (function () { try { return require('../../strategies/analytics/analytics-strategy.js'); } catch (_) { return null; } }())
                : (typeof window !== 'undefined' ? window.AnalyticsStrategy : null);
            if (!AN) {
                return {
                    action: 'SKIP',
                    selectedPair: null,
                    selectedFilter: null,
                    numbers: [],
                    confidence: 0,
                    reason: 'Analytics module not loaded'
                };
            }
            const params = (typeof window !== 'undefined' && window.analyticsParams) ? window.analyticsParams : null;
            return AN.decide(this.engine, testSpins, idx, { params: params });
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
            ? (function(){ try { return require('../../strategies/ai-trained/ai-trained-strategy.js'); } catch(_) { return null; } })()
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
    _applyStrategy(strategy, hit, state, numbersCount) {
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
            // Strategy 2: Conservative — CUMULATIVE losses model.
            //   +$1 after every 3 cumulative losses (single wins do
            //     NOT reset s2LossTally — only an explicit bet change does).
            //   −$1 after 2 consecutive wins.
            //   Both adjustments reset s2LossTally.
            // Mirrors live app/money-management-panel.js Strategy 2 block.
            if (hit) {
                if (state.consecutiveWins >= 2) {
                    bet = Math.max(MIN_BET, bet - 1);
                    state.consecutiveWins = 0;
                    state.s2LossTally    = 0;
                }
            } else {
                state.s2LossTally = (state.s2LossTally || 0) + 1;
                if (state.s2LossTally >= 3) {
                    bet = bet + 1;
                    state.s2LossTally = 0;
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
        } else if (strategy === 4) {
            // Strategy 4: Defensive — CUMULATIVE losses model (matches
            // live app/money-management-panel.js defaults):
            //   s4LossesToIncrease = 8 → +$1 after 8 cumulative losses
            //     (single wins do NOT reset s4LossTally — only an
            //     explicit bet change does).
            //   s4WinsToDecrease   = 1 → -$1 after 1 consecutive win.
            //   Both adjustments reset s4LossTally.
            if (hit) {
                if (state.consecutiveWins >= 1) {
                    bet = Math.max(MIN_BET, bet - 1);
                    state.consecutiveWins = 0;
                    state.s4LossTally    = 0;
                }
            } else {
                state.s4LossTally = (state.s4LossTally || 0) + 1;
                if (state.s4LossTally >= 8) {
                    bet = bet + 1;
                    state.s4LossTally = 0;
                }
            }
        } else if (strategy === 5) {
            // Strategy 5: LOGICAL — same N/4 fractional model as live.
            //   miss adds N_managed/4 to s5LossUnits (N_managed ≤ 4)
            //   hit  adds 1.0 to s5WinUnits (any hit = full win)
            // Triggers: 6 cumulative loss-units → +$1 base; 1 win-unit → −$1.
            // Min bet $2. Cap-to-target is applied at bet PLACEMENT, not here.
            const lossesNeeded = 6;
            const lossInc      = 1;
            const winsNeeded   = 1;
            const winDec       = 1;
            const ref          = 4;
            const N_managed    = Math.max(1, Math.min(parseInt(numbersCount, 10) || ref, ref));
            if (hit) {
                state.s5WinUnits  = (state.s5WinUnits || 0) + 1.0;
                state.s5LossUnits = 0;
                if (state.s5WinUnits >= winsNeeded) {
                    bet = Math.max(MIN_BET, bet - winDec);
                    state.s5WinUnits = 0;
                }
            } else {
                state.s5LossUnits = (state.s5LossUnits || 0) + (N_managed / ref);
                state.s5WinUnits  = 0;
                if (state.s5LossUnits >= lossesNeeded) {
                    bet = bet + lossInc;
                    state.s5LossUnits = 0;
                }
            }
        } else if (strategy === 6) {
            // Strategy 6: SUPER CAUTIOUS — Defensive escalation with a
            // HARD max-bet ceiling. Smart-bet target cap is applied at
            // BET PLACEMENT (see the strategy === 6 block above in
            // _runSession), not here — this block only handles the
            // per-result base-bet escalation/de-escalation.
            const lossesNeeded = 3;   // default — runner-side mirror of live
            const lossInc      = 1;
            const winsNeeded   = 1;
            const winDec       = 1;
            const S6_MIN       = 2;
            const S6_MAX       = 5;
            if (hit) {
                if (state.consecutiveWins >= winsNeeded) {
                    bet = Math.max(S6_MIN, bet - winDec);
                    state.consecutiveWins = 0;
                }
            } else {
                if (state.consecutiveLosses >= lossesNeeded) {
                    bet = Math.min(S6_MAX, bet + lossInc);
                    state.consecutiveLosses = 0;
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

        // Worst-case streaks across every session in this strategy. These
        // give the user a quick read on how brutal the worst session got
        // — e.g. a 50-spin skip streak or a 12-loss losing streak.
        const maxConsecutiveSkips  = Math.max(0, ...sessions.map(s => s.maxConsecutiveSkips || 0));
        const maxConsecutiveLosses = Math.max(0, ...sessions.map(s => s.maxConsecutiveLosses || 0));
        const maxConsecutiveWins   = Math.max(0, ...sessions.map(s => s.maxConsecutiveWins || 0));

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
            maxConsecutiveSkips,
            maxConsecutiveLosses,
            maxConsecutiveWins,
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
            maxConsecutiveSkips: 0,
            maxConsecutiveLosses: 0,
            maxConsecutiveWins: 0,
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
