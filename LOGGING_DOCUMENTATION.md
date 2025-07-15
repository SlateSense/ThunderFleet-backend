# Enhanced Player Data Logging System

## Overview
The logging system has been significantly enhanced to capture comprehensive player data throughout the entire game lifecycle. This addresses all the requirements you mentioned.

## Data Tracked for Each Player

### Core Player Information
- **Player ID**: Unique identifier for each player
- **Lightning Address**: Player's Lightning Network address
- **Bet Amount**: Amount the player wagered
- **Is Bot**: Whether the player is a bot or human
- **Join Time**: When the player joined the game
- **Game ID**: Unique identifier for the game session

### Payment Status Tracking
- **Payment Sent**: Whether the player successfully sent their bet payment
- **Payment Received**: Whether the player received payout (if they won)
- **Payout Amount**: Amount of payout received (if applicable)
- **Payout Status**: 'sent', 'failed', or 'not_applicable'

### Game Performance Metrics
- **Game Result**: 'won', 'lost', or 'disconnected'
- **Shots Fired**: Total number of shots the player took
- **Shots Hit**: Number of successful hits
- **Ships Destroyed**: Number of opponent ships destroyed
- **Game Start Time**: When the actual game began
- **Game End Time**: When the game ended
- **Game Duration**: Length of the game in seconds

### Connection Tracking
- **Disconnected During Game**: Whether the player disconnected during gameplay
- **Disconnect Count**: Number of times the player disconnected
- **Disconnect Times**: Array of timestamps when disconnections occurred
- **Reconnect Times**: Array of timestamps when reconnections occurred
- **Last Activity**: Most recent activity timestamp

### Opponent Information
- **Opponent Type**: 'human' or 'bot'

## Log Files Generated

### 1. `player-sessions-YYYY-MM-DD.log`
Contains comprehensive player session data with all the fields mentioned above. Each entry includes:
- Session creation
- Session updates (payment status, game events, disconnections)
- Final session summary

### 2. `transactions-YYYY-MM-DD.log`
Contains payment-related events:
- Payment verification
- Payment failures
- Payout sent confirmations
- Platform fee payments
- Payout failures

### 3. `games-YYYY-MM-DD.log`
Contains game-level events:
- Game creation
- Bot joins
- Game endings
- Game summaries
- Disconnect wins

### 4. `players-YYYY-MM-DD.log`
Contains player-specific events:
- Player joins
- Player disconnections
- Player reconnections

### 5. `errors-YYYY-MM-DD.log`
Contains error events and system issues.

## Key Features

### Real-time Tracking
- All events are logged in real-time as they occur
- Session data is updated continuously throughout the game

### Comprehensive Session Lifecycle
- Player session is tracked from join to game completion
- Final session summary includes all relevant data

### Payment Flow Tracking
- Full payment lifecycle from bet payment to payout
- Failure tracking for debugging payment issues

### Connection Monitoring
- Detailed tracking of disconnections and reconnections
- Automatic game resolution for permanent disconnections

### Game Performance Analytics
- Shot accuracy tracking
- Ship destruction statistics
- Game duration analysis

## Example Log Entry

```json
{
  "playerId": "player123",
  "timestamp": "2025-07-15T05:30:00.000Z",
  "sessionData": {
    "event": "game_ended",
    "gameId": "game_1721024400000",
    "lightningAddress": "player@speed.app",
    "betAmount": 1000,
    "paymentSent": true,
    "paymentReceived": true,
    "gameResult": "won",
    "disconnectedDuringGame": false,
    "gameStartTime": "2025-07-15T05:25:00.000Z",
    "gameEndTime": "2025-07-15T05:30:00.000Z",
    "gameDuration": 300,
    "opponentType": "bot",
    "payoutAmount": 1700,
    "payoutStatus": "sent",
    "shotsFired": 15,
    "shotsHit": 8,
    "shipsDestroyed": 5,
    "disconnectCount": 0,
    "disconnectTimes": [],
    "reconnectTimes": []
  }
}
```

## Usage for Analysis

The enhanced logging system provides all the data needed to:

1. **Track Payment Flow**: See if payments were sent and received
2. **Monitor Game Performance**: Analyze win/loss ratios and game statistics
3. **Identify Connection Issues**: Track disconnections and their impact
4. **Audit Financial Transactions**: Complete payment trail for compliance
5. **Generate Reports**: Comprehensive data for business analytics
6. **Debug Issues**: Detailed error tracking and session lifecycle

## Log Retention

- **Player Sessions**: 60 days
- **Transactions**: 90 days (for compliance)
- **Games**: 30 days
- **Players**: 30 days
- **Errors**: 60 days

All logs are automatically compressed and rotated daily to optimize storage.
