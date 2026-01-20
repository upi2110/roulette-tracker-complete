"""
AI SERVER V2 - Updated API with new AI engine
Maintains backward compatibility while using improved methodology
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

# Import the new AI engine V4
from ai_engine_v4_FINAL import RouletteAIv4

app = FastAPI(title="Roulette AI Server V2")

# CORS for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
roulette_ai: Optional[RouletteAIv4] = None
session_state: Dict[str, Any] = {}


class TableData(BaseModel):
    table1Hits: Dict
    table2Hits: Dict
    table3Hits: Dict
    currentSpinCount: int
    recentSpins: Optional[List[int]] = []  # NOW REQUIRED!


class ResultData(BaseModel):
    bet_per_number: float
    hit: bool


class SessionConfig(BaseModel):
    starting_bankroll: float = 4000
    session_target: float = 100


@app.get("/")
async def root():
    return {
        "name": "Roulette AI Server V2",
        "version": "2.0",
        "status": "running",
        "engine": "Complete Methodology Implementation"
    }


@app.post("/start_session")
async def start_session(starting_bankroll: float = 4000, session_target: float = 100):
    global roulette_ai, session_state
    
    # Initialize new AI engine V4
    roulette_ai = RouletteAIv4()
    
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
        'started_at': datetime.now().isoformat()
    }
    
    print("=" * 70)
    print("SESSION STARTED - AI Engine V4 (Selective Methodology)")
    print("=" * 70)
    print(f"Bankroll: ${starting_bankroll}")
    print(f"Target: ${session_target}")
    print("Strategy: WAIT for 2-hit confirmation → VALIDATE → BET")
    print("=" * 70)
    
    return {
        "success": True,
        "message": "Session started with AI Engine V4 (Selective)",
        "bankroll": starting_bankroll,
        "target": session_target
    }


@app.post("/predict")
async def predict(data: Dict):  # Accept any dict for now
    global roulette_ai, session_state
    
    # Debug: Print what we received
    print("\n" + "=" * 60)
    print("RECEIVED PREDICTION REQUEST:")
    print(f"Keys in data: {list(data.keys())}")
    print(f"currentSpinCount: {data.get('currentSpinCount', 'MISSING')}")
    print(f"recentSpins: {data.get('recentSpins', 'MISSING')}")
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
    
    # Extract recent spins (CRITICAL - now enabled!)
    recent_spins = data.get('recentSpins', [])
    
    if not recent_spins:
        print("⚠️ WARNING: recentSpins is empty! Color trend analysis disabled!")
    
    # Get prediction from new AI engine
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
    
    # Calculate bet amount based on confidence and session state
    bet_amount = 0
    signal = "WAIT"
    
    if result['can_predict']:
        # Base bet is $2 minimum
        bet_amount = max(2, session_state.get('last_bet', 2))
        signal = "BET NOW"
        
        # Save for result processing
        session_state['last_prediction'] = result
        session_state['last_bet'] = bet_amount
    
    # Print thinking log to console
    print("\n" + "=" * 60)
    print("AI THINKING LOG:")
    print("=" * 60)
    for log_line in result.get('thinking_log', []):
        print(log_line)
    print("=" * 60 + "\n")
    
    return {
        "can_predict": result['can_predict'],
        "signal": signal,
        "confidence": result['confidence'],
        "numbers": result['numbers'],
        "anchor_groups": result.get('anchor_groups', []),
        "reasoning": result['reasoning'],
        "bet_per_number": bet_amount,
        "is_golden": result.get('is_golden', False),
        "strict_mode": result.get('strict_mode', False),
        "thinking_log": result.get('thinking_log', [])
    }


@app.post("/process_result")
async def process_result(result: ResultData):
    global roulette_ai, session_state
    
    if not roulette_ai:
        return {"success": False, "message": "No active session"}
    
    # Update AI learning
    roulette_ai.record_result(result.hit)
    
    # Update session state
    session_state['total_bets'] += 1
    
    if result.hit:
        session_state['total_wins'] += 1
        session_state['consecutive_losses'] = 0
        session_state['consecutive_wins'] = session_state.get('consecutive_wins', 0) + 1
        
        # Win payout (35:1 for single number hit, but we bet on 12 numbers)
        numbers_bet = len(session_state.get('last_prediction', {}).get('numbers', []))
        total_bet = result.bet_per_number * numbers_bet
        win_amount = result.bet_per_number * 36  # 35:1 + original bet
        net_change = win_amount - total_bet
        
        session_state['balance'] += net_change
        session_state['session_profit'] = session_state['balance'] - session_state['starting_bankroll']
        
        print(f"✅ WIN! Net: +${net_change:.2f}, Balance: ${session_state['balance']:.2f}")
    else:
        session_state['total_losses'] += 1
        session_state['consecutive_losses'] += 1
        session_state['consecutive_wins'] = 0
        
        # Loss
        numbers_bet = len(session_state.get('last_prediction', {}).get('numbers', []))
        total_bet = result.bet_per_number * numbers_bet
        
        session_state['balance'] -= total_bet
        session_state['session_profit'] = session_state['balance'] - session_state['starting_bankroll']
        
        print(f"❌ LOSS! Net: -${total_bet:.2f}, Balance: ${session_state['balance']:.2f}")
        print(f"   Consecutive losses: {session_state['consecutive_losses']}")
    
    # Calculate next bet (simple progression for now)
    if result.hit:
        session_state['last_bet'] = max(2, session_state['last_bet'] - 1)
    else:
        session_state['last_bet'] = session_state['last_bet'] + 1
    
    return {
        "success": True,
        "bankroll": session_state['balance'],
        "session_profit": session_state['session_profit'],
        "next_bet": session_state['last_bet'],
        "consecutive_losses": session_state['consecutive_losses']
    }


@app.post("/reset")
async def reset_session():
    global roulette_ai, session_state
    
    if roulette_ai:
        roulette_ai.clear_session_history()
    
    session_state = {}
    
    print("🔄 Session reset")
    
    return {"success": True, "message": "Session reset"}


@app.get("/status")
async def get_status():
    global roulette_ai, session_state
    
    if not session_state:
        return {"active": False}
    
    status = {
        "active": True,
        "balance": session_state.get('balance', 0),
        "session_profit": session_state.get('session_profit', 0),
        "total_bets": session_state.get('total_bets', 0),
        "total_wins": session_state.get('total_wins', 0),
        "total_losses": session_state.get('total_losses', 0),
        "consecutive_losses": session_state.get('consecutive_losses', 0)
    }
    
    # Add AI learning stats
    if roulette_ai and len(roulette_ai.prediction_history) >= 10:
        recent = roulette_ai.prediction_history[-20:]
        wins = sum(1 for p in recent if p.get('hit') == True)
        losses = sum(1 for p in recent if p.get('hit') == False)
        
        if wins + losses > 0:
            status['ai_win_rate'] = wins / (wins + losses)
            status['ai_recent_wins'] = wins
            status['ai_recent_losses'] = losses
    
    return status


if __name__ == "__main__":
    print("=" * 70)
    print("🚀 Roulette AI Server V4 - Selective Methodology")
    print("=" * 70)
    print("Starting server on http://127.0.0.1:8000")
    print("")
    print("Features:")
    print("  ✅ WAIT for 2-hit pattern confirmation")
    print("  ✅ Table 3 primary pattern detection")
    print("  ✅ Cross-validation with Table 1, 2, ref 0/19")
    print("  ✅ Table 1 special: 2 columns with 2 hits = 4 anchors")
    print("  ✅ Extract 24 numbers → validate → select 4 best → 12 final")
    print("  ✅ Detailed thinking logs")
    print("  ✅ Emotion-free execution")
    print("")
    print("Discipline: NO betting without 2-hit confirmation!")
    print("Goal: $1000/day with maximum selectivity")
    print("=" * 70)
    
    uvicorn.run(app, host="127.0.0.1", port=8000)