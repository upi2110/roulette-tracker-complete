# 00 — Glossary & Foundations

Every strategy in this app speaks the same vocabulary. Learn these eight
concepts and the rest of the docs read naturally.

## 1. The European roulette wheel (37 pockets, 36 visible)

Numbers in physical wheel order, starting at 0:

```
0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3
```

That's the constant `WHEEL_36` in the code. **0 and 26 share pocket 0** (a
practical accommodation in this app — code that picks "pocket 0" bets
both 0 and 26).

Two derived tables you'll see referenced constantly:

| Name | Meaning | Code constant |
|---|---|---|
| **REGULAR_OPPOSITES** | The number 18 pockets across the wheel (180° opposite). E.g. 29 ↔ 13, 19 ↔ 16. | `REGULAR_OPPOSITES` |
| **DIGIT_13_OPPOSITES** | A 13-step shift used by the projection math. E.g. 29 → 19, 19 → 13. | `DIGIT_13_OPPOSITES` |

## 2. The three tables (T1, T2, T3)

The app's main screen has three big tables. They all project numbers but
use different rules.

| Table | What's in it | Role |
|---|---|---|
| **T1** | 10 "code" columns showing the position code each spin would produce against various references. Cells go green when a target hits at distance ≤ 1. | The strict signal — small chains here mean tight pattern. |
| **T2** | 18 "extended code" columns. Same as T1 but accepts distances up to 2. Has both a **pair column** and its **13-opposite column** side by side. | The wider signal — looser but more frequent. |
| **T3** | Anchor projections (purple) + their wheel-neighbours (green), per pair. Shows the **NEXT-row** projection — what would come next based on the most recent two spins. | The forward-looking projection — strategies bet from these. |

The pair families across all three tables are the same: `prev`, `prevPlus1`,
`prevMinus1`, `prev` etc. (see §6 below for the full list).

## 3. References ("refs")

For each pair, the engine computes a single reference **number** from the
last two spins via `_getCalculateReferences(prev, prevPrev)`:

```
refs = {
  prev:              <number>,    e.g. 29
  prev_plus_1:       <number>,    e.g. 22
  prev_minus_1:      <number>,    e.g. 20
  prev_plus_2:       <number>,
  prev_minus_2:      <number>,
  prev_prev:         <number>,
  prev_prev_plus_1:  <number>,
  prev_prev_minus_1: <number>,
  prev_prev_plus_2:  <number>,
  prev_prev_minus_2: <number>,
}
```

Each pair has its own ref. That single number drives everything downstream
for that pair on that spin.

## 4. The 13-opposite (`_13opp`)

Every ref number has a 13-opposite via `_getDigit13Opposite()`. T2 displays
the original column AND its 13-opposite column side by side. So when you
see `prev_13opp` in a strategy, that means "the column built from
`DIGIT_13_OPPOSITES[refs.prev]`."

E.g. if `refs.prev = 29`, then `prev_13opp` uses ref `19`.

## 5. The lookup row (T1/T2's source)

T1 and T2 are driven by a static **lookup table**. Each row has 4 entries:

```
LOOKUP_TABLE[ref] = [ref, first, second, third]
```

For instance, the row starting with 29 is `[29, 2, 10, 29]` —
so `_getLookupRow(29)` returns `{first: 2, second: 10, third: 29}`.

These three numbers are the **anchors** T1/T2 project. Every code column
in T1 and T2 scores recent spins against one of these three.

## 6. Position codes (`S+0`, `OL+2`, etc.)

The engine scores any actual spin against any reference number, producing
a code like `SL+1` or `O+0` or `OR+2`.

Code structure:
```
[side letter][+/-][distance]
```

- **Side letter**: `S` = same side of the wheel as the ref; `O` = opposite side. The `L`/`R` modifiers indicate left/right within that side.
- **Distance**: how many pockets away from the ref the spin landed.
- `XX` = no valid relationship found.

**T1 valid codes** (used by T1 / 3T's T1 gate / Semi-Auto):
```
S+0, SL+1, SR+1, O+0, OL+1, OR+1
```
T1 only accepts distance ≤ 1.

**T2 valid codes** (used by T2 anchor flash):
```
S+0, SL+1, SR+1, SL+2, SR+2,
O+0, OL+1, OR+1, OL+2, OR+2
```
T2 accepts up to distance 2.

The number after `+` matters in the analytics off-by-one fix and in the
distance-based filters. See `01-analytics.md`.

## 7. Flash / gold highlights

When a pattern in the table is strong enough, cells light up **gold**.
This is more than aesthetics — every strategy uses these gold sets as gates.

Two scanners produce them:

### `_computeFlashTargets(allSpins, startIdx, visibleCount)` → T3 gold

A pair's T3 column lights gold if the latest two rows form a **±1 distance
chain** on either the pair-cell or pair13Opp-cell distance — even
cross-cell:

```
upperDists = [pair-cell.dist, pair13Opp-cell.dist]    (latest row)
lowerDists = [pair-cell.dist, pair13Opp-cell.dist]    (prior row)
gold if ANY u ∈ upperDists, l ∈ lowerDists has |u - l| ≤ 1
```

No distance cap. E.g. `OL+4` and `SR+4` chain (both d=4, diff=0).

### `_computeT2FlashTargets(allSpins, startIdx, visibleCount)` → T2 gold

A pair's T2 anchor columns light gold if its 3 lookup-row anchors
(first/second/third) collectively hit recent spins via valid T2 codes.
The exact rule: among `[(0,1), (0,2), (1,2)]` anchor-pair combos,
some combo must have hits in BOTH the latest 2 rows.

## 8. Pair families

These 10 families are what every strategy iterates over:

| camelCase | snake_case (refKey) | Label in tables | Meaning |
|---|---|---|---|
| `prev` | `prev` | **P** | The previous spin itself |
| `prevPrev` | `prev_prev` | **PP** | Two spins ago |
| `prevPlus1` | `prev_plus_1` | **P+1** | Previous spin + 1 |
| `prevPlus2` | `prev_plus_2` | **P+2** | Previous spin + 2 |
| `prevMinus1` | `prev_minus_1` | **P−1** | Previous spin − 1 |
| `prevMinus2` | `prev_minus_2` | **P−2** | Previous spin − 2 |
| `prevPrevPlus1` | `prev_prev_plus_1` | **PP+1** | Two spins ago + 1 |
| `prevPrevPlus2` | `prev_prev_plus_2` | **PP+2** | Two spins ago + 2 |
| `prevPrevMinus1` | `prev_prev_minus_1` | **PP−1** | Two spins ago − 1 |
| `prevPrevMinus2` | `prev_prev_minus_2` | **PP−2** | Two spins ago − 2 |

T2 columns also include `_13opp` variants (e.g. `prevMinus1_13opp`).
T3 does not split — one column per pair.

## 9. Wheel partitions

Two orthogonal partitions of 36 numbers. Used for filtering and stickiness.

### +/- partition (colour/side skew)

| Class | Numbers | Where |
|---|---|---|
| **POSITIVE** | 3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22 | `POSITIVE_NUMS` |
| **NEGATIVE** | 21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35 | `NEGATIVE_NUMS` |

### 0/19 partition (table split)

| Class | Numbers | Where |
|---|---|---|
| **0-table** | 3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7 | `ZERO_TABLE_NUMS` |
| **19-table** | 15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35 | `NINETEEN_TABLE_NUMS` |

Strategies use these to **filter** picks (Semi-Auto), **bias** picks
(Analytics stickiness), and **score confirmation** (Analytics).

## 10. The 3 Number-Sets (SET_0 / SET_5 / SET_6)

Another partition you'll see in T1 strategy and Semi-Auto. Defined by the
roulette wheel layout:

| Set | Numbers (13 / 12 / 12) |
|---|---|
| **SET_0** | 0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12 |
| **SET_5** | 32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28 |
| **SET_6** | 4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3 |

Cover 36 numbers (0 and 26 share). The "carry-forward" idea: walk back
through spins and pick the most recent spin that's in SET_5 or SET_6 — that
set is "active" until the next SET_5/SET_6 spin replaces it.

## 11. Bets and confidence

Each strategy returns one decision per spin:

```js
{
  action: 'BET' | 'SKIP',
  selectedPair: 'prev_plus_1' | null,   // refKey of the locked pair, or null
  selectedFilter: '0-table-positive' | null,
  numbers: [4, 9, 11, 13, ...],         // the bet pool
  confidence: 82,                       // 0–100
  reason: 'human-readable explanation'
}
```

The money-management module reads `numbers.length` to compute the bet
($per-number × count = total stake). It reads `action` to decide whether
to actually place the bet or sit out.

## 12. Useful console snippets

```js
// What mode is the orchestrator in?
console.log(window.autoUpdateOrchestrator.decisionMode);

// What pair is locked (for 3T-Selection / Strategy Lab)?
console.log(window.autoUpdateOrchestrator._3tLockedPair);

// What was the latest decision?
console.log(window.aiPanel._lastAnalyticsDecision);

// What's currently flashing?
const spins = window.spins;
console.log(window.aiAutoEngine._getComputeFlashTargets(spins, 0, 12));
console.log(window.aiAutoEngine._getComputeT2FlashTargets(spins, 0, 12));
```

You'll see these constructions referenced throughout the per-strategy docs.
