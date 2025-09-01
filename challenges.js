const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Challenge types and configurations
const CHALLENGE_TYPES = {
  ACCURACY: 'accuracy',
  SPEED: 'speed', 
  STREAK: 'streak',
  VOLUME: 'volume',
  PRECISION: 'precision',
  ENDURANCE: 'endurance',
  BET_AMOUNT: 'bet_amount',
  STREAK_BET: 'streak_bet',
  MULTI_BET: 'multi_bet'
};

// One-time achievements with rewards in sats
const ACHIEVEMENTS = [
  // Betting Achievements
  {
    id: 'bet_1000',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'High Roller',
    description: 'Place a 1000 sats bet',
    target: 1000,
    reward: 50,
    difficulty: 'easy'
  },
  {
    id: 'bet_5000',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'Big Spender',
    description: 'Place a 5000 sats bet',
    target: 5000,
    reward: 100,
    difficulty: 'medium'
  },
  {
    id: 'bet_10000',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'Whale Status',
    description: 'Place a 10000 sats bet',
    target: 10000,
    reward: 200,
    difficulty: 'hard'
  },
  {
    id: 'games_100',
    type: CHALLENGE_TYPES.VOLUME,
    title: 'Veteran Captain',
    description: 'Play 100 total games',
    target: 100,
    reward: 150,
    difficulty: 'medium'
  },
  {
    id: 'wins_50',
    type: CHALLENGE_TYPES.STREAK,
    title: 'Admiral',
    description: 'Win 50 total games',
    target: 50,
    reward: 200,
    difficulty: 'hard'
  }
];

// Daily challenge templates with rewards in sats
const DAILY_CHALLENGES = [
  // Accuracy Challenges
  {
    id: 'accuracy_80',
    type: CHALLENGE_TYPES.ACCURACY,
    title: 'Sharpshooter',
    description: 'Achieve 80% accuracy in a single game',
    target: 80,
    reward: 25,
    difficulty: 'medium'
  },
  {
    id: 'accuracy_90',
    type: CHALLENGE_TYPES.ACCURACY,
    title: 'Sniper Elite',
    description: 'Achieve 90% accuracy in a single game',
    target: 90,
    reward: 50,
    difficulty: 'hard'
  },
  {
    id: 'daily_accuracy_70',
    type: CHALLENGE_TYPES.ACCURACY,
    title: 'Good Aim',
    description: 'Achieve 70% accuracy in a game today',
    target: 70,
    reward: 20,
    difficulty: 'medium'
  },
  
  
  // Streak Challenges
  {
    id: 'streak_3',
    type: CHALLENGE_TYPES.STREAK,
    title: 'Triple Threat',
    description: 'Win 3 games in a row',
    target: 3,
    reward: 175,
    difficulty: 'medium'
  },
  {
    id: 'streak_5',
    type: CHALLENGE_TYPES.STREAK,
    title: 'Unstoppable',
    description: 'Win 5 games in a row',
    target: 5,
    reward: 300,
    difficulty: 'hard'
  },
  {
    id: 'daily_streak_2',
    type: CHALLENGE_TYPES.STREAK,
    title: 'Winning Streak',
    description: 'Win 2 games in a row today',
    target: 2,
    reward: 50,
    difficulty: 'medium'
  },
  
  // Volume Challenges
  {
    id: 'volume_5',
    type: CHALLENGE_TYPES.VOLUME,
    title: 'Battle Veteran',
    description: 'Play 5 games today',
    target: 5,
    reward: 50,
    difficulty: 'easy'
  },
  {
    id: 'volume_10',
    type: CHALLENGE_TYPES.VOLUME,
    title: 'War Machine',
    description: 'Play 10 games today',
    target: 10,
    reward: 75,
    difficulty: 'medium'
  },
  
  // Precision Challenges
  {
    id: 'precision_first3',
    type: CHALLENGE_TYPES.PRECISION,
    title: 'First Strike',
    description: 'Hit enemy ships with your first 3 shots',
    target: 3,
    reward: 45,
    difficulty: 'medium'
  },
  {
    id: 'precision_first5',
    type: CHALLENGE_TYPES.PRECISION,
    title: 'Perfect Aim',
    description: 'Hit enemy ships with your first 5 shots',
    target: 5,
    reward: 90,
    difficulty: 'hard'
  },
  
  // Simple Daily Challenges
  {
    id: 'daily_win_1',
    type: CHALLENGE_TYPES.VOLUME,
    title: 'First Victory',
    description: 'Win 1 game today',
    target: 1,
    reward: 10,
    difficulty: 'easy'
  },
  {
    id: 'daily_games_3',
    type: CHALLENGE_TYPES.VOLUME,
    title: 'Active Player',
    description: 'Play 3 games today',
    target: 3,
    reward: 30,
    difficulty: 'easy'
  },
  
  // Betting Challenges
  {
    id: 'bet_300_daily',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'Small Spender',
    description: 'Play a 300 sats bet today',
    target: 300,
    reward: 50,
    difficulty: 'easy'
  },
  {
    id: 'bet_1000_daily',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'High Roller Daily',
    description: 'Play a 1000 sats bet today',
    target: 1000,
    reward: 100,
    difficulty: 'medium'
  },
  {
    id: 'bet_5000_daily',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'Big Player Daily',
    description: 'Play a 5000 sats bet today',
    target: 5000,
    reward: 500,
    difficulty: 'hard'
  },
  {
    id: 'bet_10000_daily',
    type: CHALLENGE_TYPES.BET_AMOUNT,
    title: 'Whale Daily',
    description: 'Play a 10000 sats bet today',
    target: 10000,
    reward: 1000,
    difficulty: 'hard'
  },
  {
    id: 'multi_bet_50',
    type: CHALLENGE_TYPES.MULTI_BET,
    title: 'Consistent Player',
    description: 'Play 5 bets of 50 sats today',
    target: 5,
    betAmount: 50,
    reward: 50,
    difficulty: 'easy'
  },
  
  // Streak Betting Challenges
  {
    id: 'streak_bet_300',
    type: CHALLENGE_TYPES.STREAK_BET,
    title: 'Small Streak Master',
    description: 'Win 3 games in a row with 300 sats bet',
    target: 3,
    betAmount: 300,
    reward: 200,
    difficulty: 'medium'
  },
  {
    id: 'streak_bet_500',
    type: CHALLENGE_TYPES.STREAK_BET,
    title: 'Medium Streak Master',
    description: 'Win 3 games in a row with 500 sats bet',
    target: 3,
    betAmount: 500,
    reward: 450,
    difficulty: 'hard'
  },
  {
    id: 'streak_bet_1000',
    type: CHALLENGE_TYPES.STREAK_BET,
    title: 'High Roller Streak',
    description: 'Win 3 games in a row with 1000 sats bet',
    target: 3,
    betAmount: 1000,
    reward: 1000,
    difficulty: 'hard'
  }
];

class ChallengeManager {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.challengesFile = path.join(this.dataDir, 'daily-challenges.json');
    this.playerProgressFile = path.join(this.dataDir, 'player-challenge-progress.json');
    this.achievementsFile = path.join(this.dataDir, 'player-achievements.json');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.initializeData();
  }
  
  initializeData() {
    // Initialize daily challenges file
    if (!fs.existsSync(this.challengesFile)) {
      const initialData = {
        lastReset: new Date().toISOString().split('T')[0],
        activeChallenges: this.generateDailyChallenges()
      };
      fs.writeFileSync(this.challengesFile, JSON.stringify(initialData, null, 2));
    }
    
    // Initialize player progress file
    if (!fs.existsSync(this.playerProgressFile)) {
      fs.writeFileSync(this.playerProgressFile, JSON.stringify({}, null, 2));
    }
    
    // Initialize achievements file
    if (!fs.existsSync(this.achievementsFile)) {
      fs.writeFileSync(this.achievementsFile, JSON.stringify({}, null, 2));
    }
  }
  
  generateDailyChallenges() {
    // Select 3-4 random challenges for the day with different difficulties
    const easyChallenge = DAILY_CHALLENGES.filter(c => c.difficulty === 'easy')[Math.floor(Math.random() * DAILY_CHALLENGES.filter(c => c.difficulty === 'easy').length)];
    const mediumChallenge = DAILY_CHALLENGES.filter(c => c.difficulty === 'medium')[Math.floor(Math.random() * DAILY_CHALLENGES.filter(c => c.difficulty === 'medium').length)];
    const hardChallenge = DAILY_CHALLENGES.filter(c => c.difficulty === 'hard')[Math.floor(Math.random() * DAILY_CHALLENGES.filter(c => c.difficulty === 'hard').length)];
    
    return [easyChallenge, mediumChallenge, hardChallenge].map(challenge => ({
      ...challenge,
      id: `${challenge.id}_${Date.now()}`,
      date: new Date().toISOString().split('T')[0]
    }));
  }
  
  getTodaysChallenges() {
    try {
      const data = JSON.parse(fs.readFileSync(this.challengesFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      
      // Check if we need to reset challenges for a new day
      if (data.lastReset !== today) {
        data.lastReset = today;
        data.activeChallenges = this.generateDailyChallenges();
        fs.writeFileSync(this.challengesFile, JSON.stringify(data, null, 2));
      }
      
      return data.activeChallenges;
    } catch (error) {
      console.error('Error getting today\'s challenges:', error);
      return [];
    }
  }
  
  getPlayerProgress(lightningAddress) {
    try {
      const data = JSON.parse(fs.readFileSync(this.playerProgressFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      
      if (!data[lightningAddress]) {
        data[lightningAddress] = {};
      }
      
      if (!data[lightningAddress][today]) {
        data[lightningAddress][today] = {
          challenges: {},
          stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            currentStreak: 0,
            totalPlayTime: 0,
            bestAccuracy: 0,
            fastestWin: null
          }
        };
      }
      
      return data[lightningAddress][today];
    } catch (error) {
      console.error('Error getting player progress:', error);
      return {
        challenges: {},
        stats: {
          gamesPlayed: 0,
          gamesWon: 0,
          currentStreak: 0,
          totalPlayTime: 0,
          bestAccuracy: 0,
          fastestWin: null
        }
      };
    }
  }
  
  getPlayerAchievements(lightningAddress) {
    try {
      const data = JSON.parse(fs.readFileSync(this.achievementsFile, 'utf8'));
      return data[lightningAddress] || {};
    } catch (error) {
      console.error('Error reading achievements:', error);
      return {};
    }
  }

  updatePlayerProgress(lightningAddress, gameData) {
    try {
      const data = JSON.parse(fs.readFileSync(this.playerProgressFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      
      if (!data[lightningAddress]) {
        data[lightningAddress] = {
          totalStats: {
            gamesPlayed: 0,
            gamesWon: 0,
            totalPlayTime: 0,
            bestAccuracy: 0,
            fastestWin: null
          }
        };
      }
      
      if (!data[lightningAddress][today]) {
        data[lightningAddress][today] = {
          challenges: {},
          stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            currentStreak: 0,
            totalPlayTime: 0,
            bestAccuracy: 0,
            fastestWin: null
          }
        };
      }
      
      const playerData = data[lightningAddress][today];
      const stats = playerData.stats;
      const totalStats = data[lightningAddress].totalStats;
      
      // Update basic stats
      stats.gamesPlayed++;
      totalStats.gamesPlayed++;
      
      if (gameData.result === 'won') {
        stats.gamesWon++;
        totalStats.gamesWon++;
        stats.currentStreak++;
      } else {
        stats.currentStreak = 0;
      }
      
      stats.totalPlayTime += gameData.duration || 0;
      totalStats.totalPlayTime += gameData.duration || 0;
      
      stats.bestAccuracy = Math.max(stats.bestAccuracy, gameData.accuracy || 0);
      totalStats.bestAccuracy = Math.max(totalStats.bestAccuracy, gameData.accuracy || 0);
      
      if (gameData.result === 'won' && gameData.duration) {
        if (!stats.fastestWin || gameData.duration < stats.fastestWin) {
          stats.fastestWin = gameData.duration;
        }
        if (!totalStats.fastestWin || gameData.duration < totalStats.fastestWin) {
          totalStats.fastestWin = gameData.duration;
        }
      }
      
      // Check and update achievements
      const newAchievements = this.checkAchievements(lightningAddress, gameData, totalStats);
      
      // Check and update challenge progress
      const todaysChallenges = this.getTodaysChallenges();
      const completedChallenges = [];
      
      for (const challenge of todaysChallenges) {
        if (playerData.challenges[challenge.id]?.completed) {
          continue; // Already completed
        }
        
        let progress = playerData.challenges[challenge.id]?.progress || 0;
        let completed = false;
        
        switch (challenge.type) {
          case CHALLENGE_TYPES.ACCURACY:
            if (gameData.accuracy >= challenge.target) {
              progress = challenge.target;
              completed = true;
            }
            break;
            
            
          case CHALLENGE_TYPES.STREAK:
            progress = stats.currentStreak;
            if (stats.currentStreak >= challenge.target) {
              completed = true;
            }
            break;
            
          case CHALLENGE_TYPES.VOLUME:
            progress = stats.gamesPlayed;
            if (stats.gamesPlayed >= challenge.target) {
              completed = true;
            }
            break;
            
          case CHALLENGE_TYPES.PRECISION:
            // Check if first N shots were all hits
            if (gameData.shotsFired >= challenge.target && gameData.hits >= challenge.target) {
              // This is a simplified check - in a real implementation, 
              // we'd track the order of hits vs misses
              progress = Math.min(gameData.hits, challenge.target);
              if (gameData.hits >= challenge.target) {
                completed = true;
              }
            }
            break;
            
          case CHALLENGE_TYPES.BET_AMOUNT:
            // Check if player has made a bet of the target amount
            if (gameData.betAmount >= challenge.target) {
              progress = challenge.target;
              completed = true;
            }
            break;
            
          case CHALLENGE_TYPES.MULTI_BET:
            // Track multiple bets of specific amount
            if (!playerData.challenges[challenge.id]) {
              playerData.challenges[challenge.id] = { progress: 0, betCount: 0 };
            }
            if (gameData.betAmount >= challenge.betAmount) {
              playerData.challenges[challenge.id].betCount = (playerData.challenges[challenge.id].betCount || 0) + 1;
              progress = playerData.challenges[challenge.id].betCount;
              if (progress >= challenge.target) {
                completed = true;
              }
            } else {
              progress = playerData.challenges[challenge.id].betCount || 0;
            }
            break;
            
          case CHALLENGE_TYPES.STREAK_BET:
            // Track winning streaks with specific bet amounts
            if (!playerData.challenges[challenge.id]) {
              playerData.challenges[challenge.id] = { progress: 0, currentStreakBet: 0 };
            }
            
            if (gameData.result === 'won' && gameData.betAmount >= challenge.betAmount) {
              playerData.challenges[challenge.id].currentStreakBet = (playerData.challenges[challenge.id].currentStreakBet || 0) + 1;
              progress = playerData.challenges[challenge.id].currentStreakBet;
              if (progress >= challenge.target) {
                completed = true;
              }
            } else if (gameData.betAmount >= challenge.betAmount) {
              // Reset streak if they bet the right amount but didn't win
              playerData.challenges[challenge.id].currentStreakBet = 0;
              progress = 0;
            } else {
              progress = playerData.challenges[challenge.id].currentStreakBet || 0;
            }
            break;
        }
        
        playerData.challenges[challenge.id] = {
          progress,
          completed,
          completedAt: completed ? new Date().toISOString() : null
        };
        
        if (completed && !playerData.challenges[challenge.id].rewardClaimed) {
          completedChallenges.push(challenge);
        }
      }
      
      // Save updated data
      fs.writeFileSync(this.playerProgressFile, JSON.stringify(data, null, 2));
      
      return {
        completedChallenges,
        newAchievements,
        playerStats: stats
      };
    } catch (error) {
      console.error('Error updating player progress:', error);
      return {
        completedChallenges: [],
        newAchievements: [],
        playerStats: {}
      };
    }
  }

  checkAchievements(lightningAddress, gameData, totalStats) {
    try {
      const achievementsData = JSON.parse(fs.readFileSync(this.achievementsFile, 'utf8'));
      
      if (!achievementsData[lightningAddress]) {
        achievementsData[lightningAddress] = {};
      }
      
      const playerAchievements = achievementsData[lightningAddress];
      const newAchievements = [];
      
      for (const achievement of ACHIEVEMENTS) {
        if (playerAchievements[achievement.id]) {
          continue; // Already unlocked
        }
        
        let unlocked = false;
        
        switch (achievement.type) {
          case CHALLENGE_TYPES.BET_AMOUNT:
            if (gameData.betAmount >= achievement.target) {
              unlocked = true;
            }
            break;
            
          case CHALLENGE_TYPES.VOLUME:
            if (totalStats.gamesPlayed >= achievement.target) {
              unlocked = true;
            }
            break;
            
          case CHALLENGE_TYPES.STREAK:
            if (totalStats.gamesWon >= achievement.target) {
              unlocked = true;
            }
            break;
        }
        
        if (unlocked) {
          playerAchievements[achievement.id] = {
            unlockedAt: new Date().toISOString(),
            claimed: false
          };
          newAchievements.push(achievement);
        }
      }
      
      fs.writeFileSync(this.achievementsFile, JSON.stringify(achievementsData, null, 2));
      return newAchievements;
    } catch (error) {
      console.error('Error checking achievements:', error);
      return [];
    }
  }
  
  async claimReward(lightningAddress, challengeId) {
    try {
      const data = JSON.parse(fs.readFileSync(this.playerProgressFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      
      if (!data[lightningAddress] || !data[lightningAddress][today]) {
        return { success: false, error: 'Player data not found' };
      }
      
      const playerData = data[lightningAddress][today];
      const challengeProgress = playerData.challenges[challengeId];
      
      if (!challengeProgress || !challengeProgress.completed || challengeProgress.rewardClaimed) {
        return { success: false, error: 'Challenge not completed or reward already claimed' };
      }
      
      // Find the challenge details
      const todaysChallenges = this.getTodaysChallenges();
      const challenge = todaysChallenges.find(c => c.id === challengeId);
      
      if (!challenge) {
        return { success: false, error: 'Challenge not found' };
      }
      
      // Send reward via Speed Wallet
      const paymentResult = await this.sendReward(lightningAddress, challenge.reward, challenge.title);
      
      if (paymentResult.success) {
        // Mark reward as claimed
        playerData.challenges[challengeId].rewardClaimed = true;
        playerData.challenges[challengeId].rewardClaimedAt = new Date().toISOString();
        
        // Save updated data
        fs.writeFileSync(this.playerProgressFile, JSON.stringify(data, null, 2));
        
        return {
          success: true,
          reward: challenge.reward,
          transactionId: paymentResult.transactionId
        };
      } else {
        return { success: false, error: paymentResult.error };
      }
      
    } catch (error) {
      console.error('Error claiming reward:', error);
      return { success: false, error: 'Internal server error' };
    }
  }
  
  async sendReward(lightningAddress, amount, description) {
    try {
      const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
      const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');
      
      // Construct full lightning address
      const fullLightningAddress = lightningAddress.includes('@') ? 
        lightningAddress : `${lightningAddress}@tryspeed.app`;
      
      const response = await axios.post('https://api.tryspeed.com/send', {
        lightning_address: fullLightningAddress,
        amount_sats: amount,
        description: `Daily Challenge Reward: ${description}`
      }, {
        headers: {
          'Authorization': `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.success) {
        console.log(`✅ Sent ${amount} sats to ${fullLightningAddress} for challenge: ${description}`);
        return {
          success: true,
          transactionId: response.data.payment_id || response.data.id
        };
      } else {
        console.error('❌ Failed to send reward:', response.data);
        return {
          success: false,
          error: response.data?.error || 'Payment failed'
        };
      }
      
    } catch (error) {
      console.error('❌ Error sending reward:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  getLeaderboard(challengeType = null, limit = 10) {
    try {
      const data = JSON.parse(fs.readFileSync(this.playerProgressFile, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      const leaderboard = [];
      
      for (const [lightningAddress, playerData] of Object.entries(data)) {
        if (playerData[today]) {
          const stats = playerData[today].stats;
          leaderboard.push({
            lightningAddress,
            gamesPlayed: stats.gamesPlayed,
            gamesWon: stats.gamesWon,
            winRate: stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed * 100).toFixed(1) : 0,
            currentStreak: stats.currentStreak,
            bestAccuracy: stats.bestAccuracy,
            fastestWin: stats.fastestWin,
            totalPlayTime: stats.totalPlayTime
          });
        }
      }
      
      // Sort by win rate, then by games won
      leaderboard.sort((a, b) => {
        if (parseFloat(b.winRate) !== parseFloat(a.winRate)) {
          return parseFloat(b.winRate) - parseFloat(a.winRate);
        }
        return b.gamesWon - a.gamesWon;
      });
      
      return leaderboard.slice(0, limit);
      
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }
  
  getAchievementsWithProgress(lightningAddress) {
    try {
      const playerAchievements = this.getPlayerAchievements(lightningAddress);
      console.log('Player achievements for', lightningAddress, ':', playerAchievements);
      console.log('All achievements:', ACHIEVEMENTS);
      
      const achievementsWithProgress = ACHIEVEMENTS.map(achievement => ({
        ...achievement,
        unlocked: !!playerAchievements[achievement.id],
        claimed: playerAchievements[achievement.id]?.claimed || false,
        unlockedAt: playerAchievements[achievement.id]?.unlockedAt || null
      }));
      
      console.log('Achievements with progress:', achievementsWithProgress);
      return achievementsWithProgress;
    } catch (error) {
      console.error('Error getting achievements with progress:', error);
      return ACHIEVEMENTS.map(achievement => ({
        ...achievement,
        unlocked: false,
        claimed: false,
        unlockedAt: null
      }));
    }
  }

  claimAchievement(lightningAddress, achievementId) {
    try {
      const achievementsData = JSON.parse(fs.readFileSync(this.achievementsFile, 'utf8'));
      
      if (!achievementsData[lightningAddress] || !achievementsData[lightningAddress][achievementId]) {
        return { success: false, error: 'Achievement not found or not unlocked' };
      }
      
      if (achievementsData[lightningAddress][achievementId].claimed) {
        return { success: false, error: 'Achievement already claimed' };
      }
      
      const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
      if (!achievement) {
        return { success: false, error: 'Achievement not found' };
      }
      
      achievementsData[lightningAddress][achievementId].claimed = true;
      fs.writeFileSync(this.achievementsFile, JSON.stringify(achievementsData, null, 2));
      
      return {
        success: true,
        message: `Achievement '${achievement.title}' claimed! Earned ${achievement.reward} sats.`,
        reward: achievement.reward
      };
    } catch (error) {
      console.error('Error claiming achievement:', error);
      return { success: false, error: 'Failed to claim achievement' };
    }
  }
}

module.exports = ChallengeManager;
