/**
 * 🎨 PRODUCTION COLOR ML INTEGRATION
 * This file shows how to integrate Color Analysis ML into your live bot
 */

import { TradeSignal } from '../types';
import { ChartColorAnalysisML } from './colorAnalysisML';
import { logger } from '../utils/logger';

export class ProductionMLIntegration {
  
  /**
   * 🎯 Main integration point - call this in your bot's message handler
   */
  static async enhanceTradeSignal(
    originalSignal: TradeSignal | null,
    ocrText: string,
    caption?: string
  ): Promise<TradeSignal | null> {
    
    try {
      // If original parser already found a good signal, enhance it
      if (originalSignal) {
        logger.info('🔍 Enhancing existing signal with Color ML analysis');
        return await this.addColorAnalysisInsights(originalSignal, ocrText);
      }
      
      // If no signal found, try Color ML as fallback
      logger.info('🎨 Attempting Color ML as primary parsing method');
      return await this.tryColorMLParsing(ocrText, caption);
      
    } catch (error) {
      logger.error('❌ Production ML Integration error:', error);
      return originalSignal; // Return original signal if ML fails
    }
  }
  
  /**
   * 🎨 Try Color ML parsing when standard parsing fails
   */
  private static async tryColorMLParsing(
    text: string, 
    caption?: string
  ): Promise<TradeSignal | null> {
    
    const colorAnalysis = ChartColorAnalysisML.analyzeChartColors(text, 'UNKNOWN');
    
    if (!colorAnalysis.greyEntry || colorAnalysis.recommendation.confidence < 0.7) {
      logger.info('🎨 Color ML: Insufficient confidence for signal generation');
      return null;
    }
    
    // Estimate symbol from price patterns and caption
    const symbol = this.estimateSymbolFromContext(text, caption);
    
    // Build signal from color analysis using ACTUAL CHART LEVELS (new method)
    const chartLevels = ChartColorAnalysisML.applyActualChartLevels(colorAnalysis);
    
    if (!chartLevels) {
      logger.warn('⚠️  Could not extract actual chart levels from color analysis');
      return null;
    }
    
    // Handle nullable stop loss - use chart level or calculate fallback
    const stopLoss = chartLevels.stopLoss ?? (
      chartLevels.action === 'BUY' ? 
        chartLevels.entryZone.min - (chartLevels.entryZone.min * 0.01) : 
        chartLevels.entryZone.max + (chartLevels.entryZone.max * 0.01)
    );
    
    // Use the enhanced method that focuses on highlighted chart scale prices
    const signal: TradeSignal = {
      symbol,
      action: chartLevels.action,
      entryZone: chartLevels.entryZone,
      stopLoss,
      targets: chartLevels.targets, // Use actual highlighted targets from chart
      reason: `🎨 Enhanced Color ML: Using actual chart highlighted levels (${Math.round(chartLevels.confidence * 100)}% confidence)`,
      plan: `Chart highlighting analysis - Entry: ${chartLevels.entryZone.min.toFixed(4)}-${chartLevels.entryZone.max.toFixed(4)}${chartLevels.riskReward ? `, R:R ${chartLevels.riskReward.toFixed(1)}:1` : ''} from highlighted scale`
    };
    
    logger.info('✅ Enhanced Color ML generated signal from highlighted chart levels:', {
      symbol: signal.symbol,
      action: signal.action,
      confidence: Math.round(chartLevels.confidence * 100),
      targets: chartLevels.targets.length,
      actualRR: chartLevels.riskReward?.toFixed(1) || 'N/A',
      highlightedStop: chartLevels.stopLoss !== null
    });
    
    return signal;
  }
  
  /**
   * 📊 Add Color ML insights to existing signal (with chart priority!)
   */
  private static async addColorAnalysisInsights(
    signal: TradeSignal,
    text: string
  ): Promise<TradeSignal> {
    
    const colorAnalysis = ChartColorAnalysisML.analyzeChartColors(text, signal.symbol);
    
    // 🎯 CHART PRIORITY: If chart analysis detected specific entry prices, use them!
    if (colorAnalysis.greyEntry && colorAnalysis.recommendation.confidence >= 0.7) {
      
      // Check if we have a specific entry price from chart highlighting
      const chartEntryPrice = this.extractSpecificEntryFromChart(colorAnalysis);
      
      if (chartEntryPrice) {
        logger.info(`🎯 CHART OVERRIDE: Using chart-detected entry price ${chartEntryPrice} instead of text range ${signal.entryZone.min}-${signal.entryZone.max}`);
        
        return {
          ...signal,
          // Keep original entry zone for validation, but set specific entry price
          entryPrice: chartEntryPrice,
          orderType: 'LIMIT', // Chart-specific entries should use limit orders
          reason: `Chart Priority: Entry ${chartEntryPrice} from highlighted chart scale (${Math.round(colorAnalysis.recommendation.confidence * 100)}% confidence)`,
          plan: `Chart-detected entry overrides text range. Using precise level: ${chartEntryPrice}`
        };
      }
    }
    
    // Fallback: Just add ML insights to existing signal
    const mlInsight = `ML Analysis: ${Math.round(colorAnalysis.recommendation.confidence * 100)}% confidence, ${colorAnalysis.recommendation.action} bias`;
    
    return {
      ...signal,
      reason: `${signal.reason} | ${mlInsight}`,
      plan: signal.plan ? `${signal.plan} | Color ML: ${colorAnalysis.greyEntry ? 'Entry zones detected' : 'No clear zones'}` : undefined
    };
  }
  
  /**
   * 🔍 Extract specific entry price from chart analysis (improved logic)
   */
  private static extractSpecificEntryFromChart(colorAnalysis: any): number | null {
    // Check if grey entry zone exists
    if (!colorAnalysis.greyEntry) {
      return null;
    }
    
    const entryMin = colorAnalysis.greyEntry.min || 0;
    const entryMax = colorAnalysis.greyEntry.max || 0;
    
    logger.info(`🎨 Chart analysis found grey entry zone: ${entryMin} - ${entryMax}`);
    
    // Case 1: Exact match (min === max) - this is a specific highlighted price
    if (entryMin === entryMax && entryMin > 0) {
      logger.info(`✅ Found specific chart-highlighted entry price: ${entryMin}`);
      return entryMin;
    }
    
    // Case 2: Very narrow range (< 0.1% of price) - treat as specific price
    if (entryMin > 0 && entryMax > 0) {
      const rangePct = Math.abs(entryMax - entryMin) / ((entryMin + entryMax) / 2);
      if (rangePct < 0.001) { // Less than 0.1%
        const specificPrice = (entryMin + entryMax) / 2;
        logger.info(`✅ Found narrow chart range (${rangePct.toFixed(4)}%), using mid-point: ${specificPrice}`);
        return specificPrice;
      }
    }
    
    // Case 3: Enhanced logic - Don't use higher value if it conflicts with targets
    if (entryMin > 0 && entryMax > entryMin) {
      // Check if we have targets that would conflict with using entryMax
      const targets = colorAnalysis.greenTargets || [];
      
      // If entryMax matches any target, use entryMin instead
      const entryMaxMatchesTarget = targets.some((target: number) => Math.abs(target - entryMax) < 1);
      
      if (entryMaxMatchesTarget) {
        logger.info(`🔧 Entry max (${entryMax}) matches target - using entry min (${entryMin}) instead`);
        return entryMin;
      }
      
      // Original logic: For BUY signals, use higher value (resistance turned support)
      logger.info(`📊 Chart shows entry range ${entryMin}-${entryMax}, using higher value as specific entry`);
      return entryMax; // For your case: 3453 instead of 3441
    }
    
    return null;
  }
  
  /**
   * 🔍 Smart symbol estimation from context
   */
  private static estimateSymbolFromContext(text: string, caption?: string): string {
    // Check caption first for explicit symbols
    if (caption) {
      const symbolMatch = caption.match(/#([A-Z]{6}|[A-Z]{3}USD|NAS100|SPX500|US30)/i);
      if (symbolMatch) return symbolMatch[1].toUpperCase();
    }
    
    // Check text for symbol patterns
    if (/gold|xauusd|xau/i.test(text)) return 'XAUUSD';
    if (/silver|xagusd|xag/i.test(text)) return 'XAGUSD';
    if (/eurusd|eur.*usd/i.test(text)) return 'EURUSD';
    if (/eurcad|eur.*cad/i.test(text)) return 'EURCAD';
    if (/gbpusd|gbp.*usd/i.test(text)) return 'GBPUSD';
    if (/nas100|nasdaq/i.test(text)) return 'NAS100';
    if (/spx500|s&p/i.test(text)) return 'SPX500';
    if (/us30|dow/i.test(text)) return 'US30';
    
    // Price-based estimation
    const prices = text.match(/\b\d{3,5}\.?\d*\b/g);
    if (prices) {
      const numPrices = prices.map(p => parseFloat(p)).filter(p => p > 0);
      const maxPrice = Math.max(...numPrices);
      
      if (maxPrice > 10000) return 'NAS100';
      if (maxPrice > 5000) return 'SPX500';
      if (maxPrice > 2000) return 'XAUUSD';
      if (maxPrice < 2 && maxPrice > 0.5) return 'EURUSD';
      if (maxPrice < 10 && maxPrice > 1) return 'EURCAD';
    }
    
    return 'XAUUSD'; // Default fallback
  }
  
  /**
   * 🚨 Risk assessment for production trading
   */
  static assessSignalRisk(signal: TradeSignal, text: string): {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    shouldTrade: boolean;
    warnings: string[];
    recommendation: string;
  } {
    const warnings: string[] = [];
    let riskScore = 0;
    
    // Check for high-risk conditions
    if (!signal.stopLoss) {
      warnings.push('❌ No stop loss defined - CRITICAL RISK');
      riskScore += 3;
    }
    
    if (signal.targets.length === 0) {
      warnings.push('⚠️ No targets defined');
      riskScore += 1;
    }
    
    if (/news|nfp|fomc|fed|ecb|boe/i.test(text)) {
      warnings.push('📰 Major news event risk detected');
      riskScore += 2;
    }
    
    if (/volatile|uncertain|unclear/i.test(text)) {
      warnings.push('📈 High volatility mentioned');
      riskScore += 1;
    }
    
    // Determine risk level and trading decision
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    let shouldTrade = true;
    let recommendation: string;
    
    if (riskScore === 0) {
      riskLevel = 'LOW';
      recommendation = '✅ Good to trade with standard position size';
    } else if (riskScore <= 2) {
      riskLevel = 'MEDIUM';
      recommendation = '⚠️ Consider reducing position size by 50%';
    } else {
      riskLevel = 'HIGH';
      shouldTrade = false;
      recommendation = '🚨 HIGH RISK - Do not trade or use minimal size for testing';
    }
    
    return { riskLevel, shouldTrade, warnings, recommendation };
  }
}

// 🚀 EASY INTEGRATION EXAMPLE:
/*
// In your photoHandler.ts or messageHandler.ts:

import { ProductionMLIntegration } from '../ml/productionIntegration';

// Inside your message processing function:
const originalSignal = await this.tradeParser.parseTradeSignal(ocrText, caption);
const enhancedSignal = await ProductionMLIntegration.enhanceTradeSignal(originalSignal, ocrText, caption);

if (enhancedSignal) {
  const riskAssessment = ProductionMLIntegration.assessSignalRisk(enhancedSignal, ocrText);
  
  if (riskAssessment.shouldTrade) {
    logger.info('🎯 Trading signal approved:', enhancedSignal);
    // Proceed with trade execution
  } else {
    logger.warn('🚨 Signal rejected due to high risk:', riskAssessment.warnings);
  }
}
*/
