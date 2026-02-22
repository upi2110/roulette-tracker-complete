"""
AI Server V6 - NEW STRATEGY
============================

API server for the new prediction strategy
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import uvicorn
import sys
import os

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

# Import the new engine
from models.ai_engine_v6_NEW_STRATEGY import predict, process_result

app = FastAPI(title="Roulette Tracker AI Server V6")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session state
session_state = {
    'bankroll': 4000,
    'target': 100,
    'starting_bankroll': 4000,
    'bets_placed': 0,
    'wins': 0,
    'losses': 0
}


class TableData(BaseModel):
    """Request model for predictions"""
    table3Hits: Dict
    table3NextProjections: Dict  # NEW!
    table1Hits: Dict
    table2Hits: Dict
    currentSpinCount: int
    recentSpins: List[int]


class BetResult(BaseModel):
    """Request model for bet results"""
    bet_per_number: float
    hit: bool


@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "AI Server V6 Running",
        "version": "6.0",
        "strategy": "Common Numbers from Top 2 Pairs",
        "engine": "NEW STRATEGY"
    }


@app.post("/predict")
async def get_prediction(data: TableData):
    """
    Get prediction using new strategy
    
    Expected data:
    - table3Hits: Historical hits from Table 3
    - table3NextProjections: Projections for NEXT spin (NEW!)
    - table1Hits: Historical hits from Table 1
    - table2Hits: Historical hits from Table 2
    - currentSpinCount: Number of spins
    - recentSpins: Last 10 spins
    """
    
    try:
        print("\n" + "="*80)
        print("📥 RECEIVED PREDICTION REQUEST")
        print("="*80)
        print(f"Current spin count: {data.currentSpinCount}")
        print(f"Recent spins: {data.recentSpins}")
        print(f"Table 3 historical hits: {len(data.table3Hits)} types")
        print(f"Table 3 NEXT projections: {len(data.table3NextProjections)} types")
        
        # Convert Pydantic model to dict
        table_data = {
            'table3Hits': data.table3Hits,
            'table3NextProjections': data.table3NextProjections,
            'table1Hits': data.table1Hits,
            'table2Hits': data.table2Hits,
            'currentSpinCount': data.currentSpinCount,
            'recentSpins': data.recentSpins
        }
        
        # Get prediction from engine
        prediction = predict(table_data)
        
        # Calculate bet amount based on bankroll
        if prediction['signal'] == 'BET NOW':
            num_count = len(prediction['numbers'])
            available = session_state['bankroll']
            bet_per_number = max(1, min(available / (num_count * 10), 10))
            prediction['bet_per_number'] = round(bet_per_number, 2)
        else:
            prediction['bet_per_number'] = 0
        
        print("\n📤 SENDING RESPONSE TO FRONTEND:")
        print(f"   Signal: {prediction['signal']}")
        print(f"   Numbers: {len(prediction['numbers'])} numbers")
        print(f"   Full pool: {len(prediction['full_pool'])} numbers")
        print(f"   Confidence: {prediction['confidence']}%")
        print(f"   Bet per number: ${prediction['bet_per_number']}")
        print("="*80)
        
        return prediction
        
    except Exception as e:
        print(f"\n❌ ERROR in prediction: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/start_session")
async def start_session(starting_bankroll: int = 4000, session_target: int = 100):
    """
    Start a new betting session
    """
    session_state['bankroll'] = starting_bankroll
    session_state['starting_bankroll'] = starting_bankroll
    session_state['target'] = session_target
    session_state['bets_placed'] = 0
    session_state['wins'] = 0
    session_state['losses'] = 0
    
    print("\n✅ SESSION STARTED:")
    print(f"   Starting bankroll: ${starting_bankroll}")
    print(f"   Target: ${session_target}")
    
    return {
        "status": "session_started",
        "bankroll": session_state['bankroll'],
        "target": session_state['target']
    }


@app.post("/process_result")
async def process_bet_result(result: BetResult):
    """
    Process the result of a bet
    """
    try:
        num_numbers = result.num_numbers if hasattr(result, 'num_numbers') else 12
        total_bet = result.bet_per_number * num_numbers
        
        if result.hit:
            # Win: 35:1 payout minus total bet
            profit = (35 * result.bet_per_number) - total_bet
            session_state['bankroll'] += profit
            session_state['wins'] += 1
            print(f"\n✅ HIT! Profit: ${profit:.2f}")
        else:
            # Loss: lose total bet
            profit = -total_bet
            session_state['bankroll'] -= total_bet
            session_state['losses'] += 1
            print(f"\n❌ MISS! Loss: ${total_bet:.2f}")
        
        session_state['bets_placed'] += 1
        
        # Update engine with bet result AND profit/loss
        process_result(result.hit, total_bet, profit)
        
        print(f"   Bankroll: ${session_state['bankroll']:.2f}")
        print(f"   Win rate: {session_state['wins']}/{session_state['bets_placed']}")
        
        return {
            "status": "result_processed",
            "bankroll": round(session_state['bankroll'], 2),
            "profit": round(session_state['bankroll'] - session_state['starting_bankroll'], 2),
            "wins": session_state['wins'],
            "losses": session_state['losses'],
            "bets_placed": session_state['bets_placed']
        }
        
    except Exception as e:
        print(f"\n❌ ERROR processing result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/status")
async def get_status():
    """
    Get current session status
    """
    return {
        "bankroll": round(session_state['bankroll'], 2),
        "starting_bankroll": session_state['starting_bankroll'],
        "target": session_state['target'],
        "profit": round(session_state['bankroll'] - session_state['starting_bankroll'], 2),
        "bets_placed": session_state['bets_placed'],
        "wins": session_state['wins'],
        "losses": session_state['losses']
    }


@app.post("/reset")
async def reset_session():
    """
    Reset session to initial state
    """
    session_state['bankroll'] = session_state['starting_bankroll']
    session_state['bets_placed'] = 0
    session_state['wins'] = 0
    session_state['losses'] = 0
    
    print("\n🔄 SESSION RESET")
    
    return {
        "status": "session_reset",
        "bankroll": session_state['bankroll']
    }


if __name__ == "__main__":
    print("\n" + "="*80)
    print("🚀 AI SERVER V6 - NEW STRATEGY")
    print("="*80)
    print("Strategy: Common Numbers from Top 2 Pairs")
    print("Uses NEXT row projections (white boxes)")
    print("="*80)
    print("\nStarting server on http://localhost:8002")
    print("API Documentation: http://localhost:8002/docs")
    print("\n" + "="*80)
    
    uvicorn.run(app, host="127.0.0.1", port=8002)
