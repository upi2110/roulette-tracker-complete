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

// Number Set Filters (3 sets covering all 37 numbers, based on wheel position patterns)
const SET_0_NUMS = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]); // 0 Set: 13 numbers (0/26 same pocket)
const SET_5_NUMS = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);   // 5 Set: 12 numbers
const SET_6_NUMS = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);      // 6 Set: 12 numbers

// Regular Opposites: 180° across the wheel (from renderer-3tables.js, with inline fallback)
const WHEEL_REGULAR_OPPOSITES = (typeof REGULAR_OPPOSITES !== 'undefined') ? REGULAR_OPPOSITES : {
    0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
    10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
    19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
    28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
};

// D13 Opposites: use existing global from renderer-3tables.js, fallback to inline definition
// (renderer-3tables.js loads before roulette-wheel.js so DIGIT_13_OPPOSITES is already available)
const WHEEL_D13_OPPOSITES = (typeof DIGIT_13_OPPOSITES !== 'undefined') ? DIGIT_13_OPPOSITES : {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
};

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

        // Filter state — default: 0 Table ON, 19 Table OFF, Positive ON, Negative ON, All sets ON
        // Default table filter: BOTH (0 AND 19 wheel halves selected).
        // Matches the "Both" radio carrying the `checked` attribute in the
        // HTML template below. Keeps this initial state in sync with the
        // DOM so the first _onFilterChange()/drawWheel() call sees the
        // same truth whether it reads this.filters or the radio group.
        this.filters = { zeroTable: true, nineteenTable: true, positive: true, negative: true,
                         set0: true, set5: true, set6: true };

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
                <button class="btn-toggle" id="toggleWheelPanel">−</button>
            </div>
            <div class="panel-content">
                <div id="wheelFilters" style="display:flex; flex-direction:column; gap:4px; padding:6px 8px; background:#f1f5f9; border-radius:6px; margin-bottom:4px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px;font-weight:700;color:#475569;min-width:40px;">Table:</span>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#065f46;">
                            <input type="radio" name="tableFilter" id="filter0Table" value="0" style="accent-color:#22c55e;"> 0
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#581c87;">
                            <input type="radio" name="tableFilter" id="filter19Table" value="19" style="accent-color:#9333ea;"> 19
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e40af;">
                            <input type="radio" name="tableFilter" id="filterBothTables" value="both" checked style="accent-color:#3b82f6;"> Both
                        </label>
                        <span id="filteredCount" style="margin-left:auto;font-size:11px;font-weight:700;color:#64748b;"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px;font-weight:700;color:#475569;min-width:40px;">Sign:</span>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#16a34a;">
                            <input type="radio" name="signFilter" id="filterPositive" value="positive" style="accent-color:#22c55e;"> +ve
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e293b;">
                            <input type="radio" name="signFilter" id="filterNegative" value="negative" style="accent-color:#334155;"> -ve
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#1e40af;">
                            <input type="radio" name="signFilter" id="filterBothSigns" value="both" checked style="accent-color:#3b82f6;"> Both
                        </label>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10px;font-weight:700;color:#475569;min-width:40px;">Set:</span>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#d97706;">
                            <input type="checkbox" id="filterSet0" checked class="set-cb" style="accent-color:#d97706;"> 0
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#059669;">
                            <input type="checkbox" id="filterSet5" checked class="set-cb" style="accent-color:#059669;"> 5
                        </label>
                        <label style="display:flex;align-items:center;gap:3px;font-size:11px;font-weight:600;cursor:pointer;color:#7c3aed;">
                            <input type="checkbox" id="filterSet6" checked class="set-cb" style="accent-color:#7c3aed;"> 6
                        </label>
                    </div>
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

        // Attach filter radio button listeners
        ['filter0Table', 'filter19Table', 'filterBothTables', 'filterPositive', 'filterNegative', 'filterBothSigns'].forEach(id => {
            const rb = document.getElementById(id);
            if (rb) rb.addEventListener('change', () => this._onFilterChange());
        });

        // Attach set checkbox listeners
        document.querySelectorAll('.set-cb').forEach(cb => {
            cb.addEventListener('change', () => this._onFilterChange());
        });

        this.drawWheel();

        // Wheel panel collapse/expand toggle
        const wheelToggleBtn = document.getElementById('toggleWheelPanel');
        const wheelPanelContent = panel.querySelector('.panel-content');
        if (wheelToggleBtn && wheelPanelContent) {
            wheelToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = wheelPanelContent.style.display !== 'none';
                wheelPanelContent.style.display = isVisible ? 'none' : 'block';
                wheelToggleBtn.textContent = isVisible ? '+' : '−';
            });
        }

        console.log('✅ Wheel visualization initialized (LEFT position)');
    }

    // ── Filter logic ──────────────────────────────────────

    _onFilterChange() {
        // Read table radio group by ID (more reliable than CSS :checked selector)
        const f0 = document.getElementById('filter0Table');
        const f19 = document.getElementById('filter19Table');
        const fBothT = document.getElementById('filterBothTables');

        if (fBothT && fBothT.checked) {
            this.filters.zeroTable = true;
            this.filters.nineteenTable = true;
        } else if (f19 && f19.checked) {
            this.filters.zeroTable = false;
            this.filters.nineteenTable = true;
        } else {
            // Default: 0 table
            this.filters.zeroTable = true;
            this.filters.nineteenTable = false;
        }

        // Read sign radio group by ID
        const fPos = document.getElementById('filterPositive');
        const fNeg = document.getElementById('filterNegative');
        const fBothS = document.getElementById('filterBothSigns');

        if (fBothS && fBothS.checked) {
            this.filters.positive = true;
            this.filters.negative = true;
        } else if (fNeg && fNeg.checked) {
            this.filters.positive = false;
            this.filters.negative = true;
        } else if (fPos && fPos.checked) {
            this.filters.positive = true;
            this.filters.negative = false;
        } else {
            // Default: both
            this.filters.positive = true;
            this.filters.negative = true;
        }

        // Read set checkboxes
        const s0 = document.getElementById('filterSet0');
        const s5 = document.getElementById('filterSet5');
        const s6 = document.getElementById('filterSet6');
        this.filters.set0 = s0 ? s0.checked : true;
        this.filters.set5 = s5 ? s5.checked : true;
        this.filters.set6 = s6 ? s6.checked : true;

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

        // Set filter: number must be in at least one CHECKED set
        const allSetsOn = this.filters.set0 && this.filters.set5 && this.filters.set6;
        if (!allSetsOn) {
            const setPass = (this.filters.set0 && SET_0_NUMS.has(num)) ||
                            (this.filters.set5 && SET_5_NUMS.has(num)) ||
                            (this.filters.set6 && SET_6_NUMS.has(num));
            if (!setPass) return false;
        }

        return true;
    }

    _applyFilters() {
        const raw = this._rawPrediction;
        if (!raw) return;

        const allOn = this.filters.zeroTable && this.filters.nineteenTable &&
                      this.filters.positive && this.filters.negative &&
                      this.filters.set0 && this.filters.set5 && this.filters.set6;

        if (allOn) {
            // No filtering needed — show everything
            // Sync money panel FIRST so _updateNumberLists reads current data
            this._syncMoneyPanel(raw.prediction);
            this._syncAIPanel(raw.prediction);
            this._updateFromRaw(raw.anchors, raw.loose, raw.anchorGroups, raw.extraNumbers);
            this._updateFilteredCount(null);
            return;
        }

        // Filter primary numbers through checked filters
        const filteredPrimary = raw.prediction.numbers.filter(n => this._passesFilter(n));
        const filteredExtra = (raw.extraNumbers || []).filter(n => this._passesFilter(n));

        // Recalculate anchors from filtered primary
        let filteredAnchors = [], filteredLoose = [], filteredAnchorGroups = [];
        try {
            if (filteredPrimary.length > 0 && typeof window.calculateWheelAnchors === 'function') {
                const result = window.calculateWheelAnchors(filteredPrimary);
                filteredAnchors = result.anchors || [];
                filteredLoose = result.loose || [];
                filteredAnchorGroups = result.anchorGroups || [];
            } else if (filteredPrimary.length > 0) {
                // Fallback: treat all filtered numbers as loose
                filteredLoose = filteredPrimary.slice();
            }
        } catch (e) {
            console.error('⚠️ calculateWheelAnchors error, using fallback:', e.message);
            filteredLoose = filteredPrimary.slice();
        }

        // Build filtered prediction and sync ALL panels
        const filteredPrediction = {
            ...raw.prediction,
            numbers: filteredPrimary,
            extraNumbers: filteredExtra,
            anchors: filteredAnchors,
            loose: filteredLoose,
            anchor_groups: filteredAnchorGroups
        };

        // Sync money panel FIRST so _updateNumberLists reads current bet data
        this._syncMoneyPanel(filteredPrediction);
        // Sync AI panel — updates signal count + number display
        this._syncAIPanel(filteredPrediction);

        this._updateFromRaw(filteredAnchors, filteredLoose, filteredAnchorGroups, filteredExtra);
        this._updateFilteredCount(filteredPrimary.length);
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
        try {
            if (window.moneyPanel && typeof window.moneyPanel.setPrediction === 'function') {
                window.moneyPanel.setPrediction(prediction);
                console.log(`✅ Money panel synced with ${prediction.numbers.length} filtered numbers`);
            }
        } catch (e) {
            console.warn('⚠️ Money panel sync failed:', e.message);
        }
    }

    _syncAIPanel(filteredPrediction) {
        try {
            if (window.aiPanel && typeof window.aiPanel.updateFilteredDisplay === 'function') {
                window.aiPanel.updateFilteredDisplay(filteredPrediction);
                console.log(`✅ AI panel synced with ${filteredPrediction.numbers.length} filtered numbers`);
            }
        } catch (e) {
            console.warn('⚠️ AI panel sync failed:', e.message);
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
        if (!this.ctx) return;
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

    /**
     * Group an array of numbers into clusters of wheel-adjacent numbers.
     * Returns array of arrays — each sub-array is a contiguous group on the wheel.
     */
    _groupAdjacent(nums) {
        if (nums.length === 0) return [];
        const sorted = nums.slice().sort((a, b) => (this.wheelPos[a] ?? 99) - (this.wheelPos[b] ?? 99));
        const groups = [];
        let current = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prevPos = this.wheelPos[sorted[i - 1]] ?? 99;
            const currPos = this.wheelPos[sorted[i]] ?? 99;
            if (currPos === prevPos + 1) {
                current.push(sorted[i]);
            } else {
                groups.push(current);
                current = [sorted[i]];
            }
        }
        groups.push(current);
        // Also check wrap-around: if last group ends at position 36 and first starts at 0
        if (groups.length > 1) {
            const lastGroup = groups[groups.length - 1];
            const firstGroup = groups[0];
            const lastPos = this.wheelPos[lastGroup[lastGroup.length - 1]] ?? -1;
            const firstPos = this.wheelPos[firstGroup[0]] ?? 99;
            if (lastPos === 36 && firstPos === 0) {
                // Merge: last group wraps around to first
                groups[0] = lastGroup.concat(firstGroup);
                groups.pop();
            }
        }
        return groups;
    }

    /**
     * Pair numbers by regular opposites.
     * Returns: { pairs: [[a, b], ...], unpaired: [c, ...] }
     * Each pair [a, b] where REGULAR_OPPOSITES[a] === b, both present in nums.
     */
    _pairByOpposites(nums) {
        const numSet = new Set(nums);
        const used = new Set();
        const pairs = [];
        const unpaired = [];

        for (const n of nums) {
            if (used.has(n)) continue;
            const opp = WHEEL_REGULAR_OPPOSITES[n];
            // Special: 0 and 26 share opposite 10. Check both mappings.
            if (opp !== undefined && numSet.has(opp) && !used.has(opp) && opp !== n) {
                pairs.push([n, opp]);
                used.add(n);
                used.add(opp);
            } else {
                unpaired.push(n);
                used.add(n);
            }
        }
        return { pairs, unpaired };
    }

    _updateNumberLists() {
        const el = document.getElementById('wheelNumberLists');
        if (!el) return;

        const wSort = (arr) => arr.slice().sort((a, b) => (this.wheelPos[a] ?? 99) - (this.wheelPos[b] ?? 99));

        // ── Split anchor groups by type ────────────────────
        const pm2Anchors = this.anchorGroups.filter(ag => ag.type === '±2');
        const pm1Anchors = this.anchorGroups.filter(ag => ag.type === '±1');
        const pm2Nums = wSort(pm2Anchors.map(ag => ag.anchor));
        const pm1Nums = wSort(pm1Anchors.map(ag => ag.anchor));
        const looseNums = wSort([...this.looseNumbers]);

        // Grey split
        const greyPm2 = this.extraAnchorGroups.filter(ag => ag.type === '±2');
        const greyPm1 = this.extraAnchorGroups.filter(ag => ag.type === '±1');
        const greyPm2Nums = wSort(greyPm2.map(ag => ag.anchor));
        const greyPm1Nums = wSort(greyPm1.map(ag => ag.anchor));
        const greyLooseNums = wSort([...this.extraLoose]);

        // ── Anchor info lookup ─────────────────────────────
        const anchorInfo = {};
        this.anchorGroups.forEach(ag => { anchorInfo[ag.anchor] = ag; });
        const greyAnchorInfo = {};
        this.extraAnchorGroups.forEach(ag => { greyAnchorInfo[ag.anchor] = ag; });

        // ── Number badge — outlined, light tint + colored border ─
        const numBadge = (n, aInfo, isGrey) => {
            const ai = aInfo ? aInfo[n] : null;
            const label = ai ? `<sup style="font-size:8px;font-weight:700;margin-left:1px;">${ai.type}</sup>` : '';
            let border, bg, color;
            if (isGrey) {
                border = '#9ca3af'; bg = '#f9fafb'; color = '#6b7280';
            } else if (this.POSITIVE.has(n)) {
                border = '#16a34a'; bg = '#f0fdf4'; color = '#15803d';
            } else {
                border = '#334155'; bg = '#f1f5f9'; color = '#1e293b';
            }
            return `<span style="display:inline-block;padding:1px 5px;border-radius:3px;border:2px solid ${border};background:${bg};color:${color};font-weight:700;font-size:12px;">${n}${label}</span>`;
        };

        // ── Build a clean boxed section ────────────────────
        const renderBox = (title, accent, nums, aInfo, isGrey) => {
            if (nums.length === 0) return '';
            const { pairs, unpaired } = this._pairByOpposites(nums);

            let content = '';

            // Opposite pairs — clean row, ↔ marks the pair
            for (const [a, b] of pairs) {
                const posA = this.wheelPos[a] ?? -1;
                const posB = this.wheelPos[b] ?? -1;
                const adj = Math.abs(posA - posB) === 1 || (posA === 0 && posB === 36) || (posA === 36 && posB === 0);
                if (adj) {
                    const sorted = posA < posB ? [a, b] : [b, a];
                    content += `<div style="padding:2px 5px;"><span style="display:inline-flex;gap:1px;border:2px solid #000;border-radius:4px;padding:1px 2px;">${sorted.map(n => numBadge(n, aInfo, isGrey)).join('')}</span> <span style="font-size:9px;color:#64748b;">↔</span></div>`;
                } else {
                    content += `<div style="padding:2px 5px;">${numBadge(a, aInfo, isGrey)} <span style="font-size:10px;color:#64748b;">↔</span> ${numBadge(b, aInfo, isGrey)}</div>`;
                }
            }

            // Unpaired — group wheel-adjacent in black border box
            const sortedUnpaired = wSort(unpaired);
            if (sortedUnpaired.length > 0) {
                const groups = this._groupAdjacent(sortedUnpaired);
                let line = '';
                for (const group of groups) {
                    if (group.length > 1) {
                        line += `<span style="display:inline-flex;gap:1px;border:2px solid #000;border-radius:4px;padding:1px 2px;margin:1px;">${group.map(n => numBadge(n, aInfo, isGrey)).join('')}</span>`;
                    } else {
                        line += `<span style="margin:1px;">${numBadge(group[0], aInfo, isGrey)}</span>`;
                    }
                }
                content += `<div style="padding:2px 5px;">${line}</div>`;
            }

            return `<div style="min-width:0;border:1px solid ${accent};border-radius:4px;margin-bottom:3px;"><div style="padding:1px 6px;font-size:10px;font-weight:700;color:${accent};border-bottom:1px solid ${accent}25;">${title} (${nums.length})</div>${content}</div>`;
        };

        // ── Collect sections — subtle accent per type ──────
        const sections = [];
        if (pm2Nums.length > 0) sections.push(renderBox('±2 Anchors', '#7c3aed', pm2Nums, anchorInfo, false));
        if (pm1Nums.length > 0) sections.push(renderBox('±1 Anchors', '#2563eb', pm1Nums, anchorInfo, false));
        if (looseNums.length > 0) sections.push(renderBox('Loose', '#475569', looseNums, anchorInfo, false));
        if (greyPm2Nums.length > 0) sections.push(renderBox('Grey ±2', '#a8a29e', greyPm2Nums, greyAnchorInfo, true));
        if (greyPm1Nums.length > 0) sections.push(renderBox('Grey ±1', '#a8a29e', greyPm1Nums, greyAnchorInfo, true));
        if (greyLooseNums.length > 0) sections.push(renderBox('Grey Loose', '#a8a29e', greyLooseNums, greyAnchorInfo, true));

        let html = '';
        if (sections.length > 0) {
            html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 4px;align-items:start;">${sections.join('')}</div>`;
        }

        if (!html) {
            html = '<div style="color:#aaa; text-align:center;">Select pairs to see predictions</div>';
        }

        // Bet amount info from money panel
        let betInfoHTML = '';
        if (typeof window !== 'undefined' && window.moneyPanel && window.moneyPanel.sessionData) {
            const sd = window.moneyPanel.sessionData;
            if (sd.isSessionActive && sd.lastBetAmount > 0) {
                const betPerNum = sd.currentBetPerNumber || sd.lastBetAmount;
                const numCount = sd.lastBetNumbers || 0;
                const total = betPerNum * numCount;
                betInfoHTML = `<div style="margin-bottom:4px;padding:4px 8px;background:linear-gradient(135deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:5px;font-size:11px;font-weight:700;color:#92400e;">💰 Next Bet: $${betPerNum}/num × ${numCount} nums = $${total} total</div>`;
            }
        }

        el.innerHTML = betInfoHTML + html;
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
                const radius = info.isAnchor ? 14 : 11;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = fillColor;
                ctx.fill();

                if (info.isAnchor && info.type) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(info.type, pos.x, pos.y);
                }
            } else {
                const radius = info.isAnchor ? 12 : 9;

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = '#9ca3af';
                ctx.fill();

                if (info.isAnchor && info.type) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 10px Arial';
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

        if (this.ctx) this.drawWheel();
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
