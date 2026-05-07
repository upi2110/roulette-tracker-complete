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
            isSessionActive: false,
            spinsWithBets: [],
            isBettingEnabled: false,  // NEW: User control for betting
            bettingStrategy: 4,  // 1=Aggressive, 2=Conservative, 3=Cautious, 4=Defensive (default: Defensive)
            // ─── Strategy-4 Defensive variables (user-tunable) ───
            // Defaults match the previous hard-coded behavior:
            //   +$1 after 5 consecutive losses, -$1 after 2 consecutive wins.
            // Edited via the ⚙️ Variables button next to the strategy button.
            s4LossesToIncrease: 5,
            s4LossIncrement:    1,
            s4WinsToDecrease:   2,
            s4WinDecrement:     1,
            consecutiveWins: 0,  // Track consecutive wins for strategies 2 & 3
            currentBetPerNumber: 2  // Track current bet amount (overrides backend)
        };

        this.betHistory = [];
        this.isExpanded = true; // START EXPANDED

        // CRITICAL: Store the prediction we're betting on
        this.pendingBet = null; // { betAmount, numbersCount, predictedNumbers }

        this.createPanel();
        // Setup betting control button listener
        setTimeout(() => this.setupBettingControl(), 200);
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
            <!-- BETTING CONTROL - AT TOP -->
            <div style="padding: 12px; background-color: #f8f9fa; border-bottom: 2px solid #ddd;">
                <button id="toggleBettingBtn" style="
                    width: 100%;
                    padding: 12px;
                    font-size: 16px;
                    font-weight: bold;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    background-color: #28a745;
                    color: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    margin-bottom: 8px;
                ">▶️ START BETTING</button>
                <div id="bettingStatus" style="
                    padding: 6px;
                    border-radius: 4px;
                    font-size: 11px;
                    text-align: center;
                    background-color: #f8d7da;
                    color: #721c24;
                    font-weight: bold;
                ">⏸️ Betting PAUSED - Click START to begin</div>
                <div style="display:flex;gap:6px;margin-top:8px;align-items:stretch;">
                    <button id="toggleStrategyBtn" style="
                            flex:1;
                            padding: 8px;
                            font-size: 13px;
                            font-weight: 600;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            background: linear-gradient(135deg, #0f766e 0%, #134e4a 100%);
                            color: white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        ">🛡️ Strategy 4: Defensive</button>
                    <button id="strategyVarsBtn" type="button" title="Edit defensive-strategy variables (loss/win thresholds + bet step sizes)" style="
                            padding: 8px 12px;
                            font-size: 14px;
                            font-weight: 700;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            background: #475569;
                            color: white;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        ">⚙️</button>
                </div>
                <!-- Variables editor (Strategy-4 tunables). Hidden until
                     the ⚙️ button is clicked. Save commits values into
                     this.sessionData.s4* fields used by the Strategy-4
                     adjustment block in recordBetResult(). -->
                <div id="strategyVarsPanel" style="display:none;margin-top:6px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;padding:8px;font-size:11px;color:#1f2937;position:relative;">
                    <button id="s4VarsClose" type="button" title="Close" style="position:absolute;top:4px;right:4px;width:20px;height:20px;line-height:18px;font-size:14px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:3px;cursor:pointer;padding:0;">×</button>
                    <div style="font-weight:700;color:#0f766e;margin-bottom:6px;padding-right:24px;">🛡️ Strategy 4 — Defensive variables</div>
                    <div style="display:grid;grid-template-columns:1fr 60px;gap:4px 6px;align-items:center;">
                        <label for="s4LossesIn" title="How many consecutive LOSSES before the bet is increased.">Increase bet after every</label>
                        <input id="s4LossesIn" type="number" min="1" max="50" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s4LossIncIn" title="Dollar amount added to the per-number bet on each escalation.">Increase $</label>
                        <input id="s4LossIncIn" type="number" min="0" max="100" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s4WinsIn" title="How many consecutive WINS before the bet is decreased.">Decrease bet after every</label>
                        <input id="s4WinsIn" type="number" min="1" max="50" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s4WinDecIn" title="Dollar amount removed from the per-number bet on each step-down (floor stays at $2).">Decrease $</label>
                        <input id="s4WinDecIn" type="number" min="0" max="100" step="1" style="padding:3px;font-size:11px;width:55px;">
                    </div>
                    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">
                        <button id="s4VarsCancel" type="button" style="padding:4px 10px;font-size:11px;border:1px solid #cbd5e1;background:#fff;border-radius:3px;cursor:pointer;">Cancel</button>
                        <button id="s4VarsSave" type="button" style="padding:4px 10px;font-size:11px;border:none;background:#0f766e;color:#fff;border-radius:3px;cursor:pointer;font-weight:600;">Save</button>
                    </div>
                    <div id="s4VarsStatus" style="margin-top:6px;font-size:10px;color:#16a34a;min-height:12px;"></div>
                </div>
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
                        <div id="chipBreakdownDisplay"></div>
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
                    <div class="bet-history-list" id="betHistoryList" style="max-height: 280px; overflow-y: auto; overflow-x: hidden; font-size: 10px; border: 1px solid #dee2e6; border-radius: 4px; background: #fff;">
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

    toggleBetting() {
        this.sessionData.isBettingEnabled = !this.sessionData.isBettingEnabled;

        const btn = document.getElementById('toggleBettingBtn');
        const status = document.getElementById('bettingStatus');

        if (this.sessionData.isBettingEnabled) {
            // BETTING ENABLED
            if (btn) {
                btn.textContent = '⏸️ PAUSE BETTING';
                btn.style.backgroundColor = '#dc3545';  // Red
            }
            if (status) {
                status.textContent = '✅ Auto-betting ACTIVE';
                status.style.backgroundColor = '#d4edda';  // Light green
                status.style.color = '#155724';  // Dark green
            }
            console.log('✅ Betting ENABLED - System will place bets automatically');
    
            // CRITICAL: Get fresh prediction immediately when starting
            if (window.aiPanel && window.aiPanel.getPredictions) {
                setTimeout(() => {
                    try {
                        window.aiPanel.getPredictions();
                        console.log('🔄 Triggered fresh prediction after START');
                    } catch (e) {
                        console.warn('⚠️ Failed to trigger prediction on START:', e.message);
                    }
                }, 100);
            }
        } else {
            // BETTING PAUSED
            if (btn) {
                btn.textContent = '▶️ START BETTING';
                btn.style.backgroundColor = '#28a745';
            }

            // CRITICAL: Clear pending bet when pausing
            this.pendingBet = null;
            console.log('🚫 Cleared pending bet - no bet will be placed');
            if (status) {
                status.textContent = '⏸️ Betting PAUSED - Click START to begin';
                status.style.backgroundColor = '#f8d7da';  // Light red
                status.style.color = '#721c24';  // Dark red
            }
            console.log('⏸️ Betting PAUSED - No bets will be placed');
        }
    }

    toggleStrategy() {
        // Cycle through strategies: 1 → 2 → 3 → 4 → 1
        this.sessionData.bettingStrategy = (this.sessionData.bettingStrategy % 4) + 1;
        
        // Reset counters when switching strategies
        this.sessionData.consecutiveWins = 0;
        this.sessionData.currentBetPerNumber = 2; // Reset to minimum
        
        const btn = document.getElementById('toggleStrategyBtn');
        if (!btn) return;
        
        if (this.sessionData.bettingStrategy === 1) {
            // Strategy 1: Aggressive (Green)
            btn.textContent = '🟢 Strategy 1: Aggressive';
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
            console.log('✅ Strategy 1: Aggressive');
            console.log('   • +$1 after EACH loss');
            console.log('   • -$1 after EACH win');
        } else if (this.sessionData.bettingStrategy === 2) {
            // Strategy 2: Conservative (Blue)
            btn.textContent = '🔵 Strategy 2: Conservative';
            btn.style.background = 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)';
            console.log('✅ Strategy 2: Conservative');
            console.log('   • +$1 after 2 CONSECUTIVE losses');
            console.log('   • -$1 after 2 CONSECUTIVE wins');
        } else if (this.sessionData.bettingStrategy === 3) {
            // Strategy 3: Cautious (Purple)
            btn.textContent = '🟣 Strategy 3: Cautious';
            btn.style.background = 'linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%)';
            console.log('✅ Strategy 3: Cautious');
            console.log('   • +$2 after 3 CONSECUTIVE losses');
            console.log('   • -$1 after 2 CONSECUTIVE wins');
        } else {
            // Strategy 4: Defensive (Dark Teal) — the most cautious profile.
            // Slow escalation on losses, normal reduction on wins.
            btn.textContent = '🛡️ Strategy 4: Defensive';
            btn.style.background = 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)';
            console.log('✅ Strategy 4: Defensive');
            console.log('   • Initial bet $2');
            console.log('   • +$1 after 5 CONSECUTIVE losses');
            console.log('   • -$1 after 2 CONSECUTIVE wins');
        }
        
        this.render();
    }

    setupBettingControl() {
        const bettingBtn = document.getElementById('toggleBettingBtn');
        if (bettingBtn && !bettingBtn.hasListener) {
            bettingBtn.hasListener = true;
            bettingBtn.addEventListener('click', () => this.toggleBetting());
        }
        
        const strategyBtn = document.getElementById('toggleStrategyBtn');
        if (strategyBtn && !strategyBtn.hasListener) {
            strategyBtn.hasListener = true;
            strategyBtn.addEventListener('click', () => this.toggleStrategy());
        }

        // ⚙️ Strategy-4 variables editor — open / save / cancel.
        const varsBtn = document.getElementById('strategyVarsBtn');
        if (varsBtn && !varsBtn.hasListener) {
            varsBtn.hasListener = true;
            varsBtn.addEventListener('click', () => this.openStrategyVarsEditor());
        }
        const saveBtn = document.getElementById('s4VarsSave');
        if (saveBtn && !saveBtn.hasListener) {
            saveBtn.hasListener = true;
            saveBtn.addEventListener('click', () => this.saveStrategyVars());
        }
        const cancelBtn = document.getElementById('s4VarsCancel');
        if (cancelBtn && !cancelBtn.hasListener) {
            cancelBtn.hasListener = true;
            cancelBtn.addEventListener('click', () => this.closeStrategyVarsEditor());
        }
        // Top-right × close button (same effect as Cancel — discards
        // unsaved changes, just hides the panel).
        const closeBtn = document.getElementById('s4VarsClose');
        if (closeBtn && !closeBtn.hasListener) {
            closeBtn.hasListener = true;
            closeBtn.addEventListener('click', () => this.closeStrategyVarsEditor());
        }
    }

    openStrategyVarsEditor() {
        // Pre-fill inputs from the live state so the editor always
        // reflects the current values.
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        set('s4LossesIn',  this.sessionData.s4LossesToIncrease);
        set('s4LossIncIn', this.sessionData.s4LossIncrement);
        set('s4WinsIn',    this.sessionData.s4WinsToDecrease);
        set('s4WinDecIn',  this.sessionData.s4WinDecrement);
        const panel = document.getElementById('strategyVarsPanel');
        if (panel) panel.style.display = 'block';
        const status = document.getElementById('s4VarsStatus');
        if (status) status.textContent = '';
    }

    closeStrategyVarsEditor() {
        const panel = document.getElementById('strategyVarsPanel');
        if (panel) panel.style.display = 'none';
    }

    saveStrategyVars() {
        // Read inputs, validate, and write back to sessionData. The
        // Strategy-4 adjustment block in recordBetResult() reads these
        // values on every spin so the change takes effect on the next
        // hit/miss without any restart.
        const readInt = (id, fallback, min) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const v = parseInt(el.value, 10);
            if (!Number.isFinite(v)) return fallback;
            return Math.max(min, v);
        };
        const lossesNeeded = readInt('s4LossesIn',  this.sessionData.s4LossesToIncrease, 1);
        const lossInc      = readInt('s4LossIncIn', this.sessionData.s4LossIncrement,    0);
        const winsNeeded   = readInt('s4WinsIn',    this.sessionData.s4WinsToDecrease,   1);
        const winDec       = readInt('s4WinDecIn',  this.sessionData.s4WinDecrement,     0);

        this.sessionData.s4LossesToIncrease = lossesNeeded;
        this.sessionData.s4LossIncrement    = lossInc;
        this.sessionData.s4WinsToDecrease   = winsNeeded;
        this.sessionData.s4WinDecrement     = winDec;

        const status = document.getElementById('s4VarsStatus');
        if (status) {
            status.textContent = `✓ Saved — +$${lossInc} after ${lossesNeeded} losses, -$${winDec} after ${winsNeeded} wins`;
            setTimeout(() => { if (status) status.textContent = ''; }, 3000);
        }
        console.log(`🛡️ Strategy 4 variables updated: +$${lossInc} after ${lossesNeeded} losses, -$${winDec} after ${winsNeeded} wins`);
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

    calculateChipBreakdown(amount) {
        // Available casino chips (in descending order)
        const chips = [100, 25, 5, 2, 1];
        const breakdown = [];
        let remaining = Math.round(amount);

        for (const chip of chips) {
            if (remaining >= chip) {
                const count = Math.floor(remaining / chip);
                breakdown.push({ value: chip, count: count });
                remaining -= chip * count;
            }
        }

        return breakdown;
    }

    formatChipBreakdown(breakdown) {
        if (breakdown.length === 0) return '--';
        return breakdown
            .map(chip => `${chip.count}x $${chip.value}`)
            .join(' + ');
    }

    setupSpinListener() {
        // Check for new spins every 200ms - FASTER than orchestrator
        if (this._spinListenerInterval) {
            clearInterval(this._spinListenerInterval);
        }
        this.lastSpinCount = 0;
        this._spinListenerInterval = setInterval(() => {
            try {
                this.checkForNewSpin();
            } catch (e) {
                console.warn('⚠️ Spin listener error:', e.message);
            }
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

            // Check if we had a pending bet.
            //
            // PARITY GUARD (off-by-one fix):
            // The orchestrator stamps pendingBet.placedAtSpinCount with
            // window.spins.length at decision time. The Auto Test
            // runner decides AFTER seeing N spins and resolves on
            // spin N+1, so we mirror that here: only resolve once the
            // CURRENT spin count has advanced past the stamp. If the
            // orchestrator decided on the same spin we just observed,
            // defer — the bet will resolve when the NEXT spin lands.
            if (this.pendingBet && this.pendingBet.betAmount > 0) {
                const stamp = (typeof this.pendingBet.placedAtSpinCount === 'number')
                    ? this.pendingBet.placedAtSpinCount : -Infinity;
                if (currentCount <= stamp) {
                    // Decision was made on this same spin. Wait for
                    // the next one.
                    console.log(`⏳ Pending bet held (placedAt=${stamp}, current=${currentCount}); resolves on next spin.`);
                } else {
                    const hit = this.pendingBet.predictedNumbers.includes(actualNumber);

                    console.log('Pending bet:', this.pendingBet);
                    console.log('Predicted numbers:', this.pendingBet.predictedNumbers);
                    console.log('Actual number:', actualNumber);
                    console.log('Hit?', hit);

                    this.recordBetResult(
                        this.pendingBet.betAmount,
                        this.pendingBet.numbersCount,
                        hit,
                        actualNumber,
                        this.pendingBet.predictedNumbers
                    );

                    // Clear the pending bet
                    this.pendingBet = null;
                }
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
            // Use strategy-based bet amount instead of backend calculation
            const betAmount = this.sessionData.currentBetPerNumber || 2;
            const numbersCount = prediction.numbers ? prediction.numbers.length : 12;

            this.sessionData.lastBetAmount = betAmount;
            this.sessionData.lastBetNumbers = numbersCount;

            console.log(`💡 Using strategy bet: $${betAmount}/number (Strategy ${this.sessionData.bettingStrategy})`);
            // CRITICAL: Store the prediction we're betting on
            if (this.sessionData.isSessionActive && betAmount > 0 && this.sessionData.isBettingEnabled) {
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

    async recordBetResult(betPerNumber, numbersCount, hit, actualNumber, predictedNumbers) {
        const totalBet = betPerNumber * numbersCount;

        this.sessionData.totalBets++;

        // NEW: Track which spin this bet was placed on
        // NEW: Track which spin this bet was placed on
        const spins = window.spins || window.spinData;
        if (spins && spins.length > 0) {
            // Store the LAST spin's position (the one we just bet on)
            this.sessionData.spinsWithBets.push(spins.length);
            console.log(`📌 Bet placed on spin #${spins.length}, spinsWithBets now:`, this.sessionData.spinsWithBets);
        }

        let netChange = 0;

        if (hit) {
            // Win: 35:1 on one number, lose the rest. The winning chip
            // returns b*36 (35 winnings + the stake back); subtracting
            // totalBet (b*N) gives net = b*(36 − N). The legacy branch
            // used b*35 here which under-counted every win by exactly
            // one stake — corrected to b*36 to match the auto-test
            // _calculatePnL formula. _useAutoTestPnl is now a no-op
            // (kept so any callers toggling it don't break) but both
            // branches give identical results.
            const winAmount = betPerNumber * 36;
            netChange = winAmount - totalBet;
            
            this.sessionData.currentBankroll += netChange;
            this.sessionData.sessionProfit += netChange;
            this.sessionData.totalWins++;
            this.sessionData.consecutiveLosses = 0;
            this.sessionData.consecutiveWins++;  // NEW: Track consecutive wins
            
            console.log(`✅ HIT! Number ${actualNumber} - Won $${netChange}`);
            } else {
                // Loss
                netChange = -totalBet;
                
                this.sessionData.currentBankroll += netChange;
                this.sessionData.sessionProfit += netChange;
                this.sessionData.totalLosses++;
                this.sessionData.consecutiveLosses++;
                this.sessionData.consecutiveWins = 0;  // NEW: Reset consecutive wins
                
                console.log(`❌ MISS! Number ${actualNumber} - Lost $${Math.abs(netChange)}`);
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

        // CRITICAL: Feed result back to AI engine for session adaptation
        // The engine needs to learn from every bet result (win/loss/near-miss)
        try {
            const engine = typeof window !== 'undefined' ? window.aiAutoEngine : null;
            if (engine && engine.isTrained && engine.isEnabled && engine.lastDecision) {
                engine.recordResult(
                    engine.lastDecision.selectedPair,
                    engine.lastDecision.selectedFilter,
                    hit,
                    actualNumber,
                    engine.lastDecision.numbers || []
                );
                engine.lastDecision = null; // Consumed
                console.log('🧠 AI engine session adaptation updated');
            }
        } catch (engineError) {
            console.warn('⚠️ Failed to update AI engine:', engineError.message);
        }

        // ═══════════════════════════════════════════════════════
        // STRATEGY-BASED BET ADJUSTMENT
        // ═══════════════════════════════════════════════════════

        if (this.sessionData.bettingStrategy === 1) {
            // ═══ STRATEGY 1: AGGRESSIVE ═══
            // +$1 after EACH loss, -$1 after EACH win
            if (hit) {
                this.sessionData.currentBetPerNumber = Math.max(2, this.sessionData.currentBetPerNumber - 1);
                console.log(`🟢 Strategy 1: WIN → Decreased bet to $${this.sessionData.currentBetPerNumber}`);
            } else {
                this.sessionData.currentBetPerNumber += 1;
                console.log(`🟢 Strategy 1: LOSS → Increased bet to $${this.sessionData.currentBetPerNumber}`);
            }
            
        } else if (this.sessionData.bettingStrategy === 2) {
            // ═══ STRATEGY 2: CONSERVATIVE ═══
            // +$1 after 2 CONSECUTIVE losses, -$1 after 2 CONSECUTIVE wins
            if (hit) {
                if (this.sessionData.consecutiveWins >= 2) {
                    this.sessionData.currentBetPerNumber = Math.max(2, this.sessionData.currentBetPerNumber - 1);
                    this.sessionData.consecutiveWins = 0; // Reset after adjustment
                    console.log(`🔵 Strategy 2: 2 CONSECUTIVE WINS → Decreased bet to $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🔵 Strategy 2: ${this.sessionData.consecutiveWins} consecutive win(s) - Need ${2 - this.sessionData.consecutiveWins} more to decrease bet`);
                }
            } else {
                if (this.sessionData.consecutiveLosses >= 2) {
                    this.sessionData.currentBetPerNumber += 1;
                    this.sessionData.consecutiveLosses = 0;  // RESET COUNTER AFTER ADJUSTMENT
                    console.log(`🔵 Strategy 2: 2 CONSECUTIVE LOSSES → Increased bet to $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🔵 Strategy 2: ${this.sessionData.consecutiveLosses} consecutive loss(es) - Need ${2 - this.sessionData.consecutiveLosses} more to increase bet`);
                }
            }
            
        } else if (this.sessionData.bettingStrategy === 3) {
            // ═══ STRATEGY 3: CAUTIOUS ═══
            // +$2 after 3 CONSECUTIVE losses, -$1 after 2 CONSECUTIVE wins
            if (hit) {
                if (this.sessionData.consecutiveWins >= 2) {
                    this.sessionData.currentBetPerNumber = Math.max(2, this.sessionData.currentBetPerNumber - 1);
                    this.sessionData.consecutiveWins = 0; // Reset after adjustment
                    console.log(`🟣 Strategy 3: 2 CONSECUTIVE WINS → Decreased bet to $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🟣 Strategy 3: ${this.sessionData.consecutiveWins} consecutive win(s) - Need ${2 - this.sessionData.consecutiveWins} more to decrease bet`);
                }
            } else {
                if (this.sessionData.consecutiveLosses >= 3) {
                    this.sessionData.currentBetPerNumber += 2; // +$2 not +$1
                    this.sessionData.consecutiveLosses = 0;  // RESET COUNTER AFTER ADJUSTMENT
                    console.log(`🟣 Strategy 3: 3 CONSECUTIVE LOSSES → Increased bet by $2 to $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🟣 Strategy 3: ${this.sessionData.consecutiveLosses} consecutive loss(es) - Need ${3 - this.sessionData.consecutiveLosses} more to increase bet`);
                }
            }

        } else if (this.sessionData.bettingStrategy === 4) {
            // ═══ STRATEGY 4: DEFENSIVE (user-tunable) ═══
            // Variables edited via the ⚙️ button next to the strategy
            // toggle. Defaults: +$1 after 5 losses, -$1 after 2 wins.
            // Floor remains $2 regardless of decrement size.
            const lossesNeeded = Math.max(1, parseInt(this.sessionData.s4LossesToIncrease, 10) || 5);
            const lossInc      = Math.max(0, parseInt(this.sessionData.s4LossIncrement,    10) || 1);
            const winsNeeded   = Math.max(1, parseInt(this.sessionData.s4WinsToDecrease,   10) || 2);
            const winDec       = Math.max(0, parseInt(this.sessionData.s4WinDecrement,     10) || 1);
            if (hit) {
                if (this.sessionData.consecutiveWins >= winsNeeded) {
                    this.sessionData.currentBetPerNumber = Math.max(2, this.sessionData.currentBetPerNumber - winDec);
                    this.sessionData.consecutiveWins = 0; // Reset after adjustment
                    console.log(`🛡️ Strategy 4: ${winsNeeded} CONSECUTIVE WINS → Decreased bet by $${winDec} to $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🛡️ Strategy 4: ${this.sessionData.consecutiveWins} consecutive win(s) - Need ${winsNeeded - this.sessionData.consecutiveWins} more to decrease bet`);
                }
            } else {
                if (this.sessionData.consecutiveLosses >= lossesNeeded) {
                    this.sessionData.currentBetPerNumber += lossInc;
                    this.sessionData.consecutiveLosses = 0;  // RESET COUNTER AFTER ADJUSTMENT
                    console.log(`🛡️ Strategy 4: ${lossesNeeded} CONSECUTIVE LOSSES → Increased bet by $${lossInc} to $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🛡️ Strategy 4: ${this.sessionData.consecutiveLosses} consecutive loss(es) - Need ${lossesNeeded - this.sessionData.consecutiveLosses} more to increase bet`);
                }
            }
        }

        console.log(`💵 Next bet amount: $${this.sessionData.currentBetPerNumber}/number`);


        // Add to history.
        // predictedNumbers comes from the caller's pendingBet so the
        // bet history carries the full predicted-numbers list per row
        // — needed for manual verification of the session report
        // against an Auto Test reference run.
        this.betHistory.unshift({
            spin: this.sessionData.totalBets,
            betAmount: betPerNumber,
            totalBet: totalBet,
            hit: hit,
            actualNumber: actualNumber,
            netChange: netChange,
            predictedNumbers: Array.isArray(predictedNumbers) ? predictedNumbers.slice() : [],
            timestamp: new Date().toLocaleTimeString()
        });

        // Keep up to 1000 bets so the downloaded session report
        // captures the full session even on long manual runs (the UI
        // panel still renders all rows but a typical verification
        // session is well under this cap). Previously truncated to 10
        // which silently dropped data from the report.
        if (this.betHistory.length > 1000) {
            this.betHistory = this.betHistory.slice(0, 1000);
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

        // Chip Breakdown Display
        const chipBreakdownEl = document.getElementById('chipBreakdownDisplay');
        if (chipBreakdownEl) {
            if (this.sessionData.isSessionActive && this.sessionData.lastBetAmount > 0) {
                const betPerNumber = this.sessionData.lastBetAmount;
                const breakdown = this.calculateChipBreakdown(betPerNumber);
                const breakdownText = this.formatChipBreakdown(breakdown);

                chipBreakdownEl.innerHTML = `
                    <div style="font-size: 11px; color: #666; margin-top: 4px; line-height: 1.4;">
                        <strong>Chips:</strong> ${breakdownText}
                    </div>
                `;
                chipBreakdownEl.style.display = 'block';
            } else {
                chipBreakdownEl.style.display = 'none';
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

    setPrediction(prediction) {
        /**
         * Receive prediction from AI panel
         * Store it as pending bet to be placed on next spin
         */

        if (!prediction || !prediction.numbers || prediction.numbers.length === 0) {
            console.log('⚠️ No valid prediction to set');
            return;
        }

        // AUTO MODE SKIP: If AI engine decided SKIP, don't create a bet
        // This prevents the delayed prediction cascade from overwriting a SKIP decision.
        //
        // EXCEPTION (Test Lab only): the autopilot's T1 pair drives the
        // V6 cascade selections. Strategy-Lab's intersection (T1 ∩ T2 ∩
        // T2_13opp, no T3) is stricter than V6's cascade, so strategy-
        // lab may return SKIP while V6 still has a non-empty bet on
        // the same autopilot-chosen pair. In Test Lab, V6 is authoritative
        // because that's what the user SEES on screen.
        // 3T-Selection / Auto / T1-Strategy / AI-Trained: original
        // behavior — strategy SKIP blocks the bet.
        const autoEngine = typeof window !== 'undefined' ? window.aiAutoEngine : null;
        const orchMode = (typeof window !== 'undefined' && window.autoUpdateOrchestrator)
            ? window.autoUpdateOrchestrator.decisionMode
            : null;
        const skipGuardBypass = (orchMode === 'test');
        if (autoEngine && autoEngine.isEnabled && autoEngine.lastDecision === null && !skipGuardBypass) {
            this.pendingBet = null;
            console.log('⏭️ AUTO SKIP: Not creating pending bet (engine decided SKIP)');
            return;
        }
        if (skipGuardBypass && autoEngine && autoEngine.lastDecision === null) {
            console.log('🧪 Test Lab: V6 cascade authoritative — accepting bet despite strategy-lab SKIP');
        }


        console.log('💰 Money panel received prediction:', {
            signal: prediction.signal,
            numbers: prediction.numbers.length,
            confidence: prediction.confidence
        });
        
        // Start session if not already active
        if (!this.sessionData.isSessionActive) {
            console.log('🚀 Starting session (first prediction received)');
            this.sessionData.isSessionActive = true;
            // Sync lastSpinCount to current count so the interval doesn't
            // treat the current spin as a "new" result to check against
            const currentSpins = window.spins || window.spinData;
            if (currentSpins) {
                this.lastSpinCount = currentSpins.length;
                console.log(`📌 Synced lastSpinCount to ${this.lastSpinCount}`);
            }
        }
        
        // Store prediction details
        const betAmount = this.calculateBetAmount(prediction.numbers.length);

        // Only store pending bet if betting is ENABLED
        if (this.sessionData.isBettingEnabled) {
            // Capture the spin count at decision time so the spin
            // listener defers resolution until the NEXT spin arrives.
            // This mirrors the Auto Test runner's timing: decide after
            // observing N spins → resolve on spin N+1. Without this
            // stamp the bet would resolve immediately on the same spin
            // that triggered the orchestrator's decision.
            const placedAtSpinCount = (typeof prediction.placedAtSpinCount === 'number')
                ? prediction.placedAtSpinCount
                : (Array.isArray(window.spins) ? window.spins.length : 0);

            // ── RACE-CONDITION GUARD ──
            // The orchestrator's setInterval (500ms) and the money
            // panel's spin listener (200ms) can fire in either order
            // when a new spin arrives. If the orchestrator wins the
            // race, it calls setPrediction here BEFORE the spin
            // listener has resolved the previous pendingBet. The
            // previous pendingBet is then overwritten with a new
            // stamp matching the new spin count, and the spin
            // listener defers it (currentCount === stamp). The bet
            // is silently lost. To prevent that, resolve any stale
            // pendingBet right here against the spin that would have
            // resolved it (window.spins[oldStamp].actual = the spin
            // entered AFTER the old trigger).
            const old = this.pendingBet;
            const liveSpins = Array.isArray(window.spins) ? window.spins : null;
            if (old
                && old.betAmount > 0
                && typeof old.placedAtSpinCount === 'number'
                && old.placedAtSpinCount < placedAtSpinCount
                && liveSpins
                && liveSpins[old.placedAtSpinCount]) {
                const resolutionEntry = liveSpins[old.placedAtSpinCount];
                const resolutionActual = (resolutionEntry && typeof resolutionEntry.actual === 'number')
                    ? resolutionEntry.actual : null;
                if (resolutionActual !== null) {
                    const hit = old.predictedNumbers.includes(resolutionActual);
                    console.log(`🧹 Resolving stale pendingBet (placedAt=${old.placedAtSpinCount}) against actual=${resolutionActual} BEFORE accepting new prediction.`);
                    // Synchronously resolve. recordBetResult is async
                    // but its synchronous side-effects (spinsWithBets,
                    // betHistory, sessionProfit) all complete before
                    // any await — sufficient to keep totals accurate.
                    this.recordBetResult(
                        old.betAmount,
                        old.numbersCount,
                        hit,
                        resolutionActual,
                        old.predictedNumbers
                    );
                }
            }

            this.pendingBet = {
                betAmount: betAmount,
                numbersCount: prediction.numbers.length,
                predictedNumbers: prediction.numbers,
                signal: prediction.signal,
                confidence: prediction.confidence,
                placedAtSpinCount
            };
            console.log('💰 Pending bet stored:', {
                betPerNumber: betAmount,
                totalNumbers: prediction.numbers.length,
                totalBet: betAmount * prediction.numbers.length
            });
        } else {
            this.pendingBet = null;
            console.log('⏸️ Betting paused - prediction received but no bet placed');
        }

        // Update session data for display (always show what WOULD be bet)
        this.sessionData.lastBetAmount = betAmount;
        this.sessionData.lastBetNumbers = prediction.numbers.length;
        
        // Update display
        this.render();
    }
    
    calculateBetAmount(numberCount) {
        /**
         * Calculate bet amount based on strategy and bankroll
         */
        
        const currentBet = this.sessionData.currentBetPerNumber;
        
        // Safety check: ensure we have enough bankroll
        const maxBet = Math.floor(this.sessionData.currentBankroll / (numberCount * 2));
        const safeBet = Math.min(currentBet, maxBet);
        
        return Math.max(1, safeBet); // Minimum $1 per number
    }
}

// Create global instance
window.moneyPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.moneyPanel = new MoneyManagementPanel();
        console.log('✅ Money Management Panel initialized (RIGHT position)');
    }, 200); // Delay to ensure wheel and AI panels load first
});

console.log('✅ Money Management Panel script loaded');
