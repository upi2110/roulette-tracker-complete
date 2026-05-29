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

    const HL_BET = { bg: 'rgba(34,197,94,0.30)', border: '#16a34a' };
    const HL_WAIT = { bg: 'rgba(245,158,11,0.28)', border: '#d97706' };

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

        // Whole-column highlight: background tint + inset border so the
        // contributing columns stand out against the existing cell colours.
        s.textContent = selectors.join(',\n')
            + `{ background-color: ${theme.bg} !important;`
            + ` box-shadow: inset 0 0 0 1px ${theme.border}; }`;
    }

    if (typeof window !== 'undefined') {
        window.analyticsHighlight = { apply: apply, clear: clear };
    }
})();
