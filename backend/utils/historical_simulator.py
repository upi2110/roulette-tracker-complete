"""
HISTORICAL DATA SIMULATOR
Fast backtesting engine that replicates the AI prediction system
without UI overhead for testing 500+ sessions quickly.
"""

import sys
import os
from typing import List, Dict, Tuple
from datetime import datetime

# Add parent directory to path
parent_dir = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, parent_dir)

from models.ai_engine import RouletteAI, MoneyManager

# Constants from renderer-3tables.js
WHEEL_STANDARD = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
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


class TableSimulator:
    """Simulates the 3-table projection system for backtesting"""
    
    def __init__(self):
        self.spins = []
        self.table1_hits = {}
        self.table2_hits = {}
        self.table3_hits = {}
        
    def add_spin(self, number: int):
        """Add a spin and update all 3 tables"""
        self.spins.append(number)
        spin_count = len(self.spins)
        
        if spin_count < 2:
            return
            
        # Get reference points
        prev = self.spins[-2] if spin_count >= 2 else None
        prev2 = self.spins[-3] if spin_count >= 3 else None
        
        # Update Table 1 (±1 range, 10 position codes)
        self._update_table1(number, prev, prev2)
        
        # Update Table 2 (±2 range, 18 position codes)
        self._update_table2(number, prev, prev2)
        
        # Update Table 3 (anchor projections)
        self._update_table3(number, prev, prev2)
    
    def _calculate_position_code(self, reference: int, actual: int) -> str:
        """Calculate position code (S/SL/SR/O/OL/OR)"""
        ref_num = 26 if reference == 0 else reference
        act_num = 26 if actual == 0 else actual
        
        if ref_num == act_num:
            return 'S+0'
        
        ref_idx = WHEEL_NO_ZERO.index(ref_num)
        
        # Check SAME side (S)
        left_dist = self._calculate_wheel_distance(ref_idx, act_num, -1)
        right_dist = self._calculate_wheel_distance(ref_idx, act_num, 1)
        
        if 1 <= left_dist <= 4:
            return f'SL+{left_dist}'
        if 1 <= right_dist <= 4:
            return f'SR+{right_dist}'
        
        # Check OPPOSITE side (O)
        opposite = REGULAR_OPPOSITES[reference]
        opp_num = 26 if opposite == 0 else opposite
        
        if act_num == opp_num:
            return 'O+0'
        
        opp_idx = WHEEL_NO_ZERO.index(opp_num)
        
        left_dist_opp = self._calculate_wheel_distance(opp_idx, act_num, -1)
        right_dist_opp = self._calculate_wheel_distance(opp_idx, act_num, 1)
        
        if 1 <= left_dist_opp <= 4:
            return f'OL+{left_dist_opp}'
        if 1 <= right_dist_opp <= 4:
            return f'OR+{right_dist_opp}'
        
        return 'XX'
    
    def _calculate_wheel_distance(self, from_idx: int, target_number: int, direction: int) -> int:
        """Calculate distance on wheel to target number"""
        current_idx = from_idx
        distance = 0
        skipped_zero = False
        
        for _ in range(10):
            current_idx = (current_idx + direction) % 37
            current_num = WHEEL_NO_ZERO[current_idx]
            
            # Skip first 26 without counting
            if current_num == 26 and not skipped_zero:
                skipped_zero = True
                if target_number == 26:
                    distance += 1
                    return distance
                continue
            
            distance += 1
            
            if current_num == target_number:
                return distance
            
            if distance >= 4:
                break
        
        return 999
    
    def _update_table1(self, actual: int, prev: int, prev2: int):
        """Update Table 1 hits (10 position codes)"""
        if not prev:
            return
            
        # Reference points for Table 1
        refs = {
            'ref0': 0,
            'ref19': 19,
            'prev': prev,
            'prev13opp': DIGIT_13_OPPOSITES.get(prev),
        }
        
        if prev2:
            refs['prevPlus1'] = prev2
            refs['prevPlus1_13opp'] = DIGIT_13_OPPOSITES.get(prev2)
        
        for ref_name, ref_num in refs.items():
            if ref_num is None:
                continue
            pos_code = self._calculate_position_code(ref_num, actual)
            
            key = f"{ref_name}_{pos_code}"
            if key not in self.table1_hits:
                self.table1_hits[key] = []
            self.table1_hits[key].append({
                'spin': len(self.spins),
                    'spinIdx': len(self.spins) - 1,
                'number': actual,
                'ref': ref_num
            })
    
    def _update_table2(self, actual: int, prev: int, prev2: int):
        """Update Table 2 hits (18 position codes)"""
        # Similar to Table 1 but with ±2 range
        # For now, using same logic as Table 1
        self._update_table1(actual, prev, prev2)
        self.table2_hits = self.table1_hits.copy()
    
    def _update_table3(self, actual: int, prev: int, prev2: int):
        """Update Table 3 hits (anchor projections)"""
        if not prev:
            return
        
        # Table 3 uses 13-digit opposites for projections
        refs = {
            'prev_C': prev,
            'prev_AC': prev,
            'prev13opp_C': DIGIT_13_OPPOSITES.get(prev),
            'prev13opp_AC': DIGIT_13_OPPOSITES.get(prev),
        }
        
        for ref_name, ref_num in refs.items():
            if ref_num is None:
                continue
            
            # Check if actual is within wheel range of ref
            ref_idx = WHEEL_STANDARD.index(ref_num if ref_num != 26 else 0)
            act_idx = WHEEL_STANDARD.index(actual if actual != 26 else 0)
            
            distance = abs(act_idx - ref_idx)
            if distance > 18:
                distance = 37 - distance
            
            if distance <= 5:  # Within range
                key = f"{ref_name}"
                if key not in self.table3_hits:
                    self.table3_hits[key] = []
                self.table3_hits[key].append({
                    'spin': len(self.spins),
                    'spinIdx': len(self.spins) - 1,
                    'number': actual,
                    'projection': actual,
                    'ref': ref_num
                })
    
    def get_hits_data(self) -> Dict:
        """Get current hits data for AI prediction"""
        return {
            'table1Hits': self.table1_hits,
            'table2Hits': self.table2_hits,
            'table3Hits': self.table3_hits,
            'currentSpinCount': len(self.spins),
            'recentSpins': self.spins[-10:] if len(self.spins) >= 10 else self.spins
        }
    
    def reset(self):
        """Reset all tables"""
        self.spins = []
        self.table1_hits = {}
        self.table2_hits = {}
        self.table3_hits = {}


class SessionSimulator:
    """Simulates a complete trading session for backtesting"""
    
    def __init__(self, starting_bankroll: int = 4000, session_target: int = 100):
        self.starting_bankroll = starting_bankroll
        self.session_target = session_target
        self.max_spins = 250  # Maximum spins before declaring failure
        
    def run_session(self, numbers: List[int], start_index: int) -> Dict:
        """
        Run a complete session starting from start_index
        Returns detailed session results
        """
        # Initialize
        table_sim = TableSimulator()
        ai = RouletteAI()
        money_mgr = MoneyManager(self.starting_bankroll, self.session_target)
        
        session_data = {
            'test_number': start_index + 1,
            'start_position': start_index,
            'start_number': numbers[start_index] if start_index < len(numbers) else None,
            'result': None,
            'spins_needed': 0,
            'final_bankroll': self.starting_bankroll,
            'total_bets': 0,
            'session_wins': 0,
            'session_losses': 0,
            'wins': 0,
            'losses': 0,
            'win_rate': 0.0,
            'trades': [],
            'max_drawdown': 0,
            'peak_bankroll': self.starting_bankroll
        }
        
        if start_index >= len(numbers):
            session_data['result'] = 'INSUFFICIENT_DATA'
            return session_data
        
        # Process spins
        spin_count = 0
        for i in range(start_index, len(numbers)):
            spin_count += 1
            current_number = numbers[i]
            
            # Add spin to table simulator
            table_sim.add_spin(current_number)
            
            # Check if we can predict (need at least 3 spins)
            if len(table_sim.spins) < 3:
                continue
            
            # Check bankroll limits
            if money_mgr.bankroll <= 0:
                session_data['result'] = 'BANKRUPT'
                session_data['final_bankroll'] = 0
                break
            
            if money_mgr.session_profit >= self.session_target:
                session_data['result'] = 'TARGET_REACHED'
                session_data['final_bankroll'] = money_mgr.bankroll
                break
            
            # Check max spins limit
            if spin_count >= self.max_spins:
                session_data['result'] = 'MAX_SPINS_EXCEEDED'
                session_data['final_bankroll'] = money_mgr.bankroll
                break
            
            # Get AI prediction
            hits_data = table_sim.get_hits_data()
            # Get AI prediction using predict_numbers
            table_data = {
                'table1Hits': hits_data['table1Hits'],
                'table2Hits': hits_data['table2Hits'],
                'table3Hits': hits_data['table3Hits'],
                'currentSpinCount': hits_data['currentSpinCount']
            }
            predicted_numbers, confidence, reasoning, anchor_groups = ai.predict_numbers(
                table_data,
                recent_spins=hits_data['recentSpins']
            )
            
            # Build prediction dict for compatibility
            prediction = {
                'can_predict': len(predicted_numbers) > 0 and confidence >= 0.70,
                'numbers': predicted_numbers,
                'confidence': confidence,
                'reasoning': reasoning
            }
            
            # Check if we should bet
            if not prediction['can_predict']:
                continue
            
            required_confidence = 0.75 if money_mgr.consecutive_losses >= 3 else 0.70
            if prediction['confidence'] < required_confidence:
                continue
            
            # Place bet
            bet_numbers = prediction['numbers']  # This stays the same
            bet_per_number = money_mgr.current_bet_per_number
            total_bet = bet_per_number * len(bet_numbers)
            
            # Check next number (peek ahead if available)
            if i + 1 < len(numbers):
                next_number = numbers[i + 1]
                hit = next_number in bet_numbers
                
                # Process result
                if hit:
                    profit = bet_per_number * 35  # 35:1 payout
                    money_mgr.bankroll += profit - total_bet
                    money_mgr.session_profit += profit - total_bet
                    session_data['total_bets'] += 1
                    session_data['session_wins'] += 1
                    money_mgr.consecutive_losses = 0
                    money_mgr.current_bet_per_number = max(2, money_mgr.current_bet_per_number - 1)
                else:
                    money_mgr.bankroll -= total_bet
                    money_mgr.session_profit -= total_bet
                    session_data['total_bets'] += 1
                    session_data['session_losses'] += 1
                    money_mgr.consecutive_losses += 1
                    money_mgr.current_bet_per_number += 1
                
                # Track trade
                session_data['trades'].append({
                    'spin': len(table_sim.spins),
                    'number_hit': next_number,
                    'prediction': bet_numbers,
                    'bet_amount': bet_per_number,
                    'total_bet': total_bet,
                    'hit': hit,
                    'profit': (profit - total_bet) if hit else -total_bet,
                    'bankroll': money_mgr.bankroll,
                    'confidence': prediction['confidence']
                })
                
                # Track peak and drawdown
                session_data['peak_bankroll'] = max(session_data['peak_bankroll'], money_mgr.bankroll)
                drawdown = session_data['peak_bankroll'] - money_mgr.bankroll
                session_data['max_drawdown'] = max(session_data['max_drawdown'], drawdown)
        
        # Finalize session data
        session_data['spins_needed'] = spin_count
        # Stats already tracked in session_data
        session_data['wins'] = session_data['session_wins']
        session_data['losses'] = session_data['session_losses']
        session_data['win_rate'] = (session_data['session_wins'] / session_data['total_bets'] * 100) if session_data['total_bets'] > 0 else 0
        session_data['final_bankroll'] = money_mgr.bankroll
        
        if session_data['result'] is None:
            session_data['result'] = 'INCOMPLETE'
        
        return session_data


def run_full_backtest(numbers: List[int], progress_callback=None) -> List[Dict]:
    """
    Run complete backtest on all numbers
    Tests starting from each position until end of data
    
    Args:
        numbers: List of historical spin numbers
        progress_callback: Optional callback(current, total) for progress updates
    
    Returns:
        List of session results
    """
    results = []
    total_tests = len(numbers)
    
    simulator = SessionSimulator()
    
    for i in range(total_tests - 10):  # Need at least 10 spins for a test
        session_result = simulator.run_session(numbers, i)
        results.append(session_result)
        
        if progress_callback:
            progress_callback(i + 1, total_tests)
    
    return results


def calculate_analytics(results: List[Dict]) -> Dict:
    """Calculate analytics from backtest results"""
    
    total_sessions = len(results)
    successful = [r for r in results if r['result'] == 'TARGET_REACHED']
    failed_bankrupt = [r for r in results if r['result'] == 'BANKRUPT']
    failed_max_spins = [r for r in results if r['result'] == 'MAX_SPINS_EXCEEDED']
    
    analytics = {
        'total_sessions': total_sessions,
        'successful_count': len(successful),
        'failed_bankrupt_count': len(failed_bankrupt),
        'failed_max_spins_count': len(failed_max_spins),
        'success_rate': (len(successful) / total_sessions * 100) if total_sessions > 0 else 0,
        'failure_rate': ((len(failed_bankrupt) + len(failed_max_spins)) / total_sessions * 100) if total_sessions > 0 else 0,
        
        # Successful sessions stats
        'avg_spins_to_win': sum(r['spins_needed'] for r in successful) / len(successful) if successful else 0,
        'min_spins_to_win': min((r['spins_needed'] for r in successful), default=0),
        'max_spins_to_win': max((r['spins_needed'] for r in successful), default=0),
        'avg_win_rate': sum(r['win_rate'] for r in successful) / len(successful) if successful else 0,
        
        # Failed sessions stats
        'avg_spins_to_lose': sum(r['spins_needed'] for r in failed_bankrupt) / len(failed_bankrupt) if failed_bankrupt else 0,
        
        # Best and worst
        'best_session': max(results, key=lambda x: x['final_bankroll']) if results else None,
        'worst_session': min(results, key=lambda x: x['final_bankroll']) if results else None,
        
        # Overall stats
        'avg_final_bankroll': sum(r['final_bankroll'] for r in results) / total_sessions if total_sessions > 0 else 0,
        'total_trades': sum(r['total_bets'] for r in results),
        'total_wins': sum(r['wins'] for r in results),
        'total_losses': sum(r['losses'] for r in results),
        'overall_win_rate': (sum(r['wins'] for r in results) / sum(r['total_bets'] for r in results) * 100) if sum(r['total_bets'] for r in results) > 0 else 0,
        
        # Risk metrics
        'avg_max_drawdown': sum(r['max_drawdown'] for r in results) / total_sessions if total_sessions > 0 else 0,
        'max_drawdown_overall': max((r['max_drawdown'] for r in results), default=0),
    }
    
    return analytics