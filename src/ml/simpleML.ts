/**
 * ZERO-DEPENDENCY ML FOR YOUR BOT
 * Add this directly to your existing TradeParser
 */

// Add this method to your TradeParser class
export class SimpleMLEnhancements {
  
  /**
   * Analyze caption for bullish/bearish keywords
   */
  static analyzeCaption(caption: string): {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    positionSizeMultiplier: number;
  } {
    const bullishKeywords = ['buy', 'long', 'bullish', 'support', 'bounce', 'rally', 'breakout', 'uptrend'];
    const bearishKeywords = ['sell', 'short', 'bearish', 'resistance', 'dump', 'crash', 'downtrend', 'fall'];
    
    const text = caption.toLowerCase();
    
    const bullishScore = bullishKeywords.reduce((score, word) => 
      score + (text.includes(word) ? 1 : 0), 0);
    const bearishScore = bearishKeywords.reduce((score, word) => 
      score + (text.includes(word) ? 1 : 0), 0);
    
    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    let multiplier = 1.0;
    let confidence = 0.5;
    
    if (bullishScore > bearishScore) {
      sentiment = 'BULLISH';
      confidence = Math.min(bullishScore / 3, 1);
      multiplier = 1 + (confidence * 0.2); // Up to 20% increase
    } else if (bearishScore > bullishScore) {
      sentiment = 'BEARISH';
      confidence = Math.min(bearishScore / 3, 1);
      multiplier = 1 + (confidence * 0.2); // Up to 20% increase
    } else {
      sentiment = 'NEUTRAL';
      multiplier = 0.9; // Slight reduction for neutral
    }
    
    return { sentiment, confidence, positionSizeMultiplier: multiplier };
  }

  /**
   * Detect chart patterns from price levels
   */
  static detectPattern(prices: number[]): {
    pattern: string;
    strength: number;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
  } {
    if (prices.length < 5) {
      return { pattern: 'INSUFFICIENT_DATA', strength: 0, recommendation: 'HOLD' };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    const currentPrice = prices[prices.length - 1] || sorted[Math.floor(sorted.length / 2)];
    
    // Support/Resistance detection
    const support = sorted[Math.floor(sorted.length * 0.2)];
    const resistance = sorted[Math.floor(sorted.length * 0.8)];
    
    // Distance from key levels
    const supportDistance = (currentPrice - support) / support;
    const resistanceDistance = (resistance - currentPrice) / currentPrice;
    
    // Pattern detection
    if (supportDistance < 0.01) {
      return { pattern: 'NEAR_SUPPORT', strength: 0.8, recommendation: 'BUY' };
    }
    
    if (resistanceDistance < 0.01) {
      return { pattern: 'NEAR_RESISTANCE', strength: 0.8, recommendation: 'SELL' };
    }
    
    // Trend analysis (simple)
    const first = prices.slice(0, Math.floor(prices.length / 2));
    const second = prices.slice(Math.floor(prices.length / 2));
    
    const firstAvg = first.reduce((a, b) => a + b) / first.length;
    const secondAvg = second.reduce((a, b) => a + b) / second.length;
    
    const trend = (secondAvg - firstAvg) / firstAvg;
    
    if (trend > 0.005) {
      return { pattern: 'UPTREND', strength: Math.min(trend * 100, 1), recommendation: 'BUY' };
    }
    
    if (trend < -0.005) {
      return { pattern: 'DOWNTREND', strength: Math.min(Math.abs(trend) * 100, 1), recommendation: 'SELL' };
    }
    
    return { pattern: 'SIDEWAYS', strength: 0.5, recommendation: 'HOLD' };
  }

  /**
   * Calculate volatility-based risk adjustment
   */
  static calculateRiskAdjustment(prices: number[]): {
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    stopLossMultiplier: number;
    positionSizeMultiplier: number;
  } {
    if (prices.length < 10) {
      return { volatility: 'MEDIUM', stopLossMultiplier: 1.0, positionSizeMultiplier: 1.0 };
    }

    // Calculate price changes
    const changes = prices.slice(1).map((price, i) => Math.abs(price - prices[i]) / prices[i]);
    const avgChange = changes.reduce((a, b) => a + b) / changes.length;
    
    let volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    let stopLossMultiplier: number;
    let positionSizeMultiplier: number;
    
    if (avgChange < 0.005) { // < 0.5%
      volatility = 'LOW';
      stopLossMultiplier = 0.8; // Tighter stops
      positionSizeMultiplier = 1.2; // Larger position
    } else if (avgChange < 0.02) { // < 2%
      volatility = 'MEDIUM';
      stopLossMultiplier = 1.0; // Normal stops
      positionSizeMultiplier = 1.0; // Normal position
    } else {
      volatility = 'HIGH';
      stopLossMultiplier = 1.3; // Wider stops
      positionSizeMultiplier = 0.8; // Smaller position
    }
    
    return { volatility, stopLossMultiplier, positionSizeMultiplier };
  }
}

// INTEGRATION EXAMPLE:
// Add this to your TradeParser.parseTradeSignal method:

/*
const enhanceWithML = (signal: TradeSignal, text: string, caption?: string) => {
  const prices = this.extractAllPrices(text);
  
  // 1. Caption sentiment analysis
  let sentimentMultiplier = 1.0;
  if (caption) {
    const sentiment = SimpleMLEnhancements.analyzeCaption(caption);
    sentimentMultiplier = sentiment.positionSizeMultiplier;
    logger.info(`🧠 Sentiment: ${sentiment.sentiment} (${sentiment.confidence.toFixed(2)})`);
  }
  
  // 2. Pattern detection
  const pattern = SimpleMLEnhancements.detectPattern(prices);
  logger.info(`🧠 Pattern: ${pattern.pattern} (${pattern.strength.toFixed(2)})`);
  
  // 3. Risk adjustment
  const riskAdj = SimpleMLEnhancements.calculateRiskAdjustment(prices);
  logger.info(`🧠 Volatility: ${riskAdj.volatility}`);
  
  // Apply ML enhancements
  const originalRisk = Math.abs(signal.entryZone.max - signal.stopLoss);
  const adjustedStopLoss = signal.action === 'BUY' 
    ? signal.stopLoss - (originalRisk * (riskAdj.stopLossMultiplier - 1))
    : signal.stopLoss + (originalRisk * (riskAdj.stopLossMultiplier - 1));
  
  return {
    ...signal,
    stopLoss: adjustedStopLoss,
    positionSizeMultiplier: sentimentMultiplier * riskAdj.positionSizeMultiplier,
    reason: `${signal.reason} | ML: ${pattern.pattern} (${riskAdj.volatility} vol)`
  };
};

// Use: const enhancedSignal = enhanceWithML(signal, text, caption);
*/
