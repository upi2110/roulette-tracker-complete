console.log('🔍 DIAGNOSTIC: ai-integration.js START');

/**
 * AI Integration V6 - DIAGNOSTIC VERSION
 */

class AIIntegrationV6 {
    constructor() {
        console.log('🔍 DIAGNOSTIC: AIIntegrationV6 constructor called');
        this.connected = false;
        this.api = window.aiAPI;
        this.currentMode = 'v6';
        
        console.log('🔍 DIAGNOSTIC: window.aiAPI =', this.api);
        
        if (!this.api) {
            console.error('❌ DIAGNOSTIC: AI API not found! Check if preload.js is loaded!');
        } else {
            console.log('✅ DIAGNOSTIC: AI API found!');
        }
    }

    async testConnection() {
        console.log('🔍 DIAGNOSTIC: testConnection() called');
        
        if (!this.api) {
            console.error('❌ DIAGNOSTIC: No API to test');
            return false;
        }
        
        try {
            console.log('🔍 DIAGNOSTIC: Calling api.testConnection()...');
            this.connected = await this.api.testConnection();
            console.log('🔍 DIAGNOSTIC: testConnection result:', this.connected);
            return this.connected;
        } catch (error) {
            console.error('❌ DIAGNOSTIC: testConnection error:', error);
            this.connected = false;
            return false;
        }
    }

    async getPrediction(spinHistory) {
        console.log('🔍 DIAGNOSTIC: getPrediction() called');
        console.log('🔍 DIAGNOSTIC: Mode:', this.currentMode);
        
        if (this.currentMode === 'v6') {
            return await this.getPredictionV6(spinHistory);
        } else {
            return await this.getPredictionV5(spinHistory);
        }
    }

    async getPredictionV6(spinHistory) {
        console.log('🔍 DIAGNOSTIC: getPredictionV6() called');
        
        if (!this.api) {
            console.error('❌ DIAGNOSTIC: No API available in V6');
            return null;
        }
        
        try {
            const spins = window.spins || window.spinData;
            console.log('🔍 DIAGNOSTIC: Spins count:', spins ? spins.length : 0);
            
            if (!spins || spins.length < 3) {
                console.log('⏳ DIAGNOSTIC: Not enough spins (need 3+)');
                return null;
            }
            
            // Check if getAIDataV6 exists
            console.log('🔍 DIAGNOSTIC: window.getAIDataV6 exists?', typeof window.getAIDataV6);
            
            const tableData = window.getAIDataV6 && window.getAIDataV6();
            
            if (!tableData) {
                console.warn('⚠️ DIAGNOSTIC: getAIDataV6() returned null');
                return null;
            }
            
            console.log('🔍 DIAGNOSTIC: Table data received:');
            console.log('   - table3NextProjections:', Object.keys(tableData.table3NextProjections || {}).length);
            console.log('   - currentSpinCount:', tableData.currentSpinCount);
            
            console.log('📤 DIAGNOSTIC: Calling API.getPredictionWithTableData()...');
            const prediction = await this.api.getPredictionWithTableData(tableData);
            
            console.log('📥 DIAGNOSTIC: Prediction received:', prediction);
            return prediction;
            
        } catch (error) {
            console.error('❌ DIAGNOSTIC: getPredictionV6 error:', error);
            console.error('❌ DIAGNOSTIC: Error stack:', error.stack);
            return null;
        }
    }

    async getPredictionV5(spinHistory) {
        console.log('🔍 DIAGNOSTIC: V5 mode (fallback)');
        return null;
    }

    async startSession(bankroll = 4000, target = 100) {
        console.log('🔍 DIAGNOSTIC: startSession() called');
        
        if (!this.api) {
            console.error('❌ DIAGNOSTIC: No API for startSession');
            return null;
        }
        
        try {
            const result = await this.api.startSession(bankroll, target);
            console.log('✅ DIAGNOSTIC: Session started:', result);
            return result;
        } catch (error) {
            console.error('❌ DIAGNOSTIC: startSession error:', error);
            return null;
        }
    }

    async processResult(betPerNumber, hit) {
        console.log('🔍 DIAGNOSTIC: processResult() called');
        
        if (!this.api) return null;
        
        try {
            const result = await this.api.processResult(betPerNumber, hit);
            console.log('💰 DIAGNOSTIC: Result processed:', result);
            return result;
        } catch (error) {
            console.error('❌ DIAGNOSTIC: processResult error:', error);
            return null;
        }
    }
}

console.log('🔍 DIAGNOSTIC: Creating AIIntegrationV6 instance...');
const aiIntegrationV6 = new AIIntegrationV6();
console.log('🔍 DIAGNOSTIC: Instance created:', aiIntegrationV6);

console.log('🔍 DIAGNOSTIC: Creating aiIntegration alias...');
const aiIntegration = aiIntegrationV6;

console.log('🔍 DIAGNOSTIC: Exporting to window...');
window.aiIntegrationV6 = aiIntegrationV6;
window.aiIntegration = aiIntegration;

console.log('🔍 DIAGNOSTIC: Exports complete!');
console.log('   window.aiIntegrationV6:', typeof window.aiIntegrationV6);
console.log('   window.aiIntegration:', typeof window.aiIntegration);

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔍 DIAGNOSTIC: DOMContentLoaded event fired');
    console.log('🔌 Testing AI server connection (V6)...');
    
    const connected = await aiIntegrationV6.testConnection();
    
    if (connected) {
        console.log('✅ AI Server Connected!');
        console.log('🤖 V6 Strategy enabled: Common Numbers from Top 2 Pairs');
        console.log('📊 Uses NEXT row projections (white boxes)');
    } else {
        console.warn('⚠️ AI Server Not Running');
        console.warn('Start V6 server: cd backend && python3 api/ai_server_v6.py');
    }
});

console.log('✅ DIAGNOSTIC: ai-integration.js COMPLETE');

/**
 * Update AI Prediction Panel with V6 predictions
 */
window.updateAIPredictionPanel = function(prediction) {
    console.log('🔄 Updating AI panel with:', prediction);
    
    if (!prediction) {
        console.warn('⚠️ No prediction to display');
        return;
    }
    
    // Update signal/status
    const statusElement = document.querySelector('#ai-prediction-panel .status-text');
    if (statusElement) {
        statusElement.textContent = prediction.signal || 'WAITING';
        statusElement.className = prediction.signal === 'BET NOW' ? 'status-bet-now' : 'status-wait';
    }
    
    // Update confidence
    const confidenceElement = document.querySelector('#ai-prediction-panel .confidence-value');
    if (confidenceElement) {
        confidenceElement.textContent = `${prediction.confidence || 0}%`;
    }
    
    // Update numbers
    const numbersElement = document.querySelector('#ai-prediction-panel .predicted-numbers');
    if (numbersElement && prediction.numbers && prediction.numbers.length > 0) {
        numbersElement.innerHTML = prediction.numbers
            .sort((a, b) => a - b)
            .map(n => `<span class="number-chip">${n}</span>`)
            .join(' ');
    } else if (numbersElement) {
        numbersElement.innerHTML = '<em>Start entering spins to begin</em>';
    }
    
    console.log('✅ AI panel updated');
};