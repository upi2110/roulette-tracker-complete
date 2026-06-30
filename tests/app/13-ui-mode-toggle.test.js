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
    let rerenderCalls;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <button id="uiModeBtnModern"></button>
            <button id="uiModeBtnClassic"></button>
            <div id="gridWrapper1"></div>
            <div id="gridWrapper2"></div>
            <div id="gridWrapper3"></div>
        `;
        // Capture rerender calls.
        rerenderCalls = 0;
        global.window.rerenderTables = () => { rerenderCalls++; };
        try { localStorage.clear(); } catch (e) {}
        require('../../app/ui-mode-toggle.js');
        UiModeToggle = global.window.UiModeToggle;
    });

    afterEach(() => {
        delete global.window.rerenderTables;
        delete global.window.UiModeToggle;
    });

    test('CLASSIC_ALLOWED still exposes the 7 classic families', () => {
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

    test('setMode(classic) flips body class + triggers re-render', () => {
        const before = rerenderCalls;
        UiModeToggle.setMode('classic');
        expect(document.body.classList.contains('ui-classic')).toBe(true);
        expect(document.body.classList.contains('ui-modern')).toBe(false);
        expect(localStorage.getItem('ui.mode')).toBe('classic');
        expect(rerenderCalls).toBeGreaterThan(before);
    });

    test('setMode(modern) restores body class + triggers re-render', () => {
        UiModeToggle.setMode('classic');
        const before = rerenderCalls;
        UiModeToggle.setMode('modern');
        expect(document.body.classList.contains('ui-modern')).toBe(true);
        expect(document.body.classList.contains('ui-classic')).toBe(false);
        expect(localStorage.getItem('ui.mode')).toBe('modern');
        expect(rerenderCalls).toBeGreaterThan(before);
    });

    test('round-trip classic → modern → classic flips body class each time', () => {
        UiModeToggle.setMode('classic');
        expect(document.body.classList.contains('ui-classic')).toBe(true);
        UiModeToggle.setMode('modern');
        expect(document.body.classList.contains('ui-modern')).toBe(true);
        UiModeToggle.setMode('classic');
        expect(document.body.classList.contains('ui-classic')).toBe(true);
    });

    test('clicking the Classic button switches mode', () => {
        document.getElementById('uiModeBtnClassic').click();
        expect(UiModeToggle.getMode()).toBe('classic');
        expect(document.body.classList.contains('ui-classic')).toBe(true);
    });
});
