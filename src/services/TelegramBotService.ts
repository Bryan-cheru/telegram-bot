/**
 * Refactored Bot Service
 * Handles only Telegram bot lifecycle and message routing
 * Follows single responsibility principle
 */

import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { appConfig } from '../config/app';
import { ErrorManager, ErrorCategory, ErrorSeverity } from '../utils/errorManager';
import { IBotService, IMessageProcessor } from '../interfaces/services';

export class TelegramBotService implements IBotService {
  private bot: Telegraf;
  private messageProcessor: IMessageProcessor;
  private isInitialized = false;
  private isStarted = false;

  constructor(messageProcessor: IMessageProcessor) {
    const config = appConfig.getBotConfig();
    
    if (!config.token) {
      throw new Error('Bot token is required. Please set BOT_TOKEN environment variable.');
    }

    this.bot = new Telegraf(config.token);
    this.messageProcessor = messageProcessor;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Bot service already initialized');
      return;
    }

    try {
      logger.info('🤖 Initializing Telegram bot service...');
      
      // Set up error handling
      this.setupErrorHandling();
      
      // Set up message handlers
      this.setupMessageHandlers();
      
      // Set up command handlers
      this.setupCommandHandlers();

      this.isInitialized = true;
      logger.info('✅ Telegram bot service initialized successfully');
    } catch (error) {
      const appError = ErrorManager.getInstance().handleError(error as Error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        operation: 'bot_initialization'
      });
      throw appError;
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot service must be initialized before starting');
    }

    if (this.isStarted) {
      logger.warn('Bot service already started');
      return;
    }

    try {
      logger.info('🚀 Starting Telegram bot...');
      
      // Start the bot
      await this.bot.launch();
      this.isStarted = true;
      
      logger.info('✅ Telegram bot started successfully');
    } catch (error) {
      const appError = ErrorManager.getInstance().handleError(error as Error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        operation: 'bot_start'
      });
      throw appError;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      logger.info('Bot service not running, nothing to stop');
      return;
    }

    try {
      logger.info('🛑 Stopping Telegram bot...');
      
      this.bot.stop('SIGTERM');
      this.isStarted = false;
      
      logger.info('✅ Telegram bot stopped successfully');
    } catch (error) {
      const appError = ErrorManager.getInstance().handleError(error as Error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        operation: 'bot_stop'
      });
      logger.error('Failed to stop bot gracefully:', appError);
    }
  }

  isRunning(): boolean {
    return this.isStarted && this.isInitialized;
  }

  /**
   * Get bot instance for advanced operations (use sparingly)
   */
  getBotInstance(): Telegraf {
    return this.bot;
  }

  private setupErrorHandling(): void {
    this.bot.catch((err, ctx) => {
      const error = ErrorManager.getInstance().handleError(err as Error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        operation: 'message_processing',
        userId: ctx.from?.id?.toString(),
        metadata: {
          updateType: ctx.updateType,
          chatId: ctx.chat?.id,
          messageId: (ctx.message as any)?.message_id
        }
      });

      logger.error('Bot error handler triggered:', error);
      
      // Try to send error message to user if possible
      this.sendErrorMessageToUser(ctx, error).catch(sendError => {
        logger.error('Failed to send error message to user:', sendError);
      });
    });
  }

  private setupMessageHandlers(): void {
    // Handle text messages
    this.bot.on('text', async (ctx) => {
      try {
        await this.messageProcessor.processMessage(ctx);
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.MEDIUM,
          operation: 'text_message_processing',
          userId: ctx.from?.id?.toString()
        });
      }
    });

    // Handle photo messages
    this.bot.on('photo', async (ctx) => {
      try {
        await this.messageProcessor.processPhoto(ctx);
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.MEDIUM,
          operation: 'photo_message_processing',
          userId: ctx.from?.id?.toString()
        });
      }
    });

    // Handle document messages
    this.bot.on('document', async (ctx) => {
      try {
        if (ctx.message.document.mime_type?.startsWith('image/')) {
          await this.messageProcessor.processPhoto(ctx);
        } else {
          await ctx.reply('📄 I can only process image files for trading signal analysis.');
        }
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.MEDIUM,
          operation: 'document_message_processing',
          userId: ctx.from?.id?.toString()
        });
      }
    });
  }

  private setupCommandHandlers(): void {
    // Basic commands
    this.bot.start(async (ctx) => {
      try {
        await this.messageProcessor.processCommand(ctx, 'start');
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.LOW,
          operation: 'start_command',
          userId: ctx.from?.id?.toString()
        });
      }
    });

    this.bot.help(async (ctx) => {
      try {
        await this.messageProcessor.processCommand(ctx, 'help');
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.LOW,
          operation: 'help_command',
          userId: ctx.from?.id?.toString()
        });
      }
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      try {
        await this.messageProcessor.processCommand(ctx, 'status');
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.LOW,
          operation: 'status_command',
          userId: ctx.from?.id?.toString()
        });
      }
    });

    // No authentication commands - system doesn't use user accounts

    // Manual trading commands
    this.bot.command('buy', async (ctx) => {
      try {
        await this.messageProcessor.processCommand(ctx, 'buy');
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.TRADING,
          severity: ErrorSeverity.HIGH,
          operation: 'buy_command',
          userId: ctx.from?.id?.toString()
        });
      }
    });

    this.bot.command('sell', async (ctx) => {
      try {
        await this.messageProcessor.processCommand(ctx, 'sell');
      } catch (error) {
        ErrorManager.getInstance().handleError(error as Error, {
          category: ErrorCategory.TRADING,
          severity: ErrorSeverity.HIGH,
          operation: 'sell_command',
          userId: ctx.from?.id?.toString()
        });
      }
    });
  }

  private async sendErrorMessageToUser(ctx: any, error: any): Promise<void> {
    try {
      const config = appConfig.getAppConfig();
      
      if (config.nodeEnv === 'development') {
        await ctx.reply(`🔧 Development Error: ${error.message}\n\nCorrelation ID: ${error.correlationId || 'unknown'}`);
      } else {
        await ctx.reply('🤖 Sorry, I encountered an error processing your request. Please try again or contact support if the issue persists.');
      }
    } catch (sendError) {
      // If we can't even send an error message, just log it
      logger.error('Failed to send error message to user:', sendError);
    }
  }
}