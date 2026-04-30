/**
 * AI Sequence Model — Multi-Layer N-gram Prediction
 *
 * Learns transition probabilities at multiple levels:
 *   - Number-level: "After 4 specifically → what table/sign next?"
 *   - Table-level:  "After any nineteen-table number → what next?"
 *   - Sign-level:   "After any positive number → what next?"
 *   - Combo-level:  "After [nineteen + positive] number → what next?"
 *
 * Blends all layers weighted by sample count. More data = more weight.
 * Only commits to a prediction at ≥ 70% confidence (configurable).
 */

// Number sets (own copies for test independence)
const SEQ_ZERO = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const SEQ_NINE = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const SEQ_POS  = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const SEQ_NEG  = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// Filter combos for scoring
const SEQ_FILTER_COMBOS = [
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

const SEQ_CONFIDENCE_THRESHOLD = 0.70; // 70% — AI only commits when ≥ this

class AISequenceModel {
    constructor(options = {}) {
        this.minSamples = options.minSamples ?? 3;
        this.confidenceThreshold = options.confidenceThreshold ?? SEQ_CONFIDENCE_THRESHOLD;
        this.isTrained = false;

        // Multi-layer transition tables (Map<string, CountRecord>)
        // CountRecord = { total, zeroTable, nineteenTable, positive, negative }
        this.numberTransitions = new Map();  // "n:4"
        this.number2grams = new Map();       // "n2:17,4"
        this.number3grams = new Map();       // "n3:32,17,4"
        this.tableTransitions = new Map();   // "t:zero"
        this.table2grams = new Map();        // "t2:zero,nineteen"
        this.table3grams = new Map();        // "t3:zero,nineteen,zero"
        this.signTransitions = new Map();    // "s:positive"
        this.sign2grams = new Map();         // "s2:positive,negative"
        this.comboTransitions = new Map();   // "c:zero_positive"

        this.baseline = { total: 0, zeroTable: 0, nineteenTable: 0, positive: 0, negative: 0 };
    }

    /**
     * Classify a number into table and sign categories.
     */
    classify(num) {
        return {
            table: SEQ_ZERO.has(num) ? 'zero' : (SEQ_NINE.has(num) ? 'nineteen' : null),
            sign: SEQ_POS.has(num) ? 'positive' : (SEQ_NEG.has(num) ? 'negative' : null)
        };
    }

    /**
     * Create a fresh count record.
     */
    _newRecord() {
        return { total: 0, zeroTable: 0, nineteenTable: 0, positive: 0, negative: 0 };
    }

    /**
     * Increment a count record in a given map.
     */
    _increment(map, key, nextClass) {
        if (!map.has(key)) map.set(key, this._newRecord());
        const rec = map.get(key);
        rec.total++;
        if (nextClass.table === 'zero') rec.zeroTable++;
        if (nextClass.table === 'nineteen') rec.nineteenTable++;
        if (nextClass.sign === 'positive') rec.positive++;
        if (nextClass.sign === 'negative') rec.negative++;
    }

    /**
     * Train on historical sessions. Builds all transition layers.
     * @param {number[][]} sessions - Array of spin arrays
     */
    train(sessions) {
        this.reset();

        if (!sessions || sessions.length === 0) {
            return { totalObservations: 0 };
        }

        for (const session of sessions) {
            if (!session || session.length < 2) continue;

            for (let i = 0; i < session.length - 1; i++) {
                const curr = session[i];
                const next = session[i + 1];
                const nextClass = this.classify(next);
                const currClass = this.classify(curr);

                if (!nextClass.table || !nextClass.sign) continue;

                // Baseline (0-gram)
                this.baseline.total++;
                if (nextClass.table === 'zero') this.baseline.zeroTable++;
                if (nextClass.table === 'nineteen') this.baseline.nineteenTable++;
                if (nextClass.sign === 'positive') this.baseline.positive++;
                if (nextClass.sign === 'negative') this.baseline.negative++;

                // Number 1-gram: after specific number
                this._increment(this.numberTransitions, `n:${curr}`, nextClass);

                // Number 2-gram: after [prev, curr]
                if (i >= 1) {
                    this._increment(this.number2grams, `n2:${session[i - 1]},${curr}`, nextClass);
                }

                // Number 3-gram: after [prevPrev, prev, curr]
                if (i >= 2) {
                    this._increment(this.number3grams, `n3:${session[i - 2]},${session[i - 1]},${curr}`, nextClass);
                }

                // Table 1-gram: after table category
                if (currClass.table) {
                    this._increment(this.tableTransitions, `t:${currClass.table}`, nextClass);
                }

                // Table 2-gram: after [prevTable, currTable]
                if (i >= 1) {
                    const prevClass = this.classify(session[i - 1]);
                    if (prevClass.table && currClass.table) {
                        this._increment(this.table2grams, `t2:${prevClass.table},${currClass.table}`, nextClass);
                    }
                }

                // Table 3-gram: after [prevPrevTable, prevTable, currTable]
                if (i >= 2) {
                    const ppClass = this.classify(session[i - 2]);
                    const pClass = this.classify(session[i - 1]);
                    if (ppClass.table && pClass.table && currClass.table) {
                        this._increment(this.table3grams, `t3:${ppClass.table},${pClass.table},${currClass.table}`, nextClass);
                    }
                }

                // Sign 1-gram: after sign category
                if (currClass.sign) {
                    this._increment(this.signTransitions, `s:${currClass.sign}`, nextClass);
                }

                // Sign 2-gram: after [prevSign, currSign]
                if (i >= 1) {
                    const prevClass = this.classify(session[i - 1]);
                    if (prevClass.sign && currClass.sign) {
                        this._increment(this.sign2grams, `s2:${prevClass.sign},${currClass.sign}`, nextClass);
                    }
                }

                // Combo 1-gram: after [table + sign] category
                if (currClass.table && currClass.sign) {
                    this._increment(this.comboTransitions, `c:${currClass.table}_${currClass.sign}`, nextClass);
                }
            }
        }

        this.isTrained = this.baseline.total > 0;
        return { totalObservations: this.baseline.total };
    }

    /**
     * Predict next spin's table/sign probabilities using multi-layer blend.
     * @param {number[]} recentSpins - Last N spins (chronological, most recent last)
     * @returns {{ pZeroTable, pNineteenTable, pPositive, pNegative, layers, totalWeight, confident }}
     */
    predict(recentSpins) {
        if (!this.isTrained || !recentSpins || recentSpins.length === 0) {
            return this._baselinePrediction();
        }

        const layers = [];

        // Classify recent spins
        const last = recentSpins[recentSpins.length - 1];
        const lastClass = this.classify(last);
        const prev = recentSpins.length >= 2 ? recentSpins[recentSpins.length - 2] : null;
        const prevClass = prev !== null ? this.classify(prev) : null;
        const prevPrev = recentSpins.length >= 3 ? recentSpins[recentSpins.length - 3] : null;
        const ppClass = prevPrev !== null ? this.classify(prevPrev) : null;

        // Layer 1: Number n-grams (deepest first)
        const numLayer = this._findDeepest([
            recentSpins.length >= 3 ? { map: this.number3grams, key: `n3:${recentSpins[recentSpins.length - 3]},${prev},${last}` } : null,
            recentSpins.length >= 2 ? { map: this.number2grams, key: `n2:${prev},${last}` } : null,
            { map: this.numberTransitions, key: `n:${last}` }
        ]);
        if (numLayer) layers.push({ name: 'number', ...numLayer });

        // Layer 2: Table n-grams (deepest first)
        if (lastClass.table) {
            const tableLayer = this._findDeepest([
                ppClass && prevClass && lastClass.table ? { map: this.table3grams, key: `t3:${ppClass.table},${prevClass.table},${lastClass.table}` } : null,
                prevClass && lastClass.table ? { map: this.table2grams, key: `t2:${prevClass.table},${lastClass.table}` } : null,
                { map: this.tableTransitions, key: `t:${lastClass.table}` }
            ]);
            if (tableLayer) layers.push({ name: 'table', ...tableLayer });
        }

        // Layer 3: Sign n-grams (deepest first)
        if (lastClass.sign) {
            const signLayer = this._findDeepest([
                prevClass && lastClass.sign ? { map: this.sign2grams, key: `s2:${prevClass.sign},${lastClass.sign}` } : null,
                { map: this.signTransitions, key: `s:${lastClass.sign}` }
            ]);
            if (signLayer) layers.push({ name: 'sign', ...signLayer });
        }

        // Layer 4: Combo 1-gram
        if (lastClass.table && lastClass.sign) {
            const comboKey = `c:${lastClass.table}_${lastClass.sign}`;
            const rec = this.comboTransitions.get(comboKey);
            if (rec && rec.total >= this.minSamples) {
                layers.push({ name: 'combo', rec, key: comboKey, weight: rec.total });
            }
        }

        if (layers.length === 0) {
            return this._baselinePrediction();
        }

        // Weighted blend: more samples = more weight
        // Normalize by baseline to remove the 19/18 set-size bias
        // (0/26 share same pocket → positive has 19 numbers vs negative 18)
        // Deviation approach: adjusted = 0.50 + (observed_rate - baseline_rate)
        const baseZeroRate = this.baseline.total > 0 ? this.baseline.zeroTable / this.baseline.total : 19 / 37;
        const baseNineRate = this.baseline.total > 0 ? this.baseline.nineteenTable / this.baseline.total : 18 / 37;
        const basePosRate = this.baseline.total > 0 ? this.baseline.positive / this.baseline.total : 19 / 37;
        const baseNegRate = this.baseline.total > 0 ? this.baseline.negative / this.baseline.total : 18 / 37;

        let totalWeight = 0;
        let wZeroDev = 0, wNineDev = 0, wPosDev = 0, wNegDev = 0;

        for (const layer of layers) {
            const w = layer.weight;
            totalWeight += w;
            // Compute deviation from baseline for each layer
            wZeroDev += ((layer.rec.zeroTable / layer.rec.total) - baseZeroRate) * w;
            wNineDev += ((layer.rec.nineteenTable / layer.rec.total) - baseNineRate) * w;
            wPosDev += ((layer.rec.positive / layer.rec.total) - basePosRate) * w;
            wNegDev += ((layer.rec.negative / layer.rec.total) - baseNegRate) * w;
        }

        // Apply deviations to neutral 50/50 baseline → equal weightage
        const rawZero = 0.50 + wZeroDev / totalWeight;
        const rawNine = 0.50 + wNineDev / totalWeight;
        const rawPos = 0.50 + wPosDev / totalWeight;
        const rawNeg = 0.50 + wNegDev / totalWeight;

        // Clamp and renormalize so each axis sums to 1.0
        const tSum = Math.max(0.001, Math.max(0, rawZero) + Math.max(0, rawNine));
        const sSum = Math.max(0.001, Math.max(0, rawPos) + Math.max(0, rawNeg));
        const pZeroTable = Math.max(0, rawZero) / tSum;
        const pNineteenTable = Math.max(0, rawNine) / tSum;
        const pPositive = Math.max(0, rawPos) / sSum;
        const pNegative = Math.max(0, rawNeg) / sSum;

        // Confident = at least one axis has ≥ threshold probability
        const tableConfident = Math.max(pZeroTable, pNineteenTable) >= this.confidenceThreshold;
        const signConfident = Math.max(pPositive, pNegative) >= this.confidenceThreshold;
        const confident = tableConfident || signConfident;

        return {
            pZeroTable, pNineteenTable, pPositive, pNegative,
            tableConfident, signConfident, confident,
            layers: layers.map(l => ({ name: l.name, key: l.key, samples: l.rec.total })),
            totalWeight
        };
    }

    /**
     * Find the deepest n-gram with enough samples.
     */
    _findDeepest(candidates) {
        for (const c of candidates) {
            if (!c) continue;
            const rec = c.map.get(c.key);
            if (rec && rec.total >= this.minSamples) {
                return { rec, key: c.key, weight: rec.total };
            }
        }
        return null;
    }

    /**
     * Return baseline prediction (overall rates).
     */
    _baselinePrediction() {
        if (this.baseline.total === 0) {
            return {
                pZeroTable: 0.50, pNineteenTable: 0.50,
                pPositive: 0.50, pNegative: 0.50,
                tableConfident: false, signConfident: false, confident: false,
                layers: [], totalWeight: 0
            };
        }
        // Return neutral 50/50 — baseline has no directional signal
        // (the 19/18 set-size difference is normalized away)
        return {
            pZeroTable: 0.50, pNineteenTable: 0.50,
            pPositive: 0.50, pNegative: 0.50,
            tableConfident: false, signConfident: false, confident: false,
            layers: [{ name: 'baseline', key: 'baseline', samples: this.baseline.total }],
            totalWeight: this.baseline.total
        };
    }

    /**
     * Score all 9 filter combos based on sequence prediction.
     * Only applies confident predictions (≥ 70%).
     */
    scoreFilterCombos(recentSpins) {
        const pred = this.predict(recentSpins);
        const scores = {};

        for (const combo of SEQ_FILTER_COMBOS) {
            let pTable, pSign;

            // Table axis — only use prediction if confident
            if (pred.tableConfident) {
                if (combo.table === 'zero') pTable = pred.pZeroTable;
                else if (combo.table === 'nineteen') pTable = pred.pNineteenTable;
                else pTable = 1.0; // both
            } else {
                // Not confident → neutral (no boost/penalty)
                pTable = combo.table === 'both' ? 1.0 : 0.5;
            }

            // Sign axis — only use prediction if confident
            if (pred.signConfident) {
                if (combo.sign === 'positive') pSign = pred.pPositive;
                else if (combo.sign === 'negative') pSign = pred.pNegative;
                else pSign = 1.0; // both
            } else {
                pSign = combo.sign === 'both' ? 1.0 : 0.5;
            }

            scores[combo.key] = pTable * pSign;
        }

        return { scores, prediction: pred, confident: pred.confident };
    }

    /**
     * Get summary statistics.
     */
    getStats() {
        return {
            totalObservations: this.baseline.total,
            ngramCounts: {
                number1: this.numberTransitions.size,
                number2: this.number2grams.size,
                number3: this.number3grams.size,
                table1: this.tableTransitions.size,
                table2: this.table2grams.size,
                table3: this.table3grams.size,
                sign1: this.signTransitions.size,
                sign2: this.sign2grams.size,
                combo1: this.comboTransitions.size
            },
            baseline: { ...this.baseline },
            confidenceThreshold: this.confidenceThreshold
        };
    }

    /**
     * Clear all trained data.
     */
    reset() {
        this.numberTransitions.clear();
        this.number2grams.clear();
        this.number3grams.clear();
        this.tableTransitions.clear();
        this.table2grams.clear();
        this.table3grams.clear();
        this.signTransitions.clear();
        this.sign2grams.clear();
        this.comboTransitions.clear();
        this.baseline = { total: 0, zeroTable: 0, nineteenTable: 0, positive: 0, negative: 0 };
        this.isTrained = false;
    }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AISequenceModel, SEQ_ZERO, SEQ_NINE, SEQ_POS, SEQ_NEG, SEQ_FILTER_COMBOS, SEQ_CONFIDENCE_THRESHOLD };
}

if (typeof window !== 'undefined') {
    window.AISequenceModel = AISequenceModel;
    console.log('✅ AI Sequence Model script loaded');
}
