/**
 * Unified Validation Service - Single Source of Truth
 * Eliminates duplicate validation logic across frontend/backend
 */

export class ValidationService {
  // Trading parameter limits
  private static readonly LIMITS = {
    LOT_SIZE: {
      MIN: 0.01,
      MAX: 100,
      STEP: 0.01
    },
    RISK_PERCENTAGE: {
      MIN: 0.1,
      MAX: 10.0,
      STEP: 0.1
    },
    SLIPPAGE: {
      MIN: 0,
      MAX: 50,
      DEFAULT: 3
    },
    PRICE: {
      MIN: 0.00001,
      MAX: 999999.99999
    },
    DAILY_TRADES: {
      MIN: 1,
      MAX: 50
    },
    DRAWDOWN: {
      MIN: 1,
      MAX: 50
    }
  };

  /**
   * Validate lot size
   */
  public static validateLotSize(lots: number): { isValid: boolean; error?: string; corrected?: number } {
    if (typeof lots !== 'number' || isNaN(lots)) {
      return { isValid: false, error: 'Lot size must be a valid number' };
    }

    if (lots < this.LIMITS.LOT_SIZE.MIN) {
      return { 
        isValid: false, 
        error: `Lot size must be at least ${this.LIMITS.LOT_SIZE.MIN}`,
        corrected: this.LIMITS.LOT_SIZE.MIN
      };
    }

    if (lots > this.LIMITS.LOT_SIZE.MAX) {
      return { 
        isValid: false, 
        error: `Lot size cannot exceed ${this.LIMITS.LOT_SIZE.MAX}`,
        corrected: this.LIMITS.LOT_SIZE.MAX
      };
    }

    // Round to valid step
    const rounded = Math.round(lots / this.LIMITS.LOT_SIZE.STEP) * this.LIMITS.LOT_SIZE.STEP;
    const corrected = Math.round(rounded * 100) / 100; // Fix floating point precision

    return { 
      isValid: true, 
      corrected: corrected !== lots ? corrected : undefined 
    };
  }

  /**
   * Validate risk percentage
   */
  public static validateRiskPercentage(risk: number): { isValid: boolean; error?: string; corrected?: number } {
    if (typeof risk !== 'number' || isNaN(risk)) {
      return { isValid: false, error: 'Risk percentage must be a valid number' };
    }

    if (risk < this.LIMITS.RISK_PERCENTAGE.MIN) {
      return { 
        isValid: false, 
        error: `Risk percentage must be at least ${this.LIMITS.RISK_PERCENTAGE.MIN}%`,
        corrected: this.LIMITS.RISK_PERCENTAGE.MIN
      };
    }

    if (risk > this.LIMITS.RISK_PERCENTAGE.MAX) {
      return { 
        isValid: false, 
        error: `Risk percentage cannot exceed ${this.LIMITS.RISK_PERCENTAGE.MAX}%`,
        corrected: this.LIMITS.RISK_PERCENTAGE.MAX
      };
    }

    return { isValid: true };
  }

  /**
   * Validate price value
   */
  public static validatePrice(price: number, symbol?: string): { isValid: boolean; error?: string; corrected?: number } {
    if (typeof price !== 'number' || isNaN(price)) {
      return { isValid: false, error: 'Price must be a valid number' };
    }

    if (price <= 0) {
      return { isValid: false, error: 'Price must be greater than zero' };
    }

    if (price < this.LIMITS.PRICE.MIN) {
      return { 
        isValid: false, 
        error: 'Price is too small',
        corrected: this.LIMITS.PRICE.MIN
      };
    }

    if (price > this.LIMITS.PRICE.MAX) {
      return { 
        isValid: false, 
        error: 'Price is too large',
        corrected: this.LIMITS.PRICE.MAX
      };
    }

    return { isValid: true };
  }

  /**
   * Validate trading signal structure
   */
  public static validateTradeSignal(signal: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!signal) {
      errors.push('Trade signal is required');
      return { isValid: false, errors };
    }

    if (!signal.symbol || typeof signal.symbol !== 'string') {
      errors.push('Valid symbol is required');
    }

    if (!signal.action || !['BUY', 'SELL'].includes(signal.action)) {
      errors.push('Action must be BUY or SELL');
    }

    if (!signal.entryZone || typeof signal.entryZone !== 'object') {
      errors.push('Entry zone is required');
    } else {
      if (typeof signal.entryZone.min !== 'number' || typeof signal.entryZone.max !== 'number') {
        errors.push('Entry zone must have valid min and max prices');
      } else {
        // Allow min === max === 0: this is a valid MARKET order (no specific entry price).
        // Only reject when min > max (inverted zone) or when min equals max at a non-zero
        // price (which would mean a zero-width limit zone — likely a parsing error).
        const isMarket = signal.entryZone.min === 0 && signal.entryZone.max === 0;
        if (!isMarket && signal.entryZone.min >= signal.entryZone.max) {
          errors.push('Entry zone min must be less than max');
        }
      }
    }

    if (!signal.stopLoss || typeof signal.stopLoss !== 'number') {
      errors.push('Stop loss is required');
    }

    if (!signal.targets || !Array.isArray(signal.targets) || signal.targets.length === 0) {
      errors.push('At least one target is required');
    } else {
      // Validate all targets are numbers
      signal.targets.forEach((target: any, index: number) => {
        if (typeof target !== 'number') {
          errors.push(`Target ${index + 1} must be a valid number`);
        }
      });
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate account credentials
   */
  public static validateAccountCredentials(credentials: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!credentials) {
      errors.push('Account credentials are required');
      return { isValid: false, errors };
    }

    if (!credentials.metaApiToken || typeof credentials.metaApiToken !== 'string') {
      errors.push('MetaAPI token is required');
    } else if (credentials.metaApiToken.length < 50) {
      errors.push('MetaAPI token appears to be invalid (too short)');
    }

    if (!credentials.accountId || typeof credentials.accountId !== 'string') {
      errors.push('Account ID is required');
    } else if (!/^[a-f0-9-]{36}$/.test(credentials.accountId)) {
      errors.push('Account ID must be a valid UUID format');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate user settings
   */
  public static validateUserSettings(settings: any): { isValid: boolean; errors: string[]; corrected?: any } {
    const errors: string[] = [];
    const corrected: any = { ...settings };

    if (!settings) {
      errors.push('User settings are required');
      return { isValid: false, errors };
    }

    // Validate risk percentage
    if (settings.riskPercent !== undefined) {
      const riskValidation = this.validateRiskPercentage(settings.riskPercent);
      if (!riskValidation.isValid) {
        errors.push(riskValidation.error!);
      } else if (riskValidation.corrected !== undefined) {
        corrected.riskPercent = riskValidation.corrected;
      }
    }

    // Validate max lot size
    if (settings.maxLotSize !== undefined) {
      const lotValidation = this.validateLotSize(settings.maxLotSize);
      if (!lotValidation.isValid) {
        errors.push(lotValidation.error!);
      } else if (lotValidation.corrected !== undefined) {
        corrected.maxLotSize = lotValidation.corrected;
      }
    }

    // Validate max daily trades
    if (settings.maxDailyTrades !== undefined) {
      if (typeof settings.maxDailyTrades !== 'number' || 
          settings.maxDailyTrades < this.LIMITS.DAILY_TRADES.MIN || 
          settings.maxDailyTrades > this.LIMITS.DAILY_TRADES.MAX) {
        errors.push(`Max daily trades must be between ${this.LIMITS.DAILY_TRADES.MIN} and ${this.LIMITS.DAILY_TRADES.MAX}`);
      }
    }

    // Validate enabled symbols array
    if (settings.enabledSymbols !== undefined) {
      if (!Array.isArray(settings.enabledSymbols)) {
        errors.push('Enabled symbols must be an array');
      } else {
        // Import SymbolParser for validation (if available)
        const invalidSymbols = settings.enabledSymbols.filter((symbol: any) => 
          typeof symbol !== 'string' || symbol.length < 3
        );
        if (invalidSymbols.length > 0) {
          errors.push('All enabled symbols must be valid trading instruments');
        }
      }
    }

    return { 
      isValid: errors.length === 0, 
      errors,
      corrected: Object.keys(corrected).length !== Object.keys(settings).length ? corrected : undefined
    };
  }

  /**
   * Sanitize input for database storage
   */
  public static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input
        .trim()
        .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
        .substring(0, 1000); // Limit length
    }
    
    if (typeof input === 'number') {
      return isNaN(input) ? 0 : input;
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item)).slice(0, 100); // Limit array size
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      Object.keys(input).slice(0, 50).forEach(key => { // Limit object keys
        const sanitizedKey = this.sanitizeInput(key);
        sanitized[sanitizedKey] = this.sanitizeInput(input[key]);
      });
      return sanitized;
    }
    
    return input;
  }

  /**
   * Validate API request rate limiting
   */
  public static validateRateLimit(userId: string, endpoint: string, rateLimits: Map<string, number[]>): { allowed: boolean; retryAfter?: number } {
    const key = `${userId}:${endpoint}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxRequests = 100; // Max requests per minute
    
    if (!rateLimits.has(key)) {
      rateLimits.set(key, []);
    }
    
    const timestamps = rateLimits.get(key)!;
    
    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(timestamp => now - timestamp < windowMs);
    
    if (validTimestamps.length >= maxRequests) {
      const oldestTimestamp = Math.min(...validTimestamps);
      const retryAfter = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }
    
    // Add current timestamp
    validTimestamps.push(now);
    rateLimits.set(key, validTimestamps);
    
    return { allowed: true };
  }

  /**
   * Get validation limits for frontend
   */
  public static getLimits() {
    return { ...this.LIMITS };
  }
}