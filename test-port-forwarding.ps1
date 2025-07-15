# Test Port Forwarding Script
Write-Host "🔍 Testing Port Forwarding Setup" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""

# Test local connection first
Write-Host "1. Testing LOCAL connection..." -ForegroundColor Yellow
try {
    $localResponse = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 5
    if ($localResponse.StatusCode -eq 200) {
        Write-Host "   ✅ Local connection working!" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Local connection failed! Start log receiver first." -ForegroundColor Red
    exit 1
}

# Test internal IP connection
Write-Host "2. Testing INTERNAL IP connection..." -ForegroundColor Yellow
try {
    $internalResponse = Invoke-WebRequest -Uri 'http://192.168.29.193:3001/health' -UseBasicParsing -TimeoutSec 5
    if ($internalResponse.StatusCode -eq 200) {
        Write-Host "   ✅ Internal IP connection working!" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Internal IP connection failed!" -ForegroundColor Red
}

# Test external IP connection (this tests port forwarding)
Write-Host "3. Testing EXTERNAL IP connection (port forwarding)..." -ForegroundColor Yellow
try {
    $externalResponse = Invoke-WebRequest -Uri 'http://49.36.218.29:3001/health' -UseBasicParsing -TimeoutSec 10
    if ($externalResponse.StatusCode -eq 200) {
        Write-Host "   ✅ Port forwarding working perfectly!" -ForegroundColor Green
        Write-Host "   🎉 You can use: http://49.36.218.29:3001/logs" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Port forwarding not working yet." -ForegroundColor Red
    Write-Host "   💡 Make sure you configured port forwarding correctly." -ForegroundColor Yellow
    Write-Host "   💡 Wait a few minutes after router restart." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "   Router IP: 192.168.29.1" -ForegroundColor White
Write-Host "   Internal IP: 192.168.29.193" -ForegroundColor White
Write-Host "   External IP: 49.36.218.29" -ForegroundColor White
Write-Host "   Port: 3001" -ForegroundColor White
Write-Host "   URL for Render: http://49.36.218.29:3001/logs" -ForegroundColor Green

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
