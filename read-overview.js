const ExcelJS = require('exceljs');
const path = require('path');

async function main() {
  const filePath = '/Users/ubusan-nb-ecr/Desktop/auto-test-report-1772186150357.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // List all sheet names
  console.log('=== SHEET NAMES ===');
  workbook.eachSheet((sheet, id) => {
    console.log(`  Sheet ${id}: "${sheet.name}" (${sheet.rowCount} rows, ${sheet.columnCount} cols)`);
  });
  console.log('');

  // Find the Overview sheet
  const overview = workbook.getWorksheet('Overview');
  if (!overview) {
    console.log('No sheet named "Overview" found. Trying first sheet...');
    const first = workbook.worksheets[0];
    if (!first) { console.log('No sheets at all!'); return; }
    console.log(`Using first sheet: "${first.name}"`);
    dumpSheet(first);
  } else {
    dumpSheet(overview);
  }
}

function colLetter(colNum) {
  let s = '';
  while (colNum > 0) {
    colNum--;
    s = String.fromCharCode(65 + (colNum % 26)) + s;
    colNum = Math.floor(colNum / 26);
  }
  return s;
}

function dumpSheet(sheet) {
  console.log(`=== DUMPING SHEET: "${sheet.name}" ===`);
  console.log(`Rows: ${sheet.rowCount}, Columns: ${sheet.columnCount}`);
  console.log('');

  sheet.eachRow({ includeEmpty: true }, (row, rowNum) => {
    console.log(`--- Row ${rowNum} ---`);
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const letter = colLetter(colNum);
      const addr = `${letter}${rowNum}`;
      let val = cell.value;
      // Handle rich text, formulas, etc.
      if (val && typeof val === 'object') {
        if (val.result !== undefined) val = `[formula: ${val.formula}] => ${val.result}`;
        else if (val.richText) val = val.richText.map(r => r.text).join('');
        else if (val instanceof Date) val = val.toISOString();
        else val = JSON.stringify(val);
      }
      console.log(`  ${addr} (col ${colNum}/${letter}): ${val}`);
    });
  });
}

main().catch(err => { console.error(err); process.exit(1); });
