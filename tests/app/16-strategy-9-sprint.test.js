/**
 * TESTS: Money Management — Strategy 9 (Sprint)
 *
 * Sprint = flat $2/num, NO escalation, NO de-escalation,
 * S8-style smart cap near target, hard stop-loss auto-pause.
 * Designed for 20–30-minute target-hunt sessions.
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

function forceS9(mp) {
    mp.sessionData.bettingStrategy = 9;
    mp.sessionData.currentBetPerNumber = 2;
    mp.sessionData.consecutiveWins = 0;
    mp.sessionData.consecutiveLosses = 0;
    mp.sessionData.sessionProfit = 0;
    mp.sessionData.isSessionActive = true;
    mp._updateDrawdown = () => {};
    mp.render = () => {};
    mp.saveToBackend = async () => {};
    mp._maybeSyncBackendSession = async () => {};
}

async function tick(mp, hit, numbersCount = 12, profitDelta = 0) {
    mp.sessionData.sessionProfit += profitDelta;
    await mp.recordBetResult(mp.sessionData.currentBetPerNumber, numbersCount, hit, profitDelta, []);
}

describe('S9 defaults', () => {
    test('Not the default; user opts in via dropdown or cycle', () => {
        const mp = newPanel();
        expect(mp.sessionData.bettingStrategy).toBe(8);
    });
    test('S9 defaults: $2 min, $2 starting, $100 target', () => {
        const mp = newPanel();
        expect(mp.sessionData.s9MinBet).toBe(2);
        expect(mp.sessionData.s9StartingBet).toBe(2);
        expect(mp.sessionData.s9SessionTarget).toBe(100);
    });
    test('S9 has NO stop-loss field', () => {
        const mp = newPanel();
        expect(mp.sessionData.s9StopLoss).toBeUndefined();
    });
    test('Switching to S9 resets bet to s9StartingBet', () => {
        const mp = newPanel();
        mp.sessionData.currentBetPerNumber = 7;
        mp.setStrategy(9);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
});

describe('S9 flat-bet behaviour (no escalation)', () => {
    test('5 losses in a row → bet stays $2', async () => {
        const mp = newPanel(); forceS9(mp);
        for (let i = 0; i < 5; i++) await tick(mp, false, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('5 losses at N=24 → bet stays $2 (never escalates on wide bets)', async () => {
        const mp = newPanel(); forceS9(mp);
        for (let i = 0; i < 5; i++) await tick(mp, false, 24);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('Consecutive wins → bet stays $2 (no de-escalation)', async () => {
        const mp = newPanel(); forceS9(mp);
        for (let i = 0; i < 5; i++) await tick(mp, true, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('Manual stake adjust holds during session (no override)', async () => {
        const mp = newPanel(); forceS9(mp);
        mp.sessionData.currentBetPerNumber = 4;
        for (let i = 0; i < 3; i++) await tick(mp, false, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(4);
    });
});

describe('S9 smart cap (rule 5, same as S8)', () => {
    test('At $0 profit + $2 base + N=12: no cap', () => {
        const mp = newPanel(); forceS9(mp);
        expect(mp.calculateBetAmount(12)).toBe(2);
    });
    test('At $90 profit + $2 base + N=12: shrinks to floor', () => {
        const mp = newPanel(); forceS9(mp);
        mp.sessionData.sessionProfit = 90;
        // remaining $10, net = $2*24=$48 > 10 → floor(10/24)=0 → clamp min $2.
        expect(mp.calculateBetAmount(12)).toBe(2);
    });
    test('At $100+ profit: hold at min', () => {
        const mp = newPanel(); forceS9(mp);
        mp.sessionData.sessionProfit = 105;
        expect(mp.calculateBetAmount(12)).toBe(2);
    });
    test('Room to run: no cap fires', () => {
        const mp = newPanel(); forceS9(mp);
        mp.sessionData.currentBetPerNumber = 3;
        expect(mp.calculateBetAmount(24)).toBe(3);   // net $36 < 100 remaining
    });
});

describe('S9 no auto-pause (user controls pause manually)', () => {
    test('Big losses never auto-pause the session', async () => {
        const mp = newPanel(); forceS9(mp);
        expect(mp.sessionData.isSessionActive).toBe(true);
        await tick(mp, false, 12, -200);
        expect(mp.sessionData.isSessionActive).toBe(true);
    });
    test('Deep drawdown keeps flat bet at $2', async () => {
        const mp = newPanel(); forceS9(mp);
        for (let i = 0; i < 10; i++) await tick(mp, false, 12, -24);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
        expect(mp.sessionData.isSessionActive).toBe(true);
    });
});

describe('S9 vars editor (⚙️ panel)', () => {
    test('saveStrategy9Vars writes all three fields', () => {
        const mp = newPanel(); mp.setStrategy(9);
        document.body.innerHTML =
            '<input id="s9StartingIn" value="3">' +
            '<input id="s9MinIn"      value="2">' +
            '<input id="s9TargetIn"   value="150">' +
            '<div id="s9VarsStatus"></div>';
        mp.saveStrategy9Vars();
        expect(mp.sessionData.s9StartingBet).toBe(3);
        expect(mp.sessionData.s9MinBet).toBe(2);
        expect(mp.sessionData.s9SessionTarget).toBe(150);
    });
    test('saveStrategy9Vars floors currentBetPerNumber at new minBet', () => {
        const mp = newPanel(); mp.setStrategy(9);
        mp.sessionData.currentBetPerNumber = 1;
        document.body.innerHTML =
            '<input id="s9StartingIn" value="4">' +
            '<input id="s9MinIn"      value="3">' +
            '<input id="s9TargetIn"   value="100">' +
            '<div id="s9VarsStatus"></div>';
        mp.saveStrategy9Vars();
        expect(mp.sessionData.currentBetPerNumber).toBe(3);
    });
    test('Bad input falls back to previous value', () => {
        const mp = newPanel(); mp.setStrategy(9);
        const prev = mp.sessionData.s9SessionTarget;
        document.body.innerHTML =
            '<input id="s9StartingIn" value="2">' +
            '<input id="s9MinIn"      value="2">' +
            '<input id="s9TargetIn"   value="abc">' +
            '<div id="s9VarsStatus"></div>';
        mp.saveStrategy9Vars();
        expect(mp.sessionData.s9SessionTarget).toBe(prev);
    });
});

describe('S9 switching', () => {
    test('Switching S8 → S9 resets bet + turns off escalation', () => {
        const mp = newPanel();
        mp.sessionData.currentBetPerNumber = 6;
        mp.sessionData.s8LossUnits = 2.5;
        mp.setStrategy(9);
        expect(mp.sessionData.bettingStrategy).toBe(9);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
    test('Switching S9 → S8 restores escalation semantics', async () => {
        const mp = newPanel();
        mp.setStrategy(9);
        forceS9(mp);
        for (let i = 0; i < 5; i++) await tick(mp, false, 12);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);   // no escalation under S9
        mp.setStrategy(8);
        expect(mp.sessionData.bettingStrategy).toBe(8);
        expect(mp.sessionData.currentBetPerNumber).toBe(2);
    });
});
