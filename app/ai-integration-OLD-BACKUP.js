/**
 * AI Integration for Renderer Process
 * Uses window.aiAPI exposed by preload.js
 */

class AIIntegration {
    constructor() {
        this.connected = false;
        this.api = window.aiAPI;
        
        if (!this.api) {
            console.error('❌ AI API not found! Make sure preload.js is loaded.');
        }
    }

    /**
     * Test connection to AI server
     */
    async testConnection() {
        if (!this.api) {
            console.error('AI API not available');
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

    /**
     * Get AI prediction for next spin
     */
    async getPrediction(spinHistory) {
        if (!this.api) {
            console.error('AI API not available');
            return null;
        }
        
        try {
            const prediction = await this.api.getPrediction(spinHistory);
            console.log('🤖 AI Prediction:', prediction);
            return prediction;
        } catch (error) {
            console.error('❌ Prediction request failed:', error);
            return null;
        }
    }

    /**
     * Start a new betting session
     */
    async startSession(bankroll = 4000, target = 100) {
        if (!this.api) {
            console.error('AI API not available');
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

    /**
     * Process bet result (win/loss)
     */
    async processResult(betPerNumber, hit) {
        if (!this.api) {
            console.error('AI API not available');
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

    /**
     * Get current session status
     */
    async getStatus() {
        if (!this.api) {
            console.error('AI API not available');
            return null;
        }
        
        try {
            return await this.api.getStatus();
        } catch (error) {
            console.error('❌ Get status failed:', error);
            return null;
        }
    }

    /**
     * Get detailed session report
     */
    async getSessionReport() {
        if (!this.api) {
            console.error('AI API not available');
            return null;
        }
        
        try {
            return await this.api.getSessionReport();
        } catch (error) {
            console.error('❌ Get report failed:', error);
            return null;
        }
    }

    /**
     * Reset session
     */
    async resetSession() {
        if (!this.api) {
            console.error('AI API not available');
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

// Create global instance
const aiIntegration = new AIIntegration();

// Auto-test connection on load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔌 Testing AI server connection...');
    
    const connected = await aiIntegration.testConnection();
    
    if (connected) {
        console.log('✅ AI Server Connected!');
        console.log('🤖 AI features enabled');
    } else {
        console.warn('⚠️ AI Server Not Running');
        console.warn('Start server: cd backend && ./start_ai.sh');
    }
});