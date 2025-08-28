import { logger } from '../utils/logger';
import { TradeSignal } from '../types';

export interface StopLossConfig {
  baseStopLossDistance: number;    // Base distance in points/pips
  volatilityMultiplier: number;    // Multiplier based on volatility
  minimumDistance: number;         // Minimum SL distance
  maximumDistance: number;         // Maximum SL distance
  useATRBased: boolean;           // Use ATR for calculation
  riskRewardRatio: number;        // Target risk:reward ratio
}

export interface DynamicStopLossResult {
  stopLoss: number;
  distance: number;
  distanceInPips: number;
  reasoning: string;
  confidence: number; // 0-1 scale
  adjustmentFactors: {
    volatility: number;
    spread: number;
    timeOfDay: number;
    instrument: number;
  };
}

export class DynamicStopLossCalculator {
  private readonly INSTRUMENT_VOLATILITY: { [key: string]: number } = {
    // Forex - typical daily range as percentage
    'EURUSD': 0.008, 'GBPUSD': 0.012, 'USDJPY': 0.008, 'USDCHF': 0.009,
    'AUDUSD': 0.011, 'USDCAD': 0.010, 'NZDUSD': 0.012, 'EURJPY': 0.010,
    'GBPJPY': 0.015, 'EURGBP': 0.008, 'AUDJPY': 0.013, 'EURAUD': 0.012,
    
    // Metals - higher volatility
    'XAUUSD': 0.020, 'GOLD': 0.020, 'XAGUSD': 0.035, 'SILVER': 0.035,
    
    // Indices - varies by instrument
    'US30': 0.015, 'NAS100': 0.020, 'SPX500': 0.012, 'UK100': 0.015,
    'GER30': 0.018, 'FRA40': 0.016, 'JPN225': 0.020,
    
    // Crypto - very high volatility
    'BTCUSD': 0.040, 'ETHUSD': 0.050, 'BITCOIN': 0.040, 'ETHEREUM': 0.050
  };

  private readonly MARKET_SESSIONS = {
    sydney: { start: 21, end: 6, volatility: 0.7 },
    tokyo: { start: 0, end: 9, volatility: 0.8 },
    london: { start: 8, end: 17, volatility: 1.0 },
    nyc: { start: 13, end: 22, volatility: 1.2 }
  };

  private config: StopLossConfig;

  constructor(config?: Partial<StopLossConfig>) {
    this.config = {
      baseStopLossDistance: 20,      // 20 pips base
      volatilityMultiplier: 1.5,     // 1.5x volatility adjustment
      minimumDistance: 5,            // 5 pips minimum
      maximumDistance: 100,          // 100 pips maximum
      useATRBased: true,             // Use ATR when possible
      riskRewardRatio: 1.2,          // 1:1.2 minimum ratio
      ...config
    };
  }

  /**
   * Calculate dynamic stop loss for a trade signal
   */
  calculateDynamicStopLoss(signal: TradeSignal, currentPrice?: number): DynamicStopLossResult {
    try {
      const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
      const price = currentPrice || entryMid;
      
      // Get instrument characteristics
      const instrumentVolatility = this.getInstrumentVolatility(signal.symbol);
      const pipValue = this.getPipValue(signal.symbol);
      
      // Calculate base stop loss distance
      let baseDistance = this.config.baseStopLossDistance * pipValue;
      
      // Adjust for instrument volatility
      const volatilityAdjustment = instrumentVolatility * this.config.volatilityMultiplier;
      const volatilityDistance = price * volatilityAdjustment;
      
      // Time-based adjustments
      const timeAdjustment = this.getTimeBasedAdjustment();
      
      // Calculate final distance
      let finalDistance = Math.max(baseDistance, volatilityDistance) * timeAdjustment;
      
      // Apply limits
      const minDistance = this.config.minimumDistance * pipValue;
      const maxDistance = this.config.maximumDistance * pipValue;
      finalDistance = Math.max(minDistance, Math.min(maxDistance, finalDistance));
      
      // Calculate stop loss price
      const stopLoss = signal.action === 'BUY' ? 
        entryMid - finalDistance : 
        entryMid + finalDistance;
      
      // Calculate confidence based on various factors
      const confidence = this.calculateConfidence(signal, finalDistance, entryMid);
      
      // Create adjustment factors breakdown
      const adjustmentFactors = {
        volatility: volatilityAdjustment / baseDistance,
        spread: this.getSpreadAdjustment(signal.symbol),
        timeOfDay: timeAdjustment,
        instrument: this.getInstrumentAdjustment(signal.symbol)
      };
      
      const result: DynamicStopLossResult = {
        stopLoss: Number(stopLoss.toFixed(this.getDecimalPlaces(signal.symbol))),
        distance: finalDistance,
        distanceInPips: finalDistance / pipValue,
        reasoning: this.generateReasoning(signal, finalDistance, pipValue, adjustmentFactors),
        confidence,
        adjustmentFactors
      };
      
      logger.info(`🎯 Dynamic stop loss calculated for ${signal.symbol}:`);
      logger.info(`   Entry: ${entryMid.toFixed(5)}`);
      logger.info(`   Stop Loss: ${result.stopLoss}`);
      logger.info(`   Distance: ${result.distanceInPips.toFixed(1)} pips`);
      logger.info(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
      
      return result;
      
    } catch (error) {
      logger.error('Dynamic stop loss calculation failed:', error);
      
      // Return conservative fallback
      const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
      const fallbackDistance = entryMid * 0.01; // 1% fallback
      const fallbackStopLoss = signal.action === 'BUY' ? 
        entryMid - fallbackDistance : 
        entryMid + fallbackDistance;
      
      return {
        stopLoss: Number(fallbackStopLoss.toFixed(5)),
        distance: fallbackDistance,
        distanceInPips: fallbackDistance / this.getPipValue(signal.symbol),
        reasoning: 'Fallback calculation due to error - using 1% of entry price',
        confidence: 0.3,
        adjustmentFactors: { volatility: 1, spread: 1, timeOfDay: 1, instrument: 1 }
      };
    }
  }

  /**
   * Validate stop loss placement
   */
  validateStopLossPlacement(signal: TradeSignal, proposedStopLoss: number): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    const distance = Math.abs(entryMid - proposedStopLoss);
    const distancePercent = (distance / entryMid) * 100;
    
    // Check logical placement
    if (signal.action === 'BUY' && proposedStopLoss >= signal.entryZone.min) {
      issues.push('Stop loss for BUY order must be below entry zone');
    } else if (signal.action === 'SELL' && proposedStopLoss <= signal.entryZone.max) {
      issues.push('Stop loss for SELL order must be above entry zone');
    }
    
    // Check distance reasonableness
    if (distancePercent < 0.1) {
      issues.push('Stop loss is too tight (< 0.1% from entry)');
      suggestions.push('Consider widening stop loss to at least 0.2% from entry');
    } else if (distancePercent > 5) {
      issues.push('Stop loss is very wide (> 5% from entry)');
      suggestions.push('Consider tightening stop loss to reduce risk');
    }
    
    // Check risk-reward ratio
    if (signal.targets && signal.targets.length > 0) {
      const reward = Math.abs(signal.targets[0] - entryMid);
      const risk = distance;
      const ratio = reward / risk;
      
      if (ratio < 1) {
        issues.push(`Poor risk-reward ratio: ${ratio.toFixed(2)}:1`);
        suggestions.push('Adjust targets or stop loss for better than 1:1 ratio');
      } else if (ratio < 1.2) {
        suggestions.push(`Consider improving risk-reward ratio (currently ${ratio.toFixed(2)}:1)`);
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StopLossConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Dynamic stop loss config updated:', this.config);
  }

  private getInstrumentVolatility(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    return this.INSTRUMENT_VOLATILITY[upperSymbol] || 0.015; // 1.5% default
  }

  private getPipValue(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // JPY pairs have different pip value
    if (upperSymbol.includes('JPY')) {
      return 0.01;
    }
    
    // Most forex pairs
    if (this.isForexPair(upperSymbol)) {
      return 0.0001;
    }
    
    // Metals
    if (['XAUUSD', 'GOLD'].includes(upperSymbol)) {
      return 0.01;
    }
    
    if (['XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return 0.001;
    }
    
    // Indices and crypto
    return 0.1;
  }

  private getDecimalPlaces(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    if (upperSymbol.includes('JPY')) {
      return 3;
    }
    
    if (this.isForexPair(upperSymbol)) {
      return 5;
    }
    
    if (['XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return 2;
    }
    
    return 2;
  }

  private isForexPair(symbol: string): boolean {
    return symbol.length === 6 && /^[A-Z]{6}$/.test(symbol);
  }

  private getTimeBasedAdjustment(): number {
    const hour = new Date().getUTCHours();
    
    // London-NYC overlap (high volatility)
    if (hour >= 13 && hour <= 16) {
      return 1.2;
    }
    
    // London session
    if (hour >= 8 && hour <= 17) {
      return 1.0;
    }
    
    // Asian session (lower volatility)
    if (hour >= 0 && hour <= 6) {
      return 0.8;
    }
    
    // Default
    return 0.9;
  }

  private getSpreadAdjustment(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // Major pairs have tight spreads
    if (['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'].includes(upperSymbol)) {
      return 1.0;
    }
    
    // Minor pairs have wider spreads
    if (this.isForexPair(upperSymbol)) {
      return 1.1;
    }
    
    // Metals have moderate spreads
    if (['XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return 1.05;
    }
    
    // Indices typically have tight spreads
    if (['US30', 'NAS100', 'SPX500'].includes(upperSymbol)) {
      return 1.0;
    }
    
    // Default for exotic instruments
    return 1.2;
  }

  private getInstrumentAdjustment(symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // Stable instruments
    if (['EURUSD', 'USDCHF'].includes(upperSymbol)) {
      return 0.9;
    }
    
    // Volatile instruments
    if (['GBPJPY', 'XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return 1.2;
    }
    
    // Crypto (very volatile)
    if (['BTCUSD', 'ETHUSD', 'BITCOIN', 'ETHEREUM'].includes(upperSymbol)) {
      return 1.5;
    }
    
    return 1.0;
  }

  private calculateConfidence(signal: TradeSignal, distance: number, entryPrice: number): number {
    let confidence = 0.7; // Base confidence
    
    // Adjust based on risk-reward ratio
    if (signal.targets && signal.targets.length > 0) {
      const reward = Math.abs(signal.targets[0] - entryPrice);
      const ratio = reward / distance;
      
      if (ratio >= 2.0) confidence += 0.2;
      else if (ratio >= 1.5) confidence += 0.1;
      else if (ratio < 1.0) confidence -= 0.2;
    }
    
    // Adjust based on instrument knowledge
    const upperSymbol = signal.symbol.toUpperCase();
    if (this.INSTRUMENT_VOLATILITY[upperSymbol]) {
      confidence += 0.1; // We know this instrument
    }
    
    // Adjust based on time of day
    const hour = new Date().getUTCHours();
    if (hour >= 8 && hour <= 17) {
      confidence += 0.1; // London session
    }
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private generateReasoning(
    signal: TradeSignal, 
    finalDistance: number, 
    pipValue: number, 
    factors: any
  ): string {
    const reasons = [];
    
    const distanceInPips = finalDistance / pipValue;
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    const distancePercent = (finalDistance / entryMid) * 100;
    
    reasons.push(`Base calculation: ${distanceInPips.toFixed(1)} pips (${distancePercent.toFixed(2)}%)`);
    
    if (factors.volatility > 1.1) {
      reasons.push(`High volatility adjustment (+${((factors.volatility - 1) * 100).toFixed(0)}%)`);
    } else if (factors.volatility < 0.9) {
      reasons.push(`Low volatility adjustment (${((factors.volatility - 1) * 100).toFixed(0)}%)`);
    }
    
    if (factors.timeOfDay > 1.05) {
      reasons.push('High volatility trading session');
    } else if (factors.timeOfDay < 0.95) {
      reasons.push('Low volatility trading session');
    }
    
    if (factors.instrument > 1.1) {
      reasons.push('Volatile instrument adjustment');
    }
    
    if (factors.spread > 1.05) {
      reasons.push('Wide spread adjustment');
    }
    
    return reasons.join(' | ');
  }
}
