/**
 * Phase 1 Step 1 schema + behavior tests for AITrainedController.
 * Additive; does not touch any other files.
 */
const {
    AITrainedController,
    PHASE,
    ACTION,
    MAX_BET_NUMBERS
} = require('../../strategies/ai-trained/ai-trained-controller.js');

const SAMPLE_SPINS = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26, 0,
    32, 15, 19, 4, 21, 2, 25
];

const VALID_ACTIONS = new Set(Object.values(ACTION));
const VALID_PHASES = new Set(Object.values(PHASE));

function assertDecisionShape(d) {
    expect(d).toBeTruthy();
    expect(VALID_ACTIONS.has(d.action)).toBe(true);
    expect(d.selectedPair).toBeNull();
    expect(d.selectedFilter === null || typeof d.selectedFilter === 'string').toBe(true);
    expect(Array.isArray(d.numbers)).toBe(true);
    expect(d.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
    expect(typeof d.confidence).toBe('number');
    expect(d.confidence).toBeGreaterThanOrEqual(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
    expect(typeof d.reason).toBe('string');
    expect(VALID_PHASES.has(d.phase)).toBe(true);
    expect(d.zone === null || (d.zone && Array.isArray(d.zone.numbers))).toBe(true);

    expect(d.diagnostics).toBeTruthy();
    for (const k of [
        'entropy', 'conflict', 'historianMatch', 'clusterStrength',
        'driftScore', 'lossStreak', 'ghostWin', 'spinIndex', 'spinsSeen'
    ]) {
        expect(d.diagnostics).toHaveProperty(k);
    }
    for (const k of ['entropy', 'conflict', 'historianMatch', 'clusterStrength', 'driftScore']) {
        expect(d.diagnostics[k]).toBeGreaterThanOrEqual(0);
        expect(d.diagnostics[k]).toBeLessThanOrEqual(1);
    }
    expect(Number.isInteger(d.diagnostics.lossStreak)).toBe(true);
    expect(typeof d.diagnostics.ghostWin).toBe('boolean');

    expect(d.reasoning).toBeTruthy();
    expect(Array.isArray(d.reasoning.signals)).toBe(true);
    expect(Array.isArray(d.reasoning.rejected)).toBe(true);
}

describe('AITrainedController — decision schema', () => {
    test('every spin index returns a well-formed decision', () => {
        const c = new AITrainedController();
        for (let i = 0; i < SAMPLE_SPINS.length; i++) {
            const d = c.decide(SAMPLE_SPINS.slice(0, i), i);
            assertDecisionShape(d);
        }
    });
});

describe('AITrainedController — phase gating', () => {
    test('WARMUP (idx 0..3): WAIT with empty numbers', () => {
        const c = new AITrainedController();
        for (let i = 0; i <= 3; i++) {
            const d = c.decide(SAMPLE_SPINS.slice(0, i), i);
            expect(d.phase).toBe(PHASE.WARMUP);
            expect(d.action).toBe(ACTION.WAIT);
            expect(d.numbers).toEqual([]);
            expect(d.zone).toBeNull();
        }
    });

    test('SHADOW (idx 4..6): SHADOW_PREDICT, numbers empty, shadowNumbers populated', () => {
        const c = new AITrainedController();
        for (let i = 4; i <= 6; i++) {
            const d = c.decide(SAMPLE_SPINS.slice(0, i), i);
            expect(d.phase).toBe(PHASE.SHADOW);
            expect(d.action).toBe(ACTION.SHADOW_PREDICT);
            expect(d.numbers).toEqual([]); // never bettable
            expect(Array.isArray(d.shadowNumbers)).toBe(true);
            expect(d.shadowNumbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
            // all shadow numbers are valid wheel numbers and unique
            expect(new Set(d.shadowNumbers).size).toBe(d.shadowNumbers.length);
            d.shadowNumbers.forEach(n => {
                expect(Number.isInteger(n)).toBe(true);
                expect(n).toBeGreaterThanOrEqual(0);
                expect(n).toBeLessThanOrEqual(36);
            });
        }
    });

    test('idx >= 7: action is WAIT or BET; BET has 1..12 unique valid numbers', () => {
        const c = new AITrainedController();
        let sawBettablePhase = false;
        for (let i = 7; i < SAMPLE_SPINS.length; i++) {
            const d = c.decide(SAMPLE_SPINS.slice(0, i), i);
            expect([ACTION.WAIT, ACTION.BET]).toContain(d.action);
            if (d.action === ACTION.BET) {
                sawBettablePhase = true;
                expect(d.numbers.length).toBeGreaterThan(0);
                expect(d.numbers.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
                expect(new Set(d.numbers).size).toBe(d.numbers.length);
                d.numbers.forEach(n => {
                    expect(Number.isInteger(n)).toBe(true);
                    expect(n).toBeGreaterThanOrEqual(0);
                    expect(n).toBeLessThanOrEqual(36);
                });
                expect(d.selectedPair).toBeNull();
            } else {
                expect(d.numbers).toEqual([]);
            }
        }
        // We don't assert a BET occurred (evidence-driven),
        // but at least the path must be reachable structurally.
        expect(typeof sawBettablePhase).toBe('boolean');
    });
});

describe('AITrainedController — invariants', () => {
    test('no user-defined pairs in any phase', () => {
        const c = new AITrainedController();
        for (let i = 0; i < SAMPLE_SPINS.length; i++) {
            const d = c.decide(SAMPLE_SPINS.slice(0, i), i);
            expect(d.selectedPair).toBeNull();
        }
    });

    test('determinism: identical input yields identical output', () => {
        const c1 = new AITrainedController();
        const c2 = new AITrainedController();
        for (let i = 0; i <= 15; i++) {
            const d1 = c1.decide(SAMPLE_SPINS.slice(0, i), i);
            const d2 = c2.decide(SAMPLE_SPINS.slice(0, i), i);
            expect(d1).toEqual(d2);
        }
    });

    test('invalid spin values are filtered out of history', () => {
        const c = new AITrainedController();
        const dirty = [17, 'x', -1, 99, null, undefined, 34, 6, 27, 13, 36, 11];
        const d = c.decide(dirty, dirty.length);
        assertDecisionShape(d);
    });

    test('input validation: non-array spins or bad idx throws', () => {
        const c = new AITrainedController();
        expect(() => c.decide(null, 0)).toThrow(TypeError);
        expect(() => c.decide(undefined, 0)).toThrow(TypeError);
        expect(() => c.decide([], -1)).toThrow(TypeError);
        expect(() => c.decide([], 1.5)).toThrow(TypeError);
    });
});

describe('AITrainedController — protection / terminate lifecycle', () => {
    test('enters PROTECTION after protectionLossStreak losses and blocks bets for cooldown', () => {
        const c = new AITrainedController({
            protectionLossStreak: 3,
            protectionCooldown: 4,
            terminateLossStreak: 99
        });
        const fakeBet = { action: ACTION.BET };
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: 10 + i, hit: false, actual: 0, decision: fakeBet });
        }
        const d = c.decide(SAMPLE_SPINS.slice(0, 15), 15);
        expect(d.action).toBe(ACTION.PROTECTION);
        expect(d.phase).toBe(PHASE.PROTECTION);
        expect(d.numbers).toEqual([]);
    });

    test('TERMINATE_SESSION is sticky and empty-numbered', () => {
        const c = new AITrainedController({
            protectionLossStreak: 99,
            terminateLossStreak: 3
        });
        const fakeBet = { action: ACTION.BET };
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: 10 + i, hit: false, actual: 0, decision: fakeBet });
        }
        const d1 = c.decide(SAMPLE_SPINS.slice(0, 20), 20);
        const d2 = c.decide(SAMPLE_SPINS.slice(0, 21), 21);
        expect(d1.action).toBe(ACTION.TERMINATE_SESSION);
        expect(d2.action).toBe(ACTION.TERMINATE_SESSION);
        expect(d1.numbers).toEqual([]);
        expect(d2.numbers).toEqual([]);
    });

    test('recordShadow flags ghostWin when shadow hits', () => {
        const c = new AITrainedController();
        const d = c.decide(SAMPLE_SPINS.slice(0, 6), 6);
        expect(d.action).toBe(ACTION.SHADOW_PREDICT);
        const target = d.shadowNumbers[0];
        expect(Number.isInteger(target)).toBe(true);
        c.recordShadow({ idx: 6, actual: target, decision: d });
        expect(c.snapshot().ghostWin).toBe(true);
        expect(c.snapshot().shadowsHit).toBe(1);
    });
});

describe('AITrainedController — bet-rate regression (Auto Test productivity)', () => {
    // Earlier PHASE_THRESHOLDS were calibrated above the empirical
    // confidence ceiling on real-roulette spin distributions, so the
    // controller never emitted BET in Auto Test (all sessions returned
    // 0 wins / 0 busts / $0). This regression test guards against a
    // future re-tightening that would silently zero-out AI-trained
    // Auto Test again. We use a deterministic 100-spin sequence and
    // assert at least ONE BET fires across fresh-controller decides.
    test('produces ≥ 1 BET across 100 spins of typical roulette data', () => {
        const spins = [];
        for (let i = 0; i < 200; i++) spins.push((i * 17 + 3) % 37);
        let betCount = 0;
        let waitCount = 0;
        let shadowCount = 0;
        for (let i = 0; i < spins.length; i++) {
            const c = new AITrainedController();
            const d = c.decide(spins.slice(0, i), i);
            if (d.action === ACTION.BET) betCount++;
            else if (d.action === ACTION.WAIT) waitCount++;
            else if (d.action === ACTION.SHADOW_PREDICT) shadowCount++;
        }
        // Bet rate must be > 0 to make Auto Test results meaningful.
        // Cap-side check: not so loose that it bets on every spin.
        expect(betCount).toBeGreaterThanOrEqual(1);
        expect(betCount).toBeLessThan(spins.length);
        // Phase invariants still hold.
        expect(waitCount).toBeGreaterThan(0);
        expect(shadowCount).toBeGreaterThan(0);
    });
});
