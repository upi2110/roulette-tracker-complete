/**
 * TESTS: Money Management Panel deep-dive
 *
 * Covers: strategy cycling, bet calculation, chip breakdown,
 * setPrediction logic, checkForNewSpin, recordBetResult,
 * togglePanel, updateFromPrediction, and edge cases.
 *
 * 85+ tests across sections A-J
 */

const { createMoneyPanel, setupDOM } = require('../test-setup');

// ═══════════════════════════════════════════════════════
// A: MoneyManagementPanel — constructor defaults
// ═══════════════════════════════════════════════════════

describe('A: MoneyManagementPanel constructor', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('A1: Starting bankroll is 4000', () => {
        expect(mp.sessionData.startingBankroll).toBe(4000);
    });

    test('A2: Current bankroll is 4000', () => {
        expect(mp.sessionData.currentBankroll).toBe(4000);
    });

    test('A3: Session profit starts at 0', () => {
        expect(mp.sessionData.sessionProfit).toBe(0);
    });

    test('A4: Session target is 100', () => {
        expect(mp.sessionData.sessionTarget).toBe(100);
    });

    test('A5: totalBets starts at 0', () => {
        expect(mp.sessionData.totalBets).toBe(0);
    });

    test('A6: Session not active initially', () => {
        expect(mp.sessionData.isSessionActive).toBe(false);
    });

    test('A7: Betting disabled initially', () => {
        expect(mp.sessionData.isBettingEnabled).toBe(false);
    });

    test('A8: Default strategy is 3 (Cautious)', () => {
        expect(mp.sessionData.bettingStrategy).toBe(3);
    });

    test('A9: Default bet per number is 2', () => {
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('A10: pendingBet starts null', () => {
        expect(mp.pendingBet).toBeNull();
    });

    test('A11: betHistory starts empty', () => {
        expect(mp.betHistory).toEqual([]);
    });

    test('A12: isExpanded starts true', () => {
        expect(mp.isExpanded).toBe(true);
    });

    test('A13: spinsWithBets starts empty', () => {
        expect(mp.sessionData.spinsWithBets).toEqual([]);
    });

    test('A14: consecutiveLosses starts at 0', () => {
        expect(mp.sessionData.consecutiveLosses).toBe(0);
    });

    test('A15: consecutiveWins starts at 0', () => {
        expect(mp.sessionData.consecutiveWins).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// B: Strategy cycling
// ═══════════════════════════════════════════════════════

describe('B: Strategy cycling', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('B1: Default strategy is 3', () => {
        expect(mp.sessionData.bettingStrategy).toBe(3);
    });

    test('B2: Toggle: 3 → 1', () => {
        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(1);
    });

    test('B3: Toggle: 1 → 2', () => {
        mp.sessionData.bettingStrategy = 1;
        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(2);
    });

    test('B4: Toggle: 2 → 3', () => {
        mp.sessionData.bettingStrategy = 2;
        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(3);
    });

    test('B5: Full cycle: 3 → 1 → 2 → 3', () => {
        mp.toggleStrategy(); // 3 → 1
        mp.toggleStrategy(); // 1 → 2
        mp.toggleStrategy(); // 2 → 3
        expect(mp.sessionData.bettingStrategy).toBe(3);
    });

    test('B6: Toggle resets consecutiveWins to 0', () => {
        mp.sessionData.consecutiveWins = 5;
        mp.toggleStrategy();
        expect(mp.sessionData.consecutiveWins).toBe(0);
    });

    test('B7: Toggle resets currentBetPerNumber to 2', () => {
        mp.sessionData.currentBetPerNumber = 10;
        mp.toggleStrategy();
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('B8: Strategy button text updates for strategy 1', () => {
        mp.toggleStrategy(); // → 1
        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn.textContent).toContain('Aggressive');
    });

    test('B9: Strategy button text updates for strategy 2', () => {
        mp.sessionData.bettingStrategy = 1;
        mp.toggleStrategy(); // → 2
        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn.textContent).toContain('Conservative');
    });

    test('B10: Strategy button text updates for strategy 3', () => {
        mp.sessionData.bettingStrategy = 2;
        mp.toggleStrategy(); // → 3
        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn.textContent).toContain('Cautious');
    });
});

// ═══════════════════════════════════════════════════════
// C: calculateBetAmount
// ═══════════════════════════════════════════════════════

describe('C: calculateBetAmount', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('C1: Default returns 2 (currentBetPerNumber)', () => {
        expect(mp.calculateBetAmount(12)).toBe(2);
    });

    test('C2: Returns currentBetPerNumber when bankroll allows', () => {
        mp.sessionData.currentBetPerNumber = 5;
        expect(mp.calculateBetAmount(12)).toBe(5);
    });

    test('C3: Caps at bankroll / (numberCount * 2) when bankroll low', () => {
        mp.sessionData.currentBankroll = 10;
        mp.sessionData.currentBetPerNumber = 5;
        // maxBet = floor(10 / (12 * 2)) = floor(0.416) = 0 → clamped to 1
        expect(mp.calculateBetAmount(12)).toBe(1);
    });

    test('C4: Minimum bet is always 1', () => {
        mp.sessionData.currentBankroll = 0;
        mp.sessionData.currentBetPerNumber = 5;
        expect(mp.calculateBetAmount(12)).toBe(1);
    });

    test('C5: With 1 number and $100 bankroll, allows $50 max', () => {
        mp.sessionData.currentBankroll = 100;
        mp.sessionData.currentBetPerNumber = 50;
        expect(mp.calculateBetAmount(1)).toBe(50);
    });

    test('C6: With high currentBetPerNumber and sufficient bankroll', () => {
        mp.sessionData.currentBankroll = 4000;
        mp.sessionData.currentBetPerNumber = 10;
        expect(mp.calculateBetAmount(12)).toBe(10);
    });
});

// ═══════════════════════════════════════════════════════
// D: calculateChipBreakdown
// ═══════════════════════════════════════════════════════

describe('D: calculateChipBreakdown', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('D1: $0 → empty breakdown', () => {
        expect(mp.calculateChipBreakdown(0)).toEqual([]);
    });

    test('D2: $1 → [1x $1]', () => {
        expect(mp.calculateChipBreakdown(1)).toEqual([{ value: 1, count: 1 }]);
    });

    test('D3: $2 → [1x $2]', () => {
        expect(mp.calculateChipBreakdown(2)).toEqual([{ value: 2, count: 1 }]);
    });

    test('D4: $5 → [1x $5]', () => {
        expect(mp.calculateChipBreakdown(5)).toEqual([{ value: 5, count: 1 }]);
    });

    test('D5: $25 → [1x $25]', () => {
        expect(mp.calculateChipBreakdown(25)).toEqual([{ value: 25, count: 1 }]);
    });

    test('D6: $100 → [1x $100]', () => {
        expect(mp.calculateChipBreakdown(100)).toEqual([{ value: 100, count: 1 }]);
    });

    test('D7: $7 → [1x $5, 1x $2]', () => {
        expect(mp.calculateChipBreakdown(7)).toEqual([
            { value: 5, count: 1 },
            { value: 2, count: 1 }
        ]);
    });

    test('D8: $133 → [1x $100, 1x $25, 1x $5, 1x $2, 1x $1]', () => {
        expect(mp.calculateChipBreakdown(133)).toEqual([
            { value: 100, count: 1 },
            { value: 25, count: 1 },
            { value: 5, count: 1 },
            { value: 2, count: 1 },
            { value: 1, count: 1 }
        ]);
    });

    test('D9: $250 → [2x $100, 2x $25]', () => {
        expect(mp.calculateChipBreakdown(250)).toEqual([
            { value: 100, count: 2 },
            { value: 25, count: 2 }
        ]);
    });

    test('D10: Rounds non-integer amount', () => {
        const result = mp.calculateChipBreakdown(7.6);
        // 7.6 rounds to 8: 1x $5 + 1x $2 + 1x $1
        expect(result).toEqual([
            { value: 5, count: 1 },
            { value: 2, count: 1 },
            { value: 1, count: 1 }
        ]);
    });
});

// ═══════════════════════════════════════════════════════
// E: formatChipBreakdown
// ═══════════════════════════════════════════════════════

describe('E: formatChipBreakdown', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('E1: Empty breakdown → "--"', () => {
        expect(mp.formatChipBreakdown([])).toBe('--');
    });

    test('E2: Single chip', () => {
        expect(mp.formatChipBreakdown([{ value: 5, count: 1 }])).toBe('1x $5');
    });

    test('E3: Multiple chips joined with " + "', () => {
        const result = mp.formatChipBreakdown([
            { value: 5, count: 1 },
            { value: 2, count: 1 }
        ]);
        expect(result).toBe('1x $5 + 1x $2');
    });

    test('E4: Multiple same-value chips', () => {
        const result = mp.formatChipBreakdown([{ value: 100, count: 3 }]);
        expect(result).toBe('3x $100');
    });
});

// ═══════════════════════════════════════════════════════
// F: setPrediction
// ═══════════════════════════════════════════════════════

describe('F: setPrediction', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('F1: null prediction → no pending bet', () => {
        mp.setPrediction(null);
        expect(mp.pendingBet).toBeNull();
    });

    test('F2: Empty numbers → no pending bet', () => {
        mp.setPrediction({ numbers: [] });
        expect(mp.pendingBet).toBeNull();
    });

    test('F3: No numbers property → no pending bet', () => {
        mp.setPrediction({ signal: 'BET NOW' });
        expect(mp.pendingBet).toBeNull();
    });

    test('F4: Valid prediction with betting disabled → no pending bet', () => {
        mp.sessionData.isBettingEnabled = false;
        mp.setPrediction({ numbers: [1, 2, 3], signal: 'BET NOW', confidence: 80 });
        expect(mp.pendingBet).toBeNull();
    });

    test('F5: Valid prediction with betting enabled → pending bet created', () => {
        mp.sessionData.isBettingEnabled = true;
        mp.setPrediction({ numbers: [1, 2, 3], signal: 'BET NOW', confidence: 80 });
        expect(mp.pendingBet).not.toBeNull();
        expect(mp.pendingBet.numbersCount).toBe(3);
        expect(mp.pendingBet.predictedNumbers).toEqual([1, 2, 3]);
    });

    test('F6: setPrediction starts session if not active', () => {
        mp.sessionData.isBettingEnabled = true;
        expect(mp.sessionData.isSessionActive).toBe(false);
        mp.setPrediction({ numbers: [5, 10], signal: 'BET' });
        expect(mp.sessionData.isSessionActive).toBe(true);
    });

    test('F7: setPrediction updates lastBetAmount', () => {
        mp.sessionData.isBettingEnabled = true;
        mp.setPrediction({ numbers: [1, 2, 3, 4, 5] });
        expect(mp.sessionData.lastBetAmount).toBe(2); // default bet per number
    });

    test('F8: setPrediction updates lastBetNumbers', () => {
        mp.setPrediction({ numbers: [1, 2, 3, 4, 5, 6, 7] });
        expect(mp.sessionData.lastBetNumbers).toBe(7);
    });

    test('F9: Auto engine SKIP → pendingBet cleared', () => {
        mp.sessionData.isBettingEnabled = true;
        // Simulate auto engine that decided SKIP (lastDecision = null)
        window.aiAutoEngine = { isEnabled: true, lastDecision: null };
        mp.setPrediction({ numbers: [1, 2, 3] });
        expect(mp.pendingBet).toBeNull();
        delete window.aiAutoEngine;
    });

    test('F10: Auto engine BET → pendingBet created', () => {
        mp.sessionData.isBettingEnabled = true;
        window.aiAutoEngine = { isEnabled: true, lastDecision: { numbers: [1, 2] } };
        mp.setPrediction({ numbers: [1, 2, 3] });
        expect(mp.pendingBet).not.toBeNull();
        delete window.aiAutoEngine;
    });
});

// ═══════════════════════════════════════════════════════
// G: toggleBetting
// ═══════════════════════════════════════════════════════

describe('G: toggleBetting', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('G1: Toggle from disabled → enabled', () => {
        mp.sessionData.isBettingEnabled = false;
        mp.toggleBetting();
        expect(mp.sessionData.isBettingEnabled).toBe(true);
    });

    test('G2: Toggle from enabled → disabled', () => {
        mp.sessionData.isBettingEnabled = true;
        mp.toggleBetting();
        expect(mp.sessionData.isBettingEnabled).toBe(false);
    });

    test('G3: Disabling clears pendingBet', () => {
        mp.sessionData.isBettingEnabled = true;
        mp.pendingBet = { betAmount: 5, numbersCount: 12 };
        mp.toggleBetting();
        expect(mp.pendingBet).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// H: togglePanel
// ═══════════════════════════════════════════════════════

describe('H: togglePanel', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('H1: Starts expanded', () => {
        expect(mp.isExpanded).toBe(true);
    });

    test('H2: Toggle collapses', () => {
        mp.togglePanel();
        expect(mp.isExpanded).toBe(false);
    });

    test('H3: Double toggle → back to expanded', () => {
        mp.togglePanel();
        mp.togglePanel();
        expect(mp.isExpanded).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// I: recordBetResult
// ═══════════════════════════════════════════════════════

describe('I: recordBetResult', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
        mp.sessionData.isSessionActive = true;
        window.spins = [{ actual: 5 }];
    });

    afterEach(() => {
        delete window.spins;
    });

    test('I1: Win increments totalWins', async () => {
        await mp.recordBetResult(2, 12, true, 5);
        expect(mp.sessionData.totalWins).toBe(1);
    });

    test('I2: Loss increments totalLosses', async () => {
        await mp.recordBetResult(2, 12, false, 99);
        expect(mp.sessionData.totalLosses).toBe(1);
    });

    test('I3: Win: payout = bet * 35 - totalBet', async () => {
        const betPer = 2;
        const numCount = 12;
        const initialBankroll = mp.sessionData.currentBankroll;
        await mp.recordBetResult(betPer, numCount, true, 5);
        const expectedNet = betPer * 35 - betPer * numCount; // 70 - 24 = 46
        expect(mp.sessionData.currentBankroll).toBe(initialBankroll + expectedNet);
    });

    test('I4: Loss: bankroll decreases by totalBet', async () => {
        const betPer = 2;
        const numCount = 12;
        const initialBankroll = mp.sessionData.currentBankroll;
        await mp.recordBetResult(betPer, numCount, false, 99);
        expect(mp.sessionData.currentBankroll).toBe(initialBankroll - betPer * numCount);
    });

    test('I5: totalBets increments', async () => {
        await mp.recordBetResult(2, 12, true, 5);
        expect(mp.sessionData.totalBets).toBe(1);
    });

    test('I6: Loss increments consecutiveLosses', async () => {
        await mp.recordBetResult(2, 12, false, 99);
        expect(mp.sessionData.consecutiveLosses).toBe(1);
    });

    test('I7: Win resets consecutiveLosses to 0', async () => {
        mp.sessionData.consecutiveLosses = 5;
        await mp.recordBetResult(2, 12, true, 5);
        expect(mp.sessionData.consecutiveLosses).toBe(0);
    });

    test('I8: betHistory grows with each result', async () => {
        await mp.recordBetResult(2, 12, true, 5);
        await mp.recordBetResult(2, 12, false, 10);
        expect(mp.betHistory).toHaveLength(2);
    });

    test('I9: betHistory newest entry is first', async () => {
        await mp.recordBetResult(2, 12, true, 5);
        await mp.recordBetResult(2, 12, false, 10);
        expect(mp.betHistory[0].hit).toBe(false); // most recent
        expect(mp.betHistory[1].hit).toBe(true); // older
    });

    test('I10: Tracks spinsWithBets', async () => {
        await mp.recordBetResult(2, 12, true, 5);
        expect(mp.sessionData.spinsWithBets).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════════
// J: updateFromPrediction and edge cases
// ═══════════════════════════════════════════════════════

describe('J: updateFromPrediction and edge cases', () => {
    let mp;

    beforeEach(() => {
        mp = createMoneyPanel();
    });

    test('J1: null prediction → resets lastBetAmount to 0', () => {
        mp.sessionData.lastBetAmount = 5;
        mp.updateFromPrediction(null);
        expect(mp.sessionData.lastBetAmount).toBe(0);
    });

    test('J2: null prediction → clears pendingBet', () => {
        mp.pendingBet = { betAmount: 5 };
        mp.updateFromPrediction(null);
        expect(mp.pendingBet).toBeNull();
    });

    test('J3: Prediction without bet_per_number → resets', () => {
        mp.updateFromPrediction({ signal: 'WAIT' });
        expect(mp.sessionData.lastBetAmount).toBe(0);
    });

    test('J4: Valid prediction with bet_per_number → uses strategy bet', () => {
        mp.sessionData.currentBetPerNumber = 3;
        mp.updateFromPrediction({ bet_per_number: 5, numbers: [1, 2, 3] });
        expect(mp.sessionData.lastBetAmount).toBe(3); // uses strategy, not backend value
    });

    test('J5: Valid prediction with betting enabled → creates pendingBet', () => {
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = true;
        mp.updateFromPrediction({ bet_per_number: 5, numbers: [1, 2, 3] });
        expect(mp.pendingBet).not.toBeNull();
        expect(mp.pendingBet.predictedNumbers).toEqual([1, 2, 3]);
    });

    test('J6: Valid prediction with betting disabled → no pendingBet', () => {
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = false;
        mp.updateFromPrediction({ bet_per_number: 5, numbers: [1, 2] });
        expect(mp.pendingBet).toBeNull();
    });

    test('J7: checkForNewSpin does nothing when session not active', () => {
        mp.sessionData.isSessionActive = false;
        mp.pendingBet = { betAmount: 2, numbersCount: 12, predictedNumbers: [1] };
        window.spins = [{ actual: 5 }, { actual: 10 }];
        mp.lastSpinCount = 1;
        mp.checkForNewSpin();
        // pendingBet should remain (checkForNewSpin exited early)
        expect(mp.pendingBet).not.toBeNull();
        delete window.spins;
    });

    test('J8: autoStartSession is disabled (delegated to orchestrator)', () => {
        // Should not throw, just log
        expect(() => mp.autoStartSession()).not.toThrow();
    });

    test('J9: checkForNewSpin resolves pending bet on hit', () => {
        mp.sessionData.isSessionActive = true;
        mp.pendingBet = { betAmount: 2, numbersCount: 3, predictedNumbers: [5, 10, 15] };
        window.spins = [{ actual: 1 }, { actual: 5 }];
        mp.lastSpinCount = 1;
        mp.checkForNewSpin();
        // After checking: pendingBet should be cleared, bet resolved
        expect(mp.pendingBet).toBeNull();
        expect(mp.sessionData.totalBets).toBe(1);
        expect(mp.sessionData.totalWins).toBe(1);
        delete window.spins;
    });

    test('J10: checkForNewSpin resolves pending bet on miss', () => {
        mp.sessionData.isSessionActive = true;
        mp.pendingBet = { betAmount: 2, numbersCount: 3, predictedNumbers: [5, 10, 15] };
        window.spins = [{ actual: 1 }, { actual: 20 }]; // 20 not in predicted
        mp.lastSpinCount = 1;
        mp.checkForNewSpin();
        expect(mp.pendingBet).toBeNull();
        expect(mp.sessionData.totalBets).toBe(1);
        expect(mp.sessionData.totalLosses).toBe(1);
        delete window.spins;
    });
});
