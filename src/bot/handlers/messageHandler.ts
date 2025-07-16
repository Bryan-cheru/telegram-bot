import { Context } from 'telegraf';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';

export class MessageHandler {
  async handleStart(ctx: Context): Promise<void> {
    const welcomeMessage = `
🤖 **Telegram Trading Bot**

Welcome! This bot automatically processes trading screenshots and executes trades on MT5.

**Features:**
• 📷 Image OCR processing
• 📊 Trade signal parsing
• 🔄 Automatic MT5 execution
• 🎯 Multi-target support
• 🛑 Risk management

**Usage:**
Simply send trading screenshots to the configured channel, and the bot will:
1. Extract text from the image
2. Parse trade information
3. Execute trades on MT5 automatically

**Status:** ${config.botToken ? '✅ Configured' : '❌ Not configured'}
    `;
    
    await ctx.reply(welcomeMessage);
    logger.info(`Start command executed by user ${ctx.from?.id}`);
  }

  async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `
📖 **Help & Commands**

**/start** - Welcome message and bot status
**/help** - This help message
**/status** - Check bot and MT5 connection status

**Supported Image Formats:**
• Trading screenshots with text
• Clear, readable text preferred
• Supports standard trade signal formats

**Required Information in Images:**
• Symbol (e.g., #XAUUSD)
• Buy/Sell action
• Entry zone
• Stop loss
• Target prices
• Optional: Reason and plan

**Example Format:**
\`#XAUUSD Sell Setup
Selling Zone: 3345 - 3351
Stop Loss: 3367
Target 1: 3312.430
Target 2: 3295.385\`
    `;
    
    await ctx.reply(helpMessage);
    logger.info(`Help command executed by user ${ctx.from?.id}`);
  }

  async handleStatus(ctx: Context): Promise<void> {
    try {
      // Check bot configuration
      const botConfigured = config.botToken && config.allowedChannelId;
      
      const statusMessage = `
🔍 **Bot Status**

**Configuration:**
• Bot Token: ${config.botToken ? '✅ Set' : '❌ Missing'}
• Channel ID: ${config.allowedChannelId ? '✅ Set' : '❌ Missing'}
• MT5 Host: ${config.mt5.host}:${config.mt5.port}

**Status:** ${botConfigured ? '✅ Ready' : '❌ Configuration incomplete'}

**Settings:**
• Max Trade Size: ${config.trading.maxTradeSize}
• Risk Percentage: ${config.trading.riskPercentage}%
      `;
      
      await ctx.reply(statusMessage);
      logger.info(`Status command executed by user ${ctx.from?.id}`);
      
    } catch (error) {
      logger.error('Error checking status:', error);
      await ctx.reply('❌ Error checking bot status');
    }
  }

  async handleUnknown(ctx: Context): Promise<void> {
    await ctx.reply('❓ Unknown command. Use /help to see available commands.');
    logger.info(`Unknown command from user ${ctx.from?.id}: ${ctx.message}`);
  }
}
