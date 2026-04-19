// Canonical list of live AI modes that the Result-testing replay
// dropdown exposes. Matches the mode identifiers used by
// app/ai-auto-mode-ui.js (setMode accepts any of these) plus the new
// 't1-strategy' mode added in commit 2fa70c2b. Exposed so tests and
// downstream callers never hard-code the list.
const RESULT_TESTING_MODES = ['manual', 'semi', 'auto', 't1-strategy'];
const RESULT_TESTING_DEFAULT_MODE = 'manual';

// Module-level Set of in-flight replay setTimeout ids. Used so tests
// can cancel any replays scheduled by earlier tests before starting
// a new one (avoids dangling timers firing into the next test's
// fresh moneyPanel / orchestrator stubs). Production code should
// never need to call the cancel helper — the ids are naturally
// removed as each timer fires.
const _activeReplayTimers = new Set();

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
        // Mode currently selected in the header dropdown. Default is
        // 'manual'; when a submission arrives the dropdown is re-seeded
        // to the AI mode matching the submitted Auto Test method, but
        // the user can override it at any time before clicking Run.
        this.selectedMode = RESULT_TESTING_DEFAULT_MODE;
        // Promise returned by the most recent async live replay. Tests
        // can `await panel._lastReplayPromise` (or `waitForReplay()`)
        // to observe post-replay state. UI code treats it as fire-
        // and-forget — the sync state (window.spins, comparison card)
        // is observable before the async replay runs.
        this._lastReplayPromise = null;
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
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
                        <label for="resultTestingTabInput" style="font-weight:600;color:#3730a3;">Tab:</label>
                        <input id="resultTestingTabInput" type="text" placeholder="e.g. S1-Start9 or strategy1"
                               title="Enter a session id (S1-Start9) or a tab name (overview / strategy1..3)"
                               style="flex:1;min-width:160px;padding:4px 6px;border:1px solid #a5b4fc;border-radius:3px;font-size:11px;"/>
                        <label for="resultTestingModeSelect" style="font-weight:600;color:#3730a3;">Mode:</label>
                        <select id="resultTestingModeSelect"
                                title="Live AI mode to use when the session replay starts"
                                style="padding:4px 6px;font-size:11px;font-weight:600;border:1px solid #a5b4fc;border-radius:3px;background:white;color:#1e293b;cursor:pointer;">
                            <option value="manual">manual</option>
                            <option value="semi">semi</option>
                            <option value="auto">auto</option>
                            <option value="t1-strategy">T1-strategy</option>
                        </select>
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
        const modeSel = document.getElementById('resultTestingModeSelect');

        if (modeSel) {
            // Keep DOM and JS state in sync on first paint.
            modeSel.value = this.selectedMode;
            modeSel.addEventListener('change', () => {
                const v = modeSel.value;
                if (RESULT_TESTING_MODES.includes(v)) this.selectedMode = v;
            });
        }

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

        // Re-seed the mode dropdown default to the AI mode matching the
        // submitted Auto Test method (apples-to-apples comparison) —
        // the user can still override it from the dropdown before
        // clicking Run. This changes only the default selection; it
        // does not force the mode on replay.
        const defaultAiMode = this._mapAutoTestMethodToAiMode(autoTestResult.method);
        this.selectedMode = RESULT_TESTING_MODES.includes(defaultAiMode)
            ? defaultAiMode
            : RESULT_TESTING_DEFAULT_MODE;
        const modeSel = document.getElementById('resultTestingModeSelect');
        if (modeSel) modeSel.value = this.selectedMode;

        return true;
    }

    /**
     * Return the replay mode the user currently has selected in the
     * dropdown. Falls back to the instance state, then to the default.
     */
    getSelectedMode() {
        const modeSel = (typeof document !== 'undefined')
            ? document.getElementById('resultTestingModeSelect')
            : null;
        if (modeSel && RESULT_TESTING_MODES.includes(modeSel.value)) {
            return modeSel.value;
        }
        return RESULT_TESTING_MODES.includes(this.selectedMode)
            ? this.selectedMode
            : RESULT_TESTING_DEFAULT_MODE;
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
     * Compute the true replay-window length for a given Auto Test
     * session. Preference order:
     *   1) session.steps.length — the authoritative count of spin
     *      observations from AutoTestRunner._runSession (each WATCH
     *      + BET + SKIP + COOLDOWN + REANALYZE step corresponds to
     *      exactly one spin, see _buildSessionResult in
     *      app/auto-test-runner.js line 371). This is the number we
     *      should replay.
     *   2) session.totalSpins — summary-level count (excludes WATCH
     *      and REANALYZE). Less accurate but still bounded. Used
     *      when the session object lacks a steps array.
     *   3) Infinity — last-resort fallback that lets the caller
     *      clamp to the raw testSpins length. Only triggers when
     *      neither of the above is available on the session object.
     *
     * Returns a positive integer (or Infinity for the last-resort).
     */
    _resolveSessionLength(session) {
        if (!session || typeof session !== 'object') return Infinity;
        if (Array.isArray(session.steps) && session.steps.length > 0) {
            return session.steps.length;
        }
        if (typeof session.totalSpins === 'number' && session.totalSpins > 0) {
            return session.totalSpins;
        }
        return Infinity;
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
            // Take the spin window for this session using the actual
            // session boundary recorded on the AutoTestRunner session
            // object — NOT the rest of the raw file. Using the file
            // tail caused the replay to continue hundreds of spins
            // past the real session end, racking up skip after skip
            // (the user's screenshot showed Skips: 597/5 for a
            // ~30-spin session). The authoritative boundary is
            // session.steps.length (every WATCH / BET / SKIP /
            // COOLDOWN / REANALYZE step is one spin observation from
            // the runner's live loop). We clamp to the file length
            // in case the session was INCOMPLETE at EOF.
            const sessionLen = this._resolveSessionLength(session);
            const endIdx = Math.min(sessionRef.startIdx + sessionLen, spins.length);
            const windowSpins = spins.slice(sessionRef.startIdx, endIdx);
            if (windowSpins.length === 0) {
                if (msg) msg.textContent = `⚠ Session ${this._formatSessionLabel(sessionRef)} has no spin window in history.`;
                return { ok: false, error: 'empty-session-window', ref: sessionRef };
            }

            // Replay mode comes from the Result-testing dropdown, so
            // the user explicitly controls which strategy the session
            // is verified under. On submit() the dropdown is seeded
            // to match the Auto Test method (apples-to-apples default)
            // but can be overridden to any supported mode — 'manual',
            // 'semi', 'auto', or 't1-strategy'. If the selected mode
            // can't activate (e.g. engine not trained for t1-strategy
            // / auto), AIAutoModeUI itself logs a warning and stays on
            // the current mode; we tolerate that silently rather than
            // refusing to replay.
            const aiMode = this.getSelectedMode();
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

            // Kick off the replay after a macrotask so the sync state
            // above (window.spins populated, comparison card rendered,
            // download enabled) is observable before the replay
            // mutates state further.
            //
            // Primary path: replayRecordedSession(session) — feeds
            // session.steps directly into moneyPanel.recordBetResult.
            // This is the AUTHORITATIVE replay because it uses the
            // recorded Auto Test session data (the same tabs the
            // Auto Test report exports) and therefore never depends
            // on the live orchestrator→wheel→setPrediction cascade
            // that silently fails in the real UI due to the 800ms
            // prediction-debounce.
            //
            // Fallback: replaySessionLive(windowSpins) — used only
            // when the session has no recorded steps (should not
            // normally happen for real Auto Test sessions).
            this._lastReplayPromise = (Array.isArray(session.steps) && session.steps.length > 0)
                ? this._scheduleRecordedReplay(session)
                : this._scheduleLiveReplay(windowSpins);

            return {
                ok: true,
                kind: 'session',
                ref: sessionRef,
                sessionLabel: label,
                aiMode,
                spinCount: windowSpins.length,
                replay: this._lastReplayPromise
            };
        }

        // ── Fallback: generic tab name branch ────────────────────────
        const tabName = this.resolveTabName(raw);
        if (!tabName) {
            if (msg) msg.textContent = '⚠ Enter a session id (e.g. S1-Start9) or tab name (overview / strategy1 / strategy2 / strategy3).';
            return { ok: false, error: 'invalid-tab' };
        }

        // Tab-name branch also honours the mode dropdown so the user
        // can override the legacy "always manual" behaviour.
        const aiModeForTab = this.getSelectedMode();
        this._switchToMode(aiModeForTab);
        this._loadSpinsIntoRenderer(spins);

        this.lastTabLoaded = tabName;

        if (msg) {
            msg.textContent = `✔ Replaying tab=${tabName} in ${aiModeForTab.toUpperCase()} mode — loaded ${spins.length} spins.`;
        }
        if (dlBtn) dlBtn.disabled = false;

        if (cmp) {
            cmp.innerHTML = this._buildComparisonHtml(tabName);
            cmp.style.display = 'block';
        }

        return { ok: true, kind: 'tab', tabName, aiMode: aiModeForTab, spinCount: spins.length };
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

    /**
     * Replay a session DIRECTLY from the Auto Test report's recorded
     * `session.steps` array — the authoritative source of truth. This
     * is the primary replay path used by processTabEntry, chosen
     * because it avoids the fragile async cascade in live play
     * (orchestrator → aiPanel → _autoTriggerPredictions 800ms debounce
     * → wheel → moneyPanel.setPrediction) that leaves the money panel
     * empty during Result-testing replays in the live UI.
     *
     * For every BET step in session.steps we call
     * moneyPanel.recordBetResult(betPerNumber, numbersCount, hit,
     * nextNumber) — the exact entry point the 200ms live poll uses.
     * sessionData (totalBets, totalWins, totalLosses, currentBankroll,
     * sessionProfit) is updated as in live play; engine.recordResult
     * is called back if engine.lastDecision is set; the strategy-
     * based bet-adjustment runs normally.
     *
     * After the loop we rewrite moneyPanel.betHistory with the FULL
     * per-session bet list (the live panel caps this to 10 recent
     * bets; we need the complete history so the exported
     * session-result workbook's totals are accurate end-to-end).
     *
     * Returns { stepped, bets }.
     */
    async replayRecordedSession(session, opts = {}) {
        const stepDelayMs = typeof opts.stepDelayMs === 'number' ? opts.stepDelayMs : 0;
        if (typeof window === 'undefined') return { stepped: 0, bets: 0 };
        if (!session || !Array.isArray(session.steps) || session.steps.length === 0) {
            return { stepped: 0, bets: 0 };
        }

        // Fresh window.spins (renderer will populate its view as we push).
        if (!Array.isArray(window.spins)) window.spins = [];
        window.spins.length = 0;

        // Force-enable money panel gates for the replay so the real
        // recordBetResult flow is not silently blocked by a paused
        // bet state. Save + restore so live play afterwards is
        // unchanged.
        let savedSessionActive, savedBettingEnabled;
        const money = window.moneyPanel;
        if (money && money.sessionData && typeof money.sessionData === 'object') {
            savedSessionActive = money.sessionData.isSessionActive;
            savedBettingEnabled = money.sessionData.isBettingEnabled;
            money.sessionData.isSessionActive = true;
            money.sessionData.isBettingEnabled = true;
        }

        // Quiet the orchestrator's polling loop during the replay.
        const orch = window.autoUpdateOrchestrator;

        let stepped = 0;
        let bets = 0;
        try {
            for (const step of session.steps) {
                if (!step || typeof step !== 'object') continue;

                // Advance window.spins by one so the rest of the
                // renderer/panel logic sees the same spin count growth
                // a live session would produce.
                const actual = (step.nextNumber != null)
                    ? step.nextNumber
                    : (step.spinNumber != null ? step.spinNumber : 0);
                window.spins.push({ actual, direction: stepped % 2 === 0 ? 'C' : 'AC' });

                if (step.action === 'BET' && money && typeof money.recordBetResult === 'function') {
                    const betPerNumber = (typeof step.betPerNumber === 'number' && step.betPerNumber > 0)
                        ? step.betPerNumber : 2;
                    const numbersCount = (typeof step.numbersCount === 'number' && step.numbersCount > 0)
                        ? step.numbersCount
                        : (Array.isArray(step.predictedNumbers) ? step.predictedNumbers.length : 1);
                    const hit = !!step.hit;
                    const actualNum = (typeof step.nextNumber === 'number') ? step.nextNumber : 0;
                    try {
                        await money.recordBetResult(betPerNumber, numbersCount, hit, actualNum);
                        bets++;
                    } catch (_) { /* best-effort */ }
                }

                // Keep orchestrator's poll quiet so it doesn't also
                // fire handleAutoMode between our direct steps.
                if (orch && typeof orch === 'object') {
                    try { orch.lastSpinCount = window.spins.length; } catch (_) {}
                }

                if (typeof window.render === 'function') {
                    try { window.render(); } catch (_) {}
                }
                if (stepDelayMs > 0) await new Promise(r => setTimeout(r, stepDelayMs));
                stepped++;
            }

            // Rewrite the full per-session bet history so the
            // exported money-report workbook shows the complete run,
            // not just the last 10 live caps.
            if (money && Array.isArray(session.steps)) {
                const betSteps = session.steps.filter(s => s && s.action === 'BET');
                money.betHistory = betSteps.map((s, i) => ({
                    spin: i + 1,
                    betAmount: (typeof s.betPerNumber === 'number') ? s.betPerNumber : 2,
                    totalBet: ((typeof s.betPerNumber === 'number') ? s.betPerNumber : 2)
                            * ((typeof s.numbersCount === 'number') ? s.numbersCount : 1),
                    hit: !!s.hit,
                    actualNumber: s.nextNumber,
                    netChange: typeof s.pnl === 'number' ? s.pnl : 0,
                    timestamp: (s.timestamp || `replay-${i + 1}`)
                }));
            }
        } finally {
            if (money && money.sessionData && typeof money.sessionData === 'object') {
                if (typeof savedSessionActive !== 'undefined') money.sessionData.isSessionActive = savedSessionActive;
                if (typeof savedBettingEnabled !== 'undefined') money.sessionData.isBettingEnabled = savedBettingEnabled;
                if (typeof money.render === 'function') { try { money.render(); } catch (_) {} }
            }
        }
        return { stepped, bets };
    }

    /**
     * Replay a session's spin window through the real live pipeline,
     * one spin at a time. At each step we:
     *   1) push a single new entry into window.spins,
     *   2) directly invoke window.moneyPanel.checkForNewSpin() so the
     *      money panel resolves any pendingBet against that spin just
     *      like its 200ms polling loop would do during live play,
     *   3) directly invoke window.autoUpdateOrchestrator.handleAutoMode()
     *      when an engine-driven mode is active so the AI produces a
     *      fresh prediction for the next step (that call cascades
     *      down to moneyPanel.setPrediction via the wheel, the same
     *      path normal live play uses),
     *   4) best-effort window.render() so the UI redraws.
     *
     * This drives the money-panel bet lifecycle (pending → resolved)
     * and the engine-adaptation feedback loop (engine.recordResult
     * via the money panel) exactly as they run in a real session —
     * without having to wait for the 200ms / 500ms setIntervals.
     *
     * opts.stepDelayMs (default 0): optional delay between steps so
     * a watching user can see the UI tick through spins. Tests pass
     * 0 for fast execution.
     *
     * Returns { stepped } so callers can confirm the loop ran.
     */
    async replaySessionLive(windowSpins, opts = {}) {
        const stepDelayMs = typeof opts.stepDelayMs === 'number' ? opts.stepDelayMs : 0;
        if (typeof window === 'undefined') return { stepped: 0, moneyEngaged: false };
        if (!Array.isArray(windowSpins) || windowSpins.length === 0) {
            return { stepped: 0, moneyEngaged: false };
        }

        // Reset the renderer and money-panel watermarks so each step
        // counts as a genuinely new live spin.
        if (!Array.isArray(window.spins)) window.spins = [];
        window.spins.length = 0;

        // ── Force money management into "session active + betting
        //    enabled" for the duration of the replay, so the real
        //    MoneyManagementPanel's isSessionActive / isBettingEnabled
        //    gates (app/money-management-panel.js lines 384 + 447) let
        //    checkForNewSpin resolve bets and setPrediction populate
        //    pendingBet. This is the critical live-pipeline engagement
        //    step — without it, the money panel silently no-ops on
        //    every checkForNewSpin. The user's prior panel state is
        //    saved and restored after the replay completes so ordinary
        //    live play outside Result-testing is unaffected.
        let moneyEngaged = false;
        let savedSessionActive, savedBettingEnabled, savedLastSpinCount;
        const money = window.moneyPanel;
        if (money && typeof money === 'object') {
            try {
                if (money.sessionData && typeof money.sessionData === 'object') {
                    savedSessionActive = money.sessionData.isSessionActive;
                    savedBettingEnabled = money.sessionData.isBettingEnabled;
                    money.sessionData.isSessionActive = true;
                    money.sessionData.isBettingEnabled = true;
                    moneyEngaged = true;
                }
                savedLastSpinCount = money.lastSpinCount;
                money.lastSpinCount = 0;
            } catch (_) { /* best-effort */ }
        }

        // Silence the real orchestrator's 500ms polling loop during
        // replay: we bump its lastSpinCount after each tick so its
        // internal setInterval sees no delta and won't double-fire
        // handleAutoMode alongside our direct per-step invocation.
        const orchRef = window.autoUpdateOrchestrator;

        let stepped = 0;
        try {
            for (let i = 0; i < windowSpins.length; i++) {
                const n = windowSpins[i];
                window.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });

                // 1) Money-panel tick — resolves any pendingBet against
                //    this new spin (the same work its 200ms poll does).
                if (money && typeof money.checkForNewSpin === 'function') {
                    try { await money.checkForNewSpin(); } catch (_) {}
                }

                // 2) Orchestrator tick — produces the next decision and
                //    cascades it through the AI panel → wheel →
                //    moneyPanel.setPrediction (pendingBet for the NEXT
                //    step). Gated on autoMode so manual / semi modes
                //    don't trigger engine decisions during the replay.
                if (orchRef && typeof orchRef.handleAutoMode === 'function' && orchRef.autoMode) {
                    try { await orchRef.handleAutoMode(); } catch (_) {}
                }

                // 3) Keep the orchestrator's poll-loop quiet: sync
                //    its lastSpinCount so the 500ms setInterval sees
                //    no delta when it wakes up between our steps.
                if (orchRef && typeof orchRef === 'object') {
                    try { orchRef.lastSpinCount = window.spins.length; } catch (_) {}
                }

                if (typeof window.render === 'function') {
                    try { window.render(); } catch (_) { /* ignore */ }
                }
                if (stepDelayMs > 0) {
                    await new Promise(r => setTimeout(r, stepDelayMs));
                }
                stepped++;
            }
        } finally {
            // Restore the user's prior money-panel flags. If the user
            // had betting paused, they get their paused state back
            // after the replay. The sessionData updates (bankroll,
            // totalBets, betHistory) made during the replay stay —
            // that's the whole point: the comparison report reflects
            // a real run.
            if (money && typeof money === 'object' && money.sessionData) {
                try {
                    if (typeof savedSessionActive !== 'undefined') {
                        money.sessionData.isSessionActive = savedSessionActive;
                    }
                    if (typeof savedBettingEnabled !== 'undefined') {
                        money.sessionData.isBettingEnabled = savedBettingEnabled;
                    }
                    if (typeof savedLastSpinCount !== 'undefined') {
                        money.lastSpinCount = savedLastSpinCount;
                    }
                    // Force a re-render so the restored flag state
                    // is reflected in the visible UI.
                    if (typeof money.render === 'function') {
                        try { money.render(); } catch (_) {}
                    }
                } catch (_) {}
            }
        }
        return { stepped, moneyEngaged };
    }

    /**
     * Convenience wrapper for tests: awaits the most recent replay
     * promise (if any). Resolves immediately when no replay is in
     * flight.
     */
    async waitForReplay() {
        if (this._lastReplayPromise && typeof this._lastReplayPromise.then === 'function') {
            try { await this._lastReplayPromise; } catch (_) { /* surface by callers via then */ }
        }
        return true;
    }

    /**
     * Defer a live-replay call to the next macrotask so the caller
     * (processTabEntry) can return with the sync state visible to
     * its caller first. Returns a promise that resolves when the
     * replay loop completes.
     */
    _scheduleLiveReplay(windowSpins, opts = {}) {
        return new Promise((resolve) => {
            if (typeof setTimeout === 'function') {
                const tid = setTimeout(() => {
                    _activeReplayTimers.delete(tid);
                    this.replaySessionLive(windowSpins, opts)
                        .then(resolve)
                        .catch(() => resolve({ stepped: 0, error: true }));
                }, 0);
                _activeReplayTimers.add(tid);
            } else {
                Promise.resolve().then(() => {
                    this.replaySessionLive(windowSpins, opts)
                        .then(resolve)
                        .catch(() => resolve({ stepped: 0, error: true }));
                });
            }
        });
    }

    /**
     * Defer a recorded-session replay to the next macrotask. Used
     * when the submitted Auto Test session has a populated steps
     * array (the normal case for real Auto Test runs). Tracks the
     * timer id in the shared Set so tests can cancel pending
     * replays via ResultTestingPanel.cancelPendingReplays().
     */
    _scheduleRecordedReplay(session, opts = {}) {
        return new Promise((resolve) => {
            if (typeof setTimeout === 'function') {
                const tid = setTimeout(() => {
                    _activeReplayTimers.delete(tid);
                    this.replayRecordedSession(session, opts)
                        .then(resolve)
                        .catch(() => resolve({ stepped: 0, bets: 0, error: true }));
                }, 0);
                _activeReplayTimers.add(tid);
            } else {
                Promise.resolve().then(() => {
                    this.replayRecordedSession(session, opts)
                        .then(resolve)
                        .catch(() => resolve({ stepped: 0, bets: 0, error: true }));
                });
            }
        });
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

/**
 * Cancel any scheduled-but-not-yet-fired replay timers. Exposed as a
 * static so tests can call it between scenarios when they don't
 * `await panel.waitForReplay()`. Safe to call repeatedly.
 */
ResultTestingPanel.cancelPendingReplays = function () {
    if (typeof clearTimeout !== 'function') return;
    for (const tid of _activeReplayTimers) {
        try { clearTimeout(tid); } catch (_) { /* ignore */ }
    }
    _activeReplayTimers.clear();
};

// ── Dual export (Node tests + browser) ──
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ResultTestingPanel, RESULT_TESTING_MODES, RESULT_TESTING_DEFAULT_MODE };
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
