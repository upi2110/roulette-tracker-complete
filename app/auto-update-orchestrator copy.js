/**
 * Auto-Update Orchestrator - FIXED INTEGRATION
 * Coordinates updates between all panels
 */

class AutoUpdateOrchestrator {
    constructor() {
        this.lastSpinCount = 0;
        this.isEnabled = true;
        this.sessionStarted = false;
        
        console.log('🔧 Auto-Update Orchestrator initialized');
    }

    setupListeners() {
        // Monitor for new spins
        setInterval(() => {
            if (!this.isEnabled) return;
            
            const currentCount = window.spins ? window.spins.length : 0;
            
            if (currentCount > this.lastSpinCount) {
                console.log(`🔄 New spin detected! Count: ${currentCount}`);
                
                // Start session if needed
                if (!this.sessionStarted) {
                    console.log('🚀 Starting session FIRST...');
                    this.startSessionFirst().then(() => {
                        this.updateAll();
                    });
                } else {
                    this.updateAll();
                }
                
                this.lastSpinCount = currentCount;
            }
        }, 500);
    }

    async startSessionFirst() {
        try {
            // Use V6 integration
            const integration = window.aiIntegrationV6 || window.aiIntegration;
            
            if (!integration) {
                console.error('❌ AI Integration not found!');
                return;
            }
            
            const result = await integration.startSession(4000, 100);
            console.log('✅ Session started:', result);
            this.sessionStarted = true;
            
        } catch (error) {
            console.error('❌ Failed to start session:', error);
        }
    }

    async updateAll() {
        console.log('🔄 Updating all panels...');
        
        try {
            // 1. Get AI prediction (this updates AI panel internally)
            await this.updateAIPrediction();
            
            // Note: Wheel and money panel are updated inside updateAIPrediction
            // via aiPanel.updatePrediction() which calls:
            //   - window.rouletteWheel.updateHighlights()
            //   - window.moneyPanel.setPrediction()
            
            console.log('✅ All panels updated');
            
        } catch (error) {
            console.error('❌ Error updating panels:', error);
        }
    }

    async updateAIPrediction() {
        try {
            // Use V6 integration
            const integration = window.aiIntegrationV6 || window.aiIntegration;
            
            if (!integration) {
                console.error('❌ AI Integration not found!');
                return;
            }
            
            // Get prediction from backend
            const prediction = await integration.getPrediction(window.spins || []);
            
            if (!prediction) {
                console.log('⏳ No prediction yet (need more spins)');
                return;
            }
            
            console.log('🤖 V6 Prediction received:', {
                signal: prediction.signal,
                numbers: prediction.numbers?.length || 0,
                anchors: prediction.anchors?.length || 0,
                loose: prediction.loose?.length || 0,
                confidence: prediction.confidence
            });
            
            // Update AI prediction panel
            // This will cascade to wheel and money panel
            if (window.aiPanel && typeof window.aiPanel.updatePrediction === 'function') {
                window.aiPanel.updatePrediction(prediction);
                console.log('✅ AI panel update triggered (cascades to wheel & money)');
            } else {
                console.warn('⚠️ AI panel not available yet');
            }
            
        } catch (error) {
            console.error('❌ Error getting AI prediction:', error);
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

    reset() {
        this.lastSpinCount = 0;
        this.sessionStarted = false;
        console.log('🔄 Auto-update orchestrator reset');
    }
}

// Create global instance
const autoUpdateOrchestrator = new AutoUpdateOrchestrator();

// Start listening for changes
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 Setting up auto-update listeners...');
    
    // Wait for all panels to be ready
    setTimeout(() => {
        autoUpdateOrchestrator.setupListeners();
        console.log('✅ Auto-update orchestrator active');
    }, 300); // Wait for all panels to initialize
});

// Export for global access
window.autoUpdateOrchestrator = autoUpdateOrchestrator;

console.log('✅ Auto-Update Orchestrator script loaded');
