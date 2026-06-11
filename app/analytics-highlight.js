/**
 * Analytics Highlight — visual trace of the T2 × T3 consensus
 * ===========================================================
 *
 * When Analytics makes a decision, this highlights the FULL T2 and T3
 * columns (header + every body cell) of the pairs that contributed to
 * the aligned region, so the user can see which pairs drove the pick and
 * follow the process.
 *
 * Implementation note: the tables re-render on every spin, which wipes
 * inline styles on the cells. So instead of styling elements directly we
 * maintain ONE dynamic <style> rule that targets cells by their
 * [data-pair] attribute. Because it's an attribute selector, it keeps
 * matching the freshly-rendered cells after every re-render — the
 * highlight persists until we change/clear the rule. Purely additive:
 * it only adds a stylesheet; it never touches table rendering or data.
 */
(function () {
    'use strict';

    // Engine refKeys are snake_case (prev_plus_1); table data-pair is
    // camelCase (prevPlus1). Convert (idempotent on already-camel input).
    function toCamel(key) {
        return (typeof key === 'string') ? key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()) : '';
    }

    // SAME cyan family as the existing `.t3-pair-selected` rule in
    // app/styles-3tables.css — analytics uses the app's standard
    // selection colour, not green/red/amber. NO background fill (it was
    // making the headers unreadable) — just thin coloured side-bars on
    // the contributing column cells.
    const HL_BET = { accent: '#0ea5e9' };   // solid sky cyan
    const HL_WAIT = { accent: '#7dd3fc' };  // softer cyan

    function _styleEl() {
        let s = document.getElementById('analytics-hl-style');
        if (!s) {
            s = document.createElement('style');
            s.id = 'analytics-hl-style';
            (document.head || document.documentElement).appendChild(s);
        }
        return s;
    }

    function clear() {
        const s = document.getElementById('analytics-hl-style');
        if (s) s.textContent = '';
    }

    function _uniqCamel(list) {
        const out = [];
        (list || []).forEach(k => { const c = toCamel(k); if (c && out.indexOf(c) === -1) out.push(c); });
        return out;
    }

    /**
     * Highlight the contributing pairs' columns in T2 and T3.
     * @param {{t2Pairs?:string[], t2Pair?:string, t3Pairs?:string[], isBet:boolean}} info
     */
    function apply(info) {
        const s = _styleEl();
        if (!info) { s.textContent = ''; return; }
        const theme = info.isBet ? HL_BET : HL_WAIT;

        const t2 = _uniqCamel([].concat(info.t2Pairs || [], info.t2Pair ? [info.t2Pair] : []));
        const t3 = _uniqCamel(info.t3Pairs || []);

        const selectors = [];
        t2.forEach(p => {
            selectors.push(`#table2 [data-pair="${p}"]`);
            selectors.push(`#table2 [data-pair="${p}_13opp"]`);
        });
        t3.forEach(p => {
            selectors.push(`#table3 [data-pair="${p}"]`);
            selectors.push(`#table3 [data-pair="${p}_13opp"]`);
        });

        if (selectors.length === 0) { s.textContent = ''; return; }

        // Match the existing `.t3-pair-selected` style family exactly so
        // analytics looks identical to manual pair selection: cyan
        // outline + soft tinted body + bright header chip.
        const bodySel = selectors.join(',\n');
        const headerSel = selectors.map(x => x.replace('[data-pair', 'th[data-pair')).join(',\n');
        s.textContent =
            `${bodySel} {`
            + ` outline: 3px solid ${theme.accent} !important;`
            + ` outline-offset: -2px;`
            + ` background-color: rgba(14, 165, 233, 0.15) !important;`
            + ` }\n`
            + `${headerSel} {`
            + ` background-color: #bae6fd !important;`
            + ` color: #0c4a6e !important;`
            + ` }`;
    }

    if (typeof window !== 'undefined') {
        window.analyticsHighlight = { apply: apply, clear: clear };
    }
})();
