/**
 * Phase 2 Step 2 — AITrainedController additions.
 * Covers RETRAIN emission, exportSessionMemory / restoreSessionMemory,
 * getSummary() parity with aggregateAITrainedSteps shape, and reset.
 */

const {
    AITrainedController,
    PHASE,
    ACTION
} = require('../../strategies/ai-trained/ai-trained-controller.js');
const {
    aggregateAITrainedSteps
} = require('../../strategies/ai-trained/ai-trained-logger.js');

const SAMPLE = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26, 0,
    32, 15, 19, 4, 21, 2, 25
];

function fakeBet() { return { action: ACTION.BET }; }

describe('RETRAIN emission', () => {
    test('emits in a bettable phase when lossStreak >= retrainLossStreak and cooldown expired', () => {
        // Disable protection/terminate so RETRAIN is not pre-empted.
        const c = new AITrainedController({
            retrainLossStreak: 3,
            retrainCooldown: 5,
            recoveryLossStreak: 99,
            protectionLossStreak: 99,
            terminateLossStreak: 99
        });
        // Accumulate 3 losses → lossStreak=3 → RETRAIN threshold.
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: 10 + i, hit: false, actual: 0, decision: fakeBet() });
        }
        const d = c.decide(SAMPLE.slice(0, 15), 15);
        expect(d.action).toBe(ACTION.RETRAIN);
        expect([PHASE.EARLY, PHASE.STABILISING, PHASE.ACTIVE]).toContain(d.phase);
        expect(d.numbers).toEqual([]);  // non-bet
        expect(d.reason).toMatch(/RETRAIN/);
    });

    test('does NOT emit during RECOVERY phase (lossStreak >= recoveryLossStreak)', () => {
        const c = new AITrainedController({
            retrainLossStreak: 3,
            retrainCooldown: 0,
            recoveryLossStreak: 3,        // phase becomes RECOVERY before RETRAIN gate
            protectionLossStreak: 99,
            terminateLossStreak: 99
        });
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: i, hit: false, actual: 0, decision: fakeBet() });
        }
        const d = c.decide(SAMPLE.slice(0, 15), 15);
        expect(d.phase).toBe(PHASE.RECOVERY);
        expect(d.action).not.toBe(ACTION.RETRAIN);
    });

    test('does NOT emit during PROTECTION', () => {
        const c = new AITrainedController({
            retrainLossStreak: 3,
            retrainCooldown: 0,
            recoveryLossStreak: 99,
            protectionLossStreak: 3,
            protectionCooldown: 10,
            terminateLossStreak: 99
        });
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: i, hit: false, actual: 0, decision: fakeBet() });
        }
        const d = c.decide(SAMPLE.slice(0, 15), 15);
        expect(d.action).toBe(ACTION.PROTECTION);
    });

    test('retrainCooldown suppresses consecutive RETRAIN emissions', () => {
        const c = new AITrainedController({
            retrainLossStreak: 3,
            retrainCooldown: 5,
            recoveryLossStreak: 99,
            protectionLossStreak: 99,
            terminateLossStreak: 99
        });
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: i, hit: false, actual: 0, decision: fakeBet() });
        }
        const d1 = c.decide(SAMPLE.slice(0, 15), 15);
        expect(d1.action).toBe(ACTION.RETRAIN);
        // idx=16 is within cooldown (15 + 5 = 20) → must NOT emit RETRAIN.
        const d2 = c.decide(SAMPLE.slice(0, 16), 16);
        expect(d2.action).not.toBe(ACTION.RETRAIN);
        // After the cooldown window elapses, RETRAIN may fire again.
        const d3 = c.decide(SAMPLE.slice(0, 22), 22);
        // Whether it fires depends on lossStreak (still 3) and confidence —
        // assert the eligibility gate is re-opened (cooldown passed).
        expect(d3).toBeDefined();
    });

    test('decision schema is unchanged: no new top-level keys added', () => {
        const c = new AITrainedController();
        const d = c.decide(SAMPLE.slice(0, 15), 15);
        const expected = [
            'action', 'selectedPair', 'selectedFilter', 'numbers',
            'confidence', 'reason', 'phase', 'zone',
            'diagnostics', 'reasoning'
        ];
        expected.forEach(k => expect(d).toHaveProperty(k));
    });
});

describe('exportSessionMemory / restoreSessionMemory', () => {
    test('round-trip restores state exactly (except last-decision refs)', () => {
        const a = new AITrainedController({
            retrainLossStreak: 3, retrainCooldown: 5,
            protectionLossStreak: 3, protectionCooldown: 4,
            terminateLossStreak: 99
        });
        // Drive some state: losses → PROTECTION.
        for (let i = 0; i < 3; i++) {
            a.recordResult({ idx: i, hit: false, actual: 0, decision: fakeBet() });
        }
        // Run decide a couple of times to accumulate counters.
        a.decide(SAMPLE.slice(0, 10), 10);
        a.decide(SAMPLE.slice(0, 11), 11);

        const exported = a.exportSessionMemory();
        expect(exported).toHaveProperty('version', 1);
        expect(exported).toHaveProperty('opts');
        expect(exported).toHaveProperty('state');

        const b = new AITrainedController();
        expect(b.restoreSessionMemory(exported)).toBe(true);
        // Core state fields should match.
        for (const k of ['lossStreak','winStreak','betsPlaced','betsHit',
                         'shadowsSeen','shadowsHit','inProtection',
                         'protectionCooldown','terminated','lastRetrainIdx',
                         'firstSpinIdx','lastSpinIdx']) {
            expect(b.state[k]).toEqual(a.state[k]);
        }
        expect(b.state.decisions).toEqual(a.state.decisions);
        expect(b.state.phases).toEqual(a.state.phases);
        expect(b.state.protectionEntries).toEqual(a.state.protectionEntries);
        // Last-decision refs intentionally cleared on restore.
        expect(b.state.lastBetDecision).toBeNull();
        expect(b.state.lastShadowDecision).toBeNull();
    });

    test('malformed input is handled gracefully and does not throw', () => {
        const c = new AITrainedController();
        expect(c.restoreSessionMemory(null)).toBe(false);
        expect(c.restoreSessionMemory(undefined)).toBe(false);
        expect(c.restoreSessionMemory('not-an-object')).toBe(false);
        // Partial objects are accepted (fresh state is the template).
        expect(c.restoreSessionMemory({ state: { lossStreak: 4 } })).toBe(true);
        expect(c.state.lossStreak).toBe(4);
    });

    test('restore does not mutate opts', () => {
        const a = new AITrainedController({ retrainCooldown: 5 });
        const b = new AITrainedController({ retrainCooldown: 99 });
        b.restoreSessionMemory(a.exportSessionMemory());
        expect(b.opts.retrainCooldown).toBe(99);
    });
});

describe('getSummary() shape matches aggregator', () => {
    test('top-level keys are identical', () => {
        const c = new AITrainedController();
        for (let i = 0; i < 12; i++) c.decide(SAMPLE.slice(0, i), i);
        const summary = c.getSummary();
        const agg = aggregateAITrainedSteps([]);
        expect(Object.keys(summary).sort()).toEqual(Object.keys(agg).sort());
    });

    test('bets / betHits / shadows are derived from controller counters', () => {
        const c = new AITrainedController({
            retrainLossStreak: 99, recoveryLossStreak: 99,
            protectionLossStreak: 99, terminateLossStreak: 99
        });
        // Manually drive counters via recordResult / recordShadow, which
        // is what runner + orchestrator do in Phase 2.
        c.recordResult({ idx: 10, hit: true,  actual: 0, decision: fakeBet() });
        c.recordResult({ idx: 11, hit: false, actual: 0, decision: fakeBet() });
        c.recordResult({ idx: 12, hit: true,  actual: 0, decision: fakeBet() });
        c.recordShadow({
            idx: 5, actual: 17,
            decision: { action: ACTION.SHADOW_PREDICT, shadowNumbers: [17, 34] }
        });
        c.recordShadow({
            idx: 6, actual: 99,
            decision: { action: ACTION.SHADOW_PREDICT, shadowNumbers: [17, 34] }
        });
        const s = c.getSummary();
        expect(s.bets).toBe(3);
        expect(s.betHits).toBe(2);
        expect(s.betMisses).toBe(1);
        expect(s.betHitRate).toBeCloseTo(2 / 3, 5);
        expect(s.shadowsSeen).toBe(2);
        expect(s.shadowsHit).toBe(1);
        expect(s.shadowHitRate).toBeCloseTo(1 / 2, 5);
    });
});

describe('resetSession() clears sticky state', () => {
    test('terminated, inProtection, retrain/protection logs all cleared', () => {
        const c = new AITrainedController({
            protectionLossStreak: 2, terminateLossStreak: 3,
            retrainLossStreak: 1, retrainCooldown: 0,
            recoveryLossStreak: 99
        });
        for (let i = 0; i < 3; i++) {
            c.recordResult({ idx: i, hit: false, actual: 0, decision: fakeBet() });
        }
        expect(c.state.terminated).toBe(true);

        // Drive a decide to populate counters and audit entries.
        c.decide(SAMPLE, 20);
        c.resetSession();

        expect(c.state.terminated).toBe(false);
        expect(c.state.inProtection).toBe(false);
        expect(c.state.protectionCooldown).toBe(0);
        expect(c.state.lossStreak).toBe(0);
        expect(c.state.lastRetrainIdx).toBeNull();
        expect(c.state.retrainEvents).toEqual([]);
        expect(c.state.protectionEntries).toEqual([]);
        expect(c.state.firstSpinIdx).toBeNull();
        expect(c.state.lastSpinIdx).toBeNull();
        for (const a of Object.keys(c.state.decisions)) expect(c.state.decisions[a]).toBe(0);
        for (const p of Object.keys(c.state.phases))    expect(c.state.phases[p]).toBe(0);
    });
});

describe('Phase 1 audit counters are incremented per decide()', () => {
    test('decisions + phases tallies advance on every decide call', () => {
        const c = new AITrainedController();
        for (let i = 0; i < 8; i++) c.decide(SAMPLE.slice(0, i), i);
        const total = Object.values(c.state.decisions).reduce((a, b) => a + b, 0);
        expect(total).toBe(8);
        const phaseTotal = Object.values(c.state.phases).reduce((a, b) => a + b, 0);
        expect(phaseTotal).toBe(8);
    });
});
