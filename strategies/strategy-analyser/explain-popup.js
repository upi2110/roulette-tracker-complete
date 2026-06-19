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

    const POPUP_ID   = 'analyserExplainPopup';
    const HEADER_ID  = 'analyserExplainHeader';
    const BODY_ID    = 'analyserExplainBody';
    const CLOSE_ID   = 'analyserExplainClose';
    const POPOUT_ID  = 'analyserExplainPopout';
    const REFRESH_MS = 750;

    let _refreshTimer = null;
    let _isDragging   = false;
    let _dragOffset   = { x: 0, y: 0 };
    let _isOpen       = false;
    let _popoutWin    = null;

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
        // Larger default + drag-to-resize corner. CSS `resize:both`
        // gives the user a draggable handle in the bottom-right corner
        // of the popup. min-width / min-height prevent collapsing it
        // below the legible threshold.
        div.style.cssText = [
            'display:none',
            'position:fixed',
            'top:60px', 'right:24px',
            'width:min(960px, 95vw)',
            'height:min(80vh, 720px)',
            'min-width:560px',
            'min-height:320px',
            'max-width:98vw',
            'max-height:96vh',
            'background:#0f172a', 'color:#e2e8f0',
            'border:2px solid #14b8a6', 'border-radius:8px',
            'box-shadow:0 10px 40px rgba(0,0,0,0.6)',
            'z-index:99999',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'overflow:hidden',
            'resize:both',
            // NOTE: do NOT set display:flex here — `display:none` above
            // would be clobbered, making the popup visible on first
            // load. open() sets display:flex when the user actually
            // opens it; close() sets display:none.
            'flex-direction:column'
        ].join(';');
        div.innerHTML = `
            <div id="${HEADER_ID}" style="
                padding:8px 12px;background:#14b8a6;color:#fff;
                font-weight:700;font-size:13px;cursor:move;
                flex:0 0 auto;
                display:flex;align-items:center;justify-content:space-between;
                user-select:none;">
                <span>📖 StrategyAnalyser — How the prediction was built</span>
                <span style="display:flex;align-items:center;gap:4px;">
                    <button id="${POPOUT_ID}" title="Open in a separate window" style="
                        background:transparent;border:1px solid rgba(255,255,255,0.5);
                        color:#fff;font-size:11px;cursor:pointer;padding:2px 8px;
                        border-radius:3px;font-weight:600;">🗗 Pop out</button>
                    <button id="${CLOSE_ID}" title="Close" style="
                        background:transparent;border:none;color:#fff;
                        font-size:16px;cursor:pointer;padding:0 4px;">✕</button>
                </span>
            </div>
            <div id="${BODY_ID}" style="
                padding:10px 14px;font-size:11px;line-height:1.5;
                flex:1 1 auto;
                overflow-y:auto;overflow-x:hidden;">
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

    function _renderBody(doc) {
        doc = doc || document;
        const body = doc.getElementById(BODY_ID);
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
                       + _renderUserScope(exp)
                       + _renderPicked(exp)
                       + _renderFired(exp)
                       + _renderTopScored(exp)
                       + _renderCooldown(exp)
                       + _renderSessionState(exp);
        _wireSignalsToggle(doc);
    }

    function _renderAll() {
        _renderBody(document);
        if (_popoutWin && !_popoutWin.closed) {
            try { _renderBody(_popoutWin.document); }
            catch (_) { /* popup closed mid-tick */ }
        }
    }

    // Persisted across re-renders so the user's "show dropped" choice
    // survives the 750ms refresh loop.
    let _showAllSignals = false;
    function _wireSignalsToggle(doc) {
        doc = doc || document;
        const SHOW_ALL_ID = 'analyserSignalsShowAll';
        const cb = doc.getElementById(SHOW_ALL_ID);
        const rows = doc.getElementById(SHOW_ALL_ID + '-rows');
        if (!cb || !rows) return;
        cb.checked = _showAllSignals;
        rows.style.display = _showAllSignals ? '' : 'none';
        cb.addEventListener('change', () => {
            _showAllSignals = cb.checked;
            rows.style.display = _showAllSignals ? '' : 'none';
        });
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
        const baseFloor = exp.confidenceFloor != null ? exp.confidenceFloor : 60;
        const effFloor  = exp.effectiveFloor  != null ? exp.effectiveFloor  : baseFloor;
        const lossPen   = exp.lossPenalty || 0;
        const scale = exp.confidenceScale != null ? exp.confidenceScale : 4.0;
        const usedW = exp.totalUsedWeight  != null ? exp.totalUsedWeight.toFixed(2)
                    : (exp.totalFiredWeight != null ? exp.totalFiredWeight.toFixed(2) : '—');
        const fired = (exp.firedSignals || []).length;
        const usedCount = (exp.firedSignals || []).filter(s => s.used).length;
        // Floor block — annotated when loss-streak elevated it.
        const floorBlock = (effFloor !== baseFloor)
            ? `<span style="color:#ef4444;">floor ${effFloor}%</span> <span style="opacity:0.5;font-size:9px;">(base ${baseFloor} + ${lossPen} loss)</span>`
            : `<span>floor ${baseFloor}%</span>`;
        return `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
                ${_actionChip(exp)}
                <div style="background:#1e293b;padding:3px 8px;border-radius:4px;">
                    <span style="opacity:0.7;">Confidence</span>
                    <strong style="color:#f59e0b;margin-left:4px;">${conf}%</strong>
                    <span style="opacity:0.7;font-size:10px;margin-left:4px;">${floorBlock} · scale ${scale}</span>
                </div>
                <div style="background:#1e293b;padding:3px 8px;border-radius:4px;">
                    <span style="opacity:0.7;">Spin</span>
                    <strong style="margin-left:4px;">#${exp.spinCount ?? 0}</strong>
                    <span style="opacity:0.5;font-size:10px;margin-left:4px;">last ${exp.lastSpin ?? '—'}</span>
                </div>
                <div style="background:#1e293b;padding:3px 8px;border-radius:4px;">
                    <span style="opacity:0.7;">Signals</span>
                    <strong style="margin-left:4px;color:#bbf7d0;">${usedCount}</strong><span style="opacity:0.5;">/${fired}</span>
                    <span style="opacity:0.5;font-size:10px;margin-left:4px;">Σ used ${usedW}</span>
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

    function _renderUserScope(exp) {
        const source   = exp.scopeSource || 'autonomous';
        const fams     = exp.scopeFamilies || [];
        const filtered = exp.filteredByUserSelection || [];

        if (source === 'autonomous' || !fams.length) {
            return `
                <div style="margin-bottom:10px;padding:6px 10px;
                            background:#1e293b;border-left:3px solid #475569;
                            border-radius:0 4px 4px 0;font-size:11px;color:#94a3b8;">
                    <strong style="color:#cbd5e1;">Scope:</strong>
                    No pair selections or visibility filter in Electron —
                    analyser is running in AUTONOMOUS mode (firing on
                    whichever pair families show the strongest signals).
                </div>`;
        }

        const isSelection = source === 'selection';
        const accent  = isSelection ? '#facc15' : '#22d3ee';
        const chipBg  = isSelection ? '#facc15' : '#22d3ee';
        const chipFg  = isSelection ? '#422006' : '#083344';
        const lead    = isSelection
            ? `Analyser restricted to ${fams.length} user-selected pair famil${fams.length === 1 ? 'y' : 'ies'}`
            : `Analyser restricted to ${fams.length} visible pair famil${fams.length === 1 ? 'y' : 'ies'} (pair-filter)`;

        const famChips = fams.map(f =>
            `<span style="background:${chipBg};color:${chipFg};padding:1px 6px;
            margin:1px;border-radius:3px;font-weight:700;font-size:10px;
            display:inline-block;">${_esc(f)}</span>`).join('');

        return `
            <div style="margin-bottom:10px;padding:6px 10px;
                        background:#1e293b;border-left:3px solid ${accent};
                        border-radius:0 4px 4px 0;font-size:11px;color:#cbd5e1;">
                <strong style="color:${accent};">Scope:</strong>
                ${lead}:
                <span style="margin-left:4px;">${famChips}</span>
                ${filtered.length > 0 ? `<div style="margin-top:4px;font-size:10px;color:#94a3b8;">
                    ${filtered.length} pair-bound signal${filtered.length === 1 ? '' : 's'} dropped — pairs not in scope.
                </div>` : ''}
                <div style="margin-top:3px;font-size:10px;color:#94a3b8;">
                    Non-pair signals (sign-streak / table-streak / set-carry) always fire regardless of scope.
                </div>
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

    // The complete locked rule set — drives the rule-by-rule table
    // regardless of which rules fired. Ordering = display order.
    const _RULES = [
        { id: 'signStreak',       label: '1·Sign streak' },
        { id: 'tableStreak',      label: '2·Table streak' },
        { id: 'setCarry',         label: '3·Set carry' },
        { id: 'subAnchorPattern', label: '4·Sub-anchor' },
        { id: 'crossCellRotate',  label: '6·Cross-cell' },
        { id: 'crossTableConv',   label: '7·T3 golden' }
    ];

    function _renderFired(exp) {
        const fired       = exp.firedSignals || [];
        const disabledArr = exp.disabledRules || [];
        const disabled    = new Set(disabledArr);
        const ruleStatus  = exp.ruleStatus || {};

        // Group entries by ruleId.
        const byRule = {};
        fired.forEach(e => {
            const rid = e.ruleId || 'unknown';
            (byRule[rid] = byRule[rid] || []).push(e);
        });

        // Anchor label per rule — short, human-readable identifier of
        // WHAT the rule locked onto this spin (e.g. "POS", "NINETEEN",
        // "SET_5", "prev (pair)", "prevPlus1+prevPrev"). Returns '—'
        // when the rule didn't fire.
        const _anchors = (r, entries) => {
            if (!entries.length) return '—';
            const det = (e) => e.details || {};
            switch (r.id) {
                case 'signStreak':
                    return det(entries[0]).sign || '—';
                case 'tableStreak':
                    return det(entries[0]).table || '—';
                case 'setCarry':
                    return det(entries[0]).anchor || '—';
                case 'subAnchorPattern':
                case 'crossCellRotate': {
                    // Group entries by base pair (entry.details.pairKey
                    // or famKey). Show comma-separated unique names.
                    const fams = new Set();
                    entries.forEach(e => {
                        const d = det(e);
                        const k = d.pairKey || d.famKey || '';
                        if (k) fams.add(k);
                    });
                    return Array.from(fams).join(', ') || '—';
                }
                case 'crossTableConv':
                    return (det(entries[0]).winners || []).join(' + ') || '—';
                default:
                    return '—';
            }
        };

        // Voted-numbers list — union of all entries' candidates for the
        // rule. Sorted ascending. Comma-separated with copy-friendly
        // formatting.
        const _numbers = (entries) => {
            if (!entries.length) return '—';
            const all = new Set();
            entries.forEach(e => {
                if (e._candidates && Array.isArray(e._candidates)) {
                    e._candidates.forEach(n => all.add(n));
                } else if (e.candidatesPreview && Array.isArray(e.candidatesPreview)) {
                    e.candidatesPreview.forEach(n => all.add(n));
                }
            });
            if (all.size === 0) {
                // Fall back to count only if the popup doesn't have the
                // raw lists (Set serialization can lose them mid-trip).
                const total = entries.reduce((s, e) => s + (e.candidatesCount || 0), 0);
                return total + ' nums';
            }
            return Array.from(all).sort((a, b) => a - b).join(', ');
        };

        const _rule = (r) => {
            const entries = byRule[r.id] || [];
            const fired   = entries.length > 0;
            const isDisabled = disabled.has(r.id);
            const sumEff = entries.reduce((s, e) => s + (e.effectiveWeight || 0), 0);
            const sumIntra = entries.reduce((s, e) => s + (e.weight || 0), 0);

            let status, statusColor, rowBg, rowColor, reasonText;
            if (isDisabled) {
                status = 'DISABLED'; statusColor = '#64748b';
                rowBg = 'rgba(100,116,139,0.08)'; rowColor = '#64748b';
                reasonText = 'User disabled in Weightage panel.';
            } else if (!fired) {
                status = 'SKIPPED'; statusColor = '#94a3b8';
                rowBg = 'rgba(148,163,184,0.05)'; rowColor = '#94a3b8';
                reasonText = (ruleStatus[r.id] && ruleStatus[r.id].reason)
                    || 'Did not fire this spin (conditions not met).';
            } else {
                status = 'FIRED'; statusColor = '#10b981';
                rowBg = '#064e3b'; rowColor = '#bbf7d0';
                // Show the strongest entry's reason as the headline,
                // plus count of how many vote slots it produced.
                const top = entries.slice().sort((a, b) => (b.effectiveWeight || 0) - (a.effectiveWeight || 0))[0];
                reasonText = (top && top.reason)
                    + (entries.length > 1
                        ? ` <span style="opacity:0.6;">(+ ${entries.length - 1} more slot${entries.length === 2 ? '' : 's'})</span>`
                        : '');
            }

            const effPct   = fired ? (sumEff * 100).toFixed(1) + '%' : '—';
            const slots    = fired ? entries.length : '—';
            const anchors  = fired ? _anchors(r, entries) : '—';
            const numbers  = fired ? _numbers(entries)    : '—';

            return `
                <tr style="border-bottom:1px solid #1e293b;vertical-align:top;background:${rowBg};">
                    <td style="padding:4px 6px;color:${statusColor};font-weight:700;font-size:10px;
                               white-space:nowrap;">
                        <span style="background:${statusColor};color:#0f172a;padding:0 5px;
                                     border-radius:2px;font-size:9px;margin-right:5px;">${status}</span>
                        <span style="color:${rowColor};">${r.label}</span>
                    </td>
                    <td style="padding:4px 6px;color:#f59e0b;text-align:right;font-weight:700;
                               white-space:nowrap;">${effPct}</td>
                    <td style="padding:4px 6px;color:#94a3b8;text-align:right;
                               white-space:nowrap;">${slots}</td>
                    <td style="padding:4px 6px;color:#22d3ee;font-size:10px;
                               font-family:'SF Mono',ui-monospace,monospace;
                               white-space:nowrap;max-width:180px;overflow:hidden;
                               text-overflow:ellipsis;"
                        title="${_esc(anchors)}">${_esc(anchors)}</td>
                    <td style="padding:4px 6px;color:#cbd5e1;font-size:10px;
                               font-family:'SF Mono',ui-monospace,monospace;
                               max-width:260px;word-break:break-word;"
                        title="${_esc(numbers)}">${_esc(numbers)}</td>
                    <td style="padding:4px 6px;color:${rowColor};font-size:10px;">
                        ${reasonText}
                    </td>
                </tr>`;
        };

        const rows = _RULES.map(_rule).join('');
        const firedCount = _RULES.filter(r => (byRule[r.id] || []).length > 0).length;

        return `
            <div style="margin-bottom:10px;">
                <div style="font-weight:700;color:#5eead4;margin-bottom:4px;font-size:11px;
                            display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span>Rules — fired / skipped / disabled (${firedCount} of ${_RULES.length} fired)</span>
                    <span style="font-weight:400;color:#94a3b8;font-size:10px;">
                        Eff% = share of decision after redistribution.
                    </span>
                </div>
                <table style="width:100%;font-size:10px;border-collapse:collapse;">
                    <thead><tr style="text-align:left;color:#94a3b8;border-bottom:1px solid #334155;">
                        <th style="padding:3px 6px;">Rule</th>
                        <th style="padding:3px 6px;text-align:right;">Eff%</th>
                        <th style="padding:3px 6px;text-align:right;">Slots</th>
                        <th style="padding:3px 6px;">Anchors</th>
                        <th style="padding:3px 6px;">Numbers voted</th>
                        <th style="padding:3px 6px;">Reason / why-not</th>
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
        const losses = exp.consecutiveLosses || 0;
        return `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid #334155;
                        font-size:10px;color:#94a3b8;">
                Session state —
                consecutive WAITs:
                <strong style="color:${wc >= waitCap ? '#dc2626' : '#94a3b8'};">${wc}</strong>
                / cap ${waitCap}
                &nbsp;·&nbsp;
                consecutive losses:
                <strong style="color:${losses >= 2 ? '#ef4444' : '#94a3b8'};">${losses}</strong>
                ${losses >= 2 ? `<span style="color:#f59e0b;margin-left:6px;">⚠ floor elevated</span>` : ''}
                ${exp.forcedBet ? '<span style="color:#dc2626;margin-left:8px;">⚠ FORCED BET fired</span>' : ''}
            </div>`;
    }

    // ── Open / close ─────────────────────────────────────────────

    function open() {
        // Mirror Selection Process: open() goes STRAIGHT to a separate
        // OS-level window — no in-window overlay step. The user asked
        // for the explain panel to live outside Electron, the same way
        // Selection Process does.
        return popOut();
    }

    // Legacy in-window overlay (kept inert, no longer triggered).
    // Retained only because the DOM node is referenced by drag
    // handlers / close button wiring; safe to remove in a later pass.
    function _openInWindowOverlay() {
        _injectPopup();
        const popup = document.getElementById(POPUP_ID);
        if (!popup) return;
        popup.style.display = 'flex';
        _isOpen = true;
        _renderAll();
        if (!_refreshTimer) {
            _refreshTimer = setInterval(_renderAll, REFRESH_MS);
        }
    }

    function close() {
        // Standalone-window mode: close means close the popout window.
        if (_popoutWin && !_popoutWin.closed) {
            try { _popoutWin.close(); } catch (_) {}
        }
        _popoutWin = null;
        _isOpen = false;
        if (_refreshTimer) {
            clearInterval(_refreshTimer);
            _refreshTimer = null;
        }
    }

    function popOut() {
        if (_popoutWin && !_popoutWin.closed) {
            _popoutWin.focus();
            return;
        }
        const w = (typeof screen !== 'undefined' && screen.availWidth)  ? screen.availWidth  : 1200;
        const h = (typeof screen !== 'undefined' && screen.availHeight) ? screen.availHeight : 800;
        const win = window.open('', 'analyserExplainPopout',
            `width=${Math.min(w, 1100)},height=${Math.min(h, 820)},left=80,top=60,resizable=yes,scrollbars=yes`);
        if (!win) {
            alert('Popup blocked — please allow popups for this app.');
            return;
        }
        _popoutWin = win;
        try { win.moveTo(80, 60); win.resizeTo(Math.min(w, 1100), Math.min(h, 820)); } catch (_) {}
        win.document.open();
        win.document.write(`<!doctype html>
<html><head><meta charset="utf-8">
<title>StrategyAnalyser — How the prediction was built</title>
<style>
    html, body { margin:0; padding:0; height:100%;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        background:#0f172a; color:#e2e8f0;
        -webkit-user-select: text; user-select: text; }
    #${HEADER_ID} {
        padding:10px 14px; background:#14b8a6; color:#fff;
        font-weight:700; font-size:13px;
        display:flex; align-items:center; justify-content:space-between;
        gap:8px;
        user-select:none;
    }
    #${BODY_ID} { padding:12px 16px; font-size:11px; line-height:1.5;
        height:calc(100vh - 40px); overflow-y:auto; overflow-x:hidden;
        -webkit-user-select: text; user-select: text; cursor: text; }
    #${BODY_ID} * { -webkit-user-select: text; user-select: text; }
    #copyJsonBtn { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.4);
        color: #fff; font-size: 11px; padding: 3px 9px; border-radius: 3px;
        cursor: pointer; font-weight: 600; }
    #copyJsonBtn:hover { background: rgba(255,255,255,0.25); }
    #copyJsonBtn.ok { background: #16a34a; border-color: #14532d; }
</style>
</head><body>
<div id="${HEADER_ID}">
    <span>📖 StrategyAnalyser — How the prediction was built</span>
    <span style="display:flex;align-items:center;gap:8px;">
        <button id="copyJsonBtn" title="Copy the full explanation JSON to clipboard">📋 Copy JSON</button>
        <span style="font-size:10px;opacity:0.8;">live · refreshes every ${REFRESH_MS}ms</span>
    </span>
</div>
<script>
    document.getElementById('copyJsonBtn').addEventListener('click', function () {
        try {
            var opener = window.opener;
            var SA = opener && opener.StrategyAnalyser;
            var orc = opener && opener.autoUpdateOrchestrator;
            var st = orc && orc._analyserSessionState;
            var exp = SA && SA.getLastExplanation && SA.getLastExplanation(st);
            var snap = orc && orc._lastSnapshotOpts;
            var payload = { explanation: exp, snapshotOpts: snap };
            var text = JSON.stringify(payload, function (k, v) {
                if (v instanceof Set) return Array.from(v);
                if (v instanceof Map) return Array.from(v.entries());
                return v;
            }, 2);
            navigator.clipboard.writeText(text);
            var btn = document.getElementById('copyJsonBtn');
            btn.textContent = '✓ Copied';
            btn.classList.add('ok');
            setTimeout(function () {
                btn.textContent = '📋 Copy JSON';
                btn.classList.remove('ok');
            }, 1500);
        } catch (e) { alert('Copy failed: ' + e.message); }
    });
</script>
<div id="${BODY_ID}"><div style="opacity:0.7;">Initialising…</div></div>
</body></html>`);
        win.document.close();
        // Force a paint right away — don't wait for the next 750ms tick.
        _renderAll();
        if (!_refreshTimer) {
            _refreshTimer = setInterval(_renderAll, REFRESH_MS);
        }
        // When the popout is closed by the user, stop polling it.
        try {
            win.addEventListener('beforeunload', () => {
                _popoutWin = null;
                if (_refreshTimer && !_isOpen) {
                    clearInterval(_refreshTimer);
                    _refreshTimer = null;
                }
            });
        } catch (_) { /* defensive */ }
    }

    function isOpen() { return _isOpen || !!(_popoutWin && !_popoutWin.closed); }

    // ── Drag handlers ────────────────────────────────────────────

    function _onDragStart(ev) {
        if (ev.button !== 0) return;
        if (ev.target && (ev.target.id === CLOSE_ID || ev.target.id === POPOUT_ID)) return;
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
        // No DOM injection — explain() routes straight to a separate
        // OS window (popOut). This mirrors Selection Process exactly.
        console.log('📖 StrategyAnalyser explain popup: armed (standalone window mode)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _start);
    } else {
        _start();
    }

    if (typeof window !== 'undefined') {
        window.StrategyAnalyserExplainPopup = { open, close, popOut, isOpen };
    }
})();
