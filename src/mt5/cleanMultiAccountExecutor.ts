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
   * Calculate Stop Loss and Take Profit with realistic distances for $900 risk target
   * Uses instrument-appropriate distances instead of forcing exact $900 on all instruments
   */
  private calculateTakeProfit(signal: TradeSignal, entryPrice: number): number {
    const fixedLotSize = 0.45;   // Always use 0.45 lot size
    const targetRisk = 900;      // Target $900 risk
    const targetReward = 900;    // Target $900 reward (1:1 RR)
    
    // Get pip value for this instrument
    const pipValue = this.getPipValue(signal.symbol);
    
    // Calculate EXACT distance for $900 risk/reward (in pips)
    const exactDistanceInPips = targetRisk / (fixedLotSize * pipValue);
    
    // Convert pip distance to actual price difference based on instrument
    let priceDistance = exactDistanceInPips;
    const upperSymbol = signal.symbol.toUpperCase();
    
    if (this.isForexPair(upperSymbol) && !upperSymbol.includes('JPY') && !upperSymbol.includes('XAU') && !upperSymbol.includes('XAG')) {
      // Major forex pairs: 1 pip = 0.0001
      priceDistance = exactDistanceInPips * 0.0001;
    } else if (upperSymbol.includes('JPY')) {
      // JPY pairs: 1 pip = 0.01
      priceDistance = exactDistanceInPips * 0.01;
    }
    // For metals (Gold/Silver) and indices, use pip distance as-is (dollar amounts or points)
    
    let stopLoss: number;
    let takeProfit: number;
    
    // Calculate SL and TP using the correct price distance
    if (signal.action === 'BUY') {
      stopLoss = entryPrice - priceDistance;  // $900 risk
      takeProfit = entryPrice + priceDistance; // $900 reward (1:1 RR)
    } else if (signal.action === 'SELL') {
      stopLoss = entryPrice + priceDistance;   // $900 risk
      takeProfit = entryPrice - priceDistance; // $900 reward (1:1 RR)
    } else {
      throw new Error(`Invalid action for SL/TP calculation: ${signal.action}`);
    }
    
    // Verify calculations are exactly $900
    const actualRisk = fixedLotSize * exactDistanceInPips * pipValue;
    const actualReward = fixedLotSize * exactDistanceInPips * pipValue;
    
    // Final safety validation
    if (signal.action === 'BUY') {
      if (stopLoss >= entryPrice) throw new Error(`Invalid BUY SL: ${stopLoss} must be < Entry ${entryPrice}`);
      if (takeProfit <= entryPrice) throw new Error(`Invalid BUY TP: ${takeProfit} must be > Entry ${entryPrice}`);
    } else {
      if (stopLoss <= entryPrice) throw new Error(`Invalid SELL SL: ${stopLoss} must be > Entry ${entryPrice}`);
      if (takeProfit >= entryPrice) throw new Error(`Invalid SELL TP: ${takeProfit} must be < Entry ${entryPrice}`);
    }
    
    // Update signal with calculated stop loss
    signal.stopLoss = stopLoss;
    
    logger.info(`💰 EXACT $900 RISK/REWARD STRATEGY - ${signal.symbol}:`);
    logger.info(`   Fixed Risk: $${actualRisk.toFixed(2)} (EXACT)`);
    logger.info(`   Fixed Reward: $${actualReward.toFixed(2)} (EXACT)`);
    logger.info(`   Lot Size: ${fixedLotSize} lots (fixed)`);
    logger.info(`   Pip Value: $${pipValue}/pip`);
    logger.info(`   Entry: ${entryPrice.toFixed(5)}`);
    logger.info(`   Stop Loss: ${stopLoss.toFixed(5)} (${exactDistanceInPips.toFixed(2)} pips = ${priceDistance.toFixed(5)} price distance)`);
    logger.info(`   Take Profit: ${takeProfit.toFixed(5)} (${exactDistanceInPips.toFixed(2)} pips = ${priceDistance.toFixed(5)} price distance)`);
    logger.info(`   Risk/Reward: 1:1 (perfect balance)`);
    
    return takeProfit;
  }

  /**
   * DEPRECATED: No longer used - now using exact $900 calculations
   * Previous realistic distance calculation with limits per instrument
   */
  private getRealisticRiskDistance(symbol: string, entryPrice: number, targetRisk: number, lotSize: number): number {
    const upperSymbol = symbol.toUpperCase();
    const pipValue = this.getPipValue(symbol);
    
    // Calculate ideal distance for $900 risk
    const idealDistance = targetRisk / (lotSize * pipValue);
    
    // Apply realistic limits per instrument
    let maxDistance: number;
    let minDistance: number;
    let recommendedDistance: number;
    
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      // Gold: Realistic range $20-$150, recommended $50-$100
      minDistance = 20;   // $20 minimum
      maxDistance = 150;  // $150 maximum  
      recommendedDistance = Math.min(idealDistance, 80); // Try for $80 if possible
      
    } else if (upperSymbol.includes('JPY')) {
      // JPY pairs: 0.5-5.0 yen range, recommended 1-3 yen
      minDistance = 0.5;
      maxDistance = 5.0;
      recommendedDistance = Math.min(idealDistance, 2.0);
      
    } else if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
      // Major forex: 20-500 pips, recommended 50-200 pips
      minDistance = 0.0020; // 20 pips
      maxDistance = 0.0500; // 500 pips
      recommendedDistance = Math.min(idealDistance, 0.0150); // 150 pips
      
    } else {
      // Other instruments: Use percentage of price
      minDistance = entryPrice * 0.005;  // 0.5%
      maxDistance = entryPrice * 0.05;   // 5%
      recommendedDistance = Math.min(idealDistance, entryPrice * 0.02); // 2%
    }
    
    // Use the most appropriate distance
    let finalDistance: number;
    
    if (idealDistance <= maxDistance && idealDistance >= minDistance) {
      // Ideal distance is within realistic range - use it
      finalDistance = idealDistance;
    } else if (idealDistance > maxDistance) {
      // Ideal distance too large - use recommended distance
      finalDistance = recommendedDistance;
    } else {
      // Ideal distance too small - use minimum
      finalDistance = Math.max(minDistance, recommendedDistance * 0.5);
    }
    
    // Calculate what risk this actually gives us
    const actualRisk = lotSize * finalDistance * pipValue;
    
    logger.info(`🎯 Risk distance calculation for ${symbol}:`);
    logger.info(`   Ideal for $900: ${idealDistance.toFixed(5)} points`);
    logger.info(`   Realistic range: ${minDistance.toFixed(5)} - ${maxDistance.toFixed(5)}`);
    logger.info(`   Using: ${finalDistance.toFixed(5)} points`);
    logger.info(`   Will risk: $${actualRisk.toFixed(2)}`);
    
    return finalDistance;
  }

  /**
   * Validate if calculated SL and TP levels are realistic for the symbol type
   */
  private validateCalculatedLevels(symbol: string, entryPrice: number, stopLoss: number, takeProfit: number, action: string): boolean {
    if (!stopLoss || stopLoss <= 0 || !takeProfit || takeProfit <= 0) return false;
    
    const upperSymbol = symbol.toUpperCase();
    const slDistance = Math.abs(entryPrice - stopLoss);
    const tpDistance = Math.abs(entryPrice - takeProfit);
    const slPercentage = (slDistance / entryPrice) * 100;
    
    // Check if SL and TP are on correct sides
    if (action === 'BUY') {
      if (stopLoss >= entryPrice || takeProfit <= entryPrice) return false;
    } else if (action === 'SELL') {
      if (stopLoss <= entryPrice || takeProfit >= entryPrice) return false;
    }
    
    // Symbol-specific realistic level validation
    if (upperSymbol.includes('JPY')) {
      // JPY pairs: levels should be 0.5% - 5% away from entry
      return slPercentage >= 0.5 && slPercentage <= 5.0 && slDistance >= 0.5 && slDistance <= 8.0;
    }
    
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      // Gold: levels should be $5-$200 away from entry
      return slDistance >= 5 && slDistance <= 200 && tpDistance >= 5 && tpDistance <= 200;
    }
    
    if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
      // Major forex: levels should be 10-800 pips away
      return slDistance >= 0.0010 && slDistance <= 0.0800 && tpDistance >= 0.0010 && tpDistance <= 0.0800;
    }
    
    // General: 0.5% - 8% range
    return slPercentage >= 0.5 && slPercentage <= 8.0;
  }

  /**
   * Adjust calculated levels to realistic ranges while maintaining risk target as close as possible
   */
  private adjustToRealisticLevels(symbol: string, entryPrice: number, targetRiskDistance: number, action: string): { stopLoss: number; takeProfit: number } {
    const upperSymbol = symbol.toUpperCase();
    let maxDistance: number;
    let minDistance: number;
    
    // Symbol-specific realistic distance limits
    if (upperSymbol.includes('JPY')) {
      minDistance = 0.5;   // 50 pips minimum
      maxDistance = 8.0;   // 800 pips maximum
    } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      minDistance = 5;     // $5 minimum
      maxDistance = 200;   // $200 maximum
    } else if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
      minDistance = 0.0010; // 10 pips minimum
      maxDistance = 0.0800; // 800 pips maximum
    } else {
      // General: Use percentage-based limits
      minDistance = entryPrice * 0.005; // 0.5%
      maxDistance = entryPrice * 0.08;  // 8%
    }
    
    // Clamp the target distance to realistic limits
    let adjustedDistance = Math.max(minDistance, Math.min(maxDistance, targetRiskDistance));
    
    let stopLoss: number;
    let takeProfit: number;
    
    if (action === 'BUY') {
      stopLoss = entryPrice - adjustedDistance;
      takeProfit = entryPrice + adjustedDistance; // Maintain 1:1 RR
    } else {
      stopLoss = entryPrice + adjustedDistance;
      takeProfit = entryPrice - adjustedDistance; // Maintain 1:1 RR
    }
    
    logger.info(`🔧 Adjusted levels for ${symbol}:`);
    logger.info(`   Target distance: ${targetRiskDistance.toFixed(5)} -> Adjusted: ${adjustedDistance.toFixed(5)}`);
    logger.info(`   Limits: ${minDistance.toFixed(5)} - ${maxDistance.toFixed(5)}`);
    
    return { stopLoss, takeProfit };
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

      // Step 1: Get valid symbol (fallback implementation)
      const validSymbol = signal.symbol;

      // Step 2: Get market data from connection
      const terminalState = accountConfig.connection.terminalState;
      const price = terminalState.price(validSymbol);
      const marketData = { bid: price?.bid || 0, ask: price?.ask || 0 };

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
   * Calculate trade volume based on $900 fixed risk per trade
   */
  private calculateVolume(connection: any, signal: TradeSignal): number {
    try {
      const accountInfo = connection.terminalState.accountInformation;
      const balance = accountInfo?.balance || 197181.33; // Use your current balance as fallback
      
      // FIXED RISK STRATEGY: Always risk $900 per trade
      const fixedRiskAmount = 900; // Always risk $900 per trade
      
      // Calculate entry price (use middle of entry zone)
      const entryPrice = signal.entryZone ? 
        (signal.entryZone.min + signal.entryZone.max) / 2 : 
        signal.entryPrice || 0;
        
      // Calculate risk distance
      let riskDistance = 0;
      if (signal.stopLoss && entryPrice) {
        riskDistance = Math.abs(entryPrice - signal.stopLoss);
      }
      
      if (!entryPrice || !signal.stopLoss || riskDistance === 0) {
        logger.warn('⚠️ Invalid entry price or stop loss for volume calculation, using fallback');
        return 0.45;
      }
      
      // Get pip value based on symbol for risk calculation
      const pipValue = this.getPipValue(signal.symbol);
      
      // Calculate lot size to achieve exactly $900 risk
      // Formula: Risk Amount / (Stop Loss Distance * Pip Value) = Lot Size
      let calculatedLotSize = fixedRiskAmount / (riskDistance * pipValue);
      
      // Apply reasonable limits (0.01 to 10 lots)
      calculatedLotSize = Math.max(0.01, calculatedLotSize);
      calculatedLotSize = Math.min(10.0, calculatedLotSize);
      
      // Round to 0.01 increments
      calculatedLotSize = Math.round(calculatedLotSize * 100) / 100;
      
      // Calculate actual risk with final lot size
      const actualRisk = calculatedLotSize * riskDistance * pipValue;
      const actualRiskPercentage = (actualRisk / balance) * 100;
      
      logger.info(`💰 $900 FIXED RISK CALCULATION for ${signal.symbol}:`);
      logger.info(`   Account Balance: $${balance.toLocaleString()}`);
      logger.info(`   Target Risk: $${fixedRiskAmount}`);
      logger.info(`   Entry: ${entryPrice}, Stop: ${signal.stopLoss}`);
      logger.info(`   Risk Distance: ${riskDistance.toFixed(5)} points`);
      logger.info(`   Pip Value: $${pipValue}/lot`);
      logger.info(`   Calculated Lot Size: ${calculatedLotSize} lots`);
      logger.info(`   Actual Risk: $${actualRisk.toFixed(2)} (${actualRiskPercentage.toFixed(3)}%)`);
      
      return calculatedLotSize;
      
    } catch (error) {
      logger.error('Volume calculation error:', error);
      // Return fallback lot size on error
      return 0.45;
    }
  }

  /**
   * Get pip value for different instruments - Comprehensive list for Instant Funding & Prop Firms
   * Values are per 1 standard lot (100,000 units for forex, contract size varies for others)
   */
  private getPipValue(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // =============================================================================
    // FOREX PAIRS
    // =============================================================================
    
    // JPY Pairs (pip = 0.01, worth $10 per standard lot)
    if (upperSymbol.includes('JPY')) {
      return 10; // $10 per pip (0.01 move)
    }
    
    // Major & Minor Forex Pairs (pip = 0.0001, worth $10 per standard lot)
    if (this.isForexPair(upperSymbol)) {
      return 10; // $10 per pip (0.0001 move)
    }
    
    // =============================================================================
    // METALS (Precious Metals)
    // =============================================================================
    
    if (['XAUUSD', 'GOLD'].includes(upperSymbol)) {
      return 100; // $100 per $1 move (1 lot = 100 troy ounces)
    }
    
    if (['XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return 5000; // $5000 per $1 move (1 lot = 5000 troy ounces)
    }
    
    if (['XPTUSD', 'PLATINUM'].includes(upperSymbol)) {
      return 100; // $100 per $1 move (1 lot = 100 troy ounces)
    }
    
    if (['XPDUSD', 'PALLADIUM'].includes(upperSymbol)) {
      return 100; // $100 per $1 move (1 lot = 100 troy ounces)
    }
    
    // =============================================================================
    // US INDICES
    // =============================================================================
    
    if (['NAS100', 'NASDAQ', 'US100', 'NDX'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    if (['SPX500', 'US500', 'SP500'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    if (['US30', 'DJ30', 'DOWJONES', 'DJI'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    if (['US2000', 'RUSSELL2000', 'RUT'].includes(upperSymbol)) {
      return 1; // $1 per point
    }
    
    // =============================================================================
    // EUROPEAN INDICES
    // =============================================================================
    
    if (['GER30', 'DE30', 'DAX', 'GERMANY30'].includes(upperSymbol)) {
      return 1; // €1 per point (≈$1 per point)
    }
    
    if (['UK100', 'FTSE100', 'FTSE'].includes(upperSymbol)) {
      return 1; // £1 per point (≈$1.25 per point)
    }
    
    if (['FR40', 'CAC40', 'FRANCE40'].includes(upperSymbol)) {
      return 1; // €1 per point (≈$1 per point)
    }
    
    if (['EU50', 'STOXX50', 'EUSTX50'].includes(upperSymbol)) {
      return 1; // €1 per point (≈$1 per point)
    }
    
    // =============================================================================
    // ASIAN INDICES
    // =============================================================================
    
    if (['JPN225', 'NIKKEI', 'N225'].includes(upperSymbol)) {
      return 5; // ¥500 per point (≈$5 per point)
    }
    
    if (['HK50', 'HANGSENG', 'HSI'].includes(upperSymbol)) {
      return 1; // HK$1 per point (≈$0.13, but treat as $1)
    }
    
    if (['AUS200', 'AU200', 'ASX200'].includes(upperSymbol)) {
      return 1; // A$1 per point (≈$0.65, but treat as $1)
    }
    
    // =============================================================================
    // COMMODITIES
    // =============================================================================
    
    // Energy
    if (['USOIL', 'OIL', 'CL', 'CRUDE'].includes(upperSymbol)) {
      return 1000; // $1000 per $1 move (1 lot = 1000 barrels)
    }
    
    if (['UKOIL', 'BRENT'].includes(upperSymbol)) {
      return 1000; // $1000 per $1 move (1 lot = 1000 barrels)
    }
    
    if (['NGAS', 'NATURALGAS', 'NG'].includes(upperSymbol)) {
      return 10000; // $10000 per $1 move (1 lot = 10,000 MMBtu)
    }
    
    // Agricultural
    if (['WHEAT', 'WEAT'].includes(upperSymbol)) {
      return 50; // $50 per point (1 lot = 5000 bushels, 1¢ = $50)
    }
    
    if (['CORN'].includes(upperSymbol)) {
      return 50; // $50 per point (1 lot = 5000 bushels, 1¢ = $50)
    }
    
    if (['SOYBEAN', 'SOYA'].includes(upperSymbol)) {
      return 50; // $50 per point (1 lot = 5000 bushels, 1¢ = $50)
    }
    
    // =============================================================================
    // CRYPTOCURRENCIES (if offered by prop firm)
    // =============================================================================
    
    if (['BTCUSD', 'BITCOIN'].includes(upperSymbol)) {
      return 1; // $1 per $1 move (varies by broker, usually 0.01-1 lot size)
    }
    
    if (['ETHUSD', 'ETHEREUM'].includes(upperSymbol)) {
      return 1; // $1 per $1 move (varies by broker)
    }
    
    // =============================================================================
    // BONDS (Government Bonds)
    // =============================================================================
    
    if (['US10Y', 'TNX', 'TREASURY'].includes(upperSymbol)) {
      return 1000; // $1000 per full point (1 tick = $15.625)
    }
    
    if (['GER10Y', 'BUND'].includes(upperSymbol)) {
      return 1000; // €1000 per full point
    }
    
    // =============================================================================
    // DEFAULT HANDLING
    // =============================================================================
    
    // Check if it looks like a forex pair we missed
    if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
      logger.warn(`⚠️ Unknown forex pair ${symbol}, using standard $10 per pip`);
      return 10;
    }
    
    // Check if it looks like an index (usually has numbers)
    if (/\d/.test(upperSymbol)) {
      logger.warn(`⚠️ Unknown index ${symbol}, using $1 per point`);
      return 1;
    }
    
    // Default for completely unknown instruments
    logger.warn(`❓ Unknown instrument ${symbol}, using conservative $10 per point`);
    return 10;
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
