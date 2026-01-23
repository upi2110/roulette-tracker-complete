"""
AI Engine V6 - NEW STRATEGY - FIXED ANCHOR CALCULATION
=======================================================

Anchor Definition: Number with BOTH left AND right neighbors in bet list
Loose Definition: Numbers without both neighbors covered
"""

import logging
from typing import Dict, List, Set, Tuple, Optional
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s.%(msecs)03d] [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)

class AIEngineV6:
    """
    New prediction engine implementing the refined strategy
    """
    
    def __init__(self):
        self.consecutive_losses = 0
        self.consecutive_wins = 0
        self.total_session_loss = 0.0
        
        # European wheel order
        self.WHEEL_ORDER = [
            0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
            5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
        ]
        
        # 13-digit opposites mapping (from user's frontend code)
        self.DIGIT_13_OPPOSITES = {
            0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
            10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
            19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
            28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
        }
        
        # Priority patterns (highest priority)
        self.GOLDEN_PATTERNS = ['S+0', 'S+1', 'S-1', 'O+0', 'O+1', 'O-1']
        self.HIGH_PRIORITY_PATTERNS = ['S+0', 'S+1', 'S-1', 'O+0', 'O+1', 'O-1']
    
    def _normalize_number(self, num: int) -> int:
        """
        Convert 26 to 0 for internal calculations (same wheel position)
        0 and 26 are the same position on the wheel
        """
        return 0 if num == 26 else num
    
    def _normalize_list(self, numbers: List[int]) -> List[int]:
        """
        Convert all 26s to 0s in list, remove duplicates
        Used for comparing sets where 0 and 26 should be treated as same
        """
        normalized = [self._normalize_number(n) for n in numbers]
        return list(set(normalized))  # Remove duplicates
    
    def _ensure_0_26_paired(self, numbers: List[int]) -> List[int]:
        """
        Ensure if 0 OR 26 is in list, BOTH are present
        This is the final betting rule: always bet both 0 and 26 together
        """
        result = list(numbers)
        has_0 = 0 in result
        has_26 = 26 in result
        
        if has_0 and not has_26:
            result.append(26)
            logging.info(f"   🎰 Added 26 (betting rule: always bet 0 and 26 together)")
        elif has_26 and not has_0:
            result.append(0)
            logging.info(f"   🎰 Added 0 (betting rule: always bet 0 and 26 together)")
        
        return sorted(result)
    
    def _apply_zero_region_rule(self, numbers: List[int], anchors: List[int]) -> List[int]:
        """
        Special rule for 0/26 wheel wrap region
        
        Since 0 and 26 are the same wheel position, special neighbor rules apply:
        - For anchor 3: Add 35, 3, 26, 0
        - For anchor 26 or 0: Add 3, 26, 0, 32
        - For anchor 32: Add 26, 0, 32, 15
        """
        anchors_set = set(anchors)
        numbers_set = set(numbers)
        added = []
        
        # Check which special numbers are anchors
        if 3 in anchors_set:
            # Add: 35, 3, 26, 0
            for num in [35, 3, 26, 0]:
                if num not in numbers_set:
                    numbers.append(num)
                    numbers_set.add(num)
                    added.append(num)
                    
        if 26 in anchors_set or 0 in anchors_set:
            # Add: 3, 26, 0, 32
            for num in [3, 26, 0, 32]:
                if num not in numbers_set:
                    numbers.append(num)
                    numbers_set.add(num)
                    added.append(num)
                    
        if 32 in anchors_set:
            # Add: 26, 0, 32, 15
            for num in [26, 0, 32, 15]:
                if num not in numbers_set:
                    numbers.append(num)
                    numbers_set.add(num)
                    added.append(num)
        
        if added:
            logging.info(f"\n🔄 ZERO REGION RULE APPLIED:")
            logging.info(f"   Added numbers: {sorted(added)}")
            logging.info(f"   (0/26 wrap region special neighbors)")
        
        return sorted(numbers)
    
    def _pair_has_golden(self, pair_data: Dict) -> bool:
        """Check if a pair has golden patterns in its hits"""
        hits = pair_data.get('hits', [])
        for hit in hits:
            if hit.get('posCode', 'XX') in self.GOLDEN_PATTERNS:
                return True
        return False
        
    def predict(self, table_data: Dict) -> Dict:
        """
        Main prediction function using new strategy
        """
        
        logging.info("="*80)
        logging.info("🎯 AI ENGINE V6 - NEW STRATEGY")
        logging.info("="*80)
        
        # Check if we have enough data
        if not self._has_sufficient_data(table_data):
            return self._return_wait("Insufficient data - need at least 3 spins")
        
        try:
            # STEP 1: Find pairs with consecutive hits from Table 3
            logging.info("\n" + "="*80)
            logging.info("STEP 1: FIND PAIRS WITH CONSECUTIVE HITS")
            logging.info("="*80)
            
            confirmed_pairs = self._find_confirmed_pairs(table_data['table3Hits'])
            
            if not confirmed_pairs:
                return self._return_wait("No confirmed pairs found in Table 3")
            
            # STEP 2: Select top 2 pairs
            logging.info("\n" + "="*80)
            logging.info("STEP 2: SELECT TOP 2 PAIRS")
            logging.info("="*80)
            
            top_2_pairs = self._select_top_2_pairs(confirmed_pairs)
            
            if len(top_2_pairs) < 2:
                return self._return_wait("Need at least 2 confirmed pairs")
            
            # STEP 3: Get NEXT row projections
            logging.info("\n" + "="*80)
            logging.info("STEP 3: GET NEXT ROW PROJECTIONS")
            logging.info("="*80)
            
            next_projections = table_data.get('table3NextProjections', {})
            
            if not next_projections:
                return self._return_wait("No NEXT row projections available")
            
            # Check if either pair has ideal number count (10-14 numbers)
            pair1_numbers = next_projections.get(top_2_pairs[0], {}).get('numbers', [])
            pair2_numbers = next_projections.get(top_2_pairs[1], {}).get('numbers', []) if len(top_2_pairs) > 1 else []
            
            pair1_ideal = 10 <= len(pair1_numbers) <= 14
            pair2_ideal = 10 <= len(pair2_numbers) <= 14
            
            # Track if we used ideal count rule
            used_ideal_count_rule = False
            
            if pair1_ideal or pair2_ideal:
                # SPECIAL CASE: One pair has ideal count (10-14 numbers)
                # Use it directly without comparison
                used_ideal_count_rule = True
                
                logging.info("\n" + "="*80)
                logging.info("🎯 SPECIAL CASE: PAIR HAS IDEAL NUMBER COUNT (10-14)")
                logging.info("="*80)
                logging.info("   Skipping common pool calculation")
                logging.info("   Using the ideal pair directly")
                
                logging.info(f"\n   Pair 1 ({top_2_pairs[0]}): {len(pair1_numbers)} numbers{' ✅ IDEAL' if pair1_ideal else ''}")
                logging.info(f"   Pair 2 ({top_2_pairs[1]}): {len(pair2_numbers)} numbers{' ✅ IDEAL' if pair2_ideal else ''}")
                
                # Use the ideal pair, prefer the one closest to 12
                if pair1_ideal and pair2_ideal:
                    # Both ideal - use one closest to 12
                    if abs(len(pair1_numbers) - 12) <= abs(len(pair2_numbers) - 12):
                        common_numbers = pair1_numbers
                        selected_pairs = [top_2_pairs[0]]
                        logging.info(f"\n   ✅ Selected {top_2_pairs[0]} ({len(common_numbers)} numbers, closest to 12)")
                    else:
                        common_numbers = pair2_numbers
                        selected_pairs = [top_2_pairs[1]]
                        logging.info(f"\n   ✅ Selected {top_2_pairs[1]} ({len(common_numbers)} numbers, closest to 12)")
                elif pair1_ideal:
                    common_numbers = pair1_numbers
                    selected_pairs = [top_2_pairs[0]]
                    logging.info(f"\n   ✅ Selected {top_2_pairs[0]} ({len(common_numbers)} numbers)")
                else:
                    common_numbers = pair2_numbers
                    selected_pairs = [top_2_pairs[1]]
                    logging.info(f"\n   ✅ Selected {top_2_pairs[1]} ({len(common_numbers)} numbers)")
            else:
                # NORMAL CASE: Find common numbers
                logging.info("\n" + "="*80)
                logging.info("STEP 4: FIND COMMON NUMBERS")
                logging.info("="*80)
                
                common_numbers, selected_pairs = self._get_common_numbers(
                    top_2_pairs, 
                    next_projections, 
                    confirmed_pairs
                )
            
            if not common_numbers:
                return self._return_wait("No common numbers found between top pairs")
            
            # STEP 5: Filter to 12 if needed
            logging.info("\n" + "="*80)
            logging.info("STEP 5: FILTER TO 12 NUMBERS (IF NEEDED)")
            logging.info("="*80)
            
            final_numbers, filtering_applied = self._filter_to_12(
                common_numbers,
                table_data.get('table1Hits', {}),
                table_data.get('table2Hits', {})
            )
            
            # Apply betting rule: if 0 OR 26 in predictions, always bet BOTH
            final_numbers = self._ensure_0_26_paired(final_numbers)
            
            # Apply zero region rule: expand neighbors for wrap point anchors
            # Get all purple and green anchors from selected projections
            all_anchors = []
            for pair_name in selected_pairs:
                pair_proj = next_projections.get(pair_name, {})
                all_anchors.extend(pair_proj.get('anchors', []))  # Purple anchors
                all_anchors.extend(pair_proj.get('neighbors', []))  # Green anchors
            
            final_numbers = self._apply_zero_region_rule(final_numbers, all_anchors)
            
            # STEP 6: Calculate REAL anchors based on wheel neighbors
            logging.info("\n" + "="*80)
            logging.info("STEP 6: CALCULATE ANCHORS (WHEEL NEIGHBOR METHOD)")
            logging.info("="*80)
            
            anchors, loose = self._calculate_wheel_anchors(final_numbers)
            
            # STEP 7: Calculate confidence
            logging.info("\n" + "="*80)
            logging.info("STEP 7: CALCULATE CONFIDENCE")
            logging.info("="*80)
            
            confidence = self._calculate_confidence(
                confirmed_pairs,
                selected_pairs,
                len(common_numbers),
                len(final_numbers),
                filtering_applied
            )
            
            # STEP 8: Make decision
            logging.info("\n" + "="*80)
            logging.info("STEP 8: MAKE DECISION")
            logging.info("="*80)
            
            signal = self._make_decision(confidence, confirmed_pairs, selected_pairs)
            
            # STEP 9: Prepare response
            # Determine strategy text based on whether ideal count rule was used
            if used_ideal_count_rule:
                strategy_text = '🌟 GOLDEN RULE - Ideal Count (10-14 numbers) 🌟'
            else:
                strategy_text = 'V6 - Common Numbers from Top 2 Pairs'
            
            response = {
                'signal': signal,
                'numbers': final_numbers,
                'full_pool': common_numbers,
                'anchors': anchors,
                'loose': loose,
                'confidence': round(confidence, 2),
                'can_predict': True,
                'reasoning': {
                    'strategy': strategy_text,
                    'used_ideal_count_rule': used_ideal_count_rule,
                    'selected_pairs': selected_pairs,
                    'pair1_hits': confirmed_pairs[selected_pairs[0]]['count'],
                    'pair2_hits': confirmed_pairs[selected_pairs[1]]['count'] if len(selected_pairs) > 1 else 0,
                    'pair1_numbers': next_projections.get(selected_pairs[0], {}).get('numbers', []),
                    'pair2_numbers': next_projections.get(selected_pairs[1], {}).get('numbers', []) if len(selected_pairs) > 1 else [],
                    'pair1_purple': next_projections.get(selected_pairs[0], {}).get('anchors', []),
                    'pair2_purple': next_projections.get(selected_pairs[1], {}).get('anchors', []) if len(selected_pairs) > 1 else [],
                    'pair1_green': next_projections.get(selected_pairs[0], {}).get('neighbors', []),
                    'pair2_green': next_projections.get(selected_pairs[1], {}).get('neighbors', []) if len(selected_pairs) > 1 else [],
                    'common_pool_size': len(common_numbers),
                    'final_pool_size': len(final_numbers),
                    'filtering_applied': filtering_applied,
                    'consecutive_losses': self.consecutive_losses
                }
            }
            
            # Print decision summary
            self._print_decision_summary(response)
            
            return response
            
        except Exception as e:
            logging.error(f"❌ Error in prediction: {e}")
            import traceback
            traceback.print_exc()
            return self._return_wait(f"Error: {str(e)}")
    
    def _calculate_wheel_anchors(self, numbers: List[int]) -> Tuple[List[int], List[int]]:
        """
        Calculate anchors based on wheel neighbors
        
        ANCHOR = Number with BOTH left AND right neighbors in the bet list
        LOOSE = Number without both neighbors covered
        
        Args:
            numbers: List of numbers to analyze
            
        Returns:
            (anchors, loose_numbers)
        """
        
        anchors = []
        loose = []
        
        for num in numbers:
            # Find position on wheel
            try:
                idx = self.WHEEL_ORDER.index(num)
            except ValueError:
                # Number not on wheel (shouldn't happen)
                loose.append(num)
                continue
            
            # Get left and right neighbors
            left_idx = (idx - 1) % len(self.WHEEL_ORDER)
            right_idx = (idx + 1) % len(self.WHEEL_ORDER)
            
            left_neighbor = self.WHEEL_ORDER[left_idx]
            right_neighbor = self.WHEEL_ORDER[right_idx]
            
            # Normalize for comparison: treat 0 and 26 as same position
            numbers_normalized = self._normalize_list(numbers)
            left_normalized = self._normalize_number(left_neighbor)
            right_normalized = self._normalize_number(right_neighbor)
            
            # Check if BOTH neighbors are in bet list
            has_left = left_normalized in numbers_normalized
            has_right = right_normalized in numbers_normalized
            
            if has_left and has_right:
                # BOTH neighbors present = ANCHOR
                anchors.append(num)
            else:
                # Missing at least one neighbor = LOOSE
                loose.append(num)
        
        anchors.sort()
        loose.sort()
        
        logging.info(f"\n⭐ ANCHORS IDENTIFIED (BOTH neighbors covered):")
        logging.info(f"   Anchors: {anchors}")
        logging.info(f"   Total: {len(anchors)}")
        
        logging.info(f"\n💗 LOOSE NUMBERS (missing neighbors):")
        logging.info(f"   Numbers: {loose}")
        logging.info(f"   Total: {len(loose)}")
        
        return anchors, loose
    
    def _find_confirmed_pairs(self, table3_hits: Dict) -> Dict:
        """
        Find pairs with 2+ consecutive hits with consistent position codes
        
        CRITICAL: Only count hits as "consecutive" if they include the MOST RECENT spin!
        If the most recent spin broke the streak, consecutive count = 0
        """
        
        confirmed_pairs = {}
        
        # Check each projection type
        for proj_type, hits_data in table3_hits.items():
            if not isinstance(hits_data, list):
                continue
            
            if len(hits_data) < 2:
                continue
            
            # Get the most recent spin number (LAST element in array, as it's ordered oldest to newest)
            most_recent_spin = hits_data[-1].get('actual', -1)
            
            # Check for consecutive hits starting from most recent
            consecutive_count = 1
            priority_sum = 0
            pattern_codes = []
            
            for i in range(len(hits_data)):
                hit = hits_data[i]
                pos_code = hit.get('posCode', 'XX')
                
                if pos_code == 'XX':
                    # XX means miss - streak broken
                    if i == 0:
                        # Most recent spin was a miss - no consecutive hits
                        consecutive_count = 0
                    break
                
                pattern_codes.append(pos_code)
                priority = self._get_priority(pos_code)
                priority_sum += priority
                
                if i > 0:
                    prev_hit = hits_data[i-1]
                    prev_code = prev_hit.get('posCode', 'XX')
                    
                    if prev_code == 'XX':
                        # Previous hit was a miss - stop counting
                        break
                    
                    if self._is_consistent(prev_code, pos_code):
                        consecutive_count += 1
                    else:
                        # Pattern not consistent - stop counting
                        break
            
            # CRITICAL CHECK: Verify if most recent spin is included in the consecutive count
            if consecutive_count > 0:
                # Get the last spin included in the consecutive sequence
                last_hit_index = consecutive_count - 1
                last_hit_in_sequence = hits_data[last_hit_index]
                last_spin_in_sequence = last_hit_in_sequence.get('actual', -1)
                
                # If the last hit in sequence is NOT the most recent spin, streak was broken
                if last_spin_in_sequence != most_recent_spin:
                    logging.info(f"❌ {proj_type}: Streak broken by most recent spin")
                    logging.info(f"   Last hit in sequence: Spin {last_spin_in_sequence}, Most recent: Spin {most_recent_spin}")
                    logging.info(f"   Pattern from history: {' → '.join(pattern_codes[:consecutive_count])}")
                    consecutive_count = 0
            
            if consecutive_count >= 2:
                avg_priority = priority_sum // consecutive_count if consecutive_count > 0 else 0
                
                confirmed_pairs[proj_type] = {
                    'count': consecutive_count,
                    'priority': avg_priority,
                    'hits': hits_data[:consecutive_count]
                }
                
                pattern_str = ' → '.join(pattern_codes[:consecutive_count])
                logging.info(f"✅ {proj_type}: {consecutive_count} consecutive hits, priority={avg_priority}")
                logging.info(f"   Pattern: {pattern_str}")
            elif consecutive_count == 1 and hits_data[0].get('posCode', 'XX') != 'XX':
                # Had 1 hit but need at least 2
                logging.info(f"⚠️  {proj_type}: Only 1 hit (need 2+)")
            elif hits_data[0].get('posCode', 'XX') == 'XX':
                # Most recent was a miss
                logging.info(f"❌ {proj_type}: Streak broken (most recent spin was a miss)")
        
        logging.info(f"\n📊 Total confirmed pairs: {len(confirmed_pairs)}")
        
        return confirmed_pairs
    
    def _get_priority(self, pos_code: str) -> int:
        """Get priority score for position code"""
        if pos_code in ['S+0', 'O+0']:
            return 1
        elif pos_code in ['S+1', 'S-1', 'O+1', 'O-1']:
            return 2
        elif pos_code.startswith('S') or pos_code.startswith('O'):
            # Extract offset from codes like SR+3, SL-2, OR+1, OL-4
            try:
                # Find the +/- sign position
                if '+' in pos_code:
                    offset = abs(int(pos_code.split('+')[1]))
                elif '-' in pos_code:
                    offset = abs(int(pos_code.split('-')[1]))
                else:
                    offset = 0
                return 3 + offset
            except (ValueError, IndexError):
                return 99
        return 99
    
    def _is_consistent(self, prev_code: str, curr_code: str) -> bool:
        """Check if position codes are consistent"""
        if prev_code == 'XX' or curr_code == 'XX':
            return False
        
        def extract_offset(code):
            """Extract numerical offset from position code"""
            try:
                if '+' in code:
                    return abs(int(code.split('+')[1]))
                elif '-' in code:
                    return abs(int(code.split('-')[1]))
                else:
                    return 0
            except (ValueError, IndexError):
                return 0
        
        prev_offset = extract_offset(prev_code)
        curr_offset = extract_offset(curr_code)
        
        offset_change = abs(prev_offset - curr_offset)
        return offset_change <= 1
    
    def _select_top_2_pairs(self, confirmed_pairs: Dict) -> List[str]:
        """
        Select top 2 pairs with GOLDEN PATTERN PRIORITY
        
        Priority order:
        1. Pairs with golden patterns (S+0, S±1, O+0, O±1) - HIGHEST PRIORITY
        2. Then by consecutive hits
        3. Then by position code priority
        """
        
        pairs_with_scores = []
        
        for pair_name, data in confirmed_pairs.items():
            # Check if this pair has golden patterns
            has_golden = False
            golden_codes = []
            for hit in data['hits']:
                if hit['posCode'] in self.GOLDEN_PATTERNS:
                    has_golden = True
                    golden_codes.append(hit['posCode'])
            
            pairs_with_scores.append({
                'name': pair_name,
                'hits': data['count'],
                'priority': data['priority'],
                'has_golden': has_golden,
                'golden_codes': golden_codes
            })
        
        # Sort by: 1) golden pattern (True first), 2) hits (desc), 3) priority (asc = lower is better)
        pairs_with_scores.sort(key=lambda x: (not x['has_golden'], -x['hits'], x['priority']))
        
        top_2 = [p['name'] for p in pairs_with_scores[:2]]
        
        logging.info(f"\n🎯 SELECTED TOP 2 PAIRS:")
        for i, pair_data in enumerate(pairs_with_scores[:2], 1):
            golden_mark = f" 🌟 GOLDEN ({', '.join(pair_data['golden_codes'])})" if pair_data['has_golden'] else ""
            logging.info(f"   #{i}: {pair_data['name']}{golden_mark}")
            logging.info(f"       Consecutive hits: {pair_data['hits']}")
            logging.info(f"       Priority score: {pair_data['priority']}")
        
        return top_2
    
    def _get_common_numbers(
        self, 
        top_2_pairs: List[str],
        next_projections: Dict,
        confirmed_pairs: Dict
    ) -> Tuple[List[int], List[str]]:
        """Get common numbers between top 2 pairs' NEXT projections"""
        
        pair1_name = top_2_pairs[0]
        pair2_name = top_2_pairs[1]
        
        # Get full projection data
        pair1_data = next_projections.get(pair1_name, {})
        pair2_data = next_projections.get(pair2_name, {})
        
        pair1_proj = pair1_data.get('numbers', [])
        pair2_proj = pair2_data.get('numbers', [])
        
        logging.info(f"\n📊 PAIR 1 ({pair1_name}) NEXT projections:")
        logging.info(f"   Purple anchors: {sorted(pair1_data.get('anchors', []))}")
        logging.info(f"   Green anchors: {sorted(pair1_data.get('neighbors', []))}")
        logging.info(f"   Total numbers ({len(pair1_proj)}):")
        # Print numbers in rows of 10
        sorted_nums = sorted(pair1_proj)
        for i in range(0, len(sorted_nums), 10):
            chunk = sorted_nums[i:i+10]
            logging.info(f"      {chunk}")
        
        logging.info(f"\n📊 PAIR 2 ({pair2_name}) NEXT projections:")
        logging.info(f"   Purple anchors: {sorted(pair2_data.get('anchors', []))}")
        logging.info(f"   Green anchors: {sorted(pair2_data.get('neighbors', []))}")
        logging.info(f"   Total numbers ({len(pair2_proj)}):")
        # Print numbers in rows of 10
        sorted_nums = sorted(pair2_proj)
        for i in range(0, len(sorted_nums), 10):
            chunk = sorted_nums[i:i+10]
            logging.info(f"      {chunk}")
        
        # Normalize: treat 0 and 26 as same number for comparison
        pair1_normalized = self._normalize_list(pair1_proj)
        pair2_normalized = self._normalize_list(pair2_proj)
        
        # Find intersection on normalized lists
        common_normalized = list(set(pair1_normalized) & set(pair2_normalized))
        
        # Convert back: if 0 is common, include both 0 and 26 if either was in original
        common = []
        for num in common_normalized:
            common.append(num)
            # If 0 is common and either pair had 26, include 26 too
            if num == 0:
                if 26 in pair1_proj or 26 in pair2_proj:
                    common.append(26)
        
        common.sort()
        
        if common:
            logging.info(f"\n✅ COMMON NUMBERS FOUND (0 and 26 treated as same):")
            logging.info(f"   Total: {len(common)}")
            # Print in rows of 10
            for i in range(0, len(common), 10):
                chunk = common[i:i+10]
                logging.info(f"   {chunk}")
            
            # Show breakdown
            only_pair1 = sorted(list(set(pair1_proj) - set(common)))
            only_pair2 = sorted(list(set(pair2_proj) - set(common)))
            
            if only_pair1:
                logging.info(f"\n   📌 Only in {pair1_name} ({len(only_pair1)} numbers):")
                for i in range(0, len(only_pair1), 10):
                    chunk = only_pair1[i:i+10]
                    logging.info(f"      {chunk}")
            if only_pair2:
                logging.info(f"\n   📌 Only in {pair2_name} ({len(only_pair2)} numbers):")
                for i in range(0, len(only_pair2), 10):
                    chunk = only_pair2[i:i+10]
                    logging.info(f"      {chunk}")
            
            return common, [pair1_name, pair2_name]
        
        logging.info(f"\n⚠️  NO COMMON NUMBERS!")
        logging.info(f"   Using pair with fewer hits...")
        
        pair1_hits = confirmed_pairs[pair1_name]['count']
        pair2_hits = confirmed_pairs[pair2_name]['count']
        
        if pair1_hits < pair2_hits:
            logging.info(f"   Selected: {pair1_name} ({pair1_hits} hits < {pair2_hits} hits)")
            return pair1_proj, [pair1_name]
        else:
            logging.info(f"   Selected: {pair2_name} ({pair2_hits} hits < {pair1_hits} hits)")
            return pair2_proj, [pair2_name]
    
    def _filter_to_12(
        self,
        common_numbers: List[int],
        table1_hits: Dict,
        table2_hits: Dict
    ) -> Tuple[List[int], bool]:
        """
        Filter to 12 numbers using Table 1 & 2 if common > 12
        
        NOTE: 13-digit opposites are already included in projections as GREEN anchors,
        so we don't need to add them here
        
        Returns:
            (final_numbers, filtering_applied)
        """
        
        logging.info(f"\n📊 FILTERING DECISION:")
        logging.info(f"   Common pool size: {len(common_numbers)}")
        
        if len(common_numbers) <= 12:
            logging.info(f"   ✅ No filtering needed (≤ 12 numbers)")
            logging.info(f"   ℹ️  13-digit opposites already included (green anchors in projections)")
            
            final_list = sorted(common_numbers)
        else:
            logging.info(f"   🔍 Filtering needed (> 12 numbers)")
            # Simple filtering: take first 12
            final = common_numbers[:12]
            logging.info(f"   ✅ Filtered to {len(final)} numbers")
            logging.info(f"   ℹ️  13-digit opposites already included (green anchors in projections)")
            
            final_list = sorted(final)
        
        logging.info(f"\n📊 FINAL POOL: {len(final_list)} numbers")
        logging.info(f"   Numbers: {final_list}")
        
        return final_list, len(common_numbers) > 12
    
    def _calculate_confidence(
        self,
        confirmed_pairs: Dict,
        selected_pairs: List[str],
        common_pool_size: int,
        final_pool_size: int,
        filtering_applied: bool
    ) -> float:
        """Calculate confidence based on new strategy factors"""
        
        confidence = 70.0
        
        has_priority = False
        for pair_name in selected_pairs:
            hits = confirmed_pairs[pair_name]['hits']
            for hit in hits:
                if hit['posCode'] in self.HIGH_PRIORITY_PATTERNS:
                    has_priority = True
                    break
        
        if has_priority:
            confidence += 15
            logging.info(f"   +15% Priority patterns (S+0, O+0, etc.)")
        
        if len(confirmed_pairs) > 2:
            confidence += 10
            logging.info(f"   +10% Multiple confirmations ({len(confirmed_pairs)} pairs)")
        
        max_hits = max([data['count'] for data in confirmed_pairs.values()])
        if max_hits >= 4:
            confidence += 5
            logging.info(f"   +5% High consecutive hits ({max_hits})")
        
        if self.consecutive_losses > 0:
            penalty = min(self.consecutive_losses * 5, 25)
            confidence -= penalty
            logging.info(f"   -{penalty}% Consecutive losses ({self.consecutive_losses})")
        
        confidence = min(confidence, 95.0)
        
        logging.info(f"\n📊 FINAL CONFIDENCE: {confidence}%")
        
        return confidence
    
    def _make_decision(self, confidence: float, confirmed_pairs: Dict, selected_pairs: List[str]) -> str:
        """Make betting decision based on rules"""
        
        logging.info(f"\n📊 DECISION LOGIC:")
        logging.info(f"   Base confidence: {confidence}%")
        logging.info(f"   Consecutive losses: {self.consecutive_losses}")
        logging.info(f"   Total session loss: ${self.total_session_loss:.2f}")
        
        has_golden = self._has_golden_patterns(confirmed_pairs, selected_pairs)
        logging.info(f"   Has golden patterns: {has_golden}")
        
        if self.total_session_loss >= 1000:
            logging.info(f"\n⚠️  EMERGENCY MODE: Lost ${self.total_session_loss:.2f} >= $1000")
            if confidence >= 90.0 and has_golden:
                logging.info(f"✅ DECISION: BET NOW (90%+ confidence AND golden patterns)")
                return "BET NOW"
            else:
                reason = []
                if confidence < 90.0:
                    reason.append(f"confidence {confidence}% < 90%")
                if not has_golden:
                    reason.append("no golden patterns")
                logging.info(f"⏸️  DECISION: WAIT ({', '.join(reason)})")
                return "WAIT"
        
        if self.consecutive_losses >= 3:
            logging.info(f"\n⚠️  CAUTION MODE: {self.consecutive_losses} consecutive losses")
            if confidence >= 80.0:
                logging.info(f"✅ DECISION: BET NOW (80%+ confidence after losses)")
                return "BET NOW"
            else:
                logging.info(f"⏸️  DECISION: WAIT (confidence {confidence}% < 80%)")
                return "WAIT"
        
        if confidence >= 70.0:
            logging.info(f"\n✅ DECISION: BET NOW (confidence {confidence}% >= 70%)")
            return "BET NOW"
        else:
            logging.info(f"\n⏸️  DECISION: WAIT (confidence {confidence}% < 70%)")
            return "WAIT"
    
    def _has_golden_patterns(self, confirmed_pairs: Dict, selected_pairs: List[str]) -> bool:
        """Check if selected pairs have golden patterns"""
        for pair_name in selected_pairs:
            if pair_name not in confirmed_pairs:
                continue
            
            hits = confirmed_pairs[pair_name]['hits']
            for hit in hits:
                if hit['posCode'] in self.GOLDEN_PATTERNS:
                    return True
        
        return False
    
    def _print_decision_summary(self, response: Dict):
        """Print summary with all numbers visible"""
        
        logging.info("\n")
        logging.info("╔" + "="*78 + "╗")
        logging.info("║" + " "*25 + "📊 DECISION SUMMARY" + " "*34 + "║")
        logging.info("╠" + "="*78 + "╣")
        
        reasoning = response['reasoning']
        
        logging.info("║ 1️⃣  SELECTED PAIRS:" + " "*58 + "║")
        
        for i, pair_name in enumerate(reasoning['selected_pairs'], 1):
            hits = reasoning.get(f'pair{i}_hits', 0)
            purple = reasoning.get(f'pair{i}_purple', [])
            green = reasoning.get(f'pair{i}_green', [])
            numbers = reasoning.get(f'pair{i}_numbers', [])
            
            # Pair name
            line = f"    Pair {i}: {pair_name:<15} ({hits} consecutive hits)"
            padding = " " * (78 - len(line))
            logging.info(f"║{line}{padding}║")
            
            # Purple anchors (on one or more lines if needed)
            purple_str = str(sorted(purple)) if purple else "[]"
            self._print_wrapped_line(f"       Purple: {purple_str}", 10)
            
            # Green anchors (on one or more lines if needed)
            green_str = str(sorted(green)) if green else "[]"
            self._print_wrapped_line(f"       Green: {green_str}", 10)
            
            # Total numbers (on multiple lines if needed)
            if numbers:
                nums_sorted = sorted(numbers)
                nums_str = ", ".join(str(n) for n in nums_sorted)
                self._print_wrapped_line(f"       All {len(numbers)} nums: {nums_str}", 10)
        
        logging.info("╠" + "="*78 + "╣")
        
        # Common pool
        pool_line = f" 2️⃣  COMMON POOL: {reasoning['common_pool_size']} numbers"
        padding = " " * (78 - len(pool_line))
        logging.info(f"║{pool_line}{padding}║")
        
        common = sorted(response.get('full_pool', []))
        if common:
            common_str = ", ".join(str(n) for n in common)
            self._print_wrapped_line(f"    {common_str}", 4)
        
        logging.info("╠" + "="*78 + "╣")
        
        # Final numbers
        final_line = f" 3️⃣  FINAL NUMBERS: {reasoning['final_pool_size']} numbers"
        padding = " " * (78 - len(final_line))
        logging.info(f"║{final_line}{padding}║")
        
        anchors = sorted(response['anchors'])
        if anchors:
            anchors_str = ", ".join(str(n) for n in anchors)
            self._print_wrapped_line(f"    Anchors: {anchors_str}", 4)
        
        loose = sorted(response['loose'])
        if loose:
            loose_str = ", ".join(str(n) for n in loose)
            self._print_wrapped_line(f"    Loose: {loose_str}", 4)
        
        logging.info("╠" + "="*78 + "╣")
        
        # Decision
        logging.info("║ 4️⃣  DECISION:" + " "*64 + "║")
        decision_line = f"    Signal: {response['signal']:<15} Confidence: {response['confidence']}%"
        padding = " " * (78 - len(decision_line))
        logging.info(f"║{decision_line}{padding}║")
        
        logging.info("╚" + "="*78 + "╝")
    
    def _print_wrapped_line(self, text: str, indent: int):
        """Print text wrapped across multiple lines if needed"""
        max_width = 76  # Leave room for box borders
        indent_str = " " * indent
        
        # If text fits, print it
        if len(text) <= max_width:
            padding = " " * (78 - len(text))
            logging.info(f"║{text}{padding}║")
            return
        
        # Otherwise, wrap it
        words = text.split(", ")
        current_line = words[0]
        
        for word in words[1:]:
            # Check if adding next word would exceed width
            test_line = current_line + ", " + word
            if len(test_line) <= max_width:
                current_line = test_line
            else:
                # Print current line and start new one
                padding = " " * (78 - len(current_line))
                logging.info(f"║{current_line}{padding}║")
                current_line = indent_str + word
        
        # Print last line
        if current_line:
            padding = " " * (78 - len(current_line))
            logging.info(f"║{current_line}{padding}║")
    
    def _has_sufficient_data(self, table_data: Dict) -> bool:
        """Check if we have enough data"""
        return table_data.get('currentSpinCount', 0) >= 3
    
    def _return_wait(self, reason: str) -> Dict:
        """Return WAIT signal"""
        logging.info(f"\n⏸️  WAIT: {reason}")
        
        return {
            'signal': 'WAIT',
            'numbers': [],
            'full_pool': [],
            'anchors': [],
            'loose': [],
            'confidence': 0,
            'can_predict': False,
            'reasoning': {
                'reason': reason
            }
        }
    
    def process_result(self, hit: bool, bet_amount: float = 0, profit_loss: float = 0):
        """Update streak tracking and session loss"""
        if hit:
            self.consecutive_wins += 1
            self.consecutive_losses = 0
            logging.info(f"✅ HIT! Consecutive wins: {self.consecutive_wins}")
            
            if profit_loss > 0:
                self.total_session_loss = max(0, self.total_session_loss - profit_loss)
                logging.info(f"💰 Session loss reduced to: ${self.total_session_loss:.2f}")
        else:
            self.consecutive_losses += 1
            self.consecutive_wins = 0
            logging.info(f"❌ MISS! Consecutive losses: {self.consecutive_losses}")
            
            if profit_loss < 0:
                self.total_session_loss += abs(profit_loss)
                logging.info(f"💸 Session loss increased to: ${self.total_session_loss:.2f}")


# Create singleton instance
engine = AIEngineV6()


def predict(table_data: Dict) -> Dict:
    """Main entry point for predictions"""
    return engine.predict(table_data)


def process_result(hit: bool, bet_amount: float = 0, profit_loss: float = 0):
    """Process bet result"""
    engine.process_result(hit, bet_amount, profit_loss)


if __name__ == "__main__":
    print("AI Engine V6 - NEW STRATEGY - FIXED ANCHORS")
    print("Ready to receive predictions!")
