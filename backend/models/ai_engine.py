"""
European Roulette AI Pattern Recognition Engine
Analyzes Tables 1, 2, and 3 to predict optimal bet numbers
"""

import json
import numpy as np
from collections import defaultdict
from datetime import datetime

# European Roulette Wheel Configuration
WHEEL_NO_ZERO = [26,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]

REGULAR_OPPOSITES = {
    0:10, 1:21, 2:20, 3:23, 4:33, 5:32, 6:22, 7:36, 8:35, 9:34,
    10:26, 11:28, 12:30, 13:29, 14:25, 15:24, 16:19, 17:31, 18:27,
    19:16, 20:2, 21:1, 22:6, 23:3, 24:15, 25:14, 26:10, 27:18,
    28:11, 29:13, 30:12, 31:17, 32:5, 33:4, 34:9, 35:8, 36:7
}

DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
}

class RouletteAI:
    
    def __init__(self):
        self.pattern_weights = self._initialize_weights()
        self.learning_data = defaultdict(lambda: {'hits': 0, 'misses': 0})
        
    def _initialize_weights(self):
        """Initialize pattern recognition weights"""
        return {
            'table3_consecutive_hits': 0.15,  # +15% per consecutive hit in same projection
            'table3_position_cluster': 0.10,  # +10% for position code clustering
            'table12_column_pattern': 0.08,   # +8% for column alternation pattern
            'multi_table_consensus': 0.12,    # +12% when tables agree
            'wheel_sector_bias': 0.05,        # +5% for wheel sector clustering
        }
    
    def calculate_position_code(self, reference, actual):
        """Calculate position code between reference and actual"""
        refNum = reference if reference != 0 else 26
        actNum = actual if actual != 0 else 26
        
        if refNum == actNum:
            return 'S+0'
        
        refIdx = WHEEL_NO_ZERO.index(refNum)
        
        # Check LEFT and RIGHT
        for direction, step in [(-1, 'L'), (1, 'R')]:
            distance = 0
            idx = refIdx
            skipped = False
            
            for i in range(10):
                idx = (idx + direction) % 37
                num = WHEEL_NO_ZERO[idx]
                
                if num == 26 and not skipped:
                    skipped = True
                    if actNum == 26:
                        distance += 1
                        return f'S{step}+{distance}'
                    continue
                
                distance += 1
                
                if num == actNum:
                    if distance <= 4:
                        return f'S{step}+{distance}'
                    break
                    
                if distance >= 4:
                    break
        
        # Check OPPOSITE side
        opposite = REGULAR_OPPOSITES[reference]
        oppNum = opposite if opposite != 0 else 26
        
        if actNum == oppNum:
            return 'O+0'
        
        oppIdx = WHEEL_NO_ZERO.index(oppNum)
        
        for direction, step in [(-1, 'L'), (1, 'R')]:
            distance = 0
            idx = oppIdx
            skipped = False
            
            for i in range(10):
                idx = (idx + direction) % 37
                num = WHEEL_NO_ZERO[idx]
                
                if num == 26 and not skipped:
                    skipped = True
                    if actNum == 26:
                        distance += 1
                        return f'O{step}+{distance}'
                    continue
                
                distance += 1
                
                if num == actNum:
                    if distance <= 4:
                        return f'O{step}+{distance}'
                    break
                    
                if distance >= 4:
                    break
        
        return 'XX'
    
    def get_number_at_position(self, refNum, posCode):
        """Get number at given position code from reference"""
        if posCode == 'S+0':
            return refNum
        if posCode == 'XX':
            return None
        if posCode == 'O+0':
            return REGULAR_OPPOSITES[refNum]
            
        # Parse position code
        import re
        match = re.match(r'^(S|O)(L|R)\+(\d+)$', posCode)
        if not match:
            return None
            
        side, direction, dist = match.groups()
        distance = int(dist)
        
        ref = refNum if refNum != 0 else 26
        
        if side == 'S':
            startIdx = WHEEL_NO_ZERO.index(ref)
        else:
            opp = REGULAR_OPPOSITES[refNum]
            oppNum = opp if opp != 0 else 26
            startIdx = WHEEL_NO_ZERO.index(oppNum)
        
        moveDir = 1 if direction == 'R' else -1
        idx = startIdx
        steps = 0
        skipped = False
        
        while steps < distance:
            idx = (idx + moveDir) % 37
            num = WHEEL_NO_ZERO[idx]
            
            if num == 26 and not skipped:
                skipped = True
                continue
            
            steps += 1
        
        result = WHEEL_NO_ZERO[idx]
        return result if result != 26 else 0
    
    def calculate_references(self, prev, prevPrev):
        """Calculate all 6 reference numbers"""
        refs = {'prev': prev, 'prev_prev': prevPrev}
        
        if prev == 36:
            refs['prev_plus_1'] = 35
            refs['prev_plus_2'] = 34
            refs['prev_minus_1'] = 35
            refs['prev_minus_2'] = 34
        elif prev == 0:
            refs['prev_minus_1'] = 10
            refs['prev_minus_2'] = 9
            refs['prev_plus_1'] = 1
            refs['prev_plus_2'] = 2
        else:
            refs['prev_plus_1'] = min(prev + 1, 36)
            refs['prev_plus_2'] = min(prev + 2, 36)
            refs['prev_minus_1'] = max(prev - 1, 0)
            refs['prev_minus_2'] = max(prev - 2, 0)
        
        return refs
    
    def analyze_table3_patterns(self, spin_history):
        """
        Analyze Table 3 anchor projection patterns
        Returns: Hot projections, anchor numbers, confidence boost
        """
        if len(spin_history) < 3:
            return {'anchors': [], 'confidence_boost': 0, 'reasoning': []}
        
        # Track which projections hit in recent spins
        projection_hits = {
            'prev': [], 'prev_plus_1': [], 'prev_minus_1': [],
            'prev_plus_2': [], 'prev_minus_2': [], 'prev_prev': []
        }
        
        position_codes_by_proj = {key: [] for key in projection_hits.keys()}
        
        # Analyze last 8 spins (or available)
        analysis_window = min(8, len(spin_history) - 2)
        
        for i in range(len(spin_history) - analysis_window, len(spin_history)):
            if i < 2:
                continue
                
            current = spin_history[i]
            prev = spin_history[i-1]
            prevPrev = spin_history[i-2]
            
            refs = self.calculate_references(prev['actual'], prevPrev['actual'])
            
            # Check which projection hit
            for proj_type, ref_num in refs.items():
                ref_13opp = DIGIT_13_OPPOSITES[ref_num]
                
                # Calculate position codes
                code_ref = self.calculate_position_code(ref_num, current['actual'])
                code_13opp = self.calculate_position_code(ref_13opp, current['actual'])
                
                if code_ref != 'XX':
                    projection_hits[proj_type].append(True)
                    position_codes_by_proj[proj_type].append(code_ref)
                elif code_13opp != 'XX':
                    projection_hits[proj_type].append(True)
                    position_codes_by_proj[proj_type].append(code_13opp)
                else:
                    projection_hits[proj_type].append(False)
        
        # Find hot projections (consecutive hits)
        hot_projections = []
        for proj_type, hits in projection_hits.items():
            if len(hits) == 0:
                continue
            
            # Count consecutive hits from end
            consecutive = 0
            for hit in reversed(hits):
                if hit:
                    consecutive += 1
                else:
                    break
            
            if consecutive >= 1:  # Changed from 2 to 1 for early predictions
                hot_projections.append({
                    'type': proj_type,
                    'consecutive_hits': consecutive,
                    'position_codes': position_codes_by_proj[proj_type][-consecutive:]
                })
        
        # Sort by consecutive hits
        hot_projections.sort(key=lambda x: x['consecutive_hits'], reverse=True)
        
        # Generate anchors from hottest projection
        anchors = []
        reasoning = []
        confidence_boost = 0
        
        if hot_projections:
            hottest = hot_projections[0]
            proj_type = hottest['type']
            consecutive = hottest['consecutive_hits']
            
            # Get next references
            last_spin = spin_history[-1]
            second_last = spin_history[-2]
            next_refs = self.calculate_references(last_spin['actual'], second_last['actual'])
            
            # Apply detected position code pattern to next reference
            ref_num = next_refs[proj_type]
            ref_13opp = DIGIT_13_OPPOSITES[ref_num]
            
            # Extract position code pattern
            pos_codes = hottest['position_codes']
            
            # Generate anchors using similar position codes
            unique_codes = set(pos_codes)
            for code in unique_codes:
                anchor1 = self.get_number_at_position(ref_num, code)
                anchor2 = self.get_number_at_position(ref_13opp, code)
                
                if anchor1 is not None and anchor1 not in anchors:
                    anchors.append(anchor1)
                if anchor2 is not None and anchor2 not in anchors:
                    anchors.append(anchor2)
            
            # Calculate confidence boost
            confidence_boost = min(consecutive * self.pattern_weights['table3_consecutive_hits'], 0.25)
            
            reasoning.append(f"{proj_type.upper()} projection: {consecutive} consecutive hits 🔥")
            reasoning.append(f"Position codes: {', '.join(pos_codes)}")
        
        return {
            'anchors': anchors[:8],  # Limit to 8 anchors
            'confidence_boost': confidence_boost,
            'reasoning': reasoning,
            'hot_projections': hot_projections
        }
    
    def expand_anchors_to_neighbors(self, anchors, count=4):
        """
        Select anchors and add neighbors to get 12 unique numbers
        """
        if not anchors or len(anchors) == 0:
            print("⚠️ No anchors provided!")
            return []
        
        result = []
        all_numbers = set()
        anchor_idx = 0
        
        # Keep adding until we have at least 10-12 numbers
        while len(all_numbers) < 12 and anchor_idx < len(anchors):
            anchor = anchors[anchor_idx]
            anchorNum = anchor if anchor != 0 else 26
            
            try:
                idx = WHEEL_NO_ZERO.index(anchorNum)
            except ValueError:
                print(f"⚠️ Invalid anchor: {anchor}")
                anchor_idx += 1
                continue
            
            left_idx = (idx - 1) % 37
            right_idx = (idx + 1) % 37
            
            left = WHEEL_NO_ZERO[left_idx]
            right = WHEEL_NO_ZERO[right_idx]
            
            left = left if left != 26 else 0
            right = right if right != 26 else 0
            
            result.append({
                'anchor': anchor,
                'neighbors': [left, right]
            })
            
            all_numbers.add(anchor)
            all_numbers.add(left)
            all_numbers.add(right)
            
            anchor_idx += 1
        
        print(f"📊 Expanded {len(result)} anchors to {len(all_numbers)} unique numbers")
        
        return result
    
    def predict_numbers(self, spin_history):
        """
        Main prediction function
        Returns: (bet_numbers, confidence, reasoning)
        """
        if len(spin_history) < 3:
            return [], 0.0, ["Insufficient data - need at least 3 spins"]
        
        # STEP 1: Analyze Table 3
        table3_analysis = self.analyze_table3_patterns(spin_history)
        
        if not table3_analysis['anchors']:
            return [], 0.60, ["No strong patterns detected - waiting for clearer signals"]
        
        # STEP 2: Expand anchors to bet numbers
        anchor_groups = self.expand_anchors_to_neighbors(
            table3_analysis['anchors'],
            count=4
        )
        
        # Collect all bet numbers
        bet_numbers = []
        for group in anchor_groups:
            bet_numbers.append(group['anchor'])
            bet_numbers.extend(group['neighbors'])
        
        # Remove duplicates while preserving order
        seen = set()
        unique_numbers = []
        for num in bet_numbers:
            if num not in seen:
                seen.add(num)
                unique_numbers.append(num)
        
        # STEP 3: Calculate confidence
        base_confidence = 0.65  # 65% baseline
        confidence = base_confidence + table3_analysis['confidence_boost']
        
        # Additional boost for multi-table consensus (future enhancement)
        # For now, capped at 0.90
        confidence = min(confidence, 0.90)
        
        # STEP 4: Build reasoning
        reasoning = table3_analysis['reasoning']
        reasoning.append(f"Selected {len(anchor_groups)} anchor groups")
        reasoning.append(f"Total bet numbers: {len(unique_numbers[:12])}")
        
        return unique_numbers[:12], confidence, reasoning


class MoneyManager:
    """
    Money Management System with Progressive Betting
    
    Rules:
    1. Min bet: $2 per number
    2. Increase $1 per number after loss
    3. Decrease $1 per number after win
    4. Target: $100 profit per session
    5. No stop loss
    6. After 3+ consecutive losses: Only bet if AI confidence >= 90%
    """
    
    def __init__(self, initial_bankroll=4000, session_target=100, base_bet=2):
        self.bankroll = initial_bankroll
        self.initial_bankroll = initial_bankroll
        self.session_target = session_target
        self.base_bet = base_bet
        self.min_bet = 2  # Minimum $2 per number
        self.numbers_to_bet = 12
        
        self.current_bet_per_number = self.base_bet
        self.consecutive_losses = 0
        self.session_profit = 0
        self.total_spins = 0
        self.total_wins = 0
        self.total_losses = 0
        
    def calculate_bet_size(self, ai_confidence):
        """
        Calculate bet size per number based on:
        - Current bet level (adjusted after each win/loss)
        - AI confidence
        - Consecutive losses (extra caution after 3+ losses)
        """
        # RULE 5: After 3+ consecutive losses, only bet if AI is VERY confident
        if self.consecutive_losses >= 3:
            if ai_confidence < 0.90:  # Require 90%+ confidence
                print(f"⚠️ Skipping bet: {self.consecutive_losses} losses, confidence {ai_confidence*100:.0f}% < 90%")
                return 0  # WAIT for better opportunity
        
        # Normal confidence threshold
        if ai_confidence < 0.75:
            return 0  # WAIT - confidence too low
        
        # Return current bet level
        return self.current_bet_per_number
    
    def process_result(self, bet_per_number, hit):
        """Process spin result and update bankroll and bet level"""
        total_bet = bet_per_number * self.numbers_to_bet
        
        if hit:
            # Win: 35:1 payout on winning number, lose other 11
            win_amount = bet_per_number * 35
            net_profit = win_amount - total_bet
            
            self.bankroll += net_profit
            self.session_profit += net_profit
            self.consecutive_losses = 0
            self.total_wins += 1
            
            # RULE 2: Decrease $1 after win
            self.current_bet_per_number = max(self.min_bet, self.current_bet_per_number - 1)
            
            print(f"✅ WIN: Profit ${net_profit:.0f}, Bet decreased to ${self.current_bet_per_number}/number")
            
        else:
            # Loss: lose entire bet
            self.bankroll -= total_bet
            self.session_profit -= total_bet
            self.consecutive_losses += 1
            self.total_losses += 1
            
            # RULE 2: Increase $1 after loss
            self.current_bet_per_number += 1
            
            print(f"❌ LOSS: Lost ${total_bet:.0f}, Bet increased to ${self.current_bet_per_number}/number, Consecutive losses: {self.consecutive_losses}")
        
        self.total_spins += 1
        
        return {
            'bankroll': self.bankroll,
            'session_profit': self.session_profit,
            'consecutive_losses': self.consecutive_losses,
            'total_spins': self.total_spins,
            'hit': hit
        }
    
    def get_status(self):
        """Get current money management status"""
        win_rate = (self.total_wins / self.total_spins * 100) if self.total_spins > 0 else 0
        
        return {
            'bankroll': round(self.bankroll, 2),
            'session_profit': round(self.session_profit, 2),
            'session_target': self.session_target,
            'consecutive_losses': self.consecutive_losses,
            'total_spins': self.total_spins,
            'total_wins': self.total_wins,
            'total_losses': self.total_losses,
            'win_rate': round(win_rate, 1),
            'session_complete': self.session_profit >= self.session_target
        }


if __name__ == '__main__':
    # Test the AI with sample data
    print("🤖 Roulette AI Engine - Test Mode\n")
    
    # Sample spin sequence
    test_spins = [
        {'actual': 26, 'direction': 'C'},
        {'actual': 15, 'direction': 'AC'},
        {'actual': 19, 'direction': 'C'},
        {'actual': 0, 'direction': 'AC'},
        {'actual': 33, 'direction': 'C'},
        {'actual': 7, 'direction': 'AC'},
        {'actual': 4, 'direction': 'C'},
        {'actual': 32, 'direction': 'AC'},
    ]
    
    ai = RouletteAI()
    money_mgr = MoneyManager()
    
    numbers, confidence, reasoning = ai.predict_numbers(test_spins)
    
    print(f"Confidence: {confidence*100:.1f}%")
    print(f"\nPredicted Numbers ({len(numbers)}):")
    print(numbers)
    print(f"\nReasoning:")
    for reason in reasoning:
        print(f"  • {reason}")
    
    bet_size = money_mgr.calculate_bet_size(confidence)
    print(f"\nBet Size: ${bet_size}/number × 12 = ${bet_size * 12}")