#!/usr/bin/env node
/**
 * Sweep max consecutive skips and loss-streak-reset values.
 * These affect session flow during and outside recovery.
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
const testRaw = fs.readFileSync(path.join(dataDir, 'data17.txt'), 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'data17.txt').spins;
console.log(`Test data: ${testSpins.length} spins\n`);

const pad = (v, w) => String(v).padStart(w);

async function run(name, maxSkips, lossReset, maxResets) {
    const engine = new AIAutoEngine({ learningVersion: 'v2' });
    engine.train(trainFiles);
    engine.isEnabled = true;
    if (maxSkips !== null) engine.maxConsecutiveSkips = maxSkips;
    const runner = new AutoTestRunner(engine);
    const config = { maxBet: 10, lossStreakReset: lossReset, maxResets: maxResets };
    const result = await runner.runAll(testSpins, config);
    const s = result.strategies[1].summary;
    console.log(`${name.padEnd(40)}| ${pad(s.wins, 4)} | ${pad(s.incomplete, 3)} | ${pad(s.busts, 2)} | $${pad(s.totalProfit, 6)} | ${s.avgSpinsToWin}`);
}

console.log('Config                                  | Wins | Inc | Bu | Profit   | AvgSpins');
console.log('----------------------------------------|------|-----|----|----------|--------');

async function main() {
    // BASELINE
    await run('BASELINE (skip=3, reset=5, maxR=5)', null, 5, 5);

    // ─── MAX CONSECUTIVE SKIPS ───
    for (const ms of [1, 2, 4, 5, 6]) {
        await run(`maxSkips=${ms}`, ms, 5, 5);
    }

    // ─── LOSS STREAK RESET ───
    for (const lr of [3, 4, 6, 7, 8]) {
        await run(`lossReset=${lr}`, null, lr, 5);
    }

    // ─── MAX RESETS ───
    for (const mr of [3, 4, 6, 7, 8, 10]) {
        await run(`maxResets=${mr}`, null, 5, mr);
    }

    // ─── COMBOS ───
    await run('skip=2 + reset=6', 2, 6, 5);
    await run('skip=4 + reset=6', 4, 6, 5);
    await run('skip=2 + reset=4', 2, 4, 5);
    await run('skip=3 + reset=6 + maxR=7', null, 6, 7);
    await run('skip=3 + reset=7 + maxR=7', null, 7, 7);
    await run('skip=2 + reset=5 + maxR=7', 2, 5, 7);
    await run('skip=4 + reset=5 + maxR=7', 4, 5, 7);
}

main().catch(console.error);
