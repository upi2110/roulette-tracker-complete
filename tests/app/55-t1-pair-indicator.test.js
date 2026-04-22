/**
 * 55-t1-pair-indicator.test.js
 * Structural verification of Table 1's end-of-row pair-end-cell (mirrors
 * between-pair .pair-indicator pattern).
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');
const fs = require('fs');
const pathMod = require('path');

const SET_0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
const SET_5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
const SET_6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

let R;

beforeAll(() => {
    const lookupSrc = fs.readFileSync(
        pathMod.join(__dirname, '..', '..', 'app', 'table-lookup.js'),
        'utf-8'
    );
    const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;');
    fn();
});

beforeEach(() => {
    setupDOM();
    globalThis.SET_0_NUMS = SET_0;
    globalThis.SET_5_NUMS = SET_5;
    globalThis.SET_6_NUMS = SET_6;
    R = loadRendererFunctions();
});

afterEach(() => {
    delete globalThis.SET_0_NUMS;
    delete globalThis.SET_5_NUMS;
    delete globalThis.SET_6_NUMS;
});

function seed(actuals) {
    R.spins.length = 0;
    actuals.forEach((n, i) => R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' }));
}

function renderHtml() {
    R.renderTable1();
    return document.getElementById('table1Body').innerHTML;
}

describe('T1 pair-indicator — end-of-row', () => {
    test('every row ends with pair-end-cell + anchor-cell class', () => {
        seed([5, 10, 15, 20, 25, 30, 35]);
        const html = renderHtml();
        const rows = html.split(/<\/tr>/).filter(r => r.includes('<tr'));
        for (const r of rows) {
            const lastTd = [...r.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].pop()[0];
            expect(lastTd).toMatch(/class="pair-end-cell anchor-cell"/);
            expect(lastTd).toMatch(/<strong style="visibility:hidden">/);
        }
    });

    test('data rows carry data-left-hit and data-right-hit', () => {
        seed([5, 10, 15, 20]);
        const html = renderHtml();
        const rows = html.split(/<\/tr>/).filter(r => r.includes('<tr'));
        const dataRows = rows.filter((r, i) => i > 0 && !/next-row/.test(r));
        for (const r of dataRows) {
            const lastTd = [...r.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].pop()[0];
            expect(lastTd).toMatch(/data-left-hit="[01]"/);
            expect(lastTd).toMatch(/data-right-hit="[01]"/);
        }
    });

    test('all rows have equal cell count (columns aligned)', () => {
        seed([5, 10, 15, 20, 25, 30]);
        const html = renderHtml();
        const rows = html.split(/<\/tr>/).filter(r => r.includes('<tr'));
        const counts = rows.map(r => (r.match(/<td\b/g) || []).length);
        expect(new Set(counts).size).toBe(1);
    });
});
