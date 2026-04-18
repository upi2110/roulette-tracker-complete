/**
 * 56-result-testing-panel.test.js
 *
 * Tests for ResultTestingPanel — the new manual-verification tab in
 * the AI prediction area. Also exercises the Submit-to test hand-off
 * from AutoTestUI → ResultTestingPanel.
 *
 * Groups:
 *   A. Panel creation & placement (sits inside #aiPanelContent).
 *   B. Empty state before any submission.
 *   C. submit() populates the UI and enables controls.
 *   D. Tab-name resolver (text + numeric synonyms).
 *   E. Enter / Run button triggers processTabEntry and switches to
 *      manual mode with the submitted spin history.
 *   F. Comparison HTML reflects the chosen tab's summary.
 *   G. Verification report text contains the expected fields.
 *   H. Defensive / negative-path handling.
 *   I. AutoTestUI has a Submit-to test button; hand-off works.
 */

const { setupDOM } = require('../test-setup');
const { ResultTestingPanel } = require('../../app/result-testing-panel');

function makeAutoTestResult(overrides = {}) {
    // Include the fields AutoTestUI.renderOverview actually reads
    // (winRate, avgProfit, totalWon, totalLost, avgSpinsToWin,
    // maxSpinsToWin) so the full run path doesn't throw when we
    // exercise runTest() end-to-end in group I.
    const mkSummary = (sessions, wins, busts, profit) => ({
        totalSessions: sessions, wins, busts,
        incomplete: Math.max(0, sessions - wins - busts),
        winRate: sessions > 0 ? wins / sessions : 0,
        avgSpinsToWin: 20, maxSpinsToWin: 30, avgSpinsToBust: 40,
        totalProfit: profit, avgProfit: sessions > 0 ? profit / sessions : 0,
        maxDrawdown: 100, totalWon: Math.max(0, profit), totalLost: Math.max(0, -profit),
        bestSession: { startIdx: 0, finalProfit: profit },
        worstSession: { startIdx: 0, finalProfit: profit }
    });
    return Object.assign({
        testFile: 'test-session.txt',
        totalTestSpins: 60,
        method: 'auto-test',
        timestamp: '2026-04-18T10:00:00.000Z',
        testSpins: Array.from({ length: 60 }, (_, i) => i % 37),
        strategies: {
            1: { sessions: [], summary: mkSummary(3, 1, 1, -100) },
            2: { sessions: [], summary: mkSummary(2, 2, 0, 200) },
            3: { sessions: [], summary: mkSummary(0, 0, 0, 0) }
        }
    }, overrides);
}

// Ensure an #aiPanelContent exists (the real app builds it in the AI
// prediction panel) so the Result-testing section has somewhere to live.
function seedAIPanelContent() {
    let c = document.getElementById('aiPanelContent');
    if (!c) {
        c = document.createElement('div');
        c.id = 'aiPanelContent';
        document.body.appendChild(c);
    }
    // Mimic the AI Auto Mode UI block that AIAutoModeUI.insertBefore's
    // at position 0. The Result-testing section should land right after.
    if (!c.firstElementChild) {
        const modeBlock = document.createElement('div');
        modeBlock.id = 'autoModeControls';
        c.appendChild(modeBlock);
    }
    return c;
}

beforeEach(() => {
    setupDOM();
    seedAIPanelContent();
    delete window.resultTestingPanel;
    delete window.aiAutoModeUI;
    delete window.autoTestUI;
    delete window.render;
    delete window.spins;
});

// ═══════════════════════════════════════════════════════════════════
//  A. Panel creation & placement
// ═══════════════════════════════════════════════════════════════════
describe('A. Panel creation', () => {
    test('A1: constructor creates #resultTestingPanel inside #aiPanelContent', () => {
        new ResultTestingPanel();
        const panel = document.getElementById('resultTestingPanel');
        expect(panel).not.toBeNull();
        expect(document.getElementById('aiPanelContent').contains(panel)).toBe(true);
    });

    test('A2: panel is inserted AFTER the first existing child (not at the very top)', () => {
        // setupDOM() seeds #aiPanelContent with pre-existing children that
        // stand in for the Table 1/2/3 sections. The real app also has
        // AIAutoModeUI's mode-buttons block inserted at position 0. Our
        // panel should land at index 1 (right after that first child)
        // so it sits next to the Auto/mode area, never at the very top.
        new ResultTestingPanel();
        const c = document.getElementById('aiPanelContent');
        const children = Array.from(c.children);
        expect(children.length).toBeGreaterThanOrEqual(2);
        expect(children[0].id).not.toBe('resultTestingPanel');
        expect(children[1].id).toBe('resultTestingPanel');
    });

    test('A3: createUI is idempotent — two constructions do NOT duplicate the section', () => {
        new ResultTestingPanel();
        new ResultTestingPanel();
        expect(document.querySelectorAll('#resultTestingPanel').length).toBe(1);
    });

    test('A4: panel header exposes the required key strings', () => {
        new ResultTestingPanel();
        const header = document.querySelector('#resultTestingPanel .result-testing-header');
        expect(header).not.toBeNull();
        expect(header.textContent).toMatch(/Result-testing/);
        expect(header.textContent).toMatch(/Manual verification/i);
    });

    test('A5: silently no-ops when #aiPanelContent is absent', () => {
        document.getElementById('aiPanelContent').remove();
        expect(() => new ResultTestingPanel()).not.toThrow();
        expect(document.getElementById('resultTestingPanel')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════
//  B. Empty state
// ═══════════════════════════════════════════════════════════════════
describe('B. Empty state', () => {
    test('B1: before submit, empty-state block is visible and summary is hidden', () => {
        new ResultTestingPanel();
        const empty = document.getElementById('resultTestingEmpty');
        const summary = document.getElementById('resultTestingSummary');
        expect(empty.style.display).not.toBe('none');
        expect(summary.style.display).toBe('none');
    });

    test('B2: status text says "No submission" before any result arrives', () => {
        new ResultTestingPanel();
        expect(document.getElementById('resultTestingStatus').textContent).toMatch(/No submission/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  C. submit() populates UI
// ═══════════════════════════════════════════════════════════════════
describe('C. submit(autoTestResult)', () => {
    test('C1: stashes the result on the panel instance', () => {
        const p = new ResultTestingPanel();
        const res = makeAutoTestResult();
        expect(p.submit(res)).toBe(true);
        expect(p.submitted).toBe(res);
    });

    test('C2: hides the empty state and reveals the summary controls', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(document.getElementById('resultTestingEmpty').style.display).toBe('none');
        expect(document.getElementById('resultTestingSummary').style.display).toBe('block');
    });

    test('C3: submission info shows file, spins, method', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ testFile: 'rainy-day.txt', totalTestSpins: 120, method: 'T1-strategy' }));
        const info = document.getElementById('resultTestingSubmissionInfo').textContent;
        expect(info).toMatch(/rainy-day\.txt/);
        expect(info).toMatch(/120/);
        expect(info).toMatch(/T1-strategy/);
    });

    test('C4: status flips from "No submission" to a ready prompt', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(document.getElementById('resultTestingStatus').textContent).toMatch(/Ready/);
    });

    test('C5: rejects null / non-object input and leaves state unchanged', () => {
        const p = new ResultTestingPanel();
        expect(p.submit(null)).toBe(false);
        expect(p.submit(undefined)).toBe(false);
        expect(p.submit(123)).toBe(false);
        expect(p.submitted).toBeNull();
        expect(document.getElementById('resultTestingSummary').style.display).toBe('none');
    });

    test('C6: re-submitting a new result clears the prior message + comparison', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('strategy1');
        expect(document.getElementById('resultTestingComparison').innerHTML).not.toBe('');
        p.submit(makeAutoTestResult({ testFile: 'new.txt' }));
        expect(document.getElementById('resultTestingComparison').innerHTML).toBe('');
        expect(document.getElementById('resultTestingMessage').textContent).toBe('');
    });
});

// ═══════════════════════════════════════════════════════════════════
//  D. Tab-name resolver
// ═══════════════════════════════════════════════════════════════════
describe('D. resolveTabName', () => {
    const p = new ResultTestingPanel();
    test('D1: text tab names resolve to themselves', () => {
        expect(p.resolveTabName('overview')).toBe('overview');
        expect(p.resolveTabName('strategy1')).toBe('strategy1');
        expect(p.resolveTabName('strategy2')).toBe('strategy2');
        expect(p.resolveTabName('strategy3')).toBe('strategy3');
    });
    test('D2: numeric synonyms work (0 = overview, 1/2/3 = strategies)', () => {
        expect(p.resolveTabName('0')).toBe('overview');
        expect(p.resolveTabName('1')).toBe('strategy1');
        expect(p.resolveTabName('2')).toBe('strategy2');
        expect(p.resolveTabName('3')).toBe('strategy3');
    });
    test('D3: short synonyms (s1/s2/s3) work', () => {
        expect(p.resolveTabName('s1')).toBe('strategy1');
        expect(p.resolveTabName('S2')).toBe('strategy2');
        expect(p.resolveTabName('s3')).toBe('strategy3');
    });
    test('D4: whitespace is trimmed; case-insensitive', () => {
        expect(p.resolveTabName('  OVERVIEW  ')).toBe('overview');
        expect(p.resolveTabName(' Strategy1 ')).toBe('strategy1');
    });
    test('D5: invalid input returns null', () => {
        expect(p.resolveTabName('')).toBeNull();
        expect(p.resolveTabName('   ')).toBeNull();
        expect(p.resolveTabName('4')).toBeNull();
        expect(p.resolveTabName('overviewy')).toBeNull();
        expect(p.resolveTabName(null)).toBeNull();
        expect(p.resolveTabName(undefined)).toBeNull();
        expect(p.resolveTabName(42)).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════
//  E. Enter / Run triggers processTabEntry
// ═══════════════════════════════════════════════════════════════════
describe('E. Enter and Run flow', () => {
    test('E1: Enter on the input calls processTabEntry and loads spins into window.spins', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ testSpins: [5, 17, 22, 33, 10] }));
        const input = document.getElementById('resultTestingTabInput');
        input.value = 'strategy1';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(Array.isArray(window.spins)).toBe(true);
        expect(window.spins.length).toBe(5);
        expect(window.spins[0].actual).toBe(5);
        expect(p.lastTabLoaded).toBe('strategy1');
    });

    test('E2: Run button triggers the same pipeline', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ testSpins: [1, 2, 3, 4, 5] }));
        const input = document.getElementById('resultTestingTabInput');
        input.value = '2';
        document.getElementById('resultTestingRunBtn').click();
        expect(window.spins.length).toBe(5);
        expect(p.lastTabLoaded).toBe('strategy2');
    });

    test('E3: processTabEntry switches to manual mode when ai-auto-mode UI is present', () => {
        const calls = [];
        window.aiAutoModeUI = { setMode: (m) => { calls.push(m); } };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('strategy1');
        expect(out.ok).toBe(true);
        expect(calls).toContain('manual');
    });

    test('E4: processTabEntry calls window.render() when exposed', () => {
        let renderCalls = 0;
        window.render = () => { renderCalls++; };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('overview');
        expect(renderCalls).toBe(1);
    });

    test('E5: processTabEntry returns ok=false when no submission has been made', () => {
        const p = new ResultTestingPanel();
        const out = p.processTabEntry('strategy1');
        expect(out).toEqual(expect.objectContaining({ ok: false, error: 'no-submission' }));
        expect(document.getElementById('resultTestingMessage').textContent).toMatch(/No submission/);
    });

    test('E6: processTabEntry returns ok=false on unknown tab name', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('zzz');
        expect(out).toEqual(expect.objectContaining({ ok: false, error: 'invalid-tab' }));
    });

    test('E7: processTabEntry returns ok=false when submission lacks spins', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ testSpins: undefined }));
        const out = p.processTabEntry('strategy1');
        expect(out.ok).toBe(false);
        expect(out.error).toBe('no-spins');
    });

    test('E8: processTabEntry falls back to window.autoTestUI.testSpins when result has none', () => {
        window.autoTestUI = { testSpins: [10, 20, 30] };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ testSpins: undefined }));
        const out = p.processTabEntry('1');
        expect(out.ok).toBe(true);
        expect(window.spins.length).toBe(3);
    });

    test('E9: successful run enables the download button', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(true);
        p.processTabEntry('strategy1');
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  F. Comparison panel
// ═══════════════════════════════════════════════════════════════════
describe('F. Comparison rendering', () => {
    test('F1: overview tab shows all three strategies', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('overview');
        const cmp = document.getElementById('resultTestingComparison');
        expect(cmp.innerHTML).toMatch(/Strategy 1/);
        expect(cmp.innerHTML).toMatch(/Strategy 2/);
        expect(cmp.innerHTML).toMatch(/Strategy 3/);
    });

    test('F2: strategyN tab shows only that strategy', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('strategy2');
        const cmp = document.getElementById('resultTestingComparison');
        expect(cmp.innerHTML).toMatch(/Strategy 2/);
        expect(cmp.innerHTML).not.toMatch(/Strategy 1/);
        expect(cmp.innerHTML).not.toMatch(/Strategy 3/);
    });

    test('F3: the comparison block reports the Total P&L for the chosen tab', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('strategy2');
        expect(document.getElementById('resultTestingComparison').innerHTML).toMatch(/\$200/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  G. Verification report download
// ═══════════════════════════════════════════════════════════════════
describe('G. Download verification report', () => {
    test('G1: buildVerificationReportText returns a non-empty string after submission + tab load', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('strategy1');
        const text = p.buildVerificationReportText();
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
        expect(text).toMatch(/verification report/i);
        expect(text).toMatch(/Loaded tab\s*:\s*strategy1/);
    });

    test('G2: report text includes per-strategy summary rows', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('strategy1');
        const text = p.buildVerificationReportText();
        expect(text).toMatch(/Strategy 1:/);
        expect(text).toMatch(/Strategy 2:/);
        expect(text).toMatch(/Strategy 3:/);
    });

    test('G3: report is empty when nothing has been submitted', () => {
        const p = new ResultTestingPanel();
        expect(p.buildVerificationReportText()).toBe('');
    });

    test('G4: downloadVerificationReport returns false when nothing to download', () => {
        const p = new ResultTestingPanel();
        expect(p.downloadVerificationReport()).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  H. Defensive handling
// ═══════════════════════════════════════════════════════════════════
describe('H. Defensive handling', () => {
    test('H1: HTML escaping prevents injection via testFile / method', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ testFile: '<script>alert(1)</script>', method: 'x<y' }));
        const info = document.getElementById('resultTestingSubmissionInfo').innerHTML;
        expect(info).not.toMatch(/<script>alert\(1\)<\/script>/);
        expect(info).toMatch(/&lt;script&gt;/);
        expect(info).toMatch(/x&lt;y/);
    });

    test('H2: processTabEntry without a render function does not throw', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(() => p.processTabEntry('overview')).not.toThrow();
    });

    test('H3: processTabEntry without aiAutoModeUI does not throw', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(() => p.processTabEntry('strategy1')).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════
//  I. Auto Test UI integration (Submit-to test button)
// ═══════════════════════════════════════════════════════════════════
describe('I. AutoTestUI ↔ ResultTestingPanel hand-off', () => {
    const { AutoTestUI } = require('../../app/auto-test-ui');

    beforeEach(() => {
        // Make sure the Auto Test container exists for createUI.
        if (!document.getElementById('autoTestContainer')) {
            const c = document.createElement('div');
            c.id = 'autoTestContainer';
            document.body.appendChild(c);
        }
    });

    test('I1: Auto Test header includes a Submit-to test button (disabled by default)', () => {
        new AutoTestUI();
        const btn = document.getElementById('autoTestSubmitBtn');
        expect(btn).not.toBeNull();
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toMatch(/Submit-to test/);
    });

    test('I2: Submit-to test button sits in the Auto Test header next to Export', () => {
        new AutoTestUI();
        const exportBtn = document.getElementById('autoTestExportBtn');
        const submitBtn = document.getElementById('autoTestSubmitBtn');
        expect(exportBtn.parentNode).toBe(submitBtn.parentNode);
        // Submit appears AFTER Export in DOM order.
        expect(exportBtn.nextElementSibling).toBe(submitBtn);
    });

    test('I3: submitToResultTesting() returns false when no run has completed', () => {
        const ui = new AutoTestUI();
        window.resultTestingPanel = new ResultTestingPanel();
        expect(ui.submitToResultTesting()).toBe(false);
    });

    test('I4: submitToResultTesting() hands off to window.resultTestingPanel.submit', () => {
        const ui = new AutoTestUI();
        ui.result = makeAutoTestResult();
        const received = [];
        window.resultTestingPanel = {
            submit: (r) => { received.push(r); return true; }
        };
        expect(ui.submitToResultTesting()).toBe(true);
        expect(received.length).toBe(1);
        expect(received[0]).toBe(ui.result);
    });

    test('I5: clicking the button invokes the hand-off', () => {
        const ui = new AutoTestUI();
        ui.result = makeAutoTestResult();
        const panel = new ResultTestingPanel();
        window.resultTestingPanel = panel;
        // jsdom ignores click events on disabled buttons, so enable
        // first — mirroring the real post-run state where the button
        // becomes clickable once Auto Test completes.
        const btn = document.getElementById('autoTestSubmitBtn');
        btn.disabled = false;
        btn.click();
        expect(panel.submitted).toBe(ui.result);
    });

    test('I6: submit button is disabled on run start and re-enabled on success', async () => {
        // Install mocks so runTest completes successfully.
        global.AutoTestRunner = class {
            constructor(engine) { if (!engine || !engine.isTrained) throw new Error('bad'); }
            async runAll(spins, options) {
                return makeAutoTestResult({ testFile: options.testFile, totalTestSpins: spins.length });
            }
        };
        window.aiAutoEngine = { isTrained: true };
        const ui = new AutoTestUI();
        ui.testSpins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        ui.testFileName = 'run.txt';
        const btn = document.getElementById('autoTestSubmitBtn');
        expect(btn.disabled).toBe(true);
        await ui.runTest();
        expect(btn.disabled).toBe(false);
        // result.testSpins is stashed on the result for downstream consumers.
        expect(Array.isArray(ui.result.testSpins)).toBe(true);
        expect(ui.result.testSpins.length).toBe(10);
    });
});
