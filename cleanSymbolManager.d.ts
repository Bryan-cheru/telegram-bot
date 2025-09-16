/**
 * Type definitions for CleanSymbolManager
 */

export interface MarketData {
  bid: number;
  ask: number;
  time: Date;
}

export declare class CleanSymbolManager {
  static getValidSymbol(
    inputSymbol: string, 
    connection: any, 
    brokerName: string
  ): Promise<string>;
  
  static isSymbolTradeable(specification: any): boolean;
  
  static generateVariations(symbol: string): string[];
  
  static ensureMarketData(
    symbol: string, 
    connection: any, 
    timeoutMs?: number
  ): Promise<MarketData>;
}
