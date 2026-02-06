/**
 * Auto-Update Orchestrator - UPDATED FOR MANUAL MODE
 * Coordinates updates between all panels
 * CHANGE: Loads available pairs when new spins added (for manual selection)
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
                
                // CHANGED: Load available pairs for manual selection
                this.loadPairsForManualSelection();
                
                // Start session if needed
                if (!this.sessionStarted) {
                    console.log('🚀 Starting session FIRST...');
                    this.startSessionFirst().then(() => {
                        // Don't auto-update prediction in manual mode
                        // User must select pairs manually
                    });
                } else {
                    // Don't auto-update prediction in manual mode
                    // User must select pairs manually
                }
                
                this.lastSpinCount = currentCount;
            }
        }, 500);
    }

    /**
     * NEW: Load available pairs when spins are added
     */
    loadPairsForManualSelection() {
        if (window.aiPanel && typeof window.aiPanel.loadAvailablePairs === 'function') {
            console.log('📊 Loading pairs for manual selection...');
            window.aiPanel.loadAvailablePairs();
        } else {
            console.warn('⚠️ AI panel not available for pair loading');
        }
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