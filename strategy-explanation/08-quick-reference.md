# 08 — Quick Reference

A one-page cheat sheet covering every strategy at a glance. For depth,
read the individual docs (01–07).

## Decision-mode keys (`autoUpdateOrchestrator.decisionMode`)

| Key | Strategy | File |
|---|---|---|
| `'analytics'` | Analytics | `strategies/analytics/analytics-strategy.js` |
| `'t1-strategy'` | T1 Strategy | `strategies/t1/t1-strategy.js` |
| `'3t-selection'` | 3T-Selection (live) | `strategies/strategy-3t-selection/strategy-3t-selection.js` |
| `'test'` | Strategy Lab (sandbox) | `strategies/strategy-lab/strategy-lab.js` |
| `'ai-trained'` | AI-Trained | `strategies/ai-trained/ai-trained-strategy.js` |
| `'manual-test'` (backtest only) | Manual Replay | `strategies/manual-replay/manual-replay.js` |
| (UI checkbox layer) | Semi-Auto Filter | `strategies/semi-auto/semi-auto-filter.js` |

## At-a-glance comparison

| | Analytics | T1 | 3T-Sel | Strategy Lab | AI-Trained | Semi-Auto | Manual Replay |
|---|---|---|---|---|---|---|---|
| **Pair lock per session?** | No | No (per spin) | Yes | Yes | Controller-driven | User-driven | Caller-supplied |
| **Tables consulted** | T2 + T3 | T1 + T2 + T3 | T1 + T2 + T2-13o + T3 | T1 + T2 + T2-13o | Whatever controller learned | Whichever the user clicks | Caller-supplied |
| **Pick count target** | 12 | 12 | varies (intersection size) | varies | varies | ≥ 4 | varies |
| **Confidence source** | density alignment | engine pair model | empty bet ⇒ skip | empty bet ⇒ skip | controller policy | min-size threshold | n/a |
| **Best for** | Broad multi-pair coverage | Strict triple-flash | Confident single-pair, T3-confirmed | Looser single-pair sandbox | Hands-off autonomous | User-driven with smart filter | Backtest fidelity |

## Common output schema

Every strategy returns:

```js
{
  action: 'BET' | 'SKIP',
  selectedPair: string | null,         // refKey: 'prev_plus_1' etc.
  selectedFilter: string | null,       // e.g. 'nineteen_positive', null for most
  numbers: number[],                   // the bet pool
  confidence: number,                  // 0–100
  reason: string                       // human-readable
}
```

## DevTools snippets for diagnostics

```js
// Current decision mode
const orch = window.autoUpdateOrchestrator;
console.log('mode =', orch.decisionMode);

// What's locked (3T / Strategy Lab)
console.log('locked pair =', orch._3tLockedPair);

// Latest analytics decision
console.log(window.aiPanel._lastAnalyticsDecision);

// Visible pair families (drives every strategy's filtering)
console.log([...window.getVisiblePairFamilies()]);

// Engine state
console.log('pairs in model:',
            Object.keys(window.aiAutoEngine.pairModels || {}).length);

// Live flash sets (what's currently gold on screen)
const spins = window.spins;
console.log('T3 gold:', window.aiAutoEngine._getComputeFlashTargets(spins, 0, 12));
console.log('T2 gold:', window.aiAutoEngine._getComputeT2FlashTargets(spins, 0, 12));
```

## "How do I figure out why X happened?" — flowchart

```
You see something unexpected
            │
            ▼
Is it a SKIP or a BET?
    │           │
    SKIP        BET (but on wrong numbers)
    │           │
    │           ▼
    │       Open the strategy's doc → "Worked example"
    │       Trace the algorithm with your spin history
    │       Run the DevTools snippets above to see live state
    │
    ▼
Open the strategy's doc → "Common reasons for SKIP" table
Match the symptom to a row
If no match: run the DevTools snippets, inspect the reason text in the decision
```

## Glossary cross-reference

| Term | Where defined |
|---|---|
| Position code (`S+0`, `OL+2`) | [00-glossary §6](00-glossary.md#6-position-codes-s0-ol2-etc) |
| Lookup row | [00-glossary §5](00-glossary.md#5-the-lookup-row-t1t2s-source) |
| References (refs) | [00-glossary §3](00-glossary.md#3-references-refs) |
| 13-opposite | [00-glossary §4](00-glossary.md#4-the-13-opposite-_13opp) |
| Flash / gold | [00-glossary §7](00-glossary.md#7-flash--gold-highlights) |
| Pair families | [00-glossary §8](00-glossary.md#8-pair-families) |
| +/− and 0/19 partitions | [00-glossary §9](00-glossary.md#9-wheel-partitions) |
| SET_0/5/6 | [00-glossary §10](00-glossary.md#10-the-3-number-sets-set_0--set_5--set_6) |
