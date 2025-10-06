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
        const greyPrices = mlResult.greyEntryZones.map(z => z.price);
        const minPrice = Math.min(...greyPrices);
        const maxPrice = Math.max(...greyPrices);
        
        // 🚨 FIX: Handle single-zone scenario
        let entryZone: { min: number; max: number };
        
        if (minPrice === maxPrice || greyPrices.length === 1) {
          // Single zone detected - create a small range around the price
          const zoneSize = minPrice * 0.001; // 0.1% zone around detected price
          entryZone = {
            min: minPrice - zoneSize,
            max: minPrice + zoneSize
          };
          logger.info(`🔧 Single grey zone detected, creating entry range: ${entryZone.min.toFixed(5)} - ${entryZone.max.toFixed(5)}`);
        } else {
          // Multiple zones - use min/max range
          entryZone = {
            min: minPrice,
            max: maxPrice
          };
        }
        
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
        
        let stopLoss: number;
        let targets: number[];
        
        if (mlResult.redStopZones.length > 0) {
          stopLoss = mlResult.redStopZones[0].price;
        } else {
          stopLoss = this.calculateStopLoss(entryZone, direction);
        }
        
        if (mlResult.greenTargetZones.length > 0) {
          targets = mlResult.greenTargetZones.map(z => z.price);
        } else {
          targets = this.calculateTargets(entryZone, direction);
        }
        
        // 🔧 VALIDATION: Ensure stop loss and targets make logical sense
        if (direction === 'SELL') {
          // For SELL: stop loss should be ABOVE entry, targets should be BELOW entry
          if (stopLoss <= avgEntry) {
            // Use $900 risk calculation for SELL stop loss
            const symbol = mlResult.symbol || SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
            const pipDistanceFor900 = this.calculatePipDistanceFor900Dollars(symbol, 0.45);
            stopLoss = avgEntry + pipDistanceFor900;
            logger.warn(`⚠️ Adjusting SELL stop loss from ${mlResult.redStopZones[0]?.price} to ${stopLoss} ($900 risk with 0.45 lots)`);
          }
          
          // Ensure targets are below entry
          targets = targets.filter(t => t < avgEntry);
          if (targets.length === 0) {
            // Use $900 profit target calculation for SELL
            const symbol = mlResult.symbol || SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
            const pipDistanceFor900 = this.calculatePipDistanceFor900Dollars(symbol, 0.45);
            targets = [avgEntry - pipDistanceFor900];
            logger.warn(`⚠️ No valid SELL targets, creating target at ${targets[0]} ($900 profit with 0.45 lots)`);
          }
        } else {
          // For BUY: stop loss should be BELOW entry, targets should be ABOVE entry  
          if (stopLoss >= avgEntry) {
            // Use $900 risk calculation for BUY stop loss
            const symbol = mlResult.symbol || SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
            const pipDistanceFor900 = this.calculatePipDistanceFor900Dollars(symbol, 0.45);
            stopLoss = avgEntry - pipDistanceFor900;
            logger.warn(`⚠️ Adjusting BUY stop loss to ${stopLoss} ($900 risk with 0.45 lots)`);
          }
          
          // Ensure targets are above entry
          targets = targets.filter(t => t > avgEntry);
          if (targets.length === 0) {
            // Use $900 profit target calculation for BUY
            const symbol = mlResult.symbol || SymbolParser.extractSymbol(caption || text) || 'UNKNOWN';
            const pipDistanceFor900 = this.calculatePipDistanceFor900Dollars(symbol, 0.45);
            targets = [avgEntry + pipDistanceFor900];
            logger.warn(`⚠️ No valid BUY targets, creating target at ${targets[0]} ($900 profit with 0.45 lots)`);
          }
        }

        return {
          symbol: mlResult.symbol || SymbolParser.extractSymbol(caption || text) || 'UNKNOWN',
          action: mlResult.direction || 'BUY',
          entryZone,
          stopLoss,
          targets,
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
   * Calculate stop loss (simplified)
   */
  private static calculateStopLoss(entryZone: { min: number; max: number }, direction: string): number {
    const avgEntry = (entryZone.min + entryZone.max) / 2;
    const buffer = Math.abs(entryZone.max - entryZone.min) || avgEntry * 0.01;
    
    return direction === 'BUY' ? entryZone.min - buffer : entryZone.max + buffer;
  }

  /**
   * Calculate targets based on fixed $900 profit target with 0.45 lot size
   */
  private static calculateTargets(entryZone: { min: number; max: number }, direction: string, symbol?: string): number[] {
    const avgEntry = (entryZone.min + entryZone.max) / 2;
    
    // Fixed $900 profit target with 0.45 lot size
    const pipDistance = this.calculatePipDistanceFor900Dollars(symbol || 'UNKNOWN', 0.45);
    
    if (direction === 'BUY') {
      return [
        avgEntry + pipDistance
      ];
    } else {
      return [
        avgEntry - pipDistance
      ];
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
}
