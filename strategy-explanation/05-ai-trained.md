# 05 — AI-Trained Strategy

**Files:**
- `strategies/ai-trained/ai-trained-strategy.js` — the strategy adapter
- `strategies/ai-trained/ai-trained-controller.js` — the actual brain
- `strategies/ai-trained/ai-trained-logger.js` — debug logging

**Decision mode key:** `'ai-trained'`
**Entry point:** `decideAITrainedStrategy(engine, testSpins, idx, ctxOverrides = {})`
**Pair lock:** Implicit — controller decides per spin based on its trained state.

## One-line summary

A **thin adapter** wrapping the `AITrainedController` — the controller
holds a trained pair/filter/session model and decides bet vs skip
per-spin based on its learned policy.

## When to use it

- After you've **trained** the system (clicked TRAIN in the UI).
- When you want fully autonomous bet decisions driven by historical
  hit-rates per pair/filter/session triple.
- Live and backtest must produce identical decisions for identical
  history — that's the controller's contract.

## How it fits

```
┌─────────────────────────────────────────┐
│  Orchestrator: decisionMode='ai-trained'│
└──────────────────┬──────────────────────┘
                   ▼
┌────────────────────────────────────────┐
│  decideAITrainedStrategy(engine,        │
│                          spins, idx,    │
│                          ctxOverrides)  │
└──────┬─────────────────────────────────┘
       │ creates / re-uses per-engine
       ▼
┌────────────────────────────────────────┐
│  AITrainedController                    │
│  - tracks session state                 │
│  - reads trained pair/filter scores     │
│  - emits decisions deterministically    │
└──────┬─────────────────────────────────┘
       ▼
   { action, selectedPair, selectedFilter,
     numbers[], confidence, reason }
```

## The adapter's job

`ai-trained-strategy.js` is intentionally tiny:

1. Look up or create a controller for this engine reference (per-engine
   `WeakMap` cache, plus a special slot for the no-engine backtest path).
2. If `ctxOverrides.reset === true` OR `idx === 0`, reset the controller
   so backtest runs are deterministic.
3. Call `controller.decide(...)` with the spin slice.
4. Return its result verbatim.

## The controller's job (high level)

The controller maintains state across calls:
- **Current session pair** — picked when the session starts; sticks
  until the session ends.
- **Current session filter** — picked alongside the pair (one of the
  Semi-Auto filter combos, see doc 06).
- **Per-pair / per-filter hit rate** — learned from training.
- **Streak tracking** — consecutive wins/losses on the active triple.

When asked for a decision, the controller:
1. Reads recent spins.
2. Looks up its learned policy for the current (pair, filter) state.
3. Decides whether to BET this spin (and on which expanded numbers) or
   SKIP.

The actual decision rules are inside the controller (a sizeable file
worth reading separately) — this doc covers the strategy *adapter*
behaviour.

## Determinism guarantee

The contract:
> *Deterministic for identical (testSpins, idx) when starting from a
> fresh controller — idx === 0 resets automatically. Callers may also
> pass `ctxOverrides.reset = true` to force-reset, or
> `ctxOverrides.controller` to inject their own instance.*

This is what makes the AI-Trained strategy testable: feed the same
history, get the same decisions.

## Reset semantics

| Trigger | Effect |
|---|---|
| `idx === 0` | Auto-reset before calling `controller.decide()`. |
| `ctxOverrides.reset === true` | Force reset before this call. |
| `resetAITrainedStrategy(engine)` | Clear that engine's controller. |
| `resetAITrainedStrategyAll()` | Clear every controller (used by UI on TRAIN-mode change). |

## Worked example

You've trained the model. Then in live mode with `decisionMode='ai-trained'`:

1. Spin 1: history is empty. Controller knows nothing yet → likely SKIP.
2. Spin 2: still building. → SKIP.
3. Spin 5: enough history. Controller's training said
   `(prev_plus_1, both_positive_set5)` has 38% hit rate in similar
   states. Confidence threshold met → BET.
   - `selectedPair = 'prev_plus_1'`
   - `selectedFilter = 'both_positive_set5'`
   - `numbers = [4, 19, 21, 11, 30, 8, …]` (intersection of the pair's
     expansion with the filter — 10 numbers).
   - `confidence = 65`.
4. Spin 6: actual was 21 — HIT. Controller updates streak counter.
5. Spin 7: pair/filter still active (locked for session). Decide again
   based on current state.

The pair/filter combo can change between sessions or on certain triggers
(e.g. loss streak limit reached) — the controller decides when.

## Comparison to the others

| Strategy | Pair lock | Filter | Why use it |
|---|---|---|---|
| AI-Trained | Per-session, controller-managed | Per-session, controller-managed | Hands-off; let learning drive everything |
| 3T-Selection | Per-session, user/auto-picked once | None | Fixed pair + 4-way intersection |
| Strategy Lab | Per-session, user/auto-picked once | None | Sandbox for 3-way intersection |
| Semi-Auto | Per-spin, user-picked | Per-spin, auto-picked (smallest valid) | User picks the pair, system picks the filter |
| Analytics | None — all visible pairs every spin | None | Broad multi-pair coverage |
| T1 Strategy | Per-spin, auto-picked from 5 eligible | None | Strict T1+T2+T3 triple gate |

## Common reasons for SKIP

| Reason | Meaning |
|---|---|
| `not enough history` | Controller needs minimum spins before deciding. |
| `confidence below threshold` | Trained model's confidence for current state is too low. |
| `inactive session` | Controller pauses after a configured loss streak. |

## File map

- `strategies/ai-trained/ai-trained-strategy.js` — adapter (this doc)
- `strategies/ai-trained/ai-trained-controller.js` — actual decision logic
- `strategies/ai-trained/ai-trained-logger.js` — debug log helper
- `tests/app/42-true-learning-ai.test.js` — integration tests
