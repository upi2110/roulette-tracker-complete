/**
 * Result-testing panel — manual verification tab in the AI prediction area.
 *
 * Additive UI only. Lives inside #aiPanelContent as a collapsible
 * "tab" section, positioned right after the AI Auto Mode buttons so
 * it sits next to the Auto/mode area. Holds a submitted Auto Test
 * result (handed over by auto-test-ui.js's new "Submit-to test"
 * button) and lets the user type a tab name or number. On Enter, the
 * app switches to Manual mode and loads the numbers from the chosen
 * tab so the user can replay and compare.
 *
 * This module does NOT:
 *   - touch Table 1/2/3 formation, wheel logic, report math,
 *     prediction logic, or money-panel behaviour;
 *   - change the Auto Test selector, T1-strategy, test-strategy, or
 *     the original auto-test mode;
 *   - modify the AI prediction panel's existing sections (only
 *     appends a new section).
 *
 * Exposed API:
 *   - class ResultTestingPanel
 *   - window.resultTestingPanel (instance)
 *   - window.resultTestingPanel.submit(autoTestResult)
 *   - window.resultTestingPanel.processTabEntry(tabName)
 */

class ResultTestingPanel {
    constructor() {
        this.submitted = null;       // Last submitted FullTestResult
        this.lastTabLoaded = null;   // Last tab the user pulled into manual
        this.createUI();
        this.setupEventListeners();
    }

    /**
     * Build the collapsible Result-testing section and insert it into
     * #aiPanelContent. Returns silently when the container is missing
     * (e.g. early in page load) — createUI is retried later if needed.
     */
    createUI() {
        const container = document.getElementById('aiPanelContent');
        if (!container) return;
        if (document.getElementById('resultTestingPanel')) return; // idempotent

        const section = document.createElement('div');
        section.id = 'resultTestingPanel';
        section.className = 'table-selection-section result-testing-section';
        section.setAttribute('data-tab', 'result-testing');
        section.style.marginTop = '6px';
        section.innerHTML = `
            <div class="table-selection-header result-testing-header"
                 style="background: linear-gradient(135deg,#e0e7ff 0%,#c7d2fe 100%);color:#3730a3;padding:8px 12px;font-weight:bold;font-size:12px;border-bottom:2px solid #a5b4fc;cursor:pointer;user-select:none;"
                 onclick="const n = this.nextElementSibling; n.style.display = n.style.display === 'none' ? 'block' : 'none';">
                🧾 Result-testing — Manual verification
                <span id="resultTestingStatus" style="float:right;font-size:11px;color:#4338ca;font-weight:600;">No submission</span>
            </div>
            <div id="resultTestingBody" style="padding:8px;background:white;display:block;font-size:11px;color:#1e293b;">
                <div id="resultTestingEmpty" style="color:#64748b;font-style:italic;padding:6px;text-align:center;">
                    Run an Auto Test and click <strong>Submit-to test</strong> to hand the result over here.
                </div>
                <div id="resultTestingSummary" style="display:none;margin-bottom:8px;">
                    <div id="resultTestingSubmissionInfo" style="background:#f1f5f9;padding:6px 8px;border-radius:4px;margin-bottom:6px;"></div>
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
                        <label for="resultTestingTabInput" style="font-weight:600;color:#3730a3;">Tab:</label>
                        <input id="resultTestingTabInput" type="text" placeholder="e.g. S1-Start9 or strategy1"
                               title="Enter a session id (S1-Start9) or a tab name (overview / strategy1..3)"
                               style="flex:1;padding:4px 6px;border:1px solid #a5b4fc;border-radius:3px;font-size:11px;"/>
                        <button id="resultTestingRunBtn" type="button"
                                style="padding:4px 10px;font-size:11px;font-weight:700;border:1px solid #6366f1;border-radius:3px;background:#6366f1;color:white;cursor:pointer;">
                            ▶ Run
                        </button>
                    </div>
                    <div id="resultTestingMessage" style="font-size:11px;color:#3730a3;min-height:14px;"></div>
                    <div id="resultTestingComparison" style="display:none;margin-top:6px;padding:6px;background:#eef2ff;border-radius:4px;"></div>
                    <div style="margin-top:6px;display:flex;gap:6px;">
                        <button id="resultTestingDownloadBtn" type="button" disabled
                                style="padding:4px 10px;font-size:11px;font-weight:600;border:1px solid #94a3b8;border-radius:3px;background:#f8fafc;color:#334155;cursor:pointer;">
                            ⬇ Download verification report
                        </button>
                    </div>
                </div>
            </div>
        `;
        // Insert at position 1 so we land right after the AI Auto Mode
        // buttons block (which AIAutoModeUI insertBefore's at position 0).
        // If the mode UI isn't there yet, appendChild is still safe —
        // the section will just live at the end until the next render.
        const firstChild = container.firstElementChild;
        if (firstChild && firstChild.nextSibling) {
            container.insertBefore(section, firstChild.nextSibling);
        } else {
            container.appendChild(section);
        }
    }

    setupEventListeners() {
        const input = document.getElementById('resultTestingTabInput');
        const runBtn = document.getElementById('resultTestingRunBtn');
        const dlBtn = document.getElementById('resultTestingDownloadBtn');

        if (input) {
            // Enter in the field runs the same action as the Run button.
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.processTabEntry(input.value);
                }
            });
        }
        if (runBtn) {
            runBtn.addEventListener('click', () => {
                const v = input ? input.value : '';
                this.processTabEntry(v);
            });
        }
        if (dlBtn) {
            dlBtn.addEventListener('click', () => this.downloadVerificationReport());
        }
    }

    /**
     * Receive a completed Auto Test result from auto-test-ui.js. Stashes
     * the result, enables the input, and shows a summary line.
     */
    submit(autoTestResult) {
        if (!autoTestResult || typeof autoTestResult !== 'object') return false;
        this.submitted = autoTestResult;
        this.lastTabLoaded = null;

        const status = document.getElementById('resultTestingStatus');
        const empty = document.getElementById('resultTestingEmpty');
        const summary = document.getElementById('resultTestingSummary');
        const info = document.getElementById('resultTestingSubmissionInfo');
        const msg = document.getElementById('resultTestingMessage');
        const cmp = document.getElementById('resultTestingComparison');
        const dlBtn = document.getElementById('resultTestingDownloadBtn');

        if (status) status.textContent = 'Ready — enter tab name/number';
        if (empty) empty.style.display = 'none';
        if (summary) summary.style.display = 'block';
        if (cmp) { cmp.style.display = 'none'; cmp.innerHTML = ''; }
        if (msg) msg.textContent = '';
        if (dlBtn) dlBtn.disabled = true;

        if (info) {
            const file = autoTestResult.testFile || 'manual';
            const spins = autoTestResult.totalTestSpins || 0;
            const method = autoTestResult.method || 'auto-test';
            info.innerHTML = `<strong>Submitted:</strong> ${this._escape(String(file))} • ${spins} spins • method=<code>${this._escape(String(method))}</code>`;
        }
        return true;
    }

    /**
     * Normalise a user-entered tab token into one of:
     *   'overview' | 'strategy1' | 'strategy2' | 'strategy3'
     * Returns null if invalid.
     */
    resolveTabName(raw) {
        if (typeof raw !== 'string') return null;
        const t = raw.trim().toLowerCase();
        if (!t) return null;
        if (t === 'overview' || t === '0') return 'overview';
        if (t === 'strategy1' || t === 's1' || t === '1') return 'strategy1';
        if (t === 'strategy2' || t === 's2' || t === '2') return 'strategy2';
        if (t === 'strategy3' || t === 's3' || t === '3') return 'strategy3';
        return null;
    }

    /**
     * Parse a session identifier like the ones the Auto Test report
     * uses for its per-session detail sheets:
     *     "S{strategy}-Start{startIdx}"    e.g.  S1-Start9
     * The parser is tolerant of case, whitespace, and common
     * separator variants (hyphen, underscore, space) so a user
     * typing the label as they see it in the Auto Test report always
     * resolves. Returns {strategy, startIdx} or null.
     */
    resolveSessionRef(raw) {
        if (typeof raw !== 'string') return null;
        const t = raw.trim();
        if (!t) return null;
        const m = t.match(/^S\s*(\d+)[\s\-_]*Start\s*(\d+)$/i);
        if (!m) return null;
        const strategy = parseInt(m[1], 10);
        const startIdx = parseInt(m[2], 10);
        if (!Number.isFinite(strategy) || !Number.isFinite(startIdx)) return null;
        if (strategy < 1 || strategy > 3) return null;
        if (startIdx < 0) return null;
        return { strategy, startIdx };
    }

    /**
     * Look up the actual session object inside the submitted Auto Test
     * result for the given {strategy, startIdx} reference. Returns the
     * session object (as constructed by AutoTestRunner._buildSessionResult)
     * or null if no session matches.
     */
    findSession(ref) {
        if (!ref || !this.submitted || !this.submitted.strategies) return null;
        const bucket = this.submitted.strategies[ref.strategy];
        if (!bucket || !Array.isArray(bucket.sessions)) return null;
        return bucket.sessions.find(s => s && s.startIdx === ref.startIdx) || null;
    }

    /**
     * Handle the user pressing Enter (or clicking Run). Switches the
     * app into Manual mode and loads the spin history that produced
     * the submitted Auto Test result so the user can replay it.
     */
    processTabEntry(raw) {
        const msg = document.getElementById('resultTestingMessage');
        const cmp = document.getElementById('resultTestingComparison');
        const dlBtn = document.getElementById('resultTestingDownloadBtn');

        if (!this.submitted) {
            if (msg) msg.textContent = '⚠ No submission yet. Run Auto Test and click Submit-to test.';
            return { ok: false, error: 'no-submission' };
        }

        // Two input shapes are supported:
        //  (1) Auto Test SESSION id, e.g. "S1-Start9" — matches the
        //      per-session detail label produced by the Auto Test
        //      report (see app/auto-test-report.js _createSessionSheet:
        //      `S${strategyNum}-Start${session.startIdx}`). When this
        //      matches, we replay the EXACT session: load only that
        //      session's spin window, switch to Manual, and render a
        //      session-level comparison card.
        //  (2) Generic tab name ("overview" / "strategy1..3" / numeric
        //      synonyms). Pre-existing behaviour — kept for
        //      backwards compatibility of the previous tests.
        const sessionRef = this.resolveSessionRef(raw);

        // Resolve the full test-spin array first; we need it regardless
        // of which branch we take (the session window is a slice of it).
        let spins = null;
        if (Array.isArray(this.submitted.testSpins)) {
            spins = this.submitted.testSpins;
        } else if (typeof window !== 'undefined'
                   && window.autoTestUI
                   && Array.isArray(window.autoTestUI.testSpins)) {
            spins = window.autoTestUI.testSpins;
        }
        if (!spins || spins.length === 0) {
            if (msg) msg.textContent = '⚠ Submission has no spin history attached — cannot run manual.';
            return { ok: false, error: 'no-spins' };
        }

        // ── Session replay branch ────────────────────────────────────
        if (sessionRef) {
            const session = this.findSession(sessionRef);
            if (!session) {
                if (msg) msg.textContent = `⚠ Session ${this._formatSessionLabel(sessionRef)} not found in submitted result.`;
                return { ok: false, error: 'session-not-found', ref: sessionRef };
            }
            // Take the spin window for this session: from startIdx to
            // end-of-file (the runner stops on WIN/BUST/INCOMPLETE, so
            // the available-spins window is the remainder of testSpins
            // starting at startIdx). totalSpins on the session tells us
            // how many the runner actually consumed; we load the whole
            // window so the user can replay it manually.
            const windowSpins = spins.slice(sessionRef.startIdx);
            if (windowSpins.length === 0) {
                if (msg) msg.textContent = `⚠ Session ${this._formatSessionLabel(sessionRef)} has no spin window in history.`;
                return { ok: false, error: 'empty-session-window', ref: sessionRef };
            }

            // Match the AI prediction mode to the Auto Test method the
            // user submitted, so the live comparison runs under the
            // same policy as the recorded run:
            //   Auto Test method → live AI mode
            //     'T1-strategy'    → 't1-strategy'
            //     'test-strategy'  → 'auto'   (same default pipeline)
            //     'auto-test'      → 'auto'   (original Auto mode)
            //     anything else    → 'manual'
            // If the selected mode can't activate (e.g. engine not
            // trained for t1-strategy / auto) AIAutoModeUI itself logs
            // a warning and stays on the current mode — we tolerate
            // that silently rather than refusing to replay.
            const aiMode = this._mapAutoTestMethodToAiMode(this.submitted.method);
            this._switchToMode(aiMode);
            this._loadSpinsIntoRenderer(windowSpins);

            const label = this._formatSessionLabel(sessionRef);
            this.lastTabLoaded = label;
            if (msg) {
                msg.textContent = `✔ Replaying ${label} in ${aiMode.toUpperCase()} mode — loaded ${windowSpins.length} spins.`;
            }
            if (dlBtn) dlBtn.disabled = false;

            if (cmp) {
                cmp.innerHTML = this._buildSessionComparisonHtml(sessionRef, session, aiMode);
                cmp.style.display = 'block';
            }
            return {
                ok: true,
                kind: 'session',
                ref: sessionRef,
                sessionLabel: label,
                aiMode,
                spinCount: windowSpins.length
            };
        }

        // ── Fallback: generic tab name branch ────────────────────────
        const tabName = this.resolveTabName(raw);
        if (!tabName) {
            if (msg) msg.textContent = '⚠ Enter a session id (e.g. S1-Start9) or tab name (overview / strategy1 / strategy2 / strategy3).';
            return { ok: false, error: 'invalid-tab' };
        }

        this._switchToManualMode();
        this._loadSpinsIntoRenderer(spins);

        this.lastTabLoaded = tabName;

        if (msg) msg.textContent = `✔ Switched to Manual and loaded ${spins.length} spins for tab=${tabName}.`;
        if (dlBtn) dlBtn.disabled = false;

        if (cmp) {
            cmp.innerHTML = this._buildComparisonHtml(tabName);
            cmp.style.display = 'block';
        }

        return { ok: true, kind: 'tab', tabName, spinCount: spins.length };
    }

    // ── Replay helpers ──────────────────────────────────────────────
    //
    // These small helpers exist so the session-replay and tab-replay
    // code paths above share their side-effects verbatim. They do NOT
    // change the renderer, add projection math, or touch anchors —
    // they only write into window.spins and best-effort-invoke
    // window.render and window.aiAutoModeUI.setMode.

    _switchToManualMode() {
        this._switchToMode('manual');
    }

    /**
     * Best-effort mode switch. Safe to call with any string — the
     * downstream AIAutoModeUI.setMode will guard against untrained
     * engines itself. Never throws into the caller.
     */
    _switchToMode(mode) {
        if (typeof window === 'undefined' || !window.aiAutoModeUI) return;
        if (typeof window.aiAutoModeUI.setMode !== 'function') return;
        try { window.aiAutoModeUI.setMode(mode); } catch (_) { /* best-effort */ }
    }

    /**
     * Map an Auto Test method string (as stored on result.method by
     * the runner, see app/auto-test-runner.js) to the corresponding
     * live AI prediction mode identifier used by AIAutoModeUI.
     */
    _mapAutoTestMethodToAiMode(method) {
        if (method === 'T1-strategy') return 't1-strategy';
        if (method === 'test-strategy') return 'auto';
        if (method === 'auto-test') return 'auto';
        return 'manual';
    }

    _loadSpinsIntoRenderer(spinNumbers) {
        if (typeof window === 'undefined') return;
        if (!Array.isArray(window.spins)) window.spins = [];
        window.spins.length = 0;
        spinNumbers.forEach((n, i) => {
            window.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
        });
        if (typeof window.render === 'function') {
            try { window.render(); } catch (_) { /* ignore render-time errors */ }
        }
    }

    _formatSessionLabel(ref) {
        if (!ref) return '';
        return `S${ref.strategy}-Start${ref.startIdx}`;
    }

    /**
     * Compute the Auto-Test-parity dollar totals for a single session
     * by reducing its steps[].pnl entries. Mirrors the derivation in
     * AutoTestRunner._computeSummary so the numbers match what the
     * Auto Test Overview column set shows.
     */
    _computeSessionTotals(session) {
        let totalWon = 0, totalLost = 0;
        if (session && Array.isArray(session.steps)) {
            for (const step of session.steps) {
                if (!step || typeof step.pnl !== 'number') continue;
                if (step.pnl > 0) totalWon += step.pnl;
                else if (step.pnl < 0) totalLost += -step.pnl;
            }
        }
        return {
            totalWon: Math.round(totalWon * 100) / 100,
            totalLost: Math.round(totalLost * 100) / 100,
            totalPL: Math.round((totalWon - totalLost) * 100) / 100
        };
    }

    /**
     * Render a session-level comparison card. Uses the same field
     * style as the Auto Test Overview — Sessions / Wins / Busts /
     * Total Win $ / Total Loss $ / Total P&L — but scoped to the one
     * session being replayed so the user can diff the rendered
     * verification numbers against the Auto Test result.
     */
    _buildSessionComparisonHtml(ref, session, aiMode) {
        const label = this._formatSessionLabel(ref);
        const totals = this._computeSessionTotals(session);
        const strategyNames = { 1: 'Aggressive', 2: 'Conservative', 3: 'Cautious' };
        const outcomeColor = session.outcome === 'WIN' ? '#059669'
            : session.outcome === 'BUST' ? '#dc2626'
            : '#475569';
        const winRatePct = (typeof session.winRate === 'number')
            ? `${(session.winRate * 100).toFixed(1)}%` : '--';
        const method = (this.submitted && this.submitted.method) || 'auto-test';
        const modeLabel = (typeof aiMode === 'string' && aiMode) ? aiMode.toUpperCase() : 'MANUAL';
        return `
            <div style="font-weight:700;color:#3730a3;margin-bottom:4px;">
                Auto Test (submitted) — session=<code>${this._escape(label)}</code>
                <span style="margin-left:8px;font-weight:400;color:#6b7280;">
                    Strategy ${ref.strategy} (${this._escape(strategyNames[ref.strategy] || '?')})
                    • Start ${ref.startIdx}
                    • <span style="color:${outcomeColor};font-weight:700;">${this._escape(session.outcome || '?')}</span>
                </span>
                <div style="font-weight:400;color:#4338ca;font-size:10px;margin-top:2px;" data-field="session-ai-mode">
                    Auto Test method=<code>${this._escape(String(method))}</code> →
                    replaying live in <strong>${this._escape(modeLabel)}</strong> mode
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#c7d2fe;">
                    <th style="padding:2px 6px;text-align:left;">Field</th>
                    <th style="padding:2px 6px;">Total Spins</th>
                    <th style="padding:2px 6px;">Total Bets</th>
                    <th style="padding:2px 6px;">Wins</th>
                    <th style="padding:2px 6px;">Losses</th>
                    <th style="padding:2px 6px;">Win Rate</th>
                    <th style="padding:2px 6px;">Max DD</th>
                    <th style="padding:2px 6px;">Final Profit</th>
                </tr></thead>
                <tbody>
                    <tr>
                        <td style="padding:2px 6px;font-weight:700;">${this._escape(label)}</td>
                        <td style="padding:2px 6px;text-align:right;">${session.totalSpins || 0}</td>
                        <td style="padding:2px 6px;text-align:right;">${session.totalBets || 0}</td>
                        <td style="padding:2px 6px;text-align:right;color:#059669;">${session.wins || 0}</td>
                        <td style="padding:2px 6px;text-align:right;color:#dc2626;">${session.losses || 0}</td>
                        <td style="padding:2px 6px;text-align:right;">${winRatePct}</td>
                        <td style="padding:2px 6px;text-align:right;">$${(session.maxDrawdown || 0).toLocaleString()}</td>
                        <td style="padding:2px 6px;text-align:right;font-weight:700;color:${outcomeColor};">$${(session.finalProfit || 0).toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px;">
                <thead><tr style="background:#c7d2fe;">
                    <th style="padding:2px 6px;text-align:left;">Dollar totals</th>
                    <th style="padding:2px 6px;">Total Win $</th>
                    <th style="padding:2px 6px;">Total Loss $</th>
                    <th style="padding:2px 6px;">Total P&amp;L</th>
                </tr></thead>
                <tbody>
                    <tr>
                        <td style="padding:2px 6px;font-weight:700;">${this._escape(label)}</td>
                        <td style="padding:2px 6px;text-align:right;color:#059669;" data-field="session-totalWon">$${totals.totalWon.toLocaleString()}</td>
                        <td style="padding:2px 6px;text-align:right;color:#dc2626;" data-field="session-totalLost">$${totals.totalLost.toLocaleString()}</td>
                        <td style="padding:2px 6px;text-align:right;font-weight:700;" data-field="session-totalPL">$${totals.totalPL.toLocaleString()}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    /**
     * Build a minimal comparison view: a small table of the submitted
     * Auto Test summary stats for the chosen tab. The live side of the
     * comparison is left for the user to read from the main tables.
     */
    _buildComparisonHtml(tabName) {
        const res = this.submitted;
        if (!res) return '';
        const rows = [];
        const pushRow = (label, s) => {
            if (!s) return;
            rows.push(`<tr>
                <td style="padding:2px 6px;font-weight:700;">${this._escape(label)}</td>
                <td style="padding:2px 6px;text-align:right;">${s.totalSessions || 0}</td>
                <td style="padding:2px 6px;text-align:right;color:#059669;">${s.wins || 0}</td>
                <td style="padding:2px 6px;text-align:right;color:#dc2626;">${s.busts || 0}</td>
                <td style="padding:2px 6px;text-align:right;">$${(typeof s.totalProfit === 'number' ? s.totalProfit : 0).toLocaleString()}</td>
            </tr>`);
        };
        if (tabName === 'overview') {
            pushRow('Strategy 1', res.strategies && res.strategies[1] && res.strategies[1].summary);
            pushRow('Strategy 2', res.strategies && res.strategies[2] && res.strategies[2].summary);
            pushRow('Strategy 3', res.strategies && res.strategies[3] && res.strategies[3].summary);
        } else {
            const n = parseInt(tabName.replace(/\D/g, ''), 10);
            if (Number.isFinite(n) && res.strategies && res.strategies[n]) {
                pushRow(`Strategy ${n}`, res.strategies[n].summary);
            }
        }
        if (rows.length === 0) return `<em style="color:#6b7280;">No summary data available for tab=${this._escape(tabName)}.</em>`;
        return `
            <div style="font-weight:700;color:#3730a3;margin-bottom:4px;">
                Auto Test (submitted) — tab=<code>${this._escape(tabName)}</code>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead><tr style="background:#c7d2fe;">
                    <th style="padding:2px 6px;text-align:left;">Row</th>
                    <th style="padding:2px 6px;">Sessions</th>
                    <th style="padding:2px 6px;">Wins</th>
                    <th style="padding:2px 6px;">Busts</th>
                    <th style="padding:2px 6px;">Total P&amp;L</th>
                </tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        `;
    }

    /**
     * Produce a plain-text verification report for download. Keeps the
     * format minimal and stable so downstream tooling can parse it.
     */
    buildVerificationReportText() {
        const res = this.submitted;
        if (!res) return '';
        const lines = [];
        lines.push('── Result-testing verification report ──');
        lines.push(`Submitted at : ${new Date().toISOString()}`);
        lines.push(`Auto Test run: ${res.testFile || 'manual'}`);
        lines.push(`Spins        : ${res.totalTestSpins || 0}`);
        lines.push(`Method       : ${res.method || 'auto-test'}`);
        lines.push(`Loaded tab   : ${this.lastTabLoaded || '(none)'}`);
        lines.push('');

        // If the user loaded a specific session (e.g. S1-Start9),
        // include its per-session stats + Auto-Test-parity dollar
        // totals (Total Win $ / Total Loss $ / Total P&L). When the
        // Loaded tab is a generic tab name, fall through to the
        // per-strategy summary block below (unchanged).
        const ref = this._parseSessionLabel(this.lastTabLoaded);
        if (ref) {
            const session = this.findSession(ref);
            if (session) {
                const totals = this._computeSessionTotals(session);
                lines.push(`Session      : S${ref.strategy}-Start${ref.startIdx}  (Strategy ${ref.strategy})`);
                lines.push(`  outcome    : ${session.outcome || '?'}`);
                lines.push(`  totalSpins : ${session.totalSpins || 0}`);
                lines.push(`  totalBets  : ${session.totalBets || 0}`);
                lines.push(`  wins/losses: ${session.wins || 0}/${session.losses || 0}`);
                lines.push(`  finalProfit: $${(session.finalProfit || 0).toLocaleString()}`);
                lines.push(`  maxDrawdown: $${(session.maxDrawdown || 0).toLocaleString()}`);
                lines.push(`  Total Win $: $${totals.totalWon.toLocaleString()}`);
                lines.push(`  Total Loss$: $${totals.totalLost.toLocaleString()}`);
                lines.push(`  Total P&L  : $${totals.totalPL.toLocaleString()}`);
                lines.push('');
            }
        }

        if (res.strategies) {
            for (const k of [1, 2, 3]) {
                const s = res.strategies[k] && res.strategies[k].summary;
                if (!s) continue;
                lines.push(`Strategy ${k}: sessions=${s.totalSessions || 0} wins=${s.wins || 0} busts=${s.busts || 0} pnl=$${(s.totalProfit || 0).toLocaleString()}`);
            }
        }
        lines.push('');
        lines.push('(Fill in the manual verification result below.)');
        return lines.join('\n');
    }

    /** Reverse of _formatSessionLabel. null on non-session strings. */
    _parseSessionLabel(label) {
        return this.resolveSessionRef(label);
    }

    downloadVerificationReport() {
        const text = this.buildVerificationReportText();
        if (!text) return false;
        if (typeof document === 'undefined') return false;
        try {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `verification-${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (_) {}
                if (a.parentNode) a.parentNode.removeChild(a);
            }, 0);
            return true;
        } catch (_) {
            return false;
        }
    }

    _escape(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
}

// ── Dual export (Node tests + browser) ──
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ResultTestingPanel };
}
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Construct after other panels have had a chance to render.
        // Matches the deferred-init pattern AIAutoModeUI and AutoTestUI use.
        setTimeout(() => {
            try {
                if (!window.resultTestingPanel) {
                    window.resultTestingPanel = new ResultTestingPanel();
                    console.log('✅ Result-testing panel active');
                }
            } catch (e) {
                console.warn('Result-testing panel init failed:', e && e.message);
            }
        }, 700);
    });
}
