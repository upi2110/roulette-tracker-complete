/**
 * core/tables/writers/html.js — Electron-table mirror.
 *
 * The HTML it produces lays out exactly like Electron's T1/T2/T3:
 *   • One row per historical spin (oldest at top → newest at bottom)
 *   • Per pair group: 7 cells per row — Ref | 1st | C | 2nd | C | 3rd | C
 *     (matching Electron's SUB_LABELS = ['Ref','1st','C','2nd','C','3rd','C'])
 *   • A final NEXT row at the bottom showing the projection for the
 *     spin that would follow the latest actual.
 *   • Pair groups in the same order Electron uses:
 *       ref0, ref19, P+1, P+1-13o, P-1, P-1-13o,
 *       PP+1, PP+1-13o, PP-1, PP-1-13o,
 *       P, P-13o, PP, PP-13o,
 *       P+2, P+2-13o, P-2, P-2-13o,
 *       PP+2, PP+2-13o, PP-2, PP-2-13o
 *
 * Cell colouring matches Electron's pos-s / pos-o / pos-xx scheme:
 *   S-codes (S+0, SL+N, SR+N) → green family
 *   O-codes (O+0, OL+N, OR+N) → amber family
 *   XX                         → grey
 *   T1_VALID / T2_VALID codes are rendered with a thicker border + bold
 *   font so anchor hits stand out exactly like the live tables.
 *
 * Reads ONLY from the locked core/tables/projections.js module
 * (via the snapshot input). Does not duplicate or reimplement any
 * math. If the renderer's display logic changes, the projections
 * module updates first (with user approval) and this writer
 * follows automatically.
 *
 * The output document is self-contained — no external CSS or JS.
 * A 1-second cache-busted self-reload keeps the browser tab in sync
 * with on-disk regenerations from the Electron bridge.
 */

(function (root) {
    'use strict';

    const SUB_LABELS = ['Ref', '1st', 'C', '2nd', 'C', '3rd', 'C'];

    // Pair-group order — mirrors T1_COLUMN_GROUPS in app/renderer-3tables.js.
    // The dataPair key is what the snapshot's nextProjections / rows use.
    // NOTE: ref0 and ref19 are fixed anchor points (not derived from spin
    // history). Electron's column config intentionally does NOT pair them
    // with their 13-opposites — they stand alone. Only the spin-derived
    // families (prev*, prevPrev*, …) carry _13opp variants here.
    const PAIR_GROUPS = [
        { dataPair: 'ref0',                  label: '0',         is13Opp: false, cssBg: '#dbeafe' },
        { dataPair: 'ref19',                 label: '19',        is13Opp: false, cssBg: '#cffafe' },
        { dataPair: 'prevPlus1',             label: 'P+1',       is13Opp: false, cssBg: '#fce7f3' },
        { dataPair: 'prevPlus1_13opp',       label: 'P+1-13o',   is13Opp: true,  cssBg: '#fce7f3' },
        { dataPair: 'prevMinus1',            label: 'P-1',       is13Opp: false, cssBg: '#fae8ff' },
        { dataPair: 'prevMinus1_13opp',      label: 'P-1-13o',   is13Opp: true,  cssBg: '#fae8ff' },
        { dataPair: 'prevPrevPlus1',         label: 'PP+1',      is13Opp: false, cssBg: '#ede9fe' },
        { dataPair: 'prevPrevPlus1_13opp',   label: 'PP+1-13o',  is13Opp: true,  cssBg: '#ede9fe' },
        { dataPair: 'prevPrevMinus1',        label: 'PP-1',      is13Opp: false, cssBg: '#dbeafe' },
        { dataPair: 'prevPrevMinus1_13opp',  label: 'PP-1-13o',  is13Opp: true,  cssBg: '#dbeafe' },
        { dataPair: 'prev',                  label: 'P',         is13Opp: false, cssBg: '#fef3c7' },
        { dataPair: 'prev_13opp',            label: 'P-13o',     is13Opp: true,  cssBg: '#fef3c7' },
        { dataPair: 'prevPrev',              label: 'PP',        is13Opp: false, cssBg: '#fed7aa' },
        { dataPair: 'prevPrev_13opp',        label: 'PP-13o',    is13Opp: true,  cssBg: '#fed7aa' },
        { dataPair: 'prevPlus2',             label: 'P+2',       is13Opp: false, cssBg: '#bbf7d0' },
        { dataPair: 'prevPlus2_13opp',       label: 'P+2-13o',   is13Opp: true,  cssBg: '#bbf7d0' },
        { dataPair: 'prevMinus2',            label: 'P-2',       is13Opp: false, cssBg: '#a7f3d0' },
        { dataPair: 'prevMinus2_13opp',      label: 'P-2-13o',   is13Opp: true,  cssBg: '#a7f3d0' },
        { dataPair: 'prevPrevPlus2',         label: 'PP+2',      is13Opp: false, cssBg: '#fef3c7' },
        { dataPair: 'prevPrevPlus2_13opp',   label: 'PP+2-13o',  is13Opp: true,  cssBg: '#fef3c7' },
        { dataPair: 'prevPrevMinus2',        label: 'PP-2',      is13Opp: false, cssBg: '#fed7aa' },
        { dataPair: 'prevPrevMinus2_13opp',  label: 'PP-2-13o',  is13Opp: true,  cssBg: '#fed7aa' }
    ];

    const T1_VALID = new Set(['S+0', 'SL+1', 'SR+1', 'O+0', 'OL+1', 'OR+1']);
    const T2_VALID = new Set(['S+0', 'SL+1', 'SR+1', 'SL+2', 'SR+2',
                              'O+0', 'OL+1', 'OR+1', 'OL+2', 'OR+2']);

    // Resolve the math helpers from the locked projections module.
    // Used to compute per-row POS codes inside T3 (we need them in the
    // writer because computeTable3Rows doesn't carry them — and the
    // projections module is locked).
    const P = (typeof require === 'function')
        ? require('../projections.js')
        : (typeof window !== 'undefined' ? window.CoreTables : null);

    // Convert a pairKey ('prevPlus1' or 'prevPlus1_13opp') to the
    // family name Electron's visibleFamilies set uses (strip _13opp).
    function _familyForDataPair(dataPair) {
        return dataPair && dataPair.endsWith('_13opp')
            ? dataPair.slice(0, -6)
            : dataPair;
    }

    // If meta.visibleFamilies is an array, filter the group list by it.
    // If it's null/undefined, return everything (default = show all).
    function _filterGroups(groups, visibleFamilies) {
        if (!Array.isArray(visibleFamilies)) return groups;
        const set = new Set(visibleFamilies);
        return groups.filter(g => set.has(_familyForDataPair(g.dataPair)));
    }

    // Map camelCase pair-key → snake_case engine refKey for
    // calculateReferences(). Mirrors REFKEY_MAP in the strategy code.
    const REFKEY_MAP = {
        prev:           'prev',
        prevPrev:       'prev_prev',
        prevPlus1:      'prev_plus_1',
        prevPlus2:      'prev_plus_2',
        prevMinus1:     'prev_minus_1',
        prevMinus2:     'prev_minus_2',
        prevPrevPlus1:  'prev_prev_plus_1',
        prevPrevPlus2:  'prev_prev_plus_2',
        prevPrevMinus1: 'prev_prev_minus_1',
        prevPrevMinus2: 'prev_prev_minus_2'
    };

    /**
     * Resolve the reference number for a given pairKey (used by the
     * NEXT row to fill the "Ref" cell — historical rows get refNum
     * from the snapshot's perPair data directly).
     *
     * pairKey examples:
     *   'ref0'           → 0
     *   'ref19'          → 19
     *   'prev'           → lastSpin
     *   'prevPlus1'      → min(lastSpin + 1, 36)  (via calculateReferences)
     *   'prev_13opp'     → DIGIT_13_OPPOSITES[lastSpin]
     *   'prevPlus1_13opp' → DIGIT_13_OPPOSITES[min(lastSpin + 1, 36)]
     */
    function _refNumForPair(pairKey, lastSpin, prevSpin) {
        const is13Opp = pairKey.endsWith('_13opp');
        const base = is13Opp ? pairKey.slice(0, -6) : pairKey;
        let refNum = null;
        if (base === 'ref0')  refNum = 0;
        else if (base === 'ref19') refNum = 19;
        else if (P && typeof P.calculateReferences === 'function' && lastSpin != null) {
            const refs = P.calculateReferences(lastSpin, prevSpin == null ? null : prevSpin);
            const engineKey = REFKEY_MAP[base];
            refNum = engineKey ? refs[engineKey] : null;
            if (refNum != null && Number.isNaN(refNum)) refNum = null;
        }
        if (is13Opp && refNum != null && P && P.DIGIT_13_OPPOSITES) {
            const r = P.DIGIT_13_OPPOSITES[refNum];
            return (r != null) ? r : null;
        }
        return refNum;
    }

    function _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Position-code formatting ──
    // Matches Electron's pos-s / pos-o / pos-xx classes.
    function _formatCode(code, isValid) {
        if (!code || code === 'XX') {
            return `<span style="color:#94a3b8;font-size:10px;">${code || '—'}</span>`;
        }
        const isS = code.charAt(0) === 'S';
        const bg  = isValid ? (isS ? '#16a34a' : '#f59e0b') : (isS ? '#dcfce7' : '#fef3c7');
        const fg  = isValid ? '#fff' : (isS ? '#15803d' : '#78350f');
        const fw  = isValid ? '700' : '500';
        return `<span style="background:${bg};color:${fg};font-weight:${fw};` +
               `padding:1px 4px;border-radius:3px;font-size:10px;` +
               `font-family:'SF Mono',ui-monospace,monospace;">${_esc(code)}</span>`;
    }

    // ── Per-row, per pair-group: 7 cells ──
    function _renderGroupCells(perPair, group, validSet) {
        const e = perPair && perPair[group.dataPair.replace(/_13opp$/, '')];
        // perPair only carries the "pair" entry; we resolve the 13opp
        // half from oppLookup / oppCodes / oppHits on the same entry.
        if (!e) {
            return ['<td></td>', '<td></td>', '<td></td>', '<td></td>',
                    '<td></td>', '<td></td>', '<td></td>'].join('');
        }
        const lookup = group.is13Opp ? e.oppLookup : e.refLookup;
        const codes  = group.is13Opp ? e.oppCodes  : e.codes;
        const hits   = group.is13Opp ? e.oppHits   : e.hits;
        const ref    = group.is13Opp ? e.ref13Opp  : e.refNum;
        if (!lookup) {
            return `<td colspan="7" style="text-align:center;color:#cbd5e1;font-size:10px;">(no lookup)</td>`;
        }
        const ref0 = ref != null ? ref : '';
        const cellStyle = 'padding:2px 4px;text-align:center;font-size:11px;background:#fff;';
        return [
            `<td style="${cellStyle}color:#64748b;font-weight:700;background:${group.cssBg};">${ref0}</td>`,
            `<td style="${cellStyle}">${lookup.first ?? ''}</td>`,
            `<td style="${cellStyle}">${_formatCode(codes && codes.first,  hits && hits.first )}</td>`,
            `<td style="${cellStyle}">${lookup.second ?? ''}</td>`,
            `<td style="${cellStyle}">${_formatCode(codes && codes.second, hits && hits.second)}</td>`,
            `<td style="${cellStyle}">${lookup.third ?? ''}</td>`,
            `<td style="${cellStyle}">${_formatCode(codes && codes.third,  hits && hits.third )}</td>`
        ].join('');
    }

    // ── NEXT row (no actual yet — show projected anchors only) ──
    function _renderNextRow(table, neighborRange, groups, lastSpin, prevSpin) {
        const proj = table.nextProjections || {};
        const cells = ['<td style="font-weight:700;background:#fef9c3;color:#854d0e;text-align:center;padding:4px 6px;">NEXT</td>'];
        cells.push('<td style="background:#fef9c3;text-align:center;color:#94a3b8;">—</td>');
        (groups || PAIR_GROUPS).forEach(group => {
            const entry = proj[group.dataPair];
            if (!entry) {
                cells.push('<td colspan="7" style="background:#fef9c3;text-align:center;color:#cbd5e1;font-size:10px;">—</td>');
                return;
            }
            // Ref cell = the pair's reference NUMBER (the spin used to
            // build the lookup row), NOT the lookup row's 1st anchor.
            // Resolve via the locked module's calculateReferences().
            const refNum = _refNumForPair(group.dataPair, lastSpin, prevSpin);
            const baseStyle = 'padding:2px 4px;text-align:center;font-size:11px;background:#fef9c3;';
            cells.push(`<td style="${baseStyle}font-weight:700;color:#854d0e;background:${group.cssBg};">${refNum ?? ''}</td>`);
            ['first', 'second', 'third'].forEach(k => {
                const cell = entry[k] || {};
                const target = (cell.targets || [])[0];
                cells.push(`<td style="${baseStyle}">${target ?? ''}</td>`);
                // "C" column under NEXT = no code (nothing's happened yet),
                // but show a chip-stack of sameSide / oppSide counts so the
                // user sees how many numbers each anchor expands to.
                const sN = (cell.sameSide || []).length;
                const oN = (cell.oppSide  || []).length;
                cells.push(`<td style="${baseStyle}color:#94a3b8;font-size:9px;">` +
                           `<span title="same-side ±${neighborRange}" style="color:#15803d;">${sN}</span>·` +
                           `<span title="opp-side ±${neighborRange}" style="color:#a16207;">${oN}</span>` +
                           `</td>`);
            });
        });
        return `<tr style="border-top:2px solid #f59e0b;">${cells.join('')}</tr>`;
    }

    // ── Two-row column header (matches Electron's two header rows) ──
    function _renderT12Head(groups) {
        const groupHeaders = groups.map(g => {
            return `<th colspan="7" style="background:${g.cssBg};text-align:center;` +
                   `padding:3px 6px;font-size:11px;border-left:2px solid #fff;">${g.label}</th>`;
        }).join('');
        const subHeaders = groups.map(g => {
            return SUB_LABELS.map((lbl, i) =>
                `<th style="background:#f8fafc;color:#475569;font-size:10px;font-weight:500;` +
                `padding:2px 3px;text-align:center;${i === 0 ? 'border-left:2px solid #fff;' : ''}">${lbl}</th>`
            ).join('');
        }).join('');
        const dirHeader    = `<th rowspan="2" style="background:#f8fafc;padding:4px;font-size:10px;text-align:center;">Spin</th>`;
        const actualHeader = `<th rowspan="2" style="background:#f8fafc;padding:4px;font-size:10px;text-align:center;">Actual</th>`;
        return `<thead>
            <tr>${dirHeader}${actualHeader}${groupHeaders}</tr>
            <tr>${subHeaders}</tr>
        </thead>`;
    }

    function _renderT12(name, t, neighborLabel, visibleFamilies, meta) {
        const proj    = t.nextProjections || {};
        const rows    = t.rows || [];
        const validSet = name === 'Table 1' ? T1_VALID : T2_VALID;
        const neighborRange = name === 'Table 1' ? 1 : 2;
        const groups  = _filterGroups(PAIR_GROUPS, visibleFamilies);
        const count   = new Set(groups.map(g => _familyForDataPair(g.dataPair))).size;
        const lastSpin = meta ? meta.lastSpin : null;
        const prevSpin = meta ? meta.prevSpin : null;

        const bodyRows = rows.map((row, ri) => {
            const stripe = ri % 2 === 0 ? '#ffffff' : '#fafafa';
            const dirCell    = `<td style="background:${stripe};text-align:center;padding:3px;font-size:10px;color:#64748b;">${row.spinIndex + 1}</td>`;
            const actualCell = `<td style="background:${stripe};text-align:center;padding:3px;font-weight:700;color:#0f172a;">${row.actual}</td>`;
            const cells = groups.map(g => _renderGroupCells(row.perPair, g, validSet)).join('');
            return `<tr>${dirCell}${actualCell}${cells}</tr>`;
        }).join('');

        const nextRow = (count > 0) ? _renderNextRow(t, neighborRange, groups, lastSpin, prevSpin) : '';

        const badgeColor = count >= 12 ? '#16a34a' : count > 0 ? '#f59e0b' : '#dc2626';
        const filterNote = Array.isArray(visibleFamilies)
            ? ` <span style="font-weight:400;color:#64748b;font-size:10px;">(filtered to ${visibleFamilies.length}/12)</span>`
            : '';
        return `
            <h2 style="margin:18px 0 4px;font-size:14px;color:#0f172a;">
                ${name} <span style="font-weight:400;color:#64748b;font-size:11px;">— ${neighborLabel}</span>${filterNote}
                <span style="float:right;font-size:11px;font-weight:600;background:${badgeColor};color:#fff;padding:2px 8px;border-radius:10px;">
                    ${count} pair famil${count === 1 ? 'y' : 'ies'} · ${rows.length} historical row${rows.length === 1 ? '' : 's'}
                </span>
            </h2>
            <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:4px;">
                <table style="border-collapse:collapse;font-size:11px;white-space:nowrap;">
                    ${_renderT12Head(groups)}
                    <tbody>${bodyRows}${nextRow}</tbody>
                </table>
            </div>
        `;
    }

    // ── T3 ──
    // Electron T3 has a different per-pair cell structure: each cell
    // shows the per-row anchors (purple/green chips). We mirror that
    // with one column per T3 pair group, each cell carrying the
    // anchors recorded for that (spin, pair).
    const T3_PAIR_GROUPS = [
        { dataPair: 'prevPlus1',       label: 'P+1',  cssBg: '#fce7f3' },
        { dataPair: 'prevMinus1',      label: 'P-1',  cssBg: '#fae8ff' },
        { dataPair: 'prevPrevPlus1',   label: 'PP+1', cssBg: '#ede9fe' },
        { dataPair: 'prevPrevMinus1',  label: 'PP-1', cssBg: '#dbeafe' },
        { dataPair: 'prev',            label: 'P',    cssBg: '#fef3c7' },
        { dataPair: 'prevPrev',        label: 'PP',   cssBg: '#fed7aa' },
        { dataPair: 'prevPlus2',       label: 'P+2',  cssBg: '#bbf7d0' },
        { dataPair: 'prevMinus2',      label: 'P-2',  cssBg: '#a7f3d0' },
        { dataPair: 'prevPrevPlus2',   label: 'PP+2', cssBg: '#fef3c7' },
        { dataPair: 'prevPrevMinus2',  label: 'PP-2', cssBg: '#fed7aa' }
    ];

    // ── Per-row T3 cells matching Electron's 5-cell-per-pair layout ──
    //   col 1: PRJ chips (purple anchors + green anchors, side-coloured)
    //   col 2: POS code of actual against pair refNum
    //   col 3: refNum (the pair's ref number this row)
    //   col 4: ref13Opp
    //   col 5: POS code of actual against ref13Opp
    //
    // Note: Electron orders these as label | POS | label-13o | POS | PRJ
    // but the visual goal is the same — see each pair's PRJ chips and
    // both POS codes per row. We render PRJ first so the chips align
    // visually beneath the NEXT row chips.

    function _renderT3PrjChips(p) {
        if (!p) return '<span style="color:#cbd5e1;font-size:10px;">—</span>';
        const purpleHtml = (p.purple || []).map(n =>
            `<span style="background:#a855f7;color:#fff;padding:1px 4px;margin:1px;border-radius:3px;font-size:10px;font-weight:700;">${n}</span>`
        ).join('');
        const greenHtml = (p.green || []).map(n =>
            `<span style="background:#16a34a;color:#fff;padding:1px 4px;margin:1px;border-radius:3px;font-size:10px;font-weight:700;">${n}</span>`
        ).join('');
        const hitBadge = p.hitAnchor
            ? `<span style="background:#fef9c3;color:#854d0e;padding:0 3px;font-size:9px;font-weight:700;margin-left:2px;border-radius:2px;">HIT</span>`
            : '';
        return purpleHtml + greenHtml + hitBadge;
    }

    function _renderT3RowCells(perPair, group, actual) {
        const e = perPair && perPair[group.dataPair];
        if (!e) return `<td colspan="5" style="text-align:center;color:#cbd5e1;font-size:10px;">—</td>`;
        // Compute POS codes for the actual number against this row's refs.
        // (P is the locked projections module — exposes calculatePositionCode.)
        const codePair  = (P && e.refNum   != null) ? P.calculatePositionCode(e.refNum,   actual) : 'XX';
        const code13opp = (P && e.ref13Opp != null) ? P.calculatePositionCode(e.ref13Opp, actual) : 'XX';
        const isHitPair  = T1_VALID.has(codePair)  || T2_VALID.has(codePair);
        const isHit13opp = T1_VALID.has(code13opp) || T2_VALID.has(code13opp);
        const base = 'padding:2px 4px;background:#fff;text-align:center;font-size:11px;';
        return [
            `<td style="${base}font-weight:700;color:#7c3aed;background:${group.cssBg};">${e.refNum  ?? ''}</td>`,
            `<td style="${base}">${_formatCode(codePair,  isHitPair)}</td>`,
            `<td style="${base}font-weight:700;color:#16a34a;background:${group.cssBg};opacity:0.85;">${e.ref13Opp ?? ''}</td>`,
            `<td style="${base}">${_formatCode(code13opp, isHit13opp)}</td>`,
            `<td style="${base}">${_renderT3PrjChips(e)}</td>`
        ].join('');
    }

    function _renderT3NextCells(group, projEntry) {
        if (!projEntry) {
            return `<td colspan="5" style="text-align:center;color:#cbd5e1;font-size:10px;background:#fef9c3;">—</td>`;
        }
        const p = projEntry;
        const purpleHtml = (p.purple || []).map(n =>
            `<span style="background:#a855f7;color:#fff;padding:1px 4px;margin:1px;border-radius:3px;font-size:10px;font-weight:700;">${n}</span>`
        ).join('');
        const greenHtml = (p.green || []).map(n =>
            `<span style="background:#16a34a;color:#fff;padding:1px 4px;margin:1px;border-radius:3px;font-size:10px;font-weight:700;">${n}</span>`
        ).join('');
        const base = 'padding:3px 4px;background:#fef9c3;text-align:center;font-size:11px;';
        // NEXT row has no actual yet → no POS code, just the projection.
        // Carry refNum + ref13Opp through so the user can see which refs
        // drive the projection.
        return [
            `<td style="${base}font-weight:700;color:#7c3aed;background:${group.cssBg};">${p.refNum ?? ''}</td>`,
            `<td style="${base}color:#94a3b8;font-size:9px;">${p.usePosCode ? _esc(p.usePosCode) : '—'}</td>`,
            `<td style="${base}font-weight:700;color:#16a34a;background:${group.cssBg};opacity:0.85;">${p.ref13Opp ?? ''}</td>`,
            `<td style="${base}color:#94a3b8;font-size:9px;">—</td>`,
            `<td style="${base}">${purpleHtml}${greenHtml}</td>`
        ].join('');
    }

    function _renderT3(t, visibleFamilies) {
        const proj   = t.nextProjections || {};
        const rows   = t.rows || [];
        const groups = _filterGroups(T3_PAIR_GROUPS, visibleFamilies);
        const count  = groups.length;

        // Two header rows — group label spans 5 cols; sub-headers underneath.
        const T3_SUBS = ['Ref', 'POS', '13o', 'POS', 'PRJ'];
        const groupHeaders = groups.map(g =>
            `<th colspan="5" style="background:${g.cssBg};text-align:center;padding:3px 6px;font-size:11px;border-left:2px solid #fff;">${g.label}</th>`
        ).join('');
        const subHeaders = groups.map(g =>
            T3_SUBS.map((lbl, i) =>
                `<th style="background:#f8fafc;color:#475569;font-size:10px;font-weight:500;` +
                `padding:2px 3px;text-align:center;${i === 0 ? 'border-left:2px solid #fff;' : ''}">${lbl}</th>`
            ).join('')
        ).join('');
        const head = `<thead>
            <tr>
                <th rowspan="2" style="background:#f8fafc;padding:4px;font-size:10px;text-align:center;">Spin</th>
                <th rowspan="2" style="background:#f8fafc;padding:4px;font-size:10px;text-align:center;">Actual</th>
                ${groupHeaders}
            </tr>
            <tr>${subHeaders}</tr>
        </thead>`;

        const bodyRows = rows.map((row, ri) => {
            const stripe = ri % 2 === 0 ? '#ffffff' : '#fafafa';
            const dirCell    = `<td style="background:${stripe};text-align:center;padding:3px;font-size:10px;color:#64748b;">${row.spinIndex + 1}</td>`;
            const actualCell = `<td style="background:${stripe};text-align:center;padding:3px;font-weight:700;color:#0f172a;">${row.actual}</td>`;
            const cells = groups.map(g => _renderT3RowCells(row.perPair, g, row.actual)).join('');
            return `<tr>${dirCell}${actualCell}${cells}</tr>`;
        }).join('');

        const nextCells = groups.map(g => _renderT3NextCells(g, proj[g.dataPair])).join('');
        const nextRow = (count > 0)
            ? `<tr style="border-top:2px solid #f59e0b;">
                <td style="font-weight:700;background:#fef9c3;color:#854d0e;text-align:center;padding:4px 6px;">NEXT</td>
                <td style="background:#fef9c3;text-align:center;color:#94a3b8;">—</td>
                ${nextCells}
              </tr>` : '';

        const badgeColor = count >= 10 ? '#16a34a' : count > 0 ? '#f59e0b' : '#dc2626';
        const filterNote = Array.isArray(visibleFamilies)
            ? ` <span style="font-weight:400;color:#64748b;font-size:10px;">(filtered to ${visibleFamilies.length}/12)</span>`
            : '';
        return `
            <h2 style="margin:18px 0 4px;font-size:14px;color:#0f172a;">
                Table 3 <span style="font-weight:400;color:#64748b;font-size:11px;">— anchors + bet pool (±1)</span>${filterNote}
                <span style="float:right;font-size:11px;font-weight:600;background:${badgeColor};color:#fff;padding:2px 8px;border-radius:10px;">
                    ${count} pair famil${count === 1 ? 'y' : 'ies'} · ${rows.length} historical row${rows.length === 1 ? '' : 's'}
                </span>
            </h2>
            <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:4px;">
                <table style="border-collapse:collapse;font-size:11px;white-space:nowrap;">
                    ${head}
                    <tbody>${bodyRows}${nextRow}</tbody>
                </table>
            </div>
        `;
    }

    // ── Header / banner ──
    function _renderHeader(meta) {
        const spinsHtml = (meta.spins || []).map((n, i) => {
            const isLast = i === meta.spins.length - 1;
            const bg = isLast ? '#16a34a' : '#1e293b';
            return `<span style="display:inline-block;background:${bg};color:#fff;` +
                   `padding:1px 6px;margin:1px;border-radius:3px;font-size:11px;` +
                   `font-family:'SF Mono',ui-monospace,monospace;font-weight:700;">${n}</span>`;
        }).join('');
        return `
            <div style="background:#0f172a;color:#e2e8f0;padding:10px 14px;border-radius:6px;margin-bottom:14px;">
                <div style="font-size:12px;color:#94a3b8;">📸 Snapshot of live Electron tables — read-only mirror, auto-refresh 1s</div>
                <div style="font-size:14px;font-weight:700;margin-top:4px;">
                    ${meta.spinCount} spin${meta.spinCount === 1 ? '' : 's'} entered
                    ${meta.timestamp ? `<span style="font-weight:400;color:#94a3b8;font-size:11px;margin-left:8px;">${_esc(meta.timestamp)}</span>` : ''}
                </div>
                <div style="margin-top:6px;">
                    <span style="font-size:11px;color:#94a3b8;margin-right:6px;">Spins (oldest → newest):</span>
                    ${spinsHtml || '<span style="color:#64748b;">(none yet — enter spins in Electron)</span>'}
                </div>
            </div>
        `;
    }

    /**
     * Render a snapshot as a complete HTML document string.
     * @param {Object} snap - output of snapshot()
     * @returns {string} HTML
     */
    function renderHtml(snap) {
        const meta = (snap && snap.meta) || {};
        // visibleFamilies is null when Electron hasn't passed a filter
        // (CLI / first-run); otherwise it's an array like
        // ['prev','prevPlus1','ref0',...] from window.getVisiblePairFamilies().
        const vf = meta.visibleFamilies;
        const body =
            _renderHeader(meta) +
            _renderT12('Table 1', snap.table1 || {}, '±1 expansion (S+0, SL+1, SR+1, O+0, OL+1, OR+1)', vf, meta) +
            _renderT12('Table 2', snap.table2 || {}, '±2 expansion (T1 codes + SL+2, SR+2, OL+2, OR+2)', vf, meta) +
            _renderT3(snap.table3 || {}, vf);

        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>📸 ${meta.spinCount || 0} spins — Electron table mirror</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               margin: 16px; background: #ffffff; color: #0f172a; }
        h2 { border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        table th, table td { border: 1px solid #f1f5f9; }
        table tbody tr:hover td { filter: brightness(0.97); }
    </style>
    <script>
        // Cache-busted hard reload every 1s. The plain <meta refresh>
        // can serve cached HTML when the file is overwritten in place.
        setTimeout(function () {
            var u = location.pathname + '?ts=' + Date.now() + location.hash;
            location.replace(u);
        }, 1000);
    </script>
</head>
<body>
${body}
</body>
</html>`;
    }

    const api = { renderHtml };
    if (typeof window !== 'undefined') {
        window.CoreTablesHtmlWriter = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
