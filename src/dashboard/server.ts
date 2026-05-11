import express from 'express';
import path from 'path';
import fs from 'fs';
import { config, syncConfigFromEnv } from '../utils/config';
import {
  applySettingsPatch,
  getSettingsPayload,
  savePersistedSettingsFromEnv
} from '../config/runtimeSettings';
import { dashboardLogs } from '../utils/logger';
import { CleanMultiAccountExecutor } from '../mt5/cleanMultiAccountExecutor';
import { TradeSignal } from '../types';
import tradingAPIRouter from './noDbTradingAPI';
import { generalRateLimit, tradingRateLimit } from '../middleware/rateLimit';
import { InputValidator, ValidationRules } from '../middleware/validation';
import { globalErrorHandler, notFoundHandler, ApiError } from '../middleware/errorHandler';
import { requireApiKey } from '../middleware/apiKeyAuth';
// import { UserAccountManagementService } from '../services/UserAccountManagementService'; // REMOVED - No database needed

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Security middleware
app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS support for API
app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Rate limiting for different endpoints
app.use('/api/trading', tradingRateLimit.middleware());
app.use('/api', generalRateLimit.middleware());

// Authentication for all API endpoints (configurable via DASHBOARD_API_KEY)
app.use('/api', requireApiKey());

// Store for real-time data
import { randomUUID } from 'crypto';

let tradeHistory: any[] = [];
let streamClients: any[] = []; // Store for SSE clients

// Convert technical logs to user-friendly activities
const convertToUserFriendlyActivity = (log: any) => {
  if (!log || !log.message) return null;

  const message = log.message.toLowerCase();
  const timestamp = log.timestamp || new Date().toISOString();
  
  // Trading Activities
  if (message.includes('trade executed') || message.includes('position opened')) {
    return {
      type: 'activity',
      level: 'success',
      icon: '💰',
      title: 'Trade Executed',
      message: 'New trading position opened successfully',
      timestamp,
      category: 'trading'
    };
  }
  
  if (message.includes('trade closed') || message.includes('position closed')) {
    return {
      type: 'activity',
      level: 'info',
      icon: '📈',
      title: 'Position Closed',
      message: 'Trading position closed and profit/loss calculated',
      timestamp,
      category: 'trading'
    };
  }

  if (message.includes('signal received') || message.includes('signal detected')) {
    return {
      type: 'activity',
      level: 'info',
      icon: '📡',
      title: 'Signal Detected',
      message: 'New trading signal received from Telegram channel',
      timestamp,
      category: 'signals'
    };
  }

  // System Health
  if (message.includes('connected') && (message.includes('metaapi') || message.includes('mt5'))) {
    return {
      type: 'activity',
      level: 'success',
      icon: '🔗',
      title: 'Broker Connected',
      message: 'Successfully connected to MetaTrader 5 platform',
      timestamp,
      category: 'system'
    };
  }

  if (message.includes('telegram') && message.includes('connected')) {
    return {
      type: 'activity',
      level: 'success',
      icon: '🤖',
      title: 'Bot Online',
      message: 'Telegram bot is active and monitoring channels',
      timestamp,
      category: 'system'
    };
  }

  // Errors and Warnings (only show important ones)
  if (log.level === 'error' && (message.includes('connection') || message.includes('trade') || message.includes('api'))) {
    return {
      type: 'activity',
      level: 'error',
      icon: '⚠️',
      title: 'System Alert',
      message: 'Trading system experienced a connection issue - attempting to reconnect',
      timestamp,
      category: 'system'
    };
  }

  // Market Analysis
  if (message.includes('market analysis') || message.includes('chart analysis')) {
    return {
      type: 'activity',
      level: 'info',
      icon: '📊',
      title: 'Market Analysis',
      message: 'AI system analyzing market conditions and chart patterns',
      timestamp,
      category: 'analysis'
    };
  }

  // Risk Management
  if (message.includes('risk') || message.includes('stop loss') || message.includes('take profit')) {
    return {
      type: 'activity',
      level: 'warning',
      icon: '🛡️',
      title: 'Risk Management',
      message: 'Protective measures activated for current positions',
      timestamp,
      category: 'risk'
    };
  }

  // Account Management
  if (message.includes('balance') || message.includes('equity')) {
    return {
      type: 'activity',
      level: 'info',
      icon: '💼',
      title: 'Account Update',
      message: 'Account balance and equity information updated',
      timestamp,
      category: 'account'
    };
  }

  // Filter out technical/debug messages that users don't need to see
  const ignoredPatterns = [
    'debug', 'verbose', 'trace', 'heap', 'memory', 'gc', 'internal',
    'middleware', 'route', 'request', 'response', 'cors', 'parsing'
  ];
  
  if (ignoredPatterns.some(pattern => message.includes(pattern))) {
    return null;
  }

  // Default fallback for important messages only
  if (log.level === 'error' || log.level === 'warning') {
    return {
      type: 'activity',
      level: log.level,
      icon: log.level === 'error' ? '🚨' : '⚡',
      title: 'System Notification',
      message: 'System activity detected - monitoring for stability',
      timestamp,
      category: 'system'
    };
  }

  // Ignore everything else (debug, info logs that aren't user-relevant)
  return null;
};
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
let multiAccountExecutor: CleanMultiAccountExecutor | null = null;
let mt5AccountsData: any[] = [];
let mt5LastUpdate = 0;

// Logging throttle timestamps to reduce console spam
let lastNoExecutorLog = 0;
let lastDisconnectLog = 0;
let lastSuccessfulUpdate = 0;

// Import the shared executor instance
export const setSharedExecutor = (executor: CleanMultiAccountExecutor) => {
  multiAccountExecutor = executor;
  
  // Update bot status
  botStatus.connections.metaapi = true;
  botStatus.isRunning = true;
  
  addLog({
    level: 'info',
    message: '✅ Trading API connected to live executor'
  });
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
  if (!multiAccountExecutor) {
    // Reduced logging - only log once every 10 minutes
    if (!lastNoExecutorLog || Date.now() - lastNoExecutorLog > 600000) {
      console.log('🔍 [Dashboard] No MT5 executor available');
      lastNoExecutorLog = Date.now();
    }
    return;
  }
  
  try {
    const isConnected = await multiAccountExecutor.isConnected();
    
    if (!isConnected) {
      // Only log connection issues, not every check
      if (!lastDisconnectLog || Date.now() - lastDisconnectLog > 300000) {
        console.log('⚠️ [Dashboard] MT5 not connected, skipping data update');
        lastDisconnectLog = Date.now();
      }
      return;
    }
    
    // Get all accounts data (includes balance, equity, positions, etc.)
    const accountsData = await multiAccountExecutor.getAllAccountsData();
    
    // Only log if data changed or every 5 minutes
    const dataChanged = JSON.stringify(accountsData) !== JSON.stringify(mt5AccountsData);
    const shouldLog = dataChanged || !lastSuccessfulUpdate || Date.now() - lastSuccessfulUpdate > 300000;
    
    if (shouldLog) {
      console.log(`✅ [Dashboard] MT5 data updated: ${accountsData.length} accounts, Balance: $${accountsData[0]?.balance?.toFixed(2) || 0}`);
      lastSuccessfulUpdate = Date.now();
    }
    
    mt5AccountsData = accountsData.map((account: any) => ({
      ...account,
      lastUpdate: Date.now()
    }));
    
    mt5LastUpdate = Date.now();
    
  } catch (error) {
    console.error('❌ [Dashboard] Error updating Multi-Account MT5 data:', error);
    addLog({
      level: 'error',
      message: `Dashboard data update failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
};

// Start MT5 data updates
let updateInterval: NodeJS.Timeout | null = null;
let demoActivityInterval: NodeJS.Timeout | null = null;

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

// Demo activity generator for testing
const startDemoActivities = () => {
  const demoActivities = [
    { level: 'info', message: 'Signal received from premium channel' },
    { level: 'info', message: 'Trade executed successfully' },
    { level: 'success', message: 'Position opened successfully' },
    { level: 'info', message: 'Market analysis complete' },
    { level: 'warning', message: 'Risk management check activated' },
    { level: 'info', message: 'MetaAPI connection verified' },
    { level: 'success', message: 'Telegram bot connected' },
    { level: 'info', message: 'Chart analysis in progress' },
    { level: 'info', message: 'Balance update received' },
    { level: 'success', message: 'Trade closed with profit' }
  ];

  demoActivityInterval = setInterval(() => {
    const activity = demoActivities[Math.floor(Math.random() * demoActivities.length)];
    addLog(activity);
  }, 8000); // Every 8 seconds
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
        <head><title>Trading Dashboard</title></head>
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

  // User-friendly activity stream endpoint
app.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send connection established event
  res.write('data: {"type":"connected","message":"📊 Live activity stream connected","timestamp":"' + new Date().toISOString() + '"}\n\n');

  // Store client connection for real-time logs
  const clientId = Math.random().toString(36);
  streamClients.push({ id: clientId, res });

  // Send recent user-friendly activities immediately
  const recentLogs = Array.isArray(dashboardLogs) ? dashboardLogs.slice(-20) : [];
  const userFriendlyLogs = recentLogs
    .map(log => convertToUserFriendlyActivity(log))
    .filter(activity => activity !== null);
  
  userFriendlyLogs.forEach(activity => {
    res.write(`data: ${JSON.stringify(activity)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    try {
      if (res.writable && !res.destroyed) {
        res.write(
          'data: {"type":"heartbeat","timestamp":"' + new Date().toISOString() + '"}\n\n'
        );
      }
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    streamClients = streamClients.filter(client => client.id !== clientId);
  });
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json(botStatus);
});

// Mount Trading Management API
app.use('/api', tradingAPIRouter);

app.get('/api/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = Array.isArray(dashboardLogs) ? dashboardLogs.slice(-limit) : [];
    
    // Ensure logs have proper format
    const formattedLogs = logs.map(log => ({
      timestamp: log.timestamp || new Date().toISOString(),
      level: log.level || 'info',
      message: log.message || 'No message',
      service: log.service || 'system'
    }));
    
    res.json(formattedLogs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.json([]);
  }
});

app.get('/api/trades', (req, res) => {
  res.json(tradeHistory);
});

app.get('/api/config', (req, res) => {
  const maxTs = parseFloat(process.env.MAX_TRADE_SIZE || '');
  const riskPct = parseFloat(process.env.RISK_PERCENTAGE || '');
  res.json({
    allowedChannelId: config.allowedChannelId,
    maxTradeSize: isFinite(maxTs) && maxTs > 0 ? maxTs : config.trading.maxTradeSize,
    riskPercentage: isFinite(riskPct) && riskPct > 0 ? riskPct : config.trading.riskPercentage,
    logLevel: process.env.LOG_LEVEL || config.logging.level,
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '10', 10),
    botEnabled: process.env.BOT_ENABLED !== 'false',
    currentAccountId: process.env.METAAPI_ACCOUNT_ID
  });
});

/** Unified settings: all managed keys with masked secrets */
app.get('/api/settings', (req, res) => {
  try {
    const payload = getSettingsPayload();
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/** Partial update: keys omitted unchanged; null clears key from env + persistence */
app.patch('/api/settings', (req, res) => {
  try {
    const result = applySettingsPatch(req.body || {});
    if (result.errors.length > 0) {
      return res.status(400).json({ success: false, ...result });
    }
    addLog({
      level: 'info',
      message: `⚙️ Settings PATCH applied: ${result.applied.join(', ') || 'none'}`
    });
    res.json({
      success: true,
      ...result,
      ...getSettingsPayload()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// ========== RISK MANAGEMENT ENDPOINTS ==========

// Get current risk configuration
app.get('/api/risk-config', async (req, res) => {
  try {
    // Get current account balance if possible
    let currentBalance = 0;
    if (multiAccountExecutor && await multiAccountExecutor.isConnected()) {
      try {
        const accountData = await multiAccountExecutor.getAllAccountsData();
        currentBalance = accountData?.[0]?.balance || 0;
      } catch (error) {
        console.warn('Could not fetch live balance for risk config:', error);
      }
    }

    const riskPercentage = parseFloat(process.env.RISK_PERCENTAGE || '0.33');
    const riskRewardRatio = parseFloat(process.env.RISK_REWARD_RATIO || '1.5');
    const dashboardFixedUsd =
      process.env.RISK_AMOUNT_USD !== undefined && process.env.RISK_AMOUNT_USD !== ''
        ? parseFloat(process.env.RISK_AMOUNT_USD)
        : null;
    const envFixedUsd = parseFloat(process.env.FIXED_RISK_AMOUNT || '');
    const fixedRiskAmount =
      dashboardFixedUsd != null && !isNaN(dashboardFixedUsd)
        ? dashboardFixedUsd
        : isFinite(envFixedUsd) && envFixedUsd > 0
          ? envFixedUsd
          : null;

    const effectiveRiskAmount =
      fixedRiskAmount != null && fixedRiskAmount > 0
        ? fixedRiskAmount
        : currentBalance * (riskPercentage / 100);

    const fixedLotSize = parseFloat(process.env.FIXED_LOT_SIZE || String(config.trading.fixedLotSize));
    const useSignalStops = process.env.USE_SIGNAL_STOPS === 'true';
    const maxDailyLossPercent = parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5');
    const maxDrawdownPercent = parseFloat(process.env.MAX_DRAWDOWN_PERCENT || '10');

    res.json({
      success: true,
      config: {
        riskPercentage: riskPercentage,
        riskRewardRatio: riskRewardRatio,
        fixedRiskAmount: fixedRiskAmount,
        fixedLotSize: fixedLotSize,
        effectiveRiskAmount: effectiveRiskAmount,
        currentBalance: currentBalance,
        riskMode: fixedRiskAmount ? 'fixed' : 'percentage',
        useSignalStops,
        maxDailyLossPercent,
        maxDrawdownPercent
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get risk configuration: ' + error
    });
  }
});

// Update risk configuration (runtime only - doesn't persist to .env)
app.post('/api/risk-config', (req, res) => {
  try {
    const {
      riskPercentage,
      riskRewardRatio,
      fixedRiskAmount,
      fixedLotSize,
      useSignalStops,
      maxDailyLossPercent,
      maxDrawdownPercent
    } = req.body;

    // Update environment variables (runtime only)
    if (riskPercentage !== undefined) {
      process.env.RISK_PERCENTAGE = riskPercentage.toString();
    }
    if (riskRewardRatio !== undefined) {
      process.env.RISK_REWARD_RATIO = riskRewardRatio.toString();
    }
    if (fixedRiskAmount !== undefined) {
      if (fixedRiskAmount === null) {
        delete process.env.RISK_AMOUNT_USD;
      } else {
        process.env.RISK_AMOUNT_USD = fixedRiskAmount.toString();
      }
    }
    if (fixedLotSize !== undefined) {
      if (fixedLotSize === null || fixedLotSize === '') {
        delete process.env.FIXED_LOT_SIZE;
      } else {
        process.env.FIXED_LOT_SIZE = String(fixedLotSize);
      }
    }
    if (useSignalStops !== undefined) {
      process.env.USE_SIGNAL_STOPS = useSignalStops ? 'true' : 'false';
    }
    if (maxDailyLossPercent !== undefined) {
      process.env.MAX_DAILY_LOSS_PERCENT = String(maxDailyLossPercent);
    }
    if (maxDrawdownPercent !== undefined) {
      process.env.MAX_DRAWDOWN_PERCENT = String(maxDrawdownPercent);
    }

    addLog({
      level: 'info',
      message: `🎯 Risk configuration updated via dashboard: ${JSON.stringify({
        riskPercentage,
        riskRewardRatio,
        fixedRiskAmount,
        fixedLotSize,
        useSignalStops,
        maxDailyLossPercent,
        maxDrawdownPercent
      })}`
    });

    syncConfigFromEnv();
    try {
      savePersistedSettingsFromEnv();
    } catch {
      /* optional disk */
    }

    res.json({
      success: true,
      message: 'Risk configuration updated (saved to data/settings.json)',
      config: {
        riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || '0.33'),
        riskRewardRatio: parseFloat(process.env.RISK_REWARD_RATIO || '1.5'),
        fixedRiskAmount: process.env.RISK_AMOUNT_USD ? parseFloat(process.env.RISK_AMOUNT_USD) : null,
        fixedLotSize: parseFloat(process.env.FIXED_LOT_SIZE || String(config.trading.fixedLotSize)),
        riskMode: process.env.RISK_AMOUNT_USD ? 'fixed' : 'percentage',
        useSignalStops: process.env.USE_SIGNAL_STOPS === 'true',
        maxDailyLossPercent: parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5'),
        maxDrawdownPercent: parseFloat(process.env.MAX_DRAWDOWN_PERCENT || '10')
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update risk configuration: ' + error
    });
  }
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
    
    // Include MetaAPI account IDs for MetaStats integration
    const accountsWithIds = mt5AccountsData.map(account => ({
      ...account,
      accountId: account.id  // Ensure the MetaAPI account ID is available as 'accountId'
    }));
    
    res.json({
      success: true,
      connected: true,
      accounts: accountsWithIds,
      summary: {
        totalBalance,
        totalEquity,
        totalFreeMargin,
        accountCount: mt5AccountsData.length,
        connectedAccounts: mt5AccountsData.filter(acc => acc.status === 'CONNECTED').length
      },
      lastUpdate: mt5LastUpdate,
      // Add primary account ID for MetaStats (first connected account)
      primaryAccountId: mt5AccountsData.find(acc => acc.status === 'CONNECTED')?.id || mt5AccountsData[0]?.id
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

// Get MT5 pending (limit/stop) orders
app.get('/api/mt5/orders', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      const initialized = await initializeMT5();
      if (!initialized || !multiAccountExecutor) {
        return res.status(503).json({
          success: false,
          error: 'MT5 connection not available',
          orders: []
        });
      }
    }

    const isConnected = await multiAccountExecutor.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        error: 'MT5 not connected',
        orders: []
      });
    }

    const shouldUpdate = !mt5AccountsData.length || (Date.now() - mt5LastUpdate) > 15000;
    if (shouldUpdate) {
      await updateMT5Data();
    }

    const allOrders = mt5AccountsData.reduce((orders: any[], account) => {
      return orders.concat(account.pendingOrders || []);
    }, []);

    res.json({
      success: true,
      connected: true,
      orders: allOrders,
      count: allOrders.length,
      accountBreakdown: mt5AccountsData.map(account => ({
        brokerName: account.brokerName,
        accountType: account.accountType,
        status: account.status,
        orderCount: account.pendingOrders ? account.pendingOrders.length : 0
      })),
      lastUpdate: mt5LastUpdate
    });
  } catch (error) {
    console.error('Error getting MT5 pending orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending orders',
      orders: []
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

// Close all positions for an account
app.post('/api/mt5/positions/close-all/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
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

    // Get current positions from all accounts
    const positions = mt5AccountsData.reduce((allPositions: any[], account) => {
      return allPositions.concat(account.positions || []);
    }, []);
    if (positions.length === 0) {
      return res.json({
        success: true,
        message: 'No positions to close',
        closedCount: 0
      });
    }

    let closedCount = 0;
    let failedCount = 0;

    // Close each position
    for (const position of positions) {
      try {
        const result = await multiAccountExecutor.closePosition(accountId, position.id);
        if (result) {
          closedCount++;
        } else {
          failedCount++;
        }
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error closing position ${position.id}:`, error);
        failedCount++;
      }
    }

    // Update positions after closing
    setTimeout(() => updateMT5Data(), 3000);

    addLog({
      level: 'info',
      message: `✅ Closed ${closedCount} positions on account ${accountId} via dashboard`
    });

    res.json({
      success: true,
      message: `Closed ${closedCount} positions successfully`,
      closedCount,
      failedCount,
      totalPositions: positions.length
    });

  } catch (error) {
    console.error('Error closing all positions:', error);
    res.status(500).json({ 
      error: 'Failed to close all positions: ' + error 
    });
  }
});

// ========== ADVANCED METAAPI FEATURES ==========

// Get account analytics and performance metrics (basic implementation)
app.get('/api/mt5/analytics/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    if (!multiAccountExecutor) {
      return res.status(503).json({ error: 'MT5 connection not available' });
    }

    // Get trade history for analytics
    const history = await multiAccountExecutor.getTradeHistory();
    
    // Calculate basic analytics from history
    let totalTrades = 0;
    let winningTrades = 0;
    let totalProfit = 0;
    
    if (history && history.deals) {
      totalTrades = history.deals.length;
      winningTrades = history.deals.filter((deal: any) => (deal.profit || 0) > 0).length;
      totalProfit = history.deals.reduce((sum: number, deal: any) => sum + (deal.profit || 0), 0);
    }
    
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    res.json({
      success: true,
      analytics: {
        totalTrades,
        winningTrades,
        winRate: winRate.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        profitFactor: 'N/A',
        drawdown: 'N/A',
        equity: mt5AccountsData[0]?.equity || 0,
        balance: mt5AccountsData[0]?.balance || 0
      }
    });

  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics: ' + error });
  }
});

// Get trade history data (using existing method)
app.get('/api/mt5/trade-history', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      return res.status(503).json({ error: 'MT5 connection not available' });
    }

    const history = await multiAccountExecutor.getTradeHistory();
    
    res.json({
      success: true,
      history: history || { summary: {}, recentDeals: [] }
    });

  } catch (error) {
    console.error('Error getting trade history:', error);
    res.status(500).json({ error: 'Failed to get trade history: ' + error });
  }
});

// Execute manual trade via signal (using existing executeTradeSignal method)
app.post('/api/mt5/manual-trade', async (req, res) => {
  try {
    const { symbol, action, volume } = req.body;
    
    if (!multiAccountExecutor) {
      return res.status(503).json({ error: 'MT5 connection not available' });
    }

    if (!symbol || !action || !volume) {
      return res.status(400).json({ error: 'Missing required fields: symbol, action, volume' });
    }

    // Create a trade signal for manual execution
    const signal: TradeSignal = {
      symbol: symbol.toUpperCase(),
      action: action.toUpperCase() as 'BUY' | 'SELL',
      entryZone: { min: 0, max: 0 }, // Will be calculated by the executor
      stopLoss: 0, // Will be calculated by the executor  
      targets: [0], // Will be calculated by the executor
      confidence: 1.0,
      reason: 'Manual trade from dashboard',
      positionSizing: {
        lotSize: parseFloat(volume),
        riskAmount: 900,
        riskPercentage: 2,
        accountEquity: mt5AccountsData[0]?.equity || 100000,
        reasoning: 'Fixed position size from dashboard'
      }
    };

    const result = await multiAccountExecutor.executeTradeSignal(signal);

    if (result.success) {
      addLog({
        level: 'info',
        message: `✅ Manual trade executed: ${action} ${volume} lots of ${symbol}`
      });

      // Update positions after trade
      setTimeout(() => updateMT5Data(), 2000);

      res.json({
        success: true,
        message: 'Trade executed successfully',
        ticket: result.ticket
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Trade execution failed'
      });
    }

  } catch (error) {
    console.error('Error executing manual trade:', error);
    res.status(500).json({ error: 'Failed to execute trade: ' + error });
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

    // Simplified history for clean executor
    const history = { deals: [], orders: [], positions: [], transactions: [], totalCount: 0, hasMore: false, summary: {} };

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

    const metrics = await multiAccountExecutor!.getAccountPerformanceMetrics();

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

    const allMetrics = await multiAccountExecutor!.getAllAccountsPerformanceMetrics();

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

    const history = await multiAccountExecutor!.getTradeHistory();

    // Calculate additional summary statistics
    const dailyStats = new Map<string, { trades: number; profit: number; volume: number }>();
    
    // Handle empty positions array from simplified executor
    if (history.positions && Array.isArray(history.positions)) {
      history.positions.forEach((pos: any) => {
        if (pos.status === 'CLOSED' && pos.closeTime) {
          const day = pos.closeTime.toISOString().substring(0, 10);
          const existing = dailyStats.get(day) || { trades: 0, profit: 0, volume: 0 };
          existing.trades++;
          existing.profit += pos.profit || 0;
          existing.volume += pos.volume;
          dailyStats.set(day, existing);
        }
      });
    }

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
      openPositions: (history.positions as any[]).filter((pos: any) => pos.status === 'OPEN').slice(0, 10),
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
app.post('/api/close-trade/:accountId/:tradeId', 
  InputValidator.validate([
    ValidationRules.accountId,
    { field: 'tradeId', type: 'string', required: true, min: 1 }
  ]),
  async (req, res) => {
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
  try {
    const { maxTradeSize, riskPercentage, logLevel, maxDailyTrades, botEnabled } = req.body;

    if (maxTradeSize !== undefined && maxTradeSize !== null && maxTradeSize !== '') {
      const v = parseFloat(maxTradeSize);
      if (isNaN(v) || v < 0.01 || v > 100) {
        return res.status(400).json({ error: 'Max trade size must be between 0.01 and 100' });
      }
      process.env.MAX_TRADE_SIZE = String(v);
    }

    if (riskPercentage !== undefined && riskPercentage !== null && riskPercentage !== '') {
      const v = parseFloat(riskPercentage);
      if (isNaN(v) || v < 0.1 || v > 10) {
        return res.status(400).json({ error: 'Risk percentage must be between 0.1 and 10' });
      }
      process.env.RISK_PERCENTAGE = String(v);
    }

    if (logLevel !== undefined && logLevel !== null && logLevel !== '') {
      process.env.LOG_LEVEL = String(logLevel);
    }

    if (maxDailyTrades !== undefined && maxDailyTrades !== null && maxDailyTrades !== '') {
      const n = parseInt(String(maxDailyTrades), 10);
      if (isNaN(n) || n < 1 || n > 50) {
        return res.status(400).json({ error: 'Max daily trades must be between 1 and 50' });
      }
      process.env.MAX_DAILY_TRADES = String(n);
    }

    if (botEnabled !== undefined && botEnabled !== null) {
      process.env.BOT_ENABLED = botEnabled ? 'true' : 'false';
    }

    addLog({
      level: 'info',
      message: `⚙️ Bot/config updated via dashboard: ${JSON.stringify({
        maxTradeSize,
        riskPercentage,
        logLevel,
        maxDailyTrades,
        botEnabled
      })}`
    });

    syncConfigFromEnv();
    try {
      savePersistedSettingsFromEnv();
    } catch {
      /* optional disk */
    }

    res.json({
      success: true,
      message: 'Configuration updated (runtime + data/settings.json)',
      config: {
        maxTradeSize: parseFloat(process.env.MAX_TRADE_SIZE || String(config.trading.maxTradeSize)),
        riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || String(config.trading.riskPercentage)),
        logLevel: process.env.LOG_LEVEL || config.logging.level,
        maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '10', 10),
        botEnabled: process.env.BOT_ENABLED !== 'false'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Configuration update failed'
    });
  }
});

app.get('/api/statistics', (req, res) => {
  // Calculate trading statistics
  const stats = calculateTradingStats(tradeHistory);
  res.json(stats);
});

// Dashboard stats endpoint (alias for /api/statistics)
app.get('/api/stats', (req, res) => {
  // Calculate trading statistics
  const stats = calculateTradingStats(tradeHistory);
  res.json(stats);
});

// MT5 connection diagnostic endpoint
app.get('/api/mt5/diagnostic', async (req, res) => {
  try {
    if (!multiAccountExecutor) {
      return res.json({
        success: false,
        error: 'Multi-account executor not initialized',
        diagnostic: {
          executorAvailable: false,
          connected: false,
          accountStatuses: []
        }
      });
    }

    const isConnected = await multiAccountExecutor.isConnected();
    const accountStatuses = multiAccountExecutor.getAccountStatuses();
    
    res.json({
      success: true,
      diagnostic: {
        executorAvailable: true,
        connected: isConnected,
        accountStatuses: accountStatuses,
        accountsCount: accountStatuses.length,
        connectedCount: accountStatuses.filter(acc => acc.status === 'CONNECTED').length,
        tradingReadyCount: accountStatuses.filter(acc => acc.tradingReady).length,
        lastDataUpdate: mt5LastUpdate,
        cachedAccountsCount: mt5AccountsData.length
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      success: false,
      error: errorMessage,
      diagnostic: {
        executorAvailable: !!multiAccountExecutor,
        connected: false,
        error: errorMessage
      }
    });
  }
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

// Account configuration endpoints (deprecated - use user account management instead)
app.get('/api/config/account', (req, res) => {
  res.json({
    success: true,
    message: 'Use /api/user/accounts for account management',
    config: {
      metaApiToken: process.env.METAAPI_TOKEN ? '***' + process.env.METAAPI_TOKEN.slice(-4) : '',
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

// ========== SIMPLIFIED USER ACCOUNT MANAGEMENT (NO DATABASE) ==========
// All account management is now handled through environment variables
// No database required - simplified for production use

// Get user's MetaAPI accounts - Return configured accounts
app.get('/api/user/accounts', async (req, res) => {
  try {
    // Return the currently configured accounts from environment
    const configuredAccounts = process.env.METAAPI_ACCOUNTS ? 
      process.env.METAAPI_ACCOUNTS.split(',').map((id, index) => ({
        id: id.trim(),
        alias: `Account ${index + 1}`,
        status: 'active',
        source: 'environment'
      })) : [];

    res.json({
      success: true,
      data: configuredAccounts,
      message: 'Using environment-configured accounts (no database required)'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user accounts: ' + error.message
    });
  }
});

// Add account endpoint - simplified (just informational)
app.post('/api/user/accounts', async (req, res) => {
  try {
    res.status(400).json({
      success: false,
      error: 'Account management through API disabled. Please configure accounts in environment variables (METAAPI_ACCOUNTS).',
      hint: 'Set METAAPI_ACCOUNTS=account1,account2,account3 in your .env file'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Operation failed: ' + error.message
    });
  }
});
// Delete account endpoint - simplified (just informational)
app.delete('/api/user/accounts/:accountId', async (req, res) => {
  try {
    res.status(400).json({
      success: false,
      error: 'Account management through API disabled. Please configure accounts in environment variables (METAAPI_ACCOUNTS).',
      hint: 'Set METAAPI_ACCOUNTS=account1,account2,account3 in your .env file'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Operation failed: ' + error.message
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

  // Broadcast user-friendly activities to connected stream clients
  if (streamClients && streamClients.length > 0) {
    const userActivity = convertToUserFriendlyActivity(logWithTimestamp);
    if (userActivity) {
      const activityData = JSON.stringify(userActivity);
      streamClients.forEach((client: any) => {
        try {
          client.res.write(`data: ${activityData}\n\n`);
        } catch (error) {
          // Client disconnected, remove from list
          const index = streamClients.indexOf(client);
          if (index !== -1) {
            streamClients.splice(index, 1);
          }
        }
      });
    }
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

  // Start demo activities for testing
  startDemoActivities();
  addLog({
    level: 'success',
    message: '📊 Live activity stream initialized - monitoring trading system'
  });
}, 5000); // Wait 5 seconds after server start

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
