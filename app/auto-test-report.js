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

        // Build map of ALL detail sheet names (for hyperlinks in strategy sheets)
        const detailSheetMap = {};
        for (const strategyNum of [1, 2, 3]) {
            const data = result.strategies[strategyNum];
            if (!data || data.sessions.length === 0) continue;
            for (const session of data.sessions) {
                const sheetName = `S${strategyNum}-Start${session.startIdx}`.substring(0, 31);
                detailSheetMap[`${strategyNum}-${session.startIdx}`] = sheetName;
            }
        }

        // Sheet 2-4: One per strategy (with hyperlinks to detail tabs)
        for (const strategyNum of [1, 2, 3]) {
            const data = result.strategies[strategyNum];
            if (data && data.sessions.length > 0) {
                this._createStrategySheet(workbook, strategyNum, data, detailSheetMap);
            }
        }

        // Sheet 5+: Session detail sheets for EVERY session (in order)
        for (const strategyNum of [1, 2, 3]) {
            const data = result.strategies[strategyNum];
            if (!data || data.sessions.length === 0) continue;
            for (const session of data.sessions) {
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

        // Title — merged across all data columns (A..N = 14 cols)
        sheet.mergeCells('A1:N1');
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
        // Added three dollar-total columns after Total Profit:
        //   Total Win $  — gross sum of all winning bet payouts
        //   Total Loss $ — gross sum of all losing bet stakes (abs value)
        //   Total P&L    — net = Total Win $ − Total Loss $
        // All existing columns are preserved in their previous positions.
        const headers = ['Strategy', 'Sessions', 'Wins', 'Busts', 'Incomplete', 'Win Rate', 'Total Profit', 'Total Win $', 'Total Loss $', 'Total P&L', 'Avg Profit', 'Avg Spins', 'Max Spins', 'Max Drawdown'];
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
            // Dollar totals — defensive fallback to 0 if an older summary
            // object predates the totalWon/totalLost fields. The runner
            // now always populates them (_computeSummary +
            // _emptyStrategySummary).
            const totalWon = typeof summary.totalWon === 'number' ? summary.totalWon : 0;
            const totalLost = typeof summary.totalLost === 'number' ? summary.totalLost : 0;
            const totalPL = typeof summary.totalProfit === 'number' ? summary.totalProfit : (totalWon - totalLost);
            const values = [
                STRATEGY_LABELS[strategyNum],
                summary.totalSessions,
                summary.wins,
                summary.busts,
                summary.incomplete,
                `${(summary.winRate * 100).toFixed(1)}%`,
                `$${(summary.totalProfit || 0).toLocaleString()}`,
                `$${totalWon.toLocaleString()}`,
                `$${totalLost.toLocaleString()}`,
                `$${totalPL.toLocaleString()}`,
                `$${summary.avgProfit.toFixed(2)}`,
                summary.avgSpinsToWin,
                summary.maxSpinsToWin || '--',
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

        // Column widths — 14 columns total (Strategy + 13 metric columns).
        sheet.columns = [
            { width: 28 }, { width: 10 }, { width: 8 }, { width: 8 },
            { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 },
            { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 },
            { width: 12 }, { width: 14 }
        ];

        return sheet;
    }

    /**
     * Create a strategy sheet with all sessions + clickable links to detail tabs.
     *
     * @param {Object} detailSheetMap - Map of "strategyNum-startIdx" → sheet name
     */
    _createStrategySheet(workbook, strategyNum, data, detailSheetMap) {
        const sheetName = STRATEGY_LABELS[strategyNum];
        const sheet = workbook.addWorksheet(sheetName);

        // Headers (11 columns — added "Details" link column)
        const headers = ['#', 'Start Idx', 'Outcome', 'Spins', 'Bets', 'Wins', 'Losses', 'Win Rate', 'Profit', 'Max Drawdown', 'Details'];
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

            // Details column — clickable hyperlink to session detail tab
            const detailCell = row.getCell(11);
            const detailKey = `${strategyNum}-${session.startIdx}`;
            if (detailSheetMap && detailSheetMap[detailKey]) {
                const targetSheet = detailSheetMap[detailKey];
                detailCell.value = { text: '→ View', hyperlink: `#'${targetSheet}'!A1` };
                detailCell.font = { color: { argb: 'FF0563C1' }, underline: true };
            } else {
                detailCell.value = '--';
                detailCell.font = { color: { argb: 'FF999999' } };
            }
            detailCell.alignment = { horizontal: 'center' };
            detailCell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Column widths (11 columns)
        sheet.columns = [
            { width: 6 }, { width: 10 }, { width: 12 }, { width: 8 },
            { width: 8 }, { width: 8 }, { width: 8 }, { width: 10 },
            { width: 12 }, { width: 14 }, { width: 10 }
        ];

        // Auto-filter
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: data.sessions.length + 1, column: 11 }
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

        // ← Back link to strategy tab (column L, same row as summary)
        const backCell = sheet.getRow(1).getCell(12);
        const strategySheetName = STRATEGY_LABELS[strategyNum];
        backCell.value = { text: '← Back', hyperlink: `#'${strategySheetName}'!A1` };
        backCell.font = { color: { argb: 'FF0563C1' }, underline: true, size: 10 };
        backCell.alignment = { horizontal: 'center' };

        // Headers (row 3)
        // Legacy columns 1..12 are fixed and must not shift. AI-trained
        // sessions append optional columns 13..16 (Phase, AI Action,
        // AI Conf%, Shadow?). Non-AI-trained sessions never add them.
        const hasAITrained = Array.isArray(session.steps)
            && session.steps.some(s => s && s.aiTrained);
        const headers = ['Step', 'Spin#', 'Next#', 'Action', 'Pair', 'Filter', 'Numbers', 'Conf%', 'Bet/Num', 'Hit', 'P&L', 'Bankroll'];
        if (hasAITrained) {
            headers.push('Phase', 'AI Action', 'AI Conf%', 'Shadow?');
        }
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

            // Determine display values based on action type
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
            // AI-trained append-only columns. Only populated when the
            // session carries any AI-trained step; legacy sessions see
            // no change in column count.
            if (hasAITrained) {
                const ai = step.aiTrained;
                if (ai) {
                    values.push(
                        ai.phase || '--',
                        ai.action || '--',
                        (typeof ai.confidence === 'number')
                            ? `${Math.round(ai.confidence * 100)}%`
                            : '--',
                        (ai.action === 'SHADOW_PREDICT')
                            ? (ai.shadowHit === true ? 'HIT'
                              : ai.shadowHit === false ? 'MISS'
                              : 'PENDING')
                            : '--'
                    );
                } else {
                    // WATCH / REANALYZE rows in an AI-trained session —
                    // no per-step AI payload; blank placeholders keep
                    // the column grid rectangular.
                    values.push('--', '--', '--', '--');
                }
            }
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

            // REANALYZE/BET RESET rows — bold red background
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

        // Column widths — legacy 12, plus 4 optional AI-trained columns.
        const columnWidths = [
            { width: 6 }, { width: 8 }, { width: 8 }, { width: 8 },
            { width: 14 }, { width: 18 }, { width: 10 }, { width: 8 },
            { width: 10 }, { width: 6 }, { width: 10 }, { width: 12 }
        ];
        if (hasAITrained) {
            columnWidths.push(
                { width: 12 }, // Phase
                { width: 14 }, // AI Action
                { width: 10 }, // AI Conf%
                { width: 10 }  // Shadow?
            );
        }
        sheet.columns = columnWidths;

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
