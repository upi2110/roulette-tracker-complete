/**
 * app/ai-prediction-panel-core.js
 *
 * Reusable, render-only diagnostics panel for AI-trained decisions.
 *
 * Design:
 *   - NO singleton. Each instance owns its own container and state.
 *   - NO betting logic, NO money-panel calls, NO DOM lookups outside
 *     the container passed to the constructor.
 *   - Accepts decisions in the exact shape produced by
 *     AITrainedController#decide(). Unknown fields are ignored.
 *   - Safe to mount multiple times on the same page (e.g. live AI-mode
 *     tab + later backtest visualisation). Instances never share state.
 *
 * Public API:
 *   const panel = new AIPredictionPanelCore(container, opts);
 *   panel.render(decision);
 *   panel.clear();
 *   panel.destroy();
 *
 * Options:
 *   mode:    'full' (default) | 'compact'
 *   title:   optional string shown in the header (default: 'AI-trained')
 *   numberFormatter: (n) => string  // optional override for number chips
 */
(function (globalRef) {
    'use strict';

    const DEFAULT_OPTS = Object.freeze({
        mode: 'full',
        title: 'AI-trained',
        numberFormatter: null
    });

    const PHASE_ORDER = Object.freeze([
        'WARMUP', 'SHADOW', 'EARLY', 'STABILISING', 'ACTIVE', 'RECOVERY', 'PROTECTION'
    ]);

    const PHASE_COLORS = Object.freeze({
        WARMUP:      '#64748b',
        SHADOW:      '#8b5cf6',
        EARLY:       '#0ea5e9',
        STABILISING: '#22c55e',
        ACTIVE:      '#16a34a',
        RECOVERY:    '#f59e0b',
        PROTECTION:  '#ef4444'
    });

    const ACTION_COLORS = Object.freeze({
        WAIT:              '#94a3b8',
        BET:               '#22c55e',
        SHADOW_PREDICT:    '#8b5cf6',
        RETRAIN:           '#f59e0b',
        PROTECTION:        '#ef4444',
        TERMINATE_SESSION: '#7f1d1d'
    });

    const DIAG_LABELS = Object.freeze([
        ['entropy',         'Entropy',         '%'],
        ['conflict',        'Conflict',        '%'],
        ['historianMatch',  'Historian',       '%'],
        ['clusterStrength', 'Cluster',         '%'],
        ['driftScore',      'Drift',           '%'],
        ['lossStreak',      'Loss streak',     '#'],
        ['ghostWin',        'Ghost win',       'bool']
    ]);

    function _pct(x) {
        const n = Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * 100);
        return `${n}%`;
    }

    function _formatDiag(key, value) {
        if (key === 'lossStreak') return String(Number(value) || 0);
        if (key === 'ghostWin') return value ? '✓' : '—';
        return _pct(value);
    }

    function _safeText(s) { return (s == null ? '' : String(s)); }

    function _defaultNumberChip(n) { return String(n); }

    class AIPredictionPanelCore {
        /**
         * @param {HTMLElement} container - DOM element the panel renders into.
         * @param {object} [opts]
         */
        constructor(container, opts) {
            if (!container || typeof container.appendChild !== 'function') {
                throw new TypeError('AIPredictionPanelCore requires a DOM container');
            }
            this.container = container;
            this.opts = Object.assign({}, DEFAULT_OPTS, opts || {});
            // Instance-scoped root so multiple mounts never collide.
            this.root = document.createElement('div');
            this.root.className = 'ai-trained-core';
            this.root.dataset.aiTrainedCore = '1';
            this.root.dataset.mode = this.opts.mode;
            this._build();
            this.container.appendChild(this.root);
            this._lastDecision = null;
        }

        _build() {
            const compact = this.opts.mode === 'compact';
            this.root.style.cssText = [
                'display:block',
                'box-sizing:border-box',
                'width:100%',
                `padding:${compact ? '6px 8px' : '10px 12px'}`,
                'background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
                'border:1px solid #334155',
                'border-radius:8px',
                'color:#e2e8f0',
                `font-size:${compact ? '10px' : '11px'}`,
                'font-family:system-ui,-apple-system,sans-serif'
            ].join(';');

            this.root.innerHTML = `
                <div data-role="header" style="display:flex;align-items:center;gap:8px;margin-bottom:${compact ? '4px' : '6px'};">
                    <span data-role="title" style="font-weight:700;font-size:${compact ? '11px' : '12px'};">${_safeText(this.opts.title)}</span>
                    <span data-role="spin-meta" style="color:#94a3b8;font-size:${compact ? '9px' : '10px'};">spin —</span>
                    <span data-role="phase" style="padding:2px 6px;border-radius:4px;background:#334155;color:white;font-weight:700;">—</span>
                    <span data-role="action" style="padding:2px 6px;border-radius:4px;background:#475569;color:white;font-weight:700;">—</span>
                    <span data-role="confidence" style="margin-left:auto;font-weight:700;">conf —</span>
                </div>
                <div data-role="phase-strip" style="display:flex;gap:2px;margin-bottom:${compact ? '4px' : '8px'};"></div>
                <div data-role="zone" style="margin-bottom:${compact ? '4px' : '6px'};"></div>
                <div data-role="shadow-label" style="display:none;color:#c4b5fd;font-weight:700;margin-bottom:4px;font-size:${compact ? '9px' : '10px'};"></div>
                <div data-role="numbers" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:${compact ? '4px' : '6px'};"></div>
                <div data-role="reason" style="color:#94a3b8;margin-bottom:${compact ? '4px' : '6px'};min-height:1em;"></div>
                <div data-role="diagnostics" style="display:grid;grid-template-columns:repeat(${compact ? 4 : 4},1fr);gap:4px 8px;margin-bottom:${compact ? '4px' : '6px'};"></div>
                <div data-role="reasoning" style="display:${compact ? 'none' : 'block'};color:#cbd5e1;"></div>
            `;

            // Build the phase progression strip once (static cell list).
            const stripEl = this.root.querySelector('[data-role="phase-strip"]');
            PHASE_ORDER.forEach(name => {
                const cell = document.createElement('div');
                cell.dataset.role = 'phase-cell';
                cell.dataset.phase = name;
                cell.textContent = compact ? name.slice(0, 3) : name;
                cell.style.cssText = [
                    'flex:1',
                    'text-align:center',
                    'padding:2px 0',
                    'border-radius:3px',
                    `font-size:${compact ? '8px' : '9px'}`,
                    'font-weight:700',
                    'letter-spacing:0.3px',
                    'background:#1e293b',
                    'color:#64748b',
                    'border:1px solid #334155'
                ].join(';');
                stripEl.appendChild(cell);
            });

            this.els = {
                header:       this.root.querySelector('[data-role="header"]'),
                title:        this.root.querySelector('[data-role="title"]'),
                spinMeta:     this.root.querySelector('[data-role="spin-meta"]'),
                phase:        this.root.querySelector('[data-role="phase"]'),
                action:       this.root.querySelector('[data-role="action"]'),
                confidence:   this.root.querySelector('[data-role="confidence"]'),
                phaseStrip:   this.root.querySelector('[data-role="phase-strip"]'),
                zone:         this.root.querySelector('[data-role="zone"]'),
                shadowLabel:  this.root.querySelector('[data-role="shadow-label"]'),
                numbers:      this.root.querySelector('[data-role="numbers"]'),
                reason:       this.root.querySelector('[data-role="reason"]'),
                diagnostics:  this.root.querySelector('[data-role="diagnostics"]'),
                reasoning:    this.root.querySelector('[data-role="reasoning"]')
            };
        }

        /**
         * Render an AITrainedController decision object.
         * Missing fields are rendered as neutral placeholders.
         */
        render(decision) {
            const d = decision || {};
            this._lastDecision = d;

            // Phase pill
            const phase = _safeText(d.phase) || '—';
            this.els.phase.textContent = phase;
            this.els.phase.style.background = PHASE_COLORS[phase] || '#334155';

            // Phase progression strip: highlight current, dim the rest.
            const phaseCells = this.els.phaseStrip.querySelectorAll('[data-role="phase-cell"]');
            phaseCells.forEach(cell => {
                const isCurrent = (cell.dataset.phase === phase);
                cell.dataset.current = isCurrent ? '1' : '0';
                cell.style.background = isCurrent
                    ? (PHASE_COLORS[phase] || '#334155')
                    : '#1e293b';
                cell.style.color = isCurrent ? 'white' : '#64748b';
                cell.style.borderColor = isCurrent
                    ? (PHASE_COLORS[phase] || '#334155')
                    : '#334155';
            });

            // Action pill
            const action = _safeText(d.action) || '—';
            this.els.action.textContent = action;
            this.els.action.style.background = ACTION_COLORS[action] || '#475569';

            // Spin meta (from diagnostics — never from engine globals).
            const diag = d.diagnostics || {};
            const spinIdx = (typeof diag.spinIndex === 'number') ? diag.spinIndex : null;
            const spinsSeen = (typeof diag.spinsSeen === 'number') ? diag.spinsSeen : null;
            if (spinIdx != null || spinsSeen != null) {
                this.els.spinMeta.textContent =
                    `spin ${spinIdx != null ? spinIdx : '—'} · seen ${spinsSeen != null ? spinsSeen : '—'}`;
            } else {
                this.els.spinMeta.textContent = 'spin —';
            }

            // Confidence
            this.els.confidence.textContent = (typeof d.confidence === 'number')
                ? `conf ${_pct(d.confidence)}`
                : 'conf —';

            // Zone label (if present)
            if (d.zone && d.zone.label) {
                this.els.zone.textContent = `zone: ${d.zone.label}`;
                this.els.zone.style.color = '#cbd5e1';
            } else {
                this.els.zone.textContent = '';
            }

            // Numbers chips. BET → bettable numbers; SHADOW_PREDICT →
            // shadow numbers rendered as "ghost" chips so the UI still
            // shows the diagnostic prediction without suggesting a bet.
            const fmt = this.opts.numberFormatter || _defaultNumberChip;
            let chipNums = Array.isArray(d.numbers) ? d.numbers : [];
            const isShadow = (action === 'SHADOW_PREDICT');
            if (isShadow && chipNums.length === 0 && Array.isArray(d.shadowNumbers)) {
                chipNums = d.shadowNumbers;
            }
            // Enforce the 12-number display cap defensively. Controller
            // already caps; this protects against callers passing raw
            // signal fusion output.
            if (chipNums.length > 12) chipNums = chipNums.slice(0, 12);

            // Explicit non-bettable label for shadow predictions.
            if (isShadow && chipNums.length > 0) {
                this.els.shadowLabel.style.display = 'block';
                this.els.shadowLabel.textContent = 'SHADOW — diagnostics only, not bettable';
            } else {
                this.els.shadowLabel.style.display = 'none';
                this.els.shadowLabel.textContent = '';
            }

            this.els.numbers.innerHTML = '';
            chipNums.forEach(n => {
                const chip = document.createElement('span');
                chip.textContent = fmt(n);
                chip.dataset.role = isShadow ? 'shadow-chip' : 'number-chip';
                chip.style.cssText = [
                    'display:inline-block',
                    'min-width:22px',
                    'padding:2px 6px',
                    'text-align:center',
                    'border-radius:4px',
                    'font-weight:700',
                    `background:${isShadow ? 'transparent' : '#0f172a'}`,
                    `border:1px solid ${isShadow ? '#8b5cf6' : '#334155'}`,
                    `color:${isShadow ? '#c4b5fd' : '#f1f5f9'}`
                ].join(';');
                this.els.numbers.appendChild(chip);
            });

            // Reason
            this.els.reason.textContent = _safeText(d.reason);

            // Diagnostics grid
            this.els.diagnostics.innerHTML = '';
            DIAG_LABELS.forEach(([key, label]) => {
                const cell = document.createElement('div');
                cell.dataset.diag = key;
                cell.style.cssText = 'display:flex;justify-content:space-between;gap:6px;';
                const l = document.createElement('span');
                l.textContent = label;
                l.style.color = '#94a3b8';
                const v = document.createElement('span');
                v.textContent = _formatDiag(key, diag[key]);
                v.style.fontWeight = '700';
                v.style.color = '#f1f5f9';
                cell.appendChild(l);
                cell.appendChild(v);
                this.els.diagnostics.appendChild(cell);
            });

            // Reasoning (full mode only)
            if (this.opts.mode !== 'compact') {
                const r = d.reasoning || { signals: [], rejected: [] };
                const signals = Array.isArray(r.signals) ? r.signals : [];
                const rejected = Array.isArray(r.rejected) ? r.rejected : [];
                this.els.reasoning.innerHTML = `
                    <div data-role="signals" style="margin-bottom:2px;">
                        <span style="color:#94a3b8;">signals:</span>
                        ${signals.length
                            ? signals.map(s => `<span style="margin-left:4px;color:#86efac;">${_safeText(s)}</span>`).join('')
                            : '<span style="margin-left:4px;color:#64748b;">—</span>'}
                    </div>
                    <div data-role="rejected">
                        <span style="color:#94a3b8;">rejected:</span>
                        ${rejected.length
                            ? rejected.map(s => `<span style="margin-left:4px;color:#fca5a5;">${_safeText(s)}</span>`).join('')
                            : '<span style="margin-left:4px;color:#64748b;">—</span>'}
                    </div>
                `;
            }
        }

        clear() {
            this._lastDecision = null;
            this.els.phase.textContent = '—';
            this.els.phase.style.background = '#334155';
            this.els.action.textContent = '—';
            this.els.action.style.background = '#475569';
            this.els.confidence.textContent = 'conf —';
            this.els.spinMeta.textContent = 'spin —';
            this.els.zone.textContent = '';
            this.els.shadowLabel.style.display = 'none';
            this.els.shadowLabel.textContent = '';
            this.els.numbers.innerHTML = '';
            this.els.reason.textContent = '';
            this.els.diagnostics.innerHTML = '';
            this.els.reasoning.innerHTML = '';
            // Reset phase-strip highlight.
            const cells = this.els.phaseStrip.querySelectorAll('[data-role="phase-cell"]');
            cells.forEach(cell => {
                cell.dataset.current = '0';
                cell.style.background = '#1e293b';
                cell.style.color = '#64748b';
                cell.style.borderColor = '#334155';
            });
        }

        destroy() {
            if (this.root && this.root.parentNode) {
                this.root.parentNode.removeChild(this.root);
            }
            this.root = null;
            this.els = null;
            this._lastDecision = null;
        }

        getLastDecision() { return this._lastDecision; }
    }

    const api = { AIPredictionPanelCore, PHASE_COLORS, PHASE_ORDER, ACTION_COLORS, DIAG_LABELS };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.AIPredictionPanelCore = AIPredictionPanelCore;
        globalRef.AIPredictionPanelCoreAPI = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
