/**
 * app/training-router.js
 *
 * Pure training-mode dispatcher for the TRAIN button.
 *
 * The UI (ai-auto-mode-ui.js) renders a dropdown next to TRAIN. On click,
 * the UI calls `runTraining(modeId, ctx)`, supplying handlers for each
 * mode. The router validates the mode, dispatches to the matching
 * handler, surfaces status messages via ctx.onStatus, and never throws.
 *
 * No DOM. No globals. No side effects beyond calling the supplied
 * handlers and onStatus hook. Safe to load from Node tests.
 */
(function (globalRef) {
    'use strict';

    const TRAINING_MODES = Object.freeze(['default', 'user-mode', 'ai-mode', 'hybrid-mode']);
    const TRAINING_DEFAULT_MODE = 'default';

    const TRAINING_MODE_META = Object.freeze({
        'default': Object.freeze({
            id: 'default',
            label: 'Default mode',
            description: 'Existing legacy training pipeline (engine.train).',
            requiresEngineTrain: true
        }),
        'user-mode': Object.freeze({
            id: 'user-mode',
            label: 'User-mode',
            description: 'User-defined training pipeline (placeholder — not yet implemented).',
            requiresEngineTrain: false
        }),
        'ai-mode': Object.freeze({
            id: 'ai-mode',
            label: 'AI-mode',
            description: 'AI-trained learns live from spins; no pre-training pipeline runs in this phase.',
            requiresEngineTrain: false
        }),
        'hybrid-mode': Object.freeze({
            id: 'hybrid-mode',
            label: 'Hybrid-mode',
            description: 'Hybrid AI + user pipeline (placeholder — not yet implemented).',
            requiresEngineTrain: false
        })
    });

    function _isValidMode(modeId) {
        return typeof modeId === 'string' && TRAINING_MODES.indexOf(modeId) !== -1;
    }

    // Resolve the TrainingState registry lazily so the router stays
    // import-safe when the registry is missing (older builds, isolated
    // unit tests). Returns null when the registry cannot be loaded.
    function _resolveTrainingState() {
        if (typeof require === 'function') {
            try { return require('./training-state.js'); }
            catch (_) { /* fall through */ }
        }
        if (typeof globalRef !== 'undefined' && globalRef && globalRef.TrainingState) {
            return globalRef.TrainingState;
        }
        return null;
    }

    /**
     * Record a successful training run into the mode registry.
     *
     * Default mode → writes a marker payload + sets active mode.
     * User-mode / AI-mode / Hybrid-mode → only marks active when the
     *   handler returned a non-skipped payload (i.e. their real pipeline
     *   ran). The current placeholder handlers return {skipped:true} so
     *   they DO NOT touch the registry.
     *
     * Returns the {modeId, timestamp} record that was written, or null.
     */
    function _recordTrainingResult(modeId, ranEngineTrain, handlerResult) {
        const TS = _resolveTrainingState();
        if (!TS) return null;
        const isPlaceholder = !!(handlerResult && handlerResult.skipped === true);
        if (modeId === 'default') {
            if (!ranEngineTrain) return null;
            const marker = { trainedAt: Date.now(), by: 'router' };
            TS.setStore('default', marker);
            TS.setActiveMode('default');
            return { modeId: 'default', timestamp: marker.trainedAt };
        }
        // Reserved modes: do NOT mark active until a real pipeline
        // returns a non-skipped payload. Placeholder handlers leave
        // both the slot and the active marker untouched.
        if (isPlaceholder) return null;
        const marker = { trainedAt: Date.now(), by: 'router' };
        TS.setStore(modeId, marker);
        TS.setActiveMode(modeId);
        return { modeId, timestamp: marker.trainedAt };
    }

    function _normalizeMode(modeId, onStatus) {
        if (_isValidMode(modeId)) return modeId;
        if (typeof onStatus === 'function') {
            try { onStatus(`Unknown training mode "${String(modeId)}" — falling back to ${TRAINING_DEFAULT_MODE}`); }
            catch (_) { /* swallow */ }
        }
        return TRAINING_DEFAULT_MODE;
    }

    function _pickHandler(modeId, ctx) {
        switch (modeId) {
            case 'default':     return ctx && ctx.defaultModeHandler;
            case 'user-mode':   return ctx && ctx.userModeHandler;
            case 'ai-mode':     return ctx && ctx.aiModeHandler;
            case 'hybrid-mode': return ctx && ctx.hybridModeHandler;
            default: return null;
        }
    }

    /**
     * Dispatch to the handler registered for the given training mode.
     *
     * @param {string} modeId  one of TRAINING_MODES; unknown ⇒ default.
     * @param {object} ctx
     *   - userModeHandler:   () => Promise<any>|any
     *   - aiModeHandler:     () => Promise<any>|any
     *   - hybridModeHandler: () => Promise<any>|any
     *   - onStatus(msg):     optional UI hook for human-readable status
     * @returns {Promise<{mode:string, ok:boolean, message?:string, ranEngineTrain:boolean, result?:any}>}
     */
    async function runTraining(modeId, ctx) {
        const safeCtx = ctx || {};
        const onStatus = (typeof safeCtx.onStatus === 'function') ? safeCtx.onStatus : null;
        const mode = _normalizeMode(modeId, onStatus);
        const meta = TRAINING_MODE_META[mode];
        const handler = _pickHandler(mode, safeCtx);

        if (typeof handler !== 'function') {
            const msg = `No handler registered for training mode "${mode}"`;
            if (onStatus) { try { onStatus(msg); } catch (_) {} }
            return {
                mode, ok: false, message: msg,
                ranEngineTrain: false
            };
        }

        try {
            const result = await Promise.resolve(handler());
            const ranEngineTrain = !!(meta && meta.requiresEngineTrain);
            // Record into the mode-namespaced training registry so the
            // Auto Test UI badge and the runner's opt-in
            // `expectedTrainingMode` gate know which mode last trained.
            // Default mode keeps a thin marker only — the legacy engine
            // weights remain owned by window.aiAutoEngine. Reserved
            // placeholder modes (user-mode / ai-mode / hybrid-mode)
            // intentionally do NOT mark themselves active until their
            // real handlers return a non-skipped payload.
            const lastTrained = _recordTrainingResult(mode, ranEngineTrain, result);
            return Object.assign({
                mode,
                ok: true,
                ranEngineTrain,
                result
            }, lastTrained ? { lastTrained } : {});
        } catch (err) {
            const msg = `Training (${mode}) failed: ${(err && err.message) || String(err)}`;
            if (onStatus) { try { onStatus(msg); } catch (_) {} }
            return {
                mode, ok: false, message: msg,
                ranEngineTrain: false
            };
        }
    }

    const api = {
        TRAINING_MODES,
        TRAINING_DEFAULT_MODE,
        TRAINING_MODE_META,
        runTraining
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.TrainingRouter = api;
        globalRef.runTraining = runTraining;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
