/**
 * 57-money-report.test.js
 *
 * Tests for MoneyReport (app/money-report.js) and its integration with
 * the MoneyManagementPanel's new "Download Session Report" button.
 *
 * Groups:
 *   A. MoneyReport constructor + filename helper.
 *   B. Totals derivation (_computeTotals) parity with Auto Test fields.
 *   C. Workbook Overview sheet contains Auto-Test-parity headers and
 *      values, including "Total Win $", "Total Loss $", "Total P&L".
 *   D. Workbook Bet History sheet mirrors betHistory rows.
 *   E. saveToFile uses IPC path when available (with filename), else
 *      Blob+download fallback.
 *   F. MoneyManagementPanel renders the new Download button and wires
 *      it correctly — without altering pre-existing buttons/state.
 *   G. downloadSessionReport end-to-end: uses MoneyReport + the
 *      "session-result-..." filename; no mutation of live session state.
 */

const { setupDOM, createMoneyPanel } = require('../test-setup');
const { MoneyReport } = require('../../app/money-report');

// ── Minimal ExcelJS mock (same shape as tests/app/26-auto-test-report.test.js) ──
class MockCell {
    constructor() { this.value = null; this.font = {}; this.fill = {}; this.alignment = {}; this.border = {}; }
}
class MockRow {
    constructor() { this._cells = {}; }
    getCell(i) { if (!this._cells[i]) this._cells[i] = new MockCell(); return this._cells[i]; }
}
class MockWorksheet {
    constructor(name) {
        this.name = name;
        this._rows = {};
        this.columns = [];
        this.mergedCells = [];
    }
    getRow(i) { if (!this._rows[i]) this._rows[i] = new MockRow(); return this._rows[i]; }
    getCell(addr) {
        // Supports 'A1' / 'A2' / 'B6' etc. via a 2-col tuple.
        const m = addr.match(/^([A-Z]+)(\d+)$/);
        if (!m) throw new Error('bad cell ' + addr);
        const col = m[1].charCodeAt(0) - 64; // A=1
        const r = parseInt(m[2], 10);
        return this.getRow(r).getCell(col);
    }
    mergeCells(range) { this.mergedCells.push(range); }
}
class MockWorkbook {
    constructor() { this._sheets = {}; this.xlsx = { writeBuffer: async () => new ArrayBuffer(100) }; }
    addWorksheet(name) { const s = new MockWorksheet(name); this._sheets[name] = s; return s; }
    getWorksheet(name) { return this._sheets[name] || null; }
}
const MockExcelJS = { Workbook: MockWorkbook };

// ── Fixtures ────────────────────────────────────────────────────────
function makeSessionData(overrides = {}) {
    return Object.assign({
        startingBankroll: 4000,
        currentBankroll: 4250,
        sessionProfit: 250,
        sessionTarget: 100,
        totalBets: 8,
        totalWins: 5,
        totalLosses: 3,
        consecutiveLosses: 0,
        consecutiveWins: 2,
        isSessionActive: true,
        isBettingEnabled: true,
        bettingStrategy: 3,
        currentBetPerNumber: 2
    }, overrides);
}
function makeBetHistory() {
    // 5 wins at +$50 each, 3 losses at -$30 each → totalWon=250, totalLost=90, PL=160.
    const h = [];
    for (let i = 0; i < 5; i++) h.push({ spin: i + 1, betAmount: 2, totalBet: 24, hit: true,  actualNumber: 5,  netChange: 50, timestamp: `t${i}` });
    for (let i = 0; i < 3; i++) h.push({ spin: i + 6, betAmount: 2, totalBet: 24, hit: false, actualNumber: 11, netChange: -30, timestamp: `t${i + 5}` });
    return h;
}

// ═══════════════════════════════════════════════════════════════════
//  A. Constructor + filename helper
// ═══════════════════════════════════════════════════════════════════
describe('A. MoneyReport constructor + filename', () => {
    test('A1: constructor throws without an ExcelJS module', () => {
        expect(() => new MoneyReport()).toThrow(/ExcelJS/);
    });

    test('A2: buildFilename returns session-result-YYYY-MM-DD-HHmmss.xlsx', () => {
        const fixed = new Date(2026, 3, 18, 9, 5, 7); // month is 0-indexed → April
        expect(MoneyReport.buildFilename(fixed)).toBe('session-result-2026-04-18-090507.xlsx');
    });

    test('A3: buildFilename defaults to "now" when no date supplied', () => {
        const name = MoneyReport.buildFilename();
        expect(name).toMatch(/^session-result-\d{4}-\d{2}-\d{2}-\d{6}\.xlsx$/);
    });

    test('A4: filename prefix is exactly "session-result-" with a date suffix', () => {
        const name = MoneyReport.buildFilename(new Date(2026, 0, 1, 0, 0, 0));
        expect(name.startsWith('session-result-')).toBe(true);
        expect(name.endsWith('.xlsx')).toBe(true);
        // There IS a date suffix between the prefix and the extension.
        const middle = name.slice('session-result-'.length, -'.xlsx'.length);
        expect(middle).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  B. Totals derivation — Auto-Test parity
// ═══════════════════════════════════════════════════════════════════
describe('B. _computeTotals', () => {
    test('B1: totalWon / totalLost sum positive / negative netChange from betHistory', () => {
        const t = MoneyReport._computeTotals(makeSessionData(), makeBetHistory());
        expect(t.totalWon).toBe(250);  // 5 × 50
        expect(t.totalLost).toBe(90);  // 3 × 30
        expect(t.totalPL).toBe(160);   // 250 - 90
    });

    test('B2: winRate = wins / (wins + losses)', () => {
        const t = MoneyReport._computeTotals(makeSessionData({ totalWins: 4, totalLosses: 6 }), []);
        expect(t.winRate).toBeCloseTo(0.4, 5);
    });

    test('B3: totalProfit falls back to (won - lost) when sessionProfit is absent', () => {
        const t = MoneyReport._computeTotals({}, makeBetHistory());
        expect(t.totalProfit).toBe(160);
    });

    test('B4: empty betHistory yields zero totals (no NaN)', () => {
        const t = MoneyReport._computeTotals(makeSessionData({ totalBets: 0, totalWins: 0, totalLosses: 0 }), []);
        expect(t.totalWon).toBe(0);
        expect(t.totalLost).toBe(0);
        expect(t.winRate).toBe(0);
        expect(t.avgProfit).toBe(0);
    });

    test('B5: non-array betHistory is tolerated', () => {
        const t = MoneyReport._computeTotals(makeSessionData(), null);
        expect(t.totalWon).toBe(0);
        expect(t.totalLost).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  C. Overview sheet — Auto-Test parity headers
// ═══════════════════════════════════════════════════════════════════
describe('C. Overview sheet contents', () => {
    let rep, wb, overview;
    beforeEach(() => {
        rep = new MoneyReport(MockExcelJS);
        wb = rep.generate(makeSessionData(), makeBetHistory());
        overview = wb.getWorksheet('Overview');
    });

    test('C1: Overview sheet exists', () => {
        expect(overview).not.toBeNull();
        expect(overview.name).toBe('Overview');
    });

    // The MoneyReport Overview was widened to mirror the Auto Test
    // report columns (Session / Start Idx / Outcome / Total Spins /
    // Max Drawdown added). Header is on row 6, data on row 7, with
    // 18 total columns. Merge range is now A1:R1.
    const N_COLS = 18;

    test('C2: header row includes Total Win $, Total Loss $, Total P&L', () => {
        const headers = [];
        for (let i = 1; i <= N_COLS; i++) headers.push(overview.getRow(6).getCell(i).value);
        expect(headers).toContain('Total Win $');
        expect(headers).toContain('Total Loss $');
        expect(headers).toContain('Total P&L');
    });

    test('C3: Auto-Test-style header names are all present', () => {
        const headers = [];
        for (let i = 1; i <= N_COLS; i++) headers.push(overview.getRow(6).getCell(i).value);
        for (const h of ['Session', 'Starting Bankroll', 'Current Bankroll', 'Total Bets',
                         'Wins', 'Losses', 'Win Rate', 'Total Profit', 'Avg Profit',
                         'Strategy', 'Consecutive Losses',
                         'Start Idx', 'Outcome', 'Total Spins', 'Max Drawdown']) {
            expect(headers).toContain(h);
        }
    });

    test('C4: data row carries the computed dollar totals', () => {
        const headerRow = overview.getRow(6);
        const dataRow = overview.getRow(7);
        const idx = {};
        for (let i = 1; i <= N_COLS; i++) idx[headerRow.getCell(i).value] = i;
        expect(String(dataRow.getCell(idx['Total Win $']).value)).toBe('$250');
        expect(String(dataRow.getCell(idx['Total Loss $']).value)).toBe('$90');
        expect(String(dataRow.getCell(idx['Total P&L']).value)).toBe('$160');
    });

    test('C5: data row shows Wins / Losses / Win Rate from session data', () => {
        const headerRow = overview.getRow(6);
        const dataRow = overview.getRow(7);
        const idx = {};
        for (let i = 1; i <= N_COLS; i++) idx[headerRow.getCell(i).value] = i;
        expect(dataRow.getCell(idx['Wins']).value).toBe(5);
        expect(dataRow.getCell(idx['Losses']).value).toBe(3);
        expect(String(dataRow.getCell(idx['Win Rate']).value)).toMatch(/62\.5%/);
    });

    test('C6: title is merged across all columns (A1:R1), matching Auto Test', () => {
        expect(overview.mergedCells).toContain('A1:R1');
    });

    test('C7: sheet has 18 column widths set', () => {
        expect(overview.columns.length).toBe(N_COLS);
    });

    test('C8: strategy label reflects bettingStrategy id', () => {
        const wb3 = new MoneyReport(MockExcelJS).generate(makeSessionData({ bettingStrategy: 3 }), []);
        const wb1 = new MoneyReport(MockExcelJS).generate(makeSessionData({ bettingStrategy: 1 }), []);
        const strHeader = (w) => {
            const s = w.getWorksheet('Overview');
            const headers = [];
            for (let i = 1; i <= N_COLS; i++) headers.push(s.getRow(6).getCell(i).value);
            return s.getRow(7).getCell(headers.indexOf('Strategy') + 1).value;
        };
        expect(String(strHeader(wb3))).toMatch(/Cautious/);
        expect(String(strHeader(wb1))).toMatch(/Aggressive/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  D. Bet History sheet
// ═══════════════════════════════════════════════════════════════════
describe('D. Bet History sheet', () => {
    test('D1: Bet History sheet exists with the expected columns', () => {
        const wb = new MoneyReport(MockExcelJS).generate(makeSessionData(), makeBetHistory());
        const sheet = wb.getWorksheet('Bet History');
        expect(sheet).not.toBeNull();
        const headers = [];
        for (let i = 1; i <= 7; i++) headers.push(sheet.getRow(1).getCell(i).value);
        for (const h of ['#', 'Bet Amount', 'Total Bet', 'Hit', 'Actual Number', 'Net Change', 'Timestamp']) {
            expect(headers).toContain(h);
        }
    });

    test('D2: first bet history row reflects the first betHistory entry', () => {
        const wb = new MoneyReport(MockExcelJS).generate(makeSessionData(), makeBetHistory());
        const sheet = wb.getWorksheet('Bet History');
        expect(sheet.getRow(2).getCell(4).value).toBe('WIN'); // first 5 are wins
    });

    test('D3: a LOSS row renders "LOSS" in the Hit column', () => {
        const wb = new MoneyReport(MockExcelJS).generate(makeSessionData(), makeBetHistory());
        const sheet = wb.getWorksheet('Bet History');
        // Row 2..6 are wins (5 wins). Row 7 is first loss.
        expect(sheet.getRow(7).getCell(4).value).toBe('LOSS');
    });

    test('D4: empty betHistory produces a sheet with only the header row', () => {
        const wb = new MoneyReport(MockExcelJS).generate(makeSessionData(), []);
        const sheet = wb.getWorksheet('Bet History');
        // Header row only: no data rows should be accessed. Columns are still 7.
        expect(sheet.columns.length).toBe(7);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  E. saveToFile — IPC vs Blob
// ═══════════════════════════════════════════════════════════════════
describe('E. saveToFile', () => {
    beforeEach(() => {
        setupDOM();
        delete global.window.aiAPI;
    });

    test('E1: uses window.aiAPI.saveXlsx (IPC) when available, passing filename', async () => {
        const calls = [];
        global.window.aiAPI = { saveXlsx: (buf, fn) => { calls.push({ len: buf.length, fn }); return Promise.resolve(true); } };
        const rep = new MoneyReport(MockExcelJS);
        const wb = rep.generate(makeSessionData(), makeBetHistory());
        const ok = await rep.saveToFile(wb, 'session-result-2026-04-18-090507.xlsx');
        expect(ok).toBe(true);
        expect(calls.length).toBe(1);
        expect(calls[0].fn).toBe('session-result-2026-04-18-090507.xlsx');
        expect(calls[0].len).toBeGreaterThan(0);
    });

    test('E2: default filename is generated when none supplied', async () => {
        const calls = [];
        global.window.aiAPI = { saveXlsx: (buf, fn) => { calls.push(fn); return Promise.resolve(true); } };
        const rep = new MoneyReport(MockExcelJS);
        const wb = rep.generate(makeSessionData(), []);
        await rep.saveToFile(wb);
        expect(calls[0]).toMatch(/^session-result-\d{4}-\d{2}-\d{2}-\d{6}\.xlsx$/);
    });

    test('E3: returns false when no workbook is supplied', async () => {
        const rep = new MoneyReport(MockExcelJS);
        expect(await rep.saveToFile(null, 'x')).toBe(false);
    });

    test('E4: Blob fallback is used when no aiAPI is available', async () => {
        const created = [];
        const origCreate = document.createElement.bind(document);
        document.createElement = (tag) => {
            const el = origCreate(tag);
            if (tag === 'a') {
                // Capture download + href set by saveToFile.
                el.click = () => { created.push({ download: el.download, href: el.href }); };
            }
            return el;
        };
        // Provide Blob / URL.createObjectURL if jsdom hasn't.
        if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:mock';
        if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
        const rep = new MoneyReport(MockExcelJS);
        const wb = rep.generate(makeSessionData(), []);
        const ok = await rep.saveToFile(wb, 'session-result-testfile.xlsx');
        expect(ok).toBe(true);
        expect(created.length).toBe(1);
        expect(created[0].download).toBe('session-result-testfile.xlsx');
        document.createElement = origCreate;
    });
});

// ═══════════════════════════════════════════════════════════════════
//  F. MoneyManagementPanel UI — button presence + wiring
// ═══════════════════════════════════════════════════════════════════
describe('F. Money panel Download button', () => {
    let panel;
    beforeEach(() => {
        setupDOM();
        delete global.window.aiAPI;
        panel = createMoneyPanel();
    });

    test('F1: panel renders the #downloadSessionReportBtn in the header area', () => {
        const btn = document.getElementById('downloadSessionReportBtn');
        expect(btn).not.toBeNull();
        expect(btn.textContent).toMatch(/Download Session Report/);
    });

    test('F2: existing buttons (Start Betting, Strategy) remain unchanged', () => {
        expect(document.getElementById('toggleBettingBtn')).not.toBeNull();
        expect(document.getElementById('toggleStrategyBtn')).not.toBeNull();
        expect(document.getElementById('toggleMoneyPanel')).not.toBeNull();
    });

    test('F3: downloadSessionReport() returns false gracefully when ExcelJS is missing', async () => {
        const r = await panel.downloadSessionReport();
        expect(r).toBe(false);
    });

    test('F4: downloadSessionReport() saves via IPC with a "session-result-..." filename', async () => {
        global.ExcelJS = MockExcelJS;
        const calls = [];
        global.window.aiAPI = {
            saveXlsx: (buf, fn) => { calls.push({ len: buf.length, fn }); return Promise.resolve(true); }
        };
        const ok = await panel.downloadSessionReport();
        expect(ok).toBe(true);
        expect(calls.length).toBe(1);
        expect(calls[0].fn).toMatch(/^session-result-\d{4}-\d{2}-\d{2}-\d{6}\.xlsx$/);
        delete global.ExcelJS;
    });

    test('F5: clicking the button triggers the download (end-to-end via click event)', async () => {
        global.ExcelJS = MockExcelJS;
        const calls = [];
        global.window.aiAPI = {
            saveXlsx: (buf, fn) => { calls.push(fn); return Promise.resolve(true); }
        };
        const btn = document.getElementById('downloadSessionReportBtn');
        btn.click();
        // The click-triggered downloadSessionReport is async — yield to flush it.
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(calls.length).toBe(1);
        expect(calls[0]).toMatch(/^session-result-/);
        delete global.ExcelJS;
    });
});

// ═══════════════════════════════════════════════════════════════════
//  G. No mutation of live session state
// ═══════════════════════════════════════════════════════════════════
describe('G. Session state is NOT mutated by the download', () => {
    test('G1: sessionData and betHistory retain their shape after a download call', async () => {
        setupDOM();
        global.ExcelJS = MockExcelJS;
        global.window.aiAPI = { saveXlsx: () => Promise.resolve(true) };
        const panel = createMoneyPanel();
        const bankrollBefore = panel.sessionData.currentBankroll;
        const winsBefore = panel.sessionData.totalWins;
        const bhLenBefore = panel.betHistory.length;
        await panel.downloadSessionReport();
        expect(panel.sessionData.currentBankroll).toBe(bankrollBefore);
        expect(panel.sessionData.totalWins).toBe(winsBefore);
        expect(panel.betHistory.length).toBe(bhLenBefore);
        delete global.ExcelJS;
    });
});
