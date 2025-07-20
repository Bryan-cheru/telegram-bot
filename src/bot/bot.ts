import { Telegraf } from 'telegraf';
import { MessageHandler } from './handlers/messageHandler';
import { PhotoHandler } from './handlers/photoHandler';
import { FileTradeExecutor } from '../mt5/fileTradeExecutor';
import { MetaApiTradeExecutor } from '../mt5/metaApiTradeExecutor';
import { SimulationTradeExecutor } from '../mt5/simulationTradeExecutor';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

export class TelegramBot {
  private bot: Telegraf;
  private messageHandler: MessageHandler;
  private photoHandler: PhotoHandler;
  private tradeExecutor: ITradeExecutor;

  constructor() {
    this.bot = new Telegraf(config.botToken);
    
    // Choose trade executor based on configuration
    switch (config.tradingMode.toLowerCase()) {
      case 'metaapi':
        if (config.metaApi.token && config.metaApi.accountId) {
          logger.info('🌐 Using MetaAPI for trade execution');
          this.tradeExecutor = new MetaApiTradeExecutor();
        } else {
          logger.warn('⚠️  MetaAPI mode selected but credentials missing, falling back to simulation');
          this.tradeExecutor = new SimulationTradeExecutor();
        }
        break;
      
      case 'simulation':
        logger.info('🎮 Using Simulation mode for trade execution');
        this.tradeExecutor = new SimulationTradeExecutor();
        break;
      
      case 'file':
      default:
        logger.info('📁 Using File-based trade executor');
        this.tradeExecutor = new FileTradeExecutor();
        break;
    }
    
    this.messageHandler = new MessageHandler();
    this.photoHandler = new PhotoHandler(this.tradeExecutor);
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Command handlers
    this.bot.start((ctx) => this.messageHandler.handleStart(ctx));
    this.bot.help((ctx) => this.messageHandler.handleHelp(ctx));
    this.bot.command('status', (ctx) => this.messageHandler.handleStatus(ctx));

    // Photo handler
    this.bot.on('photo', (ctx) => this.photoHandler.handlePhoto(ctx));

    // Handle channel posts specifically (channels work differently than groups)
    this.bot.on('channel_post', (ctx) => {
      logger.info(`Channel post received from ${ctx.chat?.id} (${ctx.chat?.title})`);
      if (ctx.chat?.id.toString() === config.allowedChannelId) {
        logger.info('Channel post from configured channel!');
        
        // Debug: Log what's in the channel post
        logger.info(`Channel post content type: ${JSON.stringify(Object.keys(ctx.channelPost))}`);
        
        // Handle photos in channel posts
        if (ctx.channelPost && 'photo' in ctx.channelPost && ctx.channelPost.photo) {
          logger.info('Photo detected in channel post');
          this.photoHandler.handlePhoto(ctx);
        } 
        // Handle documents (images sent as files)
        else if (ctx.channelPost && 'document' in ctx.channelPost && ctx.channelPost.document) {
          const doc = ctx.channelPost.document;
          // Check if document is an image
          if (doc.mime_type && doc.mime_type.startsWith('image/')) {
            logger.info('Image document detected in channel post');
            this.photoHandler.handlePhoto(ctx);
          } else {
            logger.info(`Document detected but not an image: ${doc.mime_type}`);
          }
        } else {
          logger.info('No photo or image document found in channel post');
        }
      }
    });

    // Debug: Log all messages to see what the bot receives
    this.bot.on('message', (ctx) => {
      logger.info(`Message received from chat ${ctx.chat?.id} (type: ${ctx.chat?.type})`);
      logger.info(`Expected channel ID: ${config.allowedChannelId}`);
      logger.info(`Chat ID matches: ${ctx.chat?.id.toString() === config.allowedChannelId}`);
      if (ctx.chat?.id.toString() === config.allowedChannelId) {
        logger.info('Message from configured channel detected');
      }
      this.messageHandler.handleUnknown(ctx);
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      logger.error('Bot error:', err);
      ctx.reply('❌ An error occurred while processing your request.');
    });

    logger.info('Bot handlers configured');
  }

  async start(): Promise<void> {
    try {
      // Start bot first - don't wait for launch to resolve (it often doesn't)
      logger.info('🚀 Launching Telegram bot...');
      this.bot.launch();
      
      // Give it a moment to start, then continue
      await new Promise(resolve => setTimeout(resolve, 2000));
      logger.info('✅ Telegram bot started successfully');
      
      // Initialize trade executor with proper error handling
      logger.info('🔄 Attempting to initialize File-based Trade Executor...');
      try {
        await this.tradeExecutor.initialize();
        logger.info('✅ File-based Trade executor initialized successfully');
      } catch (error) {
        logger.error('❌ Trade executor initialization failed:', error);
        logger.warn('⚠️ Bot will continue running without trade execution');
        logger.info('ℹ️ OCR and parsing will still work, but trades cannot be executed');
      }
      
      // Graceful shutdown
      process.once('SIGINT', () => this.stop());
      process.once('SIGTERM', () => this.stop());
      
    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping bot...');
      this.bot.stop();
      await this.tradeExecutor.closeConnection();
      logger.info('Bot stopped successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error stopping bot:', error);
      process.exit(1);
    }
  }
}
