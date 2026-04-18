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
                        <input id="resultTestingTabInput" type="text" placeholder="e.g. strategy1 or 1"
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

        const tabName = this.resolveTabName(raw);
        if (!tabName) {
            if (msg) msg.textContent = '⚠ Enter a tab name (overview / strategy1 / strategy2 / strategy3) or a number 0–3.';
            return { ok: false, error: 'invalid-tab' };
        }

        // Pull the spin history that drove this Auto Test. The runner
        // stores the full testSpins on result (via auto-test-ui which
        // passes testSpins into runAll). If it's not there, we use the
        // UI-side cached testSpins via the global handle autoTestUI.
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

        // Switch to manual mode so the user can drive the replay.
        if (typeof window !== 'undefined' && window.aiAutoModeUI
            && typeof window.aiAutoModeUI.setMode === 'function') {
            try { window.aiAutoModeUI.setMode('manual'); } catch (_) { /* best-effort */ }
        }

        // Seed the global spins array and trigger a render. We write
        // into window.spins (the renderer's shared source of truth) and
        // call window.render() if exposed. We deliberately AVOID
        // altering the renderer or introducing any new ±1 / anchor
        // logic here — this is purely a data hand-off.
        if (typeof window !== 'undefined') {
            if (!Array.isArray(window.spins)) window.spins = [];
            window.spins.length = 0;
            spins.forEach((n, i) => {
                window.spins.push({ actual: n, direction: i % 2 === 0 ? 'C' : 'AC' });
            });
            if (typeof window.render === 'function') {
                try { window.render(); } catch (_) { /* ignore render-time errors */ }
            }
        }

        this.lastTabLoaded = tabName;

        if (msg) msg.textContent = `✔ Switched to Manual and loaded ${spins.length} spins for tab=${tabName}.`;
        if (dlBtn) dlBtn.disabled = false;

        // Populate the comparison panel with the auto-test summary for
        // the chosen strategy tab (or all three for overview).
        if (cmp) {
            cmp.innerHTML = this._buildComparisonHtml(tabName);
            cmp.style.display = 'block';
        }

        return { ok: true, tabName, spinCount: spins.length };
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
