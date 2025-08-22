import { TelegramBot } from './bot/bot';
import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Global health status
let healthStatus = {
  status: 'starting',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  version: '1.0.0',
  bot: 'not_started',
  config: 'not_validated'
};

// Function to get real trades data from files
function getRealTradesData() {
  const trades: any[] = [];
  
  try {
    // Read pending trades
    const pendingTradesPath = path.join(__dirname, '..', 'trade_signals');
    if (fs.existsSync(pendingTradesPath)) {
      const pendingFiles = fs.readdirSync(pendingTradesPath)
        .filter(file => file.endsWith('.json') && file.startsWith('trade_'));
      
      for (const file of pendingFiles) {
        try {
          const filePath = path.join(pendingTradesPath, file);
          const tradeData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          trades.push({
            id: tradeData.id,
            symbol: tradeData.signal?.symbol || 'N/A',
            action: tradeData.signal?.action || 'N/A',
            status: tradeData.status || 'pending',
            entry: tradeData.signal?.entryZone?.min || null,
            exit: null,
            profit: null,
            timestamp: tradeData.timestamp,
            stopLoss: tradeData.signal?.stopLoss || null,
            targets: tradeData.signal?.targets || [],
            volume: tradeData.volume || 0,
            reason: tradeData.signal?.reason || ''
          });
        } catch (error) {
          logger.error(`Error reading trade file ${file}:`, error);
        }
      }
    }
    
    // Read executed trades
    const executedTradesPath = path.join(__dirname, '..', 'MT5_Files', 'MQL5', 'Files', 'trade_signals', 'executed');
    if (fs.existsSync(executedTradesPath)) {
      const executedFiles = fs.readdirSync(executedTradesPath)
        .filter(file => file.endsWith('.json') && file.startsWith('trade_'));
      
      for (const file of executedFiles) {
        try {
          const filePath = path.join(executedTradesPath, file);
          const tradeData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          trades.push({
            id: tradeData.id,
            symbol: tradeData.signal?.symbol || 'N/A',
            action: tradeData.signal?.action || 'N/A',
            status: tradeData.status || 'executed',
            entry: tradeData.signal?.entryZone?.min || null,
            exit: null, // This would need to come from MetaAPI trade history
            profit: null, // This would need to come from MetaAPI trade history
            timestamp: tradeData.timestamp,
            executedAt: tradeData.executedAt,
            stopLoss: tradeData.signal?.stopLoss || null,
            targets: tradeData.signal?.targets || [],
            volume: tradeData.volume || 0,
            reason: tradeData.signal?.reason || ''
          });
        } catch (error) {
          logger.error(`Error reading executed trade file ${file}:`, error);
        }
      }
    }
    
    // Sort by timestamp (newest first)
    trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return trades;
  } catch (error) {
    logger.error('Error getting trades data:', error);
    return [];
  }
}

// Function to calculate trade statistics
function calculateTradeStats(trades: any[]) {
  const totalTrades = trades.length;
  const executedTrades = trades.filter(t => t.status === 'executed').length;
  const pendingTrades = trades.filter(t => t.status === 'pending').length;
  
  return {
    totalTrades,
    executedTrades,
    pendingTrades,
    executionRate: totalTrades > 0 ? ((executedTrades / totalTrades) * 100).toFixed(1) : '0.0',
    totalVolume: trades.reduce((sum, trade) => sum + (trade.volume || 0), 0).toFixed(2),
    symbols: [...new Set(trades.map(t => t.symbol))].filter(s => s !== 'N/A')
  };
}

// Health check server for Railway - starts immediately
const createHealthServer = (): http.Server => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    if (req.url === '/health') {
      // Always return 200 if the server is running
      res.writeHead(200);
      res.end(JSON.stringify({
        ...healthStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }));
    } else if (req.url === '/trades') {
      // Return real trades data
      try {
        const trades = getRealTradesData();
        res.writeHead(200);
        res.end(JSON.stringify({ trades, total: trades.length }));
      } catch (error) {
        logger.error('Error fetching trades data:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to fetch trades data' }));
      }
    } else if (req.url === '/stats') {
      // Return trading statistics
      try {
        const trades = getRealTradesData();
        const stats = calculateTradeStats(trades);
        res.writeHead(200);
        res.end(JSON.stringify(stats));
      } catch (error) {
        logger.error('Error calculating stats:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to calculate stats' }));
      }
    } else if (req.url === '/accounts') {
      // Return MetaAPI accounts status
      try {
        const accountsStatus = [];
        for (const account of config.metaApiAccounts) {
          accountsStatus.push({
            accountId: account.accountId,
            name: account.name || account.accountId,
            riskPercentage: account.riskPercentage || 2,
            maxTradeSize: account.maxTradeSize || 0.1,
            // Note: Connection status would require the trade executor instance
            connected: false
          });
        }
        res.writeHead(200);
        res.end(JSON.stringify({ 
          accounts: accountsStatus, 
          total: accountsStatus.length,
          strategy: config.trading.accountSelectionStrategy 
        }));
      } catch (error) {
        logger.error('Error fetching accounts:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to fetch accounts' }));
      }
    } else if (req.url === '/') {
      res.writeHead(200);
      res.end(JSON.stringify({ message: 'Telegram Trading Bot API', version: '1.0.0' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });
  
  const port = process.env.PORT || 3000;
  server.listen(Number(port), () => {
    logger.info(`Health check server running on port ${port}`);
    healthStatus.status = 'server_ready';
  });
  
  server.on('error', (error) => {
    logger.error('Health server error:', error);
    healthStatus.status = 'server_error';
  });
  
  return server;
};

// Start health server immediately
logger.info('Starting health check server...');
const healthServer = createHealthServer();

async function main(): Promise<void> {
  try {
    logger.info('Starting Telegram Trading Bot...');
    healthStatus.status = 'initializing';
    
    // Validate configuration
    if (!validateConfig()) {
      logger.error('Invalid configuration. Please check your environment variables.');
      healthStatus.status = 'config_error';
      healthStatus.config = 'failed';
      // Don't exit immediately - let health check show the error
      setTimeout(() => process.exit(1), 5000);
      return;
    }
    
    healthStatus.config = 'validated';
    logger.info('Configuration validated successfully');
    
    // Create and start bot
    const bot = new TelegramBot();
    await bot.start();
    
    healthStatus.status = 'healthy';
    healthStatus.bot = 'running';
    logger.info('Bot is running. Press Ctrl+C to stop.');
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      healthStatus.status = 'shutting_down';
      healthServer.close();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      healthStatus.status = 'shutting_down';
      healthServer.close();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start application:', error);
    healthStatus.status = 'error';
    healthStatus.bot = 'failed';
    // Keep health server running to show error status
    setTimeout(() => process.exit(1), 5000);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  healthStatus.status = 'error';
  setTimeout(() => process.exit(1), 2000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  healthStatus.status = 'error';
  setTimeout(() => process.exit(1), 2000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main();
