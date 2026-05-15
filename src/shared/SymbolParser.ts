/**
 * Unified Symbol Parser - Single Source of Truth
 * Eliminates 7+ duplicate implementations across the codebase
 */

export class SymbolParser {
  private static readonly SYMBOL_PATTERNS = [
    // Dollar-prefixed channel style: $EURUSD, $XAUUSD, $V100, $BTCUSD
    /\$?\s*(V\d{1,3})(?![A-Za-z0-9])/i,
    /\$?\s*(XAUUSD|GOLD|XAGUSD|SILVER)(?:\.x)?(?![A-Za-z0-9])/i,
    /\$?\s*(BTCUSD|BITCOIN|ETHUSD|ETHEREUM|BTC|ETH)(?:\.x)?(?![A-Za-z0-9])/i,
    /\$?\s*(NQ|NAS100|US30|SPX500|UK100|GER30)(?:\.x)?(?![A-Za-z0-9])/i,
    // Dollar-prefixed forex pairs (channel uses $NZDUSD, $EURUSD, etc.)
    /\$\s*(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD|EURCHF|EURGBP|EURJPY|EURAUD|EURCAD|EURNZD|GBPCHF|GBPJPY|GBPAUD|GBPCAD|GBPNZD|CHFJPY|CADCHF|AUDCHF|NZDCHF|CADJPY|AUDJPY|NZDJPY|AUDCAD|AUDNZD|CADNZD)(?:\.x)?(?![A-Za-z0-9])/i,
    // Hashtag patterns - highest priority (with optional .x suffix for InstantFunding)
    /#(XAUUSD|GOLD|XAGUSD|SILVER)(?:\.x)?/i,
    /#(BTCUSD|BITCOIN|ETHUSD|ETHEREUM|BTC|ETH)(?:\.x)?/i,  // Crypto support
    /#(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)(?:\.x)?/i,
    /#(EURCHF|EURGBP|EURJPY|EURAUD|EURCAD|EURNZD|GBPCHF|GBPJPY|GBPAUD|GBPCAD|GBPNZD)(?:\.x)?/i,
    /#(CHFJPY|CADCHF|AUDCHF|NZDCHF|CADJPY|AUDJPY|NZDJPY|AUDCAD|AUDNZD|CADNZD)(?:\.x)?/i,
    /#(US30|NAS100|NQ|SPX500|UK100|GER30|US100|AUS200|JPN225|DOW|NASDAQ)(?:\.x)?/i,
    /#(USOIL|UKOIL|WTI|BRENT|OIL)(?:\.x)?/i,
    /#(ESXEUR|F40EUR|HSIHED)(?:\.x)?/i,
    // Word boundaries without hashtag (with optional .x suffix)
    /\b(V\d{1,3})\b/i,
    /\b(XAUUSD|GOLD|BTCUSD|BITCOIN|ETHUSD|ETHEREUM|EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD|EURCHF|EURGBP|EURJPY|EURAUD|EURCAD|EURNZD|GBPCHF|GBPJPY|GBPAUD|GBPCAD|GBPNZD|CHFJPY|CADCHF|AUDCHF|NZDCHF|CADJPY|AUDJPY|NZDJPY|AUDCAD|AUDNZD|CADNZD|US30|NAS100|SPX500|UK100|GER30|US100|AUS200|JPN225)(?:\.x)?\b/i
  ];

  private static readonly SYMBOL_NORMALIZATION_MAP: Record<string, string> = {
    // Metals
    'GOLD': 'XAUUSD',
    'SILVER': 'XAGUSD',
    
    // Crypto
    'BITCOIN': 'BTCUSD',
    'BTC': 'BTCUSD',
    'ETHEREUM': 'ETHUSD',
    'ETH': 'ETHUSD',
    
    // Indices
    'NQ': 'NAS100',
    'NASDAQ': 'NAS100',
    'DOW': 'US30',
    'DOWJONES': 'US30',
    'SP500': 'SPX500',
    'SPX': 'SPX500',
    'DAX': 'GER30',
    'GERMANY30': 'GER30',
    'FTSE': 'UK100',
    
    // InstantFunding specific mappings
    'AUS200': 'AUS200',
    'US100': 'NAS100',
    'JPN225': 'JPN225',
    'ESXEUR': 'ESXEUR',
    'F40EUR': 'F40EUR', 
    'HSIHED': 'HSIHED',
  };

  private static readonly FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
    'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF'
  ];

  private static readonly METAL_SYMBOLS = [
    'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER'
  ];

  private static readonly INDEX_SYMBOLS = [
    'US30', 'NAS100', 'SPX500', 'UK100', 'GER30', 'FRA40', 'JPN225', 'NASDAQ'
  ];

  /** Volatility / synthetic tickers (e.g. Deriv V75, V100) */
  private static isSyntheticVolatility(symbol: string): boolean {
    return /^V\d{1,3}$/i.test(symbol.trim());
  }

  /**
   * Extract symbol from text using unified patterns
   */
  public static extractSymbol(text: string): string | null {
    // Try hashtag patterns first (most reliable)
    for (const pattern of this.SYMBOL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return this.normalizeSymbol(match[1]);
      }
    }

    // Try context-based extraction
    if (text.toLowerCase().includes('gold') || text.toLowerCase().includes('xau')) {
      return 'XAUUSD';
    }
    if (text.toLowerCase().includes('nas') || text.toLowerCase().includes('nasdaq')) {
      return 'NAS100';
    }

    return null;
  }

  /**
   * Normalize symbol using universal approach
   */
  public static normalizeSymbol(symbol: string): string {
    // Basic normalization - remove common variations and standardize
    let normalized = symbol
      .toUpperCase()
      .replace(/^\$+/, '')         // Strip leading $ from $EURUSD style
      .replace(/\.X$/, '')         // Remove InstantFunding .x suffix
      .replace(/[^A-Z0-9]/g, '')   // Remove special characters (USD from $EURUSD already handled)
      .trim();
    
    // Apply mapping if found
    return this.SYMBOL_NORMALIZATION_MAP[normalized] || normalized;
  }

  /**
   * Categorize symbol by type
   */
  public static categorizeSymbol(symbol: string): 'forex' | 'metals' | 'indices' | 'crypto' | 'commodities' | 'unknown' {
    const sym = symbol.toUpperCase();
    
    if (this.isSyntheticVolatility(sym)) {
      return 'indices';
    }

    // Forex pairs (6 characters, no dots)
    if (this.FOREX_PAIRS.includes(sym) || sym.match(/^[A-Z]{6}$/)) {
      return 'forex';
    }
    
    // Gold/Silver
    if (this.METAL_SYMBOLS.some(metal => sym.includes(metal))) {
      return 'metals';
    }
    
    // Indices
    if (this.INDEX_SYMBOLS.some(index => sym.includes(index))) {
      return 'indices';
    }
    
    // Crypto
    if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('BITCOIN') || sym.includes('ETHEREUM')) {
      return 'crypto';
    }
    
    // Commodities
    if (sym.includes('OIL') || sym.includes('WTI') || sym.includes('BRENT')) {
      return 'commodities';
    }
    
    return 'unknown';
  }

  /**
   * Get appropriate decimal places for symbol
   */
  public static getDecimalPlaces(symbol: string): number {
    const category = this.categorizeSymbol(symbol);
    
    switch (category) {
      case 'metals':
        return 2; // Metals: 2526.50
      case 'forex':
        if (symbol.includes('JPY')) {
          return 3; // JPY pairs: 145.123
        }
        return 5; // Most forex: 1.23456
      case 'indices':
      case 'commodities':
        return 1; // Indices: 35234.5
      default:
        return 5;
    }
  }

  /**
   * Check if symbol is valid trading instrument
   */
  public static isValidSymbol(symbol: string): boolean {
    const normalized = this.normalizeSymbol(symbol);
    if (this.isSyntheticVolatility(normalized)) return true;
    const category = this.categorizeSymbol(normalized);
    return category !== 'unknown';
  }

  /**
   * Get symbol-specific information for calculations
   */
  public static getSymbolInfo(symbol: string) {
    const category = this.categorizeSymbol(symbol);
    const digits = this.getDecimalPlaces(symbol);
    
    const defaultInfo = {
      digits: 5,
      pipSize: 0.00001,
      minLotSize: 0.01,
      maxLotSize: 100,
      lotStep: 0.01
    };

    switch (category) {
      case 'metals':
        return {
          digits: 2,
          pipSize: 0.01,
          minLotSize: 0.01,
          maxLotSize: 50,
          lotStep: 0.01
        };
      
      case 'forex':
        if (symbol.includes('JPY')) {
          return {
            digits: 3,
            pipSize: 0.001,
            minLotSize: 0.01,
            maxLotSize: 100,
            lotStep: 0.01
          };
        }
        return defaultInfo;
      
      case 'indices':
        return {
          digits: 1,
          pipSize: 0.1,
          minLotSize: 0.01,
          maxLotSize: 10,
          lotStep: 0.01
        };
      
      default:
        return defaultInfo;
    }
  }
}