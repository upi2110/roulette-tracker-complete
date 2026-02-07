/**
 * European Roulette Wheel Visualization - COLOR-CODED ANCHOR GROUPS
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

        // Color-coded anchor groups matching the prediction panel
        this.anchorGroups = [];
        this.looseNumbers = [];

        // Same color palette as the prediction panel
        this.groupColors = [
            { main: '#f59e0b', light: 'rgba(245, 158, 11, 0.5)', border: '#d97706' },   // amber/gold
            { main: '#3b82f6', light: 'rgba(59, 130, 246, 0.5)', border: '#2563eb' },    // blue
            { main: '#22c55e', light: 'rgba(34, 197, 94, 0.5)',  border: '#16a34a' },    // green
            { main: '#a855f7', light: 'rgba(168, 85, 247, 0.5)', border: '#9333ea' },    // purple
            { main: '#f97316', light: 'rgba(249, 115, 22, 0.5)', border: '#ea580c' },    // orange
            { main: '#ec4899', light: 'rgba(236, 72, 153, 0.5)', border: '#db2777' },    // pink
            { main: '#0ea5e9', light: 'rgba(14, 165, 233, 0.5)', border: '#0284c7' },    // sky
            { main: '#10b981', light: 'rgba(16, 185, 129, 0.5)', border: '#059669' },    // emerald
        ];

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
                <div class="wheel-legend" id="wheelLegend">
                    <div class="legend-item">
                        <span class="legend-color anchor"></span>
                        <span>±1/±2 Anchor Groups</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color neighbor"></span>
                        <span>🔴 Loose Numbers</span>
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
        if (this.anchorGroups.length > 0 || this.looseNumbers.length > 0) {
            this.drawHighlights();
        }
    }

    updateHighlights(anchors, loose, anchorGroups, extraNumbers) {
        /**
         * Update wheel highlights with color-coded anchor groups
         * @param {Array} anchors - Anchor numbers (for backward compat)
         * @param {Array} loose - Loose numbers (red)
         * @param {Array} anchorGroups - [{anchor, group: [left, anchor, right]}] with colors
         * @param {Array} extraNumbers - Extra numbers from 3rd ref (grey dots)
         */

        this.anchorGroups = anchorGroups || [];
        this.looseNumbers = loose || [];
        this.extraNumbers = extraNumbers || [];

        console.log(`🎡 Updating wheel: ${this.anchorGroups.length} anchor groups, ${this.looseNumbers.length} loose, ${this.extraNumbers.length} extra`);

        // Redraw wheel with new highlights
        this.drawWheel();
    }

    drawHighlights() {
        const ctx = this.ctx;
        const centerX = 200;
        const centerY = 210;
        const highlightRadius = 165;
        const angleStep = (2 * Math.PI) / 37;

        // Build a map: number -> { color, isAnchor, type }
        const numberColorMap = {};

        this.anchorGroups.forEach((ag, groupIdx) => {
            const color = this.groupColors[groupIdx % this.groupColors.length];
            const group = ag.group || [];
            const anchorNum = ag.anchor;
            const anchorType = ag.type || '±1';

            group.forEach(num => {
                numberColorMap[num] = {
                    color: color,
                    isAnchor: (num === anchorNum),
                    type: anchorType
                };
            });
        });

        // Draw anchor group highlights (color-coded)
        Object.keys(numberColorMap).forEach(numStr => {
            const num = parseInt(numStr);
            const info = numberColorMap[num];
            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;

            const angle = idx * angleStep - Math.PI / 2;
            const highlightAngle = angle + angleStep / 2;
            const highlightX = centerX + Math.cos(highlightAngle) * highlightRadius;
            const highlightY = centerY + Math.sin(highlightAngle) * highlightRadius;

            const size = info.isAnchor ? 18 : 15;
            const innerSize = info.isAnchor ? 12 : 9;

            // Outer glow
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, size, 0, 2 * Math.PI);
            ctx.fillStyle = info.color.light;
            ctx.fill();

            // Inner solid
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, innerSize, 0, 2 * Math.PI);
            ctx.fillStyle = info.color.main;
            ctx.globalAlpha = info.isAnchor ? 0.9 : 0.65;
            ctx.fill();
            ctx.globalAlpha = 1.0;

            // Border
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, innerSize + 2, 0, 2 * Math.PI);
            ctx.strokeStyle = info.color.border;
            ctx.lineWidth = info.isAnchor ? 3 : 2;
            ctx.stroke();

            // Anchor ±1/±2 label
            if (info.isAnchor) {
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(info.type, highlightX, highlightY);
            }
        });

        // Draw loose highlights (RED)
        this.looseNumbers.forEach(num => {
            // Skip if already drawn via anchor group (shouldn't happen but safety)
            if (numberColorMap[num]) return;

            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;

            const angle = idx * angleStep - Math.PI / 2;
            const highlightAngle = angle + angleStep / 2;
            const highlightX = centerX + Math.cos(highlightAngle) * highlightRadius;
            const highlightY = centerY + Math.sin(highlightAngle) * highlightRadius;

            // Red glow
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 15, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 9, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.fill();

            // Red border
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 11, 0, 2 * Math.PI);
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw EXTRA numbers (GREY — 3rd ref optional)
        const extraNums = this.extraNumbers || [];
        extraNums.forEach(num => {
            // Skip if already drawn via anchor group or loose
            if (numberColorMap[num]) return;
            if (this.looseNumbers.includes(num)) return;

            const idx = this.wheelOrder.indexOf(num);
            if (idx === -1) return;

            const angle = idx * angleStep - Math.PI / 2;
            const highlightAngle = angle + angleStep / 2;
            const highlightX = centerX + Math.cos(highlightAngle) * highlightRadius;
            const highlightY = centerY + Math.sin(highlightAngle) * highlightRadius;

            // Grey glow
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 14, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(156, 163, 175, 0.35)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 8, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(107, 114, 128, 0.6)';
            ctx.fill();

            // Grey border (dashed effect via double circle)
            ctx.beginPath();
            ctx.arc(highlightX, highlightY, 10, 0, 2 * Math.PI);
            ctx.strokeStyle = '#6b7280';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 2]);
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    clearHighlights() {
        /**
         * Clear all highlights
         */
        this.anchorGroups = [];
        this.looseNumbers = [];
        this.extraNumbers = [];
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
