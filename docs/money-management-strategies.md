# Money Management Strategies

The money-management panel supports 8 bet-sizing strategies. Cycle through them
with the strategy button in the panel header; the ⚙️ button opens the variables
editor for tunable strategies. Some strategies expose live tunables that
persist within the session but are not written to disk.

**Default: Strategy 8 (Ethical)** — chosen for its combination of fractional
loss accounting, session-target smart cap, and modest $2 minimum stake.

| # | Name            | Loss trigger                     | Win trigger              | Extras                             |
|---|-----------------|----------------------------------|--------------------------|------------------------------------|
| 1 | 🟢 Aggressive    | +$1 per loss                     | −$1 per win              | Fast escalation, no cap            |
| 2 | 🔵 Conservative  | +$1 after 3 cumulative losses    | −$1 after 2 consec wins  | Isolated wins do NOT reset tally  |
| 3 | 🟣 Cautious      | +$2 after 3 consec losses        | −$1 after 2 consec wins  | Streak-based, +$2 increment       |
| 4 | 🛡️ Defensive    | +$1 after 8 cumulative losses    | −$1 after 1 win          | Fully editable via ⚙️              |
| 5 | 🧠 Logical       | +$1 after 6 fractional units     | −$1 after 1 hit          | N/4 bet scaling + target cap      |
| 6 | 🪶 Super Cautious| +$1 after 3 consec losses (≤$5)  | −$1 after 1 consec win   | Hard $5 cap + smart target cap    |
| 7 | ➖ Flat Bet      | none                             | none                     | Manual only, uses 💲 Adjust stake |
| 8 | 🕊 Ethical (default) | +$1 when ceil(ΣN/12) ≥ 3          | −$2 after 2 consec wins   | Single refN=12, ceiling accum, smart cap |

## Strategy 8 — Ethical (default)

### Spec (2026-07-04)

1. **Min bet is always $2.** The floor for both the base bet and the
   smart-cap output.
2. **Session target is $100** with soft-max ~$125 acceptable.
3. **+$1 after 3 cumulative loss-units** (Tier 1). Each miss adds
   `min(N, refN)/refN` to the accumulator — see rule 6.
4. **−$2 after 2 consecutive wins** (Tier 1). Floor at $2. Losses reset
   the win counter.
5. **Auto-cap so a projected win never overshoots $100.** If
   `bet × (36 − N)` exceeds remaining-to-target, the bet is shrunk to
   `floor(remaining / (36 − N))`, then floored at $2.
6. **Fractional loss accounting.** Betting fewer numbers = smaller loss
   contribution. Each tier has its own reference N (`refN`). A miss on N
   numbers adds `min(N, refN)/refN` to the tier's accumulator.

### Single-threshold rule (2026-07-07 final spec)

**No tier ladder.** One reference `refN = 12` is used for every bet.

- Each miss adds `N / 12` units to `s8LossUnits`.
- Escalation fires when `ceil(s8LossUnits) ≥ 3` → **+$1**, units reset.
- Two consecutive wins → **−$2**, floored at $2, units reset.
- Ceiling means `3.87 units` counts as `4` — anything ≥ 3 triggers.

*Example.* Bet 21 numbers (loss) → `21/12 = 1.75`. Bet 25 numbers
(loss) → `25/12 ≈ 2.083`. Total ≈ `3.833`; `ceil(3.833) = 4 ≥ 3` →
+$1 → base $3, units reset.

*Example.* Bet 24 numbers (loss) → `24/12 = 2.0`. `ceil(2) = 2 < 3` →
no trigger yet. Second 24-num loss → 4.0 → `ceil(4) = 4 ≥ 3` → +$1.

*Pre-bet check.* If a bet completes without hitting the ceiling and
subsequent activity leaves `ceil(s8LossUnits) ≥ 3`, the escalation
still fires when the next bet's amount is calculated — the yellow
"Next Bet" bar and the placed chips both reflect the new base.

### Behavior notes

- **Isolated wins do NOT reset loss-units.** Only a de-escalation resets
  both the win counter AND the loss-units accumulator.
- **When profit ≥ $100, bet holds at $2.** No hard stop — the smart cap
  simply refuses to grow the bet.
- **Switching TO S8, saveAdjustStake, or the Reset button** all reset
  `s8Tier = 1` and `s8LossUnits = 0` for a clean start.
- **No tier persistence.** Each bet's tier is a pure function of its own
  `numbersCount` — there is no climbing/dropping ladder.
- **The strategy is invariant to how numbers are picked.** Wheel filters
  (0/19, 2/12, Sign, Set, grey), T3-halfs, T1/T2 break, Inverse, Same
  mode, Wheel mode, and Modern-vs-Classic view all just reshape the bet
  pool; only `numbersCount` matters to the tier math.

### Tunables (⚙️ variables editor)

| Field                      | Default | Notes                                          |
|----------------------------|---------|------------------------------------------------|
| Increase after loss-units  | 3       | Fractional threshold (0.5 min).                |
| Increase $                 | 1       | Rule 3 delta.                                  |
| Decrease bet after wins    | 2       | Consecutive-win trigger.                       |
| Decrease $                 | 2       | Rule 4 delta (floored at min).                 |
| Min bet $                  | 2       | Rule 1 floor.                                  |
| Session target $           | 100     | Smart-cap ceiling.                             |
| Soft-max $                 | 125     | Informational — smart cap enforces target.    |
| Reference N                | 12      | Numbers per loss-unit (rule 6 divisor).       |

## Implementation notes

- All strategy state lives on `moneyPanel.sessionData` under `s2*`/`s4*`/
  `s5*`/`s6*`/`s8*` prefixes.
- `calculateBetAmount(N)` dispatches to strategy-specific helpers for
  S5 (`_s5BetPerNumber`), S6 (`_s6BetPerNumber`), and S8 (`_s8BetPerNumber`);
  S1-4 and S7 use the shared bankroll-cap fallback.
- Base-bet mutation lives in the strategy-specific block of
  `recordBetResult()`.
