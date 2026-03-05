/**
 * TESTS: Money Management Panel - UI / DOM Rendering
 *
 * Covers the REMAINING untested methods not in 02-money-management.test.js:
 *   render()           - DOM element updates, classes, colors
 *   renderBetHistory() - bet history DOM rendering
 *   togglePanel()      - expand/collapse DOM changes
 *   toggleBetting()    - button text, color, status DOM changes
 *   toggleStrategy()   - button text/gradient DOM changes
 *   setPrediction()    - session start spin sync, edge cases
 *   calculateBetAmount()- additional edge cases
 *   updateFromPrediction() - full method including pendingBet storage
 *   checkForNewSpin()  - additional edge cases
 *   recordBetResult()  - betHistory tracking details
 */

const { setupDOM, createMoneyPanel } = require('../test-setup');

beforeEach(() => {
    // Reset globals before each test
    global.window = global.window || {};
    global.window.aiPanel = { getPredictions: jest.fn() };
    global.window.spins = [];
    global.window.spinData = [];
    global.window.moneyPanel = null;
    global.fetch = jest.fn(() => Promise.resolve({ json: () => ({}) }));
    global.aiIntegration = undefined;
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════

function getPanel() {
    const mp = createMoneyPanel();
    // Advance any pending setTimeout calls so setupBettingControl fires
    jest.runAllTimers();
    return mp;
}

// ═══════════════════════════════════════════════════════
// render() — DOM element updates
// ═══════════════════════════════════════════════════════

describe('render() - Bankroll display', () => {
    test('bankrollValue shows formatted bankroll with $ and commas', () => {
        const mp = getPanel();
        mp.sessionData.currentBankroll = 4000;
        mp.render();

        const el = document.getElementById('bankrollValue');
        expect(el.textContent).toBe('$4,000');
    });

    test('bankrollValue shows updated bankroll after change', () => {
        const mp = getPanel();
        mp.sessionData.currentBankroll = 12345;
        mp.render();

        const el = document.getElementById('bankrollValue');
        expect(el.textContent).toBe('$12,345');
    });

    test('bankrollValue gets "warning" class when bankroll < 80% of starting', () => {
        const mp = getPanel();
        mp.sessionData.startingBankroll = 4000;
        mp.sessionData.currentBankroll = 3100; // 77.5%
        mp.render();

        const el = document.getElementById('bankrollValue');
        expect(el.classList.contains('warning')).toBe(true);
    });

    test('bankrollValue gets "caution" class when bankroll between 80% and 90%', () => {
        const mp = getPanel();
        mp.sessionData.startingBankroll = 4000;
        mp.sessionData.currentBankroll = 3500; // 87.5%
        mp.render();

        const el = document.getElementById('bankrollValue');
        expect(el.classList.contains('caution')).toBe(true);
    });

    test('bankrollValue has no warning/caution class when >= 90%', () => {
        const mp = getPanel();
        mp.sessionData.startingBankroll = 4000;
        mp.sessionData.currentBankroll = 3800; // 95%
        mp.render();

        const el = document.getElementById('bankrollValue');
        expect(el.classList.contains('warning')).toBe(false);
        expect(el.classList.contains('caution')).toBe(false);
    });
});

describe('render() - Profit display', () => {
    test('profitValue shows +$ prefix when profit is positive', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 50;
        mp.render();

        const el = document.getElementById('profitValue');
        expect(el.textContent).toBe('+$50');
    });

    test('profitValue shows -$ prefix when profit is negative', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = -30;
        mp.render();

        const el = document.getElementById('profitValue');
        expect(el.textContent).toBe('-$30');
    });

    test('profitValue shows +$0 when profit is zero', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 0;
        mp.render();

        const el = document.getElementById('profitValue');
        expect(el.textContent).toBe('+$0');
    });

    test('profitValue gets "profit" class when positive', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 100;
        mp.render();

        const el = document.getElementById('profitValue');
        expect(el.classList.contains('profit')).toBe(true);
        expect(el.classList.contains('loss')).toBe(false);
    });

    test('profitValue gets "loss" class when negative', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = -50;
        mp.render();

        const el = document.getElementById('profitValue');
        expect(el.classList.contains('loss')).toBe(true);
        expect(el.classList.contains('profit')).toBe(false);
    });

    test('profitValue has neither profit nor loss class when zero', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 0;
        mp.render();

        const el = document.getElementById('profitValue');
        expect(el.classList.contains('profit')).toBe(false);
        expect(el.classList.contains('loss')).toBe(false);
    });
});

describe('render() - Target display', () => {
    test('targetValue shows session target with $', () => {
        const mp = getPanel();
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const el = document.getElementById('targetValue');
        expect(el.textContent).toBe('$100');
    });

    test('targetValue shows updated target after change', () => {
        const mp = getPanel();
        mp.sessionData.sessionTarget = 250;
        mp.render();

        const el = document.getElementById('targetValue');
        expect(el.textContent).toBe('$250');
    });
});

describe('render() - Next Bet display', () => {
    test('shows bet formula when session active with bet amount > 0', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.lastBetAmount = 2;
        mp.sessionData.lastBetNumbers = 12;
        mp.render();

        const el = document.getElementById('nextBetValue');
        expect(el.textContent).toBe('$2 \u00d7 12 = $24');
    });

    test('shows "Waiting for prediction..." when active but no bet', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.lastBetAmount = 0;
        mp.render();

        const el = document.getElementById('nextBetValue');
        expect(el.textContent).toBe('Waiting for prediction...');
    });

    test('shows "Session not started" when session inactive', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = false;
        mp.sessionData.lastBetAmount = 0;
        mp.render();

        const el = document.getElementById('nextBetValue');
        expect(el.textContent).toBe('Session not started');
    });

    test('shows correct formula for different bet amounts', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.lastBetAmount = 5;
        mp.sessionData.lastBetNumbers = 8;
        mp.render();

        const el = document.getElementById('nextBetValue');
        expect(el.textContent).toBe('$5 \u00d7 8 = $40');
    });
});

describe('render() - Chip Breakdown display', () => {
    test('chipBreakdownDisplay is visible when session active and bet > 0', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.lastBetAmount = 7;
        mp.render();

        const el = document.getElementById('chipBreakdownDisplay');
        expect(el.style.display).toBe('block');
        expect(el.innerHTML).toContain('Chips:');
    });

    test('chipBreakdownDisplay is hidden when session inactive', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = false;
        mp.sessionData.lastBetAmount = 0;
        mp.render();

        const el = document.getElementById('chipBreakdownDisplay');
        expect(el.style.display).toBe('none');
    });

    test('chipBreakdownDisplay is hidden when bet is 0', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.lastBetAmount = 0;
        mp.render();

        const el = document.getElementById('chipBreakdownDisplay');
        expect(el.style.display).toBe('none');
    });

    test('chipBreakdownDisplay shows correct chip text for $7', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.lastBetAmount = 7;
        mp.render();

        const el = document.getElementById('chipBreakdownDisplay');
        expect(el.innerHTML).toContain('1x $5 + 1x $2');
    });
});

describe('render() - Total Bets display', () => {
    test('totalBetsValue shows bet count', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 0;
        mp.render();

        const el = document.getElementById('totalBetsValue');
        expect(el.textContent).toBe('0');
    });

    test('totalBetsValue shows updated count', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 15;
        mp.render();

        const el = document.getElementById('totalBetsValue');
        expect(el.textContent).toBe('15');
    });
});

describe('render() - Win Rate display', () => {
    test('winRateValue shows "--" when totalBets is 0', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 0;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.textContent).toBe('--');
    });

    test('winRateValue shows percentage when bets > 0', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 10;
        mp.sessionData.totalWins = 3;
        mp.sessionData.totalLosses = 7;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.textContent).toBe('30.0%');
    });

    test('winRateValue shows 100.0% for all wins', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 5;
        mp.sessionData.totalWins = 5;
        mp.sessionData.totalLosses = 0;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.textContent).toBe('100.0%');
    });

    test('winRateValue shows 0.0% for all losses', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 5;
        mp.sessionData.totalWins = 0;
        mp.sessionData.totalLosses = 5;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.textContent).toBe('0.0%');
    });

    test('winRateValue gets green color when rate >= 30%', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 10;
        mp.sessionData.totalWins = 4;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.style.color).toMatch(/(?:#28a745|rgb\(40,\s*167,\s*69\))/);
    });

    test('winRateValue gets yellow color when rate 20-29%', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 10;
        mp.sessionData.totalWins = 2;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.style.color).toMatch(/(?:#ffc107|rgb\(255,\s*193,\s*7\))/);
    });

    test('winRateValue gets red color when rate < 20%', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 10;
        mp.sessionData.totalWins = 1;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.style.color).toMatch(/(?:#dc3545|rgb\(220,\s*53,\s*69\))/);
    });

    test('winRateValue title shows W/L breakdown', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 10;
        mp.sessionData.totalWins = 3;
        mp.sessionData.totalLosses = 7;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.title).toBe('3W / 7L');
    });

    test('winRateValue gets gray color when 0 bets', () => {
        const mp = getPanel();
        mp.sessionData.totalBets = 0;
        mp.render();

        const el = document.getElementById('winRateValue');
        expect(el.style.color).toMatch(/(?:#6c757d|rgb\(108,\s*117,\s*125\))/);
    });
});

describe('render() - Consecutive Losses display', () => {
    test('consecutiveLossesValue shows count', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 3;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.textContent).toBe('3');
    });

    test('gets "danger" class when consecutiveLosses >= 4', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 4;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.classList.contains('danger')).toBe(true);
    });

    test('gets "danger" class when consecutiveLosses = 5', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 5;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.classList.contains('danger')).toBe(true);
    });

    test('gets "warning" class when consecutiveLosses = 2', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 2;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.classList.contains('warning')).toBe(true);
        expect(el.classList.contains('danger')).toBe(false);
    });

    test('gets "warning" class when consecutiveLosses = 3', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 3;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.classList.contains('warning')).toBe(true);
        expect(el.classList.contains('danger')).toBe(false);
    });

    test('no danger/warning class when consecutiveLosses < 2', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 1;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.classList.contains('warning')).toBe(false);
        expect(el.classList.contains('danger')).toBe(false);
    });

    test('no danger/warning class when consecutiveLosses = 0', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveLosses = 0;
        mp.render();

        const el = document.getElementById('consecutiveLossesValue');
        expect(el.classList.contains('warning')).toBe(false);
        expect(el.classList.contains('danger')).toBe(false);
    });
});

describe('render() - Progress bar', () => {
    test('progressFill width is 0% when no profit', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 0;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        const text = document.getElementById('progressText');
        expect(fill.style.width).toBe('0%');
        expect(text.textContent).toBe('0%');
    });

    test('progressFill width is 50% when half target reached', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 50;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        const text = document.getElementById('progressText');
        expect(fill.style.width).toBe('50%');
        expect(text.textContent).toBe('50%');
    });

    test('progressFill width caps at 100% when target exceeded', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 200;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        expect(fill.style.width).toBe('100%');
    });

    test('progressText shows capped percentage at 100% when exceeded', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 200;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const text = document.getElementById('progressText');
        expect(text.textContent).toBe('100%');
    });

    test('progress bar is green when >= 100%', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 100;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        // JSDOM may convert hex to rgb
        expect(fill.style.background).toMatch(/(?:#28a745|rgb\(40,\s*167,\s*69\))/);
    });

    test('progress bar is yellow when >= 50% and < 100%', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 60;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        expect(fill.style.background).toMatch(/(?:#ffc107|rgb\(255,\s*193,\s*7\))/);
    });

    test('progress bar is blue when > 0% and < 50%', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 30;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        expect(fill.style.background).toMatch(/(?:#007bff|rgb\(0,\s*123,\s*255\))/);
    });

    test('progress bar is blue when profit is 0 (0% >= 0 so not < 0)', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = 0;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        // progress = 0, which is not >= 100, not >= 50, and not < 0
        expect(fill.style.background).toMatch(/(?:#007bff|rgb\(0,\s*123,\s*255\))/);
    });

    test('progress bar width clamps to 0% when profit is negative', () => {
        const mp = getPanel();
        mp.sessionData.sessionProfit = -50;
        mp.sessionData.sessionTarget = 100;
        mp.render();

        const fill = document.getElementById('progressFill');
        // Math.max(0, -50) = 0, displayProgress = min(100, 0) = 0
        expect(fill.style.width).toBe('0%');
    });
});

// ═══════════════════════════════════════════════════════
// renderBetHistory() — DOM rendering of bet items
// ═══════════════════════════════════════════════════════

describe('renderBetHistory() - DOM rendering', () => {
    test('shows "No bets yet" when betHistory is empty', () => {
        const mp = getPanel();
        mp.betHistory = [];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('No bets yet');
    });

    test('shows bet items with correct win icon', () => {
        const mp = getPanel();
        mp.betHistory = [{
            spin: 1,
            betAmount: 2,
            totalBet: 24,
            hit: true,
            actualNumber: 15,
            netChange: 46,
            timestamp: '10:30:00'
        }];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('\u2705'); // checkmark
        expect(el.innerHTML).toContain('15');
        expect(el.innerHTML).toContain('+$46');
    });

    test('shows bet items with correct loss icon', () => {
        const mp = getPanel();
        mp.betHistory = [{
            spin: 1,
            betAmount: 2,
            totalBet: 24,
            hit: false,
            actualNumber: 7,
            netChange: -24,
            timestamp: '10:31:00'
        }];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('\u274c'); // red X
        expect(el.innerHTML).toContain('7');
        expect(el.innerHTML).toContain('$-24');
    });

    test('shows correct green color for win net change', () => {
        const mp = getPanel();
        mp.betHistory = [{
            spin: 1, betAmount: 2, totalBet: 24, hit: true,
            actualNumber: 15, netChange: 46, timestamp: '10:30:00'
        }];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('#28a745'); // green
    });

    test('shows correct red color for loss net change', () => {
        const mp = getPanel();
        mp.betHistory = [{
            spin: 1, betAmount: 2, totalBet: 24, hit: false,
            actualNumber: 7, netChange: -24, timestamp: '10:31:00'
        }];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('#dc3545'); // red
    });

    test('shows spin number for each bet', () => {
        const mp = getPanel();
        mp.betHistory = [
            { spin: 3, betAmount: 2, totalBet: 20, hit: true, actualNumber: 10, netChange: 50, timestamp: '10:32:00' },
            { spin: 2, betAmount: 2, totalBet: 20, hit: false, actualNumber: 5, netChange: -20, timestamp: '10:31:00' },
        ];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('#3');
        expect(el.innerHTML).toContain('#2');
    });

    test('shows timestamp for each bet', () => {
        const mp = getPanel();
        mp.betHistory = [{
            spin: 1, betAmount: 2, totalBet: 24, hit: true,
            actualNumber: 15, netChange: 46, timestamp: '14:05:30'
        }];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        expect(el.innerHTML).toContain('14:05:30');
    });

    test('renders multiple bet history items as children', () => {
        const mp = getPanel();
        mp.betHistory = [
            { spin: 3, betAmount: 2, totalBet: 20, hit: true, actualNumber: 10, netChange: 50, timestamp: '10:32:00' },
            { spin: 2, betAmount: 2, totalBet: 20, hit: false, actualNumber: 5, netChange: -20, timestamp: '10:31:00' },
            { spin: 1, betAmount: 2, totalBet: 20, hit: false, actualNumber: 3, netChange: -20, timestamp: '10:30:00' },
        ];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        const items = el.querySelectorAll('.bet-history-item');
        expect(items.length).toBe(3);
    });

    test('clears old HTML before rendering new items', () => {
        const mp = getPanel();

        // First render with 2 items
        mp.betHistory = [
            { spin: 2, betAmount: 2, totalBet: 20, hit: true, actualNumber: 10, netChange: 50, timestamp: '10:31:00' },
            { spin: 1, betAmount: 2, totalBet: 20, hit: false, actualNumber: 5, netChange: -20, timestamp: '10:30:00' },
        ];
        mp.renderBetHistory();

        // Second render with 1 item
        mp.betHistory = [
            { spin: 3, betAmount: 2, totalBet: 20, hit: true, actualNumber: 15, netChange: 50, timestamp: '10:32:00' },
        ];
        mp.renderBetHistory();

        const el = document.getElementById('betHistoryList');
        const items = el.querySelectorAll('.bet-history-item');
        expect(items.length).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════
// togglePanel() - expand/collapse
// ═══════════════════════════════════════════════════════

describe('togglePanel() - expand/collapse', () => {
    test('starts expanded (isExpanded = true)', () => {
        const mp = getPanel();
        expect(mp.isExpanded).toBe(true);
    });

    test('togglePanel() sets isExpanded to false', () => {
        const mp = getPanel();
        mp.togglePanel();
        expect(mp.isExpanded).toBe(false);
    });

    test('togglePanel() twice returns to expanded', () => {
        const mp = getPanel();
        mp.togglePanel();
        mp.togglePanel();
        expect(mp.isExpanded).toBe(true);
    });

    test('collapsing hides content (display: none)', () => {
        const mp = getPanel();
        mp.togglePanel(); // collapse

        const content = document.getElementById('moneyPanelContent');
        expect(content.style.display).toBe('none');
    });

    test('expanding shows content (display: block)', () => {
        const mp = getPanel();
        mp.togglePanel(); // collapse
        mp.togglePanel(); // expand

        const content = document.getElementById('moneyPanelContent');
        expect(content.style.display).toBe('block');
    });

    test('collapsing removes "expanded" class from panel', () => {
        const mp = getPanel();
        mp.togglePanel(); // collapse

        const panel = document.getElementById('moneyPanel');
        expect(panel.classList.contains('expanded')).toBe(false);
    });

    test('expanding adds "expanded" class to panel', () => {
        const mp = getPanel();
        mp.togglePanel(); // collapse
        mp.togglePanel(); // expand

        const panel = document.getElementById('moneyPanel');
        expect(panel.classList.contains('expanded')).toBe(true);
    });

    test('toggle button shows "+" when collapsed', () => {
        const mp = getPanel();
        mp.togglePanel(); // collapse

        const btn = document.getElementById('toggleMoneyPanel');
        expect(btn.textContent).toBe('+');
    });

    test('toggle button shows "\u2212" when expanded', () => {
        const mp = getPanel();
        mp.togglePanel(); // collapse
        mp.togglePanel(); // expand

        const btn = document.getElementById('toggleMoneyPanel');
        expect(btn.textContent).toBe('\u2212');
    });
});

// ═══════════════════════════════════════════════════════
// toggleBetting() - DOM updates
// ═══════════════════════════════════════════════════════

describe('toggleBetting() - DOM updates', () => {
    test('enabling betting updates button text to PAUSE', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable

        const btn = document.getElementById('toggleBettingBtn');
        expect(btn.textContent).toContain('PAUSE BETTING');
    });

    test('enabling betting sets button background to red', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable

        const btn = document.getElementById('toggleBettingBtn');
        expect(btn.style.backgroundColor).toMatch(/(?:#dc3545|rgb\(220,\s*53,\s*69\))/);
    });

    test('enabling betting updates status text', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable

        const status = document.getElementById('bettingStatus');
        expect(status.textContent).toContain('Auto-betting ACTIVE');
    });

    test('enabling betting sets status background to light green', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable

        const status = document.getElementById('bettingStatus');
        expect(status.style.backgroundColor).toMatch(/(?:#d4edda|rgb\(212,\s*237,\s*218\))/);
        expect(status.style.color).toMatch(/(?:#155724|rgb\(21,\s*87,\s*36\))/);
    });

    test('disabling betting updates button text to START', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable
        mp.toggleBetting(); // disable

        const btn = document.getElementById('toggleBettingBtn');
        expect(btn.textContent).toContain('START BETTING');
    });

    test('disabling betting sets button background to green', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable
        mp.toggleBetting(); // disable

        const btn = document.getElementById('toggleBettingBtn');
        expect(btn.style.backgroundColor).toMatch(/(?:#28a745|rgb\(40,\s*167,\s*69\))/);
    });

    test('disabling betting updates status text to PAUSED', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable
        mp.toggleBetting(); // disable

        const status = document.getElementById('bettingStatus');
        expect(status.textContent).toContain('Betting PAUSED');
    });

    test('disabling betting sets status to light red background', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable
        mp.toggleBetting(); // disable

        const status = document.getElementById('bettingStatus');
        expect(status.style.backgroundColor).toMatch(/(?:#f8d7da|rgb\(248,\s*215,\s*218\))/);
        expect(status.style.color).toMatch(/(?:#721c24|rgb\(114,\s*28,\s*36\))/);
    });

    test('disabling betting clears pendingBet', () => {
        const mp = getPanel();
        mp.toggleBetting(); // enable
        mp.pendingBet = { betAmount: 5, numbersCount: 10, predictedNumbers: [1, 2, 3] };
        mp.toggleBetting(); // disable

        expect(mp.pendingBet).toBeNull();
    });

    test('enabling betting triggers getPredictions via setTimeout', () => {
        const mp = getPanel();
        const mockGetPredictions = jest.fn();
        global.window.aiPanel = { getPredictions: mockGetPredictions };

        mp.toggleBetting(); // enable
        jest.advanceTimersByTime(200);

        expect(mockGetPredictions).toHaveBeenCalled();
    });

    test('enabling when aiPanel is null does not throw', () => {
        const mp = getPanel();
        global.window.aiPanel = null;

        expect(() => {
            mp.toggleBetting(); // enable
            jest.advanceTimersByTime(200);
        }).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════
// toggleStrategy() - DOM updates
// ═══════════════════════════════════════════════════════

describe('toggleStrategy() - DOM updates', () => {
    test('strategy 3 -> 1 updates button to Aggressive with green gradient', () => {
        const mp = getPanel();
        expect(mp.sessionData.bettingStrategy).toBe(3);

        mp.toggleStrategy(); // 3 -> 1
        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn.textContent).toContain('Strategy 1: Aggressive');
        expect(btn.style.background).toContain('#28a745');
    });

    test('strategy 1 -> 2 updates button to Conservative with blue gradient', () => {
        const mp = getPanel();
        mp.toggleStrategy(); // 3 -> 1
        mp.toggleStrategy(); // 1 -> 2

        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn.textContent).toContain('Strategy 2: Conservative');
        expect(btn.style.background).toContain('#007bff');
    });

    test('strategy 2 -> 3 updates button to Cautious with purple gradient', () => {
        const mp = getPanel();
        mp.toggleStrategy(); // 3 -> 1
        mp.toggleStrategy(); // 1 -> 2
        mp.toggleStrategy(); // 2 -> 3

        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn.textContent).toContain('Strategy 3: Cautious');
        expect(btn.style.background).toContain('#6f42c1');
    });

    test('toggleStrategy resets consecutiveWins to 0', () => {
        const mp = getPanel();
        mp.sessionData.consecutiveWins = 5;
        mp.toggleStrategy();
        expect(mp.sessionData.consecutiveWins).toBe(0);
    });

    test('toggleStrategy resets currentBetPerNumber to 2', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 10;
        mp.toggleStrategy();
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });

    test('toggleStrategy calls render()', () => {
        const mp = getPanel();
        const renderSpy = jest.spyOn(mp, 'render');
        mp.toggleStrategy();
        expect(renderSpy).toHaveBeenCalled();
        renderSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════
// setPrediction() - additional edge cases
// ═══════════════════════════════════════════════════════

describe('setPrediction() - edge cases and session start', () => {
    test('null prediction returns early without changes', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;
        mp.pendingBet = { betAmount: 2, numbersCount: 5, predictedNumbers: [1, 2, 3, 4, 5] };

        mp.setPrediction(null);
        // Function returns early, pendingBet remains unchanged
        expect(mp.pendingBet).not.toBeNull();
    });

    test('prediction with no numbers property returns early', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;

        mp.setPrediction({ signal: 'BET NOW', confidence: 90 });
        expect(mp.pendingBet).toBeNull();
    });

    test('prediction with empty numbers array returns early', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;

        mp.setPrediction({ numbers: [], signal: 'WAIT', confidence: 0 });
        expect(mp.pendingBet).toBeNull();
    });

    test('first prediction activates session (isSessionActive = true)', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        expect(mp.sessionData.isSessionActive).toBe(false);

        mp.setPrediction({ numbers: [1, 5, 10], signal: 'BET', confidence: 80 });
        expect(mp.sessionData.isSessionActive).toBe(true);
    });

    test('first prediction syncs lastSpinCount to current spins length', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = false;
        global.window.spins = [{ actual: 5 }, { actual: 10 }, { actual: 15 }];

        mp.setPrediction({ numbers: [1, 2, 3], signal: 'BET', confidence: 80 });
        expect(mp.lastSpinCount).toBe(3);
    });

    test('stores pendingBet when betting is enabled', () => {
        const mp = getPanel();
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
        expect(mp.pendingBet.signal).toBe('BET NOW');
        expect(mp.pendingBet.confidence).toBe(90);
    });

    test('does NOT store pendingBet when betting is disabled', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = false;
        mp.sessionData.isSessionActive = true;

        mp.setPrediction({
            numbers: [1, 5, 10],
            signal: 'BET NOW',
            confidence: 90
        });

        expect(mp.pendingBet).toBeNull();
    });

    test('still updates lastBetAmount and lastBetNumbers even when paused', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = false;
        mp.sessionData.isSessionActive = true;

        mp.setPrediction({
            numbers: [1, 5, 10, 15, 20],
            signal: 'BET',
            confidence: 80
        });

        expect(mp.sessionData.lastBetNumbers).toBe(5);
        expect(mp.sessionData.lastBetAmount).toBeGreaterThan(0);
    });

    test('calls render() after setting prediction', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;
        const renderSpy = jest.spyOn(mp, 'render');

        mp.setPrediction({ numbers: [1, 2, 3], signal: 'BET', confidence: 80 });
        expect(renderSpy).toHaveBeenCalled();
        renderSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════
// calculateBetAmount() - edge cases
// ═══════════════════════════════════════════════════════

describe('calculateBetAmount() - edge cases', () => {
    test('returns strategy-based bet when bankroll is ample', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.currentBankroll = 4000;

        expect(mp.calculateBetAmount(10)).toBe(5);
    });

    test('caps bet when bankroll is very low', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 10;
        mp.sessionData.currentBankroll = 50;

        // maxBet = floor(50 / (10 * 2)) = floor(2.5) = 2
        expect(mp.calculateBetAmount(10)).toBe(2);
    });

    test('returns minimum $1 when calculated bet would be 0', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 0;
        mp.sessionData.currentBankroll = 4000;

        expect(mp.calculateBetAmount(12)).toBe(1);
    });

    test('returns minimum $1 when bankroll is extremely low', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 10;
        mp.sessionData.currentBankroll = 5;

        // maxBet = floor(5 / (10 * 2)) = floor(0.25) = 0
        // Math.max(1, 0) = 1
        expect(mp.calculateBetAmount(10)).toBe(1);
    });

    test('respects bankroll cap with large number count', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 100;
        mp.sessionData.currentBankroll = 200;

        // maxBet = floor(200 / (12 * 2)) = floor(8.33) = 8
        expect(mp.calculateBetAmount(12)).toBe(8);
    });

    test('returns currentBetPerNumber when exactly at limit', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 5;
        mp.sessionData.currentBankroll = 100;

        // maxBet = floor(100 / (10 * 2)) = 5
        expect(mp.calculateBetAmount(10)).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════
// updateFromPrediction()
// ═══════════════════════════════════════════════════════

describe('updateFromPrediction()', () => {
    test('null prediction resets lastBetAmount and clears pendingBet', () => {
        const mp = getPanel();
        mp.sessionData.lastBetAmount = 5;
        mp.pendingBet = { betAmount: 5, numbersCount: 10, predictedNumbers: [1] };

        mp.updateFromPrediction(null);

        expect(mp.sessionData.lastBetAmount).toBe(0);
        expect(mp.sessionData.lastBetNumbers).toBe(12);
        expect(mp.pendingBet).toBeNull();
    });

    test('prediction without bet_per_number resets state', () => {
        const mp = getPanel();
        mp.sessionData.lastBetAmount = 5;

        mp.updateFromPrediction({ numbers: [1, 2, 3] });

        expect(mp.sessionData.lastBetAmount).toBe(0);
        expect(mp.pendingBet).toBeNull();
    });

    test('valid prediction updates lastBetAmount from strategy', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 3;

        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: [1, 2, 3, 4, 5]
        });

        // Uses strategy-based bet (currentBetPerNumber=3), not backend bet_per_number
        expect(mp.sessionData.lastBetAmount).toBe(3);
        expect(mp.sessionData.lastBetNumbers).toBe(5);
    });

    test('stores pendingBet when session active and betting enabled', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.currentBetPerNumber = 2;

        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: [10, 15, 20, 25, 30]
        });

        expect(mp.pendingBet).not.toBeNull();
        expect(mp.pendingBet.betAmount).toBe(2);
        expect(mp.pendingBet.numbersCount).toBe(5);
        expect(mp.pendingBet.predictedNumbers).toEqual([10, 15, 20, 25, 30]);
    });

    test('does NOT store pendingBet when session inactive', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = false;
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.currentBetPerNumber = 2;

        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: [10, 15, 20]
        });

        expect(mp.pendingBet).toBeNull();
    });

    test('does NOT store pendingBet when betting disabled', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = false;
        mp.sessionData.currentBetPerNumber = 2;

        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: [10, 15, 20]
        });

        expect(mp.pendingBet).toBeNull();
    });

    test('falls back to $2/number when currentBetPerNumber is 0', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.currentBetPerNumber = 0;

        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: [10, 15, 20]
        });

        // currentBetPerNumber || 2 falls back to $2 when 0
        expect(mp.sessionData.lastBetAmount).toBe(2);
        expect(mp.pendingBet).not.toBeNull();
        expect(mp.pendingBet.betAmount).toBe(2);
    });

    test('clones the numbers array (not a reference)', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.currentBetPerNumber = 2;

        const originalNumbers = [10, 15, 20];
        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: originalNumbers
        });

        // Modify original array
        originalNumbers.push(99);

        // pendingBet should not be affected
        expect(mp.pendingBet.predictedNumbers).toEqual([10, 15, 20]);
        expect(mp.pendingBet.predictedNumbers).not.toContain(99);
    });

    test('calls render() after updating', () => {
        const mp = getPanel();
        const renderSpy = jest.spyOn(mp, 'render');

        mp.updateFromPrediction({
            bet_per_number: 2,
            numbers: [1, 2, 3]
        });

        expect(renderSpy).toHaveBeenCalled();
        renderSpy.mockRestore();
    });

    test('prediction with no numbers property defaults to 12 numbers', () => {
        const mp = getPanel();
        mp.sessionData.currentBetPerNumber = 2;

        mp.updateFromPrediction({
            bet_per_number: 2
            // no numbers property
        });

        expect(mp.sessionData.lastBetNumbers).toBe(12);
    });
});

// ═══════════════════════════════════════════════════════
// checkForNewSpin() - additional edge cases
// ═══════════════════════════════════════════════════════

describe('checkForNewSpin() - edge cases', () => {
    test('does nothing when session is not active', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = false;
        mp.lastSpinCount = 2;
        global.window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 3 }];

        mp.checkForNewSpin();

        expect(mp.lastSpinCount).toBe(2); // unchanged
    });

    test('does nothing when spins array is null', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 2;
        global.window.spins = null;
        global.window.spinData = null;

        mp.checkForNewSpin();
        expect(mp.lastSpinCount).toBe(2);
    });

    test('does nothing when spins is not an array', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 2;
        global.window.spins = 'not an array';

        mp.checkForNewSpin();
        expect(mp.lastSpinCount).toBe(2);
    });

    test('does nothing on first call (lastSpinCount = 0)', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 0;
        mp.pendingBet = { betAmount: 2, numbersCount: 5, predictedNumbers: [1, 2, 3, 4, 5] };
        global.window.spins = [{ actual: 1 }, { actual: 2 }];

        mp.checkForNewSpin();

        // Should update lastSpinCount but not process bet
        expect(mp.lastSpinCount).toBe(2);
        expect(mp.pendingBet).not.toBeNull(); // not cleared
        expect(mp.sessionData.totalBets).toBe(0); // no bet recorded
    });

    test('records HIT when actual number is in predicted list', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.currentBankroll = 4000;
        mp.lastSpinCount = 2;
        mp.pendingBet = {
            betAmount: 2,
            numbersCount: 5,
            predictedNumbers: [10, 15, 20, 25, 30]
        };

        global.window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 20 }];
        mp.checkForNewSpin();

        expect(mp.sessionData.totalWins).toBe(1);
        expect(mp.sessionData.totalBets).toBe(1);
        expect(mp.pendingBet).toBeNull();
    });

    test('records MISS when actual number is NOT in predicted list', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.sessionData.currentBankroll = 4000;
        mp.lastSpinCount = 2;
        mp.pendingBet = {
            betAmount: 2,
            numbersCount: 5,
            predictedNumbers: [10, 15, 20, 25, 30]
        };

        global.window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 7 }];
        mp.checkForNewSpin();

        expect(mp.sessionData.totalLosses).toBe(1);
        expect(mp.sessionData.totalBets).toBe(1);
    });

    test('no bet recorded when pendingBet is null', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 2;
        mp.pendingBet = null;

        global.window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 20 }];
        mp.checkForNewSpin();

        expect(mp.sessionData.totalBets).toBe(0);
    });

    test('no bet recorded when pendingBet betAmount is 0', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 2;
        mp.pendingBet = {
            betAmount: 0,
            numbersCount: 5,
            predictedNumbers: [10, 15, 20, 25, 30]
        };

        global.window.spins = [{ actual: 1 }, { actual: 2 }, { actual: 20 }];
        mp.checkForNewSpin();

        expect(mp.sessionData.totalBets).toBe(0);
    });

    test('updates lastSpinCount after processing', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 3;
        mp.pendingBet = null;

        global.window.spins = [
            { actual: 1 }, { actual: 2 }, { actual: 3 }, { actual: 4 }, { actual: 5 }
        ];
        mp.checkForNewSpin();

        expect(mp.lastSpinCount).toBe(5);
    });

    test('uses window.spinData as fallback when window.spins is falsy', () => {
        const mp = getPanel();
        mp.sessionData.isSessionActive = true;
        mp.lastSpinCount = 1;
        mp.pendingBet = {
            betAmount: 2,
            numbersCount: 3,
            predictedNumbers: [10, 15, 20]
        };

        global.window.spins = undefined;
        global.window.spinData = [{ actual: 1 }, { actual: 10 }];

        mp.checkForNewSpin();

        expect(mp.sessionData.totalBets).toBe(1);
        expect(mp.sessionData.totalWins).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════
// recordBetResult() - bet history tracking details
// ═══════════════════════════════════════════════════════

describe('recordBetResult() - bet history tracking', () => {
    test('adds entry to betHistory on win', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);

        expect(mp.betHistory.length).toBe(1);
        expect(mp.betHistory[0].hit).toBe(true);
        expect(mp.betHistory[0].actualNumber).toBe(15);
        expect(mp.betHistory[0].betAmount).toBe(2);
        expect(mp.betHistory[0].totalBet).toBe(20);
    });

    test('adds entry to betHistory on loss', async () => {
        const mp = getPanel();
        await mp.recordBetResult(3, 8, false, 7);

        expect(mp.betHistory.length).toBe(1);
        expect(mp.betHistory[0].hit).toBe(false);
        expect(mp.betHistory[0].actualNumber).toBe(7);
        expect(mp.betHistory[0].betAmount).toBe(3);
        expect(mp.betHistory[0].totalBet).toBe(24);
    });

    test('bet history entry has correct netChange for win', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);

        // Win: 2*35 - 2*10 = 70 - 20 = 50
        expect(mp.betHistory[0].netChange).toBe(50);
    });

    test('bet history entry has correct netChange for loss', async () => {
        const mp = getPanel();
        await mp.recordBetResult(3, 8, false, 7);

        // Loss: -(3*8) = -24
        expect(mp.betHistory[0].netChange).toBe(-24);
    });

    test('newest bet is added to front of array (unshift)', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);
        await mp.recordBetResult(3, 8, false, 7);

        expect(mp.betHistory[0].actualNumber).toBe(7);  // most recent
        expect(mp.betHistory[1].actualNumber).toBe(15); // older
    });

    test('bet history entry has spin number', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);

        expect(mp.betHistory[0].spin).toBe(1); // totalBets incremented to 1
    });

    test('spin number increments with each bet', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);
        await mp.recordBetResult(2, 10, false, 7);
        await mp.recordBetResult(2, 10, true, 3);

        // Newest first: spin 3, 2, 1
        expect(mp.betHistory[0].spin).toBe(3);
        expect(mp.betHistory[1].spin).toBe(2);
        expect(mp.betHistory[2].spin).toBe(1);
    });

    test('bet history entry has a timestamp', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);

        expect(mp.betHistory[0].timestamp).toBeDefined();
        expect(typeof mp.betHistory[0].timestamp).toBe('string');
        expect(mp.betHistory[0].timestamp.length).toBeGreaterThan(0);
    });

    test('caps betHistory at 10 entries', async () => {
        const mp = getPanel();

        for (let i = 0; i < 15; i++) {
            await mp.recordBetResult(2, 10, false, i);
        }

        expect(mp.betHistory.length).toBe(10);
    });

    test('oldest entries are dropped when capped at 10', async () => {
        const mp = getPanel();

        for (let i = 1; i <= 12; i++) {
            await mp.recordBetResult(2, 10, false, i);
        }

        // Bet history is newest first, so betHistory[0] = spin 12
        // After 12 inserts, only 10 kept: spins 12..3
        expect(mp.betHistory.length).toBe(10);
        expect(mp.betHistory[0].spin).toBe(12); // newest
        expect(mp.betHistory[9].spin).toBe(3);  // oldest kept
    });

    test('recordBetResult tracks spinsWithBets when spins exist', async () => {
        const mp = getPanel();
        global.window.spins = [{ actual: 5 }, { actual: 10 }];

        await mp.recordBetResult(2, 10, true, 15);

        expect(mp.sessionData.spinsWithBets).toContain(2);
    });

    test('recordBetResult calls render()', async () => {
        const mp = getPanel();
        const renderSpy = jest.spyOn(mp, 'render');

        await mp.recordBetResult(2, 10, true, 15);

        expect(renderSpy).toHaveBeenCalled();
        renderSpy.mockRestore();
    });

    test('WIN updates bankroll correctly', async () => {
        const mp = getPanel();
        mp.sessionData.currentBankroll = 4000;
        mp.sessionData.sessionProfit = 0;

        await mp.recordBetResult(2, 10, true, 15);

        // Win: 2*35=70, total bet=20, net=+50
        expect(mp.sessionData.currentBankroll).toBe(4050);
        expect(mp.sessionData.sessionProfit).toBe(50);
        expect(mp.sessionData.totalWins).toBe(1);
        expect(mp.sessionData.consecutiveLosses).toBe(0);
    });

    test('LOSS updates bankroll correctly', async () => {
        const mp = getPanel();
        mp.sessionData.currentBankroll = 4000;
        mp.sessionData.sessionProfit = 0;

        await mp.recordBetResult(2, 10, false, 15);

        // Loss: net = -(2*10) = -20
        expect(mp.sessionData.currentBankroll).toBe(3980);
        expect(mp.sessionData.sessionProfit).toBe(-20);
        expect(mp.sessionData.totalLosses).toBe(1);
    });

    test('consecutive losses increment on loss, reset on win', async () => {
        const mp = getPanel();

        await mp.recordBetResult(2, 10, false, 1);
        await mp.recordBetResult(2, 10, false, 2);
        expect(mp.sessionData.consecutiveLosses).toBe(2);

        await mp.recordBetResult(2, 10, true, 5);
        expect(mp.sessionData.consecutiveLosses).toBe(0);
    });

    test('consecutive wins increment on win, reset on loss', async () => {
        const mp = getPanel();
        mp.sessionData.bettingStrategy = 1; // Use Aggressive (no counter reset)

        await mp.recordBetResult(2, 10, true, 1);
        await mp.recordBetResult(2, 10, true, 2);
        expect(mp.sessionData.consecutiveWins).toBe(2);

        await mp.recordBetResult(2, 10, false, 5);
        expect(mp.sessionData.consecutiveWins).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════
// render() called from recordBetResult - integration
// ═══════════════════════════════════════════════════════

describe('render() integration after recordBetResult', () => {
    test('DOM reflects profit after a win', async () => {
        const mp = getPanel();
        mp.sessionData.currentBankroll = 4000;
        mp.sessionData.isSessionActive = true;

        await mp.recordBetResult(2, 10, true, 15);

        const profitEl = document.getElementById('profitValue');
        expect(profitEl.textContent).toBe('+$50');
        expect(profitEl.classList.contains('profit')).toBe(true);
    });

    test('DOM reflects loss after a miss', async () => {
        const mp = getPanel();
        mp.sessionData.currentBankroll = 4000;
        mp.sessionData.isSessionActive = true;

        await mp.recordBetResult(2, 10, false, 7);

        const profitEl = document.getElementById('profitValue');
        expect(profitEl.textContent).toBe('-$20');
        expect(profitEl.classList.contains('loss')).toBe(true);
    });

    test('DOM shows updated total bets count', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);
        await mp.recordBetResult(2, 10, false, 7);

        const el = document.getElementById('totalBetsValue');
        expect(el.textContent).toBe('2');
    });

    test('DOM shows updated win rate after bets', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);  // 1 win
        await mp.recordBetResult(2, 10, false, 7);   // 1 loss

        const el = document.getElementById('winRateValue');
        expect(el.textContent).toBe('50.0%');
    });

    test('bet history list updates in DOM after bets', async () => {
        const mp = getPanel();
        await mp.recordBetResult(2, 10, true, 15);

        const historyEl = document.getElementById('betHistoryList');
        expect(historyEl.innerHTML).toContain('\u2705');
        expect(historyEl.innerHTML).toContain('15');
    });
});

// ═══════════════════════════════════════════════════════
// createPanel() - DOM creation
// ═══════════════════════════════════════════════════════

describe('createPanel() - DOM creation', () => {
    test('creates moneyPanel element in DOM', () => {
        const mp = getPanel();
        const panel = document.getElementById('moneyPanel');
        expect(panel).not.toBeNull();
    });

    test('creates panel with "expanded" class initially', () => {
        const mp = getPanel();
        const panel = document.getElementById('moneyPanel');
        expect(panel.classList.contains('expanded')).toBe(true);
    });

    test('creates toggle button', () => {
        const mp = getPanel();
        const btn = document.getElementById('toggleMoneyPanel');
        expect(btn).not.toBeNull();
    });

    test('creates betting toggle button', () => {
        const mp = getPanel();
        const btn = document.getElementById('toggleBettingBtn');
        expect(btn).not.toBeNull();
    });

    test('creates strategy toggle button', () => {
        const mp = getPanel();
        const btn = document.getElementById('toggleStrategyBtn');
        expect(btn).not.toBeNull();
    });

    test('creates betting status display', () => {
        const mp = getPanel();
        const status = document.getElementById('bettingStatus');
        expect(status).not.toBeNull();
    });
});

// ═══════════════════════════════════════════════════════
// setupBettingControl() - button listeners
// ═══════════════════════════════════════════════════════

describe('setupBettingControl() - button listeners', () => {
    test('betting button click toggles betting state', () => {
        const mp = getPanel();
        expect(mp.sessionData.isBettingEnabled).toBe(false);

        const btn = document.getElementById('toggleBettingBtn');
        btn.click();
        jest.runAllTimers();

        expect(mp.sessionData.isBettingEnabled).toBe(true);
    });

    test('strategy button click cycles strategy', () => {
        const mp = getPanel();
        expect(mp.sessionData.bettingStrategy).toBe(3);

        const btn = document.getElementById('toggleStrategyBtn');
        btn.click();

        expect(mp.sessionData.bettingStrategy).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════
// recordBetResult() — AI engine feedback loop
// ═══════════════════════════════════════════════════════

describe('recordBetResult() - AI engine feedback loop', () => {
    test('calls engine.recordResult() when engine is available and enabled', async () => {
        const mp = getPanel();
        const mockRecordResult = jest.fn();
        global.window.aiAutoEngine = {
            isTrained: true,
            isEnabled: true,
            lastDecision: {
                selectedPair: 'prev',
                selectedFilter: 'zero_positive',
                numbers: [5, 10, 15]
            },
            recordResult: mockRecordResult
        };

        await mp.recordBetResult(2, 10, true, 15);

        expect(mockRecordResult).toHaveBeenCalledWith(
            'prev', 'zero_positive', true, 15, [5, 10, 15]
        );
    });

    test('passes correct pairKey, filterKey, hit, actual, and numbers', async () => {
        const mp = getPanel();
        const mockRecordResult = jest.fn();
        global.window.aiAutoEngine = {
            isTrained: true,
            isEnabled: true,
            lastDecision: {
                selectedPair: 'prevPlus1',
                selectedFilter: 'nineteen_negative',
                numbers: [1, 2, 3, 4]
            },
            recordResult: mockRecordResult
        };

        await mp.recordBetResult(3, 8, false, 7);

        expect(mockRecordResult).toHaveBeenCalledWith(
            'prevPlus1', 'nineteen_negative', false, 7, [1, 2, 3, 4]
        );
    });

    test('does NOT call engine when engine is null', async () => {
        const mp = getPanel();
        global.window.aiAutoEngine = null;

        // Should not throw
        await expect(mp.recordBetResult(2, 10, true, 15)).resolves.toBeUndefined();
    });

    test('does NOT call engine when engine.isEnabled is false', async () => {
        const mp = getPanel();
        const mockRecordResult = jest.fn();
        global.window.aiAutoEngine = {
            isTrained: true,
            isEnabled: false,
            lastDecision: {
                selectedPair: 'prev',
                selectedFilter: 'both_both',
                numbers: [5, 10]
            },
            recordResult: mockRecordResult
        };

        await mp.recordBetResult(2, 10, true, 15);

        expect(mockRecordResult).not.toHaveBeenCalled();
    });

    test('does NOT call engine when lastDecision is null', async () => {
        const mp = getPanel();
        const mockRecordResult = jest.fn();
        global.window.aiAutoEngine = {
            isTrained: true,
            isEnabled: true,
            lastDecision: null,
            recordResult: mockRecordResult
        };

        await mp.recordBetResult(2, 10, false, 7);

        expect(mockRecordResult).not.toHaveBeenCalled();
    });

    test('clears lastDecision after consuming it', async () => {
        const mp = getPanel();
        const engine = {
            isTrained: true,
            isEnabled: true,
            lastDecision: {
                selectedPair: 'prevMinus1',
                selectedFilter: 'zero_negative',
                numbers: [8, 9, 10]
            },
            recordResult: jest.fn()
        };
        global.window.aiAutoEngine = engine;

        await mp.recordBetResult(2, 10, true, 10);

        expect(engine.lastDecision).toBeNull();
    });

    test('still works normally without engine (backward compatible)', async () => {
        const mp = getPanel();
        global.window.aiAutoEngine = undefined;
        mp.sessionData.currentBankroll = 4000;

        await mp.recordBetResult(2, 10, true, 15);

        // P&L still calculated: 2*35 - 2*10 = 50
        expect(mp.sessionData.sessionProfit).toBe(50);
        expect(mp.sessionData.totalWins).toBe(1);
        expect(mp.sessionData.totalBets).toBe(1);
    });

    test('handles engine.recordResult throwing (catches error)', async () => {
        const mp = getPanel();
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        global.window.aiAutoEngine = {
            isTrained: true,
            isEnabled: true,
            lastDecision: {
                selectedPair: 'prev',
                selectedFilter: 'both_both',
                numbers: [5]
            },
            recordResult: jest.fn().mockImplementation(() => { throw new Error('engine boom'); })
        };
        mp.sessionData.currentBankroll = 4000;

        await mp.recordBetResult(2, 10, false, 7);

        // Should not throw — error caught internally
        expect(mp.sessionData.totalLosses).toBe(1);
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to update AI engine'),
            expect.anything()
        );
        consoleSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════════════
// setPrediction() — AI AUTO SKIP guard
// ═══════════════════════════════════════════════════════

describe('setPrediction() - AI AUTO SKIP guard', () => {
    test('returns early when AI engine is enabled and lastDecision is null (SKIP)', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;
        global.window.aiAutoEngine = { isEnabled: true, lastDecision: null };

        mp.setPrediction({ numbers: [1, 5, 10, 15, 20], signal: 'BET', confidence: 90 });
        expect(mp.pendingBet).toBeNull();
    });

    test('creates pendingBet when engine is enabled and lastDecision has value (BET)', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;
        global.window.aiAutoEngine = {
            isEnabled: true,
            lastDecision: { selectedPair: 'prev', selectedFilter: 'zero_positive', numbers: [1, 5, 10] }
        };

        mp.setPrediction({ numbers: [1, 5, 10], signal: 'BET', confidence: 90 });
        expect(mp.pendingBet).not.toBeNull();
    });

    test('creates pendingBet normally when engine is not enabled (manual mode)', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;
        global.window.aiAutoEngine = { isEnabled: false, lastDecision: null };

        mp.setPrediction({ numbers: [1, 5, 10], signal: 'BET', confidence: 80 });
        expect(mp.pendingBet).not.toBeNull();
    });

    test('creates pendingBet normally when no AI engine exists', () => {
        const mp = getPanel();
        mp.sessionData.isBettingEnabled = true;
        mp.sessionData.isSessionActive = true;
        global.window.aiAutoEngine = undefined;

        mp.setPrediction({ numbers: [1, 5, 10], signal: 'BET', confidence: 80 });
        expect(mp.pendingBet).not.toBeNull();
    });
});
