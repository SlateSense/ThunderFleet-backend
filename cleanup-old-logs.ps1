# Sea Battle Log Cleanup Script
# Automatically removes logs older than specified days

param(
    [int]$DaysToKeep = 30  # Keep logs for 30 days by default
)

Write-Host "🧹 Sea Battle Log Cleanup" -ForegroundColor Yellow
Write-Host "=========================" -ForegroundColor Yellow

$logsDir = "received-logs"
$cutoffDate = (Get-Date).AddDays(-$DaysToKeep)

if (-not (Test-Path $logsDir)) {
    Write-Host "📁 Logs directory not found: $logsDir" -ForegroundColor Red
    exit 1
}

Write-Host "📅 Removing logs older than: $($cutoffDate.ToString('yyyy-MM-dd'))" -ForegroundColor Cyan
Write-Host "📂 Checking directory: $logsDir" -ForegroundColor Cyan

$oldFiles = Get-ChildItem -Path $logsDir -Filter "*.json" | Where-Object { $_.LastWriteTime -lt $cutoffDate }

if ($oldFiles.Count -eq 0) {
    Write-Host "✅ No old logs to remove" -ForegroundColor Green
} else {
    Write-Host "🗑️  Found $($oldFiles.Count) old log files to remove:" -ForegroundColor Yellow
    
    foreach ($file in $oldFiles) {
        Write-Host "   - $($file.Name) ($(($file.LastWriteTime).ToString('yyyy-MM-dd')))" -ForegroundColor Gray
    }
    
    # Ask for confirmation
    $confirm = Read-Host "`nDelete these files? (y/N)"
    
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        foreach ($file in $oldFiles) {
            Remove-Item $file.FullName -Force
            Write-Host "✅ Deleted: $($file.Name)" -ForegroundColor Green
        }
        Write-Host "🎉 Cleanup completed!" -ForegroundColor Green
    } else {
        Write-Host "❌ Cleanup cancelled" -ForegroundColor Red
    }
}

# Show current log files
Write-Host "`n📊 Current log files:" -ForegroundColor Cyan
$currentFiles = Get-ChildItem -Path $logsDir -Filter "*.json" | Sort-Object LastWriteTime -Descending
foreach ($file in $currentFiles) {
    $sizeKB = [math]::Round($file.Length / 1KB, 2)
    Write-Host "   📄 $($file.Name) - $sizeKB KB ($(($file.LastWriteTime).ToString('yyyy-MM-dd')))" -ForegroundColor White
}

Write-Host "`n💡 To run this cleanup automatically:" -ForegroundColor Yellow
Write-Host "   PowerShell -ExecutionPolicy Bypass -File `"cleanup-old-logs.ps1`" -DaysToKeep 30" -ForegroundColor Cyan
