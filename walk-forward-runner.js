#!/usr/bin/env node
/**
 * Walk-Forward Evaluation Harness — Precision-First Engine v2 Baseline
 *
 * Runs the CURRENT engine (unchanged, warts and all) through all training data
 * spin-by-spin, recording every decision with full diagnostics.
 *
 * Outputs:
 *   - walk-forward-baseline.jsonl (one DecisionRecord per line)
 *   - Console summary with metrics segmented by K bins, includes26, phase
 *   - Pair overlap matrix
 *
 * Design notes:
 *   - We reset session-only state per file to avoid cross-session streak contamination
 *   - We do NOT reset learned models (baseline uses full training, best-case in-sample)
 *   - Each file is processed independently (no cross-file position code contamination)
 *   - Flat $2 stake, no Martingale — measures prediction quality, not money management
 *   - Engine trained on ALL data — in-sample baseline for comparison
 *
 * Usage: node walk-forward-runner.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ═══════════════════════════════════════════════════════════
//  JSDOM BOOTSTRAP (same as benchmark-proper.js)
// ═══════════════════════════════════════════════════════════

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
global.HTMLElement = dom.window.HTMLElement;

// Load table-lookup.js (use vm.runInThisContext so vars leak into global scope even in strict mode)
const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
vm.runInThisContext(lookupSrc);
if (typeof getLookupRow === 'function') globalThis.getLookupRow = getLookupRow;
if (typeof LOOKUP_TABLE === 'object') globalThis.LOOKUP_TABLE = LOOKUP_TABLE;

// Setup DOM and load renderer
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
rendererWrapper(global.window, global.document, () => {}, () => true, () => Promise.resolve({ json: () => ({}) }),
    getLookupRow, typeof LOOKUP_TABLE !== 'undefined' ? LOOKUP_TABLE : {});

// Suppress console.log from engine/runner during processing
const origLog = console.log;
let suppressLog = false;
console.log = (...args) => { if (!suppressLog) origLog(...args); };

// ═══════════════════════════════════════════════════════════
//  LOAD MODULES
// ═══════════════════════════════════════════════════════════

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');
const { DecisionLogger, canonicalPocket, canonicalSet, computeBaseline, physicalSet } = require('./app/decision-logger');

// ═══════════════════════════════════════════════════════════
//  LOAD DATA
// ═══════════════════════════════════════════════════════════

// ── ENV-based configuration ──
const stepName = process.env.WF_STEP || 'baseline';
const customDataFile = process.env.WF_DATA || null;

const dataDir = path.join(__dirname, 'app', 'data');
const dataLoader = new AIDataLoader();

// Load evaluation data (custom file or all training files)
let dataFiles, sessions, evalDataDesc;
if (customDataFile) {
    // Out-of-sample: single custom file
    const filename = path.basename(customDataFile);
    const content = fs.readFileSync(customDataFile, 'utf-8');
    const parsed = dataLoader.parseTextContent(content, filename);
    sessions = [{ filename, spins: parsed.spins, length: parsed.spins.length }];
    dataFiles = [filename];
    evalDataDesc = `Custom: ${filename} (${parsed.spins.length} spins)`;
} else {
    // In-sample: all training data files
    dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
    const trainingFiles = dataFiles.map(f => ({
        filename: f,
        content: fs.readFileSync(path.join(dataDir, f), 'utf-8')
    }));
    const loadResult = dataLoader.loadMultiple(trainingFiles);
    sessions = loadResult.sessions;
    evalDataDesc = `${dataFiles.length} files, ${loadResult.totalSpins} total spins`;
}

origLog(`\n═══ WALK-FORWARD RUNNER [${stepName}] ═══`);
origLog(`Data: ${evalDataDesc}`);
origLog(`Files: ${dataFiles.join(', ')}\n`);

// ═══════════════════════════════════════════════════════════
//  SESSION BOUNDARY (shared between walk-forward and future live mode)
// ═══════════════════════════════════════════════════════════

/**
 * Reset session-only state at a boundary (file change, user action, idle gap).
 * This function must be called identically in walk-forward and live mode.
 *
 * Resets: session tracker (loss streaks, adaptation weight, trend state,
 *         blacklist, shadow state), liveSpins, lastDecision
 * Persists: pairModels, filterModels, pairBayesian, sequenceModel
 *
 * @param {AIAutoEngine} engine
 * @param {string} reason - 'file_boundary:filename' | 'user' | 'idle_gap'
 */
function sessionBoundary(engine, reason) {
    engine.resetSession();
    // resetSession() clears: session tracker, liveSpins, lastDecision,
    // _currentDecisionSpins, _pendingShadowProjections, _pendingShadowIdx,
    // _lastRetrainBetCount
}

// ═══════════════════════════════════════════════════════════
//  DECISION WITH DIAGNOSTICS
// ═══════════════════════════════════════════════════════════

/**
 * Get engine decision + diagnostics (overlap matrix, projection set).
 *
 * Wraps AutoTestRunner._simulateDecision() and adds:
 *   - projectionCanonSet: pre-filter canonical number set
 *   - overlapEntries: pairwise overlap between all flashing pairs
 *   - allProjections: per-pair projection maps
 *
 * @param {AutoTestRunner} runner
 * @param {number[]} spins - Session spin array
 * @param {number} idx - Current decision index
 * @returns {{ decision, projectionCanonSet, allProjections, overlapEntries }}
 */
function getDecisionWithDiagnostics(runner, spins, idx) {
    const engine = runner.engine;

    // 1. Capture all flashing pairs + projections for overlap matrix
    //    These functions are stateless reads (no engine mutation), safe to call
    //    before _simulateDecision which handles shadow resolution internally.
    const flashingPairs = engine._getFlashingPairsFromHistory(spins, idx);
    const allProjections = {};
    for (const [refKey, flashInfo] of flashingPairs) {
        const proj = engine._computeProjectionForPair(spins, idx, refKey);
        if (proj && proj.numbers.length > 0) {
            allProjections[refKey] = canonicalSet(proj.numbers);
        }
    }

    // 2. Compute pairwise overlap
    const overlapEntries = [];
    const keys = Object.keys(allProjections);
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const a = new Set(allProjections[keys[i]]);
            const b = new Set(allProjections[keys[j]]);
            const intersection = [...a].filter(x => b.has(x)).length;
            const minSize = Math.min(a.size, b.size);
            const overlap = minSize > 0 ? intersection / minSize : 0;
            overlapEntries.push({ pairA: keys[i], pairB: keys[j], overlap });
        }
    }

    // 3. Get actual decision (calls engine internals, mutates shadow state)
    const decision = runner._simulateDecision(spins, idx);

    // 4. Build pre-filter projection set (union of all T3 projections + T2 numbers)
    const projSet = new Set();
    for (const nums of Object.values(allProjections)) {
        nums.forEach(n => projSet.add(n));
    }
    // Add T2 numbers (simulateT2FlashAndNumbers is stateless, safe to call)
    const t2Data = engine.simulateT2FlashAndNumbers(spins, idx);
    if (t2Data && t2Data.numbers) {
        canonicalSet(t2Data.numbers).forEach(n => projSet.add(n));
    }

    return {
        decision,
        projectionCanonSet: [...projSet].sort((a, b) => a - b),
        allProjections,
        overlapEntries
    };
}

// ═══════════════════════════════════════════════════════════
//  WALK-FORWARD LOOP
// ═══════════════════════════════════════════════════════════

async function runWalkForward() {
    // Always train on ALL app/data files (even when evaluating on custom data)
    const engine = new AIAutoEngine();
    suppressLog = true;
    let trainingSessions;
    if (customDataFile) {
        // Load training data from app/data even though evaluation is on custom file
        const trainFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
        const trainData = trainFiles.map(f => ({
            filename: f,
            content: fs.readFileSync(path.join(dataDir, f), 'utf-8')
        }));
        const trainResult = dataLoader.loadMultiple(trainData);
        trainingSessions = trainResult.sessions.map(s => s.spins);
        origLog(`Training on ${trainFiles.length} files (${trainResult.totalSpins} spins), evaluating on custom data.`);
    } else {
        trainingSessions = sessions.map(s => s.spins);
    }
    engine.train(trainingSessions);
    suppressLog = false;
    origLog('Engine trained on all historical data (in-sample baseline).');

    const runner = new AutoTestRunner(engine);

    // Disable retrain during walk-forward (baseline captures pure trained model + EMA)
    const savedRI = engine._retrainInterval;
    const savedRLS = engine._retrainLossStreak;
    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;

    const logger = new DecisionLogger({ stakePerNumber: 2 });
    const overlapMatrix = {}; // { "pairA|pairB": { values: [], count: 0 } }
    let globalSpinIndex = 0;

    const startTime = Date.now();

    for (let fileIdx = 0; fileIdx < sessions.length; fileIdx++) {
        const session = sessions[fileIdx];
        const spins = session.spins;

        // Session boundary — reset session-only state
        sessionBoundary(engine, `file_boundary:${session.filename}`);

        const fileStartIdx = globalSpinIndex;

        // ── WATCH phase: first 3 spins (insufficient context) ──
        for (let t = 0; t < Math.min(3, spins.length); t++) {
            logger.logDecision({
                spinIndex: globalSpinIndex++,
                fileIndex: fileIdx,
                localIndex: t,
                rawResult: spins[t],
                canonResult: canonicalPocket(spins[t]),
                state: 'WAIT',
                selectedPairs: [],
                selectedFilter: null,
                projectionCanonSet: [],
                finalCanonSet: [],
                finalPhysicalSet: [],
                K: 0, K_phys: 0,
                confidence: 0,
                baseline_p: 0,
                includes26: false,
                hit: 0,
                stakeTotal: 0,
                pnl: 0,
                filterDamage: 0,
                driftFlag: false,
                flashUsed: false,
                reason: 'WAIT (insufficient context)'
            });
        }

        // ── DECISION phase: spin 3 to spins.length-2 ──
        // At index t, engine sees spins[0..t], predicts spins[t+1]
        suppressLog = true;
        for (let t = 3; t < spins.length - 1; t++) {
            const { decision, projectionCanonSet, overlapEntries } =
                getDecisionWithDiagnostics(runner, spins, t);

            const actual = spins[t + 1];
            const canonActual = canonicalPocket(actual);

            // Infer flashUsed from decision reason (captures current engine behavior)
            const flashUsed = (decision.reason || '').toLowerCase().includes('flash');

            // Accumulate overlap data
            for (const entry of overlapEntries) {
                const key = [entry.pairA, entry.pairB].sort().join('|');
                if (!overlapMatrix[key]) overlapMatrix[key] = { values: [], count: 0 };
                overlapMatrix[key].values.push(entry.overlap);
                overlapMatrix[key].count++;
            }

            if (decision.action === 'BET') {
                const finalCanon = canonicalSet(decision.numbers);
                const finalPhys = physicalSet(finalCanon);
                const { K, K_phys, includes26, baseline_p } = computeBaseline(finalCanon);
                const hit = finalCanon.includes(canonActual) ? 1 : 0;
                const pnl = logger.computePnL(K_phys, hit === 1);

                // filterDamage: canonActual was in projection but removed by filter
                const projCanon = canonicalSet(projectionCanonSet);
                const filterDamage = (projCanon.includes(canonActual) && !finalCanon.includes(canonActual)) ? 1 : 0;

                logger.logDecision({
                    spinIndex: globalSpinIndex++,
                    fileIndex: fileIdx,
                    localIndex: t,
                    rawResult: actual,
                    canonResult: canonActual,
                    state: engine.session.trendState === 'RECOVERY' ? 'RECOVERY' : 'BET',
                    selectedPairs: [decision.selectedPair].filter(Boolean),
                    selectedFilter: decision.selectedFilter,
                    projectionCanonSet: projCanon,
                    finalCanonSet: finalCanon,
                    finalPhysicalSet: finalPhys,
                    K, K_phys,
                    confidence: decision.confidence,
                    baseline_p,
                    includes26,
                    hit,
                    stakeTotal: 2 * K_phys,
                    pnl,
                    filterDamage,
                    driftFlag: false,
                    flashUsed,
                    reason: decision.reason
                });

                // Feed result back to engine (updates Bayesian, EMA, trend state)
                engine.recordResult(
                    decision.selectedPair, decision.selectedFilter,
                    hit === 1, actual, decision.numbers,
                    decision.preFilterNumbers || projectionCanonSet  // pre-filter for damage tracking
                );

            } else {
                // SKIP
                const projCanon = canonicalSet(projectionCanonSet);
                logger.logDecision({
                    spinIndex: globalSpinIndex++,
                    fileIndex: fileIdx,
                    localIndex: t,
                    rawResult: actual,
                    canonResult: canonActual,
                    state: 'SKIP',
                    selectedPairs: [],
                    selectedFilter: null,
                    projectionCanonSet: projCanon,
                    finalCanonSet: [],
                    finalPhysicalSet: [],
                    K: 0, K_phys: 0,
                    confidence: decision.confidence,
                    baseline_p: 0,
                    includes26: false,
                    hit: 0,
                    stakeTotal: 0,
                    pnl: 0,
                    filterDamage: 0,
                    driftFlag: false,
                    flashUsed,
                    reason: decision.reason
                });

                engine.recordSkip();
            }
        }
        suppressLog = false;

        // Last spin of file as WAIT (no next spin to verify against)
        logger.logDecision({
            spinIndex: globalSpinIndex++,
            fileIndex: fileIdx,
            localIndex: spins.length - 1,
            rawResult: spins[spins.length - 1],
            canonResult: canonicalPocket(spins[spins.length - 1]),
            state: 'WAIT',
            selectedPairs: [],
            selectedFilter: null,
            projectionCanonSet: [],
            finalCanonSet: [],
            finalPhysicalSet: [],
            K: 0, K_phys: 0,
            confidence: 0,
            baseline_p: 0,
            includes26: false,
            hit: 0,
            stakeTotal: 0,
            pnl: 0,
            filterDamage: 0,
            driftFlag: false,
            flashUsed: false,
            reason: 'WAIT (last spin in file, no next spin to verify)'
        });

        const fileSpinCount = globalSpinIndex - fileStartIdx;
        origLog(`  File ${fileIdx + 1}/${sessions.length}: ${session.filename} (${spins.length} spins, ${fileSpinCount} records)`);
    }

    // Restore retrain settings
    engine._retrainInterval = savedRI;
    engine._retrainLossStreak = savedRLS;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    origLog(`\nProcessed ${globalSpinIndex} spin records in ${elapsed}s\n`);

    // Save JSONL
    const outputPath = path.join(__dirname, `walk-forward-${stepName}.jsonl`);
    logger.saveToJSONL(outputPath);
    origLog(`Saved: ${outputPath} (${logger.getRecords().length} records)\n`);

    // Print summary
    printSummary(logger, overlapMatrix);
}

// ═══════════════════════════════════════════════════════════
//  SUMMARY REPORT
// ═══════════════════════════════════════════════════════════

function printSummary(logger, overlapMatrix) {
    const s = logger.getSummary();

    origLog('═══════════════════════════════════════════════════════════');
    origLog('  WALK-FORWARD BASELINE REPORT');
    origLog('═══════════════════════════════════════════════════════════\n');

    origLog('─── Overall ───');
    origLog(`Total spins:              ${s.totalSpins}`);
    origLog(`Total bets:               ${s.totalBets}`);
    origLog(`Total skips:              ${s.totalSkips}`);
    origLog(`Total waits:              ${s.totalWaits}`);
    origLog(`Action bet rate:          ${(s.actionBetRate * 100).toFixed(1)}%  (bets / actionable decisions)`);
    origLog(`Spin bet rate:            ${(s.spinBetRate * 100).toFixed(1)}%  (bets / all spins)`);
    origLog(`Avg K (canonical):        ${s.avgK.toFixed(1)}`);
    origLog(`Avg K_phys:               ${s.avgK_phys.toFixed(1)}`);
    origLog(`Hit rate:                 ${(s.hitRate * 100).toFixed(2)}%  (conditional on BET)`);
    origLog(`Avg baseline (phys cov):  ${(s.avgBaseline * 100).toFixed(2)}%  (K_phys / 37)`);
    origLog(`Hit uplift:               ${(s.hitUplift * 100).toFixed(2)}%  (hitRate - baseline)`);
    origLog(`Total P&L:                $${s.totalPnl.toFixed(0)}`);
    origLog(`EV per bet:               $${s.evPerBet.toFixed(2)}`);
    origLog(`EV per spin:              $${s.evPerSpin.toFixed(2)}`);
    origLog(`Max drawdown:             $${s.maxDrawdown.toFixed(0)}`);
    origLog(`Longest losing streak:    ${s.longestLosingStreak}`);
    origLog(`Profit factor:            ${s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)}`);
    origLog(`Filter damage rate:       ${(s.filterDamageRate * 100).toFixed(1)}%`);
    origLog(`Avg WAIT/SKIP streak:     ${s.avgConsecutiveWaitStreak.toFixed(1)}`);

    // ── By K Bins ──
    origLog('\n─── By K Bins ───');
    const kBins = logger.getSummaryByBins('K', [
        [1, 6, 'K=1-6'],
        [7, 8, 'K=7-8'],
        [9, 10, 'K=9-10'],
        [11, 12, 'K=11-12'],
        [13, Infinity, 'K=13+']
    ]);
    origLog('Bin'.padEnd(12) + 'Count'.padStart(7) + '  Hit%'.padStart(8) +
        '  Base%'.padStart(8) + '  Uplift'.padStart(8) + '  EV/bet'.padStart(9) +
        '  AvgK'.padStart(7));
    for (const bin of kBins) {
        if (bin.count === 0) continue;
        origLog(
            bin.label.padEnd(12) +
            String(bin.count).padStart(7) + '  ' +
            (bin.hitRate * 100).toFixed(1).padStart(6) + '%  ' +
            (bin.avgBaseline * 100).toFixed(1).padStart(5) + '%  ' +
            ((bin.hitUplift * 100) >= 0 ? '+' : '') + (bin.hitUplift * 100).toFixed(1).padStart(5) + '%  ' +
            ('$' + bin.evPerBet.toFixed(2)).padStart(8) + '  ' +
            bin.avgK.toFixed(1).padStart(5)
        );
    }

    // ── By includes26 ──
    origLog('\n─── By Includes Canonical 26 (0/26 merged pocket) ───');
    const i26Bins = logger.getSummaryByBins('includes26', [
        [true, 'with_26'],
        [false, 'without_26']
    ]);
    for (const bin of i26Bins) {
        if (bin.count === 0) continue;
        origLog(
            `${bin.label.padEnd(14)} ${String(bin.count).padStart(6)} bets, ` +
            `hit=${(bin.hitRate * 100).toFixed(1)}%, ` +
            `baseline(phys cov)=${(bin.avgBaseline * 100).toFixed(1)}%, ` +
            `uplift=${(bin.hitUplift * 100 >= 0 ? '+' : '') + (bin.hitUplift * 100).toFixed(1)}%`
        );
    }

    // ── By Phase ──
    origLog('\n─── By Phase (spinIndex ranges) ───');
    const phaseBins = logger.getSummaryByBins('spinIndex', [
        [0, 2000, 'early (0-2k)'],
        [2000, 5000, 'mid (2k-5k)'],
        [5000, Infinity, 'late (5k+)']
    ]);
    for (const bin of phaseBins) {
        if (bin.count === 0) continue;
        origLog(
            `${bin.label.padEnd(16)} ${String(bin.count).padStart(6)} bets, ` +
            `hit=${(bin.hitRate * 100).toFixed(1)}%, ` +
            `uplift=${(bin.hitUplift * 100 >= 0 ? '+' : '') + (bin.hitUplift * 100).toFixed(1)}%, ` +
            `EV/bet=$${bin.evPerBet.toFixed(2)}`
        );
    }

    // ── Pair Overlap Matrix ──
    origLog('\n─── Pair Overlap Matrix ───');
    const overlapKeys = Object.keys(overlapMatrix).sort();
    if (overlapKeys.length === 0) {
        origLog('(no multi-pair flashes observed)');
    } else {
        origLog('Pair Combination'.padEnd(40) + 'Avg%'.padStart(6) + '  Min%'.padStart(6) +
            '  Max%'.padStart(6) + '  N'.padStart(6));
        for (const key of overlapKeys) {
            const data = overlapMatrix[key];
            if (data.count < 5) continue; // Skip rare combinations
            const avg = data.values.reduce((s, v) => s + v, 0) / data.values.length;
            const min = Math.min(...data.values);
            const max = Math.max(...data.values);
            origLog(
                key.padEnd(40) +
                (avg * 100).toFixed(0).padStart(5) + '%  ' +
                (min * 100).toFixed(0).padStart(4) + '%  ' +
                (max * 100).toFixed(0).padStart(4) + '%  ' +
                String(data.count).padStart(5)
            );
        }
    }

    // Overlap distribution summary
    const allOverlaps = [];
    for (const data of Object.values(overlapMatrix)) {
        allOverlaps.push(...data.values);
    }
    if (allOverlaps.length > 0) {
        allOverlaps.sort((a, b) => a - b);
        const p25 = allOverlaps[Math.floor(allOverlaps.length * 0.25)];
        const p50 = allOverlaps[Math.floor(allOverlaps.length * 0.50)];
        const p75 = allOverlaps[Math.floor(allOverlaps.length * 0.75)];
        const p90 = allOverlaps[Math.floor(allOverlaps.length * 0.90)];
        origLog(`\nOverlap distribution (n=${allOverlaps.length}): ` +
            `p25=${(p25 * 100).toFixed(0)}%, p50=${(p50 * 100).toFixed(0)}%, ` +
            `p75=${(p75 * 100).toFixed(0)}%, p90=${(p90 * 100).toFixed(0)}%`);
    }

    // ── Rolling Metrics (last windows) ──
    origLog('\n─── Rolling Metrics (window=50 bets) ───');
    const rolling = logger.getRollingMetrics(50);
    if (rolling.length === 0) {
        origLog('(insufficient BET records for rolling analysis)');
    } else {
        // Show first 3 and last 3 windows
        const toShow = [];
        if (rolling.length <= 6) {
            toShow.push(...rolling);
        } else {
            toShow.push(...rolling.slice(0, 3));
            toShow.push(null); // separator
            toShow.push(...rolling.slice(-3));
        }

        origLog('Window'.padEnd(12) + 'SpinRange'.padEnd(14) + 'Hit%'.padStart(7) +
            '  Base%'.padStart(8) + '  Uplift'.padStart(8) + '  P&L'.padStart(8) +
            '  AvgK'.padStart(7));
        for (const w of toShow) {
            if (w === null) {
                origLog('    ...');
                continue;
            }
            origLog(
                `${w.startIndex}-${w.endIndex}`.padEnd(12) +
                `${w.startSpinIndex}-${w.endSpinIndex}`.padEnd(14) +
                (w.hitRate * 100).toFixed(1).padStart(6) + '%  ' +
                (w.avgBaseline * 100).toFixed(1).padStart(5) + '%  ' +
                ((w.hitUplift * 100) >= 0 ? '+' : '') + (w.hitUplift * 100).toFixed(1).padStart(5) + '%  ' +
                ('$' + w.totalPnl.toFixed(0)).padStart(7) + '  ' +
                w.avgK.toFixed(1).padStart(5)
            );
        }
    }

    // ── Sanity Checks ──
    origLog('\n─── Sanity Checks ───');
    const betRecords = logger.getBetRecords();

    // avgBaseline should be close to average physical coverage / 37
    origLog(`✓ Avg baseline (phys cov): ${(s.avgBaseline * 100).toFixed(2)}% — should be near avg(K_phys)/37`);
    const expectedBaseline = s.avgK_phys / 37;
    origLog(`  Expected from avgK_phys: ${(expectedBaseline * 100).toFixed(2)}%`);

    // Check hitRate vs avgBaseline — if wildly positive, might be overfit
    if (s.hitUplift > 0.15) {
        origLog(`⚠ Hit uplift +${(s.hitUplift * 100).toFixed(1)}% — unusually high, may indicate in-sample overfit`);
    } else if (s.hitUplift > 0) {
        origLog(`✓ Hit uplift +${(s.hitUplift * 100).toFixed(1)}% — positive edge detected`);
    } else {
        origLog(`✗ Hit uplift ${(s.hitUplift * 100).toFixed(1)}% — negative, no edge`);
    }

    // Check canonical consistency
    const has0InCanon = betRecords.some(r => r.finalCanonSet.includes(0));
    origLog(`✓ Canonical 0 never in finalCanonSet: ${!has0InCanon}`);

    // Check filterDamage exists
    const totalDamage = betRecords.filter(r => r.filterDamage === 1).length;
    origLog(`✓ Filter damage events: ${totalDamage} (${(totalDamage / betRecords.length * 100).toFixed(1)}% of bets)`);

    origLog('\n═══════════════════════════════════════════════════════════');
    origLog('  BASELINE RUN COMPLETE');
    origLog('═══════════════════════════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════
//  EXPORTS (for testing) + MAIN
// ═══════════════════════════════════════════════════════════

// Export internals for unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sessionBoundary,
        getDecisionWithDiagnostics,
        runWalkForward
    };
}

// Run if executed directly
if (require.main === module) {
    runWalkForward().catch(e => {
        origLog('Error: ' + e.message + '\n' + e.stack);
        process.exit(1);
    });
}
