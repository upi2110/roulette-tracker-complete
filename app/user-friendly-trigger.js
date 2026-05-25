/**
 * app/user-friendly-trigger.js
 *
 * USER-FRIENDLY STRATEGY — SELF-CONTAINED MODULE.
 *
 * Everything for this strategy lives in this one file:
 *   - UI (button + selector panel + status, injected at runtime)
 *   - Trigger detection (T1/T2/T3 "2-in-a-row")
 *   - Manual-pick mode
 *   - Bet-pool computation per table
 *   - Internal money state (bet sizing, progression, P&L)
 *   - pendingBet stamping
 *   - Wheel highlight push
 *
 * STRICT CONTAINMENT RULES (per user spec, 2026-05-21):
 *   - NO modifications to existing files (money panel, wheel, AI panel,
 *     HTML beyond the one <script> tag that loads this file).
 *   - Only calls existing public APIs (window.moneyPanel.*,
 *     window.rouletteWheel.*, window.aiPanel.*, etc.).
 *   - Uses runtime DOM injection for any new UI element.
 *   - Tracks ITS OWN money state. Does NOT depend on a Strategy 7
 *     entry in the money panel — writes pendingBet.betAmount directly
 *     so the money panel records bets correctly regardless of which
 *     strategy (1-6) is selected as the active one.
 *
 * Wrapped in an IIFE so no globals leak besides
 * `window.userFriendlyTrigger`.
 */
(function (globalRef) {
    'use strict';

    // ════════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ════════════════════════════════════════════════════════════════

    const POLL_INTERVAL_MS         = 350;
    const SUB_ANCHORS              = ['first', 'second', 'third'];
    const STOP_LOSS_PAUSE_SPINS    = 1;    // skip 1 spin after stop-loss
    const STOP_LOSS_THRESHOLD      = 3;    // 3 losses in a row → pause

    // Internal money defaults (NOT linked to any money panel strategy)
    const DEFAULT_MIN_BET                = 2;
    const DEFAULT_STARTING_BET           = 2;
    const DEFAULT_SESSION_TARGET         = 100;
    const DEFAULT_SMART_CAP_TRIGGER_LOSS = 500;
    const DEFAULT_T1_BETS_TO_INCREASE    = 3;
    const DEFAULT_T2_LOSSES_TO_INCREASE  = 4;
    const T3_MARTINGALE_LADDER           = [2, 4, 8, 10];

    // Extract the numeric offset from a TABLE 3 position code
    // (e.g. "SR+2" → 2, "OL+3" → 3, "S+0" → 0, "OR+1" → 1).
    // Returns Infinity for "XX" / null so missing codes sort last.
    function _posCodeOffset(code) {
        if (!code || code === 'XX') return Infinity;
        const m = String(code).match(/([+-])(\d+)$/);
        if (!m) return Infinity;
        return parseInt(m[2], 10);
    }
    function _posCodeDistance(a, b) {
        const oa = _posCodeOffset(a);
        const ob = _posCodeOffset(b);
        if (!isFinite(oa) || !isFinite(ob)) return Infinity;
        return Math.abs(oa - ob);
    }

    // Mirror of DIGIT_13_OPPOSITES from renderer-3tables.js. The
    // renderer declares it with `const` at script top-level, which
    // does NOT bind to window, so we keep our own copy for the T3
    // 13opp position-code check.
    const UF_DIGIT_13_OPPOSITES = {
        0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
        10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
        19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
        28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
    };

    // Translate T3 pair keys from window.table3DisplayProjections
    // (underscore form) to the AI panel / DOM convention (camelCase).
    // Mirrors _PAIR_REFKEY_TO_DATA_PAIR in renderer-3tables.js.
    const _T3_REFKEY_TO_DATA_PAIR = {
        'prev':              'prev',
        'prev_plus_1':       'prevPlus1',
        'prev_minus_1':      'prevMinus1',
        'prev_plus_2':       'prevPlus2',
        'prev_minus_2':      'prevMinus2',
        'prev_prev':         'prevPrev',
        'prev_prev_plus_1':  'prevPrevPlus1',
        'prev_prev_minus_1': 'prevPrevMinus1',
        'prev_prev_plus_2':  'prevPrevPlus2',
        'prev_prev_minus_2': 'prevPrevMinus2'
    };

    // 36-pocket wheel (0 and 26 share index 0). Mirrors WHEEL_36 in
    // renderer-3tables.js. Used for neighbour expansion in bet-pool
    // computation. Duplicating here so this module is self-contained.
    const UF_WHEEL_36 = [
        0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
        8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
        28, 12, 35, 3
    ];
    function _getWheel36Idx(n) {
        if (n === 26) return 0;
        return UF_WHEEL_36.indexOf(n);
    }
    function _numbersAtWheelIdx(idx) {
        const i = ((idx % 36) + 36) % 36;
        return i === 0 ? [0, 26] : [UF_WHEEL_36[i]];
    }
    function _addNeighbours(set, n, k) {
        const idx = _getWheel36Idx(n);
        if (idx === -1) return;
        for (let off = -k; off <= k; off++) {
            _numbersAtWheelIdx(idx + off).forEach(x => set.add(x));
        }
    }

    function _regularOpposite(n) {
        // Read from the renderer's global. If not loaded yet, return null.
        if (typeof REGULAR_OPPOSITES === 'object' && REGULAR_OPPOSITES) {
            return REGULAR_OPPOSITES[n];
        }
        if (globalRef && globalRef.REGULAR_OPPOSITES) {
            return globalRef.REGULAR_OPPOSITES[n];
        }
        return null;
    }

    // ════════════════════════════════════════════════════════════════
    //  CLASS
    // ════════════════════════════════════════════════════════════════

    class UserFriendlyTrigger {
        constructor() {
            // ── public state ──────────────────────────────────────
            this.enabled    = false;
            this.mode       = 'T1';    // 'T1' | 'T2' | 'T3'
            this.manualMode = false;

            // ── active-pair state ─────────────────────────────────
            this.activeTable      = null;
            this.activePairKey    = null;
            this.activeSubAnchors = [];
            this.activeSide       = null;
            this.currentBetPool   = [];

            // ── trigger / spin tracking ───────────────────────────
            this.spinLogs = [];                  // last ~50 per-spin logs
            this.lastObservedSpinCount = 0;
            this.recentBetOutcomes = [];         // newest-first ['win'|'loss']
            this.pausedUntilSpinCount = 0;

            // T3 hit-detection needs the projection that was active
            // BEFORE the just-landed spin. window.table3DisplayProjections
            // is overwritten by the renderer to the NEXT-spin projection
            // before our tick fires, so we cache last tick's snapshot
            // and use it for the just-landed spin's hit check.
            this._prevT3Projections = null;

            // ── internal money state (NOT tied to moneyPanel) ─────
            this.ufBetPerNumber       = DEFAULT_STARTING_BET;
            this.ufBetsPlacedT1       = 0;
            this.ufLossesT2           = 0;
            this.ufMartingaleLevel    = 0;
            this.ufSessionProfit      = 0;        // cumulative net P&L
            this.ufTotalBets          = 0;
            this.ufWins               = 0;
            this.ufLosses             = 0;
            this.ufStartedAt          = null;

            // ── runtime ───────────────────────────────────────────
            this._intervalId = null;
            this._lastWrittenStampSpinCount = -1;
            this._origSetPrediction = null;
            this._origUpdateFromPrediction = null;

            // Inject UI when DOM is ready.
            if (typeof document !== 'undefined') {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => this._injectUI());
                } else {
                    // Defer slightly so ai-auto-mode-ui.js has finished
                    // building its DOM (it runs on a 500ms timeout).
                    setTimeout(() => this._injectUI(), 700);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  PUBLIC API
        // ─────────────────────────────────────────────────────────────

        enable(mode) {
            if (!['T1', 'T2', 'T3'].includes(mode)) {
                console.warn(`UF: invalid mode "${mode}"`);
                return;
            }
            this.mode = mode;
            this._resetActiveState();
            this.recentBetOutcomes = [];
            this.pausedUntilSpinCount = 0;
            this.spinLogs = [];

            // Reset internal money state on (re)enable so each enabling
            // starts a fresh User Friendly session.
            this.ufBetPerNumber    = DEFAULT_STARTING_BET;
            this.ufBetsPlacedT1    = 0;
            this.ufLossesT2        = 0;
            this.ufMartingaleLevel = 0;
            this.ufSessionProfit   = 0;
            this.ufTotalBets       = 0;
            this.ufWins            = 0;
            this.ufLosses          = 0;
            this.ufStartedAt       = Date.now();

            this.lastObservedSpinCount = (window.spins || []).length;
            this.enabled = true;

            this._installSetPredictionInterceptor();
            this._installWheelInterceptor();

            if (this._intervalId === null) {
                this._intervalId = setInterval(() => this._tick(), POLL_INTERVAL_MS);
            }

            console.log(`🤝 UF: ENABLED in mode ${mode}`);
            this._renderStatus();
        }

        disable() {
            this.enabled = false;
            this._resetActiveState();
            if (window.moneyPanel) window.moneyPanel.pendingBet = null;
            this._uninstallSetPredictionInterceptor();
            this._uninstallWheelInterceptor();
            if (this._intervalId !== null) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
            // Tear down the visible UI too — collapse the panel and
            // unhighlight the USER-FRIENDLY sub-button. Without this,
            // any external caller (e.g. ai-auto-mode-ui.js setMode hook
            // that disables UF on mode switch) leaves the panel on
            // screen showing a stale "ACTIVE" state, so the user
            // thinks UF is still running even though it isn't.
            try { this._showPanel(false); }      catch (_) {}
            try { this._highlightButton(false); } catch (_) {}
            console.log('🤝 UF: DISABLED');
            this._renderStatus();
        }

        setMode(mode) {
            if (this.enabled) {
                this.disable();
                this.enable(mode);
            } else {
                this.mode = mode;
            }
            this._renderStatus();
        }

        setManual(on) {
            this.manualMode = !!on;
            // Reset active pair so the next pickup is from the new source.
            if (this.activePairKey) this._resetActiveState();
            console.log(`🤝 UF: Manual mode ${this.manualMode ? 'ON' : 'OFF'}`);
            this._renderStatus();
        }

        // ─────────────────────────────────────────────────────────────
        //  UI INJECTION
        //  All User Friendly UI is built at runtime — no edits to
        //  ai-auto-mode-ui.js or any other file. The injection waits
        //  for the AI mode UI's sub-button row to exist.
        // ─────────────────────────────────────────────────────────────

        _injectUI() {
            const tryInject = (attempts) => {
                const subRow = document.getElementById('modeSubRow');
                if (!subRow) {
                    if (attempts > 50) {
                        console.warn('🤝 UF: gave up waiting for modeSubRow');
                        return;
                    }
                    setTimeout(() => tryInject(attempts + 1), 200);
                    return;
                }
                if (document.getElementById('ufModeBtn')) return;  // already injected

                // ── 1. The USER-FRIENDLY sub-button (Auto-tab group) ──
                const btn = document.createElement('button');
                btn.id = 'ufModeBtn';
                btn.dataset.tabGroup = 'auto';
                btn.title = 'User Friendly — wait for 2-in-a-row trigger on the selected table (T1/T2/T3) then bet per the table-specific simple rule';
                btn.textContent = '🤝 USER-FRIENDLY';
                btn.style.cssText = 'display:none;flex:1;padding:5px 10px;'
                    + 'font-size:11px;font-weight:700;border:2px solid #f59e0b;'
                    + 'border-radius:5px;cursor:pointer;background:transparent;color:#fbbf24;';
                btn.addEventListener('click', () => this._onModeButtonClick());
                subRow.appendChild(btn);

                // ── 2. The User-Friendly control panel (hidden by default) ──
                const panel = document.createElement('div');
                panel.id = 'ufPanel';
                panel.style.cssText = 'display:none;margin-bottom:6px;padding:8px 10px;'
                    + 'background:rgba(245,158,11,0.10);border:1px solid #f59e0b;border-radius:6px;';
                panel.innerHTML = ''
                    + '<div style="font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:6px;">🤝 User Friendly — pick a table</div>'
                    + '<div style="display:flex;gap:6px;margin-bottom:6px;">'
                        + this._radioHtml('T1', true)
                        + this._radioHtml('T2', false)
                        + this._radioHtml('T3', false)
                    + '</div>'
                    + '<div style="margin-bottom:6px;padding:4px 6px;border:1px dashed #f59e0b;border-radius:4px;background:rgba(245,158,11,0.05);">'
                        + '<label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#fbbf24;cursor:pointer;user-select:none;">'
                            + '<input type="checkbox" id="ufManualToggle" style="margin:0;cursor:pointer;">'
                            + 'Manual mode (pick pair yourself in T1/T2/T3)'
                        + '</label>'
                    + '</div>'
                    + '<div id="ufStatus" style="font-size:10px;color:#cbd5e1;line-height:1.4;">'
                        + 'Disabled — click 🤝 USER-FRIENDLY to start'
                    + '</div>'
                    + '<div id="ufRules" style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic;"></div>'
                    + '<div id="ufPnl" style="font-size:10px;color:#fbbf24;margin-top:6px;padding-top:4px;border-top:1px dashed rgba(245,158,11,0.3);">'
                        + 'P&amp;L: $0 · bets 0 · 0W/0L'
                    + '</div>';

                // Insert panel right after modeSubRow.
                if (subRow.nextSibling) {
                    subRow.parentNode.insertBefore(panel, subRow.nextSibling);
                } else {
                    subRow.parentNode.appendChild(panel);
                }

                // Wire radio + checkbox.
                document.querySelectorAll('input[name="ufRadioMode"]').forEach(r => {
                    r.addEventListener('change', (ev) => {
                        const m = ev.target.value;
                        this.setMode(m);
                        this._updateRulesText(m);
                    });
                });
                const manualCb = document.getElementById('ufManualToggle');
                if (manualCb) {
                    manualCb.addEventListener('change', (ev) => {
                        this.setManual(!!ev.target.checked);
                    });
                }

                // Also wire to "Auto" tab clicks so the USER-FRIENDLY
                // button becomes visible alongside the other auto sub-
                // buttons. The existing ai-auto-mode-ui.js handles tab
                // switching by show/hiding elements with
                // [data-tab-group="auto"], so we use the same attribute
                // and visibility flips automatically.
                this._updateRulesText('T1');
                console.log('🤝 UF: UI injected');
            };
            tryInject(0);
        }

        _radioHtml(value, checked) {
            return '<label style="flex:1;cursor:pointer;display:flex;align-items:center;'
                + 'justify-content:center;gap:4px;padding:4px;border:1px solid #475569;'
                + 'border-radius:4px;font-size:11px;color:#e2e8f0;">'
                + `<input type="radio" name="ufRadioMode" value="${value}"${checked ? ' checked' : ''} style="margin:0;cursor:pointer;"> ${value}`
                + '</label>';
        }

        _updateRulesText(mode) {
            const el = document.getElementById('ufRules');
            if (!el) return;
            if (mode === 'T1') {
                el.textContent = 'T1: 2-in-a-row pair → 12 nums incl. opp · sizing follows the active money-management strategy';
            } else if (mode === 'T2') {
                el.textContent = 'T2: 2-in-a-row pair SAME SIDE → 10 nums same-side only · sizing follows the active money-management strategy';
            } else if (mode === 'T3') {
                el.textContent = 'T3: half-pair 2-in-a-row → 18 nums incl. opp · sizing follows the active money-management strategy';
            }
        }

        _onModeButtonClick() {
            // Toggle: if already enabled, disable. Else enable using
            // the currently-selected radio.
            if (this.enabled) {
                this.disable();
                this._showPanel(false);
                this._highlightButton(false);
                return;
            }
            const checked = document.querySelector('input[name="ufRadioMode"]:checked');
            const mode = checked ? checked.value : 'T1';
            this.enable(mode);
            this._showPanel(true);
            this._highlightButton(true);
        }

        _showPanel(show) {
            const panel = document.getElementById('ufPanel');
            if (panel) panel.style.display = show ? 'block' : 'none';
        }

        _highlightButton(on) {
            const btn = document.getElementById('ufModeBtn');
            if (!btn) return;
            if (on) {
                btn.style.background = '#f59e0b';
                btn.style.color = '#000';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#fbbf24';
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  STATUS / P&L RENDER
        // ─────────────────────────────────────────────────────────────

        _renderStatus() {
            const el = document.getElementById('ufStatus');
            const pnl = document.getElementById('ufPnl');
            if (!el) return;

            if (!this.enabled) {
                el.innerHTML = '<span style="color:#94a3b8;">Disabled — click 🤝 USER-FRIENDLY to start</span>';
            } else {
                const spinCount = (window.spins || []).length;
                if (spinCount < this.pausedUntilSpinCount) {
                    const left = this.pausedUntilSpinCount - spinCount;
                    el.innerHTML = `<span style="color:#fbbf24;">⏸ PAUSED</span> — ${left} spin(s) remaining (stop-loss)`;
                } else if (!this.activePairKey) {
                    const src = this.manualMode ? 'manual' : 'auto-trigger';
                    el.innerHTML = `<span style="color:#94a3b8;">🔴 WAITING</span> for ${src} (<b>${this.mode}</b>)`;
                } else {
                    const subText  = this.activeSubAnchors.length
                        ? ` subs=[${this.activeSubAnchors.join(',')}]` : '';
                    const sideText = this.activeSide ? ` side=${this.activeSide}` : '';
                    const poolText = ` · pool=${this.currentBetPool.length} nums`;
                    el.innerHTML = `<span style="color:#22c55e;">🟢 ACTIVE</span> · pair=<b>${this.activePairKey}</b>${subText}${sideText}${poolText}`;
                }
            }

            if (pnl) {
                const sign  = this.ufSessionProfit >= 0 ? '+' : '−';
                const abs   = Math.abs(this.ufSessionProfit);
                const color = this.ufSessionProfit >= 0 ? '#22c55e' : '#ef4444';
                // bet/num now comes from the money panel (the active
                // S1–S6 strategy is the single source of truth).
                const mpBet = (window.moneyPanel && window.moneyPanel.sessionData
                               && window.moneyPanel.sessionData.currentBetPerNumber)
                            || this.ufBetPerNumber;
                pnl.innerHTML = `P&L: <span style="color:${color};font-weight:700;">${sign}$${abs}</span>`
                    + ` · bets ${this.ufTotalBets} · ${this.ufWins}W/${this.ufLosses}L`
                    + ` · bet/num $${mpBet}`;
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  POLL TICK
        // ─────────────────────────────────────────────────────────────

        _tick() {
            if (!this.enabled) return;
            const spins = window.spins || [];
            if (spins.length === this.lastObservedSpinCount) {
                this._renderStatus();
                return;
            }

            // Race guard: wait for money panel to resolve the prior
            // pending bet before we overwrite it.
            const mp = window.moneyPanel;
            if (mp && typeof mp.lastSpinCount === 'number'
                && mp.sessionData && mp.sessionData.isSessionActive
                && mp.lastSpinCount < spins.length) {
                return;
            }

            for (let i = this.lastObservedSpinCount; i < spins.length; i++) {
                try { this._processNewSpin(i); }
                catch (e) { console.warn('UF._processNewSpin error:', e); }
            }
            this.lastObservedSpinCount = spins.length;
            this._renderStatus();
        }

        _processNewSpin(spinIdx) {
            const spins = window.spins || [];
            if (spinIdx < 0 || spinIdx >= spins.length) return;
            const actual   = spins[spinIdx].actual;
            const prev     = spinIdx >= 1 ? spins[spinIdx - 1].actual : null;
            const prevPrev = spinIdx >= 2 ? spins[spinIdx - 2].actual : null;
            if (prev == null) return;

            // 1. Build per-spin hit log.
            const log = this._computeSpinLog(spinIdx, actual, prev, prevPrev);
            this.spinLogs.push(log);
            if (this.spinLogs.length > 50) this.spinLogs.shift();

            // 2. If we had an active pair, resolve our bet outcome.
            if (this.activePairKey) {
                const betHit  = this.currentBetPool.includes(actual);
                const pairHit = this._didActivePairHit(log);
                this._handleOutcome(betHit, actual, pairHit);
            }

            // 3. Pause check.
            const spinCount = spins.length;
            if (spinCount < this.pausedUntilSpinCount) return;

            // 4. If no active pair, find/pick one.
            if (!this.activePairKey) {
                if (this.manualMode) {
                    this._useManualSelection();
                } else {
                    this._tryFindTrigger();
                }
            }

            // 5. If now active, stamp pending bet for next spin.
            if (this.activePairKey) {
                this._postPendingBet(spinCount);
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  SPIN LOG (per-pair hit table for the just-landed spin)
        // ─────────────────────────────────────────────────────────────

        _computeSpinLog(spinIdx, actual, prev, prevPrev) {
            const log = {
                spinIdx, actual, prev, prevPrev,
                t1: {}, t2: {}, t3: {},
            };

            // Compute via the existing window functions while temporarily
            // truncating window.spins to spinIdx (so projections are
            // those that were active BEFORE spin N landed).
            // CRITICAL: mutate in-place via splice — both window.spins
            // and the renderer's closure-captured `spins` reference the
            // SAME array.
            const real = window.spins;
            if (!Array.isArray(real)) return log;
            const removed = real.splice(spinIdx);
            try {
                const t1 = (typeof window.getTable1NextProjections === 'function')
                    ? window.getTable1NextProjections() : {};
                const t2 = (typeof window.getTable2NextProjections === 'function')
                    ? window.getTable2NextProjections() : {};
                this._fillTableLog(log.t1, t1, actual);
                this._fillTableLog(log.t2, t2, actual);
            } catch (e) {
                console.warn('UF: T1/T2 projection error:', e);
            } finally {
                for (let i = 0; i < removed.length; i++) real.push(removed[i]);
            }

            // T3 hit detection — mirror the rule that paints the
            // golden POS cells in TABLE 3:
            //   pair half hits  iff  calculatePositionCode(refs[refKey], actual) !== 'XX'
            //   opp  half hits  iff  calculatePositionCode(refs[refKey]'s 13-opposite, actual) !== 'XX'
            // refs are computed from the spins BEFORE the just-landed
            // one (the renderer uses the same lastSpin/lastLastSpin
            // pair-formation rule). Trigger fires when the SAME
            // (pair, half) hits two consecutive spins.
            if (typeof window.calculateReferences === 'function'
             && typeof window.calculatePositionCode === 'function'
             && prev != null) {
                // For the just-landed spin at spinIdx, the pair refs
                // are formed from the prior 2 spins (matches what's
                // displayed in TABLE 3 for that row).
                const ll = prevPrev != null ? prevPrev : prev;
                const refs = window.calculateReferences(prev, ll);
                for (const refKey of Object.keys(refs)) {
                    const refNum = refs[refKey];
                    if (refNum == null || isNaN(refNum)) continue;
                    const opp13 = UF_DIGIT_13_OPPOSITES[refNum];
                    let pairCode = 'XX', oppCode = 'XX';
                    try { pairCode = window.calculatePositionCode(refNum, actual); } catch (_) {}
                    try { if (opp13 != null) oppCode = window.calculatePositionCode(opp13, actual); } catch (_) {}
                    const hPair = pairCode && pairCode !== 'XX';
                    const hOpp  = oppCode  && oppCode  !== 'XX';
                    log.t3[refKey] = {
                        pair:   hPair,
                        opp:    hOpp,
                        anyHit: hPair || hOpp,
                        pairCode, oppCode,
                        // Legacy fields kept so any other code reading
                        // the merged form still resolves.
                        purple: hPair || hOpp,
                        green:  false,
                        pairPurple: hPair, pairGreen: false,
                        oppPurple:  hOpp,  oppGreen:  false,
                    };
                }
            }
            // Cache the current (i.e. for-next-spin) projection so the
            // next tick's hit check has the right era.
            try {
                if (window.table3DisplayProjections) {
                    this._prevT3Projections = JSON.parse(
                        JSON.stringify(window.table3DisplayProjections)
                    );
                }
            } catch (_) { /* fallback: leave cache as-is */ }
            return log;
        }

        _fillTableLog(logTable, projs, actual) {
            for (const [pk, pairProj] of Object.entries(projs || {})) {
                if (!pairProj) continue;
                const entry = { first: false, second: false, third: false, sides: {} };
                for (const sa of SUB_ANCHORS) {
                    const slot = pairProj[sa];
                    if (!slot) continue;
                    const numbers = Array.isArray(slot.numbers) ? slot.numbers : [];
                    const target  = (Array.isArray(slot.targets) && slot.targets[0] != null) ? slot.targets[0] : null;
                    entry[sa] = numbers.includes(actual);
                    if (entry[sa] && target != null && typeof window.calculatePositionCode === 'function') {
                        try {
                            const code = window.calculatePositionCode(target, actual);
                            if (code && code !== 'XX') {
                                entry.sides[sa] = code.startsWith('S') ? 'S' : 'O';
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
                logTable[pk] = entry;
            }
        }

        _didActivePairHit(log) {
            if (!log || !this.activePairKey) return false;
            if (this.activeTable === 't1' || this.activeTable === 't2') {
                const ent = log[this.activeTable] && log[this.activeTable][this.activePairKey];
                if (!ent) return false;
                return !!(ent.first || ent.second || ent.third);
            }
            if (this.activeTable === 't3') {
                const ent = log.t3 && log.t3[this.activePairKey];
                return !!(ent && ent.anyHit);
            }
            return false;
        }

        // ─────────────────────────────────────────────────────────────
        //  OUTCOME HANDLING (per mode)
        // ─────────────────────────────────────────────────────────────

        _handleOutcome(betHit, actual, pairHit) {
            // Update outcome history + internal P&L FIRST.
            this.recentBetOutcomes.unshift(betHit ? 'win' : 'loss');
            if (this.recentBetOutcomes.length > 10) this.recentBetOutcomes.pop();

            this.ufTotalBets += 1;
            const lastBetAmount = (window.moneyPanel && window.moneyPanel.sessionData)
                ? (parseFloat(window.moneyPanel.sessionData.lastBetAmount) || this.ufBetPerNumber)
                : this.ufBetPerNumber;
            const lastBetNumbers = this.currentBetPool.length;
            if (betHit) {
                // Profit = (36 − N) × bet/num
                this.ufWins += 1;
                this.ufSessionProfit += (36 - lastBetNumbers) * lastBetAmount;
            } else {
                this.ufLosses += 1;
                this.ufSessionProfit -= lastBetNumbers * lastBetAmount;
            }

            // Mode-specific lifecycle + bet-size progression.
            if (this.mode === 'T1') {
                this._outcomeT1(betHit, actual, pairHit);
            } else if (this.mode === 'T2') {
                this._outcomeT2(betHit, actual, pairHit);
            } else if (this.mode === 'T3') {
                this._outcomeT3(betHit, actual, pairHit);
            }

            // Unconditional stop-loss check (applies to T1/T2; T3 has
            // Martingale instead).
            if (this.mode !== 'T3') this._checkStopLoss();

            this._renderStatus();
        }

        _outcomeT1(betHit, actual, pairHit) {
            // Bet sizing is handled entirely by the money panel (the
            // active S1–S6 strategy adjusts currentBetPerNumber on
            // every win/loss). UF only logs the outcome here.
            console.log(`🤝 UF (T1): ${betHit ? 'WIN' : 'MISS'} on ${actual} (sizing → money mgmt strategy)`);
            // Pair lifecycle: keep pair on any pair-hit (re-calibrate
            // sub-anchors). Exit pair on pair-miss.
            if (pairHit) {
                const before = this.activeSubAnchors.slice();
                this._recalibrateSubAnchorsFromRecent();
                const after = this.activeSubAnchors.slice();
                this.currentBetPool = this._buildBetPool();
                // Re-sync visual selection so the table cells update
                // to reflect the new sub-anchors.
                this._syncAiPanelSelection();
                const changed = JSON.stringify(before) !== JSON.stringify(after);
                const tag = changed ? `re-calibrated [${before.join(',')}]→[${after.join(',')}]` : `same subs`;
                console.log(`🤝 UF (T1): keep pair ${this.activePairKey}, ${tag}`);
            } else {
                console.log(`🤝 UF (T1): pair MISS on ${actual} — exit ${this.activePairKey}`);
                this._resetActiveState();
            }
        }

        _outcomeT2(betHit, actual, pairHit) {
            // Bet sizing is handled by the money panel — see _outcomeT1.
            console.log(`🤝 UF (T2): ${betHit ? 'WIN' : 'MISS'} on ${actual} (sizing → money mgmt strategy)`);

            // Side check for T2: pair must hit on the LOCKED side.
            let sideStillValid = true;
            if (this.activeSide) {
                const log = this.spinLogs[this.spinLogs.length - 1];
                const ent = log && log.t2 && log.t2[this.activePairKey];
                if (ent && ent.sides) {
                    const sidesHit = Object.values(ent.sides).filter(Boolean);
                    sideStillValid = sidesHit.length > 0 && sidesHit.includes(this.activeSide);
                } else {
                    sideStillValid = false;
                }
            }

            if (pairHit && sideStillValid) {
                const before = this.activeSubAnchors.slice();
                this._recalibrateSubAnchorsFromRecent();
                const after = this.activeSubAnchors.slice();
                this.currentBetPool = this._buildBetPool();
                // Re-sync visual selection so the table cells update
                // to reflect the new sub-anchors.
                this._syncAiPanelSelection();
                const changed = JSON.stringify(before) !== JSON.stringify(after);
                const tag = changed ? `re-calibrated [${before.join(',')}]→[${after.join(',')}]` : `same subs`;
                console.log(`🤝 UF (T2): keep pair ${this.activePairKey} (side=${this.activeSide}), ${tag}`);
            } else if (pairHit && !sideStillValid) {
                console.log(`🤝 UF (T2): SIDE FLIPPED on ${actual} (was ${this.activeSide}) — exit ${this.activePairKey}`);
                this._resetActiveState();
            } else {
                console.log(`🤝 UF (T2): pair MISS on ${actual} — exit ${this.activePairKey}`);
                this._resetActiveState();
            }
        }

        _outcomeT3(betHit, actual, pairHit) {
            // Bet sizing handled by the money panel (S1–S6).
            // Lifecycle:
            //   HIT  → keep pair, rebuild pool against shifted projection.
            //   MISS → exit pair; next spin re-triggers fresh.
            if (betHit) {
                console.log(`🤝 UF (T3): WIN on ${actual} — keep pair ${this.activePairKey} (sizing → money mgmt strategy)`);
                this.currentBetPool = this._buildBetPool();
                this._syncAiPanelSelection();
                return;
            }
            console.log(`🤝 UF (T3): MISS on ${actual} — exit ${this.activePairKey} (sizing → money mgmt strategy)`);
            this._resetActiveState();
        }

        _checkStopLoss() {
            let n = 0;
            for (const o of this.recentBetOutcomes) {
                if (o === 'loss') n++;
                else break;
            }
            if (n < STOP_LOSS_THRESHOLD) return;
            if (this.activePairKey) this._resetActiveState();
            this.pausedUntilSpinCount = (window.spins || []).length + STOP_LOSS_PAUSE_SPINS;
            console.log(`🤝 UF: STOP-LOSS hit (${STOP_LOSS_THRESHOLD} losses) → pause ${STOP_LOSS_PAUSE_SPINS} spin(s)`);
        }

        // ─────────────────────────────────────────────────────────────
        //  TRIGGER DETECTION (auto)
        // ─────────────────────────────────────────────────────────────

        _tryFindTrigger() {
            if (this.mode === 'T1') this._tryT1Trigger();
            else if (this.mode === 'T2') this._tryT2Trigger();
            else if (this.mode === 'T3') this._tryT3Trigger();
        }

        _tryT1Trigger() {
            if (this.spinLogs.length < 2) return;
            const a = this.spinLogs[this.spinLogs.length - 1];
            const b = this.spinLogs[this.spinLogs.length - 2];
            for (const pk of Object.keys(a.t1)) {
                const ent = a.t1[pk], entP = b.t1[pk];
                if (!ent || !entP) continue;
                const aHit = ent.first || ent.second || ent.third;
                const bHit = entP.first || entP.second || entP.third;
                if (aHit && bHit) {
                    const aSub = SUB_ANCHORS.find(s => ent[s]);
                    const bSub = SUB_ANCHORS.find(s => entP[s]);
                    const subs = Array.from(new Set([aSub, bSub].filter(Boolean)));
                    if (subs.length === 1) {
                        for (const s of ['third', 'second', 'first']) {
                            if (!subs.includes(s)) { subs.push(s); break; }
                        }
                    }
                    if (subs.length === 0) continue;
                    this._activate('t1', pk, subs, null);
                    return;
                }
            }
        }

        _tryT2Trigger() {
            if (this.spinLogs.length < 2) return;
            const a = this.spinLogs[this.spinLogs.length - 1];
            const b = this.spinLogs[this.spinLogs.length - 2];
            const candidates = [];
            for (const pk of Object.keys(a.t2)) {
                const ent = a.t2[pk], entP = b.t2[pk];
                if (!ent || !entP) continue;
                const aHit = ent.first || ent.second || ent.third;
                const bHit = entP.first || entP.second || entP.third;
                if (!aHit || !bHit) continue;
                const aSub = SUB_ANCHORS.find(s => ent[s]);
                const bSub = SUB_ANCHORS.find(s => entP[s]);
                const aSide = aSub ? ent.sides[aSub] : null;
                const bSide = bSub ? entP.sides[bSub] : null;
                if (!aSide || !bSide || aSide !== bSide) continue;
                let consec = 0;
                for (let i = this.spinLogs.length - 1; i >= 0; i--) {
                    const e = this.spinLogs[i].t2[pk];
                    const h = e && (e.first || e.second || e.third);
                    if (h) consec++; else break;
                }
                const subs = Array.from(new Set([aSub, bSub].filter(Boolean)));
                if (subs.length === 1) {
                    for (const s of ['third', 'second', 'first']) {
                        if (!subs.includes(s)) { subs.push(s); break; }
                    }
                }
                candidates.push({ pk, subs, side: aSide, consec });
            }
            if (candidates.length === 0) return;
            candidates.sort((x, y) => x.consec - y.consec);
            const pick = candidates[0];
            this._activate('t2', pick.pk, pick.subs, pick.side);
        }

        _tryT3Trigger() {
            if (this.spinLogs.length < 2) return;
            const a = this.spinLogs[this.spinLogs.length - 1];
            const b = this.spinLogs[this.spinLogs.length - 2];
            const candidates = [];
            // Only the PAIR half triggers. The 13-opp half can still
            // CONTRIBUTE numbers to the bet pool when close on the
            // wheel (see _buildBetPool t3 branch), but never fires
            // the trigger on its own.
            const HALVES = ['pair'];
            for (const pk of Object.keys(a.t3)) {
                const ea = a.t3[pk], eb = b.t3[pk];
                if (!ea || !eb) continue;
                for (const half of HALVES) {
                    if (ea[half] && eb[half]) {
                        // Reject candidates whose NEXT-spin projection
                        // has no anchors on this half — bet pool would
                        // be empty (pool=0) and no bet could be placed.
                        const nextProj = (window.table3DisplayProjections
                                          && window.table3DisplayProjections[pk]) || null;
                        if (nextProj) {
                            const anchors = (half === 'pair')
                                ? [...(nextProj.pairPurple || []), ...(nextProj.pairGreen || [])]
                                : [...(nextProj.oppPurple  || []), ...(nextProj.oppGreen  || [])];
                            if (anchors.length === 0) continue;
                        } else {
                            continue;
                        }
                        let consec = 0;
                        for (let i = this.spinLogs.length - 1; i >= 0; i--) {
                            const e = this.spinLogs[i].t3[pk];
                            if (e && e[half]) consec++; else break;
                        }
                        // Distance between the two consecutive
                        // position codes (e.g. SR+2 → SL+1 → |2-1|=1,
                        // OR+1 → OR+1 → 0). Smaller = the two hits
                        // landed closer to each other, i.e. the pair
                        // is "tighter" / closer to the prediction.
                        const codeKey = (half === 'pair') ? 'pairCode' : 'oppCode';
                        const dist = _posCodeDistance(eb[codeKey], ea[codeKey]);
                        candidates.push({ pk, side: half, consec, dist,
                                          prevCode: eb[codeKey], currCode: ea[codeKey] });
                    }
                }
            }
            if (candidates.length === 0) {
                // Diagnostic — always print so we can see what's
                // happening after a miss. Shows hits on the CURRENT
                // spin AND the prior spin; a trigger needs at least
                // one (pair, half) to be in both.
                const fmt = (entry) => {
                    if (!entry) return '∅';
                    const tags = [];
                    for (const pk of Object.keys(entry)) {
                        const e = entry[pk];
                        if (!e) continue;
                        const t = [];
                        if (e.pair) t.push('pair');
                        if (e.opp)  t.push('opp');
                        if (t.length > 0) tags.push(`${pk}:${t.join('+')}`);
                    }
                    return tags.length > 0 ? tags.join(', ') : '∅';
                };
                console.log(`🤝 UF (T3): no 2-in-a-row · curr=[${fmt(a.t3)}] · prev=[${fmt(b.t3)}]`);
                return;
            }
            // Ranking (per spec):
            //   1. SMALLEST dist between the two consecutive position
            //      codes — the tightest match, closest to prediction.
            //   2. Tiebreak: shorter consec (fresher 2-in-a-row).
            //   3. Tiebreak: stable key order from Object.keys.
            candidates.sort((x, y) => {
                if (x.dist !== y.dist) return x.dist - y.dist;
                return x.consec - y.consec;
            });
            const pick = candidates[0];
            const others = candidates.slice(1, 4)
                .map(c => `${c.pk}:${c.side}(d=${c.dist})`)
                .join(', ');
            console.log(`🤝 UF (T3): TRIGGER pair=${pick.pk} side=${pick.side} consec=${pick.consec} dist=${pick.dist} (${pick.prevCode}→${pick.currCode})${others ? ' · others: ' + others : ''}`);
            // Stash the trigger codes so _buildBetPool can:
            //   - expand opposites when currCode offset is 0 (Change 2)
            //   - borrow 13-opp anchors when |currCode offset| ≤ 3 (Change 3)
            this._t3TriggerPrevCode = pick.prevCode;
            this._t3TriggerCurrCode = pick.currCode;
            this._activate('t3', pick.pk, [], pick.side);
        }

        // ─────────────────────────────────────────────────────────────
        //  MANUAL-MODE PAIR PICKUP
        // ─────────────────────────────────────────────────────────────

        _useManualSelection() {
            const aip = window.aiPanel;
            if (!aip) return false;

            // Scan all 3 tables in T1 → T2 → T3 priority for the
            // user's selection. Whichever table they selected from
            // determines the bet-pool logic.
            const t1sels = aip.table1Selections || {};
            const t1Keys = Object.keys(t1sels).filter(pk => t1sels[pk] instanceof Set && t1sels[pk].size > 0);
            if (t1Keys.length > 0) {
                const pk = t1Keys[0];
                const subs = this._pickManualSubs(Array.from(t1sels[pk]));
                this._activate('t1', pk, subs, null);
                return true;
            }

            const t2sels = aip.table2Selections || {};
            const t2Keys = Object.keys(t2sels).filter(pk => t2sels[pk] instanceof Set && t2sels[pk].size > 0);
            if (t2Keys.length > 0) {
                const pk = t2Keys[0];
                const subs = this._pickManualSubs(Array.from(t2sels[pk]));
                let side = null;
                const log = this.spinLogs[this.spinLogs.length - 1];
                const ent = log && log.t2 && log.t2[pk];
                if (ent && ent.sides) {
                    const sidesHit = Object.values(ent.sides).filter(Boolean);
                    if (sidesHit.length > 0) side = sidesHit[0];
                }
                if (!side) side = 'S';
                this._activate('t2', pk, subs, side);
                return true;
            }

            const t3sels = aip.table3Selections;
            if (t3sels && t3sels.size > 0) {
                const pk = Array.from(t3sels)[0];
                this._activate('t3', pk, [], 'purple');
                return true;
            }
            return false;
        }

        _pickManualSubs(userSelected) {
            const ORDER = ['first', 'second', 'third'];
            const picked = ORDER.filter(s => userSelected.includes(s));
            if (picked.length === 0) return [];
            if (picked.length >= 2) return picked.slice(0, 2);
            for (const s of ['third', 'second', 'first']) {
                if (!picked.includes(s)) { picked.push(s); break; }
            }
            return picked;
        }

        // ─────────────────────────────────────────────────────────────
        //  ACTIVATE + BET-POOL COMPUTATION
        // ─────────────────────────────────────────────────────────────

        _activate(table, pairKey, subAnchors, side) {
            this.activeTable      = table;
            this.activePairKey    = pairKey;
            this.activeSubAnchors = subAnchors.slice();
            this.activeSide       = side;
            this.currentBetPool   = this._buildBetPool();
            console.log(`🤝 UF: TRIGGER on ${table.toUpperCase()} pair=${pairKey} subs=[${subAnchors.join(',')}] side=${side || '-'} pool=${this.currentBetPool.length}`);
            // Push the selection into the AI panel so the visible T1/T2/T3
            // table highlights and the SELECTIONS panel both show OUR
            // active pair. Strictly read-write to existing AI-panel
            // public state — no edits to ai-prediction-panel.js.
            this._syncAiPanelSelection();
        }

        // ─────────────────────────────────────────────────────────────
        //  AI PANEL SELECTION SYNC
        //  Mirror the active (table, pair, sub-anchors) into
        //  aip.table[N]Selections + aip.table[N]SelectedPairs so the
        //  existing AI-panel render paths show our auto-selected pair
        //  in the T1/T2/T3 visual tables AND the SELECTIONS panel.
        //  Cleared by _clearAiPanelSelection() on pair exit / disable.
        // ─────────────────────────────────────────────────────────────

        _syncAiPanelSelection() {
            const aip = window.aiPanel;
            if (!aip) return;
            try {
                if (this.activeTable === 't1' || this.activeTable === 't2') {
                    const selKey  = (this.activeTable === 't1') ? 'table1Selections'   : 'table2Selections';
                    const hlKey   = (this.activeTable === 't1') ? 'table1SelectedPairs' : 'table2SelectedPairs';
                    const tableId = (this.activeTable === 't1') ? 'table1' : 'table2';

                    // Clear the previous UF-pushed selection first so
                    // only one pair shows highlighted at a time.
                    this._clearAiPanelSelection();

                    if (!aip[selKey]) aip[selKey] = {};
                    if (!aip[hlKey])  aip[hlKey]  = new Set();
                    aip[selKey][this.activePairKey] = new Set(this.activeSubAnchors);
                    aip[hlKey].add(this.activePairKey);
                    this._lastSyncedTable   = tableId;
                    this._lastSyncedPairKey = this.activePairKey;

                    if (typeof aip.updateSingleTableHighlights === 'function') {
                        aip.updateSingleTableHighlights(tableId, aip[hlKey]);
                    }
                    if (typeof aip.renderAllCheckboxes === 'function') {
                        aip.renderAllCheckboxes();
                    }
                    // Defer the SELECTIONS-panel render via setTimeout(0)
                    // so it runs AFTER any in-flight AI-panel render
                    // queued from its own onSpinAdded flow — otherwise
                    // the AI panel's render (with stale empty
                    // selections) overwrites ours.
                    setTimeout(() => {
                        try {
                            if (typeof aip._renderSummaryDashboard === 'function') {
                                aip._renderSummaryDashboard();
                            }
                        } catch (_) {}
                    }, 0);
                } else if (this.activeTable === 't3') {
                    this._clearAiPanelSelection();
                    if (!aip.table3Selections) aip.table3Selections = new Set();
                    // T3 pair keys in window.table3DisplayProjections are
                    // underscore form (prev_plus_1); the AI panel's DOM
                    // uses camelCase (prevPlus1). Translate before
                    // inserting so [data-pair="…"] queries match and the
                    // dashboard counter recognises the pair.
                    const aiKey = _T3_REFKEY_TO_DATA_PAIR[this.activePairKey] || this.activePairKey;
                    aip.table3Selections.add(aiKey);
                    this._lastSyncedTable   = 'table3';
                    this._lastSyncedPairKey = aiKey;
                    if (typeof aip.updateSingleTableHighlights === 'function') {
                        aip.updateSingleTableHighlights('table3', aip.table3Selections);
                    }
                    if (typeof aip.renderAllCheckboxes === 'function') {
                        aip.renderAllCheckboxes();
                    }
                    setTimeout(() => {
                        try {
                            if (typeof aip._renderSummaryDashboard === 'function') {
                                aip._renderSummaryDashboard();
                            }
                        } catch (_) {}
                    }, 0);
                }
            } catch (e) {
                console.warn('🤝 UF: AI-panel sync failed:', e && e.message);
            }
        }

        _clearAiPanelSelection() {
            const aip = window.aiPanel;
            if (!aip || !this._lastSyncedTable || !this._lastSyncedPairKey) return;
            const t  = this._lastSyncedTable;
            const pk = this._lastSyncedPairKey;
            try {
                if (t === 'table1' || t === 'table2') {
                    const selKey = (t === 'table1') ? 'table1Selections'   : 'table2Selections';
                    const hlKey  = (t === 'table1') ? 'table1SelectedPairs' : 'table2SelectedPairs';
                    if (aip[selKey] && aip[selKey][pk]) delete aip[selKey][pk];
                    if (aip[hlKey]) aip[hlKey].delete(pk);
                    if (typeof aip.updateSingleTableHighlights === 'function') {
                        aip.updateSingleTableHighlights(t, aip[hlKey] || new Set());
                    }
                } else if (t === 'table3') {
                    if (aip.table3Selections) aip.table3Selections.delete(pk);
                    if (typeof aip.updateSingleTableHighlights === 'function') {
                        aip.updateSingleTableHighlights('table3', aip.table3Selections || new Set());
                    }
                }
                if (typeof aip.renderAllCheckboxes === 'function') aip.renderAllCheckboxes();
                setTimeout(() => {
                    try {
                        if (typeof aip._renderSummaryDashboard === 'function') {
                            aip._renderSummaryDashboard();
                        }
                    } catch (_) {}
                }, 0);
            } catch (_) {}
            this._lastSyncedTable   = null;
            this._lastSyncedPairKey = null;
        }

        _buildBetPool() {
            const spins = window.spins || [];
            const prev     = spins.length >= 1 ? spins[spins.length - 1].actual : null;
            const prevPrev = spins.length >= 2 ? spins[spins.length - 2].actual : null;

            if (this.activeTable === 't1') {
                const projs = (typeof window.getTable1NextProjections === 'function')
                    ? window.getTable1NextProjections() : {};
                const proj = projs[this.activePairKey];
                if (!proj) return [];
                const pool = new Set();
                for (const sa of this.activeSubAnchors) {
                    const nums = proj[sa] && proj[sa].numbers;
                    if (Array.isArray(nums)) nums.forEach(n => pool.add(n));
                }
                return Array.from(pool);
            }

            if (this.activeTable === 't2') {
                const projs = (typeof window.getTable2NextProjections === 'function')
                    ? window.getTable2NextProjections() : {};
                const proj = projs[this.activePairKey];
                if (!proj) return [];
                const pool = new Set();
                for (const sa of this.activeSubAnchors) {
                    const target = proj[sa] && proj[sa].targets && proj[sa].targets[0];
                    if (target == null) continue;
                    const expandFrom = (this.activeSide === 'O')
                        ? _regularOpposite(target)
                        : target;
                    if (expandFrom == null) continue;
                    _addNeighbours(pool, expandFrom, 2);
                }
                return Array.from(pool);
            }

            if (this.activeTable === 't3') {
                const proj = window.table3DisplayProjections && window.table3DisplayProjections[this.activePairKey];
                if (!proj) return [];

                // Pair anchors are the only trigger source now. 13-opp
                // anchors are only borrowed (Change 3) when close on
                // the wheel, never used as a primary half.
                const pairAnchors = [
                    ...(proj.pairPurple || []),
                    ...(proj.pairGreen  || []),
                ];
                const oppAnchors = [
                    ...(proj.oppPurple || []),
                    ...(proj.oppGreen  || []),
                ];

                // Trigger code from the JUST-LANDED spin — used for the
                // ±0 opposite-expansion and the |offset|≤3 borrow rule.
                // Read fresh from spinLogs each rebuild so the rules
                // re-evaluate when the pair is retained spin-to-spin.
                let currCode = null;
                if (this.spinLogs.length > 0) {
                    const last = this.spinLogs[this.spinLogs.length - 1];
                    const ent = last && last.t3 && last.t3[this.activePairKey];
                    if (ent) currCode = ent.pairCode || null;
                }
                const offsetAbs = _posCodeOffset(currCode);  // Infinity when XX

                const pool = new Set();

                // Base: pair anchors + ±1 wheel neighbours.
                for (const a of pairAnchors) _addNeighbours(pool, a, 1);

                // ── CHANGE 2 — current code offset == 0 ──────────────
                // The 4 anchors cluster tightly (spin was right on top
                // of one of them). Expand by including each anchor's
                // regular opposite (+ ±1) to push the pool back up to
                // 12-13 nums.
                if (offsetAbs === 0) {
                    for (const a of pairAnchors) {
                        const opp = _regularOpposite(a);
                        if (opp != null) _addNeighbours(pool, opp, 1);
                    }
                }

                // ── CHANGE 3 — borrow 13-opp anchors when |offset| ≤ 3 ─
                // Scan the 13-opp anchors. If any is within ±1 wheel
                // pocket of a number already in the pair pool, add ONE
                // such 13-opp anchor (and its regular opposite) to the
                // pool. Hard cap: max 1 borrowed anchor.
                if (offsetAbs >= 1 && offsetAbs <= 3 && oppAnchors.length > 0) {
                    const ADJ_TOL = 1; // ±1 wheel pocket
                    // Pre-compute current pool's wheel indices for the
                    // adjacency check.
                    const poolWheelIdx = new Set();
                    for (const n of pool) {
                        const i = _getWheel36Idx(n);
                        if (i !== -1) poolWheelIdx.add(i);
                    }
                    for (const o of oppAnchors) {
                        if (pool.has(o)) continue; // already in pool
                        const oi = _getWheel36Idx(o);
                        if (oi === -1) continue;
                        let adjacent = false;
                        for (let d = -ADJ_TOL; d <= ADJ_TOL; d++) {
                            const probe = ((oi + d) % 36 + 36) % 36;
                            if (poolWheelIdx.has(probe)) { adjacent = true; break; }
                        }
                        if (adjacent) {
                            pool.add(o);
                            const oopp = _regularOpposite(o);
                            if (oopp != null) pool.add(oopp);
                            // Hard cap — only ONE borrow per pool rebuild.
                            break;
                        }
                    }
                }

                return Array.from(pool);
            }
            return [];
        }

        _recalibrateSubAnchorsFromRecent() {
            if (this.activeTable !== 't1' && this.activeTable !== 't2') return;
            const tableKey = this.activeTable;
            const seen = [];
            for (let i = this.spinLogs.length - 1; i >= 0; i--) {
                const log = this.spinLogs[i];
                const ent = log && log[tableKey] && log[tableKey][this.activePairKey];
                if (!ent) continue;
                for (const sa of SUB_ANCHORS) {
                    if (ent[sa] && !seen.includes(sa)) seen.push(sa);
                }
                if (seen.length >= 2) break;
            }
            if (seen.length === 0) return;
            if (seen.length === 1) {
                for (const s of ['third', 'second', 'first']) {
                    if (!seen.includes(s)) { seen.push(s); break; }
                }
            }
            this.activeSubAnchors = seen.slice(0, 2);
        }

        _resetActiveState() {
            // Clear AI-panel selection FIRST while we still know which
            // pair we pushed, so the SELECTIONS panel and table
            // highlights both clear properly.
            this._clearAiPanelSelection();
            this.activeTable      = null;
            this.activePairKey    = null;
            this.activeSubAnchors = [];
            this.activeSide       = null;
            this.currentBetPool   = [];
            // Clear T3 trigger-code stash so the next trigger starts fresh.
            this._t3TriggerPrevCode = null;
            this._t3TriggerCurrCode = null;
            // Clear money panel + wheel visuals so display matches state.
            try {
                if (window.moneyPanel) {
                    window.moneyPanel.pendingBet = null;
                    if (window.moneyPanel.sessionData) {
                        window.moneyPanel.sessionData.lastBetAmount  = 0;
                        window.moneyPanel.sessionData.lastBetNumbers = 0;
                    }
                    if (typeof window.moneyPanel.render === 'function') {
                        window.moneyPanel.render();
                    }
                }
                if (window.rouletteWheel && typeof window.rouletteWheel.clearHighlights === 'function') {
                    window.rouletteWheel.clearHighlights();
                }
            } catch (_) {}
        }

        // ─────────────────────────────────────────────────────────────
        //  PENDING BET STAMPING
        // ─────────────────────────────────────────────────────────────

        _postPendingBet(currentCount) {
            if (!window.moneyPanel) return;
            if (!this.currentBetPool || this.currentBetPool.length === 0) return;
            if (window.moneyPanel.sessionData
                && window.moneyPanel.sessionData.isBettingEnabled === false) {
                return;
            }

            // Bet sizing is delegated to the money panel — the active
            // money-management strategy (S1 Aggressive, S2 Conservative,
            // S3 Cautious, S4 Defensive, S5 Logical, S6 Super Cautious)
            // owns all win/loss adjustments. UF picks numbers; the
            // money panel sizes the bet. This way switching strategy
            // in the header (or clicking 💲 Adjust stake) changes UF
            // bets exactly as it would change any other selection's
            // bets — universal money management.
            const N = this.currentBetPool.length;
            let betPerNum = (typeof window.moneyPanel.calculateBetAmount === 'function')
                ? window.moneyPanel.calculateBetAmount(N)
                : (window.moneyPanel.sessionData
                   && window.moneyPanel.sessionData.currentBetPerNumber)
                  || DEFAULT_MIN_BET;
            if (!Number.isFinite(betPerNum) || betPerNum < DEFAULT_MIN_BET) {
                betPerNum = DEFAULT_MIN_BET;
            }

            // Activate the money panel session if not active.
            if (!window.moneyPanel.sessionData.isSessionActive) {
                window.moneyPanel.sessionData.isSessionActive = true;
                window.moneyPanel.lastSpinCount = (window.spins || []).length;
                console.log('🤝 UF: session ACTIVATED');
            }

            window.moneyPanel.pendingBet = {
                betAmount: betPerNum,
                numbersCount: N,
                predictedNumbers: this.currentBetPool.slice(),
                placedAtSpinCount: currentCount,
            };
            window.moneyPanel.sessionData.lastBetAmount  = betPerNum;
            window.moneyPanel.sessionData.lastBetNumbers = N;
            this._lastWrittenStampSpinCount = currentCount;
            console.log(`🤝 UF: stamped pendingBet $${betPerNum} × ${N} = $${betPerNum * N} on ${this.activePairKey}`);

            // Render money panel + wheel.
            try { window.moneyPanel.render && window.moneyPanel.render(); } catch (_) {}
            this._pushWheelHighlight();
        }

        _pushWheelHighlight() {
            if (!window.rouletteWheel) return;
            if (typeof window.rouletteWheel.updateHighlights !== 'function') return;
            const numbers = this.currentBetPool.slice();
            const prediction = {
                numbers,
                extraNumbers: [],
                anchors: [],
                loose: numbers.slice(),
                anchor_groups: [],
                signal: 'BET NOW',
                confidence: 100,
                mode: 'USER_FRIENDLY',
            };
            try {
                window.rouletteWheel.updateHighlights([], numbers.slice(), [], [], prediction);
            } catch (e) {
                console.warn('🤝 UF: wheel update failed:', e && e.message);
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  INTERCEPTOR — prevent AI panel from overwriting pendingBet
        //  while User Friendly is the authoritative bet driver.
        // ─────────────────────────────────────────────────────────────

        _installSetPredictionInterceptor() {
            const mp = window.moneyPanel;
            if (!mp) return;
            if (this._origSetPrediction || this._origUpdateFromPrediction) return;
            const self = this;

            // Intercept only when User Friendly is enabled AND has an
            // active pair. Otherwise pass through — other strategies
            // and modes operate normally.
            // Block the AI-panel auto pipeline whenever UF is enabled —
            // even between triggers (no active pair yet). Otherwise
            // setPrediction writes lastBetAmount/lastBetNumbers from
            // its own default 12-num pool, and the money panel's
            // "Next Bet" tile shows a stale value (e.g. "$2 × 12 = $24")
            // that doesn't match what UF will actually stamp on the
            // next trigger.
            const shouldIntercept = () => self.enabled;

            const origSP = mp.setPrediction.bind(mp);
            this._origSetPrediction = origSP;
            mp.setPrediction = function (prediction) {
                if (shouldIntercept()) return;
                return origSP(prediction);
            };

            if (typeof mp.updateFromPrediction === 'function') {
                const origUP = mp.updateFromPrediction.bind(mp);
                this._origUpdateFromPrediction = origUP;
                mp.updateFromPrediction = function (prediction) {
                    if (shouldIntercept()) return;
                    return origUP(prediction);
                };
            }
        }

        _uninstallSetPredictionInterceptor() {
            if (window.moneyPanel) {
                if (this._origSetPrediction) {
                    window.moneyPanel.setPrediction = this._origSetPrediction;
                }
                if (this._origUpdateFromPrediction) {
                    window.moneyPanel.updateFromPrediction = this._origUpdateFromPrediction;
                }
            }
            this._origSetPrediction = null;
            this._origUpdateFromPrediction = null;
        }

        // ─────────────────────────────────────────────────────────────
        //  WHEEL UPDATE-HIGHLIGHTS INTERCEPTOR
        //  The AI panel's per-spin pipeline calls
        //  window.rouletteWheel.updateHighlights() with ITS prediction
        //  (which includes opposites for T2 — typically 20 nums for our
        //  case). When User Friendly has an active pair, we want the
        //  wheel to show OUR bet pool, not the AI panel's. Wrapping
        //  updateHighlights lets us replace incoming numbers/anchors
        //  with our pool at the entry point — no edits to the wheel
        //  module needed. Restored on disable().
        // ─────────────────────────────────────────────────────────────

        _installWheelInterceptor() {
            const wheel = window.rouletteWheel;
            if (!wheel || this._origUpdateHighlights) return;
            const self = this;
            const orig = wheel.updateHighlights.bind(wheel);
            this._origUpdateHighlights = orig;
            wheel.updateHighlights = function (anchors, loose, anchorGroups, extraNumbers, prediction) {
                // Only override when we have an active pair AND our pool
                // is populated. Otherwise pass through unchanged.
                if (self.enabled && self.activePairKey
                    && Array.isArray(self.currentBetPool) && self.currentBetPool.length > 0) {
                    const ourNumbers = self.currentBetPool.slice();
                    const ourPrediction = Object.assign({}, prediction || {}, {
                        numbers: ourNumbers,
                        loose: ourNumbers.slice(),
                        anchors: [],
                        anchor_groups: [],
                        extraNumbers: [],
                        signal: 'BET NOW',
                        confidence: 100,
                        mode: 'USER_FRIENDLY',
                    });
                    return orig([], ourNumbers.slice(), [], [], ourPrediction);
                }
                return orig(anchors, loose, anchorGroups, extraNumbers, prediction);
            };
        }

        _uninstallWheelInterceptor() {
            if (this._origUpdateHighlights && window.rouletteWheel) {
                window.rouletteWheel.updateHighlights = this._origUpdateHighlights;
            }
            this._origUpdateHighlights = null;
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  SINGLETON — defer construction to after DOMContentLoaded so
    //  any error in this module cannot block the other panels'
    //  initialization. Same script load (zero side effects at load
    //  time besides the IIFE wrapping itself).
    // ════════════════════════════════════════════════════════════════

    function _bootstrap() {
        try {
            globalRef.userFriendlyTrigger = new UserFriendlyTrigger();
            console.log('✅ User-Friendly Trigger module loaded (self-contained)');
        } catch (e) {
            console.error('🤝 UF: bootstrap failed (other strategies unaffected):', e);
        }
    }

    if (typeof document === 'undefined') {
        // Node / test context — just construct directly.
        _bootstrap();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bootstrap);
    } else {
        // DOM already ready — schedule on the next tick so we don't run
        // synchronously during script parsing and interleave with other
        // scripts' top-level work.
        setTimeout(_bootstrap, 0);
    }
})(typeof window !== 'undefined' ? window : globalThis);
