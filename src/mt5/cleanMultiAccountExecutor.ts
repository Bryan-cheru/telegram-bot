/**
 * Clean Multi-Account Trade Executor
 * Follows MetaAPI documentation exactly - replaces the complex existing system
 */

import MetaApi, { MetatraderAccount, StreamingMetaApiConnectionInstance } from 'metaapi.cloud-sdk';
import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { CleanSymbolManager } from '../../cleanSymbolManager';
import { logger } from '../utils/logger';

interface AccountConfig {
  id: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  account?: MetatraderAccount;
  connection?: StreamingMetaApiConnectionInstance;
  status: 'CONNECTING' | 'CONNECTED' | 'FAILED';
}

interface TradeExecutionResult {
  accountId: string;
  brokerName: string;
  success: boolean;
  message: string;
  ticket?: string;
  error?: string;
}

/**
 * Clean, reliable multi-account executor following MetaAPI best practices
 */
export class CleanMultiAccountExecutor implements ITradeExecutor {
  private api: MetaApi;
  private accounts = new Map<string, AccountConfig>();
  private initialized = false;
  
  constructor() {
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      throw new Error('METAAPI_TOKEN environment variable is required');
    }
    
    this.api = new MetaApi(token);
  }

  /**
   * Initialize all accounts
   */
  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Clean Multi-Account Executor...');

    const accountsConfig = process.env.METAAPI_ACCOUNTS;
    if (!accountsConfig) {
      throw new Error('METAAPI_ACCOUNTS environment variable is required');
    }

    // Parse account configurations
    const accountStrings = accountsConfig.split(',');
    for (const accountString of accountStrings) {
      const [id, brokerName, accountType] = accountString.trim().split(':');
      
      if (!id || !brokerName || !accountType) {
        logger.warn(`⚠️ Invalid account config: ${accountString}`);
        continue;
      }

      const accountConfig: AccountConfig = {
        id: id.trim(),
        brokerName: brokerName.trim(),
        accountType: accountType.trim() as 'DEMO' | 'LIVE',
        status: 'CONNECTING'
      };

      this.accounts.set(accountConfig.id, accountConfig);
    }

    // Connect accounts sequentially with proper error handling
    for (const [accountId, accountConfig] of this.accounts) {
      await this.connectAccount(accountConfig);
      
      // Increased delay between connections to prevent rate limiting
      logger.info(`⏳ Waiting 5 seconds before next connection...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const connectedCount = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED').length;
    
    this.initialized = connectedCount > 0;
    
    logger.info(`✅ Initialized ${connectedCount}/${this.accounts.size} accounts`);
  }

  /**
   * Connect a single account following MetaAPI documentation
   */
  private async connectAccount(accountConfig: AccountConfig): Promise<void> {
    try {
      logger.info(`🔗 Connecting ${accountConfig.brokerName} (${accountConfig.accountType})...`);

      // Get account
      accountConfig.account = await this.api.metatraderAccountApi.getAccount(accountConfig.id);
      
      // Deploy if needed
      if (accountConfig.account.state !== 'DEPLOYED') {
        logger.info(`📦 Deploying ${accountConfig.brokerName}...`);
        await accountConfig.account.deploy();
        await accountConfig.account.waitDeployed(60000);
      }

      // Wait for connection with longer timeout
      logger.info(`⏳ Waiting for ${accountConfig.brokerName} connection...`);
      await accountConfig.account.waitConnected(90000); // Increased to 90 seconds
      logger.info(`🔗 ${accountConfig.brokerName} account connected`);

      // Get streaming connection
      accountConfig.connection = accountConfig.account.getStreamingConnection();
      logger.info(`📡 Establishing streaming connection for ${accountConfig.brokerName}...`);
      await accountConfig.connection.connect();
      logger.info(`✅ ${accountConfig.brokerName} streaming connected`);
      
      // Check terminal status (don't fail if terminal is offline)
      logger.info(`🔄 Checking terminal status for ${accountConfig.brokerName}...`);
      const terminalConnected = accountConfig.connection.terminalState.connected;
      const hasSpecifications = Object.keys(accountConfig.connection.terminalState.specifications || {}).length > 0;
      
      if (terminalConnected) {
        logger.info(`🔄 Synchronizing ${accountConfig.brokerName}...`);
        try {
          // Simplified: Just wait for synchronization
          await accountConfig.connection.waitSynchronized();
          logger.info(`✅ ${accountConfig.brokerName} synchronized`);
          
          accountConfig.status = 'CONNECTED';
          logger.info(`🎉 ${accountConfig.brokerName} fully connected and ready for trading!`);
        } catch (syncError: any) {
          logger.warn(`⚠️ ${accountConfig.brokerName} synchronization failed: ${syncError.message}`);
          accountConfig.status = 'CONNECTED'; // Still mark as connected for API operations
          logger.info(`🔗 ${accountConfig.brokerName} API connected (terminal sync pending)`);
        }
      } else {
        // Terminal offline but API connected - this is common
        accountConfig.status = 'CONNECTED';
        logger.warn(`⚠️ ${accountConfig.brokerName} terminal offline but API connected`);
        logger.info(`🔗 ${accountConfig.brokerName} ready for API operations (trading requires terminal)`);
      }

    } catch (error: any) {
      accountConfig.status = 'FAILED';
      
      // Enhanced error logging
      const errorDetails = {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        details: error.details
      };
      
      logger.error(`❌ Failed to connect ${accountConfig.brokerName}:`, errorDetails);
      
      // Check if it's a timeout error
      if (error.message?.includes('timeout') || error.message?.includes('TimeoutError')) {
        logger.warn(`⏰ ${accountConfig.brokerName} connection timed out - this may resolve on retry`);
      }
      
      // Check if it's a region/connection issue
      if (error.message?.includes('region') || error.message?.includes('not connected to broker')) {
        logger.warn(`🌍 ${accountConfig.brokerName} may have region connectivity issues`);
      }
      
      // Clean up failed connection
      if (accountConfig.connection) {
        try {
          await accountConfig.connection.close();
        } catch (closeError) {
          // Ignore cleanup errors
        }
        accountConfig.connection = undefined;
      }
    }
  }

  /**
   * Execute trade signal across all connected accounts
   */
  async executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: number;
    signalId?: string;
  }> {
    if (!this.initialized) {
      return {
        success: false,
        error: 'Executor not initialized'
      };
    }

    logger.info('🚀 Executing trade signal:', {
      symbol: signal.symbol,
      action: signal.action,
      entryZone: signal.entryZone
    });

    const results: TradeExecutionResult[] = [];
    const connectedAccounts = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED');

    if (connectedAccounts.length === 0) {
      return {
        success: false,
        error: 'No connected accounts available'
      };
    }

    // Execute on each account sequentially
    for (const accountConfig of connectedAccounts) {
      const result = await this.executeOnAccount(signal, accountConfig);
      results.push(result);
      
      // Delay between executions to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    const successCount = results.filter(r => r.success).length;
    const totalAccounts = results.length;

    return {
      success: successCount > 0,
      message: `Executed on ${successCount}/${totalAccounts} accounts`,
      signalId: `multi-${Date.now()}`
    };
  }

  /**
   * Calculate Take Profit using ALWAYS 1:1 Risk-Reward ratio
   * Entry -> SL distance = SL -> TP distance (ALWAYS 1:1 RR, ignores provided targets)
   */
  private calculateTakeProfit(signal: TradeSignal, entryPrice: number): number {
    let stopLoss = signal.stopLoss;
    
    // FIXED: If stop loss is invalid (like 5, 3, etc), calculate it properly
    if (!stopLoss || stopLoss <= 0 || stopLoss < 0.1) {
      // Use percentage-based stop loss (2% risk by default)
      const riskPercentage = 0.02; // 2% risk
      
      if (signal.action === 'BUY') {
        stopLoss = entryPrice * (1 - riskPercentage);
        logger.info(`🔧 Calculated SL for BUY: ${stopLoss.toFixed(5)} (2% below entry)`);
      } else if (signal.action === 'SELL') {
        stopLoss = entryPrice * (1 + riskPercentage);
        logger.info(`🔧 Calculated SL for SELL: ${stopLoss.toFixed(5)} (2% above entry)`);
      }
    }

    // ALWAYS calculate 1:1 Risk-Reward ratio - ignore any provided targets
    let takeProfit: number;
    const riskDistance = Math.abs(entryPrice - stopLoss);

    if (signal.action === 'BUY') {
      // For BUY: TP = Entry + Risk Distance
      takeProfit = entryPrice + riskDistance;
      logger.info(`📈 BUY 1:1 RR: Entry ${entryPrice} + Risk ${riskDistance.toFixed(5)} = TP ${takeProfit.toFixed(5)}`);
    } else if (signal.action === 'SELL') {
      // For SELL: TP = Entry - Risk Distance
      takeProfit = entryPrice - riskDistance;
      logger.info(`📉 SELL 1:1 RR: Entry ${entryPrice} - Risk ${riskDistance.toFixed(5)} = TP ${takeProfit.toFixed(5)}`);
    } else {
      throw new Error(`Invalid action for TP calculation: ${signal.action}`);
    }

    // Validate the calculated TP makes sense
    if (signal.action === 'BUY' && takeProfit <= entryPrice) {
      throw new Error(`Invalid BUY TP: ${takeProfit} must be > Entry ${entryPrice}`);
    }
    if (signal.action === 'SELL' && takeProfit >= entryPrice) {
      throw new Error(`Invalid SELL TP: ${takeProfit} must be < Entry ${entryPrice}`);
    }

    // Log if we're overriding provided targets
    if (signal.targets && signal.targets.length > 0 && signal.targets[0] > 0) {
      logger.info(`🎯 OVERRIDE: Ignoring provided TP ${signal.targets[0]}, using 1:1 RR instead: ${takeProfit.toFixed(5)}`);
    }

    // Update signal with corrected stop loss for the trade execution
    signal.stopLoss = stopLoss;

    logger.info(`🎯 ENFORCED 1:1 RR - Entry: ${entryPrice}, SL: ${stopLoss.toFixed(5)}, TP: ${takeProfit.toFixed(5)}, Risk: ${riskDistance.toFixed(5)} pips`);
    return Number(takeProfit.toFixed(5)); // Round to 5 decimal places
  }

  /**
   * Execute trade on a single account
   */
  private async executeOnAccount(
    signal: TradeSignal,
    accountConfig: AccountConfig
  ): Promise<TradeExecutionResult> {
    try {
      logger.info(`💼 Executing on ${accountConfig.brokerName}...`);

      if (!accountConfig.connection) {
        throw new Error('Connection not available');
      }

      // Enhanced connection status check for IFPro-Trade debugging
      if (accountConfig.brokerName === 'IFPro-Trade') {
        const terminalState = accountConfig.connection.terminalState;
        const accountInfo = terminalState.accountInformation;
        logger.info(`🔍 IFPro-Trade connection status:`);
        logger.info(`   - Connected: ${terminalState.connected}`);
        logger.info(`   - ConnectedToBroker: ${terminalState.connectedToBroker}`);
        logger.info(`   - Synchronized: ${accountConfig.connection.synchronized}`);
        logger.info(`   - Account Info Available: ${!!accountInfo}`);
        if (accountInfo) {
          logger.info(`   - Balance: ${accountInfo.balance}`);
          logger.info(`   - Equity: ${accountInfo.equity}`);
          logger.info(`   - Trade Allowed: ${accountInfo.tradeAllowed}`);
          logger.info(`   - Margin Mode: ${accountInfo.marginMode}`);
          logger.info(`   - Currency: ${accountInfo.currency}`);
          logger.info(`   - Server: ${accountInfo.server}`);
          logger.info(`   - Name: ${accountInfo.name}`);
          logger.info(`   - Login: ${accountInfo.login}`);
        }
      }

      // Step 1: Get valid symbol using clean symbol manager
      const validSymbol = await CleanSymbolManager.getValidSymbol(
        signal.symbol,
        accountConfig.connection,
        accountConfig.brokerName
      );

      // Step 2: Ensure market data is available
      const marketData = await CleanSymbolManager.ensureMarketData(
        validSymbol,
        accountConfig.connection
      );

      // Step 3: Calculate entry price and volume
      const entryPrice = this.calculateEntryPrice(signal, marketData);
      // Calculate position size using proper risk management
      const volume = this.calculateVolume(accountConfig.connection, signal);

      // Step 3.5: Calculate take profit using 1:1 RR default
      const takeProfit = this.calculateTakeProfit(signal, entryPrice);

      // Step 4: Execute the trade using MetaAPI (validation happens in getValidSymbol)
      let result;
      const tradeOptions = {
        comment: 'Bot Trade'
      };

      // Check if this should be a market order or limit order
      // 🎯 DEFAULT TO LIMIT ORDERS (as per your excellent suggestion!)
      const orderType = signal.orderType || 'LIMIT'; // Always LIMIT by default for better execution
      
      if (orderType === 'MARKET') {
        // Market orders - execute immediately at current price
        if (signal.action === 'BUY') {
          result = await accountConfig.connection.createMarketBuyOrder(
            validSymbol,
            volume,
            signal.stopLoss,
            takeProfit,
            tradeOptions
          );
        } else if (signal.action === 'SELL') {
          result = await accountConfig.connection.createMarketSellOrder(
            validSymbol,
            volume,
            signal.stopLoss,
            takeProfit,
            tradeOptions
          );
        } else {
          throw new Error(`Unsupported action: ${signal.action}`);
        }
      } else {
        // Limit orders - execute at specified entry price
        if (signal.action === 'BUY') {
          result = await accountConfig.connection.createLimitBuyOrder(
            validSymbol,
            volume,
            entryPrice,
            signal.stopLoss,
            takeProfit, // Use calculated TP with 1:1 RR default
            tradeOptions
          );
        } else if (signal.action === 'SELL') {
          result = await accountConfig.connection.createLimitSellOrder(
            validSymbol,
            volume,
            entryPrice,
            signal.stopLoss,
            takeProfit, // Use calculated TP with 1:1 RR default
            tradeOptions
          );
        } else {
          throw new Error(`Unsupported action: ${signal.action}`);
        }
      }

      const ticket = result.positionId || result.orderId || 'Unknown';
      
      logger.info(`✅ Trade executed on ${accountConfig.brokerName}: ${ticket}`);

      return {
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        success: true,
        message: `Trade executed successfully`,
        ticket
      };

    } catch (error: any) {
      // Enhanced error logging for IFPro-Trade debugging
      logger.error(`❌ Trade failed on ${accountConfig.brokerName}:`);
      logger.error(`❌ Error message: ${error.message}`);
      logger.error(`❌ Error details: ${JSON.stringify(error.details || {}, null, 2)}`);
      logger.error(`❌ Error code: ${error.stringCode || 'N/A'}`);
      logger.error(`❌ Full error:`, error);
      
      return {
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        success: false,
        message: 'Trade execution failed',
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Calculate optimal entry price based on signal and current market
   */
  private calculateEntryPrice(signal: TradeSignal, marketData: { bid: number; ask: number }): number {
    const currentPrice = (marketData.bid + marketData.ask) / 2;
    const entryZoneCenter = (signal.entryZone.min + signal.entryZone.max) / 2;

    // Use entry zone center as the limit price
    let entryPrice = entryZoneCenter;

    // Ensure limit orders are placed correctly relative to current price
    if (signal.action === 'BUY') {
      // BUY limit must be at or below current price
      if (entryPrice > currentPrice) {
        entryPrice = currentPrice - (currentPrice * 0.0001); // Small buffer
      }
    } else if (signal.action === 'SELL') {
      // SELL limit must be at or above current price
      if (entryPrice < currentPrice) {
        entryPrice = currentPrice + (currentPrice * 0.0001); // Small buffer
      }
    }

    logger.info(`📊 Entry price calculated: ${entryPrice} (Current: ${currentPrice})`);
    return entryPrice;
  }

  /**
   * Calculate trade volume based on signal, account balance and risk management
   */
  private calculateVolume(connection: any, signal: TradeSignal): number {
    try {
      const accountInfo = connection.terminalState.accountInformation;
      const balance = accountInfo?.balance || 10000;
      
      // Get risk settings from environment
      const riskPercentage = parseFloat(process.env.RISK_PERCENTAGE || '1.3');
      const minLotSize = parseFloat(process.env.MIN_LOT_SIZE || '0.01');
      const maxLotSize = parseFloat(process.env.MAX_LOT_SIZE || '10.0');
      
      // Calculate risk amount
      const riskAmount = balance * (riskPercentage / 100);
      
      // Calculate entry price (use middle of entry zone)
      const entryPrice = signal.entryZone ? 
        (signal.entryZone.min + signal.entryZone.max) / 2 : 
        signal.entryPrice || 0;
        
      // Ensure we have stop loss for proper calculation
      if (!signal.stopLoss || !entryPrice) {
        logger.warn(`⚠️ Missing entry price or stop loss for ${signal.symbol}, using conservative size`);
        return minLotSize;
      }
      
      // Calculate risk distance
      const riskDistance = Math.abs(entryPrice - signal.stopLoss);
      
      // Get pip value based on symbol
      const pipValue = this.getPipValue(signal.symbol);
      
      // Calculate lot size: Risk Amount ÷ (Risk Distance × Pip Value)
      let lotSize = riskAmount / (riskDistance * pipValue);
      
      // Apply position size limits
      lotSize = Math.max(minLotSize, Math.min(maxLotSize, lotSize));
      
      // Round to 2 decimal places
      lotSize = Math.round(lotSize * 100) / 100;
      
      // Calculate actual risk with final lot size
      const actualRisk = lotSize * riskDistance * pipValue;
      const actualRiskPercentage = (actualRisk / balance) * 100;
      
      logger.info(`💰 Position sizing for ${signal.symbol}:`);
      logger.info(`   Account Balance: $${balance.toLocaleString()}`);
      logger.info(`   Risk Settings: ${riskPercentage}% = $${riskAmount.toFixed(2)}`);
      logger.info(`   Entry: ${entryPrice}, Stop: ${signal.stopLoss}`);
      logger.info(`   Risk Distance: ${riskDistance.toFixed(5)} pips`);
      logger.info(`   Pip Value: $${pipValue} per pip per lot`);
      logger.info(`   Calculated Size: ${lotSize} lots`);
      logger.info(`   Actual Risk: $${actualRisk.toFixed(2)} (${actualRiskPercentage.toFixed(2)}%)`);
      
      return lotSize;
      
    } catch (error) {
      logger.error('Volume calculation error:', error);
      return parseFloat(process.env.MIN_LOT_SIZE || '0.01');
    }
  }

  /**
   * Get pip value for different instruments
   */
  private getPipValue(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // Forex pairs
    if (upperSymbol.includes('JPY')) {
      return 10; // $10 per pip for JPY pairs (standard lot)
    } else if (this.isForexPair(upperSymbol)) {
      return 10; // $10 per pip for major pairs (standard lot)
    }
    
    // Metals
    if (['XAUUSD', 'GOLD'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    if (['XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return 50; // $50 per point
    }
    
    // Indices
    if (['NAS100', 'NASDAQ'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    if (['SPX500', 'US30'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    // Default for unknown instruments
    logger.warn(`Unknown instrument ${symbol}, using default pip value`);
    return 10; // Default to $10 per pip
  }

  /**
   * Check if symbol is a forex pair
   */
  private isForexPair(symbol: string): boolean {
    return symbol.length === 6 && /^[A-Z]{6}$/.test(symbol);
  }

  /**
   * Check if executor is connected
   */
  async isConnected(): Promise<boolean> {
    const connectedCount = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED').length;
    return connectedCount > 0;
  }

  /**
   * Close all connections
   */
  async closeConnection(): Promise<void> {
    logger.info('🔌 Closing all connections...');
    
    for (const [_, accountConfig] of this.accounts) {
      if (accountConfig.connection) {
        try {
          await accountConfig.connection.close();
        } catch (error) {
          logger.warn(`Error closing connection for ${accountConfig.brokerName}`);
        }
      }
    }
    
    this.accounts.clear();
    this.initialized = false;
  }

  /**
   * Get account statuses for monitoring
   */
  getAccountStatuses() {
    return Array.from(this.accounts.values()).map(acc => {
      let terminalConnected = false;
      let hasSpecifications = false;
      
      if (acc.connection?.terminalState) {
        terminalConnected = acc.connection.terminalState.connected || false;
        hasSpecifications = Object.keys(acc.connection.terminalState.specifications || {}).length > 0;
      }
      
      return {
        id: acc.id,
        brokerName: acc.brokerName,
        accountType: acc.accountType,
        status: acc.status,
        terminalConnected,
        hasSpecifications,
        tradingReady: acc.status === 'CONNECTED' && terminalConnected && hasSpecifications
      };
    });
  }

  /**
   * Get real account data for dashboard (balance, equity, positions, etc.)
   */
  async getAllAccountsData() {
    const accountStatuses = this.getAccountStatuses();
    
    return accountStatuses.map(acc => {
      const accountConfig = this.accounts.get(acc.id);
      
      // If account is not connected or no connection, return basic info with zeros
      if (acc.status !== 'CONNECTED' || !accountConfig?.connection?.terminalState) {
        return {
          ...acc,
          balance: 0,
          equity: 0,
          freeMargin: 0,
          marginLevel: 0,
          positions: [],
          lastUpdate: Date.now()
        };
      }
      
      try {
        // Get real account information from MetaAPI terminal state
        const accountInfo = accountConfig.connection.terminalState.accountInformation || {};
        const positions = accountConfig.connection.terminalState.positions || [];
        
        // Extract real financial data
        const balance = accountInfo.balance || 0;
        const equity = accountInfo.equity || balance;
        const freeMargin = accountInfo.freeMargin || 0;
        const marginLevel = accountInfo.marginLevel || 0;
        
        // Format positions with essential info for dashboard
        const formattedPositions = positions.map((pos: any) => ({
          id: pos.id,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          openPrice: pos.openPrice,
          currentPrice: pos.currentPrice || pos.openPrice,
          profit: pos.profit || 0,
          swap: pos.swap || 0,
          commission: pos.commission || 0,
          openTime: pos.openTime
        }));
        
        return {
          ...acc,
          balance: parseFloat(balance.toFixed(2)),
          equity: parseFloat(equity.toFixed(2)),
          freeMargin: parseFloat(freeMargin.toFixed(2)),
          marginLevel: parseFloat(marginLevel.toFixed(2)),
          positions: formattedPositions,
          lastUpdate: Date.now()
        };
        
      } catch (error) {
        logger.error(`Error getting account data for ${acc.brokerName}:`, error);
        return {
          ...acc,
          balance: 0,
          equity: 0,
          freeMargin: 0,
          marginLevel: 0,
          positions: [],
          lastUpdate: Date.now(),
          error: 'Failed to fetch account data'
        };
      }
    });
  }

  async closePosition(accountId: string, positionId: string) {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig?.connection) {
      throw new Error(`Account ${accountId} not connected`);
    }
    
    try {
      // Simplified - try to close position using market order
      const positions = accountConfig.connection.terminalState.positions || [];
      const position = positions.find((p: any) => p.id === positionId);
      
      if (!position) {
        throw new Error(`Position ${positionId} not found`);
      }
      
      // Close using opposite market order
      let result;
      if (position.type === 'POSITION_TYPE_BUY') {
        result = await accountConfig.connection.createMarketSellOrder(position.symbol, position.volume);
      } else {
        result = await accountConfig.connection.createMarketBuyOrder(position.symbol, position.volume);
      }
      
      logger.info(`✅ Position ${positionId} closed on ${accountConfig.brokerName}`);
      return result;
    } catch (error) {
      logger.error(`❌ Failed to close position ${positionId}:`, error);
      throw error;
    }
  }

  async getTradeHistory() {
    // Simplified version - return empty for now
    return {
      deals: [],
      orders: [],
      positions: [],
      transactions: [],
      totalCount: 0,
      hasMore: false,
      summary: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalProfit: 0,
        winRate: 0
      }
    };
  }

  async getAccountPerformanceMetrics() {
    return null;
  }

  async getAllAccountsPerformanceMetrics() {
    return [];
  }
}
