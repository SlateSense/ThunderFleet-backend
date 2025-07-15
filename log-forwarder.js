const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration for log forwarding
const LOG_FORWARDING_CONFIG = {
  enabled: process.env.LOG_FORWARDING_ENABLED === 'true' || false,
  localEndpoint: process.env.LOCAL_LOG_ENDPOINT || 'http://your-local-ip:3001/logs',
  fallbackToFile: true,
  maxRetries: 3,
  retryDelay: 1000
};

class LogForwarder {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.localLogsDir = path.join(__dirname, 'forwarded-logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.localLogsDir)) {
      fs.mkdirSync(this.localLogsDir, { recursive: true });
    }
  }

  async forwardLog(logType, data) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      logType,
      data,
      source: 'render-server'
    };

    // Add to queue
    this.queue.push(logEntry);

    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const logEntry = this.queue.shift();
      
      try {
        // Try to send to local endpoint first
        if (LOG_FORWARDING_CONFIG.enabled) {
          await this.sendToLocalEndpoint(logEntry);
        }
      } catch (error) {
        console.log('Failed to send to local endpoint, saving to file:', error.message);
        
        // Fallback to saving to file
        if (LOG_FORWARDING_CONFIG.fallbackToFile) {
          await this.saveToFile(logEntry);
        }
      }
    }

    this.processing = false;
  }

  async sendToLocalEndpoint(logEntry) {
    const response = await axios.post(LOG_FORWARDING_CONFIG.localEndpoint, logEntry, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'sea-battle-render'
      }
    });

    console.log('📤 Log forwarded to local PC:', logEntry.logType);
    return response.data;
  }

  async saveToFile(logEntry) {
    const today = new Date().toISOString().split('T')[0];
    const filename = `${logEntry.logType}-${today}.json`;
    const filepath = path.join(this.localLogsDir, filename);

    // Append to file
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(filepath, logLine);

    console.log('💾 Log saved to file:', filename);
  }

  // Log player session
  async logPlayerSession(lightningAddress, sessionData) {
    await this.forwardLog('player-session', {
      lightningAddress,
      sessionData,
      event: sessionData.event || 'session_update'
    });
  }

  // Log payment
  async logPayment(playerId, paymentData) {
    await this.forwardLog('payment', {
      playerId,
      paymentData,
      event: paymentData.event || 'payment_event'
    });
  }

  // Log game event
  async logGameEvent(gameId, eventData) {
    await this.forwardLog('game-event', {
      gameId,
      eventData,
      event: eventData.event || 'game_event'
    });
  }

  // Log error
  async logError(errorData) {
    await this.forwardLog('error', {
      errorData,
      event: 'error'
    });
  }
}

// Create singleton instance
const logForwarder = new LogForwarder();

module.exports = logForwarder;
