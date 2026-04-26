/**
 * Phase 1 Step 7 — diagnostics / phase display wiring.
 *
 * Verifies:
 *   - All 7 phases render in the progression strip, with only the
 *     current one highlighted.
 *   - Phase transitions between decisions update the strip correctly.
 *   - Spin meta reflects diagnostics.spinIndex / spinsSeen.
 *   - Shadow predictions display an explicit non-bettable label.
 *   - BET never renders more than 12 chips, even if a caller supplies
 *     an oversized numbers[] (defensive display cap).
 */

const {
    AIPredictionPanelCore,
    PHASE_ORDER
} = require('../../app/ai-prediction-panel-core.js');
const {
    AITrainedController,
    ACTION,
    PHASE,
    MAX_BET_NUMBERS
} = require('../../app/ai-trained-controller.js');

function mount(opts) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new AIPredictionPanelCore(host, opts);
    return { host, panel };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('phase progression strip', () => {
    test('renders exactly 7 phase cells in canonical order', () => {
        const { host } = mount();
        const cells = host.querySelectorAll('[data-role="phase-cell"]');
        expect(cells.length).toBe(7);
        expect(Array.from(cells).map(c => c.dataset.phase)).toEqual([...PHASE_ORDER]);
    });

    test('only the current phase is highlighted per render', () => {
        const { host, panel } = mount();
        const base = {
            action: ACTION.WAIT, selectedPair: null, selectedFilter: null,
            numbers: [], confidence: 0, reason: '',
            zone: null,
            diagnostics: {
                entropy: 0.5, conflict: 0.3, historianMatch: 0.5,
                clusterStrength: 0.5, driftScore: 0.1,
                lossStreak: 0, ghostWin: false,
                spinIndex: 0, spinsSeen: 0
            },
            reasoning: { signals: [], rejected: [] }
        };

        const check = (phase) => {
            panel.render(Object.assign({}, base, { phase }));
            const current = host.querySelectorAll('[data-role="phase-cell"][data-current="1"]');
            expect(current.length).toBe(1);
            expect(current[0].dataset.phase).toBe(phase);
        };

        // Exercise every phase value the controller can emit.
        [
            PHASE.WARMUP, PHASE.SHADOW, PHASE.EARLY, PHASE.STABILISING,
            PHASE.ACTIVE, PHASE.RECOVERY, PHASE.PROTECTION
        ].forEach(check);
    });

    test('transitioning between decisions updates the strip', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();
        // Warmup
        panel.render(c.decide([], 0));
        expect(host.querySelector('[data-role="phase-cell"][data-current="1"]').dataset.phase)
            .toBe(PHASE.WARMUP);
        // Shadow
        panel.render(c.decide([17, 34, 6, 27], 4));
        expect(host.querySelector('[data-role="phase-cell"][data-current="1"]').dataset.phase)
            .toBe(PHASE.SHADOW);
    });
});

describe('spin meta', () => {
    test('header reflects spinIndex and spinsSeen', () => {
        const { host, panel } = mount();
        panel.render({
            action: ACTION.WAIT, phase: PHASE.WARMUP,
            numbers: [], confidence: 0, reason: '',
            zone: null,
            diagnostics: {
                entropy: 0, conflict: 0, historianMatch: 0,
                clusterStrength: 0, driftScore: 0,
                lossStreak: 0, ghostWin: false,
                spinIndex: 12, spinsSeen: 9
            },
            reasoning: { signals: [], rejected: [] }
        });
        const meta = host.querySelector('[data-role="spin-meta"]').textContent;
        expect(meta).toContain('spin 12');
        expect(meta).toContain('seen 9');
    });
});

describe('shadow non-bettable label', () => {
    test('visible for SHADOW_PREDICT with shadowNumbers and hidden otherwise', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();

        // WAIT: label hidden
        panel.render(c.decide([1, 2], 2));
        expect(host.querySelector('[data-role="shadow-label"]').style.display).toBe('none');

        // SHADOW_PREDICT: label visible and says "not bettable"
        const shadowDecision = c.decide([17, 34, 6, 27, 13], 5);
        expect(shadowDecision.action).toBe(ACTION.SHADOW_PREDICT);
        panel.render(shadowDecision);
        const lbl = host.querySelector('[data-role="shadow-label"]');
        expect(lbl.style.display).toBe('block');
        expect(lbl.textContent.toLowerCase()).toContain('not bettable');

        // Explicit BET (synthetic): label hidden again
        panel.render({
            action: ACTION.BET, phase: PHASE.ACTIVE,
            numbers: [1, 2, 3], confidence: 0.7, reason: '',
            zone: null,
            diagnostics: {
                entropy: 0, conflict: 0, historianMatch: 0,
                clusterStrength: 0, driftScore: 0,
                lossStreak: 0, ghostWin: false,
                spinIndex: 10, spinsSeen: 10
            },
            reasoning: { signals: [], rejected: [] }
        });
        expect(host.querySelector('[data-role="shadow-label"]').style.display).toBe('none');
    });

    test('SHADOW chips carry data-role="shadow-chip" (visually distinct from BET chips)', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();
        const d = c.decide([17, 34, 6, 27, 13], 5);
        panel.render(d);
        const chips = host.querySelectorAll('[data-role="shadow-chip"]');
        const betChips = host.querySelectorAll('[data-role="number-chip"]');
        expect(chips.length).toBeGreaterThan(0);
        expect(betChips.length).toBe(0);
    });
});

describe('12-number display cap (defensive)', () => {
    test('even if a caller supplies >12 numbers, only 12 chips render', () => {
        const { host, panel } = mount();
        const oversized = Array.from({ length: 25 }, (_, i) => i);
        panel.render({
            action: ACTION.BET, phase: PHASE.ACTIVE,
            numbers: oversized, confidence: 0.7, reason: '',
            zone: null,
            diagnostics: {
                entropy: 0, conflict: 0, historianMatch: 0,
                clusterStrength: 0, driftScore: 0,
                lossStreak: 0, ghostWin: false,
                spinIndex: 10, spinsSeen: 10
            },
            reasoning: { signals: [], rejected: [] }
        });
        const chips = host.querySelectorAll('[data-role="number-chip"]');
        expect(chips.length).toBe(MAX_BET_NUMBERS);
    });
});

describe('clear() resets progression strip and shadow label', () => {
    test('no phase cell is highlighted after clear()', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();
        panel.render(c.decide([17, 34, 6, 27, 13], 5));
        panel.clear();
        const current = host.querySelectorAll('[data-role="phase-cell"][data-current="1"]');
        expect(current.length).toBe(0);
        expect(host.querySelector('[data-role="shadow-label"]').style.display).toBe('none');
        expect(host.querySelector('[data-role="spin-meta"]').textContent).toBe('spin —');
    });
});
