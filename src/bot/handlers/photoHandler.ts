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
      messageId: (ctx.message || ctx.channelPost)?.message_id
    });

    try {
      logger.info('📸 Processing photo message...');
      tracer.logToSpan(traceId, 'Starting photo processing');
      this.metrics.recordSignal(ctx.chat?.id.toString() || 'direct', 'photo');

      // Get the message object (could be ctx.message or ctx.channelPost)
      const message = (ctx.message || ctx.channelPost) as any;
      
      // Debug logging to help identify the issue
      if (ctx.channelPost) {
        logger.info('📢 Processing channel post');
        logger.info('Channel post content type:', Object.keys(ctx.channelPost));
      } else if (ctx.message) {
        logger.info('💬 Processing direct message');
        logger.info('Message content type:', Object.keys(ctx.message));
      }
      
      if (!message) {
        logger.warn('No message or channel post found');
        tracer.logToSpan(traceId, 'No message or channel post found', 'warn');
        return;
      }

      // Check channel authorization
      const chatId = ctx.chat?.id;
      const channelUsername = (ctx.chat as any)?.username;
      
      const isAuthorized = chatId?.toString() === config.allowedChannelId || 
                          config.allowedChannelId === channelUsername;
      
      if (!isAuthorized) {
        logger.warn(`Unauthorized photo from chat ${chatId} (${channelUsername})`);
        tracer.logToSpan(traceId, `Unauthorized channel: ${chatId}`, 'warn');
        return;
      }

      // Extract photo file ID (handle both photos and image documents)
      let fileId: string | null = null;
      let photo: any = null;
      
      if (message.photo && message.photo.length > 0) {
        // Regular photo message
        const photos = message.photo;
        photo = photos[photos.length - 1]; // Get highest resolution
        fileId = photo.file_id;
        logger.info(`📸 Processing photo: ${photo.file_id} (${photo.width}x${photo.height})`);
      } else if (message.document?.mime_type?.startsWith('image/')) {
        // Image sent as document
        photo = message.document;
        fileId = photo.file_id;
        logger.info(`📸 Processing image document: ${photo.file_id}`);
      }

      if (!fileId) {
        logger.warn('No photo or image document found in message');
        tracer.logToSpan(traceId, 'No photo or image document found', 'warn');
        return;
      }
      
      logger.info(`📸 Processing photo: ${photo.file_id} (${photo.width}x${photo.height})`);

      // Download image and extract text
      tracer.logToSpan(traceId, 'Downloading image from Telegram');
      const fileUrl = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileUrl.href);
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      
      // Get caption if present
      const caption = message.caption || '';
      let tradeSignal = null;

      // ALWAYS extract OCR text from chart images to get price levels
      logger.info('📖 Extracting text from chart image...');
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
        if (!ctx.channelPost) {
          await ctx.reply('❌ Could not extract text from image');
        }
        return;
      }

      if (ocrResult.confidence < 0.5) {
        logger.warn(`❌ OCR confidence too low: ${(ocrResult.confidence * 100).toFixed(1)}%`);
        tracer.logToSpan(traceId, `Low OCR confidence: ${ocrResult.confidence}`, 'warn');
        if (!ctx.channelPost) {
          await ctx.reply(`❌ Image quality too poor for reliable processing. OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);
        }
        return;
      }

      logger.info('📄 Extracted text from image:', ocrResult.text.substring(0, 200));
      logger.info(`📊 OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);

      // Process based on whether there's a caption or not
      if (caption && caption.trim().length > 0) {
        logger.info(`📝 Caption found: "${caption.substring(0, 100)}..."`);
        tracer.logToSpan(traceId, 'Processing with caption');
        
        // Parse trade signal using ML-enhanced method with caption AND OCR text
        tracer.logToSpan(traceId, 'Starting trade signal parsing with caption and OCR');
        tradeSignal = await CleanRealWorldTradeParser.parseTradeSignal(
          ocrResult.text,  // Use OCR text for price detection
          caption,         // Use caption for context
          true,           // hasChartImage
          imageBuffer     // imageBuffer for ML analysis
        );
      } else {
        // No caption - use OCR text only
        logger.info('📖 No caption found, using OCR only...');
        tracer.logToSpan(traceId, 'Starting trade signal parsing with OCR text only');
        
        // Parse trade signal using OCR text
        tradeSignal = await CleanRealWorldTradeParser.parseTradeSignal(
          ocrResult.text, 
          '', 
          true, // hasChartImage
          imageBuffer // imageBuffer for ML analysis
        );
      }
      
      if (!tradeSignal || !tradeSignal.symbol) {
        logger.warn('No valid trade signal found in image');
        tracer.logToSpan(traceId, 'No valid trade signal detected', 'warn');
        if (!ctx.channelPost) {
          await ctx.reply('❌ No valid trade signal detected in image');
        }
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

      // Send confirmation message (only for non-channel posts)
      if (!ctx.channelPost) {
        const confirmationMessage = `
🎯 **Trade Signal Detected from Image**

**Symbol:** ${tradeSignal.symbol}
**Action:** ${tradeSignal.action}
**Entry Zone:** ${tradeSignal.entryZone?.min?.toFixed(5) || 'N/A'} - ${tradeSignal.entryZone?.max?.toFixed(5) || 'N/A'}
**Stop Loss:** ${tradeSignal.stopLoss?.toFixed(5) || 'N/A'}
**Targets:** ${tradeSignal.targets?.map((t: number) => t.toFixed(5)).join(', ') || 'N/A'}
**Order Type:** ${tradeSignal.orderType || 'LIMIT'}

⏳ Executing trade...
        `.trim();

        await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });
      }

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

      // Send result message (only for non-channel posts)
      if (result.success) {
        if (!ctx.channelPost) {
          await ctx.reply(`✅ Trade executed successfully!\n${result.message || ''}`);
        }
        logger.info('✅ Trade executed successfully from image signal');
        tracer.logToSpan(traceId, 'Trade executed successfully');
      } else {
        if (!ctx.channelPost) {
          await ctx.reply(`❌ Trade execution failed: ${result.error || 'Unknown error'}`);
        }
        logger.error('❌ Trade execution failed:', result.error);
        tracer.logToSpan(traceId, `Trade execution failed: ${result.error}`, 'error');
        this.metrics.recordError('trade_execution', 'PhotoHandler', 'high');
      }

    } catch (error) {
      logger.error('Error processing photo:', error);
      tracer.addTagsToSpan(traceId, { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      tracer.logToSpan(traceId, `Error processing photo: ${error}`, 'error');
      this.metrics.recordError('photo_processing', 'PhotoHandler', 'high');
      if (!ctx.channelPost) {
        await ctx.reply('❌ Error processing image. Please try again.');
      }
    } finally {
      tracer.finishSpan(traceId);
    }
  }
}
