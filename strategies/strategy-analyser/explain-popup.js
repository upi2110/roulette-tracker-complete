/**
 * strategies/strategy-analyser/explain-popup.js
 *
 * Renderer-side controller for the analyser's Explain popup.
 *
 * Opens on click of #sa-set-explain (in the settings panel) and
 * refreshes its contents every 750ms while open. Reads the live
 * orchestrator's sessionState — getLastExplanation(state) — to render:
 *
 *   • header (action chip, confidence, spin#, reason)
 *   • plain-English summary
 *   • picked numbers (with ⭐ on user-selection nums)
 *   • fired-signals table (name, weight, candidates, reason)
 *   • top-scored numbers (top 20 with weight)
 *   • suppressed-by-cooldown list (pair + rounds left)
 *   • session state (consecutiveWaits, T3 cooldown count)
 *
 * Draggable header. Close button. Self-contained styling. Loaded as
 * a classic script — no module system. Exposes
 * window.StrategyAnalyserExplainPopup = { open(), close(), isOpen() }.
 */

(function () {
    'use strict';

    const POPUP_ID  = 'analyserExplainPopup';
    const HEADER_ID = 'analyserExplainHeader';
    const BODY_ID   = 'analyserExplainBody';
    const CLOSE_ID  = 'analyserExplainClose';
    const REFRESH_MS = 750;

    let _refreshTimer = null;
    let _isDragging   = false;
    let _dragOffset   = { x: 0, y: 0 };
    let _isOpen       = false;

    function _esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _injectPopup() {
        if (document.getElementById(POPUP_ID)) return;
        const div = document.createElement('div');
        div.id = POPUP_ID;
        div.style.cssText = [
            'display:none',
            'position:fixed',
            'top:80px', 'right:24px',
            'width:680px', 'max-height:80vh',
            'background:#0f172a', 'color:#e2e8f0',
            'border:2px solid #14b8a6', 'border-radius:8px',
            'box-shadow:0 10px 40px rgba(0,0,0,0.6)',
            'z-index:99999',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'overflow:hidden'
        ].join(';');
        div.innerHTML = `
            <div id="${HEADER_ID}" style="
                padding:8px 12px;background:#14b8a6;color:#fff;
                font-weight:700;font-size:13px;cursor:move;
                display:flex;align-items:center;justify-content:space-between;
                user-select:none;">
                <span>📖 StrategyAnalyser — How the prediction was built</span>
                <button id="${CLOSE_ID}" title="Close" style="
                    background:transparent;border:none;color:#fff;
                    font-size:16px;cursor:pointer;padding:0 4px;">✕</button>
            </div>
            <div id="${BODY_ID}" style="
                padding:10px 14px;font-size:11px;line-height:1.5;
                max-height:calc(80vh - 32px);overflow-y:auto;">
                <div style="opacity:0.7;">Initialising…</div>
            </div>
        `;
        document.body.appendChild(div);
    }

    function _readExplanation() {
        const SA = window.StrategyAnalyser;
        if (!SA || typeof SA.getLastExplanation !== 'function') return null;
        // Live orchestrator path — read its session state.
        let state = null;
        try {
            state = window.autoUpdateOrchestrator && window.autoUpdateOrchestrator._analyserSessionState;
        } catch (_) { /* defensive */ }
        if (!state) return null;
        return SA.getLastExplanation(state);
    }

    function _renderBody() {
        const body = document.getElementById(BODY_ID);
        if (!body) return;
        const exp = _readExplanation();
        if (!exp) {
            body.innerHTML = `
                <div style="opacity:0.7;">
                    No analyser decision yet. Switch to <b>Test (Lab)</b> mode in the AI panel
                    and enter spins; the popup will populate within a second.
                </div>`;
            return;
        }
        body.innerHTML = _renderHeaderBar(exp)
                       + _renderPlainEnglish(exp)
                       + _renderPicked(exp)
                       + _renderFired(exp)
                       + _renderTopScored(exp)
                       + _renderCooldown(exp)
                       + _renderSessionState(exp);
    }

    // ── Sections ─────────────────────────────────────────────────

    function _actionChip(exp) {
        const a = exp.phase === 'FORCED_BET' ? 'FORCED BET'
                : exp.phase === 'WARMUP'     ? 'WARMUP'
                : (exp.confidence >= exp.confidenceFloor ? 'BET' : 'WAIT');
        const bg = a === 'BET' ? '#16a34a'
                : a === 'FORCED BET' ? '#dc2626'
                : a === 'WARMUP' ? '#475569'
                : '#f59e0b';
        return `<span style="background:${bg};color:#fff;padding:2px 8px;
                border-radius:4px;font-weight:700;font-size:11px;">${a}</span>`;
    }

    function _renderHeaderBar(exp) {
        const conf = exp.confidence != null ? exp.confidence : 0;
        const floor = exp.confidenceFloor != null ? exp.confidenceFloor : 60;
        const scale = exp.confidenceScale != null ? exp.confidenceScale : 4.0;
        const totalW = exp.totalFiredWeight != null ? exp.totalFiredWeight.toFixed(2) : '—';
        const fired = (exp.firedSignals || []).length;
        return `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
                ${_actionChip(exp)}
                <div style="background:#1e293b;padding:3px 8px;border-radius:4px;">
                    <span style="opacity:0.7;">Confidence</span>
                    <strong style="color:#f59e0b;margin-left:4px;">${conf}%</strong>
                    <span style="opacity:0.5;font-size:10px;margin-left:4px;">floor ${floor}% · scale ${scale}</span>
                </div>
                <div style="background:#1e293b;padding:3px 8px;border-radius:4px;">
                    <span style="opacity:0.7;">Spin</span>
                    <strong style="margin-left:4px;">#${exp.spinCount ?? 0}</strong>
                    <span style="opacity:0.5;font-size:10px;margin-left:4px;">last ${exp.lastSpin ?? '—'}</span>
                </div>
                <div style="background:#1e293b;padding:3px 8px;border-radius:4px;">
                    <span style="opacity:0.7;">Signals</span>
                    <strong style="margin-left:4px;color:#5eead4;">${fired} fired</strong>
                    <span style="opacity:0.5;font-size:10px;margin-left:4px;">Σ weight ${totalW}</span>
                </div>
            </div>`;
    }

    function _renderPlainEnglish(exp) {
        // The decision's reason text is already a one-liner. Show it
        // prominently as the "plain English" summary.
        const decision = exp.decision || {};
        const reason = decision.reason || '';
        if (!reason) return '';
        return `
            <div style="margin-bottom:10px;padding:6px 10px;background:#1e293b;
                        border-left:3px solid #5eead4;border-radius:0 4px 4px 0;
                        font-size:11px;line-height:1.5;">
                <strong style="color:#5eead4;">In plain English —</strong>
                <span style="color:#cbd5e1;margin-left:4px;">${_esc(reason)}</span>
            </div>`;
    }

    function _renderPicked(exp) {
        const numbers = (exp.unionedNumbers || []);
        const users = new Set(exp.userSelectionNumbers || []);
        if (!numbers.length) {
            return `<div style="margin-bottom:10px;opacity:0.6;">No picked numbers yet.</div>`;
        }
        const chips = numbers.map(n => {
            const isUser = users.has(n);
            const bg = isUser ? '#facc15' : '#0d9488';
            const fg = isUser ? '#422006' : '#fff';
            const star = isUser ? '⭐ ' : '';
            return `<span style="background:${bg};color:${fg};padding:2px 7px;
                    margin:1px;border-radius:4px;font-weight:700;font-size:11px;
                    display:inline-block;">${star}${n}</span>`;
        }).join('');
        return `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700;color:#5eead4;margin-bottom:4px;font-size:11px;">
                    Picked numbers (${numbers.length})
                    <span style="font-weight:400;color:#94a3b8;font-size:10px;margin-left:6px;">
                        ⭐ = user selection
                    </span>
                </div>
                ${chips}
            </div>`;
    }

    function _renderFired(exp) {
        const fired = exp.firedSignals || [];
        if (!fired.length) {
            return `<div style="margin-bottom:10px;opacity:0.6;">No signals fired this spin.</div>`;
        }
        // Sort by weight descending so the strongest signals are on top.
        const sorted = fired.slice().sort((a, b) => b.weight - a.weight);
        const rows = sorted.map(s => {
            const wPct = (s.weight * 100).toFixed(0);
            return `
                <tr style="border-bottom:1px solid #1e293b;vertical-align:top;">
                    <td style="padding:3px 6px;color:#e2e8f0;font-size:10px;
                               font-family:'SF Mono',ui-monospace,monospace;
                               max-width:240px;word-break:break-all;">${_esc(s.name)}</td>
                    <td style="padding:3px 6px;color:#f59e0b;text-align:right;
                               font-weight:700;white-space:nowrap;">${wPct}%</td>
                    <td style="padding:3px 6px;color:#94a3b8;text-align:right;">${s.candidatesCount}</td>
                    <td style="padding:3px 6px;color:#cbd5e1;font-size:10px;">${_esc(s.reason)}</td>
                </tr>`;
        }).join('');
        return `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700;color:#5eead4;margin-bottom:4px;font-size:11px;">
                    Fired signals (${fired.length})
                    <span style="font-weight:400;color:#94a3b8;font-size:10px;margin-left:6px;">
                        sorted by weight ↓
                    </span>
                </div>
                <table style="width:100%;font-size:10px;border-collapse:collapse;">
                    <thead><tr style="text-align:left;color:#94a3b8;border-bottom:1px solid #334155;">
                        <th style="padding:3px 6px;">Signal</th>
                        <th style="padding:3px 6px;text-align:right;">Weight</th>
                        <th style="padding:3px 6px;text-align:right;">Cands</th>
                        <th style="padding:3px 6px;">Reason</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    function _renderTopScored(exp) {
        const top = (exp.topScored || []).slice(0, 20);
        if (!top.length) return '';
        const picked = new Set(exp.picked || []);
        const chips = top.map((o, i) => {
            const inPicked = picked.has(o.num);
            const bg = inPicked ? '#0d9488' : '#1e293b';
            const fg = inPicked ? '#fff' : '#cbd5e1';
            return `<span title="rank ${i + 1} — score ${o.score.toFixed(3)}"
                    style="background:${bg};color:${fg};padding:2px 6px;margin:1px;
                    border-radius:4px;font-size:10px;border:1px solid #334155;
                    display:inline-block;">${o.num}<sub style="opacity:0.6;margin-left:3px;">${o.score.toFixed(2)}</sub></span>`;
        }).join('');
        return `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700;color:#5eead4;margin-bottom:4px;font-size:11px;">
                    Top-scored numbers (top ${top.length})
                </div>
                ${chips}
            </div>`;
    }

    function _renderCooldown(exp) {
        const supp = exp.suppressedByCooldown || [];
        const cd = exp.t3Cooldowns || {};
        const cdKeys = Object.keys(cd);
        if (!supp.length && !cdKeys.length) return '';
        const suppChips = supp.length
            ? supp.slice(0, 10).map(s =>
                `<span style="background:#7f1d1d;color:#fecaca;padding:1px 6px;
                margin:1px;border-radius:3px;font-size:10px;display:inline-block;"
                title="${_esc(s.name)}">${_esc(s.pair)} (${s.roundsLeft}r)</span>`).join('')
            : '<span style="opacity:0.5;font-size:10px;">none this spin</span>';
        const cdChips = cdKeys.length
            ? cdKeys.map(k =>
                `<span style="background:#1e293b;color:#fbbf24;border:1px solid #92400e;
                padding:1px 6px;margin:1px;border-radius:3px;font-size:10px;display:inline-block;">
                ${_esc(k)} (${cd[k]}r)</span>`).join('')
            : '<span style="opacity:0.5;font-size:10px;">none</span>';
        return `
            <div style="margin-bottom:10px;padding:6px 8px;background:#1e293b;border-radius:4px;">
                <div style="font-weight:700;color:#fbbf24;margin-bottom:3px;font-size:11px;">
                    T3 cooldown (rule #9)
                </div>
                <div style="font-size:10px;color:#94a3b8;margin-bottom:3px;">
                    Suppressed this spin (${supp.length}):
                </div>
                ${suppChips}
                <div style="font-size:10px;color:#94a3b8;margin:6px 0 3px;">
                    Active cooldowns (${cdKeys.length}):
                </div>
                ${cdChips}
            </div>`;
    }

    function _renderSessionState(exp) {
        const waitCap = exp.waitCap != null ? exp.waitCap : 3;
        const wc = exp.priorConsecutiveWaits != null ? exp.priorConsecutiveWaits : 0;
        return `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid #334155;
                        font-size:10px;color:#94a3b8;">
                Session state — consecutive WAITs:
                <strong style="color:${wc >= waitCap ? '#dc2626' : '#94a3b8'};">${wc}</strong>
                / cap ${waitCap}
                ${exp.forcedBet ? '<span style="color:#dc2626;margin-left:8px;">⚠ FORCED BET fired</span>' : ''}
            </div>`;
    }

    // ── Open / close ─────────────────────────────────────────────

    function open() {
        _injectPopup();
        const popup = document.getElementById(POPUP_ID);
        if (!popup) return;
        popup.style.display = 'block';
        _isOpen = true;
        _renderBody();
        if (!_refreshTimer) {
            _refreshTimer = setInterval(_renderBody, REFRESH_MS);
        }
    }

    function close() {
        const popup = document.getElementById(POPUP_ID);
        if (popup) popup.style.display = 'none';
        _isOpen = false;
        if (_refreshTimer) {
            clearInterval(_refreshTimer);
            _refreshTimer = null;
        }
    }

    function isOpen() { return _isOpen; }

    // ── Drag handlers ────────────────────────────────────────────

    function _onDragStart(ev) {
        if (ev.button !== 0) return;
        if (ev.target && ev.target.id === CLOSE_ID) return;
        const popup = document.getElementById(POPUP_ID);
        if (!popup) return;
        _isDragging = true;
        const rect = popup.getBoundingClientRect();
        _dragOffset.x = ev.clientX - rect.left;
        _dragOffset.y = ev.clientY - rect.top;
        popup.style.right = 'auto';
        ev.preventDefault();
    }

    function _onDragMove(ev) {
        if (!_isDragging) return;
        const popup = document.getElementById(POPUP_ID);
        if (!popup) return;
        const x = Math.max(0, Math.min(window.innerWidth  - 60, ev.clientX - _dragOffset.x));
        const y = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - _dragOffset.y));
        popup.style.left = x + 'px';
        popup.style.top  = y + 'px';
    }

    function _onDragEnd() { _isDragging = false; }

    // ── Bootstrap ────────────────────────────────────────────────

    function _start() {
        _injectPopup();
        const closeBtn = document.getElementById(CLOSE_ID);
        if (closeBtn) closeBtn.addEventListener('click', close);
        const header = document.getElementById(HEADER_ID);
        if (header) header.addEventListener('mousedown', _onDragStart);
        window.addEventListener('mousemove', _onDragMove);
        window.addEventListener('mouseup', _onDragEnd);
        console.log('📖 StrategyAnalyser explain popup: armed');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }

    if (typeof window !== 'undefined') {
        window.StrategyAnalyserExplainPopup = { open, close, isOpen };
    }
})();
