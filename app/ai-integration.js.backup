/**
 * AI Integration - Pattern-Based
 * Sends table data to AI for analysis
 */

class AIIntegration {
    constructor() {
        this.connected = false;
        this.api = window.aiAPI;
        
        if (!this.api) {
            console.error('❌ AI API not found!');
        }
    }

    async testConnection() {
        if (!this.api) {
            return false;
        }
        
        try {
            this.connected = await this.api.testConnection();
            return this.connected;
        } catch (error) {
            console.error('❌ AI Server connection failed:', error);
            this.connected = false;
            return false;
        }
    }

    async getPrediction(spinHistory) {
        if (!this.api) {
            console.error('AI API not available');
            return null;
        }
        
        try {
            // CRITICAL: Check if we have enough spins first
            const spins = window.spins || window.spinData;
            if (!spins || spins.length < 3) {
                console.log('⏳ Waiting for 3+ spins before prediction');
                return null;
            }
            
            // Get table data from renderer
            const tableData = window.getAIData && window.getAIData();
            
            if (!tableData) {
                console.warn('⚠️ No table data available');
                return null;
            }
            
            // Send table data to AI
            const prediction = await this.api.getPredictionWithTableData(tableData);
            console.log('🤖 AI Prediction:', prediction);
            return prediction;
        } catch (error) {
            console.error('❌ Prediction request failed:', error);
            return null;
        }
    }

    async startSession(bankroll = 4000, target = 100) {
        if (!this.api) {
            return null;
        }
        
        try {
            const result = await this.api.startSession(bankroll, target);
            console.log('✅ Session started:', result);
            return result;
        } catch (error) {
            console.error('❌ Start session failed:', error);
            return null;
        }
    }

    async processResult(betPerNumber, hit) {
        if (!this.api) {
            return null;
        }
        
        try {
            const result = await this.api.processResult(betPerNumber, hit);
            console.log('💰 Result processed:', result);
            return result;
        } catch (error) {
            console.error('❌ Process result failed:', error);
            return null;
        }
    }

    async getStatus() {
        if (!this.api) {
            return null;
        }
        
        try {
            return await this.api.getStatus();
        } catch (error) {
            console.error('❌ Get status failed:', error);
            return null;
        }
    }

    async resetSession() {
        if (!this.api) {
            return null;
        }
        
        try {
            const result = await this.api.resetSession();
            console.log('🔄 Session reset:', result);
            return result;
        } catch (error) {
            console.error('❌ Reset session failed:', error);
            return null;
        }
    }
}

const aiIntegration = new AIIntegration();

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔌 Testing AI server connection...');
    
    const connected = await aiIntegration.testConnection();
    
    if (connected) {
        console.log('✅ AI Server Connected!');
        console.log('🤖 Pattern-Based AI enabled');
    } else {
        console.warn('⚠️ AI Server Not Running');
        console.warn('Start server: cd backend && python3 api/ai_server.py');
    }
});