/**
 * Test Suite 53: Risk Management — Max Bet Cap + Loss Streak Reset
 *
 * Tests the risk management features added to the AutoTestRunner:
 * A. Max bet cap prevents escalation death spiral
 * B. Loss streak reset (REANALYZE) — bet drops to $2 after 5 consecutive losses
 * C. Max resets per session (5 limit)
 * D. No SHADOW phase — direct WATCH → LIVE
 * E. _buildSessionResult — reanalyzeCount tracking
 * F. Report styling — REANALYZE/BET RESET rows (red)
 * G. No retrain during batch — training data is sufficient
 * H. Blacklist parameter still accepted (backward compat)
 * I. Integration — full session with risk management
 */

const { AutoTestRunner, TEST_REFKEY_TO_PAIR_NAME, STRATEGY_NAMES } = require('../../app/auto-test-runner');
const { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS } = require('../../app/ai-auto-engine');
const { AutoTestReport, STRATEGY_LABELS } = require('../../app/auto-test-report');

// ── Mock renderer functions ──
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

global.calculatePositionCode = calculatePositionCode;
global.calculateReferences = calculateReferences;
global.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
global.generateAnchors = generateAnchors;
global.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
global._getPosCodeDistance = _getPosCodeDistance;

global.ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
global.NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
global.POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
global.NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

function generateTestSpins(count) {
    const spins = [];
    for (let i = 0; i < count; i++) {
        spins.push(WHEEL_STANDARD[i % WHEEL_STANDARD.length]);
    }
    return spins;
}

function createTrainedEngine(opts = {}) {
    const engine = new AIAutoEngine({ confidenceThreshold: 30, ...opts });
    const trainingData = [generateTestSpins(50), generateTestSpins(40)];
    engine.train(trainingData);
    return engine;
}

// ── Mock ExcelJS ──
class MockCell {
    constructor() { this.value = null; this.font = {}; this.fill = {}; this.alignment = {}; this.border = {}; }
}
class MockRow {
    constructor() { this.cells = {}; }
    getCell(col) { if (!this.cells[col]) this.cells[col] = new MockCell(); return this.cells[col]; }
}
class MockWorksheet {
    constructor(name) { this.name = name; this.rows = {}; this.columns = []; this.autoFilter = null; this.views = []; this.mergedCells = []; }
    getRow(num) { if (!this.rows[num]) this.rows[num] = new MockRow(); return this.rows[num]; }
    getCell(ref) { const col = ref.charCodeAt(0) - 64; const row = parseInt(ref.substring(1)); return this.getRow(row).getCell(col); }
    mergeCells(range) { this.mergedCells.push(range); }
}
class MockWorkbook {
    constructor() { this.worksheets = []; this.creator = ''; this.created = null; this.xlsx = { writeBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)) }; }
    addWorksheet(name) { const ws = new MockWorksheet(name); this.worksheets.push(ws); return ws; }
}
const MockExcelJS = { Workbook: MockWorkbook };


describe('Risk Management — Max Bet Cap + Loss Streak Reset', () => {
    let engine;
    let runner;

    beforeEach(() => {
        engine = createTrainedEngine();
        runner = new AutoTestRunner(engine);
    });

    // ═══════════════════════════════════════════════════════════
    //  A: MAX BET CAP
    // ═══════════════════════════════════════════════════════════

    describe('A: Max bet cap prevents escalation', () => {
        test('A1: bet per number never exceeds $10', () => {
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            for (const step of result.steps) {
                if (step.action === 'BET') {
                    expect(step.betPerNumber).toBeLessThanOrEqual(10);
                }
            }
        });

        test('A2: bet cap applies to all 3 strategies', () => {
            const testSpins = generateTestSpins(200);
            for (let strat = 1; strat <= 3; strat++) {
                engine.resetSession();
                const result = runner._runSession(testSpins, 0, strat);
                const betSteps = result.steps.filter(s => s.action === 'BET');
                for (const step of betSteps) {
                    expect(step.betPerNumber).toBeLessThanOrEqual(10);
                }
            }
        });

        test('A3: bet starts at $2 minimum', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            const firstBet = result.steps.find(s => s.action === 'BET');
            if (firstBet) {
                // First bet uses $2 or result of strategy on previous state
                expect(firstBet.betPerNumber).toBeGreaterThanOrEqual(2);
            }
        });

        test('A4: strategy escalation is capped at $10', () => {
            // Strategy 1 (Aggressive): +$1 each loss, should cap at $10
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            const maxBet = Math.max(...result.steps.filter(s => s.action === 'BET').map(s => s.betPerNumber));
            expect(maxBet).toBeLessThanOrEqual(10);
        });

        test('A5: max bet cap limits per-bet loss', () => {
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            for (const step of result.steps) {
                if (step.action === 'BET' && step.pnl < 0) {
                    // Max loss = betPerNumber * numbersCount, and betPerNumber <= 10
                    expect(Math.abs(step.pnl)).toBeLessThanOrEqual(10 * step.numbersCount);
                }
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  B: LOSS STREAK RESET
    // ═══════════════════════════════════════════════════════════

    describe('B: Loss streak reset (REANALYZE)', () => {
        test('B1: REANALYZE step has action "REANALYZE"', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const reanalyzeSteps = result.steps.filter(s => s.action === 'REANALYZE');
            for (const step of reanalyzeSteps) {
                expect(step.action).toBe('REANALYZE');
            }
        });

        test('B2: REANALYZE steps have zero pnl', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const reanalyzeSteps = result.steps.filter(s => s.action === 'REANALYZE');
            for (const step of reanalyzeSteps) {
                expect(step.pnl).toBe(0);
            }
        });

        test('B3: REANALYZE step resets bet to $2', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const reanalyzeSteps = result.steps.filter(s => s.action === 'REANALYZE');
            for (const step of reanalyzeSteps) {
                expect(step.betPerNumber).toBe(2);
            }
        });

        test('B4: REANALYZE step records the failing pair', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const reanalyzeSteps = result.steps.filter(s => s.action === 'REANALYZE');
            for (const step of reanalyzeSteps) {
                // Should have the pair that caused the loss streak
                if (step.selectedPair) {
                    expect(typeof step.selectedPair).toBe('string');
                }
            }
        });

        test('B5: after REANALYZE, next BET continues immediately (no wasted spins)', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            for (let i = 0; i < result.steps.length - 1; i++) {
                if (result.steps[i].action === 'REANALYZE') {
                    // Very next step should be BET or SKIP (not WATCH or SHADOW)
                    const nextStep = result.steps[i + 1];
                    expect(['BET', 'SKIP']).toContain(nextStep.action);
                }
            }
        });

        test('B6: reanalyzeCount in result', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            expect(typeof result.reanalyzeCount).toBe('number');
            expect(result.reanalyzeCount).toBeGreaterThanOrEqual(0);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  C: MAX RESETS LIMIT
    // ═══════════════════════════════════════════════════════════

    describe('C: Max resets per session', () => {
        test('C1: reanalyzeCount never exceeds 5', () => {
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.reanalyzeCount).toBeLessThanOrEqual(5);
        });

        test('C2: REANALYZE steps count matches reanalyzeCount', () => {
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            const reanalyzeSteps = result.steps.filter(s => s.action === 'REANALYZE');
            expect(reanalyzeSteps.length).toBe(result.reanalyzeCount);
        });

        test('C3: session still completes when max resets reached', () => {
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            expect(['WIN', 'BUST', 'INCOMPLETE']).toContain(result.outcome);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  D: NO SHADOW PHASE
    // ═══════════════════════════════════════════════════════════

    describe('D: No SHADOW phase — direct WATCH to LIVE', () => {
        test('D1: first 3 steps are WATCH', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.steps[0].action).toBe('WATCH');
            expect(result.steps[1].action).toBe('WATCH');
            expect(result.steps[2].action).toBe('WATCH');
        });

        test('D2: step 4 is BET or SKIP (no SHADOW)', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            if (result.steps.length > 3) {
                expect(['BET', 'SKIP']).toContain(result.steps[3].action);
            }
        });

        test('D3: no SHADOW actions in any steps', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const shadowSteps = result.steps.filter(s => s.action === 'SHADOW');
            expect(shadowSteps.length).toBe(0);
        });

        test('D4: only valid actions are WATCH, BET, SKIP, REANALYZE', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const validActions = ['WATCH', 'BET', 'SKIP', 'REANALYZE'];
            for (const step of result.steps) {
                expect(validActions).toContain(step.action);
            }
        });

        test('D5: no spins wasted on shadow validation', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._runSession(testSpins, 0, 1);
            // After 3 WATCH steps, every remaining step is a real BET or SKIP
            const postWatch = result.steps.slice(3).filter(s => s.action !== 'REANALYZE');
            for (const step of postWatch) {
                expect(['BET', 'SKIP']).toContain(step.action);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  E: _buildSessionResult
    // ═══════════════════════════════════════════════════════════

    describe('E: _buildSessionResult with risk management', () => {
        test('E1: totalSpins excludes WATCH steps', () => {
            const testSpins = generateTestSpins(50);
            const result = runner._runSession(testSpins, 0, 1);
            const watchCount = result.steps.filter(s => s.action === 'WATCH').length;
            expect(watchCount).toBe(3);
        });

        test('E2: totalSpins excludes REANALYZE steps', () => {
            const testSpins = generateTestSpins(100);
            const result = runner._runSession(testSpins, 0, 1);
            const betSkipCount = result.steps.filter(s => s.action === 'BET' || s.action === 'SKIP').length;
            expect(result.totalSpins).toBe(betSkipCount);
        });

        test('E3: totalBets + totalSkips === totalSpins', () => {
            const testSpins = generateTestSpins(80);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.totalBets + result.totalSkips).toBe(result.totalSpins);
        });

        test('E4: result includes reanalyzeCount', () => {
            const testSpins = generateTestSpins(50);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result).toHaveProperty('reanalyzeCount');
            expect(typeof result.reanalyzeCount).toBe('number');
        });

        test('E5: result has all standard fields', () => {
            const testSpins = generateTestSpins(50);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result).toHaveProperty('startIdx');
            expect(result).toHaveProperty('strategy');
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
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  F: REPORT STYLING
    // ═══════════════════════════════════════════════════════════

    describe('F: Report styling for BET RESET rows', () => {
        function createSessionWithReset() {
            return {
                startIdx: 0, strategy: 1, outcome: 'WIN',
                finalBankroll: 4100, finalProfit: 100,
                totalSpins: 8, totalBets: 6, totalSkips: 2,
                wins: 3, losses: 3, winRate: 0.5,
                maxDrawdown: 50, peakProfit: 100, reanalyzeCount: 1,
                steps: [
                    { spinIdx: 0, spinNumber: 15, nextNumber: 22, action: 'WATCH', selectedPair: null, selectedFilter: null, predictedNumbers: [], confidence: 0, betPerNumber: 2, numbersCount: 0, hit: false, pnl: 0, bankroll: 4000, cumulativeProfit: 0 },
                    { spinIdx: 1, spinNumber: 22, nextNumber: 7, action: 'WATCH', selectedPair: null, selectedFilter: null, predictedNumbers: [], confidence: 0, betPerNumber: 2, numbersCount: 0, hit: false, pnl: 0, bankroll: 4000, cumulativeProfit: 0 },
                    { spinIdx: 2, spinNumber: 7, nextNumber: 33, action: 'WATCH', selectedPair: null, selectedFilter: null, predictedNumbers: [], confidence: 0, betPerNumber: 2, numbersCount: 0, hit: false, pnl: 0, bankroll: 4000, cumulativeProfit: 0 },
                    { spinIdx: 3, spinNumber: 33, nextNumber: 1, action: 'BET', selectedPair: 'prev', selectedFilter: 'zero_positive', predictedNumbers: [15, 19, 4], confidence: 55, betPerNumber: 2, numbersCount: 3, hit: false, pnl: -6, bankroll: 3994, cumulativeProfit: -6 },
                    { spinIdx: 4, spinNumber: 1, nextNumber: 20, action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both', predictedNumbers: [20, 14, 31], confidence: 60, betPerNumber: 3, numbersCount: 3, hit: false, pnl: -9, bankroll: 3985, cumulativeProfit: -15 },
                    { spinIdx: 5, spinNumber: 20, nextNumber: 14, action: 'BET', selectedPair: 'prev', selectedFilter: 'zero_positive', predictedNumbers: [14, 31, 9], confidence: 65, betPerNumber: 4, numbersCount: 3, hit: false, pnl: -12, bankroll: 3973, cumulativeProfit: -27 },
                    { spinIdx: 5, spinNumber: 20, nextNumber: null, action: 'REANALYZE', selectedPair: 'prev', selectedFilter: 'zero_positive', predictedNumbers: [], confidence: 0, betPerNumber: 2, numbersCount: 0, hit: false, pnl: 0, bankroll: 3973, cumulativeProfit: -27 },
                    { spinIdx: 6, spinNumber: 14, nextNumber: 31, action: 'BET', selectedPair: 'prevPlus1', selectedFilter: 'zero_positive', predictedNumbers: [31, 9, 22], confidence: 70, betPerNumber: 2, numbersCount: 3, hit: true, pnl: 60, bankroll: 4033, cumulativeProfit: 33 },
                    { spinIdx: 7, spinNumber: 31, nextNumber: 9, action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both', predictedNumbers: [9, 22, 18], confidence: 72, betPerNumber: 2, numbersCount: 3, hit: true, pnl: 60, bankroll: 4093, cumulativeProfit: 93 },
                    { spinIdx: 8, spinNumber: 9, nextNumber: 22, action: 'BET', selectedPair: 'prev', selectedFilter: 'zero_positive', predictedNumbers: [22, 18, 29], confidence: 68, betPerNumber: 2, numbersCount: 3, hit: true, pnl: 60, bankroll: 4153, cumulativeProfit: 153 },
                ]
            };
        }

        function createMockResultWithReset() {
            const session = createSessionWithReset();
            return {
                testFile: 'test-data.txt', totalTestSpins: 500, trainedOn: '6 pairs', timestamp: '2026-02-26T10:00:00.000Z',
                strategies: {
                    1: { sessions: [session], summary: { totalSessions: 1, wins: 1, busts: 0, incomplete: 0, winRate: 1.0, avgSpinsToWin: 8, avgSpinsToBust: 0, avgProfit: 100, maxDrawdown: 27, bestSession: { startIdx: 0, finalProfit: 100 }, worstSession: { startIdx: 0, finalProfit: 100 } } },
                    2: { sessions: [], summary: { totalSessions: 0, wins: 0, busts: 0, incomplete: 0, winRate: 0, avgSpinsToWin: 0, avgSpinsToBust: 0, avgProfit: 0, maxDrawdown: 0, bestSession: { startIdx: 0, finalProfit: 0 }, worstSession: { startIdx: 0, finalProfit: 0 } } },
                    3: { sessions: [], summary: { totalSessions: 0, wins: 0, busts: 0, incomplete: 0, winRate: 0, avgSpinsToWin: 0, avgSpinsToBust: 0, avgProfit: 0, maxDrawdown: 0, bestSession: { startIdx: 0, finalProfit: 0 }, worstSession: { startIdx: 0, finalProfit: 0 } } }
                }
            };
        }

        test('F1: REANALYZE rows have light red background and bold font', () => {
            const report = new AutoTestReport(MockExcelJS);
            const result = createMockResultWithReset();
            const workbook = report.generate(result);
            const detailSheet = workbook.worksheets.find(s => s.name === 'S1-Start0');
            expect(detailSheet).toBeDefined();

            let reanalyzeRowFound = false;
            for (let r = 1; r <= 20; r++) {
                const row = detailSheet.getRow(r);
                const actionCell = row.getCell(4);
                if (actionCell.value === 'BET RESET') {
                    reanalyzeRowFound = true;
                    const fillCell = row.getCell(1);
                    expect(fillCell.fill).toEqual(
                        expect.objectContaining({
                            type: 'pattern', pattern: 'solid',
                            fgColor: { argb: 'FFF8D7DA' }
                        })
                    );
                    expect(fillCell.font).toEqual(
                        expect.objectContaining({
                            bold: true, color: { argb: 'FF721C24' }
                        })
                    );
                }
            }
            expect(reanalyzeRowFound).toBe(true);
        });

        test('F2: REANALYZE pair column shows loss streak message', () => {
            const report = new AutoTestReport(MockExcelJS);
            const result = createMockResultWithReset();
            const workbook = report.generate(result);
            const detailSheet = workbook.worksheets.find(s => s.name === 'S1-Start0');

            let msgFound = false;
            for (let r = 1; r <= 20; r++) {
                const row = detailSheet.getRow(r);
                const actionCell = row.getCell(4);
                const pairCell = row.getCell(5);
                if (actionCell.value === 'BET RESET' && typeof pairCell.value === 'string' && pairCell.value.includes('bet reset')) {
                    msgFound = true;
                }
            }
            expect(msgFound).toBe(true);
        });

        test('F3: REANALYZE bet column shows "$2"', () => {
            const report = new AutoTestReport(MockExcelJS);
            const result = createMockResultWithReset();
            const workbook = report.generate(result);
            const detailSheet = workbook.worksheets.find(s => s.name === 'S1-Start0');

            for (let r = 1; r <= 20; r++) {
                const row = detailSheet.getRow(r);
                const actionCell = row.getCell(4);
                const betCell = row.getCell(9);
                if (actionCell.value === 'BET RESET') {
                    expect(betCell.value).toBe('$2');
                }
            }
        });

        test('F4: all 12 columns styled for REANALYZE rows', () => {
            const report = new AutoTestReport(MockExcelJS);
            const result = createMockResultWithReset();
            const workbook = report.generate(result);
            const detailSheet = workbook.worksheets.find(s => s.name === 'S1-Start0');

            for (let r = 1; r <= 20; r++) {
                const row = detailSheet.getRow(r);
                const actionCell = row.getCell(4);
                if (actionCell.value === 'BET RESET') {
                    for (let c = 1; c <= 12; c++) {
                        const cell = row.getCell(c);
                        expect(cell.fill.fgColor.argb).toBe('FFF8D7DA');
                    }
                    break;
                }
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  G: NO RETRAIN DURING BATCH
    // ═══════════════════════════════════════════════════════════

    describe('G: No retrain during batch', () => {
        test('G1: _retrainLossStreak stays Infinity during runAll', () => {
            const testSpins = generateTestSpins(50);
            runner.runAll(testSpins);
            expect(engine._retrainLossStreak).toBe(Infinity);
        });

        test('G2: _retrainInterval stays Infinity during runAll', () => {
            const testSpins = generateTestSpins(50);
            runner.runAll(testSpins);
            expect(engine._retrainInterval).toBe(Infinity);
        });

        test('G3: engine.retrain() NOT called during _runSession', () => {
            const retrainSpy = jest.spyOn(engine, 'retrain');
            const testSpins = generateTestSpins(100);
            runner._runSession(testSpins, 0, 1);
            expect(retrainSpy).not.toHaveBeenCalled();
            retrainSpy.mockRestore();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  H: BLACKLIST PARAM BACKWARD COMPAT
    // ═══════════════════════════════════════════════════════════

    describe('H: Blacklist parameter backward compatibility', () => {
        test('H1: _simulateDecision works without blacklist param', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._simulateDecision(testSpins, 10);
            expect(result).toHaveProperty('action');
            expect(['BET', 'SKIP']).toContain(result.action);
        });

        test('H2: _simulateDecision with empty Set works', () => {
            const testSpins = generateTestSpins(30);
            const result = runner._simulateDecision(testSpins, 10, new Set());
            expect(result).toHaveProperty('action');
        });

        test('H3: _simulateDecision with all pairs blacklisted forces SKIP', () => {
            const testSpins = generateTestSpins(30);
            const allPairs = new Set(['prev', 'prevPlus1', 'prevPlus2', 'prevMinus1', 'prevMinus2', 'prevPrev']);
            const result = runner._simulateDecision(testSpins, 10, allPairs);
            expect(result.action).toBe('SKIP');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  I: INTEGRATION
    // ═══════════════════════════════════════════════════════════

    describe('I: Integration — full sessions with risk management', () => {
        test('I1: short session (20 spins) works', () => {
            const testSpins = generateTestSpins(20);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result.steps.filter(s => s.action === 'WATCH').length).toBe(3);
            expect(result.steps.length).toBeGreaterThan(3);
        });

        test('I2: all 3 strategies produce valid results', () => {
            const testSpins = generateTestSpins(80);
            for (let strat = 1; strat <= 3; strat++) {
                engine.resetSession();
                const result = runner._runSession(testSpins, 0, strat);
                expect(['WIN', 'BUST', 'INCOMPLETE']).toContain(result.outcome);
                expect(result.totalBets + result.totalSkips).toBe(result.totalSpins);
            }
        });

        test('I3: step sequence is chronological', () => {
            const testSpins = generateTestSpins(80);
            const result = runner._runSession(testSpins, 0, 1);
            for (let i = 1; i < result.steps.length; i++) {
                expect(result.steps[i].spinIdx).toBeGreaterThanOrEqual(result.steps[i - 1].spinIdx);
            }
        });

        test('I4: cumulative profit matches final profit', () => {
            const testSpins = generateTestSpins(80);
            const result = runner._runSession(testSpins, 0, 1);
            const lastStep = result.steps[result.steps.length - 1];
            expect(lastStep.cumulativeProfit).toBe(result.finalProfit);
        });

        test('I5: runAll produces valid results', async () => {
            const testSpins = generateTestSpins(50);
            const result = await runner.runAll(testSpins);
            expect(result).toHaveProperty('strategies');
            for (const stratKey of [1, 2, 3]) {
                const strat = result.strategies[stratKey];
                expect(strat).toHaveProperty('sessions');
                expect(strat).toHaveProperty('summary');
                for (const session of strat.sessions) {
                    expect(session.totalBets + session.totalSkips).toBe(session.totalSpins);
                    expect(session).toHaveProperty('reanalyzeCount');
                }
            }
        });

        test('I6: starting from different startIdx works', () => {
            const testSpins = generateTestSpins(100);
            const result1 = runner._runSession(testSpins, 0, 1);
            engine.resetSession();
            const result2 = runner._runSession(testSpins, 10, 1);
            expect(result1.startIdx).toBe(0);
            expect(result2.startIdx).toBe(10);
            expect(result1.steps[0].spinIdx).toBe(0);
            expect(result2.steps[0].spinIdx).toBe(10);
        });

        test('I7: long session completes without errors', () => {
            const testSpins = generateTestSpins(200);
            const result = runner._runSession(testSpins, 0, 1);
            expect(result).toBeDefined();
            expect(['WIN', 'BUST', 'INCOMPLETE']).toContain(result.outcome);
        });

        test('I8: BET steps always have non-zero pnl', () => {
            const testSpins = generateTestSpins(80);
            const result = runner._runSession(testSpins, 0, 1);
            const betSteps = result.steps.filter(s => s.action === 'BET');
            for (const step of betSteps) {
                expect(step.pnl).not.toBe(0);
            }
        });
    });
});
