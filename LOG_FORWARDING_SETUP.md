# 🚀 Sea Battle Log Forwarding Setup Guide

This system will send all player logs from your Render server directly to your PC in real-time!

## 📋 Setup Steps

### 1. **Start Local Log Receiver (On Your PC)**

Open PowerShell in the backend directory and run:
```powershell
PowerShell -ExecutionPolicy Bypass -File "start-log-receiver.ps1"
```

This will:
- Start a local server on port 3001
- Display your local IP address
- Show configuration details
- Create a `received-logs/` folder for storing logs

### 2. **Configure Render Environment Variables**

Go to your Render dashboard and add these environment variables:

```
LOG_FORWARDING_ENABLED=true
LOCAL_LOG_ENDPOINT=http://YOUR_LOCAL_IP:3001/logs
```

Replace `YOUR_LOCAL_IP` with the IP address shown by the startup script.

### 3. **Deploy Updated Code**

Deploy the updated `server.js` and `log-forwarder.js` files to Render.

### 4. **Test the System**

1. ✅ Start your log receiver locally
2. ✅ Play a game on your frontend
3. ✅ Check your local console for incoming logs
4. ✅ Check the `received-logs/` folder for saved files

## 📊 What You'll See

### Console Output (Real-time):
```
🎮 RECEIVED LOG: player-session
📅 Timestamp: 2025-07-15T07:00:00.000Z
👤 PLAYER: user@speed.app
🎯 Event: game_ended
💰 Bet: 1000 SATS
🏆 Result: won
💸 Payout: 1700 SATS
⏱️ Duration: 240 seconds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Log Files Created:
- `received-logs/player-session-2025-07-15.json`
- `received-logs/player-user_at_speed.app-2025-07-15.json`
- `received-logs/payment-2025-07-15.json`
- `received-logs/game-event-2025-07-15.json`

## 🔧 Configuration Options

### Environment Variables (Set on Render):
- `LOG_FORWARDING_ENABLED`: Set to `true` to enable forwarding
- `LOCAL_LOG_ENDPOINT`: Your PC's endpoint (e.g., `http://192.168.1.100:3001/logs`)

### Local Configuration:
- `LOCAL_LOG_PORT`: Port for local receiver (default: 3001)

## 📁 Log File Structure

Each log entry contains:
```json
{
  "timestamp": "2025-07-15T07:00:00.000Z",
  "logType": "player-session",
  "source": "render-server",
  "data": {
    "lightningAddress": "user@speed.app",
    "sessionData": {
      "event": "game_ended",
      "gameResult": "won",
      "betAmount": 1000,
      "payoutAmount": 1700,
      "gameDuration": 240,
      "paymentSent": true,
      "paymentReceived": true,
      "shotsFired": 15,
      "shotsHit": 8,
      "shipsDestroyed": 5
    }
  }
}
```

## 🌐 Web Interface

Access recent logs via web browser:
- Health check: `http://localhost:3001/health`
- Recent logs: `http://localhost:3001/logs/recent`

## 🛠️ Troubleshooting

### If logs don't appear:
1. Check if log receiver is running on your PC
2. Verify Render environment variables are set correctly
3. Ensure your PC is accessible from the internet (firewall/router settings)
4. Check Render deployment logs for errors

### If connection fails:
- The system will fallback to saving logs on the Render server
- Check `forwarded-logs/` directory on Render for backup logs

## 🔄 How It Works

1. **Game Event Occurs** → Player joins, pays, plays, wins/loses
2. **Server Logs Event** → Enhanced logging system captures all data
3. **Log Forwarding** → System attempts to send log to your PC
4. **Local Processing** → Your PC receives, processes, and saves the log
5. **Fallback** → If PC unreachable, saves to Render server files

## 🎯 Benefits

- ✅ **Real-time logs** on your PC
- ✅ **Persistent storage** (not lost when Render restarts)
- ✅ **Player-specific files** for easy tracking
- ✅ **Automatic backup** if PC is offline
- ✅ **Rich console output** for monitoring
- ✅ **Web interface** for easy viewing

## 📞 Support

If you encounter issues:
1. Check the console output for error messages
2. Verify network connectivity
3. Ensure all environment variables are set correctly
4. Check that your firewall allows incoming connections on port 3001

---

**🎮 Ready to receive real-time player logs on your PC!**
