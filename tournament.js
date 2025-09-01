const fs = require('fs');
const path = require('path');

class TournamentManager {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.tournamentsFile = path.join(this.dataDir, 'tournaments.json');
    this.communityGoalsFile = path.join(this.dataDir, 'community-goals.json');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.initializeData();
  }

  initializeData() {
    // Initialize tournaments file
    if (!fs.existsSync(this.tournamentsFile)) {
      const initialData = {
        activeTournaments: {},
        completedTournaments: [],
        registrations: {}
      };
      fs.writeFileSync(this.tournamentsFile, JSON.stringify(initialData, null, 2));
    }

    // Initialize community goals file
    if (!fs.existsSync(this.communityGoalsFile)) {
      const initialGoals = {
        currentGoals: [
          {
            id: 'ships_sunk_community',
            title: 'Fleet Destroyer Challenge',
            description: 'Community Event: Sink 1,000 ships together! Everyone who sinks at least one ship gets 50 sats when completed.',
            target: 1000,
            current: 0,
            reward: 50, // sats per participant
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days to complete
            type: 'community_event',
            participants: [],
            status: 'active'
          }
        ],
        completedGoals: []
      };
      fs.writeFileSync(this.communityGoalsFile, JSON.stringify(initialGoals, null, 2));
    }
  }

  // Tournament Management
  createTournament(entryFee = 300) {
    const tournamentId = `tournament_${Date.now()}`;
    const startTime = new Date();
    startTime.setMinutes(0, 0, 0); // Start at top of hour
    startTime.setHours(startTime.getHours() + 1); // Next hour
    
    const tournament = {
      id: tournamentId,
      entryFee: entryFee,
      maxPlayers: 8,
      prizePool: 0,
      startTime: startTime.toISOString(),
      registrationDeadline: new Date(startTime.getTime() - 10 * 60 * 1000).toISOString(), // 10 min before
      status: 'registration', // registration, playing, completed
      players: [],
      bracket: {},
      matches: [],
      winner: null,
      createdAt: new Date().toISOString()
    };

    const data = this.getTournamentData();
    data.activeTournaments[tournamentId] = tournament;
    this.saveTournamentData(data);

    return tournament;
  }

  registerPlayer(tournamentId, lightningAddress, playerName) {
    const data = this.getTournamentData();
    const tournament = data.activeTournaments[tournamentId];
    
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    if (tournament.status !== 'registration') {
      return { success: false, error: 'Registration closed' };
    }

    if (tournament.players.length >= tournament.maxPlayers) {
      return { success: false, error: 'Tournament full' };
    }

    if (tournament.players.some(p => p.lightningAddress === lightningAddress)) {
      return { success: false, error: 'Already registered' };
    }

    const player = {
      lightningAddress,
      playerName: playerName || lightningAddress.split('@')[0],
      registeredAt: new Date().toISOString(),
      eliminated: false
    };

    tournament.players.push(player);
    tournament.prizePool += tournament.entryFee;

    this.saveTournamentData(data);

    return { 
      success: true, 
      tournament: tournament,
      playersRegistered: tournament.players.length
    };
  }

  startTournament(tournamentId) {
    const data = this.getTournamentData();
    const tournament = data.activeTournaments[tournamentId];
    
    if (!tournament) {
      return { success: false, error: 'Tournament not found' };
    }

    if (tournament.players.length < 4) {
      return { success: false, error: 'Need at least 4 players' };
    }

    tournament.status = 'playing';
    tournament.bracket = this.generateBracket(tournament.players);
    tournament.matches = this.generateFirstRoundMatches(tournament.bracket);

    this.saveTournamentData(data);

    return { success: true, tournament: tournament };
  }

  generateBracket(players) {
    // Shuffle players for random bracket
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    const bracket = {
      round1: [],
      semifinals: [],
      finals: [],
      winner: null
    };

    // Create first round pairs
    for (let i = 0; i < shuffled.length; i += 2) {
      if (shuffled[i + 1]) {
        bracket.round1.push({
          player1: shuffled[i],
          player2: shuffled[i + 1],
          winner: null,
          gameId: null
        });
      }
    }

    return bracket;
  }

  generateFirstRoundMatches(bracket) {
    return bracket.round1.map((match, index) => ({
      id: `match_${index}_round1`,
      tournament: true,
      player1: match.player1.lightningAddress,
      player2: match.player2.lightningAddress,
      round: 'round1',
      status: 'pending'
    }));
  }

  // Community Goals Management
  updateCommunityGoals(eventType, lightningAddress, data = {}) {
    const goalsData = this.getCommunityGoalsData();
    let updated = false;

    goalsData.currentGoals.forEach(goal => {
      if (this.shouldUpdateGoal(goal, eventType, data)) {
        goal.current += 1;
        
        // Add participant if not already included
        if (!goal.participants.includes(lightningAddress)) {
          goal.participants.push(lightningAddress);
        }

        // Check if goal is completed
        if (goal.current >= goal.target && goal.status !== 'completed') {
          goal.status = 'completed';
          goal.completedAt = new Date().toISOString();
          this.distributeGoalRewards(goal);
        }

        updated = true;
      }
    });

    if (updated) {
      this.saveCommunityGoalsData(goalsData);
    }

    return goalsData.currentGoals;
  }

  shouldUpdateGoal(goal, eventType, data) {
    const now = new Date();
    const goalEnd = new Date(goal.endDate);
    
    if (now > goalEnd || goal.status === 'completed') return false;

    switch (goal.id) {
      case 'ships_sunk_community':
        return eventType === 'ship_sunk';
      case 'ships_sunk_weekly':
        return eventType === 'ship_sunk';
      case 'games_played_daily':
        return eventType === 'game_completed';
      default:
        return false;
    }
  }

  distributeGoalRewards(goal) {
    console.log(`🎉 Community goal "${goal.title}" completed!`);
    console.log(`💰 Distributing ${goal.reward} sats to ${goal.participants.length} participants`);
    
    // TODO: Integrate with payment system to send rewards
    goal.participants.forEach(participant => {
      // this.sendReward(participant, goal.reward, `Community Goal: ${goal.title}`);
    });
  }

  // Prize Distribution
  distributeTournamentPrizes(tournamentId) {
    const data = this.getTournamentData();
    const tournament = data.activeTournaments[tournamentId];
    
    if (!tournament || tournament.status !== 'completed') {
      return { success: false, error: 'Tournament not completed' };
    }

    const prizePool = tournament.prizePool;
    const winnerPrize = Math.floor(prizePool * 0.6);
    const runnerUpPrize = Math.floor(prizePool * 0.25);
    const semifinalPrize = Math.floor(prizePool * 0.075);

    const distribution = {
      winner: { player: tournament.winner, amount: winnerPrize },
      runnerUp: { player: tournament.runnerUp, amount: runnerUpPrize },
      semifinalists: tournament.semifinalists?.map(player => ({
        player: player,
        amount: semifinalPrize
      })) || []
    };

    // TODO: Integrate with payment system
    console.log('Prize distribution:', distribution);

    return { success: true, distribution };
  }

  // Data Management
  getTournamentData() {
    try {
      return JSON.parse(fs.readFileSync(this.tournamentsFile, 'utf8'));
    } catch (error) {
      console.error('Error reading tournament data:', error);
      return { activeTournaments: {}, completedTournaments: [], registrations: {} };
    }
  }

  saveTournamentData(data) {
    fs.writeFileSync(this.tournamentsFile, JSON.stringify(data, null, 2));
  }

  getCommunityGoalsData() {
    try {
      return JSON.parse(fs.readFileSync(this.communityGoalsFile, 'utf8'));
    } catch (error) {
      console.error('Error reading community goals data:', error);
      return { currentGoals: [], completedGoals: [] };
    }
  }

  saveCommunityGoalsData(data) {
    fs.writeFileSync(this.communityGoalsFile, JSON.stringify(data, null, 2));
  }

  // Public API Methods
  getActiveTournaments() {
    const data = this.getTournamentData();
    return Object.values(data.activeTournaments).filter(t => t.status === 'registration');
  }

  getCurrentCommunityGoals() {
    const goalsData = this.getCommunityGoalsData();
    return goalsData.currentGoals.filter(goal => {
      const now = new Date();
      const goalEnd = new Date(goal.endDate);
      return now <= goalEnd;
    });
  }

  getTournamentById(tournamentId) {
    const data = this.getTournamentData();
    return data.activeTournaments[tournamentId];
  }
}

module.exports = TournamentManager;
