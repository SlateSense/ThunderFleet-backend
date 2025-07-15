# Setup automatic log cleanup using Windows Task Scheduler

param(
    [int]$DaysToKeep = 30,
    [string]$RunTime = "02:00"  # Run at 2 AM daily
)

Write-Host "⏰ Setting up automatic log cleanup" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green

$currentDir = Get-Location
$scriptPath = Join-Path $currentDir "cleanup-old-logs.ps1"
$logPath = Join-Path $currentDir "cleanup-log.txt"

# Check if cleanup script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Cleanup script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

$taskName = "SeaBattle-LogCleanup"
$action = New-ScheduledTaskAction -Execute "PowerShell" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`" -DaysToKeep $DaysToKeep > `"$logPath`" 2>&1"
$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    # Remove existing task if it exists
    Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
    
    # Create new task
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Automatically clean up old Sea Battle logs"
    
    Write-Host "✅ Scheduled task created successfully!" -ForegroundColor Green
    Write-Host "📅 Task: $taskName" -ForegroundColor Cyan
    Write-Host "⏰ Runtime: Daily at $RunTime" -ForegroundColor Cyan
    Write-Host "📁 Script: $scriptPath" -ForegroundColor Cyan
    Write-Host "📝 Log file: $logPath" -ForegroundColor Cyan
    Write-Host "🗑️  Keep logs for: $DaysToKeep days" -ForegroundColor Cyan
    
    Write-Host "`n💡 To manage this task:" -ForegroundColor Yellow
    Write-Host "   View: Get-ScheduledTask -TaskName `"$taskName`"" -ForegroundColor White
    Write-Host "   Run now: Start-ScheduledTask -TaskName `"$taskName`"" -ForegroundColor White
    Write-Host "   Remove: Unregister-ScheduledTask -TaskName `"$taskName`"" -ForegroundColor White
    
} catch {
    Write-Host "❌ Failed to create scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
