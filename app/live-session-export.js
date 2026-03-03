/**
 * LiveSessionExport — Exports recorded live session data as Excel.
 *
 * Uses the EXACT same format as auto-test-report.js session detail sheets:
 *   Step | Spin# | Next# | Action | Pair | Filter | Numbers | Conf% | Bet/Num | Hit | P&L | Bankroll
 *
 * Same styling: blue WATCH rows, red REANALYZE rows, green/red hit/pnl colors.
 */

const MODE_LABELS = {
    'auto': 'Auto',
    'semi': 'Semi-Auto',
    'manual': 'Manual'
};

const STRATEGY_LABELS_SESSION = {
    1: 'Aggressive',
    2: 'Conservative',
    3: 'Cautious'
};

class LiveSessionExport {
    constructor() {
        // ExcelJS must be available globally (loaded in the page)
        this.ExcelJS = typeof ExcelJS !== 'undefined' ? ExcelJS : null;
    }

    /**
     * Generate workbook and trigger download.
     * @param {Object} sessionResult - From sessionRecorder.getSessionResult()
     */
    async generateAndDownload(sessionResult) {
        if (!this.ExcelJS) {
            console.error('ExcelJS not available — cannot export');
            alert('Excel export library not loaded. Cannot download.');
            return false;
        }

        const workbook = new this.ExcelJS.Workbook();
        workbook.creator = 'Roulette Tracker - Live Session';
        workbook.created = new Date();

        this._createSessionSheet(workbook, sessionResult);

        return await this._saveToFile(workbook, sessionResult);
    }

    /**
     * Create the session detail sheet — identical format to auto-test-report.js
     */
    _createSessionSheet(workbook, session) {
        const mode = MODE_LABELS[session.mode] || session.mode || 'Live';
        const strategy = STRATEGY_LABELS_SESSION[session.strategy] || `Strategy ${session.strategy}`;
        const sheetName = `${mode} Session`;
        const sheet = workbook.addWorksheet(sheetName);

        // Summary row (row 1) — outcome and overall P&L
        sheet.mergeCells('A1:L1');
        const summaryCell = sheet.getCell('A1');
        const profit = session.finalProfit || session.profit || 0;
        const outcomeLabel = session.outcome === 'WIN' ? 'WIN' : session.outcome === 'BUST' ? 'BUST' : 'INCOMPLETE';
        summaryCell.value = `${mode} | ${strategy} | Outcome: ${outcomeLabel} | Overall P&L: $${profit.toFixed(2)}`;
        summaryCell.font = { bold: true, size: 12 };
        // Color based on outcome
        if (session.outcome === 'WIN') {
            summaryCell.font = { bold: true, size: 12, color: { argb: 'FF28A745' } };
        } else if (session.outcome === 'BUST') {
            summaryCell.font = { bold: true, size: 12, color: { argb: 'FFDC3545' } };
        } else {
            summaryCell.font = { bold: true, size: 12, color: { argb: 'FFFF8C00' } };
        }

        // Session info row (row 2) — detailed stats including incomplete status
        sheet.mergeCells('A2:L2');
        const infoCell = sheet.getCell('A2');
        const incompleteNote = session.outcome === 'INCOMPLETE' ? ` | ⚠ INCOMPLETE SESSION — Loss: $${Math.abs(profit).toFixed(2)}` : '';
        infoCell.value = `Bets: ${session.totalBets} | Wins: ${session.wins} | Losses: ${session.losses} | Win Rate: ${Math.round(session.winRate * 100)}% | Skips: ${session.totalSkips} | Resets: ${session.reanalyzeCount} | Started: ${session.startTime || 'N/A'}${incompleteNote}`;
        infoCell.font = { size: 10, color: { argb: session.outcome === 'INCOMPLETE' ? 'FFFF8C00' : 'FF666666' } };

        // Headers (row 3) — EXACT same as test report
        const headers = ['Step', 'Spin#', 'Next#', 'Action', 'Pair', 'Filter', 'Numbers', 'Conf%', 'Bet/Num', 'Hit', 'P&L', 'Bankroll'];
        const headerRow = sheet.getRow(3);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });

        // Data rows — EXACT same logic as auto-test-report.js _createSessionSheet
        const steps = session.steps || [];
        steps.forEach((step, idx) => {
            const row = sheet.getRow(idx + 4);

            let actionLabel = step.action;
            let pairLabel = step.selectedPair || '--';
            let filterLabel = step.selectedFilter || '--';
            let numsLabel = step.numbersCount;
            let confLabel = step.confidence;
            let betLabel = `$${step.betPerNumber}`;
            let hitLabel = step.action === 'BET' ? (step.hit ? 'YES' : 'NO') : '--';

            if (step.action === 'WATCH') {
                pairLabel = 'Watching for pattern';
                filterLabel = '--';
                numsLabel = '--';
                confLabel = '--';
                betLabel = '--';
            } else if (step.action === 'REANALYZE') {
                actionLabel = 'BET RESET';
                pairLabel = 'Loss streak — bet reset to $2';
                filterLabel = step.selectedFilter || '--';
                numsLabel = '--';
                confLabel = '--';
                betLabel = '$2';
                hitLabel = '--';
            }

            const values = [
                idx + 1,
                step.spinNumber,
                step.nextNumber !== undefined && step.nextNumber !== null ? step.nextNumber : '',
                actionLabel,
                pairLabel,
                filterLabel,
                numsLabel,
                confLabel,
                betLabel,
                hitLabel,
                step.pnl !== 0 ? `$${step.pnl}` : '--',
                `$${step.bankroll.toLocaleString()}`
            ];
            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
            });

            // WATCH rows — light blue background, italic font
            if (step.action === 'WATCH') {
                for (let c = 1; c <= 12; c++) {
                    const cell = row.getCell(c);
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
                    cell.font = { italic: true, color: { argb: 'FF4472C4' } };
                }
            }

            // REANALYZE rows — bold red background
            if (step.action === 'REANALYZE') {
                for (let c = 1; c <= 12; c++) {
                    const cell = row.getCell(c);
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
                    cell.font = { bold: true, color: { argb: 'FF721C24' } };
                }
            }

            // Color the P&L cell
            const pnlCell = row.getCell(11);
            if (step.pnl > 0) {
                pnlCell.font = { bold: true, color: { argb: 'FF28A745' } };
            } else if (step.pnl < 0) {
                pnlCell.font = { bold: true, color: { argb: 'FFDC3545' } };
            }

            // Color the Hit cell
            const hitCell = row.getCell(10);
            if (step.action === 'BET') {
                if (step.hit) {
                    hitCell.font = { bold: true, color: { argb: 'FF28A745' } };
                } else {
                    hitCell.font = { color: { argb: 'FFDC3545' } };
                }
            }
        });

        // Column widths — same as test report
        sheet.columns = [
            { width: 6 }, { width: 8 }, { width: 8 }, { width: 8 },
            { width: 14 }, { width: 18 }, { width: 10 }, { width: 8 },
            { width: 10 }, { width: 6 }, { width: 10 }, { width: 12 }
        ];

        return sheet;
    }

    /**
     * Save workbook via Electron IPC or browser Blob download.
     */
    async _saveToFile(workbook, sessionResult) {
        const buffer = await workbook.xlsx.writeBuffer();
        const mode = sessionResult.mode || 'live';

        // Try Electron IPC first
        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.saveXlsx === 'function') {
            return await window.aiAPI.saveXlsx(Array.from(new Uint8Array(buffer)));
        }

        // Fallback: browser Blob download
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `live-session-${mode}-${Date.now()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        }

        return false;
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.LiveSessionExport = LiveSessionExport;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LiveSessionExport };
}

console.log('✅ Live Session Export loaded');
