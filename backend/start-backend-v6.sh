#!/bin/bash

# Backend V6 Startup Script
# ==========================

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🚀 STARTING AI ENGINE V6 BACKEND"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Navigate to project directory
cd ~/Documents/UpenderImp/roulette-tracker-complete

# Check if backend files exist
if [ ! -f "backend/api/ai_server_v6.py" ]; then
    echo "❌ ERROR: backend/api/ai_server_v6.py not found!"
    echo "   Please install V6 files first"
    exit 1
fi

if [ ! -f "backend/models/ai_engine_v6_NEW_STRATEGY.py" ]; then
    echo "❌ ERROR: backend/models/ai_engine_v6_NEW_STRATEGY.py not found!"
    echo "   Please install V6 files first"
    exit 1
fi

echo "✅ Backend files found"
echo ""

# Start the server
echo "🎬 Starting V6 server on http://localhost:8000"
echo "   Press Ctrl+C to stop"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

python3 backend/api/ai_server_v6.py
