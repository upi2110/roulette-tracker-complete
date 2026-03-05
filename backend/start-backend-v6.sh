#!/bin/bash

# Backend V6 Startup Script
# ==========================

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🚀 STARTING AI ENGINE V6 BACKEND"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Navigate to backend directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "📂 Working directory: $(pwd)"
echo ""

# Check if backend files exist
if [ ! -f "api/ai_server_v6.py" ]; then
    echo "❌ ERROR: api/ai_server_v6.py not found!"
    echo "   Please run this script from the backend/ directory"
    exit 1
fi

if [ ! -f "models/ai_engine_v6_NEW_STRATEGY.py" ]; then
    echo "❌ ERROR: models/ai_engine_v6_NEW_STRATEGY.py not found!"
    exit 1
fi

echo "✅ Backend files found"
echo ""

# Activate virtual environment
VENV_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/venv"
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
    echo "🐍 Virtual env: $VENV_DIR (activated)"
else
    echo "⚠️  No virtual environment found at $VENV_DIR"
    echo "   Run:  python3 -m venv ../venv && source ../venv/bin/activate && pip install -r requirements.txt"
fi

# Check Python version
echo "🐍 Python version:"
python3 --version
echo ""

# Check if required packages are installed
echo "📦 Checking dependencies..."
python3 -c "import fastapi, uvicorn, pydantic" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Missing dependencies. Installing..."
    pip install -r "$SCRIPT_DIR/requirements.txt"
    echo ""
fi
echo "✅ Dependencies OK"
echo ""

# Start the server
echo "🎬 Starting V6 server on http://localhost:8002"
echo "   Press Ctrl+C to stop"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

python3 api/ai_server_v6.py

echo ""
echo "Server stopped."
