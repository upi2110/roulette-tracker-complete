"""
AI ENGINE V4 - FINAL IMPLEMENTATION
User's Exact Methodology: Wait for 2-hit confirmation, then validate

METHODOLOGY:
1. Table 3: Wait for ANY pair to hit 2 consecutive times (24 numbers)
2. Cross-validate with Table 1, 2, positive/negative, num/opp, 0/19 tables
3. Table 1 Special: If 2 columns hit 2 times each → Use those 4 anchors directly
4. Select 4 best anchors → Expand to 12 numbers
5. DISCIPLINED: Don't bet until pattern confirmed with 2 hits!
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Set
from collections import defaultdict

# Wheel constants - European Roulette order (clockwise)
WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]

# 13-digit opposites
DIGIT_13_OPPOSITES = {
    0:34, 1:28, 2:30, 3:17, 4:36, 5:22, 6:5, 7:4, 8:14, 9:26,
    10:9, 11:1, 12:2, 13:16, 14:35, 15:27, 16:29, 17:23, 18:15,
    19:13, 20:12, 21:11, 22:32, 23:31, 24:18, 25:8, 26:34, 27:24,
    28:21, 29:19, 30:20, 31:3, 32:6, 33:7, 34:10, 35:25, 36:33
}

# Regular opposites
REGULAR_OPPOSITES = {
    0:10, 32:5, 15:24, 19:16, 4:33, 21:1, 2:20, 25:14, 17:31, 34:9,
    6:22, 27:18, 13:29, 36:7, 11:28, 30:12, 8:35, 23:3, 10:26, 5:32,
    24:15, 16:19, 33:4, 1:21, 20:2, 14:25, 31:17, 9:34, 22:6, 18:27,
    29:13, 7:36, 28:11, 12:30, 35:8, 3:23, 26:10
}

# Green and Black numbers
GREEN_NUMBERS = {3, 26, 32, 27, 13, 36, 1, 20, 14, 15, 19, 4, 11, 30, 8, 31, 9, 22}
BLACK_NUMBERS = {23, 10, 5, 18, 29, 7, 21, 2, 25, 24, 16, 33, 28, 12, 35, 17, 34, 6}

# Golden opportunity positions
GOLDEN_POSITIONS = {
    'S+0', 'S-0',
    'S+1', 'S-1',
    'SL+1', 'SR+1',
    'SL-1', 'SR-1',
    'O+4', 'O-4',
    'OL+4', 'OR+4',
    'OL-4', 'OR-4'
}


def get_wheel_neighbors(number: int, distance: int = 1) -> List[int]:
    """Get neighbors on the wheel at specified distance"""
    try:
        idx = WHEEL_ORDER.index(number)
    except ValueError:
        return []
    
    neighbors = []
    left_idx = (idx - distance) % len(WHEEL_ORDER)
    neighbors.append(WHEEL_ORDER[left_idx])
    right_idx = (idx + distance) % len(WHEEL_ORDER)
    neighbors.append(WHEEL_ORDER[right_idx])
    
    return neighbors


def get_color_trend(recent_spins: List[int]) -> str:
    """Analyze last 2-3 spins for Green/Black trend"""
    if len(recent_spins) < 2:
        return 'neutral'
    
    check_spins = recent_spins[-3:] if len(recent_spins) >= 3 else recent_spins[-2:]
    
    green_count = sum(1 for s in check_spins if s in GREEN_NUMBERS)
    black_count = sum(1 for s in check_spins if s in BLACK_NUMBERS)
    
    if black_count > green_count:
        return 'black'
    elif green_count > black_count:
        return 'green'
    else:
        return 'neutral'


def extract_position_type(position_code: str) -> str:
    """Extract position type from code (e.g., 'OR+2' → 'OR')"""
    if not position_code or position_code == 'XX':
        return 'NONE'
    
    for i, char in enumerate(position_code):
        if char in '+-0123456789':
            return position_code[:i]
    
    return position_code


class PredictionLogger:
    """Detailed logging system for AI predictions"""
    
    def __init__(self):
        self.logs = []
        self.current_log = []
    
    def add(self, message: str, level: str = "INFO"):
        """Add log entry"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        log_entry = f"[{timestamp}] [{level}] {message}"
        self.current_log.append(log_entry)
        print(log_entry)
    
    def section(self, title: str):
        """Add section divider"""
        self.add("=" * 70, "INFO")
        self.add(title, "INFO")
        self.add("=" * 70, "INFO")
    
    def subsection(self, title: str):
        """Add subsection"""
        self.add("-" * 50, "INFO")
        self.add(title, "INFO")
        self.add("-" * 50, "INFO")
    
    def important(self, message: str):
        """Add important message"""
        self.add("⭐ " + message, "SUCCESS")
    
    def warning(self, message: str):
        """Add warning message"""
        self.add("⚠️  " + message, "WARNING")
    
    def get_current_log(self) -> List[str]:
        """Get current prediction log"""
        return self.current_log.copy()
    
    def save_and_reset(self) -> List[str]:
        """Save to history and reset"""
        saved = self.current_log.copy()
        self.logs.append(saved)
        self.current_log = []
        return saved


class PatternTracker:
    """Track pattern success rates for learning"""
    
    def __init__(self, history_file: str = 'data/pattern_history.json'):
        self.history_file = history_file
        self.position_stats = defaultdict(lambda: {'total': 0, 'wins': 0})
        self.pair_stats = defaultdict(lambda: {'total': 0, 'wins': 0})
        self.table_stats = defaultdict(lambda: {'total': 0, 'wins': 0})
        self.load_history()
    
    def load_history(self):
        """Load historical pattern data"""
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, 'r') as f:
                    data = json.load(f)
                    self.position_stats = defaultdict(lambda: {'total': 0, 'wins': 0}, data.get('positions', {}))
                    self.pair_stats = defaultdict(lambda: {'total': 0, 'wins': 0}, data.get('pairs', {}))
                    self.table_stats = defaultdict(lambda: {'total': 0, 'wins': 0}, data.get('tables', {}))
            except:
                pass
    
    def save_history(self):
        """Save pattern history"""
        os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
        data = {
            'positions': dict(self.position_stats),
            'pairs': dict(self.pair_stats),
            'tables': dict(self.table_stats)
        }
        with open(self.history_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def record_prediction(self, position_codes: List[str], pair_types: List[str], 
                         table_sources: List[str], hit: bool):
        """Record prediction outcome"""
        for pos in position_codes:
            self.position_stats[pos]['total'] += 1
            if hit:
                self.position_stats[pos]['wins'] += 1
        
        for pair in pair_types:
            self.pair_stats[pair]['total'] += 1
            if hit:
                self.pair_stats[pair]['wins'] += 1
        
        for table in table_sources:
            self.table_stats[table]['total'] += 1
            if hit:
                self.table_stats[table]['wins'] += 1
        
        if len(self.position_stats) % 10 == 0:
            self.save_history()


class RouletteAIv4:
    """
    AI Engine V4 - User's Exact Methodology
    
    DISCIPLINE: Wait for 2-hit confirmation in Table 3, then validate
    
    Methodology:
    1. WAIT: Find pairs in Table 3 with 2 consecutive hits
    2. EXTRACT: Get 24 numbers (projections + neighbors) from confirmed pairs
    3. VALIDATE: Cross-check with Table 1, 2, and reference tables
    4. SPECIAL: If Table 1 has 2 columns with 2 hits each → use those 4 anchors
    5. SELECT: Pick 4 best anchors → expand to 12 numbers
    6. BET: Only when pattern is strongly confirmed
    """
    
    def __init__(self):
        self.logger = PredictionLogger()
        self.pattern_tracker = PatternTracker()
        
        self.prediction_history = []
        self.session_predictions = []
        
        # Scoring weights
        self.weights = {
            'two_hit_confirmation': 20,  # Pair hit 2 consecutive times
            'table1_confirmation': 15,
            'table2_confirmation': 12,
            'ref0_confirmation': 10,
            'ref19_confirmation': 10,
            'golden_position': 10,
            'color_trend': 5,
            'multi_table': 8,
            'column_consistency': 12  # Table 1 column hits
        }
    
    def check_table3_two_hit_patterns(self, table3_hits: Dict, recent_spins: List[int]) -> Dict:
        """
        STEP 1: WAIT for 2-hit confirmation in Table 3
        
        User's methodology: "I wait for any projections from any pairs 
        hit last 2 times in table3 (24 numbers)"
        
        Returns: Pairs that have 2 consecutive hits with their projections
        """
        self.logger.subsection("STEP 1: TABLE 3 - WAIT FOR 2-HIT CONFIRMATION")
        
        confirmed_pairs = {}
        
        # All pairs to check
        pair_types = [
            ('prev', 'prev13opp', 'P + P-13opp'),
            ('prevPlus1', 'prevPlus1_13opp', 'P+1 + P+1-13opp'),
            ('prevMinus1', 'prevMinus1_13opp', 'P-1 + P-1-13opp'),
            ('prevPlus2', 'prevPlus2_13opp', 'P+2 + P+2-13opp'),
            ('prevMinus2', 'prevMinus2_13opp', 'P-2 + P-2-13opp'),
            ('prevPrev', 'prevPrev13opp', 'P-Prev + P-Prev-13opp')
        ]
        
        for pair_a, pair_b, pair_name in pair_types:
            hits_a = table3_hits.get(pair_a, [])
            hits_b = table3_hits.get(pair_b, [])
            combined_hits = hits_a + hits_b
            
            if len(combined_hits) < 2:
                continue
            
            # Sort by spin index to check consecutive hits
            sorted_hits = sorted(combined_hits, key=lambda x: x.get('spinIdx', 0))
            
            # Check for 2 consecutive hits in last few spins
            recent_hits = [h for h in sorted_hits if h.get('spinIdx', 0) >= len(recent_spins) - 3]
            
            if len(recent_hits) >= 2:
                # Found 2 hits in recent spins!
                projections = set()
                position_codes = set()
                
                for hit in recent_hits[-2:]:  # Last 2 hits
                    proj = hit.get('projection')
                    pos = hit.get('posCode', 'XX')
                    if proj is not None:
                        projections.add(proj)
                        if pos != 'XX':
                            position_codes.add(pos)
                
                if projections:
                    confirmed_pairs[pair_name] = {
                        'projections': list(projections),
                        'position_codes': list(position_codes),
                        'hits': recent_hits[-2:],
                        'is_golden': any(pos in GOLDEN_POSITIONS for pos in position_codes)
                    }
                    
                    self.logger.important(f"2-HIT CONFIRMED: {pair_name}")
                    self.logger.add(f"  Last 2 hits: {[h.get('actual') for h in recent_hits[-2:]]}")
                    self.logger.add(f"  Projections: {list(projections)}")
                    self.logger.add(f"  Positions: {list(position_codes)}")
                    
                    if confirmed_pairs[pair_name]['is_golden']:
                        self.logger.important(f"  GOLDEN POSITIONS DETECTED!")
        
        if not confirmed_pairs:
            self.logger.warning("NO 2-HIT PATTERNS FOUND - WAIT FOR CONFIRMATION")
            return {}
        
        self.logger.add(f"\nFound {len(confirmed_pairs)} confirmed pair(s) with 2 consecutive hits")
        return confirmed_pairs
    
    def extract_24_numbers(self, confirmed_pairs: Dict) -> Set[int]:
        """
        Extract 24 numbers from confirmed pairs
        (projections + their ±1 neighbors)
        """
        self.logger.subsection("STEP 2: EXTRACT 24 NUMBERS FROM CONFIRMED PAIRS")
        
        all_numbers = set()
        
        for pair_name, data in confirmed_pairs.items():
            projections = data['projections']
            
            for proj in projections:
                # Add projection
                all_numbers.add(proj)
                
                # Add ±1 neighbors
                neighbors = get_wheel_neighbors(proj, distance=1)
                all_numbers.update(neighbors)
                
                # Handle 0/26 same position
                if proj == 0 or proj == 26:
                    all_numbers.add(0)
                    all_numbers.add(26)
        
        self.logger.add(f"Extracted {len(all_numbers)} numbers from confirmed pairs")
        self.logger.add(f"Numbers: {sorted(list(all_numbers))}")
        
        return all_numbers
    
    def check_table1_two_column_special(self, table1_hits: Dict) -> Optional[Dict]:
        """
        TABLE 1 SPECIAL CASE
        
        User: "Sometimes use table1 as I can select 2 columns 4 anchors 
        if they hit 2 times, I suggest you do the same. but careful."
        
        If 2 columns both hit 2 times each → Use those 4 anchors directly!
        This is VERY high confidence!
        """
        self.logger.subsection("TABLE 1 SPECIAL: CHECKING 2-COLUMN PATTERN")
        
        # Track hits by column type
        column_hits = defaultdict(list)
        
        for pair_name, hits in table1_hits.items():
            for hit in hits:
                pos_code = hit.get('posCode', 'XX')
                projection = hit.get('projection')
                
                if pos_code == 'XX' or projection is None:
                    continue
                
                col_type = extract_position_type(pos_code)
                column_hits[col_type].append({
                    'projection': projection,
                    'spinIdx': hit.get('spinIdx', 0),
                    'pair': pair_name,
                    'posCode': pos_code
                })
        
        # Find columns with 2+ hits
        active_columns = {}
        for col_type, hits in column_hits.items():
            if len(hits) >= 2:
                # Get unique projections from last 2 hits
                sorted_hits = sorted(hits, key=lambda x: x['spinIdx'], reverse=True)
                recent_projections = [h['projection'] for h in sorted_hits[:2]]
                
                active_columns[col_type] = {
                    'projections': recent_projections,
                    'hit_count': len(hits)
                }
                
                self.logger.add(f"Column {col_type}: {len(hits)} hits, last 2: {recent_projections}")
        
        # Check if we have 2 columns with 2+ hits each
        if len(active_columns) >= 2:
            # Select top 2 columns by hit count
            top_columns = sorted(active_columns.items(), 
                               key=lambda x: x[1]['hit_count'], 
                               reverse=True)[:2]
            
            # Extract 4 anchors (2 from each column)
            anchors = []
            for col_type, data in top_columns:
                anchors.extend(data['projections'][:2])  # Take 2 from each
            
            # Ensure we have exactly 4 unique anchors
            anchors = list(set(anchors))[:4]
            
            if len(anchors) == 4:
                self.logger.important("⭐⭐⭐ TABLE 1 SPECIAL: 2 COLUMNS WITH 2 HITS EACH!")
                self.logger.important(f"Using 4 anchors directly from columns: {anchors}")
                self.logger.important("This is HIGH CONFIDENCE - Direct column selection!")
                
                return {
                    'anchors': anchors,
                    'columns': [c[0] for c in top_columns],
                    'special_case': True
                }
        
        self.logger.add("Table 1 special case not applicable (need 2 columns with 2+ hits each)")
        return None
    
    def cross_validate_candidates(self, candidate_numbers: Set[int], 
                                 table1_hits: Dict, table2_hits: Dict,
                                 confirmed_pairs: Dict) -> Dict:
        """
        STEP 3: Cross-validate 24 numbers with Table 1, 2, and reference tables
        
        User: "Then use table 1&2 and other positive, negative table, 
        num/opp table, 0 and 19 table to decide final 4 anchors"
        """
        self.logger.subsection("STEP 3: CROSS-VALIDATE WITH OTHER TABLES")
        
        candidates = {}
        
        # Initialize all candidate numbers with base score
        for num in candidate_numbers:
            candidates[num] = {
                'score': self.weights['two_hit_confirmation'],  # Base score from Table 3
                'confirmations': ['table3_2hit'],
                'is_golden': False,
                'position_codes': set()
            }
        
        # Check if candidates are golden (from Table 3 confirmed pairs)
        for pair_name, data in confirmed_pairs.items():
            if data['is_golden']:
                for proj in data['projections']:
                    if proj in candidates:
                        candidates[proj]['is_golden'] = True
                        candidates[proj]['score'] += self.weights['golden_position']
        
        # Cross-validate with Table 1
        self.logger.add("\nChecking Table 1 confirmations:")
        table1_count = 0
        for pair_name, hits in table1_hits.items():
            for hit in hits:
                projection = hit.get('projection')
                if projection in candidates:
                    candidates[projection]['score'] += self.weights['table1_confirmation']
                    candidates[projection]['confirmations'].append(f'table1_{pair_name}')
                    table1_count += 1
                    self.logger.add(f"  ✅ {projection} confirmed in Table 1 ({pair_name})")
        
        # Cross-validate with Table 2
        self.logger.add("\nChecking Table 2 confirmations:")
        table2_count = 0
        for pair_name, hits in table2_hits.items():
            for hit in hits:
                projection = hit.get('projection')
                if projection in candidates:
                    candidates[projection]['score'] += self.weights['table2_confirmation']
                    candidates[projection]['confirmations'].append(f'table2_{pair_name}')
                    table2_count += 1
                    self.logger.add(f"  ✅ {projection} confirmed in Table 2 ({pair_name})")
        
        # Check ref 0 and 19 pairs
        self.logger.add("\nChecking important reference pairs:")
        ref0_hits = table1_hits.get('ref0', [])
        ref19_hits = table1_hits.get('ref19', [])
        
        for hit in ref0_hits:
            projection = hit.get('projection')
            if projection in candidates:
                candidates[projection]['score'] += self.weights['ref0_confirmation']
                candidates[projection]['confirmations'].append('ref0')
                self.logger.add(f"  ⭐ {projection} confirmed in REF 0 pair")
        
        for hit in ref19_hits:
            projection = hit.get('projection')
            if projection in candidates:
                candidates[projection]['score'] += self.weights['ref19_confirmation']
                candidates[projection]['confirmations'].append('ref19')
                self.logger.add(f"  ⭐ {projection} confirmed in REF 19 pair")
        
        # Multi-table bonus
        for num, data in candidates.items():
            unique_sources = set([c.split('_')[0] for c in data['confirmations']])
            if len(unique_sources) >= 3:
                data['score'] += self.weights['multi_table']
                self.logger.add(f"  🎯 {num} has {len(unique_sources)} table confirmations (+{self.weights['multi_table']})")
        
        self.logger.add(f"\nTotal confirmations: Table1={table1_count}, Table2={table2_count}")
        self.logger.add(f"Candidates scored: {len(candidates)}")
        
        return candidates
    
    def apply_color_trend_bonus(self, candidates: Dict, color_trend: str) -> Dict:
        """Apply bonus for matching color trend"""
        if color_trend == 'neutral':
            return candidates
        
        self.logger.add(f"\nColor trend: {color_trend.upper()}")
        
        for num, data in candidates.items():
            if color_trend == 'green' and num in GREEN_NUMBERS:
                data['score'] += self.weights['color_trend']
                self.logger.add(f"  {num} matches GREEN trend (+{self.weights['color_trend']})")
            elif color_trend == 'black' and num in BLACK_NUMBERS:
                data['score'] += self.weights['color_trend']
                self.logger.add(f"  {num} matches BLACK trend (+{self.weights['color_trend']})")
        
        return candidates
    
    def select_best_4_anchors(self, candidates: Dict, special_case: Optional[Dict]) -> Tuple[List[int], List[Dict]]:
        """
        STEP 4: Select 4 best anchors
        
        Special case: If Table 1 has 2 columns with 2 hits, use those directly
        Otherwise: Select top 4 by score
        """
        self.logger.subsection("STEP 4: SELECT 4 BEST ANCHORS")
        
        # Check for Table 1 special case first
        if special_case and special_case.get('special_case'):
            anchors = special_case['anchors']
            
            anchor_data = []
            for anchor in anchors:
                if anchor in candidates:
                    anchor_data.append({
                        'projection': anchor,
                        **candidates[anchor]
                    })
                else:
                    anchor_data.append({
                        'projection': anchor,
                        'score': self.weights['column_consistency'] * 2,
                        'confirmations': ['table1_column_special'],
                        'is_golden': False
                    })
            
            self.logger.important("Using Table 1 special case anchors:")
            for i, anchor in enumerate(anchors, 1):
                self.logger.add(f"  {i}. Anchor {anchor} (from columns {special_case['columns']})")
            
            return anchors, anchor_data
        
        # Normal selection: Top 4 by score
        candidate_list = [
            {
                'projection': num,
                **data
            }
            for num, data in candidates.items()
        ]
        
        sorted_candidates = sorted(candidate_list, key=lambda x: x['score'], reverse=True)
        
        selected = sorted_candidates[:4]
        
        self.logger.add("Selected by highest scores:")
        for i, anchor in enumerate(selected, 1):
            confirmations = ', '.join(anchor['confirmations'][:3])
            golden_tag = " ⭐ GOLDEN" if anchor['is_golden'] else ""
            self.logger.add(f"  {i}. Anchor {anchor['projection']}: "
                          f"Score {anchor['score']:.0f} ({confirmations}){golden_tag}")
        
        anchors = [a['projection'] for a in selected]
        return anchors, selected
    
    def expand_to_12_numbers(self, anchors: List[int]) -> Tuple[List[int], List[Dict]]:
        """
        STEP 5: Expand 4 anchors to 12 numbers (add ±1 neighbors)
        """
        self.logger.subsection("STEP 5: EXPAND TO 12 NUMBERS")
        
        all_numbers = set()
        anchor_groups = []
        
        for anchor in anchors:
            neighbors = get_wheel_neighbors(anchor, distance=1)
            
            all_numbers.add(anchor)
            all_numbers.update(neighbors[:2])
            
            anchor_groups.append({
                'anchor': anchor,
                'neighbors': neighbors[:2]
            })
            
            self.logger.add(f"Anchor {anchor}: + neighbors {neighbors[:2]}")
            
            # Handle 0 and 26
            if anchor == 0 or anchor == 26:
                all_numbers.add(0)
                all_numbers.add(26)
            
            for nb in neighbors[:2]:
                if nb == 0 or nb == 26:
                    all_numbers.add(0)
                    all_numbers.add(26)
        
        final_numbers = sorted(list(all_numbers))
        
        self.logger.important(f"FINAL BET: {len(final_numbers)} numbers")
        self.logger.add(f"Numbers: {final_numbers}")
        
        return final_numbers, anchor_groups
    
    def calculate_confidence(self, anchor_data: List[Dict], confirmed_pairs: Dict,
                           special_case: Optional[Dict], session_state: Dict,
                           recent_history: List[Dict]) -> float:
        """Calculate confidence based on pattern strength"""
        self.logger.subsection("CONFIDENCE CALCULATION")
        
        # Base confidence from average anchor score
        avg_score = sum(a['score'] for a in anchor_data) / len(anchor_data) if anchor_data else 0
        
        # Higher base for Table 1 special case
        if special_case and special_case.get('special_case'):
            base_confidence = 0.90
            self.logger.add(f"Base: 0.90 (Table 1 special case - very high confidence!)")
        elif avg_score >= 50:
            base_confidence = 0.85
            self.logger.add(f"Base: 0.85 (avg score: {avg_score:.1f})")
        elif avg_score >= 40:
            base_confidence = 0.80
            self.logger.add(f"Base: 0.80 (avg score: {avg_score:.1f})")
        elif avg_score >= 30:
            base_confidence = 0.75
            self.logger.add(f"Base: 0.75 (avg score: {avg_score:.1f})")
        else:
            base_confidence = 0.70
            self.logger.add(f"Base: 0.70 (avg score: {avg_score:.1f})")
        
        # Golden boost
        golden_count = sum(1 for a in anchor_data if a.get('is_golden', False))
        golden_boost = 0.05 * golden_count if golden_count > 0 else 0
        
        if golden_boost > 0:
            self.logger.add(f"  + Golden: {golden_boost:.2f} ({golden_count} anchors)")
        
        # Confirmed pairs boost (multiple pairs with 2 hits)
        pairs_boost = 0.02 * len(confirmed_pairs) if len(confirmed_pairs) > 1 else 0
        if pairs_boost > 0:
            self.logger.add(f"  + Multiple confirmed pairs: {pairs_boost:.2f}")
        
        # Recent performance adjustment
        performance_adj = 0.0
        if len(recent_history) >= 10:
            recent_wins = sum(1 for p in recent_history[-20:] if p.get('hit') == True)
            recent_total = len([p for p in recent_history[-20:] if p.get('hit') is not None])
            
            if recent_total > 0:
                win_rate = recent_wins / recent_total
                
                if win_rate >= 0.70:
                    performance_adj = 0.05
                    self.logger.add(f"  + Performance: {performance_adj:.2f} ({win_rate:.1%})")
                elif win_rate < 0.40:
                    performance_adj = -0.05
                    self.logger.add(f"  - Performance: {performance_adj:.2f} ({win_rate:.1%})")
        
        # Consecutive losses penalty
        consecutive_losses = session_state.get('consecutive_losses', 0)
        loss_penalty = -0.05 if consecutive_losses >= 3 else 0
        
        if loss_penalty < 0:
            self.logger.warning(f"Consecutive loss penalty: {loss_penalty:.2f}")
        
        # Calculate final
        final_confidence = base_confidence + golden_boost + pairs_boost + performance_adj + loss_penalty
        final_confidence = max(0.65, min(0.95, final_confidence))
        
        self.logger.important(f"FINAL CONFIDENCE: {final_confidence:.2f} ({final_confidence*100:.0f}%)")
        
        return final_confidence
    
    def predict_numbers(self, table_data: Dict, recent_spins: List[int], 
                       session_state: Dict) -> Dict:
        """
        Main prediction method - User's exact selective methodology
        
        DISCIPLINE: Wait for 2-hit confirmation, then validate, then bet
        """
        self.logger.section(f"PREDICTION #{len(self.session_predictions) + 1} - SELECTIVE METHODOLOGY")
        
        self.logger.add(f"Recent spins: {recent_spins[-10:]}")
        self.logger.add(f"Balance: ${session_state.get('balance', 0)}")
        self.logger.add(f"Consecutive losses: {session_state.get('consecutive_losses', 0)}")
        
        if len(recent_spins) < 3:
            self.logger.warning("Need at least 3 spins")
            return {
                'can_predict': False,
                'numbers': [],
                'confidence': 0.60,
                'reasoning': ["Need at least 3 spins to identify patterns"],
                'thinking_log': self.logger.get_current_log()
            }
        
        # Determine strict mode
        balance = session_state.get('balance', 4000)
        consecutive_losses = session_state.get('consecutive_losses', 0)
        strict_mode = balance < 3000 or consecutive_losses >= 3
        
        if strict_mode:
            self.logger.warning("🔒 STRICT MODE: Require 85% confidence")
        
        # STEP 1: Wait for 2-hit confirmation in Table 3
        confirmed_pairs = self.check_table3_two_hit_patterns(
            table_data.get('table3Hits', {}),
            recent_spins
        )
        
        if not confirmed_pairs:
            self.logger.warning("❌ NO 2-HIT CONFIRMATION - WAIT FOR PATTERN")
            self.logger.warning("💪 DISCIPLINE: Don't bet until pattern confirmed with 2 hits!")
            
            return {
                'can_predict': False,
                'numbers': [],
                'confidence': 0.65,
                'reasoning': [
                    "Waiting for 2-hit pattern confirmation in Table 3",
                    "DISCIPLINE: No betting without confirmed pattern",
                    "This is how you make $1000/day - wait for the right opportunity!"
                ],
                'thinking_log': self.logger.save_and_reset()
            }
        
        # STEP 2: Extract 24 numbers
        candidate_numbers = self.extract_24_numbers(confirmed_pairs)
        
        # Check for Table 1 special case (2 columns with 2 hits each)
        special_case = self.check_table1_two_column_special(table_data.get('table1Hits', {}))
        
        # STEP 3: Cross-validate with other tables
        validated_candidates = self.cross_validate_candidates(
            candidate_numbers,
            table_data.get('table1Hits', {}),
            table_data.get('table2Hits', {}),
            confirmed_pairs
        )
        
        if not validated_candidates:
            self.logger.warning("No candidates passed validation")
            return {
                'can_predict': False,
                'numbers': [],
                'confidence': 0.65,
                'reasoning': ["Pattern identified but no strong candidates for betting"],
                'thinking_log': self.logger.save_and_reset()
            }
        
        # Apply color trend
        color_trend = get_color_trend(recent_spins)
        validated_candidates = self.apply_color_trend_bonus(validated_candidates, color_trend)
        
        # STEP 4: Select best 4 anchors (or use Table 1 special case)
        anchors, anchor_data = self.select_best_4_anchors(validated_candidates, special_case)
        
        # STEP 5: Expand to 12 numbers
        final_numbers, anchor_groups = self.expand_to_12_numbers(anchors)
        
        # STEP 6: Calculate confidence
        confidence = self.calculate_confidence(
            anchor_data,
            confirmed_pairs,
            special_case,
            session_state,
            self.prediction_history
        )
        
        # Check confidence threshold
        min_confidence = 0.85 if consecutive_losses >= 3 else 0.75
        can_bet = confidence >= min_confidence
        
        if not can_bet:
            self.logger.warning(f"⚠️  Confidence {confidence:.2f} below threshold {min_confidence:.2f}")
            self.logger.warning("💪 WAIT FOR HIGHER CONFIDENCE")
        else:
            self.logger.important("✅ CONFIDENCE ABOVE THRESHOLD - BET NOW!")
        
        # Build reasoning
        reasoning = []
        reasoning.append(f"2-hit confirmation in {len(confirmed_pairs)} pair(s) from Table 3")
        reasoning.append(f"Validated {len(validated_candidates)} candidates across tables")
        
        if special_case and special_case.get('special_case'):
            reasoning.append("⭐ TABLE 1 SPECIAL: 2 columns with 2 hits - HIGH CONFIDENCE!")
        
        reasoning.append(f"Selected {len(anchors)} best anchors → {len(final_numbers)} numbers")
        
        golden_count = sum(1 for a in anchor_data if a.get('is_golden', False))
        if golden_count > 0:
            reasoning.append(f"⭐ {golden_count}/4 anchors are GOLDEN positions")
        
        # Save prediction
        prediction_record = {
            'timestamp': datetime.now().isoformat(),
            'anchors': anchors,
            'numbers': final_numbers,
            'confidence': confidence,
            'confirmed_pairs': list(confirmed_pairs.keys()),
            'special_case': special_case is not None,
            'is_golden': golden_count > 0,
            'strict_mode': strict_mode,
            'hit': None
        }
        self.prediction_history.append(prediction_record)
        self.session_predictions.append(prediction_record)
        
        thinking_log = self.logger.save_and_reset()
        
        return {
            'can_predict': can_bet,
            'numbers': final_numbers,
            'anchors': anchors,
            'anchor_groups': anchor_groups,
            'confidence': confidence,
            'reasoning': reasoning,
            'confirmed_pairs': list(confirmed_pairs.keys()),
            'special_case': special_case is not None,
            'is_golden': golden_count > 0,
            'strict_mode': strict_mode,
            'thinking_log': thinking_log
        }
    
    def record_result(self, hit: bool):
        """Update last prediction with result"""
        if self.prediction_history:
            self.prediction_history[-1]['hit'] = hit
    
    def clear_session_history(self):
        """Clear session predictions"""
        self.session_predictions = []
        self.logger.add("Session history cleared - FRESH START", "INFO")


if __name__ == "__main__":
    print("=" * 70)
    print("RouletteAI Engine V4 - User's Exact Selective Methodology")
    print("WAIT for 2-hit confirmation → VALIDATE → SELECT → BET")
    print("$1000/day strategy with maximum discipline")
    print("=" * 70)
