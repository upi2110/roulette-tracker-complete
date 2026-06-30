/**
 * TESTS: Modern / Classic UI mode toggle (2026-06-28).
 *
 * Verifies:
 *   • module exposes the expected CLASSIC_ALLOWED list (7 main-side pairs)
 *   • body.ui-modern is the default
 *   • setMode('classic') flips body class, persists, and calls the
 *     renderer override hook with the allowed pair-keys
 *   • setMode('modern') restores body class and clears the override
 *   • toggling back/forth doesn't leak override state
 */

describe('ui-mode-toggle module', () => {
    let UiModeToggle;
    let overrideCalls;

    beforeEach(() => {
        jest.resetModules();
        // Fresh DOM with the two toggle buttons + a body to mutate.
        document.body.innerHTML = `
            <button id="uiModeBtnModern"></button>
            <button id="uiModeBtnClassic"></button>
            <div id="gridWrapper1"></div>
            <div id="gridWrapper2"></div>
            <div id="gridWrapper3"></div>
        `;
        // Capture override calls from the renderer hook.
        overrideCalls = [];
        global.window.setUiClassicOverride = (allowed) => {
            overrideCalls.push(allowed ? Array.from(allowed) : null);
        };
        // Reset localStorage.
        try { localStorage.clear(); } catch (e) {}
        // Load the module (it self-invokes _init on DOMContentLoaded
        // OR immediately if readyState !== 'loading').
        require('../../app/ui-mode-toggle.js');
        UiModeToggle = global.window.UiModeToggle;
    });

    afterEach(() => {
        delete global.window.setUiClassicOverride;
        delete global.window.UiModeToggle;
    });

    test('CLASSIC_ALLOWED contains exactly the 7 main-side families', () => {
        expect(UiModeToggle.CLASSIC_ALLOWED.sort()).toEqual([
            'prev', 'prevMinus1', 'prevPlus1',
            'prevPrevMinus1', 'prevPrevPlus1',
            'ref0', 'ref19'
        ].sort());
    });

    test('default mode is modern; body gets ui-modern class', () => {
        expect(UiModeToggle.getMode()).toBe('modern');
        expect(document.body.classList.contains('ui-modern')).toBe(true);
        expect(document.body.classList.contains('ui-classic')).toBe(false);
    });

    test('setMode(classic) flips body class and calls override with allowed keys', () => {
        UiModeToggle.setMode('classic');
        expect(document.body.classList.contains('ui-classic')).toBe(true);
        expect(document.body.classList.contains('ui-modern')).toBe(false);
        expect(localStorage.getItem('ui.mode')).toBe('classic');
        // Last override call should be the allowed list.
        const last = overrideCalls[overrideCalls.length - 1];
        expect(last).toEqual(expect.arrayContaining(UiModeToggle.CLASSIC_ALLOWED));
        expect(last.length).toBe(UiModeToggle.CLASSIC_ALLOWED.length);
    });

    test('setMode(modern) restores body class and clears override (null)', () => {
        UiModeToggle.setMode('classic');
        UiModeToggle.setMode('modern');
        expect(document.body.classList.contains('ui-modern')).toBe(true);
        expect(document.body.classList.contains('ui-classic')).toBe(false);
        expect(localStorage.getItem('ui.mode')).toBe('modern');
        expect(overrideCalls[overrideCalls.length - 1]).toBeNull();
    });

    test('round-trip classic → modern → classic re-applies override', () => {
        UiModeToggle.setMode('classic');
        UiModeToggle.setMode('modern');
        UiModeToggle.setMode('classic');
        const last = overrideCalls[overrideCalls.length - 1];
        expect(last).toEqual(expect.arrayContaining(UiModeToggle.CLASSIC_ALLOWED));
    });

    test('clicking the Classic button switches mode', () => {
        document.getElementById('uiModeBtnClassic').click();
        expect(UiModeToggle.getMode()).toBe('classic');
        expect(document.body.classList.contains('ui-classic')).toBe(true);
    });
});
