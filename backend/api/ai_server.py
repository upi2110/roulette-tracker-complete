"""
AI Server - Updated to pass recent spins for color trend analysis
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
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
        extra = "allow"

class ResultData(BaseModel):
    bet_per_number: float
    hit: bool

class BacktestRequest(BaseModel):
    numbers: List[int]
    starting_bankroll: int = 4000
    session_target: int = 100

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
    
    recent_spins = getattr(data, 'recentSpins', None) or []
    
    numbers, confidence, reasoning, anchor_groups = roulette_ai.predict_numbers(
        data.dict(),
        recent_spins=recent_spins
    )
    
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
    
    print(f"📊 Prediction: {len(numbers)} numbers, {confidence*100:.0f}% confidence")
    
    return {
        "can_predict": can_predict,
        "signal": signal,
        "confidence": confidence,
        "numbers": numbers,
        "anchor_groups": anchor_groups,
        "reasoning": reasoning,
        "bet_per_number": bet_amount
    }

@app.post("/process_result")
async def process_result(result: ResultData):
    if not money_manager:
        return {"success": False, "message": "No active session"}
    
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
        pass
    return {"success": True, "message": "Session reset"}

@app.post("/reset_session")
async def reset_session_endpoint():
    return await reset_session()

@app.post("/backtest/run")
async def run_backtest(request: BacktestRequest):
    """Run backtest on historical data"""
    try:
        from utils.historical_simulator import run_full_backtest, calculate_analytics
        
        print(f"📊 Starting backtest with {len(request.numbers)} numbers")
        
        # Run the backtest
        session_results = run_full_backtest(request.numbers)
        
        # Calculate analytics
        analytics = calculate_analytics(session_results)
        
        print(f"✅ Backtest complete: {len(session_results)} sessions")
        print(f"📈 Success rate: {analytics.get('success_rate', 0):.1f}%")
        
        return {
            "success": True,
            "total_sessions": len(session_results),
            "sessions": session_results,
            "analytics": analytics
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
@app.post("/backtest/export")
async def export_backtest(request: dict):
    """Export backtest results to Excel"""
    try:
        from utils.excel_exporter import BacktestExporter
        from pathlib import Path
        from fastapi.responses import FileResponse

        # Save to Desktop with timestamp
        desktop_path = Path.home() / "Desktop"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backtest_results_{timestamp}.xlsx"
        temp_path = str(desktop_path / filename)
        
        # Export to Excel
        exporter = BacktestExporter()
        exporter.export_results(
            request['sessions'],
            request['analytics'],
            temp_path
        )
        
        print(f"✅ Excel saved to Desktop: {filename}")
        
        return FileResponse(
            temp_path,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename=f'backtest_results_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        )
        
    except Exception as e:
        import traceback
        print(f"❌ Export error: {str(e)}")
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