import { TradeSignal, TradeAction, OrderType } from '../types';
import { logger } from '../utils/logger';
import { DynamicSymbolExtractor } from './dynamicSymbolExtractor';

/**
 * CLEAN REAL-WORLD TRADE PARSER
 * Built specifically for your actual trading signals
 * 
 * Handles formats like:
 * "#XAUUSD (Update)...!! 🔼
 * Gold is approaching the highlighted demand zone (3526 – 3521). 
 * This area is marked as an instant buy zone..."
 */
export class RealWorldTradeParser {
  
  /**
   * Parse your actual signal format with enhanced error handling
   */
  async parseTradeSignal(text: string, caption?: string): Promise<TradeSignal | null> {
    try {
      logger.info('🎯 Parsing real-world trading signal...');
      
      const fullText = caption ? `${text}\n${caption}` : text;
      logger.debug('Full signal text:', fullText);

      // CRITICAL: Validate input data
      if (!fullText || fullText.trim().length < 10) {
        logger.error('❌ OCR FAILURE: Signal text too short or empty', { 
          textLength: fullText?.length || 0,
          text: fullText?.substring(0, 50) 
        });
        return null;
      }

      // Extract symbol from hashtag - USE DYNAMIC BROKER SYMBOLS
      const symbol = await DynamicSymbolExtractor.extractSymbolFromText(fullText);
      if (!symbol) {
        logger.error('❌ OCR FAILURE: No trading symbol found in broker symbol lists', { 
          text: fullText.substring(0, 100),
          confidence: 'LOW',
          availableSymbols: Object.keys(DynamicSymbolExtractor.getAllAvailableSymbols()).length
        });
        return this.fallbackSymbolDetection(fullText);
      }

      // Detect action from context
      const action = this.detectAction(fullText);
      if (!action) {
        logger.error('❌ OCR FAILURE: No clear trading action detected', { 
          text: fullText.substring(0, 100),
          confidence: 'LOW' 
        });
        return this.fallbackActionDetection(fullText, symbol);
      }

      // Extract entry zone from parentheses like (3526 – 3521)
      const entryZone = this.extractEntryZone(fullText, symbol);
      if (!entryZone) {
        logger.error('❌ OCR FAILURE: No entry zone found', { 
          symbol,
          action,
          text: fullText.substring(0, 100),
          confidence: 'LOW' 
        });
        return this.fallbackPriceDetection(fullText, symbol, action);
      }

      // CRITICAL: Validate price ranges
      if (!this.validatePriceRange(entryZone, symbol)) {
        logger.error('❌ OCR VALIDATION FAILED: Invalid price range detected', {
          symbol,
          entryZone,
          confidence: 'DANGEROUS'
        });
        return null;
      }

      // Calculate stop loss and targets
      const { stopLoss, targets } = this.calculateLevels(entryZone, action, symbol);

      // Determine order type
      const orderType = this.determineOrderType(fullText);

      const signal: TradeSignal = {
        symbol,
        action,
        entryZone,
        stopLoss,
        targets,
        orderType,
        entryPrice: orderType === 'LIMIT' ? 
          (action === 'BUY' ? entryZone.min : entryZone.max) : undefined,
        reason: this.extractReason(fullText),
        plan: 'Real-world signal detected and validated',
        confidence: this.calculateConfidenceScore(fullText, symbol, action, entryZone)
      };

      // CRITICAL: Final validation before returning
      if (signal.confidence && signal.confidence < 0.7) {
        logger.warn('⚠️ LOW CONFIDENCE SIGNAL - Manual review recommended', {
          confidence: signal.confidence,
          signal: signal
        });
      }

      logger.info('✅ Successfully parsed real-world signal:', {
        symbol: signal.symbol,
        action: signal.action,
        entryZone: signal.entryZone,
        stopLoss: signal.stopLoss,
        targets: signal.targets,
        orderType: signal.orderType,
        confidence: signal.confidence || 0.5
      });

      return signal;

    } catch (error) {
      logger.error('🚨 CRITICAL OCR ERROR:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        inputText: text?.substring(0, 100),
        inputCaption: caption?.substring(0, 100)
      });
      return null;
    }
  }

  /**
   * Extract symbol from hashtag (#XAUUSD, #EURUSD, etc.)
   * Using MT5 Copier symbol mapping: GOLD=XAUUSD, SILVER=XAGUSD
   */
  private extractSymbol(text: string): string | null {
    const symbolPatterns = [
      // Standard hashtag symbols
      /#(XAUUSD|GOLD)/i,
      /#(XAGUSD|SILVER)/i,
      /#(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)/i,
      /#(EURJPY|GBPJPY|EURGBP|AUDJPY|EURAUD|EURCHF)/i,
      /#(US30|NAS100|SPX500|UK100|GER30)/i,
      // Without hashtag but with context
      /\b(XAUUSD|GOLD|EURUSD|GBPUSD|USDJPY)\b/i
    ];

    for (const pattern of symbolPatterns) {
      const match = text.match(pattern);
      if (match) {
        let symbol = match[1].toUpperCase();
        // MT5 Copier symbol mapping
        if (symbol === 'GOLD') symbol = 'XAUUSD';
        if (symbol === 'SILVER') symbol = 'XAGUSD';
        return symbol;
      }
    }

    return null;
  }

  /**
   * Detect trading action from signal context
   */
  private detectAction(text: string): TradeAction | null {
    const textLower = text.toLowerCase();

    // BUY indicators (from MT5 Copier proven keywords)
    const buyKeywords = [
      // Direct buy signals
      'buy', 'long',
      // Buy order types
      'buy limit', 'buy-limit', 'buylimit',
      'buy stop', 'buy-stop', 'buystop',
      // Zone-based buy signals
      'instant buy zone', 'buy zone', 'demand zone', 'support zone',
      'buying area', 'buying zone',
      // Context indicators
      'push higher', 'bullish', '🔼', 'buy setup', 'take support',
      'entry zone.*buy', 'long position'
    ];

    // SELL indicators (from MT5 Copier proven keywords)  
    const sellKeywords = [
      // Direct sell signals
      'sell', 'short',
      // Sell order types
      'sell limit', 'sell-limit', 'selllimit',
      'sell stop', 'sell-stop', 'sellstop',
      // Zone-based sell signals
      'instant sell zone', 'sell zone', 'supply zone', 'resistance zone',
      'selling area', 'selling zone',
      // Context indicators
      'push lower', 'bearish', '🔽', 'sell setup', 'rejection zone',
      'entry zone.*sell', 'short position'
    ];

    const buyScore = buyKeywords.filter(keyword => textLower.includes(keyword)).length;
    const sellScore = sellKeywords.filter(keyword => textLower.includes(keyword)).length;

    if (buyScore > sellScore && buyScore > 0) return 'BUY';
    if (sellScore > buyScore && sellScore > 0) return 'SELL';

    // Fallback - but be more specific
    if (textLower.includes(' buy ') && !textLower.includes(' sell ')) return 'BUY';
    if (textLower.includes(' sell ') && !textLower.includes(' buy ')) return 'SELL';

    return null;
  }

  /**
   * Extract entry zone from parentheses (3526 – 3521)
   */
  private extractEntryZone(text: string, symbol: string): { min: number; max: number } | null {
    const zonePatterns = [
      // Standard parentheses format: (3526 – 3521)
      /\((\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)\)/g,
      // Entry keywords from MT5 Copier: "at price", "entry", "@", "now", "entry zone"
      /(?:at\s+price|entry|@|now|entry\s+zone)[^\d]*(\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)/gi,
      /zone[^\d]*(\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)/gi,
      /area[^\d]*(\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)/gi,
      /between[^\d]*(\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)/gi,
      // Flexible format for any range
      /(\d+\.?\d*)\s*[–—-]\s*(\d+\.?\d*)/g
    ];

    for (const pattern of zonePatterns) {
      const matches = [...text.matchAll(pattern)];
      
      for (const match of matches) {
        const price1 = parseFloat(match[1]);
        const price2 = parseFloat(match[2]);
        
        if (!isNaN(price1) && !isNaN(price2) && this.isValidPrice(price1, symbol) && this.isValidPrice(price2, symbol)) {
          return {
            min: Math.min(price1, price2),
            max: Math.max(price1, price2)
          };
        }
      }
    }

    return null;
  }

  /**
   * Validate price for symbol
   */
  private isValidPrice(price: number, symbol?: string): boolean {
    if (!symbol) return true; // If no symbol provided, accept any valid number
    
    const symbolUpper = symbol.toUpperCase();
    
    // XAGUSD (Silver) price validation - typical range 15-40
    if (symbolUpper.includes('XAGUSD') || symbolUpper.includes('SILVER')) return price >= 10 && price <= 50;
    // XAUUSD (Gold) price validation  
    if (symbolUpper.includes('XAUUSD') || symbolUpper.includes('GOLD')) return price >= 1500 && price <= 5000;
    // EUR/GBP pairs
    if (symbolUpper.includes('EUR') || symbolUpper.includes('GBP')) return price >= 0.5 && price <= 2.5;
    // JPY pairs
    if (symbolUpper.includes('JPY')) return price >= 80 && price <= 200;
    // Indices
    if (symbolUpper.includes('NAS') || symbolUpper.includes('US30')) return price >= 10000 && price <= 50000;
    
    return true;
  }

  /**
   * Calculate stop loss and targets
   */
  private calculateLevels(
    entryZone: { min: number; max: number }, 
    action: TradeAction, 
    symbol: string
  ): { stopLoss: number; targets: number[] } {
    
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const zoneSize = entryZone.max - entryZone.min;
    const riskDistance = zoneSize * 2; // 2x zone size for risk

    let stopLoss: number;
    let targets: number[];
    
    if (action === 'BUY') {
      stopLoss = entryZone.min - riskDistance;
      targets = [
        entryZone.max + riskDistance,        // 1:1 RR
        entryZone.max + (riskDistance * 1.5), // 1.5:1 RR  
        entryZone.max + (riskDistance * 2)     // 2:1 RR
      ];
    } else {
      stopLoss = entryZone.max + riskDistance;
      targets = [
        entryZone.min - riskDistance,        // 1:1 RR
        entryZone.min - (riskDistance * 1.5), // 1.5:1 RR
        entryZone.min - (riskDistance * 2)     // 2:1 RR
      ];
    }

    const decimals = this.getDecimalPlaces(symbol);
    stopLoss = parseFloat(stopLoss.toFixed(decimals));
    targets = targets.map(t => parseFloat(t.toFixed(decimals)));

    return { stopLoss, targets };
  }

  /**
   * Determine order type
   */
  private determineOrderType(text: string): OrderType {
    const textLower = text.toLowerCase();
    
    if (textLower.includes('instant') || textLower.includes('zone')) return 'LIMIT';
    if (textLower.includes('scalping')) return 'MARKET';
    
    return 'LIMIT'; // Default for zone-based signals
  }

  /**
   * Extract reason from signal
   */
  private extractReason(text: string): string {
    const keywords = ['demand zone', 'supply zone', 'support', 'resistance', 'bullish', 'bearish'];
    const found = keywords.filter(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
    
    if (found.length > 0) {
      return `Signal based on: ${found.join(', ')}`;
    }
    
    return 'Real-world trading signal detected';
  }

  /**
   * Get decimal places for symbol
   */
  private getDecimalPlaces(symbol: string): number {
    const symbolUpper = symbol.toUpperCase();
    
    if (symbolUpper.includes('XAUUSD')) return 2;
    if (symbolUpper.includes('JPY')) return 3;
    if (symbolUpper.includes('US30') || symbolUpper.includes('NAS')) return 1;
    
    return 5;
  }

  /**
   * Validate the parsed signal
   */
  validateTradeSignal(signal: TradeSignal): boolean {
    if (!signal.symbol || !signal.action) return false;
    if (!signal.entryZone || signal.entryZone.min >= signal.entryZone.max) return false;
    if (!signal.stopLoss || !signal.targets || signal.targets.length === 0) return false;
    
    // Check logical placement
    if (signal.action === 'BUY') {
      if (signal.stopLoss >= signal.entryZone.min) return false;
      if (signal.targets.some(t => t <= signal.entryZone.max)) return false;
    } else {
      if (signal.stopLoss <= signal.entryZone.max) return false;
      if (signal.targets.some(t => t >= signal.entryZone.min)) return false;
    }
    
    return true;
  }

  /**
   * CRITICAL OCR FALLBACK METHODS
   */

  /**
   * Fallback symbol detection when primary method fails
   */
  private fallbackSymbolDetection(text: string): TradeSignal | null {
    logger.warn('🔍 Attempting fallback symbol detection...');
    
    // Common symbol variations and typos
    const fallbackPatterns = [
      { pattern: /gold|au|xau/i, symbol: 'XAUUSD' },
      { pattern: /silver|ag|xag/i, symbol: 'XAGUSD' },
      { pattern: /euro?|eur/i, symbol: 'EURUSD' },
      { pattern: /pound|gbp/i, symbol: 'GBPUSD' },
      { pattern: /yen|jpy|usd.*jp/i, symbol: 'USDJPY' }
    ];

    for (const { pattern, symbol } of fallbackPatterns) {
      if (pattern.test(text)) {
        logger.info(`🎯 Fallback detected symbol: ${symbol}`);
        // Return minimal signal requiring manual validation
        return {
          symbol,
          action: 'BUY', // Default - requires manual confirmation
          entryZone: { min: 0, max: 0 },
          stopLoss: 0,
          targets: [0],
          confidence: 0.3, // Low confidence
          reason: 'OCR fallback detection - requires manual validation'
        };
      }
    }

    return null;
  }

  /**
   * Fallback action detection from context clues
   */
  private fallbackActionDetection(text: string, symbol: string): TradeSignal | null {
    logger.warn('🔍 Attempting fallback action detection...');
    
    const buyPatterns = /buy|long|bull|up|support|demand|floor/i;
    const sellPatterns = /sell|short|bear|down|resistance|supply|ceiling/i;
    
    let action: 'BUY' | 'SELL' = 'BUY'; // Default
    
    if (sellPatterns.test(text) && !buyPatterns.test(text)) {
      action = 'SELL';
    }
    
    logger.info(`🎯 Fallback detected action: ${action}`);
    
    return {
      symbol,
      action,
      entryZone: { min: 0, max: 0 },
      stopLoss: 0,
      targets: [0],
      confidence: 0.4, // Low confidence
      reason: 'OCR fallback action detection - requires manual validation'
    };
  }

  /**
   * Fallback price detection using number patterns
   */
  private fallbackPriceDetection(text: string, symbol: string, action: 'BUY' | 'SELL'): TradeSignal | null {
    logger.warn('🔍 Attempting fallback price detection...');
    
    // Extract any numbers that might be prices
    const numberPattern = /(\d{1,5}\.?\d{0,5})/g;
    const numbers = text.match(numberPattern);
    
    if (!numbers || numbers.length < 2) {
      logger.error('❌ Fallback failed - insufficient numerical data');
      return null;
    }
    
    const prices = numbers.map(n => parseFloat(n)).filter(n => n > 0);
    
    if (prices.length < 2) {
      return null;
    }
    
    // Assume first two numbers are entry zone
    const [price1, price2] = prices.sort((a, b) => a - b);
    
    return {
      symbol,
      action,
      entryZone: { min: price1, max: price2 },
      stopLoss: action === 'BUY' ? price1 - (price2 - price1) : price2 + (price2 - price1),
      targets: [action === 'BUY' ? price2 + (price2 - price1) : price1 - (price2 - price1)],
      confidence: 0.5, // Medium-low confidence
      reason: 'OCR fallback price detection - requires manual validation'
    };
  }

  /**
   * Validate price ranges are realistic for the symbol
   */
  private validatePriceRange(entryZone: { min: number; max: number }, symbol: string): boolean {
    const priceRanges: Record<string, { min: number; max: number }> = {
      'XAUUSD': { min: 1500, max: 4000 },
      'XAGUSD': { min: 15, max: 50 },
      'EURUSD': { min: 0.9, max: 1.3 },
      'GBPUSD': { min: 1.0, max: 1.6 },
      'USDJPY': { min: 90, max: 160 }
    };
    
    const range = priceRanges[symbol];
    if (!range) {
      logger.warn(`No validation range for symbol: ${symbol}`);
      return true; // Assume valid for unknown symbols
    }
    
    const isValid = (
      entryZone.min >= range.min && entryZone.min <= range.max &&
      entryZone.max >= range.min && entryZone.max <= range.max &&
      entryZone.min <= entryZone.max
    );
    
    if (!isValid) {
      logger.error('❌ Price validation failed:', {
        symbol,
        entryZone,
        validRange: range
      });
    }
    
    return isValid;
  }

  /**
   * Calculate confidence score based on parsing quality
   */
  private calculateConfidenceScore(text: string, symbol: string, action: string, entryZone: any): number {
    let confidence = 0.5; // Base confidence
    
    // Symbol confidence
    if (text.includes(`#${symbol}`)) confidence += 0.2;
    
    // Action confidence
    const actionWords = action === 'BUY' ? ['buy', 'long', 'bull'] : ['sell', 'short', 'bear'];
    if (actionWords.some(word => text.toLowerCase().includes(word))) confidence += 0.2;
    
    // Price confidence
    if (entryZone.min > 0 && entryZone.max > 0 && entryZone.max > entryZone.min) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Check if message is a result/update message (not a new signal)
   * Using proven MT5 Copier filter keywords
   */
  isResultOrUpdateMessage(text: string): boolean {
    // Keywords from MT5 Copier configuration - be more specific to avoid false positives
    const ignoreKeywords = [
      // From "Signal do not include text" setting
      'report', 'results', 'summary',
      // Additional result indicators - be more specific
      'closed', 'hit tp', 'target reached', 'stopped out', 'result:', 
      'profit made', 'loss made', 'pips gained', 'pips lost', 'congratulations', 'well done',
      // Order management results
      'order closed', 'order canceled', 'order modified',
      'partial close', 'close half', 'breakeven activated',
      // Update messages
      'update -', 'previous signal', 'trade closed', 'signal completed'
    ];
    
    // Check each keyword more carefully to avoid false positives like "Stop Loss:"
    return ignoreKeywords.some(keyword => {
      const lowerText = text.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      
      // For keywords ending with ':', make sure they're not preceded by common signal words
      if (lowerKeyword.endsWith(':')) {
        const index = lowerText.indexOf(lowerKeyword);
        if (index > 0) {
          const beforeKeyword = lowerText.substring(Math.max(0, index - 10), index).trim();
          // Skip if preceded by signal terms
          if (beforeKeyword.includes('stop') || beforeKeyword.includes('take') || 
              beforeKeyword.includes('entry') || beforeKeyword.includes('target')) {
            return false;
          }
        }
      }
      
      return lowerText.includes(lowerKeyword);
    });
  }

  /**
   * Add position sizing to signal (stub for compatibility)
   */
  addPositionSizing(signal: TradeSignal, accountEquity: number): void {
    // Position sizing can be added here if needed
    logger.info(`Position sizing calculation for ${signal.symbol} with equity ${accountEquity}`);
  }
}
