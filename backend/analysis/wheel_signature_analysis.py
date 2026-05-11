#!/usr/bin/env python3
"""
Wheel-signature analysis on the user's existing 9,344 spin history.

What this does — DIFFERENT from what we built before:
  • Treats spins as PHYSICAL ANGULAR EVENTS on the European wheel,
    not as a sequence of pair-name strings.
  • Computes pocket-to-pocket angular distances spin-over-spin.
  • Per-source-file chi² test against uniform distribution → tells
    us whether THAT specific source has dealer/wheel signature.
  • Aggregates the angular-distance histogram per source.
  • Cross-checks T1/T2/T3 cells: at each spin, asks whether the actual
    landed inside what T1 predicted, what T2 predicted, what T3
    predicted, and what was the cross-table OVERLAP.
  • Tests: when all three tables point at the same sector, does the
    actual land there at a rate above 1/37 = 2.7%? If yes → exploitable.

Why this is the right question:
  • Pair-name features ('prev', 'prevPlus1') are abstract LABELS.
  • Pocket-to-pocket distance is the actual physical event a real
    wheel would generate signal in.
  • If your live-stream wheels (Evolution etc.) have any dealer
    signature, this analysis will see it.
"""
from __future__ import annotations
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Physical European wheel — 37 numbers in clockwise order
EUROPEAN_WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
WHEEL_INDEX = {n: i for i, n in enumerate(EUROPEAN_WHEEL)}
N_POCKETS = 37

# Same lookup used by your tables
LOOKUP = [[0,13,20,26],[32,36,14,32],[15,11,31,15],[19,30,9,19],[4,8,22,4],
          [21,23,18,21],[2,10,29,2],[25,5,7,25],[17,24,28,17],[34,16,12,34],
          [6,33,35,6],[27,1,3,27],[13,20,26,13],[36,14,32,36],[11,31,15,11],
          [30,9,19,30],[8,22,4,8],[23,18,21,23],[10,29,2,10],[5,7,25,5],
          [24,28,17,24],[16,12,34,16],[33,35,6,33],[1,3,27,1],[20,26,13,20],
          [14,32,36,14],[31,15,11,31],[9,19,30,9],[22,4,8,22],[18,21,23,18],
          [29,2,10,29],[7,25,5,7],[28,17,24,28],[12,34,16,12],[35,6,33,35],
          [3,27,1,3],[26,13,20,26]]
LOOKUP_BY_NUM = {row[0]: row[1:4] for row in LOOKUP}

WHEEL_36 = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3]
REGULAR_OPPOSITES = {0:10,1:21,2:20,3:23,4:33,5:32,6:22,7:36,8:35,9:34,10:26,11:28,12:30,13:29,14:25,15:24,16:19,17:31,18:27,19:16,20:2,21:1,22:6,23:3,24:15,25:14,26:10,27:18,28:11,29:13,30:12,31:17,32:5,33:4,34:9,35:8,36:7}


def get_wheel36_idx(n):
    if n == 26: return 0
    return WHEEL_36.index(n) if n in WHEEL_36 else -1


def numbers_at_pocket(idx):
    idx = idx % 36
    if idx == 0: return [0, 26]
    return [WHEEL_36[idx]]


def expand_targets(targets, neighbor_range):
    """Same math as your live system — ±N ring on both sides + opposites."""
    out = set()
    for t in targets:
        idx = get_wheel36_idx(t)
        if idx != -1:
            for off in range(-neighbor_range, neighbor_range + 1):
                for n in numbers_at_pocket(idx + off):
                    out.add(n)
        opp = REGULAR_OPPOSITES.get(t)
        if opp is not None:
            oi = get_wheel36_idx(opp)
            if oi != -1:
                for off in range(-neighbor_range, neighbor_range + 1):
                    for n in numbers_at_pocket(oi + off):
                        out.add(n)
    return out


def angular_distance(prev, curr):
    """Clockwise distance from prev pocket to curr pocket on European wheel.
    Returns 0..36."""
    if prev not in WHEEL_INDEX or curr not in WHEEL_INDEX:
        return None
    return (WHEEL_INDEX[curr] - WHEEL_INDEX[prev]) % N_POCKETS


def signed_angular_distance(prev, curr):
    """Signed CW/CCW distance, range -18..18. Negative means CCW."""
    d = angular_distance(prev, curr)
    if d is None: return None
    return d if d <= 18 else d - N_POCKETS


def load_data_files():
    """Returns {source_name: [spin numbers, ...]}"""
    out = {}
    data_dir = REPO_ROOT / 'app' / 'data'
    if data_dir.exists():
        for f in sorted(data_dir.glob('data*.txt')):
            spins = []
            for line in f.read_text().splitlines():
                s = line.strip()
                if s:
                    try:
                        n = int(s)
                        if 0 <= n <= 36: spins.append(n)
                    except ValueError: pass
            if len(spins) >= 30:
                out[f.name] = spins
    td_path = REPO_ROOT / 'backend' / 'analysis' / 'training_data.json'
    if td_path.exists():
        td = json.loads(td_path.read_text())
        for sess in (td.get('sessions') or []):
            spins = [s['actual'] for s in (sess.get('spins') or [])
                     if isinstance(s.get('actual'), int) and 0 <= s['actual'] <= 36]
            if len(spins) >= 30:
                out[f'training:{sess.get("session_id","sess")}'] = spins
    return out


def chi2_uniformity(counts, n_bins, n_samples):
    """χ² goodness-of-fit against uniform distribution."""
    if n_samples == 0: return 0.0, n_bins
    expected = n_samples / n_bins
    if expected < 1.0: return 0.0, n_bins
    chi2 = sum((c - expected) ** 2 / expected for c in counts)
    df = n_bins - 1
    return chi2, df


def chi2_pvalue(chi2, df):
    """Approximate p-value using Wilson-Hilferty for chi² → normal."""
    if df <= 0 or chi2 <= 0: return 1.0
    z = ((chi2 / df) ** (1/3) - (1 - 2/(9*df))) / math.sqrt(2/(9*df))
    # Standard normal upper tail
    return 0.5 * math.erfc(z / math.sqrt(2))


def per_source_signature_test(sources):
    """For each source, compute angular-distance histogram + chi² test."""
    print('━' * 78)
    print('PER-SOURCE WHEEL-SIGNATURE TEST')
    print('━' * 78)
    print(f'{"source".ljust(24)} {"spins":>5} {"chi2":>8} {"p-val":>8} {"verdict"}')
    print('─' * 78)

    overall_dist = Counter()
    significant_sources = []

    for src, spins in sources.items():
        if len(spins) < 50: continue
        dists = []
        for i in range(1, len(spins)):
            d = angular_distance(spins[i-1], spins[i])
            if d is not None: dists.append(d)
        cnt = Counter(dists)
        counts_arr = [cnt.get(i, 0) for i in range(N_POCKETS)]
        for i, c in enumerate(counts_arr): overall_dist[i] += c
        chi2, df = chi2_uniformity(counts_arr, N_POCKETS, sum(counts_arr))
        p = chi2_pvalue(chi2, df)
        # Reject uniform at p<0.05 → there's signature
        sig = '*** SIGNATURE' if p < 0.05 else ('  marginal'   if p < 0.20 else '       noise')
        print(f'{src.ljust(24)} {len(spins):>5} {chi2:>8.1f} {p:>8.4f} {sig}')
        if p < 0.05:
            significant_sources.append((src, chi2, p, counts_arr))
    print('─' * 78)

    # Pooled across all sources
    counts_arr = [overall_dist.get(i, 0) for i in range(N_POCKETS)]
    chi2, df = chi2_uniformity(counts_arr, N_POCKETS, sum(counts_arr))
    p = chi2_pvalue(chi2, df)
    print(f'{"POOLED (all)".ljust(24)} {sum(counts_arr):>5} {chi2:>8.1f} {p:>8.4f}')
    print()
    return overall_dist, significant_sources


def angular_histogram_summary(overall_dist):
    """Show the most/least frequent angular distances pooled across data."""
    print('━' * 78)
    print('POOLED ANGULAR-DISTANCE HISTOGRAM (all 9,344 spins)')
    print('━' * 78)
    total = sum(overall_dist.values())
    expected = total / N_POCKETS
    items = sorted(overall_dist.items(), key=lambda kv: -kv[1])
    print(f'Total transitions: {total}  Expected per bucket if uniform: {expected:.1f}')
    print()
    print('Top 5 most-frequent angular distances:')
    for d, c in items[:5]:
        signed = d if d <= 18 else d - 37
        deviation = (c - expected) / expected * 100
        bar = '█' * int(c / expected * 12) if expected > 0 else ''
        print(f'  +{d:>2} pockets ({signed:+3} signed)  {c:>4}  ({deviation:+.1f}% vs uniform)  {bar}')
    print()
    print('Bottom 5 least-frequent angular distances:')
    for d, c in items[-5:]:
        signed = d if d <= 18 else d - 37
        deviation = (c - expected) / expected * 100
        bar = '█' * int(c / expected * 12) if expected > 0 else ''
        print(f'  +{d:>2} pockets ({signed:+3} signed)  {c:>4}  ({deviation:+.1f}% vs uniform)  {bar}')
    print()


def cross_table_signal_test(sources):
    """Per spin: does T1 cover predict, does T2 cover predict, does T3
    cover predict, and does TRIPLE-overlap predict? Compares hit-rates
    against the chance baseline (set-size / 37)."""
    print('━' * 78)
    print('CROSS-TABLE COVER vs ACTUAL — DOES OVERLAP MEAN ANYTHING?')
    print('━' * 78)

    def t1_cover(prev): return expand_targets(LOOKUP_BY_NUM.get(prev, []), 1)
    def t2_cover(prev): return expand_targets(LOOKUP_BY_NUM.get(prev, []), 2)
    def t3_cover(prev): return set(LOOKUP_BY_NUM.get(prev, []))  # T3 = pure 3 targets, no expansion

    bins = ['t1_only', 't2_only', 't3_only', 't1∩t2', 't1∩t2∩t3', 'all_3', 'none', 'baseline']
    hits = defaultdict(int)
    counts = defaultdict(int)
    total_spins = 0

    for src, spins in sources.items():
        for i in range(1, len(spins)):
            prev, actual = spins[i-1], spins[i]
            t1, t2, t3 = t1_cover(prev), t2_cover(prev), t3_cover(prev)
            if not t1 or not t2 or not t3: continue
            total_spins += 1
            triple = t1 & t2 & t3
            t1_t2  = t1 & t2
            # Categorize the actual outcome
            in_t1, in_t2, in_t3 = actual in t1, actual in t2, actual in t3
            if in_t1 and in_t2 and in_t3: hits['all_3'] += 1
            if actual in triple: hits['triple_overlap'] += 1
            if actual in t1_t2: hits['t1∩t2'] += 1
            if in_t1: hits['t1'] += 1
            if in_t2: hits['t2'] += 1
            if in_t3: hits['t3'] += 1
            counts['triple_overlap_size'] += len(triple)
            counts['t1∩t2_size'] += len(t1_t2)
            counts['t1_size'] += len(t1)
            counts['t2_size'] += len(t2)
            counts['t3_size'] += len(t3)

    if total_spins == 0:
        print('  No data.')
        return

    # Compute per-bucket actual hit-rate vs random expectation
    print(f'Total spins analyzed: {total_spins}')
    print()
    print(f'{"bucket".ljust(20)} {"avg cover":>10} {"P(rand)":>8} {"actual hit-rate":>16} {"lift":>8}')
    print('─' * 78)
    rows = [
        ('T1 cover',           't1_size',           't1'),
        ('T2 cover',           't2_size',           't2'),
        ('T3 cover',           't3_size',           't3'),
        ('T1 ∩ T2',            't1∩t2_size',        't1∩t2'),
        ('T1 ∩ T2 ∩ T3',       'triple_overlap_size','triple_overlap'),
    ]
    for label, size_key, hit_key in rows:
        avg_size = counts[size_key] / total_spins
        p_rand = avg_size / 37
        actual_rate = hits[hit_key] / total_spins
        lift = (actual_rate - p_rand) / p_rand * 100 if p_rand > 0 else 0
        print(f'{label.ljust(20)} {avg_size:>10.2f} {p_rand:>8.4f} {actual_rate:>16.4f} {lift:>+7.1f}%')
    print('─' * 78)
    print()
    print('Reading: "lift" > 0 means the actual lands inside the bucket')
    print('         MORE often than random would predict — that is signal.')
    print('         lift ≈ 0 means the bucket is just random.')
    print('         (P(rand) = avg_size / 37, the chance-baseline rate.)')
    print()


def per_source_intersection_lift(sources):
    """The KEY test: for each source individually, what's the lift on
    the T1∩T2∩T3 triple-overlap? If a wheel has dealer signature, the
    actual should land in the triple-overlap region MORE than random."""
    print('━' * 78)
    print('PER-SOURCE TRIPLE-OVERLAP LIFT — FINDING WHICH WHEELS HAVE EDGE')
    print('━' * 78)
    print(f'{"source".ljust(24)} {"spins":>5} {"avg overlap":>11} {"P(rand)":>8} {"actual":>8} {"lift":>8} {"verdict"}')
    print('─' * 78)

    profitable_sources = []

    for src, spins in sources.items():
        if len(spins) < 50: continue
        total = 0
        hits = 0
        size_sum = 0
        for i in range(1, len(spins)):
            prev, actual = spins[i-1], spins[i]
            row = LOOKUP_BY_NUM.get(prev, [])
            if not row: continue
            t1 = expand_targets(row, 1)
            t2 = expand_targets(row, 2)
            t3 = set(row)
            triple = t1 & t2 & t3
            if not triple: continue
            total += 1
            size_sum += len(triple)
            if actual in triple: hits += 1
        if total == 0: continue
        avg_size = size_sum / total
        p_rand = avg_size / 37
        actual_rate = hits / total
        lift = (actual_rate - p_rand) / p_rand * 100 if p_rand > 0 else 0
        # Standard error binomial: sqrt(p(1-p)/n)
        se = math.sqrt(p_rand * (1 - p_rand) / total) if total > 0 else 0
        z = (actual_rate - p_rand) / se if se > 0 else 0
        verdict = '*** EDGE' if z > 1.65 else ('  weak'  if z > 0.5 else '   noise')
        print(f'{src.ljust(24)} {total:>5} {avg_size:>11.2f} {p_rand:>8.4f} {actual_rate:>8.4f} {lift:>+7.1f}% {verdict} (z={z:+.2f})')
        if z > 1.65:
            profitable_sources.append((src, total, p_rand, actual_rate, z))
    print('─' * 78)
    print()
    if profitable_sources:
        print(f'Sources with statistically significant EDGE (z > 1.65, p < 0.05):')
        for src, total, p_rand, actual_rate, z in profitable_sources:
            print(f'  {src}: actual {actual_rate*100:.1f}% vs random {p_rand*100:.1f}% (z={z:+.2f})')
    else:
        print('No source shows statistically significant edge on triple-overlap alone.')
    print()


def angular_lookahead_test(sources, lookback=1):
    """Given last K angular distances, does the next angular distance
    deviate from uniform? Tests whether short-term angular history
    predicts the next angular distance — the core dealer-signature
    hypothesis."""
    print('━' * 78)
    print(f'ANGULAR LOOKAHEAD TEST (lookback={lookback})')
    print('━' * 78)

    # Build conditional distribution P(next angular dist | last dist)
    transitions = defaultdict(Counter)
    for src, spins in sources.items():
        if len(spins) < lookback + 2: continue
        prev_dist = None
        for i in range(1, len(spins)):
            d = angular_distance(spins[i-1], spins[i])
            if d is None: continue
            if prev_dist is not None:
                transitions[prev_dist][d] += 1
            prev_dist = d

    # Test each conditional distribution against uniform
    significant = []
    for cond_d, next_dists in transitions.items():
        n = sum(next_dists.values())
        if n < 50: continue
        counts = [next_dists.get(i, 0) for i in range(N_POCKETS)]
        chi2, df = chi2_uniformity(counts, N_POCKETS, n)
        p = chi2_pvalue(chi2, df)
        if p < 0.05:
            top3 = sorted(next_dists.items(), key=lambda kv: -kv[1])[:3]
            top3_str = ', '.join(f'+{d}({c})' for d, c in top3)
            significant.append((cond_d, n, chi2, p, top3_str))

    if not significant:
        print(f'No conditional angular distribution shows significant deviation (p<0.05).')
        print(f'→ Angular distance is NOT predictable from the previous angular distance alone.')
        return

    print(f'Conditional angular distributions with significant non-uniformity:')
    print(f'{"prev dist".rjust(10)} {"n":>6} {"chi2":>8} {"p":>8}  most-likely-next')
    for cond_d, n, chi2, p, top3_str in sorted(significant, key=lambda x: x[3])[:10]:
        signed = cond_d if cond_d <= 18 else cond_d - 37
        print(f'   +{cond_d}({signed:+3}) {n:>6} {chi2:>8.1f} {p:>8.4f}  {top3_str}')
    print()


def main():
    print()
    print('═' * 78)
    print('WHEEL-SIGNATURE & CROSS-TABLE ANALYSIS')
    print('Data: 17 source files + 2 historical sessions (~9,344 spins)')
    print('═' * 78)
    print()

    sources = load_data_files()
    total = sum(len(v) for v in sources.values())
    print(f'Loaded {len(sources)} sources, {total} total spins.\n')

    # 1. Per-source angular signature test
    overall_dist, sig_sources = per_source_signature_test(sources)

    # 2. Pooled angular histogram
    angular_histogram_summary(overall_dist)

    # 3. Cross-table cover lift
    cross_table_signal_test(sources)

    # 4. Per-source triple-overlap lift
    per_source_intersection_lift(sources)

    # 5. Angular lookahead — is the next angular distance predictable?
    angular_lookahead_test(sources, lookback=1)

    print('═' * 78)
    print('ANALYSIS COMPLETE')
    print('═' * 78)


if __name__ == '__main__':
    main()
