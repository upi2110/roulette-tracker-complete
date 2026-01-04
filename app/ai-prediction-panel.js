/**
 * AI Prediction Panel - FIXED VERSION
 * Always-visible AI predictions with clear reasoning
 */

class AIPredictionPanel {
    constructor() {
        this.currentPrediction = null;
        this.isExpanded = true; // START EXPANDED
        this.createPanel();
        this.render();
    }
    
    createPanel() {
        const container = document.querySelector('.info-panels-container-bottom');
        if (!container) {
            console.error('Bottom panels container not found');
            return;
        }
        
        const panel = document.createElement('div');
        panel.className = 'ai-panel expanded';
        panel.id = 'aiPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🤖 AI Prediction (Auto-Updated)</h3>
                <button class="btn-toggle" id="toggleAIPanel">−</button>
            </div>
            <div class="panel-content" id="aiPanelContent" style="display: block;">
                <div class="prediction-status">
                    <div class="signal-indicator" id="signalIndicator">
                        <span class="signal-text" id="signalText">WAITING</span>
                    </div>
                    <div class="confidence-display">
                        <label>Confidence</label>
                        <div class="confidence-bar">
                            <div class="confidence-fill" id="confidenceFill" style="width: 0%"></div>
                            <span class="confidence-text" id="confidenceText">0%</span>
                        </div>
                    </div>
                </div>
                
                <div class="prediction-numbers">
                    <label>Predicted Numbers (For NEXT Spin)</label>
                    <div class="numbers-grid" id="predictedNumbers">
                        <span class="waiting-msg">Add 3+ spins to see predictions</span>
                    </div>
                </div>
                
                <div class="prediction-reasoning">
                    <label>AI Reasoning (Based on Your Methodology)</label>
                    <div class="reasoning-content" id="reasoningContent">
                        <p class="reasoning-item">Waiting for spin data...</p>
                    </div>
                </div>
                
                <div class="prediction-bet-info">
                    <div class="bet-info-row">
                        <span>Bet Size:</span>
                        <strong id="betSizeInfo">--</strong>
                    </div>
                    <div class="bet-info-row">
                        <span>Total Bet:</span>
                        <strong id="totalBetInfo">--</strong>
                    </div>
                    <div class="bet-info-row profit">
                        <span>Potential Win:</span>
                        <strong id="potentialWinInfo">--</strong>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(panel);
        
        // Add toggle listener
        document.getElementById('toggleAIPanel')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });
        
        // AUTOMATIC UPDATE: Monitor spins and auto-update
        this.setupAutoUpdate();
    }
    
    togglePanel() {
        this.isExpanded = !this.isExpanded;
        const panel = document.getElementById('aiPanel');
        const content = document.getElementById('aiPanelContent');
        const toggleBtn = document.getElementById('toggleAIPanel');
        
        if (this.isExpanded) {
            panel?.classList.add('expanded');
            if (content) content.style.display = 'block';
            if (toggleBtn) toggleBtn.textContent = '−';
        } else {
            panel?.classList.remove('expanded');
            if (content) content.style.display = 'none';
            if (toggleBtn) toggleBtn.textContent = '+';
        }
    }
    
    setupAutoUpdate() {
        // DISABLED: Let auto-update-orchestrator handle timing
        // This prevents race condition with money panel
        console.log('⚠️ AI Panel auto-update delegated to orchestrator');
    }
    
    async getPredictionAuto() {
        const spinHistory = window.spins || window.spinData;
        
        if (!spinHistory || spinHistory.length < 3) return;
        if (typeof aiIntegration === 'undefined') return;
        
        try {
            const prediction = await aiIntegration.getPrediction(spinHistory);
            console.log('✅ Auto-prediction received:', prediction);
            this.updatePrediction(prediction);
            
            // Update money panel with new bet size
            if (window.moneyPanel && prediction) {
                window.moneyPanel.updateFromPrediction(prediction);
            }
            
            // Update wheel highlights
            if (window.rouletteWheel && prediction) {
                window.rouletteWheel.highlightPredictions(prediction);
            }
        } catch (error) {
            console.error('❌ Auto-prediction error:', error);
        }
    }
    
    updatePrediction(prediction) {
        this.currentPrediction = prediction;
        this.render();
    }
    
    render() {
        if (!this.currentPrediction || !this.currentPrediction.can_predict) {
            this.renderWaiting();
            return;
        }
        
        const pred = this.currentPrediction;
        
        // Signal
        const signalEl = document.getElementById('signalIndicator');
        const signalTextEl = document.getElementById('signalText');
        if (signalEl && signalTextEl) {
            const confidence = pred.confidence || 0;
            if (confidence >= 0.75) {
                signalTextEl.textContent = 'BET NOW';
                signalEl.className = 'signal-indicator signal-bet';
            } else {
                signalTextEl.textContent = 'WAIT';
                signalEl.className = 'signal-indicator signal-wait';
            }
        }
        
        // Confidence - Handle both 0-1 and 0-100 formats with validation
        const confidenceFillEl = document.getElementById('confidenceFill');
        const confidenceTextEl = document.getElementById('confidenceText');
        if (confidenceFillEl && confidenceTextEl) {
            let conf = pred.confidence || 0;
            
            // Validate and convert confidence
            if (conf > 100) {
                // Something wrong - probably multiplied multiple times
                console.warn(`⚠️ Invalid confidence: ${conf}, capping at 100`);
                conf = 100;
            } else if (conf > 1 && conf <= 100) {
                // Already in percentage format
                conf = Math.round(conf);
            } else if (conf >= 0 && conf <= 1) {
                // In 0-1 format, convert to percentage
                conf = Math.round(conf * 100);
            } else {
                // Invalid
                console.error(`❌ Invalid confidence value: ${conf}`);
                conf = 0;
            }
            
            // Ensure it's within 0-100 range
            conf = Math.min(100, Math.max(0, conf));
            
            confidenceFillEl.style.width = `${conf}%`;
            confidenceTextEl.textContent = `${conf}%`;
            
            console.log(`📊 Confidence: ${pred.confidence} → ${conf}%`);
            
            // Color based on confidence
            if (conf >= 85) {
                confidenceFillEl.style.background = '#28a745';
            } else if (conf >= 75) {
                confidenceFillEl.style.background = '#ffc107';
            } else {
                confidenceFillEl.style.background = '#6c757d';
            }
        }
        
        // Numbers with anchors highlighted
        const numbersEl = document.getElementById('predictedNumbers');
        if (numbersEl && pred.numbers) {
            numbersEl.innerHTML = '';
            
            // Get anchor numbers from anchor_groups
            const anchorNumbers = new Set();
            if (pred.anchor_groups) {
                pred.anchor_groups.forEach(group => {
                    if (group.anchor !== undefined) {
                        anchorNumbers.add(group.anchor);
                    }
                });
            }
            
            // Render numbers with anchors CLEARLY highlighted
            pred.numbers.forEach(num => {
                const span = document.createElement('span');
                span.className = 'number-chip';
                
                if (anchorNumbers.has(num)) {
                    span.classList.add('anchor-number');
                    span.innerHTML = `⭐ ${num}`;
                    span.title = 'Anchor Number (Direct Projection)';
                } else {
                    span.classList.add('neighbor-number');
                    span.textContent = num;
                    span.title = 'Neighbor (±1 from Anchor)';
                }
                
                numbersEl.appendChild(span);
            });
        }
        
        // Reasoning - IMPROVED with projection context
        const reasoningEl = document.getElementById('reasoningContent');
        if (reasoningEl && pred.reasoning) {
            reasoningEl.innerHTML = '';
            
            // Add reasoning items with better formatting
            pred.reasoning.forEach(r => {
                const p = document.createElement('p');
                p.className = 'reasoning-item';
                p.innerHTML = `• ${r}`;
                reasoningEl.appendChild(p);
            });
            
            // Add hot projections info if available
            // Add hot projections info if available
            if (pred.hot_projections && pred.hot_projections.length > 0) {
                const hotDiv = document.createElement('div');
                hotDiv.className = 'hot-projections-info';
                hotDiv.style.marginTop = '10px';
                hotDiv.style.padding = '8px';
                hotDiv.style.background = '#fff3cd';
                hotDiv.style.borderRadius = '4px';
                hotDiv.style.fontSize = '11px';
                
                const title = document.createElement('div');
                title.style.fontWeight = '700';
                title.style.marginBottom = '4px';
                title.textContent = '🔥 Hot Projections:';
                hotDiv.appendChild(title);
                
                pred.hot_projections.forEach(proj => {
                    const projP = document.createElement('p');
                    projP.style.margin = '2px 0';
                    projP.style.paddingLeft = '8px';
                    
                    // Handle both string and object formats
                    if (typeof proj === 'string') {
                        projP.textContent = proj;
                    } else if (typeof proj === 'object' && proj.type) {
                        // Format the object into readable text
                        const hits = proj.consecutive_hits || 0;
                        const codes = proj.position_codes || [];
                        const type = proj.type.replace(/_/g, ' ').replace(/plus/g, '+').replace(/minus/g, '-');
                        projP.textContent = `${type.toUpperCase()}: ${hits} hits, codes: ${codes.join(', ')}`;
                    } else {
                        projP.textContent = JSON.stringify(proj);
                    }
                    
                    hotDiv.appendChild(projP);
                });
                
                reasoningEl.appendChild(hotDiv);
            }
        }
        
        // Bet Info
        const betPerNumber = Math.round(pred.bet_per_number || 0);
        const numbersCount = pred.numbers?.length || 12;
        const totalBet = betPerNumber * numbersCount;
        const potentialWin = betPerNumber > 0 ? (betPerNumber * 35) - totalBet : 0;
        
        const betSizeEl = document.getElementById('betSizeInfo');
        if (betSizeEl) {
            betSizeEl.textContent = betPerNumber > 0 ? `$${betPerNumber}/number` : '--';
        }
        
        const totalBetEl = document.getElementById('totalBetInfo');
        if (totalBetEl) {
            totalBetEl.textContent = betPerNumber > 0 ? `$${totalBet}` : '--';
        }
        
        const potentialWinEl = document.getElementById('potentialWinInfo');
        if (potentialWinEl) {
            potentialWinEl.textContent = betPerNumber > 0 ? `+$${potentialWin}` : '--';
            potentialWinEl.style.color = potentialWin > 0 ? '#28a745' : '#6c757d';
        }
    }
    
    renderWaiting() {
        const signalEl = document.getElementById('signalIndicator');
        const signalTextEl = document.getElementById('signalText');
        if (signalEl && signalTextEl) {
            signalTextEl.textContent = 'WAITING';
            signalEl.className = 'signal-indicator signal-wait';
        }
        
        const confidenceFillEl = document.getElementById('confidenceFill');
        const confidenceTextEl = document.getElementById('confidenceText');
        if (confidenceFillEl && confidenceTextEl) {
            confidenceFillEl.style.width = '0%';
            confidenceTextEl.textContent = '0%';
            confidenceFillEl.style.background = '#6c757d';
        }
        
        const numbersEl = document.getElementById('predictedNumbers');
        if (numbersEl) {
            numbersEl.innerHTML = '<span class="waiting-msg">Add 3+ spins to see predictions</span>';
        }
        
        const reasoningEl = document.getElementById('reasoningContent');
        if (reasoningEl) {
            reasoningEl.innerHTML = '<p class="reasoning-item">Waiting for spin data...</p>';
        }
        
        // Clear bet info
        const betSizeEl = document.getElementById('betSizeInfo');
        if (betSizeEl) betSizeEl.textContent = '--';
        
        const totalBetEl = document.getElementById('totalBetInfo');
        if (totalBetEl) totalBetEl.textContent = '--';
        
        const potentialWinEl = document.getElementById('potentialWinInfo');
        if (potentialWinEl) potentialWinEl.textContent = '--';
    }
}

// Create global instance
window.aiPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.aiPanel = new AIPredictionPanel();
        console.log('✅ AI Prediction Panel initialized (EXPANDED)');
    }, 100);
});
