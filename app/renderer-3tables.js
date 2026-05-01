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
    // Slice 2d-2: prevPrev needed for the new PP-based pairs so the
    // AI prediction panel sees them as available pairs and clicks
    // can select them. Null-safe — pairs return undefined entries
    // and the panel filters them out.
    const prevPrev = spins.length >= 2 ? spins[spins.length - 2].actual : null;
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
    if (prevPrev !== null) {
        pairs.prevPrev       = prevPrev;
        pairs.prevPrevPlus1  = Math.min(prevPrev + 1, 36);
        pairs.prevPrevMinus1 = Math.max(prevPrev - 1, 0);
        pairs.prevPrevPlus2  = Math.min(prevPrev + 2, 36);
        pairs.prevPrevMinus2 = Math.max(prevPrev - 2, 0);
    }

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

    // Slice 2f: drop entries whose family is hidden by the dropdown.
    return _filterProjectionsByVisibleFamilies(projections);
}

/**
 * Get NEXT row projections for Table 2 (±2 neighbor expansion)
 * Same structure as Table 1 but with wider neighbor range
 */
function getTable2NextProjections() {
    if (spins.length < 1) return {};

    const lastSpin = spins[spins.length - 1].actual;
    // Slice 2d-2: prevPrev needed for the new PP-based pairs.
    const prevPrev = spins.length >= 2 ? spins[spins.length - 2].actual : null;
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
    if (prevPrev !== null) {
        pairs.prevPrev       = prevPrev;
        pairs.prevPrevPlus1  = Math.min(prevPrev + 1, 36);
        pairs.prevPrevMinus1 = Math.max(prevPrev - 1, 0);
        pairs.prevPrevPlus2  = Math.min(prevPrev + 2, 36);
        pairs.prevPrevMinus2 = Math.max(prevPrev - 2, 0);
    }

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

    // Slice 2f: drop entries whose family is hidden by the dropdown.
    return _filterProjectionsByVisibleFamilies(projections);
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

    // ── prev-based refs (UNCHANGED — heart of table formation) ──
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

    // ── prevPrev-based refs (NEW — mirrors the prev branch above
    //    exactly, applied to the one-back spin instead of current).
    //    Powers the new PP+1 / PP-1 / PP+2 / PP-2 column groups added
    //    to T1/T2/T3 in slice 2b+. Engine pair-model auto-picks these
    //    up via PAIR_REFKEYS in services/ai-auto-engine/. Returns
    //    NaN if prevPrev is null/undefined (matches the existing
    //    contract for prev — callers must guard `idx >= 2`).
    if (prevPrev === 36) {
        refs.prev_prev_plus_1 = 35;
        refs.prev_prev_plus_2 = 34;
        refs.prev_prev_minus_1 = 35;
        refs.prev_prev_minus_2 = 34;
    } else if (prevPrev === 0) {
        refs.prev_prev_minus_1 = 10;
        refs.prev_prev_minus_2 = 9;
        refs.prev_prev_plus_1 = 1;
        refs.prev_prev_plus_2 = 2;
    } else {
        refs.prev_prev_plus_1 = Math.min(prevPrev + 1, 36);
        refs.prev_prev_plus_2 = Math.min(prevPrev + 2, 36);
        refs.prev_prev_minus_1 = Math.max(prevPrev - 1, 0);
        refs.prev_prev_minus_2 = Math.max(prevPrev - 2, 0);
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
                    } else if (strategy === 4) {
                        // Defensive: -$1 after 2 consecutive wins
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
                    } else if (strategy === 4) {
                        // Defensive: +$1 after 5 consecutive losses
                        if (replayConsLosses >= 5) {
                            replayBet += 1;
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
    try {
        if (window.rouletteWheel) {
            window.rouletteWheel.clearHighlights();
        }
    } catch (e) {
        console.warn('⚠️ Wheel clear on undo failed:', e.message);
    }

    // Re-render tables — re-triggers predictions if 3+ spins
    render();

    // ── CLEAR STALE UI WHEN < 3 SPINS ──
    try {
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
    } catch (e) {
        console.warn('⚠️ AI panel clear on undo failed:', e.message);
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
        try {
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
        } catch (e) {
            console.warn('⚠️ Money panel reset failed:', e.message);
        }

        // Reset AI Prediction Panel (clear selections, predictions, display)
        try {
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
        } catch (e) {
            console.warn('⚠️ AI panel reset failed:', e.message);
        }

        // Clear table3 display projections
        window.table3DisplayProjections = {};

        // Clear Wheel highlights
        try {
            if (window.rouletteWheel) {
                window.rouletteWheel.clearHighlights();
                console.log('✅ Wheel reset');
            }
        } catch (e) {
            console.warn('⚠️ Wheel reset failed:', e.message);
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
        try {
            if (window.autoUpdateOrchestrator) {
                window.autoUpdateOrchestrator.lastSpinCount = 0;
                console.log('✅ Orchestrator reset');
            }
        } catch (e) {
            console.warn('⚠️ Orchestrator reset failed:', e.message);
        }
        
        render();
        console.log('🔄 Full reset complete');
    }
}

/**
 * Snap each `.grid-wrapper` to its bottom row after a render() pass.
 *
 * Background: each renderTable*() does `tbody.innerHTML = ''` and then
 * repopulates from the full `spins` array (no more 8-row clip). When
 * the tbody is wiped the wrapper's scrollHeight collapses and the
 * browser clamps scrollTop to a low value. After the repopulate runs
 * scrollTop is effectively reset to 0 — the OLDEST row would be on
 * screen, hiding the newest entry just placed.
 *
 * Snapping to bottom restores the "latest row always visible" feel
 * the previous 8-row clip used to give for free. The user can still
 * scroll up between spin entries to read older rows; the next render
 * will snap back to the newest row.
 */
function _scrollGridWrapperToBottom(wrapperId) {
    const w = document.getElementById(wrapperId);
    if (w) w.scrollTop = w.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════
//  GLOBAL PAIR-FAMILY FILTER (slice 2f)
// ═══════════════════════════════════════════════════════════════════
//
// A single dropdown next to the page title controls which
// pair-families are visible across all 3 tables (and, in slice 2g,
// which families the engine considers when picking a pair).
//
// FAMILY vs COLUMN-GROUP
// T1 / T2 split each pair into TWO column-groups: main + 13opp
// (e.g. prevPlus1 + prevPlus1_13opp). T3 keeps both halves inside
// a single column-group with a shared PRJ projection. The user's
// dropdown toggles the FAMILY (e.g. prevPlus1) — both halves fall
// out of T1/T2 and the embedded T3 group goes too. Less granular
// than 22 separate toggles, much cleaner UX, and consistent across
// all 3 tables.
//
// 12 distinct families:
//   ref0, ref19, prev, prevPrev, prevPlus1, prevMinus1,
//   prevPlus2, prevMinus2, prevPrevPlus1, prevPrevMinus1,
//   prevPrevPlus2, prevPrevMinus2

const PAIR_FAMILY_LABELS = [
    {family: 'ref0',           label: '0'   },
    {family: 'ref19',          label: '19'  },
    {family: 'prevPlus1',      label: 'P+1' },
    {family: 'prevMinus1',     label: 'P-1' },
    {family: 'prevPrevPlus1',  label: 'PP+1'},
    {family: 'prevPrevMinus1', label: 'PP-1'},
    {family: 'prev',           label: 'P'   },
    {family: 'prevPrev',       label: 'PP'  },
    {family: 'prevPlus2',      label: 'P+2' },
    {family: 'prevMinus2',     label: 'P-2' },
    {family: 'prevPrevPlus2',  label: 'PP+2'},
    {family: 'prevPrevMinus2', label: 'PP-2'},
];

/**
 * Map a column-group's dataPair to its parent family. Strips the
 * `_13opp` suffix used by T1/T2 13-opposite halves; T3 entries
 * already use the bare family name.
 */
function _familyForDataPair(dataPair) {
    return dataPair && dataPair.endsWith('_13opp')
        ? dataPair.slice(0, -6)
        : dataPair;
}

const PAIR_FILTER_STORAGE_KEY = 'globalVisiblePairs';

/**
 * Load the persisted set of visible families from localStorage.
 * Falls back to "all 12 visible" when the key is absent or invalid.
 */
function _loadVisiblePairFamilies() {
    try {
        const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(PAIR_FILTER_STORAGE_KEY) : null;
        if (!raw) return new Set(PAIR_FAMILY_LABELS.map(p => p.family));
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return new Set(PAIR_FAMILY_LABELS.map(p => p.family));
        // Filter to known families so a stale key with removed entries
        // doesn't poison the renderer.
        const known = new Set(PAIR_FAMILY_LABELS.map(p => p.family));
        return new Set(arr.filter(k => known.has(k)));
    } catch (_) {
        return new Set(PAIR_FAMILY_LABELS.map(p => p.family));
    }
}

function _persistVisiblePairFamilies(set) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(PAIR_FILTER_STORAGE_KEY, JSON.stringify(Array.from(set)));
        }
    } catch (_) { /* best-effort */ }
}

// Live filter state — read by every renderTableN() and by slice 2g's
// engine restriction. Mutations go through _setVisiblePairFamilies()
// to keep localStorage + UI count badge + tables in sync.
let _visiblePairFamilies = _loadVisiblePairFamilies();

// Slice 2g: expose the visible-families Set on window so the engine
// (services/ai-auto-engine/ai-auto-engine.js) can restrict its pair
// scoring to only the families the user has chosen to display. The
// engine reads `window.getVisiblePairFamilies()` and filters
// flashingPairs before computing the best pair / projection.
// Always returns a fresh Set copy so callers can't mutate state.
if (typeof window !== 'undefined') {
    window.getVisiblePairFamilies = function() {
        return new Set(_visiblePairFamilies);
    };
}

function _setVisiblePairFamilies(set) {
    _visiblePairFamilies = new Set(set);
    _persistVisiblePairFamilies(_visiblePairFamilies);
    _refreshPairFilterUI();
    // Re-render all 3 tables so they pick up the filtered config.
    if (typeof render === 'function') render();
}

/**
 * Filter a column-group config array (T1/T2/T3) down to the entries
 * whose family is currently visible. Used inside each table renderer.
 */
function _filterVisibleColumnGroups(groups) {
    return groups.filter(g => _visiblePairFamilies.has(_familyForDataPair(g.dataPair)));
}

/**
 * Filter a projections object (keyed by pairKey, e.g.
 * `prevPlus1` / `prevPlus1_13opp`) down to keys whose family is
 * currently visible. Used by getTable1NextProjections /
 * getTable2NextProjections so the AI prediction panel's
 * "available pairs" list matches what's visible in the tables.
 */
function _filterProjectionsByVisibleFamilies(projections) {
    if (!projections || typeof projections !== 'object') return projections;
    const out = {};
    for (const k of Object.keys(projections)) {
        if (_visiblePairFamilies.has(_familyForDataPair(k))) {
            out[k] = projections[k];
        }
    }
    return out;
}

/**
 * Build the dropdown's checkbox grid + count badge. Idempotent.
 */
function _refreshPairFilterUI() {
    const grid = (typeof document !== 'undefined') ? document.getElementById('pairFilterCheckboxes') : null;
    const countBadge = (typeof document !== 'undefined') ? document.getElementById('pairFilterCount') : null;
    if (!grid || !countBadge) return;

    grid.innerHTML = PAIR_FAMILY_LABELS.map(({family, label}) => {
        const checked = _visiblePairFamilies.has(family) ? 'checked' : '';
        return `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 4px;border-radius:3px;">
                <input type="checkbox" data-family="${family}" ${checked} style="cursor:pointer;">
                <span>${label}</span>
            </label>
        `;
    }).join('');
    countBadge.textContent = `(${_visiblePairFamilies.size}/${PAIR_FAMILY_LABELS.length})`;
}

/**
 * Wire up the dropdown's button + checkboxes + click-outside-to-close.
 * Called once on DOMContentLoaded.
 */
function _setupPairFilterDropdown() {
    if (typeof document === 'undefined') return;
    const toggleBtn = document.getElementById('pairFilterToggleBtn');
    const panel     = document.getElementById('pairFilterPanel');
    const grid      = document.getElementById('pairFilterCheckboxes');
    const allBtn    = document.getElementById('pairFilterAllBtn');
    if (!toggleBtn || !panel || !grid) return;

    _refreshPairFilterUI();

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    });

    // Click outside closes the panel
    document.addEventListener('click', (e) => {
        if (panel.style.display === 'block' && !panel.contains(e.target) && e.target !== toggleBtn) {
            panel.style.display = 'none';
        }
    });

    // Checkbox change → update Set + persist + re-render
    grid.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"][data-family]');
        if (!cb) return;
        const fam = cb.dataset.family;
        const next = new Set(_visiblePairFamilies);
        if (cb.checked) next.add(fam); else next.delete(fam);
        _setVisiblePairFamilies(next);
    });

    // "All" button — re-enable every family.
    if (allBtn) {
        allBtn.addEventListener('click', () => {
            _setVisiblePairFamilies(new Set(PAIR_FAMILY_LABELS.map(p => p.family)));
        });
    }
}

function render() {
    renderTable1();
    renderTable2();
    renderTable3();
    _scrollGridWrapperToBottom('gridWrapper1');
    _scrollGridWrapperToBottom('gridWrapper2');
    _scrollGridWrapperToBottom('gridWrapper3');
    document.getElementById('info').textContent = `Spins: ${spins.length}`;

    // Re-trigger AI predictions after tables update (only if 3+ spins and pairs selected)
    if (window.aiPanel && window.aiPanel.onSpinAdded && spins.length >= 3) {
        window.aiPanel.onSpinAdded();
    }
}

// ═══════════════════════════════════════════════════════════════════
//  TABLE 1 — DATA-DRIVEN COLUMN CONFIG (slice 2b1)
// ═══════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS
// Before slice 2b1, renderTable1 hardcoded 12 pair groups via 12
// inline renderTargetGroup(...) calls + magic-number positions for
// indicator/co-pair separators (84 = 12 × 7). Reordering or extending
// the column set required editing every block. With the user-driven
// 22-column layout coming in slice 2b2 + the per-table dropdown
// coming in 2f, that hand-written form would have been brittle.
//
// CRITICAL INVARIANT
// This config MUST reproduce the EXACT same per-cell output as the
// previous hardcoded form for the existing 12 pair groups in this
// exact order. The user's "strictly no change to the table data
// formation" rule applies — every refNum below mirrors the inline
// math the previous renderTable1 used line-for-line, including the
// pre-existing edge-case difference vs. calculateReferences() at
// prev=0/36 (T1 keeps Math.min(prev+1, 36) → 36 for prev=36; the
// engine's calculateReferences gives 35; this divergence pre-dates
// slice 2b1 and is intentionally preserved here, not "fixed").
//
// FIELDS
//   key         - logical group id (also a unique label)
//   computeRef  - (prev, prevPrev) -> number; the anchor & ref value
//                 for this column group on a given data row
//   cssClass    - the set-N color class applied to header cells
//                 (data cells inherit per existing CSS rules)
//   label       - header text (e.g. "0", "P+1-13OPP")
//   dataPair    - data-pair attribute used by the prediction
//                 selection / pair-clickable mechanism
//   is13Opp     - true for the 13-opposite half of a pair-group;
//                 controls the opp13-cell class plumbing
//   prefix      - what precedes this group's anchor cell:
//                   'none'              → no extra class on anchor
//                   'pair-separator'    → just a border (used once,
//                                         between {0,19} and {prev})
//                   'pair-indicator'    → two-stripe indicator that
//                                         summarizes the previous
//                                         pair-group's hits; appears
//                                         before each main half from
//                                         prev onwards
//                   'copair-separator'  → border before the *_13opp
//                                         half of a pair-group
//
// In slice 2b2 the array is reordered + 10 entries appended for
// PP, PP·13, PP±1/13opp, PP±2/13opp. In slice 2f a dropdown will
// filter which entries render. Changing the array is the ONLY edit
// needed for those slices — the renderer derives column positions,
// indicator stripe pairing and end-of-row marker from .length.
// Slice 2b2 — 22-column layout per user spec. Order:
//   0, 19,
//   P+1, P+1·13, P-1, P-1·13,
//   PP+1, PP+1·13, PP-1, PP-1·13,
//   P, P·13, PP, PP·13,
//   P+2, P+2·13, P-2, P-2·13,
//   PP+2, PP+2·13, PP-2, PP-2·13
//
// New entries (10) all use the prevPrev value as their base. Their
// computeRef returns null when prevPrev is unknown (idx < 2 in the
// renderer); renderTargetGroup handles null refNum by drawing dashes,
// matching the existing "no lookup row available" path.
//
// The prevPrev-based +1/-1/+2/-2 math mirrors the prev-based math
// already used in this file (Math.min/Math.max + clamp at 0/36) for
// VISUAL consistency with the existing T1 anchors. Note this differs
// from calculateReferences()' edge-case handling at 0/36 (which wraps
// to 1/2 and 35/34) — we intentionally preserve T1's pre-existing
// inline convention here, not the engine's.
const T1_COLUMN_GROUPS = [
    {key:'ref0',                    computeRef:()=>0,                                                              cssClass:'set-1',  label:'0',         dataPair:'ref0',                    is13Opp:false, prefix:'none'},
    {key:'ref19',                   computeRef:()=>19,                                                             cssClass:'set-2',  label:'19',        dataPair:'ref19',                   is13Opp:false, prefix:'pair-separator'},

    {key:'prevPlus1',               computeRef:(p)=>Math.min(p+1, 36),                                             cssClass:'set-4',  label:'P+1',       dataPair:'prevPlus1',               is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPlus1_13opp',         computeRef:(p)=>DIGIT_13_OPPOSITES[Math.min(p+1, 36)],                         cssClass:'set-4',  label:'P+1-13o', dataPair:'prevPlus1_13opp',         is13Opp:true,  prefix:'copair-separator'},
    {key:'prevMinus1',              computeRef:(p)=>Math.max(p-1, 0),                                              cssClass:'set-5',  label:'P-1',       dataPair:'prevMinus1',              is13Opp:false, prefix:'pair-indicator'},
    {key:'prevMinus1_13opp',        computeRef:(p)=>DIGIT_13_OPPOSITES[Math.max(p-1, 0)],                          cssClass:'set-5',  label:'P-1-13o', dataPair:'prevMinus1_13opp',        is13Opp:true,  prefix:'copair-separator'},

    {key:'prevPrevPlus1',           computeRef:(p, pp)=>pp==null?null:Math.min(pp+1, 36),                          cssClass:'set-9',  label:'PP+1',      dataPair:'prevPrevPlus1',           is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPrevPlus1_13opp',     computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.min(pp+1, 36)],      cssClass:'set-9',  label:'PP+1-13o',dataPair:'prevPrevPlus1_13opp',     is13Opp:true,  prefix:'copair-separator'},
    {key:'prevPrevMinus1',          computeRef:(p, pp)=>pp==null?null:Math.max(pp-1, 0),                           cssClass:'set-10', label:'PP-1',      dataPair:'prevPrevMinus1',          is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPrevMinus1_13opp',    computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.max(pp-1, 0)],       cssClass:'set-10', label:'PP-1-13o',dataPair:'prevPrevMinus1_13opp',    is13Opp:true,  prefix:'copair-separator'},

    {key:'prev',                    computeRef:(p)=>p,                                                             cssClass:'set-3',  label:'P',         dataPair:'prev',                    is13Opp:false, prefix:'pair-indicator'},
    {key:'prev_13opp',              computeRef:(p)=>DIGIT_13_OPPOSITES[p],                                         cssClass:'set-3',  label:'P-13o',   dataPair:'prev_13opp',              is13Opp:true,  prefix:'copair-separator'},
    {key:'prevPrev',                computeRef:(p, pp)=>pp==null?null:pp,                                          cssClass:'set-8',  label:'PP',        dataPair:'prevPrev',                is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPrev_13opp',          computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[pp],                      cssClass:'set-8',  label:'PP-13o',  dataPair:'prevPrev_13opp',          is13Opp:true,  prefix:'copair-separator'},

    {key:'prevPlus2',               computeRef:(p)=>Math.min(p+2, 36),                                             cssClass:'set-6',  label:'P+2',       dataPair:'prevPlus2',               is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPlus2_13opp',         computeRef:(p)=>DIGIT_13_OPPOSITES[Math.min(p+2, 36)],                         cssClass:'set-6',  label:'P+2-13o', dataPair:'prevPlus2_13opp',         is13Opp:true,  prefix:'copair-separator'},
    {key:'prevMinus2',              computeRef:(p)=>Math.max(p-2, 0),                                              cssClass:'set-7',  label:'P-2',       dataPair:'prevMinus2',              is13Opp:false, prefix:'pair-indicator'},
    {key:'prevMinus2_13opp',        computeRef:(p)=>DIGIT_13_OPPOSITES[Math.max(p-2, 0)],                          cssClass:'set-7',  label:'P-2-13o', dataPair:'prevMinus2_13opp',        is13Opp:true,  prefix:'copair-separator'},

    {key:'prevPrevPlus2',           computeRef:(p, pp)=>pp==null?null:Math.min(pp+2, 36),                          cssClass:'set-11', label:'PP+2',      dataPair:'prevPrevPlus2',           is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPrevPlus2_13opp',     computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.min(pp+2, 36)],      cssClass:'set-11', label:'PP+2-13o',dataPair:'prevPrevPlus2_13opp',     is13Opp:true,  prefix:'copair-separator'},
    {key:'prevPrevMinus2',          computeRef:(p, pp)=>pp==null?null:Math.max(pp-2, 0),                           cssClass:'set-12', label:'PP-2',      dataPair:'prevPrevMinus2',          is13Opp:false, prefix:'pair-indicator'},
    {key:'prevPrevMinus2_13opp',    computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.max(pp-2, 0)],       cssClass:'set-12', label:'PP-2-13o',dataPair:'prevPrevMinus2_13opp',    is13Opp:true,  prefix:'copair-separator'},
];

/**
 * Generate T1's <thead> from T1_COLUMN_GROUPS. Replaces the
 * previously hardcoded HTML thead block.
 *
 * Two header rows:
 *   1. colspan=7 group label (e.g., "P+1", "PP-1-13OPP")
 *   2. 7 sub-headers per group: Ref / 1st / C / 2nd / C / 3rd / C
 *
 * Pair-clickable behaviour is preserved: each <th> gets the
 * t3-pair-header class + data-pair attribute the existing click
 * delegation listener reads.
 *
 * Idempotent — safe to call multiple times. Slice 2f's dropdown will
 * call this whenever T1_COLUMN_GROUPS is filtered.
 */
function _renderTable1Head() {
    const head = document.getElementById('table1Head');
    if (!head) return;

    const SUB_LABELS = ['Ref', '1st', 'C', '2nd', 'C', '3rd', 'C'];

    // Slice 2f: filter by the global pair-family dropdown so hidden
    // families don't render their thead columns either.
    const VISIBLE = _filterVisibleColumnGroups(T1_COLUMN_GROUPS);

    // ── Row 1: pair-group labels (each colspan=7) ──
    const row1Cells = VISIBLE.map(grp => {
        const sepCls = grp.prefix === 'pair-separator'  ? ' pair-separator'
                     : grp.prefix === 'copair-separator' ? ' copair-separator'
                     : grp.prefix === 'pair-indicator'   ? ' pair-separator'  // top header gets a plain separator border (the indicator stripe is on the data-row anchor cell, not the thead)
                     : '';
        return `<th class="set-header ${grp.cssClass} t3-pair-header${sepCls}" colspan="7" data-pair="${grp.dataPair}">${grp.label}</th>`;
    }).join('');

    // ── Row 2: 7 sub-headers per group ──
    const row2Cells = VISIBLE.map(grp => {
        return SUB_LABELS.map((lbl, sIdx) => {
            // The first sub-cell of each group carries the same
            // separator visual as the row-1 group label so the
            // border continues down. Subsequent sub-cells in the
            // group inherit the row's normal styling.
            let sepCls = '';
            if (sIdx === 0) {
                if (grp.prefix === 'pair-separator')   sepCls = ' pair-separator';
                else if (grp.prefix === 'copair-separator') sepCls = ' copair-separator';
                else if (grp.prefix === 'pair-indicator')   sepCls = ' pair-separator';
            }
            return `<th class="set-header ${grp.cssClass} t3-pair-header${sepCls}" data-pair="${grp.dataPair}">${lbl}</th>`;
        }).join('');
    }).join('');

    head.innerHTML = `<tr>${row1Cells}</tr><tr>${row2Cells}</tr>`;
}

function renderTable1() {
    // Build / refresh the thead from T1_COLUMN_GROUPS. Idempotent —
    // safe to run on every render. Slice 2f's dropdown will trigger
    // a full renderTable1() to pick up filtered groups.
    _renderTable1Head();

    // Slice 2f: filter the column-group config by the global
    // pair-family dropdown. Every reference below uses VISIBLE so
    // hidden families drop out of placeholder / data / NEXT rows
    // automatically. Anchor positions, _blockHits indices and end-
    // of-row marker all derive from VISIBLE.length.
    const VISIBLE = _filterVisibleColumnGroups(T1_COLUMN_GROUPS);

    const tbody = document.getElementById('table1Body');
    tbody.innerHTML = '';

    // Render the full history; the .grid-wrapper handles scrolling.
    // Previously this clipped to the last 8 rows, which made older
    // spins invisible. The display cap was a UI choice, not part of
    // the formation/anchor/flash logic — those still operate on the
    // full `spins` array (passed through to _computeT1FlashTargets
    // unchanged below).
    const startIdx = 0;
    const visibleSpins = spins.slice(startIdx);

    // ── T1 Anchor Flash Computation ──
    const t1FlashTargets = _computeT1FlashTargets(spins, startIdx, visibleSpins.length);
    if (window._t1PulseInterval) {
        clearInterval(window._t1PulseInterval);
        window._t1PulseInterval = null;
    }

    // ── Active-side helper (presentation only) ──
    // Returns the active SIDE set (SET_5 or SET_6) for a given actual number,
    // or null when that number is in SET_0 only / not matched.
    // NOTE: this does NOT change formation, anchors, ±1 expansion, or lookup.
    const _getT1ActiveSideSet = (actual) => {
        if (typeof SET_5_NUMS === 'undefined' || typeof SET_6_NUMS === 'undefined') return null;
        if (SET_5_NUMS.has(actual)) return SET_5_NUMS;
        if (SET_6_NUMS.has(actual)) return SET_6_NUMS;
        return null;
    };

    // ── Carry-forward trigger helper (presentation only) ──
    // Walks the spins array backwards and returns the most recent actual
    // number that is in SET_5 or SET_6. Returns null if none exists.
    // Rule (per spec):
    //   - current actual ∈ SET_5/SET_6 → use it directly (loop returns on
    //     the very first iteration).
    //   - current actual ∈ SET_0 / none → walk back to find the most recent
    //     SET_5/SET_6 actual. Consecutive SET_0 rows all resolve to the
    //     same carry-forward trigger until a new SET_5/SET_6 appears.
    // This does NOT alter spin history, table formation, or any other
    // computed value — it only decides which actual number feeds
    // _getT1ActiveSideSet for the NEXT-row highlight.
    const _getT1CarryForwardTrigger = (spinsArr) => {
        if (typeof SET_5_NUMS === 'undefined' || typeof SET_6_NUMS === 'undefined') return null;
        if (!spinsArr || spinsArr.length === 0) return null;
        for (let i = spinsArr.length - 1; i >= 0; i--) {
            const n = spinsArr[i] && spinsArr[i].actual;
            if (typeof n !== 'number') continue;
            if (SET_5_NUMS.has(n) || SET_6_NUMS.has(n)) return n;
        }
        return null;
    };

    // Count how many of the pair's 3 NEXT-row projection anchors fall
    // inside the active-side set. The "projection anchors" are the three
    // lookup-row targets (1st, 2nd, 3rd) displayed in the NEXT row — the
    // same values the user sees. This is the Table 1 ±1 structure: each
    // pair family (prev, prev±1, prev±2, and their 13-opposite variants)
    // already encodes the ±1 anchor expansion at the pair-family level,
    // and getLookupRow returns the three projection anchors for that pair.
    // The green highlight fires when ≥ 2 of these three displayed anchors
    // are in the active side set — it never consults the main Ref anchor
    // alone. No additional ±1/±2 neighborhood expansion is used here.
    const _t1PairActiveCoverage = (refNum, activeSideSet) => {
        if (!activeSideSet) return 0;
        const row = typeof getLookupRow === 'function' ? getLookupRow(refNum) : null;
        if (!row) return 0;
        const targets = [row.first, row.second, row.third];
        let count = 0;
        for (const n of targets) if (activeSideSet.has(n)) count++;
        return count;
    };

    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const row = document.createElement('tr');

        if (idx === 0) {
            // First-row placeholder — N pair groups × 7 cells, with the
            // anchor (cell 0) of each group carrying the prefix class
            // dictated by the config (none / pair-separator /
            // pair-indicator / copair-separator). End-of-row marker
            // appended afterwards.
            const emptyCells = [];
            const totalCells = VISIBLE.length * 7;
            for (let c = 0; c < totalCells; c++) {
                const groupIdx = Math.floor(c / 7);
                const cellIdx  = c % 7;
                if (cellIdx === 0) {
                    const grp = VISIBLE[groupIdx];
                    if (grp.prefix === 'pair-indicator') {
                        emptyCells.push('<td class="pair-indicator"></td>');
                    } else if (grp.prefix === 'pair-separator') {
                        emptyCells.push('<td class="pair-separator"></td>');
                    } else if (grp.prefix === 'copair-separator') {
                        emptyCells.push('<td class="copair-separator"></td>');
                    } else {
                        emptyCells.push('<td></td>');
                    }
                } else {
                    emptyCells.push('<td></td>');
                }
            }
            // End-of-row (last pair) placeholder — <strong> content
            // mirrors anchor cells so the cell has identical content-
            // driven dimensions.
            emptyCells.push('<td class="pair-end-cell anchor-cell"><strong style="visibility:hidden">0</strong></td>');
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

        const renderTargetGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '', addCopairSep = false, stripeLeftHit = null, stripeRightHit = null) => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            // Pair-indicator stripe mode: when both stripeLeftHit and stripeRightHit
            // are non-null, render this cell as the two-stripe pair indicator
            // (replacing the pair-separator/copair-separator border visual).
            // Data rows only. Scope: between-halves positions of each pair.
            const isStripe = (stripeLeftHit !== null && stripeRightHit !== null);
            const anchorClass = 'anchor-cell' +
                (isStripe ? ' pair-indicator' : '') +
                (!isStripe && addSeparator ? ' pair-separator' : '') +
                (!isStripe && addCopairSep ? ' copair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            const stripeAttrs = isStripe
                ? ` data-left-hit="${stripeLeftHit}" data-right-hit="${stripeRightHit}"`
                : '';
            // Slice 2b2: new prevPrev-based pair groups return null
            // for their refNum/anchorNum on rows where prevPrev is
            // unavailable (idx<2). Render those as empty <strong>
            // instead of literal "null" so the cell stays visually
            // blank, matching how the lookup-row miss path below
            // renders its 6 sub-cells with dashes.
            const _anchorContent = (anchorNum === null || anchorNum === undefined || Number.isNaN(anchorNum)) ? '' : anchorNum;
            html.push(`<td class="${anchorClass}"${dp}${stripeAttrs}><strong>${_anchorContent}</strong></td>`);

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

            targets.forEach((target, anchorIdx) => {
                const code = calculatePositionCode(target, spin.actual);
                const isValid = isValidCode(code);
                const displayCode = isValid ? code : 'XX';
                const codeClassBase = getCodeClass(displayCode, isValid);

                const numClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = codeClassBase + (is13Opp ? ' opp13-cell' : '');

                const flashKey = `${relIdx}:${dataPair}:${anchorIdx}`;
                if (t1FlashTargets.has(flashKey)) {
                    // Slice 3b follow-up: only the C (position-code)
                    // cell gets the gold flash. The target-number
                    // cell (1st / 2nd / 3rd) renders normally so the
                    // user's eye lands directly on the matching code.
                    html.push(`<td class="${numClass}"${dp}>${target}</td>`);
                    html.push(`<td class="t1-flash"${dp} style="outline:3px solid #f59e0b !important;outline-offset:-1px !important;position:relative !important;z-index:10 !important;background:#fef3c7 !important;box-shadow:0 0 8px rgba(245,158,11,0.6) !important">${formatPosFlash(displayCode)}</td>`);
                } else {
                    html.push(`<td class="${numClass}"${dp}>${target}</td>`);
                    html.push(`<td class="${codeClass}"${dp}>${displayCode}</td>`);
                }
            });
        };

        // Pair-indicator pre-pass: compute per-block hit state (any non-XX code
        // in the block's 3 projected positions). Used ONLY for the two-stripe
        // visual on the between-halves separator of each pair group.
        // Does NOT alter table-formation or anchor logic.
        // Derived from T1_COLUMN_GROUPS so adding/removing column groups
        // automatically reshapes the hit array. Previously this was a
        // hardcoded list of 12 ref numbers (0, 19, prev, DIGIT_13_OPPOSITES
        // [prev], …); the loop produces the SAME 12 values for the existing
        // config in slice 2b1.
        const prevPrevForRow = idx >= 2 ? spins[idx - 2].actual : null;
        const _blockRefs = VISIBLE.map(g => g.computeRef(prev, prevPrevForRow));
        const _blockHits = _blockRefs.map(r => {
            const lr = (typeof getLookupRow === 'function') ? getLookupRow(r) : null;
            if (!lr) return 0;
            const ts = [lr.first, lr.second, lr.third];
            for (const t of ts) {
                if (isValidCode(calculatePositionCode(t, spin.actual))) return 1;
            }
            return 0;
        });

        // Loop the column-group config and call renderTargetGroup with the
        // same arguments the previous hand-written sequence produced.
        // Each entry's `prefix` is the source of truth for separator /
        // indicator placement; stripes hang off pair-indicator entries
        // and read the previous pair's two _blockHits. End-of-row marker
        // takes the LAST two _blockHits regardless of group count.
        VISIBLE.forEach((grp, i) => {
            const refNum = grp.computeRef(prev, prevPrevForRow);
            const isPairIndicator = (grp.prefix === 'pair-indicator');
            const addSeparator = (grp.prefix === 'pair-separator' || isPairIndicator);
            const addCopairSep = (grp.prefix === 'copair-separator');
            const stripeLeftHit  = isPairIndicator ? _blockHits[i - 2] : null;
            const stripeRightHit = isPairIndicator ? _blockHits[i - 1] : null;
            renderTargetGroup(
                refNum, refNum,
                addSeparator,
                grp.is13Opp,
                grp.dataPair,
                addCopairSep,
                stripeLeftHit,
                stripeRightHit
            );
        });

        // End-of-row pair-indicator for the LAST pair group. Mirrors the
        // between-pair pattern: anchor-cell + pair-end-cell class. The
        // two stripe values come from the last two _blockHits entries
        // regardless of how many column groups are configured.
        const _lastL = _blockHits[VISIBLE.length - 2] || 0;
        const _lastR = _blockHits[VISIBLE.length - 1] || 0;
        html.push(`<td class="pair-end-cell anchor-cell" data-left-hit="${_lastL}" data-right-hit="${_lastR}"><strong style="visibility:hidden">0</strong></td>`);

        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });

    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        // Active side set for NEXT row. Carry-forward rule:
        //   - if the latest actual is in SET_5/SET_6 it's used directly;
        //   - if the latest actual is in SET_0, walk back to the most
        //     recent SET_5/SET_6 actual and use THAT as the trigger;
        //   - if no such spin exists in history, activeSideSet is null
        //     and no pair segment is highlighted.
        // The carry-forward trigger is used ONLY for selecting the
        // active SET_5/SET_6 side — it does NOT change the pair-family
        // anchors on the NEXT row (those still derive from lastSpin).
        const triggerActual = _getT1CarryForwardTrigger(spins);
        const activeSideSet = triggerActual !== null
            ? _getT1ActiveSideSet(triggerActual)
            : null;

        const html = [];

        // Pair families excluded from the active-set green highlight feature.
        //  - 'ref0' / 'ref19' : static anchors, out of scope for this feature.
        // All other pair families (prev, prev_13opp, prevPlus1,
        // prevPlus1_13opp, prevMinus1, prevMinus1_13opp, prevPlus2,
        // prevPlus2_13opp, prevMinus2, prevMinus2_13opp) are eligible.
        // The "±1 only" requirement applies to the neighborhood EXPANSION
        // used inside _t1PairActiveCoverage (expandTargetsToBetNumbers(..., 1)),
        // not to the pair-family selection itself.
        const T1_GREEN_EXCLUDED_PAIRS = new Set(['ref0', 'ref19']);

        const renderNextGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '', addCopairSep = false, asPairIndicator = false) => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            // Pair-match: this pair's ±1-expanded projected numbers cover ≥2
            // members of the active 5/6 set. When true, ALL cells in this
            // pair's NEXT-row segment (anchor + 3 target# + 3 code/dash = 7)
            // get t1-set-match. When false, segment renders unchanged.
            // Exclusion: ref0 and ref19 pair families never receive this
            // highlight — the feature targets the prev-based families only.
            const pairMatch = !!activeSideSet
                && !T1_GREEN_EXCLUDED_PAIRS.has(dataPair)
                && _t1PairActiveCoverage(refNum, activeSideSet) >= 2;
            const matchCls = pairMatch ? ' t1-set-match' : '';

            const anchorClass = ('anchor-cell' +
                (asPairIndicator ? ' pair-indicator' : '') +
                (!asPairIndicator && addSeparator ? ' pair-separator' : '') +
                (!asPairIndicator && addCopairSep ? ' copair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '') +
                matchCls).trim();
            // Slice 2b2: blank when computeRef returned null (new
            // prevPrev-based pairs on a session shorter than 2 spins).
            const _anchorContent = (anchorNum === null || anchorNum === undefined || Number.isNaN(anchorNum)) ? '' : anchorNum;
            html.push(`<td class="${anchorClass}"${dp}><strong>${_anchorContent}</strong></td>`);

            const lookupRow = getLookupRow(refNum);

            if (!lookupRow) {
                const cellClass = ((is13Opp ? 'opp13-cell' : '') + matchCls).trim();
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td><td class="${cellClass}"${dp}>-</td>`);
                return;
            }

            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const cellClass = ((is13Opp ? 'opp13-cell' : '') + matchCls).trim();

            targets.forEach((target) => {
                html.push(`<td class="${cellClass}"${dp}>${target}</td>`);
                html.push(`<td class="${cellClass}"${dp}>-</td>`);
            });
        };

        // NEXT-row projection — drive cells from the same config as
        // the data rows above. The previous form had 12 hand-written
        // renderNextGroup() calls; this loop produces the SAME
        // arguments for the existing 12 groups in slice 2b1.
        // Pair-indicator blocks (prev / prevPlus1 / prevMinus1 /
        // prevPlus2 / prevMinus2) get asPairIndicator=true so the
        // anchor cell renders with the pair-indicator class instead
        // of the pair-separator border.
        // prevPrevForNext is null on a first-spin session (lastSpin
        // is the only entry); the new prevPrev-based groups in slice
        // 2b2 will handle that case via their computeRef.
        const prevPrevForNext = (spins.length >= 2) ? spins[spins.length - 2].actual : null;
        VISIBLE.forEach(grp => {
            const refNum = grp.computeRef(lastSpin, prevPrevForNext);
            const isPairIndicator = (grp.prefix === 'pair-indicator');
            const addSeparator = (grp.prefix === 'pair-separator' || isPairIndicator);
            const addCopairSep = (grp.prefix === 'copair-separator');
            renderNextGroup(refNum, refNum, addSeparator, grp.is13Opp, grp.dataPair, addCopairSep, isPairIndicator);
        });

        // End-of-row pair-end placeholder (white) for the next-row projection.
        html.push('<td class="pair-end-cell anchor-cell"><strong style="visibility:hidden">0</strong></td>');

        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }

    // Slice 3a: pulse animation removed — user reported the
    // glowing/pulsing flash was eye-irritating. The static gold
    // outline + background is baked into each cell's HTML at
    // render time (in renderTargetGroup), so without the interval
    // the highlight stays visible but stops animating.
}

// ═══════════════════════════════════════════════════════════════════
//  TABLE 2 — DATA-DRIVEN COLUMN CONFIG (slice 2d-1)
// ═══════════════════════════════════════════════════════════════════
//
// Same shape as T1_COLUMN_GROUPS but T2-specific. Slice 2d-1 only
// captures the existing 7 column groups (no 13OPP halves, no
// prevPrev-based pairs); slice 2d-2 will reorder + extend to 22
// to match T1.
//
// CRITICAL INVARIANT
// This config MUST reproduce the EXACT same per-cell output as the
// previous hardcoded form for the existing 7 groups in this exact
// order. Each computeRef mirrors the inline math the previous
// renderTable2 used line-for-line — no formation change.
//
// For now T2 has no 13OPP halves and no pair-indicator stripes —
// the prefix vocabulary is just 'none' for the first group and
// 'pair-separator' for every subsequent group, matching the
// original `if (c % 7 === 0 && c > 0)` placeholder loop.
// Slice 2d-2: T2 extended to the 22-column layout matching T1.
// Adds 15 new column groups: 13OPP halves for the 6 prev-based
// pairs, plus PP, PP·13, and the 4 prevPrev-based pair-groups
// (each with a 13OPP half). Same colors as T1 — every refKey
// gets the same color in T2 as in T1 (per user spec "same pair,
// same colour across all the tables").
const T2_COLUMN_GROUPS = [
    {key:'ref0',                    computeRef:()=>0,                                                              cssClass:'set-1',  label:'0',         dataPair:'ref0',                    is13Opp:false, prefix:'none'},
    {key:'ref19',                   computeRef:()=>19,                                                             cssClass:'set-2',  label:'19',        dataPair:'ref19',                   is13Opp:false, prefix:'pair-separator'},

    {key:'prevPlus1',               computeRef:(p)=>Math.min(p+1, 36),                                             cssClass:'set-4',  label:'P+1',       dataPair:'prevPlus1',               is13Opp:false, prefix:'pair-separator'},
    {key:'prevPlus1_13opp',         computeRef:(p)=>DIGIT_13_OPPOSITES[Math.min(p+1, 36)],                         cssClass:'set-4',  label:'P+1-13o', dataPair:'prevPlus1_13opp',         is13Opp:true,  prefix:'copair-separator'},
    {key:'prevMinus1',              computeRef:(p)=>Math.max(p-1, 0),                                              cssClass:'set-5',  label:'P-1',       dataPair:'prevMinus1',              is13Opp:false, prefix:'pair-separator'},
    {key:'prevMinus1_13opp',        computeRef:(p)=>DIGIT_13_OPPOSITES[Math.max(p-1, 0)],                          cssClass:'set-5',  label:'P-1-13o', dataPair:'prevMinus1_13opp',        is13Opp:true,  prefix:'copair-separator'},

    {key:'prevPrevPlus1',           computeRef:(p, pp)=>pp==null?null:Math.min(pp+1, 36),                          cssClass:'set-9',  label:'PP+1',      dataPair:'prevPrevPlus1',           is13Opp:false, prefix:'pair-separator'},
    {key:'prevPrevPlus1_13opp',     computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.min(pp+1, 36)],      cssClass:'set-9',  label:'PP+1-13o',dataPair:'prevPrevPlus1_13opp',     is13Opp:true,  prefix:'copair-separator'},
    {key:'prevPrevMinus1',          computeRef:(p, pp)=>pp==null?null:Math.max(pp-1, 0),                           cssClass:'set-10', label:'PP-1',      dataPair:'prevPrevMinus1',          is13Opp:false, prefix:'pair-separator'},
    {key:'prevPrevMinus1_13opp',    computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.max(pp-1, 0)],       cssClass:'set-10', label:'PP-1-13o',dataPair:'prevPrevMinus1_13opp',    is13Opp:true,  prefix:'copair-separator'},

    {key:'prev',                    computeRef:(p)=>p,                                                             cssClass:'set-3',  label:'P',         dataPair:'prev',                    is13Opp:false, prefix:'pair-separator'},
    {key:'prev_13opp',              computeRef:(p)=>DIGIT_13_OPPOSITES[p],                                         cssClass:'set-3',  label:'P-13o',   dataPair:'prev_13opp',              is13Opp:true,  prefix:'copair-separator'},
    {key:'prevPrev',                computeRef:(p, pp)=>pp==null?null:pp,                                          cssClass:'set-8',  label:'PP',        dataPair:'prevPrev',                is13Opp:false, prefix:'pair-separator'},
    {key:'prevPrev_13opp',          computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[pp],                      cssClass:'set-8',  label:'PP-13o',  dataPair:'prevPrev_13opp',          is13Opp:true,  prefix:'copair-separator'},

    {key:'prevPlus2',               computeRef:(p)=>Math.min(p+2, 36),                                             cssClass:'set-6',  label:'P+2',       dataPair:'prevPlus2',               is13Opp:false, prefix:'pair-separator'},
    {key:'prevPlus2_13opp',         computeRef:(p)=>DIGIT_13_OPPOSITES[Math.min(p+2, 36)],                         cssClass:'set-6',  label:'P+2-13o', dataPair:'prevPlus2_13opp',         is13Opp:true,  prefix:'copair-separator'},
    {key:'prevMinus2',              computeRef:(p)=>Math.max(p-2, 0),                                              cssClass:'set-7',  label:'P-2',       dataPair:'prevMinus2',               is13Opp:false, prefix:'pair-separator'},
    {key:'prevMinus2_13opp',        computeRef:(p)=>DIGIT_13_OPPOSITES[Math.max(p-2, 0)],                          cssClass:'set-7',  label:'P-2-13o', dataPair:'prevMinus2_13opp',        is13Opp:true,  prefix:'copair-separator'},

    {key:'prevPrevPlus2',           computeRef:(p, pp)=>pp==null?null:Math.min(pp+2, 36),                          cssClass:'set-11', label:'PP+2',      dataPair:'prevPrevPlus2',           is13Opp:false, prefix:'pair-separator'},
    {key:'prevPrevPlus2_13opp',     computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.min(pp+2, 36)],      cssClass:'set-11', label:'PP+2-13o',dataPair:'prevPrevPlus2_13opp',     is13Opp:true,  prefix:'copair-separator'},
    {key:'prevPrevMinus2',          computeRef:(p, pp)=>pp==null?null:Math.max(pp-2, 0),                           cssClass:'set-12', label:'PP-2',      dataPair:'prevPrevMinus2',          is13Opp:false, prefix:'pair-separator'},
    {key:'prevPrevMinus2_13opp',    computeRef:(p, pp)=>pp==null?null:DIGIT_13_OPPOSITES[Math.max(pp-2, 0)],       cssClass:'set-12', label:'PP-2-13o',dataPair:'prevPrevMinus2_13opp',    is13Opp:true,  prefix:'copair-separator'},
];

/**
 * Generate T2's <thead> from T2_COLUMN_GROUPS. Same shape as
 * _renderTable1Head — see that function's comment for the
 * design rationale. Idempotent.
 */
function _renderTable2Head() {
    const head = document.getElementById('table2Head');
    if (!head) return;

    const SUB_LABELS = ['Ref', '1st', 'C', '2nd', 'C', '3rd', 'C'];

    // Slice 2f: filter by global pair-family dropdown.
    const VISIBLE = _filterVisibleColumnGroups(T2_COLUMN_GROUPS);

    const row1Cells = VISIBLE.map(grp => {
        const sepCls = grp.prefix === 'pair-separator'   ? ' pair-separator'
                     : grp.prefix === 'copair-separator' ? ' copair-separator'
                     : '';
        return `<th class="set-header ${grp.cssClass} t3-pair-header${sepCls}" colspan="7" data-pair="${grp.dataPair}">${grp.label}</th>`;
    }).join('');

    const row2Cells = VISIBLE.map(grp => {
        return SUB_LABELS.map((lbl, sIdx) => {
            let sepCls = '';
            if (sIdx === 0) {
                if (grp.prefix === 'pair-separator')        sepCls = ' pair-separator';
                else if (grp.prefix === 'copair-separator') sepCls = ' copair-separator';
            }
            return `<th class="set-header ${grp.cssClass} t3-pair-header${sepCls}" data-pair="${grp.dataPair}">${lbl}</th>`;
        }).join('');
    }).join('');

    head.innerHTML = `<tr>${row1Cells}</tr><tr>${row2Cells}</tr>`;
}

function renderTable2() {
    // Build / refresh thead from T2_COLUMN_GROUPS. Same pattern as
    // renderTable1 — slice 2f's dropdown will trigger a re-render
    // to pick up filtered groups.
    _renderTable2Head();

    // Slice 2f: filter by global pair-family dropdown.
    const VISIBLE = _filterVisibleColumnGroups(T2_COLUMN_GROUPS);

    const tbody = document.getElementById('table2Body');
    tbody.innerHTML = '';

    // Render the full history; .grid-wrapper handles scrolling.
    // See renderTable1 for the rationale — this used to clip to the
    // last 8 rows. Formation logic untouched.
    const startIdx = 0;
    const visibleSpins = spins.slice(startIdx);

    // ── T2 Anchor Flash Computation ──
    const t2FlashTargets = _computeT2FlashTargets(spins, startIdx, visibleSpins.length);
    if (window._t2PulseInterval) {
        clearInterval(window._t2PulseInterval);
        window._t2PulseInterval = null;
    }

    visibleSpins.forEach((spin, relIdx) => {
        const idx = startIdx + relIdx;
        const row = document.createElement('tr');

        if (idx === 0) {
            // First-row placeholder — N pair groups × 7 cells. The
            // anchor (cell 0) of each group carries the prefix class
            // dictated by the config (none / pair-separator /
            // copair-separator). For the 7-group T2 in slice 2d-1,
            // that means anchor positions 0,7,14,21,28,35,42 with
            // pair-separator on positions 7..42 — byte-equivalent to
            // the previous `if (c % 7 === 0 && c > 0)` loop.
            const emptyCells = [];
            const totalCells = VISIBLE.length * 7;
            for (let c = 0; c < totalCells; c++) {
                const groupIdx = Math.floor(c / 7);
                const cellIdx  = c % 7;
                if (cellIdx === 0) {
                    const grp = VISIBLE[groupIdx];
                    if (grp.prefix === 'pair-separator') {
                        emptyCells.push('<td class="pair-separator"></td>');
                    } else if (grp.prefix === 'copair-separator') {
                        emptyCells.push('<td class="copair-separator"></td>');
                    } else {
                        emptyCells.push('<td></td>');
                    }
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

        const renderTargetGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '', addCopairSep = false) => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            // Slice 2d-2: copair-separator class supported so the new
            // 13OPP halves of each pair-group can render the subtle
            // white-border within-pair divider, while the main halves
            // keep the bold pair-separator border.
            const anchorClass = 'anchor-cell' +
                (addSeparator ? ' pair-separator' : '') +
                (addCopairSep ? ' copair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            // Blank the cell content when refNum is null (new
            // prevPrev-based groups on a session shorter than 2 spins).
            const _anchorContent = (anchorNum === null || anchorNum === undefined || Number.isNaN(anchorNum)) ? '' : anchorNum;
            html.push(`<td class="${anchorClass}"${dp}><strong>${_anchorContent}</strong></td>`);

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

            targets.forEach((target, anchorIdx) => {
                const code = calculatePositionCode(target, spin.actual);
                const isValid = isValidCode(code);
                const displayCode = isValid ? code : 'XX';
                const codeClassBase = getCodeClass(displayCode, isValid);

                const numClass = is13Opp ? 'opp13-cell' : '';
                const codeClass = codeClassBase + (is13Opp ? ' opp13-cell' : '');

                const flashKey = `${relIdx}:${dataPair}:${anchorIdx}`;
                if (t2FlashTargets.has(flashKey)) {
                    // Slice 3b follow-up: only the C (position-code)
                    // cell flashes — target-number cell renders normally.
                    html.push(`<td class="${numClass}"${dp}>${target}</td>`);
                    html.push(`<td class="t2-flash"${dp} style="outline:3px solid #f59e0b !important;outline-offset:-1px !important;position:relative !important;z-index:10 !important;background:#fef3c7 !important;box-shadow:0 0 8px rgba(245,158,11,0.6) !important">${formatPosFlash(displayCode)}</td>`);
                } else {
                    html.push(`<td class="${numClass}"${dp}>${target}</td>`);
                    html.push(`<td class="${codeClass}"${dp}>${displayCode}</td>`);
                }
            });
        };

        // Drive cells from T2_COLUMN_GROUPS. Slice 2d-2: separate the
        // pair-separator (between pair-groups) from the copair-separator
        // (between main and 13OPP within a pair-group) so the new
        // 13OPP halves render with the subtle within-pair divider.
        const prevPrevForRow = idx >= 2 ? spins[idx - 2].actual : null;
        VISIBLE.forEach((grp) => {
            const refNum = grp.computeRef(prev, prevPrevForRow);
            const addSeparator = (grp.prefix === 'pair-separator');
            const addCopairSep = (grp.prefix === 'copair-separator');
            renderTargetGroup(refNum, refNum, addSeparator, grp.is13Opp, grp.dataPair, addCopairSep);
        });

        row.innerHTML = html.join('');
        tbody.appendChild(row);
    });

    if (spins.length >= 1) {
        const lastSpin = spins[spins.length - 1].actual;
        const html = [];

        const renderNextGroup = (anchorNum, refNum, addSeparator = false, is13Opp = false, dataPair = '', addCopairSep = false) => {
            const dp = dataPair ? ` data-pair="${dataPair}"` : '';
            // Slice 2d-2: copair-separator support; null-handling.
            const anchorClass = 'anchor-cell' +
                (addSeparator ? ' pair-separator' : '') +
                (addCopairSep ? ' copair-separator' : '') +
                (is13Opp ? ' opp13-cell' : '');
            const _anchorContent = (anchorNum === null || anchorNum === undefined || Number.isNaN(anchorNum)) ? '' : anchorNum;
            html.push(`<td class="${anchorClass}"${dp}><strong>${_anchorContent}</strong></td>`);

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

        // NEXT row driven from T2_COLUMN_GROUPS. Slice 2d-2: separate
        // pair-separator and copair-separator the same way the data
        // row above does.
        const prevPrevForNext = (spins.length >= 2) ? spins[spins.length - 2].actual : null;
        VISIBLE.forEach((grp) => {
            const refNum = grp.computeRef(lastSpin, prevPrevForNext);
            const addSeparator = (grp.prefix === 'pair-separator');
            const addCopairSep = (grp.prefix === 'copair-separator');
            renderNextGroup(refNum, refNum, addSeparator, grp.is13Opp, grp.dataPair, addCopairSep);
        });

        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = html.join('');
        tbody.appendChild(nextRow);
    }

    // Slice 3a: pulse animation removed (same as T1).
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

    // Slice 2e-2 + 2f: derive T3 flash refKeys from the
    // FILTERED T3 config so hidden pair-families are excluded from
    // golden-flash detection too (otherwise we'd flash cells the
    // user can't even see).
    const refKeys = _filterVisibleColumnGroups(T3_COLUMN_GROUPS).map(g => g.engineRefKey);

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

    // Slice 3b follow-up #2: highlight ONLY the most recent unbroken
    // ±1 distance chain per refKey. Walk row-pair windows backwards
    // from the latest. While matches continue, accumulate cells.
    // First non-match stops the walk — older chains above the break
    // are NOT highlighted (user: "if cycle breaks we shouldn't
    // highlight the top columns").
    refKeys.forEach(refKey => {
        const pairName = _PAIR_REFKEY_TO_DATA_PAIR[refKey];

        for (let i = rowInfos.length - 2; i >= 0; i--) {
            const upper = rowInfos[i];
            const lower = rowInfos[i + 1];
            const upperPair = upper.info[refKey];
            const lowerPair = lower.info[refKey];

            const upperDists = [];
            const lowerDists = [];
            if (upperPair.pairDist !== null)   upperDists.push({ dist: upperPair.pairDist,   cell: 'pair' });
            if (upperPair.pair13Dist !== null) upperDists.push({ dist: upperPair.pair13Dist, cell: 'pair13Opp' });
            if (lowerPair.pairDist !== null)   lowerDists.push({ dist: lowerPair.pairDist,   cell: 'pair' });
            if (lowerPair.pair13Dist !== null) lowerDists.push({ dist: lowerPair.pair13Dist, cell: 'pair13Opp' });

            if (upperDists.length === 0 || lowerDists.length === 0) {
                // No valid distances — break stops the chain regardless
                // of how far we walked.
                break;
            }

            let matched = null;
            for (const ud of upperDists) {
                for (const ld of lowerDists) {
                    if (Math.abs(ud.dist - ld.dist) <= 1) {
                        matched = { ud, ld };
                        break;
                    }
                }
                if (matched) break;
            }

            if (matched) {
                result.add(`${upper.relIdx}:${refKey}:${matched.ud.cell}`);
                result.add(`${lower.relIdx}:${refKey}:${matched.ld.cell}`);
                if (FLASH_DEBUG_ENABLED) {
                    diagLines.push(`     [${pairName}] window ${i}: ${matched.ud.cell}=${matched.ud.dist} ↔ ${matched.ld.cell}=${matched.ld.dist} ✅`);
                }
            } else {
                break;  // chain broken
            }
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

// ── Table 1 & Table 2 Anchor Column Flash ───────────────────────
// For each pair's 3 anchor columns (1st, 2nd, 3rd from lookup table),
// check last 3 rows. If any TWO of the 3 anchor columns collectively
// have "hits" covering all 3 rows → flash those columns.
// Table 1 hit = position code distance ≤ 1 (valid codes: S+0,SL+1,SR+1,O+0,OL+1,OR+1)
// Table 2 hit = position code distance ≤ 2 (adds SL+2,SR+2,OL+2,OR+2)

const _T1_VALID_CODES = new Set(['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1']);
const _T2_VALID_CODES = new Set(['S+0', 'SL+1', 'SR+1', 'SL+2', 'SR+2', 'O+0', 'OL+1', 'OR+1', 'OL+2', 'OR+2']);

// Slice 2d-2: derive pair-defs for flash detection from the column-
// group configs so the new prevPrev-based pairs (PP+1, PP-1, PP, etc.)
// auto-participate in golden-highlight scanning. Previously these were
// hardcoded sister-arrays that had to be kept in lockstep with the
// renderer's call sequence — a footgun that caused the new pairs to
// silently miss flash detection in slice 2b2 / 2d-2.
//
// computeRef accepts (prev, prevPrev); _computeAnchorFlashTargets
// passes both. Returning null for null-prevPrev rows produces no
// lookup-row, so the flash scan correctly treats those as no-hit.
function _t1PairDefs() {
    // Slice 2f: filter by visible families so hidden pairs don't
    // contribute to T1 flash detection (matching what the user sees).
    return _filterVisibleColumnGroups(T1_COLUMN_GROUPS).map(g => ({
        dataPair: g.dataPair,
        getRefNum: g.computeRef
    }));
}
function _t2PairDefs() {
    // Slice 2f: same filter for T2 flash detection.
    return _filterVisibleColumnGroups(T2_COLUMN_GROUPS).map(g => ({
        dataPair: g.dataPair,
        getRefNum: g.computeRef
    }));
}

/**
 * Core flash computation for Tables 1 & 2.
 * @param {Array} allSpins - full spins array
 * @param {number} startIdx - first visible spin index
 * @param {number} visibleCount - number of visible rows
 * @param {Array} pairDefs - pair definitions [{dataPair, getRefNum}]
 * @param {Set} validCodes - set of valid position codes
 * @returns {Set<string>} flash targets as "relIdx:dataPair:anchorIdx"
 */
function _computeAnchorFlashTargets(allSpins, startIdx, visibleCount, pairDefs, validCodes) {
    const result = new Set();

    if (allSpins.length < 4 || visibleCount < 3) return result;

    // Build row info: for each eligible row, which anchor indices are hits per pair
    const rowInfos = [];
    for (let r = 0; r < visibleCount; r++) {
        const spinIdx = startIdx + r;
        if (spinIdx === 0) continue;  // idx 0 is the empty header row

        const prev = allSpins[spinIdx - 1].actual;
        // Slice 2d-2: prevPrev needed by new prevPrev-based pair computeRefs.
        // Returns null for spinIdx=1 (no spin before prev); the new pairs'
        // computeRef returns null for null-prevPrev, getLookupRow then
        // returns null, and the row is treated as no-hit for those pairs.
        const prevPrev = spinIdx >= 2 ? allSpins[spinIdx - 2].actual : null;
        const actual = allSpins[spinIdx].actual;

        const pairHits = {};  // { dataPair: Set<anchorIdx> }

        pairDefs.forEach(({ dataPair, getRefNum }) => {
            const refNum = getRefNum(prev, prevPrev);
            const lookupRow = getLookupRow(refNum);
            if (!lookupRow) {
                pairHits[dataPair] = new Set();
                return;
            }
            const targets = [lookupRow.first, lookupRow.second, lookupRow.third];
            const hits = new Set();
            targets.forEach((target, anchorIdx) => {
                const code = calculatePositionCode(target, actual);
                if (validCodes.has(code)) {
                    hits.add(anchorIdx);
                }
            });
            pairHits[dataPair] = hits;
        });

        rowInfos.push({ relIdx: r, spinIdx, pairHits });
    }

    // Slice 3b follow-up #2: highlight ONLY the most recent unbroken
    // chain per pair. Walk backwards from the last consecutive-row
    // pair; while matches continue, accumulate cell hits. When the
    // chain breaks, stop — older chains above the break are NOT
    // highlighted (per user spec: "if cycle breaks we shouldn't
    // highlight the top columns").
    if (rowInfos.length < 2) return result;

    const combos = [[0, 1], [0, 2], [1, 2]];

    pairDefs.forEach(({ dataPair }) => {
        // Walk pair-windows from the latest (rowInfos.length-2 / -1)
        // backwards. Stop on first non-match.
        let chainStarted = false;
        for (let i = rowInfos.length - 2; i >= 0; i--) {
            const upper = rowInfos[i];
            const lower = rowInfos[i + 1];
            const upperHits = upper.pairHits[dataPair];
            const lowerHits = lower.pairHits[dataPair];
            if (!upperHits || !lowerHits) {
                if (chainStarted) break; else continue;
            }

            let matchedCombo = null;
            for (const [a, b] of combos) {
                const upperHas = upperHits.has(a) || upperHits.has(b);
                const lowerHas = lowerHits.has(a) || lowerHits.has(b);
                if (upperHas && lowerHas) {
                    matchedCombo = [a, b];
                    break;
                }
            }

            if (matchedCombo) {
                const [a, b] = matchedCombo;
                if (upperHits.has(a)) result.add(`${upper.relIdx}:${dataPair}:${a}`);
                if (upperHits.has(b)) result.add(`${upper.relIdx}:${dataPair}:${b}`);
                if (lowerHits.has(a)) result.add(`${lower.relIdx}:${dataPair}:${a}`);
                if (lowerHits.has(b)) result.add(`${lower.relIdx}:${dataPair}:${b}`);
                chainStarted = true;
            } else {
                // Chain broken (or never started). If the chain had
                // already started, we're done — older windows do not
                // contribute. If we haven't found the latest chain
                // yet, also stop — only the most recent chain is
                // shown per user request.
                break;
            }
        }
    });

    if (result.size > 0) {
        console.log(`⚡ Anchor flash targets: ${result.size} cells`);
    }

    return result;
}

function _computeT1FlashTargets(allSpins, startIdx, visibleCount) {
    return _computeAnchorFlashTargets(allSpins, startIdx, visibleCount, _t1PairDefs(), _T1_VALID_CODES);
}

function _computeT2FlashTargets(allSpins, startIdx, visibleCount) {
    return _computeAnchorFlashTargets(allSpins, startIdx, visibleCount, _t2PairDefs(), _T2_VALID_CODES);
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

    // Slice 2e-2 + 2f: derive from FILTERED T3 config (legacy
    // fallback flash path). Same rationale as _computeFlashTargets
    // above — hidden families don't participate.
    const refKeys = _filterVisibleColumnGroups(T3_COLUMN_GROUPS).map(g => g.engineRefKey);

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
        // Slice 3a: pulse animation removed — static gold stays.
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

// ═══════════════════════════════════════════════════════════════════
//  TABLE 3 — DATA-DRIVEN COLUMN CONFIG (slice 2e-1)
// ═══════════════════════════════════════════════════════════════════
//
// T3 differs from T1/T2 — each pair-group renders 5 cells:
//   Ref / POS / 13opp-Ref / POS / PRJ
// (the 13opp half is INSIDE the group, with a single shared PRJ
// projection column for both halves). T3 also has Dir + Actual
// fixed columns at the start. Slice 2e-1 captures the existing 6
// pair-groups (prev, prevPlus1, prevMinus1, prevPlus2, prevMinus2,
// prevPrev) — slice 2e-2 will reorder + add 4 new prevPrev-based
// pair-groups (PP+1, PP-1, PP+2, PP-2) per the user's "Option A"
// answer.
//
// Differences from T1/T2 configs:
//   - engineRefKey  (snake_case): used to index into the
//                   calculateReferences() output object that T3's
//                   renderer relies on (refs.prev_plus_1 etc).
//                   Mirrors PAIR_REFKEYS.
//   - dataPair      (camelCase):  used for `data-pair` attribute /
//                   pair-clickable selection — same convention as
//                   T1/T2.
//   - label13       header label for the 13-opposite half of the
//                   pair-group ("P-13o", "PP+1-13o", ...).
//   - prefix        same vocabulary as T1/T2 (pair-separator,
//                   none, etc). Slice 2e-1 keeps every group's
//                   first cell as pair-separator so the visual
//                   match the previous hardcoded form.
// Slice 2e-2: T3 extended to 10 pair-groups (Option A — keep T3's
// 5-cell-per-group structure with main+13opp embedded). User's
// 22-column spec collapses to 10 pair-groups when 13opp is embedded:
//   P+1, P-1, PP+1, PP-1, P, PP, P+2, P-2, PP+2, PP-2
// Same color per pair as T1/T2 — every pair has a single colour
// across all three tables.
//
// New pair-groups (PP+1, PP-1, PP+2, PP-2) use the engine's snake_case
// refKeys added in slice 2a (prev_prev_plus_1 / _minus_1 / _plus_2 /
// _minus_2). When prevPrev is unavailable (idx<2), T3's existing
// `calculateReferences(prev, prevPrev || prev)` fallback applies —
// the new pair-group cells render the prev-based fallback values,
// matching the existing PP column's convention.
const T3_COLUMN_GROUPS = [
    {key:'prevPlus1',     engineRefKey:'prev_plus_1',        cssClass:'set-4',  label:'P+1',  label13:'P+1-13o',  dataPair:'prevPlus1',     prefix:'pair-separator'},
    {key:'prevMinus1',    engineRefKey:'prev_minus_1',       cssClass:'set-5',  label:'P-1',  label13:'P-1-13o',  dataPair:'prevMinus1',    prefix:'pair-separator'},
    {key:'prevPrevPlus1', engineRefKey:'prev_prev_plus_1',   cssClass:'set-9',  label:'PP+1', label13:'PP+1-13o', dataPair:'prevPrevPlus1', prefix:'pair-separator'},
    {key:'prevPrevMinus1',engineRefKey:'prev_prev_minus_1',  cssClass:'set-10', label:'PP-1', label13:'PP-1-13o', dataPair:'prevPrevMinus1',prefix:'pair-separator'},
    {key:'prev',          engineRefKey:'prev',               cssClass:'set-3',  label:'P',    label13:'P-13o',    dataPair:'prev',          prefix:'pair-separator'},
    {key:'prevPrev',      engineRefKey:'prev_prev',          cssClass:'set-8',  label:'PP',   label13:'PP-13o',   dataPair:'prevPrev',      prefix:'pair-separator'},
    {key:'prevPlus2',     engineRefKey:'prev_plus_2',        cssClass:'set-6',  label:'P+2',  label13:'P+2-13o',  dataPair:'prevPlus2',     prefix:'pair-separator'},
    {key:'prevMinus2',    engineRefKey:'prev_minus_2',       cssClass:'set-7',  label:'P-2',  label13:'P-2-13o',  dataPair:'prevMinus2',    prefix:'pair-separator'},
    {key:'prevPrevPlus2', engineRefKey:'prev_prev_plus_2',   cssClass:'set-11', label:'PP+2', label13:'PP+2-13o', dataPair:'prevPrevPlus2', prefix:'pair-separator'},
    {key:'prevPrevMinus2',engineRefKey:'prev_prev_minus_2',  cssClass:'set-12', label:'PP-2', label13:'PP-2-13o', dataPair:'prevPrevMinus2',prefix:'pair-separator'},
];

/**
 * Generate T3's <thead> from T3_COLUMN_GROUPS. T3 has only ONE
 * header row (vs T1/T2's two rows): Dir + Actual + 5 sub-headers
 * per pair-group (label / POS / label13 / POS / PRJ).
 *
 * The first pair-group's header does NOT carry pair-separator (to
 * match the existing thead pattern); subsequent groups do.
 *
 * Idempotent — slice 2f's dropdown will trigger re-render to pick
 * up filtered groups.
 */
function _renderTable3Head() {
    const head = document.getElementById('table3Head');
    if (!head) return;
    const cells = [
        '<th>Dir</th>',
        '<th>Actual</th>'
    ];
    // Slice 2f: filter by global pair-family dropdown.
    const VISIBLE = _filterVisibleColumnGroups(T3_COLUMN_GROUPS);
    VISIBLE.forEach((grp, gi) => {
        // Match the existing thead convention: first pair-group
        // omits pair-separator on its label cell; later groups carry
        // it on the FIRST sub-header (the main label).
        const sepCls = (gi > 0) ? ' pair-separator' : '';
        cells.push(
            `<th class="set-header ${grp.cssClass} t3-pair-header${sepCls}" data-pair="${grp.dataPair}">${grp.label}</th>`,
            `<th class="set-header ${grp.cssClass} t3-pair-header" data-pair="${grp.dataPair}">POS</th>`,
            `<th class="set-header ${grp.cssClass} t3-pair-header" data-pair="${grp.dataPair}">${grp.label13}</th>`,
            `<th class="set-header ${grp.cssClass} t3-pair-header" data-pair="${grp.dataPair}">POS</th>`,
            `<th class="set-header ${grp.cssClass} t3-pair-header" data-pair="${grp.dataPair}">PRJ</th>`
        );
    });
    head.innerHTML = `<tr>${cells.join('')}</tr>`;
}

// TABLE 3 - FIXED: Position codes + Visual separators
function renderTable3() {
    // Build / refresh thead from T3_COLUMN_GROUPS (slice 2e-2).
    // Idempotent — slice 2f's dropdown will trigger renderTable3()
    // again whenever the visible-pair set changes.
    _renderTable3Head();

    // Slice 2f: filter the column-group config by the global
    // pair-family dropdown. Used by placeholder / data / NEXT rows
    // below.
    const VISIBLE = _filterVisibleColumnGroups(T3_COLUMN_GROUPS);

    // Clear any existing flash pulse interval before rebuilding DOM
    if (window._pm1PulseInterval) {
        clearInterval(window._pm1PulseInterval);
        window._pm1PulseInterval = null;
    }

    const tbody = document.getElementById('table3Body');
    tbody.innerHTML = '';

    // Render the full history; .grid-wrapper handles scrolling.
    // See renderTable1 for the rationale — this used to clip to the
    // last 8 rows. Formation logic untouched.
    const startIdx = 0;
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
            // First-row placeholder — N pair groups × 5 cells. Anchor
            // (cell 0) of each group carries the prefix class from the
            // config. For the 6-group T3 in slice 2e-1, anchor positions
            // 0,5,10,15,20,25 with pair-separator on every group —
            // byte-equivalent to the previous `if (c % 5 === 0 && c > 0)`
            // placeholder loop (which separator-skipped only c=0; here
            // we keep every group's first cell as pair-separator to
            // match the BODY rows where every group also has a
            // separator on its Ref cell).
            const emptyCells = [];
            const totalCells = VISIBLE.length * 5;
            for (let c = 0; c < totalCells; c++) {
                const groupIdx = Math.floor(c / 5);
                const cellIdx  = c % 5;
                if (cellIdx === 0) {
                    const grp = VISIBLE[groupIdx];
                    if (grp.prefix === 'pair-separator' && groupIdx > 0) {
                        emptyCells.push('<td class="pair-separator"></td>');
                    } else {
                        emptyCells.push('<td></td>');
                    }
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
            
            // Slice 2e-1: derive the per-pair `data` and `projections`
            // maps from T3_COLUMN_GROUPS instead of a hardcoded refKey
            // list. Each entry's engineRefKey indexes into the
            // calculateReferences() output. Same per-cell math as
            // before — no formation change.
            const data = {};
            VISIBLE.forEach(grp => {
                const refKey = grp.engineRefKey;
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

                VISIBLE.forEach(grp => {
                    const refKey = grp.engineRefKey;
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

            // Slice 2e-1: drive the 5-cell-per-group HTML from
            // T3_COLUMN_GROUPS instead of a 30-line hardcoded template
            // literal. Each iteration emits the same Ref / POS / 13Ref
            // / POS / PRJ sequence, with the Ref cell carrying
            // pair-separator (kept on every group as in the previous
            // form, including the first one). Output is byte-equivalent
            // for the existing 6 groups.
            const groupHtml = VISIBLE.map(grp => {
                const refKey = grp.engineRefKey;
                const dp = grp.dataPair;
                return `
                    <td class="${cellClass(refKey, 'pair', true)}" data-pair="${dp}">${data[refKey].ref}</td>
                    ${posCell(refKey, 'pair')}
                    <td class="${cellClass(refKey, 'pair13Opp')}" data-pair="${dp}">${data[refKey].ref13Opp}</td>
                    ${posCell(refKey, 'pair13Opp')}
                    <td class="${projClass(refKey)}" data-pair="${dp}">${projHtml(refKey)}</td>
                `;
            }).join('');

            const _actColor2 = _T3_POS.has(spin.actual) ? '#22c55e' : _T3_NEG.has(spin.actual) ? '#ef4444' : '#94a3b8';
            row.innerHTML = `
                <td class="dir-${spin.direction.toLowerCase()}">${spin.direction}</td>
                <td style="color:${_actColor2}"><strong>${spin.actual}</strong></td>
                ${groupHtml}
            `;
        }

        tbody.appendChild(row);
    });

    // ── ±1 Distance Flash Pulse Animation ───────────────────────────
    // Flash styles are already baked into the initial row HTML via posCell().
    // Here we just start the JS pulse animation to toggle between
    // light amber (#fef3c7) and bright amber (#fbbf24).
    // Slice 3a: pulse animation removed — static gold stays
    // (flash styles are baked inline at render time in posCell()).

    if (spins.length >= 2) {
        const lastSpin = spins[spins.length - 1].actual;
        const lastLastSpin = spins[spins.length - 2].actual;
        
        const refs = calculateReferences(lastSpin, lastLastSpin);
        const lastDirection = spins[spins.length - 1].direction;
        const nextDirection = lastDirection === 'C' ? 'AC' : 'C';
        
        // Slice 2e-1: derive NEXT row data + projections from
        // T3_COLUMN_GROUPS instead of a hardcoded refKey list.
        const data = {};
        VISIBLE.forEach(grp => {
            const refKey = grp.engineRefKey;
            const refNum = refs[refKey];
            const ref13Opp = DIGIT_13_OPPOSITES[refNum];
            data[refKey] = { ref: refNum, ref13Opp: ref13Opp };
        });

        const prevSpin = spins[spins.length - 1];
        const prevPrevSpin = spins[spins.length - 2].actual;
        const prevRefs = calculateReferences(prevPrevSpin, spins.length > 2 ? spins[spins.length - 3].actual : prevPrevSpin);

        const nextProjections = {};
        VISIBLE.forEach(grp => {
            const refKey = grp.engineRefKey;
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
        
        // Slice 2e-1: NEXT row driven from T3_COLUMN_GROUPS. Same
        // 5-cell-per-group pattern as the previous hardcoded form,
        // including pair-separator on every group's Ref cell.
        const nextGroupHtml = VISIBLE.map(grp => {
            const refKey = grp.engineRefKey;
            const dp = grp.dataPair;
            return `
                <td class="pair-separator" data-pair="${dp}">${data[refKey].ref}</td>
                <td data-pair="${dp}">-</td>
                <td data-pair="${dp}">${data[refKey].ref13Opp}</td>
                <td data-pair="${dp}">-</td>
                <td class="col-prj" data-pair="${dp}">${nextProjHtml(refKey)}</td>
            `;
        }).join('');

        const nextRow = document.createElement('tr');
        nextRow.className = 'next-row';
        nextRow.innerHTML = `
            <td class="dir-${nextDirection.toLowerCase()}">${nextDirection}</td>
            <td><strong>NEXT</strong></td>
            ${nextGroupHtml}
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

    // Slice 2f: wire up the global pair-family dropdown.
    _setupPairFilterDropdown();

    // Table collapse/expand toggles
    ['1', '2', '3'].forEach(n => {
        const btn = document.getElementById('toggleTable' + n);
        const wrapper = document.getElementById('gridWrapper' + n);
        if (btn && wrapper) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = wrapper.style.display !== 'none';
                wrapper.style.display = isVisible ? 'none' : 'block';
                btn.textContent = isVisible ? '+' : '−';
            });
        }
    });

    // Prediction results collapse/expand
    const predToggle = document.getElementById('togglePredResults');
    const predContent = document.getElementById('predictionResultsContent');
    if (predToggle && predContent) {
        predToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = predContent.style.display !== 'none';
            predContent.style.display = isVisible ? 'none' : 'block';
            predToggle.textContent = isVisible ? '+' : '−';
        });
    }

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
    
    // Slice 2e-2: derive frontend→backend key map from
    // T3_COLUMN_GROUPS. The AI prediction panel reads
    // tableData.table3NextProjections to learn which T3 pairs are
    // available for selection — without the new prevPrev-based
    // pair-groups in this map, clicking PP+1 / PP-1 / PP+2 / PP-2
    // headers would silently fail with "Pair X not available".
    // Slice 2f: filter by visible families so hidden pairs don't
    // appear in the AI prediction panel's available-pair list either
    // (consistent with their absence from T3's display).
    const keyMap = {};
    _filterVisibleColumnGroups(T3_COLUMN_GROUPS).forEach(g => { keyMap[g.engineRefKey] = g.dataPair; });
    
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
window._computeT2FlashTargets = _computeT2FlashTargets;
window._computeT1FlashTargets = _computeT1FlashTargets;

console.log('✅ NEXT Row Projections Module loaded (V6 + Multi-Table)');
