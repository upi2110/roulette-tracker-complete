/**
 * TESTS: Reset Button Functionality
 * Tests that the RESET button properly clears ALL state across all panels.
 *
 * User concern: "more tests around reset button"
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');

let R;

beforeAll(() => {
    setupDOM();
    R = loadRendererFunctions();
});

beforeEach(() => {
    setupDOM();
    // Reset spins array
    if (R.spins) {
        R.spins.length = 0;
    }

    // Provide window stubs
    global.window.moneyPanel = null;
    global.window.aiPanel = null;
    global.window.rouletteWheel = null;
    global.window.orchestrator = null;
    global.window.table3DisplayProjections = {};
    global.confirm = () => true; // Auto-confirm reset
});

// ═══════════════════════════════════════════════════════
// SPINS ARRAY CLEARING
// ═══════════════════════════════════════════════════════

describe('Reset: Spins Array', () => {
    test('spins array is emptied', () => {
        const spins = R.spins;
        spins.push({ actual: 10, direction: 'C' });
        spins.push({ actual: 22, direction: 'AC' });
        expect(spins.length).toBe(2);

        R.resetAll();
        expect(spins.length).toBe(0);
    });

    test('spins reference stays the same (length = 0, not new array)', () => {
        const spins = R.spins;
        const ref = spins;
        spins.push({ actual: 5, direction: 'C' });

        R.resetAll();

        // Same reference, just emptied
        expect(spins).toBe(ref);
        expect(spins.length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// TABLE BODY CLEARING
// ═══════════════════════════════════════════════════════

describe('Reset: Table Bodies', () => {
    test('table1Body is cleared', () => {
        const tbody = document.getElementById('table1Body');
        tbody.innerHTML = '<tr><td>test</td></tr>';
        expect(tbody.innerHTML).not.toBe('');

        R.resetAll();
        expect(document.getElementById('table1Body').innerHTML).toBe('');
    });

    test('table2Body is cleared', () => {
        const tbody = document.getElementById('table2Body');
        tbody.innerHTML = '<tr><td>test</td></tr>';

        R.resetAll();
        expect(document.getElementById('table2Body').innerHTML).toBe('');
    });

    test('table3Body is cleared', () => {
        const tbody = document.getElementById('table3Body');
        tbody.innerHTML = '<tr><td>test</td></tr>';

        R.resetAll();
        expect(document.getElementById('table3Body').innerHTML).toBe('');
    });
});

// ═══════════════════════════════════════════════════════
// INPUT FIELDS RESET
// ═══════════════════════════════════════════════════════

describe('Reset: Input Fields', () => {
    test('Direction resets to C', () => {
        document.getElementById('direction').value = 'AC';

        R.resetAll();
        expect(document.getElementById('direction').value).toBe('C');
    });

    test('Spin number input is cleared', () => {
        document.getElementById('spinNumber').value = '15';

        R.resetAll();
        expect(document.getElementById('spinNumber').value).toBe('');
    });
});

// ═══════════════════════════════════════════════════════
// MONEY PANEL RESET
// ═══════════════════════════════════════════════════════

describe('Reset: Money Management Panel', () => {
    test('Bankroll resets to $4,000', () => {
        global.window.moneyPanel = {
            sessionData: {
                startingBankroll: 4000,
                currentBankroll: 3500,
                sessionProfit: -500,
                bettingStrategy: 1,
                isSessionActive: true,
                isBettingEnabled: true,
                currentBetPerNumber: 5,
                consecutiveLosses: 3,
                consecutiveWins: 0,
                totalBets: 10,
                totalWins: 2,
                totalLosses: 8,
                spinsWithBets: [3, 4, 5]
            },
            betHistory: [{ spin: 1, hit: false }],
            pendingBet: { betAmount: 5, numbersCount: 10, predictedNumbers: [1] },
            lastSpinCount: 10,
            render: jest.fn()
        };

        R.resetAll();

        const mp = global.window.moneyPanel;
        expect(mp.sessionData.currentBankroll).toBe(4000);
        expect(mp.sessionData.sessionProfit).toBe(0);
        expect(mp.sessionData.totalBets).toBe(0);
        expect(mp.sessionData.totalWins).toBe(0);
        expect(mp.sessionData.totalLosses).toBe(0);
        expect(mp.sessionData.consecutiveLosses).toBe(0);
        expect(mp.sessionData.consecutiveWins).toBe(0);
        expect(mp.sessionData.isSessionActive).toBe(false);
        expect(mp.sessionData.isBettingEnabled).toBe(false);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('Betting goes back to PAUSED after reset', () => {
        global.window.moneyPanel = {
            sessionData: {
                bettingStrategy: 1,
                isBettingEnabled: true,
                isSessionActive: true,
                startingBankroll: 4000, currentBankroll: 4000,
                sessionProfit: 0, sessionTarget: 100,
                totalBets: 0, totalWins: 0, totalLosses: 0,
                consecutiveLosses: 0, consecutiveWins: 0,
                lastBetAmount: 0, lastBetNumbers: 12,
                currentBetPerNumber: 2, spinsWithBets: []
            },
            betHistory: [],
            pendingBet: null,
            lastSpinCount: 0,
            render: jest.fn()
        };

        R.resetAll();

        expect(global.window.moneyPanel.sessionData.isBettingEnabled).toBe(false);
    });

    test('Strategy is PRESERVED across reset', () => {
        global.window.moneyPanel = {
            sessionData: {
                bettingStrategy: 3, // Cautious
                isBettingEnabled: false,
                isSessionActive: false,
                startingBankroll: 4000, currentBankroll: 4000,
                sessionProfit: 0, sessionTarget: 100,
                totalBets: 0, totalWins: 0, totalLosses: 0,
                consecutiveLosses: 0, consecutiveWins: 0,
                lastBetAmount: 0, lastBetNumbers: 12,
                currentBetPerNumber: 2, spinsWithBets: []
            },
            betHistory: [],
            pendingBet: null,
            lastSpinCount: 0,
            render: jest.fn()
        };

        R.resetAll();

        // Strategy should be preserved
        expect(global.window.moneyPanel.sessionData.bettingStrategy).toBe(3);
    });

    test('Pending bet is cleared', () => {
        global.window.moneyPanel = {
            sessionData: {
                bettingStrategy: 1,
                isBettingEnabled: false,
                isSessionActive: false,
                startingBankroll: 4000, currentBankroll: 4000,
                sessionProfit: 0, sessionTarget: 100,
                totalBets: 0, totalWins: 0, totalLosses: 0,
                consecutiveLosses: 0, consecutiveWins: 0,
                lastBetAmount: 0, lastBetNumbers: 12,
                currentBetPerNumber: 2, spinsWithBets: []
            },
            betHistory: [],
            pendingBet: { betAmount: 5, numbersCount: 11, predictedNumbers: [1,2,3] },
            lastSpinCount: 5,
            render: jest.fn()
        };

        R.resetAll();

        expect(global.window.moneyPanel.pendingBet).toBeNull();
        expect(global.window.moneyPanel.lastSpinCount).toBe(0);
    });

    test('Bet history is cleared', () => {
        global.window.moneyPanel = {
            sessionData: {
                bettingStrategy: 1,
                isBettingEnabled: false,
                isSessionActive: false,
                startingBankroll: 4000, currentBankroll: 4000,
                sessionProfit: 0, sessionTarget: 100,
                totalBets: 0, totalWins: 0, totalLosses: 0,
                consecutiveLosses: 0, consecutiveWins: 0,
                lastBetAmount: 0, lastBetNumbers: 12,
                currentBetPerNumber: 2, spinsWithBets: []
            },
            betHistory: [
                { spin: 1, hit: true, netChange: 50 },
                { spin: 2, hit: false, netChange: -20 }
            ],
            pendingBet: null,
            lastSpinCount: 0,
            render: jest.fn()
        };

        R.resetAll();

        expect(global.window.moneyPanel.betHistory).toEqual([]);
    });

    test('Betting button UI updates to PAUSED', () => {
        global.window.moneyPanel = {
            sessionData: {
                bettingStrategy: 1,
                isBettingEnabled: false,
                isSessionActive: false,
                startingBankroll: 4000, currentBankroll: 4000,
                sessionProfit: 0, sessionTarget: 100,
                totalBets: 0, totalWins: 0, totalLosses: 0,
                consecutiveLosses: 0, consecutiveWins: 0,
                lastBetAmount: 0, lastBetNumbers: 12,
                currentBetPerNumber: 2, spinsWithBets: []
            },
            betHistory: [],
            pendingBet: null,
            lastSpinCount: 0,
            render: jest.fn()
        };

        const btn = document.getElementById('toggleBettingBtn');
        btn.textContent = '⏸️ PAUSE BETTING';
        btn.style.backgroundColor = '#dc3545';

        // resetAll calls render() which needs lookup table for Tables 1&2.
        // We catch the error but verify the money panel state was set before render().
        try { R.resetAll(); } catch(e) { /* render() may throw */ }

        expect(btn.textContent).toContain('START BETTING');
        // jsdom converts hex to rgb format
        expect(btn.style.backgroundColor).toMatch(/^(#28a745|rgb\(40,\s*167,\s*69\))$/);
    });
});

// ═══════════════════════════════════════════════════════
// AI PANEL RESET
// ═══════════════════════════════════════════════════════

describe('Reset: AI Prediction Panel', () => {
    test('AI panel selections are cleared', () => {
        global.window.aiPanel = {
            _predictionDebounce: null,
            clearSelections: jest.fn(),
            table3Pairs: ['prev', 'prevMinus1'],
            table1Pairs: ['prev'],
            table2Pairs: [],
            availablePairs: ['prev', 'prevPlus1'],
            renderAllCheckboxes: jest.fn()
        };

        R.resetAll();

        expect(global.window.aiPanel.clearSelections).toHaveBeenCalled();
        expect(global.window.aiPanel.table3Pairs).toEqual([]);
        expect(global.window.aiPanel.table1Pairs).toEqual([]);
        expect(global.window.aiPanel.table2Pairs).toEqual([]);
        expect(global.window.aiPanel.availablePairs).toEqual([]);
    });

    test('Debounce timer is cleared', () => {
        const mockTimer = 12345;
        global.window.aiPanel = {
            _predictionDebounce: mockTimer,
            clearSelections: jest.fn(),
            table3Pairs: [],
            table1Pairs: [],
            table2Pairs: [],
            availablePairs: [],
            renderAllCheckboxes: jest.fn()
        };

        jest.spyOn(global, 'clearTimeout');
        R.resetAll();

        expect(global.clearTimeout).toHaveBeenCalledWith(mockTimer);
    });
});

// ═══════════════════════════════════════════════════════
// WHEEL RESET
// ═══════════════════════════════════════════════════════

describe('Reset: Roulette Wheel', () => {
    test('Wheel highlights are cleared', () => {
        global.window.rouletteWheel = {
            clearHighlights: jest.fn()
        };

        R.resetAll();

        expect(global.window.rouletteWheel.clearHighlights).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════
// TABLE3 DISPLAY PROJECTIONS
// ═══════════════════════════════════════════════════════

describe('Reset: table3DisplayProjections', () => {
    test('window.table3DisplayProjections is cleared', () => {
        global.window.table3DisplayProjections = {
            prev: { purple: [1, 2], green: [3, 4] }
        };

        R.resetAll();

        expect(global.window.table3DisplayProjections).toEqual({});
    });
});

// ═══════════════════════════════════════════════════════
// PAIR-SELECTED HIGHLIGHTS
// ═══════════════════════════════════════════════════════

describe('Reset: Pair selection highlights', () => {
    test('All t3-pair-selected classes are removed', () => {
        // Add some pair-selected highlights
        const tbody = document.getElementById('table3Body');
        tbody.innerHTML = `
            <tr><td class="t3-pair-selected">test</td></tr>
            <tr><td class="t3-pair-selected">test2</td></tr>
        `;

        expect(document.querySelectorAll('.t3-pair-selected').length).toBe(2);

        R.resetAll();

        expect(document.querySelectorAll('.t3-pair-selected').length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// ORCHESTRATOR RESET
// ═══════════════════════════════════════════════════════

describe('Reset: Orchestrator', () => {
    test('Orchestrator spin count resets (if window.autoUpdateOrchestrator exists)', () => {
        global.window.autoUpdateOrchestrator = {
            lastSpinCount: 15
        };

        R.resetAll();

        expect(global.window.autoUpdateOrchestrator.lastSpinCount).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════════════════

describe('Reset: Confirm dialog', () => {
    test('resetAll requires confirm() to proceed', () => {
        // The resetAll function uses confirm('Reset all?')
        // Since the eval'd code uses its own confirm (which we set to always-true in beforeEach),
        // we verify the function structure rather than overriding confirm at runtime
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );

        // Verify resetAll has confirm guard
        expect(src).toContain("confirm('Reset all?')");
    });
});
