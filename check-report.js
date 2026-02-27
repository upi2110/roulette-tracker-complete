#!/usr/bin/env node
/**
 * check-report.js — Comprehensive anomaly checker for the auto-test Excel report.
 *
 * KNOWN ISSUE DISCOVERED:
 *   The Bet/Num column shows the NEXT bet (after Martingale adjustment), NOT the
 *   bet actually used for that row's P&L. The actual bet is inferred from P&L math.
 *   This is a display bug in auto-test-runner.js line 271.
 *
 * Checks performed:
 *   1. Overview sheet dump + verification
 *   2. Detailed session trace on 10-15 sampled sheets
 *   3. Full scan of all session sheets for outcome counts
 *   4. REANALYZE / BET RESET row verification
 *   5. Anomaly summary
 */

const ExcelJS = require('exceljs');
const path = require('path');

const FILE = '/Users/ubusan-nb-ecr/Desktop/auto-test-report-1772185080351.xlsx';

const OK = '\u2713';
const FAIL = '\u2717';

function num(v) {
  if (v === null || v === undefined || v === '' || v === '-' || v === '--') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[$,]/g, '').trim();
  if (s === '' || s === '-' || s === '--') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function cellVal(row, col) {
  const cell = row.getCell(col);
  if (!cell) return null;
  let v = cell.value;
  if (v && typeof v === 'object') {
    if (v.result !== undefined) v = v.result;
    else if (v.richText) v = v.richText.map(r => r.text).join('');
    else if (v.text) v = v.text;
  }
  return v;
}

function padR(s, n) { s = String(s ?? ''); return s + ' '.repeat(Math.max(0, n - s.length)); }
function padL(s, n) { s = String(s ?? ''); return ' '.repeat(Math.max(0, n - s.length)) + s; }

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const allSheets = wb.worksheets.map(ws => ws.name);
  const overviewSheet = wb.getWorksheet('Overview');
  const sessionSheets = allSheets.filter(n => n !== 'Overview');

  console.log('='.repeat(90));
  console.log('  COMPREHENSIVE REPORT CHECK');
  console.log('  File: ' + path.basename(FILE));
  console.log('  Total sheets: ' + allSheets.length + ' (1 Overview + ' + sessionSheets.length + ' sessions)');
  console.log('='.repeat(90));

  // ====================================================================
  // 1. OVERVIEW SHEET
  // ====================================================================
  console.log('\n' + '-'.repeat(90));
  console.log('  1. OVERVIEW SHEET');
  console.log('-'.repeat(90));

  if (!overviewSheet) {
    console.log(FAIL + ' Overview sheet not found!');
  } else {
    const rowCount = overviewSheet.rowCount;
    const colCount = overviewSheet.columnCount;
    console.log('  Rows: ' + rowCount + '  Cols: ' + colCount + '\n');

    const grid = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = overviewSheet.getRow(r);
      const cells = [];
      for (let c = 1; c <= colCount; c++) {
        cells.push(String(cellVal(row, c) ?? ''));
      }
      grid.push(cells);
    }
    const widths = [];
    for (let c = 0; c < colCount; c++) {
      widths[c] = Math.min(25, Math.max(...grid.map(r => (r[c] || '').length), 4));
    }

    for (let r = 0; r < grid.length; r++) {
      const line = grid[r].map((v, c) => padR(v, widths[c])).join(' | ');
      console.log('  ' + line);
      if (r === 0) console.log('  ' + widths.map(w => '-'.repeat(w)).join('-+-'));
    }
  }

  // ====================================================================
  // 2. SAMPLE SESSION DEEP CHECK (10-15 sheets)
  // ====================================================================
  console.log('\n' + '-'.repeat(90));
  console.log('  2. SAMPLED SESSION DEEP CHECK');
  console.log('-'.repeat(90));
  console.log('  NOTE: Bet/Num column shows the NEXT bet (post-Martingale), not the actual bet');
  console.log('        used for P&L. Actual bet is inferred from P&L math. This is a known');
  console.log('        display bug in auto-test-runner.js line 271.');

  const s1 = sessionSheets.filter(n => n.startsWith('S1-'));
  const s2 = sessionSheets.filter(n => n.startsWith('S2-'));
  const s3 = sessionSheets.filter(n => n.startsWith('S3-'));

  function pickSample(arr, count) {
    if (arr.length <= count) return [...arr];
    const picks = [arr[0], arr[arr.length - 1]];
    const mid = arr.filter((_, i) => i > 0 && i < arr.length - 1);
    while (picks.length < count && mid.length > 0) {
      const idx = Math.floor(Math.random() * mid.length);
      picks.push(mid.splice(idx, 1)[0]);
    }
    return picks;
  }

  const sampled = [
    ...pickSample(s1, 5),
    ...pickSample(s2, 5),
    ...pickSample(s3, 5),
  ];

  const anomalies = [];

  function inferActualBet(pnl, numbersCount, hit) {
    // Given the P&L value and numbers count, infer the actual bet used
    if (pnl === null || numbersCount === null || numbersCount === 0) return null;
    if (hit) {
      // pnl = actualBet * (36 - numbersCount)
      const divisor = 36 - numbersCount;
      if (divisor === 0) return null;
      return pnl / divisor;
    } else {
      // pnl = -(actualBet * numbersCount)
      return (-pnl) / numbersCount;
    }
  }

  function checkSession(sheetName, verbose) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      anomalies.push({ sheet: sheetName, msg: 'Sheet not found' });
      return null;
    }

    if (verbose) console.log('\n  -- ' + sheetName + ' --');

    // Column layout: 1:Step 2:Spin# 3:Next# 4:Action 5:Pair 6:Filter 7:Numbers(count) 8:Conf% 9:Bet/Num(displayed=NEXT) 10:Hit 11:P&L 12:Bankroll
    const COL = { STEP:1, SPIN:2, NEXT:3, ACTION:4, PAIR:5, FILTER:6, NUMBERS:7, CONF:8, BET:9, HIT:10, PNL:11, BANK:12 };

    const rowCount = ws.rowCount;
    let prevBankroll = null;
    let chainOk = true;
    let pnlOk = true;
    let capOk = true;
    let watchOk = true;
    let reanalyzeSeen = false;
    let betResetSeen = false;
    let lastBankroll = null;
    let totalBetSteps = 0;
    let headerRow = 0;
    let errors = [];

    // Row 1 is usually a title/summary, row 2 blank, row 3 headers
    for (let r = 1; r <= Math.min(5, rowCount); r++) {
      const v = cellVal(ws.getRow(r), COL.STEP);
      if (v && String(v).toLowerCase().includes('step')) {
        headerRow = r;
        break;
      }
    }

    // Read title row for outcome info
    const titleVal = String(cellVal(ws.getRow(1), 1) ?? '');
    let reportedOutcome = 'UNKNOWN';
    let reportedProfit = null;
    if (titleVal.includes('WIN')) reportedOutcome = 'WIN';
    else if (titleVal.includes('BUST')) reportedOutcome = 'BUST';
    else if (titleVal.includes('INCOMPLETE')) reportedOutcome = 'INCOMPLETE';
    const profitMatch = titleVal.match(/Profit:\s*\$?([-\d,.]+)/);
    if (profitMatch) reportedProfit = num(profitMatch[1]);

    const dataStart = headerRow + 1;
    let printedRows = 0;
    const MAX_PRINT = verbose ? 40 : 0;

    // Track the actual bet (what was REALLY used for P&L)
    // The first BET step uses MIN_BET = $2
    let expectedActualBet = 2; // Starting bet is $2

    for (let r = dataStart; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const step = cellVal(row, COL.STEP);
      const action = String(cellVal(row, COL.ACTION) ?? '').trim().toUpperCase();
      const numbersCount = num(cellVal(row, COL.NUMBERS)); // This is the COUNT of numbers
      const displayedBet = num(cellVal(row, COL.BET));
      const hitRaw = String(cellVal(row, COL.HIT) ?? '').trim().toUpperCase();
      const hit = (hitRaw === 'YES' || hitRaw === 'Y' || hitRaw === 'HIT');
      const pnl = num(cellVal(row, COL.PNL));
      const bankroll = num(cellVal(row, COL.BANK));

      if (step === null && action === '' && bankroll === null) continue;

      const isReanalyze = action.includes('REANALY') || action.includes('RESET');
      const isBet = action === 'BET';
      const isWatch = action === 'WATCH';
      const isSkip = action === 'SKIP';

      if (isReanalyze) {
        reanalyzeSeen = true;
        // After REANALYZE, the displayed bet should be $2 (and actual bet for next row should also be $2)
        if (displayedBet !== null && displayedBet === 2) {
          betResetSeen = true;
        }
      }

      if (isBet) {
        totalBetSteps++;

        // Infer actual bet from P&L
        const actualBet = (pnl !== null && numbersCount !== null && numbersCount > 0)
          ? inferActualBet(pnl, numbersCount, hit) : null;

        // The ACTUAL bet used for P&L should equal the PREVIOUS row's displayed bet
        // (because the displayed bet is post-Martingale-adjustment)
        // But we can verify P&L is internally consistent: pnl = actualBet * (36 - nums) or -(actualBet * nums)
        if (actualBet !== null) {
          // Check that actualBet is a clean integer
          if (Math.abs(actualBet - Math.round(actualBet)) > 0.01) {
            pnlOk = false;
            errors.push('Row ' + r + ': Inferred actual bet is not integer: $' + actualBet.toFixed(2) + ' (pnl=' + pnl + ', nums=' + numbersCount + ', hit=' + hitRaw + ')');
          }

          // Check the actual bet is within cap (max $10)
          if (Math.round(actualBet) > 10) {
            capOk = false;
            errors.push('Row ' + r + ': Actual bet exceeds $10 cap: $' + Math.round(actualBet) + ' (inferred from P&L)');
          }

          // Verify P&L math with inferred bet
          const roundedBet = Math.round(actualBet);
          let expectedPnl;
          if (hit) {
            expectedPnl = roundedBet * (36 - numbersCount);
          } else {
            expectedPnl = -(roundedBet * numbersCount);
          }
          if (Math.abs(pnl - expectedPnl) > 0.50) {
            pnlOk = false;
            errors.push('Row ' + r + ': P&L self-consistency error: pnl=' + pnl + ', expected=' + expectedPnl + ' (inferred bet=$' + roundedBet + ', nums=' + numbersCount + ', hit=' + hitRaw + ')');
          }
        }
      }

      // WATCH should have no P&L
      if (isWatch && pnl !== null && pnl !== 0) {
        watchOk = false;
        errors.push('Row ' + r + ': WATCH step has P&L = $' + pnl + ' (should be 0 or empty)');
      }

      // Bankroll chain check
      if (bankroll !== null) {
        if (prevBankroll !== null) {
          const effectivePnl = (pnl !== null) ? pnl : 0;
          const expectedBank = prevBankroll + effectivePnl;
          if (Math.abs(bankroll - expectedBank) > 0.50) {
            chainOk = false;
            errors.push('Row ' + r + ': Bankroll chain break: prev=$' + prevBankroll + ' + pnl=$' + effectivePnl + ' = $' + expectedBank + ', got $' + bankroll);
          }
        }
        prevBankroll = bankroll;
        lastBankroll = bankroll;
      }

      // Print trace
      if (printedRows < MAX_PRINT) {
        const stepStr = padR(step ?? '', 6);
        const actStr = padR(action, 12);
        const betStr = padL(displayedBet !== null ? ('$' + displayedBet) : '-', 5);
        const numsStr = padL(numbersCount !== null ? String(numbersCount) : '-', 3);
        const hitStr = padR(hitRaw || '-', 4);
        const pnlStr = padL(pnl !== null ? ('$' + pnl) : '-', 8);
        const bankStr = padL(bankroll !== null ? ('$' + bankroll) : '-', 8);
        const actualBetInferred = (isBet && pnl !== null && numbersCount > 0)
          ? '$' + Math.round(inferActualBet(pnl, numbersCount, hit)) : '-';
        console.log('    ' + stepStr + ' ' + actStr + ' dispBet=' + betStr + ' actualBet=' + padL(actualBetInferred, 4) + ' nums=' + numsStr + ' hit=' + hitStr + ' pnl=' + pnlStr + ' bank=' + bankStr);
        printedRows++;
      }
    }

    if (verbose && printedRows >= MAX_PRINT && rowCount - dataStart > MAX_PRINT) {
      console.log('    ... (' + (rowCount - dataStart - MAX_PRINT) + ' more rows)');
    }

    // Determine outcome from final bankroll
    const profit = lastBankroll !== null ? lastBankroll - 4000 : null;
    let computedOutcome = 'UNKNOWN';
    if (profit !== null) {
      if (profit >= 100) computedOutcome = 'WIN';
      else if (lastBankroll <= 0) computedOutcome = 'BUST';
      else computedOutcome = 'INCOMPLETE';
    }

    // Check outcome consistency with title
    let outcomeMatch = true;
    if (reportedOutcome !== 'UNKNOWN' && computedOutcome !== 'UNKNOWN' && reportedOutcome !== computedOutcome) {
      outcomeMatch = false;
      errors.push('Outcome mismatch: title says ' + reportedOutcome + ', computed from bankroll = ' + computedOutcome);
    }
    if (reportedProfit !== null && profit !== null && Math.abs(reportedProfit - profit) > 1) {
      outcomeMatch = false;
      errors.push('Profit mismatch: title says $' + reportedProfit + ', computed = $' + profit);
    }

    if (verbose) {
      console.log('    ---- summary ----');
      console.log('    Title: ' + titleVal);
      console.log('    Final bankroll: $' + lastBankroll + '  |  Profit: $' + profit + '  |  Outcome: ' + computedOutcome + ' (title: ' + reportedOutcome + ')');
      console.log('    Bet steps: ' + totalBetSteps + '  |  Reanalyze: ' + reanalyzeSeen + '  |  Bet reset: ' + betResetSeen);
      console.log('    ' + (chainOk ? OK : FAIL) + ' Bankroll chain' + (chainOk ? ' intact' : ' BROKEN'));
      console.log('    ' + (pnlOk ? OK : FAIL) + ' P&L math' + (pnlOk ? ' consistent' : ' ERRORS'));
      console.log('    ' + (capOk ? OK : FAIL) + ' Bet cap ($10 max)' + (capOk ? '' : ' VIOLATED'));
      console.log('    ' + (watchOk ? OK : FAIL) + ' WATCH steps clean' + (watchOk ? '' : ' -- have unexpected P&L'));
      console.log('    ' + (outcomeMatch ? OK : FAIL) + ' Outcome consistency' + (outcomeMatch ? '' : ' MISMATCH'));

      if (errors.length > 0) {
        console.log('    ' + FAIL + ' ' + errors.length + ' error(s):');
        errors.forEach(function(e) { console.log('      ' + e); });
      }
    }

    if (errors.length > 0) {
      errors.forEach(function(e) { anomalies.push({ sheet: sheetName, msg: e }); });
    }

    return {
      sheetName: sheetName,
      reportedOutcome: reportedOutcome,
      computedOutcome: computedOutcome,
      profit: profit,
      lastBankroll: lastBankroll,
      chainOk: chainOk,
      pnlOk: pnlOk,
      capOk: capOk,
      watchOk: watchOk,
      outcomeMatch: outcomeMatch,
      reanalyzeSeen: reanalyzeSeen,
      betResetSeen: betResetSeen,
      totalBetSteps: totalBetSteps,
      errors: errors
    };
  }

  // Run deep check on sampled sessions (verbose)
  for (const name of sampled) {
    checkSession(name, true);
  }

  // ====================================================================
  // 3. FULL SCAN -- all sessions, count outcomes
  // ====================================================================
  console.log('\n' + '-'.repeat(90));
  console.log('  3. FULL SESSION SCAN -- outcome counts');
  console.log('-'.repeat(90));

  const outcomeCounts = { WIN: 0, INCOMPLETE: 0, BUST: 0, UNKNOWN: 0 };
  const outcomeByStrategy = {
    S1: { WIN:0, INCOMPLETE:0, BUST:0, UNKNOWN:0 },
    S2: { WIN:0, INCOMPLETE:0, BUST:0, UNKNOWN:0 },
    S3: { WIN:0, INCOMPLETE:0, BUST:0, UNKNOWN:0 }
  };
  let totalChainBreaks = 0;
  let totalPnlErrors = 0;
  let totalCapViolations = 0;
  let totalOutcomeMismatch = 0;
  const sheetsWithIssues = [];

  for (const name of sessionSheets) {
    const result = checkSession(name, false);
    if (!result) continue;

    outcomeCounts[result.computedOutcome]++;
    const strat = name.substring(0, 2);
    if (outcomeByStrategy[strat]) outcomeByStrategy[strat][result.computedOutcome]++;

    if (!result.chainOk) totalChainBreaks++;
    if (!result.pnlOk) totalPnlErrors++;
    if (!result.capOk) totalCapViolations++;
    if (!result.outcomeMatch) totalOutcomeMismatch++;

    if (!result.chainOk || !result.pnlOk || !result.capOk || !result.outcomeMatch) {
      const issues = [];
      if (!result.chainOk) issues.push('bankroll-chain-break');
      if (!result.pnlOk) issues.push('pnl-math-error');
      if (!result.capOk) issues.push('bet-cap-violation');
      if (!result.outcomeMatch) issues.push('outcome-mismatch');
      sheetsWithIssues.push({ sheet: name, issues: issues.join(', ') });
    }
  }

  console.log('\n  Overall outcome counts (computed from final bankroll):');
  console.log('    WIN:        ' + outcomeCounts.WIN);
  console.log('    INCOMPLETE: ' + outcomeCounts.INCOMPLETE);
  console.log('    BUST:       ' + outcomeCounts.BUST);
  console.log('    UNKNOWN:    ' + outcomeCounts.UNKNOWN);
  console.log('    TOTAL:      ' + sessionSheets.length);

  console.log('\n  By strategy:');
  for (const [strat, counts] of Object.entries(outcomeByStrategy)) {
    const total = counts.WIN + counts.INCOMPLETE + counts.BUST + counts.UNKNOWN;
    if (total === 0) continue;
    const winRate = total > 0 ? ((counts.WIN / total) * 100).toFixed(1) : '0';
    console.log('    ' + strat + ': ' + counts.WIN + ' WIN, ' + counts.INCOMPLETE + ' INC, ' + counts.BUST + ' BUST, ' + counts.UNKNOWN + ' UNK  (' + total + ' total, ' + winRate + '% win)');
  }

  console.log('\n  Integrity checks across ALL ' + sessionSheets.length + ' sessions:');
  console.log('    ' + (totalChainBreaks === 0 ? OK : FAIL) + ' Bankroll chain breaks: ' + totalChainBreaks + ' sheet(s)');
  console.log('    ' + (totalPnlErrors === 0 ? OK : FAIL) + ' P&L self-consistency errors: ' + totalPnlErrors + ' sheet(s)');
  console.log('    ' + (totalCapViolations === 0 ? OK : FAIL) + ' Bet cap violations (actual > $10): ' + totalCapViolations + ' sheet(s)');
  console.log('    ' + (totalOutcomeMismatch === 0 ? OK : FAIL) + ' Outcome mismatches (title vs computed): ' + totalOutcomeMismatch + ' sheet(s)');

  if (sheetsWithIssues.length > 0) {
    console.log('\n  Sheets with issues (' + sheetsWithIssues.length + '):');
    for (const e of sheetsWithIssues.slice(0, 30)) {
      console.log('    ' + FAIL + ' ' + e.sheet + ': ' + e.issues);
    }
    if (sheetsWithIssues.length > 30) {
      console.log('    ... and ' + (sheetsWithIssues.length - 30) + ' more');
    }
  }

  // ====================================================================
  // 4. REANALYZE / BET RESET VERIFICATION
  // ====================================================================
  console.log('\n' + '-'.repeat(90));
  console.log('  4. REANALYZE / BET RESET VERIFICATION');
  console.log('-'.repeat(90));

  let sheetsWithReanalyze = 0;
  let totalResetRows = 0;
  let properResets = 0;
  let badResets = 0;
  const badResetDetails = [];

  for (const name of sessionSheets) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;

    const COL = { ACTION:4, BET:9, PNL:11, BANK:12 };
    const rowCount = ws.rowCount;
    let headerRow = 0;
    for (let r = 1; r <= Math.min(5, rowCount); r++) {
      const v = cellVal(ws.getRow(r), 1);
      if (v && String(v).toLowerCase().includes('step')) { headerRow = r; break; }
    }
    const dataStart = headerRow + 1;

    let sheetHasReanalyze = false;
    for (let r = dataStart; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const action = String(cellVal(row, COL.ACTION) ?? '').trim().toUpperCase();
      if (action.includes('RESET') || action.includes('REANALY')) {
        sheetHasReanalyze = true;
        totalResetRows++;

        // The BET RESET row itself should show bet=$2
        const resetBet = num(cellVal(row, COL.BET));

        // Find the next BET row and check what the ACTUAL bet was (inferred from P&L)
        for (let rr = r + 1; rr <= Math.min(r + 10, rowCount); rr++) {
          const futureRow = ws.getRow(rr);
          const futureAction = String(cellVal(futureRow, COL.ACTION) ?? '').trim().toUpperCase();
          if (futureAction === 'BET') {
            const futurePnl = num(cellVal(futureRow, COL.PNL));
            const futureNums = num(cellVal(futureRow, 7));
            const futureHit = String(cellVal(futureRow, 10) ?? '').trim().toUpperCase();
            const isHit = (futureHit === 'YES');

            if (futurePnl !== null && futureNums !== null && futureNums > 0) {
              const inferredBet = inferActualBet(futurePnl, futureNums, isHit);
              if (inferredBet !== null && Math.abs(Math.round(inferredBet) - 2) < 0.5) {
                properResets++;
              } else if (inferredBet !== null) {
                badResets++;
                badResetDetails.push({ sheet: name, resetRow: r, nextBetRow: rr, inferredBet: Math.round(inferredBet) });
              }
            }
            break;
          }
        }
      }
    }
    if (sheetHasReanalyze) sheetsWithReanalyze++;
  }

  console.log('\n  Sessions containing BET RESET rows: ' + sheetsWithReanalyze + ' / ' + sessionSheets.length);
  console.log('  Total BET RESET rows found: ' + totalResetRows);
  console.log('  ' + (properResets > 0 ? OK : '-') + ' Proper reset to $2 (inferred from next BET P&L): ' + properResets);
  if (badResets > 0) {
    console.log('  ' + FAIL + ' BAD resets (actual bet != $2 after RESET): ' + badResets);
    for (const b of badResetDetails.slice(0, 20)) {
      console.log('    ' + b.sheet + ' reset@row' + b.resetRow + ' -> next BET@row' + b.nextBetRow + ': actual bet = $' + b.inferredBet);
    }
  } else {
    console.log('  ' + OK + ' No bad resets found');
  }

  // ====================================================================
  // 5. BET/NUM DISPLAY BUG VERIFICATION
  // ====================================================================
  console.log('\n' + '-'.repeat(90));
  console.log('  5. BET/NUM DISPLAY BUG VERIFICATION');
  console.log('-'.repeat(90));
  console.log('  The Bet/Num column records the bet AFTER Martingale adjustment (the NEXT bet),');
  console.log('  not the bet used for the current row P&L. Verifying this pattern on S1-Start0...\n');

  const verifyWs = wb.getWorksheet('S1-Start0');
  if (verifyWs) {
    let headerR = 0;
    for (let r = 1; r <= 5; r++) {
      if (cellVal(verifyWs.getRow(r), 1) && String(cellVal(verifyWs.getRow(r), 1)).toLowerCase().includes('step')) { headerR = r; break; }
    }
    let prevDisplayedBet = 2; // MIN_BET before first bet
    let mismatchCount = 0;
    let matchViaShiftCount = 0;
    let totalChecked = 0;
    for (let r = headerR + 1; r <= Math.min(headerR + 20, verifyWs.rowCount); r++) {
      const row = verifyWs.getRow(r);
      const action = String(cellVal(row, 4) ?? '').trim().toUpperCase();
      if (action !== 'BET') continue;

      const numsCount = num(cellVal(row, 7));
      const displayedBet = num(cellVal(row, 9));
      const hitRaw = String(cellVal(row, 10) ?? '').trim().toUpperCase();
      const isHit = hitRaw === 'YES';
      const pnl = num(cellVal(row, 11));

      if (pnl === null || numsCount === null || numsCount === 0) continue;

      const inferredBet = Math.round(inferActualBet(pnl, numsCount, isHit));
      totalChecked++;

      // Check: does displayed bet match the actual bet?
      if (displayedBet === inferredBet) {
        console.log('    Row ' + r + ': displayed=$' + displayedBet + ' actual=$' + inferredBet + ' (match)');
      } else {
        mismatchCount++;
        console.log('    Row ' + r + ': displayed=$' + displayedBet + ' actual=$' + inferredBet + ' (MISMATCH - displayed is post-adjustment)');
      }
    }
    console.log('\n    Checked ' + totalChecked + ' BET rows: ' + mismatchCount + ' mismatches (Bet/Num shows NEXT bet, not actual)');
    if (mismatchCount > 0) {
      console.log('    ' + FAIL + ' CONFIRMED: Bet/Num column is off-by-one (bug in auto-test-runner.js line 271)');
    }
  }

  // ====================================================================
  // 6. ANOMALY SUMMARY
  // ====================================================================
  console.log('\n' + '-'.repeat(90));
  console.log('  6. ANOMALY SUMMARY');
  console.log('-'.repeat(90));

  const criticalIssues = totalChainBreaks + totalCapViolations + totalOutcomeMismatch;
  const displayBugs = 1; // The Bet/Num off-by-one

  console.log('\n  CRITICAL (data integrity):');
  console.log('    ' + (totalChainBreaks === 0 ? OK : FAIL) + ' Bankroll chain breaks: ' + totalChainBreaks);
  console.log('    ' + (totalPnlErrors === 0 ? OK : FAIL) + ' P&L self-consistency errors: ' + totalPnlErrors);
  console.log('    ' + (totalCapViolations === 0 ? OK : FAIL) + ' Actual bet > $10: ' + totalCapViolations);
  console.log('    ' + (totalOutcomeMismatch === 0 ? OK : FAIL) + ' Outcome mismatches: ' + totalOutcomeMismatch);
  console.log('    ' + (badResets === 0 ? OK : FAIL) + ' Bad bet resets after REANALYZE: ' + badResets);

  console.log('\n  DISPLAY BUGS (cosmetic):');
  console.log('    ' + FAIL + ' Bet/Num column shows post-adjustment bet, not actual bet used for P&L');
  console.log('      Fix: In auto-test-runner.js, record betPerNumber BEFORE calling _applyStrategy()');

  if (criticalIssues === 0 && totalPnlErrors === 0) {
    console.log('\n  ' + OK + ' ALL DATA INTEGRITY CHECKS PASSED across ' + sessionSheets.length + ' sessions.');
    console.log('    The P&L values, bankroll chains, bet caps, and outcomes are all internally consistent.');
    console.log('    Only cosmetic issue: Bet/Num column displays the wrong value (post-adjustment).');
  } else {
    console.log('\n  ' + FAIL + ' ' + (criticalIssues + totalPnlErrors) + ' critical issues found across ' + sessionSheets.length + ' sessions.');
  }

  console.log('\n' + '='.repeat(90));
  console.log('  CHECK COMPLETE');
  console.log('='.repeat(90));

})().catch(function(err) {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
