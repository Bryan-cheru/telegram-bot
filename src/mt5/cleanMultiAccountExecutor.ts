/**
 * Clean Multi-Account Trade Executor
 * Follows MetaAPI documentation exactly - replaces the complex existing system
 */

import MetaApi, { MetatraderAccount, StreamingMetaApiConnectionInstance } from 'metaapi.cloud-sdk';
import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { CleanSymbolManager } from '../utils/cleanSymbolManager';
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
      
      // Small delay between connections
      await new Promise(resolve => setTimeout(resolve, 2000));
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

      // Wait for connection
      await accountConfig.account.waitConnected(45000);

      // Get streaming connection
      accountConfig.connection = accountConfig.account.getStreamingConnection();
      await accountConfig.connection.connect();
      
      // Wait for synchronization - simple timeout with Promise.race
      await Promise.race([
        accountConfig.connection.waitSynchronized(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Synchronization timeout')), 30000)
        )
      ]);

      accountConfig.status = 'CONNECTED';
      logger.info(`✅ ${accountConfig.brokerName} connected successfully`);

    } catch (error: any) {
      accountConfig.status = 'FAILED';
      logger.error(`❌ Failed to connect ${accountConfig.brokerName}:`, error.message);
      
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
      const volume = this.calculateVolume(accountConfig.connection);

      // Step 4: Validate trade parameters
      const validation = await CleanSymbolManager.validateForTrading(
        validSymbol,
        accountConfig.connection,
        accountConfig.brokerName
      );

      if (!validation.valid) {
        throw new Error(`Trade validation failed: ${validation.reason}`);
      }

      // Step 5: Execute the trade using MetaAPI
      let result;
      const tradeOptions = {
        comment: 'Bot Trade'
      };

      if (signal.action === 'BUY') {
        result = await accountConfig.connection.createLimitBuyOrder(
          validSymbol,
          volume,
          entryPrice,
          signal.stopLoss,
          signal.targets[0], // Use first target as TP
          tradeOptions
        );
      } else if (signal.action === 'SELL') {
        result = await accountConfig.connection.createLimitSellOrder(
          validSymbol,
          volume,
          entryPrice,
          signal.stopLoss,
          signal.targets[0], // Use first target as TP
          tradeOptions
        );
      } else {
        throw new Error(`Unsupported action: ${signal.action}`);
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
      logger.error(`❌ Trade failed on ${accountConfig.brokerName}:`, error.message);
      
      return {
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        success: false,
        message: 'Trade execution failed',
        error: error.message
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
   * Calculate trade volume based on account balance and risk management
   */
  private calculateVolume(connection: any): number {
    try {
      const accountInfo = connection.terminalState.accountInformation;
      const balance = accountInfo?.balance || 10000;
      
      // Simple risk management: 1% risk
      const riskAmount = balance * 0.01;
      
      // Conservative volume calculation
      let volume = Math.max(0.01, Math.min(1.0, riskAmount / 1000));
      
      // Round to 2 decimal places
      volume = Math.round(volume * 100) / 100;
      
      logger.debug(`💰 Volume calculated: ${volume} (Balance: ${balance})`);
      return volume;
      
    } catch (error) {
      logger.warn('Volume calculation error, using default 0.01');
      return 0.01;
    }
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
    return Array.from(this.accounts.values()).map(acc => ({
      id: acc.id,
      brokerName: acc.brokerName,
      accountType: acc.accountType,
      status: acc.status
    }));
  }

  /**
   * Basic dashboard compatibility methods (simplified)
   */
  async getAllAccountsData() {
    return this.getAccountStatuses().map(acc => ({
      ...acc,
      balance: 0,
      equity: 0,
      freeMargin: 0,
      marginLevel: 0,
      positions: [],
      lastUpdate: Date.now()
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
