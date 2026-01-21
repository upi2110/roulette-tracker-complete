/**
 * European Roulette Wheel Visualization - FIXED ORDER & HIGHLIGHTING
 * Panel order: This creates FIRST (LEFT position)
 */

class RouletteWheel {
    constructor() {
        // REAL European wheel order (37 numbers: 0-36, clockwise from 0)
        this.wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 
            5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];
        
        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
        
        this.highlightedAnchors = [];
        this.highlightedLoose = [];
        
        this.createWheel();
    }
    
    createWheel() {
        const container = document.querySelector('.info-panels-container-bottom');
        if (!container) {
            console.error('Bottom panels container not found');
            return;
        }
        
        const panel = document.createElement('div');
        panel.className = 'wheel-panel';
        panel.id = 'wheelPanel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🎡 European Wheel - Predictions</h3>
            </div>
            <div class="panel-content">
                <div class="wheel-container" id="wheelContainer" style="position: relative; width: 400px; height: 420px; margin: 0 auto;">
                    <canvas id="wheelCanvas" width="400" height="420" style="display: block;"></canvas>
                </div>
                <div class="wheel-legend">
                    <div class="legend-item">
                        <span class="legend-color anchor"></span>
                        <span>⭐ Anchor Numbers</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color neighbor"></span>
                        <span>💗 Loose Numbers</span>
                    </div>
                </div>
            </div>
        `;
        
        // INSERT AT END (so it's LEFT-most)
        container.appendChild(panel);
        
        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.drawWheel();
        
        console.log('✅ Wheel visualization initialized (LEFT position)');
    }
    
    drawWheel() {
        const ctx = this.ctx;
        const centerX = 200;
        const centerY = 210;
        const outerRadius = 150;
        const innerRadius = 90;
        const numberRadius = 120;
        
        ctx.clearRect(0, 0, 400, 420);
        
        // Draw wheel background
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#2c3e50';
        ctx.fill();
        
        // Draw inner circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a252f';
        ctx.fill();
        
        // Draw number positions
        const angleStep = (2 * Math.PI) / 37;
        
        this.wheelOrder.forEach((num, idx) => {
            const angle = idx * angleStep - Math.PI / 2;
            
            // Draw pocket
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, outerRadius, angle, angle + angleStep);
            ctx.closePath();
            
            // Color - REAL WHEEL COLORS
            if (num === 0) {
                ctx.fillStyle = '#2ecc71';
            } else if (this.redNumbers.includes(num)) {
                ctx.fillStyle = '#e74c3c';
            } else {
                ctx.fillStyle = '#2c3e50';
            }
            ctx.fill();
            
            // White dividers
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Number text
            const textAngle = angle + angleStep / 2;
            const textX = centerX + Math.cos(textAngle) * numberRadius;
            const textY = centerY + Math.sin(textAngle) * numberRadius;
            
            ctx.save();
            ctx.translate(textX, textY);
            ctx.rotate(textAngle + Math.PI / 2);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num.toString(), 0, 0);
            
            ctx.restore();
        });
        
        // Draw center circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
        ctx.fillStyle = '#95a5a6';
        ctx.fill();
        
        // Redraw highlights if any
        if (this.highlightedAnchors.length > 0 || this.highlightedLoose.length > 0) {
            this.drawHighlights();
        }
    }
    
    updateHighlights(anchors, loose) {
        /**
         * Update wheel highlights
         * @param {Array} anchors - Anchor numbers (gold)
         * @param {Array} loose - Loose numbers (pink)
         */
        
        this.highlightedAnchors = anchors || [];
        this.highlightedLoose = loose || [];
        
        console.log(`🎡 Updating wheel highlights: ${this.highlightedAnchors.length} anchors, ${this.highlightedLoose.length} loose`);
        
        // Redraw wheel with new highlights
        this.drawWheel();
        this.drawHighlights();
    }
    
    drawHighlights() {
        const ctx = this.ctx;
        const centerX = 200;
        const centerY = 210;
        const highlightRadius = 165;
        const angleStep = (2 * Math.PI) / 37;
        
        // Draw anchor highlights (GOLD)
        this.highlightedAnchors.forEach(num => {
            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;
            
            const angle = idx * angleStep - Math.PI / 2;
            const highlightAngle = angle + angleStep / 2;
            const highlightX = centerX + Math.cos(highlightAngle) * highlightRadius;
            const highlightY = centerY + Math.sin(highlightAngle) * highlightRadius;
            
            // Gold glow
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 18, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 12, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
            ctx.fill();
            
            // Gold border
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 14, 0, 2 * Math.PI);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Star icon
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⭐', highlightX, highlightY);
        });
        
        // Draw loose highlights (PINK)
        this.highlightedLoose.forEach(num => {
            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;
            
            const angle = idx * angleStep - Math.PI / 2;
            const highlightAngle = angle + angleStep / 2;
            const highlightX = centerX + Math.cos(highlightAngle) * highlightRadius;
            const highlightY = centerY + Math.sin(highlightAngle) * highlightRadius;
            
            // Pink glow
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 16, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(236, 72, 153, 0.4)';
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 10, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(236, 72, 153, 0.7)';
            ctx.fill();
            
            // Pink border
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 12, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ec4899';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Heart icon
            ctx.fillStyle = '#ec4899';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💗', highlightX, highlightY);
        });
    }
    
    clearHighlights() {
        /**
         * Clear all highlights
         */
        this.highlightedAnchors = [];
        this.highlightedLoose = [];
        this.drawWheel();
        console.log('🎡 Wheel highlights cleared');
    }
}

// Create global instance
window.rouletteWheel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.rouletteWheel = new RouletteWheel();
        console.log('✅ Roulette Wheel ready (LEFT position)');
    }, 100);
});

console.log('✅ Roulette Wheel script loaded');
