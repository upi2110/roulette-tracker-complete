/**
 * Money Management Panel
 * Real-time bankroll tracking and statistics
 */

class MoneyManagementPanel {
    constructor() {
        this.sessionData = {
            startingBankroll: 4000,
            currentBankroll: 4000,
            sessionProfit: 0,
            sessionTarget: 100,
            totalSpins: 0,
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            consecutiveLosses: 0,
            lastBetAmount: 0,
            isSessionActive: false
        };
        
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
        panel.className = 'money-panel';
        panel.id = 'moneyPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>💰 Money Management</h3>
                <button class="btn-start-session" id="startSessionBtn">Start Session</button>
            </div>
            <div class="panel-content">
                <div class="money-grid">
                    <div class="money-stat">
                        <label>Bankroll</label>
                        <div class="stat-value" id="bankrollValue">$4,000</div>
                    </div>
                    <div class="money-stat">
                        <label>Session Profit</label>
                        <div class="stat-value profit" id="profitValue">$0</div>
                    </div>
                    <div class="money-stat">
                        <label>Target</label>
                        <div class="stat-value" id="targetValue">$100</div>
                    </div>
                    <div class="money-stat">
                        <label>Next Bet</label>
                        <div class="stat-value" id="nextBetValue">$0</div>
                    </div>
                    <div class="money-stat">
                        <label>Total Bets</label>
                        <div class="stat-value" id="totalBetsValue">0</div>
                    </div>
                    <div class="money-stat">
                        <label>Win Rate</label>
                        <div class="stat-value" id="winRateValue">--</div>
                    </div>
                    <div class="money-stat">
                        <label>Consecutive Losses</label>
                        <div class="stat-value warning" id="consecutiveLossesValue">0</div>
                    </div>
                    <div class="money-stat">
                        <label>Progress</label>
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(panel);
        
        // Add event listener
        document.getElementById('startSessionBtn')?.addEventListener('click', () => this.startSession());
    }
    
    async startSession() {
        if (typeof aiIntegration === 'undefined') {
            alert('AI not connected');
            return;
        }
        
        const result = await aiIntegration.startSession(4000, 100);
        if (result && result.success) {
            this.sessionData.isSessionActive = true;
            this.sessionData.currentBankroll = 4000;
            this.sessionData.sessionProfit = 0;
            this.render();
            console.log('✅ Session started');
        }
    }
    
    updateFromPrediction(prediction) {
        if (!prediction || !prediction.bet_per_number) {
            this.sessionData.lastBetAmount = 0;
        } else {
            // Round to whole dollar
            this.sessionData.lastBetAmount = Math.round(prediction.bet_per_number);
        }
        this.render();
    }
    
    recordBetResult(betAmount, numbersCount, hit) {
        const totalBet = betAmount * numbersCount;
        
        this.sessionData.totalBets++;
        
        if (hit) {
            // Win: 35:1 on one number, lose the rest
            const winAmount = betAmount * 35;
            const netProfit = winAmount - totalBet;
            
            this.sessionData.currentBankroll += netProfit;
            this.sessionData.sessionProfit += netProfit;
            this.sessionData.totalWins++;
            this.sessionData.consecutiveLosses = 0;
        } else {
            // Loss
            this.sessionData.currentBankroll -= totalBet;
            this.sessionData.sessionProfit -= totalBet;
            this.sessionData.totalLosses++;
            this.sessionData.consecutiveLosses++;
        }
        
        this.render();
    }
    
    render() {
        // Bankroll
        const bankrollEl = document.getElementById('bankrollValue');
        if (bankrollEl) {
            const bankroll = this.sessionData.currentBankroll;
            bankrollEl.textContent = `$${bankroll.toLocaleString()}`;
            bankrollEl.className = 'stat-value';
            if (bankroll < this.sessionData.startingBankroll * 0.8) {
                bankrollEl.classList.add('warning');
            }
        }
        
        // Profit
        const profitEl = document.getElementById('profitValue');
        if (profitEl) {
            const profit = this.sessionData.sessionProfit;
            profitEl.textContent = profit >= 0 ? `+$${profit}` : `-$${Math.abs(profit)}`;
            profitEl.className = 'stat-value';
            if (profit > 0) profitEl.classList.add('profit');
            if (profit < 0) profitEl.classList.add('loss');
        }
        
        // Target
        const targetEl = document.getElementById('targetValue');
        if (targetEl) {
            targetEl.textContent = `$${this.sessionData.sessionTarget}`;
        }
        
        // Next Bet
        const nextBetEl = document.getElementById('nextBetValue');
        if (nextBetEl) {
            const bet = this.sessionData.lastBetAmount;
            const total = bet * 12;
            nextBetEl.textContent = bet > 0 ? `$${bet} × 12 = $${total}` : 'Waiting...';
        }
        
        // Total Bets
        const totalBetsEl = document.getElementById('totalBetsValue');
        if (totalBetsEl) {
            totalBetsEl.textContent = this.sessionData.totalBets;
        }
        
        // Win Rate
        const winRateEl = document.getElementById('winRateValue');
        if (winRateEl) {
            if (this.sessionData.totalBets > 0) {
                const rate = (this.sessionData.totalWins / this.sessionData.totalBets * 100).toFixed(1);
                winRateEl.textContent = `${rate}% (${this.sessionData.totalWins}/${this.sessionData.totalBets})`;
            } else {
                winRateEl.textContent = '--';
            }
        }
        
        // Consecutive Losses
        const consLossEl = document.getElementById('consecutiveLossesValue');
        if (consLossEl) {
            const losses = this.sessionData.consecutiveLosses;
            consLossEl.textContent = losses;
            consLossEl.className = 'stat-value';
            if (losses >= 3) consLossEl.classList.add('warning');
        }
        
        // Progress
        const progressEl = document.getElementById('progressFill');
        if (progressEl) {
            const progress = Math.min(100, Math.max(0, (this.sessionData.sessionProfit / this.sessionData.sessionTarget) * 100));
            progressEl.style.width = `${progress}%`;
            
            if (progress >= 100) {
                progressEl.style.background = '#28a745';
            } else if (progress >= 50) {
                progressEl.style.background = '#ffc107';
            } else {
                progressEl.style.background = '#007bff';
            }
        }
    }
}

// Create global instance
window.moneyPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for container to be created
    setTimeout(() => {
        window.moneyPanel = new MoneyManagementPanel();
    }, 100);
});