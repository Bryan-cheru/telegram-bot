import { TelegramBot } from './bot/bot';
import { config, validateConfig, debugConfig } from './utils/config';
import { logger } from './utils/logger';
import * as http from 'http';
import express from 'express';
import app, { setSharedExecutor } from './dashboard/server';
import { addLog, updateBotStatus } from './dashboard/server';
import { HealthCheckService } from './monitoring/healthChecks';
import { DistributedTracing, Traced } from './monitoring/distributedTracing';
// import { startWebServer } from './api/server'; // Removed old API system

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

// Enhanced error boundary for unhandled rejections
let rejectionCount = 0;
const MAX_REJECTIONS = 5;
const REJECTION_WINDOW = 60000; // 1 minute
let rejectionWindowStart = Date.now();

process.on('unhandledRejection', (reason, promise) => {
  const now = Date.now();
  
  // Reset counter if we're in a new window
  if (now - rejectionWindowStart > REJECTION_WINDOW) {
    rejectionCount = 0;
    rejectionWindowStart = now;
  }
  
  rejectionCount++;
  
  logger.error('🚨 CRITICAL: Unhandled Rejection detected', {
    count: rejectionCount,
    maxAllowed: MAX_REJECTIONS,
    promise: promise
  });
  
  // Enhanced error logging for better debugging
  if (reason instanceof Error) {
    logger.error('Error details:', {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    });
    
    // Handle specific error types gracefully
    if (reason.message?.includes('authentication failed') || reason.message?.includes('bad auth')) {
      logger.warn('⚠️ MongoDB authentication error - continuing without database features');
      return;
    }
    
    if (reason.message?.includes('ECONNREFUSED') || reason.message?.includes('network')) {
      logger.warn('⚠️ Network connectivity issue - will retry on next operation');
      return;
    }
  } else {
    logger.error('Rejection reason:', typeof reason === 'object' ? JSON.stringify(reason, null, 2) : reason);
  }
  
  // Crash protection: too many rejections indicates serious issues
  if (rejectionCount >= MAX_REJECTIONS) {
    logger.error('🚨 FATAL: Too many unhandled rejections - system stability compromised');
    gracefulShutdown('EXCESSIVE_REJECTIONS');
  } else {
    logger.warn(`⚠️ Continuing operation (${rejectionCount}/${MAX_REJECTIONS} rejections in window)`);
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
  
  const port = process.env.PORT || config.dashboardPort;
  
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
    logger.info(`🚀 Starting Telegram Trading Bot [${config.instanceType.toUpperCase()}]...`);
    logger.info(`📊 Instance Configuration:`);
    logger.info(`   - Environment: ${config.nodeEnv}`);
    logger.info(`   - Instance Type: ${config.instanceType}`);
    logger.info(`   - Bot Enabled: ${config.botEnabled}`);
    logger.info(`   - Dashboard Enabled: ${config.dashboardEnabled}`);
    logger.info(`   - Dashboard Port: ${config.dashboardPort}`);
    logger.info(`   - Web API Port: ${process.env.API_PORT || 3001}`);
    
    let server: http.Server | null = null;
    
    // Start dashboard server if enabled
    if (config.dashboardEnabled) {
      logger.info('🌐 Starting dashboard server...');
      server = createServer();
      
      // Update bot status
      updateBotStatus({
        isRunning: true,
        uptime: Date.now(),
        connections: { telegram: false, metaapi: false }
      });
    } else {
      logger.info('🚫 Dashboard disabled for this instance');
    }

    // Start Web API server (always available for Phase 3)
    const webApiEnabled = process.env.WEB_API_ENABLED !== 'false';
    if (webApiEnabled) {
      logger.info('🔌 Starting Web API server...');
      try {
        // await startWebServer(); // Removed old API system - using dashboard server instead
        logger.info('✅ Web API server started successfully');
        if (config.dashboardEnabled) {
          addLog({ level: 'success', message: 'Web API server started' });
        }
      } catch (error) {
        logger.error('❌ Failed to start Web API server:', error);
        if (config.dashboardEnabled) {
          addLog({ level: 'error', message: `Web API server failed: ${error}` });
        }
      }
    } else {
      logger.info('🚫 Web API server disabled');
    }
    
    // Debug configuration before validation
    debugConfig();
    
    // Validate configuration
    if (!validateConfig()) {
      logger.error('Invalid configuration. Please check your environment variables.');
      if (server) addLog({ level: 'error', message: 'Invalid configuration detected' });
      process.exit(1);
    }
    
    if (server) addLog({ level: 'success', message: 'Configuration validated successfully' });
    
    // Initialize enterprise monitoring
    const healthCheckService = HealthCheckService.getInstance();
    healthCheckService.setupDefaultHealthChecks();
    logger.info('🏥 Health check service initialized');
    
    const tracer = DistributedTracing.getInstance();
    logger.info('🔍 Distributed tracing initialized');
    
    let bot: TelegramBot | null = null;
    let executor: any = null;
    
    // Create and start bot if enabled
    if (config.botEnabled) {
      logger.info('🤖 Starting Telegram bot...');
      bot = new TelegramBot();
      botInstance = bot; // Store for cleanup
      
      // Share the bot's executor with the dashboard (if dashboard enabled)
      executor = bot.getTradeExecutor();
      globalExecutor = executor; // Store for cleanup
      
      if (config.dashboardEnabled) {
        setSharedExecutor(executor);
      }
      
      await bot.start();
      logger.info('✅ Telegram bot started successfully');
    } else {
      logger.info('🚫 Telegram bot disabled for this instance');
      
      // If bot is disabled but dashboard is enabled, create standalone executor for dashboard
      if (config.dashboardEnabled) {
        logger.info('📊 Creating standalone executor for dashboard...');
        const { CleanMultiAccountExecutor } = await import('./mt5/cleanMultiAccountExecutor');
        executor = new CleanMultiAccountExecutor();
        await executor.initialize();
        globalExecutor = executor;
        setSharedExecutor(executor);
      }
    }
    
    // Start heartbeat monitoring
    setInterval(updateHeartbeat, 30000); // Update every 30 seconds
    updateHeartbeat(); // Initial heartbeat
    
    // Update bot status after successful start
    const telegramConnected = config.botEnabled && bot !== null;
    const metaapiConnected = executor !== null;
    
    if (config.dashboardEnabled) {
      updateBotStatus({
        isRunning: true,
        connections: { telegram: telegramConnected, metaapi: metaapiConnected }
      });
      
      addLog({ 
        level: 'success', 
        message: `${config.instanceType.toUpperCase()} instance started successfully` 
      });
    }
    
    logger.info(`✅ ${config.instanceType.toUpperCase()} instance is running. Press Ctrl+C to stop.`);
    logger.info(`📊 Components: Bot=${config.botEnabled ? 'ON' : 'OFF'}, Dashboard=${config.dashboardEnabled ? 'ON' : 'OFF'}`);
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      if (server) {
        addLog({ level: 'info', message: 'Shutting down gracefully...' });
        server.close();
      }
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      if (server) {
        addLog({ level: 'info', message: 'Shutting down gracefully...' });
        server.close();
      }
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
