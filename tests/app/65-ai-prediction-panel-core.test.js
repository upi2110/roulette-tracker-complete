/**
 * Phase 1 Step 5 — reusable AI Prediction Panel core.
 * Render-only, container-scoped, safe to mount multiple times.
 */

const { AIPredictionPanelCore } = require('../../app/ai-prediction-panel-core.js');
const { AITrainedController, ACTION, PHASE, MAX_BET_NUMBERS } =
    require('../../strategies/ai-trained/ai-trained-controller.js');

const SAMPLE_SPINS = [
    17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9,
    22, 18, 29, 7, 28, 12, 35, 3, 26, 0
];

function mount(opts) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new AIPredictionPanelCore(host, opts);
    return { host, panel };
}

function unmountAll() { document.body.innerHTML = ''; }

afterEach(unmountAll);

describe('construction', () => {
    test('requires a container', () => {
        expect(() => new AIPredictionPanelCore(null)).toThrow(TypeError);
        expect(() => new AIPredictionPanelCore({})).toThrow(TypeError);
    });

    test('attaches a single root element to the given container', () => {
        const { host } = mount();
        const roots = host.querySelectorAll('[data-ai-trained-core="1"]');
        expect(roots.length).toBe(1);
    });

    test('default mode is full; compact mode sets data-mode accordingly', () => {
        const a = mount();
        expect(a.host.querySelector('[data-ai-trained-core="1"]').dataset.mode).toBe('full');
        const b = mount({ mode: 'compact' });
        expect(b.host.querySelector('[data-ai-trained-core="1"]').dataset.mode).toBe('compact');
    });

    test('title is rendered in the header', () => {
        const { host } = mount({ title: 'AI-mode live' });
        expect(host.querySelector('[data-role="title"]').textContent).toBe('AI-mode live');
    });
});

describe('render — required AI-trained fields', () => {
    test('renders phase, action, confidence, zone, numbers, reasoning, and all diagnostics', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();
        // Force a deterministic SHADOW decision (idx 5)
        const d = c.decide(SAMPLE_SPINS.slice(0, 5), 5);
        panel.render(d);

        expect(host.querySelector('[data-role="phase"]').textContent).toBe(PHASE.SHADOW);
        expect(host.querySelector('[data-role="action"]').textContent).toBe(ACTION.SHADOW_PREDICT);
        expect(host.querySelector('[data-role="confidence"]').textContent).toMatch(/^conf \d+%$/);

        // All diagnostics cells present
        for (const key of ['entropy', 'conflict', 'historianMatch', 'clusterStrength', 'driftScore', 'lossStreak', 'ghostWin']) {
            expect(host.querySelector(`[data-diag="${key}"]`)).not.toBeNull();
        }

        // Reasoning section is present in full mode
        expect(host.querySelector('[data-role="reasoning"]').style.display).not.toBe('none');
        expect(host.querySelector('[data-role="signals"]')).not.toBeNull();
        expect(host.querySelector('[data-role="rejected"]')).not.toBeNull();
    });

    test('compact mode hides reasoning block but keeps diagnostics + header', () => {
        const { host, panel } = mount({ mode: 'compact' });
        const c = new AITrainedController();
        panel.render(c.decide(SAMPLE_SPINS.slice(0, 8), 8));
        expect(host.querySelector('[data-role="reasoning"]').style.display).toBe('none');
        expect(host.querySelector('[data-role="diagnostics"]')).not.toBeNull();
        expect(host.querySelector('[data-role="phase"]')).not.toBeNull();
    });
});

describe('render — action / phase semantics', () => {
    const states = [
        { name: 'WAIT',              phase: PHASE.WARMUP,      action: ACTION.WAIT,              numbers: [], shadowNumbers: undefined },
        { name: 'SHADOW_PREDICT',    phase: PHASE.SHADOW,      action: ACTION.SHADOW_PREDICT,    numbers: [], shadowNumbers: [1, 2, 3, 4] },
        { name: 'BET',               phase: PHASE.ACTIVE,      action: ACTION.BET,               numbers: [0, 5, 10, 20, 25, 30], shadowNumbers: undefined },
        { name: 'PROTECTION',        phase: PHASE.PROTECTION,  action: ACTION.PROTECTION,        numbers: [], shadowNumbers: undefined },
        { name: 'TERMINATE_SESSION', phase: PHASE.PROTECTION,  action: ACTION.TERMINATE_SESSION, numbers: [], shadowNumbers: undefined }
    ];

    const baseDiag = {
        entropy: 0.5, conflict: 0.3, historianMatch: 0.6,
        clusterStrength: 0.55, driftScore: 0.2,
        lossStreak: 2, ghostWin: false,
        spinIndex: 10, spinsSeen: 10
    };

    states.forEach(({ name, phase, action, numbers, shadowNumbers }) => {
        test(`renders ${name} cleanly`, () => {
            const { host, panel } = mount();
            const decision = {
                action, phase, numbers,
                shadowNumbers,
                selectedPair: null, selectedFilter: null,
                confidence: 0.42,
                reason: `${name} reason`,
                zone: numbers.length || (shadowNumbers && shadowNumbers.length)
                    ? { label: 'test', numbers: numbers.length ? numbers : shadowNumbers }
                    : null,
                diagnostics: baseDiag,
                reasoning: { signals: [`${name}-signal`], rejected: [`${name}-rejected`] }
            };
            panel.render(decision);
            expect(host.querySelector('[data-role="phase"]').textContent).toBe(phase);
            expect(host.querySelector('[data-role="action"]').textContent).toBe(action);
            expect(host.querySelector('[data-role="reason"]').textContent).toBe(`${name} reason`);

            const chips = host.querySelectorAll('[data-role="number-chip"], [data-role="shadow-chip"]');
            if (name === 'BET') {
                expect(chips.length).toBe(numbers.length);
                expect(chips[0].dataset.role).toBe('number-chip');
            } else if (name === 'SHADOW_PREDICT') {
                expect(chips.length).toBe(shadowNumbers.length);
                expect(chips[0].dataset.role).toBe('shadow-chip');
            } else {
                expect(chips.length).toBe(0);
            }
        });
    });

    test('BET numbers chip count <= MAX_BET_NUMBERS when sourced from the controller', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();
        for (let i = 7; i < SAMPLE_SPINS.length; i++) {
            const d = c.decide(SAMPLE_SPINS.slice(0, i), i);
            panel.render(d);
            const chips = host.querySelectorAll('[data-role="number-chip"], [data-role="shadow-chip"]');
            expect(chips.length).toBeLessThanOrEqual(MAX_BET_NUMBERS);
        }
    });
});

describe('multi-mount isolation', () => {
    test('two mounts do not share DOM or state', () => {
        const a = mount({ title: 'A' });
        const b = mount({ title: 'B' });
        const c = new AITrainedController();

        a.panel.render(c.decide(SAMPLE_SPINS.slice(0, 5), 5));   // SHADOW
        b.panel.render(c.decide(SAMPLE_SPINS.slice(0, 2), 2));   // WARMUP

        expect(a.host.querySelector('[data-role="action"]').textContent).toBe(ACTION.SHADOW_PREDICT);
        expect(b.host.querySelector('[data-role="action"]').textContent).toBe(ACTION.WAIT);
        expect(a.host.querySelector('[data-role="title"]').textContent).toBe('A');
        expect(b.host.querySelector('[data-role="title"]').textContent).toBe('B');
    });

    test('destroy() removes only its own root and leaves siblings intact', () => {
        const a = mount();
        const b = mount();
        a.panel.destroy();
        expect(a.host.querySelector('[data-ai-trained-core="1"]')).toBeNull();
        expect(b.host.querySelector('[data-ai-trained-core="1"]')).not.toBeNull();
    });
});

describe('robustness', () => {
    test('renders neutral placeholders for a malformed decision', () => {
        const { host, panel } = mount();
        panel.render({});
        expect(host.querySelector('[data-role="phase"]').textContent).toBe('—');
        expect(host.querySelector('[data-role="action"]').textContent).toBe('—');
        expect(host.querySelector('[data-role="confidence"]').textContent).toBe('conf —');
    });

    test('clear() resets header and empties chip / diagnostics containers', () => {
        const { host, panel } = mount();
        const c = new AITrainedController();
        panel.render(c.decide(SAMPLE_SPINS.slice(0, 10), 10));
        panel.clear();
        expect(host.querySelector('[data-role="phase"]').textContent).toBe('—');
        expect(host.querySelector('[data-role="numbers"]').children.length).toBe(0);
        expect(host.querySelector('[data-role="diagnostics"]').children.length).toBe(0);
    });

    test('numberFormatter override is honoured for BET chips', () => {
        const { host, panel } = mount({ numberFormatter: (n) => `#${n}` });
        panel.render({
            action: ACTION.BET, phase: PHASE.ACTIVE,
            numbers: [7, 14, 21], confidence: 0.6,
            reason: '', zone: null,
            diagnostics: {
                entropy: 0, conflict: 0, historianMatch: 0,
                clusterStrength: 0, driftScore: 0,
                lossStreak: 0, ghostWin: false,
                spinIndex: 0, spinsSeen: 0
            },
            reasoning: { signals: [], rejected: [] }
        });
        const chips = host.querySelectorAll('[data-role="number-chip"]');
        expect(Array.from(chips).map(c => c.textContent)).toEqual(['#7', '#14', '#21']);
    });
});
