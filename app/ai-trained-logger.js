/**
 * app/ai-trained-logger.js
 *
 * Pure aggregation helper for AI-trained step logs.
 *
 * Given an array of Auto Test / replay steps (each optionally carrying
 * a `step.aiTrained` envelope produced by AITrainedController), produce
 * a deterministic per-session summary usable by the runner, the
 * result-testing panel, and the comparison / xlsx reports.
 *
 * Contract:
 *   - Pure. No DOM, no globals, no side effects.
 *   - Steps without `step.aiTrained` are ignored (legacy compatibility).
 *   - Steps with malformed `aiTrained` contribute to `spinsSeen` only.
 *   - Never throws on undefined/null/[] inputs.
 */
(function (globalRef) {
    'use strict';

    const PHASES = Object.freeze([
        'WARMUP', 'SHADOW', 'EARLY', 'STABILISING', 'ACTIVE', 'RECOVERY', 'PROTECTION'
    ]);
    const ACTIONS = Object.freeze([
        'WAIT', 'BET', 'SHADOW_PREDICT', 'RETRAIN', 'PROTECTION', 'TERMINATE_SESSION'
    ]);

    function _emptyCounters(keys) {
        const o = {};
        keys.forEach(k => { o[k] = 0; });
        return o;
    }

    function _safeRate(num, den) {
        if (!den || den <= 0) return 0;
        const r = num / den;
        if (!Number.isFinite(r)) return 0;
        return Math.max(0, Math.min(1, r));
    }

    function _isPlainObject(x) {
        return x && typeof x === 'object' && !Array.isArray(x);
    }

    /**
     * Aggregate an Auto Test / replay step log into an AI-trained summary.
     *
     * @param {Array<object>} steps
     * @returns {{
     *   spinsSeen: number,
     *   aiTrainedSpins: number,
     *   decisions: Record<string, number>,
     *   phases: Record<string, number>,
     *   bets: number, betHits: number, betMisses: number, betHitRate: number,
     *   shadowsSeen: number, shadowsHit: number, shadowHitRate: number,
     *   protectionEntries: Array<{idx:number, reason:string, cooldown:number}>,
     *   retrainEvents: Array<{idx:number, lossStreak:number}>,
     *   terminated: boolean,
     *   firstSpinIdx: number|null,
     *   lastSpinIdx: number|null
     * }}
     */
    function aggregateAITrainedSteps(steps) {
        const arr = Array.isArray(steps) ? steps : [];
        const summary = {
            spinsSeen: 0,
            aiTrainedSpins: 0,
            decisions: _emptyCounters(ACTIONS),
            phases: _emptyCounters(PHASES),
            bets: 0,
            betHits: 0,
            betMisses: 0,
            betHitRate: 0,
            shadowsSeen: 0,
            shadowsHit: 0,
            shadowHitRate: 0,
            protectionEntries: [],
            retrainEvents: [],
            terminated: false,
            firstSpinIdx: null,
            lastSpinIdx: null
        };

        // Track contiguous protection runs to emit one entry per entry.
        let inProtectionRun = false;
        let lastRetrainIdxSeen = null;

        for (let i = 0; i < arr.length; i++) {
            const step = arr[i] || {};
            summary.spinsSeen++;

            const ai = step.aiTrained;
            if (!_isPlainObject(ai)) continue;
            summary.aiTrainedSpins++;

            const idx = (typeof step.spinIdx === 'number') ? step.spinIdx
                       : (ai.diagnostics && typeof ai.diagnostics.spinIndex === 'number')
                         ? ai.diagnostics.spinIndex
                         : i;
            if (summary.firstSpinIdx === null) summary.firstSpinIdx = idx;
            summary.lastSpinIdx = idx;

            // Action / phase tallies.
            if (typeof ai.action === 'string' && Object.prototype.hasOwnProperty.call(summary.decisions, ai.action)) {
                summary.decisions[ai.action]++;
            }
            if (typeof ai.phase === 'string' && Object.prototype.hasOwnProperty.call(summary.phases, ai.phase)) {
                summary.phases[ai.phase]++;
            }

            // BET outcome rollup. Prefer the step-level hit flag (authoritative
            // from the runner); fall back to ai.betHit if present.
            if (ai.action === 'BET') {
                summary.bets++;
                const hit = (typeof step.hit === 'boolean') ? step.hit
                           : (typeof ai.betHit === 'boolean') ? ai.betHit
                           : false;
                if (hit) summary.betHits++; else summary.betMisses++;
            }

            // Shadow outcome rollup — shadowHit is written back by the
            // feedback loop after the next spin arrives.
            if (ai.action === 'SHADOW_PREDICT') {
                summary.shadowsSeen++;
                if (ai.shadowHit === true) summary.shadowsHit++;
            }

            // PROTECTION: count entries (leading edge of a contiguous run).
            if (ai.action === 'PROTECTION') {
                if (!inProtectionRun) {
                    const reason = (ai.diagnostics && ai.diagnostics.lossStreak != null)
                        ? `loss-streak=${ai.diagnostics.lossStreak}`
                        : (ai.reason || 'unspecified');
                    const cooldown = (ai.diagnostics && typeof ai.diagnostics.protectionCooldown === 'number')
                        ? ai.diagnostics.protectionCooldown
                        : null;
                    summary.protectionEntries.push({
                        idx,
                        reason: String(reason),
                        cooldown: cooldown == null ? 0 : cooldown
                    });
                    inProtectionRun = true;
                }
            } else {
                inProtectionRun = false;
            }

            // RETRAIN: one event per emission (dedupe consecutive same-idx).
            if (ai.action === 'RETRAIN' && idx !== lastRetrainIdxSeen) {
                const lossStreak = (ai.diagnostics && typeof ai.diagnostics.lossStreak === 'number')
                    ? ai.diagnostics.lossStreak
                    : 0;
                summary.retrainEvents.push({ idx, lossStreak });
                lastRetrainIdxSeen = idx;
            }

            // TERMINATE: sticky once observed.
            if (ai.action === 'TERMINATE_SESSION') {
                summary.terminated = true;
            }
        }

        summary.betHitRate = _safeRate(summary.betHits, summary.bets);
        summary.shadowHitRate = _safeRate(summary.shadowsHit, summary.shadowsSeen);
        return summary;
    }

    const api = { aggregateAITrainedSteps, PHASES, ACTIONS };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.aggregateAITrainedSteps = aggregateAITrainedSteps;
        globalRef.AITrainedLoggerAPI = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
