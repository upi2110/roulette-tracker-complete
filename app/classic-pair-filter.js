/**
 * classic-pair-filter.js — Classic-mode-only pair filter UI (2026-06-30).
 *
 * Builds 4 dropdown panels in the page header (Pairs / T1 / T2 / T3)
 * that are visible ONLY when body.ui-classic. They control a fully
 * INDEPENDENT filter state from Modern — see _classicUniversal /
 * _classicT1/T2/T3 in renderer-3tables.js, set via
 * window.setClassicVisibleUniversal / setClassicVisibleForTable.
 *
 * Modern's filter dropdowns + filter state are never touched.
 *
 * State persistence:
 *   localStorage 'cpf.universal'  → CSV of family keys
 *   localStorage 'cpf.T1' / .T2 / .T3 → CSV of pair-keys
 *
 * Defaults on first launch:
 *   universal = 7 Classic families
 *   T1/T2/T3  = main-only pair-keys for their available families
 */
(function () {
    'use strict';

    // Classic universal family list — locked to these 7 (user spec).
    const FAMILIES = [
        { key: 'ref0',           label: '0' },
        { key: 'ref19',          label: '19' },
        { key: 'prevPlus1',      label: 'P+1' },
        { key: 'prevMinus1',     label: 'P-1' },
        { key: 'prevPrevPlus1',  label: 'PP+1' },
        { key: 'prevPrevMinus1', label: 'PP-1' },
        { key: 'prev',           label: 'P' }
    ];

    // Per-table available pair-keys. ref0/ref19 don't have 13-opp
    // halves in any T1/T2/T3 column-group (verified in renderer-3tables.js).
    const PERTABLE = {
        T1: [
            { key: 'ref0',                       label: '0' },
            { key: 'ref19',                      label: '19' },
            { key: 'prevPlus1',                  label: 'P+1' },
            { key: 'prevPlus1_13opp',            label: 'P+1-13o' },
            { key: 'prevMinus1',                 label: 'P-1' },
            { key: 'prevMinus1_13opp',           label: 'P-1-13o' },
            { key: 'prevPrevPlus1',              label: 'PP+1' },
            { key: 'prevPrevPlus1_13opp',        label: 'PP+1-13o' },
            { key: 'prevPrevMinus1',             label: 'PP-1' },
            { key: 'prevPrevMinus1_13opp',       label: 'PP-1-13o' },
            { key: 'prev',                       label: 'P' },
            { key: 'prev_13opp',                 label: 'P-13o' }
        ],
        T2: [
            // T2 in Classic excludes ref0/ref19 per spec.
            { key: 'prevPlus1',                  label: 'P+1' },
            { key: 'prevPlus1_13opp',            label: 'P+1-13o' },
            { key: 'prevMinus1',                 label: 'P-1' },
            { key: 'prevMinus1_13opp',           label: 'P-1-13o' },
            { key: 'prevPrevPlus1',              label: 'PP+1' },
            { key: 'prevPrevPlus1_13opp',        label: 'PP+1-13o' },
            { key: 'prevPrevMinus1',             label: 'PP-1' },
            { key: 'prevPrevMinus1_13opp',       label: 'PP-1-13o' },
            { key: 'prev',                       label: 'P' },
            { key: 'prev_13opp',                 label: 'P-13o' }
        ],
        T3: [
            // T3 column-groups don't include ref0/ref19.
            { key: 'prevPlus1',                  label: 'P+1' },
            { key: 'prevPlus1_13opp',            label: 'P+1-13o' },
            { key: 'prevMinus1',                 label: 'P-1' },
            { key: 'prevMinus1_13opp',           label: 'P-1-13o' },
            { key: 'prevPrevPlus1',              label: 'PP+1' },
            { key: 'prevPrevPlus1_13opp',        label: 'PP+1-13o' },
            { key: 'prevPrevMinus1',             label: 'PP-1' },
            { key: 'prevPrevMinus1_13opp',       label: 'PP-1-13o' },
            { key: 'prev',                       label: 'P' },
            { key: 'prev_13opp',                 label: 'P-13o' }
        ]
    };

    // Defaults — main-only.
    const DEFAULT_UNIVERSAL = FAMILIES.map(f => f.key);
    const DEFAULT_PERTABLE = {
        T1: ['ref0', 'ref19', 'prevPlus1', 'prevMinus1', 'prevPrevPlus1', 'prevPrevMinus1', 'prev'],
        T2: ['prevPlus1', 'prevMinus1', 'prevPrevPlus1', 'prevPrevMinus1', 'prev'],
        T3: ['prevPlus1', 'prevMinus1', 'prevPrevPlus1', 'prevPrevMinus1', 'prev']
    };

    function _readSet(storageKey, fallbackArr) {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return new Set(fallbackArr);
            const arr = raw.split(',').filter(Boolean);
            return arr.length > 0 ? new Set(arr) : new Set(fallbackArr);
        } catch (e) { return new Set(fallbackArr); }
    }
    function _writeSet(storageKey, set) {
        try { localStorage.setItem(storageKey, Array.from(set).join(',')); } catch (e) {}
    }

    function _pushToRenderer(slot, set) {
        if (slot === 'universal') {
            if (typeof window.setClassicVisibleUniversal === 'function') {
                window.setClassicVisibleUniversal(Array.from(set));
            }
        } else {
            if (typeof window.setClassicVisibleForTable === 'function') {
                window.setClassicVisibleForTable(slot, Array.from(set));
            }
        }
        if (window.ClassicView && typeof window.ClassicView.rebuild === 'function') {
            requestAnimationFrame(() => window.ClassicView.rebuild());
        }
    }

    function _updateCount(slot) {
        const sizes = {
            universal: { id: 'cpfCount',   total: FAMILIES.length, set: _state.universal },
            T1:        { id: 'cpfCountT1', total: PERTABLE.T1.length, set: _state.T1 },
            T2:        { id: 'cpfCountT2', total: PERTABLE.T2.length, set: _state.T2 },
            T3:        { id: 'cpfCountT3', total: PERTABLE.T3.length, set: _state.T3 }
        };
        const cfg = sizes[slot];
        if (!cfg) return;
        const el = document.getElementById(cfg.id);
        if (el) el.textContent = '(' + cfg.set.size + '/' + cfg.total + ')';
    }

    const _state = {
        universal: _readSet('cpf.universal', DEFAULT_UNIVERSAL),
        T1:        _readSet('cpf.T1',        DEFAULT_PERTABLE.T1),
        T2:        _readSet('cpf.T2',        DEFAULT_PERTABLE.T2),
        T3:        _readSet('cpf.T3',        DEFAULT_PERTABLE.T3)
    };

    function _buildPanel(slot, panelId, checkboxesId, allBtnId, items, storageKey) {
        const cont = document.getElementById(checkboxesId);
        if (!cont) return;
        cont.innerHTML = '';
        items.forEach(item => {
            const label = document.createElement('label');
            label.style.cursor = 'pointer';
            label.style.userSelect = 'none';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = item.key;
            cb.checked = _state[slot].has(item.key);
            cb.style.marginRight = '4px';
            cb.addEventListener('change', () => {
                if (cb.checked) _state[slot].add(item.key);
                else _state[slot].delete(item.key);
                _writeSet(storageKey, _state[slot]);
                _pushToRenderer(slot, _state[slot]);
                _updateCount(slot);
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(item.label));
            cont.appendChild(label);
        });
        const allBtn = document.getElementById(allBtnId);
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                const allOn = _state[slot].size === items.length;
                _state[slot] = allOn ? new Set() : new Set(items.map(i => i.key));
                _writeSet(storageKey, _state[slot]);
                _pushToRenderer(slot, _state[slot]);
                // Re-tick the checkboxes to match.
                Array.from(cont.querySelectorAll('input[type=checkbox]')).forEach(cb => {
                    cb.checked = _state[slot].has(cb.value);
                });
                _updateCount(slot);
            });
        }
        _updateCount(slot);
    }

    function _wireDropdownToggle(btnId, panelId) {
        const btn = document.getElementById(btnId);
        const panel = document.getElementById(panelId);
        if (!btn || !panel) return;
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const open = panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'block';
        });
        // Close on outside click.
        document.addEventListener('click', (ev) => {
            if (!panel.contains(ev.target) && ev.target !== btn) {
                panel.style.display = 'none';
            }
        });
    }

    function _init() {
        _buildPanel('universal', 'cpfPanel',   'cpfCheckboxes',   'cpfAllBtn',   FAMILIES,    'cpf.universal');
        _buildPanel('T1',        'cpfPanelT1', 'cpfCheckboxesT1', 'cpfAllBtnT1', PERTABLE.T1, 'cpf.T1');
        _buildPanel('T2',        'cpfPanelT2', 'cpfCheckboxesT2', 'cpfAllBtnT2', PERTABLE.T2, 'cpf.T2');
        _buildPanel('T3',        'cpfPanelT3', 'cpfCheckboxesT3', 'cpfAllBtnT3', PERTABLE.T3, 'cpf.T3');

        _wireDropdownToggle('cpfToggleBtn',   'cpfPanel');
        _wireDropdownToggle('cpfToggleBtnT1', 'cpfPanelT1');
        _wireDropdownToggle('cpfToggleBtnT2', 'cpfPanelT2');
        _wireDropdownToggle('cpfToggleBtnT3', 'cpfPanelT3');

        // Push initial state to the renderer so the very first paint
        // (especially when launching directly in Classic) uses our
        // persisted state instead of the renderer's lazy defaults.
        _pushToRenderer('universal', _state.universal);
        _pushToRenderer('T1', _state.T1);
        _pushToRenderer('T2', _state.T2);
        _pushToRenderer('T3', _state.T3);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    if (typeof window !== 'undefined') {
        window.ClassicPairFilter = {
            getState: () => ({
                universal: new Set(_state.universal),
                T1: new Set(_state.T1),
                T2: new Set(_state.T2),
                T3: new Set(_state.T3)
            }),
            FAMILIES: FAMILIES.map(f => f.key),
            DEFAULT_PERTABLE: { T1: DEFAULT_PERTABLE.T1.slice(), T2: DEFAULT_PERTABLE.T2.slice(), T3: DEFAULT_PERTABLE.T3.slice() }
        };
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { FAMILIES, PERTABLE, DEFAULT_UNIVERSAL, DEFAULT_PERTABLE };
    }
})();
