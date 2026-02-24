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

// All 9 filter combinations
const SEMI_FILTER_COMBOS = [
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
     * Compute the optimal filter combo for the given prediction numbers.
     *
     * @param {number[]} predictionNumbers - unfiltered prediction numbers
     * @returns {{ key: string, count: number, filtered: number[] } | null}
     */
    computeOptimalFilter(predictionNumbers) {
        if (!predictionNumbers || predictionNumbers.length === 0) return null;

        // Get last spin actual for tiebreaker
        const spins = (typeof window !== 'undefined' && window.spins) ? window.spins : [];
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
            // NEVER actively choose both_both — it provides no filtering value.
            // The caller should use unfiltered numbers as fallback.
            if (combo.key === 'both_both') continue;

            const filtered = predictionNumbers.filter(n => this._passesComboFilter(n, combo));

            if (filtered.length < SEMI_MIN_NUMBERS) continue;

            // Base score: tiebreaker by last actual's table
            const tiebreak = this._computeTiebreak(filtered, lastActual);
            let score = tiebreak * 0.01;

            // Sequence model — the main intelligence
            if (seqScores && seqConfident) {
                // Confident: reward SPECIFICITY — high probability per number
                // hitValue = (probability / coverage) * 37 → measures how focused the filter is
                const seqProb = seqScores[combo.key] || 0;
                const hitValue = (seqProb / filtered.length) * 37;
                score += hitValue * 0.20;
            } else if (seqScores && !seqConfident) {
                // NOT confident: prefer wider filters, penalize restrictive ones
                if (combo.table !== 'both' && combo.sign !== 'both') {
                    score -= 0.05; // double-restrictive (e.g. zero_positive)
                } else if (combo.table === 'both' && combo.sign === 'both') {
                    // both_both is still too wide
                    score -= 0.02;
                }
                // Prefer single-axis filters (e.g. zero_both or both_positive)
                if ((combo.table !== 'both') !== (combo.sign !== 'both')) {
                    score += 0.02; // one axis filtered
                }
            } else {
                // No sequence model at all: fall back to fewest numbers ≥ 4
                score += (18 - filtered.length) / 14 * 0.10;
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
        return signPass;
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
    module.exports = { SemiAutoFilter, SA_ZERO, SA_NINE, SA_POS, SA_NEG, SEMI_FILTER_COMBOS, SEMI_MIN_NUMBERS };
}

// Browser global
if (typeof window !== 'undefined') {
    window.semiAutoFilter = new SemiAutoFilter();
    console.log('✅ Semi-Auto Filter script loaded');
}
