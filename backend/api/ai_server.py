"""
AI Server - Updated to pass recent spins for color trend analysis
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import sys
import os

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, parent_dir)

from models.ai_engine import RouletteAI, MoneyManager

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
roulette_ai = None
money_manager = None

class TableData(BaseModel):
    table1Hits: Dict[str, List[Dict[str, Any]]]
    table2Hits: Dict[str, List[Dict[str, Any]]]
    table3Hits: Dict[str, List[Dict[str, Any]]]
    currentSpinCount: int
    recentSpins: Optional[List[int]] = None
    
    class Config:
        extra = "allow"  # Allow extra fields without error

class ResultData(BaseModel):
    bet_per_number: float  # CHANGED from betPerNumber
    hit: bool

@app.get("/")
async def root():
    return {
        "status": "running",
        "message": "Roulette AI Server with YOUR methodology",
        "features": [
            "4 anchors + 8 neighbors = 12 numbers",
            "Multi-table pattern analysis",
            "Green/Black color trend",
            "Learning system with confidence calibration"
        ]
    }

@app.post("/start_session")
async def start_session(starting_bankroll: int = 4000, session_target: int = 100):
    global money_manager, roulette_ai
    
    money_manager = MoneyManager(starting_bankroll, session_target)
    roulette_ai = RouletteAI()
    
    print(f"✅ Session started: ${starting_bankroll} bankroll, ${session_target} target")
    print("✅ AI Engine initialized")
    
    return {
        "success": True,
        "message": "Session started",
        "bankroll": starting_bankroll,
        "target": session_target
    }

@app.post("/predict")
async def predict(data: TableData):
    if not roulette_ai:
        return {
            "can_predict": False,
            "signal": "WAIT",
            "confidence": 0,
            "numbers": [],
            "reasoning": ["Session not started"],
            "bet_amount": 0
        }
    
    # Extract recent spins for color trend analysis (handle missing field)
    recent_spins = getattr(data, 'recentSpins', None) or []
    
    # Get prediction
    numbers, confidence, reasoning, anchor_groups = roulette_ai.predict_numbers(
        data.dict(),
        recent_spins=recent_spins
    )
    
    # Calculate bet size
    bet_amount = 0
    signal = "WAIT"
    
    if money_manager and len(numbers) > 0:
        bet_amount = money_manager.calculate_bet_size(confidence)
        print(f"💰 Bet calculation: {len(numbers)} numbers, {confidence*100:.0f}% conf → ${bet_amount}/number")
        if bet_amount > 0:
            signal = "BET NOW"
        else:
            print(f"⚠️ Bet amount is 0! Check confidence threshold or consecutive losses")
    else:
        if not money_manager:
            print(f"⚠️ No money_manager instance!")
        if len(numbers) == 0:
            print(f"⚠️ No numbers predicted!")
    
    can_predict = len(numbers) > 0 and bet_amount > 0

    # Determine betting state
    betting_state = "WAIT"
    state_reason = ""
    confidence_threshold = 0.70

    if money_manager:
        # After 3 losses, require 75% confidence
        if money_manager.consecutive_losses >= 3:
            confidence_threshold = 0.75
            
    if len(numbers) == 0:
        betting_state = "BUILDING"
        state_reason = "Building pattern database (need 3+ spins)"
    elif confidence < confidence_threshold:
        betting_state = "WAIT_CONFIDENCE"
        state_reason = f"Need {confidence_threshold*100:.0f}% confidence (current: {confidence*100:.0f}%)"
    elif bet_amount > 0:
        betting_state = "BET_NOW"
        state_reason = f"Ready to bet: {len(numbers)} numbers at {confidence*100:.0f}% confidence"
    else:
        betting_state = "WAIT"
        state_reason = "Waiting for better patterns"

    print(f"📊 Prediction: {len(numbers)} numbers, {confidence*100:.0f}% confidence")
    print(f"🎯 Betting state: {betting_state} - {state_reason}")

    return {
        "can_predict": can_predict,
        "signal": signal,
        "betting_state": betting_state,  # NEW
        "state_reason": state_reason,     # NEW
        "confidence": confidence,
        "confidence_threshold": confidence_threshold,  # NEW
        "numbers": numbers,
        "anchor_groups": anchor_groups,
        "reasoning": reasoning,
        "bet_per_number": bet_amount,
        "consecutive_losses": money_manager.consecutive_losses if money_manager else 0  # NEW
    }

@app.post("/process_result")
async def process_result(result: ResultData):
    if not money_manager:
        return {"success": False, "message": "No active session"}
    
    # Update learning history with result
    if roulette_ai and len(roulette_ai.prediction_history) > 0:
        roulette_ai.prediction_history[-1]['hit'] = result.hit
        roulette_ai.save_history()
    
    status = money_manager.process_result(result.bet_per_number, result.hit)
    
    return {
        "success": True,
        "bankroll": status['bankroll'],
        "session_profit": status['session_profit'],
        "next_bet": status['next_bet'],
        "consecutive_losses": status['consecutive_losses']
    }

@app.get("/status")
async def get_status():
    if not money_manager:
        return {"active": False}
    
    status = money_manager.get_status()
    
    # Add AI learning stats
    if roulette_ai and len(roulette_ai.prediction_history) >= 10:
        recent = roulette_ai.prediction_history[-20:]
        wins = sum(1 for p in recent if p.get('hit') == True)
        losses = sum(1 for p in recent if p.get('hit') == False)
        
        status['recent_accuracy'] = wins / (wins + losses) if (wins + losses) > 0 else 0
        status['total_predictions'] = len(roulette_ai.prediction_history)
    
    return status

@app.post("/reset")
async def reset_session():
    global money_manager, roulette_ai
    if money_manager:
        money_manager.reset()
    if roulette_ai:
            roulette_ai.clear_learning_history()  # Clear AI learning on reset
    return {"success": True, "message": "Session reset"}

@app.post("/reset_session")
async def reset_session_endpoint():
    return await reset_session()

@app.post("/undo")
async def undo_last_action(request: dict = None):
    """Undo bet for a specific spin number"""
    try:
        if not money_manager:
            return {"success": False, "error": "No active session"}
        
        # Get spin number from request (optional)
        spin_number = None
        if request and 'spin_number' in request:
            spin_number = request['spin_number']
        
        # If spin number provided, undo that specific bet
        if spin_number is not None:
            result = money_manager.undo_bet_for_spin(spin_number)
        else:
            # Otherwise, undo last bet (backward compatibility)
            result = money_manager.undo_last_bet()
        
        if not result['success']:
            return result
        
        print(f"✅ Undo successful: Bankroll restored to ${result['status']['bankroll']}")
        
        return {
            "success": True,
            "message": "Bet reverted successfully",
            "reverted_bet": {
                "amount": result['reverted_bet']['total_bet'],
                "hit": result['reverted_bet']['hit'],
                "spin_number": result['reverted_bet'].get('spin_number')
            },
            "status": result['status']
        }
        
    except Exception as e:
        import traceback
        print(f"❌ Undo error: {str(e)}")
        traceback.print_exc()
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    
    print("🎰 Starting Roulette AI Server...")
    print("📊 Using YOUR Complete Methodology:")
    print("   - 4 anchors + 8 neighbors = 12 numbers")
    print("   - NO 13-opposites")
    print("   - Multi-table scoring")
    print("   - Green/Black color trend")
    print("   - Learning system with calibration")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)