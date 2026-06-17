/**
 * core/tables/writers/html.js — render a snapshot as a side-by-side
 * grid HTML file the user can open in any browser and eyeball next
 * to the live Electron tables.
 *
 * Read-only. No interactivity (matches the snapshot's intent: this
 * is a mirror, not an input panel).
 *
 * Auto-refresh: <meta http-equiv="refresh"> reloads the page every
 * 2 seconds so when the snapshot file regenerates on a new spin,
 * the browser picks it up without user action.
 */

(function (root) {
    'use strict';

    function _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _chip(n, kind) {
        // kind: 'anchor' | 'same' | 'opp' | 'plain'
        const styles = {
            anchor: 'background:#16a34a;color:#fff;border:1px solid #15803d;font-weight:700;',
            same:   'background:#dcfce7;color:#14532d;border:1px solid #86efac;',
            opp:    'background:#fef3c7;color:#78350f;border:1px solid #fcd34d;',
            plain:  'background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;'
        };
        const s = styles[kind] || styles.plain;
        return `<span style="${s}display:inline-block;padding:1px 5px;margin:1px;` +
               `border-radius:3px;font-size:11px;font-family:'SF Mono',monospace;">${n}</span>`;
    }

    function _legendStripe() {
        return `<div style="font-size:11px;color:#475569;line-height:1.7;margin:6px 0;">` +
               _chip('anchor', 'anchor') +
               ' = lookup anchor &nbsp;&nbsp; ' +
               _chip('same', 'same') +
               ' = same-side ±neighbours &nbsp;&nbsp; ' +
               _chip('opp', 'opp') +
               ' = opp-side ±neighbours' +
               `</div>`;
    }

    function _renderT12Cell(cell) {
        if (!cell) return '<td></td>';
        const anchors  = new Set(cell.targets || []);
        const sameSide = cell.sameSide || [];
        const oppSide  = cell.oppSide  || [];
        const html = [];
        sameSide.forEach(n => html.push(_chip(n, anchors.has(n) ? 'anchor' : 'same')));
        if (oppSide.length) html.push('<span style="color:#94a3b8;margin:0 4px;">·</span>');
        oppSide.forEach(n => html.push(_chip(n, anchors.has(n) ? 'anchor' : 'opp')));
        return `<td style="vertical-align:top;padding:4px 6px;">${html.join('')}</td>`;
    }

    function _renderT12(name, t, neighborLabel) {
        const proj = t.nextProjections || {};
        const pairKeys = Object.keys(proj).filter(k => !k.endsWith('_13opp'));
        const rows = [];

        pairKeys.forEach(pairKey => {
            const pair = proj[pairKey];
            const opp  = proj[pairKey + '_13opp'];
            const labelP   = `${pairKey} <span style="color:#94a3b8;font-weight:400;">(pair)</span>`;
            const labelOpp = `${pairKey} <span style="color:#94a3b8;font-weight:400;">(13-opp)</span>`;
            const headRow = `<tr><th style="text-align:left;padding:4px 8px;background:#e0f2fe;">${labelP}</th>
                ${_renderT12Cell(pair.first)}${_renderT12Cell(pair.second)}${_renderT12Cell(pair.third)}</tr>`;
            rows.push(headRow);
            if (opp) {
                rows.push(`<tr><th style="text-align:left;padding:4px 8px;background:#fff7ed;">${labelOpp}</th>
                    ${_renderT12Cell(opp.first)}${_renderT12Cell(opp.second)}${_renderT12Cell(opp.third)}</tr>`);
            }
        });

        return `
            <h2 style="margin:18px 0 4px;font-size:14px;color:#0f172a;">
                ${name} <span style="font-weight:400;color:#64748b;font-size:11px;">— NEXT row projections (${neighborLabel})</span>
            </h2>
            ${_legendStripe()}
            <table style="border-collapse:collapse;width:100%;font-size:11px;">
                <thead><tr style="background:#f8fafc;color:#334155;">
                    <th style="text-align:left;padding:4px 8px;">Pair</th>
                    <th style="text-align:left;padding:4px 8px;">first</th>
                    <th style="text-align:left;padding:4px 8px;">second</th>
                    <th style="text-align:left;padding:4px 8px;">third</th>
                </tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        `;
    }

    function _renderT3(t) {
        const proj = t.nextProjections || {};
        const rows = Object.entries(proj).map(([pairKey, p]) => {
            const purple = (p.purple || []).map(n => _chip(n, 'anchor')).join('');
            const green  = (p.green  || []).map(n => _chip(n, 'anchor')).join('');
            const same   = (p.sameSide || []).map(n => _chip(n, 'same')).join('');
            const opp    = (p.oppSide  || []).map(n => _chip(n, 'opp' )).join('');
            return `<tr>
                <th style="text-align:left;padding:4px 8px;background:#f1f5f9;white-space:nowrap;">
                    ${pairKey}
                    <div style="font-weight:400;color:#64748b;font-size:10px;">
                        ref ${p.refNum} · 13opp ${p.ref13Opp} · code ${_esc(p.usePosCode || '—')}
                    </div>
                </th>
                <td style="vertical-align:top;padding:4px 6px;">${purple || '<span style="color:#cbd5e1;">—</span>'}</td>
                <td style="vertical-align:top;padding:4px 6px;">${green  || '<span style="color:#cbd5e1;">—</span>'}</td>
                <td style="vertical-align:top;padding:4px 6px;">${same   || '<span style="color:#cbd5e1;">—</span>'}</td>
                <td style="vertical-align:top;padding:4px 6px;">${opp    || '<span style="color:#cbd5e1;">—</span>'}</td>
            </tr>`;
        }).join('');

        return `
            <h2 style="margin:18px 0 4px;font-size:14px;color:#0f172a;">
                Table 3 <span style="font-weight:400;color:#64748b;font-size:11px;">— NEXT row anchors + bet pool (±1)</span>
            </h2>
            ${_legendStripe()}
            <table style="border-collapse:collapse;width:100%;font-size:11px;">
                <thead><tr style="background:#f8fafc;color:#334155;">
                    <th style="text-align:left;padding:4px 8px;">Pair</th>
                    <th style="text-align:left;padding:4px 8px;">Anchors (same-side)</th>
                    <th style="text-align:left;padding:4px 8px;">Anchors (opp-side)</th>
                    <th style="text-align:left;padding:4px 8px;">Bet pool — same</th>
                    <th style="text-align:left;padding:4px 8px;">Bet pool — opp</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function _renderHeader(meta) {
        const spinsHtml = (meta.spins || []).map((n, i) => {
            const isLast = i === meta.spins.length - 1;
            return _chip(n, isLast ? 'anchor' : 'plain');
        }).join('');
        return `
            <div style="background:#0f172a;color:#e2e8f0;padding:10px 14px;border-radius:6px;margin-bottom:14px;">
                <div style="font-size:12px;color:#94a3b8;">Snapshot of the live Electron tables — read-only mirror</div>
                <div style="font-size:14px;font-weight:700;margin-top:4px;">
                    ${meta.spinCount} spins entered
                    ${meta.timestamp ? `<span style="font-weight:400;color:#94a3b8;font-size:11px;margin-left:8px;">${_esc(meta.timestamp)}</span>` : ''}
                </div>
                <div style="margin-top:6px;">
                    <span style="font-size:11px;color:#94a3b8;margin-right:6px;">Spins (oldest → newest):</span>
                    ${spinsHtml || '<span style="color:#64748b;">none</span>'}
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
        const body =
            _renderHeader(meta) +
            _renderT12('Table 1', snap.table1 || {}, '±1 expansion') +
            _renderT12('Table 2', snap.table2 || {}, '±2 expansion') +
            _renderT3(snap.table3 || {});

        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="1">
    <title>Table snapshot — ${meta.spinCount || 0} spins</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               margin: 16px; background: #ffffff; color: #0f172a; }
        h2 { border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        table th, table td { border-bottom: 1px solid #f1f5f9; }
        table tbody tr:hover td { background: #f8fafc; }
    </style>
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
