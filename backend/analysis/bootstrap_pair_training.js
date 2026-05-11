#!/usr/bin/env node
/**
 * Bootstrap pair-training data from existing spin history.
 * ────────────────────────────────────────────────────────
 * Reads:
 *   - app/data/data*.txt              (~8,326 spins across 17 files)
 *   - backend/analysis/training_data.json (1,018 spins, 2 historical sessions)
 *
 * Walks each session, replays every spin through the SAME projection
 * math the live system uses (LOOKUP_TABLE + ±1/±2 neighbor expansion +
 * REGULAR_OPPOSITES + DIGIT_13_OPPOSITES — all inlined here verbatim
 * from app/renderer-3tables.js + roulette-wheel/table-lookup.js so the
 * results are byte-identical).
 *
 * For every spin (after a 3-spin warmup) and every candidate pair
 * (22 keys: 12 base + 10 _13opp; ref0/ref19 are mutual so no
 * ref0_13opp/ref19_13opp), computes:
 *   - refNum
 *   - T1 coverage (±1 ring) + hit?
 *   - T2 coverage (±2 ring) + hit?
 *   - position code (S+0 / SL+1 / SR+2 / OL+1 / etc.)
 *
 * Writes TWO new files (existing pair_training_data.jsonl is preserved):
 *
 *   1) backend/analysis/spin_pattern_data.jsonl
 *      One rich record per spin, full per-pair × per-table fan-out
 *      + tableHits aggregates. Used for offline pattern analysis.
 *
 *   2) backend/analysis/pair_training_bootstrap.jsonl
 *      Flat per-(spin,pair) records, same shape as live capture.
 *      The recommender (Python pair_scorer + JS pair-recommender)
 *      reads this in addition to pair_training_data.jsonl, so every
 *      candidate pair has thousands of records → confidence ≈ 0.99
 *      from spin #1 of any new live session.
 *
 * Idempotent: running again rewrites both output files fresh.
 */

const fs = require('fs');
const path = require('path');

// ─── Inlined math (verbatim from app/renderer-3tables.js + table-lookup.js) ───

const WHEEL_36 = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
const WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const REGULAR_OPPOSITES = {
    0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
    10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
    19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
    28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
};

const DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
};

const LOOKUP_TABLE = [
    [0, 13, 20, 26], [32, 36, 14, 32], [15, 11, 31, 15], [19, 30, 9, 19], [4, 8, 22, 4],
    [21, 23, 18, 21], [2, 10, 29, 2], [25, 5, 7, 25], [17, 24, 28, 17], [34, 16, 12, 34],
    [6, 33, 35, 6], [27, 1, 3, 27], [13, 20, 26, 13], [36, 14, 32, 36], [11, 31, 15, 11],
    [30, 9, 19, 30], [8, 22, 4, 8], [23, 18, 21, 23], [10, 29, 2, 10], [5, 7, 25, 5],
    [24, 28, 17, 24], [16, 12, 34, 16], [33, 35, 6, 33], [1, 3, 27, 1], [20, 26, 13, 20],
    [14, 32, 36, 14], [31, 15, 11, 31], [9, 19, 30, 9], [22, 4, 8, 22], [18, 21, 23, 18],
    [29, 2, 10, 29], [7, 25, 5, 7], [28, 17, 24, 28], [12, 34, 16, 12], [35, 6, 33, 35],
    [3, 27, 1, 3], [26, 13, 20, 26]
];

function getLookupRow(num) {
    const row = LOOKUP_TABLE.find(r => r[0] === num);
    return row ? { first: row[1], second: row[2], third: row[3] } : null;
}

function getWheel36Index(num) {
    if (num === 26) return 0;  // 26 shares pocket with 0
    return WHEEL_36.indexOf(num);
}

function getNumbersAtPocket(pocketIdx) {
    const idx = ((pocketIdx % 36) + 36) % 36;
    if (idx === 0) return [0, 26];
    return [WHEEL_36[idx]];
}

function expandTargetsToBetNumbers(targets, neighborRange) {
    const out = new Set();
    targets.forEach(target => {
        const idx = getWheel36Index(target);
        if (idx !== -1) {
            for (let off = -neighborRange; off <= neighborRange; off++) {
                getNumbersAtPocket(idx + off).forEach(n => out.add(n));
            }
        }
        const opp = REGULAR_OPPOSITES[target];
        if (opp !== undefined) {
            const oppIdx = getWheel36Index(opp);
            if (oppIdx !== -1) {
                for (let off = -neighborRange; off <= neighborRange; off++) {
                    getNumbersAtPocket(oppIdx + off).forEach(n => out.add(n));
                }
            }
        }
    });
    return Array.from(out);
}

// Position code — verbatim port of calculatePositionCode (renderer line 25–88).
// Returns 'S+0' / 'SL+1' / 'SR+2' / 'O+0' / 'OL+1' / etc., or 'XX' if no hit.
function calculatePositionCode(reference, actual) {
    const refNum = reference === 0 ? 26 : reference;
    const actNum = actual === 0 ? 26 : actual;
    if (refNum === actNum) return 'S+0';
    const refIdx = WHEEL_STANDARD.lastIndexOf(refNum);
    const actIdx = WHEEL_STANDARD.lastIndexOf(actNum);
    if (refIdx === -1 || actIdx === -1) return 'XX';
    const opp = REGULAR_OPPOSITES[reference];
    const oppNum = opp === 0 ? 26 : opp;
    const oppIdx = WHEEL_STANDARD.lastIndexOf(oppNum);
    // Walk both directions up to ±4 from refIdx to detect SL/SR
    for (let d = 1; d <= 4; d++) {
        const left  = ((refIdx - d) % 37 + 37) % 37;
        const right = (refIdx + d) % 37;
        if (WHEEL_STANDARD[left]  === actNum) return `SL+${d}`;
        if (WHEEL_STANDARD[right] === actNum) return `SR+${d}`;
    }
    if (actNum === oppNum) return 'O+0';
    if (oppIdx !== -1) {
        for (let d = 1; d <= 4; d++) {
            const left  = ((oppIdx - d) % 37 + 37) % 37;
            const right = (oppIdx + d) % 37;
            if (WHEEL_STANDARD[left]  === actNum) return `OL+${d}`;
            if (WHEEL_STANDARD[right] === actNum) return `OR+${d}`;
        }
    }
    return 'XX';
}

// ─── Pair → refNum derivation (mirrors strategy-lab._refNumFor + autopilot) ───

function refNumForPair(pairKey, prev, prevPrev) {
    // Special mutual-opposite pairs first.
    if (pairKey === 'ref0')  return 0;
    if (pairKey === 'ref19') return 19;
    // _13opp suffix → strip, compute base refNum, then digit-13-opposite it.
    const isOpp = pairKey.endsWith('_13opp');
    const base  = isOpp ? pairKey.slice(0, -'_13opp'.length) : pairKey;
    let r;
    switch (base) {
        case 'prev':            r = prev; break;
        case 'prevPlus1':       r = (typeof prev === 'number') ? Math.min(prev + 1, 36) : null; break;
        case 'prevMinus1':      r = (typeof prev === 'number') ? Math.max(prev - 1, 0)  : null; break;
        case 'prevPlus2':       r = (typeof prev === 'number') ? Math.min(prev + 2, 36) : null; break;
        case 'prevMinus2':      r = (typeof prev === 'number') ? Math.max(prev - 2, 0)  : null; break;
        case 'prevPrev':        r = (typeof prevPrev === 'number') ? prevPrev : null; break;
        case 'prevPrevPlus1':   r = (typeof prevPrev === 'number') ? Math.min(prevPrev + 1, 36) : null; break;
        case 'prevPrevMinus1':  r = (typeof prevPrev === 'number') ? Math.max(prevPrev - 1, 0)  : null; break;
        case 'prevPrevPlus2':   r = (typeof prevPrev === 'number') ? Math.min(prevPrev + 2, 36) : null; break;
        case 'prevPrevMinus2':  r = (typeof prevPrev === 'number') ? Math.max(prevPrev - 2, 0)  : null; break;
        default: r = null;
    }
    if (r === null) return null;
    return isOpp ? DIGIT_13_OPPOSITES[r] : r;
}

const CANDIDATE_PAIRS = [
    'prev', 'prev_13opp',
    'prevPlus1',  'prevPlus1_13opp',
    'prevMinus1', 'prevMinus1_13opp',
    'prevPlus2',  'prevPlus2_13opp',
    'prevMinus2', 'prevMinus2_13opp',
    'prevPrev',   'prevPrev_13opp',
    'prevPrevPlus1',  'prevPrevPlus1_13opp',
    'prevPrevMinus1', 'prevPrevMinus1_13opp',
    'prevPrevPlus2',  'prevPrevPlus2_13opp',
    'prevPrevMinus2', 'prevPrevMinus2_13opp',
    'ref0',  // 13-opposite is ref19 (mutual); no separate ref0_13opp
    'ref19'  // 13-opposite is ref0
];

function oppositePairKey(pk) {
    if (pk === 'ref0')  return 'ref19';
    if (pk === 'ref19') return 'ref0';
    if (pk.endsWith('_13opp')) return pk.slice(0, -'_13opp'.length);
    return pk + '_13opp';
}

// Build a candidate's coverage on T1 / T2 given a single spin's history.
function pairCoverage(pk, prev, prevPrev) {
    const refNum = refNumForPair(pk, prev, prevPrev);
    if (refNum === null || typeof refNum !== 'number') {
        return { refNum: null, t1Cover: [], t2Cover: [], rowTargets: null };
    }
    const row = getLookupRow(refNum);
    if (!row) return { refNum, t1Cover: [], t2Cover: [], rowTargets: null };
    const targets = [row.first, row.second, row.third];
    const t1Cover = expandTargetsToBetNumbers(targets, 1);
    const t2Cover = expandTargetsToBetNumbers(targets, 2);
    return { refNum, t1Cover, t2Cover, rowTargets: row };
}

// ─── Source loading ─────────────────────────────────────────────

function loadSpinsFromTxt(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const spins = [];
    for (const ln of lines) {
        const s = ln.trim();
        if (!s) continue;
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 36) spins.push(n);
    }
    return spins;
}

function loadSessionsFromTrainingJson(filePath) {
    const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const out = [];
    for (const sess of (j.sessions || [])) {
        const spins = (sess.spins || []).map(s => s.actual).filter(n => Number.isFinite(n));
        out.push({
            sessionId: sess.session_id || `session-${out.length + 1}`,
            casino: sess.casino || null,
            spins
        });
    }
    return out;
}

function listSourceSessions() {
    const repoRoot = path.resolve(__dirname, '../..');
    const sessions = [];

    // 1) app/data/*.txt
    const dataDir = path.join(repoRoot, 'app', 'data');
    if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir)
            .filter(f => /^data\d+\.txt$/.test(f))
            .sort();
        for (const f of files) {
            const fp = path.join(dataDir, f);
            const spins = loadSpinsFromTxt(fp);
            if (spins.length >= 4) {
                sessions.push({ source: `app/data/${f}`, sessionId: f.replace('.txt', ''), spins });
            }
        }
    }

    // 2) backend/analysis/training_data.json
    const tdPath = path.join(repoRoot, 'backend', 'analysis', 'training_data.json');
    if (fs.existsSync(tdPath)) {
        for (const s of loadSessionsFromTrainingJson(tdPath)) {
            if (s.spins.length >= 4) {
                sessions.push({
                    source: `backend/analysis/training_data.json#${s.sessionId}`,
                    sessionId: `training-${s.sessionId}`,
                    spins: s.spins
                });
            }
        }
    }

    return sessions;
}

// ─── Main bootstrap ────────────────────────────────────────────

function main() {
    const repoRoot = path.resolve(__dirname, '../..');
    const outRich  = path.join(repoRoot, 'backend', 'analysis', 'spin_pattern_data.jsonl');
    const outFlat  = path.join(repoRoot, 'backend', 'analysis', 'pair_training_bootstrap.jsonl');

    const sessions = listSourceSessions();
    console.log(`📦 Found ${sessions.length} source sessions`);
    let totalSpins = 0;
    for (const s of sessions) totalSpins += s.spins.length;
    console.log(`   Total spins across all sources: ${totalSpins}`);

    const richStream = fs.createWriteStream(outRich, { encoding: 'utf8' });
    const flatStream = fs.createWriteStream(outFlat, { encoding: 'utf8' });

    let richCount = 0, flatCount = 0;
    let perPairTotals = {};   // pairKey → { samples, t1Hits, t2Hits }
    for (const pk of CANDIDATE_PAIRS) perPairTotals[pk] = { samples: 0, t1Hits: 0, t2Hits: 0 };

    let absoluteSpinCounter = 0;  // monotonic across all sources for recency weighting

    for (const sess of sessions) {
        const spins = sess.spins;
        // Per-pair streak tracker (length of consecutive T1 hits ending at i-1).
        const streak = {};
        for (const pk of CANDIDATE_PAIRS) streak[pk] = 0;

        for (let i = 0; i < spins.length; i++) {
            absoluteSpinCounter++;
            // Need at least i>=3 for any pair (warmup). prev/prevPrev exist when i>=2.
            const actual = spins[i];
            const prev    = (i >= 1) ? spins[i - 1] : null;
            const prevPrev = (i >= 2) ? spins[i - 2] : null;
            if (i < 3) continue;  // mirror live's WATCH window

            const perPair = {};
            const t1HitPairs = [];
            const t2HitPairs = [];
            const bothHitPairs = [];

            for (const pk of CANDIDATE_PAIRS) {
                const cov = pairCoverage(pk, prev, prevPrev);
                if (cov.refNum === null) {
                    perPair[pk] = { refNum: null, t1Hit: false, t2Hit: false, t1PosCode: null, t2PosCode: null, streakBefore: streak[pk], is13OppOf: oppositePairKey(pk) };
                    streak[pk] = 0;
                    continue;
                }
                const t1Hit = cov.t1Cover.includes(actual);
                const t2Hit = cov.t2Cover.includes(actual);
                const posCode = calculatePositionCode(cov.refNum, actual);
                const streakBefore = streak[pk];
                streak[pk] = t1Hit ? (streakBefore + 1) : 0;

                perPair[pk] = {
                    refNum: cov.refNum,
                    t1Hit, t2Hit,
                    t1PosCode: t1Hit ? posCode : null,
                    t2PosCode: t2Hit ? posCode : null,
                    streakBefore,
                    is13OppOf: oppositePairKey(pk)
                };
                if (t1Hit) t1HitPairs.push(pk);
                if (t2Hit) t2HitPairs.push(pk);
                if (t1Hit && t2Hit) bothHitPairs.push(pk);

                // Flat record — one per (spin, pair). Used by the recommender.
                flatStream.write(JSON.stringify({
                    spinIndex: absoluteSpinCounter,
                    sessionId: sess.sessionId,
                    source: sess.source,
                    actual, prev, prevPrev,
                    table: 't1',
                    pairKey: pk,
                    is13Opp: pk.endsWith('_13opp'),
                    hit: t1Hit
                }) + '\n');
                flatCount++;
                perPairTotals[pk].samples++;
                if (t1Hit) perPairTotals[pk].t1Hits++;
                if (t2Hit) perPairTotals[pk].t2Hits++;
            }

            richStream.write(JSON.stringify({
                spinIndex: absoluteSpinCounter,
                sessionId: sess.sessionId,
                source: sess.source,
                actual, prev, prevPrev,
                perPair,
                tableHits: { t1HitPairs, t2HitPairs, bothHitPairs }
            }) + '\n');
            richCount++;
        }
    }

    richStream.end();
    flatStream.end();

    // Summary
    console.log('\n✅ Bootstrap complete');
    console.log(`   ${outRich.replace(repoRoot + '/', '')}: ${richCount} rich records`);
    console.log(`   ${outFlat.replace(repoRoot + '/', '')}: ${flatCount} flat records`);
    console.log('\n📊 Per-pair T1 hit rates (across all source sessions):');
    const sorted = Object.entries(perPairTotals)
        .map(([pk, v]) => ({ pk, samples: v.samples, t1Rate: v.samples ? v.t1Hits / v.samples : 0, t2Rate: v.samples ? v.t2Hits / v.samples : 0 }))
        .sort((a, b) => b.t1Rate - a.t1Rate);
    for (const r of sorted) {
        console.log(`   ${r.pk.padEnd(24)} samples=${String(r.samples).padStart(5)} T1=${(r.t1Rate*100).toFixed(1)}%  T2=${(r.t2Rate*100).toFixed(1)}%`);
    }
}

main();
