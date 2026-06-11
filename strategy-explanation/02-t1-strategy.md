# 02 — T1 Strategy

**File:** `strategies/t1/t1-strategy.js`
**Decision mode key:** `'t1-strategy'`
**Entry point:** `decideT1Strategy(engine, testSpins, idx)`

## One-line summary

Bets when **three independent gates align** on the same pair family:
T1 green ≥ 2/3 anchors, T2 gold flash, AND T3 engine flash. When all
three fire, expands the active anchors ±1 on the wheel into exactly **12
numbers**.

## When to use it

- When you want the **strictest** signal in the system — needs all three
  table gates simultaneously.
- When you want the bet pool tied to one pair (selected automatically).
- When the engine's trained pair/filter/session model should still gate
  BET vs SKIP via confidence.

## The picture

```
For each eligible pair (prev, prevPlus1, prevMinus1, prevPlus2, prevMinus2):

  ┌──────────────────────────────────────────────┐
  │ GATE 1: T1 green                              │
  │   ≥ 2 of pair's 3 lookup anchors              │
  │   ∈ active SET_5/SET_6 (carry-forward)        │
  └──────────────┬───────────────────────────────┘
                 │ pass
                 ▼
  ┌──────────────────────────────────────────────┐
  │ GATE 2: T2 golden flash                       │
  │   T2 flash on the pair's dataPair             │
  └──────────────┬───────────────────────────────┘
                 │ pass
                 ▼
  ┌──────────────────────────────────────────────┐
  │ GATE 3: T3 engine flash                       │
  │   T3 flash on the pair's refKey               │
  └──────────────┬───────────────────────────────┘
                 │ pass
                 ▼
  Take the 2 active-side anchors, expand ±1, trim/prio to 12.
  Engine confidence decides BET vs SKIP.
```

## Eligible pairs (T1_ELIGIBLE_PAIRS)

Only 5 of the 10 pair families can participate. T2 has `_13opp` variants
that have no T3 refKey, so they're excluded:

```js
const T1_ELIGIBLE_PAIRS = [
  { dataPair: 'prev',       refKey: 'prev',         anchor: (p) => p },
  { dataPair: 'prevPlus1',  refKey: 'prev_plus_1',  anchor: (p) => Math.min(p + 1, 36) },
  { dataPair: 'prevMinus1', refKey: 'prev_minus_1', anchor: (p) => Math.max(p - 1, 0) },
  { dataPair: 'prevPlus2',  refKey: 'prev_plus_2',  anchor: (p) => Math.min(p + 2, 36) },
  { dataPair: 'prevMinus2', refKey: 'prev_minus_2', anchor: (p) => Math.max(p - 2, 0) }
];
```

## Each gate in detail

### Gate 1: T1 green — anchor membership in active SET

Walk `testSpins[0..idx]` backwards and find the most recent spin that's
in SET_5 or SET_6. That set is "active" for this scoring:

```js
function _t1CarryForward(testSpins, idx) {
    for (let i = idx; i >= 0; i--) {
        const n = testSpins[i];
        if (T1_SET_5.has(n)) return { active: T1_SET_5, side: '5' };
        if (T1_SET_6.has(n)) return { active: T1_SET_6, side: '6' };
    }
    return null;
}
```

For each eligible pair, compute its 3 raw lookup anchors:
`_getLookupRow(refNum)` → `[first, second, third]`. The pair PASSES this
gate if **≥ 2 of those 3** are in the active set.

### Gate 2: T2 golden flash

Call `engine.simulateT2FlashAndNumbers(testSpins, idx)`. This returns
which `dataPair` is currently in T2 anchor-flash. The pair PASSES if its
`dataPair` matches the flashed one.

### Gate 3: T3 engine flash

Call `engine._getFlashingPairsFromHistory(testSpins, idx)`. This returns
a Set of refKeys whose T3 column would be lit. The pair PASSES if its
`refKey` is in the set.

### Selection from candidates

If multiple pairs pass all 3 gates, the strategy picks **one** — based on
the engine's own `_computeConfidence(refKey)` ranking (the trained
model's hit rate for that pair). Highest confidence wins.

## Building the 12-number bet

Once a pair is selected:

1. From its 3 lookup anchors, take **the 2 that are in the active set**.
2. Run those 2 anchors through `expandTargetsToBetNumbers([a1, a2], 1)`
   — the same helper the renderer uses. This expands each anchor with
   ±1 wheel-neighbours on both sides (≈ 5–6 numbers per anchor).
3. **Prioritised trim to exactly 12 numbers:**
   - The 2 chosen anchors themselves
   - Then other active-side members of the expansion
   - Then SET_0 shared members
   - Then everything else
4. Confidence comes from `engine._computeConfidence(refKey)` — so if the
   trained model says this pair has been losing lately, even a triple-
   gold pair can SKIP.

## Worked example

**Setup:** Spins `[14, 20, 21, 29]`. The most recent spin (29) is in
SET_0. Walking back, we find 21 in SET_6 → **active = SET_6, side = '6'**.

For pair `prev_minus_1` (`P-1` in the UI):
- `refs.prev_minus_1` (call this R) might be `20`.
- `_getLookupRow(20) = {first: 26, second: 13, third: 20}`.
- Of `[26, 13, 20]`, how many are in SET_6 (`{4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3}`)?
  None. **Gate 1 FAILS for prev_minus_1.**

For pair `prev_plus_1` (`P+1`):
- `refs.prev_plus_1 = 22`.
- `_getLookupRow(22) = {first: 4, second: 8, third: 22}`.
- Of `[4, 8, 22]`, in SET_6: 4, 22 — that's **2 of 3**. ✅ Gate 1 PASSES.
- Active anchors: `[4, 22]`.

Gate 2: Is `prevPlus1` the T2-flashed pair? Suppose yes. ✅

Gate 3: Is `prev_plus_1` in the T3 flashing-pairs set? Suppose yes. ✅

**All three gates pass for prevPlus1.**

Expand `[4, 22]` ±1 on the wheel:
- 4 is at wheel index 4; neighbours are 19 (idx 3) and 21 (idx 5).
  → `{4, 19, 21}`
- 22 is at idx 28; neighbours are 9 (idx 27) and 18 (idx 29).
  → `{22, 9, 18}`

Combined: `{4, 19, 21, 22, 9, 18}` — 6 numbers.

Trim/prio to 12 by adding active-side (SET_6) members, then SET_0
members, then any:
- SET_6 candidates left: `{6, 27, 8, 23, 33, 1, 35, 3}`
- Take top 6 by some order → final 12 numbers.

`engine._computeConfidence('prev_plus_1') = 0.72` → BET with 72% confidence.

## Common reasons for SKIP

| Reason | Meaning |
|---|---|
| `T1-green=0 — no pair has ≥2 anchors in active SET` | Gate 1 failed everywhere. |
| `T1-green=N but T2+T3 gate failed` | Gate 1 found N pairs but no overlap with T2/T3 flashes. |
| `confidence too low` | All 3 gates passed but engine's model says the pair is currently losing. |
| `no active SET (history is pure SET_0)` | Carry-forward found no SET_5 or SET_6 trigger. |

## Pitfalls

- **`_13opp` columns are excluded** from T1 strategy by design. They have
  no T3 refKey so the gate can't apply.
- The strategy is **stateless** — it doesn't lock a pair for the session.
  Each spin re-evaluates all 5 eligible pairs from scratch.
- Confidence comes from the **engine's trained pair model**, not from any
  flash strength. A perfectly flashed pair will SKIP if its history says
  it's been losing.

## File map

- `strategies/t1/t1-strategy.js` — algorithm + `T1_ELIGIBLE_PAIRS` constants
- `tests/app/55-t1-strategy.test.js` — unit tests (group A verifies
  wheel-set constants match the renderer; if they drift, tests fail loudly)
