# Roulette Prediction System — Complete Technical Architecture

**Document Version:** 1.0
**Date:** March 2, 2026
**Purpose:** Academic review of the full prediction and betting system

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [The Three-Table Reference System](#2-the-three-table-reference-system)
3. [Pair Definitions & Flash Detection](#3-pair-definitions--flash-detection)
4. [Projection & Anchor Generation](#4-projection--anchor-generation)
5. [AI Decision Engine](#5-ai-decision-engine)
6. [Filter System](#6-filter-system)
7. [Money Management & Bet Sizing](#7-money-management--bet-sizing)
8. [Session Adaptation & Live Learning](#8-session-adaptation--live-learning)
9. [Complete Data Flow](#9-complete-data-flow)
10. [Mathematical Foundation & Assumptions](#10-mathematical-foundation--assumptions)

---

## 1. System Overview

This is an Electron desktop application that tracks European single-zero roulette spins and uses a hybrid AI system to predict upcoming numbers and manage betting.

**Core hypothesis:** Roulette outcomes, while individually random, exhibit short-term spatial patterns on the physical wheel that can be exploited through position-code analysis and pattern matching.

**System components:**

| Component | File | Role |
|-----------|------|------|
| Three-Table System | `renderer-3tables.js` | Maps spin history to position codes, detects "flashing" pairs |
| Lookup Table | `table-lookup.js` | 37-row cyclic projection table mapping reference numbers to targets |
| AI Decision Engine | `ai-auto-engine.js` | Bayesian UCB scoring, N-gram sequence model, decision pipeline |
| Prediction Panel | `ai-prediction-panel.js` | Orchestrates pair selection, cross-table intersection, UI |
| Roulette Wheel | `roulette-wheel.js` | Visualization, filter application, number set management |
| Money Management | `money-management-panel.js` | Martingale-variant bet sizing, bankroll tracking, session targets |

---

## 2. The Three-Table Reference System

### 2.1 The European Wheel Layout

The system uses the standard European single-zero wheel with 37 pockets:

```
WHEEL_STANDARD = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
                  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
                  28, 12, 35, 3, 26]
```

Numbers 0 and 26 are treated as sharing the same pocket for position calculations (they are physically adjacent).

### 2.2 Two Opposite Mappings

**Regular Opposites (180-degree):** Each number maps to its diametrically opposite number on the physical wheel. This is symmetric — if A maps to B, then B maps to A.

```
Examples: 0 <-> 10, 1 <-> 21, 7 <-> 36, 32 <-> 5
```

**Digit-13 Opposites:** A separate mapping based on a 13-position offset within the wheel sequence. This is NOT symmetric in general.

```
Examples: 0 -> 34, 1 -> 28, 2 -> 30, 6 -> 5, 26 -> 34
```

Both mappings are used to generate multiple projection anchor points from a single reference number.

### 2.3 Number Classification Sets

All 37 numbers (0-36) are classified on three independent axes:

**Table membership (partitions the wheel into two halves):**

| Set | Count | Numbers |
|-----|-------|---------|
| Zero-Table | 19 | 0, 1, 2, 3, 5, 7, 10, 13, 14, 18, 20, 21, 23, 25, 26, 27, 29, 32, 36 |
| Nineteen-Table | 18 | 4, 6, 8, 9, 11, 12, 15, 16, 17, 19, 22, 24, 28, 30, 31, 33, 34, 35 |

**Sign (another partition):**

| Set | Count | Numbers |
|-----|-------|---------|
| Positive (+) | 19 | 0, 1, 3, 4, 8, 9, 11, 13, 14, 15, 19, 20, 22, 26, 27, 30, 31, 32, 36 |
| Negative (-) | 18 | 2, 5, 6, 7, 10, 12, 16, 17, 18, 21, 23, 24, 25, 28, 29, 33, 34, 35 |

**Set (tripartition):**

| Set | Count | Numbers |
|-----|-------|---------|
| Set-0 | 13 | 0, 2, 9, 10, 12, 13, 16, 19, 20, 26, 29, 30, 34 |
| Set-5 | 12 | 5, 7, 11, 14, 15, 17, 24, 25, 28, 31, 32, 36 |
| Set-6 | 12 | 1, 3, 4, 6, 8, 18, 21, 22, 23, 27, 33, 35 |

These three axes combine to form 36 possible filter combinations (3 table x 3 sign x 4 set options).

### 2.4 Position Code System

A position code describes the spatial relationship between a **reference number** and an **actual spin result** on the physical wheel.

**Format:** `{Side}{Direction}+{Distance}`

| Component | Values | Meaning |
|-----------|--------|---------|
| Side | `S` = Same, `O` = Opposite | Near the reference or near its 180-degree opposite |
| Direction | `L` = Left, `R` = Right | Direction on the physical wheel |
| Distance | 0, 1, 2, 3, 4 | Number of pockets away |
| Special | `XX` | Not within 4 positions on either side |

**Full code set (19 possible codes):**
```
S+0                          — Exact match on same side
SL+1, SR+1, SL+2, SR+2      — 1-2 pockets left/right of reference
SL+3, SR+3, SL+4, SR+4      — 3-4 pockets left/right
O+0                          — Exact match on opposite side
OL+1, OR+1, OL+2, OR+2      — 1-2 pockets left/right of opposite
OL+3, OR+3, OL+4, OR+4      — 3-4 pockets left/right of opposite
XX                           — Beyond 4 pockets on both sides
```

**Calculation algorithm:**
1. Convert 0 to 26 for wheel indexing (shared pocket).
2. Check same-side distances (reference ± 1 to 4 on physical wheel).
3. If not found, compute the Regular Opposite and check distances from that point.
4. If still not found within 4 positions, return `XX`.

### 2.5 The Lookup Table

A 37-row table (one per roulette number) with 3 projection columns:

```
Number → First    Second    Third
─────────────────────────────────
  0    →  13       20        26
 32    →  36       14         0
 15    →  11       31        32
 19    →  30        9        15
  4    →   8       22        19
 ...
 26    →  27        1         3
```

The table follows a cyclic pattern derived from the wheel sequence. The "first" column is the wheel sequence starting from a 13-position offset.

**Column mapping from position codes:**
- `S+0, SL+1, SR+1, SL+2, SR+2` → **First** column
- `OL+1, OR+1, OL+2, OR+2` → **Second** column
- `O+0` → **Third** column

---

## 3. Pair Definitions & Flash Detection

### 3.1 Reference Numbers

Given the last two spins (`prev` and `prevPrev`), the system computes 7 base reference numbers:

| Reference | Formula | Description |
|-----------|---------|-------------|
| `prev` | Last spin number | Direct reference |
| `prev+1` | `min(prev + 1, 36)` | One above (special: 0 → 1) |
| `prev-1` | `max(prev - 1, 0)` | One below (special: 0 → 10) |
| `prev+2` | `min(prev + 2, 36)` | Two above |
| `prev-2` | `max(prev - 2, 0)` | Two below (special: 0 → 9) |
| `prevPrev` | Second-to-last spin | Historical reference |
| `ref0` / `ref19` | Fixed references 0 and 19 | Static anchors |

Each reference also has a **Digit-13 Opposite** companion, creating up to 14 reference points per spin.

### 3.2 Table-Specific Pair Definitions

**Table 3 (6 pairs):** Uses the anchor-based projection system.
```
prev, prev+1, prev-1, prev+2, prev-2, prevPrev
```

**Table 1 (14 pairs including 13-opposites):** Uses lookup table with ±1 neighbor expansion.
```
ref0, ref0_13opp, ref19, ref19_13opp,
prev, prev_13opp, prev+1, prev+1_13opp,
prev-1, prev-1_13opp, prev+2, prev+2_13opp,
prev-2, prev-2_13opp
```
Valid position codes for Table 1: distance 0-1 only (S+0, SL+1, SR+1, O+0, OL+1, OR+1).

**Table 2 (7 pairs, no 13-opposites):** Uses lookup table with ±2 neighbor expansion.
```
ref0, ref19, prev, prev+1, prev-1, prev+2, prev-2
```
Valid position codes for Table 2: distance 0-2 (includes SL+2, SR+2, OL+2, OR+2).

### 3.3 Flash Detection Algorithm

A "flash" occurs when a pair shows **positional consistency** across two consecutive spins. This is the core signal the system looks for.

**Algorithm:**
1. For two consecutive rows in the table, compute position codes for both the direct reference and the Digit-13 Opposite reference.
2. Extract the numeric distance from each code (e.g., `SL+2` → distance 2).
3. If the difference between the two rows' distances is **≤ 1**, the pair is "flashing."

```
Example:
  Row N:   prev reference → position code SL+2 (distance 2)
  Row N+1: prev reference → position code SR+1 (distance 1)
  |2 - 1| = 1 ≤ 1 → FLASH detected on "prev" pair
```

**Interpretation:** A flash means the ball is landing in a consistent positional relationship to that reference number across consecutive spins. The system hypothesizes this consistency will continue for the next spin.

---

## 4. Projection & Anchor Generation

### 4.1 Anchor Generation (Table 3)

When a pair is flashing, the system projects where the next spin might land using the anchor system.

**Inputs:**
- `refNum` — The flashing pair's reference number
- `ref13Opp` — Its Digit-13 Opposite
- `prevPosCode` — The position code from the previous row

**Algorithm:**
1. Compute 4 anchor candidates:
   - `a1` = number at position `prevPosCode` relative to `refNum` (same ref, same code)
   - `a2` = number at position `flip(prevPosCode)` relative to `refNum` (same ref, flipped direction)
   - `a3` = number at position `prevPosCode` relative to `ref13Opp` (13-opp ref, same code)
   - `a4` = number at position `flip(prevPosCode)` relative to `ref13Opp` (13-opp ref, flipped code)

2. Deduplicate into **purple anchors** (up to 4 unique numbers).

3. Compute **green anchors** = Regular Opposite of each purple anchor (up to 4 more numbers).

4. **Expand to bet numbers:** For each anchor (purple and green), include the anchor plus its immediate neighbors (±1 pocket) on the physical wheel.

**Typical coverage:** 4 anchors × 2 sides (same + opposite) × 3 numbers per anchor = ~12-18 unique numbers (after deduplication).

### 4.2 Lookup-Based Projection (Tables 1 & 2)

Tables 1 and 2 use the lookup table instead of anchors:

1. Given a reference number and the position code from the previous row, look up the target number from the corresponding column (first/second/third).
2. Expand that target ±1 (Table 1) or ±2 (Table 2) neighbors on both the same side and the Regular Opposite side.

**Coverage:**
- Table 1: ~6 numbers per target (±1 same + ±1 opposite)
- Table 2: ~10 numbers per target (±2 same + ±2 opposite)

### 4.3 Cross-Table Intersection

In manual/semi-auto mode, the user selects pairs from multiple tables. The final prediction is the **intersection** — only numbers that appear in ALL selected pairs' projections.

```
Final numbers = Pair1.numbers ∩ Pair2.numbers ∩ ... ∩ PairN.numbers
```

**Extra numbers:** The third lookup column (unselected by auto-selection) contributes "extra" numbers shown in grey on the wheel. These are lower-confidence additions.

**Zero-26 rule:** If one of {0, 26} is in the prediction but not the other, the missing one is automatically added (they share a physical pocket).

### 4.4 Wheel Anchor Optimization

After the final number set is computed, `calculateWheelAnchors()` optimizes chip placement:

1. Map numbers to their positions on the physical wheel.
2. Find contiguous runs of consecutive numbers.
3. Greedily extract anchor groups:
   - Run of 5+ → center anchor with ±2 coverage (1 chip covers 5 numbers)
   - Run of 3-4 → center anchor with ±1 coverage (1 chip covers 3 numbers)
   - Run of 1-2 → "loose" numbers (individual straight bets)

---

## 5. AI Decision Engine

### 5.1 Training Phase

The engine trains on historical spin data (7,863 spins across 16 session files).

**Training algorithm:**
```
For each session (minimum 5 spins):
    For each spin index i (from 3 to length-2):
        Detect flashing pairs using spins[i-3..i]
        For each flashing pair:
            Compute projection (anchor-based numbers)
            Check if spins[i+1] is in the projection → HIT or MISS
            Test all 36 filter combinations → record which filters pass/fail
        Accumulate statistics into pairModels[] and filterModels[]
```

**Trained model outputs:**

```
pairModels[refKey] = {
    totalFlashes,           // How many times this pair flashed
    projectionHits,         // How many times the projection contained the next number
    hitRate,                // projectionHits / totalFlashes
    avgProjectionSize,      // Average numbers per projection
    coverageEfficiency      // hitRate / (avgProjectionSize / 37)
}
```

Coverage efficiency measures how much better than random chance the pair performs, normalized by coverage size. Random chance for 12 numbers = 12/37 = 32.4%.

### 5.2 Bayesian UCB Pair Scoring

Each pair maintains a **Beta-Binomial conjugate prior:**

```
pairBayesian[refKey] = {
    alpha: projectionHits + 1,       // Prior from training (successes + 1)
    beta:  (totalFlashes - hits) + 1 // Prior from training (failures + 1)
}
```

**Scoring formula (Upper Confidence Bound):**

```
mean = alpha / (alpha + beta)

exploration = sqrt(2 * ln(totalDecisions + 1) / n) * 0.3
    where n = alpha + beta (total observations for this pair)

score = min(1.0, mean + exploration)
```

The UCB term ensures under-explored pairs get a score boost, preventing the engine from fixating on a single pair and missing better options.

**Composite score with session blending:**

```
composite = (1 - adaptationWeight) * historicalScore + adaptationWeight * sessionScore
```

Where `adaptationWeight` grows from 0 to 0.5 over the course of a session.

### 5.3 Score Adjustments

**Bonuses:**
| Bonus | Value | Condition |
|-------|-------|-----------|
| Consecutive flash | +0.10 | Same pair flashed in last decision |
| Position code quality | up to +0.15 | Position code has historically high hit rate (>30%) |
| Sequence alignment | up to +0.15 | N-gram model agrees with this pair's table/sign |
| Recent hit recency | +0.05 per hit | Hit in last 3 bets |
| Recent near-miss | +0.025 per miss | Near-miss in last 3 bets |
| Shadow performance | variable | Shadow hit rate > 35% in RECOVERY mode |

**Penalties:**
| Penalty | Value | Condition |
|---------|-------|-----------|
| Drought | -0.10 | No hit in last 5 attempts |
| Overexposure | -0.05 | Selected 3+ times in last 5 decisions |
| Sign imbalance (severe) | -0.15 | Less than 10% minority sign in projection |
| Sign imbalance (mild) | -0.08 | Less than 20% minority sign |
| Recovery same-pair | -0.05 | In RECOVERY, betting same pair again |

### 5.4 Multi-Layer N-gram Sequence Model

8 parallel prediction layers run simultaneously:

| Layer | Input (history) | Predicts | Example |
|-------|-----------------|----------|---------|
| Number 1-gram | Last 1 spin number | Next table + sign | "After 7, next is usually 0-table positive" |
| Number 2-gram | Last 2 spin numbers | Next table + sign | "After 7→23, next is usually 19-table" |
| Number 3-gram | Last 3 spin numbers | Next table + sign | "After 7→23→10, next is..." |
| Table 1-gram | Last 1 table | Next table | "After 0-table, next is usually 19-table" |
| Table 2-gram | Last 2 tables | Next table | "After 0→19, next is usually 0-table" |
| Sign 1-gram | Last 1 sign | Next sign | "After positive, next is usually negative" |
| Sign 2-gram | Last 2 signs | Next sign | "After +→-, next is usually positive" |
| Combo 1-gram | Last table+sign | Next table+sign | "After 0-table-positive, next is..." |

Each layer maintains a frequency table built during training. At decision time:
1. Each layer predicts which filter combination is most likely to contain the next spin.
2. Votes are weighted by each layer's historical prediction accuracy.
3. The filter with the most weighted votes wins.

### 5.5 Set Prediction

The engine also predicts which of the three sets (Set-0, Set-5, Set-6) the next spin will fall into:

```
SetScore = 0.40 * coverageOverlap
         + 0.30 * recentFrequency
         + 0.15 * antiStreakBonus
         + 0.05 * setMomentum
         + 0.15 * historicalFilterRate
         + adaptiveWeight * sessionFilterPerformance
```

Where:
- **Coverage overlap** = fraction of predicted numbers belonging to this set
- **Recent frequency** = fraction of last 10 spins in this set
- **Anti-streak bonus** = +0.10 if the set hasn't appeared in the last 3 spins
- **Set momentum** = hot/cold tracking from shadow performance history
- **Historical filter rate** = the filter model's trained hit rate for this set's filter

### 5.6 Decision Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│                     SPIN COMES IN                                │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: T3 Flash Detection                                       │
│   Scan 6 Table-3 pairs for flashes                               │
│   Compute anchor-based projections for each flashing pair        │
│   Score each candidate via Bayesian UCB                          │
│   Select highest-scoring pair                                    │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: T2 Flash Detection                                       │
│   Scan 7 Table-2 pairs for flashes                               │
│   Extract NEXT row targets from lookup table                     │
│   Expand with ±2 neighbor coverage                               │
│   Select best T2 pair                                            │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: Combine T2 + T3                                          │
│   Union of T2 and T3 number sets                                 │
│   Typical combined size: 15-25 numbers                           │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: Predict Best Set                                         │
│   Score Set-0, Set-5, Set-6 using multi-factor formula           │
│   Select highest-scoring set                                     │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: Apply Filter                                             │
│   Combine table + sign + set filters                             │
│   In RECOVERY mode: override to "zero_both" (safest filter)     │
│   Filter the combined number set                                 │
│   Typical filtered size: 8-15 numbers                            │
└──────────────────────┬───────────────────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 6: Confidence & Decision                                    │
│   Base confidence = pairScore × 100                              │
│   Apply adjustments (projection size, filter quality, momentum)  │
│   Apply sign balance penalty                                     │
│   Apply skip pressure (+5% per consecutive skip)                 │
│                                                                  │
│   If confidence >= threshold → BET                               │
│   If forced bet (maxConsecutiveSkips exceeded) → BET             │
│   Otherwise → SKIP                                               │
└──────────────────────────────────────────────────────────────────┘
```

### 5.7 Graduated Confidence Thresholds

The confidence threshold decreases as the session progresses (urgency increases):

| Session Spins | Threshold | Label |
|---------------|-----------|-------|
| 0 - 20 | 65% | Normal |
| 21 - 35 | 55% | Mild urgency (-10) |
| 36 - 45 | 45% | Aggressive (-20) |
| 46+ | 35% | Very aggressive (-30) |
| RECOVERY mode | Floor at 45% | Safety floor |

### 5.8 Position Code Flash (Quick Path)

Before the full pipeline, the engine checks for a **Position Code Flash** — a precomputed lookup:

```
positionCodeFlashes["SL+2-OR+1-S+0"] → { pair: "prev", hitRate: 0.42 }
```

If the last 3 spins' position codes match a known pattern from training data with sufficient hit rate, the engine skips the full pipeline and bets immediately. This is rare (~5% of decisions) but historically high accuracy.

---

## 6. Filter System

### 6.1 Filter Combinations

The filter system narrows the prediction set using three independent axes:

```
Total combinations = 3 (table) × 3 (sign) × 4 (set) = 36 filters
```

**Table axis:** Zero-table only / Nineteen-table only / Both
**Sign axis:** Positive only / Negative only / Both
**Set axis:** All sets / Set-0 only / Set-5 only / Set-6 only

### 6.2 Filter Application

A number passes the filter if and only if:
1. It belongs to at least one checked **table** (Zero or Nineteen)
2. It belongs to at least one checked **sign** (Positive or Negative)
3. If set filtering is active, it belongs to at least one checked **set**

### 6.3 Filter Selection by AI

The N-gram sequence model votes on the best filter. Each of the 8 layers:
1. Looks up its frequency table for the current context (last N spins).
2. Finds the most likely next category (table/sign/combo).
3. Casts a weighted vote for the filter combination matching that prediction.

The filter with the highest weighted vote total is selected. In RECOVERY mode (3+ consecutive losses), the engine overrides to `"zero_both"` regardless of the model's vote.

---

## 7. Money Management & Bet Sizing

### 7.1 P&L Formula

European roulette pays 35:1 on a straight-up number bet.

```
WIN:  profit = (betPerNumber × 36) - (betPerNumber × numbersCount)
             = betPerNumber × (36 - numbersCount)

LOSS: loss   = -(betPerNumber × numbersCount)
```

The 36 factor = 35:1 payout + return of the winning bet = 36× the bet on the winning number, minus the total staked across all numbers.

**Example:** Betting $2 on each of 12 numbers:
- Win: $2 × (36 - 12) = $2 × 24 = **+$48**
- Loss: -$2 × 12 = **-$24**

### 7.2 Session Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Starting bankroll | $4,000 | Initial capital |
| Session target | $100 | Profit goal to end session |
| Starting bet | $2 per number | Minimum bet size |
| Max bet | `floor(bankroll / (numbers × 2))` | Ensures at least $1 per number |

### 7.3 Three Betting Strategies (Martingale Variants)

**Strategy 1 — Aggressive:**
```
After EACH loss:  bet += $1
After EACH win:   bet = max($2, bet - $1)
```

**Strategy 2 — Conservative:**
```
After 2 CONSECUTIVE losses: bet += $1, reset loss counter
After 2 CONSECUTIVE wins:   bet = max($2, bet - $1), reset win counter
```

**Strategy 3 — Cautious (default):**
```
After 3 CONSECUTIVE losses: bet += $2, reset loss counter
After 2 CONSECUTIVE wins:   bet = max($2, bet - $1), reset win counter
```

All strategies have a minimum bet of $2 per number.

### 7.4 Engine-Level Safety Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| MAX_BET | $10 | Maximum bet per number (hard cap) |
| LOSS_STREAK_RESET | 5 | After N consecutive losses, reset bet to base |
| MAX_RESETS | 5 | Maximum times the streak reset can trigger per session |

### 7.5 Session Completion

- **WIN:** `sessionProfit >= sessionTarget` → auto-stop betting, show green banner
- **BUST:** `currentBankroll <= 0` → auto-stop betting, show red banner

---

## 8. Session Adaptation & Live Learning

### 8.1 EMA (Exponential Moving Average)

After each spin result, the engine updates every active pair's and filter's live hit rate:

```
hitRate_new = hitRate_old × (1 - alpha) + actual_result × alpha
```

Where `alpha = 0.05` (5% weight to the new observation) and `actual_result` is 1 (hit) or 0 (miss).

This creates a recency-weighted moving average that responds to short-term streaks.

### 8.2 Adaptation Weight Schedule

```
adaptationWeight = min(0.5, 0.1 + (totalBets - 10) × 0.02)
```

| Session Bets | Adaptation Weight | Effect |
|-------------|-------------------|--------|
| 0-10 | 0% | Pure historical scores |
| 15 | 20% | Starting to blend |
| 20 | 30% | Moderate session influence |
| 30+ | 50% | Equal historical/session weight |

### 8.3 Trend State Machine

```
                    ┌─────────┐
                    │ NORMAL  │
                    └────┬────┘
                         │ 3 consecutive losses
                         ▼
                    ┌─────────┐
                    │RECOVERY │ → Force "zero_both" filter
                    └────┬────┘   → Blacklist losing pair for 3 bets
                         │ Any win
                         ▼
                    ┌─────────┐
                    │ NORMAL  │
                    └─────────┘
```

**RECOVERY mode behaviors:**
- Overrides filter to `"zero_both"` (widest coverage, ~50% of wheel)
- Blacklists the pair that caused 2+ consecutive losses (for 3 bets)
- Adds shadow performance bonus for alternative pairs
- Floor confidence threshold at 45%

### 8.4 Shadow Tracking

Every decision, the engine records projections for ALL flashing pairs, not just the one selected for betting. When the next spin arrives, it checks which shadow projections would have hit. This builds an unbiased performance record for each pair, avoiding selection bias.

### 8.5 Near-Miss Detection

A "near-miss" occurs when the actual spin lands within ±1 pocket of any predicted number on the physical wheel. Near-misses provide a +0.025 recency bonus (vs +0.05 for actual hits), encouraging the engine to stick with pairs that are "close."

### 8.6 Live Retrain Triggers

The sequence model (N-gram) can retrain mid-session:
- After every 10 bets (periodic refresh)
- After 3 consecutive losses (emergency retrain)
- Pair and filter models update continuously via EMA (no full retrain needed)

---

## 9. Complete Data Flow

```
                        USER ENTERS SPIN NUMBER
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      SPIN STORAGE                           │
│   spins[] array grows by 1, render() called                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   TABLE 1    │  │   TABLE 2    │  │   TABLE 3    │
│  14 pairs    │  │   7 pairs    │  │   6 pairs    │
│  ±1 expand   │  │  ±2 expand   │  │ anchor-based │
│  Lookup proj │  │  Lookup proj │  │ Flash detect │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └────────────┬────┘                 │
                    ▼                      ▼
          ┌─────────────────┐    ┌─────────────────────┐
          │  MANUAL MODE:   │    │    AUTO MODE:        │
          │  User selects   │    │  AI engine scores    │
          │  pairs from     │    │  all flashing pairs  │
          │  all 3 tables   │    │  T3 + T2 combined    │
          │  → intersection │    │  → union + filter    │
          └────────┬────────┘    └──────────┬──────────┘
                   │                        │
                   └────────┬───────────────┘
                            ▼
              ┌─────────────────────────┐
              │   PREDICTION OBJECT     │
              │ { numbers, anchors,     │
              │   loose, anchorGroups,  │
              │   extraNumbers,         │
              │   confidence, signal }  │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   ROULETTE WHEEL        │
              │  Apply active filters   │
              │  (table/sign/set)       │
              │  Visualize on canvas    │
              │  Sync to Money Panel    │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   MONEY MANAGEMENT      │
              │  Store pending bet      │
              │  Wait for next spin     │
              │  On spin: check win/loss│
              │  Adjust bet size        │
              │  Update bankroll        │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   AI FEEDBACK LOOP      │
              │  recordResult() called  │
              │  Update Bayesian priors │
              │  Update EMA hit rates   │
              │  Update trend state     │
              │  Check retrain trigger  │
              └─────────────────────────┘
```

---

## 10. Mathematical Foundation & Assumptions

### 10.1 Core Assumption

The system is built on the hypothesis that roulette outcomes exhibit short-term **positional clustering** on the physical wheel — that is, consecutive spins tend to land in spatially correlated regions more often than pure randomness would predict.

The "flash detection" mechanism captures this by looking for pairs whose position codes have consistent distances (≤1 change) across consecutive spins.

### 10.2 Statistical Models Used

| Model | Type | Mathematical Basis |
|-------|------|--------------------|
| Pair scoring | Beta-Binomial with UCB | Bayesian inference with exploration bonus |
| Filter selection | Multinomial N-gram | Maximum likelihood frequency estimation |
| Live adaptation | Exponential Moving Average | Exponential smoothing (alpha=0.05) |
| Set prediction | Multi-factor weighted scoring | Linear combination of 6 features |
| Bet sizing | Modified Martingale | Progressive increase after losses, decrease after wins |

### 10.3 Key Ratios

| Metric | Value | Significance |
|--------|-------|--------------|
| Coverage per prediction | ~12-18 numbers | 32-49% of the wheel |
| Random hit probability (12 numbers) | 12/37 = 32.4% | Baseline comparison |
| Required hit rate to break even (12 numbers) | 12/36 = 33.3% | With $2 bet at 35:1 payout |
| Training data size | 7,863 spins | 16 session files |
| Filter combinations tested | 36 | 3 × 3 × 4 matrix |
| UCB exploration factor | 0.3 | Controls explore/exploit tradeoff |
| EMA decay rate | 0.05 | 5% weight to each new observation |

### 10.4 Edge Conditions

- **House edge:** European roulette has a 2.7% house edge (1/37 for zero). The system must overcome this edge through superior prediction accuracy.
- **Break-even hit rate:** For N bet numbers at $B each: need to win at least `N / 36` fraction of bets to break even. For 12 numbers: 33.3%. For 8 numbers: 22.2%.
- **Martingale risk:** Progressive bet increases after losses can lead to rapid bankroll depletion. The MAX_BET cap ($10) and LOSS_STREAK_RESET (5) mitigate this.

### 10.5 Questions for Academic Review

1. **Statistical validity:** Does the position code consistency hypothesis (flash detection with ≤1 distance change) have theoretical grounding, or is it a data-mining artifact?

2. **Training/test separation:** The system trains on 7,863 historical spins and tests on a separate 463-spin dataset. Is this sufficient to establish predictive validity, or could the trained parameters be overfit to the training data's specific wheel/dealer characteristics?

3. **Bayesian prior selection:** The Beta distribution priors are initialized from training data (alpha = hits + 1, beta = misses + 1). Is this a reasonable prior, or should a more informative/uninformative prior be used?

4. **UCB exploration factor:** The exploration bonus scaling factor (0.3) was manually tuned. Is there a principled method to select this value?

5. **Filter combination explosion:** With 36 filter combinations tested against each prediction, is there a multiple-comparisons problem? Could the best filter be best by chance rather than genuine predictive power?

6. **EMA vs. Bayesian updating:** The system uses EMA for live adaptation but Bayesian updating for historical scoring. Is there a theoretical justification for using both, or would a unified Bayesian approach be more principled?

7. **Martingale sustainability:** Given the house edge, can any prediction accuracy realistically sustain a modified Martingale strategy over thousands of spins?

---

*End of document.*
