/**
 * Phase 2 Step 5 — append-only AI-trained columns in auto-test-report.
 *
 * Drives `_createSessionSheet` directly against a mock workbook so we
 * can observe the exact cell values and column count.
 */

const { AutoTestReport } = require('../../app/auto-test-report');

// Minimal ExcelJS mock — just enough to observe header cells, data
// cells, and `sheet.columns` assignment.
class MockCell {
    constructor() { this.value = null; this.font = {}; this.fill = {}; this.alignment = {}; }
}
class MockRow {
    constructor() { this.cells = {}; }
    getCell(col) { if (!this.cells[col]) this.cells[col] = new MockCell(); return this.cells[col]; }
}
class MockSheet {
    constructor(name) {
        this.name = name; this.rows = {}; this.columns = [];
        this.mergedCells = []; this.views = [];
    }
    getRow(n) { if (!this.rows[n]) this.rows[n] = new MockRow(); return this.rows[n]; }
    getCell(ref) {
        // supports single-letter refs used by the report (A1, B3, ...)
        const col = ref.charCodeAt(0) - 64;
        const row = parseInt(ref.slice(1), 10);
        return this.getRow(row).getCell(col);
    }
    mergeCells(range) { this.mergedCells.push(range); }
}
class MockWorkbook {
    constructor() { this.sheets = []; this.creator = null; }
    addWorksheet(name) { const s = new MockSheet(name); this.sheets.push(s); return s; }
}

const MockExcelJS = {
    Workbook: MockWorkbook
};

function legacyStep(i, action, extra) {
    return Object.assign({
        spinIdx: i, spinNumber: 17, nextNumber: 34,
        action, selectedPair: 'prev', selectedFilter: 'both_both',
        predictedNumbers: [1, 2, 3], confidence: 50,
        betPerNumber: 2, numbersCount: 3, hit: false, pnl: 0,
        bankroll: 4000, cumulativeProfit: 0
    }, extra || {});
}

function aiDiag(overrides) {
    return Object.assign({
        entropy: 0.4, conflict: 0.2, historianMatch: 0.5,
        clusterStrength: 0.5, driftScore: 0.1,
        lossStreak: 0, ghostWin: false,
        spinIndex: 10, spinsSeen: 10
    }, overrides || {});
}

function aiStep(i, action, extra) {
    const step = legacyStep(i, action === 'BET' ? 'BET' : 'SKIP', extra);
    step.aiTrained = {
        action, phase: 'ACTIVE',
        selectedPair: null, selectedFilter: null,
        numbers: action === 'BET' ? [1, 2, 3] : [],
        shadowNumbers: action === 'SHADOW_PREDICT' ? [7, 8, 9] : undefined,
        shadowHit: action === 'SHADOW_PREDICT' ? (i % 2 === 0) : undefined,
        confidence: 0.7,
        reason: 'ai', zone: null,
        diagnostics: aiDiag({ spinIndex: i, spinsSeen: i + 1 }),
        reasoning: { signals: [], rejected: [] }
    };
    return step;
}

function run(session, strategyNum = 1) {
    const wb = new MockWorkbook();
    const report = new AutoTestReport(MockExcelJS);
    report._createSessionSheet(wb, session, strategyNum);
    return wb.sheets[wb.sheets.length - 1];
}

const LEGACY_HEADERS = ['Step', 'Spin#', 'Next#', 'Action', 'Pair', 'Filter',
    'Numbers', 'Conf%', 'Bet/Num', 'Hit', 'P&L', 'Bankroll'];
const AI_HEADERS = ['Phase', 'AI Action', 'AI Conf%', 'Shadow?'];

function readHeaderRow(sheet, maxCols) {
    const headerRow = sheet.getRow(3);
    const out = [];
    for (let c = 1; c <= maxCols; c++) {
        const cell = headerRow.cells[c];
        if (!cell || cell.value == null) break;
        out.push(cell.value);
    }
    return out;
}

describe('Step 5 — legacy sessions are byte-identical', () => {
    test('auto-test session: exactly 12 columns, headers unchanged', () => {
        const session = {
            startIdx: 0, strategy: 'Aggressive', outcome: 'INCOMPLETE',
            finalBankroll: 4000, finalProfit: 0, totalSpins: 2,
            totalBets: 1, totalSkips: 1, wins: 0, losses: 1,
            winRate: 0, maxDrawdown: 0, peakProfit: 0, reanalyzeCount: 0,
            steps: [
                legacyStep(0, 'WATCH'),
                legacyStep(1, 'BET', { hit: false, pnl: -6 }),
                legacyStep(2, 'SKIP')
            ]
        };
        const sheet = run(session);
        expect(readHeaderRow(sheet, 20)).toEqual(LEGACY_HEADERS);
        expect(sheet.columns.length).toBe(12);
    });

    test('T1-strategy session: exactly 12 columns, no AI-trained cells', () => {
        const session = {
            startIdx: 3, strategy: 'Aggressive', outcome: 'WIN',
            finalBankroll: 4100, finalProfit: 100, totalSpins: 5,
            totalBets: 3, totalSkips: 2, wins: 2, losses: 1,
            winRate: 2 / 3, maxDrawdown: 10, peakProfit: 100, reanalyzeCount: 0,
            steps: [
                legacyStep(0, 'WATCH'),
                legacyStep(1, 'BET', { hit: true, pnl: 66 }),
                legacyStep(2, 'SKIP')
            ]
        };
        const sheet = run(session);
        expect(readHeaderRow(sheet, 20)).toEqual(LEGACY_HEADERS);
        // No cells written beyond column 12 in the header row.
        expect(sheet.getRow(3).cells[13]).toBeUndefined();
        expect(sheet.columns.length).toBe(12);
    });
});

describe('Step 5 — AI-trained sessions get 4 append-only columns', () => {
    test('headers include Phase, AI Action, AI Conf%, Shadow? at positions 13..16', () => {
        const session = {
            startIdx: 0, strategy: 'Aggressive', outcome: 'INCOMPLETE',
            finalBankroll: 4000, finalProfit: 0, totalSpins: 4,
            totalBets: 1, totalSkips: 3, wins: 0, losses: 0,
            winRate: 0, maxDrawdown: 0, peakProfit: 0, reanalyzeCount: 0,
            steps: [
                legacyStep(0, 'WATCH'),
                aiStep(1, 'WAIT'),
                aiStep(2, 'SHADOW_PREDICT'),
                aiStep(3, 'BET', { hit: true, pnl: 66 })
            ]
        };
        const sheet = run(session);
        const headers = readHeaderRow(sheet, 20);
        expect(headers.slice(0, 12)).toEqual(LEGACY_HEADERS);
        expect(headers.slice(12)).toEqual(AI_HEADERS);
        expect(sheet.columns.length).toBe(16);
    });

    test('cell values for AI rows populate all 4 AI columns correctly', () => {
        const session = {
            startIdx: 0, strategy: 'Aggressive', outcome: 'INCOMPLETE',
            finalBankroll: 4000, finalProfit: 0, totalSpins: 3,
            totalBets: 1, totalSkips: 2, wins: 1, losses: 0,
            winRate: 1, maxDrawdown: 0, peakProfit: 0, reanalyzeCount: 0,
            steps: [
                aiStep(0, 'WAIT'),
                aiStep(1, 'SHADOW_PREDICT'),
                aiStep(2, 'BET', { hit: true, pnl: 66 })
            ]
        };
        const sheet = run(session);

        // Data rows begin at row 4.
        const row1 = sheet.getRow(4);  // WAIT
        expect(row1.cells[13].value).toBe('ACTIVE');
        expect(row1.cells[14].value).toBe('WAIT');
        expect(row1.cells[15].value).toBe('70%');
        expect(row1.cells[16].value).toBe('--');  // not SHADOW

        const row2 = sheet.getRow(5);  // SHADOW_PREDICT
        expect(row2.cells[14].value).toBe('SHADOW_PREDICT');
        // shadowHit comes from i%2===0 → i=1 → false → 'MISS'
        expect(['HIT', 'MISS', 'PENDING']).toContain(row2.cells[16].value);

        const row3 = sheet.getRow(6);  // BET
        expect(row3.cells[14].value).toBe('BET');
        expect(row3.cells[15].value).toBe('70%');
        expect(row3.cells[16].value).toBe('--');
    });

    test('non-AI rows in an AI-trained session (WATCH) get blank placeholders, not missing cells', () => {
        const session = {
            startIdx: 0, strategy: 'Aggressive', outcome: 'INCOMPLETE',
            finalBankroll: 4000, finalProfit: 0, totalSpins: 2,
            totalBets: 0, totalSkips: 2, wins: 0, losses: 0,
            winRate: 0, maxDrawdown: 0, peakProfit: 0, reanalyzeCount: 0,
            steps: [
                legacyStep(0, 'WATCH'),
                aiStep(1, 'WAIT')
            ]
        };
        const sheet = run(session);
        const watchRow = sheet.getRow(4);
        // columns 13..16 exist and are '--'
        for (let c = 13; c <= 16; c++) {
            expect(watchRow.cells[c]).toBeDefined();
            expect(watchRow.cells[c].value).toBe('--');
        }
    });

    test('confidence formatting: 0.0, 0.5, 1.0 → 0%, 50%, 100%', () => {
        const mk = (conf) => {
            const s = aiStep(0, 'BET', { hit: true });
            s.aiTrained.confidence = conf;
            return s;
        };
        const session = {
            startIdx: 0, strategy: 'Aggressive', outcome: 'INCOMPLETE',
            finalBankroll: 4000, finalProfit: 0, totalSpins: 3,
            totalBets: 3, totalSkips: 0, wins: 3, losses: 0,
            winRate: 1, maxDrawdown: 0, peakProfit: 0, reanalyzeCount: 0,
            steps: [mk(0), mk(0.5), mk(1)]
        };
        const sheet = run(session);
        expect(sheet.getRow(4).cells[15].value).toBe('0%');
        expect(sheet.getRow(5).cells[15].value).toBe('50%');
        expect(sheet.getRow(6).cells[15].value).toBe('100%');
    });
});
