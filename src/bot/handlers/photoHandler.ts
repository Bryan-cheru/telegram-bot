import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { TextExtractor } from '../../ocr/textExtractor';
import { TradeParser } from '../../ocr/tradeParser';
import { ITradeExecutor } from '../../types/ITradeExecutor';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
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

      // Extract text from image
      const extractedText = await this.textExtractor.extractTextFromImage(imageBuffer);
      logger.info('Extracted text:', extractedText);

      // Parse trade signal
      const tradeSignal = this.tradeParser.parseTradeSignal(extractedText);
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in image');
        // Only reply if it's not a channel post (channel posts can't be replied to directly)
        if (!ctx.channelPost) {
          await ctx.reply('❌ Could not parse trade signal from image');
        }
        return;
      }

      // Validate trade signal
      if (!this.tradeParser.validateTradeSignal(tradeSignal)) {
        logger.warn('Invalid trade signal:', tradeSignal);
        // Only reply if it's not a channel post
        if (!ctx.channelPost) {
          await ctx.reply('❌ Invalid trade signal detected');
        }
        return;
      }

      // Send confirmation message
      const confirmationMessage = this.formatTradeSignal(tradeSignal);
      // For channel posts, we might want to send to a specific chat or log only
      if (ctx.channelPost) {
        logger.info('Trade signal detected from channel post:', confirmationMessage);
        // You could send this to a specific admin chat if needed
        // await ctx.telegram.sendMessage(adminChatId, confirmationMessage);
      } else {
        await ctx.reply(confirmationMessage);
      }

      // Execute trade
      try {
        const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
        
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
    return `🔍 **Trade Signal Detected**\n\n` +
           `📈 Symbol: ${signal.symbol}\n` +
           `📊 Action: ${signal.action}\n` +
           `🎯 Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}\n` +
           `🛑 Stop Loss: ${signal.stopLoss}\n` +
           `🏆 Targets: ${signal.targets.join(', ')}\n` +
           `${signal.reason ? `💡 Reason: ${signal.reason}\n` : ''}` +
           `${signal.plan ? `📋 Plan: ${signal.plan}\n` : ''}\n` +
           `⏳ Executing trade...`;
  }
}
