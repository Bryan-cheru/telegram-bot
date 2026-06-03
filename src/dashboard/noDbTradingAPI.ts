import express from 'express';
import { logger } from '../utils/logger';
import MetaApi from 'metaapi.cloud-sdk';
import { MetaStatsService } from '../services/MetaStatsService';
const router = express.Router();

// In-memory storage for connected accounts (no database needed)
interface ConnectedAccount {
  metaApiToken: string;
  accountId: string;
  alias?: string;
  connection?: any;
  addedAt: Date;
}

let connectedAccounts: Map<string, ConnectedAccount> = new Map();
const metaApi = new MetaApi(process.env.METAAPI_TOKEN!);
const metaStatsService = new MetaStatsService();

// Rate limiter to prevent log spam
const lastLogTime = new Map<string, number>();
const LOG_THROTTLE_MS = 10000; // Only log once every 10 seconds per account

// Rate limiter for logs to prevent spam
const logRateLimiter = new Map<string, number>();
const LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes

function shouldLog(key: string): boolean {
  const now = Date.now();
  const lastLog = logRateLimiter.get(key) || 0;
  if (now - lastLog > LOG_INTERVAL) {
    logRateLimiter.set(key, now);
    return true;
  }
  return false;
}

/**
 * SIMPLIFIED API ENDPOINTS - No database, just direct MetaAPI connections
 * Perfect for signal channel business model
 */

// System status endpoint with enhanced metrics
router.get('/status', async (req: any, res: any) => {
  try {
    const totalAccounts = connectedAccounts.size;
    const connectedCount = Array.from(connectedAccounts.values())
      .filter(acc => acc.connection && acc.connection.connected).length;

    res.json({
      success: true,
      data: {
        online: true,
        systemStatus: 'Running',
        totalAccounts,
        connectedAccounts: connectedCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// MetaStats - Get account performance metrics
router.get('/metastats/:accountId/metrics', async (req: any, res: any) => {
  try {
    const { accountId } = req.params;
    const { from, to, includeOpen } = req.query;

    const options: any = {};
    if (from) options.from = new Date(from);
    if (to) options.to = new Date(to);
    if (includeOpen) options.includeOpenPositions = includeOpen === 'true';

    const metrics = await metaStatsService.getAccountMetrics(accountId, options);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Error getting MetaStats metrics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve metrics'
    });
  }
});

// MetaStats - Get performance summary (dashboard)
router.get('/metastats/:accountId/summary', async (req: any, res: any) => {
  try {
    const { accountId } = req.params;
    
    const summary = await metaStatsService.getPerformanceSummary(accountId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting MetaStats summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve performance summary'
    });
  }
});

// MetaStats - Get historical trades
router.get('/metastats/:accountId/trades', async (req: any, res: any) => {
  try {
    const { accountId } = req.params;
    const { from, to, limit, offset } = req.query;

    const options: any = {};
    if (from) options.from = new Date(from);
    if (to) options.to = new Date(to);
    if (limit) options.limit = parseInt(limit);
    if (offset) options.offset = parseInt(offset);

    const trades = await metaStatsService.getHistoricalTrades(accountId, options);
    
    res.json({
      success: true,
      data: trades
    });
  } catch (error) {
    logger.error('Error getting historical trades:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve trades'
    });
  }
});

// Add new trading account - Direct MetaAPI connection
router.post('/add-account', async (req: any, res: any) => {
  try {
    const { metaApiToken, alias } = req.body;

    if (!metaApiToken) {
      return res.status(400).json({
        success: false,
        error: 'MetaAPI account ID is required'
      });
    }

    // Check if account already connected
    if (connectedAccounts.has(metaApiToken)) {
      return res.status(400).json({
        success: false,
        error: 'Account already connected'
      });
    }

    try {
      // The metaApiToken from frontend is actually the accountId in MetaAPI
      const account = await metaApi.metatraderAccountApi.getAccount(metaApiToken);
      
      if (!account) {
        return res.status(400).json({
          success: false,
          error: 'Invalid MetaAPI account ID'
        });
      }

      // Wait for account to be connected to broker
      logger.info(`Waiting for account ${metaApiToken} to connect to broker...`);
      await account.waitConnected();
      
      // Use RPC connection for account information (works without MT5 terminal)
      const connection = account.getRPCConnection();
      await connection.connect();
      
      // Try to wait for synchronization, but continue even if it fails
      try {
        logger.info(`Synchronizing account ${metaApiToken}...`);
        await connection.waitSynchronized();
        logger.info(`Account ${metaApiToken} synchronized successfully`);
      } catch (syncError) {
        logger.warn(`Account ${metaApiToken} synchronization failed (terminal may be offline):`, syncError);
        // Continue anyway - RPC methods still work
      }

      // Store in memory
      const connectedAccount: ConnectedAccount = {
        metaApiToken,
        accountId: metaApiToken,
        alias: alias || `Account ${account.name || metaApiToken.substring(0, 8)}`,
        connection,
        addedAt: new Date()
      };

      connectedAccounts.set(metaApiToken, connectedAccount);

      res.status(201).json({
        success: true,
        data: {
          accountId: metaApiToken,
          alias: connectedAccount.alias,
          status: 'connected'
        }
      });

    } catch (metaApiError) {
      logger.error('MetaAPI connection error:', metaApiError);
      return res.status(400).json({
        success: false,
        error: 'Failed to connect to MetaAPI account. Please check your account ID.'
      });
    }

  } catch (error) {
    logger.error('Error adding account:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all connected accounts - Direct from MetaAPI
router.get('/accounts', async (req: any, res: any) => {
  try {
    const accountsSummary = [];

    for (const [accountId, connectedAccount] of connectedAccounts) {
      try {
        let accountInfo: any = {
          accountId: connectedAccount.accountId,
          alias: connectedAccount.alias,
          isConnected: false,
          balance: 0,
          equity: 0,
          margin: 0,
          positionsCount: 0,
          addedAt: connectedAccount.addedAt
        };

        if (connectedAccount.connection) {
          try {
            logger.info(`Getting account information for ${accountId}...`);
            
            let balance = 0;
            let equity = 0;
            let margin = 0;
            let positionsCount = 0;
            
            // Use RPC API to get account information (works without terminal)
            try {
              const accountInformation = await connectedAccount.connection.getAccountInformation();
              
              if (accountInformation) {
                balance = accountInformation.balance || 0;
                equity = accountInformation.equity || 0;
                margin = accountInformation.margin || 0;
                
                // Only log occasionally to avoid spam
                if (shouldLog(`balance_${accountId}`)) {
                  logger.info(`Account ${accountId} - Balance: $${balance}, Equity: $${equity}, Margin: $${margin}`);
                  addSystemLog('info', `Account ${accountId.substring(0,8)}... - Balance: $${balance.toLocaleString()}, Equity: $${equity.toLocaleString()}`, 'METAAPI');
                }
              } else {
                logger.warn(`No account information returned for ${accountId}`);
                addSystemLog('warn', `No account information returned for ${accountId.substring(0,8)}...`, 'METAAPI');
              }
            } catch (apiError) {
              logger.error(`Failed to get account info for ${accountId}:`, apiError);
              addSystemLog('error', `Failed to get account info for ${accountId.substring(0,8)}...: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`, 'METAAPI');
              
              // Log the error details for debugging
              if (apiError instanceof Error) {
                logger.error(`Error message: ${apiError.message}`);
                logger.error(`Error stack: ${apiError.stack}`);
              }
            }

            // Try to get positions
            try {
              const positions = await connectedAccount.connection.getPositions();
              positionsCount = positions ? positions.length : 0;
              
              // Only log occasionally to avoid spam
              if (shouldLog(`positions_${accountId}`)) {
                logger.info(`Account ${accountId} has ${positionsCount} positions`);
                addSystemLog('info', `Account ${accountId.substring(0,8)}... has ${positionsCount} active positions`, 'TRADING');
              }
            } catch (posError) {
              logger.warn(`Could not get positions for ${accountId}:`, posError);
              addSystemLog('warn', `Could not get positions for ${accountId.substring(0,8)}...: ${posError instanceof Error ? posError.message : 'Unknown error'}`, 'TRADING');
            }
            
            // Update account info with fetched data
            accountInfo = {
              ...accountInfo,
              isConnected: connectedAccount.connection.connected || false,
              balance,
              equity,
              margin,
              positionsCount
            };
            
          } catch (connectionError) {
            logger.error(`Error getting account info for ${accountId}:`, connectionError);
            accountInfo.error = connectionError instanceof Error ? connectionError.message : 'Failed to fetch account data';
          }
        }

        accountsSummary.push(accountInfo);
      } catch (error) {
        logger.error(`Error processing account ${accountId}:`, error);
        accountsSummary.push({
          accountId,
          alias: connectedAccount.alias,
          isConnected: false,
          balance: 0,
          equity: 0,
          positionsCount: 0,
          error: 'Connection failed'
        });
      }
    }

    res.json({
      success: true,
      data: accountsSummary
    });

  } catch (error) {
    logger.error('Error getting accounts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear all connected accounts (for testing)
router.delete('/accounts', async (req: any, res: any) => {
  try {
    // Disconnect all connections
    for (const [accountId, account] of connectedAccounts) {
      try {
        if (account.connection) {
          await account.connection.close();
        }
      } catch (error) {
        logger.warn(`Error closing connection for ${accountId}:`, error);
      }
    }
    
    // Clear the map
    connectedAccounts.clear();
    
    res.json({
      success: true,
      message: 'All accounts cleared'
    });
  } catch (error) {
    logger.error('Error clearing accounts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get positions for all accounts - Direct from MetaAPI
router.get('/positions', async (req: any, res: any) => {
  try {
    const allPositions = [];

    for (const [accountId, connectedAccount] of connectedAccounts) {
      try {
        if (connectedAccount.connection && connectedAccount.connection.connected) {
          const positions = connectedAccount.connection.terminalState.positions || [];
          
          const formattedPositions = positions.map((pos: any) => ({
            id: pos.id,
            accountId: accountId,
            symbol: pos.symbol,
            type: pos.type,
            volume: pos.volume,
            openPrice: pos.openPrice,
            currentPrice: pos.currentPrice,
            unrealizedProfit: pos.unrealizedProfit,
            openTime: pos.time
          }));

          allPositions.push(...formattedPositions);
        }
      } catch (error) {
        logger.error(`Error getting positions for ${accountId}:`, error);
      }
    }

    res.json({
      success: true,
      data: allPositions
    });

  } catch (error) {
    logger.error('Error getting positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Remove account
router.delete('/accounts/:accountId', async (req: any, res: any) => {
  try {
    const { accountId } = req.params;

    if (!connectedAccounts.has(accountId)) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const account = connectedAccounts.get(accountId);
    
    // Disconnect if connected
    if (account && account.connection) {
      try {
        await account.connection.close();
      } catch (error) {
        logger.error('Error closing connection:', error);
      }
    }

    // Remove from memory
    connectedAccounts.delete(accountId);

    res.json({
      success: true,
      message: 'Account removed successfully'
    });

  } catch (error) {
    logger.error('Error removing account:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Close position
router.post('/positions/:positionId/close', async (req: any, res: any) => {
  try {
    const { positionId } = req.params;

    // Find which account has this position
    for (const [accountId, connectedAccount] of connectedAccounts) {
      if (connectedAccount.connection && connectedAccount.connection.connected) {
        const positions = connectedAccount.connection.terminalState.positions || [];
        const position = positions.find((p: any) => p.id === positionId);
        
        if (position) {
          // Close the position
          await connectedAccount.connection.closeTrade(positionId);
          
          return res.json({
            success: true,
            message: 'Position closed successfully'
          });
        }
      }
    }

    res.status(404).json({
      success: false,
      error: 'Position not found'
    });

  } catch (error) {
    logger.error('Error closing position:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Refresh account
router.post('/accounts/:accountId/refresh', async (req: any, res: any) => {
  try {
    const { accountId } = req.params;

    if (!connectedAccounts.has(accountId)) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const account = connectedAccounts.get(accountId)!;
    
    if (account.connection) {
      // Trigger a refresh
      await account.connection.synchronize();
    }

    res.json({
      success: true,
      message: 'Account refreshed successfully'
    });

  } catch (error) {
    logger.error('Error refreshing account:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get trade history - Simple implementation
router.get('/history', async (req: any, res: any) => {
  try {
    const { limit = 100 } = req.query;
    
    // For now, return empty history as we don't have historical trades stored
    // In a production system, you might want to fetch this from MetaAPI history
    res.json({
      success: true,
      data: []
    });

  } catch (error) {
    logger.error('Error getting trade history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== RISK MANAGEMENT ENDPOINTS ====================
// In-memory only — MetaAPI RiskManagement SDK not available in v13

interface RiskTracker {
  id: string;
  accountId: string;
  name: string;
  period: 'day' | 'week' | 'month' | 'lifetime';
  absoluteDrawdownThreshold?: number;
  relativeDrawdownThreshold?: number;
  profitTarget?: number;
  relativeProfitTarget?: number;
  status: 'active' | 'violated' | 'completed';
  createdAt: Date;
}

interface RiskEvent {
  id: string;
  trackerId: string;
  type: 'drawdown_violation' | 'profit_target_hit' | 'tracker_created' | 'tracker_completed';
  message: string;
  timestamp: Date;
  data?: any;
}

let riskTrackers: Map<string, RiskTracker> = new Map();
let riskEvents: RiskEvent[] = [];

router.get('/risk-trackers', (req: any, res: any) => {
  const trackers = Array.from(riskTrackers.values()).map(t => ({
    ...t, currentDrawdown: 0, currentProfit: 0, progressPercent: 0
  }));
  res.json({ success: true, data: trackers });
});

router.post('/risk-trackers', (req: any, res: any) => {
  const { name, accountId, period, absoluteDrawdownThreshold, relativeDrawdownThreshold, profitTarget, relativeProfitTarget } = req.body;
  if (!name || !accountId || !period) {
    return res.status(400).json({ success: false, error: 'Name, accountId, and period are required' });
  }
  const trackerId = Date.now().toString();
  const tracker: RiskTracker = {
    id: trackerId, accountId, name, period,
    absoluteDrawdownThreshold, relativeDrawdownThreshold, profitTarget, relativeProfitTarget,
    status: 'active', createdAt: new Date()
  };
  riskTrackers.set(trackerId, tracker);
  riskEvents.unshift({ id: Date.now().toString(), trackerId, type: 'tracker_created', message: `Tracker "${name}" created`, timestamp: new Date() });
  res.status(201).json({ success: true, data: tracker });
});

router.delete('/risk-trackers/:trackerId', (req: any, res: any) => {
  const { trackerId } = req.params;
  const tracker = riskTrackers.get(trackerId);
  if (!tracker) return res.status(404).json({ success: false, error: 'Tracker not found' });
  riskTrackers.delete(trackerId);
  riskEvents.unshift({ id: Date.now().toString(), trackerId, type: 'tracker_completed', message: `Tracker "${tracker.name}" deleted`, timestamp: new Date() });
  res.json({ success: true, message: 'Tracker deleted' });
});

router.get('/risk-events', (req: any, res: any) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ success: true, data: riskEvents.slice(0, limit) });
});

router.delete('/risk-events', (req: any, res: any) => {
  riskEvents = [];
  res.json({ success: true, message: 'Risk events cleared' });
});

router.get('/risk-statistics', async (req: any, res: any) => {
  try {
    let maxDrawdown = 0;
    let totalPnL = 0;
    for (const account of connectedAccounts.values()) {
      try {
        if (account.connection && account.connection.connected) {
          const info = await account.connection.getAccountInformation();
          if (info) {
            totalPnL += info.equity - info.balance;
            maxDrawdown = Math.max(maxDrawdown, Math.max(0, info.balance - info.equity));
          }
        }
      } catch { /* skip unreachable accounts */ }
    }
    res.json({
      success: true,
      data: {
        activeTrackers: Array.from(riskTrackers.values()).filter(t => t.status === 'active').length,
        targetsHit: Array.from(riskTrackers.values()).filter(t => t.status === 'completed').length,
        violations: Array.from(riskTrackers.values()).filter(t => t.status === 'violated').length,
        maxDrawdown,
        totalPnL
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/equity-chart/:accountId', (req: any, res: any) => {
  res.json({ success: true, data: [] });
});

// In-memory logs storage for dashboard
interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  source?: string;
}

let systemLogs: LogEntry[] = [];
const MAX_LOGS = 1000;

// Add log entry function
export function addSystemLog(level: LogEntry['level'], message: string, source?: string) {
  const logEntry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    level,
    message,
    source: source || 'SYSTEM'
  };
  
  systemLogs.unshift(logEntry); // Add to beginning
  
  // Keep only the latest logs
  if (systemLogs.length > MAX_LOGS) {
    systemLogs = systemLogs.splice(0, MAX_LOGS);
  }
  
  // Also log to console/file
  logger.info(`[${level.toUpperCase()}] ${message}`, { source });
}

// Get system logs endpoint
router.get('/logs', async (req: any, res: any) => {
  try {
    const { level, limit = 100, offset = 0 } = req.query;
    
    let filteredLogs = systemLogs;
    
    // Filter by level if specified
    if (level && level !== 'all') {
      filteredLogs = systemLogs.filter(log => log.level === level);
    }
    
    // Apply pagination
    const paginatedLogs = filteredLogs.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        total: filteredLogs.length,
        hasMore: filteredLogs.length > (offset + parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Initialize with some system logs
addSystemLog('success', 'Trading API server initialized successfully');
addSystemLog('info', 'Dashboard endpoints registered');
addSystemLog('info', 'Real-time logging system active');

export default router;