#!/usr/bin/env node
/**
 * Sweep stop-loss values (200, 300, 400, 500) across multiple test datasets.
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

// Test datasets
const testFiles = [
    { name: 'data17.txt', path: path.join(dataDir, 'data17.txt') },
    { name: 'test_data2.txt', path: '/Users/ubusan-nb-ecr/Desktop/test_data2.txt' },
    { name: 'test_data3.txt', path: '/Users/ubusan-nb-ecr/Desktop/test_data3.txt' },
];

const stopLossValues = [0, 200, 300, 400, 500];
const pad = (v, w) => String(v).padStart(w);

async function main() {
    for (const tf of testFiles) {
        const raw = fs.readFileSync(tf.path, 'utf-8');
        const testSpins = dataLoader.parseTextContent(raw, tf.name).spins;

        console.log(`\n${'═'.repeat(80)}`);
        console.log(`  ${tf.name} (${testSpins.length} spins) — Strategy 1 (Aggressive)`);
        console.log(`${'═'.repeat(80)}`);
        console.log(`StopLoss | Sess | Wins | Busts | Inc | WinRate  | TotalProfit | AvgProfit | AvgSpins | MaxDD`);
        console.log(`---------|------|------|-------|-----|---------|------------|-----------|----------|------`);

        for (const sl of stopLossValues) {
            const engine = new AIAutoEngine({ learningVersion: 'v2' });
            engine.train(trainFiles);
            engine.isEnabled = true;

            const runner = new AutoTestRunner(engine, {
                STARTING_BANKROLL: 4000,
                TARGET_PROFIT: 100,
                MIN_BET: 2,
                MAX_BET: 10,
                LOSS_STREAK_RESET: 5,
                MAX_RESETS: 5,
                STOP_LOSS: sl,
                MAX_SESSION_SPINS: 60,
            });

            const result = await runner.runAll(testSpins);
            const s = result.strategies[1].summary;

            const decided = s.wins + s.busts;
            const winRate = decided > 0 ? (s.wins / decided * 100).toFixed(1) + '%' : 'N/A';

            console.log(
                `  $${pad(sl, 4)}  | ${pad(s.wins + s.busts + s.incomplete, 4)} | ${pad(s.wins, 4)} | ${pad(s.busts, 5)} | ${pad(s.incomplete, 3)} | ${winRate.padStart(7)} | $${pad(s.totalProfit, 9)} | $${pad(s.avgProfit, 8)} | ${pad(s.avgSpinsToWin, 8)} | $${pad(s.maxDrawdown, 5)}`
            );
        }
    }

    // ── Detailed breakdown for each stop-loss on all datasets ──
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log(`  DETAILED: Bust Session Analysis (where stop-loss triggers)`);
    console.log(`${'═'.repeat(80)}`);

    for (const tf of testFiles) {
        const raw = fs.readFileSync(tf.path, 'utf-8');
        const testSpins = dataLoader.parseTextContent(raw, tf.name).spins;

        for (const sl of [200, 300, 400, 500]) {
            const engine = new AIAutoEngine({ learningVersion: 'v2' });
            engine.train(trainFiles);
            engine.isEnabled = true;

            const runner = new AutoTestRunner(engine, {
                STARTING_BANKROLL: 4000,
                TARGET_PROFIT: 100,
                MIN_BET: 2,
                MAX_BET: 10,
                LOSS_STREAK_RESET: 5,
                MAX_RESETS: 5,
                STOP_LOSS: sl,
                MAX_SESSION_SPINS: 60,
            });

            const result = await runner.runAll(testSpins);
            const sessions = result.strategies[1].sessions;
            const busts = sessions.filter(s => s.outcome === 'BUST');
            const incomplete = sessions.filter(s => s.outcome === 'INCOMPLETE');

            if (busts.length > 0) {
                console.log(`\n${tf.name} | StopLoss=$${sl} → ${busts.length} BUST sessions:`);
                busts.slice(0, 10).forEach(b => {
                    console.log(`  Start ${pad(b.startIdx, 3)}: ${pad(b.totalSpins, 2)} spins, profit=$${b.finalProfit}, maxDD=$${b.maxDrawdown}`);
                });
                if (busts.length > 10) console.log(`  ... and ${busts.length - 10} more`);

                // How many busts would have eventually WON without stop-loss?
                const bustProfits = busts.map(b => b.finalProfit);
                console.log(`  Bust profit range: $${Math.min(...bustProfits)} to $${Math.max(...bustProfits)}`);
                console.log(`  Total lost to busts: $${bustProfits.reduce((a,b) => a+b, 0)}`);
            }
        }
    }
}

main().catch(console.error);
