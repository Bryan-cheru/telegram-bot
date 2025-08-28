import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { TextExtractor } from '../../ocr/textExtractor';
import { TradeParser } from '../../ocr/tradeParser';
import { ITradeExecutor } from '../../types/ITradeExecutor';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import { InputValidator } from '../../utils/inputValidation';
import axios from 'axios';

export class PhotoHandler {
  private textExtractor: TextExtractor;
  private tradeParser: TradeParser;
  private tradeExecutor: ITradeExecutor;

  constructor(tradeExecutor: ITradeExecutor) {
    this.textExtractor = new TextExtractor();
    this.tradeParser = new TradeParser();
    this.tradeExecutor = tradeExecutor;
  }

  async handlePhoto(ctx: Context): Promise<void> {
    try {
      // Check if message is from allowed channel
      if (ctx.chat?.id.toString() !== config.allowedChannelId) {
        logger.warn(`Photo received from unauthorized channel: ${ctx.chat?.id}`);
        return;
      }

      // Get the message object - it could be from ctx.message (private/group) or ctx.channelPost (channel)
      const message = (ctx.message || ctx.channelPost) as any;
      
      if (!message) {
        logger.warn('No message or channel post found');
        return;
      }

      let fileId: string | null = null;
      const isChannelPost = !!ctx.channelPost;

      logger.info(`Processing ${isChannelPost ? 'channel post' : 'message'} for image content`);

      // Handle photo messages
      if (message.photo && message.photo.length > 0) {
        logger.info(`Processing photo ${isChannelPost ? 'from channel post' : 'from message'}`);
        // Get the highest resolution photo
        const photo = message.photo[message.photo.length - 1];
        fileId = photo.file_id;
      }
      // Handle document messages (images sent as files)
      else if (message.document) {
        // Check if document is an image
        const mimeType = message.document.mime_type;
        if (mimeType && mimeType.startsWith('image/')) {
          logger.info(`Processing image document ${isChannelPost ? 'from channel post' : 'from message'}`);
          fileId = message.document.file_id;
        } else {
          logger.info('Document is not an image, skipping');
          return;
        }
      }

      if (!fileId) {
        logger.warn('No photo or image document found in message');
        return;
      }

      // Download the image file
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      // Check for caption text first (when image is sent with accompanying text)
      let combinedText = '';
      let usesCaptionOnly = false;
      
      if (message.caption && message.caption.trim().length > 0) {
        logger.info('Caption text found:', message.caption);
        
        // Early check: If caption indicates this is a result/update message, skip everything
        if (this.tradeParser.isResultOrUpdateMessage(message.caption)) {
          logger.info('🚫 Caption indicates result/update message - skipping image processing and trade parsing');
          return;
        }
        
        // Check if caption contains clear trading information (entry, stop loss, targets)
        const captionHasTradingInfo = /(?:SL|Stop|Target|TP|Entry|Zone|Buy|Sell|XAUUSD|Gold|EUR|GBP|USD)/gi.test(message.caption);
        
        if (captionHasTradingInfo) {
          logger.info('Caption contains clear trading information - prioritizing caption over OCR');
          combinedText = message.caption;
          usesCaptionOnly = true;
        } else {
          // Extract text from image if caption doesn't have clear trading info
          const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
          
          // Validate OCR confidence
          if (ocrResult.confidence < 0.6) {
            logger.warn(`❌ Low OCR confidence (${(ocrResult.confidence * 100).toFixed(1)}%)`);
            await ctx.reply(`❌ Image quality too poor for reliable processing.\n\n📊 OCR Confidence: ${(ocrResult.confidence * 100).toFixed(1)}%\n📋 Minimum required: 60%\n\n💡 Please send a clearer, higher-resolution image.`);
            return;
          }
          
          logger.info(`✅ OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);
          logger.info('Extracted text from image:', ocrResult.text);
          
          // Check if OCR text indicates result/update message
          if (this.tradeParser.isResultOrUpdateMessage(ocrResult.text)) {
            logger.info('🚫 OCR text indicates result/update message - skipping trade parsing');
            return;
          }
          
          combinedText = `${message.caption}\n\n--- OCR TEXT FROM IMAGE ---\n${ocrResult.text}`;
          logger.info('Using combined text (caption + OCR) for enhanced parsing');
        }
      } else {
        // No caption, extract text from image
        const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
        
        // Validate OCR confidence
        if (ocrResult.confidence < 0.6) {
          logger.warn(`❌ Low OCR confidence (${(ocrResult.confidence * 100).toFixed(1)}%)`);
          await ctx.reply(`❌ Image quality too poor for reliable processing.\n\n📊 OCR Confidence: ${(ocrResult.confidence * 100).toFixed(1)}%\n📋 Minimum required: 60%\n\n💡 Please send a clearer, higher-resolution image.`);
          return;
        }
        
        logger.info(`✅ OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);
        logger.info('Extracted text from image:', ocrResult.text);
        
        // Validate extracted text quality
        const textValidation = InputValidator.validateExtractedText(ocrResult.text);
        if (!textValidation.isValid) {
          logger.warn('❌ Text validation failed:', textValidation.errors);
          if (!ctx.channelPost) {
            await ctx.reply(`❌ Extracted text quality issues:\n${textValidation.errors.join('\n')}`);
          }
          return;
        }
        
        if (textValidation.warnings.length > 0) {
          logger.warn('⚠️ Text validation warnings:', textValidation.warnings);
        }
        
        // Check if OCR text indicates result/update message
        if (this.tradeParser.isResultOrUpdateMessage(ocrResult.text)) {
          logger.info('🚫 OCR text indicates result/update message - skipping trade parsing');
          return;
        }

        combinedText = ocrResult.text;
      }

      // Parse trade signal from the text
      logger.info('🔍 Parsing trade signal from text:', { 
        textLength: combinedText.length, 
        usesCaptionOnly,
        preview: combinedText.substring(0, 200) + (combinedText.length > 200 ? '...' : '')
      });
      
      const tradeSignal = this.tradeParser.parseTradeSignal(combinedText);
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in image');
        // Only reply if it's not a channel post (channel posts can't be replied to directly)
        if (!ctx.channelPost) {
          await ctx.reply('❌ Could not parse trade signal from image');
        }
        return;
      }

      // Comprehensive validation of trade signal
      const validationResult = InputValidator.validateTradeSignal(tradeSignal);
      
      if (!validationResult.isValid) {
        logger.warn('❌ Trade signal validation failed:', validationResult.errors);
        // Only reply if it's not a channel post
        if (!ctx.channelPost) {
          await ctx.reply(`❌ Invalid trade signal detected:\n${validationResult.errors.join('\n')}`);
        }
        return;
      }
      
      // Log any validation warnings
      if (validationResult.warnings.length > 0) {
        logger.warn('⚠️ Trade signal validation warnings:', validationResult.warnings);
      }
      
      // Use sanitized data from validation
      const sanitizedSignal = validationResult.sanitizedData || tradeSignal;

      // Add position sizing calculations
      try {
        let accountEquity = 10000; // Default fallback
        
        // Try to get actual account equity if available
        if (this.tradeExecutor.getAccountEquity) {
          try {
            accountEquity = await this.tradeExecutor.getAccountEquity();
            
            // Validate account equity
            const equityValidation = InputValidator.validateAccountEquity(accountEquity);
            if (!equityValidation.isValid) {
              logger.warn('❌ Invalid account equity:', equityValidation.errors);
              accountEquity = 10000; // Use fallback
            } else if (equityValidation.warnings.length > 0) {
              logger.warn('⚠️ Account equity warnings:', equityValidation.warnings);
            }
            
            logger.info(`💰 Retrieved account equity: $${accountEquity.toLocaleString()}`);
          } catch (error) {
            logger.warn('Failed to get account equity, using default:', error);
          }
        } else {
          logger.info('💰 Trade executor does not support equity retrieval, using default $10,000');
        }
        
        // Calculate position sizing
        this.tradeParser.addPositionSizing(sanitizedSignal, accountEquity);
        
      } catch (error) {
        logger.error('Failed to calculate position sizing:', error);
        // Continue without position sizing - the trade executor should handle this
      }

      // Send confirmation message
      const confirmationMessage = this.formatTradeSignal(sanitizedSignal);
      const processingInfo = message.caption ? ' (processed caption + image text)' : ' (processed image text only)';
      
      // For channel posts, we might want to send to a specific chat or log only
      if (ctx.channelPost) {
        logger.info(`Trade signal detected from channel post${processingInfo}:`, confirmationMessage);
        // You could send this to a specific admin chat if needed
        // await ctx.telegram.sendMessage(adminChatId, confirmationMessage);
      } else {
        await ctx.reply(confirmationMessage);
      }

      // Execute trade
      try {
        const result = await this.tradeExecutor.executeTradeSignal(sanitizedSignal);
        
        if (result.success) {
          const successMessage = result.signalId 
            ? `✅ Trade signal saved successfully!\n📁 Signal ID: ${result.signalId}\n💾 Waiting for MT5 EA to execute...`
            : `✅ Trade executed successfully!`;
          if (ctx.channelPost) {
            logger.info('Trade execution success:', successMessage);
          } else {
            await ctx.reply(successMessage);
          }
        } else {
          const errorMessage = `❌ Trade execution failed: ${result.error || result.message}`;
          if (ctx.channelPost) {
            logger.error('Trade execution failed:', errorMessage);
          } else {
            await ctx.reply(errorMessage);
          }
        }
      } catch (error) {
        logger.error('Trade execution error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        let replyMessage = '';
        
        if (errorMessage.includes('Not connected to MT5')) {
          replyMessage = '⚠️ Trade signal parsed successfully, but MT5 is not connected.\n💡 Check if trade signal file was created in trade_signals folder.';
        } else {
          replyMessage = '❌ Error executing trade';
        }
        
        if (ctx.channelPost) {
          logger.warn('Trade execution error for channel post:', replyMessage);
        } else {
          await ctx.reply(replyMessage);
        }
      }

    } catch (error) {
      logger.error('Error handling photo:', error);
      // Only reply if it's not a channel post
      if (!ctx.channelPost) {
        await ctx.reply('❌ Error processing image');
      }
    }
  }

  private formatTradeSignal(signal: any): string {
    let message = `🔍 **Trade Signal Detected**\n\n` +
           `📈 Symbol: ${signal.symbol}\n` +
           `📊 Action: ${signal.action}\n` +
           `🎯 Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}\n` +
           `🛑 Stop Loss: ${signal.stopLoss}\n` +
           `🏆 Targets: ${signal.targets.join(', ')}\n`;
           
    // Add position sizing information if available
    if (signal.positionSizing) {
      const ps = signal.positionSizing;
      message += `\n💰 **Position Sizing**\n` +
                 `📊 Lot Size: ${ps.lotSize}\n` +
                 `💵 Risk Amount: $${ps.riskAmount.toFixed(2)}\n` +
                 `📊 Risk Percentage: ${ps.riskPercentage.toFixed(2)}%\n` +
                 `💼 Account Equity: $${ps.accountEquity.toLocaleString()}\n`;
    }
           
    message += `${signal.reason ? `💡 Reason: ${signal.reason}\n` : ''}` +
               `${signal.plan ? `📋 Plan: ${signal.plan}\n` : ''}\n` +
               `⏳ Executing trade...`;
               
    return message;
  }
}
