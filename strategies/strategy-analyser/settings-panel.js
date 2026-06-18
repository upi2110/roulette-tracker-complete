/**
 * strategies/strategy-analyser/settings-panel.js
 *
 * Test(Lab) settings UI for the StrategyAnalyser. Injects a small
 * inline-block of controls next to the existing test-tab buttons in
 * the AI Prediction Panel header. Five inputs:
 *
 *    confidenceFloor   confidenceScale   maxNumbers   waitCap   t3CooldownRounds
 *
 * Reads/writes:
 *    • localStorage.strategyAnalyser.<key>      (persistence)
 *    • window.strategyAnalyserParams            (orchestrator reads)
 *    • window.autoTestRunner._analyserParams    (runner reads, if loaded)
 *
 * Visibility: only when window.aiAutoModeUI.currentMode === 'test'.
 * Polled every 500ms (same pattern as Strict's button visibility).
 *
 * Reset-to-defaults button restores DEFAULTS from the analyser.
 *
 * Reads the analyser's DEFAULTS at load time so the UI always
 * matches the brain's expectations.
 */

(function () {
    'use strict';

    const CONTAINER_ID = 'strategyAnalyserSettings';
    const STORAGE_PREFIX = 'strategyAnalyser.';

    // Each field: name, label, type (number), min, max, step, helper.
    const FIELDS = [
        { k: 'confidenceFloor',  lbl: 'Conf floor',   min: 0,   max: 100, step: 1,   suf: '%',
            help: 'Below this → WAIT (display only). Lower = bet more.' },
        { k: 'confidenceScale',  lbl: 'Conf scale',   min: 0.5, max: 20,  step: 0.5, suf: '',
            help: 'Higher = stricter (more total fired weight to reach 100%).' },
        { k: 'maxNumbers',       lbl: 'Max nums',     min: 6,   max: 18,  step: 1,   suf: '',
            help: 'Ceiling on prediction list size.' },
        { k: 'waitCap',          lbl: 'Wait cap',     min: 1,   max: 10,  step: 1,   suf: '',
            help: 'N consecutive WAITs → next call FORCES a BET.' },
        { k: 't3CooldownRounds', lbl: 'T3 cooldown',  min: 0,   max: 10,  step: 1,   suf: ' rounds',
            help: 'After T3 pair misses its projection, suppress signals for N rounds.' }
    ];

    function _defaults() {
        const SA = (typeof window !== 'undefined') ? window.StrategyAnalyser : null;
        return (SA && SA.DEFAULTS) || {
            confidenceFloor: 60, confidenceScale: 4.0, maxNumbers: 12,
            waitCap: 3, t3CooldownRounds: 3
        };
    }

    function _loadParams() {
        const d = _defaults();
        const out = {};
        FIELDS.forEach(f => {
            let stored = null;
            try {
                if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem(STORAGE_PREFIX + f.k);
                    if (raw !== null) {
                        const v = parseFloat(raw);
                        if (!Number.isNaN(v)) stored = v;
                    }
                }
            } catch (_) { /* private mode etc. */ }
            out[f.k] = (stored !== null) ? stored : d[f.k];
        });
        return out;
    }

    function _saveParam(key, value) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_PREFIX + key, String(value));
            }
        } catch (_) { /* swallow */ }
    }

    function _applyParams(params) {
        if (typeof window === 'undefined') return;
        window.strategyAnalyserParams = Object.assign({}, params);
        // If the auto-test runner has been instantiated, push there too
        // so a backtest reads the same tunings.
        try {
            if (window.autoTestRunner) {
                window.autoTestRunner._analyserParams = Object.assign({}, params);
            }
        } catch (_) { /* defensive */ }
    }

    function _render(params) {
        const fieldHtml = FIELDS.map(f => {
            const val = params[f.k];
            return `
                <label title="${f.help}" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:#cbd5e1;margin-right:8px;">
                    <span style="opacity:0.8;">${f.lbl}</span>
                    <input id="sa-set-${f.k}" type="number" value="${val}"
                           min="${f.min}" max="${f.max}" step="${f.step}"
                           style="width:48px;padding:1px 4px;font-size:10px;
                                  background:#0f172a;color:#e2e8f0;
                                  border:1px solid #334155;border-radius:3px;">${f.suf ? '<span style="opacity:0.7;">' + f.suf + '</span>' : ''}
                </label>`;
        }).join('');
        return `
            <div id="${CONTAINER_ID}" data-tab-group="test" style="
                display:none;flex:0 0 auto;padding:4px 8px;
                background:rgba(15,23,42,0.85);
                border:1px solid #334155;border-radius:5px;
                white-space:nowrap;">
                <span style="font-size:10px;color:#5eead4;font-weight:700;margin-right:6px;">⚙ Analyser</span>
                ${fieldHtml}
                <button id="sa-set-explain" title="Open the StrategyAnalyser explanation popup"
                        style="margin-left:6px;padding:2px 8px;font-size:10px;font-weight:700;
                               background:#0d9488;color:#fff;border:none;border-radius:3px;cursor:pointer;">
                    📖 Explain
                </button>
                <button id="sa-set-reset" title="Restore defaults"
                        style="margin-left:4px;padding:2px 6px;font-size:10px;
                               background:transparent;color:#94a3b8;
                               border:1px solid #475569;border-radius:3px;cursor:pointer;">↺</button>
            </div>
        `;
    }

    function _inject() {
        if (document.getElementById(CONTAINER_ID)) return;
        // Attach next to the existing test-tab controls — find the
        // include-grey label that was kept on disk from StrategyLab era.
        const anchor = document.getElementById('strategyLabGreyToggleWrap');
        if (!anchor || !anchor.parentNode) return;   // Wait for DOM to settle.

        const wrap = document.createElement('div');
        wrap.innerHTML = _render(_loadParams());
        const node = wrap.firstElementChild;
        anchor.parentNode.insertBefore(node, anchor.nextSibling);

        // Wire input handlers
        FIELDS.forEach(f => {
            const input = document.getElementById('sa-set-' + f.k);
            if (!input) return;
            input.addEventListener('change', () => {
                const v = parseFloat(input.value);
                if (Number.isNaN(v)) return;
                const clamped = Math.max(f.min, Math.min(f.max, v));
                input.value = clamped;
                _saveParam(f.k, clamped);
                _applyParams(_loadParams());
            });
        });
        // Explain button → open popup if controller present
        const explainBtn = document.getElementById('sa-set-explain');
        if (explainBtn) {
            explainBtn.addEventListener('click', () => {
                const ctl = window.StrategyAnalyserExplainPopup;
                if (ctl && typeof ctl.open === 'function') ctl.open();
            });
        }
        // Reset
        const resetBtn = document.getElementById('sa-set-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const d = _defaults();
                FIELDS.forEach(f => {
                    _saveParam(f.k, d[f.k]);
                    const input = document.getElementById('sa-set-' + f.k);
                    if (input) input.value = d[f.k];
                });
                _applyParams(_loadParams());
            });
        }
    }

    function _syncVisibility() {
        const el = document.getElementById(CONTAINER_ID);
        if (!el) {
            _inject();   // First time: inject when DOM landmark exists.
            return;
        }
        const mode = (window.aiAutoModeUI && window.aiAutoModeUI.currentMode) || '';
        el.style.display = (mode === 'test') ? 'inline-block' : 'none';
    }

    function _start() {
        // Push the persisted params into the global stash IMMEDIATELY
        // so the orchestrator's first decide call uses them, even if
        // the user never opens the settings UI.
        _applyParams(_loadParams());
        setInterval(_syncVisibility, 500);
        _syncVisibility();
        console.log('⚙ StrategyAnalyser settings: armed');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }
})();
