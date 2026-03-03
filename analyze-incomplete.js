/**
 * Incomplete Session Deep Analysis
 * Trains on data1-data16.txt, tests on data17.txt
 * Focuses ONLY on incomplete sessions (Strategy 1) to understand why they fail.
 */
const fs = require('fs');
const path = require('path');

// ── Load renderer functions into global scope (same as session-depth-analysis.js) ──
const { loadRendererFunctions } = require('./tests/test-setup');
const R = loadRendererFunctions();
global.calculatePositionCode = R.calculatePositionCode;
global.calculateReferences = R.calculateReferences;
global.DIGIT_13_OPPOSITES = R.DIGIT_13_OPPOSITES;
global.generateAnchors = R.generateAnchors;
global.expandAnchorsToBetNumbers = R.expandAnchorsToBetNumbers;
global._getPosCodeDistance = R._getPosCodeDistance;
if (R._computeFlashTargets) global._computeFlashTargets = R._computeFlashTargets;
if (R._computeT2FlashTargets) global._computeT2FlashTargets = R._computeT2FlashTargets;
if (R.calculateWheelAnchors) global.calculateWheelAnchors = R.calculateWheelAnchors;
if (R.getLookupRow) global.getLookupRow = R.getLookupRow;
if (R.expandTargetsToBetNumbers) global.expandTargetsToBetNumbers = R.expandTargetsToBetNumbers;

// Number sets
global.ZERO_TABLE_NUMS = R.ZERO_TABLE_NUMS || new Set([3,26,0,32,21,2,25,27,13,36,23,10,5,1,20,14,18,29,7]);
global.NINETEEN_TABLE_NUMS = R.NINETEEN_TABLE_NUMS || new Set([15,19,4,17,34,6,11,30,8,24,16,33,31,9,22,28,12,35]);
global.POSITIVE_NUMS = R.POSITIVE_NUMS || new Set([3,26,0,32,15,19,4,27,13,36,11,30,8,1,20,14,31,9,22]);
global.NEGATIVE_NUMS = R.NEGATIVE_NUMS || new Set([21,2,25,17,34,6,23,10,5,24,16,33,18,29,7,28,12,35]);

// Load table-lookup.js into global scope
const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;');
fn();

// Load modules
const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

const engine = new AIAutoEngine();
const dataLoader = new AIDataLoader();

// ── Train on data1-data16.txt ──
const dataDir = path.join(__dirname, 'app', 'data');
const trainFiles = [];
for (let i = 1; i <= 16; i++) {
    const fp = path.join(dataDir, `data${i}.txt`);
    if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf-8');
        const parsed = dataLoader.parseTextContent(raw, `data${i}.txt`);
        trainFiles.push(parsed.spins);
    }
}
engine.train(trainFiles);
engine.isEnabled = true;
console.log(`Trained on ${trainFiles.length} files (${trainFiles.reduce((s, a) => s + a.length, 0)} spins)`);

// Create runner AFTER training
const runner = new AutoTestRunner(engine);

// ── Test on data17.txt ──
const testRaw = fs.readFileSync(path.join(dataDir, 'data17.txt'), 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'data17.txt').spins;
console.log(`Test data: ${testSpins.length} spins (data17.txt)\n`);

async function main() {
    const config = { maxBet: 10, lossStreakReset: 5, maxResets: 5 };
    console.log('Running sessions... (this may take a moment)\n');
    const results = await runner.runAll(testSpins, config);

    const sessions = results.strategies[1].sessions;

    // ── Separate sessions by outcome ──
    const winSessions = sessions.filter(s => s.outcome === 'WIN');
    const bustSessions = sessions.filter(s => s.outcome === 'BUST');
    const incompleteSessions = sessions.filter(s => s.outcome === 'INCOMPLETE');

    console.log('================================================================');
    console.log('  OVERVIEW');
    console.log('================================================================');
    console.log(`Total Strategy 1 sessions: ${sessions.length}`);
    console.log(`  WIN:        ${winSessions.length}`);
    console.log(`  BUST:       ${bustSessions.length}`);
    console.log(`  INCOMPLETE: ${incompleteSessions.length}`);
    console.log();

    if (incompleteSessions.length === 0) {
        console.log('No incomplete sessions found. Nothing to analyze.');
        return;
    }

    // ── Collect detailed stats for each incomplete session ──
    const incompleteStats = incompleteSessions.map(s => {
        const betSteps = s.steps.filter(st => st.action === 'BET');
        const skipSteps = s.steps.filter(st => st.action === 'SKIP');
        const watchSteps = s.steps.filter(st => st.action === 'WATCH');
        const reanalyzeSteps = s.steps.filter(st => st.action === 'REANALYZE');

        const hits = betSteps.filter(st => st.hit);
        const hitRate = betSteps.length > 0 ? hits.length / betSteps.length : 0;

        // Max drawdown from steps
        let peak = 0;
        let maxDrawdown = 0;
        for (const st of s.steps) {
            if (st.cumulativeProfit > peak) peak = st.cumulativeProfit;
            const dd = peak - st.cumulativeProfit;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }

        // Average numbers bet per BET decision
        const avgNumsBet = betSteps.length > 0
            ? betSteps.reduce((sum, st) => sum + st.numbersCount, 0) / betSteps.length
            : 0;

        // Pair frequency
        const pairCounts = {};
        for (const st of betSteps) {
            if (st.selectedPair) {
                pairCounts[st.selectedPair] = (pairCounts[st.selectedPair] || 0) + 1;
            }
        }

        // Filter/set frequency
        const filterCounts = {};
        for (const st of betSteps) {
            if (st.selectedFilter) {
                filterCounts[st.selectedFilter] = (filterCounts[st.selectedFilter] || 0) + 1;
            }
        }

        // Profit trajectory: profit at each BET step
        const profitTrajectory = betSteps.map(st => st.cumulativeProfit);

        // Consecutive loss streaks
        let maxConsecLoss = 0;
        let currentStreak = 0;
        for (const st of betSteps) {
            if (!st.hit) {
                currentStreak++;
                if (currentStreak > maxConsecLoss) maxConsecLoss = currentStreak;
            } else {
                currentStreak = 0;
            }
        }

        return {
            startIdx: s.startIdx,
            bets: betSteps.length,
            skips: skipSteps.length,
            watches: watchSteps.length,
            reanalyzes: reanalyzeSteps.length,
            totalSteps: s.steps.length,
            hits: hits.length,
            hitRate,
            finalProfit: s.finalProfit,
            maxDrawdown,
            avgNumsBet,
            pairCounts,
            filterCounts,
            maxConsecLoss,
            profitTrajectory
        };
    });

    // Same stats for WIN sessions (for comparison)
    const winStats = winSessions.map(s => {
        const betSteps = s.steps.filter(st => st.action === 'BET');
        const skipSteps = s.steps.filter(st => st.action === 'SKIP');
        const watchSteps = s.steps.filter(st => st.action === 'WATCH');
        const reanalyzeSteps = s.steps.filter(st => st.action === 'REANALYZE');
        const hits = betSteps.filter(st => st.hit);
        const hitRate = betSteps.length > 0 ? hits.length / betSteps.length : 0;

        const avgNumsBet = betSteps.length > 0
            ? betSteps.reduce((sum, st) => sum + st.numbersCount, 0) / betSteps.length
            : 0;

        const pairCounts = {};
        for (const st of betSteps) {
            if (st.selectedPair) {
                pairCounts[st.selectedPair] = (pairCounts[st.selectedPair] || 0) + 1;
            }
        }

        const filterCounts = {};
        for (const st of betSteps) {
            if (st.selectedFilter) {
                filterCounts[st.selectedFilter] = (filterCounts[st.selectedFilter] || 0) + 1;
            }
        }

        let maxConsecLoss = 0;
        let currentStreak = 0;
        for (const st of betSteps) {
            if (!st.hit) {
                currentStreak++;
                if (currentStreak > maxConsecLoss) maxConsecLoss = currentStreak;
            } else {
                currentStreak = 0;
            }
        }

        return {
            startIdx: s.startIdx,
            bets: betSteps.length,
            skips: skipSteps.length,
            watches: watchSteps.length,
            reanalyzes: reanalyzeSteps.length,
            totalSteps: s.steps.length,
            hits: hits.length,
            hitRate,
            finalProfit: s.finalProfit,
            maxDrawdown: s.maxDrawdown,
            avgNumsBet,
            pairCounts,
            filterCounts,
            maxConsecLoss
        };
    });

    // ── Helper: average of array ──
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // ════════════════════════════════════════════════════════════
    //  PER-INCOMPLETE-SESSION DETAIL
    // ════════════════════════════════════════════════════════════
    console.log('================================================================');
    console.log('  INDIVIDUAL INCOMPLETE SESSIONS (Strategy 1)');
    console.log('================================================================\n');

    console.log(
        'StartIdx'.padEnd(10) +
        'BETs'.padStart(6) +
        'SKIPs'.padStart(7) +
        'Resets'.padStart(8) +
        'Hits'.padStart(6) +
        'HitRate'.padStart(9) +
        'AvgNums'.padStart(9) +
        'MaxLoss'.padStart(9) +
        'MaxDD'.padStart(8) +
        'Profit'.padStart(9) +
        '  TopPair'
    );
    console.log('-'.repeat(105));

    incompleteStats.forEach(s => {
        const topPair = Object.entries(s.pairCounts).sort((a, b) => b[1] - a[1])[0];
        console.log(
            String(s.startIdx).padEnd(10) +
            String(s.bets).padStart(6) +
            String(s.skips).padStart(7) +
            String(s.reanalyzes).padStart(8) +
            String(s.hits).padStart(6) +
            (s.hitRate * 100).toFixed(1).padStart(8) + '%' +
            s.avgNumsBet.toFixed(1).padStart(9) +
            String(s.maxConsecLoss).padStart(9) +
            ('$' + s.maxDrawdown.toFixed(0)).padStart(8) +
            ('$' + s.finalProfit.toFixed(0)).padStart(9) +
            '  ' + (topPair ? `${topPair[0]}(${topPair[1]})` : 'none')
        );
    });

    // ════════════════════════════════════════════════════════════
    //  COMPARISON: INCOMPLETE vs WIN
    // ════════════════════════════════════════════════════════════
    console.log('\n================================================================');
    console.log('  COMPARISON: INCOMPLETE vs WIN SESSIONS');
    console.log('================================================================\n');

    const incAvgHitRate = avg(incompleteStats.map(s => s.hitRate));
    const winAvgHitRate = avg(winStats.map(s => s.hitRate));
    const incAvgBets = avg(incompleteStats.map(s => s.bets));
    const winAvgBets = avg(winStats.map(s => s.bets));
    const incAvgSkips = avg(incompleteStats.map(s => s.skips));
    const winAvgSkips = avg(winStats.map(s => s.skips));
    const incAvgResets = avg(incompleteStats.map(s => s.reanalyzes));
    const winAvgResets = avg(winStats.map(s => s.reanalyzes));
    const incAvgProfit = avg(incompleteStats.map(s => s.finalProfit));
    const incAvgDrawdown = avg(incompleteStats.map(s => s.maxDrawdown));
    const winAvgDrawdown = avg(winStats.map(s => s.maxDrawdown));
    const incAvgNumsBet = avg(incompleteStats.map(s => s.avgNumsBet));
    const winAvgNumsBet = avg(winStats.map(s => s.avgNumsBet));
    const incAvgMaxConsecLoss = avg(incompleteStats.map(s => s.maxConsecLoss));
    const winAvgMaxConsecLoss = avg(winStats.map(s => s.maxConsecLoss));
    const incAvgTotalSteps = avg(incompleteStats.map(s => s.totalSteps));
    const winAvgTotalSteps = avg(winStats.map(s => s.totalSteps));

    const fmt = (label, incVal, winVal, suffix = '') => {
        const incStr = typeof incVal === 'number' ? incVal.toFixed(2) : incVal;
        const winStr = typeof winVal === 'number' ? winVal.toFixed(2) : winVal;
        console.log(`  ${label.padEnd(30)} ${String(incStr + suffix).padStart(12)}   ${String(winStr + suffix).padStart(12)}`);
    };

    console.log(`  ${'Metric'.padEnd(30)} ${'INCOMPLETE'.padStart(12)}   ${'WIN'.padStart(12)}`);
    console.log('  ' + '-'.repeat(58));
    fmt('Count', incompleteSessions.length, winSessions.length);
    fmt('Avg Hit Rate', (incAvgHitRate * 100), (winAvgHitRate * 100), '%');
    fmt('Avg BETs/session', incAvgBets, winAvgBets);
    fmt('Avg SKIPs/session', incAvgSkips, winAvgSkips);
    fmt('Avg Resets/session', incAvgResets, winAvgResets);
    fmt('Avg Total Steps', incAvgTotalSteps, winAvgTotalSteps);
    fmt('Avg Nums Bet/decision', incAvgNumsBet, winAvgNumsBet);
    fmt('Avg Max Consec. Losses', incAvgMaxConsecLoss, winAvgMaxConsecLoss);
    fmt('Avg Max Drawdown', incAvgDrawdown, winAvgDrawdown, '');
    fmt('Avg Final Profit', incAvgProfit, 100, '');

    // ════════════════════════════════════════════════════════════
    //  PAIR FREQUENCY ANALYSIS
    // ════════════════════════════════════════════════════════════
    console.log('\n================================================================');
    console.log('  PAIR FREQUENCY: INCOMPLETE vs WIN');
    console.log('================================================================\n');

    // Aggregate pair counts across all incomplete sessions
    const incPairTotals = {};
    incompleteStats.forEach(s => {
        for (const [pair, count] of Object.entries(s.pairCounts)) {
            incPairTotals[pair] = (incPairTotals[pair] || 0) + count;
        }
    });
    const incTotalBets = incompleteStats.reduce((s, st) => s + st.bets, 0);

    // Aggregate pair counts across all WIN sessions
    const winPairTotals = {};
    winStats.forEach(s => {
        for (const [pair, count] of Object.entries(s.pairCounts)) {
            winPairTotals[pair] = (winPairTotals[pair] || 0) + count;
        }
    });
    const winTotalBets = winStats.reduce((s, st) => s + st.bets, 0);

    // Merge all pairs
    const allPairs = new Set([...Object.keys(incPairTotals), ...Object.keys(winPairTotals)]);
    const pairRows = [];
    for (const pair of allPairs) {
        const incCount = incPairTotals[pair] || 0;
        const winCount = winPairTotals[pair] || 0;
        const incPct = incTotalBets > 0 ? (incCount / incTotalBets * 100) : 0;
        const winPct = winTotalBets > 0 ? (winCount / winTotalBets * 100) : 0;
        pairRows.push({ pair, incCount, incPct, winCount, winPct });
    }
    pairRows.sort((a, b) => b.incCount - a.incCount);

    console.log(
        '  ' + 'Pair'.padEnd(16) +
        'Inc#'.padStart(7) +
        'Inc%'.padStart(8) +
        'Win#'.padStart(9) +
        'Win%'.padStart(8)
    );
    console.log('  ' + '-'.repeat(48));
    pairRows.forEach(r => {
        console.log(
            '  ' + r.pair.padEnd(16) +
            String(r.incCount).padStart(7) +
            (r.incPct.toFixed(1) + '%').padStart(8) +
            String(r.winCount).padStart(9) +
            (r.winPct.toFixed(1) + '%').padStart(8)
        );
    });

    // ════════════════════════════════════════════════════════════
    //  FILTER/SET FREQUENCY ANALYSIS
    // ════════════════════════════════════════════════════════════
    console.log('\n================================================================');
    console.log('  FILTER/SET FREQUENCY: INCOMPLETE vs WIN');
    console.log('================================================================\n');

    // Aggregate filter counts across all incomplete sessions
    const incFilterTotals = {};
    incompleteStats.forEach(s => {
        for (const [filter, count] of Object.entries(s.filterCounts)) {
            incFilterTotals[filter] = (incFilterTotals[filter] || 0) + count;
        }
    });

    // Aggregate filter counts across all WIN sessions
    const winFilterTotals = {};
    winStats.forEach(s => {
        for (const [filter, count] of Object.entries(s.filterCounts)) {
            winFilterTotals[filter] = (winFilterTotals[filter] || 0) + count;
        }
    });

    const allFilters = new Set([...Object.keys(incFilterTotals), ...Object.keys(winFilterTotals)]);
    const filterRows = [];
    for (const filter of allFilters) {
        const incCount = incFilterTotals[filter] || 0;
        const winCount = winFilterTotals[filter] || 0;
        const incPct = incTotalBets > 0 ? (incCount / incTotalBets * 100) : 0;
        const winPct = winTotalBets > 0 ? (winCount / winTotalBets * 100) : 0;
        filterRows.push({ filter, incCount, incPct, winCount, winPct });
    }
    filterRows.sort((a, b) => b.incCount - a.incCount);

    console.log(
        '  ' + 'Filter'.padEnd(28) +
        'Inc#'.padStart(7) +
        'Inc%'.padStart(8) +
        'Win#'.padStart(9) +
        'Win%'.padStart(8)
    );
    console.log('  ' + '-'.repeat(60));
    filterRows.forEach(r => {
        console.log(
            '  ' + r.filter.padEnd(28) +
            String(r.incCount).padStart(7) +
            (r.incPct.toFixed(1) + '%').padStart(8) +
            String(r.winCount).padStart(9) +
            (r.winPct.toFixed(1) + '%').padStart(8)
        );
    });

    // ════════════════════════════════════════════════════════════
    //  HIT RATE DISTRIBUTION
    // ════════════════════════════════════════════════════════════
    console.log('\n================================================================');
    console.log('  HIT RATE DISTRIBUTION: INCOMPLETE SESSIONS');
    console.log('================================================================\n');

    const hitRateBuckets = [
        { label: '  0-10%', min: 0, max: 0.10 },
        { label: ' 10-20%', min: 0.10, max: 0.20 },
        { label: ' 20-25%', min: 0.20, max: 0.25 },
        { label: ' 25-30%', min: 0.25, max: 0.30 },
        { label: ' 30-35%', min: 0.30, max: 0.35 },
        { label: ' 35-40%', min: 0.35, max: 0.40 },
        { label: ' 40-50%', min: 0.40, max: 0.50 },
        { label: '   50%+', min: 0.50, max: 1.01 },
    ];

    hitRateBuckets.forEach(b => {
        const count = incompleteStats.filter(s => s.hitRate >= b.min && s.hitRate < b.max).length;
        const bar = '#'.repeat(Math.round(count / Math.max(1, incompleteStats.length) * 50));
        console.log(`  ${b.label}: ${String(count).padStart(4)}  ${bar}`);
    });

    // ════════════════════════════════════════════════════════════
    //  FINAL PROFIT DISTRIBUTION FOR INCOMPLETE
    // ════════════════════════════════════════════════════════════
    console.log('\n================================================================');
    console.log('  FINAL PROFIT DISTRIBUTION: INCOMPLETE SESSIONS');
    console.log('================================================================\n');

    const profitBuckets = [
        { label: '< -$500', min: -Infinity, max: -500 },
        { label: '-$500 to -$200', min: -500, max: -200 },
        { label: '-$200 to -$100', min: -200, max: -100 },
        { label: '-$100 to $0', min: -100, max: 0 },
        { label: ' $0 to $50', min: 0, max: 50 },
        { label: ' $50 to $90', min: 50, max: 90 },
        { label: ' $90 to $100', min: 90, max: 100 },
    ];

    profitBuckets.forEach(b => {
        const count = incompleteStats.filter(s => s.finalProfit >= b.min && s.finalProfit < b.max).length;
        const bar = '#'.repeat(Math.round(count / Math.max(1, incompleteStats.length) * 50));
        console.log(`  ${b.label.padEnd(18)}: ${String(count).padStart(4)}  ${bar}`);
    });

    const nearWins = incompleteStats.filter(s => s.finalProfit >= 50);
    const deepLoss = incompleteStats.filter(s => s.finalProfit < -200);
    console.log(`\n  Near wins (>=$50 profit):  ${nearWins.length} (${(nearWins.length / incompleteStats.length * 100).toFixed(1)}%)`);
    console.log(`  Deep losses (<-$200):     ${deepLoss.length} (${(deepLoss.length / incompleteStats.length * 100).toFixed(1)}%)`);

    // ════════════════════════════════════════════════════════════
    //  SUMMARY
    // ════════════════════════════════════════════════════════════
    console.log('\n================================================================');
    console.log('  SUMMARY');
    console.log('================================================================\n');

    console.log(`Incomplete sessions: ${incompleteSessions.length} out of ${sessions.length} total (${(incompleteSessions.length / sessions.length * 100).toFixed(1)}%)`);
    console.log(`Avg hit rate (INCOMPLETE): ${(incAvgHitRate * 100).toFixed(2)}%`);
    console.log(`Avg hit rate (WIN):        ${(winAvgHitRate * 100).toFixed(2)}%`);
    console.log(`Hit rate gap:              ${((winAvgHitRate - incAvgHitRate) * 100).toFixed(2)} percentage points`);
    console.log();
    console.log(`Avg BETs  (INCOMPLETE): ${incAvgBets.toFixed(1)}   vs   WIN: ${winAvgBets.toFixed(1)}`);
    console.log(`Avg SKIPs (INCOMPLETE): ${incAvgSkips.toFixed(1)}   vs   WIN: ${winAvgSkips.toFixed(1)}`);
    console.log(`Avg resets(INCOMPLETE): ${incAvgResets.toFixed(1)}   vs   WIN: ${winAvgResets.toFixed(1)}`);
    console.log();
    console.log(`Avg final profit of INCOMPLETE: $${incAvgProfit.toFixed(2)}`);
    console.log(`Avg max drawdown (INCOMPLETE):  $${incAvgDrawdown.toFixed(2)}`);
    console.log(`Avg max drawdown (WIN):         $${winAvgDrawdown.toFixed(2)}`);
    console.log();

    // Top 3 most common pairs in incomplete
    const topIncPairs = pairRows.slice(0, 3);
    console.log('Most common pairs in INCOMPLETE sessions:');
    topIncPairs.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.pair} — ${r.incCount} times (${r.incPct.toFixed(1)}%)`);
    });

    // Top 3 most common filters in incomplete
    const topIncFilters = filterRows.slice(0, 3);
    console.log('\nMost common filters in INCOMPLETE sessions:');
    topIncFilters.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.filter} — ${r.incCount} times (${r.incPct.toFixed(1)}%)`);
    });

    console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
