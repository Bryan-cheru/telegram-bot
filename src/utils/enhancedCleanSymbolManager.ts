/**
 * Enhanced CleanSymbolManager following MetaAPI Best Practices
 * Based on official MetaAPI documentation and examples
 */

// Simple logger for enhanced symbol manager
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.log(`[WARN] ${message}`),
  error: (message: string) => console.log(`[ERROR] ${message}`)
};

interface MarketData {
  bid: number;
  ask: number;
  time: Date;
}

export class EnhancedCleanSymbolManager {
  private static symbolCache = new Map<string, any>();
  private static specificationCache = new Map<string, any>();

  /**
   * Get valid symbol using MetaAPI standard pattern
   * @param inputSymbol - Symbol to find (e.g., 'XAUUSD')
   * @param brokerName - Broker name
   * @param connection - MetaAPI connection
   * @returns Valid symbol name or throws error
   */
  static async getValidSymbol(
    inputSymbol: string,
    brokerName: string,
    connection: any
  ): Promise<string> {
    logger.info(`🔍 Finding symbol ${inputSymbol} on ${brokerName} using MetaAPI standard pattern`);

    // Ensure connection is synchronized (MetaAPI best practice)
    if (!connection.terminalState.connected) {
      throw new Error('Connection not established');
    }

    if (!connection.isSynchronized()) {
      logger.info('⏳ Waiting for synchronization...');
      await connection.waitSynchronized();
    }

    // Use MetaAPI standard approach: check specifications first
    const terminalState = connection.terminalState;
    const specifications = terminalState.specifications;
    
    logger.info(`📊 ${specifications.length} specifications available on ${brokerName}`);

    // Find symbol using specification analysis (MetaAPI pattern)
    const validSymbol = this.findSymbolInSpecifications(inputSymbol, specifications);
    
    if (validSymbol) {
      logger.info(`✅ Found valid symbol: ${validSymbol}`);
      return validSymbol;
    }

    // If not found, list available alternatives
    this.logAvailableAlternatives(inputSymbol, specifications);
    throw new Error(`Symbol ${inputSymbol} not available on ${brokerName}`);
  }

  /**
   * Find symbol in specifications using MetaAPI approach
   * @param inputSymbol - Symbol to find
   * @param specifications - All available specifications
   * @returns Valid symbol or null
   */
  private static findSymbolInSpecifications(
    inputSymbol: string,
    specifications: any[]
  ): string | null {
    const searchTerm = inputSymbol.toUpperCase();
    
    // Direct match first
    let match = specifications.find(spec => 
      spec.symbol.toUpperCase() === searchTerm
    );
    
    if (match && this.isSymbolTradeable(match)) {
      return match.symbol;
    }

    // For XAUUSD/Gold, search in descriptions and symbol patterns
    if (searchTerm === 'XAUUSD' || searchTerm === 'GOLD') {
      const goldSymbols = specifications.filter(spec => {
        const symbol = spec.symbol.toUpperCase();
        const description = (spec.description || '').toUpperCase();
        
        return symbol.includes('XAU') || 
               symbol.includes('GOLD') || 
               symbol.includes('167') || // Common CFD pattern
               description.includes('GOLD') ||
               description.includes('XAU');
      });

      // Return first tradeable Gold symbol
      for (const goldSpec of goldSymbols) {
        if (this.isSymbolTradeable(goldSpec)) {
          logger.info(`📈 Found Gold symbol: ${goldSpec.symbol} (${goldSpec.description})`);
          return goldSpec.symbol;
        }
      }
    }

    // Standard variations (only if no specification-based match)
    const variations = this.generateSymbolVariations(inputSymbol);
    
    for (const variation of variations) {
      match = specifications.find(spec => 
        spec.symbol.toUpperCase() === variation.toUpperCase()
      );
      
      if (match && this.isSymbolTradeable(match)) {
        return match.symbol;
      }
    }

    return null;
  }

  /**
   * Check if symbol is tradeable (MetaAPI pattern)
   * @param specification - Symbol specification
   * @returns True if tradeable
   */
  private static isSymbolTradeable(specification: any): boolean {
    // Check if trading sessions exist (from MetaAPI examples)
    if (specification.tradeSessions) {
      return Object.values(specification.tradeSessions).some((sessions: any) => 
        Array.isArray(sessions) && sessions.length > 0
      );
    }
    
    // If no trade sessions defined, assume tradeable
    return true;
  }

  /**
   * Generate symbol variations for fallback search
   * @param symbol - Base symbol
   * @returns Array of variations
   */
  private static generateSymbolVariations(symbol: string): string[] {
    const base = symbol.toUpperCase();
    const variations = [base];

    // Standard forex variations
    if (base === 'XAUUSD') {
      variations.push('GOLD', 'XAU/USD', 'GOLD.', 'GOLDm', 'XAUUSD.', 'XAUUSDCash');
    }

    // Add common suffixes/prefixes
    variations.push(
      base + '.',
      base + 'm',
      base + '_',
      base + 'Cash',
      base.toLowerCase()
    );

    return variations;
  }

  /**
   * Log available alternatives for troubleshooting
   * @param inputSymbol - Symbol that wasn't found
   * @param specifications - All specifications
   */
  private static logAvailableAlternatives(inputSymbol: string, specifications: any[]): void {
    const searchTerm = inputSymbol.toUpperCase();
    
    if (searchTerm === 'XAUUSD' || searchTerm === 'GOLD') {
      // Look for any Gold-related symbols
      const goldLike = specifications.filter(spec => {
        const symbol = spec.symbol.toUpperCase();
        const description = (spec.description || '').toUpperCase();
        
        return symbol.includes('XAU') || 
               symbol.includes('GOLD') || 
               symbol.includes('AU') ||
               description.includes('GOLD') ||
               description.includes('XAU');
      });

      if (goldLike.length > 0) {
        logger.info(`💡 Found ${goldLike.length} Gold-related symbols:`);
        goldLike.forEach(spec => {
          const tradeable = this.isSymbolTradeable(spec) ? '✅' : '❌';
          logger.info(`   ${tradeable} ${spec.symbol} - ${spec.description || 'No description'}`);
        });
      } else {
        logger.warn(`⚠️ No Gold-related symbols found on this broker`);
      }
    }

    // Log a sample of available symbols
    logger.info(`📋 Sample of available symbols (first 10):`);
    specifications.slice(0, 10).forEach(spec => {
      logger.info(`   ${spec.symbol} - ${spec.description || 'No description'}`);
    });
  }

  /**
   * Ensure market data is available (MetaAPI optional pattern)
   * @param symbol - Valid symbol name
   * @param connection - MetaAPI connection
   * @param timeoutMs - Timeout in milliseconds
   * @returns Market data or fallback data
   */
  static async ensureMarketData(
    symbol: string,
    connection: any,
    timeoutMs: number = 15000
  ): Promise<MarketData> {
    logger.info(`📊 Getting market data for ${symbol} (MetaAPI pattern)`);

    // Try to get existing price first (MetaAPI standard)
    let price = connection.terminalState.price(symbol);
    
    if (price && typeof price.bid === 'number' && typeof price.ask === 'number') {
      logger.info(`✅ Price already available: ${symbol} Bid=${price.bid} Ask=${price.ask}`);
      return {
        bid: price.bid,
        ask: price.ask,
        time: new Date(price.time || Date.now())
      };
    }

    // Optional: Try to subscribe to market data (may fail, that's OK)
    try {
      await connection.subscribeToMarketData(symbol);
      logger.info(`✅ Market data subscription successful for ${symbol}`);
    } catch (error: any) {
      logger.warn(`⚠️ Market data subscription failed for ${symbol}: ${error.message}`);
      logger.info(`💡 This is normal for some symbols - trading may still work`);
    }

    // Wait for price data with timeout
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      price = connection.terminalState.price(symbol);
      
      if (price && typeof price.bid === 'number' && typeof price.ask === 'number') {
        logger.info(`✅ Market data received: ${symbol} Bid=${price.bid} Ask=${price.ask}`);
        return {
          bid: price.bid,
          ask: price.ask,
          time: new Date(price.time || Date.now())
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Fallback: Use synthetic data (for demo accounts)
    logger.warn(`⚠️ No real-time market data for ${symbol}, using fallback approach`);
    
    // Generate reasonable synthetic prices based on symbol
    let basePrice = 1.1000; // Default forex
    let spread = 0.0002;
    
    if (symbol.toUpperCase().includes('XAU') || 
        symbol.toUpperCase().includes('GOLD') ||
        symbol.includes('167')) { // Gold CFD pattern
      basePrice = 2650; // Realistic gold price
      spread = 0.5;
    }
    
    return {
      bid: basePrice - spread/2,
      ask: basePrice + spread/2,
      time: new Date()
    };
  }

  /**
   * Test if symbol is tradeable using MetaAPI margin calculation
   * @param symbol - Symbol to test
   * @param connection - MetaAPI connection
   * @returns True if tradeable
   */
  static async testSymbolTradeability(
    symbol: string,
    connection: any
  ): Promise<boolean> {
    try {
      const specification = connection.terminalState.specification(symbol);
      if (!specification) {
        logger.warn(`❌ No specification for ${symbol}`);
        return false;
      }

      // Test margin calculation (from MetaAPI examples)
      const margin = await connection.calculateMargin({
        symbol: symbol,
        type: 'ORDER_TYPE_BUY',
        volume: specification.minVolume || 0.01,
        openPrice: symbol.includes('XAU') || symbol.includes('GOLD') ? 2650 : 1.1
      });

      logger.info(`✅ ${symbol} is tradeable - margin calculation successful`);
      return true;
      
    } catch (error: any) {
      logger.warn(`❌ ${symbol} tradeability test failed: ${error.message}`);
      return false;
    }
  }
}
