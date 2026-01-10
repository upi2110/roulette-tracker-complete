/**
 * Money Management Panel - FIXED VERSION
 * Real-time bankroll tracking with win/loss history
 */

class MoneyManagementPanel {
    constructor() {
        this.sessionData = {
            startingBankroll: 4000,
            currentBankroll: 4000,
            sessionProfit: 0,
            sessionTarget: 100,
            totalBets: 0,
            totalWins: 0,
            totalLosses: 0,
            consecutiveLosses: 0,
            lastBetAmount: 0,
            lastBetNumbers: 12,
            isSessionActive: false
        };
        
        this.betHistory = [];
        this.isExpanded = true; // START EXPANDED
        
        // CRITICAL: Store the prediction we're betting on
        this.pendingBet = null; // { betAmount, numbersCount, predictedNumbers }
        
        this.createPanel();
        this.render();
        
        // Listen for new spins to check results
        this.setupSpinListener();
    }
    
    createPanel() {
        const container = document.querySelector('.info-panels-container-bottom');
        if (!container) {
            console.error('Bottom panels container not found');
            return;
        }
        
        const panel = document.createElement('div');
        panel.className = 'money-panel expanded';
        panel.id = 'moneyPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>💰 Money Management (Auto-Tracking)</h3>
                <button class="btn-toggle" id="toggleMoneyPanel">−</button>
            </div>
            <div class="panel-content" id="moneyPanelContent" style="display: block;">
                <div class="money-grid">
                    <div class="money-stat bankroll-stat">
                        <label>Bankroll</label>
                        <div class="stat-value large" id="bankrollValue">$4,000</div>
                    </div>
                    <div class="money-stat profit-stat">
                        <label>Session Profit</label>
                        <div class="stat-value large" id="profitValue">$0</div>
                    </div>
                    <div class="money-stat">
                        <label>Target</label>
                        <div class="stat-value" id="targetValue">$100</div>
                    </div>
                    <div class="money-stat">
                        <label>Next Bet</label>
                        <div class="stat-value" id="nextBetValue">Waiting...</div>
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
                        <div class="stat-value" id="consecutiveLossesValue">0</div>
                    </div>
                    <div class="money-stat full-width">
                        <label>Progress to Target</label>
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                            <span class="progress-text" id="progressText">0%</span>
                        </div>
                    </div>
                </div>
                
                <div class="bet-history-section" style="margin-top: 12px;">
                    <label style="font-weight: 700; font-size: 11px; margin-bottom: 4px; display: block;">Recent Bets:</label>
                    <div class="bet-history-list" id="betHistoryList" style="max-height: 100px; overflow-y: auto; font-size: 10px;">
                        <div style="color: #6c757d; text-align: center; padding: 8px;">No bets yet - Add 3+ spins to start</div>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(panel);
        
        // Add toggle listener
        document.getElementById('toggleMoneyPanel')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });
        
        // AUTO-START session when first prediction is made
        this.autoStartSession();
    }
    
    togglePanel() {
        this.isExpanded = !this.isExpanded;
        const panel = document.getElementById('moneyPanel');
        const content = document.getElementById('moneyPanelContent');
        const toggleBtn = document.getElementById('toggleMoneyPanel');
        
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
    
    setupSpinListener() {
        // Check for new spins every 200ms - FASTER than orchestrator
        this.lastSpinCount = 0;
        setInterval(() => {
            this.checkForNewSpin();
        }, 200);
    }
    
    checkForNewSpin() {
        if (!this.sessionData.isSessionActive) return;
        
        const spins = window.spins || window.spinData;
        if (!spins || !Array.isArray(spins)) return;
        
        const currentCount = spins.length;
        
        // New spin detected
        if (currentCount > this.lastSpinCount && this.lastSpinCount > 0) {
            const lastSpin = spins[spins.length - 1];
            const actualNumber = lastSpin.actual;
            
            console.log(`\n🎰 NEW SPIN DETECTED: ${actualNumber}`);
            console.log('Previous spin count:', this.lastSpinCount);
            console.log('Current spin count:', currentCount);
            
            // Check if we had a pending bet
            if (this.pendingBet && this.pendingBet.betAmount > 0) {
                const hit = this.pendingBet.predictedNumbers.includes(actualNumber);
                
                console.log('Pending bet:', this.pendingBet);
                console.log('Predicted numbers:', this.pendingBet.predictedNumbers);
                console.log('Actual number:', actualNumber);
                console.log('Hit?', hit);
                
                this.recordBetResult(
                    this.pendingBet.betAmount,
                    this.pendingBet.numbersCount,
                    hit,
                    actualNumber
                );
                
                // Clear the pending bet
                this.pendingBet = null;
            } else {
                console.log('⚠️ No pending bet to check');
            }
        }
        
        this.lastSpinCount = currentCount;
    }
    
    autoStartSession() {
        // DISABLED: Orchestrator handles session start now
        // This prevents double prediction generation
        console.log('⚠️ Money Panel auto-start delegated to orchestrator');
    }
    
    updateFromPrediction(prediction) {
        if (!prediction || !prediction.bet_per_number) {
            this.sessionData.lastBetAmount = 0;
            this.sessionData.lastBetNumbers = 12;
            this.pendingBet = null;
        } else {
            // Round to whole dollar
            const betAmount = Math.round(prediction.bet_per_number);
            const numbersCount = prediction.numbers ? prediction.numbers.length : 12;
            
            this.sessionData.lastBetAmount = betAmount;
            this.sessionData.lastBetNumbers = numbersCount;
            
            // CRITICAL: Store the prediction we're betting on
            if (this.sessionData.isSessionActive && betAmount > 0) {
                this.pendingBet = {
                    betAmount: betAmount,
                    numbersCount: numbersCount,
                    predictedNumbers: [...prediction.numbers] // Clone the array
                };
                console.log('📌 Pending bet stored:', this.pendingBet);
            }
        }
        this.render();
    }
    
    async recordBetResult(betPerNumber, numbersCount, hit, actualNumber) {
        const totalBet = betPerNumber * numbersCount;
        
        this.sessionData.totalBets++;
        
        let netChange = 0;
        
        if (hit) {
            // Win: 35:1 on one number, lose the rest
            const winAmount = betPerNumber * 35;
            netChange = winAmount - totalBet;
            
            this.sessionData.currentBankroll += netChange;
            this.sessionData.sessionProfit += netChange;
            this.sessionData.totalWins++;
            this.sessionData.consecutiveLosses = 0;
            
            console.log(`✅ HIT! Number ${actualNumber} - Won $${netChange}`);
        } else {
            // Loss
            netChange = -totalBet;
            
            this.sessionData.currentBankroll -= totalBet;
            this.sessionData.sessionProfit -= totalBet;
            this.sessionData.totalLosses++;
            this.sessionData.consecutiveLosses++;
            
            console.log(`❌ MISS! Number ${actualNumber} - Lost $${totalBet}`);
        }
        
        // CRITICAL: Tell backend about result to calculate next bet
        if (typeof aiIntegration !== 'undefined') {
            try {
                const result = await aiIntegration.processResult(betPerNumber, hit);
                console.log('💰 Backend processed result:', result);
            } catch (error) {
                console.error('⚠️ Failed to process result on backend:', error);
            }
        }
        
        // Add to history
        this.betHistory.unshift({
            spin: this.sessionData.totalBets,
            betAmount: betPerNumber,
            totalBet: totalBet,
            hit: hit,
            actualNumber: actualNumber,
            netChange: netChange,
            timestamp: new Date().toLocaleTimeString()
        });
        
        // Keep only last 10 bets
        if (this.betHistory.length > 10) {
            this.betHistory = this.betHistory.slice(0, 10);
        }
        
        this.render();
        
        // Check if target reached
        if (this.sessionData.sessionProfit >= this.sessionData.sessionTarget) {
            setTimeout(() => {
                alert(`🎉 TARGET REACHED! Session Profit: $${this.sessionData.sessionProfit}`);
            }, 500);
        }
    }
    
    render() {
        // Bankroll
        const bankrollEl = document.getElementById('bankrollValue');
        if (bankrollEl) {
            const bankroll = this.sessionData.currentBankroll;
            bankrollEl.textContent = `$${bankroll.toLocaleString()}`;
            bankrollEl.className = 'stat-value large';
            
            const pct = (bankroll / this.sessionData.startingBankroll);
            if (pct < 0.8) {
                bankrollEl.classList.add('warning');
            } else if (pct < 0.9) {
                bankrollEl.classList.add('caution');
            }
        }
        
        // Profit
        const profitEl = document.getElementById('profitValue');
        if (profitEl) {
            const profit = this.sessionData.sessionProfit;
            profitEl.textContent = profit >= 0 ? `+$${profit}` : `-$${Math.abs(profit)}`;
            profitEl.className = 'stat-value large';
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
            if (this.sessionData.isSessionActive && this.sessionData.lastBetAmount > 0) {
                const bet = this.sessionData.lastBetAmount;
                const count = this.sessionData.lastBetNumbers;
                const total = bet * count;
                nextBetEl.textContent = `$${bet} × ${count} = $${total}`;
                nextBetEl.className = 'stat-value';
            } else if (this.sessionData.isSessionActive) {
                nextBetEl.textContent = 'Waiting for prediction...';
                nextBetEl.className = 'stat-value';
            } else {
                nextBetEl.textContent = 'Session not started';
                nextBetEl.className = 'stat-value';
                nextBetEl.style.color = '#6c757d';
            }
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
                winRateEl.textContent = `${rate}%`;
                winRateEl.title = `${this.sessionData.totalWins}W / ${this.sessionData.totalLosses}L`;
                
                // Color code
                if (rate >= 30) {
                    winRateEl.style.color = '#28a745';
                } else if (rate >= 20) {
                    winRateEl.style.color = '#ffc107';
                } else {
                    winRateEl.style.color = '#dc3545';
                }
            } else {
                winRateEl.textContent = '--';
                winRateEl.style.color = '#6c757d';
            }
        }
        
        // Consecutive Losses
        const consLossEl = document.getElementById('consecutiveLossesValue');
        if (consLossEl) {
            const losses = this.sessionData.consecutiveLosses;
            consLossEl.textContent = losses;
            consLossEl.className = 'stat-value';
            if (losses >= 4) {
                consLossEl.classList.add('danger');
            } else if (losses >= 2) {
                consLossEl.classList.add('warning');
            }
        }
        
        // Progress
        const progressEl = document.getElementById('progressFill');
        const progressTextEl = document.getElementById('progressText');
        if (progressEl && progressTextEl) {
            const progress = Math.max(0, (this.sessionData.sessionProfit / this.sessionData.sessionTarget) * 100);
            const displayProgress = Math.min(100, progress);
            
            progressEl.style.width = `${displayProgress}%`;
            progressTextEl.textContent = `${displayProgress.toFixed(0)}%`;
            
            if (progress >= 100) {
                progressEl.style.background = '#28a745';
            } else if (progress >= 50) {
                progressEl.style.background = '#ffc107';
            } else if (progress < 0) {
                progressEl.style.background = '#dc3545';
            } else {
                progressEl.style.background = '#007bff';
            }
        }
        
        // Bet History
        this.renderBetHistory();
    }
    
    renderBetHistory() {
        const historyEl = document.getElementById('betHistoryList');
        if (!historyEl) return;
        
        if (this.betHistory.length === 0) {
            historyEl.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 8px;">No bets yet</div>';
            return;
        }
        
        historyEl.innerHTML = '';
        
        this.betHistory.forEach((bet, idx) => {
            const div = document.createElement('div');
            div.className = 'bet-history-item';
            div.style.padding = '4px 8px';
            div.style.borderBottom = '1px solid #e9ecef';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            
            const resultIcon = bet.hit ? '✅' : '❌';
            const resultColor = bet.hit ? '#28a745' : '#dc3545';
            
            div.innerHTML = `
                <span style="color: #6c757d;">#${bet.spin}</span>
                <span>${resultIcon} ${bet.actualNumber}</span>
                <span style="color: ${resultColor}; font-weight: 700;">${bet.netChange >= 0 ? '+' : ''}$${bet.netChange}</span>
                <span style="color: #adb5bd; font-size: 9px;">${bet.timestamp}</span>
            `;
            
            historyEl.appendChild(div);
        });
    }
}

// Create global instance
window.moneyPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.moneyPanel = new MoneyManagementPanel();
        console.log('✅ Money Management Panel initialized (EXPANDED)');
    }, 100);
});