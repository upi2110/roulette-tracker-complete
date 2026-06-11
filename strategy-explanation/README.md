# Strategy Explanation — European Roulette Tracker

This folder explains **every betting strategy in the system** in detail,
written for someone with only a passing familiarity with the app. Each
strategy gets its own document with its algorithm, gates, examples, and
common pitfalls.

If you're new, **read `00-glossary.md` first**. It defines the vocabulary
every strategy uses: T1/T2/T3 tables, position codes, lookup rows, refs,
flash, anchors, neighbours, and the +/− and 0/19 partitions.

## The 7 strategies in the system

| # | Strategy | File | What it does in one sentence |
|---|---|---|---|
| 1 | **Analytics** | [`01-analytics.md`](01-analytics.md) | Bets when Table 2 and Table 3's wheel projections overlap on the same arc. |
| 2 | **T1 Strategy** | [`02-t1-strategy.md`](02-t1-strategy.md) | Bets when Table 1 green + Table 2 gold + Table 3 gold all fire on the same pair. |
| 3 | **3T-Selection** | [`03-strategy-3t-selection.md`](03-strategy-3t-selection.md) | Locks one pair for the session, then bets the intersection of T1 ∩ T2 ∩ T2-13opp ∩ T3 number sets. |
| 4 | **Strategy Lab** | [`04-strategy-lab.md`](04-strategy-lab.md) | Same as 3T-Selection but **without T3** — pure T1 ∩ T2 ∩ T2-13opp intersection. The sandbox version. |
| 5 | **AI-Trained** | [`05-ai-trained.md`](05-ai-trained.md) | Wraps a pre-trained controller; bets per its trained pair/filter/session model. |
| 6 | **Semi-Auto Filter** | [`06-semi-auto.md`](06-semi-auto.md) | User picks the pair; system auto-picks the smallest valid 0/19 × ±sign × set filter combination. |
| 7 | **Manual Replay** | [`07-manual-replay.md`](07-manual-replay.md) | Re-implements the manual AI-panel math for backtest determinism. |

## How they all relate

```
              ┌─────────────────┐
              │  User picks     │
              │  decision mode  │
              └────────┬────────┘
                       ▼
   ┌─────────────────────────────────────────┐
   │  Auto-Update Orchestrator               │
   │  services/auto-update-orchestrator/     │
   └─────┬────────┬───────┬────────┬─────────┘
         ▼        ▼       ▼        ▼  (one per spin)
    Analytics  3T-Sel  Strategy   Semi-Auto / AI-Trained
                       Lab        (other paths)

   The orchestrator picks a single decision module per spin
   based on `decisionMode`, calls its `decide(...)` function,
   and routes the result to Money Management + UI.
```

All seven share these conventions:
- Input: `(engine, spinsArr, idx)` plus a per-strategy options object.
- Output: `{ action: 'BET' | 'SKIP', selectedPair, selectedFilter, numbers[], confidence, reason }`.
- Pure — no DOM access, no `window.spins` reads (the orchestrator extracts those before calling).

## How to use this folder

- **Adding a new strategy?** Read 2–3 existing docs first, then mirror the structure.
- **Debugging a SKIP?** Open the strategy's doc and walk the gates one by one against your log.
- **Trying to understand a hit?** The "Worked example" section in each doc shows how picks were chosen from raw spins.
