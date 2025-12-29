/**
 * Preload Script for AI Integration
 * Exposes AI server communication to renderer process
 */

const { contextBridge } = require('electron');

// Expose AI API to renderer
contextBridge.exposeInMainWorld('aiAPI', {
    /**
     * Test connection to AI server
     */
    async testConnection() {
        try {
            const response = await fetch('http://localhost:8000');
            const data = await response.json();
            return data.status === 'AI Server Running';
        } catch (error) {
            console.error('AI Server connection failed:', error);
            return false;
        }
    },

    /**
     * Get AI prediction
     */
    async getPrediction(spinHistory) {
        try {
            const response = await fetch('http://localhost:8000/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spin_history: spinHistory })
            });
            return await response.json();
        } catch (error) {
            console.error('Prediction request failed:', error);
            return null;
        }
    },

    /**
     * Start betting session
     */
    async startSession(bankroll = 4000, target = 100) {
        try {
            const response = await fetch(
                `http://localhost:8000/start_session?starting_bankroll=${bankroll}&session_target=${target}`,
                { method: 'POST' }
            );
            return await response.json();
        } catch (error) {
            console.error('Start session failed:', error);
            return null;
        }
    },

    /**
     * Process bet result
     */
    async processResult(betPerNumber, hit) {
        try {
            const response = await fetch('http://localhost:8000/process_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    bet_per_number: betPerNumber,
                    hit: hit
                })
            });
            return await response.json();
        } catch (error) {
            console.error('Process result failed:', error);
            return null;
        }
    },

    /**
     * Get session status
     */
    async getStatus() {
        try {
            const response = await fetch('http://localhost:8000/status');
            return await response.json();
        } catch (error) {
            console.error('Get status failed:', error);
            return null;
        }
    },

    /**
     * Get session report
     */
    async getSessionReport() {
        try {
            const response = await fetch('http://localhost:8000/session_report');
            return await response.json();
        } catch (error) {
            console.error('Get report failed:', error);
            return null;
        }
    },

    /**
     * Reset session
     */
    async resetSession() {
        try {
            const response = await fetch('http://localhost:8000/reset_session', {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('Reset session failed:', error);
            return null;
        }
    }
});

console.log('✅ Preload: AI API exposed to renderer');