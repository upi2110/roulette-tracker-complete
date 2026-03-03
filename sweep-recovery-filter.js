#!/usr/bin/env node
/**
 * Sweep different recovery filter strategies.
 * Tests multiple approaches to find what works best in RECOVERY mode.
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

// Each strategy is a function(engine, recentSpins, combinedNumbers) => filterKey
const STRATEGIES = {
    'static_zero_both': () => 'zero_both',

    'static_nineteen_both': () => 'nineteen_both',

    'static_both_positive': () => 'both_positive',

    'static_zero_positive': () => 'zero_positive',

    'trend_table': (engine, recentSpins) => {
        // Follow the dominant table from last 3 spins
        const last3 = recentSpins.slice(-3);
        const zeroNums = engine._getZeroTableNums();
        let zc = 0, nc = 0;
        for (const n of last3) { if (zeroNums.has(n)) zc++; else nc++; }
        return zc >= nc ? 'zero_both' : 'nineteen_both';
    },

    'counter_table': (engine, recentSpins) => {
        // COUNTER the dominant table (if mostly zero, bet nineteen — mean reversion)
        const last3 = recentSpins.slice(-3);
        const zeroNums = engine._getZeroTableNums();
        let zc = 0, nc = 0;
        for (const n of last3) { if (zeroNums.has(n)) zc++; else nc++; }
        return zc > nc ? 'nineteen_both' : 'zero_both';
    },

    'trend_sign': (engine, recentSpins) => {
        // Follow the dominant sign from last 3 spins
        const last3 = recentSpins.slice(-3);
        const posNums = engine._getPositiveNums();
        let pc = 0, nc = 0;
        for (const n of last3) { if (posNums.has(n)) pc++; else nc++; }
        return pc >= nc ? 'both_positive' : 'both_negative';
    },

    'counter_sign': (engine, recentSpins) => {
        // Counter the dominant sign (mean reversion)
        const last3 = recentSpins.slice(-3);
        const posNums = engine._getPositiveNums();
        let pc = 0, nc = 0;
        for (const n of last3) { if (posNums.has(n)) pc++; else nc++; }
        return pc > nc ? 'both_negative' : 'both_positive';
    },

    'retro_hit_best': (engine, recentSpins, combinedNumbers) => {
        // Pick the filter that would have caught the most recent actual results
        const last3 = recentSpins.slice(-3);
        const candidates = ['zero_both', 'nineteen_both', 'both_positive', 'both_negative',
                           'zero_positive', 'zero_negative', 'nineteen_positive', 'nineteen_negative'];
        let bestFilter = 'zero_both', bestScore = -1;
        for (const fk of candidates) {
            const filtered = engine._applyFilterToNumbers(combinedNumbers, fk);
            if (filtered.length < 4) continue;
            let retroHits = 0;
            for (const n of last3) { if (filtered.includes(n)) retroHits++; }
            const score = retroHits * 100 + filtered.length;
            if (score > bestScore) { bestScore = score; bestFilter = fk; }
        }
        return bestFilter;
    },

    'zero_both_or_wider': (engine, recentSpins, combinedNumbers) => {
        // Use zero_both normally, but if last 3 spins were all nineteen, use both_both
        const last3 = recentSpins.slice(-3);
        const zeroNums = engine._getZeroTableNums();
        let zc = 0;
        for (const n of last3) { if (zeroNums.has(n)) zc++; }
        return zc === 0 ? 'both_both' : 'zero_both';
    },

    'zero_bias_adaptive': (engine, recentSpins, combinedNumbers) => {
        // Start with zero_both, only switch to nineteen_both if ALL 3 last spins are nineteen
        const last3 = recentSpins.slice(-3);
        const nineNums = engine._getNineteenTableNums();
        let allNineteen = last3.length >= 3;
        for (const n of last3) { if (!nineNums.has(n)) { allNineteen = false; break; } }
        return allNineteen ? 'nineteen_both' : 'zero_both';
    },

    'shadow_guided': (engine, recentSpins, combinedNumbers) => {
        // Use shadow tracking data to pick filter: test each filter's simulated hit rate
        const candidates = ['zero_both', 'nineteen_both', 'both_positive', 'both_negative'];
        let bestFilter = 'zero_both', bestRate = -1;
        for (const fk of candidates) {
            const filtered = engine._applyFilterToNumbers(combinedNumbers, fk);
            if (filtered.length < 4) continue;
            // Use coverage ratio as proxy for hit rate
            const coverageRate = filtered.length / 37;
            if (coverageRate > bestRate) { bestRate = coverageRate; bestFilter = fk; }
        }
        return bestFilter;
    },

    'alternating': (engine) => {
        // Alternate between zero_both and nineteen_both on each recovery decision
        const losses = engine.session.overallConsecutiveLosses || 0;
        return losses % 2 === 1 ? 'zero_both' : 'nineteen_both';
    },
};

console.log('Strategy                | Wins | Incomplete | Profit   | Skip%');
console.log('------------------------|------|------------|----------|------');

async function main() {
    for (const [name, strategyFn] of Object.entries(STRATEGIES)) {
        const engine = new AIAutoEngine({ learningVersion: 'v2' });
        engine.train(trainFiles);
        engine.isEnabled = true;

        // Monkey-patch _pickRecoveryFilter to use this strategy
        engine._pickRecoveryFilter = function(recentSpins, combinedNumbers) {
            return strategyFn(this, recentSpins, combinedNumbers);
        };

        const runner = new AutoTestRunner(engine);
        const result = await runner.runAll(testSpins);
        const s = result.strategies[1].summary;

        const pad = (v, w) => String(v).padStart(w);
        console.log(`${name.padEnd(24)}| ${pad(s.wins, 4)} |        ${pad(s.incomplete, 3)} | $${pad(s.totalProfit, 6)} | ${(s.skipRate*100).toFixed(1)}%`);
    }
}
main().catch(console.error);
