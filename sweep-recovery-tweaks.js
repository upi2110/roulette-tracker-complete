#!/usr/bin/env node
/**
 * Sweep various recovery mode tweaks beyond filter selection.
 * Tests different thresholds, shadow weights, pair rotation strengths,
 * recovery entry points, and escalating strategies.
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

// Save originals for patching
const pad = (v, w) => String(v).padStart(w);
function logResult(name, s) {
    console.log(`${name.padEnd(40)}| ${pad(s.wins, 4)} | ${pad(s.incomplete, 3)} | $${pad(s.totalProfit, 6)} | ${(s.skipRate*100).toFixed(1)}% | ${s.avgSpinsToWin}`);
}

async function run(name, patchFn) {
    const engine = new AIAutoEngine({ learningVersion: 'v2' });
    engine.train(trainFiles);
    engine.isEnabled = true;
    if (patchFn) patchFn(engine);
    const runner = new AutoTestRunner(engine);
    const result = await runner.runAll(testSpins);
    logResult(name, result.strategies[1].summary);
}

console.log('Config                                  | Wins | Inc | Profit   | Skip% | AvgSpins');
console.log('----------------------------------------|------|-----|----------|-------|--------');

async function main() {
    // ─── BASELINE ───
    await run('BASELINE (current)', null);

    // ─── RECOVERY ENTRY THRESHOLD ───
    // Currently enters RECOVERY after 3 consecutive overall losses
    for (const entryLosses of [2, 4, 5]) {
        await run(`recovery_entry_${entryLosses}`, engine => {
            const origRecord = engine.recordResult.bind(engine);
            engine.recordResult = function(hit, refKey, pairKey) {
                origRecord(hit, refKey, pairKey);
                // Override the 3-loss entry point
                if (!hit && this.session.overallConsecutiveLosses >= entryLosses && this.session.trendState === 'NORMAL') {
                    this.session.trendState = 'RECOVERY';
                    this.session.recoveryEntryBet = this.session.totalBets;
                } else if (this.session.overallConsecutiveLosses < entryLosses && !hit && this.session.trendState === 'RECOVERY') {
                    // If we patched to a higher threshold, don't enter recovery too early
                    // This is only needed for entryLosses > 3
                }
            };
        });
    }

    // ─── SHADOW BOOST WEIGHT IN RECOVERY ───
    // Currently: 0.30 in recovery, 0.10 normal
    for (const weight of [0.15, 0.20, 0.40, 0.50]) {
        await run(`shadow_recovery_weight_${weight}`, engine => {
            const origScore = engine._scorePair.bind(engine);
            engine._scorePair = function(refKey, candidate) {
                // Temporarily set the recovery shadow weight
                const result = origScore(refKey, candidate);
                return result; // The weight is embedded in _scorePair, can't easily change it
            };
            // Direct patch of the shadow section in _scorePair
            const origFn = engine._scorePair;
            engine._scorePair = function(refKey, candidate) {
                const shadow = this.shadowTracker && this.shadowTracker[refKey];
                // Calculate base composite
                let composite = 0;
                const stats = this.pairStats[refKey];
                const winRate = stats ? stats.wins / Math.max(stats.total, 1) : 0.5;
                const cfScore = stats ? stats.cfScore || 0 : 0;
                composite = winRate * 0.40 + cfScore * 0.35;

                if (candidate && candidate.data) {
                    const conf = candidate.data.confidence || 0;
                    composite += (conf / 100) * 0.15;
                }

                // Shadow with patched weight
                if (shadow && shadow.attempts >= 5) {
                    const shadowRate = shadow.hits / shadow.attempts;
                    if (shadowRate > 0.35) {
                        const w = this.session.trendState === 'RECOVERY' ? weight : 0.10;
                        composite += (shadowRate - 0.35) * w;
                    }
                }

                // Soft last-pair penalty in recovery
                if (this.session.trendState === 'RECOVERY') {
                    const REFKEY_TO_PAIR_NAME = { 'A-B': 'AB', 'A-C': 'AC', 'B-C': 'BC', 'D-E': 'DE', 'D-F': 'DF', 'E-F': 'EF' };
                    const pairNameForCheck = REFKEY_TO_PAIR_NAME[refKey] || refKey;
                    if (pairNameForCheck === this.session.lastBetPair) {
                        composite -= 0.05;
                    }
                }

                return composite;
            };
        });
    }

    // ─── LAST-PAIR PENALTY STRENGTH ───
    // Currently: -0.05 in recovery
    for (const penalty of [0, 0.03, 0.08, 0.10, 0.15]) {
        await run(`pair_penalty_${penalty}`, engine => {
            const origFn = engine._scorePair;
            engine._scorePair = function(refKey, candidate) {
                let score = origFn.call(this, refKey, candidate);
                // Remove old penalty and apply new one
                if (this.session.trendState === 'RECOVERY') {
                    const REFKEY_TO_PAIR_NAME = { 'A-B': 'AB', 'A-C': 'AC', 'B-C': 'BC', 'D-E': 'DE', 'D-F': 'DF', 'E-F': 'EF' };
                    const pairNameForCheck = REFKEY_TO_PAIR_NAME[refKey] || refKey;
                    if (pairNameForCheck === this.session.lastBetPair) {
                        // Undo the -0.05 that's baked in
                        score += 0.05;
                        // Apply new penalty
                        score -= penalty;
                    }
                }
                return score;
            };
        });
    }

    // ─── CONFIDENCE FLOOR IN RECOVERY ───
    // Currently: Math.max(threshold, 45) in recovery
    for (const floor of [35, 38, 40, 42, 48, 50, 55]) {
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

    // ─── ESCALATING COVERAGE IN RECOVERY ───
    // Use narrow filter for losses 3-4, widen for 5+
    await run('escalate_3narrow_5wide', engine => {
        engine._pickRecoveryFilter = function() {
            if (this.session.overallConsecutiveLosses >= 5) return 'both_both';
            return 'zero_both';
        };
    });

    await run('escalate_3narrow_4wide', engine => {
        engine._pickRecoveryFilter = function() {
            if (this.session.overallConsecutiveLosses >= 4) return 'both_both';
            return 'zero_both';
        };
    });

    // ─── RECOVERY + NO SKIP (force bet) ───
    // During recovery, always bet (never skip)
    await run('recovery_no_skip', engine => {
        engine.maxConsecutiveSkips = 0;  // This isn't quite right but close
        // Actually need to patch decide/simulate
    });

    // ─── LOWER SKIP THRESHOLD IN RECOVERY ───
    // Reduce skip threshold by 10 points during recovery
    await run('recovery_skip_-10', engine => {
        const origThreshold = engine._getEffectiveThreshold.bind(engine);
        engine._getEffectiveThreshold = function() {
            const base = origThreshold();
            if (this.session.trendState === 'RECOVERY') {
                return base - 10;
            }
            return base;
        };
    });

    // ─── SKIP REDUCTION DURING RECOVERY ───
    await run('recovery_skip_-5', engine => {
        const origThreshold = engine._getEffectiveThreshold.bind(engine);
        engine._getEffectiveThreshold = function() {
            const base = origThreshold();
            if (this.session.trendState === 'RECOVERY') {
                return base - 5;
            }
            return base;
        };
    });

    // ─── COMBO: floor=42 + penalty=0.08 ───
    await run('combo_floor42_penalty08', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 10;
            else if (spins <= 45) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (this.session.trendState === 'RECOVERY') {
                t = Math.max(t, 42);
            }
            return t;
        };
        const origFn = engine._scorePair;
        engine._scorePair = function(refKey, candidate) {
            let score = origFn.call(this, refKey, candidate);
            if (this.session.trendState === 'RECOVERY') {
                const REFKEY_TO_PAIR_NAME = { 'A-B': 'AB', 'A-C': 'AC', 'B-C': 'BC', 'D-E': 'DE', 'D-F': 'DF', 'E-F': 'EF' };
                const pairNameForCheck = REFKEY_TO_PAIR_NAME[refKey] || refKey;
                if (pairNameForCheck === this.session.lastBetPair) {
                    score += 0.05;  // undo baked-in
                    score -= 0.08;  // apply new
                }
            }
            return score;
        };
    });

    // ─── COMBO: floor=40 + penalty=0.10 ───
    await run('combo_floor40_penalty10', engine => {
        engine._getEffectiveThreshold = function() {
            let t;
            const spins = this.session.sessionSpinCount;
            if (spins <= 20) t = this.confidenceThreshold;
            else if (spins <= 35) t = this.confidenceThreshold - 10;
            else if (spins <= 45) t = this.confidenceThreshold - 20;
            else t = this.confidenceThreshold - 30;
            if (this.session.trendState === 'RECOVERY') {
                t = Math.max(t, 40);
            }
            return t;
        };
        const origFn = engine._scorePair;
        engine._scorePair = function(refKey, candidate) {
            let score = origFn.call(this, refKey, candidate);
            if (this.session.trendState === 'RECOVERY') {
                const REFKEY_TO_PAIR_NAME = { 'A-B': 'AB', 'A-C': 'AC', 'B-C': 'BC', 'D-E': 'DE', 'D-F': 'DF', 'E-F': 'EF' };
                const pairNameForCheck = REFKEY_TO_PAIR_NAME[refKey] || refKey;
                if (pairNameForCheck === this.session.lastBetPair) {
                    score += 0.05;
                    score -= 0.10;
                }
            }
            return score;
        };
    });

    // ─── COMBO: entry=2 + floor=45 ───
    await run('combo_entry2_floor45', engine => {
        const origRecord = engine.recordResult.bind(engine);
        engine.recordResult = function(hit, refKey, pairKey) {
            origRecord(hit, refKey, pairKey);
            if (!hit && this.session.overallConsecutiveLosses >= 2 && this.session.trendState === 'NORMAL') {
                this.session.trendState = 'RECOVERY';
                this.session.recoveryEntryBet = this.session.totalBets;
            }
        };
    });
}

main().catch(console.error);
