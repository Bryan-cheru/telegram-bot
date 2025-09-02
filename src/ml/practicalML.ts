/**
 * PRACTICAL ML INTEGRATION FOR YOUR BOT
 * Start with these simple approaches that don't require complex ML libraries
 */

// 1. Add this to your package.json dependencies:
const mlDependencies = {
  "@tensorflow/tfjs-node": "^4.15.0",
  "natural": "^6.6.0",
  "sentiment": "^5.0.2"
};

// 2. Simple sentiment analysis for captions (using built-in patterns)
// import Sentiment from 'sentiment'; // Optional dependency

export class TradingAssistantML {
  // private sentiment = new Sentiment(); // Optional

  /**
   * Analyze caption sentiment to boost/reduce signal confidence
   */
  analyzeCaptionSentiment(caption: string): {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    adjustment: number; // Multiplier for position sizing
  } {
    // Simple keyword-based sentiment analysis (no external dependency)
    const bullishWords = ['buy', 'bullish', 'support', 'target', 'breakout', 'long', 'bounce'];
    const bearishWords = ['sell', 'bearish', 'resistance', 'short', 'breakdown', 'fall'];
    
    const words = caption.toLowerCase().split(/\s+/);
    const bullishCount = words.filter(word => bullishWords.includes(word)).length;
    const bearishCount = words.filter(word => bearishWords.includes(word)).length;
    
    const score = bullishCount - bearishCount; // Positive = bullish, Negative = bearish
    
    // Map sentiment score to trading sentiment
    let tradingSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    let adjustment = 1.0;
    
    if (score > 1) {
      tradingSentiment = 'BULLISH';
      adjustment = 1.1; // Slightly increase position for positive sentiment
    } else if (score < -1) {
      tradingSentiment = 'BEARISH';
      adjustment = 1.1; // Increase position for strong bearish sentiment
    } else {
      tradingSentiment = 'NEUTRAL';
      adjustment = 0.95; // Slightly reduce for neutral sentiment
    }
    
    return {
      sentiment: tradingSentiment,
      confidence: Math.min(Math.abs(score) / 3, 1), // Normalize score to 0-1
      adjustment
    };
  }

  /**
   * Pattern recognition from price data
   */
  detectChartPattern(prices: number[]): {
    pattern: string;
    confidence: number;
    recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  } {
    if (prices.length < 20) {
      return { pattern: 'INSUFFICIENT_DATA', confidence: 0, recommendation: 'HOLD' };
    }

    // Simple trend analysis
    const recent10 = prices.slice(-10);
    const previous10 = prices.slice(-20, -10);
    
    const recentAvg = recent10.reduce((a, b) => a + b) / recent10.length;
    const previousAvg = previous10.reduce((a, b) => a + b) / previous10.length;
    
    const trendStrength = (recentAvg - previousAvg) / previousAvg;
    
    // Support/Resistance levels
    const high = Math.max(...prices.slice(-50));
    const low = Math.min(...prices.slice(-50));
    const currentPrice = prices[prices.length - 1];
    
    // Pattern detection
    if (this.isDoubleBottom(prices)) {
      return { pattern: 'DOUBLE_BOTTOM', confidence: 0.8, recommendation: 'BUY' };
    }
    
    if (this.isDoubleTop(prices)) {
      return { pattern: 'DOUBLE_TOP', confidence: 0.8, recommendation: 'SELL' };
    }
    
    if (trendStrength > 0.01) {
      return { pattern: 'UPTREND', confidence: Math.min(trendStrength * 50, 1), recommendation: 'BUY' };
    }
    
    if (trendStrength < -0.01) {
      return { pattern: 'DOWNTREND', confidence: Math.min(Math.abs(trendStrength) * 50, 1), recommendation: 'SELL' };
    }
    
    // Check if near support/resistance
    const distanceFromHigh = (high - currentPrice) / high;
    const distanceFromLow = (currentPrice - low) / low;
    
    if (distanceFromHigh < 0.01) {
      return { pattern: 'NEAR_RESISTANCE', confidence: 0.7, recommendation: 'SELL' };
    }
    
    if (distanceFromLow < 0.01) {
      return { pattern: 'NEAR_SUPPORT', confidence: 0.7, recommendation: 'BUY' };
    }
    
    return { pattern: 'RANGING', confidence: 0.5, recommendation: 'HOLD' };
  }

  /**
   * ML-enhanced risk management
   */
  calculateMLRisk(signal: any, marketConditions: any): {
    adjustedStopLoss: number;
    adjustedPositionSize: number;
    riskScore: number;
  } {
    let riskMultiplier = 1.0;
    
    // Adjust based on market volatility
    if (marketConditions.volatility === 'HIGH') {
      riskMultiplier *= 0.8; // Reduce position size
    }
    
    // Adjust based on pattern confidence
    if (marketConditions.confidence > 0.8) {
      riskMultiplier *= 1.2; // Increase position for high confidence
    }
    
    // Calculate adjusted values
    const originalRisk = Math.abs(signal.entryZone.max - signal.stopLoss);
    const adjustedRisk = originalRisk * (2 - riskMultiplier); // Inverse relationship
    
    const adjustedStopLoss = signal.action === 'BUY' 
      ? signal.entryZone.min - adjustedRisk
      : signal.entryZone.max + adjustedRisk;
    
    return {
      adjustedStopLoss,
      adjustedPositionSize: riskMultiplier,
      riskScore: 1 - riskMultiplier // Higher risk score = lower multiplier
    };
  }

  private isDoubleBottom(prices: number[]): boolean {
    if (prices.length < 30) return false;
    
    const recent20 = prices.slice(-20);
    const lows = this.findLocalMinima(recent20);
    
    if (lows.length < 2) return false;
    
    const [low1, low2] = lows.slice(-2);
    const tolerance = 0.02; // 2% tolerance
    
    return Math.abs(low1 - low2) / Math.min(low1, low2) < tolerance;
  }

  private isDoubleTop(prices: number[]): boolean {
    if (prices.length < 30) return false;
    
    const recent20 = prices.slice(-20);
    const highs = this.findLocalMaxima(recent20);
    
    if (highs.length < 2) return false;
    
    const [high1, high2] = highs.slice(-2);
    const tolerance = 0.02; // 2% tolerance
    
    return Math.abs(high1 - high2) / Math.max(high1, high2) < tolerance;
  }

  private findLocalMinima(prices: number[]): number[] {
    const minima: number[] = [];
    
    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
        minima.push(prices[i]);
      }
    }
    
    return minima;
  }

  private findLocalMaxima(prices: number[]): number[] {
    const maxima: number[] = [];
    
    for (let i = 1; i < prices.length - 1; i++) {
      if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
        maxima.push(prices[i]);
      }
    }
    
    return maxima;
  }
}

/**
 * INTEGRATION INTO YOUR EXISTING PARSER
 */
export function integrateMLIntoParser() {
  // Add this to your TradeParser.parseTradeSignal method:
  
  const mlAssistant = new TradingAssistantML();
  
  // After parsing signal, enhance with ML
  const enhanceSignalWithML = (signal: any, text: string, caption?: string) => {
    // 1. Sentiment analysis
    let sentimentBoost = 1.0;
    if (caption) {
      const sentiment = mlAssistant.analyzeCaptionSentiment(caption);
      sentimentBoost = sentiment.adjustment;
      
      console.log(`🧠 ML Sentiment: ${sentiment.sentiment} (${sentiment.confidence.toFixed(2)})`);
    }
    
    // 2. Pattern recognition
    const prices = extractPricesFromText(text);
    if (prices.length > 10) {
      const pattern = mlAssistant.detectChartPattern(prices);
      console.log(`🧠 ML Pattern: ${pattern.pattern} (${pattern.confidence.toFixed(2)})`);
      
      // Adjust signal based on pattern
      if (pattern.recommendation === 'STRONG_BUY' && signal.action === 'BUY') {
        sentimentBoost *= 1.2;
      } else if (pattern.recommendation === 'STRONG_SELL' && signal.action === 'SELL') {
        sentimentBoost *= 1.2;
      }
    }
    
    // 3. Enhanced risk management
    const riskAnalysis = mlAssistant.calculateMLRisk(signal, { volatility: 'MEDIUM', confidence: 0.7 });
    
    return {
      ...signal,
      stopLoss: riskAnalysis.adjustedStopLoss,
      positionSizeMultiplier: sentimentBoost * riskAnalysis.adjustedPositionSize,
      mlAnalysis: {
        sentimentBoost,
        riskScore: riskAnalysis.riskScore,
        confidence: 0.7
      },
      reason: `${signal.reason} | ML Enhanced (${(sentimentBoost * 100).toFixed(0)}% confidence)`
    };
  };
  
  return enhanceSignalWithML;
}

function extractPricesFromText(text: string): number[] {
  const priceRegex = /\b(\d{1,5}\.\d{2,5})\b/g;
  const matches = [...text.matchAll(priceRegex)];
  return matches.map(match => parseFloat(match[1])).filter(price => price > 0);
}
