/**
 * T1-strategy — Auto Test decision policy that bets only when three
 * independent signals align on the same pair family:
 *
 *   (1) Table 1 NEXT-row green highlight:  ≥2 of the pair's 3 raw
 *       projection anchors (first/second/third from getLookupRow) are
 *       members of the carry-forward active SET_5 / SET_6.
 *   (2) Table 2 golden flash on the same pair's dataPair key.
 *   (3) Table 3 flash on the same pair's refKey (engine-level flash).
 *
 * When all three gates pass, the strategy picks the 2 anchors (from the
 * pair's 3) that fall in the active side, expands them ±1 on the wheel
 * via the same expandTargetsToBetNumbers helper the renderer uses,
 * then trims/prioritises to exactly 12 numbers. Confidence is computed
 * by the engine's own _computeConfidence so the trained pair/filter/
 * session model still gates the final BET vs SKIP decision.
 *
 * The module is intentionally narrow. It does NOT:
 *   - touch table formation, flash formation, or the renderer;
 *   - bypass engine.recordResult / engine.recordSkip (the runner still
 *     calls those as it does for every other method);
 *   - short-circuit the engine's session state — all scoring and
 *     confidence values flow through engine methods.
 *
 * Exposed API:
 *   decideT1Strategy(engine, testSpins, idx) → {
 *     action: 'BET'|'SKIP',
 *     selectedPair: string|null,
 *     selectedFilter: string|null,
 *     numbers: number[],          // exactly 12 when action === 'BET'
 *     confidence: number,
 *     reason: string
 *   }
 *
 * The shape matches AutoTestRunner._simulateDecision so the rest of
 * _runSession (P&L, recordResult, step logging) is untouched.
 */

// ── Wheel sets ───────────────────────────────────────────────────
// Copied verbatim from app/roulette-wheel.js so this helper is
// self-contained in Node test contexts where that script is not
// loaded. If these ever drift, the test suite will catch it — see
// tests/app/55-t1-strategy.test.js group A.
const T1_SET_0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
const T1_SET_5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
const T1_SET_6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

// Pair families eligible for T1-strategy. Only pairs that have both a
// Table 1 NEXT-row dataPair AND an engine-level refKey can participate,
// because the T3-flash gate requires a refKey. The six "_13opp" variants
// in Table 1 have no engine refKey, so they are deliberately excluded —
// which also matches the spec's "careful and selective" directive.
const T1_ELIGIBLE_PAIRS = [
    { dataPair: 'prev',         refKey: 'prev',         anchor: (p) => p },
    { dataPair: 'prevPlus1',    refKey: 'prev_plus_1',  anchor: (p) => Math.min(p + 1, 36) },
    { dataPair: 'prevMinus1',   refKey: 'prev_minus_1', anchor: (p) => Math.max(p - 1, 0) },
    { dataPair: 'prevPlus2',    refKey: 'prev_plus_2',  anchor: (p) => Math.min(p + 2, 36) },
    { dataPair: 'prevMinus2',   refKey: 'prev_minus_2', anchor: (p) => Math.max(p - 2, 0) }
];

// Target bet-set size (per spec).
const T1_BET_SIZE = 12;

/**
 * Walk testSpins[0..idx] backward, return the first {active, side} we hit
 * (SET_5 or SET_6). Returns null when history is pure SET_0 or empty.
 */
function _t1CarryForward(testSpins, idx) {
    for (let i = idx; i >= 0; i--) {
        const n = testSpins[i];
        if (typeof n !== 'number') continue;
        if (T1_SET_5.has(n)) return { trigger: n, active: T1_SET_5, side: '5' };
        if (T1_SET_6.has(n)) return { trigger: n, active: T1_SET_6, side: '6' };
    }
    return null;
}

/**
 * Prioritised trim: (1) the 2 chosen anchors first, (2) other
 * active-side members, (3) SET_0 shared members, (4) everything else.
 * Ties resolved by numeric order for determinism. Returns exactly
 * `size` numbers OR null if input cannot reach `size`.
 */
function _t1TrimToSize(allNumbers, anchors, activeSideSet, size) {
    if (!allNumbers || allNumbers.length < size) return null;
    const priority = (n) => {
        if (anchors.includes(n)) return 0;
        if (activeSideSet.has(n)) return 1;
        if (T1_SET_0.has(n)) return 2;
        return 3;
    };
    const sorted = Array.from(new Set(allNumbers)).sort((a, b) => {
        const pa = priority(a), pb = priority(b);
        if (pa !== pb) return pa - pb;
        return a - b;
    });
    return sorted.length >= size ? sorted.slice(0, size) : null;
}

/**
 * Primary entry point called by AutoTestRunner when options.method ===
 * 'T1-strategy'. Returns a decision object of the same shape as
 * AutoTestRunner._simulateDecision, so the rest of _runSession is
 * unchanged.
 */
function decideT1Strategy(engine, testSpins, idx) {
    const skip = (reason) => {
        if (engine) engine._currentDecisionSpins = null;
        return {
            action: 'SKIP',
            selectedPair: null,
            selectedFilter: null,
            numbers: [],
            confidence: 0,
            reason: `T1: ${reason}`
        };
    };

    if (!engine) return skip('No engine');
    if (!Array.isArray(testSpins) || idx < 3 || idx >= testSpins.length) {
        return skip('Insufficient history');
    }

    // Engine context window (same pattern as _simulateDecision).
    engine._currentDecisionSpins = testSpins.slice(0, idx + 1);

    // ── Gate 1: carry-forward active side ──
    const trig = _t1CarryForward(testSpins, idx);
    if (!trig) return skip('No SET_5/SET_6 trigger in history');

    const lastSpin = testSpins[idx];

    // ── Gate 2: T1 green coverage — ≥2 of 3 raw anchors in active side ──
    const t1Candidates = [];
    for (const pd of T1_ELIGIBLE_PAIRS) {
        const anchorNum = pd.anchor(lastSpin);
        const row = engine._getLookupRow ? engine._getLookupRow(anchorNum) : null;
        if (!row) continue;
        const targets = [row.first, row.second, row.third];
        const activeTargets = targets.filter(t => trig.active.has(t));
        if (activeTargets.length >= 2) {
            t1Candidates.push({ ...pd, anchorNum, targets, activeTargets });
        }
    }
    if (t1Candidates.length === 0) return skip('No T1-green pair on this spin');

    // ── Gate 3: T2 golden flash must fire on the same dataPair ──
    const t2Data = engine.simulateT2FlashAndNumbers
        ? engine.simulateT2FlashAndNumbers(testSpins, idx)
        : null;
    const t2DataPair = t2Data ? t2Data.dataPair : null;

    // ── Gate 4: T3 engine-flash must fire on the same refKey ──
    const t3Flash = engine._getFlashingPairsFromHistory
        ? engine._getFlashingPairsFromHistory(testSpins, idx)
        : new Map();

    const surviving = t1Candidates.filter(c => {
        const t2Match = t2DataPair && t2DataPair === c.dataPair;
        const t3Match = t3Flash && t3Flash.has && t3Flash.has(c.refKey);
        return t2Match && t3Match;
    });
    if (surviving.length === 0) {
        return skip(`T1-green=${t1Candidates.length} but T2+T3 gate failed`);
    }

    // ── Step: score via engine._scorePair (uses trained pair model) ──
    let bestPair = null, bestScore = -1;
    for (const c of surviving) {
        let projection = null;
        try {
            projection = engine._computeProjectionForPair
                ? engine._computeProjectionForPair(testSpins, idx, c.refKey)
                : null;
        } catch (_) { projection = null; }
        const pairData = {
            refKey: c.refKey,
            pairName: c.dataPair,
            numbers: (projection && projection.numbers) ? projection.numbers : [],
            data: projection || {}
        };
        let score = 0.5;
        try {
            score = engine._scorePair(c.refKey, pairData);
        } catch (_) { score = 0.5; }
        if (score > bestScore) {
            bestScore = score;
            bestPair = { ...c, score, projection };
        }
    }
    if (!bestPair) return skip('No scorable T1 pair');

    // ── Step: pick 2 of 3 anchors (those in the active side) ──
    // bestPair.activeTargets has ≥2 entries by construction; if all 3 are
    // in the active set, pick the first two in lookup order (deterministic).
    const anchors2 = bestPair.activeTargets.slice(0, 2);

    // ── Step: expand ±1 via the same helper Table 1 uses ──
    let expanded = [];
    try {
        expanded = engine._getExpandTargetsToBetNumbers
            ? engine._getExpandTargetsToBetNumbers(anchors2, 1)
            : [];
    } catch (_) { expanded = []; }
    const expandedArr = Array.isArray(expanded) ? expanded : Array.from(expanded || []);

    // ── Step: trim/prioritise to exactly 12 ──
    const finalNumbers = _t1TrimToSize(expandedArr, anchors2, trig.active, T1_BET_SIZE);
    if (!finalNumbers) {
        return skip(`Expansion too narrow: ${expandedArr.length} < ${T1_BET_SIZE}`);
    }

    // ── Step: engine confidence + bet/skip ──
    const confidence = engine._computeConfidence
        ? engine._computeConfidence(bestScore, 0, finalNumbers)
        : Math.round(bestScore * 100);
    const threshold = typeof engine.confidenceThreshold === 'number' ? engine.confidenceThreshold : 55;
    const forcebet = engine.session
        && typeof engine.session.consecutiveSkips === 'number'
        && typeof engine.maxConsecutiveSkips === 'number'
        && engine.session.consecutiveSkips >= engine.maxConsecutiveSkips;

    engine._currentDecisionSpins = null;

    if (confidence >= threshold || forcebet) {
        return {
            action: 'BET',
            selectedPair: bestPair.dataPair,
            selectedFilter: 'both_both',
            numbers: finalNumbers,
            confidence,
            reason: `T1-strategy side=${trig.side} pair=${bestPair.dataPair} anchors=[${anchors2.join(',')}] (conf ${confidence}%)`
        };
    }
    return skip(`Low confidence ${confidence}% < ${threshold}%`);
}

// ── Dual export (Node tests + browser <script>) ──
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        decideT1Strategy,
        T1_SET_0, T1_SET_5, T1_SET_6,
        T1_ELIGIBLE_PAIRS, T1_BET_SIZE,
        // Internal helpers exposed for targeted unit tests only.
        _t1CarryForward, _t1TrimToSize
    };
}
if (typeof window !== 'undefined') {
    window.decideT1Strategy = decideT1Strategy;
    window.T1_ELIGIBLE_PAIRS = T1_ELIGIBLE_PAIRS;
}
