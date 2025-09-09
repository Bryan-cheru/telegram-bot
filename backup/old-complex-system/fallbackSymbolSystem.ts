// Fallback Symbol System for MetaAPI
// File: src/utils/fallbackSymbolSystem.ts

import { logger } from './logger';
import { UniversalSymbolSupport, SymbolInfo } from './universalSymbolSupport';

export interface FallbackSymbolSpec {
  symbol: string;
  description: string;
  type: 'FOREX' | 'METALS' | 'INDICES' | 'CRYPTO' | 'COMMODITIES';
  minDistance: number;
  maxRiskPips: number;
  pipValue: number;
  contractSize: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  isActive: boolean;
}

export class FallbackSymbolSystem {
  private static fallbackSymbols: Record<string, FallbackSymbolSpec> = {
    // Major Forex Pairs
    'EURUSD': {
      symbol: 'EURUSD',
      description: 'Euro vs US Dollar',
      type: 'FOREX',
      minDistance: 10,
      maxRiskPips: 100,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'GBPUSD': {
      symbol: 'GBPUSD',
      description: 'British Pound vs US Dollar',
      type: 'FOREX',
      minDistance: 15,
      maxRiskPips: 120,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'USDJPY': {
      symbol: 'USDJPY',
      description: 'US Dollar vs Japanese Yen',
      type: 'FOREX',
      minDistance: 10,
      maxRiskPips: 100,
      pipValue: 0.01,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'USDCHF': {
      symbol: 'USDCHF',
      description: 'US Dollar vs Swiss Franc',
      type: 'FOREX',
      minDistance: 12,
      maxRiskPips: 110,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'AUDUSD': {
      symbol: 'AUDUSD',
      description: 'Australian Dollar vs US Dollar',
      type: 'FOREX',
      minDistance: 15,
      maxRiskPips: 120,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'USDCAD': {
      symbol: 'USDCAD',
      description: 'US Dollar vs Canadian Dollar',
      type: 'FOREX',
      minDistance: 15,
      maxRiskPips: 120,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'NZDUSD': {
      symbol: 'NZDUSD',
      description: 'New Zealand Dollar vs US Dollar',
      type: 'FOREX',
      minDistance: 20,
      maxRiskPips: 130,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    
    // Cross Currency Pairs
    'EURCAD': {
      symbol: 'EURCAD',
      description: 'Euro vs Canadian Dollar',
      type: 'FOREX',
      minDistance: 20,
      maxRiskPips: 150,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'EURGBP': {
      symbol: 'EURGBP',
      description: 'Euro vs British Pound',
      type: 'FOREX',
      minDistance: 15,
      maxRiskPips: 120,
      pipValue: 1.0,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'EURJPY': {
      symbol: 'EURJPY',
      description: 'Euro vs Japanese Yen',
      type: 'FOREX',
      minDistance: 15,
      maxRiskPips: 120,
      pipValue: 0.01,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'GBPJPY': {
      symbol: 'GBPJPY',
      description: 'British Pound vs Japanese Yen',
      type: 'FOREX',
      minDistance: 20,
      maxRiskPips: 150,
      pipValue: 0.01,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    
    // Precious Metals
    'XAUUSD': {
      symbol: 'XAUUSD',
      description: 'Gold vs US Dollar',
      type: 'METALS',
      minDistance: 50,
      maxRiskPips: 500,
      pipValue: 0.01,
      contractSize: 100,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'XAGUSD': {
      symbol: 'XAGUSD',
      description: 'Silver vs US Dollar',
      type: 'METALS',
      minDistance: 30,
      maxRiskPips: 300,
      pipValue: 0.001,
      contractSize: 5000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    
    // Major Indices
    'US30': {
      symbol: 'US30',
      description: 'US Wall Street 30',
      type: 'INDICES',
      minDistance: 20,
      maxRiskPips: 200,
      pipValue: 1.0,
      contractSize: 1,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'NAS100': {
      symbol: 'NAS100',
      description: 'US Tech 100',
      type: 'INDICES',
      minDistance: 50,
      maxRiskPips: 500,
      pipValue: 0.01,
      contractSize: 1,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'SPX500': {
      symbol: 'SPX500',
      description: 'US 500',
      type: 'INDICES',
      minDistance: 10,
      maxRiskPips: 100,
      pipValue: 0.01,
      contractSize: 1,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    'GER30': {
      symbol: 'GER30',
      description: 'Germany 30',
      type: 'INDICES',
      minDistance: 30,
      maxRiskPips: 300,
      pipValue: 0.01,
      contractSize: 1,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      isActive: true
    },
    
    // Cryptocurrencies
    'BTCUSD': {
      symbol: 'BTCUSD',
      description: 'Bitcoin vs US Dollar',
      type: 'CRYPTO',
      minDistance: 100,
      maxRiskPips: 1000,
      pipValue: 0.01,
      contractSize: 1,
      minLot: 0.01,
      maxLot: 10,
      lotStep: 0.01,
      isActive: true
    },
    'ETHUSD': {
      symbol: 'ETHUSD',
      description: 'Ethereum vs US Dollar',
      type: 'CRYPTO',
      minDistance: 50,
      maxRiskPips: 500,
      pipValue: 0.01,
      contractSize: 1,
      minLot: 0.01,
      maxLot: 10,
      lotStep: 0.01,
      isActive: true
    }
  };

  /**
   * Get fallback symbol info for a given symbol
   */
  static getFallbackSymbolInfo(symbol: string, brokerName = 'FALLBACK'): SymbolInfo | null {
    const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const spec = this.fallbackSymbols[cleanSymbol];
    
    if (!spec) {
      return null;
    }

    logger.info(`🔄 Using fallback symbol spec for ${cleanSymbol}`);
    
    return {
      symbol: spec.symbol,
      description: spec.description,
      type: spec.type,
      minDistance: spec.minDistance,
      maxRiskPips: spec.maxRiskPips,
      pipValue: spec.pipValue,
      contractSize: spec.contractSize,
      minLot: spec.minLot,
      maxLot: spec.maxLot,
      lotStep: spec.lotStep,
      priceRange: { min: 0, max: 999999 }, // Default range
      isActive: spec.isActive,
      brokerName
    };
  }

  /**
   * Check if a symbol has fallback support
   */
  static hasFallbackSupport(symbol: string): boolean {
    const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return this.fallbackSymbols.hasOwnProperty(cleanSymbol);
  }

  /**
   * Get all supported fallback symbols
   */
  static getAllFallbackSymbols(): string[] {
    return Object.keys(this.fallbackSymbols);
  }

  /**
   * Initialize fallback symbols in the universal symbol support cache
   * This provides immediate symbol availability even when MetaAPI sync fails
   */
  static initializeFallbackSymbols(): void {
    logger.info('🔄 Initializing fallback symbol system...');
    
    const fallbackBrokerData: Record<string, SymbolInfo> = {};
    
    Object.keys(this.fallbackSymbols).forEach(symbol => {
      const symbolInfo = this.getFallbackSymbolInfo(symbol, 'FALLBACK_BROKER');
      if (symbolInfo) {
        fallbackBrokerData[symbol] = symbolInfo;
      }
    });
    
    // Add to universal symbol support cache
    UniversalSymbolSupport.addFallbackBroker('FALLBACK_BROKER', fallbackBrokerData);
    
    logger.info(`✅ Fallback system initialized with ${Object.keys(fallbackBrokerData).length} symbols`);
  }

  /**
   * Generate a fallback symbol report
   */
  static generateFallbackReport(): string {
    const symbolsByType: Record<string, string[]> = {};
    
    Object.values(this.fallbackSymbols).forEach(spec => {
      if (!symbolsByType[spec.type]) {
        symbolsByType[spec.type] = [];
      }
      symbolsByType[spec.type].push(spec.symbol);
    });
    
    let report = '\n🛡️ FALLBACK SYMBOL SYSTEM REPORT\n';
    report += '══════════════════════════════\n';
    report += `📊 Total Fallback Symbols: ${Object.keys(this.fallbackSymbols).length}\n\n`;
    
    Object.entries(symbolsByType).forEach(([type, symbols]) => {
      report += `📈 ${type}: ${symbols.join(', ')}\n`;
    });
    
    report += `\n⏰ System Status: Active\n`;
    report += `🎯 Purpose: Immediate symbol support when MetaAPI sync fails\n`;
    
    return report;
  }
}
