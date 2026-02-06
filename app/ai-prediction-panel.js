/**
 * AI Prediction Panel - WITH MANUAL PAIR SELECTION
 * User can select 1+ pairs from Table 3 and get common numbers
 * 
 * FIXED: Use pairData.numbers directly (already has anchors + neighbors)
 */

class AIPredictionPanel {
    constructor() {
        this.currentPrediction = null;
        this.isExpanded = true;
        this.availablePairs = [];
        this.selectedPairs = new Set();
        
        this.createPanel();
        this.setupToggle();
        
        console.log('✅ AI Prediction Panel initialized with MANUAL PAIR SELECTION');
    }

    createPanel() {
        const container = document.querySelector('.info-panels-container-bottom');
        if (!container) {
            console.error('❌ Bottom panels container not found');
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'ai-panel expanded';
        panel.id = 'aiPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🎯 AI Prediction - Manual Pair Selection</h3>
                <button class="btn-toggle" id="toggleAIPanel">−</button>
            </div>
            <div class="panel-content" id="aiPanelContent" style="display: block;">
                
                <!-- PAIR SELECTION SECTION (TOP) -->
                <div id="pairSelectionSection" style="
                    padding: 16px;
                    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                    border: 2px solid #0ea5e9;
                    border-radius: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: bold; color: #0c4a6e; font-size: 15px;">
                            📊 SELECT PAIRS FROM TABLE 3
                        </div>
                        <div style="font-size: 12px; color: #0369a1;">
                            Selected: <span id="selectedCount" style="font-weight: bold; color: #0c4a6e;">0</span>
                        </div>
                    </div>
                    
                    <!-- Pairs will be dynamically loaded here -->
                    <div id="pairCheckboxes" style="
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        margin-bottom: 12px;
                        min-height: 60px;
                        padding: 12px;
                        background: white;
                        border-radius: 8px;
                        border: 1px solid #bae6fd;
                    ">
                        <div style="color: #64748b; font-style: italic; width: 100%; text-align: center; padding: 20px;">
                            📌 Enter spins to see available pairs
                        </div>
                    </div>
                    
                    <!-- Buttons removed: predictions auto-trigger on pair selection -->
                </div>
                
                <!-- PREDICTION RESULTS SECTION -->
                <div class="prediction-status">
                    <div id="signalIndicator" class="signal-indicator signal-wait" style="
                        padding: 12px 24px;
                        border-radius: 8px;
                        background-color: #6b7280;
                        color: white;
                        font-weight: bold;
                        font-size: 16px;
                        text-align: center;
                        margin-bottom: 12px;
                    ">WAITING FOR SELECTION</div>
                </div>
                
                <div class="prediction-numbers" style="margin-top: 16px;">
                    <div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">
                        👆 Select pairs above and click "GET PREDICTIONS"
                    </div>
                </div>
                
                <div class="prediction-reasoning" style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #475569;">
                    <strong style="color: #1e293b;">HOW IT WORKS:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 22px;">
                        <li>Select 1 or more pairs from Table 3</li>
                        <li>System finds common numbers between selected pairs</li>
                        <li>Numbers already include ±1 wheel neighbors</li>
                        <li>Shows final common numbers to bet</li>
                    </ul>
                </div>
            </div>
        `;

        container.appendChild(panel);
        
        // Setup button listeners
        this.setupButtons();
        
        console.log('✅ AI Prediction panel created with pair selection UI');
    }

    setupButtons() {
        // Buttons removed - predictions auto-trigger on pair selection
    }

    setupToggle() {
        const toggleBtn = document.getElementById('toggleAIPanel');
        const content = document.getElementById('aiPanelContent');
        const panel = document.getElementById('aiPanel');
        
        if (toggleBtn && content && panel) {
            toggleBtn.addEventListener('click', () => {
                this.isExpanded = !this.isExpanded;
                content.style.display = this.isExpanded ? 'block' : 'none';
                toggleBtn.textContent = this.isExpanded ? '−' : '+';
                panel.className = this.isExpanded ? 'ai-panel expanded' : 'ai-panel collapsed';
            });
        }
    }

    /**
     * Load available pairs from Table 3 NEXT projections
     */
    loadAvailablePairs() {
        console.log('🔄 Loading available pairs from Table 3 NEXT projections...');
        
        if (typeof window.getAIDataV6 !== 'function') {
            console.error('❌ getAIDataV6 not available');
            return;
        }
        
        const tableData = window.getAIDataV6();
        
        if (!tableData || !tableData.table3NextProjections) {
            console.warn('⚠️ No table3NextProjections available yet');
            return;
        }
        
        const nextProjections = tableData.table3NextProjections;
        
        console.log('📊 Table 3 NEXT projections:', nextProjections);
        
        // Map internal names to display names
        const pairDisplayNames = {
            'prev': 'P',
            'prevPlus1': 'P+1',
            'prevMinus1': 'P-1',
            'prevPlus2': 'P+2',
            'prevMinus2': 'P-2',
            'prevPrev': 'P-PREV'
        };
        
        // Only include pairs that have numbers in NEXT row
        this.availablePairs = Object.keys(nextProjections)
            .filter(pairName => {
                const pairData = nextProjections[pairName];
                const hasNumbers = pairData && pairData.numbers && pairData.numbers.length > 0;
                
                if (hasNumbers) {
                    console.log(`   ✅ ${pairName}: ${pairData.numbers.length} numbers`);
                }
                
                return hasNumbers;
            })
            .map(pairName => ({
                key: pairName,
                display: pairDisplayNames[pairName] || pairName,
                data: nextProjections[pairName]
            }));
        
        console.log(`✅ Found ${this.availablePairs.length} available pairs`);
        
        this.renderPairCheckboxes();
    }

    renderPairCheckboxes() {
        const container = document.getElementById('pairCheckboxes');
        if (!container) return;

        if (this.availablePairs.length === 0) {
            container.innerHTML = `
                <div style="color: #64748b; font-style: italic; width: 100%; text-align: center; padding: 20px;">
                    📌 Enter more spins to see available pairs
                </div>
            `;
            return;
        }

        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4',
            '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#14b8a6'
        ];

        container.innerHTML = this.availablePairs.map((pair, index) => {
            const color = colors[index % colors.length];
            const isSelected = this.selectedPairs.has(pair.key);

            return `
                <label style="
                    display: inline-flex;
                    align-items: center;
                    padding: 10px 16px;
                    background: ${isSelected ? color : 'white'};
                    color: ${isSelected ? 'white' : '#1e293b'};
                    border: 3px solid ${color};
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 14px;
                    transition: all 0.2s;
                    user-select: none;
                " class="pair-checkbox-label" data-pair="${pair.key}">
                    <input 
                        type="checkbox" 
                        value="${pair.key}" 
                        ${isSelected ? 'checked' : ''}
                        style="
                            margin-right: 8px;
                            width: 18px;
                            height: 18px;
                            cursor: pointer;
                        "
                        class="pair-checkbox"
                    >
                    <span>${pair.display}</span>
                </label>
            `;
        }).join('');

        const checkboxes = container.querySelectorAll('.pair-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handlePairSelection(e.target.value, e.target.checked);
            });
        });

        console.log('✅ Rendered pair checkboxes');
    }

    handlePairSelection(pairKey, isChecked) {
        if (isChecked) {
            this.selectedPairs.add(pairKey);
            console.log(`✅ Selected: ${pairKey}`);
        } else {
            this.selectedPairs.delete(pairKey);
            console.log(`❌ Deselected: ${pairKey}`);
        }

        const countSpan = document.getElementById('selectedCount');
        if (countSpan) {
            countSpan.textContent = this.selectedPairs.size;
        }

        this.renderPairCheckboxes();

        // Auto-trigger predictions when at least 1 pair is selected
        // 800ms debounce — gives user time to click multiple pairs without triggering twice
        if (this._predictionDebounce) {
            clearTimeout(this._predictionDebounce);
        }
        if (this.selectedPairs.size >= 1) {
            this._predictionDebounce = setTimeout(() => {
                this.getPredictions();
            }, 800);
        } else {
            // Clear prediction display when no pairs selected
            const numbersDiv = document.querySelector('.prediction-numbers');
            if (numbersDiv) {
                numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">Select pairs to see predictions</div>';
            }
            const signalIndicator = document.getElementById('signalIndicator');
            if (signalIndicator) {
                signalIndicator.textContent = 'SELECT PAIRS';
                signalIndicator.style.backgroundColor = '#64748b';
            }
        }
    }

    clearSelections() {
        this.selectedPairs.clear();

        const countSpan = document.getElementById('selectedCount');
        if (countSpan) {
            countSpan.textContent = '0';
        }

        this.renderPairCheckboxes();

        // Clear prediction display
        const numbersDiv = document.querySelector('.prediction-numbers');
        if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">Select pairs to see predictions</div>';
        }
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = 'SELECT PAIRS';
            signalIndicator.style.backgroundColor = '#64748b';
        }

        console.log('🔄 Cleared all selections');
    }

    /**
     * Called after a new spin is added and tables re-rendered.
     * Reloads pair data and re-triggers predictions if pairs are already selected.
     */
    onSpinAdded() {
        // Reload available pairs (projections changed after new spin)
        this.loadAvailablePairs();

        // Only re-trigger if we have enough spins (3+) and pairs selected
        if (this.selectedPairs.size >= 1 && window.spins && window.spins.length >= 3) {
            console.log('🔄 Spin added — re-triggering predictions with existing pairs');
            // Small delay to let everything settle
            setTimeout(() => {
                this.getPredictions();
            }, 200);
        } else if (window.spins && window.spins.length < 3) {
            console.log('⚠️ Not enough spins for predictions (need 3+)');
        }
    }

    /**
     * Get predictions - send to backend with selectedPairs
     */
    async getPredictions() {
        if (this.selectedPairs.size === 0) {
            alert('Please select at least one pair');
            return;
        }

        console.log('\n========================================');
        console.log('🎲 MANUAL PREDICTION REQUEST');
        console.log('========================================');
        console.log('Selected pairs:', Array.from(this.selectedPairs));

        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = 'CALCULATING...';
            signalIndicator.style.backgroundColor = '#f59e0b';
        }

        try {
            // Get table data
            if (typeof window.getAIDataV6 !== 'function') {
                throw new Error('getAIDataV6 function not available');
            }

            const tableData = window.getAIDataV6();
            
            // Add selectedPairs to request
            const requestData = {
                ...tableData,
                selectedPairs: Array.from(this.selectedPairs)
            };
            
            console.log('📤 Sending to backend with selectedPairs:', requestData.selectedPairs);

            // Call backend
            const prediction = await window.aiAPI.getPredictionWithTableData(requestData);
            
            console.log('📥 Backend response:', prediction);
            console.log('========================================\n');

            // Update display
            this.updatePrediction(prediction);

        } catch (error) {
            console.error('❌ ERROR:', error);
            
            if (signalIndicator) {
                signalIndicator.textContent = 'ERROR';
                signalIndicator.style.backgroundColor = '#ef4444';
            }

            const numbersDiv = document.querySelector('.prediction-numbers');
            if (numbersDiv) {
                numbersDiv.innerHTML = `
                    <div style="color: #ef4444; padding: 20px; text-align: center;">
                        ❌ ${error.message}
                    </div>
                `;
            }
        }
    }

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

        // Color palette for anchor groups
        const groupColors = [
            { bg: '#fef3c7', border: '#f59e0b', anchorBg: '#f59e0b', neighborBg: '#fbbf24', text: '#000', label: '⭐' },
            { bg: '#dbeafe', border: '#3b82f6', anchorBg: '#3b82f6', neighborBg: '#60a5fa', text: '#fff', label: '⭐' },
            { bg: '#dcfce7', border: '#22c55e', anchorBg: '#22c55e', neighborBg: '#4ade80', text: '#fff', label: '⭐' },
            { bg: '#f3e8ff', border: '#a855f7', anchorBg: '#a855f7', neighborBg: '#c084fc', text: '#fff', label: '⭐' },
            { bg: '#ffedd5', border: '#f97316', anchorBg: '#f97316', neighborBg: '#fb923c', text: '#fff', label: '⭐' },
            { bg: '#fce7f3', border: '#ec4899', anchorBg: '#ec4899', neighborBg: '#f472b6', text: '#fff', label: '⭐' },
            { bg: '#e0f2fe', border: '#0ea5e9', anchorBg: '#0ea5e9', neighborBg: '#38bdf8', text: '#fff', label: '⭐' },
            { bg: '#ecfdf5', border: '#10b981', anchorBg: '#10b981', neighborBg: '#34d399', text: '#fff', label: '⭐' },
        ];

        console.log('📊 Displaying:', {
            total: allNumbers.length,
            anchorGroups: anchorGroups.length,
            loose: loose.length
        });

        // 1. UPDATE SIGNAL
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = `✅ ${allNumbers.length} COMMON NUMBERS FOUND`;
            signalIndicator.style.backgroundColor = '#22c55e';
            signalIndicator.style.color = 'white';
        }

        // 2. UPDATE NUMBERS — color-coded anchor groups + loose
        const numbersDiv = document.querySelector('.prediction-numbers');
        if (numbersDiv && allNumbers.length > 0) {
            // Build anchor groups HTML
            let anchorGroupsHTML = '';
            if (anchorGroups.length > 0) {
                anchorGroupsHTML = anchorGroups.map((ag, idx) => {
                    const color = groupColors[idx % groupColors.length];
                    const group = ag.group || [];
                    const anchorNum = ag.anchor;

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
                            ${isAnchor ? 'text-decoration: underline; text-underline-offset: 3px;' : 'opacity: 0.85;'}
                        ">${n}</span>`;
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

            // Build loose numbers HTML
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

            // Collect all covered numbers for display count
            const coveredCount = anchorGroups.reduce((sum, ag) => sum + (ag.group ? ag.group.length : 0), 0);

            numbersDiv.innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #374151; margin-bottom: 12px; font-size: 15px;">
                        🎯 PREDICTION: ${allNumbers.length} numbers to bet
                    </div>

                    <!-- ANCHOR GROUPS -->
                    ${anchorGroups.length > 0 ? `
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 10px; border: 2px solid #94a3b8;">
                        <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 10px;">
                            ⭐ ANCHORS (${anchors.length}) — neighbors covered [left, <u>anchor</u>, right]
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${anchorGroupsHTML}
                        </div>
                    </div>` : ''}

                    <!-- LOOSE NUMBERS -->
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
                </div>
            `;
        } else if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">No common numbers found</div>';
        }

        // 3. NUMBER CLASSIFICATION — Positive/Negative & Zero/19 table
        const reasoningDiv = document.querySelector('.prediction-reasoning');
        if (reasoningDiv) {
            // Define wheel halves
            const ZERO_TABLE = [3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7];
            const NINETEEN_TABLE = [15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35];
            const POSITIVE = [3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22];
            const NEGATIVE = [21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35];

            const zeroTableSet = new Set(ZERO_TABLE);
            const nineteenTableSet = new Set(NINETEEN_TABLE);
            const positiveSet = new Set(POSITIVE);
            const negativeSet = new Set(NEGATIVE);

            // Classify predicted numbers
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

            // Build result history section
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
                        <li style="margin-bottom: 4px;">• Selected pairs: <strong>${prediction.reasoning ? prediction.reasoning.selected_pairs?.join(', ') : 'N/A'}</strong></li>
                        <li style="margin-bottom: 4px;">• Total bet numbers: <strong>${allNumbers.length}</strong></li>
                        <li style="margin-bottom: 4px;">• Anchor groups: <strong>${anchorGroups.length}</strong> (covering ${anchorGroups.reduce((s, g) => s + (g.group ? g.group.length : 0), 0)} numbers)</li>
                        <li style="margin-bottom: 4px;">• Loose: <strong>${loose.length}</strong></li>
                    </ul>
                </div>
            `;
        }

        // 4. UPDATE WHEEL HIGHLIGHTS (pass anchor groups for color coding)
        if (window.rouletteWheel && typeof window.rouletteWheel.updateHighlights === 'function') {
            window.rouletteWheel.updateHighlights(anchors, loose, anchorGroups);
            console.log('✅ Wheel highlights updated with anchor groups');
        }
        
        // 5. UPDATE MONEY PANEL
        if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function') {
            window.moneyPanel.setPrediction(prediction);
            console.log('✅ Money panel updated');
        }
        
        console.log('✅ AI panel updated successfully!');
    }
}

// Create global instance
window.aiPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.aiPanel = new AIPredictionPanel();
        console.log('✅ AI Prediction Panel ready with manual pair selection');
    }, 150);
});

console.log('✅ AI Prediction Panel script loaded (Manual Pair Selection Mode)');