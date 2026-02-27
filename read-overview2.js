const ExcelJS = require('exceljs');
const path = '/Users/ubusan-nb-ecr/Desktop/auto-test-report-1772186561492.xlsx';

(async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  // 1. List all sheet names
  console.log('=== ALL SHEET NAMES ===');
  workbook.eachSheet((sheet, id) => {
    console.log(`  Sheet #${id}: "${sheet.name}" (rows: ${sheet.rowCount}, cols: ${sheet.columnCount})`);
  });
  console.log('');

  // 2. Print every row of the "Overview" sheet
  const overview = workbook.getWorksheet('Overview');
  if (!overview) {
    console.log('ERROR: No sheet named "Overview" found. Trying case-insensitive search...');
    let found = null;
    workbook.eachSheet((sheet) => {
      if (sheet.name.toLowerCase().includes('overview')) {
        console.log(`  Found similar: "${sheet.name}"`);
        if (!found) found = sheet;
      }
    });
    if (!found) {
      console.log('  No overview-like sheet found. Dumping first sheet instead.');
      found = workbook.worksheets[0];
    }
    if (!found) process.exit(1);
    // Use the found sheet
    dumpSheet(found);
  } else {
    dumpSheet(overview);
  }

  function dumpSheet(sheet) {
    console.log(`=== "${sheet.name}" Sheet — ${sheet.rowCount} rows, ${sheet.columnCount} columns ===`);
    console.log('');

    // Helper: column number to letter
    function colLetter(n) {
      let s = '';
      while (n > 0) {
        n--;
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26);
      }
      return s;
    }

    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      console.log(`--- Row ${rowNumber} ---`);
      const values = row.values; // 1-based array (index 0 is undefined)
      for (let c = 1; c <= sheet.columnCount; c++) {
        const val = values[c];
        const display = val === undefined || val === null ? '(empty)' : JSON.stringify(val);
        console.log(`  ${colLetter(c)} (col ${c}): ${display}`);
      }
    });
  }
})();
