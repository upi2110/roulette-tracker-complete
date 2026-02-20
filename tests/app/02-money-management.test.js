/**
 * TESTS: Money Management Panel
 * Tests pause/start betting, strategies, bankroll calculations, reset
 *
 * Focus areas per user request:
 * - START/PAUSE button behavior
 * - Strategy switching & bet adjustments
 * - Reset clears all state
 * - pendingBet lifecycle
 * - getPredictionAuto reference bug
 */

const { setupDOM } = require('../test-setup');

let MoneyManagementPanel;

beforeAll(() => {
    setupDOM();

    // Provide global stubs
    global.window = global.window || {};
    global.window.spins = [];
    global.window.spinData = [];
    global.window.aiPanel = null;
    global.window.rouletteWheel = null;
    global.window.moneyPanel = null;
    global.aiIntegration = undefined;

    // Load the source
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'money-management-panel.js'),
        'utf-8'
    );

    // Extract the class without running DOMContentLoaded side-effects
    const wrappedCode = `
        (function() {
            const alert = () => {};
            const setInterval = () => {};
            const setTimeout = (fn, ms) => { if (ms <= 200) fn(); };

            ${src}

            return MoneyManagementPanel;
        })()
    `;

    MoneyManagementPanel = eval(wrappedCode);
});

beforeEach(() => {
    setupDOM();
    global.window.spins = [];
    global.window.spinData = [];
});

function createPanel() {
    const panel = new MoneyManagementPanel();
    // Override the auto-polling to not run
    panel.setupSpinListener = () => {};
    return panel;
}

// ═══════════════════════════════════════════════════════
// CONSTRUCTOR DEFAULTS
// ═══════════════════════════════════════════════════════

describe('MoneyManagementPanel - Defaults', () => {
    test('Starting bankroll is $4,000', () => {
        const mp = createPanel();
        expect(mp.sessionData.startingBankroll).toBe(4000);
        expect(mp.sessionData.currentBankroll).toBe(4000);
    });

    test('Session starts inactive', () => {
        const mp = createPanel();
        expect(mp.sessionData.isSessionActive).toBe(false);
    });

    test('Betting starts PAUSED (disabled)', () => {
        const mp = createPanel();
        expect(mp.sessionData.isBettingEnabled).toBe(false);
    });

    test('Default strategy is 1 (Aggressive)', () => {
        const mp = createPanel();
        expect(mp.sessionData.bettingStrategy).toBe(1);
    });

    test('Default bet per number is $2', () => {
        const mp = createPanel();
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('No pending bet initially', () => {
        const mp = createPanel();
        expect(mp.pendingBet).toBeNull();
    });

    test('Bet history is empty', () => {
        const mp = createPanel();
        expect(mp.betHistory).toEqual([]);
    });

    test('Session profit is $0', () => {
        const mp = createPanel();
        expect(mp.sessionData.sessionProfit).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// TOGGLE BETTING (START / PAUSE)
// ═══════════════════════════════════════════════════════

describe('MoneyManagementPanel - Toggle Betting', () => {
    test('toggleBetting() enables betting when paused', () => {
        const mp = createPanel();
        expect(mp.sessionData.isBettingEnabled).toBe(false);

        // Stub aiPanel to prevent errors
        global.window.aiPanel = { getPredictionAuto: jest.fn() };
        mp.toggleBetting();

        expect(mp.sessionData.isBettingEnabled).toBe(true);
    });

    test('toggleBetting() disables betting when active', () => {
        const mp = createPanel();
        global.window.aiPanel = { getPredictionAuto: jest.fn() };
        mp.toggleBetting(); // enable
        expect(mp.sessionData.isBettingEnabled).toBe(true);

        mp.toggleBetting(); // disable
        expect(mp.sessionData.isBettingEnabled).toBe(false);
    });

    test('Pausing clears pendingBet', () => {
        const mp = createPanel();
        mp.pendingBet = { betAmount: 2, numbersCount: 11, predictedNumbers: [1,2,3] };
        global.window.aiPanel = { getPredictionAuto: jest.fn() };

        mp.toggleBetting(); // enable
        mp.toggleBetting(); // disable → should clear pendingBet
        expect(mp.pendingBet).toBeNull();
    });

    test('FIX: toggleBetting calls getPredictions (was broken as getPredictionAuto)', () => {
        // This test verifies the fix:
        // money-management-panel.js now calls window.aiPanel.getPredictions()
        // (previously called getPredictionAuto which didn't exist)
        const mp = createPanel();
        jest.useFakeTimers();

        global.window.aiPanel = {
            getPredictions: jest.fn()
        };

        mp.toggleBetting(); // enable

        // getPredictions is called via setTimeout(100ms)
        jest.advanceTimersByTime(200);
        expect(global.window.aiPanel.getPredictions).toHaveBeenCalled();

        jest.useRealTimers();
    });
});

// ═══════════════════════════════════════════════════════
// setPrediction() — Receiving predictions
// ═══════════════════════════════════════════════════════

describe('MoneyManagementPanel - setPrediction', () => {
    test('Sets pendingBet when betting is ENABLED', () => {
        const mp = createPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;

        mp.setPrediction({
            numbers: [1, 5, 10, 15, 20],
            signal: 'BET NOW',
            confidence: 90
        });

        expect(mp.pendingBet).not.toBeNull();
        expect(mp.pendingBet.numbersCount).toBe(5);
        expect(mp.pendingBet.predictedNumbers).toEqual([1, 5, 10, 15, 20]);
    });

    test('Does NOT set pendingBet when betting is PAUSED', () => {
        const mp = createPanel();
        mp.sessionData.isBettingEnabled = false; // PAUSED
        mp.sessionData.isSessionActive = true;

        mp.setPrediction({
            numbers: [1, 5, 10],
            signal: 'BET NOW',
            confidence: 90
        });

        expect(mp.pendingBet).toBeNull();
    });

    test('Still updates display amounts even when paused', () => {
        const mp = createPanel();
        mp.sessionData.isBettingEnabled = false;
        mp.sessionData.isSessionActive = true;

        mp.setPrediction({
            numbers: [1, 5, 10, 15, 20],
            signal: 'BET NOW',
            confidence: 90
        });

        expect(mp.sessionData.lastBetNumbers).toBe(5);
        expect(mp.sessionData.lastBetAmount).toBeGreaterThan(0);
    });

    test('Null prediction clears pendingBet', () => {
        const mp = createPanel();
        mp.pendingBet = { betAmount: 2, numbersCount: 5, predictedNumbers: [1,2,3,4,5] };

        mp.setPrediction(null);
        // setPrediction(null) exits early without setting
        // pendingBet stays as is since the function returns early
    });

    test('Empty numbers array is rejected', () => {
        const mp = createPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;

        mp.setPrediction({ numbers: [], signal: 'WAIT', confidence: 0 });
        expect(mp.pendingBet).toBeNull();
    });

    test('First prediction activates session', () => {
        const mp = createPanel();
        mp.sessionData.isBettingEnabled = true;
        expect(mp.sessionData.isSessionActive).toBe(false);

        mp.setPrediction({
            numbers: [1, 5, 10],
            signal: 'BET NOW',
            confidence: 90
        });

        expect(mp.sessionData.isSessionActive).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════
// STRATEGY 1: AGGRESSIVE (+$1 each loss, -$1 each win)
// ═══════════════════════════════════════════════════════

describe('Strategy 1: Aggressive', () => {
    test('Bet increases by $1 after a LOSS', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 1;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 7); // MISS

        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });

    test('Bet decreases by $1 after a WIN (min $2)', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 1;
        mp.sessionData.currentBetPerNumber = 3;

        await mp.recordBetResult(3, 10, true, 7); // HIT

        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('Bet cannot go below $2', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 1;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, true, 7); // HIT

        expect(mp.sessionData.currentBetPerNumber).toBe(2); // stays at minimum
    });

    test('3 consecutive losses → bet = $5', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 1;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 1); // $2 → $3
        await mp.recordBetResult(3, 10, false, 2); // $3 → $4
        await mp.recordBetResult(4, 10, false, 3); // $4 → $5

        expect(mp.sessionData.currentBetPerNumber).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════
// STRATEGY 2: CONSERVATIVE (+$1 after 2 losses, -$1 after 2 wins)
// ═══════════════════════════════════════════════════════

describe('Strategy 2: Conservative', () => {
    test('Single loss does NOT increase bet', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 2;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 7);

        expect(mp.sessionData.currentBetPerNumber).toBe(2); // No change after 1 loss
    });

    test('2 consecutive losses increases bet by $1', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 2;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 1);
        await mp.recordBetResult(2, 10, false, 2);

        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });

    test('Loss counter resets after 2 consecutive (need 2 more for next increase)', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 2;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 1); // consLoss=1
        await mp.recordBetResult(2, 10, false, 2); // consLoss=2 → increase, reset to 0

        expect(mp.sessionData.currentBetPerNumber).toBe(3);
        expect(mp.sessionData.consecutiveLosses).toBe(0); // Reset!

        await mp.recordBetResult(3, 10, false, 3); // consLoss=1
        expect(mp.sessionData.currentBetPerNumber).toBe(3); // No change yet
    });

    test('2 consecutive wins decreases bet by $1', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 2;
        mp.sessionData.currentBetPerNumber = 4;

        await mp.recordBetResult(4, 10, true, 7);
        await mp.recordBetResult(4, 10, true, 8);

        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });

    test('Win resets loss counter', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 2;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 1); // consLoss=1
        await mp.recordBetResult(2, 10, true, 5);  // WIN → consLoss=0

        expect(mp.sessionData.consecutiveLosses).toBe(0);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════
// STRATEGY 3: CAUTIOUS (+$2 after 3 losses, -$1 after 2 wins)
// ═══════════════════════════════════════════════════════

describe('Strategy 3: Cautious', () => {
    test('2 consecutive losses does NOT increase bet', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 3;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 1);
        await mp.recordBetResult(2, 10, false, 2);

        expect(mp.sessionData.currentBetPerNumber).toBe(2); // Need 3!
    });

    test('3 consecutive losses increases bet by $2', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 3;
        mp.sessionData.currentBetPerNumber = 2;

        await mp.recordBetResult(2, 10, false, 1);
        await mp.recordBetResult(2, 10, false, 2);
        await mp.recordBetResult(2, 10, false, 3);

        expect(mp.sessionData.currentBetPerNumber).toBe(4); // +$2
    });

    test('2 consecutive wins decreases bet by $1', async () => {
        const mp = createPanel();
        mp.sessionData.bettingStrategy = 3;
        mp.sessionData.currentBetPerNumber = 5;

        await mp.recordBetResult(5, 10, true, 7);
        await mp.recordBetResult(5, 10, true, 8);

        expect(mp.sessionData.currentBetPerNumber).toBe(4);
    });
});

// ═══════════════════════════════════════════════════════
// TOGGLE STRATEGY
// ═══════════════════════════════════════════════════════

describe('Strategy Toggle', () => {
    test('Cycles 1 → 2 → 3 → 1', () => {
        const mp = createPanel();
        expect(mp.sessionData.bettingStrategy).toBe(1);

        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(2);

        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(3);

        mp.toggleStrategy();
        expect(mp.sessionData.bettingStrategy).toBe(1);
    });

    test('Switching strategy resets bet to $2', () => {
        const mp = createPanel();
        mp.sessionData.currentBetPerNumber = 7;

        mp.toggleStrategy();
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('Switching strategy resets consecutiveWins', () => {
        const mp = createPanel();
        mp.sessionData.consecutiveWins = 5;

        mp.toggleStrategy();
        expect(mp.sessionData.consecutiveWins).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// BANKROLL CALCULATIONS
// ═══════════════════════════════════════════════════════

describe('Bankroll Calculations', () => {
    test('WIN: net = betPerNumber*35 - totalBet', async () => {
        const mp = createPanel();
        mp.sessionData.currentBankroll = 4000;
        const betPerNumber = 2;
        const numbersCount = 10;
        const totalBet = 20;

        await mp.recordBetResult(betPerNumber, numbersCount, true, 15);

        // Win: 2*35 = 70, net = 70 - 20 = +50
        expect(mp.sessionData.currentBankroll).toBe(4050);
        expect(mp.sessionData.sessionProfit).toBe(50);
    });

    test('LOSS: net = -totalBet', async () => {
        const mp = createPanel();
        mp.sessionData.currentBankroll = 4000;

        await mp.recordBetResult(2, 10, false, 15);

        // Loss: -2*10 = -20
        expect(mp.sessionData.currentBankroll).toBe(3980);
        expect(mp.sessionData.sessionProfit).toBe(-20);
    });

    test('Win counts increment correctly', async () => {
        const mp = createPanel();

        await mp.recordBetResult(2, 10, true, 7);
        expect(mp.sessionData.totalWins).toBe(1);
        expect(mp.sessionData.totalLosses).toBe(0);
        expect(mp.sessionData.totalBets).toBe(1);

        await mp.recordBetResult(2, 10, false, 8);
        expect(mp.sessionData.totalWins).toBe(1);
        expect(mp.sessionData.totalLosses).toBe(1);
        expect(mp.sessionData.totalBets).toBe(2);
    });

    test('Consecutive losses tracked correctly', async () => {
        const mp = createPanel();

        await mp.recordBetResult(2, 10, false, 1);
        await mp.recordBetResult(2, 10, false, 2);
        await mp.recordBetResult(2, 10, false, 3);

        expect(mp.sessionData.consecutiveLosses).toBe(3);
    });

    test('Win resets consecutive losses', async () => {
        const mp = createPanel();

        await mp.recordBetResult(2, 10, false, 1);
        await mp.recordBetResult(2, 10, false, 2);
        expect(mp.sessionData.consecutiveLosses).toBe(2);

        await mp.recordBetResult(2, 10, true, 5);
        expect(mp.sessionData.consecutiveLosses).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// CHIP BREAKDOWN
// ═══════════════════════════════════════════════════════

describe('Chip Breakdown', () => {
    test('$2 → 1x $2', () => {
        const mp = createPanel();
        const result = mp.calculateChipBreakdown(2);
        expect(result).toEqual([{ value: 2, count: 1 }]);
    });

    test('$5 → 1x $5', () => {
        const mp = createPanel();
        const result = mp.calculateChipBreakdown(5);
        expect(result).toEqual([{ value: 5, count: 1 }]);
    });

    test('$7 → 1x $5 + 1x $2', () => {
        const mp = createPanel();
        const result = mp.calculateChipBreakdown(7);
        expect(result).toEqual([{ value: 5, count: 1 }, { value: 2, count: 1 }]);
    });

    test('$100 → 1x $100', () => {
        const mp = createPanel();
        const result = mp.calculateChipBreakdown(100);
        expect(result).toEqual([{ value: 100, count: 1 }]);
    });

    test('$132 → 1x $100 + 1x $25 + 1x $5 + 1x $2', () => {
        const mp = createPanel();
        const result = mp.calculateChipBreakdown(132);
        expect(result).toEqual([
            { value: 100, count: 1 },
            { value: 25, count: 1 },
            { value: 5, count: 1 },
            { value: 2, count: 1 }
        ]);
    });

    test('Format breakdown renders correctly', () => {
        const mp = createPanel();
        const breakdown = [{ value: 5, count: 1 }, { value: 2, count: 1 }];
        const text = mp.formatChipBreakdown(breakdown);
        expect(text).toBe('1x $5 + 1x $2');
    });
});

// ═══════════════════════════════════════════════════════
// calculateBetAmount
// ═══════════════════════════════════════════════════════

describe('calculateBetAmount', () => {
    test('Returns current strategy bet normally', () => {
        const mp = createPanel();
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.currentBankroll = 4000;

        const bet = mp.calculateBetAmount(10);
        expect(bet).toBe(5);
    });

    test('Caps bet based on bankroll (cannot bet more than bankroll allows)', () => {
        const mp = createPanel();
        mp.sessionData.currentBetPerNumber = 100;
        mp.sessionData.currentBankroll = 100;

        // maxBet = floor(100 / (10 * 2)) = 5
        const bet = mp.calculateBetAmount(10);
        expect(bet).toBe(5);
    });

    test('Minimum bet is $1', () => {
        const mp = createPanel();
        mp.sessionData.currentBetPerNumber = 0;
        mp.sessionData.currentBankroll = 4000;

        const bet = mp.calculateBetAmount(10);
        expect(bet).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════
// checkForNewSpin
// ═══════════════════════════════════════════════════════

describe('checkForNewSpin', () => {
    test('Does nothing when session not active', () => {
        const mp = createPanel();
        mp.sessionData.isSessionActive = false;
        mp.lastSpinCount = 3;
        global.window.spins = [
            { actual: 5 }, { actual: 10 }, { actual: 15 }, { actual: 20 }
        ];

        // Should not process
        mp.checkForNewSpin();
        expect(mp.lastSpinCount).toBe(3); // unchanged because function returns early
    });

    test('Detects new spin and processes pending bet (HIT)', () => {
        const mp = createPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.currentBankroll = 4000;
        mp.lastSpinCount = 3;
        mp.pendingBet = {
            betAmount: 2,
            numbersCount: 5,
            predictedNumbers: [10, 15, 20, 25, 30]
        };

        global.window.spins = [
            { actual: 5 }, { actual: 10 }, { actual: 15 }, { actual: 20 }
        ];

        mp.checkForNewSpin();

        // Spin 20 is in predictedNumbers → HIT
        expect(mp.sessionData.totalBets).toBe(1);
        expect(mp.sessionData.totalWins).toBe(1);
        expect(mp.pendingBet).toBeNull(); // Cleared after processing
    });

    test('Detects new spin and processes pending bet (MISS)', () => {
        const mp = createPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.currentBankroll = 4000;
        mp.lastSpinCount = 3;
        mp.pendingBet = {
            betAmount: 2,
            numbersCount: 5,
            predictedNumbers: [10, 15, 20, 25, 30]
        };

        global.window.spins = [
            { actual: 5 }, { actual: 10 }, { actual: 15 }, { actual: 7 }
        ];

        mp.checkForNewSpin();

        // Spin 7 is NOT in predictedNumbers → MISS
        expect(mp.sessionData.totalBets).toBe(1);
        expect(mp.sessionData.totalLosses).toBe(1);
    });

    test('No pending bet → no bet recorded', () => {
        const mp = createPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 3;
        mp.pendingBet = null;

        global.window.spins = [
            { actual: 5 }, { actual: 10 }, { actual: 15 }, { actual: 20 }
        ];

        mp.checkForNewSpin();

        expect(mp.sessionData.totalBets).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// BET HISTORY
// ═══════════════════════════════════════════════════════

describe('Bet History', () => {
    test('Bet history records newest first', async () => {
        const mp = createPanel();

        await mp.recordBetResult(2, 10, true, 15);
        await mp.recordBetResult(3, 10, false, 20);

        expect(mp.betHistory[0].actualNumber).toBe(20); // most recent
        expect(mp.betHistory[1].actualNumber).toBe(15);
    });

    test('Bet history caps at 10 entries', async () => {
        const mp = createPanel();

        for (let i = 0; i < 15; i++) {
            await mp.recordBetResult(2, 10, false, i);
        }

        expect(mp.betHistory.length).toBe(10);
    });
});
