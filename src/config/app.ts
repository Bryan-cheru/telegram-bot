/**
 * Type-safe application configuration
 * Centralizes all configuration with proper TypeScript types
 */

export interface TradingConfig {
  maxTradeSize: number;
  riskPercentage: number;
  enforceOneToOneRR: boolean;
  defaultOrderType: 'MARKET' | 'LIMIT' | 'AUTO';
  useSmartOrderType: boolean;
  limitOrderSlippage: number;
  pendingOrderExpiration: number;
  enableAdvancedOrderTypes: boolean;
}

export interface MetaApiConfig {
  token: string;
  accountId: string;
  accounts: string;
  connectionTimeoutMs: number;
  maxRetries: number;
}

export interface BotConfig {
  token: string;
  allowedChannelId: string;
  allowedChannelUsername: string;
  maxMessageLength: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'local';
  instanceType: string;
  botEnabled: boolean;
  dashboardEnabled: boolean;
  dashboardPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface DatabaseConfig {
  mongoUri: string;
  connectionTimeoutMs: number;
  maxPoolSize: number;
  minPoolSize: number;
}

/**
 * Complete application configuration with validation
 */
export interface ApplicationConfiguration {
  app: AppConfig;
  bot: BotConfig;
  metaApi: MetaApiConfig;
  trading: TradingConfig;
  database: DatabaseConfig;
}

export class ConfigurationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Configuration validator and loader
 */
export class ConfigurationService {
  private static instance: ConfigurationService;
  private config: ApplicationConfiguration;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  private loadConfiguration(): ApplicationConfiguration {
    return {
      app: {
        nodeEnv: this.getEnvAs('NODE_ENV', ['development', 'production', 'local'], 'development'),
        instanceType: process.env.INSTANCE_TYPE || 'production',
        botEnabled: process.env.BOT_ENABLED !== 'false',
        dashboardEnabled: process.env.DASHBOARD_ENABLED !== 'false',
        dashboardPort: this.getEnvAsNumber('DASHBOARD_PORT', 3000),
        logLevel: this.getEnvAs('LOG_LEVEL', ['debug', 'info', 'warn', 'error'], 'info')
      },
      bot: {
        token: process.env.BOT_TOKEN || '',
        allowedChannelId: process.env.ALLOWED_CHANNEL_ID || '',
        allowedChannelUsername: process.env.ALLOWED_CHANNEL_USERNAME || '',
        maxMessageLength: this.getEnvAsNumber('MAX_MESSAGE_LENGTH', 4096)
      },
      metaApi: {
        token: process.env.METAAPI_TOKEN || '',
        accountId: process.env.METAAPI_ACCOUNT_ID || '',
        accounts: process.env.METAAPI_ACCOUNTS || process.env.METAAPI_TEST_ACCOUNT || '',
        connectionTimeoutMs: this.getEnvAsNumber('METAAPI_CONNECTION_TIMEOUT_MS', 30000),
        maxRetries: this.getEnvAsNumber('METAAPI_MAX_RETRIES', 3)
      },
      trading: {
        maxTradeSize: this.getEnvAsNumber('MAX_TRADE_SIZE', 0.1),
        riskPercentage: this.getEnvAsNumber('RISK_PERCENTAGE', 0.5),
        enforceOneToOneRR: process.env.ENFORCE_1_1_RR !== 'false',
        defaultOrderType: this.getEnvAs('DEFAULT_ORDER_TYPE', ['MARKET', 'LIMIT', 'AUTO'], 'MARKET'),
        useSmartOrderType: process.env.USE_SMART_ORDER_TYPE !== 'false',
        limitOrderSlippage: this.getEnvAsNumber('LIMIT_ORDER_SLIPPAGE', 5),
        pendingOrderExpiration: this.getEnvAsNumber('PENDING_ORDER_EXPIRATION', 4),
        enableAdvancedOrderTypes: process.env.ENABLE_ADVANCED_ORDER_TYPES !== 'false'
      },
      database: {
        mongoUri: process.env.MONGO_URI || process.env.DATABASE_URL || '',
        connectionTimeoutMs: this.getEnvAsNumber('DB_CONNECTION_TIMEOUT_MS', 15000),
        maxPoolSize: this.getEnvAsNumber('DB_MAX_POOL_SIZE', 5),
        minPoolSize: this.getEnvAsNumber('DB_MIN_POOL_SIZE', 1)
      }
    };
  }

  private validateConfiguration(): void {
    const errors: ConfigurationError[] = [];

    // Validate bot configuration
    if (!this.config.bot.token) {
      errors.push(new ConfigurationError('BOT_TOKEN is required', 'BOT_TOKEN'));
    }

    // Validate trading configuration
    if (this.config.trading.riskPercentage > 5.0) {
      errors.push(new ConfigurationError('RISK_PERCENTAGE cannot exceed 5.0%', 'RISK_PERCENTAGE'));
    }
    if (this.config.trading.riskPercentage <= 0) {
      errors.push(new ConfigurationError('RISK_PERCENTAGE must be positive', 'RISK_PERCENTAGE'));
    }
    if (this.config.trading.maxTradeSize <= 0) {
      errors.push(new ConfigurationError('MAX_TRADE_SIZE must be positive', 'MAX_TRADE_SIZE'));
    }

    // Validate MetaAPI configuration (optional but warn if missing)
    if (!this.config.metaApi.token && this.config.app.nodeEnv === 'production') {
      console.warn('⚠️ METAAPI_TOKEN not configured - trading features will be unavailable');
    }

    // Validate ports
    if (this.config.app.dashboardPort < 1024 || this.config.app.dashboardPort > 65535) {
      errors.push(new ConfigurationError('DASHBOARD_PORT must be between 1024-65535', 'DASHBOARD_PORT'));
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  private getEnvAsNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      throw new ConfigurationError(`${key} must be a valid number, got: ${value}`, key);
    }
    return parsed;
  }

  private getEnvAs<T extends string>(key: string, allowedValues: readonly T[], defaultValue: T): T {
    const value = process.env[key] as T;
    if (!value) return defaultValue;
    if (!allowedValues.includes(value)) {
      throw new ConfigurationError(
        `${key} must be one of: ${allowedValues.join(', ')}, got: ${value}`, 
        key
      );
    }
    return value;
  }

  getConfig(): Readonly<ApplicationConfiguration> {
    return this.config;
  }

  getAppConfig(): Readonly<AppConfig> {
    return this.config.app;
  }

  getBotConfig(): Readonly<BotConfig> {
    return this.config.bot;
  }

  getTradingConfig(): Readonly<TradingConfig> {
    return this.config.trading;
  }

  getMetaApiConfig(): Readonly<MetaApiConfig> {
    return this.config.metaApi;
  }

  getDatabaseConfig(): Readonly<DatabaseConfig> {
    return this.config.database;
  }

  /**
   * Check if the application is running in production
   */
  isProduction(): boolean {
    return this.config.app.nodeEnv === 'production';
  }

  /**
   * Check if the application is running in development
   */
  isDevelopment(): boolean {
    return this.config.app.nodeEnv === 'development';
  }
}

export const appConfig = ConfigurationService.getInstance();