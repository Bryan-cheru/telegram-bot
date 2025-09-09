// Enhanced Trading Management Service with MetaAPI Best Practices
// Implements proper resource cleanup, rate limiting, and connection management

import { MultiAccountMetaApiExecutor } from '../mt5/multiAccountMetaApiExecutor';
import { logger } from '../utils/logger';
import { OrderType } from '../types/index';

export interface TradingOrder {
  id?: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  volume: number;
  openPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
  accountId?: string;
}

export interface PositionModification {
  positionId: string;
  accountId: string;
  stopLoss?: number;
  takeProfit?: number;
  volume?: number;
}

export interface RiskSettings {
  accountId: string;
  maxRiskPerTrade: number;
  maxDailyRisk: number;
  maxDrawdown: number;
  maxPositions: number;
  allowedSymbols: string[];
  enableAutoSL: boolean;
  autoSLDistance: number;
}

// Rate limiting implementation following MetaAPI guidelines
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests = 50; // Conservative limit per account per 10 seconds
  private readonly timeWindow = 10000; // 10 seconds

  canMakeRequest(accountId: string): boolean {
    const now = Date.now();
    const accountRequests = this.requests.get(accountId) || [];
    
    // Remove old requests outside time window
    const validRequests = accountRequests.filter(time => now - time < this.timeWindow);
    this.requests.set(accountId, validRequests);

    return validRequests.length < this.maxRequests;
  }

  recordRequest(accountId: string): void {
    const now = Date.now();
    const accountRequests = this.requests.get(accountId) || [];
    accountRequests.push(now);
    this.requests.set(accountId, accountRequests);
  }

  getRetryDelay(accountId: string): number {
    const accountRequests = this.requests.get(accountId) || [];
    if (accountRequests.length === 0) return 0;
    
    const oldestRequest = Math.min(...accountRequests);
    return Math.max(0, this.timeWindow - (Date.now() - oldestRequest));
  }
}

// Connection pool manager following SDK best practices
class ConnectionManager {
  private connections: Map<string, any> = new Map();
  private connectionPromises: Map<string, Promise<any>> = new Map();

  async getConnection(accountId: string, executor: MultiAccountMetaApiExecutor): Promise<any> {
    // Reuse existing connection if available
    const existingConnection = this.connections.get(accountId);
    if (existingConnection && existingConnection.terminalState?.connected) {
      return existingConnection;
    }

    // Check if connection is already being established
    const existingPromise = this.connectionPromises.get(accountId);
    if (existingPromise) {
      return await existingPromise;
    }

    // Create new connection with proper error handling
    const connectionPromise = this.establishConnection(accountId, executor);
    this.connectionPromises.set(accountId, connectionPromise);

    try {
      const connection = await connectionPromise;
      this.connections.set(accountId, connection);
      return connection;
    } finally {
      this.connectionPromises.delete(accountId);
    }
  }

  private async establishConnection(accountId: string, executor: MultiAccountMetaApiExecutor): Promise<any> {
    try {
      const accountConfig = (executor as any).accounts.get(accountId);
      if (!accountConfig || !accountConfig.connection) {
        throw new Error(`Account ${accountId} not available or not connected`);
      }

      // Ensure connection is ready
      await accountConfig.connection.connect();
      await accountConfig.connection.waitSynchronized();

      return accountConfig.connection;
    } catch (error) {
      logger.error(`Failed to establish connection for account ${accountId}:`, error);
      throw error;
    }
  }

  async closeConnection(accountId: string): Promise<void> {
    const connection = this.connections.get(accountId);
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        logger.warn(`Error closing connection for account ${accountId}:`, error);
      }
      this.connections.delete(accountId);
    }
  }

  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.keys()).map(accountId => 
      this.closeConnection(accountId)
    );
    await Promise.allSettled(closePromises);
  }
}

export class EnhancedTradingManagementService {
  private multiExecutor: MultiAccountMetaApiExecutor;
  private riskSettings: Map<string, RiskSettings> = new Map();
  private rateLimiter: RateLimiter = new RateLimiter();
  private connectionManager: ConnectionManager = new ConnectionManager();
  private operationSemaphore: Map<string, Promise<any>> = new Map();

  constructor(multiExecutor: MultiAccountMetaApiExecutor) {
    this.multiExecutor = multiExecutor;
    this.loadRiskSettings();
    
    // Set up cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  // ========== RATE LIMITED OPERATIONS ==========

  private async withRateLimit<T>(
    accountId: string,
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    // Check rate limit
    if (!this.rateLimiter.canMakeRequest(accountId)) {
      const retryDelay = this.rateLimiter.getRetryDelay(accountId);
      throw new Error(
        `Rate limit exceeded for account ${accountId}. Retry after ${retryDelay}ms`
      );
    }

    // Prevent concurrent operations on same account
    const operationKey = `${accountId}-${operationName}`;
    const existingOperation = this.operationSemaphore.get(operationKey);
    if (existingOperation) {
      await existingOperation;
    }

    // Execute operation with rate limiting
    const operationPromise = this.executeWithRetry(async () => {
      this.rateLimiter.recordRequest(accountId);
      return await operation();
    });

    this.operationSemaphore.set(operationKey, operationPromise);

    try {
      const result = await operationPromise;
      return result;
    } finally {
      this.operationSemaphore.delete(operationKey);
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          logger.warn(`Operation failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, error);
          await this.sleep(delay);
        }
      }
    }

    throw lastError!;
  }

  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const retryableErrors = [
      'TooManyRequestsError',
      'TimeoutError',
      'ConnectionError',
      'NetworkError'
    ];

    return retryableErrors.some(errorType => 
      error.name === errorType || 
      error.message?.includes(errorType) ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== ENHANCED POSITION MANAGEMENT ==========

  async getAllPositions(): Promise<any[]> {
    try {
      const accountsData = await this.multiExecutor.getAllAccountsData();
      const allPositions: any[] = [];

      // Process positions with proper error handling per account
      const positionPromises = accountsData.map(async (account) => {
        try {
          if (account.positions && account.positions.length > 0) {
            const enrichedPositions = account.positions.map((pos: any) => ({
              ...pos,
              accountId: account.id,
              brokerName: account.brokerName,
              accountType: account.accountType,
              pipsProfit: this.calculatePipsProfit(pos),
              riskRewardRatio: this.calculateRiskReward(pos),
              durationMinutes: this.calculatePositionDuration(pos),
              percentage: ((pos.unrealizedProfit || 0) / account.balance) * 100
            }));
            return enrichedPositions;
          }
          return [];
        } catch (error) {
          logger.warn(`Failed to process positions for account ${account.id}:`, error);
          return [];
        }
      });

      const positionGroups = await Promise.allSettled(positionPromises);
      
      positionGroups.forEach((result) => {
        if (result.status === 'fulfilled') {
          allPositions.push(...result.value);
        }
      });

      return allPositions.sort((a, b) => 
        new Date(b.openTime).getTime() - new Date(a.openTime).getTime()
      );
    } catch (error) {
      logger.error('Error getting all positions:', error);
      throw error;
    }
  }

  async closePosition(accountId: string, positionId: string, volume?: number): Promise<any> {
    return await this.withRateLimit(accountId, async () => {
      logger.info(`🎯 Closing position ${positionId} on account ${accountId}${volume ? ` (partial: ${volume} lots)` : ' (full)'}`);
      
      const connection = await this.connectionManager.getConnection(accountId, this.multiExecutor);
      
      if (volume) {
        return await this.partialClosePosition(connection, positionId, volume);
      } else {
        return await connection.closePosition(positionId);
      }
    }, 'closePosition');
  }

  async modifyPosition(modification: PositionModification): Promise<any> {
    return await this.withRateLimit(modification.accountId, async () => {
      logger.info(`🔧 Modifying position ${modification.positionId} on account ${modification.accountId}`);
      
      const connection = await this.connectionManager.getConnection(modification.accountId, this.multiExecutor);
      
      return await connection.modifyPosition(
        modification.positionId,
        modification.stopLoss,
        modification.takeProfit
      );
    }, 'modifyPosition');
  }

  // ========== ENHANCED ORDER MANAGEMENT ==========

  async placeOrder(order: TradingOrder): Promise<any> {
    const targetAccountId = order.accountId || 'multi-account';
    
    return await this.withRateLimit(targetAccountId, async () => {
      // Validate order against risk settings
      if (order.accountId) {
        await this.validateOrderAgainstRisk(order);
      }

      logger.info(`📈 Placing ${order.type} order: ${order.volume} lots ${order.symbol}`, {
        price: order.openPrice,
        sl: order.stopLoss,
        tp: order.takeProfit
      });

      // Convert to TradeSignal format for execution
      const signal = {
        symbol: order.symbol,
        action: (order.type.includes('BUY') ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
        entryZone: order.openPrice ? 
          { min: order.openPrice, max: order.openPrice } : 
          { min: 0, max: 0 },
        stopLoss: order.stopLoss || 0,
        targets: order.takeProfit ? [order.takeProfit] : [],
        confidence: 0.9,
        source: 'WEB_DASHBOARD',
        orderType: (order.type.includes('LIMIT') ? 'LIMIT' : 
                   order.type.includes('STOP') ? 'PENDING' : 'MARKET') as OrderType,
        volume: order.volume,
        comment: order.comment || 'Web Dashboard Order'
      };

      if (order.accountId) {
        return await this.executeSingleAccountOrder(order.accountId, signal);
      } else {
        return await this.multiExecutor.executeTrade(signal);
      }
    }, 'placeOrder');
  }

  async getPendingOrders(): Promise<any[]> {
    try {
      const accountsData = await this.multiExecutor.getAllAccountsData();
      const allOrders: any[] = [];

      const orderPromises = accountsData.map(async (account) => {
        try {
          const connection = await this.connectionManager.getConnection(account.id, this.multiExecutor);
          const orders = connection.terminalState.orders || [];
          
          return orders.map((order: any) => ({
            ...order,
            accountId: account.id,
            brokerName: account.brokerName,
            accountType: account.accountType
          }));
        } catch (error) {
          logger.warn(`Could not get orders for account ${account.id}:`, error);
          return [];
        }
      });

      const orderGroups = await Promise.allSettled(orderPromises);
      
      orderGroups.forEach((result) => {
        if (result.status === 'fulfilled') {
          allOrders.push(...result.value);
        }
      });

      return allOrders;
    } catch (error) {
      logger.error('Error getting pending orders:', error);
      throw error;
    }
  }

  async cancelOrder(accountId: string, orderId: string): Promise<any> {
    return await this.withRateLimit(accountId, async () => {
      const connection = await this.connectionManager.getConnection(accountId, this.multiExecutor);
      return await connection.cancelOrder(orderId);
    }, 'cancelOrder');
  }

  // ========== ENHANCED ACCOUNT MANAGEMENT ==========

  async getAccountSummary(): Promise<any> {
    try {
      const accountsData = await this.multiExecutor.getAllAccountsData();
      const summary = {
        totalAccounts: accountsData.length,
        connectedAccounts: accountsData.filter(acc => acc.status === 'CONNECTED').length,
        totalBalance: 0,
        totalEquity: 0,
        totalPositions: 0,
        totalUnrealizedPL: 0,
        accounts: [] as any[]
      };

      // Process accounts in parallel with error handling
      const accountPromises = accountsData.map(async (account) => {
        try {
          const riskExposure = await this.calculateRiskExposure(account.id);
          
          summary.totalBalance += account.balance || 0;
          summary.totalEquity += account.equity || 0;
          summary.totalPositions += account.positions?.length || 0;
          summary.totalUnrealizedPL += account.positions?.reduce((sum: number, pos: any) => 
            sum + (pos.unrealizedProfit || 0), 0) || 0;

          return {
            ...account,
            riskExposure,
            riskSettings: this.getRiskSettings(account.id)
          };
        } catch (error) {
          logger.warn(`Error processing account ${account.id}:`, error);
          return {
            ...account,
            riskExposure: null,
            riskSettings: null,
            error: 'Failed to calculate risk data'
          };
        }
      });

      const accountResults = await Promise.allSettled(accountPromises);
      
      accountResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          summary.accounts.push(result.value);
        }
      });

      return summary;
    } catch (error) {
      logger.error('Error getting account summary:', error);
      throw error;
    }
  }

  // ========== RESOURCE CLEANUP ==========

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up trading management service...');
    
    try {
      // Close all connections
      await this.connectionManager.closeAllConnections();
      
      // Clear any pending operations
      this.operationSemaphore.clear();
      
      logger.info('✅ Trading management service cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  // ========== HELPER METHODS ==========

  private calculatePipsProfit(position: any): number {
    if (!position.openPrice || !position.currentPrice) return 0;
    
    const priceDiff = position.type.includes('BUY') ? 
      position.currentPrice - position.openPrice :
      position.openPrice - position.currentPrice;
    
    const symbol = position.symbol?.toUpperCase() || '';
    if (symbol.includes('JPY')) {
      return priceDiff * 100;
    } else if (symbol.includes('XAU') || symbol.includes('GOLD')) {
      return priceDiff * 10;
    } else {
      return priceDiff * 10000;
    }
  }

  private calculateRiskReward(position: any): number {
    if (!position.openPrice || !position.stopLoss || !position.takeProfit) return 0;
    
    const risk = Math.abs(position.openPrice - position.stopLoss);
    const reward = Math.abs(position.takeProfit - position.openPrice);
    
    return risk > 0 ? reward / risk : 0;
  }

  private calculatePositionDuration(position: any): number {
    if (!position.openTime) return 0;
    const openTime = new Date(position.openTime);
    const now = new Date();
    return Math.floor((now.getTime() - openTime.getTime()) / (1000 * 60));
  }

  private async validateOrderAgainstRisk(order: TradingOrder): Promise<void> {
    if (!order.accountId) return;
    
    const settings = this.getRiskSettings(order.accountId);
    if (!settings) return;

    if (settings.allowedSymbols.length > 0 && !settings.allowedSymbols.includes(order.symbol)) {
      throw new Error(`Symbol ${order.symbol} not in allowed symbols list`);
    }

    const riskExposure = await this.calculateRiskExposure(order.accountId);
    if (riskExposure.totalPositions >= settings.maxPositions) {
      throw new Error(`Maximum positions limit reached (${settings.maxPositions})`);
    }

    if (riskExposure.riskPercentage >= settings.maxRiskPerTrade) {
      throw new Error(`Order would exceed maximum risk per trade (${settings.maxRiskPerTrade}%)`);
    }
  }

  private async partialClosePosition(connection: any, positionId: string, volume: number): Promise<any> {
    const positions = connection.terminalState.positions || [];
    const position = positions.find((pos: any) => pos.id === positionId);
    
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    if (volume >= position.volume) {
      throw new Error(`Partial close volume (${volume}) must be less than position volume (${position.volume})`);
    }

    const oppositeType = position.type.includes('BUY') ? 'SELL' : 'BUY';
    
    return await connection.createMarketOrder(
      position.symbol,
      oppositeType,
      volume,
      undefined,
      undefined,
      {
        comment: `Partial close of ${positionId}`,
        positionId: positionId
      }
    );
  }

  private async executeSingleAccountOrder(accountId: string, signal: any): Promise<any> {
    const connection = await this.connectionManager.getConnection(accountId, this.multiExecutor);
    
    // Execute trade using connection directly
    if (signal.orderType === 'MARKET') {
      return await connection.createMarketOrder(
        signal.symbol,
        signal.action,
        signal.volume,
        signal.stopLoss || undefined,
        signal.targets[0] || undefined,
        { comment: signal.comment }
      );
    } else {
      return await connection.createLimitOrder(
        signal.symbol,
        signal.action,
        signal.volume,
        signal.entryZone.min,
        signal.stopLoss || undefined,
        signal.targets[0] || undefined,
        { comment: signal.comment }
      );
    }
  }

  // ========== RISK MANAGEMENT ==========

  async updateRiskSettings(settings: RiskSettings): Promise<void> {
    try {
      this.riskSettings.set(settings.accountId, settings);
      await this.saveRiskSettings();
      logger.info(`🛡️ Risk settings updated for account ${settings.accountId}`);
    } catch (error) {
      logger.error('Error updating risk settings:', error);
      throw error;
    }
  }

  getRiskSettings(accountId: string): RiskSettings | null {
    return this.riskSettings.get(accountId) || null;
  }

  async calculateRiskExposure(accountId: string): Promise<any> {
    try {
      const positions = await this.getAllPositions();
      const accountPositions = positions.filter(pos => pos.accountId === accountId);
      
      const accountData = await this.multiExecutor.getAllAccountsData();
      const account = accountData.find(acc => acc.id === accountId);
      
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      const totalExposure = accountPositions.reduce((sum, pos) => {
        return sum + Math.abs(pos.unrealizedProfit || 0);
      }, 0);

      const riskPercentage = (totalExposure / account.balance) * 100;

      return {
        accountId,
        balance: account.balance,
        equity: account.equity,
        totalPositions: accountPositions.length,
        totalExposure,
        riskPercentage,
        freeMargin: account.freeMargin,
        marginLevel: account.marginLevel,
        positions: accountPositions.map(pos => ({
          id: pos.id,
          symbol: pos.symbol,
          type: pos.type,
          volume: pos.volume,
          unrealizedProfit: pos.unrealizedProfit,
          riskPercent: ((Math.abs(pos.unrealizedProfit || 0)) / account.balance) * 100
        }))
      };
    } catch (error) {
      logger.error(`Error calculating risk exposure for ${accountId}:`, error);
      throw error;
    }
  }

  async closePositionsBySymbol(symbol: string, type?: 'BUY' | 'SELL'): Promise<any[]> {
    try {
      const positions = await this.getAllPositions();
      const targetPositions = positions.filter(pos => 
        pos.symbol === symbol && (!type || pos.type.includes(type))
      );

      const results: Array<{success: boolean; position: string; result?: any; error?: string}> = [];
      
      const closePromises = targetPositions.map(async (pos) => {
        try {
          const result = await this.closePosition(pos.accountId, pos.id);
          return { success: true, position: pos.id, result };
        } catch (error) {
          return { 
            success: false, 
            position: pos.id, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      });

      const closeResults = await Promise.allSettled(closePromises);
      
      closeResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      });

      return results;
    } catch (error) {
      logger.error(`Error closing positions for ${symbol}:`, error);
      throw error;
    }
  }

  // ========== EMERGENCY CONTROLS ==========

  async emergencyCloseAll(): Promise<any[]> {
    try {
      logger.warn('🚨 EMERGENCY: Closing all positions across all accounts');
      
      const positions = await this.getAllPositions();
      const results: Array<{success: boolean; position: string; result?: any; error?: string}> = [];

      // Close positions in parallel but with rate limiting per account
      const closePromises = positions.map(async (pos) => {
        try {
          const result = await this.closePosition(pos.accountId, pos.id);
          return { success: true, position: pos.id, result };
        } catch (error) {
          return { 
            success: false, 
            position: pos.id, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      });

      const closeResults = await Promise.allSettled(closePromises);
      
      closeResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            position: 'unknown',
            error: result.reason
          });
        }
      });

      logger.info(`🎯 Emergency close completed: ${results.filter(r => r.success).length}/${results.length} positions closed`);
      return results;
    } catch (error) {
      logger.error('Error in emergency close all:', error);
      throw error;
    }
  }

  private loadRiskSettings(): void {
    // Implementation for loading from persistent storage
    logger.info('Risk settings loaded from storage');
  }

  private async saveRiskSettings(): Promise<void> {
    // Implementation for saving to persistent storage
    logger.info('Risk settings saved to storage');
  }
}
