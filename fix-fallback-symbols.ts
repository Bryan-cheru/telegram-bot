// Quick fix to add fallback symbols to enhanced symbol detector
// This will ensure EURCAD, EURUSD, etc. are always available

import { EnhancedSymbolDetector, DetectionResult } from './src/utils/enhancedSymbolDetector';

// Add this to the enhancedSymbolDetector to bypass universal symbol support when it fails
export class FallbackSymbolDetector {
  private static fallbackSymbols = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'EURCAD', 'EURAUD', 'EURCHF', 
    'GBPCAD', 'GBPAUD', 'GBPCHF', 'CADCHF', 'CADJPY', 'CHFJPY',
    'AUDCAD', 'AUDCHF', 'AUDJPY', 'NZDCAD', 'NZDCHF', 'NZDJPY',
    'XAUUSD', 'XAGUSD'
  ];

  static isCommonSymbol(symbol: string): boolean {
    return this.fallbackSymbols.includes(symbol.toUpperCase());
  }

  static createFallbackDetection(symbol: string): DetectionResult {
    return {
      symbol: symbol.toUpperCase(),
      confidence: 90,
      source: 'FALLBACK' as any,
      symbolInfo: {
        symbol: symbol.toUpperCase(),
        description: `${symbol} (Fallback)`,
        type: symbol.includes('XAU') || symbol.includes('XAG') ? 'METALS' as any : 'FOREX' as any,
        minDistance: 10,
        maxRiskPips: 200,
        pipValue: symbol.includes('JPY') ? 0.01 : 0.0001,
        contractSize: 100000,
        minLot: 0.01,
        maxLot: 100,
        lotStep: 0.01,
        priceRange: { min: 0.5, max: 2.0 },
        isActive: true,
        brokerName: 'FALLBACK'
      }
    };
  }
}
