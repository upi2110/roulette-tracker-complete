/**
 * strategies/strategy-analyser/settings-panel.js
 *
 * Test(Lab) settings UI for the StrategyAnalyser.
 *
 * Layout — wraps onto multiple lines:
 *   Row 1: ⚙ Analyser · Floor · Scale · Max · 📖 Explain · ↺ Reset
 *   Row 2: ⚖ Weightage (per rule) — for each of the 6 locked rules:
 *           ☑ enable checkbox · weight input
 *
 * Persistence (localStorage):
 *   strategyAnalyser.<paramKey>            for Floor / Scale / Max
 *   strategyAnalyser.weight.<ruleId>       for per-rule global weight
 *   strategyAnalyser.disabled.<ruleId>     '1' or '0' — disabled flag
 *
 * Pushes config into:
 *   window.strategyAnalyserParams = {
 *       confidenceFloor, confidenceScale, maxNumbers,
 *       weights: { signStreak, tableStreak, setCarry,
 *                  subAnchorPattern, crossCellRotate, crossTableConv },
 *       disabledRules: Set<ruleId>
 *   }
 *
 * Visibility: only when window.aiAutoModeUI.currentMode === 'test'.
 *
 * NOTE — in-rule SPLITS (e.g. Rule 4's 40/40/20, Rule 6's 50/25/25)
 * live as constants inside each signal file. A future UI iteration
 * can expose them; for now, global weights + enable flags are the
 * primary configurable surface.
 */

(function () {
    'use strict';

    const CONTAINER_ID   = 'strategyAnalyserSettings';
    const STORAGE_PREFIX = 'strategyAnalyser.';

    // Top-row scalar fields (kept after Rules 9/10/11 removal).
    const FIELDS = [
        { k: 'confidenceFloor', lbl: 'Floor', min: 0,   max: 100, step: 1,   suf: '%',
            help: 'Confidence floor. confidence < floor → WAIT.' },
        { k: 'confidenceScale', lbl: 'Scale', min: 0.5, max: 20,  step: 0.5, suf: '',
            help: 'Used weight ÷ scale × 100 = confidence%.' },
        { k: 'maxNumbers',      lbl: 'Max',   min: 6,   max: 18,  step: 1,   suf: '',
            help: 'Max numbers in prediction list.' }
    ];

    // Locked rules. Order = display order. Default weights from DEFAULTS.
    const RULES = [
        { id: 'signStreak',       label: '1·Sign streak' },
        { id: 'tableStreak',      label: '2·Table streak' },
        { id: 'setCarry',         label: '3·Set carry' },
        { id: 'subAnchorPattern', label: '4·Sub-anchor' },
        { id: 'crossCellRotate',  label: '6·Cross-cell' },
        { id: 'crossTableConv',   label: '7·T3 golden' }
    ];

    function _defaults() {
        const SA = (typeof window !== 'undefined') ? window.StrategyAnalyser : null;
        return (SA && SA.DEFAULTS) || {
            confidenceFloor: 60, confidenceScale: 8.0, maxNumbers: 12,
            weights: {
                signStreak: 0.80, tableStreak: 0.80, setCarry: 0.50,
                subAnchorPattern: 0.30, crossCellRotate: 0.30, crossTableConv: 1.20
            }
        };
    }

    function _getLS(key) {
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem(STORAGE_PREFIX + key);
            }
        } catch (_) {}
        return null;
    }
    function _setLS(key, value) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_PREFIX + key, String(value));
            }
        } catch (_) {}
    }

    function _loadParams() {
        const d = _defaults();
        const params = {};
        FIELDS.forEach(f => {
            const raw = _getLS(f.k);
            const v = raw !== null ? parseFloat(raw) : NaN;
            params[f.k] = Number.isNaN(v) ? d[f.k] : v;
        });
        const weights = {};
        const disabledRules = new Set();
        RULES.forEach(r => {
            const rawW = _getLS('weight.' + r.id);
            const w = rawW !== null ? parseFloat(rawW) : NaN;
            weights[r.id] = Number.isNaN(w) ? d.weights[r.id] : w;
            const dis = _getLS('disabled.' + r.id);
            if (dis === '1') disabledRules.add(r.id);
        });
        params.weights = weights;
        params.disabledRules = disabledRules;
        return params;
    }

    function _applyParams(params) {
        if (typeof window === 'undefined') return;
        // Clone the basics; carry the Set through (orchestrator passes
        // it into evaluateAll which honours Set or Array).
        window.strategyAnalyserParams = {
            confidenceFloor: params.confidenceFloor,
            confidenceScale: params.confidenceScale,
            maxNumbers:      params.maxNumbers,
            weights:         Object.assign({}, params.weights),
            disabledRules:   new Set(params.disabledRules || [])
        };
        try {
            if (window.autoTestRunner) {
                window.autoTestRunner._analyserParams = Object.assign({}, window.strategyAnalyserParams);
            }
        } catch (_) {}
    }

    function _renderScalarRow(params) {
        return FIELDS.map(f => `
            <label title="${f.help}" style="display:inline-flex;align-items:center;gap:3px;
                        font-size:10px;color:#cbd5e1;flex:0 0 auto;">
                <span style="opacity:0.8;">${f.lbl}</span>
                <input id="sa-set-${f.k}" type="number" value="${params[f.k]}"
                       min="${f.min}" max="${f.max}" step="${f.step}"
                       style="width:46px;padding:1px 4px;font-size:10px;
                              background:#0f172a;color:#e2e8f0;
                              border:1px solid #334155;border-radius:3px;">${f.suf ? '<span style="opacity:0.7;">' + f.suf + '</span>' : ''}
            </label>`).join('');
    }

    function _renderWeightageRow(params) {
        const items = RULES.map(r => {
            const w   = params.weights[r.id];
            const dis = params.disabledRules.has(r.id);
            return `
                <label title="Enable / disable Rule ${r.id}"
                       style="display:inline-flex;align-items:center;gap:3px;
                              font-size:10px;color:#cbd5e1;flex:0 0 auto;
                              padding:2px 5px;border-radius:3px;
                              background:rgba(20,184,166,0.08);border:1px solid #1f2937;">
                    <input id="sa-rule-en-${r.id}" type="checkbox" ${!dis ? 'checked' : ''}
                           style="margin:0;cursor:pointer;">
                    <span style="font-weight:600;color:${dis ? '#64748b' : '#e2e8f0'};">${r.label}</span>
                    <input id="sa-rule-w-${r.id}" type="number" value="${w}"
                           min="0" max="5" step="0.05"
                           style="width:54px;padding:1px 4px;font-size:10px;
                                  background:#0f172a;color:#e2e8f0;
                                  border:1px solid #334155;border-radius:3px;"
                           ${dis ? 'disabled' : ''}>
                </label>`;
        }).join('');
        return `
            <div style="display:flex;align-items:center;gap:6px 8px;flex:1 1 100%;
                        flex-wrap:wrap;margin-top:4px;padding-top:5px;
                        border-top:1px dashed #334155;">
                <span style="font-size:10px;color:#fbbf24;font-weight:700;flex:0 0 auto;">⚖ Weightage</span>
                ${items}
            </div>`;
    }

    function _render(params) {
        return `
            <div id="${CONTAINER_ID}" data-tab-group="test" style="
                display:none;flex:1 1 100%;align-items:flex-start;gap:6px 10px;
                flex-wrap:wrap;padding:5px 8px;margin-top:4px;
                background:rgba(15,23,42,0.85);
                border:1px solid #334155;border-radius:5px;">
                <span style="font-size:10px;color:#5eead4;font-weight:700;flex:0 0 auto;">⚙ Analyser</span>
                ${_renderScalarRow(params)}
                <span style="flex:1 0 0;"></span>
                <button id="sa-set-explain" title="Open the StrategyAnalyser explanation popup"
                        style="padding:3px 10px;font-size:11px;font-weight:700;flex:0 0 auto;
                               background:#0d9488;color:#fff;border:none;border-radius:3px;cursor:pointer;">
                    📖 Explain
                </button>
                <button id="sa-set-reset" title="Restore defaults (rules, weights, scalars)"
                        style="padding:3px 7px;font-size:11px;flex:0 0 auto;
                               background:transparent;color:#94a3b8;
                               border:1px solid #475569;border-radius:3px;cursor:pointer;">↺ Reset</button>
                ${_renderWeightageRow(params)}
            </div>`;
    }

    function _refreshFromState() {
        const params = _loadParams();
        _applyParams(params);
    }

    function _wireScalar(f) {
        const input = document.getElementById('sa-set-' + f.k);
        if (!input) return;
        input.addEventListener('change', () => {
            const v = parseFloat(input.value);
            if (Number.isNaN(v)) return;
            const clamped = Math.max(f.min, Math.min(f.max, v));
            input.value = clamped;
            _setLS(f.k, clamped);
            _refreshFromState();
        });
    }

    function _wireRule(rule) {
        const enBox  = document.getElementById('sa-rule-en-' + rule.id);
        const wInput = document.getElementById('sa-rule-w-' + rule.id);
        if (enBox) {
            enBox.addEventListener('change', () => {
                _setLS('disabled.' + rule.id, enBox.checked ? '0' : '1');
                if (wInput) wInput.disabled = !enBox.checked;
                _refreshFromState();
            });
        }
        if (wInput) {
            wInput.addEventListener('change', () => {
                const v = parseFloat(wInput.value);
                if (Number.isNaN(v)) return;
                const clamped = Math.max(0, Math.min(5, v));
                wInput.value = clamped;
                _setLS('weight.' + rule.id, clamped);
                _refreshFromState();
            });
        }
    }

    function _inject() {
        if (document.getElementById(CONTAINER_ID)) return;
        const anchor = document.getElementById('strategyLabGreyToggleWrap');
        if (!anchor || !anchor.parentNode) return;

        const wrap = document.createElement('div');
        wrap.innerHTML = _render(_loadParams());
        const node = wrap.firstElementChild;
        anchor.parentNode.insertBefore(node, anchor.nextSibling);

        FIELDS.forEach(_wireScalar);
        RULES.forEach(_wireRule);

        const explainBtn = document.getElementById('sa-set-explain');
        if (explainBtn) {
            explainBtn.addEventListener('click', () => {
                const ctl = window.StrategyAnalyserExplainPopup;
                if (ctl && typeof ctl.open === 'function') ctl.open();
            });
        }

        const resetBtn = document.getElementById('sa-set-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const d = _defaults();
                FIELDS.forEach(f => {
                    _setLS(f.k, d[f.k]);
                    const input = document.getElementById('sa-set-' + f.k);
                    if (input) input.value = d[f.k];
                });
                RULES.forEach(r => {
                    _setLS('weight.' + r.id, d.weights[r.id]);
                    _setLS('disabled.' + r.id, '0');
                    const enBox  = document.getElementById('sa-rule-en-' + r.id);
                    const wInput = document.getElementById('sa-rule-w-' + r.id);
                    if (enBox)  { enBox.checked = true; }
                    if (wInput) { wInput.value = d.weights[r.id]; wInput.disabled = false; }
                });
                _refreshFromState();
            });
        }
    }

    function _syncVisibility() {
        const el = document.getElementById(CONTAINER_ID);
        if (!el) { _inject(); return; }
        const mode = (window.aiAutoModeUI && window.aiAutoModeUI.currentMode) || '';
        el.style.display = (mode === 'test') ? 'flex' : 'none';
    }

    function _start() {
        _refreshFromState();
        setInterval(_syncVisibility, 500);
        _syncVisibility();
        console.log('⚙ StrategyAnalyser settings: armed (per-rule weightage enabled)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }
})();
