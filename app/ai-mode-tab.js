/**
 * app/ai-mode-tab.js
 *
 * Thin mount module for the AI-mode UI tab. Creates a dedicated
 * section inside #aiPanelContent and instantiates a single
 * AIPredictionPanelCore into it. No betting logic, no engine calls.
 *
 * The tab's DOM section uses class `ai-mode-section` — deliberately
 * NOT `table-selection-section` — so it is NOT hidden by
 * AIAutoModeUI.togglePairSelection() when engine-driven modes
 * (AUTO / T1 / AI-trained) hide the user-pair UI.
 */
(function (globalRef) {
    'use strict';

    let Core;
    if (typeof module !== 'undefined' && module.exports) {
        Core = require('./ai-prediction-panel-core.js').AIPredictionPanelCore;
    } else if (globalRef && globalRef.AIPredictionPanelCore) {
        Core = globalRef.AIPredictionPanelCore;
    }

    /**
     * Create (idempotently) the AI-mode section and mount the core
     * renderer inside it. Returns the AIPredictionPanelCore instance.
     *
     * @param {object} [opts]
     *   - containerOverride: element to use instead of #aiPanelContent
     *                        (primarily for tests).
     *   - title:             string passed to the core (default 'AI-trained')
     *   - mode:              'full' | 'compact' (default 'full')
     *   - forceRemount:      if true, destroy any existing instance first.
     * @returns {AIPredictionPanelCore|null}
     */
    function mountAIModeTab(opts) {
        const options = Object.assign({ title: 'AI-trained', mode: 'full' }, opts || {});
        if (!Core) {
            if (typeof console !== 'undefined') {
                console.warn('AI-mode tab: AIPredictionPanelCore unavailable; skipping mount');
            }
            return null;
        }
        const doc = (typeof document !== 'undefined') ? document : null;
        if (!doc) return null;
        const host = options.containerOverride || doc.getElementById('aiPanelContent');
        if (!host) return null;

        let existing = host.querySelector('#aiModeTab');
        if (existing && options.forceRemount) {
            if (globalRef && globalRef.aiModeTab && typeof globalRef.aiModeTab.destroy === 'function') {
                try { globalRef.aiModeTab.destroy(); } catch (_) { /* best-effort */ }
            }
            if (existing.parentNode) existing.parentNode.removeChild(existing);
            existing = null;
        }
        if (existing) {
            // Already mounted. Return the existing panel instance if one exists.
            return (globalRef && globalRef.aiModeTab) || null;
        }

        const section = doc.createElement('div');
        section.id = 'aiModeTab';
        section.className = 'ai-mode-section';
        section.dataset.aiModeTab = '1';
        section.style.cssText = 'margin-bottom:8px;';

        const body = doc.createElement('div');
        body.id = 'aiModeBody';
        section.appendChild(body);

        // Insert after the auto-mode section (mode buttons) if present,
        // else prepend. This keeps the new tab high in the panel but
        // below the mode controls.
        const autoSection = host.querySelector('#autoModeSection');
        if (autoSection && autoSection.nextSibling) {
            host.insertBefore(section, autoSection.nextSibling);
        } else if (autoSection) {
            host.appendChild(section);
        } else {
            host.insertBefore(section, host.firstChild);
        }

        const panel = new Core(body, { title: options.title, mode: options.mode });
        if (globalRef) globalRef.aiModeTab = panel;
        return panel;
    }

    const api = { mountAIModeTab };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.mountAIModeTab = mountAIModeTab;
        globalRef.AIModeTabAPI = api;

        // Auto-mount once the DOM is ready. Guarded so tests requiring
        // this module do not inadvertently double-mount.
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('DOMContentLoaded', () => {
                // Defer to give AIAutoModeUI time to build #autoModeSection
                // (it already uses a 500 ms timeout after DOMContentLoaded).
                setTimeout(() => {
                    try { mountAIModeTab(); }
                    catch (e) {
                        if (typeof console !== 'undefined') {
                            console.warn('AI-mode tab mount error:', e && e.message);
                        }
                    }
                }, 600);
            });
        }
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
