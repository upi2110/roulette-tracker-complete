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
    const DEFAULTS = {
        confidenceFloor:  60,   // < this → WAIT (display only). Configurable.
        confidenceScale:  8.0,  // sum of USED signal weights mapped to 100%.
                                // With maxUseSignals=5 + minUseWeight=0.5,
                                // 5 top signals ≈ 4-5 weight = 50-63%.
                                // Floor (60%) actually bites. Tunable.
        maxNumbers:       12,   // ceiling on prediction-list size.
        minNumbers:       6,    // floor when emitting a real prediction.
        waitCap:          3,    // 3 consecutive WAIT → 4th MUST BET.
        minSpinsToFire:   3,    // first 3 spins → WARMUP / SKIP placeholders.
        t3CooldownRounds: 3,    // missed streak on T3 pair → cool 3 rounds
        // — Signal selection (NEW, addresses "use best signals only") —
        minUseWeight:     0.50, // signals below this don't contribute
        maxUseSignals:    5,    // top-N (by weight) used after filter
                                // 5 strong-only is concentrated evidence;
                                // every extra signal beyond top-5 is noise
        // — Loss-streak gate (NEW, addresses "still bets after losses") —
        lossStreakLimit:  2,    // # consecutive misses before floor elevates
        lossFloorStep:    10,   // floor +X per consecutive miss beyond limit
        lossFloorMax:     40,   // floor +N max (so 4+ losses → floor=100%)
        // Reference weights (Phase 2 signals hard-code these as base values;
        // documented here so Phase 4 settings UI can offer overrides).
        weights: {
            signStreak:       0.30,
            tableStreak:      0.30,
            setCarry:         0.25,
            subAnchorPattern: 0.90,
            sideOnlyStreak:   0.60,
            crossCellRotate:  0.70,
            crossTableConv:   1.20
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
            lastSeenIdx: -1,
            // Loss-streak tracking (hotfix #3). Reset to 0 on every BET hit;
            // incremented on every BET miss. After lossStreakLimit (2),
            // decide() elevates the effective confidence floor so we
            // emit WAIT until evidence strengthens.
            consecutiveLosses: 0,
            // Outcome detection: when decide() returns BET, stash the
            // numbers + the snapshot's spinCount so the NEXT decide()
            // call can check whether the just-landed spin hit them.
            lastBetSpinCount: null,
            lastBetNumbers:   null
        };
    }

    function resetSessionState(state) {
        if (!state || typeof state !== 'object') return;
        state.consecutiveWaits = 0;
        state.pairStreaks      = {};
        state.t3Cooldowns      = {};
        state.lastExplanation  = null;
        state.lastSeenIdx      = -1;
        state.consecutiveLosses = 0;
        state.lastBetSpinCount  = null;
        state.lastBetNumbers    = null;
    }

    /**
     * Record the outcome of the previous BET. Called by the orchestrator
     * (or by decide() itself when it detects a new spin advanced past
     * lastBetSpinCount). hit=true resets the loss counter; hit=false
     * increments it.
     */
    function recordOutcome(state, hit) {
        if (!state) return;
        if (hit) state.consecutiveLosses = 0;
        else     state.consecutiveLosses = (state.consecutiveLosses || 0) + 1;
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

    // ── T3 cooldown maintenance ──────────────────────────────────
    /**
     * Decrement each pair's cooldown counter (cooling down across spins).
     */
    function _decrementCooldowns(cooldowns) {
        Object.keys(cooldowns).forEach(k => {
            cooldowns[k] = Math.max(0, (cooldowns[k] || 0) - 1);
            if (cooldowns[k] === 0) delete cooldowns[k];
        });
    }

    /**
     * Inspect snap.table3.rows latest entry. For each pair whose
     * projection MISSED at that row (hitAnchor === false), set
     * cooldown = t3CooldownRounds. Pairs that hit reset their cooldown.
     */
    function _updateCooldownsFromLatestRow(cooldowns, snap, cooldownRounds) {
        const rows = snap && snap.table3 && snap.table3.rows;
        if (!Array.isArray(rows) || !rows.length) return;
        const lastRow = rows[rows.length - 1];
        if (!lastRow || !lastRow.perPair) return;
        Object.keys(lastRow.perPair).forEach(famKey => {
            const ent = lastRow.perPair[famKey];
            if (ent && ent.hitAnchor === false) {
                // Missed projection — start cooldown (or reset to full
                // if already cooling).
                cooldowns[famKey] = cooldownRounds;
            } else if (ent && ent.hitAnchor === true) {
                // Hit — clear cooldown.
                delete cooldowns[famKey];
            }
        });
    }

    // ── Pair-key extraction from signal name ─────────────────────
    /**
     * Pull the pair-family key out of a signal's name so the T3
     * cooldown filter can suppress signals for cooled pairs.
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

        // ── Previous BET outcome detection (hotfix #3) ──
        // If a new spin landed since our last BET, check whether the
        // prediction included it and update consecutiveLosses. Drives
        // the loss-streak floor elevation below.
        if (state.lastBetSpinCount != null
            && spinCount > state.lastBetSpinCount
            && Array.isArray(state.lastBetNumbers)) {
            const outcomeIdx = state.lastBetSpinCount;   // 0-based index
            const outcome    = snap.meta.spins[outcomeIdx];
            const hit        = (typeof outcome === 'number')
                            && state.lastBetNumbers.indexOf(outcome) >= 0;
            recordOutcome(state, hit);
            state.lastBetSpinCount = null;
            state.lastBetNumbers   = null;
        }

        // ── T3 cooldown maintenance ──
        // Decrement carry-over cooldowns first, then update from the
        // latest row (a miss at THIS spin starts a fresh 3-round cool).
        _decrementCooldowns(state.t3Cooldowns);
        _updateCooldownsFromLatestRow(state.t3Cooldowns, snap, params.t3CooldownRounds);

        // ── Signal evaluation ──
        const allSignals = Signals
            ? Signals.evaluateAll(snap, state, params)
            : [];

        // ── USER-SELECTION FILTER (hotfix #4) ──
        // If the user has clicked specific pairs in the Electron AI
        // panel, restrict pair-bound signals to ONLY those families.
        // The analyser will not "discover" pairs the user didn't pick.
        // Non-pair signals (sign-streak / table-streak / set-carry)
        // always pass through — they're partition-wide, not tied to
        // any single pair family.
        const sel = (snap.meta && snap.meta.selections) || {};
        const selectedFams = new Set();
        ['table1', 'table2', 'table3'].forEach(t => {
            (sel[t] || []).forEach(k => {
                const base = k.endsWith('_13opp') ? k.slice(0, -6) : k;
                selectedFams.add(base);
            });
        });
        const filteredByUser = [];
        const userScoped = (selectedFams.size > 0)
            ? allSignals.filter(s => {
                const fam = _extractFamilyKey(s.name);
                if (fam && !selectedFams.has(fam)) {
                    filteredByUser.push({ name: s.name, pair: fam });
                    return false;
                }
                return true;
              })
            : allSignals;

        // Filter out signals tied to a T3-cooled pair family.
        const cooledFams = new Set(Object.keys(state.t3Cooldowns));
        const suppressed = [];
        const fired = userScoped.filter(s => {
            const fam = _extractFamilyKey(s.name);
            if (fam && cooledFams.has(fam)) {
                suppressed.push({ name: s.name, pair: fam, roundsLeft: state.t3Cooldowns[fam] });
                return false;
            }
            return true;
        });

        // ── Signal SELECTION (hotfix #3, "use best only") ──
        // Old behaviour: every fired signal contributed to scoring.
        // Noisy signals (sub-anchor-pattern × N pairs × 2 halves) would
        // drown out focused strong signals (cross-table-conv).
        // New: require weight >= minUseWeight, then top-K by weight.
        // Dropped signals still appear in the popup so the user sees
        // WHY they were filtered out — popup highlights `used` only.
        const used = fired
            .filter(s => s.weight >= params.minUseWeight)
            .sort((a, b) => b.weight - a.weight)
            .slice(0, params.maxUseSignals);
        const usedNames = new Set(used.map(s => s.name));

        // ── Score per number (USED signals only) ──
        // Normalize each signal's contribution: weight divided across
        // its candidates so a wide-coverage signal doesn't drown out
        // a focused one.
        const scores = new Map();   // num → cumulative weight
        let totalUsedWeight = 0;
        for (const sig of used) {
            if (!sig.candidates || sig.candidates.size === 0) continue;
            const per = sig.weight / sig.candidates.size;
            totalUsedWeight += sig.weight;
            sig.candidates.forEach(n => {
                scores.set(n, (scores.get(n) || 0) + per);
            });
        }

        // ── Confidence ──
        const confidence = Math.min(100,
            Math.round(100 * totalUsedWeight / params.confidenceScale));

        // ── Loss-streak floor elevation (hotfix #3) ──
        // After consecutiveLosses >= lossStreakLimit (2), elevate the
        // floor by lossFloorStep per extra loss (capped at lossFloorMax).
        // Result: more WAITs after losses → stops bleeding while the
        // analyser waits for stronger evidence.
        const losses = state.consecutiveLosses || 0;
        const lossPenalty = (losses >= params.lossStreakLimit)
            ? Math.min(params.lossFloorMax,
                       (losses - params.lossStreakLimit + 1) * params.lossFloorStep)
            : 0;
        const effectiveFloor = params.confidenceFloor + lossPenalty;

        // ── Action gate (floor + wait-cap force-bet) ──
        const priorWaits = state.consecutiveWaits || 0;
        const forceBet   = priorWaits >= params.waitCap;
        const meetsFloor = confidence >= effectiveFloor;
        const action     = meetsFloor ? 'BET'
                         : forceBet   ? 'BET'
                         : 'WAIT';

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
        const floorTxt = (effectiveFloor !== params.confidenceFloor)
            ? `${effectiveFloor}% (base ${params.confidenceFloor}% + ${lossPenalty} loss-streak)`
            : `${params.confidenceFloor}%`;
        let reason;
        if (action === 'BET' && meetsFloor) {
            reason = `BET — confidence ${confidence}% ≥ floor ${floorTxt}, `
                   + `${used.length}/${fired.length} signals used, `
                   + `${numbers.length} numbers picked.`;
        } else if (action === 'BET' && forceBet) {
            reason = `FORCED BET — ${priorWaits} consecutive WAITs hit cap of ${params.waitCap}, `
                   + `betting at confidence ${confidence}% (below ${floorTxt}).`;
        } else {
            reason = `WAIT — confidence ${confidence}% < floor ${floorTxt}. `
                   + `${priorWaits + 1}/${params.waitCap + 1} consecutive wait${priorWaits === 0 ? '' : 's'}; `
                   + `${used.length}/${fired.length} signals used`
                   + (losses > 0 ? ` (loss streak ${losses}).` : `.`);
        }

        // ── Stash for next-spin outcome detection ──
        // Only when we actually BET. Both `meetsFloor` and `forceBet`
        // paths produce action='BET'; both should be evaluated for
        // hit/miss next call.
        if (action === 'BET') {
            state.lastBetSpinCount = spinCount;       // 0-based idx of NEXT spin
            state.lastBetNumbers   = numbers.slice();
        }

        const out = _decision(action, numbers, confidence, reason);
        out.explanation = {
            phase: action === 'BET' && forceBet && !meetsFloor ? 'FORCED_BET' : 'NORMAL',
            spinCount,
            lastSpin,
            firedSignals: fired.map(s => ({
                name: s.name,
                weight: s.weight,
                candidatesCount: s.candidates ? s.candidates.size : 0,
                reason: s.reason,
                details: s.details || null,
                used: usedNames.has(s.name)        // NEW: popup highlights green
            })),
            usedSignalNames: Array.from(usedNames),
            suppressedByCooldown: suppressed,
            // NEW: user-selection scoping
            userSelectedFamilies: Array.from(selectedFams).sort(),
            filteredByUserSelection: filteredByUser,
            topScored: ranked.slice(0, 20),
            picked,
            userSelectionNumbers: userNums,
            unionedNumbers: numbers,
            // Used-weight is the new "Σ weight" the popup shows
            totalUsedWeight,
            totalFiredWeight: fired.reduce((s, x) => s + x.weight, 0),
            confidence,
            confidenceFloor: params.confidenceFloor,
            effectiveFloor,                          // NEW: post-loss-penalty
            lossPenalty,                             // NEW: how much floor moved
            confidenceScale: params.confidenceScale,
            priorConsecutiveWaits: priorWaits,
            consecutiveLosses: losses,               // NEW: for popup display
            waitCap: params.waitCap,
            forcedBet: action === 'BET' && forceBet && !meetsFloor,
            t3Cooldowns: Object.assign({}, state.t3Cooldowns)
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
