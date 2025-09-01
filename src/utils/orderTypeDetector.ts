import { OrderType, TradeSignal } from '../types';
import { logger } from './logger';
import { config } from './config';

export interface OrderTypeDecision {
  orderType: OrderType;
  entryPrice?: number;
  reason: string;
  confidence: number;
}

export class OrderTypeDetector {
  
  /**
   * Smart order type detection based on signal characteristics and market conditions
   */
  static determineOptimalOrderType(
    signal: TradeSignal,
    currentPrice?: number,
    marketConditions?: {
      spread: number;
      volatility: 'LOW' | 'MEDIUM' | 'HIGH';
      liquidity: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): OrderTypeDecision {
    
    // If smart order type detection is disabled, use default
    if (!config.trading.useSmartOrderType) {
      return {
        orderType: config.trading.defaultOrderType as OrderType,
        reason: 'Using configured default order type',
        confidence: 0.5
      };
    }

    const entryMin = signal.entryZone.min;
    const entryMax = signal.entryZone.max;
    const entryMid = (entryMin + entryMax) / 2;
    const entryRangeSize = Math.abs(entryMax - entryMin);
    
    // Analyze signal characteristics
    const analysis = this.analyzeSignalCharacteristics(signal, currentPrice);
    
    logger.info('🎯 Order Type Analysis:', {
      symbol: signal.symbol,
      action: signal.action,
      entryZone: signal.entryZone,
      currentPrice: currentPrice,
      analysis: analysis
    });

    // Decision logic based on various factors
    const decision = this.makeOrderTypeDecision(signal, currentPrice, analysis, marketConditions);
    
    logger.info('📋 Order Type Decision:', {
      orderType: decision.orderType,
      entryPrice: decision.entryPrice,
      reason: decision.reason,
      confidence: decision.confidence
    });

    return decision;
  }

  private static analyzeSignalCharacteristics(signal: TradeSignal, currentPrice?: number) {
    const entryMin = signal.entryZone.min;
    const entryMax = signal.entryZone.max;
    const entryMid = (entryMin + entryMax) / 2;
    const entryRangeSize = Math.abs(entryMax - entryMin);
    const stopDistance = Math.abs(entryMid - signal.stopLoss);
    
    return {
      entryRangeSize,
      stopDistance,
      riskRewardRatio: stopDistance > 0 ? Math.abs(signal.targets[0] - entryMid) / stopDistance : 0,
      isNarrowEntryZone: entryRangeSize < (entryMid * 0.001), // Less than 0.1% of price
      isWideEntryZone: entryRangeSize > (entryMid * 0.01), // More than 1% of price
      currentPricePosition: currentPrice ? this.determinePricePosition(currentPrice, signal) : 'UNKNOWN',
      hasMultipleTargets: signal.targets.length > 1
    };
  }

  private static determinePricePosition(currentPrice: number, signal: TradeSignal): string {
    const entryMin = signal.entryZone.min;
    const entryMax = signal.entryZone.max;
    const tolerance = Math.abs(entryMax - entryMin) * 0.1; // 10% tolerance

    if (currentPrice >= entryMin - tolerance && currentPrice <= entryMax + tolerance) {
      return 'IN_ZONE';
    } else if (signal.action === 'BUY' && currentPrice < entryMin) {
      return 'BELOW_ZONE';
    } else if (signal.action === 'BUY' && currentPrice > entryMax) {
      return 'ABOVE_ZONE';
    } else if (signal.action === 'SELL' && currentPrice > entryMax) {
      return 'ABOVE_ZONE';
    } else if (signal.action === 'SELL' && currentPrice < entryMin) {
      return 'BELOW_ZONE';
    }
    
    return 'UNKNOWN';
  }

  private static makeOrderTypeDecision(
    signal: TradeSignal,
    currentPrice: number | undefined,
    analysis: any,
    marketConditions?: any
  ): OrderTypeDecision {
    
    let confidence = 0;
    let orderType: OrderType = 'MARKET';
    let entryPrice: number | undefined;
    let reason = '';

    // Priority 1: If signal explicitly specifies order type
    if (signal.orderType) {
      return {
        orderType: signal.orderType,
        entryPrice: signal.entryPrice,
        reason: 'Signal explicitly specified order type',
        confidence: 1.0
      };
    }

    // Priority 2: Current price analysis
    if (currentPrice && analysis.currentPricePosition) {
      switch (analysis.currentPricePosition) {
        case 'IN_ZONE':
          // Price is already in entry zone - execute immediately
          orderType = 'MARKET';
          reason = 'Current price is within entry zone - immediate execution optimal';
          confidence = 0.9;
          break;

        case 'BELOW_ZONE':
          if (signal.action === 'BUY') {
            // Price below buy zone - wait for price to come up
            orderType = 'LIMIT';
            entryPrice = signal.entryZone.max; // Buy at top of zone
            reason = 'Price below buy zone - using limit order at zone high';
            confidence = 0.8;
          } else {
            // Price below sell zone - might reverse, use market if urgent
            orderType = 'MARKET';
            reason = 'Price below sell zone - market order for immediate execution';
            confidence = 0.6;
          }
          break;

        case 'ABOVE_ZONE':
          if (signal.action === 'SELL') {
            // Price above sell zone - wait for price to come down
            orderType = 'LIMIT';
            entryPrice = signal.entryZone.min; // Sell at bottom of zone
            reason = 'Price above sell zone - using limit order at zone low';
            confidence = 0.8;
          } else {
            // Price above buy zone - might continue up, use market if urgent
            orderType = 'MARKET';
            reason = 'Price above buy zone - market order for immediate execution';
            confidence = 0.6;
          }
          break;
      }
    }

    // Priority 3: Signal characteristics analysis
    if (confidence < 0.7) {
      if (analysis.isNarrowEntryZone && analysis.riskRewardRatio > 2) {
        // Narrow zone with good RR - precision matters
        orderType = 'LIMIT';
        entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
        reason = 'Narrow entry zone with good risk-reward - precision limit order';
        confidence = 0.75;
      } else if (analysis.isWideEntryZone) {
        // Wide zone - market entry acceptable
        orderType = 'MARKET';
        reason = 'Wide entry zone allows market execution';
        confidence = 0.7;
      }
    }

    // Priority 4: Market conditions (if available)
    if (marketConditions && confidence < 0.8) {
      if (marketConditions.spread > 5 && marketConditions.volatility === 'HIGH') {
        orderType = 'LIMIT';
        entryPrice = entryPrice || (signal.entryZone.min + signal.entryZone.max) / 2;
        reason = 'High spread and volatility - limit order for better execution';
        confidence = 0.8;
      } else if (marketConditions.liquidity === 'LOW') {
        orderType = 'LIMIT';
        entryPrice = entryPrice || (signal.entryZone.min + signal.entryZone.max) / 2;
        reason = 'Low liquidity - limit order for controlled entry';
        confidence = 0.75;
      }
    }

    // Fallback: Use configured default
    if (confidence < 0.5) {
      orderType = config.trading.defaultOrderType as OrderType;
      reason = 'Using configured default order type - insufficient data for smart detection';
      confidence = 0.5;
    }

    return {
      orderType,
      entryPrice,
      reason,
      confidence
    };
  }

  /**
   * Calculate optimal entry price for limit orders
   */
  static calculateLimitPrice(signal: TradeSignal, orderType: OrderType): number {
    const entryMin = signal.entryZone.min;
    const entryMax = signal.entryZone.max;
    const slippage = config.trading.limitOrderSlippage;

    switch (orderType) {
      case 'LIMIT':
        if (signal.action === 'BUY') {
          // For buy orders, place limit at the lower end of zone (better price)
          return entryMin + (slippage * this.getPipValue(signal.symbol));
        } else {
          // For sell orders, place limit at the upper end of zone (better price)
          return entryMax - (slippage * this.getPipValue(signal.symbol));
        }

      default:
        // Use mid-point for other order types
        return (entryMin + entryMax) / 2;
    }
  }

  /**
   * Get pip value for different symbol types
   */
  private static getPipValue(symbol: string): number {
    if (symbol.includes('JPY')) {
      return 0.01; // JPY pairs have 2 decimal places
    } else if (symbol.includes('XAU') || symbol.includes('GOLD')) {
      return 0.1; // Gold typically trades with 1 decimal
    } else if (symbol.includes('XAG') || symbol.includes('SILVER')) {
      return 0.01; // Silver typically trades with 2 decimals
    } else {
      return 0.0001; // Standard forex pairs have 4 decimal places
    }
  }

  /**
   * Calculate expiration time for pending orders
   */
  static calculateExpirationTime(): Date {
    const expirationHours = config.trading.pendingOrderExpiration;
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + expirationHours);
    return expiration;
  }
}
