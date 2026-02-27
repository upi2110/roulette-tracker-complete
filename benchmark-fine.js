#!/usr/bin/env node
/**
 * Fine-grained benchmark — Focus on $10-$18 range with various reset configs
 */

const fs = require('fs');
const path = require('path');

// Bootstrap environment
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

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

// Load test data
const testDataPath = '/Users/ubusan-nb-ecr/Desktop/test_data2.txt';
const raw = fs.readFileSync(testDataPath, 'utf-8');
const dataLoader = new AIDataLoader();
const parsed = dataLoader.parseTextContent(raw, 'test_data2.txt');
const testSpins = parsed.spins;

// Fine-grained configs
const CONFIGS = [
    { name: '$10 cap, R@3, 5max', MAX_BET: 10, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$10 cap, R@4, 5max', MAX_BET: 10, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$10 cap, R@5, 5max', MAX_BET: 10, LOSS_STREAK_RESET: 5, MAX_RESETS: 5 },
    { name: '$10 cap, R@3, 10mx', MAX_BET: 10, LOSS_STREAK_RESET: 3, MAX_RESETS: 10 },
    { name: '$12 cap, R@3, 5max', MAX_BET: 12, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$12 cap, R@4, 5max', MAX_BET: 12, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$12 cap, R@5, 5max', MAX_BET: 12, LOSS_STREAK_RESET: 5, MAX_RESETS: 5 },
    { name: '$14 cap, R@3, 5max', MAX_BET: 14, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$14 cap, R@4, 5max', MAX_BET: 14, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$14 cap, R@5, 5max', MAX_BET: 14, LOSS_STREAK_RESET: 5, MAX_RESETS: 5 },
    { name: '$16 cap, R@3, 5max', MAX_BET: 16, LOSS_STREAK_RESET: 3, MAX_RESETS: 5 },
    { name: '$16 cap, R@4, 5max', MAX_BET: 16, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$16 cap, R@5, 5max', MAX_BET: 16, LOSS_STREAK_RESET: 5, MAX_RESETS: 5 },
    { name: '$18 cap, R@4, 5max', MAX_BET: 18, LOSS_STREAK_RESET: 4, MAX_RESETS: 5 },
    { name: '$18 cap, R@5, 5max', MAX_BET: 18, LOSS_STREAK_RESET: 5, MAX_RESETS: 5 },
    // No reset at all
    { name: '$10 cap, no reset  ', MAX_BET: 10, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },
    { name: '$12 cap, no reset  ', MAX_BET: 12, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },
    { name: '$14 cap, no reset  ', MAX_BET: 14, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },
    { name: '$16 cap, no reset  ', MAX_BET: 16, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },
    { name: '$18 cap, no reset  ', MAX_BET: 18, LOSS_STREAK_RESET: Infinity, MAX_RESETS: 0 },
];

async function runBenchmark() {
    const engine = new AIAutoEngine();
    engine.train([testSpins]);

    console.log(`Fine benchmark: ${testSpins.length} spins, ${CONFIGS.length} configs\n`);

    const header = 'Config'.padEnd(24) +
        'Busts'.padStart(6) + '  ' +
        'Wins'.padStart(5) + '  ' +
        'Inc'.padStart(4) + '  ' +
        'Win%'.padStart(8) + '  ' +
        'AvgSpn'.padStart(7) + '  ' +
        'TotalP'.padStart(10) + '  ' +
        'AvgP'.padStart(7) + '  ' +
        'WinU30'.padStart(7) + '  ' +
        'WinU30%'.padStart(8);

    console.log(header);
    console.log('-'.repeat(header.length));

    for (const config of CONFIGS) {
        const runner = new AutoTestRunner(engine, {
            STARTING_BANKROLL: 4000, TARGET_PROFIT: 100, MIN_BET: 2,
            MAX_BET: config.MAX_BET,
            LOSS_STREAK_RESET: config.LOSS_STREAK_RESET,
            MAX_RESETS: config.MAX_RESETS,
            STOP_LOSS: 0
        });
        engine._retrainInterval = Infinity;
        engine._retrainLossStreak = Infinity;

        const result = await runner.runAll(testSpins, { testFile: 'bench' });

        const all = [...result.strategies[1].sessions, ...result.strategies[2].sessions, ...result.strategies[3].sessions];
        const wins = all.filter(s => s.outcome === 'WIN');
        const busts = all.filter(s => s.outcome === 'BUST');
        const inc = all.filter(s => s.outcome === 'INCOMPLETE');
        const totalP = all.reduce((s, x) => s + x.finalProfit, 0);
        const avgSpn = wins.length > 0 ? (wins.reduce((s, x) => s + x.totalSpins, 0) / wins.length) : 0;
        const winU30 = wins.filter(s => s.totalSpins <= 30);
        const decided = wins.length + busts.length;
        const winPct = decided > 0 ? ((wins.length / decided) * 100).toFixed(2) : 'N/A';

        console.log(
            config.name.padEnd(24) +
            String(busts.length).padStart(6) + '  ' +
            String(wins.length).padStart(5) + '  ' +
            String(inc.length).padStart(4) + '  ' +
            (winPct + '%').padStart(8) + '  ' +
            avgSpn.toFixed(1).padStart(7) + '  ' +
            ('$' + totalP.toLocaleString()).padStart(10) + '  ' +
            ('$' + (totalP / all.length).toFixed(0)).padStart(7) + '  ' +
            String(winU30.length).padStart(7) + '  ' +
            (wins.length > 0 ? ((winU30.length / wins.length) * 100).toFixed(1) + '%' : 'N/A').padStart(8)
        );
    }
}

runBenchmark().catch(console.error);
