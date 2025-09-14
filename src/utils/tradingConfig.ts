import { logger } from './logger';

export interface TradingConfig {
  // Position Sizing
  defaultLotSize: number;
  minLotSize: number;
  maxLotSize: number;
  
  // Risk Management  
  defaultRiskPercentage: number;
  maxRiskPercentage: number;
  maxDailyLoss: number;
  maxDailyTrades: number;
  
  // Price Ranges (for symbol validation)
  priceRanges: {
    [symbol: string]: { min: number; max: number };
  };
  
  // OCR and ML
  minOcrConfidence: number;
  minMlConfidence: number;
  
  // Timeouts and Intervals
  marketDataTimeout: number;
  connectionTimeout: number;
  syncTimeout: number;
  
  // Safety Limits
  minAccountBalance: number;
  maxDrawdownPercentage: number;
  minTradingInterval: number; // milliseconds between trades
}

class TradingConfigManager {
  private static instance: TradingConfigManager;
  private config: TradingConfig;

  private constructor() {
    this.config = this.loadConfiguration();
  }

  static getInstance(): TradingConfigManager {
    if (!TradingConfigManager.instance) {
      TradingConfigManager.instance = new TradingConfigManager();
    }
    return TradingConfigManager.instance;
  }

  getConfig(): TradingConfig {
    return { ...this.config }; // Return copy to prevent modification
  }

  updateConfig(updates: Partial<TradingConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Trading configuration updated:', updates);
  }

  private loadConfiguration(): TradingConfig {
    const defaultConfig: TradingConfig = {
      // Position Sizing
      defaultLotSize: parseFloat(process.env.DEFAULT_LOT_SIZE || '0.01'),
      minLotSize: parseFloat(process.env.MIN_LOT_SIZE || '0.01'),
      maxLotSize: parseFloat(process.env.MAX_LOT_SIZE || '1.0'),
      
      // Risk Management
      defaultRiskPercentage: parseFloat(process.env.DEFAULT_RISK_PERCENTAGE || '2.0'),
      maxRiskPercentage: parseFloat(process.env.MAX_RISK_PERCENTAGE || '2.0'),
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '500'),
      maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '10'),
      
      // Price Ranges - Using current market ranges instead of hardcoded values
      priceRanges: {
        'XAUUSD': { 
          min: parseFloat(process.env.XAUUSD_MIN_PRICE || '2000'), 
          max: parseFloat(process.env.XAUUSD_MAX_PRICE || '4000') 
        },
        'EURUSD': { 
          min: parseFloat(process.env.EURUSD_MIN_PRICE || '1.0000'), 
          max: parseFloat(process.env.EURUSD_MAX_PRICE || '1.2000') 
        },
        'GBPUSD': { 
          min: parseFloat(process.env.GBPUSD_MIN_PRICE || '1.2000'), 
          max: parseFloat(process.env.GBPUSD_MAX_PRICE || '1.4000') 
        },
        'USDCHF': { 
          min: parseFloat(process.env.USDCHF_MIN_PRICE || '0.7000'), 
          max: parseFloat(process.env.USDCHF_MAX_PRICE || '1.0000') 
        },
        'NAS100': { 
          min: parseFloat(process.env.NAS100_MIN_PRICE || '15000'), 
          max: parseFloat(process.env.NAS100_MAX_PRICE || '22000') 
        },
        'SPX500': { 
          min: parseFloat(process.env.SPX500_MIN_PRICE || '4000'), 
          max: parseFloat(process.env.SPX500_MAX_PRICE || '6000') 
        }
      },
      
      // OCR and ML
      minOcrConfidence: parseFloat(process.env.MIN_OCR_CONFIDENCE || '0.6'),
      minMlConfidence: parseFloat(process.env.MIN_ML_CONFIDENCE || '0.7'),
      
      // Timeouts and Intervals (in milliseconds)
      marketDataTimeout: parseInt(process.env.MARKET_DATA_TIMEOUT || '5000'),
      connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '30000'),
      syncTimeout: parseInt(process.env.SYNC_TIMEOUT || '60000'),
      
      // Safety Limits
      minAccountBalance: parseFloat(process.env.MIN_ACCOUNT_BALANCE || '1000'),
      maxDrawdownPercentage: parseFloat(process.env.MAX_DRAWDOWN_PERCENTAGE || '10.0'),
      minTradingInterval: parseInt(process.env.MIN_TRADING_INTERVAL || '60000') // 1 minute
    };

    // Validate configuration
    this.validateConfiguration(defaultConfig);
    
    logger.info('Trading configuration loaded:', {
      defaultLotSize: defaultConfig.defaultLotSize,
      defaultRiskPercentage: defaultConfig.defaultRiskPercentage,
      minOcrConfidence: defaultConfig.minOcrConfidence,
      maxDailyTrades: defaultConfig.maxDailyTrades,
      priceRangeCount: Object.keys(defaultConfig.priceRanges).length
    });

    return defaultConfig;
  }

  private validateConfiguration(config: TradingConfig): void {
    const errors: string[] = [];

    // Validate lot sizes
    if (config.minLotSize <= 0) errors.push('MIN_LOT_SIZE must be greater than 0');
    if (config.maxLotSize < config.minLotSize) errors.push('MAX_LOT_SIZE must be greater than or equal to MIN_LOT_SIZE');
    if (config.defaultLotSize < config.minLotSize || config.defaultLotSize > config.maxLotSize) {
      errors.push('DEFAULT_LOT_SIZE must be between MIN_LOT_SIZE and MAX_LOT_SIZE');
    }

    // Validate risk management
    if (config.defaultRiskPercentage <= 0 || config.defaultRiskPercentage > 100) {
      errors.push('DEFAULT_RISK_PERCENTAGE must be between 0 and 100');
    }
    if (config.maxRiskPercentage < config.defaultRiskPercentage) {
      errors.push('MAX_RISK_PERCENTAGE must be greater than or equal to DEFAULT_RISK_PERCENTAGE');
    }

    // Validate confidence thresholds
    if (config.minOcrConfidence < 0 || config.minOcrConfidence > 1) {
      errors.push('MIN_OCR_CONFIDENCE must be between 0 and 1');
    }
    if (config.minMlConfidence < 0 || config.minMlConfidence > 1) {
      errors.push('MIN_ML_CONFIDENCE must be between 0 and 1');
    }

    // Validate timeouts
    if (config.marketDataTimeout < 1000) errors.push('MARKET_DATA_TIMEOUT must be at least 1000ms');
    if (config.connectionTimeout < 5000) errors.push('CONNECTION_TIMEOUT must be at least 5000ms');

    // Validate safety limits
    if (config.minAccountBalance <= 0) errors.push('MIN_ACCOUNT_BALANCE must be greater than 0');
    if (config.maxDrawdownPercentage <= 0 || config.maxDrawdownPercentage > 100) {
      errors.push('MAX_DRAWDOWN_PERCENTAGE must be between 0 and 100');
    }

    if (errors.length > 0) {
      logger.error('Trading configuration validation errors:', errors);
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  // Helper methods to get specific config values
  getPriceRange(symbol: string): { min: number; max: number } {
    return this.config.priceRanges[symbol] || { min: 1, max: 100000 };
  }

  isValidPrice(symbol: string, price: number): boolean {
    const range = this.getPriceRange(symbol);
    return price >= range.min && price <= range.max;
  }

  calculateMaxVolume(accountBalance: number, entryPrice: number, stopLoss: number): number {
    const riskAmount = accountBalance * (this.config.maxRiskPercentage / 100);
    const stopDistance = Math.abs(entryPrice - stopLoss);
    
    if (stopDistance === 0) return this.config.minLotSize;
    
    let volume = riskAmount / (stopDistance * 10); // Simplified calculation
    volume = Math.max(this.config.minLotSize, Math.min(this.config.maxLotSize, volume));
    
    return Math.round(volume * 100) / 100; // Round to 2 decimal places
  }
}

// Export singleton instance
export const tradingConfig = TradingConfigManager.getInstance();
