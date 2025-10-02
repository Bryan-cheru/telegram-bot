/**
 * Environment Configuration Service
 * Centralized management of environment variables and configuration
 * Part of Phase 6: Code Cleanup & Optimization - Removing hardcoded values
 */

import { logger } from '../utils/logger';

export interface EnvironmentConfig {
  // Database
  mongoUri: string;
  dbName: string;
  
  // Telegram Bot
  telegramBotToken: string;
  telegramWebhookUrl?: string;
  
  // MetaAPI
  metaApiToken: string;
  metaApiUrl?: string;
  
  // Server Configuration
  port: number;
  nodeEnv: string;
  
  // API Keys
  newsApiKey?: string;
  alphavantageApiKey?: string;
  
  // Trading Defaults
  defaultRiskPercentage: number;
  defaultRiskRewardRatio: number;
  maxDailyTrades: number;
  
  // OCR Configuration  
  tesseractDataPath?: string;
  
  // Monitoring & Logging
  logLevel: string;
  enableMetrics: boolean;
  sentryDsn?: string;
  
  // Security
  jwtSecret?: string;
  encryptionKey?: string;
  
  // Rate Limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  
  // Cache Configuration
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
}

/**
 * Service for managing environment variables and application configuration
 */
export class EnvironmentConfigService {
  private static instance: EnvironmentConfigService;
  private config: EnvironmentConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  public static getInstance(): EnvironmentConfigService {
    if (!EnvironmentConfigService.instance) {
      EnvironmentConfigService.instance = new EnvironmentConfigService();
    }
    return EnvironmentConfigService.instance;
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): EnvironmentConfig {
    return {
      // Database Configuration
      mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/telegram-trading-bot',
      dbName: process.env.DB_NAME || 'telegram-trading-bot',
      
      // Telegram Bot Configuration
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
      
      // MetaAPI Configuration
      metaApiToken: process.env.METAAPI_TOKEN || '',
      metaApiUrl: process.env.METAAPI_URL || 'https://mt-client-api-v1.london.agiliumtrade.ai',
      
      // Server Configuration
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
      
      // API Keys
      newsApiKey: process.env.NEWS_API_KEY,
      alphavantageApiKey: process.env.ALPHAVANTAGE_API_KEY,
      
      // Trading Defaults (configurable via environment)
      defaultRiskPercentage: parseFloat(process.env.DEFAULT_RISK_PERCENTAGE || '0.45'),
      defaultRiskRewardRatio: parseFloat(process.env.DEFAULT_RISK_REWARD_RATIO || '1.0'),
      maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '10', 10),
      
      // OCR Configuration
      tesseractDataPath: process.env.TESSDATA_PREFIX || './eng.traineddata',
      
      // Monitoring & Logging
      logLevel: process.env.LOG_LEVEL || 'info',
      enableMetrics: process.env.ENABLE_METRICS === 'true',
      sentryDsn: process.env.SENTRY_DSN,
      
      // Security
      jwtSecret: process.env.JWT_SECRET,
      encryptionKey: process.env.ENCRYPTION_KEY,
      
      // Rate Limiting
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      
      // Cache Configuration
      cacheEnabled: process.env.CACHE_ENABLED !== 'false',
      cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300', 10) // 5 minutes
    };
  }

  /**
   * Validate required configuration
   */
  private validateConfiguration(): void {
    const requiredVars: (keyof EnvironmentConfig)[] = [
      'telegramBotToken',
      'metaApiToken',
      'mongoUri'
    ];

    const missingVars: string[] = [];

    for (const key of requiredVars) {
      if (!this.config[key]) {
        missingVars.push(key);
      }
    }

    if (missingVars.length > 0) {
      logger.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
      
      // Log configuration template for user
      logger.info('📝 Required environment variables:');
      logger.info('TELEGRAM_BOT_TOKEN=your_telegram_bot_token');
      logger.info('METAAPI_TOKEN=your_metaapi_token');
      logger.info('MONGODB_URI=mongodb://localhost:27017/telegram-trading-bot');
      
      if (this.config.nodeEnv === 'production') {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      } else {
        logger.warn('⚠️ Running in development mode with missing environment variables');
      }
    }

    logger.info('✅ Environment configuration loaded successfully');
  }

  /**
   * Get the complete configuration
   */
  getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  /**
   * Get specific configuration value
   */
  get<T extends keyof EnvironmentConfig>(key: T): EnvironmentConfig[T] {
    return this.config[key];
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return {
      mongoUri: this.config.mongoUri,
      dbName: this.config.dbName
    };
  }

  /**
   * Get telegram bot configuration
   */
  getTelegramConfig() {
    return {
      botToken: this.config.telegramBotToken,
      webhookUrl: this.config.telegramWebhookUrl
    };
  }

  /**
   * Get MetaAPI configuration
   */
  getMetaApiConfig() {
    return {
      token: this.config.metaApiToken,
      url: this.config.metaApiUrl
    };
  }

  /**
   * Get server configuration
   */
  getServerConfig() {
    return {
      port: this.config.port,
      nodeEnv: this.config.nodeEnv
    };
  }

  /**
   * Get trading defaults
   */
  getTradingDefaults() {
    return {
      riskPercentage: this.config.defaultRiskPercentage,
      riskRewardRatio: this.config.defaultRiskRewardRatio,
      maxDailyTrades: this.config.maxDailyTrades
    };
  }

  /**
   * Get API keys
   */
  getApiKeys() {
    return {
      newsApi: this.config.newsApiKey,
      alphavantage: this.config.alphavantageApiKey
    };
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimitConfig() {
    return {
      windowMs: this.config.rateLimitWindowMs,
      maxRequests: this.config.rateLimitMaxRequests
    };
  }

  /**
   * Get cache configuration
   */
  getCacheConfig() {
    return {
      enabled: this.config.cacheEnabled,
      ttlSeconds: this.config.cacheTtlSeconds
    };
  }

  /**
   * Update configuration at runtime (for testing or dynamic updates)
   */
  updateConfig(updates: Partial<EnvironmentConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('⚙️ Configuration updated:', Object.keys(updates));
  }

  /**
   * Get environment status for health checks
   */
  getHealthStatus() {
    return {
      environment: this.config.nodeEnv,
      port: this.config.port,
      database: {
        connected: !!this.config.mongoUri,
        name: this.config.dbName
      },
      telegram: {
        configured: !!this.config.telegramBotToken
      },
      metaapi: {
        configured: !!this.config.metaApiToken
      },
      apis: {
        newsApi: !!this.config.newsApiKey,
        alphavantage: !!this.config.alphavantageApiKey
      },
      cache: {
        enabled: this.config.cacheEnabled,
        ttl: this.config.cacheTtlSeconds
      }
    };
  }

  /**
   * Generate .env template
   */
  generateEnvTemplate(): string {
    return `
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/telegram-trading-bot
DB_NAME=telegram-trading-bot

# Telegram Bot (Required)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook

# MetaAPI (Required)  
METAAPI_TOKEN=your_metaapi_token_here
METAAPI_URL=https://mt-client-api-v1.london.agiliumtrade.ai

# Server Configuration
PORT=3000
NODE_ENV=development

# Trading Defaults
DEFAULT_RISK_PERCENTAGE=0.45
DEFAULT_RISK_REWARD_RATIO=1.0
MAX_DAILY_TRADES=10

# API Keys (Optional)
NEWS_API_KEY=your_news_api_key
ALPHAVANTAGE_API_KEY=your_alphavantage_key

# Monitoring & Logging
LOG_LEVEL=info
ENABLE_METRICS=false
SENTRY_DSN=your_sentry_dsn

# Security (Optional)
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Cache Configuration
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300

# OCR Configuration
TESSDATA_PREFIX=./eng.traineddata
`.trim();
  }
}

// Export singleton instance
export const envConfig = EnvironmentConfigService.getInstance();