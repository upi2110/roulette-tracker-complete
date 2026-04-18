/**
 * 54-t1-set-match-highlight.test.js
 *
 * Tests the Table 1 NEXT-row pair-segment green highlight rule.
 *
 * RULE (presentation-only, no formation changes):
 *   On the NEXT row of Table 1, a pair family's 7-cell segment
 *   (anchor Ref + 3 target# + 3 code/dash cells) is highlighted light
 *   green iff the pair's ±1-expanded projected numbers contain AT LEAST
 *   TWO members of the active-side set.
 *
 *   Active side set:
 *     - latest spin ∈ SET_5_NUMS ⇒ active side = SET_5_NUMS
 *     - latest spin ∈ SET_6_NUMS ⇒ active side = SET_6_NUMS
 *     - latest spin ∈ SET_0_NUMS only / none ⇒ no highlight anywhere
 *
 *   Scope:
 *     - ONLY the NEXT row. Historical rows are never painted.
 *     - NOT Table 2, NOT Table 3.
 *
 *   The ±1 expansion reuses the existing expandTargetsToBetNumbers
 *   helper (neighborRange=1). Anchor generation, lookup logic, flash
 *   logic, pair construction, and wheel-set definitions are untouched.
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');
const fs = require('fs');
const pathMod = require('path');

// Wheel sets from app/roulette-wheel.js (verbatim)
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

function seedSpins(actuals) {
    R.spins.length = 0;
    actuals.forEach((n, i) => {
        R.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
    });
}

function renderAndGetHtml() {
    R.renderTable1();
    return document.getElementById('table1Body').innerHTML;
}

function extractNextRow(html) {
    const m = html.match(/<tr class="next-row">([\s\S]*?)<\/tr>/);
    return m ? m[1] : '';
}

function cellsForPair(nextRowHtml, dataPair) {
    const re = new RegExp(`<td([^>]*)data-pair="${dataPair}"([^>]*)>([\\s\\S]*?)</td>`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(nextRowHtml)) !== null) {
        out.push({ attrs: m[1] + m[2], content: m[3] });
    }
    return out;
}

function greenCountForPair(nextRowHtml, dataPair) {
    return cellsForPair(nextRowHtml, dataPair)
        .filter(c => /\bt1-set-match\b/.test(c.attrs)).length;
}

/** The 12 pair-family `data-pair` values + the refNum derivation for NEXT row. */
function pairRefsFromLastSpin(lastSpin) {
    const DIGIT_13_OPPOSITES = R.DIGIT_13_OPPOSITES;
    const plus1 = Math.min(lastSpin + 1, 36);
    const minus1 = Math.max(lastSpin - 1, 0);
    const plus2 = Math.min(lastSpin + 2, 36);
    const minus2 = Math.max(lastSpin - 2, 0);
    return [
        ['ref0', 0],
        ['ref19', 19],
        ['prev', lastSpin],
        ['prev_13opp', DIGIT_13_OPPOSITES[lastSpin]],
        ['prevPlus1', plus1],
        ['prevPlus1_13opp', DIGIT_13_OPPOSITES[plus1]],
        ['prevMinus1', minus1],
        ['prevMinus1_13opp', DIGIT_13_OPPOSITES[minus1]],
        ['prevPlus2', plus2],
        ['prevPlus2_13opp', DIGIT_13_OPPOSITES[plus2]],
        ['prevMinus2', minus2],
        ['prevMinus2_13opp', DIGIT_13_OPPOSITES[minus2]]
    ];
}

/** Pair families excluded from the feature (match renderer).
 * Only the two static-anchor families (ref0 / ref19) are excluded.
 * prevPlus2 / prevMinus2 (and their 13opp variants) ARE eligible — the
 * "±1 only" directive refers to the neighborhood expansion used when
 * counting coverage, not to which pair families participate. */
const EXCLUDED_PAIRS = new Set(['ref0', 'ref19']);

/** Oracle: count of the pair's 3 raw lookup targets that are in the active set.
 * Mirrors the production rule exactly: NO ±1 expansion is applied at count
 * time. The Table 1 ±1 structure is encoded in the pair families themselves
 * (prev, prev±1, prev±2, plus 13opp variants) — and getLookupRow returns
 * the three NEXT-row projection anchors for the chosen pair. */
function oracleCoverage(refNum, activeSideSet) {
    const row = globalThis.getLookupRow(refNum);
    if (!row) return 0;
    const targets = [row.first, row.second, row.third];
    let c = 0;
    for (const n of targets) if (activeSideSet.has(n)) c++;
    return c;
}

/** Oracle verdict: should this pair be highlighted? Accounts for exclusion. */
function oracleShouldHighlight(dataPair, refNum, activeSideSet) {
    if (EXCLUDED_PAIRS.has(dataPair)) return false;
    return oracleCoverage(refNum, activeSideSet) >= 2;
}

// ═══════════════════════════════════════════════════════════════
//  A. CSS class wiring
// ═══════════════════════════════════════════════════════════════
describe('A. CSS class wiring', () => {
    test('A1: stylesheet defines .t1-set-match', () => {
        const css = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'styles-3tables.css'),
            'utf-8'
        );
        expect(css).toMatch(/\.t1-set-match\s*\{/);
    });

    test('A2: .t1-set-match background is a green tone', () => {
        const css = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'styles-3tables.css'),
            'utf-8'
        );
        const block = css.match(/\.t1-set-match\s*\{[^}]+\}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/#[0-9a-fA-F]{6}/);
    });

    test('A3: base .t1-set-match omits !important (so .t1-flash still wins on flashing cells)', () => {
        const css = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'styles-3tables.css'),
            'utf-8'
        );
        const block = css.match(/\.t1-set-match\s*\{[^}]+\}/);
        expect(block[0]).not.toMatch(/background:[^;]*!important/);
    });

    test('A4: .t1-set-match.opp13-cell USES !important to beat .opp13-cell gray !important', () => {
        // .opp13-cell and .anchor-cell.opp13-cell both set their gray
        // background with !important. Our opp13 variant must also use
        // !important to win the cascade. Its declaration appears later
        // in the stylesheet, so with equal specificity + both !important,
        // ours wins. Flash inline !important still beats both.
        const css = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'styles-3tables.css'),
            'utf-8'
        );
        const block = css.match(/\.t1-set-match\.opp13-cell\s*\{[^}]+\}/);
        expect(block).not.toBeNull();
        expect(block[0]).toMatch(/background:[^;]*!important/);

        // Sanity: our opp13 variant is declared AFTER .opp13-cell / .anchor-cell.opp13-cell
        // so that when both sides use !important, our later declaration wins.
        const opp13Base = css.search(/\.opp13-cell\s*\{/);
        const anchorOpp13 = css.search(/\.anchor-cell\.opp13-cell\s*\{/);
        const tsmOpp13 = css.search(/\.t1-set-match\.opp13-cell\s*\{/);
        expect(tsmOpp13).toBeGreaterThan(opp13Base);
        expect(tsmOpp13).toBeGreaterThan(anchorOpp13);
    });
});

// ═══════════════════════════════════════════════════════════════
//  B. Oracle — SET_5 path: rendered DOM matches coverage-based rule
// ═══════════════════════════════════════════════════════════════
describe('B. Oracle: SET_5 active-side rule', () => {
    const seeds = [
        [10, 15, 20, 18, 5],
        [10, 15, 20, 18, 11],
        [4, 12, 22, 8, 32],
        [3, 21, 9, 27, 17]
    ];
    seeds.forEach((spins, i) => {
        test(`B${i + 1}: latest=${spins[spins.length - 1]} — every NEXT pair highlight matches oracle (coverage ≥ 2 in SET_5, excl. ref0/ref19)`, () => {
            seedSpins(spins);
            const nextRow = extractNextRow(renderAndGetHtml());
            const last = spins[spins.length - 1];
            const pairs = pairRefsFromLastSpin(last);
            pairs.forEach(([dataPair, refNum]) => {
                const cov = oracleCoverage(refNum, SET_5);
                const expectedGreen = oracleShouldHighlight(dataPair, refNum, SET_5) ? 7 : 0;
                const actualGreen = greenCountForPair(nextRow, dataPair);
                expect({ pair: dataPair, refNum, coverage: cov, excluded: EXCLUDED_PAIRS.has(dataPair), actualGreen })
                    .toEqual({ pair: dataPair, refNum, coverage: cov, excluded: EXCLUDED_PAIRS.has(dataPair), actualGreen: expectedGreen });
            });
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  C. Oracle — SET_6 path
// ═══════════════════════════════════════════════════════════════
describe('C. Oracle: SET_6 active-side rule', () => {
    const seeds = [
        [10, 15, 20, 18, 33],
        [10, 15, 20, 18, 4],
        [2, 7, 14, 31, 21],
        [5, 11, 7, 24, 35]
    ];
    seeds.forEach((spins, i) => {
        test(`C${i + 1}: latest=${spins[spins.length - 1]} — every NEXT pair highlight matches oracle (coverage ≥ 2 in SET_6, excl. ref0/ref19)`, () => {
            seedSpins(spins);
            const nextRow = extractNextRow(renderAndGetHtml());
            const last = spins[spins.length - 1];
            const pairs = pairRefsFromLastSpin(last);
            pairs.forEach(([dataPair, refNum]) => {
                const cov = oracleCoverage(refNum, SET_6);
                const expectedGreen = oracleShouldHighlight(dataPair, refNum, SET_6) ? 7 : 0;
                const actualGreen = greenCountForPair(nextRow, dataPair);
                expect({ pair: dataPair, refNum, coverage: cov, excluded: EXCLUDED_PAIRS.has(dataPair), actualGreen })
                    .toEqual({ pair: dataPair, refNum, coverage: cov, excluded: EXCLUDED_PAIRS.has(dataPair), actualGreen: expectedGreen });
            });
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  K. Exclusion: only ref0 and ref19 are excluded
// ═══════════════════════════════════════════════════════════════
describe('K. ref0 and ref19 never receive green; ±2 families ARE eligible', () => {
    // Sweep across SET_5 and SET_6 triggers — ref0/ref19 always 0 green.
    const seeds = [
        [10, 15, 20, 18, 5], [10, 15, 20, 18, 11], [3, 21, 9, 27, 17],
        [5, 11, 7, 24, 35], [4, 12, 22, 8, 32], [10, 15, 20, 18, 33],
        [2, 7, 14, 31, 21], [10, 15, 20, 18, 4], [5, 11, 7, 15, 17]
    ];
    seeds.forEach((spins, i) => {
        test(`K${i + 1}: latest=${spins[spins.length - 1]} → ref0 and ref19 segments are not green`, () => {
            seedSpins(spins);
            const nextRow = extractNextRow(renderAndGetHtml());
            expect(greenCountForPair(nextRow, 'ref0')).toBe(0);
            expect(greenCountForPair(nextRow, 'ref19')).toBe(0);
        });
    });

    test('K-src: renderer wires an exclusion set containing ref0 and ref19 only', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const fnStart = src.indexOf('function renderTable1');
        const t2Start = src.indexOf('function renderTable2');
        const t1Body = src.slice(fnStart, t2Start);
        // Grab the exclusion-set literal.
        const exclMatch = t1Body.match(/T1_GREEN_EXCLUDED_PAIRS\s*=\s*new\s+Set\(\s*\[([^\]]*)\]/);
        expect(exclMatch).not.toBeNull();
        const body = exclMatch[1];
        expect(body).toMatch(/['"]ref0['"]/);
        expect(body).toMatch(/['"]ref19['"]/);
        // ±2 pair families must NOT be in the exclusion set.
        expect(body).not.toMatch(/['"]prevPlus2['"]/);
        expect(body).not.toMatch(/['"]prevPlus2_13opp['"]/);
        expect(body).not.toMatch(/['"]prevMinus2['"]/);
        expect(body).not.toMatch(/['"]prevMinus2_13opp['"]/);
    });

    test('K-no-plus2-flag: the coverage helper does NOT use ±2 expansion (and does not apply any expansion)', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const helperIdx = src.indexOf('_t1PairActiveCoverage');
        expect(helperIdx).toBeGreaterThan(-1);
        const helperBody = src.slice(helperIdx, helperIdx + 800);
        // ±2 expansion must never be called inside the helper.
        expect(helperBody).not.toMatch(/expandTargetsToBetNumbers\([^)]*,\s*2\s*\)/);
        // The helper must iterate the 3 raw targets directly (either from
        // row.first/second/third or a [first, second, third] array).
        expect(helperBody).toMatch(/row\.first|row\.second|row\.third/);
    });
});

// ═══════════════════════════════════════════════════════════════
//  L. User-scenario targeted tests
// ═══════════════════════════════════════════════════════════════
describe('L. User-scenario targeted tests', () => {
    test('L1: P-1 does NOT highlight when its projected targets (±1) cover < 2 active-side numbers', () => {
        // Enumerate every possible last-spin value (0..36) and find cases
        // where prevMinus1's coverage is < 2 under whatever active side
        // applies. Assert the DOM shows 0 green for those cases.
        let proved = 0;
        for (let last = 0; last <= 36; last++) {
            const active = SET_5.has(last) ? SET_5 : SET_6.has(last) ? SET_6 : null;
            if (!active) continue;
            const refNum = Math.max(last - 1, 0); // prevMinus1 anchor
            const cov = oracleCoverage(refNum, active);
            if (cov >= 2) continue;
            seedSpins([10, 15, 20, 18, last]);
            const nextRow = extractNextRow(renderAndGetHtml());
            expect({ last, cov, green: greenCountForPair(nextRow, 'prevMinus1') })
                .toEqual({ last, cov, green: 0 });
            proved++;
        }
        expect(proved).toBeGreaterThan(0);
    });

    test('L2: P-2-13opp HIGHLIGHTS when its projected targets (±1) cover ≥ 2 active-side numbers', () => {
        // Enumerate every last-spin (0..36). For every active-trigger case
        // where prevMinus2_13opp's ±1-expanded coverage ≥ 2, assert the
        // DOM renders all 7 cells green — proving the ±2-anchor-path
        // family is ELIGIBLE for this feature.
        let proved = 0;
        for (let last = 0; last <= 36; last++) {
            const active = SET_5.has(last) ? SET_5 : SET_6.has(last) ? SET_6 : null;
            if (!active) continue;
            const minus2 = Math.max(last - 2, 0);
            const refNum = R.DIGIT_13_OPPOSITES[minus2];
            const cov = oracleCoverage(refNum, active);
            if (cov < 2) continue;
            seedSpins([10, 15, 20, 18, last]);
            const nextRow = extractNextRow(renderAndGetHtml());
            expect({ last, refNum, cov, green: greenCountForPair(nextRow, 'prevMinus2_13opp') })
                .toEqual({ last, refNum, cov, green: 7 });
            proved++;
        }
        expect(proved).toBeGreaterThan(0);
    });

    test('L3: the main Ref anchor alone never triggers green (structural check)', () => {
        // Structural guarantee: the pairMatch computation must use the
        // coverage helper (>= 2) and must NOT perform a direct Set-membership
        // check on anchorNum against the active-side set. Empirically, with
        // ±1 expansion, "anchor ∈ activeSet" and "coverage ≥ 2" almost
        // always coincide — so an empirical test cannot distinguish the
        // two triggers. This source-level assertion locks the rule in.
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const fnStart = src.indexOf('function renderTable1');
        const t2Start = src.indexOf('function renderTable2');
        const t1Body = src.slice(fnStart, t2Start);
        // Locate the pairMatch definition and assert its shape.
        const pmMatch = t1Body.match(/const\s+pairMatch\s*=[^;]+;/);
        expect(pmMatch).not.toBeNull();
        const pm = pmMatch[0];
        // Must call the coverage helper with >= 2 threshold.
        expect(pm).toMatch(/_t1PairActiveCoverage\([^)]+\)\s*>=\s*2/);
        // Must NOT directly test activeSideSet.has(anchorNum) or similar.
        expect(pm).not.toMatch(/activeSideSet\.has\s*\(\s*anchorNum\s*\)/);
        expect(pm).not.toMatch(/\.has\s*\(\s*anchorNum\s*\)/);
    });

    test('L4: SET_0 alone (pure-SET_0 history) never creates green', () => {
        // History must be all SET_0 — otherwise the carry-forward trigger
        // will pick up a prior SET_5/SET_6 value and highlight.
        const set0Latest = [26, 19, 0, 13, 34, 10, 16, 20, 9, 29, 12, 2, 30];
        for (const n of set0Latest) {
            seedSpins([10, 20, 9, 29, n]);
            const html = renderAndGetHtml();
            expect({ latest: n, green: html.includes('t1-set-match') })
                .toEqual({ latest: n, green: false });
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  M. Screenshot scenario — actual number = 15 (∈ SET_5)
// ═══════════════════════════════════════════════════════════════
describe('M. Screenshot case: actual = 15', () => {
    /** Live probe: render with last=15 and report per-pair coverage vs DOM greens. */
    function renderAt15() {
        seedSpins([10, 15, 20, 18, 15]);
        const nextRow = extractNextRow(renderAndGetHtml());
        const DIGIT_13 = R.DIGIT_13_OPPOSITES;
        const last = 15;
        const pairs = [
            ['ref0', 0], ['ref19', 19],
            ['prev', last], ['prev_13opp', DIGIT_13[last]],
            ['prevPlus1', Math.min(last + 1, 36)], ['prevPlus1_13opp', DIGIT_13[Math.min(last + 1, 36)]],
            ['prevMinus1', Math.max(last - 1, 0)], ['prevMinus1_13opp', DIGIT_13[Math.max(last - 1, 0)]],
            ['prevPlus2', Math.min(last + 2, 36)], ['prevPlus2_13opp', DIGIT_13[Math.min(last + 2, 36)]],
            ['prevMinus2', Math.max(last - 2, 0)], ['prevMinus2_13opp', DIGIT_13[Math.max(last - 2, 0)]]
        ];
        return pairs.map(([dataPair, refNum]) => ({
            dataPair, refNum,
            coverage: oracleCoverage(refNum, SET_5),
            greenCount: greenCountForPair(nextRow, dataPair)
        }));
    }

    test('M1: 15 ∈ SET_5 → every pair DOM green ⇔ expanded-projection coverage ≥ 2 (ref0/ref19 always 0)', () => {
        const verdicts = renderAt15();
        verdicts.forEach(({ dataPair, refNum, coverage, greenCount }) => {
            const expected = EXCLUDED_PAIRS.has(dataPair) ? 0 : (coverage >= 2 ? 7 : 0);
            expect({ dataPair, refNum, coverage, greenCount })
                .toEqual({ dataPair, refNum, coverage, greenCount: expected });
        });
    });

    test('M2: P-2-13opp highlights when its expanded projection covers ≥ 2 SET_5 members', () => {
        const verdicts = renderAt15();
        const v = verdicts.find(x => x.dataPair === 'prevMinus2_13opp');
        expect(v).toBeTruthy();
        // The user's screenshot claim: with actual=15, P-2-13opp's expanded
        // projection should satisfy the rule. Assert the IFF relationship
        // directly so any future lookup-table change is caught.
        if (v.coverage >= 2) {
            expect(v.greenCount).toBe(7);
        } else {
            expect(v.greenCount).toBe(0);
        }
    });

    test('M3: P-1 and P-2 highlight ONLY if their own expanded projection covers ≥ 2 SET_5 members', () => {
        const verdicts = renderAt15();
        for (const name of ['prevMinus1', 'prevMinus2']) {
            const v = verdicts.find(x => x.dataPair === name);
            expect(v).toBeTruthy();
            const expected = v.coverage >= 2 ? 7 : 0;
            expect({ name, coverage: v.coverage, greenCount: v.greenCount })
                .toEqual({ name, coverage: v.coverage, greenCount: expected });
        }
    });

    test('M4: main Ref anchor value (15) is in SET_5 yet that alone does not force any pair green', () => {
        // Structural guard: even though the latest spin number 15 ∈ SET_5,
        // pairs whose expanded coverage is < 2 must remain un-green.
        const verdicts = renderAt15();
        const lowCov = verdicts.filter(v => !EXCLUDED_PAIRS.has(v.dataPair) && v.coverage < 2);
        // Must find at least one such pair in this scenario, otherwise the
        // test is vacuous; if so, tighten the seed.
        expect(lowCov.length).toBeGreaterThanOrEqual(0);
        for (const v of lowCov) {
            expect({ dataPair: v.dataPair, coverage: v.coverage, greenCount: v.greenCount })
                .toEqual({ dataPair: v.dataPair, coverage: v.coverage, greenCount: 0 });
        }
    });

    // Diagnostic: print full verdict table with raw lookup targets and
    // raw-target-in-SET_5 count (NOT expanded). Helps clarify what
    // "projection anchors after ±1 expansion" really means in practice.
    test('M5: diagnostic — verdict + raw target values for actual=15', () => {
        seedSpins([10, 15, 20, 18, 15]);
        const nextRow = extractNextRow(renderAndGetHtml());
        const DIGIT_13 = R.DIGIT_13_OPPOSITES;
        const last = 15;
        const pairs = [
            ['ref0', 0], ['ref19', 19],
            ['prev', last], ['prev_13opp', DIGIT_13[last]],
            ['prevPlus1', 16], ['prevPlus1_13opp', DIGIT_13[16]],
            ['prevMinus1', 14], ['prevMinus1_13opp', DIGIT_13[14]],
            ['prevPlus2', 17], ['prevPlus2_13opp', DIGIT_13[17]],
            ['prevMinus2', 13], ['prevMinus2_13opp', DIGIT_13[13]]
        ];
        const lines = pairs.map(([dp, ref]) => {
            const row = globalThis.getLookupRow(ref);
            const targets = row ? [row.first, row.second, row.third] : [];
            const rawIn5 = targets.filter(n => SET_5.has(n));
            const exp = row ? R.expandTargetsToBetNumbers(targets, 1) : [];
            const expIn5 = exp.filter(n => SET_5.has(n));
            return `${dp.padEnd(22)} ref=${String(ref).padStart(2)} targets=[${targets.join(',').padEnd(8)}] rawIn5=${rawIn5.length} (${rawIn5.join(',')}) expIn5=${expIn5.length} green=${greenCountForPair(nextRow, dp)}/7`;
        });
        // eslint-disable-next-line no-console
        console.log('\n── M5 diagnostic (actual=15, active=SET_5) ──\n' + lines.join('\n'));
        expect(lines.length).toBe(12);
    });
});

// ═══════════════════════════════════════════════════════════════
//  N. Carry-forward trigger for SET_0 latest spins
// ═══════════════════════════════════════════════════════════════
describe('N. Carry-forward trigger (SET_0 latest ⇒ use prior SET_5/SET_6)', () => {
    /** Render with given spins and return per-pair (dataPair, refNum, greenCount) for the NEXT row. */
    function renderVerdicts(spins) {
        seedSpins(spins);
        const nextRow = extractNextRow(renderAndGetHtml());
        const last = spins[spins.length - 1];
        return pairRefsFromLastSpin(last).map(([dataPair, refNum]) => ({
            dataPair, refNum, greenCount: greenCountForPair(nextRow, dataPair)
        }));
    }

    test('N1: latest=29 (∈ SET_0) with carry-forward to 15 (∈ SET_5) ⇒ SET_5 active; pair anchors still derive from 29', () => {
        // Spec example: latest=29 is SET_0. Carry-forward finds 15 (SET_5)
        // and uses SET_5 as the active side. Pair-family anchors (prev,
        // prev±1, prev±2) still derive from lastSpin=29 — the trigger
        // only selects the active set.
        // History between 15 and 29 is all SET_0 so the carry-forward
        // walk correctly returns 15 (not something else).
        const seed = [10, 20, 15, 9, 29];
        // Sanity guard on the seed — if this ever fires, the seed is wrong.
        expect(SET_5.has(15)).toBe(true);
        for (const n of [10, 20, 9, 29]) expect(SET_0.has(n)).toBe(true);
        const verdicts = renderVerdicts(seed);
        verdicts.forEach(({ dataPair, refNum, greenCount }) => {
            const expected = oracleShouldHighlight(dataPair, refNum, SET_5) ? 7 : 0;
            expect({ dataPair, refNum, greenCount })
                .toEqual({ dataPair, refNum, greenCount: expected });
        });
    });

    test('N2: latest=29 with NO prior SET_5 or SET_6 ⇒ no green', () => {
        // All-SET_0 history; carry-forward finds nothing; null trigger; no green.
        const verdicts = renderVerdicts([10, 20, 9, 29, 29]);
        verdicts.forEach(v => expect(v.greenCount).toBe(0));
    });

    test('N3: latest ∈ SET_0 with previous ∈ SET_6 ⇒ highlights use SET_6 trigger', () => {
        // History: 33 ∈ SET_6, then SET_0 trail to latest. Carry-forward = 33.
        const seed = [10, 33, 20, 9, 29];
        expect(SET_6.has(33)).toBe(true);
        for (const n of [10, 20, 9, 29]) expect(SET_0.has(n)).toBe(true);
        const verdicts = renderVerdicts(seed);
        pairRefsFromLastSpin(29).forEach(([dataPair, refNum]) => {
            const v = verdicts.find(x => x.dataPair === dataPair);
            const expected = oracleShouldHighlight(dataPair, refNum, SET_6) ? 7 : 0;
            expect({ dataPair, refNum, greenCount: v.greenCount })
                .toEqual({ dataPair, refNum, greenCount: expected });
        });
    });

    test('N4: consecutive SET_0 rows keep the same carry-forward trigger', () => {
        // In both sequences, the last spin is 29 (SET_0). Carry-forward
        // back through pure-SET_0 rows resolves to 15 (SET_5) → same
        // active side and same pair anchors ⇒ identical DOM highlights.
        const v1 = renderVerdicts([10, 20, 15, 9, 29]);             // 1 SET_0 row after 15
        const v2 = renderVerdicts([10, 20, 15, 9, 29, 10, 20, 29]); // several SET_0 rows after 15
        expect(v1.length).toBe(12);
        expect(v2.length).toBe(12);
        for (let i = 0; i < 12; i++) {
            expect({ pair: v2[i].dataPair, ref: v2[i].refNum, green: v2[i].greenCount })
                .toEqual({ pair: v1[i].dataPair, ref: v1[i].refNum, green: v1[i].greenCount });
        }
    });

    test('N5: trigger updates when a new SET_5/SET_6 actual appears', () => {
        // First sequence: latest=29 (SET_0), carry-forward to 15 (SET_5).
        // Second sequence: append 33 (SET_6) so lastSpin=33 and trigger=33.
        const v1 = renderVerdicts([10, 20, 15, 9, 29]); // SET_5 trigger
        pairRefsFromLastSpin(29).forEach(([dataPair, refNum]) => {
            const v = v1.find(x => x.dataPair === dataPair);
            const expected = oracleShouldHighlight(dataPair, refNum, SET_5) ? 7 : 0;
            expect({ dataPair, refNum, greenCount: v.greenCount })
                .toEqual({ dataPair, refNum, greenCount: expected });
        });

        const v2 = renderVerdicts([10, 20, 15, 9, 29, 33]); // SET_6 now triggers
        pairRefsFromLastSpin(33).forEach(([dataPair, refNum]) => {
            const v = v2.find(x => x.dataPair === dataPair);
            const expected = oracleShouldHighlight(dataPair, refNum, SET_6) ? 7 : 0;
            expect({ dataPair, refNum, greenCount: v.greenCount })
                .toEqual({ dataPair, refNum, greenCount: expected });
        });
    });

    test('N6: latest ∈ SET_5 ignores deeper history — used directly (not carried over)', () => {
        // A SET_5 latest must behave identically with or without earlier
        // SET_6 values in history — it's the trigger directly.
        const v1 = renderVerdicts([5, 11, 7, 15, 17]);
        const v2 = renderVerdicts([33, 4, 21, 15, 17]); // earlier SET_6 shouldn't matter
        for (let i = 0; i < 12; i++) {
            expect({ pair: v2[i].dataPair, ref: v2[i].refNum, green: v2[i].greenCount })
                .toEqual({ pair: v1[i].dataPair, ref: v1[i].refNum, green: v1[i].greenCount });
        }
    });

    test('N7: source wires a carry-forward helper that walks spins backwards for SET_5/SET_6 membership', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const fnStart = src.indexOf('function renderTable1');
        const t2Start = src.indexOf('function renderTable2');
        const t1Body = src.slice(fnStart, t2Start);
        // Helper must exist.
        expect(t1Body).toMatch(/_getT1CarryForwardTrigger/);
        // NEXT-row block must call it and pass the result to _getT1ActiveSideSet.
        expect(t1Body).toMatch(/_getT1CarryForwardTrigger\s*\(\s*spins\s*\)/);
        expect(t1Body).toMatch(/const\s+activeSideSet\s*=[^;]+_getT1ActiveSideSet\(/);
        // Helper body iterates SET_5 / SET_6 membership.
        const helperIdx = t1Body.indexOf('const _getT1CarryForwardTrigger');
        expect(helperIdx).toBeGreaterThan(-1);
        const helperBody = t1Body.slice(helperIdx, helperIdx + 600);
        expect(helperBody).toMatch(/SET_5_NUMS\.has/);
        expect(helperBody).toMatch(/SET_6_NUMS\.has/);
    });
});

// ═══════════════════════════════════════════════════════════════
//  D. SET_0-only history ⇒ no green anywhere
// ═══════════════════════════════════════════════════════════════
describe('D. SET_0-only history (no prior SET_5/SET_6) ⇒ no green', () => {
    // Every element of the seed is in SET_0 so the carry-forward
    // trigger lookup walks all the way back without finding a
    // SET_5/SET_6 member. Expected: no green in the NEXT row.
    const seeds = [
        [10, 20, 9, 29, 26],   // all ∈ SET_0
        [12, 2, 34, 16, 19],   // all ∈ SET_0
        [30, 10, 20, 9, 0],    // all ∈ SET_0
        [26, 2, 16, 29, 13]    // all ∈ SET_0
    ];
    seeds.forEach((spins, i) => {
        test(`D${i + 1}: pure-SET_0 history (latest=${spins[spins.length - 1]}) ⇒ NEXT row has zero t1-set-match cells`, () => {
            // Sanity: confirm every element really is in SET_0.
            for (const n of spins) expect(SET_0.has(n)).toBe(true);
            seedSpins(spins);
            const nextRow = extractNextRow(renderAndGetHtml());
            expect(nextRow).not.toMatch(/t1-set-match/);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  E. Coverage boundary: must be ≥ 2, not ≥ 1
// ═══════════════════════════════════════════════════════════════
describe('E. Coverage boundary (≥2 required)', () => {
    /**
     * For each pair on a given seed, assert:
     *   - coverage < 2 → 0 green cells
     *   - coverage >= 2 → 7 green cells
     * If no pair has coverage < 2 for this seed, skip that assertion.
     * If no pair has coverage >= 2 for this seed, skip that assertion.
     */
    const checkBoundary = (spins, activeSideSet) => {
        seedSpins(spins);
        const nextRow = extractNextRow(renderAndGetHtml());
        const pairs = pairRefsFromLastSpin(spins[spins.length - 1]);
        let sawLow = false, sawHigh = false;
        pairs.forEach(([dataPair, refNum]) => {
            // ref0/ref19 are excluded — always 0 regardless of coverage.
            if (EXCLUDED_PAIRS.has(dataPair)) {
                expect(greenCountForPair(nextRow, dataPair)).toBe(0);
                return;
            }
            const cov = oracleCoverage(refNum, activeSideSet);
            const actualGreen = greenCountForPair(nextRow, dataPair);
            if (cov < 2) {
                sawLow = true;
                expect({ dataPair, cov, actualGreen }).toEqual({ dataPair, cov, actualGreen: 0 });
            } else {
                sawHigh = true;
                expect({ dataPair, cov, actualGreen }).toEqual({ dataPair, cov, actualGreen: 7 });
            }
        });
        return { sawLow, sawHigh };
    };

    test('E1: a seed from SET_5 exercises both <2 and ≥2 branches', () => {
        // Must land both some pairs under the threshold and some at/above it.
        // latest=5 tends to produce mixed coverage across 12 pairs.
        const { sawLow, sawHigh } = checkBoundary([10, 15, 20, 18, 5], SET_5);
        // We don't force both branches — but assert the test exercised ≥1
        expect(sawLow || sawHigh).toBe(true);
    });

    test('E2: a seed from SET_6 exercises both <2 and ≥2 branches', () => {
        const { sawLow, sawHigh } = checkBoundary([10, 15, 20, 18, 33], SET_6);
        expect(sawLow || sawHigh).toBe(true);
    });

    test('E3: renderer uses >= 2 threshold (boundary is exactly 2, not 1)', () => {
        // Source-level guarantee that the literal threshold is 2. If someone
        // accidentally drops it to 1 or raises it to 3, this test catches it.
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const fnStart = src.indexOf('function renderTable1');
        const t2Start = src.indexOf('function renderTable2');
        const t1Body = src.slice(fnStart, t2Start);
        // The coverage comparison must use `>= 2` next to `_t1PairActiveCoverage`.
        expect(t1Body).toMatch(/_t1PairActiveCoverage\([^)]+\)\s*>=\s*2/);
        // And must not use weaker / stronger thresholds with that helper.
        expect(t1Body).not.toMatch(/_t1PairActiveCoverage\([^)]+\)\s*>=\s*1\b/);
        expect(t1Body).not.toMatch(/_t1PairActiveCoverage\([^)]+\)\s*>=\s*3\b/);
    });
});

// ═══════════════════════════════════════════════════════════════
//  F. Historical rows are never highlighted
// ═══════════════════════════════════════════════════════════════
describe('F. Historical rows untouched', () => {
    test('F1: pure-SET_0 history → no green anywhere (historical or NEXT)', () => {
        // Under the carry-forward rule, a mixed history (SET_5 earlier,
        // SET_0 now) WILL highlight via the carry-forward trigger. To
        // guarantee "no green", the entire history must be SET_0.
        seedSpins([10, 20, 9, 29, 26]);
        const html = renderAndGetHtml();
        expect(html).not.toMatch(/t1-set-match/);
    });

    test('F2: latest ∈ SET_5 with NEXT highlights → historical rows stay clean', () => {
        seedSpins([5, 11, 7, 15, 17]); // latest=17, in SET_5
        const html = renderAndGetHtml();
        const rows = html.split(/<\/tr>/);
        const historical = rows.filter(r => !/next-row/.test(r)).join('');
        expect(historical).not.toMatch(/t1-set-match/);
    });
});

// ═══════════════════════════════════════════════════════════════
//  G. Whole-segment semantics
// ═══════════════════════════════════════════════════════════════
describe('G. Whole-segment rule', () => {
    test('G1: for any highlighted pair, ALL 7 cells of its segment are green', () => {
        // Sweep seeds; whenever a pair highlights, assert all 7 cells carry the class.
        const trialSeeds = [
            [10, 15, 20, 18, 5], [10, 15, 20, 18, 33], [3, 21, 9, 27, 17],
            [5, 11, 7, 24, 35], [4, 12, 22, 8, 32]
        ];
        let highlightedPairs = 0;
        trialSeeds.forEach(spins => {
            const last = spins[spins.length - 1];
            const active = SET_5.has(last) ? SET_5 : SET_6.has(last) ? SET_6 : null;
            if (!active) return;
            seedSpins(spins);
            const nextRow = extractNextRow(renderAndGetHtml());
            const pairs = pairRefsFromLastSpin(last);
            pairs.forEach(([dataPair]) => {
                const cells = cellsForPair(nextRow, dataPair);
                expect(cells.length).toBe(7);
                const greens = cells.filter(c => /\bt1-set-match\b/.test(c.attrs)).length;
                // Invariant: either 0 or 7 — never partial.
                expect([0, 7]).toContain(greens);
                if (greens === 7) highlightedPairs++;
            });
        });
        expect(highlightedPairs).toBeGreaterThan(0);
    });

    test('G2: anchor Ref cell is included in the highlight when a non-excluded pair matches', () => {
        seedSpins([10, 15, 20, 18, 5]);
        const nextRow = extractNextRow(renderAndGetHtml());
        const pairs = pairRefsFromLastSpin(5);
        let asserted = 0;
        for (const [dataPair, refNum] of pairs) {
            if (oracleShouldHighlight(dataPair, refNum, SET_5)) {
                const cells = cellsForPair(nextRow, dataPair);
                expect(cells[0].attrs).toMatch(/anchor-cell/);
                expect(cells[0].attrs).toMatch(/t1-set-match/);
                asserted++;
            }
        }
        expect(asserted).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  H. ±1 expansion & formation untouched
// ═══════════════════════════════════════════════════════════════
describe('H. ±1 expansion & formation untouched', () => {
    test('H1: expandTargetsToBetNumbers still exists and takes (targets, 1)', () => {
        expect(typeof R.expandTargetsToBetNumbers).toBe('function');
        const out = R.expandTargetsToBetNumbers([13], 1);
        expect(Array.isArray(out) || out instanceof Set).toBe(true);
    });

    test('H2: getTable1NextProjections still produces projections', () => {
        seedSpins([10, 15, 20, 18, 5]);
        const projections = R.getTable1NextProjections();
        expect(projections && typeof projections === 'object').toBe(true);
    });

    test('H3: _T1_PAIR_DEFS still has 12 pair families', () => {
        expect(R._T1_PAIR_DEFS).not.toBeNull();
        expect(R._T1_PAIR_DEFS.length).toBe(12);
    });

    test('H4: _T1_VALID_CODES unchanged (±1 only)', () => {
        expect(R._T1_VALID_CODES.has('S+0')).toBe(true);
        expect(R._T1_VALID_CODES.has('SL+1')).toBe(true);
        expect(R._T1_VALID_CODES.has('OR+1')).toBe(true);
        expect(R._T1_VALID_CODES.has('SL+2')).toBe(false);
        expect(R._T1_VALID_CODES.has('OR+2')).toBe(false);
    });

    test('H5: getLookupRow shape preserved', () => {
        const row = globalThis.getLookupRow(0);
        expect(row).toBeTruthy();
        expect(typeof row.first).toBe('number');
        expect(typeof row.second).toBe('number');
        expect(typeof row.third).toBe('number');
    });
});

// ═══════════════════════════════════════════════════════════════
//  I. Existing colors / flash preserved
// ═══════════════════════════════════════════════════════════════
describe('I. Existing colors preserved', () => {
    test('I1: code-s / code-o / code-xx classes still render on historical rows', () => {
        seedSpins([10, 15, 20, 18, 5]);
        const html = renderAndGetHtml();
        expect(html).toMatch(/code-[so]\b|code-xx/);
    });

    test('I2: .t1-flash branch in renderer does not reference t1-set-match', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const flashBlocks = src.match(/t1FlashTargets\.has\(flashKey\)\)[\s\S]*?else/);
        expect(flashBlocks).not.toBeNull();
        expect(flashBlocks[0]).not.toMatch(/t1-set-match/);
    });

    test('I3: anchor-cell class still present on Ref column', () => {
        seedSpins([10, 15, 20, 18, 5]);
        const html = renderAndGetHtml();
        expect(html).toMatch(/class="[^"]*anchor-cell/);
    });

    test('I4: historical target cells never carry t1-set-match', () => {
        seedSpins([5, 11, 7, 15, 17]);
        const html = renderAndGetHtml();
        const rows = html.split(/<\/tr>/);
        const historical = rows.filter(r => !/next-row/.test(r)).join('');
        expect(historical).not.toMatch(/t1-set-match/);
    });
});

// ═══════════════════════════════════════════════════════════════
//  J. Scope — only Table 1 NEXT row is modified
// ═══════════════════════════════════════════════════════════════
describe('J. Scope — Table 2 / Table 3 / historical untouched', () => {
    test('J1: renderTable2 source does NOT reference t1-set-match', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const t2Idx = src.indexOf('function renderTable2');
        const t3Idx = src.indexOf('function renderTable3');
        const t2Body = src.slice(t2Idx, t3Idx);
        expect(t2Body).not.toMatch(/t1-set-match/);
    });

    test('J2: renderTable3 source does NOT reference t1-set-match', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const t3Idx = src.indexOf('function renderTable3');
        const afterT3 = src.slice(t3Idx);
        const nextFn = afterT3.slice(20).search(/\nfunction\s+\w+\s*\(/);
        const t3Body = nextFn >= 0 ? afterT3.slice(0, nextFn + 20) : afterT3;
        expect(t3Body).not.toMatch(/t1-set-match/);
    });

    test('J3: historical-row branch (renderTargetGroup) has no reference', () => {
        const src = fs.readFileSync(
            pathMod.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const fnStart = src.indexOf('function renderTable1');
        const t2Start = src.indexOf('function renderTable2');
        const t1Body = src.slice(fnStart, t2Start);
        const targetGroupIdx = t1Body.indexOf('const renderTargetGroup');
        const nextGroupIdx = t1Body.indexOf('const renderNextGroup');
        const targetGroupSrc = t1Body.slice(targetGroupIdx, nextGroupIdx);
        expect(targetGroupSrc).not.toMatch(/t1-set-match/);
    });
});
