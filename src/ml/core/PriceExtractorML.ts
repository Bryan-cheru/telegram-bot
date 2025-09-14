import { logger } from '../../utils/logger';

/**
 * Consolidated Price Extraction ML Utility
 * Single source of truth for all price-related ML operations
 * Eliminates ~200 lines of duplicate code across ML components
 */
export class PriceExtractorML {
  
  /**
   * Extract and validate prices from OCR text
   * Consolidated logic from VisualChartAnalysisML and ColorAnalysisML
   */
  static extractPricesFromText(text: string, symbol?: string): number[] {
    if (!text?.trim()) return [];
    
    logger.debug(`🔍 Extracting prices from text for ${symbol || 'unknown symbol'}`);
    
    // Get symbol-specific price pattern
    const pricePattern = symbol ? this.getPricePatternForSymbol(symbol) : this.getGeneralPricePattern();
    const matches = [...text.matchAll(pricePattern)];
    
    // Extract and clean prices
    let prices = matches
      .map(match => parseFloat(match[1].replace(/,/g, '')))
      .filter(price => !isNaN(price));
    
    // Apply symbol-specific validation if symbol provided
    if (symbol) {
      const priceRange = this.getSymbolPriceRange(symbol);
      prices = prices.filter(price => 
        price >= priceRange.min && 
        price <= priceRange.max
      );
    }
    
    // Filter out obvious non-price numbers
    prices = this.filterNonPrices(prices, symbol);
    
    // Remove duplicates and sort
    const uniquePrices = [...new Set(prices)].sort((a, b) => a - b);
    
    logger.debug(`✅ Extracted ${uniquePrices.length} valid prices:`, uniquePrices.slice(0, 5));
    return uniquePrices;
  }

  /**
   * Extract only highlighted/key price levels (for chart scale analysis)
   * Focuses on prices likely to be colored/highlighted on charts
   */
  static extractHighlightedPrices(text: string, symbol: string): number[] {
    const allPrices = this.extractPricesFromText(text, symbol);
    
    if (allPrices.length <= 10) {
      return allPrices; // All prices are likely highlighted
    }
    
    logger.info(`📊 Filtering ${allPrices.length} prices to focus on highlighted chart levels...`);
    
    // Focus on round numbers and typical chart highlighting patterns
    const highlightedPrices = allPrices.filter(price => {
      return this.isLikelyHighlightedPrice(price, symbol);
    });
    
    if (highlightedPrices.length >= 3) {
      logger.info(`🎯 Identified ${highlightedPrices.length} highlighted chart levels`);
      return highlightedPrices;
    }
    
    // Fallback: return top 8 prices (typical for chart highlighting)
    logger.info(`📈 Using top ${Math.min(8, allPrices.length)} price levels as highlighted`);
    return allPrices.slice(0, 8);
  }

  /**
   * Get symbol-specific price pattern regex
   */
  private static getPricePatternForSymbol(symbol: string): RegExp {
    const upperSymbol = symbol.toUpperCase();
    
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      return /\b([1-4]\d{3}\.?\d{0,3})\b/g; // Gold: 2450.50, 3475.040
    }
    
    if (upperSymbol.includes('EUR') || upperSymbol.includes('GBP')) {
      return /\b(1\.\d{4,5})\b/g; // Major EUR/GBP pairs: 1.61850
    }
    
    if (upperSymbol.includes('CAD') && upperSymbol.includes('EUR')) {
      return /\b(1\.[45678]\d{3,4})\b/g; // EURCAD: 1.6185
    }
    
    if (upperSymbol.includes('JPY')) {
      return /\b(1[0-6]\d\.\d{2,3})\b/g; // JPY pairs: 150.25
    }
    
    if (upperSymbol.includes('NAS')) {
      return /\b([12]\d{4}\.?\d{0,3})\b/g; // NASDAQ: 15000, 20500
    }
    
    if (upperSymbol.includes('SPX')) {
      return /\b([3-7]\d{3}\.?\d{0,3})\b/g; // S&P: 4500.5
    }
    
    return this.getGeneralPricePattern();
  }

  /**
   * General price pattern for unknown symbols
   */
  private static getGeneralPricePattern(): RegExp {
    return /\b(\d{1,5}\.?\d{0,5})\b/g;
  }

  /**
   * Get realistic price range for trading symbols
   */
  static getSymbolPriceRange(symbol: string): { min: number; max: number } {
    const upperSymbol = symbol.toUpperCase();
    
    // Metal prices
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      return { min: 1500, max: 4000 };
    }
    if (upperSymbol.includes('XAGUSD') || upperSymbol.includes('SILVER')) {
      return { min: 15, max: 50 };
    }
    
    // Forex pairs
    if (upperSymbol.includes('EUR') && upperSymbol.includes('USD')) {
      return { min: 0.9, max: 1.3 };
    }
    if (upperSymbol.includes('GBP') && upperSymbol.includes('USD')) {
      return { min: 1.1, max: 1.5 };
    }
    if (upperSymbol.includes('EUR') && upperSymbol.includes('CAD')) {
      return { min: 1.3, max: 1.7 };
    }
    if (upperSymbol.includes('JPY')) {
      return { min: 100, max: 180 };
    }
    
    // Indices
    if (upperSymbol.includes('NAS') || upperSymbol.includes('NASDAQ')) {
      return { min: 10000, max: 25000 };
    }
    if (upperSymbol.includes('SPX') || upperSymbol.includes('SP500')) {
      return { min: 3000, max: 7000 };
    }
    if (upperSymbol.includes('US30') || upperSymbol.includes('DOW')) {
      return { min: 25000, max: 45000 };
    }
    
    // Default wide range
    return { min: 0.1, max: 100000 };
  }

  /**
   * Filter out obvious non-price numbers (timestamps, coordinates, etc.)
   */
  private static filterNonPrices(prices: number[], symbol?: string): number[] {
    return prices.filter(price => {
      const priceStr = price.toString();
      
      // Skip obvious non-chart prices
      if (priceStr.match(/^20[0-9]{2}$/)) return false; // Years like 2024
      if (priceStr.match(/^[0-2]?\d\.[0-5]\d$/)) return false; // Times like 13.30
      if (priceStr.match(/^\d{1,2}:\d{2}$/)) return false; // Time format HH:MM
      
      // Symbol-specific filtering
      if (symbol?.toUpperCase().includes('USD') && !symbol.includes('JPY')) {
        if (price < 1 && !symbol.includes('EURUSD') && !symbol.includes('GBPUSD')) {
          return false; // Too small for most USD pairs except major forex
        }
      }
      
      return true;
    });
  }

  /**
   * Check if a price is likely to be highlighted on charts
   */
  private static isLikelyHighlightedPrice(price: number, symbol: string): boolean {
    const priceStr = price.toString();
    const upperSymbol = symbol.toUpperCase();
    
    if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      // Gold: Focus on levels ending in .0, .5, or round numbers
      return priceStr.endsWith('.0') || priceStr.endsWith('.5') || 
             priceStr.endsWith('0') || priceStr.endsWith('5');
    }
    
    if (upperSymbol.includes('EUR') || upperSymbol.includes('CAD')) {
      // Forex: Focus on round 4-5 decimal levels
      const decimal = priceStr.split('.')[1];
      return decimal ? (decimal.endsWith('00') || decimal.endsWith('50') || decimal.endsWith('000')) : false;
    }
    
    if (upperSymbol.includes('NAS') || upperSymbol.includes('SPX')) {
      // Indices: Focus on round hundreds
      return price % 50 === 0 || price % 100 === 0;
    }
    
    if (upperSymbol.includes('JPY')) {
      // JPY: Focus on round levels
      return price % 1 === 0 || priceStr.endsWith('.5') || priceStr.endsWith('.0');
    }
    
    return true; // Default: assume highlighted
  }

  /**
   * Find the closest price from a list to a target price
   */
  static findClosestPrice(targetPrice: number, priceList: number[]): number | null {
    if (!priceList.length) return null;
    
    let closest = priceList[0];
    let minDiff = Math.abs(targetPrice - closest);
    
    for (const price of priceList) {
      const diff = Math.abs(targetPrice - price);
      if (diff < minDiff) {
        minDiff = diff;
        closest = price;
      }
    }
    
    // Only return if reasonably close (within 5% of target)
    return minDiff < targetPrice * 0.05 ? closest : null;
  }

  /**
   * Validate if a price is realistic for a given instrument
   */
  static isValidPriceForInstrument(price: number, symbol?: string): boolean {
    if (!price || price <= 0) return false;
    
    if (!symbol) return true; // No symbol validation
    
    const range = this.getSymbolPriceRange(symbol);
    return price >= range.min && price <= range.max;
  }

  /**
   * Group nearby prices into clusters (for zone detection)
   */
  static groupNearbyPrices(prices: number[], maxGapPercent = 2): number[][] {
    if (prices.length === 0) return [];
    
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup = [sortedPrices[0]];
    
    for (let i = 1; i < sortedPrices.length; i++) {
      const prevPrice = sortedPrices[i - 1];
      const currentPrice = sortedPrices[i];
      const gapPercent = ((currentPrice - prevPrice) / prevPrice) * 100;
      
      if (gapPercent <= maxGapPercent) {
        currentGroup.push(currentPrice);
      } else {
        groups.push(currentGroup);
        currentGroup = [currentPrice];
      }
    }
    
    groups.push(currentGroup);
    return groups;
  }
}
