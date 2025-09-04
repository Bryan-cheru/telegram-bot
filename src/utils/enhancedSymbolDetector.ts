// Enhanced Symbol Detection with Universal Support
// File: src/utils/enhancedSymbolDetector.ts

import { logger } from './logger';
import { UniversalSymbolSupport, SymbolInfo } from './universalSymbolSupport';
import { FallbackSymbolSystem } from './fallbackSymbolSystem';

export interface DetectionResult {
  symbol: string;
  confidence: number;
  source: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'ALIAS_MATCH' | 'PATTERN_MATCH' | 'OCR_CORRECTION' | 'FALLBACK';
  brokerName?: string;
  symbolInfo?: SymbolInfo;
}

export class EnhancedSymbolDetector {
  private static aliasMap: Record<string, string> = {
    // Common aliases
    'GOLD': 'XAUUSD',
    'SILVER': 'XAGUSD',
    'BITCOIN': 'BTCUSD',
    'ETHEREUM': 'ETHUSD',
    'NASDAQ': 'NAS100',
    'DOW': 'US30',
    'DAX': 'GER30',
    'FTSE': 'UK100',
    'CAC': 'FRA40',
    'NIKKEI': 'JPN225',
    
    // US30 broker variations (CRITICAL FIX)
    'US30CASH': 'US30',
    'DJ30': 'US30',
    'DJI30': 'US30',
    'DOW30': 'US30',
    'USA30': 'US30',
    'US30M': 'US30',
    'WALL30': 'US30',
    'USDJP30': 'US30',
    
    // OCR common errors
    'XAUUST': 'XAUUSD',
    'XAUUSP': 'XAUUSD',
    'EURUSO': 'EURUSD',
    'GBPUSO': 'GBPUSD',
    'USOJPY': 'USDJPY',
    'GOLDUSD': 'XAUUSD',
    'SILVERUSD': 'XAGUSD'
  };

  /**
   * Detect symbol from any input (text, OCR, etc.) with universal support + fallback
   */
  static async detectSymbol(input: string, brokerName?: string): Promise<DetectionResult | null> {
    if (!input || input.length < 3) {
      return null;
    }

    const cleanInput = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    logger.info(`🔍 Detecting symbol from input: "${input}" (cleaned: "${cleanInput}")`);

    // 1. Direct exact match from MetaAPI
    const exactMatch = await this.findExactMatch(cleanInput, brokerName);
    if (exactMatch) return exactMatch;

    // 2. Alias mapping  
    const aliasMatch = await this.findAliasMatch(cleanInput, brokerName);
    if (aliasMatch) return aliasMatch;

    // 3. Pattern-based detection
    const patternMatch = await this.findPatternMatch(input, brokerName);
    if (patternMatch) return patternMatch;

    // 4. Fuzzy matching for typos
    const fuzzyMatch = await this.findFuzzyMatch(cleanInput, brokerName);
    if (fuzzyMatch) return fuzzyMatch;

    // 5. OCR error correction
    const ocrMatch = await this.findOCRCorrection(cleanInput, brokerName);
    if (ocrMatch) return ocrMatch;

    // 6. **NEW**: Fallback symbol system
    const fallbackMatch = await this.findFallbackMatch(cleanInput);
    if (fallbackMatch) return fallbackMatch;

    logger.warn(`❌ No symbol detected from input: "${input}"`);
    return null;
  }

  /**
   * **NEW**: Find fallback symbol match when MetaAPI discovery fails
   */
  private static async findFallbackMatch(cleanInput: string): Promise<DetectionResult | null> {
    if (FallbackSymbolSystem.hasFallbackSupport(cleanInput)) {
      const symbolInfo = FallbackSymbolSystem.getFallbackSymbolInfo(cleanInput);
      if (symbolInfo) {
        logger.info(`🛡️ Found fallback match: ${cleanInput} → ${symbolInfo.symbol}`);
        return {
          symbol: symbolInfo.symbol,
          confidence: 90, // High confidence for exact fallback matches
          source: 'FALLBACK',
          brokerName: 'FALLBACK_BROKER',
          symbolInfo
        };
      }
    }
    
    // Try alias fallback
    const alias = this.aliasMap[cleanInput];
    if (alias && FallbackSymbolSystem.hasFallbackSupport(alias)) {
      const symbolInfo = FallbackSymbolSystem.getFallbackSymbolInfo(alias);
      if (symbolInfo) {
        logger.info(`🛡️ Found fallback alias match: ${cleanInput} → ${alias}`);
        return {
          symbol: alias,
          confidence: 85, // Slightly lower confidence for alias fallback
          source: 'FALLBACK',
          brokerName: 'FALLBACK_BROKER',
          symbolInfo
        };
      }
    }
    
    return null;
  }

  /**
   * Find exact symbol match from MetaAPI first, fallback if needed
   */
  /**
   * Find exact symbol match from MetaAPI first, fallback if needed
   */
  private static async findExactMatch(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const supportedSymbols = UniversalSymbolSupport.getAllSupportedSymbols();
    
    // **CRITICAL**: If MetaAPI symbols not available, skip to fallback
    if (supportedSymbols.length === 0) {
      logger.warn('⚠️ No MetaAPI symbols available, will try fallback system');
      return null; // Let fallback system handle it
    }
    
    if (supportedSymbols.includes(cleanInput)) {
      const symbolInfo = UniversalSymbolSupport.getSymbolInfo(cleanInput, brokerName);
      logger.info(`✅ Exact match found: ${cleanInput}`);
      
      return {
        symbol: cleanInput,
        confidence: 100,
        source: 'EXACT_MATCH',
        brokerName: symbolInfo?.brokerName,
        symbolInfo: symbolInfo || undefined
      };
    }
    
    return null;
  }

  /**
   * Find alias match
   */
  private static async findAliasMatch(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const alias = this.aliasMap[cleanInput];
    if (alias) {
      const supportedSymbols = UniversalSymbolSupport.getAllSupportedSymbols();
      
      if (supportedSymbols.includes(alias)) {
        const symbolInfo = UniversalSymbolSupport.getSymbolInfo(alias, brokerName);
        logger.info(`🔄 Alias match: ${cleanInput} → ${alias}`);
        
        return {
          symbol: alias,
          confidence: 95,
          source: 'ALIAS_MATCH',
          brokerName: symbolInfo?.brokerName,
          symbolInfo: symbolInfo || undefined
        };
      }
    }
    
    return null;
  }

  /**
   * Find pattern-based matches
   */
  private static async findPatternMatch(input: string, brokerName?: string): Promise<DetectionResult | null> {
    const patterns = [
      // Major forex pairs
      /([A-Z]{3}USD|USD[A-Z]{3}|[A-Z]{6})/g,
      // Metals
      /(XAU|XAG|GOLD|SILVER)/gi,
      // Indices
      /(US30|NAS|SPX|DAX|FTSE|CAC)/gi,
      // Crypto
      /(BTC|ETH|BITCOIN|ETHEREUM)/gi
    ];
    
    for (const pattern of patterns) {
      const matches = input.match(pattern);
      if (matches && matches.length > 0) {
        const symbol = matches[0].toUpperCase();
        const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '');
        
        // Try exact match first
        const exactMatch = await this.findExactMatch(cleanSymbol, brokerName);
        if (exactMatch) {
          return { ...exactMatch, source: 'PATTERN_MATCH', confidence: 80 };
        }
        
        // Try fallback
        const fallbackMatch = await this.findFallbackMatch(cleanSymbol);
        if (fallbackMatch) {
          return { ...fallbackMatch, source: 'PATTERN_MATCH', confidence: 75 };
        }
      }
    }
    
    return null;
  }

  /**
   * Find fuzzy matches for typos
   */
  private static async findFuzzyMatch(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const supportedSymbols = UniversalSymbolSupport.getAllSupportedSymbols();
    
    // Skip fuzzy matching if no symbols available
    if (supportedSymbols.length === 0) {
      return null;
    }
    
    for (const symbol of supportedSymbols) {
      if (this.calculateSimilarity(cleanInput, symbol) > 0.8) {
        const symbolInfo = UniversalSymbolSupport.getSymbolInfo(symbol, brokerName);
        logger.info(`🔍 Fuzzy match: ${cleanInput} → ${symbol}`);
        
        return {
          symbol,
          confidence: 70,
          source: 'FUZZY_MATCH',
          brokerName: symbolInfo?.brokerName,
          symbolInfo: symbolInfo || undefined
        };
      }
    }
    
    return null;
  }

  /**
   * OCR error correction
   */
  private static async findOCRCorrection(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const ocrCorrections: Record<string, string> = {
      'XAUUST': 'XAUUSD',
      'XAUUSP': 'XAUUSD',
      'EURUSO': 'EURUSD',
      'GBPUSO': 'GBPUSD',
      'USOJPY': 'USDJPY'
    };
    
    const correction = ocrCorrections[cleanInput];
    if (correction) {
      // Try MetaAPI first
      const exactMatch = await this.findExactMatch(correction, brokerName);
      if (exactMatch) {
        return { ...exactMatch, source: 'OCR_CORRECTION', confidence: 85 };
      }
      
      // Try fallback
      const fallbackMatch = await this.findFallbackMatch(correction);
      if (fallbackMatch) {
        return { ...fallbackMatch, source: 'OCR_CORRECTION', confidence: 80 };
      }
    }
    
    return null;
  }

  /**
   * Calculate similarity between two strings
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.calculateEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate edit distance between strings
   */
  private static calculateEditDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Enhanced symbol detection for visual/OCR analysis
   */
  static async detectFromChartImage(ocrText: string, brokerName?: string): Promise<DetectionResult | null> {
    logger.info(`🖼️ Detecting symbol from chart OCR: "${ocrText.substring(0, 100)}..."`);
    
    // Try multiple detection strategies for OCR text
    const strategies = [
      // Look for common chart title formats
      /([A-Z]{3})\s*\/\s*([A-Z]{3})/g,  // "EUR / USD"
      /([A-Z]+)\s+Spot\s*\/\s*U\.?S\.?\s*Dollar/gi, // "Gold Spot / U.S. Dollar"
      /#([A-Z0-9]{5,8})/g, // "#XAUUSD"
      /\b([A-Z]{6})\b/g,   // Direct 6-letter symbols
      /\b(XAU[A-Z]{3}|XAG[A-Z]{3})\b/gi, // Metal symbols
      /\b(US30|NAS100|SPX500|DAX30)\b/gi // Index symbols
    ];

    for (const strategy of strategies) {
      const matches = ocrText.match(strategy);
      if (matches) {
        for (const match of matches) {
          const result = await this.detectSymbol(match, brokerName);
          if (result && result.confidence > 70) {
            logger.info(`✅ Chart symbol detected: ${result.symbol} (${result.confidence}% confidence)`);
            return result;
          }
        }
      }
    }

    return null;
  }

  /**
   * Fallback symbol detection for common forex pairs
   */
  private static findFallbackSymbol(cleanInput: string): DetectionResult | null {
    const commonSymbols = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURJPY', 'GBPJPY', 'EURGBP', 'EURCAD', 'EURAUD', 'EURCHF', 
      'GBPCAD', 'GBPAUD', 'GBPCHF', 'CADCHF', 'CADJPY', 'CHFJPY',
      'AUDCAD', 'AUDCHF', 'AUDJPY', 'NZDCAD', 'NZDCHF', 'NZDJPY',
      'XAUUSD', 'XAGUSD'
    ];

    if (commonSymbols.includes(cleanInput)) {
      logger.info(`✅ Fallback symbol detected: ${cleanInput} (85% confidence)`);
      
      const symbolType: 'FOREX' | 'METALS' = cleanInput.includes('XAU') || cleanInput.includes('XAG') ? 'METALS' : 'FOREX';
      
      return {
        symbol: cleanInput,
        confidence: 85,
        source: 'FALLBACK' as any,
        brokerName: 'FALLBACK',
        symbolInfo: {
          symbol: cleanInput,
          description: `${cleanInput} (Fallback Support)`,
          type: symbolType,
          minDistance: symbolType === 'METALS' ? 100 : 10,
          maxRiskPips: symbolType === 'METALS' ? 500 : 200,
          pipValue: symbolType === 'METALS' ? 0.01 : (cleanInput.includes('JPY') ? 0.01 : 0.0001),
          contractSize: symbolType === 'METALS' ? 100 : 100000,
          minLot: 0.01,
          maxLot: 100,
          lotStep: 0.01,
          priceRange: {
            min: symbolType === 'METALS' ? 1000 : 0.5,
            max: symbolType === 'METALS' ? 3000 : 2.0
          },
          isActive: true,
          brokerName: 'FALLBACK'
        }
      };
    }

    return null;
  }
}
