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

# Check if backend is running
echo "🔍 Checking if backend is running..."
if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "✅ Backend is running on http://localhost:8000"
else
    echo "⚠️  WARNING: Backend not detected!"
    echo "   Please start backend first: ./start-backend-v6.sh"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "🎬 Starting Electron app..."
echo "   The app window will open shortly"
echo "   Press Ctrl+C in this terminal to stop"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

npm start
