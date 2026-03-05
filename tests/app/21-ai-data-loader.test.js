/**
 * Test Suite 21: AI Data Loader — 100% Coverage
 *
 * Tests the AIDataLoader class which parses historical spin text files,
 * validates data (already in chronological order), and converts to spin format.
 */

const { AIDataLoader } = require('../../app/ai-data-loader');

describe('AIDataLoader', () => {
    let loader;

    beforeEach(() => {
        loader = new AIDataLoader();
    });

    // ═══════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    describe('constructor', () => {
        test('initializes with empty sessions', () => {
            expect(loader.sessions).toEqual([]);
        });

        test('initializes with isLoaded = false', () => {
            expect(loader.isLoaded).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  parseTextContent
    // ═══════════════════════════════════════════════════════════

    describe('parseTextContent', () => {
        test('parses valid file with numbers 0-36', () => {
            const text = '17\n28\n31\n25\n7';
            const result = loader.parseTextContent(text, 'test.txt');
            // Data is already chronological (top=oldest, bottom=newest)
            expect(result.spins).toEqual([17, 28, 31, 25, 7]);
            expect(result.length).toBe(5);
            expect(result.filename).toBe('test.txt');
        });

        test('handles CRLF line endings', () => {
            const text = '10\r\n20\r\n30';
            const result = loader.parseTextContent(text, 'crlf.txt');
            expect(result.spins).toEqual([10, 20, 30]);
            expect(result.length).toBe(3);
        });

        test('handles trailing whitespace on lines', () => {
            const text = '5  \n10 \n15\t';
            // "5  " -> trimmed "5  " -> parseInt gives 5, but String(5) !== "5  "
            // Actually trimmed: "5" -> parseInt gives 5, String(5) === "5" ✓
            // Wait - the code does: line = lines[i].trim(), then String(num) !== line
            // "5  ".trim() = "5" -> parseInt("5") = 5 -> String(5) = "5" === "5" ✓
            const result = loader.parseTextContent(text, 'ws.txt');
            expect(result.spins).toEqual([5, 10, 15]);
        });

        test('skips blank lines', () => {
            const text = '5\n\n10\n\n15\n';
            const result = loader.parseTextContent(text, 'blanks.txt');
            expect(result.spins).toEqual([5, 10, 15]);
            expect(result.length).toBe(3);
        });

        test('includes zero (0) as a valid number', () => {
            const text = '0\n36\n18';
            const result = loader.parseTextContent(text, 'zero.txt');
            expect(result.spins).toEqual([0, 36, 18]);
        });

        test('includes 36 as valid boundary', () => {
            const text = '36\n0';
            const result = loader.parseTextContent(text, 'boundary.txt');
            expect(result.spins).toEqual([36, 0]);
        });

        test('skips out-of-range values (negative)', () => {
            const text = '-1\n5\n10';
            const result = loader.parseTextContent(text, 'neg.txt');
            expect(result.spins).toEqual([5, 10]);
            expect(result.length).toBe(2);
        });

        test('skips out-of-range values (> 36)', () => {
            const text = '37\n5\n100\n10';
            const result = loader.parseTextContent(text, 'high.txt');
            expect(result.spins).toEqual([5, 10]);
        });

        test('skips non-numeric lines', () => {
            const text = 'abc\n5\nhello\n10';
            const result = loader.parseTextContent(text, 'nonnumeric.txt');
            expect(result.spins).toEqual([5, 10]);
        });

        test('skips float values', () => {
            const text = '5.5\n10\n3.14\n20';
            // "5.5" -> parseInt = 5, String(5) = "5" !== "5.5" → skip
            const result = loader.parseTextContent(text, 'float.txt');
            expect(result.spins).toEqual([10, 20]);
        });

        test('handles single number file', () => {
            const text = '17';
            const result = loader.parseTextContent(text, 'single.txt');
            expect(result.spins).toEqual([17]);
            expect(result.length).toBe(1);
        });

        test('uses default filename when not provided', () => {
            const text = '5\n10';
            const result = loader.parseTextContent(text);
            expect(result.filename).toBe('unknown');
        });

        test('throws on null input', () => {
            expect(() => loader.parseTextContent(null)).toThrow('Empty or invalid content');
        });

        test('throws on undefined input', () => {
            expect(() => loader.parseTextContent(undefined)).toThrow('Empty or invalid content');
        });

        test('throws on empty string', () => {
            expect(() => loader.parseTextContent('')).toThrow('Empty or invalid content');
        });

        test('throws on whitespace-only string', () => {
            expect(() => loader.parseTextContent('   \n  \n  ')).toThrow();
        });

        test('throws on non-string input', () => {
            expect(() => loader.parseTextContent(123)).toThrow('Empty or invalid content');
        });

        test('throws when all lines are invalid', () => {
            const text = 'abc\nxyz\n-5\n99';
            expect(() => loader.parseTextContent(text, 'bad.txt')).toThrow('No valid spin numbers found in file: bad.txt');
        });

        test('error message includes filename', () => {
            try {
                loader.parseTextContent('', 'myfile.txt');
            } catch (e) {
                expect(e.message).toContain('myfile.txt');
            }
        });

        test('handles mixed valid and invalid lines', () => {
            const text = '17\nabc\n28\n-3\n31\n50\n25';
            const result = loader.parseTextContent(text, 'mixed.txt');
            expect(result.spins).toEqual([17, 28, 31, 25]);
            expect(result.length).toBe(4);
        });

        test('skips lines with leading zeros (except "0")', () => {
            const text = '05\n0\n10';
            // "05" -> parseInt = 5, String(5) = "5" !== "05" → skip
            // "0" -> parseInt = 0, String(0) = "0" === "0" ✓
            const result = loader.parseTextContent(text, 'leadzero.txt');
            expect(result.spins).toEqual([0, 10]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  loadMultiple
    // ═══════════════════════════════════════════════════════════

    describe('loadMultiple', () => {
        test('loads multiple files successfully', () => {
            const files = [
                { filename: 'file1.txt', content: '10\n5\n1' },
                { filename: 'file2.txt', content: '20\n15\n12' }
            ];
            const result = loader.loadMultiple(files);
            expect(result.sessions.length).toBe(2);
            expect(result.totalSpins).toBe(6);
            expect(result.errors.length).toBe(0);
        });

        test('sets isLoaded to true when sessions loaded', () => {
            const files = [{ filename: 'f.txt', content: '10\n5' }];
            loader.loadMultiple(files);
            expect(loader.isLoaded).toBe(true);
        });

        test('stores sessions on instance', () => {
            const files = [{ filename: 'f.txt', content: '10\n5' }];
            loader.loadMultiple(files);
            expect(loader.sessions.length).toBe(1);
            expect(loader.sessions[0].filename).toBe('f.txt');
        });

        test('handles per-file errors without failing other files', () => {
            const files = [
                { filename: 'good.txt', content: '10\n5' },
                { filename: 'bad.txt', content: '' },
                { filename: 'good2.txt', content: '20\n15' }
            ];
            const result = loader.loadMultiple(files);
            expect(result.sessions.length).toBe(2);
            expect(result.errors.length).toBe(1);
            expect(result.errors[0]).toContain('bad.txt');
        });

        test('returns correct totalSpins', () => {
            const files = [
                { filename: 'f1.txt', content: '1\n2\n3' },
                { filename: 'f2.txt', content: '4\n5' }
            ];
            const result = loader.loadMultiple(files);
            expect(result.totalSpins).toBe(5);
        });

        test('handles empty array', () => {
            const result = loader.loadMultiple([]);
            expect(result.sessions.length).toBe(0);
            expect(result.totalSpins).toBe(0);
            expect(result.errors.length).toBe(0);
            expect(loader.isLoaded).toBe(false);
        });

        test('handles non-array input', () => {
            const result = loader.loadMultiple('not an array');
            expect(result.sessions).toEqual([]);
            expect(result.errors).toEqual(['Input must be an array']);
        });

        test('handles null input', () => {
            const result = loader.loadMultiple(null);
            expect(result.sessions).toEqual([]);
            expect(result.errors.length).toBe(1);
        });

        test('all files failing returns empty sessions with errors', () => {
            const files = [
                { filename: 'bad1.txt', content: '' },
                { filename: 'bad2.txt', content: 'abc\nxyz' }
            ];
            const result = loader.loadMultiple(files);
            expect(result.sessions.length).toBe(0);
            expect(result.errors.length).toBe(2);
            expect(loader.isLoaded).toBe(false);
        });

        test('overwrites previous sessions on subsequent calls', () => {
            loader.loadMultiple([{ filename: 'f1.txt', content: '1\n2' }]);
            expect(loader.sessions.length).toBe(1);

            loader.loadMultiple([{ filename: 'f2.txt', content: '3\n4' }, { filename: 'f3.txt', content: '5\n6' }]);
            expect(loader.sessions.length).toBe(2);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  toSpinFormat
    // ═══════════════════════════════════════════════════════════

    describe('toSpinFormat', () => {
        test('alternates C/AC starting with C', () => {
            const result = loader.toSpinFormat([5, 10, 15, 20]);
            expect(result).toEqual([
                { direction: 'C', actual: 5 },
                { direction: 'AC', actual: 10 },
                { direction: 'C', actual: 15 },
                { direction: 'AC', actual: 20 }
            ]);
        });

        test('handles single number', () => {
            const result = loader.toSpinFormat([17]);
            expect(result).toEqual([{ direction: 'C', actual: 17 }]);
        });

        test('returns empty array for empty input', () => {
            expect(loader.toSpinFormat([])).toEqual([]);
        });

        test('returns empty array for null input', () => {
            expect(loader.toSpinFormat(null)).toEqual([]);
        });

        test('returns empty array for undefined input', () => {
            expect(loader.toSpinFormat(undefined)).toEqual([]);
        });

        test('returns empty array for non-array input', () => {
            expect(loader.toSpinFormat('not array')).toEqual([]);
        });

        test('preserves numbers including 0 and 36', () => {
            const result = loader.toSpinFormat([0, 36]);
            expect(result[0].actual).toBe(0);
            expect(result[1].actual).toBe(36);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  getAllSpins
    // ═══════════════════════════════════════════════════════════

    describe('getAllSpins', () => {
        test('returns concatenated spins from all sessions', () => {
            loader.loadMultiple([
                { filename: 'f1.txt', content: '3\n2\n1' },
                { filename: 'f2.txt', content: '6\n5\n4' }
            ]);
            const all = loader.getAllSpins();
            // No reversal — data is already chronological (top=oldest)
            expect(all).toEqual([3, 2, 1, 6, 5, 4]);
        });

        test('returns empty array when no sessions loaded', () => {
            expect(loader.getAllSpins()).toEqual([]);
        });

        test('returns single session spins', () => {
            loader.loadMultiple([{ filename: 'f1.txt', content: '10\n5' }]);
            expect(loader.getAllSpins()).toEqual([10, 5]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  reset
    // ═══════════════════════════════════════════════════════════

    describe('reset', () => {
        test('clears sessions', () => {
            loader.loadMultiple([{ filename: 'f.txt', content: '1\n2\n3' }]);
            expect(loader.sessions.length).toBe(1);

            loader.reset();
            expect(loader.sessions).toEqual([]);
        });

        test('sets isLoaded to false', () => {
            loader.loadMultiple([{ filename: 'f.txt', content: '1\n2\n3' }]);
            expect(loader.isLoaded).toBe(true);

            loader.reset();
            expect(loader.isLoaded).toBe(false);
        });

        test('getAllSpins returns empty after reset', () => {
            loader.loadMultiple([{ filename: 'f.txt', content: '1\n2\n3' }]);
            loader.reset();
            expect(loader.getAllSpins()).toEqual([]);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  INTEGRATION
    // ═══════════════════════════════════════════════════════════

    describe('integration', () => {
        test('full pipeline: load → getAllSpins → toSpinFormat', () => {
            const files = [
                { filename: 'session1.txt', content: '17\n28\n31' },
                { filename: 'session2.txt', content: '5\n10' }
            ];
            const result = loader.loadMultiple(files);
            expect(result.sessions.length).toBe(2);
            expect(result.totalSpins).toBe(5);

            const allSpins = loader.getAllSpins();
            // No reversal — data stays in file order (top=oldest)
            expect(allSpins).toEqual([17, 28, 31, 5, 10]);

            const spinFormat = loader.toSpinFormat(allSpins);
            expect(spinFormat.length).toBe(5);
            expect(spinFormat[0]).toEqual({ direction: 'C', actual: 17 });
            expect(spinFormat[1]).toEqual({ direction: 'AC', actual: 28 });
        });

        test('load → reset → load again works correctly', () => {
            loader.loadMultiple([{ filename: 'f1.txt', content: '1\n2' }]);
            expect(loader.isLoaded).toBe(true);

            loader.reset();
            expect(loader.isLoaded).toBe(false);

            loader.loadMultiple([{ filename: 'f2.txt', content: '3\n4\n5' }]);
            expect(loader.isLoaded).toBe(true);
            expect(loader.sessions.length).toBe(1);
            expect(loader.getAllSpins()).toEqual([3, 4, 5]);
        });
    });
});
