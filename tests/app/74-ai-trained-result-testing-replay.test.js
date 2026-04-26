/**
 * Phase 2 Step 7 — AI-trained diagnostics region in result-testing-panel.
 *
 * Render-only. Verifies:
 *   - section is hidden until AI-trained step data is submitted
 *   - second AIPredictionPanelCore mounts inside the panel
 *   - hovered/selected step drives panel.render(step.aiTrained)
 *   - shadow chips remain non-bettable (data-role="shadow-chip")
 *   - legacy submit() flow is unchanged for non-AI-trained results
 */

function setupDOM() {
    document.body.innerHTML = `
        <div id="aiSelectionPanel">
            <div id="aiPanelContent">
                <div class="table-selection-section" data-table="3"></div>
            </div>
        </div>
    `;
}

let ResultTestingPanel;
beforeAll(() => {
    setupDOM();
    ({ ResultTestingPanel } = require('../../app/result-testing-panel'));
});

beforeEach(() => {
    setupDOM();
});

function aiStep(idx, action, extra) {
    const aiTrained = {
        action, phase: action === 'WAIT' ? 'WARMUP' : 'ACTIVE',
        selectedPair: null, selectedFilter: null,
        numbers: action === 'BET' ? [1, 2, 3] : [],
        shadowNumbers: action === 'SHADOW_PREDICT' ? [7, 8, 9] : undefined,
        shadowHit: action === 'SHADOW_PREDICT' ? false : undefined,
        confidence: 0.6, reason: 'r', zone: null,
        diagnostics: {
            entropy: 0.4, conflict: 0.2, historianMatch: 0.5,
            clusterStrength: 0.5, driftScore: 0.1,
            lossStreak: 0, ghostWin: false,
            spinIndex: idx, spinsSeen: idx + 1
        },
        reasoning: { signals: [], rejected: [] }
    };
    return Object.assign({
        spinIdx: idx, spinNumber: 17, nextNumber: 34,
        action: action === 'BET' ? 'BET' : 'SKIP',
        selectedPair: null, selectedFilter: null,
        predictedNumbers: action === 'BET' ? [1, 2, 3] : [],
        confidence: 60, betPerNumber: 2, numbersCount: action === 'BET' ? 3 : 0,
        hit: false, pnl: 0, bankroll: 4000, cumulativeProfit: 0,
        aiTrained
    }, extra || {});
}

function legacyStep(action) {
    return {
        spinIdx: 0, spinNumber: 17, nextNumber: 34,
        action, selectedPair: 'prev', selectedFilter: 'both_both',
        predictedNumbers: [], confidence: 0,
        betPerNumber: 2, numbersCount: 0, hit: false, pnl: 0,
        bankroll: 4000, cumulativeProfit: 0
    };
}

function aiTrainedAutoTestResult() {
    return {
        testFile: 'ai.txt',
        totalTestSpins: 5,
        method: 'AI-trained',
        sessions: [{
            startIdx: 0, strategy: 'Aggressive', outcome: 'WIN',
            steps: [
                aiStep(0, 'WAIT'),
                aiStep(4, 'SHADOW_PREDICT'),
                aiStep(7, 'BET', { hit: true, pnl: 66 })
            ]
        }]
    };
}

describe('Step 7 — diagnostics section visibility', () => {
    test('hidden by default; not present until submit() with AI-trained data', () => {
        const p = new ResultTestingPanel();
        const section = document.getElementById('resultTestingAITrainedSection');
        expect(section).toBeTruthy();
        expect(section.style.display).toBe('none');
    });

    test('hidden when submit receives a non-AI-trained result', () => {
        const p = new ResultTestingPanel();
        p.submit({
            testFile: 'legacy.txt', totalTestSpins: 3, method: 'auto-test',
            sessions: [{ steps: [legacyStep('WATCH'), legacyStep('SKIP'), legacyStep('BET')] }]
        });
        const section = document.getElementById('resultTestingAITrainedSection');
        expect(section.style.display).toBe('none');
        expect(p._aiTrainedDiagPanel).toBeFalsy();
    });

    test('visible when submit receives a result with at least one step.aiTrained', () => {
        const p = new ResultTestingPanel();
        p.submit(aiTrainedAutoTestResult());
        const section = document.getElementById('resultTestingAITrainedSection');
        expect(section.style.display).toBe('block');
        const select = document.getElementById('resultTestingAITrainedStepSelect');
        expect(select.options.length).toBe(3);
        expect(p._aiTrainedDiagPanel).toBeTruthy();
    });
});

describe('Step 7 — second panel renders selected step', () => {
    test('initial mount renders the first AI-trained step', () => {
        const p = new ResultTestingPanel();
        p.submit(aiTrainedAutoTestResult());
        const mount = document.getElementById('resultTestingAITrainedMount');
        // Renderer creates a [data-ai-trained-core="1"] root inside the mount.
        const root = mount.querySelector('[data-ai-trained-core="1"]');
        expect(root).toBeTruthy();
        // First step is WAIT/WARMUP.
        expect(root.querySelector('[data-role="action"]').textContent).toBe('WAIT');
        expect(root.querySelector('[data-role="phase"]').textContent).toBe('WARMUP');
    });

    test('selectAITrainedStep(i) drives the second panel render', () => {
        const p = new ResultTestingPanel();
        p.submit(aiTrainedAutoTestResult());
        const mount = document.getElementById('resultTestingAITrainedMount');
        const root = mount.querySelector('[data-ai-trained-core="1"]');

        p.selectAITrainedStep(1);  // SHADOW_PREDICT
        expect(root.querySelector('[data-role="action"]').textContent).toBe('SHADOW_PREDICT');

        p.selectAITrainedStep(2);  // BET
        expect(root.querySelector('[data-role="action"]').textContent).toBe('BET');
    });

    test('changing the dropdown updates the panel via the wired listener', () => {
        const p = new ResultTestingPanel();
        p.submit(aiTrainedAutoTestResult());
        const mount = document.getElementById('resultTestingAITrainedMount');
        const root = mount.querySelector('[data-ai-trained-core="1"]');
        const select = document.getElementById('resultTestingAITrainedStepSelect');

        select.value = '1';
        select.dispatchEvent(new Event('change'));
        expect(root.querySelector('[data-role="action"]').textContent).toBe('SHADOW_PREDICT');
    });
});

describe('Step 7 — shadow chips remain non-bettable', () => {
    test('SHADOW_PREDICT step renders shadow chips with data-role="shadow-chip", not "number-chip"', () => {
        const p = new ResultTestingPanel();
        p.submit(aiTrainedAutoTestResult());
        p.selectAITrainedStep(1);  // SHADOW_PREDICT step
        const mount = document.getElementById('resultTestingAITrainedMount');
        const shadowChips = mount.querySelectorAll('[data-role="shadow-chip"]');
        const betChips = mount.querySelectorAll('[data-role="number-chip"]');
        expect(shadowChips.length).toBeGreaterThan(0);
        expect(betChips.length).toBe(0);
    });
});

describe('Step 7 — legacy submit() behavior unchanged', () => {
    test('legacy submission still populates summary block and enables flow controls as before', () => {
        const p = new ResultTestingPanel();
        const ok = p.submit({
            testFile: 't.txt', totalTestSpins: 5, method: 'auto-test',
            sessions: [{ steps: [legacyStep('WATCH'), legacyStep('BET')] }]
        });
        expect(ok).toBe(true);
        expect(document.getElementById('resultTestingSummary').style.display).toBe('block');
        expect(document.getElementById('resultTestingEmpty').style.display).toBe('none');
        // Non-AI-trained → diagnostics section stays hidden, no panel mount.
        expect(document.getElementById('resultTestingAITrainedSection').style.display).toBe('none');
        expect(p._aiTrainedDiagPanel).toBeFalsy();
    });

    test("submit() does NOT populate predictedNumbers from the diagnostics panel into replay state", () => {
        const p = new ResultTestingPanel();
        p.submit(aiTrainedAutoTestResult());
        // The replay state is the submitted Auto Test result; the
        // diagnostics panel is render-only. Asserting that the
        // submitted sessions object retains its original step shape
        // (no shadowNumbers leaked into predictedNumbers).
        const session = p.submitted.sessions[0];
        const shadowStep = session.steps[1];
        expect(shadowStep.action).toBe('SKIP');
        expect(shadowStep.predictedNumbers).toEqual([]);
    });
});
