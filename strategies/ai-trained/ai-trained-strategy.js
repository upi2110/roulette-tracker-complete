/**
 * app/ai-trained-strategy.js
 *
 * Backtest (Auto Test) wrapper over AITrainedController.
 *
 * Phase 1, Step 2. Thin adapter only. No DOM, no window.spins, no mutation of
 * the engine, no changes to other strategies.
 *
 * Public API:
 *   decideAITrainedStrategy(engine, testSpins, idx, ctxOverrides = {})
 *   resetAITrainedStrategy(engine)
 *
 * Contract: returns the EXACT schema produced by AITrainedController#decide().
 * Deterministic for identical (testSpins, idx) when starting from a fresh
 * controller — idx === 0 resets automatically. Callers may also pass
 * ctxOverrides.reset = true to force-reset, or ctxOverrides.controller to
 * inject their own instance (full determinism with zero shared state).
 */
(function (globalRef) {
    'use strict';

    // Resolve the controller module in both Node (require) and browser (window).
    let ControllerAPI;
    if (typeof module !== 'undefined' && module.exports) {
        ControllerAPI = require('./ai-trained-controller.js');
    } else if (globalRef && globalRef.AITrainedControllerAPI) {
        ControllerAPI = globalRef.AITrainedControllerAPI;
    } else {
        throw new Error('ai-trained-strategy: AITrainedController not available');
    }

    const { AITrainedController } = ControllerAPI;

    // Per-engine controller cache. Keyed by engine reference so Auto Test
    // sessions don't leak state across runs but reuse within a single run.
    // Falls back to a Map if WeakMap keys cannot be used (e.g. engine=null).
    const _cache = (typeof WeakMap !== 'undefined') ? new WeakMap() : new Map();
    // Dedicated slot for the "no-engine" backtest path.
    let _nullEngineController = null;
    // Auxiliary set of engine refs the WeakMap has cached, used by
    // resetAITrainedStrategyAll() to clear every cached controller on
    // a TRAIN-mode change. WeakMap entries are not enumerable, so we
    // shadow-track keys here. Engines in this app are session-scoped
    // singletons; the temporary strong references are intentional and
    // bounded by the app lifetime.
    const _seenEngines = new Set();

    function _getController(engine, opts) {
        if (engine == null) {
            if (!_nullEngineController) _nullEngineController = new AITrainedController(opts);
            return _nullEngineController;
        }
        let c = _cache.get(engine);
        if (!c) {
            c = new AITrainedController(opts);
            _cache.set(engine, c);
            _seenEngines.add(engine);
        }
        return c;
    }

    function _clearController(engine) {
        if (engine == null) { _nullEngineController = null; return; }
        _cache.delete(engine);
        _seenEngines.delete(engine);
    }

    /**
     * Drop every cached controller — both the null-engine slot and
     * every per-engine WeakMap entry the strategy module has seen.
     *
     * Called by AIAutoModeUI on TRAIN-mode change and on TRAIN click
     * so a fresh AI-trained controller is constructed on the next
     * decideAITrainedStrategy(). Idempotent and safe on cold start.
     */
    function resetAITrainedStrategyAll() {
        _nullEngineController = null;
        // Snapshot first — the loop mutates _cache and _seenEngines.
        const seen = Array.from(_seenEngines);
        for (const eng of seen) {
            _cache.delete(eng);
        }
        _seenEngines.clear();
    }

    /**
     * Backtest decision function.
     *
     * @param {object|null} engine - AIAutoEngine reference (used only as a cache
     *        key; never mutated, never read). May be null for pure backtests.
     * @param {number[]} testSpins - full spin history for the simulated session
     *        (chronological). Only items in [0, 36] are used.
     * @param {number} idx - 0-based spin index to decide on.
     * @param {object} [ctxOverrides]
     *        - controller?: AITrainedController  inject a specific instance
     *        - opts?: object   controller options on first-creation only
     *        - reset?: boolean  force-reset the cached controller before decide
     *        - historySlice?: 'upToIdx' (default) | 'all'
     *              'upToIdx' passes testSpins.slice(0, idx) as history,
     *              matching the "outcome for spin idx is unknown" backtest model.
     *              'all' passes the entire testSpins array (diagnostic only).
     * @returns {object} decision — identical schema to controller.decide().
     */
    function decideAITrainedStrategy(engine, testSpins, idx, ctxOverrides) {
        if (!Array.isArray(testSpins)) {
            throw new TypeError('testSpins must be an array');
        }
        if (!Number.isInteger(idx) || idx < 0) {
            throw new TypeError('idx must be a non-negative integer');
        }
        const ctx = ctxOverrides || {};

        let controller = ctx.controller;
        if (!controller) {
            controller = _getController(engine, ctx.opts);
            // Implicit session boundary: idx === 0 means a new session started.
            if (idx === 0) controller.resetSession();
        }
        if (ctx.reset) controller.resetSession();

        const mode = ctx.historySlice || 'upToIdx';
        const history = (mode === 'all')
            ? testSpins.slice()
            : testSpins.slice(0, idx);

        // Delegate. Controller enforces 12-number cap, WAIT/SHADOW invariants,
        // null selectedPair, and the full decision schema.
        return controller.decide(history, idx);
    }

    /**
     * Manually drop the cached controller for a given engine. Useful between
     * Auto Test runs when reusing the same engine reference.
     */
    function resetAITrainedStrategy(engine) {
        _clearController(engine);
    }

    const api = {
        decideAITrainedStrategy,
        resetAITrainedStrategy,
        resetAITrainedStrategyAll,
        // Exposed for tests — internal surface.
        __internal: { _getController, _clearController, _seenEngines }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalRef) {
        globalRef.decideAITrainedStrategy = decideAITrainedStrategy;
        globalRef.resetAITrainedStrategy = resetAITrainedStrategy;
        globalRef.resetAITrainedStrategyAll = resetAITrainedStrategyAll;
        globalRef.AITrainedStrategyAPI = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
