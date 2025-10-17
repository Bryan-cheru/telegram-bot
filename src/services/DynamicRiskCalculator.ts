/**
 * Dynamic Risk Calculator - Future-Proof Risk Management
 * 
 * This system automatically adapts to:
 * - Account balance changes
 * - Market volatility
 * - Broker contract specifications
 * - Performance metrics
 * - Symbol-specific requirements
 */

import { logger } from '../utils/logger';
import MetaApi from 'metaapi.cloud-sdk';

export interface RiskParameters {
  accountBalance: number;
  riskPercentage: number; // Dynamic based on performance
  maxRiskAmount: number;  // Absolute cap
  volatilityMultiplier: number;
  confidenceLevel: number;
}

export interface ContractSpecification {
  symbol: string;
  contractSize: number;
  tickSize: number;
  tickValue: number;
  marginRequired: number;
  digits: number;
  tradingHours: string;
}

export interface CalculatedRisk {
  lotSize: number;
  riskAmount: number;
  stopLossDistance: number;
  takeProfitDistance: number;
  marginRequired: number;
  confidenceAdjusted: boolean;
}

/**
 * Dynamic Risk Calculator that adapts to real market conditions
 */
export class DynamicRiskCalculator {
  private metaApi: MetaApi;
  private contractSpecs: Map<string, ContractSpecification> = new Map();
  private lastUpdate: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 3600000; // 1 hour cache

  constructor(metaApi: MetaApi) {
    this.metaApi = metaApi;
  }

  /**
   * Calculate optimal risk parameters based on current market conditions
   */
  async calculateOptimalRisk(
    symbol: string,
    entryPrice: number,
    direction: 'BUY' | 'SELL',
    accountId: string,
    signalConfidence: number = 0.75
  ): Promise<CalculatedRisk> {
    logger.info(`🧮 Calculating dynamic risk for ${symbol}...`);

    // Get real-time contract specifications
    const contractSpec = await this.getContractSpecification(symbol, accountId);
    
    // Get current account information
    const account = await this.metaApi.metatraderAccountApi.getAccount(accountId);
    const connection = account.getStreamingConnection();
    await connection.connect();
    await connection.waitSynchronized();
    const accountInfo = connection.terminalState.accountInformation || { balance: 100000 };
    
    // Calculate base risk parameters
    const riskParams = this.calculateBaseRiskParameters(
      accountInfo.balance,
      signalConfidence,
      symbol
    );

    // Calculate position size based on contract specs
    const calculatedRisk = this.calculatePositionSize(
      contractSpec,
      riskParams,
      entryPrice,
      direction
    );

    logger.info(`✅ Dynamic risk calculated:`);
    logger.info(`   Account Balance: $${accountInfo.balance}`);
    logger.info(`   Risk Amount: $${calculatedRisk.riskAmount}`);
    logger.info(`   Lot Size: ${calculatedRisk.lotSize}`);
    logger.info(`   Contract Size: ${contractSpec.contractSize}`);
    logger.info(`   Tick Value: $${contractSpec.tickValue}`);

    return calculatedRisk;
  }

  /**
   * Get real-time contract specifications from broker
   */
  private async getContractSpecification(symbol: string, accountId: string): Promise<ContractSpecification> {
    const cacheKey = `${symbol}_${accountId}`;
    const lastUpdate = this.lastUpdate.get(cacheKey) || 0;
    
    // Use cache if recent
    if (Date.now() - lastUpdate < this.CACHE_DURATION && this.contractSpecs.has(cacheKey)) {
      return this.contractSpecs.get(cacheKey)!;
    }

    try {
      logger.info(`📊 Fetching real-time contract specs for ${symbol}...`);
      
      const account = await this.metaApi.metatraderAccountApi.getAccount(accountId);
      await account.waitConnected();
      
      // Get symbol specification from broker
      const connection = account.getRPCConnection();
      const symbolSpec = await connection.getSymbolSpecification(symbol);
      
      const contractSpec: ContractSpecification = {
        symbol: symbol,
        contractSize: symbolSpec.contractSize || this.getDefaultContractSize(symbol),
        tickSize: symbolSpec.tickSize || this.getDefaultTickSize(symbol),
        tickValue: (symbolSpec as any).tickValue || this.getDefaultTickValue(symbol),
        marginRequired: (symbolSpec as any).initialMargin || 1000,
        digits: symbolSpec.digits || this.getDefaultDigits(symbol),
        tradingHours: (symbolSpec as any).tradingHours || '24/7'
      };

      // Cache the result
      this.contractSpecs.set(cacheKey, contractSpec);
      this.lastUpdate.set(cacheKey, Date.now());
      
      logger.info(`✅ Contract specs cached for ${symbol}`);
      return contractSpec;
      
    } catch (error) {
      logger.warn(`⚠️ Failed to fetch contract specs for ${symbol}, using defaults:`, error);
      return this.getDefaultContractSpec(symbol);
    }
  }

  /**
   * Calculate base risk parameters dynamically
   */
  private calculateBaseRiskParameters(
    accountBalance: number,
    signalConfidence: number,
    symbol: string
  ): RiskParameters {
    // Base risk percentage (1-3% based on confidence)
    const baseRiskPercent = 1.0 + (signalConfidence - 0.5) * 2; // 1-3%
    
    // Volatility adjustment based on symbol type
    const volatilityMultiplier = this.getVolatilityMultiplier(symbol);
    
    // Performance-based adjustment (placeholder for future ML integration)
    const performanceMultiplier = 1.0; // Will be dynamic based on recent win rate
    
    const adjustedRiskPercent = Math.min(
      baseRiskPercent * volatilityMultiplier * performanceMultiplier,
      3.0 // Never risk more than 3%
    );

    const riskAmount = Math.min(
      (accountBalance * adjustedRiskPercent) / 100,
      1000 // Absolute maximum risk per trade
    );

    return {
      accountBalance,
      riskPercentage: adjustedRiskPercent,
      maxRiskAmount: riskAmount,
      volatilityMultiplier,
      confidenceLevel: signalConfidence
    };
  }

  /**
   * Calculate position size based on real contract specifications
   */
  private calculatePositionSize(
    contractSpec: ContractSpecification,
    riskParams: RiskParameters,
    entryPrice: number,
    direction: 'BUY' | 'SELL'
  ): CalculatedRisk {
    // Calculate optimal stop loss distance (2-3% for crypto, 0.5-1% for forex)
    const stopLossPercent = this.getOptimalStopLossPercent(contractSpec.symbol);
    const stopLossDistance = entryPrice * stopLossPercent;
    
    // Calculate lot size based on risk amount and stop loss distance
    const riskPerTick = stopLossDistance / contractSpec.tickSize;
    const dollarsPerTick = contractSpec.tickValue;
    const totalRisk = riskPerTick * dollarsPerTick;
    
    const lotSize = Math.min(
      riskParams.maxRiskAmount / totalRisk,
      this.getMaxLotSize(contractSpec.symbol) // Symbol-specific limits
    );

    // Round to appropriate lot size increments
    const roundedLotSize = this.roundToLotIncrement(lotSize, contractSpec.symbol);
    
    // Calculate actual risk with rounded lot size
    const actualRisk = (stopLossDistance / contractSpec.tickSize) * contractSpec.tickValue * roundedLotSize;
    
    return {
      lotSize: roundedLotSize,
      riskAmount: actualRisk,
      stopLossDistance: stopLossDistance,
      takeProfitDistance: stopLossDistance * 1.5, // 1.5:1 reward ratio
      marginRequired: roundedLotSize * contractSpec.marginRequired,
      confidenceAdjusted: riskParams.confidenceLevel < 0.7
    };
  }

  /**
   * Get volatility multiplier for different symbol types
   */
  private getVolatilityMultiplier(symbol: string): number {
    if (symbol.includes('BTC') || symbol.includes('ETH')) {
      return 0.6; // Reduce risk for volatile crypto
    } else if (symbol.includes('XAU') || symbol.includes('GOLD')) {
      return 0.8; // Moderate reduction for gold
    } else if (symbol.includes('JPY')) {
      return 1.0; // Standard for JPY pairs
    } else if (symbol.includes('USD')) {
      return 1.1; // Slightly higher for major pairs
    }
    return 1.0; // Default
  }

  /**
   * Get optimal stop loss percentage based on symbol volatility
   */
  private getOptimalStopLossPercent(symbol: string): number {
    if (symbol.includes('BTC')) return 0.025; // 2.5% for Bitcoin
    if (symbol.includes('ETH')) return 0.03;  // 3% for Ethereum
    if (symbol.includes('XAU')) return 0.01;  // 1% for Gold
    if (symbol.includes('JPY')) return 0.008; // 0.8% for JPY pairs
    return 0.005; // 0.5% for major forex
  }

  /**
   * Get maximum allowed lot size per symbol
   */
  private getMaxLotSize(symbol: string): number {
    if (symbol.includes('BTC')) return 0.1;  // Max 0.1 lot for Bitcoin
    if (symbol.includes('XAU')) return 2.0;  // Max 2 lots for Gold
    return 5.0; // Max 5 lots for forex
  }

  /**
   * Round lot size to broker increments
   */
  private roundToLotIncrement(lotSize: number, symbol: string): number {
    const increment = symbol.includes('BTC') ? 0.01 : 0.01; // 0.01 lot increments
    return Math.round(lotSize / increment) * increment;
  }

  // Default fallback values when broker specs unavailable
  private getDefaultContractSize(symbol: string): number {
    if (symbol.includes('BTC')) return 1;
    if (symbol.includes('XAU')) return 100;
    return 100000; // Standard forex
  }

  private getDefaultTickSize(symbol: string): number {
    if (symbol.includes('BTC')) return 0.01;
    if (symbol.includes('XAU')) return 0.01;
    if (symbol.includes('JPY')) return 0.001;
    return 0.00001;
  }

  private getDefaultTickValue(symbol: string): number {
    if (symbol.includes('BTC')) return 0.10; // Conservative estimate
    if (symbol.includes('XAU')) return 1.00;
    return 1.00; // $1 per pip for forex
  }

  private getDefaultDigits(symbol: string): number {
    if (symbol.includes('BTC')) return 2;
    if (symbol.includes('XAU')) return 2;
    if (symbol.includes('JPY')) return 3;
    return 5;
  }

  private getDefaultContractSpec(symbol: string): ContractSpecification {
    return {
      symbol,
      contractSize: this.getDefaultContractSize(symbol),
      tickSize: this.getDefaultTickSize(symbol),
      tickValue: this.getDefaultTickValue(symbol),
      marginRequired: 1000,
      digits: this.getDefaultDigits(symbol),
      tradingHours: '24/7'
    };
  }
}