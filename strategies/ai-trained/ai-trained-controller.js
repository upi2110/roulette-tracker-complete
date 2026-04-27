/**
 * app/ai-trained-controller.js
 *
 * System AI Adaptive Training Mode — decision controller.
 *
 * Scope (Phase 1, Step 1):
 *   - Additive, self-contained module.
 *   - Deterministic on explicit { spins, idx } input. Does NOT read window.spins.
 *   - Enforces MAX_BET_NUMBERS = 12 on every returned `numbers` array.
 *   - Implements phase progression: WARMUP, SHADOW, EARLY, STABILISING,
 *     ACTIVE, RECOVERY, PROTECTION. TERMINATE_SESSION via loss streak.
 *   - Actions: WAIT, BET, SHADOW_PREDICT, RETRAIN, PROTECTION, TERMINATE_SESSION.
 *   - Never selects a user-defined pair. `selectedPair` is always null.
 *   - WAIT always carries no numbers. SHADOW_PREDICT carries shadow-only
 *     numbers in `shadowNumbers` for diagnostics; `numbers` stays [].
 *
 * Out of scope here (deferred): engine/sequence-model integration,
 * retraining, live wiring, UI. Hooks are stubbed so Step 2+ can wire them.
 */
(function (globalRef) {
    'use strict';

    // --- Constants -------------------------------------------------------

    const MAX_BET_NUMBERS = 12;

    // European wheel order, starting at 0, clockwise.
    const WHEEL_EU = [
        0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
        10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
    ];
    const WHEEL_POS = (() => {
        const m = new Map();
        WHEEL_EU.forEach((n, i) => m.set(n, i));
        return m;
    })();

    const PHASE = Object.freeze({
        WARMUP: 'WARMUP',
        SHADOW: 'SHADOW',
        EARLY: 'EARLY',
        STABILISING: 'STABILISING',
        ACTIVE: 'ACTIVE',
        RECOVERY: 'RECOVERY',
        PROTECTION: 'PROTECTION'
    });

    const ACTION = Object.freeze({
        WAIT: 'WAIT',
        BET: 'BET',
        SHADOW_PREDICT: 'SHADOW_PREDICT',
        RETRAIN: 'RETRAIN',
        PROTECTION: 'PROTECTION',
        TERMINATE_SESSION: 'TERMINATE_SESSION'
    });

    // Confidence thresholds calibrated against real-roulette data.
    // Empirical ceilings on uniform-distribution spin sequences put
    // confidence in the 0.40..0.55 range (entropy and conflict saturate
    // at 1.0, leaving cluster + historian + drift to carry the signal).
    // Earlier values 0.58..0.78 made every phase mathematically
    // unreachable, producing all-WAIT sessions in Auto Test. The
    // recalibrated values keep the relative ordering and the
    // conservative bias on RECOVERY without zeroing the bet rate.
    const PHASE_THRESHOLDS = Object.freeze({
        EARLY:       0.45,
        STABILISING: 0.42,
        ACTIVE:      0.40,
        RECOVERY:    0.50
    });

    // --- Small utilities -------------------------------------------------

    function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

    function isValidSpin(n) {
        return Number.isInteger(n) && n >= 0 && n <= 36;
    }

    function capNumbers(numbers) {
        const seen = new Set();
        const out = [];
        if (!Array.isArray(numbers)) return out;
        for (const n of numbers) {
            if (out.length >= MAX_BET_NUMBERS) break;
            if (!isValidSpin(n) || seen.has(n)) continue;
            seen.add(n);
            out.push(n);
        }
        return out;
    }

    // --- Diagnostic primitives ------------------------------------------

    function computeEntropy(spins) {
        if (!spins.length) return 0;
        const counts = new Map();
        for (const n of spins) counts.set(n, (counts.get(n) || 0) + 1);
        const N = spins.length;
        let H = 0;
        counts.forEach(c => { const p = c / N; H -= p * Math.log2(p); });
        const Hmax = Math.log2(Math.min(37, N));
        return Hmax > 0 ? clamp(H / Hmax, 0, 1) : 0;
    }

    /**
     * Score every length-12 contiguous wheel arc; return the densest.
     * Returns score as (hits_in_arc / spins.length).
     */
    function bestArc(spins) {
        if (!spins.length) return { numbers: [], score: 0, count: 0, startIdx: 0, centerIdx: 0 };
        const W = WHEEL_EU.length;
        const bucket = new Array(W).fill(0);
        for (const n of spins) {
            const p = WHEEL_POS.get(n);
            if (p != null) bucket[p]++;
        }
        let bestCount = -1;
        let bestStart = 0;
        for (let s = 0; s < W; s++) {
            let c = 0;
            for (let k = 0; k < MAX_BET_NUMBERS; k++) c += bucket[(s + k) % W];
            if (c > bestCount) { bestCount = c; bestStart = s; }
        }
        const nums = [];
        for (let k = 0; k < MAX_BET_NUMBERS; k++) nums.push(WHEEL_EU[(bestStart + k) % W]);
        const score = spins.length ? bestCount / spins.length : 0;
        return {
            numbers: nums,
            score: clamp(score, 0, 1),
            count: bestCount,
            startIdx: bestStart,
            centerIdx: (bestStart + Math.floor(MAX_BET_NUMBERS / 2)) % W
        };
    }

    /**
     * Conflict: ratio of the 2nd best arc's count to the best arc's count.
     * 1 means two arcs tie — high conflict. 0 means only one dominant arc.
     */
    function secondArcGap(spins) {
        if (!spins.length) return 1;
        const W = WHEEL_EU.length;
        const bucket = new Array(W).fill(0);
        for (const n of spins) {
            const p = WHEEL_POS.get(n);
            if (p != null) bucket[p]++;
        }
        let best = -1, second = -1;
        for (let s = 0; s < W; s++) {
            let c = 0;
            for (let k = 0; k < MAX_BET_NUMBERS; k++) c += bucket[(s + k) % W];
            if (c > best) { second = best; best = c; }
            else if (c > second) { second = c; }
        }
        if (best <= 0) return 1;
        return clamp(second / best, 0, 1);
    }

    /**
     * Drift: normalized wheel distance between the best arc on the first
     * half vs the second half of the history. 0 means stable; 1 means
     * the hot zone moved to the opposite side of the wheel.
     */
    function computeDriftScore(spins) {
        if (spins.length < 8) return 0;
        const mid = Math.floor(spins.length / 2);
        const a = bestArc(spins.slice(0, mid));
        const b = bestArc(spins.slice(mid));
        const dx = Math.abs(a.centerIdx - b.centerIdx);
        const d = Math.min(dx, WHEEL_EU.length - dx);
        return clamp(d / (WHEEL_EU.length / 2), 0, 1);
    }

    /**
     * Historian match: find the best similarity between the current tail
     * and any earlier same-length window, measured by wheel-distance
     * between best-arc centers. 1 means an identical regime occurred
     * previously.
     */
    function computeHistorianMatch(spins, tailLen) {
        if (spins.length < tailLen * 2) return 0;
        const tail = spins.slice(-tailLen);
        const tailArc = bestArc(tail);
        let bestSim = 0;
        const stop = spins.length - tailLen;
        for (let i = 0; i + tailLen <= stop; i++) {
            const w = spins.slice(i, i + tailLen);
            const wa = bestArc(w);
            const dx = Math.abs(wa.centerIdx - tailArc.centerIdx);
            const d = Math.min(dx, WHEEL_EU.length - dx);
            const sim = 1 - d / (WHEEL_EU.length / 2);
            if (sim > bestSim) bestSim = sim;
        }
        return clamp(bestSim, 0, 1);
    }

    // --- Controller ------------------------------------------------------

    class AITrainedController {
        constructor(opts = {}) {
            this.opts = Object.assign({
                warmupMax: 3,             // idx 0..3 => WARMUP => WAIT
                shadowMax: 6,             // idx 4..6 => SHADOW => SHADOW_PREDICT
                earlyMax: 19,             // idx 7..19 => EARLY
                stabilisingMax: 39,       // idx 20..39 => STABILISING
                recoveryLossStreak: 4,    // RECOVERY phase trigger
                retrainLossStreak: 3,     // RETRAIN emission trigger
                retrainCooldown: 5,       // spins between consecutive RETRAIN emissions
                protectionLossStreak: 7,  // enter PROTECTION
                protectionCooldown: 10,   // PROTECTION spin count
                terminateLossStreak: 12,  // absolute terminate
                windowRecent: 15,         // tail used for arc / entropy / conflict
                windowHistorian: 6        // window length for historian match
            }, opts || {});
            this.resetSession();
        }

        resetSession() {
            this.state = {
                lossStreak: 0,
                winStreak: 0,
                betsPlaced: 0,
                betsHit: 0,
                shadowsSeen: 0,
                shadowsHit: 0,
                protectionCooldown: 0,
                inProtection: false,
                lastProtectionReason: null,
                terminated: false,
                lastShadowDecision: null,
                lastBetDecision: null,
                ghostWin: false,
                // Phase 2 additions — audit + RETRAIN support.
                lastRetrainIdx: null,
                retrainEvents: [],
                protectionEntries: [],
                decisions: {
                    WAIT: 0, BET: 0, SHADOW_PREDICT: 0,
                    RETRAIN: 0, PROTECTION: 0, TERMINATE_SESSION: 0
                },
                phases: {
                    WARMUP: 0, SHADOW: 0, EARLY: 0, STABILISING: 0,
                    ACTIVE: 0, RECOVERY: 0, PROTECTION: 0
                },
                firstSpinIdx: null,
                lastSpinIdx: null
            };
        }

        // --- Phase / threshold ------------------------------------------

        _phase(idx) {
            if (this.state.terminated) return PHASE.PROTECTION;
            if (this.state.inProtection) return PHASE.PROTECTION;
            if (idx <= this.opts.warmupMax) return PHASE.WARMUP;
            if (idx <= this.opts.shadowMax) return PHASE.SHADOW;
            if (this.state.lossStreak >= this.opts.recoveryLossStreak) return PHASE.RECOVERY;
            if (idx <= this.opts.earlyMax) return PHASE.EARLY;
            if (idx <= this.opts.stabilisingMax) return PHASE.STABILISING;
            return PHASE.ACTIVE;
        }

        _threshold(phase) {
            switch (phase) {
                case PHASE.EARLY:       return PHASE_THRESHOLDS.EARLY;
                case PHASE.STABILISING: return PHASE_THRESHOLDS.STABILISING;
                case PHASE.ACTIVE:      return PHASE_THRESHOLDS.ACTIVE;
                case PHASE.RECOVERY:    return PHASE_THRESHOLDS.RECOVERY;
                default: return 1.01; // unreachable by BET path
            }
        }

        _computeConfidence(diag) {
            const w = { cluster: 0.40, lowEntropy: 0.20, historian: 0.20, nonConflict: 0.15, stable: 0.05 };
            const c =
                w.cluster     * diag.clusterStrength +
                w.lowEntropy  * (1 - diag.entropy) +
                w.historian   * diag.historianMatch +
                w.nonConflict * (1 - diag.conflict) +
                w.stable      * (1 - diag.driftScore);
            return clamp(c, 0, 1);
        }

        _diagnose(spins, idx) {
            const recent = spins.slice(-this.opts.windowRecent);
            const arc = bestArc(recent);
            return {
                entropy: computeEntropy(recent),
                conflict: secondArcGap(recent),
                historianMatch: computeHistorianMatch(spins, this.opts.windowHistorian),
                clusterStrength: arc.score,
                driftScore: computeDriftScore(spins),
                lossStreak: this.state.lossStreak,
                ghostWin: this.state.ghostWin,
                spinIndex: idx,
                spinsSeen: spins.length,
                // private helpers for decide()
                _arcNumbers: arc.numbers,
                _arcCount: arc.count
            };
        }

        _publicDiag(diag) {
            const { _arcNumbers, _arcCount, ...pub } = diag;
            return pub;
        }

        _decisionEnvelope(action, phase, reason, diag, extra = {}) {
            return Object.assign({
                action,
                selectedPair: null,
                selectedFilter: null,
                numbers: [],
                confidence: 0,
                reason,
                phase,
                zone: null,
                diagnostics: this._publicDiag(diag),
                reasoning: { signals: [], rejected: [] }
            }, extra);
        }

        // --- Main API ----------------------------------------------------

        /**
         * Return a decision for the current spin index.
         *
         * @param {number[]} spins - full spin history (chronological).
         *                           Only items satisfying 0 <= n <= 36 are used.
         * @param {number} idx - 0-based spin index this decision is for.
         * @param {object} [ctx] - reserved for future use (engine handle, etc).
         * @returns {object} decision — see contract at bottom of file.
         */
        decide(spins, idx, /* ctx */) {
            if (!Array.isArray(spins)) throw new TypeError('spins must be an array');
            if (!Number.isInteger(idx) || idx < 0) throw new TypeError('idx must be a non-negative integer');

            const history = spins.filter(isValidSpin);

            // Track the idx window for audit (getSummary / enterProtection).
            if (this.state.firstSpinIdx === null) this.state.firstSpinIdx = idx;
            this.state.lastSpinIdx = idx;

            // Terminated state is sticky.
            if (this.state.terminated) {
                const diag = this._diagnose(history, idx);
                return this._finalize(this._decisionEnvelope(
                    ACTION.TERMINATE_SESSION, PHASE.PROTECTION,
                    'Session terminated (loss ceiling reached)', diag
                ));
            }

            // Protection cooldown drains one spin per decide() call.
            if (this.state.inProtection) {
                this.state.protectionCooldown = Math.max(0, this.state.protectionCooldown - 1);
                if (this.state.protectionCooldown === 0) this.state.inProtection = false;
                if (this.state.inProtection) {
                    const diag = this._diagnose(history, idx);
                    return this._finalize(this._decisionEnvelope(
                        ACTION.PROTECTION, PHASE.PROTECTION,
                        `Protection cooldown (${this.state.lastProtectionReason || 'n/a'})`,
                        diag
                    ));
                }
            }

            const phase = this._phase(idx);
            const diag = this._diagnose(history, idx);

            if (phase === PHASE.WARMUP) {
                return this._finalize(this._decisionEnvelope(
                    ACTION.WAIT, phase,
                    `Warmup (idx=${idx} <= ${this.opts.warmupMax})`,
                    diag,
                    { reasoning: { signals: [], rejected: ['pre-evidence'] } }
                ));
            }

            if (phase === PHASE.SHADOW) {
                const shadowNumbers = capNumbers(diag._arcNumbers);
                const confidence = this._computeConfidence(diag);
                const dec = this._decisionEnvelope(
                    ACTION.SHADOW_PREDICT, phase,
                    `Shadow phase (idx=${idx}) — numbers are diagnostics only`,
                    diag,
                    {
                        confidence,
                        // numbers MUST stay empty; shadow numbers are exposed separately.
                        zone: shadowNumbers.length ? { label: 'shadow-arc', numbers: shadowNumbers } : null,
                        shadowNumbers: shadowNumbers,
                        reasoning: { signals: ['shadow'], rejected: ['pre-bet-phase'] }
                    }
                );
                this.state.lastShadowDecision = dec;
                return this._finalize(dec);
            }

            // RETRAIN emission — bettable phases only (NOT in RECOVERY or
            // PROTECTION). Cooldown guards against repeated emissions.
            if (this._shouldEmitRetrain(phase, idx)) {
                const dec = this._decisionEnvelope(
                    ACTION.RETRAIN, phase,
                    `RETRAIN signal: lossStreak=${this.state.lossStreak} in ${phase}`,
                    diag,
                    {
                        confidence: this._computeConfidence(diag),
                        reasoning: {
                            signals: [`lossStreak=${this.state.lossStreak}`],
                            rejected: []
                        }
                    }
                );
                this.state.lastRetrainIdx = idx;
                this.state.retrainEvents.push({ idx, lossStreak: this.state.lossStreak });
                return this._finalize(dec);
            }

            // Bettable phases.
            const confidence = this._computeConfidence(diag);
            const threshold = this._threshold(phase);

            const signals = [];
            const rejected = [];
            if (diag.clusterStrength >= 0.35) signals.push(`cluster=${diag.clusterStrength.toFixed(2)}`);
            else rejected.push(`cluster_low(${diag.clusterStrength.toFixed(2)})`);
            if (diag.entropy <= 0.85) signals.push(`entropy_ok=${diag.entropy.toFixed(2)}`);
            else rejected.push(`entropy_high(${diag.entropy.toFixed(2)})`);
            if (diag.historianMatch >= 0.5) signals.push(`historian=${diag.historianMatch.toFixed(2)}`);
            if (diag.conflict <= 0.85) signals.push(`non_conflict=${(1 - diag.conflict).toFixed(2)}`);
            else rejected.push(`conflict_high(${diag.conflict.toFixed(2)})`);
            if (diag.driftScore <= 0.6) signals.push(`drift_ok=${diag.driftScore.toFixed(2)}`);
            else rejected.push(`drift_high(${diag.driftScore.toFixed(2)})`);

            if (confidence < threshold) {
                rejected.unshift(`confidence_below_threshold(${confidence.toFixed(2)}<${threshold.toFixed(2)})`);
                return this._finalize(this._decisionEnvelope(
                    ACTION.WAIT, phase,
                    `Confidence ${confidence.toFixed(2)} < ${threshold.toFixed(2)} (${phase})`,
                    diag,
                    { confidence, reasoning: { signals, rejected } }
                ));
            }

            const numbers = capNumbers(diag._arcNumbers);
            const dec = this._decisionEnvelope(
                ACTION.BET, phase,
                `${phase} BET: confidence ${confidence.toFixed(2)} >= ${threshold.toFixed(2)}`,
                diag,
                {
                    confidence,
                    numbers,
                    zone: numbers.length ? { label: 'ai-arc-12', numbers } : null,
                    reasoning: { signals, rejected }
                }
            );
            this.state.lastBetDecision = dec;
            return this._finalize(dec);
        }

        _shouldEmitRetrain(phase, idx) {
            if (this.state.inProtection) return false;
            if (this.state.terminated) return false;
            const bettable = (phase === PHASE.EARLY || phase === PHASE.STABILISING || phase === PHASE.ACTIVE);
            if (!bettable) return false;
            if (this.state.lossStreak < this.opts.retrainLossStreak) return false;
            const last = this.state.lastRetrainIdx;
            if (last != null && (idx - last) <= this.opts.retrainCooldown) return false;
            return true;
        }

        // Increments audit counters and returns the decision unchanged.
        // Keeps decision-path branches simple; the schema is not mutated.
        _finalize(dec) {
            if (dec && typeof dec.action === 'string'
                    && Object.prototype.hasOwnProperty.call(this.state.decisions, dec.action)) {
                this.state.decisions[dec.action]++;
            }
            if (dec && typeof dec.phase === 'string'
                    && Object.prototype.hasOwnProperty.call(this.state.phases, dec.phase)) {
                this.state.phases[dec.phase]++;
            }
            return dec;
        }

        // --- Feedback hooks ---------------------------------------------

        recordResult({ idx, hit, actual, decision } = {}) {
            if (!decision || decision.action !== ACTION.BET) return;
            this.state.betsPlaced++;
            if (hit) {
                this.state.betsHit++;
                this.state.winStreak++;
                this.state.lossStreak = 0;
            } else {
                this.state.winStreak = 0;
                this.state.lossStreak++;
                if (this.state.lossStreak >= this.opts.terminateLossStreak) {
                    this.state.terminated = true;
                } else if (this.state.lossStreak >= this.opts.protectionLossStreak) {
                    this.enterProtection(`loss-streak=${this.state.lossStreak}`);
                }
            }
            this.state.ghostWin = false;
            void idx; void actual;
        }

        recordShadow({ idx, actual, decision } = {}) {
            if (!decision || decision.action !== ACTION.SHADOW_PREDICT) return;
            this.state.shadowsSeen++;
            const nums = Array.isArray(decision.shadowNumbers) ? decision.shadowNumbers : [];
            const hit = isValidSpin(actual) && nums.includes(actual);
            if (hit) {
                this.state.shadowsHit++;
                this.state.ghostWin = true;
            }
            void idx;
        }

        enterProtection(reason = 'unspecified') {
            this.state.inProtection = true;
            this.state.protectionCooldown = this.opts.protectionCooldown;
            this.state.lastProtectionReason = reason;
            // Audit entry — one per entry (not per cooldown tick).
            const idx = (typeof this.state.lastSpinIdx === 'number') ? this.state.lastSpinIdx : -1;
            this.state.protectionEntries.push({
                idx,
                reason: String(reason),
                cooldown: this.opts.protectionCooldown
            });
        }

        exitProtection() {
            this.state.inProtection = false;
            this.state.protectionCooldown = 0;
        }

        // Reserved for Phase 2. Controller does not mutate the engine here.
        maybeRetrain() {
            return { retrained: false, reason: 'retrain hook reserved for Phase 2' };
        }

        snapshot() {
            return JSON.parse(JSON.stringify(this.state));
        }

        // --- Phase 2 additions -----------------------------------------

        /**
         * Serialize controller-local session state to a plain object.
         * opts are included so restore can sanity-check compatibility,
         * but restore only writes back into state (never opts).
         */
        exportSessionMemory() {
            return {
                version: 1,
                opts: JSON.parse(JSON.stringify(this.opts)),
                state: JSON.parse(JSON.stringify(this.state))
            };
        }

        /**
         * Restore controller-local session state from an exported object.
         * Merges onto the current state so any missing keys keep their
         * defaults. Does NOT mutate this.opts. Does NOT change the
         * decision schema. Safe against malformed input.
         */
        restoreSessionMemory(obj) {
            if (!obj || typeof obj !== 'object') return false;
            const src = (obj && obj.state && typeof obj.state === 'object') ? obj.state : obj;
            // Start from a fresh template so partial input can't leave
            // us with orphaned Phase 1 keys.
            this.resetSession();
            const dst = this.state;
            const assign = (key) => {
                if (Object.prototype.hasOwnProperty.call(src, key)) {
                    dst[key] = src[key];
                }
            };
            [
                'lossStreak', 'winStreak', 'betsPlaced', 'betsHit',
                'shadowsSeen', 'shadowsHit',
                'protectionCooldown', 'inProtection', 'lastProtectionReason',
                'terminated', 'ghostWin',
                'lastRetrainIdx', 'firstSpinIdx', 'lastSpinIdx'
            ].forEach(assign);
            if (Array.isArray(src.retrainEvents)) {
                dst.retrainEvents = src.retrainEvents.map(e => ({
                    idx: Number(e && e.idx) | 0,
                    lossStreak: Number(e && e.lossStreak) | 0
                }));
            }
            if (Array.isArray(src.protectionEntries)) {
                dst.protectionEntries = src.protectionEntries.map(e => ({
                    idx: Number(e && e.idx) | 0,
                    reason: String((e && e.reason) || 'unspecified'),
                    cooldown: Number(e && e.cooldown) | 0
                }));
            }
            if (src.decisions && typeof src.decisions === 'object') {
                Object.keys(dst.decisions).forEach(k => {
                    if (typeof src.decisions[k] === 'number') dst.decisions[k] = src.decisions[k];
                });
            }
            if (src.phases && typeof src.phases === 'object') {
                Object.keys(dst.phases).forEach(k => {
                    if (typeof src.phases[k] === 'number') dst.phases[k] = src.phases[k];
                });
            }
            // Never restore prior decision references — they would leak
            // memory across contexts. Callers re-drive decide() as needed.
            dst.lastShadowDecision = null;
            dst.lastBetDecision = null;
            return true;
        }

        /**
         * Return a summary matching aggregateAITrainedSteps(steps) shape,
         * built from the controller's internal counters instead of a
         * step log. Useful when a caller owns the live singleton but
         * does not log every decision to a step array.
         */
        getSummary() {
            const s = this.state;
            const bets = s.betsPlaced || 0;
            const shadows = s.shadowsSeen || 0;
            const safeRate = (n, d) => (d > 0 ? Math.max(0, Math.min(1, n / d)) : 0);
            return {
                spinsSeen: (s.lastSpinIdx != null && s.firstSpinIdx != null)
                    ? (s.lastSpinIdx - s.firstSpinIdx + 1)
                    : 0,
                aiTrainedSpins: Object.values(s.decisions).reduce((a, b) => a + b, 0),
                decisions: Object.assign({}, s.decisions),
                phases: Object.assign({}, s.phases),
                bets,
                betHits: s.betsHit || 0,
                betMisses: Math.max(0, bets - (s.betsHit || 0)),
                betHitRate: safeRate(s.betsHit || 0, bets),
                shadowsSeen: shadows,
                shadowsHit: s.shadowsHit || 0,
                shadowHitRate: safeRate(s.shadowsHit || 0, shadows),
                protectionEntries: (s.protectionEntries || []).map(e => Object.assign({}, e)),
                retrainEvents:    (s.retrainEvents    || []).map(e => Object.assign({}, e)),
                terminated: !!s.terminated,
                firstSpinIdx: s.firstSpinIdx,
                lastSpinIdx:  s.lastSpinIdx
            };
        }
    }

    // --- Module exports --------------------------------------------------

    const api = {
        AITrainedController,
        PHASE,
        ACTION,
        MAX_BET_NUMBERS,
        __internal: {
            bestArc,
            computeEntropy,
            computeDriftScore,
            computeHistorianMatch,
            capNumbers,
            WHEEL_EU
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.AITrainedController = AITrainedController;
        globalRef.AITrainedControllerAPI = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

/* ============================================================================
 * DECISION CONTRACT
 * ----------------------------------------------------------------------------
 * Every call to AITrainedController#decide(spins, idx) returns an object of
 * the following shape. Fields marked (*) are always present.
 *
 * {
 *   action:        'WAIT' | 'BET' | 'SHADOW_PREDICT' | 'RETRAIN' |          (*)
 *                  'PROTECTION' | 'TERMINATE_SESSION',
 *   selectedPair:  null  (AI-trained never uses user pairs),                (*)
 *   selectedFilter: null | string,                                          (*)
 *   numbers:       number[]  length <= 12, empty unless action === 'BET',   (*)
 *   confidence:    number in [0, 1],                                        (*)
 *   reason:        string,                                                  (*)
 *   phase:         'WARMUP' | 'SHADOW' | 'EARLY' | 'STABILISING' |          (*)
 *                  'ACTIVE' | 'RECOVERY' | 'PROTECTION',
 *   zone:          null | { label: string, numbers: number[] },             (*)
 *   diagnostics: {                                                          (*)
 *     entropy:         number in [0, 1],
 *     conflict:        number in [0, 1],      // 1 = max conflict
 *     historianMatch:  number in [0, 1],
 *     clusterStrength: number in [0, 1],
 *     driftScore:      number in [0, 1],      // 1 = zone fully migrated
 *     lossStreak:      integer >= 0,
 *     ghostWin:        boolean,
 *     spinIndex:       integer,
 *     spinsSeen:       integer
 *   },
 *   reasoning: { signals: string[], rejected: string[] },                   (*)
 *
 *   // Present only when action === 'SHADOW_PREDICT':
 *   shadowNumbers: number[]  length <= 12  — diagnostics only, NOT bettable
 * }
 *
 * Hard invariants:
 *   - action === 'WAIT'  => numbers.length === 0
 *   - action === 'SHADOW_PREDICT' => numbers.length === 0
 *     (use shadowNumbers for display; callers MUST NOT bet these)
 *   - action === 'BET'   => 1 <= numbers.length <= 12, all unique, all 0..36
 *   - selectedPair is always null in AI-trained mode
 * ========================================================================== */
