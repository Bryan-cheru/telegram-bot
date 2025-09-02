import { logger } from '../utils/logger';
import { tradingConfig } from '../utils/tradingConfig';

/**
 * CHART COLOR ANALYSIS ML
 * Focus on grey (entry), green (target), red (stop) zones from chart scale
 */

export class ChartColorAnalysisML {
  
  /**
   * Extract color-coded price levels from OCR text
   * This works with all your charts that have the same color scheme
   */
  static analyzeChartColors(ocrText: string, symbol: string): {
    greyEntry: { min: number; max: number; confidence: number } | null;
    greenTargets: number[];
    redStops: number[];
    recommendation: {
      action: 'BUY' | 'SELL' | 'HOLD';
      confidence: number;
      reason: string;
    };
  } {
    // Step 1: Extract only chart scale highlighted prices (not all OCR text)
    const highlightedPrices = this.extractHighlightedScalePrices(ocrText, symbol);
    
    if (highlightedPrices.length < 3) {
      logger.warn(`⚠️  Only ${highlightedPrices.length} highlighted chart prices found. Need at least 3 for analysis.`);
      return {
        greyEntry: null,
        greenTargets: [],
        redStops: [],
        recommendation: { action: 'HOLD', confidence: 0, reason: 'Insufficient highlighted price data from chart scale' }
      };
    }
    
    logger.info(`🎨 Analyzing ${highlightedPrices.length} highlighted chart scale prices:`, highlightedPrices);

    // Sort prices to identify zones
    const sortedPrices = [...highlightedPrices].sort((a, b) => a - b);
    
    // GREY ENTRY ZONE: Middle range of highlighted prices  
    const greyEntry = this.identifyGreyEntryZone(sortedPrices, ocrText);
    
    // GREEN TARGETS: Highlighted target levels on chart scale
    const greenTargets = this.identifyGreenTargets(sortedPrices, greyEntry, ocrText);
    
    // RED STOPS: Highlighted stop loss levels on chart scale
    const redStops = this.identifyRedStops(sortedPrices, greyEntry, ocrText);
    
    // RECOMMENDATION: Based on highlighted chart level analysis
    const recommendation = this.generateColorBasedRecommendation(greyEntry, greenTargets, redStops, ocrText);
    
    return { greyEntry, greenTargets, redStops, recommendation };
  }

  /**
   * Extract only the highlighted prices from the chart scale
   * Focus on prices that appear to be colored/highlighted on the price scale, not all OCR text
   */
  private static extractHighlightedScalePrices(text: string, symbol: string): number[] {
    const upperSymbol = symbol.toUpperCase();
    
    // Get expected price range for this symbol
    const priceRange = this.getSymbolPriceRange(upperSymbol);
    
    // Extract prices that are likely from the chart scale
    const pricePattern = this.getPricePatternForSymbol(upperSymbol);
    const matches = [...text.matchAll(pricePattern)];
    
    let prices = matches
      .map(match => parseFloat(match[1].replace(/,/g, '')))
      .filter(price => !isNaN(price) && 
                      price >= priceRange.min && 
                      price <= priceRange.max);
    
    // Enhanced filtering for chart scale prices only
    prices = prices.filter(price => {
      const priceStr = price.toString();
      
      // Skip obvious non-chart prices (timestamps, coordinates, etc.)
      if (priceStr.match(/^20[0-9]{2}$/)) return false; // Years like 2024
      if (priceStr.match(/^[0-2]?\d\.[0-5]\d$/)) return false; // Times like 13.30
      if (priceStr.match(/^\d{1,2}:\d{2}$/)) return false; // Time format HH:MM
      if (price < 1 && upperSymbol.includes('USD') && !upperSymbol.includes('JPY')) return false;
      
      // Symbol-specific chart scale validation
      if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
        // Gold chart scale prices: typically clean numbers, not random decimals
        return price >= 2000 && price <= 4000;
      }
      
      if (upperSymbol.includes('EUR') || upperSymbol.includes('CAD')) {
        // Forex chart scale: typically 4-5 decimal precision, clean levels
        return price >= 1.0000 && price <= 2.0000 && priceStr.includes('.') && priceStr.split('.')[1].length >= 4;
      }
      
      if (upperSymbol.includes('NAS') || upperSymbol.includes('SPX')) {
        // Index chart scale: typically round numbers
        return price >= 10000 && price <= 25000;
      }
      
      return true;
    });

    // Remove duplicates
    const uniquePrices = [...new Set(prices)];
    
    // Focus on key highlighted levels - chart highlighting shows 3-8 key levels, not dozens
    if (uniquePrices.length > 10) {
      logger.info(`📊 Filtering ${uniquePrices.length} extracted prices to focus on likely highlighted chart scale levels...`);
      
      // For too many prices, focus on round numbers and typical chart levels
      const keyLevels = uniquePrices.filter(price => {
        const priceStr = price.toString();
        
        if (upperSymbol.includes('XAUUSD')) {
          // Gold: Focus on levels ending in .0, .5, or round numbers (typical chart highlighting)
          return priceStr.endsWith('.0') || priceStr.endsWith('.5') || priceStr.endsWith('0') || priceStr.endsWith('5');
        }
        
        if (upperSymbol.includes('EUR') || upperSymbol.includes('CAD')) {
          // Forex: Focus on round 4-5 decimal levels (typical for highlighted scale)
          const decimal = priceStr.split('.')[1];
          return decimal && (decimal.endsWith('00') || decimal.endsWith('50') || decimal.endsWith('000'));
        }
        
        if (upperSymbol.includes('NAS')) {
          // Indices: Focus on round hundreds (typical for highlighted scale)
          return price % 50 === 0 || price % 100 === 0;
        }
        
        return true;
      });
      
      if (keyLevels.length >= 3) {
        logger.info(`🎯 Identified ${keyLevels.length} key highlighted chart scale levels:`, keyLevels);
        return keyLevels.sort((a, b) => a - b);
      }
    }
    
    logger.info(`📈 Using ${uniquePrices.length} highlighted chart scale prices:`, uniquePrices);
    return uniquePrices.sort((a, b) => a - b);
  }

  /**
   * Identify grey entry zone from price distribution (improved logic)
   */
  private static identifyGreyEntryZone(sortedPrices: number[], ocrText: string): { min: number; max: number; confidence: number } | null {
    if (sortedPrices.length < 3) return null;

    // Look for text context that mentions entry/buying/selling area
    const entryKeywords = ['best buying area', 'selling area', 'entry zone', 'grey zone', 'buying zone', 'buying area', 'demand zone'];
    const hasEntryContext = entryKeywords.some(keyword => 
      ocrText.toLowerCase().includes(keyword.toLowerCase())
    );

    // Enhanced logic: Look for specific entry price mentions in text
    const entryPriceMatches = ocrText.match(/(?:between|entry|zone|buying).*?([0-9]{4}[0-9.]*)[^0-9]*[–-][^0-9]*([0-9]{4}[0-9.]*)/gi);
    
    if (entryPriceMatches) {
      // Try to extract specific entry range from text
      const match = entryPriceMatches[0];
      const prices = match.match(/([0-9]{4}[0-9.]*)/g);
      if (prices && prices.length >= 2) {
        const price1 = parseFloat(prices[0]);
        const price2 = parseFloat(prices[1]);
        
        // Verify these prices exist in our highlighted prices
        if (sortedPrices.includes(price1) && sortedPrices.includes(price2)) {
          return {
            min: Math.min(price1, price2),
            max: Math.max(price1, price2),
            confidence: 0.95 // Very high confidence from text
          };
        }
      }
    }

    // Fallback: Smart clustering approach instead of simple middle-range
    // Look for the tightest cluster of prices (likely the entry zone)
    let bestCluster = { min: 0, max: 0, size: 0, confidence: 0 };
    
    for (let i = 0; i < sortedPrices.length - 1; i++) {
      for (let j = i + 1; j < sortedPrices.length; j++) {
        const clusterMin = sortedPrices[i];
        const clusterMax = sortedPrices[j];
        const clusterRange = clusterMax - clusterMin;
        const clusterMid = (clusterMin + clusterMax) / 2;
        const rangePercent = (clusterRange / clusterMid) * 100;
        
        // Prefer tight clusters (small range) in the middle-lower area
        if (rangePercent < 5 && i < sortedPrices.length * 0.6) { // Max 5% range, not in top 40%
          const clusterSize = j - i + 1;
          const confidence = hasEntryContext ? 0.85 : 0.65;
          
          if (clusterSize > bestCluster.size || 
              (clusterSize === bestCluster.size && rangePercent < bestCluster.size)) {
            bestCluster = { min: clusterMin, max: clusterMax, size: clusterSize, confidence };
          }
        }
      }
    }
    
    if (bestCluster.min > 0) {
      return { min: bestCluster.min, max: bestCluster.max, confidence: bestCluster.confidence };
    }

    // Final fallback: Use old logic but limit the range
    const totalRange = sortedPrices[sortedPrices.length - 1] - sortedPrices[0];
    const middleStart = Math.floor(sortedPrices.length * 0.2); // Skip bottom 20%
    const middleEnd = Math.floor(sortedPrices.length * 0.6);   // Skip top 40%
    
    const middlePrices = sortedPrices.slice(middleStart, middleEnd);
    
    if (middlePrices.length < 2) {
      const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
      const buffer = totalRange * 0.01; // 1% buffer (smaller than before)
      return {
        min: median - buffer,
        max: median + buffer,
        confidence: hasEntryContext ? 0.7 : 0.5
      };
    }

    const greyMin = Math.min(...middlePrices);
    const greyMax = Math.max(...middlePrices);
    
    // Ensure the range isn't too wide (max 3% of price)
    const rangePercent = ((greyMax - greyMin) / ((greyMin + greyMax) / 2)) * 100;
    if (rangePercent > 3) {
      // Narrow it down to just the first two prices in the middle range
      const narrowMax = middlePrices.length > 1 ? middlePrices[1] : greyMax;
      return { min: greyMin, max: Math.min(narrowMax, greyMax), confidence: hasEntryContext ? 0.75 : 0.55 };
    }
    
    const confidence = hasEntryContext ? 0.85 : 0.65;
    return { min: greyMin, max: greyMax, confidence };
  }

  /**
   * Identify green target levels
   */
  private static identifyGreenTargets(sortedPrices: number[], greyEntry: any, ocrText: string): number[] {
    if (!greyEntry) return [];

    const greyMid = (greyEntry.min + greyEntry.max) / 2;
    
    // Look for target/TP context
    const targetKeywords = ['target', 'tp', 'final target', 'take profit'];
    const hasTargetContext = targetKeywords.some(keyword => 
      ocrText.toLowerCase().includes(keyword.toLowerCase())
    );

    // Determine direction based on text context or price distribution
    const bullishKeywords = ['buy', 'bullish', 'support', 'bounce'];
    const bearishKeywords = ['sell', 'bearish', 'resistance', 'rejection'];
    
    const isBullish = bullishKeywords.some(keyword => 
      ocrText.toLowerCase().includes(keyword.toLowerCase())
    );
    const isBearish = bearishKeywords.some(keyword => 
      ocrText.toLowerCase().includes(keyword.toLowerCase())
    );

    let targets: number[] = [];

    if (isBullish || (!isBearish && !isBullish)) { // Default to bullish if unclear
      // GREEN TARGETS are ABOVE grey entry for BUY setups
      targets = sortedPrices.filter(price => price > greyEntry.max);
    } else if (isBearish) {
      // GREEN TARGETS are BELOW grey entry for SELL setups  
      targets = sortedPrices.filter(price => price < greyEntry.min);
    }

    // Sort targets appropriately
    return isBearish ? targets.sort((a, b) => b - a) : targets.sort((a, b) => a - b);
  }

  /**
   * Identify red stop loss levels
   */
  private static identifyRedStops(sortedPrices: number[], greyEntry: any, ocrText: string): number[] {
    if (!greyEntry) return [];

    // Look for stop loss context
    const stopKeywords = ['sl', 'stop', 'stop loss', 'invalidation'];
    const hasStopContext = stopKeywords.some(keyword => 
      ocrText.toLowerCase().includes(keyword.toLowerCase())
    );

    const bullishKeywords = ['buy', 'bullish', 'support'];
    const isBullish = bullishKeywords.some(keyword => 
      ocrText.toLowerCase().includes(keyword.toLowerCase())
    );

    let stops: number[] = [];

    if (isBullish) {
      // RED STOPS are BELOW grey entry for BUY setups
      stops = sortedPrices.filter(price => price < greyEntry.min);
    } else {
      // RED STOPS are ABOVE grey entry for SELL setups
      stops = sortedPrices.filter(price => price > greyEntry.max);
    }

    return stops;
  }

  /**
   * Generate trading recommendation based on highlighted chart scale analysis
   * Uses actual chart levels rather than forced 1:1 risk-reward
   */
  private static generateColorBasedRecommendation(
    greyEntry: any, 
    greenTargets: number[], 
    redStops: number[], 
    ocrText: string
  ): { action: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reason: string } {
    
    if (!greyEntry || greenTargets.length === 0) {
      return { action: 'HOLD', confidence: 0, reason: 'No highlighted entry zone or targets found on chart scale' };
    }

    const greyMid = (greyEntry.min + greyEntry.max) / 2;
    
    // Determine action based on where targets are relative to entry zone
    const targetsAboveEntry = greenTargets.filter(t => t > greyEntry.max);
    const targetsBelowEntry = greenTargets.filter(t => t < greyEntry.min);
    
    let action: 'BUY' | 'SELL';
    let confidence = greyEntry.confidence;
    let reason = '';

    if (targetsAboveEntry.length > targetsBelowEntry.length) {
      action = 'BUY';
      reason = `BUY setup: Entry zone ${greyEntry.min.toFixed(4)}-${greyEntry.max.toFixed(4)} with ${targetsAboveEntry.length} highlighted targets above`;
    } else if (targetsBelowEntry.length > targetsAboveEntry.length) {
      action = 'SELL';
      reason = `SELL setup: Entry zone ${greyEntry.min.toFixed(4)}-${greyEntry.max.toFixed(4)} with ${targetsBelowEntry.length} highlighted targets below`;
    } else {
      // Equal targets or unclear - use text context
      const bullishKeywords = ['buy', 'bullish', 'support', 'long'];
      const bearishKeywords = ['sell', 'bearish', 'resistance', 'short'];
      
      const isBullish = bullishKeywords.some(keyword => 
        ocrText.toLowerCase().includes(keyword.toLowerCase())
      );
      const isBearish = bearishKeywords.some(keyword => 
        ocrText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (isBullish) {
        action = 'BUY';
        reason = `BUY setup from text context and highlighted levels`;
      } else if (isBearish) {
        action = 'SELL';
        reason = `SELL setup from text context and highlighted levels`;
      } else {
        action = 'BUY'; // Default
        reason = `BUY setup (default) with highlighted chart levels`;
      }
    }

    // Boost confidence for clear chart structure
    if (greenTargets.length >= 2) confidence += 0.1; // Multiple targets
    if (redStops.length >= 1) confidence += 0.15;    // Clear stop levels
    
    // Boost confidence for clear chart annotations
    if (ocrText.toLowerCase().includes('best buying area') || 
        ocrText.toLowerCase().includes('selling area') ||
        ocrText.toLowerCase().includes('entry zone')) {
      confidence += 0.1;
    }

    // Calculate actual risk-reward from highlighted levels (not forced 1:1)
    if (redStops.length > 0) {
      const relevantStops = action === 'BUY' ? 
        redStops.filter(s => s < greyEntry.min) :
        redStops.filter(s => s > greyEntry.max);
      
      const relevantTargets = action === 'BUY' ? targetsAboveEntry : targetsBelowEntry;
      
      if (relevantStops.length > 0 && relevantTargets.length > 0) {
        const bestStop = action === 'BUY' ? 
          Math.max(...relevantStops) : // Closest stop below entry for BUY
          Math.min(...relevantStops);  // Closest stop above entry for SELL
        
        const firstTarget = action === 'BUY' ?
          Math.min(...relevantTargets) : // First target above entry for BUY
          Math.max(...relevantTargets);  // First target below entry for SELL
        
        const risk = Math.abs(greyMid - bestStop);
        const reward = Math.abs(firstTarget - greyMid);
        const actualRR = reward / risk;
        
        // Use actual chart RR (not forced 1:1)
        if (actualRR >= 1.2) confidence += 0.05;
        if (actualRR >= 1.5) confidence += 0.05;
        if (actualRR >= 2.0) confidence += 0.1;
        
        reason += ` (R:R ${actualRR.toFixed(1)}:1 from highlighted levels)`;
      }
    }

    confidence = Math.min(confidence, 1.0);

    return { action, confidence, reason };
  }

  /**
   * Extract only the highlighted prices from the chart scale
   * Focus on prices that are actually marked with colors (grey/green/red)
   */
  private static extractAllPrices(text: string, symbol: string): number[] {
    const upperSymbol = symbol.toUpperCase();
    
    // Get expected price range for this symbol
    const priceRange = this.getSymbolPriceRange(upperSymbol);
    
    // Extract prices that are likely from the chart scale
    const pricePattern = this.getPricePatternForSymbol(upperSymbol);
    const matches = [...text.matchAll(pricePattern)];
    
    let prices = matches
      .map(match => parseFloat(match[1].replace(/,/g, '')))
      .filter(price => !isNaN(price) && 
                      price >= priceRange.min && 
                      price <= priceRange.max);
    
    // Remove duplicates and filter noise
    prices = [...new Set(prices)].filter(price => {
      const priceStr = price.toString();
      
      // Skip obvious non-price numbers
      if (priceStr.match(/^20[0-9]{2}$/)) return false; // Years like 2024
      if (priceStr.match(/^[0-2]?\d\.[0-5]\d$/)) return false; // Times like 13.30
      if (price < 1 && upperSymbol.includes('USD') && !upperSymbol.includes('JPY')) return false; // Too small for most USD pairs
      
      return true;
    });

    return prices.sort((a, b) => a - b);
  }
  
  /**
   * Get price pattern regex for specific symbol type
   */
  private static getPricePatternForSymbol(symbol: string): RegExp {
    if (symbol.includes('XAUUSD') || symbol.includes('GOLD')) {
      return /\b([1-4]\d{3}\.?\d{0,3})\b/g; // Gold: 2450.50, 3475.040
    }
    if (symbol.includes('EUR') || symbol.includes('GBP')) {
      return /\b(1\.\d{4,5})\b/g; // Major EUR/GBP pairs: 1.61850
    }
    if (symbol.includes('CAD') && symbol.includes('EUR')) {
      return /\b(1\.[45678]\d{3,4})\b/g; // EURCAD: 1.6185
    }
    if (symbol.includes('JPY')) {
      return /\b(1[0-6]\d\.\d{2,3})\b/g; // JPY pairs: 150.25
    }
    if (symbol.includes('NAS')) {
      return /\b([12]\d{4}\.?\d{0,3})\b/g; // NASDAQ: 15000, 20500
    }
    if (symbol.includes('SPX')) {
      return /\b([3-7]\d{3}\.?\d{0,3})\b/g; // S&P: 4500.5
    }
    
    return /\b(\d{1,5}\.?\d{0,5})\b/g; // General pattern
  }
  
  /**
   * Get realistic price range for trading symbols
   */
  private static getSymbolPriceRange(symbol: string): { min: number; max: number } {
    return tradingConfig.getPriceRange(symbol);
  }

  /**
   * Apply actual chart highlighted levels (not forced 1:1 RR)
   * Uses the real targets and stops from chart color highlighting
   */
  static applyActualChartLevels(colorAnalysis: any): {
    entryZone: { min: number; max: number };
    stopLoss: number | null;
    targets: number[];
    action: 'BUY' | 'SELL';
    confidence: number;
    riskReward: number | null;
  } | null {
    
    if (!colorAnalysis.greyEntry || colorAnalysis.greenTargets.length === 0) {
      return null;
    }

    const { greyEntry, greenTargets, redStops, recommendation } = colorAnalysis;
    const entryMid = (greyEntry.min + greyEntry.max) / 2;
    const action = recommendation.action;

    // Use actual highlighted red stops from chart, not calculated ones
    let stopLoss: number | null = null;
    if (redStops.length > 0) {
      const relevantStops = action === 'BUY' ? 
        redStops.filter((stop: number) => stop < greyEntry.min) :
        redStops.filter((stop: number) => stop > greyEntry.max);
      
      if (relevantStops.length > 0) {
        stopLoss = action === 'BUY' ? 
          Math.max(...relevantStops) : // Closest stop below entry for BUY
          Math.min(...relevantStops);  // Closest stop above entry for SELL
      }
    }

    // Use actual highlighted green targets from chart
    const relevantTargets = action === 'BUY' ? 
      greenTargets.filter((target: number) => target > greyEntry.max) :
      greenTargets.filter((target: number) => target < greyEntry.min);

    if (relevantTargets.length === 0) {
      logger.warn(`⚠️  No relevant targets found for ${action} setup`);
      return null;
    }

    // Sort targets appropriately
    const sortedTargets = action === 'BUY' ? 
      relevantTargets.sort((a: number, b: number) => a - b) : // Nearest first for BUY
      relevantTargets.sort((a: number, b: number) => b - a);  // Nearest first for SELL

    // Calculate actual risk-reward from highlighted levels
    let riskReward: number | null = null;
    if (stopLoss !== null && sortedTargets.length > 0) {
      const risk = Math.abs(entryMid - stopLoss);
      const reward = Math.abs(sortedTargets[0] - entryMid);
      riskReward = reward / risk;
    }

    return {
      entryZone: greyEntry,
      stopLoss,
      targets: sortedTargets,
      action,
      confidence: recommendation.confidence,
      riskReward
    };
  }

  /**
   * Backward compatibility method - still available but recommends using actual levels
   * @deprecated Use applyActualChartLevels() instead for real chart highlighting
   */
  static applyColorBased1to1RR(colorAnalysis: any): {
    entryZone: { min: number; max: number };
    stopLoss: number;
    target: number;
    action: 'BUY' | 'SELL';
    confidence: number;
  } | null {
    
    logger.warn(`⚠️  Using deprecated 1:1 RR method. Consider using applyActualChartLevels() for real chart highlighting.`);
    
    if (!colorAnalysis.greyEntry || colorAnalysis.greenTargets.length === 0) {
      return null;
    }

    const { greyEntry, greenTargets, redStops, recommendation } = colorAnalysis;
    const entryMid = (greyEntry.min + greyEntry.max) / 2;
    const action = recommendation.action;

    // Use closest red stop as stop loss, or calculate based on grey zone
    let stopLoss: number;
    if (redStops.length > 0) {
      const relevantStops = action === 'BUY' ? 
        redStops.filter((stop: number) => stop < entryMid) :
        redStops.filter((stop: number) => stop > entryMid);
      
      stopLoss = relevantStops.length > 0 ? 
        (action === 'BUY' ? Math.max(...relevantStops) : Math.min(...relevantStops)) :
        (action === 'BUY' ? greyEntry.min - (greyEntry.max - greyEntry.min) : greyEntry.max + (greyEntry.max - greyEntry.min));
    } else {
      // Fallback: place stop outside grey zone
      const greyRange = greyEntry.max - greyEntry.min;
      const buffer = Math.max(greyRange, entryMid * 0.005); // 0.5% or grey range, whichever is larger
      stopLoss = action === 'BUY' ? greyEntry.min - buffer : greyEntry.max + buffer;
    }

    // Calculate 1:1 target (forced)
    const riskDistance = Math.abs(entryMid - stopLoss);
    const oneToOneTarget = action === 'BUY' ? 
      entryMid + riskDistance : 
      entryMid - riskDistance;

    return {
      entryZone: greyEntry,
      stopLoss,
      target: oneToOneTarget,
      action,
      confidence: recommendation.confidence
    };
  }
}

// INTEGRATION EXAMPLE:
// Add this to your TradeParser.parseVisualChartSignal method:

/*
const colorAnalysis = ChartColorAnalysisML.analyzeChartColors(text, symbol);
if (colorAnalysis.greyEntry) {
  // NEW: Use actual chart levels instead of forced 1:1 RR
  const colorTrade = ChartColorAnalysisML.applyActualChartLevels(colorAnalysis);
  
  if (colorTrade) {
    logger.info(`🎨 Chart Highlighting Analysis: ${colorTrade.action} from grey zone`);
    logger.info(`🔘 Entry: ${colorTrade.entryZone.min}-${colorTrade.entryZone.max}`);
    logger.info(`🔴 Stop: ${colorTrade.stopLoss || 'None highlighted'}`);
    logger.info(`🟢 Targets: ${colorTrade.targets.join(', ')} (${colorTrade.targets.length} highlighted levels)`);
    if (colorTrade.riskReward) {
      logger.info(`📊 Actual R:R: ${colorTrade.riskReward.toFixed(1)}:1 (from chart highlighting)`);
    }
    
    return {
      symbol,
      action: colorTrade.action,
      entryZone: colorTrade.entryZone,
      stopLoss: colorTrade.stopLoss,
      targets: colorTrade.targets,
      reason: `Chart Color ML: Using actual highlighted levels (${(colorTrade.confidence * 100).toFixed(0)}% confidence)`,
      plan: `${colorTrade.action} from highlighted grey zone → actual chart targets (not forced 1:1)`
    };
  }
}
*/
