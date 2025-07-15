# Monitor Incoming Logs Script
Write-Host "🔍 Monitoring for Incoming Logs..." -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Yellow
Write-Host ""

$logCount = 0
$lastCheck = Get-Date

while ($true) {
    Start-Sleep -Seconds 2
    
    # Check for new files in received-logs folder
    $logFiles = Get-ChildItem "received-logs" -ErrorAction SilentlyContinue
    
    if ($logFiles.Count -gt $logCount) {
        $logCount = $logFiles.Count
        Write-Host "📁 New log files detected: $logCount total files" -ForegroundColor Green
        
        # Show the newest file
        $newest = $logFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        Write-Host "   Latest file: $($newest.Name)" -ForegroundColor White
    }
    
    # Check API for recent logs
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:3001/logs/recent' -UseBasicParsing
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.logs.Count -gt 0) {
            Write-Host "📊 API shows $($data.logs.Count) recent logs" -ForegroundColor Green
            $latest = $data.logs[-1]
            Write-Host "   Latest log type: $($latest.logType)" -ForegroundColor White
            Write-Host "   Timestamp: $($latest.timestamp)" -ForegroundColor White
        }
    } catch {
        Write-Host "❌ Could not connect to log receiver API" -ForegroundColor Red
        break
    }
    
    # Show current time
    $currentTime = Get-Date -Format "HH:mm:ss"
    Write-Host "⏰ Last check: $currentTime" -ForegroundColor Gray
}
