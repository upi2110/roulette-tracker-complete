// Lookup table for Table1 and Table2 projections
// Format: [Number, 1st, 2nd, 3rd]
const LOOKUP_TABLE = [
    [0, 13, 20, 26],
    [32, 36, 14, 32],
    [15, 11, 31, 15],
    [19, 30, 9, 19],
    [4, 8, 22, 4],
    [21, 23, 18, 21],
    [2, 10, 29, 2],
    [25, 5, 7, 25],
    [17, 24, 28, 17],
    [34, 16, 12, 34],
    [6, 33, 35, 6],
    [27, 1, 3, 27],
    [13, 20, 26, 13],
    [36, 14, 32, 36],
    [11, 31, 15, 11],
    [30, 9, 19, 30],
    [8, 22, 4, 8],
    [23, 18, 21, 23],
    [10, 29, 2, 10],
    [5, 7, 25, 5],
    [24, 28, 17, 24],
    [16, 12, 34, 16],
    [33, 35, 6, 33],
    [1, 3, 27, 1],
    [20, 26, 13, 20],
    [14, 32, 36, 14],
    [31, 15, 11, 31],
    [9, 19, 30, 9],
    [22, 4, 8, 22],
    [18, 21, 23, 18],
    [29, 2, 10, 29],
    [7, 25, 5, 7],
    [28, 17, 24, 28],
    [12, 34, 16, 12],
    [35, 6, 33, 35],
    [3, 27, 1, 3],
    [26, 13, 20, 26]
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
