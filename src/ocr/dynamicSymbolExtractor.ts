import { UniversalSymbolSupport, SymbolInfo, BrokerSymbolData } from '../utils/universalSymbolSupport';
import { logger } from '../utils/logger';

/**
 * Dynamic Symbol Extractor - Uses broker's actual symbols instead of hardcoded patterns
 */
export class DynamicSymbolExtractor {
  private static symbolCache: Map<string, Set<string>> = new Map();
  private static aliasMap: Map<string, string> = new Map();
  private static lastUpdate: Date | null = null;

  /**
   * Initialize symbol data from connected brokers
   */
  static async initialize(accounts: Map<string, any>): Promise<void> {
    try {
      logger.info('🔄 Initializing dynamic symbol extraction...');
      
      // Update symbol cache if needed
      await UniversalSymbolSupport.updateSymbolCacheIfNeeded(accounts);
      
      // Build symbol lookup tables
      this.buildSymbolLookupTables();
      
      logger.info(`✅ Dynamic symbol extractor ready with ${this.symbolCache.size} broker symbol sets`);
      
    } catch (error) {
      logger.error('❌ Failed to initialize dynamic symbol extractor:', error);
    }
  }

  /**
   * Extract symbol from text using broker's actual available symbols
   */
  static extractSymbolFromText(text: string, brokerNames?: string[]): string | null {
    try {
      const cleanText = text.toUpperCase();
      
      // 1. Try hashtag extraction first (#XAUUSD, #EURUSD, etc.)
      const hashtagSymbol = this.extractHashtagSymbol(cleanText);
      if (hashtagSymbol) {
        const validSymbol = this.validateSymbol(hashtagSymbol, brokerNames);
        if (validSymbol) return validSymbol;
      }

      // 2. Try direct symbol matching from broker lists
      const directSymbol = this.extractDirectSymbol(cleanText, brokerNames);
      if (directSymbol) return directSymbol;

      // 3. Try alias/nickname matching (GOLD -> XAUUSD, etc.)
      const aliasSymbol = this.extractAliasSymbol(cleanText, brokerNames);
      if (aliasSymbol) return aliasSymbol;

      // 4. Try fuzzy matching for partial matches
      const fuzzySymbol = this.extractFuzzySymbol(cleanText, brokerNames);
      if (fuzzySymbol) return fuzzySymbol;

      logger.warn('❌ No valid symbol found in text:', text.substring(0, 100));
      return null;

    } catch (error) {
      logger.error('❌ Error extracting symbol:', error);
      return null;
    }
  }

  /**
   * Build lookup tables from discovered broker symbols
   */
  private static buildSymbolLookupTables(): void {
    const symbolData = UniversalSymbolSupport.getSymbolCache();
    
    // Clear existing data
    this.symbolCache.clear();
    this.aliasMap.clear();

    // Process each broker's symbols
    for (const [brokerName, symbols] of Object.entries(symbolData)) {
      const brokerSymbols = new Set<string>();
      
      for (const [symbol, info] of Object.entries(symbols as { [key: string]: SymbolInfo })) {
        if (info.isActive) {
          brokerSymbols.add(symbol.toUpperCase());
          
          // Build alias mappings
          this.buildAliasMapping(symbol, info.description || '');
        }
      }
      
      this.symbolCache.set(brokerName, brokerSymbols);
      logger.debug(`📊 Loaded ${brokerSymbols.size} symbols for ${brokerName}`);
    }

    logger.info(`🎯 Built symbol lookup tables for ${this.symbolCache.size} brokers`);
  }

  /**
   * Build alias mappings (GOLD -> XAUUSD, SILVER -> XAGUSD, etc.)
   */
  private static buildAliasMapping(symbol: string, description: string): void {
    const s = symbol.toUpperCase();
    const d = description.toUpperCase();

    // Common aliases
    const aliases: { [key: string]: string } = {
      'GOLD': 'XAUUSD',
      'SILVER': 'XAGUSD',
      'US30': 'US30',
      'NAS100': 'NAS100',
      'SPX500': 'SPX500',
      'DOW': 'US30',
      'NASDAQ': 'NAS100',
      'SP500': 'SPX500',
      'DAX': 'GER30',
      'FTSE': 'UK100'
    };

    // Add standard aliases
    for (const [alias, target] of Object.entries(aliases)) {
      if (s.includes(target) || d.includes(alias)) {
        this.aliasMap.set(alias, s);
      }
    }

    // Dynamic aliases from description
    if (d.includes('GOLD')) this.aliasMap.set('GOLD', s);
    if (d.includes('SILVER')) this.aliasMap.set('SILVER', s);
    if (d.includes('DOW') || d.includes('US30')) this.aliasMap.set('US30', s);
  }

  /**
   * Extract symbol from hashtag (#XAUUSD, #EURUSD, etc.)
   */
  private static extractHashtagSymbol(text: string): string | null {
    const hashtagPattern = /#([A-Z0-9]{5,10})/g;
    const matches = text.match(hashtagPattern);
    
    if (matches) {
      for (const match of matches) {
        const symbol = match.substring(1); // Remove #
        if (this.isLikelyTradingSymbol(symbol)) {
          return symbol;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract symbol by direct matching against broker symbol lists
   */
  private static extractDirectSymbol(text: string, brokerNames?: string[]): string | null {
    const targetBrokers = brokerNames || Array.from(this.symbolCache.keys());
    
    for (const brokerName of targetBrokers) {
      const brokerSymbols = this.symbolCache.get(brokerName);
      if (!brokerSymbols) continue;

      for (const symbol of brokerSymbols) {
        // Look for exact word boundaries to avoid partial matches
        const pattern = new RegExp(`\\b${symbol}\\b`, 'i');
        if (pattern.test(text)) {
          logger.debug(`✅ Found direct symbol match: ${symbol} for ${brokerName}`);
          return symbol;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract symbol using alias mapping
   */
  private static extractAliasSymbol(text: string, brokerNames?: string[]): string | null {
    for (const [alias, symbol] of this.aliasMap.entries()) {
      const pattern = new RegExp(`\\b${alias}\\b`, 'i');
      if (pattern.test(text)) {
        // Validate the symbol exists in target brokers
        const validSymbol = this.validateSymbol(symbol, brokerNames);
        if (validSymbol) {
          logger.debug(`✅ Found alias match: ${alias} -> ${symbol}`);
          return validSymbol;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract symbol using fuzzy matching for partial matches
   */
  private static extractFuzzySymbol(text: string, brokerNames?: string[]): string | null {
    const targetBrokers = brokerNames || Array.from(this.symbolCache.keys());
    const words = text.split(/\s+/);
    
    for (const word of words) {
      const cleanWord = word.replace(/[^A-Z0-9]/g, '');
      if (cleanWord.length < 4) continue;

      for (const brokerName of targetBrokers) {
        const brokerSymbols = this.symbolCache.get(brokerName);
        if (!brokerSymbols) continue;

        for (const symbol of brokerSymbols) {
          // Check if word is contained in symbol or vice versa
          if (symbol.includes(cleanWord) || cleanWord.includes(symbol)) {
            if (this.isLikelyTradingSymbol(symbol)) {
              logger.debug(`✅ Found fuzzy match: ${cleanWord} -> ${symbol}`);
              return symbol;
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Validate if symbol exists in target brokers
   */
  private static validateSymbol(symbol: string, brokerNames?: string[]): string | null {
    const targetBrokers = brokerNames || Array.from(this.symbolCache.keys());
    
    for (const brokerName of targetBrokers) {
      const brokerSymbols = this.symbolCache.get(brokerName);
      if (brokerSymbols?.has(symbol.toUpperCase())) {
        return symbol.toUpperCase();
      }
    }
    
    return null;
  }

  /**
   * Check if string looks like a trading symbol
   */
  private static isLikelyTradingSymbol(symbol: string): boolean {
    const s = symbol.toUpperCase();
    
    // Common trading symbol patterns
    return (
      /^[A-Z]{6}$/.test(s) ||           // EURUSD, GBPUSD
      /^XAU/.test(s) ||                 // XAUUSD
      /^XAG/.test(s) ||                 // XAGUSD
      /^US30$|^NAS100$|^SPX500$/.test(s) || // Indices
      /^UK100$|^GER30$/.test(s)         // More indices
    );
  }

  /**
   * Get all available symbols for debugging
   */
  static getAllAvailableSymbols(): { [broker: string]: string[] } {
    const result: { [broker: string]: string[] } = {};
    
    for (const [brokerName, symbols] of this.symbolCache.entries()) {
      result[brokerName] = Array.from(symbols).sort();
    }
    
    return result;
  }

  /**
   * Get symbol aliases for debugging
   */
  static getSymbolAliases(): { [alias: string]: string } {
    return Object.fromEntries(this.aliasMap.entries());
  }
}
