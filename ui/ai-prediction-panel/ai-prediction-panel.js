/**
 * AI Prediction Panel - MULTI-TABLE PAIR SELECTION
 * User can select pairs from Tables 1, 2, and 3
 * Tables 1 & 2 have sub-selection for 1st/2nd/3rd ref targets
 * Finds INTERSECTION of all selected number sets (frontend computation)
 *
 * Table 1: ±1 wheel neighbors on lookup targets
 * Table 2: ±2 wheel neighbors on lookup targets
 * Table 3: uses existing anchor expansion (unchanged)
 */

// European Roulette wheel order — from 26 clockwise
const WHEEL_ORDER = [26, 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
const WHEEL_POS = {};
WHEEL_ORDER.forEach((n, i) => { WHEEL_POS[n] = i; });

// Sort numbers by European wheel position (26 clockwise)
function sortByWheel(arr) {
    return [...arr].sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
}

class AIPredictionPanel {
    constructor() {
        this.currentPrediction = null;
        this.isExpanded = true;

        // Per-table available pairs (loaded from projections)
        this.table3Pairs = [];   // [{key, display, data}]
        this.table1Pairs = [];   // [{key, display, data}]
        this.table2Pairs = [];   // [{key, display, data}]

        // Per-table selections
        // Table 3: Set of pairKeys (no sub-refs)
        // Table 1/2: { pairKey: Set<'first'|'second'|'third'> }
        this.table3Selections = new Set();
        this.table1Selections = {};
        this.table2Selections = {};

        // Backward compat aliases for table click highlighting
        this.selectedPairs = this.table3Selections;
        this.availablePairs = this.table3Pairs;
        this.table1SelectedPairs = new Set();  // For table column highlighting
        this.table2SelectedPairs = new Set();  // For table column highlighting

        // T1 auto-bet pilot — always starts OFF on every reload /
        // session per user request. In-memory only; user can flip ON
        // mid-session but it resets to OFF on next load.
        this._t1AutoBetEnabled = false;

        // Tracks which T1/T2 pair selections are still in their
        // "auto-picked" state vs. manually edited. Each entry is the
        // SET of refs the auto-pick wrote at that pair's last
        // auto-select. On every new spin, we re-run getAutoSelectedRefs
        // ONLY for pairs whose stored refs still match this snapshot
        // (= user hasn't manually toggled). If they've diverged, the
        // pair is silently demoted out of this map and left alone.
        this._autoPickedPairs = {};

        this.createPanel();
        this.setupToggle();

        // Re-fire predictions whenever the shared "include grey" toggle
        // changes from any UI (AI panel, wheel panel, Auto Test params),
        // so the merged bet + wheel + money panel update without a reload.
        if (typeof window !== 'undefined') {
            window.addEventListener('strategyLabIncludeGreyChanged', () => {
                if (typeof this.getPredictions === 'function') {
                    try { this.getPredictions(); } catch (_) { /* ignore — early state */ }
                }
            });
        }

        console.log('✅ AI Prediction Panel initialized with MULTI-TABLE PAIR SELECTION');
    }

    createPanel() {
        // === PART A: Selection Panel (in the grid row with wheel + money) ===
        const topContainer = document.querySelector('.info-panels-container-bottom');
        if (!topContainer) {
            console.error('❌ Bottom panels container not found');
            return;
        }

        const selectionPanel = document.createElement('div');
        selectionPanel.className = 'ai-selection-panel expanded';
        selectionPanel.id = 'aiSelectionPanel';
        selectionPanel.innerHTML = `
            <div class="panel-header">
                <h3>🎯 AI Prediction - Multi-Table Selection</h3>
                <button class="btn-toggle" id="toggleAIPanel">−</button>
            </div>
            <div class="panel-content" id="aiPanelContent" style="display: block;">

                <!-- TABLE 3 SELECTION -->
                <div class="table-selection-section" data-table="3">
                    <div class="table-selection-header" style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 2px solid #93c5fd; cursor: pointer; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                        📊 TABLE 3 — Anchor System (±1 neighbors)
                        <span style="float: right; font-size: 11px; color: #0369a1;">T3 Selected: <span id="t3Count">0</span></span>
                    </div>
                    <div id="table3Checkboxes" style="padding: 8px; background: white; display: none;">
                        <div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter spins to see pairs</div>
                    </div>
                </div>

                <!-- TABLE 2 SELECTION -->
                <div class="table-selection-section" data-table="2" style="margin-top: 6px;">
                    <div class="table-selection-header" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #065f46; padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 2px solid #6ee7b7; cursor: pointer; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                        📊 TABLE 2 — 18 Codes (±2 neighbors)
                        <span style="float: right; font-size: 11px; color: #065f46;">T2 Selected: <span id="t2Count">0</span></span>
                    </div>
                    <div id="table2Checkboxes" style="padding: 8px; background: white; display: none;">
                        <div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter spins to see pairs</div>
                    </div>
                </div>

                <!-- TABLE 1 SELECTION -->
                <div class="table-selection-section" data-table="1" style="margin-top: 6px;">
                    <div class="table-selection-header" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 2px solid #fbbf24; cursor: pointer; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                        📊 TABLE 1 — 10 Codes (±1 neighbors)
                        <span style="float: right; font-size: 11px; color: #92400e;">T1 Selected: <span id="t1Count">0</span></span>
                    </div>
                    <div id="table1Checkboxes" style="padding: 8px; background: white; display: none;">
                        <div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter spins to see pairs</div>
                    </div>
                </div>

                <!-- SIGNAL INDICATOR (stays in selection panel for quick feedback) -->
                <div class="prediction-status" style="margin-top: 6px;">
                    <div id="signalIndicator" class="signal-indicator signal-wait" style="
                        padding: 3px 8px;
                        border-radius: 4px;
                        background-color: #6b7280;
                        color: white;
                        font-weight: bold;
                        font-size: 11px;
                        text-align: center;
                        margin-bottom: 0;
                    ">SELECT PAIRS</div>
                </div>

                <!-- ═══ SUMMARY DASHBOARD (compact at-a-glance view) ═══ -->
                <div id="aiSummaryDashboard" style="margin-top: 10px;"></div>
            </div>
        `;

        topContainer.appendChild(selectionPanel);

        // === PART B: Results Panel (full width below, in #predictionResultsContainer) ===
        const resultsContainer = document.getElementById('predictionResultsContainer');
        if (resultsContainer) {
            const resultsPanel = document.createElement('div');
            resultsPanel.className = 'ai-results-panel';
            resultsPanel.id = 'aiResultsPanel';
            resultsPanel.innerHTML = `
                <div class="panel-content">
                    <div class="prediction-numbers" style="margin-top: 0;">
                        <div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">
                            Select pairs to see predictions
                        </div>
                    </div>

                    <div class="prediction-reasoning" style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #475569;">
                        <strong style="color: #1e293b;">HOW IT WORKS:</strong>
                        <ul style="margin: 10px 0 0 0; padding-left: 22px;">
                            <li>Select pairs from any table</li>
                            <li>System finds common numbers (intersection)</li>
                            <li>Numbers include wheel neighbors</li>
                            <li>Shows anchors and loose numbers to bet</li>
                        </ul>
                    </div>
                </div>
            `;
            resultsContainer.appendChild(resultsPanel);
        }

        console.log('✅ AI Prediction panel created (selection + results split)');

        // Seed the summary dashboard so the empty-state shell appears
        // immediately on first paint (before any spins / predictions).
        setTimeout(() => this._renderSummaryDashboard(), 50);
    }

    setupToggle() {
        const toggleBtn = document.getElementById('toggleAIPanel');
        const content = document.getElementById('aiPanelContent');
        const panel = document.getElementById('aiSelectionPanel');

        if (toggleBtn && content && panel) {
            toggleBtn.addEventListener('click', () => {
                this.isExpanded = !this.isExpanded;
                content.style.display = this.isExpanded ? 'block' : 'none';
                toggleBtn.textContent = this.isExpanded ? '−' : '+';
                panel.className = this.isExpanded ? 'ai-selection-panel expanded' : 'ai-selection-panel collapsed';
            });
        }
    }

    // ═══════════════════════════════════════════════════════
    //  LOAD AVAILABLE PAIRS FROM ALL 3 TABLES
    // ═══════════════════════════════════════════════════════

    loadAvailablePairs() {
        console.log('🔄 Loading available pairs from all tables...');

        if (typeof window.getAIDataV6 !== 'function') {
            console.error('❌ getAIDataV6 not available');
            return;
        }

        const tableData = window.getAIDataV6();
        if (!tableData) {
            console.warn('⚠️ No table data available yet');
            return;
        }

        const pairDisplayNames = {
            'ref0': '0', 'ref0_13opp': '0-13OPP',
            'ref19': '19', 'ref19_13opp': '19-13OPP',
            'prev': 'P', 'prevPlus1': 'P+1', 'prevMinus1': 'P-1',
            'prevPlus2': 'P+2', 'prevMinus2': 'P-2', 'prevPrev': 'PP',
            'prev_13opp': 'P-13OPP', 'prevPlus1_13opp': 'P+1-13OPP',
            'prevMinus1_13opp': 'P-1-13OPP', 'prevPlus2_13opp': 'P+2-13OPP',
            'prevMinus2_13opp': 'P-2-13OPP',
            // Slice 2d-2: new prevPrev-based pairs (and PP·13).
            'prevPrev_13opp':       'PP-13OPP',
            'prevPrevPlus1':        'PP+1',
            'prevPrevPlus1_13opp':  'PP+1-13OPP',
            'prevPrevMinus1':       'PP-1',
            'prevPrevMinus1_13opp': 'PP-1-13OPP',
            'prevPrevPlus2':        'PP+2',
            'prevPrevPlus2_13opp':  'PP+2-13OPP',
            'prevPrevMinus2':       'PP-2',
            'prevPrevMinus2_13opp': 'PP-2-13OPP'
        };

        // Cache for the summary dashboard so display labels stay in sync
        // with whatever loadAvailablePairs uses.
        this._summaryPairNames = pairDisplayNames;

        // Table 3
        const t3Next = tableData.table3NextProjections || {};
        this.table3Pairs = Object.keys(t3Next)
            .filter(k => t3Next[k]?.numbers?.length > 0)
            .map(k => ({ key: k, display: pairDisplayNames[k] || k, data: t3Next[k] }));

        // Keep backward compat alias
        this.availablePairs = this.table3Pairs;

        // Table 1 (hide 0-13OPP and 19-13OPP)
        const t1Next = tableData.table1NextProjections || {};
        this.table1Pairs = Object.keys(t1Next)
            .filter(k => {
                if (k === 'ref0_13opp' || k === 'ref19_13opp') return false;
                const d = t1Next[k];
                return d && (d.first?.numbers?.length > 0 || d.second?.numbers?.length > 0 || d.third?.numbers?.length > 0);
            })
            .map(k => ({ key: k, display: pairDisplayNames[k] || k, data: t1Next[k] }));

        // Slice 2d-2: T2 now displays 13OPP halves alongside their main
        // pairs (matches T1's 22-column layout). The previous "hide
        // 13OPP pairs from Table 2" filter would silently make those
        // checkboxes/clicks unavailable; removed. Same exclusion as T1
        // for ref0_13opp / ref19_13opp (those don't appear in the
        // projection data anyway).
        const t2Next = tableData.table2NextProjections || {};
        this.table2Pairs = Object.keys(t2Next)
            .filter(k => {
                if (k === 'ref0_13opp' || k === 'ref19_13opp') return false;
                const d = t2Next[k];
                return d && (d.first?.numbers?.length > 0 || d.second?.numbers?.length > 0 || d.third?.numbers?.length > 0);
            })
            .map(k => ({ key: k, display: pairDisplayNames[k] || k, data: t2Next[k] }));

        console.log(`✅ Loaded: T3=${this.table3Pairs.length}, T1=${this.table1Pairs.length}, T2=${this.table2Pairs.length} pairs`);

        this.renderAllCheckboxes();
    }

    // ═══════════════════════════════════════════════════════
    //  RENDER CHECKBOXES FOR ALL 3 TABLES
    // ═══════════════════════════════════════════════════════

    renderAllCheckboxes() {
        this._renderTable3Checkboxes();
        this._renderTable12Checkboxes('table1', this.table1Pairs, this.table1Selections);
        this._renderTable12Checkboxes('table2', this.table2Pairs, this.table2Selections);
    }

    // Alias for backward compat
    renderPairCheckboxes() {
        this.renderAllCheckboxes();
    }

    _getPairColor(pairKey) {
        // Unified color map across all 3 tables.
        // Slice 2d-2: extended for the new prevPrev-based pairs and
        // prevPrev_13opp. Each pair-group shares its color with its
        // 13OPP half so they read as a single visual family.
        const colorMap = {
            'ref0': '#dc2626', 'ref0_13opp': '#dc2626',
            'ref19': '#ea580c', 'ref19_13opp': '#ea580c',
            'prev': '#d97706', 'prev_13opp': '#d97706',
            'prevPlus1': '#16a34a', 'prevPlus1_13opp': '#16a34a',
            'prevMinus1': '#0d9488', 'prevMinus1_13opp': '#0d9488',
            'prevPlus2': '#2563eb', 'prevPlus2_13opp': '#2563eb',
            'prevMinus2': '#7c3aed', 'prevMinus2_13opp': '#7c3aed',
            'prevPrev': '#db2777', 'prevPrev_13opp': '#db2777',
            // New PP-based pair-groups (palette mirrors styles-3tables.css):
            'prevPrevPlus1':        '#be123c', 'prevPrevPlus1_13opp':  '#be123c', // rose
            'prevPrevMinus1':       '#4d7c0f', 'prevPrevMinus1_13opp': '#4d7c0f', // lime
            'prevPrevPlus2':        '#155e75', 'prevPrevPlus2_13opp':  '#155e75', // cyan
            'prevPrevMinus2':       '#3730a3', 'prevPrevMinus2_13opp': '#3730a3'  // indigo
        };
        return colorMap[pairKey] || '#64748b';
    }

    _renderTable3Checkboxes() {
        const container = document.getElementById('table3Checkboxes');
        if (!container) return;

        if (this.table3Pairs.length === 0) {
            container.innerHTML = '<div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter more spins to see pairs</div>';
            return;
        }

        container.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 4px;">` +
            this.table3Pairs.map((pair) => {
                const color = this._getPairColor(pair.key);
                const sel = this.table3Selections.has(pair.key);
                return `<label style="display:inline-flex;align-items:center;padding:4px 8px;background:${sel ? color : 'white'};color:${sel ? 'white' : '#1e293b'};border:2px solid ${color};border-radius:6px;cursor:pointer;font-weight:bold;font-size:10px;user-select:none;">
                    <input type="checkbox" value="${pair.key}" ${sel ? 'checked' : ''} class="t3-pair-cb" style="margin-right:4px;width:12px;height:12px;cursor:pointer;">
                    ${pair.display}
                </label>`;
            }).join('') + `</div>`;

        container.querySelectorAll('.t3-pair-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                this._handleTable3Selection(e.target.value, e.target.checked);
            });
        });
    }

    _renderTable12Checkboxes(tableId, pairs, selections) {
        const container = document.getElementById(`${tableId}Checkboxes`);
        if (!container) return;

        if (pairs.length === 0) {
            container.innerHTML = '<div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter more spins to see pairs</div>';
            return;
        }

        // Compact pill layout — all pairs in a single flex row
        let html = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';

        pairs.forEach((pair) => {
            const color = this._getPairColor(pair.key);
            const isSelected = !!selections[pair.key];
            html += `<label style="display:inline-flex;align-items:center;padding:3px 6px;background:${isSelected ? color : 'white'};color:${isSelected ? 'white' : '#1e293b'};border:2px solid ${color};border-radius:6px;cursor:pointer;font-weight:bold;font-size:9px;user-select:none;white-space:nowrap;">
                <input type="checkbox" ${isSelected ? 'checked' : ''} class="${tableId}-pair-cb" data-pair="${pair.key}" style="margin-right:3px;width:10px;height:10px;cursor:pointer;">
                ${pair.display}
            </label>`;
        });

        html += '</div>';

        // Sub-ref checkboxes for selected pairs (compact row below)
        const selectedPairKeys = Object.keys(selections);
        if (selectedPairKeys.length > 0) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:4px;padding-top:4px;border-top:1px dashed #e2e8f0;">';
            selectedPairKeys.forEach(pairKey => {
                const color = this._getPairColor(pairKey);
                const selectedRefs = selections[pairKey] || new Set();
                const pairObj = pairs.find(p => p.key === pairKey);
                const displayName = pairObj ? pairObj.display : pairKey;

                html += `<div style="display:inline-flex;align-items:center;gap:2px;padding:2px 5px;border:1px solid ${color};border-radius:4px;background:#f8fafc;">
                    <span style="font-size:8px;font-weight:700;color:${color};margin-right:2px;">${displayName}:</span>`;

                ['first', 'second', 'third'].forEach((ref, ri) => {
                    const refChecked = selectedRefs.has ? selectedRefs.has(ref) : false;
                    html += `<label style="display:inline-flex;align-items:center;gap:1px;font-size:8px;color:#475569;cursor:pointer;">
                        <input type="checkbox" ${refChecked ? 'checked' : ''} class="${tableId}-ref-cb" data-pair="${pairKey}" data-ref="${ref}" style="width:10px;height:10px;cursor:pointer;">
                        ${['1st', '2nd', '3rd'][ri]}
                    </label>`;
                });

                html += '</div>';
            });
            html += '</div>';
        }

        container.innerHTML = html;

        // Wire up pair toggle
        container.querySelectorAll(`.${tableId}-pair-cb`).forEach(cb => {
            cb.addEventListener('change', (e) => {
                this._handleTable12PairToggle(tableId, e.target.dataset.pair, e.target.checked);
            });
        });

        // Wire up ref checkboxes
        container.querySelectorAll(`.${tableId}-ref-cb`).forEach(cb => {
            cb.addEventListener('change', (e) => {
                this._handleRefSelection(tableId, e.target.dataset.pair, e.target.dataset.ref, e.target.checked);
            });
        });
    }

    // ═══════════════════════════════════════════════════════
    //  SELECTION HANDLERS
    // ═══════════════════════════════════════════════════════

    _handleTable3Selection(pairKey, isChecked) {
        if (isChecked) {
            this.table3Selections.add(pairKey);
        } else {
            this.table3Selections.delete(pairKey);
        }

        this._renderTable3Checkboxes();
        this.updateTable3Highlights();
        this._updateCounts();
        this._autoTriggerPredictions();
    }

    // Keep backward compat for table click highlighting
    handlePairSelection(pairKey, isChecked) {
        this._handleTable3Selection(pairKey, isChecked);
    }

    _handleTable12PairToggle(tableId, pairKey, isChecked) {
        const selections = tableId === 'table1' ? this.table1Selections : this.table2Selections;
        const highlightSet = tableId === 'table1' ? this.table1SelectedPairs : this.table2SelectedPairs;

        if (isChecked) {
            // Auto-select the 2 refs that hit most recently.
            //
            // ── User-spec change ───────────────────────────────────
            // T1's auto-pick now MIRRORS T2's logic:
            //   - When the user ticks a T1 pair, we run getAutoSelectedRefs
            //     with tableId='table2' so the broader T2 valid-codes
            //     list (S+0, SL/SR ±1 ±2, O+0, OL/OR ±1 ±2) is used to
            //     find the 2 most-recent column hits in spin history.
            //   - The 2 picks must be in DIFFERENT columns; this is
            //     already enforced by `foundRefs.includes(refKey)`
            //     inside getAutoSelectedRefs (a column once picked is
            //     never picked again, so the walk-back keeps going
            //     until a new column hits).
            //   - For *_13opp pairs the same call applies — the helper
            //     already swaps in DIGIT_13_OPPOSITES[refNum] for the
            //     lookup, regardless of which valid-codes list is used.
            // T2 keeps its own logic (still passes 'table2' here).
            const lookupTable = (tableId === 'table1') ? 'table2' : tableId;
            if (!this._extraRefs) this._extraRefs = {};
            if (!this._autoPickedPairs) this._autoPickedPairs = {};
            if (window.getAutoSelectedRefs && window.spins && window.spins.length >= 2) {
                const autoRefs = window.getAutoSelectedRefs(pairKey, lookupTable);
                selections[pairKey] = new Set(autoRefs.primaryRefs);
                this._extraRefs[`${tableId}:${pairKey}`] = autoRefs.extraRef;
                // Snapshot the auto-pick result so the per-spin refresh
                // (_refreshAutoPickedPairs) can detect manual edits and
                // skip them.
                this._autoPickedPairs[`${tableId}:${pairKey}`] = new Set(autoRefs.primaryRefs);
                console.log(`✅ Auto-selected refs for ${pairKey} (${tableId}, codes from ${lookupTable}): primary=[${[...autoRefs.primaryRefs].join(',')}], extra=${autoRefs.extraRef}`);
            } else {
                // Fallback: select all 3 if not enough history
                selections[pairKey] = new Set(['first', 'second', 'third']);
                this._extraRefs[`${tableId}:${pairKey}`] = null;
            }
            highlightSet.add(pairKey);
        } else {
            delete selections[pairKey];
            highlightSet.delete(pairKey);
            if (this._extraRefs) delete this._extraRefs[`${tableId}:${pairKey}`];
            if (this._autoPickedPairs) delete this._autoPickedPairs[`${tableId}:${pairKey}`];
        }

        const pairs = tableId === 'table1' ? this.table1Pairs : this.table2Pairs;
        this._renderTable12Checkboxes(tableId, pairs, selections);
        this.updateSingleTableHighlights(tableId, highlightSet);
        this._updateCounts();
        this._autoTriggerPredictions();
        // T1 auto-bet pilot — re-evaluate immediately so selecting /
        // unselecting a T1 pair flips the START / PAUSE button
        // without waiting for the next spin.
        if (tableId === 'table1') {
            try { this._applyT1AutoBetStatus(); } catch (e) { console.warn(e); }
        }
    }

    _handleRefSelection(tableId, pairKey, refKey, isChecked) {
        const selections = tableId === 'table1' ? this.table1Selections : this.table2Selections;
        const highlightSet = tableId === 'table1' ? this.table1SelectedPairs : this.table2SelectedPairs;

        if (!selections[pairKey]) {
            selections[pairKey] = new Set();
        }

        if (isChecked) {
            selections[pairKey].add(refKey);
        } else {
            selections[pairKey].delete(refKey);
            // If no refs selected, remove pair entirely
            if (selections[pairKey].size === 0) {
                delete selections[pairKey];
                highlightSet.delete(pairKey);
            }
        }

        // User manually edited the refs → demote this pair from
        // "auto-picked" so the per-spin refresh leaves it alone.
        if (this._autoPickedPairs) {
            delete this._autoPickedPairs[`${tableId}:${pairKey}`];
        }

        const pairs = tableId === 'table1' ? this.table1Pairs : this.table2Pairs;
        this._renderTable12Checkboxes(tableId, pairs, selections);
        this.updateSingleTableHighlights(tableId, highlightSet);
        this._updateCounts();
        this._autoTriggerPredictions();
    }

    _getTotalSelectionCount() {
        return this.table3Selections.size +
            Object.keys(this.table1Selections).length +
            Object.keys(this.table2Selections).length;
    }

    _updateCounts() {
        const t3 = document.getElementById('t3Count');
        const t1 = document.getElementById('t1Count');
        const t2 = document.getElementById('t2Count');
        if (t3) t3.textContent = this.table3Selections.size;
        if (t1) t1.textContent = Object.keys(this.table1Selections).length;
        if (t2) t2.textContent = Object.keys(this.table2Selections).length;

        // Also update old selectedCount for compat
        const countSpan = document.getElementById('selectedCount');
        if (countSpan) countSpan.textContent = this._getTotalSelectionCount();

        // Refresh the summary dashboard whenever counts change.
        if (typeof this._renderSummaryDashboard === 'function') {
            this._renderSummaryDashboard();
        }
    }

    _autoTriggerPredictions() {
        if (this._predictionDebounce) {
            clearTimeout(this._predictionDebounce);
        }

        const total = this._getTotalSelectionCount();
        if (total >= 1) {
            this._predictionDebounce = setTimeout(() => {
                this.getPredictions();
            }, 800);
        } else {
            this._clearAllPredictionDisplays();
        }
    }

    // ═══════════════════════════════════════════════════════
    //  TABLE CLICK HIGHLIGHTING (independent per table)
    // ═══════════════════════════════════════════════════════

    togglePairFromTable(pairKey, tableId) {
        if (tableId === 'table3') {
            const isAvailable = this.table3Pairs.some(p => p.key === pairKey);
            if (!isAvailable) {
                console.warn(`⚠️ Pair ${pairKey} not available yet (need more spins)`);
                return;
            }
            const isCurrentlySelected = this.table3Selections.has(pairKey);
            this._handleTable3Selection(pairKey, !isCurrentlySelected);
        } else if (tableId === 'table1' || tableId === 'table2') {
            const pairs = tableId === 'table1' ? this.table1Pairs : this.table2Pairs;
            const isAvailable = pairs.some(p => p.key === pairKey);
            if (!isAvailable) {
                console.warn(`⚠️ Pair ${pairKey} not available in ${tableId} yet`);
                return;
            }
            const highlightSet = tableId === 'table1' ? this.table1SelectedPairs : this.table2SelectedPairs;
            const isCurrentlySelected = highlightSet.has(pairKey);
            // Delegate to the shared handler which does auto-ref selection
            this._handleTable12PairToggle(tableId, pairKey, !isCurrentlySelected);
        }
    }

    updateSingleTableHighlights(tableId, selectedSet) {
        const table = document.getElementById(tableId);
        if (!table) return;

        table.querySelectorAll('.t3-pair-selected').forEach(el => {
            el.classList.remove('t3-pair-selected');
        });

        selectedSet.forEach(pairKey => {
            table.querySelectorAll(`[data-pair="${pairKey}"]`).forEach(el => {
                el.classList.add('t3-pair-selected');
            });
        });
    }

    updateTable3Highlights() {
        this.updateSingleTableHighlights('table1', this.table1SelectedPairs);
        this.updateSingleTableHighlights('table2', this.table2SelectedPairs);
        this.updateSingleTableHighlights('table3', this.table3Selections);
    }

    // ═══════════════════════════════════════════════════════
    //  CLEAR SELECTIONS
    // ═══════════════════════════════════════════════════════

    clearSelections() {
        // Cancel any pending prediction debounce
        if (this._predictionDebounce) {
            clearTimeout(this._predictionDebounce);
            this._predictionDebounce = null;
        }

        this.table3Selections.clear();
        this.table1Selections = {};
        this.table2Selections = {};
        this.table1SelectedPairs.clear();
        this.table2SelectedPairs.clear();
        this._extraRefs = {};

        this._updateCounts();
        this.renderAllCheckboxes();
        this._clearAllPredictionDisplays();
        this.updateTable3Highlights();

        console.log('🔄 Cleared all selections');
    }

    // ═══════════════════════════════════════════════════════
    //  SELECTION-PROCESS POPUP — research view that visualises
    //  every layer (T1 / T2-pair / T2-13opp / T3 / final) on a
    //  shared European wheel + a wheel-order stacked-rows grid.
    //  Opens in its own browser window so the user can drag it to
    //  a second screen. Reads live data from the panel via
    //  window.opener.aiPanel; Apply pushes pair changes back into
    //  the main T1/T2/T3 selections.
    // ═══════════════════════════════════════════════════════

    _getSelectionProcessSnapshot() {
        const t1Pairs = this.table1Pairs || [];
        const t2Pairs = this.table2Pairs || [];
        const t3Pairs = this.table3Pairs || [];
        const buildT12 = (sels, pairs) => {
            const out = {};
            Object.keys(sels || {}).forEach(pk => {
                const p = pairs.find(x => x.key === pk);
                if (!p) return;
                const refs = sels[pk] || new Set();
                const primary = new Set();
                const grey    = new Set();
                ['first','second','third'].forEach(r => {
                    const nums = (p.data && p.data[r] && Array.isArray(p.data[r].numbers)) ? p.data[r].numbers : [];
                    if (refs.has(r)) nums.forEach(n => primary.add(n));
                    else             nums.forEach(n => grey.add(n));
                });
                out[pk] = { display: p.display, primary: [...primary], grey: [...grey] };
            });
            return out;
        };
        const t1 = buildT12(this.table1Selections, t1Pairs);
        const t2pair = {};
        const t2opp  = {};
        Object.keys(this.table2Selections || {}).forEach(pk => {
            const p = t2Pairs.find(x => x.key === pk);
            if (!p) return;
            const refs = this.table2Selections[pk] || new Set();
            const primary = new Set();
            const grey    = new Set();
            ['first','second','third'].forEach(r => {
                const nums = (p.data && p.data[r] && Array.isArray(p.data[r].numbers)) ? p.data[r].numbers : [];
                if (refs.has(r)) nums.forEach(n => primary.add(n));
                else             nums.forEach(n => grey.add(n));
            });
            const target = pk.endsWith('_13opp') ? t2opp : t2pair;
            target[pk] = { display: p.display, primary: [...primary], grey: [...grey] };
        });
        const t3 = {};
        (this.table3Selections || new Set()).forEach(pk => {
            const p = t3Pairs.find(x => x.key === pk);
            if (!p) return;
            t3[pk] = {
                display: p.display,
                primary: (p.data && Array.isArray(p.data.numbers)) ? p.data.numbers : [],
                grey: []
            };
        });
        const pred = this.currentPrediction || {};
        return {
            t1, t2pair, t2opp, t3,
            finalPrimary: Array.isArray(pred.numbers) ? pred.numbers : [],
            finalGrey:    Array.isArray(pred.extraNumbers) ? pred.extraNumbers : [],
            available: {
                t1: t1Pairs.map(p => ({ key: p.key, display: p.display })),
                t2: t2Pairs.map(p => ({ key: p.key, display: p.display })),
                t3: t3Pairs.map(p => ({ key: p.key, display: p.display }))
            },
            current: {
                t1: Object.keys(this.table1Selections || {}),
                t2: Object.keys(this.table2Selections || {}),
                t3: [...(this.table3Selections || new Set())]
            }
        };
    }

    _applySelectionProcessChanges(payload) {
        try {
            const want = (arr) => new Set(Array.isArray(arr) ? arr : []);
            const wantT1 = want(payload && payload.t1);
            const wantT2 = want(payload && payload.t2);
            const wantT3 = want(payload && payload.t3);

            const cur3 = new Set(this.table3Selections || []);
            cur3.forEach(k => { if (!wantT3.has(k)) this._handleTable3Selection(k, false); });
            wantT3.forEach(k => { if (!cur3.has(k)) this._handleTable3Selection(k, true); });

            const cur1 = new Set(Object.keys(this.table1Selections || {}));
            cur1.forEach(k => { if (!wantT1.has(k)) this._handleTable12PairToggle('table1', k, false); });
            wantT1.forEach(k => { if (!cur1.has(k)) this._handleTable12PairToggle('table1', k, true); });

            const cur2 = new Set(Object.keys(this.table2Selections || {}));
            cur2.forEach(k => { if (!wantT2.has(k)) this._handleTable12PairToggle('table2', k, false); });
            wantT2.forEach(k => { if (!cur2.has(k)) this._handleTable12PairToggle('table2', k, true); });

            return { ok: true };
        } catch (e) {
            console.warn('Apply selection-process changes failed:', e);
            return { ok: false, error: String(e) };
        }
    }

    _getLiveWheelSnapshot() {
        try {
            const c = document.getElementById('wheelCanvas');
            if (c && typeof c.toDataURL === 'function') return c.toDataURL('image/png');
        } catch (_) { /* canvas tainted? best-effort */ }
        return null;
    }

    _openSelectionProcessPopup() {
        if (this._selectionProcessWin && !this._selectionProcessWin.closed) {
            this._selectionProcessWin.focus();
            return;
        }
        const w = window.open('', 'aiSelectionProcess',
            'width=820,height=940,resizable=yes,scrollbars=yes');
        if (!w) {
            alert('Popup blocked — please allow popups for this site.');
            return;
        }
        this._selectionProcessWin = w;
        try { w._opener_panel = this; } catch (_) { /* cross-origin guard */ }
        w.document.open();
        w.document.write(this._buildSelectionProcessHTML());
        w.document.close();
    }

    _buildSelectionProcessHTML() {
        return `<!doctype html>
<html><head><meta charset="utf-8"><title>Selection Process</title>
<style>
  body { font-family: system-ui,-apple-system,sans-serif; margin: 0; padding: 12px; background: #f1f5f9; color: #1e293b; }
  h1 { font-size: 14px; margin: 0 0 8px 0; color: #0c4a6e; }
  h2 { font-size: 11px; margin: 0 0 6px 0; color: #475569; letter-spacing: .5px; text-transform: uppercase; }
  .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
  label { font-size: 11px; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px; cursor: pointer; }
  button { font-family: inherit; font-size: 11px; padding: 4px 10px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  button.primary { background: #0ea5e9; color: white; border-color: #0284c7; }
  button.warn { background: #f59e0b; color: white; border-color: #d97706; }
  .legend { display: flex; gap: 10px; font-size: 10px; flex-wrap: wrap; }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .swatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1px solid #475569; }
  .pair-pick { display: inline-block; margin: 2px 3px; padding: 2px 6px; border-radius: 3px; background: #e2e8f0; cursor: pointer; font-size: 10px; user-select: none; border: 1px solid transparent; }
  .pair-pick.on { background: #16a34a; color: white; border-color: #15803d; }
  .anchor-list { font-size: 10px; padding: 4px; background: #f8fafc; border-radius: 3px; min-height: 20px; }
  .anchor-list .a { display: inline-block; margin: 1px 3px; padding: 1px 5px; background: #f97316; color: white; border-radius: 3px; }
  .anchor-list .a span { cursor: pointer; margin-left: 4px; opacity: .7; }
  .timestamp { font-size: 10px; color: #64748b; margin-left: auto; }
  .status { font-size: 10px; color: #16a34a; }
  .status.err { color: #dc2626; }
  svg { display: block; }
</style></head>
<body>
<div style="display:flex;align-items:center;">
  <h1>🔬 Selection Process — wheel visualization</h1>
  <span class="timestamp" id="ts">—</span>
</div>

<div class="card">
  <h2>Layout mode</h2>
  <label><input type="radio" name="layoutMode" value="rows" checked> Stacked rows (wheel-order grid below)</label>
  <label><input type="radio" name="layoutMode" value="rings"> Concentric rings (around the wheel)</label>
</div>

<div class="card">
  <h2>Wheel <span style="font-size:9px;color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0;">(live snapshot from main panel)</span></h2>
  <div id="wheelHost" style="text-align:center;overflow:visible;"></div>
  <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;align-items:center;">
    <div>
      <div style="font-size:9px;color:#475569;font-weight:700;margin-bottom:2px;">RING ORDER (inner → outer):</div>
      <div class="legend" id="ringLegend"></div>
    </div>
    <div>
      <div style="font-size:9px;color:#475569;font-weight:700;margin-bottom:2px;">CELL FILL:</div>
      <div class="legend">
        <span><span class="swatch" style="background:#dc2626;"></span>red</span>
        <span><span class="swatch" style="background:#1f2937;"></span>black</span>
        <span><span class="swatch" style="background:#16a34a;"></span>0/green</span>
        <span><span class="swatch" style="background:#cbd5e1;border-style:dashed;"></span>grey (3rd-ref)</span>
        <span><span class="swatch" style="background:#f97316;border:2px solid #c2410c;"></span>research</span>
      </div>
    </div>
  </div>
</div>

<div class="card" id="rowsCard" style="display:none;">
  <h2>Stacked rows (bottom → top, wheel-order: 26 → 3)</h2>
  <div id="rowsHost"></div>
</div>

<div class="card">
  <h2>Pair selections (popup-local — Apply to push back)</h2>
  <div style="font-size:10px;color:#64748b;margin-bottom:4px;">Click a pair to toggle. Multiple pairs per table allowed.</div>
  <div style="margin-bottom:4px;"><strong style="font-size:10px;color:#92400e;">T1:</strong> <div id="pickT1" style="display:inline-block;"></div></div>
  <div style="margin-bottom:4px;"><strong style="font-size:10px;color:#065f46;">T2:</strong> <div id="pickT2" style="display:inline-block;"></div></div>
  <div style="margin-bottom:4px;"><strong style="font-size:10px;color:#1e40af;">T3:</strong> <div id="pickT3" style="display:inline-block;"></div></div>
  <div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
    <button id="btnApply" class="primary">Apply to main panel</button>
    <button id="btnRevert">Revert to current</button>
    <span class="status" id="applyStatus"></span>
  </div>
</div>

<div class="card">
  <h2>Manual anchors — research mode</h2>
  <div style="font-size:10px;color:#64748b;margin-bottom:4px;">Numbers added here appear as orange RESEARCH markers on the wheel and as a top RESEARCH row in stacked-rows mode. Doesn't touch the main panel.</div>
  <div style="display:flex;gap:4px;align-items:center;font-size:11px;flex-wrap:wrap;">
    <input id="anchorNum" type="number" min="0" max="36" placeholder="0–36" style="width:70px;padding:2px 4px;font-size:11px;">
    <button id="anchorAdd">Add</button>
    <label style="margin-left:8px;"><input type="checkbox" id="anchorActive" checked> show on wheel/rows</label>
    <button id="anchorClear" class="warn" style="margin-left:auto;">Clear all</button>
  </div>
  <div class="anchor-list" id="anchorList"></div>
</div>

<script>
(function(){
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const WHEEL_FROM_26 = [26,0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3];
  const colorOf = (n) => n === 0 ? '#16a34a' : (RED.has(n) ? '#dc2626' : '#1f2937');

  const LAYERS = [
    { id:'t1',     label:'T1',          stroke:'#fbbf24' },
    { id:'t2pair', label:'T2 pair',     stroke:'#34d399' },
    { id:'t2opp',  label:'T2 ·13',      stroke:'#10b981' },
    { id:'t3',     label:'T3',          stroke:'#60a5fa' },
    { id:'final',  label:'FINAL',       stroke:'#a855f7' }
  ];

  let state = {
    snap: null,
    wheelImg: null,
    mode: 'rows',
    picked: { t1: new Set(), t2: new Set(), t3: new Set() },
    pickedInitialized: false,
    anchors: [],
    anchorsActive: true
  };

  function pullSnapshot() {
    try {
      const op = window.opener;
      if (!op || !op.aiPanel || typeof op.aiPanel._getSelectionProcessSnapshot !== 'function') {
        document.getElementById('ts').textContent = 'opener unavailable';
        return;
      }
      const snap = op.aiPanel._getSelectionProcessSnapshot();
      state.snap = snap;
      if (typeof op.aiPanel._getLiveWheelSnapshot === 'function') {
        state.wheelImg = op.aiPanel._getLiveWheelSnapshot();
      }
      if (!state.pickedInitialized) {
        state.picked.t1 = new Set(snap.current.t1);
        state.picked.t2 = new Set(snap.current.t2);
        state.picked.t3 = new Set(snap.current.t3);
        state.pickedInitialized = true;
      }
      document.getElementById('ts').textContent = 'updated ' + new Date().toLocaleTimeString();
      render();
    } catch (e) {
      document.getElementById('ts').textContent = 'pull error';
      console.warn(e);
    }
  }
  setInterval(pullSnapshot, 1500);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const segCount = 37;
  const segAngle = 360 / segCount;

  function polar(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  function arcPath(cx, cy, rOuter, rInner, startDeg, endDeg) {
    const [x1,y1] = polar(cx,cy,rOuter,startDeg);
    const [x2,y2] = polar(cx,cy,rOuter,endDeg);
    const [x3,y3] = polar(cx,cy,rInner,endDeg);
    const [x4,y4] = polar(cx,cy,rInner,startDeg);
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return ['M',x1,y1,'A',rOuter,rOuter,0,large,1,x2,y2,'L',x3,y3,'A',rInner,rInner,0,large,0,x4,y4,'Z'].join(' ');
  }

  function computeLayerData(snap) {
    const merge = (group) => {
      const p = new Set(), g = new Set();
      Object.values(group || {}).forEach(v => {
        (v.primary || []).forEach(n => p.add(n));
        (v.grey    || []).forEach(n => g.add(n));
      });
      return { primary: p, grey: g };
    };
    return {
      t1:     merge(snap.t1),
      t2pair: merge(snap.t2pair),
      t2opp:  merge(snap.t2opp),
      t3:     merge(snap.t3),
      final:  { primary: new Set(snap.finalPrimary || []), grey: new Set(snap.finalGrey || []) }
    };
  }

  function buildWheelView() {
    const wrap = document.createElement('div');
    const isRings = (state.mode === 'rings' && state.snap);
    const boxSize = isRings ? 640 : 420;
    wrap.style.cssText = 'position:relative;display:inline-block;width:'+boxSize+'px;height:'+boxSize+'px;';

    const img = document.createElement('img');
    img.width = 400; img.height = 420;
    img.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:block;';
    if (state.wheelImg) img.src = state.wheelImg;
    else { img.alt = 'wheel snapshot unavailable (toggle the wheel panel and retry)'; img.style.minHeight = '420px'; img.style.background = '#f1f5f9'; }
    wrap.appendChild(img);

    if (isRings) {
      const svgSize = boxSize;
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', svgSize);
      svg.setAttribute('height', svgSize);
      svg.setAttribute('viewBox', '0 0 ' + svgSize + ' ' + svgSize);
      svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
      const cxL = svgSize/2, cyL = svgSize/2;
      const wheelFaceR = 185;
      const ringW = 20;
      const layerData = computeLayerData(state.snap);
      const layersToDraw = LAYERS.slice();
      if (state.anchorsActive && state.anchors.length) {
        layersToDraw.push({ id:'research', label:'RESEARCH', stroke:'#c2410c' });
        layerData.research = { primary: new Set(state.anchors), grey: new Set() };
      }
      layersToDraw.forEach((layer, idx) => {
        const data = layerData[layer.id];
        if (!data) return;
        const rIn  = wheelFaceR + idx * ringW;
        const rOut = wheelFaceR + (idx+1) * ringW;
        WHEEL.forEach((n, i) => {
          const start = i * segAngle - 90;
          const end   = (i + 1) * segAngle - 90;
          const isPrimary = data.primary.has(n);
          const isGrey    = data.grey.has(n);
          if (!isPrimary && !isGrey) return;
          const path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', arcPath(cxL,cyL,rOut,rIn,start,end));
          let fill;
          if (layer.id === 'research') fill = '#f97316';
          else if (isPrimary)          fill = colorOf(n);
          else                         fill = '#cbd5e1';
          path.setAttribute('fill', fill);
          path.setAttribute('opacity', layer.id === 'research' ? '0.95' : '0.85');
          path.setAttribute('stroke', layer.stroke);
          path.setAttribute('stroke-width', layer.id === 'research' ? '2' : '1');
          if (isGrey && layer.id !== 'research') path.setAttribute('stroke-dasharray', '2,2');
          svg.appendChild(path);
        });
        // Side label tab on the EAST side of each ring, fanned slightly.
        const labelAngle = 90 + (idx - (layersToDraw.length-1)/2) * 6;
        const [tx, ty] = polar(cxL, cyL, rOut + 8, labelAngle);
        const tag = document.createElementNS(SVG_NS, 'g');
        const rect = document.createElementNS(SVG_NS, 'rect');
        const w = 70, h = 16;
        rect.setAttribute('x', tx);
        rect.setAttribute('y', ty - h/2);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('rx', 3);
        rect.setAttribute('fill', layer.stroke);
        rect.setAttribute('opacity', '0.95');
        tag.appendChild(rect);
        const lbl = document.createElementNS(SVG_NS, 'text');
        lbl.setAttribute('x', tx + w/2);
        lbl.setAttribute('y', ty + 4);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '10');
        lbl.setAttribute('fill', '#fff');
        lbl.setAttribute('font-weight', '700');
        lbl.textContent = layer.label;
        tag.appendChild(lbl);
        svg.appendChild(tag);
      });
      wrap.appendChild(svg);
    }
    return wrap;
  }

  function buildStackedRows() {
    const host = document.createElement('div');
    if (!state.snap) return host;
    const data = computeLayerData(state.snap);
    const researchSet = (state.anchorsActive && state.anchors.length) ? new Set(state.anchors) : null;
    const rowOrder = [];
    if (researchSet) rowOrder.push({ id:'research', label:'RESEARCH', accent:'#c2410c', bg:'#ffedd5', primary: researchSet, grey: new Set() });
    rowOrder.push(
      { id:'final',  label:'FINAL DECISION', accent:'#a855f7', bg:'#faf5ff', primary: data.final.primary,  grey: data.final.grey },
      { id:'t3',     label:'T3',             accent:'#60a5fa', bg:'#dbeafe', primary: data.t3.primary,     grey: data.t3.grey },
      { id:'t2opp',  label:'T2 ·13opp',      accent:'#10b981', bg:'#d1fae5', primary: data.t2opp.primary,  grey: data.t2opp.grey },
      { id:'t2pair', label:'T2 pair',        accent:'#34d399', bg:'#ecfdf5', primary: data.t2pair.primary, grey: data.t2pair.grey },
      { id:'t1',     label:'T1',             accent:'#fbbf24', bg:'#fef3c7', primary: data.t1.primary,     grey: data.t1.grey }
    );

    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:grid;grid-template-columns:120px repeat(37, 1fr);gap:2px;align-items:center;padding:2px 4px 4px;font-size:9px;color:#64748b;';
    const headerLbl = document.createElement('span');
    headerLbl.textContent = 'wheel slot →';
    headerLbl.style.cssText = 'font-weight:700;text-align:right;padding-right:6px;';
    headerRow.appendChild(headerLbl);
    WHEEL_FROM_26.forEach(n => {
      const cell = document.createElement('span');
      cell.textContent = n;
      cell.style.cssText = 'text-align:center;font-weight:600;color:#94a3b8;';
      headerRow.appendChild(cell);
    });
    host.appendChild(headerRow);

    rowOrder.forEach(row => {
      const all = new Set([...row.primary, ...row.grey]);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:120px repeat(37, 1fr);gap:2px;align-items:center;padding:4px;margin-bottom:3px;background:'+row.bg+';border-left:4px solid '+row.accent+';border-radius:0 4px 4px 0;';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-weight:700;font-size:11px;color:'+row.accent+';text-align:right;padding-right:6px;';
      lbl.textContent = row.label + ' (' + all.size + ')';
      grid.appendChild(lbl);
      WHEEL_FROM_26.forEach(n => {
        const cell = document.createElement('span');
        cell.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;height:20px;border-radius:50%;font-weight:700;font-size:9px;';
        const isResearch = row.id === 'research' && researchSet && researchSet.has(n);
        if (isResearch) {
          cell.style.background = '#f97316'; cell.style.color = '#fff';
          cell.style.border = '2px solid #c2410c'; cell.textContent = n;
        } else if (row.primary.has(n)) {
          cell.style.background = colorOf(n); cell.style.color = '#fff';
          cell.style.border = '1px solid rgba(0,0,0,.2)'; cell.textContent = n;
          if (researchSet && researchSet.has(n)) cell.style.boxShadow = '0 0 0 2px #f97316';
        } else if (row.grey.has(n)) {
          cell.style.background = '#cbd5e1'; cell.style.color = '#1f2937';
          cell.style.border = '1px dashed #64748b'; cell.textContent = n;
          if (researchSet && researchSet.has(n)) cell.style.boxShadow = '0 0 0 2px #f97316';
        } else {
          cell.style.background = 'transparent';
          cell.style.border = '1px dashed #e2e8f0';
          cell.textContent = '';
        }
        grid.appendChild(cell);
      });
      host.appendChild(grid);
    });
    return host;
  }

  function renderRingLegend() {
    const host = document.getElementById('ringLegend');
    if (!host) return;
    const items = LAYERS.slice();
    if (state.anchorsActive && state.anchors.length) items.push({ id:'research', label:'RESEARCH', stroke:'#c2410c' });
    host.innerHTML = '';
    items.forEach((l, i) => {
      const span = document.createElement('span');
      span.innerHTML = '<span class="swatch" style="background:' + l.stroke + ';border-color:' + l.stroke + ';"></span>' +
                       '<strong style="font-weight:700;color:' + l.stroke + ';">' + (i+1) + '. ' + l.label + '</strong>';
      host.appendChild(span);
    });
  }

  function renderPickers() {
    const snap = state.snap;
    if (!snap) return;
    const buildList = (id, all, picked) => {
      const host = document.getElementById(id);
      host.innerHTML = '';
      all.forEach(p => {
        const el = document.createElement('span');
        el.className = 'pair-pick' + (picked.has(p.key) ? ' on' : '');
        el.textContent = p.display;
        el.title = p.key;
        el.addEventListener('click', () => {
          if (picked.has(p.key)) picked.delete(p.key);
          else                   picked.add(p.key);
          renderPickers();
        });
        host.appendChild(el);
      });
    };
    buildList('pickT1', snap.available.t1, state.picked.t1);
    buildList('pickT2', snap.available.t2, state.picked.t2);
    buildList('pickT3', snap.available.t3, state.picked.t3);
  }

  function renderAnchors() {
    const host = document.getElementById('anchorList');
    if (state.anchors.length === 0) { host.innerHTML = '<span style="color:#94a3b8;">none</span>'; return; }
    host.innerHTML = '';
    state.anchors.forEach((n, i) => {
      const el = document.createElement('span');
      el.className = 'a';
      el.innerHTML = '#' + n + '<span data-i="' + i + '">×</span>';
      el.querySelector('span').addEventListener('click', () => {
        state.anchors.splice(i, 1);
        renderAnchors();
        render();
      });
      host.appendChild(el);
    });
  }

  function render() {
    const wheelHost = document.getElementById('wheelHost');
    wheelHost.innerHTML = '';
    wheelHost.appendChild(buildWheelView());

    const rowsCard = document.getElementById('rowsCard');
    const rowsHost = document.getElementById('rowsHost');
    if (state.mode === 'rows') {
      rowsCard.style.display = '';
      rowsHost.innerHTML = '';
      rowsHost.appendChild(buildStackedRows());
    } else {
      rowsCard.style.display = 'none';
    }
    renderPickers();
    renderRingLegend();
  }

  document.querySelectorAll('input[name="layoutMode"]').forEach(r => {
    r.addEventListener('change', () => {
      state.mode = document.querySelector('input[name="layoutMode"]:checked').value;
      render();
    });
  });
  document.getElementById('anchorAdd').addEventListener('click', () => {
    const n = parseInt(document.getElementById('anchorNum').value, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 36 && !state.anchors.includes(n)) {
      state.anchors.push(n);
      document.getElementById('anchorNum').value = '';
      renderAnchors();
      render();
    }
  });
  document.getElementById('anchorClear').addEventListener('click', () => {
    state.anchors = [];
    renderAnchors();
    render();
  });
  document.getElementById('anchorActive').addEventListener('change', (e) => {
    state.anchorsActive = !!e.target.checked;
    render();
  });
  document.getElementById('btnRevert').addEventListener('click', () => {
    if (state.snap && state.snap.current) {
      state.picked.t1 = new Set(state.snap.current.t1);
      state.picked.t2 = new Set(state.snap.current.t2);
      state.picked.t3 = new Set(state.snap.current.t3);
      renderPickers();
      const s = document.getElementById('applyStatus');
      s.className = 'status'; s.textContent = 'Reverted to live state.';
    }
  });
  document.getElementById('btnApply').addEventListener('click', () => {
    const s = document.getElementById('applyStatus');
    try {
      const op = window.opener;
      if (!op || !op.aiPanel) throw new Error('opener unavailable');
      const r = op.aiPanel._applySelectionProcessChanges({
        t1: [...state.picked.t1],
        t2: [...state.picked.t2],
        t3: [...state.picked.t3]
      });
      if (r && r.ok) { s.className = 'status'; s.textContent = '✓ Applied at ' + new Date().toLocaleTimeString(); }
      else           { s.className = 'status err'; s.textContent = 'Apply failed: ' + (r && r.error || ''); }
    } catch (e) {
      s.className = 'status err';
      s.textContent = 'Apply error: ' + e.message;
    }
  });

  pullSnapshot();
  renderAnchors();
})();
</script>
</body></html>`;
    }

    // ═══════════════════════════════════════════════════════
    //  SUMMARY DASHBOARD — compact recap inside the AI panel
    //  so the user doesn't have to scroll back to the tables.
    //  Shows: recent actuals (wheel-coloured), per-table pair
    //  selections with auto-ref ticks, primary predictions and
    //  grey/extra numbers — all in one box.
    // ═══════════════════════════════════════════════════════

    _renderSummaryDashboard() {
        const container = document.getElementById('aiSummaryDashboard');
        if (!container) return;

        // ── Delegated click handler (attached once) ───────────────
        // Pair badges and ref ticks in the dashboard are click-targets
        // that re-use the existing per-table selection handlers, so the
        // dashboard and the T1/T2/T3 sections always stay in sync.
        if (!container._summaryClickWired) {
            container.addEventListener('click', (ev) => {
                // Selection-process popup launcher.
                const procBtn = ev.target.closest('#aiSelectionProcessBtn');
                if (procBtn) {
                    this._openSelectionProcessPopup();
                    return;
                }
                // Mirror of the money-panel START/PAUSE button.
                const betBtn = ev.target.closest('#aiBetToggleBtn');
                if (betBtn) {
                    const mp = window.moneyPanel;
                    if (mp && typeof mp.toggleBetting === 'function') {
                        mp.toggleBetting();
                        // Re-render so the dashboard label/color flips
                        // immediately to reflect the new state.
                        this._renderSummaryDashboard();
                    }
                    return;
                }
                // T1 auto-bet pilot master switch.
                const autoCb = ev.target.closest('#aiT1AutoBetToggle');
                if (autoCb) {
                    // The click event fires AFTER the checkbox flips,
                    // so .checked already reflects the new state.
                    this._t1AutoBetEnabled = !!autoCb.checked;
                    console.log(`🎯 T1 auto-pilot ${this._t1AutoBetEnabled ? 'ENABLED' : 'DISABLED'}`);
                    if (this._t1AutoBetEnabled) {
                        // Apply immediately so the toggle reflects the
                        // current spin state without waiting for the
                        // next spin.
                        try { this._applyT1AutoBetStatus(); } catch (e) { console.warn(e); }
                    } else {
                        // Turning auto-pilot OFF → restore betting to
                        // START so the user isn't stranded in PAUSE
                        // after the autopilot last paused it.
                        const mp = window.moneyPanel;
                        if (mp && mp.sessionData && typeof mp.toggleBetting === 'function'
                            && !mp.sessionData.isBettingEnabled) {
                            mp.toggleBetting();
                            console.log('🎯 T1 auto-pilot OFF → restored START BETTING');
                        }
                    }
                    this._renderSummaryDashboard();
                    return;
                }
                const t = ev.target.closest('[data-summary-action]');
                if (!t) return;
                const action = t.dataset.summaryAction;
                const pair   = t.dataset.pair;
                const tid    = t.dataset.tableId;
                if (action === 't3-toggle' && pair) {
                    const isSel = this.table3Selections.has(pair);
                    this._handleTable3Selection(pair, !isSel);
                } else if (action === 't12-toggle' && pair && tid) {
                    const sels = (tid === '1') ? this.table1Selections : this.table2Selections;
                    const isSel = !!sels[pair];
                    this._handleTable12PairToggle('table' + tid, pair, !isSel);
                } else if (action === 'ref-toggle' && pair && tid) {
                    const sels = (tid === '1') ? this.table1Selections : this.table2Selections;
                    const refs = sels[pair];
                    const refKey = t.dataset.ref;
                    const isOn = !!(refs && refs.has(refKey));
                    this._handleRefSelection('table' + tid, pair, refKey, !isOn);
                }
            });
            container._summaryClickWired = true;
        }

        const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
        const colorOf = (n) => (n === 0)
            ? '#16a34a'
            : (RED.has(n) ? '#dc2626' : '#1f2937');

        const chip = (n, opts = {}) => {
            const sz   = opts.size || 18;
            const grey = opts.grey === true;
            const bg   = grey ? '#e5e7eb' : colorOf(n);
            const fg   = grey ? '#1f2937' : '#fff';
            const brd  = grey ? '1px dashed #64748b' : '1px solid rgba(0,0,0,.15)';
            return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:${fg};font-weight:700;font-size:10px;border:${brd};">${n}</span>`;
        };

        // ── Hit/miss map for recent spins ─────────────────────────
        // moneyPanel.betHistory is unshifted (newest first); spinsWithBets
        // is chronological. Pair them in reverse so each spin index gets
        // the bet result that resolved on it. Uses null when no bet was
        // placed on that spin (e.g. SKIP / no-pending).
        const mp = (typeof window !== 'undefined') ? window.moneyPanel : null;
        const hits = {};
        if (mp && Array.isArray(mp.betHistory) && Array.isArray(mp.sessionData?.spinsWithBets)) {
            const swb = mp.sessionData.spinsWithBets;
            const bh = mp.betHistory;
            for (let k = 0; k < swb.length; k++) {
                // money-panel pushes spins.length (1-based count) into
                // spinsWithBets, not the 0-based array index. Subtract 1
                // so the hit lookup matches `window.spins[i]` indices.
                const spinIdx = swb[k] - 1;
                const betEntry = bh[bh.length - 1 - k];
                if (betEntry && typeof betEntry.hit === 'boolean') {
                    hits[spinIdx] = betEntry.hit;
                }
            }
        }

        // ── Recent actuals — newest first, with hit/miss badge ────
        const spinsArr = Array.isArray(window.spins) ? window.spins : [];
        const recentEntries = [];
        for (let i = spinsArr.length - 1; i >= 0 && recentEntries.length < 12; i--) {
            const s = spinsArr[i];
            if (s && typeof s.actual === 'number') {
                recentEntries.push({ idx: i, actual: s.actual, hit: hits[i] });
            }
        }
        const hitBadge = (h) => {
            if (h === true)  return '<span style="color:#10b981;font-weight:700;font-size:11px;margin-left:3px;">✓</span>';
            if (h === false) return '<span style="color:#ef4444;font-weight:700;font-size:11px;margin-left:3px;">✗</span>';
            return '<span style="color:#cbd5e1;font-size:10px;margin-left:3px;">·</span>';
        };
        const recentHtml = recentEntries.length
            ? recentEntries.map(e =>
                `<div style="display:flex;align-items:center;justify-content:flex-start;margin:2px 0;">${chip(e.actual)}${hitBadge(e.hit)}</div>`
            ).join('')
            : '<div style="color:#64748b;font-size:10px;text-align:center;">—</div>';

        // ── Pair name map ─────────────────────────────────────────
        const dn = this._summaryPairNames || {
            'ref0':'0','ref0_13opp':'0·13','ref19':'19','ref19_13opp':'19·13',
            'prev':'P','prevPlus1':'P+1','prevMinus1':'P-1','prevPlus2':'P+2','prevMinus2':'P-2',
            'prevPrev':'PP','prevPrevPlus1':'PP+1','prevPrevMinus1':'PP-1','prevPrevPlus2':'PP+2','prevPrevMinus2':'PP-2',
            'prev_13opp':'P·13','prevPlus1_13opp':'P+1·13','prevMinus1_13opp':'P-1·13',
            'prevPlus2_13opp':'P+2·13','prevMinus2_13opp':'P-2·13','prevPrev_13opp':'PP·13',
            'prevPrevPlus1_13opp':'PP+1·13','prevPrevMinus1_13opp':'PP-1·13',
            'prevPrevPlus2_13opp':'PP+2·13','prevPrevMinus2_13opp':'PP-2·13'
        };
        const refLabel = (k) => k === 'first' ? '1st' : k === 'second' ? '2nd' : '3rd';

        // Ref pill — bigger tap target. Selected state is filled green;
        // unselected is bordered grey. Cursor + title tell the user it's
        // clickable.
        const refPill = (tableId, pk, r, on) => {
            const bg     = on ? '#16a34a' : '#ffffff';
            const fg     = on ? '#ffffff' : '#475569';
            const border = on ? '#15803d' : '#cbd5e1';
            return `<span data-summary-action="ref-toggle" data-table-id="${tableId}" data-pair="${pk}" data-ref="${r}" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:22px;padding:0 8px;margin-left:4px;font-size:11px;font-weight:700;border-radius:4px;background:${bg};color:${fg};border:1px solid ${border};cursor:pointer;user-select:none;white-space:nowrap;box-shadow:${on ? 'inset 0 1px 2px rgba(0,0,0,.15)' : '0 1px 1px rgba(0,0,0,.05)'};" title="Click to toggle ${refLabel(r)}">${refLabel(r)}</span>`;
        };

        const tableRows = (tableId, sels) => {
            const keys = (tableId === 3) ? Array.from(sels || []) : Object.keys(sels || {});
            if (keys.length === 0) return null; // signal "skip this section"
            return keys.map(pk => {
                const display = dn[pk] || pk;
                // T3: clicking the badge unselects the pair (mirrors the
                // checkbox in the T3 section — both stay in sync via the
                // existing _handleTable3Selection handler).
                if (tableId === 3) {
                    return `<span data-summary-action="t3-toggle" data-pair="${pk}" style="display:inline-block;background:#1e40af;color:#fff;padding:3px 10px;border-radius:4px;font-weight:700;font-size:11px;margin:2px 4px 2px 0;cursor:pointer;" title="Click to unselect ${display}">${display}</span>`;
                }
                const refs = sels[pk] || new Set();
                const refsHtml = ['first','second','third']
                    .map(r => refPill(tableId, pk, r, refs.has(r)))
                    .join('');
                return `<div style="display:flex;align-items:center;flex-wrap:wrap;padding:3px 2px;gap:2px;">
                    <span data-summary-action="t12-toggle" data-table-id="${tableId}" data-pair="${pk}" style="display:inline-flex;align-items:center;justify-content:center;background:${tableId===1?'#92400e':'#065f46'};color:#fff;padding:3px 10px;border-radius:4px;font-weight:700;font-size:11px;min-width:54px;height:22px;text-align:center;cursor:pointer;" title="Click to unselect ${display}">${display}</span>${refsHtml}
                </div>`;
            }).join('');
        };

        const sectionBlock = (label, color, bgColor, content) => {
            if (content === null) return '';
            const innerWrap = (label === 'TABLE 3')
                ? `<div style="margin-top:1px;">${content}</div>`
                : content;
            return `<div style="background:${bgColor};border-left:2px solid ${color};padding:2px 4px;border-radius:0 3px 3px 0;margin-bottom:2px;">
                <span style="color:${color};font-size:8px;font-weight:700;letter-spacing:.5px;">${label}</span>
                ${innerWrap}
            </div>`;
        };

        const t1Html = sectionBlock('TABLE 1', '#92400e', '#fef3c7', tableRows(1, this.table1Selections));
        const t2Html = sectionBlock('TABLE 2', '#065f46', '#d1fae5', tableRows(2, this.table2Selections));
        const t3Html = sectionBlock('TABLE 3', '#1e40af', '#dbeafe', tableRows(3, this.table3Selections));
        const selectionsHtml = (t1Html + t2Html + t3Html) || '<div style="color:#64748b;font-size:10px;padding:4px;">No pair selections yet</div>';

        // ── Predictions / greys ───────────────────────────────────
        // Source of truth for greys: prediction.extraNumbers (a flat
        // number[]). When include-grey is ON in the AI panel, that field
        // is reset to [] because greys are promoted into primary numbers
        // — so showing 0 greys is correct in that mode.
        const pred = this.currentPrediction || {};
        const primary = Array.isArray(pred.numbers) ? pred.numbers : [];
        const greys = Array.isArray(pred.extraNumbers) ? pred.extraNumbers : [];

        const predHtml = primary.length
            ? primary.map(n => `<span style="margin:1px;display:inline-block;">${chip(n,{size:20})}</span>`).join('')
            : '<span style="color:#64748b;font-size:10px;">no prediction yet</span>';
        const greyHtml = greys.length
            ? greys.map(n => `<span style="margin:1px;display:inline-block;">${chip(n,{grey:true,size:20})}</span>`).join('')
            : '<span style="color:#64748b;font-size:10px;">—</span>';

        // ── Session timer ─────────────────────────────────────────
        const sessActive = !!(mp && mp.sessionData && mp.sessionData.isSessionActive);
        if (sessActive && !this._summarySessionStart) {
            this._summarySessionStart = Date.now();
            // Tick every second so the timer keeps moving even when no
            // selection / prediction events fire.
            if (!this._summaryTimerInterval) {
                this._summaryTimerInterval = setInterval(() => {
                    const el = document.getElementById('aiSummaryTimer');
                    if (el && this._summarySessionStart) {
                        const sec = Math.floor((Date.now() - this._summarySessionStart) / 1000);
                        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
                        const ss = String(sec % 60).padStart(2, '0');
                        el.textContent = `⏱ ${mm}:${ss}`;
                    }
                    // Keep the spin counter live too — costs nothing
                    // and means the user always sees the latest count
                    // even if no selection / prediction event fires.
                    const sc = document.getElementById('aiSummarySpinCount');
                    if (sc) {
                        const n = Array.isArray(window.spins) ? window.spins.length : 0;
                        sc.textContent = `🎰 ${n}`;
                    }
                }, 1000);
            }
        } else if (!sessActive && this._summarySessionStart) {
            // Session ended/reset → clear so the next start re-stamps.
            this._summarySessionStart = null;
        }
        const elapsedTxt = (() => {
            if (!this._summarySessionStart) return '⏱ --:--';
            const sec = Math.floor((Date.now() - this._summarySessionStart) / 1000);
            const mm = String(Math.floor(sec / 60)).padStart(2, '0');
            const ss = String(sec % 60).padStart(2, '0');
            return `⏱ ${mm}:${ss}`;
        })();

        // Money-panel betting state — drives the START/PAUSE button label
        // and color in the selection-panel header.
        const bettingOn = !!(mp && mp.sessionData && mp.sessionData.isBettingEnabled);

        // T1 auto-bet pilot master switch (default OFF).
        const autoOn = (this._t1AutoBetEnabled === true);

        container.innerHTML = `
            <div style="background:#e5e7eb;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;color:#1f2937;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.08);">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#475569;margin-bottom:6px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;gap:6px;flex-wrap:wrap;">
                    <span style="font-weight:700;letter-spacing:.5px;color:#16a34a;">📋 SELECTION PANEL</span>
                    <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <label title="When ON, the T1 auto-bet pilot watches your selected T1 pairs and toggles the money-panel START / PAUSE BETTING based on the latest spin's hit (green) / miss (black) state. Default OFF so it never touches the toggle until you opt in." style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:${autoOn ? '#16a34a' : '#64748b'};font-weight:700;cursor:pointer;background:#fff;border:1px solid #cbd5e1;padding:2px 6px;border-radius:4px;">
                            <input type="checkbox" id="aiT1AutoBetToggle"${autoOn ? ' checked' : ''} style="margin:0;cursor:pointer;"> T1 auto-pilot ${autoOn ? 'ON' : 'OFF'}
                        </label>
                        <button id="aiBetToggleBtn" type="button" title="Toggle the money-management START / PAUSE BETTING (mirrors the button in the money panel)" style="${bettingOn
                            ? 'background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);'
                            : 'background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);'}border:none;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;border-radius:4px;cursor:pointer;letter-spacing:.3px;box-shadow:0 1px 2px rgba(0,0,0,.15);">${bettingOn ? '⏸️ PAUSE BETTING' : '▶️ START BETTING'}</button>
                        <button id="aiSelectionProcessBtn" type="button" title="Open the visual selection-process popup" style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);border:none;color:#fff;font-weight:700;font-size:10px;padding:3px 8px;border-radius:4px;cursor:pointer;letter-spacing:.3px;box-shadow:0 1px 2px rgba(0,0,0,.15);">🔬 Selection Process</button>
                        <span id="aiSummarySpinCount" title="Number of actual spins entered this session" style="background:#f8fafc;border:1px solid #cbd5e1;padding:1px 6px;border-radius:3px;font-variant-numeric:tabular-nums;font-weight:600;color:#334155;">🎰 ${(Array.isArray(window.spins) ? window.spins.length : 0)}</span>
                        <span id="aiSummaryTimer" style="background:#f8fafc;border:1px solid #cbd5e1;padding:1px 6px;border-radius:3px;font-variant-numeric:tabular-nums;font-weight:600;color:#334155;">${elapsedTxt}</span>
                    </span>
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;">
                    <div style="background:#f1f5f9;color:#1f2937;border:1px solid #cbd5e1;border-radius:5px;padding:4px 6px;min-width:48px;">
                        <div style="font-size:8px;color:#475569;font-weight:700;letter-spacing:.5px;text-align:center;margin-bottom:3px;">RECENT</div>
                        ${recentHtml}
                    </div>
                    <div>
                        <div style="font-size:8px;color:#475569;font-weight:700;letter-spacing:.5px;margin-bottom:3px;">SELECTIONS</div>
                        ${selectionsHtml}
                    </div>
                </div>
                <div style="margin-top:6px;padding-top:6px;border-top:1px solid #cbd5e1;">
                    <div style="font-size:8px;color:#475569;font-weight:700;letter-spacing:.5px;margin-bottom:3px;">
                        PREDICTIONS <span style="color:#059669;">(${primary.length})</span>
                    </div>
                    <div style="line-height:22px;">${predHtml}</div>
                    <div style="font-size:8px;color:#475569;font-weight:700;letter-spacing:.5px;margin-top:4px;margin-bottom:3px;">
                        GREY / EXTRA <span style="color:#64748b;">(${greys.length})</span>
                    </div>
                    <div style="line-height:22px;">${greyHtml}</div>
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════
    //  ON SPIN ADDED
    // ═══════════════════════════════════════════════════════

    onSpinAdded() {
        this.loadAvailablePairs();
        // Refresh auto-picked T1/T2 ref selections against the new spin
        // history. Only pairs whose stored refs still match their last
        // auto-pick snapshot (i.e. user hasn't manually toggled a sub-
        // ref) are refreshed; manually-edited pairs are left alone.
        try { this._refreshAutoPickedPairs(); } catch (e) { console.warn('Auto-pick refresh failed:', e); }
        this.updateTable3Highlights();
        this._renderSummaryDashboard();

        // T1 auto-bet hook: after every spin, check whether the user's
        // selected T1 pairs went GREEN (any valid T1 hit-code on the
        // latest spin). If so → start betting; if every selected T1
        // pair is BLACK → pause. Drives the same money-panel toggle
        // the user clicks manually.
        try { this._applyT1AutoBetStatus(); } catch (e) { console.warn('T1 auto-bet hook failed:', e); }

        // Re-trigger predictions if any pairs selected (use debounce to avoid duplicates)
        const total = this._getTotalSelectionCount();
        if (total >= 1 && window.spins && window.spins.length >= 3) {
            console.log('🔄 Spin added — re-triggering predictions');
            this._autoTriggerPredictions();
        } else if (window.spins && window.spins.length < 3) {
            console.log('⚠️ Not enough spins for predictions (need 3+)');
        }
    }

    // ═══════════════════════════════════════════════════════
    //  T1 AUTO-BET PILOT
    //  When the user has T1 pairs selected, the latest-spin hit
    //  state of those pairs drives the money-management START /
    //  PAUSE betting toggle:
    //    - ANY selected pair GREEN on latest spin → START
    //    - ALL selected pairs BLACK on latest spin → PAUSE
    //  No T1 selections → don't touch the toggle (manual control).
    //  Not enough spin history (initial state) → default to START
    //  (per user spec — "proceed" until we have data to pause on).
    // ═══════════════════════════════════════════════════════

    _computeT1PairRefNum(pairKey, prev, prevPrev) {
        const is13Opp = pairKey.endsWith('_13opp');
        const base = pairKey.replace('_13opp', '');
        let r = null;
        switch (base) {
            case 'ref0':            r = 0; break;
            case 'ref19':           r = 19; break;
            case 'prev':            r = prev; break;
            case 'prevPlus1':       r = (typeof prev === 'number') ? Math.min(prev + 1, 36) : null; break;
            case 'prevMinus1':      r = (typeof prev === 'number') ? Math.max(prev - 1, 0)  : null; break;
            case 'prevPlus2':       r = (typeof prev === 'number') ? Math.min(prev + 2, 36) : null; break;
            case 'prevMinus2':      r = (typeof prev === 'number') ? Math.max(prev - 2, 0)  : null; break;
            case 'prevPrev':        r = (typeof prevPrev === 'number') ? prevPrev : null; break;
            case 'prevPrevPlus1':   r = (typeof prevPrev === 'number') ? Math.min(prevPrev + 1, 36) : null; break;
            case 'prevPrevMinus1':  r = (typeof prevPrev === 'number') ? Math.max(prevPrev - 1, 0)  : null; break;
            case 'prevPrevPlus2':   r = (typeof prevPrev === 'number') ? Math.min(prevPrev + 2, 36) : null; break;
            case 'prevPrevMinus2':  r = (typeof prevPrev === 'number') ? Math.max(prevPrev - 2, 0)  : null; break;
            default: r = null;
        }
        if (typeof r !== 'number') return null;
        if (is13Opp) {
            const eng = window.aiAutoEngine;
            if (eng && typeof eng._getDigit13Opposite === 'function') {
                r = eng._getDigit13Opposite(r);
            } else {
                return null;
            }
        }
        return (typeof r === 'number') ? r : null;
    }

    _isT1PairGreenOnSpin(pairKey, spinIdx) {
        const T1_VALID = new Set(['S+0','SL+1','SR+1','O+0','OL+1','OR+1']);
        const spins = window.spins || [];
        if (spinIdx < 1 || spinIdx >= spins.length) return null;
        const actual = spins[spinIdx] && spins[spinIdx].actual;
        const prev   = spins[spinIdx - 1] && spins[spinIdx - 1].actual;
        const prevPrev = (spinIdx >= 2) ? (spins[spinIdx - 2] && spins[spinIdx - 2].actual) : null;
        if (typeof actual !== 'number' || typeof prev !== 'number') return null;

        const refNum = this._computeT1PairRefNum(pairKey, prev, prevPrev);
        if (typeof refNum !== 'number') return null;

        const eng = window.aiAutoEngine;
        if (!eng || typeof eng._getLookupRow !== 'function' || typeof eng._getCalculatePositionCode !== 'function') {
            return null;
        }
        const lr = eng._getLookupRow(refNum);
        if (!lr) return null;
        const targets = [lr.first, lr.second, lr.third];
        for (const t of targets) {
            if (typeof t !== 'number') continue;
            const code = eng._getCalculatePositionCode(t, actual);
            if (T1_VALID.has(code)) return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════════════════
    //  AUTO-PICK REFRESH ON NEW SPIN
    //  After every spin, re-run getAutoSelectedRefs for each
    //  selected T1/T2 pair whose stored refs still match its
    //  last auto-pick snapshot. Pairs the user has manually
    //  edited (per _autoPickedPairs delete in _handleRefSelection)
    //  are left alone. Re-renders the T1/T2 checkbox lists when
    //  any refresh actually changes a stored set.
    // ═══════════════════════════════════════════════════════
    _refreshAutoPickedPairs() {
        if (!this._autoPickedPairs || !window.getAutoSelectedRefs) return;
        if (!Array.isArray(window.spins) || window.spins.length < 2) return;
        const setsEqual = (a, b) => {
            if (!a || !b || a.size !== b.size) return false;
            for (const v of a) if (!b.has(v)) return false;
            return true;
        };

        let t1Changed = false;
        let t2Changed = false;
        // Iterate keys at snapshot time so we can mutate the map mid-loop.
        const keys = Object.keys(this._autoPickedPairs);
        for (const key of keys) {
            const sep = key.indexOf(':');
            if (sep < 0) continue;
            const tableId = key.slice(0, sep);
            const pairKey = key.slice(sep + 1);
            const selections = (tableId === 'table1') ? this.table1Selections : this.table2Selections;
            const currentRefs = selections[pairKey];

            // Pair was unselected since the last auto-pick → drop snapshot
            if (!currentRefs) {
                delete this._autoPickedPairs[key];
                continue;
            }

            // User edited the refs → demote and skip
            const snapshot = this._autoPickedPairs[key];
            if (!setsEqual(currentRefs, snapshot)) {
                delete this._autoPickedPairs[key];
                continue;
            }

            // Re-run auto-pick (T1 mirrors T2; T2 uses its own codes)
            const lookupTable = (tableId === 'table1') ? 'table2' : tableId;
            const newAuto = window.getAutoSelectedRefs(pairKey, lookupTable);
            const newRefs = new Set(newAuto.primaryRefs);

            if (setsEqual(newRefs, currentRefs)) continue; // nothing to do

            selections[pairKey] = newRefs;
            if (this._extraRefs) this._extraRefs[`${tableId}:${pairKey}`] = newAuto.extraRef;
            this._autoPickedPairs[key] = new Set(newRefs);
            if (tableId === 'table1') t1Changed = true; else t2Changed = true;
            console.log(`🔄 Auto-pick refreshed ${pairKey} (${tableId}): primary=[${[...newRefs].join(',')}], extra=${newAuto.extraRef}`);
        }

        // Re-render checkbox lists for tables that actually changed.
        // Predictions are re-triggered later by the existing onSpinAdded
        // flow when total selection count >= 1, so we do NOT call
        // _autoTriggerPredictions() here — it would just duplicate work.
        if (t1Changed) {
            this._renderTable12Checkboxes('table1', this.table1Pairs, this.table1Selections);
            this.updateSingleTableHighlights('table1', this.table1SelectedPairs);
        }
        if (t2Changed) {
            this._renderTable12Checkboxes('table2', this.table2Pairs, this.table2Selections);
            this.updateSingleTableHighlights('table2', this.table2SelectedPairs);
        }
        if (t1Changed || t2Changed) this._updateCounts();
    }

    _evaluateT1AutoBetStatus() {
        const sels = Object.keys(this.table1Selections || {});
        if (sels.length === 0) return null; // no T1 selections → don't touch toggle
        const spins = window.spins || [];
        if (spins.length < 2) return 'proceed'; // initial state → default proceed
        const latestIdx = spins.length - 1;
        const anyGreen = sels.some(pk => this._isT1PairGreenOnSpin(pk, latestIdx) === true);
        return anyGreen ? 'proceed' : 'pause';
    }

    _applyT1AutoBetStatus() {
        // Master on/off switch — surfaced as a checkbox in the
        // selection-panel header. Default OFF so the feature doesn't
        // touch the START / PAUSE button until the user opts in.
        if (this._t1AutoBetEnabled !== true) return;
        const desired = this._evaluateT1AutoBetStatus();
        if (desired === null) return; // no T1 selections — leave money panel alone
        const mp = window.moneyPanel;
        if (!mp || !mp.sessionData || typeof mp.toggleBetting !== 'function') return;
        const wantOn = (desired === 'proceed');
        const isOn = !!mp.sessionData.isBettingEnabled;
        if (wantOn === isOn) return; // already in desired state

        // ── RACE GUARD ─────────────────────────────────────────────
        // Don't toggle while there's an unresolved pendingBet from a
        // previous spin. The money-panel spin listener polls every
        // 200ms; if we flip to PAUSE now, toggleBetting() nulls
        // pendingBet and the listener never gets a chance to record
        // the hit/miss. Defer until the bet has resolved.
        const pb = mp.pendingBet;
        const spinsLen = Array.isArray(window.spins) ? window.spins.length : 0;
        if (pb && typeof pb.placedAtSpinCount === 'number' && pb.placedAtSpinCount < spinsLen) {
            setTimeout(() => this._applyT1AutoBetStatus(), 350);
            return;
        }

        mp.toggleBetting();
        console.log(`🎯 T1 auto-bet pilot: ${wantOn ? 'PROCEED — at least one selected T1 pair GREEN' : 'PAUSE — all selected T1 pairs BLACK'}`);
        // Refresh the selection-panel header so the START/PAUSE
        // button label flips to match the new state immediately.
        if (typeof this._renderSummaryDashboard === 'function') {
            this._renderSummaryDashboard();
        }
    }

    // ═══════════════════════════════════════════════════════
    //  GET PREDICTIONS — FRONTEND COMPUTATION
    // ═══════════════════════════════════════════════════════

    async getPredictions() {
        const totalCount = this._getTotalSelectionCount();
        if (totalCount === 0) {
            console.warn('No pairs selected');
            return;
        }

        console.log('\n========================================');
        console.log('🎲 MULTI-TABLE PREDICTION REQUEST');
        console.log('========================================');
        console.log('T3 selections:', Array.from(this.table3Selections));
        console.log('T1 selections:', this.table1Selections);
        console.log('T2 selections:', this.table2Selections);

        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = 'CALCULATING...';
            signalIndicator.style.backgroundColor = '#f59e0b';
        }

        try {
            const tableData = window.getAIDataV6();
            if (!tableData) throw new Error('No table data available');

            // Collect per-pair number sets — each selected pair is its own set
            // Primary: INTERSECTION across ALL pairs (regardless of table)
            // Extra: from 3rd ref, intersected across all extended sets
            const pairSets = [];       // Each pair = { source, numbers (Set), table }
            const pairExtraSets = [];  // Each pair's extra ref numbers = { numbers (Set), pairNumbers (Set) }

            // --- TABLE 3: each pair is a separate set ---
            // Always use EXPANDED numbers (includes ±1 wheel neighbors).
            // The ±1 expansion IS part of T3's prediction methodology — neighbors are valid bet numbers.
            // Cross-table intersection: T3_expanded ∩ T2_expanded gives numbers confirmed by both tables.
            if (this.table3Selections.size > 0) {
                const t3Projections = tableData.table3NextProjections || {};

                this.table3Selections.forEach(pairKey => {
                    const pairData = t3Projections[pairKey];
                    if (pairData && pairData.numbers && pairData.numbers.length > 0) {
                        const pairNums = new Set(pairData.numbers);
                        pairSets.push({
                            source: `T3:${pairKey}`,
                            numbers: pairNums,
                            table: 'T3'
                        });
                    }
                });
            }

            // --- TABLE 1: each pair's primary refs UNION → one set per pair ---
            if (Object.keys(this.table1Selections).length > 0) {
                const t1Projections = tableData.table1NextProjections || {};

                Object.entries(this.table1Selections).forEach(([pairKey, refSet]) => {
                    const pairData = t1Projections[pairKey];
                    if (!pairData) return;

                    const pairPrimaryUnion = new Set();
                    const pairExtraUnion = new Set();

                    // Primary refs (the auto-selected 2)
                    refSet.forEach(refKey => {
                        const refData = pairData[refKey];
                        if (refData && refData.numbers) {
                            refData.numbers.forEach(n => pairPrimaryUnion.add(n));
                        }
                    });

                    // Extra ref (the 3rd one, not in refSet)
                    const extraRefKey = this._extraRefs?.[`table1:${pairKey}`];
                    if (extraRefKey && !refSet.has(extraRefKey)) {
                        const extraData = pairData[extraRefKey];
                        if (extraData && extraData.numbers) {
                            extraData.numbers.forEach(n => pairExtraUnion.add(n));
                        }
                    }

                    if (pairPrimaryUnion.size > 0) {
                        pairSets.push({
                            source: `T1:${pairKey}[${Array.from(refSet).join(',')}]`,
                            numbers: pairPrimaryUnion,
                            table: 'T1'
                        });
                        if (pairExtraUnion.size > 0) {
                            pairExtraSets.push({ numbers: pairExtraUnion, pairNumbers: pairPrimaryUnion });
                        }
                    }
                });
            }

            // --- TABLE 2: each pair's primary refs UNION → one set per pair ---
            if (Object.keys(this.table2Selections).length > 0) {
                const t2Projections = tableData.table2NextProjections || {};

                Object.entries(this.table2Selections).forEach(([pairKey, refSet]) => {
                    const pairData = t2Projections[pairKey];
                    if (!pairData) return;

                    const pairPrimaryUnion = new Set();
                    const pairExtraUnion = new Set();

                    // Primary refs
                    refSet.forEach(refKey => {
                        const refData = pairData[refKey];
                        if (refData && refData.numbers) {
                            refData.numbers.forEach(n => pairPrimaryUnion.add(n));
                        }
                    });

                    // Extra ref
                    const extraRefKey = this._extraRefs?.[`table2:${pairKey}`];
                    if (extraRefKey && !refSet.has(extraRefKey)) {
                        const extraData = pairData[extraRefKey];
                        if (extraData && extraData.numbers) {
                            extraData.numbers.forEach(n => pairExtraUnion.add(n));
                        }
                    }

                    if (pairPrimaryUnion.size > 0) {
                        pairSets.push({
                            source: `T2:${pairKey}[${Array.from(refSet).join(',')}]`,
                            numbers: pairPrimaryUnion,
                            table: 'T2'
                        });
                        if (pairExtraUnion.size > 0) {
                            pairExtraSets.push({ numbers: pairExtraUnion, pairNumbers: pairPrimaryUnion });
                        }
                    }
                });
            }

            if (pairSets.length === 0) {
                // Gracefully no-op when no pair refs are available yet
                // (early spins, or test-lab mode where the auto-trigger
                // can fire before the user has any tables populated).
                // Throwing here previously surfaced as a console error
                // every spin in test-lab. We just clear the display.
                if (signalIndicator) {
                    signalIndicator.textContent = '⏳ Waiting for table data';
                    signalIndicator.style.backgroundColor = '#64748b';
                }
                const numbersDiv = document.querySelector('#aiResultsPanel .prediction-numbers');
                if (numbersDiv) {
                    numbersDiv.innerHTML = '<div style="color:#64748b;padding:20px;text-align:center;">Waiting for table data — add more spins or select pairs.</div>';
                }
                return;
            }

            // Build legacy tableSets for debug display (UNION within each table)
            const tableMap = {};
            pairSets.forEach(ps => {
                if (!tableMap[ps.table]) {
                    tableMap[ps.table] = { sources: [], numbers: new Set() };
                }
                tableMap[ps.table].sources.push(ps.source);
                ps.numbers.forEach(n => tableMap[ps.table].numbers.add(n));
            });
            const tableSets = Object.entries(tableMap).map(([table, data]) => ({
                source: `${table}:[${data.sources.map(s => s.split(':')[1]).join(',')}]`,
                numbers: data.numbers
            }));

            console.log('📊 Per-pair sets:', pairSets.map(s => ({
                source: s.source,
                count: s.numbers.size,
                numbers: Array.from(s.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
            })));

            // --- INTERSECTION across ALL pairs (PRIMARY) ---
            // Every selected pair must contain the number for it to be in the final result
            let intersection;
            if (pairSets.length === 1) {
                intersection = new Set(pairSets[0].numbers);
            } else {
                intersection = new Set(pairSets[0].numbers);
                for (let i = 1; i < pairSets.length; i++) {
                    const next = pairSets[i].numbers;
                    intersection = new Set([...intersection].filter(n => next.has(n)));
                }
            }

            // --- EXTRA NUMBERS (grey — from 3rd ref) ---
            // Build "extended" sets per pair: primary + extra merged
            // Then intersect those across ALL pairs
            // extraNumbers = extendedIntersection - primaryIntersection
            let extraNumbers = [];
            if (pairExtraSets.length > 0 && pairSets.length >= 1) {
                const extendedSets = pairSets.map(ps => {
                    // Find matching extra set for this pair
                    const extraEntry = pairExtraSets.find(es => es.pairNumbers === ps.numbers);
                    if (extraEntry) {
                        const merged = new Set(ps.numbers);
                        extraEntry.numbers.forEach(n => merged.add(n));
                        return merged;
                    }
                    return ps.numbers; // No extra for this pair (e.g., T3 pairs)
                });

                let extendedIntersection;
                if (extendedSets.length === 1) {
                    extendedIntersection = new Set(extendedSets[0]);
                } else {
                    extendedIntersection = new Set(extendedSets[0]);
                    for (let i = 1; i < extendedSets.length; i++) {
                        const next = extendedSets[i];
                        extendedIntersection = new Set([...extendedIntersection].filter(n => next.has(n)));
                    }
                }

                // Extra = extended intersection minus primary intersection
                extraNumbers = [...extendedIntersection].filter(n => !intersection.has(n));

                // Apply 0/26 pairing rule to extra numbers
                const extraHas0 = extraNumbers.includes(0);
                const extraHas26 = extraNumbers.includes(26);
                if (extraHas0 && !extraHas26 && !intersection.has(26)) extraNumbers.push(26);
                if (extraHas26 && !extraHas0 && !intersection.has(0)) extraNumbers.push(0);

                extraNumbers.sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
                console.log(`🔘 Extra numbers (3rd ref): ${extraNumbers.length}:`, extraNumbers);
            }

            // Also track per-pair sets for logging
            const numberSets = pairSets;

            let finalNumbers = Array.from(intersection);

            // Apply 0/26 pairing rule
            const has0 = finalNumbers.includes(0);
            const has26 = finalNumbers.includes(26);
            if (has0 && !has26) finalNumbers.push(26);
            if (has26 && !has0) finalNumbers.push(0);

            finalNumbers.sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));

            console.log(`🎯 Intersection: ${finalNumbers.length} numbers:`, finalNumbers);

            // ── INCLUDE-GREY TOGGLE ──
            // When the shared "include grey numbers" flag is ON (default),
            // promote the 3rd-ref EXTRA numbers into the COMMON bet so the
            // money panel actually bets on them, the wheel renders them
            // with primary colours, and the banner shows a single combined
            // count instead of "N COMMON + M EXTRA".
            // Sourced from window.strategyLabIncludeGrey (mirrored across
            // the AI-panel / wheel-panel / Auto-Test param checkboxes and
            // localStorage), so toggling any of them takes effect on the
            // next prediction without a reload.
            const includeGreyAsBet = (typeof window !== 'undefined' && typeof window.strategyLabIncludeGrey === 'boolean')
                ? window.strategyLabIncludeGrey
                : true;
            if (includeGreyAsBet && extraNumbers.length > 0) {
                const merged = new Set(finalNumbers);
                for (const n of extraNumbers) merged.add(n);
                finalNumbers = Array.from(merged).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
                // Move greys out of the extras bucket — they are now bet
                // numbers and must NOT be drawn grey on the wheel or shown
                // in the "EXTRA" debug panel.
                extraNumbers = [];
                console.log(`✅ include-grey ON → merged ${finalNumbers.length} numbers (greys promoted to primary bet)`);
            }

            if (finalNumbers.length === 0 && extraNumbers.length === 0) {
                // Show no common numbers
                if (signalIndicator) {
                    signalIndicator.textContent = '⚠️ NO COMMON NUMBERS';
                    signalIndicator.style.backgroundColor = '#f59e0b';
                }
                const numbersDiv = document.querySelector('#aiResultsPanel .prediction-numbers');
                if (numbersDiv) {
                    numbersDiv.innerHTML = '<div style="color: #f59e0b; padding: 20px; text-align: center; font-weight: bold;">No common numbers found between selected pairs. Try different combinations.</div>';
                }
                // Clear stale wheel highlights from the previous prediction
                // — without this the wheel keeps showing the old numbers
                // even though the banner says "NO COMMON NUMBERS".
                if (window.rouletteWheel && typeof window.rouletteWheel.clearHighlights === 'function') {
                    window.rouletteWheel.clearHighlights();
                }
                this.currentPrediction = null;
                if (typeof this._renderSummaryDashboard === 'function') {
                    this._renderSummaryDashboard();
                }
                return;
            }

            // Calculate anchors (frontend)
            const { anchors, loose, anchorGroups } = window.calculateWheelAnchors(finalNumbers);

            // Build per-pair detail for debug
            const pairDetails = [];

            // T3 per-pair
            if (this.table3Selections.size > 0) {
                const t3Proj = tableData.table3NextProjections || {};
                this.table3Selections.forEach(pairKey => {
                    const pairData = t3Proj[pairKey];
                    if (pairData && pairData.numbers) {
                        pairDetails.push({
                            table: 'T3',
                            pair: pairKey,
                            refs: ['all'],
                            numbers: Array.from(pairData.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                        });
                    }
                });
            }

            // T1 per-pair per-ref
            if (Object.keys(this.table1Selections).length > 0) {
                const t1Proj = tableData.table1NextProjections || {};
                Object.entries(this.table1Selections).forEach(([pairKey, refSet]) => {
                    const pairData = t1Proj[pairKey];
                    if (!pairData) return;
                    refSet.forEach(refKey => {
                        const refData = pairData[refKey];
                        if (refData && refData.numbers) {
                            pairDetails.push({
                                table: 'T1',
                                pair: pairKey,
                                refs: [refKey],
                                numbers: Array.from(refData.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                            });
                        }
                    });
                    // Extra ref
                    const extraRefKey = this._extraRefs?.[`table1:${pairKey}`];
                    if (extraRefKey && !refSet.has(extraRefKey)) {
                        const extraData = pairData[extraRefKey];
                        if (extraData && extraData.numbers) {
                            pairDetails.push({
                                table: 'T1',
                                pair: pairKey,
                                refs: [extraRefKey + ' (extra)'],
                                numbers: Array.from(extraData.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                            });
                        }
                    }
                });
            }

            // T2 per-pair per-ref
            if (Object.keys(this.table2Selections).length > 0) {
                const t2Proj = tableData.table2NextProjections || {};
                Object.entries(this.table2Selections).forEach(([pairKey, refSet]) => {
                    const pairData = t2Proj[pairKey];
                    if (!pairData) return;
                    refSet.forEach(refKey => {
                        const refData = pairData[refKey];
                        if (refData && refData.numbers) {
                            pairDetails.push({
                                table: 'T2',
                                pair: pairKey,
                                refs: [refKey],
                                numbers: Array.from(refData.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                            });
                        }
                    });
                    // Extra ref
                    const extraRefKey = this._extraRefs?.[`table2:${pairKey}`];
                    if (extraRefKey && !refSet.has(extraRefKey)) {
                        const extraData = pairData[extraRefKey];
                        if (extraData && extraData.numbers) {
                            pairDetails.push({
                                table: 'T2',
                                pair: pairKey,
                                refs: [extraRefKey + ' (extra)'],
                                numbers: Array.from(extraData.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                            });
                        }
                    }
                });
            }

            // Build debug data for verification panel
            const debugData = {
                tableSets: tableSets.map(s => ({
                    source: s.source,
                    count: s.numbers.size,
                    numbers: Array.from(s.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                })),
                pairSets: pairSets.map(s => ({
                    source: s.source,
                    count: s.numbers.size,
                    numbers: Array.from(s.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                })),
                primaryIntersection: Array.from(intersection).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99)),
                finalNumbers: finalNumbers,
                extraNumbers: extraNumbers,
                pairExtraSets: pairExtraSets.map(es => ({
                    count: es.numbers.size,
                    numbers: Array.from(es.numbers).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99))
                })),
                pairDetails: pairDetails,
                t3Selections: Array.from(this.table3Selections),
                t1Selections: Object.fromEntries(
                    Object.entries(this.table1Selections).map(([k, v]) => [k, Array.from(v)])
                ),
                t2Selections: Object.fromEntries(
                    Object.entries(this.table2Selections).map(([k, v]) => [k, Array.from(v)])
                )
            };

            // Build prediction object matching existing updatePrediction() format
            const prediction = {
                signal: 'BET NOW',
                numbers: finalNumbers,
                anchors: anchors,
                loose: loose,
                anchor_groups: anchorGroups,
                extraNumbers: extraNumbers,
                full_pool: finalNumbers,
                confidence: 90,
                mode: 'FRONTEND_MULTI_TABLE',
                result_history: [],
                debugData: debugData,
                reasoning: {
                    selected_pairs: numberSets.map(s => s.source),
                    pair_count: numberSets.length,
                    strategy: 'Cross-Table Intersection'
                }
            };

            console.log('✅ Frontend prediction:', prediction);

            // SEMI-AUTO: auto-select optimal filter before displaying
            if (typeof window !== 'undefined' && window.semiAutoFilter && window.semiAutoFilter.isEnabled) {
                window.semiAutoFilter.applyOptimalFilter(prediction.numbers);
            }

            // Use existing display logic
            this.updatePrediction(prediction);

        } catch (error) {
            console.error('❌ ERROR:', error);

            if (signalIndicator) {
                signalIndicator.textContent = 'ERROR';
                signalIndicator.style.backgroundColor = '#ef4444';
            }

            const numbersDiv = document.querySelector('#aiResultsPanel .prediction-numbers');
            if (numbersDiv) {
                numbersDiv.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">❌ ${error.message}</div>`;
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    //  UPDATE PREDICTION DISPLAY (UNCHANGED from original)
    // ═══════════════════════════════════════════════════════

    updatePrediction(prediction) {
        this.currentPrediction = prediction;

        // Refresh the compact summary dashboard with the new prediction.
        if (typeof this._renderSummaryDashboard === 'function') {
            this._renderSummaryDashboard();
        }

        if (!prediction) {
            console.warn('⚠️ No prediction to display');
            return;
        }

        console.log('🔄 Updating AI panel with:', prediction);

        const anchors = prediction.anchors || [];
        const loose = prediction.loose || [];
        const allNumbers = prediction.numbers || [];
        const anchorGroups = prediction.anchor_groups || [];
        const extraNumbers = prediction.extraNumbers || [];

        // Sort anchor groups by European wheel position of their anchor number
        anchorGroups.sort((a, b) => (WHEEL_POS[a.anchor] ?? 99) - (WHEEL_POS[b.anchor] ?? 99));

        // Color palette for anchor groups
        const groupColors = [
            { bg: '#fef3c7', border: '#f59e0b', anchorBg: '#f59e0b', neighborBg: '#fbbf24', text: '#000' },
            { bg: '#dbeafe', border: '#3b82f6', anchorBg: '#3b82f6', neighborBg: '#60a5fa', text: '#fff' },
            { bg: '#dcfce7', border: '#22c55e', anchorBg: '#22c55e', neighborBg: '#4ade80', text: '#fff' },
            { bg: '#f3e8ff', border: '#a855f7', anchorBg: '#a855f7', neighborBg: '#c084fc', text: '#fff' },
            { bg: '#ffedd5', border: '#f97316', anchorBg: '#f97316', neighborBg: '#fb923c', text: '#fff' },
            { bg: '#fce7f3', border: '#ec4899', anchorBg: '#ec4899', neighborBg: '#f472b6', text: '#fff' },
            { bg: '#e0f2fe', border: '#0ea5e9', anchorBg: '#0ea5e9', neighborBg: '#38bdf8', text: '#fff' },
            { bg: '#ecfdf5', border: '#10b981', anchorBg: '#10b981', neighborBg: '#34d399', text: '#fff' },
        ];

        console.log('📊 Displaying:', {
            total: allNumbers.length,
            anchorGroups: anchorGroups.length,
            loose: loose.length
        });

        // 1. UPDATE SIGNAL
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            const extraText = extraNumbers.length > 0 ? ` + ${extraNumbers.length} EXTRA` : '';
            signalIndicator.textContent = `✅ ${allNumbers.length} COMMON${extraText}`;
            signalIndicator.style.backgroundColor = '#22c55e';
            signalIndicator.style.color = 'white';
        }

        // 2. UPDATE NUMBERS — color-coded anchor groups + loose
        const numbersDiv = document.querySelector('#aiResultsPanel .prediction-numbers');
        if (numbersDiv && allNumbers.length > 0) {
            let anchorGroupsHTML = '';
            if (anchorGroups.length > 0) {
                anchorGroupsHTML = anchorGroups.map((ag, idx) => {
                    const color = groupColors[idx % groupColors.length];
                    const group = ag.group || [];
                    const anchorNum = ag.anchor;
                    const anchorType = ag.type || '±1'; // '±1' or '±2'

                    const numbersHTML = group.map(n => {
                        const isAnchor = (n === anchorNum);
                        return `<span style="
                            display: inline-block;
                            padding: 10px 14px;
                            border-radius: 10px;
                            background: ${isAnchor ? color.anchorBg : color.neighborBg};
                            color: ${isAnchor ? color.text : color.text};
                            border: 3px solid ${color.border};
                            font-weight: bold;
                            font-size: 17px;
                            min-width: 42px;
                            text-align: center;
                            box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                            position: relative;
                            ${isAnchor ? 'text-decoration: underline; text-underline-offset: 3px;' : 'opacity: 0.85;'}
                        ">${n}${isAnchor ? `<span style="
                            position: absolute;
                            top: -8px;
                            right: -8px;
                            background: #1e293b;
                            color: #fff;
                            font-size: 9px;
                            font-weight: 700;
                            padding: 1px 4px;
                            border-radius: 4px;
                            border: 1px solid ${color.border};
                            line-height: 1.2;
                        ">${anchorType}</span>` : ''}</span>`;
                    }).join('');

                    return `
                        <div style="
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            padding: 8px 10px;
                            background: ${color.bg};
                            border: 2px solid ${color.border};
                            border-radius: 12px;
                            margin-bottom: 6px;
                        ">
                            ${numbersHTML}
                        </div>
                    `;
                }).join('');
            }

            let looseHTML = '';
            if (loose.length > 0) {
                looseHTML = loose.sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99)).map(n => `
                    <span style="
                        display: inline-block;
                        padding: 10px 14px;
                        border-radius: 10px;
                        background: #ef4444;
                        color: white;
                        border: 3px solid #dc2626;
                        font-weight: bold;
                        font-size: 17px;
                        min-width: 42px;
                        text-align: center;
                        box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                    ">${n}</span>
                `).join('');
            }

            const coveredCount = anchorGroups.reduce((sum, ag) => sum + (ag.group ? ag.group.length : 0), 0);

            numbersDiv.innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #374151; margin-bottom: 12px; font-size: 15px;">
                        🎯 PREDICTION: ${allNumbers.length} numbers to bet
                    </div>

                    ${anchorGroups.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; border: 2px solid #94a3b8;">
                        <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 10px;">
                            🎯 ANCHORS (${anchors.length}) — ±1 = 3 covered, ±2 = 5 covered
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${anchorGroupsHTML}
                        </div>
                    </div>` : ''}

                    ${loose.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 10px; border: 2px solid #ef4444;">
                        <div style="font-size: 13px; font-weight: 700; color: #991b1b; margin-bottom: 8px;">
                            🔴 LOOSE (${loose.length}) — not covered by any anchor
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                            ${looseHTML}
                        </div>
                    </div>` : `
                    <div style="padding: 8px 12px; background: #ecfdf5; border-radius: 8px; border: 1px solid #10b981; color: #065f46; font-size: 13px; font-weight: 600;">
                        ✅ All numbers covered by anchor groups — no loose numbers!
                    </div>`}

                    ${extraNumbers.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-radius: 10px; border: 2px dashed #9ca3af;">
                        <div style="font-size: 13px; font-weight: 700; color: #4b5563; margin-bottom: 8px;">
                            🔘 EXTRA (${extraNumbers.length}) — 3rd ref numbers (optional bets)
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                            ${extraNumbers.map(n => `
                                <span style="
                                    display: inline-block;
                                    padding: 10px 14px;
                                    border-radius: 10px;
                                    background: #9ca3af;
                                    color: white;
                                    border: 3px solid #6b7280;
                                    font-weight: bold;
                                    font-size: 17px;
                                    min-width: 42px;
                                    text-align: center;
                                    box-shadow: 0 3px 6px rgba(0,0,0,0.15);
                                    opacity: 0.7;
                                ">${n}</span>
                            `).join('')}
                        </div>
                    </div>` : ''}
                </div>
            `;
        } else if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">No common numbers found</div>';
        }

        // 3. NUMBER CLASSIFICATION — Positive/Negative & Zero/19 table
        const reasoningDiv = document.querySelector('#aiResultsPanel .prediction-reasoning');
        if (reasoningDiv) {
            const ZERO_TABLE = [3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7];
            const NINETEEN_TABLE = [15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35];
            const POSITIVE = [3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22];
            const NEGATIVE = [21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35];

            const zeroTableSet = new Set(ZERO_TABLE);
            const nineteenTableSet = new Set(NINETEEN_TABLE);
            const positiveSet = new Set(POSITIVE);
            const negativeSet = new Set(NEGATIVE);

            const positiveNums = allNumbers.filter(n => positiveSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
            const negativeNums = allNumbers.filter(n => negativeSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
            const zeroTableNums = allNumbers.filter(n => zeroTableSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
            const nineteenTableNums = allNumbers.filter(n => nineteenTableSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));

            const numBadge = (n, color, borderColor) => `<span style="
                display: inline-block; padding: 4px 8px; border-radius: 6px;
                background: ${color}; color: white; border: 2px solid ${borderColor};
                font-weight: bold; font-size: 13px; min-width: 28px; text-align: center;
                margin: 2px;
            ">${n}</span>`;

            let resultHistoryHTML = '';
            const resultHistory = prediction.result_history || [];
            if (resultHistory.length > 0) {
                const total = resultHistory.length;
                const hits = resultHistory.filter(r => r.hit).length;
                const misses = total - hits;
                const hitPct = ((hits / total) * 100).toFixed(0);
                const missPct = ((misses / total) * 100).toFixed(0);
                const summaryIcons = resultHistory.slice().reverse().map(r => r.hit ? '✅' : '❌').join('');
                const lastResult = resultHistory[resultHistory.length - 1];

                resultHistoryHTML = `
                <div style="margin-bottom: 12px; padding: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; border: 2px solid #64748b;">
                    <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px;">
                        📊 RESULT TRACKER
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 6px;">
                        <span style="font-size: 13px; color: #334155;">
                            Last: <strong>${lastResult.actual}</strong> —
                            <span style="color: ${lastResult.hit ? '#16a34a' : '#dc2626'}; font-weight: bold;">
                                ${lastResult.hit ? '✅ HIT!' : '❌ MISS'}
                            </span>
                        </span>
                        <span style="font-size: 13px;">
                            <span style="color: #16a34a; font-weight: bold;">Hit: ${hits}/${total} (${hitPct}%)</span>
                            &nbsp;|&nbsp;
                            <span style="color: #dc2626; font-weight: bold;">Miss: ${misses}/${total} (${missPct}%)</span>
                        </span>
                    </div>
                    <div style="font-size: 16px; letter-spacing: 2px;">${summaryIcons}</div>
                </div>`;
            }

            reasoningDiv.innerHTML = `
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 10px; border: 2px solid #22c55e;">
                        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
                            ➕ Positive (${positiveNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${positiveNums.map(n => numBadge(n, '#16a34a', '#15803d')).join('')}
                        </div>
                    </div>
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 10px; border: 2px solid #a855f7;">
                        <div style="font-size: 12px; font-weight: 700; color: #581c87; margin-bottom: 4px;">
                            ➖ Negative (${negativeNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${negativeNums.map(n => numBadge(n, '#9333ea', '#7e22ce')).join('')}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 10px; border: 2px solid #22c55e;">
                        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
                            0 Table (${zeroTableNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${zeroTableNums.map(n => numBadge(n, '#16a34a', '#15803d')).join('')}
                        </div>
                    </div>
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 10px; border: 2px solid #a855f7;">
                        <div style="font-size: 12px; font-weight: 700; color: #581c87; margin-bottom: 4px;">
                            19 Table (${nineteenTableNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${nineteenTableNums.map(n => numBadge(n, '#9333ea', '#7e22ce')).join('')}
                        </div>
                    </div>
                </div>
                ${resultHistoryHTML}
                <div style="font-size: 12px; line-height: 1.7; color: #475569;">
                    <strong style="color: #1e293b; font-size: 13px;">CALCULATION DETAILS:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 22px; list-style: none;">
                        <li style="margin-bottom: 4px;">• Sources: <strong>${prediction.reasoning ? prediction.reasoning.selected_pairs?.join(', ') : 'N/A'}</strong></li>
                        <li style="margin-bottom: 4px;">• Total bet numbers: <strong>${allNumbers.length}</strong></li>
                        <li style="margin-bottom: 4px;">• Anchor groups: <strong>${anchorGroups.length}</strong> (covering ${anchorGroups.reduce((s, g) => s + (g.group ? g.group.length : 0), 0)} numbers)</li>
                        <li style="margin-bottom: 4px;">• Loose: <strong>${loose.length}</strong></li>
                        ${extraNumbers.length > 0 ? `<li style="margin-bottom: 4px;">• Extra (3rd ref): <strong style="color: #6b7280;">${extraNumbers.length}</strong> — ${extraNumbers.join(', ')}</li>` : ''}
                    </ul>
                </div>
                ${this._buildDebugPanel(prediction)}
            `;
        }

        // 4. UPDATE WHEEL HIGHLIGHTS (wheel also syncs money panel after applying filters)
        try {
            if (window.rouletteWheel && typeof window.rouletteWheel.updateHighlights === 'function') {
                window.rouletteWheel.updateHighlights(anchors, loose, anchorGroups, extraNumbers, prediction);
                console.log('✅ Wheel highlights updated with anchor groups + extra numbers');
            } else {
                // Fallback: update money panel directly if wheel not available
                if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function') {
                    window.moneyPanel.setPrediction(prediction);
                    console.log('✅ Money panel updated (direct)');
                }
            }
        } catch (e) {
            console.warn('⚠️ Wheel/Money panel update from AI failed:', e.message);
        }

        console.log('✅ AI panel updated successfully!');
    }

    // ═══════════════════════════════════════════════════════
    //  DEBUG / VERIFICATION PANEL (collapsible)
    // ═══════════════════════════════════════════════════════

    _buildDebugPanel(prediction) {
        const debug = prediction.debugData;
        if (!debug) return '';

        const badgeMini = (n, bg) => `<span style="display:inline-block;padding:1px 5px;border-radius:4px;background:${bg || '#475569'};color:#fff;font-weight:700;font-size:10px;margin:1px;">${n}</span>`;

        // --- Section 1: Selected Pairs ---
        let selectionsHTML = '';

        if (debug.t3Selections && debug.t3Selections.length > 0) {
            selectionsHTML += `<div style="margin-bottom:6px;">
                <strong style="color:#dc2626;">Table 3:</strong> ${debug.t3Selections.map(p => `<code style="background:#fee2e2;padding:1px 4px;border-radius:3px;font-size:10px;">${p}</code>`).join(' ')}
            </div>`;
        }

        if (debug.t1Selections && Object.keys(debug.t1Selections).length > 0) {
            const t1Items = Object.entries(debug.t1Selections).map(([pair, refs]) =>
                `<code style="background:#dbeafe;padding:1px 4px;border-radius:3px;font-size:10px;">${pair} [${refs.join(',')}]</code>`
            ).join(' ');
            selectionsHTML += `<div style="margin-bottom:6px;">
                <strong style="color:#2563eb;">Table 1:</strong> ${t1Items}
            </div>`;
        }

        if (debug.t2Selections && Object.keys(debug.t2Selections).length > 0) {
            const t2Items = Object.entries(debug.t2Selections).map(([pair, refs]) =>
                `<code style="background:#dcfce7;padding:1px 4px;border-radius:3px;font-size:10px;">${pair} [${refs.join(',')}]</code>`
            ).join(' ');
            selectionsHTML += `<div style="margin-bottom:6px;">
                <strong style="color:#16a34a;">Table 2:</strong> ${t2Items}
            </div>`;
        }

        // --- Section 1b: Per-Pair Individual Numbers ---
        let pairDetailsHTML = '';
        if (debug.pairDetails && debug.pairDetails.length > 0) {
            const tableColors = { T3: '#dc2626', T1: '#2563eb', T2: '#16a34a' };
            pairDetailsHTML = debug.pairDetails.map(pd => {
                const color = tableColors[pd.table] || '#475569';
                const isExtra = pd.refs[0] && pd.refs[0].includes('(extra)');
                const bg = isExtra ? '#f9fafb' : '#f8fafc';
                const borderStyle = isExtra ? 'dashed' : 'solid';
                return `<div style="margin-bottom:4px; padding:4px 8px; background:${bg}; border-left:3px ${borderStyle} ${isExtra ? '#9ca3af' : color}; border-radius:3px;">
                    <span style="font-weight:700; color:${isExtra ? '#6b7280' : color}; font-size:10px;">
                        ${pd.table} → ${pd.pair} [${pd.refs.join(',')}] — ${pd.numbers.length} nums
                    </span><br/>
                    <span style="line-height:1.8;">${pd.numbers.map(n => badgeMini(n, isExtra ? '#9ca3af' : color)).join('')}</span>
                </div>`;
            }).join('');
        }

        // --- Section 2: Per-Table Union Numbers ---
        let tableUnionsHTML = '';
        if (debug.tableSets && debug.tableSets.length > 0) {
            tableUnionsHTML = debug.tableSets.map(ts => {
                const color = ts.source.startsWith('T3') ? '#dc2626' : ts.source.startsWith('T1') ? '#2563eb' : '#16a34a';
                return `<div style="margin-bottom:8px; padding:6px 8px; background:#f8fafc; border-left:3px solid ${color}; border-radius:4px;">
                    <div style="font-weight:700; color:${color}; font-size:11px; margin-bottom:4px;">${ts.source} — ${ts.count} numbers (UNION within table)</div>
                    <div style="line-height:1.8;">${ts.numbers.map(n => badgeMini(n, color)).join('')}</div>
                </div>`;
            }).join('');
        }

        // --- Section 3: Intersection Step ---
        let intersectionHTML = '';
        if (debug.primaryIntersection) {
            const count = debug.primaryIntersection.length;
            intersectionHTML = `<div style="margin-bottom:8px; padding:6px 8px; background:#fffbeb; border-left:3px solid #f59e0b; border-radius:4px;">
                <div style="font-weight:700; color:#b45309; font-size:11px; margin-bottom:4px;">
                    Primary Intersection — ${count} numbers (COMMON across ALL selected pairs)
                </div>
                <div style="line-height:1.8;">${debug.primaryIntersection.map(n => badgeMini(n, '#b45309')).join('')}</div>
            </div>`;
        }

        // --- Section 4: Final Numbers (after 0/26 pairing) ---
        let finalHTML = '';
        if (debug.finalNumbers) {
            const count = debug.finalNumbers.length;
            finalHTML = `<div style="margin-bottom:8px; padding:6px 8px; background:#ecfdf5; border-left:3px solid #10b981; border-radius:4px;">
                <div style="font-weight:700; color:#065f46; font-size:11px; margin-bottom:4px;">
                    Final Numbers — ${count} (after 0/26 pairing)
                </div>
                <div style="line-height:1.8;">${debug.finalNumbers.map(n => badgeMini(n, '#10b981')).join('')}</div>
            </div>`;
        }

        // --- Section 5: Extra/Grey Numbers ---
        let extraHTML = '';
        if (debug.extraNumbers && debug.extraNumbers.length > 0) {
            // Show per-table extra sets
            let extraSetsDetail = '';
            if (debug.pairExtraSets && debug.pairExtraSets.length > 0) {
                extraSetsDetail = debug.pairExtraSets.map((es, idx) => {
                    return `<div style="margin-bottom:4px; padding:4px 6px; background:#f1f5f9; border-radius:3px;">
                        <span style="font-weight:600; color:#6b7280; font-size:10px;">Extra Set ${idx + 1} (3rd ref union): ${es.count} numbers</span><br/>
                        <span style="line-height:1.8;">${es.numbers.map(n => badgeMini(n, '#9ca3af')).join('')}</span>
                    </div>`;
                }).join('');
            }

            extraHTML = `<div style="margin-bottom:8px; padding:6px 8px; background:#f9fafb; border-left:3px solid #9ca3af; border-radius:4px;">
                <div style="font-weight:700; color:#4b5563; font-size:11px; margin-bottom:4px;">
                    Grey/Extra Numbers — ${debug.extraNumbers.length} (extended intersection minus primary)
                </div>
                ${extraSetsDetail}
                <div style="margin-top:4px; padding:4px 6px; background:#e5e7eb; border-radius:3px;">
                    <span style="font-weight:600; color:#374151; font-size:10px;">Final Extra (after intersection + 0/26):</span><br/>
                    <span style="line-height:1.8;">${debug.extraNumbers.map(n => badgeMini(n, '#6b7280')).join('')}</span>
                </div>
            </div>`;
        }

        // --- Section 6: Anchor Group Breakdown ---
        const anchorGroups = prediction.anchor_groups || [];
        const loose = prediction.loose || [];
        let anchorBreakdownHTML = '';
        if (anchorGroups.length > 0 || loose.length > 0) {
            const groupDetails = anchorGroups.map((ag, idx) => {
                const group = ag.group || [];
                const anchorNum = ag.anchor;
                const type = ag.type || '±1';
                return `<span style="font-size:10px; color:#334155;">
                    <strong>${type}</strong> anchor=<strong>${anchorNum}</strong> → [${group.join(', ')}]
                </span>`;
            }).join('<br/>');

            anchorBreakdownHTML = `<div style="margin-bottom:8px; padding:6px 8px; background:#faf5ff; border-left:3px solid #a855f7; border-radius:4px;">
                <div style="font-weight:700; color:#7e22ce; font-size:11px; margin-bottom:4px;">
                    Anchor Groups (${anchorGroups.length}) + Loose (${loose.length})
                </div>
                <div style="margin-bottom:4px;">${groupDetails}</div>
                ${loose.length > 0 ? `<div style="font-size:10px; color:#991b1b;">Loose: [${loose.sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99)).join(', ')}]</div>` : ''}
            </div>`;
        }

        return `
            <details style="margin-top: 12px; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden;">
                <summary style="
                    padding: 10px 14px;
                    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                    cursor: pointer;
                    font-weight: 700;
                    font-size: 12px;
                    color: #334155;
                    user-select: none;
                    list-style: none;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <span style="font-size: 14px;">🔍</span>
                    VERIFICATION — Click to see full calculation breakdown
                    <span style="margin-left:auto; font-size:10px; color:#64748b;">▼</span>
                </summary>
                <div style="padding: 12px; font-size: 11px; line-height: 1.5; max-height: 500px; overflow-y: auto; background: #fff;">
                    <div style="margin-bottom:10px; font-weight:700; color:#1e293b; font-size:12px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">
                        📋 SELECTED PAIRS
                    </div>
                    ${selectionsHTML}

                    ${pairDetailsHTML ? `
                    <div style="margin-bottom:10px; margin-top:14px; font-weight:700; color:#1e293b; font-size:12px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">
                        📝 PER-PAIR NUMBERS (individual ref contributions)
                    </div>
                    ${pairDetailsHTML}` : ''}

                    <div style="margin-bottom:10px; margin-top:14px; font-weight:700; color:#1e293b; font-size:12px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">
                        📊 PER-TABLE UNIONS (numbers from selected refs)
                    </div>
                    ${tableUnionsHTML}

                    <div style="margin-bottom:10px; margin-top:14px; font-weight:700; color:#1e293b; font-size:12px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">
                        🔀 INTERSECTION (common numbers across tables)
                    </div>
                    ${intersectionHTML}
                    ${finalHTML}

                    ${extraHTML ? `
                    <div style="margin-bottom:10px; margin-top:14px; font-weight:700; color:#1e293b; font-size:12px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">
                        🔘 GREY / EXTRA NUMBERS
                    </div>
                    ${extraHTML}` : ''}

                    <div style="margin-bottom:10px; margin-top:14px; font-weight:700; color:#1e293b; font-size:12px; border-bottom:1px solid #e5e7eb; padding-bottom:4px;">
                        🎯 ANCHOR ANALYSIS
                    </div>
                    ${anchorBreakdownHTML}
                </div>
            </details>
        `;
    }

    // ═══════════════════════════════════════════════════════
    //  UPDATE DISPLAY WITH FILTERED PREDICTION (called by wheel filters)
    // ═══════════════════════════════════════════════════════

    updateFilteredDisplay(filteredPrediction) {
        if (!filteredPrediction || !this.currentPrediction) return;

        // Build a merged prediction: keep original debug/reasoning data but use filtered numbers
        const mergedPrediction = {
            ...this.currentPrediction,
            numbers: filteredPrediction.numbers,
            anchors: filteredPrediction.anchors,
            loose: filteredPrediction.loose,
            anchor_groups: filteredPrediction.anchor_groups,
            extraNumbers: filteredPrediction.extraNumbers || []
        };

        console.log(`🔄 AI Panel: Updating display with ${mergedPrediction.numbers.length} filtered numbers (was ${this.currentPrediction.numbers?.length || 0} unfiltered)`);

        const anchors = mergedPrediction.anchors || [];
        const loose = mergedPrediction.loose || [];
        const allNumbers = mergedPrediction.numbers || [];
        const anchorGroups = mergedPrediction.anchor_groups || [];

        // Sort anchor groups by European wheel position of their anchor number
        anchorGroups.sort((a, b) => (WHEEL_POS[a.anchor] ?? 99) - (WHEEL_POS[b.anchor] ?? 99));
        const extraNumbers = mergedPrediction.extraNumbers || [];

        // Color palette for anchor groups (same as updatePrediction)
        const groupColors = [
            { bg: '#fef3c7', border: '#f59e0b', anchorBg: '#f59e0b', neighborBg: '#fbbf24', text: '#000' },
            { bg: '#dbeafe', border: '#3b82f6', anchorBg: '#3b82f6', neighborBg: '#60a5fa', text: '#fff' },
            { bg: '#dcfce7', border: '#22c55e', anchorBg: '#22c55e', neighborBg: '#4ade80', text: '#fff' },
            { bg: '#f3e8ff', border: '#a855f7', anchorBg: '#a855f7', neighborBg: '#c084fc', text: '#fff' },
            { bg: '#ffedd5', border: '#f97316', anchorBg: '#f97316', neighborBg: '#fb923c', text: '#fff' },
            { bg: '#fce7f3', border: '#ec4899', anchorBg: '#ec4899', neighborBg: '#f472b6', text: '#fff' },
            { bg: '#e0f2fe', border: '#0ea5e9', anchorBg: '#0ea5e9', neighborBg: '#38bdf8', text: '#fff' },
            { bg: '#ecfdf5', border: '#10b981', anchorBg: '#10b981', neighborBg: '#34d399', text: '#fff' },
        ];

        // 1. UPDATE SIGNAL
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            const extraText = extraNumbers.length > 0 ? ` + ${extraNumbers.length} EXTRA` : '';
            signalIndicator.textContent = `✅ ${allNumbers.length} COMMON${extraText}`;
            signalIndicator.style.backgroundColor = allNumbers.length > 0 ? '#22c55e' : '#f59e0b';
            signalIndicator.style.color = 'white';
        }

        // 2. UPDATE NUMBERS DISPLAY
        const numbersDiv = document.querySelector('#aiResultsPanel .prediction-numbers');
        if (numbersDiv && allNumbers.length > 0) {
            let anchorGroupsHTML = '';
            if (anchorGroups.length > 0) {
                anchorGroupsHTML = anchorGroups.map((ag, idx) => {
                    const color = groupColors[idx % groupColors.length];
                    const group = ag.group || [];
                    const anchorNum = ag.anchor;
                    const anchorType = ag.type || '±1';

                    const numbersHTML = group.map(n => {
                        const isAnchor = (n === anchorNum);
                        return `<span style="
                            display: inline-block;
                            padding: 10px 14px;
                            border-radius: 10px;
                            background: ${isAnchor ? color.anchorBg : color.neighborBg};
                            color: ${isAnchor ? color.text : color.text};
                            border: 3px solid ${color.border};
                            font-weight: bold;
                            font-size: 17px;
                            min-width: 42px;
                            text-align: center;
                            box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                            position: relative;
                            ${isAnchor ? 'text-decoration: underline; text-underline-offset: 3px;' : 'opacity: 0.85;'}
                        ">${n}${isAnchor ? `<span style="
                            position: absolute;
                            top: -8px;
                            right: -8px;
                            background: #1e293b;
                            color: #fff;
                            font-size: 9px;
                            font-weight: 700;
                            padding: 1px 4px;
                            border-radius: 4px;
                            border: 1px solid ${color.border};
                            line-height: 1.2;
                        ">${anchorType}</span>` : ''}</span>`;
                    }).join('');

                    return `
                        <div style="
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            padding: 8px 10px;
                            background: ${color.bg};
                            border: 2px solid ${color.border};
                            border-radius: 12px;
                            margin-bottom: 6px;
                        ">
                            ${numbersHTML}
                        </div>
                    `;
                }).join('');
            }

            let looseHTML = '';
            if (loose.length > 0) {
                looseHTML = loose.sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99)).map(n => `
                    <span style="
                        display: inline-block;
                        padding: 10px 14px;
                        border-radius: 10px;
                        background: #ef4444;
                        color: white;
                        border: 3px solid #dc2626;
                        font-weight: bold;
                        font-size: 17px;
                        min-width: 42px;
                        text-align: center;
                        box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                    ">${n}</span>
                `).join('');
            }

            numbersDiv.innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #374151; margin-bottom: 12px; font-size: 15px;">
                        🎯 PREDICTION: ${allNumbers.length} numbers to bet
                    </div>

                    ${anchorGroups.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; border: 2px solid #94a3b8;">
                        <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 10px;">
                            🎯 ANCHORS (${anchors.length}) — ±1 = 3 covered, ±2 = 5 covered
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${anchorGroupsHTML}
                        </div>
                    </div>` : ''}

                    ${loose.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 10px; border: 2px solid #ef4444;">
                        <div style="font-size: 13px; font-weight: 700; color: #991b1b; margin-bottom: 8px;">
                            🔴 LOOSE (${loose.length}) — not covered by any anchor
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                            ${looseHTML}
                        </div>
                    </div>` : `
                    <div style="padding: 8px 12px; background: #ecfdf5; border-radius: 8px; border: 1px solid #10b981; color: #065f46; font-size: 13px; font-weight: 600;">
                        ✅ All numbers covered by anchor groups — no loose numbers!
                    </div>`}

                    ${extraNumbers.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-radius: 10px; border: 2px dashed #9ca3af;">
                        <div style="font-size: 13px; font-weight: 700; color: #4b5563; margin-bottom: 8px;">
                            🔘 EXTRA (${extraNumbers.length}) — 3rd ref numbers (optional bets)
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                            ${extraNumbers.map(n => `
                                <span style="
                                    display: inline-block;
                                    padding: 10px 14px;
                                    border-radius: 10px;
                                    background: #9ca3af;
                                    color: white;
                                    border: 3px solid #6b7280;
                                    font-weight: bold;
                                    font-size: 17px;
                                    min-width: 42px;
                                    text-align: center;
                                    box-shadow: 0 3px 6px rgba(0,0,0,0.15);
                                    opacity: 0.7;
                                ">${n}</span>
                            `).join('')}
                        </div>
                    </div>` : ''}
                </div>
            `;
        } else if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">No common numbers found after filtering</div>';
        }

        // 3. UPDATE CLASSIFICATION (Positive/Negative & Zero/19 table)
        const reasoningDiv = document.querySelector('#aiResultsPanel .prediction-reasoning');
        if (reasoningDiv) {
            const ZERO_TABLE = [3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7];
            const NINETEEN_TABLE = [15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35];
            const POSITIVE = [3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22];
            const NEGATIVE = [21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35];

            const zeroTableSet = new Set(ZERO_TABLE);
            const nineteenTableSet = new Set(NINETEEN_TABLE);
            const positiveSet = new Set(POSITIVE);
            const negativeSet = new Set(NEGATIVE);

            const positiveNums = allNumbers.filter(n => positiveSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
            const negativeNums = allNumbers.filter(n => negativeSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
            const zeroTableNums = allNumbers.filter(n => zeroTableSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));
            const nineteenTableNums = allNumbers.filter(n => nineteenTableSet.has(n)).sort((a, b) => (WHEEL_POS[a] ?? 99) - (WHEEL_POS[b] ?? 99));

            const numBadge = (n, color, borderColor) => `<span style="
                display: inline-block; padding: 4px 8px; border-radius: 6px;
                background: ${color}; color: white; border: 2px solid ${borderColor};
                font-weight: bold; font-size: 13px; min-width: 28px; text-align: center;
                margin: 2px;
            ">${n}</span>`;

            // Keep the result history and debug panel from the original prediction
            const resultHistory = this.currentPrediction?.result_history || [];
            let resultHistoryHTML = '';
            if (resultHistory.length > 0) {
                const total = resultHistory.length;
                const hits = resultHistory.filter(r => r.hit).length;
                const misses = total - hits;
                const hitPct = ((hits / total) * 100).toFixed(0);
                const missPct = ((misses / total) * 100).toFixed(0);
                const summaryIcons = resultHistory.slice().reverse().map(r => r.hit ? '✅' : '❌').join('');
                const lastResult = resultHistory[resultHistory.length - 1];

                resultHistoryHTML = `
                <div style="margin-bottom: 12px; padding: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; border: 2px solid #64748b;">
                    <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px;">
                        📊 RESULT TRACKER
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 6px;">
                        <span style="font-size: 13px; color: #334155;">
                            Last: <strong>${lastResult.actual}</strong> —
                            <span style="color: ${lastResult.hit ? '#16a34a' : '#dc2626'}; font-weight: bold;">
                                ${lastResult.hit ? '✅ HIT!' : '❌ MISS'}
                            </span>
                        </span>
                        <span style="font-size: 13px;">
                            <span style="color: #16a34a; font-weight: bold;">Hit: ${hits}/${total} (${hitPct}%)</span>
                            &nbsp;|&nbsp;
                            <span style="color: #dc2626; font-weight: bold;">Miss: ${misses}/${total} (${missPct}%)</span>
                        </span>
                    </div>
                    <div style="font-size: 16px; letter-spacing: 2px;">${summaryIcons}</div>
                </div>`;
            }

            reasoningDiv.innerHTML = `
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 10px; border: 2px solid #22c55e;">
                        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
                            ➕ Positive (${positiveNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${positiveNums.map(n => numBadge(n, '#16a34a', '#15803d')).join('')}
                        </div>
                    </div>
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 10px; border: 2px solid #a855f7;">
                        <div style="font-size: 12px; font-weight: 700; color: #581c87; margin-bottom: 4px;">
                            ➖ Negative (${negativeNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${negativeNums.map(n => numBadge(n, '#9333ea', '#7e22ce')).join('')}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 10px; border: 2px solid #22c55e;">
                        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 4px;">
                            0 Table (${zeroTableNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${zeroTableNums.map(n => numBadge(n, '#16a34a', '#15803d')).join('')}
                        </div>
                    </div>
                    <div style="flex: 1; padding: 10px; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 10px; border: 2px solid #a855f7;">
                        <div style="font-size: 12px; font-weight: 700; color: #581c87; margin-bottom: 4px;">
                            19 Table (${nineteenTableNums.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 2px;">
                            ${nineteenTableNums.map(n => numBadge(n, '#9333ea', '#7e22ce')).join('')}
                        </div>
                    </div>
                </div>
                ${resultHistoryHTML}
                <div style="font-size: 12px; line-height: 1.7; color: #475569;">
                    <strong style="color: #1e293b; font-size: 13px;">CALCULATION DETAILS:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 22px; list-style: none;">
                        <li style="margin-bottom: 4px;">• Sources: <strong>${this.currentPrediction?.reasoning ? this.currentPrediction.reasoning.selected_pairs?.join(', ') : 'N/A'}</strong></li>
                        <li style="margin-bottom: 4px;">• Total bet numbers: <strong>${allNumbers.length}</strong> (filtered)</li>
                        <li style="margin-bottom: 4px;">• Anchor groups: <strong>${anchorGroups.length}</strong> (covering ${anchorGroups.reduce((s, g) => s + (g.group ? g.group.length : 0), 0)} numbers)</li>
                        <li style="margin-bottom: 4px;">• Loose: <strong>${loose.length}</strong></li>
                        ${extraNumbers.length > 0 ? `<li style="margin-bottom: 4px;">• Extra (3rd ref): <strong style="color: #6b7280;">${extraNumbers.length}</strong> — ${extraNumbers.join(', ')}</li>` : ''}
                    </ul>
                </div>
                ${this._buildDebugPanel(this.currentPrediction)}
            `;
        }

        console.log(`✅ AI Panel display updated with filtered numbers: ${allNumbers.length} primary + ${extraNumbers.length} extra`);
    }

    // ═══════════════════════════════════════════════════════
    //  CLEAR ALL PREDICTION DISPLAYS
    // ═══════════════════════════════════════════════════════

    _clearAllPredictionDisplays() {
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = 'SELECT PAIRS';
            signalIndicator.style.backgroundColor = '#64748b';
        }

        const numbersDiv = document.querySelector('#aiResultsPanel .prediction-numbers');
        if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">Select pairs to see predictions</div>';
        }

        const reasoningDiv = document.querySelector('#aiResultsPanel .prediction-reasoning');
        if (reasoningDiv) {
            reasoningDiv.innerHTML = `
                <strong style="color: #1e293b;">HOW IT WORKS:</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 22px;">
                    <li>Select pairs from any table</li>
                    <li>System finds common numbers (intersection)</li>
                    <li>Numbers include wheel neighbors</li>
                    <li>Shows anchors and loose numbers to bet</li>
                </ul>
            `;
        }

        if (window.rouletteWheel && typeof window.rouletteWheel.clearHighlights === 'function') {
            window.rouletteWheel.clearHighlights();
        }

        if (window.moneyPanel) {
            window.moneyPanel.pendingBet = null;
            if (typeof window.moneyPanel.render === 'function') {
                window.moneyPanel.render();
            }
        }

        this.currentPrediction = null;
        console.log('🧹 All prediction displays cleared');
    }
}

// Create global instance
window.aiPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.aiPanel = new AIPredictionPanel();
        console.log('✅ AI Prediction Panel ready with multi-table selection');
    }, 150);
});

console.log('✅ AI Prediction Panel script loaded (Multi-Table Mode)');
