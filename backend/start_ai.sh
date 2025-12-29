#!/bin/bash
echo "🚀 Starting Roulette AI Server..."
echo "📡 Server: http://localhost:8000"
echo "📚 Docs: http://localhost:8000/docs"
echo ""
cd "$(dirname "$0")"
python3 -m uvicorn api.ai_server:app --host 0.0.0.0 --port 8000 --reload
