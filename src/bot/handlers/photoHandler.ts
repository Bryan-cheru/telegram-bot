import { Context } from 'telegraf';
import { ITradeExecutor } from '../../types/ITradeExecutor';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { CleanRealWorldTradeParser } from '../../ocr/cleanRealWorldTradeParser';
import { TextExtractor } from '../../ocr/textExtractor';
import { DistributedTracing, Traced } from '../../monitoring/distributedTracing';
import { MetricsExporter } from '../../monitoring/metricsExporter';

export class PhotoHandler {
  private tradeExecutor: ITradeExecutor;
  private textExtractor: TextExtractor;
  private tradeParser: CleanRealWorldTradeParser;
  private metrics: MetricsExporter;

  constructor(tradeExecutor: ITradeExecutor) {
    this.tradeExecutor = tradeExecutor;
    this.textExtractor = new TextExtractor();
    this.tradeParser = new CleanRealWorldTradeParser();
    this.metrics = MetricsExporter.getInstance();
  }

  async handlePhoto(ctx: Context): Promise<void> {
    const tracer = DistributedTracing.getInstance();
    const traceId = tracer.startSpan('photo-processing', undefined, {
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      messageId: ctx.message?.message_id
    });

    try {
      logger.info('📸 Processing photo message...');
      tracer.logToSpan(traceId, 'Starting photo processing');
      this.metrics.recordSignal(ctx.chat?.id.toString() || 'direct', 'photo');

      // Check if message has photos
      if (!ctx.message || !('photo' in ctx.message)) {
        logger.warn('No photo found in message');
        tracer.logToSpan(traceId, 'No photo found in message', 'warn');
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
      tracer.logToSpan(traceId, 'Downloading image from Telegram');
      const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
      const response = await fetch(fileUrl.href);
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      
      tracer.logToSpan(traceId, 'Starting OCR extraction');
      const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
      tracer.addTagsToSpan(traceId, { 
        extractedTextLength: ocrResult.text?.length || 0,
        ocrConfidence: ocrResult.confidence 
      });
      this.metrics.recordOCR('tesseract', !!ocrResult.text);
      
      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        logger.warn('No text extracted from image');
        tracer.logToSpan(traceId, 'No text extracted from image', 'warn');
        await ctx.reply('❌ Could not extract text from image');
        return;
      }

      logger.info('📄 Extracted text from image:', ocrResult.text.substring(0, 200));
      logger.info(`📊 OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);

      // Get caption if present
      const caption = ctx.message.caption || '';
      
      // Parse trade signal using ML-enhanced method with image buffer
      tracer.logToSpan(traceId, 'Starting trade signal parsing');
      const tradeSignal = await CleanRealWorldTradeParser.parseTradeSignal(
        ocrResult.text, 
        caption, 
        true, // hasChartImage
        imageBuffer // imageBuffer for ML analysis
      );
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in image');
        tracer.logToSpan(traceId, 'No valid trade signal detected', 'warn');
        await ctx.reply('❌ No valid trade signal detected in image');
        return;
      }

      tracer.addTagsToSpan(traceId, { 
        symbol: tradeSignal.symbol,
        action: tradeSignal.action,
        orderType: tradeSignal.orderType 
      });

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
      tracer.logToSpan(traceId, 'Executing trade signal');
      const executionStart = Date.now();
      const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
      const executionTime = Date.now() - executionStart;
      
      tracer.addTagsToSpan(traceId, { 
        tradeExecuted: result.success,
        executionResult: result.success ? 'success' : 'failure',
        executionTimeMs: executionTime
      });

      // Record trade metrics
      this.metrics.recordTrade(
        'default', 
        tradeSignal.symbol, 
        tradeSignal.action, 
        result.success, 
        executionTime
      );

      // Send result message
      if (result.success) {
        await ctx.reply(`✅ Trade executed successfully!\n${result.message || ''}`);
        logger.info('✅ Trade executed successfully from image signal');
        tracer.logToSpan(traceId, 'Trade executed successfully');
      } else {
        await ctx.reply(`❌ Trade execution failed: ${result.error || 'Unknown error'}`);
        logger.error('❌ Trade execution failed:', result.error);
        tracer.logToSpan(traceId, `Trade execution failed: ${result.error}`, 'error');
        this.metrics.recordError('trade_execution', 'PhotoHandler', 'high');
      }

    } catch (error) {
      logger.error('Error processing photo:', error);
      tracer.addTagsToSpan(traceId, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      tracer.logToSpan(traceId, `Error processing photo: ${error}`, 'error');
      await ctx.reply('❌ Error processing image. Please try again.');
    } finally {
      tracer.finishSpan(traceId);
    }
  }
}
