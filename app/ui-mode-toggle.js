/**
 * ui-mode-toggle.js — Modern ⇄ Classic UI mode switch.
 *
 * Added 2026-06-28. Modern is today's full UI (untouched). Classic is
 * a different presentation of the SAME data:
 *   • Only 7 pair-families: 0, 19, P+1, P-1, PP+1, PP-1, P (main side only)
 *   • Tables T1 / T2 / T3 laid out side-by-side in that order
 *   • Each table body capped at 18 visible rows, scrollable, scroll-synced
 *
 * Mechanism: a body class (ui-modern / ui-classic) + a renderer
 * override (window.setUiClassicOverride). No business-logic or
 * snapshot-pipeline changes. Toggling is instant; state persists in
 * localStorage. Switching back to Modern fully restores today's view.
 */
(function () {
    'use strict';

    const STORAGE_KEY      = 'ui.mode';
    const DEFAULT_MODE     = 'modern';
    const CLASSIC_ALLOWED  = [
        'ref0', 'ref19', 'prev',
        'prevPlus1', 'prevMinus1',
        'prevPrevPlus1', 'prevPrevMinus1'
    ];

    function _readMode() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            return (v === 'classic' || v === 'modern') ? v : DEFAULT_MODE;
        } catch (e) { return DEFAULT_MODE; }
    }
    function _writeMode(m) {
        try { localStorage.setItem(STORAGE_KEY, m); } catch (e) {}
    }

    // Sync-scroll: when one of the 3 table bodies' scroll container
    // scrolls, mirror scrollTop to the other two. Active only in
    // classic mode (detached on toggle back to modern).
    let _syncBound = false;
    let _syncing  = false;
    function _scrollContainers() {
        return ['gridWrapper1', 'gridWrapper2', 'gridWrapper3']
            .map(id => document.getElementById(id))
            .filter(Boolean);
    }
    function _onScroll(ev) {
        if (_syncing) return;
        _syncing = true;
        const src = ev.target;
        _scrollContainers().forEach(el => {
            if (el !== src) el.scrollTop = src.scrollTop;
        });
        // Release in the next frame so we don't suppress legitimate
        // user scrolls on the other containers.
        requestAnimationFrame(() => { _syncing = false; });
    }
    function _bindSync() {
        if (_syncBound) return;
        _scrollContainers().forEach(el => el.addEventListener('scroll', _onScroll, { passive: true }));
        _syncBound = true;
    }
    function _unbindSync() {
        if (!_syncBound) return;
        _scrollContainers().forEach(el => el.removeEventListener('scroll', _onScroll));
        _syncBound = false;
    }

    function _applyMode(mode) {
        const body = document.body;
        body.classList.remove('ui-modern', 'ui-classic');
        body.classList.add('ui-' + mode);
        // Renderer reads body.classList directly to decide which
        // filter set to apply, so just trigger a repaint.
        if (typeof window.rerenderTables === 'function') {
            window.rerenderTables();
        }
        if (mode === 'classic' && window.ClassicView
            && typeof window.ClassicView.rebuild === 'function') {
            requestAnimationFrame(() => window.ClassicView.rebuild());
        }
        _refreshButtonLabel(mode);
    }

    function _refreshButtonLabel(mode) {
        const btnM = document.getElementById('uiModeBtnModern');
        const btnC = document.getElementById('uiModeBtnClassic');
        if (btnM) btnM.classList.toggle('active', mode === 'modern');
        if (btnC) btnC.classList.toggle('active', mode === 'classic');
    }

    function _setMode(mode) {
        _writeMode(mode);
        _applyMode(mode);
    }

    function _init() {
        // Wire button clicks.
        const btnM = document.getElementById('uiModeBtnModern');
        const btnC = document.getElementById('uiModeBtnClassic');
        if (btnM) btnM.addEventListener('click', () => _setMode('modern'));
        if (btnC) btnC.addEventListener('click', () => _setMode('classic'));
        // Apply persisted (or default) mode now that DOM is ready.
        _applyMode(_readMode());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // Expose for tests.
    if (typeof window !== 'undefined') {
        window.UiModeToggle = {
            getMode:       _readMode,
            setMode:       _setMode,
            applyMode:     _applyMode,
            CLASSIC_ALLOWED: CLASSIC_ALLOWED.slice()
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CLASSIC_ALLOWED, STORAGE_KEY, DEFAULT_MODE };
    }
})();
