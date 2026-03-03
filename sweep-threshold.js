#!/usr/bin/env node
/**
 * Sweep recovery confidence floor to find optimal value.
 * Tests multiple threshold values in sequence.
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

// Test multiple threshold values
const thresholds = [43, 44, 45, 46, 47];
console.log(`Sweeping recovery confidence floor: ${thresholds.join(', ')}`);
console.log(`Test data: ${testSpins.length} spins\n`);

console.log('Floor | Wins | Incomplete | Profit   | Skip%');
console.log('------|------|------------|----------|------');

async function main() {
    for (const floor of thresholds) {
        const engine = new AIAutoEngine({ learningVersion: 'v2' });
        engine.train(trainFiles);
        engine.isEnabled = true;

        // Monkey-patch the recovery floor
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 10;
            else if (spins <= 45) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (floor > 0 && this.session.trendState === 'RECOVERY') {
                t = Math.max(t, floor);
            }
            return t;
        };

        const runner = new AutoTestRunner(engine);
        const result = await runner.runAll(testSpins);
        const s = result.strategies[1].summary;

        const pad = (v, w) => String(v).padStart(w);
        console.log(`  ${pad(floor, 3)}  | ${pad(s.wins, 4)} |        ${pad(s.incomplete, 3)} | $${pad(s.totalProfit, 6)} | ${(s.skipRate*100).toFixed(1)}%`);
    }
}
main().catch(console.error);
