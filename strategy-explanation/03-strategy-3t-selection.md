# 03 — 3T-Selection

**File:** `strategies/strategy-3t-selection/strategy-3t-selection.js`
**Decision mode key:** `'3t-selection'`
**Entry points:** `Strategy3T.selectBestPair(engine)`, `Strategy3T.decideStrategyLab(engine, spinsArr, idx, ctx)`
**Pair lock:** Yes — once per session.

## One-line summary

Lock **one pair** for the whole session, then every spin compute the
**intersection** of that pair's number sets across T1, T2, T2-13opp, AND
T3 — bet whatever survives.

## When to use it

- When you've identified a pair you trust and want to bet ONLY when ALL
  three tables agree on it.
- When you want clear, reproducible "only this pair, only when everything
  lines up" behaviour.
- Live production version of the same algorithm as Strategy Lab (`04-`).

## The picture

```
Session start (auto or manual pair pick)
            │
            ▼
    Strategy3T._3tLockedPair = 'prev_plus_1'    (sticks for whole session)

For every spin:
            ▼
   ┌────────────────────────────────────────┐
   │ For locked pair, compute number sets:   │
   │                                         │
   │   T1.primary       (±1 wheel ring)      │
   │   T2.primary       (±2 wheel ring)      │
   │   T2_13opp.primary (±2 wheel ring)      │
   │   T3              (full projection)     │
   └─────┬──────────────────────────────────┘
         ▼
   primaryIntersection  = ∩ pairSets         (all 4 must contain)
   extendedIntersection = ∩ (primary∪extra)  (looser — includes "extra" refs)
         │
         ▼
   includeGrey=false → bet = primaryIntersection
   includeGrey=true  → bet = extendedIntersection
   empty intersection → SKIP
```

## The "per-ref auto-selection" idea

This is what makes 3T different from a naïve intersection. For each
table-column pair (e.g. P+1 in T1), the table has 3 anchor columns.
Recent rows might show hits in only some of those columns. The strategy:

1. Identifies which 2 of the 3 anchors have been hitting recently — the
   **primary refs**.
2. Calls the third anchor the **extra ref** (cold so far this session).
3. Expands each ref's anchor number into a bet set using
   `engine._getExpandTargetsToBetNumbers([ref], neighbourRange)`:
   - T1: ±1 ring
   - T2: ±2 ring
   - T2_13opp: ±2 ring
4. Per pair-per-table:
   - **primary** = union of the 2 selected primary refs' numbers
   - **extra** = the extra ref's numbers

T3 has no per-ref split — its source is the full pair projection from
`engine._computeProjectionForPair`.

## Step-by-step

### Step 1: Pair lock

At session start (or first decision call), pick a pair:
- **Manual**: user clicked a T1 pair header → that pair is locked.
- **Auto**: no manual selection → `Strategy3T.selectBestPair(engine)`
  iterates `engine.pairModels` and picks the one with the highest
  `hitRate`. If no pair models exist yet (engine untrained), returns
  `null` and the strategy SKIPS until the engine has data.

The lock is **session-scoped** — cleared only when the user leaves
3T-Selection mode. Bet wins/losses don't change it.

### Step 2: Compute primary refs per table

For each table T (T1, T2, T2_13opp):
- Look at the recent N rows of the table.
- For each of the 3 anchor columns, count hits using
  `TABLE1_VALID` (codes `S+0`, `SL+1`, `SR+1`, `O+0`, `OL+1`, `OR+1`)
  for T1, `TABLE2_VALID` (T1 + `SL+2`, `SR+2`, `OL+2`, `OR+2`) for T2.
- Pick the 2 columns with the most hits → primary refs.
- The remaining column → extra ref.

### Step 3: Build number sets

For each table:
```
primarySet = union of primary refs' expansions (with ring per table)
extraSet   = expansion of the extra ref only
```

T3:
```
t3Set = engine._computeProjectionForPair(spins, idx, refKey).numbers
```
(numbers include both anchors AND ±1 wheel-neighbours; the engine does
the expansion internally.)

### Step 4: Intersect

```
pairSets     = [T1.primary, T2.primary, T2_13opp.primary, T3]
extendedSets = [T1.primary ∪ T1.extra, T2.primary ∪ T2.extra,
                T2_13opp.primary ∪ T2_13opp.extra, T3]

primaryIntersection  = pairSets[0]    ∩ pairSets[1]    ∩ ... ∩ pairSets[3]
extendedIntersection = extendedSets[0] ∩ ...           ∩ extendedSets[3]
```

A number must appear in ALL FOUR sets to survive. T3 always participates.

### Step 5: Bet or skip

```
if includeGrey is false:
    bet = primaryIntersection
else:
    bet = extendedIntersection

if bet is empty:
    SKIP
else:
    BET on those numbers
```

`includeGrey` is wired to the "include grey" checkbox in the European
Wheel panel. Switching it on broadens the intersection by including the
extra refs.

## Worked example

**Setup:**
- Spins so far: `[14, 20, 21, 29, 9, 17, 22, 33, 4]`
- Locked pair: `prev_plus_1` (auto-picked at session start)
- `includeGrey`: false

For the latest spin (idx pointing at 4):
- `refs.prev_plus_1 = 22` (computed from spins 4, 33)

### T1 column for `prevPlus1`
Lookup: `_getLookupRow(22) = {first: 4, second: 8, third: 22}` →
anchors `[4, 8, 22]`.

Imagine the last 5 rows showed:
- Anchor `4` hit codes: `S+0`, `SL+1`, `XX`, `SR+1`, `XX` → 3 hits
- Anchor `8` hit codes: `XX`, `XX`, `O+0`, `XX`, `XX` → 1 hit
- Anchor `22` hit codes: `OL+1`, `S+0`, `XX`, `SL+1`, `OR+1` → 4 hits

Primary refs (top 2 by hits): `[22, 4]`. Extra: `8`.

T1 primary = expand `[22, 4]` ±1 on the wheel:
- 22 at idx 28; neighbours 9, 18 → `{22, 9, 18}`
- 4 at idx 4; neighbours 19, 21 → `{4, 19, 21}`

Union: `{22, 9, 18, 4, 19, 21}`.

### T2 column for `prevPlus1`
Same anchors `[4, 8, 22]` but T2 accepts up to distance 2 (more
valid codes). Imagine all 3 anchors have plenty of hits. Primary picks
might be `[4, 8]`, extra `22`.

T2 primary = expand `[4, 8]` ±2 on the wheel:
- 4 ±2: indices 2,3,4,5,6 → numbers 15, 19, 4, 21, 2 → `{15, 19, 4, 21, 2}`
- 8 ±2: indices 14,15,16,17,18 → numbers 11, 30, 8, 23, 10 → `{11, 30, 8, 23, 10}`

Union: `{15, 19, 4, 21, 2, 11, 30, 8, 23, 10}`.

### T2_13opp column for `prevPlus1`
13-opp of 22 = 32. `_getLookupRow(32) = {first: 36, second: 14, third: 32}`.
Run the same analysis on the 13-opp column; say primary refs end up
`[32, 36]`. T2_13opp primary = expand `[32, 36]` ±2 → some set.

### T3 for `prevPlus1`
`_computeProjectionForPair(spins, idx, 'prev_plus_1').numbers` returns
the engine's full ±1 projection — say `{22, 4, 21, 19, 18, 9, 15, ...}`.

### Intersect

```
T1.primary       = {22, 9, 18, 4, 19, 21}
T2.primary       = {15, 19, 4, 21, 2, 11, 30, 8, 23, 10}
T2_13opp.primary = {32, 5, 6, 14, 25, 17, 24, ...}
T3               = {22, 4, 21, 19, 18, 9, 15, ...}
```

Intersection: only numbers in all 4. In this synthetic case maybe just
`{4, 19, 21}` survive.

**Decision:** BET on `[4, 19, 21]` — exactly 3 numbers.

## Common reasons for SKIP

| Reason | Meaning |
|---|---|
| `selectBestPair returned NULL — engine has no pairModels yet` | Engine hasn't been trained / has insufficient history. |
| `bet is empty` | The four-way intersection eliminated every number. Most common cause. |
| `lockedPairRefKey not provided` | Caller forgot to pass the lock through `ctx`. |

## Pitfalls

- **The session lock is sticky** — even if a different pair starts
  flashing strongly, 3T keeps using the locked one. Override by clicking
  a different T1 pair manually.
- **Empty intersection is common** — that's the strategy doing its job.
  If you want broader coverage, switch on `includeGrey` to use the
  extended intersection.
- **T3 always participates.** That's what distinguishes 3T-Selection
  from the Strategy Lab variant.

## Tunables

The strategy itself has minimal tunables — its behaviour is dominated by:
- the chosen pair lock (auto via `selectBestPair` or manual via UI),
- `includeGrey` (boolean from the UI),
- engine state (pairModels' hitRates drive `selectBestPair`).

## File map

- `strategies/strategy-3t-selection/strategy-3t-selection.js` — algorithm
- `services/auto-update-orchestrator/auto-update-orchestrator.js` — calls `decide()` per spin (lines 272–361)
- Companion: `strategies/strategy-lab/strategy-lab.js` — the "Test Lab"
  sandbox version of the same algorithm (no T3, see doc 04)
