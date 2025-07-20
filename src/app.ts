import { TelegramBot } from './bot/bot';
import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';
import * as http from 'http';

// Health check server for Railway
const createHealthServer = (): http.Server => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
  
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    logger.info(`Health check server running on port ${port}`);
  });
  
  return server;
};

async function main(): Promise<void> {
  try {
    logger.info('Starting Telegram Trading Bot...');
    
    // Start health check server for Railway
    const healthServer = createHealthServer();
    
    // Validate configuration
    if (!validateConfig()) {
      logger.error('Invalid configuration. Please check your environment variables.');
      process.exit(1);
    }
    
    // Create and start bot
    const bot = new TelegramBot();
    await bot.start();
    
    logger.info('Bot is running. Press Ctrl+C to stop.');
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      healthServer.close();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      healthServer.close();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main();
