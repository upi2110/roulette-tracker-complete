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
            // Strategy 2 (Conservative) — cumulative loss tally that is
            // NOT reset by an isolated win. Increments on every loss;
            // a +$1 escalation (every 3 losses) resets it; so does a
            // -$1 de-escalation after 2 consecutive wins. Separate from
            // consecutiveLosses (which other strategies still use).
            s2LossTally: 0,
            lastBetAmount: 0,
            lastBetNumbers: 12,
            isSessionActive: false,
            spinsWithBets: [],
            isBettingEnabled: false,  // NEW: User control for betting
            bettingStrategy: 4,  // 1=Aggressive, 2=Conservative, 3=Cautious, 4=Defensive (default: Defensive)
            // ─── Strategy-4 Defensive variables (user-tunable) ───
            // Default escalation:
            //   +$1 after 6 consecutive losses, -$1 after 1 consecutive win.
            // Edited via the ⚙️ Variables button next to the strategy button.
            s4LossesToIncrease: 8,
            // S4 cumulative loss tally (mirrors s2LossTally idea).
            // Single wins do NOT reset it — only an explicit +$1
            // escalation or -$1 de-escalation does. Lives alongside
            // the shared consecutiveLosses counter (other strategies
            // still use that).
            s4LossTally: 0,
            s4LossIncrement:    1,
            s4WinsToDecrease:   1,
            s4WinDecrement:     1,
            // ─── Strategy-5 LOGICAL variables (user-tunable) ───
            // Logical = Defensive + N/4 bet scaling + fractional
            // loss accumulator + cap-to-session-target.
            // Reference bet calibrated to 4 numbers:
            //   bet_per_num_actual = base × min(N, 4) / 4
            // Loss escalation accumulates fractionally:
            //   miss adds N_managed/4 to s5LossUnits (max N_managed=4)
            //   hit  adds 1.0 to s5WinUnits (full win regardless of N)
            // Cap: max base = max($2, floor(remainingToTarget / 32)).
            s5LossesToIncrease: 6,
            s5LossIncrement:    1,
            s5WinsToDecrease:   1,
            s5WinDecrement:     1,
            s5StartingBet:      2,
            s5SessionTarget:    100,
            s5MinBet:           2,
            s5ReferenceN:       4,
            s5LossUnits:        0,  // float — fractional accumulator
            s5WinUnits:         0,  // float — fractional accumulator
            // ─── Strategy-6 SUPER CAUTIOUS variables (user-tunable) ───
            // Super Cautious = Defensive escalation with a hard MAX
            // bet ceiling + smart-bet cap so wins don't overshoot the
            // session target. Defaults:
            //   +$1 after 3 consecutive losses, capped at s6MaxBet=$5
            //   -$1 after 1 consecutive win, floored at s6MinBet=$2
            // Smart cap: when about to bet, scale down to land near
            // remaining-to-target so a win doesn't overshoot. Smart
            // floor is $1 (not s6MinBet) — see _s6SmartBet().
            s6LossesToIncrease: 3,
            s6LossIncrement:    1,
            s6WinsToDecrease:   1,
            s6WinDecrement:     1,
            s6StartingBet:      2,
            s6SessionTarget:    100,
            s6MinBet:           2,
            s6MaxBet:           5,
            consecutiveWins: 0,  // Track consecutive wins for strategies 2 & 3
            peakBankroll: 4000,   // running max of currentBankroll — for max drawdown
            maxDrawdown: 0,       // largest peak-to-trough dip during the session
            sameArmed: false,     // Same mode: trigger-armed state (true = bet on next spin)
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
                    <button id="strategyVarsBtn" type="button" title="Edit active-strategy variables (loss/win thresholds + bet step sizes)" style="
                            padding: 3px 6px;
                            font-size: 11px;
                            font-weight: 700;
                            line-height: 1;
                            border: none;
                            border-radius: 3px;
                            cursor: pointer;
                            background: #475569;
                            color: white;
                        ">⚙️</button>
                    <button id="strategyInfoBtn" type="button" title="Show what the active strategy does (click to toggle)" style="
                            padding: 3px 6px;
                            font-size: 11px;
                            font-weight: 700;
                            line-height: 1;
                            border: none;
                            border-radius: 3px;
                            cursor: pointer;
                            background: #0ea5e9;
                            color: white;
                        ">ℹ️</button>
                    <button id="adjustStakeBtn" type="button" title="Manually override the current bet/number. Strategy continues from the new base." style="
                            padding: 3px 6px;
                            font-size: 11px;
                            font-weight: 700;
                            line-height: 1;
                            border: none;
                            border-radius: 3px;
                            cursor: pointer;
                            background: #f59e0b;
                            color: white;
                        ">💲</button>
                </div>
                <!-- Adjust-stake editor — manual override of the current
                     bet/number to cut losses. After Save the strategy's
                     own win/loss adjustment block (S1–S6) continues
                     from the new base. -->
                <div id="adjustStakePanel" style="display:none;margin-top:6px;background:#fff7ed;border:1px solid #f59e0b;border-radius:4px;padding:8px 24px 8px 8px;font-size:11px;color:#7c2d12;position:relative;">
                    <button id="adjustStakeClose" type="button" title="Close" style="position:absolute;top:4px;right:4px;width:20px;height:20px;line-height:18px;font-size:14px;font-weight:700;border:1px solid #fdba74;background:#fff;color:#7c2d12;border-radius:3px;cursor:pointer;padding:0;">×</button>
                    <div style="font-weight:700;margin-bottom:6px;">💲 Adjust bet/number</div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <label for="adjustStakeIn" style="font-weight:600;">New $:</label>
                        <input id="adjustStakeIn" type="number" min="1" step="1" style="width:70px;padding:3px 4px;border:1px solid #fdba74;border-radius:3px;font-size:12px;" />
                        <button id="adjustStakeSave" type="button" style="padding:3px 10px;font-size:11px;font-weight:700;border:none;border-radius:3px;background:#f59e0b;color:white;cursor:pointer;">Save</button>
                        <button id="adjustStakeCancel" type="button" style="padding:3px 10px;font-size:11px;font-weight:700;border:1px solid #fdba74;border-radius:3px;background:#fff;color:#7c2d12;cursor:pointer;">Cancel</button>
                        <span id="adjustStakeStatus" style="font-size:11px;color:#16a34a;font-weight:600;"></span>
                    </div>
                    <div style="margin-top:4px;font-size:10px;color:#9a3412;">Current: <span id="adjustStakeCurrent">$2</span>. Strategy continues from the new base.</div>
                </div>
                <!-- Strategy info popup — shows a one-paragraph description
                     of the currently active strategy. Toggled by ℹ️ button.
                     Pure read-only display; no logic changes anywhere else. -->
                <div id="strategyInfoPanel" style="display:none;margin-top:6px;background:#f0f9ff;border:1px solid #0ea5e9;border-radius:4px;padding:8px 24px 8px 8px;font-size:11px;color:#0c4a6e;position:relative;line-height:1.5;">
                    <button id="strategyInfoClose" type="button" title="Close" style="position:absolute;top:4px;right:4px;width:20px;height:20px;line-height:18px;font-size:14px;font-weight:700;border:1px solid #93c5fd;background:#fff;color:#0c4a6e;border-radius:3px;cursor:pointer;padding:0;">×</button>
                    <div id="strategyInfoTitle" style="font-weight:800;margin-bottom:4px;">Strategy info</div>
                    <div id="strategyInfoBody">Click ℹ️ to refresh.</div>
                </div>
                <!-- Variables editor (Strategy-4 tunables). Hidden until
                     the ⚙️ button is clicked. Save commits values into
                     this.sessionData.s4* fields used by the Strategy-4
                     adjustment block in recordBetResult(). -->
                <div id="strategyVarsPanel" style="display:none;margin-top:6px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;padding:8px;font-size:11px;color:#1f2937;position:relative;">
                    <button id="s4VarsClose" type="button" title="Close" style="position:absolute;top:4px;right:4px;width:20px;height:20px;line-height:18px;font-size:14px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:3px;cursor:pointer;padding:0;">×</button>
                    <div style="font-weight:700;color:#0f766e;margin-bottom:6px;padding-right:24px;">🛡️ Strategy 4 — Defensive variables</div>
                    <div style="display:grid;grid-template-columns:1fr 60px;gap:4px 6px;align-items:center;">
                        <label for="s4LossesIn" title="How many CUMULATIVE losses (single wins do not reset) before the bet is increased.">Increase bet after every</label>
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
                <!-- Strategy-6 variables editor — opens via the same ⚙️
                     button when Strategy 6 is the active strategy.
                     Mirrors the S4 layout + adds Min bet / Max bet
                     fields (S6's hard ceiling). -->
                <div id="strategy6VarsPanel" style="display:none;margin-top:6px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;padding:8px;font-size:11px;color:#1f2937;position:relative;">
                    <button id="s6VarsClose" type="button" title="Close" style="position:absolute;top:4px;right:4px;width:20px;height:20px;line-height:18px;font-size:14px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:3px;cursor:pointer;padding:0;">×</button>
                    <div style="font-weight:700;color:#475569;margin-bottom:6px;padding-right:24px;">🪶 Strategy 6 — Super Cautious variables</div>
                    <div style="display:grid;grid-template-columns:1fr 60px;gap:4px 6px;align-items:center;">
                        <label for="s6LossesIn" title="How many consecutive LOSSES before the bet is increased.">Increase bet after every</label>
                        <input id="s6LossesIn" type="number" min="1" max="50" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s6LossIncIn" title="Dollar amount added to the per-number bet on each escalation.">Increase $</label>
                        <input id="s6LossIncIn" type="number" min="0" max="100" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s6WinsIn" title="How many consecutive WINS before the bet is decreased.">Decrease bet after every</label>
                        <input id="s6WinsIn" type="number" min="1" max="50" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s6WinDecIn" title="Dollar amount removed from the per-number bet on each step-down.">Decrease $</label>
                        <input id="s6WinDecIn" type="number" min="0" max="100" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s6MinIn" title="Minimum bet/number. Escalation never goes below this.">Min bet $</label>
                        <input id="s6MinIn" type="number" min="1" max="100" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s6MaxIn" title="Maximum bet/number. Escalation hard-stops at this ceiling.">Max bet $</label>
                        <input id="s6MaxIn" type="number" min="1" max="500" step="1" style="padding:3px;font-size:11px;width:55px;">
                        <label for="s6TargetIn" title="Session target in dollars. Smart-bet scales down so a win lands near this.">Session target $</label>
                        <input id="s6TargetIn" type="number" min="1" max="100000" step="1" style="padding:3px;font-size:11px;width:55px;">
                    </div>
                    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">
                        <button id="s6VarsCancel" type="button" style="padding:4px 10px;font-size:11px;border:1px solid #cbd5e1;background:#fff;border-radius:3px;cursor:pointer;">Cancel</button>
                        <button id="s6VarsSave" type="button" style="padding:4px 10px;font-size:11px;border:none;background:#475569;color:#fff;border-radius:3px;cursor:pointer;font-weight:600;">Save</button>
                    </div>
                    <div id="s6VarsStatus" style="margin-top:6px;font-size:10px;color:#16a34a;min-height:12px;"></div>
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
                    <div class="money-stat">
                        <label>Session P&L</label>
                        <div class="stat-value" id="sessionPnLValue">$0</div>
                    </div>
                    <div class="money-stat">
                        <label>Max Drawdown</label>
                        <div class="stat-value" id="maxDrawdownValue">$0</div>
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
        // Cycle through strategies: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 1
        this.sessionData.bettingStrategy = (this.sessionData.bettingStrategy % 7) + 1;

        // Reset counters when switching strategies
        this.sessionData.consecutiveWins = 0;
        this.sessionData.s2LossTally     = 0;  // S2 cumulative tally
        this.sessionData.s4LossTally     = 0;  // S4 cumulative tally
        this.sessionData.currentBetPerNumber = 2; // Reset to minimum
        // Strategy-5 fractional accumulators reset on every strategy switch
        // (matches the "fresh start" semantics for s1–s4 consec counters).
        this.sessionData.s5LossUnits = 0;
        this.sessionData.s5WinUnits  = 0;

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
        } else if (this.sessionData.bettingStrategy === 4) {
            // Strategy 4: Defensive (Dark Teal) — the most cautious profile.
            // Slow escalation on losses, normal reduction on wins.
            btn.textContent = '🛡️ Strategy 4: Defensive';
            btn.style.background = 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)';
            console.log('✅ Strategy 4: Defensive');
            console.log('   • Initial bet $2');
            console.log('   • +$1 after 5 CONSECUTIVE losses');
            console.log('   • -$1 after 2 CONSECUTIVE wins');
        } else if (this.sessionData.bettingStrategy === 5) {
            // Strategy 5: LOGICAL (Indigo) — Defensive escalation +
            // N/4 bet sizing + fractional loss accumulator +
            // cap-to-session-target.
            btn.textContent = '🧠 Strategy 5: Logical';
            btn.style.background = 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)';
            // Reset Strategy-5 accumulators on switch IN to S5.
            this.sessionData.currentBetPerNumber = parseInt(this.sessionData.s5StartingBet, 10) || 2;
            this.sessionData.s5LossUnits = 0;
            this.sessionData.s5WinUnits  = 0;
            console.log('✅ Strategy 5: Logical');
            console.log(`   • Initial bet $${this.sessionData.currentBetPerNumber}, calibrated to 4 numbers`);
            console.log('   • Bet/num scales linearly: base × min(N,4)/4');
            console.log('   • +$1 after 6 CUMULATIVE loss-units (miss adds N_managed/4)');
            console.log('   • -$1 after 1 HIT (any hit counts as full win)');
            console.log(`   • Bet capped to max($2, floor((target − profit) / 32))`);
            console.log(`   • Session target +$${this.sessionData.s5SessionTarget}`);
        } else if (this.sessionData.bettingStrategy === 6) {
            // Strategy 6: SUPER CAUTIOUS (Slate) — Defensive escalation
            // with HARD max-bet cap + smart-bet target cap. Default
            // 3-loss escalation, +$1, cap $5, smart-bet keeps wins
            // from overshooting the +$100 session target.
            btn.textContent = '🪶 Strategy 6: Super Cautious';
            btn.style.background = 'linear-gradient(135deg, #475569 0%, #1e293b 100%)';
            // Reset to starting bet on switch IN to S6.
            this.sessionData.currentBetPerNumber = parseInt(this.sessionData.s6StartingBet, 10) || 2;
            console.log('✅ Strategy 6: Super Cautious');
            console.log(`   • Initial bet $${this.sessionData.currentBetPerNumber}`);
            console.log(`   • +$1 after ${this.sessionData.s6LossesToIncrease} CONSECUTIVE losses (capped at $${this.sessionData.s6MaxBet})`);
            console.log(`   • -$1 after ${this.sessionData.s6WinsToDecrease} CONSECUTIVE wins`);
            console.log(`   • Smart cap: scale bet down so wins don't overshoot +$${this.sessionData.s6SessionTarget}`);
        } else {
            // Strategy 7: FLAT BET (Amber) — bet/num NEVER auto-adjusts.
            // User sets the amount via 💲 Adjust stake. Every spin
            // wagers exactly currentBetPerNumber × N. No streak counters,
            // no escalation, no de-escalation. Cleanest baseline.
            btn.textContent = '➖ Strategy 7: Flat Bet';
            btn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)';
            console.log('✅ Strategy 7: Flat Bet');
            console.log(`   • Bet/num stays at $${this.sessionData.currentBetPerNumber} until you change it with 💲 Adjust stake`);
            console.log('   • No win/loss adjustments');
        }

        // Show/hide variables panel based on strategy (s4/s5 have one).
        try {
            const varsPanel = document.getElementById('strategyVarsPanel');
            if (varsPanel) varsPanel.style.display = 'none';
        } catch (_) {}

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

        // ⚙️ Strategy-6 wiring (open is shared via openStrategyVarsEditor —
        // routes based on the active strategy; only save/close need
        // their own buttons because they're on a separate panel).
        const s6SaveBtn = document.getElementById('s6VarsSave');
        if (s6SaveBtn && !s6SaveBtn.hasListener) {
            s6SaveBtn.hasListener = true;
            s6SaveBtn.addEventListener('click', () => this.saveStrategy6Vars());
        }
        const s6CancelBtn = document.getElementById('s6VarsCancel');
        if (s6CancelBtn && !s6CancelBtn.hasListener) {
            s6CancelBtn.hasListener = true;
            s6CancelBtn.addEventListener('click', () => this.closeStrategyVarsEditor());
        }
        const s6CloseBtn = document.getElementById('s6VarsClose');
        if (s6CloseBtn && !s6CloseBtn.hasListener) {
            s6CloseBtn.hasListener = true;
            s6CloseBtn.addEventListener('click', () => this.closeStrategyVarsEditor());
        }

        // ℹ️ Strategy info popup — shows what the active strategy does.
        const infoBtn = document.getElementById('strategyInfoBtn');
        if (infoBtn && !infoBtn.hasListener) {
            infoBtn.hasListener = true;
            infoBtn.addEventListener('click', () => this.toggleStrategyInfo());
        }
        const infoCloseBtn = document.getElementById('strategyInfoClose');
        if (infoCloseBtn && !infoCloseBtn.hasListener) {
            infoCloseBtn.hasListener = true;
            infoCloseBtn.addEventListener('click', () => {
                const p = document.getElementById('strategyInfoPanel');
                if (p) p.style.display = 'none';
            });
        }

        // 💲 Adjust-stake — open editor, save override, cancel/close.
        const adjBtn = document.getElementById('adjustStakeBtn');
        if (adjBtn && !adjBtn.hasListener) {
            adjBtn.hasListener = true;
            adjBtn.addEventListener('click', () => this.openAdjustStake());
        }
        const adjSave = document.getElementById('adjustStakeSave');
        if (adjSave && !adjSave.hasListener) {
            adjSave.hasListener = true;
            adjSave.addEventListener('click', () => this.saveAdjustStake());
        }
        const adjCancel = document.getElementById('adjustStakeCancel');
        if (adjCancel && !adjCancel.hasListener) {
            adjCancel.hasListener = true;
            adjCancel.addEventListener('click', () => {
                const p = document.getElementById('adjustStakePanel');
                if (p) p.style.display = 'none';
            });
        }
        const adjClose = document.getElementById('adjustStakeClose');
        if (adjClose && !adjClose.hasListener) {
            adjClose.hasListener = true;
            adjClose.addEventListener('click', () => {
                const p = document.getElementById('adjustStakePanel');
                if (p) p.style.display = 'none';
            });
        }
    }

    // 💲 Open the Adjust-stake editor — prefill with the current
    // bet/number so the user can tweak from where the strategy is.
    openAdjustStake() {
        const panel  = document.getElementById('adjustStakePanel');
        const input  = document.getElementById('adjustStakeIn');
        const curEl  = document.getElementById('adjustStakeCurrent');
        const status = document.getElementById('adjustStakeStatus');
        if (!panel) return;
        const cur = this.sessionData.currentBetPerNumber || 2;
        if (input)  input.value = cur;
        if (curEl)  curEl.textContent = `$${cur}`;
        if (status) status.textContent = '';
        panel.style.display = 'block';
    }

    // 💲 Save the manual override.
    // Resets the active strategy's win/loss streak counters so the
    // adjustment block (S1–S6) treats the new value as a fresh base.
    // Also resets s5/s6 derived counters when those strategies are
    // active. Bankroll, session profit, and total bets are unchanged
    // — this is a stake adjustment, not a session reset.
    saveAdjustStake() {
        const input  = document.getElementById('adjustStakeIn');
        const status = document.getElementById('adjustStakeStatus');
        const curEl  = document.getElementById('adjustStakeCurrent');
        const v = input ? parseInt(input.value, 10) : NaN;
        if (!Number.isFinite(v) || v < 1) {
            if (status) {
                status.style.color = '#dc2626';
                status.textContent = '⚠ enter a positive whole number';
            }
            return;
        }
        const old = this.sessionData.currentBetPerNumber;
        this.sessionData.currentBetPerNumber = v;

        // Reset streak counters so the next win/loss is treated as
        // the first event against this new base. Without this, e.g.
        // a S2/S3 that was 1-loss-deep at $5 would jump straight up
        // on the next miss even though we just lowered the base.
        this.sessionData.consecutiveLosses = 0;
        this.sessionData.consecutiveWins   = 0;
        this.sessionData.s2LossTally       = 0;  // S2 cumulative tally
        this.sessionData.s4LossTally       = 0;  // S4 cumulative tally
        // S5 — fractional unit accumulators reset.
        if (this.sessionData.s5LossUnits != null) this.sessionData.s5LossUnits = 0;
        if (this.sessionData.s5WinUnits  != null) this.sessionData.s5WinUnits  = 0;
        // S6 — keep its own loss/win streaks aligned.
        if (this.sessionData.s6LossStreak != null) this.sessionData.s6LossStreak = 0;
        if (this.sessionData.s6WinStreak  != null) this.sessionData.s6WinStreak  = 0;
        // lastBetAmount drives the "Next Bet" display.
        this.sessionData.lastBetAmount = v;

        // Refresh visible labels.
        if (curEl)  curEl.textContent = `$${v}`;
        if (status) {
            status.style.color = '#16a34a';
            status.textContent = `✓ stake set to $${v} (was $${old})`;
        }
        try { this.render && this.render(); } catch (_) {}
        console.log(`💲 Adjust stake: $${old}/num → $${v}/num — streak counters reset, strategy resumes from new base`);
    }

    // ℹ️ Toggles the strategy info popup. Reads the currently active
    // strategy (1–6) and renders a short description into the popup.
    // Read-only — does not change any session state.
    toggleStrategyInfo() {
        const panel = document.getElementById('strategyInfoPanel');
        const title = document.getElementById('strategyInfoTitle');
        const body  = document.getElementById('strategyInfoBody');
        if (!panel || !title || !body) return;

        // Toggle off if already visible.
        if (panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }

        const DESCRIPTIONS = {
            1: {
                title: 'Strategy 1 — Aggressive 🟢',
                body:
                    '<b>Adjustment:</b> +$1 per number after every <b>loss</b>; −$1 per number after every <b>win</b>.<br>' +
                    '<b>Behaviour:</b> Fast escalation — bet grows quickly during a losing run and shrinks quickly on wins.<br>' +
                    '<b>Use when:</b> You expect short losing streaks and want to recover fast on the next hit.<br>' +
                    '<b>Risk:</b> Highest — bet can climb rapidly with no built-in cap.'
            },
            2: {
                title: 'Strategy 2 — Conservative 🔵',
                body:
                    '<b>Adjustment:</b> +$1 per number after <b>3 cumulative losses</b> (single wins do not reset); −$1 per number after <b>2 consecutive wins</b>.<br>' +
                    '<b>Behaviour:</b> Slow, gentle progression. Bet stays in the $2–$5 range at typical hit rates.<br>' +
                    '<b>Use when:</b> You want smoother bankroll changes and fewer reactive jumps.<br>' +
                    '<b>Risk:</b> Moderate.'
            },
            3: {
                title: 'Strategy 3 — Cautious 🟣',
                body:
                    '<b>Adjustment:</b> +$2 per number after <b>3 consecutive losses</b>; −$1 per number after <b>2 consecutive wins</b>.<br>' +
                    '<b>Behaviour:</b> Holds steady through small dips; raises bet decisively only when the streak gets long.<br>' +
                    '<b>Use when:</b> You expect choppy results and want to avoid reacting to noise.<br>' +
                    '<b>Risk:</b> Moderate — larger increment but rarer.'
            },
            4: {
                title: 'Strategy 4 — Defensive 🛡️',
                body:
                    '<b>Adjustment:</b> +$1 per number after <b>8 cumulative losses</b> (single wins do not reset; configurable via ⚙️); −$1 per number after <b>1 win</b>.<br>' +
                    '<b>Behaviour:</b> Very slow to escalate, quick to de-escalate. Most parameters are editable in the ⚙️ Variables panel.<br>' +
                    '<b>Use when:</b> You want to ride out losing streaks at the base bet and only react to extended runs.<br>' +
                    '<b>Risk:</b> Low — bet stays small for long stretches.'
            },
            5: {
                title: 'Strategy 5 — Logical 🧠',
                body:
                    '<b>Base:</b> Defensive escalation (same trigger as S4).<br>' +
                    '<b>Extras:</b> Bet scales by <b>N/4</b> (N = numbers covered), accumulates fractional loss, and is <b>capped to the session target</b> so a single bet never exceeds remaining profit goal.<br>' +
                    '<b>Use when:</b> You want size to follow coverage and have a hard ceiling tied to your target.<br>' +
                    '<b>Risk:</b> Low–Moderate — capped by session target.'
            },
            7: {
                title: 'Strategy 7 — Flat Bet ➖',
                body:
                    '<b>Adjustment:</b> <b>none</b> — the bet/number stays exactly where you set it.<br>' +
                    '<b>Behaviour:</b> Wagers <code>currentBetPerNumber × N</code> on every spin. No streak counters, no escalation, no de-escalation. Use 💲 Adjust stake to change the amount manually.<br>' +
                    '<b>Use when:</b> You want a clean baseline to test prediction quality without confounding from progression rules.<br>' +
                    '<b>Risk:</b> Pure exposure — same per-spin risk as your chosen stake.'
            },
            6: {
                title: 'Strategy 6 — Super Cautious 🪶',
                body:
                    '<b>Base:</b> Defensive escalation with fully editable thresholds (⚙️).<br>' +
                    '<b>Extras:</b> <b>Hard max-bet cap</b> (default $5/number) and a <b>smart-bet target cap</b> so the bet never exceeds what is needed to reach the session target.<br>' +
                    '<b>Use when:</b> Protecting bankroll matters more than chasing recovery.<br>' +
                    '<b>Risk:</b> Lowest — bet is bounded on both sides.'
            },
        };

        const strat = this.sessionData.bettingStrategy;
        const info = DESCRIPTIONS[strat] || {
            title: 'Strategy info',
            body: 'No description available for the active strategy.'
        };
        title.textContent = info.title;
        body.innerHTML = info.body;
        panel.style.display = 'block';
    }

    openStrategyVarsEditor() {
        // Pre-fill inputs from the live state so the editor always
        // reflects the current values. Routes to the s4 panel when
        // Strategy 4 is active, the s6 panel when Strategy 6 is.
        // Other strategies have no editable vars (gear is a no-op).
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const s4Panel = document.getElementById('strategyVarsPanel');
        const s6Panel = document.getElementById('strategy6VarsPanel');
        const strat = this.sessionData.bettingStrategy;

        // Always close both first so we never show two at once.
        if (s4Panel) s4Panel.style.display = 'none';
        if (s6Panel) s6Panel.style.display = 'none';

        // Strategy 7 (Flat Bet) has no variables — ⚙️ is a no-op.
        // The user adjusts the stake directly via 💲 Adjust stake.
        if (strat === 7) {
            console.log('⚙️ Strategy 7 (Flat Bet) has no variables — use 💲 Adjust stake to change bet/number.');
            return;
        }

        if (strat === 6) {
            set('s6LossesIn',  this.sessionData.s6LossesToIncrease);
            set('s6LossIncIn', this.sessionData.s6LossIncrement);
            set('s6WinsIn',    this.sessionData.s6WinsToDecrease);
            set('s6WinDecIn',  this.sessionData.s6WinDecrement);
            set('s6MinIn',     this.sessionData.s6MinBet);
            set('s6MaxIn',     this.sessionData.s6MaxBet);
            set('s6TargetIn',  this.sessionData.s6SessionTarget);
            if (s6Panel) s6Panel.style.display = 'block';
            const status = document.getElementById('s6VarsStatus');
            if (status) status.textContent = '';
        } else {
            // Default panel (reused for S1/2/3/4/5). The S4 adjustment
            // block in recordBetResult() reads s4* fields when S4 is
            // active. For S1/2/3/5 we prefill the inputs with each
            // strategy's HARDCODED rule values so users see the
            // active strategy's actual thresholds instead of S4's "6".
            // S1/2/3/5 still don't read s4* at runtime (their blocks
            // use their own constants), so editing the panel for them
            // doesn't change behaviour — but the displayed defaults
            // match the active strategy.
            const STRAT_DEFAULTS = {
                1: { lossesToInc: 1, lossInc: 1, winsToDec: 1, winDec: 1 }, // Aggressive
                2: { lossesToInc: 3, lossInc: 1, winsToDec: 2, winDec: 1 }, // Conservative
                3: { lossesToInc: 3, lossInc: 2, winsToDec: 2, winDec: 1 }, // Cautious (+$2)
                4: {
                    lossesToInc: this.sessionData.s4LossesToIncrease,
                    lossInc:     this.sessionData.s4LossIncrement,
                    winsToDec:   this.sessionData.s4WinsToDecrease,
                    winDec:      this.sessionData.s4WinDecrement,
                },
                5: { lossesToInc: this.sessionData.s4LossesToIncrease,
                     lossInc:     this.sessionData.s4LossIncrement,
                     winsToDec:   this.sessionData.s4WinsToDecrease,
                     winDec:      this.sessionData.s4WinDecrement }, // S5 inherits S4 thresholds
            };
            const d = STRAT_DEFAULTS[strat] || STRAT_DEFAULTS[4];
            set('s4LossesIn',  d.lossesToInc);
            set('s4LossIncIn', d.lossInc);
            set('s4WinsIn',    d.winsToDec);
            set('s4WinDecIn',  d.winDec);

            // Re-label the panel header so it's clear which strategy
            // is being edited (was hard-coded to "Strategy 4").
            const header = s4Panel ? s4Panel.querySelector('div[style*="font-weight:700"]') : null;
            if (header) {
                const NAMES = {
                    1: '🟢 Strategy 1 — Aggressive',
                    2: '🔵 Strategy 2 — Conservative',
                    3: '🟣 Strategy 3 — Cautious',
                    4: '🛡️ Strategy 4 — Defensive',
                    5: '🧠 Strategy 5 — Logical',
                };
                header.textContent = `${NAMES[strat] || NAMES[4]} variables`;
            }

            if (s4Panel) s4Panel.style.display = 'block';
            const status = document.getElementById('s4VarsStatus');
            if (status) status.textContent = '';
        }
    }

    closeStrategyVarsEditor() {
        const s4Panel = document.getElementById('strategyVarsPanel');
        const s6Panel = document.getElementById('strategy6VarsPanel');
        if (s4Panel) s4Panel.style.display = 'none';
        if (s6Panel) s6Panel.style.display = 'none';
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

    /**
     * S6 — Super Cautious variables save. Same shape as
     * saveStrategyVars (s4) but writes to sessionData.s6* fields and
     * also stores Min/Max bet + Session target.
     */
    saveStrategy6Vars() {
        const readInt = (id, fallback, min) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const v = parseInt(el.value, 10);
            if (!Number.isFinite(v)) return fallback;
            return Math.max(min, v);
        };
        const lossesNeeded = readInt('s6LossesIn',  this.sessionData.s6LossesToIncrease, 1);
        const lossInc      = readInt('s6LossIncIn', this.sessionData.s6LossIncrement,    0);
        const winsNeeded   = readInt('s6WinsIn',    this.sessionData.s6WinsToDecrease,   1);
        const winDec       = readInt('s6WinDecIn',  this.sessionData.s6WinDecrement,     0);
        const minBet       = readInt('s6MinIn',     this.sessionData.s6MinBet,           1);
        const maxBetRaw    = readInt('s6MaxIn',     this.sessionData.s6MaxBet,           1);
        const maxBet       = Math.max(minBet, maxBetRaw);
        const target       = readInt('s6TargetIn',  this.sessionData.s6SessionTarget,    1);

        this.sessionData.s6LossesToIncrease = lossesNeeded;
        this.sessionData.s6LossIncrement    = lossInc;
        this.sessionData.s6WinsToDecrease   = winsNeeded;
        this.sessionData.s6WinDecrement     = winDec;
        this.sessionData.s6MinBet           = minBet;
        this.sessionData.s6MaxBet           = maxBet;
        this.sessionData.s6SessionTarget    = target;

        // Clamp the live current bet into the new [min,max] window so
        // a save doesn't leave the user betting outside their own cap.
        const cur = this.sessionData.currentBetPerNumber;
        this.sessionData.currentBetPerNumber = Math.max(minBet, Math.min(maxBet, cur));

        const status = document.getElementById('s6VarsStatus');
        if (status) {
            status.textContent = `✓ Saved — +$${lossInc}/${lossesNeeded}L · -$${winDec}/${winsNeeded}W · range $${minBet}–$${maxBet} · target $${target}`;
            setTimeout(() => { if (status) status.textContent = ''; }, 3000);
        }
        console.log(`🪶 Strategy 6 variables updated: +$${lossInc} after ${lossesNeeded} losses, -$${winDec} after ${winsNeeded} wins, range $${minBet}-$${maxBet}, target $${target}`);
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

                    // Same mode: if we just WON and we're still armed
                    // (the win didn't disarm), re-stamp a fresh
                    // pendingBet using the same prediction so the
                    // NEXT spin can also place a bet without waiting
                    // for setPrediction to fire again. In wheel mode
                    // the wheel doesn't necessarily re-fire predictions
                    // on every spin (the pool is static), so without
                    // this self-stamp the user sees one WIN and then
                    // betting silently stops — exactly the symptom in
                    // the user's log (32 WIN at 21:30:43 → every
                    // subsequent 32 logged "waiting, armed=true").
                    // Trigger-gate is active whenever Same OR Wheel mode
                    // is ON. With either flag the bet pool acts as the
                    // wait-for-trigger pool, and a WIN keeps us armed
                    // so the next spin can also bet against the same
                    // pool. When BOTH are OFF, regular every-spin
                    // betting is in effect and no re-stamp is needed
                    // because setPrediction fires per spin.
                    const triggerGateOn = (typeof window !== 'undefined') && (window.sameMode === true || window.wheelMode === true);
                    if (triggerGateOn && hit && this.sessionData.sameArmed && this.sessionData.isBettingEnabled
                        && Array.isArray(this._sameLastPredictedNumbers)
                        && this._sameLastPredictedNumbers.length > 0) {
                        const numbers = this._sameLastPredictedNumbers.slice();
                        const numbersCount = numbers.length;
                        const betAmount = this.calculateBetAmount(numbersCount);
                        if (betAmount > 0) {
                            this.pendingBet = {
                                betAmount: betAmount,
                                numbersCount: numbersCount,
                                predictedNumbers: numbers,
                                placedAtSpinCount: currentCount
                            };
                            console.log(`🔁 Same mode: WIN — re-stamped pendingBet at count=${currentCount} for next spin`);
                        }
                    }
                }
            } else {
                // Trigger gate: active when Same OR Wheel mode is ON.
                // Both use the current bet pool as the trigger pool.
                // Spin in pool → arm for next spin's bet. No bankroll
                // change at the trigger spin itself. When BOTH toggles
                // are OFF the gate doesn't apply and regular every-
                // spin betting takes over via setPrediction.
                const triggerGateOn = (typeof window !== 'undefined') && (window.sameMode === true || window.wheelMode === true);
                // Trigger check uses _sameTriggerPool (the pool that was
                // active WHEN this spin was unknown), NOT _sameLast
                // PredictedNumbers (which was overwritten with the
                // pool for the NEXT spin during setPrediction). Falls
                // back to the current pool only when no previous pool
                // exists yet (very first spin of the session). See
                // setPrediction / updateFromPrediction for the
                // two-slot snapshot rationale.
                // Trigger pool = UNION of the T1-only pools (prev +
                // current snapshot). The bet pool (numbers) stays as the
                // full intersection across T1/T2/T3 — but per user spec
                // ("trigger should only check T1 and wheel options"), the
                // trigger gate fires when the spin lands in ANY selected
                // T1 pair, ignoring T2/T3 membership. Wheel-filter pass
                // below still enforces current set/table/sign freshly.
                // Fallback to the full pool when T1 data isn't present
                // (e.g. wheel-mode-only with no pair selected).
                const t1Prev = Array.isArray(this._sameT1TriggerPoolPrev) ? this._sameT1TriggerPoolPrev : [];
                const t1Curr = Array.isArray(this._sameT1TriggerPool) ? this._sameT1TriggerPool : [];
                const t1Union = Array.from(new Set([...t1Prev, ...t1Curr]));
                const prevPool = Array.isArray(this._sameTriggerPool) ? this._sameTriggerPool : [];
                const currPool = Array.isArray(this._sameLastPredictedNumbers) ? this._sameLastPredictedNumbers : [];
                const triggerPool = t1Union.length > 0
                    ? t1Union
                    : Array.from(new Set([...prevPool, ...currPool]));
                // Wheel-filter check is evaluated FRESH against the
                // wheel's current Table / Sign / Set / Inverse toggles
                // (not the snapshot). This is what enforces "spin must
                // be in the selected sets" even when the snapshot pool
                // was captured before the user adjusted the wheel
                // filters. Without this, an early-session snapshot
                // with all-sets-on can fire the trigger for a number
                // the user has since filtered out.
                let wheelFilterPass = true;
                const wheelOn = (typeof window !== 'undefined' && window.wheelMode === true);
                if (wheelOn && window.rouletteWheel
                    && typeof window.rouletteWheel._passesFilter === 'function') {
                    try {
                        let pass = window.rouletteWheel._passesFilter(actualNumber);
                        const inv = window.rouletteWheel.filters && window.rouletteWheel.filters.inverse;
                        if (inv) pass = !pass;
                        wheelFilterPass = pass;
                    } catch (_) { /* fallback to pool-only check */ }
                }
                if (triggerGateOn && triggerPool.length > 0) {
                    const inPoolRaw = triggerPool.includes(actualNumber);
                    const inPool = inPoolRaw && wheelFilterPass;
                    if (inPool && !this.sessionData.sameArmed) {
                        this.sessionData.sameArmed = true;
                        // Broadcast armed-state change so the wheel's
                        // trigger-status pill can update instantly.
                        try { window.dispatchEvent(new CustomEvent('triggerArmedChanged', { detail: { armed: true } })); } catch (_) {}
                        console.log(`🎯 Trigger gate: ${actualNumber} in pool → armed for next spin (sameMode=${!!window.sameMode}, wheelMode=${!!window.wheelMode})`);
                        // Stamp a pendingBet RIGHT NOW from the last
                        // prediction so the NEXT spin actually places a
                        // bet against the prior pool. Without this, the
                        // next setPrediction stamps at count+1 and the
                        // bet resolves one spin late (or gets overwritten
                        // by the race-guard before resolving at all —
                        // which is what was producing "armed=true but
                        // never bets" in the user log).
                        if (this.sessionData.isBettingEnabled) {
                            const numbers = this._sameLastPredictedNumbers.slice();
                            const numbersCount = numbers.length;
                            const betAmount = this.calculateBetAmount(numbersCount);
                            if (betAmount > 0) {
                                this.pendingBet = {
                                    betAmount: betAmount,
                                    numbersCount: numbersCount,
                                    predictedNumbers: numbers,
                                    placedAtSpinCount: currentCount
                                };
                                console.log(`✅ Same mode: pendingBet stamped at count=${currentCount} (${numbersCount} numbers, $${betAmount}/num) — will resolve on next spin`);
                            }
                        }
                    } else {
                        // Explain the two gates separately so the reason
                        // is clear: pool membership AND wheel filter.
                        const poolPart   = inPoolRaw ? 'in pool' : 'NOT in pool';
                        const filterPart = wheelOn ? (wheelFilterPass ? 'passes wheel filter' : 'fails wheel filter') : 'wheel-filter check off';
                        console.log(`⏸ Trigger gate: waiting (actual ${actualNumber} — ${poolPart}, ${filterPart}, armed=${this.sessionData.sameArmed})`);
                    }
                } else {
                    console.log('⚠️ No pending bet to check');
                }
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
            // Keep _sameLastPredictedNumbers as-is — a stale prediction
            // shouldn't appear and immediately wipe what we use to
            // detect Same triggers.
        } else {
            // Use strategy-based bet amount. For S1–S4 this is just
            // currentBetPerNumber with a bankroll-safety cap. For S5
            // (Logical) it's base × min(N,4)/4 with a session-target
            // cap — calculateBetAmount handles both via dispatch.
            const numbersCount = prediction.numbers ? prediction.numbers.length : 12;
            const betAmount = this.calculateBetAmount(numbersCount);

            this.sessionData.lastBetAmount = betAmount;
            this.sessionData.lastBetNumbers = numbersCount;

            // Trigger pool: remember TWO snapshots so the trigger check
            // can use the pool that was active for the spin currently
            // being evaluated:
            //   _sameLastPredictedNumbers      = the new pool (for the
            //                                    NEXT spin's prediction)
            //   _sameTriggerPool               = the OLD pool, valid
            //                                    for evaluating the
            //                                    spin that just landed
            // Why: setPrediction fires AFTER addSpin → onSpinAdded
            // synchronously, so by the time checkForNewSpin's 200ms
            // interval runs, _sameLastPredictedNumbers has already
            // been overwritten with the prediction for the NEXT spin.
            // Without preserving the previous pool, a trigger check
            // for spin N reads the pool computed using N as prev —
            // which is the wrong pool. This caused user logs where
            // a spin clearly in the displayed pool {15, 24, 11, 28}
            // logged as "actual 15 NOT in pool".
            this._sameTriggerPool = Array.isArray(this._sameLastPredictedNumbers)
                ? this._sameLastPredictedNumbers.slice()
                : [];
            this._sameLastPredictedNumbers = Array.isArray(prediction.numbers) ? [...prediction.numbers] : [];
            // T1-only trigger pool: independent of T2/T3 intersection so
            // the Same-mode gate fires when the spin lands in any selected
            // T1 pair, regardless of whether it also passed T2/T3.
            this._sameT1TriggerPoolPrev = Array.isArray(this._sameT1TriggerPool)
                ? this._sameT1TriggerPool.slice()
                : [];
            this._sameT1TriggerPool = Array.isArray(prediction.t1TriggerPool)
                ? prediction.t1TriggerPool.slice()
                : [];

            console.log(`💡 Using strategy bet: $${betAmount}/number (Strategy ${this.sessionData.bettingStrategy}, N=${numbersCount})`);
            // CRITICAL: Store the prediction we're betting on
            // Same mode gate: only set pendingBet if we're armed.
            // When not armed, leave pendingBet null so checkForNewSpin
            // routes to the trigger-check branch instead of resolving
            // a non-existent bet.
            // Trigger gate: when Same OR Wheel mode is ON, suppress
            // bet placement until the spin listener arms us. The same
            // sameArmed flag tracks both gates (they share the
            // armed/disarmed lifecycle). When BOTH toggles are OFF,
            // regular every-spin betting fires below.
            const triggerGateOn = (typeof window !== 'undefined') && (window.sameMode === true || window.wheelMode === true);
            const gateBlocks = triggerGateOn && !this.sessionData.sameArmed;
            if (this.sessionData.isSessionActive && betAmount > 0 && this.sessionData.isBettingEnabled && !gateBlocks) {
                this.pendingBet = {
                    betAmount: betAmount,
                    numbersCount: numbersCount,
                    predictedNumbers: [...prediction.numbers] // Clone the array
                };
                console.log('📌 Pending bet stored:', this.pendingBet);
            } else if (gateBlocks) {
                this.pendingBet = null;
                console.log(`⏸ Trigger gate: holding bet (sameMode=${!!window.sameMode}, wheelMode=${!!window.wheelMode}, armed=${this.sessionData.sameArmed})`);
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
            this._updateDrawdown();
            
            console.log(`✅ HIT! Number ${actualNumber} - Won $${netChange}`);
            } else {
                // Loss
                netChange = -totalBet;

                this.sessionData.currentBankroll += netChange;
                this.sessionData.sessionProfit += netChange;
                this.sessionData.totalLosses++;
                this.sessionData.consecutiveLosses++;
                this.sessionData.consecutiveWins = 0;  // NEW: Reset consecutive wins
                this._updateDrawdown();
                // Trigger gate: a LOSS disarms (Same OR Wheel mode).
                // Next bet waits for another trigger spin in the pool.
                if (typeof window !== 'undefined' && (window.sameMode === true || window.wheelMode === true)) {
                    this.sessionData.sameArmed = false;
                    try { window.dispatchEvent(new CustomEvent('triggerArmedChanged', { detail: { armed: false } })); } catch (_) {}
                    console.log('⏸ Trigger gate: LOSS → disarmed (wait for next trigger)');
                }

                console.log(`❌ MISS! Number ${actualNumber} - Lost $${Math.abs(netChange)}`);
            }

        // INSTANT DISPLAY: bankroll / profit / win-rate are already
        // updated synchronously above, so paint them NOW — before the
        // async backend round-trip below. Without this the panel only
        // refreshed after `await aiIntegration.processResult`, so the
        // network latency made the money panel look "slow" (the result
        // showed a beat late; undo+re-enter masked it). The final
        // render() at the end still runs after strategy adjustment.
        try { this.render(); } catch (_) {}

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
            //   +$1 after every 3 LOSSES (cumulative, NOT consecutive —
            //     an isolated win does not reset the loss tally).
            //   −$1 after 2 CONSECUTIVE wins (an isolated win does
            //     nothing because consecutiveWins reset to 0 on any
            //     loss above in the shared streak block).
            //   Both adjustments reset s2LossTally so we restart fresh
            //   at the new bet level.
            if (hit) {
                if (this.sessionData.consecutiveWins >= 2) {
                    this.sessionData.currentBetPerNumber = Math.max(2, this.sessionData.currentBetPerNumber - 1);
                    this.sessionData.consecutiveWins = 0;
                    this.sessionData.s2LossTally     = 0;
                    console.log(`🔵 Strategy 2: 2 CONSECUTIVE WINS → Decreased bet to $${this.sessionData.currentBetPerNumber} (loss tally reset)`);
                } else {
                    console.log(`🔵 Strategy 2: ${this.sessionData.consecutiveWins} consecutive win(s) - Need ${2 - this.sessionData.consecutiveWins} more to decrease bet`);
                }
            } else {
                this.sessionData.s2LossTally = (this.sessionData.s2LossTally || 0) + 1;
                if (this.sessionData.s2LossTally >= 3) {
                    this.sessionData.currentBetPerNumber += 1;
                    this.sessionData.s2LossTally = 0;
                    console.log(`🔵 Strategy 2: 3 LOSSES (cumulative) → Increased bet to $${this.sessionData.currentBetPerNumber} (tally reset)`);
                } else {
                    console.log(`🔵 Strategy 2: loss tally ${this.sessionData.s2LossTally}/3 (cumulative — isolated wins do not reset)`);
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
            //   +$lossInc after every <lossesNeeded> CUMULATIVE losses
            //     (single wins do NOT reset the loss tally — matches
            //     the S2 Conservative model). Default threshold: 8.
            //   −$winDec after <winsNeeded> CONSECUTIVE wins (default 1).
            //   Both adjustments reset s4LossTally so we restart fresh
            //   at the new bet level.
            //   Floor remains $2 regardless of decrement size.
            const lossesNeeded = Math.max(1, parseInt(this.sessionData.s4LossesToIncrease, 10) || 8);
            const lossInc      = Math.max(0, parseInt(this.sessionData.s4LossIncrement,    10) || 1);
            const winsNeeded   = Math.max(1, parseInt(this.sessionData.s4WinsToDecrease,   10) || 1);
            const winDec       = Math.max(0, parseInt(this.sessionData.s4WinDecrement,     10) || 1);
            if (hit) {
                if (this.sessionData.consecutiveWins >= winsNeeded) {
                    this.sessionData.currentBetPerNumber = Math.max(2, this.sessionData.currentBetPerNumber - winDec);
                    this.sessionData.consecutiveWins = 0;
                    this.sessionData.s4LossTally     = 0;  // restart loss count at new base
                    console.log(`🛡️ Strategy 4: ${winsNeeded} CONSECUTIVE WINS → Decreased bet by $${winDec} to $${this.sessionData.currentBetPerNumber} (loss tally reset)`);
                } else {
                    console.log(`🛡️ Strategy 4: ${this.sessionData.consecutiveWins} consecutive win(s) - Need ${winsNeeded - this.sessionData.consecutiveWins} more to decrease bet`);
                }
            } else {
                // Cumulative tally — increments on every loss, isolated
                // wins do NOT reset it (only an actual bet-size change does).
                this.sessionData.s4LossTally = (this.sessionData.s4LossTally || 0) + 1;
                if (this.sessionData.s4LossTally >= lossesNeeded) {
                    this.sessionData.currentBetPerNumber += lossInc;
                    this.sessionData.s4LossTally = 0;
                    console.log(`🛡️ Strategy 4: ${lossesNeeded} LOSSES (cumulative) → Increased bet by $${lossInc} to $${this.sessionData.currentBetPerNumber} (tally reset)`);
                } else {
                    console.log(`🛡️ Strategy 4: loss tally ${this.sessionData.s4LossTally}/${lossesNeeded} (cumulative — isolated wins do not reset)`);
                }
            }
        } else if (this.sessionData.bettingStrategy === 5) {
            // ═══ STRATEGY 5: LOGICAL ═══
            // Bet sizing: base × min(N, 4) / 4 (applied at placement
            // time in _s5BetPerNumber). Escalation accumulates
            // FRACTIONALLY:
            //   miss → s5LossUnits += N_managed / 4   (max N_managed=4)
            //   hit  → s5WinUnits  += 1.0             (any hit = full win)
            // Thresholds (s5LossesToIncrease, s5WinsToDecrease default
            // 6 and 1) compare against the accumulator. When the
            // threshold is crossed, base bet shifts by s5LossIncrement
            // or s5WinDecrement and the accumulator resets.
            // Floor: s5MinBet ($2). Cap: max($2, floor(remaining/32))
            // applied at bet placement, not here.
            const lossesNeeded = Math.max(1, parseInt(this.sessionData.s5LossesToIncrease, 10) || 6);
            const lossInc      = Math.max(0, parseInt(this.sessionData.s5LossIncrement,    10) || 1);
            const winsNeeded   = Math.max(1, parseInt(this.sessionData.s5WinsToDecrease,   10) || 1);
            const winDec       = Math.max(0, parseInt(this.sessionData.s5WinDecrement,     10) || 1);
            const minBet       = Math.max(1, parseInt(this.sessionData.s5MinBet,           10) || 2);
            const N_managed    = this._s5ManagedN(numbersCount);
            const ref          = Math.max(1, parseInt(this.sessionData.s5ReferenceN, 10) || 4);
            if (hit) {
                // Any hit = full win-unit; misses-accumulator resets.
                this.sessionData.s5WinUnits  = (this.sessionData.s5WinUnits || 0) + 1.0;
                this.sessionData.s5LossUnits = 0;
                if (this.sessionData.s5WinUnits >= winsNeeded) {
                    this.sessionData.currentBetPerNumber = Math.max(minBet, this.sessionData.currentBetPerNumber - winDec);
                    this.sessionData.s5WinUnits = 0;
                    console.log(`🧠 Strategy 5: HIT (N=${numbersCount}) → ${winsNeeded} win-unit reached → −$${winDec} → base now $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🧠 Strategy 5: HIT (N=${numbersCount}) → win-units=${this.sessionData.s5WinUnits.toFixed(2)} / ${winsNeeded}`);
                }
            } else {
                // Miss adds N_managed/4 to loss accumulator. Win
                // accumulator resets (any miss breaks the streak).
                this.sessionData.s5LossUnits = (this.sessionData.s5LossUnits || 0) + (N_managed / ref);
                this.sessionData.s5WinUnits  = 0;
                if (this.sessionData.s5LossUnits >= lossesNeeded) {
                    this.sessionData.currentBetPerNumber += lossInc;
                    this.sessionData.s5LossUnits = 0;
                    console.log(`🧠 Strategy 5: MISS (N=${numbersCount}, +${(N_managed/ref).toFixed(2)} unit) → ${lossesNeeded} loss-units reached → +$${lossInc} → base now $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🧠 Strategy 5: MISS (N=${numbersCount}, +${(N_managed/ref).toFixed(2)} unit) → loss-units=${this.sessionData.s5LossUnits.toFixed(2)} / ${lossesNeeded}`);
                }
            }
        } else if (this.sessionData.bettingStrategy === 6) {
            // Strategy 6: Super Cautious — Defensive escalation with
            // a HARD max-bet cap. Smart-bet target cap is applied at
            // BET PLACEMENT (see _s6SmartBet in calculateBetAmount),
            // not here — this block only handles the per-result
            // base-bet escalation/de-escalation rules.
            const lossesNeeded = Math.max(1, parseInt(this.sessionData.s6LossesToIncrease, 10) || 3);
            const lossInc      = Math.max(0, parseInt(this.sessionData.s6LossIncrement,    10) || 1);
            const winsNeeded   = Math.max(1, parseInt(this.sessionData.s6WinsToDecrease,   10) || 1);
            const winDec       = Math.max(0, parseInt(this.sessionData.s6WinDecrement,     10) || 1);
            const minBet       = Math.max(1, parseInt(this.sessionData.s6MinBet,           10) || 2);
            const maxBet       = Math.max(minBet, parseInt(this.sessionData.s6MaxBet,      10) || 5);
            if (hit) {
                if (this.sessionData.consecutiveWins >= winsNeeded) {
                    this.sessionData.currentBetPerNumber = Math.max(minBet, this.sessionData.currentBetPerNumber - winDec);
                    this.sessionData.consecutiveWins = 0;
                    console.log(`🪶 Strategy 6: ${winsNeeded} CONSECUTIVE WINS → −$${winDec} → base $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🪶 Strategy 6: ${this.sessionData.consecutiveWins} consecutive win(s) — need ${winsNeeded - this.sessionData.consecutiveWins} more to decrease`);
                }
            } else {
                if (this.sessionData.consecutiveLosses >= lossesNeeded) {
                    // Hard ceiling at s6MaxBet — escalation stops here.
                    this.sessionData.currentBetPerNumber = Math.min(maxBet, this.sessionData.currentBetPerNumber + lossInc);
                    this.sessionData.consecutiveLosses = 0;
                    console.log(`🪶 Strategy 6: ${lossesNeeded} CONSECUTIVE LOSSES → +$${lossInc} (capped at $${maxBet}) → base $${this.sessionData.currentBetPerNumber}`);
                } else {
                    console.log(`🪶 Strategy 6: ${this.sessionData.consecutiveLosses} consecutive loss(es) — need ${lossesNeeded - this.sessionData.consecutiveLosses} more to increase`);
                }
            }
        } else if (this.sessionData.bettingStrategy === 7) {
            // ═══ STRATEGY 7: FLAT BET ═══
            // No auto-adjustment. currentBetPerNumber stays exactly
            // where the user (or 💲 Adjust stake) set it. Logged for
            // visibility only.
            console.log(`➖ Strategy 7 (Flat): ${hit ? 'WIN' : 'LOSS'} → bet/num stays at $${this.sessionData.currentBetPerNumber}`);
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

        // Max Drawdown (for all strategies) — largest peak-to-trough dip
        const ddEl = document.getElementById('maxDrawdownValue');
        if (ddEl) {
            // Defensive: if peak hasn't been initialized (legacy session
            // object), seed it from current bankroll so the first render
            // shows $0 instead of NaN.
            if (typeof this.sessionData.peakBankroll !== 'number') {
                this.sessionData.peakBankroll = this.sessionData.currentBankroll || 0;
            }
            if (typeof this.sessionData.maxDrawdown !== 'number') {
                this.sessionData.maxDrawdown = 0;
            }
            const dd = this.sessionData.maxDrawdown || 0;
            ddEl.textContent = `$${dd.toLocaleString()}`;
            ddEl.className = 'stat-value';
            if (dd >= 200) {
                ddEl.classList.add('danger');
            } else if (dd >= 50) {
                ddEl.classList.add('warning');
            }
        }

        // Session P&L (for all strategies) — current bankroll minus starting bankroll
        const pnlEl = document.getElementById('sessionPnLValue');
        if (pnlEl) {
            const start = parseFloat(this.sessionData.startingBankroll) || 0;
            const cur = parseFloat(this.sessionData.currentBankroll) || 0;
            const pnl = cur - start;
            const sign = pnl >= 0 ? '+' : '-';
            pnlEl.textContent = `${sign}$${Math.abs(pnl).toLocaleString()}`;
            pnlEl.className = 'stat-value';
            if (pnl > 0) {
                pnlEl.classList.add('positive');
                pnlEl.style.color = '#28a745';
            } else if (pnl < 0) {
                pnlEl.classList.add('negative');
                pnlEl.style.color = '#dc3545';
            } else {
                pnlEl.style.color = '';
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

            // Per-number bet + count of numbers covered.
            // betAmount = $ per number; totalBet = betAmount × numbersCount.
            const perNum = (typeof bet.betAmount === 'number') ? bet.betAmount : 0;
            const numsCount = Array.isArray(bet.predictedNumbers)
                ? bet.predictedNumbers.length
                : (perNum > 0 && typeof bet.totalBet === 'number'
                    ? Math.max(1, Math.round(bet.totalBet / perNum))
                    : 0);
            const totalBet = (typeof bet.totalBet === 'number')
                ? bet.totalBet
                : perNum * numsCount;

            div.innerHTML = `
                <span style="color: #6c757d;">#${bet.spin}</span>
                <span style="color: #495057;" title="bet/num × numbers = total">$${perNum} × ${numsCount} = $${totalBet}</span>
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

        // Trigger pool snapshots — same two-slot pattern as in
        // updateFromPrediction (see comment there). Preserving the
        // PREVIOUS pool is what lets the trigger check evaluate the
        // just-arrived spin against the pool that was active when
        // that spin was the "next" one (instead of the new pool
        // computed using it as prev).
        this._sameTriggerPool = Array.isArray(this._sameLastPredictedNumbers)
            ? this._sameLastPredictedNumbers.slice()
            : [];
        this._sameLastPredictedNumbers = Array.isArray(prediction.numbers) ? prediction.numbers.slice() : [];
        // T1-only trigger pool (independent of T2/T3 intersection).
        this._sameT1TriggerPoolPrev = Array.isArray(this._sameT1TriggerPool)
            ? this._sameT1TriggerPool.slice()
            : [];
        this._sameT1TriggerPool = Array.isArray(prediction.t1TriggerPool)
            ? prediction.t1TriggerPool.slice()
            : [];

        // Trigger gate: Same OR Wheel mode active suppresses the
        // pendingBet until checkForNewSpin arms us via a spin in pool.
        // Both toggles share the sameArmed lifecycle. When OFF, the
        // existing normal pendingBet logic runs below.
        const triggerGateOn = (typeof window !== 'undefined') && (window.sameMode === true || window.wheelMode === true);
        if (triggerGateOn && !this.sessionData.sameArmed) {
            this.pendingBet = null;
            this.sessionData.lastBetAmount = betAmount;
            this.sessionData.lastBetNumbers = prediction.numbers.length;
            console.log(`⏸ Trigger gate: holding bet via setPrediction (sameMode=${!!window.sameMode}, wheelMode=${!!window.wheelMode}, armed=${this.sessionData.sameArmed})`);
            this.render();
            return;
        }

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
         * Calculate bet amount based on strategy and bankroll.
         * Strategy 5 (Logical) applies extra rules: N/4 linear scaling
         * + session-target cap.
         * Strategy 6 (Super Cautious) applies hard max-bet cap +
         * smart-bet cap (scale down so a win lands close to target).
         */
        const currentBet = this.sessionData.currentBetPerNumber;

        if (this.sessionData.bettingStrategy === 5) {
            return this._s5BetPerNumber(numberCount);
        }
        if (this.sessionData.bettingStrategy === 6) {
            return this._s6BetPerNumber(numberCount);
        }

        // Strategies 1–4 — original safety check on bankroll.
        const maxBet = Math.floor(this.sessionData.currentBankroll / (numberCount * 2));
        const safeBet = Math.min(currentBet, maxBet);

        return Math.max(1, safeBet); // Minimum $1 per number
    }

    // ═══════════════════════════════════════════════════════
    //  STRATEGY 5 — LOGICAL: helpers
    // ═══════════════════════════════════════════════════════

    /**
     * S5 — cap the base bet at the session-target ceiling.
     *
     *   target_bankroll = starting + s5SessionTarget
     *   remaining        = target_bankroll - current_bankroll
     *   max_base         = max(s5MinBet, floor(remaining / 32))
     *
     * A 4-number win nets 36b − 4b = 32b, so dividing the
     * remaining-to-target by 32 gives the largest base bet whose
     * single win does not overshoot the target. Floor enforces the
     * configured minimum ($2 by default). Cap wins over escalation.
     */
    // Update peak bankroll + max drawdown after each bankroll change.
    // Drawdown = peak − current; tracked as a positive dollar amount.
    _updateDrawdown() {
        const sd = this.sessionData;
        const cur = parseFloat(sd.currentBankroll) || 0;
        if (typeof sd.peakBankroll !== 'number') sd.peakBankroll = cur;
        if (typeof sd.maxDrawdown !== 'number') sd.maxDrawdown = 0;
        if (cur > sd.peakBankroll) sd.peakBankroll = cur;
        const dd = sd.peakBankroll - cur;
        if (dd > sd.maxDrawdown) sd.maxDrawdown = dd;
    }

    _s5CapBaseBet(baseBet) {
        const sd = this.sessionData;
        const target = (sd.startingBankroll || 4000) + (parseInt(sd.s5SessionTarget, 10) || 100);
        const remaining = target - (sd.currentBankroll || 0);
        const minBet = Math.max(1, parseInt(sd.s5MinBet, 10) || 2);
        if (remaining <= 0) {
            // User asked: no auto-pause/stop at target. Just hold the
            // bet at the minimum so escalation can't overshoot further.
            return minBet;
        }
        const fromCap = Math.floor(remaining / 32);
        const capped  = Math.max(minBet, fromCap);
        return Math.min(baseBet, capped);
    }

    /**
     * S5 — bet-per-number scaled linearly to the reference count.
     *   ref = s5ReferenceN (default 4)
     *   N_managed = min(N, ref) — bets with >ref numbers are treated as ref
     *   bet/num = capped_base × N_managed / ref
     */
    _s5BetPerNumber(numberCount) {
        const sd = this.sessionData;
        const ref = Math.max(1, parseInt(sd.s5ReferenceN, 10) || 4);
        const baseBet = this._s5CapBaseBet(parseInt(sd.currentBetPerNumber, 10) || ref);
        const N_managed = Math.max(1, Math.min(parseInt(numberCount, 10) || ref, ref));
        const scaled = baseBet * (N_managed / ref);
        // Round DOWN to integer dollars for clarity. Floor 1 to avoid 0.
        return Math.max(1, Math.floor(scaled));
    }

    /**
     * S5 — N_managed used by the escalation accumulator (always ≤ ref).
     */
    _s5ManagedN(numberCount) {
        const ref = Math.max(1, parseInt(this.sessionData.s5ReferenceN, 10) || 4);
        return Math.max(1, Math.min(parseInt(numberCount, 10) || ref, ref));
    }

    // ═══════════════════════════════════════════════════════
    //  STRATEGY 6 — SUPER CAUTIOUS: helpers
    // ═══════════════════════════════════════════════════════

    /**
     * S6 final bet/number for the current spin. Two caps stacked
     * (lowest wins, then min-clamped):
     *   - Hard cap: s6MaxBet (default $5) — escalation ceiling.
     *   - Smart cap: scale down so a normal win lands at-or-under
     *     the remaining-to-target threshold. The smart floor is
     *     $1 (NOT s6MinBet) because the user explicitly asked
     *     "scale down to hit $100 target not to the floor $2
     *     unless it needed" — i.e., allow sub-min to land target.
     *   - Final floor: max($1, …) so we never bet $0.
     */
    _s6BetPerNumber(numberCount) {
        const sd = this.sessionData;
        const minBet = Math.max(1, parseInt(sd.s6MinBet, 10) || 2);
        const maxBet = Math.max(minBet, parseInt(sd.s6MaxBet, 10) || 5);
        const baseBet = Math.min(parseInt(sd.currentBetPerNumber, 10) || minBet, maxBet);

        const N = Math.max(1, parseInt(numberCount, 10) || 4);
        // Smart-bet cap mirrors set-tracker-r/App.jsx getSmartBet:
        //   maxProfitPerWin = bet × (36 − N)
        //   if maxProfitPerWin > remainingToTarget:
        //       safeBet = floor(remaining / (36 − N))
        // Use the live session target (sessionData.sessionTarget) so
        // user-edited targets flow through. Defaults to $100 if unset.
        const target = parseInt(sd.s6SessionTarget, 10) || parseInt(sd.sessionTarget, 10) || 100;
        const profit = parseFloat(sd.sessionProfit) || 0;
        const remaining = target - profit;
        let smartCap = baseBet;
        if (remaining > 0 && N < 36) {
            const maxProfitIfWin = baseBet * (36 - N);
            if (maxProfitIfWin > remaining) {
                smartCap = Math.max(1, Math.floor(remaining / (36 - N)));
            }
        }
        // Stack: take the lower of base/hard-cap and the smart-cap;
        // final floor is $1 (not minBet) per the user spec, but the
        // base bet itself never drops below minBet via the escalation
        // logic so this only matters when the smart-cap forces a
        // sub-min bet to avoid overshooting.
        const final = Math.max(1, Math.min(baseBet, smartCap));
        return final;
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
