#!/usr/bin/env node
/**
 * VERIFICATION — Confirm the new default config ($10 cap, R@5) matches benchmark
 * Tests that the DEFAULT config (no sessionConfig override) produces the expected results
 */

const fs = require('fs');
const path = require('path');

// Bootstrap
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

async function verify() {
    // Train engine on historical data
    const engine = new AIAutoEngine();
    suppress = true;
    engine.train(trainingSessions);
    suppress = false;

    // Create runner with DEFAULT config (should now be R@5)
    const runner = new AutoTestRunner(engine);
    origLog(`Default config: MAX_BET=${runner._sessionConfig.MAX_BET}, LOSS_STREAK_RESET=${runner._sessionConfig.LOSS_STREAK_RESET}, MAX_RESETS=${runner._sessionConfig.MAX_RESETS}`);
    origLog(`Training: ${loadResult.totalSpins} spins from ${dataFiles.length} files`);
    origLog(`Testing: ${testSpins.length} spins from test_data2.txt\n`);

    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;
    suppress = true;
    const result = await runner.runAll(testSpins, { testFile: 'test_data2.txt' });
    suppress = false;

    // Results
    origLog('═══════════════════════════════════════════════════════');
    origLog('  VERIFICATION: New Default Config ($10 cap, R@5, 5max)');
    origLog('═══════════════════════════════════════════════════════\n');

    for (const sn of [1, 2, 3]) {
        const s = result.strategies[sn].summary;
        const sessions = result.strategies[sn].sessions;
        const totalP = sessions.reduce((a, x) => a + x.finalProfit, 0);
        const wins = sessions.filter(x => x.outcome === 'WIN');
        const inc = sessions.filter(x => x.outcome === 'INCOMPLETE');
        const winsU30 = wins.filter(x => x.totalSpins <= 30);

        origLog(`Strategy ${sn} (${['', 'Aggressive', 'Conservative', 'Cautious'][sn]}):`);
        origLog(`  Sessions: ${s.totalSessions} | Wins: ${s.wins} | Busts: ${s.busts} | Incomplete: ${s.incomplete}`);
        origLog(`  Win Rate: ${(s.winRate * 100).toFixed(1)}% | Avg Spins to Win: ${s.avgSpinsToWin}`);
        origLog(`  Total Profit: $${totalP.toLocaleString()} | Avg Profit/Session: $${(totalP/sessions.length).toFixed(0)}`);
        origLog(`  Wins under 30 spins: ${winsU30.length}/${wins.length} (${(winsU30.length/wins.length*100).toFixed(1)}%)`);
        origLog(`  Avg WIN profit: $${(wins.reduce((a,x)=>a+x.finalProfit,0)/wins.length).toFixed(0)}`);
        origLog(`  Avg INC loss: $${(inc.reduce((a,x)=>a+x.finalProfit,0)/(inc.length||1)).toFixed(0)}`);
        origLog('');
    }

    // Grand totals
    const allSessions = [...result.strategies[1].sessions, ...result.strategies[2].sessions, ...result.strategies[3].sessions];
    const totalBusts = allSessions.filter(s => s.outcome === 'BUST').length;
    const totalWins = allSessions.filter(s => s.outcome === 'WIN').length;
    const totalInc = allSessions.filter(s => s.outcome === 'INCOMPLETE').length;
    const totalProfit = allSessions.reduce((a, x) => a + x.finalProfit, 0);
    const allWins = allSessions.filter(s => s.outcome === 'WIN');
    const avgSpins = allWins.reduce((a, x) => a + x.totalSpins, 0) / allWins.length;
    const winsU30 = allWins.filter(x => x.totalSpins <= 30);

    origLog('═══ GRAND TOTALS ═══');
    origLog(`Total Sessions: ${allSessions.length}`);
    origLog(`Busts: ${totalBusts} | Wins: ${totalWins} | Incomplete: ${totalInc}`);
    origLog(`Win Rate (decided): ${totalBusts + totalWins > 0 ? ((totalWins/(totalWins+totalBusts))*100).toFixed(2) : 'N/A'}%`);
    origLog(`Total Profit: $${totalProfit.toLocaleString()}`);
    origLog(`Avg Spins to Win: ${avgSpins.toFixed(1)}`);
    origLog(`Wins under 30 spins: ${winsU30.length}/${totalWins} (${(winsU30.length/totalWins*100).toFixed(1)}%)`);

    // Compare with old R@3
    origLog('\n═══ COMPARISON ═══');
    origLog('OLD (R@3): $5,322 profit, 1 bust, 13.9 avg spins, 231 incomplete');
    origLog(`NEW (R@5): $${totalProfit.toLocaleString()} profit, ${totalBusts} bust(s), ${avgSpins.toFixed(1)} avg spins, ${totalInc} incomplete`);
    origLog(`IMPROVEMENT: $${(totalProfit - 5322).toLocaleString()} more profit, ${totalInc < 231 ? 231 - totalInc : 0} fewer incomplete sessions`);

    // Bust detail
    if (totalBusts > 0) {
        origLog('\nBust sessions:');
        for (const s of allSessions.filter(x => x.outcome === 'BUST')) {
            origLog(`  StartIdx: ${s.startIdx}, Strategy: ${s.strategy}, Profit: $${s.finalProfit}, Spins: ${s.totalSpins}, Hit Rate: ${(s.winRate * 100).toFixed(1)}%`);
        }
    }
}

verify().catch(e => origLog('Error: ' + e.message + '\n' + e.stack));
