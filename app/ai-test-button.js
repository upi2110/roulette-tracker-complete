/**
 * AI Test Button Handler - FIXED
 * Properly accesses spinData from renderer
 */

// Wait for DOM and spinData to be ready
function initAITestButton() {
    console.log('Initializing AI Test Button...');
    
    // Find the reset button to insert after it
    const resetBtn = document.getElementById('resetBtn');
    if (!resetBtn) {
        console.error('Reset button not found, retrying...');
        setTimeout(initAITestButton, 500);
        return;
    }
    
    // Create AI Test Button
    const aiTestBtn = document.createElement('button');
    aiTestBtn.id = 'aiTestBtn';
    aiTestBtn.className = 'btn-ai-test';
    aiTestBtn.textContent = '🤖 TEST AI';
    aiTestBtn.style.cssText = `
        background: #007bff;
        color: white;
        margin-left: 10px;
        padding: 10px 24px;
        font-size: 15px;
        font-weight: 700;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
    `;
    
    // Add hover effect
    aiTestBtn.addEventListener('mouseenter', () => {
        aiTestBtn.style.background = '#0056b3';
        aiTestBtn.style.transform = 'translateY(-1px)';
    });
    
    aiTestBtn.addEventListener('mouseleave', () => {
        aiTestBtn.style.background = '#007bff';
        aiTestBtn.style.transform = 'translateY(0)';
    });
    
    // Insert after reset button
    resetBtn.parentElement.insertBefore(aiTestBtn, resetBtn.nextSibling);
    
    // Click handler
    aiTestBtn.addEventListener('click', async () => {
        console.log('🧪 Testing AI prediction...');
        
        // Access spinData from window (global scope)
        const spinHistory = window.spinData;
        
        // Check if spinData exists
        if (!spinHistory || !Array.isArray(spinHistory)) {
            alert('⚠️ spinData not found\n\nMake sure renderer-3tables.js is loaded and you\'ve added some spins.');
            console.error('spinData not available:', spinHistory);
            return;
        }
        
        if (spinHistory.length < 3) {
            alert('⚠️ Need at least 3 spins to test AI prediction\n\nCurrent spins: ' + spinHistory.length + '\n\nPlease add ' + (3 - spinHistory.length) + ' more spin(s).');
            return;
        }
        
        // Show loading state
        aiTestBtn.disabled = true;
        aiTestBtn.textContent = '⏳ Analyzing...';
        
        try {
            // Check if AI integration is ready
            if (typeof aiIntegration === 'undefined') {
                throw new Error('AI Integration not loaded');
            }
            
            console.log('Sending to AI:', spinHistory);
            
            // Get prediction from AI
            const prediction = await aiIntegration.getPrediction(spinHistory);
            
            if (prediction && prediction.can_predict) {
                console.log('🎯 AI Prediction received:', prediction);
                
                // Format reasoning for display
                const reasoningText = prediction.reasoning.map(r => `  • ${r}`).join('\n');
                
                // Format anchor groups
                let anchorGroupsText = 'N/A';
                if (prediction.anchor_groups && prediction.anchor_groups.length > 0) {
                    anchorGroupsText = prediction.anchor_groups.map(g => 
                        `[${g.anchor}] ${g.neighbors.join(', ')}`
                    ).join('\n');
                }
                
                // Show results in alert
                alert(`🤖 AI PREDICTION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Signal: ${prediction.signal}
Confidence: ${prediction.confidence}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 PREDICTED NUMBERS (${prediction.numbers.length}):
${prediction.numbers.join(', ')}

💰 BETTING INFORMATION:
  Bet per number: $${prediction.bet_per_number}
  Total bet: $${prediction.total_bet}
  Potential win: $${prediction.potential_win}
  Potential loss: $${prediction.potential_loss}

🧠 AI REASONING:
${reasoningText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Anchor Groups:
${anchorGroupsText}
`);
            } else {
                const message = prediction?.message || 'Confidence too low or insufficient data';
                alert(`⚠️ AI PREDICTION NOT AVAILABLE\n\n${message}`);
            }
        } catch (error) {
            console.error('❌ Error getting prediction:', error);
            alert(`❌ Error getting AI prediction\n\n${error.message}\n\nCheck console for details.`);
        } finally {
            // Restore button state
            aiTestBtn.disabled = false;
            aiTestBtn.textContent = '🤖 TEST AI';
        }
    });
    
    console.log('✅ AI Test Button added to interface');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAITestButton);
} else {
    // DOM already loaded
    initAITestButton();
}