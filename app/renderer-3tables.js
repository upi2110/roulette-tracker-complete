// FINAL CORRECTED 3-TABLE RENDERER
// Table1 & Table2: Target + Position Code format (like Excel)
// Table3: Working code from renderer-new.js

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

// CORRECTED calculatePositionCode - handles 0/26 skip properly
// Replace the existing calculatePositionCode function with this

function calculatePositionCode(reference, actual) {
    if (reference === actual) return 'S+0';
    
    const refNum = reference === 0 ? 26 : reference;
    const actNum = actual === 0 ? 26 : actual;
    
    const refIdx = WHEEL_NO_ZERO.indexOf(refNum);
    const actIdx = WHEEL_NO_ZERO.indexOf(actNum);
    
    // Calculate wheel distance accounting for 0/26 skip
    const leftDist = calculateWheelDistance(refIdx, actIdx, -1);  // Going left
    const rightDist = calculateWheelDistance(refIdx, actIdx, 1);   // Going right
    
    if (leftDist >= 1 && leftDist <= 4) return `SL+${leftDist}`;
    if (rightDist >= 1 && rightDist <= 4) return `SR+${rightDist}`;
    
    const opposite = REGULAR_OPPOSITES[reference];
    if (actual === opposite) return 'O+0';
    
    const oppNum = opposite === 0 ? 26 : opposite;
    const oppIdx = WHEEL_NO_ZERO.indexOf(oppNum);
    
    const leftDistOpp = calculateWheelDistance(oppIdx, actIdx, -1);
    const rightDistOpp = calculateWheelDistance(oppIdx, actIdx, 1);
    
    if (leftDistOpp >= 1 && leftDistOpp <= 4) return `OL+${leftDistOpp}`;
    if (rightDistOpp >= 1 && rightDistOpp <= 4) return `OR+${rightDistOpp}`;
    
    return 'XX';
}

// Helper function to calculate distance on wheel with 0/26 skip
function calculateWheelDistance(fromIdx, toIdx, direction) {
    let currentIdx = fromIdx;
    let distance = 0;
    let skippedZero = false;
    
    // Move up to 4 positions in the given direction
    for (let i = 0; i < 5; i++) {  // Check up to 5 positions
        currentIdx = ((currentIdx + direction) % 37 + 37) % 37;
        const currentNum = WHEEL_NO_ZERO[currentIdx];
        
        // Skip 0/26 once without counting
        if (currentNum === 26 && !skippedZero) {
            skippedZero = true;
            continue;  // Don't count this position
        }
        
        distance++;
        
        // Check if we reached the target
        if (currentIdx === toIdx) {
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
        render();
    }
}

function render() {
    renderTable1();
    renderTable2();
    renderTable3();
    document.getElementById('info').textContent = `Spins: ${spins.length}`;
}

// CORRECTED TABLE 1 & 2 - With proper pair separators
// Black border ONLY between: 0|19, 19|P, P-13OPP|P+1, P+1-13OPP|P-1, P-1-13OPP|P+2, P+2-13OPP|P-2

// TABLE 1: ±1 codes only
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
        
        // Render with pair separator flag
        const renderTargetGroup = (anchorNum, refNum, addSeparator = false) => {
            const anchorClass = addSeparator ? 'anchor-cell pair-separator' : 'anchor-cell';
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                html.push(`<td>-</td><td class="code-xx">XX</td>`);
                html.push(`<td>-</td><td class="code-xx">XX</td>`);
                html.push(`<td>-</td><td class="code-xx">XX</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            
            targets.forEach((target) => {
                const code = calculatePositionCode(target, spin.actual);
                const isValid = isValidCode(code);
                const displayCode = isValid ? code : 'XX';
                const codeClass = getCodeClass(displayCode, isValid);
                
                html.push(`<td>${target}</td>`);
                html.push(`<td class="${codeClass}">${displayCode}</td>`);
            });
        };
        
        // 0 (no separator - it's first)
        renderTargetGroup(0, 0, false);
        
        // 19 (SEPARATOR before 19)
        renderTargetGroup(19, 19, true);
        
        // P (SEPARATOR before P)
        renderTargetGroup(prev, prev, true);
        // P-13OPP (no separator - same pair as P)
        renderTargetGroup(DIGIT_13_OPPOSITES[prev], DIGIT_13_OPPOSITES[prev], false);
        
        // P+1 (SEPARATOR before P+1)
        const prevPlus1 = Math.min(prev + 1, 36);
        renderTargetGroup(prevPlus1, prevPlus1, true);
        // P+1-13OPP
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus1], DIGIT_13_OPPOSITES[prevPlus1], false);
        
        // P-1 (SEPARATOR before P-1)
        const prevMinus1 = Math.max(prev - 1, 0);
        renderTargetGroup(prevMinus1, prevMinus1, true);
        // P-1-13OPP
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus1], DIGIT_13_OPPOSITES[prevMinus1], false);
        
        // P+2 (SEPARATOR before P+2)
        const prevPlus2 = Math.min(prev + 2, 36);
        renderTargetGroup(prevPlus2, prevPlus2, true);
        // P+2-13OPP
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus2], DIGIT_13_OPPOSITES[prevPlus2], false);
        
        // P-2 (SEPARATOR before P-2)
        const prevMinus2 = Math.max(prev - 2, 0);
        renderTargetGroup(prevMinus2, prevMinus2, true);
        // P-2-13OPP
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus2], DIGIT_13_OPPOSITES[prevMinus2], false);
        
        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });
    
    // NEXT ROW
    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        const lastDirection = spins[spins.length - 1].direction;
        const nextDirection = lastDirection === 'C' ? 'AC' : 'C';
        
        const html = [];
        html.push(`<td class="dir-${nextDirection.toLowerCase()}">${nextDirection}</td>`);
        html.push(`<td><strong>NEXT</strong></td>`);
        
        const renderNextGroup = (anchorNum, refNum, addSeparator = false) => {
            const anchorClass = addSeparator ? 'anchor-cell pair-separator' : 'anchor-cell';
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                html.push(`<td>-</td><td>-</td>`);
                html.push(`<td>-</td><td>-</td>`);
                html.push(`<td>-</td><td>-</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            
            targets.forEach((target) => {
                html.push(`<td>${target}</td>`);
                html.push(`<td>-</td>`);
            });
        };
        
        renderNextGroup(0, 0, false);
        renderNextGroup(19, 19, true);
        renderNextGroup(lastSpin, lastSpin, true);
        renderNextGroup(DIGIT_13_OPPOSITES[lastSpin], DIGIT_13_OPPOSITES[lastSpin], false);
        
        const plus1 = Math.min(lastSpin + 1, 36);
        renderNextGroup(plus1, plus1, true);
        renderNextGroup(DIGIT_13_OPPOSITES[plus1], DIGIT_13_OPPOSITES[plus1], false);
        
        const minus1 = Math.max(lastSpin - 1, 0);
        renderNextGroup(minus1, minus1, true);
        renderNextGroup(DIGIT_13_OPPOSITES[minus1], DIGIT_13_OPPOSITES[minus1], false);
        
        const plus2 = Math.min(lastSpin + 2, 36);
        renderNextGroup(plus2, plus2, true);
        renderNextGroup(DIGIT_13_OPPOSITES[plus2], DIGIT_13_OPPOSITES[plus2], false);
        
        const minus2 = Math.max(lastSpin - 2, 0);
        renderNextGroup(minus2, minus2, true);
        renderNextGroup(DIGIT_13_OPPOSITES[minus2], DIGIT_13_OPPOSITES[minus2], false);
        
        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }
}

// TABLE 2: ±2 codes
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
        
        const renderTargetGroup = (anchorNum, refNum, addSeparator = false) => {
            const anchorClass = addSeparator ? 'anchor-cell pair-separator' : 'anchor-cell';
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                html.push(`<td>-</td><td class="code-xx">XX</td>`);
                html.push(`<td>-</td><td class="code-xx">XX</td>`);
                html.push(`<td>-</td><td class="code-xx">XX</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            
            targets.forEach((target) => {
                const code = calculatePositionCode(target, spin.actual);
                const isValid = isValidCode(code);
                const displayCode = isValid ? code : 'XX';
                const codeClass = getCodeClass(displayCode, isValid);
                
                html.push(`<td>${target}</td>`);
                html.push(`<td class="${codeClass}">${displayCode}</td>`);
            });
        };
        
        renderTargetGroup(0, 0, false);
        renderTargetGroup(19, 19, true);
        renderTargetGroup(prev, prev, true);
        renderTargetGroup(DIGIT_13_OPPOSITES[prev], DIGIT_13_OPPOSITES[prev], false);
        
        const prevPlus1 = Math.min(prev + 1, 36);
        renderTargetGroup(prevPlus1, prevPlus1, true);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus1], DIGIT_13_OPPOSITES[prevPlus1], false);
        
        const prevMinus1 = Math.max(prev - 1, 0);
        renderTargetGroup(prevMinus1, prevMinus1, true);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus1], DIGIT_13_OPPOSITES[prevMinus1], false);
        
        const prevPlus2 = Math.min(prev + 2, 36);
        renderTargetGroup(prevPlus2, prevPlus2, true);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus2], DIGIT_13_OPPOSITES[prevPlus2], false);
        
        const prevMinus2 = Math.max(prev - 2, 0);
        renderTargetGroup(prevMinus2, prevMinus2, true);
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus2], DIGIT_13_OPPOSITES[prevMinus2], false);
        
        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });
    
    // NEXT ROW
    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        const lastDirection = spins[spins.length - 1].direction;
        const nextDirection = lastDirection === 'C' ? 'AC' : 'C';
        
        const html = [];
        html.push(`<td class="dir-${nextDirection.toLowerCase()}">${nextDirection}</td>`);
        html.push(`<td><strong>NEXT</strong></td>`);
        
        const renderNextGroup = (anchorNum, refNum, addSeparator = false) => {
            const anchorClass = addSeparator ? 'anchor-cell pair-separator' : 'anchor-cell';
            html.push(`<td class="${anchorClass}"><strong>${anchorNum}</strong></td>`);
            
            const lookupRow = getLookupRow(refNum);
            
            if (!lookupRow) {
                html.push(`<td>-</td><td>-</td>`);
                html.push(`<td>-</td><td>-</td>`);
                html.push(`<td>-</td><td>-</td>`);
                return;
            }
            
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            
            targets.forEach((target) => {
                html.push(`<td>${target}</td>`);
                html.push(`<td>-</td>`);
            });
        };
        
        renderNextGroup(0, 0, false);
        renderNextGroup(19, 19, true);
        renderNextGroup(lastSpin, lastSpin, true);
        renderNextGroup(DIGIT_13_OPPOSITES[lastSpin], DIGIT_13_OPPOSITES[lastSpin], false);
        
        const plus1 = Math.min(lastSpin + 1, 36);
        renderNextGroup(plus1, plus1, true);
        renderNextGroup(DIGIT_13_OPPOSITES[plus1], DIGIT_13_OPPOSITES[plus1], false);
        
        const minus1 = Math.max(lastSpin - 1, 0);
        renderNextGroup(minus1, minus1, true);
        renderNextGroup(DIGIT_13_OPPOSITES[minus1], DIGIT_13_OPPOSITES[minus1], false);
        
        const plus2 = Math.min(lastSpin + 2, 36);
        renderNextGroup(plus2, plus2, true);
        renderNextGroup(DIGIT_13_OPPOSITES[plus2], DIGIT_13_OPPOSITES[plus2], false);
        
        const minus2 = Math.max(lastSpin - 2, 0);
        renderNextGroup(minus2, minus2, true);
        renderNextGroup(DIGIT_13_OPPOSITES[minus2], DIGIT_13_OPPOSITES[minus2], false);
        
        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }
}

// CORRECTED TABLE3 RENDERING
// Copy this entire function to replace renderTable3() in renderer-3tables.js

function renderTable3() {
    const tbody = document.getElementById('table3Body');
    tbody.innerHTML = '';
    
    // Show last 8 actual spins + 1 NEXT row = 9 rows total
    const startIdx = Math.max(0, spins.length - 8);
    const visibleSpins = spins.slice(startIdx);
    
    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const prev = idx > 0 ? spins[idx - 1].actual : null;
        const prevPrev = idx > 1 ? spins[idx - 2].actual : null;
        
        const row = document.createElement('tr');
        
        // ROW 1: Only direction and actual, rest empty
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
            
            // Only calculate projections if idx > 1 (Row 3+)
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
            
            const hasPos1_ref = data.prev.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos1_pair = data.prev.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos1_13ref = data.prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            const hasPos1_13pair = data.prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            
            const hasPos2_ref = data.prev_plus_1.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos2_pair = data.prev_plus_1.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos2_13ref = data.prev_plus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            const hasPos2_13pair = data.prev_plus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            
            const hasPos3_ref = data.prev_minus_1.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos3_pair = data.prev_minus_1.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos3_13ref = data.prev_minus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            const hasPos3_13pair = data.prev_minus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            
            const hasPos4_ref = data.prev_plus_2.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos4_pair = data.prev_plus_2.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos4_13ref = data.prev_plus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            const hasPos4_13pair = data.prev_plus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            
            const hasPos5_ref = data.prev_minus_2.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos5_pair = data.prev_minus_2.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos5_13ref = data.prev_minus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            const hasPos5_13pair = data.prev_minus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            
            const hasPos6_ref = data.prev_prev.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos6_pair = data.prev_prev.pair !== 'XX' ? 'cell-has-position' : '';
            const hasPos6_13ref = data.prev_prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            const hasPos6_13pair = data.prev_prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
            
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
                <td class="set-cell-1 ${hasPos1_ref}">${data.prev.ref}</td>
                <td class="set-cell-1 ${hasPos1_pair}">${formatPos(data.prev.pair)}</td>
                <td class="set-cell-1 ${hasPos1_13ref}">${data.prev.ref13Opp}</td>
                <td class="set-cell-1 ${hasPos1_13pair}">${formatPos(data.prev.pair13Opp)}</td>
                <td class="set-cell-1-last ${projClass('prev')}">${projHtml('prev')}</td>
                <td class="set-cell-2 ${hasPos2_ref}">${data.prev_plus_1.ref}</td>
                <td class="set-cell-2 ${hasPos2_pair}">${formatPos(data.prev_plus_1.pair)}</td>
                <td class="set-cell-2 ${hasPos2_13ref}">${data.prev_plus_1.ref13Opp}</td>
                <td class="set-cell-2 ${hasPos2_13pair}">${formatPos(data.prev_plus_1.pair13Opp)}</td>
                <td class="set-cell-2-last ${projClass('prev_plus_1')}">${projHtml('prev_plus_1')}</td>
                <td class="set-cell-3 ${hasPos3_ref}">${data.prev_minus_1.ref}</td>
                <td class="set-cell-3 ${hasPos3_pair}">${formatPos(data.prev_minus_1.pair)}</td>
                <td class="set-cell-3 ${hasPos3_13ref}">${data.prev_minus_1.ref13Opp}</td>
                <td class="set-cell-3 ${hasPos3_13pair}">${formatPos(data.prev_minus_1.pair13Opp)}</td>
                <td class="set-cell-3-last ${projClass('prev_minus_1')}">${projHtml('prev_minus_1')}</td>
                <td class="set-cell-4 ${hasPos4_ref}">${data.prev_plus_2.ref}</td>
                <td class="set-cell-4 ${hasPos4_pair}">${formatPos(data.prev_plus_2.pair)}</td>
                <td class="set-cell-4 ${hasPos4_13ref}">${data.prev_plus_2.ref13Opp}</td>
                <td class="set-cell-4 ${hasPos4_13pair}">${formatPos(data.prev_plus_2.pair13Opp)}</td>
                <td class="set-cell-4-last ${projClass('prev_plus_2')}">${projHtml('prev_plus_2')}</td>
                <td class="set-cell-5 ${hasPos5_ref}">${data.prev_minus_2.ref}</td>
                <td class="set-cell-5 ${hasPos5_pair}">${formatPos(data.prev_minus_2.pair)}</td>
                <td class="set-cell-5 ${hasPos5_13ref}">${data.prev_minus_2.ref13Opp}</td>
                <td class="set-cell-5 ${hasPos5_13pair}">${formatPos(data.prev_minus_2.pair13Opp)}</td>
                <td class="set-cell-5-last ${projClass('prev_minus_2')}">${projHtml('prev_minus_2')}</td>
                <td class="set-cell-6 ${hasPos6_ref}">${data.prev_prev.ref}</td>
                <td class="set-cell-6 ${hasPos6_pair}">${formatPos(data.prev_prev.pair)}</td>
                <td class="set-cell-6 ${hasPos6_13ref}">${data.prev_prev.ref13Opp}</td>
                <td class="set-cell-6 ${hasPos6_13pair}">${formatPos(data.prev_prev.pair13Opp)}</td>
                <td class="set-cell-6-last ${projClass('prev_prev')}">${projHtml('prev_prev')}</td>
            `;
        }
        
        tbody.appendChild(row);
    });
    
    // ADD NEXT ROW - Critical for betting!
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
        
        // Generate NEXT row projections
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
            <td class="set-cell-1">${data.prev.ref}</td>
            <td class="set-cell-1">-</td>
            <td class="set-cell-1">${data.prev.ref13Opp}</td>
            <td class="set-cell-1">-</td>
            <td class="set-cell-1-last col-prj">${nextProjHtml('prev')}</td>
            <td class="set-cell-2">${data.prev_plus_1.ref}</td>
            <td class="set-cell-2">-</td>
            <td class="set-cell-2">${data.prev_plus_1.ref13Opp}</td>
            <td class="set-cell-2">-</td>
            <td class="set-cell-2-last col-prj">${nextProjHtml('prev_plus_1')}</td>
            <td class="set-cell-3">${data.prev_minus_1.ref}</td>
            <td class="set-cell-3">-</td>
            <td class="set-cell-3">${data.prev_minus_1.ref13Opp}</td>
            <td class="set-cell-3">-</td>
            <td class="set-cell-3-last col-prj">${nextProjHtml('prev_minus_1')}</td>
            <td class="set-cell-4">${data.prev_plus_2.ref}</td>
            <td class="set-cell-4">-</td>
            <td class="set-cell-4">${data.prev_plus_2.ref13Opp}</td>
            <td class="set-cell-4">-</td>
            <td class="set-cell-4-last col-prj">${nextProjHtml('prev_plus_2')}</td>
            <td class="set-cell-5">${data.prev_minus_2.ref}</td>
            <td class="set-cell-5">-</td>
            <td class="set-cell-5">${data.prev_minus_2.ref13Opp}</td>
            <td class="set-cell-5">-</td>
            <td class="set-cell-5-last col-prj">${nextProjHtml('prev_minus_2')}</td>
            <td class="set-cell-6">${data.prev_prev.ref}</td>
            <td class="set-cell-6">-</td>
            <td class="set-cell-6">${data.prev_prev.ref13Opp}</td>
            <td class="set-cell-6">-</td>
            <td class="set-cell-6-last col-prj">${nextProjHtml('prev_prev')}</td>
        `;
        
        tbody.appendChild(nextRow);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('spinNumber').addEventListener('keypress', e => {
        if (e.key === 'Enter') addSpin();
    });
    
    document.getElementById('addBtn').addEventListener('click', addSpin);
    document.getElementById('undoBtn').addEventListener('click', undoLast);
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    
    render();
});
