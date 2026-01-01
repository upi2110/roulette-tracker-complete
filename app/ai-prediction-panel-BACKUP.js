/**
 * AI Prediction Panel
 * Always-visible AI predictions with clear reasoning
 */

class AIPredictionPanel {
    constructor() {
        this.currentPrediction = null;
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
        panel.className = 'ai-panel';
        panel.id = 'aiPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🤖 AI Prediction</h3>
                <button class="btn-refresh" id="refreshPredictionBtn" title="Get New Prediction">🔄</button>
            </div>
            <div class="panel-content">
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
                    <label>Predicted Numbers</label>
                    <div class="numbers-grid" id="predictedNumbers">
                        <span class="waiting-msg">Add 3+ spins to see predictions</span>
                    </div>
                </div>
                
                <div class="prediction-reasoning">
                    <label>AI Reasoning</label>
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
        
        // Add refresh button listener
        document.getElementById('refreshPredictionBtn')?.addEventListener('click', () => this.refreshPrediction());
    }
    
    async refreshPrediction() {
        const spinHistory = window.spins || window.spinData;
        
        if (!spinHistory || spinHistory.length < 3) {
            alert('Need at least 3 spins for prediction');
            return;
        }
        
        if (typeof aiIntegration === 'undefined') {
            alert('AI not connected');
            return;
        }
        
        const btn = document.getElementById('refreshPredictionBtn');
        if (btn) {
            btn.textContent = '⏳';
            btn.disabled = true;
        }
        
        try {
            const prediction = await aiIntegration.getPrediction(spinHistory);
            this.updatePrediction(prediction);
            
            // Update money panel with new bet size
            if (window.moneyPanel && prediction) {
                window.moneyPanel.updateFromPrediction(prediction);
            }
        } catch (error) {
            console.error('Error getting prediction:', error);
        } finally {
            if (btn) {
                btn.textContent = '🔄';
                btn.disabled = false;
            }
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
            signalTextEl.textContent = pred.signal;
            signalEl.className = 'signal-indicator';
            if (pred.signal === 'BET NOW') {
                signalEl.classList.add('signal-bet');
            } else {
                signalEl.classList.add('signal-wait');
            }
        }
        
        // Confidence
        const confidenceFillEl = document.getElementById('confidenceFill');
        const confidenceTextEl = document.getElementById('confidenceText');
        if (confidenceFillEl && confidenceTextEl) {
            const conf = pred.confidence || 0;
            confidenceFillEl.style.width = `${conf}%`;
            confidenceTextEl.textContent = `${conf}%`;
            
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
            
            // Render numbers with anchors highlighted
            pred.numbers.forEach(num => {
                const span = document.createElement('span');
                span.textContent = num;
                span.className = 'number-chip';
                
                if (anchorNumbers.has(num)) {
                    span.classList.add('anchor-number');
                    span.title = 'Anchor';
                } else {
                    span.title = 'Neighbor';
                }
                
                numbersEl.appendChild(span);
            });
        }
        
        // Reasoning
        const reasoningEl = document.getElementById('reasoningContent');
        if (reasoningEl && pred.reasoning) {
            reasoningEl.innerHTML = pred.reasoning
                .map(r => `<p class="reasoning-item">• ${r}</p>`)
                .join('');
        }
        
        // Bet Info
        const betPerNumber = Math.round(pred.bet_per_number || 0);
        const totalBet = betPerNumber * (pred.numbers?.length || 12);
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
        }
        
        const numbersEl = document.getElementById('predictedNumbers');
        if (numbersEl) {
            numbersEl.innerHTML = '<span class="waiting-msg">Add 3+ spins to see predictions</span>';
        }
        
        const reasoningEl = document.getElementById('reasoningContent');
        if (reasoningEl) {
            reasoningEl.innerHTML = '<p class="reasoning-item">Waiting for spin data...</p>';
        }
    }
}

// Create global instance
window.aiPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.aiPanel = new AIPredictionPanel();
    }, 100);
});