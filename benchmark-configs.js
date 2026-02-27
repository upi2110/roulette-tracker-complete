#!/usr/bin/env node
/**
 * Benchmark Script — Test multiple session configurations against test_data2.txt
 *
 * Tests different MAX_BET, LOSS_STREAK_RESET, STOP_LOSS combos to find
 * the sweet spot: $100 profit in ≤30 spins, 0 busts, maximum total profit.
 */

const fs = require('fs');
const path = require('path');

// ── Bootstrap: Set up JSDOM environment like jest-environment-jsdom ──
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;

// Set up DOM first
const { setupDOM } = require('./tests/test-setup');
setupDOM();

// Load table-lookup.js in global scope (renderer depends on getLookupRow)
const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
eval(lookupSrc);

// Load renderer-3tables.js — eval in function scope, then attach to window/global
// The engine checks window.calculateReferences, window.DIGIT_13_OPPOSITES, etc.
const rendererSrc = fs.readFileSync(path.join(__dirname, 'app', 'renderer-3tables.js'), 'utf-8');
const rendererWrapper = new Function('window', 'document', 'alert', 'confirm', 'fetch', 'getLookupRow', 'LOOKUP_TABLE', `
    ${rendererSrc}
    // Attach all needed functions/constants to window
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

// Load project modules
const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

// ── Load test data ──
const testDataPath = '/Users/ubusan-nb-ecr/Desktop/test_data2.txt';
const raw = fs.readFileSync(testDataPath, 'utf-8');
const dataLoader = new AIDataLoader();
const parsed = dataLoader.parseTextContent(raw, 'test_data2.txt');
const testSpins = parsed.spins;

console.log(`Loaded ${testSpins.length} spins from test_data2.txt\n`);

// ── Configurations to test ──
const CONFIGS = [
    // Baseline: current $10 cap
    { name: 'Baseline $10 cap', MAX_BET: 10, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0 },

    // Higher caps — more profit potential
    { name: '$15 cap, reset@3', MAX_BET: 15, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0 },
    { name: '$20 cap, reset@3', MAX_BET: 20, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0 },
    { name: '$25 cap, reset@3', MAX_BET: 25, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0 },
    { name: '$30 cap, reset@3', MAX_BET: 30, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0 },
    { name: '$35 cap, reset@3', MAX_BET: 35, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0 },

    // Higher caps with slower escalation reset
    { name: '$20 cap, reset@4', MAX_BET: 20, LOSS_STREAK_RESET: 4, MAX_RESETS: 5, STOP_LOSS: 0 },
    { name: '$25 cap, reset@4', MAX_BET: 25, LOSS_STREAK_RESET: 4, MAX_RESETS: 5, STOP_LOSS: 0 },
    { name: '$30 cap, reset@4', MAX_BET: 30, LOSS_STREAK_RESET: 4, MAX_RESETS: 5, STOP_LOSS: 0 },

    // Higher caps with more resets
    { name: '$20 cap, reset@3, 10 max', MAX_BET: 20, LOSS_STREAK_RESET: 3, MAX_RESETS: 10, STOP_LOSS: 0 },
    { name: '$25 cap, reset@3, 10 max', MAX_BET: 25, LOSS_STREAK_RESET: 3, MAX_RESETS: 10, STOP_LOSS: 0 },

    // No cap (unlimited) — see raw bust count
    { name: 'No cap (unlimited)', MAX_BET: Infinity, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0, STOP_LOSS: 0 },

    // Stop loss variants — limit total loss per session
    { name: '$20 cap, SL $500', MAX_BET: 20, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 500 },
    { name: '$25 cap, SL $500', MAX_BET: 25, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 500 },
    { name: '$20 cap, SL $1000', MAX_BET: 20, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 1000 },
    { name: '$25 cap, SL $1000', MAX_BET: 25, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 1000 },

    // Reset at 2 losses (more aggressive protection)
    { name: '$20 cap, reset@2', MAX_BET: 20, LOSS_STREAK_RESET: 2, MAX_RESETS: 10, STOP_LOSS: 0 },
    { name: '$25 cap, reset@2', MAX_BET: 25, LOSS_STREAK_RESET: 2, MAX_RESETS: 10, STOP_LOSS: 0 },
];

// ── Run benchmarks ──
async function runBenchmark() {
    // Train engine once (same for all configs)
    const engine = new AIAutoEngine();
    engine.train([testSpins]);

    console.log('Engine trained. Running benchmarks...\n');
    console.log('=' .repeat(180));
    console.log(
        'Config'.padEnd(28) +
        '│ Busts'.padEnd(10) +
        '│ Wins'.padEnd(10) +
        '│ Incomp'.padEnd(10) +
        '│ Win%'.padEnd(10) +
        '│ AvgSpins'.padEnd(12) +
        '│ TotalProfit'.padEnd(14) +
        '│ AvgProfit'.padEnd(12) +
        '│ S1 Bust'.padEnd(10) +
        '│ S2 Bust'.padEnd(10) +
        '│ S3 Bust'.padEnd(10) +
        '│ S1 Profit'.padEnd(13) +
        '│ S2 Profit'.padEnd(13) +
        '│ S3 Profit'
    );
    console.log('─'.repeat(180));

    const results = [];

    for (const config of CONFIGS) {
        const runner = new AutoTestRunner(engine, {
            STARTING_BANKROLL: 4000,
            TARGET_PROFIT: 100,
            MIN_BET: 2,
            MAX_BET: config.MAX_BET,
            LOSS_STREAK_RESET: config.LOSS_STREAK_RESET,
            MAX_RESETS: config.MAX_RESETS,
            STOP_LOSS: config.STOP_LOSS || 0
        });

        // Disable retrain
        const savedRI = engine._retrainInterval;
        const savedRLS = engine._retrainLossStreak;
        engine._retrainInterval = Infinity;
        engine._retrainLossStreak = Infinity;

        const result = await runner.runAll(testSpins, { testFile: 'test_data2.txt' });

        engine._retrainInterval = savedRI;
        engine._retrainLossStreak = savedRLS;

        // Extract stats
        const s1 = result.strategies[1].summary;
        const s2 = result.strategies[2].summary;
        const s3 = result.strategies[3].summary;

        const totalBusts = s1.busts + s2.busts + s3.busts;
        const totalWins = s1.wins + s2.wins + s3.wins;
        const totalIncomplete = s1.incomplete + s2.incomplete + s3.incomplete;
        const totalSessions = s1.totalSessions + s2.totalSessions + s3.totalSessions;
        const decided = totalWins + totalBusts;
        const winPct = decided > 0 ? ((totalWins / decided) * 100).toFixed(2) : 'N/A';

        // Compute total profit & average spins to win
        const allSessions = [
            ...result.strategies[1].sessions,
            ...result.strategies[2].sessions,
            ...result.strategies[3].sessions
        ];
        const totalProfit = allSessions.reduce((sum, s) => sum + s.finalProfit, 0);
        const winSessions = allSessions.filter(s => s.outcome === 'WIN');
        const avgSpinsToWin = winSessions.length > 0
            ? (winSessions.reduce((sum, s) => sum + s.totalSpins, 0) / winSessions.length).toFixed(1)
            : 'N/A';
        const avgProfit = (totalProfit / totalSessions).toFixed(1);

        // Per-strategy profits
        const s1Profit = result.strategies[1].sessions.reduce((sum, s) => sum + s.finalProfit, 0);
        const s2Profit = result.strategies[2].sessions.reduce((sum, s) => sum + s.finalProfit, 0);
        const s3Profit = result.strategies[3].sessions.reduce((sum, s) => sum + s.finalProfit, 0);

        const row = {
            name: config.name,
            totalBusts,
            totalWins,
            totalIncomplete,
            winPct,
            avgSpinsToWin,
            totalProfit,
            avgProfit,
            s1Busts: s1.busts,
            s2Busts: s2.busts,
            s3Busts: s3.busts,
            s1Profit,
            s2Profit,
            s3Profit,
            config
        };
        results.push(row);

        console.log(
            config.name.padEnd(28) +
            `│ ${String(totalBusts).padEnd(8)}` +
            `│ ${String(totalWins).padEnd(8)}` +
            `│ ${String(totalIncomplete).padEnd(8)}` +
            `│ ${String(winPct + '%').padEnd(8)}` +
            `│ ${String(avgSpinsToWin).padEnd(10)}` +
            `│ $${String(totalProfit.toLocaleString()).padEnd(12)}` +
            `│ $${String(avgProfit).padEnd(10)}` +
            `│ ${String(s1.busts).padEnd(8)}` +
            `│ ${String(s2.busts).padEnd(8)}` +
            `│ ${String(s3.busts).padEnd(8)}` +
            `│ $${String(s1Profit.toLocaleString()).padEnd(11)}` +
            `│ $${String(s2Profit.toLocaleString()).padEnd(11)}` +
            `│ $${s3Profit.toLocaleString()}`
        );
    }

    console.log('─'.repeat(180));

    // ── Find best configs ──
    console.log('\n\n═══════════════════════════════════════════════');
    console.log('  ANALYSIS');
    console.log('═══════════════════════════════════════════════\n');

    // Best with 0 busts
    const zeroBustConfigs = results.filter(r => r.totalBusts === 0);
    if (zeroBustConfigs.length > 0) {
        zeroBustConfigs.sort((a, b) => b.totalProfit - a.totalProfit);
        console.log('BEST CONFIG (0 busts, max profit):');
        const best = zeroBustConfigs[0];
        console.log(`  ${best.name}: $${best.totalProfit.toLocaleString()} total profit, ${best.avgSpinsToWin} avg spins, ${best.totalIncomplete} incomplete`);
        console.log(`  Config: MAX_BET=${best.config.MAX_BET}, LOSS_STREAK_RESET=${best.config.LOSS_STREAK_RESET}, MAX_RESETS=${best.config.MAX_RESETS}, STOP_LOSS=${best.config.STOP_LOSS}`);
    } else {
        console.log('NO config achieved 0 busts!');
    }

    // Best with ≤1 bust
    const lowBustConfigs = results.filter(r => r.totalBusts <= 1);
    if (lowBustConfigs.length > 0) {
        lowBustConfigs.sort((a, b) => b.totalProfit - a.totalProfit);
        console.log('\nBEST CONFIG (≤1 bust, max profit):');
        const best = lowBustConfigs[0];
        console.log(`  ${best.name}: $${best.totalProfit.toLocaleString()} total profit, ${best.avgSpinsToWin} avg spins, ${best.totalBusts} bust(s), ${best.totalIncomplete} incomplete`);
        console.log(`  Config: MAX_BET=${best.config.MAX_BET}, LOSS_STREAK_RESET=${best.config.LOSS_STREAK_RESET}, MAX_RESETS=${best.config.MAX_RESETS}, STOP_LOSS=${best.config.STOP_LOSS}`);
    }

    // Best overall profit regardless of busts
    results.sort((a, b) => b.totalProfit - a.totalProfit);
    console.log('\nBEST CONFIG (max profit, any bust count):');
    const bestProfit = results[0];
    console.log(`  ${bestProfit.name}: $${bestProfit.totalProfit.toLocaleString()} total profit, ${bestProfit.avgSpinsToWin} avg spins, ${bestProfit.totalBusts} bust(s)`);

    // Show bust sessions detail for top 3 configs with most profit
    console.log('\n\n═══════════════════════════════════════════════');
    console.log('  BUST SESSION DETAIL (top 5 profit configs)');
    console.log('═══════════════════════════════════════════════\n');

    const topProfitConfigs = [...results].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 5);
    for (const r of topProfitConfigs) {
        console.log(`${r.name} (${r.totalBusts} busts, $${r.totalProfit.toLocaleString()} profit):`);
        if (r.totalBusts === 0) {
            console.log('  No busts!');
        }
        console.log('');
    }

    // ── Avg spins analysis ──
    console.log('\n═══════════════════════════════════════════════');
    console.log('  AVG SPINS TO WIN (target: ≤30)');
    console.log('═══════════════════════════════════════════════\n');

    for (const r of results.sort((a, b) => (parseFloat(a.avgSpinsToWin) || 999) - (parseFloat(b.avgSpinsToWin) || 999))) {
        const spins = parseFloat(r.avgSpinsToWin);
        const marker = spins <= 30 ? '✓' : '✗';
        console.log(`  ${marker} ${r.name.padEnd(28)} avg ${r.avgSpinsToWin} spins, ${r.totalBusts} busts, $${r.totalProfit.toLocaleString()}`);
    }
}

runBenchmark().then(() => {
    // ── Deep-dive: Session-level analysis for baseline $10 config ──
    console.log('\n\n═══════════════════════════════════════════════');
    console.log('  DEEP DIVE: Baseline $10 cap');
    console.log('═══════════════════════════════════════════════\n');

    const engine = new AIAutoEngine();
    engine.train([testSpins]);
    const runner = new AutoTestRunner(engine, {
        STARTING_BANKROLL: 4000, TARGET_PROFIT: 100, MIN_BET: 2,
        MAX_BET: 10, LOSS_STREAK_RESET: 3, MAX_RESETS: 5, STOP_LOSS: 0
    });
    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;

    return runner.runAll(testSpins, { testFile: 'test_data2.txt' }).then(result => {
        for (const stratNum of [1, 2, 3]) {
            const sessions = result.strategies[stratNum].sessions;
            const wins = sessions.filter(s => s.outcome === 'WIN');
            const incompletes = sessions.filter(s => s.outcome === 'INCOMPLETE');
            const winsUnder30 = wins.filter(s => s.totalSpins <= 30);

            console.log(`Strategy ${stratNum}:`);
            console.log(`  WIN sessions: ${wins.length} (${winsUnder30.length} within 30 spins = ${((winsUnder30.length/wins.length)*100).toFixed(1)}%)`);
            console.log(`  INCOMPLETE: ${incompletes.length}`);
            console.log(`  Avg WIN profit: $${(wins.reduce((s, x) => s + x.finalProfit, 0) / wins.length).toFixed(0)}`);
            console.log(`  Avg INCOMPLETE profit: $${(incompletes.reduce((s, x) => s + x.finalProfit, 0) / (incompletes.length || 1)).toFixed(0)}`);
            console.log(`  Total WIN profit: $${wins.reduce((s, x) => s + x.finalProfit, 0).toLocaleString()}`);
            console.log(`  Total INCOMPLETE loss: $${incompletes.reduce((s, x) => s + x.finalProfit, 0).toLocaleString()}`);

            // Histogram of spins to win
            const buckets = { '1-10': 0, '11-20': 0, '21-30': 0, '31-40': 0, '41-50': 0, '50+': 0 };
            for (const w of wins) {
                if (w.totalSpins <= 10) buckets['1-10']++;
                else if (w.totalSpins <= 20) buckets['11-20']++;
                else if (w.totalSpins <= 30) buckets['21-30']++;
                else if (w.totalSpins <= 40) buckets['31-40']++;
                else if (w.totalSpins <= 50) buckets['41-50']++;
                else buckets['50+']++;
            }
            console.log(`  Spins-to-win histogram: ${JSON.stringify(buckets)}`);

            // What's the maximum bet ever seen?
            let maxBetSeen = 0;
            for (const sess of sessions) {
                for (const step of sess.steps) {
                    if (step.action === 'BET' && step.betPerNumber > maxBetSeen) {
                        maxBetSeen = step.betPerNumber;
                    }
                }
            }
            console.log(`  Max bet observed: $${maxBetSeen}`);
            console.log('');
        }
    });
}).catch(console.error);
