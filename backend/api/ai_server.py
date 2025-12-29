"""
FastAPI Backend Server for Roulette AI
Handles real-time predictions and money management
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from models.ai_engine import RouletteAI, MoneyManager
import json

app = FastAPI(title="Roulette AI API")

# Enable CORS for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global AI and Money Manager instances
ai_engine = RouletteAI()
money_manager = MoneyManager()

# Session state
session_state = {
    'active': False,
    'session_id': None,
    'spin_history': [],
    'predictions_made': [],
    'auto_bet_enabled': False
}


class SpinData(BaseModel):
    actual: int
    direction: str


class PredictionRequest(BaseModel):
    spin_history: List[dict]


class BetResult(BaseModel):
    bet_per_number: float
    hit: bool


@app.get("/")
def root():
    return {"status": "AI Server Running", "version": "1.0"}


@app.post("/start_session")
def start_session(starting_bankroll: float = 4000, session_target: float = 100):
    """Start a new betting session"""
    global money_manager, session_state
    
    money_manager = MoneyManager(
        initial_bankroll=starting_bankroll,
        session_target=session_target
    )
    
    session_state = {
        'active': True,
        'session_id': f"session_{len(session_state.get('spin_history', []))}",
        'spin_history': [],
        'predictions_made': [],
        'auto_bet_enabled': False
    }
    
    return {
        "success": True,
        "session_id": session_state['session_id'],
        "bankroll": starting_bankroll,
        "target": session_target
    }


@app.post("/predict")
def get_prediction(request: PredictionRequest):
    """Get AI prediction for next spin"""
    spin_history = request.spin_history
    
    if len(spin_history) < 3:
        return {
            "can_predict": False,
            "message": "Need at least 3 spins to make prediction",
            "numbers": [],
            "confidence": 0,
            "reasoning": []
        }
    
    # Get AI prediction
    numbers, confidence, reasoning = ai_engine.predict_numbers(spin_history)
    
    # Calculate bet size
    bet_per_number = money_manager.calculate_bet_size(confidence)
    total_bet = bet_per_number * 12 if bet_per_number > 0 else 0
    
    # Determine signal
    if confidence < 0.75:
        signal = "WAIT"
        signal_color = "orange"
    else:
        signal = "BET NOW"
        signal_color = "green"
    
    # Expand to anchor groups for display
    anchor_groups = []
    if len(numbers) >= 12:
        for i in range(0, min(12, len(numbers)), 3):
            if i < len(numbers):
                anchor = numbers[i]
                neighbors = numbers[i+1:i+3] if i+1 < len(numbers) else []
                anchor_groups.append({
                    'anchor': anchor,
                    'neighbors': neighbors
                })
    
    prediction = {
        "can_predict": True,
        "signal": signal,
        "signal_color": signal_color,
        "numbers": numbers[:12],
        "anchor_groups": anchor_groups,
        "confidence": round(confidence * 100, 1),
        "bet_per_number": bet_per_number,
        "total_bet": round(total_bet, 2),
        "potential_win": round((bet_per_number * 35) - total_bet, 2) if bet_per_number > 0 else 0,
        "potential_loss": -round(total_bet, 2),
        "reasoning": reasoning
    }
    
    # Store prediction
    session_state['predictions_made'].append(prediction)
    
    return prediction


@app.post("/record_spin")
def record_spin(spin: SpinData):
    """Record a new spin result"""
    session_state['spin_history'].append({
        'actual': spin.actual,
        'direction': spin.direction
    })
    
    return {
        "success": True,
        "total_spins": len(session_state['spin_history'])
    }


@app.post("/process_result")
def process_bet_result(result: BetResult):
    """Process the result of a bet"""
    outcome = money_manager.process_result(
        result.bet_per_number,
        result.hit
    )
    
    status = money_manager.get_status()
    
    return {
        "success": True,
        "outcome": outcome,
        "status": status,
        "session_complete": status['session_complete']
    }


@app.get("/status")
def get_status():
    """Get current session status"""
    status = money_manager.get_status()
    status['session_active'] = session_state['active']
    status['total_predictions'] = len(session_state['predictions_made'])
    
    return status


@app.post("/reset_session")
def reset_session():
    """Reset session and money manager"""
    global session_state
    session_state = {
        'active': False,
        'session_id': None,
        'spin_history': [],
        'predictions_made': [],
        'auto_bet_enabled': False
    }
    
    return {"success": True, "message": "Session reset"}


@app.get("/session_report")
def get_session_report():
    """Generate detailed session report"""
    if not session_state['active']:
        raise HTTPException(status_code=400, detail="No active session")
    
    status = money_manager.get_status()
    
    # Calculate statistics
    total_bets = len([p for p in session_state['predictions_made'] if p.get('bet_per_number', 0) > 0])
    
    report = {
        "session_id": session_state['session_id'],
        "summary": {
            "starting_bankroll": money_manager.initial_bankroll,
            "final_bankroll": status['bankroll'],
            "session_profit": status['session_profit'],
            "target": money_manager.session_target,
            "target_reached": status['session_complete']
        },
        "statistics": {
            "total_spins": status['total_spins'],
            "total_bets_placed": total_bets,
            "total_wins": status['total_wins'],
            "total_losses": status['total_losses'],
            "win_rate": status['win_rate'],
            "max_consecutive_losses": max([p.get('consecutive_losses', 0) for p in session_state['predictions_made']] + [0])
        },
        "predictions": session_state['predictions_made'][-20:]  # Last 20 predictions
    }
    
    return report


if __name__ == "__main__":
    print("🚀 Starting Roulette AI Server...")
    print("📡 Server will run on http://localhost:8000")
    print("📚 API docs available at http://localhost:8000/docs")
    
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
