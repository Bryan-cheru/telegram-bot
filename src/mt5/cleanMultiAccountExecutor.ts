/**
 * Clean Multi-Account Trade Executor
 * Follows MetaAPI documentation exactly - replaces the complex existing system
 */

import MetaApi, { MetatraderAccount, StreamingMetaApiConnectionInstance } from 'metaapi.cloud-sdk';
import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { logger } from '../utils/logger';

interface AccountConfig {
  id: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  account?: MetatraderAccount;
  connection?: StreamingMetaApiConnectionInstance;
  rpcConnection?: any; // RPC connection for when terminal is offline
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

      // Debug MetaAPI token
      const token = process.env.METAAPI_TOKEN || '';
      logger.info(`🔍 Token Debug: Length=${token.length}, First10=${token.substring(0, 10)}..., Last10=...${token.substring(token.length - 10)}`);
      
      // Get account
      logger.info(`🔍 Attempting to get account: ${accountConfig.id}`);
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
        // Terminal offline but API connected - use RPC connection to fetch account data
        logger.warn(`⚠️ ${accountConfig.brokerName} terminal offline but API connected`);
        logger.info(`🔗 Attempting to fetch account data via RPC connection...`);
        
        try {
          // Use RPC connection when terminal is offline (MetaAPI best practice)
          const rpcConnection = accountConfig.account!.getRPCConnection();
          await rpcConnection.connect();
          
          // According to MetaAPI docs, RPC doesn't require waitSynchronized for basic operations
          logger.info(`🔗 RPC connection established for ${accountConfig.brokerName}`);
          
          // Fetch account information using RPC API methods
          const accountInfo = await rpcConnection.getAccountInformation();
          
          if (accountInfo) {
            logger.info(`💰 ${accountConfig.brokerName} Account Info (via RPC):`, {
              balance: `$${accountInfo.balance?.toLocaleString()}`,
              equity: `$${accountInfo.equity?.toLocaleString()}`,
              currency: accountInfo.currency,
              leverage: accountInfo.leverage,
              freeMargin: `$${accountInfo.freeMargin?.toLocaleString()}`
            });
            
            // Store RPC connection for data operations when terminal offline
            accountConfig.rpcConnection = rpcConnection;
            accountConfig.status = 'CONNECTED';
            logger.info(`✅ ${accountConfig.brokerName} account data available via RPC (terminal offline)`);
          } else {
            logger.warn(`⚠️ No account information returned from ${accountConfig.brokerName} via RPC`);
            accountConfig.rpcConnection = rpcConnection; // Still store for potential trading
            accountConfig.status = 'CONNECTED';
          }
        } catch (rpcError: any) {
          logger.error(`❌ Failed to establish RPC connection: ${rpcError.message}`);
          // Don't fail completely - account might still work for some operations
          accountConfig.status = 'CONNECTED';
        }
        
        logger.info(`🔗 ${accountConfig.brokerName} ready for API operations (terminal offline)`);
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
    
    // Validate SL is realistic based on symbol type
    const isRealisticSL = this.validateRealisticSL(signal.symbol, entryPrice, stopLoss, signal.action);
    
    if (!stopLoss || !isRealisticSL) {
      // Calculate conservative SL within realistic limits
      stopLoss = this.calculateRealisticSL(signal.symbol, entryPrice, signal.action);
      logger.info(`🔧 Using realistic SL: ${stopLoss.toFixed(5)} (chart SL was unrealistic)`);
    } else {
      logger.info(`✅ Using chart SL: ${stopLoss.toFixed(5)} (realistic level)`);
    }

    // Calculate 1:1 Risk-Reward ratio with realistic TP
    const riskDistance = Math.abs(entryPrice - stopLoss);
    let takeProfit: number;

    if (signal.action === 'BUY') {
      takeProfit = entryPrice + riskDistance;
    } else if (signal.action === 'SELL') {
      takeProfit = entryPrice - riskDistance;
    } else {
      throw new Error(`Invalid action for TP calculation: ${signal.action}`);
    }

    // Ensure TP is within realistic limits for the symbol
    takeProfit = this.ensureRealisticTP(signal.symbol, entryPrice, takeProfit, signal.action);

    // Final validation
    if (signal.action === 'BUY' && takeProfit <= entryPrice) {
      throw new Error(`Invalid BUY TP: ${takeProfit} must be > Entry ${entryPrice}`);
    }
    if (signal.action === 'SELL' && takeProfit >= entryPrice) {
      throw new Error(`Invalid SELL TP: ${takeProfit} must be < Entry ${entryPrice}`);
    }

    // Update signal with corrected stop loss
    signal.stopLoss = stopLoss;

    logger.info(`🎯 REALISTIC 1:1 RR - Entry: ${entryPrice}, SL: ${stopLoss.toFixed(5)}, TP: ${takeProfit.toFixed(5)}, Risk: ${riskDistance.toFixed(5)}`);
    return takeProfit;
  }

  /**
   * Validate if SL is realistic for the symbol type
   */
  private validateRealisticSL(symbol: string, entryPrice: number, stopLoss: number, action: string): boolean {
    if (!stopLoss || stopLoss <= 0) return false;
    
    const upperSymbol = symbol.toUpperCase();
    const slDistance = Math.abs(entryPrice - stopLoss);
    const slPercentage = (slDistance / entryPrice) * 100;
    
    // Check if SL is on correct side
    if (action === 'BUY' && stopLoss >= entryPrice) return false;
    if (action === 'SELL' && stopLoss <= entryPrice) return false;
    
    // Symbol-specific realistic SL validation
    if (upperSymbol.includes('JPY')) {
      // JPY pairs: SL should be 0.5% - 3% away from entry
      return slPercentage >= 0.5 && slPercentage <= 3.0 && slDistance >= 0.5 && slDistance <= 5.0;
    }
    
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      // Gold: SL should be $10-$100 away from entry
      return slDistance >= 10 && slDistance <= 100;
    }
    
    if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
      // Major forex: SL should be 20-500 pips away
      return slDistance >= 0.0020 && slDistance <= 0.0500;
    }
    
    // General: 0.5% - 5% range
    return slPercentage >= 0.5 && slPercentage <= 5.0;
  }

  /**
   * Calculate realistic SL within proper limits
   */
  private calculateRealisticSL(symbol: string, entryPrice: number, action: string): number {
    const upperSymbol = symbol.toUpperCase();
    let slDistance: number;
    
    // Symbol-specific realistic SL distances
    if (upperSymbol.includes('JPY')) {
      // JPY pairs: Use 1% (conservative but realistic)
      slDistance = entryPrice * 0.01;
    } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      // Gold: Use $30 distance (realistic for gold trading)
      slDistance = 30;
    } else if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
      // Major forex: Use 100 pips (0.01)
      slDistance = 0.01;
    } else {
      // General: Use 1.5%
      slDistance = entryPrice * 0.015;
    }
    
    // Calculate SL based on direction
    let stopLoss: number;
    if (action === 'BUY') {
      stopLoss = entryPrice - slDistance;
    } else {
      stopLoss = entryPrice + slDistance;
    }
    
    return stopLoss;
  }

  /**
   * Ensure TP is within realistic limits
   */
  private ensureRealisticTP(symbol: string, entryPrice: number, takeProfit: number, action: string): number {
    const upperSymbol = symbol.toUpperCase();
    const tpDistance = Math.abs(takeProfit - entryPrice);
    
    // Symbol-specific TP limits
    let maxTpDistance: number;
    
    if (upperSymbol.includes('JPY')) {
      // JPY pairs: Max 5 yen move
      maxTpDistance = 5.0;
    } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      // Gold: Max $150 move
      maxTpDistance = 150;
    } else if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
      // Major forex: Max 500 pips
      maxTpDistance = 0.05;
    } else {
      // General: Max 10% move
      maxTpDistance = entryPrice * 0.10;
    }
    
    // If TP is too far, cap it at max distance
    if (tpDistance > maxTpDistance) {
      logger.warn(`⚠️ Capping TP distance from ${tpDistance.toFixed(5)} to ${maxTpDistance.toFixed(5)} for ${symbol}`);
      
      if (action === 'BUY') {
        takeProfit = entryPrice + maxTpDistance;
      } else {
        takeProfit = entryPrice - maxTpDistance;
      }
    }
    
    return takeProfit;
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

      if (!accountConfig.connection && !accountConfig.rpcConnection) {
        throw new Error('No connection available (neither streaming nor RPC)');
      }

      // Use RPC connection if streaming connection is not available
      const activeConnection = accountConfig.connection || accountConfig.rpcConnection;
      if (!activeConnection) {
        throw new Error('No active connection available');
      }

      // Enhanced connection status check for IFPro-Trade debugging
      if (accountConfig.brokerName === 'IFPro-Trade') {
        logger.info(`🔍 IFPro-Trade connection status:`);
        
        if (accountConfig.connection) {
          // Streaming connection available
          const terminalState = accountConfig.connection.terminalState;
          const accountInfo = terminalState.accountInformation;
          logger.info(`   - Connection Type: Streaming`);
          logger.info(`   - Connected: ${terminalState.connected}`);
          logger.info(`   - ConnectedToBroker: ${terminalState.connectedToBroker}`);
          logger.info(`   - Synchronized: ${accountConfig.connection.synchronized}`);
          logger.info(`   - Account Info Available: ${!!accountInfo}`);
          if (accountInfo) {
            logger.info(`   - Balance: ${accountInfo.balance}`);
            logger.info(`   - Equity: ${accountInfo.equity}`);
            logger.info(`   - Trade Allowed: ${accountInfo.tradeAllowed}`);
            logger.info(`   - Currency: ${accountInfo.currency}`);
          }
        } else if (accountConfig.rpcConnection) {
          // RPC connection only
          logger.info(`   - Connection Type: RPC (Terminal Offline)`);
          try {
            const accountInfo = await accountConfig.rpcConnection.getAccountInformation();
            if (accountInfo) {
              logger.info(`   - Balance: $${accountInfo.balance?.toLocaleString()}`);
              logger.info(`   - Equity: $${accountInfo.equity?.toLocaleString()}`);
              logger.info(`   - Currency: ${accountInfo.currency}`);
              logger.info(`   - Leverage: ${accountInfo.leverage}`);
            }
          } catch (infoError) {
            logger.warn(`   - Could not fetch account info: ${(infoError as any)?.message || infoError}`);
          }
        }
      }

      // Step 1: Get valid symbol (fallback implementation)
      const validSymbol = signal.symbol;

      // Step 2: Get market data using appropriate connection type (MetaAPI best practice)
      let marketData = { bid: 0, ask: 0 };
      
      // Use streaming connection first (best performance)
      if (accountConfig.connection?.terminalState) {
        const price = accountConfig.connection.terminalState.price(validSymbol);
        marketData = { bid: price?.bid || 0, ask: price?.ask || 0 };
        logger.info(`📊 Market data from streaming: ${validSymbol} bid=${marketData.bid} ask=${marketData.ask}`);
      }
      // Fallback to RPC connection for offline terminals
      else if (accountConfig.rpcConnection) {
        try {
          // Subscribe to market data first (required by MetaAPI)
          await accountConfig.rpcConnection.subscribeToMarketData(validSymbol);
          const symbolPrice = await accountConfig.rpcConnection.getSymbolPrice(validSymbol);
          marketData = { bid: symbolPrice.bid, ask: symbolPrice.ask };
          logger.info(`📊 Market data from RPC: ${validSymbol} bid=${marketData.bid} ask=${marketData.ask}`);
          // Unsubscribe to clean up
          await accountConfig.rpcConnection.unsubscribeFromMarketData(validSymbol);
        } catch (priceError) {
          logger.warn(`Could not get price for ${validSymbol} via RPC: ${priceError}`);
          // Use fallback entry price from signal
          const fallbackPrice = signal.entryPrice || 1.0;
          marketData = { bid: fallbackPrice, ask: fallbackPrice };
        }
      }

      // Step 3: Calculate entry price and volume using MetaAPI best practices
      const entryPrice = this.calculateEntryPrice(signal, marketData);
      // Use fixed lot size for prop firm consistency
      const volume = this.calculateVolume(accountConfig.connection || accountConfig.rpcConnection, signal);

      // Step 3.5: Calculate take profit using 1:1 RR default
      const takeProfit = this.calculateTakeProfit(signal, entryPrice);

      // Step 4: Execute trade using appropriate connection (MetaAPI best practice)
      let result;
      const tradeOptions = {
        comment: `TG_BOT_${signal.symbol}_${Date.now()}`,
        clientId: `TG_${accountConfig.id}_${Date.now()}`
      };

      // Determine which connection to use for trading
      const tradingConnection = accountConfig.connection || accountConfig.rpcConnection;
      
      if (!tradingConnection) {
        throw new Error(`No connection available for trading on ${accountConfig.brokerName}`);
      }

      // Check if this should be a market order or limit order
      const orderType = signal.orderType || 'LIMIT'; // Default to LIMIT for better execution
      
      logger.info(`📊 Executing ${orderType} ${signal.action} order for ${validSymbol}`);
      logger.info(`   Volume: ${volume} lots`);
      logger.info(`   Entry: ${entryPrice}`);
      logger.info(`   Stop Loss: ${signal.stopLoss}`);
      logger.info(`   Take Profit: ${takeProfit}`);
      
      if (orderType === 'MARKET') {
        // Market orders - execute immediately at current price
        if (signal.action === 'BUY') {
          result = await tradingConnection.createMarketBuyOrder(
            validSymbol,
            volume,
            signal.stopLoss,
            takeProfit,
            tradeOptions
          );
        } else if (signal.action === 'SELL') {
          result = await tradingConnection.createMarketSellOrder(
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
          result = await tradingConnection.createLimitBuyOrder(
            validSymbol,
            volume,
            entryPrice,
            signal.stopLoss,
            takeProfit, // Use calculated TP with 1:1 RR default
            tradeOptions
          );
        } else if (signal.action === 'SELL') {
          result = await tradingConnection.createLimitSellOrder(
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
   * Calculate trade volume based on MetaAPI best practices
   * For prop firm trading, always use fixed lot size as per MetaAPI documentation
   */
  private calculateVolume(connection: any, signal: TradeSignal): number {
    try {
      // For prop firm trading, always use fixed lot size (MetaAPI best practice)
      const fixedLotSize = parseFloat(process.env.FIXED_LOT_SIZE || '0.45');
      
      logger.info(`📊 Using FIXED position size for prop firm trading: ${fixedLotSize} lots`);
      logger.info(`   Symbol: ${signal.symbol}`);
      logger.info(`   Entry Price: ${signal.entryPrice || 'Market'}`);
      logger.info(`   Stop Loss: ${signal.stopLoss || 'Not set'}`);
      logger.info(`   Take Profit Targets: ${signal.targets?.join(', ') || 'Not set'}`);
      
      return fixedLotSize;
      
    } catch (error) {
      logger.error('Volume calculation error:', error);
      const fallbackSize = parseFloat(process.env.MIN_LOT_SIZE || '0.01');
      logger.warn(`Using fallback lot size: ${fallbackSize}`);
      return fallbackSize;
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
    
    return Promise.all(accountStatuses.map(async (acc) => {
      const accountConfig = this.accounts.get(acc.id);
      
      // If account is not connected, return basic info with zeros
      if (acc.status !== 'CONNECTED' || (!accountConfig?.connection && !accountConfig?.rpcConnection)) {
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
        let accountInfo: any = {};
        let positions: any[] = [];
        
        // Try streaming connection first (MetaAPI best practice)
        if (accountConfig.connection?.terminalState) {
          accountInfo = accountConfig.connection.terminalState.accountInformation || {};
          positions = accountConfig.connection.terminalState.positions || [];
        }
        // Fallback to RPC connection for offline terminal (as per MetaAPI docs)
        else if (accountConfig.rpcConnection) {
          try {
            // Use RPC methods as documented in MetaAPI SDK
            accountInfo = await accountConfig.rpcConnection.getAccountInformation() || {};
            positions = await accountConfig.rpcConnection.getPositions() || [];
          } catch (rpcError) {
            logger.warn(`RPC data fetch failed for ${acc.brokerName}:`, rpcError);
            accountInfo = {};
            positions = [];
          }
        }
        
        // Extract financial data with proper type handling
        const balance = accountInfo?.balance || 0;
        const equity = accountInfo?.equity || balance;
        const freeMargin = accountInfo?.freeMargin || 0;
        const marginLevel = accountInfo?.marginLevel || 0;
        
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
    }));
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
