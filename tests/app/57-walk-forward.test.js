/**
 * Tests for walk-forward-runner.js — Session boundary, diagnostics, integration
 *
 * 57-walk-forward.test.js
 *
 * Uses the same mock renderer setup as test 24 (auto-test-runner).
 */

const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');
const { AutoTestRunner } = require('../../app/auto-test-runner');
const { DecisionLogger, canonicalPocket, canonicalSet, computeBaseline, physicalSet } = require('../../app/decision-logger');

// ── Mock renderer functions (same as test 24) ──
const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:35, 3:17, 4:6, 5:22, 6:4, 7:18, 8:24, 9:29,
    10:33, 11:36, 12:3, 13:27, 14:31, 15:19, 16:23, 17:3, 18:7, 19:15,
    20:1, 21:25, 22:5, 23:16, 24:8, 25:21, 26:32, 27:13, 28:1, 29:9,
    30:11, 31:14, 32:26, 33:10, 34:0, 35:2, 36:11
};

function calculatePositionCode(reference, actual) {
    if (reference === undefined || reference === null || actual === undefined || actual === null) return 'XX';
    const refIdx = WHEEL_STANDARD.indexOf(reference);
    const actIdx = WHEEL_STANDARD.indexOf(actual);
    if (refIdx === -1 || actIdx === -1) return 'XX';
    const len = WHEEL_STANDARD.length;
    const oppIdx = (refIdx + 18) % len;
    let cwFromSame = (actIdx - refIdx + len) % len;
    let ccwFromSame = (refIdx - actIdx + len) % len;
    let cwFromOpp = (actIdx - oppIdx + len) % len;
    let ccwFromOpp = (oppIdx - actIdx + len) % len;
    const minSame = Math.min(cwFromSame, ccwFromSame);
    const minOpp = Math.min(cwFromOpp, ccwFromOpp);
    if (minSame <= minOpp) {
        if (cwFromSame <= ccwFromSame) return cwFromSame === 0 ? 'S+0' : `SR+${cwFromSame}`;
        return `SL+${ccwFromSame}`;
    }
    if (cwFromOpp <= ccwFromOpp) return cwFromOpp === 0 ? 'O+0' : `OR+${cwFromOpp}`;
    return `OL+${ccwFromOpp}`;
}

function calculateReferences(prev, prevPrev) {
    if (prev === undefined || prev === null) return {};
    const prevIdx = WHEEL_STANDARD.indexOf(prev);
    const len = WHEEL_STANDARD.length;
    return {
        prev: prev,
        prev_plus_1: WHEEL_STANDARD[(prevIdx + 1) % len],
        prev_minus_1: WHEEL_STANDARD[(prevIdx - 1 + len) % len],
        prev_plus_2: WHEEL_STANDARD[(prevIdx + 2) % len],
        prev_minus_2: WHEEL_STANDARD[(prevIdx - 2 + len) % len],
        prev_prev: prevPrev !== undefined ? prevPrev : prev
    };
}

function _getPosCodeDistance(posCode) {
    if (!posCode || posCode === 'XX') return null;
    const m = posCode.match(/[+\-](\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

function generateAnchors(refNum, ref13Opp, posCode) {
    const purple = [];
    const green = [];
    if (!posCode || posCode === 'XX') return { purple, green };
    const refIdx = WHEEL_STANDARD.indexOf(refNum);
    const oppIdx = WHEEL_STANDARD.indexOf(ref13Opp);
    if (refIdx === -1 || oppIdx === -1) return { purple, green };
    purple.push(refNum, ref13Opp);
    return { purple, green };
}

function expandAnchorsToBetNumbers(purple, green) {
    const result = new Set();
    const len = WHEEL_STANDARD.length;
    for (const anchor of purple) {
        const idx = WHEEL_STANDARD.indexOf(anchor);
        if (idx === -1) continue;
        for (let d = -2; d <= 2; d++) {
            result.add(WHEEL_STANDARD[(idx + d + len) % len]);
        }
    }
    for (const n of green) {
        const idx = WHEEL_STANDARD.indexOf(n);
        if (idx === -1) continue;
        for (let d = -1; d <= 1; d++) {
            result.add(WHEEL_STANDARD[(idx + d + len) % len]);
        }
    }
    return Array.from(result);
}

// Make functions global for the engine
global.calculatePositionCode = calculatePositionCode;
global.calculateReferences = calculateReferences;
global.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
global.generateAnchors = generateAnchors;
global.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
global._getPosCodeDistance = _getPosCodeDistance;

// Number sets
global.ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
global.NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
global.POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
global.NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// ── Helpers ──
function generateTestSpins(count) {
    const spins = [];
    for (let i = 0; i < count; i++) {
        spins.push(WHEEL_STANDARD[i % WHEEL_STANDARD.length]);
    }
    return spins;
}

function createTrainedEngine() {
    const engine = new AIAutoEngine({ confidenceThreshold: 30 });
    const trainingData = [generateTestSpins(50), generateTestSpins(40)];
    engine.train(trainingData);
    return engine;
}

/**
 * sessionBoundary — same implementation as walk-forward-runner.js
 * (imported from concept, not from the script since it has JSDOM bootstrap)
 */
function sessionBoundary(engine, reason) {
    engine.resetSession();
}

/**
 * getDecisionWithDiagnostics — simplified version for testing
 * (the real one in walk-forward-runner.js has JSDOM dependencies via bootstrap)
 */
function getDecisionWithDiagnostics(runner, spins, idx) {
    const engine = runner.engine;

    // Capture flashing pairs + projections
    const flashingPairs = engine._getFlashingPairsFromHistory(spins, idx);
    const allProjections = {};
    for (const [refKey, flashInfo] of flashingPairs) {
        const proj = engine._computeProjectionForPair(spins, idx, refKey);
        if (proj && proj.numbers.length > 0) {
            allProjections[refKey] = canonicalSet(proj.numbers);
        }
    }

    // Pairwise overlap
    const overlapEntries = [];
    const keys = Object.keys(allProjections);
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const a = new Set(allProjections[keys[i]]);
            const b = new Set(allProjections[keys[j]]);
            const intersection = [...a].filter(x => b.has(x)).length;
            const minSize = Math.min(a.size, b.size);
            const overlap = minSize > 0 ? intersection / minSize : 0;
            overlapEntries.push({ pairA: keys[i], pairB: keys[j], overlap });
        }
    }

    // Get decision
    const decision = runner._simulateDecision(spins, idx);

    // Pre-filter projection
    const projSet = new Set();
    for (const nums of Object.values(allProjections)) {
        nums.forEach(n => projSet.add(n));
    }

    return {
        decision,
        projectionCanonSet: [...projSet].sort((a, b) => a - b),
        allProjections,
        overlapEntries
    };
}

// ═══════════════════════════════════════════════════════════
//  A. sessionBoundary
// ═══════════════════════════════════════════════════════════

describe('A. sessionBoundary', () => {
    test('A1: Resets session tracker (consecutiveLosses, trendState, adaptationWeight)', () => {
        const engine = createTrainedEngine();

        // Mutate session state
        engine.session.consecutiveLosses = 5;
        engine.session.trendState = 'RECOVERY';
        engine.session.adaptationWeight = 0.4;
        engine.session.totalBets = 15;
        engine.session.wins = 8;

        sessionBoundary(engine, 'file_boundary:test');

        expect(engine.session.consecutiveLosses).toBe(0);
        expect(engine.session.trendState).toBe('NORMAL');
        expect(engine.session.adaptationWeight).toBe(0);
        expect(engine.session.totalBets).toBe(0);
        expect(engine.session.wins).toBe(0);
    });

    test('A2: Does NOT reset pairModels, filterModels, pairBayesian', () => {
        const engine = createTrainedEngine();

        // Snapshot learned state
        const pairModelKeys = Object.keys(engine.pairModels);
        const filterModelKeys = Object.keys(engine.filterModels);
        const bayesianKeys = Object.keys(engine.pairBayesian);
        const bayesianAlpha = engine.pairBayesian[bayesianKeys[0]].alpha;

        sessionBoundary(engine, 'file_boundary:test');

        // Learned state persists
        expect(Object.keys(engine.pairModels)).toEqual(pairModelKeys);
        expect(Object.keys(engine.filterModels)).toEqual(filterModelKeys);
        expect(Object.keys(engine.pairBayesian)).toEqual(bayesianKeys);
        expect(engine.pairBayesian[bayesianKeys[0]].alpha).toBe(bayesianAlpha);
        expect(engine.isTrained).toBe(true);
    });

    test('A3: Multiple calls are safe (idempotent)', () => {
        const engine = createTrainedEngine();

        sessionBoundary(engine, 'file_boundary:test1');
        sessionBoundary(engine, 'file_boundary:test2');
        sessionBoundary(engine, 'file_boundary:test3');

        expect(engine.session.totalBets).toBe(0);
        expect(engine.session.trendState).toBe('NORMAL');
        expect(engine.isTrained).toBe(true);
    });

    test('A4: Clears liveSpins', () => {
        const engine = createTrainedEngine();
        engine.liveSpins = [1, 2, 3, 4, 5];

        sessionBoundary(engine, 'file_boundary:test');

        expect(engine.liveSpins).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════
//  B. getDecisionWithDiagnostics
// ═══════════════════════════════════════════════════════════

describe('B. getDecisionWithDiagnostics', () => {
    let engine, runner;

    beforeEach(() => {
        engine = createTrainedEngine();
        runner = new AutoTestRunner(engine);
        engine._retrainInterval = Infinity;
        engine._retrainLossStreak = Infinity;
    });

    test('B1: Returns decision object with action field', () => {
        const spins = generateTestSpins(20);
        const result = getDecisionWithDiagnostics(runner, spins, 5);
        expect(result.decision).toBeDefined();
        expect(['BET', 'SKIP']).toContain(result.decision.action);
    });

    test('B2: Returns projectionCanonSet (pre-filter numbers)', () => {
        const spins = generateTestSpins(20);
        const result = getDecisionWithDiagnostics(runner, spins, 5);
        expect(Array.isArray(result.projectionCanonSet)).toBe(true);
        // projectionCanonSet should be sorted (deterministic)
        for (let i = 1; i < result.projectionCanonSet.length; i++) {
            expect(result.projectionCanonSet[i]).toBeGreaterThanOrEqual(result.projectionCanonSet[i - 1]);
        }
    });

    test('B3: Returns overlapEntries array', () => {
        const spins = generateTestSpins(20);
        const result = getDecisionWithDiagnostics(runner, spins, 5);
        expect(Array.isArray(result.overlapEntries)).toBe(true);
    });

    test('B4: Overlap values are between 0 and 1', () => {
        const spins = generateTestSpins(30);
        // Try multiple indices to get some overlap data
        for (let idx = 4; idx < 15; idx++) {
            const result = getDecisionWithDiagnostics(runner, spins, idx);
            for (const entry of result.overlapEntries) {
                expect(entry.overlap).toBeGreaterThanOrEqual(0);
                expect(entry.overlap).toBeLessThanOrEqual(1);
            }
            // Reset session between trials to avoid cross-contamination
            engine.resetSession();
        }
    });

    test('B5: Returns empty overlapEntries when 0 or 1 pairs flash', () => {
        // With idx=3 (minimal context), likely 0-1 pairs flash
        const spins = [5, 10, 20, 30, 15]; // random-ish spins
        const result = getDecisionWithDiagnostics(runner, spins, 3);
        // If 0 or 1 pairs flash, no pairwise overlap possible
        if (Object.keys(result.allProjections).length <= 1) {
            expect(result.overlapEntries.length).toBe(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════
//  C. Integration — mini walk-forward
// ═══════════════════════════════════════════════════════════

describe('C. Integration', () => {
    test('C1: Walk-forward on 20 spins produces DecisionRecords', () => {
        const engine = createTrainedEngine();
        const runner = new AutoTestRunner(engine);
        engine._retrainInterval = Infinity;
        engine._retrainLossStreak = Infinity;
        const logger = new DecisionLogger({ stakePerNumber: 2 });

        const spins = generateTestSpins(20);
        let globalIdx = 0;

        // WATCH: first 3 spins
        for (let t = 0; t < 3; t++) {
            logger.logDecision({
                spinIndex: globalIdx++,
                fileIndex: 0, localIndex: t,
                rawResult: spins[t],
                canonResult: canonicalPocket(spins[t]),
                state: 'WAIT',
                selectedPairs: [], selectedFilter: null,
                projectionCanonSet: [], finalCanonSet: [], finalPhysicalSet: [],
                K: 0, K_phys: 0, confidence: 0, baseline_p: 0,
                includes26: false, hit: 0, stakeTotal: 0, pnl: 0,
                filterDamage: 0, driftFlag: false, flashUsed: false,
                reason: 'WAIT'
            });
        }

        // DECISION: spins 3 to 18
        for (let t = 3; t < spins.length - 1; t++) {
            const { decision, projectionCanonSet } = getDecisionWithDiagnostics(runner, spins, t);
            const actual = spins[t + 1];
            const canonActual = canonicalPocket(actual);
            const flashUsed = (decision.reason || '').toLowerCase().includes('flash');

            if (decision.action === 'BET') {
                const finalCanon = canonicalSet(decision.numbers);
                const finalPhys = physicalSet(finalCanon);
                const { K, K_phys, includes26, baseline_p } = computeBaseline(finalCanon);
                const hit = finalCanon.includes(canonActual) ? 1 : 0;
                const pnl = logger.computePnL(K_phys, hit === 1);
                const projCanon = canonicalSet(projectionCanonSet);
                const filterDamage = (projCanon.includes(canonActual) && !finalCanon.includes(canonActual)) ? 1 : 0;

                logger.logDecision({
                    spinIndex: globalIdx++,
                    fileIndex: 0, localIndex: t,
                    rawResult: actual, canonResult: canonActual,
                    state: 'BET',
                    selectedPairs: [decision.selectedPair].filter(Boolean),
                    selectedFilter: decision.selectedFilter,
                    projectionCanonSet: projCanon,
                    finalCanonSet: finalCanon, finalPhysicalSet: finalPhys,
                    K, K_phys, confidence: decision.confidence,
                    baseline_p, includes26, hit, stakeTotal: 2 * K_phys,
                    pnl, filterDamage, driftFlag: false, flashUsed,
                    reason: decision.reason
                });

                engine.recordResult(decision.selectedPair, decision.selectedFilter, hit === 1, actual, decision.numbers);
            } else {
                logger.logDecision({
                    spinIndex: globalIdx++,
                    fileIndex: 0, localIndex: t,
                    rawResult: actual, canonResult: canonActual,
                    state: 'SKIP',
                    selectedPairs: [], selectedFilter: null,
                    projectionCanonSet: canonicalSet(projectionCanonSet),
                    finalCanonSet: [], finalPhysicalSet: [],
                    K: 0, K_phys: 0, confidence: decision.confidence,
                    baseline_p: 0, includes26: false, hit: 0,
                    stakeTotal: 0, pnl: 0, filterDamage: 0,
                    driftFlag: false, flashUsed,
                    reason: decision.reason
                });
                engine.recordSkip();
            }
        }

        const records = logger.getRecords();
        expect(records.length).toBeGreaterThan(0);
        // First 3 should be WAIT
        expect(records[0].state).toBe('WAIT');
        expect(records[1].state).toBe('WAIT');
        expect(records[2].state).toBe('WAIT');
    });

    test('C2: WAIT records have K=0, pnl=0', () => {
        const logger = new DecisionLogger();
        logger.logDecision({
            spinIndex: 0, state: 'WAIT', K: 0, K_phys: 0,
            pnl: 0, stakeTotal: 0, hit: 0, baseline_p: 0,
            includes26: false, filterDamage: 0
        });
        const waits = logger.getRecords().filter(r => r.state === 'WAIT');
        expect(waits[0].K).toBe(0);
        expect(waits[0].pnl).toBe(0);
        expect(waits[0].stakeTotal).toBe(0);
    });

    test('C3: BET records have non-zero K and stakeTotal', () => {
        const logger = new DecisionLogger({ stakePerNumber: 2 });
        const K = 10;
        const K_phys = 10;
        logger.logDecision({
            spinIndex: 0, state: 'BET', K, K_phys,
            pnl: -(2 * K_phys), stakeTotal: 2 * K_phys,
            hit: 0, baseline_p: K_phys / 37,
            includes26: false, filterDamage: 0
        });
        const bets = logger.getBetRecords();
        expect(bets[0].K).toBeGreaterThan(0);
        expect(bets[0].stakeTotal).toBeGreaterThan(0);
    });

    test('C4: filterDamage is 0 or 1', () => {
        const logger = new DecisionLogger();
        logger.logDecision({ state: 'BET', filterDamage: 0, hit: 1, K: 8, K_phys: 8, pnl: 56, baseline_p: 8 / 37, includes26: false });
        logger.logDecision({ state: 'BET', filterDamage: 1, hit: 0, K: 10, K_phys: 10, pnl: -20, baseline_p: 10 / 37, includes26: false });
        const bets = logger.getBetRecords();
        for (const r of bets) {
            expect([0, 1]).toContain(r.filterDamage);
        }
    });
});

// ═══════════════════════════════════════════════════════════
//  D. Canonical consistency
// ═══════════════════════════════════════════════════════════

describe('D. Canonical consistency', () => {
    test('D1: All canonResult values are never 0 (always 26 for 0-pocket)', () => {
        // Test that canonicalPocket(0) = 26
        expect(canonicalPocket(0)).toBe(26);
        // In a walk-forward, any spin result of 0 becomes canonResult 26
        const results = [0, 1, 5, 26, 0, 36];
        const canonResults = results.map(canonicalPocket);
        expect(canonResults).not.toContain(0);
        expect(canonResults.filter(r => r === 26).length).toBe(3); // two 0s + one 26
    });

    test('D2: finalCanonSet never contains 0', () => {
        const nums = [0, 1, 5, 26, 13];
        const canon = canonicalSet(nums);
        expect(canon).not.toContain(0);
        expect(canon).toContain(26);
    });

    test('D3: finalPhysicalSet contains both 0 and 26 when canonical 26 is in set', () => {
        const canon = [1, 5, 26, 13];
        const phys = physicalSet(canon);
        expect(phys).toContain(0);
        expect(phys).toContain(26);
        expect(phys.length).toBe(canon.length + 1); // one extra for the 0
    });

    test('D4: physicalSet without 26 has same length as canonical set', () => {
        const canon = [1, 5, 13, 36];
        const phys = physicalSet(canon);
        expect(phys.length).toBe(canon.length);
        expect(phys).not.toContain(0);
        expect(phys).not.toContain(26);
    });
});

// ═══════════════════════════════════════════════════════════
//  E. flashUsed inference
// ═══════════════════════════════════════════════════════════

describe('E. flashUsed inference', () => {
    test('E1: Reason containing "flash" sets flashUsed true', () => {
        const reason = 'T2:prev+T3:prevPlus1 → flash detection → zero_both (conf: 72%)';
        const flashUsed = (reason || '').toLowerCase().includes('flash');
        expect(flashUsed).toBe(true);
    });

    test('E2: Reason without "flash" sets flashUsed false', () => {
        const reason = 'T2:prev+T3:prevPlus1 → zero_both (conf: 72%)';
        const flashUsed = (reason || '').toLowerCase().includes('flash');
        expect(flashUsed).toBe(false);
    });

    test('E3: Null/undefined reason defaults to false', () => {
        expect((null || '').toLowerCase().includes('flash')).toBe(false);
        expect((undefined || '').toLowerCase().includes('flash')).toBe(false);
    });
});
