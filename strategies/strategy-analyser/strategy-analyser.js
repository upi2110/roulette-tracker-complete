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
 *     → tunable parameters (confidenceFloor, maxNumbers, weights, …).
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

    // Signals (Phase 2) — pure modules; the aggregator below combines
    // their outputs into the final decision. In the browser, the
    // signal scripts attach themselves to window.StrategyAnalyserSignals
    // and the registry exposes window.StrategyAnalyserSignalsIndex.
    const Signals = (typeof require === 'function')
        ? require('./signals/index.js')
        : (typeof window !== 'undefined' ? window.StrategyAnalyserSignalsIndex : null);

    if (!Snapshot || !Tables) {
        const msg = 'StrategyAnalyser: locked snapshot pipeline not available. ' +
                    'Ensure core/tables/snapshot.js and projections.js are loaded.';
        if (typeof console !== 'undefined') console.error(msg);
        // Don't throw — keep callers running; decide() will return SKIP.
    }

    // ── Tunables ──────────────────────────────────────────────────
    // User-locked rule set (2026-06-19) — Rules 8/9/10/11 removed.
    //
    // Weighting model — share-based redistribution (2026-06-19):
    //   • Each rule group has a configured SHARE (percentage, summing
    //     to 1.0 across all groups).
    //   • Signal files emit intra-rule fractions only (BASE_WGT=1.00).
    //   • At decide time, the aggregator finds which groups actually
    //     fired this spin. The configured shares of NON-firing groups
    //     are split EQUALLY across firing groups (user spec: "if any
    //     rule doesn't trigger, pass equal weightage to triggered
    //     ones"). Effective share per group = configured + bonus.
    //   • Within a firing group: each entry's contribution =
    //     groupEffectiveShare × (entry.weight / sumOfGroupWeights).
    //     This keeps each rule's total contribution capped at its
    //     effective share regardless of how many pair-families
    //     within the rule fire.
    //   • Rule 4 (sub-anchor) and Rule 6 (cross-cell) share the SAME
    //     group ('rule46') because the user defined them as mutually
    //     exclusive and sharing 15%.
    const GROUP_OF = {
        signStreak:       'sign',
        tableStreak:      'table',
        setCarry:         'setCarry',
        subAnchorPattern: 'rule46',
        crossCellRotate:  'rule46',
        crossTableConv:   'gold'
    };
    const DEFAULT_SHARES = {
        sign:     0.20,
        table:    0.20,
        setCarry: 0.20,
        rule46:   0.15,
        gold:     0.25
    };
    const DEFAULTS = {
        confidenceFloor: 60,   // < this → WAIT. Test(Lab) UI tunable.
        maxNumbers:      12,   // ceiling on prediction-list size.
        minNumbers:      6,    // floor when emitting a real prediction.
        minSpinsToFire:  3,    // first 3 spins → WARMUP placeholder.
        shares:          Object.assign({}, DEFAULT_SHARES),
        // Convenience aliases for the UI — settings panel reads per-rule
        // shares from `weights` and writes them back into `shares` via
        // the rule→group map. Kept here so the popup can render rule
        // names instead of group ids.
        weights: {
            signStreak:       DEFAULT_SHARES.sign,
            tableStreak:      DEFAULT_SHARES.table,
            setCarry:         DEFAULT_SHARES.setCarry,
            // Rule 4 ⊕ Rule 6 share rule46 (15%). Each rule's "effective
            // weight" if it fires alone = 15%. Shown as 7.5% each in the
            // UI to make the sum readable; the runtime allocates the
            // whole 15% to whichever fires (or splits if both somehow do).
            subAnchorPattern: DEFAULT_SHARES.rule46 / 2,
            crossCellRotate:  DEFAULT_SHARES.rule46 / 2,
            crossTableConv:   DEFAULT_SHARES.gold
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
            // The most recent decide() explanation. The Explain popup reads.
            lastExplanation: null,
            // Last spinIdx we saw — lets reset / cross-session detection
            // happen automatically if spinCount goes backwards.
            lastSeenIdx: -1
        };
    }

    function resetSessionState(state) {
        if (!state || typeof state !== 'object') return;
        state.lastExplanation = null;
        state.lastSeenIdx     = -1;
    }

    // recordOutcome() removed — Rule 11 (loss-streak floor) no longer in use.

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

    // ── Pair-key extraction from signal name ─────────────────────
    // (T3 cooldown removed — Rule 9 dropped 2026-06-19.)
    /**
     * Pull the pair-family key out of a signal's name so the scope
     * filter (Rule 4 / Rule 6 pair-bound suppression) can drop
     * signals tied to a user-deselected family.
     *
     *   'sub-anchor-pattern/T1/prevPlus1/continuation' → 'prevPlus1'
     *   'sub-anchor-pattern/T2/prevPlus1_13opp/missing-anchor' → 'prevPlus1'
     *   'side-only-streak/T1/prev/continuation'      → 'prev'
     *   'cross-cell-rotation/T2/prevPrev'            → 'prevPrev'
     *   'cross-table-conv/prev'                      → 'prev'
     *   'sign-streak-same'                           → null (not pair-bound)
     */
    function _extractFamilyKey(name) {
        if (!name) return null;
        const parts = name.split('/');
        // Pair-bound signals have at least 2 parts after the prefix.
        // sub-anchor-pattern / table / pairKey / variant
        // cross-table-conv / famKey
        // cross-cell-rotation / table / famKey
        let candidate = null;
        if (name.startsWith('sub-anchor-pattern') || name.startsWith('side-only-streak')) {
            candidate = parts[2];   // pairKey (may end in _13opp)
        } else if (name.startsWith('cross-cell-rotation')) {
            candidate = parts[2];
        } else if (name.startsWith('cross-table-conv')) {
            candidate = parts[1];
        }
        if (!candidate) return null;
        return candidate.endsWith('_13opp') ? candidate.slice(0, -6) : candidate;
    }

    // ── decide() — Phase 3 aggregator ────────────────────────────
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
     *   ctx.sessionState   — required for stateful logic. If absent,
     *                        a transient state is used and per-spin
     *                        determinism still holds (no cross-spin
     *                        memory).
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
        const spinCount = snap.meta.spinCount;
        const lastSpin  = snap.meta.lastSpin;

        // ── Warmup ──
        if (spinCount < params.minSpinsToFire) {
            const need = params.minSpinsToFire - spinCount;
            const out = _decision('WAIT', [], 0,
                `StrategyAnalyser: need ${need} more spin${need === 1 ? '' : 's'} to start firing signals.`);
            out.explanation = { phase: 'WARMUP', spinCount, need };
            return _record(state, idx, out);
        }

        // (Removed 2026-06-19: previous-BET outcome detection — Rule 11
        //  loss-streak floor dropped. T3 cooldown maintenance — Rule 9
        //  dropped. Wait-cap forced bet — Rule 10 dropped.)

        // ── Signal evaluation ──
        // params.disabledRules — Set<string> of rule ids the Test(Lab)
        // weightage UI unchecked. Signals registry honours this list.
        const allSignals = Signals
            ? Signals.evaluateAll(snap, state, params)
            : [];

        // ── USER-SELECTION FILTER (hotfix #4 + #5) ──
        // Two ways the user can restrict the analyser's pair scope:
        //   1) Click specific pair headers in the Electron AI panel
        //      (snap.meta.selections) — STRICT scope: only those
        //      families are eligible.
        //   2) Toggle pair-family visibility in the table-display filter
        //      (snap.meta.visibleFamilies) — SOFT scope: when no
        //      explicit click-selections exist, the analyser limits
        //      itself to the families the user has chosen to see.
        // Non-pair signals (sign-streak / table-streak / set-carry)
        // always pass through — they're partition-wide.
        const sel = (snap.meta && snap.meta.selections) || {};
        const selectedFams = new Set();
        ['table1', 'table2', 'table3'].forEach(t => {
            (sel[t] || []).forEach(k => {
                const base = k.endsWith('_13opp') ? k.slice(0, -6) : k;
                selectedFams.add(base);
            });
        });
        const visibleFamsArr = (snap.meta && Array.isArray(snap.meta.visibleFamilies))
            ? snap.meta.visibleFamilies : [];
        const visibleFams = new Set(visibleFamsArr);

        let scopeFams = null;        // null = autonomous, no restriction
        let scopeSource = 'autonomous';
        if (selectedFams.size > 0) {
            scopeFams   = selectedFams;
            scopeSource = 'selection';
        } else if (visibleFams.size > 0) {
            scopeFams   = visibleFams;
            scopeSource = 'visibility';
        }

        const filteredByUser = [];
        const userScoped = (scopeFams)
            ? allSignals.filter(s => {
                const fam = _extractFamilyKey(s.name);
                if (fam && !scopeFams.has(fam)) {
                    filteredByUser.push({ name: s.name, pair: fam });
                    return false;
                }
                return true;
              })
            : allSignals;

        // (T3 cooldown filter removed — Rule 9 dropped.)
        const fired = userScoped;
        const suppressed = [];

        // ── Share-based scoring (2026-06-19 model) ──
        // Group fired entries by their rule's group (rules 4 + 6 share
        // group 'rule46' since the user defined them as mutually
        // exclusive sharing 15%).
        const shares = (params.shares && Object.keys(params.shares).length)
            ? params.shares
            : DEFAULT_SHARES;
        const entriesByGroup = {};
        for (const e of fired) {
            const g = GROUP_OF[e._ruleId];
            if (!g) continue;
            (entriesByGroup[g] = entriesByGroup[g] || []).push(e);
        }
        const activeGroups   = Object.keys(entriesByGroup);
        const allGroups      = Object.keys(shares);
        const inactiveShare  = allGroups
            .filter(g => !entriesByGroup[g])
            .reduce((s, g) => s + (shares[g] || 0), 0);
        // User spec: split unused shares EQUALLY across firing rules.
        const bonus = activeGroups.length > 0 ? inactiveShare / activeGroups.length : 0;
        const effectiveShare = {};
        activeGroups.forEach(g => {
            effectiveShare[g] = (shares[g] || 0) + bonus;
        });

        // Score per number with normalization INSIDE each group: per
        // entry contribution = groupEffectiveShare × (entry.weight /
        // sumOfGroupWeights). Keeps each group's total contribution
        // capped at its effective share even with many pair-families.
        const scores = new Map();
        let totalUsedWeight = 0;
        const used = [];  // every fired entry contributes in this model
        for (const g of activeGroups) {
            const groupEntries = entriesByGroup[g];
            const totalIntra   = groupEntries.reduce((s, e) => s + (e.weight || 0), 0);
            if (totalIntra <= 0) continue;
            for (const e of groupEntries) {
                const contrib = effectiveShare[g] * (e.weight / totalIntra);
                e._effectiveWeight = contrib;     // surfaced in popup
                used.push(e);
                if (!e.candidates || e.candidates.size === 0) continue;
                const per = contrib / e.candidates.size;
                totalUsedWeight += contrib;
                for (const n of e.candidates) {
                    scores.set(n, (scores.get(n) || 0) + per);
                }
            }
        }
        const usedNames = new Set(used.map(s => s.name));

        // ── Confidence ──
        // With normalized shares summing to 1.0 when all groups fire,
        // totalUsedWeight ≈ 1.0 means "full evidence available".
        // Map directly to percent (capped 100).
        const confidence = Math.min(100, Math.round(100 * totalUsedWeight));

        // ── Action gate (simplified — Rules 10 + 11 removed) ──
        // confidence >= floor → BET, else WAIT. No forced bet, no
        // loss-streak floor elevation.
        const action = (confidence >= params.confidenceFloor) ? 'BET' : 'WAIT';

        // ── Rank and pick top-K ──
        const ranked = Array.from(scores.entries())
            .map(([num, score]) => ({ num, score }))
            .sort((a, b) => b.score - a.score || a.num - b.num);

        let picked = ranked.slice(0, params.maxNumbers).map(o => o.num);

        // Floor — pad with wheel ±1 of last spin if below minNumbers.
        if (picked.length < params.minNumbers) {
            const pad = _neighbours(lastSpin);
            for (const n of pad) {
                if (picked.length >= params.minNumbers) break;
                if (!picked.includes(n)) picked.push(n);
            }
        }

        // UNION with user picks (per user spec: include them always).
        const userNums = _numbersFromUserSelections(snap);
        let numbers = picked;
        if (userNums.length) {
            const merged = [];
            const seen = new Set();
            // User picks first → guaranteed in final list.
            for (const n of userNums) {
                if (seen.has(n)) continue;
                seen.add(n);
                merged.push(n);
                if (merged.length >= params.maxNumbers) break;
            }
            for (const n of picked) {
                if (merged.length >= params.maxNumbers) break;
                if (seen.has(n)) continue;
                seen.add(n);
                merged.push(n);
            }
            numbers = merged;
        }

        // ── Reason text ──
        const floorTxt = `${params.confidenceFloor}%`;
        const reason = (action === 'BET')
            ? `BET — confidence ${confidence}% ≥ floor ${floorTxt}, `
              + `${used.length}/${fired.length} signals used, `
              + `${numbers.length} numbers picked.`
            : `WAIT — confidence ${confidence}% < floor ${floorTxt}; `
              + `${used.length}/${fired.length} signals used.`;

        const out = _decision(action, numbers, confidence, reason);
        out.explanation = {
            phase: 'NORMAL',
            spinCount,
            lastSpin,
            // Active group share map — surfaces the redistribution
            // result so the popup can show "Rule X got 30% (20%+10%
            // bonus from inactive rules)".
            activeGroups,
            inactiveShare,
            redistributionBonus: bonus,
            effectiveShares: Object.assign({}, effectiveShare),
            configuredShares: Object.assign({}, shares),
            firedSignals: fired.map(s => ({
                name: s.name,
                weight: s.weight,                            // intra-rule fraction
                effectiveWeight: s._effectiveWeight || 0,    // post-redistribution
                candidatesCount: s.candidates ? s.candidates.size : 0,
                reason: s.reason,
                details: s.details || null,
                ruleId: s._ruleId || null,
                group: GROUP_OF[s._ruleId] || null,
                used: usedNames.has(s.name)
            })),
            usedSignalNames: Array.from(usedNames),
            suppressedByCooldown: suppressed,         // kept for popup compat; always []
            userSelectedFamilies: Array.from(selectedFams).sort(),
            visibleFamilies:      Array.from(visibleFams).sort(),
            scopeSource,          // 'selection' | 'visibility' | 'autonomous'
            scopeFamilies:        scopeFams ? Array.from(scopeFams).sort() : [],
            filteredByUserSelection: filteredByUser,
            topScored: ranked.slice(0, 20),
            picked,
            userSelectionNumbers: userNums,
            unionedNumbers: numbers,
            totalUsedWeight,
            totalFiredWeight: fired.reduce((s, x) => s + x.weight, 0),
            confidence,
            confidenceFloor: params.confidenceFloor,
            effectiveFloor:  params.confidenceFloor,  // alias kept for popup compat
            confidenceScale: params.confidenceScale,
            forcedBet: false,                          // Rule 10 dropped
            // Per-rule weight + enabled state passed through so the
            // Explain popup can show the current configuration.
            ruleWeights:  Object.assign({}, params.weights || {}),
            disabledRules: params.disabledRules
                ? Array.from(params.disabledRules)
                : []
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
        // (consecutiveWaits tracking removed — Rule 10 dropped.)
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
    // recordOutcome removed (Rule 11 dropped); kept as a no-op shim so
    // any existing caller doesn't crash.
    function recordOutcome(/* state, hit */) { /* no-op */ }
    const api = {
        decide,
        createSessionState,
        resetSessionState,
        recordOutcome,
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
