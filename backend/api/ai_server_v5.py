"""
AI SERVER V5 - Updated API with V5 AI Engine
=============================================

Compatible with existing frontend
Now uses V5 engine with user's exact methodology

Author: Claude (Anthropic)
Date: January 11, 2026
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
from datetime import datetime
import sys
import os

# Add the backend/models directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'models'))

# Import the V5 AI engine
from ai_engine_v5 import RouletteAIv5

app = FastAPI(title="Roulette AI Server V5")

# CORS for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global AI instance and session state
roulette_ai = None
session_state = {}


@app.get("/")
async def root():
    return {
        "name": "Roulette AI Server V5",
        "version": "5.0",
        "status": "running",
        "engine": "User's Exact Methodology - Smart Selection"
    }


@app.post("/start_session")
async def start_session(starting_bankroll: float = 4000, session_target: float = 100):
    global roulette_ai, session_state
    
    # Initialize new AI engine V5
    roulette_ai = RouletteAIv5()
    
    # Initialize session state
    session_state = {
        'balance': starting_bankroll,
        'starting_bankroll': starting_bankroll,
        'session_target': session_target,
        'session_profit': 0,
        'total_bets': 0,
        'total_wins': 0,
        'total_losses': 0,
        'consecutive_losses': 0,
        'consecutive_wins': 0,
        'wait_streak_hits': 0,  # NEW: Track WAIT prediction streak
        'started_at': datetime.now().isoformat()
    }
    
    print("=" * 70)
    print("SESSION STARTED - AI Engine V5 (User's Exact Methodology)")
    print("=" * 70)
    print(f"Bankroll: ${starting_bankroll}")
    print(f"Target: ${session_target}")
    print("Strategy:")
    print("  1. Find 2-hit patterns with consistency")
    print("  2. Smart anchor selection (3-4 anchors)")
    print("  3. Common numbers & side preference analysis")
    print("  4. Golden patterns when bankroll < $3000")
    print("=" * 70)
    
    return {
        "success": True,
        "message": "Session started with AI Engine V5",
        "bankroll": starting_bankroll,
        "target": session_target
    }


@app.post("/predict")
async def predict(data: Dict):  # Accept any dict
    global roulette_ai, session_state
    
    # Debug: Print what we received
    print("\n" + "=" * 60)
    print("RECEIVED PREDICTION REQUEST:")
    print(f"Keys in data: {list(data.keys())}")
    print(f"currentSpinCount: {data.get('currentSpinCount', 'MISSING')}")
    print(f"recentSpins count: {len(data.get('recentSpins', []))}")
    print("=" * 60)
    
    if not roulette_ai:
        return {
            "can_predict": False,
            "signal": "WAIT",
            "confidence": 0,
            "numbers": [],
            "reasoning": ["Session not started"],
            "bet_per_number": 0,
            "thinking_log": []
        }
    
    # Extract recent spins
    recent_spins = data.get('recentSpins', [])
    
    if not recent_spins:
        print("⚠️ WARNING: recentSpins is empty!")
    
    # Get prediction from V5 AI engine
    result = roulette_ai.predict_numbers(
        table_data={
            'table1Hits': data.get('table1Hits', {}),
            'table2Hits': data.get('table2Hits', {}),
            'table3Hits': data.get('table3Hits', {}),
            'currentSpinCount': data.get('currentSpinCount', 0)
        },
        recent_spins=recent_spins,
        session_state=session_state
    )
    
    # LOG WHAT ENGINE RETURNED
    print(f"\n🔍 ENGINE RETURNED:")
    print(f"  signal: '{result.get('signal', 'MISSING')}'")
    print(f"  bet_per_number: {result.get('bet_per_number', 'MISSING')}")
    print(f"  can_predict: {result.get('can_predict', 'MISSING')}")
    print(f"  confidence: {result.get('confidence', 'MISSING'):.0%}")
    
    # Use engine's decision (don't override!)
    signal = result['signal']  # WAIT or BET NOW from engine
    bet_amount = result['bet_per_number']  # 0 for WAIT, 4.0 for BET
    
    print(f"\n🎯 USING FROM ENGINE:")
    print(f"  signal: '{signal}'")
    print(f"  bet_amount: ${bet_amount}")
    
    # Save for result processing
    session_state['last_prediction'] = result
    session_state['last_bet'] = bet_amount
    
    # Separate anchors from all numbers for frontend display
    all_numbers = result['numbers']
    anchors = result.get('anchors', [])
    
    # Return prediction
    response = {
        "can_predict": result['can_predict'],
        "signal": signal,
        "confidence": result['confidence'],
        "numbers": all_numbers,
        "anchors": anchors,  # Send as separate field for coloring
        "anchor_groups": [anchors],  # Also in array format
        "reasoning": result['reasoning'],
        "bet_per_number": bet_amount,
        "is_golden": result.get('is_golden', False),
        "wait_streak_hits": result.get('wait_streak_hits', 0)  # NEW: Send streak info
    }
    
    print(f"\n📤 Sending to frontend:")
    print(f"  signal: {signal}")
    print(f"  can_predict: {result['can_predict']}")
    print(f"  numbers: {len(all_numbers)} numbers")
    print(f"  anchors: {anchors}")
    print(f"  confidence: {result['confidence']:.0%}")
    print(f"  wait_streak: {result.get('wait_streak_hits', 0)}")
    
    return response


@app.post("/process_result")
async def process_result(data: Dict):
    global session_state
    
    # Extract parameters from body
    actual = data.get('actual')
    bet_per_number = data.get('bet_per_number')
    hit = data.get('hit')
    
    print(f"\n💰 Processing result: actual={actual}, bet={bet_per_number}, hit={hit}")
    
    if not session_state:
        return {"success": False, "error": "No active session"}
    
    # Calculate profit/loss
    last_prediction = session_state.get('last_prediction', {})
    numbers = last_prediction.get('numbers', [])
    signal = last_prediction.get('signal', 'WAIT')
    
    if not numbers:
        return {"success": False, "error": "No prediction to process"}
    
    # Check if we were actually betting (BET NOW) or just tracking (WAIT)
    was_betting = (signal == 'BET NOW' and bet_per_number > 0)
    
    # Calculate result
    total_bet = bet_per_number * len(numbers)
    
    if was_betting:
        # ACTUAL BET MODE
        if hit:
            # Win: 35:1 payout on winning number
            win_amount = bet_per_number * 36  # Bet back + 35x
            net = win_amount - total_bet
            
            session_state['balance'] += net
            session_state['total_wins'] += 1
            session_state['consecutive_wins'] += 1
            session_state['consecutive_losses'] = 0
            session_state['wait_streak_hits'] = 0  # Reset WAIT streak when betting
            
            print(f"✅ WIN! Net: +${net:.2f}, Balance: ${session_state['balance']:.2f}")
            print(f"   Consecutive wins: {session_state['consecutive_wins']}")
        else:
            # Loss: Lose the bet
            net = -total_bet
            
            session_state['balance'] += net
            session_state['total_losses'] += 1
            session_state['consecutive_losses'] += 1
            session_state['consecutive_wins'] = 0
            session_state['wait_streak_hits'] = 0  # Reset WAIT streak when betting
            
            print(f"❌ LOSS! Net: ${net:.2f}, Balance: ${session_state['balance']:.2f}")
            print(f"   Consecutive losses: {session_state['consecutive_losses']}")
    else:
        # WAIT MODE - Track predictions without betting
        print(f"📊 WAIT MODE - Tracking prediction (not betting)")
        
        if hit:
            # WAIT prediction HIT!
            session_state['wait_streak_hits'] = session_state.get('wait_streak_hits', 0) + 1
            print(f"🔥 WAIT PREDICTION HIT! Streak: {session_state['wait_streak_hits']}")
            
            if session_state['wait_streak_hits'] >= 2:
                print(f"✅ STREAK CONFIRMED! Next prediction will upgrade to BET NOW")
        else:
            # WAIT prediction MISS - Reset streak
            session_state['wait_streak_hits'] = 0
            print(f"❌ WAIT PREDICTION MISS - Streak reset to 0")
    
    session_state['total_bets'] += 1
    session_state['session_profit'] = session_state['balance'] - session_state['starting_bankroll']
    
    return {
        "success": True,
        "balance": session_state['balance'],
        "session_profit": session_state['session_profit'],
        "consecutive_losses": session_state['consecutive_losses'],
        "consecutive_wins": session_state['consecutive_wins'],
        "wait_streak_hits": session_state.get('wait_streak_hits', 0)  # NEW: Send streak to frontend
    }


@app.get("/session_stats")
async def get_session_stats():
    if not session_state:
        return {"error": "No active session"}
    
    win_rate = 0
    if session_state['total_bets'] > 0:
        win_rate = (session_state['total_wins'] / session_state['total_bets']) * 100
    
    return {
        "balance": session_state['balance'],
        "starting_bankroll": session_state['starting_bankroll'],
        "session_profit": session_state['session_profit'],
        "session_target": session_state['session_target'],
        "total_bets": session_state['total_bets'],
        "total_wins": session_state['total_wins'],
        "total_losses": session_state['total_losses'],
        "win_rate": round(win_rate, 1),
        "consecutive_losses": session_state['consecutive_losses'],
        "consecutive_wins": session_state['consecutive_wins']
    }


if __name__ == "__main__":
    print("=" * 70)
    print("🚀 Roulette AI Server V5 - WITH STREAK TRACKING")
    print("=" * 70)
    print("Starting server on http://127.0.0.1:8000")
    print()
    print("NEW Features:")
    print("  ✅ ALWAYS shows predictions (even when WAIT)")
    print("  ✅ Tracks prediction accuracy without betting")
    print("  ✅ Auto-upgrades WAIT→BET after 2+ consecutive hits")
    print("  ✅ Streak-based confidence building")
    print("  ✅ Strict loss management (3+ losses = perfect setup)")
    print("  ✅ Always generates exactly 12 numbers (or 13 with 0/26)")
    print()
    print("Goal: Build confidence through streaks, then bet!")
    print("=" * 70)
    print()
    
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")