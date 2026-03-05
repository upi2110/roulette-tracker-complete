#!/usr/bin/env node
/**
 * COMPARE-PREDICTIONS — Verify Auto mode decide() and Test mode _simulateDecision()
 * produce IDENTICAL predictions for every spin in test_data2.txt
 *
 * This script trains the engine once, then for each spin index:
 *   1. Calls runner._simulateDecision(testSpins, idx) [Test mode path]
 *   2. Sets window.spins = matching data, calls engine.decide() [Auto mode path]
 *   3. Compares action, selectedPair, selectedFilter, numbers
 *   4. Reports mismatches — expect 0
 */

const fs = require('fs');
const path = require('path');

// Bootstrap JSDOM
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;

const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
eval(lookupSrc);
if (typeof getLookupRow === 'function') globalThis.getLookupRow = getLookupRow;
if (typeof LOOKUP_TABLE === 'object') globalThis.LOOKUP_TABLE = LOOKUP_TABLE;

const { setupDOM } = require('./tests/test-setup');
setupDOM();

const rendererSrc = fs.readFileSync(path.join(__dirname, 'app', 'renderer-3tables.js'), 'utf-8');
const rendererWrapper = new Function('window', 'document', 'alert', 'confirm', 'fetch', 'getLookupRow', 'LOOKUP_TABLE', `
    ${rendererSrc}
    window.calculateReferences = calculateReferences;
    window.calculatePositionCode = calculatePositionCode;
    window.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
    window.REGULAR_OPPOSITES = REGULAR_OPPOSITES;
    window.generateAnchors = generateAnchors;
    window.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
    window.expandTargetsToBetNumbers = typeof expandTargetsToBetNumbers !== 'undefined' ? expandTargetsToBetNumbers : undefined;
    window.calculateWheelAnchors = typeof calculateWheelAnchors !== 'undefined' ? calculateWheelAnchors : undefined;
    window.WHEEL_STANDARD = WHEEL_STANDARD;
    window.WHEEL_NO_ZERO = WHEEL_NO_ZERO;
    window.getNumberAtPosition = getNumberAtPosition;
    window.flipPositionCode = flipPositionCode;
    window.calculateWheelDistance = calculateWheelDistance;
    window._getPosCodeDistance = _getPosCodeDistance;
    window._computeT2FlashTargets = typeof _computeT2FlashTargets !== 'undefined' ? _computeT2FlashTargets : undefined;
    window._computeT1FlashTargets = typeof _computeT1FlashTargets !== 'undefined' ? _computeT1FlashTargets : undefined;
    window._computeAnchorFlashTargets = typeof _computeAnchorFlashTargets !== 'undefined' ? _computeAnchorFlashTargets : undefined;
    window._PAIR_REFKEY_TO_DATA_PAIR = typeof _PAIR_REFKEY_TO_DATA_PAIR !== 'undefined' ? _PAIR_REFKEY_TO_DATA_PAIR : undefined;
    window.getLookupRow = getLookupRow;
`);
rendererWrapper(global.window, global.document, () => {}, () => true, () => Promise.resolve({ json: () => ({}) }), getLookupRow, typeof LOOKUP_TABLE !== 'undefined' ? LOOKUP_TABLE : {});

// Suppress engine/runner training output
const origLog = console.log;
let suppress = false;
console.log = (...args) => { if (!suppress) origLog(...args); };

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

// Load training data
const dataDir = path.join(__dirname, 'app', 'data');
const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
const dataLoader = new AIDataLoader();
const trainingFiles = dataFiles.map(f => ({
    filename: f,
    content: fs.readFileSync(path.join(dataDir, f), 'utf-8')
}));
const loadResult = dataLoader.loadMultiple(trainingFiles);
const trainingSessions = loadResult.sessions.map(s => s.spins);

// Load test data
const testRaw = fs.readFileSync('/Users/ubusan-nb-ecr/Desktop/test_data2.txt', 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'test_data2.txt').spins;

origLog(`Training data: ${trainingSessions.length} sessions, ${trainingSessions.reduce((a, s) => a + s.length, 0)} spins`);
origLog(`Test data: ${testSpins.length} spins`);

async function comparePredictions() {
    // Train engine
    const engine = new AIAutoEngine();
    suppress = true;
    engine.train(trainingSessions);
    suppress = false;

    // Enable engine and disable retraining during comparison
    engine.isEnabled = true;
    // Use REAL threshold (65) to test exactly what the live app does
    // engine.confidenceThreshold defaults to 65 — don't override
    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;

    const runner = new AutoTestRunner(engine);

    let totalChecked = 0;
    let totalMatches = 0;
    let totalMismatches = 0;
    let totalSkipBoth = 0;
    let totalBetBoth = 0;
    const mismatches = [];

    for (let idx = 3; idx < testSpins.length - 1; idx++) {
        // ── Test mode: _simulateDecision ──
        suppress = true;
        const testResult = runner._simulateDecision(testSpins, idx);
        suppress = false;

        // ── Auto mode: decide() ──
        // Set up window.spins as the DOM would have it
        const spinObjs = testSpins.slice(0, idx + 1).map(n => ({ actual: n }));
        engine._getWindowSpins = () => spinObjs;

        // Reset consecutive skips to 0 so forced-bet logic doesn't interfere
        engine.session.consecutiveSkips = 0;

        suppress = true;
        const autoResult = engine.decide();
        suppress = false;

        totalChecked++;

        // Compare
        let mismatch = false;
        const diffs = [];

        if (testResult.action !== autoResult.action) {
            diffs.push(`action: Test=${testResult.action} Auto=${autoResult.action}`);
            mismatch = true;
        }

        if (testResult.action === 'BET' && autoResult.action === 'BET') {
            totalBetBoth++;

            if (testResult.selectedPair !== autoResult.selectedPair) {
                diffs.push(`selectedPair: Test=${testResult.selectedPair} Auto=${autoResult.selectedPair}`);
                mismatch = true;
            }

            if (testResult.selectedFilter !== autoResult.selectedFilter) {
                diffs.push(`selectedFilter: Test=${testResult.selectedFilter} Auto=${autoResult.selectedFilter}`);
                mismatch = true;
            }

            // Compare numbers (sorted)
            const testNums = [...testResult.numbers].sort((a, b) => a - b);
            const autoNums = [...autoResult.numbers].sort((a, b) => a - b);
            if (testNums.length !== autoNums.length || !testNums.every((n, i) => n === autoNums[i])) {
                diffs.push(`numbers: Test=[${testNums.length}] Auto=[${autoNums.length}]`);
                mismatch = true;
            }

            if (testResult.confidence !== autoResult.confidence) {
                diffs.push(`confidence: Test=${testResult.confidence} Auto=${autoResult.confidence}`);
                mismatch = true;
            }
        }

        if (testResult.action === 'SKIP' && autoResult.action === 'SKIP') {
            totalSkipBoth++;
        }

        if (mismatch) {
            totalMismatches++;
            mismatches.push({ idx, spin: testSpins[idx], diffs, testAction: testResult.action, autoAction: autoResult.action });
        } else {
            totalMatches++;
        }
    }

    // Report
    origLog('\n═══════════════════════════════════════════════════════');
    origLog('  AUTO vs TEST MODE PREDICTION COMPARISON');
    origLog('═══════════════════════════════════════════════════════');
    origLog(`  Spins checked:     ${totalChecked}`);
    origLog(`  Perfect matches:   ${totalMatches}`);
    origLog(`  Mismatches:        ${totalMismatches}`);
    origLog(`  Both BET:          ${totalBetBoth}`);
    origLog(`  Both SKIP:         ${totalSkipBoth}`);

    if (mismatches.length > 0) {
        origLog(`\n  ❌ ${mismatches.length} MISMATCHES FOUND:`);
        for (const m of mismatches.slice(0, 10)) {
            origLog(`    idx=${m.idx} spin=${m.spin}: ${m.diffs.join(', ')}`);
        }
        if (mismatches.length > 10) {
            origLog(`    ... and ${mismatches.length - 10} more`);
        }
    } else {
        origLog('\n  ✅ ZERO MISMATCHES — Auto and Test modes produce identical predictions');
        origLog('  ✅ decide() and _simulateDecision() are fully unified');
    }
}

comparePredictions().catch(e => origLog('Error: ' + e.message + '\n' + e.stack));
