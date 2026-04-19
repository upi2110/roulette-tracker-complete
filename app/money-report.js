/**
 * Money Management session report — downloadable Excel report of the
 * current live money-management session, formatted the same way the
 * Auto Test report is (Overview sheet + history/detail sheet).
 *
 * Reuses the Excel generation approach of app/auto-test-report.js and
 * the existing save pipeline (window.aiAPI.saveXlsx IPC → fs.writeFile
 * in main.js, with Blob-download fallback). It does NOT change any
 * money-management betting logic, bankroll logic, strategy switching,
 * spin listener behaviour, or prediction ingestion — it only snapshots
 * the session-state object and betHistory into a workbook.
 *
 * Overview columns intentionally mirror the Auto Test "Overview" sheet
 * header set — specifically the Total Win $ / Total Loss $ / Total P&L
 * triple. This gives the user a drop-in comparable format between the
 * two reports.
 *
 * Filename format: `session-result-YYYY-MM-DD-HHmmss.xlsx` (lexically
 * sortable; safe on all platforms).
 *
 * Exposed API:
 *   class MoneyReport
 *     constructor(ExcelJS)
 *     generate(sessionData, betHistory) → ExcelJS.Workbook
 *     saveToFile(workbook, filename)    → Promise<boolean>
 *   static MoneyReport.buildFilename(date=new Date()) → string
 *   function downloadMoneyReport(ExcelJS, sessionData, betHistory)
 *     → Promise<boolean>   (convenience wrapper used by the panel)
 */

const STRATEGY_LABEL_BY_ID = {
    1: 'Strategy 1 - Aggressive',
    2: 'Strategy 2 - Conservative',
    3: 'Strategy 3 - Cautious'
};

class MoneyReport {
    constructor(ExcelJS) {
        if (!ExcelJS) throw new Error('MoneyReport requires an ExcelJS module');
        this.ExcelJS = ExcelJS;
    }

    /**
     * Build the workbook. Pure function of sessionData + betHistory —
     * does NOT mutate either argument.
     *
     * @param {Object} sessionData - snapshot of MoneyManagementPanel.sessionData
     * @param {Array}  betHistory  - snapshot of MoneyManagementPanel.betHistory
     * @returns {ExcelJS.Workbook}
     */
    generate(sessionData, betHistory) {
        const wb = new this.ExcelJS.Workbook();
        this._createOverviewSheet(wb, sessionData || {}, Array.isArray(betHistory) ? betHistory : []);
        this._createHistorySheet(wb, Array.isArray(betHistory) ? betHistory : []);
        return wb;
    }

    /**
     * Save the workbook to disk. Prefers the Electron IPC path exposed
     * by preload.js (window.aiAPI.saveXlsx), which now accepts an
     * optional filename. Falls back to a Blob + anchor-click download
     * when IPC is unavailable (e.g. running in a plain browser).
     */
    async saveToFile(workbook, filename) {
        if (!workbook) return false;
        const buffer = await workbook.xlsx.writeBuffer();
        const safeName = (typeof filename === 'string' && filename.trim())
            ? filename
            : MoneyReport.buildFilename();

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

    /**
     * Canonical filename: session-result-YYYY-MM-DD-HHmmss.xlsx.
     * The date components are sourced from the supplied Date (or `new
     * Date()`) so tests can pass a fixed date for deterministic output.
     */
    static buildFilename(date) {
        const d = (date instanceof Date) ? date : new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        return `session-result-${ymd}-${hms}.xlsx`;
    }

    // ── sheets ──────────────────────────────────────────────────────

    _createOverviewSheet(workbook, sessionData, betHistory) {
        const sheet = workbook.addWorksheet('Overview');

        // Title (mirrors Auto Test layout — merged across all columns).
        sheet.mergeCells('A1:N1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'Money Management — Session Report';
        titleCell.font = { size: 16, bold: true, color: { argb: 'FF333333' } };
        titleCell.alignment = { horizontal: 'center' };

        // Metadata rows (rows 2 + 3).
        sheet.getCell('A2').value = `Generated: ${new Date().toISOString()}`;
        sheet.getCell('A3').value = `Strategy : ${STRATEGY_LABEL_BY_ID[sessionData.bettingStrategy] || 'Unknown'}`;
        sheet.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };
        sheet.getCell('A3').font = { size: 10, color: { argb: 'FF666666' } };

        // Header row (row 5). The core triple (Total Win $ / Total Loss $
        // / Total P&L) matches the Auto Test Overview exactly — see
        // app/auto-test-report.js _createOverviewSheet header list.
        const headers = [
            'Session', 'Starting Bankroll', 'Current Bankroll', 'Total Bets',
            'Wins', 'Losses', 'Win Rate',
            'Total Profit', 'Total Win $', 'Total Loss $', 'Total P&L',
            'Avg Profit', 'Strategy', 'Consecutive Losses'
        ];
        const headerRow = sheet.getRow(5);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Data row (row 6) — one row for the current session.
        const totals = MoneyReport._computeTotals(sessionData, betHistory);
        const values = [
            'Current Session',
            `$${(sessionData.startingBankroll || 0).toLocaleString()}`,
            `$${(sessionData.currentBankroll || 0).toLocaleString()}`,
            sessionData.totalBets || 0,
            sessionData.totalWins || 0,
            sessionData.totalLosses || 0,
            `${(totals.winRate * 100).toFixed(1)}%`,
            `$${(totals.totalProfit).toLocaleString()}`,
            `$${totals.totalWon.toLocaleString()}`,
            `$${totals.totalLost.toLocaleString()}`,
            `$${totals.totalPL.toLocaleString()}`,
            `$${totals.avgProfit.toFixed(2)}`,
            STRATEGY_LABEL_BY_ID[sessionData.bettingStrategy] || 'Unknown',
            sessionData.consecutiveLosses || 0
        ];
        const row = sheet.getRow(6);
        values.forEach((v, i) => {
            const cell = row.getCell(i + 1);
            cell.value = v;
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        sheet.columns = [
            { width: 22 }, { width: 18 }, { width: 18 }, { width: 12 },
            { width: 10 }, { width: 10 }, { width: 10 },
            { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
            { width: 14 }, { width: 26 }, { width: 18 }
        ];
    }

    _createHistorySheet(workbook, betHistory) {
        const sheet = workbook.addWorksheet('Bet History');
        const headers = ['#', 'Bet Amount', 'Total Bet', 'Hit', 'Actual Number', 'Net Change', 'Timestamp'];
        const headerRow = sheet.getRow(1);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });
        betHistory.forEach((b, i) => {
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
            values.forEach((v, j) => {
                const cell = row.getCell(j + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            });
        });
        sheet.columns = [{ width: 8 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 26 }];
    }

    /**
     * Compute the money-report totals. Static so tests and the panel
     * can reuse the exact derivation without needing a workbook.
     */
    static _computeTotals(sessionData, betHistory) {
        const sd = sessionData || {};
        const bh = Array.isArray(betHistory) ? betHistory : [];
        let totalWon = 0;
        let totalLost = 0;
        for (const b of bh) {
            const nc = b && typeof b.netChange === 'number' ? b.netChange : 0;
            if (nc > 0) totalWon += nc;
            else if (nc < 0) totalLost += -nc;
        }
        const totalProfit = typeof sd.sessionProfit === 'number' ? sd.sessionProfit : (totalWon - totalLost);
        const totalPL = totalWon - totalLost;
        const decided = (sd.totalWins || 0) + (sd.totalLosses || 0);
        const winRate = decided > 0 ? (sd.totalWins || 0) / decided : 0;
        const avgProfit = (sd.totalBets || 0) > 0 ? totalProfit / (sd.totalBets || 1) : 0;
        return {
            totalWon: Math.round(totalWon * 100) / 100,
            totalLost: Math.round(totalLost * 100) / 100,
            totalPL: Math.round(totalPL * 100) / 100,
            totalProfit: Math.round(totalProfit * 100) / 100,
            winRate,
            avgProfit: Math.round(avgProfit * 100) / 100
        };
    }
}

// Convenience one-shot download used by MoneyManagementPanel.
async function downloadMoneyReport(ExcelJS, sessionData, betHistory) {
    try {
        const rep = new MoneyReport(ExcelJS);
        const wb = rep.generate(sessionData, betHistory);
        const filename = MoneyReport.buildFilename();
        return await rep.saveToFile(wb, filename);
    } catch (e) {
        if (typeof console !== 'undefined') console.warn('Money report download failed:', e && e.message);
        return false;
    }
}

// ── Dual export ─────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MoneyReport, downloadMoneyReport };
}
if (typeof window !== 'undefined') {
    window.MoneyReport = MoneyReport;
    window.downloadMoneyReport = downloadMoneyReport;
}
