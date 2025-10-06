/**
 * Security Configuration
 * Centralized security settings and validation
 */

import { logger } from '../utils/logger';

export interface SecurityConfig {
  riskManagement: {
    maxRiskPercent: number;
    recommendedRiskPercent: number;
    maxDrawdownPercent: number;
    maxPositionsPerAccount: number;
  };
  rateLimiting: {
    trading: {
      windowMs: number;
      maxRequests: number;
    };
    api: {
      windowMs: number;
      maxRequests: number;
    };
  };
  database: {
    connectionTimeoutMs: number;
    maxPoolSize: number;
    minPoolSize: number;
  };
}

class SecurityConfigService {
  private static instance: SecurityConfigService;
  private config: SecurityConfig;

  private constructor() {
    this.config = this.loadSecurityConfig();
    this.validateConfiguration();
  }

  static getInstance(): SecurityConfigService {
    if (!SecurityConfigService.instance) {
      SecurityConfigService.instance = new SecurityConfigService();
    }
    return SecurityConfigService.instance;
  }

  private loadSecurityConfig(): SecurityConfig {
    return {
      // JWT authentication removed - trading-only system
      riskManagement: {
        maxRiskPercent: parseFloat(process.env.MAX_RISK_PERCENT || '2.0'),
        recommendedRiskPercent: parseFloat(process.env.RECOMMENDED_RISK_PERCENT || '0.5'),
        maxDrawdownPercent: parseFloat(process.env.MAX_DRAWDOWN_PERCENT || '10.0'),
        maxPositionsPerAccount: parseInt(process.env.MAX_POSITIONS_PER_ACCOUNT || '5')
      },
      rateLimiting: {
        trading: {
          windowMs: parseInt(process.env.TRADING_RATE_WINDOW_MS || '60000'), // 1 minute
          maxRequests: parseInt(process.env.TRADING_MAX_REQUESTS || '10')
        },
        api: {
          windowMs: parseInt(process.env.API_RATE_WINDOW_MS || '900000'), // 15 minutes
          maxRequests: parseInt(process.env.API_MAX_REQUESTS || '100')
        },

      },
      database: {
        connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '15000'),
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '5'),
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '1')
      }
    };
  }

  private validateConfiguration(): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    // JWT authentication removed from trading-only system

    // Risk management validation
    if (this.config.riskManagement.maxRiskPercent > 5.0) {
      errors.push('MAX_RISK_PERCENT cannot exceed 5.0% for safety');
    }
    if (this.config.riskManagement.maxRiskPercent > 2.0) {
      warnings.push('MAX_RISK_PERCENT above 2.0% is considered high risk');
    }
    if (this.config.riskManagement.recommendedRiskPercent > this.config.riskManagement.maxRiskPercent) {
      errors.push('RECOMMENDED_RISK_PERCENT cannot exceed MAX_RISK_PERCENT');
    }

    // Rate limiting validation
    if (this.config.rateLimiting.trading.maxRequests > 50) {
      warnings.push('High trading rate limit may overwhelm broker API');
    }

    // Log results
    if (errors.length > 0) {
      logger.error('🚨 Security configuration errors:', errors);
      throw new Error(`Security configuration invalid: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      logger.warn('⚠️ Security configuration warnings:', warnings);
    }

    logger.info('✅ Security configuration validated successfully');
  }

  getConfig(): SecurityConfig {
    return { ...this.config }; // Return copy to prevent mutation
  }

  getRiskConfig() {
    return { ...this.config.riskManagement };
  }



  getRateLimitConfig() {
    return { ...this.config.rateLimiting };
  }

  getDatabaseConfig() {
    return { ...this.config.database };
  }

  /**
   * Validate risk percentage against configuration
   */
  validateRiskPercentage(riskPercent: number): { 
    valid: boolean; 
    error?: string; 
    warning?: string; 
  } {
    if (isNaN(riskPercent) || riskPercent <= 0) {
      return { valid: false, error: 'Risk percentage must be a positive number' };
    }

    if (riskPercent > this.config.riskManagement.maxRiskPercent) {
      return { 
        valid: false, 
        error: `Risk percentage cannot exceed ${this.config.riskManagement.maxRiskPercent}%` 
      };
    }

    if (riskPercent > this.config.riskManagement.recommendedRiskPercent) {
      return { 
        valid: true, 
        warning: `Risk above ${this.config.riskManagement.recommendedRiskPercent}% is not recommended. Consider using ${this.config.riskManagement.recommendedRiskPercent}% or lower.` 
      };
    }

      return { valid: true };
  }
}

// Create and export singleton instance
export const securityConfig = SecurityConfigService.getInstance();