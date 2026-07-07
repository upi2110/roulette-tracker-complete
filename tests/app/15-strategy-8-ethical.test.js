/**
 * TESTS: Money Management — Strategy 8 (Ethical)
 *
 * Verifies the 6 rules laid out in the user spec (2026-07-04):
 *   1. Min bet is always $2.
 *   2. Session target is $100 (soft-max $125).
 *   3. +$1 after 3 cumulative loss-units.
 *   4. -$2 after 2 consecutive wins (floor $2).
 *   5. Smart cap so a projected win never overshoots $100 (floor $2).
 *   6. Loss unit = min(N, 12)/12 — each miss adds a fractional slice,
 *      so partial-coverage bets contribute proportionally.
 */

const { setupDOM } = require('../test-setup');

let MoneyManagementPanel;

beforeAll(() => {
    setupDOM();
    global.window = global.window || {};
    global.window.spins = [];
    global.window.spinData = [];
    global.window.aiPanel = null;
    global.window.moneyPanel = null;

    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'money-management-panel.js'),
        'utf-8'
    );
    const wrapped = `(function() {
        const alert = () => {};
        const setInterval = () => {};
        const setTimeout = (fn, ms) => { if (ms <= 200) fn(); };
        ${src}
        return MoneyManagementPanel;
    })()`;
    MoneyManagementPanel = eval(wrapped);
});

beforeEach(() => {
    setupDOM();
    global.window.spins = [];
    global.window.spinData = [];
});

function newPanel() {
    const mp = new MoneyManagementPanel();
    mp.setupSpinListener = () => {};
    return mp;
}

function forceS8(mp) {
    mp.sessionData.bettingStrategy = 8;
    mp.sessionData.currentBetPerNumber = 2;
    mp.sessionData.consecutiveWins = 0;
    mp.sessionData.consecutiveLosses = 0;
    mp.sessionData.s8LossUnits = 0;
    mp.sessionData.sessionProfit = 0;
    mp.sessionData.isSessionActive = true;
    // Suppress bankroll math + history noise — we only care about
    // the S8 base-bet mutation in recordBetResult here.
    mp._updateDrawdown = () => {};
    mp.render = () => {};
    mp.saveToBackend = async () => {};
    mp._maybeSyncBackendSession = async () => {};
}

// Directly invoke recordBetResult — it handles consec-win/loss
// increments internally (line ~1478-1492 in the source).
async function tick(mp, hit, numbersCount = 12) {
    await mp.recordBetResult(mp.sessionData.currentBetPerNumber, numbersCount, hit, 0, []);
}

// ═══════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════
describe('S8 defaults', () => {
    test('S8 is the default strategy', () => {
        const mp = newPanel();
        expect(mp.sessionData.bettingStrategy).toBe(8);
    });
    test('S8 min bet = $2', () => {
        const mp = newPanel();
        expect(mp.sessionData.s8MinBet).toBe(2);
        expect(mp.sessionData.s8StartingBet).toBe(2);
    });
    test('S8 loss trigger = 3 units, +$1', () => {
        const mp = newPanel();
        expect(mp.sessionData.s8LossesToIncrease).toBe(3);
        expect(mp.sessionData.s8LossIncrement).toBe(1);
    });
    test('S8 win trigger = 2 wins, -$2', () => {
        const mp = newPanel();
        expect(mp.sessionData.s8WinsToDecrease).toBe(2);
        expect(mp.sessionData.s8WinDecrement).toBe(2);
    });
    test('S8 target = $100, soft-max = $125, refN = 12', () => {
        const mp = newPanel();
        expect(mp.sessionData.s8SessionTarget).toBe(100);
        expect(mp.sessionData.s8SessionSoftMax).toBe(125);
        expect(mp.sessionData.s8ReferenceN).toBe(12);
    });
});

// ═══════════════════════════════════════════════════════
// Rule 6 — fractional loss accumulation
// ═══════════════════════════════════════════════════════
describe('S8 rule 6 — fractional loss units', () => {
    test('12-number miss = 1 full unit', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 12);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(1, 5);
    });
    test('6-number miss = 0.5 units', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 6);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(0.5, 5);
    });
    test('4-number miss = 1/3 units', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 4);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(4 / 12, 5);
    });
    test('Miss with N > refN adds N/refN units (no cap)', async () => {
        // 2026-07-07 spec: no per-miss cap; a 24-num miss adds 24/12 = 2.0 units.
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 24);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(2, 5);
    });
    test('3 × 12-number misses = 3 units → triggers +$1, resets units', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 12);
        await tick(mp, false, 12);
        await tick(mp, false, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });
    test('Mixed 6-6-6-6-6-6 misses = 3 units (6 rounds of 6) → +$1', async () => {
        const mp = newPanel(); forceS8(mp);
        for (let i = 0; i < 6; i++) await tick(mp, false, 6);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });
    test('Two 6-number misses = 1 unit, NO escalation yet', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 6);
        await tick(mp, false, 6);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(1, 5);
    });
});

// ═══════════════════════════════════════════════════════
// Rule 4 — win-side de-escalation
// ═══════════════════════════════════════════════════════
describe('S8 rule 4 — consecutive wins', () => {
    test('1 win alone does NOT decrease bet', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        await tick(mp, true, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(5);
    });
    test('2 consecutive wins → -$2', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        await tick(mp, true, 12);
        await tick(mp, true, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });
    test('De-escalation floored at $2 (rule 1)', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 3;
        await tick(mp, true, 12);
        await tick(mp, true, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('De-escalation resets loss-units too', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.s8LossUnits = 2.5;
        await tick(mp, true, 12);
        await tick(mp, true, 12);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });
    test('Loss breaks the win streak', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        await tick(mp, true, 12);
        await tick(mp, false, 6);
        await tick(mp, true, 12);
        // Only 1 consecutive win after the loss break; no de-escalation.
        expect(mp.sessionData.currentBetPerNumber).toBe(5);
    });
    test('Isolated wins do NOT reset loss units (matches spec)', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 12);      // +1.0
        await tick(mp, false, 12);      // +1.0 → 2.0 total
        await tick(mp, true, 12);       // no reset (only 1 win)
        await tick(mp, false, 12);      // +1.0 → 3.0 total → triggers
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// Rule 5 — smart-cap to protect target
// ═══════════════════════════════════════════════════════
describe('S8 rule 5 — smart cap', () => {
    test('At $0 profit + $2 bet + 12 numbers → returns $2 (24 net; well under target)', () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 2;
        expect(mp._s8BetPerNumber(12)).toBe(2);
    });
    test('At $90 profit + $2 base + 12 numbers (net 24 > 10 remaining) → shrinks to $2 min', () => {
        // remaining=10; 12-num win at $2 nets 24. safeBet = floor(10/24) = 0
        // → clamped to minBet ($2).
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 2;
        mp.sessionData.sessionProfit = 90;
        expect(mp._s8BetPerNumber(12)).toBe(2);
    });
    test('At $50 profit + $5 base + 6 numbers (net = 150 > remaining 50) → floor(50/30) = $1 → clamped $2', () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.sessionProfit = 50;
        expect(mp._s8BetPerNumber(6)).toBe(2);
    });
    test('At $70 profit + $3 base + 12 numbers (net = 72 > remaining 30) → floor(30/24) = $1 → clamped $2', () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 3;
        mp.sessionData.sessionProfit = 70;
        expect(mp._s8BetPerNumber(12)).toBe(2);
    });
    test('At/past target ($100 profit) → holds at min $2', () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.sessionProfit = 100;
        expect(mp._s8BetPerNumber(12)).toBe(2);
    });
    test('Past target ($110 profit) → still holds at min $2', () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.sessionProfit = 110;
        expect(mp._s8BetPerNumber(12)).toBe(2);
    });
    test('Room to run — no cap fires when net-per-win < remaining', () => {
        // $2 base × (36−12) = 24; remaining = 100 − 20 = 80. 24 < 80,
        // no smart cap, returns baseBet.
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 2;
        mp.sessionData.sessionProfit = 20;
        expect(mp._s8BetPerNumber(12)).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════
// Toggle behaviour
// ═══════════════════════════════════════════════════════
describe('S8 switching', () => {
    test('Switching TO S8 resets accumulator + bet to starting', () => {
        const mp = newPanel();
        mp.sessionData.currentBetPerNumber = 7;
        mp.sessionData.s8LossUnits = 2.5;
        // First cycle out of the default S8 …
        mp.toggleStrategy(); // 8 → 1
        expect(mp.sessionData.bettingStrategy).toBe(1);
        // …then cycle 7 more times back to 8.
        for (let i = 0; i < 7; i++) mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(8);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });

    test('S8 → S1 → S8 mid-session re-entry re-anchors bet + accumulator', async () => {
        // Build up some S8 state then leave the strategy and come back.
        // Re-entry must start fresh — no stale loss-units carrying over
        // from the previous S8 pass.
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 12);
        await tick(mp, false, 12);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(2, 5);
        // Cycle away…
        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(1);
        // …and 7 more clicks back to S8.
        for (let i = 0; i < 7; i++) mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(8);
        expect(mp.sessionData.s8LossUnits).toBe(0);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('saveAdjustStake resets s8LossUnits + tier (agent CRITICAL finding)', () => {
        // Manual stake adjust must also re-anchor the S8 accumulator so
        // the user's next miss is counted against the NEW base + Tier 1.
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.s8LossUnits = 2.5;
        mp.sessionData.s8Tier      = 2;
        document.body.innerHTML =
            '<input id="adjustStakeIn" value="5">' +
            '<div id="adjustStakeStatus"></div>' +
            '<div id="adjustStakeCurrent"></div>';
        mp.saveAdjustStake();
        expect(mp.sessionData.currentBetPerNumber).toBe(5);
        expect(mp.sessionData.s8LossUnits).toBe(0);
        expect(mp.sessionData.s8Tier).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════
// Tier ladder (2026-07-04 spec extension)
// ═══════════════════════════════════════════════════════
describe('S8 single-threshold rule (2026-07-07 spec, ceiling)', () => {
    // Simplified spec:
    //   - Single refN=12. Each miss adds N/12 units.
    //   - Escalation fires when ceil(accumulated units) ≥ 3 → +$1.
    //   - 2 consecutive wins → −$2.
    //   - No tier ladder; s8Tier stays 1.
    test('N=24 miss adds 2.0 units (2 × 12)', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 24);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(2, 5);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);   // no trigger
    });
    test('N=21 + N=25: ceil(1.75 + 2.083) = ceil(3.833) = 4 ≥ 3 → +$1', async () => {
        // Matches the second screenshot exactly.
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 21);
        await tick(mp, false, 25);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });
    test('N=24 loss: ceil(2)=2 < 3 → no escalation', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 24);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('Two N=24 losses: ceil(4)=4 ≥ 3 → +$1', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 24);
        await tick(mp, false, 24);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });
    test('N=25 loss: ceil(2.083)=3 ≥ 3 → +$1 on single miss', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 25);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });
    test('N=13 loss: ceil(13/12)=ceil(1.083)=2 → no trigger', async () => {
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 13);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(13 / 12, 5);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('2 consecutive wins at any N → −$2 (floored $2)', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.currentBetPerNumber = 6;
        await tick(mp, true, 25);
        expect(mp.sessionData.currentBetPerNumber).toBe(6);   // 1 win only
        await tick(mp, true, 25);
        expect(mp.sessionData.currentBetPerNumber).toBe(4);   // −$2
    });
    test('Pre-bet escalation: units already crossed before next placement', async () => {
        // From first screenshot: 21+25+16+12 losses accumulate
        // 21/12+25/12+16/12+12/12 = (21+25+16+12)/12 = 74/12 ≈ 6.17 units.
        // Actually the second screenshot showed only 21+25 = ceil(3.83)=4 → +$1
        // fires during recordBetResult. But suppose ceiling isn't hit during
        // recordBetResult (e.g. an interleaved win reset). Pre-bet must still
        // catch a threshold-crossed accumulator.
        const mp = newPanel(); forceS8(mp);
        // Set units manually just below threshold from an earlier miss run,
        // then advance directly via calculateBetAmount.
        mp.sessionData.s8LossUnits = 2.5;
        const bet = mp.calculateBetAmount(12);
        // ceil(2.5) = 3 ≥ 3 → pre-bet escalates.
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
        expect(bet).toBe(3);
        expect(mp.sessionData.s8LossUnits).toBe(0);
    });
    test('Pre-bet does NOT fire when ceil(units) < threshold', async () => {
        const mp = newPanel(); forceS8(mp);
        mp.sessionData.s8LossUnits = 1.9;   // ceil = 2 < 3
        const bet = mp.calculateBetAmount(12);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
        expect(bet).toBe(2);
        expect(mp.sessionData.s8LossUnits).toBeCloseTo(1.9, 5);
    });
    test('Threshold rule is invariant to N (24 or 12 or 6 all use refN=12)', async () => {
        // 36 total numbers of misses, split any way, should reach 3 units.
        const mp = newPanel(); forceS8(mp);
        await tick(mp, false, 6);
        await tick(mp, false, 6);
        await tick(mp, false, 24);   // total 36/12 = 3 → +$1
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });
});

