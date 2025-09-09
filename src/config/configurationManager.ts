/**
 * Configuration Management System - Missing centralized config management
 * Industry standard for environment-based configuration with validation
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  connectionTimeout: number;
  maxConnections: number;
}

export interface TradingConfig {
  maxPositionsPerSymbol: number;
  maxDailyLoss: number;
  maxRiskPerTrade: number;
  allowedSymbols: string[];
  tradingHours: {
    start: string;
    end: string;
    timezone: string;
  };
  slippageTolerancePips: number;
}

export interface MonitoringConfig {
  metricsPort: number;
  healthCheckPort: number;
  logLevel: string;
  alertWebhooks: {
    slack?: string;
    discord?: string;
    email?: string[];
  };
  performanceThresholds: {
    cpuUsage: number;
    memoryUsage: number;
    responseTime: number;
  };
}

export interface TelegramConfig {
  botToken: string;
  allowedChannels: string[];
  adminUsers: string[];
  rateLimit: {
    maxMessages: number;
    windowMs: number;
  };
}

export interface MetaApiConfig {
  accounts: Array<{
    id: string;
    token: string;
    serverName: string;
    region: string;
    enabled: boolean;
    maxRiskPercentage: number;
  }>;
  timeoutMs: number;
  retryAttempts: number;
}

export interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  port: number;
  version: string;
  database: DatabaseConfig;
  trading: TradingConfig;
  monitoring: MonitoringConfig;
  telegram: TelegramConfig;
  metaApi: MetaApiConfig;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config!: AppConfig;
  private watchers: Map<string, (config: AppConfig) => void> = new Map();

  private constructor() {
    this.loadConfiguration();
    this.setupConfigWatcher();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get complete configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get specific configuration section
   */
  getDatabaseConfig(): DatabaseConfig {
    return this.config.database;
  }

  getTradingConfig(): TradingConfig {
    return this.config.trading;
  }

  getMonitoringConfig(): MonitoringConfig {
    return this.config.monitoring;
  }

  getTelegramConfig(): TelegramConfig {
    return this.config.telegram;
  }

  getMetaApiConfig(): MetaApiConfig {
    return this.config.metaApi;
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(config: any): void {
    const required = [
      'environment',
      'port',
      'database',
      'trading',
      'monitoring',
      'telegram',
      'metaApi'
    ];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Validate database config
    if (!config.database.host || !config.database.port) {
      throw new Error('Invalid database configuration');
    }

    // Validate trading config
    if (config.trading.maxRiskPerTrade > 0.1) {
      throw new Error('maxRiskPerTrade cannot exceed 10%');
    }

    // Validate MetaAPI accounts
    if (!Array.isArray(config.metaApi.accounts) || config.metaApi.accounts.length === 0) {
      throw new Error('At least one MetaAPI account must be configured');
    }

    for (const account of config.metaApi.accounts) {
      if (!account.id || !account.token) {
        throw new Error('MetaAPI account missing required fields');
      }
    }
  }

  /**
   * Load configuration from files and environment
   */
  private loadConfiguration(): void {
    const env = process.env.NODE_ENV || 'development';
    const configDir = path.join(process.cwd(), 'config');
    
    // Load base configuration
    const baseConfigPath = path.join(configDir, 'base.json');
    let config: any = {};
    
    if (fs.existsSync(baseConfigPath)) {
      config = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));
    }

    // Load environment-specific configuration
    const envConfigPath = path.join(configDir, `${env}.json`);
    if (fs.existsSync(envConfigPath)) {
      const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
      config = this.mergeConfigs(config, envConfig);
    }

    // Override with environment variables
    config = this.overrideWithEnvVars(config);

    // Set defaults
    config = this.setDefaults(config);

    // Validate configuration
    this.validateConfiguration(config);

    this.config = config;
  }

  /**
   * Override configuration with environment variables
   */
  private overrideWithEnvVars(config: any): any {
    // Database overrides
    if (process.env.DB_HOST) config.database.host = process.env.DB_HOST;
    if (process.env.DB_PORT) config.database.port = parseInt(process.env.DB_PORT);
    if (process.env.DB_NAME) config.database.database = process.env.DB_NAME;
    if (process.env.DB_USER) config.database.username = process.env.DB_USER;
    if (process.env.DB_PASSWORD) config.database.password = process.env.DB_PASSWORD;

    // Telegram overrides
    if (process.env.TELEGRAM_BOT_TOKEN) {
      config.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
    }

    // MetaAPI overrides
    if (process.env.METAAPI_TOKENS) {
      const tokens = process.env.METAAPI_TOKENS.split(',');
      config.metaApi.accounts = tokens.map((token, index) => ({
        id: `account_${index}`,
        token: token.trim(),
        serverName: process.env.METAAPI_SERVER || 'MetaQuotes-Demo',
        region: process.env.METAAPI_REGION || 'london',
        enabled: true,
        maxRiskPercentage: 2
      }));
    }

    // Monitoring overrides
    if (process.env.SLACK_WEBHOOK) {
      config.monitoring.alertWebhooks.slack = process.env.SLACK_WEBHOOK;
    }

    return config;
  }

  /**
   * Set default values
   */
  private setDefaults(config: any): any {
    return {
      environment: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000'),
      version: process.env.npm_package_version || '1.0.0',
      database: {
        host: 'localhost',
        port: 5432,
        database: 'trading_bot',
        username: 'postgres',
        password: 'password',
        ssl: false,
        connectionTimeout: 10000,
        maxConnections: 10,
        ...config.database
      },
      trading: {
        maxPositionsPerSymbol: 3,
        maxDailyLoss: 500,
        maxRiskPerTrade: 0.02,
        allowedSymbols: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'],
        tradingHours: {
          start: '00:00',
          end: '23:59',
          timezone: 'UTC'
        },
        slippageTolerancePips: 2,
        ...config.trading
      },
      monitoring: {
        metricsPort: 9090,
        healthCheckPort: 8080,
        logLevel: 'info',
        alertWebhooks: {},
        performanceThresholds: {
          cpuUsage: 80,
          memoryUsage: 85,
          responseTime: 5000
        },
        ...config.monitoring
      },
      telegram: {
        botToken: '',
        allowedChannels: [],
        adminUsers: [],
        rateLimit: {
          maxMessages: 100,
          windowMs: 60000
        },
        ...config.telegram
      },
      metaApi: {
        accounts: [],
        timeoutMs: 30000,
        retryAttempts: 3,
        ...config.metaApi
      }
    };
  }

  /**
   * Deep merge configurations
   */
  private mergeConfigs(base: any, override: any): any {
    const result = { ...base };
    
    for (const key in override) {
      if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = this.mergeConfigs(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
    
    return result;
  }

  /**
   * Watch for configuration changes
   */
  private setupConfigWatcher(): void {
    const configDir = path.join(process.cwd(), 'config');
    
    if (fs.existsSync(configDir)) {
      fs.watch(configDir, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          console.log(`Configuration file changed: ${filename}`);
          try {
            this.loadConfiguration();
            this.notifyWatchers();
          } catch (error) {
            console.error('Failed to reload configuration:', error);
          }
        }
      });
    }
  }

  /**
   * Register configuration change watcher
   */
  watchConfig(id: string, callback: (config: AppConfig) => void): void {
    this.watchers.set(id, callback);
  }

  /**
   * Unregister configuration change watcher
   */
  unwatchConfig(id: string): void {
    this.watchers.delete(id);
  }

  /**
   * Notify all watchers of configuration changes
   */
  private notifyWatchers(): void {
    for (const [id, callback] of this.watchers) {
      try {
        callback(this.config);
      } catch (error) {
        console.error(`Configuration watcher ${id} failed:`, error);
      }
    }
  }

  /**
   * Reload configuration manually
   */
  reloadConfiguration(): void {
    this.loadConfiguration();
    this.notifyWatchers();
  }
}
