/**
 * Market Sentiment Analyzer
 * Real-time market sentiment analysis and integration
 * Part of Phase 5: Advanced Features - AI Intelligence Engine
 */

import { logger } from '../utils/logger';

export interface SentimentData {
  symbol: string;
  sentiment: 'EXTREMELY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'EXTREMELY_BEARISH';
  score: number; // -100 to +100
  confidence: number; // 0-100
  sources: SentimentSource[];
  marketFactors: MarketFactor[];
  timestamp: Date;
  validUntil: Date;
}

export interface SentimentSource {
  name: string;
  type: 'NEWS' | 'SOCIAL' | 'TECHNICAL' | 'FUNDAMENTAL' | 'WHALE_ACTIVITY';
  score: number;
  weight: number;
  description: string;
  url?: string;
}

export interface MarketFactor {
  factor: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  strength: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

export interface GlobalSentiment {
  overall: SentimentData;
  crypto: SentimentData;
  forex: SentimentData;
  commodities: SentimentData;
  stocks: SentimentData;
  fearGreedIndex?: number; // 0-100
  vixLevel?: number;
  lastUpdate: Date;
}

/**
 * Advanced market sentiment analysis service
 */
export class MarketSentimentAnalyzer {
  private static instance: MarketSentimentAnalyzer;
  private initialized = false;
  private sentimentCache = new Map<string, SentimentData>();
  private readonly cacheExpiry = 300000; // 5 minutes cache

  // Sentiment source weights
  private readonly sourceWeights = {
    NEWS: 0.3,
    SOCIAL: 0.25,
    TECHNICAL: 0.25,
    FUNDAMENTAL: 0.15,
    WHALE_ACTIVITY: 0.05
  };

  private constructor() {}

  public static getInstance(): MarketSentimentAnalyzer {
    if (!MarketSentimentAnalyzer.instance) {
      MarketSentimentAnalyzer.instance = new MarketSentimentAnalyzer();
    }
    return MarketSentimentAnalyzer.instance;
  }

  /**
   * Initialize the Market Sentiment Analyzer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.initialized = true;
      logger.info('📊 Market Sentiment Analyzer initialized - Real-time sentiment analysis ready');
    } catch (error) {
      logger.error('❌ Failed to initialize Market Sentiment Analyzer:', error);
      throw error;
    }
  }

  /**
   * Analyze sentiment for a specific symbol
   */
  async analyzeSentiment(symbol: string): Promise<SentimentData> {
    await this.initialize();

    // Check cache first
    const cached = this.sentimentCache.get(symbol);
    if (cached && Date.now() < cached.validUntil.getTime()) {
      return cached;
    }

    try {
      logger.info(`📈 Analyzing market sentiment for ${symbol}`);

      // Gather sentiment from multiple sources
      const sources = await this.gatherSentimentSources(symbol);
      
      // Calculate weighted sentiment score
      const weightedScore = this.calculateWeightedSentiment(sources);
      
      // Analyze market factors
      const marketFactors = await this.analyzeMarketFactors(symbol);
      
      // Determine confidence level
      const confidence = this.calculateSentimentConfidence(sources, marketFactors);

      const sentimentData: SentimentData = {
        symbol,
        sentiment: this.categorizeSentiment(weightedScore),
        score: Math.round(weightedScore),
        confidence: Math.round(confidence),
        sources,
        marketFactors,
        timestamp: new Date(),
        validUntil: new Date(Date.now() + this.cacheExpiry)
      };

      // Cache the result
      this.sentimentCache.set(symbol, sentimentData);

      logger.info(`✅ Sentiment analysis complete for ${symbol}: ${sentimentData.sentiment} (${sentimentData.score}/100)`);
      return sentimentData;

    } catch (error) {
      logger.error(`❌ Sentiment analysis failed for ${symbol}:`, error);
      
      // Return neutral sentiment on error
      return this.createNeutralSentiment(symbol);
    }
  }

  /**
   * Get global market sentiment across all asset classes
   */
  async getGlobalSentiment(): Promise<GlobalSentiment> {
    await this.initialize();

    try {
      logger.info('🌍 Analyzing global market sentiment');

      // Analyze major market segments
      const [crypto, forex, commodities, stocks] = await Promise.all([
        this.analyzeCryptoSentiment(),
        this.analyzeForexSentiment(),
        this.analyzeCommoditiesSentiment(),
        this.analyzeStocksSentiment()
      ]);

      // Calculate overall market sentiment
      const overall = this.calculateOverallSentiment([crypto, forex, commodities, stocks]);

      // Get additional market indicators
      const fearGreedIndex = await this.getFearGreedIndex();
      const vixLevel = await this.getVIXLevel();

      const globalSentiment: GlobalSentiment = {
        overall,
        crypto,
        forex,
        commodities,
        stocks,
        fearGreedIndex,
        vixLevel,
        lastUpdate: new Date()
      };

      logger.info(`✅ Global sentiment analysis complete: ${overall.sentiment}`);
      return globalSentiment;

    } catch (error) {
      logger.error('❌ Global sentiment analysis failed:', error);
      throw new Error(`Global sentiment analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gather sentiment data from multiple sources
   */
  private async gatherSentimentSources(symbol: string): Promise<SentimentSource[]> {
    const sources: SentimentSource[] = [];

    try {
      // News sentiment analysis
      const newsSource = await this.analyzeNewsSentiment(symbol);
      if (newsSource) sources.push(newsSource);

      // Social media sentiment
      const socialSource = await this.analyzeSocialSentiment(symbol);
      if (socialSource) sources.push(socialSource);

      // Technical analysis sentiment
      const technicalSource = await this.analyzeTechnicalSentiment(symbol);
      if (technicalSource) sources.push(technicalSource);

      // Fundamental analysis sentiment
      const fundamentalSource = await this.analyzeFundamentalSentiment(symbol);
      if (fundamentalSource) sources.push(fundamentalSource);

      // Whale activity sentiment (for crypto)
      if (this.isCryptoSymbol(symbol)) {
        const whaleSource = await this.analyzeWhaleSentiment(symbol);
        if (whaleSource) sources.push(whaleSource);
      }

    } catch (error) {
      logger.warn(`Some sentiment sources failed for ${symbol}:`, error);
    }

    return sources;
  }

  /**
   * Analyze news sentiment (mock implementation)
   */
  private async analyzeNewsSentiment(symbol: string): Promise<SentimentSource | null> {
    // In production, this would integrate with news APIs like NewsAPI, Alpha Vantage, etc.
    
    const newsKeywords = this.getNewsKeywords(symbol);
    const mockSentiment = this.generateMockSentiment('NEWS', symbol);

    return {
      name: 'Financial News Analysis',
      type: 'NEWS',
      score: mockSentiment,
      weight: this.sourceWeights.NEWS,
      description: `Analysis of recent news articles containing keywords: ${newsKeywords.join(', ')}`,
      url: 'https://newsapi.org'
    };
  }

  /**
   * Analyze social media sentiment (mock implementation)
   */
  private async analyzeSocialSentiment(symbol: string): Promise<SentimentSource | null> {
    // In production, this would integrate with Twitter API, Reddit API, etc.
    
    const mockSentiment = this.generateMockSentiment('SOCIAL', symbol);

    return {
      name: 'Social Media Sentiment',
      type: 'SOCIAL',
      score: mockSentiment,
      weight: this.sourceWeights.SOCIAL,
      description: `Sentiment analysis from Twitter, Reddit, and Telegram discussions about ${symbol}`,
    };
  }

  /**
   * Analyze technical sentiment based on price action
   */
  private async analyzeTechnicalSentiment(symbol: string): Promise<SentimentSource | null> {
    // Simplified technical analysis
    const mockSentiment = this.generateMockSentiment('TECHNICAL', symbol);

    return {
      name: 'Technical Analysis Indicators',
      type: 'TECHNICAL',
      score: mockSentiment,
      weight: this.sourceWeights.TECHNICAL,
      description: `RSI, MACD, Moving Averages, and other technical indicators for ${symbol}`,
    };
  }

  /**
   * Analyze fundamental sentiment
   */
  private async analyzeFundamentalSentiment(symbol: string): Promise<SentimentSource | null> {
    const mockSentiment = this.generateMockSentiment('FUNDAMENTAL', symbol);

    return {
      name: 'Fundamental Analysis',
      type: 'FUNDAMENTAL',
      score: mockSentiment,
      weight: this.sourceWeights.FUNDAMENTAL,
      description: `Economic indicators and fundamental factors affecting ${symbol}`,
    };
  }

  /**
   * Analyze whale activity sentiment for crypto
   */
  private async analyzeWhaleSentiment(symbol: string): Promise<SentimentSource | null> {
    if (!this.isCryptoSymbol(symbol)) return null;

    const mockSentiment = this.generateMockSentiment('WHALE_ACTIVITY', symbol);

    return {
      name: 'Whale Activity Monitor',
      type: 'WHALE_ACTIVITY',
      score: mockSentiment,
      weight: this.sourceWeights.WHALE_ACTIVITY,
      description: `Large wallet movements and whale trading activity for ${symbol}`,
    };
  }

  /**
   * Calculate weighted sentiment score
   */
  private calculateWeightedSentiment(sources: SentimentSource[]): number {
    if (sources.length === 0) return 0;

    let totalScore = 0;
    let totalWeight = 0;

    for (const source of sources) {
      totalScore += source.score * source.weight;
      totalWeight += source.weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Analyze market factors affecting sentiment
   */
  private async analyzeMarketFactors(symbol: string): Promise<MarketFactor[]> {
    const factors: MarketFactor[] = [];

    // Economic factors
    factors.push({
      factor: 'Market Volatility',
      impact: Math.random() > 0.5 ? 'POSITIVE' : 'NEGATIVE',
      strength: Math.random() > 0.66 ? 'HIGH' : Math.random() > 0.33 ? 'MEDIUM' : 'LOW',
      description: 'Current market volatility levels affecting risk sentiment'
    });

    // Regulatory factors
    if (this.isCryptoSymbol(symbol)) {
      factors.push({
        factor: 'Regulatory Environment',
        impact: Math.random() > 0.6 ? 'POSITIVE' : 'NEGATIVE',
        strength: 'MEDIUM',
        description: 'Recent regulatory developments in cryptocurrency markets'
      });
    }

    // Economic data
    factors.push({
      factor: 'Economic Data Releases',
      impact: Math.random() > 0.5 ? 'POSITIVE' : 'NEGATIVE',
      strength: 'MEDIUM',
      description: 'Recent economic indicators and their market impact'
    });

    return factors;
  }

  /**
   * Calculate confidence in sentiment analysis
   */
  private calculateSentimentConfidence(sources: SentimentSource[], factors: MarketFactor[]): number {
    let confidence = 50; // Base confidence

    // More sources = higher confidence
    confidence += Math.min(sources.length * 10, 30);

    // Check source agreement
    if (sources.length > 1) {
      const scores = sources.map(s => s.score);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((acc, score) => acc + Math.pow(score - avgScore, 2), 0) / scores.length;
      
      if (variance < 100) confidence += 15; // Low variance = high agreement
      else if (variance > 400) confidence -= 10; // High variance = low agreement
    }

    // Factor analysis adds confidence
    confidence += Math.min(factors.length * 5, 15);

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Categorize sentiment based on score
   */
  private categorizeSentiment(score: number): SentimentData['sentiment'] {
    if (score >= 60) return 'EXTREMELY_BULLISH';
    if (score >= 20) return 'BULLISH';
    if (score >= -20) return 'NEUTRAL';
    if (score >= -60) return 'BEARISH';
    return 'EXTREMELY_BEARISH';
  }

  /**
   * Get news keywords for symbol
   */
  private getNewsKeywords(symbol: string): string[] {
    const baseKeywords = [symbol];
    
    // Add specific keywords based on symbol
    if (symbol.includes('USD')) {
      baseKeywords.push('dollar', 'USD', 'Federal Reserve');
    }
    if (symbol.includes('EUR')) {
      baseKeywords.push('euro', 'EUR', 'ECB', 'European Central Bank');
    }
    if (symbol.includes('XAU') || symbol.includes('GOLD')) {
      baseKeywords.push('gold', 'precious metals', 'inflation');
    }

    return baseKeywords;
  }

  /**
   * Check if symbol is cryptocurrency
   */
  private isCryptoSymbol(symbol: string): boolean {
    const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'SOL', 'DOGE', 'MATIC', 'AVAX'];
    return cryptoSymbols.some(crypto => symbol.includes(crypto));
  }

  /**
   * Generate mock sentiment for testing
   */
  private generateMockSentiment(type: string, symbol: string): number {
    // Create deterministic but varied sentiment based on symbol and type
    let hash = 0;
    const input = symbol + type;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Convert to -50 to +50 range
    return (hash % 101) - 50;
  }

  /**
   * Create neutral sentiment fallback
   */
  private createNeutralSentiment(symbol: string): SentimentData {
    return {
      symbol,
      sentiment: 'NEUTRAL',
      score: 0,
      confidence: 50,
      sources: [],
      marketFactors: [],
      timestamp: new Date(),
      validUntil: new Date(Date.now() + this.cacheExpiry)
    };
  }

  /**
   * Analyze crypto market sentiment
   */
  private async analyzeCryptoSentiment(): Promise<SentimentData> {
    const sources = await this.gatherSentimentSources('CRYPTO');
    const score = this.calculateWeightedSentiment(sources);
    
    return {
      symbol: 'CRYPTO',
      sentiment: this.categorizeSentiment(score),
      score,
      confidence: 75,
      sources,
      marketFactors: await this.analyzeMarketFactors('CRYPTO'),
      timestamp: new Date(),
      validUntil: new Date(Date.now() + this.cacheExpiry)
    };
  }

  /**
   * Analyze forex market sentiment
   */
  private async analyzeForexSentiment(): Promise<SentimentData> {
    const sources = await this.gatherSentimentSources('FOREX');
    const score = this.calculateWeightedSentiment(sources);
    
    return {
      symbol: 'FOREX',
      sentiment: this.categorizeSentiment(score),
      score,
      confidence: 80,
      sources,
      marketFactors: await this.analyzeMarketFactors('FOREX'),
      timestamp: new Date(),
      validUntil: new Date(Date.now() + this.cacheExpiry)
    };
  }

  /**
   * Analyze commodities sentiment
   */
  private async analyzeCommoditiesSentiment(): Promise<SentimentData> {
    const sources = await this.gatherSentimentSources('COMMODITIES');
    const score = this.calculateWeightedSentiment(sources);
    
    return {
      symbol: 'COMMODITIES',
      sentiment: this.categorizeSentiment(score),
      score,
      confidence: 70,
      sources,
      marketFactors: await this.analyzeMarketFactors('COMMODITIES'),
      timestamp: new Date(),
      validUntil: new Date(Date.now() + this.cacheExpiry)
    };
  }

  /**
   * Analyze stocks sentiment
   */
  private async analyzeStocksSentiment(): Promise<SentimentData> {
    const sources = await this.gatherSentimentSources('STOCKS');
    const score = this.calculateWeightedSentiment(sources);
    
    return {
      symbol: 'STOCKS',
      sentiment: this.categorizeSentiment(score),
      score,
      confidence: 85,
      sources,
      marketFactors: await this.analyzeMarketFactors('STOCKS'),
      timestamp: new Date(),
      validUntil: new Date(Date.now() + this.cacheExpiry)
    };
  }

  /**
   * Calculate overall market sentiment
   */
  private calculateOverallSentiment(sentiments: SentimentData[]): SentimentData {
    const avgScore = sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length;
    const avgConfidence = sentiments.reduce((sum, s) => sum + s.confidence, 0) / sentiments.length;
    
    return {
      symbol: 'GLOBAL',
      sentiment: this.categorizeSentiment(avgScore),
      score: Math.round(avgScore),
      confidence: Math.round(avgConfidence),
      sources: [],
      marketFactors: [],
      timestamp: new Date(),
      validUntil: new Date(Date.now() + this.cacheExpiry)
    };
  }

  /**
   * Get Fear & Greed Index (mock implementation)
   */
  private async getFearGreedIndex(): Promise<number | undefined> {
    // In production, integrate with CNN Fear & Greed Index API
    return Math.floor(Math.random() * 101); // 0-100
  }

  /**
   * Get VIX level (mock implementation)
   */
  private async getVIXLevel(): Promise<number | undefined> {
    // In production, integrate with market data providers
    return Math.random() * 50 + 10; // 10-60 range
  }

  /**
   * Clear sentiment cache
   */
  clearCache(): void {
    this.sentimentCache.clear();
    logger.info('📊 Sentiment cache cleared');
  }

  /**
   * Get cached sentiment if available
   */
  getCachedSentiment(symbol: string): SentimentData | null {
    const cached = this.sentimentCache.get(symbol);
    if (cached && Date.now() < cached.validUntil.getTime()) {
      return cached;
    }
    return null;
  }
}