#!/usr/bin/env node
/**
 * Sweep recovery tweaks V2 — simpler, more reliable monkey-patching.
 * Only patches _getEffectiveThreshold (clean function) and the recovery
 * entry threshold in recordResult.
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

async function run(name, patchFn) {
    const engine = new AIAutoEngine({ learningVersion: 'v2' });
    engine.train(trainFiles);
    engine.isEnabled = true;
    if (patchFn) patchFn(engine);
    const runner = new AutoTestRunner(engine);
    const result = await runner.runAll(testSpins);
    const s = result.strategies[1].summary;
    console.log(`${name.padEnd(45)}| ${pad(s.wins, 4)} | ${pad(s.incomplete, 3)} | $${pad(s.totalProfit, 6)} | ${s.avgSpinsToWin}`);
}

console.log('Config                                       | Wins | Inc | Profit   | AvgSpins');
console.log('---------------------------------------------|------|-----|----------|--------');

async function main() {
    // ─── BASELINE ───
    await run('BASELINE (floor=45, penalty=0.05)', null);

    // ─── CONFIDENCE FLOOR SWEEP ───
    for (const floor of [35, 38, 40, 42, 43, 44, 46, 47, 48, 50, 55]) {
        await run(`conf_floor_${floor}`, engine => {
            engine._getEffectiveThreshold = function() {
                let t;
                const spins = this.session.sessionSpinCount;
                if (spins <= 20) t = this.confidenceThreshold;
                else if (spins <= 35) t = this.confidenceThreshold - 10;
                else if (spins <= 45) t = this.confidenceThreshold - 20;
                else t = this.confidenceThreshold - 30;
                if (this.session.trendState === 'RECOVERY') {
                    t = Math.max(t, floor);
                }
                return t;
            };
        });
    }

    // ─── NO RECOVERY FLOOR AT ALL ───
    await run('no_recovery_floor', engine => {
        engine._getEffectiveThreshold = function() {
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) return this.confidenceThreshold;
            else if (spins <= 35) return this.confidenceThreshold - 10;
            else if (spins <= 45) return this.confidenceThreshold - 20;
            else return this.confidenceThreshold - 30;
        };
    });

    // ─── ESCALATING FLOOR ───
    // Floor gets higher as losses pile up
    await run('escalate_floor_40_45_50', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 10;
            else if (spins <= 45) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (this.session.trendState === 'RECOVERY') {
                const losses = this.session.overallConsecutiveLosses;
                if (losses >= 5) t = Math.max(t, 50);
                else if (losses >= 4) t = Math.max(t, 45);
                else t = Math.max(t, 40);
            }
            return t;
        };
    });

    await run('escalate_floor_42_47_52', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 10;
            else if (spins <= 45) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (this.session.trendState === 'RECOVERY') {
                const losses = this.session.overallConsecutiveLosses;
                if (losses >= 5) t = Math.max(t, 52);
                else if (losses >= 4) t = Math.max(t, 47);
                else t = Math.max(t, 42);
            }
            return t;
        };
    });

    // ─── DIFFERENT SESSION URGENCY SCHEDULE ───
    // Try less aggressive urgency ramp-down
    await run('slow_urgency (25/40/50 instead 20/35/45)', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 25) t = this.confidenceThreshold;
            else if (spins <= 40) t = this.confidenceThreshold - 10;
            else if (spins <= 50) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (this.session.trendState === 'RECOVERY') {
                t = Math.max(t, 45);
            }
            return t;
        };
    });

    await run('fast_urgency (15/30/40 instead 20/35/45)', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 15) t = this.confidenceThreshold;
            else if (spins <= 30) t = this.confidenceThreshold - 10;
            else if (spins <= 40) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (this.session.trendState === 'RECOVERY') {
                t = Math.max(t, 45);
            }
            return t;
        };
    });

    // ─── WIDER URGENCY DROPS ───
    await run('bigger_drops (-15/-25/-35 vs -10/-20/-30)', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 15;
            else if (spins <= 45) t = this.confidenceThreshold - 25;
            else t = this.confidenceThreshold - 35;
            if (this.session.trendState === 'RECOVERY') {
                t = Math.max(t, 45);
            }
            return t;
        };
    });

    await run('smaller_drops (-5/-15/-25 vs -10/-20/-30)', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 5;
            else if (spins <= 45) t = this.confidenceThreshold - 15;
            else t = this.confidenceThreshold - 25;
            if (this.session.trendState === 'RECOVERY') {
                t = Math.max(t, 45);
            }
            return t;
        };
    });

    // ─── RECOVERY FILTER: escalate from zero_both to both_both ───
    await run('filter_escalate_5losses', engine => {
        engine._pickRecoveryFilter = function() {
            if (this.session.overallConsecutiveLosses >= 5) return 'both_both';
            return 'zero_both';
        };
    });

    await run('filter_escalate_4losses', engine => {
        engine._pickRecoveryFilter = function() {
            if (this.session.overallConsecutiveLosses >= 4) return 'both_both';
            return 'zero_both';
        };
    });

    // ─── COMBO: floor=45 + escalate_5 ───
    await run('combo_floor45_escalate5', engine => {
        engine._pickRecoveryFilter = function() {
            if (this.session.overallConsecutiveLosses >= 5) return 'both_both';
            return 'zero_both';
        };
    });
}

main().catch(console.error);
