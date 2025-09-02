/**
 * Working ML Integration Examples
 * Demonstrates how ML can enhance your trading bot
 */

import { TradeSignal } from '../types';
import { TradingMLClassifier, MarketSentimentML } from './simpleTradingML';
import { logger } from '../utils/logger';

export class MLIntegrationExamples {
  
  /**
   * Example 1: ML-Enhanced Signal Confidence
   */
  static async enhanceSignalConfidence(
    signal: TradeSignal, 
    text: string
  ): Promise<TradeSignal> {
    try {
      const classifier = new TradingMLClassifier();
      const sentimentAnalyzer = new MarketSentimentML();
      
      // Extract prices for ML analysis
      const priceMatches = text.match(/\b\d{3,5}\.?\d*\b/g);
      const prices = priceMatches ? priceMatches.map(p => parseFloat(p)).filter(p => p > 0) : [];
      
      // Get ML predictions
      const mlAnalysis = await classifier.classifySignal(text, prices);
      const sentimentAnalysis = sentimentAnalyzer.analyzeSentiment(text);
      
      // Enhance signal with ML insights
      const enhancedSignal: TradeSignal = {
        ...signal,
        reason: `${signal.reason} | ML: ${mlAnalysis.confidence}% confidence, ${sentimentAnalysis.sentiment} sentiment`,
        plan: `${signal.plan} | ML Analysis: ${mlAnalysis.action} signal detected`
      };
      
      logger.info(`🤖 ML Enhancement: ${mlAnalysis.confidence}% confidence, ${sentimentAnalysis.sentiment} sentiment`);
      
      return enhancedSignal;
      
    } catch (error) {
      logger.error('❌ ML Enhancement error:', error);
      return signal; // Return original signal if ML fails
    }
  }
  
  /**
   * Example 2: Pattern Recognition
   */
  static recognizeChartPattern(text: string): {
    pattern: string;
    confidence: number;
    description: string;
  } {
    const patterns = [
      {
        name: 'Support Bounce',
        keywords: ['support', 'bounce', 'resistance become support'],
        confidence: 0.8
      },
      {
        name: 'Breakout Setup',
        keywords: ['breakout', 'break above', 'resistance broken'],
        confidence: 0.7
      },
      {
        name: 'Pullback Entry',
        keywords: ['pullback', 'retest', 'buying area'],
        confidence: 0.75
      }
    ];
    
    const textLower = text.toLowerCase();
    
    for (const pattern of patterns) {
      const matchCount = pattern.keywords.reduce(
        (count, keyword) => count + (textLower.includes(keyword) ? 1 : 0), 0
      );
      
      if (matchCount > 0) {
        return {
          pattern: pattern.name,
          confidence: pattern.confidence * (matchCount / pattern.keywords.length),
          description: `Detected ${pattern.name} pattern with ${matchCount} matching indicators`
        };
      }
    }
    
    return {
      pattern: 'Unknown',
      confidence: 0,
      description: 'No clear pattern detected'
    };
  }
  
  /**
   * Example 3: Risk Assessment
   */
  static assessRisk(signal: TradeSignal, text: string): {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    factors: string[];
    recommendation: string;
  } {
    const riskFactors: string[] = [];
    let riskScore = 0;
    
    // Check for risk indicators in text
    if (/news|event|announcement/i.test(text)) {
      riskFactors.push('News/Event risk detected');
      riskScore += 1;
    }
    
    if (/volatile|uncertainty|unclear/i.test(text)) {
      riskFactors.push('High volatility mentioned');
      riskScore += 1;
    }
    
    // Check signal quality
    if (!signal.stopLoss) {
      riskFactors.push('No stop loss defined');
      riskScore += 2;
    }
    
    if (signal.targets.length === 0) {
      riskFactors.push('No clear targets');
      riskScore += 1;
    }
    
    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    let recommendation: string;
    
    if (riskScore === 0) {
      riskLevel = 'LOW';
      recommendation = 'Good to proceed with standard position size';
    } else if (riskScore <= 2) {
      riskLevel = 'MEDIUM';
      recommendation = 'Consider reducing position size by 25-50%';
    } else {
      riskLevel = 'HIGH';
      recommendation = 'High risk - consider paper trading or very small position';
    }
    
    return { riskLevel, factors: riskFactors, recommendation };
  }
}

// Example usage:
/*
const signal = await tradeParser.parseTradeSignal(text, caption);
if (signal) {
  const enhancedSignal = await MLIntegrationExamples.enhanceSignalConfidence(signal, text);
  const pattern = MLIntegrationExamples.recognizeChartPattern(text);
  const risk = MLIntegrationExamples.assessRisk(enhancedSignal, text);
  
  logger.info('🎯 Enhanced Signal:', enhancedSignal);
  logger.info('📊 Pattern:', pattern);
  logger.info('⚠️ Risk Assessment:', risk);
}
*/
