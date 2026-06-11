# 01 — Analytics Strategy

**File:** `strategies/analytics/analytics-strategy.js`
**Decision mode key:** `'analytics'`
**Pair lock:** None — evaluates every visible pair every spin.

## One-line summary

Bets when **Table 2's lookup-row anchors** and **Table 3's projection
anchors** overlap on the same wheel arc, per pair, with multiple gates.

## When to use it

- When you want broad coverage that adapts spin-to-spin.
- When you don't want to lock to one pair for the whole session.
- When you've found multiple gold-highlighted pairs and want to bet
  whatever signals strongly across them.

## The picture

```
┌─────────────────────────────────────────┐
│         spinsArr, idx (latest spin)     │
└────┬────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│ 1. Visibility filter              │
│    Only pairs in Pairs(X/12)      │
└─────┬─────────────────────────────┘
      ▼
┌──────────────────────────────────┐
│ 2. T3 flash gate                  │
│    pair's T3 column gold-active?  │
└─────┬─────────────────────────────┘
      ▼  YES
┌──────────────────────────────────┐
│ 3. T2 sub-col flash gate (ref)    │
│    AND/OR (_13opp)                │
│    Each evaluated independently   │
└─────┬─────────────────────────────┘
      ▼
┌──────────────────────────────────┐
│ 4. Compute T2 set (lookup-row)    │
│    Compute T3 set (engine proj.)  │
└─────┬─────────────────────────────┘
      ▼
┌──────────────────────────────────┐
│ 5. Orientation choice             │
│    Try (asIs/flip × asIs/flip);   │
│    pick max wheel-arc overlap     │
└─────┬─────────────────────────────┘
      ▼
┌──────────────────────────────────┐
│ 6. Density consensus              │
│    Gaussian-blur both sets, take  │
│    √(dT2·dT3) per pocket,         │
│    pick top 12 pockets            │
└─────┬─────────────────────────────┘
      ▼
┌──────────────────────────────────┐
│ 7. Colour stickiness              │
│    Last 2 spins same sign?        │
│    → drop opposite-sign picks     │
└─────┬─────────────────────────────┘
      ▼
   final 12 numbers
```

## Each step in detail

### Step 1 — Visibility filter

The orchestrator reads `window.getVisiblePairFamilies()`. Only pair
families currently visible in the "Pairs (X/12)" toggle are considered.
Hidden families are dropped from every later step.

### Step 2 — T3 flash gate

A pair's T3 column must be gold-highlighted *right now*. The strategy
calls the engine's live flash function:

```js
const t3FlashSet = engine._getComputeFlashTargets(wrappedSpins, startIdx, visible);
```

then checks if the set contains any entry mentioning the pair's `refKey`.

This is the **cross-cell chain** rule (see glossary §7): the latest two
spins' pair-cell and pair13-cell distances must form a `|u - l| ≤ 1`
chain.

### Step 3 — T2 sub-column flash gates (independent)

T2 columns come in pairs: `pair` and `pair_13opp`. Each is evaluated
separately. The strategy calls:

```js
const t2FlashSet = engine._getComputeT2FlashTargets(wrappedSpins, startIdx, visible);
```

then checks if it has an entry for `prev` (the ref sub-col) and/or
`prev_13opp` (the 13-opposite sub-col). **A pair can contribute via just
its ref column, just its 13-opp column, or both.**

### Step 4 — Build T2 and T3 anchor sets

**T2 anchors** come from the static lookup row:
```js
const lk = engine._getLookupRow(refNum);
// e.g. refNum = 29 → lk = { first: 2, second: 10, third: 29 }
```

**T3 anchors** come from the engine's projection routine:
```js
const proj = engine._computeProjectionForPair(spins, idx + 1, refKey);
// proj.anchors = [w, x, y, z]
```

The `idx + 1` is deliberate — see the off-by-one history in
`02-t1-strategy.md` glossary section.

### Step 5 — Orientation choice (as-is vs. flipped)

For each sub-col, try all 4 combinations:

| Combo | T2 numbers | T3 numbers |
|---|---|---|
| 1 | as-is | as-is |
| 2 | as-is | flipped via `REGULAR_OPPOSITES` |
| 3 | flipped | as-is |
| 4 | flipped | flipped |

Score each by **wheel-arc overlap** — direct intersections worth 2, ±1
neighbour intersections worth 1. Pick the combo with the highest score.
**Tiebreaker: fewest flips.** So if no overlap exists in any orientation,
the strategy defaults to as-is/as-is — never flips without positive
evidence.

### Step 6 — Density consensus

The orientation-chosen anchor sets feed two Gaussian density fields
across the 36-pocket wheel ring (σ ≈ 1.6 pockets). Per pocket, the
consensus value is the geometric mean:

```
consensus[i] = √( dT2[i] × dT3[i] )
```

`alignment = Σ consensus` (the Bhattacharyya overlap, range 0–1) drives
**confidence**:

```
confidence = round(100 × alignment + confirmBonus × confirmConfidence)
```

The top 12 pockets become the picks. The 0/26 pocket (index 0) is shared,
so picking it bets BOTH 0 and 26.

### Step 7 — Colour stickiness

After picks are chosen:

```
last 2 actual spins both positive  → keep only POSITIVE picks
last 2 actual spins both negative  → keep only NEGATIVE picks
otherwise                          → no filter
```

Filter is **skipped if it would leave fewer than 4 picks** — so a noisy
2-spin colour run doesn't shrink the bet to nothing.

## BET vs SKIP gate

```
alignment ≥ 0.60  AND  confidence ≥ 45  →  BET
otherwise                                →  SKIP
```

## Worked example

**Setup:** Spins `[14, 20, 21, 29]`. Visible pairs include `prev`. T3 P
column is gold (pair-cell distance 1, prior row's pair13Opp-cell
distance 2; chain matches at |1-2|=1). T2 P-13opp column is gold.

### Step-by-step for the `prev` pair:

1. **Visibility:** `prev` is on. ✅
2. **T3 flash:** gold-active for `prev`. ✅
3. **T2 sub-cols:**
   - `prev` (ref column): not gold → drop this side.
   - `prev_13opp` column: gold → keep.
4. **Build anchor sets:**
   - `refs.prev = 29` (computed from spins 29 and 21)
   - 13-opp of 29 = 19
   - T2 for the 13opp sub-col: `_getLookupRow(19) = {first:30, second:9, third:19}` → `[30, 9, 19]`
   - T3 for the whole pair: `_computeProjectionForPair(spins, 4, 'prev').anchors` → say `[4, 30, 36]`
5. **Orientation:**
   - T2 set: `[30, 9, 19]`
   - T3 set: `[4, 30, 36]`
   - asIs/asIs overlap: 30 appears in both → score 2. Combo 1 wins.
6. **Density consensus** runs over all surviving pairs' contributions.
   Top 12 might be: `{4, 9, 11, 13, 14, 15, 19, 22, 30, 31, 32, 36}`.
7. **Colour stickiness:** Last two spins 21 (negative), 29 (negative).
   Both negative. Filter → keep only `{29, 7, 28, 12, 35, 18, …}` ∩ picks
   = small. Filter would leave 2 picks, below floor of 4 → filter
   skipped.

**Decision:** BET 12 numbers, confidence ≈ 97% (very high alignment).

## Reading the chip list

Each chip in the Selection Process popup uses these keys:

| Chip label | Meaning |
|---|---|
| `prev` | The pair's ref column contributed (or both sides). |
| `prev13opp` | Only the 13-opp sub-col contributed. |
| Both `prev` and `prev13opp` would never coexist as separate chips — they merge into one entry under the bare name. |

Numbers on each chip are the **intersection** of that source's
expanded set with the final 12 picks. So if T2 prev contributed numbers
`[11, 15, 31]`, those three are in the final picks and came from `prev`'s
lookup row (after orientation).

## Common reasons for SKIP

| Symptom | Cause |
|---|---|
| `insufficient history (have N spins, need ≥ 3)` | Less than 3 spins entered. |
| `no pair passed the flash + cross-table validation` | No visible pair has both T3 gold and at least one T2 sub-col gold this spin. |
| BET fires but bet pool < 12 | Colour stickiness filter trimmed picks. |
| Picks all clustered on one wheel arc | All surviving pair projections happened to fall in the same density peak. (This is a known trade-off of density consensus — see the change history.) |

## Tunable parameters (`DEFAULTS` in the strategy module)

| Param | Default | What it controls |
|---|---|---|
| `sigma` | 1.6 | Width of the Gaussian kernel (pockets). Higher → broader overlap detection. |
| `alignThreshold` | 0.60 | Minimum alignment for BET. Higher → fewer but more confident bets. |
| `confThreshold` | 45 | Soft confidence floor. Usually irrelevant once alignment passes. |
| `pickCount` | 12 | Number of top pockets to bet. |
| `confirmBonus` | 15 | Max % bonus from colour/0-19 confirmation. |

All overridable via `ctx.params` so the UI can tune live and backtest
mirrors live.

## File map

- `strategies/analytics/analytics-strategy.js` — algorithm
- `app/analytics-highlight.js` — UI: paints contributing T2/T3 columns cyan
- `ui/ai-prediction-panel/ai-prediction-panel.js` — renders the chip list
- `services/auto-update-orchestrator/auto-update-orchestrator.js` — calls `decide()` per spin
