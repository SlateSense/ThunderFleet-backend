# Sea Battle Log Forwarding Setup Script
Write-Host "🎮 Sea Battle Log Forwarding Setup" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Check if log receiver is running
Write-Host "🔍 Checking if log receiver is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Log receiver is running!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Log receiver is not running. Please start it first." -ForegroundColor Red
    Write-Host "Run: Start-Process -FilePath 'start-log-receiver.bat'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "📋 Your Network Information:" -ForegroundColor Cyan
Write-Host "   Local IP: 192.168.29.193" -ForegroundColor White
Write-Host "   Public IP: 49.36.218.29" -ForegroundColor White
Write-Host "   Router IP: 192.168.29.1" -ForegroundColor White
Write-Host "   Log Receiver Port: 3001" -ForegroundColor White

Write-Host ""
Write-Host "🔧 Setup Options:" -ForegroundColor Cyan
Write-Host "   1. Router Port Forwarding (Permanent)" -ForegroundColor White
Write-Host "   2. ngrok Tunnel (Temporary, easier)" -ForegroundColor White

Write-Host ""
Write-Host "📝 For Router Port Forwarding:" -ForegroundColor Yellow
Write-Host "   1. Go to: http://192.168.29.1" -ForegroundColor White
Write-Host "   2. Find 'Port Forwarding' or 'Virtual Servers' section" -ForegroundColor White
Write-Host "   3. Add new rule:" -ForegroundColor White
Write-Host "      - External Port: 3001" -ForegroundColor White
Write-Host "      - Internal IP: 192.168.29.193" -ForegroundColor White
Write-Host "      - Internal Port: 3001" -ForegroundColor White
Write-Host "      - Protocol: TCP" -ForegroundColor White
Write-Host "   4. Save and restart router" -ForegroundColor White
Write-Host "   5. Use this URL in Render: http://49.36.218.29:3001/logs" -ForegroundColor Green

Write-Host ""
Write-Host "🌐 For ngrok Setup:" -ForegroundColor Yellow
Write-Host "   1. Sign up at: https://dashboard.ngrok.com/signup" -ForegroundColor White
Write-Host "   2. Get authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken" -ForegroundColor White
Write-Host "   3. Run: .\ngrok.exe config add-authtoken YOUR_TOKEN" -ForegroundColor White
Write-Host "   4. Run: .\ngrok.exe http 3001" -ForegroundColor White
Write-Host "   5. Use the ngrok URL in Render (e.g., https://abc123.ngrok.io/logs)" -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Render Environment Variables:" -ForegroundColor Cyan
Write-Host "   LOG_FORWARDING_ENABLED=true" -ForegroundColor White
Write-Host "   LOCAL_LOG_ENDPOINT=YOUR_CHOSEN_URL_FROM_ABOVE" -ForegroundColor White

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
