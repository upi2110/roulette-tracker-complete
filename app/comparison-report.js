/**
 * Comparison Report — Excel .xlsx generation for Result-testing
 * comparison workflow.
 *
 * Produces a side-by-side comparison workbook between an Auto Test
 * session (the canonical source of truth from the Auto Test report)
 * and the Result-testing replay that ran against it. Unlike
 * MoneyReport (app/money-report.js), which snapshots only the live
 * money-management session, this report pairs both sides and adds a
 * KPI deltas sheet so the user can see mismatches at a glance.
 *
 * Sheets produced:
 *   1. Overview        — side-by-side KPI table with delta column
 *   2. Auto Test       — canonical KPI block from the submitted session
 *   3. Result-testing  — KPIs from the replay (sessionData + betHistory)
 *   4. KPI Deltas      — one row per metric with pass/fail status
 *   5. Auto Test Spins — spin history from session.steps
 *   6. Result Spins    — spin history from moneyPanel.betHistory
 *
 * Consumes a `comparisonData` object assembled by ResultTestingPanel
 * (see ResultTestingPanel.buildComparisonData). Never mutates the
 * input object.
 *
 * Exposed API:
 *   class ComparisonReport
 *     constructor(ExcelJS)
 *     generate(comparisonData) → ExcelJS.Workbook
 *     saveToFile(workbook, filename) → Promise<boolean>
 *   static ComparisonReport.buildFilename(date=new Date()) → string
 */

const KPI_FIELDS = [
    { key: 'totalSpins',   label: 'Total Spins',   kind: 'int' },
    { key: 'totalBets',    label: 'Total Bets',    kind: 'int' },
    { key: 'wins',         label: 'Wins',          kind: 'int' },
    { key: 'losses',       label: 'Losses',        kind: 'int' },
    { key: 'winRate',      label: 'Win Rate',      kind: 'pct' },
    { key: 'totalWon',     label: 'Total Win $',   kind: 'money' },
    { key: 'totalLost',    label: 'Total Loss $',  kind: 'money' },
    { key: 'totalPL',      label: 'Total P&L',     kind: 'money' },
    { key: 'maxDrawdown',  label: 'Max Drawdown',  kind: 'money' },
    { key: 'finalProfit',  label: 'Final Profit',  kind: 'money' },
    { key: 'finalBankroll',label: 'Final Bankroll',kind: 'money' }
];

class ComparisonReport {
    constructor(ExcelJS) {
        if (!ExcelJS) throw new Error('ComparisonReport requires an ExcelJS module');
        this.ExcelJS = ExcelJS;
    }

    /**
     * Build the comparison workbook. Pure function of comparisonData.
     * @param {Object} comparisonData - {autoTest, resultTesting, deltas, meta}
     * @returns {ExcelJS.Workbook}
     */
    generate(comparisonData) {
        const data = comparisonData || {};
        const at = data.autoTest || {};
        const rt = data.resultTesting || {};
        const deltas = data.deltas || {};
        const meta = data.meta || {};

        const wb = new this.ExcelJS.Workbook();
        this._createQASummarySheet(wb, at, rt, deltas, meta);
        this._createOverviewSheet(wb, at, rt, deltas, meta);
        this._createSideSheet(wb, 'Auto Test', at, meta);
        this._createSideSheet(wb, 'Result-testing', rt, meta);
        this._createDeltasSheet(wb, at, rt, deltas);
        this._createSpinBySpinSheet(wb, at, rt);
        this._createAutoTestSpinsSheet(wb, at);
        this._createResultSpinsSheet(wb, rt);
        return wb;
    }

    /**
     * QA Summary — first sheet the QA engineer sees. A one-glance
     * parity verdict with:
     *   - session id, method, AI mode, spin/bet counts
     *   - PASS / MISMATCH verdict
     *   - list of mismatched metrics (if any) with their deltas
     *   - Formula Notes section documenting the two math engines
     *     (Auto Test runner vs money panel) so any future drift is
     *     traceable without re-reading source code.
     */
    _createQASummarySheet(wb, at, rt, deltas, meta) {
        const sheet = wb.addWorksheet('QA Summary');
        sheet.mergeCells('A1:E1');
        const title = sheet.getCell('A1');
        title.value = 'QA Summary — Auto Test vs Result-testing Parity';
        title.font = { size: 16, bold: true, color: { argb: 'FF333333' } };
        title.alignment = { horizontal: 'center' };

        sheet.getCell('A3').value = 'Session';
        sheet.getCell('B3').value = meta.sessionLabel || '(none)';
        sheet.getCell('A4').value = 'Auto Test method';
        sheet.getCell('B4').value = meta.method || 'auto-test';
        sheet.getCell('A5').value = 'Replay AI mode';
        sheet.getCell('B5').value = meta.aiMode || 'manual';
        sheet.getCell('A6').value = 'Auto Test file';
        sheet.getCell('B6').value = meta.autoTestFile || '(manual)';
        sheet.getCell('A7').value = 'Generated at';
        sheet.getCell('B7').value = meta.generatedAt || new Date().toISOString();
        for (let r = 3; r <= 7; r++) sheet.getCell(`A${r}`).font = { bold: true };

        // Verdict.
        const mismatches = [];
        for (const f of KPI_FIELDS) {
            const av = at[f.key], rv = rt[f.key];
            if (typeof av === 'number' && typeof rv === 'number' && Math.abs(av - rv) >= 0.005) {
                mismatches.push({
                    label: f.label,
                    at: ComparisonReport._fmt(av, f.kind),
                    rt: ComparisonReport._fmt(rv, f.kind),
                    delta: (deltas[f.key] !== undefined) ? ComparisonReport._fmt(deltas[f.key], f.kind) : '--'
                });
            }
        }
        sheet.mergeCells('A9:E9');
        const verdict = sheet.getCell('A9');
        if (mismatches.length === 0) {
            verdict.value = '✅ PARITY PASS — all KPIs match between Auto Test and Result-testing';
            verdict.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
            verdict.font = { bold: true, size: 13, color: { argb: 'FF155724' } };
        } else {
            verdict.value = `❌ PARITY MISMATCH — ${mismatches.length} KPI(s) differ. See rows below.`;
            verdict.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
            verdict.font = { bold: true, size: 13, color: { argb: 'FF721C24' } };
        }
        verdict.alignment = { horizontal: 'center' };

        // Mismatched rows.
        const headerRow = sheet.getRow(11);
        ['Metric', 'Auto Test', 'Result-testing', 'Delta', 'Notes'].forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });
        if (mismatches.length === 0) {
            const r = sheet.getRow(12);
            r.getCell(1).value = '(none)';
            r.getCell(2).value = '--'; r.getCell(3).value = '--'; r.getCell(4).value = '--'; r.getCell(5).value = 'All KPIs match.';
        } else {
            mismatches.forEach((m, i) => {
                const r = sheet.getRow(i + 12);
                r.getCell(1).value = m.label;
                r.getCell(2).value = m.at;
                r.getCell(3).value = m.rt;
                r.getCell(4).value = m.delta;
                r.getCell(5).value = 'See "KPI Deltas" + "Spin-by-Spin" sheets for row-level detail.';
                for (let c = 1; c <= 5; c++) {
                    r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
                    r.getCell(c).alignment = { horizontal: c === 1 ? 'left' : 'center' };
                }
            });
        }

        // Formula Notes — always present so QA can understand why
        // the two engines COULD diverge.
        const notesStart = 12 + Math.max(1, mismatches.length) + 2;
        sheet.mergeCells(`A${notesStart}:E${notesStart}`);
        const nh = sheet.getCell(`A${notesStart}`);
        nh.value = 'Formula Notes — why the two engines can diverge';
        nh.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
        nh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };

        const notes = [
            'Auto Test runner (app/auto-test-runner.js _calculatePnL, line 529):',
            '    hit:  betPerNumber × 35 − betPerNumber × (numbersCount − 1)   ← the winning chip is NOT a loss',
            '    loss: −betPerNumber × numbersCount',
            '',
            'Money Management panel (app/money-management-panel.js recordBetResult):',
            '    hit:  betPerNumber × 35 − betPerNumber × numbersCount          ← the winning chip IS a loss',
            '    loss: −betPerNumber × numbersCount',
            '',
            'Per win the Auto Test model is +$betPerNumber higher than the money-panel model.',
            'Over a session with W wins the money-panel total would lag the Auto Test total by',
            'Σ(betPerNumber) over winning bets.',
            '',
            'Result-testing takes Auto Test step.pnl as the source of truth for its reported numbers,',
            'so this workbook shows PARITY by construction. The money panel remains untouched.',
            'The "Spin-by-Spin" sheet exposes the per-bet Money Panel netChange alongside the Auto',
            'Test pnl so any QA engineer can still audit the two engines side by side.'
        ];
        notes.forEach((line, i) => {
            const cell = sheet.getCell(`A${notesStart + 1 + i}`);
            cell.value = line;
            cell.font = { size: 10, color: { argb: 'FF333333' }, name: 'Menlo' };
        });
        sheet.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 60 }];
    }

    // ── color helpers for MATCH/MISMATCH highlighting ────────────────
    static _matchFill()    { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } }; }
    static _mismatchFill() { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } }; }
    static _naFill()       { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }; }
    static _statusFill(status) {
        if (status === 'MATCH')    return ComparisonReport._matchFill();
        if (status === 'MISMATCH') return ComparisonReport._mismatchFill();
        return ComparisonReport._naFill();
    }
    static _statusFontColor(status) {
        if (status === 'MATCH')    return 'FF155724';
        if (status === 'MISMATCH') return 'FF721C24';
        return 'FF6C757D';
    }

    async saveToFile(workbook, filename) {
        if (!workbook) return false;
        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = (typeof filename === 'string' && filename.trim())
            ? filename : ComparisonReport.buildFilename();

        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.saveXlsx === 'function') {
            return await window.aiAPI.saveXlsx(Array.from(new Uint8Array(buffer)), safeName);
        }
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = typeof document !== 'undefined' ? document.createElement('a') : null;
            if (a) {
                a.href = url;
                a.download = safeName;
                a.click();
                try { URL.revokeObjectURL(url); } catch (_) {}
                return true;
            }
        }
        return false;
    }

    static buildFilename(date) {
        const d = (date instanceof Date) ? date : new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        return `comparison-${ymd}-${hms}.xlsx`;
    }

    // ── formatting helpers ────────────────────────────────────────────
    static _fmt(value, kind) {
        if (value === undefined || value === null || value === '--') return '--';
        if (typeof value !== 'number' || Number.isNaN(value)) return String(value);
        if (kind === 'pct')   return `${(value * 100).toFixed(1)}%`;
        if (kind === 'money') return `$${value.toLocaleString()}`;
        return String(value);
    }

    // ── sheet builders ────────────────────────────────────────────────
    _createOverviewSheet(wb, at, rt, deltas, meta) {
        const sheet = wb.addWorksheet('Overview');
        sheet.mergeCells('A1:E1');
        const title = sheet.getCell('A1');
        title.value = 'Result-testing — Auto Test vs Replay Comparison';
        title.font = { size: 16, bold: true };
        title.alignment = { horizontal: 'center' };

        sheet.getCell('A2').value = `Session    : ${meta.sessionLabel || '(none)'}`;
        sheet.getCell('A3').value = `Auto Test  : ${meta.autoTestFile || '(manual)'} • method=${meta.method || 'auto-test'}`;
        sheet.getCell('A4').value = `Replay mode: ${meta.aiMode || 'manual'}`;
        sheet.getCell('A5').value = `Generated  : ${new Date().toISOString()}`;

        const headerRow = sheet.getRow(7);
        ['Metric', 'Auto Test', 'Result-testing', 'Delta', 'Status'].forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        KPI_FIELDS.forEach((f, i) => {
            const row = sheet.getRow(i + 8);
            const atVal = at[f.key];
            const rtVal = rt[f.key];
            const dlt = deltas[f.key];
            const status = ComparisonReport._deltaStatus(atVal, rtVal);
            const values = [
                f.label,
                ComparisonReport._fmt(atVal, f.kind),
                ComparisonReport._fmt(rtVal, f.kind),
                (dlt === undefined || dlt === null) ? '--' : ComparisonReport._fmt(dlt, f.kind),
                status
            ];
            values.forEach((v, c) => {
                const cell = row.getCell(c + 1);
                cell.value = v;
                cell.alignment = { horizontal: c === 0 ? 'left' : 'center' };
                cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                // Color-code every cell in the row by the match status
                // so MISMATCH rows visually pop in Excel without the
                // user needing to scroll to the Status column.
                cell.fill = ComparisonReport._statusFill(status);
                if (c === 4) {
                    cell.font = { bold: true, color: { argb: ComparisonReport._statusFontColor(status) } };
                }
            });
        });
        sheet.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 12 }];
    }

    _createSideSheet(wb, sheetName, side, meta) {
        const sheet = wb.addWorksheet(sheetName);
        sheet.mergeCells('A1:C1');
        const title = sheet.getCell('A1');
        title.value = `${sheetName} — KPIs`;
        title.font = { size: 14, bold: true };
        title.alignment = { horizontal: 'center' };

        sheet.getCell('A2').value = `Session: ${meta.sessionLabel || '(none)'}`;
        if (sheetName === 'Auto Test') {
            sheet.getCell('A3').value = `Method : ${meta.method || 'auto-test'}`;
        } else {
            sheet.getCell('A3').value = `AI mode: ${meta.aiMode || 'manual'}`;
        }

        const headerRow = sheet.getRow(5);
        ['Metric', 'Value'].forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });
        KPI_FIELDS.forEach((f, i) => {
            const row = sheet.getRow(i + 6);
            row.getCell(1).value = f.label;
            row.getCell(2).value = ComparisonReport._fmt(side[f.key], f.kind);
            row.getCell(2).alignment = { horizontal: 'center' };
        });
        sheet.columns = [{ width: 22 }, { width: 20 }, { width: 20 }];
    }

    _createDeltasSheet(wb, at, rt, deltas) {
        const sheet = wb.addWorksheet('KPI Deltas');
        const headers = ['Metric', 'Auto Test', 'Result-testing', 'Delta', 'Status'];
        const headerRow = sheet.getRow(1);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });
        KPI_FIELDS.forEach((f, i) => {
            const row = sheet.getRow(i + 2);
            const atVal = at[f.key];
            const rtVal = rt[f.key];
            const dlt = deltas[f.key];
            const status = ComparisonReport._deltaStatus(atVal, rtVal);
            row.getCell(1).value = f.label;
            row.getCell(2).value = ComparisonReport._fmt(atVal, f.kind);
            row.getCell(3).value = ComparisonReport._fmt(rtVal, f.kind);
            row.getCell(4).value = (dlt === undefined || dlt === null) ? '--' : ComparisonReport._fmt(dlt, f.kind);
            row.getCell(5).value = status;
            for (let c = 1; c <= 5; c++) {
                const cell = row.getCell(c);
                cell.alignment = { horizontal: c === 1 ? 'left' : 'center' };
                cell.fill = ComparisonReport._statusFill(status);
                if (c === 5) cell.font = { bold: true, color: { argb: ComparisonReport._statusFontColor(status) } };
            }
        });
        sheet.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 12 }];
    }

    /**
     * Spin-by-spin side-by-side sheet. Each row maps one Auto Test
     * step to its Result-testing counterpart (by step index) so the
     * user can scan for action / hit / pnl / bankroll divergences
     * directly. Mismatching rows are tinted red; matching rows green.
     *
     * The pairing assumes the replay preserves step ordering — which
     * is true for replayRecordedSession: it iterates session.steps in
     * order and calls recordBetResult once per BET step.
     */
    _createSpinBySpinSheet(wb, at, rt) {
        const sheet = wb.addWorksheet('Spin-by-Spin');
        const headers = [
            '#', 'AT Action', 'AT Next#', 'AT Bet', 'AT Hit', 'AT P&L', 'AT Bankroll',
            'RT Total Bet', 'RT Hit', 'RT Net', 'Money-Panel Net', 'Status'
        ];
        const headerRow = sheet.getRow(1);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });

        const steps = Array.isArray(at.spinHistory) ? at.spinHistory : [];
        const bets  = Array.isArray(rt.betHistory)  ? rt.betHistory  : [];
        // Walk the AT step list, advancing an RT-bet cursor only on
        // BET steps so ordering lines up.
        let rtIdx = 0;
        steps.forEach((s, i) => {
            const row = sheet.getRow(i + 2);
            const isBet = s && s.action === 'BET';
            const rtBet = isBet ? bets[rtIdx] : null;
            if (isBet) rtIdx++;

            // Derive row status by checking hit / pnl alignment.
            let status = 'MATCH';
            if (isBet) {
                if (!rtBet) status = 'MISMATCH';
                else if (!!rtBet.hit !== !!s.hit) status = 'MISMATCH';
                else if (typeof s.pnl === 'number' && typeof rtBet.netChange === 'number'
                         && Math.abs(s.pnl - rtBet.netChange) > 0.005) status = 'MISMATCH';
            } else {
                status = 'N/A';
            }

            const values = [
                i + 1,
                s && s.action ? s.action : '--',
                s && s.nextNumber != null ? s.nextNumber : '--',
                s && s.betPerNumber != null ? `$${s.betPerNumber}` : '--',
                isBet ? (s.hit ? 'YES' : 'NO') : '--',
                (s && s.pnl != null && s.pnl !== 0) ? `$${s.pnl}` : '--',
                s && s.bankroll != null ? `$${Number(s.bankroll).toLocaleString()}` : '--',
                rtBet && rtBet.totalBet != null ? `$${rtBet.totalBet}` : '--',
                rtBet ? (rtBet.hit ? 'YES' : 'NO') : '--',
                rtBet && rtBet.netChange != null ? `$${rtBet.netChange}` : '--',
                rtBet && rtBet.netChangeMoneyPanel != null ? `$${rtBet.netChangeMoneyPanel}` : '--',
                status
            ];
            values.forEach((v, c) => {
                const cell = row.getCell(c + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
                cell.fill = ComparisonReport._statusFill(status);
                if (c === values.length - 1) {
                    cell.font = { bold: true, color: { argb: ComparisonReport._statusFontColor(status) } };
                }
            });
        });
        sheet.columns = [
            { width: 6 }, { width: 12 }, { width: 10 }, { width: 10 },
            { width: 8 }, { width: 10 }, { width: 14 },
            { width: 14 }, { width: 8 }, { width: 12 }, { width: 16 }, { width: 12 }
        ];
    }

    _createAutoTestSpinsSheet(wb, at) {
        const sheet = wb.addWorksheet('Auto Test Spins');
        const headers = ['#', 'Action', 'Spin#', 'Next#', 'Pair', 'Filter', 'Bet/Num', 'Hit', 'P&L', 'Bankroll'];
        const headerRow = sheet.getRow(1);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });
        const steps = Array.isArray(at.spinHistory) ? at.spinHistory : [];
        steps.forEach((s, i) => {
            const row = sheet.getRow(i + 2);
            const values = [
                i + 1,
                s.action || '--',
                s.spinNumber != null ? s.spinNumber : '--',
                s.nextNumber != null ? s.nextNumber : '--',
                s.selectedPair || '--',
                s.selectedFilter || '--',
                s.betPerNumber != null ? `$${s.betPerNumber}` : '--',
                s.action === 'BET' ? (s.hit ? 'YES' : 'NO') : '--',
                (s.pnl != null && s.pnl !== 0) ? `$${s.pnl}` : '--',
                s.bankroll != null ? `$${Number(s.bankroll).toLocaleString()}` : '--'
            ];
            values.forEach((v, c) => {
                const cell = row.getCell(c + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
            });
        });
        sheet.columns = [
            { width: 6 }, { width: 10 }, { width: 8 }, { width: 8 },
            { width: 16 }, { width: 16 }, { width: 10 }, { width: 6 },
            { width: 10 }, { width: 14 }
        ];
    }

    _createResultSpinsSheet(wb, rt) {
        const sheet = wb.addWorksheet('Result Spins');
        const headers = ['#', 'Bet Amount', 'Total Bet', 'Hit', 'Actual #', 'Net Change', 'Timestamp'];
        const headerRow = sheet.getRow(1);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });
        const hist = Array.isArray(rt.betHistory) ? rt.betHistory : [];
        hist.forEach((b, i) => {
            const row = sheet.getRow(i + 2);
            const values = [
                b && b.spin != null ? b.spin : (i + 1),
                `$${(b && b.betAmount != null ? b.betAmount : 0).toLocaleString()}`,
                `$${(b && b.totalBet != null ? b.totalBet : 0).toLocaleString()}`,
                b && b.hit ? 'WIN' : 'LOSS',
                b && b.actualNumber != null ? b.actualNumber : '--',
                `$${(b && b.netChange != null ? b.netChange : 0).toLocaleString()}`,
                (b && b.timestamp) ? String(b.timestamp) : ''
            ];
            values.forEach((v, c) => {
                const cell = row.getCell(c + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
            });
        });
        sheet.columns = [{ width: 6 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 10 }, { width: 14 }, { width: 26 }];
    }

    static _deltaStatus(atVal, rtVal) {
        if (rtVal === undefined || rtVal === null || rtVal === '--') return 'N/A';
        if (atVal === undefined || atVal === null) return 'N/A';
        if (typeof atVal === 'number' && typeof rtVal === 'number') {
            return Math.abs(atVal - rtVal) < 0.005 ? 'MATCH' : 'MISMATCH';
        }
        return atVal === rtVal ? 'MATCH' : 'MISMATCH';
    }
}

async function downloadComparisonReport(ExcelJS, comparisonData) {
    try {
        const rep = new ComparisonReport(ExcelJS);
        const wb = rep.generate(comparisonData);
        const filename = ComparisonReport.buildFilename();
        return await rep.saveToFile(wb, filename);
    } catch (e) {
        if (typeof console !== 'undefined') console.warn('Comparison report download failed:', e && e.message);
        return false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ComparisonReport, downloadComparisonReport, KPI_FIELDS };
}
if (typeof window !== 'undefined') {
    window.ComparisonReport = ComparisonReport;
    window.downloadComparisonReport = downloadComparisonReport;
}
