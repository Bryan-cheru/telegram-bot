import { TradeSignal, TradeAction, OrderType } from '../types';
import { logger } from '../utils/logger';

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
   * Parse your actual signal format
   */
  parseTradeSignal(text: string, caption?: string): TradeSignal | null {
    try {
      logger.info('🎯 Parsing real-world trading signal...');
      
      const fullText = caption ? `${text}\n${caption}` : text;
      logger.debug('Full signal text:', fullText);

      // Extract symbol from hashtag
      const symbol = this.extractSymbol(fullText);
      if (!symbol) {
        logger.warn('No trading symbol found in signal');
        return null;
      }

      // Detect action from context
      const action = this.detectAction(fullText);
      if (!action) {
        logger.warn('No clear trading action detected');
        return null;
      }

      // Extract entry zone from parentheses like (3526 – 3521)
      const entryZone = this.extractEntryZone(fullText, symbol);
      if (!entryZone) {
        logger.warn('No entry zone found in signal');
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
        plan: 'Real-world signal detected and validated'
      };

      logger.info('✅ Successfully parsed real-world signal:', {
        symbol: signal.symbol,
        action: signal.action,
        entryZone: signal.entryZone,
        stopLoss: signal.stopLoss,
        targets: signal.targets,
        orderType: signal.orderType
      });

      return signal;

    } catch (error) {
      logger.error('Error parsing real-world signal:', error);
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
  private isValidPrice(price: number, symbol: string): boolean {
    const symbolUpper = symbol.toUpperCase();
    
    if (symbolUpper.includes('XAUUSD')) return price >= 1500 && price <= 5000;
    if (symbolUpper.includes('EUR') || symbolUpper.includes('GBP')) return price >= 0.5 && price <= 2.5;
    if (symbolUpper.includes('JPY')) return price >= 80 && price <= 200;
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
