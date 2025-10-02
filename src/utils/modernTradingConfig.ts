/**
 * Modern Universal Trading Configuration
 * Replaces hardcoded InstantFunding-specific configuration with dynamic, database-driven approach
 * Part of Phase 2: Universal Broker Support - Removing all hardcoded broker dependencies
 */

import { logger } from './logger';

export interface UniversalSymbolConfig {
  symbol: string;
  displayName: string;
  category: 'forex' | 'metals' | 'indices' | 'crypto' | 'commodities';
  
  // Dynamic price ranges (fetched from broker API)
  priceRange?: {
    min: number;
    max: number;
    lastUpdate: Date;
  };
  
  // Trading specifications (from broker)
  minLotSize: number;
  maxLotSize: number;
  lotStep: number;
  spread: number;
  
  // Risk settings (user-configurable)
  isEnabled: boolean;
  customRiskPercent?: number;
}

export interface ModernTradingConfig {
  // System Configuration
  botToken: string;
  allowedChannelId: string;
  metaApiToken: string;
  
  // Database Configuration
  mongodbUri: string;
  
  // Default Risk Settings (can be overridden per user)
  defaultRiskSettings: {
    riskPerTrade: number;           // % of account to risk per trade
    maxDailyTrades: number;         // Maximum trades per day
    maxDrawdown: number;            // Maximum drawdown limit
    dailyDrawdownLimit: number;     // Daily drawdown limit
  };
  
  // Supported symbols (dynamic, fetched from brokers)
  supportedSymbols: Map<string, UniversalSymbolConfig>;
  
  // Feature flags
  features: {
    enableRiskManagement: boolean;
    enableDatabaseLogging: boolean;
    enableMultiUser: boolean;
    enableUniversalBroker: boolean;
  };
  
  // Environment
  environment: 'development' | 'production' | 'testing';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Modern Trading Configuration Service
 * Replaces the old hardcoded approach with dynamic, universal configuration
 */
export class ModernTradingConfigService {
  private static instance: ModernTradingConfigService;
  private config: ModernTradingConfig;

  constructor() {
    this.config = this.loadUniversalConfiguration();
    logger.info('🎛️ Modern Trading Configuration loaded - Universal broker support enabled');
  }

  static getInstance(): ModernTradingConfigService {
    if (!ModernTradingConfigService.instance) {
      ModernTradingConfigService.instance = new ModernTradingConfigService();
    }
    return ModernTradingConfigService.instance;
  }

  /**
   * Load universal configuration (no hardcoded broker-specific settings)
   */
  private loadUniversalConfiguration(): ModernTradingConfig {
    return {
      // System Configuration
      botToken: this.requireEnv('BOT_TOKEN', 'Telegram bot token is required'),
      allowedChannelId: this.requireEnv('ALLOWED_CHANNEL_ID', 'Channel ID is required'),
      metaApiToken: this.requireEnv('METAAPI_TOKEN', 'MetaAPI token is required'),
      
      // Database Configuration  
      mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram-trading-bot',
      
      // Universal Default Risk Settings (no broker-specific hardcoding)
      defaultRiskSettings: {
        riskPerTrade: parseFloat(process.env.DEFAULT_RISK_PER_TRADE || '1.0'),      // 1% default
        maxDailyTrades: parseInt(process.env.DEFAULT_MAX_DAILY_TRADES || '10'),     // 10 trades max
        maxDrawdown: parseFloat(process.env.DEFAULT_MAX_DRAWDOWN || '5.0'),         // 5% max drawdown
        dailyDrawdownLimit: parseFloat(process.env.DEFAULT_DAILY_DRAWDOWN || '2.0') // 2% daily limit
      },
      
      // Dynamic symbols (no hardcoded price ranges - fetched from broker APIs)
      supportedSymbols: new Map(),
      
      // Feature flags for universal system
      features: {
        enableRiskManagement: process.env.ENABLE_RISK_MANAGEMENT !== 'false',
        enableDatabaseLogging: process.env.ENABLE_DATABASE_LOGGING !== 'false', 
        enableMultiUser: process.env.ENABLE_MULTI_USER !== 'false',
        enableUniversalBroker: process.env.ENABLE_UNIVERSAL_BROKER !== 'false'
      },
      
      // Environment
      environment: (process.env.NODE_ENV as any) || 'development',
      logLevel: (process.env.LOG_LEVEL as any) || 'info'
    };
  }

  /**
   * Get configuration for any broker (universal approach)
   */
  getUniversalConfig(): ModernTradingConfig {
    return this.config;
  }

  /**
   * Get default risk settings (no broker-specific hardcoding)
   */
  getDefaultRiskSettings() {
    return this.config.defaultRiskSettings;
  }

  /**
   * Add supported symbol dynamically (from broker API)
   */
  addSupportedSymbol(symbol: string, config: UniversalSymbolConfig): void {
    this.config.supportedSymbols.set(symbol, config);
    logger.debug(`➕ Added supported symbol: ${symbol} (${config.category})`);
  }

  /**
   * Get symbol configuration (universal, no hardcoded price ranges)
   */
  getSymbolConfig(symbol: string): UniversalSymbolConfig | null {
    return this.config.supportedSymbols.get(symbol) || null;
  }

  /**
   * Check if symbol is supported (universal check)
   */
  isSymbolSupported(symbol: string): boolean {
    return this.config.supportedSymbols.has(symbol);
  }

  /**
   * Get all supported symbols
   */
  getAllSupportedSymbols(): UniversalSymbolConfig[] {
    return Array.from(this.config.supportedSymbols.values());
  }

  /**
   * Initialize default symbols (common symbols supported by most brokers)
   */
  initializeCommonSymbols(): void {
    const commonSymbols: Array<Omit<UniversalSymbolConfig, 'priceRange'>> = [
      // Major Forex Pairs
      {
        symbol: 'EURUSD',
        displayName: 'Euro vs US Dollar',
        category: 'forex',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 0.8,
        isEnabled: true
      },
      {
        symbol: 'GBPUSD',
        displayName: 'British Pound vs US Dollar',
        category: 'forex',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 1.2,
        isEnabled: true
      },
      {
        symbol: 'USDJPY',
        displayName: 'US Dollar vs Japanese Yen',
        category: 'forex',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 0.9,
        isEnabled: true
      },
      
      // Precious Metals
      {
        symbol: 'XAUUSD',
        displayName: 'Gold vs US Dollar',
        category: 'metals',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 35,
        isEnabled: true
      },
      {
        symbol: 'XAGUSD',
        displayName: 'Silver vs US Dollar',
        category: 'metals',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 3,
        isEnabled: true
      },
      
      // Major Indices
      {
        symbol: 'US30',
        displayName: 'US Wall Street 30',
        category: 'indices',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 3,
        isEnabled: true
      },
      {
        symbol: 'NAS100',
        displayName: 'US Tech 100',
        category: 'indices',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 2,
        isEnabled: true
      },
      {
        symbol: 'SPX500',
        displayName: 'US 500',
        category: 'indices',
        minLotSize: 0.01,
        maxLotSize: 100,
        lotStep: 0.01,
        spread: 0.7,
        isEnabled: true
      }
    ];

    // Add common symbols to configuration
    commonSymbols.forEach(symbolConfig => {
      this.addSupportedSymbol(symbolConfig.symbol, symbolConfig as UniversalSymbolConfig);
    });

    logger.info(`✅ Initialized ${commonSymbols.length} common symbols (universal broker support)`);
  }

  /**
   * Validate configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required environment variables
    if (!this.config.botToken) {
      errors.push('BOT_TOKEN is required');
    }

    if (!this.config.metaApiToken) {
      errors.push('METAAPI_TOKEN is required');
    }

    if (!this.config.allowedChannelId) {
      errors.push('ALLOWED_CHANNEL_ID is required');
    }

    // Validate risk settings
    if (this.config.defaultRiskSettings.riskPerTrade <= 0) {
      errors.push('Risk per trade must be greater than 0');
    }

    if (this.config.defaultRiskSettings.maxDailyTrades <= 0) {
      errors.push('Max daily trades must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Helper to require environment variable
   */
  private requireEnv(key: string, errorMessage: string): string {
    const value = process.env[key];
    if (!value) {
      logger.error(`❌ ${errorMessage}: ${key} environment variable not set`);
      throw new Error(errorMessage);
    }
    return value;
  }

  /**
   * Update configuration dynamically
   */
  updateRiskSettings(newSettings: Partial<ModernTradingConfig['defaultRiskSettings']>): void {
    this.config.defaultRiskSettings = {
      ...this.config.defaultRiskSettings,
      ...newSettings
    };
    
    logger.info('✅ Risk settings updated dynamically');
  }

  /**
   * Enable/disable features
   */
  setFeature(feature: keyof ModernTradingConfig['features'], enabled: boolean): void {
    this.config.features[feature] = enabled;
    logger.info(`🎛️ Feature ${feature}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature: keyof ModernTradingConfig['features']): boolean {
    return this.config.features[feature];
  }
}

// Export singleton instance (replaces the old hardcoded config)
export const modernTradingConfig = ModernTradingConfigService.getInstance();

// Initialize common symbols
modernTradingConfig.initializeCommonSymbols();

// Validate configuration on load
const validation = modernTradingConfig.validateConfiguration();
if (!validation.isValid) {
  logger.error('❌ Configuration validation failed:', validation.errors);
  throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
}

logger.info('✅ Modern Universal Trading Configuration initialized successfully');