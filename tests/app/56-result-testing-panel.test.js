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
    //
    // The steps array is the authoritative replay length (one entry
    // per spin observation, same contract as the real runner). For
    // the fixture we use 20 steps so tests can assert the session-
    // bounded replay is exactly 20 spins — NOT the 51-spin file tail
    // that the pre-fix slice would have produced.
    const mkSession = (startIdx, strategy, outcome, finalProfit, extras = {}) => {
        const steps = [];
        // 3 WATCH spins (matches the runner's Phase 1 live loop).
        for (let i = 0; i < 3; i++) steps.push({ action: 'WATCH', pnl: 0 });
        // Mix of BET / SKIP entries totalling 17 → session length 20.
        const liveActions = [
            { action: 'BET', pnl: 60 }, { action: 'BET', pnl: -25 },
            { action: 'BET', pnl: 80 }, { action: 'BET', pnl: -40 },
            { action: 'SKIP', pnl: 0 }, { action: 'BET', pnl: 30 },
            { action: 'BET', pnl: -20 }, { action: 'BET', pnl: 50 },
            { action: 'SKIP', pnl: 0 }, { action: 'BET', pnl: -15 },
            { action: 'BET', pnl: 40 }, { action: 'BET', pnl: -35 },
            { action: 'BET', pnl: 25 }, { action: 'SKIP', pnl: 0 },
            { action: 'BET', pnl: -50 }, { action: 'BET', pnl: 90 },
            { action: 'BET', pnl: -60 }
        ];
        for (const a of liveActions) steps.push(a);
        return Object.assign({
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
            steps
        }, extras);
    };
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
    // Clear live-session globals too so dangling async replays scheduled
    // by earlier tests (J/K/L tests don't await the replay) don't tick
    // the next test's fresh moneyPanel stub. replaySessionLive guards
    // on the presence of these globals, so setting them undefined
    // makes the scheduled replay no-op harmlessly.
    delete window.moneyPanel;
    delete window.autoUpdateOrchestrator;
    // Cancel any replay setTimeouts scheduled by earlier tests so they
    // cannot fire into the current test's freshly-installed stubs.
    if (typeof ResultTestingPanel.cancelPendingReplays === 'function') {
        ResultTestingPanel.cancelPendingReplays();
    }
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
        expect(window.spins.length).toBe(20);
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

    test('J9: dollar totals are computed from steps[].pnl (375 / 245 / 130 for the fixture)', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        p.processTabEntry('S1-Start9');
        // Fixture steps (20 entries, 3 WATCH pnl=0 + 17 live actions).
        // Positives: 60+80+30+50+40+25+90 = 375.
        // Negatives: 25+40+20+15+35+50+60 = 245.
        // Net P&L: 375 − 245 = 130.
        const html = document.getElementById('resultTestingComparison').innerHTML;
        const won  = html.match(/data-field="session-totalWon"[^>]*>\$(\d[\d,]*)/);
        const lost = html.match(/data-field="session-totalLost"[^>]*>\$(\d[\d,]*)/);
        const pl   = html.match(/data-field="session-totalPL"[^>]*>\$(-?\d[\d,]*)/);
        expect(won[1]).toBe('375');
        expect(lost[1]).toBe('245');
        expect(pl[1]).toBe('130');
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
        expect(window.spins.length).toBe(20);
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
        expect(window.spins.length).toBe(20);
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
        expect(window.spins.length).toBe(20);
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

// ═══════════════════════════════════════════════════════════════════
//  M. Live replay with money management
// ═══════════════════════════════════════════════════════════════════
//
// Replay must step through the chosen session one spin at a time and
// tick both the money-panel bet-resolution loop and the orchestrator
// decision cascade on every step — matching how a real live session
// runs. These tests install lightweight stubs for moneyPanel and
// autoUpdateOrchestrator that count invocations, then assert the
// replay drives them the same number of times as the session window.
//
describe('M. Live replay (spin-by-spin, with money management)', () => {
    function makeMoneyPanelStub() {
        const calls = [];
        const bets = [];
        return {
            lastSpinCount: 0,
            isSessionActive: true,
            isBettingEnabled: true,
            pendingBet: null,
            sessionData: { totalBets: 0, totalWins: 0, totalLosses: 0 },
            betHistory: [],
            async checkForNewSpin() {
                calls.push(window.spins.length);
                // Simulate resolving a pendingBet if one exists.
                if (this.pendingBet && window.spins.length > this.lastSpinCount) {
                    const last = window.spins[window.spins.length - 1].actual;
                    const hit = this.pendingBet.predictedNumbers.includes(last);
                    const pnl = hit ? this.pendingBet.betAmount * this.pendingBet.numbersCount : -this.pendingBet.betAmount * this.pendingBet.numbersCount;
                    this.sessionData.totalBets++;
                    if (hit) this.sessionData.totalWins++;
                    else this.sessionData.totalLosses++;
                    bets.push({ spin: last, hit, pnl });
                    this.betHistory.push({
                        spin: this.sessionData.totalBets,
                        betAmount: this.pendingBet.betAmount,
                        totalBet: this.pendingBet.betAmount * this.pendingBet.numbersCount,
                        hit, actualNumber: last, netChange: pnl, timestamp: `t${this.sessionData.totalBets}`
                    });
                    this.pendingBet = null;
                }
                this.lastSpinCount = window.spins.length;
            },
            setPrediction(pred) {
                if (this.isBettingEnabled) {
                    this.pendingBet = {
                        predictedNumbers: pred.numbers || [],
                        numbersCount: (pred.numbers || []).length,
                        betAmount: 2,
                        confidence: pred.confidence || 0
                    };
                }
            },
            _calls: calls,
            _bets: bets
        };
    }

    function makeOrchestratorStub(decisionFactory) {
        const calls = [];
        return {
            autoMode: true,
            decisionMode: 'auto',
            setAutoMode(x) { this.autoMode = !!x; },
            setDecisionMode() {},
            async handleAutoMode() {
                calls.push(window.spins.length);
                const decision = decisionFactory
                    ? decisionFactory(window.spins.length)
                    : { action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both', numbers: [5, 17, 22] };
                if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function' && decision.action === 'BET') {
                    window.moneyPanel.setPrediction(decision);
                }
            },
            _calls: calls
        };
    }

    beforeEach(() => {
        window.aiAutoModeUI = { setMode: () => {} };
    });

    test('M1: replaySessionLive steps through each spin and ticks the money panel', async () => {
        const money = makeMoneyPanelStub();
        window.moneyPanel = money;
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        const result = await p.replaySessionLive([10, 15, 20, 18, 29]);
        expect(result.stepped).toBe(5);
        expect(money._calls.length).toBe(5);
        // Money panel saw the spin count growing on each step.
        expect(money._calls).toEqual([1, 2, 3, 4, 5]);
    });

    test('M2: replay ticks the orchestrator on every step when autoMode is on', async () => {
        window.moneyPanel = makeMoneyPanelStub();
        const orch = makeOrchestratorStub();
        window.autoUpdateOrchestrator = orch;
        const p = new ResultTestingPanel();
        await p.replaySessionLive([1, 2, 3, 4]);
        expect(orch._calls.length).toBe(4);
    });

    test('M3: replay does NOT tick the orchestrator when autoMode is off (manual/semi)', async () => {
        window.moneyPanel = makeMoneyPanelStub();
        const orch = makeOrchestratorStub();
        orch.autoMode = false;
        window.autoUpdateOrchestrator = orch;
        const p = new ResultTestingPanel();
        await p.replaySessionLive([1, 2, 3]);
        expect(orch._calls.length).toBe(0);
    });

    test('M4: bet history grows during replay (money management engaged spin-by-spin)', async () => {
        const money = makeMoneyPanelStub();
        window.moneyPanel = money;
        // Orchestrator emits a BET on every step with predicted numbers
        // that include some of the replay spins, so some wins resolve.
        window.autoUpdateOrchestrator = makeOrchestratorStub(() => ({
            action: 'BET', selectedPair: 'prev', selectedFilter: 'both_both',
            numbers: [10, 15, 20, 18, 29]
        }));
        const p = new ResultTestingPanel();
        await p.replaySessionLive([10, 15, 20, 18, 29]);
        // First step: no pendingBet yet → no bet. Then orchestrator
        // sets one. Subsequent 4 steps resolve the prior pendingBet.
        expect(money.sessionData.totalBets).toBe(4);
        expect(money.betHistory.length).toBe(4);
        // Every predicted number above is in the replay list, so all 4 bets hit.
        expect(money.sessionData.totalWins).toBe(4);
    });

    test('M5: replay processes every spin as new (stale lastSpinCount does not block)', async () => {
        const money = makeMoneyPanelStub();
        money.lastSpinCount = 42; // simulate a stale watermark from earlier play
        window.moneyPanel = money;
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        await p.replaySessionLive([1, 2, 3]);
        // Even with lastSpinCount pre-seeded to a stale value, the
        // replay temporarily zeroes it so checkForNewSpin fires once
        // per replayed spin. The stub records each call.
        expect(money._calls.length).toBe(3);
        // Post-replay the flag/watermark state is restored to what
        // the user had before (42), so ordinary live play after a
        // replay continues from the user's prior state.
        expect(money.lastSpinCount).toBe(42);
    });

    test('M6: replay resets window.spins and repopulates it exactly from the session window', async () => {
        window.spins = [{ actual: 99 }, { actual: 88 }]; // junk to be cleared
        window.moneyPanel = makeMoneyPanelStub();
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        const spinNums = [10, 15, 20];
        await p.replaySessionLive(spinNums);
        expect(window.spins.length).toBe(3);
        expect(window.spins.map(s => s.actual)).toEqual(spinNums);
    });

    test('M7: processTabEntry session branch schedules a replay on _lastReplayPromise', async () => {
        // The new primary replay path is replayRecordedSession
        // (session.steps-driven), not the orchestrator-cascade
        // replaySessionLive. We add a recordBetResult spy to the
        // stub so the session-driven BET steps get counted.
        const money = makeMoneyPanelStub();
        money.recordBetResult = jest.fn(async () => {});
        money.sessionData.isSessionActive = false;
        money.sessionData.isBettingEnabled = false;
        window.moneyPanel = money;
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.kind).toBe('session');
        // Sync state is observable BEFORE the deferred replay runs.
        expect(window.spins.length).toBe(20);
        expect(p._lastReplayPromise).not.toBeNull();
        await p.waitForReplay();
        // After the deferred replay, the session's BET steps were
        // fed into recordBetResult. Fixture has 15 BET entries
        // (3 WATCH + 12 BETs + some SKIPs in the 20-step mix).
        expect(money.recordBetResult.mock.calls.length).toBeGreaterThan(0);
    });

    test('M8: waitForReplay resolves immediately when no replay is in flight', async () => {
        const p = new ResultTestingPanel();
        const ok = await p.waitForReplay();
        expect(ok).toBe(true);
    });

    test('M9: replay with an empty windowSpins returns stepped=0 without throwing', async () => {
        window.moneyPanel = makeMoneyPanelStub();
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        const r1 = await p.replaySessionLive([]);
        const r2 = await p.replaySessionLive(null);
        expect(r1.stepped).toBe(0);
        expect(r2.stepped).toBe(0);
    });

    test('M10: replay tolerates missing moneyPanel / missing orchestrator', async () => {
        delete window.moneyPanel;
        delete window.autoUpdateOrchestrator;
        const p = new ResultTestingPanel();
        const result = await p.replaySessionLive([1, 2, 3]);
        expect(result.stepped).toBe(3);
        expect(window.spins.length).toBe(3);
    });

    test('M11: replay call from processTabEntry preserves session-id resolution and comparison card', async () => {
        window.moneyPanel = makeMoneyPanelStub();
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const out = p.processTabEntry('S1-Start9');
        // Sync comparison card rendered with the session details.
        const html = document.getElementById('resultTestingComparison').innerHTML;
        expect(html).toMatch(/S1-Start9/);
        expect(html).toMatch(/data-field="session-totalPL"/);
        // Replay completes end-to-end.
        await p.waitForReplay();
        // Download still works.
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(false);
        expect(p.buildVerificationReportText().length).toBeGreaterThan(0);
        // And out object has the replay promise wired up.
        expect(out.replay).toBe(p._lastReplayPromise);
    });

    test('M12: replay still runs under manual mode (money panel resolves bets if user preset them)', async () => {
        const money = makeMoneyPanelStub();
        // Simulate the user having placed a bet manually before replay.
        money.pendingBet = { predictedNumbers: [10, 15], numbersCount: 2, betAmount: 2, confidence: 75 };
        window.moneyPanel = money;
        // Manual mode ⇒ orchestrator autoMode is false ⇒ no new
        // orchestrator ticks happen during replay.
        const orch = makeOrchestratorStub();
        orch.autoMode = false;
        window.autoUpdateOrchestrator = orch;
        const p = new ResultTestingPanel();
        await p.replaySessionLive([10, 20, 30]); // step 1 = 10 → hit
        expect(money.sessionData.totalBets).toBe(1);
        expect(money.sessionData.totalWins).toBe(1);
        expect(orch._calls.length).toBe(0); // manual never ticks the engine
    });

    test('M13: replay never throws even when setPrediction / checkForNewSpin throw', async () => {
        window.moneyPanel = {
            lastSpinCount: 0,
            sessionData: {},
            checkForNewSpin() { throw new Error('money boom'); },
            setPrediction() { throw new Error('pred boom'); }
        };
        window.autoUpdateOrchestrator = {
            autoMode: true,
            async handleAutoMode() { throw new Error('orch boom'); }
        };
        const p = new ResultTestingPanel();
        const r = await p.replaySessionLive([1, 2]);
        expect(r.stepped).toBe(2);
    });

    test('M14: replay force-enables the money panel gates during the loop and restores them after', async () => {
        const money = makeMoneyPanelStub();
        // User had both gates OFF before replay (e.g. betting paused).
        money.sessionData = {
            totalBets: 0, totalWins: 0, totalLosses: 0,
            isSessionActive: false, isBettingEnabled: false
        };
        // Capture the gate values seen during each step.
        const gateSnapshots = [];
        const origCheck = money.checkForNewSpin.bind(money);
        money.checkForNewSpin = async function () {
            gateSnapshots.push({
                active: money.sessionData.isSessionActive,
                betting: money.sessionData.isBettingEnabled
            });
            return origCheck();
        };
        window.moneyPanel = money;
        window.autoUpdateOrchestrator = makeOrchestratorStub();
        const p = new ResultTestingPanel();
        await p.replaySessionLive([1, 2, 3]);
        // During every step of the replay, both gates were TRUE
        // (force-enabled by replaySessionLive) so the real money
        // panel's internal guards would let bets flow.
        expect(gateSnapshots.length).toBe(3);
        for (const snap of gateSnapshots) {
            expect(snap.active).toBe(true);
            expect(snap.betting).toBe(true);
        }
        // After the replay completes, the user's prior state is
        // restored so ordinary live play outside Result-testing is
        // unaffected.
        expect(money.sessionData.isSessionActive).toBe(false);
        expect(money.sessionData.isBettingEnabled).toBe(false);
    });

    test('M15: replay keeps the orchestrator poll quiet (bumps lastSpinCount each step)', async () => {
        window.moneyPanel = makeMoneyPanelStub();
        const orch = makeOrchestratorStub();
        orch.lastSpinCount = 0;
        window.autoUpdateOrchestrator = orch;
        const p = new ResultTestingPanel();
        await p.replaySessionLive([10, 11, 12, 13, 14]);
        // After the replay each spin has been processed and the
        // orchestrator's lastSpinCount matches the final spin count,
        // so its 500ms setInterval (in real life) would see no delta
        // and stay silent until another genuine live spin arrives.
        expect(orch.lastSpinCount).toBe(5);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  N. Integration with the REAL MoneyManagementPanel
// ═══════════════════════════════════════════════════════════════════
//
// M tests used lightweight mocks. N tests use the actual
// MoneyManagementPanel class (via createMoneyPanel from test-setup)
// to catch gaps between the stub shape and the real panel's gates
// (isSessionActive / isBettingEnabled on sessionData, recordBetResult
// flow, etc.). This proves the replay actually engages the production
// money-management path — not just a test-only mock.
//
const { createMoneyPanel } = require('../test-setup');

describe('N. Real MoneyManagementPanel end-to-end replay', () => {
    beforeEach(() => {
        // createMoneyPanel calls setupDOM internally which resets body,
        // so seed the AI panel content afterwards.
        window.aiAutoModeUI = { setMode: () => {} };
    });

    test('N1: replay drives the real money panel — sessionData.totalBets grows', async () => {
        const moneyPanel = createMoneyPanel();
        window.moneyPanel = moneyPanel;
        // Stub orchestrator that provides a BET prediction on every
        // tick, routing it through the real panel's setPrediction.
        // The prediction numbers are chosen to overlap with every
        // replayed spin so bets resolve as wins.
        window.autoUpdateOrchestrator = {
            autoMode: true,
            lastSpinCount: 0,
            async handleAutoMode() {
                moneyPanel.setPrediction({
                    numbers: [5, 17, 22, 33, 10, 8, 15, 2, 0, 36, 30, 20],
                    signal: 'BET NOW',
                    confidence: 80
                });
            }
        };
        // Ensure aiPanelContent exists (setupDOM clears body each test).
        if (!document.getElementById('aiPanelContent')) {
            const c = document.createElement('div');
            c.id = 'aiPanelContent';
            document.body.appendChild(c);
        }
        const p = new ResultTestingPanel();
        const totalBetsBefore = moneyPanel.sessionData.totalBets;
        await p.replaySessionLive([5, 17, 22, 33, 10, 8, 15, 2, 0, 36]);
        // Real money panel recorded bets during the replay.
        expect(moneyPanel.sessionData.totalBets).toBeGreaterThan(totalBetsBefore);
    });

    test('N2: replay leaves the real panel back in its pre-replay gate state', async () => {
        const moneyPanel = createMoneyPanel();
        // User starts with both gates OFF.
        moneyPanel.sessionData.isSessionActive = false;
        moneyPanel.sessionData.isBettingEnabled = false;
        window.moneyPanel = moneyPanel;
        window.autoUpdateOrchestrator = {
            autoMode: true, lastSpinCount: 0,
            async handleAutoMode() {}
        };
        if (!document.getElementById('aiPanelContent')) {
            const c = document.createElement('div');
            c.id = 'aiPanelContent';
            document.body.appendChild(c);
        }
        const p = new ResultTestingPanel();
        await p.replaySessionLive([1, 2, 3]);
        // Gates restored so ordinary live play after the replay is unchanged.
        expect(moneyPanel.sessionData.isSessionActive).toBe(false);
        expect(moneyPanel.sessionData.isBettingEnabled).toBe(false);
    });

    test('N3: replay end-to-end from processTabEntry with the real money panel', async () => {
        const moneyPanel = createMoneyPanel();
        // Pre-enable so the user-visible bet history reflects the replay.
        moneyPanel.sessionData.isSessionActive = true;
        moneyPanel.sessionData.isBettingEnabled = true;
        window.moneyPanel = moneyPanel;
        window.autoUpdateOrchestrator = {
            autoMode: true, lastSpinCount: 0,
            async handleAutoMode() {
                moneyPanel.setPrediction({
                    numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
                    signal: 'BET NOW', confidence: 75
                });
            }
        };
        if (!document.getElementById('aiPanelContent')) {
            const c = document.createElement('div');
            c.id = 'aiPanelContent';
            document.body.appendChild(c);
        }
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        // Sync state observable.
        expect(window.spins.length).toBe(20);
        // Await the deferred replay.
        await p.waitForReplay();
        // Real money panel shows bets recorded during replay.
        expect(moneyPanel.betHistory.length).toBeGreaterThan(0);
        // Comparison card still rendered.
        expect(document.getElementById('resultTestingComparison').innerHTML).toMatch(/S1-Start9/);
        // Download still works.
        expect(document.getElementById('resultTestingDownloadBtn').disabled).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  P. Session-boundary clamp (replay stops at real session length)
// ═══════════════════════════════════════════════════════════════════
//
// Regression fix: the replay used to slice testSpins.slice(startIdx)
// — i.e., the full remainder of the raw file. For a 500-spin file
// and a ~30-spin session that produced hundreds of extra skips
// after the real session end. These tests lock in the new rule:
// the replay window equals the session's own length (steps.length,
// falling back to totalSpins, finally to the file tail).
//
describe('P. Replay window bounded by session length', () => {
    test('P1: _resolveSessionLength prefers session.steps.length', () => {
        const p = new ResultTestingPanel();
        expect(p._resolveSessionLength({ steps: new Array(27).fill({ action: 'BET', pnl: 0 }) })).toBe(27);
    });

    test('P2: _resolveSessionLength falls back to totalSpins when steps missing/empty', () => {
        const p = new ResultTestingPanel();
        expect(p._resolveSessionLength({ totalSpins: 18 })).toBe(18);
        expect(p._resolveSessionLength({ steps: [], totalSpins: 12 })).toBe(12);
    });

    test('P3: _resolveSessionLength returns Infinity when neither is available', () => {
        const p = new ResultTestingPanel();
        expect(_Number_isFiniteSafe(p._resolveSessionLength({}))).toBe(false);
        expect(_Number_isFiniteSafe(p._resolveSessionLength(null))).toBe(false);
    });

    test('P4: processTabEntry session window length matches the session.steps length (NOT file tail)', () => {
        const p = new ResultTestingPanel();
        // Make the testSpins file MUCH longer than the session to
        // prove the clamp: 500 spins total, session starts at 9 and
        // has exactly 20 steps. Pre-fix this would have produced
        // a 491-spin window.
        const res = makeAutoTestResult({
            totalTestSpins: 500,
            testSpins: Array.from({ length: 500 }, (_, i) => i % 37)
        });
        p.submit(res);
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        // The session's steps array (from mkSession) is 20 entries.
        // The replay window MUST be 20 spins, not 491.
        expect(out.spinCount).toBe(20);
        expect(window.spins.length).toBe(20);
    });

    test('P5: a long session with a short tail is clamped to the file length', () => {
        // Session claims 40 steps but file only has 15 spins after
        // startIdx. Window must clamp to 15 (end of file) rather
        // than overrun.
        const p = new ResultTestingPanel();
        const res = makeAutoTestResult({
            totalTestSpins: 20,
            testSpins: Array.from({ length: 20 }, (_, i) => i % 37)
        });
        // Override the first strategy-1 session to start at 5
        // with 40 steps (truncated by file length).
        res.strategies[1].sessions[0] = {
            startIdx: 5, strategy: 1, outcome: 'INCOMPLETE',
            finalBankroll: 4000, finalProfit: 0,
            totalSpins: 40, totalBets: 0, totalSkips: 40,
            wins: 0, losses: 0, winRate: 0, maxDrawdown: 0, peakProfit: 0,
            steps: new Array(40).fill({ action: 'SKIP', pnl: 0 })
        };
        p.submit(res);
        const out = p.processTabEntry('S1-Start5');
        expect(out.ok).toBe(true);
        expect(out.spinCount).toBe(15); // 20 − 5 clamp
        expect(window.spins.length).toBe(15);
    });

    test('P6: falls back to session.totalSpins when steps is missing on the session object', () => {
        const p = new ResultTestingPanel();
        const res = makeAutoTestResult({
            totalTestSpins: 200,
            testSpins: Array.from({ length: 200 }, (_, i) => i % 37)
        });
        // Remove steps on the session; keep totalSpins=17.
        const s = res.strategies[1].sessions.find(x => x.startIdx === 9);
        s.steps = [];
        s.totalSpins = 17;
        p.submit(res);
        const out = p.processTabEntry('S1-Start9');
        expect(out.spinCount).toBe(17);
        expect(window.spins.length).toBe(17);
    });

    test('P7: money panel is driven only for the session window — NO over-run skips', async () => {
        // Direct user-reported bug: replay was causing Skips: 597/5
        // because the money panel was driven 500+ times past the
        // real session end. Post-fix: the authoritative replay uses
        // session.steps (20 entries). The session-driver calls
        // recordBetResult for each BET step and advances window.spins
        // one step per session.steps entry — so the total spin-push
        // count equals session.steps.length, never the file-tail
        // length (491).
        const money = {
            lastSpinCount: 0,
            sessionData: { totalBets: 0, totalWins: 0, totalLosses: 0,
                           isSessionActive: false, isBettingEnabled: false },
            betHistory: [],
            pendingBet: null,
            betCalls: 0,
            async recordBetResult() { this.betCalls++; },
            setPrediction() {},
            render() {}
        };
        window.moneyPanel = money;
        window.autoUpdateOrchestrator = {
            autoMode: true, lastSpinCount: 0,
            async handleAutoMode() {}
        };
        if (!document.getElementById('aiPanelContent')) {
            const c = document.createElement('div');
            c.id = 'aiPanelContent';
            document.body.appendChild(c);
        }
        const p = new ResultTestingPanel();
        // File has 500 spins, session has 20 steps.
        p.submit(makeAutoTestResult({
            totalTestSpins: 500,
            testSpins: Array.from({ length: 500 }, (_, i) => i % 37)
        }));
        p.processTabEntry('S1-Start9');
        await p.waitForReplay();
        // Number of recordBetResult calls = number of BET steps in
        // the 20-step fixture. Fixture uses 3 WATCH + 12 BET + 4 SKIP
        // + 1 BET = 13 BETs (recount below if fixture changes).
        expect(money.betCalls).toBeLessThanOrEqual(20);
        expect(money.betCalls).toBeGreaterThan(0);
        // Window.spins advanced exactly 20 steps (session boundary),
        // NOT 491 (file tail).
        expect(window.spins.length).toBe(20);
    });

    test('P8: existing 60-spin fixture still resolves a 20-spin replay (regression guard)', () => {
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult());
        const out = p.processTabEntry('S1-Start9');
        expect(out.ok).toBe(true);
        expect(out.spinCount).toBe(20);
        expect(window.spins.length).toBe(20);
    });
});

function _Number_isFiniteSafe(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

// ═══════════════════════════════════════════════════════════════════
//  Q. Recorded-session replay (drives money panel from session.steps)
// ═══════════════════════════════════════════════════════════════════
//
// Under the new primary replay path the money panel is driven
// DIRECTLY from session.steps by calling moneyPanel.recordBetResult
// for each BET step. This avoids the 800ms prediction-debounce
// cascade that was silently swallowing money-panel updates in the
// live UI. After the loop, moneyPanel.betHistory is overwritten with
// the full per-session bet list so the downloadable
// session-result workbook contains real data (the live panel's
// internal betHistory is capped to 10 recent bets — too small for a
// complete session summary).
//
describe('Q. replayRecordedSession — session.steps is the source of truth', () => {
    function makeRichStub() {
        const state = {
            sessionData: {
                totalBets: 0, totalWins: 0, totalLosses: 0,
                currentBankroll: 4000, sessionProfit: 0,
                isSessionActive: false, isBettingEnabled: false
            },
            betHistory: [],
            lastSpinCount: 0,
            recordBetResultCalls: [],
            renderCalls: 0,
            async recordBetResult(betPerNumber, numbersCount, hit, actualNumber) {
                state.recordBetResultCalls.push({ betPerNumber, numbersCount, hit, actualNumber });
                state.sessionData.totalBets++;
                if (hit) state.sessionData.totalWins++;
                else state.sessionData.totalLosses++;
                const totalBet = betPerNumber * numbersCount;
                const net = hit ? (betPerNumber * 35 - totalBet) : -totalBet;
                state.sessionData.currentBankroll += net;
                state.sessionData.sessionProfit += net;
            },
            setPrediction() {},
            render() { state.renderCalls++; }
        };
        return state;
    }

    test('Q1: iterates session.steps and calls recordBetResult for each BET step', async () => {
        const money = makeRichStub();
        window.moneyPanel = money;
        const session = {
            startIdx: 0, strategy: 1, outcome: 'WIN',
            totalSpins: 5, totalBets: 3, wins: 2, losses: 1,
            steps: [
                { action: 'WATCH', pnl: 0 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true, nextNumber: 5, pnl: 46 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: false, nextNumber: 17, pnl: -24 },
                { action: 'SKIP', pnl: 0 },
                { action: 'BET', betPerNumber: 3, numbersCount: 12, hit: true, nextNumber: 11, pnl: 69 }
            ]
        };
        const p = new ResultTestingPanel();
        const r = await p.replayRecordedSession(session);
        expect(r.stepped).toBe(5);
        expect(r.bets).toBe(3);
        expect(money.recordBetResultCalls.length).toBe(3);
        // First BET was (2, 12, true, 5).
        expect(money.recordBetResultCalls[0]).toEqual({
            betPerNumber: 2, numbersCount: 12, hit: true, actualNumber: 5
        });
    });

    test('Q2: sessionData totals reflect the full session after replay', async () => {
        const money = makeRichStub();
        window.moneyPanel = money;
        const session = {
            startIdx: 0, strategy: 1, outcome: 'WIN',
            totalSpins: 4, totalBets: 4, wins: 2, losses: 2,
            steps: [
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true,  nextNumber: 5,  pnl: 46 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: false, nextNumber: 17, pnl: -24 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true,  nextNumber: 11, pnl: 46 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: false, nextNumber: 33, pnl: -24 }
            ]
        };
        const p = new ResultTestingPanel();
        await p.replayRecordedSession(session);
        expect(money.sessionData.totalBets).toBe(4);
        expect(money.sessionData.totalWins).toBe(2);
        expect(money.sessionData.totalLosses).toBe(2);
        // Net: +46 -24 +46 -24 = +44 → bankroll went from 4000 to 4044.
        expect(money.sessionData.currentBankroll).toBe(4044);
        expect(money.sessionData.sessionProfit).toBe(44);
    });

    test('Q3: betHistory is overwritten with the FULL per-session bet list (not capped)', async () => {
        const money = makeRichStub();
        window.moneyPanel = money;
        // 15 BET steps — way more than the live panel's 10-entry cap.
        const steps = [];
        for (let i = 0; i < 15; i++) {
            steps.push({ action: 'BET', betPerNumber: 2, numbersCount: 12,
                         hit: i % 2 === 0, nextNumber: i, pnl: i % 2 === 0 ? 46 : -24 });
        }
        const session = { startIdx: 0, strategy: 1, outcome: 'WIN',
            totalSpins: 15, totalBets: 15, wins: 8, losses: 7, steps };
        const p = new ResultTestingPanel();
        await p.replayRecordedSession(session);
        // All 15 bets should appear in betHistory — NOT the live 10-cap.
        expect(money.betHistory.length).toBe(15);
        expect(money.betHistory[0].actualNumber).toBe(0);
        expect(money.betHistory[14].actualNumber).toBe(14);
    });

    test('Q4: betHistory entries have the shape MoneyReport expects', async () => {
        const money = makeRichStub();
        window.moneyPanel = money;
        const session = { startIdx: 0, strategy: 1, outcome: 'WIN',
            totalSpins: 1, totalBets: 1, wins: 1, losses: 0,
            steps: [{ action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true, nextNumber: 5, pnl: 46 }]
        };
        const p = new ResultTestingPanel();
        await p.replayRecordedSession(session);
        const bet = money.betHistory[0];
        for (const k of ['spin', 'betAmount', 'totalBet', 'hit', 'actualNumber', 'netChange', 'timestamp']) {
            expect(bet).toHaveProperty(k);
        }
        expect(bet.netChange).toBe(46);
        expect(bet.hit).toBe(true);
        expect(bet.betAmount).toBe(2);
        expect(bet.totalBet).toBe(24);
    });

    test('Q5: the exported money-report workbook carries the real totals after a recorded replay', async () => {
        const { MoneyReport } = require('../../app/money-report');
        // Minimal ExcelJS mock re-used from 57-money-report.
        class MockCell { constructor(){this.value=null;this.font={};this.fill={};this.alignment={};this.border={};}}
        class MockRow { constructor(){this._c={};} getCell(i){if(!this._c[i])this._c[i]=new MockCell();return this._c[i];}}
        class MockWorksheet { constructor(n){this.name=n;this._r={};this.columns=[];this.mergedCells=[];}
            getRow(i){if(!this._r[i])this._r[i]=new MockRow();return this._r[i];}
            getCell(a){const m=a.match(/^([A-Z]+)(\d+)$/);return this.getRow(parseInt(m[2],10)).getCell(m[1].charCodeAt(0)-64);}
            mergeCells(r){this.mergedCells.push(r);}}
        class MockWorkbook { constructor(){this._s={};this.xlsx={writeBuffer:async()=>new ArrayBuffer(100)};}
            addWorksheet(n){const s=new MockWorksheet(n);this._s[n]=s;return s;}
            getWorksheet(n){return this._s[n]||null;}}
        const MockExcelJS = { Workbook: MockWorkbook };

        const money = makeRichStub();
        window.moneyPanel = money;
        const session = {
            startIdx: 0, strategy: 1, outcome: 'WIN',
            totalSpins: 5, totalBets: 3, wins: 2, losses: 1,
            steps: [
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true,  nextNumber: 5,  pnl: 46 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: false, nextNumber: 17, pnl: -24 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true,  nextNumber: 11, pnl: 46 }
            ]
        };
        const p = new ResultTestingPanel();
        await p.replayRecordedSession(session);

        // Now generate the workbook (same path the money-panel's
        // Download Session Report button uses).
        const rep = new MoneyReport(MockExcelJS);
        const wb = rep.generate(money.sessionData, money.betHistory);
        const overview = wb.getWorksheet('Overview');
        const headerRow = overview.getRow(5);
        const headers = []; for (let i = 1; i <= 14; i++) headers.push(headerRow.getCell(i).value);
        const dataRow = overview.getRow(6);
        const totalWon = String(dataRow.getCell(headers.indexOf('Total Win $') + 1).value);
        const totalLost = String(dataRow.getCell(headers.indexOf('Total Loss $') + 1).value);
        const totalPL = String(dataRow.getCell(headers.indexOf('Total P&L') + 1).value);
        // Positive sum = 46+46 = 92. Negative sum = 24. P&L = 68.
        expect(totalWon).toContain('92');
        expect(totalLost).toContain('24');
        expect(totalPL).toContain('68');
    });

    test('Q6: force-enables the gates during replay and restores them after', async () => {
        const money = makeRichStub();
        money.sessionData.isSessionActive = false;
        money.sessionData.isBettingEnabled = false;
        window.moneyPanel = money;
        const gateDuringBet = [];
        const origRecord = money.recordBetResult.bind(money);
        money.recordBetResult = async function (...args) {
            gateDuringBet.push({
                active: money.sessionData.isSessionActive,
                betting: money.sessionData.isBettingEnabled
            });
            return origRecord(...args);
        };
        const session = { startIdx: 0, strategy: 1, outcome: 'WIN',
            totalSpins: 2, totalBets: 2, wins: 1, losses: 1,
            steps: [
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: true, nextNumber: 5, pnl: 46 },
                { action: 'BET', betPerNumber: 2, numbersCount: 12, hit: false, nextNumber: 17, pnl: -24 }
            ]
        };
        const p = new ResultTestingPanel();
        await p.replayRecordedSession(session);
        // During each BET the gates were TRUE.
        expect(gateDuringBet.length).toBe(2);
        expect(gateDuringBet.every(g => g.active && g.betting)).toBe(true);
        // After replay restored to pre-replay state (FALSE).
        expect(money.sessionData.isSessionActive).toBe(false);
        expect(money.sessionData.isBettingEnabled).toBe(false);
    });

    test('Q7: empty session / missing steps returns stepped=0 bets=0 (no throw)', async () => {
        const p = new ResultTestingPanel();
        expect(await p.replayRecordedSession(null)).toEqual({ stepped: 0, bets: 0 });
        expect(await p.replayRecordedSession({})).toEqual({ stepped: 0, bets: 0 });
        expect(await p.replayRecordedSession({ steps: [] })).toEqual({ stepped: 0, bets: 0 });
    });

    test('Q8: processTabEntry prefers replayRecordedSession when session.steps is populated', async () => {
        const money = makeRichStub();
        window.moneyPanel = money;
        window.autoUpdateOrchestrator = { autoMode: true, lastSpinCount: 0, async handleAutoMode() {} };
        if (!document.getElementById('aiPanelContent')) {
            const c = document.createElement('div'); c.id = 'aiPanelContent'; document.body.appendChild(c);
        }
        const p = new ResultTestingPanel();
        p.submit(makeAutoTestResult({ method: 'T1-strategy' }));
        p.processTabEntry('S1-Start9');
        await p.waitForReplay();
        // recordBetResult was invoked — the recorded path ran.
        expect(money.recordBetResultCalls.length).toBeGreaterThan(0);
        // The session's bet count matches the fixture (the fixture
        // has some BET and SKIP steps; we just assert "more than 0"
        // to avoid coupling to the exact shape).
        expect(money.sessionData.totalBets).toBe(money.recordBetResultCalls.length);
    });
});
