/**
 * strategies/strategy-analyser/strategy-analyser.js
 *
 * The unified decision brain for Test(Lab) mode. SHARED between:
 *   • orchestrator (live)        — decisionMode === 'test'
 *   • auto-test-runner (backtest) — method === 'test'
 *
 * Both code paths import THIS file. There is no fork. Any future
 * change to strategy logic goes here — never in the orchestrator or
 * the runner. They are dispatchers; this is the brain.
 *
 * Public API (mirrors the StrategyLab / Strict shape so integration
 * is one-line at each caller):
 *
 *   StrategyAnalyser.decide(engine, spinsArr, idx, ctx)
 *     → { action, selectedPair, selectedFilter, numbers, confidence, reason, explanation }
 *
 *   StrategyAnalyser.createSessionState()
 *     → fresh object the caller owns and passes back in ctx.sessionState.
 *
 *   StrategyAnalyser.resetSessionState(state)
 *     → clears the state in place. Called by the orchestrator on RESET
 *       (spins → 0) and by the runner at the start of every backtest
 *       session.
 *
 *   StrategyAnalyser.getLastExplanation(state)
 *     → debug payload for the Explain popup. Populated by decide().
 *
 *   StrategyAnalyser.DEFAULTS
 *     → tunable parameters (confidenceFloor, maxNumbers, waitCap, …).
 *
 * Decision shape — exact same as StrategyLab so the orchestrator's
 * post-decision fanout (moneyPanel.setPrediction, wheel highlight,
 * etc.) works unchanged.
 *
 *
 *  PHASE 1 SCOPE
 *  -------------
 *  This commit ships only the skeleton + integration. decide() returns
 *  a placeholder WAIT decision with the last spin + its ±1 wheel
 *  neighbours as the "numbers" list, so the panel can render something
 *  but no real signal logic is firing yet.
 *
 *  Phases 2-4 add: signal extractors, weighted aggregator, the
 *  Explain popup, and the Test(Lab) settings UI. Each is one commit,
 *  verified against the same spin history producing identical output
 *  in live and backtest.
 *
 *  Reads (in-process) from core/tables/snapshot.js + projections.js
 *  (the LOCKED pipeline). Never modifies them.
 */

(function (root) {
    'use strict';

    // ── Resolve the locked snapshot pipeline ──────────────────────
    // In Node we require(); in the browser we read from window globals
    // that the script tags already exposed. Either way, we go through
    // the locked pipeline — no math duplication.
    const Snapshot = (typeof require === 'function')
        ? require('../../core/tables/snapshot.js')
        : (typeof window !== 'undefined' ? window.CoreTablesSnapshot : null);

    const Tables = (typeof require === 'function')
        ? require('../../core/tables/projections.js')
        : (typeof window !== 'undefined' ? window.CoreTables : null);

    if (!Snapshot || !Tables) {
        const msg = 'StrategyAnalyser: locked snapshot pipeline not available. ' +
                    'Ensure core/tables/snapshot.js and projections.js are loaded.';
        if (typeof console !== 'undefined') console.error(msg);
        // Don't throw — keep callers running; decide() will return SKIP.
    }

    // ── Tunables ──────────────────────────────────────────────────
    const DEFAULTS = {
        confidenceFloor: 60,   // < this → WAIT (display only). Configurable.
        maxNumbers:      12,   // ceiling on prediction-list size.
        minNumbers:      6,    // floor when we do emit a real prediction.
        waitCap:         3,    // 3 consecutive WAIT → 4th MUST BET.
        minSpinsToFire:  3,    // first 3 spins → WARMUP / SKIP placeholders.
        // Signal weights (phase 2 will use these; defaults exposed now
        // so the Explain popup can render them even with the skeleton).
        weights: {
            signStreak:       0.30,
            tableStreak:      0.30,
            setCarry:         0.25,
            subAnchorPattern: 0.90,
            sideOnlyStreak:   0.60,
            crossCellRotate:  0.70,
            crossTableConv:   1.20
        },
        // Streak-betting policy (Phase 3 implements; declared here so
        // the contract is visible at the top of the file).
        streakPolicy: {
            waitBeforeHit:   2,   // streak hits 1-2: WAIT
            betDuringHits:   [3, 4],
            waitAfterHit:    5,
            t3CooldownRounds: 3    // missed streak on T3 pair → cool 3 rounds
        }
    };

    // ── Session state ─────────────────────────────────────────────
    /**
     * Each caller (orchestrator vs runner) owns its own state.
     * decide() reads + mutates it; nothing else does.
     *
     * Shape — kept stable across phases so callers don't break when
     * Phase 2/3 fill in the brain.
     */
    function createSessionState() {
        return {
            // Counter of consecutive WAIT decisions. Phase 3: when this
            // reaches DEFAULTS.waitCap (3), the next decide() forces BET.
            consecutiveWaits: 0,
            // Per-pair streak tracker. Key = pair dataKey, value =
            // { side: 'S'|'O'|null, length: int, lastHitIdx: int }.
            // Phase 3 populates.
            pairStreaks: {},
            // T3 cooling-down pairs. Key = dataPair, value = rounds
            // remaining. Decremented every spin until 0.
            t3Cooldowns: {},
            // The most recent decide() explanation. Phase 4 popup reads.
            lastExplanation: null,
            // Last spinIdx we saw — lets reset / cross-session detection
            // happen automatically if spinCount goes backwards.
            lastSeenIdx: -1
        };
    }

    function resetSessionState(state) {
        if (!state || typeof state !== 'object') return;
        state.consecutiveWaits = 0;
        state.pairStreaks      = {};
        state.t3Cooldowns      = {};
        state.lastExplanation  = null;
        state.lastSeenIdx      = -1;
    }

    function getLastExplanation(state) {
        return (state && state.lastExplanation) || null;
    }

    // ── Helpers ──────────────────────────────────────────────────
    /**
     * Wheel ±1 neighbours of a number. Used as fallback when no
     * signals fire so the panel still has SOMETHING to render.
     */
    function _neighbours(num) {
        if (typeof num !== 'number' || !Tables) return [];
        const out = new Set([num]);
        const idx = Tables.getWheel36Index(num);
        if (idx < 0) return Array.from(out);
        Tables.getNumbersAtPocket(idx - 1).forEach(n => out.add(n));
        Tables.getNumbersAtPocket(idx + 1).forEach(n => out.add(n));
        return Array.from(out);
    }

    /**
     * Merge user-clicked pair selections (from meta.selections) into
     * a flat candidate-numbers list. Phase 3 will use this to UNION
     * with the analyser's own picks.
     */
    function _numbersFromUserSelections(snap) {
        if (!snap || !snap.meta || !snap.meta.selections) return [];
        const set = new Set();
        const sel = snap.meta.selections;
        const t1 = (snap.table1 && snap.table1.nextProjections) || {};
        const t2 = (snap.table2 && snap.table2.nextProjections) || {};
        const t3 = (snap.table3 && snap.table3.nextProjections) || {};
        (sel.table1 || []).forEach(k => {
            const e = t1[k];
            if (!e) return;
            ['first', 'second', 'third'].forEach(p => {
                ((e[p] && e[p].numbers) || []).forEach(n => set.add(n));
            });
        });
        (sel.table2 || []).forEach(k => {
            const e = t2[k];
            if (!e) return;
            ['first', 'second', 'third'].forEach(p => {
                ((e[p] && e[p].numbers) || []).forEach(n => set.add(n));
            });
        });
        (sel.table3 || []).forEach(k => {
            const e = t3[k];
            if (!e) return;
            (e.numbers || []).forEach(n => set.add(n));
        });
        return Array.from(set);
    }

    // ── decide() — Phase 1 placeholder ───────────────────────────
    /**
     * Single entry point. Both live and backtest call THIS.
     *
     * @param {Object} engine    aiAutoEngine instance (kept for parity
     *                           with StrategyLab signature; not used
     *                           internally — analyser reads only from
     *                           snapshot data).
     * @param {Array<number>} spinsArr  oldest-to-newest spin actuals.
     * @param {number} idx       index of "the spin we're deciding for"
     *                           — same convention as StrategyLab.
     * @param {Object} ctx       caller context.
     *   ctx.sessionState   — required for stateful logic (Phase 3+).
     *                        If absent, a transient state is used and
     *                        per-spin determinism still holds.
     *   ctx.params         — partial DEFAULTS overrides. Phase 4 wires
     *                        the Test(Lab) settings UI through this.
     *   ctx.snapshotOpts   — passed straight through to snapshot()
     *                        (visibleFamilies, selections, filters).
     *
     * @returns Decision { action, selectedPair, selectedFilter,
     *                    numbers, confidence, reason, explanation }
     */
    function decide(engine, spinsArr, idx, ctx) {
        const c = ctx || {};
        const params = Object.assign({}, DEFAULTS, c.params || {});
        const state  = c.sessionState || createSessionState();

        // ── Reset detection ──
        // If idx moved backwards (RESET / new session), wipe state.
        if (state.lastSeenIdx > idx + 1) {
            resetSessionState(state);
        }

        // ── Snapshot ──
        if (!Snapshot || typeof Snapshot.snapshot !== 'function') {
            const out = _decision('SKIP', [], 0,
                'StrategyAnalyser: snapshot module not loaded.');
            return _record(state, idx, out);
        }
        const snap = Snapshot.snapshot(spinsArr || [], c.snapshotOpts || {});

        // ── Warmup ──
        const spinCount = snap.meta.spinCount;
        if (spinCount < params.minSpinsToFire) {
            const need = params.minSpinsToFire - spinCount;
            const out = _decision('WAIT', [], 0,
                `StrategyAnalyser: need ${need} more spin${need === 1 ? '' : 's'} to start firing signals.`);
            out.explanation = { phase: 'WARMUP', spinCount, need };
            return _record(state, idx, out);
        }

        // ── Phase 1 placeholder ──
        // No signal extractors yet. We emit a WAIT carrying:
        //   • the last spin's wheel ±1 neighbours (always something
        //     visible so the panel renders), UNIONed with whatever
        //     numbers the user has manually selected in the AI panel.
        //   • confidence = 0
        //   • action = WAIT (money panel skips the bet)
        const lastSpin = snap.meta.lastSpin;
        const fallback = _neighbours(lastSpin);
        const userNums = _numbersFromUserSelections(snap);
        const numbers  = Array.from(new Set([...fallback, ...userNums]))
            .slice(0, params.maxNumbers);

        const out = _decision('WAIT', numbers, 0,
            `StrategyAnalyser PHASE 1 (skeleton): ${numbers.length} placeholder ` +
            `number${numbers.length === 1 ? '' : 's'} from wheel ±1 around ${lastSpin}` +
            (userNums.length ? ` UNIONed with ${userNums.length} from user picks.` : '.'));

        out.explanation = {
            phase: 'PHASE_1_PLACEHOLDER',
            spinCount,
            lastSpin,
            neighbours: fallback,
            userSelectionNumbers: userNums,
            sessionState: {
                consecutiveWaits: state.consecutiveWaits,
                t3Cooldowns: Object.assign({}, state.t3Cooldowns)
            },
            params: {
                confidenceFloor: params.confidenceFloor,
                maxNumbers: params.maxNumbers
            }
        };
        return _record(state, idx, out);
    }

    // ── Decision factory ─────────────────────────────────────────
    function _decision(action, numbers, confidence, reason) {
        return {
            action,
            selectedPair:   null,    // analyser doesn't lock a pair —
                                     // selections come from the user (UNION)
                                     // or are implicit in the candidate set.
            selectedFilter: null,
            numbers:        Array.isArray(numbers) ? numbers.slice() : [],
            confidence:     typeof confidence === 'number' ? confidence : 0,
            reason:         String(reason || ''),
            explanation:    null     // populated by caller before _record
        };
    }

    function _record(state, idx, decision) {
        if (decision.action === 'WAIT') {
            state.consecutiveWaits = (state.consecutiveWaits || 0) + 1;
        } else if (decision.action === 'BET') {
            state.consecutiveWaits = 0;
        }
        state.lastExplanation = decision.explanation;
        state.lastSeenIdx     = idx;
        return decision;
    }

    // ── Parity helpers (testing) ─────────────────────────────────
    /**
     * Deterministic-output check: live and backtest must produce
     * identical decisions for identical (spins, idx, params). The
     * test harness calls this with two fresh states; if the assertion
     * ever fails, that's a divergence bug.
     */
    function assertParity(engine, spinsArr, idx, ctx) {
        const sA = createSessionState();
        const sB = createSessionState();
        const dA = decide(engine, spinsArr, idx,
            Object.assign({}, ctx || {}, { sessionState: sA }));
        const dB = decide(engine, spinsArr, idx,
            Object.assign({}, ctx || {}, { sessionState: sB }));
        const keysToCheck = ['action', 'selectedPair', 'confidence', 'reason'];
        for (const k of keysToCheck) {
            if (dA[k] !== dB[k]) return { ok: false, key: k, a: dA[k], b: dB[k] };
        }
        if (JSON.stringify(dA.numbers) !== JSON.stringify(dB.numbers)) {
            return { ok: false, key: 'numbers', a: dA.numbers, b: dB.numbers };
        }
        return { ok: true };
    }

    // ── Public API ────────────────────────────────────────────────
    const api = {
        decide,
        createSessionState,
        resetSessionState,
        getLastExplanation,
        assertParity,
        DEFAULTS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.StrategyAnalyser = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
