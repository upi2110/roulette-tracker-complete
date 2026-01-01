"""
AI Server - FastAPI Backend
Connects ai_engine.py predictions to Electron frontend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import sys
import os

# Add models directory to path
sys.path.append(os.path.dirname(__file__))
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# Import AI engine
try:
    from models.ai_engine import RouletteAI, MoneyManager
    print("✅ AI Engine imported successfully")
except ImportError as e:
    print(f"❌ Failed to import AI Engine: {e}")
    RouletteAI = None
    MoneyManager = None

app = FastAPI(title="Roulette AI Server")

# CORS for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
ai_engine = RouletteAI() if RouletteAI else None
money_manager = None

# Request models
class SpinHistory(BaseModel):
    spin_history: List[Dict[str, Any]]

class BetResult(BaseModel):
    bet_per_number: float
    hit: bool

@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "AI Server Running",
        "engine_loaded": ai_engine is not None,
        "version": "1.0.0"
    }

@app.post("/predict")
async def get_prediction(data: SpinHistory):
    """
    Get AI prediction for next spin
    Returns: numbers, confidence, reasoning, anchor_groups, etc.
    """
    if not ai_engine:
        raise HTTPException(status_code=500, detail="AI Engine not loaded")
    
    spins = data.spin_history
    
    if len(spins) < 3:
        return {
            "can_predict": False,
            "signal": "WAIT",
            "confidence": 0,
            "numbers": [],
            "reasoning": ["Need at least 3 spins to make prediction"],
            "anchor_groups": [],
            "hot_projections": [],
            "bet_per_number": 0
        }
    
    # Get prediction from AI engine
    try:
        predicted_numbers, confidence, reasoning = ai_engine.predict_numbers(spins)
        
        # Get Table3 analysis for detailed info
        table3_analysis = ai_engine.analyze_table3_patterns(spins)
        
        # Expand anchors to get groups
        anchor_groups = []
        if table3_analysis['anchors']:
            anchor_groups = ai_engine.expand_anchors_to_neighbors(
                table3_analysis['anchors'][:4],
                count=4
            )
        
        # Calculate bet size
        bet_per_number = 0
        if money_manager and confidence >= 0.75:
            bet_per_number = money_manager.calculate_bet_size(confidence)
        elif confidence >= 0.75:
            # Fallback calculation if no money manager
            base_bet = 3
            if confidence >= 0.90:
                bet_per_number = base_bet * 1.3
            elif confidence >= 0.85:
                bet_per_number = base_bet * 1.2
            elif confidence >= 0.80:
                bet_per_number = base_bet * 1.1
            else:
                bet_per_number = base_bet
        
        # Format response
        response = {
            "can_predict": len(predicted_numbers) > 0,
            "signal": "BET NOW" if confidence >= 0.75 else "WAIT",
            "confidence": confidence,  # Already 0-1 range
            "numbers": predicted_numbers,
            "reasoning": reasoning,
            "anchor_groups": anchor_groups,
            "hot_projections": table3_analysis.get('hot_projections', []),
            "bet_per_number": round(bet_per_number, 2)
        }
        
        print(f"📊 Prediction generated:")
        print(f"   Confidence: {confidence*100:.1f}%")
        print(f"   Numbers: {predicted_numbers}")
        print(f"   Bet size: ${bet_per_number:.2f}")
        
        return response
        
    except Exception as e:
        print(f"❌ Prediction error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/start_session")
async def start_session(starting_bankroll: float = 4000, session_target: float = 100):
    """Start new betting session"""
    global money_manager
    
    if not MoneyManager:
        raise HTTPException(status_code=500, detail="Money Manager not loaded")
    
    try:
        money_manager = MoneyManager(
            initial_bankroll=starting_bankroll,
            session_target=session_target
        )
        
        print(f"✅ Session started: ${starting_bankroll} bankroll, ${session_target} target")
        
        return {
            "success": True,
            "message": "Session started",
            "bankroll": starting_bankroll,
            "target": session_target
        }
    except Exception as e:
        print(f"❌ Start session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_result")
async def process_result(data: BetResult):
    """Process bet result and update money manager"""
    if not money_manager:
        raise HTTPException(status_code=400, detail="No active session")
    
    try:
        result = money_manager.process_result(
            bet_per_number=data.bet_per_number,
            hit=data.hit
        )
        
        print(f"{'✅ HIT' if data.hit else '❌ MISS'}: ${data.bet_per_number}/number")
        print(f"   Bankroll: ${result['bankroll']:.2f}")
        print(f"   Profit: ${result['session_profit']:.2f}")
        
        return result
    except Exception as e:
        print(f"❌ Process result error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status")
async def get_status():
    """Get current session status"""
    if not money_manager:
        return {
            "active": False,
            "message": "No active session"
        }
    
    try:
        status = money_manager.get_status()
        status['active'] = True
        return status
    except Exception as e:
        print(f"❌ Get status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/session_report")
async def get_session_report():
    """Get detailed session report"""
    if not money_manager:
        raise HTTPException(status_code=400, detail="No active session")
    
    try:
        status = money_manager.get_status()
        return {
            "session_active": True,
            "starting_bankroll": money_manager.initial_bankroll,
            "current_bankroll": status['bankroll'],
            "session_profit": status['session_profit'],
            "session_target": status['session_target'],
            "total_spins": status['total_spins'],
            "total_wins": status['total_wins'],
            "total_losses": status['total_losses'],
            "win_rate": status['win_rate'],
            "consecutive_losses": status['consecutive_losses'],
            "target_reached": status['session_complete']
        }
    except Exception as e:
        print(f"❌ Get report error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reset_session")
async def reset_session():
    """Reset session"""
    global money_manager
    money_manager = None
    
    print("🔄 Session reset")
    
    return {
        "success": True,
        "message": "Session reset"
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting AI Server on http://localhost:8000")
    print("📡 Endpoints:")
    print("   GET  /           - Health check")
    print("   POST /predict    - Get prediction")
    print("   POST /start_session - Start session")
    print("   POST /process_result - Process bet result")
    print("   GET  /status     - Get session status")
    print("   GET  /session_report - Get detailed report")
    print("   POST /reset_session - Reset session")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
