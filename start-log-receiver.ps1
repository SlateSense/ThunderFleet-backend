# Sea Battle Local Log Receiver Startup Script

Write-Host "🚀 Starting Sea Battle Local Log Receiver" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if required files exist
$requiredFiles = @(
    "local-log-receiver.js",
    "package.json"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "✅ Found: $file" -ForegroundColor Green
    } else {
        Write-Host "❌ Missing: $file" -ForegroundColor Red
        exit 1
    }
}

# Get local IP address
$localIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or $_.IPAddress -like "172.*"}).IPAddress
if (-not $localIP) {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -ne "0.0.0.0"}).IPAddress | Select-Object -First 1
}

Write-Host "🌐 Local IP Address: $localIP" -ForegroundColor Cyan
Write-Host "📡 Log receiver will be available at: http://$localIP:3001" -ForegroundColor Cyan

# Create environment variables
$env:LOCAL_LOG_PORT = "3001"

Write-Host ""
Write-Host "🔧 Configuration:" -ForegroundColor Yellow
Write-Host "   Port: 3001" -ForegroundColor White
Write-Host "   IP: $localIP" -ForegroundColor White
Write-Host "   Logs Directory: received-logs/" -ForegroundColor White
Write-Host ""

Write-Host "📋 To configure your Render server:" -ForegroundColor Yellow
Write-Host "   1. Set environment variable: LOG_FORWARDING_ENABLED=true" -ForegroundColor White
Write-Host "   2. Set environment variable: LOCAL_LOG_ENDPOINT=http://$localIP:3001/logs" -ForegroundColor White
Write-Host ""

Write-Host "🎯 Starting log receiver..." -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Start the log receiver
try {
    node local-log-receiver.js
} catch {
    Write-Host "❌ Failed to start log receiver" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
