#!/usr/bin/env node
/**
 * Run engine test on given test data file, output comparable results.
 */
const fs = require('fs');
const path = require('path');
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
    const fp = path.join(dataDir, `data${i}.txt`);
    if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf-8');
        trainFiles.push(dataLoader.parseTextContent(raw, `data${i}.txt`).spins);
    }
}

const testFile = process.argv[2];
if (!testFile) { console.error('Usage: node compare-reports.js <test-file>'); process.exit(1); }

const testRaw = fs.readFileSync(testFile, 'utf-8');
const testData = dataLoader.parseTextContent(testRaw, path.basename(testFile));
const testSpins = testData.spins;

console.log(`\n══════════════════════════════════════════════════════`);
console.log(`  ENGINE TEST: ${path.basename(testFile)}`);
console.log(`  Spins: ${testSpins.length} | Trained on: ${trainFiles.length} files`);
console.log(`══════════════════════════════════════════════════════\n`);

async function main() {
    const engine = new AIAutoEngine({ learningVersion: 'v2' });
    engine.train(trainFiles);
    engine.isEnabled = true;

    const runner = new AutoTestRunner(engine);
    const result = await runner.runAll(testSpins);

    for (const [stratIdx, stratData] of Object.entries(result.strategies)) {
        const s = stratData.summary;
        console.log(`Strategy ${stratIdx} (${stratData.name}):`);
        console.log(`  Sessions:    ${s.sessions}`);
        console.log(`  Wins:        ${s.wins}`);
        console.log(`  Busts:       ${s.busts}`);
        console.log(`  Incomplete:  ${s.incomplete}`);
        console.log(`  Win Rate:    ${s.winRate}`);
        console.log(`  Total Profit: $${s.totalProfit}`);
        console.log(`  Avg Profit:  $${s.avgProfit}`);
        console.log(`  Avg Spins:   ${s.avgSpinsToWin}`);
        console.log(`  Max Spins:   ${s.maxSpins}`);
        console.log(`  Max Drawdown: $${s.maxDrawdown}`);
        console.log(`  Skip Rate:   ${(s.skipRate*100).toFixed(1)}%`);
        console.log();
    }

    // Detailed session breakdown for Strategy 1
    const s1Sessions = result.strategies[1].sessions;
    const wins = s1Sessions.filter(s => s.outcome === 'WIN');
    const busts = s1Sessions.filter(s => s.outcome === 'BUST');
    const incomplete = s1Sessions.filter(s => s.outcome === 'INCOMPLETE');

    console.log(`── Strategy 1 Session Details ──`);
    console.log(`Total sessions: ${s1Sessions.length}`);

    // Win analysis
    if (wins.length > 0) {
        const winSpins = wins.map(s => s.totalSpins);
        winSpins.sort((a,b) => a-b);
        const avg = winSpins.reduce((a,b) => a+b, 0) / winSpins.length;
        const p50 = winSpins[Math.floor(winSpins.length * 0.50)];
        const p90 = winSpins[Math.floor(winSpins.length * 0.90)];
        const p95 = winSpins[Math.floor(winSpins.length * 0.95)];
        console.log(`\nWin sessions (${wins.length}):`);
        console.log(`  Avg spins: ${avg.toFixed(1)}, Median: ${p50}, P90: ${p90}, P95: ${p95}`);
        console.log(`  Min: ${winSpins[0]}, Max: ${winSpins[winSpins.length-1]}`);

        const winProfits = wins.map(s => s.finalProfit);
        const avgProfit = winProfits.reduce((a,b) => a+b, 0) / winProfits.length;
        console.log(`  Avg profit per win: $${avgProfit.toFixed(0)}`);
    }

    // Incomplete analysis
    if (incomplete.length > 0) {
        console.log(`\nIncomplete sessions (${incomplete.length}):`);
        const incSpins = incomplete.map(s => s.totalSpins);
        incSpins.sort((a,b) => a-b);
        console.log(`  Spins: min=${incSpins[0]}, max=${incSpins[incSpins.length-1]}, avg=${(incSpins.reduce((a,b)=>a+b,0)/incSpins.length).toFixed(1)}`);
        const incProfits = incomplete.map(s => s.finalProfit);
        const profitPos = incProfits.filter(p => p > 0).length;
        const profitNeg = incProfits.filter(p => p < 0).length;
        const profitZero = incProfits.filter(p => p === 0).length;
        console.log(`  Profit: positive=${profitPos}, negative=${profitNeg}, zero=${profitZero}`);
        console.log(`  Total incomplete profit: $${incProfits.reduce((a,b)=>a+b,0)}`);
    }

    // First 10 sessions detailed
    console.log(`\nFirst 10 sessions (for cross-check with report):`);
    console.log(`  # | StartIdx | Outcome    | Spins | Bets | Wins | Losses | WinRate | Profit | MaxDD`);
    s1Sessions.slice(0, 10).forEach((s, i) => {
        const bets = s.steps.filter(st => st.action === 'BET').length;
        const w = s.steps.filter(st => st.action === 'BET' && st.hit).length;
        const l = bets - w;
        const wr = bets > 0 ? (w/bets*100).toFixed(1) : '0.0';
        console.log(`  ${String(i+1).padStart(2)} | ${String(s.startIdx).padStart(8)} | ${s.outcome.padEnd(10)} | ${String(s.totalSpins).padStart(5)} | ${String(bets).padStart(4)} | ${String(w).padStart(4)} | ${String(l).padStart(6)} | ${wr.padStart(6)}% | $${String(s.finalProfit).padStart(6)} | $${String(s.maxDrawdown || 0).padStart(6)}`);
    });

    // Last 10 sessions detailed
    console.log(`\nLast 10 sessions (for cross-check with report):`);
    const lastSessions = s1Sessions.slice(-10);
    lastSessions.forEach((s, i) => {
        const idx = s1Sessions.length - 10 + i;
        const bets = s.steps.filter(st => st.action === 'BET').length;
        const w = s.steps.filter(st => st.action === 'BET' && st.hit).length;
        const l = bets - w;
        const wr = bets > 0 ? (w/bets*100).toFixed(1) : '0.0';
        console.log(`  ${String(idx+1).padStart(3)} | ${String(s.startIdx).padStart(8)} | ${s.outcome.padEnd(10)} | ${String(s.totalSpins).padStart(5)} | ${String(bets).padStart(4)} | ${String(w).padStart(4)} | ${String(l).padStart(6)} | ${wr.padStart(6)}% | $${String(s.finalProfit).padStart(6)} | $${String(s.maxDrawdown || 0).padStart(6)}`);
    });
}

main().catch(e => { console.error(e); process.exit(1); });
