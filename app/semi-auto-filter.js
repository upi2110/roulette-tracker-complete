/**
 * Semi-Auto Filter — Third Strategy
 *
 * User picks pair manually → system auto-selects the filter combination
 * (0/19 table × positive/negative sign) that produces the FEWEST numbers
 * (minimum 4). Tiebreaker: prefer combo with more numbers from the same
 * table as the last spin's actual.
 */

// Number sets (own copies for test independence)
const SA_ZERO = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const SA_NINE = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const SA_POS  = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const SA_NEG  = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// Number Set Filters (3 sets covering all 37 numbers)
const SA_SET0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]); // 0 Set: 13 numbers (0/26 same pocket)
const SA_SET5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);   // 5 Set: 12 numbers
const SA_SET6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);      // 6 Set: 12 numbers

// All 36 filter combinations (table × sign × set)
const SEMI_FILTER_COMBOS = [
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

const SEMI_MIN_NUMBERS = 4;

class SemiAutoFilter {
    constructor() {
        this.isEnabled = false;
        this.sequenceModel = null;
    }

    enable() {
        this.isEnabled = true;
        console.log('🟠 Semi-Auto filter ENABLED');
    }

    disable() {
        this.isEnabled = false;
        console.log('🟠 Semi-Auto filter DISABLED');
    }

    /**
     * Set the sequence model for enhanced scoring.
     * @param {AISequenceModel|null} model
     */
    setSequenceModel(model) {
        this.sequenceModel = model;
    }

    /**
     * Predict which one set (0/5/6) the next spin will land in.
     * Uses coverage overlap, recent frequency, and anti-streak signals.
     *
     * @param {number[]} predictionNumbers - unfiltered prediction numbers
     * @param {number[]} recentSpins - last 10 spin actuals
     * @returns {{ setKey: string, filterKey: string, score: number }}
     */
    predictBestSet(predictionNumbers, recentSpins) {
        const sets = [
            { key: 'set0', nums: SA_SET0, filterKey: 'both_both_set0' },
            { key: 'set5', nums: SA_SET5, filterKey: 'both_both_set5' },
            { key: 'set6', nums: SA_SET6, filterKey: 'both_both_set6' },
        ];

        let bestSet = sets[0];
        let bestScore = -Infinity;

        for (const s of sets) {
            let score = 0;

            // Factor 1 (50%): Coverage overlap — how many prediction numbers fall in this set
            const overlap = predictionNumbers.filter(n => s.nums.has(n)).length;
            score += (overlap / Math.max(predictionNumbers.length, 1)) * 0.50;

            // Factor 2 (30%): Recent frequency — how many of last 10 spins fell in this set
            const recent = recentSpins || [];
            const recentInSet = recent.filter(n => s.nums.has(n)).length;
            const recentRate = recent.length > 0 ? recentInSet / recent.length : (s.nums.size / 37);
            score += recentRate * 0.30;

            // Factor 3 (20%): Anti-streak — if this set hasn't appeared in last 3 spins, give bonus
            const last3 = recent.slice(-3);
            if (last3.length >= 3 && last3.filter(n => s.nums.has(n)).length === 0) {
                score += 0.15;
            }

            if (score > bestScore) {
                bestScore = score;
                bestSet = s;
            }
        }

        return { setKey: bestSet.key, filterKey: bestSet.filterKey, score: bestScore };
    }

    /**
     * Compute the optimal filter combo for the given prediction numbers.
     * NEW: Uses set-prediction mode (table=both, sign=both, predict one set).
     * Falls back to 36-combo scan if set prediction yields < 4 numbers.
     *
     * @param {number[]} predictionNumbers - unfiltered prediction numbers
     * @returns {{ key: string, count: number, filtered: number[] } | null}
     */
    computeOptimalFilter(predictionNumbers) {
        if (!predictionNumbers || predictionNumbers.length === 0) return null;

        // Get recent spins for set prediction
        const spins = (typeof window !== 'undefined' && window.spins) ? window.spins : [];
        const recentSpins = spins.slice(-10).map(s => typeof s === 'object' ? s.actual : s);

        // ── Set-prediction mode (table=both, sign=both, predict set) ──
        const setPred = this.predictBestSet(predictionNumbers, recentSpins);

        // Apply both_both_setN filter
        const setFiltered = predictionNumbers.filter(n => {
            if (setPred.setKey === 'set0') return SA_SET0.has(n);
            if (setPred.setKey === 'set5') return SA_SET5.has(n);
            if (setPred.setKey === 'set6') return SA_SET6.has(n);
            return true;
        });

        if (setFiltered.length >= SEMI_MIN_NUMBERS) {
            console.log(`🟠 SEMI-AUTO: Set prediction → ${setPred.filterKey} (${setFiltered.length} numbers)`);
            return { key: setPred.filterKey, count: setFiltered.length, filtered: setFiltered };
        }

        // ── Fallback: original 36-combo scan if set prediction yields too few numbers ──
        console.log(`🟠 SEMI-AUTO: Set prediction ${setPred.filterKey} yielded ${setFiltered.length} numbers (< ${SEMI_MIN_NUMBERS}), falling back to combo scan`);

        const lastActual = spins.length > 0 ? spins[spins.length - 1] : null;

        // Get sequence model scores if available
        let seqScores = null;
        if (this.sequenceModel && this.sequenceModel.isTrained && spins.length >= 1) {
            const seqResult = this.sequenceModel.scoreFilterCombos(spins);
            seqScores = seqResult.scores;
            seqScores._confident = seqResult.confident;
        }

        let best = null;
        let bestScore = -Infinity;
        const seqConfident = seqScores && seqScores._confident;

        for (const combo of SEMI_FILTER_COMBOS) {
            // NEVER actively choose both_both (set:'all') — it provides no filtering value.
            // BUT both_both with a specific set (set0/set5/set6) IS valid (12-13 numbers).
            if (combo.key === 'both_both' && (!combo.set || combo.set === 'all')) continue;

            const filtered = predictionNumbers.filter(n => this._passesComboFilter(n, combo));

            if (filtered.length < SEMI_MIN_NUMBERS) continue;

            // Base score: tiebreaker by last actual's table
            const tiebreak = this._computeTiebreak(filtered, lastActual);
            let score = tiebreak * 0.01;

            // Sequence model — the main intelligence
            if (seqScores && seqConfident) {
                const seqProb = seqScores[combo.key] || 0;
                const hitValue = (seqProb / filtered.length) * 37;
                score += hitValue * 0.20;
            } else if (seqScores && !seqConfident) {
                if (combo.table !== 'both' && combo.sign !== 'both') {
                    score -= 0.05;
                } else if (combo.table === 'both' && combo.sign === 'both') {
                    score -= 0.02;
                }
                if ((combo.table !== 'both') !== (combo.sign !== 'both')) {
                    score += 0.02;
                }
            } else {
                score += (18 - filtered.length) / 14 * 0.10;
            }

            // Sign diversity penalty
            const fPosCount = filtered.filter(n => SA_POS.has(n)).length;
            const fNegCount = filtered.filter(n => SA_NEG.has(n)).length;
            const fTotal = fPosCount + fNegCount;
            if (fTotal > 0 && Math.min(fPosCount, fNegCount) === 0) {
                score -= 0.06;
            }

            if (score > bestScore) {
                best = { key: combo.key, count: filtered.length, filtered };
                bestScore = score;
            }
        }

        return best;
    }

    /**
     * Check if a number passes a given filter combo.
     */
    _passesComboFilter(num, combo) {
        // Table check
        let tablePass = false;
        if (combo.table === 'both') {
            tablePass = SA_ZERO.has(num) || SA_NINE.has(num);
        } else if (combo.table === 'zero') {
            tablePass = SA_ZERO.has(num);
        } else if (combo.table === 'nineteen') {
            tablePass = SA_NINE.has(num);
        }
        if (!tablePass) return false;

        // Sign check
        let signPass = false;
        if (combo.sign === 'both') {
            signPass = SA_POS.has(num) || SA_NEG.has(num);
        } else if (combo.sign === 'positive') {
            signPass = SA_POS.has(num);
        } else if (combo.sign === 'negative') {
            signPass = SA_NEG.has(num);
        }
        if (!signPass) return false;

        // Set filter
        if (combo.set && combo.set !== 'all') {
            if (combo.set === 'set0') return SA_SET0.has(num);
            if (combo.set === 'set5') return SA_SET5.has(num);
            if (combo.set === 'set6') return SA_SET6.has(num);
        }

        return true;
    }

    /**
     * Tiebreaker: count how many filtered numbers are in the same table
     * as the last spin's actual number.
     */
    _computeTiebreak(filteredNumbers, lastActual) {
        if (lastActual === null || lastActual === undefined) return 0;

        const lastInZero = SA_ZERO.has(lastActual);
        const lastInNine = SA_NINE.has(lastActual);

        let count = 0;
        for (const n of filteredNumbers) {
            if (lastInZero && SA_ZERO.has(n)) count++;
            if (lastInNine && SA_NINE.has(n)) count++;
        }
        return count;
    }

    /**
     * Compute optimal filter and apply it by setting radio buttons.
     * Called from getPredictions() when semi-auto mode is active.
     *
     * @param {number[]} predictionNumbers
     * @returns {{ key: string, count: number, filtered: number[] } | null}
     */
    applyOptimalFilter(predictionNumbers) {
        const result = this.computeOptimalFilter(predictionNumbers);

        if (!result) {
            console.log('🟠 SEMI-AUTO: No filter combo has ≥ 4 numbers — keeping current filter');
            return null;
        }

        // Set radio buttons via orchestrator
        if (typeof window !== 'undefined' && window.autoUpdateOrchestrator &&
            typeof window.autoUpdateOrchestrator._setWheelFilters === 'function') {
            window.autoUpdateOrchestrator._setWheelFilters(result.key);
        }

        console.log(`🟠 SEMI-AUTO: Selected ${result.key} → ${result.count} numbers`);
        return result;
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SemiAutoFilter, SA_ZERO, SA_NINE, SA_POS, SA_NEG, SA_SET0, SA_SET5, SA_SET6, SEMI_FILTER_COMBOS, SEMI_MIN_NUMBERS };
}

// Browser global
if (typeof window !== 'undefined') {
    window.semiAutoFilter = new SemiAutoFilter();
    console.log('✅ Semi-Auto Filter script loaded');
}
