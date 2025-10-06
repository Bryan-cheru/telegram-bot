/**
 * Enhanced MetaAPI Trading Service
 * Single service combining trade execution and risk management
 */

import MetaApi from 'metaapi.cloud-sdk';
import { TradeSignal } from '../types';
import { logger } from '../utils/logger';
import { MetaApiConnectionPool } from './MetaApiConnectionPool';
import { MetaApiRateLimiter } from './MetaApiRateLimiter';
import { EnhancedPositionSizingService } from './EnhancedPositionSizingService';

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
  private connectionPool: MetaApiConnectionPool;
  private rateLimiter: MetaApiRateLimiter;
  private positionSizingService: EnhancedPositionSizingService;
  
  constructor(riskSettings?: Partial<RiskSettings>) {
    this.api = new MetaApi(process.env.METAAPI_TOKEN!);
    this.connectionPool = new MetaApiConnectionPool();
    this.rateLimiter = new MetaApiRateLimiter();
    this.positionSizingService = new EnhancedPositionSizingService();
    
    // Load risk settings from environment variables with fallbacks
    this.riskSettings = {
      maxDrawdownPercent: parseFloat(process.env.MAX_DRAWDOWN_PERCENT || '10'),
      maxDailyLossPercent: parseFloat(process.env.MAX_DAILY_LOSS_PERCENT || '5'),
      maxPositionSizePercent: parseFloat(process.env.MAX_POSITION_SIZE_PERCENT || '5'),
      maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS || '10'),
      ...riskSettings
    };
  }

  /**
   * Execute enhanced trade with comprehensive risk management
   */
  async executeEnhancedTrade(request: EnhancedTradeRequest): Promise<TradeExecutionResult> {
    let connection: any = null;
    
    try {
      const { signal, accountId, maxSlippage = 3 } = request;
      const riskPercent = request.riskPercent || parseFloat(process.env.RISK_PERCENTAGE || '0.45');
      
      // 🔍 VALIDATION GATE 1: Input Signal
      logger.info(`🔍 VALIDATION GATE 1: Input Signal Validation`);
      if (!signal) {
        logger.error(`❌ GATE 1 FAILED: Signal is null/undefined`);
        return { success: false, message: 'No signal provided' };
      }
      
      if (!signal.symbol || !signal.action) {
        logger.error(`❌ GATE 1 FAILED: Signal missing required fields`, {
          hasSymbol: !!signal.symbol,
          hasAction: !!signal.action,
          signal: signal
        });
        return { success: false, message: 'Signal missing required fields (symbol or action)' };
      }
      
      logger.info(`✅ GATE 1 PASSED: Signal validation successful`, {
        symbol: signal.symbol,
        action: signal.action,
        hasStopLoss: !!signal.stopLoss,
        hasTargets: !!signal.targets?.length,
        hasEntryZone: !!(signal.entryZone?.min && signal.entryZone?.max)
      });
      
      // 🔗 CONNECTION SETUP: Use connection pool for efficiency
      logger.info(`🔗 Getting connection to account ${accountId} from pool`);
      connection = await this.connectionPool.getConnection(accountId);
      logger.info(`✅ Connection obtained from pool`);
      
      // 🔄 SYMBOL CONVERSION: Using the established connection
      logger.info(`🔄 Converting symbol for broker compatibility`);
      const convertedSignal = await this.convertSymbolForBroker(signal, connection);
      
      // 🔍 VALIDATION GATE 2: Converted Signal
      logger.info(`🔍 VALIDATION GATE 2: Converted Signal Validation`);
      if (!convertedSignal || !convertedSignal.symbol || !convertedSignal.action) {
        logger.error(`❌ GATE 2 FAILED: Signal corruption during conversion`, {
          originalSymbol: signal.symbol,
          convertedSignal: convertedSignal
        });
        return { success: false, message: 'Signal corrupted during symbol conversion' };
      }
      
      logger.info(`✅ GATE 2 PASSED: Converted signal validation successful`, {
        originalSymbol: signal.symbol,
        convertedSymbol: convertedSignal.symbol,
        symbolChanged: signal.symbol !== convertedSignal.symbol
      });

      // 🔍 VALIDATION GATE 3: Risk Management
      logger.info(`🔍 VALIDATION GATE 3: Risk Management Validation`);
      const riskCheck = await this.validateTradeRisk(connection, convertedSignal, riskPercent);
      if (!riskCheck.allowed) {
        logger.error(`❌ GATE 3 FAILED: ${riskCheck.reason}`);
        return { success: false, message: `Risk check failed: ${riskCheck.reason}` };
      }
      logger.info(`✅ GATE 3 PASSED: Risk validation successful`);

      // 📊 ENHANCED POSITION SIZE CALCULATION
      logger.info(`📊 Calculating position size with $900 fixed risk`);
      const entryPrice = convertedSignal.entryPrice || (convertedSignal.entryZone ? (convertedSignal.entryZone.min + convertedSignal.entryZone.max) / 2 : 0);
      
      if (!entryPrice || !convertedSignal.stopLoss) {
        logger.error(`❌ Missing entry price or stop loss for position sizing`);
        return { success: false, message: 'Missing entry price or stop loss for accurate position sizing' };
      }

      const positionCalculation = await this.positionSizingService.calculatePositionSize(
        connection,
        convertedSignal.symbol,
        entryPrice,
        convertedSignal.stopLoss
      );
      
      if (positionCalculation.warnings.length > 0) {
        logger.warn(`⚠️ Position sizing warnings:`, positionCalculation.warnings);
      }
      
      const positionSize = positionCalculation.lotSize;
      if (positionSize <= 0) {
        logger.error(`❌ Position size calculation failed: ${positionSize}`);
        return { success: false, message: 'Invalid position size calculated' };
      }
      
      logger.info(`✅ Enhanced position size calculated: ${positionSize} lots`);
      logger.info(`   Risk Amount: $${positionCalculation.riskAmount.toFixed(2)}`);
      logger.info(`   Method: ${positionCalculation.calculationMethod}`);

      // 🔍 VALIDATION GATE 4: Final Trade Parameters
      logger.info(`🔍 VALIDATION GATE 4: Final Trade Parameters Validation`);
      const takeProfit = this.calculate1To1TakeProfit(convertedSignal);
      
      if (!convertedSignal.stopLoss || !takeProfit) {
        logger.error(`❌ GATE 4 FAILED: Missing stop loss or take profit`, {
          stopLoss: convertedSignal.stopLoss,
          takeProfit: takeProfit
        });
        return { success: false, message: 'Missing stop loss or take profit levels' };
      }
      
      logger.info(`✅ GATE 4 PASSED: All trade parameters valid`, {
        symbol: convertedSignal.symbol,
        action: convertedSignal.action,
        volume: positionSize,
        stopLoss: convertedSignal.stopLoss,
        takeProfit: takeProfit
      });

      // 🚀 ATOMIC TRADE EXECUTION
      logger.info(`🚀 Executing atomic trade`);
      const result = await this.executeTrade(connection, convertedSignal, positionSize, maxSlippage);
      
      if (result.success) {
        logger.info(`✅ ATOMIC TRADE SUCCESS: Trade executed successfully`, {
          ticket: result.ticket,
          symbol: convertedSignal.symbol,
          action: convertedSignal.action,
          volume: positionSize,
          executionPrice: result.executionPrice,
          riskPercent: riskPercent + '%'
        });
        
        // Start monitoring this account
        setTimeout(() => this.monitorAccountRisk(accountId), 5000);
      } else {
        logger.error(`❌ ATOMIC TRADE FAILED:`, result.message);
      }

      return { ...result, positionSize };

    } catch (error: any) {
      logger.error('❌ CRITICAL: Enhanced trade execution error:', {
        message: error.message,
        stack: error.stack,
        accountId: request.accountId,
        symbol: request.signal?.symbol
      });
      
      return {
        success: false,
        message: `Execution failed: ${error.message || 'Unknown error'}`
      };
    } finally {
      // 🧹 CLEANUP: Ensure connection is properly closed if needed
      if (connection) {
        try {
          // Note: MetaAPI connections are typically kept alive, but log the cleanup
          logger.info(`🧹 Connection cleanup completed for account ${request.accountId}`);
        } catch (cleanupError) {
          logger.warn(`⚠️ Connection cleanup warning:`, cleanupError);
        }
      }
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
      // Get account info with rate limiting
      const accountInfo = await this.rateLimiter.executeWithRateLimit(
        'getAccountInformation',
        () => connection.getAccountInformation()
      ) as any;
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

      // Check position count with rate limiting
      const positions = await this.rateLimiter.executeWithRateLimit(
        'getPositions',
        () => connection.getPositions()
      ) as any[];
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
   * Calculate optimal position size based on $900 fixed risk per trade
   */
  private async calculatePositionSize(
    connection: any, 
    signal: TradeSignal, 
    riskPercent: number
  ): Promise<number> {
    
    try {
      // FIXED RISK: Always risk $900 per trade
      const FIXED_RISK_AMOUNT = 900; // $900 per trade
      
      // Get account information
      const accountInfo = connection.terminalState.accountInformation;
      const balance = accountInfo?.balance || 197181.33; // Use your current balance as fallback
      
      // Calculate entry price and stop loss distance
      const entryPrice = signal.entryPrice || 0;
      const stopLoss = signal.stopLoss || 0;
      
      if (!entryPrice || !stopLoss || entryPrice === stopLoss) {
        logger.warn('⚠️ Invalid entry price or stop loss, using fallback lot size');
        return 0.45;
      }
      
      const stopLossDistance = Math.abs(entryPrice - stopLoss);
      
      // Get symbol specifications for pip value calculation
      const symbolSpec = await connection.getSymbolSpecification(signal.symbol);
      const minVolume = symbolSpec?.minVolume || 0.01;
      const maxVolume = symbolSpec?.maxVolume || 10;
      
      // Calculate pip value based on symbol type
      let pipValue = 10; // Default for most forex pairs (USD account)
      const upperSymbol = signal.symbol.toUpperCase();
      
      if (upperSymbol.includes('JPY')) {
        pipValue = 100000 * 0.01 / entryPrice; // JPY pairs
      } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
        pipValue = 1; // $1 per point for gold
      } else if (this.isForexPair(upperSymbol)) {
        pipValue = 10; // Standard forex pairs: $10 per pip for 1 lot
      }
      
      // Calculate lot size to risk exactly $900
      // Formula: Risk Amount / (Stop Loss Distance * Pip Value) = Lot Size
      let calculatedLotSize = FIXED_RISK_AMOUNT / (stopLossDistance * pipValue);
      
      // Apply broker limits
      calculatedLotSize = Math.max(minVolume, calculatedLotSize);
      calculatedLotSize = Math.min(maxVolume, calculatedLotSize);
      
      // Round to valid lot size (0.01 increments)
      calculatedLotSize = Math.round(calculatedLotSize * 100) / 100;
      
      logger.info(`💰 $900 Risk-Based Position Sizing for ${signal.symbol}:`);
      logger.info(`   Entry Price: ${entryPrice}`);
      logger.info(`   Stop Loss: ${stopLoss}`);
      logger.info(`   SL Distance: ${stopLossDistance.toFixed(5)}`);
      logger.info(`   Pip Value: $${pipValue}/lot`);
      logger.info(`   Target Risk: $${FIXED_RISK_AMOUNT}`);
      logger.info(`   Calculated Lot Size: ${calculatedLotSize}`);
      
      const actualRisk = calculatedLotSize * stopLossDistance * pipValue;
      logger.info(`   Actual Risk: $${actualRisk.toFixed(2)}`);
      
      return calculatedLotSize;
      
    } catch (error) {
      logger.error('Position size calculation error:', error);
      return 0.01;
    }
  }

  /**
   * Helper method to identify forex pairs
   */
  private isForexPair(symbol: string): boolean {
    return symbol.length === 6 && /^[A-Z]{6}$/.test(symbol);
  }

  /**
   * Convert symbol for broker using MetaAPI's official approach
   */
  private async convertSymbolForBroker(signal: TradeSignal, connection: any): Promise<TradeSignal> {
    try {
      // Validate input signal first
      if (!signal || !signal.symbol) {
        logger.error('❌ Invalid signal passed to convertSymbolForBroker:', signal);
        throw new Error('Invalid signal object');
      }
      
      logger.info('🔄 Converting symbol for broker:', signal.symbol);
      
      // Get available symbols from broker (reuse existing connection)
      const availableSymbols = await connection.getSymbols();
      
      // First, try the symbol as-is
      if (availableSymbols.includes(signal.symbol)) {
        return signal;
      }
      
      // Try with .x suffix for InstantFunding-style brokers
      const symbolWithSuffix = signal.symbol + '.x';
      if (availableSymbols.includes(symbolWithSuffix)) {
        logger.info(`🔄 Converting ${signal.symbol} → ${symbolWithSuffix} (found in broker symbols)`);
        
        return {
          ...signal,
          symbol: symbolWithSuffix
        };
      }
      
      // Try common variations
      const variations = [
        signal.symbol + '.m',    // Some brokers use .m
        signal.symbol + '_',     // Some use underscore
        signal.symbol.replace('USD', ''),  // Some remove USD
      ];
      
      for (const variation of variations) {
        if (availableSymbols.includes(variation)) {
          logger.info(`🔄 Converting ${signal.symbol} → ${variation} (found in broker symbols)`);
          return { ...signal, symbol: variation };
        }
      }
      
      // If no conversion found, warn but use original
      logger.warn(`⚠️ Symbol ${signal.symbol} not found in broker symbols. Available: ${availableSymbols.slice(0, 10).join(', ')}...`);
      return signal;
      
    } catch (error) {
      logger.warn('Symbol lookup failed, using original:', error);
      
      // Ensure we return the original signal safely
      if (!signal) {
        throw new Error('Signal object is null - cannot proceed with trade');
      }
      
      logger.info('🔄 Returning original signal (fallback):', {
        symbol: signal.symbol,
        action: signal.action,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss
      });
      
      return { ...signal }; // Return a copy to prevent mutations
    }
  }



  /**
   * Calculate 1:1 risk-reward take profit
   */
  private calculate1To1TakeProfit(signal: TradeSignal): number {
    // Use entryPrice if available, otherwise use middle of entryZone
    let entryPrice = signal.entryPrice;
    if (!entryPrice && signal.entryZone) {
      entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    }
    
    const stopLoss = signal.stopLoss;
    
    if (!entryPrice || !stopLoss || stopLoss === 0) {
      logger.warn('Missing entry price or stop loss for 1:1 calculation');
      // Return first target if available, otherwise use entry price
      return signal.targets?.[0] || entryPrice || 0;
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
        
        // Log the trade parameters before execution
        logger.info(`🎯 Trade parameters for MetaAPI (Attempt ${attempt}):`, {
          symbol: signal.symbol,
          action: signal.action.toLowerCase(),
          positionSize: positionSize,
          stopLoss: signal.stopLoss,
          takeProfit: takeProfit,
          slippage: maxSlippage
        });
        
        // Calculate entry price for limit orders
        let entryPrice: number;
        if (signal.entryPrice) {
          entryPrice = signal.entryPrice;
        } else if (signal.entryZone) {
          // Use the middle of the entry zone
          entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
        } else {
          // Get current price and adjust for limit order
          const currentPrice = await connection.getSymbolPrice(signal.symbol);
          if (signal.action.toLowerCase() === 'buy') {
            // For BUY LIMIT: set entry price slightly below current ask
            entryPrice = currentPrice.ask - 1; // $1 below current price
          } else {
            // For SELL LIMIT: set entry price slightly above current bid
            entryPrice = currentPrice.bid + 1; // $1 above current price
          }
        }

        // Execute using LIMIT orders instead of MARKET orders
        let result;
        const orderOptions = {
          comment: `Enhanced-Signal-${Date.now()}`
          // Note: slippage is not used for limit orders
        };
        
        logger.info(`📋 Creating ${signal.action} LIMIT order at $${entryPrice}`);
        
        if (signal.action.toLowerCase() === 'buy') {
          result = await connection.createLimitBuyOrder(
            signal.symbol,
            positionSize,
            entryPrice,      // Entry price for limit order
            signal.stopLoss,
            takeProfit,
            orderOptions
          );
        } else if (signal.action.toLowerCase() === 'sell') {
          result = await connection.createLimitSellOrder(
            signal.symbol,
            positionSize,
            entryPrice,      // Entry price for limit order
            signal.stopLoss,
            takeProfit,
            orderOptions
          );
        } else {
          throw new Error(`Invalid trade action: ${signal.action}. Must be BUY or SELL`);
        }

        logger.info(`✅ Limit order execution result:`, result);

        // For limit orders, we get an orderId (pending order) rather than positionId
        if (result?.orderId || result?.positionId) {
          return {
            success: true,
            ticket: result.orderId || result.positionId,
            message: `${signal.action} LIMIT order placed successfully at $${entryPrice}`,
            executionPrice: entryPrice // The limit price we set
          };
        }

        throw new Error(`Limit order failed: ${result?.description || 'No order ID returned'}`);

      } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        logger.warn(`❌ Trade attempt ${attempt}/${maxRetries} failed:`, errorMessage);
        
        if (attempt === maxRetries) {
          return {
            success: false,
            message: `Trade failed after ${maxRetries} attempts: ${errorMessage}`
          };
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return { 
      success: false, 
      message: 'Max retries exceeded - trade execution failed' 
    };
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
   * Calculate stop loss distance in pips (for reference only)
   */
  private calculateStopLossPips(signal: TradeSignal): number {
    if (!signal.entryZone?.min || !signal.stopLoss) {
      return 20; // Default 20 pips
    }

    const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    
    // Different pip values for different instruments
    let pipValue: number;
    if (signal.symbol.includes('XAU') || signal.symbol.toLowerCase().includes('gold')) {
      pipValue = 0.01; // Gold: $0.01 per pip
    } else if (signal.symbol.includes('JPY')) {
      pipValue = 0.01; // JPY pairs: 0.01
    } else {
      pipValue = 0.0001; // Standard forex: 0.0001
    }
    
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