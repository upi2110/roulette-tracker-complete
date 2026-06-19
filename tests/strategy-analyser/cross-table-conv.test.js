const sig = require('../../strategies/strategy-analyser/signals/cross-table-conv');

function _mkSnap({ t1, t2, t3, t3Proj }) {
    return {
        table1: { rows: [{ perPair: t1 }] },
        table2: { rows: [{ perPair: t2 }] },
        table3: { rows: [{ perPair: t3 }], nextProjections: t3Proj }
    };
}

describe('cross-table-conv same-side', () => {
    test('FIRES same when all 3 hit same', () => {
        const out = sig.evaluate(_mkSnap({
            t1: { prev: { hits: { first: true }, oppHits: {} } },
            t2: { prev: { hits: { second: true }, oppHits: {} } },
            t3: { prev: { hitSameSide: true, hitOppSide: false } },
            t3Proj: { prev: { numbers: [7,14,21], sameSide: [7,14,21], oppSide: [3,10,17] } }
        }));
        const same = out.find(s => s.name === 'cross-table-conv/prev/same');
        expect(same).toBeDefined();
        expect(Array.from(same.candidates)).toEqual([7,14,21]);
        expect(out.find(s => s.name.endsWith('/opp'))).toBeUndefined();
    });

    test('FIRES opp when all 3 hit opp', () => {
        const out = sig.evaluate(_mkSnap({
            t1: { prev: { hits: {}, oppHits: { first: true } } },
            t2: { prev: { hits: {}, oppHits: { third: true } } },
            t3: { prev: { hitSameSide: false, hitOppSide: true } },
            t3Proj: { prev: { numbers: [7,14,21], sameSide: [7,14,21], oppSide: [3,10,17] } }
        }));
        const opp = out.find(s => s.name === 'cross-table-conv/prev/opp');
        expect(opp).toBeDefined();
        expect(Array.from(opp.candidates)).toEqual([3,10,17]);
    });

    test('DOES NOT FIRE on mixed sides (the bug)', () => {
        const out = sig.evaluate(_mkSnap({
            t1: { prev: { hits: { first: true }, oppHits: {} } },
            t2: { prev: { hits: {}, oppHits: { first: true } } },
            t3: { prev: { hitSameSide: true, hitOppSide: false } },
            t3Proj: { prev: { numbers: [7], sameSide: [7], oppSide: [3] } }
        }));
        expect(out.length).toBe(0);
    });

    test('DOES NOT FIRE when a table misses', () => {
        const out = sig.evaluate(_mkSnap({
            t1: { prev: { hits: { first: true }, oppHits: {} } },
            t2: { prev: { hits: {}, oppHits: {} } },
            t3: { prev: { hitSameSide: true, hitOppSide: false } },
            t3Proj: { prev: { numbers: [7], sameSide: [7], oppSide: [3] } }
        }));
        expect(out.length).toBe(0);
    });
});
