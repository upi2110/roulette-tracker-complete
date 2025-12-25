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

        function calculatePositionCode(reference, actual) {
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
            
            // Determine starting index
            let startIdx;
            if (side === 'S') {
                startIdx = refIdx;
            } else {
                const oppNum = REGULAR_OPPOSITES[refNum];
                const opp = oppNum === 0 ? 26 : oppNum;
                startIdx = (opp === 26) ? 0 : WHEEL_NO_ZERO.indexOf(opp);
            }
            
            // Traverse the wheel, treating 0/26 as one position
            let currentIdx = startIdx;
            let stepsRemaining = distance;
            const moveDirection = (sign === '+') ? 
                (direction === 'R' ? 1 : -1) : 
                (direction === 'R' ? -1 : 1);
            
            let skippedZero = false; // Track if we've already skipped zero in this traversal
            
            while (stepsRemaining > 0) {
                currentIdx = ((currentIdx + moveDirection) % 37 + 37) % 37;
                const currentNum = WHEEL_NO_ZERO[currentIdx];
                
                // Skip 0/26 only ONCE during the entire traversal
                if (currentNum === 26 && !skippedZero) {
                    skippedZero = true;
                    // Don't decrement steps, just continue
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

            console.log('DEBUG anchors:', refNum, ref13Opp, prevPosCode, '→', a1, a2, a3, a4);

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
            const tbody = document.getElementById('gridBody');
            tbody.innerHTML = '';
            
            spins.forEach((spin, idx) => {
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
                    
                    // Function to get projection cell class (hit/miss/default)
                    const projClass = (key) => {
                        if (!projections[key]) return 'col-prj';
                        return projections[key].isHit ? 'col-prj-hit' : 'col-prj-miss';
                    };
                    
                    // NEW LOGIC: Highlight ref and pair when PAIR is not XX (each independently)
                    // For P
                    const hasPos1_ref = data.prev.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos1_pair = data.prev.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos1_13ref = data.prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    const hasPos1_13pair = data.prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    
                    // For P+1
                    const hasPos2_ref = data.prev_plus_1.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos2_pair = data.prev_plus_1.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos2_13ref = data.prev_plus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    const hasPos2_13pair = data.prev_plus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    
                    // For P-1
                    const hasPos3_ref = data.prev_minus_1.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos3_pair = data.prev_minus_1.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos3_13ref = data.prev_minus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    const hasPos3_13pair = data.prev_minus_1.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    
                    // For P+2
                    const hasPos4_ref = data.prev_plus_2.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos4_pair = data.prev_plus_2.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos4_13ref = data.prev_plus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    const hasPos4_13pair = data.prev_plus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    
                    // For P-2
                    const hasPos5_ref = data.prev_minus_2.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos5_pair = data.prev_minus_2.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos5_13ref = data.prev_minus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    const hasPos5_13pair = data.prev_minus_2.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    
                    // For P2
                    const hasPos6_ref = data.prev_prev.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos6_pair = data.prev_prev.pair !== 'XX' ? 'cell-has-position' : '';
                    const hasPos6_13ref = data.prev_prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    const hasPos6_13pair = data.prev_prev.pair13Opp !== 'XX' ? 'cell-has-position' : '';
                    
                    const projHtml = (key) => {
                        if (!projections[key]) return '';
                        const p = projections[key];
                        const purpleHtml = p.purple.map(a => `<span class="anchor-purple">${a}</span>`).join(' ');
                        const greenHtml = p.green.map(a => `<span class="anchor-green">${a}</span>`).join(' ');
                        // Stack purple on top, green on bottom
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
            
            if (spins.length > 0) {
                const lastSpin = spins[spins.length - 1];
                const prevSpin = spins.length > 1 ? spins[spins.length - 2].actual : lastSpin.actual;
                
                const nextRefs = calculateReferences(lastSpin.actual, prevSpin);
                
                const nextProjections = {};
                if (spins.length > 1) {
                    const lastRefs = calculateReferences(prevSpin, spins.length > 2 ? spins[spins.length - 3].actual : prevSpin);
                    
                    ['prev', 'prev_plus_1', 'prev_minus_1', 'prev_plus_2', 'prev_minus_2', 'prev_prev'].forEach(refKey => {
                        const lastRefNum = lastRefs[refKey];
                        const lastRef13Opp = DIGIT_13_OPPOSITES[lastRefNum];
                        
                        const lastPair = calculatePositionCode(lastRefNum, lastSpin.actual);
                        const lastPair13 = calculatePositionCode(lastRef13Opp, lastSpin.actual);
                        const usePosCode = lastPair !== 'XX' ? lastPair : lastPair13;
                        
                        const { purple, green } = generateAnchors(nextRefs[refKey], DIGIT_13_OPPOSITES[nextRefs[refKey]], usePosCode);
                        
                        nextProjections[refKey] = { purple, green };
                    });
                }
                
                const projHtmlNext = (key) => {
                    if (!nextProjections[key]) return '';
                    const p = nextProjections[key];
                    const purpleHtml = p.purple.map(a => `<span class="anchor-purple">${a}</span>`).join(' ');
                    const greenHtml = p.green.map(a => `<span class="anchor-green">${a}</span>`).join(' ');
                    // Stack purple on top, green on bottom
                    return `<div>${purpleHtml}</div>${p.green.length > 0 ? '<div>' + greenHtml + '</div>' : ''}`;
                };
                
                const nextRow = document.createElement('tr');
                nextRow.className = 'next-row';
                nextRow.innerHTML = `
                    <td colspan="2"><strong>NEXT</strong></td>
                    <td class="set-cell-1">${nextRefs.prev}</td>
                    <td class="set-cell-1"></td>
                    <td class="set-cell-1">${DIGIT_13_OPPOSITES[nextRefs.prev]}</td>
                    <td class="set-cell-1"></td>
                    <td class="set-cell-1-last col-prj">${projHtmlNext('prev')}</td>
                    <td class="set-cell-2">${nextRefs.prev_plus_1}</td>
                    <td class="set-cell-2"></td>
                    <td class="set-cell-2">${DIGIT_13_OPPOSITES[nextRefs.prev_plus_1]}</td>
                    <td class="set-cell-2"></td>
                    <td class="set-cell-2-last col-prj">${projHtmlNext('prev_plus_1')}</td>
                    <td class="set-cell-3">${nextRefs.prev_minus_1}</td>
                    <td class="set-cell-3"></td>
                    <td class="set-cell-3">${DIGIT_13_OPPOSITES[nextRefs.prev_minus_1]}</td>
                    <td class="set-cell-3"></td>
                    <td class="set-cell-3-last col-prj">${projHtmlNext('prev_minus_1')}</td>
                    <td class="set-cell-4">${nextRefs.prev_plus_2}</td>
                    <td class="set-cell-4"></td>
                    <td class="set-cell-4">${DIGIT_13_OPPOSITES[nextRefs.prev_plus_2]}</td>
                    <td class="set-cell-4"></td>
                    <td class="set-cell-4-last col-prj">${projHtmlNext('prev_plus_2')}</td>
                    <td class="set-cell-5">${nextRefs.prev_minus_2}</td>
                    <td class="set-cell-5"></td>
                    <td class="set-cell-5">${DIGIT_13_OPPOSITES[nextRefs.prev_minus_2]}</td>
                    <td class="set-cell-5"></td>
                    <td class="set-cell-5-last col-prj">${projHtmlNext('prev_minus_2')}</td>
                    <td class="set-cell-6">${nextRefs.prev_prev}</td>
                    <td class="set-cell-6"></td>
                    <td class="set-cell-6">${DIGIT_13_OPPOSITES[nextRefs.prev_prev]}</td>
                    <td class="set-cell-6"></td>
                    <td class="set-cell-6-last col-prj">${projHtmlNext('prev_prev')}</td>
                `;
                tbody.appendChild(nextRow);
            }
            
            document.getElementById('info').textContent = `Spins: ${spins.length}`;
        }

        document.getElementById('spinNumber').addEventListener('keypress', e => {
            if (e.key === 'Enter') addSpin();
        });

        render();

        // Button event listeners
        document.getElementById('addBtn').addEventListener('click', addSpin);
        document.getElementById('undoBtn').addEventListener('click', undoLast);
        document.getElementById('resetBtn').addEventListener('click', resetAll);
