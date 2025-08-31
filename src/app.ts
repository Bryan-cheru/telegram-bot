import { TelegramBot } from './bot/bot';
import { config, validateConfig, debugConfig } from './utils/config';
import { logger } from './utils/logger';
import * as http from 'http';
import dashboardApp, { updateBotStatus, addLog } from './dashboard/server';

// Prevent double initialization
let isInitialized = false;

// Global error handlers to prevent unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Combined server for health check and dashboard
const createServer = (): http.Server => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.1',
        dashboard: 'available'
      }));
    } else {
      // Delegate to dashboard app
      dashboardApp(req, res);
    }
  });
  
  const port = process.env.PORT || 3000;
  
  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Trying port ${Number(port) + 1}...`);
      server.listen(Number(port) + 1, () => {
        logger.info(`Server running on port ${Number(port) + 1}`);
        logger.info(`Dashboard available at: http://localhost:${Number(port) + 1}`);
        addLog({ level: 'info', message: `Server started on port ${Number(port) + 1}` });
      });
    } else {
      logger.error('Server error:', error);
    }
  });
  
  server.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    logger.info(`Dashboard available at: http://localhost:${port}`);
    addLog({ level: 'info', message: `Server started on port ${port}` });
  });
  
  return server;
};

async function main(): Promise<void> {
  if (isInitialized) {
    logger.warn('Application already initialized, skipping...');
    return;
  }
  isInitialized = true;
  
  try {
    logger.info('Starting Telegram Trading Bot...');
    
    // Start server with health check and dashboard
    const server = createServer();
    
    // Update bot status
    updateBotStatus({
      isRunning: true,
      uptime: Date.now(),
      connections: { telegram: false, metaapi: false }
    });
    
    // Debug configuration before validation
    debugConfig();
    
    // Validate configuration
    if (!validateConfig()) {
      logger.error('Invalid configuration. Please check your environment variables.');
      addLog({ level: 'error', message: 'Invalid configuration detected' });
      process.exit(1);
    }
    
    addLog({ level: 'success', message: 'Configuration validated successfully' });
    
    // Create and start bot
    const bot = new TelegramBot();
    
    await bot.start();
    
    // Update bot status after successful start
    updateBotStatus({
      isRunning: true,
      connections: { telegram: true, metaapi: true }
    });
    
    addLog({ level: 'success', message: 'Telegram bot started successfully' });
    
    logger.info('Bot is running. Press Ctrl+C to stop.');
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      addLog({ level: 'info', message: 'Shutting down gracefully...' });
      server.close();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      addLog({ level: 'info', message: 'Shutting down gracefully...' });
      server.close();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start application:', error);
    addLog({ level: 'error', message: `Failed to start application: ${error}` });
    process.exit(1);
  }
}

// Start the application
main().catch(error => {
  logger.error('Application startup failed:', error);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
