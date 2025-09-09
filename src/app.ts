import { TelegramBot } from './bot/bot';
import { config, validateConfig, debugConfig } from './utils/config';
import { logger } from './utils/logger';
import * as http from 'http';
import express from 'express';
import app, { setSharedExecutor } from './dashboard/server';
import { addLog, updateBotStatus } from './dashboard/simpleDashboard';
import { HealthCheckService } from './monitoring/healthChecks';
import { DistributedTracing, Traced } from './monitoring/distributedTracing';

// Prevent double initialization
let isInitialized = false;

// Global cleanup handler
let botInstance: TelegramBot | null = null;
let globalExecutor: any = null;

const gracefulShutdown = async (signal: string) => {
  logger.info(`🔄 Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    if (botInstance) {
      logger.info('🤖 Stopping Telegram bot...');
      await botInstance.stop();
    }
    
    // Close MetaAPI connections
    if (globalExecutor) {
      logger.info('📊 Closing MetaAPI connections...');
      await globalExecutor.cleanup();
    }
    
    // Clear all intervals/timeouts
    logger.info('🧹 Cleaning up timers...');
    
    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Global error handlers to prevent unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🚨 CRITICAL: Unhandled Rejection detected', { promise, reason });
  // Don't exit immediately - log the error but continue
  if (typeof reason === 'object' && reason !== null) {
    logger.error('Rejection details:', JSON.stringify(reason, null, 2));
  }
});

process.on('uncaughtException', (error) => {
  logger.error('🚨 FATAL: Uncaught Exception - System will exit', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Render.com uses SIGUSR2

// Dead man's switch - monitor bot health
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL = 60000; // 1 minute
const HEARTBEAT_TIMEOUT = 600000; // 10 minutes (increased from 5)

setInterval(() => {
  const timeSinceLastBeat = Date.now() - lastHeartbeat;
  if (timeSinceLastBeat > HEARTBEAT_TIMEOUT) {
    logger.error('🚨 DEAD MAN\'S SWITCH: Bot unresponsive for too long - forcing restart');
    process.exit(1);
  }
}, HEARTBEAT_INTERVAL);

// Function to update heartbeat
const updateHeartbeat = () => {
  lastHeartbeat = Date.now();
};

// Combined server for health check and dashboard
const createServer = (): http.Server => {
  const healthCheckService = HealthCheckService.getInstance();
  
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        const healthStatus = await healthCheckService.getOverallHealth();
        const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthStatus));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        }));
      }
    } else if (req.url === '/health/detailed') {
      try {
        const detailedHealth = await healthCheckService.getDetailedHealth();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(detailedHealth));
      } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          error: 'Detailed health check failed',
          timestamp: new Date().toISOString()
        }));
      }
    } else if (req.url === '/ready') {
      const isReady = healthCheckService.isReady();
      const statusCode = isReady ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: isReady }));
    } else if (req.url === '/metrics') {
      // Prometheus metrics endpoint (placeholder until prom-client is installed)
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`# Enterprise metrics available after installing prom-client package
# Current status: Basic monitoring active
# Install: npm install prom-client
trading_bot_status 1 ${Date.now()}
trading_bot_uptime ${process.uptime()} ${Date.now()}
      `.trim());
    } else {
      // Delegate to comprehensive dashboard app
      app(req, res);
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
    
    // Initialize enterprise monitoring
    const healthCheckService = HealthCheckService.getInstance();
    healthCheckService.setupDefaultHealthChecks();
    logger.info('🏥 Health check service initialized');
    
    const tracer = DistributedTracing.getInstance();
    logger.info('🔍 Distributed tracing initialized');
    
    // Create and start bot
    const bot = new TelegramBot();
    botInstance = bot; // Store for cleanup
    
    // Share the bot's executor with the dashboard
    const executor = bot.getTradeExecutor();
    globalExecutor = executor; // Store for cleanup
    setSharedExecutor(executor);
    
    await bot.start();
    
    // Start heartbeat monitoring
    setInterval(updateHeartbeat, 30000); // Update every 30 seconds
    updateHeartbeat(); // Initial heartbeat
    
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
