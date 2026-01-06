// TEST MODEL RENDERER
// Handles backtesting of historical data

let backtestResults = null;
let backtestAnalytics = null;
let isTestingInProgress = false;

// File upload handling
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const numbersInput = document.getElementById('numbersInput');

fileInput.addEventListener('change', handleFileSelect);

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const content = e.target.result;
        numbersInput.value = content;
        addLog(`✅ File loaded: ${file.name} (${content.length} characters)`);
    };
    
    reader.onerror = () => {
        addLog(`❌ Error reading file: ${file.name}`, 'error');
    };
    
    reader.readAsText(file);
}

function parseNumbers(text) {
    // Remove all non-numeric characters except commas and newlines
    // Then split by comma or newline and parse
    const numbers = text
        .split(/[,\s\n]+/)
        .map(s => s.trim())
        .filter(s => s !== '')
        .map(s => parseInt(s))
        .filter(n => !isNaN(n) && n >= 0 && n <= 36);
    
    return numbers;
}

async function startBacktest() {
    const text = numbersInput.value.trim();
    
    if (!text) {
        alert('Please upload a file or paste numbers first!');
        return;
    }
    
    // Parse numbers
    const numbers = parseNumbers(text);
    
    if (numbers.length < 10) {
        alert(`Not enough numbers! Found ${numbers.length}, need at least 10.`);
        return;
    }
    
    // Confirm with user
    const confirmed = confirm(
        `Ready to test ${numbers.length} numbers?\n\n` +
        `This will run ${numbers.length} test sessions.\n` +
        `Estimated time: ${Math.ceil(numbers.length / 10)} seconds.\n\n` +
        `Click OK to start.`
    );
    
    if (!confirmed) return;
    
    // Start testing
    isTestingInProgress = true;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('clearBtn').disabled = true;
    
    // Show progress section
    document.getElementById('progressSection').classList.add('active');
    document.getElementById('resultsSection').style.display = 'none';
    
    // Clear previous logs
    document.getElementById('logArea').innerHTML = '';
    
    addLog(`🧪 Starting backtest with ${numbers.length} numbers...`);
    addLog(`📊 Testing all ${numbers.length} starting positions...`);
    
    try {
        // Call backend API
        const response = await fetch('http://localhost:8000/backtest/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                numbers: numbers
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            backtestResults = data.sessions;
            backtestAnalytics = data.analytics;
            console.log('DEBUG: Full response:', data);
            console.log('DEBUG: Analytics:', backtestAnalytics);
            console.log('DEBUG: Sessions count:', data.sessions?.length);
            
            // Update progress to 100%
            updateProgress(100);
            
            addLog(`✅ Backtest complete!`);
            addLog(`📊 ${data.analytics.successful_count}/${data.analytics.total_sessions} sessions successful`);
            addLog(`💰 Success rate: ${data.analytics.success_rate.toFixed(1)}%`);
            
            // Show results
            displayResults();
            
        } else {
            addLog(`❌ Error: ${data.error}`, 'error');
            alert(`Backtest failed: ${data.error}`);
        }
        
    } catch (error) {
        addLog(`❌ Connection error: ${error.message}`, 'error');
        alert(`Failed to connect to backend: ${error.message}`);
    } finally {
        isTestingInProgress = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('clearBtn').disabled = false;
    }
}

function updateProgress(percent) {
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = percent + '%';
    progressBar.textContent = percent.toFixed(0) + '%';
}

function displayResults() {
    if (!backtestResults || !backtestAnalytics) return;
    
    // Show results section
    document.getElementById('resultsSection').style.display = 'block';
    
    // Update alert
    const resultsAlert = document.getElementById('resultsAlert');
    resultsAlert.innerHTML = `
        <strong>✅ Backtest Complete!</strong><br>
        Tested ${backtestAnalytics.total_sessions} sessions with ${backtestAnalytics.success_rate.toFixed(1)}% success rate.
    `;
    
    // Update stats
    document.getElementById('successRate').textContent = backtestAnalytics.success_rate.toFixed(1) + '%';
    document.getElementById('avgSpinsWin').textContent = backtestAnalytics.avg_spins_to_win.toFixed(1);
    document.getElementById('avgSpinsLose').textContent = backtestAnalytics.avg_spins_to_lose.toFixed(1);
    document.getElementById('overallWinRate').textContent = backtestAnalytics.overall_win_rate.toFixed(1) + '%';
    
    // Update progress stats
    document.getElementById('completedCount').textContent = backtestAnalytics.total_sessions;
    document.getElementById('successCount').textContent = backtestAnalytics.successful_count;
    document.getElementById('failedCount').textContent = 
        backtestAnalytics.failed_bankrupt_count + backtestAnalytics.failed_max_spins_count;
    
    addLog(`📈 Results displayed. Click "Export to Excel" to save detailed report.`);
}

async function exportToExcel() {
    if (!backtestResults || !backtestAnalytics) {
        alert('No results to export!');
        return;
    }
    
    addLog('📊 Exporting results to Excel...');
    
    try {
        const response = await fetch('http://localhost:8000/backtest/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessions: backtestResults,
                analytics: backtestAnalytics
            })
        });

        // Get file as blob
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backtest_results_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        addLog('✅ Excel file downloaded successfully!');
        alert('Excel report downloaded! Check your Downloads folder.');
        
    } catch (error) {
        addLog(`❌ Export error: ${error.message}`, 'error');
        alert(`Export failed: ${error.message}`);
    }
}

function viewDetailedResults() {
    if (!backtestResults) {
        alert('No results available!');
        return;
    }
    
    // Create a simple results viewer
    const resultWindow = window.open('', 'Backtest Results', 'width=1200,height=800');
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Backtest Results</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                th { background: #1e3c72; color: white; }
                tr:nth-child(even) { background: #f9f9f9; }
                .success { color: #4CAF50; font-weight: bold; }
                .fail { color: #f44336; font-weight: bold; }
                .clickable { cursor: pointer; color: #2196F3; text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Backtest Results - ${backtestAnalytics.total_sessions} Sessions</h1>
            <p>Success Rate: ${backtestAnalytics.success_rate.toFixed(1)}%</p>
            <table>
                <thead>
                    <tr>
                        <th>Test #</th>
                        <th>Start Pos</th>
                        <th>Start #</th>
                        <th>Result</th>
                        <th>Spins</th>
                        <th>Final Bankroll</th>
                        <th>Profit/Loss</th>
                        <th>Win Rate</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    backtestResults.forEach(result => {
        const profitLoss = result.final_bankroll - 4000;
        const resultClass = result.result === 'TARGET_REACHED' ? 'success' : 'fail';
        
        html += `
            <tr>
                <td>${result.test_number}</td>
                <td>${result.start_position}</td>
                <td>${result.start_number || 'N/A'}</td>
                <td class="${resultClass}">${result.result}</td>
                <td>${result.spins_needed}</td>
                <td>$${result.final_bankroll.toFixed(0)}</td>
                <td>$${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(0)}</td>
                <td>${result.win_rate.toFixed(1)}%</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </body>
        </html>
    `;
    
    resultWindow.document.write(html);
    resultWindow.document.close();
}

function stopBacktest() {
    isTestingInProgress = false;
    addLog('⏹ Testing stopped by user', 'warning');
}

function clearData() {
    if (isTestingInProgress) {
        alert('Cannot clear while testing is in progress!');
        return;
    }
    
    const confirmed = confirm('Clear all data and results?');
    if (!confirmed) return;
    
    numbersInput.value = '';
    fileInput.value = '';
    backtestResults = null;
    backtestAnalytics = null;
    
    document.getElementById('progressSection').classList.remove('active');
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('logArea').innerHTML = '';
    
    // Reset progress bar
    updateProgress(0);
    
    addLog('🗑 Data cleared');
}

function addLog(message, type = 'info') {
    const logArea = document.getElementById('logArea');
    const timestamp = new Date().toLocaleTimeString();
    
    let color = '#00ff00';
    if (type === 'error') color = '#ff5555';
    if (type === 'warning') color = '#ffaa00';
    if (type === 'success') color = '#55ff55';
    
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.style.color = color;
    logLine.textContent = `[${timestamp}] ${message}`;
    
    logArea.appendChild(logLine);
    logArea.scrollTop = logArea.scrollHeight;
}

function goBackToMain() {
    if (isTestingInProgress) {
        const confirmed = confirm('Testing is in progress. Are you sure you want to go back?');
        if (!confirmed) return;
    }
    
    window.location.href = 'index.html';
}

// Initialize
addLog('🧪 Test Model loaded. Ready for backtesting.');
addLog('📝 Upload a file or paste numbers to begin.');
