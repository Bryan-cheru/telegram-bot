import { TelegramBot } from './bot/bot';
import { config, validateConfig } from './utils/config';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  try {
    logger.info('Starting Telegram Trading Bot...');
    
    // Validate configuration
    if (!validateConfig()) {
      logger.error('Invalid configuration. Please check your environment variables.');
      process.exit(1);
    }
    
    // Create and start bot
    const bot = new TelegramBot();
    await bot.start();
    
    logger.info('Bot is running. Press Ctrl+C to stop.');
    
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
