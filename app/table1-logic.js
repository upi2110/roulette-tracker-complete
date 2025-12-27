// TABLE1 LOGIC
// Uses lookup table with position codes: S+0, SL+1, SL-1, SR+1, SR-1, OR+1, OR-1, OL-1, OL+1, O+0
// Works with P, P-13OPP pairs (and P+1, P-1, P+2, P-2 pairs)

function calculateTable1Projections(refs, digit13Opp, prevPosCode) {
    if (prevPosCode === 'XX') return null;
    
    // Valid position codes for Table1
    const validCodes = ['S+0', 'SL+1', 'SL-1', 'SR+1', 'SR-1', 'OR+1', 'OR-1', 'OL+1', 'OL-1', 'O+0'];
    
    if (!validCodes.includes(prevPosCode)) return null;
    
    const results = {};
    
    // For each reference type (prev, prev_plus_1, prev_minus_1, prev_plus_2, prev_minus_2)
    ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2'].forEach(refKey => {
        const refNum = refs[refKey];
        const ref13Opp = digit13Opp[refNum];
        
        // Get projection for P
        const projP = getProjectionFromLookup(refNum, prevPosCode);
        
        // Get projection for P-13OPP
        const projP13 = getProjectionFromLookup(ref13Opp, prevPosCode);
        
        results[refKey] = {
            p: projP,
            p13: projP13
        };
    });
    
    return results;
}

function renderTable1Row(spin, idx, spins, refs, digit13Opp, calculatePositionCode) {
    if (idx < 2) return null; // Need at least 2 previous spins
    
    const prevSpin = spins[idx - 1];
    const prevPrevSpin = spins[idx - 2].actual;
    
    // Get previous references
    const prevRefs = {
        prev: prevPrevSpin,
        prev_plus_1: Math.min(prevPrevSpin + 1, 36),
        prev_minus_1: Math.max(prevPrevSpin - 1, 0),
        prev_plus_2: Math.min(prevPrevSpin + 2, 36),
        prev_minus_2: Math.max(prevPrevSpin - 2, 0)
    };
    
    const projections = {};
    
    ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2'].forEach(refKey => {
        const prevRefNum = prevRefs[refKey];
        const prevRef13Opp = digit13Opp[prevRefNum];
        
        // Get position codes from previous row
        const prevPair = calculatePositionCode(prevRefNum, prevSpin.actual);
        const prevPair13 = calculatePositionCode(prevRef13Opp, prevSpin.actual);
        
        // Use whichever is not XX
        const usePosCode = prevPair !== 'XX' ? prevPair : prevPair13;
        
        // Calculate Table1 projections
        const table1Proj = calculateTable1Projections(refs, digit13Opp, usePosCode);
        
        if (table1Proj && table1Proj[refKey]) {
            projections[refKey] = {
                p: table1Proj[refKey].p,
                p13: table1Proj[refKey].p13,
                posCode: usePosCode
            };
        }
    });
    
    return projections;
}
