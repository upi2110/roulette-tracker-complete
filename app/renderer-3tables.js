// FINAL CORRECTED 3-TABLE RENDERER
// CRITICAL FIX: Position code calculation handles duplicate 26 in wheel array

const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const WHEEL_NO_ZERO = [26,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const REGULAR_OPPOSITES = {
    0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
    10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
    19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
    28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
};

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
};

let spins = [];
window.spins = spins;      // Expose as window.spins
window.spinData = spins;   // Also expose as window.spinData for AI

// COMPLETELY REWRITTEN - Check if we reach target NUMBER (not index) within 4 steps
function calculatePositionCode(reference, actual) {
    const refNum = reference === 0 ? 26 : reference;
    const actNum = actual === 0 ? 26 : actual;
    
    if (refNum === actNum) return 'S+0';
    
    const refIdx = WHEEL_NO_ZERO.indexOf(refNum);
    const actIdx = WHEEL_NO_ZERO.indexOf(actNum);
    
    // Check SAME side (S)
    const leftDist = calculateWheelDistance(refIdx, actNum, -1);
    const rightDist = calculateWheelDistance(refIdx, actNum, 1);
    
    if (leftDist >= 1 && leftDist <= 4) return `SL+${leftDist}`;
    if (rightDist >= 1 && rightDist <= 4) return `SR+${rightDist}`;
    
    // Check OPPOSITE side (O)
    const opposite = REGULAR_OPPOSITES[reference];
    const oppNum = opposite === 0 ? 26 : opposite;
    
    if (actNum === oppNum) return 'O+0';
    
    const oppIdx = WHEEL_NO_ZERO.indexOf(oppNum);
    
    const leftDistOpp = calculateWheelDistance(oppIdx, actNum, -1);
    const rightDistOpp = calculateWheelDistance(oppIdx, actNum, 1);
    
    if (leftDistOpp >= 1 && leftDistOpp <= 4) return `OL+${leftDistOpp}`;
    if (rightDistOpp >= 1 && rightDistOpp <= 4) return `OR+${rightDistOpp}`;
    
    return 'XX';
}

// FIXED: Search for target NUMBER (not index) within 4 positions
function calculateWheelDistance(fromIdx, targetNumber, direction) {
    let currentIdx = fromIdx;
    let distance = 0;
    let skippedZero = false;
    
    for (let i = 0; i < 10; i++) {  // Max 10 iterations to be safe
        currentIdx = ((currentIdx + direction) % 37 + 37) % 37;
        const currentNum = WHEEL_NO_ZERO[currentIdx];
        
        // Skip first occurrence of 26 without counting
        if (currentNum === 26 && !skippedZero) {
            skippedZero = true;
            // Check if THIS is our target
            if (targetNumber === 26) {
                distance++;
                return distance;
            }
            continue;
        }
        
        distance++;
        
        // Check if we reached target NUMBER
        if (currentNum === targetNumber) {
            return distance;
        }
        
        // Stop after 4 actual positions
        if (distance >= 4) {
            break;
        }
    }
    
    return 999;  // Not within 4 positions
}

function getNumberAtPosition(refNum, posCode) {
    const ref = refNum === 0 ? 26 : refNum;
    const refIdx = (ref === 26) ? 0 : WHEEL_NO_ZERO.indexOf(ref);
    
    if (posCode === 'S+0') return refNum;
    if (posCode === 'XX') return null;
    
    const match = posCode.match(/^(S|O)(L|R)([+-])(\d+)$/);
    if (!match) {
        if (posCode === 'O+0') return REGULAR_OPPOSITES[refNum];
        return null;
    }
    
    const [, side, direction, sign, distStr] = match;
    const distance = parseInt(distStr);
    
    let startIdx;
    if (side === 'S') {
        startIdx = refIdx;
    } else {
        const oppNum = REGULAR_OPPOSITES[refNum];
        const opp = oppNum === 0 ? 26 : oppNum;
        startIdx = (opp === 26) ? 0 : WHEEL_NO_ZERO.indexOf(opp);
    }
    
    let currentIdx = startIdx;
    let stepsRemaining = distance;
    const moveDirection = (sign === '+') ? 
        (direction === 'R' ? 1 : -1) : 
        (direction === 'R' ? -1 : 1);
    
    let skippedZero = false;
    
    while (stepsRemaining > 0) {
        currentIdx = ((currentIdx + moveDirection) % 37 + 37) % 37;
        const currentNum = WHEEL_NO_ZERO[currentIdx];
        
        if (currentNum === 26 && !skippedZero) {
            skippedZero = true;
        } else if (currentNum !== 26 || skippedZero) {
            stepsRemaining--;
        }
    }
    
    const resultNum = WHEEL_NO_ZERO[currentIdx];
    if (resultNum === undefined) return null;
    return resultNum === 26 ? 0 : resultNum;
}

function flipPositionCode(posCode) {
    if (posCode === 'XX' || posCode === 'S+0' || posCode === 'O+0') return posCode;
    return posCode.replace(/([+-])/, match => match === '+' ? '-' : '+');
}

function generateAnchors(refNum, ref13Opp, prevPosCode) {
    const purpleAnchors = [];
    
    if (prevPosCode === 'XX') return { purple: [], green: [] };
    
    const a1 = getNumberAtPosition(refNum, prevPosCode);
    const a2 = getNumberAtPosition(refNum, flipPositionCode(prevPosCode));
    const a3 = getNumberAtPosition(ref13Opp, prevPosCode);
    const a4 = getNumberAtPosition(ref13Opp, flipPositionCode(prevPosCode));
    
    [a1, a2, a3, a4].forEach(a => {
        if (a !== null && !purpleAnchors.includes(a)) purpleAnchors.push(a);
    });
    
    const greenAnchors = purpleAnchors.map(a => REGULAR_OPPOSITES[a]).filter(a => a !== undefined);
    
    return { purple: purpleAnchors, green: greenAnchors };
}

function expandAnchorsToBetNumbers(purpleAnchors, greenAnchors) {
    const betNumbers = new Set();
    
    [...purpleAnchors, ...greenAnchors].forEach(anchor => {
        const anchorNum = anchor === 0 ? 26 : anchor;
        const idx = WHEEL_NO_ZERO.indexOf(anchorNum);
        
        for (let offset = -1; offset <= 1; offset++) {
            const neighborIdx = (idx + offset + 37) % 37;
            let num = WHEEL_NO_ZERO[neighborIdx];
            num = num === 26 ? 0 : num;
            betNumbers.add(num);
        }
    });
    
    return Array.from(betNumbers);
}

function calculateReferences(prev, prevPrev) {
    const refs = { prev, prev_prev: prevPrev };
    
    if (prev === 36) {
        refs.prev_plus_1 = 35;
        refs.prev_plus_2 = 34;
        refs.prev_minus_1 = 35;
        refs.prev_minus_2 = 34;
    } else if (prev === 0) {
        refs.prev_minus_1 = 10;
        refs.prev_minus_2 = 9;
        refs.prev_plus_1 = 1;
        refs.prev_plus_2 = 2;
    } else {
        refs.prev_plus_1 = Math.min(prev + 1, 36);
        refs.prev_plus_2 = Math.min(prev + 2, 36);
        refs.prev_minus_1 = Math.max(prev - 1, 0);
        refs.prev_minus_2 = Math.max(prev - 2, 0);
    }
    
    return refs;
}

function formatPos(code) {
    if (!code) return '';
    let cls = 'pos-xx';
    if (code.startsWith('S')) cls = 'pos-s';
    else if (code.startsWith('O')) cls = 'pos-o';
    return `<span class="${cls}">${code}</span>`;
}

function addSpin() {
    const num = parseInt(document.getElementById('spinNumber').value);
    let dir = document.getElementById('direction').value;
    
    if (isNaN(num) || num < 0 || num > 36) {
        alert('Enter number 0-36');
        return;
    }
    
    if (spins.length > 0) {
        const lastDir = spins[spins.length - 1].direction;
        dir = lastDir === 'C' ? 'AC' : 'C';
        document.getElementById('direction').value = dir;
    }
    
    spins.push({ direction: dir, actual: num });
    render();
    
    document.getElementById('spinNumber').value = '';
    document.getElementById('spinNumber').focus();
}

async function undoLast() {
    if (spins.length === 0) return alert('No spins');
    console.log('🔄 UNDO - Current spins:', spins.length);

    // Check if the spin being removed had a bet placed on it
    const removedSpinIndex = spins.length; // 1-based index of spin being removed
    const mp = window.moneyPanel;
    const spinsWithBets = mp?.sessionData?.spinsWithBets || [];
    const hadBet = spinsWithBets.includes(removedSpinIndex);

    // Remove spin from local array
    const removedSpin = spins.pop();
    console.log('Removed spin:', removedSpin, 'remaining:', spins.length, 'hadBet:', hadBet);

    // ── REVERT MONEY MANAGEMENT ──
    if (mp) {
        if (hadBet && mp.betHistory && mp.betHistory.length > 0) {
            const lastBet = mp.betHistory[0]; // newest is first
            const netChange = lastBet.netChange || 0;

            // Reverse bankroll change
            mp.sessionData.currentBankroll -= netChange;
            mp.sessionData.sessionProfit -= netChange;
            mp.sessionData.totalBets = Math.max(0, mp.sessionData.totalBets - 1);

            if (lastBet.hit) {
                mp.sessionData.totalWins = Math.max(0, mp.sessionData.totalWins - 1);
            } else {
                mp.sessionData.totalLosses = Math.max(0, mp.sessionData.totalLosses - 1);
            }

            // Remove from histories
            mp.betHistory.shift();
            const idx = spinsWithBets.indexOf(removedSpinIndex);
            if (idx > -1) spinsWithBets.splice(idx, 1);

            // ═══ REPLAY remaining bet history to reconstruct strategy state ═══
            // This correctly handles ALL strategies (1, 2, 3) by replaying
            // the win/loss sequence to recalculate consecutive counts & bet amount
            const strategy = mp.sessionData.bettingStrategy;
            let replayConsLosses = 0;
            let replayConsWins = 0;
            let replayBet = 2; // Always start from base

            // betHistory is newest-first, so replay in reverse (oldest first)
            for (let i = mp.betHistory.length - 1; i >= 0; i--) {
                const bet = mp.betHistory[i];
                if (bet.hit) {
                    replayConsLosses = 0;
                    replayConsWins++;
                    // Apply strategy win adjustment
                    if (strategy === 1) {
                        replayBet = Math.max(2, replayBet - 1);
                    } else if (strategy === 2) {
                        if (replayConsWins >= 2) {
                            replayBet = Math.max(2, replayBet - 1);
                            replayConsWins = 0;
                        }
                    } else if (strategy === 3) {
                        if (replayConsWins >= 2) {
                            replayBet = Math.max(2, replayBet - 1);
                            replayConsWins = 0;
                        }
                    }
                } else {
                    replayConsWins = 0;
                    replayConsLosses++;
                    // Apply strategy loss adjustment
                    if (strategy === 1) {
                        replayBet += 1;
                    } else if (strategy === 2) {
                        if (replayConsLosses >= 2) {
                            replayBet += 1;
                            replayConsLosses = 0;
                        }
                    } else if (strategy === 3) {
                        if (replayConsLosses >= 3) {
                            replayBet += 2;
                            replayConsLosses = 0;
                        }
                    }
                }
            }

            mp.sessionData.consecutiveLosses = replayConsLosses;
            mp.sessionData.consecutiveWins = replayConsWins;
            mp.sessionData.currentBetPerNumber = replayBet;

            console.log(`✅ Money reverted: bankroll=$${mp.sessionData.currentBankroll}, strategy=${strategy}, bet=$${replayBet}, consL=${replayConsLosses}, consW=${replayConsWins}`);
        }

        // Clear pending bet (prediction is about to change)
        mp.pendingBet = null;
        mp.lastSpinCount = spins.length;

        // If no bets remain, deactivate session so it restarts cleanly
        if (mp.sessionData.totalBets === 0) {
            mp.sessionData.isSessionActive = false;
            mp.sessionData.consecutiveLosses = 0;
            mp.sessionData.consecutiveWins = 0;
            mp.sessionData.currentBetPerNumber = 2;
            console.log('✅ Session deactivated (no bets remaining)');
        }

        mp.render();
    }

    // ── REVERT BACKEND ENGINE ──
    try {
        const response = await fetch('http://localhost:8000/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await response.json();
        console.log('Backend undo:', result);
    } catch (error) {
        console.warn('⚠️ Backend undo failed:', error.message);
    }

    // ── CLEAR VISUALS ──
    if (window.rouletteWheel) {
        window.rouletteWheel.clearHighlights();
    }

    // Re-render tables — re-triggers predictions if 3+ spins
    render();

    // ── CLEAR STALE UI WHEN < 3 SPINS ──
    if (spins.length < 3) {
        if (window.aiPanel) {
            window.aiPanel.currentPrediction = null;
            window.aiPanel.selectedPairs.clear();
            window.aiPanel.availablePairs = [];
            if (window.aiPanel._predictionDebounce) {
                clearTimeout(window.aiPanel._predictionDebounce);
            }
            window.aiPanel.clearSelections();
            const pairCheckboxes = document.getElementById('pairCheckboxes');
            if (pairCheckboxes) {
                pairCheckboxes.innerHTML = '<div style="color: #64748b; font-style: italic; width: 100%; text-align: center; padding: 20px;">📌 Enter spins to see available pairs</div>';
            }
        }
        const signalIndicator = document.getElementById('signalIndicator');
        if (signalIndicator) {
            signalIndicator.textContent = 'WAITING FOR SELECTION';
            signalIndicator.style.backgroundColor = '#6b7280';
        }
        const numbersDiv = document.querySelector('.prediction-numbers');
        if (numbersDiv) {
            numbersDiv.innerHTML = '<div style="color: #9ca3af; font-style: italic; padding: 20px; text-align: center;">Need at least 3 spins for predictions</div>';
        }
        const reasoningDiv = document.querySelector('.prediction-reasoning');
        if (reasoningDiv) {
            reasoningDiv.innerHTML = `
                <strong style="color: #1e293b;">HOW IT WORKS:</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 22px;">
                    <li>Select 1 or more pairs from Table 3</li>
                    <li>System finds common numbers between selected pairs</li>
                    <li>Numbers already include ±1 wheel neighbors</li>
                    <li>Shows final common numbers to bet</li>
                </ul>
            `;
        }
        window.table3DisplayProjections = {};
    }
}

function resetAll() {
    if (confirm('Reset all?')) {
        spins.length = 0;  // ✅ Clears SAME array, keeps reference intact
        document.getElementById('direction').value = 'C';
        
        // Reset Money Management Panel
        if (window.moneyPanel) {
            // Preserve current strategy selection across reset
            const currentStrategy = window.moneyPanel.sessionData.bettingStrategy || 1;
            window.moneyPanel.sessionData = {
                startingBankroll: 4000,
                currentBankroll: 4000,
                sessionProfit: 0,
                sessionTarget: 100,
                totalBets: 0,
                totalWins: 0,
                totalLosses: 0,
                consecutiveLosses: 0,
                consecutiveWins: 0,
                lastBetAmount: 0,
                lastBetNumbers: 12,
                isSessionActive: false,
                isBettingEnabled: false,
                bettingStrategy: currentStrategy,
                currentBetPerNumber: 2,
                spinsWithBets: []
            };
            window.moneyPanel.betHistory = [];
            window.moneyPanel.pendingBet = null;
            window.moneyPanel.lastSpinCount = 0;

            // Reset betting button to PAUSED state
            const bettingBtn = document.getElementById('toggleBettingBtn');
            if (bettingBtn) {
                bettingBtn.textContent = '▶️ START BETTING';
                bettingBtn.style.backgroundColor = '#28a745';
            }
            const bettingStatus = document.getElementById('bettingStatus');
            if (bettingStatus) {
                bettingStatus.textContent = '⏸️ Betting PAUSED - Click START to begin';
                bettingStatus.style.backgroundColor = '#f8d7da';
                bettingStatus.style.color = '#721c24';
            }

            window.moneyPanel.render();
            console.log(`✅ Money panel reset (strategy ${currentStrategy} preserved)`);
        }
        
        // Reset AI Prediction Panel (clear selections, predictions, display)
        if (window.aiPanel) {
            window.aiPanel.currentPrediction = null;
            window.aiPanel.lastSpinCount = 0;
            window.aiPanel.selectedPairs.clear();
            window.aiPanel.availablePairs = [];
            if (window.aiPanel._predictionDebounce) {
                clearTimeout(window.aiPanel._predictionDebounce);
            }
            window.aiPanel.clearSelections();
            // Reset the pair checkboxes area
            const pairCheckboxes = document.getElementById('pairCheckboxes');
            if (pairCheckboxes) {
                pairCheckboxes.innerHTML = '<div style="color: #64748b; font-style: italic; width: 100%; text-align: center; padding: 20px;">📌 Enter spins to see available pairs</div>';
            }
            // Reset reasoning section
            const reasoningDiv = document.querySelector('.prediction-reasoning');
            if (reasoningDiv) {
                reasoningDiv.innerHTML = `
                    <strong style="color: #1e293b;">HOW IT WORKS:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 22px;">
                        <li>Select 1 or more pairs from Table 3</li>
                        <li>System finds common numbers between selected pairs</li>
                        <li>Numbers already include ±1 wheel neighbors</li>
                        <li>Shows final common numbers to bet</li>
                    </ul>
                `;
            }
            console.log('✅ AI panel reset');
        }
        
        // Clear table3 display projections
        window.table3DisplayProjections = {};

        // Clear Wheel highlights
        if (window.rouletteWheel) {
            window.rouletteWheel.clearHighlights();
            console.log('✅ Wheel reset');
        }
        
        // Reset backend session
        if (typeof aiIntegration !== 'undefined') {
            aiIntegration.resetSession().then(() => {
                console.log('✅ Backend session reset');
            }).catch(err => {
                console.warn('⚠️ Backend reset failed:', err);
            });
        }

        // Reset orchestrator
        if (window.orchestrator) {
            window.orchestrator.lastSpinCount = 0;
            console.log('✅ Orchestrator reset');
        }
        
        render();
        console.log('🔄 Full reset complete');
    }
}

function render() {
    renderTable1();
    renderTable2();
    renderTable3();
    document.getElementById('info').textContent = `Spins: ${spins.length}`;

    // Re-trigger AI predictions after tables update (only if 3+ spins and pairs selected)
    if (window.aiPanel && window.aiPanel.onSpinAdded && spins.length >= 3) {
        window.aiPanel.onSpinAdded();
    }
}

// TABLE 1 - UNCHANGED

function renderTable1() {
    const tbody = document.getElementById('table1Body');
    tbody.innerHTML = '';
    
    const startIdx = Math.max(0, spins.length - 8);
    const visibleSpins = spins.slice(startIdx);
    
    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const row = document.createElement('tr');
        
        if (idx === 0) {
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td><strong>${spin.actual}</strong></td>
                ${Array(98).fill('<td></td>').join('')}
            `;
            tbody.appendChild(row);
            return;
        }
        
        const prev = spins[idx - 1].actual;
        const validCodes = ['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1'];
        
        const html = [];
        html.push(`<td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>`);
        html.push(`<td><strong>${spin.actual}</strong></td>`);
        
        const isValidCode = (code) => validCodes.includes(code);
        
        const getCodeClass = (code, isValid) => {
            if (!isValid || code === 'XX') return 'code-xx';
            if (code.startsWith('S')) return 'code-s';
            if (code.startsWith('O')) return 'code-o';
            return '';
        };
        
        const renderTargetGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false) => {
            const anchorClass = 'anchor-cell' + 
                (addSeparator ? ' pair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = 'code-xx' + (is13Opp ? ' opp13-cell' : '');
                html.push(`<td class="${cellClass}">-</td><td class="${codeClass}">XX</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${codeClass}">XX</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${codeClass}">XX</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            
            targets.forEach((target) => {
                const code = calculatePositionCode(target, spin.actual);
                const isValid = isValidCode(code);
                const displayCode = isValid ? code : 'XX';
                const codeClassBase = getCodeClass(displayCode, isValid);
                
                const numClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = codeClassBase + (is13Opp ? ' opp13-cell' : '');
                
                html.push(`<td class="${numClass}">${target}</td>`);
                html.push(`<td class="${codeClass}">${displayCode}</td>`);
            });
        };
        
        renderTargetGroup(0, 0, false, false);
        renderTargetGroup(19, 19, true, false);
        renderTargetGroup(prev, prev, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prev], DIGIT_13_OPPOSITES[prev], false, true);
        
        const prevPlus1 = Math.min(prev + 1, 36);
        renderTargetGroup(prevPlus1, prevPlus1, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus1], DIGIT_13_OPPOSITES[prevPlus1], false, true);
        
        const prevMinus1 = Math.max(prev - 1, 0);
        renderTargetGroup(prevMinus1, prevMinus1, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus1], DIGIT_13_OPPOSITES[prevMinus1], false, true);
        
        const prevPlus2 = Math.min(prev + 2, 36);
        renderTargetGroup(prevPlus2, prevPlus2, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus2], DIGIT_13_OPPOSITES[prevPlus2], false, true);
        
        const prevMinus2 = Math.max(prev - 2, 0);
        renderTargetGroup(prevMinus2, prevMinus2, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus2], DIGIT_13_OPPOSITES[prevMinus2], false, true);
        
        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });
    
    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        const lastDirection = spins[spins.length - 1].direction;
        const nextDirection = lastDirection === 'C' ? 'AC' : 'C';
        
        const html = [];
        html.push(`<td class="dir-${nextDirection.toLowerCase()}">${nextDirection}</td>`);
        html.push(`<td><strong>NEXT</strong></td>`);
        
        const renderNextGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false) => {
            const anchorClass = 'anchor-cell' + 
                (addSeparator ? ' pair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                html.push(`<td class="${cellClass}">-</td><td class="${cellClass}">-</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${cellClass}">-</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${cellClass}">-</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const cellClass = is13Opp ? 'opp13-cell' : '';
            
            targets.forEach((target) => {
                html.push(`<td class="${cellClass}">${target}</td>`);
                html.push(`<td class="${cellClass}">-</td>`);
            });
        };
        
        renderNextGroup(0, 0, false, false);
        renderNextGroup(19, 19, true, false);
        renderNextGroup(lastSpin, lastSpin, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[lastSpin], DIGIT_13_OPPOSITES[lastSpin], false, true);
        
        const plus1 = Math.min(lastSpin + 1, 36);
        renderNextGroup(plus1, plus1, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[plus1], DIGIT_13_OPPOSITES[plus1], false, true);
        
        const minus1 = Math.max(lastSpin - 1, 0);
        renderNextGroup(minus1, minus1, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[minus1], DIGIT_13_OPPOSITES[minus1], false, true);
        
        const plus2 = Math.min(lastSpin + 2, 36);
        renderNextGroup(plus2, plus2, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[plus2], DIGIT_13_OPPOSITES[plus2], false, true);
        
        const minus2 = Math.max(lastSpin - 2, 0);
        renderNextGroup(minus2, minus2, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[minus2], DIGIT_13_OPPOSITES[minus2], false, true);
        
        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }
}

// TABLE 2 - UNCHANGED

function renderTable2() {
    const tbody = document.getElementById('table2Body');
    tbody.innerHTML = '';
    
    const startIdx = Math.max(0, spins.length - 8);
    const visibleSpins = spins.slice(startIdx);
    
    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const row = document.createElement('tr');
        
        if (idx === 0) {
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td><strong>${spin.actual}</strong></td>
                ${Array(98).fill('<td></td>').join('')}
            `;
            tbody.appendChild(row);
            return;
        }
        
        const prev = spins[idx - 1].actual;
        const validCodes = ['S+0', 'SL+1', 'SR+1', 'SL+2', 'SR+2', 'O+0', 'OL+1', 'OR+1', 'OL+2', 'OR+2'];
        
        const html = [];
        html.push(`<td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>`);
        html.push(`<td><strong>${spin.actual}</strong></td>`);
        
        const isValidCode = (code) => validCodes.includes(code);
        
        const getCodeClass = (code, isValid) => {
            if (!isValid || code === 'XX') return 'code-xx';
            if (code.startsWith('S')) return 'code-s';
            if (code.startsWith('O')) return 'code-o';
            return '';
        };
        
        const renderTargetGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false) => {
            const anchorClass = 'anchor-cell' + 
                (addSeparator ? ' pair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = 'code-xx' + (is13Opp ? ' opp13-cell' : '');
                html.push(`<td class="${cellClass}">-</td><td class="${codeClass}">XX</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${codeClass}">XX</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${codeClass}">XX</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            
            targets.forEach((target) => {
                const code = calculatePositionCode(target, spin.actual);
                const isValid = isValidCode(code);
                const displayCode = isValid ? code : 'XX';
                const codeClassBase = getCodeClass(displayCode, isValid);
                
                const numClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = codeClassBase + (is13Opp ? ' opp13-cell' : '');
                
                html.push(`<td class="${numClass}">${target}</td>`);
                html.push(`<td class="${codeClass}">${displayCode}</td>`);
            });
        };
        
        renderTargetGroup(0, 0, false, false);
        renderTargetGroup(19, 19, true, false);
        renderTargetGroup(prev, prev, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prev], DIGIT_13_OPPOSITES[prev], false, true);
        
        const prevPlus1 = Math.min(prev + 1, 36);
        renderTargetGroup(prevPlus1, prevPlus1, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus1], DIGIT_13_OPPOSITES[prevPlus1], false, true);
        
        const prevMinus1 = Math.max(prev - 1, 0);
        renderTargetGroup(prevMinus1, prevMinus1, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus1], DIGIT_13_OPPOSITES[prevMinus1], false, true);
        
        const prevPlus2 = Math.min(prev + 2, 36);
        renderTargetGroup(prevPlus2, prevPlus2, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus2], DIGIT_13_OPPOSITES[prevPlus2], false, true);
        
        const prevMinus2 = Math.max(prev - 2, 0);
        renderTargetGroup(prevMinus2, prevMinus2, true, false);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus2], DIGIT_13_OPPOSITES[prevMinus2], false, true);
        
        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });
    
    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        const lastDirection = spins[spins.length - 1].direction;
        const nextDirection = lastDirection === 'C' ? 'AC' : 'C';
        
        const html = [];
        html.push(`<td class="dir-${nextDirection.toLowerCase()}">${nextDirection}</td>`);
        html.push(`<td><strong>NEXT</strong></td>`);
        
        const renderNextGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false) => {
            const anchorClass = 'anchor-cell' + 
                (addSeparator ? ' pair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                html.push(`<td class="${cellClass}">-</td><td class="${cellClass}">-</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${cellClass}">-</td>`);
                html.push(`<td class="${cellClass}">-</td><td class="${cellClass}">-</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const cellClass = is13Opp ? 'opp13-cell' : '';
            
            targets.forEach((target) => {
                html.push(`<td class="${cellClass}">${target}</td>`);
                html.push(`<td class="${cellClass}">-</td>`);
            });
        };
        
        renderNextGroup(0, 0, false, false);
        renderNextGroup(19, 19, true, false);
        renderNextGroup(lastSpin, lastSpin, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[lastSpin], DIGIT_13_OPPOSITES[lastSpin], false, true);
        
        const plus1 = Math.min(lastSpin + 1, 36);
        renderNextGroup(plus1, plus1, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[plus1], DIGIT_13_OPPOSITES[plus1], false, true);
        
        const minus1 = Math.max(lastSpin - 1, 0);
        renderNextGroup(minus1, minus1, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[minus1], DIGIT_13_OPPOSITES[minus1], false, true);
        
        const plus2 = Math.min(lastSpin + 2, 36);
        renderNextGroup(plus2, plus2, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[plus2], DIGIT_13_OPPOSITES[plus2], false, true);
        
        const minus2 = Math.max(lastSpin - 2, 0);
        renderNextGroup(minus2, minus2, true, false);
        renderNextGroup(DIGIT_13_OPPOSITES[minus2], DIGIT_13_OPPOSITES[minus2], false, true);
        
        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }
}

// TABLE 3 - FIXED: Position codes + Visual separators
function renderTable3() {
    const tbody = document.getElementById('table3Body');
    tbody.innerHTML = '';
    
    const startIdx = Math.max(0, spins.length - 8);
    const visibleSpins = spins.slice(startIdx);
    
    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const prev = idx > 0 ? spins[idx - 1].actual : null;
        const prevPrev = idx > 1 ? spins[idx - 2].actual : null;
        
        const row = document.createElement('tr');
        
        if (prev === null) {
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td><strong>${spin.actual}</strong></td>
                ${Array(30).fill('<td></td>').join('')}
            `;
        } else {
            const refs = calculateReferences(prev, prevPrev || prev);
            
            const data = {};
            ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'].forEach(refKey => {
                const refNum = refs[refKey];
                const ref13Opp = DIGIT_13_OPPOSITES[refNum];
                
                data[refKey] = {
                    ref: refNum,
                    ref13Opp: ref13Opp,
                    pair: calculatePositionCode(refNum, spin.actual),
                    pair13Opp: calculatePositionCode(ref13Opp, spin.actual)
                };
            });
            
            const projections = {};
            
            if (idx > 1) {
                const prevSpin = spins[idx - 1];
                const prevPrevSpin = spins[idx - 2].actual;
                const prevRefs = calculateReferences(prevPrevSpin, idx > 2 ? spins[idx - 3].actual : prevPrevSpin);
                
                ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'].forEach(refKey => {
                    const prevRefNum = prevRefs[refKey];
                    const prevRef13Opp = DIGIT_13_OPPOSITES[prevRefNum];
                    
                    const prevPair = calculatePositionCode(prevRefNum, prevSpin.actual);
                    const prevPair13 = calculatePositionCode(prevRef13Opp, prevSpin.actual);
                    const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;
                    
                    const { purple, green } = generateAnchors(refs[refKey], DIGIT_13_OPPOSITES[refs[refKey]], usePosCode);
                    const betNumbers = expandAnchorsToBetNumbers(purple, green);
                    const isHit = betNumbers.includes(spin.actual);
                    
                    projections[refKey] = { purple, green, betNumbers, isHit };
                });
            }
            
            const projClass = (key) => {
                if (!projections[key]) return 'col-prj';
                return projections[key].isHit ? 'col-prj-hit' : 'col-prj-miss';
            };
            
            const cellClass = (key, field, pairStart = false) => {
                const baseClass = data[key] && data[key][field] !== 'XX' ? 'cell-has-position' : '';
                const separator = pairStart ? ' pair-separator' : '';
                return baseClass + separator;
            };
            
            const projHtml = (key) => {
                if (!projections[key]) return '';
                const p = projections[key];
                const purpleHtml = p.purple.map(a => `<span class="anchor-purple">${a}</span>`).join(' ');
                const greenHtml = p.green.map(a => `<span class="anchor-green">${a}</span>`).join(' ');
                return `<div>${purpleHtml}</div>${p.green.length > 0 ? '<div>' + greenHtml + '</div>' : ''}`;
            };
            
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td><strong>${spin.actual}</strong></td>
                <td class="${cellClass('prev', 'pair', true)}">${data.prev.ref}</td>
                <td class="${cellClass('prev', 'pair')}">${formatPos(data.prev.pair)}</td>
                <td class="${cellClass('prev', 'pair13Opp')}">${data.prev.ref13Opp}</td>
                <td class="${cellClass('prev', 'pair13Opp')}">${formatPos(data.prev.pair13Opp)}</td>
                <td class="${projClass('prev')}">${projHtml('prev')}</td>
                <td class="${cellClass('prev_plus_1', 'pair', true)}">${data.prev_plus_1.ref}</td>
                <td class="${cellClass('prev_plus_1', 'pair')}">${formatPos(data.prev_plus_1.pair)}</td>
                <td class="${cellClass('prev_plus_1', 'pair13Opp')}">${data.prev_plus_1.ref13Opp}</td>
                <td class="${cellClass('prev_plus_1', 'pair13Opp')}">${formatPos(data.prev_plus_1.pair13Opp)}</td>
                <td class="${projClass('prev_plus_1')}">${projHtml('prev_plus_1')}</td>
                <td class="${cellClass('prev_minus_1', 'pair', true)}">${data.prev_minus_1.ref}</td>
                <td class="${cellClass('prev_minus_1', 'pair')}">${formatPos(data.prev_minus_1.pair)}</td>
                <td class="${cellClass('prev_minus_1', 'pair13Opp')}">${data.prev_minus_1.ref13Opp}</td>
                <td class="${cellClass('prev_minus_1', 'pair13Opp')}">${formatPos(data.prev_minus_1.pair13Opp)}</td>
                <td class="${projClass('prev_minus_1')}">${projHtml('prev_minus_1')}</td>
                <td class="${cellClass('prev_plus_2', 'pair', true)}">${data.prev_plus_2.ref}</td>
                <td class="${cellClass('prev_plus_2', 'pair')}">${formatPos(data.prev_plus_2.pair)}</td>
                <td class="${cellClass('prev_plus_2', 'pair13Opp')}">${data.prev_plus_2.ref13Opp}</td>
                <td class="${cellClass('prev_plus_2', 'pair13Opp')}">${formatPos(data.prev_plus_2.pair13Opp)}</td>
                <td class="${projClass('prev_plus_2')}">${projHtml('prev_plus_2')}</td>
                <td class="${cellClass('prev_minus_2', 'pair', true)}">${data.prev_minus_2.ref}</td>
                <td class="${cellClass('prev_minus_2', 'pair')}">${formatPos(data.prev_minus_2.pair)}</td>
                <td class="${cellClass('prev_minus_2', 'pair13Opp')}">${data.prev_minus_2.ref13Opp}</td>
                <td class="${cellClass('prev_minus_2', 'pair13Opp')}">${formatPos(data.prev_minus_2.pair13Opp)}</td>
                <td class="${projClass('prev_minus_2')}">${projHtml('prev_minus_2')}</td>
                <td class="${cellClass('prev_prev', 'pair', true)}">${data.prev_prev.ref}</td>
                <td class="${cellClass('prev_prev', 'pair')}">${formatPos(data.prev_prev.pair)}</td>
                <td class="${cellClass('prev_prev', 'pair13Opp')}">${data.prev_prev.ref13Opp}</td>
                <td class="${cellClass('prev_prev', 'pair13Opp')}">${formatPos(data.prev_prev.pair13Opp)}</td>
                <td class="${projClass('prev_prev')}">${projHtml('prev_prev')}</td>
            `;
        }
        
        tbody.appendChild(row);
    });
    
    if (spins.length >= 2) {
        const lastSpin = spins[spins.length - 1].actual;
        const lastLastSpin = spins[spins.length - 2].actual;
        
        const refs = calculateReferences(lastSpin, lastLastSpin);
        const lastDirection = spins[spins.length - 1].direction;
        const nextDirection = lastDirection === 'C' ? 'AC' : 'C';
        
        const data = {};
        ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'].forEach(refKey => {
            const refNum = refs[refKey];
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];
            data[refKey] = { ref: refNum, ref13Opp: ref13Opp };
        });
        
        const prevSpin = spins[spins.length - 1];
        const prevPrevSpin = spins[spins.length - 2].actual;
        const prevRefs = calculateReferences(prevPrevSpin, spins.length > 2 ? spins[spins.length - 3].actual : prevPrevSpin);
        
        const nextProjections = {};
        ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'].forEach(refKey => {
            const prevRefNum = prevRefs[refKey];
            const prevRef13Opp = DIGIT_13_OPPOSITES[prevRefNum];
            
            const prevPair = calculatePositionCode(prevRefNum, prevSpin.actual);
            const prevPair13 = calculatePositionCode(prevRef13Opp, prevSpin.actual);
            const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;
            
            const { purple, green } = generateAnchors(refs[refKey], DIGIT_13_OPPOSITES[refs[refKey]], usePosCode);
            nextProjections[refKey] = { purple, green };
        });
        
        // Store for backend to use
        window.table3DisplayProjections = nextProjections;
        
        const nextProjHtml = (key) => {
            if (!nextProjections[key]) return '';
            const p = nextProjections[key];
            const purpleHtml = p.purple.map(a => `<span class="anchor-purple">${a}</span>`).join(' ');
            const greenHtml = p.green.map(a => `<span class="anchor-green">${a}</span>`).join(' ');
            return `<div>${purpleHtml}</div>${p.green.length > 0 ? '<div>' + greenHtml + '</div>' : ''}`;
        };
        
        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = `
            <td class="dir-${nextDirection.toLowerCase()}">${nextDirection}</td>
            <td><strong>NEXT</strong></td>
            <td class="pair-separator">${data.prev.ref}</td>
            <td>-</td>
            <td>${data.prev.ref13Opp}</td>
            <td>-</td>
            <td class="col-prj">${nextProjHtml('prev')}</td>
            <td class="pair-separator">${data.prev_plus_1.ref}</td>
            <td>-</td>
            <td>${data.prev_plus_1.ref13Opp}</td>
            <td>-</td>
            <td class="col-prj">${nextProjHtml('prev_plus_1')}</td>
            <td class="pair-separator">${data.prev_minus_1.ref}</td>
            <td>-</td>
            <td>${data.prev_minus_1.ref13Opp}</td>
            <td>-</td>
            <td class="col-prj">${nextProjHtml('prev_minus_1')}</td>
            <td class="pair-separator">${data.prev_plus_2.ref}</td>
            <td>-</td>
            <td>${data.prev_plus_2.ref13Opp}</td>
            <td>-</td>
            <td class="col-prj">${nextProjHtml('prev_plus_2')}</td>
            <td class="pair-separator">${data.prev_minus_2.ref}</td>
            <td>-</td>
            <td>${data.prev_minus_2.ref13Opp}</td>
            <td>-</td>
            <td class="col-prj">${nextProjHtml('prev_minus_2')}</td>
            <td class="pair-separator">${data.prev_prev.ref}</td>
            <td>-</td>
            <td>${data.prev_prev.ref13Opp}</td>
            <td>-</td>
            <td class="col-prj">${nextProjHtml('prev_prev')}</td>
        `;
        
        tbody.appendChild(nextRow);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('spinNumber').addEventListener('keypress', e => {
        if (e.key === 'Enter') addSpin();
    });
    
    document.getElementById('addBtn').addEventListener('click', addSpin);
    document.getElementById('undoBtn').addEventListener('click', undoLast);
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    
    render();
});

// COMPLETE FIX FOR DATA EXPORT
// Replace EVERYTHING after "// ============================================" 
// in renderer-3tables.js with this:

// ============================================
// AI DATA EXPORT MODULE - FIXED
// ============================================

window.getAIData = function() {
    if (spins.length < 3) {
        return null;
    }
    
    // Get recent spins (last 10 for color trend analysis)
    const recentSpins = spins.slice(-10).map(s => s.number);
    
    const data = {
        table1Hits: analyzeTable1Hits(),
        table2Hits: analyzeTable2Hits(),
        table3Hits: analyzeTable3Hits(),
        currentSpinCount: spins.length,
        recentSpins: recentSpins
    };
    
    return data;
};

// TABLE 1 & 2: Use lookup table
function analyzeTable1Hits() {
    const hits = {
        'ref0': [], 'ref19': [], 'prev': [], 'prev13opp': [],
        'prevPlus1': [], 'prevPlus1_13opp': [],
        'prevMinus1': [], 'prevMinus1_13opp': [],
        'prevPlus2': [], 'prevPlus2_13opp': [],
        'prevMinus2': [], 'prevMinus2_13opp': []
    };
    
    for (let i = 1; i < spins.length; i++) {
        const actual = spins[i].actual;
        const prev = spins[i-1].actual;
        
        checkRefHit(hits, 'ref0', i, actual, 0);
        checkRefHit(hits, 'ref19', i, actual, 19);
        checkRefHit(hits, 'prev', i, actual, prev);
        checkRefHit(hits, 'prev13opp', i, actual, DIGIT_13_OPPOSITES[prev]);
        
        const prevPlus1 = Math.min(prev + 1, 36);
        checkRefHit(hits, 'prevPlus1', i, actual, prevPlus1);
        checkRefHit(hits, 'prevPlus1_13opp', i, actual, DIGIT_13_OPPOSITES[prevPlus1]);
        
        const prevMinus1 = Math.max(prev - 1, 0);
        checkRefHit(hits, 'prevMinus1', i, actual, prevMinus1);
        checkRefHit(hits, 'prevMinus1_13opp', i, actual, DIGIT_13_OPPOSITES[prevMinus1]);
        
        const prevPlus2 = Math.min(prev + 2, 36);
        checkRefHit(hits, 'prevPlus2', i, actual, prevPlus2);
        checkRefHit(hits, 'prevPlus2_13opp', i, actual, DIGIT_13_OPPOSITES[prevPlus2]);
        
        const prevMinus2 = Math.max(prev - 2, 0);
        checkRefHit(hits, 'prevMinus2', i, actual, prevMinus2);
        checkRefHit(hits, 'prevMinus2_13opp', i, actual, DIGIT_13_OPPOSITES[prevMinus2]);
    }
    
    return hits;
}

function checkRefHit(hits, refName, spinIdx, actual, refNum) {
    const posCode = calculatePositionCode(refNum, actual);
    
    if (posCode === 'XX') return;
    
    // Only process codes that map to lookup columns
    // S codes (±1, ±2) and O codes (±1, ±2) and exact matches
    const column = getColumnFromCode(posCode);
    if (!column) return;
    
    const lookupRow = getLookupRow(refNum);
    if (!lookupRow) return;
    
    const projectionNum = lookupRow[column];
    
    // Green hit
    if (projectionNum === actual) {
        hits[refName].push({
            spinIdx: spinIdx,
            actual: actual,
            hitNumbers: [projectionNum],
            hitType: 'green',
            posCode: posCode
        });
        return;
    }
    
    // Blue hit (13-opposite)
    const opp13 = DIGIT_13_OPPOSITES[projectionNum];
    if (opp13 === actual) {
        hits[refName].push({
            spinIdx: spinIdx,
            actual: actual,
            hitNumbers: [projectionNum],
            hitType: 'blue',
            posCode: posCode
        });
    }
}

// Helper: Map position code to column (only for codes that use lookup table)
function getColumnFromCode(posCode) {
    // S+0 = exact match
    if (posCode === 'S+0') return 'first';
    
    // All SL/SR codes (±1, ±2) = FIRST column
    if (posCode.startsWith('SL') || posCode.startsWith('SR')) {
        const dist = parseInt(posCode.match(/[+-]\d+/)[0]);
        if (Math.abs(dist) <= 2) return 'first';
    }
    
    // All OL/OR codes (±1, ±2) = SECOND column  
    if (posCode.startsWith('OL') || posCode.startsWith('OR')) {
        const dist = parseInt(posCode.match(/[+-]\d+/)[0]);
        if (Math.abs(dist) <= 2) return 'second';
    }
    
    // O+0 = exact opposite = THIRD column
    if (posCode === 'O+0') return 'third';
    
    return null; // Codes beyond ±2 don't use lookup table
}

function analyzeTable2Hits() {
    // Same as Table 1 - uses same lookup logic
    return analyzeTable1Hits();
}

// TABLE 3: Uses generateAnchors, NOT lookup table
function analyzeTable3Hits() {
    const hits = {
        'prev': [], 'prev13opp': [],
        'prevPlus1': [], 'prevPlus1_13opp': [],
        'prevMinus1': [], 'prevMinus1_13opp': [],
        'prevPlus2': [], 'prevPlus2_13opp': [],
        'prevMinus2': [], 'prevMinus2_13opp': [],
        'prevPrev': [], 'prevPrev13opp': []
    };
    
    for (let i = 2; i < spins.length; i++) {
        const actual = spins[i].actual;
        const prev = spins[i-1].actual;
        const prevPrev = spins[i-2].actual;
        
        const refs = calculateReferences(prev, prevPrev);
        
        // Check each projection type
        checkTable3Hit(hits, 'prev', i, actual, refs.prev, DIGIT_13_OPPOSITES[refs.prev], i-1);
        checkTable3Hit(hits, 'prevPlus1', i, actual, refs.prev_plus_1, DIGIT_13_OPPOSITES[refs.prev_plus_1], i-1);
        checkTable3Hit(hits, 'prevMinus1', i, actual, refs.prev_minus_1, DIGIT_13_OPPOSITES[refs.prev_minus_1], i-1);
        checkTable3Hit(hits, 'prevPlus2', i, actual, refs.prev_plus_2, DIGIT_13_OPPOSITES[refs.prev_plus_2], i-1);
        checkTable3Hit(hits, 'prevMinus2', i, actual, refs.prev_minus_2, DIGIT_13_OPPOSITES[refs.prev_minus_2], i-1);
        checkTable3Hit(hits, 'prevPrev', i, actual, refs.prev_prev, DIGIT_13_OPPOSITES[refs.prev_prev], i-1);
    }
    
    return hits;
}

function checkTable3Hit(hits, projType, spinIdx, actual, anchorRef, anchor13Opp, prevSpinIdx) {
    // FIXED: Calculate position code for CURRENT spin (where ball actually landed)
    // NOT the previous spin!
    // This makes the export data match what's displayed in the table.
    
    // Calculate position code for CURRENT actual number
    const currentPosCode = calculatePositionCode(anchorRef, actual);
    const currentPosCode13 = calculatePositionCode(anchor13Opp, actual);
    
    const usePosCode = currentPosCode !== 'XX' ? currentPosCode : currentPosCode13;
    
    if (usePosCode === 'XX') return;
    
    // Generate anchors using YOUR methodology
    const { purple, green } = generateAnchors(anchorRef, anchor13Opp, usePosCode);
    const betNumbers = expandAnchorsToBetNumbers(purple, green);
    
    // Check if actual hit
    if (betNumbers.includes(actual)) {
        const hitType = purple.includes(actual) ? 'green' : 'blue';
        
        hits[projType].push({
            spinIdx: spinIdx,
            actual: actual,
            anchorRef: anchorRef,
            projection: anchorRef,
            hitType: hitType,
            posCode: usePosCode,  // Now CORRECT - matches table display
            betNumbers: betNumbers
        });
    }
}

console.log('✅ AI Data Export Module loaded (FIXED)');/**
 * Get NEXT Row Projections - NEW STRATEGY
 * ========================================
 * 
 * This function gets the projections for the NEXT spin from Table 3
 * These are the numbers in the WHITE BOXES of the NEXT row
 * 
 * This is DIFFERENT from historical hits - these are FUTURE projections!
 */

/**
 * Get projections for NEXT spin from Table 3
 * @returns {Object} Projections for each pair type
 */
function getNextRowProjections() {
    // Use projections from renderTable3 - same as displayed in table
    if (!window.table3DisplayProjections) {
        console.log('⚠️ Table 3 not rendered yet');
        return {};
    }
    
    if (spins.length < 2) {
        console.log('⚠️ Need at least 2 spins for NEXT projections');
        return {};
    }
    
    console.log(`\n🎯 USING TABLE DISPLAY PROJECTIONS:`);
    
    const projections = {};
    
    // Map frontend keys to backend keys
    const keyMap = {
        'prev': 'prev',
        'prev_plus_1': 'prevPlus1',
        'prev_minus_1': 'prevMinus1',
        'prev_plus_2': 'prevPlus2',
        'prev_minus_2': 'prevMinus2',
        'prev_prev': 'prevPrev'
    };
    
    // Use stored projections from table display
    Object.keys(keyMap).forEach(frontendKey => {
        const backendKey = keyMap[frontendKey];
        const displayProj = window.table3DisplayProjections[frontendKey];
        
        if (!displayProj || !displayProj.purple) {
            return;
        }
        
        const purple = displayProj.purple || [];
        const green = displayProj.green || [];
        
        console.log(`   ${backendKey}: purple=${JSON.stringify(purple)}, green=${JSON.stringify(green)}`);
        
        // Expand to include wheel neighbors
        const betNumbers = expandAnchorsToBetNumbers(purple, green);
        
        projections[backendKey] = {
            anchors: purple,         // From table display
            neighbors: green,        // From table display
            numbers: betNumbers      // Expanded
        };
        
        console.log(`   ✅ ${backendKey}: purple=${purple.length}, green=${green.length}, total=${betNumbers.length}`);
    });
    
    console.log(`\n📊 Using table display projections for ${Object.keys(projections).length} pairs`);
    
    return projections;
}

/**
 * Updated getAIData to include NEXT projections
 * This is what gets sent to the backend
 */
window.getAIDataV6 = function() {
    if (spins.length < 3) {
        console.log('⚠️ Need at least 3 spins for V6 predictions');
        return null;
    }
    
    console.log('\n🔄 Preparing data for AI Engine V6...');
    
    // Get historical hits (for pattern validation)
    const table3Hits = analyzeTable3Hits();
    const table1Hits = analyzeTable1Hits();
    const table2Hits = analyzeTable2Hits();
    
    // Get NEXT row projections (for actual betting) ← NEW!
    const table3NextProjections = getNextRowProjections();
    
    const data = {
        table3Hits: table3Hits,               // Historical hits
        table3NextProjections: table3NextProjections,  // NEXT row projections ← NEW!
        table1Hits: table1Hits,
        table2Hits: table2Hits,
        currentSpinCount: spins.length,
        recentSpins: spins.slice(-10).map(s => s.actual)
    };
    
    console.log('✅ Data prepared for V6:');
    console.log(`   - Table 3 historical hits: ${Object.keys(table3Hits).length} types`);
    console.log(`   - Table 3 NEXT projections: ${Object.keys(table3NextProjections).length} types`);
    console.log(`   - Current spin count: ${data.currentSpinCount}`);
    
    return data;
};

/**
 * Helper: Log projection details for debugging
 */
function logNextProjections() {
    const projections = getNextRowProjections();
    
    console.log('\n📋 NEXT ROW PROJECTIONS DETAILS:');
    console.log('='.repeat(80));
    
    Object.entries(projections).forEach(([projType, data]) => {
        console.log(`\n${projType.toUpperCase()}:`);
        console.log(`  Anchor: ${data.anchor}`);
        console.log(`  Position Code: ${data.posCode}`);
        console.log(`  Total Numbers: ${data.numbers.length}`);
        console.log(`  Numbers: ${data.numbers.sort((a,b) => a-b).join(', ')}`);
        console.log(`  Anchors (⭐): ${data.anchors.join(', ')}`);
        console.log(`  Neighbors (💗): ${data.neighbors.join(', ')}`);
    });
    
    console.log('\n' + '='.repeat(80));
}

console.log('✅ NEXT Row Projections Module loaded (V6)');
