import { Context } from 'telegraf';
import { ITradeExecutor } from '../../types/ITradeExecutor';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { CleanRealWorldTradeParser } from '../../ocr/cleanRealWorldTradeParser';
import { TextExtractor } from '../../ocr/textExtractor';

export class PhotoHandler {
  private tradeExecutor: ITradeExecutor;
  private textExtractor: TextExtractor;
  private tradeParser: CleanRealWorldTradeParser;

  constructor(tradeExecutor: ITradeExecutor) {
    this.tradeExecutor = tradeExecutor;
    this.textExtractor = new TextExtractor();
    this.tradeParser = new CleanRealWorldTradeParser();
  }

  async handlePhoto(ctx: Context): Promise<void> {
    try {
      logger.info('📸 Processing photo message...');

      // Check if message has photos
      if (!ctx.message || !('photo' in ctx.message)) {
        logger.warn('No photo found in message');
        return;
      }

      // Check channel authorization
      const chatId = ctx.chat?.id;
      const channelUsername = (ctx.chat as any)?.username;
      
      const isAuthorized = chatId?.toString() === config.allowedChannelId || 
                          config.allowedChannelId === channelUsername;
      
      if (!isAuthorized) {
        logger.warn(`Unauthorized photo from chat ${chatId} (${channelUsername})`);
        return;
      }

      // Get the highest resolution photo
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      
      logger.info(`📸 Processing photo: ${photo.file_id} (${photo.width}x${photo.height})`);

      // Download image and extract text
      const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(fileUrl.href);
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      
      const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
      
      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        logger.warn('No text extracted from image');
        await ctx.reply('❌ Could not extract text from image');
        return;
      }

      logger.info('📄 Extracted text from image:', ocrResult.text.substring(0, 200));
      logger.info(`📊 OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);

      // Get caption if present
      const caption = ctx.message.caption || '';
      
      // Parse trade signal using ML-enhanced method with image buffer
      const tradeSignal = await CleanRealWorldTradeParser.parseTradeSignal(
        ocrResult.text, 
        caption, 
        true, // hasChartImage
        imageBuffer // imageBuffer for ML analysis
      );
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in image');
        await ctx.reply('❌ No valid trade signal detected in image');
        return;
      }

      logger.info('✅ Trade signal parsed from image:', {
        symbol: tradeSignal.symbol,
        action: tradeSignal.action,
        entryZone: tradeSignal.entryZone,
        stopLoss: tradeSignal.stopLoss,
        targets: tradeSignal.targets
      });

      // Send confirmation message
      const confirmationMessage = `
🎯 **Trade Signal Detected from Image**

**Symbol:** ${tradeSignal.symbol}
**Action:** ${tradeSignal.action}
**Entry Zone:** ${tradeSignal.entryZone.min.toFixed(5)} - ${tradeSignal.entryZone.max.toFixed(5)}
**Stop Loss:** ${tradeSignal.stopLoss.toFixed(5)}
**Targets:** ${tradeSignal.targets.map((t: number) => t.toFixed(5)).join(', ')}
**Order Type:** ${tradeSignal.orderType || 'LIMIT'}

⏳ Executing trade...
      `.trim();

      await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });

      // Execute trade
      const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);

      // Send result message
      if (result.success) {
        await ctx.reply(`✅ Trade executed successfully!\n${result.message || ''}`);
        logger.info('✅ Trade executed successfully from image signal');
      } else {
        await ctx.reply(`❌ Trade execution failed: ${result.error || 'Unknown error'}`);
        logger.error('❌ Trade execution failed:', result.error);
      }

    } catch (error) {
      logger.error('Error processing photo:', error);
      await ctx.reply('❌ Error processing image. Please try again.');
    }
  }
}
