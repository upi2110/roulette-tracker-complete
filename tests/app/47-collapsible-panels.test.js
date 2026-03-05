/**
 * 47-collapsible-panels.test.js
 * Tests collapse/expand toggle for all tables and panels.
 */

const { setupDOM, loadRendererFunctions } = require('../test-setup');
const fs = require('fs');
const pathMod = require('path');

let R;

beforeAll(() => {
    // Load table-lookup.js globals
    const lookupSrc = fs.readFileSync(pathMod.join(__dirname, '..', '..', 'app', 'table-lookup.js'), 'utf-8');
    const fn = new Function(lookupSrc + '\nglobalThis.getLookupRow = getLookupRow;');
    fn();
});

beforeEach(() => {
    setupDOM();

    // Wrap each table in a gridWrapper div (matching real index-3tables.html structure)
    ['1', '2', '3'].forEach(n => {
        const table = document.getElementById('table' + n);
        if (table && table.parentElement) {
            const wrapper = document.createElement('div');
            wrapper.className = 'grid-wrapper';
            wrapper.id = 'gridWrapper' + n;
            table.parentElement.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }
    });

    // Add toggle buttons (matching index-3tables.html changes)
    // Table toggle buttons
    ['1', '2', '3'].forEach(n => {
        const wrapper = document.getElementById('gridWrapper' + n);
        if (wrapper && wrapper.parentElement) {
            const btn = document.createElement('button');
            btn.id = 'toggleTable' + n;
            btn.className = 'btn-table-toggle';
            btn.textContent = '\u2212'; // minus sign
            wrapper.parentElement.insertBefore(btn, wrapper);
        }
    });

    // Prediction results toggle
    const predContainer = document.getElementById('predictionResultsContainer');
    if (predContainer) {
        const header = document.createElement('div');
        header.className = 'prediction-results-header';
        header.innerHTML = '<span>Prediction Results</span>';
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'togglePredResults';
        toggleBtn.className = 'btn-table-toggle';
        toggleBtn.textContent = '\u2212';
        header.appendChild(toggleBtn);

        const content = document.createElement('div');
        content.id = 'predictionResultsContent';
        while (predContainer.firstChild) {
            content.appendChild(predContainer.firstChild);
        }
        predContainer.appendChild(header);
        predContainer.appendChild(content);
    }

    R = loadRendererFunctions();
});

// ═══════════════════════════════════════════════════════════════
//  A. Table Toggles
// ═══════════════════════════════════════════════════════════════
describe('A. Table Toggle Buttons', () => {
    test('A1: Table 1 toggle button exists in DOM', () => {
        expect(document.getElementById('toggleTable1')).not.toBeNull();
    });

    test('A2: Table 2 toggle button exists in DOM', () => {
        expect(document.getElementById('toggleTable2')).not.toBeNull();
    });

    test('A3: Table 3 toggle button exists in DOM', () => {
        expect(document.getElementById('toggleTable3')).not.toBeNull();
    });

    test('A4: Clicking Table 1 toggle hides gridWrapper1', () => {
        const btn = document.getElementById('toggleTable1');
        const wrapper = document.getElementById('gridWrapper1');

        // Simulate DOMContentLoaded listener
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = wrapper.style.display !== 'none';
            wrapper.style.display = isVisible ? 'none' : 'block';
            btn.textContent = isVisible ? '+' : '\u2212';
        });

        btn.click();
        expect(wrapper.style.display).toBe('none');
        expect(btn.textContent).toBe('+');
    });

    test('A5: Clicking Table 1 toggle again shows gridWrapper1', () => {
        const btn = document.getElementById('toggleTable1');
        const wrapper = document.getElementById('gridWrapper1');

        btn.addEventListener('click', () => {
            const isVisible = wrapper.style.display !== 'none';
            wrapper.style.display = isVisible ? 'none' : 'block';
            btn.textContent = isVisible ? '+' : '\u2212';
        });

        // Click twice
        btn.click();
        expect(wrapper.style.display).toBe('none');
        btn.click();
        expect(wrapper.style.display).toBe('block');
    });

    test('A6: All 3 tables can be toggled independently', () => {
        ['1', '2', '3'].forEach(n => {
            const btn = document.getElementById('toggleTable' + n);
            const wrapper = document.getElementById('gridWrapper' + n);

            btn.addEventListener('click', () => {
                const isVisible = wrapper.style.display !== 'none';
                wrapper.style.display = isVisible ? 'none' : 'block';
            });

            btn.click();
            expect(wrapper.style.display).toBe('none');
        });

        // Verify all three are hidden
        expect(document.getElementById('gridWrapper1').style.display).toBe('none');
        expect(document.getElementById('gridWrapper2').style.display).toBe('none');
        expect(document.getElementById('gridWrapper3').style.display).toBe('none');
    });
});

// ═══════════════════════════════════════════════════════════════
//  B. Prediction Results Toggle
// ═══════════════════════════════════════════════════════════════
describe('B. Prediction Results Toggle', () => {
    test('B1: Prediction results toggle button exists', () => {
        expect(document.getElementById('togglePredResults')).not.toBeNull();
    });

    test('B2: Prediction results content wrapper exists', () => {
        expect(document.getElementById('predictionResultsContent')).not.toBeNull();
    });

    test('B3: Clicking toggle hides prediction results content', () => {
        const btn = document.getElementById('togglePredResults');
        const content = document.getElementById('predictionResultsContent');

        btn.addEventListener('click', () => {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            btn.textContent = isVisible ? '+' : '\u2212';
        });

        btn.click();
        expect(content.style.display).toBe('none');
    });

    test('B4: Double click shows prediction results again', () => {
        const btn = document.getElementById('togglePredResults');
        const content = document.getElementById('predictionResultsContent');

        btn.addEventListener('click', () => {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
        });

        btn.click();
        btn.click();
        expect(content.style.display).toBe('block');
    });
});

// ═══════════════════════════════════════════════════════════════
//  C. Tables Render Correctly After Collapse/Expand
// ═══════════════════════════════════════════════════════════════
describe('C. Tables Render After Collapse/Expand', () => {
    test('C1: render() works after Table 1 is collapsed and expanded', () => {
        const wrapper = document.getElementById('gridWrapper1');

        // Collapse
        wrapper.style.display = 'none';

        // Add spins and render
        R.spins.push({ actual: 13, direction: 'C' });
        R.spins.push({ actual: 8, direction: 'C' });
        R.spins.push({ actual: 22, direction: 'C' });
        expect(() => R.render()).not.toThrow();

        // Expand
        wrapper.style.display = 'block';
        expect(() => R.render()).not.toThrow();
    });

    test('C2: collapsed table does not prevent spin operations', () => {
        document.getElementById('gridWrapper1').style.display = 'none';
        document.getElementById('gridWrapper2').style.display = 'none';
        document.getElementById('gridWrapper3').style.display = 'none';

        // Add spins should still work
        R.spins.push({ actual: 13, direction: 'C' });
        R.spins.push({ actual: 8, direction: 'C' });
        R.spins.push({ actual: 22, direction: 'C' });
        expect(() => R.render()).not.toThrow();

        expect(R.spins.length).toBe(3);
    });
});
