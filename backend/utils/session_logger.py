"""
SESSION LOGGER - Auto-saves each session as separate file
Each session is independent with timestamp
"""

import json
import os
from datetime import datetime
from pathlib import Path


class SessionLogger:
    """
    Automatically saves each roulette session to a separate JSON file
    
    Usage:
        logger = SessionLogger()
        logger.start_new_session()
        
        # During session
        logger.log_spin(number=15, direction="C")
        logger.log_prediction(predicted=[3,7,8,...], actual=15, hit=True, confidence=0.78)
        
        # End of session
        logger.save_session()
    """
    
    def __init__(self, training_data_dir='training_data'):
        self.training_data_dir = training_data_dir
        self.current_session = None
        
        # Ensure directory exists
        Path(training_data_dir).mkdir(parents=True, exist_ok=True)
    
    def start_new_session(self, casino_name="Unknown Casino"):
        """Start a new session"""
        timestamp = datetime.now()
        
        self.current_session = {
            'session_id': f'session_{timestamp.strftime("%Y%m%d_%H%M%S")}',
            'casino': casino_name,
            'start_time': timestamp.isoformat(),
            'end_time': None,
            'total_spins': 0,
            'spins': [],
            'predictions': [],
            'statistics': {
                'total_bets': 0,
                'wins': 0,
                'losses': 0,
                'final_bankroll': 0,
                'session_profit': 0
            }
        }
        
        print(f"📝 New session started: {self.current_session['session_id']}")
        return self.current_session['session_id']
    
    def log_spin(self, number, direction="C"):
        """Log a single spin"""
        if not self.current_session:
            print("⚠️ No active session. Call start_new_session() first.")
            return
        
        spin_number = len(self.current_session['spins']) + 1
        
        self.current_session['spins'].append({
            'spin_number': spin_number,
            'actual': number,
            'direction': direction,
            'timestamp': datetime.now().isoformat()
        })
        
        self.current_session['total_spins'] = spin_number
    
    def log_prediction(self, predicted_numbers, actual_number, hit, confidence, bet_amount=0):
        """Log an AI prediction and result"""
        if not self.current_session:
            return
        
        self.current_session['predictions'].append({
            'spin_number': self.current_session['total_spins'],
            'predicted': predicted_numbers,
            'actual': actual_number,
            'hit': hit,
            'confidence': confidence,
            'bet_amount': bet_amount,
            'timestamp': datetime.now().isoformat()
        })
        
        # Update statistics
        if bet_amount > 0:
            self.current_session['statistics']['total_bets'] += 1
            if hit:
                self.current_session['statistics']['wins'] += 1
            else:
                self.current_session['statistics']['losses'] += 1
    
    def update_session_stats(self, final_bankroll, session_profit):
        """Update final session statistics"""
        if not self.current_session:
            return
        
        self.current_session['statistics']['final_bankroll'] = final_bankroll
        self.current_session['statistics']['session_profit'] = session_profit
        self.current_session['end_time'] = datetime.now().isoformat()
    
    def save_session(self):
        """Save current session to separate JSON file"""
        if not self.current_session:
            print("⚠️ No active session to save.")
            return None
        
        # Create filename with timestamp
        filename = f"{self.current_session['session_id']}.json"
        filepath = os.path.join(self.training_data_dir, filename)
        
        # Save to file
        with open(filepath, 'w') as f:
            json.dump(self.current_session, f, indent=2)
        
        print(f"✅ Session saved: {filepath}")
        print(f"   Spins: {self.current_session['total_spins']}")
        print(f"   Predictions: {len(self.current_session['predictions'])}")
        
        saved_path = filepath
        
        # Clear current session
        self.current_session = None
        
        return saved_path
    
    def get_all_training_sessions(self):
        """Get list of all training session files"""
        if not os.path.exists(self.training_data_dir):
            return []
        
        session_files = [
            os.path.join(self.training_data_dir, f)
            for f in os.listdir(self.training_data_dir)
            if f.endswith('.json')
        ]
        
        return sorted(session_files)
    
    def load_all_sessions(self):
        """Load all training sessions"""
        session_files = self.get_all_training_sessions()
        sessions = []
        
        for filepath in session_files:
            try:
                with open(filepath, 'r') as f:
                    session = json.load(f)
                    sessions.append(session)
            except Exception as e:
                print(f"⚠️ Error loading {filepath}: {e}")
        
        return sessions


# Example usage
if __name__ == '__main__':
    logger = SessionLogger()
    
    # Start new session
    logger.start_new_session(casino_name="Evolution Immersive Roulette")
    
    # Log some spins
    logger.log_spin(15, "C")
    logger.log_spin(22, "AC")
    logger.log_spin(8, "C")
    
    # Log a prediction
    logger.log_prediction(
        predicted_numbers=[3, 7, 8, 9, 15, 22, 25, 28, 29, 31, 32, 35],
        actual_number=8,
        hit=True,
        confidence=0.78,
        bet_amount=2
    )
    
    # End session
    logger.update_session_stats(final_bankroll=4050, session_profit=50)
    logger.save_session()
    
    # Load all sessions
    all_sessions = logger.load_all_sessions()
    print(f"\nTotal training sessions: {len(all_sessions)}")