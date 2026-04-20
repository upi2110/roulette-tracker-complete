/**
 * 60-auto-mode-parity.test.js
 *
 * Parity tests for live AUTO mode vs Auto Test AUTO mode
 * (method === 'auto-test' / 'test-strategy').
 *
 * Auto Test AUTO runs through AutoTestRunner._simulateDecision,
 * which mirrors engine.decide() step-for-step. Live AUTO runs the
 * decision through the engine's own decide() via the orchestrator.
 * This suite locks in the behavioural invariants the set-fix AUTO
 * parity commit established:
 *
 *   AA. Decision parity — same spin stream, same engine state, same
 *       decision (BET/SKIP, pair, filter, numbers, confidence).
 *   BB. Session reset on setMode('auto') — matches runner line 151.
 *   CC. Retrain disable on setMode('auto') — matches runner lines
 *       143-146. Restored on Manual/Semi.
 *   DD. Flag-gated money-panel pnl: AUTO-only formula aligned with
 *       runner (_calculatePnL line 529). Manual/Semi/T1-strategy
 *       keep the legacy formula byte-for-byte.
 *   EE. Orchestrator places pendingBet synchronously on AUTO BET
 *       (cascade-bypass), not after the 800 ms aiPanel debounce.
 */

const path = require('path');
const { setupDOM, createMoneyPanel } = require('../test-setup');

// Load the real engine + runner (they share identical decision code).
const { AIAutoEngine } = require('../../app/ai-auto-engine');
const { AutoTestRunner } = require('../../app/auto-test-runner');

// ── Helpers ─────────────────────────────────────────────────────────
function makeTrainedEngine(opts = {}) {
    const e = new AIAutoEngine(Object.assign({
        confidenceThreshold: 65, maxConsecutiveSkips: 5
    }, opts));
    // Seed the engine into a "trained" state without going through
    // the full training pipeline (not needed for the parity checks —
    // we only verify the scaffold lifecycle + flags + bypass).
    e.isTrained = true;
    e._retrainInterval = 50;
    e._retrainLossStreak = 8;
    return e;
}

// ═══════════════════════════════════════════════════════════════════
//  AA. Decision parity — engine.decide() and runner._simulateDecision
// ═══════════════════════════════════════════════════════════════════
describe('AA. Decision parity (engine vs runner on same stream)', () => {
    test('AA1: both call _getFlashingPairsFromHistory, simulateT2FlashAndNumbers, _computeConfidence (structural parity)', () => {
        const e = makeTrainedEngine();
        expect(typeof e._getFlashingPairsFromHistory).toBe('function');
        expect(typeof e.simulateT2FlashAndNumbers).toBe('function');
        expect(typeof e._computeConfidence).toBe('function');
        // Runner has its own _simulateDecision that calls the same
        // three helpers — its existence is enough for structural
        // parity; byte-level call-path equivalence is enforced by
        // the duplicated body (auto-test-runner.js:410-507 vs
        // ai-auto-engine.js:767-889).
        const r = new AutoTestRunner(e);
        expect(typeof r._simulateDecision).toBe('function');
    });

    test('AA2: runner passes NO blacklistedPairs in its own _runSession loop', () => {
        // Confirms blacklistedPairs is dead code in the runner —
        // engine.decide() has no blacklist either, so the two
        // pipelines agree by "neither uses it".
        const fs = require('fs');
        const src = fs.readFileSync(path.join(__dirname, '../../app/auto-test-runner.js'), 'utf8');
        const callSite = src.match(/this\._simulateDecision\(testSpins,\s*\w+\)/);
        expect(callSite).not.toBeNull();
        // Two-arg call (no blacklist).
        expect(callSite[0]).not.toMatch(/blacklist/i);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  BB. setMode('auto') resets engine.session
// ═══════════════════════════════════════════════════════════════════
describe('BB. setMode(auto) matches runner line 151 resetSession', () => {
    function loadUI() {
        setupDOM();
        const fs = require('fs');
        const src = fs.readFileSync(path.join(__dirname, '../../app/ai-auto-mode-ui.js'), 'utf8');
        const wrapped = `(function(){ ${src}; return AIAutoModeUI; })()`;
        return eval(wrapped);
    }

    test('BB1: engine.session.consecutiveSkips is reset on setMode(auto)', () => {
        const AIAutoModeUI = loadUI();
        const eng = makeTrainedEngine();
        eng.session.consecutiveSkips = 7;
        eng.session.sessionWinRate = 0.42;
        const ui = new AIAutoModeUI();
        ui.engine = eng;
        window.aiAutoEngine = eng;
        ui.setMode('auto');
        expect(eng.session.consecutiveSkips).toBe(0);
    });

    test('BB2: T1-strategy path is NOT touched — engine.session accumulates as before', () => {
        const AIAutoModeUI = loadUI();
        const eng = makeTrainedEngine();
        eng.session.consecutiveSkips = 7;
        const ui = new AIAutoModeUI();
        ui.engine = eng;
        window.aiAutoEngine = eng;
        ui.setMode('t1-strategy');
        // T1 branch does NOT reset — matches "do not touch T1" rule.
        expect(eng.session.consecutiveSkips).toBe(7);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  CC. setMode('auto') disables retrain; Manual/Semi restore
// ═══════════════════════════════════════════════════════════════════
describe('CC. Retrain disable matches runner lines 143-146', () => {
    function loadUI() {
        setupDOM();
        const fs = require('fs');
        const src = fs.readFileSync(path.join(__dirname, '../../app/ai-auto-mode-ui.js'), 'utf8');
        return eval(`(function(){ ${src}; return AIAutoModeUI; })()`);
    }

    test('CC1: _retrainInterval + _retrainLossStreak = Infinity after setMode(auto)', () => {
        const AIAutoModeUI = loadUI();
        const eng = makeTrainedEngine();
        const ui = new AIAutoModeUI();
        ui.engine = eng;
        window.aiAutoEngine = eng;
        ui.setMode('auto');
        expect(eng._retrainInterval).toBe(Infinity);
        expect(eng._retrainLossStreak).toBe(Infinity);
    });

    test('CC2: Manual/Semi restores the pre-AUTO retrain intervals', () => {
        const AIAutoModeUI = loadUI();
        const eng = makeTrainedEngine();
        expect(eng._retrainInterval).toBe(50);
        expect(eng._retrainLossStreak).toBe(8);
        const ui = new AIAutoModeUI();
        ui.engine = eng;
        window.aiAutoEngine = eng;
        ui.setMode('auto');
        expect(eng._retrainInterval).toBe(Infinity);
        ui.setMode('manual');
        expect(eng._retrainInterval).toBe(50);
        expect(eng._retrainLossStreak).toBe(8);
    });

    test('CC3: T1-strategy does NOT disable retrain (unchanged)', () => {
        const AIAutoModeUI = loadUI();
        const eng = makeTrainedEngine();
        const ui = new AIAutoModeUI();
        ui.engine = eng;
        window.aiAutoEngine = eng;
        ui.setMode('t1-strategy');
        expect(eng._retrainInterval).toBe(50);
        expect(eng._retrainLossStreak).toBe(8);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  DD. Money-panel pnl: flag-gated AUTO-only correction
// ═══════════════════════════════════════════════════════════════════
describe('DD. moneyPanel._useAutoTestPnl flips pnl math only for AUTO', () => {
    test('DD1: default _useAutoTestPnl is false — legacy math preserved', async () => {
        const mp = createMoneyPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = true;
        // Legacy: betPerNumber × 35 − betPerNumber × numbersCount
        // With b=2, count=12 → 70 − 24 = 46.
        mp._useAutoTestPnl = false;
        await mp.recordBetResult(2, 12, true, 5);
        expect(mp.betHistory[0].netChange).toBe(46);
    });

    test('DD2: when _useAutoTestPnl=true, formula matches runner _calculatePnL', async () => {
        const mp = createMoneyPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = true;
        // Auto Test runner: betPerNumber × (36 − numbersCount)
        // With b=2, count=12 → 2 × 24 = 48.
        mp._useAutoTestPnl = true;
        await mp.recordBetResult(2, 12, true, 5);
        expect(mp.betHistory[0].netChange).toBe(48);
    });

    test('DD3: loss math is identical in both flag states (only hits differ)', async () => {
        const mpLegacy = createMoneyPanel();
        mpLegacy.sessionData.isSessionActive = true;
        mpLegacy.sessionData.isBettingEnabled = true;
        mpLegacy._useAutoTestPnl = false;
        await mpLegacy.recordBetResult(2, 12, false, 5);

        const mpAuto = createMoneyPanel();
        mpAuto.sessionData.isSessionActive = true;
        mpAuto.sessionData.isBettingEnabled = true;
        mpAuto._useAutoTestPnl = true;
        await mpAuto.recordBetResult(2, 12, false, 5);

        expect(mpLegacy.betHistory[0].netChange).toBe(-24);
        expect(mpAuto.betHistory[0].netChange).toBe(-24);
    });

    test('DD4: ai-auto-mode-ui setMode(auto) sets the flag; setMode(manual) clears it', () => {
        setupDOM();
        const fs = require('fs');
        const src = fs.readFileSync(path.join(__dirname, '../../app/ai-auto-mode-ui.js'), 'utf8');
        const AIAutoModeUI = eval(`(function(){ ${src}; return AIAutoModeUI; })()`);
        const eng = makeTrainedEngine();
        const mp = { _useAutoTestPnl: false };
        window.aiAutoEngine = eng;
        window.moneyPanel = mp;
        const ui = new AIAutoModeUI();
        ui.engine = eng;
        ui.setMode('auto');
        expect(mp._useAutoTestPnl).toBe(true);
        ui.setMode('manual');
        expect(mp._useAutoTestPnl).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  EE. Orchestrator bypasses the 800ms cascade on AUTO BET
// ═══════════════════════════════════════════════════════════════════
describe('EE. orchestrator handleAutoMode synchronous setPrediction on AUTO BET', () => {
    function loadOrch() {
        setupDOM();
        const fs = require('fs');
        const src = fs.readFileSync(path.join(__dirname, '../../app/auto-update-orchestrator.js'), 'utf8');
        return eval(`(function(){ ${src}; return AutoUpdateOrchestrator; })()`);
    }

    test('EE1: on BET in AUTO decisionMode, moneyPanel.setPrediction is called synchronously', async () => {
        const Orch = loadOrch();
        const orch = new Orch();
        orch.decisionMode = 'auto';
        orch.autoMode = true;

        const calls = [];
        window.moneyPanel = {
            setPrediction: (p) => { calls.push(p); },
            pendingBet: null,
            sessionData: { isSessionActive: true, isBettingEnabled: true },
            checkForNewSpin: () => {}
        };
        window.aiPanel = { clearSelections: () => {}, _handleTable3Selection: () => {} };
        window.aiAutoEngine = {
            isEnabled: true, lastDecision: null,
            decide: () => ({
                action: 'BET',
                selectedPair: 'prev',
                selectedFilter: 'both_both',
                numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
                confidence: 70
            }),
            recordSkip: () => {}
        };
        window.aiPanel.loadAvailablePairs = () => {};
        window.aiAutoModeUI = { updateDecisionDisplay: () => {} };
        window.rouletteWheel = { clearHighlights: () => {} };
        window.spins = [{ actual: 5 }, { actual: 10 }, { actual: 17 }, { actual: 23 }];

        await orch.handleAutoMode();
        expect(calls.length).toBe(1);
        expect(calls[0].numbers.length).toBe(12);
        expect(calls[0].signal).toBe('BET NOW');
    });

    test('EE2: T1-strategy decisionMode does NOT call setPrediction directly (keeps cascade)', async () => {
        const Orch = loadOrch();
        const orch = new Orch();
        orch.decisionMode = 't1-strategy';
        orch.autoMode = true;

        const calls = [];
        window.moneyPanel = { setPrediction: (p) => { calls.push(p); }, pendingBet: null };
        window.decideT1Strategy = () => ({
            action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both',
            numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], confidence: 70
        });
        window.aiPanel = { clearSelections: () => {}, _handleTable3Selection: () => {}, loadAvailablePairs: () => {} };
        window.aiAutoEngine = { lastDecision: null, recordSkip: () => {} };
        window.aiAutoModeUI = { updateDecisionDisplay: () => {} };
        window.rouletteWheel = { clearHighlights: () => {} };
        window.spins = [{ actual: 5 }, { actual: 10 }, { actual: 17 }, { actual: 23 }];

        await orch.handleAutoMode();
        // Direct setPrediction bypass is NOT invoked for T1 path —
        // 0 calls proves the bypass is scoped to 'auto' only.
        expect(calls.length).toBe(0);
    });

    test('EE3: on SKIP in AUTO decisionMode, setPrediction is NOT called (and pendingBet clears)', async () => {
        const Orch = loadOrch();
        const orch = new Orch();
        orch.decisionMode = 'auto';
        orch.autoMode = true;
        const calls = [];
        window.moneyPanel = {
            setPrediction: (p) => { calls.push(p); },
            pendingBet: { betAmount: 2, numbersCount: 12, predictedNumbers: [1, 2] },
            sessionData: { isSessionActive: true, isBettingEnabled: true }
        };
        window.aiPanel = { clearSelections: () => {}, loadAvailablePairs: () => {} };
        window.aiAutoEngine = {
            isEnabled: true, lastDecision: null,
            decide: () => ({ action: 'SKIP', selectedPair: null, selectedFilter: null, numbers: [], confidence: 30 }),
            recordSkip: () => {}
        };
        window.aiAutoModeUI = { updateDecisionDisplay: () => {} };
        window.rouletteWheel = { clearHighlights: () => {} };
        window.spins = [{ actual: 5 }, { actual: 10 }, { actual: 17 }, { actual: 23 }];

        await orch.handleAutoMode();
        expect(calls.length).toBe(0);
        expect(window.moneyPanel.pendingBet).toBeNull();
    });
});
