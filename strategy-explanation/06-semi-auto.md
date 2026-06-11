# 06 — Semi-Auto Filter

**File:** `strategies/semi-auto/semi-auto-filter.js`
**UI toggle:** "Semi-Auto" checkbox in the AI Prediction panel.

## One-line summary

**User picks the pair manually**; the system auto-picks the smallest valid
**0/19 × ±sign × set** filter combination that leaves at least 4
numbers (tiebreaker: prefer the table-side the latest spin fell on).

## When to use it

- When you've spotted a pair you want to bet but you'd like the system to
  pick the tightest filter automatically.
- When you want bets of 4–10 numbers rather than 12+ (smaller, more
  surgical).

## The picture

```
User clicks: "P+1" in T1 (or T2, T3 — any pair header)
            │
            ▼
   Strategy reads:
     - the pair's full expansion (numbers it would project)
     - the latest actual spin number
            │
            ▼
   For each of 36 filter combinations (table × sign × set):
     filtered = pairExpansion ∩ tableSet ∩ signSet ∩ numberSet
            │
            ▼
   Drop filters where |filtered| < 4
   Pick the combination with the FEWEST surviving numbers
   Tiebreaker: prefer combos that include the actual spin's table side
            │
            ▼
   Final bet = filtered numbers (4 to ~10 numbers)
```

## The 36 filter combinations

Three orthogonal dimensions:

### Dimension 1: Table side (0 / 19 / both)
- **0-table**: 19 numbers — `{3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7}`
- **19-table**: 18 numbers — `{15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35}`
- **both**: all 37 (no filter)

### Dimension 2: Sign (positive / negative / both)
- **positive**: 19 numbers (POSITIVE_NUMS)
- **negative**: 18 numbers (NEGATIVE_NUMS)
- **both**: no filter

### Dimension 3: Number-Set (all / set0 / set5 / set6)
- **all**: no set filter (original 9 combos — backward compatible)
- **set0**: SET_0's 13 numbers
- **set5**: SET_5's 12 numbers
- **set6**: SET_6's 12 numbers

**Total: 3 × 3 × 4 = 36 combinations.**

The combo keys look like:
```
zero_positive            (0-table + positive sign + no set filter)
nineteen_negative_set5   (19-table + negative sign + SET_5)
both_both                (no filter at all — original V6 default)
```

## Algorithm

```python
# Pseudocode
def semi_auto_pick(pair_expansion, last_spin):
    candidates = []
    for combo in SEMI_FILTER_COMBOS:    # all 36
        filtered = pair_expansion
        if combo.table == 'zero':       filtered &= ZERO_TABLE_NUMS
        elif combo.table == 'nineteen': filtered &= NINETEEN_TABLE_NUMS
        if combo.sign == 'positive':    filtered &= POSITIVE_NUMS
        elif combo.sign == 'negative':  filtered &= NEGATIVE_NUMS
        if combo.set == 'set0':         filtered &= SET_0
        elif combo.set == 'set5':       filtered &= SET_5
        elif combo.set == 'set6':       filtered &= SET_6
        if len(filtered) >= MIN_NUMBERS:        # 4
            candidates.append((combo, filtered))
    if not candidates:
        return None  # SKIP
    candidates.sort(key=lambda c: (
        len(c[1]),                   # smallest first
        -len(c[1] & SAME_TABLE_AS(last_spin))  # then prefer same-table
    ))
    return candidates[0]
```

## Worked example

**Setup:** User clicks `P+1` (T1). Latest spin = 4 (which is in the
**19-table** and is **positive**).

The pair P+1's expansion (from the live AI panel) is, say:
```
{4, 19, 21, 22, 9, 18, 11, 30, 8, 23, 10, 15, 35}   (13 numbers)
```

Apply each filter and check survivor count:

| Combo | Table filter applied | Sign filter applied | Set filter applied | Result | Size |
|---|---|---|---|---|---|
| both_both | none | none | none | all 13 | 13 |
| nineteen_positive | drop 0-table | drop negative | none | `{4, 19, 22, 9, 30, 8, 11, 35}` | 8 |
| nineteen_both_set5 | drop 0-table | none | keep SET_5 only | `{15, 11, 31, 24, 14}` ∩ pair = `{11, 15}` | 2 (fails MIN_NUMBERS) |
| zero_negative | drop 19-table | drop positive | none | `{18, 23, 29, 7, 5, 10, 2, 25}` ∩ pair = `{18, 23, 10}` | 3 (fails) |
| nineteen_positive_set5 | … | … | … | `{4, 19, 11, 30, 8, 35}` ∩ SET_5 = `{11}` ∩ pair = small | likely fail |
| nineteen_negative | drop 0-table | drop positive | none | `{24, 6, 17, 34, 33, 16, 28, 12}` ∩ pair = empty | fail |
| … | | | | | |

Suppose only 4 combos meet MIN_NUMBERS (4):
| Combo | Size | Same-table-as-last (19) count |
|---|---|---|
| nineteen_positive | 8 | 8 (all in 19-table by definition) |
| both_positive | 11 | 8 |
| both_both | 13 | 8 |
| nineteen_both | 12 | 12 |

Sort by (size, -same_table):
1. **nineteen_positive** (8, -8) ← **picked**
2. both_positive (11, -8)
3. nineteen_both (12, -12)
4. both_both (13, -8)

Final bet: `{4, 19, 22, 9, 30, 8, 11, 35}` — 8 numbers.

## Tiebreaker: "same table as last spin"

If two combos have the same size, the one that has MORE numbers in the
same table-side as the most recent actual spin wins. Rationale: the last
hit's side is "warmer" — bias the bet toward continuing that side.

For instance, if the last spin was 17 (19-table), prefer combos where
more of the surviving numbers are in the 19-table. This is a soft
heuristic — not deterministic if no tie exists.

## Why a minimum of 4

If the smallest valid combo only had 1–3 numbers, the bet would be
single-digit volatile. 4 is a practical lower bound for stable money
management.

## How it integrates

Semi-Auto isn't an independent decision mode the orchestrator selects
between. It's a **filter layer** wrapped around the user's manual pair
selection in the AI Prediction Panel:

1. User clicks a pair in T1/T2/T3.
2. Panel computes the pair's expansion (the math the panel always does).
3. If the Semi-Auto checkbox is ON, the panel calls `semiAutoFilter.pick(...)`
   to choose the smallest valid combo.
4. Panel updates the displayed bet numbers + filter label.
5. Money panel reads these and places the bet on the next spin.

So Semi-Auto runs alongside whatever decision mode is active — it's a
filter, not a decider.

## File map

- `strategies/semi-auto/semi-auto-filter.js` — `SemiAutoFilter` class with all 36 combos
- `ui/ai-prediction-panel/ai-prediction-panel.js` — calls `semiAutoFilter.pick()` when the checkbox is on
