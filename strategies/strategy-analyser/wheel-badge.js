/**
 * strategies/strategy-analyser/wheel-badge.js
 *
 * A prominent BET/WAIT badge anchored at the top of the European
 * Wheel panel. Auto-hides outside Test(Lab) mode. Auto-updates
 * every 500ms from the live orchestrator's session state.
 *
 * Click → opens the Explain popup (via window.StrategyAnalyserExplainPopup).
 *
 * Visual states (matched to action chip colours used in the popup):
 *
 *   BET         — solid green   (#16a34a)   confidence ≥ floor
 *   FORCED BET  — solid red     (#dc2626)   wait-cap triggered
 *   WAIT        — solid amber   (#f59e0b)   confidence < floor, holding
 *   WARMUP      — grey          (#475569)   < 3 spins
 *   IDLE        — slate         (#1e293b)   no decision yet (mode just entered)
 */

(function () {
    'use strict';

    const BADGE_ID = 'analyserWheelBadge';
    const POLL_MS  = 500;

    let _state = 'IDLE';
    let _lastDecisionKey = '';

    function _injectBadge() {
        if (document.getElementById(BADGE_ID)) return;
        const wheelPanel = document.getElementById('wheelPanel');
        if (!wheelPanel) return;     // wheel not built yet — retry next tick

        const badge = document.createElement('div');
        badge.id = BADGE_ID;
        badge.title = 'Click to open StrategyAnalyser explanation';
        badge.style.cssText = [
            'display:none',
            'margin:8px 12px 4px',
            'padding:10px 14px',
            'background:#1e293b',
            'border:2px solid #475569',
            'border-radius:6px',
            'cursor:pointer',
            'text-align:center',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'transition:background 0.2s, border-color 0.2s',
            'user-select:none',
            'box-shadow:0 2px 8px rgba(0,0,0,0.15)'
        ].join(';');
        badge.innerHTML = `
            <div id="${BADGE_ID}-action" style="font-size:20px;font-weight:800;color:#cbd5e1;letter-spacing:1px;">
                IDLE
            </div>
            <div id="${BADGE_ID}-meta" style="font-size:11px;color:#94a3b8;margin-top:2px;">
                analyser standby
            </div>
        `;

        // Click → popup
        badge.addEventListener('click', () => {
            try {
                const ctl = window.StrategyAnalyserExplainPopup;
                if (ctl && typeof ctl.open === 'function') ctl.open();
            } catch (_) { /* defensive */ }
        });

        // Inject right after the wheel panel header (.panel-header) if it
        // exists, otherwise as the panel's first child.
        const header = wheelPanel.querySelector('.panel-header')
                    || wheelPanel.querySelector('h3');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(badge, header.nextSibling);
        } else {
            wheelPanel.insertBefore(badge, wheelPanel.firstChild);
        }
    }

    function _styleFor(state) {
        // Background + border + label colour per action.
        switch (state) {
            case 'BET':        return { bg: '#16a34a', bd: '#14532d', fg: '#fff', label: '🟢 BET' };
            case 'FORCED_BET': return { bg: '#dc2626', bd: '#7f1d1d', fg: '#fff', label: '🔴 FORCED BET' };
            case 'WAIT':       return { bg: '#f59e0b', bd: '#78350f', fg: '#fff', label: '🟠 WAIT' };
            case 'WARMUP':     return { bg: '#475569', bd: '#1e293b', fg: '#e2e8f0', label: '⚪ WARMUP' };
            default:           return { bg: '#1e293b', bd: '#475569', fg: '#94a3b8', label: '⚪ IDLE' };
        }
    }

    function _readExplanation() {
        const SA = window.StrategyAnalyser;
        if (!SA || typeof SA.getLastExplanation !== 'function') return null;
        let st = null;
        try {
            st = window.autoUpdateOrchestrator
              && window.autoUpdateOrchestrator._analyserSessionState;
        } catch (_) {}
        if (!st) return null;
        return SA.getLastExplanation(st);
    }

    function _decideState(exp) {
        if (!exp) return 'IDLE';
        if (exp.phase === 'WARMUP') return 'WARMUP';
        if (exp.forcedBet)          return 'FORCED_BET';
        // confidence vs effectiveFloor decides BET vs WAIT.
        const conf  = exp.confidence != null ? exp.confidence : 0;
        const floor = exp.effectiveFloor != null
            ? exp.effectiveFloor
            : (exp.confidenceFloor != null ? exp.confidenceFloor : 60);
        return conf >= floor ? 'BET' : 'WAIT';
    }

    function _readWheelNumbers() {
        // Universal signal across every strategy (manual, auto/V6,
        // ai-trained, t1-strategy, 3t-selection, analytics, test):
        // the live highlighted set on the wheel.
        try {
            const rw = window.rouletteWheel;
            const nums = rw && rw._rawPrediction
                      && rw._rawPrediction.prediction
                      && rw._rawPrediction.prediction.numbers;
            if (Array.isArray(nums)) return nums;
        } catch (_) {}
        return [];
    }

    function _modeLabel() {
        const ui = window.aiAutoModeUI || {};
        const mode = ui.currentMode || '';
        const auto = !!ui.autoMode;
        switch (mode) {
            case 'test':         return 'Test (Lab)';
            case 'ai-trained':   return 'AI-Trained';
            case 't1-strategy':  return 'T1 Strategy';
            case '3t-selection': return '3T Selection';
            case 'analytics':    return 'Analytics';
            case 'auto':         return 'Auto (V6)';
            default:             return auto ? (mode || 'Auto') : 'Manual';
        }
    }

    function _refresh() {
        // Inject if needed (wheel panel may load later than this script).
        _injectBadge();
        const badge = document.getElementById(BADGE_ID);
        if (!badge) return;

        // Badge is always visible — every strategy (including manual)
        // gets a BET/WAIT indicator on the wheel.
        badge.style.display = 'block';

        const ui = window.aiAutoModeUI || {};
        const mode = ui.currentMode || '';
        const modeLabel = _modeLabel();

        // --- Decide state -------------------------------------------------
        // Test(Lab) keeps the rich analyser-driven state (BET / FORCED /
        // WAIT / WARMUP / IDLE) so the confidence-vs-floor story shows.
        // Every other mode infers BET vs WAIT from the live wheel
        // selection — populated set → BET, empty → WAIT.
        let state, meta, picks = 0, exp = null;
        if (mode === 'test') {
            exp = _readExplanation();
            state = _decideState(exp);
            if (!exp) {
                meta = `${modeLabel}  ·  analyser standby — enter spins to begin`;
            } else {
                const conf  = exp.confidence != null ? exp.confidence : 0;
                const floor = exp.effectiveFloor != null
                    ? exp.effectiveFloor
                    : (exp.confidenceFloor != null ? exp.confidenceFloor : 60);
                const spin  = exp.spinCount || 0;
                const losses = exp.consecutiveLosses || 0;
                const lossNote = losses >= 2 ? `  ·  ${losses} losses` : '';
                meta = `${modeLabel}  ·  ${conf}% confidence  ·  floor ${floor}%  ·  spin #${spin}${lossNote}  ·  tap for details`;
            }
        } else {
            const nums = _readWheelNumbers();
            picks = nums.length;
            state = picks > 0 ? 'BET' : 'WAIT';
            if (picks > 0) {
                meta = `${modeLabel}  ·  ${picks} number${picks === 1 ? '' : 's'} selected  ·  place your bet`;
            } else {
                meta = `${modeLabel}  ·  no numbers selected  ·  waiting for a pick`;
            }
        }

        // Cheap key — re-paint only when something changes.
        const key = state + '|' + mode + '|' + picks
                  + '|' + (exp ? exp.spinCount : '-')
                  + '|' + (exp ? exp.confidence : '-');
        if (key === _lastDecisionKey) return;
        _lastDecisionKey = key;
        _state = state;

        const sty = _styleFor(state);
        badge.style.background   = sty.bg;
        badge.style.borderColor  = sty.bd;
        const actionEl = document.getElementById(BADGE_ID + '-action');
        const metaEl   = document.getElementById(BADGE_ID + '-meta');
        if (actionEl) {
            actionEl.textContent = sty.label;
            actionEl.style.color = sty.fg;
        }
        if (metaEl) {
            metaEl.textContent = meta;
            metaEl.style.color = (state === 'WARMUP' || state === 'IDLE')
                ? '#94a3b8'
                : 'rgba(255,255,255,0.85)';
        }
    }

    function _start() {
        // First inject try shortly after DOM is ready in case wheel
        // panel script hasn't built #wheelPanel yet.
        setTimeout(_injectBadge, 300);
        setInterval(_refresh, POLL_MS);
        _refresh();
        console.log('🎯 StrategyAnalyser wheel badge: armed');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }
})();
