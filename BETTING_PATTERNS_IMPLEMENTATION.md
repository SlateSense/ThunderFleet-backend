# Sea Battle Betting Patterns Implementation

## Overview
Two sophisticated betting patterns have been implemented to control game outcomes based on bet amounts and player history.

## 1. 50 SATS Betting Pattern

### Pattern: W-L-W-W-L-L-L-W-L (9-game cycle)
- **Bet Amount**: 50 SATS
- **Payout on Win**: 80 SATS (30 SATS profit)
- **Win Rate**: 44.4% (4 wins out of 9 games)

### Bot Behavior
#### When Player Should WIN (Games 1, 3, 4, 8):
- Bot plays poorly with 30% hit chance
- Bot stops being aggressive after destroying 3 ships
- Ensures competitive but winnable gameplay
- Mostly misses shots to give player advantage

#### When Player Should LOSE (Games 2, 5, 6, 7, 9):
- Bot plays aggressively with 70% hit chance
- Bot catches up if player is close to winning
- Maintains tension while ensuring bot victory
- Strategic targeting to secure wins

### Implementation Details
```javascript
// Pattern definition
const pattern = [true, false, true, true, false, false, false, true, false];

// Bot configuration
if (botState.playerShouldWin) {
  // 30% hit chance - bot plays poorly
  hitChance = 0.3;
} else {
  // 70% hit chance - bot plays aggressively
  hitChance = 0.7;
}
```

## 2. 300+ SATS Betting Pattern

### Pattern: L-W-L-W-L-W-L-L-W (9-game cycle)
- **Bet Amounts**: 300, 500, 1000, 5000, 10000 SATS
- **Win Rate**: 33.3% (3 wins out of 9 games)
- **Special**: More losses at the end of cycle (games 7-8)

### Requirements
1. **Same Bet Amount**: Pattern only continues if the player bets the same amount
2. **Same Lightning Address**: Pattern is tracked per Lightning address
3. **No Patrol Boat Relocation**: When player should win, bot's patrol boat stays in place

### Bot Behavior
#### When Player Should WIN (Games 2, 4, 6, 9):
- Bot plays normally with 40% hit chance
- Makes "mistakes" by missing obvious shots
- Patrol boat is NOT relocated if hit
- Leaves patrol boat alone when player is close to winning
- Provides fair, winnable gameplay

#### When Player Should LOSE (Games 1, 3, 5, 7, 8):
- Bot plays like a noob with 35% hit chance
- Acts confused but still finds ships eventually
- Random shooting pattern like a beginner
- Ensures bot wins despite appearing weak
- Creates tension with seemingly poor play

### Implementation Details
```javascript
// Pattern definition
const pattern = [false, true, false, true, false, true, false, false, true];

// Bot configuration for 300+ SATS
if (botState.playerShouldWin) {
  // Bot plays normally but not too hard
  hitChance = 0.4;
  noPatrolBoatRelocation = true;
} else {
  // Bot plays like noob but wins
  hitChance = 0.35;
}
```

## Pattern Tracking System

### Data Structure
```javascript
playerBettingHistory = Map {
  "player@speed.app" => {
    50: { gameCount: 5, lastGameTime: "...", lastBetAmount: 50 },
    300: { gameCount: 3, lastGameTime: "...", lastBetAmount: 300 }
  }
}
```

### Key Functions
1. **`shouldPlayerWinBy50SatsPattern(lightningAddress)`**
   - Determines outcome for next 50 SATS game
   - Returns true/false based on pattern position

2. **`shouldPlayerWinBy300PlusPattern(lightningAddress, betAmount)`**
   - Determines outcome for 300+ SATS games
   - Validates bet amount >= 300
   - Returns true/false based on pattern position

3. **`incrementPlayerGameCount(lightningAddress, betAmount)`**
   - Updates game counter after each game
   - Tracks per player and bet amount

## Game Flow

### 1. Payment Verification
```javascript
// When payment is verified
if (betAmount === 50) {
  game.playerShouldWin50Sats = shouldPlayerWinBy50SatsPattern(lightningAddress);
}
if (betAmount >= 300) {
  game.playerShouldWin300Plus = shouldPlayerWinBy300PlusPattern(lightningAddress, betAmount);
}
incrementPlayerGameCount(lightningAddress, betAmount);
```

### 2. Bot Configuration
```javascript
// When bot joins the game
if (this.betAmount === 50 && this.playerShouldWin50Sats !== null) {
  this.botState[botId].pattern50Sats = true;
  this.botState[botId].playerShouldWin = this.playerShouldWin50Sats;
}
```

### 3. Bot Firing Logic
The bot's firing behavior adjusts based on the pattern:
- Different hit percentages
- Strategic targeting vs random shooting
- Patrol boat handling
- Endgame behavior

## Testing

Run the test script to verify patterns:
```bash
node test_enhanced_patterns.js
```

### Expected Output
- 50 SATS: W-L-W-W-L-L-L-W-L repeating
- 300+ SATS: L-W-L-W-L-W-L-L-W repeating

## Statistics

### 50 SATS Games (per 9-game cycle)
- Player wins: 4 games × 30 SATS profit = 120 SATS
- Player loses: 5 games × 50 SATS = 250 SATS
- **Net house edge**: 130 SATS per cycle

### 300+ SATS Games (per 9-game cycle, example with 300 SATS)
- Player wins: 3 games × 200 SATS profit = 600 SATS
- Player loses: 6 games × 300 SATS = 1800 SATS
- **Net house edge**: 1200 SATS per cycle

## Important Notes

1. **Pattern Independence**: Each bet amount has its own independent pattern tracking
2. **Player Tracking**: Patterns are tracked per Lightning address
3. **Pattern Persistence**: Patterns continue across sessions (in memory)
4. **Server Restart**: Patterns reset if server restarts (consider adding persistence)
5. **Fair Play Appearance**: Bot behavior is designed to appear natural while following patterns

## Future Enhancements

1. **Persistence**: Save pattern state to database
2. **Analytics**: Track pattern performance over time
3. **Adjustability**: Admin controls to modify patterns
4. **Reporting**: Generate reports on pattern effectiveness
5. **Anti-Detection**: More sophisticated bot behavior randomization
