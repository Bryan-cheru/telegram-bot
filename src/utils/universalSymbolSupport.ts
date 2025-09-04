// Universal Symbol Support System for MetaAPI
// File: src/utils/universalSymbolSupport.ts

import { logger } from './logger';

export interface SymbolInfo {
  symbol: string;
  description: string;
  type: 'FOREX' | 'METALS' | 'INDICES' | 'CRYPTO' | 'COMMODITIES' | 'STOCKS' | 'OTHER';
  minDistance: number;
  maxRiskPips: number;
  pipValue: number;
  contractSize: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  priceRange: { min: number; max: number };
  isActive: boolean;
  brokerName: string;
}

export interface BrokerSymbolData {
  [brokerName: string]: {
    [symbol: string]: SymbolInfo;
  };
}

export class UniversalSymbolSupport {
  private static symbolCache: BrokerSymbolData = {};
  private static lastUpdate: Date | null = null;
  private static updateInterval = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Fetch all available symbols from all connected MetaAPI accounts
   */
  static async discoverAllSymbols(accounts: Map<string, any>): Promise<BrokerSymbolData> {
    logger.info('🔍 Discovering all tradeable symbols across brokers...');
    const allSymbols: BrokerSymbolData = {};
    
    for (const [accountId, accountConfig] of accounts) {
      if (accountConfig.status !== 'CONNECTED' || !accountConfig.connection) {
        continue;
      }

      try {
        logger.info(`📊 Fetching symbols from ${accountConfig.brokerName}...`);
        
        // Access terminal state for symbol specifications
        const terminalState = accountConfig.connection.terminalState;
        
        if (!terminalState || !terminalState.synchronized) {
          logger.warn(`⚠️ ${accountConfig.brokerName} not synchronized yet, skipping...`);
          continue;
        }
        
        // Get symbol specifications from terminal state
        const symbolSpecs = terminalState.specifications || {};
        const marketData = terminalState.prices || {};
        
        allSymbols[accountConfig.brokerName] = {};
        
        // Process each symbol specification
        for (const [symbol, spec] of Object.entries(symbolSpecs)) {
          if (!symbol) continue;
          
          const specWithSymbol = typeof spec === 'object' ? { symbol, ...spec } : { symbol };
          const symbolInfo = await this.createSymbolInfo(specWithSymbol, accountConfig.brokerName, Object.values(marketData));
          if (symbolInfo && symbolInfo.isActive) {
            allSymbols[accountConfig.brokerName][symbol] = symbolInfo;
          }
        }
        
        logger.info(`✅ Found ${Object.keys(allSymbols[accountConfig.brokerName]).length} symbols on ${accountConfig.brokerName}`);
        
      } catch (error) {
        logger.error(`❌ Error fetching symbols from ${accountConfig.brokerName}: ${error}`);
      }
    }
    
    // Cache the results
    this.symbolCache = allSymbols;
    this.lastUpdate = new Date();
    
    const totalSymbols = Object.values(allSymbols).reduce((total, broker) => total + Object.keys(broker).length, 0);
    logger.info(`🌍 Symbol discovery complete! Total symbols: ${totalSymbols}`);
    
    return allSymbols;
  }

  /**
   * Create symbol information from MetaAPI specification
   */
  private static async createSymbolInfo(
    spec: any, 
    brokerName: string, 
    marketData: any[]
  ): Promise<SymbolInfo | null> {
    try {
      const symbol = spec.symbol;
      
      // Get current market price for the symbol
      const priceData = marketData.find(p => p.symbol === symbol);
      const currentPrice = priceData ? (priceData.bid + priceData.ask) / 2 : 0;
      
      // Determine symbol type
      const symbolType = this.classifySymbol(symbol, spec.description || '');
      
      // Calculate dynamic trading parameters
      const tradingParams = this.calculateTradingParameters(symbol, symbolType, spec, currentPrice);
      
      return {
        symbol,
        description: spec.description || symbol,
        type: symbolType,
        minDistance: tradingParams.minDistance,
        maxRiskPips: tradingParams.maxRiskPips,
        pipValue: spec.tickValue || tradingParams.pipValue,
        contractSize: spec.contractSize || 100000,
        minLot: spec.minVolume || 0.01,
        maxLot: spec.maxVolume || 100,
        lotStep: spec.volumeStep || 0.01,
        priceRange: {
          min: currentPrice * 0.5, // 50% below current
          max: currentPrice * 2.0   // 100% above current
        },
        isActive: spec.tradeMode === 'TRADE_MODE_FULL' || !spec.tradeMode,
        brokerName
      };
      
    } catch (error) {
      logger.warn(`⚠️ Could not process symbol ${spec.symbol}: ${error}`);
      return null;
    }
  }

  /**
   * Classify symbol type based on name and description
   */
  private static classifySymbol(symbol: string, description: string): SymbolInfo['type'] {
    const s = symbol.toUpperCase();
    const d = description.toUpperCase();
    
    // Forex pairs (6 characters, ends with major currencies)
    if (/^[A-Z]{6}$/.test(s) && /USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD/.test(s)) {
      return 'FOREX';
    }
    
    // Metals
    if (s.includes('XAU') || s.includes('XAG') || s.includes('GOLD') || s.includes('SILVER') || 
        d.includes('GOLD') || d.includes('SILVER')) {
      return 'METALS';
    }
    
    // Indices
    if (s.includes('US30') || s.includes('NAS') || s.includes('SPX') || s.includes('DAX') || 
        s.includes('FTSE') || s.includes('CAC') || s.includes('NIKKEI') || 
        d.includes('INDEX') || d.includes('DOW') || d.includes('NASDAQ')) {
      return 'INDICES';
    }
    
    // Cryptocurrencies
    if (s.includes('BTC') || s.includes('ETH') || s.includes('BITCOIN') || s.includes('ETHEREUM') ||
        d.includes('BITCOIN') || d.includes('ETHEREUM') || d.includes('CRYPTO')) {
      return 'CRYPTO';
    }
    
    // Commodities
    if (s.includes('OIL') || s.includes('WTI') || s.includes('BRENT') || s.includes('GAS') || 
        d.includes('OIL') || d.includes('GAS') || d.includes('COMMODITY')) {
      return 'COMMODITIES';
    }
    
    // Individual stocks
    if (s.length <= 5 && !s.includes('USD') && 
        (d.includes('CORP') || d.includes('INC') || d.includes('LTD') || d.includes('STOCK'))) {
      return 'STOCKS';
    }
    
    return 'OTHER';
  }

  /**
   * Calculate optimal trading parameters for any symbol
   */
  private static calculateTradingParameters(
    symbol: string, 
    type: SymbolInfo['type'], 
    spec: any, 
    currentPrice: number
  ) {
    const baseParams = {
      minDistance: 0.001,
      maxRiskPips: 0.01,
      pipValue: 0.0001
    };

    switch (type) {
      case 'FOREX':
        if (symbol.includes('JPY')) {
          return { minDistance: 0.15, maxRiskPips: 1.0, pipValue: 0.01 };
        }
        return { minDistance: 0.0015, maxRiskPips: 0.01, pipValue: 0.0001 };
      
      case 'METALS':
        if (symbol.includes('XAU') || symbol.includes('GOLD')) {
          return { minDistance: 5.0, maxRiskPips: 50.0, pipValue: 1.0 };
        }
        if (symbol.includes('XAG') || symbol.includes('SILVER')) {
          return { minDistance: 0.5, maxRiskPips: 2.0, pipValue: 0.1 };
        }
        return { minDistance: 1.0, maxRiskPips: 10.0, pipValue: 0.1 };
      
      case 'INDICES':
        const indexMultiplier = currentPrice > 10000 ? 0.001 : currentPrice > 1000 ? 0.01 : 0.1;
        return { 
          minDistance: currentPrice * indexMultiplier, 
          maxRiskPips: currentPrice * indexMultiplier * 20, 
          pipValue: 1.0 
        };
      
      case 'CRYPTO':
        const cryptoMultiplier = currentPrice > 10000 ? 0.005 : 0.01;
        return { 
          minDistance: currentPrice * cryptoMultiplier, 
          maxRiskPips: currentPrice * cryptoMultiplier * 10, 
          pipValue: 1.0 
        };
      
      case 'COMMODITIES':
        return { minDistance: currentPrice * 0.01, maxRiskPips: currentPrice * 0.1, pipValue: 0.01 };
      
      case 'STOCKS':
        return { minDistance: currentPrice * 0.002, maxRiskPips: currentPrice * 0.05, pipValue: 0.01 };
      
      default:
        // Dynamic calculation based on current price and tick size
        const tickSize = spec.tickSize || 0.00001;
        const minDist = Math.max(tickSize * 10, currentPrice * 0.001);
        const maxRisk = minDist * 50;
        return { minDistance: minDist, maxRiskPips: maxRisk, pipValue: tickSize };
    }
  }

  /**
   * Get symbol information for trading
   */
  static getSymbolInfo(symbol: string, brokerName?: string): SymbolInfo | null {
    // If broker specified, look in that broker's symbols
    if (brokerName && this.symbolCache[brokerName]) {
      return this.symbolCache[brokerName][symbol] || null;
    }
    
    // Search across all brokers
    for (const broker of Object.keys(this.symbolCache)) {
      if (this.symbolCache[broker][symbol]) {
        return this.symbolCache[broker][symbol];
      }
    }
    
    return null;
  }

  /**
   * Get all supported symbols across all brokers
   */
  static getAllSupportedSymbols(): string[] {
    const allSymbols = new Set<string>();
    
    for (const broker of Object.keys(this.symbolCache)) {
      Object.keys(this.symbolCache[broker]).forEach(symbol => allSymbols.add(symbol));
    }
    
    return Array.from(allSymbols).sort();
  }

  /**
   * Get symbol cache for external access
   */
  static getSymbolCache(): BrokerSymbolData {
    return this.symbolCache;
  }

  /**
   * Check if symbol is supported by any broker
   */
  static isSymbolSupported(symbol: string): boolean {
    return this.getAllSupportedSymbols().includes(symbol);
  }

  /**
   * Get symbols by type across all brokers
   */
  static getSymbolsByType(type: SymbolInfo['type']): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    
    for (const broker of Object.keys(this.symbolCache)) {
      Object.values(this.symbolCache[broker]).forEach(symbolInfo => {
        if (symbolInfo.type === type) {
          symbols.push(symbolInfo);
        }
      });
    }
    
    return symbols;
  }

  /**
   * Add fallback broker symbols to cache
   */
  static addFallbackBroker(brokerName: string, symbols: Record<string, SymbolInfo>): void {
    this.symbolCache[brokerName] = symbols;
    logger.info(`✅ Added fallback broker ${brokerName} with ${Object.keys(symbols).length} symbols`);
  }

  /**
   * Update symbol cache if needed
   */
  static async updateSymbolCacheIfNeeded(accounts: Map<string, any>): Promise<void> {
    if (!this.lastUpdate || Date.now() - this.lastUpdate.getTime() > this.updateInterval) {
      logger.info('🔄 Symbol cache is stale, updating...');
      await this.discoverAllSymbols(accounts);
    }
  }

  /**
   * Generate comprehensive symbol report
   */
  static generateSymbolReport(): string {
    const symbolCounts: Record<string, number> = {};
    const brokerCounts: Record<string, number> = {};
    
    for (const [brokerName, symbols] of Object.entries(this.symbolCache)) {
      brokerCounts[brokerName] = Object.keys(symbols).length;
      
      for (const symbolInfo of Object.values(symbols)) {
        symbolCounts[symbolInfo.type] = (symbolCounts[symbolInfo.type] || 0) + 1;
      }
    }
    
    const totalSymbols = this.getAllSupportedSymbols().length;
    
    let report = `
🌍 UNIVERSAL SYMBOL SUPPORT REPORT
══════════════════════════════════
📊 Total Unique Symbols: ${totalSymbols}
🏢 Total Brokers: ${Object.keys(brokerCounts).length}

📈 BY ASSET TYPE:
`;
    
    for (const [type, count] of Object.entries(symbolCounts)) {
      report += `• ${type}: ${count} symbols\n`;
    }
    
    report += `\n🏦 BY BROKER:\n`;
    for (const [broker, count] of Object.entries(brokerCounts)) {
      report += `• ${broker}: ${count} symbols\n`;
    }
    
    report += `\n⏰ Last Updated: ${this.lastUpdate?.toISOString() || 'Never'}\n`;
    
    return report;
  }
}
