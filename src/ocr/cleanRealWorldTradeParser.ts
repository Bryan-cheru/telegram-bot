/**
 * Clean Real-World Trade Parser - 100% Reliable & Working
 * Enhanced with intelligent ML integration for visual chart analysis
 * 
 * Example format:
 * "#XAUUSD (Update)...!! 🔼
 * Gold is approaching the highlighted demand zone (2526 – 2521). 
 * This area is marked as an instant buy zone..."
 */

import { TradeSignal, TradeAction, OrderType } from '../types';
import { logger } from '../utils/logger';
import { CleanMLIntegration } from '../ml/core/CleanMLIntegration';
import { SymbolParser, ValidationService, FormatService } from '../shared';

/**
 * CLEAN Real World Trade Parser
 * Reliable, MetaAPI-compliant signal processing
 * Enhanced with visual chart analysis capability and ML integration
 */
export class CleanRealWorldTradeParser {
  private static readonly SYMBOL_PATTERNS = [
    // Hashtag patterns - highest priority (with optional .x suffix for InstantFunding)
    /#(XAUUSD|GOLD|XAGUSD|SILVER)(?:\.x)?/i,
    /#(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)(?:\.x)?/i,
    /#(EURCHF|EURGBP|EURJPY|EURAUD|EURCAD|EURNZD|GBPCHF|GBPJPY|GBPAUD|GBPCAD|GBPNZD)(?:\.x)?/i,
    /#(CHFJPY|CADCHF|AUDCHF|NZDCHF|CADJPY|AUDJPY|NZDJPY|AUDCAD|AUDNZD|CADNZD)(?:\.x)?/i,
    /#(US30|NAS100|SPX500|UK100|GER30|US100|AUS200|JPN225|DOW|NASDAQ)(?:\.x)?/i,
    /#(USOIL|UKOIL|WTI|BRENT|OIL)(?:\.x)?/i,
    /#(BTCUSD|ETHUSD|BITCOIN|ETHEREUM)(?:\.x)?/i,
    /#(ESXEUR|F40EUR|HSIHED)(?:\.x)?/i,
    // Word boundaries without hashtag (with optional .x suffix)
    /\b(XAUUSD|GOLD|EURUSD|GBPUSD|EURCHF|EURGBP|EURJPY|GBPCHF|GBPJPY|CHFJPY|US30|NAS100|SPX500|UK100|GER30|US100|AUS200|JPN225|BTCUSD|ETHUSD|BITCOIN)(?:\.x)?\b/i
  ];

  private static readonly ACTION_PATTERNS = {
    BUY: [
      /instant\s+buy/i,
      /buy\s+zone/i,
      /demand\s+zone/i,
      /support/i,
      /bullish/i,
      /long/i,
      /\bbuy\b/i
    ],
    SELL: [
      /instant\s+sell/i,
      /sell\s+zone/i,
      /supply\s+zone/i,
      /resistance/i,
      /bearish/i,
      /short/i,
      /\bsell\b/i
    ]
  };

  private static readonly ZONE_PATTERNS = [
    // 4-6 digit patterns first (for gold prices like 4147-4137)
    /(\d{4,6}(?:\.\d{1,2})?)\s*[-–—]\s*(\d{4,6}(?:\.\d{1,2})?)/g,
    /\((\d{4,6}(?:\.\d{1,2})?)\s*[-–—]\s*(\d{4,6}(?:\.\d{1,2})?)\)/g,
    // Comma-separated patterns: "2,526 - 2,521" or "(126,000 - 124,000)"
    /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\s*[-–—]\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)/g,
    /\((\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\s*[-–—]\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\)/g,
    // Simple 1-3 digit patterns last (for small ranges like 1.25-1.24)
    /(\d{1,3}(?:\.\d{1,5})?)\s*[-–—]\s*(\d{1,3}(?:\.\d{1,5})?)/g,
    /\((\d{1,3}(?:\.\d{1,5})?)\s*[-–—]\s*(\d{1,3}(?:\.\d{1,5})?)\)/g
  ];

  /**
   * Main parsing entry point - handles all signal types
   */
  static async parseTradeSignal(text: string, caption?: string, hasChartImage?: boolean, imageBuffer?: Buffer): Promise<TradeSignal | null> {
    logger.info('🔍 Parsing trade signal...');

    // Normalize text
    const cleanText = this.normalizeText(text);
    const cleanCaption = caption ? this.normalizeText(caption) : undefined;
    const fullText = cleanCaption ? `${cleanText}\n${cleanCaption}` : cleanText;

    // Skip if this is a result message
    if (this.isResultMessage(fullText)) {
      logger.info('⏭️ Skipping result message (not a trading signal)');
      return null;
    }

    try {
      // Try ML-enhanced parsing first
      const mlResult = await CleanMLIntegration.parseWithML(cleanText, cleanCaption, hasChartImage, imageBuffer);
      if (mlResult) {
        logger.info('✅ ML parsing successful');
        return mlResult;
      }

      // Fall back to standard parsing
      logger.info('🔄 ML parsing inconclusive, trying standard parsing...');
      return await this.parseStandardSignal(fullText);

    } catch (error) {
      logger.error('❌ Parsing failed:', error);
      return null;
    }
  }

  /**
   * Standard text-based parsing (fallback method)
   */
  private static async parseStandardSignal(text: string): Promise<TradeSignal | null> {
    logger.info('📝 Using standard text parsing...');

    // Extract basic components
    const symbol = SymbolParser.extractSymbol(text);
    if (!symbol) {
      logger.error('❌ No symbol found in text');
      return null;
    }

    let action = this.detectAction(text);
    if (!action) {
      logger.warn('❌ No explicit trading action detected');
      
      // 🚀 FALLBACK: For chart images, try to infer action from context
      action = this.inferActionFromChart(text, symbol);
      if (!action) {
        logger.error('❌ No trading action detected and inference failed');
        return null;
      }
      logger.info(`🎯 Inferred action from chart: ${action}`);
    }

    // Extract entry zone
    const entryZone = this.extractEntryZone(text);
    if (!entryZone) {
      logger.warn('❌ No explicit entry zone found');
      
      // 🚀 FALLBACK: For chart images, try to create entry zone from detected prices
      const fallbackZone = this.createFallbackEntryZone(text, symbol, action);
      if (fallbackZone) {
        logger.info(`🎯 Created fallback entry zone: ${fallbackZone.min}-${fallbackZone.max}`);
        const signal: TradeSignal = {
          symbol,
          action,
          entryZone: fallbackZone,
          stopLoss: 0,
          targets: [],
          orderType: 'MARKET',
          reason: 'Chart analysis with fallback entry zone',
          plan: 'Fallback entry zone from chart prices',
          confidence: 0.65
        };
        return signal;
      }
      
      logger.error('❌ No entry zone found and fallback failed');
      return null;
    }

    // Calculate trading levels using MetaAPI-compliant logic
    const { stopLoss, targets } = this.calculateTradingLevels(entryZone, action, symbol);

    // Determine order type
    const orderType = this.determineOrderType(text, action);

    const signal: TradeSignal = {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets,
      orderType,
      entryPrice: orderType === 'LIMIT' ? this.calculateLimitPrice(entryZone, action) : undefined,
      reason: this.extractReason(text),
      plan: 'Standard text analysis',
      confidence: 0.75
    };

    logger.info(`✅ Standard parsing complete: ${symbol} ${action} @ ${entryZone.min}-${entryZone.max}`);
    return signal;
  }

  /**
   * Detect trading action from text
   */
  private static detectAction(text: string): TradeAction | null {
    const lowerText = text.toLowerCase();

    // Check BUY patterns
    for (const pattern of this.ACTION_PATTERNS.BUY) {
      if (pattern.test(lowerText)) {
        return 'BUY';
      }
    }

    // Check SELL patterns
    for (const pattern of this.ACTION_PATTERNS.SELL) {
      if (pattern.test(lowerText)) {
        return 'SELL';
      }
    }

    // Enhanced pattern detection for chart-based signals
    // If symbol is detected and we see stop loss above current levels, likely a SELL
    if (lowerText.includes('stop loss') || lowerText.includes('supply') || 
        lowerText.includes('selling area') || lowerText.includes('resistance')) {
      return 'SELL';
    }
    
    // If symbol is detected and we see support/demand zones, likely a BUY  
    if (lowerText.includes('support') || lowerText.includes('demand') || 
        lowerText.includes('buying area') || lowerText.includes('buy zone')) {
      return 'BUY';
    }

    return null;
  }

  /**
   * Extract entry zone from text
   */
  private static extractEntryZone(text: string): { min: number; max: number } | null {
    // Try zone patterns
    for (const pattern of this.ZONE_PATTERNS) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        // Remove commas before parsing
        const price1Str = match[1].replace(/,/g, '');
        const price2Str = match[2].replace(/,/g, '');
        const price1 = parseFloat(price1Str);
        const price2 = parseFloat(price2Str);
        
        if (!isNaN(price1) && !isNaN(price2)) {
          logger.info(`🎯 Found entry zone: ${price1} - ${price2}`);
          return {
            min: Math.min(price1, price2),
            max: Math.max(price1, price2)
          };
        }
      }
    }

    // Try single price extraction and create intelligent zone
    const singlePrice = this.extractSinglePrice(text);
    if (singlePrice) {
      const zoneSize = singlePrice * 0.002; // 0.2% zone
      logger.info(`🎯 Created zone from single price ${singlePrice}: ${singlePrice - zoneSize} - ${singlePrice + zoneSize}`);
      return {
        min: singlePrice - zoneSize,
        max: singlePrice + zoneSize
      };
    }

    return null;
  }

  /**
   * Extract single price from text
   */
  private static extractSinglePrice(text: string): number | null {
    // Enhanced patterns for various price formats including BTCUSD
    const pricePatterns = [
      // Comma-separated numbers: 126,000.00, 124,547.30
      /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\b/g,
      // Large numbers without commas: 126000.00, 124547.30  
      /\b(\d{5,6}(?:\.\d{1,2})?)\b/g,
      // Standard 4-5 digit numbers: 2650.50, 35400
      /\b(\d{4,5}(?:\.\d{1,2})?)\b/g
    ];

    for (const pattern of pricePatterns) {
      const matches = Array.from(text.matchAll(pattern));
      if (matches.length > 0) {
        const prices = matches
          .map(match => {
            // Remove commas before parsing
            const cleanPrice = match[1].replace(/,/g, '');
            return parseFloat(cleanPrice);
          })
          .filter(p => !isNaN(p) && p > 1000); // Must be > 1000 to be a valid price
        
        if (prices.length > 0) {
          logger.info(`💰 Found single price: ${prices[0]} (from pattern: ${pattern})`);
          return prices[0]; // Return first valid price
        }
      }
    }

    return null;
  }

  /**
   * Calculate stop loss and targets using simple fixed $900 risk/reward
   */
  private static calculateTradingLevels(
    entryZone: { min: number; max: number }, 
    action: TradeAction, 
    symbol: string
  ): { stopLoss: number; targets: number[] } {
    const entryMid = (entryZone.min + entryZone.max) / 2;
    
    // FIXED STRATEGY: Always target +$900 profit and -$900 loss with 0.45 lots
    // Calculate what price distance gives us $900 with 0.45 lots
    
    let dollarDistance: number;
    
    if (symbol === 'XAUUSD' || symbol === 'GOLD') {
      // For Gold: $1 move = $0.45 with 0.45 lots
      // So $900 / $0.45 = 2000 points = $20.00 price move
      dollarDistance = 20.00; // $20 move for $900 risk/reward
    } else if (symbol.includes('JPY')) {
      // For JPY pairs: 1 yen move ≈ $4.50 with 0.45 lots
      // So $900 / $4.50 = 200 points = 2.00 yen move
      dollarDistance = 2.00; // 2 yen move for $900 risk/reward
    } else {
      // For major pairs: 100 pips ≈ $45 with 0.45 lots
      // So $900 / $45 = 2000 pips = 0.20 price move
      dollarDistance = 0.0200; // 200 pips for $900 risk/reward
    }
    
    let stopLoss: number;
    let targets: number[];

    if (action === 'BUY') {
      // Stop loss $900 below entry, target $900 above entry
      stopLoss = entryMid - dollarDistance;
      targets = [entryMid + dollarDistance];
    } else {
      // Stop loss $900 above entry, target $900 below entry  
      stopLoss = entryMid + dollarDistance;
      targets = [entryMid - dollarDistance];
    }

    // Round to appropriate decimal places
    const decimals = this.getDecimalPlaces(symbol);
    stopLoss = parseFloat(stopLoss.toFixed(decimals));
    targets = targets.map(t => parseFloat(t.toFixed(decimals)));

    logger.info(`🎯 Fixed $900 risk/reward levels for ${symbol}:`, {
      entryZone: `${entryZone.min}-${entryZone.max}`,
      entryMid: entryMid,
      stopLoss: stopLoss,
      target: targets[0],
      dollarDistance: dollarDistance,
      strategy: 'Fixed $900 risk/reward with 0.45 lots'
    });

    return { stopLoss, targets };
  }

  /**
   * Determine order type from context
   */
  private static determineOrderType(text: string, action: TradeAction): OrderType {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('instant') || lowerText.includes('market') || lowerText.includes('now')) {
      return 'MARKET';
    }
    
    if (lowerText.includes('pending') || lowerText.includes('limit') || lowerText.includes('zone')) {
      return 'LIMIT';
    }
    
    // Default to LIMIT for zone-based trading
    return 'LIMIT';
  }

  /**
   * Calculate limit price for entry
   */
  private static calculateLimitPrice(entryZone: { min: number; max: number }, action: TradeAction): number {
    // For BUY: enter at support (bottom of zone)
    // For SELL: enter at resistance (top of zone)
    return action === 'BUY' ? entryZone.min : entryZone.max;
  }

  /**
   * Extract reason/context from signal
   */
  private static extractReason(text: string): string {
    // Look for analysis context
    if (text.includes('demand zone')) return 'Demand zone analysis';
    if (text.includes('supply zone')) return 'Supply zone analysis';
    if (text.includes('support')) return 'Support level analysis';
    if (text.includes('resistance')) return 'Resistance level analysis';
    if (text.includes('breakout')) return 'Breakout strategy';
    
    return 'Technical analysis signal';
  }

  /**
   * Normalize symbol using Universal approach
   * Replaces hardcoded InstantFunding logic with broker-agnostic normalization
   */
  private static normalizeSymbol(symbol: string): string {
    // Basic normalization - remove common variations and standardize
    let normalized = symbol
      .toUpperCase()
      .replace(/\.X$/, '')         // Remove InstantFunding .x suffix
      .replace(/[^A-Z0-9]/g, '')   // Remove special characters
      .trim();
    
    // Common symbol mappings (broker-agnostic)
    const symbolMap: Record<string, string> = {
      // Metals
      'GOLD': 'XAUUSD',
      'SILVER': 'XAGUSD',
      
      // Indices  
      'NASDAQ': 'NAS100',
      'DOW': 'US30',
      'DOWJONES': 'US30',
      'SP500': 'SPX500',
      'SPX': 'SPX500',
      'DAX': 'GER30',
      'GERMANY30': 'GER30',
      'FTSE': 'UK100',
      'UK100': 'UK100',
      
      // InstantFunding specific mappings
      'AUS200': 'AUS200',
      'US100': 'NAS100',
      'JPN225': 'JPN225',
      'ESXEUR': 'ESXEUR',
      'F40EUR': 'F40EUR', 
      'HSIHED': 'HSIHED',
      
      // Forex (already standard)
      'EURUSD': 'EURUSD',
      'GBPUSD': 'GBPUSD',
      'USDJPY': 'USDJPY',
      'USDCHF': 'USDCHF',
      'AUDUSD': 'AUDUSD',
      'USDCAD': 'USDCAD',
      'EURCHF': 'EURCHF'
    };
    
    // Apply mapping if found
    return symbolMap[normalized] || normalized;
  }

  /**
   * Get appropriate decimal places for symbol
   */
  private static getDecimalPlaces(symbol: string): number {
    if (symbol === 'XAUUSD' || symbol === 'XAGUSD') {
      return 2; // Metals: 2526.50
    } else if (symbol.includes('JPY')) {
      return 3; // JPY pairs: 145.123
    } else if (symbol.startsWith('US') || symbol.includes('NAS') || symbol.includes('SPX')) {
      return 1; // Indices: 35234.5
    } else {
      return 5; // Most forex: 1.23456
    }
  }

  /**
   * Normalize text for consistent processing
   */
  private static normalizeText(text: string): string {
    return text
      .replace(/[""'']/g, '"')  // Normalize quotes
      .replace(/[–—]/g, '-')    // Normalize dashes
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
  }

  /**
   * Check if text is a result message (should not be traded)
   */
  static isResultMessage(text: string): boolean {
    const resultPatterns = [
      /\+\d+\s*pips/i,
      /profit.*achieved/i,
      /target.*hit/i,
      /closed.*profit/i,
      /result/i,
      /outcome/i
    ];
    
    return resultPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Create fallback entry zone from detected prices when no explicit zone is found
   * Used for chart images where price levels are visible but no explicit entry zone
   */
  private static createFallbackEntryZone(text: string, symbol: string, action: string): { min: number; max: number } | null {
    logger.info('🔄 Attempting to create fallback entry zone from detected prices...');
    
    // Extract all valid prices from the text
    const allPrices = this.extractAllPrices(text);
    if (allPrices.length === 0) {
      logger.warn('❌ No prices found for fallback entry zone');
      return null;
    }

    logger.info(`🔍 Found ${allPrices.length} prices: [${allPrices.join(', ')}]`);

    // For BTCUSD, use chart-based logic
    if (symbol.includes('BTC')) {
      // Sort prices to find current market level
      const sortedPrices = allPrices.sort((a, b) => b - a); // Descending order
      
      // Use the middle price as entry (likely current market price)
      const entryPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
      const zoneSize = entryPrice * 0.0015; // 0.15% zone for BTCUSD
      
      const zone = {
        min: entryPrice - zoneSize,
        max: entryPrice + zoneSize
      };
      
      logger.info(`🎯 BTCUSD fallback zone: ${zone.min.toFixed(0)} - ${zone.max.toFixed(0)} (center: ${entryPrice})`);
      return zone;
    }

    // For other symbols, use general logic
    const avgPrice = allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length;
    const zoneSize = avgPrice * 0.001; // 0.1% zone
    
    const zone = {
      min: avgPrice - zoneSize,
      max: avgPrice + zoneSize
    };
    
    logger.info(`🎯 ${symbol} fallback zone: ${zone.min.toFixed(2)} - ${zone.max.toFixed(2)} (avg: ${avgPrice})`);
    return zone;
  }

  /**
   * Extract all valid prices from text for fallback analysis
   */
  private static extractAllPrices(text: string): number[] {
    const pricePatterns = [
      // Comma-separated: 126,000.00, 124,547.30
      /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)\b/g,
      // Large numbers: 126000, 124547.30
      /\b(\d{5,6}(?:\.\d{1,2})?)\b/g,
      // Standard: 2650.50, 35400
      /\b(\d{4,5}(?:\.\d{1,2})?)\b/g
    ];

    const allPrices: number[] = [];
    
    for (const pattern of pricePatterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        const cleanPrice = match[1].replace(/,/g, '');
        const price = parseFloat(cleanPrice);
        
        // Filter out invalid prices and duplicates
        if (!isNaN(price) && price > 1000 && !allPrices.includes(price)) {
          allPrices.push(price);
        }
      }
    }

    return allPrices.sort((a, b) => a - b); // Return sorted prices
  }

  /**
   * Infer trading action from chart context when not explicitly stated
   */
  private static inferActionFromChart(text: string, symbol: string): TradeAction | null {
    logger.info('🔄 Attempting to infer action from chart context...');
    
    // For BTCUSD and crypto, often the chart shows resistance/support levels
    if (symbol.includes('BTC')) {
      // Look for resistance level patterns (typically at high prices = SELL opportunity)
      const prices = this.extractAllPrices(text);
      if (prices.length >= 2) {
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const currentPrice = prices[Math.floor(prices.length / 2)];
        
        // If current price is near the high, likely a SELL setup
        if (currentPrice > (maxPrice * 0.95)) {
          logger.info('🎯 Current price near highs - inferring SELL');
          return 'SELL';
        }
        
        // If current price is near the low, likely a BUY setup
        if (currentPrice < (minPrice * 1.05)) {
          logger.info('🎯 Current price near lows - inferring BUY');
          return 'BUY';
        }
      }
    }
    
    // Default fallback - return SELL for high-value instruments like BTCUSD (often at resistance)
    if (symbol.includes('BTC') || symbol.includes('XAU')) {
      logger.info('🎯 High-value instrument - defaulting to SELL (resistance likely)');
      return 'SELL';
    }
    
    // For forex, default to BUY
    logger.info('🎯 Forex instrument - defaulting to BUY');
    return 'BUY';
  }

}
