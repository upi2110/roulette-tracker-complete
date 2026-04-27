/**
 * 55-t1-strategy.test.js
 *
 * Unit + integration tests for the T1-strategy decision policy.
 *
 * Verifies:
 *   A. Canonical constants (wheel sets, eligible pairs, bet size).
 *   B. Carry-forward trigger scan (SET_5/SET_6 over pure-SET_0 tails).
 *   C. T1 green coverage gate (≥2 of 3 raw lookup anchors).
 *   D. T2 golden-flash gate (same dataPair).
 *   E. T3 engine-flash gate (same refKey).
 *   F. Final bet set is exactly 12 numbers.
 *   G. Strategy uses engine methods (scorePair, computeConfidence) —
 *      does NOT bypass the model.
 *   H. Decision shape is compatible with AutoTestRunner._simulateDecision.
 *   I. Reason strings are descriptive and do not break the runner.
 *   J. _t1TrimToSize prioritisation (deterministic).
 */

const path = require('path');

// Wheel-set constants mirror roulette-wheel.js; same list used inside
// the helper. We hand-verify parity in A1.
const WHEEL_SET_0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
const WHEEL_SET_5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
const WHEEL_SET_6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

// Load the helper once at require time. Node sees the `module.exports`
// path — the browser `window.decideT1Strategy` side of the file is
// excluded since `window` is undefined here unless jest-jsdom provides
// it; loading via require bypasses that branch cleanly.
const {
    decideT1Strategy,
    T1_SET_0, T1_SET_5, T1_SET_6,
    T1_ELIGIBLE_PAIRS, T1_BET_SIZE,
    _t1CarryForward, _t1TrimToSize
} = require('../../strategies/t1/t1-strategy');

// Load the real getLookupRow to feed into the mock engine.
const fs = require('fs');
const lookupSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'table-lookup.js'),
    'utf-8'
);
const getLookupRow = (() => {
    const fn = new Function(lookupSrc + '\nreturn getLookupRow;');
    return fn();
})();

// Load expandTargetsToBetNumbers via the shared test-setup harness so
// we get the same sandboxed export path the rest of the suite uses.
const { setupDOM, loadRendererFunctions } = require('../test-setup');
setupDOM();
const _R = loadRendererFunctions();
const expandTargetsToBetNumbers = _R.expandTargetsToBetNumbers;

// ── Mock engine ────────────────────────────────────────────────────
function makeMockEngine(overrides = {}) {
    const calls = { scorePair: [], computeConfidence: [], flashHist: [], t2Flash: [], lookup: [], expand: [] };
    const defaultT2 = null;
    const defaultT3 = new Map();
    const eng = {
        confidenceThreshold: 55,
        maxConsecutiveSkips: 8,
        session: { consecutiveSkips: 0 },
        _currentDecisionSpins: null,
        _getLookupRow(n) { calls.lookup.push(n); return getLookupRow(n); },
        _getExpandTargetsToBetNumbers(targets, range) {
            calls.expand.push({ targets: [...targets], range });
            return expandTargetsToBetNumbers(targets, range);
        },
        simulateT2FlashAndNumbers(spins, idx) {
            calls.t2Flash.push({ idx });
            return typeof overrides.t2 === 'function'
                ? overrides.t2(spins, idx)
                : (overrides.t2 !== undefined ? overrides.t2 : defaultT2);
        },
        _getFlashingPairsFromHistory(spins, idx) {
            calls.flashHist.push({ idx });
            return typeof overrides.t3 === 'function'
                ? overrides.t3(spins, idx)
                : (overrides.t3 !== undefined ? overrides.t3 : defaultT3);
        },
        _computeProjectionForPair(spins, idx, refKey) {
            if (typeof overrides.projection === 'function') return overrides.projection(spins, idx, refKey);
            return { numbers: [1, 2, 3], anchors: [], neighbors: [] };
        },
        _scorePair(refKey, pairData) {
            calls.scorePair.push({ refKey });
            return typeof overrides.score === 'function' ? overrides.score(refKey, pairData) : 0.7;
        },
        _computeConfidence(pairScore, filterScore, numbers) {
            calls.computeConfidence.push({ pairScore, filterScore, count: numbers.length });
            return typeof overrides.confidence === 'function'
                ? overrides.confidence(pairScore, filterScore, numbers)
                : 70;
        }
    };
    eng._calls = calls;
    return eng;
}

// ── Test helpers ───────────────────────────────────────────────────
// Build a T3-flash map keyed on refKey(s). The runner's engine returns
// a Map<refKey, {...codes}>. For our purposes, only .has(refKey) matters.
function t3Map(...refKeys) {
    const m = new Map();
    for (const k of refKeys) m.set(k, { currCode: 'S+0', prevCode: 'S+0', currDist: 0, prevDist: 0, codes: ['S+0'] });
    return m;
}

// Find a test-spin sequence where pair P has ≥2 of 3 raw anchors in SET_5.
// We test with concrete pair refs: prev anchor is lastSpin. Pick a
// lastSpin whose getLookupRow yields ≥2 SET_5 targets.
// From existing diagnostics in the repo, getLookupRow(15) = {11,31,32}:
// 11∈SET_5, 31∈SET_5, 32∈SET_5 → 3 active SET_5 targets. Perfect.
const SPIN_HISTORY_SET5 = [10, 20, 9, 29, 15]; // last=15 (∈ SET_5)
const IDX_SET5 = SPIN_HISTORY_SET5.length - 1;  // 4

// For SET_6: lastSpin=33 → getLookupRow(33)= look up in table. We test
// an ≥2 intersection with SET_6. Discovered by inspection.
const SPIN_HISTORY_SET6 = [10, 20, 9, 29, 33]; // last=33 (∈ SET_6)
const IDX_SET6 = SPIN_HISTORY_SET6.length - 1;

// ═══════════════════════════════════════════════════════════════════
//  A. Constants / parity
// ═══════════════════════════════════════════════════════════════════
describe('A. Constants mirror roulette-wheel.js', () => {
    test('A1: T1_SET_0 / T1_SET_5 / T1_SET_6 match the canonical wheel sets', () => {
        for (const n of WHEEL_SET_0) expect(T1_SET_0.has(n)).toBe(true);
        for (const n of WHEEL_SET_5) expect(T1_SET_5.has(n)).toBe(true);
        for (const n of WHEEL_SET_6) expect(T1_SET_6.has(n)).toBe(true);
        expect(T1_SET_0.size).toBe(WHEEL_SET_0.size);
        expect(T1_SET_5.size).toBe(WHEEL_SET_5.size);
        expect(T1_SET_6.size).toBe(WHEEL_SET_6.size);
    });

    test('A2: T1_ELIGIBLE_PAIRS has exactly 5 entries (base pairs only, no 13opp)', () => {
        expect(T1_ELIGIBLE_PAIRS.length).toBe(5);
        const names = T1_ELIGIBLE_PAIRS.map(p => p.dataPair);
        for (const expected of ['prev', 'prevPlus1', 'prevMinus1', 'prevPlus2', 'prevMinus2']) {
            expect(names).toContain(expected);
        }
        // No _13opp variants (engine has no refKey for them).
        for (const n of names) expect(n).not.toMatch(/_13opp$/);
    });

    test('A3: T1_BET_SIZE is 12 (the spec-required final bet size)', () => {
        expect(T1_BET_SIZE).toBe(12);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  B. Carry-forward trigger
// ═══════════════════════════════════════════════════════════════════
describe('B. _t1CarryForward', () => {
    test('B1: finds the most recent SET_5 / SET_6 walking backward', () => {
        expect(_t1CarryForward([15, 20, 9, 29], 3).trigger).toBe(15);
        expect(_t1CarryForward([33, 20, 9, 29], 3).trigger).toBe(33);
    });

    test('B2: lastSpin in SET_5 yields active=SET_5, side=5', () => {
        const r = _t1CarryForward([20, 9, 29, 15], 3);
        expect(r.side).toBe('5');
        expect(r.active).toBe(T1_SET_5);
    });

    test('B3: lastSpin in SET_6 yields active=SET_6, side=6', () => {
        const r = _t1CarryForward([20, 9, 29, 33], 3);
        expect(r.side).toBe('6');
        expect(r.active).toBe(T1_SET_6);
    });

    test('B4: pure-SET_0 history returns null', () => {
        expect(_t1CarryForward([10, 20, 9, 29], 3)).toBeNull();
    });

    test('B5: walks back through SET_0 tail to an older SET_5 trigger', () => {
        // latest=29 (SET_0), older=15 (SET_5) → trigger=15
        const r = _t1CarryForward([10, 15, 20, 9, 29], 4);
        expect(r.trigger).toBe(15);
        expect(r.side).toBe('5');
    });

    test('B6: non-number entries are skipped', () => {
        const r = _t1CarryForward([10, undefined, null, 15, 29], 4);
        expect(r.trigger).toBe(15);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  C. Decision: full pipeline — happy path
// ═══════════════════════════════════════════════════════════════════
describe('C. decideT1Strategy — happy path (all three gates pass)', () => {
    test('C1: BET when T1-green + T2-gold + T3-flash all align on "prev"', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev', numbers: [], score: 0.6 },
            t3: t3Map('prev')
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
        expect(d.selectedPair).toBe('prev');
        expect(d.numbers.length).toBe(T1_BET_SIZE);
        expect(d.confidence).toBe(70);
        expect(d.reason).toMatch(/T1-strategy/);
    });

    test('C2: reason string mentions active side and the chosen anchors', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev', numbers: [] },
            t3: t3Map('prev')
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.reason).toMatch(/side=5/);
        expect(d.reason).toMatch(/pair=prev/);
        expect(d.reason).toMatch(/anchors=\[\d+,\d+\]/);
    });

    test('C3: filter is "both_both" (no set-filter narrowing — T1 uses its own expansion)', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev', numbers: [] },
            t3: t3Map('prev')
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.selectedFilter).toBe('both_both');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  D. Gates — T1 green, T2 gold, T3 flash
// ═══════════════════════════════════════════════════════════════════
describe('D. Gate behaviour', () => {
    test('D1: SKIP when pure-SET_0 history (no active side)', () => {
        const eng = makeMockEngine();
        const d = decideT1Strategy(eng, [10, 20, 9, 29, 10], 4);
        expect(d.action).toBe('SKIP');
        expect(d.reason).toMatch(/trigger/);
    });

    test('D2: SKIP when no T1-green pair exists (even with T2/T3 active)', () => {
        // Pure-SET_0 history prevents the T1 green gate from resolving a side.
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, [10, 20, 9, 29, 10], 4);
        expect(d.action).toBe('SKIP');
    });

    test('D3: SKIP when T2 flash is missing (even if T1-green + T3 present)', () => {
        const eng = makeMockEngine({
            t2: null,
            t3: t3Map('prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2')
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('SKIP');
        expect(d.reason).toMatch(/T2\+T3 gate failed/);
    });

    test('D4: SKIP when T3 flash is missing on the T2-matched pair', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev' },
            t3: new Map() // no T3 flash at all
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('SKIP');
        expect(d.reason).toMatch(/T2\+T3 gate failed/);
    });

    test('D5: SKIP when T2 flash is on a DIFFERENT pair than T3 flash', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prevMinus2' },  // T2 gold on P-2
            t3: t3Map('prev')                 // T3 flash on P
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('SKIP');
    });

    test('D6: BET only when T2 AND T3 agree on the same dataPair/refKey', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev' },
            t3: t3Map('prev')
        });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
        expect(d.selectedPair).toBe('prev');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  E. Final bet size is exactly 12
// ═══════════════════════════════════════════════════════════════════
describe('E. Final bet set size', () => {
    test('E1: BET numbers array has exactly 12 entries', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
        expect(d.numbers.length).toBe(12);
    });

    test('E2: all 12 numbers are unique', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(new Set(d.numbers).size).toBe(d.numbers.length);
    });

    test('E3: all 12 numbers are in [0, 36]', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        for (const n of d.numbers) {
            expect(Number.isInteger(n)).toBe(true);
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        }
    });

    test('E4: SKIP when the ±1 expansion cannot produce ≥ 12 numbers', () => {
        // Stub expander to return just 4 numbers so _t1TrimToSize bails out.
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const realExpander = eng._getExpandTargetsToBetNumbers;
        eng._getExpandTargetsToBetNumbers = () => [1, 2, 3, 4];
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('SKIP');
        expect(d.reason).toMatch(/Expansion too narrow/);
        eng._getExpandTargetsToBetNumbers = realExpander;
    });
});

// ═══════════════════════════════════════════════════════════════════
//  F. Anchor selection (2 of 3)
// ═══════════════════════════════════════════════════════════════════
describe('F. Anchor selection', () => {
    test('F1: the chosen 2 anchors come from the 3 raw lookup targets', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
        // For lastSpin=15, getLookupRow(15) = {11, 31, 32} (all SET_5).
        const match = d.reason.match(/anchors=\[(\d+),(\d+)\]/);
        expect(match).not.toBeNull();
        const anchors = [parseInt(match[1], 10), parseInt(match[2], 10)];
        for (const a of anchors) {
            expect([11, 31, 32]).toContain(a);
        }
    });

    test('F2: both chosen anchors belong to the ACTIVE side set (SET_5 here)', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        const match = d.reason.match(/anchors=\[(\d+),(\d+)\]/);
        const anchors = [parseInt(match[1], 10), parseInt(match[2], 10)];
        for (const a of anchors) expect(T1_SET_5.has(a)).toBe(true);
    });

    test('F3: both chosen anchors appear in the final bet set (priority=0)', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        const match = d.reason.match(/anchors=\[(\d+),(\d+)\]/);
        const anchors = [parseInt(match[1], 10), parseInt(match[2], 10)];
        for (const a of anchors) expect(d.numbers).toContain(a);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  G. Engine model flow — does NOT bypass the model
// ═══════════════════════════════════════════════════════════════════
describe('G. Engine model integration', () => {
    test('G1: _scorePair is called at least once on surviving candidates', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(eng._calls.scorePair.length).toBeGreaterThan(0);
    });

    test('G2: _computeConfidence is called exactly once (on the final 12 numbers)', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(eng._calls.computeConfidence.length).toBe(1);
        expect(eng._calls.computeConfidence[0].count).toBe(T1_BET_SIZE);
        expect(d.confidence).toBe(70); // default mock return
    });

    test('G3: SKIP below confidence threshold (model-driven, not hardcoded)', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev' },
            t3: t3Map('prev'),
            confidence: () => 30
        });
        eng.confidenceThreshold = 55;
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('SKIP');
        expect(d.reason).toMatch(/Low confidence/);
    });

    test('G4: BET respected when confidence meets threshold', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev' },
            t3: t3Map('prev'),
            confidence: () => 55
        });
        eng.confidenceThreshold = 55;
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
        expect(d.confidence).toBe(55);
    });

    test('G5: force-bet after maxConsecutiveSkips even below threshold', () => {
        const eng = makeMockEngine({
            t2: { dataPair: 'prev' },
            t3: t3Map('prev'),
            confidence: () => 30
        });
        eng.confidenceThreshold = 55;
        eng.maxConsecutiveSkips = 3;
        eng.session.consecutiveSkips = 3; // hit the floor
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
    });

    test('G6: engine._currentDecisionSpins is cleared on both paths', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(eng._currentDecisionSpins).toBeNull();

        const eng2 = makeMockEngine({ t2: null, t3: new Map() });
        decideT1Strategy(eng2, [10, 10, 10, 10], 3);
        expect(eng2._currentDecisionSpins).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════
//  H. Decision shape compatibility with the runner
// ═══════════════════════════════════════════════════════════════════
describe('H. Decision shape matches AutoTestRunner._simulateDecision', () => {
    test('H1: SKIP shape has all required keys', () => {
        const eng = makeMockEngine();
        const d = decideT1Strategy(eng, [10, 10, 10, 10], 3);
        for (const k of ['action', 'selectedPair', 'selectedFilter', 'numbers', 'confidence', 'reason']) {
            expect(d).toHaveProperty(k);
        }
        expect(d.action).toBe('SKIP');
        expect(d.selectedPair).toBeNull();
        expect(d.selectedFilter).toBeNull();
        expect(d.numbers).toEqual([]);
        expect(d.confidence).toBe(0);
        expect(typeof d.reason).toBe('string');
    });

    test('H2: BET shape has all required keys with sensible types', () => {
        const eng = makeMockEngine({ t2: { dataPair: 'prev' }, t3: t3Map('prev') });
        const d = decideT1Strategy(eng, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('BET');
        expect(typeof d.selectedPair).toBe('string');
        expect(typeof d.selectedFilter).toBe('string');
        expect(Array.isArray(d.numbers)).toBe(true);
        expect(typeof d.confidence).toBe('number');
        expect(typeof d.reason).toBe('string');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  I. Input-validation safety
// ═══════════════════════════════════════════════════════════════════
describe('I. Defensive input handling', () => {
    test('I1: null engine → SKIP', () => {
        const d = decideT1Strategy(null, SPIN_HISTORY_SET5, IDX_SET5);
        expect(d.action).toBe('SKIP');
    });

    test('I2: non-array spins → SKIP', () => {
        const eng = makeMockEngine();
        expect(decideT1Strategy(eng, null, 4).action).toBe('SKIP');
        expect(decideT1Strategy(eng, 'oops', 4).action).toBe('SKIP');
    });

    test('I3: idx < 3 → SKIP', () => {
        const eng = makeMockEngine();
        expect(decideT1Strategy(eng, [1, 2, 3], 2).action).toBe('SKIP');
    });

    test('I4: idx out of range → SKIP', () => {
        const eng = makeMockEngine();
        expect(decideT1Strategy(eng, [1, 2, 3, 4, 5], 100).action).toBe('SKIP');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  J. _t1TrimToSize unit tests
// ═══════════════════════════════════════════════════════════════════
describe('J. _t1TrimToSize deterministic prioritisation', () => {
    test('J1: returns null when input cannot reach size', () => {
        expect(_t1TrimToSize([1, 2, 3], [1], T1_SET_5, 12)).toBeNull();
    });

    test('J2: anchors always appear first', () => {
        const all = [1, 2, 11, 31, 32, 33, 34, 35, 36, 5, 7, 24, 28];
        const out = _t1TrimToSize(all, [11, 31], T1_SET_5, 12);
        expect(out).not.toBeNull();
        expect(out.slice(0, 2).sort((a, b) => a - b)).toEqual([11, 31]);
    });

    test('J3: output length equals requested size', () => {
        const all = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        const out = _t1TrimToSize(all, [11], T1_SET_5, 12);
        expect(out.length).toBe(12);
    });

    test('J4: ordering is deterministic across calls', () => {
        const all = [34, 13, 30, 10, 11, 31, 32, 7, 28, 5, 24, 14, 17];
        const a = _t1TrimToSize(all, [11, 31], T1_SET_5, 12);
        const b = _t1TrimToSize(all, [11, 31], T1_SET_5, 12);
        expect(a).toEqual(b);
    });
});
