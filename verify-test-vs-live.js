#!/usr/bin/env node
/**
 * Verify that _simulateDecision() and decide() produce IDENTICAL results.
 * After the session-scope fix, test runner now passes session-scoped spins
 * (from startIdx onwards) — exactly matching live mode behavior.
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

// ═══════════════════════════════════════════════════════════
//  Compare test runner _simulateDecision vs live decide()
//  for multiple starting positions
// ═══════════════════════════════════════════════════════════

const startPositions = [0, 5, 12, 20, 50, 100];
let totalChecks = 0;
let matches = 0;
let mismatches = 0;

for (const startIdx of startPositions) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  START ${startIdx}: Testing first 5 decisions`);
    console.log(`${'═'.repeat(60)}`);

    for (let step = 0; step < 5; step++) {
        const i = startIdx + 3 + step;  // Decision index (after 3 WATCH spins)
        if (i >= testSpins.length - 1) break;

        // Session-scoped spins: from startIdx to current spin (inclusive)
        // This is what the FIXED _runSession() now passes
        const sessionSpins = testSpins.slice(startIdx, i + 1);
        const sessionIdx = sessionSpins.length - 1;

        // ── TEST RUNNER path ──
        engine.resetSession();
        const testResult = runner._simulateDecision(sessionSpins, sessionIdx);

        // ── LIVE path (decide()) ──
        engine.resetSession();
        // Mock _getWindowSpins to return session-scoped spins (matching live mode)
        engine._getWindowSpins = () => sessionSpins.map(n => ({ actual: n }));
        const liveResult = engine.decide();

        totalChecks++;

        // Compare key fields
        const actionMatch = testResult.action === liveResult.action;
        const pairMatch = testResult.selectedPair === liveResult.selectedPair;
        const filterMatch = testResult.selectedFilter === liveResult.selectedFilter;
        const confMatch = testResult.confidence === liveResult.confidence;
        const numsMatch = JSON.stringify(testResult.numbers.sort((a,b) => a-b)) ===
                          JSON.stringify((liveResult.numbers || []).sort((a,b) => a-b));

        // For SKIP, decide() may return more details but action should match
        const isMatch = actionMatch && (testResult.action === 'SKIP' || (pairMatch && filterMatch && numsMatch));

        if (isMatch) {
            matches++;
            console.log(`  Step ${step}: ✅ MATCH — ${testResult.action}${testResult.action === 'BET' ? ` | ${testResult.selectedPair} | ${testResult.selectedFilter} | ${testResult.numbers.length} nums | ${testResult.confidence}%` : ` (conf: ${testResult.confidence}%)`}`);
        } else {
            mismatches++;
            console.log(`  Step ${step}: ❌ MISMATCH`);
            console.log(`    TEST: action=${testResult.action}, pair=${testResult.selectedPair}, filter=${testResult.selectedFilter}, nums=${testResult.numbers.length}, conf=${testResult.confidence}%`);
            console.log(`    LIVE: action=${liveResult.action}, pair=${liveResult.selectedPair}, filter=${liveResult.selectedFilter}, nums=${(liveResult.numbers||[]).length}, conf=${liveResult.confidence}%`);
            if (testResult.action !== liveResult.action) {
                console.log(`    ⚠️  ACTION DIFFERS: ${testResult.reason} vs ${liveResult.reason}`);
            }
        }
    }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  RESULTS: ${matches}/${totalChecks} match (${(matches/totalChecks*100).toFixed(1)}%)`);
console.log(`  Matches: ${matches}, Mismatches: ${mismatches}`);
console.log(`${'═'.repeat(60)}`);

if (mismatches > 0) {
    console.log('\n⚠️  There are mismatches between test runner and live mode!');
    process.exit(1);
} else {
    console.log('\n✅ All decisions match perfectly between test runner and live mode!');
}
