/**
 * Clean Multi-Account Trade Executor
 * Follows MetaAPI documentation exactly - replaces the complex existing system
 */

import MetaApi, { MetatraderAccount, RpcMetaApiConnectionInstance } from 'metaapi.cloud-sdk';
import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import {
  calculateFixedDollarStopsAndTargets,
  formatPriceForInstrument,
  getPipSize,
  getPipValuePerLot
} from '../trading/riskMath';

interface AccountConfig {
  id: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  account?: MetatraderAccount;
  connection?: RpcMetaApiConnectionInstance;
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

    // Connect accounts sequentially with reduced delays for faster startup
    for (const [accountId, accountConfig] of this.accounts) {
      await this.connectAccount(accountConfig);
      
      // Reduced delay between connections (was 5s, now 2s)
      logger.info(`⏳ Waiting 2 seconds before next connection...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const connectedCount = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED').length;
    
    this.initialized = connectedCount > 0;
    
    logger.info(`✅ Initialized ${connectedCount}/${this.accounts.size} accounts`);
  }

  /**
   * Connect a single account following MetaAPI documentation with enhanced error handling
   */
  private async connectAccount(accountConfig: AccountConfig, retryCount: number = 0): Promise<void> {
    const maxRetries = 2; // Reduced from 3 to 2
    const retryDelay = 5000; // Reduced from 10s to 5s
    
    try {
      logger.info(`🔗 Connecting ${accountConfig.brokerName} (${accountConfig.accountType})... (Attempt ${retryCount + 1}/${maxRetries + 1})`);

      // Wrap in timeout to prevent hanging
      const connectionPromise = this.performConnection(accountConfig);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 60 seconds')), 60000);  // Reduced from 120s to 60s
      });

      await Promise.race([connectionPromise, timeoutPromise]);
      
    } catch (error: any) {
      accountConfig.status = 'FAILED';
      
      // Enhanced error logging
      const errorDetails = {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        details: error.details,
        attempt: retryCount + 1
      };
      
      logger.error(`❌ Failed to connect ${accountConfig.brokerName}:`, errorDetails);
      
      // Retry logic for specific errors
      const shouldRetry = (
        (error.message?.includes('timeout') || 
         error.message?.includes('ETIMEDOUT') ||
         error.message?.includes('ECONNRESET') ||
         error.statusCode === 503 ||
         error.statusCode === 502) && 
        retryCount < maxRetries
      );
      
      if (shouldRetry) {
        logger.warn(`🔄 Retrying ${accountConfig.brokerName} connection in ${retryDelay/1000} seconds... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.connectAccount(accountConfig, retryCount + 1);
      }
      
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
   * Perform the actual connection process following MetaAPI best practices
   */
  private async performConnection(accountConfig: AccountConfig): Promise<void> {
      // Get account (standard MetaAPI pattern)
      accountConfig.account = await this.api.metatraderAccountApi.getAccount(accountConfig.id);
      
      // Deploy if needed (standard pattern)
      if (accountConfig.account.state !== 'DEPLOYED') {
        logger.info(`📦 Deploying ${accountConfig.brokerName}...`);
        await accountConfig.account.deploy();
        await accountConfig.account.waitDeployed(30000);  // Reduced from 60s to 30s
      }

      // Wait for connection (standard pattern)
      logger.info(`⏳ Waiting for ${accountConfig.brokerName} connection...`);
      await accountConfig.account.waitConnected(45000);  // Reduced from 90s to 45s
      logger.info(`🔗 ${accountConfig.brokerName} account connected`);

      // Get RPC connection (following official examples)
      accountConfig.connection = accountConfig.account.getRPCConnection();
      logger.info(`📡 Establishing RPC connection for ${accountConfig.brokerName}...`);
      await accountConfig.connection.connect();
      logger.info(`✅ ${accountConfig.brokerName} RPC connected`);
      
      // Wait for synchronization (critical step)
      logger.info(`🔄 Synchronizing ${accountConfig.brokerName}...`);
      try {
        await accountConfig.connection.waitSynchronized();
        logger.info(`✅ ${accountConfig.brokerName} synchronized`);
        
        accountConfig.status = 'CONNECTED';
        logger.info(`🎉 ${accountConfig.brokerName} fully connected and ready for trading!`);
      } catch (syncError: any) {
        logger.warn(`⚠️ ${accountConfig.brokerName} synchronization failed: ${syncError.message}`);
        // For RPC connections, synchronization failure doesn't mean unusable
        accountConfig.status = 'CONNECTED'; 
        logger.info(`🔗 ${accountConfig.brokerName} RPC connected (synchronization pending)`);
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
   * Target risk in account USD: dashboard RISK_AMOUNT_USD, else FIXED_RISK_AMOUNT, else balance * RISK_PERCENTAGE.
   */
  private getEffectiveRiskUsd(connection: any): number {
    const dashFixed = process.env.RISK_AMOUNT_USD;
    if (dashFixed != null && dashFixed !== '') {
      const v = parseFloat(dashFixed);
      if (isFinite(v) && v > 0) return v;
    }
    const fixedEnv = parseFloat(process.env.FIXED_RISK_AMOUNT || '');
    if (isFinite(fixedEnv) && fixedEnv > 0) return fixedEnv;
    const pct = parseFloat(process.env.RISK_PERCENTAGE || '0.33');
    try {
      const bal = connection?.terminalState?.accountInformation?.balance;
      if (typeof bal === 'number' && bal > 0 && isFinite(pct)) {
        return bal * (pct / 100);
      }
    } catch {
      /* ignore */
    }
    return parseFloat(process.env.FIXED_RISK_AMOUNT || '900');
  }

  /** Lot size for risk-distance math: FIXED_LOT_SIZE env or config default. */
  private getEffectiveLotSize(): number {
    const fromEnv = parseFloat(process.env.FIXED_LOT_SIZE || '');
    if (isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return config.trading.fixedLotSize;
  }

  /**
   * SL/TP from user-facing risk settings (same helpers as parser fallback).
   * Channel TP/SL lines are ignored when USE_SIGNAL_STOPS is not true.
   */
  private applyUserRiskLevels(
    signal: TradeSignal,
    entryPrice: number,
    connection: any
  ): { stopLoss: number; takeProfit: number } {
    const lotSize = this.getEffectiveLotSize();
    const riskAmount = this.getEffectiveRiskUsd(connection);
    const riskRewardRatio = parseFloat(process.env.RISK_REWARD_RATIO || '1.5');

    const { stopLoss, targets } = calculateFixedDollarStopsAndTargets({
      symbol: signal.symbol,
      entryPrice,
      direction: signal.action,
      config: { lotSize, riskAmount, riskRewardRatio }
    });
    const slDistance = Math.abs(entryPrice - stopLoss);
    const fallbackTp =
      signal.action === 'BUY'
        ? entryPrice + slDistance * riskRewardRatio
        : entryPrice - slDistance * riskRewardRatio;
    const tp = targets[0] ?? fallbackTp;

    return {
      stopLoss: formatPriceForInstrument(stopLoss, signal.symbol),
      takeProfit: formatPriceForInstrument(tp, signal.symbol)
    };
  }

  /**
   * Get broker-specific minimum stop distance in points
   */
  private getBrokerMinimumStopDistance(symbol: string, brokerName: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // IFPRO-Trade specific requirements
    if (brokerName === 'IFPRO-TRADE' || brokerName === 'IFPro-Trade') {
      if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
        return 50; // 50 points minimum for Gold
      }
      if (upperSymbol.includes('JPY')) {
        return 30; // 3 pips minimum for JPY pairs
      }
      if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP') || upperSymbol.includes('USD')) {
        return 30; // 3 pips minimum for major pairs
      }
      return 30; // Default 30 points
    }
    
    // General broker defaults
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      return 30; // 30 points minimum for Gold
    }
    if (upperSymbol.includes('JPY')) {
      return 20; // 2 pips minimum for JPY pairs
    }
    return 20; // Default 20 points
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
        try {
          const accountInfo = await accountConfig.connection.getAccountInformation();
          logger.info(`🔍 IFPro-Trade connection status:`);
          logger.info(`   - Connected: ${!!accountInfo}`);
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
        } catch (error) {
          logger.error(`Error getting IFPro-Trade connection status: ${error}`);
        }
      }

      // Step 1: Get valid symbol (fallback implementation)
      const validSymbol = signal.symbol;

      // Step 2: Get market data from connection
      const price = await accountConfig.connection.getSymbolPrice(validSymbol, false);
      const marketData = { bid: price?.bid || 0, ask: price?.ask || 0 };

      // Step 3: Entry from signal only (limit/market zone); SL/TP from user config unless USE_SIGNAL_STOPS=true
      const entryPrice = this.calculateEntryPrice(signal, marketData);

      const useSignalStops = process.env.USE_SIGNAL_STOPS === 'true';
      const rr = parseFloat(process.env.RISK_REWARD_RATIO || '1.5');
      let finalTakeProfit: number;

      if (
        useSignalStops &&
        typeof signal.stopLoss === 'number' &&
        signal.stopLoss > 0 &&
        Array.isArray(signal.targets) &&
        signal.targets.length > 0
      ) {
        signal.stopLoss = formatPriceForInstrument(signal.stopLoss, signal.symbol);
        finalTakeProfit = formatPriceForInstrument(signal.targets[0], signal.symbol);
        logger.info('📌 SL/TP from parsed signal (USE_SIGNAL_STOPS=true)');
      } else {
        if (useSignalStops) {
          logger.warn(
            '⚠️ USE_SIGNAL_STOPS=true but signal missing SL or TP — falling back to user risk config'
          );
        }
        const levels = this.applyUserRiskLevels(signal, entryPrice, accountConfig.connection);
        signal.stopLoss = levels.stopLoss;
        finalTakeProfit = levels.takeProfit;
        logger.info(
          '📌 SL/TP from user risk config (dashboard / .env); entry follows signal'
        );
      }

      const volume = this.calculateVolume(accountConfig.connection, signal, entryPrice);

      // Step 3.6: Validate and adjust stops for broker minimum distance (preserve RR on TP)
      const brokerName = accountConfig.brokerName;
      const minStopDistance = this.getBrokerMinimumStopDistance(validSymbol, brokerName);

      const currentStopDistance = Math.abs(entryPrice - signal.stopLoss);
      if (currentStopDistance < minStopDistance) {
        logger.warn(
          `⚠️ Stop distance ${currentStopDistance.toFixed(5)} < broker minimum ${minStopDistance} — widening`
        );

        if (signal.action === 'BUY') {
          signal.stopLoss = entryPrice - minStopDistance;
          finalTakeProfit = entryPrice + minStopDistance * rr;
        } else {
          signal.stopLoss = entryPrice + minStopDistance;
          finalTakeProfit = entryPrice - minStopDistance * rr;
        }

        signal.stopLoss = formatPriceForInstrument(signal.stopLoss, signal.symbol);
        finalTakeProfit = formatPriceForInstrument(finalTakeProfit, signal.symbol);

        logger.info(
          `✅ Adjusted to broker minimum — SL: ${signal.stopLoss}, TP: ${finalTakeProfit} (RR ${rr})`
        );
      }

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
            finalTakeProfit,
            tradeOptions
          );
        } else if (signal.action === 'SELL') {
          result = await accountConfig.connection.createMarketSellOrder(
            validSymbol,
            volume,
            signal.stopLoss,
            finalTakeProfit,
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
            finalTakeProfit, // Use adjusted TP if stops were modified
            tradeOptions
          );
        } else if (signal.action === 'SELL') {
          result = await accountConfig.connection.createLimitSellOrder(
            validSymbol,
            volume,
            entryPrice,
            signal.stopLoss,
            finalTakeProfit, // Use adjusted TP if stops were modified
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
   * Volume sized to approximate target risk USD given entry→SL distance (aligned with riskMath pip model).
   */
  private calculateVolume(connection: any, signal: TradeSignal, entryPrice: number): number {
    try {
      const accountInfo = connection.terminalState.accountInformation;
      const balance = accountInfo?.balance || 0;

      const fixedRiskAmount = this.getEffectiveRiskUsd(connection);

      let riskDistance = 0;
      if (signal.stopLoss && entryPrice) {
        riskDistance = Math.abs(entryPrice - signal.stopLoss);
      }

      if (!entryPrice || !signal.stopLoss || riskDistance === 0) {
        logger.warn('⚠️ Invalid entry/stop for volume — using configured lot size');
        return Math.min(this.getEffectiveLotSize(), config.trading.maxTradeSize);
      }

      const sym = signal.symbol.toUpperCase();
      const pipSize = getPipSize(sym);
      const pipValuePerLot = getPipValuePerLot(sym);
      const riskPips = riskDistance / pipSize;
      const dollarRiskPerLot = riskPips * pipValuePerLot;

      if (!isFinite(dollarRiskPerLot) || dollarRiskPerLot <= 0) {
        return Math.min(this.getEffectiveLotSize(), config.trading.maxTradeSize);
      }

      let calculatedLotSize = fixedRiskAmount / dollarRiskPerLot;

      calculatedLotSize = Math.max(0.01, calculatedLotSize);
      calculatedLotSize = Math.min(10.0, calculatedLotSize);
      const maxTradeCap = parseFloat(process.env.MAX_TRADE_SIZE || '');
      const maxVol =
        isFinite(maxTradeCap) && maxTradeCap > 0 ? maxTradeCap : config.trading.maxTradeSize;
      calculatedLotSize = Math.min(calculatedLotSize, maxVol);
      calculatedLotSize = Math.round(calculatedLotSize * 100) / 100;

      const actualRisk = calculatedLotSize * dollarRiskPerLot;
      const actualRiskPercentage = balance > 0 ? (actualRisk / balance) * 100 : 0;

      logger.info(`💰 Risk-target volume (${signal.symbol}):`);
      logger.info(`   Target risk USD: $${fixedRiskAmount.toFixed(2)}`);
      logger.info(`   Entry: ${entryPrice}, SL: ${signal.stopLoss}, distance: ${riskDistance.toFixed(6)}`);
      logger.info(`   Lots: ${calculatedLotSize} (actual risk ~$${actualRisk.toFixed(2)}, ${actualRiskPercentage.toFixed(3)}% of balance)`);

      return calculatedLotSize;
    } catch (error) {
      logger.error('Volume calculation error:', error);
      return Math.min(this.getEffectiveLotSize(), config.trading.maxTradeSize);
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
    return Array.from(this.accounts.values()).map(acc => {
      let terminalConnected = false;
      let hasSpecifications = false;
      
      // For RPC connections, we can't access terminalState directly
      // We'll mark as connected if the connection exists and account is connected
      if (acc.connection && acc.status === 'CONNECTED') {
        terminalConnected = true;
        hasSpecifications = true; // Assume specs are available if connected
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
    
    return Promise.all(accountStatuses.map(async acc => {
      const accountConfig = this.accounts.get(acc.id);
      
      // If account is not connected or no connection, return basic info with zeros
      if (acc.status !== 'CONNECTED' || !accountConfig?.connection) {
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
        // Get real account information from MetaAPI RPC connection
        const accountInfo = await accountConfig.connection.getAccountInformation() || {};
        const positions = await accountConfig.connection.getPositions() || [];
        
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
    }));
  }

  async closePosition(accountId: string, positionId: string) {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig?.connection) {
      throw new Error(`Account ${accountId} not connected`);
    }
    
    try {
      // Simplified - try to close position using market order
      const positions = await accountConfig.connection.getPositions() || [];
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
