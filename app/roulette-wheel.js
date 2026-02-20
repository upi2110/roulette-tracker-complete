/**
 * European Roulette Wheel Visualization
 * Panel order: This creates FIRST (LEFT position)
 *
 * Circles on wheel: Positive = GREEN, Negative = BLACK, Grey = GREY
 * Anchor circles show ±1 or ±2 label in white text.
 * Number lists above wheel separate ±1 and ±2 groups.
 * Filter checkboxes: 0 Table / 19 Table / Positive / Negative
 */

// 0 Table and 19 Table definitions
const ZERO_TABLE_NUMS = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
const NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);
const POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
const NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);

class RouletteWheel {
    constructor() {
        this.wheelOrder = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
            5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ];

        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

        // Sort order: from 26 clockwise
        this.sortOrder = [26, 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
        this.wheelPos = {};
        this.sortOrder.forEach((n, i) => { this.wheelPos[n] = i; });

        this.POSITIVE = POSITIVE_NUMS;
        this.NEGATIVE = NEGATIVE_NUMS;

        this.anchorGroups = [];
        this.looseNumbers = [];
        this.extraNumbers = [];
        this.extraAnchorGroups = [];
        this.extraLoose = [];

        // Map: number -> { isAnchor, type } for drawing labels
        this.numberInfo = {};

        // Filter state — default: 0 Table ON, 19 Table OFF, Positive ON, Negative ON
        this.filters = { zeroTable: true, nineteenTable: false, positive: true, negative: true };

        // Store the raw/unfiltered prediction for re-filtering
        this._rawPrediction = null;

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
                <h3>European Wheel</h3>
            </div>
            <div class="panel-content">
                <div id="wheelFilters" style="display:flex; flex-wrap:wrap; gap:6px; padding:6px 8px; background:#f1f5f9; border-radius:6px; margin-bottom:4px; align-items:center;">
                    <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#065f46;">
                        <input type="checkbox" id="filter0Table" checked style="accent-color:#22c55e;"> 0 Table
                    </label>
                    <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#581c87;">
                        <input type="checkbox" id="filter19Table" style="accent-color:#9333ea;"> 19 Table
                    </label>
                    <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#16a34a;">
                        <input type="checkbox" id="filterPositive" checked style="accent-color:#22c55e;"> Positive
                    </label>
                    <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e293b;">
                        <input type="checkbox" id="filterNegative" checked style="accent-color:#334155;"> Negative
                    </label>
                    <span id="filteredCount" style="margin-left:auto;font-size:11px;font-weight:700;color:#64748b;"></span>
                </div>
                <div id="wheelNumberLists" style="font-size:11px; padding:4px 8px; line-height:1.6;"></div>
                <div class="wheel-container" id="wheelContainer" style="position: relative; width: 400px; height: 420px; margin: 0 auto;">
                    <canvas id="wheelCanvas" width="400" height="420" style="display: block;"></canvas>
                </div>
                <div style="display:flex; justify-content:center; gap:14px; padding:4px 0; font-size:10px; color:#555;">
                    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;vertical-align:middle;"></span> Positive</span>
                    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1e293b;vertical-align:middle;"></span> Negative</span>
                    <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9ca3af;vertical-align:middle;"></span> Grey</span>
                </div>
            </div>
        `;

        container.appendChild(panel);

        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Attach filter checkbox listeners
        ['filter0Table', 'filter19Table', 'filterPositive', 'filterNegative'].forEach(id => {
            const cb = document.getElementById(id);
            if (cb) cb.addEventListener('change', () => this._onFilterChange());
        });

        this.drawWheel();
        console.log('✅ Wheel visualization initialized (LEFT position)');
    }

    // ── Filter logic ──────────────────────────────────────

    _onFilterChange() {
        this.filters.zeroTable = document.getElementById('filter0Table')?.checked ?? true;
        this.filters.nineteenTable = document.getElementById('filter19Table')?.checked ?? true;
        this.filters.positive = document.getElementById('filterPositive')?.checked ?? true;
        this.filters.negative = document.getElementById('filterNegative')?.checked ?? true;

        console.log('🔄 Filters changed:', this.filters);

        if (this._rawPrediction) {
            this._applyFilters();
        }
    }

    _passesFilter(num) {
        // Table filter: number must be in at least one CHECKED table
        const inZero = ZERO_TABLE_NUMS.has(num);
        const inNineteen = NINETEEN_TABLE_NUMS.has(num);
        const tablePass = (this.filters.zeroTable && inZero) || (this.filters.nineteenTable && inNineteen);
        if (!tablePass) return false;

        // Pos/Neg filter: number must match at least one CHECKED type
        const isPos = POSITIVE_NUMS.has(num);
        const isNeg = NEGATIVE_NUMS.has(num);
        const colorPass = (this.filters.positive && isPos) || (this.filters.negative && isNeg);
        if (!colorPass) return false;

        return true;
    }

    _applyFilters() {
        const raw = this._rawPrediction;
        if (!raw) return;

        const allOn = this.filters.zeroTable && this.filters.nineteenTable &&
                      this.filters.positive && this.filters.negative;

        if (allOn) {
            // No filtering needed — show everything
            this._updateFromRaw(raw.anchors, raw.loose, raw.anchorGroups, raw.extraNumbers);
            this._updateFilteredCount(null);
            this._syncMoneyPanel(raw.prediction);
            this._syncAIPanel(raw.prediction);
            return;
        }

        // Filter primary numbers through checked filters
        const filteredPrimary = raw.prediction.numbers.filter(n => this._passesFilter(n));
        const filteredExtra = (raw.extraNumbers || []).filter(n => this._passesFilter(n));

        // Recalculate anchors from filtered primary
        let filteredAnchors = [], filteredLoose = [], filteredAnchorGroups = [];
        if (filteredPrimary.length > 0 && typeof window.calculateWheelAnchors === 'function') {
            const result = window.calculateWheelAnchors(filteredPrimary);
            filteredAnchors = result.anchors;
            filteredLoose = result.loose;
            filteredAnchorGroups = result.anchorGroups;
        }

        this._updateFromRaw(filteredAnchors, filteredLoose, filteredAnchorGroups, filteredExtra);
        this._updateFilteredCount(filteredPrimary.length + filteredExtra.length);

        // Sync money panel with filtered numbers
        const filteredPrediction = {
            ...raw.prediction,
            numbers: filteredPrimary,
            extraNumbers: filteredExtra,
            anchors: filteredAnchors,
            loose: filteredLoose,
            anchor_groups: filteredAnchorGroups
        };
        this._syncMoneyPanel(filteredPrediction);
        this._syncAIPanel(filteredPrediction);
    }

    _updateFilteredCount(count) {
        const el = document.getElementById('filteredCount');
        if (!el) return;
        if (count === null) {
            el.textContent = '';
        } else {
            el.textContent = `Bet: ${count} nums`;
            el.style.color = count > 0 ? '#16a34a' : '#dc2626';
        }
    }

    _syncMoneyPanel(prediction) {
        if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function') {
            window.moneyPanel.setPrediction(prediction);
            console.log(`✅ Money panel synced with ${prediction.numbers.length} filtered numbers`);
        }
    }

    _syncAIPanel(filteredPrediction) {
        if (window.aiPanel && typeof window.aiPanel.updateFilteredDisplay === 'function') {
            window.aiPanel.updateFilteredDisplay(filteredPrediction);
            console.log(`✅ AI panel synced with ${filteredPrediction.numbers.length} filtered numbers`);
        }
    }

    // ── Core update ───────────────────────────────────────

    _updateFromRaw(anchors, loose, anchorGroups, extraNumbers) {
        this.anchorGroups = anchorGroups || [];
        this.looseNumbers = loose || [];
        this.extraNumbers = extraNumbers || [];

        // Split extra numbers into anchor groups and loose
        if (this.extraNumbers.length > 0 && typeof window.calculateWheelAnchors === 'function') {
            const extraResult = window.calculateWheelAnchors(this.extraNumbers);
            this.extraAnchorGroups = extraResult.anchorGroups || [];
            this.extraLoose = extraResult.loose || [];
        } else {
            this.extraAnchorGroups = [];
            this.extraLoose = [];
        }

        // Build numberInfo map
        this.numberInfo = {};

        this.anchorGroups.forEach(ag => {
            const group = ag.group || [];
            const anchorNum = ag.anchor;
            const type = ag.type || '±1';
            group.forEach(num => {
                this.numberInfo[num] = { category: 'primary', isAnchor: (num === anchorNum), type: type };
            });
        });

        this.looseNumbers.forEach(num => {
            if (!this.numberInfo[num]) {
                this.numberInfo[num] = { category: 'primary', isAnchor: false, type: null };
            }
        });

        this.extraAnchorGroups.forEach(ag => {
            const group = ag.group || [];
            const anchorNum = ag.anchor;
            const type = ag.type || '±1';
            group.forEach(num => {
                if (!this.numberInfo[num]) {
                    this.numberInfo[num] = { category: 'grey', isAnchor: (num === anchorNum), type: type };
                }
            });
        });

        this.extraLoose.forEach(num => {
            if (!this.numberInfo[num]) {
                this.numberInfo[num] = { category: 'grey', isAnchor: false, type: null };
            }
        });

        this._updateNumberLists();
        this.drawWheel();
    }

    updateHighlights(anchors, loose, anchorGroups, extraNumbers, prediction) {
        // Collect all primary numbers from anchorGroups + loose
        const allPrimary = new Set();
        (anchorGroups || []).forEach(ag => {
            (ag.group || []).forEach(n => allPrimary.add(n));
        });
        (loose || []).forEach(n => allPrimary.add(n));

        // Store raw prediction data for re-filtering
        this._rawPrediction = {
            anchors: anchors || [],
            loose: loose || [],
            anchorGroups: anchorGroups || [],
            extraNumbers: extraNumbers || [],
            prediction: prediction || {
                numbers: Array.from(allPrimary),
                extraNumbers: extraNumbers || [],
                anchors: anchors || [],
                loose: loose || [],
                anchor_groups: anchorGroups || [],
                signal: 'BET NOW',
                confidence: 90
            }
        };

        // Ensure prediction.numbers is set
        if (!this._rawPrediction.prediction.numbers || this._rawPrediction.prediction.numbers.length === 0) {
            this._rawPrediction.prediction.numbers = Array.from(allPrimary);
        }

        // Apply current filters
        this._applyFilters();

        console.log(`🎡 Wheel highlights updated`);
    }

    drawWheel() {
        const ctx = this.ctx;
        const centerX = 200;
        const centerY = 210;
        const outerRadius = 150;
        const innerRadius = 90;
        const numberRadius = 120;

        ctx.clearRect(0, 0, 400, 420);

        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#2c3e50';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a252f';
        ctx.fill();

        const angleStep = (2 * Math.PI) / 37;

        this.wheelOrder.forEach((num, idx) => {
            const angle = idx * angleStep - Math.PI / 2;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, outerRadius, angle, angle + angleStep);
            ctx.closePath();

            if (num === 0) {
                ctx.fillStyle = '#2ecc71';
            } else if (this.redNumbers.includes(num)) {
                ctx.fillStyle = '#e74c3c';
            } else {
                ctx.fillStyle = '#2c3e50';
            }
            ctx.fill();

            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 2;
            ctx.stroke();

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

        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
        ctx.fillStyle = '#95a5a6';
        ctx.fill();

        if (Object.keys(this.numberInfo).length > 0) {
            this.drawHighlights();
        }
    }

    _updateNumberLists() {
        const el = document.getElementById('wheelNumberLists');
        if (!el) return;

        const anchors1 = [];
        const anchors2 = [];
        this.anchorGroups.forEach(ag => {
            if (ag.type === '±2') anchors2.push(ag);
            else anchors1.push(ag);
        });

        const greyAnchors1 = [];
        const greyAnchors2 = [];
        this.extraAnchorGroups.forEach(ag => {
            if (ag.type === '±2') greyAnchors2.push(ag);
            else greyAnchors1.push(ag);
        });

        const wSort = (arr) => arr.slice().sort((a, b) => (this.wheelPos[a] ?? 99) - (this.wheelPos[b] ?? 99));
        const looseList = wSort(this.looseNumbers);
        const greyLooseList = wSort(this.extraLoose);

        const badge = (n, bgOverride) => {
            const isPos = this.POSITIVE.has(n);
            const bg = bgOverride || (isPos ? '#22c55e' : '#1e293b');
            return `<span style="display:inline-block;padding:1px 5px;border-radius:4px;background:${bg};color:#fff;font-weight:700;font-size:10px;margin:1px;">${n}</span>`;
        };
        const greyBadge = (n) => badge(n, '#9ca3af');

        let html = '';

        if (anchors1.length > 0) {
            const nums = wSort(anchors1.map(ag => ag.anchor));
            html += `<div style="margin-bottom:3px;"><strong style="color:#334155;">±1 Anchors (${nums.length}):</strong> ${nums.map(n => badge(n)).join('')}</div>`;
        }

        if (anchors2.length > 0) {
            const nums = wSort(anchors2.map(ag => ag.anchor));
            html += `<div style="margin-bottom:3px;"><strong style="color:#334155;">±2 Anchors (${nums.length}):</strong> ${nums.map(n => badge(n)).join('')}</div>`;
        }

        if (looseList.length > 0) {
            html += `<div style="margin-bottom:3px;"><strong style="color:#334155;">Loose (${looseList.length}):</strong> ${looseList.map(n => badge(n)).join('')}</div>`;
        }

        if (greyAnchors1.length > 0) {
            const nums = wSort(greyAnchors1.map(ag => ag.anchor));
            html += `<div style="margin-bottom:3px;"><strong style="color:#6b7280;">Grey ±1 (${nums.length}):</strong> ${nums.map(n => greyBadge(n)).join('')}</div>`;
        }

        if (greyAnchors2.length > 0) {
            const nums = wSort(greyAnchors2.map(ag => ag.anchor));
            html += `<div style="margin-bottom:3px;"><strong style="color:#6b7280;">Grey ±2 (${nums.length}):</strong> ${nums.map(n => greyBadge(n)).join('')}</div>`;
        }

        if (greyLooseList.length > 0) {
            html += `<div style="margin-bottom:3px;"><strong style="color:#6b7280;">Grey Loose (${greyLooseList.length}):</strong> ${greyLooseList.map(n => greyBadge(n)).join('')}</div>`;
        }

        if (!html) {
            html = '<div style="color:#aaa; text-align:center;">Select pairs to see predictions</div>';
        }

        el.innerHTML = html;
    }

    _getHighlightPos(num) {
        const centerX = 200;
        const centerY = 210;
        const highlightRadius = 165;
        const angleStep = (2 * Math.PI) / 37;

        const idx = this.wheelOrder.indexOf(num);
        if (idx === -1) return null;

        const angle = idx * angleStep - Math.PI / 2;
        const highlightAngle = angle + angleStep / 2;
        return {
            x: centerX + Math.cos(highlightAngle) * highlightRadius,
            y: centerY + Math.sin(highlightAngle) * highlightRadius
        };
    }

    drawHighlights() {
        const ctx = this.ctx;

        Object.keys(this.numberInfo).forEach(numStr => {
            const num = parseInt(numStr);
            const info = this.numberInfo[num];
            const pos = this._getHighlightPos(num);
            if (!pos) return;

            if (info.category === 'primary') {
                const isPositive = this.POSITIVE.has(num);
                const fillColor = isPositive ? '#22c55e' : '#1e293b';
                const radius = info.isAnchor ? 12 : 10;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = fillColor;
                ctx.fill();

                if (info.isAnchor && info.type) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 9px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(info.type, pos.x, pos.y);
                }
            } else {
                const radius = info.isAnchor ? 10 : 8;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = '#9ca3af';
                ctx.fill();

                if (info.isAnchor && info.type) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 8px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(info.type, pos.x, pos.y);
                }
            }
        });
    }

    clearHighlights() {
        this.anchorGroups = [];
        this.looseNumbers = [];
        this.extraNumbers = [];
        this.extraAnchorGroups = [];
        this.extraLoose = [];
        this.numberInfo = {};
        this._rawPrediction = null;

        const el = document.getElementById('wheelNumberLists');
        if (el) el.innerHTML = '';

        this._updateFilteredCount(null);

        this.drawWheel();
        console.log('🎡 Wheel highlights cleared');
    }
}

window.rouletteWheel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.rouletteWheel = new RouletteWheel();
        console.log('✅ Roulette Wheel ready (LEFT position)');
    }, 100);
});

console.log('✅ Roulette Wheel script loaded');
