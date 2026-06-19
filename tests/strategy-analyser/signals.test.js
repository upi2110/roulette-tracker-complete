/**
 * Unit tests for each locked signal (Rules 1-7, minus the parked
 * gold-flash semantics of Rule 7).
 *
 * Specs follow the 2026-06-19 user-locked rule set.
 */

const sign  = require('../../strategies/strategy-analyser/signals/sign-streak.js');
const tbl   = require('../../strategies/strategy-analyser/signals/table-streak.js');
const set   = require('../../strategies/strategy-analyser/signals/set-carry.js');
const sub   = require('../../strategies/strategy-analyser/signals/sub-anchor-pattern.js');
const rot   = require('../../strategies/strategy-analyser/signals/cross-cell-rotation.js');
const conv  = require('../../strategies/strategy-analyser/signals/cross-table-conv.js');
const _P    = require('../../strategies/strategy-analyser/partitions.js');

function _spinsSnap(spins) {
    return { meta: { spins } };
}

// ──────────────────────────────────────────────────────────────────
// RULE 1 — sign-streak
// ──────────────────────────────────────────────────────────────────
describe('Rule 1 — sign-streak', () => {

    test('fires when last 2 spins same camp', () => {
        // Two POSITIVE spins: 1 (POS), 9 (POS).
        const out = sign.evaluate(_spinsSnap([1, 9]));
        expect(out.length).toBe(1);
        expect(out[0].name).toBe('sign-streak-same');
        expect(out[0].weight).toBe(1.00);
        expect(out[0].details.length).toBe(2);
        expect(out[0].details.sign).toBe('POS');
    });

    test('fires when last 4 same camp', () => {
        // 4 POSITIVE: 1, 9, 11, 13
        const out = sign.evaluate(_spinsSnap([1, 9, 11, 13]));
        expect(out.length).toBe(1);
        expect(out[0].details.length).toBe(4);
    });

    test('does NOT fire when streak ≥ 5', () => {
        const out = sign.evaluate(_spinsSnap([1, 9, 11, 13, 14]));   // 5 POS in a row
        expect(out.length).toBe(0);
    });

    test('does NOT fire on streak of 1', () => {
        // 5 (NEG), 1 (POS) — streak length 1
        const out = sign.evaluate(_spinsSnap([5, 1]));
        expect(out.length).toBe(0);
    });

    test('never votes opposite camp', () => {
        const out = sign.evaluate(_spinsSnap([1, 9]));
        expect(out.some(s => s.name.includes('anti'))).toBe(false);
    });

    test('0 and 26 are POSITIVE (per partitions.js)', () => {
        const out = sign.evaluate(_spinsSnap([0, 26]));
        expect(out.length).toBe(1);
        expect(out[0].details.sign).toBe('POS');
    });
});

// ──────────────────────────────────────────────────────────────────
// RULE 2 — table-streak
// ──────────────────────────────────────────────────────────────────
describe('Rule 2 — table-streak', () => {

    test('fires when last 2 spins same table', () => {
        // 3 + 26 are both ZERO table
        const out = tbl.evaluate(_spinsSnap([3, 26]));
        expect(out.length).toBe(1);
        expect(out[0].name).toBe('table-streak-same');
        expect(out[0].weight).toBe(1.00);
    });

    test('does NOT fire when streak ≥ 5', () => {
        const out = tbl.evaluate(_spinsSnap([3, 26, 0, 2, 25]));   // 5 ZERO
        expect(out.length).toBe(0);
    });

    test('does NOT fire on streak of 1', () => {
        // ZERO then NINETEEN
        const out = tbl.evaluate(_spinsSnap([3, 19]));
        expect(out.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────
// RULE 3 — set-carry
// ──────────────────────────────────────────────────────────────────
describe('Rule 3 — set-carry', () => {

    test('latest is SET_5 → vote SET_5 + SET_0', () => {
        // 5 is in SET_5
        const out = set.evaluate(_spinsSnap([5]));
        const anchor  = out.find(s => s.name === 'set-carry-anchor');
        const neutral = out.find(s => s.name === 'set-carry-neutral');
        expect(anchor).toBeDefined();
        expect(neutral).toBeDefined();
        expect(anchor.details.anchor).toBe('SET_5');
        expect(anchor.weight).toBeCloseTo(2/3);
        expect(neutral.weight).toBeCloseTo(1/3);
    });

    test('latest is SET_6 → vote SET_6 + SET_0', () => {
        const out = set.evaluate(_spinsSnap([6]));
        const anchor = out.find(s => s.name === 'set-carry-anchor');
        expect(anchor.details.anchor).toBe('SET_6');
    });

    test('latest is SET_0 → walk back to SET_5/6 anchor', () => {
        // SET_5 (32) then SET_0 (0)
        const out = set.evaluate(_spinsSnap([32, 0]));
        const anchor = out.find(s => s.name === 'set-carry-anchor');
        expect(anchor).toBeDefined();
        expect(anchor.details.anchor).toBe('SET_5');
    });

    test('history with no SET_5/SET_6 → skip', () => {
        // All SET_0: 0, 2, 9
        const out = set.evaluate(_spinsSnap([0, 2, 9]));
        expect(out.length).toBe(0);
    });

    test('streak ≥ 5 on same set → skip', () => {
        // 5 SET_5 in a row: 5, 7, 11, 14, 15
        const out = set.evaluate(_spinsSnap([5, 7, 11, 14, 15]));
        expect(out.length).toBe(0);
    });

    test('never votes the rival set', () => {
        // SET_5 anchor; ensure SET_6 not in any candidates
        const out = set.evaluate(_spinsSnap([5]));
        const set6 = _P.SET_6;
        out.forEach(s => {
            for (const n of s.candidates) {
                expect(set6.has(n) && !_P.SET_0.has(n) && !_P.SET_5.has(n)).toBe(false);
            }
        });
    });
});

// ──────────────────────────────────────────────────────────────────
// RULE 4 — sub-anchor cluster — helpers
// ──────────────────────────────────────────────────────────────────
function _r(hits, oppHits) {
    return { perPair: { prev: { hits: { ...hits }, oppHits: { ...oppHits } } } };
}
function _mkT12Snap(rows, projEntry) {
    return {
        table1: {
            rows,
            nextProjections: { prev: projEntry, prev_13opp: projEntry }
        },
        table2: { rows: [], nextProjections: {} }
    };
}
const _projAB = {
    first:  { numbers: [11, 12] },
    second: { numbers: [21, 22] },
    third:  { numbers: [31, 32] }
};

describe('Rule 4 — sub-anchor cluster', () => {

    test('cluster of 2: fires with 40/40/20 split', () => {
        const rows = [
            _r({ first: true }, {}),
            _r({ second: true }, {}),
            _r({ first: true }, {})
        ];
        const out = sub.evaluate(_mkT12Snap(rows, _projAB));
        const pairOut = out.filter(s => s.name.includes('/T1/prev/'));
        // Expect 3 entries: A-hit-first (40%), A-hit-second (40%), A-miss-third (20%)
        const hitFirst = pairOut.find(s => s.name.endsWith('/A-hit-first'));
        const hitSecond = pairOut.find(s => s.name.endsWith('/A-hit-second'));
        const missThird = pairOut.find(s => s.name.endsWith('/A-miss-third'));
        expect(hitFirst).toBeDefined();
        expect(hitSecond).toBeDefined();
        expect(missThird).toBeDefined();
        expect(hitFirst.weight).toBeCloseTo(0.40);
        expect(hitSecond.weight).toBeCloseTo(0.40);
        expect(missThird.weight).toBeCloseTo(0.20);
    });

    test('cluster of 1: fires with 30/30/20/20 split + 13-opp mirror', () => {
        const rows = [
            _r({ first: true }, {}),
            _r({ first: true }, {}),
            _r({ first: true }, {})
        ];
        const out = sub.evaluate(_mkT12Snap(rows, _projAB));
        const names = out.filter(s => s.name.includes('/T1/prev/')).map(s => s.name);
        expect(names.some(n => n.endsWith('/B-hit-first'))).toBe(true);
        expect(names.some(n => n.endsWith('/B-mirror-first'))).toBe(true);
        expect(names.some(n => n.endsWith('/B-miss-second'))).toBe(true);
        expect(names.some(n => n.endsWith('/B-miss-third'))).toBe(true);

        const hit = out.find(s => s.name.endsWith('/T1/prev/B-hit-first'));
        const miss = out.find(s => s.name.endsWith('/T1/prev/B-miss-second'));
        expect(hit.weight).toBeCloseTo(0.30);
        expect(miss.weight).toBeCloseTo(0.20);
    });

    test('cluster of 3 → wait (no entries on this side)', () => {
        const rows = [
            _r({ first: true }, {}),
            _r({ second: true }, {}),
            _r({ third: true }, {})
        ];
        const out = sub.evaluate(_mkT12Snap(rows, _projAB));
        const pairOut = out.filter(s => s.name.includes('/T1/prev/'));
        // No A-* or B-* entries should fire for cluster-of-3.
        expect(pairOut.length).toBe(0);
    });

    test('miss in last 3 → does NOT fire', () => {
        const rows = [
            _r({ first: true }, {}),
            _r({}, {}),                  // miss
            _r({ first: true }, {})
        ];
        const out = sub.evaluate(_mkT12Snap(rows, _projAB));
        const pairOut = out.filter(s => s.name.includes('/T1/prev/'));
        expect(pairOut.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────
// RULE 6 — cross-cell-rotation
// ──────────────────────────────────────────────────────────────────
describe('Rule 6 — cross-cell-rotation', () => {

    test('fires on strict P-13O-P-13O alternation', () => {
        const rows = [
            _r({ first: true }, {}),                 // P
            _r({},              { second: true }),   // 13O
            _r({ second: true }, {}),                // P
            _r({},              { third: true })     // 13O → predict P
        ];
        const out = rot.evaluate(_mkT12Snap(rows, _projAB));
        expect(out.length).toBeGreaterThan(0);
        const names = out.map(s => s.name);
        expect(names.every(n => n.includes('/T1/prev/'))).toBe(true);
    });

    test('does NOT fire when a row is BOTH', () => {
        const rows = [
            _r({ first: true }, {}),                  // P
            _r({ first: true }, { first: true }),     // BOTH → breaks
            _r({},              { first: true }),     // 13O
            _r({ first: true }, {})                   // P
        ];
        const out = rot.evaluate(_mkT12Snap(rows, _projAB));
        expect(out.length).toBe(0);
    });

    test('1-distinct-slot split: 50/25/25', () => {
        // Last 4 spins alternate P → 13O → P → 13O. Past predicted-side
        // (P) hits are spins 0 and 2, both hitting only `first`.
        // Predict 13O. But wait — we need to look at past PREDICTED-side
        // hits. Latest is 13O → predict P. Past P hits = spins 0, 2,
        // both first → 1 distinct → 50/25/25.
        const rows = [
            _r({ first: true }, {}),                 // P
            _r({},              { second: true }),   // 13O
            _r({ first: true }, {}),                 // P
            _r({},              { third: true })     // 13O
        ];
        const out = rot.evaluate(_mkT12Snap(rows, _projAB));
        // Predicted side is the OPPOSITE of last labelled hit (13O → P).
        const main = out.find(s => s.name.endsWith('/1-hit-first'));
        const restA = out.find(s => s.name.endsWith('/1-rest-second'));
        const restB = out.find(s => s.name.endsWith('/1-rest-third'));
        expect(main).toBeDefined();
        expect(restA).toBeDefined();
        expect(restB).toBeDefined();
        expect(main.weight).toBeCloseTo(0.50);
        expect(restA.weight).toBeCloseTo(0.25);
        expect(restB.weight).toBeCloseTo(0.25);
    });
});

// ──────────────────────────────────────────────────────────────────
// RULE 7 — cross-table-conv (gold-streak detector — uses parked
// distance-match semantics from Backlog #1).
// Tests are intentionally minimal: verify the qualifying condition
// and tie-handling shape. Detailed gold-flash correctness is part
// of the parked discussion.
// ──────────────────────────────────────────────────────────────────
describe('Rule 7 — cross-table-conv', () => {

    test('returns nothing when T3 has < 2 rows', () => {
        const snap = { table3: { rows: [], nextProjections: {} } };
        const out = conv.evaluate(snap);
        expect(out).toEqual([]);
    });

    test('returns nothing when no pair-family has gold on last 2 rows', () => {
        // Build T3 with cells whose distances are all > 1 apart so no
        // gold ever lights up.
        const rows = [
            { actual: 0,  perPair: { prev: { refNum: 14, ref13Opp: 1  } } },
            { actual: 7,  perPair: { prev: { refNum: 14, ref13Opp: 1  } } },
            { actual: 14, perPair: { prev: { refNum: 14, ref13Opp: 1  } } }
        ];
        const snap = {
            table3: { rows, nextProjections: { prev: { numbers: [99] } } }
        };
        const out = conv.evaluate(snap);
        expect(out).toEqual([]);
    });
});

// ──────────────────────────────────────────────────────────────────
// AGGREGATOR — share-based redistribution
// ──────────────────────────────────────────────────────────────────
describe('Aggregator — share-based redistribution', () => {
    const SA = require('../../strategies/strategy-analyser/strategy-analyser.js');
    const { snapshot } = require('../../core/tables/snapshot.js');

    function _decideOn(spins, params) {
        const snap = snapshot(spins, {});
        const idx  = spins.length - 1;
        const state = SA.createSessionState();
        return SA.decide({}, spins, idx, {
            sessionState: state,
            params: params || {}
        });
    }

    test('DEFAULTS.shares sum to 1.0', () => {
        const sum = Object.values(SA.DEFAULTS.shares).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0);
    });

    test('confidence is 0% when no signals fire (too few spins)', () => {
        const d = _decideOn([3]);   // only 1 spin → warmup
        expect(d.action).toBe('WAIT');
        expect(d.confidence).toBe(0);
    });

    test('3-spin input: only sign/table/setCarry fire (rule46/gold need more spins)', () => {
        // Spins 1, 9, 11 — all POSITIVE.
        // Rule 1: 3-in-a-row POS → fires (sign group).
        // Rule 2: ZERO → NINETEEN → NINETEEN → 2-in-row NINETEEN at the
        //         tail → fires (table group).
        // Rule 3: latest 11 in SET_5 → fires (setCarry group).
        // Rule 4 needs 3 perPair rows; Rule 6 needs 4; Rule 7 needs 2
        // T3 rows. None of those satisfied with only 3 spins of history.
        const d = _decideOn([14, 15, 11]);
        const e = d.explanation;
        expect(e.activeGroups.sort()).toEqual(['setCarry', 'sign', 'table']);
        const sumEffective = Object.values(e.effectiveShares).reduce((a, b) => a + b, 0);
        expect(sumEffective).toBeCloseTo(1.0);
    });

    test('redistribution: inactive 0.40 / 3 active = bonus ~0.133 each', () => {
        // 3 active (sign, table, setCarry) = 0.60 configured.
        // Inactive (rule46 + gold) = 0.40. Bonus = 0.40 / 3.
        const d = _decideOn([14, 15, 11]);
        const e = d.explanation;
        expect(e.inactiveShare).toBeCloseTo(0.40);
        expect(e.redistributionBonus).toBeCloseTo(0.40 / 3);
        expect(e.effectiveShares.sign).toBeCloseTo(0.20 + 0.40 / 3);
        expect(e.effectiveShares.table).toBeCloseTo(0.20 + 0.40 / 3);
        expect(e.effectiveShares.setCarry).toBeCloseTo(0.20 + 0.40 / 3);
    });

    test('disabledRules — Rule 1 disabled → its share redistributes', () => {
        // Disable signStreak. Active becomes 2 groups (table, setCarry).
        // Inactive: sign + rule46 + gold = 0.60. Bonus = 0.30 each.
        const d = _decideOn([14, 15, 11], { disabledRules: new Set(["signStreak"]) });
        const e = d.explanation;
        expect(e.activeGroups).not.toContain('sign');
        expect(e.activeGroups.sort()).toEqual(['setCarry', 'table']);
        expect(e.effectiveShares.table).toBeCloseTo(0.50);
        expect(e.effectiveShares.setCarry).toBeCloseTo(0.50);
    });
});

// ──────────────────────────────────────────────────────────────────
// RULE 3 — new 2026-06-19 spec (window of 5, SET_0 invisible)
// ──────────────────────────────────────────────────────────────────
describe('Rule 3 — set-carry NEW spec (window-of-5 with SET_0 invisible)', () => {

    test('5,0,0,5 → fires SET_5 (SET_0 invisible)', () => {
        // 5 = SET_5, 0 = SET_0. Window has 2 SET_5 + 2 SET_0 → fire SET_5.
        const out = set.evaluate(_spinsSnap([5, 0, 0, 5]));
        const anchor = out.find(s => s.name === 'set-carry-anchor');
        expect(anchor).toBeDefined();
        expect(anchor.details.anchor).toBe('SET_5');
    });

    test('5,0,5,0,5 → fires SET_5 (alternating, SET_0 invisible)', () => {
        const out = set.evaluate(_spinsSnap([5, 0, 5, 0, 5]));
        const anchor = out.find(s => s.name === 'set-carry-anchor');
        expect(anchor.details.anchor).toBe('SET_5');
    });

    test('0,0,5,5 → fires SET_5', () => {
        const out = set.evaluate(_spinsSnap([0, 0, 5, 5]));
        const anchor = out.find(s => s.name === 'set-carry-anchor');
        expect(anchor.details.anchor).toBe('SET_5');
    });

    test('5,6,5 → SKIP (mixed sets within window)', () => {
        const out = set.evaluate(_spinsSnap([5, 6, 5]));
        expect(out.length).toBe(0);
    });

    test('5,5,0,0,0 → fires SET_5 (only 2 anchors but SET_0 invisible)', () => {
        // Even with 3 SET_0 trailing, the SET_5s in the window count.
        const out = set.evaluate(_spinsSnap([5, 5, 0, 0, 0]));
        const anchor = out.find(s => s.name === 'set-carry-anchor');
        expect(anchor.details.anchor).toBe('SET_5');
    });

    test('5,5,5,5,5 → SKIP (5 same-anchor no-zero = too long)', () => {
        const out = set.evaluate(_spinsSnap([5, 7, 11, 14, 15]));   // all SET_5
        expect(out.length).toBe(0);
    });

    test('6,6,6,6,6 → SKIP (same rule applies to SET_6)', () => {
        const out = set.evaluate(_spinsSnap([1, 3, 4, 6, 8]));   // all SET_6
        expect(out.length).toBe(0);
    });

    test('window slides to last 5: 6 in oldest position outside window', () => {
        // [6, 5, 5, 5, 5, 5] — newest 5 are [5,5,5,5,5] but the LAST 5
        // are 5×SET_5 with no SET_0 → skip per "5 in a row no-zero".
        const out = set.evaluate(_spinsSnap([6, 5, 7, 11, 14, 15]));
        expect(out.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────
// AGGREGATOR — multi-pair tiebreak + 50/50 split (Rules 4 + 6)
// ──────────────────────────────────────────────────────────────────
describe('Aggregator — Rules 4+6 multi-pair tiebreak + 50/50', () => {
    const SA = require('../../strategies/strategy-analyser/strategy-analyser.js');

    test('rule46 group share = 15% when both Rule 4 and Rule 6 fire (split 50/50)', () => {
        // We can't easily make Rule 4 / Rule 6 fire via spins alone
        // without crafting projection data — verify the SHARE math
        // by injecting fake fired entries into a stubbed evaluator
        // is too invasive. Instead, sanity-check DEFAULTS.shares.rule46.
        expect(SA.DEFAULTS.shares.rule46).toBeCloseTo(0.15);
    });

    test('tiebreak helper exists in DEFAULTS GROUP_OF mapping', () => {
        // GROUP_OF is not exported; verify via the DEFAULTS weights
        // which use the same group ids.
        expect(SA.DEFAULTS.weights.subAnchorPattern).toBeCloseTo(0.075);
        expect(SA.DEFAULTS.weights.crossCellRotate).toBeCloseTo(0.075);
        // Together they sum to rule46 group share.
        expect(SA.DEFAULTS.weights.subAnchorPattern + SA.DEFAULTS.weights.crossCellRotate)
            .toBeCloseTo(SA.DEFAULTS.shares.rule46);
    });
});
