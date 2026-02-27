#!/usr/bin/env node
/**
 * PROPER Benchmark — Trains on app/data/*.txt (like production), tests on test_data2.txt
 * This matches the user's actual production flow exactly.
 */

const fs = require('fs');
const path = require('path');

// Bootstrap JSDOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;

// Load table-lookup.js
const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
eval(lookupSrc);
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
rendererWrapper(global.window, global.document, () => {}, () => true, () => Promise.resolve({ json: () => ({}) }), getLookupRow, typeof LOOKUP_TABLE !== 'undefined' ? LOOKUP_TABLE : {});

// Suppress console.log from engine/runner during benchmark
const origLog = console.log;
let suppressLog = false;
console.log = (...args) => { if (!suppressLog) origLog(...args); };

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

// ── Load TRAINING data (app/data/*.txt — same as production) ──
const dataDir = path.join(__dirname, 'app', 'data');
const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
const dataLoader = new AIDataLoader();
const trainingFiles = dataFiles.map(f => ({
    filename: f,
    content: fs.readFileSync(path.join(dataDir, f), 'utf-8')
}));
const loadResult = dataLoader.loadMultiple(trainingFiles);
const trainingSessions = loadResult.sessions.map(s => s.spins);
origLog(`Training: ${dataFiles.length} files, ${loadResult.totalSpins} total spins`);
origLog(`Training files: ${dataFiles.join(', ')}`);

// ── Load TEST data (test_data2.txt — separate from training) ──
const testDataPath = '/Users/ubusan-nb-ecr/Desktop/test_data2.txt';
const testRaw = fs.readFileSync(testDataPath, 'utf-8');
const testParsed = dataLoader.parseTextContent(testRaw, 'test_data2.txt');
const testSpins = testParsed.spins;
origLog(`Testing: ${testSpins.length} spins from test_data2.txt\n`);

// ── Configurations to test ──
const CONFIGS = [
    // Baseline
    { name: '$10 cap, R@3, 5max  ', MAX_BET: 10, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$10 cap, R@4, 5max  ', MAX_BET: 10, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$10 cap, R@5, 5max  ', MAX_BET: 10, LOSS_STREAK_RESET: 5, MAX_RESETS: 5 },
    { name: '$10 cap, no reset   ', MAX_BET: 10, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },

    // Higher caps
    { name: '$12 cap, R@3, 5max  ', MAX_BET: 12, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$12 cap, R@4, 5max  ', MAX_BET: 12, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$12 cap, no reset   ', MAX_BET: 12, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },

    { name: '$14 cap, R@3, 5max  ', MAX_BET: 14, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$14 cap, R@4, 5max  ', MAX_BET: 14, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$14 cap, no reset   ', MAX_BET: 14, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },

    { name: '$16 cap, R@3, 5max  ', MAX_BET: 16, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$16 cap, R@4, 5max  ', MAX_BET: 16, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$16 cap, no reset   ', MAX_BET: 16, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },

    { name: '$18 cap, R@3, 5max  ', MAX_BET: 18, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$18 cap, R@4, 5max  ', MAX_BET: 18, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$18 cap, no reset   ', MAX_BET: 18, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },

    { name: '$20 cap, R@3, 5max  ', MAX_BET: 20, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$20 cap, R@4, 5max  ', MAX_BET: 20, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$20 cap, no reset   ', MAX_BET: 20, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },

    { name: '$25 cap, R@3, 5max  ', MAX_BET: 25, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$30 cap, R@3, 5max  ', MAX_BET: 30, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },

    // No cap
    { name: 'No cap (unlimited)   ', MAX_BET: Infinity, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },
];

async function runBenchmark() {
    // Train engine once on TRAINING data (like production)
    const engine = new AIAutoEngine();
    suppressLog = true;
    engine.train(trainingSessions);
    suppressLog = false;
    origLog('Engine trained on historical data (NOT test data).\n');

    const header = 'Config'.padEnd(24) +
        'Busts'.padStart(6) + '  ' +
        'Wins'.padStart(5) + '  ' +
        'Inc'.padStart(4) + '  ' +
        'Win%'.padStart(8) + '  ' +
        'AvgSpn'.padStart(7) + '  ' +
        'TotProfit'.padStart(10) + '  ' +
        'AvgP/Sess'.padStart(9) + '  ' +
        'WinU30'.padStart(7) + '  ' +
        'WinU30%'.padStart(8) + '  ' +
        'S1bust'.padStart(6) + '  ' +
        'S2bust'.padStart(6) + '  ' +
        'S3bust'.padStart(6);

    origLog(header);
    origLog('-'.repeat(header.length));

    const results = [];

    for (const config of CONFIGS) {
        const runner = new AutoTestRunner(engine, {
            STARTING_BANKROLL: 4000, TARGET_PROFIT: 100, MIN_BET: 2,
            MAX_BET: config.MAX_BET,
            LOSS_STREAK_RESET: config.LOSS_STREAK_RESET,
            MAX_RESETS: config.MAX_RESETS,
            STOP_LOSS: 0
        });

        const savedRI = engine._retrainInterval;
        const savedRLS = engine._retrainLossStreak;
        engine._retrainInterval = Infinity;
        engine._retrainLossStreak = Infinity;
        suppressLog = true;
        const result = await runner.runAll(testSpins, { testFile: 'bench' });
        suppressLog = false;
        engine._retrainInterval = savedRI;
        engine._retrainLossStreak = savedRLS;

        const all = [...result.strategies[1].sessions, ...result.strategies[2].sessions, ...result.strategies[3].sessions];
        const wins = all.filter(s => s.outcome === 'WIN');
        const busts = all.filter(s => s.outcome === 'BUST');
        const inc = all.filter(s => s.outcome === 'INCOMPLETE');
        const totalP = all.reduce((s, x) => s + x.finalProfit, 0);
        const avgSpn = wins.length > 0 ? (wins.reduce((s, x) => s + x.totalSpins, 0) / wins.length) : 0;
        const winU30 = wins.filter(s => s.totalSpins <= 30);
        const decided = wins.length + busts.length;
        const winPct = decided > 0 ? ((wins.length / decided) * 100).toFixed(2) : 'N/A';

        const s1b = result.strategies[1].summary.busts;
        const s2b = result.strategies[2].summary.busts;
        const s3b = result.strategies[3].summary.busts;

        const row = { config, totalP, busts: busts.length, wins: wins.length, inc: inc.length, winPct, avgSpn, winU30: winU30.length };
        results.push(row);

        origLog(
            config.name.padEnd(24) +
            String(busts.length).padStart(6) + '  ' +
            String(wins.length).padStart(5) + '  ' +
            String(inc.length).padStart(4) + '  ' +
            (winPct + '%').padStart(8) + '  ' +
            avgSpn.toFixed(1).padStart(7) + '  ' +
            ('$' + totalP.toLocaleString()).padStart(10) + '  ' +
            ('$' + (totalP / all.length).toFixed(0)).padStart(9) + '  ' +
            String(winU30.length).padStart(7) + '  ' +
            (wins.length > 0 ? ((winU30.length / wins.length) * 100).toFixed(1) + '%' : 'N/A').padStart(8) + '  ' +
            String(s1b).padStart(6) + '  ' +
            String(s2b).padStart(6) + '  ' +
            String(s3b).padStart(6)
        );
    }

    origLog('-'.repeat(120));

    // Analysis
    origLog('\n═══ ANALYSIS ═══\n');

    const zeroBust = results.filter(r => r.busts === 0).sort((a, b) => b.totalP - a.totalP);
    if (zeroBust.length > 0) {
        origLog('BEST 0-BUST configs (sorted by profit):');
        for (const r of zeroBust) {
            origLog(`  ${r.config.name.trim()}: $${r.totalP.toLocaleString()} profit, ${r.avgSpn.toFixed(1)} avg spins, ${r.winU30}/${r.wins} wins under 30 spins`);
        }
    }

    origLog('\nBEST ≤1 BUST configs:');
    const lowBust = results.filter(r => r.busts <= 1).sort((a, b) => b.totalP - a.totalP);
    for (const r of lowBust.slice(0, 5)) {
        origLog(`  ${r.config.name.trim()}: $${r.totalP.toLocaleString()} profit, ${r.busts} busts, ${r.avgSpn.toFixed(1)} avg spins`);
    }

    origLog('\nALL configs sorted by profit:');
    results.sort((a, b) => b.totalP - a.totalP);
    for (const r of results) {
        const marker = r.busts === 0 ? '✓' : r.busts <= 2 ? '~' : '✗';
        origLog(`  ${marker} ${r.config.name.trim()}: $${r.totalP.toLocaleString()}, ${r.busts} busts, ${r.avgSpn.toFixed(1)} avg spins, ${r.winU30}/${r.wins} wins<30spn`);
    }

    // Deep dive on top config
    origLog('\n═══ DEEP DIVE: Best 0-bust config ═══\n');
    if (zeroBust.length > 0) {
        const best = zeroBust[0];
        const runner2 = new AutoTestRunner(engine, {
            STARTING_BANKROLL: 4000, TARGET_PROFIT: 100, MIN_BET: 2,
            MAX_BET: best.config.MAX_BET,
            LOSS_STREAK_RESET: best.config.LOSS_STREAK_RESET,
            MAX_RESETS: best.config.MAX_RESETS,
            STOP_LOSS: 0
        });
        engine._retrainInterval = Infinity;
        engine._retrainLossStreak = Infinity;
        suppressLog = true;
        const r2 = await runner2.runAll(testSpins, { testFile: 'bench' });
        suppressLog = false;

        for (const sn of [1, 2, 3]) {
            const sessions = r2.strategies[sn].sessions;
            const wins = sessions.filter(s => s.outcome === 'WIN');
            const inc = sessions.filter(s => s.outcome === 'INCOMPLETE');
            const winP = wins.reduce((s, x) => s + x.finalProfit, 0);
            const incP = inc.reduce((s, x) => s + x.finalProfit, 0);
            origLog(`Strategy ${sn}: ${wins.length} wins ($${winP.toLocaleString()}), ${inc.length} inc ($${incP.toLocaleString()}), net $${(winP + incP).toLocaleString()}`);
            origLog(`  Avg spins to win: ${(wins.reduce((s,x)=>s+x.totalSpins,0)/wins.length).toFixed(1)}, Avg win profit: $${(winP/wins.length).toFixed(0)}`);
            origLog(`  Avg inc loss: $${(incP/(inc.length||1)).toFixed(0)}, Inc as % of sessions: ${(inc.length/sessions.length*100).toFixed(1)}%`);
        }
    }
}

runBenchmark().catch(e => origLog('Error: ' + e.message + '\n' + e.stack));
