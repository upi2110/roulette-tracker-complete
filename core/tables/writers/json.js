/**
 * ████████████████████████████████████████████████████████████████████
 *  🔒 LOCKED FILE — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL 🔒
 * ████████████████████████████████████████████████████████████████████
 *
 *  JSON mirror of the snapshot. Direct stringify of snap — no
 *  reshaping, no field renames. This is the contract the analyser
 *  reads. Changing it silently breaks every downstream consumer.
 *  See [[locked-snapshot-pipeline]].
 *
 * ████████████████████████████████████████████████████████████████████
 *
 * core/tables/writers/json.js — pure JSON serialiser for the snapshot.
 *
 * The output file (snapshots/current.json) is the contract that the
 * analytics engine consumes. Identical shape to what snapshot() returns
 * in-process; written without modification.
 */

'use strict';

const fs = require('fs');

/**
 * Write the snapshot as pretty-printed JSON to the given path.
 * @param {Object} snap - output of snapshot()
 * @param {string} outPath - destination .json path
 */
function writeJson(snap, outPath) {
    const text = JSON.stringify(snap, null, 2);
    fs.writeFileSync(outPath, text, 'utf8');
}

module.exports = { writeJson };
