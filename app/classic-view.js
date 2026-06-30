/**
 * classic-view.js — Unified single-table view for Classic UI mode.
 *
 * Strategy: Modern's renderer continues to populate #table1Body,
 * #table2Body, #table3Body as usual (the .table-section divs are
 * hidden via CSS in Classic mode). After each Modern render we
 * CLONE the cells out of T1/T2/T3 into one unified #classicTable
 * with the structure:
 *
 *   Dir | Actual | <T1 family cells> | <T2 family cells> | <T3 family cells> | NEXT (T3)
 *
 * Cloning (not re-rendering) means every Ref / sub-Ref / POS code /
 * color class / anchor highlight / gold flash / PRJ chip carries
 * over without us having to reimplement any of it. The renderer's
 * Classic-mode family override (renderer-3tables.js) already
 * restricts T1 to the 7 allowed families, T2 to 5 (drops ref0/19),
 * and T3 to 7 — so we just take whatever cells are there.
 *
 * Rebuild trigger: MutationObserver on #table3Body — fires once per
 * Modern render. Toggle into Classic also calls rebuild() directly
 * so we don't have to wait for the next spin.
 */
(function () {
    'use strict';

    // Modern T1 and T2 emit ONLY family cells per row (no Dir/Actual
    // prefix). Only T3 emits Dir + Actual at the start. So Dir/Actual
    // for the unified Classic row must always be sourced from T3.
    const PREFIX_T1 = 0;
    const PREFIX_T2 = 0;
    const PREFIX_T3 = 2;

    // Cells matching this CSS selector are dropped from the clone
    // entirely (not hidden) — they're Modern's between-family
    // separator/indicator cells which appear as empty gaps in Classic.
    const SKIP_SELECTOR = '.pair-indicator-col, .pair-indicator-col-head, .pair-end-cell';

    function _isSkippable(el) {
        return el && typeof el.matches === 'function' && el.matches(SKIP_SELECTOR);
    }

    function _cloneFamilyCells(rowEl, prefix) {
        if (!rowEl) return [];
        const cells = Array.from(rowEl.children).slice(prefix);
        return cells.filter(td => !_isSkippable(td)).map(td => td.cloneNode(true));
    }

    function _clonePrefixCells(t3RowEl) {
        // Always source Dir + Actual from T3 — T1/T2 don't emit them.
        if (!t3RowEl) return [];
        return Array.from(t3RowEl.children).slice(0, PREFIX_T3)
            .map(td => td.cloneNode(true));
    }

    function _buildGroupHeader(t1Count, t2Count, t3Count) {
        // Row 1: super-group — Dir/Actual span all 3 head rows;
        // T1/T2/T3 cover the colspan of their cloned sub-headers.
        // Hidden tables (count===0) are omitted entirely; the next
        // visible table's left-divider becomes the section boundary.
        const tr = document.createElement('tr');
        tr.className = 'ct-group-header-row';
        const cellDir    = document.createElement('th'); cellDir.rowSpan = 3; cellDir.textContent = 'Dir';    tr.appendChild(cellDir);
        const cellActual = document.createElement('th'); cellActual.rowSpan = 3; cellActual.textContent = 'Actual'; tr.appendChild(cellActual);
        const mk = (label, span, ctClass, withDivider) => {
            const th = document.createElement('th');
            th.colSpan = Math.max(1, span);
            th.textContent = label;
            th.className = 'ct-group-header ' + ctClass + (withDivider ? ' ct-divider-left' : '');
            return th;
        };
        let firstAdded = false;
        if (t1Count > 0) { tr.appendChild(mk('T1', t1Count, 'ct-t1', firstAdded)); firstAdded = true; }
        if (t2Count > 0) { tr.appendChild(mk('T2', t2Count, 'ct-t2', firstAdded)); firstAdded = true; }
        if (t3Count > 0) { tr.appendChild(mk('T3', t3Count, 'ct-t3', firstAdded)); firstAdded = true; }
        return tr;
    }

    function _cloneHeadRowCells(headEl, rowIndex, prefix) {
        // Clone the Nth Modern thead row's cells (after prefix), skipping
        // separator/end cells. Returns [] if that row doesn't exist.
        if (!headEl) return [];
        const rows = headEl.querySelectorAll('tr');
        if (rows.length <= rowIndex) return [];
        const row = rows[rowIndex];
        return Array.from(row.children).slice(prefix)
            .filter(th => !_isSkippable(th))
            .map(th => th.cloneNode(true));
    }

    function _setRowSpan(cells, n) {
        cells.forEach(c => { c.rowSpan = n; });
        return cells;
    }

    function _tag(cells, cls) {
        cells.forEach(c => c.classList.add(cls));
        return cells;
    }

    // Walk a built <tr> and mark the cell BEFORE every pair-separator
    // (within the same table — not across the T1/T2/T3 boundary) as
    // a pair-end. The very last cell of the row is also a pair-end.
    // CSS uses this to draw the right edge of each pair so the pair
    // gets a complete box outline (left from .pair-separator + right
    // from .ct-pair-end + top/bottom from row borders).
    function _markPairBoundaries(tr) {
        const cells = Array.from(tr.children);
        for (let i = 0; i < cells.length - 1; i++) {
            const next = cells[i + 1];
            const nextStartsPair = next.classList.contains('pair-separator')
                                || next.classList.contains('copair-separator');
            const nextCrossesTables = next.classList.contains('ct-divider-left');
            if (nextStartsPair && !nextCrossesTables) {
                cells[i].classList.add('ct-pair-end');
            }
        }
        if (cells.length > 0) cells[cells.length - 1].classList.add('ct-pair-end');
    }

    function _addDividerToFirst(cells) {
        if (cells.length > 0) {
            cells[0].classList.add('ct-divider-left');
        }
        return cells;
    }

    function _isShown(id) {
        const cb = document.getElementById(id);
        // Default to true if checkbox not present.
        return !cb || cb.checked;
    }

    // Unified Ref-drop + pair-separator normalizer for all 3 tables.
    // `perFamilyKept` = cells per family when refs are kept (7 for
    // T1/T2 — Ref/1st/C/2nd/C/3rd/C; 3 for T3 — label/POS/PRJ).
    // When `keepRef=false`, drops every Nth cell from index 0 (the
    // Ref cell of each family). Class-based detection (.pair-separator)
    // can't be used because Modern marks it inconsistently across
    // tables — e.g. T1's ref0 has no separator class, T3 body has it
    // on every family but T3 head only on families 2+. Positional
    // logic guarantees head and body drop the SAME cells, so columns
    // stay aligned. Re-stamps .pair-separator at every family
    // boundary so the pair-box outline stays consistent too.
    function _refOf(cells, keepRef, perFamilyKept) {
        let out;
        if (keepRef) {
            out = cells.slice();
        } else {
            out = cells.filter(function (_, i) { return i % perFamilyKept !== 0; });
        }
        const stride = keepRef ? perFamilyKept : (perFamilyKept - 1);
        out.forEach(function (c, i) {
            c.classList.remove('pair-separator');
            if (i > 0 && i % stride === 0) {
                c.classList.add('pair-separator');
            }
        });
        return out;
    }

    // Family-label row cells use colspan to cover all sub-cells of
    // a family. When Ref is hidden, each family loses 1 sub-cell, so
    // reduce its colspan by 1.
    function _shrinkFamilyColspans(cells, by) {
        cells.forEach(c => {
            const cur = parseInt(c.getAttribute('colspan') || '1', 10);
            const next = Math.max(1, cur - by);
            c.colSpan = next;
        });
        return cells;
    }

    // Build a <colgroup> with N <col> elements (no widths set) — just
    // establishes the column count. With table-layout:auto the browser
    // sizes each column based on its widest content cell, so T3's PRJ
    // chips get more room than T1/T2's short reference numbers.
    function _buildColgroup(totalCols) {
        const cg = document.createElement('colgroup');
        for (let i = 0; i < totalCols; i++) {
            cg.appendChild(document.createElement('col'));
        }
        return cg;
    }

    function rebuild() {
        if (!document.body.classList.contains('ui-classic')) return;
        const ct = document.getElementById('classicTable');
        if (!ct) return;
        const head = ct.querySelector('thead');
        const body = ct.querySelector('tbody');
        if (!head || !body) return;

        // Checkboxes hide ONLY the Ref column for each table (not
        // the entire table). showRefX === true → keep Ref; false → drop.
        const showT1Ref = _isShown('classicShowT1');
        const showT2Ref = _isShown('classicShowT2');
        const showT3Ref = _isShown('classicShowT3');

        const t1Body = document.getElementById('table1Body');
        const t2Body = document.getElementById('table2Body');
        const t3Body = document.getElementById('table3Body');
        const t1Head = document.getElementById('table1Head');
        const t2Head = document.getElementById('table2Head');
        const t3Head = document.getElementById('table3Head');
        if (!t1Body || !t2Body || !t3Body) return;

        // Helper: shrink family-label colspans by 1 when Ref hidden
        // (T1/T2 only — T3's head is flat with no colspan grouping).
        const _famOf = (cells, keepRef) => keepRef ? cells : _shrinkFamilyColspans(cells, 1);

        // Three head rows:
        //   1. Super-group: Dir | Actual | T1 | T2 | T3
        //   2. Pair-family labels (e.g. 0 | 19 | P+1 | P-1 | ...)
        //      cloned from Modern's first head row for T1/T2.
        //      T3 has only ONE head row total, so use it here with
        //      rowSpan=2 to also cover row 3 below.
        //   3. Per-family sub-headers (Ref | 1st | C | 2nd | C | 3rd | C)
        //      cloned from Modern's second head row for T1/T2. T3 has
        //      none — already covered by row 2's rowSpan.
        head.innerHTML = '';

        // Row 2 (family labels). T1/T2 use colspan grouping — shrink
        // each family's colspan by 1 when Ref hidden. T3's head is
        // flat (no colspan grouping), so it drops the .pair-separator
        // cell the same way its body does — otherwise head cell count
        // wouldn't match body cell count and table-layout:fixed gives
        // T3 the wrong column widths.
        const t1Fam = _tag(_famOf(_cloneHeadRowCells(t1Head, 0, PREFIX_T1), showT1Ref), 'ct-t1');
        const t2Fam = _tag(_addDividerToFirst(_famOf(_cloneHeadRowCells(t2Head, 0, PREFIX_T2), showT2Ref)), 'ct-t2');
        const t3Fam = _tag(_addDividerToFirst(_refOf(_cloneHeadRowCells(t3Head, 0, PREFIX_T3), showT3Ref, 3)), 'ct-t3');

        // Row 3 (sub-headers): only T1/T2 have a second row. Drop the
        // Ref cell entirely when its checkbox is unchecked.
        const t1Sub = _tag(_refOf(_cloneHeadRowCells(t1Head, 1, PREFIX_T1), showT1Ref, 7), 'ct-t1');
        const t2Sub = _tag(_addDividerToFirst(_refOf(_cloneHeadRowCells(t2Head, 1, PREFIX_T2), showT2Ref, 7)), 'ct-t2');

        // T3 has just one head row — extend it to span both row 2 and row 3.
        if ((_cloneHeadRowCells(t3Head, 1, PREFIX_T3)).length === 0) {
            _setRowSpan(t3Fam, 2);
        }

        // Group-header colspan must match the actual sub-header width:
        //   T1/T2: count of row-3 (sub) cells
        //   T3:    count of row-2 (family) cells (no row 3 for T3)
        const t1Colspan = t1Sub.length || t1Fam.length;
        const t2Colspan = t2Sub.length || t2Fam.length;
        const t3Colspan = t3Fam.length;

        // Total columns = Dir + Actual + the three sections. Replace
        // any existing <colgroup> so column widths re-fit on every
        // rebuild (e.g. when a Ref checkbox is toggled).
        const totalCols = 2 + t1Colspan + t2Colspan + t3Colspan;
        const ct2 = document.getElementById('classicTable');
        const oldCg = ct2.querySelector('colgroup');
        if (oldCg) oldCg.remove();
        ct2.insertBefore(_buildColgroup(totalCols), ct2.firstChild);

        head.appendChild(_buildGroupHeader(t1Colspan, t2Colspan, t3Colspan));

        const famRow = document.createElement('tr');
        t1Fam.forEach(c => famRow.appendChild(c));
        t2Fam.forEach(c => famRow.appendChild(c));
        t3Fam.forEach(c => famRow.appendChild(c));
        _markPairBoundaries(famRow);
        head.appendChild(famRow);

        const subRow = document.createElement('tr');
        t1Sub.forEach(c => subRow.appendChild(c));
        t2Sub.forEach(c => subRow.appendChild(c));
        _markPairBoundaries(subRow);
        head.appendChild(subRow);

        // Body: one combined row per spin. Dir/Actual always come from
        // T3 (other tables don't emit them). Each table contributes its
        // family cells; if its Ref checkbox is unchecked, drop the
        // .pair-separator (Ref) cell of each family in that table.
        body.innerHTML = '';
        const t1Rows = Array.from(t1Body.children);
        const t2Rows = Array.from(t2Body.children);
        const t3Rows = Array.from(t3Body.children);
        const rowCount = Math.max(t1Rows.length, t2Rows.length, t3Rows.length);
        for (let i = 0; i < rowCount; i++) {
            const t3 = t3Rows[i];
            const isNext = (t3 && (t3.classList.contains('next-row') || (t3.textContent || '').includes('NEXT')));
            const tr = document.createElement('tr');
            if (isNext) tr.classList.add('ct-next-row');
            _clonePrefixCells(t3).forEach(c => tr.appendChild(c));
            _tag(_refOf(_cloneFamilyCells(t1Rows[i], PREFIX_T1), showT1Ref, 7), 'ct-t1').forEach(c => tr.appendChild(c));
            _tag(_addDividerToFirst(_refOf(_cloneFamilyCells(t2Rows[i], PREFIX_T2), showT2Ref, 7)), 'ct-t2').forEach(c => tr.appendChild(c));
            _tag(_addDividerToFirst(_refOf(_cloneFamilyCells(t3Rows[i], PREFIX_T3), showT3Ref, 3)), 'ct-t3').forEach(c => tr.appendChild(c));
            _markPairBoundaries(tr);
            body.appendChild(tr);
        }

        // Scroll to bottom (newest row visible).
        const sc = document.getElementById('classicViewScroll');
        if (sc) sc.scrollTop = sc.scrollHeight;
    }

    function _attachObserver() {
        const target = document.getElementById('table3Body');
        if (!target) return false;
        const obs = new MutationObserver(() => { rebuild(); });
        obs.observe(target, { childList: true, subtree: true });
        // Also watch T1/T2 since they may update on flash intervals.
        ['table1Body', 'table2Body'].forEach(id => {
            const t = document.getElementById(id);
            if (t) obs.observe(t, { childList: true, subtree: true });
        });
        return true;
    }

    function _syncT1RefHide() {
        const cb = document.getElementById('classicShowT1');
        const hidden = !!(cb && !cb.checked);
        if (typeof window.setClassicT1RefHidden === 'function') {
            window.setClassicT1RefHidden(hidden);
        }
    }

    function _wireToggles() {
        ['classicShowT1', 'classicShowT2', 'classicShowT3'].forEach(id => {
            const cb = document.getElementById(id);
            if (!cb) return;
            // Restore persisted state.
            try {
                const stored = localStorage.getItem('ui.' + id);
                if (stored === '0') cb.checked = false;
                if (stored === '1') cb.checked = true;
            } catch (e) {}
            cb.addEventListener('change', () => {
                try { localStorage.setItem('ui.' + id, cb.checked ? '1' : '0'); } catch (e) {}
                if (id === 'classicShowT1') _syncT1RefHide();
                rebuild();
            });
        });
        // Apply persisted T1 Ref hide flag at startup.
        _syncT1RefHide();
    }

    function _init() {
        if (!_attachObserver()) {
            setTimeout(_init, 100);
            return;
        }
        _wireToggles();
        rebuild();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    if (typeof window !== 'undefined') {
        window.ClassicView = { rebuild };
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PREFIX_CELLS };
    }
})();
