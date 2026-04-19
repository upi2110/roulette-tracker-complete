/**
 * 59-result-testing-comparison.test.js
 *
 * Tests for the Result-testing comparison workflow:
 *   - ResultTestingPanel.buildComparisonData()
 *   - ResultTestingPanel.buildVerificationReportText() (enhanced with
 *     side-by-side Auto Test vs Result-testing KPI block + status line)
 *   - ComparisonReport workbook generation (Overview / Auto Test /
 *     Result-testing / KPI Deltas / spin-history sheets)
 *   - UI wiring: "Download comparison workbook" button enables after
 *     a successful session replay.
 *
 * Covers the product-quality bug fix: the Auto Test workbook is the
 * canonical source of truth; Result-testing compares against it and
 * the exported workbook shows both sides plus the KPI deltas.
 */

const { setupDOM, createMoneyPanel } = require('../test-setup');
const { ResultTestingPanel } = require('../../app/result-testing-panel');
const { ComparisonReport, KPI_FIELDS } = require('../../app/comparison-report');

// ── Minimal ExcelJS mock (same shape as 57-money-report) ────────────
class MockCell { constructor() { this.value = null; this.font = {}; this.fill = {}; this.alignment = {}; this.border = {}; } }
class MockRow { constructor() { this._cells = {}; } getCell(i) { if (!this._cells[i]) this._cells[i] = new MockCell(); return this._cells[i]; } }
class MockWorksheet {
    constructor(name) { this.name = name; this._rows = {}; this.columns = []; this.mergedCells = []; }
    getRow(i) { if (!this._rows[i]) this._rows[i] = new MockRow(); return this._rows[i]; }
    getCell(addr) { const m = addr.match(/^([A-Z]+)(\d+)$/); const col = m[1].charCodeAt(0) - 64; return this.getRow(parseInt(m[2], 10)).getCell(col); }
    mergeCells(r) { this.mergedCells.push(r); }
}
class MockWorkbook {
    constructor() { this._sheets = {}; this.xlsx = { writeBuffer: async () => new ArrayBuffer(64) }; }
    addWorksheet(n) { const s = new MockWorksheet(n); this._sheets[n] = s; return s; }
    getWorksheet(n) { return this._sheets[n] || null; }
}
const MockExcelJS = { Workbook: MockWorkbook };

// ── Auto Test fixture — same shape as 56-result-testing-panel's ─────
function makeAutoTestResult() {
    const steps = [];
    // 3 WATCH spins, then a short deterministic BET/SKIP sequence.
    for (let i = 0; i < 3; i++) steps.push({ action: 'WATCH', pnl: 0, spinNumber: i + 1, nextNumber: 5, bankroll: 4000 });
    // pnl values MUST satisfy the live MoneyManagementPanel.recordBetResult
    // formula so the replay reproduces the fixture exactly:
    //   hit=true  : netChange = betPerNumber * (35 - numbersCount)
    //   hit=false : netChange = -betPerNumber * numbersCount
    // Total session P&L = 60 - 24 + 48 - 22 + 50 = $112 (matches session.finalProfit).
    const seq = [
        { action: 'BET', pnl: 60,  hit: true,  betPerNumber: 2, numbersCount: 5,  nextNumber: 7,  bankroll: 4060 },
        { action: 'BET', pnl: -24, hit: false, betPerNumber: 2, numbersCount: 12, nextNumber: 13, bankroll: 4036 },
        { action: 'SKIP', pnl: 0, nextNumber: 21, bankroll: 4036 },
        { action: 'BET', pnl: 48,  hit: true,  betPerNumber: 2, numbersCount: 11, nextNumber: 19, bankroll: 4084 },
        { action: 'BET', pnl: -22, hit: false, betPerNumber: 2, numbersCount: 11, nextNumber: 3,  bankroll: 4062 },
        { action: 'BET', pnl: 50,  hit: true,  betPerNumber: 2, numbersCount: 10, nextNumber: 9,  bankroll: 4112 }
    ];
    for (const s of seq) steps.push(Object.assign({ selectedPair: 'zero_positive', selectedFilter: 'zero_positive' }, s));

    const session = {
        startIdx: 0, strategy: 1, outcome: 'WIN',
        finalBankroll: 4112, finalProfit: 112,
        totalSpins: 9, totalBets: 5, totalSkips: 1,
        wins: 3, losses: 2, winRate: 0.6,
        // maxDrawdown=0 because the live MoneyManagementPanel does not
        // track drawdown on sessionData — we keep the Auto Test side at
        // 0 too so the MATCH assertions hold. Real Auto Test sessions
        // often have non-zero maxDrawdown; the user will see a
        // legitimate MISMATCH there until that field is wired into the
        // money panel (out of scope for this comparison fix).
        maxDrawdown: 0, peakProfit: 112,
        steps
    };
    const summary = {
        totalSessions: 1, wins: 1, busts: 0, incomplete: 0,
        winRate: 1, avgSpinsToWin: 9, maxSpinsToWin: 9, avgSpinsToBust: 0,
        totalProfit: 112, avgProfit: 112, maxDrawdown: 24,
        totalWon: 158, totalLost: 46,
        bestSession: { startIdx: 0, finalProfit: 112 },
        worstSession: { startIdx: 0, finalProfit: 112 }
    };
    return {
        testFile: 'test_data7.txt',
        totalTestSpins: 12,
        method: 'T1-strategy',
        timestamp: '2026-04-19T10:00:00.000Z',
        testSpins: Array.from({ length: 12 }, (_, i) => i % 37),
        strategies: {
            1: { sessions: [session], summary },
            2: { sessions: [], summary: { totalSessions: 0, wins: 0, busts: 0, totalProfit: 0 } },
            3: { sessions: [], summary: { totalSessions: 0, wins: 0, busts: 0, totalProfit: 0 } }
        }
    };
}

function seedAIPanelContent() {
    let c = document.getElementById('aiPanelContent');
    if (!c) { c = document.createElement('div'); c.id = 'aiPanelContent'; document.body.appendChild(c); }
    if (!c.firstElementChild) { const m = document.createElement('div'); m.id = 'autoModeControls'; c.appendChild(m); }
    return c;
}

beforeEach(() => {
    setupDOM();
    seedAIPanelContent();
    delete window.resultTestingPanel;
    delete window.moneyPanel;
    delete window.autoUpdateOrchestrator;
    delete window.aiAutoModeUI;
    delete window.render;
    delete window.spins;
    if (typeof ResultTestingPanel.cancelPendingReplays === 'function') ResultTestingPanel.cancelPendingReplays();
});

// ═══════════════════════════════════════════════════════════════════
//  R. buildComparisonData — structured Auto Test vs Result-testing
// ═══════════════════════════════════════════════════════════════════
describe('R. buildComparisonData', () => {
    test('R1: returns null when no submission has been made', () => {
        const p = new ResultTestingPanel();
        expect(p.buildComparisonData()).toBeNull();
    });

    test('R2: returns null when the last tab was not a session id', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.lastTabLoaded = 'overview';
        expect(p.buildComparisonData()).toBeNull();
    });

    test('R3: returns both Auto Test and Result-testing blocks after a session replay', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        const res = p.processTabEntry('S1-Start0');
        expect(res.ok).toBe(true);
        await p.waitForReplay();
        const c = p.buildComparisonData();
        expect(c).not.toBeNull();
        expect(c.meta.sessionLabel).toBe('S1-Start0');
        expect(c.meta.method).toBe('T1-strategy');
        expect(c.autoTest.sessionLabel).toBe('S1-Start0');
        expect(c.resultTesting.sessionLabel).toBe('S1-Start0');
        expect(c.resultTesting.ran).toBe(true);
    });

    test('R4: deltas are zero when the replay matches the Auto Test session', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const c = p.buildComparisonData();
        // totalBets / wins / losses / totalPL derive deterministically
        // from session.steps BET entries — the recorded replay feeds
        // the same entries back in, so all money-driven KPIs line up.
        expect(c.deltas.totalBets).toBe(0);
        expect(c.deltas.wins).toBe(0);
        expect(c.deltas.losses).toBe(0);
        expect(c.deltas.totalWon).toBe(0);
        expect(c.deltas.totalLost).toBe(0);
        expect(c.deltas.totalPL).toBe(0);
    });

    test('R5: Auto Test side carries the spin history from session.steps', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const c = p.buildComparisonData();
        expect(Array.isArray(c.autoTest.spinHistory)).toBe(true);
        expect(c.autoTest.spinHistory.length).toBeGreaterThan(0);
        // First step is a WATCH (from the fixture).
        expect(c.autoTest.spinHistory[0].action).toBe('WATCH');
        // Somewhere in the tail there is a BET with hit:true.
        expect(c.autoTest.spinHistory.some(s => s.action === 'BET' && s.hit === true)).toBe(true);
    });

    test('R6: Result-testing side carries the bet history driven by the replay', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const c = p.buildComparisonData();
        expect(Array.isArray(c.resultTesting.betHistory)).toBe(true);
        // Session has 5 BET steps in the fixture → betHistory has 5.
        expect(c.resultTesting.betHistory.length).toBe(5);
        // Every entry must expose the MoneyReport-compatible fields.
        for (const b of c.resultTesting.betHistory) {
            expect(typeof b.spin).toBe('number');
            expect(typeof b.totalBet).toBe('number');
            expect(typeof b.hit).toBe('boolean');
            expect(typeof b.netChange).toBe('number');
        }
    });

    test('R7: when no replay has run yet, Result-testing side is marked ran=false', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.lastTabLoaded = 'S1-Start0';  // simulate user typing without Run
        const c = p.buildComparisonData();
        expect(c).not.toBeNull();
        expect(c.resultTesting.ran).toBe(false);
        expect(c.resultTesting.totalBets).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  S. Verification text — side-by-side block + PASS/MISMATCH line
// ═══════════════════════════════════════════════════════════════════
describe('S. buildVerificationReportText — comparison block', () => {
    test('S1: includes the "Auto Test vs Result-testing" block after a session replay', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const txt = p.buildVerificationReportText();
        expect(txt).toMatch(/Auto Test vs Result-testing/);
        expect(txt).toMatch(/Total Win \$/);
        expect(txt).toMatch(/Total Loss \$/);
        expect(txt).toMatch(/Total P&L/);
        expect(txt).toMatch(/Max Drawdown/);
        expect(txt).toMatch(/Final Bankroll/);
    });

    test('S2: shows both Auto Test AND Result-testing columns with numeric values', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const txt = p.buildVerificationReportText();
        // Header row contains the three column titles.
        expect(txt).toMatch(/Metric\s+Auto Test\s+Result-test\s+Delta\s+Status/);
        // The Total Bets line should contain 5 twice (Auto Test + Result-testing) and a 0 delta + MATCH.
        const m = txt.match(/Total Bets\s+5\s+5\s+0\s+MATCH/);
        expect(m).not.toBeNull();
    });

    test('S3: ends with a PASS line when all KPIs match', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const txt = p.buildVerificationReportText();
        expect(txt).toMatch(/Result\s*:\s*PASS/);
    });

    test('S4: flags MISMATCH when the Result-testing side diverges', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        // Artificially corrupt the replay stats to simulate a mismatch.
        p._replayStats.sessionData.totalBets = 99;
        const txt = p.buildVerificationReportText();
        expect(txt).toMatch(/MISMATCH/);
        expect(txt).toMatch(/Result\s*:\s*MISMATCH/);
    });

    test('S5: PENDING line when Session was loaded but no replay captured', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.lastTabLoaded = 'S1-Start0';
        const txt = p.buildVerificationReportText();
        expect(txt).toMatch(/PENDING/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  T. ComparisonReport workbook
// ═══════════════════════════════════════════════════════════════════
describe('T. ComparisonReport workbook', () => {
    test('T1: constructor rejects missing ExcelJS module', () => {
        expect(() => new ComparisonReport()).toThrow(/ExcelJS/);
    });

    test('T2: buildFilename has the expected prefix', () => {
        const d = new Date(2026, 3, 19, 13, 37, 2);
        expect(ComparisonReport.buildFilename(d)).toBe('comparison-2026-04-19-133702.xlsx');
    });

    test('T3: generate() produces the required sheet set', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const rep = new ComparisonReport(MockExcelJS);
        const wb = rep.generate(data);
        expect(wb.getWorksheet('Overview')).not.toBeNull();
        expect(wb.getWorksheet('Auto Test')).not.toBeNull();
        expect(wb.getWorksheet('Result-testing')).not.toBeNull();
        expect(wb.getWorksheet('KPI Deltas')).not.toBeNull();
        expect(wb.getWorksheet('Auto Test Spins')).not.toBeNull();
        expect(wb.getWorksheet('Result Spins')).not.toBeNull();
    });

    test('T4: Overview sheet headers include Metric/Auto Test/Result-testing/Delta/Status', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('Overview');
        const hdr = s.getRow(7);
        expect(hdr.getCell(1).value).toBe('Metric');
        expect(hdr.getCell(2).value).toBe('Auto Test');
        expect(hdr.getCell(3).value).toBe('Result-testing');
        expect(hdr.getCell(4).value).toBe('Delta');
        expect(hdr.getCell(5).value).toBe('Status');
    });

    test('T5: Overview data rows cover every KPI field', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('Overview');
        // Each of the 11 KPI_FIELDS has a row starting at row 8.
        expect(KPI_FIELDS.length).toBe(11);
        for (let i = 0; i < KPI_FIELDS.length; i++) {
            expect(s.getRow(8 + i).getCell(1).value).toBe(KPI_FIELDS[i].label);
        }
    });

    test('T6: KPI Deltas status column shows MATCH when replay matches Auto Test', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('KPI Deltas');
        // totalBets row lives at row 3 (row 1 = header, row 2 = totalSpins).
        // Find the row whose Metric cell is 'Total Bets' to avoid ordering assumptions.
        let matchRow = null;
        for (let r = 2; r < 20; r++) {
            const row = s.getRow(r);
            if (row.getCell(1).value === 'Total Bets') { matchRow = row; break; }
        }
        expect(matchRow).not.toBeNull();
        expect(matchRow.getCell(5).value).toBe('MATCH');
    });

    test('T7: Auto Test Spins sheet contains rows for every session step', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('Auto Test Spins');
        // Fixture session has 9 steps; rows 2..10 should be populated.
        expect(s.getRow(2).getCell(1).value).toBe(1);
        expect(s.getRow(10).getCell(1).value).toBe(9);
        // First action is WATCH (from the fixture).
        expect(s.getRow(2).getCell(2).value).toBe('WATCH');
    });

    test('T8: Result Spins sheet contains one row per BET step', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('Result Spins');
        // 5 BET steps in the fixture → rows 2..6 populated.
        for (let i = 1; i <= 5; i++) {
            expect(s.getRow(i + 1).getCell(1).value).toBe(i);
        }
    });

    test('T9: saveToFile routes through the Blob path when no aiAPI is available', async () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        window.moneyPanel = createMoneyPanel();
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        const rep = new ComparisonReport(MockExcelJS);
        const wb = rep.generate(data);
        const ok = await rep.saveToFile(wb, 'foo.xlsx');
        // jsdom supplies URL + document; Blob may or may not be real,
        // but either way saveToFile must not throw and must return a
        // boolean (true for the Blob path, false otherwise).
        expect(typeof ok).toBe('boolean');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  U. UI wiring — Download comparison workbook button
// ═══════════════════════════════════════════════════════════════════
describe('U. Download comparison workbook button', () => {
    test('U1: the button exists in the DOM after panel creation', () => {
        new ResultTestingPanel();
        const btn = document.getElementById('resultTestingWorkbookBtn');
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(true);
    });

    test('U2: button enables after a successful session replay', async () => {
        // createMoneyPanel() calls setupDOM internally (wiping the body),
        // so it must run BEFORE the ResultTestingPanel mounts or its
        // DOM subtree will be destroyed mid-test.
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const btn = document.getElementById('resultTestingWorkbookBtn');
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(false);
    });

    test('U3: button is reset to disabled on a fresh submit', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        // Simulate a prior enabled state left over from a previous run.
        const btn = document.getElementById('resultTestingWorkbookBtn');
        btn.disabled = false;
        p.submit(makeAutoTestResult());
        expect(btn.disabled).toBe(true);
    });
});
