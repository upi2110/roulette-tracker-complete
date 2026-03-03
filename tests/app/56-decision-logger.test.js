/**
 * Tests for decision-logger.js — Canonical mapping + DecisionLogger
 *
 * 56-decision-logger.test.js
 */

const {
    DecisionLogger,
    canonicalPocket,
    canonicalSet,
    computeBaseline,
    physicalSet
} = require('../../app/decision-logger');

// ═══════════════════════════════════════════════════════════
//  A. canonicalPocket
// ═══════════════════════════════════════════════════════════

describe('A. canonicalPocket', () => {
    test('A1: canonicalPocket(0) === 26', () => {
        expect(canonicalPocket(0)).toBe(26);
    });

    test('A2: canonicalPocket(26) === 26', () => {
        expect(canonicalPocket(26)).toBe(26);
    });

    test('A3: canonicalPocket(1) === 1', () => {
        expect(canonicalPocket(1)).toBe(1);
    });

    test('A4: canonicalPocket(36) === 36', () => {
        expect(canonicalPocket(36)).toBe(36);
    });

    test('A5: canonicalPocket(13) === 13', () => {
        expect(canonicalPocket(13)).toBe(13);
    });

    test('A6: All 37 numbers map correctly — 0 and 26 → 26, rest unchanged', () => {
        for (let n = 0; n <= 36; n++) {
            const expected = (n === 0 || n === 26) ? 26 : n;
            expect(canonicalPocket(n)).toBe(expected);
        }
    });
});

// ═══════════════════════════════════════════════════════════
//  B. canonicalSet
// ═══════════════════════════════════════════════════════════

describe('B. canonicalSet', () => {
    test('B1: [0, 1, 26] → [1, 26] (deduped, sorted)', () => {
        const result = canonicalSet([0, 1, 26]);
        expect(result).toEqual([1, 26]);
    });

    test('B2: [5, 10, 15] → [5, 10, 15] (no 0/26, unchanged)', () => {
        expect(canonicalSet([5, 10, 15])).toEqual([5, 10, 15]);
    });

    test('B3: empty → empty', () => {
        expect(canonicalSet([])).toEqual([]);
    });

    test('B4: duplicates → deduped and sorted', () => {
        expect(canonicalSet([5, 5, 3, 3, 1])).toEqual([1, 3, 5]);
    });

    test('B5: output is always sorted ascending (deterministic)', () => {
        const result = canonicalSet([36, 1, 26, 0, 15, 8]);
        for (let i = 1; i < result.length; i++) {
            expect(result[i]).toBeGreaterThan(result[i - 1]);
        }
    });

    test('B6: never contains 0 (always mapped to 26)', () => {
        const result = canonicalSet([0, 1, 2, 3, 26]);
        expect(result).not.toContain(0);
        expect(result).toContain(26);
    });
});

// ═══════════════════════════════════════════════════════════
//  C. computeBaseline
// ═══════════════════════════════════════════════════════════

describe('C. computeBaseline', () => {
    test('C1: K=8, no 26 → baseline_p = 8/37, K_phys = 8', () => {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8];
        const result = computeBaseline(nums);
        expect(result.K).toBe(8);
        expect(result.K_phys).toBe(8);
        expect(result.includes26).toBe(false);
        expect(result.baseline_p).toBeCloseTo(8 / 37, 10);
    });

    test('C2: K=8, includes 26 → baseline_p = 9/37, K_phys = 9', () => {
        const nums = [1, 2, 3, 4, 5, 6, 7, 26];
        const result = computeBaseline(nums);
        expect(result.K).toBe(8);
        expect(result.K_phys).toBe(9);
        expect(result.includes26).toBe(true);
        expect(result.baseline_p).toBeCloseTo(9 / 37, 10);
    });

    test('C3: K=12 → correct values', () => {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const result = computeBaseline(nums);
        expect(result.K).toBe(12);
        expect(result.K_phys).toBe(12);
        expect(result.baseline_p).toBeCloseTo(12 / 37, 10);
    });

    test('C4: K=5 (minimum precision-first) → correct', () => {
        const nums = [1, 2, 3, 4, 5];
        const result = computeBaseline(nums);
        expect(result.K).toBe(5);
        expect(result.K_phys).toBe(5);
        expect(result.baseline_p).toBeCloseTo(5 / 37, 10);
    });

    test('C5: K=1 edge case → correct', () => {
        const nums = [7];
        const result = computeBaseline(nums);
        expect(result.K).toBe(1);
        expect(result.K_phys).toBe(1);
        expect(result.baseline_p).toBeCloseTo(1 / 37, 10);
    });

    test('C6: K=1 with 26 → K_phys = 2', () => {
        const nums = [26];
        const result = computeBaseline(nums);
        expect(result.K).toBe(1);
        expect(result.K_phys).toBe(2);
        expect(result.includes26).toBe(true);
        expect(result.baseline_p).toBeCloseTo(2 / 37, 10);
    });
});

// ═══════════════════════════════════════════════════════════
//  D. physicalSet
// ═══════════════════════════════════════════════════════════

describe('D. physicalSet', () => {
    test('D1: [26, 1, 5] → [0, 1, 5, 26] (26 expands to include 0)', () => {
        expect(physicalSet([26, 1, 5])).toEqual([0, 1, 5, 26]);
    });

    test('D2: [1, 5, 10] → [1, 5, 10] (no 26, unchanged)', () => {
        expect(physicalSet([1, 5, 10])).toEqual([1, 5, 10]);
    });

    test('D3: [] → []', () => {
        expect(physicalSet([])).toEqual([]);
    });

    test('D4: [26] → [0, 26]', () => {
        expect(physicalSet([26])).toEqual([0, 26]);
    });

    test('D5: output is always sorted ascending', () => {
        const result = physicalSet([36, 26, 1]);
        expect(result).toEqual([0, 1, 26, 36]);
    });
});

// ═══════════════════════════════════════════════════════════
//  E. DecisionLogger core
// ═══════════════════════════════════════════════════════════

describe('E. DecisionLogger core', () => {
    test('E1: Constructor creates empty records with default stake', () => {
        const logger = new DecisionLogger();
        expect(logger.getRecords()).toEqual([]);
        expect(logger.stakePerNumber).toBe(2);
    });

    test('E2: Constructor respects custom stake', () => {
        const logger = new DecisionLogger({ stakePerNumber: 5 });
        expect(logger.stakePerNumber).toBe(5);
    });

    test('E3: logDecision adds record', () => {
        const logger = new DecisionLogger();
        logger.logDecision({ spinIndex: 0, state: 'WAIT' });
        expect(logger.getRecords().length).toBe(1);
    });

    test('E4: getRecords returns all records', () => {
        const logger = new DecisionLogger();
        logger.logDecision({ spinIndex: 0, state: 'WAIT' });
        logger.logDecision({ spinIndex: 1, state: 'BET', hit: 1 });
        logger.logDecision({ spinIndex: 2, state: 'SKIP' });
        expect(logger.getRecords().length).toBe(3);
    });

    test('E5: getBetRecords filters to BET and RECOVERY only', () => {
        const logger = new DecisionLogger();
        logger.logDecision({ state: 'WAIT' });
        logger.logDecision({ state: 'BET', hit: 1, K: 8 });
        logger.logDecision({ state: 'SKIP' });
        logger.logDecision({ state: 'RECOVERY', hit: 0, K: 10 });
        logger.logDecision({ state: 'BET', hit: 0, K: 12 });
        const bets = logger.getBetRecords();
        expect(bets.length).toBe(3);
        expect(bets.every(r => r.state === 'BET' || r.state === 'RECOVERY')).toBe(true);
    });

    test('E6: computePnL win: stake*(36-K_phys)', () => {
        const logger = new DecisionLogger({ stakePerNumber: 2 });
        expect(logger.computePnL(8, true)).toBe(2 * (36 - 8)); // $56
    });

    test('E7: computePnL loss: -(stake*K_phys)', () => {
        const logger = new DecisionLogger({ stakePerNumber: 2 });
        expect(logger.computePnL(8, false)).toBe(-(2 * 8)); // -$16
    });

    test('E8: computePnL K=12, hit → $2*(36-12) = $48', () => {
        const logger = new DecisionLogger({ stakePerNumber: 2 });
        expect(logger.computePnL(12, true)).toBe(48);
    });

    test('E9: computePnL K=12, miss → -$2*12 = -$24', () => {
        const logger = new DecisionLogger({ stakePerNumber: 2 });
        expect(logger.computePnL(12, false)).toBe(-24);
    });

    test('E10: reset clears all records', () => {
        const logger = new DecisionLogger();
        logger.logDecision({ state: 'BET' });
        logger.logDecision({ state: 'SKIP' });
        logger.reset();
        expect(logger.getRecords().length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════
//  F. getSummary
// ═══════════════════════════════════════════════════════════

function makeBetRecord(overrides = {}) {
    return {
        spinIndex: 0, state: 'BET', hit: 0, K: 10, K_phys: 10,
        baseline_p: 10 / 37, includes26: false,
        pnl: -(2 * 10), stakeTotal: 20, filterDamage: 0,
        ...overrides
    };
}

function makeSkipRecord(overrides = {}) {
    return {
        spinIndex: 0, state: 'SKIP', hit: 0, K: 0, K_phys: 0,
        baseline_p: 0, includes26: false,
        pnl: 0, stakeTotal: 0, filterDamage: 0,
        ...overrides
    };
}

function makeWaitRecord(overrides = {}) {
    return {
        spinIndex: 0, state: 'WAIT', hit: 0, K: 0, K_phys: 0,
        baseline_p: 0, includes26: false,
        pnl: 0, stakeTotal: 0, filterDamage: 0,
        ...overrides
    };
}

describe('F. getSummary', () => {
    test('F1: Empty logger → zeroed summary', () => {
        const logger = new DecisionLogger();
        const s = logger.getSummary();
        expect(s.totalSpins).toBe(0);
        expect(s.totalBets).toBe(0);
        expect(s.totalSkips).toBe(0);
        expect(s.totalWaits).toBe(0);
        expect(s.actionBetRate).toBe(0);
        expect(s.spinBetRate).toBe(0);
        expect(s.hitRate).toBe(0);
        expect(s.maxDrawdown).toBe(0);
        expect(s.longestLosingStreak).toBe(0);
    });

    test('F2: Mixed BET/SKIP/WAIT → correct action and spin bet rates', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeWaitRecord());
        logger.logDecision(makeWaitRecord());
        logger.logDecision(makeWaitRecord());
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));
        logger.logDecision(makeSkipRecord());
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeSkipRecord());

        const s = logger.getSummary();
        expect(s.totalSpins).toBe(7);
        expect(s.totalBets).toBe(2);
        expect(s.totalSkips).toBe(2);
        expect(s.totalWaits).toBe(3);
        // actionBetRate = 2 / (2 + 2) = 0.5
        expect(s.actionBetRate).toBeCloseTo(0.5, 5);
        // spinBetRate = 2 / 7
        expect(s.spinBetRate).toBeCloseTo(2 / 7, 5);
    });

    test('F3: Hit rate computed only on BET records', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeWaitRecord());
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));
        logger.logDecision(makeSkipRecord());

        const s = logger.getSummary();
        expect(s.hitRate).toBeCloseTo(2 / 3, 5);
    });

    test('F4: Max drawdown computed correctly', () => {
        const logger = new DecisionLogger();
        // Win +48, Loss -20, Loss -20, Win +48
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));  // cumPnl=48, peak=48
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 })); // cumPnl=28, dd=20
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 })); // cumPnl=8, dd=40
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));  // cumPnl=56, peak=56

        const s = logger.getSummary();
        expect(s.maxDrawdown).toBe(40);
    });

    test('F5: Longest losing streak computed correctly', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));

        const s = logger.getSummary();
        expect(s.longestLosingStreak).toBe(3);
    });

    test('F6: Profit factor = sumWins / |sumLosses|', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 50 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -10 }));

        const s = logger.getSummary();
        // sumWins=50, sumLosses=|-30|=30
        expect(s.profitFactor).toBeCloseTo(50 / 30, 5);
    });

    test('F7: Filter damage rate computed correctly', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeBetRecord({ filterDamage: 1 }));
        logger.logDecision(makeBetRecord({ filterDamage: 0 }));
        logger.logDecision(makeBetRecord({ filterDamage: 1 }));
        logger.logDecision(makeBetRecord({ filterDamage: 0 }));

        const s = logger.getSummary();
        expect(s.filterDamageRate).toBeCloseTo(0.5, 5);
    });

    test('F8: EV per bet and per spin', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeWaitRecord());
        logger.logDecision(makeBetRecord({ hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ hit: 0, pnl: -20 }));
        logger.logDecision(makeSkipRecord());

        const s = logger.getSummary();
        // totalPnl = 48 - 20 = 28, totalBets = 2, totalSpins = 4
        expect(s.evPerBet).toBeCloseTo(14, 5);
        expect(s.evPerSpin).toBeCloseTo(7, 5);
    });
});

// ═══════════════════════════════════════════════════════════
//  G. getSummaryByBins
// ═══════════════════════════════════════════════════════════

describe('G. getSummaryByBins', () => {
    test('G1: K bins segment correctly', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeBetRecord({ K: 5, K_phys: 5, baseline_p: 5 / 37, hit: 1, pnl: 62 }));
        logger.logDecision(makeBetRecord({ K: 6, K_phys: 6, baseline_p: 6 / 37, hit: 0, pnl: -12 }));
        logger.logDecision(makeBetRecord({ K: 10, K_phys: 10, baseline_p: 10 / 37, hit: 1, pnl: 52 }));
        logger.logDecision(makeBetRecord({ K: 12, K_phys: 12, baseline_p: 12 / 37, hit: 0, pnl: -24 }));

        const bins = logger.getSummaryByBins('K', [[5, 6], [7, 8], [9, 10], [11, 12]]);
        expect(bins[0].count).toBe(2); // K=5,6
        expect(bins[1].count).toBe(0); // K=7,8
        expect(bins[2].count).toBe(1); // K=9,10
        expect(bins[3].count).toBe(1); // K=11,12
    });

    test('G2: includes26 bins segment correctly', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeBetRecord({ includes26: true, hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ includes26: false, hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ includes26: true, hit: 0, pnl: -20 }));

        const bins = logger.getSummaryByBins('includes26', [[true, 'with_26'], [false, 'without_26']]);
        expect(bins[0].label).toBe('with_26');
        expect(bins[0].count).toBe(2);
        expect(bins[1].label).toBe('without_26');
        expect(bins[1].count).toBe(1);
    });

    test('G3: Phase bins segment by spinIndex correctly', () => {
        const logger = new DecisionLogger();
        logger.logDecision(makeBetRecord({ spinIndex: 100, hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ spinIndex: 1500, hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ spinIndex: 3000, hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ spinIndex: 6000, hit: 0, pnl: -20 }));

        const bins = logger.getSummaryByBins('spinIndex', [
            [0, 2000, 'early'],
            [2000, 5000, 'mid'],
            [5000, Infinity, 'late']
        ]);
        expect(bins[0].label).toBe('early');
        expect(bins[0].count).toBe(2);
        expect(bins[1].label).toBe('mid');
        expect(bins[1].count).toBe(1);
        expect(bins[2].label).toBe('late');
        expect(bins[2].count).toBe(1);
    });

    test('G4: Empty bin returns safe defaults', () => {
        const logger = new DecisionLogger();
        const bins = logger.getSummaryByBins('K', [[5, 6]]);
        expect(bins[0].count).toBe(0);
        expect(bins[0].hitRate).toBe(0);
        expect(bins[0].evPerBet).toBe(0);
        expect(bins[0].avgBaseline).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════
//  H. getRollingMetrics
// ═══════════════════════════════════════════════════════════

describe('H. getRollingMetrics', () => {
    test('H1: Rolling window produces correct number of windows', () => {
        const logger = new DecisionLogger();
        // 10 BET records
        for (let i = 0; i < 10; i++) {
            logger.logDecision(makeBetRecord({ spinIndex: i, hit: i % 3 === 0 ? 1 : 0, pnl: i % 3 === 0 ? 48 : -20 }));
        }
        // window=5, step=2 → windows at [0,5), [2,7), [4,9), [5,10)
        const rolling = logger.getRollingMetrics(5);
        expect(rolling.length).toBeGreaterThan(0);
        expect(rolling[0].startIndex).toBe(0);
    });

    test('H2: Each window has correct hit rate', () => {
        const logger = new DecisionLogger();
        // 4 bets: hit, miss, hit, miss
        logger.logDecision(makeBetRecord({ spinIndex: 0, hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ spinIndex: 1, hit: 0, pnl: -20 }));
        logger.logDecision(makeBetRecord({ spinIndex: 2, hit: 1, pnl: 48 }));
        logger.logDecision(makeBetRecord({ spinIndex: 3, hit: 0, pnl: -20 }));

        const rolling = logger.getRollingMetrics(4);
        expect(rolling.length).toBe(1); // Only 1 window of size 4
        expect(rolling[0].hitRate).toBeCloseTo(0.5, 5);
    });
});

// ═══════════════════════════════════════════════════════════
//  I. JSONL round-trip
// ═══════════════════════════════════════════════════════════

describe('I. JSONL round-trip', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    test('I1: saveToJSONL and loadFromJSONL preserve records', () => {
        const tmpFile = path.join(os.tmpdir(), `test-decision-logger-${Date.now()}.jsonl`);

        const logger1 = new DecisionLogger();
        logger1.logDecision(makeBetRecord({ spinIndex: 0, hit: 1, pnl: 48 }));
        logger1.logDecision(makeSkipRecord({ spinIndex: 1 }));
        logger1.logDecision(makeBetRecord({ spinIndex: 2, hit: 0, pnl: -20 }));
        logger1.saveToJSONL(tmpFile);

        const logger2 = new DecisionLogger();
        logger2.loadFromJSONL(tmpFile);

        expect(logger2.getRecords().length).toBe(3);
        expect(logger2.getRecords()[0].spinIndex).toBe(0);
        expect(logger2.getRecords()[0].hit).toBe(1);
        expect(logger2.getRecords()[2].pnl).toBe(-20);

        // Cleanup
        fs.unlinkSync(tmpFile);
    });
});
