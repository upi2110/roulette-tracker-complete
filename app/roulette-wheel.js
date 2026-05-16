/**
 * European Roulette Wheel Visualization
 * Panel order: This creates FIRST (LEFT position)
 *
 * Circles on wheel: Positive = GREEN, Negative = BLACK, Grey = GREY
 * Anchor circles show ±1 or ±2 label in white text.
 * Number lists above wheel separate ±1 and ±2 groups.
 * Filter checkboxes: 0 Table / 19 Table / Positive / Negative
 */

// 0 Table and 19 Table definitions
const ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

// Number Set Filters (3 sets covering all 37 numbers, based on wheel position patterns)
const SET_0_NUMS = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]); // 0 Set: 13 numbers (0/26 same pocket)
const SET_5_NUMS = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);   // 5 Set: 12 numbers
const SET_6_NUMS = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);      // 6 Set: 12 numbers

// Regular Opposites: 180° across the wheel (from renderer-3tables.js, with inline fallback)
const WHEEL_REGULAR_OPPOSITES = (typeof REGULAR_OPPOSITES !== 'undefined') ? REGULAR_OPPOSITES : {
    0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
    10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
    19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
    28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
};

// D13 Opposites: use existing global from renderer-3tables.js, fallback to inline definition
// (renderer-3tables.js loads before roulette-wheel.js so DIGIT_13_OPPOSITES is already available)
const WHEEL_D13_OPPOSITES = (typeof DIGIT_13_OPPOSITES !== 'undefined') ? DIGIT_13_OPPOSITES : {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
};

class RouletteWheel {
    constructor() {
        this.wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
            5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];

        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

        // Sort order: from 26 clockwise
        this.sortOrder = [26, 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
        this.wheelPos = {};
        this.sortOrder.forEach((n, i) => { this.wheelPos[n] = i; });

        this.POSITIVE = POSITIVE_NUMS;
        this.NEGATIVE = NEGATIVE_NUMS;

        this.anchorGroups = [];
        this.looseNumbers = [];
        this.extraNumbers = [];
        this.extraAnchorGroups = [];
        this.extraLoose = [];

        // Map: number -> { isAnchor, type } for drawing labels
        this.numberInfo = {};

        // Filter state — default: 0 Table ON, 19 Table OFF, Positive ON, Negative ON, All sets ON
        // Default table filter: BOTH (0 AND 19 wheel halves selected).
        // Matches the "Both" radio carrying the `checked` attribute in the
        // HTML template below. Keeps this initial state in sync with the
        // DOM so the first _onFilterChange()/drawWheel() call sees the
        // same truth whether it reads this.filters or the radio group.
        this.filters = { zeroTable: true, nineteenTable: true, positive: true, negative: true,
                         set0: true, set5: true, set6: true,
                         // When true, the final bet set is inverted: every
                         // wheel number NOT currently selected becomes the
                         // bet, and every selected number is removed.
                         inverse: false };

        // Store the raw/unfiltered prediction for re-filtering
        this._rawPrediction = null;

        this.createWheel();
    }

    createWheel() {
        const container = document.querySelector('.info-panels-container-bottom');
        if (!container) {
            console.error('Bottom panels container not found');
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'wheel-panel';
        panel.id = 'wheelPanel';
        panel.innerHTML = `
            <div class="panel-header" style="display:flex;flex-direction:column;gap:6px;align-items:stretch;">
                <!-- Row 1: title (left) + collapse (right). Always single
                     line so the title doesn't wrap to its own row when
                     the toggle buttons crowd it. -->
                <div style="display:flex;align-items:center;gap:8px;">
                    <h3 style="margin:0;flex:1;">European Wheel</h3>
                    <button class="btn-toggle" id="toggleWheelPanel">−</button>
                </div>
                <!-- Row 2: the four structural toggles + Inverse. Wraps
                     to multiple lines if the panel is narrow. -->
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <!-- Strategy-Lab grey-numbers toggle. Mirrored with the
                         AI-panel checkbox and Auto Test params row via the
                         'strategyLabIncludeGreyChanged' window event so all
                         three UIs stay in sync. Tick = include grey numbers
                         in the Strategy-Lab bet; untick = exclude them. -->
                    <label id="wheelGreyToggleWrap" title="Include grey numbers in Strategy-Lab bets (live + lab). Mirrored with AI panel + Auto Test params." style="
                        display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;
                        color:#475569;cursor:pointer;user-select:none;
                        padding:3px 8px;border:1px solid #94a3b8;border-radius:4px;background:#f8fafc;
                    ">
                        <input type="checkbox" id="wheelGreyToggle" checked style="vertical-align:middle;"> include grey
                    </label>
                    <!-- T3 halfs toggle: when ON, each Table-3 pair group
                         splits into a "pair" half (P+1) and a "13opp" half
                         (P+1-13opp) that can be selected independently —
                         matching how T1 / T2 already work. When OFF, T3
                         keeps the original single-entry-per-pair behaviour. -->
                    <label id="wheelT3HalfsWrap" title="Split each Table-3 pair group into pair / 13opp halves so they can be selected independently (like Table 1 and Table 2)." style="
                        display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;
                        color:#475569;cursor:pointer;user-select:none;
                        padding:3px 8px;border:1px solid #94a3b8;border-radius:4px;background:#f8fafc;
                    ">
                        <input type="checkbox" id="wheelT3HalfsToggle" style="vertical-align:middle;"> T3 halfs
                    </label>
                    <!-- T1/T2 break toggle: when ON, the auto-pick of which
                         refs (1st/2nd/3rd) are primary STOPS refreshing on
                         every new spin. Whatever the user has manually
                         selected stays frozen for the rest of the session.
                         Auto-test panel also exposes per-pair 1/2/3 sub-
                         toggles when this is ON. When OFF, the AI panel's
                         per-spin _refreshAutoPickedPairs runs as before. -->
                    <label id="wheelT1T2BreaksWrap" title="Freeze the 1st/2nd/3rd ref pick for T1 & T2. When ON, your manual ref selection stays put even as new spins come in." style="
                        display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;
                        color:#475569;cursor:pointer;user-select:none;
                        padding:3px 8px;border:1px solid #94a3b8;border-radius:4px;background:#f8fafc;
                    ">
                        <input type="checkbox" id="wheelT1T2BreaksToggle" style="vertical-align:middle;"> T1/T2 break
                    </label>
                    <button id="wheelInverseBtn" title="Flip the bet set: remove all currently selected wheel numbers, select all the others. Click again to flip back. Mirrors to money panel + AI display + wheel highlights." style="
                        font-size:10px;font-weight:700;cursor:pointer;user-select:none;
                        padding:3px 9px;border:1px solid #94a3b8;border-radius:4px;
                        background:#f8fafc;color:#1e293b;letter-spacing:.2px;line-height:1;
                    ">⇄ Inverse</button>
                </div>
                <!-- Row 2: bet-trigger toggles (Same + Wheel mode). Grouped on
                     their own row so the link between them is visible at a
                     glance (Wheel mode supplies the pool, Same gates when to
                     bet against it). -->
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 8px;background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #f59e0b;border-radius:5px;">
                    <span style="font-size:10px;font-weight:800;color:#92400e;letter-spacing:.6px;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:3px;">⚡ BET TRIGGER</span>
                    <!-- Same toggle: wait-for-trigger betting. When ON, no
                         bet is placed until a spin lands in the current bet
                         pool (the predicted numbers). After that trigger,
                         bet on the next spin; WIN stays armed (keep
                         betting), LOSS disarms (wait for next trigger).
                         Mirrored to Auto Test via 'sameModeChanged' event. -->
                    <label id="wheelSameModeWrap" title="Wait-for-trigger: only place a bet AFTER a spin lands in the current bet pool. Win → keep betting. Loss → wait for the next trigger." style="
                        display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;
                        color:#475569;cursor:pointer;user-select:none;
                        padding:3px 8px;border:1px solid #94a3b8;border-radius:4px;background:#f8fafc;
                    ">
                        <input type="checkbox" id="wheelSameModeToggle" style="vertical-align:middle;"> Same
                    </label>
                    <!-- Wheel mode toggle: when ON, the bet pool is derived
                         from the wheel's Table / Sign / Set filters applied
                         to the full 0–36 universe (instead of T1/T2/T3 pair
                         predictions). If pairs are also selected, the wheel
                         pool intersects with the pair-pool — wheel filters
                         act as a hard mask. When OFF, behaviour is exactly
                         as today. Same trigger respects the active pool. -->
                    <label id="wheelWheelModeWrap" title="Bet on the wheel's filtered numbers (Table/Sign/Set/Inverse) instead of pair-derived predictions. With pairs selected, intersects pair-pool ∩ wheel-pool. Use this when you want to bet on a set without selecting any T1/T2/T3 pair." style="
                        display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;
                        color:#475569;cursor:pointer;user-select:none;
                        padding:3px 8px;border:1px solid #94a3b8;border-radius:4px;background:#f8fafc;
                    ">
                        <input type="checkbox" id="wheelWheelModeToggle" style="vertical-align:middle;"> Wheel mode
                    </label>
                </div>
            </div>
            <div class="panel-content">
                <div id="wheelFilters" style="display:flex; flex-direction:column; gap:4px; padding:6px 8px; background:#f1f5f9; border-radius:6px; margin-bottom:4px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px;font-weight:700;color:#475569;min-width:40px;">Table:</span>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#065f46;">
                            <input type="radio" name="tableFilter" id="filter0Table" value="0" style="accent-color:#22c55e;"> 0
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#581c87;">
                            <input type="radio" name="tableFilter" id="filter19Table" value="19" style="accent-color:#9333ea;"> 19
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e40af;">
                            <input type="radio" name="tableFilter" id="filterBothTables" value="both" checked style="accent-color:#3b82f6;"> Both
                        </label>
                        <span id="filteredCount" style="margin-left:auto;font-size:11px;font-weight:700;color:#64748b;"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px;font-weight:700;color:#475569;min-width:40px;">Sign:</span>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#16a34a;">
                            <input type="radio" name="signFilter" id="filterPositive" value="positive" style="accent-color:#22c55e;"> +ve
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e293b;">
                            <input type="radio" name="signFilter" id="filterNegative" value="negative" style="accent-color:#334155;"> -ve
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e40af;">
                            <input type="radio" name="signFilter" id="filterBothSigns" value="both" checked style="accent-color:#3b82f6;"> Both
                        </label>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px;font-weight:700;color:#475569;min-width:40px;">Set:</span>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#d97706;">
                            <input type="checkbox" id="filterSet0" checked class="set-cb" style="accent-color:#d97706;"> 0
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#059669;">
                            <input type="checkbox" id="filterSet5" checked class="set-cb" style="accent-color:#059669;"> 5
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#7c3aed;">
                            <input type="checkbox" id="filterSet6" checked class="set-cb" style="accent-color:#7c3aed;"> 6
                        </label>
                        <!-- Trigger status pill — visual indicator of
                             whether the Same/Wheel trigger gate is
                             currently ARMED (will bet on next spin)
                             or WAITING (no trigger fired yet). Only
                             shown when at least one trigger toggle is
                             ON; hidden when both are OFF (every-spin
                             betting, no gate). Updated by
                             _refreshTriggerStatus(). -->
                        <span id="wheelTriggerStatus" title="Bet-trigger status — green = armed (bet on next spin), red = waiting for a spin in the bet pool. Only shown when Same or Wheel mode is ON." style="
                            display:none;margin-left:auto;font-size:10px;font-weight:800;letter-spacing:.4px;
                            padding:3px 10px;border-radius:12px;border:1px solid transparent;
                            background:#64748b;color:#fff;user-select:none;
                        ">—</span>
                        <!-- Trigger-status "why?" info button. Visible
                             only when the pill is shown. Click to
                             toggle the explanation popup below. -->
                        <button id="wheelTriggerInfoBtn" type="button" title="Click for details on why the trigger is/isn't armed" style="
                            display:none;width:18px;height:18px;font-size:11px;font-weight:800;
                            border:1px solid #94a3b8;border-radius:50%;cursor:pointer;
                            background:#fff;color:#475569;line-height:1;padding:0;
                        ">ⓘ</button>
                    </div>
                    <!-- Trigger-status explanation popup. Painted by
                         _refreshTriggerStatus when active; toggled by
                         the info button. Inside wheelFilters so it
                         sits naturally below the Set row. -->
                    <div id="wheelTriggerInfo" style="
                        display:none;margin-top:4px;padding:6px 8px;font-size:10px;line-height:1.4;
                        background:#fffbeb;border:1px solid #fbbf24;border-radius:4px;color:#78350f;
                    "></div>
                    </div>
                </div>
                <div id="wheelNumberLists" style="font-size:11px; padding:4px 8px; line-height:1.6;"></div>
                <div class="wheel-container" id="wheelContainer" style="position: relative; width: 400px; height: 420px; margin: 0 auto;">
                    <canvas id="wheelCanvas" width="400" height="420" style="display: block;"></canvas>
                </div>
                <div style="display:flex; justify-content:center; gap:14px; padding:4px 0; font-size:10px; color:#555;">
                    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;vertical-align:middle;"></span> Positive</span>
                    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1e293b;vertical-align:middle;"></span> Negative</span>
                    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9ca3af;vertical-align:middle;"></span> Grey</span>
                </div>
            </div>
        `;

        container.appendChild(panel);

        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Attach filter radio button listeners
        ['filter0Table', 'filter19Table', 'filterBothTables', 'filterPositive', 'filterNegative', 'filterBothSigns'].forEach(id => {
            const rb = document.getElementById(id);
            if (rb) rb.addEventListener('change', () => this._onFilterChange());
        });

        // Attach set checkbox listeners
        document.querySelectorAll('.set-cb').forEach(cb => {
            cb.addEventListener('change', () => this._onFilterChange());
        });

        this.drawWheel();

        // Strategy-Lab grey-numbers toggle (mirrored with AI panel +
        // Auto Test params). Source-of-truth: window.strategyLabIncludeGrey
        // and localStorage['strategyLab.includeGrey']. The wheel listens
        // to the shared 'strategyLabIncludeGreyChanged' event and emits
        // it on change, so toggling here also flips the AI-panel and
        // Auto Test checkboxes.
        const wheelGreyCb = document.getElementById('wheelGreyToggle');
        if (wheelGreyCb) {
            // Initial value: prefer the live global, then localStorage,
            // default to true (include grey).
            let initialVal = true;
            if (typeof window !== 'undefined' && typeof window.strategyLabIncludeGrey === 'boolean') {
                initialVal = window.strategyLabIncludeGrey;
            } else {
                try {
                    const saved = localStorage.getItem('strategyLab.includeGrey');
                    if (saved === '0') initialVal = false;
                    else if (saved === '1') initialVal = true;
                } catch (_) {}
            }
            wheelGreyCb.checked = initialVal;
            if (typeof window !== 'undefined') window.strategyLabIncludeGrey = initialVal;

            wheelGreyCb.addEventListener('change', () => {
                const v = !!wheelGreyCb.checked;
                if (typeof window !== 'undefined') {
                    window.strategyLabIncludeGrey = v;
                    if (window.autoTestRunner) window.autoTestRunner._strategyLabIncludeGrey = v;
                }
                try { localStorage.setItem('strategyLab.includeGrey', v ? '1' : '0'); } catch (_) {}
                try {
                    window.dispatchEvent(new CustomEvent('strategyLabIncludeGreyChanged', { detail: { value: v } }));
                } catch (_) {}
            });
            window.addEventListener('strategyLabIncludeGreyChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (wheelGreyCb.checked !== v) wheelGreyCb.checked = v;
            });
        }

        // T3 halfs toggle: independently selectable pair / 13opp halves
        // for Table 3. Mirrors the include-grey pattern: window global
        // (window.t3Halfs) is source of truth, persisted in
        // localStorage('strategyLab.t3Halfs'), broadcast via custom
        // event 't3HalfsChanged' so renderer-3tables and the AI panel
        // refresh their available-pair lists. Default OFF — when off,
        // T3 behaves exactly as before (no behavioural change).
        const wheelT3HalfsCb = document.getElementById('wheelT3HalfsToggle');
        if (wheelT3HalfsCb) {
            let initialT3Halfs = false;
            if (typeof window !== 'undefined' && typeof window.t3Halfs === 'boolean') {
                initialT3Halfs = window.t3Halfs;
            } else {
                try {
                    const saved = localStorage.getItem('strategyLab.t3Halfs');
                    if (saved === '1') initialT3Halfs = true;
                } catch (_) {}
            }
            wheelT3HalfsCb.checked = initialT3Halfs;
            if (typeof window !== 'undefined') window.t3Halfs = initialT3Halfs;

            wheelT3HalfsCb.addEventListener('change', () => {
                const v = !!wheelT3HalfsCb.checked;
                if (typeof window !== 'undefined') window.t3Halfs = v;
                try { localStorage.setItem('strategyLab.t3Halfs', v ? '1' : '0'); } catch (_) {}
                try {
                    window.dispatchEvent(new CustomEvent('t3HalfsChanged', { detail: { value: v } }));
                } catch (_) {}
            });
            window.addEventListener('t3HalfsChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (wheelT3HalfsCb.checked !== v) wheelT3HalfsCb.checked = v;
            });
        }

        // T1/T2 break toggle: freeze the per-spin ref auto-refresh in
        // the AI prediction panel. Same plumbing pattern as t3Halfs:
        // window.t1t2Breaks is source of truth, persisted in
        // localStorage('strategyLab.t1t2Breaks'), broadcast via
        // 't1t2BreaksChanged' so the AI panel + Auto Test UI stay
        // in sync. Default OFF — when off, the AI panel's per-spin
        // _refreshAutoPickedPairs runs exactly as before.
        const wheelT1T2BreaksCb = document.getElementById('wheelT1T2BreaksToggle');
        if (wheelT1T2BreaksCb) {
            let initialT1T2 = false;
            if (typeof window !== 'undefined' && typeof window.t1t2Breaks === 'boolean') {
                initialT1T2 = window.t1t2Breaks;
            } else {
                try {
                    const saved = localStorage.getItem('strategyLab.t1t2Breaks');
                    if (saved === '1') initialT1T2 = true;
                } catch (_) {}
            }
            wheelT1T2BreaksCb.checked = initialT1T2;
            if (typeof window !== 'undefined') window.t1t2Breaks = initialT1T2;

            wheelT1T2BreaksCb.addEventListener('change', () => {
                const v = !!wheelT1T2BreaksCb.checked;
                if (typeof window !== 'undefined') window.t1t2Breaks = v;
                try { localStorage.setItem('strategyLab.t1t2Breaks', v ? '1' : '0'); } catch (_) {}
                try {
                    window.dispatchEvent(new CustomEvent('t1t2BreaksChanged', { detail: { value: v } }));
                } catch (_) {}
            });
            window.addEventListener('t1t2BreaksChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (wheelT1T2BreaksCb.checked !== v) wheelT1T2BreaksCb.checked = v;
            });
        }

        // Same toggle: wait-for-trigger betting. Source-of-truth global
        // is window.sameMode, persisted in localStorage('strategyLab.sameMode'),
        // broadcast via 'sameModeChanged' so the Auto Test panel + money
        // panel + runner stay in sync. Default OFF — when off, every
        // code path is byte-identical to today.
        const wheelSameModeCb = document.getElementById('wheelSameModeToggle');
        if (wheelSameModeCb) {
            // Same / Wheel mode default OFF on EVERY app start regardless
            // of any previous localStorage value. Per user spec — these
            // shouldn't persist across reloads (in-session sync between
            // live ↔ auto-test still works via the broadcast events).
            const initialSame = false;
            wheelSameModeCb.checked = initialSame;
            if (typeof window !== 'undefined') window.sameMode = initialSame;
            // Wipe any prior persisted value so future re-init doesn't
            // accidentally pick it back up if this code path changes.
            try { localStorage.removeItem('strategyLab.sameMode'); } catch (_) {}

            wheelSameModeCb.addEventListener('change', () => {
                const v = !!wheelSameModeCb.checked;
                if (typeof window !== 'undefined') window.sameMode = v;
                // No localStorage write — toggle is session-only.
                try {
                    window.dispatchEvent(new CustomEvent('sameModeChanged', { detail: { value: v } }));
                } catch (_) {}
                this._refreshTriggerStatus();
            });
            window.addEventListener('sameModeChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (wheelSameModeCb.checked !== v) wheelSameModeCb.checked = v;
                this._refreshTriggerStatus();
            });
        }

        // Wheel mode toggle: derive the bet pool from the wheel's
        // Table/Sign/Set/Inverse filters applied to the full 0–36
        // universe (instead of relying on T1/T2/T3 pair predictions).
        // Same plumbing as the other live/auto-test mirrored toggles:
        // window.wheelMode is source of truth, persisted in
        // localStorage('strategyLab.wheelMode'), broadcast via
        // 'wheelModeChanged'. Default OFF — when off, pair predictions
        // drive the bet pool exactly as today.
        const wheelWheelModeCb = document.getElementById('wheelWheelModeToggle');
        if (wheelWheelModeCb) {
            // Default OFF every app start (no localStorage persistence
            // — see Same toggle above for rationale).
            const initialWheel = false;
            wheelWheelModeCb.checked = initialWheel;
            if (typeof window !== 'undefined') window.wheelMode = initialWheel;
            try { localStorage.removeItem('strategyLab.wheelMode'); } catch (_) {}

            wheelWheelModeCb.addEventListener('change', () => {
                const v = !!wheelWheelModeCb.checked;
                if (typeof window !== 'undefined') window.wheelMode = v;
                // No localStorage write — toggle is session-only.
                try {
                    window.dispatchEvent(new CustomEvent('wheelModeChanged', { detail: { value: v } }));
                } catch (_) {}
                this._refreshTriggerStatus();
                if (v) {
                    // Toggled ON: re-run filter pipeline so the wheel
                    // synthesises the universe and pushes the
                    // filtered pool to the money panel.
                    try { this._applyFilters(); } catch (_) {}
                } else {
                    // Toggled OFF: when a real pair-derived prediction
                    // exists, re-run filters so the pair path takes
                    // over again. When NO pair prediction exists, the
                    // wheel's stale synthesised pool would otherwise
                    // remain live in the money + AI panels forever
                    // (setPrediction early-returns on empty numbers).
                    // We clear those panels directly here so the bet
                    // pool collapses to nothing immediately.
                    try {
                        if (this._rawPrediction && this._rawPrediction.prediction
                            && Array.isArray(this._rawPrediction.prediction.numbers)
                            && this._rawPrediction.prediction.numbers.length > 0) {
                            this._applyFilters();
                        } else {
                            // Reset wheel visuals to no-highlight state.
                            this._updateFromRaw([], [], [], []);
                            this._updateFilteredCount(null);
                            // Wipe money panel's bet pool + Same mode
                            // memory so a stale "armed" state can't
                            // place a bet against the wheel pool that
                            // no longer applies.
                            if (window.moneyPanel) {
                                window.moneyPanel.pendingBet = null;
                                window.moneyPanel._sameLastPredictedNumbers = [];
                                if (window.moneyPanel.sessionData) {
                                    window.moneyPanel.sessionData.lastBetAmount = 0;
                                    window.moneyPanel.sessionData.lastBetNumbers = 0;
                                    // Also disarm Same mode — there's
                                    // nothing left to trigger against.
                                    window.moneyPanel.sessionData.sameArmed = false;
                                }
                                if (typeof window.moneyPanel.render === 'function') {
                                    window.moneyPanel.render();
                                }
                            }
                            // Also clear the AI panel's display so the
                            // user sees "no prediction" instead of the
                            // stale wheel pool.
                            if (window.aiPanel && typeof window.aiPanel._clearAllPredictionDisplays === 'function') {
                                try { window.aiPanel._clearAllPredictionDisplays(); } catch (_) {}
                            }
                            console.log('🧹 Wheel mode OFF → cleared synthesised bet pool (no pair prediction to fall back to)');
                        }
                    } catch (_) {}
                }
            });
            window.addEventListener('wheelModeChanged', (e) => {
                const v = !!(e && e.detail && e.detail.value);
                if (wheelWheelModeCb.checked !== v) wheelWheelModeCb.checked = v;
                this._refreshTriggerStatus();
            });
        }

        // Trigger-status pill updates: listen for armed-state changes
        // broadcast by the money panel (see _setSameArmed callers in
        // money-management-panel.js). Also do an initial refresh so
        // the pill shows its hidden/waiting state from the moment the
        // panel renders. Outside the wheelWheelModeCb block so the
        // listener still binds even if the wheel-mode checkbox is
        // somehow missing from the DOM.
        if (typeof window !== 'undefined') {
            window.addEventListener('triggerArmedChanged', () => {
                this._refreshTriggerStatus();
            });
            // Small delay so moneyPanel can finish init before our
            // first read of its sameArmed state.
            setTimeout(() => { this._refreshTriggerStatus(); }, 250);
        }

        // Wheel panel collapse/expand toggle
        const wheelToggleBtn = document.getElementById('toggleWheelPanel');
        const wheelPanelContent = panel.querySelector('.panel-content');
        if (wheelToggleBtn && wheelPanelContent) {
            wheelToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = wheelPanelContent.style.display !== 'none';
                wheelPanelContent.style.display = isVisible ? 'none' : 'block';
                wheelToggleBtn.textContent = isVisible ? '+' : '−';
            });
        }

        // Inverse button — flips the bet set on click. Active state
        // is reflected by a darker background + active class so the
        // user always knows which side of the flip they're on.
        const inverseBtn = document.getElementById('wheelInverseBtn');
        if (inverseBtn) {
            inverseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.filters.inverse = !this.filters.inverse;
                if (this.filters.inverse) {
                    inverseBtn.style.background = '#1e293b';
                    inverseBtn.style.color       = '#fde68a';
                    inverseBtn.style.borderColor = '#1e293b';
                    inverseBtn.textContent       = '⇄ Inverse ON';
                } else {
                    inverseBtn.style.background = '#f8fafc';
                    inverseBtn.style.color       = '#1e293b';
                    inverseBtn.style.borderColor = '#94a3b8';
                    inverseBtn.textContent       = '⇄ Inverse';
                }
                console.log(`⇄ Wheel inverse mode ${this.filters.inverse ? 'ON' : 'OFF'}`);
                if (this._rawPrediction) this._applyFilters();
            });
        }

        console.log('✅ Wheel visualization initialized (LEFT position)');
    }

    // ── Filter logic ──────────────────────────────────────

    _onFilterChange() {
        // Read table radio group by ID (more reliable than CSS :checked selector)
        const f0 = document.getElementById('filter0Table');
        const f19 = document.getElementById('filter19Table');
        const fBothT = document.getElementById('filterBothTables');

        if (fBothT && fBothT.checked) {
            this.filters.zeroTable = true;
            this.filters.nineteenTable = true;
        } else if (f19 && f19.checked) {
            this.filters.zeroTable = false;
            this.filters.nineteenTable = true;
        } else {
            // Default: 0 table
            this.filters.zeroTable = true;
            this.filters.nineteenTable = false;
        }

        // Read sign radio group by ID
        const fPos = document.getElementById('filterPositive');
        const fNeg = document.getElementById('filterNegative');
        const fBothS = document.getElementById('filterBothSigns');

        if (fBothS && fBothS.checked) {
            this.filters.positive = true;
            this.filters.negative = true;
        } else if (fNeg && fNeg.checked) {
            this.filters.positive = false;
            this.filters.negative = true;
        } else if (fPos && fPos.checked) {
            this.filters.positive = true;
            this.filters.negative = false;
        } else {
            // Default: both
            this.filters.positive = true;
            this.filters.negative = true;
        }

        // Read set checkboxes
        const s0 = document.getElementById('filterSet0');
        const s5 = document.getElementById('filterSet5');
        const s6 = document.getElementById('filterSet6');
        this.filters.set0 = s0 ? s0.checked : true;
        this.filters.set5 = s5 ? s5.checked : true;
        this.filters.set6 = s6 ? s6.checked : true;

        console.log('🔄 Filters changed:', this.filters);

        // Run the filter pipeline if:
        //   - there's a real pair-derived prediction to filter, OR
        //   - Wheel mode is ON (in which case _applyFilters synthesises
        //     the 0–36 universe and applies the user's Table/Sign/Set
        //     selections to it). Without this branch, ticking/unticking
        //     a Set checkbox with no pair selected would do nothing.
        const wheelModeOn = (typeof window !== 'undefined' && window.wheelMode === true);
        if (this._rawPrediction || wheelModeOn) {
            this._applyFilters();
        }
    }

    _passesFilter(num) {
        // Same as _passesFilterIgnoreInverse — the inverse flag is
        // applied later in _applyFilters by complementing the result
        // set against the universe, NOT per-number here. So this fn
        // returns the same value regardless of inverse state.
        return this._passesFilterIgnoreInverse(num);
    }

    _passesFilterIgnoreInverse(num) {
        // Table filter: number must be in at least one CHECKED table
        const inZero = ZERO_TABLE_NUMS.has(num);
        const inNineteen = NINETEEN_TABLE_NUMS.has(num);
        const tablePass = (this.filters.zeroTable && inZero) || (this.filters.nineteenTable && inNineteen);
        if (!tablePass) return false;

        // Pos/Neg filter: number must match at least one CHECKED type
        const isPos = POSITIVE_NUMS.has(num);
        const isNeg = NEGATIVE_NUMS.has(num);
        const colorPass = (this.filters.positive && isPos) || (this.filters.negative && isNeg);
        if (!colorPass) return false;

        // Set filter: number must be in at least one CHECKED set
        const allSetsOn = this.filters.set0 && this.filters.set5 && this.filters.set6;
        if (!allSetsOn) {
            const setPass = (this.filters.set0 && SET_0_NUMS.has(num)) ||
                            (this.filters.set5 && SET_5_NUMS.has(num)) ||
                            (this.filters.set6 && SET_6_NUMS.has(num));
            if (!setPass) return false;
        }

        return true;
    }

    _applyFilters() {
        let raw = this._rawPrediction;
        const wheelModeOn = (typeof window !== 'undefined' && window.wheelMode === true);

        // Wheel mode: when ON, the bet pool starts from the full 0–36
        // universe instead of pair-derived predictions. If a real
        // pair-prediction is already present we keep it (so the wheel
        // filters will intersect against it). When no pair is
        // selected and we'd normally have nothing to do, synthesise
        // a universe-prediction so the filter pipeline below produces
        // the wheel-only bet set.
        //
        // IMPORTANT: the synthesised raw is LOCAL — we deliberately do
        // NOT write it to this._rawPrediction. Caching would leak into
        // the wheelMode-OFF path (the wheel would keep producing the
        // universe-filtered bet pool even after the user unticks the
        // toggle). Each _applyFilters call re-synthesises on demand.
        if (wheelModeOn) {
            const hasPrediction = !!(raw && raw.prediction && Array.isArray(raw.prediction.numbers) && raw.prediction.numbers.length > 0);
            if (!hasPrediction) {
                const universe = [];
                for (let n = 0; n <= 36; n++) universe.push(n);
                raw = {
                    prediction: { numbers: universe, extraNumbers: [], anchors: [], loose: universe, anchor_groups: [], bet_per_number: 2 },
                    anchors: [],
                    loose: universe,
                    anchorGroups: [],
                    extraNumbers: []
                };
            }
        }

        if (!raw) return;

        const allOn = this.filters.zeroTable && this.filters.nineteenTable &&
                      this.filters.positive && this.filters.negative &&
                      this.filters.set0 && this.filters.set5 && this.filters.set6;

        if (allOn && !this.filters.inverse) {
            // No filtering needed — show everything
            // Sync money panel FIRST so _updateNumberLists reads current data
            this._syncMoneyPanel(raw.prediction);
            this._syncAIPanel(raw.prediction);
            this._updateFromRaw(raw.anchors, raw.loose, raw.anchorGroups, raw.extraNumbers);
            this._updateFilteredCount(null);
            return;
        }

        // Filter primary numbers through checked filters
        let filteredPrimary = raw.prediction.numbers.filter(n => this._passesFilter(n));
        let filteredExtra   = (raw.extraNumbers || []).filter(n => this._passesFilter(n));

        // ⇄ Inverse mode — replace the bet set with its complement on
        // the European wheel. Whatever was selected becomes deselected,
        // whatever was NOT selected becomes selected. The complement is
        // computed against the ALL-37-pockets universe but still respects
        // the table/sign/set filters above (so flipping while a sub-filter
        // is active flips only inside that sub-filter's allowed pool).
        if (this.filters.inverse) {
            const universe = (Array.isArray(this.wheelOrder) ? this.wheelOrder : [])
                .filter(n => this._passesFilterIgnoreInverse(n));
            const selectedSet = new Set(filteredPrimary);
            const extraSet    = new Set(filteredExtra);
            const newPrimary  = universe.filter(n => !selectedSet.has(n));
            // Extras don't really exist after an inverse (the "extra"
            // notion comes from the strategy's third-ref structure which
            // doesn't apply to the complement). Drop them so the bet is
            // pure complement-of-primary.
            filteredPrimary = newPrimary;
            filteredExtra   = [];
        }

        // Recalculate anchors from filtered primary
        let filteredAnchors = [], filteredLoose = [], filteredAnchorGroups = [];
        try {
            if (filteredPrimary.length > 0 && typeof window.calculateWheelAnchors === 'function') {
                const result = window.calculateWheelAnchors(filteredPrimary);
                filteredAnchors = result.anchors || [];
                filteredLoose = result.loose || [];
                filteredAnchorGroups = result.anchorGroups || [];
            } else if (filteredPrimary.length > 0) {
                // Fallback: treat all filtered numbers as loose
                filteredLoose = filteredPrimary.slice();
            }
        } catch (e) {
            console.error('⚠️ calculateWheelAnchors error, using fallback:', e.message);
            filteredLoose = filteredPrimary.slice();
        }

        // Build filtered prediction and sync ALL panels
        const filteredPrediction = {
            ...raw.prediction,
            numbers: filteredPrimary,
            extraNumbers: filteredExtra,
            anchors: filteredAnchors,
            loose: filteredLoose,
            anchor_groups: filteredAnchorGroups
        };

        // Sync money panel FIRST so _updateNumberLists reads current bet data
        this._syncMoneyPanel(filteredPrediction);
        // Sync AI panel — updates signal count + number display
        this._syncAIPanel(filteredPrediction);

        this._updateFromRaw(filteredAnchors, filteredLoose, filteredAnchorGroups, filteredExtra);
        this._updateFilteredCount(filteredPrimary.length);
    }

    _updateFilteredCount(count) {
        const el = document.getElementById('filteredCount');
        if (!el) return;
        if (count === null) {
            el.textContent = '';
        } else {
            el.textContent = `Bet: ${count} nums`;
            el.style.color = count > 0 ? '#16a34a' : '#dc2626';
        }
    }

    /**
     * Trigger-status pill (next to the Set checkboxes). Three states:
     *   - Hidden:        both Same and Wheel mode are OFF (no gate)
     *   - 🟢 TRIGGERED:  gate is ON and money panel is armed for next spin
     *   - 🔴 WAITING:    gate is ON but waiting for a spin in pool
     *
     * Reads window.moneyPanel.sessionData.sameArmed for the armed
     * flag. Safe to call when moneyPanel isn't ready yet (renders
     * the WAITING state). Idempotent.
     */
    _refreshTriggerStatus() {
        const el = document.getElementById('wheelTriggerStatus');
        const infoBtn = document.getElementById('wheelTriggerInfoBtn');
        const infoPanel = document.getElementById('wheelTriggerInfo');
        if (!el) return;
        const sameOn  = (typeof window !== 'undefined' && window.sameMode  === true);
        const wheelOn = (typeof window !== 'undefined' && window.wheelMode === true);
        const gateOn = sameOn || wheelOn;
        if (!gateOn) {
            el.style.display = 'none';
            if (infoBtn) infoBtn.style.display = 'none';
            if (infoPanel) infoPanel.style.display = 'none';
            return;
        }
        const armed = !!(window.moneyPanel
            && window.moneyPanel.sessionData
            && window.moneyPanel.sessionData.sameArmed === true);
        el.style.display = 'inline-block';
        if (armed) {
            el.textContent = '🟢 TRIGGERED';
            el.style.background    = '#16a34a';
            el.style.borderColor   = '#15803d';
            el.style.color         = '#fff';
        } else {
            el.textContent = '🔴 WAITING';
            el.style.background    = '#dc2626';
            el.style.borderColor   = '#b91c1c';
            el.style.color         = '#fff';
        }
        // Info button is visible whenever the pill is.
        if (infoBtn) infoBtn.style.display = 'inline-block';
        // If the info popup is currently open, refresh its contents
        // so the explanation reflects the latest state. Closed → no
        // need to re-paint; it'll re-paint when the user reopens it.
        if (infoPanel && infoPanel.style.display !== 'none') {
            infoPanel.innerHTML = this._buildTriggerInfoHtml({ sameOn, wheelOn, armed });
        }

        // Bind the info-button click once. Wire the toggle here (not in
        // createPanel) because the button only exists after this HTML
        // renders, and we want the wheel class to own its handlers.
        if (infoBtn && infoPanel && !infoBtn._wheelBound) {
            infoBtn._wheelBound = true;
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = (infoPanel.style.display !== 'none');
                if (isOpen) {
                    infoPanel.style.display = 'none';
                } else {
                    infoPanel.innerHTML = this._buildTriggerInfoHtml({
                        sameOn:  (window.sameMode  === true),
                        wheelOn: (window.wheelMode === true),
                        armed:   !!(window.moneyPanel && window.moneyPanel.sessionData && window.moneyPanel.sessionData.sameArmed)
                    });
                    infoPanel.style.display = 'block';
                }
            });
        }
    }

    /**
     * Build the human-readable explanation shown in the trigger-info
     * popup. Pure function of the current state — receives the
     * armed/toggle flags, reads supporting data from window.moneyPanel
     * (bet pool, last spin's actual). Safe when moneyPanel isn't
     * present (degrades to "—" placeholders).
     */
    _buildTriggerInfoHtml({ sameOn, wheelOn, armed }) {
        const mp = (typeof window !== 'undefined') ? window.moneyPanel : null;
        // Two pools to consider:
        //   nextPool    = the pool we'd bet on if armed (for the NEXT spin)
        //   triggerPool = snapshot pool used to evaluate the LAST spin
        // Effective trigger pool = triggerPool intersected with the
        // CURRENT wheel filters when Wheel mode is on. That gives the
        // user a faithful view of what would actually trigger right
        // now (covers the case where filters were changed after the
        // last spin: snapshot might be wide, but the effective gate
        // is narrower).
        const nextPool    = (mp && Array.isArray(mp._sameLastPredictedNumbers)) ? mp._sameLastPredictedNumbers : [];
        const triggerPool = (mp && Array.isArray(mp._sameTriggerPool) && mp._sameTriggerPool.length > 0)
            ? mp._sameTriggerPool
            : nextPool;
        const passesWheel = (n) => {
            if (!wheelOn) return true;
            if (typeof this._passesFilter !== 'function') return true;
            let p = this._passesFilter(n);
            if (this.filters && this.filters.inverse) p = !p;
            return p;
        };
        const effectivePool = triggerPool.filter(passesWheel);
        const spins = (typeof window !== 'undefined' && Array.isArray(window.spins)) ? window.spins : [];
        const lastSpin = (spins.length > 0)
            ? (spins[spins.length - 1] && typeof spins[spins.length - 1].actual === 'number'
                ? spins[spins.length - 1].actual
                : null)
            : null;
        const lastInTriggerPool = (lastSpin !== null) && triggerPool.includes(lastSpin);
        const lastPassesWheel  = (lastSpin !== null) && passesWheel(lastSpin);

        // Friendly text for the reason. Reads like a sentence so the
        // user can quickly understand WHY armed/waiting.
        const reasonLines = [];
        const modes = [];
        if (sameOn)  modes.push('<b>Same</b>');
        if (wheelOn) modes.push('<b>Wheel mode</b>');
        const modesText = modes.join(' + ');

        if (armed) {
            reasonLines.push(`🟢 <b>TRIGGERED</b> — ${modesText} gate is armed. The next spin will place a bet.`);
            if (lastSpin !== null) {
                if (wheelOn && !lastPassesWheel) {
                    reasonLines.push(`Why: previously armed; the last spin (<b>${lastSpin}</b>) is now outside the current wheel filters, but the trigger had already fired earlier.`);
                } else {
                    reasonLines.push(`Why: the last spin (<b>${lastSpin}</b>) was in the trigger pool AND passed the wheel filters, so the trigger fired.`);
                }
            } else {
                reasonLines.push('Why: trigger fired during the last bet (WIN re-stamp keeps the gate armed).');
            }
        } else {
            reasonLines.push(`🔴 <b>WAITING</b> — ${modesText} gate is NOT armed. No bet on the next spin.`);
            if (lastSpin === null) {
                reasonLines.push('Why: no spin has been entered yet. Add a spin that lands in the trigger pool to arm the gate.');
            } else if (triggerPool.length === 0) {
                reasonLines.push('Why: the trigger pool is empty (no pair selected and/or wheel filters drop everything). Pick a pair or adjust filters.');
            } else if (lastInTriggerPool && wheelOn && !lastPassesWheel) {
                // The pool contained the spin but the wheel filter
                // (e.g. Set 5) rejected it. Most common failure mode
                // when the user expects "trigger should also satisfy
                // wheel filters".
                reasonLines.push(`Why: the last spin (<b>${lastSpin}</b>) IS in the trigger pool but FAILED the current wheel filters (e.g. wrong Set). All conditions must pass.`);
            } else if (lastInTriggerPool) {
                // Pool contains spin AND wheel passes — but still not armed.
                // Likely just after a LOSS disarmed in the same tick.
                reasonLines.push(`Why: the last spin (<b>${lastSpin}</b>) IS in the trigger pool, but a recent LOSS disarmed the gate. The very next spin in pool will re-arm.`);
            } else {
                reasonLines.push(`Why: the last spin (<b>${lastSpin}</b>) was NOT in the trigger pool active for it, so the trigger didn't fire.`);
            }
        }

        const fmtPool = (p) => p.length === 0
            ? '<i>(empty)</i>'
            : (p.length <= 25
                ? p.slice().sort((a, b) => a - b).join(', ')
                : p.slice().sort((a, b) => a - b).slice(0, 25).join(', ') + ` … (+${p.length - 25} more)`);

        return `
            <div style="margin-bottom:4px;">${reasonLines.join('<br>')}</div>
            <div style="border-top:1px dashed #fbbf24;padding-top:4px;margin-top:4px;">
                <b>Effective trigger pool</b> (${effectivePool.length}): ${fmtPool(effectivePool)}<br>
                <b>Snapshot pool</b> for last spin (${triggerPool.length}): ${fmtPool(triggerPool)}<br>
                <b>Next bet pool</b> (${nextPool.length}): ${fmtPool(nextPool)}
            </div>
            <div style="margin-top:3px;font-size:9px;color:#92400e;">
                <b>Same</b>: ${sameOn ? 'ON' : 'OFF'} · <b>Wheel mode</b>: ${wheelOn ? 'ON' : 'OFF'} · <b>Last spin</b>: ${lastSpin === null ? '—' : lastSpin}${wheelOn && lastSpin !== null ? ' · <b>Wheel filter for last</b>: ' + (lastPassesWheel ? 'PASS' : 'FAIL') : ''}
            </div>
        `;
    }

    _syncMoneyPanel(prediction) {
        try {
            if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function') {
                window.moneyPanel.setPrediction(prediction);
                console.log(`✅ Money panel synced with ${prediction.numbers.length} filtered numbers`);
            }
        } catch (e) {
            console.warn('⚠️ Money panel sync failed:', e.message);
        }
    }

    _syncAIPanel(filteredPrediction) {
        try {
            if (window.aiPanel && typeof window.aiPanel.updateFilteredDisplay === 'function') {
                window.aiPanel.updateFilteredDisplay(filteredPrediction);
                console.log(`✅ AI panel synced with ${filteredPrediction.numbers.length} filtered numbers`);
            }
        } catch (e) {
            console.warn('⚠️ AI panel sync failed:', e.message);
        }
    }

    // ── Core update ───────────────────────────────────────

    _updateFromRaw(anchors, loose, anchorGroups, extraNumbers) {
        this.anchorGroups = anchorGroups || [];
        this.looseNumbers = loose || [];
        this.extraNumbers = extraNumbers || [];

        // Split extra numbers into anchor groups and loose
        if (this.extraNumbers.length > 0 && typeof window.calculateWheelAnchors === 'function') {
            const extraResult = window.calculateWheelAnchors(this.extraNumbers);
            this.extraAnchorGroups = extraResult.anchorGroups || [];
            this.extraLoose = extraResult.loose || [];
        } else {
            this.extraAnchorGroups = [];
            this.extraLoose = [];
        }

        // Build numberInfo map
        this.numberInfo = {};

        this.anchorGroups.forEach(ag => {
            const group = ag.group || [];
            const anchorNum = ag.anchor;
            const type = ag.type || '±1';
            group.forEach(num => {
                this.numberInfo[num] = { category: 'primary', isAnchor: (num === anchorNum), type: type };
            });
        });

        this.looseNumbers.forEach(num => {
            if (!this.numberInfo[num]) {
                this.numberInfo[num] = { category: 'primary', isAnchor: false, type: null };
            }
        });

        this.extraAnchorGroups.forEach(ag => {
            const group = ag.group || [];
            const anchorNum = ag.anchor;
            const type = ag.type || '±1';
            group.forEach(num => {
                if (!this.numberInfo[num]) {
                    this.numberInfo[num] = { category: 'grey', isAnchor: (num === anchorNum), type: type };
                }
            });
        });

        this.extraLoose.forEach(num => {
            if (!this.numberInfo[num]) {
                this.numberInfo[num] = { category: 'grey', isAnchor: false, type: null };
            }
        });

        this._updateNumberLists();
        this.drawWheel();
    }

    updateHighlights(anchors, loose, anchorGroups, extraNumbers, prediction) {
        // Collect all primary numbers from anchorGroups + loose
        const allPrimary = new Set();
        (anchorGroups || []).forEach(ag => {
            (ag.group || []).forEach(n => allPrimary.add(n));
        });
        (loose || []).forEach(n => allPrimary.add(n));

        // Store raw prediction data for re-filtering
        this._rawPrediction = {
            anchors: anchors || [],
            loose: loose || [],
            anchorGroups: anchorGroups || [],
            extraNumbers: extraNumbers || [],
            prediction: prediction || {
                numbers: Array.from(allPrimary),
                extraNumbers: extraNumbers || [],
                anchors: anchors || [],
                loose: loose || [],
                anchor_groups: anchorGroups || [],
                signal: 'BET NOW',
                confidence: 90
            }
        };

        // Ensure prediction.numbers is set
        if (!this._rawPrediction.prediction.numbers || this._rawPrediction.prediction.numbers.length === 0) {
            this._rawPrediction.prediction.numbers = Array.from(allPrimary);
        }

        // Apply current filters
        this._applyFilters();

        console.log(`🎡 Wheel highlights updated`);
    }

    drawWheel() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const centerX = 200;
        const centerY = 210;
        const outerRadius = 150;
        const innerRadius = 90;
        const numberRadius = 120;

        ctx.clearRect(0, 0, 400, 420);

        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#2c3e50';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a252f';
        ctx.fill();

        const angleStep = (2 * Math.PI) / 37;

        this.wheelOrder.forEach((num, idx) => {
            const angle = idx * angleStep - Math.PI / 2;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, outerRadius, angle, angle + angleStep);
            ctx.closePath();

            if (num === 0) {
                ctx.fillStyle = '#2ecc71';
            } else if (this.redNumbers.includes(num)) {
                ctx.fillStyle = '#e74c3c';
            } else {
                ctx.fillStyle = '#2c3e50';
            }
            ctx.fill();

            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 2;
            ctx.stroke();

            const textAngle = angle + angleStep / 2;
            const textX = centerX + Math.cos(textAngle) * numberRadius;
            const textY = centerY + Math.sin(textAngle) * numberRadius;

            ctx.save();
            ctx.translate(textX, textY);
            ctx.rotate(textAngle + Math.PI / 2);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num.toString(), 0, 0);

            ctx.restore();
        });

        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
        ctx.fillStyle = '#95a5a6';
        ctx.fill();

        if (Object.keys(this.numberInfo).length > 0) {
            this.drawHighlights();
        }
    }

    /**
     * Group an array of numbers into clusters of wheel-adjacent numbers.
     * Returns array of arrays — each sub-array is a contiguous group on the wheel.
     */
    _groupAdjacent(nums) {
        if (nums.length === 0) return [];
        const sorted = nums.slice().sort((a, b) => (this.wheelPos[a] ?? 99) - (this.wheelPos[b] ?? 99));
        const groups = [];
        let current = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prevPos = this.wheelPos[sorted[i - 1]] ?? 99;
            const currPos = this.wheelPos[sorted[i]] ?? 99;
            if (currPos === prevPos + 1) {
                current.push(sorted[i]);
            } else {
                groups.push(current);
                current = [sorted[i]];
            }
        }
        groups.push(current);
        // Also check wrap-around: if last group ends at position 36 and first starts at 0
        if (groups.length > 1) {
            const lastGroup = groups[groups.length - 1];
            const firstGroup = groups[0];
            const lastPos = this.wheelPos[lastGroup[lastGroup.length - 1]] ?? -1;
            const firstPos = this.wheelPos[firstGroup[0]] ?? 99;
            if (lastPos === 36 && firstPos === 0) {
                // Merge: last group wraps around to first
                groups[0] = lastGroup.concat(firstGroup);
                groups.pop();
            }
        }
        return groups;
    }

    /**
     * Pair numbers by regular opposites.
     * Returns: { pairs: [[a, b], ...], unpaired: [c, ...] }
     * Each pair [a, b] where REGULAR_OPPOSITES[a] === b, both present in nums.
     */
    _pairByOpposites(nums) {
        const numSet = new Set(nums);
        const used = new Set();
        const pairs = [];
        const unpaired = [];

        for (const n of nums) {
            if (used.has(n)) continue;
            const opp = WHEEL_REGULAR_OPPOSITES[n];
            // Special: 0 and 26 share opposite 10. Check both mappings.
            if (opp !== undefined && numSet.has(opp) && !used.has(opp) && opp !== n) {
                pairs.push([n, opp]);
                used.add(n);
                used.add(opp);
            } else {
                unpaired.push(n);
                used.add(n);
            }
        }
        return { pairs, unpaired };
    }

    _updateNumberLists() {
        const el = document.getElementById('wheelNumberLists');
        if (!el) return;

        const wSort = (arr) => arr.slice().sort((a, b) => (this.wheelPos[a] ?? 99) - (this.wheelPos[b] ?? 99));

        // ── Split anchor groups by type ────────────────────
        const pm2Anchors = this.anchorGroups.filter(ag => ag.type === '±2');
        const pm1Anchors = this.anchorGroups.filter(ag => ag.type === '±1');
        const pm2Nums = wSort(pm2Anchors.map(ag => ag.anchor));
        const pm1Nums = wSort(pm1Anchors.map(ag => ag.anchor));
        const looseNums = wSort([...this.looseNumbers]);

        // Grey split
        const greyPm2 = this.extraAnchorGroups.filter(ag => ag.type === '±2');
        const greyPm1 = this.extraAnchorGroups.filter(ag => ag.type === '±1');
        const greyPm2Nums = wSort(greyPm2.map(ag => ag.anchor));
        const greyPm1Nums = wSort(greyPm1.map(ag => ag.anchor));
        const greyLooseNums = wSort([...this.extraLoose]);

        // ── Anchor info lookup ─────────────────────────────
        const anchorInfo = {};
        this.anchorGroups.forEach(ag => { anchorInfo[ag.anchor] = ag; });
        const greyAnchorInfo = {};
        this.extraAnchorGroups.forEach(ag => { greyAnchorInfo[ag.anchor] = ag; });

        // ── Number badge — outlined, light tint + colored border ─
        const numBadge = (n, aInfo, isGrey) => {
            const ai = aInfo ? aInfo[n] : null;
            const label = ai ? `<sup style="font-size:8px;font-weight:700;margin-left:1px;">${ai.type}</sup>` : '';
            let border, bg, color;
            if (isGrey) {
                border = '#9ca3af'; bg = '#f9fafb'; color = '#6b7280';
            } else if (this.POSITIVE.has(n)) {
                border = '#16a34a'; bg = '#f0fdf4'; color = '#15803d';
            } else {
                border = '#334155'; bg = '#f1f5f9'; color = '#1e293b';
            }
            return `<span style="display:inline-block;padding:1px 5px;border-radius:3px;border:2px solid ${border};background:${bg};color:${color};font-weight:700;font-size:12px;">${n}${label}</span>`;
        };

        // ── Build a clean boxed section ────────────────────
        const renderBox = (title, accent, nums, aInfo, isGrey) => {
            if (nums.length === 0) return '';
            const { pairs, unpaired } = this._pairByOpposites(nums);

            let content = '';

            // Opposite pairs — clean row, ↔ marks the pair
            for (const [a, b] of pairs) {
                const posA = this.wheelPos[a] ?? -1;
                const posB = this.wheelPos[b] ?? -1;
                const adj = Math.abs(posA - posB) === 1 || (posA === 0 && posB === 36) || (posA === 36 && posB === 0);
                if (adj) {
                    const sorted = posA < posB ? [a, b] : [b, a];
                    content += `<div style="padding:2px 5px;"><span style="display:inline-flex;gap:1px;border:2px solid #000;border-radius:4px;padding:1px 2px;">${sorted.map(n => numBadge(n, aInfo, isGrey)).join('')}</span> <span style="font-size:9px;color:#64748b;">↔</span></div>`;
                } else {
                    content += `<div style="padding:2px 5px;">${numBadge(a, aInfo, isGrey)} <span style="font-size:10px;color:#64748b;">↔</span> ${numBadge(b, aInfo, isGrey)}</div>`;
                }
            }

            // Unpaired — group wheel-adjacent in black border box
            const sortedUnpaired = wSort(unpaired);
            if (sortedUnpaired.length > 0) {
                const groups = this._groupAdjacent(sortedUnpaired);
                let line = '';
                for (const group of groups) {
                    if (group.length > 1) {
                        line += `<span style="display:inline-flex;gap:1px;border:2px solid #000;border-radius:4px;padding:1px 2px;margin:1px;">${group.map(n => numBadge(n, aInfo, isGrey)).join('')}</span>`;
                    } else {
                        line += `<span style="margin:1px;">${numBadge(group[0], aInfo, isGrey)}</span>`;
                    }
                }
                content += `<div style="padding:2px 5px;">${line}</div>`;
            }

            return `<div style="min-width:0;border:1px solid ${accent};border-radius:4px;margin-bottom:3px;"><div style="padding:1px 6px;font-size:10px;font-weight:700;color:${accent};border-bottom:1px solid ${accent}25;">${title} (${nums.length})</div>${content}</div>`;
        };

        // ── Collect sections — subtle accent per type ──────
        const sections = [];
        if (pm2Nums.length > 0) sections.push(renderBox('±2 Anchors', '#7c3aed', pm2Nums, anchorInfo, false));
        if (pm1Nums.length > 0) sections.push(renderBox('±1 Anchors', '#2563eb', pm1Nums, anchorInfo, false));
        if (looseNums.length > 0) sections.push(renderBox('Loose', '#475569', looseNums, anchorInfo, false));
        if (greyPm2Nums.length > 0) sections.push(renderBox('Grey ±2', '#a8a29e', greyPm2Nums, greyAnchorInfo, true));
        if (greyPm1Nums.length > 0) sections.push(renderBox('Grey ±1', '#a8a29e', greyPm1Nums, greyAnchorInfo, true));
        if (greyLooseNums.length > 0) sections.push(renderBox('Grey Loose', '#a8a29e', greyLooseNums, greyAnchorInfo, true));

        let html = '';
        if (sections.length > 0) {
            html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 4px;align-items:start;">${sections.join('')}</div>`;
        }

        if (!html) {
            html = '<div style="color:#aaa; text-align:center;">Select pairs to see predictions</div>';
        }

        // Bet amount info from money panel
        let betInfoHTML = '';
        if (typeof window !== 'undefined' && window.moneyPanel && window.moneyPanel.sessionData) {
            const sd = window.moneyPanel.sessionData;
            if (sd.isSessionActive && sd.lastBetAmount > 0) {
                const betPerNum = sd.currentBetPerNumber || sd.lastBetAmount;
                const numCount = sd.lastBetNumbers || 0;
                const total = betPerNum * numCount;
                betInfoHTML = `<div style="margin-bottom:4px;padding:4px 8px;background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:5px;font-size:11px;font-weight:700;color:#92400e;">💰 Next Bet: $${betPerNum}/num × ${numCount} nums = $${total} total</div>`;
            }
        }

        el.innerHTML = betInfoHTML + html;
    }

    _getHighlightPos(num) {
        const centerX = 200;
        const centerY = 210;
        const highlightRadius = 165;
        const angleStep = (2 * Math.PI) / 37;

        const idx = this.wheelOrder.indexOf(num);
        if (idx === -1) return null;

        const angle = idx * angleStep - Math.PI / 2;
        const highlightAngle = angle + angleStep / 2;
        return {
            x: centerX + Math.cos(highlightAngle) * highlightRadius,
            y: centerY + Math.sin(highlightAngle) * highlightRadius
        };
    }

    drawHighlights() {
        const ctx = this.ctx;

        Object.keys(this.numberInfo).forEach(numStr => {
            const num = parseInt(numStr);
            const info = this.numberInfo[num];
            const pos = this._getHighlightPos(num);
            if (!pos) return;

            if (info.category === 'primary') {
                const isPositive = this.POSITIVE.has(num);
                const fillColor = isPositive ? '#22c55e' : '#1e293b';
                const radius = info.isAnchor ? 14 : 11;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = fillColor;
                ctx.fill();

                if (info.isAnchor && info.type) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(info.type, pos.x, pos.y);
                }
            } else {
                const radius = info.isAnchor ? 12 : 9;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = '#9ca3af';
                ctx.fill();

                if (info.isAnchor && info.type) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(info.type, pos.x, pos.y);
                }
            }
        });
    }

    clearHighlights() {
        this.anchorGroups = [];
        this.looseNumbers = [];
        this.extraNumbers = [];
        this.extraAnchorGroups = [];
        this.extraLoose = [];
        this.numberInfo = {};
        this._rawPrediction = null;

        const el = document.getElementById('wheelNumberLists');
        if (el) el.innerHTML = '';

        this._updateFilteredCount(null);

        if (this.ctx) this.drawWheel();

        // When wheel mode is ON and pairs are fully deselected, the bet
        // pool should fall back to the wheel-synthesised universe (Set/
        // Table/Sign/Inverse filters applied to 0-36). _applyFilters
        // handles that synthesis path when _rawPrediction is null.
        try {
            if (typeof window !== 'undefined' && window.wheelMode === true) {
                this._applyFilters();
            }
        } catch (_) {}
        console.log('🎡 Wheel highlights cleared');
    }
}

window.rouletteWheel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.rouletteWheel = new RouletteWheel();
        console.log('✅ Roulette Wheel ready (LEFT position)');
    }, 100);
});

console.log('✅ Roulette Wheel script loaded');
