/**
 * European Roulette Wheel Visualization
 * SVG-based wheel with prediction highlighting
 */

class RouletteWheel {
    constructor() {
        // European wheel order (clockwise from 0)
        this.wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 
            5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];
        
        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
        
        this.highlightedNumbers = {
            anchors: [],
            neighbors: []
        };
        
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
                <h3>🎡 European Wheel</h3>
            </div>
            <div class="panel-content">
                <div class="wheel-container" id="wheelContainer">
                    <div style="position: relative; width: 280px; height: 280px;">
                        <img src="European_Roulette_wheel.png" alt="Roulette Wheel" style="width: 100%; height: 100%;" id="wheelImage">
                        <canvas id="wheelOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></canvas>
                    </div>
                </div>
                <div class="wheel-legend">
                    <div class="legend-item">
                        <span class="legend-color anchor"></span>
                        <span>Anchor Numbers</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color neighbor"></span>
                        <span>Neighbors</span>
                    </div>
                </div>
            </div>
        `;
        
        container.insertBefore(panel, container.firstChild);
        
        this.initCanvasOverlay();
    }
    
    initCanvasOverlay() {
        const canvas = document.getElementById('wheelOverlay');
        const img = document.getElementById('wheelImage');
        
        if (!canvas || !img) return;
        
        // Set canvas size to match image
        const resizeCanvas = () => {
            canvas.width = img.clientWidth;
            canvas.height = img.clientHeight;
        };
        
        img.onload = resizeCanvas;
        if (img.complete) resizeCanvas();
        
        console.log('✅ Wheel overlay initialized');
    }
    
    highlightPredictions(prediction) {
        this.clearHighlights();
        
        if (!prediction || !prediction.numbers) return;
        
        const anchorNumbers = new Set();
        if (prediction.anchor_groups) {
            prediction.anchor_groups.forEach(group => {
                if (group.anchor !== undefined) {
                    anchorNumbers.add(group.anchor);
                }
            });
        }
        
        const anchors = prediction.numbers.filter(n => anchorNumbers.has(n));
        const neighbors = prediction.numbers.filter(n => !anchorNumbers.has(n));
        
        this.drawHighlights(anchors, neighbors);
    }
    
    drawHighlights(anchors, neighbors) {
        const canvas = document.getElementById('wheelOverlay');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Wheel number positions (approximate degrees from top, clockwise)
        const positions = {
            0: 0, 32: 10, 15: 20, 19: 30, 4: 40, 21: 50, 2: 60, 25: 70, 17: 80,
            34: 90, 6: 100, 27: 110, 13: 120, 36: 130, 11: 140, 30: 150, 8: 160,
            23: 170, 10: 180, 5: 190, 24: 200, 16: 210, 33: 220, 1: 230, 20: 240,
            14: 250, 31: 260, 9: 270, 22: 280, 18: 290, 29: 300, 7: 310, 28: 320,
            12: 330, 35: 340, 3: 350, 26: 0
        };
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const outerRadius = Math.min(canvas.width, canvas.height) * 0.45;
        const innerRadius = outerRadius * 0.55;
        
        // Draw VERY LIGHT highlights
        [...anchors, ...neighbors].forEach(num => {
            if (positions[num] !== undefined) {
                const angle = (positions[num] - 90) * Math.PI / 180;
                const spanAngle = 10 * Math.PI / 180;
                
                ctx.beginPath();
                ctx.arc(centerX, centerY, innerRadius, angle - spanAngle/2, angle + spanAngle/2);
                ctx.arc(centerX, centerY, outerRadius, angle + spanAngle/2, angle - spanAngle/2, true);
                ctx.closePath();
                
                // VERY LIGHT colors as requested
                if (anchors.includes(num)) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; // Very light gold
                } else {
                    ctx.fillStyle = 'rgba(255, 229, 180, 0.25)'; // Very light peach
                }
                ctx.fill();
            }
        });
    }
    
    clearHighlights() {
        const canvas = document.getElementById('wheelOverlay');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        this.highlightedNumbers = { anchors: [], neighbors: [] };
    }
}

// Create global instance
window.rouletteWheel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.rouletteWheel = new RouletteWheel();
    }, 100);
});