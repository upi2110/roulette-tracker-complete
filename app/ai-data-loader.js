/**
 * AI Data Loader — Parse historical spin text files for training
 *
 * File format: One number per line (0-36), oldest result on top, newest at bottom.
 * Data is already in chronological order — no reversal needed.
 */

class AIDataLoader {
    constructor() {
        this.sessions = [];     // Array of { filename, spins: number[], length }
        this.isLoaded = false;
    }

    /**
     * Parse raw text content from a spin data file.
     * Validates each line is an integer 0-36.
     * Data is already chronological (oldest on top, newest at bottom).
     *
     * @param {string} text - Raw text content, one number per line
     * @param {string} [filename='unknown'] - Source filename
     * @returns {{ filename: string, spins: number[], length: number }}
     * @throws {Error} if text is empty or no valid numbers found
     */
    parseTextContent(text, filename = 'unknown') {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error(`Empty or invalid content in file: ${filename}`);
        }

        const lines = text.split(/\r?\n/);
        const numbers = [];
        const errors = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue; // skip blank lines

            const num = parseInt(line, 10);
            if (isNaN(num) || num < 0 || num > 36 || String(num) !== line) {
                errors.push(`Line ${i + 1}: invalid value "${line}"`);
                continue;
            }
            numbers.push(num);
        }

        if (numbers.length === 0) {
            throw new Error(`No valid spin numbers found in file: ${filename}. Errors: ${errors.join('; ')}`);
        }

        // Data is already chronological (top = oldest, bottom = newest)
        return {
            filename,
            spins: numbers,
            length: numbers.length
        };
    }

    /**
     * Load multiple historical sessions from an array of {filename, content} objects.
     *
     * @param {Array<{filename: string, content: string}>} files
     * @returns {{ sessions: Array, totalSpins: number, errors: string[] }}
     */
    loadMultiple(files) {
        const sessions = [];
        const errors = [];
        let totalSpins = 0;

        if (!Array.isArray(files)) {
            return { sessions: [], totalSpins: 0, errors: ['Input must be an array'] };
        }

        for (const file of files) {
            try {
                const session = this.parseTextContent(file.content, file.filename);
                sessions.push(session);
                totalSpins += session.length;
            } catch (err) {
                errors.push(`${file.filename}: ${err.message}`);
            }
        }

        this.sessions = sessions;
        this.isLoaded = sessions.length > 0;

        return { sessions, totalSpins, errors };
    }

    /**
     * Convert an array of spin numbers to the same format as window.spins.
     * Alternates C/AC direction starting with C.
     *
     * @param {number[]} numbers - Chronological spin numbers
     * @returns {Array<{direction: string, actual: number}>}
     */
    toSpinFormat(numbers) {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return [];
        }
        return numbers.map((num, i) => ({
            direction: i % 2 === 0 ? 'C' : 'AC',
            actual: num
        }));
    }

    /**
     * Get all sessions' spin numbers combined into one chronological array.
     * @returns {number[]}
     */
    getAllSpins() {
        const all = [];
        for (const session of this.sessions) {
            all.push(...session.spins);
        }
        return all;
    }

    /**
     * Reset all loaded data.
     */
    reset() {
        this.sessions = [];
        this.isLoaded = false;
    }
}

// Export for both browser and Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIDataLoader };
}
if (typeof window !== 'undefined') {
    window.AIDataLoader = AIDataLoader;
}

console.log('✅ AI Data Loader script loaded');
