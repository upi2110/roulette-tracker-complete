/**
 * Test Setup Helper
 * Bootstraps the DOM and source code for testing outside Electron
 *
 * IMPORTANT: Does NOT change how tables populate - only provides
 * the environment needed to test the existing logic.
 */

const fs = require('fs');
const path = require('path');

/**
 * Create minimal DOM structure matching index-3tables.html
 */
function setupDOM() {
    document.body.innerHTML = `
        <div id="app">
            <div class="input-section">
                <input type="number" id="spinNumber" min="0" max="36" />
                <select id="direction">
                    <option value="C">C</option>
                    <option value="AC">AC</option>
                </select>
                <button id="addBtn">Add</button>
                <button id="undoBtn">Undo</button>
                <button id="resetBtn">Reset</button>
                <span id="info">Spins: 0</span>
            </div>

            <div class="table-container">
                <table id="table1"><thead></thead><tbody id="table1Body"></tbody></table>
                <table id="table2"><thead></thead><tbody id="table2Body"></tbody></table>
                <table id="table3"><thead></thead><tbody id="table3Body"></tbody></table>
            </div>

            <!-- AI Panel -->
            <div id="aiResultsPanel">
                <div class="prediction-numbers"></div>
                <div class="prediction-reasoning"></div>
            </div>
            <div id="signalIndicator">SELECT PAIRS</div>
            <div id="aiPredictionPanel">
                <div id="table1Checkboxes"></div>
                <div id="table2Checkboxes"></div>
                <div id="table3Checkboxes"></div>
                <div id="t1SelectedCount">0</div>
                <div id="t2SelectedCount">0</div>
                <div id="t3SelectedCount">0</div>
            </div>

            <!-- Wheel -->
            <div id="wheelContainer">
                <canvas id="wheelCanvas" width="400" height="400"></canvas>
                <div id="wheelFilters">
                    <div id="filteredCount"></div>
                    <input type="radio" name="tableFilter" id="filter0Table" value="0" checked />
                    <input type="radio" name="tableFilter" id="filter19Table" value="19" />
                    <input type="radio" name="tableFilter" id="filterBothTables" value="both" />
                    <input type="radio" name="signFilter" id="filterPositive" value="positive" />
                    <input type="radio" name="signFilter" id="filterNegative" value="negative" />
                    <input type="radio" name="signFilter" id="filterBothSigns" value="both" checked />
                </div>
            </div>

            <!-- Auto Mode -->
            <div id="aiSelectionPanel">
                <div id="aiPanelContent">
                    <div class="table-selection-section" data-table="3"></div>
                    <div class="table-selection-section" data-table="2"></div>
                    <div class="table-selection-section" data-table="1"></div>
                </div>
            </div>
            <div id="predictionResultsContainer"></div>

            <!-- Money Panel -->
            <div class="info-panels-container-bottom"></div>
            <div id="bankrollValue">$4,000</div>
            <div id="profitValue">$0</div>
            <div id="targetValue">$100</div>
            <div id="nextBetValue">Waiting...</div>
            <div id="chipBreakdownDisplay"></div>
            <div id="totalBetsValue">0</div>
            <div id="winRateValue">--</div>
            <div id="consecutiveLossesValue">0</div>
            <div id="progressFill" style="width: 0%"></div>
            <div id="progressText">0%</div>
            <div id="betHistoryList"></div>
            <div id="toggleBettingBtn">▶️ START BETTING</div>
            <div id="bettingStatus">⏸️ Betting PAUSED</div>
            <div id="toggleStrategyBtn">🟣 Strategy 3: Cautious</div>

            <!-- Auto Test Panel -->
            <div id="autoTestContainer">
                <div id="autoTestHeader"></div>
                <div id="autoTestProgress" style="display:none;">
                    <div id="autoTestProgressBar" style="width:0%"></div>
                    <div id="autoTestProgressText">0%</div>
                </div>
                <div id="autoTestTabs"></div>
                <div id="autoTestContent"></div>
                <div id="autoTestFileInfo"></div>
                <button id="autoTestLoadBtn">📂 Load</button>
                <button id="autoTestRunBtn">▶ Run</button>
                <button id="autoTestExportBtn">📊 Export</button>
                <textarea id="autoTestManualInput"></textarea>
            </div>
        </div>
    `;
}

/**
 * Load renderer-3tables.js source code and extract functions.
 * We eval the file in the current scope to get access to all functions.
 */
function loadRendererSource() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'renderer-3tables.js'),
        'utf-8'
    );
    return src;
}

/**
 * Extract pure functions from renderer-3tables.js for unit testing.
 * This creates a module-like wrapper without changing the source file.
 */
function loadRendererFunctions() {
    const src = loadRendererSource();

    // Create a sandboxed scope that captures the functions
    const sandbox = {};
    const wrappedCode = `
        (function(exports) {
            // Provide document/window stubs
            const document = typeof globalThis.document !== 'undefined' ? globalThis.document : {
                getElementById: () => null,
                querySelectorAll: () => [],
                createElement: () => ({ innerHTML: '', className: '', appendChild: () => {}, querySelectorAll: () => [] }),
                addEventListener: () => {}
            };
            const window = typeof globalThis.window !== 'undefined' ? globalThis.window : {};
            const alert = () => {};
            const confirm = () => true;
            const setTimeout = globalThis.setTimeout;
            const setInterval = globalThis.setInterval;
            const console = globalThis.console;
            const fetch = (...args) => globalThis.fetch ? globalThis.fetch(...args) : Promise.resolve({ json: () => ({}) });

            ${src}

            // Export ALL functions for 100% test coverage
            // Constants
            exports.WHEEL_STANDARD = WHEEL_STANDARD;
            exports.WHEEL_NO_ZERO = WHEEL_NO_ZERO;
            exports.WHEEL_36 = typeof WHEEL_36 !== 'undefined' ? WHEEL_36 : null;
            exports.WHEEL_POS = typeof WHEEL_POS !== 'undefined' ? WHEEL_POS : null;
            exports.REGULAR_OPPOSITES = REGULAR_OPPOSITES;
            exports.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
            exports._PAIR_REFKEY_TO_DATA_PAIR = _PAIR_REFKEY_TO_DATA_PAIR;

            // Core pure functions
            exports.calculatePositionCode = calculatePositionCode;
            exports.calculateWheelDistance = calculateWheelDistance;
            exports.getNumberAtPosition = getNumberAtPosition;
            exports.flipPositionCode = flipPositionCode;
            exports.generateAnchors = generateAnchors;
            exports.calculateReferences = calculateReferences;
            exports.formatPos = typeof formatPos !== 'undefined' ? formatPos : null;
            exports._getPosCodeDistance = _getPosCodeDistance;

            // Wheel/pocket functions
            exports.getWheel36Index = typeof getWheel36Index !== 'undefined' ? getWheel36Index : null;
            exports.getNumbersAtPocket = typeof getNumbersAtPocket !== 'undefined' ? getNumbersAtPocket : null;
            exports.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
            exports.expandTargetsToBetNumbers = typeof expandTargetsToBetNumbers !== 'undefined' ? expandTargetsToBetNumbers : null;
            exports.calculateWheelAnchors = typeof calculateWheelAnchors !== 'undefined' ? calculateWheelAnchors : null;

            // Projection functions
            exports.getTable1NextProjections = typeof getTable1NextProjections !== 'undefined' ? getTable1NextProjections : null;
            exports.getTable2NextProjections = typeof getTable2NextProjections !== 'undefined' ? getTable2NextProjections : null;
            exports.getColumnFromCode = typeof getColumnFromCode !== 'undefined' ? getColumnFromCode : null;

            // Spin management
            exports.spins = spins;
            exports.addSpin = typeof addSpin !== 'undefined' ? addSpin : null;
            exports.undoLast = typeof undoLast !== 'undefined' ? undoLast : null;
            exports.resetAll = resetAll;

            // Table render functions
            exports.renderTable1 = renderTable1;
            exports.renderTable2 = renderTable2;
            exports.renderTable3 = renderTable3;
            exports.render = render;

            // Flash functions
            exports._applyPm1Flash = typeof _applyPm1Flash !== 'undefined' ? _applyPm1Flash : null;
            exports._flashPairCell = typeof _flashPairCell !== 'undefined' ? _flashPairCell : null;
            exports._computeFlashTargets = typeof _computeFlashTargets !== 'undefined' ? _computeFlashTargets : null;
            exports.formatPosFlash = typeof formatPosFlash !== 'undefined' ? formatPosFlash : null;

            // AI data export
            exports.analyzeTable1Hits = typeof analyzeTable1Hits !== 'undefined' ? analyzeTable1Hits : null;
            exports.analyzeTable2Hits = typeof analyzeTable2Hits !== 'undefined' ? analyzeTable2Hits : null;
            exports.analyzeTable3Hits = typeof analyzeTable3Hits !== 'undefined' ? analyzeTable3Hits : null;
            exports.getNextRowProjections = typeof getNextRowProjections !== 'undefined' ? getNextRowProjections : null;
            exports.getAutoSelectedRefs = typeof getAutoSelectedRefs !== 'undefined' ? getAutoSelectedRefs : null;

            // Internal helpers (for full coverage)
            exports.checkRefHit = typeof checkRefHit !== 'undefined' ? checkRefHit : null;
            exports.checkTable3Hit = typeof checkTable3Hit !== 'undefined' ? checkTable3Hit : null;
            exports.logNextProjections = typeof logNextProjections !== 'undefined' ? logNextProjections : null;
            exports.getAIDataV6 = typeof window !== 'undefined' && window.getAIDataV6 ? window.getAIDataV6 : null;
        })
    `;

    try {
        const factory = eval(wrappedCode);
        factory(sandbox);
    } catch (e) {
        console.error('Failed to load renderer functions:', e.message);
        // Try to provide minimal stubs for testing
    }

    return sandbox;
}

/**
 * Load money management panel
 */
function loadMoneyPanelSource() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'money-management-panel.js'),
        'utf-8'
    );
    return src;
}

/**
 * Create a fresh MoneyManagementPanel instance for testing
 */
function createMoneyPanel() {
    // The money panel creates DOM elements in constructor, so DOM must be set up first
    setupDOM();

    const src = loadMoneyPanelSource();

    // Execute in current scope
    const wrappedCode = `
        (function() {
            const alert = () => {};
            const setInterval = () => {};  // Don't start auto-polling in tests
            const setTimeout = (fn) => fn();  // Execute immediately in tests
            const fetch = () => Promise.resolve({ json: () => ({}) });

            ${src}

            return MoneyManagementPanel;
        })()
    `;

    try {
        const MoneyManagementPanel = eval(wrappedCode);
        return new MoneyManagementPanel();
    } catch(e) {
        console.error('Failed to create MoneyPanel:', e.message);
        return null;
    }
}

module.exports = {
    setupDOM,
    loadRendererSource,
    loadRendererFunctions,
    loadMoneyPanelSource,
    createMoneyPanel
};
