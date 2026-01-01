/**
 * Auto-Update Orchestrator
 * Coordinates AI predictions, wheel updates, and money tracking
 */

class AutoUpdateOrchestrator {
    constructor() {
        this.isEnabled = true;
        this.lastSpinCount = 0;
        this.setupListeners();
        console.log('✅ Auto-Update Orchestrator initialized');
    }
    
    setupListeners() {
        // Monitor for new spins by watching the spins array
        // Use 1500ms to give money panel time to check first
        setInterval(() => {
            this.checkForNewSpins();
        }, 1500); // Slower to let money panel check first
    }
    
    async checkForNewSpins() {
        if (!this.isEnabled) return;
        
        const spins = window.spins || window.spinData;
        if (!spins || !Array.isArray(spins)) return;
        
        const currentCount = spins.length;
        
        // New spin detected
        if (currentCount > this.lastSpinCount && currentCount >= 3) {
            console.log(`🔄 New spin detected! Count: ${currentCount}`);
            
            // CRITICAL: If session not started yet, start it FIRST
            if (window.moneyPanel && !window.moneyPanel.sessionData.isSessionActive && currentCount === 3) {
                console.log('🚀 Starting session FIRST...');
                try {
                    const result = await aiIntegration.startSession(4000, 100);
                    if (result && result.success) {
                        window.moneyPanel.sessionData.isSessionActive = true;
                        window.moneyPanel.lastSpinCount = currentCount;
                        console.log('✅ Session started by orchestrator');
                    }
                } catch (error) {
                    console.error('❌ Session start failed:', error);
                }
            }
            
            this.lastSpinCount = currentCount;
            await this.updateAllPanels();
        } else if (currentCount < this.lastSpinCount) {
            // Reset detected (RESET button clicked)
            console.log('🔄 Reset detected');
            this.lastSpinCount = currentCount;
            this.clearAllPanels();
        }
    }
    
    async updateAllPanels() {
        console.log('🔄 Updating all panels...');
        this.showUpdateIndicator();
        
        try {
            const spins = window.spins || window.spinData;
            
            // CRITICAL: Check money panel FIRST (before updating prediction)
            // This ensures we check against the PREVIOUS prediction
            if (window.moneyPanel && window.moneyPanel.sessionData.isSessionActive) {
                // Money panel will check its pending bet against the new spin
                // This happens automatically via its own listener
                console.log('💰 Money panel will check pending bet...');
            }
            
            // THEN get new prediction for NEXT spin
            if (typeof aiIntegration !== 'undefined' && spins && spins.length >= 3) {
                // Add small delay to ensure money panel processes first
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const prediction = await aiIntegration.getPrediction(spins);
                
                if (prediction) {
                    // Update AI Panel
                    if (window.aiPanel) {
                        window.aiPanel.updatePrediction(prediction);
                        console.log('✅ AI Panel updated');
                    }
                    
                    // Update Wheel
                    if (window.rouletteWheel) {
                        window.rouletteWheel.highlightPredictions(prediction);
                        console.log('✅ Wheel updated');
                    }
                    
                    // Update Money Panel with new bet size
                    if (window.moneyPanel) {
                        window.moneyPanel.updateFromPrediction(prediction);
                        console.log('✅ Money Panel updated');
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error updating panels:', error);
        } finally {
            this.hideUpdateIndicator();
        }
    }
    
    clearAllPanels() {
        console.log('🔄 Clearing all panels...');
        
        // Clear AI Panel
        if (window.aiPanel) {
            window.aiPanel.updatePrediction(null);
        }
        
        // Clear Wheel highlights
        if (window.rouletteWheel) {
            window.rouletteWheel.clearHighlights();
        }
    }
    
    showUpdateIndicator() {
        let indicator = document.getElementById('autoUpdateIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'autoUpdateIndicator';
            indicator.className = 'auto-update-indicator';
            indicator.textContent = '🔄 Updating predictions...';
            document.body.appendChild(indicator);
        }
        
        indicator.classList.add('show');
    }
    
    hideUpdateIndicator() {
        const indicator = document.getElementById('autoUpdateIndicator');
        if (indicator) {
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 1500);
        }
    }
    
    enable() {
        this.isEnabled = true;
        console.log('✅ Auto-update enabled');
    }
    
    disable() {
        this.isEnabled = false;
        console.log('⏸️ Auto-update disabled');
    }
}

// Create global instance
let autoUpdater;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        autoUpdater = new AutoUpdateOrchestrator();
    }, 500);
});