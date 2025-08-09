# 50 SATS Betting Pattern Implementation

## Overview
A new 50 SATS betting option has been added with a specific win/loss pattern when playing against the bot.

## Pattern Details
- **Pattern**: W-L-W-W-L-L-L-W-L (9-game cycle)
- **Win Rate**: 44.4% (4 wins out of 9 games)
- **Payout**: Winner receives 80 SATS (platform fee: 20 SATS)

## Implementation

### 1. Payout Structure
```javascript
const PAYOUTS = {
  50: { winner: 80, platformFee: 20 },  // NEW
  300: { winner: 500, platformFee: 100 },
  500: { winner: 800, platformFee: 200 },
  1000: { winner: 1700, platformFee: 300 },
  5000: { winner: 8000, platformFee: 2000 },
  10000: { winner: 17000, platformFee: 3000 },
};
```

### 2. Pattern Tracking
The system tracks each player's game history per bet amount using a Map:
- `playerBettingHistory`: Stores game count for each player and bet amount
- Pattern is determined before the game starts
- Bot behavior adjusts based on whether player should win or lose

### 3. Bot Behavior for 50 SATS Games

#### When Player Should WIN (games 1, 3, 4, 8):
- Bot plays poorly with reduced accuracy
- Bot hit chance: ~30%
- Bot stops being aggressive after destroying 3 ships
- Ensures competitive but winnable gameplay

#### When Player Should LOSE (games 2, 5, 6, 7, 9):
- Bot plays aggressively
- Bot hit chance: ~70%
- Bot catches up if player is close to winning
- Maintains tension while ensuring bot victory

### 4. Key Functions

#### `shouldPlayerWinBy50SatsPattern(lightningAddress)`
Determines if the player should win their next 50 SATS game based on the pattern.

#### `getPlayerGameCount(lightningAddress, betAmount)`
Returns the number of games played by a player for a specific bet amount.

#### `incrementPlayerGameCount(lightningAddress, betAmount)`
Increments the game counter after a game starts.

### 5. Game Flow
1. Player joins with 50 SATS bet
2. System checks pattern position
3. Game is marked with `playerShouldWin50Sats` flag
4. Bot behavior adjusts accordingly during gameplay
5. Game count is incremented for next game

## Testing
Run the test script to verify the pattern:
```bash
node test_50_sats_pattern.js
```

## Important Notes
- Pattern is per Lightning address
- Pattern is specific to 50 SATS bet amount
- Other bet amounts are not affected
- Pattern persists across sessions (in memory)
- Pattern resets if server restarts

## Future Enhancements for 300+ SATS
The groundwork is laid for implementing the L-W-L-W-L-W-L-L-W pattern for 300+ SATS bets:
- Same Lightning address verification
- Same bet amount requirement
- Pattern: L-W-L-W-L-W-L-L-W (9-game cycle)
- Implementation ready but not activated yet
