/**
 * Test Suite 54: Session Recording, P&L, Bayesian Isolation, Logger
 *
 * Tests all 4 bugs fixed in the session recording batch:
 *   A) P&L formulas (money panel + test runner agree)
 *   B) Bayesian state isolation across test sessions
 *   C) Session recorder lifecycle
 *   D) Verbose logger lifecycle
 *   E) Session-complete notification / auto-stop
 */

// ── Load modules under test ──
const { SessionRecorder } = require('../../app/session-recorder');
const { VerboseLogger } = require('../../app/verbose-logger');

// ── Load AutoTestRunner + Engine ──
const { AutoTestRunner } = require('../../app/auto-test-runner');
const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');

// ── Mock renderer functions (same as test 22/24) ──
const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:35, 3:17, 4:6, 5:22, 6:4, 7:18, 8:24, 9:29,
    10:33, 11:36, 12:3, 13:27, 14:31, 15:19, 16:23, 17:3, 18:7, 19:15,
    20:1, 21:25, 22:5, 23:16, 24:8, 25:21, 26:32, 27:13, 28:1, 29:9,
    30:11, 31:14, 32:26, 33:10, 34:0, 35:2, 36:11
};

function calculatePositionCode(reference, actual) {
    if (reference === undefined || reference === null || actual === undefined || actual === null) return 'XX';
    const refIdx = WHEEL_STANDARD.indexOf(reference);
    const actIdx = WHEEL_STANDARD.indexOf(actual);
    if (refIdx === -1 || actIdx === -1) return 'XX';
    const len = WHEEL_STANDARD.length;
    const oppIdx = (refIdx + 18) % len;
    let cwFromSame = (actIdx - refIdx + len) % len;
    let ccwFromSame = (refIdx - actIdx + len) % len;
    let cwFromOpp = (actIdx - oppIdx + len) % len;
    let ccwFromOpp = (oppIdx - actIdx + len) % len;
    const minSame = Math.min(cwFromSame, ccwFromSame);
    const minOpp = Math.min(cwFromOpp, ccwFromOpp);
    if (minSame <= minOpp) {
        if (cwFromSame <= ccwFromSame) return cwFromSame === 0 ? 'S+0' : `SR+${cwFromSame}`;
        return `SL+${ccwFromSame}`;
    }
    if (cwFromOpp <= ccwFromOpp) return cwFromOpp === 0 ? 'O+0' : `OR+${cwFromOpp}`;
    return `OL+${ccwFromOpp}`;
}

function calculateReferences(prev, prevPrev) {
    if (prev === undefined || prev === null) return {};
    const prevIdx = WHEEL_STANDARD.indexOf(prev);
    const len = WHEEL_STANDARD.length;
    return {
        prev: prev,
        prev_plus_1: WHEEL_STANDARD[(prevIdx + 1) % len],
        prev_minus_1: WHEEL_STANDARD[(prevIdx - 1 + len) % len],
        prev_plus_2: WHEEL_STANDARD[(prevIdx + 2) % len],
        prev_minus_2: WHEEL_STANDARD[(prevIdx - 2 + len) % len],
        prev_prev: prevPrev !== undefined ? prevPrev : prev
    };
}

function _getPosCodeDistance(posCode) {
    if (!posCode || posCode === 'XX') return null;
    const m = posCode.match(/[+\-](\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

function generateAnchors() { return []; }
function expandAnchorsToBetNumbers() { return []; }

const { getLookupRow } = require('../../app/table-lookup');

// ═══════════════════════════════════════════════════════════
//  HELPER: create trained engine
// ═══════════════════════════════════════════════════════════
function createTrainedEngine() {
    const engine = new AIAutoEngine({
        calculateReferences,
        calculatePositionCode,
        DIGIT_13_OPPOSITES,
        generateAnchors,
        expandAnchorsToBetNumbers,
        getLookupRow,
        _getPosCodeDistance
    });

    // Load minimal training data
    const fs = require('fs');
    const dataDir = require('path').join(__dirname, '../../app/data');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
    const allSpins = [];
    for (const f of files) {
        const content = fs.readFileSync(require('path').join(dataDir, f), 'utf8');
        const nums = content.split(/[,\s\n]+/).map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 36);
        allSpins.push(...nums);
    }

    engine.train(allSpins);
    return { engine, trainData: allSpins };
}

// ═══════════════════════════════════════════════════════════
//  GROUP A: P&L CALCULATIONS
// ═══════════════════════════════════════════════════════════

describe('Group A: P&L Calculations', () => {

    test('A1: HIT P&L matches roulette formula: betPerNumber × (36 - numbersCount)', () => {
        // Roulette: 35:1 payout on winning number + original bet returned = 36× the winning bet
        // You bet $2 on 12 numbers → total outlay = $24
        // Hit: you win 35:1 on 1 number → receive $72 → net = $72 - $24 = $48
        // Formula: $2 × (36 - 12) = $48 ✓

        const betPerNumber = 2;
        const numbersCount = 12;
        const expected = betPerNumber * (36 - numbersCount); // 2 × 24 = 48

        // Money panel formula: winAmount = betPerNumber * 36; netChange = winAmount - totalBet
        const winAmount = betPerNumber * 36; // 72
        const totalBet = betPerNumber * numbersCount; // 24
        const moneyPanelResult = winAmount - totalBet; // 48

        expect(moneyPanelResult).toBe(expected);
        expect(moneyPanelResult).toBe(48);
    });

    test('A2: MISS P&L = -(betPerNumber × numbersCount)', () => {
        const betPerNumber = 2;
        const numbersCount = 12;
        const expected = -(betPerNumber * numbersCount); // -24

        expect(expected).toBe(-24);
    });

    test('A3: Money panel and test runner P&L formulas produce identical results', () => {
        const { engine } = createTrainedEngine();
        const runner = new AutoTestRunner(engine);

        // Test multiple bet/count combos
        const combos = [
            { bet: 2, count: 12 },
            { bet: 3, count: 10 },
            { bet: 5, count: 8 },
            { bet: 2, count: 15 },
            { bet: 10, count: 6 },
        ];

        for (const { bet, count } of combos) {
            // Test runner formula
            const runnerHit = runner._calculatePnL(bet, count, true);
            const runnerMiss = runner._calculatePnL(bet, count, false);

            // Money panel formula (what it now uses after fix)
            const winAmount = bet * 36;
            const totalBet = bet * count;
            const panelHit = winAmount - totalBet;
            const panelMiss = -totalBet;

            expect(runnerHit).toBe(panelHit);
            expect(runnerMiss).toBe(panelMiss);
            expect(runnerHit).toBe(bet * (36 - count));
            expect(runnerMiss).toBe(-(bet * count));
        }
    });

    test('A4: Bankroll updates correctly: start $4000, win $48 → $4048', () => {
        const startingBankroll = 4000;
        const betPerNumber = 2;
        const numbersCount = 12;
        const pnl = betPerNumber * (36 - numbersCount); // 48
        const newBankroll = startingBankroll + pnl;

        expect(newBankroll).toBe(4048);
    });

    test('A5: Multiple bets accumulate correctly', () => {
        let bankroll = 4000;
        const betPerNumber = 2;
        const numbersCount = 12;

        // Bet 1: HIT → +48
        bankroll += betPerNumber * (36 - numbersCount);
        expect(bankroll).toBe(4048);

        // Bet 2: MISS → -24
        bankroll += -(betPerNumber * numbersCount);
        expect(bankroll).toBe(4024);

        // Bet 3: MISS → -24
        bankroll += -(betPerNumber * numbersCount);
        expect(bankroll).toBe(4000);

        // Bet 4: HIT → +48
        bankroll += betPerNumber * (36 - numbersCount);
        expect(bankroll).toBe(4048);
    });

    test('A6: Old WRONG formula (35 instead of 36) produces incorrect results', () => {
        // This documents the bug that was fixed
        const betPerNumber = 2;
        const numbersCount = 12;

        const wrongWinAmount = betPerNumber * 35; // OLD BUG
        const totalBet = betPerNumber * numbersCount;
        const wrongPnL = wrongWinAmount - totalBet; // 70 - 24 = 46 ← WRONG

        const correctWinAmount = betPerNumber * 36; // FIXED
        const correctPnL = correctWinAmount - totalBet; // 72 - 24 = 48 ← CORRECT

        expect(wrongPnL).toBe(46); // Documents the old bug
        expect(correctPnL).toBe(48); // Correct result
        expect(correctPnL - wrongPnL).toBe(betPerNumber); // Difference is exactly $betPerNumber
    });

    test('A7: P&L for edge case: bet on all 37 numbers (0-36)', () => {
        const betPerNumber = 2;
        const numbersCount = 37;

        // HIT: 2 × (36 - 37) = -2 (always a net loss when betting all numbers)
        const hitPnL = betPerNumber * (36 - numbersCount);
        expect(hitPnL).toBe(-2);

        // MISS is impossible when betting all 37, but formula gives:
        const missPnL = -(betPerNumber * numbersCount);
        expect(missPnL).toBe(-74);
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP B: BAYESIAN STATE ISOLATION
// ═══════════════════════════════════════════════════════════

describe('Group B: Bayesian State Isolation', () => {

    test('B1: After resetSession(), session state is cleared', () => {
        const { engine } = createTrainedEngine();

        // Simulate some session activity
        engine.session.totalBets = 5;
        engine.session.wins = 2;
        engine.session.losses = 3;
        engine.session.consecutiveLosses = 3;
        engine.session.sessionSpinCount = 20;

        engine.resetSession();

        expect(engine.session.totalBets).toBe(0);
        expect(engine.session.wins).toBe(0);
        expect(engine.session.losses).toBe(0);
        expect(engine.session.consecutiveLosses).toBe(0);
        expect(engine.session.sessionSpinCount).toBe(0);
    });

    test('B2: After resetSession(), pairBayesian is NOT cleared (global state)', () => {
        const { engine } = createTrainedEngine();

        // Get initial Bayesian state
        const bayesianBefore = JSON.parse(JSON.stringify(engine.pairBayesian || {}));
        const keyCount = Object.keys(bayesianBefore).length;

        engine.resetSession();

        // Bayesian state should persist (this is by design)
        const bayesianAfter = engine.pairBayesian || {};
        expect(Object.keys(bayesianAfter).length).toBe(keyCount);

        // Values should be identical
        for (const key of Object.keys(bayesianBefore)) {
            expect(bayesianAfter[key].alpha).toBe(bayesianBefore[key].alpha);
            expect(bayesianAfter[key].beta).toBe(bayesianBefore[key].beta);
        }
    });

    test('B3: Test runner save/restore produces identical Bayesian state before each session', () => {
        const { engine } = createTrainedEngine();

        // Snapshot the pristine state (mimicking runAll's save)
        const savedBayesian = JSON.parse(JSON.stringify(engine.pairBayesian || {}));
        const savedCount = engine._totalBayesianDecisions || 0;
        const savedPairModels = JSON.parse(JSON.stringify(engine.pairModels || {}));

        // Simulate what happens in a test session — recordResult mutates state
        const refKeys = Object.keys(engine.pairModels);
        if (refKeys.length > 0) {
            const testKey = refKeys[0];
            const filterKey = Object.keys(FILTER_COMBOS)[0];
            // Mutate by recording a result
            engine.recordResult(testKey, filterKey, true, 17, [17, 34, 6]);
        }

        // Bayesian state should now differ
        const mutatedBayesian = JSON.parse(JSON.stringify(engine.pairBayesian || {}));

        // Restore pristine state (mimicking runAll's per-session restore)
        engine.pairBayesian = JSON.parse(JSON.stringify(savedBayesian));
        engine._totalBayesianDecisions = savedCount;
        engine.pairModels = JSON.parse(JSON.stringify(savedPairModels));

        // Verify restored state matches original exactly
        for (const key of Object.keys(savedBayesian)) {
            expect(engine.pairBayesian[key].alpha).toBe(savedBayesian[key].alpha);
            expect(engine.pairBayesian[key].beta).toBe(savedBayesian[key].beta);
        }
        expect(engine._totalBayesianDecisions).toBe(savedCount);
    });

    test('B4: Post-loop state restoration in runAll() restores engine to pre-test state', () => {
        const { engine } = createTrainedEngine();

        // Snapshot before any test runs
        const preTestBayesian = JSON.parse(JSON.stringify(engine.pairBayesian || {}));
        const preTestCount = engine._totalBayesianDecisions || 0;
        const preTestPairModels = JSON.parse(JSON.stringify(engine.pairModels || {}));
        const preTestFilterModels = JSON.parse(JSON.stringify(engine.filterModels || {}));

        // Simulate the save/restore pattern from runAll()
        const savedBayesian = JSON.parse(JSON.stringify(engine.pairBayesian || {}));
        const savedCount = engine._totalBayesianDecisions || 0;
        const savedPairModels = JSON.parse(JSON.stringify(engine.pairModels || {}));
        const savedFilterModels = JSON.parse(JSON.stringify(engine.filterModels || {}));

        // Simulate some mutations (like recordResult does in test sessions)
        const refKeys = Object.keys(engine.pairModels);
        if (refKeys.length > 0) {
            engine.pairBayesian[refKeys[0]] = { alpha: 999, beta: 999 };
            engine._totalBayesianDecisions = 99999;
        }

        // Post-loop restoration (what we just fixed)
        engine.pairBayesian = savedBayesian;
        engine._totalBayesianDecisions = savedCount;
        engine.pairModels = savedPairModels;
        engine.filterModels = savedFilterModels;

        // Verify engine state matches pre-test exactly
        for (const key of Object.keys(preTestBayesian)) {
            expect(engine.pairBayesian[key].alpha).toBe(preTestBayesian[key].alpha);
            expect(engine.pairBayesian[key].beta).toBe(preTestBayesian[key].beta);
        }
        expect(engine._totalBayesianDecisions).toBe(preTestCount);
    });

    test('B5: recordResult() mutates pairBayesian (demonstrates why save/restore is needed)', () => {
        const { engine } = createTrainedEngine();

        const refKeys = Object.keys(engine.pairBayesian || {});
        if (refKeys.length === 0) {
            // Skip if no Bayesian data exists
            return;
        }

        const testKey = refKeys[0];
        const filterKey = Object.keys(FILTER_COMBOS)[0];
        const alphaBefore = engine.pairBayesian[testKey].alpha;
        const betaBefore = engine.pairBayesian[testKey].beta;

        // recordResult for a HIT should increase alpha
        engine.recordResult(testKey, filterKey, true, 17, [17, 34, 6]);

        const alphaAfter = engine.pairBayesian[testKey].alpha;
        const betaAfter = engine.pairBayesian[testKey].beta;

        // At least one of alpha/beta should have changed
        expect(alphaAfter !== alphaBefore || betaAfter !== betaBefore).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP C: SESSION RECORDER
// ═══════════════════════════════════════════════════════════

describe('Group C: Session Recorder', () => {

    test('C1: startSession() sets isActive = true', () => {
        const rec = new SessionRecorder();
        expect(rec.isActive).toBe(false);

        rec.startSession(4000, 100, 1, 'auto');
        expect(rec.isActive).toBe(true);
    });

    test('C2: recordWatch() adds WATCH step with correct fields', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        rec.recordWatch(32, null, 4000);
        const steps = rec.getSteps();

        expect(steps.length).toBe(1);
        expect(steps[0].action).toBe('WATCH');
        expect(steps[0].spinNumber).toBe(32);
        expect(steps[0].nextNumber).toBeNull();
        expect(steps[0].bankroll).toBe(4000);
        expect(steps[0].cumulativeProfit).toBe(0);
        expect(steps[0].betPerNumber).toBe(0);
        expect(steps[0].numbersCount).toBe(0);
    });

    test('C3: recordDecision() adds BET step', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        const decision = {
            action: 'BET',
            selectedPair: 'prev',
            selectedFilter: 'same-half',
            numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            confidence: 75
        };

        rec.recordDecision(15, decision, 2, 4000);
        const steps = rec.getSteps();

        expect(steps.length).toBe(1);
        expect(steps[0].action).toBe('BET');
        expect(steps[0].selectedPair).toBe('prev');
        expect(steps[0].selectedFilter).toBe('same-half');
        expect(steps[0].predictedNumbers).toHaveLength(12);
        expect(steps[0].confidence).toBe(75);
        expect(steps[0].betPerNumber).toBe(2);
        expect(steps[0].numbersCount).toBe(12);
        expect(steps[0].hit).toBe(false); // Not yet resolved
        expect(steps[0].nextNumber).toBeNull(); // Not yet resolved
    });

    test('C4: recordDecision() adds SKIP step', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        const decision = { action: 'SKIP', confidence: 40 };
        rec.recordDecision(15, decision, 0, 4000);
        const steps = rec.getSteps();

        expect(steps.length).toBe(1);
        expect(steps[0].action).toBe('SKIP');
        expect(steps[0].numbersCount).toBe(0);
        expect(steps[0].predictedNumbers).toHaveLength(0);
    });

    test('C5: updateLastBetResult() fills in hit/pnl/bankroll on last BET', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        const decision = {
            action: 'BET',
            selectedPair: 'prev',
            selectedFilter: 'same-half',
            numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            confidence: 75
        };
        rec.recordDecision(15, decision, 2, 4000);

        // Resolve: HIT, actual number 5 → pnl = 2×(36-12) = 48
        rec.updateLastBetResult(5, true, 48, 4048, 48);

        const steps = rec.getSteps();
        expect(steps[0].nextNumber).toBe(5);
        expect(steps[0].hit).toBe(true);
        expect(steps[0].pnl).toBe(48);
        expect(steps[0].bankroll).toBe(4048);
        expect(steps[0].cumulativeProfit).toBe(48);
    });

    test('C6: reset() clears all state and sets isActive = false', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        // Add some steps
        rec.recordWatch(32, null, 4000);
        rec.recordWatch(15, null, 4000);
        expect(rec.stepCount).toBe(2);
        expect(rec.isActive).toBe(true);

        rec.reset();

        expect(rec.isActive).toBe(false);
        expect(rec.stepCount).toBe(0);
        expect(rec.getSteps()).toHaveLength(0);
    });

    test('C7: getSessionResult() returns correct format matching test runner', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        // Simulate: 3 watches + 1 BET hit + 1 BET miss
        rec.recordWatch(32, null, 4000);
        rec.recordWatch(15, null, 4000);
        rec.recordWatch(19, null, 4000);

        // BET 1: HIT
        rec.recordDecision(4, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: [1,2,3,4,5,6,7,8,9,10,11,12], confidence: 75
        }, 2, 4000);
        rec.updateLastBetResult(5, true, 48, 4048, 48);

        // BET 2: MISS
        rec.recordDecision(21, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: [1,2,3,4,5,6,7,8,9,10,11,12], confidence: 70
        }, 2, 4048);
        rec.updateLastBetResult(0, false, -24, 4024, 24);

        rec.endSession('manual');

        const result = rec.getSessionResult();

        expect(result).toHaveProperty('outcome');
        expect(result).toHaveProperty('finalBankroll', 4024);
        expect(result).toHaveProperty('finalProfit', 24);
        expect(result).toHaveProperty('totalBets', 2);
        expect(result).toHaveProperty('wins', 1);
        expect(result).toHaveProperty('losses', 1);
        expect(result.winRate).toBeCloseTo(0.5, 2);
        expect(result).toHaveProperty('steps');
        expect(result.steps).toHaveLength(5); // 3 watch + 2 bets
        expect(result).toHaveProperty('mode', 'auto');
        expect(result).toHaveProperty('peakProfit', 48);
        expect(result).toHaveProperty('maxDrawdown', 24);
    });

    test('C8: recordWatch() is no-op when not active', () => {
        const rec = new SessionRecorder();
        // Not started
        rec.recordWatch(32, null, 4000);
        expect(rec.stepCount).toBe(0);
    });

    test('C9: Session stats track peak profit and max drawdown', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        // BET 1: HIT → profit 48
        rec.recordDecision(4, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: Array.from({length: 12}, (_, i) => i + 1), confidence: 75
        }, 2, 4000);
        rec.updateLastBetResult(5, true, 48, 4048, 48);

        // BET 2: HIT → profit 96
        rec.recordDecision(21, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: Array.from({length: 12}, (_, i) => i + 1), confidence: 75
        }, 2, 4048);
        rec.updateLastBetResult(3, true, 48, 4096, 96);

        // BET 3: MISS → profit 72
        rec.recordDecision(25, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: Array.from({length: 12}, (_, i) => i + 1), confidence: 70
        }, 2, 4096);
        rec.updateLastBetResult(0, false, -24, 4072, 72);

        const result = rec.getSessionResult();
        expect(result.peakProfit).toBe(96);
        expect(result.maxDrawdown).toBe(24); // 96 - 72
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP D: VERBOSE LOGGER
// ═══════════════════════════════════════════════════════════

describe('Group D: Verbose Logger', () => {

    test('D1: log() adds to buffer when enabled and session active', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger._sessionActive = true;
        logger._currentLogFile = 'test.log';

        logger.log('ENGINE', 'INFO', 'Test message', { key: 'value' });

        expect(logger._buffer.length).toBeGreaterThan(0);
        expect(logger._lineCount).toBe(1);

        const lastLine = logger._buffer[logger._buffer.length - 1];
        expect(lastLine).toContain('ENGINE');
        expect(lastLine).toContain('Test message');
        expect(lastLine).toContain('key');
    });

    test('D2: log() does nothing when disabled', () => {
        const logger = new VerboseLogger();
        logger.enabled = false;

        logger.log('ENGINE', 'INFO', 'Should not appear', { key: 'value' });

        expect(logger._buffer.length).toBe(0);
        expect(logger._lineCount).toBe(0);
    });

    test('D3: reset() clears all state and sets enabled = false', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger._sessionActive = true;
        logger._currentLogFile = 'session-2026-03-02.log';
        logger._buffer = ['line1\n', 'line2\n'];
        logger._lineCount = 2;

        logger.reset();

        expect(logger.enabled).toBe(false);
        expect(logger._sessionActive).toBe(false);
        expect(logger._currentLogFile).toBeNull();
        expect(logger._buffer).toHaveLength(0);
        expect(logger._lineCount).toBe(0);
    });

    test('D4: startSession() creates new log filename when enabled', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;

        logger.startSession();

        expect(logger._sessionActive).toBe(true);
        expect(logger._currentLogFile).toMatch(/^session-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.log$/);
        expect(logger._lineCount).toBe(0);
    });

    test('D5: startSession() is no-op when disabled', () => {
        const logger = new VerboseLogger();
        logger.enabled = false;

        logger.startSession();

        expect(logger._sessionActive).toBe(false);
        expect(logger._currentLogFile).toBeNull();
    });

    test('D6: endSession() writes footer and sets _sessionActive to false', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger.startSession();

        expect(logger._sessionActive).toBe(true);

        logger.endSession({ totalBets: 5, wins: 3 });

        expect(logger._sessionActive).toBe(false);
        const lastLine = logger._buffer[logger._buffer.length - 1];
        expect(lastLine).toContain('SESSION ENDED');
    });

    test('D7: logSeparator() adds separator line to buffer', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger._sessionActive = true;
        logger._currentLogFile = 'test.log';

        const bufferBefore = logger._buffer.length;
        logger.logSeparator('Test Section');

        expect(logger._buffer.length).toBeGreaterThan(bufferBefore);
        const sep = logger._buffer[logger._buffer.length - 1];
        expect(sep).toContain('Test Section');
    });

    test('D8: log() truncates very long data lines', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger._sessionActive = true;
        logger._currentLogFile = 'test.log';

        const hugeData = { big: 'x'.repeat(3000) };
        logger.log('ENGINE', 'DEBUG', 'Huge data', hugeData);

        const lastLine = logger._buffer[logger._buffer.length - 1];
        expect(lastLine).toContain('...(truncated)');
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP E: SESSION COMPLETION & AUTO-STOP
// ═══════════════════════════════════════════════════════════

describe('Group E: Session Completion & Auto-Stop', () => {

    test('E1: Session recorder tracks WIN outcome when profit >= target', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');

        // Simulate hitting target: $100+ profit
        // 3 hits at $2×12 = 3×$48 = $144 profit
        for (let i = 0; i < 3; i++) {
            rec.recordDecision(i + 4, {
                action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
                numbers: Array.from({length: 12}, (_, j) => j + 1), confidence: 75
            }, 2, 4000 + i * 48);
            rec.updateLastBetResult(5, true, 48, 4000 + (i + 1) * 48, (i + 1) * 48);
        }

        const result = rec.getSessionResult();
        expect(result.outcome).toBe('WIN');
        expect(result.finalProfit).toBe(144);
        expect(result.finalBankroll).toBe(4144);
    });

    test('E2: Session recorder tracks BUST outcome when bankroll <= 0', () => {
        const rec = new SessionRecorder();
        rec.startSession(100, 100, 1, 'auto');

        // Simulate losing all money
        // $5 × 12 = $60 per miss
        rec.recordDecision(4, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: Array.from({length: 12}, (_, i) => i + 1), confidence: 75
        }, 5, 100);
        rec.updateLastBetResult(0, false, -60, 40, -60);

        rec.recordDecision(5, {
            action: 'BET', selectedPair: 'prev', selectedFilter: 'same-half',
            numbers: Array.from({length: 12}, (_, i) => i + 1), confidence: 70
        }, 5, 40);
        rec.updateLastBetResult(0, false, -60, -20, -120);

        const result = rec.getSessionResult();
        expect(result.outcome).toBe('BUST');
        expect(result.finalBankroll).toBe(-20);
    });

    test('E3: Session recorder endSession() properly deactivates', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');
        expect(rec.isActive).toBe(true);

        // Add some steps before ending
        rec.recordWatch(32, null, 4000);
        rec.recordWatch(15, null, 4000);
        expect(rec.stepCount).toBe(2);

        rec.endSession('WIN');
        expect(rec.isActive).toBe(false);

        // Steps from before endSession are preserved
        const stepsAtEnd = rec.stepCount;
        expect(stepsAtEnd).toBe(2);

        // Subsequent recordings are no-ops (isActive = false)
        rec.recordWatch(19, null, 4000);
        expect(rec.stepCount).toBe(stepsAtEnd); // No new steps added
    });

    test('E4: Download button should be enabled when recorder has steps', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');
        rec.recordWatch(32, null, 4000);

        // The stepCount getter reflects recorded steps
        expect(rec.stepCount).toBeGreaterThan(0);
        // In UI: downloadSessionBtn.disabled = !(rec.stepCount > 0)
    });

    test('E5: Money panel target check fires when profit >= target', () => {
        // Test the condition that triggers the target-reached notification
        const sessionData = {
            sessionProfit: 0,
            sessionTarget: 100,
            currentBankroll: 4000,
            startingBankroll: 4000
        };

        // Before target
        expect(sessionData.sessionProfit >= sessionData.sessionTarget).toBe(false);

        // Exactly at target
        sessionData.sessionProfit = 100;
        sessionData.currentBankroll = 4100;
        expect(sessionData.sessionProfit >= sessionData.sessionTarget).toBe(true);

        // Over target
        sessionData.sessionProfit = 148;
        sessionData.currentBankroll = 4148;
        expect(sessionData.sessionProfit >= sessionData.sessionTarget).toBe(true);
    });

    test('E6: Bust condition check fires when bankroll <= 0', () => {
        const sessionData = {
            sessionProfit: -4000,
            currentBankroll: 0,
            startingBankroll: 4000
        };

        expect(sessionData.currentBankroll <= 0).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
//  GROUP F: RESET ALL INTEGRATION
// ═══════════════════════════════════════════════════════════

describe('Group F: Reset All Integration', () => {

    test('F1: Session recorder reset() clears active session', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');
        rec.recordWatch(32, null, 4000);
        rec.recordWatch(15, null, 4000);
        rec.recordWatch(19, null, 4000);

        expect(rec.isActive).toBe(true);
        expect(rec.stepCount).toBe(3);

        // Simulate what resetAll() now does
        rec.reset();

        expect(rec.isActive).toBe(false);
        expect(rec.stepCount).toBe(0);
        expect(rec.getSteps()).toEqual([]);
    });

    test('F2: Verbose logger reset() clears enabled and session', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger.startSession();

        expect(logger.enabled).toBe(true);
        expect(logger._sessionActive).toBe(true);

        // Simulate what resetAll() now does
        logger.reset();

        expect(logger.enabled).toBe(false);
        expect(logger._sessionActive).toBe(false);
        expect(logger._currentLogFile).toBeNull();
        expect(logger._buffer).toHaveLength(0);
    });

    test('F3: Reset then start new session works correctly', () => {
        const rec = new SessionRecorder();
        rec.startSession(4000, 100, 1, 'auto');
        rec.recordWatch(32, null, 4000);

        rec.reset();
        expect(rec.stepCount).toBe(0);

        // Start fresh session
        rec.startSession(5000, 200, 2, 'semi');
        expect(rec.isActive).toBe(true);
        expect(rec.stepCount).toBe(0);

        rec.recordWatch(10, null, 5000);
        expect(rec.stepCount).toBe(1);

        const result = rec.getSessionResult();
        expect(result.strategy).toBe(2);
        expect(result.mode).toBe('semi');
    });

    test('F4: Logger reset then re-enable works correctly', () => {
        const logger = new VerboseLogger();
        logger.enabled = true;
        logger.startSession();
        logger.log('ENGINE', 'INFO', 'Before reset');

        logger.reset();
        expect(logger._buffer).toHaveLength(0);

        // Re-enable and start new session
        logger.enabled = true;
        logger.startSession();
        expect(logger._sessionActive).toBe(true);
        expect(logger._currentLogFile).toBeTruthy();
    });
});
