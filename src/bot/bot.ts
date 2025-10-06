import { Telegraf } from 'telegraf';
import { MessageHandler } from './handlers/messageHandler';
// import { ModernizedPhotoHandler } from './handlers/ModernizedPhotoHandler'; // Disabled complex handler
import { CleanMultiAccountExecutor } from '../mt5/cleanMultiAccountExecutor';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal } from '../types';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { EnhancedMetaApiService } from '../services/EnhancedMetaApiService';
import { ValidationService } from '../shared';

export class TelegramBot {
  private bot: Telegraf;
  private messageHandler: MessageHandler;
  // private photoHandler: ModernizedPhotoHandler; // Disabled complex handler
  private tradeExecutor: ITradeExecutor;
  private enhancedService: EnhancedMetaApiService;

  constructor() {
    this.bot = new Telegraf(config.botToken);
    
    // Initialize enhanced MetaAPI services
    logger.info('🚀 Initializing Enhanced MetaAPI Trading System');
    this.tradeExecutor = new CleanMultiAccountExecutor();
    this.enhancedService = new EnhancedMetaApiService({
      maxDrawdownPercent: 10,
      maxDailyLossPercent: 5,
      maxPositionSizePercent: 5,
      maxOpenPositions: 10
    });
    
    this.messageHandler = new MessageHandler();
    // this.photoHandler = new ModernizedPhotoHandler(this.tradeExecutor); // Disabled complex handler
    
    this.setupHandlers();
  }

  // Getter to share executor with dashboard
  getTradeExecutor(): CleanMultiAccountExecutor {
    return this.tradeExecutor as CleanMultiAccountExecutor;
  }

  /**
   * Execute signal using enhanced MetaAPI features with risk management
   */
  private async executeEnhancedSignal(signal: TradeSignal): Promise<any> {
    try {
      // Get the first available account ID from environment
      const accountsConfig = process.env.METAAPI_ACCOUNTS;
      if (!accountsConfig) {
        throw new Error('No MetaAPI accounts configured');
      }

      const firstAccountId = accountsConfig.split(',')[0].split(':')[0];
      
      logger.info(`🎯 Using enhanced execution for ${signal.symbol} on account ${firstAccountId}`);

      // Execute with enhanced features using fixed lot size strategy
      const result = await this.enhancedService.executeEnhancedTrade({
        signal,
        accountId: firstAccountId,
        riskPercent: 0.45, // Fixed 0.45 lot size ($900 fixed risk per trade)
        maxSlippage: 3  // 3 pip max slippage
      });

      if (result.success) {
        logger.info('✅ Enhanced trade execution successful with 1:1 RR:', {
          ticket: result.ticket,
          positionSize: result.positionSize,
          riskAmount: result.riskAmount,
          executionPrice: result.executionPrice,
          risk: '0.45%'
        });
      }

      return {
        success: result.success,
        message: result.message,
        error: result.success ? undefined : result.message,
        ticket: result.ticket,
        signalId: result.ticket || `enhanced-${Date.now()}`
      };

    } catch (error) {
      logger.error('Enhanced signal execution error:', error);
      throw error;
    }
  }

  private setupHandlers(): void {
    // Existing command handlers
    this.bot.start((ctx) => this.messageHandler.handleStart(ctx));
    this.bot.help((ctx) => this.messageHandler.handleHelp(ctx));
    this.bot.command('status', (ctx) => this.messageHandler.handleStatus(ctx));

    // Trading commands only - no user authentication needed

    // Photo handler
    // this.bot.on('photo', (ctx) => this.photoHandler.handlePhoto(ctx)); // Disabled complex handler

    // Text message handler for trading signals
    this.bot.on('text', (ctx) => this.handleTextMessage(ctx));

    // Handle channel posts specifically (channels work differently than groups)
    this.bot.on('channel_post', async (ctx) => {
      logger.info(`Channel post received from ${ctx.chat?.id} (${ctx.chat?.title}) Username: ${(ctx.chat as any)?.username}`);
      
      // Check by both channel ID and username
      const channelUsername = (ctx.chat as any)?.username;
      const isAllowedChannel = 
        ctx.chat?.id.toString() === config.allowedChannelId ||
        (channelUsername && config.allowedChannelUsername && channelUsername === config.allowedChannelUsername);
      
      if (isAllowedChannel) {
        logger.info(`✅ Channel post from configured channel!`);
        if (channelUsername) {
          logger.info(`📝 Channel username: @${channelUsername}`);
        }
        
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
          
          // Check if photo has caption text (THIS IS WHAT WE NEED!)
          if (ctx.channelPost && 'caption' in ctx.channelPost && ctx.channelPost.caption) {
            logger.info('🎯 Photo caption detected - processing as trading signal');
            // Treat caption as text message for signal processing
            this.handleTextMessage(ctx);
          } else {
            logger.info('📷 Photo without caption - analyzing chart image with ML');
            await this.handleChartImage(ctx);
          }
        } 
        // Handle documents (images sent as files)
        else if (ctx.channelPost && 'document' in ctx.channelPost && ctx.channelPost.document) {
          const doc = ctx.channelPost.document;
          // Check if document is an image
          if (doc.mime_type && doc.mime_type.startsWith('image/')) {
            logger.info('Image document detected in channel post');
            // this.photoHandler.handlePhoto(ctx); // Disabled complex handler
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
      // Check if message is forwarded from a channel
      if (ctx.message && 'forward_from_chat' in ctx.message && ctx.message.forward_from_chat) {
        const forwardedFrom = ctx.message.forward_from_chat as any;
        
        if (forwardedFrom.type === 'channel') {
          const channelUsername = forwardedFrom.username;
          const channelId = forwardedFrom.id?.toString();
          
          logger.info(`📨 Forwarded message from channel: @${channelUsername} (ID: ${channelId})`);
          
          // Check if forwarded from our target channel
          const isFromTargetChannel = 
            (config.allowedChannelId && channelId === config.allowedChannelId) ||
            (config.allowedChannelUsername && channelUsername === config.allowedChannelUsername);
          
          if (isFromTargetChannel) {
            logger.info(`✅ Forwarded message from target channel detected!`);
            
            // Handle the forwarded message like a channel post
            if ('text' in ctx.message && ctx.message.text) {
              logger.info('📝 Processing forwarded text message');
              this.handleTextMessage(ctx);
              return;
            } else if ('photo' in ctx.message && ctx.message.photo) {
              logger.info('📸 Processing forwarded photo message');
              // this.photoHandler.handlePhoto(ctx); // Disabled complex handler
              return;
            }
          } else {
            logger.info(`⚠️ Forwarded from different channel. Expected: @${config.allowedChannelUsername} or ID:${config.allowedChannelId}`);
          }
        }
      }

      // Regular message logging
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

  /**
   * Optional user management command handlers
   * These are new features that don't affect existing functionality
   */
  


  private async handleTextMessage(ctx: any): Promise<void> {
    try {
      // Check if message is from allowed channel (by ID or username)
      const chatId = ctx.chat?.id.toString();
      const chatUsername = (ctx.chat as any)?.username;
      
      // For forwarded messages, check the original channel
      let isFromAllowedChannel = false;
      
      if (ctx.message && 'forward_from_chat' in ctx.message && ctx.message.forward_from_chat) {
        const forwardedFrom = ctx.message.forward_from_chat as any;
        if (forwardedFrom.type === 'channel') {
          const originalChannelId = forwardedFrom.id?.toString();
          const originalChannelUsername = forwardedFrom.username;
          
          isFromAllowedChannel = 
            (config.allowedChannelId && originalChannelId === config.allowedChannelId) ||
            (config.allowedChannelUsername && originalChannelUsername === config.allowedChannelUsername) ||
            false;
        }
      } else {
        // Direct channel message
        isFromAllowedChannel = 
          (config.allowedChannelId && chatId === config.allowedChannelId) ||
          (config.allowedChannelUsername && chatUsername === config.allowedChannelUsername) ||
          false;
      }

      if (!isFromAllowedChannel) {
        logger.warn(`Text message received from unauthorized source: ID=${chatId}, Username=@${chatUsername}`);
        return;
      }

      // Get the text from either message or channelPost (including captions!)
      const message = (ctx.message || ctx.channelPost) as any;
      const text = message?.text || message?.caption; // ✅ NOW ALSO CHECK CAPTIONS!
      
      if (!text) {
        logger.warn('No text or caption found in message');
        return;
      }
      
      // Log what type of text we're processing
      if (message?.caption) {
        logger.info('🎯 Processing photo caption as trading signal');
      } else {
        logger.info('📝 Processing text message as trading signal');
      }

      logger.info('📨 Processing text message for trading signal');
      logger.debug('Message text:', text);

      // 🎯 Check if this is a manual trading command first
      if (MessageHandler.isManualTradingCommand(text)) {
        logger.info('🎯 Manual trading command detected');
        await this.messageHandler.handleManualCommand(ctx, text, this.tradeExecutor);
        return;
      }

      // Check if message contains trading signal indicators
      const tradingKeywords = [
        '#XAUUSD', '#EURUSD', '#GBPUSD', '#USDJPY', '#AUDUSD', '#USDCAD', '#NZDUSD', '#EURGBP',
        '#US30', '#NAS100', '#SPX500', '#UK100', '#GER30', '#XAGUSD',
        'zone', 'buy', 'sell', 'target', 'update', 'entry', 'stop', 'tp'
      ];
      const containsTradingSignal = tradingKeywords.some(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!containsTradingSignal) {
        logger.info('Text message does not contain trading signal keywords, skipping');
        return;
      }

      // Use the clean real-world parser
      const { CleanRealWorldTradeParser } = await import('../ocr/cleanRealWorldTradeParser');
      
      // 🚀 CHECK FOR CHART IMAGE: If this message has a photo, download it for analysis
      let hasChartImage = false;
      let imageBuffer: Buffer | undefined = undefined;
      
      if (message?.photo && Array.isArray(message.photo) && message.photo.length > 0) {
        logger.info('📸 Downloading chart image for enhanced analysis...');
        try {
          // Get the largest photo size for better analysis
          const photo = message.photo[message.photo.length - 1];
          const file = await ctx.telegram.getFile(photo.file_id);
          
          if (file.file_path) {
            const response = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`);
            imageBuffer = Buffer.from(await response.arrayBuffer());
            hasChartImage = true;
            logger.info(`✅ Chart image downloaded: ${imageBuffer.length} bytes`);
          }
        } catch (error) {
          logger.warn('⚠️ Failed to download chart image:', error);
        }
      }
      
      // Parse with enhanced capabilities
      const tradeSignal = await CleanRealWorldTradeParser.parseTradeSignal(text, undefined, hasChartImage, imageBuffer);
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in text message');
        return;
      }

      // Validate trade signal  
      if (!ValidationService.validateTradeSignal(tradeSignal)) {
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
        
        logger.info('🚀 Attempting to execute trade signal with enhanced features...');
        
        // Try enhanced execution first, fallback to regular execution
        let result;
        try {
          result = await this.executeEnhancedSignal(tradeSignal);
        } catch (enhancedError) {
          logger.warn('Enhanced execution failed, using fallback:', enhancedError);
          result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
        }
        
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

  private async handleChartImage(ctx: any): Promise<void> {
    try {
      logger.info('🖼️ Starting chart image analysis...');
      
      // Check if message is from allowed channel
      const chatId = ctx.chat?.id.toString();
      const isFromAllowedChannel = chatId === config.allowedChannelId;
      
      if (!isFromAllowedChannel) {
        logger.info('❌ Image not from configured channel, ignoring');
        return;
      }

      // Get the highest resolution photo
      const photo = ctx.channelPost.photo;
      if (!photo || photo.length === 0) {
        logger.warn('No photo found in message');
        return;
      }

      const highestResPhoto = photo[photo.length - 1]; // Last element is highest resolution
      logger.info(`📷 Processing photo: ${highestResPhoto.width}x${highestResPhoto.height}`);

      // Download the image
      const fileLink = await ctx.telegram.getFileLink(highestResPhoto.file_id);
      logger.info(`🔗 Downloading image from: ${fileLink.href}`);
      
      const response = await fetch(fileLink.href);
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      logger.info(`📦 Downloaded ${imageBuffer.length} bytes`);

      // Analyze the chart using Visual Chart Analysis ML
      const { VisualChartAnalysisML } = await import('../ml/visualChartAnalysisML');
      const chartAnalyzer = new VisualChartAnalysisML();
      
      logger.info('🔍 Analyzing chart for trading signals...');
      const analysisResult = await chartAnalyzer.analyzeChartImage(imageBuffer);

      logger.info(`📊 Visual analysis results:
        - Symbol: ${analysisResult.symbol}
        - Direction: ${analysisResult.direction} 
        - Confidence: ${analysisResult.confidence}%
        - Grey entry zones: ${analysisResult.greyEntryZones.length}
        - Green target zones: ${analysisResult.greenTargetZones.length}  
        - Red stop zones: ${analysisResult.redStopZones.length}`);

      // Convert visual analysis to trade signal
      if (analysisResult.greyEntryZones.length > 0 && analysisResult.symbol && analysisResult.direction) {
        const tradeSignal = await this.convertVisualAnalysisToTradeSignal(analysisResult);
        
        if (tradeSignal) {
          logger.info('✅ Generated trade signal from chart analysis:', {
            symbol: tradeSignal.symbol,
            action: tradeSignal.action,
            entry: `${tradeSignal.entryZone.min}-${tradeSignal.entryZone.max}`,
            targets: tradeSignal.targets,
            stopLoss: tradeSignal.stopLoss
          });

          // Execute the trade
          const isConnected = await this.tradeExecutor.isConnected();
          if (!isConnected) {
            logger.error('❌ Trade executor not connected - cannot execute chart-based trade');
            return;
          }

          logger.info('🚀 Executing trade from chart analysis...');
          const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
          
          if (result.success) {
            logger.info(`✅ Chart-based trade executed successfully! Signal ID: ${result.signalId || 'N/A'}`);
          } else {
            logger.error(`❌ Chart-based trade execution failed: ${result.error || result.message}`);
          }
        } else {
          logger.warn('❌ Could not convert visual analysis to valid trade signal');
        }
      } else {
        logger.warn('❌ Insufficient chart analysis data for trade generation');
        logger.warn(`Missing: ${!analysisResult.symbol ? 'symbol ' : ''}${!analysisResult.direction ? 'direction ' : ''}${analysisResult.greyEntryZones.length === 0 ? 'entry zones' : ''}`);
      }

    } catch (error) {
      logger.error('💥 Error analyzing chart image:', error);
    }
  }

  private async convertVisualAnalysisToTradeSignal(analysis: any): Promise<any> {
    try {
      if (!analysis.greyEntryZones.length || !analysis.symbol || !analysis.direction) {
        return null;
      }

      // Use the first (most confident) grey zone as entry
      const entryZone = analysis.greyEntryZones[0];
      
      // Calculate entry range (add some buffer around detected zone)
      const entryBuffer = entryZone.price * 0.0005; // 0.05% buffer
      const entryMin = entryZone.price - entryBuffer;
      const entryMax = entryZone.price + entryBuffer;

      // Set targets based on $900 fixed profit/loss strategy
      let targets = [];
      let stopLoss;
      
      // Calculate pip distance for $900 with 0.45 lot size
      const pipDistanceFor900 = this.calculatePipDistanceFor900Dollars(analysis.symbol, 0.45);
      const entryMidPoint = (entryMin + entryMax) / 2;

      if (analysis.direction === 'BUY') {
        // For BUY: Use detected zones if available, otherwise use $900 calculation
        if (analysis.greenTargetZones.length > 0) {
          targets = analysis.greenTargetZones.map((zone: any) => zone.price);
        } else {
          // $900 profit target calculation
          targets = [entryMidPoint + pipDistanceFor900];
        }
        
        stopLoss = analysis.redStopZones.length > 0 
          ? analysis.redStopZones[0].price 
          : entryMidPoint - pipDistanceFor900; // $900 risk calculation
      } else {
        // For SELL: Use detected zones if available, otherwise use $900 calculation  
        if (analysis.greenTargetZones.length > 0) {
          targets = analysis.greenTargetZones.map((zone: any) => zone.price);
        } else {
          // $900 profit target calculation
          targets = [entryMidPoint - pipDistanceFor900];
        }
        
        stopLoss = analysis.redStopZones.length > 0
          ? analysis.redStopZones[0].price
          : entryMidPoint + pipDistanceFor900; // $900 risk calculation
      }

      return {
        symbol: analysis.symbol,
        action: analysis.direction,
        entryZone: { min: entryMin, max: entryMax },
        targets: targets.slice(0, 3), // Max 3 targets
        stopLoss,
        riskPercentage: 2, // Default 2% risk
        orderType: 'MARKET' as const,
        confidence: analysis.confidence,
        source: 'VISUAL_CHART_ANALYSIS'
      };

    } catch (error) {
      logger.error('Error converting visual analysis to trade signal:', error);
      return null;
    }
  }

  async start(): Promise<void> {
    try {
      // Initialize Multi-Account trade executor with timeout
      logger.info('🔄 Attempting to initialize Multi-Account MetaAPI Trade Executor...');
      let tradeExecutorReady = false;
      
      try {
        // Add overall timeout for initialization
        await Promise.race([
          this.tradeExecutor.initialize(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initialization timeout')), 240000) // 4 minutes max
          )
        ]);
        
        // Verify the connection after initialization
        const isConnected = await this.tradeExecutor.isConnected();
        if (isConnected) {
          logger.info('✅ Multi-Account MetaAPI Trade executor initialized and connected successfully');
          tradeExecutorReady = true;
        } else {
          logger.warn('❌ Trade executor initialized but not fully connected - OCR mode available');
          tradeExecutorReady = false;
        }
        
      } catch (error) {
        logger.warn('⚠️ Multi-Account Trade executor initialization timeout or failed:', error);
        logger.info('📊 Bot will continue in OCR-only mode');
        tradeExecutorReady = false;
      }
      
      if (!tradeExecutorReady) {
        logger.warn('⚠️ Bot running without full trade execution capability');
        logger.info('ℹ️ OCR and parsing will work, but trades may not execute');
        logger.info('🔧 Check your MetaAPI configuration and account status in background');
      } else {
        logger.info('🎯 Trade execution is ready and available');
      }
      
      // Always start the bot regardless of MetaAPI status
      logger.info('🚀 Launching Telegram bot...');
      this.bot.launch();
      
      // Give it a moment to start, then continue
      await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced to 1 second
      logger.info('✅ Telegram bot started successfully');
      logger.info('📱 Bot is now listening for trading signals...');
      
      // Log monitoring configuration
      if (config.allowedChannelId) {
        logger.info(`🎯 Monitoring channel by ID: ${config.allowedChannelId}`);
      }
      if (config.allowedChannelUsername) {
        logger.info(`🎯 Monitoring channel by username: @${config.allowedChannelUsername}`);
      }
      if (!config.allowedChannelId && !config.allowedChannelUsername) {
        logger.warn('⚠️ No channel configured for monitoring. Set ALLOWED_CHANNEL_ID or ALLOWED_CHANNEL_USERNAME');
      }
      
      logger.info('💡 TIP: You can also forward messages from any channel to this bot!');
      logger.info('Bot is running. Press Ctrl+C to stop.');
      
      // Graceful shutdown
      process.once('SIGINT', () => this.stop());
      process.once('SIGTERM', () => this.stop());
      
    } catch (error) {
      logger.error('Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Calculate pip distance needed for $900 profit/loss with 0.45 lot size
   */
  private calculatePipDistanceFor900Dollars(symbol: string, lotSize: number): number {
    // Standard pip values for major pairs (per 1.0 lot)
    const pipValues: { [key: string]: number } = {
      'EURUSD': 10,    // $10 per pip per lot
      'GBPUSD': 10,    // $10 per pip per lot  
      'USDCHF': 10,    // $10 per pip per lot
      'USDJPY': 10,    // $10 per pip per lot (approximately)
      'EURGBP': 10,    // $10 per pip per lot (cross pair)
      'EURJPY': 10,    // $10 per pip per lot (cross pair)
      'GBPJPY': 10,    // $10 per pip per lot (cross pair)
      'XAUUSD': 100,   // $100 per pip per lot (Gold)
      'XAGUSD': 50,    // $50 per pip per lot (Silver)
      'DEFAULT': 10    // Default for unknown symbols
    };

    const pipValue = pipValues[symbol] || pipValues['DEFAULT'];
    const pipValueForLotSize = pipValue * lotSize; // Pip value for 0.45 lots
    
    // Calculate pips needed for $900
    const pipsNeeded = 900 / pipValueForLotSize;
    
    // Convert pips to price distance based on symbol type
    if (symbol.includes('JPY')) {
      // JPY pairs: 1 pip = 0.01
      return pipsNeeded * 0.01;
    } else if (symbol.startsWith('XAU') || symbol.startsWith('XAG')) {
      // Metals: 1 pip = 0.1 for Gold, 0.01 for Silver  
      return symbol.startsWith('XAU') ? pipsNeeded * 0.1 : pipsNeeded * 0.01;
    } else {
      // Major forex pairs: 1 pip = 0.0001
      return pipsNeeded * 0.0001;
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
