#!/usr/bin/env node
/**
 * SANDBOX: Filter-based betting analysis
 *
 * Strategy: Wait for a positive/negative number, then bet only numbers
 * from a specific filter group. Test all combinations.
 *
 * Trigger: "wait for positive" or "wait for negative" spin
 * Then bet on numbers from: table × sign × set filter
 *
 * Does NOT modify any engine code — standalone analysis.
 */

const fs = require('fs');

// ═══════════════════════════════════════════════════════════
//  NUMBER SETS (from ai-auto-engine.js)
// ═══════════════════════════════════════════════════════════

const ZERO_TABLE  = new Set([3,26,0,32,21,2,25,27,13,36,23,10,5,1,20,14,18,29,7]);
const NINE_TABLE  = new Set([15,19,4,17,34,6,11,30,8,24,16,33,31,9,22,28,12,35]);
const POSITIVE    = new Set([3,26,0,32,15,19,4,27,13,36,11,30,8,1,20,14,31,9,22]);
const NEGATIVE    = new Set([21,2,25,17,34,6,23,10,5,24,16,33,18,29,7,28,12,35]);
const SET_0       = new Set([0,26,19,2,34,13,30,10,16,20,9,29,12]);
const SET_5       = new Set([32,15,25,17,36,11,5,24,14,31,7,28]);
const SET_6       = new Set([4,21,6,27,8,23,33,1,22,18,35,3]);

// ═══════════════════════════════════════════════════════════
//  FILTER LOGIC
// ═══════════════════════════════════════════════════════════

function getFilteredNumbers(table, sign, set) {
    // Start with all 37 numbers
    let nums = [];
    for (let i = 0; i <= 36; i++) nums.push(i);

    // Table filter
    if (table === 'zero') {
        nums = nums.filter(n => ZERO_TABLE.has(n));
    } else if (table === 'nineteen') {
        nums = nums.filter(n => NINE_TABLE.has(n));
    }
    // 'both' = no table filter

    // Sign filter
    if (sign === 'positive') {
        nums = nums.filter(n => POSITIVE.has(n));
    } else if (sign === 'negative') {
        nums = nums.filter(n => NEGATIVE.has(n));
    }
    // 'both' = no sign filter

    // Set filter
    if (set === 'set0') {
        nums = nums.filter(n => SET_0.has(n));
    } else if (set === 'set5') {
        nums = nums.filter(n => SET_5.has(n));
    } else if (set === 'set6') {
        nums = nums.filter(n => SET_6.has(n));
    }
    // 'all' = no set filter

    return nums;
}

// ═══════════════════════════════════════════════════════════
//  SIMULATION
// ═══════════════════════════════════════════════════════════

function simulate(spins, triggerSign, betNumbers, betPerNum = 2) {
    const count = betNumbers.length;
    if (count === 0) return null;

    let totalBets = 0;
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;
    let peakProfit = 0;
    let maxDrawdown = 0;

    // Session-based tracking (target $100 profit per session)
    let sessionProfit = 0;
    let sessionWins = 0;
    let sessionBusts = 0;
    let sessionIncomplete = 0;
    let sessionCount = 0;
    let sessionSpins = 0;
    const SESSION_TARGET = 100;
    const SESSION_BUST = -500; // bust if lose $500 in a session

    for (let i = 0; i < spins.length - 1; i++) {
        const current = spins[i];
        const next = spins[i + 1];

        // Check trigger: does current spin match our trigger condition?
        let triggered = false;
        if (triggerSign === 'positive' && POSITIVE.has(current)) triggered = true;
        if (triggerSign === 'negative' && NEGATIVE.has(current)) triggered = true;
        if (triggerSign === 'any') triggered = true; // bet every spin

        if (!triggered) continue;

        // Place bet
        totalBets++;
        sessionSpins++;
        const hit = betNumbers.includes(next);

        let pnl;
        if (hit) {
            pnl = betPerNum * (36 - count); // win: 35:1 minus other bets
            wins++;
        } else {
            pnl = -(betPerNum * count); // lose all bets
            losses++;
        }

        totalProfit += pnl;
        sessionProfit += pnl;

        if (totalProfit > peakProfit) peakProfit = totalProfit;
        const dd = peakProfit - totalProfit;
        if (dd > maxDrawdown) maxDrawdown = dd;

        // Session tracking
        if (sessionProfit >= SESSION_TARGET) {
            sessionWins++;
            sessionCount++;
            sessionProfit = 0;
            sessionSpins = 0;
        } else if (sessionProfit <= SESSION_BUST) {
            sessionBusts++;
            sessionCount++;
            sessionProfit = 0;
            sessionSpins = 0;
        }
    }

    // Last incomplete session
    if (sessionSpins > 0) {
        sessionIncomplete++;
        sessionCount++;
    }

    const hitRate = totalBets > 0 ? (wins / totalBets * 100).toFixed(1) : '0.0';
    const expectedHitRate = (count / 37 * 100).toFixed(1);

    return {
        totalBets,
        wins,
        losses,
        hitRate: parseFloat(hitRate),
        expectedHitRate: parseFloat(expectedHitRate),
        totalProfit,
        maxDrawdown,
        numbersCount: count,
        sessionWins,
        sessionBusts,
        sessionIncomplete,
        sessionCount
    };
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════

const testFiles = [
    { name: 'test_data2.txt', path: '/Users/ubusan-nb-ecr/Desktop/test_data2.txt' },
    { name: 'test_data3.txt', path: '/Users/ubusan-nb-ecr/Desktop/test_data3.txt' },
];

const triggers = ['positive', 'negative', 'any'];
const tables = ['both', 'zero', 'nineteen'];
const signs = ['positive', 'negative', 'both'];
const sets = ['all', 'set0', 'set5', 'set6'];

const pad = (v, w) => String(v).padStart(w);
const padR = (v, w) => String(v).padEnd(w);

for (const tf of testFiles) {
    const raw = fs.readFileSync(tf.path, 'utf-8');
    const spins = raw.trim().split('\n').map(l => parseInt(l.trim())).filter(n => !isNaN(n));

    console.log(`\n${'═'.repeat(120)}`);
    console.log(`  ${tf.name} (${spins.length} spins)`);
    console.log(`${'═'.repeat(120)}`);

    console.log(`\nTrigger      | Table     | Sign      | Set   | #Nums | Bets | Wins | Losses | HitRate | Expected | Profit    | MaxDD   | SessW | SessB | SessI`);
    console.log(`-------------|-----------|-----------|-------|-------|------|------|--------|---------|----------|-----------|---------|-------|-------|------`);

    const results = [];

    for (const trigger of triggers) {
        for (const table of tables) {
            for (const sign of signs) {
                for (const set of sets) {
                    const betNums = getFilteredNumbers(table, sign, set);
                    if (betNums.length === 0) continue;

                    const r = simulate(spins, trigger, betNums);
                    if (!r) continue;

                    results.push({ trigger, table, sign, set, ...r });

                    console.log(
                        `${padR(trigger, 12)} | ${padR(table, 9)} | ${padR(sign, 9)} | ${padR(set, 5)} | ${pad(r.numbersCount, 5)} | ${pad(r.totalBets, 4)} | ${pad(r.wins, 4)} | ${pad(r.losses, 6)} | ${pad(r.hitRate + '%', 7)} | ${pad(r.expectedHitRate + '%', 8)} | $${pad(r.totalProfit, 8)} | $${pad(r.maxDrawdown, 6)} | ${pad(r.sessionWins, 5)} | ${pad(r.sessionBusts, 5)} | ${pad(r.sessionIncomplete, 5)}`
                    );
                }
            }
        }
    }

    // ── TOP 10 by profit ──
    results.sort((a, b) => b.totalProfit - a.totalProfit);
    console.log(`\n── TOP 10 by Profit ──`);
    console.log(`Rank | Trigger      | Table     | Sign      | Set   | #Nums | HitRate | Profit    | MaxDD   | SessW | SessB`);
    console.log(`-----|--------------|-----------|-----------|-------|-------|---------|-----------|---------|-------|------`);
    results.slice(0, 10).forEach((r, i) => {
        console.log(
            `  ${pad(i+1, 2)} | ${padR(r.trigger, 12)} | ${padR(r.table, 9)} | ${padR(r.sign, 9)} | ${padR(r.set, 5)} | ${pad(r.numbersCount, 5)} | ${pad(r.hitRate + '%', 7)} | $${pad(r.totalProfit, 8)} | $${pad(r.maxDrawdown, 6)} | ${pad(r.sessionWins, 5)} | ${pad(r.sessionBusts, 5)}`
        );
    });

    // ── TOP 10 by session wins (no busts) ──
    const noBusts = results.filter(r => r.sessionBusts === 0);
    noBusts.sort((a, b) => b.sessionWins - a.sessionWins);
    console.log(`\n── TOP 10 by Session Wins (0 busts) ──`);
    console.log(`Rank | Trigger      | Table     | Sign      | Set   | #Nums | HitRate | Profit    | MaxDD   | SessW | SessI`);
    console.log(`-----|--------------|-----------|-----------|-------|-------|---------|-----------|---------|-------|------`);
    noBusts.slice(0, 10).forEach((r, i) => {
        console.log(
            `  ${pad(i+1, 2)} | ${padR(r.trigger, 12)} | ${padR(r.table, 9)} | ${padR(r.sign, 9)} | ${padR(r.set, 5)} | ${pad(r.numbersCount, 5)} | ${pad(r.hitRate + '%', 7)} | $${pad(r.totalProfit, 8)} | $${pad(r.maxDrawdown, 6)} | ${pad(r.sessionWins, 5)} | ${pad(r.sessionIncomplete, 5)}`
        );
    });

    // ── BOTTOM 10 (worst) ──
    console.log(`\n── BOTTOM 10 (Worst Profit) ──`);
    console.log(`Rank | Trigger      | Table     | Sign      | Set   | #Nums | HitRate | Profit    | MaxDD   | SessB`);
    console.log(`-----|--------------|-----------|-----------|-------|-------|---------|-----------|---------|------`);
    results.slice(-10).reverse().forEach((r, i) => {
        console.log(
            `  ${pad(i+1, 2)} | ${padR(r.trigger, 12)} | ${padR(r.table, 9)} | ${padR(r.sign, 9)} | ${padR(r.set, 5)} | ${pad(r.numbersCount, 5)} | ${pad(r.hitRate + '%', 7)} | $${pad(r.totalProfit, 8)} | $${pad(r.maxDrawdown, 6)} | ${pad(r.sessionBusts, 5)}`
        );
    });

    // ── Specific combos the user asked about ──
    console.log(`\n── User's Specific Interest: both(0/19), positive(green), All(0,5,6) ──`);
    const userCombos = results.filter(r =>
        r.table === 'both' && r.sign === 'positive' && r.set === 'all'
    );
    if (userCombos.length > 0) {
        userCombos.forEach(r => {
            console.log(`  Trigger=${r.trigger}: ${r.numbersCount} nums, ${r.totalBets} bets, hitRate=${r.hitRate}%, profit=$${r.totalProfit}, maxDD=$${r.maxDrawdown}, sessW=${r.sessionWins}, sessB=${r.sessionBusts}`);
        });
    }

    // Also show specific set combos
    console.log(`\n── User's Interest: both(0/19), positive(green), by set ──`);
    const userSetCombos = results.filter(r =>
        r.table === 'both' && r.sign === 'positive'
    );
    userSetCombos.forEach(r => {
        console.log(`  Trigger=${padR(r.trigger, 8)} Set=${padR(r.set, 5)}: ${pad(r.numbersCount, 2)} nums, ${pad(r.totalBets, 4)} bets, hitRate=${r.hitRate}%, profit=$${pad(r.totalProfit, 7)}, maxDD=$${r.maxDrawdown}, sessW=${r.sessionWins}, sessB=${r.sessionBusts}`);
    });
}
