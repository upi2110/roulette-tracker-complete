#!/bin/bash

# AI Server Startup Script
# Starts the FastAPI backend for Roulette AI

echo "🚀 Starting Roulette AI Server..."
echo ""

# Check if we're in the backend directory
if [ ! -d "models" ] || [ ! -d "api" ]; then
    echo "❌ Error: Please run this script from the backend/ directory"
    echo "Current directory: $(pwd)"
    echo "Expected structure:"
    echo "  backend/"
    echo "    ├── api/"
    echo "    │   └── ai_server.py"
    echo "    ├── models/"
    echo "    │   └── ai_engine.py"
    exit 1
fi

# Check if ai_server.py exists
if [ ! -f "api/ai_server.py" ]; then
    echo "❌ Error: ai_server.py not found in api/ directory!"
    echo "Please make sure ai_server.py is in backend/ directory"
    exit 1
fi

# Activate virtual environment
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/venv"
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
    echo "🐍 Virtual env: $VENV_DIR (activated)"
else
    echo "⚠️  No virtual environment found at $VENV_DIR"
    echo "   Run:  python3 -m venv ../venv && source ../venv/bin/activate && pip install -r requirements.txt"
fi

# Check Python version
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

# Start the server
echo "🚀 Starting AI Server on http://localhost:8002"
echo "📡 Press Ctrl+C to stop"
echo ""
echo "==============================================="
echo ""

# Run the server
# Simpler - just run the correct file:
python3 api/ai_server.py

# If server stops
echo ""
echo "Server stopped."
