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
    /#(ESXEUR|F40EUR|HSIHED)(?:\.x)?/i,
    // Word boundaries without hashtag (with optional .x suffix)
    /\b(XAUUSD|GOLD|EURUSD|GBPUSD|EURCHF|EURGBP|EURJPY|GBPCHF|GBPJPY|CHFJPY|US30|NAS100|SPX500|UK100|GER30|US100|AUS200|JPN225)(?:\.x)?\b/i
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
    // Range patterns: "2526 - 2521", "2526 – 2521", "2526-2521"
    /(\d{4,5}(?:\.\d{1,2})?)\s*[-–—]\s*(\d{4,5}(?:\.\d{1,2})?)/g,
    // Parenthetical ranges: "(2526 – 2521)"
    /\((\d{4,5}(?:\.\d{1,2})?)\s*[-–—]\s*(\d{4,5}(?:\.\d{1,2})?)\)/g
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

    const action = this.detectAction(text);
    if (!action) {
      logger.error('❌ No trading action detected');
      return null;
    }

    // Extract entry zone
    const entryZone = this.extractEntryZone(text);
    if (!entryZone) {
      logger.error('❌ No entry zone found');
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
        const price1 = parseFloat(match[1]);
        const price2 = parseFloat(match[2]);
        
        if (!isNaN(price1) && !isNaN(price2)) {
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
    // Look for 4-5 digit numbers with optional decimals
    const priceMatches = text.match(/\b(\d{4,5}(?:\.\d{1,2})?)\b/g);
    
    if (priceMatches && priceMatches.length > 0) {
      const prices = priceMatches
        .map(p => parseFloat(p))
        .filter(p => !isNaN(p) && p > 1000);
      
      if (prices.length > 0) {
        return prices[0]; // Return first valid price
      }
    }

    return null;
  }

  /**
   * Calculate stop loss and targets using MetaAPI standards
   */
  private static calculateTradingLevels(
    entryZone: { min: number; max: number }, 
    action: TradeAction, 
    symbol: string
  ): { stopLoss: number; targets: number[] } {
    const entryMid = (entryZone.min + entryZone.max) / 2;
    
    // Get risk percentage from environment (default 0.45%)
    const riskPercent = parseFloat(process.env.RISK_PERCENTAGE || '0.45');
    
    // Calculate risk-based stop loss distance
    // For XAUUSD: Use $25-30 as standard risk distance (good for 0.45% risk on $10k account)
    // For forex pairs: Use percentage-based approach
    let riskDistance: number;
    
    if (symbol === 'XAUUSD' || symbol === 'GOLD') {
      // For Gold: $25-30 represents good risk for 0.45% on standard account
      riskDistance = 25;
    } else if (symbol.includes('JPY')) {
      // For JPY pairs: 50-100 pips
      riskDistance = entryMid * 0.005; // 0.5%
    } else {
      // For major pairs: 20-50 pips equivalent
      riskDistance = entryMid * 0.003; // 0.3%
    }
    
    let stopLoss: number;
    let targets: number[];

    if (action === 'BUY') {
      // Stop loss below entry zone
      stopLoss = entryZone.min - riskDistance;
      // 1:1 Risk-Reward ratio target
      targets = [entryMid + riskDistance]; // 1R target (1:1 RR)
    } else {
      // Stop loss above entry zone  
      stopLoss = entryZone.max + riskDistance;
      // 1:1 Risk-Reward ratio target
      targets = [entryMid - riskDistance]; // 1R target (1:1 RR)
    }

    // Round to appropriate decimal places
    const decimals = this.getDecimalPlaces(symbol);
    stopLoss = parseFloat(stopLoss.toFixed(decimals));
    targets = targets.map(t => parseFloat(t.toFixed(decimals)));

    logger.info(`🎯 Calculated risk-based levels for ${symbol}:`, {
      entryZone: `${entryZone.min}-${entryZone.max}`,
      entryMid: entryMid,
      stopLoss: stopLoss,
      target: targets[0],
      riskDistance: riskDistance,
      riskPercent: `${riskPercent}%`,
      riskReward: '1:1'
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

}
