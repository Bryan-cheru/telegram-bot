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
    // ENHANCEMENT: Also try discovering symbols from broker specifications
    const discoveredSymbols = this.discoverSymbolsFromSpecifications(inputSymbol, specifications);
    if (discoveredSymbols.length > 0) {
      logger.info(`🔍 ${brokerName} - Found ${discoveredSymbols.length} discovered symbols: ${discoveredSymbols.slice(0, 3).join(', ')}${discoveredSymbols.length > 3 ? '...' : ''}`);
      // Add discovered symbols to the front of variations list
      discoveredSymbols.forEach((symbol: string) => {
        if (!variations.includes(symbol)) {
          variations.unshift(symbol);
        }
      });
    }
    
    logger.info(`🔍 ${brokerName} - Testing ${variations.length} total variations: ${variations.slice(0, 5).join(', ')}${variations.length > 5 ? '...' : ''}`);
    
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
          // Validate that the found symbol actually matches what we're looking for
          const isValidMatch = this.validateSymbolMatch(inputSymbol, symbol, specification.description);
          
          if (!isValidMatch) {
            logger.warn(`⚠️ ${symbol} found but description doesn't match ${inputSymbol}: ${specification.description}`);
            continue; // Try next variation
          }
          
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

    // Enhanced error handling with diagnosis
    return this.handleSymbolNotFound(inputSymbol, brokerName, connection, variations);
  }

  /**
   * Enhanced error handling with symbol availability diagnosis
   * @param inputSymbol - Original symbol requested
   * @param brokerName - Broker name
   * @param connection - MetaAPI connection
   * @param variations - Variations that were tried
   */
  private static async handleSymbolNotFound(
    inputSymbol: string,
    brokerName: string,
    connection: any,
    variations: string[]
  ): Promise<never> {
    // For GBPJPY specifically, let's see what GBP and JPY symbols ARE available
    if (inputSymbol.toUpperCase() === 'GBPJPY') {
      try {
        const gbpSymbols = await this.debugListAllSymbols(connection, brokerName, 'GBP');
        const jpySymbols = await this.debugListAllSymbols(connection, brokerName, 'JPY');
        
        logger.info(`🔍 ${brokerName} GBP symbols available: ${gbpSymbols.slice(0, 10).join(', ')}`);
        logger.info(`🔍 ${brokerName} JPY symbols available: ${jpySymbols.slice(0, 10).join(', ')}`);
        
        if (gbpSymbols.length === 0 && jpySymbols.length === 0) {
          logger.warn(`⚠️ ${brokerName} may not offer GBP or JPY trading pairs`);
        }
      } catch (error) {
        logger.debug(`Could not analyze available symbols: ${error}`);
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

    // CRITICAL FIX: Remove hardcoded mappings - they cause failures
    // MetaAPI best practice: Use dynamic discovery instead of static mappings
    if (brokerName === 'IFPro-Trade') {
      // Add learned mappings from cache if available
      const learnedMapping = this.getLearnedMapping(symbol, brokerName);
      if (learnedMapping) {
        variations.push(learnedMapping);
        logger.info(`📚 Using learned mapping: ${symbol} → ${learnedMapping} for ${brokerName}`);
      }
      
      // Add common patterns for IFPro-Trade (discovered through testing)  
      // NOTE: Remove specific numeric mappings - they vary and are unreliable
      variations.push(
        symbol,
        symbol.toLowerCase(),
        symbol.toUpperCase(),
        symbol + '_'
      );
    }

    // Gold variations - only add numeric symbols for specific brokers
    if (symbol === 'GOLD' || symbol === 'XAUUSD') {
      variations.push('XAUUSD', 'GOLD', 'XAU/USD', 'GOLD.', 'GOLDm', 'XAUUSD.', 'XAUUSDCash');
      // Only add numeric symbols for brokers that actually use them for Gold
      if (brokerName === 'IFPro-Trade') {
        variations.push('67'); // IFPro-Trade specific Gold symbol
      }
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
    // USDCHF variations
    else if (symbol === 'USDCHF') {
      variations.push('USDCHF', 'USD/CHF', 'USDCHF.', 'USDCHFm');
    }
    // USDJPY variations
    else if (symbol === 'USDJPY') {
      variations.push('USDJPY', 'USD/JPY', 'USDJPY.', 'USDJPYm');
    }
    // AUDUSD variations
    else if (symbol === 'AUDUSD') {
      variations.push('AUDUSD', 'AUD/USD', 'AUDUSD.', 'AUDUSDm');
    }
    // USDCAD variations
    else if (symbol === 'USDCAD') {
      variations.push('USDCAD', 'USD/CAD', 'USDCAD.', 'USDCADm');
    }
    // NZDUSD variations
    else if (symbol === 'NZDUSD') {
      variations.push('NZDUSD', 'NZD/USD', 'NZDUSD.', 'NZDUSDm');
    }
    // EURGBP variations
    else if (symbol === 'EURGBP') {
      variations.push('EURGBP', 'EUR/GBP', 'EURGBP.', 'EURGBPm');
    }
    // EURJPY variations
    else if (symbol === 'EURJPY') {
      variations.push('EURJPY', 'EUR/JPY', 'EURJPY.', 'EURJPYm');
    }
    // GBPJPY variations - Enhanced with more alternatives
    else if (symbol === 'GBPJPY') {
      variations.push(
        'GBPJPY', 'GBP/JPY', 'GBPJPY.', 'GBPJPYm', 'GBPJPYCash',
        'GBPJPY_', 'GBPJPY.std', 'gbpjpy', 'GBPJPYpro',
        'GBPJPY_ECN', 'GBPJPYECN', 'GBPJPY.a', 'GBPJPY.raw',
        'GBPJPY.swap', 'GBPJPY#', 'GBP-JPY', 'GBPJPY_raw',
        'GBPJPY_mini', 'GBPJPY_micro', 'GBPJPYex', 'GBPJPYfx',
        'GBP_JPY', 'GBPJPYc', 'GBPJPY.r', 'GBPJPY.fx'
      );
    }
    // EURCHF variations
    else if (symbol === 'EURCHF') {
      variations.push('EURCHF', 'EUR/CHF', 'EURCHF.', 'EURCHFm');
    }
    // GBPCHF variations
    else if (symbol === 'GBPCHF') {
      variations.push('GBPCHF', 'GBP/CHF', 'GBPCHF.', 'GBPCHFm');
    }
    // AUDJPY variations
    else if (symbol === 'AUDJPY') {
      variations.push('AUDJPY', 'AUD/JPY', 'AUDJPY.', 'AUDJPYm');
    }
    // CADJPY variations
    else if (symbol === 'CADJPY') {
      variations.push('CADJPY', 'CAD/JPY', 'CADJPY.', 'CADJPYm');
    }
    // CHFJPY variations
    else if (symbol === 'CHFJPY') {
      variations.push('CHFJPY', 'CHF/JPY', 'CHFJPY.', 'CHFJPYm');
    }
    // NZDJPY variations
    else if (symbol === 'NZDJPY') {
      variations.push('NZDJPY', 'NZD/JPY', 'NZDJPY.', 'NZDJPYm');
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
   * Debug method to list all available symbols on a broker
   * @param connection - MetaAPI connection
   * @param brokerName - Broker name
   * @param filterPattern - Optional pattern to filter symbols (e.g., "GBP", "JPY")
   * @returns Array of all available symbols
   */
  static async debugListAllSymbols(
    connection: any, 
    brokerName: string, 
    filterPattern?: string
  ): Promise<string[]> {
    try {
      logger.info(`🔍 Listing all available symbols for ${brokerName}${filterPattern ? ` (filter: ${filterPattern})` : ''}...`);
      
      // Ensure connection and synchronization
      await CleanSymbolManager.ensureConnectionReady(connection, brokerName);
      
      const specifications = connection.terminalState.specifications || {};
      const allSymbols = Object.keys(specifications);
      
      let filteredSymbols = allSymbols;
      if (filterPattern) {
        const pattern = filterPattern.toUpperCase();
        filteredSymbols = allSymbols.filter(symbol => 
          symbol.toUpperCase().includes(pattern) ||
          (specifications[symbol]?.description?.toUpperCase().includes(pattern))
        );
      }
      
      logger.info(`📊 ${brokerName} has ${allSymbols.length} total symbols${filterPattern ? `, ${filteredSymbols.length} matching "${filterPattern}"` : ''}`);
      
      if (filteredSymbols.length > 0 && filteredSymbols.length <= 50) {
        logger.info(`🔧 ${brokerName} symbols: ${filteredSymbols.slice(0, 20).join(', ')}${filteredSymbols.length > 20 ? '...' : ''}`);
      }
      
      return filteredSymbols;
    } catch (error: any) {
      logger.error(`❌ Failed to list symbols for ${brokerName}: ${error.message}`);
      return [];
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
   * Get learned mapping for a symbol from cache
   * @param inputSymbol - Input symbol to look up
   * @param brokerName - Broker name
   * @returns Learned symbol mapping or null
   */
  static getLearnedMapping(inputSymbol: string, brokerName: string): string | null {
    const standardSymbol = this.inferStandardSymbol(inputSymbol);
    const group = this.symbolGroups.get(standardSymbol);
    
    if (group && group.brokerMappings.has(brokerName)) {
      return group.brokerMappings.get(brokerName) || null;
    }
    
    return null;
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
    
    // CRITICAL FIX: Use our comprehensive getSymbolVariations method
    const staticVariations = this.getSymbolVariations(standardSymbol, brokerName);
    staticVariations.forEach(variation => {
      if (!variations.includes(variation)) {
        variations.push(variation);
      }
    });
    
    // ENHANCEMENT: Add broker-specific naming patterns based on research
    const brokerSpecificVariations = this.getBrokerSpecificVariations(standardSymbol, brokerName);
    brokerSpecificVariations.forEach(variation => {
      if (!variations.includes(variation)) {
        variations.push(variation);
      }
    });
    
    return variations;
  }

  /**
   * Advanced symbol discovery from specifications using multiple strategies
   * @param inputSymbol - Symbol to search for
   * @param specifications - Broker specifications
   * @returns Array of discovered matching symbols
   */
  private static discoverSymbolsFromSpecifications(inputSymbol: string, specifications: any): string[] {
    const discoveredSymbols: string[] = [];
    const standardSymbol = this.inferStandardSymbol(inputSymbol);
    
    // Strategy 1: Direct pattern matching
    const searchPatterns = [
      standardSymbol,
      standardSymbol.toLowerCase(),
      standardSymbol.toUpperCase()
    ];
    
    // Strategy 2: For GBPJPY, also search for GBP and JPY separately
    const currencyPairs = this.extractCurrencyPair(standardSymbol);
    if (currencyPairs) {
      searchPatterns.push(
        ...currencyPairs.patterns,
        currencyPairs.base,
        currencyPairs.quote
      );
    }
    
    // Search through all available specifications
    for (const [symbol, spec] of Object.entries(specifications)) {
      if (!spec || typeof spec !== 'object') continue;
      
      const symbolUpper = symbol.toUpperCase();
      const description = (spec as any).description || '';
      
      // Strategy 1: Symbol name matching
      for (const pattern of searchPatterns) {
        if (symbolUpper.includes(pattern.toUpperCase()) ||
            pattern.toUpperCase().includes(symbolUpper)) {
          
          if (this.validateSymbolMatch(inputSymbol, symbol, description)) {
            discoveredSymbols.push(symbol);
            break;
          }
        }
      }
      
      // Strategy 2: Description-based matching for currency pairs
      if (currencyPairs && description) {
        const descUpper = description.toUpperCase();
        if ((descUpper.includes(currencyPairs.base) && descUpper.includes(currencyPairs.quote)) ||
            (descUpper.includes('BRITISH') && descUpper.includes('POUND') && descUpper.includes('JAPANESE') && descUpper.includes('YEN')) ||
            (descUpper.includes('GBP') && descUpper.includes('JPY'))) {
          
          if (this.validateSymbolMatch(inputSymbol, symbol, description)) {
            discoveredSymbols.push(symbol);
          }
        }
      }
    }
    
    return [...new Set(discoveredSymbols)]; // Remove duplicates
  }

  /**
   * Extract currency pair information from symbol
   * @param symbol - Input symbol like "GBPJPY"
   * @returns Currency pair info or null
   */
  private static extractCurrencyPair(symbol: string): { base: string; quote: string; patterns: string[] } | null {
    const upper = symbol.toUpperCase();
    
    // Common 6-character currency pairs
    if (upper.length === 6) {
      const base = upper.substring(0, 3);
      const quote = upper.substring(3, 6);
      
      return {
        base,
        quote,
        patterns: [
          `${base}${quote}`,
          `${base}/${quote}`,
          `${base}-${quote}`,
          `${base}_${quote}`,
          `${base}.${quote}`
        ]
      };
    }
    
    return null;
  }

  /**
   * Get broker-specific symbol variations based on research and patterns
   * @param standardSymbol - Standard symbol name (e.g., 'USDCHF')
   * @param brokerName - Broker name
   * @returns Array of broker-specific symbol variations
   */
  private static getBrokerSpecificVariations(standardSymbol: string, brokerName: string): string[] {
    const variations: string[] = [];
    
    // FTMO-specific patterns
    if (brokerName.includes('FTMO')) {
      // FTMO typically uses standard naming, but may have suffixes
      variations.push(
        standardSymbol,
        standardSymbol + '_',
        standardSymbol + '.std',
        standardSymbol.toLowerCase(),
        standardSymbol + 'pro'
      );
    }
    
    // IFPro-Trade specific patterns (from logs - they use numeric codes for some symbols)
    else if (brokerName === 'IFPro-Trade') {
      // IFPro-Trade uses both standard names and numeric codes
      variations.push(
        standardSymbol,
        standardSymbol.toLowerCase(),
        standardSymbol + '_'
      );
      
      // Special handling for forex pairs with known numeric mappings
      if (standardSymbol === 'USDCHF') {
        variations.push('USDCHF', 'usdchf', 'USD/CHF');
      }
    }
    
    // Pepperstone-specific patterns
    else if (brokerName.includes('Pepperstone')) {
      // Pepperstone typically uses standard naming with potential suffixes
      variations.push(
        standardSymbol,
        standardSymbol + '.a',
        standardSymbol + '_ECN',
        standardSymbol + 'ECN',
        standardSymbol.toLowerCase()
      );
    }
    
    // Generic patterns for unknown brokers
    else {
      variations.push(
        standardSymbol,
        standardSymbol.toLowerCase(),
        standardSymbol.toUpperCase(),
        standardSymbol + '.',
        standardSymbol + '_',
        standardSymbol + 'm',
        standardSymbol + 'pro',
        standardSymbol + 'Cash'
      );
    }
    
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
    
    // Gold symbols - REMOVED numeric assumption (66 varies by broker)
    if (upperSymbol.includes('XAU') || upperSymbol.includes('GOLD') || 
        desc.includes('gold')) {
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
    
    // Forex pairs - Major pairs
    if (upperSymbol.includes('EUR') && upperSymbol.includes('USD')) {
      return 'EURUSD';
    }
    
    if (upperSymbol.includes('GBP') && upperSymbol.includes('USD')) {
      return 'GBPUSD';
    }
    
    if (upperSymbol.includes('USD') && upperSymbol.includes('CHF')) {
      return 'USDCHF';
    }
    
    if (upperSymbol.includes('USD') && upperSymbol.includes('JPY')) {
      return 'USDJPY';
    }
    
    if (upperSymbol.includes('AUD') && upperSymbol.includes('USD')) {
      return 'AUDUSD';
    }
    
    if (upperSymbol.includes('USD') && upperSymbol.includes('CAD')) {
      return 'USDCAD';
    }
    
    if (upperSymbol.includes('NZD') && upperSymbol.includes('USD')) {
      return 'NZDUSD';
    }
    
    // Forex pairs - Cross pairs
    if (upperSymbol.includes('EUR') && upperSymbol.includes('GBP')) {
      return 'EURGBP';
    }
    
    if (upperSymbol.includes('EUR') && upperSymbol.includes('JPY')) {
      return 'EURJPY';
    }
    
    if (upperSymbol.includes('GBP') && upperSymbol.includes('JPY')) {
      return 'GBPJPY';
    }
    
    if (upperSymbol.includes('EUR') && upperSymbol.includes('CHF')) {
      return 'EURCHF';
    }
    
    if (upperSymbol.includes('GBP') && upperSymbol.includes('CHF')) {
      return 'GBPCHF';
    }
    
    if (upperSymbol.includes('AUD') && upperSymbol.includes('JPY')) {
      return 'AUDJPY';
    }
    
    if (upperSymbol.includes('CAD') && upperSymbol.includes('JPY')) {
      return 'CADJPY';
    }
    
    if (upperSymbol.includes('CHF') && upperSymbol.includes('JPY')) {
      return 'CHFJPY';
    }
    
    if (upperSymbol.includes('NZD') && upperSymbol.includes('JPY')) {
      return 'NZDJPY';
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
    // Use the comprehensive symbol variations we implemented
    return this.getSymbolVariations(inputSymbol, brokerName);
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

  /**
   * Validate that a found symbol actually matches the requested instrument
   * @param requestedSymbol - The symbol we're looking for (e.g., XAUUSD)
   * @param foundSymbol - The symbol we found on the broker
   * @param description - The description of the found symbol
   * @returns True if it's a valid match
   */
  private static validateSymbolMatch(requestedSymbol: string, foundSymbol: string, description: string): boolean {
    const requested = requestedSymbol.toUpperCase();
    const found = foundSymbol.toUpperCase();
    const desc = description.toLowerCase();
    
    // Direct symbol matches
    if (found === requested) {
      return true;
    }
    
    // CRITICAL FIX: Prevent cross-broker numeric symbol contamination
    // Numeric symbols like "67" can mean different things on different brokers
    // Only accept numeric symbols if description explicitly matches what we want
    if (/^\d+$/.test(found)) {
      // For gold requests, only accept numeric if description mentions gold
      if ((requested === 'GOLD' || requested === 'XAUUSD') && 
          !(desc.includes('gold') || desc.includes('xau') || 
            (desc.includes('troy ounce') && desc.includes('gold')))) {
        return false;
      }
      
      // For silver requests, only accept numeric if description mentions silver
      if ((requested === 'SILVER' || requested === 'XAGUSD') && 
          !(desc.includes('silver') || desc.includes('xag'))) {
        return false;
      }
      
      // For forex pairs, numeric symbols are generally invalid
      if (this.isForexPair(requested)) {
        return false;
      }
    }
    
    // Enhanced forex pair matching based on MetaAPI research
    const forexPairs: { [key: string]: string[] } = {
      'USDCHF': ['usd', 'chf', 'dollar', 'franc', 'swiss'],
      'EURUSD': ['eur', 'usd', 'euro', 'dollar'],
      'GBPUSD': ['gbp', 'usd', 'pound', 'dollar', 'sterling'],
      'USDJPY': ['usd', 'jpy', 'dollar', 'yen'],
      'AUDUSD': ['aud', 'usd', 'australian', 'dollar'],
      'USDCAD': ['usd', 'cad', 'dollar', 'canadian'],
      'NZDUSD': ['nzd', 'usd', 'new zealand', 'dollar'],
      'EURGBP': ['eur', 'gbp', 'euro', 'pound'],
      'EURJPY': ['eur', 'jpy', 'euro', 'yen'],
      'GBPJPY': ['gbp', 'jpy', 'pound', 'yen'],
      'EURCHF': ['eur', 'chf', 'euro', 'franc'],
      'GBPCHF': ['gbp', 'chf', 'pound', 'franc'],
      'AUDJPY': ['aud', 'jpy', 'australian', 'yen'],
      'CADJPY': ['cad', 'jpy', 'canadian', 'yen'],
      'CHFJPY': ['chf', 'jpy', 'franc', 'yen'],
      'NZDJPY': ['nzd', 'jpy', 'new zealand', 'yen']
    };
    
    // Check forex pairs by description
    const keywords = forexPairs[requested];
    if (keywords && keywords.length >= 2) {
      const matchedKeywords = keywords.filter(keyword => desc.includes(keyword));
      if (matchedKeywords.length >= 2) {
        return true;
      }
    }
    
    // For Gold/XAUUSD requests
    if (requested === 'GOLD' || requested === 'XAUUSD') {
      return desc.includes('gold') || desc.includes('xau') || 
             (desc.includes('troy ounce') && desc.includes('gold'));
    }
    
    // For Silver/XAGUSD requests  
    if (requested === 'SILVER' || requested === 'XAGUSD') {
      return desc.includes('silver') || desc.includes('xag');
    }
    
    // Flexible pattern matching for symbol variations
    const normalizedRequested = requested.replace(/[^A-Z]/g, '');
    const normalizedFound = found.replace(/[^A-Z]/g, '');
    
    if (normalizedRequested === normalizedFound) {
      return true;
    }
    
    // Check if one contains the other (for patterns like USDCHF vs USDCHFm)
    if (normalizedRequested.includes(normalizedFound) || normalizedFound.includes(normalizedRequested)) {
      return true;
    }
    
    // Conservative fallback - require description to contain the symbol name
    return desc.includes(requested.toLowerCase()) || 
           found.includes(normalizedRequested);
  }

  /**
   * Check if a symbol is a forex pair
   */
  private static isForexPair(symbol: string): boolean {
    const forexPatterns = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'CHFJPY', 'NZDJPY'
    ];
    return forexPatterns.includes(symbol.toUpperCase());
  }

  /**
   * Suggests alternative trading pairs when the requested symbol is not available
   * @param requestedSymbol - The symbol that was not found
   * @param brokerName - The broker name for context
   * @returns Array of suggested alternative symbols with reasoning
   */
  static suggestAlternativeSymbols(requestedSymbol: string, brokerName: string): Array<{symbol: string, reason: string}> {
    const upperSymbol = requestedSymbol.toUpperCase();
    const suggestions: Array<{symbol: string, reason: string}> = [];

    // GBPJPY specific alternatives
    if (upperSymbol.includes('GBPJPY')) {
      suggestions.push(
        { symbol: 'GBPUSD', reason: 'GBP strength component - half of GBPJPY correlation' },
        { symbol: 'USDJPY', reason: 'JPY strength component - can trade inverse for GBP/JPY effect' },
        { symbol: 'EURJPY', reason: 'Similar JPY cross pair with high correlation to GBPJPY' },
        { symbol: 'AUDJPY', reason: 'Alternative JPY cross pair, commodity currency vs JPY' },
        { symbol: 'EURGBP', reason: 'GBP strength vs EUR - different dynamic but GBP exposure' }
      );
    }

    // Other common missing symbols
    else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
      suggestions.push(
        { symbol: 'XAGUSD', reason: 'Silver - precious metals correlation with gold' },
        { symbol: 'EURUSD', reason: 'Major pair - often inverse correlation with gold' }
      );
    }

    // Exotic pairs fallbacks
    else if (upperSymbol.includes('CHF')) {
      suggestions.push(
        { symbol: 'USDCHF', reason: 'Major CHF pair - usually available on all brokers' },
        { symbol: 'EURCHF', reason: 'EUR/CHF cross - alternative CHF exposure' }
      );
    }

    // Generic fallbacks for any missing symbol
    if (suggestions.length === 0) {
      suggestions.push(
        { symbol: 'EURUSD', reason: 'Most liquid major pair - available on all brokers' },
        { symbol: 'GBPUSD', reason: 'Major GBP pair - high volatility alternative' },
        { symbol: 'USDJPY', reason: 'Major JPY pair - safe haven currency exposure' }
      );
    }

    logger.info(`💡 Suggested ${suggestions.length} alternatives for ${requestedSymbol} on ${brokerName}`);
    return suggestions;
  }
}
