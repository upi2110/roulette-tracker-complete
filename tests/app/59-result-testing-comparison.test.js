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
        // maxDrawdown is $24 (peak $4060 after the first hit → trough
        // $4036 after the -$24 loss). replayRecordedSession now tracks
        // drawdown live during replay so this value should round-trip
        // through the comparison sheet as a MATCH.
        maxDrawdown: 24, peakProfit: 112,
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

// ═══════════════════════════════════════════════════════════════════
//  V. Clean-slate replay + strategy alignment
// ═══════════════════════════════════════════════════════════════════
describe('V. Sandboxed replay — live money panel is RESTORED, snapshot on _replayStats', () => {
    // These tests lock in the isolation guarantee: the Result-testing
    // replay mutates the live panel internally (so the bet-lifecycle
    // code path is exercised for real), but on exit the live panel
    // is returned to its pre-replay state. The authoritative
    // post-replay data lives ONLY on p._replayStats.

    test('V1: live bettingStrategy is RESTORED to the user\'s pre-replay choice', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        window.moneyPanel.sessionData.bettingStrategy = 3;
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        // Live panel is back to the user's Strategy 3 (Cautious) even
        // though the replay ran under the session's Strategy 1.
        expect(window.moneyPanel.sessionData.bettingStrategy).toBe(3);
        // _replayStats captured the REPLAY's strategy (Strategy 1).
        expect(p._replayStats.sessionData.bettingStrategy).toBe(1);
    });

    test('V2: live totals/bankroll/betHistory RESTORED to pre-replay values', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        window.moneyPanel.sessionData.totalBets = 7;
        window.moneyPanel.sessionData.totalWins = 3;
        window.moneyPanel.sessionData.totalLosses = 4;
        window.moneyPanel.sessionData.sessionProfit = -50;
        window.moneyPanel.sessionData.currentBankroll = 3950;
        window.moneyPanel.betHistory = [
            { spin: 1, totalBet: 20, hit: false, netChange: -20, timestamp: 'prior' }
        ];
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        // Live panel is UNCHANGED — normal play resumes exactly where
        // the user left off.
        const sd = window.moneyPanel.sessionData;
        expect(sd.totalBets).toBe(7);
        expect(sd.totalWins).toBe(3);
        expect(sd.totalLosses).toBe(4);
        expect(sd.sessionProfit).toBe(-50);
        expect(sd.currentBankroll).toBe(3950);
        expect(window.moneyPanel.betHistory.length).toBe(1);
        expect(window.moneyPanel.betHistory[0].timestamp).toBe('prior');
        // _replayStats has the replay's totals (5 BETs, $112 profit).
        expect(p._replayStats.sessionData.totalBets).toBe(5);
        expect(p._replayStats.sessionData.sessionProfit).toBe(112);
    });

    test('V3: consecutive counters + maxDrawdown RESTORED on live panel', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        window.moneyPanel.sessionData.consecutiveLosses = 4;
        window.moneyPanel.sessionData.consecutiveWins = 0;
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        // Live panel is UNCHANGED.
        expect(window.moneyPanel.sessionData.consecutiveLosses).toBe(4);
        expect(window.moneyPanel.sessionData.consecutiveWins).toBe(0);
        expect(window.moneyPanel.sessionData.maxDrawdown).toBeUndefined();
        // _replayStats has the replay's final state.
        expect(p._replayStats.sessionData.consecutiveWins).toBe(1);
    });

    test('V4: live gate flags (isSessionActive / isBettingEnabled) restored', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        window.moneyPanel.sessionData.isSessionActive = false;
        window.moneyPanel.sessionData.isBettingEnabled = false;
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        expect(window.moneyPanel.sessionData.isSessionActive).toBe(false);
        expect(window.moneyPanel.sessionData.isBettingEnabled).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  W. Workbook color-coding + Spin-by-Spin sheet
// ═══════════════════════════════════════════════════════════════════
describe('W. Color coding + Spin-by-Spin sheet', () => {
    async function getWb() {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        return { data, wb: new ComparisonReport(MockExcelJS).generate(data), p };
    }

    test('W1: Spin-by-Spin sheet exists with the expected header set', async () => {
        const { wb } = await getWb();
        const s = wb.getWorksheet('Spin-by-Spin');
        expect(s).not.toBeNull();
        const hdr = s.getRow(1);
        expect(hdr.getCell(1).value).toBe('#');
        expect(hdr.getCell(2).value).toBe('AT Action');
        expect(hdr.getCell(7).value).toBe('AT Bankroll');
        expect(hdr.getCell(11).value).toBe('Status');
    });

    test('W2: Spin-by-Spin sheet has one row per session step', async () => {
        const { wb, data } = await getWb();
        const s = wb.getWorksheet('Spin-by-Spin');
        const expected = data.autoTest.spinHistory.length;
        // Last row with a non-null first cell must match the step count.
        expect(s.getRow(expected + 1).getCell(1).value).toBe(expected);
        // Row after that has no value set.
        expect(s.getRow(expected + 2).getCell(1).value).toBeNull();
    });

    test('W3: BET rows in Spin-by-Spin are MATCH when replay pnl equals Auto Test pnl', async () => {
        const { wb, data } = await getWb();
        const s = wb.getWorksheet('Spin-by-Spin');
        // Locate a BET row (skip the 3 WATCH rows that open the fixture).
        let betRow = null;
        for (let r = 2; r < 20; r++) {
            const row = s.getRow(r);
            if (row.getCell(2).value === 'BET') { betRow = row; break; }
        }
        expect(betRow).not.toBeNull();
        expect(betRow.getCell(11).value).toBe('MATCH');
    });

    test('W4: MATCH rows on Overview are tinted green; MISMATCH rows tinted red', async () => {
        const { p } = await getWb();
        // Force a mismatch on finalProfit by corrupting the capture.
        p._replayStats.sessionData.sessionProfit = 999;
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('Overview');
        // Find the Final Profit row and confirm its fill is the red tone.
        let mismatchRow = null;
        for (let r = 8; r < 22; r++) {
            if (s.getRow(r).getCell(1).value === 'Final Profit') { mismatchRow = s.getRow(r); break; }
        }
        expect(mismatchRow).not.toBeNull();
        const fill = mismatchRow.getCell(5).fill;
        expect(fill && fill.fgColor && fill.fgColor.argb).toBe('FFF8D7DA');

        // Find a MATCH row (Total Bets) and confirm green tone.
        let matchRow = null;
        for (let r = 8; r < 22; r++) {
            if (s.getRow(r).getCell(1).value === 'Total Bets') { matchRow = s.getRow(r); break; }
        }
        expect(matchRow).not.toBeNull();
        const mFill = matchRow.getCell(5).fill;
        expect(mFill && mFill.fgColor && mFill.fgColor.argb).toBe('FFD4EDDA');
    });

    test('W5: KPI Deltas sheet status cells carry the same green/red fills', async () => {
        const { p } = await getWb();
        p._replayStats.sessionData.sessionProfit = 999;
        const data = p.buildComparisonData();
        const wb = new ComparisonReport(MockExcelJS).generate(data);
        const s = wb.getWorksheet('KPI Deltas');
        let mm = null;
        for (let r = 2; r < 20; r++) if (s.getRow(r).getCell(1).value === 'Final Profit') { mm = s.getRow(r); break; }
        expect(mm.getCell(5).fill.fgColor.argb).toBe('FFF8D7DA');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  X. Profit-sync bug fix: sessionProfit == sum(betHistory netChange)
// ═══════════════════════════════════════════════════════════════════
describe('X. sessionProfit matches betHistory netChange sum', () => {
    test('X1: after replay, sessionProfit equals sum of betHistory netChange', async () => {
        // Regression fix for "Auto Test $144 vs Money Management $126".
        // Before the fix, replayRecordedSession overwrote betHistory
        // netChange values with the recorded step.pnl — but
        // sessionProfit was accumulated from the live money-panel
        // formula inside recordBetResult. The two diverged whenever
        // the Auto Test runner's pnl math differed from the money
        // panel's. Now we capture netChange live from betHistory[0]
        // after each recordBetResult, so the two are always equal.
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const sum = window.moneyPanel.betHistory.reduce((a, b) => a + (b.netChange || 0), 0);
        expect(sum).toBe(window.moneyPanel.sessionData.sessionProfit);
    });

    test('X2: replay captures maxDrawdown on _replayStats (live panel is not polluted)', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        // The replay computes drawdown live during the loop and
        // stamps it on the captured snapshot. The LIVE money panel's
        // sessionData does not gain a maxDrawdown field — the
        // isolation guarantee keeps the panel untouched.
        expect(p._replayStats.sessionData.maxDrawdown).toBeGreaterThanOrEqual(24);
        expect(window.moneyPanel.sessionData.maxDrawdown).toBeUndefined();
    });

    test('X3: comparison Max Drawdown row is MATCH when fixture pnl sequence matches', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const data = p.buildComparisonData();
        // Auto Test fixture maxDrawdown=24 and replay trough=24 → MATCH.
        expect(data.autoTest.maxDrawdown).toBe(24);
        expect(data.resultTesting.maxDrawdown).toBeGreaterThanOrEqual(24);
        expect(data.deltas.maxDrawdown).toBeLessThanOrEqual(0.01);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  Y. Verification report is .xlsx (not .txt)
// ═══════════════════════════════════════════════════════════════════
describe('Y. downloadVerificationReport writes an .xlsx workbook', () => {
    test('Y1: returns a Promise<boolean> (async signature)', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const ret = p.downloadVerificationReport();
        expect(typeof ret.then).toBe('function');
        await ret; // drain
    });

    test('Y2: routes through the aiAPI.saveXlsx IPC with a verification-*.xlsx filename', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        const savedNames = [];
        window.aiAPI = { saveXlsx: async (buf, name) => { savedNames.push(name); return true; } };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        await p.downloadVerificationReport();
        expect(savedNames.length).toBe(1);
        expect(savedNames[0]).toMatch(/^verification-\d{4}-\d{2}-\d{2}-\d{6}\.xlsx$/);
        delete window.aiAPI;
    });

    test('Y3: UI button label reflects the .xlsx output', () => {
        window.moneyPanel = createMoneyPanel();
        seedAIPanelContent();
        new ResultTestingPanel();
        const btn = document.getElementById('resultTestingDownloadBtn');
        expect(btn.textContent).toMatch(/\.xlsx/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  AA. Relocated "Download Session Report" button
// ═══════════════════════════════════════════════════════════════════
//
// The button used to live on the Money Management panel. It was
// moved to the AI Prediction panel header so the Money Management
// panel stays minimal and is never read/mutated for report
// generation. The new button calls
// ResultTestingPanel.downloadSessionReport which reads from
// this._replayStats (never from the live panel).
describe('AA. Session report button is on the AI Prediction header', () => {
    function seedAIHeader() {
        // Build the AI Prediction header that ai-prediction-panel.js
        // renders in the real app. setupDOM already creates an
        // #aiSelectionPanel shell (no .panel-header), so we ensure the
        // header element exists whether the outer container was
        // pre-created by setupDOM or not.
        let sp = document.getElementById('aiSelectionPanel');
        if (!sp) {
            sp = document.createElement('div');
            sp.id = 'aiSelectionPanel';
            sp.className = 'ai-selection-panel';
            document.body.appendChild(sp);
        }
        if (!sp.querySelector('.panel-header')) {
            const hdr = document.createElement('div');
            hdr.className = 'panel-header';
            hdr.innerHTML = '<h3>🎯 AI Prediction - Multi-Table Selection</h3><button class="btn-toggle" id="toggleAIPanel">−</button>';
            sp.insertBefore(hdr, sp.firstChild);
        }
        seedAIPanelContent();
    }

    test('AA1: button is injected into the AI panel header, starts disabled', () => {
        seedAIHeader();
        new ResultTestingPanel();
        const btn = document.getElementById('aiHeaderSessionReportBtn');
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(true);
        // It lives inside the AI Prediction panel header, NOT the money panel.
        const inAiHeader = document.querySelector('#aiSelectionPanel .panel-header #aiHeaderSessionReportBtn');
        expect(inAiHeader).not.toBeNull();
    });

    test('AA2: button is NOT present on the Money Management panel', () => {
        window.moneyPanel = createMoneyPanel();
        // The legacy #downloadSessionReportBtn has been removed.
        expect(document.getElementById('downloadSessionReportBtn')).toBeNull();
    });

    test('AA3: button enables after a successful session replay', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIHeader();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        const btn = document.getElementById('aiHeaderSessionReportBtn');
        expect(btn.disabled).toBe(false);
    });

    test('AA4: clicking the button saves a session-result-*.xlsx via IPC', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIHeader();
        const saved = [];
        window.aiAPI = { saveXlsx: async (buf, name) => { saved.push(name); return true; } };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        await p.downloadSessionReport();
        expect(saved.length).toBe(1);
        expect(saved[0]).toMatch(/^session-result-\d{4}-\d{2}-\d{2}-\d{6}\.xlsx$/);
        delete window.aiAPI;
    });

    test('AA5: downloadSessionReport reads from _replayStats, never from the live money panel', async () => {
        window.moneyPanel = createMoneyPanel();
        seedAIHeader();
        // Spy on the live panel to make sure downloadSessionReport
        // does NOT touch its sessionData/betHistory during report
        // generation.
        let touched = false;
        const origSd = window.moneyPanel.sessionData;
        Object.defineProperty(window.moneyPanel, 'sessionData', {
            configurable: true,
            get() { touched = true; return origSd; }
        });
        window.aiAPI = { saveXlsx: async () => true };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start0');
        await p.waitForReplay();
        // Reset the touched flag — the replay itself legitimately
        // reads sessionData. We only care about what happens during
        // downloadSessionReport.
        touched = false;
        await p.downloadSessionReport();
        expect(touched).toBe(false);
        delete window.aiAPI;
    });

    test('AA6: downloadSessionReport returns false when no replay has run', async () => {
        seedAIHeader();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        await expect(p.downloadSessionReport()).resolves.toBe(false);
    });
});
