import { logger } from './logger';
import { enhancedLogger } from './enhancedLogger';

interface SymbolMapping {
  originalSymbol: string;
  brokerSymbol: string;
  alternativeNames: string[];
  isActive: boolean;
  lastValidated: Date;
  brokerSpecific: {
    [brokerName: string]: {
      symbol: string;
      minVolume: number;
      maxVolume: number;
      contractSize: number;
      digits: number;
    };
  };
}

interface SymbolValidationResult {
  isValid: boolean;
  mappedSymbol: string;
  originalSymbol: string;
  confidence: number;
  warnings: string[];
  brokerSupported: boolean;
  alternativeSuggestions: string[];
}

/**
 * CRITICAL: Dynamic symbol validation to prevent trading wrong instruments
 * Prevents disasters like trading GOLD instead of XAUUSD
 */
export class DynamicSymbolValidator {
  private static instance: DynamicSymbolValidator;
  private symbolMappings = new Map<string, SymbolMapping>();
  private validatedSymbols = new Map<string, { symbol: string; timestamp: Date; broker: string }>();
  private symbolCache = new Map<string, { isValid: boolean; mappedSymbol: string; expiry: Date }>();
  
  // Known problematic symbol mappings that cause confusion
  private criticalMappings: SymbolMapping[] = [
    {
      originalSymbol: 'GOLD',
      brokerSymbol: 'XAUUSD',
      alternativeNames: ['GOLD', 'XAU', 'XAUUSD', 'GOLD.', 'GOLD/USD'],
      isActive: true,
      lastValidated: new Date(),
      brokerSpecific: {
        'Exness': { symbol: 'XAUUSD', minVolume: 0.01, maxVolume: 100, contractSize: 100, digits: 2 },
        'FTMO': { symbol: 'XAUUSD', minVolume: 0.01, maxVolume: 20, contractSize: 100, digits: 2 },
        'IC Markets': { symbol: 'XAUUSD', minVolume: 0.01, maxVolume: 100, contractSize: 100, digits: 2 }
      }
    },
    {
      originalSymbol: 'SILVER',
      brokerSymbol: 'XAGUSD',
      alternativeNames: ['SILVER', 'XAG', 'XAGUSD', 'SILVER.', 'SILVER/USD'],
      isActive: true,
      lastValidated: new Date(),
      brokerSpecific: {
        'Exness': { symbol: 'XAGUSD', minVolume: 0.01, maxVolume: 100, contractSize: 5000, digits: 3 },
        'FTMO': { symbol: 'XAGUSD', minVolume: 0.01, maxVolume: 50, contractSize: 5000, digits: 3 }
      }
    },
    {
      originalSymbol: 'EURUSD',
      brokerSymbol: 'EURUSD',
      alternativeNames: ['EURUSD', 'EUR/USD', 'EUR-USD', 'EURUSD.'],
      isActive: true,
      lastValidated: new Date(),
      brokerSpecific: {
        'Exness': { symbol: 'EURUSD', minVolume: 0.01, maxVolume: 100, contractSize: 100000, digits: 5 },
        'FTMO': { symbol: 'EURUSD', minVolume: 0.01, maxVolume: 30, contractSize: 100000, digits: 5 }
      }
    }
  ];

  private constructor() {
    this.initializeMappings();
  }

  static getInstance(): DynamicSymbolValidator {
    if (!DynamicSymbolValidator.instance) {
      DynamicSymbolValidator.instance = new DynamicSymbolValidator();
    }
    return DynamicSymbolValidator.instance;
  }

  /**
   * CRITICAL: Validate symbol exists on broker before trade execution
   */
  async validateSymbolForBroker(
    inputSymbol: string, 
    brokerName: string,
    connection?: any
  ): Promise<SymbolValidationResult> {
    enhancedLogger.info(`🔍 Validating symbol ${inputSymbol} for broker ${brokerName}`);
    
    const cacheKey = `${inputSymbol}_${brokerName}`;
    const cached = this.symbolCache.get(cacheKey);
    
    // Use cache if valid and not expired (5 minutes)
    if (cached && cached.expiry > new Date()) {
      enhancedLogger.debug('Using cached symbol validation', { inputSymbol, brokerName });
      return {
        isValid: cached.isValid,
        mappedSymbol: cached.mappedSymbol,
        originalSymbol: inputSymbol,
        confidence: 0.9,
        warnings: [],
        brokerSupported: cached.isValid,
        alternativeSuggestions: []
      };
    }

    const result = await this.performSymbolValidation(inputSymbol, brokerName, connection);
    
    // Cache the result
    this.symbolCache.set(cacheKey, {
      isValid: result.isValid,
      mappedSymbol: result.mappedSymbol,
      expiry: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });

    return result;
  }

  /**
   * Perform actual symbol validation with broker
   */
  private async performSymbolValidation(
    inputSymbol: string,
    brokerName: string,
    connection?: any
  ): Promise<SymbolValidationResult> {
    const warnings: string[] = [];
    let mappedSymbol = inputSymbol;
    let confidence = 0.5;

    // Step 1: Check known mappings
    const mapping = this.findSymbolMapping(inputSymbol);
    if (mapping) {
      mappedSymbol = mapping.brokerSymbol;
      confidence = 0.8;
      
      // Check broker-specific mapping
      const brokerMapping = mapping.brokerSpecific[brokerName];
      if (brokerMapping) {
        mappedSymbol = brokerMapping.symbol;
        confidence = 0.9;
      } else {
        warnings.push(`No specific mapping for broker ${brokerName}, using default ${mappedSymbol}`);
        confidence = 0.7;
      }
    }

    // Step 2: Real-time validation with MetaAPI if connection available
    if (connection) {
      try {
        const symbolPrice = await connection.getSymbolPrice(mappedSymbol);
        if (symbolPrice && symbolPrice.bid && symbolPrice.ask) {
          enhancedLogger.info(`✅ Symbol ${mappedSymbol} validated with broker ${brokerName}`, {
            bid: symbolPrice.bid,
            ask: symbolPrice.ask,
            spread: symbolPrice.ask - symbolPrice.bid
          });
          
          // Store successful validation
          this.validatedSymbols.set(`${mappedSymbol}_${brokerName}`, {
            symbol: mappedSymbol,
            timestamp: new Date(),
            broker: brokerName
          });
          
          return {
            isValid: true,
            mappedSymbol,
            originalSymbol: inputSymbol,
            confidence: 0.95,
            warnings,
            brokerSupported: true,
            alternativeSuggestions: []
          };
        }
      } catch (error) {
        enhancedLogger.error(`❌ Symbol validation failed for ${mappedSymbol} on ${brokerName}:`, error);
        
        // Try alternative symbols
        const alternatives = this.getAlternativeSymbols(inputSymbol, brokerName);
        for (const altSymbol of alternatives) {
          try {
            const altPrice = await connection.getSymbolPrice(altSymbol);
            if (altPrice && altPrice.bid && altPrice.ask) {
              enhancedLogger.info(`✅ Alternative symbol ${altSymbol} found for ${inputSymbol}`);
              
              return {
                isValid: true,
                mappedSymbol: altSymbol,
                originalSymbol: inputSymbol,
                confidence: 0.8,
                warnings: [`Original symbol ${inputSymbol} not found, using ${altSymbol}`],
                brokerSupported: true,
                alternativeSuggestions: []
              };
            }
          } catch (altError) {
            // Continue trying alternatives
          }
        }
        
        // No valid symbol found
        return {
          isValid: false,
          mappedSymbol: inputSymbol,
          originalSymbol: inputSymbol,
          confidence: 0,
          warnings: [`Symbol ${inputSymbol} not supported by broker ${brokerName}`],
          brokerSupported: false,
          alternativeSuggestions: alternatives
        };
      }
    }

    // Step 3: Return mapping-based result if no connection
    return {
      isValid: mapping ? true : false,
      mappedSymbol,
      originalSymbol: inputSymbol,
      confidence,
      warnings,
      brokerSupported: mapping ? true : false,
      alternativeSuggestions: mapping ? [] : this.getAlternativeSymbols(inputSymbol, brokerName)
    };
  }

  /**
   * Find symbol mapping from known mappings
   */
  private findSymbolMapping(inputSymbol: string): SymbolMapping | null {
    const upperInput = inputSymbol.toUpperCase();
    
    // Direct symbol match
    for (const mapping of this.criticalMappings) {
      if (mapping.brokerSymbol.toUpperCase() === upperInput) {
        return mapping;
      }
    }
    
    // Alternative name match
    for (const mapping of this.criticalMappings) {
      for (const altName of mapping.alternativeNames) {
        if (altName.toUpperCase() === upperInput) {
          return mapping;
        }
      }
    }
    
    return null;
  }

  /**
   * Get alternative symbol suggestions
   */
  private getAlternativeSymbols(inputSymbol: string, brokerName: string): string[] {
    const upperInput = inputSymbol.toUpperCase();
    const alternatives: string[] = [];
    
    // Common symbol variations
    const variations: Record<string, string[]> = {
      'GOLD': ['XAUUSD', 'GOLD', 'XAU', 'GOLD.'],
      'XAUUSD': ['GOLD', 'XAU', 'GOLD.', 'XAUUSD'],
      'SILVER': ['XAGUSD', 'SILVER', 'XAG', 'SILVER.'],
      'XAGUSD': ['SILVER', 'XAG', 'SILVER.', 'XAGUSD'],
      'EURUSD': ['EUR/USD', 'EURUSD', 'EURUSD.'],
      'GBPUSD': ['GBP/USD', 'GBPUSD', 'GBPUSD.'],
      'USDJPY': ['USD/JPY', 'USDJPY', 'USDJPY.']
    };
    
    const inputVariations = variations[upperInput] || [];
    alternatives.push(...inputVariations);
    
    // Add broker-specific suffixes
    if (!upperInput.includes('.')) {
      alternatives.push(upperInput + '.');
    }
    
    return [...new Set(alternatives)]; // Remove duplicates
  }

  /**
   * Initialize symbol mappings
   */
  private initializeMappings(): void {
    this.criticalMappings.forEach(mapping => {
      this.symbolMappings.set(mapping.originalSymbol, mapping);
      mapping.alternativeNames.forEach(altName => {
        this.symbolMappings.set(altName, mapping);
      });
    });
    
    enhancedLogger.info('Symbol mappings initialized', {
      totalMappings: this.symbolMappings.size,
      criticalSymbols: this.criticalMappings.length
    });
  }

  /**
   * Add custom symbol mapping
   */
  addSymbolMapping(mapping: SymbolMapping): void {
    this.symbolMappings.set(mapping.originalSymbol, mapping);
    mapping.alternativeNames.forEach(altName => {
      this.symbolMappings.set(altName, mapping);
    });
    
    enhancedLogger.info(`Added custom symbol mapping: ${mapping.originalSymbol} → ${mapping.brokerSymbol}`);
  }

  /**
   * Get symbol specifications for broker
   */
  getSymbolSpecs(symbol: string, brokerName: string): any | null {
    const mapping = this.findSymbolMapping(symbol);
    if (mapping && mapping.brokerSpecific[brokerName]) {
      return mapping.brokerSpecific[brokerName];
    }
    return null;
  }

  /**
   * CRITICAL: Pre-flight check before trade execution
   * Returns false if symbol is definitely invalid
   */
  preFlightSymbolCheck(symbol: string, brokerName: string): {
    canProceed: boolean;
    reason?: string;
    suggestedSymbol?: string;
  } {
    // Check if we've recently validated this symbol
    const recentValidation = this.validatedSymbols.get(`${symbol}_${brokerName}`);
    if (recentValidation && (Date.now() - recentValidation.timestamp.getTime()) < 10 * 60 * 1000) {
      return { canProceed: true };
    }

    // Check if symbol is in known bad symbols list
    const badSymbols = ['GOLD.', 'SILVER.', 'EUR/USD']; // These often cause broker errors
    if (badSymbols.includes(symbol)) {
      const mapping = this.findSymbolMapping(symbol);
      return {
        canProceed: false,
        reason: `Symbol ${symbol} known to cause broker errors`,
        suggestedSymbol: mapping?.brokerSymbol
      };
    }

    // Basic symbol format validation
    if (symbol.length < 3 || symbol.length > 10) {
      return {
        canProceed: false,
        reason: `Invalid symbol format: ${symbol}`
      };
    }

    return { canProceed: true };
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = new Date();
    for (const [key, value] of this.symbolCache.entries()) {
      if (value.expiry <= now) {
        this.symbolCache.delete(key);
      }
    }
  }
}
