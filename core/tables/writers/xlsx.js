/**
 * ████████████████████████████████████████████████████████████████████
 *  🔒 LOCKED FILE — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL 🔒
 * ████████████████████████████████████████████████████████████████████
 *
 *  XLSX mirror of the locked snapshot data. Reads the same shape the
 *  HTML writer reads. Locked together with the HTML writer for
 *  consistency. See [[locked-snapshot-html-writer]].
 *
 * ████████████████████████████████████████████████████████████████████
 *
 * core/tables/writers/xlsx.js — render a snapshot as an Excel
 * workbook. Three sheets (T1, T2, T3) matching the HTML layout.
 *
 * Uses exceljs (already a project dependency, ^4.4.0). Node-only:
 * the browser-side path uses the HTML writer.
 *
 * Cell-fill conventions match the HTML chips:
 *   anchor → solid green (#16A34A)
 *   same   → pale green  (#DCFCE7)
 *   opp    → pale amber  (#FEF3C7)
 */

'use strict';

const ExcelJS = require('exceljs');

const FILL = {
    anchor: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } },
    same:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
    opp:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
    header: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } },
    rowHdr: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }
};
const FONT = {
    anchor:    { color: { argb: 'FFFFFFFF' }, bold: true, name: 'Menlo', size: 11 },
    plain:     { name: 'Menlo', size: 11 },
    headerHi:  { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 },
    pairLabel: { bold: true, size: 11 }
};

// Per ref position (first/second/third), three cells side-by-side:
//   1. anchor (the lookup target number)         — solid green
//   2. sameSide (comma-separated bet numbers)    — pale green
//   3. oppSide  (comma-separated bet numbers)    — pale amber
// Total columns: 1 label + 3 positions × 3 cells = 10 columns per row.
const T12_COLS = [
    { header: 'Pair',         width: 24 },
    { header: '1st anchor',   width: 10 },
    { header: '1st same',     width: 28 },
    { header: '1st opp',      width: 28 },
    { header: '2nd anchor',   width: 10 },
    { header: '2nd same',     width: 28 },
    { header: '2nd opp',      width: 28 },
    { header: '3rd anchor',   width: 10 },
    { header: '3rd same',     width: 28 },
    { header: '3rd opp',      width: 28 }
];

function _writeT12Row(sheet, r, label, entry) {
    sheet.getCell(r, 1).value = label;
    sheet.getCell(r, 1).font  = FONT.pairLabel;
    sheet.getCell(r, 1).fill  = FILL.rowHdr;

    ['first', 'second', 'third'].forEach((k, i) => {
        const cell = (entry && entry[k]) || {};
        const baseCol = 2 + i * 3;
        const anchor = (cell.targets || [])[0];
        const same   = (cell.sameSide || []).slice().sort((a, b) => a - b).join(', ');
        const opp    = (cell.oppSide  || []).slice().sort((a, b) => a - b).join(', ');

        const ac = sheet.getCell(r, baseCol);
        ac.value = (anchor != null) ? anchor : '';
        ac.fill  = FILL.anchor; ac.font = FONT.anchor;
        ac.alignment = { horizontal: 'center', vertical: 'middle' };

        const sc = sheet.getCell(r, baseCol + 1);
        sc.value = same; sc.fill = FILL.same;
        sc.font  = FONT.plain;
        sc.alignment = { vertical: 'middle' };

        const oc = sheet.getCell(r, baseCol + 2);
        oc.value = opp; oc.fill = FILL.opp;
        oc.font  = FONT.plain;
        oc.alignment = { vertical: 'middle' };
    });
}

function _addT12Sheet(workbook, name, table, neighborLabel) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = T12_COLS;

    // Title row across all columns
    sheet.mergeCells(1, 1, 1, T12_COLS.length);
    const title = sheet.getCell(1, 1);
    title.value = `${name} — NEXT row projections (${neighborLabel})`;
    title.font  = FONT.headerHi;
    title.fill  = FILL.header;
    title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(1).height = 22;

    // Re-emit column header row (exceljs printed it as row 1 by default
    // — we've overridden row 1 with the title — so write headers as row 2).
    sheet.getRow(2).values = ['', ...T12_COLS.slice(1).map(c => c.header)];
    sheet.getRow(2).font = { bold: true, size: 11 };
    sheet.getRow(2).getCell(1).value = 'Pair';

    const proj = (table && table.nextProjections) || {};
    const pairKeys = Object.keys(proj).filter(k => !k.endsWith('_13opp'));
    let r = 3;
    pairKeys.forEach(pairKey => {
        const pair = proj[pairKey];
        const opp  = proj[pairKey + '_13opp'];
        if (pair) _writeT12Row(sheet, r++, `${pairKey} (pair)`,   pair);
        if (opp)  _writeT12Row(sheet, r++, `${pairKey} (13-opp)`, opp);
    });

    // Freeze the label column + first 2 rows for easy scrolling.
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
}

function _addT3Sheet(workbook, table) {
    const sheet = workbook.addWorksheet('Table 3');
    sheet.columns = [{ width: 24 }, { width: 30 }, { width: 30 }, { width: 50 }, { width: 50 }];

    sheet.mergeCells(1, 1, 1, 5);
    const title = sheet.getCell(1, 1);
    title.value = 'Table 3 — NEXT row anchors + bet pool (±1)';
    title.font  = FONT.headerHi;
    title.fill  = FILL.header;
    title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(1).height = 22;

    const head = sheet.getRow(2);
    head.values = ['Pair', 'Anchors (same)', 'Anchors (opp)', 'Bet pool — same', 'Bet pool — opp'];
    head.font = { bold: true };

    const proj = (table && table.nextProjections) || {};
    let r = 3;
    Object.entries(proj).forEach(([pairKey, p]) => {
        sheet.getCell(r, 1).value = `${pairKey}\nref ${p.refNum} · 13opp ${p.ref13Opp} · code ${p.usePosCode || '—'}`;
        sheet.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
        sheet.getCell(r, 1).fill  = FILL.rowHdr;
        sheet.getCell(r, 1).font  = FONT.pairLabel;
        sheet.getCell(r, 2).value = (p.purple   || []).join(', ');
        sheet.getCell(r, 2).fill  = FILL.anchor;
        sheet.getCell(r, 2).font  = FONT.anchor;
        sheet.getCell(r, 3).value = (p.green    || []).join(', ');
        sheet.getCell(r, 3).fill  = FILL.anchor;
        sheet.getCell(r, 3).font  = FONT.anchor;
        sheet.getCell(r, 4).value = (p.sameSide || []).join(', ');
        sheet.getCell(r, 4).fill  = FILL.same;
        sheet.getCell(r, 5).value = (p.oppSide  || []).join(', ');
        sheet.getCell(r, 5).fill  = FILL.opp;
        r++;
    });
}

function _addMetaSheet(workbook, snap) {
    const sheet = workbook.addWorksheet('Meta');
    const m = (snap && snap.meta) || {};
    sheet.columns = [{ width: 18 }, { width: 60 }];
    sheet.addRow(['spinCount', m.spinCount]);
    sheet.addRow(['spins',     (m.spins || []).join(', ')]);
    sheet.addRow(['lastSpin',  m.lastSpin]);
    sheet.addRow(['prevSpin',  m.prevSpin]);
    sheet.addRow(['timestamp', m.timestamp || '']);
    sheet.getColumn(1).font = { bold: true };
}

/**
 * Write the snapshot to an xlsx file.
 * @param {Object} snap - output of snapshot()
 * @param {string} outPath - destination .xlsx path
 * @returns {Promise<void>}
 */
async function writeXlsx(snap, outPath) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'core/tables/writers/xlsx.js';
    _addMetaSheet(workbook, snap);
    _addT12Sheet(workbook, 'Table 1', snap.table1 || {}, '±1 expansion');
    _addT12Sheet(workbook, 'Table 2', snap.table2 || {}, '±2 expansion');
    _addT3Sheet(workbook,  snap.table3 || {});
    await workbook.xlsx.writeFile(outPath);
}

module.exports = { writeXlsx };
