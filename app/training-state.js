/**
 * app/training-state.js
 *
 * Mode-namespaced training state registry.
 *
 * Purpose: enforce that future User-mode / AI-mode / Hybrid-mode training
 * pipelines cannot silently leak across modes, and let consumers (Auto
 * Test UI badge, Auto Test runner opt-in gate, AI-mode UI status) read
 * the *active* trained mode without coupling to any specific pipeline.
 *
 * Today only Default mode actually trains anything; User-mode, AI-mode,
 * and Hybrid-mode are reserved placeholder slots. The registry treats
 * all four uniformly so future writes cannot escape their slot.
 *
 * Pure module — no DOM, no globals beyond an optional `window.TrainingState`
 * mirror, no side effects on import.
 */
(function (globalRef) {
    'use strict';

    const TRAINING_STATE_MODES = Object.freeze(['default', 'user-mode', 'ai-mode', 'hybrid-mode']);

    // Single backing map. Keys are exactly the four canonical mode ids;
    // values are arbitrary payload objects (or null when not set). Each
    // slot is mutually exclusive — the API surface offers no way to
    // mutate one mode's slot through another mode's id.
    const _store = {
        'default':     null,
        'user-mode':   null,
        'ai-mode':     null,
        'hybrid-mode': null
    };

    // Last successfully trained mode. Read by the Auto Test UI badge
    // and by the runner's opt-in `expectedTrainingMode` gate.
    let _activeMode = null;

    function _isCanonical(modeId) {
        return typeof modeId === 'string' && TRAINING_STATE_MODES.indexOf(modeId) !== -1;
    }

    /**
     * Read the payload for a mode. Returns null when no payload has been
     * stored, including when the mode id is unknown.
     */
    function getStore(modeId) {
        if (!_isCanonical(modeId)) return null;
        return _store[modeId];
    }

    /**
     * Replace the payload for a mode. Unknown / non-string ids are
     * rejected and return false. Returns true on a successful write.
     * Does NOT touch _activeMode.
     */
    function setStore(modeId, payload) {
        if (!_isCanonical(modeId)) return false;
        _store[modeId] = (payload === undefined) ? null : payload;
        return true;
    }

    /**
     * Drop the payload for a single mode. No-op for unknown ids.
     * Returns true if a known mode slot was cleared.
     */
    function clearStore(modeId) {
        if (!_isCanonical(modeId)) return false;
        _store[modeId] = null;
        return true;
    }

    function hasStore(modeId) {
        if (!_isCanonical(modeId)) return false;
        return _store[modeId] !== null && _store[modeId] !== undefined;
    }

    function getActiveMode() { return _activeMode; }

    /**
     * Set the active trained mode. Unknown / non-string values are
     * rejected and the previous value is preserved.
     */
    function setActiveMode(modeId) {
        if (!_isCanonical(modeId)) return false;
        _activeMode = modeId;
        return true;
    }

    function clearActiveMode() { _activeMode = null; }

    const __internal = {
        /** Test-only — wipe the entire registry to construction defaults. */
        reset() {
            for (const id of TRAINING_STATE_MODES) _store[id] = null;
            _activeMode = null;
        }
    };

    const api = {
        TRAINING_STATE_MODES,
        getStore, setStore, clearStore, hasStore,
        getActiveMode, setActiveMode, clearActiveMode,
        __internal
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.TrainingState = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
