/**
 * AI Auto Engine — Intelligent pair selection & filter optimization
 *
 * Trains on historical spin data to learn which pairs and filter combinations
 * produce the best results, then automatically makes real-time decisions.
 *
 * Reuses math functions from renderer-3tables.js (global scope at runtime):
 *   calculatePositionCode, calculateReferences, DIGIT_13_OPPOSITES,
 *   generateAnchors, expandAnchorsToBetNumbers, _getPosCodeDistance,
 *   _computeFlashTargets, calculateWheelAnchors
 *
 * Reuses number sets from roulette-wheel.js:
 *   ZERO_TABLE_NUMS, NINETEEN_TABLE_NUMS, POSITIVE_NUMS, NEGATIVE_NUMS
 */

// ── Filter Combinations (table × sign × set = 36 total) ──
const FILTER_COMBOS = [
    // Original 9: set='all' (no set filtering — backward compatible)
    { key: 'zero_positive',     table: 'zero',     sign: 'positive', set: 'all' },
    { key: 'zero_negative',     table: 'zero',     sign: 'negative', set: 'all' },
    { key: 'zero_both',         table: 'zero',     sign: 'both',     set: 'all' },
    { key: 'nineteen_positive', table: 'nineteen', sign: 'positive', set: 'all' },
    { key: 'nineteen_negative', table: 'nineteen', sign: 'negative', set: 'all' },
    { key: 'nineteen_both',     table: 'nineteen', sign: 'both',     set: 'all' },
    { key: 'both_positive',     table: 'both',     sign: 'positive', set: 'all' },
    { key: 'both_negative',     table: 'both',     sign: 'negative', set: 'all' },
    { key: 'both_both',         table: 'both',     sign: 'both',     set: 'all' },
    // 0 Set combos (9)
    { key: 'zero_positive_set0',     table: 'zero',     sign: 'positive', set: 'set0' },
    { key: 'zero_negative_set0',     table: 'zero',     sign: 'negative', set: 'set0' },
    { key: 'zero_both_set0',         table: 'zero',     sign: 'both',     set: 'set0' },
    { key: 'nineteen_positive_set0', table: 'nineteen', sign: 'positive', set: 'set0' },
    { key: 'nineteen_negative_set0', table: 'nineteen', sign: 'negative', set: 'set0' },
    { key: 'nineteen_both_set0',     table: 'nineteen', sign: 'both',     set: 'set0' },
    { key: 'both_positive_set0',     table: 'both',     sign: 'positive', set: 'set0' },
    { key: 'both_negative_set0',     table: 'both',     sign: 'negative', set: 'set0' },
    { key: 'both_both_set0',         table: 'both',     sign: 'both',     set: 'set0' },
    // 5 Set combos (9)
    { key: 'zero_positive_set5',     table: 'zero',     sign: 'positive', set: 'set5' },
    { key: 'zero_negative_set5',     table: 'zero',     sign: 'negative', set: 'set5' },
    { key: 'zero_both_set5',         table: 'zero',     sign: 'both',     set: 'set5' },
    { key: 'nineteen_positive_set5', table: 'nineteen', sign: 'positive', set: 'set5' },
    { key: 'nineteen_negative_set5', table: 'nineteen', sign: 'negative', set: 'set5' },
    { key: 'nineteen_both_set5',     table: 'nineteen', sign: 'both',     set: 'set5' },
    { key: 'both_positive_set5',     table: 'both',     sign: 'positive', set: 'set5' },
    { key: 'both_negative_set5',     table: 'both',     sign: 'negative', set: 'set5' },
    { key: 'both_both_set5',         table: 'both',     sign: 'both',     set: 'set5' },
    // 6 Set combos (9)
    { key: 'zero_positive_set6',     table: 'zero',     sign: 'positive', set: 'set6' },
    { key: 'zero_negative_set6',     table: 'zero',     sign: 'negative', set: 'set6' },
    { key: 'zero_both_set6',         table: 'zero',     sign: 'both',     set: 'set6' },
    { key: 'nineteen_positive_set6', table: 'nineteen', sign: 'positive', set: 'set6' },
    { key: 'nineteen_negative_set6', table: 'nineteen', sign: 'negative', set: 'set6' },
    { key: 'nineteen_both_set6',     table: 'nineteen', sign: 'both',     set: 'set6' },
    { key: 'both_positive_set6',     table: 'both',     sign: 'positive', set: 'set6' },
    { key: 'both_negative_set6',     table: 'both',     sign: 'negative', set: 'set6' },
    { key: 'both_both_set6',         table: 'both',     sign: 'both',     set: 'set6' },
];

// Pair refKeys (same as renderer-3tables.js)
const PAIR_REFKEYS = ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'];

// Map refKey → dataPair attribute (same as _PAIR_REFKEY_TO_DATA_PAIR)
const REFKEY_TO_PAIR_NAME = {
    'prev': 'prev',
    'prev_plus_1': 'prevPlus1',
    'prev_minus_1': 'prevMinus1',
    'prev_plus_2': 'prevPlus2',
    'prev_minus_2': 'prevMinus2',
    'prev_prev': 'prevPrev'
};

// Reverse mapping
const PAIR_NAME_TO_REFKEY = {};
Object.entries(REFKEY_TO_PAIR_NAME).forEach(([k, v]) => { PAIR_NAME_TO_REFKEY[v] = k; });

// Table 2 pair keys (different from T3 — includes ref0/ref19, no prevPrev)
const T2_PAIR_KEYS = ['ref0', 'ref19', 'prev', 'prevPlus1', 'prevMinus1', 'prevPlus2', 'prevMinus2'];

// Map T2 pair key → refNum calculator (same logic as _T2_PAIR_DEFS in renderer)
const T2_PAIR_REFNUM = {
    ref0:       (lastSpin) => 0,
    ref19:      (lastSpin) => 19,
    prev:       (lastSpin) => lastSpin,
    prevPlus1:  (lastSpin) => Math.min(lastSpin + 1, 36),
    prevMinus1: (lastSpin) => Math.max(lastSpin - 1, 0),
    prevPlus2:  (lastSpin) => Math.min(lastSpin + 2, 36),
    prevMinus2: (lastSpin) => Math.max(lastSpin - 2, 0),
};

// Golden position codes — highest priority patterns
const GOLDEN_CODES = ['S+0', 'O+0'];
const NEAR_CODES = ['SL+1', 'SR+1', 'OL+1', 'OR+1'];

// European roulette wheel order (clockwise from 0)
const EUROPEAN_WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

class AIAutoEngine {
    /**
     * @param {Object} [options]
     * @param {number} [options.confidenceThreshold=65] - Min confidence to bet (0-100)
     * @param {number} [options.maxConsecutiveSkips=5] - Max skips before forced bet
     * @param {number} [options.sessionAdaptationStart=10] - Bets before session data gets weighted
     * @param {number} [options.historicalWeight=0.7] - Weight for historical vs session (0-1)
     */
    constructor(options = {}) {
        this.isTrained = false;
        this.isEnabled = false;

        // Training models
        this.pairModels = {};       // { [refKey]: PairModel }
        this.filterModels = {};     // { [filterKey]: FilterModel }

        // Session adaptation
        this.session = this._createSessionTracker();
        this.lastDecision = null;  // Stored by orchestrator for feedback loop
        this._currentDecisionSpins = null;  // Set by decide()/_simulateDecision for inner methods

        // Configuration
        this.confidenceThreshold = options.confidenceThreshold ?? 65;
        this.maxConsecutiveSkips = options.maxConsecutiveSkips ?? 5;
        this.sessionAdaptationStart = options.sessionAdaptationStart ?? 10;
        this.historicalWeight = options.historicalWeight ?? 0.7;

        // Sequence model (multi-layer n-gram)
        const SeqModelClass = typeof AISequenceModel !== 'undefined' ? AISequenceModel :
            (typeof window !== 'undefined' && window.AISequenceModel ? window.AISequenceModel : null);
        this.sequenceModel = SeqModelClass ? new SeqModelClass({
            minSamples: options.sequenceMinSamples ?? 3,
            confidenceThreshold: options.sequenceConfidence ?? 0.70
        }) : null;

        // Learning version: 'v2' = adaptive learning, 'v1' = original static behavior
        this.learningVersion = options.learningVersion ?? 'v2';

        // Bayesian pair scoring (v2)
        this.pairBayesian = {};           // { [refKey]: { alpha, beta } }
        this._totalBayesianDecisions = 0;

        // EMA live learning (v2)
        this.emaDecay = options.emaDecay ?? 0.05;

        // Position code performance (v2)
        this.posCodePerformance = {};     // { "S+0": { attempts, hits, hitRate } }

        // Live retrain
        this.liveSpins = [];
        this._originalTrainingData = null;
        this._retrainInterval = options.retrainInterval ?? 10;
        this._retrainLossStreak = options.retrainLossStreak ?? 3;
        this._lastRetrainBetCount = 0;
    }

    _createSessionTracker() {
        return {
            totalBets: 0,
            wins: 0,
            losses: 0,
            consecutiveSkips: 0,
            consecutiveLosses: 0,          // NEW: track loss streaks
            cooldownActive: false,          // NEW: true after 3 consecutive losses
            cooldownThreshold: 80,          // NEW: elevated confidence during cooldown
            nearMisses: 0,                  // NEW: near-miss counter
            pairPerformance: {},     // { [refKey]: { attempts, hits } }
            filterPerformance: {},   // { [filterKey]: { attempts, hits } }
            pairFilterCross: {},     // v2: { "prev|zero_positive": { attempts, hits } }
            sessionWinRate: 0,
            recentDecisions: [],     // last 10 { refKey, filterKey, hit, nearMiss }
            adaptationWeight: 0.0
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  TRAINING
    // ═══════════════════════════════════════════════════════════

    /**
     * Train the engine on historical spin data.
     *
     * @param {number[][]} sessions - Array of sessions, each is chronological spin array
     * @returns {{ totalSpins: number, pairStats: Object, filterStats: Object, overallHitRate: number }}
     */
    train(sessions) {
        // Store original training data for live retrain merging
        this._originalTrainingData = sessions;

        // Reset models
        this.pairModels = {};
        this.filterModels = {};

        // Initialize pair models
        PAIR_REFKEYS.forEach(refKey => {
            this.pairModels[refKey] = {
                totalFlashes: 0,
                projectionHits: 0,
                hitRate: 0,
                totalProjectionSize: 0,
                avgProjectionSize: 0,
                coverageEfficiency: 0
            };
        });

        // Initialize filter models
        FILTER_COMBOS.forEach(fc => {
            this.filterModels[fc.key] = {
                totalTrials: 0,
                hits: 0,
                hitRate: 0,
                totalFilteredCount: 0,
                avgFilteredCount: 0
            };
        });

        let totalSpins = 0;
        let totalHits = 0;
        let totalTrials = 0;

        for (const sessionSpins of sessions) {
            if (sessionSpins.length < 5) continue; // Need at least 5 spins for meaningful training
            const result = this._trainOnSession(sessionSpins);
            totalSpins += sessionSpins.length;
            totalHits += result.hits;
            totalTrials += result.trials;
        }

        // Compute final rates
        PAIR_REFKEYS.forEach(refKey => {
            const m = this.pairModels[refKey];
            if (m.totalFlashes > 0) {
                m.hitRate = m.projectionHits / m.totalFlashes;
                m.avgProjectionSize = m.totalProjectionSize / m.totalFlashes;
                // Coverage efficiency: how much better than random given the coverage
                const randomRate = m.avgProjectionSize / 37;
                m.coverageEfficiency = randomRate > 0 ? m.hitRate / randomRate : 0;
            }
        });

        FILTER_COMBOS.forEach(fc => {
            const m = this.filterModels[fc.key];
            if (m.totalTrials > 0) {
                m.hitRate = m.hits / m.totalTrials;
                m.avgFilteredCount = m.totalFilteredCount / m.totalTrials;
            }
        });

        this.isTrained = true;

        // v2 learning: Initialize Bayesian priors from training data
        if (this.learningVersion === 'v2') {
            this.pairBayesian = {};
            PAIR_REFKEYS.forEach(refKey => {
                const m = this.pairModels[refKey];
                this.pairBayesian[refKey] = {
                    alpha: m.projectionHits + 1,       // successes + prior
                    beta: (m.totalFlashes - m.projectionHits) + 1,  // failures + prior
                };
            });
            this._totalBayesianDecisions = 0;

            // Compute position code hit rates from training
            Object.values(this.posCodePerformance).forEach(p => {
                p.hitRate = p.attempts > 0 ? p.hits / p.attempts : 0;
            });
        }

        // Train sequence model on same sessions
        if (this.sequenceModel) {
            this.sequenceModel.train(sessions);
        }

        const pairStats = {};
        PAIR_REFKEYS.forEach(refKey => {
            const m = this.pairModels[refKey];
            pairStats[refKey] = {
                totalFlashes: m.totalFlashes,
                hits: m.projectionHits,
                hitRate: Math.round(m.hitRate * 1000) / 1000,
                avgSize: Math.round(m.avgProjectionSize * 10) / 10,
                efficiency: Math.round(m.coverageEfficiency * 1000) / 1000
            };
        });

        const filterStats = {};
        FILTER_COMBOS.forEach(fc => {
            const m = this.filterModels[fc.key];
            filterStats[fc.key] = {
                trials: m.totalTrials,
                hits: m.hits,
                hitRate: Math.round(m.hitRate * 1000) / 1000,
                avgSize: Math.round(m.avgFilteredCount * 10) / 10
            };
        });

        return {
            totalSpins,
            pairStats,
            filterStats,
            overallHitRate: totalTrials > 0 ? Math.round((totalHits / totalTrials) * 1000) / 1000 : 0
        };
    }

    /**
     * Internal: Train on a single session of spins (chronological order).
     */
    _trainOnSession(spins) {
        let hits = 0;
        let trials = 0;

        // We need at least 4 spins: [i-2] for prevPrev refs, [i-1] for prev,
        // [i] current row, [i+1] to check projection hit.
        // Flash detection needs i and i-1 row position codes.
        // So effective start is i=3 (need i-3 for prevPrev of previous row),
        // and we check i+1, so we stop at spins.length-2.

        for (let i = 3; i < spins.length - 1; i++) {
            const flashingPairs = this._getFlashingPairsFromHistory(spins, i);

            if (flashingPairs.size === 0) continue;

            const nextActual = spins[i + 1]; // The result we try to predict

            // For each flashing pair, compute projection and check hit
            for (const [refKey, flashInfo] of flashingPairs) {
                const projection = this._computeProjectionForPair(spins, i, refKey);
                if (!projection || projection.numbers.length === 0) continue;

                const isHit = projection.numbers.includes(nextActual);
                const m = this.pairModels[refKey];
                m.totalFlashes++;
                m.totalProjectionSize += projection.numbers.length;
                if (isHit) {
                    m.projectionHits++;
                    hits++;
                }
                trials++;

                // v2: Track position code → hit performance
                if (this.learningVersion === 'v2' && flashInfo.codes) {
                    flashInfo.codes.forEach(code => {
                        if (!this.posCodePerformance[code]) {
                            this.posCodePerformance[code] = { attempts: 0, hits: 0, hitRate: 0 };
                        }
                        this.posCodePerformance[code].attempts++;
                        if (isHit) this.posCodePerformance[code].hits++;
                    });
                }

                // Test all filter combinations
                FILTER_COMBOS.forEach(fc => {
                    const filtered = this._applyFilterToNumbers(projection.numbers, fc.key);
                    if (filtered.length === 0) return;

                    const fm = this.filterModels[fc.key];
                    fm.totalTrials++;
                    fm.totalFilteredCount += filtered.length;
                    if (filtered.includes(nextActual)) {
                        fm.hits++;
                    }
                });
            }
        }

        return { hits, trials };
    }

    /**
     * Internal: Determine which pairs are "flashing" at spin index `idx`.
     *
     * A pair flashes when BOTH the current row (idx) and the previous row (idx-1)
     * have at least one non-XX position code, AND the distance diff <= 1.
     *
     * @param {number[]} spins - Chronological spin numbers
     * @param {number} idx - Current row index
     * @returns {Map<string, Object>} Map of refKey → flash info
     */
    _getFlashingPairsFromHistory(spins, idx) {
        const result = new Map();

        if (idx < 3) return result; // Need idx-1 and idx-2 for both rows

        // Current row: refs based on spins[idx-1] (prev) and spins[idx-2] (prevPrev)
        const currRefs = this._getCalculateReferences(spins[idx - 1], spins[idx - 2]);
        // Previous row: refs based on spins[idx-2] (prev) and spins[idx-3] (prevPrev)
        const prevRowRefs = this._getCalculateReferences(spins[idx - 2], spins[idx - 3]);

        PAIR_REFKEYS.forEach(refKey => {
            // Current row position codes
            const currRefNum = currRefs[refKey];
            const currRef13Opp = this._getDigit13Opposite(currRefNum);
            const currPairCode = this._getCalculatePositionCode(currRefNum, spins[idx]);
            const currPair13Code = this._getCalculatePositionCode(currRef13Opp, spins[idx]);
            const currPairDist = this._getGetPosCodeDistance(currPairCode);
            const currPair13Dist = this._getGetPosCodeDistance(currPair13Code);

            // Previous row position codes
            const prevRefNum = prevRowRefs[refKey];
            const prevRef13Opp = this._getDigit13Opposite(prevRefNum);
            const prevPairCode = this._getCalculatePositionCode(prevRefNum, spins[idx - 1]);
            const prevPair13Code = this._getCalculatePositionCode(prevRef13Opp, spins[idx - 1]);
            const prevPairDist = this._getGetPosCodeDistance(prevPairCode);
            const prevPair13Dist = this._getGetPosCodeDistance(prevPair13Code);

            // Collect non-null distances for both rows
            const currDists = [];
            if (currPairDist !== null) currDists.push({ dist: currPairDist, code: currPairCode, cell: 'pair' });
            if (currPair13Dist !== null) currDists.push({ dist: currPair13Dist, code: currPair13Code, cell: 'pair13Opp' });

            const prevDists = [];
            if (prevPairDist !== null) prevDists.push({ dist: prevPairDist, code: prevPairCode, cell: 'pair' });
            if (prevPair13Dist !== null) prevDists.push({ dist: prevPair13Dist, code: prevPair13Code, cell: 'pair13Opp' });

            if (currDists.length === 0 || prevDists.length === 0) return;

            // Check if any distance pair has diff <= 1
            for (const cd of currDists) {
                for (const pd of prevDists) {
                    if (Math.abs(cd.dist - pd.dist) <= 1) {
                        // Collect all non-XX position codes for this flash (v2 learning)
                        const allCodes = [currPairCode, currPair13Code, prevPairCode, prevPair13Code]
                            .filter(c => c && c !== 'XX');
                        result.set(refKey, {
                            currCode: cd.code,
                            prevCode: pd.code,
                            currDist: cd.dist,
                            prevDist: pd.dist,
                            codes: allCodes
                        });
                        return; // First match per pair exits
                    }
                }
            }
        });

        return result;
    }

    /**
     * Internal: Compute projection numbers for a pair at a given spin index.
     * Replicates the NEXT row projection logic from renderTable3.
     *
     * The projection for refKey at spin[idx]:
     * 1. Get refs from current row's prev/prevPrev
     * 2. Get prevRefs from previous row
     * 3. Compute position code of previous row against prevRefs
     * 4. Use that code to generate anchors for current refs
     * 5. Expand anchors to bet numbers
     */
    _computeProjectionForPair(spins, idx, refKey) {
        if (idx < 2) return null;

        // Current row refs: based on spins[idx-1], spins[idx-2]
        const refs = this._getCalculateReferences(spins[idx - 1], spins[idx - 2]);
        const refNum = refs[refKey];
        const ref13Opp = this._getDigit13Opposite(refNum);

        // Previous row refs: based on spins[idx-2], spins[idx-3] or spins[idx-2] if no idx-3
        const prevPrev = idx > 2 ? spins[idx - 3] : spins[idx - 2];
        const prevRefs = this._getCalculateReferences(spins[idx - 2], prevPrev);

        const prevRefNum = prevRefs[refKey];
        const prevRef13Opp = this._getDigit13Opposite(prevRefNum);

        // Position code of previous row's spin against previous refs
        const prevPair = this._getCalculatePositionCode(prevRefNum, spins[idx - 1]);
        const prevPair13 = this._getCalculatePositionCode(prevRef13Opp, spins[idx - 1]);
        const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;

        if (usePosCode === 'XX') return null;

        // Generate anchors and expand to bet numbers
        const { purple, green } = this._getGenerateAnchors(refNum, ref13Opp, usePosCode);
        const numbers = this._getExpandAnchorsToBetNumbers(purple, green);

        if (numbers.length === 0) return null;

        return { numbers, anchors: purple, neighbors: green };
    }

    // ═══════════════════════════════════════════════════════════
    //  T2 FLASH DETECTION + NEXT ROW NUMBERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Detect T2 flashing pairs and extract NEXT row anchor numbers for the best pair.
     *
     * @param {Array<{actual: number}>} spins - Spin objects with .actual
     * @returns {{ dataPair: string, anchorCount: number, targets: number[], numbers: number[], score: number } | null}
     */
    _getT2FlashingPairsAndNumbers(spins) {
        if (!spins || spins.length < 4) return null;

        // 1. Get T2 flash targets (match renderTable2's visible window)
        const startIdx = Math.max(0, spins.length - 8);
        const visibleCount = spins.length - startIdx;
        const t2Targets = this._getComputeT2FlashTargets(spins, startIdx, visibleCount);
        if (t2Targets.size === 0) return null;

        // 2. Parse flash targets → { dataPair → Set<anchorIdx> }
        const pairAnchors = {};
        for (const target of t2Targets) {
            const parts = target.split(':');
            if (parts.length >= 3) {
                const dataPair = parts[1];
                const anchorIdx = parseInt(parts[2], 10);
                if (!pairAnchors[dataPair]) pairAnchors[dataPair] = new Set();
                pairAnchors[dataPair].add(anchorIdx);
            }
        }

        if (Object.keys(pairAnchors).length === 0) return null;

        // 3. Score each T2 pair and get NEXT row numbers
        const lastSpin = spins[spins.length - 1].actual;
        const scored = [];

        for (const [dataPair, anchors] of Object.entries(pairAnchors)) {
            const getRefNum = T2_PAIR_REFNUM[dataPair];
            if (!getRefNum) continue;

            const refNum = getRefNum(lastSpin);
            const lookupRow = this._getLookupRow(refNum);
            if (!lookupRow) continue;

            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const flashingTargets = [];
            for (const idx of anchors) {
                if (targets[idx] !== undefined) flashingTargets.push(targets[idx]);
            }

            if (flashingTargets.length === 0) continue;

            // Expand flashing anchor targets with ±2 wheel neighbors (Table 2 range)
            const numbers = this._getExpandTargetsToBetNumbers(flashingTargets, 2);

            scored.push({
                dataPair,
                anchorCount: anchors.size,
                targets: flashingTargets,
                numbers,
                score: anchors.size * 0.5 + numbers.length * 0.01
            });
        }

        if (scored.length === 0) return null;

        // 4. Pick best T2 pair (most anchors → then coverage)
        scored.sort((a, b) => b.score - a.score);
        return scored[0];
    }

    /**
     * Simulate T2 flash detection on plain number arrays.
     * Shared by both decide() (Auto mode) and _simulateDecision() (Test mode).
     *
     * @param {number[]} spins - Plain number array of spins
     * @param {number} idx - Current index
     * @returns {{ dataPair: string, anchorCount: number, targets: number[], numbers: number[], score: number } | null}
     */
    simulateT2FlashAndNumbers(spins, idx) {
        if (idx < 4) return null;

        // Build spin objects for _computeT2FlashTargets (needs {actual} format)
        const spinObjs = spins.slice(0, idx + 1).map(n => ({ actual: n }));
        const startIdx = Math.max(0, spinObjs.length - 8);
        const visibleCount = spinObjs.length - startIdx;

        const t2Targets = this._getComputeT2FlashTargets(spinObjs, startIdx, visibleCount);
        if (t2Targets.size === 0) return null;

        // Parse to { dataPair → Set<anchorIdx> }
        const pairAnchors = {};
        for (const target of t2Targets) {
            const parts = target.split(':');
            if (parts.length >= 3) {
                const dataPair = parts[1];
                const anchorIdx = parseInt(parts[2], 10);
                if (!pairAnchors[dataPair]) pairAnchors[dataPair] = new Set();
                pairAnchors[dataPair].add(anchorIdx);
            }
        }

        if (Object.keys(pairAnchors).length === 0) return null;

        // Score each pair, get NEXT row numbers
        const lastSpin = spins[idx - 1];
        const scored = [];

        for (const [dataPair, anchors] of Object.entries(pairAnchors)) {
            const getRefNum = T2_PAIR_REFNUM[dataPair];
            if (!getRefNum) continue;
            const refNum = getRefNum(lastSpin);
            const lookupRow = this._getLookupRow(refNum);
            if (!lookupRow) continue;

            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const flashingTargets = [];
            for (const ai of anchors) {
                if (targets[ai] !== undefined) flashingTargets.push(targets[ai]);
            }
            if (flashingTargets.length === 0) continue;

            const numbers = this._getExpandTargetsToBetNumbers(flashingTargets, 2);
            scored.push({
                dataPair,
                anchorCount: anchors.size,
                targets: flashingTargets,
                numbers,
                score: anchors.size * 0.5 + numbers.length * 0.01
            });
        }

        if (scored.length === 0) return null;
        scored.sort((a, b) => b.score - a.score);
        return scored[0];
    }

    // ═══════════════════════════════════════════════════════════
    //  SET PREDICTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Predict which one set (0/5/6) the next spin will land in.
     * Uses multiple signals: coverage overlap, recent frequency, anti-streak, historical.
     *
     * @param {number[]} combinedNumbers - Union of T2 + T3 prediction numbers
     * @param {number[]} recentSpins - Last 10 spin actuals
     * @returns {{ setKey: string, filterKey: string, score: number }}
     */
    _predictBestSet(combinedNumbers, recentSpins) {
        const set0 = this._getSet0Nums();
        const set5 = this._getSet5Nums();
        const set6 = this._getSet6Nums();

        const sets = [
            { key: 'set0', nums: set0, filterKey: 'both_both_set0' },
            { key: 'set5', nums: set5, filterKey: 'both_both_set5' },
            { key: 'set6', nums: set6, filterKey: 'both_both_set6' },
        ];

        let bestSet = sets[0];
        let bestScore = -Infinity;

        for (const s of sets) {
            let score = 0;

            // Factor 1 (40%): Coverage overlap — how many prediction numbers fall in this set
            const overlap = combinedNumbers.filter(n => s.nums.has(n)).length;
            score += (overlap / Math.max(combinedNumbers.length, 1)) * 0.40;

            // Factor 2 (30%): Recent frequency — how many of last 10 spins fell in this set
            const recent = recentSpins || [];
            const recentInSet = recent.filter(n => s.nums.has(n)).length;
            const recentRate = recent.length > 0 ? recentInSet / recent.length : (s.nums.size / 37);
            score += recentRate * 0.30;

            // Factor 3 (15%): Anti-streak — if this set hasn't appeared in last 3 spins, give bonus
            const last3 = recent.slice(-3);
            const last3InSet = last3.filter(n => s.nums.has(n)).length;
            if (last3InSet === 0 && recent.length >= 3) {
                score += 0.10;
            }

            // Factor 4 (15%): Historical filter model performance
            const fm = this.filterModels[s.filterKey];
            if (fm && fm.totalTrials > 0) {
                score += fm.hitRate * 0.15;
            }

            // Factor 5: Session filter performance (adaptive)
            const sf = this.session.filterPerformance[s.filterKey];
            if (sf && sf.attempts >= 3) {
                const sfRate = sf.hits / sf.attempts;
                score += sfRate * this.session.adaptationWeight * 0.10;
            }

            if (score > bestScore) {
                bestScore = score;
                bestSet = s;
            }
        }

        return { setKey: bestSet.key, filterKey: bestSet.filterKey, score: bestScore };
    }

    /**
     * Internal: Apply a filter combination to a set of numbers.
     */
    _applyFilterToNumbers(numbers, filterKey) {
        const combo = FILTER_COMBOS.find(f => f.key === filterKey);
        if (!combo) return numbers;

        const zeroNums = this._getZeroTableNums();
        const nineteenNums = this._getNineteenTableNums();
        const posNums = this._getPositiveNums();
        const negNums = this._getNegativeNums();

        // Get set numbers if needed
        let set0Nums, set5Nums, set6Nums;
        if (combo.set && combo.set !== 'all') {
            set0Nums = this._getSet0Nums();
            set5Nums = this._getSet5Nums();
            set6Nums = this._getSet6Nums();
        }

        return numbers.filter(num => {
            // Table filter
            const inZero = zeroNums.has(num);
            const inNineteen = nineteenNums.has(num);
            let tablePass;
            if (combo.table === 'both') {
                tablePass = inZero || inNineteen;
            } else if (combo.table === 'zero') {
                tablePass = inZero;
            } else {
                tablePass = inNineteen;
            }
            if (!tablePass) return false;

            // Sign filter
            const isPos = posNums.has(num);
            const isNeg = negNums.has(num);
            let signPass;
            if (combo.sign === 'both') {
                signPass = isPos || isNeg;
            } else if (combo.sign === 'positive') {
                signPass = isPos;
            } else {
                signPass = isNeg;
            }
            if (!signPass) return false;

            // Set filter
            if (combo.set && combo.set !== 'all') {
                if (combo.set === 'set0') return set0Nums.has(num);
                if (combo.set === 'set5') return set5Nums.has(num);
                if (combo.set === 'set6') return set6Nums.has(num);
            }

            return true;
        });
    }

    /**
     * Internal: Test all filter combinations against a projection.
     * @returns {{ [filterKey]: boolean }}
     */
    _testAllFilters(numbers, actual) {
        const result = {};
        FILTER_COMBOS.forEach(fc => {
            const filtered = this._applyFilterToNumbers(numbers, fc.key);
            result[fc.key] = filtered.includes(actual);
        });
        return result;
    }

    // ═══════════════════════════════════════════════════════════
    //  REAL-TIME DECISION MAKING
    // ═══════════════════════════════════════════════════════════

    /**
     * Main decision function: analyze current state and decide whether to BET or SKIP.
     *
     * @returns {{ action: string, selectedPair: string|null, selectedFilter: string|null,
     *             numbers: number[], anchors: number[], loose: number[],
     *             anchorGroups: Array, confidence: number, reason: string, debug: Object }}
     */
    decide() {
        const skipResult = (reason) => {
            this._currentDecisionSpins = null; // Clean up on skip
            return {
                action: 'SKIP',
                selectedPair: null,
                selectedFilter: null,
                numbers: [],
                anchors: [],
                loose: [],
                anchorGroups: [],
                confidence: 0,
                reason,
                debug: {}
            };
        };

        if (!this.isTrained) return skipResult('Engine not trained');
        if (!this.isEnabled) return skipResult('Engine not enabled');

        const currentSpins = this._getWindowSpins();
        if (!currentSpins || currentSpins.length < 4) return skipResult('Not enough spins');

        // Convert to plain number array — same format as _simulateDecision uses
        const plainSpins = currentSpins.map(s => typeof s === 'number' ? s : s.actual);
        const idx = plainSpins.length - 1;

        if (idx < 3) return skipResult('Insufficient history');

        // Set current decision spins for inner methods (_scorePair, _selectBestFilter)
        // This ensures they use the correct spins instead of _getWindowSpins()
        this._currentDecisionSpins = plainSpins;

        // ── Step 1: T3 Flash Detection + Pair Selection ──
        // Uses same engine internals as _simulateDecision (not renderer/DOM)
        const flashingPairs = this._getFlashingPairsFromHistory(plainSpins, idx);
        let t3Numbers = [];
        let t3BestPair = null;

        if (flashingPairs.size > 0) {
            const t3Candidates = [];
            for (const [refKey, flashInfo] of flashingPairs) {
                const pairName = REFKEY_TO_PAIR_NAME[refKey] || refKey;
                const projection = this._computeProjectionForPair(plainSpins, idx, refKey);
                if (projection && projection.numbers.length > 0) {
                    t3Candidates.push({ refKey, pairName, numbers: projection.numbers, data: projection });
                }
            }
            if (t3Candidates.length > 0) {
                const scored = t3Candidates.map(c => ({ ...c, score: this._scorePair(c.refKey, c) }));
                scored.sort((a, b) => b.score - a.score);
                t3BestPair = scored[0];
                t3Numbers = t3BestPair.numbers;
            }
        }

        // ── Step 2: T2 Flash Detection + NEXT Row Numbers ──
        // Uses same shared method as _simulateDecision
        const t2Data = this.simulateT2FlashAndNumbers(plainSpins, idx);
        const t2Numbers = t2Data ? t2Data.numbers : [];

        // ── Must have at least one source ──
        if (t3Numbers.length === 0 && t2Numbers.length === 0) {
            return skipResult('No T2 or T3 flash data available');
        }

        // ── Step 3: Combine T2 + T3 Numbers ──
        const combinedSet = new Set([...t3Numbers, ...t2Numbers]);
        const combinedNumbers = Array.from(combinedSet);

        // ── Step 4: Predict Best Set ──
        const recentSpins = plainSpins.slice(Math.max(0, idx - 10), idx);
        const setPrediction = this._predictBestSet(combinedNumbers, recentSpins);

        // ── Step 5: Apply both_both_setN Filter ──
        const filteredNumbers = this._applyFilterToNumbers(combinedNumbers, setPrediction.filterKey);

        // ── Step 6: Confidence + BET/SKIP ──
        const pairScore = t3BestPair ? this._scorePair(t3BestPair.refKey, t3BestPair) : 0.5;
        const anchorsResult = this._getCalculateWheelAnchors(filteredNumbers);
        const anchors = anchorsResult ? anchorsResult.anchors : [];
        const loose = anchorsResult ? anchorsResult.loose : [];
        const anchorGroups = anchorsResult ? anchorsResult.anchorGroups : [];

        const confidence = this._computeConfidence(pairScore, setPrediction.score, filteredNumbers);

        const effectiveThreshold = this.confidenceThreshold;
        const forcebet = this.session.consecutiveSkips >= this.maxConsecutiveSkips;
        let action, reason;

        if (confidence >= effectiveThreshold || forcebet) {
            action = 'BET';
            const pairName = t3BestPair ? t3BestPair.pairName : (t2Data ? t2Data.dataPair : 'unknown');
            reason = forcebet && confidence < effectiveThreshold
                ? `Forced bet after ${this.session.consecutiveSkips} skips (conf: ${confidence}%)`
                : `T2:${t2Data ? t2Data.dataPair : 'none'}+T3:${t3BestPair ? t3BestPair.pairName : 'none'} → ${setPrediction.filterKey} (conf: ${confidence}%)`;
        } else {
            action = 'SKIP';
            reason = `Low confidence ${confidence}% < ${effectiveThreshold}% threshold (skip ${this.session.consecutiveSkips + 1}/${this.maxConsecutiveSkips})`;
        }

        // Clean up decision spins context
        this._currentDecisionSpins = null;

        return {
            action,
            selectedPair: t3BestPair ? t3BestPair.pairName : (t2Data ? t2Data.dataPair : null),
            selectedFilter: setPrediction.filterKey,
            numbers: filteredNumbers,
            anchors, loose, anchorGroups, confidence, reason,
            debug: {
                t3FlashingRefKeys: Array.from(flashingPairs.keys()),
                t2FlashPair: t2Data ? t2Data.dataPair : null,
                t2AnchorCount: t2Data ? t2Data.anchorCount : 0,
                t3NumberCount: t3Numbers.length,
                t2NumberCount: t2Numbers.length,
                combinedCount: combinedNumbers.length,
                filteredCount: filteredNumbers.length,
                predictedSet: setPrediction.setKey,
                setScore: setPrediction.score
            }
        };
    }

    /**
     * Score a pair based on historical training + session data.
     */
    _scorePair(refKey, pairData) {
        const model = this.pairModels[refKey];
        if (!model || model.totalFlashes === 0) return 0;

        // Historical score — v2 uses Bayesian UCB, v1 uses static coverageEfficiency
        let historicalScore;
        if (this.learningVersion === 'v2' && this.pairBayesian && this.pairBayesian[refKey]) {
            const bay = this.pairBayesian[refKey];
            const mean = bay.alpha / (bay.alpha + bay.beta);
            const n = bay.alpha + bay.beta;
            // UCB exploration bonus: less-tried pairs get a boost
            const exploration = Math.sqrt(2 * Math.log((this._totalBayesianDecisions || 1) + 1) / n);
            historicalScore = Math.min(1.0, mean + exploration * 0.3);
        } else {
            // v1 fallback: original coverageEfficiency
            historicalScore = model.coverageEfficiency;
            // Normalize: typical efficiency is 1.0-3.0, scale to 0-1
            historicalScore = Math.min(historicalScore / 3.0, 1.0);
        }

        // Session score
        let sessionScore = 0;
        const sp = this.session.pairPerformance[refKey];
        if (sp && sp.attempts > 0) {
            sessionScore = sp.hits / sp.attempts;
        }

        // Blend
        const sessionWeight = this.session.adaptationWeight;
        const histWeight = 1 - sessionWeight;
        let composite = histWeight * historicalScore + sessionWeight * sessionScore;

        // Bonuses
        // Consecutive flash bonus: check if pair was in last decision
        const lastDecision = this.session.recentDecisions.length > 0
            ? this.session.recentDecisions[this.session.recentDecisions.length - 1]
            : null;
        if (lastDecision && lastDecision.refKey === refKey) {
            composite += 0.10;
        }

        // Position code quality bonus
        if (this.learningVersion === 'v2' && this.posCodePerformance && pairData && pairData.codes) {
            // v2: Use learned position code performance
            let codeBonus = 0;
            let codeCount = 0;
            pairData.codes.forEach(code => {
                const perf = this.posCodePerformance[code];
                if (perf && perf.attempts >= 10) {
                    codeBonus += perf.hitRate;
                    codeCount++;
                }
            });
            if (codeCount > 0) {
                const avgCodeRate = codeBonus / codeCount;
                // Scale: 0.30 hitRate → 0, 0.60 hitRate → 0.15
                composite += Math.max(0, (avgCodeRate - 0.30) * 0.5);
            }
        } else {
            // v1: static threshold-based bonus
            if (model.hitRate >= 0.35) {
                composite += 0.15; // Golden-level performance
            } else if (model.hitRate >= 0.25) {
                composite += 0.10; // Near-golden performance
            }
        }

        // v2: Sequence model alignment — does this pair's projection match predicted pattern?
        if (this.learningVersion === 'v2' && this.sequenceModel && this.sequenceModel.isTrained) {
            // Use _currentDecisionSpins (set by decide/_simulateDecision) — avoids hidden _getWindowSpins dependency.
            // Convert to plain numbers since sequence model's classify() expects numbers, not objects.
            const rawSpins = this._currentDecisionSpins || this._getWindowSpins() || [];
            const plainForSeq = rawSpins.map(s => typeof s === 'number' ? s : s.actual);
            if (plainForSeq.length >= 1) {
                const prediction = this.sequenceModel.predict(plainForSeq);
                const projNumbers = pairData && pairData.numbers ? pairData.numbers : [];
                if (projNumbers.length > 0 && prediction) {
                    const alignment = this._computeSequenceAlignment(projNumbers, prediction);
                    composite += alignment * 0.15;  // Up to +0.15 for strong alignment
                }
            }
        }

        // Recency bonus: hit or near-miss in last 3 session bets
        // Near-misses get 0.5× credit (engine direction was right, just off by 1 pocket)
        const recentForPair = this.session.recentDecisions.slice(-3)
            .filter(d => d.refKey === refKey);
        const recentFullHits = recentForPair.filter(d => d.hit).length;
        const recentNearMisses = recentForPair.filter(d => d.nearMiss && !d.hit).length;
        const recentCredit = recentFullHits + recentNearMisses * 0.5;
        if (recentCredit > 0) {
            composite += 0.05 * recentCredit;
        }

        // Penalties
        // Drought: not hit in last 5 bets for this pair
        const recentAttempts = this.session.recentDecisions
            .filter(d => d.refKey === refKey);
        if (recentAttempts.length >= 5) {
            const lastHitIdx = [...recentAttempts].reverse().findIndex(d => d.hit);
            if (lastHitIdx === -1 || lastHitIdx >= 5) {
                composite -= 0.10;
            }
        }

        // Overexposure: selected 3+ times in last 5 decisions
        const recentSelections = this.session.recentDecisions.slice(-5)
            .filter(d => d.refKey === refKey).length;
        if (recentSelections >= 3) {
            composite -= 0.05;
        }

        // v2: Projection sign balance penalty — prefer pairs with mixed-sign projections
        // When both anchors land in the same sign territory, projection is 100% one-sign
        // which eliminates all opposite-sign filters and forces a one-sided bet.
        if (this.learningVersion === 'v2' && pairData && pairData.numbers && pairData.numbers.length > 0) {
            const posNums = this._getPositiveNums();
            const negNums = this._getNegativeNums();
            const posCount = pairData.numbers.filter(n => posNums.has(n)).length;
            const negCount = pairData.numbers.filter(n => negNums.has(n)).length;
            const total = posCount + negCount;
            if (total > 0) {
                const signMinority = Math.min(posCount, negCount);
                const signRatio = signMinority / total;
                if (signRatio < 0.1) {
                    composite -= 0.15; // Pure one-sign: strong penalty
                } else if (signRatio < 0.2) {
                    composite -= 0.08; // Heavily one-sign: moderate penalty
                }
            }
        }

        return Math.max(0, Math.min(1.0, composite));
    }

    /**
     * Select the best filter combination for given numbers.
     * @param {number[]} numbers - Unfiltered projection numbers
     * @param {string} [selectedRefKey] - v2: The selected pair's refKey for cross-performance lookup
     */
    _selectBestFilter(numbers, selectedRefKey) {
        let bestFilter = { filterKey: 'both_both', filteredNumbers: [...numbers], score: 0 };
        let bestScore = -Infinity;

        // Cache sequence model scores (computed once, used per filter)
        let sequenceFilterScores = null;
        if (this.sequenceModel && this.sequenceModel.isTrained) {
            // Use _currentDecisionSpins (set by decide/_simulateDecision) — avoids hidden _getWindowSpins dependency.
            // Convert to plain numbers since sequence model's classify() expects numbers, not objects.
            const rawSpins = this._currentDecisionSpins || this._getWindowSpins() || [];
            const plainForSeq = rawSpins.map(s => typeof s === 'number' ? s : s.actual);
            if (plainForSeq.length >= 1) {
                const seqResult = this.sequenceModel.scoreFilterCombos(plainForSeq);
                sequenceFilterScores = seqResult.scores;
                sequenceFilterScores._confident = seqResult.confident;
            }
        }

        // Determine if sequence model is confident on either axis
        const seqConfident = sequenceFilterScores && sequenceFilterScores._confident;

        FILTER_COMBOS.forEach(fc => {
            // NEVER actively choose both_both with set='all' — it provides no filtering value.
            // It's already the default fallback (line 646) for when no filter works.
            // BUT both_both with a specific set (set0/set5/set6) IS valid (12-13 numbers).
            if (fc.key === 'both_both' && (!fc.set || fc.set === 'all')) return;

            const filtered = this._applyFilterToNumbers(numbers, fc.key);

            // Skip filters that produce too few or too many numbers
            if (filtered.length < 4 || filtered.length > 18) return;

            // Score
            const fm = this.filterModels[fc.key];
            let historicalScore = fm && fm.totalTrials > 0 ? fm.hitRate : 0;

            // Session filter score
            let sessionScore = 0;
            const sf = this.session.filterPerformance[fc.key];
            if (sf && sf.attempts > 0) {
                sessionScore = sf.hits / sf.attempts;
            }

            const sessionWeight = this.session.adaptationWeight;
            const histWeight = 1 - sessionWeight;
            let score = histWeight * historicalScore + sessionWeight * sessionScore;

            // Coverage scoring: wider coverage is SAFER, restrict only with evidence
            // Penalize overly restrictive filters (< 6 numbers) — too narrow to be reliable
            if (filtered.length < 6) {
                score -= 0.03;
            }
            // Mild penalty for excess numbers above 16 (too scattered)
            if (filtered.length > 16) {
                score -= (filtered.length - 16) * 0.005;
            }

            // Sequence model: the main intelligence for filter selection
            if (sequenceFilterScores) {
                const seqScore = sequenceFilterScores[fc.key] || 0;

                if (this.learningVersion === 'v2') {
                    // v2: gradient weighting — always use signal, weighted by confidence
                    const seqWeight = seqConfident ? 1.0 : 0.4;
                    const hitValue = (seqScore / filtered.length) * 37;
                    score += hitValue * 0.10 * seqWeight;
                } else {
                    // v1: binary gate — only apply when confident
                    if (seqConfident) {
                        const hitValue = (seqScore / filtered.length) * 37;
                        score += hitValue * 0.10;
                    } else {
                        if (fc.table !== 'both' && fc.sign !== 'both') {
                            score -= 0.04;
                        } else if (fc.table !== 'both' || fc.sign !== 'both') {
                            score -= 0.01;
                        }
                    }
                }
            }

            // v2: Cross-performance boost/penalty for this pair+filter combo
            if (this.learningVersion === 'v2' && selectedRefKey) {
                const crossKey = `${selectedRefKey}|${fc.key}`;
                const cross = this.session.pairFilterCross[crossKey];
                if (cross && cross.attempts >= 3) {
                    const crossRate = cross.hits / cross.attempts;
                    score += (crossRate - 0.3) * 0.20;  // ±0.20 based on performance
                }
            }

            // v2: Sign diversity penalty — penalize filters that produce 100% one-sign results.
            // When all filtered numbers are the same sign, coverage is structurally weak.
            if (this.learningVersion === 'v2') {
                const posNums = this._getPositiveNums();
                const negNums = this._getNegativeNums();
                const fPosCount = filtered.filter(n => posNums.has(n)).length;
                const fNegCount = filtered.filter(n => negNums.has(n)).length;
                const fTotal = fPosCount + fNegCount;
                if (fTotal > 0) {
                    const fMinority = Math.min(fPosCount, fNegCount);
                    const fSignRatio = fMinority / fTotal;
                    if (fSignRatio === 0) {
                        score -= 0.06; // 100% one-sign: significant penalty
                    } else if (fSignRatio < 0.15) {
                        score -= 0.03; // Heavily one-sign: mild penalty
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestFilter = { filterKey: fc.key, filteredNumbers: filtered, score };
            }
        });

        return bestFilter;
    }

    /**
     * Compute final confidence score (0-100).
     */
    _computeConfidence(pairScore, filterScore, finalNumbers) {
        let confidence = pairScore * 100;

        // Projection size adjustment
        const count = finalNumbers.length;
        if (count > 14) {
            confidence -= (count - 14) * 2; // Penalty for too many
        } else if (count < 8 && count > 0) {
            confidence += (8 - count) * 2;  // Bonus for focused
        }

        // Filter improvement bonus
        if (filterScore > 0.1) {
            confidence += 5;
        }

        // Session momentum
        if (this.session.totalBets >= 5) {
            if (this.session.sessionWinRate > 0.35) {
                confidence += 5;
            } else if (this.session.sessionWinRate < 0.20) {
                confidence -= 5;
            }
        }

        // Consecutive skip pressure (makes us more willing to bet)
        if (this.session.consecutiveSkips > 0) {
            confidence += this.session.consecutiveSkips * 3;
        }

        // Sign balance penalty — MULTIPLICATIVE, applied LAST after all bonuses.
        // When projection is heavily one-sided (all positive or all negative),
        // the AI covers only ~50% of outcomes. This multiplier ensures the penalty
        // cannot be overcome by additive bonuses (filter, momentum, skip pressure).
        if (finalNumbers.length > 0) {
            const posNums = this._getPositiveNums();
            const negNums = this._getNegativeNums();
            const posCount = finalNumbers.filter(n => posNums.has(n)).length;
            const negCount = finalNumbers.filter(n => negNums.has(n)).length;
            const total = posCount + negCount;
            if (total > 0) {
                const minority = Math.min(posCount, negCount);
                const signRatio = minority / total;  // 0 = all one sign, 0.5 = balanced
                if (signRatio < 0.1) {
                    // Pure one-sign (0-10% minority): 45% reduction
                    confidence *= 0.55;
                } else if (signRatio < 0.2) {
                    // Heavily one-sign (10-20% minority): 25% reduction
                    confidence *= 0.75;
                }
            }
        }

        return Math.max(0, Math.min(100, Math.round(confidence)));
    }

    // ═══════════════════════════════════════════════════════════
    //  SESSION ADAPTATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Record the result of a bet for session adaptation.
     *
     * @param {string} pairKey - Pair name or refKey
     * @param {string} filterKey - Filter combination key
     * @param {boolean} hit - Whether the actual number was in predicted set
     * @param {number} actual - The actual roulette number that appeared
     * @param {number[]} [predictedNumbers=[]] - Numbers that were bet on (for near-miss detection)
     */
    recordResult(pairKey, filterKey, hit, actual, predictedNumbers = []) {
        // Convert pairName to refKey if needed
        const refKey = PAIR_NAME_TO_REFKEY[pairKey] || pairKey;

        // Collect live spin for retrain
        if (typeof actual === 'number' && actual >= 0 && actual <= 36) {
            this.liveSpins.push(actual);
        }

        this.session.totalBets++;
        if (hit) {
            this.session.wins++;
            this.session.consecutiveLosses = 0;
            this.session.cooldownActive = false; // Exit cooldown on any win
        } else {
            this.session.losses++;
            this.session.consecutiveLosses++;
            if (this.session.consecutiveLosses >= 3) {
                this.session.cooldownActive = true;
            }
        }
        this.session.consecutiveSkips = 0;

        // Near-miss detection: actual is ±1 pocket from any predicted number on wheel
        const nearMiss = !hit && predictedNumbers.length > 0 && this._isNearMiss(actual, predictedNumbers);
        if (nearMiss) {
            this.session.nearMisses++;
        }

        // Per-pair performance
        if (!this.session.pairPerformance[refKey]) {
            this.session.pairPerformance[refKey] = { attempts: 0, hits: 0 };
        }
        this.session.pairPerformance[refKey].attempts++;
        if (hit) this.session.pairPerformance[refKey].hits++;

        // Per-filter performance
        if (!this.session.filterPerformance[filterKey]) {
            this.session.filterPerformance[filterKey] = { attempts: 0, hits: 0 };
        }
        this.session.filterPerformance[filterKey].attempts++;
        if (hit) this.session.filterPerformance[filterKey].hits++;

        // Update session win rate
        this.session.sessionWinRate = this.session.wins / this.session.totalBets;

        // Recent decisions (keep last 10) — includes nearMiss flag
        this.session.recentDecisions.push({ refKey, filterKey, hit, nearMiss });
        if (this.session.recentDecisions.length > 10) {
            this.session.recentDecisions.shift();
        }

        // Grow adaptation weight
        if (this.session.totalBets >= this.sessionAdaptationStart) {
            this.session.adaptationWeight = Math.min(
                0.5,
                0.1 + (this.session.totalBets - this.sessionAdaptationStart) * 0.02
            );
        }

        // v2 learning updates
        if (this.learningVersion === 'v2') {
            // Bayesian: update alpha/beta for the pair
            if (this.pairBayesian && this.pairBayesian[refKey]) {
                if (hit) this.pairBayesian[refKey].alpha++;
                else this.pairBayesian[refKey].beta++;
                this._totalBayesianDecisions++;
            }

            // Cross-performance: track pair+filter combo
            const crossKey = `${refKey}|${filterKey}`;
            if (!this.session.pairFilterCross[crossKey]) {
                this.session.pairFilterCross[crossKey] = { attempts: 0, hits: 0 };
            }
            this.session.pairFilterCross[crossKey].attempts++;
            if (hit) this.session.pairFilterCross[crossKey].hits++;

            // EMA: incrementally shift pair/filter hit rates
            this._emaUpdate(refKey, filterKey, hit);
        }

        // Check if live retrain is needed
        this._checkRetrainNeeded();
    }

    /**
     * Detect if actual number is ±1 pocket from any predicted number on the European wheel.
     * For learning only — P&L is unchanged (a miss is still a financial loss).
     *
     * @param {number} actual - The actual number that appeared
     * @param {number[]} predictedNumbers - Numbers that were bet on
     * @returns {boolean} True if actual is adjacent to any predicted number on the wheel
     */
    _isNearMiss(actual, predictedNumbers) {
        const idx = EUROPEAN_WHEEL.indexOf(actual);
        if (idx === -1) return false;
        const leftNeighbor = EUROPEAN_WHEEL[(idx - 1 + 37) % 37];
        const rightNeighbor = EUROPEAN_WHEEL[(idx + 1) % 37];
        return predictedNumbers.includes(leftNeighbor) || predictedNumbers.includes(rightNeighbor);
    }

    /**
     * Compute how well a set of numbers aligns with the sequence model's prediction.
     * Returns 0 to ~1 — higher means better alignment.
     */
    _computeSequenceAlignment(numbers, prediction) {
        if (!numbers || numbers.length === 0 || !prediction) return 0;
        const zeroNums = this._getZeroTableNums();
        const nineNums = this._getNineteenTableNums();
        const posNums = this._getPositiveNums();
        const negNums = this._getNegativeNums();

        const zeroCount = numbers.filter(n => zeroNums.has(n)).length;
        const nineCount = numbers.filter(n => nineNums.has(n)).length;
        const posCount = numbers.filter(n => posNums.has(n)).length;
        const negCount = numbers.filter(n => negNums.has(n)).length;

        const pZero = prediction.pZeroTable || 0;
        const pNine = prediction.pNineteenTable || 0;
        const pPos = prediction.pPositive || 0;
        const pNeg = prediction.pNegative || 0;

        const tableAlignment = (pZero * zeroCount + pNine * nineCount) / numbers.length;
        const signAlignment = (pPos * posCount + pNeg * negCount) / numbers.length;

        return (tableAlignment + signAlignment) / 2;
    }

    /**
     * v2: EMA (Exponential Moving Average) update for live learning.
     * Incrementally shifts pair/filter hit rates toward recent results.
     */
    _emaUpdate(refKey, filterKey, hit) {
        if (this.learningVersion !== 'v2') return;

        // EMA update pair model hit rate
        const model = this.pairModels[refKey];
        if (model && model.totalFlashes > 0) {
            const target = hit ? 1.0 : 0.0;
            model.hitRate = model.hitRate * (1 - this.emaDecay) + target * this.emaDecay;
            const randomRate = model.avgProjectionSize / 37;
            model.coverageEfficiency = randomRate > 0 ? model.hitRate / randomRate : 0;
        }

        // EMA update filter model hit rate
        const fModel = this.filterModels[filterKey];
        if (fModel && fModel.totalTrials > 0) {
            const target = hit ? 1.0 : 0.0;
            fModel.hitRate = fModel.hitRate * (1 - this.emaDecay) + target * this.emaDecay;
        }
    }

    /**
     * Record a skip decision.
     * Pushes a neutral entry to recentDecisions so the "consecutive flash bonus"
     * doesn't stale-lock on the last BET pair across unlimited SKIPs.
     */
    recordSkip() {
        this.session.consecutiveSkips++;
        // Push a skip marker — refKey: null means no pair gets the consecutive bonus
        this.session.recentDecisions.push({ refKey: null, filterKey: null, hit: false, nearMiss: false, skipped: true });
        if (this.session.recentDecisions.length > 10) {
            this.session.recentDecisions.shift();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  LIVE RETRAIN
    // ═══════════════════════════════════════════════════════════

    /**
     * Check if live retrain is needed based on bet count or loss streak.
     * Triggers after _retrainInterval bets or _retrainLossStreak consecutive losses.
     */
    _checkRetrainNeeded() {
        if (!this._originalTrainingData || this.liveSpins.length < 5) return;

        const betsSinceRetrain = this.session.totalBets - this._lastRetrainBetCount;
        const lossStreakTrigger = this.session.consecutiveLosses >= this._retrainLossStreak;
        const intervalTrigger = betsSinceRetrain >= this._retrainInterval;

        if (lossStreakTrigger || intervalTrigger) {
            const reason = lossStreakTrigger
                ? `${this.session.consecutiveLosses} consecutive losses`
                : `${betsSinceRetrain} bets since last retrain`;
            console.log(`🔄 LIVE RETRAIN triggered: ${reason} (${this.liveSpins.length} live spins)`);
            this.retrain();
        }
    }

    /**
     * Retrain by merging original training data with accumulated live spins.
     * Preserves isEnabled state and session stats (totalBets, wins, etc.)
     * but resets adaptationWeight to 0 since models now include live data.
     */
    retrain() {
        if (!this._originalTrainingData) {
            console.warn('⚠️ Cannot retrain: no original training data stored');
            return;
        }

        if (this.learningVersion === 'v2') {
            // v2: Only retrain sequence model — pair/filter models update via EMA
            if (this.sequenceModel) {
                const mergedSessions = [...this._originalTrainingData, this.liveSpins];
                this.sequenceModel.train(mergedSessions);
            }
            this._lastRetrainBetCount = this.session.totalBets;
            console.log(`✅ v2 RETRAIN: sequence model updated (${this.liveSpins.length} live spins)`);
            return;
        }

        // v1: Full retrain (original behavior)
        const mergedSessions = [...this._originalTrainingData, this.liveSpins];
        const wasEnabled = this.isEnabled;
        const savedSession = { ...this.session };

        // train() will update pairModels and filterModels with live data trends
        const result = this.train(mergedSessions);

        // Restore session state (train() resets it)
        this.isEnabled = wasEnabled;
        this.session = savedSession;
        this.session.adaptationWeight = 0; // Reset since models now include live data
        this._lastRetrainBetCount = this.session.totalBets;

        console.log(`✅ LIVE RETRAIN complete: ${result.totalSpins} total spins, hit rate: ${(result.overallHitRate * 100).toFixed(1)}%`);
        return result;
    }

    // ═══════════════════════════════════════════════════════════
    //  MODE CONTROL
    // ═══════════════════════════════════════════════════════════

    /**
     * Set learning version: 'v1' = original static, 'v2' = adaptive learning.
     * If already trained, re-trains with new version to initialize properly.
     */
    setLearningVersion(version) {
        if (version !== 'v1' && version !== 'v2') {
            throw new Error('learningVersion must be "v1" or "v2"');
        }
        this.learningVersion = version;
        if (this._originalTrainingData) {
            this.train(this._originalTrainingData);
        }
    }

    enable() {
        if (!this.isTrained) {
            throw new Error('Engine must be trained before enabling');
        }
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    resetSession() {
        this.session = this._createSessionTracker();
        this.lastDecision = null;
        this._currentDecisionSpins = null;
        this.liveSpins = [];
        this._lastRetrainBetCount = 0;
    }

    fullReset() {
        this.isTrained = false;
        this.isEnabled = false;
        this.pairModels = {};
        this.filterModels = {};
        this.pairBayesian = {};
        this._totalBayesianDecisions = 0;
        this.posCodePerformance = {};
        this.session = this._createSessionTracker();
        this._currentDecisionSpins = null;
        this.liveSpins = [];
        this._originalTrainingData = null;
        this._lastRetrainBetCount = 0;
        if (this.sequenceModel) this.sequenceModel.reset();
    }

    getState() {
        return {
            isTrained: this.isTrained,
            isEnabled: this.isEnabled,
            learningVersion: this.learningVersion,
            pairModelCount: Object.keys(this.pairModels).length,
            sessionStats: { ...this.session },
            topPairs: this._getTopPairs(3),
            topFilters: this._getTopFilters(3),
            sequenceStats: this.sequenceModel ? this.sequenceModel.getStats() : null,
            bayesianStats: this.learningVersion === 'v2' ? this._getBayesianStats() : null,
            posCodeStats: this.learningVersion === 'v2' ? this._getPosCodeStats() : null
        };
    }

    _getBayesianStats() {
        if (!this.pairBayesian) return null;
        const stats = {};
        Object.entries(this.pairBayesian).forEach(([refKey, bay]) => {
            const mean = bay.alpha / (bay.alpha + bay.beta);
            stats[refKey] = {
                alpha: bay.alpha,
                beta: bay.beta,
                mean: Math.round(mean * 1000) / 1000,
                samples: bay.alpha + bay.beta
            };
        });
        return { totalDecisions: this._totalBayesianDecisions, pairs: stats };
    }

    _getPosCodeStats() {
        if (!this.posCodePerformance) return null;
        const stats = {};
        Object.entries(this.posCodePerformance)
            .filter(([_, p]) => p.attempts >= 5)
            .sort((a, b) => b[1].hitRate - a[1].hitRate)
            .forEach(([code, p]) => {
                stats[code] = {
                    attempts: p.attempts,
                    hits: p.hits,
                    hitRate: Math.round(p.hitRate * 1000) / 1000
                };
            });
        return stats;
    }

    _getTopPairs(n) {
        return Object.entries(this.pairModels)
            .filter(([_, m]) => m.totalFlashes > 0)
            .sort((a, b) => b[1].coverageEfficiency - a[1].coverageEfficiency)
            .slice(0, n)
            .map(([key, m]) => ({
                pairKey: key,
                hitRate: Math.round(m.hitRate * 1000) / 1000,
                efficiency: Math.round(m.coverageEfficiency * 1000) / 1000
            }));
    }

    _getTopFilters(n) {
        return Object.entries(this.filterModels)
            .filter(([_, m]) => m.totalTrials > 0)
            .sort((a, b) => b[1].hitRate - a[1].hitRate)
            .slice(0, n)
            .map(([key, m]) => ({
                filterKey: key,
                hitRate: Math.round(m.hitRate * 1000) / 1000,
                avgSize: Math.round(m.avgFilteredCount * 10) / 10
            }));
    }

    // ═══════════════════════════════════════════════════════════
    //  DEPENDENCY ACCESS — Abstracted for testability
    //  At runtime these read from window.*
    //  In tests, they can be overridden via injection
    // ═══════════════════════════════════════════════════════════

    _getCalculatePositionCode(reference, actual) {
        if (typeof calculatePositionCode === 'function') return calculatePositionCode(reference, actual);
        if (typeof window !== 'undefined' && typeof window.calculatePositionCode === 'function') return window.calculatePositionCode(reference, actual);
        throw new Error('calculatePositionCode not available');
    }

    _getCalculateReferences(prev, prevPrev) {
        if (typeof calculateReferences === 'function') return calculateReferences(prev, prevPrev);
        if (typeof window !== 'undefined' && typeof window.calculateReferences === 'function') return window.calculateReferences(prev, prevPrev);
        throw new Error('calculateReferences not available');
    }

    _getDigit13Opposite(num) {
        if (typeof DIGIT_13_OPPOSITES !== 'undefined') return DIGIT_13_OPPOSITES[num];
        if (typeof window !== 'undefined' && window.DIGIT_13_OPPOSITES) return window.DIGIT_13_OPPOSITES[num];
        throw new Error('DIGIT_13_OPPOSITES not available');
    }

    _getGenerateAnchors(refNum, ref13Opp, posCode) {
        if (typeof generateAnchors === 'function') return generateAnchors(refNum, ref13Opp, posCode);
        if (typeof window !== 'undefined' && typeof window.generateAnchors === 'function') return window.generateAnchors(refNum, ref13Opp, posCode);
        throw new Error('generateAnchors not available');
    }

    _getExpandAnchorsToBetNumbers(purple, green) {
        if (typeof expandAnchorsToBetNumbers === 'function') return expandAnchorsToBetNumbers(purple, green);
        if (typeof window !== 'undefined' && typeof window.expandAnchorsToBetNumbers === 'function') return window.expandAnchorsToBetNumbers(purple, green);
        throw new Error('expandAnchorsToBetNumbers not available');
    }

    _getGetPosCodeDistance(posCode) {
        if (typeof _getPosCodeDistance === 'function') return _getPosCodeDistance(posCode);
        if (typeof window !== 'undefined' && typeof window._getPosCodeDistance === 'function') return window._getPosCodeDistance(posCode);
        // Fallback inline implementation
        if (!posCode || posCode === 'XX') return null;
        const m = posCode.match(/[+\-](\d+)$/);
        return m ? parseInt(m[1], 10) : null;
    }

    _getComputeFlashTargets(allSpins, startIdx, visibleCount) {
        if (typeof _computeFlashTargets === 'function') return _computeFlashTargets(allSpins, startIdx, visibleCount);
        if (typeof window !== 'undefined' && typeof window._computeFlashTargets === 'function') return window._computeFlashTargets(allSpins, startIdx, visibleCount);
        // Fallback: return empty Set (flash unavailable)
        return new Set();
    }

    _getComputeT2FlashTargets(allSpins, startIdx, visibleCount) {
        if (typeof _computeT2FlashTargets === 'function') return _computeT2FlashTargets(allSpins, startIdx, visibleCount);
        if (typeof window !== 'undefined' && typeof window._computeT2FlashTargets === 'function')
            return window._computeT2FlashTargets(allSpins, startIdx, visibleCount);
        return new Set();
    }

    _getLookupRow(refNum) {
        if (typeof getLookupRow === 'function') return getLookupRow(refNum);
        if (typeof window !== 'undefined' && typeof window.getLookupRow === 'function')
            return window.getLookupRow(refNum);
        return null;
    }

    _getExpandTargetsToBetNumbers(targets, neighborRange) {
        if (typeof expandTargetsToBetNumbers === 'function')
            return expandTargetsToBetNumbers(targets, neighborRange);
        if (typeof window !== 'undefined' && typeof window.expandTargetsToBetNumbers === 'function')
            return window.expandTargetsToBetNumbers(targets, neighborRange);
        return targets; // Fallback: return raw targets
    }

    _getCalculateWheelAnchors(numbers) {
        if (!numbers || numbers.length === 0) return { anchors: [], loose: [], anchorGroups: [] };
        if (typeof calculateWheelAnchors === 'function') return calculateWheelAnchors(numbers);
        if (typeof window !== 'undefined' && typeof window.calculateWheelAnchors === 'function') return window.calculateWheelAnchors(numbers);
        // Fallback: no anchor calculation
        return { anchors: [], loose: [...numbers], anchorGroups: [] };
    }

    _getWindowSpins() {
        if (typeof window !== 'undefined' && window.spins) return window.spins;
        return null;
    }

    _getAIDataV6() {
        if (typeof window !== 'undefined' && typeof window.getAIDataV6 === 'function') return window.getAIDataV6();
        return null;
    }

    _getZeroTableNums() {
        if (typeof ZERO_TABLE_NUMS !== 'undefined') return ZERO_TABLE_NUMS;
        if (typeof window !== 'undefined' && window.ZERO_TABLE_NUMS) return window.ZERO_TABLE_NUMS;
        // Fallback inline definition
        return new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
    }

    _getNineteenTableNums() {
        if (typeof NINETEEN_TABLE_NUMS !== 'undefined') return NINETEEN_TABLE_NUMS;
        if (typeof window !== 'undefined' && window.NINETEEN_TABLE_NUMS) return window.NINETEEN_TABLE_NUMS;
        return new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
    }

    _getPositiveNums() {
        if (typeof POSITIVE_NUMS !== 'undefined') return POSITIVE_NUMS;
        if (typeof window !== 'undefined' && window.POSITIVE_NUMS) return window.POSITIVE_NUMS;
        return new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
    }

    _getNegativeNums() {
        if (typeof NEGATIVE_NUMS !== 'undefined') return NEGATIVE_NUMS;
        if (typeof window !== 'undefined' && window.NEGATIVE_NUMS) return window.NEGATIVE_NUMS;
        return new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);
    }

    _getSet0Nums() {
        if (typeof SET_0_NUMS !== 'undefined') return SET_0_NUMS;
        if (typeof window !== 'undefined' && window.SET_0_NUMS) return window.SET_0_NUMS;
        return new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
    }

    _getSet5Nums() {
        if (typeof SET_5_NUMS !== 'undefined') return SET_5_NUMS;
        if (typeof window !== 'undefined' && window.SET_5_NUMS) return window.SET_5_NUMS;
        return new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
    }

    _getSet6Nums() {
        if (typeof SET_6_NUMS !== 'undefined') return SET_6_NUMS;
        if (typeof window !== 'undefined' && window.SET_6_NUMS) return window.SET_6_NUMS;
        return new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS, REFKEY_TO_PAIR_NAME, PAIR_NAME_TO_REFKEY, EUROPEAN_WHEEL, T2_PAIR_KEYS, T2_PAIR_REFNUM };
}
if (typeof window !== 'undefined') {
    window.AIAutoEngine = AIAutoEngine;
    window.FILTER_COMBOS = FILTER_COMBOS;
}

console.log('✅ AI Auto Engine script loaded');
