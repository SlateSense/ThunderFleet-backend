# Sea Battle Logging System

This document describes the comprehensive logging system implemented for the Sea Battle game.

## Log Files

The logging system creates separate log files for different types of events:

### Transaction Logs (`logs/transactions-YYYY-MM-DD.log`)
- **Retention**: 90 days
- **Purpose**: Track all financial transactions and payments
- **Events logged**:
  - `payment_verified` - When a player's payment is confirmed
  - `payment_failed` - When a player's payment fails
  - `payout_sent` - When winnings are sent to a player
  - `platform_fee_sent` - When platform fees are sent
  - `payout_failed` - When payout processing fails

### Game Logs (`logs/games-YYYY-MM-DD.log`)
- **Retention**: 30 days
- **Purpose**: Track game events and outcomes
- **Events logged**:
  - `game_created` - When a new game is created
  - `game_ended` - When a game ends (with winner and payout details)
  - `bot_joined` - When a bot joins a game
  - `disconnect_win` - When a player wins due to opponent disconnect

### Player Logs (`logs/players-YYYY-MM-DD.log`)
- **Retention**: 30 days
- **Purpose**: Track player actions and connections
- **Events logged**:
  - `player_joined` - When a player joins a game
  - `player_disconnected` - When a player disconnects
  - `player_reconnected` - When a player reconnects

### Error Logs (`logs/errors-YYYY-MM-DD.log`)
- **Retention**: 60 days
- **Purpose**: Track system errors and exceptions
- **Events logged**:
  - All error-level events and exceptions

## Log Format

All logs use JSON format with the following structure:

```json
{
  "timestamp": "2025-07-14T16:15:25.123Z",
  "level": "info",
  "message": "...",
  "label": "GAME|TRANSACTION|PLAYER",
  "event": "event_name",
  "gameId": "game_123456",
  "playerId": "socket_id",
  "amount": 1000,
  "currency": "SATS",
  "lightningAddress": "player@speed.app",
  "...": "additional event-specific fields"
}
```

## Log Rotation

- **Daily rotation**: New log files are created daily
- **Size limit**: 20MB per file (10MB for errors)
- **Compression**: Old logs are automatically compressed
- **Automatic cleanup**: Old logs are deleted after retention period

## Viewing Logs

### Real-time monitoring
```bash
# Watch all logs
tail -f logs/*.log

# Watch specific log type
tail -f logs/transactions-*.log
tail -f logs/games-*.log
tail -f logs/players-*.log
```

### Search logs
```bash
# Search for specific player
grep "player_id_here" logs/*.log

# Search for specific game
grep "game_123456" logs/*.log

# Search for payment events
grep "payment_" logs/transactions-*.log
```

### Analyze daily stats
```bash
# Count games per day
grep "game_ended" logs/games-2025-07-14.log | wc -l

# Count payments per day
grep "payment_verified" logs/transactions-2025-07-14.log | wc -l

# Check payout amounts
grep "payout_sent" logs/transactions-2025-07-14.log | grep -o '"amount":[0-9]*'
```

## Log Analysis Examples

### Daily Revenue Report
```bash
# Total payments received today
grep "payment_verified" logs/transactions-$(date +%Y-%m-%d).log | \
  grep -o '"amount":[0-9]*' | \
  cut -d: -f2 | \
  awk '{sum+=$1} END {print "Total payments: " sum " SATS"}'

# Total payouts sent today
grep "payout_sent" logs/transactions-$(date +%Y-%m-%d).log | \
  grep -o '"amount":[0-9]*' | \
  cut -d: -f2 | \
  awk '{sum+=$1} END {print "Total payouts: " sum " SATS"}'
```

### Game Statistics
```bash
# Games won by humans vs bots
grep "game_ended" logs/games-$(date +%Y-%m-%d).log | \
  grep -o '"winnerType":"[^"]*"' | \
  sort | uniq -c
```

### Player Activity
```bash
# Active players today
grep "player_joined" logs/players-$(date +%Y-%m-%d).log | \
  grep -o '"playerId":"[^"]*"' | \
  sort | uniq | wc -l
```

## Maintenance

### Log Directory Structure
```
logs/
├── transactions-2025-07-14.log
├── transactions-2025-07-13.log.gz
├── games-2025-07-14.log
├── games-2025-07-13.log.gz
├── players-2025-07-14.log
├── players-2025-07-13.log.gz
└── errors-2025-07-14.log
```

### Manual Cleanup (if needed)
```bash
# Remove logs older than 90 days
find logs/ -name "*.log*" -mtime +90 -delete

# Compress current logs
gzip logs/*.log
```

## Privacy and Security

- Player IDs are socket IDs (not personal identifiers)
- Lightning addresses are logged for transaction purposes
- No sensitive payment details are logged
- All logs are stored locally and rotated automatically
- Financial logs are kept longer for compliance purposes

## Troubleshooting

### Common Issues

1. **Logs not appearing**: Check file permissions on `logs/` directory
2. **Disk space**: Monitor log directory size, especially during high activity
3. **Performance**: Large log files may impact performance; ensure rotation is working

### Debug Mode
To enable more verbose logging, set the log level to `debug`:
```javascript
const logger = winston.createLogger({
  level: 'debug',  // Change from 'info' to 'debug'
  // ... rest of config
});
```
