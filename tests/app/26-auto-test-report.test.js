/**
 * Test Suite 26: Auto Test Report — 100% Coverage
 *
 * Tests the AutoTestReport class: Excel workbook generation,
 * overview/strategy/session sheets, styling, and save functionality.
 *
 * Uses a mock ExcelJS to avoid needing the real library in tests.
 */

const { AutoTestReport, STRATEGY_LABELS } = require('../../app/auto-test-report');

// ── Mock ExcelJS ──
// Provides just enough API surface to test report generation

class MockCell {
    constructor() {
        this.value = null;
        this.font = {};
        this.fill = {};
        this.alignment = {};
        this.border = {};
    }
}

class MockRow {
    constructor() {
        this.cells = {};
    }
    getCell(col) {
        if (!this.cells[col]) this.cells[col] = new MockCell();
        return this.cells[col];
    }
}

class MockWorksheet {
    constructor(name) {
        this.name = name;
        this.rows = {};
        this.columns = [];
        this.autoFilter = null;
        this.views = [];
        this.mergedCells = [];
    }
    getRow(num) {
        if (!this.rows[num]) this.rows[num] = new MockRow();
        return this.rows[num];
    }
    getCell(ref) {
        // Parse A1-style refs
        const col = ref.charCodeAt(0) - 64; // A=1, B=2 etc
        const row = parseInt(ref.substring(1));
        return this.getRow(row).getCell(col);
    }
    mergeCells(range) {
        this.mergedCells.push(range);
    }
}

class MockWorkbook {
    constructor() {
        this.worksheets = [];
        this.creator = '';
        this.created = null;
        this.xlsx = {
            writeBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100))
        };
    }
    addWorksheet(name) {
        const ws = new MockWorksheet(name);
        this.worksheets.push(ws);
        return ws;
    }
}

const MockExcelJS = {
    Workbook: MockWorkbook
};

// ── Test data helpers ──

function createMockResult() {
    return {
        testFile: 'test-data.txt',
        totalTestSpins: 500,
        trainedOn: '6 pairs trained',
        timestamp: '2026-02-22T10:00:00.000Z',
        strategies: {
            1: {
                sessions: [
                    createMockSession(0, 1, 'WIN', 100, 20),
                    createMockSession(1, 1, 'BUST', -4000, 50),
                    createMockSession(2, 1, 'INCOMPLETE', 30, 100),
                ],
                summary: {
                    totalSessions: 3, wins: 1, busts: 1, incomplete: 1,
                    winRate: 0.5, avgSpinsToWin: 20, avgSpinsToBust: 50,
                    totalProfit: -3900, totalWon: 2100, totalLost: 6000,
                    avgProfit: -1290, maxDrawdown: 4000,
                    bestSession: { startIdx: 0, finalProfit: 100 },
                    worstSession: { startIdx: 1, finalProfit: -4000 }
                }
            },
            2: {
                sessions: [
                    createMockSession(0, 2, 'WIN', 100, 25),
                    createMockSession(1, 2, 'WIN', 100, 30),
                ],
                summary: {
                    totalSessions: 2, wins: 2, busts: 0, incomplete: 0,
                    winRate: 1.0, avgSpinsToWin: 27.5, avgSpinsToBust: 0,
                    totalProfit: 200, totalWon: 500, totalLost: 300,
                    avgProfit: 100, maxDrawdown: 50,
                    bestSession: { startIdx: 0, finalProfit: 100 },
                    worstSession: { startIdx: 1, finalProfit: 100 }
                }
            },
            3: {
                sessions: [],
                summary: {
                    totalSessions: 0, wins: 0, busts: 0, incomplete: 0,
                    winRate: 0, avgSpinsToWin: 0, avgSpinsToBust: 0,
                    totalProfit: 0, totalWon: 0, totalLost: 0,
                    avgProfit: 0, maxDrawdown: 0,
                    bestSession: { startIdx: 0, finalProfit: 0 },
                    worstSession: { startIdx: 0, finalProfit: 0 }
                }
            }
        }
    };
}

function createMockSession(startIdx, strategy, outcome, profit, spins) {
    return {
        startIdx,
        strategy,
        outcome,
        finalBankroll: 4000 + profit,
        finalProfit: profit,
        totalSpins: spins,
        totalBets: Math.floor(spins * 0.7),
        totalSkips: Math.ceil(spins * 0.3),
        wins: outcome === 'WIN' ? 3 : 1,
        losses: outcome === 'BUST' ? 10 : 2,
        winRate: outcome === 'WIN' ? 0.6 : 0.1,
        maxDrawdown: outcome === 'BUST' ? 4000 : 50,
        peakProfit: outcome === 'WIN' ? profit : 20,
        steps: [
            {
                spinIdx: startIdx + 3, spinNumber: 15, nextNumber: 22,
                action: 'BET', selectedPair: 'prev', selectedFilter: 'zero_positive',
                predictedNumbers: [15, 19, 4, 32, 0], confidence: 72,
                betPerNumber: 2, numbersCount: 5, hit: true,
                pnl: 60, bankroll: 4060, cumulativeProfit: 60
            },
            {
                spinIdx: startIdx + 4, spinNumber: 22, nextNumber: 7,
                action: 'SKIP', selectedPair: null, selectedFilter: null,
                predictedNumbers: [], confidence: 30,
                betPerNumber: 2, numbersCount: 0, hit: false,
                pnl: 0, bankroll: 4060, cumulativeProfit: 60
            },
            {
                spinIdx: startIdx + 5, spinNumber: 7, nextNumber: 33,
                action: 'BET', selectedPair: 'prevPlus1', selectedFilter: 'both_both',
                predictedNumbers: [1, 20, 14, 31, 9, 22], confidence: 55,
                betPerNumber: 2, numbersCount: 6, hit: false,
                pnl: -12, bankroll: 4048, cumulativeProfit: 48
            }
        ]
    };
}

describe('AutoTestReport', () => {
    let report;

    beforeEach(() => {
        report = new AutoTestReport(MockExcelJS);
    });

    // ═══════════════════════════════════════════════════════════
    //  EXPORTED CONSTANTS
    // ═══════════════════════════════════════════════════════════

    describe('exported constants', () => {
        test('STRATEGY_LABELS has 3 entries', () => {
            expect(STRATEGY_LABELS[1]).toBe('Strategy 1 - Aggressive');
            expect(STRATEGY_LABELS[2]).toBe('Strategy 2 - Conservative');
            expect(STRATEGY_LABELS[3]).toBe('Strategy 3 - Cautious');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    describe('constructor', () => {
        test('stores ExcelJS reference', () => {
            expect(report.ExcelJS).toBe(MockExcelJS);
        });

        test('throws if ExcelJS is null', () => {
            expect(() => new AutoTestReport(null)).toThrow('requires ExcelJS');
        });

        test('throws if ExcelJS is undefined', () => {
            expect(() => new AutoTestReport(undefined)).toThrow('requires ExcelJS');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  generate
    // ═══════════════════════════════════════════════════════════

    describe('generate', () => {
        test('returns a workbook', () => {
            const result = createMockResult();
            const workbook = report.generate(result);
            expect(workbook).toBeInstanceOf(MockWorkbook);
        });

        test('creates Overview sheet', () => {
            const result = createMockResult();
            const workbook = report.generate(result);
            const overviewSheet = workbook.worksheets.find(s => s.name === 'Overview');
            expect(overviewSheet).toBeDefined();
        });

        test('creates strategy sheets for non-empty strategies', () => {
            const result = createMockResult();
            const workbook = report.generate(result);
            const sheetNames = workbook.worksheets.map(s => s.name);

            expect(sheetNames).toContain('Strategy 1 - Aggressive');
            expect(sheetNames).toContain('Strategy 2 - Conservative');
            // Strategy 3 has no sessions, so no sheet
            expect(sheetNames).not.toContain('Strategy 3 - Cautious');
        });

        test('creates session detail sheets for ALL sessions in order', () => {
            const result = createMockResult();
            const workbook = report.generate(result);
            const detailSheets = workbook.worksheets.filter(s => /^S\d+-Start/.test(s.name));

            // Strategy 1 has 3 sessions + Strategy 2 has 2 = 5 detail sheets
            expect(detailSheets.length).toBe(5);

            // Tabs should be in sequential order: S1-Start0, S1-Start1, S1-Start2, S2-Start0, S2-Start1
            expect(detailSheets[0].name).toBe('S1-Start0');
            expect(detailSheets[1].name).toBe('S1-Start1');
            expect(detailSheets[2].name).toBe('S1-Start2');
            expect(detailSheets[3].name).toBe('S2-Start0');
            expect(detailSheets[4].name).toBe('S2-Start1');
        });

        test('handles empty result', () => {
            const result = createMockResult();
            result.strategies[1].sessions = [];
            result.strategies[2].sessions = [];
            const workbook = report.generate(result);
            // Should at least have Overview
            expect(workbook.worksheets.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _getTopSessions
    // ═══════════════════════════════════════════════════════════

    describe('_getTopSessions', () => {
        test('returns top N best and worst sessions', () => {
            const sessions = [
                { startIdx: 0, strategy: 1, finalProfit: 100 },
                { startIdx: 1, strategy: 1, finalProfit: -4000 },
                { startIdx: 2, strategy: 1, finalProfit: 50 },
                { startIdx: 3, strategy: 1, finalProfit: -100 },
                { startIdx: 4, strategy: 1, finalProfit: 80 },
            ];
            const top = report._getTopSessions(sessions, 2);
            // Top 2 best: 100, 80. Top 2 worst: -4000, -100
            expect(top.length).toBeLessThanOrEqual(4);
            expect(top.some(s => s.finalProfit === 100)).toBe(true);
            expect(top.some(s => s.finalProfit === -4000)).toBe(true);
        });

        test('deduplicates sessions', () => {
            const sessions = [
                { startIdx: 0, strategy: 1, finalProfit: 100 },
            ];
            const top = report._getTopSessions(sessions, 3);
            expect(top.length).toBe(1);
        });

        test('handles fewer sessions than N', () => {
            const sessions = [
                { startIdx: 0, strategy: 1, finalProfit: 50 },
                { startIdx: 1, strategy: 1, finalProfit: -50 },
            ];
            const top = report._getTopSessions(sessions, 5);
            expect(top.length).toBe(2);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _createOverviewSheet
    // ═══════════════════════════════════════════════════════════

    describe('_createOverviewSheet', () => {
        test('creates sheet with title', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);

            const titleCell = sheet.getRow(1).getCell(1);
            expect(titleCell.value).toBe('Auto Test Report');
            expect(titleCell.font.bold).toBe(true);
        });

        test('includes file metadata', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);

            const fileCell = sheet.getCell('A2');
            expect(fileCell.value).toContain('test-data.txt');
        });

        test('has correct header row', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);

            const headerRow = sheet.getRow(5);
            expect(headerRow.getCell(1).value).toBe('Strategy');
            expect(headerRow.getCell(2).value).toBe('Sessions');
            expect(headerRow.getCell(6).value).toBe('Win Rate');
            expect(headerRow.getCell(1).font.bold).toBe(true);
        });

        test('has strategy data rows', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);

            // Row 6 = Strategy 1
            const s1Row = sheet.getRow(6);
            expect(s1Row.getCell(1).value).toContain('Aggressive');
            expect(s1Row.getCell(2).value).toBe(3); // totalSessions

            // Row 7 = Strategy 2
            const s2Row = sheet.getRow(7);
            expect(s2Row.getCell(1).value).toContain('Conservative');
            expect(s2Row.getCell(2).value).toBe(2);
        });

        test('strategy names are color-coded', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);

            // Strategy 1 = green
            expect(sheet.getRow(6).getCell(1).font.color.argb).toBe('FF28A745');
            // Strategy 2 = blue
            expect(sheet.getRow(7).getCell(1).font.color.argb).toBe('FF007BFF');
            // Strategy 3 = purple
            expect(sheet.getRow(8).getCell(1).font.color.argb).toBe('FF6F42C1');
        });

        test('sets column widths (14 columns: added Total Win $, Total Loss $, Total P&L)', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);
            expect(sheet.columns.length).toBe(14);
        });

        test('merges title cells across all 14 data columns', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);
            // A..N = 14 columns. Existing A..J merge was extended to fit
            // the three new dollar-total columns.
            expect(sheet.mergedCells).toContain('A1:N1');
        });

        test('header row includes Total Win $, Total Loss $, Total P&L', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);
            const headerRow = sheet.getRow(5);
            // Collect all 14 header values.
            const headers = [];
            for (let i = 1; i <= 14; i++) headers.push(headerRow.getCell(i).value);
            expect(headers).toContain('Total Win $');
            expect(headers).toContain('Total Loss $');
            expect(headers).toContain('Total P&L');
        });

        test('existing header labels still render (no regression)', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);
            const headerRow = sheet.getRow(5);
            const headers = [];
            for (let i = 1; i <= 14; i++) headers.push(headerRow.getCell(i).value);
            for (const h of ['Strategy', 'Sessions', 'Wins', 'Busts', 'Incomplete', 'Win Rate', 'Total Profit', 'Avg Profit', 'Avg Spins', 'Max Spins', 'Max Drawdown']) {
                expect(headers).toContain(h);
            }
        });

        test('data rows render dollar-total values from the summary', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createOverviewSheet(workbook, result);
            const headerRow = sheet.getRow(5);
            const headerValues = [];
            for (let i = 1; i <= 14; i++) headerValues.push(headerRow.getCell(i).value);
            const wonCol = headerValues.indexOf('Total Win $') + 1;
            const lostCol = headerValues.indexOf('Total Loss $') + 1;
            const plCol = headerValues.indexOf('Total P&L') + 1;
            expect(wonCol).toBeGreaterThan(0);

            // Strategy 1: totalWon=2100, totalLost=6000, totalProfit=-3900
            const s1 = sheet.getRow(6);
            expect(String(s1.getCell(wonCol).value)).toContain('2,100');
            expect(String(s1.getCell(lostCol).value)).toContain('6,000');
            expect(String(s1.getCell(plCol).value)).toContain('-3,900');

            // Strategy 2: totalWon=500, totalLost=300, totalProfit=200
            const s2 = sheet.getRow(7);
            expect(String(s2.getCell(wonCol).value)).toContain('500');
            expect(String(s2.getCell(lostCol).value)).toContain('300');
            expect(String(s2.getCell(plCol).value)).toContain('200');

            // Strategy 3 (empty): all three totals are $0
            const s3 = sheet.getRow(8);
            expect(String(s3.getCell(wonCol).value)).toBe('$0');
            expect(String(s3.getCell(lostCol).value)).toBe('$0');
            expect(String(s3.getCell(plCol).value)).toBe('$0');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _createStrategySheet
    // ═══════════════════════════════════════════════════════════

    describe('_createStrategySheet', () => {
        test('creates sheet with correct name', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);
            expect(sheet.name).toBe('Strategy 1 - Aggressive');
        });

        test('has correct column headers', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);

            const headerRow = sheet.getRow(1);
            expect(headerRow.getCell(1).value).toBe('#');
            expect(headerRow.getCell(3).value).toBe('Outcome');
            expect(headerRow.getCell(9).value).toBe('Profit');
            expect(headerRow.getCell(11).value).toBe('Details');
        });

        test('lists all sessions', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);

            // 3 sessions → rows 2, 3, 4
            expect(sheet.getRow(2).getCell(1).value).toBe(1);
            expect(sheet.getRow(3).getCell(1).value).toBe(2);
            expect(sheet.getRow(4).getCell(1).value).toBe(3);
        });

        test('color codes WIN outcomes green', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);

            // Row 2 = WIN
            const outcomeCell = sheet.getRow(2).getCell(3);
            expect(outcomeCell.value).toBe('WIN');
            expect(outcomeCell.font.color.argb).toBe('FF28A745');
            expect(outcomeCell.fill.fgColor.argb).toBe('FFD4EDDA');
        });

        test('color codes BUST outcomes red', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);

            // Row 3 = BUST
            const outcomeCell = sheet.getRow(3).getCell(3);
            expect(outcomeCell.value).toBe('BUST');
            expect(outcomeCell.font.color.argb).toBe('FFDC3545');
        });

        test('color codes INCOMPLETE outcomes gray', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);

            // Row 4 = INCOMPLETE
            const outcomeCell = sheet.getRow(4).getCell(3);
            expect(outcomeCell.value).toBe('INCOMPLETE');
            expect(outcomeCell.font.color.argb).toBe('FF6C757D');
        });

        test('sets auto-filter covering 11 columns', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);
            expect(sheet.autoFilter).toBeDefined();
            expect(sheet.autoFilter.from.row).toBe(1);
            expect(sheet.autoFilter.to.column).toBe(11);
        });

        test('freezes header row', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);
            expect(sheet.views.length).toBe(1);
            expect(sheet.views[0].state).toBe('frozen');
            expect(sheet.views[0].ySplit).toBe(1);
        });

        test('Details column has hyperlinks when detailSheetMap provided', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const detailSheetMap = {
                '1-0': 'S1-Start0',
                '1-1': 'S1-Start1',
                '1-2': 'S1-Start2'
            };
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1], detailSheetMap);

            // Row 2 = first session (startIdx 0)
            const detailCell = sheet.getRow(2).getCell(11);
            expect(detailCell.value).toEqual({ text: '→ View', hyperlink: "#'S1-Start0'!A1" });
            expect(detailCell.font.underline).toBe(true);
            expect(detailCell.font.color.argb).toBe('FF0563C1');
        });

        test('Details column shows -- when no detailSheetMap', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);

            const detailCell = sheet.getRow(2).getCell(11);
            expect(detailCell.value).toBe('--');
        });

        test('has 11 column widths', () => {
            const result = createMockResult();
            const workbook = new MockWorkbook();
            const sheet = report._createStrategySheet(workbook, 1, result.strategies[1]);
            expect(sheet.columns.length).toBe(11);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  _createSessionSheet
    // ═══════════════════════════════════════════════════════════

    describe('_createSessionSheet', () => {
        test('creates sheet with correct name format', () => {
            const session = createMockSession(42, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);
            expect(sheet.name).toBe('S1-Start42');
        });

        test('truncates long sheet names to 31 chars', () => {
            const session = createMockSession(123456789, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);
            expect(sheet.name.length).toBeLessThanOrEqual(31);
        });

        test('has summary row', () => {
            const session = createMockSession(0, 2, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 2);

            const summaryCell = sheet.getRow(1).getCell(1);
            expect(summaryCell.value).toContain('Strategy 2');
            expect(summaryCell.value).toContain('WIN');
            expect(summaryCell.font.bold).toBe(true);
        });

        test('has correct header row', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            const headerRow = sheet.getRow(3);
            expect(headerRow.getCell(1).value).toBe('Step');
            expect(headerRow.getCell(4).value).toBe('Action');
            expect(headerRow.getCell(11).value).toBe('P&L');
            expect(headerRow.getCell(12).value).toBe('Bankroll');
        });

        test('populates step data', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            // Row 4 = first step (BET)
            const row4 = sheet.getRow(4);
            expect(row4.getCell(1).value).toBe(1); // Step #
            expect(row4.getCell(4).value).toBe('BET'); // Action
            expect(row4.getCell(5).value).toBe('prev'); // Pair
        });

        test('colors positive P&L green', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            // Row 4 = first step (BET, pnl=60)
            const pnlCell = sheet.getRow(4).getCell(11);
            expect(pnlCell.font.color.argb).toBe('FF28A745');
        });

        test('colors negative P&L red', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            // Row 6 = third step (BET, pnl=-12)
            const pnlCell = sheet.getRow(6).getCell(11);
            expect(pnlCell.font.color.argb).toBe('FFDC3545');
        });

        test('colors hit YES green', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            // Row 4 = first step (hit=true)
            const hitCell = sheet.getRow(4).getCell(10);
            expect(hitCell.value).toBe('YES');
            expect(hitCell.font.color.argb).toBe('FF28A745');
        });

        test('colors hit NO red', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            // Row 6 = third step (hit=false)
            const hitCell = sheet.getRow(6).getCell(10);
            expect(hitCell.value).toBe('NO');
            expect(hitCell.font.color.argb).toBe('FFDC3545');
        });

        test('SKIP rows show -- for pair and filter', () => {
            const session = createMockSession(0, 1, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 1);

            // Row 5 = second step (SKIP)
            const row5 = sheet.getRow(5);
            expect(row5.getCell(4).value).toBe('SKIP');
            expect(row5.getCell(5).value).toBe('--');
            expect(row5.getCell(6).value).toBe('--');
            expect(row5.getCell(10).value).toBe('--');
        });

        test('has ← Back hyperlink to strategy sheet', () => {
            const session = createMockSession(0, 2, 'WIN', 100, 20);
            const workbook = new MockWorkbook();
            const sheet = report._createSessionSheet(workbook, session, 2);

            // Back link is in column 12 (L), row 1
            const backCell = sheet.getRow(1).getCell(12);
            expect(backCell.value).toEqual({ text: '← Back', hyperlink: "#'Strategy 2 - Conservative'!A1" });
            expect(backCell.font.underline).toBe(true);
            expect(backCell.font.color.argb).toBe('FF0563C1');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  saveToFile
    // ═══════════════════════════════════════════════════════════

    describe('saveToFile', () => {
        test('calls aiAPI.saveXlsx when available', async () => {
            const mockSave = jest.fn().mockResolvedValue(true);
            window.aiAPI = { saveXlsx: mockSave };

            const workbook = new MockWorkbook();
            const result = await report.saveToFile(workbook);

            expect(result).toBe(true);
            expect(mockSave).toHaveBeenCalled();

            delete window.aiAPI;
        });

        test('returns false when aiAPI.saveXlsx returns false', async () => {
            const mockSave = jest.fn().mockResolvedValue(false);
            window.aiAPI = { saveXlsx: mockSave };

            const workbook = new MockWorkbook();
            const result = await report.saveToFile(workbook);

            expect(result).toBe(false);
            delete window.aiAPI;
        });

        test('falls back to Blob download when URL.createObjectURL available', async () => {
            // Mock URL.createObjectURL for this test
            const origCreateObjectURL = URL.createObjectURL;
            const origRevokeObjectURL = URL.revokeObjectURL;
            URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
            URL.revokeObjectURL = jest.fn();

            const workbook = new MockWorkbook();
            const result = await report.saveToFile(workbook);

            expect(result).toBe(true);
            expect(URL.createObjectURL).toHaveBeenCalled();

            URL.createObjectURL = origCreateObjectURL;
            URL.revokeObjectURL = origRevokeObjectURL;
        });

        test('returns false when no Blob download and URL.createObjectURL unavailable', async () => {
            // In jsdom, URL.createObjectURL doesn't exist, so fallback returns false
            const workbook = new MockWorkbook();
            const result = await report.saveToFile(workbook);
            expect(result).toBe(false);
        });

        test('returns false when no save method available', async () => {
            // Remove window entirely
            const savedWindow = global.window;
            delete global.window;

            // Also need to handle the case where Blob doesn't exist
            const savedBlob = global.Blob;
            delete global.Blob;

            const workbook = new MockWorkbook();
            const result = await report.saveToFile(workbook);
            expect(result).toBe(false);

            global.window = savedWindow;
            global.Blob = savedBlob;
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  INTEGRATION
    // ═══════════════════════════════════════════════════════════

    describe('integration', () => {
        test('full generate produces workbook with correct sheet count', () => {
            const result = createMockResult();
            const workbook = report.generate(result);

            // Overview(1) + Strategy 1(1) + Strategy 2(1) = 3 summary sheets
            // + 3 detail tabs for Strategy 1 sessions + 2 detail tabs for Strategy 2 = 5
            // Total = 8 sheets
            // Strategy 3 has no sessions, so no sheet
            expect(workbook.worksheets.length).toBe(8);
            expect(workbook.worksheets[0].name).toBe('Overview');
        });

        test('workbook has creator set', () => {
            const result = createMockResult();
            const workbook = report.generate(result);
            expect(workbook.creator).toBe('Roulette Tracker Auto Test');
        });
    });
});
