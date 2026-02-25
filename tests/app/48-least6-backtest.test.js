/**
 * 48-least6-backtest.test.js
 * STANDALONE backtest: Bet on the 6 numbers that appeared LEAST
 * in the last 100 spins. Sliding window — recalculate every spin.
 *
 * NO app code changes — purely analysis of training data.
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
//  Data Loading
// ═══════════════════════════════════════════════════════════════
const DATA_DIR = path.join(__dirname, '..', '..', 'app', 'data');

function loadDataFile(filename) {
    const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8');
    return content.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !isNaN(parseInt(line)))
        .map(line => parseInt(line))
        .filter(n => n >= 0 && n <= 36);
}

function getDataFiles() {
    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.match(/^data\d+\.txt$/))
        .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)[0]);
            const nb = parseInt(b.match(/\d+/)[0]);
            return na - nb;
        });
    return files;
}

// ═══════════════════════════════════════════════════════════════
//  Core Algorithm
// ═══════════════════════════════════════════════════════════════

/**
 * Find the 6 numbers with LOWEST frequency in a 100-spin window.
 * Ties broken by number value (ascending) for deterministic results.
 */
function findLeast6(window100) {
    // Count frequency of each number 0-36
    const freq = new Array(37).fill(0);
    window100.forEach(n => {
        if (n >= 0 && n <= 36) freq[n]++;
    });

    // Create array of [number, frequency] pairs
    const pairs = [];
    for (let i = 0; i <= 36; i++) {
        pairs.push([i, freq[i]]);
    }

    // Sort by frequency ascending, then by number ascending for tie-breaking
    pairs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

    // Return first 6
    return pairs.slice(0, 6).map(p => p[0]);
}

/**
 * Run the full backtest on a single data array.
 * Returns: { totalBets, hits, misses, hitRate, profit, costPerBet, winPayout }
 */
function runBacktest(spins) {
    const WINDOW_SIZE = 100;
    const BET_PER_NUMBER = 2;  // $2 per number
    const NUM_BETS = 6;
    const COST_PER_SPIN = BET_PER_NUMBER * NUM_BETS;  // $12
    const WIN_PAYOUT = BET_PER_NUMBER * 36;  // $72 (35:1 + original)

    let totalBets = 0;
    let hits = 0;
    let misses = 0;
    let profit = 0;

    // Start from position WINDOW_SIZE (index 100 = 101st number)
    for (let i = WINDOW_SIZE; i < spins.length; i++) {
        const window100 = spins.slice(i - WINDOW_SIZE, i);
        const least6 = findLeast6(window100);
        const nextSpin = spins[i];

        totalBets++;

        if (least6.includes(nextSpin)) {
            hits++;
            profit += (WIN_PAYOUT - COST_PER_SPIN);  // +$60
        } else {
            misses++;
            profit -= COST_PER_SPIN;  // -$12
        }
    }

    const hitRate = totalBets > 0 ? (hits / totalBets * 100) : 0;

    return {
        totalBets,
        hits,
        misses,
        hitRate: parseFloat(hitRate.toFixed(2)),
        profit,
        costPerBet: COST_PER_SPIN,
        winPayout: WIN_PAYOUT
    };
}

// ═══════════════════════════════════════════════════════════════
//  A. Data Loading Tests
// ═══════════════════════════════════════════════════════════════
describe('A. Data Loading', () => {
    test('A1: all 14 data files exist and load', () => {
        const files = getDataFiles();
        expect(files.length).toBeGreaterThanOrEqual(14);

        files.forEach(f => {
            const data = loadDataFile(f);
            expect(data.length).toBeGreaterThan(0);
        });
    });

    test('A2: all numbers in valid range 0-36', () => {
        const files = getDataFiles();
        files.forEach(f => {
            const data = loadDataFile(f);
            data.forEach(n => {
                expect(n).toBeGreaterThanOrEqual(0);
                expect(n).toBeLessThanOrEqual(36);
            });
        });
    });

    test('A3: each file has at least 100 numbers (enough for backtest)', () => {
        const files = getDataFiles();
        files.forEach(f => {
            const data = loadDataFile(f);
            expect(data.length).toBeGreaterThanOrEqual(100);
        });
    });

    test('A4: total data across all files > 5000 spins', () => {
        const files = getDataFiles();
        let total = 0;
        files.forEach(f => {
            total += loadDataFile(f).length;
        });
        expect(total).toBeGreaterThan(5000);
    });
});

// ═══════════════════════════════════════════════════════════════
//  B. findLeast6 Unit Tests
// ═══════════════════════════════════════════════════════════════
describe('B. findLeast6 Unit Tests', () => {
    test('B1: returns exactly 6 numbers', () => {
        // Create 100 spins where some numbers appear more than others
        const window100 = [];
        for (let i = 0; i < 100; i++) {
            window100.push(i % 10);  // Only 0-9 appear, so 10-36 have freq 0
        }
        const result = findLeast6(window100);
        expect(result.length).toBe(6);
    });

    test('B2: selects numbers with lowest frequency', () => {
        // Create data where 30-36 appear 0 times
        const window100 = [];
        for (let i = 0; i < 100; i++) {
            window100.push(i % 20);  // 0-19 each appear ~5 times, 20-36 appear 0 times
        }
        const result = findLeast6(window100);
        // All 6 should be from the 0-frequency group (20-36)
        result.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(20);
            expect(n).toBeLessThanOrEqual(36);
        });
    });

    test('B3: handles ties deterministically (lower number first)', () => {
        // All numbers appear equally (0 times) — should pick 0,1,2,3,4,5
        const window100 = new Array(100).fill(99);  // 99 is out of range, freq all 0
        // Actually, fill with valid but repeated numbers
        const data = [];
        for (let i = 0; i < 100; i++) data.push(0);  // Only 0 appears
        const result = findLeast6(data);
        // Numbers 1-36 all have freq 0, should pick 1,2,3,4,5,6 (lowest 6 non-zero-freq... no, 0 has freq 100, rest have 0)
        expect(result).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('B4: all returned numbers are in range 0-36', () => {
        const window100 = [];
        for (let i = 0; i < 100; i++) window100.push(Math.floor(Math.random() * 37));
        const result = findLeast6(window100);
        result.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(36);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  C. Per-File Backtest Results
// ═══════════════════════════════════════════════════════════════
describe('C. Per-File Backtest', () => {
    const files = getDataFiles();
    const allResults = [];

    test.each(files)('C-File: %s — runs backtest successfully', (filename) => {
        const spins = loadDataFile(filename);
        const result = runBacktest(spins);

        allResults.push({ filename, ...result });

        // Basic sanity checks
        expect(result.totalBets).toBeGreaterThan(0);
        expect(result.hits + result.misses).toBe(result.totalBets);
        expect(result.hitRate).toBeGreaterThanOrEqual(0);
        expect(result.hitRate).toBeLessThanOrEqual(100);

        // Print per-file result
        console.log(`📊 ${filename}: ${result.totalBets} bets, ${result.hits} hits (${result.hitRate}%), P/L: $${result.profit}`);
    });
});

// ═══════════════════════════════════════════════════════════════
//  D. Aggregate Results
// ═══════════════════════════════════════════════════════════════
describe('D. Aggregate Results', () => {
    test('D1: aggregate across all files', () => {
        const files = getDataFiles();
        let totalBets = 0, totalHits = 0, totalMisses = 0, totalProfit = 0;

        const fileResults = [];

        files.forEach(filename => {
            const spins = loadDataFile(filename);
            const result = runBacktest(spins);
            totalBets += result.totalBets;
            totalHits += result.hits;
            totalMisses += result.misses;
            totalProfit += result.profit;
            fileResults.push({ filename, ...result });
        });

        const aggregateHitRate = totalBets > 0 ? (totalHits / totalBets * 100).toFixed(2) : 0;
        const expectedRandom = (6 / 37 * 100).toFixed(2);  // 16.22%
        const breakEvenRate = (12 / 72 * 100).toFixed(2);  // 16.67%

        console.log('\n' + '═'.repeat(80));
        console.log('  LEAST-6-NUMBERS BACKTEST RESULTS');
        console.log('═'.repeat(80));
        console.log(`  Strategy: Bet $2 each on 6 least-frequent numbers in last 100 spins`);
        console.log(`  Cost per spin: $12 (6 x $2)  |  Win payout: $72 (35:1 + stake)`);
        console.log(`  Break-even hit rate: ${breakEvenRate}%  |  Random expected: ${expectedRandom}%`);
        console.log('─'.repeat(80));
        console.log('  File         | Spins | Bets  | Hits | Hit Rate | Profit/Loss');
        console.log('─'.repeat(80));

        fileResults.forEach(r => {
            const name = r.filename.padEnd(14);
            const spins = String(r.totalBets + 100).padStart(5);
            const bets = String(r.totalBets).padStart(5);
            const hits = String(r.hits).padStart(4);
            const rate = (r.hitRate + '%').padStart(8);
            const pl = ('$' + r.profit).padStart(11);
            console.log(`  ${name} | ${spins} | ${bets} | ${hits} | ${rate} | ${pl}`);
        });

        console.log('─'.repeat(80));
        console.log(`  TOTAL         | ${String(totalBets + files.length * 100).padStart(5)} | ${String(totalBets).padStart(5)} | ${String(totalHits).padStart(4)} | ${(aggregateHitRate + '%').padStart(8)} | ${'$' + totalProfit}`);
        console.log('═'.repeat(80));

        // Verify totals are consistent
        expect(totalHits + totalMisses).toBe(totalBets);
        expect(totalBets).toBeGreaterThan(0);
    });

    test('D2: hit rate is consistent with random expectation (within reason)', () => {
        const files = getDataFiles();
        let totalBets = 0, totalHits = 0;

        files.forEach(filename => {
            const spins = loadDataFile(filename);
            const result = runBacktest(spins);
            totalBets += result.totalBets;
            totalHits += result.hits;
        });

        const hitRate = totalHits / totalBets * 100;

        // Random expectation is 6/37 = 16.22%
        // Should be somewhere in range 5%-30% (very loose bounds for data-dependent test)
        expect(hitRate).toBeGreaterThan(5);
        expect(hitRate).toBeLessThan(30);
    });

    test('D3: total bets equals sum of (fileLength - 100) across files', () => {
        const files = getDataFiles();
        let expectedBets = 0;

        files.forEach(filename => {
            const spins = loadDataFile(filename);
            expectedBets += Math.max(0, spins.length - 100);
        });

        let actualBets = 0;
        files.forEach(filename => {
            const spins = loadDataFile(filename);
            actualBets += runBacktest(spins).totalBets;
        });

        expect(actualBets).toBe(expectedBets);
    });

    test('D4: profit matches (hits * 60) - (misses * 12)', () => {
        const files = getDataFiles();

        files.forEach(filename => {
            const spins = loadDataFile(filename);
            const result = runBacktest(spins);
            const expectedProfit = (result.hits * 60) - (result.misses * 12);
            expect(result.profit).toBe(expectedProfit);
        });
    });
});

// ═══════════════════════════════════════════════════════════════
//  E. Edge Cases
// ═══════════════════════════════════════════════════════════════
describe('E. Edge Cases', () => {
    test('E1: exactly 100 spins produces 0 bets', () => {
        const spins = new Array(100).fill(0).map((_, i) => i % 37);
        const result = runBacktest(spins);
        expect(result.totalBets).toBe(0);
        expect(result.profit).toBe(0);
    });

    test('E2: 101 spins produces exactly 1 bet', () => {
        const spins = new Array(101).fill(0).map((_, i) => i % 37);
        const result = runBacktest(spins);
        expect(result.totalBets).toBe(1);
    });

    test('E3: sliding window recalculates correctly', () => {
        // Create data where last number changes what the least-6 are
        const spins = [];
        // First 100: numbers 0-9 appear 10 times each
        for (let round = 0; round < 10; round++) {
            for (let n = 0; n < 10; n++) {
                spins.push(n);
            }
        }
        // Position 100: spin 15 (should be in least-6 since 10-36 have freq 0)
        spins.push(15);
        // Position 101: spin 20 (window now shifts by 1)
        spins.push(20);

        const result = runBacktest(spins);
        expect(result.totalBets).toBe(2);
    });

    test('E4: uniform distribution produces expected frequencies', () => {
        // All 37 numbers appear exactly once (37 spins), pad to 100
        const window100 = [];
        for (let i = 0; i <= 36; i++) window100.push(i);
        // Pad with repeated 0s to reach 100
        for (let i = 37; i < 100; i++) window100.push(0);

        const least6 = findLeast6(window100);
        // Numbers that appear only once (1-36 each have freq 1)
        // Number 0 has freq 64 (1 + 63 padding)
        // So least6 should be from {1,2,3,...,36} which all have freq 1
        least6.forEach(n => {
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(36);
        });
    });
});
