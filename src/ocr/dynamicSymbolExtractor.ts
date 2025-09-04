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
      
      // If no symbols discovered (accounts not synchronized), add fallback symbols
      if (this.symbolCache.size === 0) {
        logger.warn('⚠️ No symbols discovered from brokers, adding fallback symbols...');
        this.addFallbackSymbols();
      }
      
      logger.info(`✅ Dynamic symbol extractor ready with ${this.symbolCache.size} broker symbol sets`);
      
      // Schedule retry attempts to get real broker symbols
      this.scheduleSymbolRetry(accounts);
      
    } catch (error) {
      logger.error('❌ Failed to initialize dynamic symbol extractor:', error);
      // Add fallback symbols in case of error
      this.addFallbackSymbols();
      this.scheduleSymbolRetry(accounts);
    }
  }

  /**
   * Schedule retry attempts to get symbols from brokers
   */
  private static scheduleSymbolRetry(accounts: Map<string, any>): void {
    // Retry every 2 minutes for up to 30 minutes
    let retryCount = 0;
    const maxRetries = 15;
    
    const retryInterval = setInterval(async () => {
      try {
        retryCount++;
        logger.info(`🔄 Retry ${retryCount}/${maxRetries}: Attempting to discover broker symbols...`);
        
        await UniversalSymbolSupport.updateSymbolCacheIfNeeded(accounts);
        this.buildSymbolLookupTables();
        
        const totalSymbols = Array.from(this.symbolCache.values())
          .reduce((total, symbolSet) => total + symbolSet.size, 0);
        
        if (totalSymbols > 50) { // If we have a good number of real symbols
          logger.info(`✅ Successfully discovered ${totalSymbols} symbols from brokers!`);
          clearInterval(retryInterval);
          return;
        }
        
        if (retryCount >= maxRetries) {
          logger.warn('⚠️ Max retry attempts reached. Using fallback symbols.');
          clearInterval(retryInterval);
        }
        
      } catch (error) {
        logger.error(`❌ Symbol discovery retry ${retryCount} failed:`, error);
        if (retryCount >= maxRetries) {
          clearInterval(retryInterval);
        }
      }
    }, 2 * 60 * 1000); // 2 minutes
  }

  /**
   * Add fallback symbols when dynamic discovery fails
   */
  private static addFallbackSymbols(): void {
    const fallbackSymbols = [
      // Major Forex Pairs
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURJPY', 'GBPJPY', 'EURGBP', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'CADJPY',
      'CHFJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURNZD', 'GBPAUD', 'GBPCAD',
      'GBPCHF', 'GBPNZD', 'NZDCAD', 'NZDCHF', 'NZDJPY', 'USDPLN', 'USDSEK',
      'USDNOK', 'USDDKK', 'USDCZK', 'USDHUF', 'USDTRY', 'USDZAR', 'USDMXN',
      
      // Precious Metals
      'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM',
      
      // Major Indices
      'US30', 'SPX500', 'NAS100', 'US500', 'USTEC', 'GER30', 'UK100', 'FRA40',
      'JPN225', 'AUS200', 'HK50', 'EUSTX50', 'SWI20', 'ESP35', 'ITA40',
      'US2000', 'VIX', 'NASDAQ', 'DOW', 'SP500', 'RUSSELL2000', 'NIKKEI',
      'FTSE', 'DAX', 'CAC40', 'IBEX35', 'SMI', 'ASX200', 'HSI',
      
      // Crude Oil & Energy
      'USOIL', 'UKOIL', 'WTI', 'BRENT', 'CRUDEOIL', 'OIL', 'NGAS', 'NATURALGAS',
      'HEATING', 'GASOLINE', 'ETHANOL',
      
      // Agricultural Commodities
      'WHEAT', 'CORN', 'SOYBEANS', 'SUGAR', 'COTTON', 'COFFEE', 'COCOA',
      'RICE', 'OATS', 'CANOLA', 'LUMBER', 'ORANGE',
      
      // Industrial Metals
      'COPPER', 'ALUMINUM', 'ZINC', 'NICKEL', 'LEAD', 'TIN',
      
      // Cryptocurrencies
      'BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'ADAUSD', 'DOTUSD', 'BNBUSD',
      'SOLUSD', 'MATICUSD', 'AVAXUSD', 'LINKUSD', 'UNIUSD', 'DOGEUSD',
      
      // Bonds & Interest Rates
      'US10Y', 'US2Y', 'US5Y', 'US30Y', 'EUBUND', 'UKGILT', 'JGB',
      
      // Emerging Market Currencies
      'USDBRL', 'USDINR', 'USDCNY', 'USDKRW', 'USDTHB', 'USDSGD',
      'USDHKD', 'USDPHP', 'USDIDR', 'USDMYR', 'USDVND',
      
      // Exotic Pairs
      'EURTRY', 'GBPTRY', 'USDILS', 'EURPLN', 'GBPPLN', 'EURNOK',
      'EURSEK', 'GBPSEK', 'GBPNOK', 'AUDNZD', 'CADCHF', 'NOKSEK'
    ];
    
    // Add fallback symbols to all configured broker names
    const brokerNames = ['FTMO', 'PEPPERSTONE', 'BROKER2', 'BROKER3'];
    
    brokerNames.forEach(brokerName => {
      const brokerSymbols = new Set<string>();
      fallbackSymbols.forEach(symbol => {
        brokerSymbols.add(symbol);
        
        // Add common broker-specific variations
        if (symbol === 'US30') {
          brokerSymbols.add('US30.cash');
          brokerSymbols.add('US30.c');
          brokerSymbols.add('US30cash');
          brokerSymbols.add('DOW');
          brokerSymbols.add('DJIA');
          brokerSymbols.add('DJ30');
        }
        if (symbol === 'NAS100') {
          brokerSymbols.add('NASDAQ');
          brokerSymbols.add('NAS100.cash');
          brokerSymbols.add('NAS100cash');
          brokerSymbols.add('NDX');
          brokerSymbols.add('USTEC');
        }
        if (symbol === 'SPX500') {
          brokerSymbols.add('SP500');
          brokerSymbols.add('SPX500.cash');
          brokerSymbols.add('SPX500cash');
          brokerSymbols.add('US500');
          brokerSymbols.add('SPX');
        }
        if (symbol === 'USOIL') {
          brokerSymbols.add('CRUDEOIL');
          brokerSymbols.add('WTI');
          brokerSymbols.add('CRUDE');
          brokerSymbols.add('OIL');
          brokerSymbols.add('USOIL.cash');
        }
        if (symbol === 'UKOIL') {
          brokerSymbols.add('BRENT');
          brokerSymbols.add('BRENTOIL');
          brokerSymbols.add('UKOIL.cash');
        }
        if (symbol === 'XAUUSD') {
          brokerSymbols.add('GOLD');
          brokerSymbols.add('XAU/USD');
          brokerSymbols.add('XAUUSD.cash');
          brokerSymbols.add('GOLD.cash');
        }
        if (symbol === 'XAGUSD') {
          brokerSymbols.add('SILVER');
          brokerSymbols.add('XAG/USD');
          brokerSymbols.add('XAGUSD.cash');
          brokerSymbols.add('SILVER.cash');
        }
        if (symbol === 'GER30') {
          brokerSymbols.add('DAX');
          brokerSymbols.add('GER30.cash');
          brokerSymbols.add('DE30');
        }
        if (symbol === 'UK100') {
          brokerSymbols.add('FTSE');
          brokerSymbols.add('UK100.cash');
          brokerSymbols.add('FTSE100');
        }
        if (symbol === 'JPN225') {
          brokerSymbols.add('NIKKEI');
          brokerSymbols.add('JPN225.cash');
          brokerSymbols.add('N225');
        }
        if (symbol === 'BTCUSD') {
          brokerSymbols.add('BITCOIN');
          brokerSymbols.add('BTC/USD');
          brokerSymbols.add('BTCUSDT');
        }
        if (symbol === 'ETHUSD') {
          brokerSymbols.add('ETHEREUM');
          brokerSymbols.add('ETH/USD');
          brokerSymbols.add('ETHUSDT');
        }
      });
      this.symbolCache.set(brokerName, brokerSymbols);
    });
    
    // Build comprehensive alias mappings
    this.aliasMap.set('GOLD', 'XAUUSD');
    this.aliasMap.set('SILVER', 'XAGUSD');
    this.aliasMap.set('PLATINUM', 'XPTUSD');
    this.aliasMap.set('PALLADIUM', 'XPDUSD');
    this.aliasMap.set('DOW', 'US30');
    this.aliasMap.set('DJIA', 'US30');
    this.aliasMap.set('DJ30', 'US30');
    this.aliasMap.set('NASDAQ', 'NAS100');
    this.aliasMap.set('NAS', 'NAS100');
    this.aliasMap.set('NDX', 'NAS100');
    this.aliasMap.set('USTEC', 'NAS100');
    this.aliasMap.set('SP500', 'SPX500');
    this.aliasMap.set('SPX', 'SPX500');
    this.aliasMap.set('US500', 'SPX500');
    this.aliasMap.set('WTI', 'USOIL');
    this.aliasMap.set('CRUDE', 'USOIL');
    this.aliasMap.set('CRUDEOIL', 'USOIL');
    this.aliasMap.set('OIL', 'USOIL');
    this.aliasMap.set('BRENT', 'UKOIL');
    this.aliasMap.set('BRENTOIL', 'UKOIL');
    this.aliasMap.set('DAX', 'GER30');
    this.aliasMap.set('DE30', 'GER30');
    this.aliasMap.set('FTSE', 'UK100');
    this.aliasMap.set('FTSE100', 'UK100');
    this.aliasMap.set('NIKKEI', 'JPN225');
    this.aliasMap.set('N225', 'JPN225');
    this.aliasMap.set('BITCOIN', 'BTCUSD');
    this.aliasMap.set('BTC', 'BTCUSD');
    this.aliasMap.set('ETHEREUM', 'ETHUSD');
    this.aliasMap.set('ETH', 'ETHUSD');
    this.aliasMap.set('NATURALGAS', 'NGAS');
    this.aliasMap.set('NATGAS', 'NGAS');
    
    logger.info(`✅ Added ${fallbackSymbols.length} fallback symbols for ${brokerNames.length} brokers`);
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
