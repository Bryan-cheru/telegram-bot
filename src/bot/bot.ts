import { Telegraf } from 'telegraf';
import { MessageHandler } from './handlers/messageHandler';
// import { ModernizedPhotoHandler } from './handlers/ModernizedPhotoHandler'; // Disabled complex handler
import { CleanMultiAccountExecutor } from '../mt5/cleanMultiAccountExecutor';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { ValidationService } from '../shared';
import { ManualSignalParser, ParsedManualSignal } from '../services/ManualSignalParser';
import { ClaudeSignalParser } from '../ml/claudeSignalParser';
import { addSignal, updateSignalStatus } from '../dashboard/server';
import { SignalDeduplicator } from '../utils/signalDeduplicator';
import { TradeNotifier } from '../utils/tradeNotifier';
import { DailyLossTracker } from '../utils/dailyLossTracker';
import { getOpenPositionsSummary } from '../utils/positionsMonitor';
import { persistSetting, syncConfigFromEnv } from '../utils/config';

export class TelegramBot {
  private bot: Telegraf;
  private messageHandler: MessageHandler;
  private tradeExecutor: ITradeExecutor;
  private manualSignalParser: ManualSignalParser;
  private deduplicator = new SignalDeduplicator();
  private pendingManualSignals = new Map<string, ParsedManualSignal>();
  private notifier!: TradeNotifier;
  private dailyTracker = new DailyLossTracker(
    config.limits.maxDailyTrades,
    config.limits.dailyLossLimit
  );

  constructor() {
    this.bot = new Telegraf(config.botToken);
    this.tradeExecutor = new CleanMultiAccountExecutor();
    this.messageHandler = new MessageHandler();
    this.manualSignalParser = new ManualSignalParser();
    this.notifier = new TradeNotifier(this.bot);
    this.setupHandlers();
  }

  private isAdminChat(ctx: any): boolean {
    const chatId = ctx.chat?.id?.toString();
    const adminId = config.notificationChatId;
    if (!adminId || chatId !== adminId) {
      // Silently ignore — don't leak that this is an admin command
      return false;
    }
    return true;
  }

  // Getter to share executor with dashboard
  getTradeExecutor(): CleanMultiAccountExecutor {
    return this.tradeExecutor as CleanMultiAccountExecutor;
  }

  private setupHandlers(): void {
    this.bot.start((ctx) => this.messageHandler.handleStart(ctx));
    this.bot.help((ctx) => this.messageHandler.handleHelp(ctx));
    this.bot.command('status', (ctx) => this.messageHandler.handleStatus(ctx));
    this.bot.command('positions', async (ctx) => {
      const summary = await getOpenPositionsSummary(this.tradeExecutor);
      await ctx.reply(summary, { parse_mode: 'Markdown' });
    });
    this.bot.command('stats', async (ctx) => {
      const s = this.dailyTracker.getStats();
      await ctx.reply(
        `📊 *Today's Stats*\n\nTrades: ${s.tradesCount}/${s.maxTrades}\nLoss: $${s.realizedLoss.toFixed(2)} / $${s.lossLimit}`,
        { parse_mode: 'Markdown' }
      );
    });
    this.bot.command('chatid', async (ctx) => {
      const id = ctx.chat?.id;
      await ctx.reply(
        `Your chat ID is: \`${id}\`\n\nSet this in your .env:\n\`NOTIFICATION_CHAT_ID=${id}\``,
        { parse_mode: 'Markdown' }
      );
    });

    // ── Runtime config commands ──────────────────────────────────────────────
    // Only responds to the configured admin chat (NOTIFICATION_CHAT_ID)
    this.bot.command('config', async (ctx) => {
      if (!this.isAdminChat(ctx)) return;
      const t = config.trading;
      const l = config.limits;
      await ctx.reply([
        `⚙️ *Current Config*`,
        ``,
        `*Trading*`,
        `  Risk per trade: $${t.fixedRiskAmount}`,
        `  Lot size: ${t.fixedLotSize}`,
        `  Max lot size: ${t.maxTradeSize}`,
        ``,
        `*Limits*`,
        `  Max trades/day: ${l.maxDailyTrades}`,
        `  Daily loss limit: $${l.dailyLossLimit}`,
        ``,
        `*Commands*`,
        `  /set risk <amount> — e.g. /set risk 50`,
        `  /set lots <size> — e.g. /set lots 0.45`,
        `  /set maxlots <size> — e.g. /set maxlots 1.0`,
        `  /set dailytrades <n> — e.g. /set dailytrades 5`,
        `  /set dailyloss <amount> — e.g. /set dailyloss 200`,
        `  /set bot on|off — pause/resume trading`,
      ].join('\n'), { parse_mode: 'Markdown' });
    });

    this.bot.command('set', async (ctx) => {
      if (!this.isAdminChat(ctx)) return;
      const parts = (ctx.message as any)?.text?.split(/\s+/) ?? [];
      // parts: ['set', 'key', 'value']
      const key = parts[1]?.toLowerCase();
      const value = parts[2];

      if (!key || value === undefined) {
        await ctx.reply('Usage: /set <key> <value>\nSee /config for available keys.');
        return;
      }

      const handlers: Record<string, () => string | null> = {
        risk: () => {
          const v = parseFloat(value);
          if (isNaN(v) || v <= 0) return 'Invalid amount — use a positive number e.g. /set risk 50';
          persistSetting('FIXED_RISK_AMOUNT', String(v));
          syncConfigFromEnv();
          return `✅ Risk per trade set to $${v}`;
        },
        lots: () => {
          const v = parseFloat(value);
          if (isNaN(v) || v <= 0) return 'Invalid lot size';
          persistSetting('FIXED_LOT_SIZE', String(v));
          syncConfigFromEnv();
          return `✅ Lot size set to ${v}`;
        },
        maxlots: () => {
          const v = parseFloat(value);
          if (isNaN(v) || v <= 0) return 'Invalid lot size';
          persistSetting('MAX_TRADE_SIZE', String(v));
          syncConfigFromEnv();
          return `✅ Max lot size set to ${v}`;
        },
        dailytrades: () => {
          const v = parseInt(value);
          if (isNaN(v) || v < 1) return 'Invalid number — must be ≥ 1';
          persistSetting('MAX_DAILY_TRADES', String(v));
          syncConfigFromEnv();
          (this.dailyTracker as any).maxDailyTrades = v;
          return `✅ Max daily trades set to ${v}`;
        },
        dailyloss: () => {
          const v = parseFloat(value);
          if (isNaN(v) || v <= 0) return 'Invalid amount';
          persistSetting('DAILY_LOSS_LIMIT', String(v));
          syncConfigFromEnv();
          return `✅ Daily loss limit set to $${v}`;
        },
        bot: () => {
          if (!['on', 'off'].includes(value.toLowerCase())) return 'Use: /set bot on  or  /set bot off';
          const enabled = value.toLowerCase() === 'on';
          persistSetting('BOT_ENABLED', enabled ? 'true' : 'false');
          syncConfigFromEnv();
          return enabled ? '✅ Trading ENABLED' : '🛑 Trading DISABLED — signals will be ignored';
        },
      };

      const handler = handlers[key];
      if (!handler) {
        await ctx.reply(`Unknown setting: "${key}"\nSee /config for available keys.`);
        return;
      }

      const response = handler();
      if (response) await ctx.reply(response);
    });

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

      // Skip commands — handled by bot.command() above
      if (ctx.message && 'text' in ctx.message && ctx.message.text?.startsWith('/')) return;

      logger.info(`Message received from chat ${ctx.chat?.id} (type: ${ctx.chat?.type})`);
      if (ctx.chat?.id.toString() === config.allowedChannelId) {
        logger.info('Message from configured channel detected');
      }
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
  


  private convertManualToTradeSignal(manual: ParsedManualSignal): import('../types').TradeSignal {
    const half = manual.entryPrice * 0.001;
    return {
      symbol: manual.symbol,
      action: manual.direction,
      entryZone: { min: manual.entryPrice - half, max: manual.entryPrice + half },
      stopLoss: manual.stopLoss,
      targets: [manual.takeProfit],
      orderType: 'LIMIT',
      reason: 'Manual signal (confirmed)',
      plan: 'Manual entry',
      confidence: 1.0
    };
  }

  private async executeSignal(ctx: any, tradeSignal: import('../types').TradeSignal, rawText: string): Promise<void> {
    const validation = ValidationService.validateTradeSignal(tradeSignal);
    if (!validation.isValid) {
      logger.warn('Invalid trade signal:', validation.errors, tradeSignal);
      await ctx.reply(`❌ Signal validation failed: ${validation.errors.join(', ')}`);
      return;
    }

    const signalId = addSignal({
      symbol: tradeSignal.symbol,
      action: tradeSignal.action,
      entryMin: tradeSignal.entryZone.min,
      entryMax: tradeSignal.entryZone.max,
      stopLoss: tradeSignal.stopLoss,
      targets: tradeSignal.targets,
      orderType: tradeSignal.orderType,
      status: 'pending',
      rawText: rawText?.substring(0, 500)
    });

    const limitCheck = this.dailyTracker.canTrade();
    if (!limitCheck.allowed) {
      logger.warn(`🛑 Trade blocked by daily limit: ${limitCheck.reason}`);
      updateSignalStatus(signalId, 'failed', { executionMessage: `Blocked: ${limitCheck.reason}` });
      const stats = this.dailyTracker.getStats();
      if (stats.tradesCount >= stats.maxTrades) {
        await this.notifier.dailyLimitHit(stats.tradesCount, stats.maxTrades);
      } else {
        await this.notifier.dailyLossLimitHit(stats.realizedLoss, stats.lossLimit);
      }
      return;
    }

    try {
      const isConnected = await this.tradeExecutor.isConnected();
      if (!isConnected) {
        logger.error('❌ Trade executor not connected');
        await this.notifier.tradeFailed(tradeSignal, 'Not connected to broker', 'MetaAPI');
        return;
      }

      const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
      updateSignalStatus(signalId, result.success ? 'executed' : 'failed', {
        executionMessage: result.message || result.error,
        ticket: result.ticket
      });

      if (result.success) {
        this.dailyTracker.recordTrade();
        logger.info(`✅ Trade executed! Ticket: ${result.ticket}`);
        await this.notifier.tradeOpened(
          tradeSignal,
          result.ticket ?? 'N/A',
          'Pepperstone',
          result.volume ?? config.trading.fixedLotSize
        );
        try {
          const executor = this.tradeExecutor as any;
          const info = await executor.getAccountInfo?.();
          if (info?.balance) this.dailyTracker.updateBalance(info.balance);
        } catch { /* non-critical */ }
      } else {
        const reason = result.error || result.message || 'Unknown error';
        logger.error(`❌ Trade execution failed: ${reason}`);
        await this.notifier.tradeFailed(tradeSignal, reason, 'Pepperstone');
      }
    } catch (error: any) {
      logger.error('💥 Trade execution threw an exception:', error);
      await this.notifier.tradeFailed(tradeSignal, error?.message ?? String(error), 'Pepperstone');
    }
  }

  private async handleTextMessage(ctx: any): Promise<void> {
    try {
      if (!config.botEnabled) {
        logger.info('🚫 Trading disabled — ignoring signal message');
        return;
      }

      // CONFIRM/CANCEL replies for pending manual signals — checked before the channel
      // guard because admin sends these from a private/admin chat, not the signal channel.
      const earlyMsg = (ctx.message || ctx.channelPost) as any;
      const earlyText = (earlyMsg?.text || earlyMsg?.caption || '').trim();
      const chatIdKey = ctx.chat?.id?.toString() ?? '';

      if (/^confirm$/i.test(earlyText)) {
        if (this.pendingManualSignals.has(chatIdKey)) {
          const manual = this.pendingManualSignals.get(chatIdKey)!;
          this.pendingManualSignals.delete(chatIdKey);
          logger.info('✅ CONFIRM received — executing manual signal');
          await ctx.reply('⏳ Executing trade…');
          await this.executeSignal(ctx, this.convertManualToTradeSignal(manual), earlyText);
          return;
        }
      }

      if (/^cancel$/i.test(earlyText) && this.pendingManualSignals.has(chatIdKey)) {
        this.pendingManualSignals.delete(chatIdKey);
        await ctx.reply('❌ Trade cancelled.');
        return;
      }

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

      // Reject duplicate signals (same text arriving via multiple Telegram paths within 2 min)
      if (this.deduplicator.isDuplicate(text)) {
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

      // 🎯 PRIORITY 1: Ultra-simple manual format ONLY ("XAGUSD BUY 50.9207" — no TP/SL lines, no "Now"/"Limit")
      // Skip for channel signals which always have TP/SL lines or "Now"/"Limit" keywords.
      const isChannelFormat = /\b(now|limit)\b/i.test(text) || /\bTP\b/i.test(text) || /\bSL\b/i.test(text);
      if (!isChannelFormat) {
        const manualSignal = this.manualSignalParser.parseSignal(text);
        if (manualSignal) {
          logger.info('✅ Manual signal detected - requesting confirmation');
          const confirmationMsg = this.manualSignalParser.generateConfirmationMessage(manualSignal);
          await ctx.reply(confirmationMsg, { parse_mode: 'Markdown' });
          this.pendingManualSignals.set(chatId, manualSignal);
          logger.info(`📋 Manual signal stored for confirmation from chat ${chatId}`);
          return;
        }
      }

      // 🎯 PRIORITY 2: Check if this is a manual trading command (OLD FORMAT)
      if (MessageHandler.isManualTradingCommand(text)) {
        logger.info('🎯 Manual trading command detected (legacy format)');
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
            if (!response.ok) {
              logger.warn(`⚠️ Telegram file download failed (HTTP ${response.status}) — skipping image`);
            } else {
              imageBuffer = Buffer.from(await response.arrayBuffer());
              hasChartImage = true;
              logger.info(`✅ Chart image downloaded: ${imageBuffer.length} bytes`);
            }
          }
        } catch (error) {
          logger.warn('⚠️ Failed to download chart image:', error);
        }
      }

      // 🔗 TradingView link preview support: if there is a TradingView link but no Telegram image,
      // attempt to fetch the OG preview image for visual analysis.
      if (!hasChartImage) {
        const tvMatch = text.match(/https?:\/\/(?:www\.)?tradingview\.com\/x\/[A-Za-z0-9]+\/?/);
        if (tvMatch) {
          const tvUrl = tvMatch[0];
          logger.info(`🔗 TradingView link detected, attempting preview fetch: ${tvUrl}`);
          try {
            const htmlResp = await fetch(tvUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TelegramTradingBot/1.0)'
              }
            });
            const html = await htmlResp.text();
            const ogImage =
              html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
              html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i)?.[1];
            if (ogImage) {
              const imgResp = await fetch(ogImage, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TelegramTradingBot/1.0)' }
              });
              if (imgResp.ok) {
                imageBuffer = Buffer.from(await imgResp.arrayBuffer());
                hasChartImage = true;
                logger.info(`✅ TradingView preview image fetched: ${imageBuffer.length} bytes`);
              } else {
                logger.warn(`⚠️ TradingView preview fetch failed (status ${imgResp.status})`);
              }
            } else {
              logger.warn('⚠️ TradingView page had no og:image');
            }
          } catch (error) {
            logger.warn('⚠️ TradingView preview fetch failed:', error);
          }
        }
      }
      
      // Parse with enhanced capabilities
      const tradeSignal = await CleanRealWorldTradeParser.parseTradeSignal(text, undefined, hasChartImage, imageBuffer);
      
      if (!tradeSignal) {
        logger.warn('No valid trade signal found in text message');
        return;
      }

      const signalInfo = `Symbol: ${tradeSignal.symbol}, Action: ${tradeSignal.action}, Entry: ${tradeSignal.entryZone.min}-${tradeSignal.entryZone.max}, Targets: ${tradeSignal.targets.join(', ')}`;
      logger.info('Trade signal detected from text:', signalInfo);

      await this.executeSignal(ctx, tradeSignal, text);

    } catch (error) {
      logger.error('Error handling text message:', error);
    }
  }

  private async handleChartImage(ctx: any): Promise<void> {
    try {
      logger.info('🖼️ Photo-only signal received — routing to Claude AI...');

      const imgChatId = ctx.chat?.id?.toString();
      const imgChatUsername = (ctx.chat as any)?.username;
      const isAllowedImageSource =
        (config.allowedChannelId && imgChatId === config.allowedChannelId) ||
        (config.allowedChannelUsername && imgChatUsername === config.allowedChannelUsername);
      if (!isAllowedImageSource) {
        logger.info('❌ Image not from configured channel, ignoring');
        return;
      }

      const photo = ctx.channelPost.photo;
      if (!photo || photo.length === 0) {
        logger.warn('No photo found in message');
        return;
      }

      const highestResPhoto = photo[photo.length - 1];
      logger.info(`📷 Processing photo: ${highestResPhoto.width}x${highestResPhoto.height}`);

      const fileLink = await ctx.telegram.getFileLink(highestResPhoto.file_id);
      const response = await fetch(fileLink.href);
      if (!response.ok) {
        logger.warn(`⚠️ Failed to download image (HTTP ${response.status}) — skipping`);
        return;
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      logger.info(`📦 Downloaded ${imageBuffer.length} bytes — sending to Claude AI`);

      const tradeSignal = await ClaudeSignalParser.parse('', undefined, imageBuffer);

      if (!tradeSignal) {
        logger.info('ℹ️ Claude found no trade signal in this image');
        return;
      }

      logger.info('✅ Claude extracted signal from image:', {
        symbol: tradeSignal.symbol,
        action: tradeSignal.action,
        entry: `${tradeSignal.entryZone.min}–${tradeSignal.entryZone.max}`,
        stopLoss: tradeSignal.stopLoss,
        targets: tradeSignal.targets
      });

      const isConnected = await this.tradeExecutor.isConnected();
      if (!isConnected) {
        logger.error('❌ Trade executor not connected — cannot execute image-based signal');
        return;
      }

      const result = await this.tradeExecutor.executeTradeSignal(tradeSignal);
      if (result.success) {
        logger.info('✅ Image-based trade executed successfully');
      } else {
        logger.error(`❌ Image-based trade failed: ${result.error || result.message}`);
      }

    } catch (error) {
      logger.error('💥 Error handling chart image:', error);
    }
  }

  async start(): Promise<void> {
    try {
      // Initialize Multi-Account trade executor with timeout
      logger.info('🔄 Attempting to initialize Multi-Account MetaAPI Trade Executor...');
      let tradeExecutorReady = false;
      
      try {
        // Reduced timeout for faster startup - 30 seconds max
        logger.info('⏱️ MetaAPI initialization timeout: 30 seconds');
        await Promise.race([
          this.tradeExecutor.initialize(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('MetaAPI initialization timeout (30s) - continuing with limited functionality')), 30000) // 30 seconds max
          )
        ]);
        
        // Verify the connection after initialization
        const isConnected = await this.tradeExecutor.isConnected();
        if (isConnected) {
          logger.info('✅ Multi-Account MetaAPI Trade executor initialized and connected successfully');
          tradeExecutorReady = true;
        } else {
          logger.warn('❌ Trade executor initialized but not fully connected - signal parsing available');
          tradeExecutorReady = false;
        }
        
      } catch (error: any) {
        logger.warn('⚠️ Multi-Account Trade executor initialization failed or timeout after 30s:', error?.message || String(error));
        logger.info('📊 Bot will continue with limited functionality (signal parsing only)');
        logger.info('💡 Check MetaAPI token, account configuration, and internet connection');
        tradeExecutorReady = false;
      }
      
      if (!tradeExecutorReady) {
        logger.warn('⚠️ Bot running without full trade execution capability');
        logger.info('ℹ️ OCR and parsing will work, but trades may not execute');
        logger.info('🔧 Check your MetaAPI configuration and account status in background');
      } else {
        logger.info('🎯 Trade execution is ready and available');
        // Capture opening balance for daily loss tracking
        try {
          const executor = this.tradeExecutor as any;
          const accounts = await executor.getAccountsSummary?.();
          if (accounts?.totalBalance) {
            this.dailyTracker.setOpeningBalance(accounts.totalBalance);
          }
        } catch { /* non-critical */ }
      }
      
      // Clear any existing webhook before starting polling to avoid 409 conflicts
      try {
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
        logger.info('🧹 Webhook cleared — starting polling');
      } catch (e) {
        // Not fatal — continue anyway
      }

      // Always start the bot regardless of MetaAPI status
      logger.info('🚀 Launching Telegram bot...');
      this.bot.launch();
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      logger.info('✅ Telegram bot started successfully');
      logger.info('📱 Bot is now listening for trading signals...');

      // Post startup summary to notification chat
      if (config.notificationChatId) {
        try {
          const positionsSummary = await getOpenPositionsSummary(this.tradeExecutor);
          const limits = this.dailyTracker.getStats();
          const startupMsg = [
            `🤖 *Bot Started*`,
            ``,
            `📊 Risk: $${config.trading.fixedRiskAmount} / trade | Max lot: ${config.trading.maxTradeSize}`,
            `🛡️ Limits: ${limits.maxTrades} trades/day | $${limits.lossLimit} loss/day`,
            ``,
            positionsSummary,
          ].join('\n');
          await this.bot.telegram.sendMessage(config.notificationChatId, startupMsg, { parse_mode: 'Markdown' });
        } catch (e) {
          logger.warn('Could not send startup notification:', e);
        }
      }
      
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
