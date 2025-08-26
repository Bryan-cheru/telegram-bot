import { TradeSignal, TradeAction } from '../types';
import { logger } from '../utils/logger';

/**
 * Enhanced parsing result with confidence and validation
 */
export interface EnhancedParseResult {
  signal: TradeSignal | null;
  confidence: number;
  isValid: boolean;
  method?: string;
  reasoning?: string;
}

/**
 * Enhanced Trade Parser with improved accuracy and multiple signal format support
 */
export class EnhancedTradeParser {
  private readonly TRADING_SYMBOLS = {
    forex: [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
      'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF',
      'CHFJPY', 'CADJPY', 'EURCZK', 'USDPLN', 'USDSEK', 'USDNOK', 'USDDKK'
    ],
    metals: [
      'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER', 'XPTUSD', 'XPDUSD'
    ],
    indices: [
      'US30', 'NAS100', 'SPX500', 'UK100', 'GER30', 'FRA40', 'JPN225',
      'AUS200', 'HK50', 'CHINA50', 'RUSSELL2000'
    ],
    crypto: [
      'BTCUSD', 'ETHUSD', 'LTCUSD', 'ADAUSD', 'DOTUSD', 'LINKUSD'
    ]
  };

  private readonly CONFIDENCE_THRESHOLDS = {
    HIGH: 0.8,
    MEDIUM: 0.6,
    LOW: 0.4,
    MINIMUM: 0.3
  };

  /**
   * Enhanced parsing with confidence scoring
   */
  parseTradeSignalWithConfidence(text: string, caption?: string): EnhancedParseResult {
    try {
      const fullText = caption ? `${text}\n${caption}` : text;
      const normalizedText = this.normalizeText(fullText);

      // Try parsing methods in order of reliability
      const parseMethods = [
        { name: 'Structured Format', method: () => this.parseStructuredFormat(normalizedText), confidence: 0.9 },
        { name: 'Standard Signal', method: () => this.parseStandardSignalFormat(normalizedText), confidence: 0.85 },
        { name: 'Chart Analysis', method: () => this.parseChartAnalysis(normalizedText), confidence: 0.75 },
        { name: 'Flexible Parse', method: () => this.parseFlexibleFormat(normalizedText), confidence: 0.65 },
        { name: 'AI Context', method: () => this.parseWithAIContext(normalizedText), confidence: 0.55 }
      ];

      for (const parseMethod of parseMethods) {
        const signal = parseMethod.method();
        if (signal && this.validateSignalLogic(signal)) {
          const confidence = this.calculateConfidence(signal, normalizedText) * parseMethod.confidence;
          const isValid = confidence > this.CONFIDENCE_THRESHOLDS.MINIMUM;
          
          logger.info(`✅ Parsed signal using ${parseMethod.name}`, {
            confidence: confidence.toFixed(2),
            symbol: signal.symbol,
            action: signal.action
          });

          return { 
            signal, 
            confidence, 
            isValid,
            method: parseMethod.name,
            reasoning: `Parsed using ${parseMethod.name} with ${(confidence * 100).toFixed(1)}% confidence`
          };
        }
      }

      logger.warn('❌ No valid trade signal could be parsed');
      return { 
        signal: null, 
        confidence: 0, 
        isValid: false,
        method: 'none',
        reasoning: 'No valid signal pattern detected in text'
      };

    } catch (error) {
      logger.error('Error in enhanced trade parsing:', error);
      return { 
        signal: null, 
        confidence: 0, 
        isValid: false,
        method: 'error',
        reasoning: `Parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Parse highly structured format signals
   */
  private parseStructuredFormat(text: string): TradeSignal | null {
    // Enhanced regex patterns for structured formats
    const structuredPatterns = [
      // Pattern 1: Perfect structure - SYMBOL ACTION ENTRY_MIN-ENTRY_MAX SL:XX TP:XX,XX
      /(?:SIGNAL|TRADE|SETUP)?\s*(\w+)\s+(BUY|SELL)\s+ENTRY[\s:]*(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s+(?:SL|STOP\s?LOSS)[\s:]*(\d+\.?\d*)\s+(?:TP|TARGETS?|TAKE\s?PROFITS?)[\s:]*((?:\d+\.?\d*[,\s]*)+)/gi,
      
      // Pattern 2: Compact structured format
      /(\w+)\s+(BUY|SELL)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s+SL[\s:]*(\d+\.?\d*)\s+TP[\s:]*((?:\d+\.?\d*[,\s]*)+)/gi,
      
      // Pattern 3: Multi-line structured format
      /(\w+)\s*\n\s*(BUY|SELL)\s*\n\s*(?:ENTRY|ENTER)[\s:]*(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*\n\s*(?:SL|STOP)[\s:]*(\d+\.?\d*)\s*\n\s*(?:TP|TARGET)[\s:]*((?:\d+\.?\d*[,\s\n]*)+)/gi
    ];

    for (const pattern of structuredPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const [, symbol, action, entryMin, entryMax, stopLoss, targetsStr] = match;
        
        if (this.isValidTradingSymbol(symbol)) {
          return {
            symbol: symbol.toUpperCase(),
            action: action.toUpperCase() as TradeAction,
            entryZone: {
              min: parseFloat(entryMin),
              max: parseFloat(entryMax)
            },
            stopLoss: parseFloat(stopLoss),
            targets: this.parseTargetLevels(targetsStr),
            reason: this.extractAnalysisReason(text),
            plan: this.extractTradingPlan(text)
          };
        }
      }
    }

    return null;
  }

  /**
   * Parse standard signal formats with better accuracy
   */
  private parseStandardSignalFormat(text: string): TradeSignal | null {
    const symbol = this.extractBestSymbolMatch(text);
    if (!symbol) return null;

    const action = this.extractTradeDirection(text);
    if (!action) return null;

    // Extract price levels with context
    const priceContext = this.extractPricesWithContext(text);
    if (!priceContext || priceContext.length < 3) return null;

    // Identify entry, stop loss, and targets based on action and price positions
    const { entryZone, stopLoss, targets } = this.identifyPriceLevels(priceContext, action);

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets,
      reason: this.extractAnalysisReason(text),
      plan: this.extractTradingPlan(text)
    };
  }

  /**
   * Parse chart analysis signals
   */
  private parseChartAnalysis(text: string): TradeSignal | null {
    const symbol = this.extractBestSymbolMatch(text);
    if (!symbol) return null;

    // Look for technical analysis terms
    const technicalContext = this.analyzeTechnicalContext(text);
    const priceLevels = this.extractSignificantPriceLevels(text);

    if (priceLevels.length < 2) return null;

    const action = technicalContext.bias || this.inferBiasFromContext(text, priceLevels);
    
    // Create intelligent entry zones based on context
    const { entryZone, stopLoss, targets } = this.createIntelligentLevels(priceLevels, action, technicalContext);

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets,
      reason: technicalContext.reason,
      plan: technicalContext.plan
    };
  }

  /**
   * Parse with flexible approach for various formats
   */
  private parseFlexibleFormat(text: string): TradeSignal | null {
    const components = this.extractTradeComponents(text);
    
    if (!components.symbol || !components.prices || components.prices.length < 2) {
      return null;
    }

    // Infer action if not explicitly found
    const action = components.action || this.inferActionFromPrices(components.prices, text);
    
    // Create reasonable trade structure
    const tradeStructure = this.createTradeStructure(components.prices, action);

    return {
      symbol: components.symbol,
      action,
      entryZone: tradeStructure.entryZone,
      stopLoss: tradeStructure.stopLoss,
      targets: tradeStructure.targets,
      reason: components.reason,
      plan: components.plan
    };
  }

  /**
   * Parse using AI-like context understanding
   */
  private parseWithAIContext(text: string): TradeSignal | null {
    // This method uses context clues and natural language understanding
    const contextAnalysis = this.performContextAnalysis(text);
    
    if (!contextAnalysis.symbol || !contextAnalysis.sentiment) {
      return null;
    }

    const prices = this.extractAllNumericValues(text);
    if (prices.length < 2) return null;

    // Use sentiment and context to create trade signal
    const action = contextAnalysis.sentiment === 'bullish' ? 'BUY' : 'SELL';
    const intelligentLevels = this.createContextualLevels(prices, action, contextAnalysis);

    return {
      symbol: contextAnalysis.symbol,
      action,
      entryZone: intelligentLevels.entryZone,
      stopLoss: intelligentLevels.stopLoss,
      targets: intelligentLevels.targets,
      reason: contextAnalysis.reason,
      plan: contextAnalysis.plan
    };
  }

  // Enhanced helper methods

  private normalizeText(text: string): string {
    return text
      .replace(/[""'']/g, '"') // Normalize quotes
      .replace(/[–—]/g, '-') // Normalize dashes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private isValidTradingSymbol(symbol: string): boolean {
    const upperSymbol = symbol.toUpperCase();
    return Object.values(this.TRADING_SYMBOLS).flat().includes(upperSymbol);
  }

  private extractBestSymbolMatch(text: string): string | null {
    const allSymbols = Object.values(this.TRADING_SYMBOLS).flat();
    const matches = allSymbols.filter(symbol => 
      text.toUpperCase().includes(symbol)
    );

    // Return the longest match (most specific)
    return matches.length > 0 ? matches.reduce((a, b) => a.length > b.length ? a : b) : null;
  }

  private extractTradeDirection(text: string): TradeAction | null {
    const upperText = text.toUpperCase();
    
    // Check for explicit direction words
    const sellWords = ['SELL', 'SHORT', 'BEAR', 'BEARISH', 'DOWN', 'RESISTANCE'];
    const buyWords = ['BUY', 'LONG', 'BULL', 'BULLISH', 'UP', 'SUPPORT'];
    
    const sellCount = sellWords.filter(word => upperText.includes(word)).length;
    const buyCount = buyWords.filter(word => upperText.includes(word)).length;
    
    if (sellCount > buyCount) return 'SELL';
    if (buyCount > sellCount) return 'BUY';
    
    return null;
  }

  private extractPricesWithContext(text: string): Array<{price: number, context: string}> | null {
    const priceRegex = /(\d+\.?\d*)/g;
    const prices: Array<{price: number, context: string}> = [];
    let match;
    
    while ((match = priceRegex.exec(text)) !== null) {
      const price = parseFloat(match[0]);
      if (this.isReasonablePrice(price)) {
        const start = Math.max(0, match.index - 20);
        const end = Math.min(text.length, match.index + match[0].length + 20);
        const context = text.substring(start, end);
        
        prices.push({ price, context });
      }
    }
    
    return prices.length > 0 ? prices : null;
  }

  private isReasonablePrice(price: number): boolean {
    return price > 0.00001 && price < 1000000;
  }

  private identifyPriceLevels(priceContext: Array<{price: number, context: string}>, action: TradeAction) {
    const prices = priceContext.map(pc => pc.price).sort((a, b) => a - b);
    
    // Simple logic for level identification
    if (action === 'BUY') {
      const entryPrice = prices[Math.floor(prices.length * 0.3)];
      return {
        entryZone: { min: entryPrice * 0.999, max: entryPrice * 1.001 },
        stopLoss: prices[0] * 0.99,
        targets: [prices[Math.floor(prices.length * 0.7)], prices[prices.length - 1]]
      };
    } else {
      const entryPrice = prices[Math.floor(prices.length * 0.7)];
      return {
        entryZone: { min: entryPrice * 0.999, max: entryPrice * 1.001 },
        stopLoss: prices[prices.length - 1] * 1.01,
        targets: [prices[Math.floor(prices.length * 0.3)], prices[0]]
      };
    }
  }

  private parseTargetLevels(targetsStr: string): number[] {
    return targetsStr
      .split(/[,\s\n]+/)
      .map(t => parseFloat(t.trim()))
      .filter(t => !isNaN(t) && this.isReasonablePrice(t))
      .slice(0, 3); // Limit to 3 targets max
  }

  private extractAnalysisReason(text: string): string | undefined {
    const reasonPatterns = [
      /(?:analysis|reason|because|due to)[\s:]*([^.\n]{10,100})/gi,
      /([^.\n]*(?:trend|support|resistance|breakout|pullback)[^.\n]{5,50})/gi
    ];

    for (const pattern of reasonPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractTradingPlan(text: string): string | undefined {
    const planPatterns = [
      /(?:plan|strategy|approach)[\s:]*([^.\n]{10,100})/gi,
      /([^.\n]*(?:wait|enter|exit|manage)[^.\n]{5,50})/gi
    ];

    for (const pattern of planPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private calculateConfidence(signal: TradeSignal, text: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for clear structure
    if (text.includes('SL') && text.includes('TP')) confidence += 0.2;
    if (text.includes('ENTRY') || text.includes('ENTER')) confidence += 0.1;
    
    // Increase confidence for valid risk-reward
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    const risk = Math.abs(entryMid - signal.stopLoss);
    const reward = signal.targets.length > 0 ? Math.abs(signal.targets[0] - entryMid) : 0;
    
    if (reward > risk * 1.5) confidence += 0.1;
    if (reward > risk * 2) confidence += 0.1;

    // Decrease confidence for poor structure
    if (signal.targets.length === 0) confidence -= 0.2;
    if (risk > reward) confidence -= 0.2;

    return Math.max(0, Math.min(1, confidence));
  }

  private validateSignalLogic(signal: TradeSignal): boolean {
    // Enhanced validation logic
    if (!signal.symbol || !signal.action) return false;
    if (!signal.entryZone || signal.entryZone.min >= signal.entryZone.max) return false;
    if (signal.stopLoss <= 0 || signal.targets.length === 0) return false;

    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;

    // Logical validation based on action
    if (signal.action === 'BUY') {
      if (signal.stopLoss >= signal.entryZone.min) return false;
      if (signal.targets.some(t => t <= signal.entryZone.max)) return false;
    } else {
      if (signal.stopLoss <= signal.entryZone.max) return false;
      if (signal.targets.some(t => t >= signal.entryZone.min)) return false;
    }

    // Risk management validation
    const risk = Math.abs(entryMid - signal.stopLoss);
    const maxRisk = entryMid * 0.1; // Max 10% risk
    if (risk > maxRisk) return false;

    return true;
  }

  // Placeholder methods for advanced analysis (can be implemented based on specific needs)
  private analyzeTechnicalContext(text: string) {
    return { bias: null, reason: undefined, plan: undefined };
  }

  private extractSignificantPriceLevels(text: string): number[] {
    return this.extractAllNumericValues(text);
  }

  private inferBiasFromContext(text: string, prices: number[]): TradeAction {
    return 'BUY'; // Default
  }

  private createIntelligentLevels(prices: number[], action: TradeAction, context: any) {
    return this.identifyPriceLevels(prices.map(p => ({price: p, context: ''})), action);
  }

  private extractTradeComponents(text: string) {
    return {
      symbol: this.extractBestSymbolMatch(text),
      action: this.extractTradeDirection(text),
      prices: this.extractAllNumericValues(text),
      reason: this.extractAnalysisReason(text),
      plan: this.extractTradingPlan(text)
    };
  }

  private inferActionFromPrices(prices: number[], text: string): TradeAction {
    return this.extractTradeDirection(text) || 'BUY';
  }

  private createTradeStructure(prices: number[], action: TradeAction) {
    return this.identifyPriceLevels(prices.map(p => ({price: p, context: ''})), action);
  }

  private performContextAnalysis(text: string) {
    return {
      symbol: this.extractBestSymbolMatch(text),
      sentiment: text.toLowerCase().includes('sell') ? 'bearish' : 'bullish',
      reason: this.extractAnalysisReason(text),
      plan: this.extractTradingPlan(text)
    };
  }

  private createContextualLevels(prices: number[], action: TradeAction, context: any) {
    return this.identifyPriceLevels(prices.map(p => ({price: p, context: ''})), action);
  }

  private extractAllNumericValues(text: string): number[] {
    const regex = /\d+\.?\d*/g;
    const numbers: number[] = [];
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const num = parseFloat(match[0]);
      if (this.isReasonablePrice(num)) {
        numbers.push(num);
      }
    }
    
    return [...new Set(numbers)].sort((a, b) => a - b);
  }

  /**
   * Fallback method using original parser logic
   */
  parseTradeSignal(text: string, caption?: string): TradeSignal | null {
    const result = this.parseTradeSignalWithConfidence(text, caption);
    return result.confidence > this.CONFIDENCE_THRESHOLDS.LOW ? result.signal : null;
  }
}