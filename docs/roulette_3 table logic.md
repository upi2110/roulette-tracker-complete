# 🎯 ROULETTE AI V5 - COMPLETE ANALYSIS & DESIGN

**Date:** January 11, 2026  
**Purpose:** Build V5 AI Engine based on user's exact methodology  
**Status:** Analysis Complete - Ready for Implementation

---

## 📊 **CURRENT DATA STRUCTURE (From Frontend)**

### **What getAIData() Sends to Backend:**

```javascript
{
  table1Hits: {
    prev: [...],
    prevPlus1: [...],
    prevMinus1: [...],
    // ... more pairs
  },
  table2Hits: {
    prev: [...],
    prevPlus1: [...],
    // ... more pairs  
  },
  table3Hits: {
    prev: [...],           // Array of hit objects
    prev13opp: [...],
    prevPlus1: [...],
    prevPlus1_13opp: [...],
    prevMinus1: [...],
    prevMinus1_13opp: [...],
    prevPlus2: [...],
    prevPlus2_13opp: [...],
    prevMinus2: [...],
    prevMinus2_13opp: [...],
    prevPrev: [...],
    prevPrev13opp: [...]
  },
  currentSpinCount: 8,
  recentSpins: [8, 22, 2, 5, 33, 8, 29, 10]  // Last 10 actual numbers
}
```

### **Table 3 Hit Object Structure:**

```javascript
{
  spinIdx: 3,              // Which spin this hit occurred
  actual: 2,               // The actual number that hit
  anchorRef: 22,           // The reference number (P, P+1, etc.)
  projection: 22,          // Same as anchorRef
  hitType: 'green',        // 'green' or 'blue'
  posCode: 'OL+4',         // Position code where it hit
  betNumbers: [24, 22, 18, 32, ...]  // All bet numbers (anchors + neighbors)
}
```

**CRITICAL:** The `betNumbers` array already contains ALL the projections for this pair!

---

## 🔍 **HOW FRONTEND CALCULATES PROJECTIONS:**

### **Step 1: Generate Anchors (from previous hit position)**

```javascript
// Example: Previous actual 22 hit at SR+3
// Reference numbers: refNum=22, ref13Opp=32

// Calculate 4 positions:
a1 = getNumberAtPosition(22, 'SR+3')     // 22 at SR+3 = 7
a2 = getNumberAtPosition(22, 'SR-3')     // 22 at SR-3 = 14  
a3 = getNumberAtPosition(32, 'SR+3')     // 32 at SR+3 = 4
a4 = getNumberAtPosition(32, 'SR-3')     // 32 at SR-3 = 35

// Purple anchors: [7, 14, 4, 35]
```

### **Step 2: Add Regular Opposites**

```javascript
// Green anchors (regular opposites of purple):
7 → 28
14 → 32
4 → 21
35 → 3

// Green anchors: [28, 32, 21, 3]
```

### **Step 3: Expand to Bet Numbers (±1 wheel neighbors)**

```javascript
// For each anchor, add ±1 neighbors on wheel
Purple: [7, 14, 4, 35] → + neighbors → [7,28,29, 14,31,2, 4,19,21, 35,12,3]
Green:  [28, 32, 21, 3] → + neighbors → [28,7,29, 32,15,0, 21,4,19, 3,35,26]

// Combine and dedupe:
betNumbers = [0, 2, 3, 4, 7, 12, 14, 15, 19, 21, 26, 28, 29, 31, 32, 35]
// Total: 16 numbers
```

**This is ALREADY done by frontend and stored in `hit.betNumbers`!**

---

## ✅ **USER'S CORRECT METHODOLOGY (V5 Logic)**

### **STEP 1: Find 2-Hit Patterns in Table 3**

**Rule:** A pair must hit 2 CONSECUTIVE times with consistent positions

**Example from user:**
```
Actuals: 8, 22, 2

P+1 pair:
- Actual 8: Hit at SR+4
- Actual 22: Hit at SR+3
- Check: SR+4 vs SR+3 → Same family (SR), close distance ✅

Result: PATTERN CONFIRMED!
Use betNumbers from most recent hit (index 1, actual 22)
```

**How to Check Consistency:**
1. Both hits should be in same family (S, O) OR
2. Both hits should have similar distance (±1, ±2, etc.) OR
3. Pattern shows clear side preference (all S-side or all O-side)

---

### **STEP 2: Extract Projections from Confirmed Pairs**

**CRITICAL:** Don't calculate - READ from `hit.betNumbers`!

```python
def find_confirmed_pairs(table3_hits):
    confirmed = []
    
    for pair_name, hits in table3_hits.items():
        if len(hits) < 2:
            continue
            
        # Get last 2 hits
        last_two = hits[-2:]
        
        # Check if consecutive spins
        if last_two[1]['spinIdx'] == last_two[0]['spinIdx'] + 1:
            # Check position consistency
            pos1 = last_two[0]['posCode']
            pos2 = last_two[1]['posCode']
            
            if is_consistent_pattern(pos1, pos2):
                # Use betNumbers from MOST RECENT hit
                confirmed.append({
                    'pair': pair_name,
                    'last_hit': last_two[1],
                    'projections': last_two[1]['betNumbers'],  # ← READ THIS!
                    'consecutive_hits': 2,
                    'position_pattern': [pos1, pos2]
                })
    
    return confirmed
```

---

### **STEP 3: Smart Anchor Selection**

**USER WANTS:** AI to be intelligent about selecting anchors

**Bad Approach (V4 - WRONG):**
- Just pick all projections from one pair = 16-24 numbers
- Add regular opposites blindly = 24+ numbers

**Good Approach (V5 - CORRECT):**
```python
def smart_anchor_selection(confirmed_pairs):
    # 1. Find common numbers across multiple hot pairs
    if len(confirmed_pairs) > 1:
        common_numbers = find_common_numbers(confirmed_pairs)
        if len(common_numbers) >= 3:
            # Common numbers are strongest!
            return select_best_n_anchors(common_numbers, 3)
    
    # 2. Analyze side preference (S vs O)
    s_side_count = count_s_family_positions(confirmed_pairs)
    o_side_count = count_o_family_positions(confirmed_pairs)
    
    if s_side_count > o_side_count * 2:
        # S-side is much hotter - filter to S-side only
        s_numbers = filter_to_s_side(confirmed_pairs[0]['projections'])
        return select_best_n_anchors(s_numbers, 4)
    elif o_side_count > s_side_count * 2:
        # O-side is much hotter
        o_numbers = filter_to_o_side(confirmed_pairs[0]['projections'])
        return select_best_n_anchors(o_numbers, 4)
    
    # 3. Default: Pick best 3-4 from strongest pair
    best_pair = confirmed_pairs[0]  # Highest consecutive hits
    return select_best_n_anchors(best_pair['projections'], 4)
```

**Result:** 3-4 anchors → 9-12 numbers (not 24!)

---

### **STEP 4: Golden Pattern Detection**

**Golden Rule:** When Table 3 naturally gives < 24 numbers

**How to Detect:**
```python
def is_golden_pattern(confirmed_pair):
    total_numbers = len(confirmed_pair['projections'])
    
    # If projections already < 24, it's golden!
    if total_numbers < 24:
        return True
        
    # Or if position pattern is very tight
    positions = confirmed_pair['position_pattern']
    if all_same_position_code(positions):  # e.g., all O+0
        return True
        
    return False
```

**Example from User:**
```
P-2 pair:
- Actual 22: Hit O+0
- Actual 2: Hit O+0
- Actual 5: Hit OR+1

All in O-family, tight range!
Result: Only need to bet 12 numbers (O-positions only)
→ GOLDEN PATTERN!
```

---

### **STEP 5: Table 1 & 2 Cross-Validation**

**USER RULE:** Table 1 & 2 need **3 hits** (not 2) in same columns

**How to Check:**
```python
def check_table_confirmations(anchors, table1_hits, table2_hits):
    confirmations = []
    
    # Check Table 1
    for pair_name, hits in table1_hits.items():
        if len(hits) >= 3:
            # Check if last 3 hits are in same "column"
            last_three = hits[-3:]
            columns = [get_column_from_position(h['posCode']) for h in last_three]
            
            if all_same_column(columns):
                # This column is HOT in Table 1!
                # Check if any of our anchors are in this column
                for anchor in anchors:
                    if anchor_in_hot_column(anchor, pair_name, columns[0]):
                        confirmations.append({
                            'table': 1,
                            'pair': pair_name,
                            'anchor': anchor,
                            'column': columns[0]
                        })
    
    # Same for Table 2
    # ...
    
    return confirmations
```

**"Same Column" Definition:**
- In Table 1/2, each pair has 3 positions (first, second, third)
- These map to position codes (S-family, O-family, etc.)
- "Same column" = same position family across multiple hits

---

### **STEP 6: Final Decision Logic**

```python
def make_prediction(table3_hits, table1_hits, table2_hits, bankroll, losses):
    # STEP 1: Find confirmed pairs (2 consecutive hits)
    confirmed_pairs = find_confirmed_pairs(table3_hits)
    
    if not confirmed_pairs:
        return {'can_predict': False, 'signal': 'WAIT', 'reason': 'No 2-hit patterns'}
    
    # STEP 2: Smart anchor selection
    selected_anchors = smart_anchor_selection(confirmed_pairs)
    
    # STEP 3: Check if golden
    is_golden = any(is_golden_pattern(p) for p in confirmed_pairs)
    
    # STEP 4: If bankroll low, only bet golden
    if bankroll < 3000 and not is_golden:
        return {'can_predict': False, 'signal': 'WAIT', 'reason': 'Bankroll low - waiting for golden'}
    
    # STEP 5: Expand anchors to final numbers
    final_numbers = expand_anchors_to_numbers(selected_anchors)  # ±1 neighbors
    
    # STEP 6: Cross-validate with Table 1 & 2
    confirmations = check_table_confirmations(selected_anchors, table1_hits, table2_hits)
    
    # STEP 7: Calculate confidence
    confidence = 0.70  # Base
    
    if is_golden:
        confidence += 0.15
    
    if len(confirmed_pairs) > 1:
        confidence += 0.10  # Multiple hot pairs
    
    if len(confirmations) > 0:
        confidence += 0.05 * len(confirmations)  # Table confirmations
    
    if losses >= 3:
        confidence -= 0.05  # Penalty after losses
        threshold = 0.85  # Strict mode
    else:
        threshold = 0.75
    
    # STEP 8: Decide
    if confidence >= threshold:
        return {
            'can_predict': True,
            'signal': 'BET NOW',
            'numbers': final_numbers,
            'anchors': selected_anchors,
            'confidence': confidence,
            'is_golden': is_golden,
            'reasoning': build_reasoning(confirmed_pairs, confirmations)
        }
    else:
        return {
            'can_predict': False,
            'signal': 'WAIT',
            'confidence': confidence,
            'reason': f'Confidence {confidence:.0%} below threshold {threshold:.0%}'
        }
```

---

## 🎯 **KEY DIFFERENCES: V4 vs V5**

| Feature | V4 (WRONG) | V5 (CORRECT) |
|---------|------------|--------------|
| **Projection Source** | Calculate projections | READ from hit.betNumbers |
| **Position Matching** | Any 2 hits = pattern | Check consistency (SR+3, SR+2) |
| **Anchor Count** | Always 4, add opposites = 24 nums | Smart 3-4 anchors = 9-12 nums |
| **Side Preference** | Ignore | Analyze S vs O preference |
| **Common Numbers** | Ignore | Find overlap across pairs |
| **Golden Detection** | Check position codes | Check total < 24 numbers |
| **Table 1/2 Confirm** | Check for 2 hits | Check for **3 hits** |
| **Bankroll Rule** | Ignore | < $3000 = golden only |

---

## 📋 **IMPLEMENTATION CHECKLIST**

### **Phase 1: Core Logic (4 hours)**
- [ ] Implement find_confirmed_pairs()
- [ ] Implement is_consistent_pattern()
- [ ] Implement smart_anchor_selection()
- [ ] Implement find_common_numbers()
- [ ] Implement analyze_side_preference()

### **Phase 2: Validation (2 hours)**
- [ ] Implement is_golden_pattern()
- [ ] Implement check_table_confirmations()
- [ ] Implement get_column_from_position()
- [ ] Test with user's examples (8,22,2,5)

### **Phase 3: Decision Engine (2 hours)**
- [ ] Implement confidence calculation
- [ ] Implement bankroll rules
- [ ] Implement loss penalties
- [ ] Implement reasoning builder

### **Phase 4: Testing (2 hours)**
- [ ] Test with actuals [8,22,2,5]
- [ ] Verify projections match user's Excel
- [ ] Test edge cases
- [ ] Performance optimization (<3 seconds)

**Total: ~10 hours**

---

## 🧪 **TEST CASES**

### **Test 1: Basic 2-Hit Pattern**
```python
Input: Actuals [8, 22, 2]
Expected:
- P+1 pair: 2 consecutive hits (8, 22) at SR+4, SR+3
- Projections from hit 22: [7, 14, 4, 35, ...] (~8-16 numbers)
- Confidence: ~80-85%
- Signal: BET NOW
```

### **Test 2: Golden Pattern**
```python
Input: Actuals [8, 22, 2, 5]
P-2 pair hits at O+0, O+0, OR+1
Expected:
- Golden detected (tight O-family pattern)
- Only 12 numbers
- Confidence: 90%+
- Signal: BET NOW
```

### **Test 3: Low Bankroll**
```python
Input: Bankroll = $2800, Pattern = Not Golden
Expected:
- Signal: WAIT
- Reason: "Bankroll low - waiting for golden"
```

### **Test 4: No Confirmation**
```python
Input: < 3 spins
Expected:
- Signal: WAIT
- Reason: "Not enough spins"
```

---

## ⚡ **PERFORMANCE TARGETS**

- Response time: < 2 seconds
- Predictions per spin: 1
- Memory usage: < 100MB
- Win rate target: 75-85%
- Betting frequency: 25-30% of spins

---

## 🚀 **READY FOR IMPLEMENTATION!**

All requirements clear. Data structure understood. Logic designed.

**Next: Build ai_engine_v5.py with this exact logic!**

---

**Questions Resolved:**
✅ Data structure (hit.betNumbers contains all projections)
✅ Position matching (check consistency)
✅ Smart selection (common numbers, side preference)
✅ Golden detection (< 24 numbers or tight pattern)
✅ Table 1/2 validation (3 hits, same column)
✅ Bankroll rules (< $3000 = golden only)

**No more questions - ready to code!** 🎯
