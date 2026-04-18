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
    // Realistic session objects matching AutoTestRunner._buildSessionResult
    // — startIdx, strategy, outcome, finalProfit, totalSpins, totalBets,
    //   wins, losses, winRate, maxDrawdown, peakProfit, steps.
    const mkSession = (startIdx, strategy, outcome, finalProfit, extras = {}) => Object.assign({
        startIdx, strategy, outcome,
        finalBankroll: 4000 + finalProfit,
        finalProfit,
        totalSpins: 20,
        totalBets: 15,
        totalSkips: 5,
        wins: outcome === 'WIN' ? 8 : 3,
        losses: outcome === 'WIN' ? 7 : 12,
        winRate: outcome === 'WIN' ? 0.53 : 0.2,
        maxDrawdown: outcome === 'BUST' ? 400 : 120,
        peakProfit: Math.max(0, finalProfit),
        steps: [
            { action: 'BET', pnl: 60 },
            { action: 'BET', pnl: -25 },
            { action: 'BET', pnl: 80 },
            { action: 'BET', pnl: -40 },
            { action: 'SKIP', pnl: 0 }
        ]
    }, extras);
    return Object.assign({
        testFile: 'test-session.txt',
        totalTestSpins: 60,
        method: 'auto-test',
        timestamp: '2026-04-18T10:00:00.000Z',
        testSpins: Array.from({ length: 60 }, (_, i) => i % 37),
        strategies: {
            1: {
                sessions: [
                    mkSession(0, 1, 'WIN',   120),
                    mkSession(9, 1, 'BUST', -350),
                    mkSession(17, 1, 'INCOMPLETE', 30)
                ],
                summary: mkSummary(3, 1, 1, -100)
            },
            2: {
                sessions: [ mkSession(0, 2, 'WIN', 100), mkSession(12, 2, 'WIN', 200) ],
                summary: mkSummary(2, 2, 0, 200)
            },
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

    test('E3: processTabEntry switches AI mode according to the mode dropdown', () => {
        // Under the new dropdown-driven flow the tab-replay branch
        // honours whatever mode the user has selected (default seeded
        // from submitted.method). Fixture's method is 'auto-test' →
        // default AI mode 'auto'. If the user overrides to 'manual'
        // via the dropdown, the replay uses 'manual' instead.
        const calls = [];
        window.aiAutoModeUI = { setMode: (m) => { calls.push(m); } };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        // Default (auto-test → auto) replay:
        let out = p.processTabEntry('strategy1');
        expect(out.ok).toBe(true);
        expect(calls).toContain('auto');

        // User overrides the dropdown to 'manual' → replay must honour it.
        const modeSel = document.getElementById('resultTestingModeSelect');
        modeSel.value = 'manual';
        modeSel.dispatchEvent(new Event('change'));
        out = p.processTabEntry('strategy1');
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

// ═══════════════════════════════════════════════════════════════════
//  J. Session-identifier replay (S{strategy}-Start{startIdx})
// ═══════════════════════════════════════════════════════════════════
//
// Mirrors the session detail sheet naming produced by the Auto Test
// report (app/auto-test-report.js _createSessionSheet:
//     `S${strategyNum}-Start${session.startIdx}`).
// These tests lock in that typing that exact label in the Result-
// testing tab-input resolves the matching session, loads only its
// spin window into window.spins, switches the app to Manual mode,
// and renders a session-scoped comparison card.
//
describe('J. resolveSessionRef + session replay', () => {
    test('J1: resolveSessionRef parses "S1-Start9" into {strategy:1, startIdx:9}', () => {
        const p = new ResultTestingPanel();
        expect(p.resolveSessionRef('S1-Start9')).toEqual({ strategy: 1, startIdx: 9 });
    });

    test('J2: resolveSessionRef is case/whitespace/separator tolerant', () => {
        const p = new ResultTestingPanel();
        expect(p.resolveSessionRef('s2-start12')).toEqual({ strategy: 2, startIdx: 12 });
        expect(p.resolveSessionRef('  S3 - Start 0  ')).toEqual({ strategy: 3, startIdx: 0 });
        expect(p.resolveSessionRef('S1_Start5')).toEqual({ strategy: 1, startIdx: 5 });
    });

    test('J3: invalid session refs return null (strategy out of range, bad format)', () => {
        const p = new ResultTestingPanel();
        expect(p.resolveSessionRef('S4-Start9')).toBeNull();   // no strategy 4
        expect(p.resolveSessionRef('S0-Start9')).toBeNull();   // strategy 0 invalid
        expect(p.resolveSessionRef('Strat1-9')).toBeNull();
        expect(p.resolveSessionRef('overview')).toBeNull();
        expect(p.resolveSessionRef('')).toBeNull();
        expect(p.resolveSessionRef(null)).toBeNull();
    });

    test('J4: findSession locates the correct session by {strategy, startIdx}', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const s = p.findSession({ strategy: 1, startIdx: 9 });
        expect(s).not.toBeNull();
        expect(s.startIdx).toBe(9);
        expect(s.strategy).toBe(1);
        expect(s.outcome).toBe('BUST');
    });

    test('J5: findSession returns null when no session matches', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(p.findSession({ strategy: 3, startIdx: 0 })).toBeNull(); // strat 3 has no sessions
        expect(p.findSession({ strategy: 1, startIdx: 999 })).toBeNull();
    });

    test('J6: processTabEntry("S1-Start9") loads only that session window into window.spins', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.kind).toBe('session');
        expect(out.ref).toEqual({ strategy: 1, startIdx: 9 });
        expect(out.sessionLabel).toBe('S1-Start9');
        // testSpins is length 60, startIdx 9 → window length 51.
        expect(window.spins.length).toBe(60 - 9);
        // The first spin in the window matches testSpins[9].
        const res = makeAutoTestResult();
        expect(window.spins[0].actual).toBe(res.testSpins[9]);
    });

    test('J7: processTabEntry("S1-Start9") switches aiAutoModeUI to match the Auto Test method', () => {
        // Default fixture's method is 'auto-test' → live AI mode 'auto'.
        const setCalls = [];
        window.aiAutoModeUI = { setMode: (m) => setCalls.push(m) };
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.aiMode).toBe('auto');
        expect(setCalls).toContain('auto');
    });

    test('J8: comparison HTML shows the session label, strategy, outcome, and Auto-Test dollar totals', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        const html = document.getElementById('resultTestingComparison').innerHTML;
        // Session label rendered clearly.
        expect(html).toMatch(/S1-Start9/);
        // Strategy + outcome present (BUST for our fixture).
        expect(html).toMatch(/Strategy\s*1/);
        expect(html).toMatch(/BUST/);
        // Auto-Test-parity dollar-total columns are rendered with
        // stable data-field anchors.
        expect(html).toMatch(/data-field="session-totalWon"/);
        expect(html).toMatch(/data-field="session-totalLost"/);
        expect(html).toMatch(/data-field="session-totalPL"/);
        // Total Win $ / Total Loss $ / Total P&L labels present.
        expect(html).toMatch(/Total Win \$/);
        expect(html).toMatch(/Total Loss \$/);
        expect(html).toMatch(/Total P&amp;L/); // HTML-escaped
    });

    test('J9: dollar totals are computed from steps[].pnl (140 / 65 / 75 for the fixture)', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start9');
        // Steps: +60, -25, +80, -40, 0. Won=140, Lost=65, PL=75.
        const html = document.getElementById('resultTestingComparison').innerHTML;
        const won  = html.match(/data-field="session-totalWon"[^>]*>\$(\d[\d,]*)/);
        const lost = html.match(/data-field="session-totalLost"[^>]*>\$(\d[\d,]*)/);
        const pl   = html.match(/data-field="session-totalPL"[^>]*>\$(-?\d[\d,]*)/);
        expect(won[1]).toBe('140');
        expect(lost[1]).toBe('65');
        expect(pl[1]).toBe('75');
    });

    test('J10: download button is enabled after a valid session replay', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(true);
        p.processTabEntry('S1-Start9');
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(false);
    });

    test('J11: verification report text includes the session block when a session was loaded', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start9');
        const text = p.buildVerificationReportText();
        expect(text).toMatch(/Loaded tab\s*:\s*S1-Start9/);
        expect(text).toMatch(/Session\s*:\s*S1-Start9/);
        expect(text).toMatch(/Total Win \$/);
        expect(text).toMatch(/Total Loss\$/);
        expect(text).toMatch(/Total P&L/);
    });

    test('J12: unknown session id yields ok=false with a specific error code', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('S1-Start999');
        expect(out.ok).toBe(false);
        expect(out.error).toBe('session-not-found');
        expect(document.getElementById('resultTestingMessage').textContent)
            .toMatch(/Session.*S1-Start999.*not found/);
    });

    test('J13: invalid session id (wrong strategy) is rejected cleanly', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('S7-Start9');
        expect(out.ok).toBe(false);
        // Falls through to tab-name parser which also rejects it.
        expect(out.error).toBe('invalid-tab');
        expect(document.getElementById('resultTestingMessage').textContent)
            .toMatch(/session id.*S1-Start9/i);
    });

    test('J14: session replay does not break the existing generic tab flow', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start9');
        // Then issue a generic tab-name request.
        const out = p.processTabEntry('overview');
        expect(out.ok).toBe(true);
        expect(out.kind).toBe('tab');
        expect(out.tabName).toBe('overview');
        // Overview comparison fully overwrites the previous session
        // card so the UI is consistent.
        const html = document.getElementById('resultTestingComparison').innerHTML;
        expect(html).toMatch(/Strategy 1/);
        expect(html).toMatch(/Strategy 2/);
        expect(html).toMatch(/Strategy 3/);
    });

    test('J15: Enter in the input box triggers session replay end-to-end', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const input = document.getElementById('resultTestingTabInput');
        input.value = 'S1-Start9';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(p.lastTabLoaded).toBe('S1-Start9');
        expect(window.spins.length).toBe(60 - 9);
        const html = document.getElementById('resultTestingComparison').innerHTML;
        expect(html).toMatch(/S1-Start9/);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  K. Strategy-match on session replay (Auto Test method → live AI mode)
// ═══════════════════════════════════════════════════════════════════
//
// When the user submits an Auto Test run, result.method records which
// Auto Test method was used. For session replay to produce a valid
// comparison, the live AI prediction panel must switch to the
// matching mode — T1-strategy in the user's screenshot case. These
// tests lock in the mapping:
//   result.method 'T1-strategy'    → AI mode 't1-strategy'
//   result.method 'test-strategy'  → AI mode 'auto'
//   result.method 'auto-test'      → AI mode 'auto'
//   anything else / missing        → AI mode 'manual'
//
describe('K. Session replay mirrors Auto Test method as the live AI mode', () => {
    let setCalls;
    beforeEach(() => {
        setCalls = [];
        window.aiAutoModeUI = { setMode: (m) => setCalls.push(m) };
    });

    test('K1: mapAutoTestMethodToAiMode mapping is exhaustive', () => {
        const p = new ResultTestingPanel();
        expect(p._mapAutoTestMethodToAiMode('T1-strategy')).toBe('t1-strategy');
        expect(p._mapAutoTestMethodToAiMode('test-strategy')).toBe('auto');
        expect(p._mapAutoTestMethodToAiMode('auto-test')).toBe('auto');
        expect(p._mapAutoTestMethodToAiMode('')).toBe('manual');
        expect(p._mapAutoTestMethodToAiMode(undefined)).toBe('manual');
        expect(p._mapAutoTestMethodToAiMode('bogus')).toBe('manual');
    });

    test('K2: screenshot case — method="T1-strategy" + session S1-Start9 → AI mode t1-strategy', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.aiMode).toBe('t1-strategy');
        expect(setCalls).toContain('t1-strategy');
    });

    test('K3: method="test-strategy" session replay → AI mode auto', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'test-strategy' }));
        const out = p.processTabEntry('S1-Start9');
        expect(out.aiMode).toBe('auto');
        expect(setCalls).toContain('auto');
    });

    test('K4: method="auto-test" (default) session replay → AI mode auto', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'auto-test' }));
        const out = p.processTabEntry('S1-Start9');
        expect(out.aiMode).toBe('auto');
        expect(setCalls).toContain('auto');
    });

    test('K5: no method on result → fallback to manual mode', () => {
        const p = new ResultTestingPanel();
        // Clear the method explicitly on the result.
        const r = makeAutoTestResult();
        delete r.method;
        p.submit(r);
        const out = p.processTabEntry('S1-Start9');
        expect(out.aiMode).toBe('manual');
        expect(setCalls).toContain('manual');
    });

    test('K6: comparison card surfaces the Auto Test method AND the live AI mode being used', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        p.processTabEntry('S1-Start9');
        const html = document.getElementById('resultTestingComparison').innerHTML;
        // Tells the user which method produced the session and which
        // live mode is now replaying it — so the comparison is visibly
        // apples-to-apples.
        expect(html).toMatch(/data-field="session-ai-mode"/);
        expect(html).toMatch(/T1-strategy/);
        expect(html).toMatch(/T1-STRATEGY/);
    });

    test('K7: status message reports the AI mode used for replay', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        p.processTabEntry('S1-Start9');
        expect(document.getElementById('resultTestingMessage').textContent)
            .toMatch(/T1-STRATEGY mode/);
    });

    test('K8: does not throw / still replays when window.aiAutoModeUI is absent', () => {
        delete window.aiAutoModeUI;
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        expect(() => p.processTabEntry('S1-Start9')).not.toThrow();
        expect(window.spins.length).toBe(60 - 9);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  L. Mode dropdown (explicit user override)
// ═══════════════════════════════════════════════════════════════════
//
// The Result-testing panel exposes a dropdown so the user can pick
// which live AI mode drives the session replay — 'manual', 'semi',
// 'auto', or 't1-strategy'. On submit() the dropdown is seeded to
// the AI mode that matches the submitted Auto Test method (apples-
// to-apples default) but the user can override it before clicking
// Run. The replay (both the session branch and the tab branch)
// honours the dropdown, not the Auto Test method directly.
//
const { RESULT_TESTING_MODES, RESULT_TESTING_DEFAULT_MODE } = require('../../app/result-testing-panel');

describe('L. Mode dropdown (user override for replay)', () => {
    let setCalls;
    beforeEach(() => {
        setCalls = [];
        window.aiAutoModeUI = { setMode: (m) => setCalls.push(m) };
    });

    test('L1: dropdown exists with exactly the four supported modes', () => {
        new ResultTestingPanel();
        const sel = document.getElementById('resultTestingModeSelect');
        expect(sel).not.toBeNull();
        expect(sel.tagName).toBe('SELECT');
        const values = Array.from(sel.querySelectorAll('option')).map(o => o.value);
        // Order matters only visually — enforce presence + count.
        expect(values).toEqual(expect.arrayContaining(['manual', 'semi', 'auto', 't1-strategy']));
        expect(values.length).toBe(4);
    });

    test('L2: fresh panel seeds the dropdown to the default mode', () => {
        const p = new ResultTestingPanel();
        const sel = document.getElementById('resultTestingModeSelect');
        expect(sel.value).toBe(RESULT_TESTING_DEFAULT_MODE);
        expect(p.selectedMode).toBe(RESULT_TESTING_DEFAULT_MODE);
    });

    test('L3: submit() with method=T1-strategy re-seeds the dropdown to t1-strategy', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const sel = document.getElementById('resultTestingModeSelect');
        expect(sel.value).toBe('t1-strategy');
        expect(p.getSelectedMode()).toBe('t1-strategy');
    });

    test('L4: submit() with method=auto-test re-seeds the dropdown to auto', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'auto-test' }));
        expect(document.getElementById('resultTestingModeSelect').value).toBe('auto');
    });

    test('L5: submit() with missing method re-seeds the dropdown to manual', () => {
        const p = new ResultTestingPanel();
        const r = makeAutoTestResult();
        delete r.method;
        p.submit(r);
        expect(document.getElementById('resultTestingModeSelect').value).toBe('manual');
    });

    test('L6: changing the dropdown updates this.selectedMode (change event)', () => {
        const p = new ResultTestingPanel();
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'semi';
        sel.dispatchEvent(new Event('change'));
        expect(p.selectedMode).toBe('semi');
        expect(p.getSelectedMode()).toBe('semi');
    });

    test('L7: user override beats the submit()-seeded default in session replay', () => {
        // Auto Test method says t1-strategy, but user overrides to semi
        // BEFORE clicking Run. Replay must use semi.
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'semi';
        sel.dispatchEvent(new Event('change'));
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.aiMode).toBe('semi');
        expect(setCalls).toContain('semi');
        expect(setCalls).not.toContain('t1-strategy');
    });

    test('L8: user override beats the seeded default in tab replay', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'auto-test' }));
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 't1-strategy';
        sel.dispatchEvent(new Event('change'));
        const out = p.processTabEntry('strategy1');
        expect(out.ok).toBe(true);
        expect(out.aiMode).toBe('t1-strategy');
        expect(setCalls).toContain('t1-strategy');
    });

    test('L9: unknown dropdown values are ignored — selectedMode stays stable', () => {
        const p = new ResultTestingPanel();
        p.selectedMode = 'auto';
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'not-a-mode';
        sel.dispatchEvent(new Event('change'));
        // selectedMode unchanged.
        expect(p.selectedMode).toBe('auto');
        // getSelectedMode falls back via: DOM not in list → instance
        // state → which is still 'auto'.
        expect(p.getSelectedMode()).toBe('auto');
    });

    test('L10: getSelectedMode prefers the DOM value when valid, falls back otherwise', () => {
        const p = new ResultTestingPanel();
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'auto';
        sel.dispatchEvent(new Event('change'));
        expect(p.getSelectedMode()).toBe('auto');
        // Blow away the dropdown element entirely.
        sel.remove();
        expect(p.getSelectedMode()).toBe('auto'); // falls back to this.selectedMode
    });

    test('L11: session-id replay still works with a user-overridden mode', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'auto';
        sel.dispatchEvent(new Event('change'));
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.kind).toBe('session');
        expect(out.aiMode).toBe('auto');
        expect(window.spins.length).toBe(60 - 9);
    });

    test('L12: comparison card reflects the user-overridden mode', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'semi';
        sel.dispatchEvent(new Event('change'));
        p.processTabEntry('S1-Start9');
        const html = document.getElementById('resultTestingComparison').innerHTML;
        expect(html).toMatch(/data-field="session-ai-mode"/);
        // The card announces the replay mode — user selected SEMI even
        // though the Auto Test method was T1-strategy.
        expect(html).toMatch(/SEMI/);
        // Auto Test method is still shown (so comparison is unambiguous).
        expect(html).toMatch(/T1-strategy/);
    });

    test('L13: download verification report still works after dropdown change', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'auto-test' }));
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 't1-strategy';
        sel.dispatchEvent(new Event('change'));
        p.processTabEntry('S1-Start9');
        // Download button enabled after replay.
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(false);
        // Report text renders (non-empty).
        expect(p.buildVerificationReportText().length).toBeGreaterThan(0);
    });

    test('L14: exported constants list matches the DOM options', () => {
        new ResultTestingPanel();
        const sel = document.getElementById('resultTestingModeSelect');
        const values = Array.from(sel.querySelectorAll('option')).map(o => o.value);
        expect(RESULT_TESTING_MODES.slice().sort()).toEqual(values.slice().sort());
        expect(RESULT_TESTING_DEFAULT_MODE).toBe('manual');
    });

    test('L15: status message reports the mode actually used (not the seeded default)', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const sel = document.getElementById('resultTestingModeSelect');
        sel.value = 'manual';
        sel.dispatchEvent(new Event('change'));
        p.processTabEntry('S1-Start9');
        expect(document.getElementById('resultTestingMessage').textContent)
            .toMatch(/MANUAL mode/);
    });
});
