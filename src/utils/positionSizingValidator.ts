import { logger } from './logger';
import { TradeSignal } from '../types';

interface BrokerSpecs {
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  pipValue: number; // Value per pip per lot
  contractSize: number;
  marginRequired: number; // Margin required per lot
}

interface SymbolSpecs {
  [symbol: string]: BrokerSpecs;
}

/**
 * CRITICAL: Position sizing validator to prevent dangerous trades
 * Validates broker-specific constraints and calculates safe position sizes
 */
export class PositionSizingValidator {
  private static instance: PositionSizingValidator;
  
  // Default broker specifications - should be updated with real broker data
  private brokerSpecs: SymbolSpecs = {
    'XAUUSD': {
      minVolume: 0.01,
      maxVolume: 100.0,
      volumeStep: 0.01,
      pipValue: 1.0, // $1 per pip per lot for gold
      contractSize: 100, // 100 ounces
      marginRequired: 1000 // $1000 margin per lot
    },
    'XAGUSD': {
      minVolume: 0.01,
      maxVolume: 100.0,
      volumeStep: 0.01,
      pipValue: 0.5, // $0.50 per pip per lot for silver
      contractSize: 5000, // 5000 ounces
      marginRequired: 500
    },
    'EURUSD': {
      minVolume: 0.01,
      maxVolume: 100.0,
      volumeStep: 0.01,
      pipValue: 0.1, // $0.10 per pip per mini lot
      contractSize: 100000,
      marginRequired: 200
    },
    'GBPUSD': {
      minVolume: 0.01,
      maxVolume: 100.0,
      volumeStep: 0.01,
      pipValue: 0.1,
      contractSize: 100000,
      marginRequired: 250
    },
    'USDJPY': {
      minVolume: 0.01,
      maxVolume: 100.0,
      volumeStep: 0.01,
      pipValue: 0.09, // Varies with USD/JPY rate
      contractSize: 100000,
      marginRequired: 200
    }
  };

  private constructor() {}

  static getInstance(): PositionSizingValidator {
    if (!PositionSizingValidator.instance) {
      PositionSizingValidator.instance = new PositionSizingValidator();
    }
    return PositionSizingValidator.instance;
  }

  /**
   * CRITICAL: Validate and calculate safe position size
   */
  validateAndCalculatePosition(
    signal: TradeSignal,
    accountBalance: number,
    accountEquity: number,
    riskPercentage: number = 2.0
  ): {
    isValid: boolean;
    calculatedVolume: number;
    originalVolume?: number;
    adjustmentReason?: string;
    riskAmount: number;
    marginRequired: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const specs = this.getBrokerSpecs(signal.symbol);
    
    if (!specs) {
      return {
        isValid: false,
        calculatedVolume: 0,
        adjustmentReason: `No broker specifications found for ${signal.symbol}`,
        riskAmount: 0,
        marginRequired: 0,
        warnings: [`Unknown symbol: ${signal.symbol}`]
      };
    }

    // Calculate risk amount
    const maxRiskAmount = (accountEquity * riskPercentage) / 100;
    
    // Calculate stop distance in pips
    const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    const stopDistance = Math.abs(entryPrice - signal.stopLoss);
    const stopDistanceInPips = this.convertToPips(stopDistance, signal.symbol);
    
    if (stopDistanceInPips <= 0) {
      return {
        isValid: false,
        calculatedVolume: 0,
        adjustmentReason: 'Invalid stop loss - no risk distance calculated',
        riskAmount: 0,
        marginRequired: 0,
        warnings: ['Stop loss must be different from entry price']
      };
    }

    // Calculate position size based on risk
    const riskPerPip = specs.pipValue;
    const calculatedVolume = maxRiskAmount / (stopDistanceInPips * riskPerPip);
    
    // Apply broker constraints
    let finalVolume = this.applyBrokerConstraints(calculatedVolume, specs);
    let adjustmentReason: string | undefined;
    
    // Check margin requirements
    const marginRequired = finalVolume * specs.marginRequired;
    const marginRatio = marginRequired / accountEquity;
    
    if (marginRatio > 0.5) { // More than 50% margin usage
      warnings.push(`High margin usage: ${(marginRatio * 100).toFixed(1)}%`);
      
      if (marginRatio > 0.8) { // Critical margin usage
        const safeVolume = (accountEquity * 0.5) / specs.marginRequired;
        const adjustedVolume = this.applyBrokerConstraints(safeVolume, specs);
        
        if (adjustedVolume !== finalVolume) {
          adjustmentReason = `Position reduced due to margin requirements (${(marginRatio * 100).toFixed(1)}% → ${((adjustedVolume * specs.marginRequired / accountEquity) * 100).toFixed(1)}%)`;
          finalVolume = adjustedVolume;
        }
      }
    }

    // Final validation
    const actualRiskAmount = finalVolume * stopDistanceInPips * riskPerPip;
    const actualRiskPercentage = (actualRiskAmount / accountEquity) * 100;
    
    if (actualRiskPercentage > riskPercentage * 1.5) { // 150% of intended risk
      return {
        isValid: false,
        calculatedVolume: 0,
        adjustmentReason: `Risk too high: ${actualRiskPercentage.toFixed(2)}% > ${(riskPercentage * 1.5).toFixed(1)}%`,
        riskAmount: actualRiskAmount,
        marginRequired: finalVolume * specs.marginRequired,
        warnings
      };
    }

    // Additional safety checks
    if (finalVolume < specs.minVolume) {
      warnings.push('Position size below broker minimum - may not execute');
    }

    if (actualRiskPercentage < 0.1) {
      warnings.push('Very small position size - may not be worth the spread cost');
    }

    return {
      isValid: true,
      calculatedVolume: finalVolume,
      originalVolume: calculatedVolume !== finalVolume ? calculatedVolume : undefined,
      adjustmentReason,
      riskAmount: actualRiskAmount,
      marginRequired: finalVolume * specs.marginRequired,
      warnings
    };
  }

  /**
   * Apply broker-specific volume constraints
   */
  private applyBrokerConstraints(volume: number, specs: BrokerSpecs): number {
    // Apply minimum
    if (volume < specs.minVolume) {
      return specs.minVolume;
    }

    // Apply maximum
    if (volume > specs.maxVolume) {
      return specs.maxVolume;
    }

    // Round to volume step
    const steps = Math.round(volume / specs.volumeStep);
    return steps * specs.volumeStep;
  }

  /**
   * Convert price difference to pips for the symbol
   */
  private convertToPips(priceDifference: number, symbol: string): number {
    // This is simplified - real implementation needs to consider symbol specifications
    const pipMultipliers: Record<string, number> = {
      'XAUUSD': 1, // Gold: 1 pip = $1
      'XAGUSD': 1, // Silver: 1 pip = $1  
      'EURUSD': 10000, // 4-digit: 1 pip = 0.0001
      'GBPUSD': 10000,
      'USDJPY': 100, // 2-digit: 1 pip = 0.01
    };

    const multiplier = pipMultipliers[symbol] || 10000;
    return Math.abs(priceDifference * multiplier);
  }

  /**
   * Get broker specifications for a symbol
   */
  private getBrokerSpecs(symbol: string): BrokerSpecs | null {
    return this.brokerSpecs[symbol] || null;
  }

  /**
   * Update broker specifications (for production use)
   */
  updateBrokerSpecs(symbol: string, specs: BrokerSpecs): void {
    this.brokerSpecs[symbol] = specs;
    logger.info(`Updated broker specs for ${symbol}:`, specs);
  }

  /**
   * Validate position size against account constraints
   */
  validatePositionConstraints(
    volume: number, 
    symbol: string, 
    accountEquity: number
  ): { isValid: boolean; reason?: string } {
    const specs = this.getBrokerSpecs(symbol);
    
    if (!specs) {
      return { isValid: false, reason: `No specifications for ${symbol}` };
    }

    // Check volume constraints
    if (volume < specs.minVolume) {
      return { isValid: false, reason: `Volume ${volume} below minimum ${specs.minVolume}` };
    }

    if (volume > specs.maxVolume) {
      return { isValid: false, reason: `Volume ${volume} above maximum ${specs.maxVolume}` };
    }

    // Check volume step
    const steps = volume / specs.volumeStep;
    if (Math.abs(steps - Math.round(steps)) > 0.0001) {
      return { isValid: false, reason: `Volume ${volume} not aligned with step ${specs.volumeStep}` };
    }

    // Check margin requirements
    const marginRequired = volume * specs.marginRequired;
    if (marginRequired > accountEquity * 0.9) { // 90% of equity
      return { isValid: false, reason: `Insufficient margin: required ${marginRequired}, available ${accountEquity}` };
    }

    return { isValid: true };
  }
}
