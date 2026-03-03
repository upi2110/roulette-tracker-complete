#!/usr/bin/env node
/**
 * Compare S1-Start2 through BOTH paths:
 *   1. Test Runner path (_runSession → _simulateDecision with accumulating session state)
 *   2. Live Auto path (decide() with accumulating session state, mocked window.spins)
 *
 * Both paths get the same session-scoped spins that a user would enter.
 * Reports formatted like the Excel test report.
 */
const path = require('path');
const fs = require('fs');

// ── Load renderer functions ──
const { loadRendererFunctions } = require('./tests/test-setup');
const R = loadRendererFunctions();
global.calculatePositionCode = R.calculatePositionCode;
global.calculateReferences = R.calculateReferences;
global.DIGIT_13_OPPOSITES = R.DIGIT_13_OPPOSITES;
global.generateAnchors = R.generateAnchors;
global.expandAnchorsToBetNumbers = R.expandAnchorsToBetNumbers;
global._getPosCodeDistance = R._getPosCodeDistance;
if (R._computeFlashTargets) global._computeFlashTargets = R._computeFlashTargets;
if (R._computeT2FlashTargets) global._computeT2FlashTargets = R._computeT2FlashTargets;
if (R.calculateWheelAnchors) global.calculateWheelAnchors = R.calculateWheelAnchors;
if (R.getLookupRow) global.getLookupRow = R.getLookupRow;
if (R.expandTargetsToBetNumbers) global.expandTargetsToBetNumbers = R.expandTargetsToBetNumbers;
global.ZERO_TABLE_NUMS = R.ZERO_TABLE_NUMS || new Set([3,26,0,32,21,2,25,27,13,36,23,10,5,1,20,14,18,29,7]);
global.NINETEEN_TABLE_NUMS = R.NINETEEN_TABLE_NUMS || new Set([15,19,4,17,34,6,11,30,8,24,16,33,31,9,22,28,12,35]);
global.POSITIVE_NUMS = R.POSITIVE_NUMS || new Set([3,26,0,32,15,19,4,27,13,36,11,30,8,1,20,14,31,9,22]);
global.NEGATIVE_NUMS = R.NEGATIVE_NUMS || new Set([21,2,25,17,34,6,23,10,5,24,16,33,18,29,7,28,12,35]);
const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;')();

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

// ── Train engine ──
const dataLoader = new AIDataLoader();
const dataDir = path.join(__dirname, 'app', 'data');
const trainFiles = [];
for (let i = 1; i <= 16; i++) {
    const fpath = path.join(dataDir, `data${i}.txt`);
    if (fs.existsSync(fpath)) {
        trainFiles.push(dataLoader.parseTextContent(fs.readFileSync(fpath, 'utf-8'), `data${i}.txt`).spins);
    }
}

const testRaw = fs.readFileSync('/Users/ubusan-nb-ecr/Desktop/test_data2.txt', 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'test_data2.txt').spins;

// ── Config ──
const START_IDX = 2;  // S1-Start2
const STRATEGY = 1;   // Aggressive

console.log(`Trained on ${trainFiles.length} files, test: ${testSpins.length} spins`);
console.log(`\nSession-scoped spins for S1-Start2 (user enters from index ${START_IDX}):`);
const sessionData = testSpins.slice(START_IDX);
console.log(`  First 15: [${sessionData.slice(0, 15).join(', ')}]\n`);

// ═══════════════════════════════════════════════════
//  PATH 1: TEST RUNNER (using _runSession)
// ═══════════════════════════════════════════════════
function runTestRunnerPath(engine) {
    engine.resetSession();
    const savedRI = engine._retrainInterval;
    const savedRLS = engine._retrainLossStreak;
    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;

    const runner = new AutoTestRunner(engine);
    const result = runner._runSession(testSpins, START_IDX, STRATEGY);

    engine._retrainInterval = savedRI;
    engine._retrainLossStreak = savedRLS;
    return result;
}

// ═══════════════════════════════════════════════════
//  PATH 2: LIVE AUTO (using decide() directly)
// ═══════════════════════════════════════════════════
function runLiveAutoPath(engine) {
    engine.resetSession();
    const savedRI = engine._retrainInterval;
    const savedRLS = engine._retrainLossStreak;
    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;

    const MIN_BET = 2, MAX_BET = 10, LOSS_STREAK_RESET = 5, MAX_RESETS = 5;
    const STARTING_BANKROLL = 4000, TARGET_PROFIT = 100, MAX_SESSION_SPINS = 60;

    const steps = [];
    let bankroll = STARTING_BANKROLL;
    let profit = 0;
    let betPerNumber = MIN_BET;
    let totalBets = 0;
    let consecutiveLosses = 0;
    let resetCount = 0;
    let stepNum = 0;

    // Session-scoped spins (what the user enters in live Auto)
    const sessionSpins = [];

    for (let absIdx = START_IDX; absIdx < testSpins.length - 1; absIdx++) {
        sessionSpins.push(testSpins[absIdx]);
        stepNum++;

        // WATCH phase: first 3 spins (orchestrator returns early when spinCount < 4)
        if (sessionSpins.length < 4) {
            steps.push({
                step: stepNum,
                spinValue: testSpins[absIdx],
                nextValue: testSpins[absIdx + 1],
                action: 'WATCH',
                pair: null,
                filter: null,
                numbersCount: 0,
                confidence: 0,
                betPerNumber: betPerNumber,
                hit: false,
                pnl: 0,
                bankroll: bankroll
            });
            continue;
        }

        // Mock _getWindowSpins to return session-scoped spins
        // This is exactly what window.spins would contain in live Auto
        const spinsSnapshot = [...sessionSpins];
        engine._getWindowSpins = () => spinsSnapshot;

        const decision = engine.decide();

        if (decision.action === 'BET') {
            const nextActual = testSpins[absIdx + 1];
            const hit = decision.numbers.includes(nextActual);
            const numbersCount = decision.numbers.length;
            const betUsed = betPerNumber;
            const pnl = hit
                ? (36 - numbersCount) * betUsed
                : -numbersCount * betUsed;

            bankroll += pnl;
            profit += pnl;
            totalBets++;

            if (hit) {
                consecutiveLosses = 0;
            } else {
                consecutiveLosses++;
            }

            // Record result on engine — uses same 5-arg signature as test runner
            // recordResult(pairKey, filterKey, hit, actual, predictedNumbers)
            const pairRefKey = decision.selectedPair || 'unknown';
            engine.recordResult(pairRefKey, decision.selectedFilter || 'both_both', hit, nextActual, decision.numbers);

            steps.push({
                step: stepNum,
                spinValue: testSpins[absIdx],
                nextValue: nextActual,
                action: 'BET',
                pair: decision.selectedPair,
                filter: decision.selectedFilter,
                numbersCount: numbersCount,
                confidence: decision.confidence,
                betPerNumber: betUsed,
                hit: hit,
                pnl: pnl,
                bankroll: bankroll
            });

            // Strategy 1 (Aggressive) bet management: miss → +1, hit → -1
            if (hit) {
                betPerNumber = Math.max(MIN_BET, betPerNumber - 1);
            } else {
                betPerNumber = Math.min(betPerNumber + 1, MAX_BET);
            }

            // Loss streak reset
            if (consecutiveLosses >= LOSS_STREAK_RESET && resetCount < MAX_RESETS) {
                betPerNumber = MIN_BET;
                consecutiveLosses = 0;
                resetCount++;
            }

            // Session end
            if (profit >= TARGET_PROFIT || bankroll <= 0 || totalBets >= MAX_SESSION_SPINS) break;

        } else {
            // SKIP — orchestrator calls recordSkip()
            engine.recordSkip();
            steps.push({
                step: stepNum,
                spinValue: testSpins[absIdx],
                nextValue: testSpins[absIdx + 1],
                action: 'SKIP',
                pair: decision.selectedPair,
                filter: decision.selectedFilter,
                numbersCount: 0,
                confidence: decision.confidence,
                betPerNumber: betPerNumber,
                hit: false,
                pnl: 0,
                bankroll: bankroll
            });
        }
    }

    engine._retrainInterval = savedRI;
    engine._retrainLossStreak = savedRLS;

    return { steps, profit, bankroll, totalBets };
}

// ═══════════════════════════════════════════════════
//  DISPLAY HELPER
// ═══════════════════════════════════════════════════
function printTable(steps, label) {
    console.log(
        'Step'.padEnd(5) +
        'Spin#'.padEnd(7) +
        'Next#'.padEnd(7) +
        'Action'.padEnd(8) +
        'Pair'.padEnd(14) +
        'Filter'.padEnd(18) +
        'Nums'.padEnd(6) +
        'Conf%'.padEnd(7) +
        'Bet/N'.padEnd(7) +
        'Hit'.padEnd(5) +
        'P&L'.padEnd(9) +
        'Bankroll'
    );
    console.log('-'.repeat(100));

    let stepNum = 0;
    for (const s of steps) {
        stepNum++;
        const action = s.action;
        const isWatch = action === 'WATCH';
        const isSkip = action === 'SKIP';
        const isBet = action === 'BET';

        const spin = s.spinValue != null ? s.spinValue : (s.spinNumber != null ? s.spinNumber : '--');
        const next = s.nextValue != null ? s.nextValue : (s.nextNumber != null ? s.nextNumber : '--');
        const pair = isWatch ? 'Watching' : (s.pair || s.selectedPair || '--');
        const filter = isWatch ? '--' : (s.filter || s.selectedFilter || '--');
        const nums = isWatch ? '--' : (s.numbersCount || 0);
        const conf = isWatch ? '--' : (s.confidence != null ? s.confidence + '%' : '--');
        const betN = isWatch ? '--' : `$${s.betPerNumber || 0}`;
        const hit = (isWatch || isSkip) ? '--' : (s.hit ? 'YES' : 'NO');
        const pnl = (isWatch || isSkip) ? '--' : `$${s.pnl}`;
        const bankroll = `$${s.bankroll.toLocaleString()}`;

        console.log(
            String(stepNum).padEnd(5) +
            String(spin).padEnd(7) +
            String(next).padEnd(7) +
            action.padEnd(8) +
            String(pair).padEnd(14) +
            String(filter).padEnd(18) +
            String(nums).padEnd(6) +
            String(conf).padEnd(7) +
            String(betN).padEnd(7) +
            String(hit).padEnd(5) +
            String(pnl).padEnd(9) +
            bankroll
        );
    }
}

// ═══════════════════════════════════════════════════
//  RUN BOTH + DISPLAY
// ═══════════════════════════════════════════════════

// Suppress engine console.log noise during run
const origLog = console.log;
const silentLog = (...args) => {
    const msg = args[0] || '';
    if (typeof msg === 'string' && (msg.startsWith('[AI-LOG]') || msg.startsWith('[TEST-LOG]'))) return;
    origLog.apply(console, args);
};

// Create two separate engine instances with identical training
const engine1 = new AIAutoEngine();
engine1.train(trainFiles);
engine1.isEnabled = true;

const engine2 = new AIAutoEngine();
engine2.train(trainFiles);
engine2.isEnabled = true;

// Run test runner path
console.log = silentLog;
const testResult = runTestRunnerPath(engine1);
console.log = origLog;
const testSteps = testResult.steps;

console.log('='.repeat(110));
console.log('  PATH 1: TEST RUNNER (_simulateDecision)  —  S1-Start2');
console.log('='.repeat(110));
console.log(`Strategy 1 | Start: ${START_IDX} | Outcome: ${testResult.outcome} | Profit: $${testResult.finalProfit.toFixed(2)}\n`);
printTable(testSteps, 'TEST');

// Run live auto path
console.log = silentLog;
const liveResult = runLiveAutoPath(engine2);
console.log = origLog;
const liveSteps = liveResult.steps;

console.log('');
console.log('='.repeat(110));
console.log('  PATH 2: LIVE AUTO (decide())  —  S1-Start2');
console.log('='.repeat(110));
console.log(`Strategy 1 | Start: ${START_IDX} | Profit: $${liveResult.profit.toFixed(2)}\n`);
printTable(liveSteps, 'LIVE');

// ═══════════════════════════════════════════════════
//  DIFF ANALYSIS
// ═══════════════════════════════════════════════════
console.log('');
console.log('='.repeat(110));
console.log('  STEP-BY-STEP DIFF');
console.log('='.repeat(110));

let diffs = 0;
const maxSteps = Math.max(testSteps.length, liveSteps.length);
for (let i = 0; i < maxSteps; i++) {
    const t = testSteps[i];
    const l = liveSteps[i];

    if (!t && l) {
        console.log(`Step ${i + 1}: TEST ended, LIVE has ${l.action}`);
        diffs++;
        continue;
    }
    if (t && !l) {
        console.log(`Step ${i + 1}: LIVE ended, TEST has ${t.action}`);
        diffs++;
        continue;
    }

    const tAction = t.action;
    const lAction = l.action;

    if (tAction !== lAction) {
        console.log(`Step ${i + 1}: ❌ ACTION DIFF — TEST=${tAction} vs LIVE=${lAction}`);
        if (tAction === 'BET') console.log(`  TEST: pair=${t.selectedPair}, filter=${t.selectedFilter}, nums=${t.numbersCount}, conf=${t.confidence}%`);
        if (lAction === 'BET') console.log(`  LIVE: pair=${l.pair}, filter=${l.filter}, nums=${l.numbersCount}, conf=${l.confidence}%`);
        if (tAction === 'SKIP') console.log(`  TEST: conf=${t.confidence}%`);
        if (lAction === 'SKIP') console.log(`  LIVE: conf=${l.confidence}%`);
        diffs++;
    } else if (tAction === 'BET') {
        const tPair = t.selectedPair || '';
        const lPair = l.pair || '';
        const tFilter = t.selectedFilter || '';
        const lFilter = l.filter || '';
        const tNums = t.numbersCount || 0;
        const lNums = l.numbersCount || 0;
        const tConf = t.confidence || 0;
        const lConf = l.confidence || 0;
        if (tPair !== lPair || tFilter !== lFilter || tNums !== lNums || tConf !== lConf) {
            console.log(`Step ${i + 1}: ⚠️  BET DETAILS DIFFER`);
            console.log(`  TEST: pair=${tPair}, filter=${tFilter}, nums=${tNums}, conf=${tConf}%`);
            console.log(`  LIVE: pair=${lPair}, filter=${lFilter}, nums=${lNums}, conf=${lConf}%`);
            diffs++;
        } else {
            console.log(`Step ${i + 1}: ✅ MATCH — BET ${tPair} ${tFilter} ${tNums}nums ${tConf}%`);
        }
    } else {
        console.log(`Step ${i + 1}: ✅ MATCH — ${tAction}`);
    }
}

console.log('');
if (diffs === 0) {
    console.log('✅ PERFECT MATCH: Both paths produce identical results!');
} else {
    console.log(`❌ ${diffs} DIFFERENCES found between Test Runner and Live Auto paths`);
}
