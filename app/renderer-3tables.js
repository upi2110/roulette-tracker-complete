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

function undoLast() {
    if (spins.length === 0) return alert('No spins');
    spins.pop();
    render();
}

function resetAll() {
    if (confirm('Reset all?')) {
        spins = [];
        document.getElementById('direction').value = 'C';
        
        // Reset Money Management Panel
        if (window.moneyPanel) {
            window.moneyPanel.sessionData = {
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
            window.moneyPanel.betHistory = [];
            window.moneyPanel.pendingBet = null;
            window.moneyPanel.lastSpinCount = 0;
            window.moneyPanel.render();
            console.log('✅ Money panel reset');
        }
        
        // Reset AI Prediction Panel
        if (window.aiPanel) {
            window.aiPanel.currentPrediction = null;
            window.aiPanel.lastSpinCount = 0;
            window.aiPanel.render();
            console.log('✅ AI panel reset');
        }
        
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
        
        render();
        console.log('🔄 Full reset complete');
    }
}

function render() {
    renderTable1();
    renderTable2();
    renderTable3();
    document.getElementById('info').textContent = `Spins: ${spins.length}`;
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