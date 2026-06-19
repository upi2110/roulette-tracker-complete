#!/bin/bash

# Frontend Startup Script
# ========================

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🎨 STARTING ELECTRON FRONTEND"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Navigate to project directory
cd ~/Documents/UpenderImp/roulette-tracker-complete

# Check if frontend files exist
if [ ! -f "app/main.js" ]; then
    echo "❌ ERROR: app/main.js not found!"
    echo "   Are you in the correct directory?"
    exit 1
fi

echo "✅ Frontend files found"
echo ""

# Check if backend is running (non-blocking — just a notice).
# The frontend will run fine without it; AI calls just won't resolve
# until the backend is started. Previously this prompted for
# confirmation, which silently killed the launch when invoked from
# Finder / non-interactive contexts.
echo "🔍 Checking if backend is running..."
if curl -s http://localhost:8002/ > /dev/null 2>&1; then
    echo "✅ Backend is running on http://localhost:8002"
else
    echo "⚠️  Backend not detected on :8002 — starting frontend anyway."
    echo "   (Start the backend separately with ./start-backend-v6.sh)"
fi

echo ""
echo "🎬 Starting Electron app..."
echo "   The app window will open shortly"
echo "   Press Ctrl+C in this terminal to stop"
echo ""

# Useful paths printed once so the user (and any reviewer) knows
# exactly where to look. The snapshot HTML is the cell-perfect
# mirror of T1/T2/T3 — open it in a browser tab alongside the app
# to scroll/zoom freely without affecting the Electron window.
PROJ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOT_HTML="$PROJ_ROOT/snapshots/current.html"
FE_LOG="$PROJ_ROOT/logs/frontend/current.log"
BE_LOG="$PROJ_ROOT/logs/backend/current.log"

echo "📂 Useful paths for this session:"
echo "   • HTML mirror:    file://$SNAPSHOT_HTML"
echo "   • Frontend log:   $FE_LOG"
echo "   • Backend log:    $BE_LOG"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

npm start
