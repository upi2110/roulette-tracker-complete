/**
 * Decision Logger — Canonical pocket mapping + structured decision recording
 *
 * Part of Precision-First Engine v2 foundation layer.
 * Provides:
 *   - canonicalPocket(n): merges 0/26 into canonical pocket 26
 *   - canonicalSet(numbers): deduped sorted canonical mapping
 *   - computeBaseline(canonicalNumbers): per-decision baseline probability
 *   - physicalSet(canonicalNumbers): expand canonical 26 → physical {0,26}
 *   - DecisionLogger: structured decision record storage + metrics
 */

'use strict';

// ═══════════════════════════════════════════════════════════
//  CANONICAL POCKET MAPPING
// ═══════════════════════════════════════════════════════════

/**
 * Map a roulette number to its canonical pocket.
 * 0 and 26 share the same physical pocket → canonical pocket 26.
 * All other numbers map to themselves.
 *
 * Rule: learning/eval uses canonical; execution expands to physical.
 *
 * @param {number} n - Roulette number (0-36)
 * @returns {number} Canonical pocket ID
 */
function canonicalPocket(n) {
    return (n === 0 || n === 26) ? 26 : n;
}

/**
 * Map an array of roulette numbers to canonical pockets, deduplicate, and sort.
 * Deterministic output: always sorted ascending for stable JSONL/test diffs.
 *
 * @param {number[]} numbers - Roulette numbers (0-36)
 * @returns {number[]} Sorted, deduped canonical pocket array
 */
function canonicalSet(numbers) {
    return [...new Set(numbers.map(canonicalPocket))].sort((a, b) => a - b);
}

/**
 * Compute per-decision baseline probability based on canonical bet set.
 *
 * baseline_p = K_phys / 37  (physical coverage over 37 outcomes)
 *
 * If canonical 26 is in the set, it covers 2 physical outcomes (0 and 26),
 * so K_phys = K + 1. Otherwise K_phys = K.
 *
 * @param {number[]} canonicalNumbers - Canonical pocket array
 * @returns {{ K: number, K_phys: number, includes26: boolean, baseline_p: number }}
 */
function computeBaseline(canonicalNumbers) {
    const K = canonicalNumbers.length;
    const includes26 = canonicalNumbers.includes(26);
    const K_phys = includes26 ? K + 1 : K;
    const baseline_p = K_phys / 37; // Physical coverage probability
    return { K, K_phys, includes26, baseline_p };
}

/**
 * Expand canonical pocket set to physical bet numbers.
 * Canonical 26 expands to both 0 and 26 on the physical table.
 * All others map 1:1. Returns sorted, deduped array.
 *
 * @param {number[]} canonicalNumbers - Canonical pocket array
 * @returns {number[]} Physical bet numbers (sorted)
 */
function physicalSet(canonicalNumbers) {
    const phys = [];
    for (const n of canonicalNumbers) {
        phys.push(n);
        if (n === 26) phys.push(0); // Expand canonical 26 → physical {0, 26}
    }
    return [...new Set(phys)].sort((a, b) => a - b);
}

// ═══════════════════════════════════════════════════════════
//  DECISION LOGGER
// ═══════════════════════════════════════════════════════════

/**
 * DecisionLogger — Records every engine decision with full diagnostic fields.
 *
 * Each record captures the canonical truth metric:
 *   y_t = 1 if canonical(result) ∈ finalCanonSet, else 0
 *
 * Provides aggregate metrics, binned analysis, and rolling windows.
 */
class DecisionLogger {
    /**
     * @param {Object} [options]
     * @param {number} [options.stakePerNumber=2] - Flat stake per physical number
     */
    constructor(options = {}) {
        this.records = [];
        this.stakePerNumber = options.stakePerNumber ?? 2;
    }

    /**
     * Log a single decision record.
     * @param {Object} record - DecisionRecord object
     */
    logDecision(record) {
        this.records.push(record);
    }

    /**
     * @returns {Object[]} All records
     */
    getRecords() {
        return this.records;
    }

    /**
     * @returns {Object[]} Only records where state is 'BET' or 'RECOVERY'
     */
    getBetRecords() {
        return this.records.filter(r => r.state === 'BET' || r.state === 'RECOVERY');
    }

    /**
     * Compute P&L for a single bet using flat stake.
     *
     * Win:  stakePerNumber × (36 - K_phys)
     * Loss: -(stakePerNumber × K_phys)
     *
     * @param {number} K_phys - Physical bet count
     * @param {boolean} hit - Whether the bet won
     * @returns {number} Net P&L
     */
    computePnL(K_phys, hit) {
        if (hit) {
            return this.stakePerNumber * (36 - K_phys);
        }
        return -(this.stakePerNumber * K_phys);
    }

    /**
     * Save all records to a JSONL file (one JSON object per line).
     * @param {string} filePath - Output file path
     */
    saveToJSONL(filePath) {
        const fs = typeof require !== 'undefined' ? require('fs') : null;
        if (!fs) {
            console.warn('saveToJSONL: fs module not available (browser context)');
            return;
        }
        const lines = this.records.map(r => JSON.stringify(r));
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    }

    /**
     * Load records from a JSONL file.
     * @param {string} filePath - Input file path
     */
    loadFromJSONL(filePath) {
        const fs = typeof require !== 'undefined' ? require('fs') : null;
        if (!fs) {
            console.warn('loadFromJSONL: fs module not available (browser context)');
            return;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.trim());
        this.records = lines.map(l => JSON.parse(l));
    }

    /**
     * Compute aggregate summary metrics.
     *
     * Two bet frequency metrics:
     *   actionBetRate = bets / (bets + skips)  — over actionable decisions only
     *   spinBetRate   = bets / totalSpins       — over all spins observed
     *
     * @returns {Object} Summary metrics
     */
    getSummary() {
        const all = this.records;
        const bets = all.filter(r => r.state === 'BET' || r.state === 'RECOVERY');
        const skips = all.filter(r => r.state === 'SKIP');
        const waits = all.filter(r => r.state === 'WAIT');
        const hits = bets.filter(r => r.hit === 1);

        const totalSpins = all.length;
        const totalBets = bets.length;
        const totalSkips = skips.length;
        const totalWaits = waits.length;

        // Two bet frequency definitions
        const actionableDecisions = totalBets + totalSkips;
        const actionBetRate = actionableDecisions > 0 ? totalBets / actionableDecisions : 0;
        const spinBetRate = totalSpins > 0 ? totalBets / totalSpins : 0;

        // K stats (only for BET records)
        const avgK = totalBets > 0 ? bets.reduce((s, r) => s + r.K, 0) / totalBets : 0;
        const avgK_phys = totalBets > 0 ? bets.reduce((s, r) => s + r.K_phys, 0) / totalBets : 0;

        // Hit rate (conditional on BET)
        const hitRate = totalBets > 0 ? hits.length / totalBets : 0;

        // Average baseline (physical coverage) for BET records
        const avgBaseline = totalBets > 0 ? bets.reduce((s, r) => s + r.baseline_p, 0) / totalBets : 0;

        // Hit uplift
        const hitUplift = hitRate - avgBaseline;

        // P&L
        const totalPnl = bets.reduce((s, r) => s + r.pnl, 0);
        const evPerBet = totalBets > 0 ? totalPnl / totalBets : 0;
        const evPerSpin = totalSpins > 0 ? totalPnl / totalSpins : 0;

        // Max drawdown (running peak - running trough)
        let maxDrawdown = 0;
        let runningPnl = 0;
        let peak = 0;
        for (const r of bets) {
            runningPnl += r.pnl;
            if (runningPnl > peak) peak = runningPnl;
            const dd = peak - runningPnl;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }

        // Longest losing streak (consecutive BET misses)
        let longestLosingStreak = 0;
        let currentStreak = 0;
        for (const r of bets) {
            if (r.hit === 0) {
                currentStreak++;
                if (currentStreak > longestLosingStreak) longestLosingStreak = currentStreak;
            } else {
                currentStreak = 0;
            }
        }

        // Profit factor = sum(wins) / |sum(losses)|
        const sumWins = bets.filter(r => r.pnl > 0).reduce((s, r) => s + r.pnl, 0);
        const sumLosses = Math.abs(bets.filter(r => r.pnl < 0).reduce((s, r) => s + r.pnl, 0));
        const profitFactor = sumLosses > 0 ? sumWins / sumLosses : (sumWins > 0 ? Infinity : 0);

        // Average consecutive WAIT+SKIP streak (non-BET streaks)
        const waitStreaks = [];
        let wsCount = 0;
        for (const r of all) {
            if (r.state === 'WAIT' || r.state === 'SKIP') {
                wsCount++;
            } else {
                if (wsCount > 0) waitStreaks.push(wsCount);
                wsCount = 0;
            }
        }
        if (wsCount > 0) waitStreaks.push(wsCount);
        const avgConsecutiveWaitStreak = waitStreaks.length > 0
            ? waitStreaks.reduce((s, v) => s + v, 0) / waitStreaks.length
            : 0;

        // Filter damage rate
        const filterDamageRate = totalBets > 0
            ? bets.reduce((s, r) => s + r.filterDamage, 0) / totalBets
            : 0;

        return {
            totalSpins,
            totalBets,
            totalSkips,
            totalWaits,
            actionBetRate,  // bets / (bets + skips)
            spinBetRate,    // bets / totalSpins
            avgK,
            avgK_phys,
            hitRate,
            avgBaseline,    // baseline (physical coverage)
            hitUplift,
            totalPnl,
            evPerBet,
            evPerSpin,
            maxDrawdown,
            longestLosingStreak,
            profitFactor,
            avgConsecutiveWaitStreak,
            filterDamageRate
        };
    }

    /**
     * Segment BET records by a field and compute per-bin metrics.
     *
     * @param {string} field - Record field to bin by ('K', 'includes26', 'spinIndex')
     * @param {Array} bins - Bin definitions:
     *   For numeric fields: [[min, max, label?], ...] where min <= val <= max
     *   For boolean fields: [[value, label], ...]
     * @returns {Object[]} Array of bin summaries
     */
    getSummaryByBins(field, bins) {
        const bets = this.getBetRecords();
        const results = [];

        for (const bin of bins) {
            let label, filtered;

            if (typeof bin[0] === 'boolean') {
                // Boolean bin: [value, label]
                label = bin[1];
                filtered = bets.filter(r => r[field] === bin[0]);
            } else if (typeof bin[0] === 'number' && typeof bin[1] === 'number') {
                // Numeric range bin: [min, max, label?]
                const min = bin[0];
                const max = bin[1];
                label = bin[2] || `${min}-${max === Infinity ? '+' : max}`;
                filtered = bets.filter(r => r[field] >= min && r[field] <= max);
            } else {
                label = String(bin);
                filtered = [];
            }

            const count = filtered.length;
            const hits = filtered.filter(r => r.hit === 1).length;
            const hitRate = count > 0 ? hits / count : 0;
            const avgBaseline = count > 0 ? filtered.reduce((s, r) => s + r.baseline_p, 0) / count : 0;
            const hitUplift = hitRate - avgBaseline;
            const totalPnl = filtered.reduce((s, r) => s + r.pnl, 0);
            const evPerBet = count > 0 ? totalPnl / count : 0;
            const avgK = count > 0 ? filtered.reduce((s, r) => s + r.K, 0) / count : 0;
            const avgK_phys = count > 0 ? filtered.reduce((s, r) => s + r.K_phys, 0) / count : 0;

            results.push({
                label,
                count,
                hits,
                hitRate,
                avgBaseline,
                hitUplift,
                totalPnl,
                evPerBet,
                avgK,
                avgK_phys
            });
        }

        return results;
    }

    /**
     * Compute rolling window metrics over BET records.
     *
     * @param {number} windowSize - Number of BET records per window
     * @returns {Object[]} Array of window summaries
     */
    getRollingMetrics(windowSize) {
        const bets = this.getBetRecords();
        const windows = [];

        for (let i = 0; i <= bets.length - windowSize; i += Math.floor(windowSize / 2)) {
            const windowBets = bets.slice(i, i + windowSize);
            const hits = windowBets.filter(r => r.hit === 1).length;
            const hitRate = hits / windowSize;
            const avgBaseline = windowBets.reduce((s, r) => s + r.baseline_p, 0) / windowSize;
            const totalPnl = windowBets.reduce((s, r) => s + r.pnl, 0);
            const evPerBet = totalPnl / windowSize;
            const avgK = windowBets.reduce((s, r) => s + r.K, 0) / windowSize;

            windows.push({
                startIndex: i,
                endIndex: i + windowSize - 1,
                startSpinIndex: windowBets[0].spinIndex,
                endSpinIndex: windowBets[windowSize - 1].spinIndex,
                hitRate,
                avgBaseline,
                hitUplift: hitRate - avgBaseline,
                totalPnl,
                evPerBet,
                avgK
            });
        }

        return windows;
    }

    /**
     * Reset all records.
     */
    reset() {
        this.records = [];
    }
}

// ═══════════════════════════════════════════════════════════
//  DUAL EXPORT (Node.js + Browser)
// ═══════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DecisionLogger, canonicalPocket, canonicalSet, computeBaseline, physicalSet };
} else if (typeof window !== 'undefined') {
    window.DecisionLogger = DecisionLogger;
    window.canonicalPocket = canonicalPocket;
    window.canonicalSet = canonicalSet;
    window.computeBaseline = computeBaseline;
    window.physicalSet = physicalSet;
}
