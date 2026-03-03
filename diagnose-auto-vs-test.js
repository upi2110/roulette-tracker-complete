#!/usr/bin/env node
/**
 * Diagnose Auto (live) vs Test Runner decision differences.
 *
 * KEY DIFFERENCE being tested:
 *   TEST RUNNER: _simulateDecision(sessionSpins, sessionSpins.length-1)
 *     where sessionSpins = testSpins.slice(startIdx, i+1) -- session-scoped
 *   LIVE AUTO: decide() reads _getWindowSpins() which returns ALL spins from index 0
 *     so we mock _getWindowSpins to return testSpins.slice(0, i+1) -- global-scoped
 *
 * For the first 15 starting positions (startIdx 0..14), Strategy 1,
 * shows the first 10 decision steps side-by-side and marks mismatches.
 */
const path = require('path');
const fs = require('fs');

// ── Load renderer functions (same as verify-test-vs-live.js) ──
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

// ── Suppress engine console.log noise ──
const originalLog = console.log;
let suppressLogs = false;
console.log = (...args) => {
    if (suppressLogs) return;
    originalLog(...args);
};

// ── Train engine on data1-16 ──
const dataLoader = new AIDataLoader();
const dataDir = path.join(__dirname, 'app', 'data');
const trainFiles = [];
for (let i = 1; i <= 16; i++) {
    const fpath = path.join(dataDir, `data${i}.txt`);
    if (fs.existsSync(fpath)) {
        trainFiles.push(dataLoader.parseTextContent(fs.readFileSync(fpath, 'utf-8'), `data${i}.txt`).spins);
    }
}

const engine = new AIAutoEngine();
engine.train(trainFiles);
engine.isEnabled = true;

// Disable retrain during testing
engine._retrainInterval = Infinity;
engine._retrainLossStreak = Infinity;

// ── Load test data ──
const testRaw = fs.readFileSync('/Users/ubusan-nb-ecr/Desktop/test_data2.txt', 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'test_data2.txt').spins;
originalLog(`Trained on ${trainFiles.length} files, test: ${testSpins.length} spins\n`);

const runner = new AutoTestRunner(engine);

// ═══════════════════════════════════════════════════════════
//  DIAGNOSTIC: Compare session-scoped (test) vs global-scoped (live)
// ═══════════════════════════════════════════════════════════

const SESSIONS_TO_CHECK = 15;  // startIdx 0..14
const STEPS_TO_SHOW = 10;
const STRATEGY = 1;

let sessionsWithMismatch = 0;

// Pair refKey → display name (from test runner)
const REFKEY_TO_PAIR = {
    'prev': 'prev',
    'prev_plus_1': 'prevPlus1',
    'prev_minus_1': 'prevMinus1',
    'prev_plus_2': 'prevPlus2',
    'prev_minus_2': 'prevMinus2',
    'prev_prev': 'prevPrev'
};

for (let startIdx = 0; startIdx < SESSIONS_TO_CHECK; startIdx++) {
    originalLog(`\n${'='.repeat(120)}`);
    originalLog(`  SESSION ${startIdx} (startIdx=${startIdx}) | Strategy ${STRATEGY} | First ${STEPS_TO_SHOW} decision steps`);
    originalLog(`${'='.repeat(120)}`);

    // Column headers
    originalLog(
        padR('Step', 5) +
        padR('Spin', 5) +
        padR('Next', 5) +
        ' | ' +
        padR('T-Action', 9) +
        padR('T-Pair', 12) +
        padR('T-Filter', 16) +
        padR('T-#Nums', 8) +
        padR('T-Conf', 7) +
        ' | ' +
        padR('L-Action', 9) +
        padR('L-Pair', 12) +
        padR('L-Filter', 16) +
        padR('L-#Nums', 8) +
        padR('L-Conf', 7) +
        ' | Match'
    );
    originalLog('-'.repeat(120));

    let sessionHasMismatch = false;
    let stepsShown = 0;

    for (let step = 0; step < STEPS_TO_SHOW; step++) {
        const i = startIdx + 3 + step;  // Decision index (after 3 WATCH spins)
        if (i >= testSpins.length - 1) break;

        const spinValue = testSpins[i];
        const nextValue = testSpins[i + 1];

        // ── TEST RUNNER PATH ──
        // Session-scoped: only spins from startIdx onwards
        const sessionSpins = testSpins.slice(startIdx, i + 1);
        const sessionIdx = sessionSpins.length - 1;

        engine.resetSession();
        suppressLogs = true;
        const testResult = runner._simulateDecision(sessionSpins, sessionIdx);
        suppressLogs = false;

        // ── LIVE AUTO PATH ──
        // Global-scoped: ALL spins from index 0
        engine.resetSession();
        suppressLogs = true;
        engine._getWindowSpins = () => testSpins.slice(0, i + 1).map(n => ({ actual: n }));
        const liveResult = engine.decide();
        suppressLogs = false;

        // ── Compare ──
        const actionMatch = testResult.action === liveResult.action;
        const pairMatch = (testResult.selectedPair || '') === (liveResult.selectedPair || '');
        const filterMatch = (testResult.selectedFilter || '') === (liveResult.selectedFilter || '');
        const testNums = (testResult.numbers || []).slice().sort((a, b) => a - b);
        const liveNums = (liveResult.numbers || []).slice().sort((a, b) => a - b);
        const numsMatch = JSON.stringify(testNums) === JSON.stringify(liveNums);
        const confMatch = testResult.confidence === liveResult.confidence;

        const isFullMatch = actionMatch && pairMatch && filterMatch && numsMatch && confMatch;

        if (!isFullMatch) sessionHasMismatch = true;

        const marker = isFullMatch ? '  OK' : '  \u274C';

        // Build detail strings
        const tNumsCount = testNums.length;
        const lNumsCount = liveNums.length;

        let line =
            padR(`${step}`, 5) +
            padR(`${spinValue}`, 5) +
            padR(`${nextValue}`, 5) +
            ' | ' +
            padR(testResult.action, 9) +
            padR(testResult.selectedPair || '-', 12) +
            padR(testResult.selectedFilter || '-', 16) +
            padR(`${tNumsCount}`, 8) +
            padR(`${testResult.confidence}%`, 7) +
            ' | ' +
            padR(liveResult.action, 9) +
            padR(liveResult.selectedPair || '-', 12) +
            padR(liveResult.selectedFilter || '-', 16) +
            padR(`${lNumsCount}`, 8) +
            padR(`${liveResult.confidence}%`, 7) +
            ' |' + marker;

        originalLog(line);

        // If mismatch, show details on next line
        if (!isFullMatch) {
            const diffs = [];
            if (!actionMatch) diffs.push(`action: ${testResult.action} vs ${liveResult.action}`);
            if (!pairMatch) diffs.push(`pair: ${testResult.selectedPair} vs ${liveResult.selectedPair}`);
            if (!filterMatch) diffs.push(`filter: ${testResult.selectedFilter} vs ${liveResult.selectedFilter}`);
            if (!numsMatch) {
                // Find numbers that differ
                const testSet = new Set(testNums);
                const liveSet = new Set(liveNums);
                const onlyInTest = testNums.filter(n => !liveSet.has(n));
                const onlyInLive = liveNums.filter(n => !testSet.has(n));
                diffs.push(`nums: test-only=[${onlyInTest.join(',')}] live-only=[${onlyInLive.join(',')}]`);
            }
            if (!confMatch) diffs.push(`conf: ${testResult.confidence}% vs ${liveResult.confidence}%`);
            originalLog(`      \u274C DIFF: ${diffs.join(' | ')}`);

            // Show spin context difference
            const testSpinCount = sessionSpins.length;
            const liveSpinCount = i + 1;
            if (testSpinCount !== liveSpinCount) {
                originalLog(`      SpinContext: test=${testSpinCount} spins (from idx ${startIdx}), live=${liveSpinCount} spins (from idx 0)`);
            }
        }

        stepsShown++;
    }

    if (sessionHasMismatch) {
        sessionsWithMismatch++;
        originalLog(`  >>> SESSION ${startIdx}: HAS MISMATCHES`);
    } else {
        originalLog(`  >>> SESSION ${startIdx}: All ${stepsShown} steps match`);
    }
}

// ═══════════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════════
originalLog(`\n${'='.repeat(120)}`);
originalLog(`  SUMMARY: ${sessionsWithMismatch} / ${SESSIONS_TO_CHECK} sessions have at least one mismatch in first ${STEPS_TO_SHOW} steps`);
originalLog(`  (Test runner uses session-scoped spins from startIdx; Live auto uses ALL spins from index 0)`);
originalLog(`${'='.repeat(120)}`);

if (sessionsWithMismatch > 0) {
    originalLog(`\n  WARNING: ${sessionsWithMismatch} session(s) produce different results between test runner and live auto mode.`);
    originalLog(`  This means the test runner's backtest results do NOT accurately predict live behavior.`);
} else {
    originalLog(`\n  All sessions match. Test runner and live auto produce identical decisions.`);
}

// ── Helper ──
function padR(str, len) {
    str = String(str);
    return str.length >= len ? str : str + ' '.repeat(len - str.length);
}
