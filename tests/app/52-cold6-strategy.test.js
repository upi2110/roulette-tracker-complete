/**
 * TEST 52: Cold-6 Strategy Backtest
 *
 * Strategy: Look at last 100 spins, find the 6 LEAST frequent numbers,
 *           bet on those 6 for the next spin. Slide window forward by 1.
 *
 * Run modes:
 *   npx jest tests/app/52   --verbose          ← cold-6 backtest only
 *   npx jest tests/app/52   --verbose -t "auto" ← existing auto-mode sanity checks
 *   npx jest tests/app/52   --verbose -t "cold" ← cold-6 strategy only
 *
 * Environment variables:
 *   COLD6_BET=0.50       ← bet per number (default $0.50)
 *   COLD6_WINDOW=100     ← lookback window (default 100)
 *   COLD6_PICK=6         ← how many cold numbers to pick (default 6)
 *   COLD6_FILE=data1.txt ← single file to test (default: all files)
 *
 * No production code is modified. This file is test-only.
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
//  DATA LOADER
// ═══════════════════════════════════════════════════════════

const DATA_DIR = path.join(__dirname, '..', '..', 'app', 'data');

function loadSpinsFromFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const spins = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Format: "1→13" or just a number
        const num = trimmed.includes('→') ? parseInt(trimmed.split('→')[1]) : parseInt(trimmed);
        if (!isNaN(num) && num >= 0 && num <= 36) {
            spins.push(num);
        }
    }
    return spins;
}

function loadAllDataFiles() {
    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.txt'))
        .sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, '')) || 0;
            const nb = parseInt(b.replace(/\D/g, '')) || 0;
            return na - nb;
        });
    return files.map(f => ({
        name: f,
        spins: loadSpinsFromFile(path.join(DATA_DIR, f))
    }));
}

// ═══════════════════════════════════════════════════════════
//  COLD-6 STRATEGY ENGINE (test-only, no production changes)
// ═══════════════════════════════════════════════════════════

/**
 * Find the N least frequent numbers in a window of spins.
 * Ties broken by: least recent appearance first (colder).
 */
function findColdNumbers(window, pickCount) {
    // Count frequency of each number 0-36
    const freq = new Array(37).fill(0);
    const lastSeen = new Array(37).fill(-1);

    for (let i = 0; i < window.length; i++) {
        freq[window[i]]++;
        lastSeen[window[i]] = i;
    }

    // Build array of {num, freq, lastSeen} and sort
    const ranked = [];
    for (let n = 0; n <= 36; n++) {
        ranked.push({ num: n, freq: freq[n], lastSeen: lastSeen[n] });
    }

    // Sort: lowest frequency first, then least recently seen first (tie-break)
    ranked.sort((a, b) => {
        if (a.freq !== b.freq) return a.freq - b.freq;
        return a.lastSeen - b.lastSeen; // lower = appeared earlier = colder
    });

    return ranked.slice(0, pickCount).map(r => r.num);
}

/**
 * Run the cold-6 backtest on a spin sequence.
 *
 * @param {number[]} spins     - Full spin sequence
 * @param {object}   opts      - { window, pickCount, betPerNumber }
 * @returns {object} Full results with session stats
 */
function runCold6Backtest(spins, opts = {}) {
    const WINDOW = opts.window || 100;
    const PICK = opts.pickCount || 6;
    const BET_PER_NUM = opts.betPerNumber || 0.50;

    if (spins.length <= WINDOW) {
        return { error: 'Not enough spins', totalSpins: spins.length, window: WINDOW };
    }

    const results = {
        window: WINDOW,
        pickCount: PICK,
        betPerNumber: BET_PER_NUM,
        totalSpins: spins.length,
        bettingSpins: spins.length - WINDOW,
        wins: 0,
        losses: 0,
        totalBet: 0,
        totalPayout: 0,
        profit: 0,
        winRate: 0,
        peakProfit: -Infinity,
        maxDrawdown: 0,
        longestLoseStreak: 0,
        longestWinStreak: 0,
        hitNumbers: [],        // which numbers hit when we won
        sessionLog: [],        // per-spin log: { spin, actual, coldNums, hit, profit }

        // Conservative money management tracking
        bankroll: 0,
        minBankroll: 0,
        maxBankroll: 0,
        bankrollHistory: []
    };

    let currentStreak = 0;
    let streakType = null; // 'win' or 'lose'
    let currentLoseStreak = 0;
    let currentWinStreak = 0;

    // Slide window: start betting from spin index WINDOW
    for (let i = WINDOW; i < spins.length; i++) {
        const windowSlice = spins.slice(i - WINDOW, i);
        const coldNums = findColdNumbers(windowSlice, PICK);
        const actual = spins[i];

        const betTotal = BET_PER_NUM * PICK;
        results.totalBet += betTotal;

        const hit = coldNums.includes(actual);
        let spinPayout = 0;

        if (hit) {
            // Roulette pays 35:1 on a straight-up bet
            spinPayout = BET_PER_NUM * 35;
            results.wins++;
            results.hitNumbers.push(actual);
            currentWinStreak++;
            currentLoseStreak = 0;
        } else {
            results.losses++;
            currentLoseStreak++;
            currentWinStreak = 0;
        }

        const spinProfit = spinPayout - betTotal;
        results.profit += spinProfit;
        results.bankroll += spinProfit;

        // Track streaks
        if (currentLoseStreak > results.longestLoseStreak) {
            results.longestLoseStreak = currentLoseStreak;
        }
        if (currentWinStreak > results.longestWinStreak) {
            results.longestWinStreak = currentWinStreak;
        }

        // Track peak/drawdown
        if (results.bankroll > results.peakProfit) {
            results.peakProfit = results.bankroll;
        }
        if (results.bankroll < results.minBankroll) {
            results.minBankroll = results.bankroll;
        }
        if (results.bankroll > results.maxBankroll) {
            results.maxBankroll = results.bankroll;
        }

        const drawdown = results.peakProfit - results.bankroll;
        if (drawdown > results.maxDrawdown) {
            results.maxDrawdown = drawdown;
        }

        results.bankrollHistory.push(results.bankroll);

        results.sessionLog.push({
            spinIndex: i + 1,
            actual,
            coldNums: [...coldNums],
            hit,
            betTotal,
            payout: spinPayout,
            spinProfit,
            cumProfit: results.bankroll
        });
    }

    results.winRate = results.bettingSpins > 0
        ? ((results.wins / results.bettingSpins) * 100)
        : 0;

    // ROI = profit / totalBet * 100
    results.roi = results.totalBet > 0
        ? ((results.profit / results.totalBet) * 100)
        : 0;

    return results;
}

/**
 * Print a formatted report for a backtest result.
 */
function printReport(label, r) {
    if (r.error) {
        console.log(`  ⚠️  ${label}: ${r.error} (${r.totalSpins} spins, need ${r.window}+)`);
        return;
    }
    console.log(`\n  ━━━ ${label} ━━━`);
    console.log(`  Spins: ${r.totalSpins} total, ${r.bettingSpins} bets (window=${r.window}, pick=${r.pickCount})`);
    console.log(`  Bet/num: $${r.betPerNumber.toFixed(2)} × ${r.pickCount} = $${(r.betPerNumber * r.pickCount).toFixed(2)}/spin`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Wins: ${r.wins}   Losses: ${r.losses}   Win%: ${r.winRate.toFixed(2)}%`);
    console.log(`  Total bet: $${r.totalBet.toFixed(2)}   Payout: $${r.totalPayout > 0 ? r.totalPayout.toFixed(2) : (r.totalBet + r.profit).toFixed(2)}`);
    console.log(`  💰 Profit: $${r.profit.toFixed(2)}   ROI: ${r.roi.toFixed(2)}%`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Peak: $${r.peakProfit.toFixed(2)}   Trough: $${r.minBankroll.toFixed(2)}   Max Drawdown: $${r.maxDrawdown.toFixed(2)}`);
    console.log(`  Longest lose streak: ${r.longestLoseStreak}   Longest win streak: ${r.longestWinStreak}`);
    if (r.hitNumbers.length > 0) {
        // Frequency of hit numbers
        const hitFreq = {};
        r.hitNumbers.forEach(n => { hitFreq[n] = (hitFreq[n] || 0) + 1; });
        const topHits = Object.entries(hitFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
        console.log(`  Top hit numbers: ${topHits.map(([n, c]) => `${n}(×${c})`).join(', ')}`);
    }
}

// ═══════════════════════════════════════════════════════════
//  A. AUTO-MODE SANITY CHECKS (existing test compatibility)
// ═══════════════════════════════════════════════════════════

describe('52 — Cold-6 Strategy Backtest', () => {

    describe('auto: data loading', () => {
        test('loads all data files from app/data/', () => {
            const files = loadAllDataFiles();
            expect(files.length).toBeGreaterThanOrEqual(1);
            files.forEach(f => {
                expect(f.spins.length).toBeGreaterThan(0);
                f.spins.forEach(n => {
                    expect(n).toBeGreaterThanOrEqual(0);
                    expect(n).toBeLessThanOrEqual(36);
                });
            });
        });

        test('each data file has 200+ spins', () => {
            const files = loadAllDataFiles();
            files.forEach(f => {
                expect(f.spins.length).toBeGreaterThan(200);
            });
        });
    });

    describe('auto: findColdNumbers logic', () => {
        test('returns exactly N cold numbers', () => {
            // 100 spins of number 5 → number 5 is HOT, everything else is cold
            const window = new Array(100).fill(5);
            const cold = findColdNumbers(window, 6);
            expect(cold).toHaveLength(6);
            // 5 should NOT be in cold list (it appeared 100 times)
            expect(cold).not.toContain(5);
        });

        test('picks numbers with 0 frequency first', () => {
            // Window with only a few numbers → many have freq=0
            const window = [1, 1, 1, 2, 2, 3];
            const cold = findColdNumbers(window, 6);
            expect(cold).toHaveLength(6);
            // None of 1, 2, 3 should be in cold (they appeared), unless there aren't enough zeros
            // With 37 numbers and only 3 appearing, there are 34 with freq=0
            expect(cold).not.toContain(1);
            expect(cold).not.toContain(2);
            expect(cold).not.toContain(3);
        });

        test('tie-breaking: least recently seen comes first', () => {
            // All numbers appear exactly once except we test tie-break
            const window = [];
            for (let i = 0; i <= 36; i++) window.push(i); // each appears once
            // Now add extras: 0 and 1 appear twice
            window.push(0, 1);
            const cold = findColdNumbers(window, 6);
            // 0 and 1 have freq=2, everyone else has freq=1
            // Cold should be 6 numbers with freq=1 (NOT 0 or 1)
            expect(cold).not.toContain(0);
            expect(cold).not.toContain(1);
            expect(cold).toHaveLength(6);
        });

        test('returns all 37 numbers if pickCount=37', () => {
            const window = [5, 10, 15];
            const cold = findColdNumbers(window, 37);
            expect(cold).toHaveLength(37);
            const sorted = [...cold].sort((a, b) => a - b);
            expect(sorted).toEqual(Array.from({ length: 37 }, (_, i) => i));
        });

        test('handles empty window', () => {
            const cold = findColdNumbers([], 6);
            expect(cold).toHaveLength(6);
            // All have freq 0, so any 6 are valid
        });
    });

    describe('auto: backtest engine', () => {
        test('rejects sequences shorter than window', () => {
            const result = runCold6Backtest([1, 2, 3], { window: 100 });
            expect(result.error).toBeDefined();
        });

        test('correct win/loss counting on known sequence', () => {
            // Build a predictable sequence:
            // First 100 spins: numbers 0-9 appear 10 times each
            const training = [];
            for (let i = 0; i < 10; i++) {
                for (let n = 0; n <= 9; n++) training.push(n);
            }
            // Spin 101: number 15 → cold picks from [10-36] (all freq=0), 15 is in that set → HIT
            training.push(15);

            const result = runCold6Backtest(training, { window: 100, pickCount: 27 });
            expect(result.bettingSpins).toBe(1);
            // Pick 27 cold numbers from 27 that have freq=0 (numbers 10-36) → 15 is guaranteed in picks
            expect(result.wins).toBe(1);
            expect(result.wins + result.losses).toBe(1);
        });

        test('payout math: 35:1 per number hit', () => {
            // 100 training + 1 bet spin
            const spins = new Array(100).fill(5);
            spins.push(10); // bet spin — cold nums will be everything except 5
            const result = runCold6Backtest(spins, { window: 100, pickCount: 6, betPerNumber: 1.00 });

            expect(result.bettingSpins).toBe(1);
            if (result.wins === 1) {
                // Payout = $1 × 35 = $35, bet = $1 × 6 = $6, profit = $29
                expect(result.profit).toBeCloseTo(29, 2);
            } else {
                // Miss: profit = -$6
                expect(result.profit).toBeCloseTo(-6, 2);
            }
        });

        test('bankroll tracking works', () => {
            const files = loadAllDataFiles();
            if (files.length === 0) return;
            const result = runCold6Backtest(files[0].spins, { window: 100, pickCount: 6 });
            expect(result.bankrollHistory.length).toBe(result.bettingSpins);
            // Last bankroll entry = final profit
            expect(result.bankrollHistory[result.bankrollHistory.length - 1]).toBeCloseTo(result.profit, 2);
        });

        test('session log has correct length', () => {
            const files = loadAllDataFiles();
            if (files.length === 0) return;
            const result = runCold6Backtest(files[0].spins, { window: 100, pickCount: 6 });
            expect(result.sessionLog.length).toBe(result.bettingSpins);
            // Each entry has required fields
            const entry = result.sessionLog[0];
            expect(entry).toHaveProperty('spinIndex');
            expect(entry).toHaveProperty('actual');
            expect(entry).toHaveProperty('coldNums');
            expect(entry).toHaveProperty('hit');
            expect(entry).toHaveProperty('cumProfit');
            expect(entry.coldNums).toHaveLength(6);
        });
    });

    // ═══════════════════════════════════════════════════════
    //  B. COLD-6 BACKTEST — PER-FILE RESULTS
    // ═══════════════════════════════════════════════════════

    describe('cold-6: per-file backtest', () => {
        const files = loadAllDataFiles();
        const WINDOW = parseInt(process.env.COLD6_WINDOW) || 100;
        const PICK = parseInt(process.env.COLD6_PICK) || 6;
        const BET = parseFloat(process.env.COLD6_BET) || 0.50;

        const targetFile = process.env.COLD6_FILE;
        const testFiles = targetFile
            ? files.filter(f => f.name === targetFile)
            : files;

        test.each(testFiles.map(f => [f.name, f]))(
            '%s — cold-6 win rate and profit',
            (name, fileData) => {
                const result = runCold6Backtest(fileData.spins, {
                    window: WINDOW,
                    pickCount: PICK,
                    betPerNumber: BET
                });

                expect(result.error).toBeUndefined();
                expect(result.bettingSpins).toBeGreaterThan(0);
                expect(result.wins + result.losses).toBe(result.bettingSpins);

                printReport(name, result);

                // Sanity: win rate should be roughly 6/37 ≈ 16.2% ± variance
                // We just verify it's not broken (0-50% range is valid)
                expect(result.winRate).toBeGreaterThanOrEqual(0);
                expect(result.winRate).toBeLessThanOrEqual(50);
            }
        );
    });

    // ═══════════════════════════════════════════════════════
    //  C. COLD-6 BACKTEST — ALL FILES COMBINED (mega session)
    // ═══════════════════════════════════════════════════════

    describe('cold-6: combined mega session', () => {
        test('all data files concatenated — full backtest with report', () => {
            const files = loadAllDataFiles();
            const WINDOW = parseInt(process.env.COLD6_WINDOW) || 100;
            const PICK = parseInt(process.env.COLD6_PICK) || 6;
            const BET = parseFloat(process.env.COLD6_BET) || 0.50;

            // Concatenate all spins
            const allSpins = [];
            files.forEach(f => allSpins.push(...f.spins));

            expect(allSpins.length).toBeGreaterThan(WINDOW + 100);

            const result = runCold6Backtest(allSpins, {
                window: WINDOW,
                pickCount: PICK,
                betPerNumber: BET
            });

            expect(result.error).toBeUndefined();

            printReport(`ALL FILES COMBINED (${allSpins.length} spins)`, result);

            // Expected win rate ≈ 6/37 = 16.2%
            const expected = (PICK / 37) * 100;
            console.log(`\n  📊 Expected (random): ${expected.toFixed(2)}%   Actual: ${result.winRate.toFixed(2)}%   Delta: ${(result.winRate - expected).toFixed(2)}%`);

            // Conservative money management summary
            const betPerSpin = BET * PICK;
            console.log(`  💵 Conservative flat bet: $${BET}/num × ${PICK} nums = $${betPerSpin.toFixed(2)}/spin`);
            console.log(`  📈 Final bankroll: $${result.bankroll.toFixed(2)}   (started at $0)`);
            console.log(`  🔻 Worst drawdown: $${result.maxDrawdown.toFixed(2)}   Min bankroll: $${result.minBankroll.toFixed(2)}`);
            console.log(`  🎯 Break-even requires: ${(100 / (35 / PICK + 1) * 100 / 100).toFixed(2)}% win rate\n`);

            expect(result.wins + result.losses).toBe(result.bettingSpins);
        });
    });

    // ═══════════════════════════════════════════════════════
    //  D. COLD-6 BACKTEST — PARAMETER SWEEP
    // ═══════════════════════════════════════════════════════

    describe('cold-6: parameter comparison', () => {
        test('compare window sizes: 50, 100, 150, 200', () => {
            const files = loadAllDataFiles();
            const allSpins = [];
            files.forEach(f => allSpins.push(...f.spins));

            const windows = [50, 100, 150, 200];
            const BET = 0.50;
            const PICK = 6;

            console.log(`\n  ┌──────────┬─────────┬─────────┬──────────┬───────────┬──────────────┐`);
            console.log(`  │ Window   │ Wins    │ Win %   │ Profit   │ ROI       │ Max Drawdown │`);
            console.log(`  ├──────────┼─────────┼─────────┼──────────┼───────────┼──────────────┤`);

            for (const w of windows) {
                if (allSpins.length <= w) continue;
                const r = runCold6Backtest(allSpins, { window: w, pickCount: PICK, betPerNumber: BET });
                if (r.error) continue;

                const row = [
                    String(w).padStart(6),
                    `${r.wins}/${r.bettingSpins}`.padStart(7),
                    `${r.winRate.toFixed(1)}%`.padStart(7),
                    `$${r.profit.toFixed(2)}`.padStart(8),
                    `${r.roi.toFixed(1)}%`.padStart(9),
                    `$${r.maxDrawdown.toFixed(2)}`.padStart(12)
                ];
                console.log(`  │ ${row.join(' │ ')} │`);
            }
            console.log(`  └──────────┴─────────┴─────────┴──────────┴───────────┴──────────────┘`);

            // Just ensure no crashes
            expect(true).toBe(true);
        });

        test('compare pick counts: 4, 6, 8, 10', () => {
            const files = loadAllDataFiles();
            const allSpins = [];
            files.forEach(f => allSpins.push(...f.spins));

            const picks = [4, 6, 8, 10];
            const BET = 0.50;
            const WINDOW = 100;

            console.log(`\n  ┌──────────┬─────────┬─────────┬──────────┬───────────┬───────────────┐`);
            console.log(`  │ Pick     │ Wins    │ Win %   │ Profit   │ ROI       │ Lose Streak   │`);
            console.log(`  ├──────────┼─────────┼─────────┼──────────┼───────────┼───────────────┤`);

            for (const p of picks) {
                const r = runCold6Backtest(allSpins, { window: WINDOW, pickCount: p, betPerNumber: BET });
                if (r.error) continue;

                const breakEven = (p / (35 + 1)) * 100;
                const row = [
                    `${p} nums`.padStart(6),
                    `${r.wins}/${r.bettingSpins}`.padStart(7),
                    `${r.winRate.toFixed(1)}%`.padStart(7),
                    `$${r.profit.toFixed(2)}`.padStart(8),
                    `${r.roi.toFixed(1)}%`.padStart(9),
                    `${r.longestLoseStreak}`.padStart(13)
                ];
                console.log(`  │ ${row.join(' │ ')} │`);
            }
            console.log(`  └──────────┴─────────┴─────────┴──────────┴───────────┴───────────────┘`);

            expect(true).toBe(true);
        });
    });
});
