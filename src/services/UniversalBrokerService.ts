/**
 * Universal Broker Service
 * Replaces hardcoded InstantFunding logic with dynamic broker detection and symbol resolution
 * Part of Phase 2: Universal Broker Support
 */

import { logger } from '../utils/logger';
import MetaApi, { MetatraderAccount } from 'metaapi.cloud-sdk';
import { SymbolParser, ValidationService, FormatService } from '../shared';

export interface BrokerInfo {
  name: string;
  server: string;
  type: 'demo' | 'live';
  currency: string;
  leverage: number;
  symbolFormat: 'standard' | 'suffix' | 'prefix' | 'custom';
  suffixPattern?: string; // e.g., '.x', '.m', etc.
  prefixPattern?: string;
}

export interface Symbol {
  name: string;
  displayName: string;
  category: 'forex' | 'metals' | 'indices' | 'crypto' | 'commodities' | 'stocks';
  minLot: number;
  maxLot: number;
  lotStep: number;
  pipValue: number;
  spread: number;
  isActive: boolean;
}

export interface SymbolResolution {
  originalSymbol: string;
  resolvedSymbol: string;
  brokerFormat: string;
  confidence: number; // 0-1, how confident we are in the resolution
  alternativeSymbols?: string[];
}

export class UniversalBrokerService {
  private static instance: UniversalBrokerService;
  private brokerCache = new Map<string, BrokerInfo>();
  private symbolCache = new Map<string, Symbol[]>();
  private metaApi: MetaApi;

  constructor(metaApiToken: string) {
    this.metaApi = new MetaApi(metaApiToken);
    logger.info('🌐 Universal Broker Service initialized - supports ALL MetaAPI brokers');
  }

  static getInstance(metaApiToken: string): UniversalBrokerService {
    if (!UniversalBrokerService.instance) {
      UniversalBrokerService.instance = new UniversalBrokerService(metaApiToken);
    }
    return UniversalBrokerService.instance;
  }

  /**
   * Auto-detect broker information from MetaAPI account
   */
  async detectBroker(accountId: string): Promise<BrokerInfo> {
    try {
      // Check cache first
      if (this.brokerCache.has(accountId)) {
        return this.brokerCache.get(accountId)!;
      }

      const account = await this.metaApi.metatraderAccountApi.getAccount(accountId);
      const serverName = account.name || account.server || 'Unknown Server';

      // Detect broker based on server name patterns
      const brokerInfo: BrokerInfo = {
        name: this.detectBrokerName(serverName),
        server: serverName,
        type: account.type as 'demo' | 'live',
        currency: 'USD', // Default, will be updated when connection is available
        leverage: 100, // Default, will be updated when connection is available
        symbolFormat: this.detectSymbolFormat(serverName),
      };

      // Set suffix pattern based on broker
      if (brokerInfo.symbolFormat === 'suffix') {
        brokerInfo.suffixPattern = this.detectSuffixPattern(serverName);
      }

      // Cache the result
      this.brokerCache.set(accountId, brokerInfo);
      
      logger.info(`🏦 Broker detected: ${brokerInfo.name} (${brokerInfo.server})`);
      logger.info(`📊 Symbol format: ${brokerInfo.symbolFormat}${brokerInfo.suffixPattern ? ` (${brokerInfo.suffixPattern})` : ''}`);
      
      return brokerInfo;
    } catch (error: any) {
      logger.error(`❌ Failed to detect broker for account ${accountId}:`, error);
      throw new Error(`Could not detect broker information: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Get all available symbols for an account
   */
  async getAvailableSymbols(accountId: string): Promise<Symbol[]> {
    try {
      // Check cache first
      if (this.symbolCache.has(accountId)) {
        return this.symbolCache.get(accountId)!;
      }

      // For now, return a basic set of common symbols
      // This will be enhanced when MetaAPI connection is fully working
      const commonSymbols: Symbol[] = [
        // Forex
        { name: 'EURUSD', displayName: 'Euro vs US Dollar', category: 'forex', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 0.8, isActive: true },
        { name: 'GBPUSD', displayName: 'British Pound vs US Dollar', category: 'forex', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 1.2, isActive: true },
        { name: 'USDJPY', displayName: 'US Dollar vs Japanese Yen', category: 'forex', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 0.9, isActive: true },
        { name: 'USDCAD', displayName: 'US Dollar vs Canadian Dollar', category: 'forex', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 1.5, isActive: true },
        { name: 'AUDUSD', displayName: 'Australian Dollar vs US Dollar', category: 'forex', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 1.3, isActive: true },
        
        // Metals
        { name: 'XAUUSD', displayName: 'Gold vs US Dollar', category: 'metals', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 35, isActive: true },
        { name: 'XAGUSD', displayName: 'Silver vs US Dollar', category: 'metals', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 3, isActive: true },
        
        // Indices
        { name: 'US30', displayName: 'US Wall Street 30', category: 'indices', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 3, isActive: true },
        { name: 'NAS100', displayName: 'US Tech 100', category: 'indices', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 2, isActive: true },
        { name: 'SPX500', displayName: 'US 500', category: 'indices', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 0.7, isActive: true },
        { name: 'GER30', displayName: 'Germany 30', category: 'indices', minLot: 0.01, maxLot: 100, lotStep: 0.01, pipValue: 1, spread: 2, isActive: true },
      ];

      // Apply broker-specific symbol transformations
      const brokerInfo = await this.detectBroker(accountId);
      const transformedSymbols = this.transformSymbolsForBroker(commonSymbols, brokerInfo);

      // Cache the result
      this.symbolCache.set(accountId, transformedSymbols);
      
      logger.info(`📈 Retrieved ${transformedSymbols.length} symbols for account ${accountId}`);
      return transformedSymbols;
    } catch (error: any) {
      logger.error(`❌ Failed to get symbols for account ${accountId}:`, error);
      throw new Error(`Could not retrieve symbols: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Resolve a raw symbol to the broker's specific format
   */
  async resolveSymbol(rawSymbol: string, accountId: string): Promise<SymbolResolution> {
    try {
      const brokerInfo = await this.detectBroker(accountId);
      const availableSymbols = await this.getAvailableSymbols(accountId);

      // Normalize input symbol
      const normalizedSymbol = SymbolParser.normalizeSymbol(rawSymbol);

      // Try exact match first
      let exactMatch = availableSymbols.find(s => s.name.toLowerCase() === normalizedSymbol.toLowerCase());
      if (exactMatch) {
        return {
          originalSymbol: rawSymbol,
          resolvedSymbol: exactMatch.name,
          brokerFormat: exactMatch.name,
          confidence: 1.0
        };
      }

      // Try fuzzy matching
      const fuzzyMatches = this.findFuzzyMatches(normalizedSymbol, availableSymbols, brokerInfo);
      if (fuzzyMatches.length > 0) {
        const bestMatch = fuzzyMatches[0];
        return {
          originalSymbol: rawSymbol,
          resolvedSymbol: bestMatch.symbol.name,
          brokerFormat: bestMatch.symbol.name,
          confidence: bestMatch.confidence,
          alternativeSymbols: fuzzyMatches.slice(1).map(m => m.symbol.name)
        };
      }

      // No matches found
      logger.warn(`⚠️ Could not resolve symbol "${rawSymbol}" for broker ${brokerInfo.name}`);
      return {
        originalSymbol: rawSymbol,
        resolvedSymbol: rawSymbol,
        brokerFormat: rawSymbol,
        confidence: 0
      };
    } catch (error) {
      logger.error(`❌ Symbol resolution failed for "${rawSymbol}":`, error);
      throw error;
    }
  }

  /**
   * Detect broker name from server string
   */
  private detectBrokerName(serverName: string): string {
    const server = serverName.toLowerCase();
    
    if (server.includes('instantfunding') || server.includes('ifpro')) {
      return 'InstantFunding';
    }
    if (server.includes('ic') || server.includes('icmarkets')) {
      return 'IC Markets';
    }
    if (server.includes('ftmo')) {
      return 'FTMO';
    }
    if (server.includes('oanda')) {
      return 'OANDA';
    }
    if (server.includes('xm') || server.includes('xmtrading')) {
      return 'XM Trading';
    }
    if (server.includes('pepperstone')) {
      return 'Pepperstone';
    }
    if (server.includes('exness')) {
      return 'Exness';
    }
    
    // Extract from server name pattern
    const matches = serverName.match(/([A-Za-z]+)/);
    return matches ? matches[1] : 'Unknown Broker';
  }

  /**
   * Detect symbol format pattern
   */
  private detectSymbolFormat(serverName: string): 'standard' | 'suffix' | 'prefix' | 'custom' {
    const server = serverName.toLowerCase();
    
    // InstantFunding uses .x suffix for indices/metals
    if (server.includes('instantfunding') || server.includes('ifpro')) {
      return 'suffix';
    }
    
    // Most brokers use standard format
    return 'standard';
  }

  /**
   * Detect suffix pattern for brokers that use suffixes
   */
  private detectSuffixPattern(serverName: string): string {
    const server = serverName.toLowerCase();
    
    if (server.includes('instantfunding') || server.includes('ifpro')) {
      return '.x';
    }
    
    return '';
  }

  /**
   * Categorize symbol by type
   */
  private categorizeSymbol(symbol: string): Symbol['category'] {
    const sym = symbol.toUpperCase();
    
    // Forex pairs (6 characters, no dots)
    if (sym.match(/^[A-Z]{6}$/)) {
      return 'forex';
    }
    
    // Gold/Silver
    if (sym.includes('XAU') || sym.includes('GOLD')) return 'metals';
    if (sym.includes('XAG') || sym.includes('SILVER')) return 'metals';
    
    // Indices
    if (sym.includes('US30') || sym.includes('DOW')) return 'indices';
    if (sym.includes('NAS') || sym.includes('US100')) return 'indices';
    if (sym.includes('SPX') || sym.includes('US500')) return 'indices';
    if (sym.includes('GER30') || sym.includes('DAX')) return 'indices';
    if (sym.includes('UK100') || sym.includes('FTSE')) return 'indices';
    
    // Crypto
    if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('CRYPTO')) {
      return 'crypto';
    }
    
    // Default to commodities
    return 'commodities';
  }

  /**
   * Find fuzzy matches for symbols
   */
  private findFuzzyMatches(
    targetSymbol: string, 
    availableSymbols: Symbol[], 
    brokerInfo: BrokerInfo
  ): Array<{ symbol: Symbol; confidence: number }> {
    const matches: Array<{ symbol: Symbol; confidence: number }> = [];
    
    // Common symbol aliases
    const aliases: Record<string, string[]> = {
      'GOLD': ['XAUUSD', 'GOLD'],
      'SILVER': ['XAGUSD', 'SILVER'],
      'NASDAQ': ['NAS100', 'US100', 'NASDAQ'],
      'DOW': ['US30', 'DOW', 'DJIA'],
      'SP500': ['SPX500', 'US500', 'SP500'],
      'DAX': ['GER30', 'DAX', 'GERMANY30'],
      'FTSE': ['UK100', 'FTSE100', 'FTSE']
    };

    for (const symbol of availableSymbols) {
      let confidence = 0;
      const symbolName = SymbolParser.normalizeSymbol(symbol.name);
      
      // Exact match
      if (symbolName === targetSymbol) {
        confidence = 1.0;
      }
      // Check aliases
      else {
        for (const [key, aliasList] of Object.entries(aliases)) {
          if (aliasList.includes(targetSymbol) && aliasList.some(alias => 
            symbolName.includes(SymbolParser.normalizeSymbol(alias))
          )) {
            confidence = 0.9;
            break;
          }
        }
      }
      
      // Partial match
      if (confidence === 0 && symbolName.includes(targetSymbol)) {
        confidence = 0.7;
      }
      
      // Add suffix/prefix variations
      if (confidence === 0 && brokerInfo.symbolFormat === 'suffix' && brokerInfo.suffixPattern) {
        const withSuffix = targetSymbol + brokerInfo.suffixPattern.replace('.', '');
        if (symbolName === withSuffix) {
          confidence = 0.8;
        }
      }
      
      if (confidence > 0) {
        matches.push({ symbol, confidence });
      }
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Transform symbols based on broker-specific format requirements
   */
  private transformSymbolsForBroker(symbols: Symbol[], brokerInfo: BrokerInfo): Symbol[] {
    if (brokerInfo.symbolFormat === 'suffix' && brokerInfo.suffixPattern) {
      return symbols.map(symbol => {
        // Apply suffix to indices and metals for InstantFunding-style brokers
        if (symbol.category === 'indices' || symbol.category === 'metals') {
          return {
            ...symbol,
            name: symbol.name + brokerInfo.suffixPattern
          };
        }
        return symbol;
      });
    }
    
    return symbols;
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCache(): void {
    this.brokerCache.clear();
    this.symbolCache.clear();
    logger.info('🧹 Universal Broker Service cache cleared');
  }
}

export const createUniversalBrokerService = (metaApiToken: string) => 
  UniversalBrokerService.getInstance(metaApiToken);