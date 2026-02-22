/**
 * TESTS: Spin Management (addSpin, undoLast, formatPos)
 * Coverage for addSpin(), undoLast(), render(), and the complete spin lifecycle
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R;

beforeEach(() => {
    setupDOM();
    // Mock getLookupRow (from table-lookup.js, not loaded in test env)
    global.getLookupRow = jest.fn(() => null);
    R = loadRendererFunctions();
    R.spins.length = 0;
    // Mock moneyPanel for undoLast
    global.window.moneyPanel = {
        sessionData: {
            spinsWithBets: [],
            currentBankroll: 4000,
            sessionProfit: 0,
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            consecutiveLosses: 0,
            consecutiveWins: 0,
            currentBetPerNumber: 2,
            bettingStrategy: 1,
            isBettingEnabled: false,
            isSessionActive: false
        },
        betHistory: [],
        pendingBet: null,
        lastSpinCount: 0,
        render: jest.fn()
    };
    global.window.aiPanel = {
        onSpinAdded: jest.fn(),
        _predictionDebounce: null,
        clearSelections: jest.fn(),
        renderAllCheckboxes: jest.fn(),
        table3Pairs: [],
        table1Pairs: [],
        table2Pairs: [],
        availablePairs: []
    };
    global.window.rouletteWheel = { clearHighlights: jest.fn() };
    global.window.table3DisplayProjections = {};
    global.fetch = jest.fn(() => Promise.resolve({ json: () => ({}) }));
});

// ═══════════════════════════════════════════════════════
// addSpin
// ═══════════════════════════════════════════════════════

describe('addSpin', () => {
    test('Adds spin with valid number 0-36', () => {
        document.getElementById('spinNumber').value = '17';
        document.getElementById('direction').value = 'C';
        R.addSpin();
        expect(R.spins.length).toBe(1);
        expect(R.spins[0].actual).toBe(17);
        expect(R.spins[0].direction).toBe('C');
    });

    test('Rejects number > 36', () => {
        document.getElementById('spinNumber').value = '37';
        R.addSpin();
        expect(R.spins.length).toBe(0);
    });

    test('Rejects negative number', () => {
        document.getElementById('spinNumber').value = '-1';
        R.addSpin();
        expect(R.spins.length).toBe(0);
    });

    test('Rejects NaN', () => {
        document.getElementById('spinNumber').value = 'abc';
        R.addSpin();
        expect(R.spins.length).toBe(0);
    });

    test('Rejects empty input', () => {
        document.getElementById('spinNumber').value = '';
        R.addSpin();
        expect(R.spins.length).toBe(0);
    });

    test('Accepts 0 as valid number', () => {
        document.getElementById('spinNumber').value = '0';
        document.getElementById('direction').value = 'C';
        R.addSpin();
        expect(R.spins.length).toBe(1);
        expect(R.spins[0].actual).toBe(0);
    });

    test('Accepts 36 as valid number', () => {
        document.getElementById('spinNumber').value = '36';
        document.getElementById('direction').value = 'AC';
        R.addSpin();
        expect(R.spins.length).toBe(1);
        expect(R.spins[0].actual).toBe(36);
    });

    test('Auto-alternates direction after first spin', () => {
        document.getElementById('spinNumber').value = '10';
        document.getElementById('direction').value = 'C';
        R.addSpin();
        expect(R.spins[0].direction).toBe('C');

        document.getElementById('spinNumber').value = '20';
        R.addSpin();
        expect(R.spins[1].direction).toBe('AC');

        document.getElementById('spinNumber').value = '30';
        R.addSpin();
        expect(R.spins[2].direction).toBe('C');
    });

    test('Clears input after adding', () => {
        document.getElementById('spinNumber').value = '15';
        document.getElementById('direction').value = 'C';
        R.addSpin();
        expect(document.getElementById('spinNumber').value).toBe('');
    });

    test('Updates info display', () => {
        document.getElementById('spinNumber').value = '5';
        document.getElementById('direction').value = 'C';
        R.addSpin();
        expect(document.getElementById('info').textContent).toContain('1');
    });
});

// ═══════════════════════════════════════════════════════
// undoLast
// ═══════════════════════════════════════════════════════

describe('undoLast', () => {
    test('Does nothing when no spins', async () => {
        await R.undoLast();
        expect(R.spins.length).toBe(0);
    });

    test('Removes last spin', async () => {
        R.spins.push({ actual: 10, direction: 'C' });
        R.spins.push({ actual: 20, direction: 'AC' });
        await R.undoLast();
        expect(R.spins.length).toBe(1);
        expect(R.spins[0].actual).toBe(10);
    });

    test('Calls fetch to undo backend', async () => {
        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/undo'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    test('Clears roulette wheel highlights', async () => {
        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();
        expect(global.window.rouletteWheel.clearHighlights).toHaveBeenCalled();
    });

    test('Clears pending bet on money panel', async () => {
        global.window.moneyPanel.pendingBet = { numbers: [1, 2, 3] };
        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();
        expect(global.window.moneyPanel.pendingBet).toBeNull();
    });

    test('Reverts bankroll when last spin had a bet (WIN)', async () => {
        const mp = global.window.moneyPanel;
        mp.sessionData.spinsWithBets = [1];
        mp.sessionData.currentBankroll = 4364; // After a win
        mp.sessionData.sessionProfit = 364;
        mp.sessionData.totalBets = 1;
        mp.sessionData.totalWins = 1;
        mp.sessionData.isSessionActive = true;
        mp.betHistory = [{ hit: true, netChange: 364, betPerNumber: 2, numbersCount: 9 }];

        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();

        expect(mp.sessionData.currentBankroll).toBe(4000);
        expect(mp.sessionData.sessionProfit).toBe(0);
        expect(mp.sessionData.totalBets).toBe(0);
        expect(mp.sessionData.totalWins).toBe(0);
    });

    test('Reverts bankroll when last spin had a bet (LOSS)', async () => {
        const mp = global.window.moneyPanel;
        mp.sessionData.spinsWithBets = [1];
        mp.sessionData.currentBankroll = 3982; // After a loss
        mp.sessionData.sessionProfit = -18;
        mp.sessionData.totalBets = 1;
        mp.sessionData.totalLosses = 1;
        mp.sessionData.isSessionActive = true;
        mp.betHistory = [{ hit: false, netChange: -18, betPerNumber: 2, numbersCount: 9 }];

        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();

        expect(mp.sessionData.currentBankroll).toBe(4000);
        expect(mp.sessionData.sessionProfit).toBe(0);
        expect(mp.sessionData.totalLosses).toBe(0);
    });

    test('Replays strategy state after undo', async () => {
        const mp = global.window.moneyPanel;
        // 2 bets: loss then loss → consecutive losses = 2, bet should be $3 with strategy 1
        mp.sessionData.spinsWithBets = [1, 2];
        mp.sessionData.currentBankroll = 3964; // 4000 - 18 - 18
        mp.sessionData.sessionProfit = -36;
        mp.sessionData.totalBets = 2;
        mp.sessionData.totalLosses = 2;
        mp.sessionData.consecutiveLosses = 2;
        mp.sessionData.currentBetPerNumber = 4;
        mp.sessionData.bettingStrategy = 1;
        mp.sessionData.isSessionActive = true;
        mp.betHistory = [
            { hit: false, netChange: -27, betPerNumber: 3, numbersCount: 9 },
            { hit: false, netChange: -18, betPerNumber: 2, numbersCount: 9 }
        ];

        R.spins.push({ actual: 10, direction: 'C' });
        R.spins.push({ actual: 20, direction: 'AC' });
        await R.undoLast();

        // After undoing 2nd bet, only 1st bet (loss) remains
        // Strategy 1: loss → bet +1 = $3, consecutiveLosses=1
        expect(mp.sessionData.consecutiveLosses).toBe(1);
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });

    test('Deactivates session when all bets undone', async () => {
        const mp = global.window.moneyPanel;
        mp.sessionData.spinsWithBets = [1];
        mp.sessionData.currentBankroll = 4364;
        mp.sessionData.sessionProfit = 364;
        mp.sessionData.totalBets = 1;
        mp.sessionData.totalWins = 1;
        mp.sessionData.isSessionActive = true;
        mp.betHistory = [{ hit: true, netChange: 364 }];

        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();

        expect(mp.sessionData.isSessionActive).toBe(false);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('Clears AI panel selections when < 3 spins remain', async () => {
        R.spins.push({ actual: 10, direction: 'C' });
        R.spins.push({ actual: 20, direction: 'AC' });
        await R.undoLast(); // 1 spin left
        expect(global.window.aiPanel.clearSelections).toHaveBeenCalled();
    });

    test('Clears table3DisplayProjections when < 3 spins', async () => {
        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();
        expect(global.window.table3DisplayProjections).toEqual({});
    });
});

// ═══════════════════════════════════════════════════════
// Spin lifecycle: add → render → undo cycle
// ═══════════════════════════════════════════════════════

describe('Spin lifecycle', () => {
    test('Add 5 spins then undo all', async () => {
        for (let i = 0; i < 5; i++) {
            R.spins.push({ actual: (i * 7) % 37, direction: i % 2 === 0 ? 'C' : 'AC' });
        }
        expect(R.spins.length).toBe(5);

        for (let i = 0; i < 5; i++) {
            await R.undoLast();
        }
        expect(R.spins.length).toBe(0);
    });

    test('Spins array reference stays same after undo', async () => {
        const ref = R.spins;
        R.spins.push({ actual: 10, direction: 'C' });
        await R.undoLast();
        expect(R.spins).toBe(ref);
    });
});
