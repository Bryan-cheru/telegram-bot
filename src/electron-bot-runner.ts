// Electron-specific bot runner that doesn't use process.exit
import { TelegramBot } from './bot/bot';
import { config, validateConfig, debugConfig } from './utils/config';
import { logger } from './utils/logger';

// Global bot instance for Electron
let botInstance: TelegramBot | null = null;
let isRunning = false;

export async function startBotForElectron(): Promise<{ success: boolean; message: string }> {
  try {
    if (isRunning) {
      return { success: false, message: 'Bot is already running' };
    }

    logger.info('Starting Telegram Trading Bot in Electron...');
    
    // Debug configuration before validation
    debugConfig();
    
    // Validate configuration
    if (!validateConfig()) {
      const errorMsg = 'Invalid configuration. Please check your environment variables.';
      logger.error(errorMsg);
      return { success: false, message: errorMsg };
    }
    
    // Create and start bot
    botInstance = new TelegramBot();
    await botInstance.start();
    isRunning = true;
    
    logger.info('Bot is running successfully in Electron');
    return { success: true, message: 'Bot started successfully' };
    
  } catch (error) {
    const errorMsg = `Failed to start bot: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(errorMsg);
    isRunning = false;
    botInstance = null;
    return { success: false, message: errorMsg };
  }
}

export async function stopBotForElectron(): Promise<{ success: boolean; message: string }> {
  try {
    if (!isRunning || !botInstance) {
      return { success: false, message: 'Bot is not running' };
    }

    logger.info('Stopping Telegram Trading Bot in Electron...');
    
    // Stop the bot if it has a stop method
    if (typeof (botInstance as any).stop === 'function') {
      await (botInstance as any).stop();
    }
    
    botInstance = null;
    isRunning = false;
    
    logger.info('Bot stopped successfully');
    return { success: true, message: 'Bot stopped successfully' };
    
  } catch (error) {
    const errorMsg = `Failed to stop bot: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(errorMsg);
    return { success: false, message: errorMsg };
  }
}

export function getBotStatus(): { running: boolean; instance: TelegramBot | null } {
  return { running: isRunning, instance: botInstance };
}

// Override process.exit to prevent Electron from closing
const originalExit = process.exit;
process.exit = ((code?: number) => {
  logger.warn(`Bot tried to exit with code ${code}, but this is prevented in Electron mode`);
  // Instead of exiting, we'll stop the bot
  if (isRunning) {
    stopBotForElectron().catch(console.error);
  }
}) as any;

// Handle unhandled rejections without exiting
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in Electron mode
});

// Handle uncaught exceptions without exiting
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit in Electron mode
});
