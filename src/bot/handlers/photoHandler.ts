import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { TextExtractor } from '../../ocr/textExtractor';
import { RealWorldTradeParser } from '../../ocr/realWorldTradeParser';
import { VisualChartAnalysisML } from '../../ml/visualChartAnalysisML';
import { ITradeExecutor } from '../../types/ITradeExecutor';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import { tradingConfig } from '../../utils/tradingConfig';
import axios from 'axios';

export class PhotoHandler {
  private textExtractor: TextExtractor;
  private tradeParser: RealWorldTradeParser;
  private visualML: VisualChartAnalysisML;
  private tradeExecutor: ITradeExecutor;

  constructor(tradeExecutor: ITradeExecutor) {
    this.textExtractor = new TextExtractor();
    this.tradeParser = new RealWorldTradeParser();
    this.visualML = new VisualChartAnalysisML();
    this.tradeExecutor = tradeExecutor;
  }

  async handlePhoto(ctx: Context): Promise<void> {
    try {
      // Check if message is from allowed channel
      if (ctx.chat?.id.toString() !== config.allowedChannelId) {
        logger.warn(`Photo received from unauthorized channel: ${ctx.chat?.id}`);
        return;
      }

      // Get the message object
      const message = (ctx.message || ctx.channelPost) as any;
      
      if (!message) {
        logger.warn('No message or channel post found');
        return;
      }

      // Extract photo file ID
      let fileId: string | null = null;
      
      if (message.photo && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1];
        fileId = photo.file_id;
      } else if (message.document?.mime_type?.startsWith('image/')) {
        fileId = message.document.file_id;
      }

      if (!fileId) {
        logger.warn('No photo found in message');
        return;
      }

      // Download the image
      logger.info('📸 Downloading image...');
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      // Process the message based on whether it has a caption
      let tradeSignal = null;

      if (message.caption && message.caption.trim().length > 0) {
        logger.info(`📝 Caption found: "${message.caption.substring(0, 100)}..."`);
        
        // Check if it's a result/update message (skip trading)
        if (this.tradeParser.isResultOrUpdateMessage(message.caption)) {
          logger.info('🚫 This is a result/update message - skipping trade execution');
          return;
        }

        // Extract instrument from caption (e.g., #EURCAD, #XAUUSD)
        const instrument = this.extractInstrumentFromCaption(message.caption);
        
        if (instrument) {
          logger.info(`💰 Trading instrument detected: ${instrument}`);
          
          try {
            // Use Visual ML to analyze the chart image
            logger.info('🎨 Analyzing chart with Visual ML...');
            tradeSignal = await this.processWithVisualML(imageBuffer, instrument, message.caption);
            logger.info('✅ Visual ML analysis completed successfully');
          } catch (visualError) {
            logger.error('❌ Visual ML failed, trying text-based parsing:', visualError);
            // Fallback to text-based parsing
            tradeSignal = await this.tradeParser.parseTradeSignal(message.caption);
          }
        } else {
          // No instrument in caption, try text-based parsing
          logger.info('No instrument found in caption, using text-based parsing');
          tradeSignal = await this.tradeParser.parseTradeSignal(message.caption);
        }
      } else {
        // No caption, extract text from image using OCR
        logger.info('📖 No caption found, using OCR...');
        const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
        
        if (ocrResult.confidence < 0.7) {
          logger.warn(`❌ OCR confidence too low: ${(ocrResult.confidence * 100).toFixed(1)}%`);
          if (!ctx.channelPost) {
            await ctx.reply(`❌ Image quality too poor for reliable processing. OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);
          }
          return;
        }
        
        tradeSignal = await this.tradeParser.parseTradeSignal(ocrResult.text);
      }

      // Validate trade signal
      if (!tradeSignal || !tradeSignal.symbol) {
        logger.warn('❌ No valid trade signal extracted');
        if (!ctx.channelPost) {
          await ctx.reply('❌ Could not extract a valid trade signal from the image');
        }
        return;
      }

      logger.info(`🎯 Processing validated trade signal: ${tradeSignal.symbol} ${tradeSignal.action || 'BUY'}`);
      
      // Format confirmation message (only for non-channel posts)
      if (!ctx.channelPost) {
        const confirmationMessage = this.formatTradeSignal(tradeSignal);
        await ctx.reply(confirmationMessage);
      }

      // Execute the trade
      try {
        // Check if trade executor is properly initialized before attempting execution
        const isConnected = await this.tradeExecutor.isConnected();
        logger.info(`🔗 Trade executor connection status: ${isConnected}`);
        
        if (!isConnected) {
          logger.error('❌ Trade executor is not connected - cannot execute trades from photo');
          logger.error('This means MetaAPI connections failed during startup');
          if (!ctx.channelPost) {
            await ctx.reply('❌ Trade execution unavailable - MetaAPI connection issue');
          }
          return;
        }
        
        logger.info(`🎯 Executing trade from photo: ${tradeSignal.symbol} ${tradeSignal.action || 'BUY'}`);
        const executionResult = await this.tradeExecutor.executeTradeSignal(tradeSignal);
        
        logger.info('📊 Photo trade execution result received:', {
          success: executionResult.success,
          message: executionResult.message,
          error: executionResult.error,
          signalId: executionResult.signalId
        });
        
        // Send execution results
        if (!ctx.channelPost) {
          const resultMessage = this.formatExecutionResult(executionResult);
          await ctx.reply(resultMessage);
        }
        
        if (executionResult.success) {
          logger.info('✅ Photo trade execution completed successfully');
        } else {
          logger.error(`❌ Photo trade execution failed: ${executionResult.error || executionResult.message}`);
          logger.error('💡 Check MetaAPI account connections and market status');
        }
        
      } catch (executionError) {
        logger.error('💥 Photo trade execution threw an exception:', executionError);
        logger.error('This indicates a serious issue with the trade executor');
        if (!ctx.channelPost) {
          await ctx.reply('❌ Trade execution failed. Please check logs for details.');
        }
      }

    } catch (error) {
      logger.error('❌ Error handling photo:', error);
      if (!ctx.channelPost) {
        await ctx.reply('❌ Error processing image');
      }
    }
  }

  /**
   * Extract trading instrument from caption - ENHANCED FOR ALL SYMBOLS
   */
  private extractInstrumentFromCaption(caption: string): string | null {
    logger.info(`🔍 Extracting instrument from caption: "${caption.substring(0, 100)}..."`);
    
    // Enhanced patterns for ALL trading instruments
    const patterns = [
      // Hashtag patterns (most common)
      /#([A-Z]{3,8})\b/gi,          // #EURUSD, #XAUUSD, #US30, #BTCUSD
      /#([A-Z]{2,3}\d{2,3})\b/gi,   // #US30, #NAS100, #SPX500
      
      // Direct symbol patterns
      /\b([A-Z]{6})\b/g,            // EURUSD, GBPUSD, XAUUSD
      /\b([A-Z]{2,3}\d{2,3})\b/g,   // US30, NAS100, SPX500, GER30
      /\b([A-Z]{3}USD)\b/g,         // BTCUSD, ETHUSD, XAUUSD
      
      // Commodity patterns
      /\b(GOLD|SILVER|OIL|GAS)\b/gi,
      
      // Crypto patterns  
      /\b(BITCOIN|ETHEREUM|BTC|ETH|LTC|XRP)\b/gi,
      
      // Index patterns
      /\b(DOW|NASDAQ|SPY|DAX|FTSE|NIKKEI)\b/gi
    ];
    
    for (const pattern of patterns) {
      const matches = caption.match(pattern);
      if (matches && matches.length > 0) {
        let instrument = matches[0].replace('#', '').toUpperCase();
        
        // Symbol normalization and mapping
        const normalizedInstrument = this.normalizeSymbol(instrument);
        
        if (normalizedInstrument) {
          logger.info(`✅ Instrument extracted: ${normalizedInstrument}`);
          return normalizedInstrument;
        }
      }
    }
    
    logger.warn('❌ No instrument found in caption');
    return null;
  }

  /**
   * Normalize and map symbols to broker-standard format
   */
  private normalizeSymbol(symbol: string): string | null {
    const symbolMap: { [key: string]: string } = {
      // Precious Metals
      'GOLD': 'XAUUSD',
      'SILVER': 'XAGUSD',
      'PLATINUM': 'XPTUSD',
      'PALLADIUM': 'XPDUSD',
      
      // Crypto mapping
      'BITCOIN': 'BTCUSD',
      'ETHEREUM': 'ETHUSD',
      'BTC': 'BTCUSD',
      'ETH': 'ETHUSD',
      'LTC': 'LTCUSD',
      'XRP': 'XRPUSD',
      
      // Index mapping
      'DOW': 'US30',
      'NASDAQ': 'NAS100',
      'SPY': 'SPX500',
      'DAX': 'GER30',
      'FTSE': 'UK100',
      'NIKKEI': 'JPN225',
      
      // Oil mapping
      'OIL': 'USOIL',
      'CRUDE': 'USOIL',
      'BRENT': 'UKOIL',
      'GAS': 'NGAS'
    };
    
    // Return mapped symbol or original if already standard
    return symbolMap[symbol] || symbol;
  }

  /**
   * Process chart with Visual ML - DYNAMIC FOR ALL SYMBOLS
   */
  private async processWithVisualML(imageBuffer: Buffer, instrument: string, caption: string): Promise<any> {
    logger.info(`🎨 Starting Visual ML analysis for ${instrument}...`);
    
    // Analyze chart with Visual ML
    const visualResult = await this.visualML.analyzeChartImage(imageBuffer);
    
    // Enhanced logging with better formatting
    logger.info('🔍 Visual ML Analysis Results:', {
      symbol: instrument,
      greyZones: visualResult.greyEntryZones?.length || 0,
      greenZones: visualResult.greenTargetZones?.length || 0,
      redZones: visualResult.redStopZones?.length || 0,
      direction: visualResult.direction,
      confidence: visualResult.confidence
    });
    
    // Log detailed zone information
    if (visualResult.greyEntryZones?.length > 0) {
      logger.info('📍 Grey Entry Zones:', visualResult.greyEntryZones.map(z => `${z.price} (conf: ${z.confidence})`));
    }
    if (visualResult.greenTargetZones?.length > 0) {
      logger.info('🎯 Green Target Zones:', visualResult.greenTargetZones.map(z => `${z.price} (conf: ${z.confidence})`));
    }
    if (visualResult.redStopZones?.length > 0) {
      logger.info('🛑 Red Stop Zones:', visualResult.redStopZones.map(z => `${z.price} (conf: ${z.confidence})`));
    }
    
    // Create dynamic trade signal
    const tradeSignal: any = {
      symbol: instrument,
      action: this.determineTradeDirection(visualResult, instrument),
      source: 'VISUAL_ML_DYNAMIC',
      confidence: visualResult.confidence || 0,
      originalCaption: caption.substring(0, 200),
      requiresChartAnalysis: true
    };

    // DYNAMIC ENTRY ZONE EXTRACTION (Grey highlights)
    if (visualResult.greyEntryZones?.length > 0) {
      const validEntryPrices = visualResult.greyEntryZones
        .filter((zone: any) => zone.price && zone.price > 0 && zone.confidence > 0.3)
        .map((zone: any) => zone.price)
        .sort((a: number, b: number) => a - b);
      
      if (validEntryPrices.length > 0) {
        const minEntry = Math.min(...validEntryPrices);
        const maxEntry = Math.max(...validEntryPrices);
        
        tradeSignal.entryZone = { min: minEntry, max: maxEntry };
        tradeSignal.entryPrice = (minEntry + maxEntry) / 2; // Mid-point
        
        logger.info(`✅ Entry zone extracted: ${minEntry} - ${maxEntry}`);
      }
    }

    // DYNAMIC TARGET EXTRACTION (Green highlights)
    if (visualResult.greenTargetZones?.length > 0) {
      const validTargets = visualResult.greenTargetZones
        .filter((zone: any) => zone.price && zone.price > 0 && zone.confidence > 0.3)
        .map((zone: any) => zone.price)
        .sort((a: number, b: number) => a - b);
      
      if (validTargets.length > 0) {
        tradeSignal.targets = [...new Set(validTargets)]; // Remove duplicates
        logger.info(`✅ Targets extracted: ${tradeSignal.targets.join(', ')}`);
      }
    }

    // DYNAMIC STOP LOSS EXTRACTION (Red highlights)  
    if (visualResult.redStopZones?.length > 0) {
      const validStops = visualResult.redStopZones
        .filter((zone: any) => zone.price && zone.price > 0 && zone.confidence > 0.3)
        .map((zone: any) => zone.price);
      
      if (validStops.length > 0) {
        // Choose stop based on trade direction
        tradeSignal.stopLoss = tradeSignal.action === 'BUY' ? 
          Math.min(...validStops) : Math.max(...validStops);
        logger.info(`✅ Stop loss extracted: ${tradeSignal.stopLoss}`);
      }
    }

    // INTELLIGENT FALLBACK SYSTEM
    let finalTradeSignal = tradeSignal;
    if (!tradeSignal.entryZone || !tradeSignal.targets || !tradeSignal.stopLoss) {
      logger.warn('⚠️ Some visual zones missing, applying intelligent fallbacks...');
      finalTradeSignal = await this.applyIntelligentFallbacks(tradeSignal, visualResult, caption);
    }

    // VALIDATION AND QUALITY CONTROL
    const validationResult = this.validateTradeSignal(finalTradeSignal);
    if (!validationResult.isValid) {
      logger.error(`❌ Trade signal validation failed: ${validationResult.reason}`);
      throw new Error(`Invalid trade signal: ${validationResult.reason}`);
    }

    logger.info(`🎯 Final Visual ML Signal: ${finalTradeSignal.symbol} ${finalTradeSignal.action} | Entry: ${finalTradeSignal.entryZone?.min}-${finalTradeSignal.entryZone?.max} | Targets: ${finalTradeSignal.targets?.join(',')} | SL: ${finalTradeSignal.stopLoss}`);
    
    return finalTradeSignal;
  }

  /**
   * Determine trade direction intelligently based on visual analysis
   */
  private determineTradeDirection(visualResult: any, instrument: string): 'BUY' | 'SELL' {
    // Use visual analysis direction if available and confident
    if (visualResult.direction && visualResult.confidence > 0.6) {
      logger.info(`📈 Direction from Visual ML: ${visualResult.direction}`);
      return visualResult.direction;
    }
    
    // Analyze zone positions to determine direction
    const hasEntry = visualResult.greyEntryZones?.length > 0;
    const hasTargets = visualResult.greenTargetZones?.length > 0;
    
    if (hasEntry && hasTargets) {
      const avgEntry = visualResult.greyEntryZones.reduce((sum: number, zone: any) => sum + zone.price, 0) / visualResult.greyEntryZones.length;
      const avgTarget = visualResult.greenTargetZones.reduce((sum: number, zone: any) => sum + zone.price, 0) / visualResult.greenTargetZones.length;
      
      const direction = avgTarget > avgEntry ? 'BUY' : 'SELL';
      logger.info(`📊 Direction from price analysis: ${direction} (Entry avg: ${avgEntry}, Target avg: ${avgTarget})`);
      return direction;
    }
    
    // Default fallback
    logger.info('📈 Using default direction: BUY');
    return 'BUY';
  }

  /**
   * Apply intelligent fallbacks when visual zones are missing
   */
  private async applyIntelligentFallbacks(tradeSignal: any, visualResult: any, caption: string): Promise<any> {
    logger.info('🔧 Applying intelligent fallbacks...');
    
    // Try to extract from caption text as backup
    try {
      const textSignal = await this.tradeParser.parseTradeSignal(caption);
      if (textSignal) {
        // Fill missing fields from text parsing
        if (!tradeSignal.entryZone && textSignal.entryZone) {
          tradeSignal.entryZone = textSignal.entryZone;
          logger.info('📝 Entry zone filled from text parsing');
        }
        if (!tradeSignal.targets && textSignal.targets) {
          tradeSignal.targets = textSignal.targets;
          logger.info('📝 Targets filled from text parsing');
        }
        if (!tradeSignal.stopLoss && textSignal.stopLoss) {
          tradeSignal.stopLoss = textSignal.stopLoss;
          logger.info('📝 Stop loss filled from text parsing');
        }
      }
    } catch (error) {
      logger.warn('⚠️ Text parsing fallback failed:', error);
    }
    
    // Generate reasonable defaults based on symbol type if still missing
    if (!tradeSignal.entryZone || !tradeSignal.targets || !tradeSignal.stopLoss) {
      const defaults = this.generateSymbolBasedDefaults(tradeSignal.symbol, tradeSignal.action);
      
      if (!tradeSignal.entryZone) {
        tradeSignal.entryZone = defaults.entryZone;
        logger.info('🎯 Using symbol-based default entry zone');
      }
      if (!tradeSignal.targets) {
        tradeSignal.targets = defaults.targets;
        logger.info('🎯 Using symbol-based default targets');
      }
      if (!tradeSignal.stopLoss) {
        tradeSignal.stopLoss = defaults.stopLoss;
        logger.info('🎯 Using symbol-based default stop loss');
      }
    }
    
    return tradeSignal;
  }

  /**
   * Generate symbol-specific defaults when visual analysis fails
   */
  private generateSymbolBasedDefaults(symbol: string, action: 'BUY' | 'SELL'): any {
    // This would normally use current market price - simplified for now
    const basePrice = 1.0; // Placeholder - should get from market data
    
    const symbolConfig = {
      'XAUUSD': { spread: 30, target: 50, stop: 25 },    // Gold
      'EURUSD': { spread: 0.0015, target: 0.003, stop: 0.002 }, // EUR/USD
      'GBPUSD': { spread: 0.002, target: 0.004, stop: 0.0025 }, // GBP/USD
      'US30': { spread: 50, target: 100, stop: 40 },     // Dow Jones
      'NAS100': { spread: 10, target: 20, stop: 15 },    // NASDAQ
      'BTCUSD': { spread: 500, target: 1000, stop: 300 } // Bitcoin
    };
    
    const config = symbolConfig[symbol as keyof typeof symbolConfig] || { spread: 0.001, target: 0.002, stop: 0.001 };
    
    const direction = action === 'BUY' ? 1 : -1;
    
    return {
      entryZone: {
        min: basePrice - (config.spread * 0.5),
        max: basePrice + (config.spread * 0.5)
      },
      targets: [
        basePrice + (config.target * direction),
        basePrice + (config.target * 2 * direction)
      ],
      stopLoss: basePrice - (config.stop * direction)
    };
  }

  /**
   * Validate trade signal completeness and logic
   */
  private validateTradeSignal(signal: any): { isValid: boolean; reason?: string } {
    if (!signal.symbol) {
      return { isValid: false, reason: 'Missing symbol' };
    }
    
    if (!signal.action || !['BUY', 'SELL'].includes(signal.action)) {
      return { isValid: false, reason: 'Invalid or missing action' };
    }
    
    if (!signal.entryZone || !signal.entryZone.min || !signal.entryZone.max) {
      return { isValid: false, reason: 'Missing or invalid entry zone' };
    }
    
    if (!signal.targets || !Array.isArray(signal.targets) || signal.targets.length === 0) {
      return { isValid: false, reason: 'Missing or invalid targets' };
    }
    
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      return { isValid: false, reason: 'Missing or invalid stop loss' };
    }
    
    // Logic validation
    const avgEntry = (signal.entryZone.min + signal.entryZone.max) / 2;
    const firstTarget = signal.targets[0];
    
    if (signal.action === 'BUY') {
      if (firstTarget <= avgEntry) {
        return { isValid: false, reason: 'BUY targets must be above entry' };
      }
      if (signal.stopLoss >= avgEntry) {
        return { isValid: false, reason: 'BUY stop loss must be below entry' };
      }
    } else { // SELL
      if (firstTarget >= avgEntry) {
        return { isValid: false, reason: 'SELL targets must be below entry' };
      }
      if (signal.stopLoss <= avgEntry) {
        return { isValid: false, reason: 'SELL stop loss must be above entry' };
      }
    }
    
    return { isValid: true };
  }

  /**
   * Format trade signal for display
   */
  private formatTradeSignal(signal: any): string {
    let message = `🎯 **TRADE SIGNAL DETECTED**\n\n`;
    message += `💰 **Symbol**: ${signal.symbol}\n`;
    message += `📈 **Action**: ${signal.action || 'BUY'}\n`;
    
    if (signal.entryPrice) {
      message += `🎯 **Entry**: ${signal.entryPrice}\n`;
    }
    
    if (signal.entryZone) {
      if (typeof signal.entryZone === 'object' && signal.entryZone.min && signal.entryZone.max) {
        message += `🎯 **Entry Zone**: ${signal.entryZone.min} - ${signal.entryZone.max}\n`;
      } else {
        message += `🎯 **Entry Zone**: ${signal.entryZone}\n`;
      }
    }
    
    if (signal.targets && signal.targets.length > 0) {
      message += `🟢 **Targets**: ${signal.targets.join(', ')}\n`;
    }
    
    if (signal.stopLoss) {
      message += `🔴 **Stop Loss**: ${signal.stopLoss}\n`;
    }
    
    if (signal.confidence) {
      message += `📊 **Confidence**: ${signal.confidence.toFixed(1)}%\n`;
    }
    
    message += `🔗 **Source**: ${signal.source || 'TEXT_PARSER'}\n`;
    message += `\n⏳ Executing trade...`;
    
    return message;
  }

  /**
   * Format execution result for display
   */
  private formatExecutionResult(result: any): string {
    if (result.success) {
      let message = `✅ **TRADE EXECUTED SUCCESSFULLY**\n\n`;
      
      if (result.results && Array.isArray(result.results)) {
        message += `📊 **Execution Results** (${result.results.length} accounts):\n`;
        result.results.forEach((accountResult: any, index: number) => {
          message += `\n**Account ${index + 1}**: ${accountResult.success ? '✅' : '❌'}\n`;
          if (accountResult.orderId) {
            message += `Order ID: ${accountResult.orderId}\n`;
          }
          if (accountResult.error) {
            message += `Error: ${accountResult.error}\n`;
          }
        });
      }
      
      return message;
    } else {
      return `❌ **TRADE EXECUTION FAILED**\n\nError: ${result.error || 'Unknown error'}`;
    }
  }
}
