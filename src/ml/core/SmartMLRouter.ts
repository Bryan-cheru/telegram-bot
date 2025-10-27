import { logger } from '../../utils/logger';
import { TradeSignal, TradeAction } from '../../types';
import { ChartColorAnalysisML } from '../colorAnalysisML';
import { VisualChartAnalysisML } from '../visualChartAnalysisML';
import { PriceExtractorML } from './PriceExtractorML';
import { SymbolParser, ValidationService, FormatService } from '../../shared';

/**
 * Smart ML Router - Intelligently routes signals to appropriate analysis
 * 95% of signals → Fast text analysis
 * 5% of signals → Complex visual analysis
 * 
 * Eliminates performance waste from running full computer vision on simple text signals
 */
export class SmartMLRouter {

  /**
   * Main routing method - decides which ML analysis to use
   */
  static async analyzeSignal(
    text: string,
    caption?: string,
    imageBuffer?: Buffer
  ): Promise<TradeSignal | null> {
    
    const analysisRoute = this.determineAnalysisRoute(text, !!imageBuffer, caption);
    
    logger.info(`🧠 ML Router: ${analysisRoute.route} analysis (${analysisRoute.reason})`);
    
    switch (analysisRoute.route) {
      case 'FAST_TEXT':
        return await this.fastTextAnalysis(text, caption);
        
      case 'ENHANCED_COLOR':
        return await this.enhancedColorAnalysis(text, caption);
        
      case 'FULL_VISUAL':
        return await this.fullVisualAnalysis(text, imageBuffer!, caption);
        
      default:
        logger.warn('⚠️  Unknown analysis route, falling back to text analysis');
        return await this.fastTextAnalysis(text, caption);
    }
  }

  /**
   * Intelligent routing decision based on signal characteristics
   */
  private static determineAnalysisRoute(
    text: string,
    hasImage: boolean,
    caption?: string
  ): { route: 'FAST_TEXT' | 'ENHANCED_COLOR' | 'FULL_VISUAL'; reason: string; confidence: number } {
    
    const fullText = caption ? `${text}\n${caption}` : text;
    
    // Route 1: FULL_VISUAL for any image with minimal text content
    // If there's an image but no explicit prices/levels, use visual analysis
    if (hasImage) {
      const hasExplicitPrices = /\b\d{4,5}\.?\d{0,3}\b/g.test(fullText);
      const hasTradeAction = /\b(buy|sell|long|short)\b/i.test(fullText);
      
      // Use full visual analysis if:
      // 1. Has complex visual indicators, OR
      // 2. Has image but lacks explicit trading parameters (aggressive mode)
      if (this.needsFullVisualAnalysis(fullText) || (!hasExplicitPrices && !hasTradeAction)) {
        return {
          route: 'FULL_VISUAL',
          reason: hasExplicitPrices ? 'Complex visual elements detected' : 'Image with minimal text - analyzing chart visually',
          confidence: 0.9
        };
      }
    }
    
    // Route 2: ENHANCED_COLOR (25% of signals)
    // For signals with multiple price levels or color references
    if (this.needsColorAnalysis(fullText)) {
      return {
        route: 'ENHANCED_COLOR',
        reason: 'Multiple price levels or color context detected',
        confidence: 0.8
      };
    }
    
    // Route 3: FAST_TEXT (70% of signals)
    // For simple text-based signals
    return {
      route: 'FAST_TEXT',
      reason: 'Simple text signal - fast processing sufficient',
      confidence: 0.7
    };
  }

  /**
   * Check if signal needs full visual analysis (complex computer vision)
   */
  private static needsFullVisualAnalysis(text: string): boolean {
    const visualIndicators = [
      'highlighted',
      'colored',
      'marked in',
      'visual',
      'chart shows',
      'see chart',
      'as shown',
      'image analysis',
      'pixel',
      'color coded'
    ];
    
    const complexityIndicators = [
      'multiple zones',
      'various levels',
      'different colors',
      'complex setup',
      'advanced analysis'
    ];
    
    const hasVisualIndicators = visualIndicators.some(indicator =>
      text.toLowerCase().includes(indicator)
    );
    
    const hasComplexity = complexityIndicators.some(indicator =>
      text.toLowerCase().includes(indicator)
    );
    
    // Need full visual analysis if has visual indicators AND complexity
    return hasVisualIndicators && hasComplexity;
  }

  /**
   * Check if signal needs enhanced color analysis
   */
  private static needsColorAnalysis(text: string): boolean {
    const colorKeywords = [
      'grey', 'gray', 'green', 'red',
      'entry zone', 'target', 'stop',
      'highlighted', 'marked',
      'resistance', 'support'
    ];
    
    const priceCount = (text.match(/\b\d{4,5}\.?\d{0,3}\b/g) || []).length;
    const colorMentions = colorKeywords.filter(keyword =>
      text.toLowerCase().includes(keyword)
    ).length;
    
    // Need color analysis if multiple prices OR color mentions
    return priceCount >= 3 || colorMentions >= 2;
  }

  /**
   * Fast text analysis (70% of signals)
   * Basic pattern matching and context analysis
   */
  private static async fastTextAnalysis(
    text: string,
    caption?: string
  ): Promise<TradeSignal | null> {
    
    logger.debug('⚡ Running fast text analysis...');
    
    try {
      // Use enhanced color analysis but with fast mode
      const analysis = ChartColorAnalysisML.analyzeChartColors(text, 'UNKNOWN');
      
      if (analysis.greyEntry && analysis.recommendation.confidence > 0.6) {
        const result = this.buildSignalFromAnalysis(analysis, text, caption);
        if (result) {
          result.reason = `Fast ML Analysis: ${result.reason}`;
          return result;
        }
      }
      
      logger.debug('❌ Fast text analysis: insufficient confidence');
      return null;
      
    } catch (error) {
      logger.error('❌ Fast text analysis failed:', error);
      return null;
    }
  }

  /**
   * Enhanced color analysis (25% of signals)
   * Detailed price extraction and zone analysis
   */
  private static async enhancedColorAnalysis(
    text: string,
    caption?: string
  ): Promise<TradeSignal | null> {
    
    logger.debug('🎨 Running enhanced color analysis...');
    
    try {
      // Try to extract symbol from caption for better analysis
      const symbol = SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
      
      const analysis = ChartColorAnalysisML.analyzeChartColors(text, symbol);
      
      if (analysis.greyEntry && analysis.recommendation.confidence > 0.7) {
        const result = this.buildSignalFromAnalysis(analysis, text, caption);
        if (result) {
          result.reason = `Enhanced Color ML: ${result.reason}`;
          result.confidence = Math.min((result.confidence || 0.8) + 0.1, 1.0);
          return result;
        }
      }
      
      logger.debug('❌ Enhanced color analysis: insufficient confidence');
      return null;
      
    } catch (error) {
      logger.error('❌ Enhanced color analysis failed:', error);
      return null;
    }
  }

  /**
   * Full visual analysis (5% of signals)
   * Complete computer vision processing
   */
  private static async fullVisualAnalysis(
    text: string,
    imageBuffer: Buffer,
    caption?: string
  ): Promise<TradeSignal | null> {
    
    logger.debug('🔍 Running full visual analysis...');
    
    try {
      const visualML = new VisualChartAnalysisML();
      const mlResult = await visualML.analyzeChartImage(imageBuffer);
      
      if (mlResult.confidence > 0.7 && mlResult.greyEntryZones.length > 0) {
        // Convert ML result to trading signal
        // 🎯 FIX: Instead of averaging ALL grey zones, use the MOST PROMINENT one
        // Sort grey zones by confidence and use the highest confidence zone as entry
        const sortedGreyZones = [...mlResult.greyEntryZones].sort((a, b) => b.confidence - a.confidence);
        const mostProminentZone = sortedGreyZones[0];
        
        logger.info(`🎯 Using most prominent grey zone: ${mostProminentZone.price.toFixed(5)} (confidence: ${mostProminentZone.confidence.toFixed(2)})`);
        logger.info(`📊 Total grey zones detected: ${mlResult.greyEntryZones.length}, ignoring ${mlResult.greyEntryZones.length - 1} lower confidence zones`);
        
        // Create a small range around the most prominent price (grey-highlighted current price)
        const entryPrice = mostProminentZone.price;
        const zoneSize = entryPrice * 0.001; // 0.1% zone around detected price
        const entryZone = {
          min: entryPrice - zoneSize,
          max: entryPrice + zoneSize
        };
        
        logger.info(`✅ Entry zone set to: ${entryZone.min.toFixed(5)} - ${entryZone.max.toFixed(5)} (centered on ${entryPrice.toFixed(5)})`);
      
        
        // 🚨 FIX: Ensure stop loss and targets are properly positioned
        const avgEntry = (entryZone.min + entryZone.max) / 2;
        
        // Use ColorAnalysisML for direction if VisualML didn't provide one
        let direction: 'BUY' | 'SELL' = mlResult.direction || 'BUY'; // Default to BUY
        if (!mlResult.direction) {
          // Extract OCR text for color analysis if needed
          const ocrText = text || '';
          const colorAnalysis = ChartColorAnalysisML.analyzeChartColors(ocrText, mlResult.symbol || 'UNKNOWN');
          if (colorAnalysis.recommendation.action !== 'HOLD') {
            direction = colorAnalysis.recommendation.action;
            logger.info(`🎯 Using ColorAnalysisML direction: ${direction} (confidence: ${colorAnalysis.recommendation.confidence.toFixed(2)}) - ${colorAnalysis.recommendation.reason}`);
          }
        }
        
        // Get symbol early for SL/TP calculations
        const symbol = mlResult.symbol || SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
        
        let stopLoss: number;
        let targets: number[];
        
        if (mlResult.redStopZones.length > 0) {
          stopLoss = mlResult.redStopZones[0].price;
        } else {
          stopLoss = this.calculateStopLoss(entryZone, direction, symbol);
        }
        
        if (mlResult.greenTargetZones.length > 0) {
          targets = mlResult.greenTargetZones.map(z => z.price);
        } else {
          targets = this.calculateTargets(entryZone, direction, symbol);
        }
        
        // 🔧 VALIDATION: Ensure stop loss and targets make logical sense
        if (direction === 'SELL') {
          // For SELL: stop loss should be ABOVE entry, targets should be BELOW entry
          if (stopLoss <= avgEntry) {
            // Recalculate using new method
            stopLoss = this.calculateStopLoss(entryZone, direction, symbol);
            logger.warn(`⚠️ Adjusting SELL stop loss to ${stopLoss} ($1000 risk with 0.65 lots)`);
          }
          
          // Ensure targets are below entry
          targets = targets.filter(t => t < avgEntry);
          if (targets.length === 0) {
            // Use new calculation method
            targets = this.calculateTargets(entryZone, direction, symbol);
            logger.warn(`⚠️ No valid SELL targets, creating target at ${targets[0]} ($1500 profit with 0.65 lots)`);
          }
        } else {
          // For BUY: stop loss should be BELOW entry, targets should be ABOVE entry  
          if (stopLoss >= avgEntry) {
            // Recalculate using new method
            stopLoss = this.calculateStopLoss(entryZone, direction, symbol);
            logger.warn(`⚠️ Adjusting BUY stop loss to ${stopLoss} ($1000 risk with 0.65 lots)`);
          }
          
          // Ensure targets are above entry
          targets = targets.filter(t => t > avgEntry);
          if (targets.length === 0) {
            // Use new calculation method
            targets = this.calculateTargets(entryZone, direction, symbol);
            logger.warn(`⚠️ No valid BUY targets, creating target at ${targets[0]} ($1500 profit with 0.65 lots)`);
          }
        }

        // Format all prices for the detected instrument (especially important for JPY pairs)
        const formattedEntryZone = {
          min: this.formatPriceForInstrument(entryZone.min, symbol),
          max: this.formatPriceForInstrument(entryZone.max, symbol)
        };
        const formattedStopLoss = this.formatPriceForInstrument(stopLoss, symbol);
        const formattedTargets = targets.map(target => this.formatPriceForInstrument(target, symbol));

        return {
          symbol,
          action: mlResult.direction || 'BUY',
          entryZone: formattedEntryZone,
          stopLoss: formattedStopLoss,
          targets: formattedTargets,
          orderType: 'LIMIT',
          reason: `Full Visual ML Analysis (${(mlResult.confidence * 100).toFixed(1)}% confidence)`,
          plan: `Advanced computer vision analysis with ML-detected zones`,
          confidence: mlResult.confidence
        };
      }
      
      logger.debug('❌ Full visual analysis: insufficient confidence');
      return null;
      
    } catch (error) {
      logger.error('❌ Full visual analysis failed:', error);
      return null;
    }
  }

  /**
   * Calculate stop loss based on fixed risk amount ($1000) and lot size (0.65)
   */
  private static calculateStopLoss(entryZone: { min: number; max: number }, direction: string, symbol?: string): number {
    const avgEntry = (entryZone.min + entryZone.max) / 2;
    
    // Get configuration from environment
    const fixedLotSize = parseFloat(process.env.FIXED_LOT_SIZE || '0.65');
    const fixedRiskAmount = parseFloat(process.env.FIXED_RISK_AMOUNT || '1000');
    
    // Calculate pip value per lot for different instruments
    let pipValue: number;
    let pipSize: number;
    
    const symbolUpper = (symbol || '').toUpperCase();
    
    if (symbolUpper.includes('XAU')) {
      // Gold: $1 per point per lot, pip size = 0.01
      pipValue = 1.0;
      pipSize = 0.01;
    } else if (symbolUpper.includes('XAG')) {
      // Silver: $0.50 per point per lot, pip size = 0.01
      pipValue = 0.5;
      pipSize = 0.01;
    } else if (symbolUpper.includes('JPY')) {
      // JPY pairs: $10 per pip per lot, pip size = 0.01
      pipValue = 10.0;
      pipSize = 0.01;
    } else {
      // Forex majors: $10 per pip per lot, pip size = 0.0001
      pipValue = 10.0;
      pipSize = 0.0001;
    }
    
    // Calculate pip distance needed for fixed risk amount
    // Formula: Risk $ = Pip Value × Lots × Distance (in pips)
    // Rearranged: Distance (pips) = Risk $ / (Pip Value × Lots)
    const stopDistanceInPips = fixedRiskAmount / (pipValue * fixedLotSize);
    
    // Convert pip distance to actual price distance
    const stopDistance = stopDistanceInPips * pipSize;
    
    logger.info(`📏 Calculated SL distance for ${symbol}: ${stopDistance.toFixed(5)} (${stopDistanceInPips.toFixed(2)} pips) for $${fixedRiskAmount} risk with ${fixedLotSize} lots`);
    
    return direction === 'BUY' ? avgEntry - stopDistance : avgEntry + stopDistance;
  }

  /**
   * Calculate targets based on fixed $1500 profit target with configured lot size
   */
  private static calculateTargets(entryZone: { min: number; max: number }, direction: string, symbol?: string): number[] {
    const avgEntry = (entryZone.min + entryZone.max) / 2;
    
    // Get configuration from environment
    const fixedLotSize = parseFloat(process.env.FIXED_LOT_SIZE || '0.65');
    const fixedRewardAmount = parseFloat(process.env.FIXED_RISK_AMOUNT || '1000') * parseFloat(process.env.RISK_REWARD_RATIO || '1.5');
    
    // Calculate pip value per lot for different instruments
    let pipValue: number;
    let pipSize: number;
    
    const symbolUpper = (symbol || '').toUpperCase();
    
    if (symbolUpper.includes('XAU')) {
      // Gold: $1 per point per lot, pip size = 0.01
      pipValue = 1.0;
      pipSize = 0.01;
    } else if (symbolUpper.includes('XAG')) {
      // Silver: $0.50 per point per lot, pip size = 0.01
      pipValue = 0.5;
      pipSize = 0.01;
    } else if (symbolUpper.includes('JPY')) {
      // JPY pairs: $10 per pip per lot, pip size = 0.01
      pipValue = 10.0;
      pipSize = 0.01;
    } else {
      // Forex majors: $10 per pip per lot, pip size = 0.0001
      pipValue = 10.0;
      pipSize = 0.0001;
    }
    
    // Calculate pip distance needed for fixed reward amount
    const targetDistanceInPips = fixedRewardAmount / (pipValue * fixedLotSize);
    const targetDistance = targetDistanceInPips * pipSize;
    
    logger.info(`📏 Calculated TP distance for ${symbol}: ${targetDistance.toFixed(5)} (${targetDistanceInPips.toFixed(2)} pips) for $${fixedRewardAmount} reward with ${fixedLotSize} lots`);
    
    if (direction === 'BUY') {
      return [avgEntry + targetDistance];
    } else {
      return [avgEntry - targetDistance];
    }
  }

  /**
   * Calculate pip distance needed for $900 profit/loss with 0.45 lot size
   */
  private static calculatePipDistanceFor900Dollars(symbol: string, lotSize: number = 0.45): number {
    // Standard pip values for major pairs (per 1.0 lot)
    const pipValues: { [key: string]: number } = {
      'EURUSD': 10,    // $10 per pip per lot
      'GBPUSD': 10,    // $10 per pip per lot  
      'USDCHF': 10,    // $10 per pip per lot
      'USDJPY': 10,    // $10 per pip per lot (approximately)
      'EURGBP': 10,    // $10 per pip per lot (cross pair)
      'EURJPY': 10,    // $10 per pip per lot (cross pair)
      'GBPJPY': 10,    // $10 per pip per lot (cross pair)
      'EURAUD': 10,    // $10 per pip per lot (cross pair)
      'GBPAUD': 10,    // $10 per pip per lot (cross pair)
      'AUDUSD': 10,    // $10 per pip per lot
      'NZDUSD': 10,    // $10 per pip per lot
      'USDCAD': 10,    // $10 per pip per lot
      'XAUUSD': 100,   // $100 per pip per lot (Gold)
      'XAGUSD': 50,    // $50 per pip per lot (Silver)
      'DEFAULT': 10    // Default for unknown symbols
    };

    const pipValue = pipValues[symbol] || pipValues['DEFAULT'];
    const pipValueForLotSize = pipValue * lotSize;
    
    // Calculate pips needed for $900
    const pipsNeeded = 900 / pipValueForLotSize;
    
    // Convert pips to price distance based on symbol type
    if (symbol.includes('JPY')) {
      // JPY pairs: 1 pip = 0.01
      return pipsNeeded * 0.01;
    } else if (symbol.startsWith('XAU') || symbol.startsWith('XAG')) {
      // Metals: 1 pip = 0.1 for Gold, 0.01 for Silver  
      return symbol.startsWith('XAU') ? pipsNeeded * 0.1 : pipsNeeded * 0.01;
    } else {
      // Major forex pairs: 1 pip = 0.0001
      return pipsNeeded * 0.0001;
    }
  }

  /**
   * Build a trade signal from color analysis results
   */
  private static buildSignalFromAnalysis(
    analysis: any,
    text: string,
    caption?: string
  ): TradeSignal | null {
    
    if (!analysis.greyEntry) return null;
    
    // Extract symbol from caption or text
    const symbol = SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
    
    // Determine action from recommendation
    const action: TradeAction = analysis.recommendation.action || 'BUY';
    
    // Use grey entry as entry zone
    const entryZone = {
      min: analysis.greyEntry.min,
      max: analysis.greyEntry.max
    };
    
    // Calculate stop loss and targets based on fixed $900 risk/reward
    const entryMid = (entryZone.min + entryZone.max) / 2;
    
    // Calculate pip distance for $900 with 0.45 lot size
    const pipDistanceFor900 = this.calculatePipDistanceFor900Dollars(symbol, 0.45);
    
    let stopLoss: number;
    let targets: number[];
    
    if (action === 'BUY') {
      stopLoss = entryMid - pipDistanceFor900;  // -$900 risk
      targets = this.calculateTargets(entryZone, 'BUY', symbol);  // +$900 profit
    } else {
      stopLoss = entryMid + pipDistanceFor900;  // -$900 risk  
      targets = this.calculateTargets(entryZone, 'SELL', symbol); // +$900 profit
    }
    
    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets,
      orderType: 'LIMIT',
      reason: 'ML Color Analysis',
      plan: 'Color-based zone analysis with ML detection',
      confidence: analysis.recommendation.confidence
    };
  }

  /**
   * Get performance metrics for analysis routing
   */
  static getRoutingStats(): {
    fastTextUsage: number;
    colorAnalysisUsage: number;
    fullVisualUsage: number;
    averageProcessingTime: number;
  } {
    // In production, this would track actual usage statistics
    return {
      fastTextUsage: 70, // 70% of signals
      colorAnalysisUsage: 25, // 25% of signals
      fullVisualUsage: 5, // 5% of signals
      averageProcessingTime: 150 // milliseconds
    };
  }

  /**
   * Format price with proper decimal precision based on instrument type
   */
  private static formatPriceForInstrument(price: number, symbol: string): number {
    const upperSymbol = symbol.toUpperCase();
    
    // JPY pairs use 3 decimal places
    if (upperSymbol.includes('JPY')) {
      return Number(price.toFixed(3));
    }
    
    // Major forex pairs use 5 decimal places
    if (this.isForexPair(upperSymbol)) {
      return Number(price.toFixed(5));
    }
    
    // Metals use 2 decimal places
    if (['XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'].includes(upperSymbol)) {
      return Number(price.toFixed(2));
    }
    
    // Default to 5 decimal places for precision
    return Number(price.toFixed(5));
  }

  /**
   * Check if symbol is a forex pair
   */
  private static isForexPair(symbol: string): boolean {
    return symbol.length === 6 && /^[A-Z]{6}$/.test(symbol);
  }
}
