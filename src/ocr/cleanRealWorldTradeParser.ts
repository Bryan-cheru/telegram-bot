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
import { calculateFixedDollarStopsAndTargets, formatPriceForInstrument } from '../trading/riskMath';

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

    // Skip if this is not an entry signal (results/updates/promos/closures)
    if (this.isNonEntryMessage(fullText)) {
      logger.info('⏭️ Skipping non-entry message');
      return null;
    }

    try {
      // Prefer deterministic parsing first for channel-style signals.
      const standard = await this.parseStandardSignal(fullText, hasChartImage);
      if (standard) return standard;

      // If we have an image (Telegram photo or TradingView OG preview), allow ML as fallback.
      if (hasChartImage && imageBuffer) {
        const mlResult = await CleanMLIntegration.parseWithML(cleanText, cleanCaption, hasChartImage, imageBuffer);
        if (mlResult) {
          logger.info('✅ ML parsing successful');
          return mlResult;
        }
      }

      return null;

    } catch (error) {
      logger.error('❌ Parsing failed:', error);
      return null;
    }
  }

  /**
   * Standard text-based parsing (fallback method)
   */
  private static async parseStandardSignal(text: string, hasChartImage?: boolean): Promise<TradeSignal | null> {
    logger.info('📝 Using standard text parsing...');

    // Extract basic components
    const symbol = SymbolParser.extractSymbol(text);
    if (!symbol) {
      logger.error('❌ No symbol found in text');
      return null;
    }

    let action = this.detectAction(text);
    if (!action) {
      // If this is just "$XAUUSD:" + TradingView link, do NOT trade.
      // We only infer action when there's strong textual intent OR explicit pricing.
      if (!hasChartImage || !this.hasStrongSignalIntent(text)) {
        logger.warn('❌ No explicit trading action detected (ignoring non-explicit post)');
        return null;
      }
      action = this.inferActionFromChart(text, symbol);
      if (!action) return null;
    }

    // SL/TP first — used for entry inference when channel posts "Buy/Sell Now" with no numeric entry (e.g. V100).
    const explicitStopEarly = this.extractStopLoss(text);
    const explicitTpsEarly = this.extractTargets(text);

    // Extract entry price/zone (supports: "Sell Now 4566.80", "Sell Limit 4644.10", ranges)
    const extractedEntry = this.extractEntry(text);
    // "Buy/Sell Now" with no price after it — extractEntry returns null but extractSinglePrice
    // would blindly steal the first TP value as the entry, making TP === entry.
    const hasNowWithoutPrice = !extractedEntry && /\b(buy|sell)\s+now\b/i.test(text);

    let entryZone: { min: number; max: number } | null = extractedEntry?.entryZone ?? null;
    if (!entryZone) {
      if (!hasNowWithoutPrice) {
        // Only call extractEntryZone when there is no "Now" keyword without a price —
        // otherwise extractSinglePrice would pick up a TP level as the entry.
        entryZone = this.extractEntryZone(text);
      }
      if (!entryZone && explicitStopEarly != null && explicitTpsEarly.length > 0) {
        const inferred = this.inferEntryZoneFromSlTp(action, explicitStopEarly, explicitTpsEarly);
        if (inferred) {
          entryZone = inferred;
          logger.info(`🎯 Inferred entry zone from SL/TP geometry: ${inferred.min}–${inferred.max}`);
        }
      }
    }

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

    // "Buy/Sell Now" without a specific price → execute at market, not as a pending limit
    const orderType: OrderType = hasNowWithoutPrice
      ? 'MARKET'
      : (extractedEntry?.orderType || this.determineOrderType(text, action));

    // Extract explicit SL/TP if provided (preferred). Otherwise compute from fixed-$ risk.
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const explicitStop = explicitStopEarly;
    const explicitTps = explicitTpsEarly;

    const fixedLotSize = parseFloat(process.env.FIXED_LOT_SIZE || '0.45');
    const fixedRiskAmount = parseFloat(process.env.FIXED_RISK_AMOUNT || '900');
    const rr = parseFloat(process.env.RISK_REWARD_RATIO || '1.5');
    const computed = calculateFixedDollarStopsAndTargets({
      symbol,
      entryPrice: entryMid,
      direction: action,
      config: { lotSize: fixedLotSize, riskAmount: fixedRiskAmount, riskRewardRatio: rr }
    });

    const stopLoss = formatPriceForInstrument(explicitStop ?? computed.stopLoss, symbol);
    const targets = (explicitTps.length ? explicitTps : computed.targets).map(t => formatPriceForInstrument(t, symbol));

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

  private static hasStrongSignalIntent(text: string): boolean {
    const t = text.toLowerCase();
    return (
      /\b(buy|sell)\b/.test(t) ||
      /\b(limit|now|entry|tp|sl|stop)\b/.test(t)
    );
  }

  /**
   * Channel-specific: parse "SELL NOW 4566.80", "SELL LIMIT 4644.10", "@ 1.2345"
   * Returns an entry zone and an order type when possible.
   */
  private static extractEntry(text: string): { entryZone: { min: number; max: number }; orderType: OrderType } | null {
    const t = text.replace(/,/g, ' ');

    const m =
      t.match(/\b(buy|sell)\s+(now|limit)\s+(\d{1,6}(?:\.\d{1,5})?)\b/i) ||
      t.match(/\b(buy|sell)\s+(\d{1,6}(?:\.\d{1,5})?)\b/i) ||
      t.match(/@\s*(\d{1,6}(?:\.\d{1,5})?)\b/i);

    if (!m) return null;

    const priceStr = m[m.length - 1];
    const entry = parseFloat(priceStr);
    if (!isFinite(entry) || entry <= 0) return null;

    // Small zone around single entry price (0.2% default, but avoid absurdly wide zones for small prices)
    const zoneSize = Math.max(entry * 0.002, 0.0002);
    // Always LIMIT — "now" means enter at this price, not at whatever market is doing at execution time
    const orderType: OrderType = 'LIMIT';

    return { entryZone: { min: entry - zoneSize, max: entry + zoneSize }, orderType };
  }

  /**
   * When the post gives SL + TP(s) but no entry (common on synthetic indices), estimate entry as midpoint
   * between SL and the nearest TP in the profit direction.
   */
  private static inferEntryZoneFromSlTp(
    action: TradeAction,
    sl: number,
    tps: number[]
  ): { min: number; max: number } | null {
    if (!isFinite(sl) || tps.length === 0) return null;
    const minTp = Math.min(...tps);
    const maxTp = Math.max(...tps);
    if (action === 'BUY') {
      if (!(sl < minTp)) return null;
      const mid = (sl + minTp) / 2;
      const zoneSize = Math.max(mid * 0.002, 0.25);
      return { min: mid - zoneSize, max: mid + zoneSize };
    }
    if (!(sl > maxTp)) return null;
    const mid = (sl + maxTp) / 2;
    const zoneSize = Math.max(mid * 0.002, 0.0002);
    return { min: mid - zoneSize, max: mid + zoneSize };
  }

  private static extractStopLoss(text: string): number | null {
    const cap = '((?:\\d{1,3}(?:,\\d{3})+|\\d{1,8})(?:\\.\\d{1,5})?)';
    const m =
      text.match(new RegExp(`\\bSL\\b\\s*[:-]?\\s*${cap}`, 'i')) ||
      text.match(new RegExp(`\\bstop\\s*loss\\b\\s*[:-]?\\s*${cap}`, 'i'));
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ''));
    return isFinite(v) ? v : null;
  }

  private static extractTargets(text: string): number[] {
    const targets: number[] = [];
    const cap = '((?:\\d{1,3}(?:,\\d{3})+|\\d{1,8})(?:\\.\\d{1,5})?)';
    const re = new RegExp(`\\bTP\\d*\\b\\s*[:-]?\\s*${cap}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (isFinite(v)) targets.push(v);
    }
    return targets;
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
   * Determine order type from context
   */
  private static determineOrderType(text: string, action: TradeAction): OrderType {
    // Always LIMIT — execution at signal price is the only way to ensure correct entries
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
   * Filters out messages that should never be treated as *new entry* signals.
   * This matches your channel examples: results, "activated", "going well", "use this broker", "I'll close here", etc.
   */
  private static isNonEntryMessage(text: string): boolean {
    const t = text.toLowerCase();

    // Results / progress updates
    if (this.isResultMessage(text)) return true;
    if (/\b(activated|running|going well|after result)\b/i.test(text)) return true;
    if (/\b(got stopped|stopped out|stop(ped)?\b)\b/i.test(text)) return true;

    // Explicit closures (not new entries)
    if (/\b(close|closed)\b/i.test(text) && !/\b(close\s*all|close\s*#\d+)\b/i.test(text)) return true;

    // Promotions / broker links
    if (/\b(deposit|broker|track\.|deriv|open 24\/7|profit split|discordpremiumsignal)\b/i.test(text)) return true;

    // Generic commentary with no actionable fields
    const hasAction = /\b(buy|sell|selling|buying|bullish|bearish)\b/i.test(text) ||
      /\b(supply\s+zone|demand\s+zone|sell\s+zone|buy\s+zone)\b/i.test(text);
    const hasSlTp = /\b(sl|tp|stop loss|target)\b/i.test(text);
    const hasEntryPrice = /\b(buy|sell)\s+(now|limit)\s+\d/i.test(text) || /@\s*\d/.test(text);
    if (!hasAction && !hasSlTp && !hasEntryPrice) return true;

    return false;
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
