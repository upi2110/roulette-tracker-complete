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

// ── Filter Combinations ──
const FILTER_COMBOS = [
    { key: 'zero_positive',     table: 'zero',     sign: 'positive' },
    { key: 'zero_negative',     table: 'zero',     sign: 'negative' },
    { key: 'zero_both',         table: 'zero',     sign: 'both' },
    { key: 'nineteen_positive', table: 'nineteen', sign: 'positive' },
    { key: 'nineteen_negative', table: 'nineteen', sign: 'negative' },
    { key: 'nineteen_both',     table: 'nineteen', sign: 'both' },
    { key: 'both_positive',     table: 'both',     sign: 'positive' },
    { key: 'both_negative',     table: 'both',     sign: 'negative' },
    { key: 'both_both',         table: 'both',     sign: 'both' },
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

// Golden position codes — highest priority patterns
const GOLDEN_CODES = ['S+0', 'O+0'];
const NEAR_CODES = ['SL+1', 'SR+1', 'OL+1', 'OR+1'];

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

        // Configuration
        this.confidenceThreshold = options.confidenceThreshold ?? 65;
        this.maxConsecutiveSkips = options.maxConsecutiveSkips ?? 5;
        this.sessionAdaptationStart = options.sessionAdaptationStart ?? 10;
        this.historicalWeight = options.historicalWeight ?? 0.7;
    }

    _createSessionTracker() {
        return {
            totalBets: 0,
            wins: 0,
            losses: 0,
            consecutiveSkips: 0,
            pairPerformance: {},     // { [refKey]: { attempts, hits } }
            filterPerformance: {},   // { [filterKey]: { attempts, hits } }
            sessionWinRate: 0,
            recentDecisions: [],     // last 10 { refKey, filterKey, hit }
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
                        result.set(refKey, {
                            currCode: cd.code,
                            prevCode: pd.code,
                            currDist: cd.dist,
                            prevDist: pd.dist
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
            return signPass;
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
        const skipResult = (reason) => ({
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
        });

        if (!this.isTrained) return skipResult('Engine not trained');
        if (!this.isEnabled) return skipResult('Engine not enabled');

        // 1. Get current flash targets
        const currentSpins = this._getWindowSpins();
        if (!currentSpins || currentSpins.length < 4) return skipResult('Not enough spins');

        const flashTargets = this._getComputeFlashTargets(
            currentSpins, 0, currentSpins.length
        );

        // Parse flash targets to get flashing refKeys
        const flashingRefKeys = new Set();
        for (const target of flashTargets) {
            const parts = target.split(':');
            if (parts.length >= 2) {
                flashingRefKeys.add(parts[1]); // refKey
            }
        }

        if (flashingRefKeys.size === 0) return skipResult('No pairs flashing');

        // 2. Get available pairs from getAIDataV6
        const tableData = this._getAIDataV6();
        if (!tableData) return skipResult('No table data available');

        const nextProjections = tableData.table3NextProjections || {};

        // 3. Intersect: flashing AND have projection numbers
        const candidates = [];
        for (const refKey of flashingRefKeys) {
            const pairName = REFKEY_TO_PAIR_NAME[refKey];
            const projData = nextProjections[pairName];
            if (projData && projData.numbers && projData.numbers.length > 0) {
                candidates.push({ refKey, pairName, numbers: projData.numbers, data: projData });
            }
        }

        if (candidates.length === 0) return skipResult('No flashing pairs have projections');

        // 4. Score each candidate
        const scored = candidates.map(c => ({
            ...c,
            score: this._scorePair(c.refKey, c)
        }));
        scored.sort((a, b) => b.score - a.score);

        const bestPair = scored[0];

        // 5. Select best filter
        const filterResult = this._selectBestFilter(bestPair.numbers);

        // 6. Compute anchors
        const anchorsResult = this._getCalculateWheelAnchors(filterResult.filteredNumbers);
        const anchors = anchorsResult ? anchorsResult.anchors : [];
        const loose = anchorsResult ? anchorsResult.loose : [];
        const anchorGroups = anchorsResult ? anchorsResult.anchorGroups : [];

        // 7. Confidence
        const confidence = this._computeConfidence(bestPair.score, filterResult.score, filterResult.filteredNumbers);

        // 8. Skip logic
        const forcebet = this.session.consecutiveSkips >= this.maxConsecutiveSkips;
        let action;
        let reason;

        if (confidence >= this.confidenceThreshold || forcebet) {
            action = 'BET';
            reason = forcebet && confidence < this.confidenceThreshold
                ? `Forced bet after ${this.session.consecutiveSkips} skips (conf: ${confidence}%)`
                : `Pair ${bestPair.pairName} with ${filterResult.filterKey} filter (conf: ${confidence}%)`;
        } else {
            action = 'SKIP';
            reason = `Low confidence ${confidence}% < ${this.confidenceThreshold}% threshold (skip ${this.session.consecutiveSkips + 1}/${this.maxConsecutiveSkips})`;
        }

        return {
            action,
            selectedPair: bestPair.pairName,
            selectedFilter: filterResult.filterKey,
            numbers: filterResult.filteredNumbers,
            anchors,
            loose,
            anchorGroups,
            confidence,
            reason,
            debug: {
                flashingRefKeys: Array.from(flashingRefKeys),
                candidates: scored.map(s => ({ refKey: s.refKey, score: Math.round(s.score * 1000) / 1000 })),
                bestPairScore: bestPair.score,
                filterScore: filterResult.score,
                unfilteredCount: bestPair.numbers.length,
                filteredCount: filterResult.filteredNumbers.length
            }
        };
    }

    /**
     * Score a pair based on historical training + session data.
     */
    _scorePair(refKey, pairData) {
        const model = this.pairModels[refKey];
        if (!model || model.totalFlashes === 0) return 0;

        // Historical score
        let historicalScore = model.coverageEfficiency;
        // Normalize: typical efficiency is 1.0-3.0, scale to 0-1
        historicalScore = Math.min(historicalScore / 3.0, 1.0);

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

        // Position code quality bonus - check current flash info
        // We don't have the code here directly, so use historical model
        // Pairs with higher hit rates get a natural boost already
        if (model.hitRate >= 0.35) {
            composite += 0.15; // Golden-level performance
        } else if (model.hitRate >= 0.25) {
            composite += 0.10; // Near-golden performance
        }

        // Recency bonus: hit in last 3 session bets
        const recentHits = this.session.recentDecisions.slice(-3)
            .filter(d => d.refKey === refKey && d.hit).length;
        if (recentHits > 0) {
            composite += 0.05 * recentHits;
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

        return Math.max(0, Math.min(1.0, composite));
    }

    /**
     * Select the best filter combination for given numbers.
     */
    _selectBestFilter(numbers) {
        let bestFilter = { filterKey: 'both_both', filteredNumbers: [...numbers], score: 0 };
        let bestScore = -1;

        FILTER_COMBOS.forEach(fc => {
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

            // Prefer 6-14 number range (ideal coverage)
            if (filtered.length >= 6 && filtered.length <= 14) {
                score += 0.05;
            }

            // Slight bonus for reducing number count (more focused bets)
            if (filtered.length < numbers.length) {
                score += 0.02;
            }

            if (score > bestScore) {
                bestScore = score;
                bestFilter = { filterKey: fc.key, filteredNumbers: filtered, score };
            }
        });

        // If no filter beats both_both, use unfiltered
        if (bestScore <= 0) {
            bestFilter = { filterKey: 'both_both', filteredNumbers: [...numbers], score: 0 };
        }

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

        return Math.max(0, Math.min(100, Math.round(confidence)));
    }

    // ═══════════════════════════════════════════════════════════
    //  SESSION ADAPTATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Record the result of a bet for session adaptation.
     */
    recordResult(pairKey, filterKey, hit, actual) {
        // Convert pairName to refKey if needed
        const refKey = PAIR_NAME_TO_REFKEY[pairKey] || pairKey;

        this.session.totalBets++;
        if (hit) {
            this.session.wins++;
        } else {
            this.session.losses++;
        }
        this.session.consecutiveSkips = 0;

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

        // Recent decisions (keep last 10)
        this.session.recentDecisions.push({ refKey, filterKey, hit });
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
    }

    /**
     * Record a skip decision.
     */
    recordSkip() {
        this.session.consecutiveSkips++;
    }

    // ═══════════════════════════════════════════════════════════
    //  MODE CONTROL
    // ═══════════════════════════════════════════════════════════

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
    }

    fullReset() {
        this.isTrained = false;
        this.isEnabled = false;
        this.pairModels = {};
        this.filterModels = {};
        this.session = this._createSessionTracker();
    }

    getState() {
        return {
            isTrained: this.isTrained,
            isEnabled: this.isEnabled,
            pairModelCount: Object.keys(this.pairModels).length,
            sessionStats: { ...this.session },
            topPairs: this._getTopPairs(3),
            topFilters: this._getTopFilters(3)
        };
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
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIAutoEngine, FILTER_COMBOS, PAIR_REFKEYS, REFKEY_TO_PAIR_NAME, PAIR_NAME_TO_REFKEY };
}
if (typeof window !== 'undefined') {
    window.AIAutoEngine = AIAutoEngine;
    window.FILTER_COMBOS = FILTER_COMBOS;
}

console.log('✅ AI Auto Engine script loaded');
