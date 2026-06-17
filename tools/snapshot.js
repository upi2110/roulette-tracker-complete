#!/usr/bin/env node
/**
 * tools/snapshot.js — CLI entry point for the table-mirror snapshot.
 *
 * Usage:
 *   node tools/snapshot.js 32 15 4 21 2 25 17
 *   node tools/snapshot.js --spins 32,15,4,21,2,25,17
 *   node tools/snapshot.js --from-file spins.txt
 *   node tools/snapshot.js                       # uses an empty list
 *
 * By default writes:
 *   snapshots/current.html       (browser-readable, auto-refreshing)
 *   snapshots/current.xlsx       (Excel/Numbers spreadsheet)
 *   snapshots/history/spin-NNN.{html,xlsx}   (one numbered copy each call)
 *
 * Flags:
 *   --no-html     skip the HTML writer
 *   --no-xlsx     skip the XLSX writer
 *   --no-history  skip the numbered history files
 *   --json        also print the snapshot JSON to stdout
 *   --out DIR     override default `snapshots/` directory
 *
 * Reads ONLY from core/tables/projections.js (locked) and the
 * writers. Does not touch the Electron app.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const { snapshot } = require('../core/tables/snapshot.js');
const { renderHtml } = require('../core/tables/writers/html.js');
const { writeXlsx }  = require('../core/tables/writers/xlsx.js');

function parseArgs(argv) {
    const args = {
        spins: [],
        writeHtml: true,
        writeXlsx: true,
        writeHistory: true,
        printJson: false,
        outDir: path.resolve(__dirname, '..', 'snapshots')
    };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--spins': {
                const next = argv[++i] || '';
                next.split(',').forEach(s => {
                    const n = parseInt(s.trim(), 10);
                    if (!Number.isNaN(n)) args.spins.push(n);
                });
                break;
            }
            case '--from-file': {
                const fp = argv[++i];
                const txt = fs.readFileSync(fp, 'utf8');
                txt.split(/\s+|,/).forEach(s => {
                    const n = parseInt(s.trim(), 10);
                    if (!Number.isNaN(n)) args.spins.push(n);
                });
                break;
            }
            case '--no-html':    args.writeHtml = false; break;
            case '--no-xlsx':    args.writeXlsx = false; break;
            case '--no-history': args.writeHistory = false; break;
            case '--json':       args.printJson = true; break;
            case '--out':        args.outDir = path.resolve(argv[++i]); break;
            case '--help':
            case '-h':
                console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1]);
                process.exit(0);
                break;
            default:
                if (!a.startsWith('--')) positional.push(a);
        }
    }
    if (!args.spins.length && positional.length) {
        positional.forEach(s => {
            const n = parseInt(s, 10);
            if (!Number.isNaN(n)) args.spins.push(n);
        });
    }
    return args;
}

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function _isoNoMs() {
    // Date is restricted in this runtime, but tools/ is OUTSIDE the
    // locked snapshot/projections code. CLI uses Date for filenames
    // only — it never feeds into the projection math itself. If your
    // environment also restricts Date here, swap to an env-var
    // timestamp.
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    ensureDir(args.outDir);
    ensureDir(path.join(args.outDir, 'history'));

    const stamp = _isoNoMs();
    const snap  = snapshot(args.spins, { timestamp: stamp });
    const idx   = String(snap.meta.spinCount).padStart(3, '0');

    const tasks = [];

    if (args.writeHtml) {
        const html = renderHtml(snap);
        const cur  = path.join(args.outDir, 'current.html');
        fs.writeFileSync(cur, html);
        console.log(`  ✓ wrote ${path.relative(process.cwd(), cur)}`);
        if (args.writeHistory) {
            const hist = path.join(args.outDir, 'history', `spin-${idx}.html`);
            fs.writeFileSync(hist, html);
            console.log(`  ✓ wrote ${path.relative(process.cwd(), hist)}`);
        }
    }

    if (args.writeXlsx) {
        const cur = path.join(args.outDir, 'current.xlsx');
        tasks.push(writeXlsx(snap, cur).then(() =>
            console.log(`  ✓ wrote ${path.relative(process.cwd(), cur)}`)));
        if (args.writeHistory) {
            const hist = path.join(args.outDir, 'history', `spin-${idx}.xlsx`);
            tasks.push(writeXlsx(snap, hist).then(() =>
                console.log(`  ✓ wrote ${path.relative(process.cwd(), hist)}`)));
        }
    }

    if (args.printJson) {
        process.stdout.write(JSON.stringify(snap, null, 2) + '\n');
    }

    await Promise.all(tasks);
    console.log(`📸 Snapshot — ${snap.meta.spinCount} spins, T1/T2/T3 NEXT projections written.`);
}

main().catch(err => {
    console.error('snapshot CLI failed:', err && err.stack ? err.stack : err);
    process.exit(1);
});
