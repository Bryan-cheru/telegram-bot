// Advanced Trading Management API for MetaAPI Integration
// Provides comprehensive trading control from web dashboard

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
  volume?: number; // For partial closes
}

export interface RiskSettings {
  accountId: string;
  maxRiskPerTrade: number; // Percentage
  maxDailyRisk: number; // Percentage
  maxDrawdown: number; // Percentage
  maxPositions: number;
  allowedSymbols: string[];
  enableAutoSL: boolean;
  autoSLDistance: number; // Pips
}

export class TradingManagementService {
  private multiExecutor: MultiAccountMetaApiExecutor;
  private riskSettings: Map<string, RiskSettings> = new Map();

  constructor(multiExecutor: MultiAccountMetaApiExecutor) {
    this.multiExecutor = multiExecutor;
    this.loadRiskSettings();
  }

  // ========== POSITION MANAGEMENT ==========

  /**
   * Get all positions across all accounts with detailed info
   */
  async getAllPositions(): Promise<any[]> {
    try {
      const accountsData = await this.multiExecutor.getAllAccountsData();
      const allPositions: any[] = [];

      for (const account of accountsData) {
        if (account.positions && account.positions.length > 0) {
          const enrichedPositions = account.positions.map((pos: any) => ({
            ...pos,
            accountId: account.id,
            brokerName: account.brokerName,
            accountType: account.accountType,
            // Calculate additional metrics
            pipsProfit: this.calculatePipsProfit(pos),
            riskRewardRatio: this.calculateRiskReward(pos),
            durationMinutes: this.calculatePositionDuration(pos),
            percentage: ((pos.unrealizedProfit || 0) / account.balance) * 100
          }));
          allPositions.push(...enrichedPositions);
        }
      }

      return allPositions.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
    } catch (error) {
      logger.error('Error getting all positions:', error);
      throw error;
    }
  }

  /**
   * Close a specific position
   */
  async closePosition(accountId: string, positionId: string, volume?: number): Promise<any> {
    try {
      logger.info(`🎯 Closing position ${positionId} on account ${accountId}${volume ? ` (partial: ${volume} lots)` : ' (full)'}`);
      
      if (volume) {
        // Partial close - modify the position volume
        return await this.partialClosePosition(accountId, positionId, volume);
      } else {
        // Full close
        return await this.multiExecutor.closePosition(accountId, positionId);
      }
    } catch (error) {
      logger.error(`Error closing position ${positionId}:`, error);
      throw error;
    }
  }

  /**
   * Close all positions for a specific symbol
   */
  async closePositionsBySymbol(symbol: string, type?: 'BUY' | 'SELL'): Promise<any[]> {
    try {
      const positions = await this.getAllPositions();
      const targetPositions = positions.filter(pos => 
        pos.symbol === symbol && (!type || pos.type.includes(type))
      );

      const results = [];
      for (const pos of targetPositions) {
        try {
          const result = await this.closePosition(pos.accountId, pos.id);
          results.push({ success: true, position: pos.id, result });
        } catch (error) {
          results.push({ success: false, position: pos.id, error: error instanceof Error ? error.message : String(error) });
        }
      }

      return results;
    } catch (error) {
      logger.error(`Error closing positions for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Emergency close all positions across all accounts
   */
  async emergencyCloseAll(): Promise<any[]> {
    try {
      logger.warn('🚨 EMERGENCY: Closing all positions across all accounts');
      
      const positions = await this.getAllPositions();
      const results = [];

      for (const pos of positions) {
        try {
          const result = await this.closePosition(pos.accountId, pos.id);
          results.push({ success: true, position: pos.id, result });
        } catch (error) {
          results.push({ success: false, position: pos.id, error: error instanceof Error ? error.message : String(error) });
        }
      }

      logger.info(`🎯 Emergency close completed: ${results.filter(r => r.success).length}/${results.length} positions closed`);
      return results;
    } catch (error) {
      logger.error('Error in emergency close all:', error);
      throw error;
    }
  }

  // ========== ORDER MANAGEMENT ==========

  /**
   * Place a new trading order
   */
  async placeOrder(order: TradingOrder): Promise<any> {
    try {
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
          { min: 0, max: 0 }, // Market order
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
        // Execute on specific account
        return await this.executeSingleAccountOrder(order.accountId, signal);
      } else {
        // Execute across all accounts
        return await this.multiExecutor.executeTrade(signal);
      }
    } catch (error) {
      logger.error('Error placing order:', error);
      throw error;
    }
  }

  /**
   * Modify an existing position (SL/TP)
   */
  async modifyPosition(modification: PositionModification): Promise<any> {
    try {
      logger.info(`🔧 Modifying position ${modification.positionId} on account ${modification.accountId}`);
      
      // Get the account connection
      const accountConfig = (this.multiExecutor as any).accounts.get(modification.accountId);
      if (!accountConfig || !accountConfig.connection) {
        throw new Error(`Account ${modification.accountId} not connected`);
      }

      const result = await accountConfig.connection.modifyPosition(
        modification.positionId,
        modification.stopLoss,
        modification.takeProfit
      );

      logger.info(`✅ Position ${modification.positionId} modified successfully`);
      return result;
    } catch (error) {
      logger.error(`Error modifying position ${modification.positionId}:`, error);
      throw error;
    }
  }

  /**
   * Get pending orders across all accounts
   */
  async getPendingOrders(): Promise<any[]> {
    try {
      const accountsData = await this.multiExecutor.getAllAccountsData();
      const allOrders: any[] = [];

      for (const account of accountsData) {
        try {
          const accountConfig = (this.multiExecutor as any).accounts.get(account.id);
          if (accountConfig && accountConfig.connection) {
            const orders = accountConfig.connection.terminalState.orders || [];
            const enrichedOrders = orders.map((order: any) => ({
              ...order,
              accountId: account.id,
              brokerName: account.brokerName,
              accountType: account.accountType
            }));
            allOrders.push(...enrichedOrders);
          }
        } catch (error) {
          logger.warn(`Could not get orders for account ${account.id}:`, error);
        }
      }

      return allOrders;
    } catch (error) {
      logger.error('Error getting pending orders:', error);
      throw error;
    }
  }

  /**
   * Cancel a pending order
   */
  async cancelOrder(accountId: string, orderId: string): Promise<any> {
    try {
      const accountConfig = (this.multiExecutor as any).accounts.get(accountId);
      if (!accountConfig || !accountConfig.connection) {
        throw new Error(`Account ${accountId} not connected`);
      }

      const result = await accountConfig.connection.cancelOrder(orderId);
      logger.info(`✅ Order ${orderId} cancelled on account ${accountId}`);
      return result;
    } catch (error) {
      logger.error(`Error cancelling order ${orderId}:`, error);
      throw error;
    }
  }

  // ========== RISK MANAGEMENT ==========

  /**
   * Update risk settings for an account
   */
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

  /**
   * Get risk settings for an account
   */
  getRiskSettings(accountId: string): RiskSettings | null {
    return this.riskSettings.get(accountId) || null;
  }

  /**
   * Calculate current risk exposure for an account
   */
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

  // ========== ACCOUNT MANAGEMENT ==========

  /**
   * Get comprehensive account summary
   */
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
        accounts: []
      };

      for (const account of accountsData) {
        const riskExposure = await this.calculateRiskExposure(account.id);
        
        summary.totalBalance += account.balance || 0;
        summary.totalEquity += account.equity || 0;
        summary.totalPositions += account.positions?.length || 0;
        summary.totalUnrealizedPL += account.positions?.reduce((sum: number, pos: any) => 
          sum + (pos.unrealizedProfit || 0), 0) || 0;

        (summary.accounts as any[]).push({
          ...account,
          riskExposure,
          riskSettings: this.getRiskSettings(account.id)
        });
      }

      return summary;
    } catch (error) {
      logger.error('Error getting account summary:', error);
      throw error;
    }
  }

  // ========== HELPER METHODS ==========

  private calculatePipsProfit(position: any): number {
    if (!position.openPrice || !position.currentPrice) return 0;
    
    const priceDiff = position.type.includes('BUY') ? 
      position.currentPrice - position.openPrice :
      position.openPrice - position.currentPrice;
    
    // Simple pip calculation (adjust for different symbols)
    const symbol = position.symbol?.toUpperCase() || '';
    if (symbol.includes('JPY')) {
      return priceDiff * 100; // JPY pairs
    } else if (symbol.includes('XAU') || symbol.includes('GOLD')) {
      return priceDiff * 10; // Gold
    } else {
      return priceDiff * 10000; // Major forex pairs
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
    return Math.floor((now.getTime() - openTime.getTime()) / (1000 * 60)); // Minutes
  }

  private async validateOrderAgainstRisk(order: TradingOrder): Promise<void> {
    if (!order.accountId) return;
    
    const settings = this.getRiskSettings(order.accountId);
    if (!settings) return;

    // Check if symbol is allowed
    if (settings.allowedSymbols.length > 0 && !settings.allowedSymbols.includes(order.symbol)) {
      throw new Error(`Symbol ${order.symbol} not in allowed symbols list`);
    }

    // Check current positions count
    const riskExposure = await this.calculateRiskExposure(order.accountId);
    if (riskExposure.totalPositions >= settings.maxPositions) {
      throw new Error(`Maximum positions limit reached (${settings.maxPositions})`);
    }

    // Check risk percentage
    if (riskExposure.riskPercentage >= settings.maxRiskPerTrade) {
      throw new Error(`Order would exceed maximum risk per trade (${settings.maxRiskPerTrade}%)`);
    }
  }

  private async partialClosePosition(accountId: string, positionId: string, volume: number): Promise<any> {
    const accountConfig = (this.multiExecutor as any).accounts.get(accountId);
    if (!accountConfig || !accountConfig.connection) {
      throw new Error(`Account ${accountId} not connected`);
    }

    // Get current position
    const positions = await this.getAllPositions();
    const position = positions.find(pos => pos.id === positionId && pos.accountId === accountId);
    
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    if (volume >= position.volume) {
      throw new Error(`Partial close volume (${volume}) must be less than position volume (${position.volume})`);
    }

    // Create opposite order to partially close
    const oppositeType = position.type.includes('BUY') ? 'SELL' : 'BUY';
    
    return await accountConfig.connection.createMarketOrder(
      position.symbol,
      oppositeType,
      volume,
      undefined, // No SL for closing order
      undefined, // No TP for closing order
      {
        comment: `Partial close of ${positionId}`,
        positionId: positionId
      }
    );
  }

  private async executeSingleAccountOrder(accountId: string, signal: any): Promise<any> {
    const accountConfig = (this.multiExecutor as any).accounts.get(accountId);
    if (!accountConfig || !accountConfig.connection) {
      throw new Error(`Account ${accountId} not connected`);
    }

    // Execute the trade on specific account
    return await (this.multiExecutor as any).performTradeExecution(signal, accountConfig, []);
  }

  private loadRiskSettings(): void {
    // Load from file or database - implementation depends on storage choice
    // For now, set default risk settings
    const defaultSettings: RiskSettings = {
      accountId: '',
      maxRiskPerTrade: 2.0,
      maxDailyRisk: 6.0,
      maxDrawdown: 10.0,
      maxPositions: 5,
      allowedSymbols: [],
      enableAutoSL: true,
      autoSLDistance: 50
    };
    
    // Apply default settings to all accounts
    // In production, load from persistent storage
  }

  private async saveRiskSettings(): Promise<void> {
    // Save to file or database - implementation depends on storage choice
    logger.info('Risk settings saved');
  }
}
