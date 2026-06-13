/**
 * Auto-Enhance Strategy — auto-pair + min-8 topup helper.
 *
 * Lives in the Auto tab as a sub-mode. Same cascade rules as
 * Manual-Enhance but with the user's T3 pair click replaced by a
 * deterministic auto-pick, plus a min-8 bet-pool guarantee.
 *
 * Phases
 * ------
 *   pickAutoPair  — scan visible pair families; return the camelCase
 *                   pair whose BOTH T2 columns (pair and pair-13opp)
 *                   are gold AND whose last 3 gold cells in each column
 *                   collectively use only 2 of the 3 anchor positions
 *                   (1st / 2nd / 3rd). First match wins.
 *   getAutoSelections — same shape as ManualEnhanceStrategy; delegated
 *                   to ManualEnhanceStrategy when available so the
 *                   cascade rules stay in lockstep.
 *   topUpToEight  — extend a bet pool to >= 8 numbers using greys then
 *                   wheel-neighbours, respecting the +/- and 0/19
 *                   stickiness derived from the last 2 actuals.
 *
 * Pure / dependency-free aside from the optional engine helpers.
 */
(function () {
    'use strict';

    // Wheel constant (mirror renderer-3tables.js).
    const WHEEL_36 = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11,
        30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3];
    const RING = WHEEL_36.length;

    const POSITIVE_NUMS = new Set([3, 26, 0, 32, 15, 19, 4, 27, 13, 36, 11, 30, 8, 1, 20, 14, 31, 9, 22]);
    const NEGATIVE_NUMS = new Set([21, 2, 25, 17, 34, 6, 23, 10, 5, 24, 16, 33, 18, 29, 7, 28, 12, 35]);
    const ZERO_TABLE_NUMS     = new Set([3, 26, 0, 32, 21, 2, 25, 27, 13, 36, 23, 10, 5, 1, 20, 14, 18, 29, 7]);
    const NINETEEN_TABLE_NUMS = new Set([15, 19, 4, 17, 34, 6, 11, 30, 8, 24, 16, 33, 31, 9, 22, 28, 12, 35]);

    const posOf = (n) => (n === 26 ? 0 : WHEEL_36.indexOf(n));
    const numAt = (idx) => WHEEL_36[((idx % RING) + RING) % RING];
    const ringDist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, RING - d); };

    // ─────────────────────────────────────────────────────────────
    //  Auto pair-pick (the "T1 selection" step in the user's spec)
    // ─────────────────────────────────────────────────────────────

    /**
     * Scan visible pair families and return the first one whose T2
     * pair AND pair-13opp columns are both gold AND whose last 3
     * gold cells per column collectively use only 2 of the 3 anchor
     * positions.
     *
     * @param {object} opts
     * @param {object} opts.engine               window.aiAutoEngine
     * @param {Set<string>} opts.visibleFamilies camelCase pair names visible to the user (Pairs X/12 toggle)
     * @param {object[]} opts.spinObjects        full window.spins (objects with .actual)
     * @returns {string|null}                    camelCase pair name (e.g. 'prev') or null if no pair qualifies
     */
    function pickAutoPair(opts) {
        const engine = opts && opts.engine;
        const spinObjects = (opts && opts.spinObjects) || [];
        const visible = (opts && opts.visibleFamilies) || null;
        if (!engine || !Array.isArray(spinObjects) || spinObjects.length < 4) return null;
        if (typeof engine._getComputeT2FlashTargets !== 'function') return null;

        const visible36 = Math.min(spinObjects.length, 12);
        const startIdx = Math.max(0, spinObjects.length - visible36);
        let t2FlashSet;
        try {
            t2FlashSet = engine._getComputeT2FlashTargets(spinObjects, startIdx, visible36);
        } catch (_) { return null; }
        if (!t2FlashSet || !t2FlashSet.size) return null;

        // Bucket flash entries by pair → ordered list of (relIdx, anchorIdx)
        // entries. Key format: `${relIdx}:${dataPair}:${anchorIdx}`. anchorIdx
        // is 0/1/2 (= 1st/2nd/3rd anchor column).
        const bucketByPair = {}; // dataPair → [{ relIdx, anchorIdx }, ...]
        for (const key of t2FlashSet) {
            const parts = key.split(':');
            if (parts.length !== 3) continue;
            const relIdx = parseInt(parts[0], 10);
            const dataPair = parts[1];
            const anchorIdx = parseInt(parts[2], 10);
            if (Number.isNaN(relIdx) || Number.isNaN(anchorIdx)) continue;
            (bucketByPair[dataPair] = bucketByPair[dataPair] || []).push({ relIdx, anchorIdx });
        }

        // Sort each pair's entries by relIdx DESC (most recent row first).
        Object.values(bucketByPair).forEach(list => {
            list.sort((a, b) => b.relIdx - a.relIdx);
        });

        // Walk through visible camelCase pair families. For each, check
        // BOTH columns. First family that passes wins.
        const families = visible ? Array.from(visible)
            : Object.keys(bucketByPair).map(_familyOf).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);

        for (const fam of families) {
            const refList = bucketByPair[fam] || [];
            const oppList = bucketByPair[fam + '_13opp'] || [];
            if (!refList.length || !oppList.length) continue;          // both columns must be gold
            if (!_last3UseTwoAnchors(refList)) continue;
            if (!_last3UseTwoAnchors(oppList)) continue;
            return fam;
        }
        return null;
    }

    /**
     * Take the most recent 3 gold cells from `list` (already sorted
     * by relIdx DESC) and return true iff the set of anchorIdx values
     * across those 3 cells has size <= 2.
     *
     * Walks unique relIdx values in case there are multiple gold cells
     * per row — the rule is "last 3 rows", not "last 3 cells". A row
     * with 2 gold cells contributes both anchor indexes to the
     * uniqueness count.
     */
    function _last3UseTwoAnchors(list) {
        if (!list || !list.length) return false;
        const last3Rows = [];
        let seenRels = new Set();
        for (const entry of list) {
            if (!seenRels.has(entry.relIdx)) {
                seenRels.add(entry.relIdx);
                last3Rows.push(entry.relIdx);
                if (last3Rows.length >= 3) break;
            }
        }
        if (last3Rows.length < 3) return false; // need 3 rows of gold
        const allowed = new Set(last3Rows);
        const anchorIdxs = new Set();
        for (const entry of list) {
            if (allowed.has(entry.relIdx)) anchorIdxs.add(entry.anchorIdx);
        }
        return anchorIdxs.size <= 2;
    }

    function _familyOf(dataPair) {
        return (typeof dataPair === 'string' && dataPair.endsWith('_13opp'))
            ? dataPair.slice(0, -6) : dataPair;
    }

    // ─────────────────────────────────────────────────────────────
    //  Cascade (delegates to ManualEnhanceStrategy when available)
    // ─────────────────────────────────────────────────────────────

    /**
     * Same shape as ManualEnhanceStrategy.getAutoSelections. Kept here
     * as a thin wrapper so callers don't need to know which module to
     * call — Auto-Enhance and Manual-Enhance use identical cascade rules.
     */
    function getAutoSelections(opts) {
        if (typeof window !== 'undefined'
                && window.ManualEnhanceStrategy
                && typeof window.ManualEnhanceStrategy.getAutoSelections === 'function') {
            return window.ManualEnhanceStrategy.getAutoSelections(opts);
        }
        // Defensive fallback (manual-enhance not loaded yet).
        return { t1: [], t2: opts && opts.t2On ? [opts.t3Pair, opts.t3Pair + '_13opp'] : [] };
    }

    // ─────────────────────────────────────────────────────────────
    //  Min-8 topup
    // ─────────────────────────────────────────────────────────────

    /**
     * Determine the topup filter from the last 2 actuals.
     *
     * Returns one of:
     *   { kind: 'sign',  set: POSITIVE_NUMS }
     *   { kind: 'sign',  set: NEGATIVE_NUMS }
     *   { kind: 'table', set: ZERO_TABLE_NUMS }
     *   { kind: 'table', set: NINETEEN_TABLE_NUMS }
     *   { kind: 'any',   set: null }    // AWKWARD-TOPUP-1
     */
    function _topupFilter(last2) {
        const a = last2 && last2[0];
        const b = last2 && last2[1];
        if (typeof a !== 'number' || typeof b !== 'number') return { kind: 'any', set: null };
        const aPos = POSITIVE_NUMS.has(a), bPos = POSITIVE_NUMS.has(b);
        const aNeg = NEGATIVE_NUMS.has(a), bNeg = NEGATIVE_NUMS.has(b);
        if (aPos && bPos) return { kind: 'sign', set: POSITIVE_NUMS };
        if (aNeg && bNeg) return { kind: 'sign', set: NEGATIVE_NUMS };
        // Mixed signs → fall back to table partition.
        const aZero = ZERO_TABLE_NUMS.has(a), bZero = ZERO_TABLE_NUMS.has(b);
        const aNine = NINETEEN_TABLE_NUMS.has(a), bNine = NINETEEN_TABLE_NUMS.has(b);
        if (aZero && bZero) return { kind: 'table', set: ZERO_TABLE_NUMS };
        if (aNine && bNine) return { kind: 'table', set: NINETEEN_TABLE_NUMS };
        // AWKWARD-TOPUP-1 — mixed signs AND mixed tables. Accept ANY.
        return { kind: 'any', set: null };
    }

    /**
     * Extend `primary` to at least `MIN` (default 8) numbers using:
     *   1. greys matching the rule (priority by wheel-nearness to last actual)
     *   2. wheel ±1, ±2, ±3 ... expansions of primary, same filter + priority
     *
     * @param {object} opts
     * @param {number[]} opts.primary       primary bet pool
     * @param {number[]} opts.extras        grey/extra numbers
     * @param {number[]} opts.last2Actuals  the last 2 spin actuals (newest at [1])
     * @returns {{ numbers: number[], filterKind: string, addedFromExtras: number[], addedFromNeighbours: number[] }}
     */
    function topUpToEight(opts) {
        const MIN = (opts && typeof opts.min === 'number') ? opts.min : 8;
        const primary = Array.isArray(opts && opts.primary) ? opts.primary.slice() : [];
        const extras  = Array.isArray(opts && opts.extras)  ? opts.extras.slice()  : [];
        const last2   = Array.isArray(opts && opts.last2Actuals) ? opts.last2Actuals : [];
        const result  = primary.slice();
        const present = new Set(result);

        if (result.length >= MIN) {
            return { numbers: result, filterKind: 'unused', addedFromExtras: [], addedFromNeighbours: [] };
        }

        const filt = _topupFilter(last2);
        const anchor = (typeof last2[last2.length - 1] === 'number')
            ? last2[last2.length - 1]
            : null;
        // AWKWARD-TOPUP-2 — order candidates by wheel-nearness to the
        // latest actual. If no actual, fall back to natural order.
        const orderByNearness = (nums) => {
            if (typeof anchor !== 'number') return nums.slice();
            const anchorIdx = posOf(anchor);
            if (anchorIdx < 0) return nums.slice();
            return nums.slice().sort((x, y) => {
                const xi = posOf(x), yi = posOf(y);
                const dx = (xi < 0) ? Infinity : ringDist(xi, anchorIdx);
                const dy = (yi < 0) ? Infinity : ringDist(yi, anchorIdx);
                return dx - dy;
            });
        };
        const passes = (n) => (filt.set === null) ? true : filt.set.has(n);

        // Phase 1 — greys (extras) matching filter, priority by nearness.
        const addedExtras = [];
        const greyCandidates = orderByNearness(extras.filter(n => passes(n) && !present.has(n)));
        for (const n of greyCandidates) {
            if (result.length >= MIN) break;
            result.push(n); present.add(n); addedExtras.push(n);
        }

        // Phase 2 — wheel ±k expansion of primary, k = 1, 2, 3, ...
        // Stop as soon as we hit MIN or have walked the entire ring.
        const addedNeighbours = [];
        for (let k = 1; result.length < MIN && k <= 18; k++) {
            const ring = new Set();
            primary.forEach(n => {
                const i = posOf(n);
                if (i < 0) return;
                const ip = ((i + k) % RING + RING) % RING;
                const im = ((i - k) % RING + RING) % RING;
                ring.add(numAt(ip));
                ring.add(numAt(im));
                // 0/26 pocket shares index — make sure both are surfaced.
                if (ip === 0) { ring.add(0); ring.add(26); }
                if (im === 0) { ring.add(0); ring.add(26); }
            });
            const ringFiltered = orderByNearness(
                Array.from(ring).filter(n => passes(n) && !present.has(n))
            );
            for (const n of ringFiltered) {
                if (result.length >= MIN) break;
                result.push(n); present.add(n); addedNeighbours.push(n);
            }
        }

        return {
            numbers: result,
            filterKind: filt.kind,
            addedFromExtras: addedExtras,
            addedFromNeighbours: addedNeighbours
        };
    }

    const api = {
        pickAutoPair: pickAutoPair,
        getAutoSelections: getAutoSelections,
        topUpToEight: topUpToEight,
        // Exposed for tests
        _last3UseTwoAnchors: _last3UseTwoAnchors,
        _topupFilter: _topupFilter,
        POSITIVE_NUMS, NEGATIVE_NUMS, ZERO_TABLE_NUMS, NINETEEN_TABLE_NUMS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.AutoEnhanceStrategy = api;
    }
})();
