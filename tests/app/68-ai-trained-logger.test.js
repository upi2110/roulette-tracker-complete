/**
 * Phase 2 Step 1 — aggregator helper for AI-trained step logs.
 * Pure function; no DOM / no globals.
 */

const {
    aggregateAITrainedSteps,
    PHASES,
    ACTIONS
} = require('../../app/ai-trained-logger.js');

function baseDiag(overrides) {
    return Object.assign({
        entropy: 0.4, conflict: 0.2, historianMatch: 0.5,
        clusterStrength: 0.5, driftScore: 0.1,
        lossStreak: 0, ghostWin: false,
        spinIndex: 0, spinsSeen: 0
    }, overrides || {});
}

function aiStep({ idx, action, phase, hit, shadowHit, reason, diagnostics }) {
    return {
        spinIdx: idx,
        action: (action === 'BET') ? 'BET' : 'SKIP',
        hit: typeof hit === 'boolean' ? hit : false,
        aiTrained: {
            action, phase,
            selectedPair: null, selectedFilter: null,
            numbers: action === 'BET' ? [1, 2, 3] : [],
            shadowNumbers: action === 'SHADOW_PREDICT' ? [7, 8, 9] : undefined,
            shadowHit: (typeof shadowHit === 'boolean') ? shadowHit : undefined,
            confidence: 0.6,
            reason: reason || '',
            zone: null,
            diagnostics: baseDiag(Object.assign({ spinIndex: idx }, diagnostics || {})),
            reasoning: { signals: [], rejected: [] }
        }
    };
}

describe('shape and empty inputs', () => {
    test('returns a zero-shaped summary for undefined / null / []', () => {
        for (const v of [undefined, null, [], 'x', 42, {}]) {
            const s = aggregateAITrainedSteps(v);
            expect(s).toBeTruthy();
            expect(s.spinsSeen).toBe(Array.isArray(v) ? v.length : 0);
            expect(s.aiTrainedSpins).toBe(0);
            expect(s.bets).toBe(0);
            expect(s.betHits).toBe(0);
            expect(s.shadowsSeen).toBe(0);
            expect(s.shadowHitRate).toBe(0);
            expect(s.betHitRate).toBe(0);
            expect(s.terminated).toBe(false);
            expect(s.protectionEntries).toEqual([]);
            expect(s.retrainEvents).toEqual([]);
            for (const a of ACTIONS) expect(s.decisions[a]).toBe(0);
            for (const p of PHASES) expect(s.phases[p]).toBe(0);
        }
    });

    test('legacy steps without aiTrained do not contribute beyond spinsSeen', () => {
        const steps = [
            { spinIdx: 0, action: 'SKIP', hit: false },
            { spinIdx: 1, action: 'BET', hit: true }
        ];
        const s = aggregateAITrainedSteps(steps);
        expect(s.spinsSeen).toBe(2);
        expect(s.aiTrainedSpins).toBe(0);
        expect(s.bets).toBe(0);  // legacy BET without aiTrained not counted
    });
});

describe('decision / phase tallies', () => {
    test('counts per-action and per-phase occurrences', () => {
        const steps = [
            aiStep({ idx: 0, action: 'WAIT',            phase: 'WARMUP' }),
            aiStep({ idx: 1, action: 'WAIT',            phase: 'WARMUP' }),
            aiStep({ idx: 4, action: 'SHADOW_PREDICT', phase: 'SHADOW', shadowHit: true }),
            aiStep({ idx: 5, action: 'SHADOW_PREDICT', phase: 'SHADOW', shadowHit: false }),
            aiStep({ idx: 8, action: 'BET',            phase: 'EARLY', hit: true }),
            aiStep({ idx: 9, action: 'BET',            phase: 'EARLY', hit: false })
        ];
        const s = aggregateAITrainedSteps(steps);
        expect(s.decisions.WAIT).toBe(2);
        expect(s.decisions.SHADOW_PREDICT).toBe(2);
        expect(s.decisions.BET).toBe(2);
        expect(s.phases.WARMUP).toBe(2);
        expect(s.phases.SHADOW).toBe(2);
        expect(s.phases.EARLY).toBe(2);
    });
});

describe('bet hit rate', () => {
    test('hit rate is bets hits / bets total', () => {
        const steps = [
            aiStep({ idx: 7, action: 'BET', phase: 'EARLY', hit: true }),
            aiStep({ idx: 8, action: 'BET', phase: 'EARLY', hit: true }),
            aiStep({ idx: 9, action: 'BET', phase: 'EARLY', hit: false })
        ];
        const s = aggregateAITrainedSteps(steps);
        expect(s.bets).toBe(3);
        expect(s.betHits).toBe(2);
        expect(s.betMisses).toBe(1);
        expect(s.betHitRate).toBeCloseTo(2 / 3, 5);
    });

    test('zero bets → betHitRate 0 (never NaN / Infinity)', () => {
        const s = aggregateAITrainedSteps([
            aiStep({ idx: 0, action: 'WAIT', phase: 'WARMUP' })
        ]);
        expect(s.betHitRate).toBe(0);
    });
});

describe('shadow outcomes', () => {
    test('shadowsSeen counts every SHADOW_PREDICT; shadowsHit counts shadowHit===true only', () => {
        const steps = [
            aiStep({ idx: 4, action: 'SHADOW_PREDICT', phase: 'SHADOW', shadowHit: true }),
            aiStep({ idx: 5, action: 'SHADOW_PREDICT', phase: 'SHADOW', shadowHit: false }),
            aiStep({ idx: 6, action: 'SHADOW_PREDICT', phase: 'SHADOW' /* undefined */ })
        ];
        const s = aggregateAITrainedSteps(steps);
        expect(s.shadowsSeen).toBe(3);
        expect(s.shadowsHit).toBe(1);
        expect(s.shadowHitRate).toBeCloseTo(1 / 3, 5);
    });
});

describe('protection entries', () => {
    test('one entry per contiguous PROTECTION run', () => {
        const steps = [
            aiStep({ idx: 10, action: 'PROTECTION', phase: 'PROTECTION',
                     diagnostics: { lossStreak: 7, protectionCooldown: 10 } }),
            aiStep({ idx: 11, action: 'PROTECTION', phase: 'PROTECTION',
                     diagnostics: { lossStreak: 7, protectionCooldown: 9 } }),
            aiStep({ idx: 12, action: 'PROTECTION', phase: 'PROTECTION',
                     diagnostics: { lossStreak: 7, protectionCooldown: 8 } }),
            aiStep({ idx: 13, action: 'BET', phase: 'ACTIVE', hit: true }),
            aiStep({ idx: 18, action: 'PROTECTION', phase: 'PROTECTION',
                     diagnostics: { lossStreak: 7, protectionCooldown: 10 } }),
            aiStep({ idx: 19, action: 'PROTECTION', phase: 'PROTECTION',
                     diagnostics: { lossStreak: 7, protectionCooldown: 9 } })
        ];
        const s = aggregateAITrainedSteps(steps);
        expect(s.protectionEntries.length).toBe(2);
        expect(s.protectionEntries[0].idx).toBe(10);
        expect(s.protectionEntries[1].idx).toBe(18);
        expect(s.protectionEntries[0].reason).toContain('loss-streak=7');
    });
});

describe('retrain events', () => {
    test('dedupes consecutive same-idx RETRAIN emissions', () => {
        const steps = [
            aiStep({ idx: 20, action: 'RETRAIN', phase: 'ACTIVE',
                     diagnostics: { lossStreak: 3 } }),
            // Duplicate at the same idx must not double-count.
            aiStep({ idx: 20, action: 'RETRAIN', phase: 'ACTIVE',
                     diagnostics: { lossStreak: 3 } }),
            aiStep({ idx: 25, action: 'BET', phase: 'ACTIVE', hit: true }),
            aiStep({ idx: 30, action: 'RETRAIN', phase: 'ACTIVE',
                     diagnostics: { lossStreak: 3 } })
        ];
        const s = aggregateAITrainedSteps(steps);
        expect(s.retrainEvents.length).toBe(2);
        expect(s.retrainEvents.map(e => e.idx)).toEqual([20, 30]);
        expect(s.retrainEvents[0].lossStreak).toBe(3);
    });
});

describe('terminated flag', () => {
    test('any TERMINATE_SESSION row sets terminated=true', () => {
        const s = aggregateAITrainedSteps([
            aiStep({ idx: 40, action: 'BET', phase: 'ACTIVE', hit: false }),
            aiStep({ idx: 41, action: 'TERMINATE_SESSION', phase: 'PROTECTION' })
        ]);
        expect(s.terminated).toBe(true);
        expect(s.decisions.TERMINATE_SESSION).toBe(1);
    });
});

describe('index bounds', () => {
    test('firstSpinIdx / lastSpinIdx reflect the AI-trained range', () => {
        const s = aggregateAITrainedSteps([
            { spinIdx: 0, action: 'SKIP' /* legacy */ },
            aiStep({ idx: 3, action: 'WAIT', phase: 'WARMUP' }),
            aiStep({ idx: 10, action: 'BET', phase: 'EARLY', hit: true })
        ]);
        expect(s.firstSpinIdx).toBe(3);
        expect(s.lastSpinIdx).toBe(10);
    });
});
