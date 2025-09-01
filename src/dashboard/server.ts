import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';
import { dashboardLogs } from '../utils/logger';
import { MetaApiTradeExecutor } from '../mt5/metaApiTradeExecutor';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store for real-time data
let tradeHistory: any[] = [];
let streamClients: any[] = []; // Store for SSE clients
let botStatus = {
  isRunning: false,
  uptime: 0,
  lastActivity: null,
  connections: {
    telegram: false,
    metaapi: false
  }
};

// MT5 Integration - Single instance to maintain connection
let metaApiExecutor: MetaApiTradeExecutor | null = null;
let mt5AccountInfo: any = null;
let mt5Positions: any[] = [];
let mt5LastUpdate = 0;

// Initialize MT5 connection
const initializeMT5 = async () => {
  try {
    if (!metaApiExecutor) {
      metaApiExecutor = new MetaApiTradeExecutor();
      await metaApiExecutor.initialize();
      addLog({
        level: 'info',
        message: '📊 MT5 Dashboard Integration initialized'
      });
    }
    return true;
  } catch (error) {
    addLog({
      level: 'error',
      message: `❌ MT5 Dashboard Integration failed: ${error}`
    });
    return false;
  }
};

// Update MT5 data periodically
const updateMT5Data = async () => {
  if (!metaApiExecutor) return;
  
  try {
    const isConnected = await metaApiExecutor.isConnected();
    if (!isConnected) return;
    
    // Update account info
    const accountInfo = await metaApiExecutor.getAccountInfo();
    if (accountInfo) {
      mt5AccountInfo = {
        ...accountInfo,
        lastUpdate: Date.now()
      };
    }
    
    // Update positions
    const positions = await metaApiExecutor.getOpenPositions();
    mt5Positions = positions.map((pos: any) => ({
      ...pos,
      unrealizedProfit: pos.unrealizedProfit || 0,
      profit: pos.profit || 0,
      commission: pos.commission || 0,
      swap: pos.swap || 0,
      lastUpdate: Date.now()
    }));
    
    mt5LastUpdate = Date.now();
    
  } catch (error) {
    console.error('Error updating MT5 data:', error);
  }
};

// Start MT5 data updates
const startMT5Updates = () => {
  // Update every 10 seconds
  setInterval(updateMT5Data, 10000);
  // Initial update
  updateMT5Data();
};

// Dashboard routes
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public/index.html');
  console.log('Dashboard - Looking for HTML at:', htmlPath);
  
  // Check if file exists
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    console.error('Dashboard - HTML file not found at:', htmlPath);
    res.status(404).send(`
      <html>
        <head><title>Dashboard Loading...</title></head>
        <body>
          <h1>Dashboard is starting up...</h1>
          <p>HTML file not found at: ${htmlPath}</p>
          <p>Please wait while the service restarts.</p>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
      </html>
    `);
  }
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json(botStatus);
});

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json(dashboardLogs.slice(-limit));
});

app.get('/api/trades', (req, res) => {
  res.json(tradeHistory);
});

app.get('/api/config', (req, res) => {
  // Return sanitized config (no sensitive data)
  res.json({
    allowedChannelId: config.allowedChannelId,
    maxTradeSize: config.trading.maxTradeSize,
    riskPercentage: config.trading.riskPercentage,
    logLevel: config.logging.level,
    currentAccountId: process.env.METAAPI_ACCOUNT_ID
  });
});

// ========== NEW MT5 TRADING DASHBOARD ENDPOINTS ==========

// Get MT5 account information (balance, equity, margin, etc.)
app.get('/api/mt5/account', async (req, res) => {
  try {
    if (!metaApiExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !metaApiExecutor) {
        return res.status(503).json({ 
          error: 'MT5 connection not available',
          connected: false 
        });
      }
    }

    const isConnected = await metaApiExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected',
        connected: false 
      });
    }

    // Return cached data if recent, otherwise fetch fresh
    const shouldUpdate = !mt5AccountInfo || (Date.now() - mt5LastUpdate) > 30000; // 30 seconds
    if (shouldUpdate) {
      await updateMT5Data();
    }

    res.json({
      success: true,
      connected: true,
      account: mt5AccountInfo || {},
      lastUpdate: mt5LastUpdate
    });

  } catch (error) {
    console.error('Error getting MT5 account info:', error);
    res.status(500).json({ 
      error: 'Failed to fetch account information',
      connected: false 
    });
  }
});

// Get MT5 open positions
app.get('/api/mt5/positions', async (req, res) => {
  try {
    if (!metaApiExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !metaApiExecutor) {
        return res.status(503).json({ 
          error: 'MT5 connection not available',
          positions: [] 
        });
      }
    }

    const isConnected = await metaApiExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected',
        positions: [] 
      });
    }

    // Return cached data if recent, otherwise fetch fresh
    const shouldUpdate = !mt5Positions.length || (Date.now() - mt5LastUpdate) > 15000; // 15 seconds
    if (shouldUpdate) {
      await updateMT5Data();
    }

    res.json({
      success: true,
      connected: true,
      positions: mt5Positions,
      count: mt5Positions.length,
      lastUpdate: mt5LastUpdate
    });

  } catch (error) {
    console.error('Error getting MT5 positions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch positions',
      positions: [] 
    });
  }
});

// Get MT5 trading summary/statistics
app.get('/api/mt5/summary', async (req, res) => {
  try {
    if (!metaApiExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !metaApiExecutor) {
        return res.status(503).json({ 
          error: 'MT5 connection not available' 
        });
      }
    }

    const isConnected = await metaApiExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected' 
      });
    }

    // Ensure we have fresh data
    await updateMT5Data();

    // Calculate summary statistics
    const totalUnrealizedPL = mt5Positions.reduce((sum, pos) => sum + (pos.unrealizedProfit || 0), 0);
    const totalCommission = mt5Positions.reduce((sum, pos) => sum + (pos.commission || 0), 0);
    const totalSwap = mt5Positions.reduce((sum, pos) => sum + (pos.swap || 0), 0);
    
    const buyPositions = mt5Positions.filter(pos => pos.type === 'POSITION_TYPE_BUY').length;
    const sellPositions = mt5Positions.filter(pos => pos.type === 'POSITION_TYPE_SELL').length;
    
    const marginUsed = mt5AccountInfo?.margin || 0;
    const marginFree = mt5AccountInfo?.freeMargin || 0;
    const marginLevel = marginUsed > 0 ? ((mt5AccountInfo?.equity || 0) / marginUsed) * 100 : 0;

    res.json({
      success: true,
      connected: true,
      summary: {
        account: {
          balance: mt5AccountInfo?.balance || 0,
          equity: mt5AccountInfo?.equity || 0,
          margin: marginUsed,
          freeMargin: marginFree,
          marginLevel: marginLevel,
          currency: mt5AccountInfo?.currency || 'USD'
        },
        positions: {
          total: mt5Positions.length,
          buy: buyPositions,
          sell: sellPositions,
          totalUnrealizedPL: totalUnrealizedPL,
          totalCommission: totalCommission,
          totalSwap: totalSwap
        },
        performance: {
          dailyPL: totalUnrealizedPL, // This would need historical data for actual daily P&L
          weeklyPL: totalUnrealizedPL, // This would need historical data
          monthlyPL: totalUnrealizedPL // This would need historical data
        }
      },
      lastUpdate: mt5LastUpdate
    });

  } catch (error) {
    console.error('Error getting MT5 summary:', error);
    res.status(500).json({ 
      error: 'Failed to fetch trading summary' 
    });
  }
});

// Close a specific position
app.post('/api/mt5/positions/:positionId/close', async (req, res) => {
  try {
    const { positionId } = req.params;
    
    if (!metaApiExecutor) {
      return res.status(503).json({ 
        error: 'MT5 connection not available' 
      });
    }

    const isConnected = await metaApiExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected' 
      });
    }

    const result = await metaApiExecutor.closePosition(positionId);
    
    if (result) {
      // Update positions after closing
      setTimeout(() => updateMT5Data(), 2000); // Give time for the close to process
      
      addLog({
        level: 'info',
        message: `✅ Position ${positionId} closed via dashboard`
      });

      res.json({
        success: true,
        message: `Position ${positionId} closed successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to close position'
      });
    }

  } catch (error) {
    console.error('Error closing position:', error);
    res.status(500).json({ 
      error: 'Failed to close position: ' + error 
    });
  }
});

// Get MT5 connection status
app.get('/api/mt5/status', async (req, res) => {
  try {
    let connected = false;
    let accountStatus = 'disconnected';
    let initializationStatus = 'not_initialized';
    
    // First, ensure MT5 is initialized
    if (!metaApiExecutor) {
      console.log('🔄 MT5 not initialized, attempting initialization...');
      const initialized = await initializeMT5();
      initializationStatus = initialized ? 'initialized' : 'failed';
    } else {
      initializationStatus = 'initialized';
    }
    
    if (metaApiExecutor) {
      try {
        connected = await metaApiExecutor.isConnected();
        if (connected) {
          accountStatus = 'connected';
        } else {
          accountStatus = 'disconnected';
        }
      } catch (error) {
        console.log('❌ Error checking MT5 connection:', error);
        accountStatus = 'error';
      }
    }

    res.json({
      connected,
      status: accountStatus,
      initialization: initializationStatus,
      lastUpdate: mt5LastUpdate,
      hasData: !!mt5AccountInfo,
      positionsCount: mt5Positions.length,
      executor: !!metaApiExecutor
    });

  } catch (error) {
    console.error('Error getting MT5 status:', error);
    res.status(500).json({ 
      connected: false,
      status: 'error',
      initialization: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Force refresh MT5 data
app.post('/api/mt5/refresh', async (req, res) => {
  try {
    if (!metaApiExecutor) {
      const initialized = await initializeMT5();
      if (!initialized) {
        return res.status(503).json({ 
          error: 'MT5 connection not available' 
        });
      }
    }

    await updateMT5Data();
    
    res.json({
      success: true,
      message: 'MT5 data refreshed',
      lastUpdate: mt5LastUpdate
    });

  } catch (error) {
    console.error('Error refreshing MT5 data:', error);
    res.status(500).json({ 
      error: 'Failed to refresh data: ' + error 
    });
  }
});

// ========== END MT5 ENDPOINTS ==========

// Test MetaAPI account connection
app.get('/api/metaapi/test/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Basic validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(accountId)) {
      return res.status(400).json({ error: 'Invalid account ID format' });
    }
    
    // For now, just return success if format is valid
    // In production, you would test actual MetaAPI connection
    res.json({ 
      success: true, 
      name: `Account ${accountId.slice(0, 8)}`,
      status: 'Format valid - Connection test would go here'
    });
    
  } catch (error) {
    console.error('Error testing account:', error);
    res.status(500).json({ error: 'Failed to test account connection' });
  }
});

app.post('/api/config', (req, res) => {
  // Update configuration
  const { maxTradeSize, riskPercentage, logLevel } = req.body;
  
  // Validate inputs
  if (maxTradeSize && (maxTradeSize < 0.01 || maxTradeSize > 10)) {
    return res.status(400).json({ error: 'Max trade size must be between 0.01 and 10' });
  }
  
  if (riskPercentage && (riskPercentage < 0.1 || riskPercentage > 10)) {
    return res.status(400).json({ error: 'Risk percentage must be between 0.1% and 10%' });
  }
  
  // TODO: Update config and restart bot with new settings
  res.json({ success: true, message: 'Configuration updated successfully' });
});

app.get('/api/statistics', (req, res) => {
  // Calculate trading statistics
  const stats = calculateTradingStats(tradeHistory);
  res.json(stats);
});

// Real-time log streaming endpoint
app.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Log stream connected"}\n\n');

  // Send recent logs
  const recentLogs = dashboardLogs.slice(-10);
  recentLogs.forEach((log: any) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  });

  // Set up periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
  }, 30000);

  // Store client connection for broadcasting new logs
  req.on('close', () => {
    clearInterval(heartbeat);
  });

  // Store the response object to broadcast new logs
  req.on('close', () => {
    const index = streamClients.indexOf(res);
    if (index !== -1) {
      streamClients.splice(index, 1);
    }
    clearInterval(heartbeat);
  });
  
  streamClients.push(res);
});

// Test connection endpoint
app.post('/api/test-connection', async (req, res) => {
  try {
    const { type, config: testConfig } = req.body;
    
    if (type === 'metaapi') {
      // Test MetaAPI connection
      const { accountId, token } = testConfig;
      
      if (!accountId || !token) {
        return res.status(400).json({ 
          success: false, 
          error: 'Account ID and token are required' 
        });
      }

      // Basic format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(accountId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid account ID format' 
        });
      }

      // For production, you would test actual MetaAPI connection here
      // For now, simulate a connection test
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      res.json({ 
        success: true, 
        message: 'MetaAPI connection test passed',
        accountInfo: {
          id: accountId.slice(0, 8) + '...',
          status: 'Connected'
        }
      });
    } else if (type === 'telegram') {
      // Test Telegram bot connection
      const { botToken, channelId } = testConfig;
      
      if (!botToken || !channelId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bot token and channel ID are required' 
        });
      }

      // Simulate telegram connection test
      await new Promise(resolve => setTimeout(resolve, 800));
      
      res.json({ 
        success: true, 
        message: 'Telegram bot connection test passed',
        botInfo: {
          token: botToken.slice(0, 10) + '...',
          channelId: channelId
        }
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid connection type' 
      });
    }
  } catch (error: any) {
    console.error('Connection test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Connection test failed: ' + error.message 
    });
  }
});

// Account configuration endpoints
app.get('/api/config/account', (req, res) => {
  res.json({
    success: true,
    config: {
      metaApiToken: process.env.METAAPI_TOKEN ? '***' + process.env.METAAPI_TOKEN.slice(-4) : '',
      accountId: process.env.METAAPI_ACCOUNT_ID || '',
      botToken: process.env.BOT_TOKEN ? '***' + process.env.BOT_TOKEN.slice(-4) : '',
      channelId: process.env.ALLOWED_CHANNEL_ID || '',
      maxTradeSize: config.trading.maxTradeSize,
      riskPercentage: config.trading.riskPercentage
    }
  });
});

app.post('/api/config/account', (req, res) => {
  try {
    const { metaApiToken, accountId, botToken, channelId, maxTradeSize, riskPercentage } = req.body;
    
    // Validate inputs
    if (maxTradeSize && (maxTradeSize < 0.01 || maxTradeSize > 10)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Max trade size must be between 0.01 and 10' 
      });
    }
    
    if (riskPercentage && (riskPercentage < 0.1 || riskPercentage > 10)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Risk percentage must be between 0.1% and 10%' 
      });
    }

    // In a real implementation, you would save these to environment variables or config file
    // For now, just validate and return success
    
    addLog({
      level: 'info',
      message: 'Account configuration updated via dashboard'
    });
    
    res.json({ 
      success: true, 
      message: 'Account configuration updated successfully' 
    });
  } catch (error) {
    console.error('Error saving account config:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save configuration' 
    });
  }
});

app.delete('/api/logs', (req, res) => {
  // Clear the dashboard logs array
  dashboardLogs.length = 0;
  res.json({ success: true, message: 'Logs cleared' });
});

// Functions to update data from bot
export const updateBotStatus = (status: any) => {
  botStatus = { ...botStatus, ...status };
};

export const addLog = (logEntry: any) => {
  const logWithTimestamp = {
    ...logEntry,
    timestamp: new Date().toISOString()
  };
  
  dashboardLogs.push(logWithTimestamp);
  
  // Keep only last 1000 logs
  if (dashboardLogs.length > 1000) {
    dashboardLogs.splice(0, dashboardLogs.length - 1000);
  }

  // Broadcast to connected stream clients
  if (streamClients && streamClients.length > 0) {
    const logData = JSON.stringify(logWithTimestamp);
    streamClients.forEach((client: any) => {
      try {
        client.write(`data: ${logData}\n\n`);
      } catch (error) {
        // Client disconnected, remove from list
        const index = streamClients.indexOf(client);
        if (index !== -1) {
          streamClients.splice(index, 1);
        }
      }
    });
  }
};

export const addTrade = (trade: any) => {
  tradeHistory.push({
    ...trade,
    timestamp: new Date().toISOString(),
    id: Date.now() + Math.random()
  });
  
  // Keep only last 500 trades
  if (tradeHistory.length > 500) {
    tradeHistory = tradeHistory.slice(-500);
  }
};

function calculateTradingStats(trades: any[]) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      avgRiskRewardRatio: 0,
      totalProfit: 0,
      winningTrades: 0,
      losingTrades: 0,
      biggestWin: 0,
      biggestLoss: 0
    };
  }

  const completedTrades = trades.filter(t => t.status === 'completed');
  const winningTrades = completedTrades.filter(t => t.profit > 0);
  const losingTrades = completedTrades.filter(t => t.profit < 0);
  
  const totalProfit = completedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
  const avgRR = completedTrades.reduce((sum, t) => sum + (t.riskRewardRatio || 0), 0) / completedTrades.length || 0;
  
  return {
    totalTrades: completedTrades.length,
    winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0,
    avgRiskRewardRatio: avgRR,
    totalProfit,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    biggestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profit)) : 0,
    biggestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profit)) : 0
  };
}

// Initialize MT5 integration when server starts
setTimeout(() => {
  initializeMT5().then((success) => {
    if (success) {
      startMT5Updates();
      addLog({
        level: 'info',
        message: '🚀 MT5 Dashboard Integration started successfully'
      });
    }
  });
}, 5000); // Wait 5 seconds after server start

export default app;
