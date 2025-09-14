/**
 * Clean Symbol Manager - Follows MetaAPI Documentation
 * Replaces all conflicting validation systems with a single, reliable approach
 */

import { logger } from './logger';

interface SymbolInfo {
  symbol: string;
  description: string;
  digits: number;
  contractSize: number;
  minVolume: number;
  maxVolume: number;
  isTradeAllowed: boolean;
}

interface MarketData {
  bid: number;
  ask: number;
  time: Date;
}

/**
 * Single, reliable symbol management system following MetaAPI docs
 */
/**
 * Symbol Learning and Mapping Database
 */
interface SymbolGroup {
  standardName: string;      // e.g., "GOLD"
  knownVariations: string[]; // e.g., ["XAUUSD", "66", "GOLD", "XAU/USD"]
  brokerMappings: Map<string, string>; // broker -> working symbol
  lastUpdated: number;
}

interface BrokerSymbolProfile {
  symbols: Set<string>;
  lastDiscovery: number;
  symbolPatterns: Map<string, string[]>; // pattern -> matching symbols
}

export class CleanSymbolManager {
  private static symbolCache = new Map<string, Map<string, SymbolInfo>>();
  private static lastCacheUpdate = new Map<string, number>();
  private static readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  
  // Enhanced Symbol Learning System
  private static symbolGroups = new Map<string, SymbolGroup>();
  private static brokerProfiles = new Map<string, BrokerSymbolProfile>();
  private static readonly LEARNING_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Ensure connection is ready for symbol operations with robust retry logic
   * @param connection - MetaAPI connection
   * @param brokerName - Broker name for logging
   * @param maxRetries - Maximum number of retry attempts
   */
  static async ensureConnectionReady(
    connection: any, 
    brokerName: string, 
    maxRetries: number = 3
  ): Promise<void> {
    // Validate connection object
    if (!connection || !connection.terminalState) {
      throw new Error(`Invalid connection object for ${brokerName}`);
    }

    // Check connection status
    if (!connection.terminalState.connected) {
      throw new Error(`${brokerName} terminal not connected`);
    }

    // Robust synchronization with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if already synchronized
        if (connection.terminalState.synchronized) {
          const specCount = Object.keys(connection.terminalState.specifications || {}).length;
          if (specCount > 0) {
            logger.info(`✅ ${brokerName} already synchronized with ${specCount} specifications`);
            return;
          }
        }

        logger.info(`⏳ Waiting for ${brokerName} synchronization (attempt ${attempt}/${maxRetries})...`);
        
        // Wait for synchronization with timeout
        await Promise.race([
          connection.waitSynchronized(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Synchronization timeout after 30s`)), 30000)
          )
        ]);
        
        // Verify specifications are actually loaded
        await new Promise(resolve => setTimeout(resolve, 1000)); // Allow 1s for specs to load
        const specifications = connection.terminalState.specifications || {};
        const specCount = Object.keys(specifications).length;
        
        logger.info(`🔧 ${brokerName} - Attempt ${attempt}: ${specCount} specifications loaded`);
        
        if (specCount > 0) {
          logger.info(`✅ ${brokerName} synchronization successful with ${specCount} symbols`);
          return; // Success!
        }
        
        // If no specifications, retry with exponential backoff
        if (attempt < maxRetries) {
          const backoffDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.warn(`⚠️ ${brokerName} - No specifications loaded, retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
        
      } catch (error: any) {
        logger.error(`❌ ${brokerName} synchronization attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === maxRetries) {
          throw new Error(`${brokerName} failed to synchronize after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff for retry
        const backoffDelay = Math.pow(2, attempt) * 1000;
        logger.info(`🔄 Retrying ${brokerName} synchronization in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    
    throw new Error(`${brokerName} synchronization failed: No specifications loaded after ${maxRetries} attempts`);
  }

  /**
   * Get valid trading symbol for broker - MetaAPI compliant
   * @param inputSymbol - Symbol to validate (e.g., "XAUUSD", "GOLD")
   * @param connection - MetaAPI connection
   * @param brokerName - Broker name for logging
   * @returns Valid symbol name or throws error
   */
  static async getValidSymbol(
    inputSymbol: string, 
    connection: any, 
    brokerName: string
  ): Promise<string> {
    logger.info(`🔍 Validating symbol ${inputSymbol} for ${brokerName}...`);

    // Enhanced debugging for IFPro-Trade
    if (brokerName === 'IFPro-Trade') {
      logger.info(`🔧 IFPro-Trade Debug - Terminal State:`);
      logger.info(`   - Connected: ${connection.terminalState.connected}`);
      logger.info(`   - Synchronized: ${connection.terminalState.synchronized}`);
      logger.info(`   - Specifications count: ${Object.keys(connection.terminalState.specifications || {}).length}`);
    }

    // Step 1: Check cache first for performance
    const cached = this.getCachedSymbolInfo(brokerName, inputSymbol);
    if (cached && cached.isTradeAllowed) {
      logger.info(`✅ Using cached symbol: ${cached.symbol} for ${inputSymbol}`);
      return cached.symbol;
    }

    // Step 2: Ensure connection and synchronization (critical for all brokers)
    await CleanSymbolManager.ensureConnectionReady(connection, brokerName);
    
    // Step 3: Verify specifications are loaded
    const specifications = connection.terminalState.specifications || {};
    if (Object.keys(specifications).length === 0) {
      throw new Error(`No specifications available for ${brokerName} after synchronization`);
    }

    // Step 4: Get intelligent symbol variations using learned mappings
    const variations = this.getIntelligentVariations(inputSymbol, brokerName);
    logger.info(`🔍 ${brokerName} - Trying ${variations.length} variations: ${variations.slice(0, 5).join(', ')}${variations.length > 5 ? '...' : ''}`);

    // Step 5: Test each variation using direct specifications access (more reliable)
    
    for (const symbol of variations) {
      try {
        // Try direct access first (more reliable for IFPro-Trade)
        const specification = specifications[symbol];
        
        // Enhanced debugging for IFPro-Trade
        if (brokerName === 'IFPro-Trade') {
          logger.info(`🔧 IFPro-Trade - Testing symbol: ${symbol}`);
          logger.info(`   - Specification found: ${!!specification}`);
          if (specification) {
            logger.info(`   - Description: ${specification.description}`);
            logger.info(`   - Trade allowed: ${specification.tradeAllowed !== false}`);
            logger.info(`   - Digits: ${specification.digits}`);
            logger.info(`   - Contract size: ${specification.contractSize}`);
          }
        }
        
        if (specification && specification.tradeAllowed !== false) {
          // Additional validation for production safety
          if (specification.minVolume && specification.minVolume > 100) {
            logger.warn(`⚠️ ${symbol} has high minimum volume: ${specification.minVolume}`);
          }
          
          logger.info(`✅ Found valid symbol: ${symbol} (${specification.description})`);
          
          // Learn from successful mapping for future use
          this.learnSymbolMapping(inputSymbol, symbol, brokerName, specification.description);
          
          // Cache the result
          this.cacheSymbolInfo(brokerName, symbol, specification);
          
          return symbol;
        } else if (specification) {
          logger.debug(`❌ ${symbol} found but trading not allowed on ${brokerName}`);
        }
      } catch (error: any) {
        // Enhanced error classification for better debugging
        const errorType = CleanSymbolManager.classifySymbolError(error, symbol, brokerName);
        
        if (brokerName === 'IFPro-Trade' || errorType === 'NETWORK') {
          logger.info(`🔧 ${brokerName} - Symbol ${symbol} ${errorType}: ${error?.message || 'Unknown error'}`);
        } else {
          logger.debug(`Symbol ${symbol} not available on ${brokerName}: ${errorType}`);
        }
        
        // For network errors, don't continue trying - fail fast
        if (errorType === 'NETWORK') {
          throw new Error(`Network error testing symbol ${symbol} on ${brokerName}: ${error.message}`);
        }
      }
    }

    throw new Error(`No valid symbol found for ${inputSymbol} on ${brokerName}. Tried: ${variations.join(', ')}`);
  }

  /**
   * Ensure market data is available for symbol
   * @param symbol - Valid symbol name
   * @param connection - MetaAPI connection
   * @param timeoutMs - Timeout in milliseconds (default 15000)
   * @returns Market data (bid/ask prices)
   */
  static async ensureMarketData(
    symbol: string, 
    connection: any, 
    timeoutMs: number = 15000
  ): Promise<MarketData> {
    logger.info(`📊 Ensuring market data for ${symbol}...`);

    // Subscribe to market data
    try {
      await connection.subscribeToMarketData(symbol);
    } catch (error: any) {
      if (error.message?.includes('symbol does not exist')) {
        throw new Error(`Symbol ${symbol} does not exist on this broker`);
      }
      logger.warn(`Market data subscription warning: ${error.message}`);
    }

    // Wait for price data
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const price = connection.terminalState.price(symbol);
        
        if (price && typeof price.bid === 'number' && typeof price.ask === 'number') {
          const marketData: MarketData = {
            bid: price.bid,
            ask: price.ask,
            time: new Date(price.time || Date.now())
          };
          
          logger.info(`✅ Market data available: ${symbol} Bid=${price.bid} Ask=${price.ask}`);
          return marketData;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Market data timeout: ${symbol} price not available after ${timeoutMs}ms`);
  }

  /**
   * Get symbol variations to try, based on common broker naming conventions
   * @deprecated Use getIntelligentVariations instead for better performance
   * @param inputSymbol - Original symbol
   * @param brokerName - Broker name for specific variations
   * @returns Array of symbol variations to try
   */
  static getSymbolVariations(inputSymbol: string, brokerName?: string): string[] {
    const symbol = inputSymbol.toUpperCase();
    const variations = [symbol]; // Always try original first

    // IFPro-Trade uses numeric symbols - comprehensive mapping
    if (brokerName === 'IFPro-Trade') {
      const ifproMappings: { [key: string]: string } = {
        'GOLD': '67', 'XAUUSD': '67',
        'SILVER': '66', 'XAGUSD': '66', 
        'EURUSD': '27',
        'GBPUSD': '34',
        'USDJPY': '58',
        'AUDUSD': '5',
        'USDCAD': '52',
        'USDCHF': '53',
        'NZDUSD': '43',
        'EURGBP': '21',
        'EURJPY': '23',
        'GBPJPY': '32',
        'US30': '51', 'DJI': '51', 'DJ30': '51',
        'NAS100': '50', 'NASDAQ': '50',
        'SPX': '46', 'SP500': '46',
        'USOIL': '65', 'WTI': '65',
        'UKOIL': '49', 'BRENT': '49',
        'NATGAS': '39',
        'BITCOIN': '9', 'BTC': '9',
        'ETHEREUM': '16', 'ETH': '16'
      };
      
      const ifproSymbol = ifproMappings[symbol.toUpperCase()];
      if (ifproSymbol) {
        variations.unshift(ifproSymbol); // Add IFPro symbol first
      }
    }

    // Gold variations (including numeric symbols used by some brokers like IFPro-Trade)
    if (symbol === 'GOLD' || symbol === 'XAUUSD') {
      variations.push('XAUUSD', 'GOLD', 'XAU/USD', 'GOLD.', 'GOLDm', 'XAUUSD.', 'XAUUSDCash', '67', '66');
    }
    // Silver variations
    else if (symbol === 'SILVER' || symbol === 'XAGUSD') {
      variations.push('XAGUSD', 'SILVER', 'XAG/USD', 'SILVER.');
    }
    // US30 variations
    else if (symbol === 'US30') {
      variations.push('US30', 'US30Cash', 'DJ30', 'DJIA', 'US30.');
    }
    // NAS100 variations
    else if (symbol === 'NAS100') {
      variations.push('NAS100', 'NASDAQ', 'NAS100Cash', 'USTEC');
    }
    // Oil variations
    else if (symbol === 'USOIL') {
      variations.push('USOIL', 'WTI', 'CRUDE', 'OIL');
    }
    // EUR/USD variations
    else if (symbol === 'EURUSD') {
      variations.push('EURUSD', 'EUR/USD', 'EURUSD.');
    }
    // GBP/USD variations
    else if (symbol === 'GBPUSD') {
      variations.push('GBPUSD', 'GBP/USD', 'GBPUSD.');
    }

    // Add common suffixes for any symbol
    if (!symbol.includes('.')) {
      variations.push(symbol + '.');
    }
    if (!symbol.includes('Cash')) {
      variations.push(symbol + 'Cash');
    }

    // Remove duplicates while preserving order
    return [...new Set(variations)];
  }

  /**
   * Cache symbol information
   */
  private static cacheSymbolInfo(brokerName: string, symbol: string, specification: any): void {
    if (!this.symbolCache.has(brokerName)) {
      this.symbolCache.set(brokerName, new Map());
    }

    const brokerCache = this.symbolCache.get(brokerName)!;
    brokerCache.set(symbol, {
      symbol,
      description: specification.description || '',
      digits: specification.digits || 5,
      contractSize: specification.contractSize || 100000,
      minVolume: specification.minVolume || 0.01,
      maxVolume: specification.maxVolume || 100,
      isTradeAllowed: specification.tradeAllowed !== false
    });

    this.lastCacheUpdate.set(brokerName, Date.now());
  }

  /**
   * Get cached symbol info if available
   */
  static getCachedSymbolInfo(brokerName: string, symbol: string): SymbolInfo | null {
    const lastUpdate = this.lastCacheUpdate.get(brokerName) || 0;
    if (Date.now() - lastUpdate > this.CACHE_DURATION) {
      return null; // Cache expired
    }

    const brokerCache = this.symbolCache.get(brokerName);
    return brokerCache?.get(symbol) || null;
  }

  /**
   * Initialize symbol learning for a broker connection
   * Should be called once when broker connects
   * @param connection - MetaAPI connection
   * @param brokerName - Broker name
   */
  static async initializeBrokerLearning(connection: any, brokerName: string): Promise<void> {
    try {
      // Check if we need to discover symbols (cache expired or first time)
      const profile = this.brokerProfiles.get(brokerName);
      const shouldDiscover = !profile || 
        (Date.now() - profile.lastDiscovery) > this.LEARNING_CACHE_DURATION;
      
      if (shouldDiscover) {
        logger.info(`🎓 Initializing symbol learning for ${brokerName}...`);
        await this.discoverBrokerSymbols(connection, brokerName);
      } else {
        logger.info(`✅ Using cached symbol profile for ${brokerName} (${profile?.symbols.size} symbols)`);
      }
    } catch (error: any) {
      logger.warn(`Failed to initialize learning for ${brokerName}: ${error.message}`);
    }
  }

  /**
   * Get all available symbols for a broker (enhanced with caching)
   */
  static async getAllSymbols(connection: any, brokerName: string): Promise<string[]> {
    try {
      // Try cached symbols first
      const profile = this.brokerProfiles.get(brokerName);
      if (profile && (Date.now() - profile.lastDiscovery) < this.LEARNING_CACHE_DURATION) {
        return Array.from(profile.symbols);
      }

      // Discover fresh symbols
      await this.ensureConnectionReady(connection, brokerName);
      const specifications = connection.terminalState.specifications || {};
      const symbols = Object.keys(specifications)
        .filter(symbol => {
          const spec = specifications[symbol];
          return spec && spec.tradeAllowed !== false;
        });

      logger.info(`📋 Found ${symbols.length} tradeable symbols on ${brokerName}`);
      
      // Update cache
      if (!this.brokerProfiles.has(brokerName)) {
        this.brokerProfiles.set(brokerName, {
          symbols: new Set(),
          lastDiscovery: Date.now(),
          symbolPatterns: new Map()
        });
      }
      const brokerProfile = this.brokerProfiles.get(brokerName)!;
      brokerProfile.symbols = new Set(symbols);
      brokerProfile.lastDiscovery = Date.now();
      
      return symbols;
    } catch (error: any) {
      logger.error(`Failed to get symbols from ${brokerName}:`, error.message);
      return [];
    }
  }

  /**
   * Learn from successful symbol mapping for future use
   * @param inputSymbol - Original input symbol
   * @param workingSymbol - Symbol that worked for the broker
   * @param brokerName - Broker name
   * @param description - Symbol description from broker
   */
  static learnSymbolMapping(
    inputSymbol: string, 
    workingSymbol: string, 
    brokerName: string, 
    description: string
  ): void {
    try {
      const standardSymbol = this.inferStandardSymbol(inputSymbol, description);
      
      // Get or create symbol group
      if (!this.symbolGroups.has(standardSymbol)) {
        this.symbolGroups.set(standardSymbol, {
          standardName: standardSymbol,
          knownVariations: [workingSymbol],
          brokerMappings: new Map(),
          lastUpdated: Date.now()
        });
      }
      
      const group = this.symbolGroups.get(standardSymbol)!;
      
      // Update broker mapping
      group.brokerMappings.set(brokerName, workingSymbol);
      
      // Add to known variations if new
      if (!group.knownVariations.includes(workingSymbol)) {
        group.knownVariations.push(workingSymbol);
      }
      
      group.lastUpdated = Date.now();
      
      logger.info(`📚 Learned: ${brokerName} uses "${workingSymbol}" for ${standardSymbol}`);
      
    } catch (error) {
      logger.debug(`Learning failed for ${inputSymbol} -> ${workingSymbol}: ${error}`);
    }
  }

  /**
   * Discover and profile all symbols available on a broker
   * @param connection - MetaAPI connection
   * @param brokerName - Broker name
   */
  static async discoverBrokerSymbols(connection: any, brokerName: string): Promise<void> {
    try {
      await this.ensureConnectionReady(connection, brokerName);
      
      const specifications = connection.terminalState.specifications || {};
      const symbols = Object.keys(specifications);
      
      // Create or update broker profile
      if (!this.brokerProfiles.has(brokerName)) {
        this.brokerProfiles.set(brokerName, {
          symbols: new Set(),
          lastDiscovery: Date.now(),
          symbolPatterns: new Map()
        });
      }
      
      const profile = this.brokerProfiles.get(brokerName)!;
      profile.symbols = new Set(symbols);
      profile.lastDiscovery = Date.now();
      
      // Analyze symbol patterns
      this.analyzeSymbolPatterns(symbols, profile);
      
      logger.info(`🔍 Discovered ${symbols.length} symbols on ${brokerName}`);
      
      // Auto-learn common symbols
      this.autoLearnCommonSymbols(brokerName, specifications);
      
    } catch (error: any) {
      logger.error(`Failed to discover symbols for ${brokerName}: ${error.message}`);
    }
  }

  /**
   * Get intelligent symbol variations using learned mappings
   * @param inputSymbol - Input symbol
   * @param brokerName - Broker name
   * @returns Prioritized list of symbol variations
   */
  static getIntelligentVariations(inputSymbol: string, brokerName: string): string[] {
    const standardSymbol = this.inferStandardSymbol(inputSymbol);
    const variations = [inputSymbol]; // Always try original first
    
    // Check learned mappings first
    const group = this.symbolGroups.get(standardSymbol);
    if (group) {
      // Prioritize known working symbol for this broker
      const knownSymbol = group.brokerMappings.get(brokerName);
      if (knownSymbol && !variations.includes(knownSymbol)) {
        variations.unshift(knownSymbol); // Add at beginning
      }
      
      // Add other learned variations
      group.knownVariations.forEach(variation => {
        if (!variations.includes(variation)) {
          variations.push(variation);
        }
      });
    }
    
    // Add broker-specific patterns
    const profile = this.brokerProfiles.get(brokerName);
    if (profile) {
      const patterns = profile.symbolPatterns.get(standardSymbol) || [];
      patterns.forEach(pattern => {
        if (!variations.includes(pattern)) {
          variations.push(pattern);
        }
      });
    }
    
    // Fallback to static variations for unknown symbols
    const staticVariations = this.getStaticVariations(inputSymbol, brokerName);
    staticVariations.forEach(variation => {
      if (!variations.includes(variation)) {
        variations.push(variation);
      }
    });
    
    return variations;
  }

  /**
   * Infer standard symbol name from input or description
   * @param symbol - Input symbol
   * @param description - Optional symbol description
   * @returns Standard symbol name
   */
  private static inferStandardSymbol(symbol: string, description?: string): string {
    const upperSymbol = symbol.toUpperCase();
    const desc = description?.toLowerCase() || '';
    
    // Gold symbols
    if (upperSymbol.includes('XAU') || upperSymbol.includes('GOLD') || 
        desc.includes('gold') || upperSymbol === '66') {
      return 'GOLD';
    }
    
    // Silver symbols
    if (upperSymbol.includes('XAG') || upperSymbol.includes('SILVER') ||
        desc.includes('silver')) {
      return 'SILVER';
    }
    
    // USD indices
    if (upperSymbol.includes('US30') || upperSymbol.includes('DJ') || 
        desc.includes('dow jones')) {
      return 'US30';
    }
    
    if (upperSymbol.includes('NAS') || upperSymbol.includes('NDX') ||
        desc.includes('nasdaq')) {
      return 'NAS100';
    }
    
    // Forex pairs
    if (upperSymbol.includes('EUR') && upperSymbol.includes('USD')) {
      return 'EURUSD';
    }
    
    if (upperSymbol.includes('GBP') && upperSymbol.includes('USD')) {
      return 'GBPUSD';
    }
    
    // Oil
    if (upperSymbol.includes('OIL') || upperSymbol.includes('WTI') ||
        upperSymbol.includes('CL') || desc.includes('crude')) {
      return 'OIL';
    }
    
    // Default to the symbol itself for unknown instruments
    return upperSymbol;
  }

  /**
   * Analyze symbol patterns for a broker
   * @param symbols - Available symbols
   * @param profile - Broker profile to update
   */
  private static analyzeSymbolPatterns(symbols: string[], profile: BrokerSymbolProfile): void {
    const patterns = new Map<string, string[]>();
    
    symbols.forEach(symbol => {
      const standard = this.inferStandardSymbol(symbol);
      if (!patterns.has(standard)) {
        patterns.set(standard, []);
      }
      patterns.get(standard)!.push(symbol);
    });
    
    profile.symbolPatterns = patterns;
  }

  /**
   * Auto-learn common symbols from broker specifications
   * @param brokerName - Broker name
   * @param specifications - Symbol specifications
   */
  private static autoLearnCommonSymbols(brokerName: string, specifications: any): void {
    Object.entries(specifications).forEach(([symbol, spec]: [string, any]) => {
      if (spec?.description) {
        const standard = this.inferStandardSymbol(symbol, spec.description);
        this.learnSymbolMapping(standard, symbol, brokerName, spec.description);
      }
    });
  }

  /**
   * Static fallback variations (legacy support)
   */
  private static getStaticVariations(inputSymbol: string, brokerName: string): string[] {
    // Your existing static logic as fallback
    const symbol = inputSymbol.toUpperCase();
    const variations: string[] = [];

    if (symbol === 'GOLD' || symbol === 'XAUUSD') {
      if (brokerName === 'IFPro-Trade') {
        variations.push('66');
      }
      variations.push('XAUUSD', 'GOLD', 'XAU/USD', 'GOLD.', 'GOLDm', 'XAUUSD.', 'XAUUSDCash');
    }
    // ... rest of static logic
    
    return variations;
  }

  /**
   * Classify symbol lookup errors for better handling
   * @param error - Error object
   * @param symbol - Symbol that failed
   * @param brokerName - Broker name
   * @returns Error classification
   */
  static classifySymbolError(error: any, symbol: string, brokerName: string): 'NETWORK' | 'NOT_FOUND' | 'NOT_TRADEABLE' | 'SYNC_TIMEOUT' | 'UNKNOWN' {
    const message = error?.message?.toLowerCase() || '';
    
    if (message.includes('timeout') || message.includes('connection')) {
      return 'NETWORK';
    }
    if (message.includes('synchronization')) {
      return 'SYNC_TIMEOUT';
    }
    if (message.includes('does not exist') || message.includes('not found')) {
      return 'NOT_FOUND';
    }
    if (message.includes('not allowed') || message.includes('trading disabled')) {
      return 'NOT_TRADEABLE';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Clear cache for broker
   */
  static clearCache(brokerName?: string): void {
    if (brokerName) {
      this.symbolCache.delete(brokerName);
      this.lastCacheUpdate.delete(brokerName);
    } else {
      this.symbolCache.clear();
      this.lastCacheUpdate.clear();
    }
  }

  /**
   * Validate if symbol can be traded
   */
  static async validateForTrading(
    symbol: string, 
    connection: any, 
    brokerName: string
  ): Promise<{ valid: boolean; reason?: string; specification?: any }> {
    try {
      const validSymbol = await this.getValidSymbol(symbol, connection, brokerName);
      const specification = connection.terminalState.specification(validSymbol);
      
      if (!specification) {
        return { valid: false, reason: 'Symbol specification not available' };
      }
      
      if (specification.tradeAllowed === false) {
        return { valid: false, reason: 'Trading not allowed for this symbol' };
      }
      
      if (specification.minVolume && specification.minVolume > 100) {
        return { valid: false, reason: 'Minimum volume too high for this account' };
      }

      return { valid: true, specification };
    } catch (error: any) {
      return { valid: false, reason: error.message };
    }
  }
}
