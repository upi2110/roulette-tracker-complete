"""
AI Training System - UPDATED VERSION
Validates predictions and trains the AI to improve over time
"""

import json
import sys
import os
from datetime import datetime

# Add parent directory to path
parent_dir = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, parent_dir)

from models.ai_engine import RouletteAI, MoneyManager

# Import table simulation
from utils.historical_simulator import TableSimulator

class AITrainer:
    
    def __init__(self):
        self.ai = RouletteAI()
        self.results = []
        self.learning_enabled = True
        
    def load_training_data(self, filepath):
        """
        Load historical spin data from JSON
        Can handle both:
        - Single file with sessions array
        - Directory with multiple session files
        """
        # Check if it's a directory
        if os.path.isdir(filepath):
            from utils.session_logger import SessionLogger
            logger = SessionLogger(filepath)
            return logger.load_all_sessions()
        
        # It's a single file
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        # Handle both formats
        if 'sessions' in data:
            return data['sessions']
        else:
            # Single session file
            return [data]
    
    def convert_session_to_numbers(self, session):
        """
        Convert training data format to simple number array
        From: [{"actual": 13, "direction": "C"}, ...]
        To: [13, 8, 22, ...]
        """
        return [spin['actual'] for spin in session['spins']]
    
    def validate_predictions(self, sessions, verbose=True):
        """
        Test AI predictions against historical data
        Returns accuracy metrics
        """
        total_predictions = 0
        total_hits = 0
        confidence_accuracy = {
            '0.70-0.75': {'predicted': 0, 'actual_hits': 0},
            '0.75-0.80': {'predicted': 0, 'actual_hits': 0},
            '0.80-0.85': {'predicted': 0, 'actual_hits': 0},
            '0.85-0.90': {'predicted': 0, 'actual_hits': 0},
            '0.90+': {'predicted': 0, 'actual_hits': 0},
        }
        
        pattern_performance = {}  # Track which patterns work best
        
        if verbose:
            print("🔬 Validating AI Predictions...\n")
        
        for session_idx, session in enumerate(sessions):
            numbers = self.convert_session_to_numbers(session)
            session_id = session['session_id']
            
            if verbose:
                print(f"Session {session_idx + 1}: {session_id} ({len(numbers)} spins)")
            
            # Create table simulator
            table_sim = TableSimulator()
            
            # Process each spin
            for i in range(len(numbers)):
                current_number = numbers[i]
                table_sim.add_spin(current_number)
                
                # Need at least 3 spins to make prediction
                if len(table_sim.spins) < 3:
                    continue
                
                # Get table hits data
                hits_data = table_sim.get_hits_data()
                
                # Get AI prediction
                prediction = self.ai.predict(
                    hits_data['table1Hits'],
                    hits_data['table2Hits'],
                    hits_data['table3Hits'],
                    hits_data['currentSpinCount'],
                    hits_data['recentSpins']
                )
                
                if not prediction['can_predict']:
                    continue
                
                confidence = prediction['confidence']
                predicted_numbers = prediction['numbers']
                
                # Check if next spin would hit (if available)
                if i + 1 < len(numbers):
                    next_number = numbers[i + 1]
                    hit = next_number in predicted_numbers
                    
                    # Record result
                    total_predictions += 1
                    if hit:
                        total_hits += 1
                    
                    # Track by confidence bucket
                    if confidence < 0.75:
                        bucket = '0.70-0.75'
                    elif confidence < 0.80:
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
                    
                    # Track pattern performance for learning
                    if 'anchor_groups' in prediction:
                        for group in prediction['anchor_groups']:
                            anchor = group['anchor']
                            if anchor not in pattern_performance:
                                pattern_performance[anchor] = {'attempts': 0, 'hits': 0}
                            pattern_performance[anchor]['attempts'] += 1
                            if next_number in [anchor] + group.get('neighbors', []):
                                pattern_performance[anchor]['hits'] += 1
                    
                    self.results.append({
                        'session': session_id,
                        'spin_number': i + 1,
                        'predicted_numbers': predicted_numbers,
                        'actual': next_number,
                        'confidence': confidence,
                        'hit': hit,
                        'reasoning': prediction.get('reasoning', [])
                    })
        
        # Calculate metrics
        overall_accuracy = (total_hits / total_predictions * 100) if total_predictions > 0 else 0
        random_accuracy = (12/37)*100
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"📊 VALIDATION RESULTS")
            print(f"{'='*60}")
            print(f"Total Predictions Made: {total_predictions}")
            print(f"Total Hits: {total_hits}")
            print(f"Overall Accuracy: {overall_accuracy:.1f}%")
            print(f"\nExpected Random Accuracy: {random_accuracy:.1f}%")
            print(f"AI Advantage: {overall_accuracy - random_accuracy:+.1f}%")
            
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
            'confidence_breakdown': confidence_accuracy,
            'pattern_performance': pattern_performance
        }
    
    def train_ai(self, sessions, save_path='models/ai_learned_patterns.json'):
        """
        Train the AI using historical data
        Learns which patterns work best and adjusts scoring
        """
        print(f"\n{'='*60}")
        print(f"🎓 TRAINING AI WITH HISTORICAL DATA")
        print(f"{'='*60}\n")
        
        # First, validate to see baseline performance
        print("Step 1: Measuring baseline performance...")
        baseline_metrics = self.validate_predictions(sessions, verbose=False)
        
        print(f"✅ Baseline Accuracy: {baseline_metrics['overall_accuracy']:.1f}%")
        print(f"   Total Predictions: {baseline_metrics['total_predictions']}")
        print(f"   Total Hits: {baseline_metrics['total_hits']}\n")
        
        # Analyze pattern performance
        print("Step 2: Analyzing pattern performance...")
        pattern_perf = baseline_metrics['pattern_performance']
        
        # Calculate success rate for each pattern
        pattern_scores = {}
        for anchor, data in pattern_perf.items():
            if data['attempts'] >= 3:  # Minimum 3 attempts to be statistically relevant
                success_rate = data['hits'] / data['attempts']
                pattern_scores[anchor] = {
                    'success_rate': success_rate,
                    'attempts': data['attempts'],
                    'hits': data['hits']
                }
        
        # Sort by success rate
        sorted_patterns = sorted(
            pattern_scores.items(), 
            key=lambda x: (x[1]['success_rate'], x[1]['attempts']), 
            reverse=True
        )
        
        print(f"✅ Analyzed {len(pattern_scores)} patterns\n")
        
        if sorted_patterns:
            print("Top 10 Most Successful Patterns:")
            for i, (anchor, data) in enumerate(sorted_patterns[:10], 1):
                print(f"{i:2d}. Anchor {anchor:2d}: {data['success_rate']*100:.1f}% " +
                      f"({data['hits']}/{data['attempts']} hits)")
        
        # Save learned patterns
        print(f"\nStep 3: Saving learned patterns...")
        learned_data = {
            'timestamp': datetime.now().isoformat(),
            'baseline_accuracy': baseline_metrics['overall_accuracy'],
            'total_training_spins': sum(len(self.convert_session_to_numbers(s)) for s in sessions),
            'pattern_scores': pattern_scores,
            'confidence_breakdown': baseline_metrics['confidence_breakdown']
        }
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        with open(save_path, 'w') as f:
            json.dump(learned_data, f, indent=2)
        
        print(f"✅ Learned patterns saved to: {save_path}")
        
        # Update AI engine with learned patterns
        print(f"\nStep 4: Applying learned patterns to AI engine...")
        self.ai.load_learned_patterns(save_path)
        
        print(f"\n{'='*60}")
        print(f"✅ TRAINING COMPLETE!")
        print(f"{'='*60}")
        
        return learned_data
    
    def simulate_session(self, session, starting_bankroll=4000, target=100, verbose=True):
        """
        Simulate a complete session with money management
        """
        numbers = self.convert_session_to_numbers(session)
        
        money_mgr = MoneyManager(starting_bankroll, target)
        table_sim = TableSimulator()
        
        session_log = []
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"🎰 SIMULATING SESSION: {session['session_id']}")
            print(f"{'='*60}")
            print(f"Starting Bankroll: ${starting_bankroll}")
            print(f"Session Target: ${target}")
            print(f"Total Spins Available: {len(numbers)}\n")
        
        for i in range(len(numbers)):
            current_number = numbers[i]
            table_sim.add_spin(current_number)
            
            # Need at least 3 spins
            if len(table_sim.spins) < 3:
                continue
            
            # Check bankroll limits
            if money_mgr.bankroll <= 0:
                if verbose:
                    print(f"\n❌ BANKRUPT at spin {i + 1}")
                break
            
            if money_mgr.session_profit >= target:
                if verbose:
                    print(f"\n✅ TARGET REACHED at spin {i + 1}!")
                    print(f"Final Bankroll: ${money_mgr.bankroll:.2f}")
                    print(f"Session Profit: ${money_mgr.session_profit:.2f}")
                break
            
            # Get prediction
            hits_data = table_sim.get_hits_data()
            prediction = self.ai.predict(
                hits_data['table1Hits'],
                hits_data['table2Hits'],
                hits_data['table3Hits'],
                hits_data['currentSpinCount'],
                hits_data['recentSpins']
            )
            
            if not prediction['can_predict']:
                continue
            
            # Check confidence threshold
            required_confidence = 0.75 if money_mgr.consecutive_losses >= 3 else 0.70
            if prediction['confidence'] < required_confidence:
                continue
            
            # Place bet
            bet_per_number = money_mgr.current_bet
            bet_numbers = prediction['numbers']
            total_bet = bet_per_number * len(bet_numbers)
            
            # Check next number (if available)
            if i + 1 < len(numbers):
                next_number = numbers[i + 1]
                hit = next_number in bet_numbers
                
                # Process result
                if hit:
                    profit = bet_per_number * 35
                    money_mgr.bankroll += profit - total_bet
                    money_mgr.session_profit += profit - total_bet
                    money_mgr.total_bets += 1
                    money_mgr.wins += 1
                    money_mgr.consecutive_losses = 0
                    money_mgr.current_bet = max(2, money_mgr.current_bet - 1)
                else:
                    money_mgr.bankroll -= total_bet
                    money_mgr.session_profit -= total_bet
                    money_mgr.total_bets += 1
                    money_mgr.losses += 1
                    money_mgr.consecutive_losses += 1
                    money_mgr.current_bet += 1
                
                session_log.append({
                    'spin': i + 1,
                    'bet_per_number': bet_per_number,
                    'total_bet': total_bet,
                    'predicted': bet_numbers,
                    'actual': next_number,
                    'hit': hit,
                    'confidence': prediction['confidence'],
                    'bankroll': money_mgr.bankroll,
                    'profit': money_mgr.session_profit
                })
                
                # Print update every 10 bets
                if verbose and money_mgr.total_bets % 10 == 0:
                    win_rate = (money_mgr.wins / money_mgr.total_bets * 100)
                    print(f"Spin {i+1}: Bankroll: ${money_mgr.bankroll:.2f} | " +
                          f"Profit: ${money_mgr.session_profit:+.2f} | " +
                          f"Win Rate: {win_rate:.1f}%")
        
        # Final status
        final_status = {
            'final_bankroll': money_mgr.bankroll,
            'session_profit': money_mgr.session_profit,
            'total_bets': money_mgr.total_bets,
            'wins': money_mgr.wins,
            'losses': money_mgr.losses,
            'win_rate': (money_mgr.wins / money_mgr.total_bets * 100) if money_mgr.total_bets > 0 else 0,
            'reached_target': money_mgr.session_profit >= target
        }
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"📈 FINAL STATISTICS")
            print(f"{'='*60}")
            print(f"Total Bets: {final_status['total_bets']}")
            print(f"Wins/Losses: {final_status['wins']}/{final_status['losses']}")
            print(f"Win Rate: {final_status['win_rate']:.1f}%")
            print(f"Final Bankroll: ${final_status['final_bankroll']:.2f}")
            print(f"Session Profit: ${final_status['session_profit']:+.2f}")
            print(f"Target Reached: {'✅ YES' if final_status['reached_target'] else '❌ NO'}")
        
        return session_log, final_status


if __name__ == '__main__':
    print("🚀 AI Training System - UPDATED VERSION\n")
    
    trainer = AITrainer()
    
    # Load training data
    print("Loading training data...")
    sessions = trainer.load_training_data('training_data.json')
    print(f"✅ Loaded {len(sessions)} sessions\n")
    
    # Train the AI
    learned_data = trainer.train_ai(sessions)
    
    # Test trained AI on first session
    print(f"\n{'='*60}")
    print("TESTING TRAINED AI")
    print(f"{'='*60}")
    
    session_log, final_status = trainer.simulate_session(
        sessions[0],
        starting_bankroll=4000,
        target=100
    )
    
    print(f"\n✅ Training complete! AI is now using learned patterns.")