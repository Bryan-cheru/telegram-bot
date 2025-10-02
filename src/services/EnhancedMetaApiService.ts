/**
 * Enhanced MetaAPI Trading Service
 * Single service combining trade execution and risk management
 */

import MetaApi from 'metaapi.cloud-sdk';
import { TradeSignal } from '../types';
import { logger } from '../utils/logger';

interface RiskSettings {
  maxDrawdownPercent: number;
  maxDailyLossPercent: number;
  maxPositionSizePercent: number;
  maxOpenPositions: number;
}

interface EnhancedTradeRequest {
  signal: TradeSignal;
  accountId: string;
  riskPercent?: number;
  maxSlippage?: number;
}

interface TradeExecutionResult {
  success: boolean;
  ticket?: string;
  message: string;
  executionPrice?: number;
  positionSize?: number;
  riskAmount?: number;
}

export class EnhancedMetaApiService {
  private api: MetaApi;
  private riskSettings: RiskSettings;
  
  constructor(riskSettings?: Partial<RiskSettings>) {
    this.api = new MetaApi(process.env.METAAPI_TOKEN!);
    
    // Set default risk settings
    this.riskSettings = {
      maxDrawdownPercent: 10,
      maxDailyLossPercent: 5,
      maxPositionSizePercent: 5,
      maxOpenPositions: 10,
      ...riskSettings
    };
  }

  /**
   * Execute enhanced trade with comprehensive risk management
   */
  async executeEnhancedTrade(request: EnhancedTradeRequest): Promise<TradeExecutionResult> {
    try {
      const { signal, accountId, riskPercent = 0.45, maxSlippage = 3 } = request;
      
      logger.info(`🚀 Enhanced execution: ${signal.symbol} on account ${accountId}`);
      
      // Get account and RPC connection
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      const connection = account.getRPCConnection();
      await connection.connect();

      // Pre-trade risk validation
      const riskCheck = await this.validateTradeRisk(connection, signal, riskPercent);
      if (!riskCheck.allowed) {
        return { success: false, message: `Risk check failed: ${riskCheck.reason}` };
      }

      // Calculate position size
      const positionSize = await this.calculatePositionSize(connection, signal, riskPercent);
      if (positionSize <= 0) {
        return { success: false, message: 'Invalid position size calculated' };
      }

      // Execute the trade
      const result = await this.executeTrade(connection, signal, positionSize, maxSlippage);
      
      if (result.success) {
        // Start monitoring this account
        setTimeout(() => this.monitorAccountRisk(accountId), 5000);
        
        logger.info(`✅ Enhanced trade executed:`, {
          symbol: signal.symbol,
          ticket: result.ticket,
          size: positionSize,
          risk: riskPercent + '%'
        });
      }

      return { ...result, positionSize };

    } catch (error) {
      logger.error('Enhanced trade execution failed:', error);
      return {
        success: false,
        message: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Validate trade against risk parameters
   */
  private async validateTradeRisk(
    connection: any, 
    signal: TradeSignal, 
    riskPercent: number
  ): Promise<{allowed: boolean, reason?: string}> {
    
    try {
      // Get account info
      const accountInfo = await connection.getAccountInformation();
      if (!accountInfo) {
        return { allowed: false, reason: 'Cannot retrieve account information' };
      }

      // Check if trading is allowed
      if (!accountInfo.tradeAllowed) {
        return { allowed: false, reason: 'Trading not allowed on account' };
      }

      // Check drawdown
      const drawdown = ((accountInfo.balance - accountInfo.equity) / accountInfo.balance) * 100;
      if (drawdown > this.riskSettings.maxDrawdownPercent) {
        return { 
          allowed: false, 
          reason: `Drawdown ${drawdown.toFixed(2)}% exceeds limit ${this.riskSettings.maxDrawdownPercent}%` 
        };
      }

      // Check position count
      const positions = await connection.getPositions();
      if (positions.length >= this.riskSettings.maxOpenPositions) {
        return { 
          allowed: false, 
          reason: `Max positions (${this.riskSettings.maxOpenPositions}) reached` 
        };
      }

      // Check position size risk
      if (riskPercent > this.riskSettings.maxPositionSizePercent) {
        return { 
          allowed: false, 
          reason: `Risk ${riskPercent}% exceeds limit ${this.riskSettings.maxPositionSizePercent}%` 
        };
      }

      // Check free margin
      const freeMarginPercent = ((accountInfo.equity - accountInfo.margin) / accountInfo.equity) * 100;
      if (freeMarginPercent < 20) {
        return { 
          allowed: false, 
          reason: `Insufficient free margin: ${freeMarginPercent.toFixed(2)}%` 
        };
      }

      return { allowed: true };

    } catch (error) {
      logger.error('Risk validation error:', error);
      return { allowed: false, reason: 'Risk validation failed' };
    }
  }

  /**
   * Calculate optimal position size based on risk
   */
  private async calculatePositionSize(
    connection: any, 
    signal: TradeSignal, 
    riskPercent: number
  ): Promise<number> {
    
    try {
      const accountInfo = await connection.getAccountInformation();
      if (!accountInfo) return 0.01;

      const accountEquity = accountInfo.equity || accountInfo.balance;
      const riskAmount = (accountEquity * riskPercent) / 100;
      
      // Calculate stop loss distance in pips
      const stopLossPips = this.calculateStopLossPips(signal);
      
      // Position sizing calculation
      const pipValue = signal.symbol.includes('JPY') ? 0.01 : 0.0001;
      const positionSize = riskAmount / (stopLossPips * pipValue * 100000);
      
      // Apply maximum limits
      const maxSize = (accountEquity * this.riskSettings.maxPositionSizePercent) / 100 / 100000;
      const finalSize = Math.min(positionSize, maxSize);
      
      return Math.max(0.01, Math.round(finalSize * 100) / 100);
      
    } catch (error) {
      logger.error('Position size calculation error:', error);
      return 0.01;
    }
  }

  /**
   * Calculate 1:1 risk-reward take profit
   */
  private calculate1To1TakeProfit(signal: TradeSignal): number {
    const entryPrice = signal.entryPrice || 0;
    const stopLoss = signal.stopLoss;
    
    if (!entryPrice || !stopLoss) {
      logger.warn('Missing entry price or stop loss for 1:1 calculation');
      return signal.targets?.[0] || entryPrice;
    }
    
    const stopLossDistance = Math.abs(entryPrice - stopLoss);
    
    // For BUY: TP = Entry + SL Distance
    // For SELL: TP = Entry - SL Distance
    if (signal.action.toLowerCase() === 'buy') {
      return entryPrice + stopLossDistance;
    } else {
      return entryPrice - stopLossDistance;
    }
  }

  /**
   * Execute the actual trade
   */
  private async executeTrade(
    connection: any, 
    signal: TradeSignal, 
    positionSize: number, 
    maxSlippage: number
  ): Promise<TradeExecutionResult> {
    
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Calculate 1:1 risk-reward take profit
        const takeProfit = this.calculate1To1TakeProfit(signal);
        let result;
        
        if (signal.action.toLowerCase() === 'buy') {
          result = await connection.createMarketBuyOrder(
            signal.symbol,
            positionSize,
            signal.stopLoss,
            takeProfit,
            {
              comment: `Enhanced-Signal-${Date.now()}`,
              slippage: maxSlippage,
              fillingMode: 'ORDER_FILLING_IOC'
            }
          );
        } else {
          result = await connection.createMarketSellOrder(
            signal.symbol,
            positionSize,
            signal.stopLoss,
            takeProfit,
            {
              comment: `Enhanced-Signal-${Date.now()}`,
              slippage: maxSlippage,
              fillingMode: 'ORDER_FILLING_IOC'
            }
          );
        }

        if (result?.positionId) {
          return {
            success: true,
            ticket: result.positionId,
            message: 'Trade executed successfully',
            executionPrice: result.price || signal.entryPrice
          };
        }

        throw new Error('No position ID returned from trade execution');

      } catch (error: any) {
        logger.warn(`Trade attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          return {
            success: false,
            message: `Trade failed after ${maxRetries} attempts: ${error.message}`
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return { success: false, message: 'Max retries exceeded' };
  }

  /**
   * Monitor account for risk violations
   */
  async monitorAccountRisk(accountId: string): Promise<void> {
    try {
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      const connection = account.getRPCConnection();
      await connection.connect();
      
      const accountInfo = await connection.getAccountInformation();
      if (!accountInfo) return;

      // Check drawdown
      const drawdown = ((accountInfo.balance - accountInfo.equity) / accountInfo.balance) * 100;
      
      if (drawdown > this.riskSettings.maxDrawdownPercent) {
        logger.error(`🚨 CRITICAL: Account ${accountId} drawdown ${drawdown.toFixed(2)}%`);
        await this.emergencyCloseAllPositions(accountId);
      }

      // Check margin level
      const freeMarginPercent = ((accountInfo.equity - accountInfo.margin) / accountInfo.equity) * 100;
      
      if (freeMarginPercent < 10) {
        logger.warn(`⚠️ LOW MARGIN: Account ${accountId} free margin ${freeMarginPercent.toFixed(2)}%`);
      }

    } catch (error) {
      logger.error(`Risk monitoring error for ${accountId}:`, error);
    }
  }

  /**
   * Emergency close all positions
   */
  private async emergencyCloseAllPositions(accountId: string): Promise<void> {
    try {
      logger.warn(`🚨 Emergency closure initiated for account ${accountId}`);
      
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      const connection = account.getRPCConnection();
      await connection.connect();
      
      const positions = await connection.getPositions();
      
      for (const position of positions) {
        try {
          // Close using opposite market order
          if (position.type === 'POSITION_TYPE_BUY') {
            await connection.createMarketSellOrder(position.symbol, position.volume);
          } else {
            await connection.createMarketBuyOrder(position.symbol, position.volume);
          }
          
          logger.info(`✅ Emergency closed position ${position.id} (${position.symbol})`);
        } catch (closeError) {
          logger.error(`❌ Failed to close position ${position.id}:`, closeError);
        }
      }
      
    } catch (error) {
      logger.error('Emergency closure error:', error);
    }
  }

  /**
   * Get account performance summary
   */
  async getAccountSummary(accountId: string): Promise<any> {
    try {
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      const connection = account.getRPCConnection();
      await connection.connect();
      
      const accountInfo = await connection.getAccountInformation();
      const positions = await connection.getPositions();
      
      if (!accountInfo) return null;

      const totalProfit = positions.reduce((sum: number, pos: any) => sum + (pos.profit || 0), 0);
      const drawdown = ((accountInfo.balance - accountInfo.equity) / accountInfo.balance) * 100;

      return {
        accountId,
        balance: accountInfo.balance,
        equity: accountInfo.equity,
        margin: accountInfo.margin,
        freeMargin: accountInfo.equity - accountInfo.margin,
        marginLevel: accountInfo.marginLevel,
        totalProfit,
        drawdown,
        positionCount: positions.length,
        tradeAllowed: accountInfo.tradeAllowed,
        riskStatus: drawdown > this.riskSettings.maxDrawdownPercent ? 'HIGH_RISK' : 'NORMAL'
      };
      
    } catch (error) {
      logger.error(`Error getting account summary for ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Calculate stop loss distance in pips
   */
  private calculateStopLossPips(signal: TradeSignal): number {
    if (!signal.entryZone?.min || !signal.stopLoss) {
      return 20; // Default 20 pips
    }

    const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    const pipValue = signal.symbol.includes('JPY') ? 0.01 : 0.0001;
    
    return Math.abs(entryPrice - signal.stopLoss) / pipValue;
  }

  /**
   * Update risk settings
   */
  updateRiskSettings(newSettings: Partial<RiskSettings>): void {
    this.riskSettings = { ...this.riskSettings, ...newSettings };
    logger.info('Risk settings updated:', this.riskSettings);
  }
}