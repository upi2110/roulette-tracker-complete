#!/usr/bin/env node
/**
 * SPOT-CHECK — Verify individual session P&L math from auto-test-runner output
 * Validates bankroll tracking, P&L calculations, bet cap, and reset logic
 */

const fs = require('fs');
const path = require('path');

// Bootstrap JSDOM
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;

const lookupSrc = fs.readFileSync(path.join(__dirname, 'app', 'table-lookup.js'), 'utf-8');
eval(lookupSrc);
if (typeof getLookupRow === 'function') globalThis.getLookupRow = getLookupRow;
if (typeof LOOKUP_TABLE === 'object') globalThis.LOOKUP_TABLE = LOOKUP_TABLE;

const { setupDOM } = require('./tests/test-setup');
setupDOM();

const rendererSrc = fs.readFileSync(path.join(__dirname, 'app', 'renderer-3tables.js'), 'utf-8');
const rendererWrapper = new Function('window', 'document', 'alert', 'confirm', 'fetch', 'getLookupRow', 'LOOKUP_TABLE', `
    ${rendererSrc}
    window.calculateReferences = calculateReferences;
    window.calculatePositionCode = calculatePositionCode;
    window.DIGIT_13_OPPOSITES = DIGIT_13_OPPOSITES;
    window.REGULAR_OPPOSITES = REGULAR_OPPOSITES;
    window.generateAnchors = generateAnchors;
    window.expandAnchorsToBetNumbers = expandAnchorsToBetNumbers;
    window.expandTargetsToBetNumbers = typeof expandTargetsToBetNumbers !== 'undefined' ? expandTargetsToBetNumbers : undefined;
    window.calculateWheelAnchors = typeof calculateWheelAnchors !== 'undefined' ? calculateWheelAnchors : undefined;
    window.WHEEL_STANDARD = WHEEL_STANDARD;
    window.WHEEL_NO_ZERO = WHEEL_NO_ZERO;
    window.getNumberAtPosition = getNumberAtPosition;
    window.flipPositionCode = flipPositionCode;
    window.calculateWheelDistance = calculateWheelDistance;
    window._getPosCodeDistance = _getPosCodeDistance;
    window._computeT2FlashTargets = typeof _computeT2FlashTargets !== 'undefined' ? _computeT2FlashTargets : undefined;
    window._computeT1FlashTargets = typeof _computeT1FlashTargets !== 'undefined' ? _computeT1FlashTargets : undefined;
    window._computeAnchorFlashTargets = typeof _computeAnchorFlashTargets !== 'undefined' ? _computeAnchorFlashTargets : undefined;
    window._PAIR_REFKEY_TO_DATA_PAIR = typeof _PAIR_REFKEY_TO_DATA_PAIR !== 'undefined' ? _PAIR_REFKEY_TO_DATA_PAIR : undefined;
    window.getLookupRow = getLookupRow;
`);
rendererWrapper(global.window, global.document, () => {}, () => true, () => Promise.resolve({ json: () => ({}) }), getLookupRow, typeof LOOKUP_TABLE !== 'undefined' ? LOOKUP_TABLE : {});

const origLog = console.log;
let suppress = false;
console.log = (...args) => { if (!suppress) origLog(...args); };

const { AIAutoEngine } = require('./app/ai-auto-engine');
const { AutoTestRunner } = require('./app/auto-test-runner');
const { AIDataLoader } = require('./app/ai-data-loader');

// Load training data
const dataDir = path.join(__dirname, 'app', 'data');
const dataFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.txt')).sort();
const dataLoader = new AIDataLoader();
const trainingFiles = dataFiles.map(f => ({
    filename: f,
    content: fs.readFileSync(path.join(dataDir, f), 'utf-8')
}));
const loadResult = dataLoader.loadMultiple(trainingFiles);
const trainingSessions = loadResult.sessions.map(s => s.spins);

// Load test data
const testRaw = fs.readFileSync('/Users/ubusan-nb-ecr/Desktop/test_data2.txt', 'utf-8');
const testSpins = dataLoader.parseTextContent(testRaw, 'test_data2.txt').spins;

async function spotCheck() {
    const engine = new AIAutoEngine();
    suppress = true;
    engine.train(trainingSessions);
    suppress = false;

    const runner = new AutoTestRunner(engine);
    engine._retrainInterval = Infinity;
    engine._retrainLossStreak = Infinity;

    suppress = true;
    const result = await runner.runAll(testSpins, { testFile: 'spot-check' });
    suppress = false;

    let allPassed = true;
    let totalChecked = 0;
    let totalPnlErrors = 0;
    let totalBankrollErrors = 0;
    let totalCapViolations = 0;
    let totalResetViolations = 0;

    for (const sn of [1, 2, 3]) {
        const sessions = result.strategies[sn].sessions;
        origLog(`\n═══ Strategy ${sn} — ${sessions.length} sessions ═══`);

        for (const sess of sessions) {
            const steps = sess.steps || [];
            totalChecked++;
            let sessErrors = [];

            // 1. Verify bankroll chain: each BET step's bankroll = prev bankroll + pnl
            let prevBankroll = 4000;
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];

                if (step.action === 'BET') {
                    const expectedBankroll = prevBankroll + step.pnl;
                    if (Math.abs(step.bankroll - expectedBankroll) > 0.01) {
                        sessErrors.push(`Step ${i}: Bankroll chain break — prev=$${prevBankroll} + pnl=$${step.pnl} = $${expectedBankroll}, got $${step.bankroll}`);
                        totalBankrollErrors++;
                    }
                }

                // Track bankroll for chain verification (only BET changes bankroll)
                if (step.action === 'BET') {
                    prevBankroll = step.bankroll;
                }

                // 2. Verify P&L math for BET steps
                if (step.action === 'BET') {
                    const numCount = step.predictedNumbers ? step.predictedNumbers.length : step.numbersCount;
                    if (step.hit) {
                        // Find the actual bet used: reverse-engineer from pnl
                        // pnl = betUsed * (36 - numCount)
                        const betUsed = step.pnl / (36 - numCount);
                        // betUsed should be a whole dollar amount (or close to it)
                        if (Math.abs(betUsed - Math.round(betUsed)) > 0.01) {
                            sessErrors.push(`Step ${i}: HIT P&L not divisible by (36-${numCount})=${36-numCount} — pnl=$${step.pnl}, implied bet=$${betUsed.toFixed(2)}`);
                            totalPnlErrors++;
                        }
                        // betUsed must be >= $2 and <= $10
                        if (betUsed > 10.01) {
                            sessErrors.push(`Step ${i}: HIT implied bet $${betUsed.toFixed(0)} > $10 cap`);
                            totalCapViolations++;
                        }
                    } else {
                        // Loss: pnl = -(betUsed * numCount)
                        if (numCount > 0) {
                            const betUsed = -step.pnl / numCount;
                            if (Math.abs(betUsed - Math.round(betUsed)) > 0.01) {
                                sessErrors.push(`Step ${i}: MISS P&L not divisible by ${numCount} — pnl=$${step.pnl}, implied bet=$${betUsed.toFixed(2)}`);
                                totalPnlErrors++;
                            }
                            if (betUsed > 10.01) {
                                sessErrors.push(`Step ${i}: MISS implied bet $${betUsed.toFixed(0)} > $10 cap`);
                                totalCapViolations++;
                            }
                        }
                    }
                }
            }

            // 3. Verify final profit = final bankroll - 4000
            const expectedProfit = sess.finalBankroll - 4000;
            if (Math.abs(sess.finalProfit - expectedProfit) > 0.01) {
                sessErrors.push(`FinalProfit mismatch: profit=$${sess.finalProfit}, bankroll=$${sess.finalBankroll}, expected profit=$${expectedProfit}`);
            }

            // 4. Verify reset count ≤ 5
            if ((sess.reanalyzeCount || 0) > 5) {
                sessErrors.push(`Reset count ${sess.reanalyzeCount} > max 5`);
                totalResetViolations++;
            }

            // 5. Verify outcome logic
            if (sess.outcome === 'WIN' && sess.finalProfit < 100) {
                sessErrors.push(`WIN but profit $${sess.finalProfit} < $100 target`);
            }
            if (sess.outcome === 'BUST' && sess.finalBankroll > 0) {
                sessErrors.push(`BUST but bankroll $${sess.finalBankroll} > 0`);
            }

            if (sessErrors.length > 0) {
                allPassed = false;
                origLog(`  ✗ S${sn}-Start${sess.startIdx} (${sess.outcome}): ${sessErrors.length} errors`);
                for (const e of sessErrors.slice(0, 3)) origLog(`    ${e}`);
                if (sessErrors.length > 3) origLog(`    ... and ${sessErrors.length - 3} more`);
            }
        }

        // Strategy summary
        const wins = sessions.filter(s => s.outcome === 'WIN');
        const inc = sessions.filter(s => s.outcome === 'INCOMPLETE');
        const busts = sessions.filter(s => s.outcome === 'BUST');
        const totalP = sessions.reduce((a, x) => a + x.finalProfit, 0);
        origLog(`  Summary: ${wins.length}W / ${busts.length}B / ${inc.length}I = $${totalP.toLocaleString()}`);

        // Sample detailed WIN session trace
        const sampleWin = wins.find(w => {
            const bets = w.steps.filter(s => s.action === 'BET');
            return bets.length >= 3 && bets.length <= 10;
        });
        if (sampleWin) {
            origLog(`\n  ── Detailed trace: S${sn}-Start${sampleWin.startIdx} (WIN, $${sampleWin.finalProfit}) ──`);
            for (const step of sampleWin.steps) {
                if (step.action === 'WATCH') {
                    origLog(`    WATCH  spin=${step.spinNumber}`);
                } else if (step.action === 'SKIP') {
                    origLog(`    SKIP   spin=${step.spinNumber} → next=${step.nextNumber} bank=$${step.bankroll}`);
                } else if (step.action === 'BET') {
                    const nums = step.predictedNumbers ? step.predictedNumbers.length : step.numbersCount;
                    const betUsed = step.hit ? step.pnl / (36 - nums) : (-step.pnl / nums);
                    origLog(`    BET    spin=${step.spinNumber} → next=${step.nextNumber} | $${betUsed.toFixed(0)}x${nums}nums ${step.hit ? 'HIT' : 'MISS'} pnl=$${step.pnl} bank=$${step.bankroll}`);
                } else if (step.action === 'REANALYZE') {
                    origLog(`    RESET  bet→$2, bank=$${step.bankroll}`);
                }
            }
        }

        // Show worst INCOMPLETE
        const worstInc = inc.sort((a, b) => a.finalProfit - b.finalProfit)[0];
        if (worstInc) {
            const betSteps = worstInc.steps.filter(s => s.action === 'BET');
            const maxBetUsed = Math.max(...betSteps.map(s => {
                const nums = s.predictedNumbers ? s.predictedNumbers.length : s.numbersCount;
                return s.hit ? s.pnl / (36 - nums) : (-s.pnl / nums);
            }));
            const hitRate = betSteps.filter(s => s.hit).length / betSteps.length;
            origLog(`\n  Worst INC: S${sn}-Start${worstInc.startIdx} profit=$${worstInc.finalProfit} bets=${betSteps.length} maxBet=$${maxBetUsed.toFixed(0)} hitRate=${(hitRate*100).toFixed(1)}% resets=${worstInc.reanalyzeCount || 0}`);
        }
    }

    // Grand totals cross-check
    origLog('\n═══════════════════════════════════════════════════════');
    origLog('  GRAND TOTAL CROSS-CHECK');
    origLog('═══════════════════════════════════════════════════════');
    const allSessions = [...result.strategies[1].sessions, ...result.strategies[2].sessions, ...result.strategies[3].sessions];
    const grandWins = allSessions.filter(s => s.outcome === 'WIN').length;
    const grandBusts = allSessions.filter(s => s.outcome === 'BUST').length;
    const grandInc = allSessions.filter(s => s.outcome === 'INCOMPLETE').length;
    const grandProfit = allSessions.reduce((a, x) => a + x.finalProfit, 0);

    const checks = [
        { name: 'Total sessions', actual: allSessions.length, expected: 1377 },
        { name: 'Total wins', actual: grandWins, expected: 1209 },
        { name: 'Total busts', actual: grandBusts, expected: 0 },
        { name: 'Total incomplete', actual: grandInc, expected: 168 },
        { name: 'Total profit', actual: grandProfit, expected: 33603 },
        { name: 'S1 wins', actual: result.strategies[1].summary.wins, expected: 411 },
        { name: 'S1 busts', actual: result.strategies[1].summary.busts, expected: 0 },
        { name: 'S1 incomplete', actual: result.strategies[1].summary.incomplete, expected: 48 },
        { name: 'S2 wins', actual: result.strategies[2].summary.wins, expected: 401 },
        { name: 'S2 busts', actual: result.strategies[2].summary.busts, expected: 0 },
        { name: 'S2 incomplete', actual: result.strategies[2].summary.incomplete, expected: 58 },
        { name: 'S3 wins', actual: result.strategies[3].summary.wins, expected: 397 },
        { name: 'S3 busts', actual: result.strategies[3].summary.busts, expected: 0 },
        { name: 'S3 incomplete', actual: result.strategies[3].summary.incomplete, expected: 62 },
    ];

    let verdictPass = true;
    for (const c of checks) {
        const pass = c.actual === c.expected;
        if (!pass) verdictPass = false;
        origLog(`  ${pass ? '✓' : '✗'} ${c.name}: ${c.actual} ${pass ? '' : `(expected ${c.expected})`}`);
    }

    origLog('\n═══════════════════════════════════════════════════════');
    origLog('  INTEGRITY CHECKS');
    origLog('═══════════════════════════════════════════════════════');
    origLog(`  P&L math errors:      ${totalPnlErrors} ${totalPnlErrors === 0 ? '✓' : '✗'}`);
    origLog(`  Bankroll chain errors: ${totalBankrollErrors} ${totalBankrollErrors === 0 ? '✓' : '✗'}`);
    origLog(`  Bet cap violations:    ${totalCapViolations} ${totalCapViolations === 0 ? '✓' : '✗'}`);
    origLog(`  Reset limit violations:${totalResetViolations} ${totalResetViolations === 0 ? '✓' : '✗'}`);
    origLog(`  Sessions checked:      ${totalChecked}`);

    // Win rate stats
    const allWins = allSessions.filter(s => s.outcome === 'WIN');
    const avgSpins = allWins.reduce((a, x) => a + x.totalSpins, 0) / allWins.length;
    const winsU30 = allWins.filter(x => x.totalSpins <= 30);
    const avgWinProfit = allWins.reduce((a, x) => a + x.finalProfit, 0) / allWins.length;
    origLog(`\n  Win rate (decided):    ${((grandWins/(grandWins+grandBusts))*100).toFixed(2)}%`);
    origLog(`  Avg spins to win:     ${avgSpins.toFixed(1)}`);
    origLog(`  Wins under 30 spins:  ${winsU30.length}/${allWins.length} (${(winsU30.length/allWins.length*100).toFixed(1)}%)`);
    origLog(`  Avg win profit:       $${avgWinProfit.toFixed(0)}`);

    if (verdictPass && totalPnlErrors === 0 && totalBankrollErrors === 0 && totalCapViolations === 0 && totalResetViolations === 0) {
        origLog('\n✅ ALL CHECKS PASSED — Report is mathematically verified');
        origLog('✅ 0 busts across all 1,377 sessions');
        origLog('✅ $10 bet cap enforced in every single bet');
        origLog('✅ R@5 reset logic working correctly');
        origLog('✅ Bankroll chain integrity verified for all sessions');
    } else {
        origLog('\n❌ SOME CHECKS FAILED — See errors above');
        allPassed = false;
    }
}

spotCheck().catch(e => origLog('Error: ' + e.message + '\n' + e.stack));
