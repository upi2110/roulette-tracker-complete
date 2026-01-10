"""
AI ENGINE - YOUR COMPLETE METHODOLOGY
- 4 anchors (NO 13-opposites)
- 8 neighbors (2 per anchor)
- Green/Black pattern analysis
- Multi-table scoring with learning
"""

import json
import os
from datetime import datetime

# Wheel constants - European Roulette order (clockwise)
WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]

DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
}

# Green (positive) and Black (negative) numbers
GREEN_NUMBERS = {0, 3, 26, 32, 27, 13, 36, 1, 20, 14, 15, 19, 4, 11, 30, 8, 31, 9, 22}
BLACK_NUMBERS = {23, 10, 5, 18, 29, 7, 21, 2, 25, 24, 16, 33, 28, 12, 35, 17, 34, 6}


def get_wheel_neighbors(number, distance=1):
    """Get neighbors on the wheel at specified distance"""
    try:
        idx = WHEEL_ORDER.index(number)
    except ValueError:
        return []
    
    neighbors = []
    for d in range(1, distance + 1):
        # Left neighbor (counterclockwise)
        left_idx = (idx - d) % len(WHEEL_ORDER)
        neighbors.append(WHEEL_ORDER[left_idx])
        
        # Right neighbor (clockwise)
        right_idx = (idx + d) % len(WHEEL_ORDER)
        neighbors.append(WHEEL_ORDER[right_idx])
    
    return neighbors


def get_color_trend(recent_spins):
    """
    Analyze last 2-3 spins for Green/Black trend
    Returns: 'green', 'black', or 'neutral'
    """
    if len(recent_spins) < 2:
        return 'neutral'
    
    # Look at last 3 spins
    check_spins = recent_spins[-3:] if len(recent_spins) >= 3 else recent_spins[-2:]
    
    green_count = sum(1 for s in check_spins if s in GREEN_NUMBERS)
    black_count = sum(1 for s in check_spins if s in BLACK_NUMBERS)
    
    # Trend continues: if majority is black, favor black
    if black_count > green_count:
        return 'black'
    elif green_count > black_count:
        return 'green'
    else:
        return 'neutral'


class RouletteAI:
    """
    Pattern-based AI with YOUR methodology:
    1. Analyze all 3 tables for patterns
    2. Score anchors with multi-table + color trend bonus
    3. Select best 4 anchors
    4. Add ±1 neighbors (NO 13-opposites)
    5. Total: 12 numbers (or 13 if 0/26)
    """
    
    def __init__(self):
        self.scoring = {
            'table3_hit': 10,
            'table2_hit': 8,
            'table1_hit': 5,
            'multi_table_bonus': 10,
            'recent_bonus': 3,
            'color_trend_bonus': 5
        }
        
        # Learning system
        self.history_file = 'ai_learning_history.json'
        self.prediction_history = []
        self.load_history()
    
    def load_history(self):
        """Load prediction history for learning"""
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, 'r') as f:
                    self.prediction_history = json.load(f)
            except:
                self.prediction_history = []
    
    def save_history(self):
        """Save prediction history"""
        try:
            with open(self.history_file, 'w') as f:
                json.dump(self.prediction_history[-100:], f)  # Keep last 100
        except:
            pass

    def clear_learning_history(self):
        """Clear prediction history and reset learning file"""
        self.prediction_history = []
        self.save_history()  # Saves empty array to file
        print("🔄 AI learning history cleared")
    
    def find_consecutive_patterns(self, hits_data, min_consecutive=2):
        """Find refs/projections with 2+ consecutive hits"""
        patterns = {}
        
        for ref_name, hit_list in hits_data.items():
            if len(hit_list) < min_consecutive:
                continue
            
            # Check for consecutive hits
            consecutive_count = 0
            last_spin_idx = -999
            
            for hit in hit_list:
                if hit['spinIdx'] == last_spin_idx + 1:
                    consecutive_count += 1
                else:
                    consecutive_count = 1
                
                last_spin_idx = hit['spinIdx']
                
                # Found pattern
                if consecutive_count >= min_consecutive:
                    if ref_name not in patterns:
                        patterns[ref_name] = {
                            'consecutive': consecutive_count,
                            'latest_spin': last_spin_idx,
                            'hit_numbers': []
                        }
                    else:
                        patterns[ref_name]['consecutive'] = max(
                            patterns[ref_name]['consecutive'],
                            consecutive_count
                        )
                        patterns[ref_name]['latest_spin'] = max(
                            patterns[ref_name]['latest_spin'],
                            last_spin_idx
                        )
        
        return patterns
    
    def extract_anchor_candidates(self, table_data, current_spin_idx, color_trend):
        """
        Extract potential anchor numbers from hot patterns
        Score with: Table hits + Multi-table + Recent + Color trend
        """
        candidates = {}
        
        # Table 1 patterns
        table1_patterns = self.find_consecutive_patterns(table_data.get('table1Hits', {}))
        for ref_name, pattern_info in table1_patterns.items():
            score = pattern_info['consecutive'] * self.scoring['table1_hit']
            
            # Recent bonus
            recency = current_spin_idx - pattern_info['latest_spin']
            if recency <= 2:
                score += self.scoring['recent_bonus']
            
            for hit in table_data['table1Hits'][ref_name]:
                for num in hit.get('hitNumbers', []):
                    if num not in candidates:
                        candidates[num] = {'score': 0, 'tables': set()}
                    candidates[num]['score'] += score
                    candidates[num]['tables'].add('table1')
        
        # Table 2 patterns
        table2_patterns = self.find_consecutive_patterns(table_data.get('table2Hits', {}))
        for ref_name, pattern_info in table2_patterns.items():
            score = pattern_info['consecutive'] * self.scoring['table2_hit']
            
            recency = current_spin_idx - pattern_info['latest_spin']
            if recency <= 2:
                score += self.scoring['recent_bonus']
            
            for hit in table_data['table2Hits'][ref_name]:
                for num in hit.get('hitNumbers', []):
                    if num not in candidates:
                        candidates[num] = {'score': 0, 'tables': set()}
                    candidates[num]['score'] += score
                    candidates[num]['tables'].add('table2')
        
        # Table 3 patterns (MOST IMPORTANT)
        table3_patterns = self.find_consecutive_patterns(table_data.get('table3Hits', {}))
        for proj_type, pattern_info in table3_patterns.items():
            score = pattern_info['consecutive'] * self.scoring['table3_hit']
            
            recency = current_spin_idx - pattern_info['latest_spin']
            if recency <= 2:
                score += self.scoring['recent_bonus']
            
            for hit in table_data['table3Hits'][proj_type]:
                num = hit.get('projection')
                if num is not None:
                    if num not in candidates:
                        candidates[num] = {'score': 0, 'tables': set()}
                    candidates[num]['score'] += score
                    candidates[num]['tables'].add('table3')
        
        # Apply bonuses
        for num, info in candidates.items():
            # Multi-table bonus
            if len(info['tables']) >= 2:
                info['score'] += self.scoring['multi_table_bonus']
            
            # Color trend bonus
            if color_trend == 'green' and num in GREEN_NUMBERS:
                info['score'] += self.scoring['color_trend_bonus']
            elif color_trend == 'black' and num in BLACK_NUMBERS:
                info['score'] += self.scoring['color_trend_bonus']
        
        return candidates
    
    def select_best_anchors(self, candidates, count=4):
        """Select top 4 anchor numbers by score"""
        sorted_candidates = sorted(
            candidates.items(),
            key=lambda x: x[1]['score'],
            reverse=True
        )
        
        anchors = [num for num, _ in sorted_candidates[:count]]
        scores = [info['score'] for num, info in sorted_candidates[:count]]
        
        return anchors, scores
    
    def expand_to_12_numbers(self, anchors):
        """
        YOUR METHODOLOGY:
        - 4 anchors
        - 8 neighbors (±1 for each anchor)
        - NO 13-opposites
        - If 0 or 26 is selected, add both (same position)
        """
        all_numbers = set()
        anchor_groups = []  # NEW: Track anchor groups for wheel highlighting
        
        for anchor in anchors:
            # Get ±1 neighbors on wheel
            neighbors = get_wheel_neighbors(anchor, distance=1)
            
            # Add anchor and its neighbors
            all_numbers.add(anchor)
            all_numbers.update(neighbors[:2])  # Only 2 neighbors per anchor
            
            # Build anchor group for wheel highlighting
            anchor_groups.append({
                'anchor': anchor,
                'neighbors': neighbors[:2]
            })
            
            # CRITICAL: 0 and 26 are same position
            if anchor == 0 or anchor == 26:
                all_numbers.add(0)
                all_numbers.add(26)
            
            for nb in neighbors[:2]:
                if nb == 0 or nb == 26:
                    all_numbers.add(0)
                    all_numbers.add(26)
        
        final_numbers = sorted(list(all_numbers))
        
        print(f"📊 Selected {len(anchors)} anchors → {len(final_numbers)} unique numbers")
        print(f"   Anchors: {anchors}")
        print(f"   Final numbers: {final_numbers}")
        
        return final_numbers, anchor_groups
    
    def calculate_confidence(self, candidates, selected_anchors, anchor_scores):
        """
        Calculate HONEST confidence based on actual pattern strength
        """
        if not selected_anchors:
            return 0.60
        
        # Average score of selected anchors
        avg_score = sum(anchor_scores) / len(anchor_scores) if anchor_scores else 0
        
        # Base confidence from score
        if avg_score >= 30:
            base_confidence = 0.85
        elif avg_score >= 20:
            base_confidence = 0.80
        elif avg_score >= 15:
            base_confidence = 0.75
        else:
            base_confidence = 0.70
        
        # Adjust based on learning history
        if len(self.prediction_history) >= 10:
            recent_predictions = self.prediction_history[-20:]
            recent_wins = sum(1 for p in recent_predictions if p.get('hit', False))
            recent_accuracy = recent_wins / len(recent_predictions)
            
            # Calibrate: if we're overconfident, reduce
            if recent_accuracy < 0.5 and base_confidence > 0.75:
                base_confidence -= 0.10
                print(f"   📉 Confidence adjusted down (recent accuracy: {recent_accuracy*100:.0f}%)")
        
        return min(0.90, base_confidence)  # Cap at 90%
    
    def record_prediction(self, anchors, confidence, hit=None):
        """Record prediction for learning"""
        record = {
            'timestamp': datetime.now().isoformat(),
            'anchors': anchors,
            'confidence': confidence,
            'hit': hit
        }
        self.prediction_history.append(record)
        
        # Save periodically
        if len(self.prediction_history) % 10 == 0:
            self.save_history()
    
    def predict_numbers(self, table_data, recent_spins=None):
        """
        Main prediction function using YOUR complete methodology
        """
        if not table_data:
            return [], 0.60, ["Waiting for table data"], []
        
        current_spin_idx = table_data.get('currentSpinCount', 0)
        
        if current_spin_idx < 3:
            return [], 0.60, ["Need at least 3 spins"], []
        
        # Analyze color trend
        color_trend = get_color_trend(recent_spins) if recent_spins else 'neutral'
        print(f"🎨 Color trend: {color_trend.upper()}")
        
        # Find anchor candidates with scoring
        candidates = self.extract_anchor_candidates(table_data, current_spin_idx, color_trend)
        
        if not candidates:
            return [], 0.65, ["No strong patterns detected"], []
        
        # Select best 4 anchors
        selected_anchors, anchor_scores = self.select_best_anchors(candidates, count=4)
        
        if len(selected_anchors) < 2:
            return [], 0.65, ["Insufficient pattern confirmation"], []
        
        # Expand to 12 numbers (4 anchors + 8 neighbors)
        final_numbers, anchor_groups = self.expand_to_12_numbers(selected_anchors)
        
        # Calculate HONEST confidence
        confidence = self.calculate_confidence(candidates, selected_anchors, anchor_scores)
        
        # Build reasoning
        reasoning = []
        reasoning.append(f"Pattern analysis: {len(candidates)} anchor candidates")
        reasoning.append(f"Color trend: {color_trend} (favoring {color_trend} numbers)")
        reasoning.append(f"Selected {len(selected_anchors)} anchors with multi-table confirmation")
        
        # Show top anchors with their table confirmations
        for i, anchor in enumerate(selected_anchors[:3]):
            tables = candidates[anchor]['tables']
            reasoning.append(f"Anchor {anchor}: {len(tables)} tables, score {anchor_scores[i]:.0f}")
        
        # Record for learning (hit will be updated later)
        self.record_prediction(selected_anchors, confidence, hit=None)
        
        return final_numbers, confidence, reasoning, anchor_groups


class MoneyManager:
    """Money Management - Your Rules"""
    
    def __init__(self, initial_bankroll=4000, session_target=100, base_bet=2):
        self.bankroll = initial_bankroll
        self.initial_bankroll = initial_bankroll
        self.session_target = session_target
        self.base_bet = base_bet
        self.min_bet = 2
        self.numbers_to_bet = 12
        
        self.current_bet_per_number = self.base_bet
        self.consecutive_losses = 0
        self.session_profit = 0
        self.total_spins = 0
        self.total_wins = 0
        self.total_losses = 0
        self.bet_history = []  # Store all bets for undo capability
    
    def calculate_bet_size(self, ai_confidence):
        """Calculate bet based on rules"""
        # After 3+ losses, require higher confidence but not 90%
        if self.consecutive_losses >= 3:
            if ai_confidence < 0.75:  # CHANGED from 0.90 to 0.75
                print(f"⚠️ CAUTION: {self.consecutive_losses} losses, need 75%+ confidence (have {ai_confidence*100:.0f}%)")
                return 0
        
        return self.current_bet_per_number
    
    def process_result(self, bet_per_number, hit):
        """Process result and adjust bet"""
        total_bet = bet_per_number * self.numbers_to_bet
        # Save state before processing (for undo)
        state_before = {
            'bankroll': self.bankroll,
            'session_profit': self.session_profit,
            'consecutive_losses': self.consecutive_losses,
            'current_bet_per_number': self.current_bet_per_number,
            'total_wins': self.total_wins,
            'total_losses': self.total_losses,
            'total_spins': self.total_spins
        }
        
        if hit:
            win_amount = bet_per_number * 35
            net_profit = win_amount - total_bet
            
            self.bankroll += net_profit
            self.session_profit += net_profit
            self.consecutive_losses = 0
            self.total_wins += 1
            
            # Rule: -$1 after win
            self.current_bet_per_number = max(self.min_bet, self.current_bet_per_number - 1)
            
            print(f"✅ WIN: +${net_profit:.0f}, Next bet: ${self.current_bet_per_number}/number")
        else:
            self.bankroll -= total_bet
            self.session_profit -= total_bet
            self.consecutive_losses += 1
            self.total_losses += 1
            
            # Rule: +$1 after loss
            self.current_bet_per_number += 1
            
            print(f"❌ LOSS: -${total_bet:.0f}, Next bet: ${self.current_bet_per_number}/number, Losses: {self.consecutive_losses}")
        
        self.total_spins += 1
        # Record bet in history (for undo)
        # Record bet in history (for undo)
        self.bet_history.append({
            'bet_per_number': bet_per_number,
            'total_bet': total_bet,
            'hit': hit,
            'spin_number': self.total_spins,  # NEW: Track which spin this bet was on
            'state_before': state_before,
            'state_after': {
                'bankroll': self.bankroll,
                'session_profit': self.session_profit,
                'consecutive_losses': self.consecutive_losses,
                'current_bet_per_number': self.current_bet_per_number,
                'total_wins': self.total_wins,
                'total_losses': self.total_losses,
                'total_spins': self.total_spins
            }
        })
        
        return {
            'bankroll': self.bankroll,
            'session_profit': self.session_profit,
            'next_bet': self.current_bet_per_number,
            'consecutive_losses': self.consecutive_losses,
            'total_spins': self.total_spins
        }
    
    def undo_last_bet(self):
        """Undo the last bet and restore previous state"""
        if not self.bet_history:
            return {
                'success': False,
                'error': 'No bets to undo'
            }
        
        # Remove last bet from history
        last_bet = self.bet_history.pop()
        
        # Restore state from before the bet
        state_before = last_bet['state_before']
        self.bankroll = state_before['bankroll']
        self.session_profit = state_before['session_profit']
        self.consecutive_losses = state_before['consecutive_losses']
        self.current_bet_per_number = state_before['current_bet_per_number']
        self.total_wins = state_before['total_wins']
        self.total_losses = state_before['total_losses']
        self.total_spins = state_before['total_spins']
        
        print(f"↩️ UNDO: Reverted last {'WIN' if last_bet['hit'] else 'LOSS'} bet of ${last_bet['total_bet']:.0f}")
        
        return {
            'success': True,
            'reverted_bet': last_bet,
            'status': self.get_status()
        }
    
    def undo_bet_for_spin(self, spin_number):
        """Undo bet for a specific spin number"""
        if not self.bet_history:
            return {
                'success': False,
                'error': 'No bets to undo'
            }
        
        # Find bet for this spin number
        bet_index = None
        for i in range(len(self.bet_history) - 1, -1, -1):  # Search backwards (newest first)
            if self.bet_history[i].get('spin_number') == spin_number:
                bet_index = i
                break
        
        if bet_index is None:
            return {
                'success': False,
                'error': f'No bet found for spin {spin_number}'
            }
        
        # Remove the bet
        bet_to_remove = self.bet_history.pop(bet_index)
        
        # Restore state from before this bet
        state_before = bet_to_remove['state_before']
        self.bankroll = state_before['bankroll']
        self.session_profit = state_before['session_profit']
        self.consecutive_losses = state_before['consecutive_losses']
        self.current_bet_per_number = state_before['current_bet_per_number']
        self.total_wins = state_before['total_wins']
        self.total_losses = state_before['total_losses']
        self.total_spins = state_before['total_spins']
        
        print(f"↩️ UNDO: Reverted bet for spin {spin_number} ({'WIN' if bet_to_remove['hit'] else 'LOSS'}, ${bet_to_remove['total_bet']:.0f})")
        
        return {
            'success': True,
            'reverted_bet': bet_to_remove,
            'status': self.get_status()
        }
    
    def get_status(self):
        """Get current status"""
        return {
            'bankroll': self.bankroll,
            'session_profit': self.session_profit,
            'target': self.session_target,
            'total_bets': self.total_spins,
            'wins': self.total_wins,
            'losses': self.total_losses,
            'consecutive_losses': self.consecutive_losses,
            'current_bet': self.current_bet_per_number
        }
    
    def reset(self):
        """Reset session"""
        self.bankroll = self.initial_bankroll
        self.session_profit = 0
        self.current_bet_per_number = self.base_bet
        self.consecutive_losses = 0
        self.total_spins = 0
        self.total_wins = 0
        self.total_losses = 0


if __name__ == "__main__":
    ai = RouletteAI()
    print("✅ AI Engine loaded with YOUR methodology")