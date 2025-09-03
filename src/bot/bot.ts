import { Telegraf } from 'telegraf';
import { MessageHandler } from './handlers/messageHandler';
import { PhotoHandler } from './handlers/photoHandler';
import { MultiAccountMetaApiExecutor } from '../mt5/multiAccountMetaApiExecutor';
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
    
    // Using Multi-Account MetaAPI for trade execution across multiple brokers
    logger.info('🌐 Using Multi-Account MetaAPI for simultaneous trade execution');
    this.tradeExecutor = new MultiAccountMetaApiExecutor();
    
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

    // Text message handler for trading signals
    this.bot.on('text', (ctx) => this.handleTextMessage(ctx));

    // Handle channel posts specifically (channels work differently than groups)
    this.bot.on('channel_post', (ctx) => {
      logger.info(`Channel post received from ${ctx.chat?.id} (${ctx.chat?.title})`);
      if (ctx.chat?.id.toString() === config.allowedChannelId) {
        logger.info('Channel post from configured channel!');
        
        // Debug: Log what's in the channel post
        logger.info(`Channel post content type: ${JSON.stringify(Object.keys(ctx.channelPost))}`);
        
        // Handle text in channel posts
        if (ctx.channelPost && 'text' in ctx.channelPost && ctx.channelPost.text) {
          logger.info('Text detected in channel post');
          this.handleTextMessage(ctx);
        }
        // Handle photos in channel posts
        else if (ctx.channelPost && 'photo' in ctx.channelPost && ctx.channelPost.photo) {
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

  private async handleTextMessage(ctx: any): Promise<void> {
    try {
      // Check if message is from allowed channel
      if (ctx.chat?.id.toString() !== config.allowedChannelId) {
        logger.warn(`Text message received from unauthorized channel: ${ctx.chat?.id}`);
        return;
      }

      // Get the text from either message or channelPost
      const message = (ctx.message || ctx.channelPost) as any;
      const text = message?.text;
      
      if (!text) {
        logger.warn('No text found in message');
        return;
      }

      logger.info('📨 Processing text message for trading signal');
      logger.debug('Message text:', text);

      // Check if message contains trading signal indicators
      const tradingKeywords = ['#XAUUSD', '#EURUSD', '#GBPUSD', 'zone', 'buy', 'sell', 'target', 'update'];
      const containsTradingSignal = tradingKeywords.some(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!containsTradingSignal) {
        logger.info('Text message does not contain trading signal keywords, skipping');
        return;
      }

      // Use the clean real-world parser
      const { RealWorldTradeParser } = await import('../ocr/realWorldTradeParser');
      const tradeParser = new RealWorldTradeParser();
      
      const tradeSignal = tradeParser.parseTradeSignal(text);
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in text message');
        return;
      }

      // Validate trade signal
      if (!tradeParser.validateTradeSignal(tradeSignal)) {
        logger.warn('Invalid trade signal in text message:', tradeSignal);
        return;
      }

      // Log the detected signal
      const signalInfo = `Symbol: ${tradeSignal.symbol}, Action: ${tradeSignal.action}, Entry: ${tradeSignal.entryZone.min}-${tradeSignal.entryZone.max}, Targets: ${tradeSignal.targets.join(', ')}`;
      logger.info('Trade signal detected from text:', signalInfo);

      // Execute trade
      try {
        // Check if trade executor is properly initialized before attempting execution
        const isConnected = await this.tradeExecutor.isConnected();
        logger.info(`🔗 Trade executor connection status: ${isConnected}`);
        
        if (!isConnected) {
          logger.error('❌ Trade executor is not connected - cannot execute trades');
          logger.error('This means MetaAPI connections failed during startup');
          return;
        }
        
        logger.info('🚀 Attempting to execute trade signal...');
        const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
        
        logger.info('📊 Trade execution result received:', {
          success: result.success,
          message: result.message,
          error: result.error,
          signalId: result.signalId
        });
        
        if (result.success) {
          const successMessage = result.signalId 
            ? `✅ Text signal processed! Signal ID: ${result.signalId}`
            : `✅ Trade executed from text signal!`;
          logger.info(successMessage);
        } else {
          const errorMessage = `❌ Trade execution failed: ${result.error || result.message}`;
          logger.error(errorMessage);
          logger.error('💡 Check MetaAPI account connections and market status');
        }
      } catch (error) {
        logger.error('💥 Trade execution threw an exception:', error);
        logger.error('This indicates a serious issue with the trade executor');
      }

    } catch (error) {
      logger.error('Error handling text message:', error);
    }
  }

  async start(): Promise<void> {
    try {
      // Initialize Multi-Account trade executor FIRST before starting bot
      logger.info('🔄 Attempting to initialize Multi-Account MetaAPI Trade Executor...');
      let tradeExecutorReady = false;
      
      try {
        await this.tradeExecutor.initialize();
        
        // Verify the connection after initialization
        const isConnected = await this.tradeExecutor.isConnected();
        if (isConnected) {
          logger.info('✅ Multi-Account MetaAPI Trade executor initialized and connected successfully');
          tradeExecutorReady = true;
        } else {
          logger.error('❌ Trade executor initialized but not connected to any accounts');
          tradeExecutorReady = false;
        }
        
      } catch (error) {
        logger.error('❌ Multi-Account Trade executor initialization failed:', error);
        tradeExecutorReady = false;
      }
      
      if (!tradeExecutorReady) {
        logger.warn('⚠️ Bot will continue running without trade execution');
        logger.info('ℹ️ OCR and parsing will still work, but trades cannot be executed');
        logger.info('🔧 Check your MetaAPI configuration and account status');
      } else {
        logger.info('🎯 Trade execution is ready and available');
      }
      
      // Now start the bot after executor is ready
      logger.info('🚀 Launching Telegram bot...');
      this.bot.launch();
      
      // Give it a moment to start, then continue
      await new Promise(resolve => setTimeout(resolve, 2000));
      logger.info('✅ Telegram bot started successfully');
      logger.info('Bot is running. Press Ctrl+C to stop.');
      
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
