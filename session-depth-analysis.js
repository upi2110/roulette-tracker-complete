/**
 * Session Depth Analysis — shows exact spin-by-spin breakdown
 * Trains on data1-data16.txt, tests on data17.txt (today's real casino data)
 */
const fs = require('fs');
const path = require('path');

// Load renderer functions into global scope (same as Electron window)
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
console.log(`Trained on ${trainFiles.length} files (${trainFiles.reduce((s,a) => s + a.length, 0)} spins)`);

// Create runner AFTER training
const runner = new AutoTestRunner(engine);

// ── Test on data17.txt (today's real casino data) ──
const testRaw = fs.readFileSync(path.join(dataDir, 'data17.txt'), 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'data17.txt').spins;
console.log(`Test data: ${testSpins.length} spins (data17.txt — today's casino data)\n`);

async function main() {
    // ── Run sessions (Strategy 1 = Aggressive, our default) ──
    const config = { maxBet: 10, lossStreakReset: 5, maxResets: 5 };
    console.log('Running sessions... (this may take a moment)');
    const results = await runner.runAll(testSpins, config);

    // Use Strategy 1 sessions (Aggressive - what auto mode uses)
    const sessions = results.strategies[1].sessions;
    const summary = results.strategies[1].summary;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SESSION-BY-SESSION BREAKDOWN (Strategy 1 — Aggressive)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const sessionDetails = [];

    sessions.forEach((s, i) => {
        const watchSteps = s.steps.filter(st => st.action === 'WATCH').length;
        const skipSteps = s.steps.filter(st => st.action === 'SKIP').length;
        const betSteps = s.steps.filter(st => st.action === 'BET').length;
        const reanalyzeSteps = s.steps.filter(st => st.action === 'REANALYZE').length;
        const totalUserSpins = s.steps.length; // Everything the user sits through
        const reportedSpins = s.totalSpins; // BET + SKIP only

        sessionDetails.push({
            session: i + 1,
            outcome: s.outcome,
            totalUserSpins,
            reportedSpins,
            watchSteps,
            skipSteps,
            betSteps,
            reanalyzeSteps,
            profit: s.finalProfit
        });
    });

    // Show first 30 + any >70 spin sessions
    console.log('First 30 sessions:');
    sessionDetails.slice(0, 30).forEach(d => {
        const marker = d.totalUserSpins > 70 ? ' ⚠️ >70' : '';
        console.log(`  S${String(d.session).padStart(3)}: ${d.outcome.padEnd(10)} | Total: ${String(d.totalUserSpins).padStart(4)} spins | WATCH:${String(d.watchSteps).padStart(2)} SKIP:${String(d.skipSteps).padStart(3)} BET:${String(d.betSteps).padStart(3)} | $${d.profit}${marker}`);
    });

    const longSessions = sessionDetails.filter(d => d.totalUserSpins > 70);
    if (longSessions.length > 0) {
        console.log(`\n⚠️  Sessions >70 total spins: ${longSessions.length} out of ${sessionDetails.length}`);
        longSessions.slice(0, 20).forEach(d => {
            console.log(`  S${String(d.session).padStart(3)}: ${d.outcome.padEnd(10)} | Total: ${String(d.totalUserSpins).padStart(4)} spins | SKIP:${String(d.skipSteps).padStart(3)} BET:${String(d.betSteps).padStart(3)} | $${d.profit}`);
        });
    }

    // ── Distribution Analysis ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  DISTRIBUTION OF TOTAL USER SPINS (what you actually sit through)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const userSpins = sessionDetails.map(s => s.totalUserSpins);
    userSpins.sort((a, b) => a - b);

    const percentile = (arr, p) => arr[Math.floor(arr.length * p / 100)];

    console.log(`Sessions:     ${userSpins.length}`);
    console.log(`Min:          ${userSpins[0]} spins`);
    console.log(`P25:          ${percentile(userSpins, 25)} spins`);
    console.log(`P50 (median): ${percentile(userSpins, 50)} spins`);
    console.log(`P75:          ${percentile(userSpins, 75)} spins`);
    console.log(`P90:          ${percentile(userSpins, 90)} spins`);
    console.log(`P95:          ${percentile(userSpins, 95)} spins`);
    console.log(`P99:          ${percentile(userSpins, 99)} spins`);
    console.log(`Max:          ${userSpins[userSpins.length - 1]} spins`);
    console.log(`Average:      ${(userSpins.reduce((a,b) => a+b, 0) / userSpins.length).toFixed(1)} spins`);

    // ── How many sessions exceed key thresholds ──
    const thresholds = [20, 30, 40, 50, 60, 70, 80, 100, 150];
    console.log('\n--- Sessions exceeding thresholds ---');
    thresholds.forEach(t => {
        const count = userSpins.filter(s => s > t).length;
        const pct = (count / userSpins.length * 100).toFixed(1);
        console.log(`> ${String(t).padStart(3)} spins: ${String(count).padStart(4)} sessions (${pct}%)`);
    });

    // ── Histogram ──
    console.log('\n--- Histogram (total user spins per session) ---');
    const buckets = [
        { label: '  1-10', min: 1, max: 10 },
        { label: ' 11-20', min: 11, max: 20 },
        { label: ' 21-30', min: 21, max: 30 },
        { label: ' 31-40', min: 31, max: 40 },
        { label: ' 41-50', min: 41, max: 50 },
        { label: ' 51-70', min: 51, max: 70 },
        { label: ' 71-100', min: 71, max: 100 },
        { label: '101-150', min: 101, max: 150 },
        { label: '  151+', min: 151, max: 9999 },
    ];
    const maxCount = Math.max(...buckets.map(b => userSpins.filter(s => s >= b.min && s <= b.max).length));
    const maxBar = 50;

    buckets.forEach(b => {
        const count = userSpins.filter(s => s >= b.min && s <= b.max).length;
        const bar = '█'.repeat(Math.round(count / maxCount * maxBar));
        console.log(`${b.label}: ${String(count).padStart(4)} ${bar}`);
    });

    // ── SKIP analysis ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  SKIP RATE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    const totalSkips = sessionDetails.reduce((s, d) => s + d.skipSteps, 0);
    const totalBets = sessionDetails.reduce((s, d) => s + d.betSteps, 0);
    const totalDecisions = totalSkips + totalBets;
    console.log(`Total BETs:        ${totalBets}`);
    console.log(`Total SKIPs:       ${totalSkips}`);
    console.log(`SKIP Rate:         ${(totalSkips / totalDecisions * 100).toFixed(1)}%`);
    console.log(`Decisions/Session: ${(totalDecisions / sessionDetails.length).toFixed(1)}`);

    // ── Summary ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  OVERALL RESULTS (data17.txt — today\'s real casino data)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const wins = sessionDetails.filter(s => s.outcome === 'WIN');
    const busts = sessionDetails.filter(s => s.outcome === 'BUST');
    const incomplete = sessionDetails.filter(s => s.outcome === 'INCOMPLETE');
    const decided = wins.length + busts.length;
    console.log(`Sessions:        ${sessionDetails.length}`);
    console.log(`Wins:            ${wins.length}`);
    console.log(`Busts:           ${busts.length}`);
    console.log(`Incomplete:      ${incomplete.length}`);
    console.log(`Win Rate:        ${decided > 0 ? (wins.length / decided * 100).toFixed(1) : 'N/A'}%`);
    console.log(`Total Profit:    $${sessionDetails.filter(s => s.outcome !== 'INCOMPLETE').reduce((s, d) => s + d.profit, 0)}`);
    console.log(`\nReport "Avg Spins to Win": ${summary.avgSpinsToWin} (BET+SKIP only, hides WATCH phase)`);
    console.log(`Real Avg Total Spins:     ${(userSpins.reduce((a,b) => a+b, 0) / userSpins.length).toFixed(1)} (what user actually experiences)`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  KEY TAKEAWAY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Even on THIS test data (real casino, same as your play):`);
    console.log(`  - ${longSessions.length} out of ${sessionDetails.length} sessions (${(longSessions.length/sessionDetails.length*100).toFixed(1)}%) take >70 spins`);
    console.log(`  - P95 = ${percentile(userSpins, 95)} spins — 5% of sessions will go this long`);
    console.log(`  - The code is identical, variance is inherent to roulette`);
}

main().catch(e => { console.error(e); process.exit(1); });
