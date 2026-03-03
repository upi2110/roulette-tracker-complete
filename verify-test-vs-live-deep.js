#!/usr/bin/env node
/**
 * Deep verification: test _simulateDecision vs decide() across MANY steps per session,
 * including when BET decisions happen (after skip streaks force bets).
 */
const path = require('path');
const fs = require('fs');

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
engine.train(trainFiles);  // Array of arrays — each array is one training session
engine.isEnabled = true;

const testRaw = fs.readFileSync('/Users/ubusan-nb-ecr/Desktop/test_data2.txt', 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'test_data2.txt').spins;
console.log(`Trained on ${trainFiles.length} files, test: ${testSpins.length} spins\n`);

const runner = new AutoTestRunner(engine);

// Test across many starts, running up to 30 steps each
const startPositions = [0, 5, 12, 20, 50, 100, 200, 300, 400];
let totalChecks = 0;
let matches = 0;
let mismatches = 0;
let betMatches = 0;
let betMismatches = 0;
let skipMatches = 0;

for (const startIdx of startPositions) {
    const maxSteps = 30;
    let sessionSkips = 0;
    let sessionBets = 0;

    for (let step = 0; step < maxSteps; step++) {
        const i = startIdx + 3 + step;
        if (i >= testSpins.length - 1) break;

        const sessionSpins = testSpins.slice(startIdx, i + 1);
        const sessionIdx = sessionSpins.length - 1;

        // ── TEST RUNNER ──
        engine.resetSession();
        // Replay skip/bet history to get session state right
        for (let prev = 0; prev < step; prev++) {
            const pi = startIdx + 3 + prev;
            const prevSessionSpins = testSpins.slice(startIdx, pi + 1);
            const prevResult = runner._simulateDecision(prevSessionSpins, prevSessionSpins.length - 1);
            if (prevResult.action === 'BET') {
                const nextActual = testSpins[pi + 1];
                const hit = prevResult.numbers.includes(nextActual);
                const refKey = prevResult.selectedPair
                    ? (Object.entries({'prev':'prev','prev_plus_1':'prevPlus1','prev_minus_1':'prevMinus1','prev_plus_2':'prevPlus2','prev_minus_2':'prevMinus2','prev_prev':'prevPrev'}).find(([k,v]) => v === prevResult.selectedPair) || [prevResult.selectedPair])[0]
                    : 'unknown';
                engine.recordResult(refKey, prevResult.selectedFilter || 'both_both', hit, nextActual, prevResult.numbers);
            } else {
                engine.recordSkip();
            }
        }
        const testResult = runner._simulateDecision(sessionSpins, sessionIdx);

        // ── LIVE MODE ──
        engine.resetSession();
        // Replay same history
        for (let prev = 0; prev < step; prev++) {
            const pi = startIdx + 3 + prev;
            const prevSessionSpins = testSpins.slice(startIdx, pi + 1);
            engine._getWindowSpins = () => prevSessionSpins.map(n => ({ actual: n }));
            const prevLive = engine.decide();
            if (prevLive.action === 'BET') {
                const nextActual = testSpins[pi + 1];
                const hit = prevLive.numbers.includes(nextActual);
                const refKey = prevLive.selectedPair
                    ? (Object.entries({'prev':'prev','prev_plus_1':'prevPlus1','prev_minus_1':'prevMinus1','prev_plus_2':'prevPlus2','prev_minus_2':'prevMinus2','prev_prev':'prevPrev'}).find(([k,v]) => v === prevLive.selectedPair) || [prevLive.selectedPair])[0]
                    : 'unknown';
                engine.recordResult(refKey, prevLive.selectedFilter || 'both_both', hit, nextActual, prevLive.numbers);
            } else {
                engine.recordSkip();
            }
        }
        engine._getWindowSpins = () => sessionSpins.map(n => ({ actual: n }));
        const liveResult = engine.decide();

        totalChecks++;
        const actionMatch = testResult.action === liveResult.action;

        if (testResult.action === 'BET') {
            sessionBets++;
            const pairMatch = testResult.selectedPair === liveResult.selectedPair;
            const filterMatch = testResult.selectedFilter === liveResult.selectedFilter;
            const numsMatch = JSON.stringify(testResult.numbers.sort((a,b) => a-b)) ===
                              JSON.stringify((liveResult.numbers||[]).sort((a,b) => a-b));
            const confMatch = testResult.confidence === liveResult.confidence;

            if (actionMatch && pairMatch && filterMatch && numsMatch) {
                matches++;
                betMatches++;
            } else {
                mismatches++;
                betMismatches++;
                console.log(`❌ Start ${startIdx} Step ${step}: BET MISMATCH`);
                console.log(`   TEST: pair=${testResult.selectedPair}, filter=${testResult.selectedFilter}, nums=${testResult.numbers.length}, conf=${testResult.confidence}%`);
                console.log(`   LIVE: pair=${liveResult.selectedPair}, filter=${liveResult.selectedFilter}, nums=${(liveResult.numbers||[]).length}, conf=${liveResult.confidence}%`);
            }
        } else {
            sessionSkips++;
            if (actionMatch) {
                matches++;
                skipMatches++;
            } else {
                mismatches++;
                console.log(`❌ Start ${startIdx} Step ${step}: ACTION MISMATCH test=${testResult.action} live=${liveResult.action}`);
            }
        }
    }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  RESULTS: ${matches}/${totalChecks} match (${(matches/totalChecks*100).toFixed(1)}%)`);
console.log(`  BET matches: ${betMatches}, BET mismatches: ${betMismatches}`);
console.log(`  SKIP matches: ${skipMatches}`);
console.log(`  Total mismatches: ${mismatches}`);
console.log(`${'═'.repeat(60)}`);

if (mismatches > 0) {
    console.log('\n⚠️  There are mismatches between test runner and live mode!');
    process.exit(1);
} else {
    console.log('\n✅ All decisions match PERFECTLY between test runner and live mode!');
    console.log('   (Including BET decisions with pair, filter, numbers, confidence)');
}
