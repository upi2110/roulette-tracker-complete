/**
 * VerboseLogger — Writes detailed decision logs to app/logs/ in real-time via IPC.
 *
 * Only active when `enabled` is true (toggled via UI checkbox).
 * Each log() call immediately appends to the current session log file.
 * Survives crashes — logs are written to disk as they happen.
 *
 * Log format per line:
 *   [HH:MM:SS.mmm] [SOURCE] [LEVEL] message | {json data}
 *
 * Usage:
 *   window.verboseLogger.enabled = true;
 *   window.verboseLogger.startSession();
 *   window.verboseLogger.log('ENGINE', 'DECISION', 'Step1 T3 Flash', { ... });
 *   window.verboseLogger.endSession();
 */

class VerboseLogger {
    constructor() {
        this.enabled = false;
        this._currentLogFile = null;
        this._buffer = [];        // Fallback buffer when IPC not available
        this._sessionActive = false;
        this._lineCount = 0;
    }

    /**
     * Start a new log session. Creates a new log file on disk.
     */
    startSession() {
        if (!this.enabled) return;
        const now = new Date();
        const ts = now.toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
        this._currentLogFile = `session-${ts}.log`;
        this._sessionActive = true;
        this._lineCount = 0;
        this._buffer = [];

        const header = [
            '═'.repeat(80),
            `  VERBOSE SESSION LOG`,
            `  Started: ${now.toISOString()}`,
            `  File: ${this._currentLogFile}`,
            '═'.repeat(80),
            ''
        ].join('\n');

        this._writeToFile(header);
        console.log(`[VERBOSE] Log session started → logs/${this._currentLogFile}`);
    }

    /**
     * Log a message. Writes to disk immediately if IPC available, otherwise buffers.
     * @param {string} source - 'ENGINE' | 'ORCH' | 'MONEY' | 'RECORDER' | 'UI'
     * @param {string} level - 'INFO' | 'DEBUG' | 'DECISION' | 'RESULT' | 'WARN' | 'ERROR'
     * @param {string} message - Human-readable description
     * @param {Object} [data] - Structured data to log (JSON-serialized)
     */
    log(source, level, message, data) {
        if (!this.enabled) return;

        const now = new Date();
        const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
        const src = String(source).padEnd(8);
        const lvl = String(level).padEnd(8);

        let line = `[${time}] [${src}] [${lvl}] ${message}`;
        if (data !== undefined && data !== null) {
            try {
                const json = JSON.stringify(data, null, 0);
                // Truncate very long data lines to keep logs readable
                line += ` | ${json.length > 2000 ? json.substring(0, 2000) + '...(truncated)' : json}`;
            } catch (e) {
                line += ` | [JSON error: ${e.message}]`;
            }
        }

        this._lineCount++;

        // Always log to console in verbose mode
        const consoleStyle = level === 'ERROR' ? 'color: red' :
                            level === 'WARN' ? 'color: orange' :
                            level === 'DECISION' ? 'color: #2196F3; font-weight: bold' :
                            level === 'RESULT' ? 'color: #4CAF50; font-weight: bold' :
                            'color: #888';
        console.log(`%c[VERBOSE] ${line}`, consoleStyle);

        // Write to file
        this._writeToFile(line + '\n');
    }

    /**
     * Log a section separator (for readability).
     */
    logSeparator(title) {
        if (!this.enabled) return;
        const sep = `\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`;
        this._writeToFile(sep + '\n');
    }

    /**
     * End the current log session. Writes summary and closes.
     */
    endSession(summary) {
        if (!this.enabled || !this._sessionActive) return;

        const footer = [
            '',
            '═'.repeat(80),
            `  SESSION ENDED: ${new Date().toISOString()}`,
            `  Total log lines: ${this._lineCount}`,
            summary ? `  Summary: ${JSON.stringify(summary)}` : '',
            '═'.repeat(80)
        ].filter(Boolean).join('\n');

        this._writeToFile(footer + '\n');
        this._sessionActive = false;

        // Flush any remaining buffer
        if (this._buffer.length > 0) {
            this._flushBuffer();
        }

        console.log(`[VERBOSE] Log session ended → logs/${this._currentLogFile} (${this._lineCount} lines)`);
    }

    /**
     * Full reset — clears all state, ends any active session, unchecks UI toggle.
     * Called by resetAll() to ensure clean slate.
     */
    reset() {
        if (this._sessionActive) {
            this.endSession();
        }
        this.enabled = false;
        this._sessionActive = false;
        this._currentLogFile = null;
        this._buffer = [];
        this._lineCount = 0;

        // Uncheck the UI toggle if present
        const checkbox = document.getElementById('verboseToggle');
        if (checkbox) checkbox.checked = false;
    }

    /**
     * Download the current buffer as a text file (browser fallback).
     */
    downloadLogs() {
        if (this._buffer.length === 0 && !this._currentLogFile) {
            console.warn('[VERBOSE] No logs to download');
            return;
        }

        const content = this._buffer.join('');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this._currentLogFile || `session-log-${Date.now()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Write content to log file via IPC (Electron) or buffer (browser fallback).
     */
    _writeToFile(content) {
        // Always buffer for download fallback
        this._buffer.push(content);

        // Try IPC write (Electron)
        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.appendSessionLog === 'function') {
            window.aiAPI.appendSessionLog(this._currentLogFile, content).catch(err => {
                console.warn('[VERBOSE] IPC write failed:', err.message);
            });
        }
    }

    /**
     * Flush buffer via IPC (if available).
     */
    _flushBuffer() {
        if (this._buffer.length === 0) return;
        const content = this._buffer.join('');
        if (typeof window !== 'undefined' && window.aiAPI && typeof window.aiAPI.appendSessionLog === 'function') {
            window.aiAPI.appendSessionLog(this._currentLogFile, content).catch(() => {});
        }
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.verboseLogger = new VerboseLogger();
}

// For Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VerboseLogger };
}

console.log('✅ Verbose Logger loaded');
