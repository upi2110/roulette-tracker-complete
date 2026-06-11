# 07 — Manual Replay

**File:** `strategies/manual-replay/manual-replay.js`
**Decision mode key (backtest):** `'manual-test'`

## One-line summary

A **self-contained re-implementation** of the live AI Prediction panel's
math, used by the Auto Test runner to reproduce manual-mode bets from a
pure spin-history input — no DOM, no globals, no engine state.

## Why this exists

The live AI Prediction panel (`ui/ai-prediction-panel/ai-prediction-panel.js`)
computes its picks by reading:
- `window.spins`
- the rendered tables in the DOM
- a handful of helpers attached to `window`
- the engine's mutable state

That's fine for live use but **breaks backtest determinism**: you can't
replay history through a UI panel because the UI panel reads global
mutable state.

Manual Replay solves this by **copying every helper** the live panel
uses (`calculateReferences`, `calculatePositionCode`, `generateAnchors`,
`expandAnchorsToBetNumbers`, `LOOKUP_TABLE`, `WHEEL_36`, etc.) into one
module that:

1. Takes `spinHistory` as an explicit parameter (no `window.spins` read).
2. Takes the user's pair selections as explicit parameters (no DOM read).
3. Returns the same numbers the live panel would have displayed.

## Parity contract

> *Every helper here is a byte-for-byte copy of the corresponding
> function in `app/renderer-3tables.js` and `roulette-wheel/table-lookup.js`.*

If the live functions ever change, Manual Replay **must** be updated in
lockstep — otherwise live and backtest diverge silently. The comments
next to each copied helper name the source function so you can find what
to update.

## What gets copied

Constants:
- `WHEEL_NO_ZERO`, `WHEEL_36`
- `REGULAR_OPPOSITES`, `DIGIT_13_OPPOSITES`
- `LOOKUP_TABLE` (the 37-row table that drives T1/T2)

Functions (all verbatim from `renderer-3tables.js`):
- `calculateWheelDistance` — wheel-step distance from idx to a target
- `calculateReferences(prev, prevPrev)` — produces all 10 pair refs
- `calculatePositionCode(reference, actual)` — produces `S+0`, `OL+2`, etc.
- `getNumberAtPosition(refNum, posCode)` — inverse of above
- `flipPositionCode(posCode)` — flips L↔R within the same +/− distance
- `generateAnchors(refNum, ref13Opp, prevPosCode)` — the T3 anchors function
- `expandAnchorsToBetNumbers(purpleAnchors, greenAnchors)` — ±1 expand
- `expandTargetsToBetNumbers(targets, neighborRange)` — generic ±N expand
- `getLookupRow(num)` — drives T1/T2 anchor columns

## Algorithm

Given:
- `spinHistory` — array of spin numbers (not wrapped objects)
- `selections` — `{ table1Pairs: [...], table2Pairs: [...], table3Pairs: [...] }`

Compute, **for each spin index** in the backtest range:
1. Calculate refs from the last 2 spins.
2. For each selected T1/T2 pair: build its expansion from the lookup row
   anchors.
3. For each selected T3 pair: build its anchors from `generateAnchors()`
   and expand with `expandAnchorsToBetNumbers()`.
4. Intersect all selected tables' expansions.
5. The intersection is the bet for that spin.

This is the **manual mode** of the live AI Prediction Panel — what would
happen if the user manually picked T1=P+1, T2=P+1+P+1_13opp, T3=P+1, and
let the panel intersect them.

## When to use it

- In **Auto Test** runs with `method='manual-test'` — feeds a fixed spin
  file and a fixed manual-selection set, verifies the predictions match
  what the live panel would have produced.
- In **regression tests** — to assert that a refactor of the live math
  didn't change behaviour.

## When NOT to use it

- Live mode — use the live AI panel, not this. Manual Replay has no UI,
  no incremental updates, no caching. It's a pure math function.

## Worked example

Suppose you have a saved spin file `2024-03-15.json` with 200 spins, and
you want to test "T3=P+1, T2=P+1+P+1_13opp" performance over those spins.

In the Auto Test UI:
1. Load `2024-03-15.json`
2. Method: `manual-test`
3. Selections: `{table3Pairs: ['prevPlus1'], table2Pairs: ['prevPlus1', 'prevPlus1_13opp']}`
4. Click Run

The runner iterates the 200 spins, calling Manual Replay for each:

```js
const bet = ManualReplay.computeBetNumbers(spinHistorySoFar, selections);
const actual = spinHistory[i];
const hit = bet.includes(actual);
```

It then aggregates hit rate, P&L, etc. — all without ever touching the
DOM or live engine.

## Why this is a "strategy"

It's technically a strategy in the system because the Auto Test runner
treats it as one — same decision mode mechanism, same
`(engine, spins, idx) → decision` contract. But conceptually, Manual
Replay is **less a decision-making strategy** and more a **simulator of
the manual UI's math**.

A live user clicking pair headers IS the strategy. Manual Replay just
makes that strategy testable.

## Pitfalls

- **Stay in lockstep with `renderer-3tables.js`.** If anyone changes
  `calculateReferences` or `getNumberAtPosition` in the renderer, copy
  the change here too. Tests will catch divergence eventually but
  loudly.
- **No state.** Manual Replay never mutates anything. If you want
  controller-style learning behaviour, use AI-Trained instead.

## File map

- `strategies/manual-replay/manual-replay.js` — the whole module
- `services/auto-test-runner/auto-test-runner.js` — calls it when
  `method === 'manual-test'`
- Sources kept in lockstep:
  - `app/renderer-3tables.js` (helper functions)
  - `roulette-wheel/table-lookup.js` (LOOKUP_TABLE)
