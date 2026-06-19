/**
 * strategies/strategy-analyser/partitions.js
 *
 * Wheel partition constants used by the signal extractors.
 *
 * Source citation (verified against the existing codebase):
 *   POSITIVE_NUMS / NEGATIVE_NUMS  — app/roulette-wheel.js:23-24
 *   ZERO_TABLE     / NINETEEN_TABLE — ui/ai-prediction-panel/ai-prediction-panel.js:3270-3271
 *   SET_0 / SET_5 / SET_6           — tests/app/43-set-filters.test.js:16-18
 *                                     tests/app/45-ui-sync-integration.test.js:61-63
 *
 * Living in strategy-analyser/ (not the locked core/tables/) because
 * partitions are a strategy-layer concern, not table math. If they
 * ever drift from the source, the parity test in
 * tests/strategy-analyser/00-partitions-parity.test.js will fail
 * loudly.
 *
 * Total per partition family must equal 37 (the full European wheel).
 */

// IIFE — keeps the const declarations function-scoped so they cannot
// collide with the SAME-NAMED constants in app/roulette-wheel.js (which
// declares POSITIVE_NUMS / NEGATIVE_NUMS at the global script scope).
// Without this wrapper the browser threw
// "SyntaxError: Identifier 'POSITIVE_NUMS' has already been declared"
// and the entire signals pipeline failed silently.
(function () {
'use strict';

// ── Sign: positive / negative ─────────────────────────────────────
//   19 + 18 = 37
const POSITIVE_NUMS = new Set([
    3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22
]);
const NEGATIVE_NUMS = new Set([
    21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35
]);

// ── Table: zero / nineteen ────────────────────────────────────────
//   19 + 18 = 37
const ZERO_TABLE = new Set([
    3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7
]);
const NINETEEN_TABLE = new Set([
    15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35
]);

// ── Sets: 0 (neutral), 5, 6 ───────────────────────────────────────
//   13 + 12 + 12 = 37
const SET_0 = new Set([0, 26, 19, 2, 34, 13, 30, 10, 16, 20, 9, 29, 12]);
const SET_5 = new Set([32, 15, 25, 17, 36, 11, 5, 24, 14, 31, 7, 28]);
const SET_6 = new Set([4, 21, 6, 27, 8, 23, 33, 1, 22, 18, 35, 3]);

// ── Classifiers ───────────────────────────────────────────────────
function signOf(num) {
    if (POSITIVE_NUMS.has(num)) return 'POS';
    if (NEGATIVE_NUMS.has(num)) return 'NEG';
    return null;
}
function tableOf(num) {
    if (ZERO_TABLE.has(num))     return 'ZERO';
    if (NINETEEN_TABLE.has(num)) return 'NINETEEN';
    return null;
}
function setOf(num) {
    if (SET_0.has(num)) return 'SET_0';
    if (SET_5.has(num)) return 'SET_5';
    if (SET_6.has(num)) return 'SET_6';
    return null;
}

// ── Decay curve (anti-streak credibility loss) ────────────────────
/**
 * Streak-length → confidence-in-same-direction.
 *
 *   length 2  → 1.0   (early streak — bet same)
 *   length 3  → 0.75
 *   length 4  → 0.50  (50/50 — same or opposite)
 *   length 5  → 0.25  (mostly opposite — anti-streak grows)
 *   length 6+ → 0.0   (full anti-streak)
 *
 * Caller multiplies the signal's base weight by this for the SAME
 * direction and by (1 - this) for the OPPOSITE direction.
 *
 * Matches the user's rule: "after several pattern hits there's a
 * huge chance of getting the opposite — credibility reduces".
 */
function streakDecay(length) {
    if (length < 2) return 1.0;
    return Math.max(0, 1 - (length - 2) / 4);
}

const api = {
    POSITIVE_NUMS, NEGATIVE_NUMS,
    ZERO_TABLE, NINETEEN_TABLE,
    SET_0, SET_5, SET_6,
    signOf, tableOf, setOf,
    streakDecay
};

// Dual-mode export — Node CommonJS + browser window global.
// (Order matters: in browser, `module` is undefined; guard prevents
// ReferenceError so the window assignment below still runs.)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.StrategyAnalyserPartitions = api;
}

})();
