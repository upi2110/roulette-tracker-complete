# 🧪 TEST MODEL - HISTORICAL DATA BACKTESTING

## Overview
The Test Model feature allows you to validate the AI prediction system against historical roulette data. It runs simulated sessions starting from each number position in your dataset to measure performance metrics.

## How It Works

### Testing Process
1. **Upload Data**: Provide 50-500 historical roulette numbers via CSV, TXT, or paste
2. **Rolling Window**: System tests starting from position 1, then 2, then 3... until last number
3. **Session Simulation**: Each test runs until hitting $100 profit, $0 bankrupt, or 250 spins max
4. **Result Recording**: All session data is captured for analysis

### Example
```
Numbers: [32, 15, 19, 4, 21, 2, 25, 17, 34, 6, ...]

Test 1: Start at 32 → Run session → Result: $100 profit in 28 spins ✅
Test 2: Start at 15 → Run session → Result: Bankrupt after 52 spins ❌
Test 3: Start at 19 → Run session → Result: $100 profit in 19 spins ✅
...
Test 100: Start at number 100 → ...
```

## Features

### 1. Data Input
- **CSV Upload**: Comma-separated numbers
- **TXT Upload**: Line-separated or comma-separated
- **Direct Paste**: Copy/paste numbers directly into textarea
- **Drag & Drop**: Drag files directly to upload area

### 2. Real-Time Progress
- **Progress Bar**: Visual percentage complete
- **Live Stats**: Current test, bankroll, wins/losses
- **Console Log**: Detailed activity log
- **Completion Status**: Updates every test

### 3. Comprehensive Results
- **Session Summary**: All test results with key metrics
- **Analytics Dashboard**: Success rate, average spins, win rates
- **Detailed Trades**: Every single bet recorded
- **Excel Export**: Professional multi-sheet report

## Using the Test Model

### Step 1: Access Test Model
1. Open main application
2. Click **"🧪 Test Model"** button (next to RESET)
3. Test Model page opens

### Step 2: Load Historical Data
**Option A - Upload File:**
1. Click "Choose CSV/TXT File"
2. Select file with historical numbers
3. Numbers appear in textarea

**Option B - Paste Numbers:**
1. Click in the text area
2. Paste comma or line-separated numbers
3. Example formats:
   ```
   32, 15, 19, 4, 21, 2
   
   or
   
   32
   15
   19
   4
   ```

### Step 3: Start Testing
1. Click **"🚀 Start Backtesting"**
2. Confirm the test run
3. Watch progress bar and live stats
4. Wait for completion (typically 30-60 seconds for 500 numbers)

### Step 4: View Results
**Quick Stats** (displayed on page):
- Success Rate
- Average Spins to Win
- Average Spins to Lose
- Overall Win Rate

**Detailed Results**:
1. Click **"🔍 View Detailed Results"**
2. New window opens with all session data
3. Sortable table with every test

### Step 5: Export to Excel
1. Click **"📊 Export to Excel"**
2. Excel file created with 3 sheets:
   - **Session Results**: Summary of all tests
   - **Analytics Dashboard**: Statistical analysis
   - **Detailed Trades**: Every bet made
3. File saved to temp directory
4. Open in Excel for further analysis

## Excel Report Structure

### Sheet 1: Session Results
| Test # | Start Pos | Start Number | Result | Spins | Bankroll | Profit/Loss | Bets | Wins | Losses | Win Rate |
|--------|-----------|--------------|--------|-------|----------|-------------|------|------|--------|----------|
| 1      | 0         | 32           | WIN    | 25    | $4,100   | +$100       | 25   | 12   | 13     | 48%      |

### Sheet 2: Analytics Dashboard
- **Overview**: Total sessions, success rate, failure breakdown
- **Performance**: Avg spins to win/lose, min/max values
- **Financial**: Bankroll stats, drawdown analysis
- **Distribution**: Session count by spin ranges

### Sheet 3: Detailed Trades
| Session | Spin | Number | Prediction | Bet | Total | Hit/Miss | P/L | Bankroll | Confidence |
|---------|------|--------|------------|-----|-------|----------|-----|----------|------------|
| 1       | 5    | 19     | 3,7,8...   | $2  | $24   | HIT      | +$46| $4,046   | 78%        |

## Performance Expectations

### Typical Results
- **Success Rate**: 25-40% (realistic for roulette)
- **Avg Spins to Win**: 20-35 spins
- **Avg Spins to Lose**: 40-60 spins
- **Overall Win Rate**: 30-45% of all bets

### What Good Results Look Like
✅ Success rate > 30%
✅ Average spins to win < 40
✅ Failure mostly from max spins (not bankruptcy)
✅ Win rate on successful sessions > 40%

### Red Flags
❌ Success rate < 20%
❌ Most failures from bankruptcy (not max spins)
❌ Very high average spins to win (>50)
❌ Overall win rate < 25%

## Technical Details

### Session Limits
- **Starting Bankroll**: $4,000
- **Session Target**: $100 profit
- **Max Spins**: 250 (failure if exceeded)
- **Min Confidence**: 70% (75% after 3+ losses)

### Betting Rules (Same as Live)
- **Starting Bet**: $2 per number
- **After Win**: Decrease by $1 (min $2)
- **After Loss**: Increase by $1
- **Numbers Bet**: 12 (4 anchors + 8 neighbors)

### Data Requirements
- **Minimum**: 10 numbers (for basic testing)
- **Recommended**: 100-500 numbers (for statistical validity)
- **Format**: Numbers 0-36 only
- **No Duplicates**: Consecutive duplicates not expected

## Troubleshooting

### "Not enough numbers!"
- Need at least 10 numbers
- Check file format (comma or line separated)
- Ensure all numbers are 0-36

### "Invalid numbers found"
- All numbers must be 0-36
- Remove any non-numeric characters
- Check for typos

### Backend Connection Error
- Ensure Python backend is running (`python3 backend/api/ai_server.py`)
- Check port 8000 is not blocked
- Verify backend shows "Starting Roulette AI Server..."

### Export Failed
- Backend must be running
- Check disk space for Excel file
- Ensure openpyxl is installed

## Tips for Best Results

### Data Quality
1. Use real historical data (not random)
2. Longer datasets = more reliable results
3. Recent data may be most relevant
4. Verify data accuracy before testing

### Analysis
1. Look for patterns in successful sessions
2. Identify which starting positions work best
3. Compare success rates across different data sources
4. Track improvements after AI adjustments

### Interpretation
1. Don't expect 100% success rate (unrealistic)
2. Focus on consistency over single results
3. Compare multiple datasets
4. Consider risk/reward ratio

## Sample Data

A sample dataset is included: `sample_test_data.csv`

This contains 100 sequential numbers you can use to test the system:
```
32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31
```

## API Endpoints

### POST /backtest/run
Run complete backtest on historical data
```json
{
  "numbers": [32, 15, 19, 4, 21, ...]
}
```

### POST /backtest/export
Export results to Excel
```json
{
  "results": [...],
  "analytics": {...}
}
```

## Next Steps

After running backtests:
1. Analyze Excel report for insights
2. Identify patterns in successful sessions
3. Adjust AI parameters if needed
4. Test with different historical datasets
5. Compare performance across time periods

---

**Version**: 1.0
**Last Updated**: January 2026
**Status**: ✅ Fully Functional
