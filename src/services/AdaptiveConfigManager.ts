/**
 * Adaptive Configuration System - Future-Proof Settings Management
 * 
 * This system automatically adjusts trading parameters based on:
 * - Market conditions (volatility, trending/ranging)
 * - Account performance (win rate, drawdown)
 * - Economic calendar events
 * - Broker-specific settings
 * - Real-time market data
 */

import { logger } from '../utils/logger';

export interface MarketConditions {
  volatility: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  trend: 'STRONG_UP' | 'WEAK_UP' | 'SIDEWAYS' | 'WEAK_DOWN' | 'STRONG_DOWN';
  volume: 'LOW' | 'NORMAL' | 'HIGH';
  economicEvents: string[];
  sessionActive: 'ASIAN' | 'EUROPEAN' | 'AMERICAN' | 'OVERLAP';
}

export interface PerformanceMetrics {
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  averageWin: number;
  averageLoss: number;
  consecutiveLosses: number;
  totalTrades: number;
}

export interface AdaptiveSettings {
  riskPercentage: number;
  maxPositions: number;
  confidenceThreshold: number;
  stopLossMultiplier: number;
  takeProfitMultiplier: number;
  lotSizeMultiplier: number;
  pauseTrading: boolean;
  reasonForPause?: string;
}

/**
 * Manages trading settings that adapt to changing conditions
 */
export class AdaptiveConfigManager {
  private currentSettings: AdaptiveSettings;
  private baseSettings: AdaptiveSettings;
  private lastUpdate: Date;
  private performanceHistory: PerformanceMetrics[] = [];

  constructor() {
    this.baseSettings = this.getDefaultSettings();
    this.currentSettings = { ...this.baseSettings };
    this.lastUpdate = new Date();
  }

  /**
   * Get current adaptive settings based on all factors
   */
  async getCurrentSettings(
    symbol: string,
    marketConditions: MarketConditions,
    currentPerformance: PerformanceMetrics
  ): Promise<AdaptiveSettings> {
    logger.info('🎛️ Calculating adaptive settings...');

    // Start with base settings
    let adaptedSettings = { ...this.baseSettings };

    // Adjust for market conditions
    adaptedSettings = this.adjustForMarketConditions(adaptedSettings, marketConditions);

    // Adjust for performance
    adaptedSettings = this.adjustForPerformance(adaptedSettings, currentPerformance);

    // Adjust for symbol-specific factors
    adaptedSettings = this.adjustForSymbol(adaptedSettings, symbol);

    // Apply safety limits
    adaptedSettings = this.applySafetyLimits(adaptedSettings);

    this.currentSettings = adaptedSettings;
    this.logSettingsChange(adaptedSettings);

    return adaptedSettings;
  }

  /**
   * Adjust settings based on market volatility and conditions
   */
  private adjustForMarketConditions(
    settings: AdaptiveSettings,
    conditions: MarketConditions
  ): AdaptiveSettings {
    logger.info(`📊 Adjusting for market conditions: ${conditions.volatility}, ${conditions.trend}`);

    // Volatility adjustments
    switch (conditions.volatility) {
      case 'LOW':
        settings.riskPercentage *= 1.2; // Increase risk in low volatility
        settings.maxPositions += 1;
        settings.stopLossMultiplier *= 0.8; // Tighter stops
        break;
      
      case 'HIGH':
        settings.riskPercentage *= 0.7; // Reduce risk in high volatility
        settings.maxPositions = Math.max(1, settings.maxPositions - 1);
        settings.stopLossMultiplier *= 1.3; // Wider stops
        break;
      
      case 'EXTREME':
        settings.riskPercentage *= 0.5; // Halve risk in extreme volatility
        settings.maxPositions = 1; // Only one position at a time
        settings.confidenceThreshold += 0.1; // Require higher confidence
        settings.stopLossMultiplier *= 1.5; // Much wider stops
        break;
    }

    // Trend adjustments
    if (conditions.trend === 'SIDEWAYS') {
      settings.takeProfitMultiplier *= 0.8; // Take profits quicker in ranging markets
      settings.confidenceThreshold += 0.05; // Be more selective
    } else if (conditions.trend.includes('STRONG')) {
      settings.takeProfitMultiplier *= 1.3; // Let profits run in strong trends
    }

    // Economic events pause trading
    if (conditions.economicEvents.some(event => event.includes('HIGH_IMPACT'))) {
      settings.pauseTrading = true;
      settings.reasonForPause = 'High impact economic events scheduled';
    }

    return settings;
  }

  /**
   * Adjust settings based on recent trading performance
   */
  private adjustForPerformance(
    settings: AdaptiveSettings,
    performance: PerformanceMetrics
  ): AdaptiveSettings {
    logger.info(`📈 Adjusting for performance: ${performance.winRate}% win rate, ${performance.consecutiveLosses} losses`);

    // Poor performance adjustments
    if (performance.winRate < 40 && performance.totalTrades > 10) {
      settings.riskPercentage *= 0.6; // Reduce risk when losing
      settings.confidenceThreshold += 0.15; // Be much more selective
      settings.maxPositions = Math.max(1, settings.maxPositions - 1);
      logger.warn('⚠️ Poor performance detected - reducing risk and selectivity');
    }

    // Consecutive losses protection
    if (performance.consecutiveLosses >= 3) {
      settings.riskPercentage *= 0.5; // Halve risk after 3 consecutive losses
      settings.confidenceThreshold += 0.1;
      logger.warn('⚠️ 3+ consecutive losses - implementing protective measures');
    }

    if (performance.consecutiveLosses >= 5) {
      settings.pauseTrading = true;
      settings.reasonForPause = '5 consecutive losses - manual review required';
      logger.error('🛑 5 consecutive losses - pausing trading');
    }

    // High drawdown protection
    if (performance.maxDrawdown > 10) { // 10% drawdown
      settings.riskPercentage *= 0.4; // Drastically reduce risk
      settings.maxPositions = 1;
      settings.confidenceThreshold += 0.2;
      logger.error('🛑 High drawdown detected - implementing emergency risk reduction');
    }

    // Good performance rewards
    if (performance.winRate > 70 && performance.totalTrades > 20) {
      settings.riskPercentage *= 1.1; // Slightly increase risk when doing well
      settings.maxPositions += 1;
      logger.info('✅ Good performance - slight risk increase');
    }

    return settings;
  }

  /**
   * Symbol-specific adjustments
   */
  private adjustForSymbol(settings: AdaptiveSettings, symbol: string): AdaptiveSettings {
    logger.info(`🎯 Applying symbol-specific adjustments for ${symbol}`);

    if (symbol.includes('BTC') || symbol.includes('ETH')) {
      // Crypto adjustments
      settings.riskPercentage *= 0.8; // Reduce risk for volatile crypto
      settings.stopLossMultiplier *= 1.2; // Wider stops for crypto volatility
      settings.confidenceThreshold += 0.05; // Be more selective with crypto
    } else if (symbol.includes('XAU')) {
      // Gold adjustments
      settings.takeProfitMultiplier *= 1.1; // Gold trends well
    } else if (symbol.includes('JPY')) {
      // JPY pairs adjustments
      settings.stopLossMultiplier *= 1.1; // Slightly wider stops for JPY volatility
    }

    return settings;
  }

  /**
   * Apply safety limits to prevent dangerous settings
   */
  private applySafetyLimits(settings: AdaptiveSettings): AdaptiveSettings {
    // Hard limits for safety
    settings.riskPercentage = Math.max(0.1, Math.min(3.0, settings.riskPercentage)); // 0.1% - 3%
    settings.maxPositions = Math.max(1, Math.min(5, settings.maxPositions)); // 1-5 positions
    settings.confidenceThreshold = Math.max(0.5, Math.min(0.95, settings.confidenceThreshold)); // 50%-95%
    settings.stopLossMultiplier = Math.max(0.5, Math.min(3.0, settings.stopLossMultiplier)); // 0.5x-3x
    settings.takeProfitMultiplier = Math.max(0.5, Math.min(5.0, settings.takeProfitMultiplier)); // 0.5x-5x
    settings.lotSizeMultiplier = Math.max(0.1, Math.min(2.0, settings.lotSizeMultiplier)); // 0.1x-2x

    return settings;
  }

  /**
   * Get market conditions from various sources
   */
  async analyzeMarketConditions(symbol: string): Promise<MarketConditions> {
    // This would integrate with market data providers
    // For now, return placeholder data
    return {
      volatility: 'MEDIUM',
      trend: 'SIDEWAYS',
      volume: 'NORMAL',
      economicEvents: [],
      sessionActive: this.getCurrentTradingSession()
    };
  }

  /**
   * Get current trading session
   */
  private getCurrentTradingSession(): 'ASIAN' | 'EUROPEAN' | 'AMERICAN' | 'OVERLAP' {
    const now = new Date();
    const utcHour = now.getUTCHours();

    if (utcHour >= 0 && utcHour < 7) return 'ASIAN';
    if (utcHour >= 7 && utcHour < 15) return 'EUROPEAN';
    if (utcHour >= 15 && utcHour < 22) return 'AMERICAN';
    return 'OVERLAP';
  }

  /**
   * Log significant settings changes
   */
  private logSettingsChange(newSettings: AdaptiveSettings): void {
    const changes: string[] = [];
    
    if (Math.abs(newSettings.riskPercentage - this.baseSettings.riskPercentage) > 0.1) {
      changes.push(`Risk: ${this.baseSettings.riskPercentage}% → ${newSettings.riskPercentage.toFixed(1)}%`);
    }
    
    if (newSettings.maxPositions !== this.baseSettings.maxPositions) {
      changes.push(`Max Positions: ${this.baseSettings.maxPositions} → ${newSettings.maxPositions}`);
    }
    
    if (newSettings.pauseTrading) {
      changes.push(`Trading PAUSED: ${newSettings.reasonForPause}`);
    }

    if (changes.length > 0) {
      logger.info(`🎛️ Settings adapted: ${changes.join(', ')}`);
    }
  }

  /**
   * Default conservative settings
   */
  private getDefaultSettings(): AdaptiveSettings {
    return {
      riskPercentage: 1.0,      // 1% base risk
      maxPositions: 3,          // Max 3 simultaneous positions
      confidenceThreshold: 0.7, // 70% minimum confidence
      stopLossMultiplier: 1.0,  // Standard stop loss calculation
      takeProfitMultiplier: 1.5, // 1.5:1 reward ratio
      lotSizeMultiplier: 1.0,   // Standard lot size
      pauseTrading: false
    };
  }

  /**
   * Save performance metrics for trend analysis
   */
  addPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.performanceHistory.push({
      ...metrics,
      timestamp: Date.now()
    } as any);

    // Keep only last 100 records
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }

  /**
   * Get performance trend analysis
   */
  getPerformanceTrend(): 'IMPROVING' | 'STABLE' | 'DECLINING' {
    if (this.performanceHistory.length < 10) return 'STABLE';

    const recent = this.performanceHistory.slice(-5);
    const older = this.performanceHistory.slice(-10, -5);

    const recentAvg = recent.reduce((sum, p) => sum + p.winRate, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.winRate, 0) / older.length;

    if (recentAvg > olderAvg + 5) return 'IMPROVING';
    if (recentAvg < olderAvg - 5) return 'DECLINING';
    return 'STABLE';
  }
}