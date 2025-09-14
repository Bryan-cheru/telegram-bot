/**
 * Simple Configuration Management for Enterprise Integration
 * Lightweight version that works with your existing config system
 */

export interface EnterpriseConfig {
  monitoring: {
    healthCheckEnabled: boolean;
    metricsEnabled: boolean;
    tracingEnabled: boolean;
    alerting: {
      slack?: string;
      email?: string[];
    };
  };
  trading: {
    maxConcurrentTrades: number;
    riskManagement: {
      maxRiskPerTrade: number;
      maxDailyLoss: number;
    };
  };
  system: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    environment: 'development' | 'staging' | 'production';
  };
}

export class SimpleConfigManager {
  private static instance: SimpleConfigManager;
  private config: EnterpriseConfig;

  private constructor() {
    this.config = this.loadDefaultConfig();
    this.overrideWithEnvVars();
  }

  static getInstance(): SimpleConfigManager {
    if (!SimpleConfigManager.instance) {
      SimpleConfigManager.instance = new SimpleConfigManager();
    }
    return SimpleConfigManager.instance;
  }

  getConfig(): EnterpriseConfig {
    return this.config;
  }

  getMonitoringConfig() {
    return this.config.monitoring;
  }

  getTradingConfig() {
    return this.config.trading;
  }

  getSystemConfig() {
    return this.config.system;
  }

  private loadDefaultConfig(): EnterpriseConfig {
    return {
      monitoring: {
        healthCheckEnabled: true,
        metricsEnabled: false, // Disabled until prom-client is installed
        tracingEnabled: true,
        alerting: {
          slack: undefined,
          email: []
        }
      },
      trading: {
        maxConcurrentTrades: 10,
        riskManagement: {
          maxRiskPerTrade: 0.02, // 2%
          maxDailyLoss: 500 // $500
        }
      },
      system: {
        logLevel: 'info',
        environment: (process.env.NODE_ENV as any) || 'development'
      }
    };
  }

  private overrideWithEnvVars(): void {
    // System overrides
    if (process.env.LOG_LEVEL) {
      this.config.system.logLevel = process.env.LOG_LEVEL as any;
    }

    // Trading overrides
    if (process.env.MAX_RISK_PER_TRADE) {
      this.config.trading.riskManagement.maxRiskPerTrade = parseFloat(process.env.MAX_RISK_PER_TRADE);
    }

    if (process.env.MAX_DAILY_LOSS) {
      this.config.trading.riskManagement.maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS);
    }

    // Monitoring overrides
    if (process.env.SLACK_WEBHOOK) {
      this.config.monitoring.alerting.slack = process.env.SLACK_WEBHOOK;
    }

    if (process.env.ALERT_EMAILS) {
      this.config.monitoring.alerting.email = process.env.ALERT_EMAILS.split(',').map(e => e.trim());
    }

    // Feature flags
    this.config.monitoring.healthCheckEnabled = process.env.HEALTH_CHECKS !== 'false';
    this.config.monitoring.tracingEnabled = process.env.TRACING !== 'false';
    this.config.monitoring.metricsEnabled = process.env.METRICS === 'true';
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<EnterpriseConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
