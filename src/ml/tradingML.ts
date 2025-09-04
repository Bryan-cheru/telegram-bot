/**
 * Market Override Decision interface
 */
export interface MarketOverrideDecision {
  shouldOverride: boolean;
  confidence: number;
  reason: string;
  suggestedAction?: string;
}

/**
 * Smart Market Override ML - Stub implementation
 * Provides basic market analysis for override decisions
 */
export class SmartMarketOverrideML {
  /**
   * Analyze market conflict and determine if override is needed
   */
  static analyzeMarketConflict(
    conflictType: string,
    timestamp: Date,
    symbol: string,
    priceDataAvailable: boolean,
    additionalContext?: any
  ): MarketOverrideDecision {
    
    // Simple rule-based logic for now
    // In a real implementation, this would use ML models
    
    if (conflictType === 'CLOSED') {
      // Market is closed - generally don't override unless it's a critical signal
      return {
        shouldOverride: false,
        confidence: 0.8,
        reason: 'Market is closed - waiting for market open',
        suggestedAction: 'WAIT_FOR_MARKET_OPEN'
      };
    }
    
    if (conflictType === 'HIGH_VOLATILITY') {
      // High volatility - be more cautious
      return {
        shouldOverride: false,
        confidence: 0.7,
        reason: 'High volatility detected - reducing risk',
        suggestedAction: 'REDUCE_POSITION_SIZE'
      };
    }
    
    if (conflictType === 'LOW_LIQUIDITY') {
      // Low liquidity - avoid trading
      return {
        shouldOverride: false,
        confidence: 0.9,
        reason: 'Low liquidity - avoiding trade execution',
        suggestedAction: 'CANCEL_TRADE'
      };
    }
    
    // Default: no override needed
    return {
      shouldOverride: false,
      confidence: 0.6,
      reason: 'No override needed - proceeding with normal execution',
      suggestedAction: 'PROCEED'
    };
  }
}
