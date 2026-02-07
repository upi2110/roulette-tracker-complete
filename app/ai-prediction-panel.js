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

        this.createPanel();
        this.setupToggle();

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
                    <div id="table3Checkboxes" style="padding: 8px; background: white; display: block;">
                        <div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter spins to see pairs</div>
                    </div>
                </div>

                <!-- TABLE 2 SELECTION -->
                <div class="table-selection-section" data-table="2" style="margin-top: 6px;">
                    <div class="table-selection-header" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #065f46; padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 2px solid #6ee7b7; cursor: pointer; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                        📊 TABLE 2 — 18 Codes (±2 neighbors)
                        <span style="float: right; font-size: 11px; color: #065f46;">T2 Selected: <span id="t2Count">0</span></span>
                    </div>
                    <div id="table2Checkboxes" style="padding: 8px; background: white; display: block;">
                        <div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter spins to see pairs</div>
                    </div>
                </div>

                <!-- TABLE 1 SELECTION -->
                <div class="table-selection-section" data-table="1" style="margin-top: 6px;">
                    <div class="table-selection-header" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; padding: 8px 12px; font-weight: bold; font-size: 12px; border-bottom: 2px solid #fbbf24; cursor: pointer; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                        📊 TABLE 1 — 10 Codes (±1 neighbors)
                        <span style="float: right; font-size: 11px; color: #92400e;">T1 Selected: <span id="t1Count">0</span></span>
                    </div>
                    <div id="table1Checkboxes" style="padding: 8px; background: white; display: block;">
                        <div style="color: #64748b; font-style: italic; font-size: 11px; text-align: center; padding: 8px;">Enter spins to see pairs</div>
                    </div>
                </div>

                <!-- SIGNAL INDICATOR (stays in selection panel for quick feedback) -->
                <div class="prediction-status" style="margin-top: 10px;">
                    <div id="signalIndicator" class="signal-indicator signal-wait" style="
                        padding: 12px 24px;
                        border-radius: 8px;
                        background-color: #6b7280;
                        color: white;
                        font-weight: bold;
                        font-size: 16px;
                        text-align: center;
                        margin-bottom: 0;
                    ">SELECT PAIRS</div>
                </div>
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
            'prevPlus2': 'P+2', 'prevMinus2': 'P-2', 'prevPrev': 'P-PREV',
            'prev_13opp': 'P-13OPP', 'prevPlus1_13opp': 'P+1-13OPP',
            'prevMinus1_13opp': 'P-1-13OPP', 'prevPlus2_13opp': 'P+2-13OPP',
            'prevMinus2_13opp': 'P-2-13OPP'
        };

        // Table 3
        const t3Next = tableData.table3NextProjections || {};
        this.table3Pairs = Object.keys(t3Next)
            .filter(k => t3Next[k]?.numbers?.length > 0)
            .map(k => ({ key: k, display: pairDisplayNames[k] || k, data: t3Next[k] }));

        // Keep backward compat alias
        this.availablePairs = this.table3Pairs;

        // Table 1
        const t1Next = tableData.table1NextProjections || {};
        this.table1Pairs = Object.keys(t1Next)
            .filter(k => {
                const d = t1Next[k];
                return d && (d.first?.numbers?.length > 0 || d.second?.numbers?.length > 0 || d.third?.numbers?.length > 0);
            })
            .map(k => ({ key: k, display: pairDisplayNames[k] || k, data: t1Next[k] }));

        // Table 2
        const t2Next = tableData.table2NextProjections || {};
        this.table2Pairs = Object.keys(t2Next)
            .filter(k => {
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
        // Unified color map across all 3 tables
        const colorMap = {
            'ref0': '#dc2626', 'ref0_13opp': '#dc2626',
            'ref19': '#ea580c', 'ref19_13opp': '#ea580c',
            'prev': '#d97706', 'prev_13opp': '#d97706',
            'prevPlus1': '#16a34a', 'prevPlus1_13opp': '#16a34a',
            'prevMinus1': '#0d9488', 'prevMinus1_13opp': '#0d9488',
            'prevPlus2': '#2563eb', 'prevPlus2_13opp': '#2563eb',
            'prevMinus2': '#7c3aed', 'prevMinus2_13opp': '#7c3aed',
            'prevPrev': '#db2777'
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
            // Auto-select the 2 refs that hit most recently
            if (!this._extraRefs) this._extraRefs = {};
            if (window.getAutoSelectedRefs && window.spins && window.spins.length >= 2) {
                const autoRefs = window.getAutoSelectedRefs(pairKey, tableId);
                selections[pairKey] = new Set(autoRefs.primaryRefs);
                this._extraRefs[`${tableId}:${pairKey}`] = autoRefs.extraRef;
                console.log(`✅ Auto-selected refs for ${pairKey}: primary=[${[...autoRefs.primaryRefs].join(',')}], extra=${autoRefs.extraRef}`);
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
        }

        const pairs = tableId === 'table1' ? this.table1Pairs : this.table2Pairs;
        this._renderTable12Checkboxes(tableId, pairs, selections);
        this.updateSingleTableHighlights(tableId, highlightSet);
        this._updateCounts();
        this._autoTriggerPredictions();
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
    //  ON SPIN ADDED
    // ═══════════════════════════════════════════════════════

    onSpinAdded() {
        this.loadAvailablePairs();
        this.updateTable3Highlights();

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

            // Collect number sets — UNION within each table, INTERSECTION across tables
            // tableSets: one merged set per table (union of all selected pairs in that table)
            const tableSets = [];

            // --- TABLE 3: UNION all selected pairs ---
            if (this.table3Selections.size > 0) {
                const t3Projections = tableData.table3NextProjections || {};
                const t3Union = new Set();
                const t3Sources = [];

                this.table3Selections.forEach(pairKey => {
                    const pairData = t3Projections[pairKey];
                    if (pairData && pairData.numbers && pairData.numbers.length > 0) {
                        pairData.numbers.forEach(n => t3Union.add(n));
                        t3Sources.push(pairKey);
                    }
                });

                if (t3Union.size > 0) {
                    tableSets.push({
                        source: `T3:[${t3Sources.join(',')}]`,
                        numbers: t3Union
                    });
                }
            }

            // --- TABLE 1: UNION all selected pairs (primary + extra) ---
            const tableExtraSets = []; // Extra ref unions per table (for grey numbers)

            if (Object.keys(this.table1Selections).length > 0) {
                const t1Projections = tableData.table1NextProjections || {};
                const t1PrimaryUnion = new Set();
                const t1ExtraUnion = new Set();
                const t1Sources = [];

                Object.entries(this.table1Selections).forEach(([pairKey, refSet]) => {
                    const pairData = t1Projections[pairKey];
                    if (!pairData) return;

                    // Primary refs (the auto-selected 2)
                    refSet.forEach(refKey => {
                        const refData = pairData[refKey];
                        if (refData && refData.numbers) {
                            refData.numbers.forEach(n => t1PrimaryUnion.add(n));
                        }
                    });

                    // Extra ref (the 3rd one, not in refSet)
                    const extraRefKey = this._extraRefs?.[`table1:${pairKey}`];
                    if (extraRefKey && !refSet.has(extraRefKey)) {
                        const extraData = pairData[extraRefKey];
                        if (extraData && extraData.numbers) {
                            extraData.numbers.forEach(n => t1ExtraUnion.add(n));
                        }
                    }

                    t1Sources.push(`${pairKey}[${Array.from(refSet).join(',')}]`);
                });

                if (t1PrimaryUnion.size > 0) {
                    tableSets.push({
                        source: `T1:[${t1Sources.join(',')}]`,
                        numbers: t1PrimaryUnion
                    });
                    if (t1ExtraUnion.size > 0) {
                        tableExtraSets.push({ numbers: t1ExtraUnion, primaryNumbers: t1PrimaryUnion });
                    }
                }
            }

            // --- TABLE 2: UNION all selected pairs (primary + extra) ---
            if (Object.keys(this.table2Selections).length > 0) {
                const t2Projections = tableData.table2NextProjections || {};
                const t2PrimaryUnion = new Set();
                const t2ExtraUnion = new Set();
                const t2Sources = [];

                Object.entries(this.table2Selections).forEach(([pairKey, refSet]) => {
                    const pairData = t2Projections[pairKey];
                    if (!pairData) return;

                    // Primary refs
                    refSet.forEach(refKey => {
                        const refData = pairData[refKey];
                        if (refData && refData.numbers) {
                            refData.numbers.forEach(n => t2PrimaryUnion.add(n));
                        }
                    });

                    // Extra ref
                    const extraRefKey = this._extraRefs?.[`table2:${pairKey}`];
                    if (extraRefKey && !refSet.has(extraRefKey)) {
                        const extraData = pairData[extraRefKey];
                        if (extraData && extraData.numbers) {
                            extraData.numbers.forEach(n => t2ExtraUnion.add(n));
                        }
                    }

                    t2Sources.push(`${pairKey}[${Array.from(refSet).join(',')}]`);
                });

                if (t2PrimaryUnion.size > 0) {
                    tableSets.push({
                        source: `T2:[${t2Sources.join(',')}]`,
                        numbers: t2PrimaryUnion
                    });
                    if (t2ExtraUnion.size > 0) {
                        tableExtraSets.push({ numbers: t2ExtraUnion, primaryNumbers: t2PrimaryUnion });
                    }
                }
            }

            if (tableSets.length === 0) {
                throw new Error('No numbers available from selected pairs');
            }

            console.log('📊 Table sets (UNION within each table):', tableSets.map(s => ({
                source: s.source,
                count: s.numbers.size,
                numbers: Array.from(s.numbers).sort((a, b) => a - b)
            })));

            // --- INTERSECTION across tables (PRIMARY) ---
            // If only 1 table selected → use that table's union directly
            // If multiple tables selected → find common numbers
            let intersection;
            if (tableSets.length === 1) {
                intersection = new Set(tableSets[0].numbers);
            } else {
                intersection = new Set(tableSets[0].numbers);
                for (let i = 1; i < tableSets.length; i++) {
                    const next = tableSets[i].numbers;
                    intersection = new Set([...intersection].filter(n => next.has(n)));
                }
            }

            // --- EXTRA NUMBERS (grey — from 3rd ref) ---
            // Build "extended" sets per table: primary + extra union merged
            // Then intersect those across tables to get "all possible" numbers
            // extraNumbers = allPossible - primaryIntersection
            let extraNumbers = [];
            if (tableExtraSets.length > 0 && tableSets.length >= 1) {
                // Build extended sets: for each table that has an extra set, merge primary+extra
                // For tables that DON'T have extra sets (e.g., T3), use their primary set as-is
                const extendedSets = tableSets.map((ts, idx) => {
                    // Find matching extra set for this table
                    const extraEntry = tableExtraSets.find(es => es.primaryNumbers === ts.numbers);
                    if (extraEntry) {
                        const merged = new Set(ts.numbers);
                        extraEntry.numbers.forEach(n => merged.add(n));
                        return merged;
                    }
                    return ts.numbers; // No extra for this table, use primary
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

                extraNumbers.sort((a, b) => a - b);
                console.log(`🔘 Extra numbers (3rd ref): ${extraNumbers.length}:`, extraNumbers);
            }

            // Also track per-pair sets for logging
            const numberSets = tableSets;

            let finalNumbers = Array.from(intersection);

            // Apply 0/26 pairing rule
            const has0 = finalNumbers.includes(0);
            const has26 = finalNumbers.includes(26);
            if (has0 && !has26) finalNumbers.push(26);
            if (has26 && !has0) finalNumbers.push(0);

            finalNumbers.sort((a, b) => a - b);

            console.log(`🎯 Intersection: ${finalNumbers.length} numbers:`, finalNumbers);

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
                return;
            }

            // Calculate anchors (frontend)
            const { anchors, loose, anchorGroups } = window.calculateWheelAnchors(finalNumbers);

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
                reasoning: {
                    selected_pairs: numberSets.map(s => s.source),
                    pair_count: numberSets.length,
                    strategy: 'Cross-Table Intersection'
                }
            };

            console.log('✅ Frontend prediction:', prediction);

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
                looseHTML = loose.sort((a, b) => a - b).map(n => `
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

            const positiveNums = allNumbers.filter(n => positiveSet.has(n)).sort((a, b) => a - b);
            const negativeNums = allNumbers.filter(n => negativeSet.has(n)).sort((a, b) => a - b);
            const zeroTableNums = allNumbers.filter(n => zeroTableSet.has(n)).sort((a, b) => a - b);
            const nineteenTableNums = allNumbers.filter(n => nineteenTableSet.has(n)).sort((a, b) => a - b);

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
            `;
        }

        // 4. UPDATE WHEEL HIGHLIGHTS
        if (window.rouletteWheel && typeof window.rouletteWheel.updateHighlights === 'function') {
            window.rouletteWheel.updateHighlights(anchors, loose, anchorGroups, extraNumbers);
            console.log('✅ Wheel highlights updated with anchor groups + extra numbers');
        }

        // 5. UPDATE MONEY PANEL
        if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function') {
            window.moneyPanel.setPrediction(prediction);
            console.log('✅ Money panel updated');
        }

        console.log('✅ AI panel updated successfully!');
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
