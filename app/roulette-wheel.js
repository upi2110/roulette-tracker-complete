/**
 * European Roulette Wheel Visualization - FIXED
 * Shows predictions OUTSIDE the wheel with clear markers
 */

class RouletteWheel {
    constructor() {
        // REAL European wheel order (37 numbers: 0-36, clockwise from 0)
        // No duplicate for 26 - that's only used in calculations
        this.wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 
            5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];
        
        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
        
        this.highlightedAnchors = [];
        this.highlightedNeighbors = [];
        
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
                <div class="wheel-container" id="wheelContainer" style="position: relative; width: 320px; height: 380px; margin: 0 auto;">
                    <canvas id="wheelCanvas" width="320" height="380" style="display: block;"></canvas>
                </div>
                <div class="wheel-legend">
                    <div class="legend-item">
                        <span class="legend-color anchor"></span>
                        <span>⭐ Anchor Numbers</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color neighbor"></span>
                        <span>Neighbors (±1)</span>
                    </div>
                </div>
            </div>
        `;
        
        container.insertBefore(panel, container.firstChild);
        
        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.drawWheel();
        
        console.log('✅ Wheel visualization initialized');
    }
    
    drawWheel() {
        const ctx = this.ctx;
        const centerX = 160;
        const centerY = 170; // Moved down slightly to have space for top markers
        const outerRadius = 140;
        const innerRadius = 80;
        const numberRadius = 110;
        
        ctx.clearRect(0, 0, 320, 380); // Updated height
        
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
                ctx.fillStyle = '#27ae60'; // Green for 0 only
            } else if (this.redNumbers.includes(num)) {
                ctx.fillStyle = '#e74c3c'; // Red
            } else {
                ctx.fillStyle = '#2c3e50'; // Black (including 26)
            }
            ctx.fill();
            
            // Border
            ctx.strokeStyle = '#95a5a6';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Draw number text - show REAL numbers
            const textAngle = angle + angleStep / 2;
            const textX = centerX + Math.cos(textAngle) * numberRadius;
            const textY = centerY + Math.sin(textAngle) * numberRadius;
            
            ctx.fillStyle = 'white';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num, textX, textY); // Show actual number
        });
    }
    
    highlightPredictions(prediction) {
        if (!prediction || !prediction.numbers || prediction.numbers.length === 0) {
            this.clearHighlights();
            return;
        }
        
        // Get anchor numbers from anchor_groups
        const anchorNumbers = new Set();
        if (prediction.anchor_groups && Array.isArray(prediction.anchor_groups)) {
            prediction.anchor_groups.forEach(group => {
                if (group.anchor !== undefined && group.anchor !== null) {
                    anchorNumbers.add(group.anchor);
                }
            });
        }
        
        // Split predicted numbers into anchors vs neighbors
        this.highlightedAnchors = [];
        this.highlightedNeighbors = [];
        
        prediction.numbers.forEach(num => {
            if (anchorNumbers.has(num)) {
                this.highlightedAnchors.push(num);
            } else {
                this.highlightedNeighbors.push(num);
            }
        });
        
        console.log('🎯 Highlighting predictions:');
        console.log('  Anchors:', this.highlightedAnchors);
        console.log('  Neighbors:', this.highlightedNeighbors);
        console.log('  Total predicted:', prediction.numbers.length);
        
        this.drawWheel();
        this.drawPredictionMarkers();
    }
    
    drawPredictionMarkers() {
        const ctx = this.ctx;
        const centerX = 160;
        const centerY = 170; // Match drawWheel centerY
        const markerRadius = 158; // FURTHER OUTSIDE the wheel (was 150)
        const angleStep = (2 * Math.PI) / 37;
        
        // Draw anchor markers - GOLD STARS (bigger)
        this.highlightedAnchors.forEach(num => {
            // No conversion needed - predictions use real wheel numbers
            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;
            
            const angle = idx * angleStep - Math.PI / 2 + angleStep / 2;
            const markerX = centerX + Math.cos(angle) * markerRadius;
            const markerY = centerY + Math.sin(angle) * markerRadius;
            
            // Draw GOLD star marker (BIGGER)
            ctx.beginPath();
            ctx.arc(markerX, markerY, 13, 0, 2 * Math.PI); // Increased from 10 to 13
            ctx.fillStyle = '#FFD700';
            ctx.fill();
            ctx.strokeStyle = '#FF8C00';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Draw star symbol
            ctx.fillStyle = '#8B4513';
            ctx.font = 'bold 16px Arial'; // Bigger font
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', markerX, markerY);
            
            // Draw line from wheel to marker
            const lineStartRadius = 142;
            const lineStartX = centerX + Math.cos(angle) * lineStartRadius;
            const lineStartY = centerY + Math.sin(angle) * lineStartRadius;
            
            ctx.beginPath();
            ctx.moveTo(lineStartX, lineStartY);
            ctx.lineTo(markerX, markerY);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2.5; // Thicker line
            ctx.setLineDash([]);
            ctx.stroke();
        });
        
        // Draw neighbor markers - BLUE CIRCLES (bigger)
        this.highlightedNeighbors.forEach(num => {
            // No conversion needed - predictions use real wheel numbers
            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;
            
            const angle = idx * angleStep - Math.PI / 2 + angleStep / 2;
            const markerX = centerX + Math.cos(angle) * markerRadius;
            const markerY = centerY + Math.sin(angle) * markerRadius;
            
            // Draw BLUE circle marker (BIGGER)
            ctx.beginPath();
            ctx.arc(markerX, markerY, 11, 0, 2 * Math.PI); // Increased from 8 to 11
            ctx.fillStyle = '#64B5F6';
            ctx.fill();
            ctx.strokeStyle = '#1976D2';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            
            // Draw line from wheel to marker
            const lineStartRadius = 142;
            const lineStartX = centerX + Math.cos(angle) * lineStartRadius;
            const lineStartY = centerY + Math.sin(angle) * lineStartRadius;
            
            ctx.beginPath();
            ctx.moveTo(lineStartX, lineStartY);
            ctx.lineTo(markerX, markerY);
            ctx.strokeStyle = '#64B5F6';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }
    
    clearHighlights() {
        this.highlightedAnchors = [];
        this.highlightedNeighbors = [];
        this.drawWheel();
    }
}

// Create global instance
window.rouletteWheel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.rouletteWheel = new RouletteWheel();
        console.log('✅ Roulette Wheel ready');
    }, 100);
});