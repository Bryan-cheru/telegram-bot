import { logger } from '../utils/logger';

export interface PositionSizingConfig {
  maxRiskPercentage?: number; // e.g., 2 = 2% of account
  maxPositionSize?: number;   // Maximum lot size regardless of account size
  minPositionSize?: number;   // Minimum lot size
  accountEquity?: number;    // If not provided, will fetch from MetaAPI
}

interface InternalConfig {
  maxRiskPercentage: number;
  maxPositionSize: number;
  minPositionSize: number;
  accountEquity?: number;
}

export interface PositionCalculation {
  lotSize: number;
  riskAmount: number;
  positionValue: number;
  riskPercentage: number;
  reasoning: string;
}

export class PositionSizeCalculator {
  private config: InternalConfig;

  constructor(config: PositionSizingConfig = {}) {
    this.config = {
      maxRiskPercentage: config.maxRiskPercentage ?? 2, // Default 2%
      maxPositionSize: config.maxPositionSize ?? 10,   // Default max 10 lots
      minPositionSize: config.minPositionSize ?? 0.01, // Default min 0.01 lots
      accountEquity: config.accountEquity
    };
  }

  /**
   * Calculate position size based on account equity and risk parameters
   */
  calculatePositionSize(
    accountEquity: number,
    entryPrice: number,
    stopLoss: number,
    symbol: string
  ): PositionCalculation {
    try {
      // Validate inputs
      if (accountEquity <= 0) {
        throw new Error('Account equity must be positive');
      }
      if (entryPrice <= 0 || stopLoss <= 0) {
        throw new Error('Entry price and stop loss must be positive');
      }
      if (Math.abs(entryPrice - stopLoss) < 0.0001) {
        throw new Error('Entry price and stop loss cannot be the same');
      }

      // Calculate risk per pip/point
      const riskDistance = Math.abs(entryPrice - stopLoss);
      const maxRiskAmount = accountEquity * (this.config.maxRiskPercentage / 100);
      
      // Get contract specifications for the symbol
      const contractSpecs = this.getContractSpecs(symbol);
      
      // Calculate base position size
      let lotSize = maxRiskAmount / (riskDistance * contractSpecs.pointValue);
      
      // Apply position size limits
      lotSize = Math.max(this.config.minPositionSize, lotSize);
      lotSize = Math.min(this.config.maxPositionSize, lotSize);
      
      // Round to valid lot size increment
      lotSize = this.roundToValidLotSize(lotSize, contractSpecs.lotSizeIncrement);
      
      // Calculate actual risk with final lot size
      const actualRiskAmount = lotSize * riskDistance * contractSpecs.pointValue;
      const actualRiskPercentage = (actualRiskAmount / accountEquity) * 100;
      
      const calculation: PositionCalculation = {
        lotSize,
        riskAmount: actualRiskAmount,
        positionValue: lotSize * entryPrice * contractSpecs.contractSize,
        riskPercentage: actualRiskPercentage,
        reasoning: this.generateReasoning(accountEquity, riskDistance, maxRiskAmount, lotSize, contractSpecs)
      };

      logger.info(`💰 Position sizing for ${symbol}:`);
      logger.info(`   Account Equity: $${accountEquity.toLocaleString()}`);
      logger.info(`   Risk Distance: ${riskDistance.toFixed(5)}`);
      logger.info(`   Max Risk (${this.config.maxRiskPercentage}%): $${maxRiskAmount.toFixed(2)}`);
      logger.info(`   Calculated Lot Size: ${lotSize}`);
      logger.info(`   Actual Risk: $${actualRiskAmount.toFixed(2)} (${actualRiskPercentage.toFixed(2)}%)`);

      return calculation;

    } catch (error) {
      logger.error('Position sizing calculation failed:', error);
      // Return conservative fallback
      return {
        lotSize: this.config.minPositionSize,
        riskAmount: 0,
        positionValue: 0,
        riskPercentage: 0,
        reasoning: `Error in calculation - using minimum lot size (${this.config.minPositionSize})`
      };
    }
  }

  /**
   * Get contract specifications for different instruments
   */
  private getContractSpecs(symbol: string): {
    pointValue: number;
    contractSize: number;
    lotSizeIncrement: number;
  } {
    const upperSymbol = symbol.toUpperCase();

    // Forex pairs
    if (this.isForexPair(upperSymbol)) {
      if (upperSymbol.includes('JPY')) {
        return {
          pointValue: 10,     // $10 per pip for standard lot
          contractSize: 100000,
          lotSizeIncrement: 0.01
        };
      } else {
        return {
          pointValue: 10,     // $10 per pip for standard lot
          contractSize: 100000,
          lotSizeIncrement: 0.01
        };
      }
    }

    // Metals
    if (['XAUUSD', 'GOLD'].includes(upperSymbol)) {
      return {
        pointValue: 1,      // $1 per point
        contractSize: 100,
        lotSizeIncrement: 0.01
      };
    }

    if (['XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return {
        pointValue: 50,     // $50 per point
        contractSize: 5000,
        lotSizeIncrement: 0.01
      };
    }

    // Indices
    if (['NAS100', 'NASDAQ'].includes(upperSymbol)) {
      return {
        pointValue: 1,      // $1 per point
        contractSize: 1,
        lotSizeIncrement: 0.01
      };
    }

    if (['SPX500', 'SPY'].includes(upperSymbol)) {
      return {
        pointValue: 1,      // $1 per point
        contractSize: 1,
        lotSizeIncrement: 0.01
      };
    }

    // Cryptocurrencies
    if (['BTCUSD', 'BITCOIN'].includes(upperSymbol)) {
      return {
        pointValue: 1,      // $1 per point
        contractSize: 1,
        lotSizeIncrement: 0.01
      };
    }

    // Default for unknown instruments
    logger.warn(`Unknown instrument ${symbol}, using default specs`);
    return {
      pointValue: 1,
      contractSize: 1,
      lotSizeIncrement: 0.01
    };
  }

  private isForexPair(symbol: string): boolean {
    return symbol.length === 6 && /^[A-Z]{6}$/.test(symbol);
  }

  private roundToValidLotSize(size: number, increment: number): number {
    return Math.round(size / increment) * increment;
  }

  private generateReasoning(
    equity: number,
    riskDistance: number,
    maxRisk: number,
    finalLotSize: number,
    specs: { pointValue: number; contractSize: number; lotSizeIncrement: number; }
  ): string {
    const reasons = [];
    
    reasons.push(`Account equity: $${equity.toLocaleString()}`);
    reasons.push(`Max risk allowed (${this.config.maxRiskPercentage}%): $${maxRisk.toFixed(2)}`);
    reasons.push(`Risk distance: ${riskDistance.toFixed(5)} points`);
    reasons.push(`Point value: $${specs.pointValue} per lot`);
    
    if (finalLotSize === this.config.minPositionSize) {
      reasons.push(`Applied minimum lot size limit (${this.config.minPositionSize})`);
    }
    
    if (finalLotSize === this.config.maxPositionSize) {
      reasons.push(`Applied maximum lot size limit (${this.config.maxPositionSize})`);
    }

    return reasons.join(' | ');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PositionSizingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Position sizing config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): InternalConfig {
    return { ...this.config };
  }
}
