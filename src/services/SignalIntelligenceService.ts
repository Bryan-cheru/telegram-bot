/**
 * Signal Intelligence Service
 * AI-powered signal analysis and quality assessment
 * Part of Phase 5: Advanced Features - AI Intelligence Engine
 */

import { logger } from '../utils/logger';
import { TradeSignal } from '../types/index';
import { SignalHistoryService } from './SignalHistoryService';

export interface SignalScore {
  overall: number;          // 0-100 overall signal quality score
  technical: number;        // Technical analysis score
  sentiment: number;        // Market sentiment score
  historical: number;       // Historical pattern score
  risk: number;            // Risk assessment score
  confidence: number;      // AI confidence level
  reasons: string[];       // Explanation of scoring factors
}

export interface SignalAnalysis {
  signal: TradeSignal;
  score: SignalScore;
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  aiInsights: string[];
  marketContext: {
    trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    volume: 'LOW' | 'MEDIUM' | 'HIGH';
    support: number;
    resistance: number;
  };
  riskFactors: string[];
  expectedOutcome: {
    successProbability: number;
    expectedReturn: number;
    worstCase: number;
    bestCase: number;
  };
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  timestamp: Date;
}

/**
 * AI-powered signal intelligence and analysis service
 */
export class SignalIntelligenceService {
  private static instance: SignalIntelligenceService;
  private signalHistory: SignalHistoryService;
  private initialized = false;

  // AI Model weights and parameters
  private readonly modelWeights = {
    technical: 0.3,
    sentiment: 0.25,
    historical: 0.25,
    risk: 0.2
  };

  // Market data cache
  private marketDataCache = new Map<string, MarketData>();
  private cacheExpiry = 60000; // 1 minute cache

  private constructor() {
    this.signalHistory = SignalHistoryService.getInstance();
  }

  public static getInstance(): SignalIntelligenceService {
    if (!SignalIntelligenceService.instance) {
      SignalIntelligenceService.instance = new SignalIntelligenceService();
    }
    return SignalIntelligenceService.instance;
  }

  /**
   * Initialize the AI Intelligence Service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.signalHistory.initialize();
      this.initialized = true;
      logger.info('🤖 Signal Intelligence Service initialized - AI analysis ready');
    } catch (error) {
      logger.error('❌ Failed to initialize Signal Intelligence Service:', error);
      throw error;
    }
  }

  /**
   * Analyze a trading signal using AI-powered intelligence
   */
  async analyzeSignal(signal: TradeSignal, channelId?: string): Promise<SignalAnalysis> {
    await this.initialize();

    try {
      logger.info(`🔍 AI analyzing signal: ${signal.symbol} ${signal.action}`);

      // Get market data
      const marketData = await this.getMarketData(signal.symbol);

      // Calculate individual scores
      const technicalScore = await this.calculateTechnicalScore(signal, marketData);
      const sentimentScore = await this.calculateSentimentScore(signal.symbol, marketData);
      const historicalScore = await this.calculateHistoricalScore(signal, channelId);
      const riskScore = await this.calculateRiskScore(signal, marketData);

      // Calculate weighted overall score
      const overallScore = Math.round(
        technicalScore * this.modelWeights.technical +
        sentimentScore * this.modelWeights.sentiment +
        historicalScore * this.modelWeights.historical +
        riskScore * this.modelWeights.risk
      );

      // Generate AI insights and recommendations
      const signalScore: SignalScore = {
        overall: overallScore,
        technical: technicalScore,
        sentiment: sentimentScore,
        historical: historicalScore,
        risk: riskScore,
        confidence: this.calculateConfidence(signal, marketData),
        reasons: this.generateScoreReasons(technicalScore, sentimentScore, historicalScore, riskScore)
      };

      const analysis: SignalAnalysis = {
        signal,
        score: signalScore,
        recommendation: this.generateRecommendation(overallScore),
        aiInsights: await this.generateAIInsights(signal, signalScore, marketData),
        marketContext: this.analyzeMarketContext(marketData, signal),
        riskFactors: this.identifyRiskFactors(signal, marketData),
        expectedOutcome: this.predictOutcome(signal, signalScore, marketData)
      };

      logger.info(`✅ AI analysis complete: ${signal.symbol} scored ${overallScore}/100 (${analysis.recommendation})`);
      return analysis;

    } catch (error) {
      logger.error('❌ Signal analysis failed:', error);
      throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate technical analysis score based on signal parameters
   */
  private async calculateTechnicalScore(signal: TradeSignal, marketData: MarketData): Promise<number> {
    let score = 50; // Base score

    // Entry zone quality assessment
    if (signal.entryZone && signal.entryZone.min > 0 && signal.entryZone.max > 0) {
      const zoneWidth = Math.abs(signal.entryZone.max - signal.entryZone.min);
      const avgEntry = (signal.entryZone.min + signal.entryZone.max) / 2;
      const pricePercentage = (zoneWidth / avgEntry) * 100;
      
      // Professional trading zones (like "Good Buying Area 3864-3854")
      if (pricePercentage < 0.3) score += 20; // Very tight professional zone
      else if (pricePercentage < 0.8) score += 15; // Tight zone
      else if (pricePercentage < 1.5) score += 10; // Reasonable zone
      else if (pricePercentage > 3) score -= 10; // Too wide zone
      
      // Bonus for range entries (more professional than single point)
      if (signal.entryZone.min !== signal.entryZone.max) {
        score += 5; // Range entry bonus
      }
    } else {
      score -= 15; // No proper entry zone defined
    }

    // Risk-reward ratio and target analysis
    if (signal.targets && signal.targets.length > 0) {
      const avgEntry = signal.entryZone && signal.entryZone.min > 0
        ? (signal.entryZone.min + signal.entryZone.max) / 2 
        : marketData.price;
      
      // Multiple targets analysis (like "weak high 3905, final target 3924")
      if (signal.targets.length > 1) {
        score += 10; // Multiple targets show good planning
      }
      
      // Calculate potential reward
      const nearestTarget = signal.targets[0];
      const targetDistance = Math.abs(avgEntry - nearestTarget);
      const targetPercentage = (targetDistance / avgEntry) * 100;
      
      // Realistic target distance assessment
      if (targetPercentage >= 1 && targetPercentage <= 3) score += 15; // Good target distance
      else if (targetPercentage > 0.5 && targetPercentage < 5) score += 10; // Acceptable
      else if (targetPercentage > 10) score -= 10; // Unrealistic targets
      
      // User-defined risk management (0.45% risk with 1:1 R:R by default)
      // Award points for having systematic risk management approach
      score += 15; // Good: Users have consistent risk management
      
      // Note: Stop loss and take profit are calculated from user settings:
      // - Default risk: 0.45% of entry price
      // - Default R:R: 1:1 (can be adjusted per user preferences)
      // This ensures consistent risk management regardless of signal format
      
      if (signal.stopLoss && signal.stopLoss > 0) {
        // If signal provides stop loss, use it for analysis
        const stopDistance = Math.abs(avgEntry - signal.stopLoss);
        const rrRatio = targetDistance / stopDistance;
        
        if (rrRatio >= 3) score += 5; // Bonus for excellent signal R:R
        else if (rrRatio >= 2) score += 3; // Good signal R:R
      } else {
        score -= 5; // No stop loss defined reduces score slightly
      }
    } else {
      score -= 20; // No targets defined
    }

    // Signal confidence
    if (signal.confidence !== undefined) {
      if (signal.confidence > 0.8) score += 10;
      else if (signal.confidence > 0.6) score += 5;
      else if (signal.confidence < 0.4) score -= 10;
    }

    // Reasoning quality analysis
    if (signal.reason) {
      const reasoning = signal.reason.toLowerCase();
      
      // Professional analysis indicators
      if (reasoning.includes('market structure')) score += 8;
      if (reasoning.includes('demand zone') || reasoning.includes('supply zone')) score += 8;
      if (reasoning.includes('break of structure') || reasoning.includes('bos')) score += 6;
      if (reasoning.includes('high probability')) score += 5;
      if (reasoning.includes('safe')) score += 3;
      if (reasoning.includes('bullish') || reasoning.includes('bearish')) score += 4;
      if (reasoning.includes('retracement')) score += 4;
      if (reasoning.includes('impulsive move')) score += 5;
      
      // Detailed reasoning bonus
      const reasoningPoints = signal.reason.split(/[-•]/g).filter(point => point.trim().length > 10);
      if (reasoningPoints.length >= 3) score += 10; // Well-structured analysis
      else if (reasoningPoints.length >= 2) score += 5;
    }

    // Plan/context analysis
    if (signal.plan) {
      const plan = signal.plan.toLowerCase();
      if (plan.includes('chart') || plan.includes('timeframe')) score += 3;
      if (plan.includes('structure') || plan.includes('trend')) score += 4;
    }

    // Market trend alignment
    const trendAlignment = this.analyzeTrendAlignment(signal, marketData);
    score += trendAlignment;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate sentiment analysis score
   */
  private async calculateSentimentScore(symbol: string, marketData: MarketData): Promise<number> {
    let score = 50; // Base score

    // Price momentum (24h change)
    const priceChange = marketData.change24h;
    
    if (Math.abs(priceChange) > 5) {
      score += priceChange > 0 ? 15 : -15; // Strong momentum
    } else if (Math.abs(priceChange) > 2) {
      score += priceChange > 0 ? 10 : -10; // Moderate momentum
    }

    // Volume analysis
    if (marketData.volume24h) {
      // High volume suggests strong interest
      score += 10; // Placeholder for volume analysis
    }

    // Market cap considerations (for crypto/stocks)
    if (marketData.marketCap) {
      if (marketData.marketCap > 1000000000) { // Large cap
        score += 5; // More stable
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate historical performance score
   */
  private async calculateHistoricalScore(signal: TradeSignal, channelId?: string): Promise<number> {
    let score = 50; // Base score

    try {
      if (channelId) {
        // Get channel historical performance
        const channelStats = await this.signalHistory.getChannelStats(channelId);
        
        if (channelStats.totalSignals >= 10) { // Enough data
          const successRate = channelStats.successRate;
          
          if (successRate > 0.8) score += 20; // Excellent track record
          else if (successRate > 0.6) score += 15; // Good track record
          else if (successRate > 0.4) score += 5; // Average track record
          else score -= 15; // Poor track record
        }
      }

      // Symbol-specific historical performance
      // This would require more complex historical data analysis
      // For now, we'll use a simplified approach
      
    } catch (error) {
      logger.warn('Could not calculate historical score:', error);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate risk assessment score
   */
  private async calculateRiskScore(signal: TradeSignal, marketData: MarketData): Promise<number> {
    let score = 50; // Base score (neutral risk)

    // Volatility assessment
    const volatility = Math.abs(marketData.change24h);
    
    if (volatility < 1) score += 15; // Low volatility = lower risk
    else if (volatility < 3) score += 5; // Moderate volatility
    else if (volatility > 10) score -= 20; // High volatility = higher risk

    // Position sizing considerations
    if (signal.positionSizing) {
      if (signal.positionSizing.riskPercentage <= 1) score += 10; // Conservative risk
      else if (signal.positionSizing.riskPercentage <= 2) score += 5; // Moderate risk
      else if (signal.positionSizing.riskPercentage > 5) score -= 15; // High risk
    }

    // User-defined risk management system (0.45% risk with 1:1 R:R)
    // Always award high points since users have systematic risk management
    score += 20; // Excellent: Consistent user-defined risk management
    
    // Additional points for signal quality indicators
    if (signal.reason || signal.plan) {
      const reasonText = (signal.reason || signal.plan || '').toLowerCase();
      
      // Look for high-quality signal indicators
      if (reasonText.includes('safe') || reasonText.includes('high probability') || 
          reasonText.includes('high-probability')) {
        score += 15; // Signal indicates safety/high probability
      }
      
      // Market structure analysis bonus
      if (reasonText.includes('market structure') || reasonText.includes('demand zone') ||
          reasonText.includes('supply zone') || reasonText.includes('break of structure') ||
          reasonText.includes('bos') || reasonText.includes('bullish') || reasonText.includes('bearish')) {
        score += 10; // Good market structure analysis
      }
      
      // Multiple confirmation factors
      if (reasonText.includes('multiple') || reasonText.includes('confluence') ||
          reasonText.includes('several') || reasonText.includes('various')) {
        score += 5; // Multiple confirmation factors
        
        if (reasonText.includes('demand zone') || reasonText.includes('support')) {
          score += 8; // Has structural support
        }
        
        if (reasonText.includes('bullish structure') || reasonText.includes('market structure')) {
          score += 5; // Market structure analysis
        }
        
        if (reasonText.includes('multiple') && reasonText.includes('target')) {
          score += 5; // Multiple targets suggest good planning
        }
      } else {
        score -= 15; // No stop loss and no risk context
      }
    }

    // Bonus for well-structured entry zones
    if (signal.entryZone) {
      const zoneWidth = Math.abs(signal.entryZone.max - signal.entryZone.min);
      const avgEntry = (signal.entryZone.min + signal.entryZone.max) / 2;
      const zoneWidthPercent = (zoneWidth / avgEntry) * 100;
      
      if (zoneWidthPercent < 0.3) score += 10; // Very tight entry zone
      else if (zoneWidthPercent < 0.5) score += 5; // Reasonable entry zone
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate AI confidence level
   */
  private calculateConfidence(signal: TradeSignal, marketData: MarketData): number {
    let confidence = 50;

    // Signal completeness
    if (signal.entryZone && signal.stopLoss && signal.targets) confidence += 20;
    if (signal.confidence !== undefined) confidence += 10;
    if (signal.reason || signal.plan) confidence += 10;

    // Market data quality
    if (marketData.volume24h) confidence += 5;
    if (marketData.marketCap) confidence += 5;

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Generate explanation for score components
   */
  private generateScoreReasons(technical: number, sentiment: number, historical: number, risk: number): string[] {
    const reasons: string[] = [];

    if (technical > 70) reasons.push('Strong technical setup with good risk-reward ratio');
    else if (technical < 40) reasons.push('Weak technical setup or poor risk management');

    if (sentiment > 70) reasons.push('Positive market sentiment and momentum');
    else if (sentiment < 40) reasons.push('Negative market sentiment or weak momentum');

    if (historical > 70) reasons.push('Strong historical performance from this source');
    else if (historical < 40) reasons.push('Poor historical track record');

    if (risk > 70) reasons.push('Low risk profile with good volatility conditions');
    else if (risk < 40) reasons.push('High risk due to volatility or poor risk management');

    return reasons;
  }

  /**
   * Generate trading recommendation based on overall score
   */
  private generateRecommendation(score: number): 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' {
    if (score >= 80) return 'STRONG_BUY';
    if (score >= 65) return 'BUY';
    if (score >= 35) return 'NEUTRAL';
    if (score >= 20) return 'SELL';
    return 'STRONG_SELL';
  }

  /**
   * Generate AI-powered insights about the signal
   */
  private async generateAIInsights(signal: TradeSignal, score: SignalScore, marketData: MarketData): Promise<string[]> {
    const insights: string[] = [];

    // Overall quality insight
    if (score.overall > 75) {
      insights.push('🎯 High-quality signal with strong confluence of factors');
    } else if (score.overall < 40) {
      insights.push('⚠️ Low-quality signal with multiple risk factors');
    }

    // Technical insights
    if (score.technical > 70) {
      insights.push('📊 Technical analysis shows favorable setup');
    }

    // Risk insights
    if (score.risk < 40) {
      insights.push('🚨 High risk detected - consider reducing position size');
    }

    // Market context insights
    if (Math.abs(marketData.change24h) > 5) {
      insights.push(`📈 Strong market momentum: ${marketData.change24h > 0 ? 'bullish' : 'bearish'} trend`);
    }

    // Confidence insights
    if (score.confidence < 60) {
      insights.push('❓ Limited signal data - exercise extra caution');
    }

    return insights;
  }

  /**
   * Analyze market context for the signal
   */
  private analyzeMarketContext(marketData: MarketData, signal: TradeSignal) {
    const change24h = marketData.change24h;
    
    return {
      trend: change24h > 2 ? 'BULLISH' as const : change24h < -2 ? 'BEARISH' as const : 'SIDEWAYS' as const,
      volatility: Math.abs(change24h) > 5 ? 'HIGH' as const : Math.abs(change24h) > 2 ? 'MEDIUM' as const : 'LOW' as const,
      volume: marketData.volume24h ? 'MEDIUM' as const : 'LOW' as const, // Simplified
      support: marketData.price * 0.98, // Simplified support/resistance
      resistance: marketData.price * 1.02
    };
  }

  /**
   * Identify potential risk factors
   */
  private identifyRiskFactors(signal: TradeSignal, marketData: MarketData): string[] {
    const risks: string[] = [];

    // Note: Stop loss and take profit are handled by user settings (0.45% risk, 1:1 R:R)
    // So we don't flag missing SL/TP as risks anymore

    // Market-based risk factors
    if (Math.abs(marketData.change24h) > 10) risks.push('Extremely high market volatility');
    if (Math.abs(marketData.change24h) > 5) risks.push('High market volatility - consider reduced position size');
    
    // Signal quality risks
    if (signal.confidence !== undefined && signal.confidence < 0.5) risks.push('Low signal confidence');
    
    // Entry zone risks
    if (signal.entryZone) {
      const zoneWidth = Math.abs(signal.entryZone.max - signal.entryZone.min);
      const avgEntry = (signal.entryZone.min + signal.entryZone.max) / 2;
      const zoneWidthPercent = (zoneWidth / avgEntry) * 100;
      
      if (zoneWidthPercent > 1) risks.push('Wide entry zone - may affect precision');
    }

    return risks;
  }

  /**
   * Predict expected outcome using AI models
   */
  private predictOutcome(signal: TradeSignal, score: SignalScore, marketData: MarketData) {
    const baseSuccess = score.overall / 100;
    
    return {
      successProbability: Math.round(baseSuccess * 100),
      expectedReturn: baseSuccess * 3, // Simplified expected return calculation
      worstCase: -2, // Simplified worst case (2% loss)
      bestCase: 5    // Simplified best case (5% gain)
    };
  }

  /**
   * Analyze trend alignment between signal and market
   */
  private analyzeTrendAlignment(signal: TradeSignal, marketData: MarketData): number {
    const change24h = marketData.change24h;
    const isBullishSignal = signal.action === 'BUY';
    const isBullishMarket = change24h > 0;

    // Reward alignment with market trend
    if (isBullishSignal === isBullishMarket) {
      return Math.abs(change24h) > 2 ? 15 : 5; // Strong or weak alignment
    } else {
      return Math.abs(change24h) > 2 ? -10 : 0; // Counter-trend penalty
    }
  }

  /**
   * Get market data for symbol (mock implementation)
   */
  private async getMarketData(symbol: string): Promise<MarketData> {
    // Check cache first
    const cached = this.marketDataCache.get(symbol);
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheExpiry) {
      return cached;
    }

    // Mock market data - in production, this would fetch from real APIs
    const mockData: MarketData = {
      symbol,
      price: this.generateMockPrice(symbol),
      change24h: (Math.random() - 0.5) * 10, // -5% to +5%
      volume24h: Math.random() * 1000000,
      marketCap: Math.random() * 10000000000,
      timestamp: new Date()
    };

    // Cache the data
    this.marketDataCache.set(symbol, mockData);
    return mockData;
  }

  /**
   * Generate mock price based on symbol
   */
  private generateMockPrice(symbol: string): number {
    // Simple hash-based mock pricing
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
      hash = hash & hash;
    }
    
    if (symbol.includes('USD')) {
      return Math.abs(hash % 3000) + 1000; // 1000-4000 range for major pairs/gold
    } else {
      return Math.abs(hash % 2) + 0.5; // 0.5-2.5 range for forex pairs
    }
  }

  /**
   * Bulk analyze multiple signals
   */
  async analyzeSignalsBatch(signals: { signal: TradeSignal, channelId?: string }[]): Promise<SignalAnalysis[]> {
    await this.initialize();
    
    logger.info(`🔄 AI analyzing ${signals.length} signals in batch`);
    
    const analyses = await Promise.all(
      signals.map(({ signal, channelId }) => this.analyzeSignal(signal, channelId))
    );
    
    logger.info(`✅ Batch analysis complete: ${analyses.length} signals analyzed`);
    return analyses;
  }

  /**
   * Get AI recommendations for a user based on their trading history
   */
  async getPersonalizedRecommendations(userId: string, limit: number = 5): Promise<string[]> {
    await this.initialize();
    
    try {
      // Get user's signal history
      const userHistory = await this.signalHistory.getUserSignalHistory(userId, { limit: 50 });
      
      const recommendations: string[] = [];
      
      // Analyze user's performance patterns
      if (userHistory.signals.length > 10) {
        const successRate = userHistory.stats.successRate;
        
        if (successRate < 0.5) {
          recommendations.push('📚 Consider focusing on signals with higher technical scores (>70)');
          recommendations.push('🛡️ Implement stricter risk management with tighter stop losses');
        } else if (successRate > 0.7) {
          recommendations.push('🎯 You have a strong track record - consider increasing position sizes slightly');
          recommendations.push('📈 Look for signals with similar characteristics to your successful trades');
        }
      }
      
      // General AI recommendations
      recommendations.push('🤖 AI suggests focusing on signals with overall scores above 65');
      recommendations.push('⚡ Best performance typically seen with risk-reward ratios above 2:1');
      
      return recommendations.slice(0, limit);
      
    } catch (error) {
      logger.error('Failed to generate personalized recommendations:', error);
      return ['🤖 Enable more signal analysis to receive AI recommendations'];
    }
  }
}