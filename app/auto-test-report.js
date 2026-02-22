/**
 * Auto Test Report — Excel .xlsx generation for backtesting results
 *
 * Uses ExcelJS to create formatted workbooks with:
 *   - Overview sheet: strategy comparison
 *   - Strategy sheets: all sessions for each strategy
 *   - Session detail sheets: step-by-step logs for selected sessions
 */

const STRATEGY_LABELS = {
    1: 'Strategy 1 - Aggressive',
    2: 'Strategy 2 - Conservative',
    3: 'Strategy 3 - Cautious'
};

class AutoTestReport {
    /**
     * @param {Object} ExcelJS - The ExcelJS module (passed in for testability)
     */
    constructor(ExcelJS) {
        if (!ExcelJS) {
            throw new Error('AutoTestReport requires ExcelJS module');
        }
        this.ExcelJS = ExcelJS;
    }

    /**
     * Generate a complete Excel workbook from test results.
     *
     * @param {FullTestResult} result - The full backtesting result
     * @returns {ExcelJS.Workbook}
     */
    generate(result) {
        const workbook = new this.ExcelJS.Workbook();
        workbook.creator = 'Roulette Tracker Auto Test';
        workbook.created = new Date();

        // Sheet 1: Overview
        this._createOverviewSheet(workbook, result);

        // Sheet 2-4: One per strategy
        for (const strategyNum of [1, 2, 3]) {
            const data = result.strategies[strategyNum];
            if (data && data.sessions.length > 0) {
                this._createStrategySheet(workbook, strategyNum, data);
            }
        }

        // Sheet 5+: Session detail sheets (top 3 best + top 3 worst per strategy)
        for (const strategyNum of [1, 2, 3]) {
            const data = result.strategies[strategyNum];
            if (!data || data.sessions.length === 0) continue;

            const topSessions = this._getTopSessions(data.sessions, 3);
            for (const session of topSessions) {
                this._createSessionSheet(workbook, session, strategyNum);
            }
        }

        return workbook;
    }

    /**
     * Get top N best and worst sessions for detailed export.
     */
    _getTopSessions(sessions, n) {
        const sorted = [...sessions].sort((a, b) => b.finalProfit - a.finalProfit);
        const best = sorted.slice(0, n);
        const worst = sorted.slice(-n).reverse();
        // Deduplicate
        const seen = new Set();
        const result = [];
        for (const s of [...best, ...worst]) {
            const key = `${s.startIdx}-${s.strategy}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(s);
            }
        }
        return result;
    }

    /**
     * Create the Overview sheet with strategy comparison.
     */
    _createOverviewSheet(workbook, result) {
        const sheet = workbook.addWorksheet('Overview');

        // Title
        sheet.mergeCells('A1:I1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'Auto Test Report';
        titleCell.font = { size: 16, bold: true, color: { argb: 'FF333333' } };
        titleCell.alignment = { horizontal: 'center' };

        // Metadata
        sheet.getCell('A2').value = `File: ${result.testFile}`;
        sheet.getCell('A3').value = `Spins: ${result.totalTestSpins} | Generated: ${result.timestamp}`;
        sheet.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };
        sheet.getCell('A3').font = { size: 10, color: { argb: 'FF666666' } };

        // Headers (row 5)
        const headers = ['Strategy', 'Sessions', 'Wins', 'Busts', 'Incomplete', 'Win Rate', 'Avg Profit', 'Avg Spins (Win)', 'Max Drawdown'];
        const headerRow = sheet.getRow(5);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Data rows (6-8)
        for (const strategyNum of [1, 2, 3]) {
            const summary = result.strategies[strategyNum].summary;
            const row = sheet.getRow(5 + strategyNum);
            const values = [
                STRATEGY_LABELS[strategyNum],
                summary.totalSessions,
                summary.wins,
                summary.busts,
                summary.incomplete,
                `${(summary.winRate * 100).toFixed(1)}%`,
                `$${summary.avgProfit.toFixed(2)}`,
                summary.avgSpinsToWin,
                `$${summary.maxDrawdown.toFixed(2)}`
            ];
            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });

            // Color the strategy name cell
            const nameCell = row.getCell(1);
            nameCell.alignment = { horizontal: 'left' };
            if (strategyNum === 1) {
                nameCell.font = { bold: true, color: { argb: 'FF28A745' } };
            } else if (strategyNum === 2) {
                nameCell.font = { bold: true, color: { argb: 'FF007BFF' } };
            } else {
                nameCell.font = { bold: true, color: { argb: 'FF6F42C1' } };
            }
        }

        // Column widths
        sheet.columns = [
            { width: 28 }, { width: 10 }, { width: 8 }, { width: 8 },
            { width: 12 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 14 }
        ];

        return sheet;
    }

    /**
     * Create a strategy sheet with all sessions.
     */
    _createStrategySheet(workbook, strategyNum, data) {
        const sheetName = STRATEGY_LABELS[strategyNum];
        const sheet = workbook.addWorksheet(sheetName);

        // Headers
        const headers = ['#', 'Start Idx', 'Outcome', 'Spins', 'Bets', 'Wins', 'Losses', 'Win Rate', 'Profit', 'Max Drawdown'];
        const headerRow = sheet.getRow(1);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Data rows
        data.sessions.forEach((session, idx) => {
            const row = sheet.getRow(idx + 2);
            const values = [
                idx + 1,
                session.startIdx,
                session.outcome,
                session.totalSpins,
                session.totalBets,
                session.wins,
                session.losses,
                `${(session.winRate * 100).toFixed(1)}%`,
                `$${session.finalProfit.toFixed(2)}`,
                `$${session.maxDrawdown.toFixed(2)}`
            ];
            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });

            // Color code by outcome
            const outcomeCell = row.getCell(3);
            if (session.outcome === 'WIN') {
                outcomeCell.font = { bold: true, color: { argb: 'FF28A745' } };
                outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
            } else if (session.outcome === 'BUST') {
                outcomeCell.font = { bold: true, color: { argb: 'FFDC3545' } };
                outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
            } else {
                outcomeCell.font = { color: { argb: 'FF6C757D' } };
                outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
            }
        });

        // Column widths
        sheet.columns = [
            { width: 6 }, { width: 10 }, { width: 12 }, { width: 8 },
            { width: 8 }, { width: 8 }, { width: 8 }, { width: 10 },
            { width: 12 }, { width: 14 }
        ];

        // Auto-filter
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: data.sessions.length + 1, column: 10 }
        };

        // Freeze header row
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        return sheet;
    }

    /**
     * Create a session detail sheet with step-by-step log.
     */
    _createSessionSheet(workbook, session, strategyNum) {
        const sheetName = `S${strategyNum}-Start${session.startIdx}`;
        // Truncate if too long (Excel sheet names max 31 chars)
        const safeName = sheetName.substring(0, 31);
        const sheet = workbook.addWorksheet(safeName);

        // Summary row
        sheet.mergeCells('A1:K1');
        const summaryCell = sheet.getCell('A1');
        summaryCell.value = `Strategy ${strategyNum} | Start: ${session.startIdx} | Outcome: ${session.outcome} | Profit: $${session.finalProfit.toFixed(2)}`;
        summaryCell.font = { bold: true, size: 12 };

        // Headers (row 3)
        const headers = ['Step', 'Spin#', 'Next#', 'Action', 'Pair', 'Filter', 'Numbers', 'Conf%', 'Bet/Num', 'Hit', 'P&L', 'Bankroll'];
        const headerRow = sheet.getRow(3);
        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.alignment = { horizontal: 'center' };
        });

        // Data rows
        session.steps.forEach((step, idx) => {
            const row = sheet.getRow(idx + 4);
            const values = [
                idx + 1,
                step.spinNumber,
                step.nextNumber !== undefined ? step.nextNumber : '',
                step.action,
                step.selectedPair || '--',
                step.selectedFilter || '--',
                step.numbersCount,
                step.confidence,
                `$${step.betPerNumber}`,
                step.action === 'BET' ? (step.hit ? 'YES' : 'NO') : '--',
                step.pnl !== 0 ? `$${step.pnl}` : '--',
                `$${step.bankroll.toLocaleString()}`
            ];
            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                cell.value = v;
                cell.alignment = { horizontal: 'center' };
            });

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

        // Column widths
        sheet.columns = [
            { width: 6 }, { width: 8 }, { width: 8 }, { width: 8 },
            { width: 14 }, { width: 18 }, { width: 10 }, { width: 8 },
            { width: 10 }, { width: 6 }, { width: 10 }, { width: 12 }
        ];

        return sheet;
    }

    /**
     * Save workbook to file via Electron IPC or browser download.
     *
     * @param {ExcelJS.Workbook} workbook
     * @returns {Promise<boolean>} True if saved successfully
     */
    async saveToFile(workbook) {
        const buffer = await workbook.xlsx.writeBuffer();

        // Try Electron IPC first
        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.saveXlsx === 'function') {
            return await window.aiAPI.saveXlsx(Array.from(new Uint8Array(buffer)));
        }

        // Fallback: browser Blob download
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = typeof document !== 'undefined' ? document.createElement('a') : null;
            if (a) {
                a.href = url;
                a.download = `auto-test-report-${Date.now()}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
                return true;
            }
        }

        return false;
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutoTestReport, STRATEGY_LABELS };
}
if (typeof window !== 'undefined') {
    window.AutoTestReport = AutoTestReport;
}

console.log('✅ Auto Test Report script loaded');
