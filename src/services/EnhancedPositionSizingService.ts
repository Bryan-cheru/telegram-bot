/**
 * Enhanced Position Sizing Service
 * Accurate position sizing calculations with proper symbol specifications
 */

import { logger } from '../utils/logger';
import { MetaApiRateLimiter } from './MetaApiRateLimiter';
import { config } from '../utils/config';

interface SymbolSpecification {
  symbol: string;
  tickSize: number;
  tickValue: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  contractSize: number;
  digits: number;
  currencyBase: string;
  currencyProfit: string;
}

interface PositionSizeCalculation {
  lotSize: number;
  riskAmount: number;
  stopLossDistance: number;
  stopLossDistancePips: number;
  tickValue: number;
  calculationMethod: string;
  warnings: string[];
}

export class EnhancedPositionSizingService {
  private rateLimiter: MetaApiRateLimiter;
  private symbolSpecCache: Map<string, SymbolSpecification>;
  private cacheExpiry: Map<string, number>;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.rateLimiter = new MetaApiRateLimiter();
    this.symbolSpecCache = new Map();
    this.cacheExpiry = new Map();
  }

  /**
   * Calculate position size with FIXED LOT SIZE of 0.45 for all symbols
   */
  async calculatePositionSize(
    connection: any,
    symbol: string,
    entryPrice: number,
    stopLoss: number,
    accountCurrency: string = 'USD',
    riskAmount: number = 900
  ): Promise<PositionSizeCalculation> {
    
    const warnings: string[] = [];
    
    try {
      // SIMPLE FIXED STRATEGY: Use configured lot size for +$900/-$900 risk/reward
      const fixedLotSize = config.trading.fixedLotSize;
      
      logger.info(`💰 FIXED STRATEGY: Using ${fixedLotSize} lots for ${symbol} (target: +$900 TP / -$900 SL)`);
      
      // Get symbol specification for risk calculation only
      const symbolSpec = await this.getSymbolSpecification(connection, symbol);
      
      if (!symbolSpec) {
        warnings.push(`Could not retrieve symbol specification for ${symbol} - using 0.45 lots anyway`);
        return this.getFixedLotCalculation(fixedLotSize, entryPrice, stopLoss, symbol, riskAmount, warnings);
      }

      // Calculate stop loss distance in symbol units
      const stopLossDistance = Math.abs(entryPrice - stopLoss);
      
      if (stopLossDistance === 0) {
        warnings.push('Stop loss distance is zero - using 0.45 lots with estimated $900 risk');
        return this.getFixedLotCalculation(fixedLotSize, entryPrice, stopLoss, symbol, riskAmount, warnings);
      }

      // Calculate stop loss distance in ticks
      const stopLossDistanceTicks = stopLossDistance / symbolSpec.tickSize;
      
      // Calculate ACTUAL RISK with 0.45 lots
      const actualRisk = fixedLotSize * stopLossDistanceTicks * symbolSpec.tickValue;
      
      // Apply broker constraints to 0.45 lots
      const constrainedLotSize = Math.max(symbolSpec.minVolume, Math.min(symbolSpec.maxVolume, fixedLotSize));
      const finalLotSize = this.roundToVolumeStep(constrainedLotSize, symbolSpec.volumeStep);
      
      // Recalculate actual risk with constrained lot size
      const finalActualRisk = finalLotSize * stopLossDistanceTicks * symbolSpec.tickValue;
      
      // Calculate pips (for display purposes)
      const stopLossDistancePips = this.calculatePips(symbol, stopLossDistance);

      logger.info(`🎯 SIMPLE FIXED STRATEGY for ${symbol}:`);
      logger.info(`   Entry: ${entryPrice.toFixed(symbolSpec.digits)}, Stop: ${stopLoss.toFixed(symbolSpec.digits)}`);
      logger.info(`   Distance: ${stopLossDistance.toFixed(symbolSpec.digits)} (${stopLossDistancePips} pips)`);
      logger.info(`   FIXED LOT SIZE: ${fixedLotSize} lots (always)`);
      logger.info(`   Target: +$900 TP / -$900 SL`);

      return {
        lotSize: fixedLotSize, // Use configured lot size
        riskAmount: 900, // Always target $900
        stopLossDistance,
        stopLossDistancePips,
        tickValue: symbolSpec.tickValue,
        calculationMethod: 'fixed-0.45-lots',
        warnings
      };

    } catch (error) {
      logger.error('Fixed lot size calculation error:', error);
      warnings.push(`Calculation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Always use configured lot size even on error
      logger.warn(`🔄 Using ${config.trading.fixedLotSize} lots for ${symbol} (fallback)`);

      return this.getFixedLotCalculation(config.trading.fixedLotSize, entryPrice, stopLoss, symbol, 900, warnings);
    }
  }

  /**
   * Get symbol specification with caching
   */
  private async getSymbolSpecification(connection: any, symbol: string): Promise<SymbolSpecification | null> {
    // Check cache first
    const cached = this.symbolSpecCache.get(symbol);
    const expiry = this.cacheExpiry.get(symbol);
    
    if (cached && expiry && Date.now() < expiry) {
      logger.debug(`Using cached specification for ${symbol}`);
      return cached;
    }

    try {
      // Fetch from MetaAPI with rate limiting
      const spec = await this.rateLimiter.executeWithRateLimit(
        'getSymbolSpecification',
        () => connection.getSymbolSpecification(symbol)
      ) as any;

      if (!spec) {
        logger.warn(`No specification returned for ${symbol}`);
        return null;
      }

      const symbolSpec: SymbolSpecification = {
        symbol: spec.symbol || symbol,
        tickSize: spec.tickSize || 0.00001,
        tickValue: spec.tickValue || 1,
        minVolume: spec.minVolume || 0.01,
        maxVolume: spec.maxVolume || 100,
        volumeStep: spec.volumeStep || 0.01,
        contractSize: spec.contractSize || 100000,
        digits: spec.digits || 5,
        currencyBase: spec.currencyBase || 'USD',
        currencyProfit: spec.currencyProfit || 'USD'
      };

      // Cache the result
      this.symbolSpecCache.set(symbol, symbolSpec);
      this.cacheExpiry.set(symbol, Date.now() + this.CACHE_DURATION);

      logger.debug(`Cached specification for ${symbol}:`, symbolSpec);
      return symbolSpec;

    } catch (error) {
      logger.error(`Failed to get specification for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate pips for display purposes
   */
  private calculatePips(symbol: string, distance: number): number {
    const upperSymbol = symbol.toUpperCase();
    
    if (upperSymbol.includes('JPY')) {
      // JPY pairs: 1 pip = 0.01
      return distance / 0.01;
    } else if (upperSymbol.includes('XAU') || upperSymbol.includes('GOLD')) {
      // Gold: 1 pip = 0.01
      return distance / 0.01;
    } else if (upperSymbol.includes('XAG') || upperSymbol.includes('SILVER')) {
      // Silver: 1 pip = 0.001
      return distance / 0.001;
    } else {
      // Standard forex: 1 pip = 0.0001
      return distance / 0.0001;
    }
  }

  /**
   * Round lot size to valid volume step
   */
  private roundToVolumeStep(lotSize: number, volumeStep: number): number {
    if (volumeStep <= 0) return lotSize;
    
    const steps = Math.round(lotSize / volumeStep);
    return Math.max(steps * volumeStep, volumeStep); // Ensure at least one step
  }

  /**
   * Fallback calculation when symbol spec is unavailable
   */
  private getFallbackCalculation(riskAmount: number, warnings: string[]): PositionSizeCalculation {
    const fallbackLotSize = 0.01; // Minimum safe lot size
    
    warnings.push('Using fallback calculation with minimum lot size');
    
    return {
      lotSize: fallbackLotSize,
      riskAmount: riskAmount,
      stopLossDistance: 0,
      stopLossDistancePips: 0,
      tickValue: 10, // Assumed for forex
      calculationMethod: 'fallback-minimum',
      warnings
    };
  }

  /**
   * Fixed lot calculation when symbol spec is unavailable - always use 0.45 lots
   */
  private getFixedLotCalculation(
    fixedLotSize: number,
    entryPrice: number,
    stopLoss: number,
    symbol: string,
    riskAmount: number,
    warnings: string[]
  ): PositionSizeCalculation {
    
    // SIMPLE: Use configured lot size from environment
    const actualLotSize = config.trading.fixedLotSize;
    
    // Calculate basic stop loss distance
    const stopLossDistance = Math.abs(entryPrice - stopLoss);
    const stopLossDistancePips = this.calculatePips(symbol, stopLossDistance);
    
    warnings.push(`Using fixed ${actualLotSize} lot size with $900 target risk/reward`);
    
    logger.info(`🎯 SIMPLE FALLBACK for ${symbol}:`);
    logger.info(`   Entry: ${entryPrice}, Stop: ${stopLoss}`);
    logger.info(`   Distance: ${stopLossDistance} (${stopLossDistancePips} pips)`);
    logger.info(`   FIXED LOT SIZE: 0.45 lots (always)`);
    logger.info(`   Target: +$900 TP / -$900 SL`);
    
    return {
      lotSize: actualLotSize,
      riskAmount: 900, // Always target $900
      stopLossDistance,
      stopLossDistancePips,
      tickValue: 10, // Estimated
      calculationMethod: 'simple-fixed-0.45',
      warnings
    };
  }

  /**
   * Validate position size against account balance
   */
  async validatePositionSize(
    connection: any,
    symbol: string,
    lotSize: number,
    accountBalance: number,
    maxRiskPercent: number = 2.0
  ): Promise<{
    isValid: boolean;
    marginRequired: number;
    marginLevel: number;
    warnings: string[];
  }> {
    
    const warnings: string[] = [];
    
    try {
      // Calculate margin requirement
      const marginRequired = await this.calculateMarginRequirement(connection, symbol, lotSize);
      
      // Check against account balance
      const marginLevel = (accountBalance / marginRequired) * 100;
      const riskPercent = (marginRequired / accountBalance) * 100;
      
      let isValid = true;
      
      if (marginRequired > accountBalance * 0.8) { // 80% of balance
        isValid = false;
        warnings.push(`Margin requirement (${marginRequired.toFixed(2)}) exceeds safe limit`);
      }
      
      if (riskPercent > maxRiskPercent) {
        isValid = false;
        warnings.push(`Position risk (${riskPercent.toFixed(2)}%) exceeds maximum (${maxRiskPercent}%)`);
      }
      
      if (marginLevel < 200) {
        warnings.push(`Low margin level (${marginLevel.toFixed(0)}%)`);
      }

      return {
        isValid,
        marginRequired,
        marginLevel,
        warnings
      };

    } catch (error) {
      logger.error('Position validation error:', error);
      return {
        isValid: false,
        marginRequired: 0,
        marginLevel: 0,
        warnings: ['Validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')]
      };
    }
  }

  /**
   * Calculate margin requirement for a position
   */
  private async calculateMarginRequirement(connection: any, symbol: string, lotSize: number): Promise<number> {
    try {
      // Try using MetaAPI's calculate margin endpoint if available
      if (connection.calculateMargin) {
        const margin = await this.rateLimiter.executeWithRateLimit(
          'calculateMargin',
          () => connection.calculateMargin({
            symbol: symbol,
            type: 'ORDER_TYPE_BUY',
            volume: lotSize
          })
        ) as any;
        
        return margin?.margin || 0;
      }
      
      // Fallback: estimate based on symbol specification
      const symbolSpec = await this.getSymbolSpecification(connection, symbol);
      if (symbolSpec) {
        // Rough estimate: Contract size * lot size / leverage (assume 100:1)
        return (symbolSpec.contractSize * lotSize) / 100;
      }
      
      return 0;

    } catch (error) {
      logger.warn('Could not calculate margin requirement:', error);
      return 0;
    }
  }

  /**
   * Get position sizing recommendations for different risk levels
   */
  async getPositionSizingRecommendations(
    connection: any,
    symbol: string,
    entryPrice: number,
    stopLoss: number,
    accountBalance: number
  ): Promise<{
    conservative: PositionSizeCalculation;
    moderate: PositionSizeCalculation;
    aggressive: PositionSizeCalculation;
  }> {
    
    const conservative = await this.calculatePositionSize(connection, symbol, entryPrice, stopLoss, 'USD', accountBalance * 0.005); // 0.5%
    const moderate = await this.calculatePositionSize(connection, symbol, entryPrice, stopLoss, 'USD', accountBalance * 0.01);    // 1%
    const aggressive = await this.calculatePositionSize(connection, symbol, entryPrice, stopLoss, 'USD', accountBalance * 0.02);   // 2%

    return {
      conservative,
      moderate,
      aggressive
    };
  }

  /**
   * Clear symbol specification cache
   */
  clearCache(): void {
    this.symbolSpecCache.clear();
    this.cacheExpiry.clear();
    logger.info('Symbol specification cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedSymbols: number;
    cacheSize: number;
    oldestEntry: Date | null;
  } {
    let oldestTime = Number.MAX_VALUE;
    
    this.cacheExpiry.forEach((expiry) => {
      const entryTime = expiry - this.CACHE_DURATION;
      if (entryTime < oldestTime) {
        oldestTime = entryTime;
      }
    });

    return {
      cachedSymbols: this.symbolSpecCache.size,
      cacheSize: JSON.stringify([...this.symbolSpecCache.entries()]).length,
      oldestEntry: oldestTime !== Number.MAX_VALUE ? new Date(oldestTime) : null
    };
  }
}