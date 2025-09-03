// Enhanced Symbol Detection with Universal Support
// File: src/utils/enhancedSymbolDetector.ts

import { logger } from './logger';
import { UniversalSymbolSupport, SymbolInfo } from './universalSymbolSupport';

export interface DetectionResult {
  symbol: string;
  confidence: number;
  source: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'ALIAS_MATCH' | 'PATTERN_MATCH' | 'OCR_CORRECTION';
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
   * Detect symbol from any input (text, OCR, etc.) with universal support
   */
  static async detectSymbol(input: string, brokerName?: string): Promise<DetectionResult | null> {
    if (!input || input.length < 3) {
      return null;
    }

    const cleanInput = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    logger.info(`🔍 Detecting symbol from input: "${input}" (cleaned: "${cleanInput}")`);

    // 1. Direct exact match
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

    logger.warn(`❌ No symbol detected from input: "${input}"`);
    return null;
  }

  /**
   * Find exact symbol match
   */
  private static async findExactMatch(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const supportedSymbols = UniversalSymbolSupport.getAllSupportedSymbols();
    
    if (supportedSymbols.includes(cleanInput)) {
      const symbolInfo = UniversalSymbolSupport.getSymbolInfo(cleanInput, brokerName);
      
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
   * Find symbol through alias mapping
   */
  private static async findAliasMatch(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const mappedSymbol = this.aliasMap[cleanInput];
    
    if (mappedSymbol && UniversalSymbolSupport.isSymbolSupported(mappedSymbol)) {
      const symbolInfo = UniversalSymbolSupport.getSymbolInfo(mappedSymbol, brokerName);
      
      return {
        symbol: mappedSymbol,
        confidence: 95,
        source: 'ALIAS_MATCH',
        brokerName: symbolInfo?.brokerName,
        symbolInfo: symbolInfo || undefined
      };
    }
    
    return null;
  }

  /**
   * Find symbol using pattern matching
   */
  private static async findPatternMatch(input: string, brokerName?: string): Promise<DetectionResult | null> {
    const patterns = [
      // Chart titles
      /Gold\s+Spot\s*\/\s*U\.?S\.?\s*Dollar/gi,
      /Silver\s+Spot\s*\/\s*U\.?S\.?\s*Dollar/gi,
      /EUR\s*\/\s*USD/gi,
      /GBP\s*\/\s*USD/gi,
      /USD\s*\/\s*JPY/gi,
      
      // Hashtag patterns
      /#([A-Z0-9]{5,8})/gi,
      
      // 6-letter forex pairs
      /\b([A-Z]{6})\b/g,
      
      // Metal patterns
      /\b(XAU[A-Z]{3}|XAG[A-Z]{3})\b/gi,
      
      // Index patterns
      /\b(US30|NAS100|SPX?500|DAX30|FTSE100)\b/gi
    ];

    for (const pattern of patterns) {
      const matches = input.match(pattern);
      if (matches) {
        for (const match of matches) {
          const cleanMatch = match.replace(/[^A-Z0-9]/g, '').toUpperCase();
          
          // Check if it's a known symbol
          if (UniversalSymbolSupport.isSymbolSupported(cleanMatch)) {
            const symbolInfo = UniversalSymbolSupport.getSymbolInfo(cleanMatch, brokerName);
            
            return {
              symbol: cleanMatch,
              confidence: 85,
              source: 'PATTERN_MATCH',
              brokerName: symbolInfo?.brokerName,
              symbolInfo: symbolInfo || undefined
            };
          }
          
          // Check aliases
          const aliasResult = await this.findAliasMatch(cleanMatch, brokerName);
          if (aliasResult) {
            return { ...aliasResult, confidence: 80 };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Find symbol using fuzzy matching for typos
   */
  private static async findFuzzyMatch(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    const supportedSymbols = UniversalSymbolSupport.getAllSupportedSymbols();
    
    for (const symbol of supportedSymbols) {
      const similarity = this.calculateSimilarity(cleanInput, symbol);
      
      // If very similar (1-2 character difference)
      if (similarity > 0.8 && Math.abs(cleanInput.length - symbol.length) <= 2) {
        const symbolInfo = UniversalSymbolSupport.getSymbolInfo(symbol, brokerName);
        
        return {
          symbol,
          confidence: Math.floor(similarity * 100),
          source: 'FUZZY_MATCH',
          brokerName: symbolInfo?.brokerName,
          symbolInfo: symbolInfo || undefined
        };
      }
    }
    
    return null;
  }

  /**
   * Find symbol using OCR error correction
   */
  private static async findOCRCorrection(cleanInput: string, brokerName?: string): Promise<DetectionResult | null> {
    // Check direct OCR corrections
    if (this.aliasMap[cleanInput]) {
      const correctedSymbol = this.aliasMap[cleanInput];
      if (UniversalSymbolSupport.isSymbolSupported(correctedSymbol)) {
        const symbolInfo = UniversalSymbolSupport.getSymbolInfo(correctedSymbol, brokerName);
        
        return {
          symbol: correctedSymbol,
          confidence: 75,
          source: 'OCR_CORRECTION',
          brokerName: symbolInfo?.brokerName,
          symbolInfo: symbolInfo || undefined
        };
      }
    }
    
    // Common OCR character substitutions
    const ocrSubstitutions: Record<string, string> = {
      '0': 'O', '1': 'I', '5': 'S', '8': 'B',
      'O': '0', 'I': '1', 'S': '5', 'B': '8'
    };
    
    // Try different character substitutions
    for (let i = 0; i < cleanInput.length; i++) {
      const char = cleanInput[i];
      if (ocrSubstitutions[char]) {
        const corrected = cleanInput.substring(0, i) + ocrSubstitutions[char] + cleanInput.substring(i + 1);
        
        if (UniversalSymbolSupport.isSymbolSupported(corrected)) {
          const symbolInfo = UniversalSymbolSupport.getSymbolInfo(corrected, brokerName);
          
          return {
            symbol: corrected,
            confidence: 70,
            source: 'OCR_CORRECTION',
            brokerName: symbolInfo?.brokerName,
            symbolInfo: symbolInfo || undefined
          };
        }
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
}
