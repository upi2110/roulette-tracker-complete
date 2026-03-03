#!/usr/bin/env node
/**
 * Analyze which table/sign/set combinations produce the best hit rates
 * across all decisions. Especially during recovery (3+ consecutive losses).
 */
const fs = require('fs');
const path = require('path');

// Load renderer functions into global scope
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
const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;');
fn();

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AIDataLoader } = require('./app/ai-data-loader');

const engine = new AIAutoEngine({ learningVersion: 'v2' });
const dataLoader = new AIDataLoader();

// Train on data1-16
const dataDir = path.join(__dirname, 'app', 'data');
const trainFiles = [];
for (let i = 1; i <= 16; i++) {
    const fp = path.join(dataDir, `data${i}.txt`);
    if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = dataLoader.parseTextContent(raw, `data${i}.txt`);
        trainFiles.push(parsed.spins);
    }
}
engine.train(trainFiles);
engine.isEnabled = true;

// Load test data (data17.txt)
const testRaw = fs.readFileSync(path.join(dataDir, 'data17.txt'), 'utf-8');
const testData = dataLoader.parseTextContent(testRaw, 'data17.txt').spins;

console.log(`Trained on ${trainFiles.length} files, test data: ${testData.length} spins`);

// Filters to analyze
const FILTERS = [
    { key: 'zero_positive', table: 'zero', sign: 'positive', set: 'all' },
    { key: 'zero_negative', table: 'zero', sign: 'negative', set: 'all' },
    { key: 'zero_both', table: 'zero', sign: 'both', set: 'all' },
    { key: 'nineteen_positive', table: 'nineteen', sign: 'positive', set: 'all' },
    { key: 'nineteen_negative', table: 'nineteen', sign: 'negative', set: 'all' },
    { key: 'nineteen_both', table: 'nineteen', sign: 'both', set: 'all' },
    { key: 'both_positive', table: 'both', sign: 'positive', set: 'all' },
    { key: 'both_negative', table: 'both', sign: 'negative', set: 'all' },
    { key: 'both_both', table: 'both', sign: 'both', set: 'all' },
    { key: 'both_both_set0', table: 'both', sign: 'both', set: 'set0' },
    { key: 'both_both_set5', table: 'both', sign: 'both', set: 'set5' },
    { key: 'both_both_set6', table: 'both', sign: 'both', set: 'set6' },
];

// Stats collectors
const allStats = {};
const recoveryStats = {};
FILTERS.forEach(f => {
    allStats[f.key] = { attempts: 0, hits: 0, totalNums: 0 };
    recoveryStats[f.key] = { attempts: 0, hits: 0, totalNums: 0 };
});

let totalDecisions = 0, engineHits = 0, recoveryDecisions = 0;

// Scan test data in overlapping sessions
for (let startIdx = 0; startIdx < testData.length - 20; startIdx += 5) {
    engine.resetSession();
    let consecutiveLosses = 0;
    const sessionSpins = testData.slice(startIdx);

    for (let i = 3; i < Math.min(sessionSpins.length - 1, 40); i++) {
        const spins = sessionSpins.slice(0, i + 1);
        engine._currentDecisionSpins = spins;
        engine._resolvePendingShadow(spins, i);

        const flashingPairs = engine._getFlashingPairsFromHistory(spins, i);
        let t3Numbers = [], bestPair = null;
        if (flashingPairs.size > 0) {
            const cands = [];
            for (const [refKey] of flashingPairs) {
                const proj = engine._computeProjectionForPair(spins, i, refKey);
                if (proj && proj.numbers.length > 0) cands.push({ refKey, numbers: proj.numbers, data: proj });
            }
            if (cands.length > 0) {
                const scored = cands.map(c => ({ ...c, score: engine._scorePair(c.refKey, c) }));
                scored.sort((a, b) => b.score - a.score);
                bestPair = scored[0];
                t3Numbers = bestPair.numbers;
            }
        }

        const t2Data = engine.simulateT2FlashAndNumbers(spins, i);
        const t2Numbers = t2Data ? t2Data.numbers : [];
        if (t3Numbers.length === 0 && t2Numbers.length === 0) {
            engine._currentDecisionSpins = null;
            continue;
        }

        const combined = Array.from(new Set([...t3Numbers, ...t2Numbers]));
        const nextActual = sessionSpins[i + 1];
        engine._storeShadowProjections(spins, i, flashingPairs, t2Data);
        engine._currentDecisionSpins = null;

        totalDecisions++;

        // Engine's choice
        const recent = spins.slice(Math.max(0, i - 10), i);
        const engineSet = engine._predictBestSet(combined, recent);
        const engineFiltered = engine._applyFilterToNumbers(combined, engineSet.filterKey);
        const engineHit = engineFiltered.includes(nextActual);
        if (engineHit) engineHits++;

        const inRecovery = consecutiveLosses >= 3;
        if (inRecovery) recoveryDecisions++;

        // Test all filters
        for (const fc of FILTERS) {
            const filtered = engine._applyFilterToNumbers(combined, fc.key);
            if (filtered.length < 2) continue;

            const hit = filtered.includes(nextActual);
            allStats[fc.key].attempts++;
            allStats[fc.key].totalNums += filtered.length;
            if (hit) allStats[fc.key].hits++;

            if (inRecovery) {
                recoveryStats[fc.key].attempts++;
                recoveryStats[fc.key].totalNums += filtered.length;
                if (hit) recoveryStats[fc.key].hits++;
            }
        }

        if (engineHit) consecutiveLosses = 0;
        else consecutiveLosses++;
    }
}

// Report
console.log(`\n═══════ ALL DECISIONS (${totalDecisions}) ═══════`);
console.log(`Engine hit rate: ${(engineHits/totalDecisions*100).toFixed(1)}%\n`);

const sorted = Object.entries(allStats)
    .filter(([, s]) => s.attempts > 50)
    .map(([k, s]) => ({ key: k, rate: s.hits/s.attempts, avg: s.totalNums/s.attempts, ...s }))
    .sort((a, b) => b.rate - a.rate);
for (const f of sorted) {
    console.log(`  ${f.key.padEnd(22)} ${(f.rate*100).toFixed(1)}% hit (${f.hits}/${f.attempts})  avg ${f.avg.toFixed(1)} nums`);
}

console.log(`\n═══════ RECOVERY ONLY (${recoveryDecisions} decisions during 3+ loss streak) ═══════`);
const recSorted = Object.entries(recoveryStats)
    .filter(([, s]) => s.attempts > 10)
    .map(([k, s]) => ({ key: k, rate: s.hits/s.attempts, avg: s.totalNums/s.attempts, ...s }))
    .sort((a, b) => b.rate - a.rate);
for (const f of recSorted) {
    const marker = f.rate > 0.35 ? ' ★' : '';
    console.log(`  ${f.key.padEnd(22)} ${(f.rate*100).toFixed(1)}% hit (${f.hits}/${f.attempts})  avg ${f.avg.toFixed(1)} nums${marker}`);
}

// Dimensional summary for recovery
console.log(`\n── Recovery: Table Dimension ──`);
const tableDim = { zero: {a:0,h:0}, nineteen: {a:0,h:0}, both: {a:0,h:0} };
for (const fc of FILTERS) {
    const s = recoveryStats[fc.key];
    if (s.attempts > 0) { tableDim[fc.table].a += s.attempts; tableDim[fc.table].h += s.hits; }
}
for (const [t, s] of Object.entries(tableDim)) {
    if (s.a > 0) console.log(`  ${t.padEnd(12)} ${(s.h/s.a*100).toFixed(1)}% hit`);
}

console.log(`\n── Recovery: Sign Dimension ──`);
const signDim = { positive: {a:0,h:0}, negative: {a:0,h:0}, both: {a:0,h:0} };
for (const fc of FILTERS) {
    const s = recoveryStats[fc.key];
    if (s.attempts > 0) { signDim[fc.sign].a += s.attempts; signDim[fc.sign].h += s.hits; }
}
for (const [t, s] of Object.entries(signDim)) {
    if (s.a > 0) console.log(`  ${t.padEnd(12)} ${(s.h/s.a*100).toFixed(1)}% hit`);
}

console.log(`\n── Recovery: Set Dimension ──`);
const setDim = { all: {a:0,h:0}, set0: {a:0,h:0}, set5: {a:0,h:0}, set6: {a:0,h:0} };
for (const fc of FILTERS) {
    const s = recoveryStats[fc.key];
    const setKey = fc.set || 'all';
    if (s.attempts > 0) { setDim[setKey].a += s.attempts; setDim[setKey].h += s.hits; }
}
for (const [t, s] of Object.entries(setDim)) {
    if (s.a > 0) console.log(`  ${t.padEnd(12)} ${(s.h/s.a*100).toFixed(1)}% hit`);
}
