import { Context } from 'telegraf';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import { ManualTradingCommands, ManualTradeCommand } from '../../utils/manualTradingCommands';

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

**🤖 Automatic Trading:**
Send trading screenshots to process automatically

**⚡ Manual Trading Commands:**
For precise control or unclear signals, use these formats:

\`Open Order #34558496 Buy 0.1 #EURUSD @1.18079\`
\`BUY 0.05 #SILVER @30.50 SL:30.00 TP:31.00\`
\`SELL 0.1 XAUUSD @ 2650 sl 2660 tp 2640\`

**📋 Manual Command Syntax:**
• \`BUY/SELL\` - Trade direction
• \`0.1\` - Lot size (volume)
• \`#SYMBOL\` - Trading symbol (# optional)
• \`@price\` - Entry price (optional)
• \`SL:price\` - Stop loss (optional)
• \`TP:price\` - Take profit (optional)

**🔄 Symbol Conversions:**
• SILVER → XAGUSD
• GOLD → XAUUSD

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
• MetaAPI Token: ${config.metaApi.token ? '✅ Set' : '❌ Missing'}
• MetaAPI Account: ${config.metaApi.accountId ? '✅ Set' : '❌ Missing'}

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

  /**
   * Handle manual trading commands
   * Examples: "Open Order #34558496 Buy 0.1 #EURUSD @1.18079"
   *          "BUY 0.05 #SILVER @30.50 SL:30.00 TP:31.00"
   */
  async handleManualCommand(ctx: Context, messageText: string, tradeExecutor?: any): Promise<void> {
    try {
      logger.info(`🎯 Processing manual trading command: "${messageText}"`);
      
      const command = ManualTradingCommands.parseManualCommand(messageText);
      
      if (!command) {
        logger.warn('❌ Could not parse manual command');
        await ctx.reply('❌ Could not parse trading command. Please check the format.');
        return;
      }
      
      // Validate command
      const validation = ManualTradingCommands.validateCommand(command);
      if (!validation.valid) {
        logger.warn(`❌ Invalid manual command: ${validation.error}`);
        await ctx.reply(`❌ Invalid command: ${validation.error}`);
        return;
      }
      
      // Format command for confirmation
      const formattedCommand = ManualTradingCommands.formatCommand(command);
      logger.info(`✅ Parsed manual command: ${formattedCommand}`);
      
      // Send confirmation
      await ctx.reply(`🎯 **Manual Trade Command Parsed:**\n\`${formattedCommand}\`\n\n⏳ Executing trade...`);
      
      // Convert to trade signal format for execution
      const tradeSignal = this.convertManualCommandToTradeSignal(command);
      
      // Execute the trade if trade executor is available
      if (tradeExecutor) {
        try {
          const isConnected = await tradeExecutor.isConnected();
          
          if (!isConnected) {
            logger.error('❌ Trade executor is not connected - cannot execute manual trades');
            await ctx.reply('❌ Trade executor is not connected. Please check MetaAPI connections.');
            return;
          }
          
          logger.info('� Executing manual trade command...');
          const result = await tradeExecutor.executeTradeSignal(tradeSignal);
          
          if (result.success) {
            const successMessage = `✅ **Manual Trade Executed Successfully!**\n📝 Command: ${formattedCommand}\n🎯 Signal ID: ${result.signalId || 'N/A'}`;
            logger.info('✅ Manual trade executed successfully');
            await ctx.reply(successMessage);
          } else {
            const errorMessage = `❌ **Manual Trade Failed**\n📝 Command: ${formattedCommand}\n🚨 Error: ${result.error || result.message}`;
            logger.error('❌ Manual trade execution failed:', result.error);
            await ctx.reply(errorMessage);
          }
          
        } catch (executionError) {
          logger.error('💥 Manual trade execution threw an exception:', executionError);
          await ctx.reply(`❌ **Manual Trade Exception**\n📝 Command: ${formattedCommand}\n🚨 Error: ${executionError}`);
        }
      } else {
        logger.warn('🔄 Trade executor not provided - manual command parsed but not executed');
        await ctx.reply(`✅ Manual command processed successfully!\n📝 Command: ${formattedCommand}\n🔄 Trade executor integration pending...`);
      }
      
    } catch (error) {
      logger.error('❌ Error processing manual command:', error);
      await ctx.reply('❌ Error processing manual command. Please try again.');
    }
  }
  
  /**
   * Convert manual command to trade signal format
   */
  private convertManualCommandToTradeSignal(command: ManualTradeCommand): any {
    return {
      symbol: command.symbol,
      action: command.action.toLowerCase(),
      volume: command.volume,
      entry: command.price,
      stopLoss: command.stopLoss,
      targets: command.takeProfit ? [command.takeProfit] : [],
      isManual: true,
      source: 'MANUAL_COMMAND',
      orderId: command.orderId
    };
  }

  /**
   * Check if a message is a manual trading command
   */
  static isManualTradingCommand(messageText: string): boolean {
    return ManualTradingCommands.isManualCommand(messageText);
  }
}
