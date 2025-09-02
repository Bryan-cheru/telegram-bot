// Simplified ML Integration - No External Dependencies Required
// This provides ML concepts without requiring TensorFlow or sentiment libraries

import { logger } from '../utils/logger';

export interface MLPrediction {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Simple Trading ML Classifier using statistical analysis
 * No external dependencies required - works out of the box
 */
export class TradingMLClassifier {
  
  /**
   * Classify trading signal using statistical patterns
   */
  async classifySignal(ocrText: string, priceData: number[]): Promise<MLPrediction> {
    try {
      logger.info('🔍 Analyzing signal with statistical ML patterns...');
      
      if (priceData.length < 3) {
        return { action: 'HOLD', confidence: 0, sentiment: 'NEUTRAL' };
      }

      // Statistical analysis
      const sortedPrices = [...priceData].sort((a, b) => a - b);
      const priceRange = sortedPrices[sortedPrices.length - 1] - sortedPrices[0];
      const midPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
      
      // Sentiment analysis based on keywords
      const sentiment = this.analyzeSentiment(ocrText);
      
      // Pattern recognition
      const hasStrongBuySignals = /buy|bullish|support|bounce|long|target/gi.test(ocrText);
      const hasStrongSellSignals = /sell|bearish|resistance|short|break/gi.test(ocrText);
      
      // Determine action
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      
      if (hasStrongBuySignals && sentiment === 'BULLISH') {
        action = 'BUY';
        confidence = 0.8;
      } else if (hasStrongSellSignals && sentiment === 'BEARISH') {
        action = 'SELL';
        confidence = 0.8;
      } else if (hasStrongBuySignals) {
        action = 'BUY';
        confidence = 0.6;
      } else if (hasStrongSellSignals) {
        action = 'SELL';
        confidence = 0.6;
      }
      
      return { action, confidence, sentiment };
      
    } catch (error) {
      logger.error('❌ ML Classification error:', error);
      return { action: 'HOLD', confidence: 0, sentiment: 'NEUTRAL' };
    }
  }

  /**
   * Simple sentiment analysis using keyword patterns
   */
  private analyzeSentiment(text: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const bullishWords = ['buy', 'bullish', 'support', 'bounce', 'long', 'target', 'resistance become support', 'breakout'];
    const bearishWords = ['sell', 'bearish', 'resistance', 'breakdown', 'short', 'support break', 'fall'];
    
    const textLower = text.toLowerCase();
    
    const bullishCount = bullishWords.reduce((count, word) => count + (textLower.includes(word) ? 1 : 0), 0);
    const bearishCount = bearishWords.reduce((count, word) => count + (textLower.includes(word) ? 1 : 0), 0);
    
    if (bullishCount > bearishCount && bullishCount > 0) return 'BULLISH';
    if (bearishCount > bullishCount && bearishCount > 0) return 'BEARISH';
    return 'NEUTRAL';
  }
}

/**
 * Market Sentiment Analysis using simple pattern matching
 */
export class MarketSentimentML {
  
  /**
   * Analyze market sentiment from text
   */
  analyzeSentiment(text: string): MLPrediction {
    const classifier = new TradingMLClassifier();
    const sentiment = classifier['analyzeSentiment'](text); // Access private method for testing
    
    const confidence = this.calculateSentimentConfidence(text);
    const action = sentiment === 'BULLISH' ? 'BUY' : sentiment === 'BEARISH' ? 'SELL' : 'HOLD';
    
    return { action, confidence, sentiment };
  }
  
  private calculateSentimentConfidence(text: string): number {
    const strongWords = ['target', 'support', 'resistance', 'breakout', 'breakdown'];
    const textLower = text.toLowerCase();
    
    const strongWordCount = strongWords.reduce((count, word) => count + (textLower.includes(word) ? 1 : 0), 0);
    return Math.min(0.3 + (strongWordCount * 0.15), 0.9);
  }
}

// Export for compatibility
export { TradingMLClassifier as default };
