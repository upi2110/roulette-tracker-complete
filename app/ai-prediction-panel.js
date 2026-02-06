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
                    
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button id="getPredictionsBtn" style="
                            flex: 1;
                            padding: 12px 24px;
                            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            font-weight: bold;
                            font-size: 14px;
                            cursor: pointer;
                            transition: all 0.2s;
                        " disabled>
                            🎲 GET PREDICTIONS
                        </button>
                        <button id="clearSelectionsBtn" style="
                            padding: 12px 20px;
                            background: #f1f5f9;
                            color: #64748b;
                            border: 1px solid #cbd5e1;
                            border-radius: 8px;
                            font-weight: bold;
                            font-size: 14px;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">
                            🔄 Clear
                        </button>
                    </div>
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
        const getPredictionsBtn = document.getElementById('getPredictionsBtn');
        const clearSelectionsBtn = document.getElementById('clearSelectionsBtn');
        
        if (getPredictionsBtn) {
            getPredictionsBtn.addEventListener('click', () => this.getPredictions());
        }
        
        if (clearSelectionsBtn) {
            clearSelectionsBtn.addEventListener('click', () => this.clearSelections());
        }
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

        const btn = document.getElementById('getPredictionsBtn');
        if (btn) {
            if (this.selectedPairs.size >= 1) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        }

        this.renderPairCheckboxes();
    }

    clearSelections() {
        this.selectedPairs.clear();
        
        const countSpan = document.getElementById('selectedCount');
        if (countSpan) {
            countSpan.textContent = '0';
        }

        const btn = document.getElementById('getPredictionsBtn');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }

        this.renderPairCheckboxes();
        console.log('🔄 Cleared all selections');
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
        
        console.log('📊 Displaying:', {
            total: allNumbers.length,
            anchors: anchors.length,
            loose: loose.length
        });
        
        // 1. UPDATE SIGNAL
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = `✅ ${allNumbers.length} COMMON NUMBERS FOUND`;
            signalIndicator.style.backgroundColor = '#22c55e';
            signalIndicator.style.color = 'white';
        }
        
        // 2. UPDATE NUMBERS
        const numbersDiv = document.querySelector('.prediction-numbers');
        if (numbersDiv && allNumbers.length > 0) {
            numbersDiv.innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div style="font-weight: bold; color: #374151; margin-bottom: 12px; font-size: 15px;">
                        🎯 COMMON NUMBERS FROM SELECTED PAIRS (${allNumbers.length} numbers)
                    </div>
                    
                    <!-- ANCHOR NUMBERS -->
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; border: 2px solid #f59e0b;">
                        <div style="font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px;">
                            ⭐ ANCHORS (${anchors.length}) - Both neighbors covered
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                            ${anchors.length > 0 ? anchors.sort((a, b) => a - b).map(n => `
                                <span style="display: inline-block; padding: 10px 14px; border-radius: 10px; background: gold; color: black; border: 3px solid #f59e0b; font-weight: bold; font-size: 17px; min-width: 42px; text-align: center; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">${n}</span>
                            `).join('') : '<span style="color: #92400e; font-style: italic;">None</span>'}
                        </div>
                    </div>
                    
                    <!-- LOOSE NUMBERS -->
                    <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%); border-radius: 10px; border: 2px solid #ec4899;">
                        <div style="font-size: 13px; font-weight: 700; color: #831843; margin-bottom: 8px;">
                            💗 LOOSE NUMBERS (${loose.length}) - Missing neighbors
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                            ${loose.length > 0 ? loose.sort((a, b) => a - b).map(n => `
                                <span style="display: inline-block; padding: 10px 14px; border-radius: 10px; background: #ec4899; color: white; border: 3px solid #db2777; font-weight: bold; font-size: 17px; min-width: 42px; text-align: center; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">${n}</span>
                            `).join('') : '<span style="color: #831843; font-style: italic;">None</span>'}
                        </div>
                    </div>
                </div>
            `;
        } else if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">No common numbers found</div>';
        }
        
        // 3. UPDATE REASONING
        const reasoningDiv = document.querySelector('.prediction-reasoning');
        if (reasoningDiv && prediction.reasoning) {
            const r = prediction.reasoning;
            reasoningDiv.innerHTML = `
                <div style="font-size: 12px; line-height: 1.7; color: #475569;">
                    <strong style="color: #1e293b; font-size: 13px;">CALCULATION DETAILS:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 22px; list-style: none;">
                        <li style="margin-bottom: 4px;">• Selected pairs: <strong>${r.selected_pairs ? r.selected_pairs.join(', ') : 'N/A'}</strong></li>
                        <li style="margin-bottom: 4px;">• Common numbers found: <strong>${allNumbers.length}</strong></li>
                        <li style="margin-bottom: 4px;">• Anchors: <strong>${anchors.length}</strong></li>
                        <li style="margin-bottom: 4px;">• Loose: <strong>${loose.length}</strong></li>
                        <li style="margin-bottom: 4px;">• Mode: <strong>${prediction.mode || 'AUTO'}</strong></li>
                    </ul>
                </div>
            `;
        }
        
        // 4. UPDATE WHEEL HIGHLIGHTS
        if (window.rouletteWheel && typeof window.rouletteWheel.updateHighlights === 'function') {
            window.rouletteWheel.updateHighlights(anchors, loose);
            console.log('✅ Wheel highlights updated');
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