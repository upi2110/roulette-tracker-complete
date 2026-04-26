/**
 * Phase 2 Step 6 — AI-trained audit sheet in the comparison workbook.
 *
 * Verifies:
 *   - The audit sheet is appended only when meta.method === 'AI-trained'.
 *   - Legacy workbooks contain the exact same sheets in the exact same order.
 *   - Audit content reflects aiTrainedSummary (decisions, phases,
 *     shadows, protection, retrain, terminated).
 */

const { ComparisonReport } = require('../../app/comparison-report');

class MockCell { constructor() { this.value = null; this.font = {}; this.fill = {}; this.alignment = {}; } }
class MockRow { constructor() { this._cells = {}; } getCell(i) { if (!this._cells[i]) this._cells[i] = new MockCell(); return this._cells[i]; } }
class MockWorksheet {
    constructor(n) { this.name = n; this._rows = {}; this.columns = []; this.mergedCells = []; }
    getRow(i) { if (!this._rows[i]) this._rows[i] = new MockRow(); return this._rows[i]; }
    getCell(addr) { const m = addr.match(/^([A-Z]+)(\d+)$/); const col = m[1].charCodeAt(0) - 64; return this.getRow(parseInt(m[2], 10)).getCell(col); }
    mergeCells(r) { this.mergedCells.push(r); }
    eachRow(cb) {
        Object.keys(this._rows)
            .map(k => parseInt(k, 10))
            .sort((a, b) => a - b)
            .forEach(k => {
                const row = this._rows[k];
                const virtual = { getCell: (i) => row.getCell(i) };
                cb(virtual, k);
            });
    }
}
class MockWorkbook {
    constructor() { this._sheets = {}; this._order = []; }
    addWorksheet(n) {
        const s = new MockWorksheet(n);
        this._sheets[n] = s;
        this._order.push(n);
        return s;
    }
    getWorksheet(n) { return this._sheets[n] || null; }
}
const MockExcelJS = { Workbook: MockWorkbook };

const LEGACY_SHEETS = [
    'QA Summary',
    'Overview',
    'Auto Test',
    'Result-testing',
    'KPI Deltas',
    'Spin-by-Spin',
    'Auto Test Spins',
    'Result Spins'
];

function legacyData() {
    return {
        autoTest: { betHistory: [] },
        resultTesting: { betHistory: [] },
        deltas: {},
        meta: { sessionLabel: 'x', method: 'auto-test', generatedAt: '2026-04-24' }
    };
}

function aiTrainedData(summary) {
    return {
        autoTest: {
            betHistory: [],
            aiTrainedSummary: summary
        },
        resultTesting: { betHistory: [] },
        deltas: {},
        meta: {
            sessionLabel: 'ai-session',
            method: 'AI-trained',
            generatedAt: '2026-04-24'
        }
    };
}

function makeSummary() {
    return {
        spinsSeen: 30,
        aiTrainedSpins: 27,
        decisions: { WAIT: 10, BET: 12, SHADOW_PREDICT: 3, RETRAIN: 1, PROTECTION: 1, TERMINATE_SESSION: 0 },
        phases: { WARMUP: 4, SHADOW: 3, EARLY: 13, STABILISING: 6, ACTIVE: 0, RECOVERY: 0, PROTECTION: 1 },
        bets: 12, betHits: 7, betMisses: 5, betHitRate: 7 / 12,
        shadowsSeen: 3, shadowsHit: 2, shadowHitRate: 2 / 3,
        protectionEntries: [{ idx: 21, reason: 'loss-streak=7', cooldown: 10 }],
        retrainEvents: [{ idx: 14, lossStreak: 3 }],
        terminated: false,
        firstSpinIdx: 0, lastSpinIdx: 29
    };
}

describe('Step 6 — audit sheet is append-only and method-gated', () => {
    test('legacy workbook contains exactly the original sheets in the original order', () => {
        const wb = new ComparisonReport(MockExcelJS).generate(legacyData());
        expect(wb._order).toEqual(LEGACY_SHEETS);
        expect(wb.getWorksheet('AI-trained audit')).toBeNull();
    });

    test('AI-trained workbook adds exactly one sheet appended at the end', () => {
        const wb = new ComparisonReport(MockExcelJS).generate(aiTrainedData(makeSummary()));
        expect(wb._order.slice(0, LEGACY_SHEETS.length)).toEqual(LEGACY_SHEETS);
        expect(wb._order[wb._order.length - 1]).toBe('AI-trained audit');
        expect(wb._order.length).toBe(LEGACY_SHEETS.length + 1);
    });

    test('no audit sheet when method is missing / empty / non-AI-trained', () => {
        for (const method of [undefined, null, '', 'auto-test', 'T1-strategy', 'test-strategy']) {
            const data = legacyData();
            data.meta.method = method;
            const wb = new ComparisonReport(MockExcelJS).generate(data);
            expect(wb._order).toEqual(LEGACY_SHEETS);
        }
    });
});

describe('Step 6 — audit sheet content', () => {
    test('session totals reflect aiTrainedSummary', () => {
        const s = makeSummary();
        const wb = new ComparisonReport(MockExcelJS).generate(aiTrainedData(s));
        const sheet = wb.getWorksheet('AI-trained audit');
        expect(sheet).toBeTruthy();

        // Collect the Metric/Value pairs from rows 6..15 (block starts at row 6).
        const pairs = {};
        for (let r = 6; r <= 15; r++) {
            const label = sheet.getRow(r).getCell(1).value;
            const value = sheet.getRow(r).getCell(2).value;
            if (label != null) pairs[label] = value;
        }
        expect(pairs['Spins seen']).toBe(30);
        expect(pairs['AI-trained spins']).toBe(27);
        expect(pairs['Bets']).toBe(12);
        expect(pairs['Bet hits']).toBe(7);
        expect(pairs['Bet misses']).toBe(5);
        expect(pairs['Bet hit rate']).toBe('58%');
        expect(pairs['Shadows seen']).toBe(3);
        expect(pairs['Shadow hits']).toBe(2);
        expect(pairs['Shadow hit rate']).toBe('67%');
        expect(pairs['Terminated']).toBe('NO');
    });

    test('action and phase counts are rendered', () => {
        const s = makeSummary();
        const wb = new ComparisonReport(MockExcelJS).generate(aiTrainedData(s));
        const sheet = wb.getWorksheet('AI-trained audit');

        // Scan all rows for pair-like (label, count) rows and collect ours.
        const counts = {};
        for (let r = 1; r <= 80; r++) {
            const row = sheet._rows[r];
            if (!row) continue;
            const l = row._cells[1] && row._cells[1].value;
            const v = row._cells[2] && row._cells[2].value;
            if (typeof l === 'string' && typeof v === 'number') counts[l] = v;
        }
        // All actions + all phases should be present with the right counts.
        Object.entries(s.decisions).forEach(([a, n]) => expect(counts[a]).toBe(n));
        Object.entries(s.phases).forEach(([p, n]) => expect(counts[p]).toBe(n));
    });

    test('protection entries and retrain events are listed', () => {
        const s = makeSummary();
        const wb = new ComparisonReport(MockExcelJS).generate(aiTrainedData(s));
        const sheet = wb.getWorksheet('AI-trained audit');

        // Search for protection "Reason" cell = our loss-streak text.
        let found = false;
        for (let r = 1; r <= 80; r++) {
            const row = sheet._rows[r];
            if (!row) continue;
            const c3 = row._cells[3] && row._cells[3].value;
            if (c3 === 'loss-streak=7') { found = true; break; }
        }
        expect(found).toBe(true);

        // Retrain row: Spin Idx 14 and Loss Streak 3 co-located.
        let retrainFound = false;
        for (let r = 1; r <= 80; r++) {
            const row = sheet._rows[r];
            if (!row) continue;
            const c2 = row._cells[2] && row._cells[2].value;
            const c3 = row._cells[3] && row._cells[3].value;
            if (c2 === 14 && c3 === 3) { retrainFound = true; break; }
        }
        expect(retrainFound).toBe(true);
    });

    test('empty protection / retrain lists render placeholders, not missing rows', () => {
        const s = Object.assign(makeSummary(), { protectionEntries: [], retrainEvents: [] });
        const wb = new ComparisonReport(MockExcelJS).generate(aiTrainedData(s));
        const sheet = wb.getWorksheet('AI-trained audit');
        // At least one "no protection entries" and one "no retrain events" string.
        let placeholders = 0;
        for (let r = 1; r <= 80; r++) {
            const row = sheet._rows[r];
            if (!row) continue;
            const vals = Object.values(row._cells).map(c => c && c.value);
            if (vals.includes('no protection entries')) placeholders++;
            if (vals.includes('no retrain events')) placeholders++;
        }
        expect(placeholders).toBe(2);
    });
});
