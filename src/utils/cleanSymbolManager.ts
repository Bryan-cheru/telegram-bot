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
export class CleanSymbolManager {
  private static symbolCache = new Map<string, Map<string, SymbolInfo>>();
  private static lastCacheUpdate = new Map<string, number>();
  private static readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

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

    // Step 1: Ensure terminal is synchronized (critical for IFPro-Trade)
    if (!connection.terminalState.synchronized) {
      logger.info('⏳ Waiting for terminal synchronization...');
      await Promise.race([
        connection.waitSynchronized(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Synchronization timeout')), 30000)
        )
      ]);
      
      // Verify synchronization completed
      if (brokerName === 'IFPro-Trade') {
        logger.info(`🔧 IFPro-Trade - Post-sync specifications count: ${Object.keys(connection.terminalState.specifications || {}).length}`);
      }
    }

    // Step 2: Get symbol variations to try
    const variations = this.getSymbolVariations(inputSymbol, brokerName);
    logger.debug(`Trying variations: ${variations.join(', ')}`);

    // Step 3: Test each variation using direct specifications access (more reliable)
    const specifications = connection.terminalState.specifications || {};
    
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
          logger.info(`✅ Found valid symbol: ${symbol} (${specification.description})`);
          
          // Cache the result
          this.cacheSymbolInfo(brokerName, symbol, specification);
          
          return symbol;
        }
      } catch (error: any) {
        // Symbol doesn't exist, continue to next variation
        if (brokerName === 'IFPro-Trade') {
          logger.info(`🔧 IFPro-Trade - Symbol ${symbol} failed: ${error?.message || 'Unknown error'}`);
        }
        logger.debug(`Symbol ${symbol} not found on ${brokerName}`);
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
   * @param inputSymbol - Original symbol
   * @param brokerName - Broker name for specific variations
   * @returns Array of symbol variations to try
   */
  private static getSymbolVariations(inputSymbol: string, brokerName?: string): string[] {
    const symbol = inputSymbol.toUpperCase();
    const variations = [symbol]; // Always try original first

    // Gold variations (including numeric symbols used by some brokers like IFPro-Trade)
    if (symbol === 'GOLD' || symbol === 'XAUUSD') {
      // For IFPro-Trade, try numeric symbol first since that's what they use
      if (brokerName === 'IFPro-Trade') {
        variations.unshift('66'); // Add at beginning to try first
      }
      variations.push('XAUUSD', 'GOLD', 'XAU/USD', 'GOLD.', 'GOLDm', 'XAUUSD.', 'XAUUSDCash', '66');
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
   * Get all available symbols for a broker (for debugging)
   */
  static async getAllSymbols(connection: any, brokerName: string): Promise<string[]> {
    try {
      if (!connection.synchronized) {
        await Promise.race([
          connection.waitSynchronized(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Synchronization timeout')), 30000)
          )
        ]);
      }

      const specifications = connection.terminalState.specifications || {};
      const symbols = Object.keys(specifications)
        .filter(symbol => {
          const spec = specifications[symbol];
          return spec && spec.tradeAllowed !== false;
        });

      logger.info(`📋 Found ${symbols.length} tradeable symbols on ${brokerName}`);
      return symbols;
    } catch (error) {
      logger.error(`Failed to get symbols from ${brokerName}:`, error);
      return [];
    }
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
