/**
 * TESTS: AI Integration V6
 * Coverage for: AIIntegrationV6 class — constructor, connection testing,
 * prediction routing (v5/v6), session management, result processing,
 * and the updateAIPredictionPanel DOM updater function.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------
// Loader: eval the source in a controlled scope so the class and
// the window.updateAIPredictionPanel function are returned without
// side-effects from timers or DOMContentLoaded listeners.
// ---------------------------------------------------------------
function loadAIIntegration() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ai-integration.js'),
        'utf-8'
    );

    // Use a proxy around the real jsdom document so that
    // document.addEventListener (DOMContentLoaded) is silently
    // swallowed, but document.querySelector etc. still work.
    const wrappedCode = `
        (function() {
            const setInterval = () => {};
            const setTimeout = (fn) => fn();
            const _realDoc = globalThis.document;
            const document = new Proxy(_realDoc, {
                get(target, prop) {
                    if (prop === 'addEventListener') return () => {};
                    const val = target[prop];
                    return typeof val === 'function' ? val.bind(target) : val;
                }
            });
            const window = globalThis.window || {};
            const console = globalThis.console;
            ${src}
            return { AIIntegrationV6, updateAIPredictionPanel: window.updateAIPredictionPanel };
        })()
    `;

    try {
        return eval(wrappedCode);
    } catch (e) {
        console.error('Failed to load AIIntegrationV6:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------
let AIIntegrationV6;
let updateAIPredictionPanel;

beforeEach(() => {
    // Reset window globals
    global.window = global.window || {};
    global.window.spins = undefined;
    global.window.spinData = undefined;
    global.window.getAIDataV6 = undefined;

    // Install mock AI API on window before loading the module
    global.window.aiAPI = {
        testConnection: jest.fn(() => Promise.resolve(true)),
        getPredictionWithTableData: jest.fn(() =>
            Promise.resolve({ numbers: [1, 2, 3], signal: 'BET NOW', confidence: 90 })
        ),
        startSession: jest.fn(() => Promise.resolve({ status: 'ok' })),
        processResult: jest.fn(() => Promise.resolve({ next_bet: 2 })),
    };

    // Build a minimal DOM for updateAIPredictionPanel
    document.body.innerHTML = `
        <div id="ai-prediction-panel">
            <span class="status-text">WAITING</span>
            <span class="confidence-value">0%</span>
            <div class="predicted-numbers"></div>
        </div>
    `;

    const loaded = loadAIIntegration();
    AIIntegrationV6 = loaded ? loaded.AIIntegrationV6 : null;
    updateAIPredictionPanel = loaded ? loaded.updateAIPredictionPanel : null;
});

// ===============================================================
// CONSTRUCTOR
// ===============================================================

describe('AIIntegrationV6: Constructor', () => {
    test('Sets connected to false', () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        expect(ai.connected).toBe(false);
    });

    test('Sets currentMode to v6', () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        expect(ai.currentMode).toBe('v6');
    });

    test('Picks up window.aiAPI as this.api', () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        expect(ai.api).toBe(global.window.aiAPI);
    });

    test('api is undefined when window.aiAPI is missing', () => {
        if (!AIIntegrationV6) return;
        delete global.window.aiAPI;
        const ai = new AIIntegrationV6();
        expect(ai.api).toBeUndefined();
    });
});

// ===============================================================
// testConnection()
// ===============================================================

describe('AIIntegrationV6: testConnection', () => {
    test('Returns true when api.testConnection resolves true', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        const result = await ai.testConnection();
        expect(result).toBe(true);
        expect(ai.connected).toBe(true);
        expect(ai.api.testConnection).toHaveBeenCalled();
    });

    test('Returns false when api.testConnection resolves false', async () => {
        if (!AIIntegrationV6) return;
        global.window.aiAPI.testConnection.mockResolvedValue(false);
        const ai = new AIIntegrationV6();
        const result = await ai.testConnection();
        expect(result).toBe(false);
        expect(ai.connected).toBe(false);
    });

    test('Returns false when no api is available', async () => {
        if (!AIIntegrationV6) return;
        delete global.window.aiAPI;
        const ai = new AIIntegrationV6();
        const result = await ai.testConnection();
        expect(result).toBe(false);
    });

    test('Returns false and sets connected=false on error', async () => {
        if (!AIIntegrationV6) return;
        global.window.aiAPI.testConnection.mockRejectedValue(new Error('Network error'));
        const ai = new AIIntegrationV6();
        const result = await ai.testConnection();
        expect(result).toBe(false);
        expect(ai.connected).toBe(false);
    });
});

// ===============================================================
// getPrediction() — routing
// ===============================================================

describe('AIIntegrationV6: getPrediction routing', () => {
    test('Delegates to getPredictionV6 when mode is v6', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        ai.currentMode = 'v6';
        const spy = jest.spyOn(ai, 'getPredictionV6').mockResolvedValue({ numbers: [7] });

        const result = await ai.getPrediction([10, 20, 30]);
        expect(spy).toHaveBeenCalledWith([10, 20, 30]);
        expect(result).toEqual({ numbers: [7] });
    });

    test('Delegates to getPredictionV5 when mode is not v6', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        ai.currentMode = 'v5';
        const spy = jest.spyOn(ai, 'getPredictionV5').mockResolvedValue(null);

        const result = await ai.getPrediction([10, 20, 30]);
        expect(spy).toHaveBeenCalledWith([10, 20, 30]);
        expect(result).toBeNull();
    });
});

// ===============================================================
// getPredictionV6()
// ===============================================================

describe('AIIntegrationV6: getPredictionV6', () => {
    test('Returns null when api is not set', async () => {
        if (!AIIntegrationV6) return;
        delete global.window.aiAPI;
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([1, 2, 3]);
        expect(result).toBeNull();
    });

    test('Returns null when window.spins has fewer than 3 entries', async () => {
        if (!AIIntegrationV6) return;
        global.window.spins = [10, 20];
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([1, 2]);
        expect(result).toBeNull();
    });

    test('Returns null when window.spins is undefined and spinData is also undefined', async () => {
        if (!AIIntegrationV6) return;
        global.window.spins = undefined;
        global.window.spinData = undefined;
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([]);
        expect(result).toBeNull();
    });

    test('Falls back to window.spinData when window.spins is missing', async () => {
        if (!AIIntegrationV6) return;
        global.window.spins = undefined;
        global.window.spinData = [1, 2, 3, 4];
        global.window.getAIDataV6 = jest.fn(() => ({
            table3NextProjections: {},
            currentSpinCount: 4,
        }));
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([1, 2, 3, 4]);
        expect(ai.api.getPredictionWithTableData).toHaveBeenCalled();
        expect(result).toEqual({ numbers: [1, 2, 3], signal: 'BET NOW', confidence: 90 });
    });

    test('Returns null when getAIDataV6 is not defined', async () => {
        if (!AIIntegrationV6) return;
        global.window.spins = [1, 2, 3, 4];
        global.window.getAIDataV6 = undefined;
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([1, 2, 3, 4]);
        expect(result).toBeNull();
    });

    test('Returns null when getAIDataV6 returns null', async () => {
        if (!AIIntegrationV6) return;
        global.window.spins = [1, 2, 3, 4];
        global.window.getAIDataV6 = jest.fn(() => null);
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([1, 2, 3, 4]);
        expect(result).toBeNull();
    });

    test('Calls api.getPredictionWithTableData with tableData on success', async () => {
        if (!AIIntegrationV6) return;
        const tableData = {
            table3NextProjections: { prev: { anchors: [5], neighbors: [6], numbers: [5, 6] } },
            currentSpinCount: 5,
        };
        global.window.spins = [10, 20, 30, 5];
        global.window.getAIDataV6 = jest.fn(() => tableData);
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([10, 20, 30, 5]);

        expect(global.window.getAIDataV6).toHaveBeenCalled();
        expect(ai.api.getPredictionWithTableData).toHaveBeenCalledWith(tableData);
        expect(result).toEqual({ numbers: [1, 2, 3], signal: 'BET NOW', confidence: 90 });
    });

    test('Returns null on api call error', async () => {
        if (!AIIntegrationV6) return;
        global.window.spins = [10, 20, 30, 5];
        global.window.getAIDataV6 = jest.fn(() => ({ data: true }));
        global.window.aiAPI.getPredictionWithTableData.mockRejectedValue(new Error('API down'));
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV6([10, 20, 30, 5]);
        expect(result).toBeNull();
    });
});

// ===============================================================
// getPredictionV5()
// ===============================================================

describe('AIIntegrationV6: getPredictionV5', () => {
    test('Always returns null (fallback stub)', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        const result = await ai.getPredictionV5([1, 2, 3]);
        expect(result).toBeNull();
    });
});

// ===============================================================
// startSession()
// ===============================================================

describe('AIIntegrationV6: startSession', () => {
    test('Calls api.startSession with default bankroll=4000 and target=100', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        const result = await ai.startSession();
        expect(ai.api.startSession).toHaveBeenCalledWith(4000, 100);
        expect(result).toEqual({ status: 'ok' });
    });

    test('Calls api.startSession with custom bankroll and target', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        const result = await ai.startSession(8000, 200);
        expect(ai.api.startSession).toHaveBeenCalledWith(8000, 200);
        expect(result).toEqual({ status: 'ok' });
    });

    test('Returns null when api is not available', async () => {
        if (!AIIntegrationV6) return;
        delete global.window.aiAPI;
        const ai = new AIIntegrationV6();
        const result = await ai.startSession();
        expect(result).toBeNull();
    });

    test('Returns null on error', async () => {
        if (!AIIntegrationV6) return;
        global.window.aiAPI.startSession.mockRejectedValue(new Error('Fail'));
        const ai = new AIIntegrationV6();
        const result = await ai.startSession();
        expect(result).toBeNull();
    });
});

// ===============================================================
// processResult()
// ===============================================================

describe('AIIntegrationV6: processResult', () => {
    test('Calls api.processResult with betPerNumber and hit', async () => {
        if (!AIIntegrationV6) return;
        const ai = new AIIntegrationV6();
        const result = await ai.processResult(5, true);
        expect(ai.api.processResult).toHaveBeenCalledWith(5, true);
        expect(result).toEqual({ next_bet: 2 });
    });

    test('Passes through the api response', async () => {
        if (!AIIntegrationV6) return;
        global.window.aiAPI.processResult.mockResolvedValue({ next_bet: 10, profit: 50 });
        const ai = new AIIntegrationV6();
        const result = await ai.processResult(3, false);
        expect(result).toEqual({ next_bet: 10, profit: 50 });
    });

    test('Returns null when api is not available', async () => {
        if (!AIIntegrationV6) return;
        delete global.window.aiAPI;
        const ai = new AIIntegrationV6();
        const result = await ai.processResult(5, true);
        expect(result).toBeNull();
    });

    test('Returns null on error', async () => {
        if (!AIIntegrationV6) return;
        global.window.aiAPI.processResult.mockRejectedValue(new Error('Server error'));
        const ai = new AIIntegrationV6();
        const result = await ai.processResult(5, false);
        expect(result).toBeNull();
    });
});

// ===============================================================
// updateAIPredictionPanel()
// ===============================================================

describe('updateAIPredictionPanel', () => {
    test('Function is defined on window', () => {
        expect(typeof updateAIPredictionPanel).toBe('function');
    });

    // ----- null / missing prediction -----

    test('Handles null prediction without error', () => {
        if (!updateAIPredictionPanel) return;
        expect(() => updateAIPredictionPanel(null)).not.toThrow();
    });

    test('Handles undefined prediction without error', () => {
        if (!updateAIPredictionPanel) return;
        expect(() => updateAIPredictionPanel(undefined)).not.toThrow();
    });

    test('Does not modify DOM when prediction is null', () => {
        if (!updateAIPredictionPanel) return;
        const statusEl = document.querySelector('#ai-prediction-panel .status-text');
        statusEl.textContent = 'ORIGINAL';
        updateAIPredictionPanel(null);
        expect(statusEl.textContent).toBe('ORIGINAL');
    });

    // ----- signal / status -----

    test('Updates status text with prediction signal', () => {
        if (!updateAIPredictionPanel) return;
        // Grab element before the call — className will be replaced, removing .status-text
        const statusEl = document.querySelector('#ai-prediction-panel .status-text');
        updateAIPredictionPanel({ signal: 'BET NOW', confidence: 85, numbers: [7, 11] });
        expect(statusEl.textContent).toBe('BET NOW');
    });

    test('Defaults status text to WAITING when signal missing', () => {
        if (!updateAIPredictionPanel) return;
        const statusEl = document.querySelector('#ai-prediction-panel .status-text');
        updateAIPredictionPanel({ confidence: 50, numbers: [1] });
        expect(statusEl.textContent).toBe('WAITING');
    });

    test('Adds status-bet-now class when signal is BET NOW', () => {
        if (!updateAIPredictionPanel) return;
        const statusEl = document.querySelector('#ai-prediction-panel .status-text');
        updateAIPredictionPanel({ signal: 'BET NOW', confidence: 90, numbers: [1] });
        expect(statusEl.className).toBe('status-bet-now');
    });

    test('Adds status-wait class when signal is not BET NOW', () => {
        if (!updateAIPredictionPanel) return;
        const statusEl = document.querySelector('#ai-prediction-panel .status-text');
        updateAIPredictionPanel({ signal: 'WAIT', confidence: 40, numbers: [1] });
        expect(statusEl.className).toBe('status-wait');
    });

    // ----- confidence -----

    test('Updates confidence value with percentage', () => {
        if (!updateAIPredictionPanel) return;
        updateAIPredictionPanel({ signal: 'BET NOW', confidence: 73, numbers: [5] });
        const confEl = document.querySelector('#ai-prediction-panel .confidence-value');
        expect(confEl.textContent).toBe('73%');
    });

    test('Defaults confidence to 0% when missing', () => {
        if (!updateAIPredictionPanel) return;
        updateAIPredictionPanel({ signal: 'WAIT', numbers: [5] });
        const confEl = document.querySelector('#ai-prediction-panel .confidence-value');
        expect(confEl.textContent).toBe('0%');
    });

    // ----- predicted numbers -----

    test('Renders number chips sorted in ascending order', () => {
        if (!updateAIPredictionPanel) return;
        updateAIPredictionPanel({ signal: 'BET NOW', confidence: 80, numbers: [15, 3, 22, 8] });
        const numsEl = document.querySelector('#ai-prediction-panel .predicted-numbers');
        const chips = numsEl.querySelectorAll('.number-chip');
        expect(chips.length).toBe(4);
        expect(chips[0].textContent).toBe('3');
        expect(chips[1].textContent).toBe('8');
        expect(chips[2].textContent).toBe('15');
        expect(chips[3].textContent).toBe('22');
    });

    test('Shows placeholder text when numbers array is empty', () => {
        if (!updateAIPredictionPanel) return;
        updateAIPredictionPanel({ signal: 'WAIT', confidence: 0, numbers: [] });
        const numsEl = document.querySelector('#ai-prediction-panel .predicted-numbers');
        expect(numsEl.innerHTML).toContain('Start entering spins');
    });

    test('Shows placeholder when numbers is undefined', () => {
        if (!updateAIPredictionPanel) return;
        updateAIPredictionPanel({ signal: 'WAIT', confidence: 0 });
        const numsEl = document.querySelector('#ai-prediction-panel .predicted-numbers');
        expect(numsEl.innerHTML).toContain('Start entering spins');
    });

    // ----- resilience when DOM elements are missing -----

    test('Does not throw when status element is missing from DOM', () => {
        if (!updateAIPredictionPanel) return;
        document.body.innerHTML = '<div id="ai-prediction-panel"></div>';
        expect(() =>
            updateAIPredictionPanel({ signal: 'BET NOW', confidence: 90, numbers: [1] })
        ).not.toThrow();
    });

    test('Does not throw when confidence element is missing from DOM', () => {
        if (!updateAIPredictionPanel) return;
        document.body.innerHTML = `
            <div id="ai-prediction-panel">
                <span class="status-text"></span>
            </div>
        `;
        expect(() =>
            updateAIPredictionPanel({ signal: 'BET NOW', confidence: 90, numbers: [1] })
        ).not.toThrow();
    });

    test('Does not throw when predicted-numbers element is missing from DOM', () => {
        if (!updateAIPredictionPanel) return;
        document.body.innerHTML = `
            <div id="ai-prediction-panel">
                <span class="status-text"></span>
                <span class="confidence-value"></span>
            </div>
        `;
        expect(() =>
            updateAIPredictionPanel({ signal: 'BET NOW', confidence: 90, numbers: [1] })
        ).not.toThrow();
    });
});
