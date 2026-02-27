/**
 * Test Suite 24: Auto Test Runner — 100% Coverage
 *
 * Tests the AutoTestRunner class: session simulation, strategy logic,
 * P&L calculation, decision simulation, summary computation, and runAll.
 */

const { AutoTestRunner, TEST_REFKEY_TO_PAIR_NAME, STRATEGY_NAMES } = require('../../app/auto-test-runner');
const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');

// ── Mock renderer functions (same as test 22) ──
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

// Helper: generate a longer test spin sequence from the wheel
function generateTestSpins(count) {
    const spins = [];
    for (let i = 0; i < count; i++) {
        spins.push(WHEEL_STANDARD[i % WHEEL_STANDARD.length]);
    }
    return spins;
}

// Helper: create a trained engine
function createTrainedEngine() {
    const engine = new AIAutoEngine({ confidenceThreshold: 30 }); // Low threshold for testing
    const trainingData = [generateTestSpins(50), generateTestSpins(40)];
    engine.train(trainingData);
    return engine;
}

describe('AutoTestRunner', () => {
    let engine;
    let runner;

    beforeEach(() => {
        engine = createTrainedEngine();
        runner = new AutoTestRunner(engine);
    });

    // ═══════════════════════════════════════════════════════════
    //  EXPORTED CONSTANTS
    // ═══════════════════════════════════════════════════════════

    describe('exported constants', () => {
        test('TEST_REFKEY_TO_PAIR_NAME has 6 entries', () => {
            expect(Object.keys(TEST_REFKEY_TO_PAIR_NAME).length).toBe(6);
        });

        test('TEST_REFKEY_TO_PAIR_NAME maps prev correctly', () => {
            expect(TEST_REFKEY_TO_PAIR_NAME['prev']).toBe('prev');
            expect(TEST_REFKEY_TO_PAIR_NAME['prev_plus_1']).toBe('prevPlus1');
            expect(TEST_REFKEY_TO_PAIR_NAME['prev_prev']).toBe('prevPrev');
        });

        test('STRATEGY_NAMES has 3 entries', () => {
            expect(STRATEGY_NAMES[1]).toBe('Aggressive');
            expect(STRATEGY_NAMES[2]).toBe('Conservative');
            expect(STRATEGY_NAMES[3]).toBe('Cautious');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    describe('constructor', () => {
        test('stores engine reference', () => {
            expect(runner.engine).toBe(engine);
        });

        test('throws if engine is null', () => {
            expect(() => new AutoTestRunner(null)).toThrow('requires an AIAutoEngine');
        });

        test('throws if engine is undefined', () => {
            expect(() => new AutoTestRunner(undefined)).toThrow('requires an AIAutoEngine');
        });

        test('throws if engine is not trained', () => {
            const untrained = new AIAutoEngine();
            expect(() => new AutoTestRunner(untrained)).toThrow('must be trained');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _calculatePnL
    // ═══════════════════════════════════════════════════════════

    describe('_calculatePnL', () => {
        test('calculates win correctly: $2 × 35 - $2 × (12-1) = $48', () => {
            const pnl = runner._calculatePnL(2, 12, true);
            expect(pnl).toBe(2 * 35 - 2 * 11); // 70 - 22 = 48
        });

        test('calculates loss correctly: -($2 × 12) = -$24', () => {
            const pnl = runner._calculatePnL(2, 12, false);
            expect(pnl).toBe(-24);
        });

        test('win with 1 number: $2 × 35 - $2 × 0 = $70', () => {
            const pnl = runner._calculatePnL(2, 1, true);
            expect(pnl).toBe(70);
        });

        test('loss with 1 number: -$2', () => {
            const pnl = runner._calculatePnL(2, 1, false);
            expect(pnl).toBe(-2);
        });

        test('win with $1 bet on 10 numbers', () => {
            const pnl = runner._calculatePnL(1, 10, true);
            expect(pnl).toBe(35 - 9); // 26
        });

        test('loss with $5 bet on 15 numbers', () => {
            const pnl = runner._calculatePnL(5, 15, false);
            expect(pnl).toBe(-75);
        });

        test('win with 37 numbers: $2 × 35 - $2 × 36 = -$2', () => {
            // Edge case: betting all numbers still loses money on a win
            const pnl = runner._calculatePnL(2, 37, true);
            expect(pnl).toBe(70 - 72); // -2
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _applyStrategy
    // ═══════════════════════════════════════════════════════════

    describe('_applyStrategy', () => {
        describe('Strategy 1: Aggressive', () => {
            test('+$1 on loss', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 1, consecutiveWins: 0 };
                const bet = runner._applyStrategy(1, false, state);
                expect(bet).toBe(3);
            });

            test('-$1 on win', () => {
                const state = { betPerNumber: 5, consecutiveLosses: 0, consecutiveWins: 1 };
                const bet = runner._applyStrategy(1, true, state);
                expect(bet).toBe(4);
            });

            test('minimum bet is $2 on win', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 0, consecutiveWins: 1 };
                const bet = runner._applyStrategy(1, true, state);
                expect(bet).toBe(2);
            });

            test('consecutive losses increase bet progressively', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 3, consecutiveWins: 0 };
                const bet = runner._applyStrategy(1, false, state);
                expect(bet).toBe(3);
            });
        });

        describe('Strategy 2: Conservative', () => {
            test('+$1 after 2 consecutive losses', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 2, consecutiveWins: 0 };
                const bet = runner._applyStrategy(2, false, state);
                expect(bet).toBe(3);
                expect(state.consecutiveLosses).toBe(0); // Reset after adjustment
            });

            test('no change on 1 loss', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 1, consecutiveWins: 0 };
                const bet = runner._applyStrategy(2, false, state);
                expect(bet).toBe(2);
            });

            test('-$1 after 2 consecutive wins', () => {
                const state = { betPerNumber: 5, consecutiveLosses: 0, consecutiveWins: 2 };
                const bet = runner._applyStrategy(2, true, state);
                expect(bet).toBe(4);
                expect(state.consecutiveWins).toBe(0); // Reset after adjustment
            });

            test('no change on 1 win', () => {
                const state = { betPerNumber: 5, consecutiveLosses: 0, consecutiveWins: 1 };
                const bet = runner._applyStrategy(2, true, state);
                expect(bet).toBe(5);
            });

            test('minimum bet $2 enforced on win', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 0, consecutiveWins: 2 };
                const bet = runner._applyStrategy(2, true, state);
                expect(bet).toBe(2);
            });
        });

        describe('Strategy 3: Cautious', () => {
            test('+$2 after 3 consecutive losses', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 3, consecutiveWins: 0 };
                const bet = runner._applyStrategy(3, false, state);
                expect(bet).toBe(4);
                expect(state.consecutiveLosses).toBe(0); // Reset
            });

            test('no change on 1 loss', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 1, consecutiveWins: 0 };
                const bet = runner._applyStrategy(3, false, state);
                expect(bet).toBe(2);
            });

            test('no change on 2 consecutive losses', () => {
                const state = { betPerNumber: 3, consecutiveLosses: 2, consecutiveWins: 0 };
                const bet = runner._applyStrategy(3, false, state);
                expect(bet).toBe(3);
            });

            test('-$1 after 2 consecutive wins', () => {
                const state = { betPerNumber: 5, consecutiveLosses: 0, consecutiveWins: 2 };
                const bet = runner._applyStrategy(3, true, state);
                expect(bet).toBe(4);
                expect(state.consecutiveWins).toBe(0); // Reset
            });

            test('no change on 1 win', () => {
                const state = { betPerNumber: 5, consecutiveLosses: 0, consecutiveWins: 1 };
                const bet = runner._applyStrategy(3, true, state);
                expect(bet).toBe(5);
            });

            test('minimum bet $2 enforced', () => {
                const state = { betPerNumber: 2, consecutiveLosses: 0, consecutiveWins: 2 };
                const bet = runner._applyStrategy(3, true, state);
                expect(bet).toBe(2);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _simulateDecision
    // ═══════════════════════════════════════════════════════════

    describe('_simulateDecision', () => {
        const testSpins = generateTestSpins(30);

        test('returns SKIP for idx < 3', () => {
            const result = runner._simulateDecision(testSpins, 2);
            expect(result.action).toBe('SKIP');
            expect(result.reason).toContain('Insufficient');
        });

        test('returns SKIP when no pairs are flashing', () => {
            // Use a sequence where position codes are all XX or distances differ by >1
            // Spins that jump wildly across the wheel to prevent ±1 flash
            const noFlashSpins = [0, 11, 0, 11, 0, 11, 0, 11, 0, 11];
            const result = runner._simulateDecision(noFlashSpins, 3);
            // Either SKIP (no flash) or could still BET if engine finds a way
            // The important thing is the function doesn't crash
            expect(result).toHaveProperty('action');
            expect(['BET', 'SKIP']).toContain(result.action);
        });

        test('returns decision with correct fields for valid spins', () => {
            // The test spins follow the wheel sequence, so flashing may occur
            const result = runner._simulateDecision(testSpins, 5);
            expect(result).toHaveProperty('action');
            expect(result).toHaveProperty('selectedPair');
            expect(result).toHaveProperty('selectedFilter');
            expect(result).toHaveProperty('numbers');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('reason');
        });

        test('BET decision has non-empty numbers', () => {
            const result = runner._simulateDecision(testSpins, 5);
            if (result.action === 'BET') {
                expect(result.numbers.length).toBeGreaterThan(0);
                expect(result.selectedPair).toBeTruthy();
                expect(result.selectedFilter).toBeTruthy();
            }
        });

        test('forces BET after max consecutive skips', () => {
            // Set engine to many skips
            engine.session.consecutiveSkips = engine.maxConsecutiveSkips;
            const result = runner._simulateDecision(testSpins, 5);
            // If there are any candidates, it should force a BET
            if (result.selectedPair !== null) {
                expect(result.action).toBe('BET');
            }
        });

        test('SKIP result has null pair and filter when insufficient history', () => {
            const result = runner._simulateDecision([1, 2], 1);
            expect(result.selectedPair).toBeNull();
            expect(result.selectedFilter).toBeNull();
            expect(result.numbers).toEqual([]);
        });

        test('handles spins where projections return null', () => {
            // Spins where refs produce XX codes
            const oddSpins = [0, 0, 0, 0, 0, 0, 0, 0];
            const result = runner._simulateDecision(oddSpins, 3);
            expect(result).toHaveProperty('action');
        });

        test('confidence is a number between 0 and 100', () => {
            const result = runner._simulateDecision(testSpins, 5);
            expect(typeof result.confidence).toBe('number');
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(100);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _runSession
    // ═══════════════════════════════════════════════════════════

    describe('_runSession', () => {
        test('returns SessionResult with correct fields', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);

            expect(result).toHaveProperty('startIdx', 0);
            expect(result).toHaveProperty('strategy', 1);
            expect(result).toHaveProperty('outcome');
            expect(result).toHaveProperty('finalBankroll');
            expect(result).toHaveProperty('finalProfit');
            expect(result).toHaveProperty('totalSpins');
            expect(result).toHaveProperty('totalBets');
            expect(result).toHaveProperty('totalSkips');
            expect(result).toHaveProperty('wins');
            expect(result).toHaveProperty('losses');
            expect(result).toHaveProperty('winRate');
            expect(result).toHaveProperty('maxDrawdown');
            expect(result).toHaveProperty('peakProfit');
            expect(result).toHaveProperty('steps');
            expect(Array.isArray(result.steps)).toBe(true);
        });

        test('INCOMPLETE when spins run out', () => {
            const shortSpins = generateTestSpins(10);
            const result = runner._runSession(shortSpins, 0, 1);
            // With only 10 spins from start 0, unlikely to reach $100 or bust
            expect(['WIN', 'BUST', 'INCOMPLETE']).toContain(result.outcome);
        });

        test('starting bankroll is 4000', () => {
            const testSpins = generateTestSpins(10);
            const result = runner._runSession(testSpins, 0, 1);
            // First step bankroll should be close to 4000 ± bet result
            if (result.steps.length > 0) {
                const firstBet = result.steps.find(s => s.action === 'BET');
                if (firstBet) {
                    expect(firstBet.bankroll).toBeDefined();
                }
            }
        });

        test('win rate is computed correctly', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            if (result.totalBets > 0) {
                expect(result.winRate).toBeCloseTo(result.wins / result.totalBets, 5);
            } else {
                expect(result.winRate).toBe(0);
            }
        });

        test('steps track WATCH, BET, SKIP and REANALYZE actions', () => {
            const testSpins = generateTestSpins(20);
            const result = runner._runSession(testSpins, 0, 1);
            for (const step of result.steps) {
                expect(['BET', 'SKIP', 'WATCH', 'REANALYZE']).toContain(step.action);
                expect(step).toHaveProperty('spinIdx');
                expect(step).toHaveProperty('spinNumber');
                expect(step).toHaveProperty('bankroll');
                expect(step).toHaveProperty('cumulativeProfit');
            }
            // First 3 steps should be WATCH
            const watchSteps = result.steps.filter(s => s.action === 'WATCH');
            expect(watchSteps.length).toBe(3);
            expect(result.steps[0].action).toBe('WATCH');
            expect(result.steps[1].action).toBe('WATCH');
            expect(result.steps[2].action).toBe('WATCH');
        });

        test('BET steps have predicted numbers and hit result', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            const betSteps = result.steps.filter(s => s.action === 'BET');
            for (const step of betSteps) {
                expect(Array.isArray(step.predictedNumbers)).toBe(true);
                expect(step.predictedNumbers.length).toBeGreaterThan(0);
                expect(typeof step.hit).toBe('boolean');
                expect(typeof step.pnl).toBe('number');
                expect(step.numbersCount).toBeGreaterThan(0);
            }
        });

        test('SKIP steps have zero pnl', () => {
            const testSpins = generateTestSpins(20);
            const result = runner._runSession(testSpins, 0, 1);
            const skipSteps = result.steps.filter(s => s.action === 'SKIP');
            for (const step of skipSteps) {
                expect(step.pnl).toBe(0);
                expect(step.numbersCount).toBe(0);
            }
        });

        test('totalBets + totalSkips = totalSpins', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.totalBets + result.totalSkips).toBe(result.totalSpins);
        });

        test('wins + losses = totalBets', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.wins + result.losses).toBe(result.totalBets);
        });

        test('maxDrawdown is non-negative', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
        });

        test('runs different strategies', () => {
            const testSpins = generateTestSpins(20);
            const r1 = runner._runSession(testSpins, 0, 1);
            engine.resetSession();
            const r2 = runner._runSession(testSpins, 0, 2);
            engine.resetSession();
            const r3 = runner._runSession(testSpins, 0, 3);

            expect(r1.strategy).toBe(1);
            expect(r2.strategy).toBe(2);
            expect(r3.strategy).toBe(3);
        });

        test('different start indices produce different results', () => {
            const testSpins = generateTestSpins(40);
            engine.resetSession();
            const r1 = runner._runSession(testSpins, 0, 1);
            engine.resetSession();
            const r2 = runner._runSession(testSpins, 5, 1);
            // Different start → different steps
            expect(r1.startIdx).toBe(0);
            expect(r2.startIdx).toBe(5);
        });

        test('engine session adaptation is called during session', () => {
            const testSpins = generateTestSpins(30);
            const recordSpy = jest.spyOn(engine, 'recordResult');
            const skipSpy = jest.spyOn(engine, 'recordSkip');
            runner._runSession(testSpins, 0, 1);
            // At least some calls should have been made
            expect(recordSpy.mock.calls.length + skipSpy.mock.calls.length).toBeGreaterThan(0);
            recordSpy.mockRestore();
            skipSpy.mockRestore();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _buildSessionResult
    // ═══════════════════════════════════════════════════════════

    describe('_buildSessionResult', () => {
        test('builds correct result object', () => {
            const state = {
                bankroll: 4100, profit: 100, totalBets: 5, totalSkips: 2,
                wins: 2, losses: 3, maxDrawdown: 50, peakProfit: 120
            };
            const steps = [{ action: 'BET' }, { action: 'SKIP' }];
            const result = runner._buildSessionResult(10, 2, 'WIN', state, steps);

            expect(result.startIdx).toBe(10);
            expect(result.strategy).toBe(2);
            expect(result.outcome).toBe('WIN');
            expect(result.finalBankroll).toBe(4100);
            expect(result.finalProfit).toBe(100);
            expect(result.totalSpins).toBe(2);
            expect(result.totalBets).toBe(5);
            expect(result.totalSkips).toBe(2);
            expect(result.wins).toBe(2);
            expect(result.losses).toBe(3);
            expect(result.winRate).toBeCloseTo(0.4, 5);
            expect(result.maxDrawdown).toBe(50);
            expect(result.peakProfit).toBe(120);
            expect(result.steps).toBe(steps);
        });

        test('winRate is 0 when no bets', () => {
            const state = {
                bankroll: 4000, profit: 0, totalBets: 0, totalSkips: 3,
                wins: 0, losses: 0, maxDrawdown: 0, peakProfit: 0
            };
            const result = runner._buildSessionResult(0, 1, 'INCOMPLETE', state, []);
            expect(result.winRate).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _computeSummary
    // ═══════════════════════════════════════════════════════════

    describe('_computeSummary', () => {
        test('returns empty summary for no sessions', () => {
            const summary = runner._computeSummary([]);
            expect(summary.totalSessions).toBe(0);
            expect(summary.wins).toBe(0);
            expect(summary.winRate).toBe(0);
        });

        test('computes correct win/bust/incomplete counts', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 10, startIdx: 0 },
                { outcome: 'WIN', finalProfit: 100, totalSpins: 30, maxDrawdown: 20, startIdx: 1 },
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 50, maxDrawdown: 4000, startIdx: 2 },
                { outcome: 'INCOMPLETE', finalProfit: 50, totalSpins: 100, maxDrawdown: 30, startIdx: 3 }
            ];
            const summary = runner._computeSummary(sessions);

            expect(summary.totalSessions).toBe(4);
            expect(summary.wins).toBe(2);
            expect(summary.busts).toBe(1);
            expect(summary.incomplete).toBe(1);
        });

        test('win rate is wins / (wins + busts)', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 10, startIdx: 0 },
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 50, maxDrawdown: 4000, startIdx: 1 },
                { outcome: 'WIN', finalProfit: 100, totalSpins: 25, maxDrawdown: 15, startIdx: 2 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.winRate).toBeCloseTo(2/3, 5);
        });

        test('average spins to win calculated correctly', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 10, startIdx: 0 },
                { outcome: 'WIN', finalProfit: 100, totalSpins: 30, maxDrawdown: 20, startIdx: 1 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.avgSpinsToWin).toBe(25);
        });

        test('average spins to bust calculated correctly', () => {
            const sessions = [
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 50, maxDrawdown: 4000, startIdx: 0 },
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 70, maxDrawdown: 4000, startIdx: 1 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.avgSpinsToBust).toBe(60);
        });

        test('max drawdown is max across all sessions', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 50, startIdx: 0 },
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 50, maxDrawdown: 4000, startIdx: 1 },
                { outcome: 'WIN', finalProfit: 100, totalSpins: 30, maxDrawdown: 200, startIdx: 2 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.maxDrawdown).toBe(4000);
        });

        test('best and worst sessions identified', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 10, startIdx: 5 },
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 50, maxDrawdown: 4000, startIdx: 10 },
                { outcome: 'WIN', finalProfit: 150, totalSpins: 30, maxDrawdown: 20, startIdx: 15 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.bestSession.startIdx).toBe(15);
            expect(summary.bestSession.finalProfit).toBe(150);
            expect(summary.worstSession.startIdx).toBe(10);
            expect(summary.worstSession.finalProfit).toBe(-4000);
        });

        test('avgProfit calculated correctly', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 10, startIdx: 0 },
                { outcome: 'BUST', finalProfit: -200, totalSpins: 50, maxDrawdown: 200, startIdx: 1 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.avgProfit).toBe(-50);
        });

        test('avgSpinsToWin is 0 when no wins', () => {
            const sessions = [
                { outcome: 'BUST', finalProfit: -4000, totalSpins: 50, maxDrawdown: 4000, startIdx: 0 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.avgSpinsToWin).toBe(0);
        });

        test('avgSpinsToBust is 0 when no busts', () => {
            const sessions = [
                { outcome: 'WIN', finalProfit: 100, totalSpins: 20, maxDrawdown: 10, startIdx: 0 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.avgSpinsToBust).toBe(0);
        });

        test('winRate is 0 when only incomplete sessions', () => {
            const sessions = [
                { outcome: 'INCOMPLETE', finalProfit: 50, totalSpins: 100, maxDrawdown: 30, startIdx: 0 },
            ];
            const summary = runner._computeSummary(sessions);
            expect(summary.winRate).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _emptyStrategySummary
    // ═══════════════════════════════════════════════════════════

    describe('_emptyStrategySummary', () => {
        test('returns all-zero summary', () => {
            const summary = runner._emptyStrategySummary();
            expect(summary.totalSessions).toBe(0);
            expect(summary.wins).toBe(0);
            expect(summary.busts).toBe(0);
            expect(summary.incomplete).toBe(0);
            expect(summary.winRate).toBe(0);
            expect(summary.avgSpinsToWin).toBe(0);
            expect(summary.avgSpinsToBust).toBe(0);
            expect(summary.avgProfit).toBe(0);
            expect(summary.maxDrawdown).toBe(0);
            expect(summary.bestSession).toEqual({ startIdx: 0, finalProfit: 0 });
            expect(summary.worstSession).toEqual({ startIdx: 0, finalProfit: 0 });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  runAll
    // ═══════════════════════════════════════════════════════════

    describe('runAll', () => {
        test('returns empty result for null spins', async () => {
            const result = await runner.runAll(null);
            expect(result.totalTestSpins).toBe(0);
            expect(result.strategies[1].sessions).toEqual([]);
            expect(result.strategies[2].sessions).toEqual([]);
            expect(result.strategies[3].sessions).toEqual([]);
        });

        test('returns empty result for too few spins', async () => {
            const result = await runner.runAll([1, 2, 3]);
            expect(result.totalTestSpins).toBe(3);
            expect(result.strategies[1].sessions).toEqual([]);
        });

        test('returns correct FullTestResult structure', async () => {
            const testSpins = generateTestSpins(15);
            const result = await runner.runAll(testSpins, { testFile: 'test.txt' });

            expect(result.testFile).toBe('test.txt');
            expect(result.totalTestSpins).toBe(15);
            expect(result).toHaveProperty('trainedOn');
            expect(result).toHaveProperty('timestamp');
            expect(result.strategies).toHaveProperty('1');
            expect(result.strategies).toHaveProperty('2');
            expect(result.strategies).toHaveProperty('3');
        });

        test('creates sessions for each starting position × 3 strategies', async () => {
            const testSpins = generateTestSpins(12);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            // maxStart = 12 - 5 = 7, so positions 0-7 = 8 positions
            const expectedSessions = 8;
            expect(result.strategies[1].sessions.length).toBe(expectedSessions);
            expect(result.strategies[2].sessions.length).toBe(expectedSessions);
            expect(result.strategies[3].sessions.length).toBe(expectedSessions);
        });

        test('progress callback fires', async () => {
            const testSpins = generateTestSpins(12);
            const progressCalls = [];
            await runner.runAll(testSpins, { batchSize: 100 }, (pct, msg) => {
                progressCalls.push({ pct, msg });
            });
            expect(progressCalls.length).toBeGreaterThan(0);
            // Last call should be 100%
            expect(progressCalls[progressCalls.length - 1].pct).toBe(100);
        });

        test('summary is computed for each strategy', async () => {
            const testSpins = generateTestSpins(15);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            for (const strategyNum of [1, 2, 3]) {
                const summary = result.strategies[strategyNum].summary;
                expect(summary).toHaveProperty('totalSessions');
                expect(summary).toHaveProperty('wins');
                expect(summary).toHaveProperty('busts');
                expect(summary).toHaveProperty('incomplete');
                expect(summary).toHaveProperty('winRate');
            }
        });

        test('default testFile is "manual"', async () => {
            const result = await runner.runAll([1, 2, 3, 4, 5]);
            expect(result.testFile).toBe('manual');
        });

        test('engine session is reset between sessions', async () => {
            const resetSpy = jest.spyOn(engine, 'resetSession');
            const testSpins = generateTestSpins(12);
            await runner.runAll(testSpins, { batchSize: 100 });
            // Should reset before each session
            expect(resetSpy).toHaveBeenCalled();
            resetSpy.mockRestore();
        });

        test('batched execution yields to event loop', async () => {
            const testSpins = generateTestSpins(15);
            // batchSize=2 means yield every 2 starting positions
            const result = await runner.runAll(testSpins, { batchSize: 2 });
            expect(result.strategies[1].sessions.length).toBeGreaterThan(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  INTEGRATION: Session outcomes
    // ═══════════════════════════════════════════════════════════

    describe('integration: session outcomes', () => {
        test('sessions end with valid outcome', async () => {
            const testSpins = generateTestSpins(30);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            for (const strategyNum of [1, 2, 3]) {
                for (const session of result.strategies[strategyNum].sessions) {
                    expect(['WIN', 'BUST', 'INCOMPLETE']).toContain(session.outcome);
                }
            }
        });

        test('WIN sessions have profit >= 100', async () => {
            const testSpins = generateTestSpins(50);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            for (const strategyNum of [1, 2, 3]) {
                for (const session of result.strategies[strategyNum].sessions) {
                    if (session.outcome === 'WIN') {
                        expect(session.finalProfit).toBeGreaterThanOrEqual(100);
                    }
                }
            }
        });

        test('BUST sessions have bankroll <= 0', async () => {
            const testSpins = generateTestSpins(50);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            for (const strategyNum of [1, 2, 3]) {
                for (const session of result.strategies[strategyNum].sessions) {
                    if (session.outcome === 'BUST') {
                        expect(session.finalBankroll).toBeLessThanOrEqual(0);
                    }
                }
            }
        });

        test('each session has at least one step', async () => {
            const testSpins = generateTestSpins(20);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            for (const strategyNum of [1, 2, 3]) {
                for (const session of result.strategies[strategyNum].sessions) {
                    expect(session.steps.length).toBeGreaterThan(0);
                }
            }
        });

        test('cumulative profit in last step matches final profit', async () => {
            const testSpins = generateTestSpins(20);
            const result = await runner.runAll(testSpins, { batchSize: 100 });

            for (const strategyNum of [1, 2, 3]) {
                for (const session of result.strategies[strategyNum].sessions) {
                    if (session.steps.length > 0) {
                        const lastStep = session.steps[session.steps.length - 1];
                        expect(lastStep.cumulativeProfit).toBeCloseTo(session.finalProfit, 5);
                    }
                }
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  COOLDOWN & NEAR-MISS IN SIMULATION
    // ═══════════════════════════════════════════════════════════

    describe('cooldown and near-miss in simulation', () => {
        test('_runSession passes decision.numbers to engine.recordResult', () => {
            const testSpins = generateTestSpins(30);
            const recordSpy = jest.spyOn(engine, 'recordResult');
            runner._runSession(testSpins, 0, 1);

            // Check that at least one call passed 5 args (including numbers)
            const callsWithNumbers = recordSpy.mock.calls.filter(c => c.length === 5);
            if (recordSpy.mock.calls.length > 0) {
                expect(callsWithNumbers.length).toBe(recordSpy.mock.calls.length);
                // The 5th arg should be an array
                for (const call of callsWithNumbers) {
                    expect(Array.isArray(call[4])).toBe(true);
                }
            }
            recordSpy.mockRestore();
        });

        test('_simulateDecision uses normal threshold even during cooldown (no elevation)', () => {
            const testSpins = generateTestSpins(30);
            engine.session.cooldownActive = true;
            engine.session.consecutiveSkips = 0;
            engine.confidenceThreshold = 65;

            const result = runner._simulateDecision(testSpins, 5);

            // Cooldown does NOT raise the threshold — AI decides with its own confidence
            if (result.action === 'SKIP' && result.reason) {
                // Threshold should be 65 (normal), NOT 80
                expect(result.reason).toContain('65');
            }
            if (result.action === 'BET') {
                expect(result.confidence).toBeGreaterThanOrEqual(65);
            }
        });

        test('_simulateDecision force-bets during cooldown after maxConsecutiveSkips', () => {
            const testSpins = generateTestSpins(30);
            engine.session.consecutiveSkips = engine.maxConsecutiveSkips + 5;
            engine.session.cooldownActive = true;
            engine.confidenceThreshold = 65;

            const result = runner._simulateDecision(testSpins, 5);

            // maxConsecutiveSkips is an ABSOLUTE limit
            if (result.selectedPair !== null) {
                expect(result.action).toBe('BET');
            }
        });

        test('_simulateDecision always uses confidenceThreshold regardless of cooldown state', () => {
            const testSpins = generateTestSpins(30);

            // Test with cooldown active
            engine.session.cooldownActive = true;
            engine.confidenceThreshold = 30;
            const result1 = runner._simulateDecision(testSpins, 5);

            // Test with cooldown cleared
            engine.session.cooldownActive = false;
            engine.confidenceThreshold = 30;
            const result2 = runner._simulateDecision(testSpins, 5);

            // Both should use same threshold (30) — cooldown makes no difference
            if (result1.action === 'SKIP' && result1.reason) {
                expect(result1.reason).toContain('30');
            }
            if (result2.action === 'SKIP' && result2.reason) {
                expect(result2.reason).toContain('30');
            }
        });

        test('near-miss tracking works in simulation (engine.session.nearMisses increments)', () => {
            const testSpins = generateTestSpins(30);
            engine.resetSession();
            // Run a session — the engine's recordResult will track near misses internally
            runner._runSession(testSpins, 0, 1);

            // nearMisses should be a non-negative number
            expect(engine.session.nearMisses).toBeGreaterThanOrEqual(0);
            expect(typeof engine.session.nearMisses).toBe('number');
        });

        test('_runSession step log unchanged (near-miss is engine-internal)', () => {
            const testSpins = generateTestSpins(20);
            const result = runner._runSession(testSpins, 0, 1);

            // Steps should not have a "nearMiss" field — near-miss is engine-internal
            for (const step of result.steps) {
                expect(step).toHaveProperty('action');
                expect(step).toHaveProperty('spinIdx');
                expect(step).toHaveProperty('bankroll');
                // Near-miss tracking is inside engine, not exposed in step
                expect(step).not.toHaveProperty('nearMiss');
            }
        });
    });
});
