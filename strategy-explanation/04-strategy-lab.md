# 04 — Strategy Lab (Test Lab)

**File:** `strategies/strategy-lab/strategy-lab.js`
**Decision mode key:** `'test'` (Test Lab mode in the UI)
**Entry points:** `StrategyLab.selectBestPair(engine)`, `StrategyLab.decideStrategyLab(engine, spinsArr, idx, ctx)`
**Pair lock:** Yes — once per session.

## One-line summary

The **Test Lab** version of 3T-Selection — same algorithm, **but without
the T3 gate**. Intersects only T1 ∩ T2 ∩ T2-13opp.

## Why a separate strategy?

The system has two parallel code paths so changes to the live production
flow don't accidentally affect the experimental sandbox:

| Aspect | 3T-Selection (live) | Strategy Lab (sandbox) |
|---|---|---|
| Module | `Strategy3T` | `StrategyLab` |
| Globals | `window.Strategy3T`, `window.decide3T` | `window.StrategyLab`, `window.decideStrategyLab` |
| Decision mode key | `'3t-selection'` | `'test'` |
| Includes T3 in intersection? | **Yes** | **No** (T3 removed in Phase 2) |
| UI label | "Auto" or "3T" | "Test (Lab)" |

The Test Lab is where you experiment with the bare T1 ∩ T2 ∩ T2-13opp
intersection. If a change there works well over a long backtest, you can
graduate it to the live `Strategy3T` variant.

## The picture

```
Session start (auto or manual pair pick)
            │
            ▼
   StrategyLab._lockedPair = 'prev_plus_1'

For every spin:
            ▼
   Compute T1.primary, T2.primary, T2_13opp.primary for the locked pair.
   (Same per-ref auto-selection logic as 3T-Selection — see doc 03.)
            │
            ▼
   primaryIntersection  = T1.primary ∩ T2.primary ∩ T2_13opp.primary
   extendedIntersection = (T1.primary∪extra) ∩ (T2.primary∪extra) ∩ (T2_13opp.primary∪extra)
            │
            ▼
   includeGrey=false → bet = primaryIntersection
   includeGrey=true  → bet = extendedIntersection
   empty → SKIP
```

**No T3.** Three-set intersection only.

## Algorithm step-by-step

Identical to 3T-Selection except step 4 doesn't include T3:

1. **Pair lock** — same. Manual override or `selectBestPair(engine)`.
2. **Per-ref auto-selection** — for each of T1, T2, T2_13opp: scan recent
   rows, identify 2 primary refs (high hits) and 1 extra ref (cold).
3. **Build sets** with engine's `_getExpandTargetsToBetNumbers`:
   - T1 uses `neighbourRange = 1`
   - T2 uses `neighbourRange = 2`
   - T2_13opp uses `neighbourRange = 2`
4. **Intersect** — 3-way only.
5. **Bet or skip**.

## Worked example

Reusing the example from doc 03 but **dropping T3**:

```
T1.primary       = {22, 9, 18, 4, 19, 21}
T2.primary       = {15, 19, 4, 21, 2, 11, 30, 8, 23, 10}
T2_13opp.primary = {32, 5, 6, 14, 25, 17, 24, ...}
```

3-way intersection: only numbers in all three sets. Without T3 narrowing,
this may be either more permissive (more picks survive) or just as
restrictive (T2_13opp by itself is very restrictive). For this case:
`{19, 4, 21}` maybe — slightly more permissive than the 3T-Selection
example because T3's filter doesn't apply.

## Comparison: 3T-Selection vs. Strategy Lab

| Scenario | 3T-Selection | Strategy Lab |
|---|---|---|
| **Empty bet often** | Common — 4-way intersection is strict. | Less common — 3-way is looser. |
| **Hit rate per BET** | Higher (more filtering = stronger signal when it fires). | Lower (more bets per session, average rate drops). |
| **Bet frequency** | Lower. | Higher. |
| **Sensitivity to T3 noise** | Yes — if T3 misfires, no BET. | No — T3 not consulted. |

If you want **more confident, less frequent bets**, use 3T-Selection.
If you want **more bet opportunities, less filtering**, use Strategy Lab.

## When to graduate Test → 3T

Use Test Lab as a sandbox. When you find a parameter set or change you
like:
1. Verify it via backtest (Auto Test, method=`'test'`).
2. Mirror the change into `strategy-3t-selection.js`.
3. Re-verify in live mode (`'3t-selection'`).

The modules are kept in lockstep manually — there's no shared base class.

## Common reasons for SKIP

| Reason | Meaning |
|---|---|
| `selectBestPair returned NULL` | Engine untrained. |
| `bet is empty` | 3-way intersection eliminated all numbers. Try `includeGrey: true`. |
| `lockedPairRefKey not provided` | Caller failed to pass the lock. |

## File map

- `strategies/strategy-lab/strategy-lab.js` — algorithm
- `services/auto-update-orchestrator/auto-update-orchestrator.js` — calls `StrategyLab.decideStrategyLab` when `decisionMode === 'test'`
- `services/auto-test-runner/auto-test-runner.js` — calls it from offline backtests when `method === 'test'`
- Companion: `strategies/strategy-3t-selection/strategy-3t-selection.js` — live production version
