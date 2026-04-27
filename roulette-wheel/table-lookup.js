// Lookup table for Table1 and Table2 projections
// Format: [Number, 1st, 2nd, 3rd]
const LOOKUP_TABLE = [
    [0, 13, 20, 26],
    [32, 36, 14, 0],
    [15, 11, 31, 32],
    [19, 30, 9, 15],
    [4, 8, 22, 19],
    [21, 23, 18, 4],
    [2, 10, 29, 21],
    [25, 5, 7, 2],
    [17, 24, 28, 25],
    [34, 16, 12, 17],
    [6, 33, 35, 34],
    [27, 1, 3, 6],
    [13, 20, 26, 27],
    [36, 14, 0, 13],
    [11, 31, 32, 36],
    [30, 9, 15, 11],
    [8, 22, 19, 30],
    [23, 18, 4, 8],
    [10, 29, 21, 23],
    [5, 7, 2, 10],
    [24, 28, 25, 5],
    [16, 12, 17, 24],
    [33, 35, 34, 16],
    [1, 3, 6, 33],
    [20, 26, 27, 1],
    [14, 0, 13, 20],
    [31, 32, 36, 14],
    [9, 15, 11, 31],
    [22, 19, 30, 9],
    [18, 4, 8, 22],
    [29, 21, 23, 18],
    [7, 2, 10, 29],
    [28, 25, 5, 7],
    [12, 17, 24, 28],
    [35, 34, 16, 12],
    [3, 6, 33, 35],
    [26, 27, 1, 3]
];

// Get the row from lookup table for a given number
function getLookupRow(num) {
    const row = LOOKUP_TABLE.find(r => r[0] === num);
    return row ? { first: row[1], second: row[2], third: row[3] } : null;
}

// Map position code to column in lookup table
function getColumnForPositionCode(posCode) {
    const mapping = {
        'S+0': 'first',
        'SL+1': 'first',
        'SL-1': 'first', 
        'SR+1': 'first',
        'SR-1': 'first',
        'OR+1': 'second',
        'OR-1': 'second',
        'OL+1': 'second',
        'OL-1': 'second',
        'O+0': 'third',
        // Table2 extended codes
        'SR+2': 'first',
        'SR-2': 'first',
        'SL+2': 'first',
        'SL-2': 'first',
        'OR+2': 'second',
        'OR-2': 'second',
        'OL+2': 'second',
        'OL-2': 'second'
    };
    return mapping[posCode] || null;
}

// Get projection number from lookup table
function getProjectionFromLookup(refNum, posCode) {
    if (posCode === 'XX') return null;
    
    const column = getColumnForPositionCode(posCode);
    if (!column) return null;
    
    const row = getLookupRow(refNum);
    if (!row) return null;
    
    return row[column];
}
