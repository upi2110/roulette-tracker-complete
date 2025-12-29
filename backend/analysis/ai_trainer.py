"""
AI Training System - Validates and optimizes pattern recognition
"""

import json
from models.ai_engine import RouletteAI, MoneyManager

class AITrainer:
    
    def __init__(self):
        self.ai = RouletteAI()
        self.results = []
        
    def load_training_data(self, filepath):
        """Load historical spin data"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return data['sessions']
    
    def validate_predictions(self, sessions):
        """
        Test AI predictions against historical data
        Returns accuracy metrics
        """
        total_predictions = 0
        total_hits = 0
        confidence_accuracy = {
            '0.75-0.80': {'predicted': 0, 'actual_hits': 0},
            '0.80-0.85': {'predicted': 0, 'actual_hits': 0},
            '0.85-0.90': {'predicted': 0, 'actual_hits': 0},
            '0.90+': {'predicted': 0, 'actual_hits': 0},
        }
        
        print("🔬 Validating AI Predictions...\n")
        
        for session in sessions:
            spins = session['spins']
            session_id = session['session_id']
            
            print(f"Session: {session_id} ({len(spins)} spins)")
            
            # Need minimum 3 spins to make prediction
            for i in range(3, len(spins)):
                context = spins[:i]  # All previous spins
                actual_result = spins[i]['actual']
                
                # Get AI prediction
                predicted_numbers, confidence, reasoning = self.ai.predict_numbers(context)
                
                if confidence < 0.75:
                    continue  # AI chose to wait
                
                # Check if prediction hit
                hit = actual_result in predicted_numbers
                
                # Record result
                total_predictions += 1
                if hit:
                    total_hits += 1
                
                # Track by confidence bucket
                if confidence < 0.80:
                    bucket = '0.75-0.80'
                elif confidence < 0.85:
                    bucket = '0.80-0.85'
                elif confidence < 0.90:
                    bucket = '0.85-0.90'
                else:
                    bucket = '0.90+'
                
                confidence_accuracy[bucket]['predicted'] += 1
                if hit:
                    confidence_accuracy[bucket]['actual_hits'] += 1
                
                self.results.append({
                    'session': session_id,
                    'spin_number': i + 1,
                    'context_length': len(context),
                    'predicted_numbers': predicted_numbers,
                    'actual': actual_result,
                    'confidence': confidence,
                    'hit': hit,
                    'reasoning': reasoning
                })
        
        # Calculate metrics
        overall_accuracy = (total_hits / total_predictions * 100) if total_predictions > 0 else 0
        
        print(f"\n{'='*60}")
        print(f"📊 VALIDATION RESULTS")
        print(f"{'='*60}")
        print(f"Total Predictions Made: {total_predictions}")
        print(f"Total Hits: {total_hits}")
        print(f"Overall Accuracy: {overall_accuracy:.1f}%")
        print(f"\nExpected Random Accuracy: {(12/37)*100:.1f}%")
        print(f"AI Advantage: {overall_accuracy - (12/37)*100:+.1f}%")
        
        print(f"\n{'='*60}")
        print(f"ACCURACY BY CONFIDENCE LEVEL")
        print(f"{'='*60}")
        
        for bucket, data in confidence_accuracy.items():
            if data['predicted'] > 0:
                acc = (data['actual_hits'] / data['predicted'] * 100)
                print(f"{bucket}: {acc:.1f}% ({data['actual_hits']}/{data['predicted']} hits)")
        
        return {
            'total_predictions': total_predictions,
            'total_hits': total_hits,
            'overall_accuracy': overall_accuracy,
            'confidence_breakdown': confidence_accuracy
        }
    
    def simulate_session(self, spins, starting_bankroll=4000, target=100):
        """
        Simulate a complete session with money management
        """
        money_mgr = MoneyManager(
            initial_bankroll=starting_bankroll,
            session_target=target
        )
        
        session_log = []
        
        print(f"\n{'='*60}")
        print(f"🎰 SIMULATING SESSION")
        print(f"{'='*60}")
        print(f"Starting Bankroll: ${starting_bankroll}")
        print(f"Session Target: ${target}\n")
        
        for i in range(3, len(spins)):
            context = spins[:i]
            actual_result = spins[i]['actual']
            
            # Get prediction
            predicted_numbers, confidence, reasoning = self.ai.predict_numbers(context)
            
            # Calculate bet size
            bet_per_number = money_mgr.calculate_bet_size(confidence)
            
            if bet_per_number == 0:
                # AI chose to wait
                session_log.append({
                    'spin': i + 1,
                    'action': 'WAIT',
                    'confidence': confidence,
                    'reason': 'Confidence below 75% threshold'
                })
                continue
            
            # Place bet
            total_bet = bet_per_number * 12
            hit = actual_result in predicted_numbers
            
            # Process result
            result = money_mgr.process_result(bet_per_number, hit)
            
            session_log.append({
                'spin': i + 1,
                'action': 'BET',
                'bet_per_number': bet_per_number,
                'total_bet': total_bet,
                'predicted': predicted_numbers,
                'actual': actual_result,
                'hit': hit,
                'confidence': confidence,
                'bankroll': result['bankroll'],
                'profit': result['session_profit'],
                'consecutive_losses': result['consecutive_losses']
            })
            
            # Print update every 10 bets
            if money_mgr.total_spins % 10 == 0 or result['session_profit'] >= target:
                status = money_mgr.get_status()
                print(f"Spin {i+1}: Bankroll: ${status['bankroll']:.2f} | " +
                      f"Profit: ${status['session_profit']:.2f} | " +
                      f"Win Rate: {status['win_rate']:.1f}%")
            
            # Check if target reached
            if result['session_profit'] >= target:
                print(f"\n✅ TARGET REACHED!")
                print(f"Final Bankroll: ${result['bankroll']:.2f}")
                print(f"Session Profit: ${result['session_profit']:.2f}")
                print(f"Spins Required: {money_mgr.total_spins}")
                break
        
        status = money_mgr.get_status()
        
        if status['session_profit'] < target:
            print(f"\n⚠️ SESSION INCOMPLETE")
            print(f"Final Profit: ${status['session_profit']:.2f} / ${target}")
            print(f"Bankroll: ${status['bankroll']:.2f}")
        
        return session_log, status


if __name__ == '__main__':
    print("🚀 Starting AI Training & Validation\n")
    
    trainer = AITrainer()
    
    # Load training data
    sessions = trainer.load_training_data('analysis/training_data.json')
    
    # Validate predictions
    metrics = trainer.validate_predictions(sessions)
    
    # Simulate a session with first dataset
    print(f"\n{'='*60}")
    print("SIMULATION TEST")
    print(f"{'='*60}")
    
    session_log, final_status = trainer.simulate_session(
        sessions[0]['spins'][:100],  # First 100 spins
        starting_bankroll=4000,
        target=100
    )
    
    print(f"\n📈 FINAL STATISTICS:")
    print(f"  Win Rate: {final_status['win_rate']:.1f}%")
    print(f"  Total Spins: {final_status['total_spins']}")
    print(f"  Wins/Losses: {final_status['total_wins']}/{final_status['total_losses']}")
    print(f"  Final Bankroll: ${final_status['bankroll']:.2f}")
