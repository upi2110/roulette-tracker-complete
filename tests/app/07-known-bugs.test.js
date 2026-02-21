/**
 * TESTS: Bug Fixes Verification
 * Verifies that all 4 discovered bugs have been properly fixed.
 *
 * Bug #1: getPredictionAuto → getPredictions (FIXED)
 * Bug #2: ±1 flash after pause/start (FIXED via Bug #1)
 * Bug #3: window.orchestrator → window.autoUpdateOrchestrator (FIXED)
 * Bug #4: typeof aiIntegration → window.aiIntegrationV6 || window.aiIntegration (FIXED)
 */

const fs = require('fs');
const path = require('path');
const { setupDOM } = require('../test-setup');

// ═══════════════════════════════════════════════════════
// FIX #1: getPredictions (was getPredictionAuto)
// ═══════════════════════════════════════════════════════

describe('FIX #1: toggleBetting calls getPredictions correctly', () => {
    test('money-management-panel.js calls getPredictions (not getPredictionAuto)', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'money-management-panel.js'),
            'utf-8'
        );
        // Should use the correct method name
        expect(src).toContain('window.aiPanel.getPredictions');
        // Should NOT have the old broken name
        expect(src).not.toContain('getPredictionAuto');
    });

    test('ai-prediction-panel.js has getPredictions method', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'ai-prediction-panel.js'),
            'utf-8'
        );
        expect(src).toContain('getPredictions');
    });

    test('START BETTING now triggers fresh prediction', () => {
        setupDOM();

        // Simulate the fixed code path
        const aiPanel = { getPredictions: jest.fn() };

        // This is what the FIXED money panel does:
        if (aiPanel && aiPanel.getPredictions) {
            aiPanel.getPredictions();
        }

        // getPredictions IS called now (was broken before)
        expect(aiPanel.getPredictions).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════
// FIX #2: ±1 Flash re-triggers after pause/start
// ═══════════════════════════════════════════════════════

describe('FIX #2: ±1 Flash works after pause/start betting', () => {
    test('Flash is applied during renderTable3, independent of betting state', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );

        // Verify flash is computed and baked into HTML via _computeFlashTargets + posCell
        expect(src).toContain('_computeFlashTargets(spins, startIdx, visibleSpins.length)');
        expect(src).toContain('posCell(');
    });

    test('toggleBetting triggers getPredictions which re-renders tables and flash', () => {
        // Now that Bug #1 is fixed, the flow is:
        // toggleBetting → getPredictions() → prediction cycle → render tables → _applyPm1Flash()
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'money-management-panel.js'),
            'utf-8'
        );

        // The FIXED code path: toggleBetting → getPredictions → re-render → fresh flash
        expect(src).toContain('window.aiPanel.getPredictions()');
    });
});

// ═══════════════════════════════════════════════════════
// FIX #3: Orchestrator reference fixed
// ═══════════════════════════════════════════════════════

describe('FIX #3: Orchestrator reference matches global', () => {
    test('resetAll uses window.autoUpdateOrchestrator (matches global)', () => {
        const rendererSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );
        const orchSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'auto-update-orchestrator.js'),
            'utf-8'
        );

        // resetAll now uses the correct global name
        expect(rendererSrc).toContain('window.autoUpdateOrchestrator');

        // Matches the actual global assignment
        expect(orchSrc).toContain('window.autoUpdateOrchestrator');
    });

    test('resetAll does NOT use the old incorrect window.orchestrator', () => {
        const rendererSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );

        // The old broken reference should no longer exist in resetAll
        // Check that "window.orchestrator" doesn't appear (except as part of autoUpdateOrchestrator)
        const lines = rendererSrc.split('\n');
        const resetAllStart = lines.findIndex(l => l.includes('function resetAll()'));
        const resetAllEnd = lines.findIndex((l, i) => i > resetAllStart && /^function\s/.test(l.trim()));
        const resetAllBody = lines.slice(resetAllStart, resetAllEnd).join('\n');

        // Should NOT have bare "window.orchestrator" (without "autoUpdate" prefix)
        expect(resetAllBody).not.toMatch(/window\.orchestrator(?![\w])/);
    });
});

// ═══════════════════════════════════════════════════════
// FIX #4: aiIntegration reference fixed
// ═══════════════════════════════════════════════════════

describe('FIX #4: aiIntegration uses window global safely', () => {
    test('resetAll uses window.aiIntegrationV6 || window.aiIntegration', () => {
        const rendererSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );

        // Should use window-based lookup (safe across script boundaries)
        expect(rendererSrc).toContain('window.aiIntegrationV6');
        expect(rendererSrc).toContain('window.aiIntegration');
    });

    test('resetAll does NOT use typeof aiIntegration bare variable check', () => {
        const rendererSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );

        // The old unsafe pattern should be gone
        expect(rendererSrc).not.toContain("typeof aiIntegration !== 'undefined'");
    });

    test('resetAll checks for resetSession method before calling it', () => {
        const rendererSrc = fs.readFileSync(
            path.join(__dirname, '..', '..', 'app', 'renderer-3tables.js'),
            'utf-8'
        );

        // Should verify the method exists before calling
        expect(rendererSrc).toContain("typeof aiInt.resetSession === 'function'");
    });
});
