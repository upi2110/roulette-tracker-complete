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
if [ ! -f "ai_server.py" ]; then
    echo "❌ Error: ai_server.py not found in current directory!"
    echo "Please make sure ai_server.py is in backend/ directory"
    exit 1
fi

# Check Python version
python3 --version
echo ""

# Check if required packages are installed
echo "📦 Checking dependencies..."
python3 -c "import fastapi, uvicorn, pydantic" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Missing dependencies. Installing..."
    pip3 install fastapi uvicorn pydantic --break-system-packages
    echo ""
fi

# Start the server
echo "🚀 Starting AI Server on http://localhost:8000"
echo "📡 Press Ctrl+C to stop"
echo ""
echo "==============================================="
echo ""

# Run the server
python3 ai_server.py

# If server stops
echo ""
echo "Server stopped."
