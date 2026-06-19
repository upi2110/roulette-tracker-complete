const sig = require('../../strategies/strategy-analyser/signals/cross-table-conv');

// Build a 3-row snapshot. T1/T2 rows take perPair-per-row arrays;
// T3 same. nextProjections is shared across all rows for simplicity.
function _mkSnap({ t1Rows, t2Rows, t3Rows, t3Proj }) {
    return {
        table1: { rows: t1Rows.map(p => ({ perPair: p })) },
        table2: { rows: t2Rows.map(p => ({ perPair: p })) },
        table3: { rows: t3Rows.map(p => ({ perPair: p })), nextProjections: t3Proj }
    };
}

// Helper: a row with hits on the listed slots (and oppHits empty).
function _h(slots) {
    return {
        hits: {
            first:  slots.includes('first'),
            second: slots.includes('second'),
            third:  slots.includes('third')
        },
        oppHits: {}
    };
}
// Helper: a row with oppHits on the listed slots.
function _o(slots) {
    return {
        hits: {},
        oppHits: {
            first:  slots.includes('first'),
            second: slots.includes('second'),
            third:  slots.includes('third')
        }
    };
}
// T3 row: hitAnchor true on the chosen side.
function _t3golden(side) {
    return {
        hitAnchor: true,
        hitSameSide: side === 'same',
        hitOppSide:  side === 'opp'
    };
}
function _t3miss() { return { hitAnchor: false, hitSameSide: false, hitOppSide: false }; }

describe('cross-table-conv — user spec (T1 cluster ∧ T2 cluster ∧ T3 golden)', () => {

    test('FIRES /same when T1 + T2 cluster on 2 of 3 over 3 rows AND T3 has 2 golden anchor hits', () => {
        const out = sig.evaluate(_mkSnap({
            t1Rows: [
                { prev: _h(['first',  'second']) },
                { prev: _h(['second', 'first']) },
                { prev: _h(['first']) }                  // cluster on {first, second}
            ],
            t2Rows: [
                { prev: _h(['second', 'third']) },
                { prev: _h(['third']) },
                { prev: _h(['second', 'third']) }        // cluster on {second, third}
            ],
            t3Rows: [
                { prev: _t3golden('same') },
                { prev: _t3miss() },
                { prev: _t3golden('same') }              // 2/3 golden on same side
            ],
            t3Proj: { prev: { numbers: [7,14,21], sameSide: [7,14], oppSide: [21] } }
        }));
        const fired = out.find(s => s.name === 'cross-table-conv/prev/same');
        expect(fired).toBeDefined();
        expect(Array.from(fired.candidates)).toEqual([7,14]);     // SAME-side pool
        expect(fired.weight).toBe(1.20);
        expect(out.find(s => s.name.endsWith('/opp'))).toBeUndefined();
    });

    test('DOES NOT FIRE when T1 cluster is 3-of-3 (not a cluster)', () => {
        const out = sig.evaluate(_mkSnap({
            t1Rows: [
                { prev: _h(['first', 'second', 'third']) },
                { prev: _h(['first', 'second', 'third']) },
                { prev: _h(['first', 'second', 'third']) }
            ],
            t2Rows: [
                { prev: _h(['first', 'second']) },
                { prev: _h(['first']) },
                { prev: _h(['second']) }
            ],
            t3Rows: [
                { prev: _t3golden('same') },
                { prev: _t3golden('same') },
                { prev: _t3golden('same') }
            ],
            t3Proj: { prev: { numbers: [7], sameSide: [7], oppSide: [] } }
        }));
        expect(out.length).toBe(0);
    });

    test('DOES NOT FIRE when T2 streak breaks (a row had no hits)', () => {
        const out = sig.evaluate(_mkSnap({
            t1Rows: [
                { prev: _h(['first', 'second']) },
                { prev: _h(['first']) },
                { prev: _h(['second']) }
            ],
            t2Rows: [
                { prev: _h(['first']) },
                { prev: _h([]) },                        // miss → breaks streak
                { prev: _h(['second']) }
            ],
            t3Rows: [
                { prev: _t3golden('same') },
                { prev: _t3golden('same') },
                { prev: _t3golden('same') }
            ],
            t3Proj: { prev: { numbers: [7], sameSide: [7], oppSide: [] } }
        }));
        expect(out.length).toBe(0);
    });

    test('DOES NOT FIRE when T3 only has 1 golden hit (need >= 2 of last 3)', () => {
        const out = sig.evaluate(_mkSnap({
            t1Rows: [
                { prev: _h(['first', 'second']) },
                { prev: _h(['first']) },
                { prev: _h(['second']) }
            ],
            t2Rows: [
                { prev: _h(['first', 'second']) },
                { prev: _h(['first']) },
                { prev: _h(['second']) }
            ],
            t3Rows: [
                { prev: _t3miss() },
                { prev: _t3miss() },
                { prev: _t3golden('same') }              // only 1/3 golden
            ],
            t3Proj: { prev: { numbers: [7], sameSide: [7], oppSide: [] } }
        }));
        expect(out.length).toBe(0);
    });

    test('DOES NOT FIRE on the OLD bug input (single-spin mixed sides)', () => {
        // T1 hits same-side first only on the LAST row; T2 hits opp;
        // T3 has 1 golden hit. Old code would have fired with weight
        // 1.20 calling it confluence. New code: nothing fires.
        const out = sig.evaluate(_mkSnap({
            t1Rows: [
                { prev: _h([]) },
                { prev: _h([]) },
                { prev: _h(['first']) }
            ],
            t2Rows: [
                { prev: _o([]) },
                { prev: _o([]) },
                { prev: _o(['first']) }
            ],
            t3Rows: [
                { prev: _t3miss() },
                { prev: _t3miss() },
                { prev: _t3golden('same') }
            ],
            t3Proj: { prev: { numbers: [7], sameSide: [7], oppSide: [3] } }
        }));
        expect(out.length).toBe(0);
    });

    test('FIRES /opp when the pattern is on the opp side', () => {
        const out = sig.evaluate(_mkSnap({
            t1Rows: [
                { prev: _o(['first', 'second']) },
                { prev: _o(['first']) },
                { prev: _o(['second']) }
            ],
            t2Rows: [
                { prev: _o(['second', 'third']) },
                { prev: _o(['third']) },
                { prev: _o(['second']) }
            ],
            t3Rows: [
                { prev: _t3golden('opp') },
                { prev: _t3miss() },
                { prev: _t3golden('opp') }
            ],
            t3Proj: { prev: { numbers: [7,14,21], sameSide: [7,14], oppSide: [21] } }
        }));
        const fired = out.find(s => s.name === 'cross-table-conv/prev/opp');
        expect(fired).toBeDefined();
        expect(Array.from(fired.candidates)).toEqual([21]);       // OPP-side pool
    });
});
