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

// 36-pocket European wheel: 0 and 26 share ONE pocket (index 0)
// This gives correct neighbors: left of 0/26 pocket is 3, right is 32
const WHEEL_36 = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];

/**
 * Get the 36-pocket wheel index for any number.
 * 0 and 26 both map to index 0 (same pocket).
 */
function getWheel36Index(num) {
    if (num === 26) return 0;  // 26 shares pocket with 0
    return WHEEL_36.indexOf(num);
}

/**
 * Get numbers at a wheel pocket index.
 * Index 0 returns BOTH 0 and 26 (they share the pocket).
 */
function getNumbersAtPocket(pocketIdx) {
    const idx = ((pocketIdx % 36) + 36) % 36;
    if (idx === 0) return [0, 26];  // both numbers in this pocket
    return [WHEEL_36[idx]];
}

function expandAnchorsToBetNumbers(purpleAnchors, greenAnchors) {
    const betNumbers = new Set();

    [...purpleAnchors, ...greenAnchors].forEach(anchor => {
        const idx = getWheel36Index(anchor);
        if (idx === -1) return;

        for (let offset = -1; offset <= 1; offset++) {
            getNumbersAtPocket(idx + offset).forEach(n => betNumbers.add(n));
        }
    });

    return Array.from(betNumbers);
}

/**
 * Expand target numbers to include ±N wheel neighbors on BOTH sides:
 *   - Same side: target ± neighborRange on the wheel
 *   - Opposite side: REGULAR_OPPOSITE of target ± neighborRange on the wheel
 * This matches how Tables 1 & 2 validate hits (S+0, SL+1, SR+1, O+0, OL+1, OR+1, etc.)
 * @param {Array<number>} targets - Target numbers to expand
 * @param {number} neighborRange - 1 for Table 1, 2 for Table 2
 * @returns {Array<number>} All numbers including targets and their same + opposite side neighbors
 */
function expandTargetsToBetNumbers(targets, neighborRange) {
    const betNumbers = new Set();

    targets.forEach(target => {
        // Same side: target and its ±N wheel neighbors
        // Uses WHEEL_36 (36 pockets, 0/26 = single pocket) for correct neighbor lookup
        const idx = getWheel36Index(target);
        if (idx !== -1) {
            for (let offset = -neighborRange; offset <= neighborRange; offset++) {
                getNumbersAtPocket(idx + offset).forEach(n => betNumbers.add(n));
            }
        }

        // Opposite side: REGULAR_OPPOSITE of target and its ±N wheel neighbors
        const opposite = REGULAR_OPPOSITES[target];
        if (opposite !== undefined) {
            const oppIdx = getWheel36Index(opposite);
            if (oppIdx !== -1) {
                for (let offset = -neighborRange; offset <= neighborRange; offset++) {
                    getNumbersAtPocket(oppIdx + offset).forEach(n => betNumbers.add(n));
                }
            }
        }
    });

    return Array.from(betNumbers);
}

/**
 * Get NEXT row projections for Table 1 (±1 neighbor expansion)
 * Returns per-pair per-ref targets + expanded numbers
 * Uses same Math.min/Math.max clamping as renderTable1() NEXT row
 */
function getTable1NextProjections() {
    if (spins.length < 1) return {};

    const lastSpin = spins[spins.length - 1].actual;
    const projections = {};

    const pairs = {
        ref0:       0,
        ref19:      19,
        prev:       lastSpin,
        prevPlus1:  Math.min(lastSpin + 1, 36),
        prevMinus1: Math.max(lastSpin - 1, 0),
        prevPlus2:  Math.min(lastSpin + 2, 36),
        prevMinus2: Math.max(lastSpin - 2, 0)
    };

    Object.entries(pairs).forEach(([pairKey, refNum]) => {
        const ref13Opp = DIGIT_13_OPPOSITES[refNum];

        const refLookup = getLookupRow(refNum);
        const oppLookup = getLookupRow(ref13Opp);

        // P entry — from refLookup only
        if (refLookup) {
            projections[pairKey] = {};
            ['first', 'second', 'third'].forEach(refKey => {
                const numbers = expandTargetsToBetNumbers([refLookup[refKey]], 1);
                projections[pairKey][refKey] = {
                    targets: [refLookup[refKey]],
                    numbers: numbers
                };
            });
        }

        // P-13OPP entry — from oppLookup only
        if (oppLookup) {
            projections[pairKey + '_13opp'] = {};
            ['first', 'second', 'third'].forEach(refKey => {
                const numbers = expandTargetsToBetNumbers([oppLookup[refKey]], 1);
                projections[pairKey + '_13opp'][refKey] = {
                    targets: [oppLookup[refKey]],
                    numbers: numbers
                };
            });
        }
    });

    return projections;
}

/**
 * Get NEXT row projections for Table 2 (±2 neighbor expansion)
 * Same structure as Table 1 but with wider neighbor range
 */
function getTable2NextProjections() {
    if (spins.length < 1) return {};

    const lastSpin = spins[spins.length - 1].actual;
    const projections = {};

    const pairs = {
        ref0:       0,
        ref19:      19,
        prev:       lastSpin,
        prevPlus1:  Math.min(lastSpin + 1, 36),
        prevMinus1: Math.max(lastSpin - 1, 0),
        prevPlus2:  Math.min(lastSpin + 2, 36),
        prevMinus2: Math.max(lastSpin - 2, 0)
    };

    Object.entries(pairs).forEach(([pairKey, refNum]) => {
        const ref13Opp = DIGIT_13_OPPOSITES[refNum];

        const refLookup = getLookupRow(refNum);
        const oppLookup = getLookupRow(ref13Opp);

        // P entry — from refLookup only
        if (refLookup) {
            projections[pairKey] = {};
            ['first', 'second', 'third'].forEach(refKey => {
                const numbers = expandTargetsToBetNumbers([refLookup[refKey]], 2);
                projections[pairKey][refKey] = {
                    targets: [refLookup[refKey]],
                    numbers: numbers
                };
            });
        }

        // P-13OPP entry — from oppLookup only
        if (oppLookup) {
            projections[pairKey + '_13opp'] = {};
            ['first', 'second', 'third'].forEach(refKey => {
                const numbers = expandTargetsToBetNumbers([oppLookup[refKey]], 2);
                projections[pairKey + '_13opp'][refKey] = {
                    targets: [oppLookup[refKey]],
                    numbers: numbers
                };
            });
        }
    });

    return projections;
}

/**
 * Auto-detect which 2 of 3 ref columns (first/second/third) hit most recently for a T1/T2 pair.
 * Uses the EXACT SAME logic as table rendering:
 *   1. Compute refNum from the pair key + previous spin
 *   2. Look up targets from the lookup table: {first: X, second: Y, third: Z}
 *   3. For each target, compute calculatePositionCode(TARGET, actual) ← same as renderTable1/2
 *   4. Check if the code is a valid hit code for that table
 *
 * @param {string} pairKey - e.g., 'prev', 'prev_13opp', 'ref0', 'prevPlus1_13opp'
 * @param {string} tableId - 'table1' or 'table2'
 * @returns {{ primaryRefs: Set<string>, extraRef: string }}
 */
function getAutoSelectedRefs(pairKey, tableId) {
    const is13Opp = pairKey.endsWith('_13opp');
    const basePairKey = pairKey.replace('_13opp', '');

    // Valid codes — same as used in renderTable1/renderTable2
    const TABLE1_VALID = ['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1'];
    const TABLE2_VALID = [...TABLE1_VALID, 'SL+2', 'SR+2', 'OL+2', 'OR+2'];
    const validCodes = tableId === 'table1' ? TABLE1_VALID : TABLE2_VALID;

    const foundRefs = [];

    for (let i = spins.length - 1; i >= 1 && foundRefs.length < 2; i--) {
        const actual = spins[i].actual;
        const prev = spins[i - 1].actual;

        // Compute refNum for this pairKey at this historical spin
        let refNum;
        switch (basePairKey) {
            case 'ref0':       refNum = 0; break;
            case 'ref19':      refNum = 19; break;
            case 'prev':       refNum = prev; break;
            case 'prevPlus1':  refNum = Math.min(prev + 1, 36); break;
            case 'prevMinus1': refNum = Math.max(prev - 1, 0); break;
            case 'prevPlus2':  refNum = Math.min(prev + 2, 36); break;
            case 'prevMinus2': refNum = Math.max(prev - 2, 0); break;
            default: continue;
        }
        if (is13Opp) refNum = DIGIT_13_OPPOSITES[refNum];

        // Get lookup table row for this reference number
        const lookupRow = getLookupRow(refNum);
        if (!lookupRow) continue;

        // Check each target column — SAME as table rendering:
        // calculatePositionCode(TARGET, actual) — NOT (refNum, actual)!
        const targets = { first: lookupRow.first, second: lookupRow.second, third: lookupRow.third };

        for (const [refKey, target] of Object.entries(targets)) {
            if (foundRefs.includes(refKey)) continue; // Already found this column

            const code = calculatePositionCode(target, actual);
            if (code === 'XX') continue;
            if (!validCodes.includes(code)) continue;

            // This column had a valid hit at this spin
            foundRefs.push(refKey);
            console.log(`🔍 Spin ${i}: actual=${actual}, ref=${refNum}, target[${refKey}]=${target}, code=${code} → HIT`);
            if (foundRefs.length >= 2) break;
        }
    }

    // Fallback: if fewer than 2 found, fill with remaining columns in order
    for (const col of ['first', 'second', 'third']) {
        if (foundRefs.length >= 2) break;
        if (!foundRefs.includes(col)) foundRefs.push(col);
    }

    const extraRef = ['first', 'second', 'third'].find(c => !foundRefs.includes(c));

    console.log(`🔍 Auto-select refs for ${pairKey} (${tableId}): primary=[${foundRefs.join(',')}], extra=${extraRef}`);

    return { primaryRefs: new Set(foundRefs), extraRef };
}
window.getAutoSelectedRefs = getAutoSelectedRefs;

/**
 * Frontend port of backend _calculate_wheel_anchors()
 * Finds CONTIGUOUS RUNS of consecutive wheel numbers in the bet list,
 * then assigns anchors from the center of each run:
 *   - Run of 3 → ±1 anchor (center number, 3-number group)
 *   - Run of 5 → ±2 anchor (center number, 5-number group)
 *   - Run of 4 → ±1 anchor at position 1 (3 covered) + 1 loose at end
 *   - Run of 6 → ±2 anchor at position 2 (5 covered) + 1 loose at end
 *   - Run of 7+ → ±2 anchor from center, remaining handled as sub-runs
 *   - Run of 1-2 → all loose
 * @param {Array<number>} numbers - Bet numbers
 * @returns {Object} { anchors, loose, anchorGroups }
 */
function calculateWheelAnchors(numbers) {
    if (!numbers || numbers.length === 0) return { anchors: [], loose: [], anchorGroups: [] };

    const numberSet = new Set(numbers);

    // Helper: get the number at a wheel position (wrapping)
    function getNum(wheelIdx) {
        const idx = ((wheelIdx % 37) + 37) % 37;
        return WHEEL_STANDARD[idx];
    }

    // Step 1: Find all wheel positions that are in the bet list
    const inSet = new Array(37).fill(false);
    for (let i = 0; i < 37; i++) {
        if (numberSet.has(WHEEL_STANDARD[i])) {
            inSet[i] = true;
        }
    }

    // Step 2: Find contiguous runs on the circular wheel
    // First, find a starting gap (a position NOT in set) so we don't split a wrap-around run
    let startScan = 0;
    for (let i = 0; i < 37; i++) {
        if (!inSet[i]) { startScan = (i + 1) % 37; break; }
    }

    const runs = [];
    const visited = new Array(37).fill(false);

    for (let s = 0; s < 37; s++) {
        const start = (startScan + s) % 37;
        if (!inSet[start] || visited[start]) continue;

        // Extend this run forward
        let runIndices = [];
        let pos = start;
        while (runIndices.length < 37) {
            const idx = pos % 37;
            if (!inSet[idx] || visited[idx]) break;
            runIndices.push(idx);
            visited[idx] = true;
            pos++;
        }

        if (runIndices.length > 0) {
            runs.push(runIndices);
        }
    }

    // Step 3: For each run, extract anchor groups greedily
    const anchorGroups = [];
    const coveredPositions = new Set();

    function extractAnchors(runIndices) {
        const len = runIndices.length;
        if (len < 3) return; // Too short for any anchor

        let i = 0;
        while (i < len) {
            const remaining = len - i;

            if (remaining >= 5) {
                // Take a ±2 group (5 numbers) centered at i+2
                const centerIdx = runIndices[i + 2];
                const group = [
                    WHEEL_STANDARD[runIndices[i]],
                    WHEEL_STANDARD[runIndices[i + 1]],
                    WHEEL_STANDARD[centerIdx],
                    WHEEL_STANDARD[runIndices[i + 3]],
                    WHEEL_STANDARD[runIndices[i + 4]]
                ];
                anchorGroups.push({
                    anchor: WHEEL_STANDARD[centerIdx],
                    group: group,
                    type: '±2'
                });
                for (let j = i; j < i + 5; j++) coveredPositions.add(runIndices[j]);
                i += 5;
            } else if (remaining >= 3) {
                // Take a ±1 group (3 numbers) centered at i+1
                const centerIdx = runIndices[i + 1];
                const group = [
                    WHEEL_STANDARD[runIndices[i]],
                    WHEEL_STANDARD[centerIdx],
                    WHEEL_STANDARD[runIndices[i + 2]]
                ];
                anchorGroups.push({
                    anchor: WHEEL_STANDARD[centerIdx],
                    group: group,
                    type: '±1'
                });
                for (let j = i; j < i + 3; j++) coveredPositions.add(runIndices[j]);
                i += 3;
            } else {
                // 1-2 remaining → can't form a group, skip
                i++;
            }
        }
    }

    runs.forEach(runIndices => extractAnchors(runIndices));

    // Step 4: Determine loose numbers (not covered by any group)
    const loose = [];
    const anchorNums = [];

    numbers.forEach(num => {
        const idx = WHEEL_STANDARD.indexOf(num);
        if (idx === -1 || !coveredPositions.has(idx)) {
            loose.push(num);
        }
    });

    anchorGroups.forEach(ag => anchorNums.push(ag.anchor));
    loose.sort((a, b) => a - b);
    anchorNums.sort((a, b) => a - b);

    return { anchors: anchorNums, loose: loose, anchorGroups };
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

// Flash variant of formatPos: outputs a span with inline amber styles
// and NO competing CSS classes (no pos-s/pos-o/pos-xx).
// Used when ±1 flash is detected — baked directly into the initial HTML
// so there are zero CSS specificity battles.
function formatPosFlash(code) {
    if (!code) return '';
    return `<span style="background:#fbbf24 !important;color:#000 !important;padding:1px 2px;border-radius:2px;display:inline-block;white-space:nowrap;font-weight:900;font-size:9px;min-width:28px;text-align:center">${code}</span>`;
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
        const response = await fetch('http://localhost:8002/undo', {
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
            if (window.aiPanel._predictionDebounce) {
                clearTimeout(window.aiPanel._predictionDebounce);
            }
            window.aiPanel.clearSelections();  // Clears all 3 tables + displays
            window.aiPanel.table3Pairs = [];
            window.aiPanel.table1Pairs = [];
            window.aiPanel.table2Pairs = [];
            window.aiPanel.availablePairs = [];
            window.aiPanel.renderAllCheckboxes();
        }
        window.table3DisplayProjections = {};
    }
}

function resetAll() {
    if (confirm('Reset all?')) {
        spins.length = 0;  // ✅ Clears SAME array, keeps reference intact
        document.getElementById('direction').value = 'C';

        // Clear spin input field
        const spinInput = document.getElementById('spinNumber');
        if (spinInput) spinInput.value = '';

        // Explicitly clear all table bodies
        ['table1Body', 'table2Body', 'table3Body'].forEach(id => {
            const tbody = document.getElementById(id);
            if (tbody) tbody.innerHTML = '';
        });

        // Clear any remaining pair-selected highlights from all tables
        document.querySelectorAll('.t3-pair-selected').forEach(el => {
            el.classList.remove('t3-pair-selected');
        });

        // Reset Money Management Panel
        if (window.moneyPanel) {
            // Preserve current strategy selection across reset
            const currentStrategy = window.moneyPanel.sessionData.bettingStrategy || 3;
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
            if (window.aiPanel._predictionDebounce) {
                clearTimeout(window.aiPanel._predictionDebounce);
            }
            window.aiPanel.clearSelections();  // Clears all 3 tables + displays
            window.aiPanel.table3Pairs = [];
            window.aiPanel.table1Pairs = [];
            window.aiPanel.table2Pairs = [];
            window.aiPanel.availablePairs = [];
            window.aiPanel.renderAllCheckboxes();
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
        const aiInt = window.aiIntegrationV6 || window.aiIntegration;
        if (aiInt && typeof aiInt.resetSession === 'function') {
            aiInt.resetSession().then(() => {
                console.log('✅ Backend session reset');
            }).catch(err => {
                console.warn('⚠️ Backend reset failed:', err);
            });
        }

        // Reset orchestrator
        if (window.autoUpdateOrchestrator) {
            window.autoUpdateOrchestrator.lastSpinCount = 0;
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
            // 12 pairs × 7 cols = 84 data cols. No Dir/Actual columns.
            // Groups: 0(7) | 19(7) | P(7)+P13(7) | P+1(7)+P+1-13(7) | P-1(7)+P-1-13(7) | P+2(7)+P+2-13(7) | P-2(7)+P-2-13(7)
            const emptyCells = [];
            const groupStarts = [7, 14, 28, 42, 56, 70]; // black pair-separator positions
            const copairStarts = [21, 35, 49, 63, 77]; // white copair-separator positions
            for (let c = 0; c < 84; c++) {
                if (groupStarts.includes(c)) {
                    emptyCells.push('<td class="pair-separator"></td>');
                } else if (copairStarts.includes(c)) {
                    emptyCells.push('<td class="copair-separator"></td>');
                } else {
                    emptyCells.push('<td></td>');
                }
            }
            row.innerHTML = emptyCells.join('');
            tbody.appendChild(row);
            return;
        }

        const prev = spins[idx - 1].actual;
        const validCodes = ['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1'];

        const html = [];

        const isValidCode = (code) => validCodes.includes(code);

        const getCodeClass = (code, isValid) => {
            if (!isValid || code === 'XX') return 'code-xx';
            if (code.startsWith('S')) return 'code-s';
            if (code.startsWith('O')) return 'code-o';
            return '';
        };

        const renderTargetGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '', addCopairSep = false) => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            const anchorClass = 'anchor-cell' +
                (addSeparator ? ' pair-separator' : '') +
                (addCopairSep ? ' copair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"${dp}><strong>${anchorNum}</strong></td>`);

            const lookupRow = getLookupRow(refNum);

            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = 'code-xx' + (is13Opp ? ' opp13-cell' : '');
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${codeClass}"${dp}>XX</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${codeClass}"${dp}>XX</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${codeClass}"${dp}>XX</td>`);
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

                html.push(`<td class="${numClass}"${dp}>${target}</td>`);
                html.push(`<td class="${codeClass}"${dp}>${displayCode}</td>`);
            });
        };

        renderTargetGroup(0, 0, false, false, 'ref0');
        renderTargetGroup(19, 19, true, false, 'ref19');
        renderTargetGroup(prev, prev, true, false, 'prev');
        renderTargetGroup(DIGIT_13_OPPOSITES[prev], DIGIT_13_OPPOSITES[prev], false, true, 'prev_13opp', true);

        const prevPlus1 = Math.min(prev + 1, 36);
        renderTargetGroup(prevPlus1, prevPlus1, true, false, 'prevPlus1');
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus1], DIGIT_13_OPPOSITES[prevPlus1], false, true, 'prevPlus1_13opp', true);

        const prevMinus1 = Math.max(prev - 1, 0);
        renderTargetGroup(prevMinus1, prevMinus1, true, false, 'prevMinus1');
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus1], DIGIT_13_OPPOSITES[prevMinus1], false, true, 'prevMinus1_13opp', true);

        const prevPlus2 = Math.min(prev + 2, 36);
        renderTargetGroup(prevPlus2, prevPlus2, true, false, 'prevPlus2');
        renderTargetGroup(DIGIT_13_OPPOSITES[prevPlus2], DIGIT_13_OPPOSITES[prevPlus2], false, true, 'prevPlus2_13opp', true);

        const prevMinus2 = Math.max(prev - 2, 0);
        renderTargetGroup(prevMinus2, prevMinus2, true, false, 'prevMinus2');
        renderTargetGroup(DIGIT_13_OPPOSITES[prevMinus2], DIGIT_13_OPPOSITES[prevMinus2], false, true, 'prevMinus2_13opp', true);

        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });

    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;

        const html = [];

        const renderNextGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '', addCopairSep = false) => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            const anchorClass = 'anchor-cell' +
                (addSeparator ? ' pair-separator' : '') +
                (addCopairSep ? ' copair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"${dp}><strong>${anchorNum}</strong></td>`);

            const lookupRow = getLookupRow(refNum);

            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                return;
            }

            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const cellClass = is13Opp ? 'opp13-cell' : '';

            targets.forEach((target) => {
                html.push(`<td class="${cellClass}"${dp}>${target}</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td>`);
            });
        };

        renderNextGroup(0, 0, false, false, 'ref0');
        renderNextGroup(19, 19, true, false, 'ref19');
        renderNextGroup(lastSpin, lastSpin, true, false, 'prev');
        renderNextGroup(DIGIT_13_OPPOSITES[lastSpin], DIGIT_13_OPPOSITES[lastSpin], false, true, 'prev_13opp', true);

        const plus1 = Math.min(lastSpin + 1, 36);
        renderNextGroup(plus1, plus1, true, false, 'prevPlus1');
        renderNextGroup(DIGIT_13_OPPOSITES[plus1], DIGIT_13_OPPOSITES[plus1], false, true, 'prevPlus1_13opp', true);

        const minus1 = Math.max(lastSpin - 1, 0);
        renderNextGroup(minus1, minus1, true, false, 'prevMinus1');
        renderNextGroup(DIGIT_13_OPPOSITES[minus1], DIGIT_13_OPPOSITES[minus1], false, true, 'prevMinus1_13opp', true);

        const plus2 = Math.min(lastSpin + 2, 36);
        renderNextGroup(plus2, plus2, true, false, 'prevPlus2');
        renderNextGroup(DIGIT_13_OPPOSITES[plus2], DIGIT_13_OPPOSITES[plus2], false, true, 'prevPlus2_13opp', true);

        const minus2 = Math.max(lastSpin - 2, 0);
        renderNextGroup(minus2, minus2, true, false, 'prevMinus2');
        renderNextGroup(DIGIT_13_OPPOSITES[minus2], DIGIT_13_OPPOSITES[minus2], false, true, 'prevMinus2_13opp', true);

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
            // 7 pairs × 7 cols = 49 data cols. No Dir/Actual columns.
            const emptyCells = [];
            for (let c = 0; c < 49; c++) {
                if (c % 7 === 0 && c > 0) {
                    emptyCells.push('<td class="pair-separator"></td>');
                } else {
                    emptyCells.push('<td></td>');
                }
            }
            row.innerHTML = emptyCells.join('');
            tbody.appendChild(row);
            return;
        }

        const prev = spins[idx - 1].actual;
        const validCodes = ['S+0', 'SL+1', 'SR+1', 'SL+2', 'SR+2', 'O+0', 'OL+1', 'OR+1', 'OL+2', 'OR+2'];

        const html = [];

        const isValidCode = (code) => validCodes.includes(code);

        const getCodeClass = (code, isValid) => {
            if (!isValid || code === 'XX') return 'code-xx';
            if (code.startsWith('S')) return 'code-s';
            if (code.startsWith('O')) return 'code-o';
            return '';
        };

        const renderTargetGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '') => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            const anchorClass = 'anchor-cell' +
                (addSeparator ? ' pair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"${dp}><strong>${anchorNum}</strong></td>`);

            const lookupRow = getLookupRow(refNum);

            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = 'code-xx' + (is13Opp ? ' opp13-cell' : '');
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${codeClass}"${dp}>XX</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${codeClass}"${dp}>XX</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${codeClass}"${dp}>XX</td>`);
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

                html.push(`<td class="${numClass}"${dp}>${target}</td>`);
                html.push(`<td class="${codeClass}"${dp}>${displayCode}</td>`);
            });
        };

        // Table 2: Only base pairs (no 13OPP)
        renderTargetGroup(0, 0, false, false, 'ref0');
        renderTargetGroup(19, 19, true, false, 'ref19');
        renderTargetGroup(prev, prev, true, false, 'prev');

        const prevPlus1 = Math.min(prev + 1, 36);
        renderTargetGroup(prevPlus1, prevPlus1, true, false, 'prevPlus1');

        const prevMinus1 = Math.max(prev - 1, 0);
        renderTargetGroup(prevMinus1, prevMinus1, true, false, 'prevMinus1');

        const prevPlus2 = Math.min(prev + 2, 36);
        renderTargetGroup(prevPlus2, prevPlus2, true, false, 'prevPlus2');

        const prevMinus2 = Math.max(prev - 2, 0);
        renderTargetGroup(prevMinus2, prevMinus2, true, false, 'prevMinus2');

        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });

    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        const html = [];

        const renderNextGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '') => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            const anchorClass = 'anchor-cell' +
                (addSeparator ? ' pair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            html.push(`<td class="${anchorClass}"${dp}><strong>${anchorNum}</strong></td>`);

            const lookupRow = getLookupRow(refNum);

            if (!lookupRow) {
                const cellClass = is13Opp ? 'opp13-cell' : '';
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                return;
            }

            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const cellClass = is13Opp ? 'opp13-cell' : '';

            targets.forEach((target) => {
                html.push(`<td class="${cellClass}"${dp}>${target}</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td>`);
            });
        };

        // Table 2 NEXT row: Only base pairs (no 13OPP)
        renderNextGroup(0, 0, false, false, 'ref0');
        renderNextGroup(19, 19, true, false, 'ref19');
        renderNextGroup(lastSpin, lastSpin, true, false, 'prev');

        const plus1 = Math.min(lastSpin + 1, 36);
        renderNextGroup(plus1, plus1, true, false, 'prevPlus1');

        const minus1 = Math.max(lastSpin - 1, 0);
        renderNextGroup(minus1, minus1, true, false, 'prevMinus1');

        const plus2 = Math.min(lastSpin + 2, 36);
        renderNextGroup(plus2, plus2, true, false, 'prevPlus2');

        const minus2 = Math.max(lastSpin - 2, 0);
        renderNextGroup(minus2, minus2, true, false, 'prevMinus2');

        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }
}

// ── ±1 Distance Flash Helper ──────────────────────────────────
// Extracts the numeric distance from a position code (e.g., OR+2 → 2, SL+1 → 1, S+0 → 0)
function _getPosCodeDistance(posCode) {
    if (!posCode || posCode === 'XX') return null;
    if (posCode === 'S+0' || posCode === 'O+0') return 0;
    const m = posCode.match(/[+-](\d+)$/);
    return m ? parseInt(m[1]) : null;
}

// Mapping from pair refKey (used in data{}) to the data-pair attribute used in HTML cells
const _PAIR_REFKEY_TO_DATA_PAIR = {
    'prev': 'prev',
    'prev_plus_1': 'prevPlus1',
    'prev_minus_1': 'prevMinus1',
    'prev_plus_2': 'prevPlus2',
    'prev_minus_2': 'prevMinus2',
    'prev_prev': 'prevPrev'
};

/**
 * Pre-compute which position code cells need ±1 flash highlighting.
 * Returns a Set of strings: "relIdx:refKey:cellType"
 *   relIdx = 0-based index within visible rows
 *   refKey = 'prev', 'prev_plus_1', etc.
 *   cellType = 'pair' or 'pair13Opp'
 *
 * This is a PURE function (no DOM manipulation). Flash styles are baked
 * directly into the initial row HTML in renderTable3, eliminating ALL
 * CSS specificity battles. The old post-processing approach via
 * _applyPm1Flash/_flashPairCell set inline styles after render, but
 * .pos-s/.pos-o/.pos-xx !important backgrounds on spans could not be
 * reliably overridden in Electron/Chromium. By generating the HTML with
 * flash styles from the start (and no competing classes on the span),
 * the amber highlight is guaranteed to appear.
 */
// ── Toggle for file-based flash diagnostics ─────────────────────────────
// Set to true to write detailed diagnostics to app/flash-debug.log
// Set to false once flashing is confirmed working
let FLASH_DEBUG_ENABLED = true;

function _computeFlashTargets(allSpins, startIdx, visibleCount) {
    const result = new Set();
    const diagLines = [];  // Collects diagnostic lines for file logging

    if (FLASH_DEBUG_ENABLED) {
        diagLines.push(`\n${'='.repeat(80)}`);
        diagLines.push(`⚡ FLASH DIAGNOSTIC — ${new Date().toISOString()}`);
        diagLines.push(`   Total spins: ${allSpins.length}, startIdx: ${startIdx}, visibleCount: ${visibleCount}`);
        if (allSpins.length > 0) {
            const recent = allSpins.slice(-8).map(s => s.actual);
            diagLines.push(`   Last 8 spins: [${recent.join(', ')}]`);
        }
    }

    if (allSpins.length < 4 || visibleCount < 2) {
        console.log(`⚡ Flash skip: spins=${allSpins.length}, visible=${visibleCount}`);
        if (FLASH_DEBUG_ENABLED) {
            diagLines.push(`   SKIP: spins=${allSpins.length} (<4) or visible=${visibleCount} (<2)`);
            _writeFlashDiagnostics(diagLines);
        }
        return result;
    }

    const refKeys = ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'];

    function getRowInfo(idx) {
        const spin = allSpins[idx];
        const prev = allSpins[idx - 1].actual;
        const rawPrevPrev = idx > 1 ? allSpins[idx - 2].actual : null;
        const refs = calculateReferences(prev, rawPrevPrev || prev);
        const info = {};
        refKeys.forEach(refKey => {
            const refNum = refs[refKey];
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];
            const pairCode = calculatePositionCode(refNum, spin.actual);
            const pair13Code = calculatePositionCode(ref13Opp, spin.actual);
            info[refKey] = {
                pairCode,
                pair13Code,
                pairDist: _getPosCodeDistance(pairCode),
                pair13Dist: _getPosCodeDistance(pair13Code)
            };
        });
        return info;
    }

    const rowInfos = [];
    for (let r = 0; r < visibleCount; r++) {
        const spinIdx = startIdx + r;
        if (spinIdx <= 1) continue;
        rowInfos.push({ relIdx: r, spinIdx, info: getRowInfo(spinIdx) });
    }

    if (rowInfos.length < 2) {
        console.log(`⚡ Flash skip: only ${rowInfos.length} eligible rows (need ≥2)`);
        if (FLASH_DEBUG_ENABLED) {
            diagLines.push(`   SKIP: only ${rowInfos.length} eligible rows (need ≥2)`);
            _writeFlashDiagnostics(diagLines);
        }
        return result;
    }

    // Only check the LAST TWO eligible rows (most recent spins)
    const upper = rowInfos[rowInfos.length - 2];
    const lower = rowInfos[rowInfos.length - 1];

    if (FLASH_DEBUG_ENABLED) {
        diagLines.push(`   Checking LAST 2 eligible rows: spinIdx ${upper.spinIdx} (relIdx=${upper.relIdx}) ↔ spinIdx ${lower.spinIdx} (relIdx=${lower.relIdx})`);
        diagLines.push(`   Upper row spin: ${allSpins[upper.spinIdx].actual}, Lower row spin: ${allSpins[lower.spinIdx].actual}`);
        diagLines.push(`   ${'─'.repeat(70)}`);
    }

    refKeys.forEach(refKey => {
        const pairName = _PAIR_REFKEY_TO_DATA_PAIR[refKey];
        const upperPair = upper.info[refKey];
        const lowerPair = lower.info[refKey];

        const upperDists = [];
        const lowerDists = [];
        if (upperPair.pairDist !== null) upperDists.push({ dist: upperPair.pairDist, cell: 'pair' });
        if (upperPair.pair13Dist !== null) upperDists.push({ dist: upperPair.pair13Dist, cell: 'pair13Opp' });
        if (lowerPair.pairDist !== null) lowerDists.push({ dist: lowerPair.pairDist, cell: 'pair' });
        if (lowerPair.pair13Dist !== null) lowerDists.push({ dist: lowerPair.pair13Dist, cell: 'pair13Opp' });

        if (FLASH_DEBUG_ENABLED) {
            diagLines.push(`   PAIR [${pairName}]:`);
            diagLines.push(`     Upper: pairCode=${upperPair.pairCode} (dist=${upperPair.pairDist}), pair13Code=${upperPair.pair13Code} (dist=${upperPair.pair13Dist})`);
            diagLines.push(`     Lower: pairCode=${lowerPair.pairCode} (dist=${lowerPair.pairDist}), pair13Code=${lowerPair.pair13Code} (dist=${lowerPair.pair13Dist})`);
        }

        if (upperDists.length === 0 || lowerDists.length === 0) {
            if (FLASH_DEBUG_ENABLED) {
                diagLines.push(`     → SKIP: no valid distances (upper=${upperDists.length}, lower=${lowerDists.length})`);
            }
            return;
        }

        let matched = false;
        for (const ud of upperDists) {
            for (const ld of lowerDists) {
                const diff = Math.abs(ud.dist - ld.dist);
                if (FLASH_DEBUG_ENABLED) {
                    diagLines.push(`     Comparing: upper.${ud.cell}=${ud.dist} vs lower.${ld.cell}=${ld.dist} → diff=${diff} ${diff <= 1 ? '✅ FLASH!' : '❌ no flash'}`);
                }
                if (diff <= 1) {
                    result.add(`${upper.relIdx}:${refKey}:${ud.cell}`);
                    result.add(`${lower.relIdx}:${refKey}:${ld.cell}`);
                    console.log(`⚡ ±1 MATCH: ${pairName} rows ${upper.spinIdx}↔${lower.spinIdx}: ${ud.cell}=${ud.dist} ↔ ${ld.cell}=${ld.dist} (diff=${diff})`);
                    matched = true;
                    return;  // first match per pair exits
                }
            }
        }
        if (!matched && FLASH_DEBUG_ENABLED) {
            diagLines.push(`     → NO ±1 match for ${pairName}`);
        }
    });

    if (result.size > 0) {
        console.log(`⚡ Flash targets: ${result.size} cells in last 2 rows`);
        if (FLASH_DEBUG_ENABLED) {
            diagLines.push(`   ${'─'.repeat(70)}`);
            diagLines.push(`   ✅ RESULT: ${result.size} flash targets: ${[...result].join(', ')}`);
        }
    } else {
        console.log(`⚡ Flash result: no ±1 pairs in last 2 rows`);
        if (FLASH_DEBUG_ENABLED) {
            diagLines.push(`   ${'─'.repeat(70)}`);
            diagLines.push(`   ❌ RESULT: no ±1 pairs found in last 2 rows`);
        }
    }

    if (FLASH_DEBUG_ENABLED) {
        _writeFlashDiagnostics(diagLines);
    }

    return result;
}

/**
 * Write flash diagnostic data to app/flash-debug.log via IPC bridge.
 * Falls back to console if IPC is not available (e.g., in tests).
 */
function _writeFlashDiagnostics(lines) {
    const logData = lines.join('\n') + '\n';
    try {
        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.writeFlashLog === 'function') {
            window.aiAPI.writeFlashLog(logData).then(path => {
                if (path) console.log(`⚡ Flash diagnostics written to: ${path}`);
            }).catch(err => {
                console.warn('⚡ Flash log write failed:', err.message);
            });
        } else {
            // Fallback: console output (for tests or when IPC unavailable)
            console.log(logData);
        }
    } catch (e) {
        console.warn('⚡ Flash diagnostics error:', e.message);
    }
}

/**
 * LEGACY: After all data rows are rendered, scan ALL consecutive row pairs.
 * NOTE: This function is kept for backward compatibility with existing tests.
 * The live rendering now uses _computeFlashTargets() which bakes flash
 * styles directly into the initial HTML — no post-processing needed.
 */
function _applyPm1Flash(tbody, allSpins, startIdx, visibleCount) {
    if (allSpins.length < 4 || visibleCount < 2) {
        console.log(`⚡ Flash skip: spins=${allSpins.length}, visible=${visibleCount}`);
        return;
    }

    const dataRows = tbody.querySelectorAll('tr:not(.next-row)');
    if (dataRows.length < 2) {
        console.log(`⚡ Flash skip: only ${dataRows.length} data rows`);
        return;
    }

    const refKeys = ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'];

    // Compute position codes + distances for a given spin index
    function getRowInfo(idx) {
        const spin = allSpins[idx];
        const prev = allSpins[idx - 1].actual;
        const rawPrevPrev = idx > 1 ? allSpins[idx - 2].actual : null;
        const refs = calculateReferences(prev, rawPrevPrev || prev);

        const info = {};
        refKeys.forEach(refKey => {
            const refNum = refs[refKey];
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];
            const pairCode = calculatePositionCode(refNum, spin.actual);
            const pair13Code = calculatePositionCode(ref13Opp, spin.actual);

            info[refKey] = {
                pairCode,
                pair13Code,
                pairDist: _getPosCodeDistance(pairCode),
                pair13Dist: _getPosCodeDistance(pair13Code)
            };
        });
        return info;
    }

    // Pre-compute row info for all visible rows that have idx > 1
    const rowInfos = [];   // array of { idx, info, domRow }
    for (let r = 0; r < dataRows.length && r < visibleCount; r++) {
        const spinIdx = startIdx + r;
        if (spinIdx <= 1) continue;  // Need at least 2 previous spins for references
        rowInfos.push({
            idx: spinIdx,
            info: getRowInfo(spinIdx),
            domRow: dataRows[r]
        });
    }

    if (rowInfos.length < 2) {
        console.log(`⚡ Flash skip: only ${rowInfos.length} eligible rows (need ≥2)`);
        return;
    }

    let totalFlashed = 0;

    // Only check the LAST TWO eligible rows (most recent spins)
    const upper = rowInfos[rowInfos.length - 2];
    const lower = rowInfos[rowInfos.length - 1];

    refKeys.forEach(refKey => {
        const upperPair = upper.info[refKey];
        const lowerPair = lower.info[refKey];

        const upperDists = [];
        const lowerDists = [];
        if (upperPair.pairDist !== null) upperDists.push({ dist: upperPair.pairDist, cell: 'pair' });
        if (upperPair.pair13Dist !== null) upperDists.push({ dist: upperPair.pair13Dist, cell: 'pair13Opp' });
        if (lowerPair.pairDist !== null) lowerDists.push({ dist: lowerPair.pairDist, cell: 'pair' });
        if (lowerPair.pair13Dist !== null) lowerDists.push({ dist: lowerPair.pair13Dist, cell: 'pair13Opp' });

        if (upperDists.length === 0 || lowerDists.length === 0) return;

        for (const ud of upperDists) {
            for (const ld of lowerDists) {
                if (Math.abs(ud.dist - ld.dist) <= 1) {
                    const dataPair = _PAIR_REFKEY_TO_DATA_PAIR[refKey];
                    _flashPairCell(upper.domRow, dataPair, ud.cell);
                    _flashPairCell(lower.domRow, dataPair, ld.cell);
                    totalFlashed++;
                    console.log(`⚡ ±1 MATCH: ${dataPair} rows ${upper.idx}↔${lower.idx}: ${ud.cell}=${ud.dist} ↔ ${ld.cell}=${ld.dist}`);
                    return;
                }
            }
        }
    });

    // Clear any existing pulse interval from previous render
    if (window._pm1PulseInterval) {
        clearInterval(window._pm1PulseInterval);
        window._pm1PulseInterval = null;
    }

    if (totalFlashed > 0) {
        console.log(`⚡ ±1 Flash applied to ${totalFlashed} pair-row combinations`);

        // Start JS-based pulse animation.
        // We use setInterval instead of CSS @keyframes because CSS animations
        // CANNOT override !important background rules (per CSS cascade spec).
        // Inline styles set via JS are the only reliable way to pulse.
        let bright = false;
        window._pm1PulseInterval = setInterval(() => {
            bright = !bright;
            const bg = bright ? '#fbbf24' : '#fef3c7';
            const shadow = bright
                ? '0 0 16px rgba(245, 158, 11, 1)'
                : '0 0 8px rgba(245, 158, 11, 0.6)';
            const cells = document.querySelectorAll('.t3-pm1-flash');
            if (cells.length === 0) {
                clearInterval(window._pm1PulseInterval);
                window._pm1PulseInterval = null;
                return;
            }
            cells.forEach(cell => {
                cell.style.setProperty('background', bg, 'important');
                cell.style.setProperty('box-shadow', shadow, 'important');
                const s = cell.querySelector('span');
                if (s) s.style.setProperty('background', bg, 'important');
            });
        }, 600);
    } else {
        console.log(`⚡ Flash result: no ±1 pairs found across ${rowInfos.length} rows`);
    }
}

/**
 * Add flash highlight to the position code cell within a row for a given pair.
 * hitCellType: 'pair' (offset 1 within pair) or 'pair13Opp' (offset 3 within pair)
 *
 * NUCLEAR APPROACH: Sets inline styles directly via element.style.setProperty()
 * with !important flag. This overrides ALL CSS rules regardless of specificity,
 * cascade order, or competing !important declarations in stylesheets.
 * The pulsing animation is handled by a JS setInterval in _applyPm1Flash.
 */
function _flashPairCell(row, dataPair, hitCellType) {
    // Find all cells with data-pair matching
    const cells = row.querySelectorAll(`td[data-pair="${dataPair}"]`);
    // Per pair: cells are [ref, posCode, ref13Opp, posCode13Opp, projection] = indices 0,1,2,3,4
    // hitCellType='pair' → index 1 (the position code cell)
    // hitCellType='pair13Opp' → index 3 (the 13OPP position code cell)
    const cellIdx = hitCellType === 'pair' ? 1 : 3;
    if (cells[cellIdx]) {
        const cell = cells[cellIdx];

        // Add class for querying (used by pulse interval and tests)
        cell.classList.add('t3-pm1-flash');

        // INLINE STYLES — override everything including .cell-has-position !important
        cell.style.setProperty('outline', '3px solid #f59e0b', 'important');
        cell.style.setProperty('outline-offset', '-1px', 'important');
        cell.style.setProperty('position', 'relative', 'important');
        cell.style.setProperty('z-index', '10', 'important');
        cell.style.setProperty('background', '#fef3c7', 'important');
        cell.style.setProperty('box-shadow', '0 0 8px rgba(245, 158, 11, 0.6)', 'important');

        // INLINE STYLES on SPAN — override .pos-s/.pos-o/.pos-xx !important backgrounds
        const span = cell.querySelector('span');
        if (span) {
            span.style.setProperty('background', '#fef3c7', 'important');
            span.style.setProperty('color', '#92400e', 'important');
        }

        console.log(`⚡ DOM: Added t3-pm1-flash to ${dataPair}[${cellIdx}] (${hitCellType}), text="${cell.textContent}"`);
    } else {
        console.warn(`⚡ DOM ERROR: cells[${cellIdx}] not found for ${dataPair}, found ${cells.length} cells total`);
    }
}

// TABLE 3 - FIXED: Position codes + Visual separators
function renderTable3() {
    // Clear any existing flash pulse interval before rebuilding DOM
    if (window._pm1PulseInterval) {
        clearInterval(window._pm1PulseInterval);
        window._pm1PulseInterval = null;
    }

    const tbody = document.getElementById('table3Body');
    tbody.innerHTML = '';
    
    const startIdx = Math.max(0, spins.length - 8);
    const visibleSpins = spins.slice(startIdx);

    // Pre-compute ±1 flash targets BEFORE building DOM rows.
    // Flash styles are baked directly into the initial HTML,
    // avoiding all CSS specificity battles with .pos-s/.pos-o/.pos-xx.
    const flashTargets = _computeFlashTargets(spins, startIdx, visibleSpins.length);

    // Positive / negative number sets for actual-number color coding
    const _T3_POS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
    const _T3_NEG = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const prev = idx > 0 ? spins[idx - 1].actual : null;
        const prevPrev = idx > 1 ? spins[idx - 2].actual : null;
        
        const row = document.createElement('tr');
        
        if (prev === null) {
            // 6 pairs × 5 cols = 30 data cols. Separator at start of each pair except first.
            const emptyCells = [];
            for (let c = 0; c < 30; c++) {
                if (c % 5 === 0 && c > 0) {
                    emptyCells.push('<td class="pair-separator"></td>');
                } else {
                    emptyCells.push('<td></td>');
                }
            }
            const _actColor1 = _T3_POS.has(spin.actual) ? '#22c55e' : _T3_NEG.has(spin.actual) ? '#ef4444' : '#94a3b8';
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td style="color:${_actColor1}"><strong>${spin.actual}</strong></td>
                ${emptyCells.join('')}
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

            // Position code cell generator — bakes ±1 flash styles into HTML.
            // When a cell is a flash target, it gets class="t3-pm1-flash" (no
            // cell-has-position) and a span with inline amber styles (no pos-s/
            // pos-o/pos-xx classes). This eliminates ALL CSS specificity battles.
            const posCell = (refKey, field) => {
                const posCode = data[refKey][field];
                const dataPairAttr = _PAIR_REFKEY_TO_DATA_PAIR[refKey];
                const cellType = field === 'pair' ? 'pair' : 'pair13Opp';
                const flash = flashTargets.has(`${relIdx}:${refKey}:${cellType}`);
                if (flash) {
                    return `<td class="t3-pm1-flash" data-pair="${dataPairAttr}" style="outline:3px solid #f59e0b !important;outline-offset:-1px !important;position:relative !important;z-index:10 !important;background:#fef3c7 !important;box-shadow:0 0 8px rgba(245,158,11,0.6) !important">${formatPosFlash(posCode)}</td>`;
                }
                const cls = posCode && posCode !== 'XX' ? 'cell-has-position' : '';
                return `<td class="${cls}" data-pair="${dataPairAttr}">${formatPos(posCode)}</td>`;
            };

            const _actColor2 = _T3_POS.has(spin.actual) ? '#22c55e' : _T3_NEG.has(spin.actual) ? '#ef4444' : '#94a3b8';
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td style="color:${_actColor2}"><strong>${spin.actual}</strong></td>
                <td class="${cellClass('prev', 'pair', true)}" data-pair="prev">${data.prev.ref}</td>
                ${posCell('prev', 'pair')}
                <td class="${cellClass('prev', 'pair13Opp')}" data-pair="prev">${data.prev.ref13Opp}</td>
                ${posCell('prev', 'pair13Opp')}
                <td class="${projClass('prev')}" data-pair="prev">${projHtml('prev')}</td>
                <td class="${cellClass('prev_plus_1', 'pair', true)}" data-pair="prevPlus1">${data.prev_plus_1.ref}</td>
                ${posCell('prev_plus_1', 'pair')}
                <td class="${cellClass('prev_plus_1', 'pair13Opp')}" data-pair="prevPlus1">${data.prev_plus_1.ref13Opp}</td>
                ${posCell('prev_plus_1', 'pair13Opp')}
                <td class="${projClass('prev_plus_1')}" data-pair="prevPlus1">${projHtml('prev_plus_1')}</td>
                <td class="${cellClass('prev_minus_1', 'pair', true)}" data-pair="prevMinus1">${data.prev_minus_1.ref}</td>
                ${posCell('prev_minus_1', 'pair')}
                <td class="${cellClass('prev_minus_1', 'pair13Opp')}" data-pair="prevMinus1">${data.prev_minus_1.ref13Opp}</td>
                ${posCell('prev_minus_1', 'pair13Opp')}
                <td class="${projClass('prev_minus_1')}" data-pair="prevMinus1">${projHtml('prev_minus_1')}</td>
                <td class="${cellClass('prev_plus_2', 'pair', true)}" data-pair="prevPlus2">${data.prev_plus_2.ref}</td>
                ${posCell('prev_plus_2', 'pair')}
                <td class="${cellClass('prev_plus_2', 'pair13Opp')}" data-pair="prevPlus2">${data.prev_plus_2.ref13Opp}</td>
                ${posCell('prev_plus_2', 'pair13Opp')}
                <td class="${projClass('prev_plus_2')}" data-pair="prevPlus2">${projHtml('prev_plus_2')}</td>
                <td class="${cellClass('prev_minus_2', 'pair', true)}" data-pair="prevMinus2">${data.prev_minus_2.ref}</td>
                ${posCell('prev_minus_2', 'pair')}
                <td class="${cellClass('prev_minus_2', 'pair13Opp')}" data-pair="prevMinus2">${data.prev_minus_2.ref13Opp}</td>
                ${posCell('prev_minus_2', 'pair13Opp')}
                <td class="${projClass('prev_minus_2')}" data-pair="prevMinus2">${projHtml('prev_minus_2')}</td>
                <td class="${cellClass('prev_prev', 'pair', true)}" data-pair="prevPrev">${data.prev_prev.ref}</td>
                ${posCell('prev_prev', 'pair')}
                <td class="${cellClass('prev_prev', 'pair13Opp')}" data-pair="prevPrev">${data.prev_prev.ref13Opp}</td>
                ${posCell('prev_prev', 'pair13Opp')}
                <td class="${projClass('prev_prev')}" data-pair="prevPrev">${projHtml('prev_prev')}</td>
            `;
        }

        tbody.appendChild(row);
    });

    // ── ±1 Distance Flash Pulse Animation ───────────────────────────
    // Flash styles are already baked into the initial row HTML via posCell().
    // Here we just start the JS pulse animation to toggle between
    // light amber (#fef3c7) and bright amber (#fbbf24).
    if (flashTargets.size > 0) {
        let bright = false;
        window._pm1PulseInterval = setInterval(() => {
            bright = !bright;
            const bg = bright ? '#fbbf24' : '#fef3c7';
            const shadow = bright
                ? '0 0 16px rgba(245, 158, 11, 1)'
                : '0 0 8px rgba(245, 158, 11, 0.6)';
            const cells = document.querySelectorAll('.t3-pm1-flash');
            if (cells.length === 0) {
                clearInterval(window._pm1PulseInterval);
                window._pm1PulseInterval = null;
                return;
            }
            cells.forEach(cell => {
                cell.style.setProperty('background', bg, 'important');
                cell.style.setProperty('box-shadow', shadow, 'important');
                const s = cell.querySelector('span');
                if (s) s.style.setProperty('background', bg, 'important');
            });
        }, 600);
        console.log(`⚡ ±1 Flash pulse started for ${flashTargets.size} cells`);
    }

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
            <td class="pair-separator" data-pair="prev">${data.prev.ref}</td>
            <td data-pair="prev">-</td>
            <td data-pair="prev">${data.prev.ref13Opp}</td>
            <td data-pair="prev">-</td>
            <td class="col-prj" data-pair="prev">${nextProjHtml('prev')}</td>
            <td class="pair-separator" data-pair="prevPlus1">${data.prev_plus_1.ref}</td>
            <td data-pair="prevPlus1">-</td>
            <td data-pair="prevPlus1">${data.prev_plus_1.ref13Opp}</td>
            <td data-pair="prevPlus1">-</td>
            <td class="col-prj" data-pair="prevPlus1">${nextProjHtml('prev_plus_1')}</td>
            <td class="pair-separator" data-pair="prevMinus1">${data.prev_minus_1.ref}</td>
            <td data-pair="prevMinus1">-</td>
            <td data-pair="prevMinus1">${data.prev_minus_1.ref13Opp}</td>
            <td data-pair="prevMinus1">-</td>
            <td class="col-prj" data-pair="prevMinus1">${nextProjHtml('prev_minus_1')}</td>
            <td class="pair-separator" data-pair="prevPlus2">${data.prev_plus_2.ref}</td>
            <td data-pair="prevPlus2">-</td>
            <td data-pair="prevPlus2">${data.prev_plus_2.ref13Opp}</td>
            <td data-pair="prevPlus2">-</td>
            <td class="col-prj" data-pair="prevPlus2">${nextProjHtml('prev_plus_2')}</td>
            <td class="pair-separator" data-pair="prevMinus2">${data.prev_minus_2.ref}</td>
            <td data-pair="prevMinus2">-</td>
            <td data-pair="prevMinus2">${data.prev_minus_2.ref13Opp}</td>
            <td data-pair="prevMinus2">-</td>
            <td class="col-prj" data-pair="prevMinus2">${nextProjHtml('prev_minus_2')}</td>
            <td class="pair-separator" data-pair="prevPrev">${data.prev_prev.ref}</td>
            <td data-pair="prevPrev">-</td>
            <td data-pair="prevPrev">${data.prev_prev.ref13Opp}</td>
            <td data-pair="prevPrev">-</td>
            <td class="col-prj" data-pair="prevPrev">${nextProjHtml('prev_prev')}</td>
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
    
    // Get NEXT row projections (for actual betting)
    const table3NextProjections = getNextRowProjections();
    const table1NextProjections = getTable1NextProjections();
    const table2NextProjections = getTable2NextProjections();

    const data = {
        table3Hits: table3Hits,
        table3NextProjections: table3NextProjections,
        table1NextProjections: table1NextProjections,
        table2NextProjections: table2NextProjections,
        table1Hits: table1Hits,
        table2Hits: table2Hits,
        currentSpinCount: spins.length,
        recentSpins: spins.slice(-10).map(s => s.actual)
    };

    console.log('✅ Data prepared for V6:');
    console.log(`   - Table 3 NEXT projections: ${Object.keys(table3NextProjections).length} types`);
    console.log(`   - Table 1 NEXT projections: ${Object.keys(table1NextProjections).length} types`);
    console.log(`   - Table 2 NEXT projections: ${Object.keys(table2NextProjections).length} types`);
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

// Expose new utility functions globally for AI panel
window.calculateWheelAnchors = calculateWheelAnchors;
window.getTable1NextProjections = getTable1NextProjections;
window.getTable2NextProjections = getTable2NextProjections;
window.expandTargetsToBetNumbers = expandTargetsToBetNumbers;

console.log('✅ NEXT Row Projections Module loaded (V6 + Multi-Table)');
