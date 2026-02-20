/**
 * Preload Script - UPDATED FOR V6
 * Electron bridge between renderer and backend API
 */

const { contextBridge } = require('electron');

// Expose API to renderer process
contextBridge.exposeInMainWorld('aiAPI', {
    
    /**
     * Test connection to AI server
     */
    async testConnection() {
        try {
            const response = await fetch('http://localhost:8002/');
            if (!response.ok) return false;
            const data = await response.json();
            console.log('✅ AI Server connected:', data);
            return true;
        } catch (error) {
            console.error('❌ AI Server connection failed:', error);
            return false;
        }
    },

    /**
     * Get prediction with table data (V6 compatible)
     * Now accepts table3NextProjections!
     */
    async getPredictionWithTableData(tableData) {
        try {
            console.log('📤 Sending V6 data to backend...');
            console.log('   Current spin count:', tableData.currentSpinCount);
            console.log('   Table 3 NEXT projections:', Object.keys(tableData.table3NextProjections || {}).length);
            
            const response = await fetch('http://localhost:8002/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(tableData)
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const prediction = await response.json();
            
            console.log('📥 V6 Prediction received:');
            console.log('   Signal:', prediction.signal);
            console.log('   Numbers:', prediction.numbers?.length || 0);
            console.log('   Full pool:', prediction.full_pool?.length || 0);
            console.log('   Confidence:', prediction.confidence, '%');
            
            return prediction;
            
        } catch (error) {
            console.error('❌ Prediction request failed:', error);
            throw error;
        }
    },

    /**
     * Start a new session
     */
    async startSession(bankroll = 4000, target = 100) {
        try {
            const response = await fetch(`http://localhost:8002/start_session?starting_bankroll=${bankroll}&session_target=${target}`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error('❌ Start session failed:', error);
            throw error;
        }
    },

    /**
     * Process bet result
     */
    async processResult(betPerNumber, hit) {
        try {
            const response = await fetch('http://localhost:8002/process_result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bet_per_number: betPerNumber,
                    hit: hit
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error('❌ Process result failed:', error);
            throw error;
        }
    },

    /**
     * Get session status
     */
    async getStatus() {
        try {
            const response = await fetch('http://localhost:8002/status');
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error('❌ Get status failed:', error);
            throw error;
        }
    },

    /**
     * Reset session
     */
    async resetSession() {
        try {
            const response = await fetch('http://localhost:8002/reset', {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error('❌ Reset session failed:', error);
            throw error;
        }
    }
});

console.log('✅ Preload script loaded (V6 compatible)');
