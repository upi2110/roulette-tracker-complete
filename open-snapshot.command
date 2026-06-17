#!/usr/bin/env bash
# ============================================================
#  📸 Open Table Snapshot
# ------------------------------------------------------------
#  Double-click this file (or pin it to Dock / Desktop) to
#  open the table-snapshot HTML in your default browser.
#
#  • If no snapshot has been generated yet, this will create
#    one (with whatever spin history you've passed, or an
#    empty placeholder) before opening.
#  • The HTML auto-refreshes every 2 seconds, so once Commit 3
#    lands (auto-update on every Electron spin) the page will
#    always reflect the current state — leave it open on a
#    second screen alongside Electron.
#
#  Args (optional): a space- or comma-separated list of spins
#  to seed the snapshot, e.g.:
#      ./open-snapshot.command 32 15 4 21 2 25 17
#
#  Reads ONLY from core/tables/projections.js + the writers
#  and tools/snapshot.js. Does not touch the Electron app.
# ============================================================

set -e

# Resolve script's own directory (works whether double-clicked or run).
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

SNAPSHOT_HTML="snapshots/current.html"

echo "📂 Project: $SCRIPT_DIR"
echo

# Generate (or refresh) the snapshot. Pass through any args so the
# user can seed it with a spin list from the shortcut command.
echo "📸 Generating snapshot…"
node tools/snapshot.js "$@"
echo

# Open in default browser.
if [[ -f "$SNAPSHOT_HTML" ]]; then
    echo "🌐 Opening $SNAPSHOT_HTML"
    open "$SNAPSHOT_HTML"
else
    echo "❌ $SNAPSHOT_HTML was not created. Check the snapshot CLI output above."
    exit 1
fi

echo
echo "✅ Done. The browser tab will auto-refresh every 2 seconds."
echo "   Leave it open next to Electron to compare side by side."
echo
# Brief pause so the Terminal window stays visible if double-clicked.
sleep 1
