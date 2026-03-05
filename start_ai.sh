#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Roulette Tracker — One-Click Startup
# Starts BOTH the Python backend AND the Electron frontend
#
# Usage:  ./start_ai.sh     (from the main project directory)
# ═══════════════════════════════════════════════════════════════

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ROULETTE TRACKER — FULL STARTUP"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ── Resolve project root (where this script lives) ──
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "  Project : $PROJECT_DIR"
echo ""

# ── Check backend files ──
if [ ! -f "$BACKEND_DIR/api/ai_server_v6.py" ]; then
    echo "  ERROR: backend/api/ai_server_v6.py not found!"
    exit 1
fi
if [ ! -f "$BACKEND_DIR/models/ai_engine_v6_NEW_STRATEGY.py" ]; then
    echo "  ERROR: backend/models/ai_engine_v6_NEW_STRATEGY.py not found!"
    exit 1
fi
echo "  Backend files OK"

# ── Check frontend files ──
if [ ! -f "$PROJECT_DIR/app/main.js" ]; then
    echo "  ERROR: app/main.js not found!"
    exit 1
fi
echo "  Frontend files OK"
echo ""

# ── Activate virtual environment ──
VENV_DIR="$PROJECT_DIR/venv"
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
    echo "  Virtual env: $VENV_DIR (activated)"
else
    echo "  WARNING: No virtual environment found at $VENV_DIR"
    echo "  Run:  python3 -m venv venv && source venv/bin/activate && pip install -r backend/requirements.txt"
fi

# ── Check Python ──
echo "  Python: $(python3 --version 2>&1)"

# ── Check dependencies ──
python3 -c "import fastapi, uvicorn, pydantic" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "  Missing Python dependencies. Installing..."
    pip install -r "$BACKEND_DIR/requirements.txt"
fi
echo "  Dependencies OK"
echo ""

# ── Kill any existing backend on port 8002 ──
EXISTING_PID=$(lsof -ti:8002 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
    echo "  Stopping existing process on port 8002 (PID $EXISTING_PID)..."
    kill "$EXISTING_PID" 2>/dev/null
    sleep 1
fi

# ═══════════════════════════════════════════════════════════════
#  START BACKEND (background)
# ═══════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════════"
echo "  STARTING BACKEND → http://localhost:8002"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd "$BACKEND_DIR"
python3 api/ai_server_v6.py &
BACKEND_PID=$!

# ── Wait for backend to be ready (max 15 seconds) ──
echo "  Waiting for backend..."
RETRIES=0
while [ $RETRIES -lt 30 ]; do
    if curl -s http://localhost:8002/ > /dev/null 2>&1; then
        echo "  Backend READY (PID $BACKEND_PID)"
        break
    fi
    RETRIES=$((RETRIES + 1))
    sleep 0.5
done

if [ $RETRIES -eq 30 ]; then
    echo "  WARNING: Backend may still be starting, launching frontend anyway..."
fi

echo ""

# ═══════════════════════════════════════════════════════════════
#  START FRONTEND (foreground — blocks until window closes)
# ═══════════════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════════════════"
echo "  STARTING ELECTRON FRONTEND"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Close the app window or press Ctrl+C to stop everything"
echo ""

cd "$PROJECT_DIR"

# ── Ensure Node.js is on PATH ──
export PATH="$HOME/local/node/bin:$PATH"

# ── Check Electron availability ──
ELECTRON_CMD=""
if command -v electron &>/dev/null; then
    ELECTRON_CMD="electron"
    echo "  Using: electron (global)"
elif npx electron --version &>/dev/null 2>&1; then
    ELECTRON_CMD="npx electron"
    echo "  Using: npx electron (local)"
elif [ -f "$PROJECT_DIR/node_modules/.bin/electron" ]; then
    ELECTRON_CMD="$PROJECT_DIR/node_modules/.bin/electron"
    echo "  Using: node_modules/.bin/electron (local)"
else
    echo "  ERROR: electron not found!"
    echo "  Fix:   npm install electron --save-dev"
    echo "         (or)  npm install -g electron"
    kill "$BACKEND_PID" 2>/dev/null
    exit 1
fi
echo ""

$ELECTRON_CMD app/main.js

# ═══════════════════════════════════════════════════════════════
#  CLEANUP — frontend closed, stop backend too
# ═══════════════════════════════════════════════════════════════
echo ""
echo "  Frontend closed. Stopping backend..."
kill "$BACKEND_PID" 2>/dev/null
wait "$BACKEND_PID" 2>/dev/null

echo ""
echo "  All stopped. Goodbye!"
echo ""
