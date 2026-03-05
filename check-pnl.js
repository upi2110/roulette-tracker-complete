const ExcelJS = require('exceljs');

const XLSX_PATH = '/Users/ubusan-nb-ecr/Desktop/auto-test-report-1772186561492.xlsx';
const STARTING_BANKROLL = 4000;
const WIN_THRESHOLD = 100;

function parseDollar(val) {
  if (val == null || val === '--') return null;
  const s = String(val).replace(/[$,]/g, '');
  return parseFloat(s);
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  // ===== PART 1: Overview Sheet rows 5-8 =====
  console.log('='.repeat(80));
  console.log('PART 1: Overview Sheet — Row 5 Headers & Rows 6-8 Data');
  console.log('='.repeat(80));
  const ov = wb.getWorksheet('Overview');

  const headerRow = ov.getRow(5);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cell.value;
  });
  console.log('\nRow 5 Headers:');
  for (let c = 1; c <= 11; c++) {
    console.log(`  Col ${c}: ${headers[c]}`);
  }

  const strategies = [];
  for (let r = 6; r <= 8; r++) {
    const row = ov.getRow(r);
    const data = {};
    for (let c = 1; c <= 11; c++) {
      data[headers[c]] = row.getCell(c).value;
    }
    strategies.push(data);
    console.log(`\nRow ${r} — ${data['Strategy']}:`);
    for (let c = 1; c <= 11; c++) {
      console.log(`  ${headers[c]}: ${JSON.stringify(row.getCell(c).value)}`);
    }
  }

  // ===== PART 2: Verify Avg Profit values by reading ALL session sheets =====
  console.log('\n' + '='.repeat(80));
  console.log('PART 2: Manual Avg Profit Verification from Session Sheets');
  console.log('='.repeat(80));

  const allSheetNames = wb.worksheets.map(s => s.name);
  const prefixes = [
    { prefix: 'S1-Start', strategyName: 'Strategy 1 - Aggressive', overviewRow: 0 },
    { prefix: 'S2-Start', strategyName: 'Strategy 2 - Conservative', overviewRow: 1 },
    { prefix: 'S3-Start', strategyName: 'Strategy 3 - Cautious', overviewRow: 2 },
  ];

  for (const { prefix, strategyName, overviewRow } of prefixes) {
    const sessionSheets = allSheetNames.filter(n => n.startsWith(prefix));
    sessionSheets.sort((a, b) => {
      const numA = parseInt(a.replace(prefix, ''), 10);
      const numB = parseInt(b.replace(prefix, ''), 10);
      return numA - numB;
    });

    let totalProfit = 0;
    let wins = 0;
    let busts = 0;
    let incomplete = 0;
    let winProfit = 0;
    const sessionResults = [];

    for (const sheetName of sessionSheets) {
      const sh = wb.getWorksheet(sheetName);
      const lastRow = sh.getRow(sh.rowCount);
      const bankrollStr = lastRow.getCell(12).value;
      const bankroll = parseDollar(bankrollStr);
      const profit = bankroll - STARTING_BANKROLL;
      
      totalProfit += profit;

      if (bankroll <= 0) {
        busts++;
        sessionResults.push({ sheetName, profit, status: 'BUST' });
      } else if (profit >= WIN_THRESHOLD) {
        wins++;
        winProfit += profit;
        sessionResults.push({ sheetName, profit, status: 'WIN' });
      } else {
        incomplete++;
        sessionResults.push({ sheetName, profit, status: 'INCOMPLETE' });
      }
    }

    const avgProfitAll = totalProfit / sessionSheets.length;
    const avgProfitWin = wins > 0 ? winProfit / wins : 0;

    const ovData = strategies[overviewRow];
    const reportedTotalProfit = parseDollar(ovData['Total Profit']);
    const reportedAvgProfitWin = parseDollar(ovData['Avg Profit (Win)']);
    const reportedAvgProfitAll = parseDollar(ovData['Avg Profit (All)']);
    const reportedWins = ovData['Wins'];
    const reportedBusts = ovData['Busts'];
    const reportedIncomplete = ovData['Incomplete'];
    const reportedSessions = ovData['Sessions'];

    console.log(`\n--- ${strategyName} ---`);
    console.log(`  Sessions found: ${sessionSheets.length}`);
    console.log(`  Wins: ${wins} | Busts: ${busts} | Incomplete: ${incomplete}`);
    console.log(`  Total Profit:    Computed=$${totalProfit.toFixed(2)}   Reported=${ovData['Total Profit']}   Match=${Math.abs(totalProfit - reportedTotalProfit) < 1 ? 'YES' : 'NO (MISMATCH)'}`);
    console.log(`  Avg Profit(Win): Computed=$${avgProfitWin.toFixed(2)}   Reported=${ovData['Avg Profit (Win)']}   Match=${Math.abs(avgProfitWin - reportedAvgProfitWin) < 0.5 ? 'YES' : 'NO (MISMATCH)'}`);
    console.log(`  Avg Profit(All): Computed=$${avgProfitAll.toFixed(2)}   Reported=${ovData['Avg Profit (All)']}   Match=${Math.abs(avgProfitAll - reportedAvgProfitAll) < 0.5 ? 'YES' : 'NO (MISMATCH)'}`);
    console.log(`  Wins count:      Computed=${wins}   Reported=${reportedWins}   Match=${wins === reportedWins ? 'YES' : 'NO (MISMATCH)'}`);
    console.log(`  Busts count:     Computed=${busts}   Reported=${reportedBusts}   Match=${busts === reportedBusts ? 'YES' : 'NO (MISMATCH)'}`);
    console.log(`  Incomplete:      Computed=${incomplete}   Reported=${reportedIncomplete}   Match=${incomplete === reportedIncomplete ? 'YES' : 'NO (MISMATCH)'}`);
    console.log(`  Sessions:        Computed=${sessionSheets.length}   Reported=${reportedSessions}   Match=${sessionSheets.length === reportedSessions ? 'YES' : 'NO (MISMATCH)'}`);

    // Show a few INCOMPLETE sessions for context
    const incompleteSessions = sessionResults.filter(s => s.status === 'INCOMPLETE');
    if (incompleteSessions.length > 0) {
      console.log(`\n  First 5 INCOMPLETE sessions:`);
      for (const s of incompleteSessions.slice(0, 5)) {
        console.log(`    ${s.sheetName}: profit=$${s.profit.toFixed(2)}`);
      }
    }
  }

  // ===== PART 3: Bet/Num correctness check on 5 specific sheets =====
  console.log('\n' + '='.repeat(80));
  console.log('PART 3: Bet/Num P&L Math Verification on 5 Session Sheets');
  console.log('='.repeat(80));

  const checkSheets = ['S1-Start0', 'S1-Start1', 'S2-Start0', 'S3-Start0', 'S1-Start88'];

  for (const sheetName of checkSheets) {
    const sh = wb.getWorksheet(sheetName);
    if (!sh) {
      console.log(`\n--- ${sheetName}: SHEET NOT FOUND ---`);
      continue;
    }

    console.log(`\n--- ${sheetName} (${sh.rowCount} rows) ---`);
    console.log(`  ${'Step'.padEnd(5)} ${'Action'.padEnd(7)} ${'Nums'.padEnd(5)} ${'Bet/Num'.padEnd(9)} ${'Hit'.padEnd(4)} ${'P&L'.padEnd(10)} ${'Expected'.padEnd(10)} ${'Match?'}`);
    console.log(`  ${'-'.repeat(60)}`);

    let flagCount = 0;
    // Data starts at row 4, header at row 3
    for (let r = 4; r <= sh.rowCount; r++) {
      const row = sh.getRow(r);
      const action = row.getCell(4).value;
      if (action !== 'BET') continue;

      const step = row.getCell(1).value;
      const nums = row.getCell(7).value;
      const betNumStr = row.getCell(9).value;
      const hitStr = row.getCell(10).value;
      const pnlStr = row.getCell(11).value;

      const betPerNum = parseDollar(betNumStr);
      const pnl = parseDollar(pnlStr);
      const hit = hitStr === 'YES';
      const numsCount = typeof nums === 'number' ? nums : parseInt(String(nums), 10);

      let expectedPnl;
      if (hit) {
        // Win: bet * (36 - nums)
        expectedPnl = betPerNum * (36 - numsCount);
      } else {
        // Loss: -(bet * nums)
        expectedPnl = -(betPerNum * numsCount);
      }

      const match = Math.abs(pnl - expectedPnl) < 0.01;
      if (!match) flagCount++;

      const flag = match ? 'OK' : 'MISMATCH !!!';
      console.log(`  ${String(step).padEnd(5)} ${'BET'.padEnd(7)} ${String(numsCount).padEnd(5)} ${String(betNumStr).padEnd(9)} ${hitStr.padEnd(4)} ${String(pnlStr).padEnd(10)} ${('$' + expectedPnl.toFixed(0)).padEnd(10)} ${flag}`);
    }

    if (flagCount === 0) {
      console.log(`  >> ALL BET ROWS PASS - no mismatches`);
    } else {
      console.log(`  >> ${flagCount} ROW(S) FLAGGED WITH MISMATCHES`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(80));
})();
