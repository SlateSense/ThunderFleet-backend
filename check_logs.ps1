# Sea Battle Log Monitoring Script
# Run this script to check player logs

Write-Host "🔍 Sea Battle Log Checker" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green

# Get today's date for log files
$today = Get-Date -Format "yyyy-MM-dd"

# Define log files
$logFiles = @{
    "Player Sessions" = "logs\player-sessions-$today.log"
    "Transactions" = "logs\transactions-$today.log"
    "Games" = "logs\games-$today.log"
    "Players" = "logs\players-$today.log"
    "Errors" = "logs\errors-$today.log"
}

Write-Host "`n📊 Log File Status:" -ForegroundColor Yellow
foreach ($logType in $logFiles.Keys) {
    $logFile = $logFiles[$logType]
    if (Test-Path $logFile) {
        $size = (Get-Item $logFile).Length
        $lastModified = (Get-Item $logFile).LastWriteTime
        Write-Host "✅ $logType`: $size bytes (Modified: $lastModified)" -ForegroundColor Green
    } else {
        Write-Host "❌ $logType`: File not found" -ForegroundColor Red
    }
}

Write-Host "`n📝 Recent Player Sessions:" -ForegroundColor Yellow
$playerSessionFile = "logs\player-sessions-$today.log"
if (Test-Path $playerSessionFile) {
    $lines = Get-Content $playerSessionFile | Select-Object -Last 5
    if ($lines.Count -gt 0) {
        foreach ($line in $lines) {
            if ($line -match '\|(.+)') {
                $jsonData = $matches[1]
                try {
                    $logEntry = $jsonData | ConvertFrom-Json
                    $lightningAddress = $logEntry.message.lightningAddress
                    $gameResult = $logEntry.message.gameResult
                    $betAmount = $logEntry.message.betAmount
                    $timestamp = $logEntry.timestamp
                    Write-Host "🎮 $lightningAddress - $gameResult - $betAmount SATS ($timestamp)" -ForegroundColor Cyan
                } catch {
                    Write-Host "📝 $line" -ForegroundColor Gray
                }
            }
        }
    } else {
        Write-Host "No player sessions logged yet" -ForegroundColor Gray
    }
} else {
    Write-Host "No player session log file found" -ForegroundColor Gray
}

Write-Host "`n💰 Recent Transactions:" -ForegroundColor Yellow
$transactionFile = "logs\transactions-$today.log"
if (Test-Path $transactionFile) {
    $lines = Get-Content $transactionFile | Select-Object -Last 3
    if ($lines.Count -gt 0) {
        foreach ($line in $lines) {
            if ($line -match '\|(.+)') {
                Write-Host "💳 $($matches[1])" -ForegroundColor Magenta
            }
        }
    } else {
        Write-Host "No transactions logged yet" -ForegroundColor Gray
    }
} else {
    Write-Host "No transaction log file found" -ForegroundColor Gray
}

Write-Host "`n⚠️  Recent Errors:" -ForegroundColor Yellow
$errorFile = "logs\errors-$today.log"
if (Test-Path $errorFile) {
    $lines = Get-Content $errorFile | Select-Object -Last 3
    if ($lines.Count -gt 0) {
        foreach ($line in $lines) {
            if ($line -match '\|(.+)') {
                Write-Host "❌ $($matches[1])" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "No errors logged (Good!)" -ForegroundColor Green
    }
} else {
    Write-Host "No error log file found" -ForegroundColor Gray
}

Write-Host "`n🔄 Commands to monitor logs in real-time:" -ForegroundColor Yellow
Write-Host "Get-Content 'logs\player-sessions-$today.log' -Wait -Tail 10" -ForegroundColor Cyan
Write-Host "Get-Content 'logs\transactions-$today.log' -Wait -Tail 10" -ForegroundColor Cyan
Write-Host "`nPress any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
