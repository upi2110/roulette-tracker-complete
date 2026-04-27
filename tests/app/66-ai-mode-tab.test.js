/**
 * Phase 1 Step 6 — AI-mode tab wiring.
 *
 * Verifies:
 *   - mountAIModeTab creates #aiModeTab inside #aiPanelContent once
 *   - section does NOT carry class 'table-selection-section'
 *     so togglePairSelection() cannot hide it
 *   - panel renders AI-trained decisions
 *   - AIAutoModeUI.updateDecisionDisplay forwards decision.aiTrained
 *     to window.aiModeTab and does NOT touch it when the envelope is
 *     absent (manual / semi / auto / T1 paths)
 *   - re-invocation is a no-op (idempotent mount)
 */

const { mountAIModeTab } = require('../../ui/ai-mode-tab/ai-mode-tab.js');
const { AIPredictionPanelCore } = require('../../app/ai-prediction-panel-core.js');
const { AITrainedController, ACTION, PHASE } = require('../../strategies/ai-trained/ai-trained-controller.js');

// jsdom harness used by suite 23 / 64
function setupAutoModeDOM() {
    document.body.innerHTML = `
        <div id="aiSelectionPanel">
            <div id="aiPanelContent">
                <div class="table-selection-section" data-table="3"></div>
                <div class="table-selection-section" data-table="2"></div>
                <div class="table-selection-section" data-table="1"></div>
            </div>
        </div>
    `;
}

let AIAutoModeUI;
beforeAll(() => {
    setupAutoModeDOM();
    AIAutoModeUI = require('../../app/ai-auto-mode-ui').AIAutoModeUI;
});

beforeEach(() => {
    setupAutoModeDOM();
    delete window.aiModeTab;
    window.aiAutoEngine = null;
    window.aiAutoModeUI = null;
    window.autoUpdateOrchestrator = null;
});

afterEach(() => {
    delete window.aiModeTab;
});

describe('mountAIModeTab', () => {
    test('creates #aiModeTab inside #aiPanelContent exactly once', () => {
        const p1 = mountAIModeTab();
        expect(p1).toBeInstanceOf(AIPredictionPanelCore);
        expect(document.querySelectorAll('#aiModeTab').length).toBe(1);
        // Idempotent: a second call does not duplicate the section.
        const p2 = mountAIModeTab();
        expect(document.querySelectorAll('#aiModeTab').length).toBe(1);
        expect(p2).toBe(p1);
        expect(window.aiModeTab).toBe(p1);
    });

    test('section uses class "ai-mode-section" and NOT "table-selection-section"', () => {
        mountAIModeTab();
        const section = document.getElementById('aiModeTab');
        expect(section).not.toBeNull();
        expect(section.classList.contains('ai-mode-section')).toBe(true);
        expect(section.classList.contains('table-selection-section')).toBe(false);
    });

    test('tab remains visible when togglePairSelection hides .table-selection-section nodes', () => {
        mountAIModeTab();
        const ui = new AIAutoModeUI();
        ui.togglePairSelection(false); // engine-driven modes hide user pair UI

        const tab = document.getElementById('aiModeTab');
        expect(tab.style.display).not.toBe('none');
        document.querySelectorAll('.table-selection-section').forEach(el => {
            expect(el.style.display).toBe('none');
        });
    });

    test('does not collide with the legacy #aiSelectionPanel singleton container', () => {
        mountAIModeTab();
        // legacy container still exists and is distinct
        expect(document.getElementById('aiSelectionPanel')).not.toBeNull();
        expect(document.getElementById('aiModeTab')
            .closest('#aiSelectionPanel')).not.toBeNull(); // mounted inside it
    });

    test('returns null when #aiPanelContent is missing', () => {
        document.body.innerHTML = '';
        delete window.aiModeTab;
        const p = mountAIModeTab();
        expect(p).toBeNull();
    });

    test('forceRemount re-creates the section', () => {
        const first = mountAIModeTab();
        const second = mountAIModeTab({ forceRemount: true });
        expect(second).not.toBe(first);
        expect(document.querySelectorAll('#aiModeTab').length).toBe(1);
    });
});

describe('rendering AI-trained decisions', () => {
    test('renders phase, action, and diagnostics for a controller decision', () => {
        const panel = mountAIModeTab();
        const c = new AITrainedController();
        const d = c.decide([17, 34, 6, 27, 13, 36, 11, 30], 7);
        panel.render(d);
        const tab = document.getElementById('aiModeTab');
        expect(tab.querySelector('[data-role="phase"]').textContent).toBe(d.phase);
        expect(tab.querySelector('[data-role="action"]').textContent).toBe(d.action);
        for (const key of ['entropy', 'conflict', 'historianMatch', 'clusterStrength', 'driftScore', 'lossStreak', 'ghostWin']) {
            expect(tab.querySelector(`[data-diag="${key}"]`)).not.toBeNull();
        }
    });
});

describe('AIAutoModeUI.updateDecisionDisplay forwarding', () => {
    test('forwards decision.aiTrained to window.aiModeTab.render', () => {
        mountAIModeTab();
        const spy = jest.spyOn(window.aiModeTab, 'render');
        const ui = new AIAutoModeUI();

        const aiTrained = {
            action: ACTION.BET, phase: PHASE.ACTIVE,
            numbers: [1, 2, 3], confidence: 0.7,
            reason: 'forwarded',
            diagnostics: {
                entropy: 0.5, conflict: 0.2, historianMatch: 0.6,
                clusterStrength: 0.7, driftScore: 0.1,
                lossStreak: 0, ghostWin: false,
                spinIndex: 10, spinsSeen: 10
            },
            reasoning: { signals: [], rejected: [] }
        };
        ui.updateDecisionDisplay({ action: 'BET', selectedPair: null, selectedFilter: null, numbers: [1, 2, 3], confidence: 70, reason: 'x', aiTrained });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toBe(aiTrained);
    });

    test('does NOT call aiModeTab.render when envelope lacks aiTrained (manual/semi/auto/T1)', () => {
        mountAIModeTab();
        const spy = jest.spyOn(window.aiModeTab, 'render');
        const ui = new AIAutoModeUI();

        ui.updateDecisionDisplay({
            action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both',
            numbers: [1, 2], confidence: 50, reason: 'auto path'
        });
        ui.updateDecisionDisplay({
            action: 'SKIP', selectedPair: null, selectedFilter: null,
            numbers: [], confidence: 0, reason: 't1 path'
        });

        expect(spy).not.toHaveBeenCalled();
    });
});
