import { Context } from 'telegraf';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import { ManualTradingCommands, ManualTradeCommand } from '../../utils/manualTradingCommands';

export class MessageHandler {
  // Authentication removed - trading-only system

  constructor() {
    // System ready for trading message processing
  }

  // Authentication removed - focus on trading functionality only

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
📖 **Complete Trading Bot Commands**

**/start** - Welcome message and bot status
**/help** - This help message  
**/status** - Check bot and MT5 connection status

**🤖 Automatic Trading:**
Send trading screenshots to process automatically

**⚡ MANUAL TRADING COMMANDS:**

**📈 OPENING TRADES:**
\`BUY 0.1 XAUUSD @ 2650 SL:2640 TP:2670\`
\`SELL 0.05 #SILVER @30.50 SL:30.00 TP:31.00\`
\`Open Order #12345 Buy 0.1 #EURUSD @1.1800\`
\`XAUUSD BUY 0.1 @ 2650\`

**📉 CLOSING TRADES:**
\`CLOSE ALL\` - Close all open positions
\`CLOSE #12345678\` - Close specific ticket number
\`CLOSE XAUUSD\` - Close all Gold positions
\`CLOSE BUY XAUUSD\` - Close only buy positions for Gold
\`CLOSE SELL\` - Close all sell positions
\`CLOSE BUY\` - Close all buy positions

**� STATUS & INFO COMMANDS:**
\`STATUS\` or \`ACCOUNT\` - Show account information
\`POSITIONS\` or \`TRADES\` - Show open positions
\`BALANCE\` or \`EQUITY\` - Show account balance

**📋 Command Syntax Guide:**
• \`BUY/SELL\` - Trade direction
• \`0.1\` - Lot size (volume)
• \`#SYMBOL\` - Trading symbol (# optional)
• \`@price\` - Entry price (optional for market orders)
• \`SL:price\` - Stop loss (optional)
• \`TP:price\` - Take profit (optional)

**🔄 Symbol Auto-Conversion:**
• SILVER → XAGUSD (Silver)
• GOLD → XAUUSD (Gold)
• Other symbols remain unchanged

**📱 Usage Examples:**

**Quick Buy/Sell:**
\`BUY 0.1 GOLD\` - Market buy 0.1 lots Gold
\`SELL 0.05 SILVER @ 30.50\` - Limit sell Silver at 30.50

**With Risk Management:**
\`BUY 0.1 XAUUSD @ 2650 SL:2640 TP:2670\`
\`SELL 0.1 EURUSD SL:1.0850 TP:1.0800\`

**Position Management:**
\`CLOSE XAUUSD\` - Close all Gold trades
\`CLOSE #87654321\` - Close specific ticket
\`STATUS\` - Check account info

**📸 Automatic Image Processing:**
Send trading screenshots with signals in formats like:
\`#XAUUSD Sell Setup
Selling Zone: 2650 - 2655
Stop Loss: 2667
Target 1: 2635
Target 2: 2620\`

**🛡️ Safety Features:**
• Risk management validates all trades
• Position sizing controls
• Daily trading limits
• Emergency stop mechanisms
• Multi-account support across 4 live brokers

**⚠️ Important Notes:**
• All commands work on LIVE trading accounts
• Double-check all parameters before sending
• Use \`STATUS\` to verify connection before trading
• Risk management will adjust position sizes automatically
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
   * Examples: "BUY 0.1 XAUUSD @ 2650 SL:2640 TP:2670"
   *          "CLOSE ALL"
   *          "STATUS"
   *          "CLOSE #12345678"
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
      
      // Handle different command types
      switch (command.action) {
        case 'STATUS':
          await this.handleStatusCommand(ctx, tradeExecutor);
          break;
          
        case 'POSITIONS':
          await this.handlePositionsCommand(ctx, tradeExecutor);
          break;
          
        case 'BALANCE':
          await this.handleBalanceCommand(ctx, tradeExecutor);
          break;
          
        case 'CLOSE_ALL':
          await this.handleCloseAllCommand(ctx, tradeExecutor);
          break;
          
        case 'CLOSE':
          await this.handleCloseCommand(ctx, command, tradeExecutor);
          break;
          
        case 'BUY':
        case 'SELL':
          await this.handleTradeCommand(ctx, command, tradeExecutor);
          break;
          
        default:
          await ctx.reply('❌ Unknown command type');
      }
      
    } catch (error) {
      logger.error('❌ Error processing manual command:', error);
      await ctx.reply('❌ Error processing manual command. Please try again.');
    }
  }
  
  private async handleStatusCommand(ctx: Context, tradeExecutor?: any): Promise<void> {
    try {
      if (!tradeExecutor) {
        await ctx.reply('❌ Trade executor not available');
        return;
      }
      
      const isConnected = await tradeExecutor.isConnected();
      if (!isConnected) {
        await ctx.reply('❌ Trade executor is not connected');
        return;
      }
      
      // Get account information from all accounts
      const statusInfo = await tradeExecutor.getAccountsStatus?.() || 'Status information not available';
      
      await ctx.reply(`📊 **ACCOUNT STATUS**\n\n${statusInfo}`);
      
    } catch (error) {
      logger.error('Error getting status:', error);
      await ctx.reply('❌ Error retrieving account status');
    }
  }
  
  private async handlePositionsCommand(ctx: Context, tradeExecutor?: any): Promise<void> {
    try {
      if (!tradeExecutor) {
        await ctx.reply('❌ Trade executor not available');
        return;
      }
      
      const isConnected = await tradeExecutor.isConnected();
      if (!isConnected) {
        await ctx.reply('❌ Trade executor is not connected');
        return;
      }
      
      // Get open positions from all accounts
      const positions = await tradeExecutor.getOpenPositions?.() || 'Positions information not available';
      
      await ctx.reply(`📈 **OPEN POSITIONS**\n\n${positions}`);
      
    } catch (error) {
      logger.error('Error getting positions:', error);
      await ctx.reply('❌ Error retrieving open positions');
    }
  }
  
  private async handleBalanceCommand(ctx: Context, tradeExecutor?: any): Promise<void> {
    try {
      if (!tradeExecutor) {
        await ctx.reply('❌ Trade executor not available');
        return;
      }
      
      const isConnected = await tradeExecutor.isConnected();
      if (!isConnected) {
        await ctx.reply('❌ Trade executor is not connected');
        return;
      }
      
      // Get balance information from all accounts
      const balance = await tradeExecutor.getAccountEquity?.() || 0;
      const balanceInfo = await tradeExecutor.getBalanceInfo?.() || 'Balance information not available';
      
      await ctx.reply(`💰 **ACCOUNT BALANCE**\n\n${balanceInfo}`);
      
    } catch (error) {
      logger.error('Error getting balance:', error);
      await ctx.reply('❌ Error retrieving account balance');
    }
  }
  
  private async handleCloseAllCommand(ctx: Context, tradeExecutor?: any): Promise<void> {
    try {
      if (!tradeExecutor) {
        await ctx.reply('❌ Trade executor not available');
        return;
      }
      
      const isConnected = await tradeExecutor.isConnected();
      if (!isConnected) {
        await ctx.reply('❌ Trade executor is not connected');
        return;
      }
      
      await ctx.reply('⚠️ **CLOSE ALL POSITIONS**\n\n⏳ Closing all open positions...');
      
      // Close all positions
      const result = await tradeExecutor.closeAllPositions?.() || { success: false, error: 'Method not available' };
      
      if (result.success) {
        await ctx.reply('✅ **All positions closed successfully!**');
      } else {
        await ctx.reply(`❌ **Failed to close all positions**\n🚨 Error: ${result.error}`);
      }
      
    } catch (error) {
      logger.error('Error closing all positions:', error);
      await ctx.reply('❌ Error closing all positions');
    }
  }
  
  private async handleCloseCommand(ctx: Context, command: ManualTradeCommand, tradeExecutor?: any): Promise<void> {
    try {
      if (!tradeExecutor) {
        await ctx.reply('❌ Trade executor not available');
        return;
      }
      
      const isConnected = await tradeExecutor.isConnected();
      if (!isConnected) {
        await ctx.reply('❌ Trade executor is not connected');
        return;
      }
      
      const formattedCommand = ManualTradingCommands.formatCommand(command);
      await ctx.reply(`⚠️ **CLOSE POSITIONS**\n📝 Command: ${formattedCommand}\n\n⏳ Processing...`);
      
      let result;
      
      if (command.targetTicket) {
        // Close specific ticket
        result = await tradeExecutor.closePosition?.(command.targetTicket) || { success: false, error: 'Method not available' };
      } else if (command.symbol) {
        // Close by symbol or symbol+direction
        const direction = command.volume ? (command.volume > 0 ? 'BUY' : 'SELL') : undefined;
        result = await tradeExecutor.closePositionsBySymbol?.(command.symbol, direction) || { success: false, error: 'Method not available' };
      } else if (command.volume) {
        // Close all buy or sell positions
        const direction = command.volume > 0 ? 'BUY' : 'SELL';
        result = await tradeExecutor.closePositionsByDirection?.(direction) || { success: false, error: 'Method not available' };
      } else {
        await ctx.reply('❌ Invalid close command format');
        return;
      }
      
      if (result.success) {
        await ctx.reply(`✅ **Positions closed successfully!**\n📝 Command: ${formattedCommand}`);
      } else {
        await ctx.reply(`❌ **Failed to close positions**\n📝 Command: ${formattedCommand}\n🚨 Error: ${result.error}`);
      }
      
    } catch (error) {
      logger.error('Error closing positions:', error);
      await ctx.reply('❌ Error closing positions');
    }
  }
  
  private async handleTradeCommand(ctx: Context, command: ManualTradeCommand, tradeExecutor?: any): Promise<void> {
    try {
      if (!tradeExecutor) {
        await ctx.reply('❌ Trade executor not available');
        return;
      }
      
      const isConnected = await tradeExecutor.isConnected();
      if (!isConnected) {
        await ctx.reply('❌ Trade executor is not connected - cannot execute manual trades');
        return;
      }
      
      const formattedCommand = ManualTradingCommands.formatCommand(command);
      
      // Send confirmation
      await ctx.reply(`🎯 **Manual Trade Command Parsed:**\n\`${formattedCommand}\`\n\n⏳ Executing trade...`);
      
      // Convert to trade signal format for execution
      const tradeSignal = this.convertManualCommandToTradeSignal(command);
      
      logger.info('🎯 Executing manual trade command with synchronization fixes...');
      // Use manual trade retry method if available
      const result = await (tradeExecutor.executeManualTradeWithRetry ? 
        tradeExecutor.executeManualTradeWithRetry(tradeSignal, 3) : 
        tradeExecutor.executeTradeSignal(tradeSignal));
      
      // Handle both single and multi-account result formats
      const isMultiAccountResult = result.overallSuccess !== undefined;
      const success = isMultiAccountResult ? result.overallSuccess : result.success;
      
      if (success) {
        let successMessage = `✅ **Manual Trade Executed Successfully!**\n📝 Command: ${formattedCommand}`;
        
        if (isMultiAccountResult) {
          successMessage += `\n📊 Accounts: ${result.successfulAccounts}/${result.totalAccounts} successful`;
          // Show account-specific results
          result.results?.forEach((accountResult: any) => {
            const status = accountResult.success ? '✅' : '❌';
            successMessage += `\n${status} ${accountResult.brokerName}: ${accountResult.message}`;
          });
        } else {
          successMessage += `\n🎯 Signal ID: ${result.signalId || 'N/A'}`;
        }
        
        logger.info('✅ Manual trade executed successfully');
        await ctx.reply(successMessage);
      } else {
        let errorMessage = `❌ **Manual Trade Failed**\n📝 Command: ${formattedCommand}`;
        
        if (isMultiAccountResult) {
          errorMessage += `\n📊 Failed on ${result.failedAccounts}/${result.totalAccounts} accounts`;
          // Show account-specific errors
          result.results?.forEach((accountResult: any) => {
            if (!accountResult.success) {
              errorMessage += `\n❌ ${accountResult.brokerName}: ${accountResult.error || accountResult.message}`;
            }
          });
        } else {
          errorMessage += `\n🚨 Error: ${result.error || result.message}`;
        }
        
        logger.error('❌ Manual trade execution failed:', isMultiAccountResult ? 'Multi-account failure' : result.error);
        await ctx.reply(errorMessage);
      }
      
    } catch (executionError) {
      const formattedCommand = ManualTradingCommands.formatCommand(command);
      logger.error('💥 Manual trade execution threw an exception:', executionError);
      await ctx.reply(`❌ **Manual Trade Exception**\n📝 Command: ${formattedCommand}\n🚨 Error: ${executionError}`);
    }
  }
  
  /**
   * Convert manual command to trade signal format
   */
  private convertManualCommandToTradeSignal(command: ManualTradeCommand): any {
    // Create entryZone for manual commands - use current market price or specified price
    const entryPrice = command.price || 0; // Will be determined by market price if not specified
    const entryZone = {
      min: entryPrice - 0.0001, // Small spread around entry
      max: entryPrice + 0.0001
    };

    return {
      symbol: command.symbol,
      action: command.action.toLowerCase(),
      volume: command.volume,
      entry: command.price,
      entryZone: entryZone, // 🚨 CRITICAL FIX: Add entryZone for manual trades
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
