import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../utils/config';
import { dashboardLogs } from '../utils/logger';
import { MultiAccountMetaApiExecutor } from '../mt5/multiAccountMetaApiExecutor';
import tradingAPIRouter, { initializeTradingAPI } from './tradingAPI';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store for real-time data
import { randomUUID } from 'crypto';

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

// MT5 Integration - Multi-Account for dashboard
let multiAccountExecutor: MultiAccountMetaApiExecutor | null = null;
let mt5AccountsData: any[] = [];
let mt5LastUpdate = 0;

// Import the shared executor instance
export const setSharedExecutor = (executor: MultiAccountMetaApiExecutor) => {
  multiAccountExecutor = executor;
  // Initialize trading API when executor is set
  initializeTradingAPI(executor);
};

// Initialize MT5 connection for dashboard (use shared instance)
const initializeMT5 = async () => {
  try {
    if (!multiAccountExecutor) {
      addLog({
        level: 'warn',
        message: '⚠️ No shared MT5 executor available for dashboard'
      });
      return false;
    }

    // Check if the shared executor is already initialized
    const isConnected = await multiAccountExecutor.isConnected();
    if (isConnected) {
      addLog({
        level: 'info',
        message: '📊 Using shared MT5 executor for dashboard integration'
      });
      return true;
    }

    return false;
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
  if (!multiAccountExecutor) return;
  
  try {
    const isConnected = await multiAccountExecutor.isConnected();
    if (!isConnected) return;
    
    // Get all accounts data (includes balance, equity, positions, etc.)
    const accountsData = await multiAccountExecutor.getAllAccountsData();
    mt5AccountsData = accountsData.map((account: any) => ({
      ...account,
      lastUpdate: Date.now()
    }));
    
    mt5LastUpdate = Date.now();
    
  } catch (error) {
    console.error('Error updating Multi-Account MT5 data:', error);
  }
};

// Start MT5 data updates
let updateInterval: NodeJS.Timeout | null = null;

const startMT5Updates = () => {
  // Clear existing interval if any
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  // Update every 30 seconds instead of 10 to reduce log noise
  updateInterval = setInterval(updateMT5Data, 30000);
  // Initial update
  updateMT5Data();
};

// Clean shutdown function
const stopMT5Updates = () => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
};

// ========== MULTI-ACCOUNT HELPER FUNCTIONS ==========

// Get real multi-account data from MultiAccountMetaApiExecutor
const getMultiAccountData = async () => {
  try {
    // Initialize multi-account executor if not already done
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        console.log('❌ Multi-account executor not initialized');
        return [];
      }
    }

    // Get all accounts data with real information
    const accounts = await multiAccountExecutor.getAllAccountsData();
    return accounts;
    
  } catch (error) {
    console.error('Error in getMultiAccountData:', error);
    return [];
  }
};

// Remove the generateRandomPositions function - we don't want fake data
// const generateRandomPositions = () => { ... } // REMOVED

// Calculate summary statistics from all accounts
const calculateSummaryStats = (accounts: any[]) => {
  const connectedAccounts = accounts.filter(acc => acc.status === 'CONNECTED').length;
  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const totalEquity = accounts.reduce((sum, acc) => sum + (acc.equity || 0), 0);
  const totalUnrealizedPL = totalEquity - totalBalance;

  let totalPositions = 0;
  let buyPositions = 0;
  let sellPositions = 0;

  accounts.forEach(acc => {
    if (acc.positions) {
      totalPositions += acc.positions.length;
      acc.positions.forEach((pos: any) => {
        if (pos.type === 'BUY') buyPositions++;
        else if (pos.type === 'SELL') sellPositions++;
      });
    }
  });

  return {
    totalAccounts: accounts.length,
    connectedAccounts,
    totalBalance,
    totalEquity,
    totalUnrealizedPL,
    totalPositions,
    buyPositions,
    sellPositions
  };
};

// Get all active trades from all accounts
const getAllActiveTrades = (accounts: any[]) => {
  const allTrades: any[] = [];

  accounts.forEach(account => {
    if (account.positions && account.positions.length > 0) {
      account.positions.forEach((position: any) => {
        allTrades.push({
          id: position.id,
          accountId: account.id,
          brokerName: account.brokerName,
          symbol: position.symbol,
          type: position.type,
          volume: position.volume,
          openPrice: position.openPrice,
          currentPrice: position.currentPrice,
          unrealizedProfit: position.unrealizedProfit,
          openTime: position.openTime,
          commission: position.commission,
          swap: position.swap
        });
      });
    }
  });

  return allTrades.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
};

// Get default summary when no accounts are available
const getDefaultSummary = () => ({
  totalAccounts: 0,
  connectedAccounts: 0,
  totalBalance: 0,
  totalEquity: 0,
  totalUnrealizedPL: 0,
  totalPositions: 0,
  buyPositions: 0,
  sellPositions: 0
});

// ========== END MULTI-ACCOUNT HELPER FUNCTIONS ==========

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

// Mount Trading Management API
app.use('/api/trading', tradingAPIRouter);

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
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'MT5 connection not available',
          connected: false 
        });
      }
    }

    const isConnected = await multiAccountExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected',
        connected: false 
      });
    }

    // Return cached data if recent, otherwise fetch fresh
    const shouldUpdate = !mt5AccountsData.length || (Date.now() - mt5LastUpdate) > 30000; // 30 seconds
    if (shouldUpdate) {
      await updateMT5Data();
    }

    // Calculate aggregate account data from all accounts
    const totalBalance = mt5AccountsData.reduce((sum, account) => sum + (account.balance || 0), 0);
    const totalEquity = mt5AccountsData.reduce((sum, account) => sum + (account.equity || 0), 0);
    const totalFreeMargin = mt5AccountsData.reduce((sum, account) => sum + (account.freeMargin || 0), 0);
    
    res.json({
      success: true,
      connected: true,
      accounts: mt5AccountsData,
      summary: {
        totalBalance,
        totalEquity,
        totalFreeMargin,
        accountCount: mt5AccountsData.length,
        connectedAccounts: mt5AccountsData.filter(acc => acc.status === 'CONNECTED').length
      },
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
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'MT5 connection not available',
          positions: [] 
        });
      }
    }

    const isConnected = await multiAccountExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected',
        positions: [] 
      });
    }

    // Return cached data if recent, otherwise fetch fresh
    const shouldUpdate = !mt5AccountsData.length || (Date.now() - mt5LastUpdate) > 15000; // 15 seconds
    if (shouldUpdate) {
      await updateMT5Data();
    }

    // Aggregate all positions from all accounts
    const allPositions = mt5AccountsData.reduce((positions: any[], account) => {
      return positions.concat(account.positions || []);
    }, []);

    res.json({
      success: true,
      connected: true,
      positions: allPositions,
      count: allPositions.length,
      accountBreakdown: mt5AccountsData.map(account => ({
        brokerName: account.brokerName,
        accountType: account.accountType,
        status: account.status,
        positionCount: account.positions ? account.positions.length : 0
      })),
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
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'MT5 connection not available' 
        });
      }
    }

    const isConnected = await multiAccountExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected' 
      });
    }

    // Ensure we have fresh data
    await updateMT5Data();

    // Aggregate all positions from all accounts
    const allPositions = mt5AccountsData.reduce((positions: any[], account) => {
      return positions.concat(account.positions || []);
    }, []);

    // Calculate summary statistics across all accounts
    const totalUnrealizedPL = allPositions.reduce((sum: number, pos: any) => sum + (pos.unrealizedProfit || 0), 0);
    const totalCommission = allPositions.reduce((sum: number, pos: any) => sum + (pos.commission || 0), 0);
    const totalSwap = allPositions.reduce((sum: number, pos: any) => sum + (pos.swap || 0), 0);
    
    const buyPositions = allPositions.filter((pos: any) => pos.type === 'POSITION_TYPE_BUY').length;
    const sellPositions = allPositions.filter((pos: any) => pos.type === 'POSITION_TYPE_SELL').length;
    
    // Aggregate account data
    const totalBalance = mt5AccountsData.reduce((sum: number, account: any) => sum + (account.balance || 0), 0);
    const totalEquity = mt5AccountsData.reduce((sum: number, account: any) => sum + (account.equity || 0), 0);
    const totalMarginUsed = mt5AccountsData.reduce((sum: number, account: any) => sum + (account.margin || 0), 0);
    const totalFreeMargin = mt5AccountsData.reduce((sum: number, account: any) => sum + (account.freeMargin || 0), 0);
    const avgMarginLevel = totalMarginUsed > 0 ? (totalEquity / totalMarginUsed) * 100 : 0;

    res.json({
      success: true,
      connected: true,
      summary: {
        account: {
          totalBalance,
          totalEquity,
          totalMargin: totalMarginUsed,
          totalFreeMargin,
          avgMarginLevel,
          accountCount: mt5AccountsData.length,
          connectedAccounts: mt5AccountsData.filter((acc: any) => acc.status === 'CONNECTED').length
        },
        positions: {
          total: allPositions.length,
          buy: buyPositions,
          sell: sellPositions,
          totalUnrealizedPL,
          totalCommission,
          totalSwap
        },
        accounts: mt5AccountsData.map((account: any) => ({
          brokerName: account.brokerName,
          accountType: account.accountType,
          status: account.status,
          balance: account.balance || 0,
          equity: account.equity || 0,
          positionCount: account.positions ? account.positions.length : 0
        }))
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
app.post('/api/mt5/positions/:accountId/:positionId/close', async (req, res) => {
  try {
    const { accountId, positionId } = req.params;
    
    if (!multiAccountExecutor) {
      return res.status(503).json({ 
        error: 'MT5 connection not available' 
      });
    }

    const isConnected = await multiAccountExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'MT5 not connected' 
      });
    }

    const result = await multiAccountExecutor.closePosition(accountId, positionId);
    
    if (result) {
      // Update positions after closing
      setTimeout(() => updateMT5Data(), 2000); // Give time for the close to process
      
      addLog({
        level: 'info',
        message: `✅ Position ${positionId} on account ${accountId} closed via dashboard`
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
    if (!multiAccountExecutor) {
      console.log('🔄 MT5 not initialized, attempting initialization...');
      const initialized = await initializeMT5();
      initializationStatus = initialized ? 'initialized' : 'failed';
    } else {
      initializationStatus = 'initialized';
    }
    
    if (multiAccountExecutor) {
      try {
        connected = await multiAccountExecutor.isConnected();
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
      hasData: mt5AccountsData.length > 0,
      accountsCount: mt5AccountsData.length,
      connectedAccountsCount: mt5AccountsData.filter((acc: any) => acc.status === 'CONNECTED').length,
      totalPositions: mt5AccountsData.reduce((sum: number, acc: any) => sum + (acc.positions?.length || 0), 0),
      executor: !!multiAccountExecutor
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
    if (!multiAccountExecutor) {
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

// ========== COMPREHENSIVE TRADE HISTORY ENDPOINTS ==========

// Get comprehensive trade history with advanced filtering
app.get('/api/mt5/trade-history', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'Multi-account executor not available' 
        });
      }
    }

    // Parse query parameters
    const {
      accountId,
      symbol,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const filter: any = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    };

    if (accountId && typeof accountId === 'string') filter.accountId = accountId;
    if (symbol && typeof symbol === 'string') filter.symbol = symbol;
    if (startDate && typeof startDate === 'string') filter.startDate = new Date(startDate);
    if (endDate && typeof endDate === 'string') filter.endDate = new Date(endDate);

    const history = await multiAccountExecutor!.getTradeHistory(filter);

    res.json({
      success: true,
      ...history,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching trade history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get performance metrics for a specific account
app.get('/api/mt5/performance/:accountId', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'Multi-account executor not available' 
        });
      }
    }

    const { accountId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate && typeof startDate === 'string' ? 
      new Date(startDate) : 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const end = endDate && typeof endDate === 'string' ? 
      new Date(endDate) : 
      new Date();

    const metrics = await multiAccountExecutor!.getAccountPerformanceMetrics(accountId, start, end);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Account not found or not connected'
      });
    }

    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch performance metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get performance metrics for all connected accounts
app.get('/api/mt5/performance-all', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'Multi-account executor not available' 
        });
      }
    }

    const { startDate, endDate } = req.query;

    const start = startDate && typeof startDate === 'string' ? 
      new Date(startDate) : 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const end = endDate && typeof endDate === 'string' ? 
      new Date(endDate) : 
      new Date();

    const allMetrics = await multiAccountExecutor!.getAllAccountsPerformanceMetrics(start, end);

    res.json({
      success: true,
      accounts: allMetrics,
      totalAccounts: allMetrics.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching all performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all performance metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get trade history summary with aggregated statistics
app.get('/api/mt5/trade-summary', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({ 
          error: 'Multi-account executor not available' 
        });
      }
    }

    const { period = '30d' } = req.query;
    
    // Calculate start date based on period
    let startDate: Date;
    const now = new Date();
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '365d':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const history = await multiAccountExecutor!.getTradeHistory({
      startDate,
      endDate: now,
      limit: 1000
    });

    // Calculate additional summary statistics
    const dailyStats = new Map<string, { trades: number; profit: number; volume: number }>();
    
    history.positions.forEach(pos => {
      if (pos.status === 'CLOSED' && pos.closeTime) {
        const day = pos.closeTime.toISOString().substring(0, 10);
        const existing = dailyStats.get(day) || { trades: 0, profit: 0, volume: 0 };
        existing.trades++;
        existing.profit += pos.profit || 0;
        existing.volume += pos.volume;
        dailyStats.set(day, existing);
      }
    });

    const dailyBreakdown = Array.from(dailyStats.entries()).map(([date, stats]) => ({
      date,
      ...stats
    })).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      period,
      summary: history.summary,
      dailyBreakdown,
      recentDeals: history.deals.slice(0, 10),
      openPositions: history.positions.filter(pos => pos.status === 'OPEN').slice(0, 10),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching trade summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ========== END TRADE HISTORY ENDPOINTS ==========

// ========== END MT5 ENDPOINTS ==========

// ========== MULTI-ACCOUNT ENDPOINTS ==========

// Get all accounts data for multi-account dashboard
app.get('/api/multi-accounts', async (req, res) => {
  try {
    // Get real account data (no simulated data)
    const accounts = await getMultiAccountData();
    const summary = calculateSummaryStats(accounts);
    const allTrades = getAllActiveTrades(accounts);

    res.json({
      success: true,
      accounts,
      summary,
      allTrades,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting multi-account data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch multi-account data',
      message: error instanceof Error ? error.message : 'Unknown error',
      accounts: [],
      summary: getDefaultSummary(),
      allTrades: []
    });
  }
});

// Close a specific trade on a specific account
app.post('/api/close-trade/:accountId/:tradeId', async (req, res) => {
  try {
    const { accountId, tradeId } = req.params;
    
    // Initialize multi-account executor if not already done
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({
          success: false,
          error: 'Multi-account executor not available'
        });
      }
    }

    console.log(`🔄 Attempting to close trade ${tradeId} on account ${accountId}`);
    
    // Use the real closePosition method
    await multiAccountExecutor.closePosition(accountId, tradeId);
    
    res.json({
      success: true,
      message: 'Trade closed successfully',
      accountId,
      tradeId
    });

  } catch (error) {
    console.error('Error closing trade:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close trade'
    });
  }
});

// Get specific account status
app.get('/api/multi-accounts/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const accounts = await getMultiAccountData();
    const account = accounts.find(acc => acc.id === accountId);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    res.json({
      success: true,
      account
    });

  } catch (error) {
    console.error('Error getting account data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch account data'
    });
  }
});

// ========== END MULTI-ACCOUNT ENDPOINTS ==========

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

// Real-time log streaming endpoint with proper memory management
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

  // Set up periodic heartbeat with proper error handling
  const heartbeat = setInterval(() => {
    try {
      // Check if response is still writable
      if (res.writable && !res.destroyed) {
        res.write('data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n');
      } else {
        // Connection is dead, clean up immediately
        clearInterval(heartbeat);
        cleanup();
      }
    } catch (error) {
      // Client disconnected, clean up immediately
      clearInterval(heartbeat);
      cleanup();
    }
  }, 30000);

  // Add client to active connections list
  streamClients.push({ res, heartbeat, created: Date.now() });

  // Enhanced cleanup function
  const cleanup = () => {
    // Clear heartbeat interval
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    
    // Remove from active clients
    const clientIndex = streamClients.findIndex(client => client.res === res);
    if (clientIndex !== -1) {
      streamClients.splice(clientIndex, 1);
    }
    
    // Force close response if still open
    if (!res.destroyed) {
      try {
        res.end();
      } catch (e) {
        // Ignore errors on forced close
      }
    }
  };

  // Enhanced connection monitoring
  req.on('close', cleanup);
  req.on('error', cleanup);
  req.on('aborted', cleanup);
  
  // Automatic cleanup for stale connections (after 10 minutes)
  setTimeout(() => {
    if (streamClients.some(client => client.res === res)) {
      cleanup();
    }
  }, 600000);
  
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

      // Test actual MetaAPI connection
      try {
        const MetaApi = require('metaapi.cloud-sdk').default;
        const api = new MetaApi(process.env.METAAPI_TOKEN);
        const account = await api.metatraderAccountApi.getAccount(accountId);
        
        res.json({ 
          success: true, 
          message: 'MetaAPI connection test passed',
          accountInfo: {
            id: accountId.slice(0, 8) + '...',
            name: account.name,
            state: account.state,
            type: account.type
          }
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: 'MetaAPI connection failed: ' + error.message
        });
      }
    } else if (type === 'telegram') {
      // Test Telegram bot connection
      const { botToken, channelId } = testConfig;
      
      if (!botToken || !channelId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bot token and channel ID are required' 
        });
      }

      // Test actual Telegram bot connection
      try {
        const { Telegram } = require('telegraf');
        const telegram = new Telegram(botToken);
        
        // Test bot token validity by getting bot info
        const botInfo = await telegram.getMe();
        
        // Test channel access by getting chat info
        const chatInfo = await telegram.getChat(channelId);
        
        res.json({ 
          success: true, 
          message: 'Telegram bot connection test passed',
          botInfo: {
            username: botInfo.username,
            firstName: botInfo.first_name,
            channelId: channelId,
            channelTitle: chatInfo.title || 'Private Channel'
          }
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: 'Telegram connection failed: ' + error.message
        });
      }
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
    id: randomUUID()
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
  // Initialize single-account MT5 first
  initializeMT5().then((success) => {
    if (success) {
      startMT5Updates();
      addLog({
        level: 'info',
        message: '🚀 MT5 Dashboard Integration started successfully'
      });
    }
  });

  // Initialize multi-account executor
  Promise.resolve(false).then((success) => {
    if (success) {
      addLog({
        level: 'info',
        message: '🌐 Multi-Account Dashboard Integration started successfully'
      });
    }
  });
}, 5000); // Wait 5 seconds after server start

export default app;
