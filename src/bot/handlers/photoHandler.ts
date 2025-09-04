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
   * Extract trading instrument from caption (e.g., #EURCAD, #XAUUSD)
   */
  private extractInstrumentFromCaption(caption: string): string | null {
    // Look for hashtag symbols: #EURCAD, #XAUUSD, etc.
    const hashtagPattern = /#([A-Z]{6})\b/gi;
    const match = caption.match(hashtagPattern);
    
    if (match && match.length > 0) {
      const instrument = match[0].replace('#', '').toUpperCase();
      logger.info(`💰 Instrument extracted from caption: ${instrument}`);
      return instrument;
    }
    
    // Fallback patterns
    const fallbackPatterns = [
      /\b([A-Z]{6})\b/g,    // EURCAD, XAUUSD
      /\b(GOLD|SILVER)\b/gi // GOLD, SILVER
    ];
    
    for (const pattern of fallbackPatterns) {
      const matches = caption.match(pattern);
      if (matches && matches.length > 0) {
        let instrument = matches[0].toUpperCase();
        
        // Convert aliases
        if (instrument === 'GOLD') instrument = 'XAUUSD';
        if (instrument === 'SILVER') instrument = 'XAGUSD';
        
        logger.info(`💰 Instrument extracted (fallback): ${instrument}`);
        return instrument;
      }
    }
    
    return null;
  }

  /**
   * Process chart with Visual ML
   */
  private async processWithVisualML(imageBuffer: Buffer, instrument: string, caption: string): Promise<any> {
    // Analyze chart with Visual ML
    const visualResult = await this.visualML.analyzeChartImage(imageBuffer);
    
    // DEBUG: Log what Visual ML actually returned
    logger.info('🔍 Visual ML Raw Result:', JSON.stringify({
      greyEntryZones: visualResult.greyEntryZones,
      greenTargetZones: visualResult.greenTargetZones,  
      redStopZones: visualResult.redStopZones,
      direction: visualResult.direction,
      confidence: visualResult.confidence
    }, null, 2));
    
    // Override symbol with caption symbol
    visualResult.symbol = instrument;
    
    // Convert to trade signal format
    const tradeSignal: any = {
      symbol: instrument,
      action: visualResult.direction || 'BUY',
      source: 'VISUAL_ML',
      confidence: visualResult.confidence || 0,
      originalCaption: caption.substring(0, 200),
      entryPrice: undefined,
      entryZone: undefined,
      targets: undefined,
      stopLoss: undefined
    };

    // Extract price levels from visual analysis
    if (visualResult.greyEntryZones?.length > 0) {
      const entryPrices = visualResult.greyEntryZones.map((zone: any) => zone.price);
      const minEntry = Math.min(...entryPrices);
      const maxEntry = Math.max(...entryPrices);
      
      tradeSignal.entryPrice = minEntry; // Primary entry price
      
      // Handle single price vs price range
      if (entryPrices.length === 1) {
        // Single price level - create small range around it
        const singlePrice = entryPrices[0];
        const spread = singlePrice * 0.0002; // 0.02% spread around single price
        tradeSignal.entryZone = { 
          min: singlePrice - spread, 
          max: singlePrice + spread 
        };
      } else {
        // Multiple price levels - use actual range
        tradeSignal.entryZone = { 
          min: minEntry, 
          max: maxEntry 
        };
      }
    }
    
    if (visualResult.greenTargetZones?.length > 0) {
      tradeSignal.targets = visualResult.greenTargetZones
        .map((zone: any) => zone.price)
        .filter((price: number) => price && price > 0) // Filter out invalid prices
        .sort((a: number, b: number) => a - b);
    } else {
      // Fallback: create targets based on entry price if no green zones detected
      if (tradeSignal.entryPrice) {
        const basePrice = tradeSignal.entryPrice;
        const targetDistance = basePrice * 0.005; // 0.5% target distance
        tradeSignal.targets = tradeSignal.action === 'BUY' ? 
          [basePrice + targetDistance, basePrice + (targetDistance * 2)] :
          [basePrice - targetDistance, basePrice - (targetDistance * 2)];
      }
    }
    
    if (visualResult.redStopZones?.length > 0) {
      const stopPrices = visualResult.redStopZones.map((zone: any) => zone.price).filter((price: number) => price && price > 0);
      tradeSignal.stopLoss = tradeSignal.action === 'BUY' ? 
        Math.min(...stopPrices) : Math.max(...stopPrices);
    } else {
      // Fallback: create stop loss based on entry price if no red zones detected
      if (tradeSignal.entryPrice) {
        const basePrice = tradeSignal.entryPrice;
        const stopDistance = basePrice * 0.01; // 1% stop loss
        tradeSignal.stopLoss = tradeSignal.action === 'BUY' ? 
          basePrice - stopDistance : basePrice + stopDistance;
      }
    }

    logger.info(`🎯 Visual ML signal: ${tradeSignal.symbol} ${tradeSignal.action} @ ${tradeSignal.entry || 'market'}`);
    return tradeSignal;
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
