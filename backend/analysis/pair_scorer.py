"""
Pair Scorer — Phase 2 baseline
================================

Reads pair_training_data.jsonl (records produced by /log_pair_training)
and ranks T1 pair keys by predicted hit probability with a confidence
score. Designed to be a drop-in baseline today and a swap-target for an
ML model later.

Scoring logic (baseline, transparent):
- For each pairKey in the candidate list, look at all past records where
  table='t1' AND pairKey == that key.
- Apply exponential recency weighting (newer records weigh more) to
  compute a weighted hit-rate.
- Confidence = effective-sample-size / (effective-sample-size + k0).
  This is the standard "pseudo-count smoothing" approach: confidence
  rises as the weighted count grows. With small data, recommendations
  are honest (low confidence) rather than overconfident.

The scorer never raises if the file is missing or empty — it returns a
neutral ranking (0.5 prob, 0.0 confidence) so the frontend can fall
back to manual / auto-pick behavior.
"""

from __future__ import annotations
import json
import math
import os
from typing import Dict, List, Optional, Tuple

# Path resolves to <repo>/backend/analysis/pair_training_data.jsonl
DEFAULT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'pair_training_data.jsonl'
)
# Path-A bootstrap: synthesized records from historical spin data.
# Read alongside the live file so confidence is high from spin #1.
BOOTSTRAP_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'pair_training_bootstrap.jsonl'
)

# Recency half-life: a record N spins old has weight 0.5**(N/HALF_LIFE).
# 50 means a record 50 spins ago counts half as much as the most recent.
HALF_LIFE = 50.0
# Confidence pseudo-count: confidence = n_eff / (n_eff + K0). K0=10 means
# you need ~10 effective samples to reach 50% confidence on that pair.
K0 = 10.0


def _load_one(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []
    out = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out


def _load_records(path: str = DEFAULT_PATH) -> List[dict]:
    """Bootstrap records first (older spinIndex range), then live
    records. The recommender's recency weighting then naturally
    prefers live data when it overlaps."""
    return _load_one(BOOTSTRAP_PATH) + _load_one(path)


def _is_bootstrap(r: dict) -> bool:
    """Records produced by bootstrap_pair_training.js carry a `source`
    field (e.g. 'app/data/data1.txt'). Live records do not. Bootstrap
    records are a synthetic prior — they shouldn't decay because their
    spinIndex is artificial."""
    return bool(r.get('source'))


def _score_pair(records: List[dict], pair_key: str, current_spin_index: Optional[int]) -> Tuple[float, float, int]:
    """Return (weighted_hit_rate, confidence, raw_count) for a pairKey.

    Weighting:
      - Bootstrap (synthetic prior) records  → unit weight (no decay).
      - Live records (no `source` field)     → recency-weighted with
        half-life HALF_LIFE relative to current_spin_index (caller-
        supplied current spin count of the live session).
    """
    rel = [r for r in records if r.get('table') == 't1' and r.get('pairKey') == pair_key]
    if not rel:
        return 0.5, 0.0, 0
    # current_spin_index governs decay for LIVE records only. If caller
    # didn't supply one, default to max live spinIndex so the most
    # recent live record gets weight ≈ 1.
    live_max = 0
    for r in rel:
        if not _is_bootstrap(r):
            si = r.get('spinIndex') or 0
            if si > live_max:
                live_max = si
    if current_spin_index is None:
        current_spin_index = live_max if live_max > 0 else 0

    n_eff = 0.0
    h_eff = 0.0
    for r in rel:
        if _is_bootstrap(r):
            w = 1.0
        else:
            si = r.get('spinIndex')
            if si is None:
                continue
            age = max(0, current_spin_index - si)
            w = 0.5 ** (age / HALF_LIFE)
        n_eff += w
        if r.get('hit'):
            h_eff += w
    if n_eff <= 0:
        return 0.5, 0.0, len(rel)
    return h_eff / n_eff, n_eff / (n_eff + K0), len(rel)


def rank_t1_pairs(
    candidate_pair_keys: List[str],
    current_spin_index: Optional[int] = None,
    avoid_pair_keys: Optional[List[str]] = None,
    path: str = DEFAULT_PATH,
) -> Dict:
    """Rank candidate T1 pair keys by predicted hit probability.

    Args:
        candidate_pair_keys: list of pair keys currently available in T1
            (frontend supplies these — the available pair list).
        current_spin_index: 1-based spin count at the moment of request.
            Used to weight historical records by recency.
        avoid_pair_keys: keys to exclude from the recommendation (e.g.
            the pair that just missed — caller wants to rotate).

    Returns:
        {
          "bestPair": str | None,
          "confidence": float,         # 0..1
          "predictedHitRate": float,   # 0..1
          "ranked": [
            {"pairKey": str, "predictedHitRate": float,
             "confidence": float, "rawCount": int}
          ],
          "totalRecords": int
        }
    """
    avoid = set(avoid_pair_keys or [])
    records = _load_records(path)

    ranked: List[Dict] = []
    for pk in candidate_pair_keys:
        if pk in avoid:
            continue
        rate, conf, raw = _score_pair(records, pk, current_spin_index)
        ranked.append({
            'pairKey': pk,
            'predictedHitRate': round(rate, 4),
            'confidence': round(conf, 4),
            'rawCount': raw,
        })

    # Sort: highest predicted hit rate, tiebreak by confidence then rawCount
    ranked.sort(key=lambda x: (x['predictedHitRate'], x['confidence'], x['rawCount']), reverse=True)

    best = ranked[0] if ranked else None
    return {
        'bestPair': best['pairKey'] if best else None,
        'confidence': best['confidence'] if best else 0.0,
        'predictedHitRate': best['predictedHitRate'] if best else 0.5,
        'ranked': ranked,
        'totalRecords': len(records),
    }


if __name__ == '__main__':
    # quick smoke test
    candidates = ['prev', 'prev_13opp', 'prevPlus1', 'ref0', 'ref19']
    print(json.dumps(rank_t1_pairs(candidates), indent=2))
