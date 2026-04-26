/**
 * Direct session report download — no result-testing replay required.
 *
 * Phase: TRAIN router + direct download item.
 *
 * Verifies:
 *   - The session-report button is enabled by default (no replay needed).
 *   - submit() leaves the button enabled instead of disabling it.
 *   - downloadSessionReport() works after submit() alone (session-only path).
 *   - downloadSessionReport() still works after a full replay (regression).
 *   - Click before any submission is a no-op (returns false; never throws).
 *   - Top-level sessions[] submission shape is supported by the fallback.
 *   - buildComparisonData() exposes a session-only payload when no
 *     replay stats / no lastTabLoaded exist.
 */

function setupDOM() {
    document.body.innerHTML = `
        <div id="aiSelectionPanel">
            <div id="aiPanelContent">
                <div class="table-selection-section" data-table="3"></div>
            </div>
        </div>
    `;
}

let ResultTestingPanel;
beforeAll(() => {
    setupDOM();
    ({ ResultTestingPanel } = require('../../app/result-testing-panel'));
});

beforeEach(() => {
    setupDOM();
    delete window.ExcelJS;
    delete window.ComparisonReport;
    delete window.MoneyReport;
});

// ── Helpers ─────────────────────────────────────────────────────────

function legacyStep(action, extra) {
    return Object.assign({
        spinIdx: 0, spinNumber: 17, nextNumber: 34,
        action, selectedPair: 'prev', selectedFilter: 'both_both',
        predictedNumbers: action === 'BET' ? [1, 2, 3] : [],
        confidence: 50, betPerNumber: 2, numbersCount: action === 'BET' ? 3 : 0,
        hit: false, pnl: 0, bankroll: 4000, cumulativeProfit: 0
    }, extra || {});
}

function strategiesShape() {
    return {
        testFile: 'manual',
        totalTestSpins: 10,
        method: 'auto-test',
        strategies: {
            1: { sessions: [{
                strategy: 1, startIdx: 0, outcome: 'WIN',
                totalSpins: 5, totalBets: 3, totalSkips: 1,
                wins: 2, losses: 1, winRate: 2 / 3,
                maxDrawdown: 10, finalProfit: 50, finalBankroll: 4050,
                steps: [
                    legacyStep('WATCH'),
                    legacyStep('BET', { hit: true, pnl: 66 }),
                    legacyStep('SKIP')
                ]
            }] }
        }
    };
}

function topLevelSessionsShape() {
    return {
        testFile: 'top.txt',
        totalTestSpins: 5,
        method: 'auto-test',
        sessions: [{
            strategy: 1, startIdx: 0, outcome: 'WIN',
            totalSpins: 3, totalBets: 1, totalSkips: 1,
            wins: 1, losses: 0, winRate: 1,
            maxDrawdown: 0, finalProfit: 30, finalBankroll: 4030,
            steps: [legacyStep('WATCH'), legacyStep('BET', { hit: true, pnl: 30 })]
        }]
    };
}

// Minimal ExcelJS + ComparisonReport stubs so saveToFile() resolves
// without touching real I/O.
function installFakeComparisonReport({ saveResult = true, throwOnGen = false } = {}) {
    const generated = [];
    window.ExcelJS = { Workbook: class { constructor() { this.x = 1; } } };
    window.ComparisonReport = class {
        constructor(ExcelJS) { this.ExcelJS = ExcelJS; }
        generate(data) {
            if (throwOnGen) throw new Error('boom');
            generated.push(data);
            return { _generated: data };
        }
        async saveToFile(_wb, _name) { return saveResult; }
    };
    window.ComparisonReport.buildFilename = () => 'comparison-test.xlsx';
    return generated;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('button enablement', () => {
    test('aiHeaderSessionReportBtn is enabled by default (no replay required)', () => {
        new ResultTestingPanel();
        // The button is injected lazily after AI prediction panel exists.
        // For this test we recreate the AI prediction header so the
        // injection succeeds, then re-run injection.
        document.querySelector('#aiSelectionPanel').insertAdjacentHTML(
            'afterbegin',
            '<div class="panel-header"><h3>AI</h3></div>'
        );
        const p = new ResultTestingPanel();
        const btn = document.getElementById('aiHeaderSessionReportBtn');
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(false);
    });

    test('submit() leaves the button enabled, not disabled', () => {
        document.querySelector('#aiSelectionPanel').insertAdjacentHTML(
            'afterbegin',
            '<div class="panel-header"><h3>AI</h3></div>'
        );
        const p = new ResultTestingPanel();
        p.submit(strategiesShape());
        const btn = document.getElementById('aiHeaderSessionReportBtn');
        expect(btn.disabled).toBe(false);
    });
});

describe('downloadSessionReport — direct (no replay)', () => {
    test('returns true after submit() alone (no replay) and produces a workbook', async () => {
        const generated = installFakeComparisonReport({ saveResult: true });
        const p = new ResultTestingPanel();
        p.submit(strategiesShape());
        const ok = await p.downloadSessionReport();
        expect(ok).toBe(true);
        expect(generated.length).toBe(1);
        const data = generated[0];
        // meta + autoTest populated; resultTesting carries empty side.
        expect(data.meta).toBeTruthy();
        expect(data.autoTest).toBeTruthy();
        expect(data.autoTest.totalBets).toBe(3);
        expect(data.resultTesting).toBeTruthy();
        expect(data.resultTesting.ran).toBe(false);   // empty side marker
        expect(data.resultTesting.totalBets).toBe(0);
    });

    test('top-level sessions[] submission shape is supported via fallback', async () => {
        const generated = installFakeComparisonReport({ saveResult: true });
        const p = new ResultTestingPanel();
        p.submit(topLevelSessionsShape());
        const ok = await p.downloadSessionReport();
        expect(ok).toBe(true);
        expect(generated[0].autoTest.totalBets).toBe(1);
    });

    test('returns false (no-op) when nothing has been submitted', async () => {
        installFakeComparisonReport({ saveResult: true });
        const p = new ResultTestingPanel();
        const ok = await p.downloadSessionReport();
        expect(ok).toBe(false);
    });

    test('still returns false cleanly if ComparisonReport throws', async () => {
        installFakeComparisonReport({ throwOnGen: true });
        const p = new ResultTestingPanel();
        p.submit(strategiesShape());
        const ok = await p.downloadSessionReport();
        expect(ok).toBe(false);
    });
});

describe('buildComparisonData — session-only fallback', () => {
    test('returns null with no submission', () => {
        const p = new ResultTestingPanel();
        expect(p.buildComparisonData()).toBeNull();
    });

    test('returns a populated payload immediately after submit() (no replay)', () => {
        const p = new ResultTestingPanel();
        p.submit(strategiesShape());
        const data = p.buildComparisonData();
        expect(data).toBeTruthy();
        expect(data.meta.method).toBe('auto-test');
        expect(data.autoTest.totalBets).toBe(3);
        expect(data.resultTesting.ran).toBe(false);
        expect(Array.isArray(data.deltas) || typeof data.deltas === 'object').toBe(true);
    });

    test('explicitRef wins over the session-only fallback', () => {
        const p = new ResultTestingPanel();
        p.submit(strategiesShape());
        const data = p.buildComparisonData({ strategy: 1, startIdx: 0 });
        expect(data).toBeTruthy();
        expect(data.autoTest.totalBets).toBe(3);
    });
});

describe('downloadSessionReport — replay path regression', () => {
    test('full comparison path is preserved when replay stats exist', async () => {
        const generated = installFakeComparisonReport({ saveResult: true });
        const p = new ResultTestingPanel();
        p.submit(strategiesShape());

        // Simulate a successful replay by populating _replayStats.
        p._replayStats = {
            aiMode: 'auto',
            sessionData: {
                totalBets: 2, totalWins: 1, totalLosses: 1,
                sessionProfit: 10, currentBankroll: 4010, maxDrawdown: 5
            },
            betHistory: [
                { netChange: 30, hit: true, actualNumber: 7 },
                { netChange: -20, hit: false, actualNumber: 0 }
            ]
        };
        // Pretend the user loaded the only available tab.
        p.lastTabLoaded = 'strategy1';

        const ok = await p.downloadSessionReport();
        expect(ok).toBe(true);
        const data = generated[generated.length - 1];
        expect(data.resultTesting.ran).toBe(true);
        expect(data.resultTesting.totalBets).toBe(2);
    });
});
