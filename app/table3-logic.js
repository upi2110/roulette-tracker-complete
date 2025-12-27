// TABLE3 LOGIC
// Current projection system using 8-anchor generation with position codes
// This is the existing working system

function generateAnchorsTable3(refNum, ref13Opp, prevPosCode, getNumberAtPosition, flipPositionCode, REGULAR_OPPOSITES) {
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

function expandAnchorsToBetNumbersTable3(purpleAnchors, greenAnchors, WHEEL_NO_ZERO) {
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

function renderTable3Row(spin, idx, spins, refs, DIGIT_13_OPPOSITES, getNumberAtPosition, flipPositionCode, REGULAR_OPPOSITES, WHEEL_NO_ZERO) {
    if (idx < 2) return null;
    
    const prevSpin = spins[idx - 1];
    const prevPrevSpin = spins[idx - 2].actual;
    
    const prevRefs = {
        prev: prevPrevSpin,
        prev_plus_1: Math.min(prevPrevSpin + 1, 36),
        prev_minus_1: Math.max(prevPrevSpin - 1, 0),
        prev_plus_2: Math.min(prevPrevSpin + 2, 36),
        prev_minus_2: Math.max(prevPrevSpin - 2, 0),
        prev_prev: spins.length > 2 ? spins[idx - 3]?.actual || prevPrevSpin : prevPrevSpin
    };
    
    const projections = {};
    
    ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'].forEach(refKey => {
        const prevRefNum = prevRefs[refKey];
        const prevRef13Opp = DIGIT_13_OPPOSITES[prevRefNum];
        
        const prevPair = calculatePositionCode(prevRefNum, prevSpin.actual);
        const prevPair13 = calculatePositionCode(prevRef13Opp, prevSpin.actual);
        const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;
        
        const { purple, green } = generateAnchorsTable3(
            refs[refKey], 
            DIGIT_13_OPPOSITES[refs[refKey]], 
            usePosCode,
            getNumberAtPosition,
            flipPositionCode,
            REGULAR_OPPOSITES
        );
        
        const betNumbers = expandAnchorsToBetNumbersTable3(purple, green, WHEEL_NO_ZERO);
        const isHit = betNumbers.includes(spin.actual);
        
        projections[refKey] = { purple, green, betNumbers, isHit };
    });
    
    return projections;
}

// Helper function needed for Table3
function calculatePositionCode(reference, actual) {
    const WHEEL_NO_ZERO = [26,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const REGULAR_OPPOSITES = {
        0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
        10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
        19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
        28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
    };
    
    if (reference === actual) return 'S+0';
    
    const refNum = reference === 0 ? 26 : reference;
    const actNum = actual === 0 ? 26 : actual;
    
    const refIdx = WHEEL_NO_ZERO.indexOf(refNum);
    const actIdx = WHEEL_NO_ZERO.indexOf(actNum);
    
    const leftDist = (refIdx - actIdx + 37) % 37;
    const rightDist = (actIdx - refIdx + 37) % 37;
    
    if (leftDist >= 1 && leftDist <= 4) return `SL+${leftDist}`;
    if (rightDist >= 1 && rightDist <= 4) return `SR+${rightDist}`;
    
    const opposite = REGULAR_OPPOSITES[reference];
    if (actual === opposite) return 'O+0';
    
    const oppNum = opposite === 0 ? 26 : opposite;
    const oppIdx = WHEEL_NO_ZERO.indexOf(oppNum);
    
    const leftDistOpp = (oppIdx - actIdx + 37) % 37;
    const rightDistOpp = (actIdx - oppIdx + 37) % 37;
    
    if (leftDistOpp >= 1 && leftDistOpp <= 4) return `OL+${leftDistOpp}`;
    if (rightDistOpp >= 1 && rightDistOpp <= 4) return `OR+${rightDistOpp}`;
    
    return 'XX';
}
