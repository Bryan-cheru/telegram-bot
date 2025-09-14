/**
 * Health Check System - Missing from your current implementation
 * Industry standard for production monitoring
 */

import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performanceMonitor';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  responseTime?: number;
  details?: any;
  error?: string;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: HealthCheck[];
  uptime: number;
  version: string;
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private healthChecks: Map<string, () => Promise<HealthCheck>> = new Map();
  
  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Register a health check
   */
  registerHealthCheck(name: string, checkFunction: () => Promise<HealthCheck>): void {
    this.healthChecks.set(name, checkFunction);
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<SystemHealth> {
    const checks: HealthCheck[] = [];
    
    for (const [name, checkFn] of this.healthChecks) {
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise<HealthCheck>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        checks.push(result);
      } catch (error) {
        checks.push({
          name,
          status: 'unhealthy',
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Determine overall system status
    const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
    const hasDegraded = checks.some(c => c.status === 'degraded');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (hasUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp: new Date(),
      services: checks,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Setup default health checks for your trading bot
   */
  setupDefaultHealthChecks(): void {
    // MetaAPI Connection Health
    this.registerHealthCheck('metaapi', async (): Promise<HealthCheck> => {
      const startTime = Date.now();
      // Add your MetaAPI connection check logic here
      
      return {
        name: 'metaapi',
        status: 'healthy', // Replace with actual check
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        details: { connectedAccounts: 5 } // Replace with actual data
      };
    });

    // Telegram Bot Health
    this.registerHealthCheck('telegram', async (): Promise<HealthCheck> => {
      const startTime = Date.now();
      // Add your Telegram bot check logic here
      
      return {
        name: 'telegram',
        status: 'healthy', // Replace with actual check
        timestamp: new Date(),
        responseTime: Date.now() - startTime
      };
    });

    // Database Health (for your crash recovery DB)
    this.registerHealthCheck('database', async (): Promise<HealthCheck> => {
      const startTime = Date.now();
      // Add your database check logic here
      
      return {
        name: 'database',
        status: 'healthy',
        timestamp: new Date(),
        responseTime: Date.now() - startTime
      };
    });

    // Performance Health
    this.registerHealthCheck('performance', async (): Promise<HealthCheck> => {
      const monitor = PerformanceMonitor.getInstance();
      const health = monitor.getHealthStatus();
      
      return {
        name: 'performance',
        status: health.status === 'HEALTHY' ? 'healthy' : 
                health.status === 'WARNING' ? 'degraded' : 'unhealthy',
        timestamp: new Date(),
        details: {
          issues: health.issues,
          metrics: health.metrics
        }
      };
    });
  }

  /**
   * Get overall system health status
   */
  async getOverallHealth(): Promise<{ status: string; timestamp: string; checks: any[] }> {
    const systemHealth = await this.runHealthChecks();

    return {
      status: systemHealth.status,
      timestamp: systemHealth.timestamp.toISOString(),
      checks: systemHealth.services
    };
  }

  /**
   * Get detailed health information
   */
  async getDetailedHealth(): Promise<any> {
    const overallHealth = await this.getOverallHealth();
    const systemInfo = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    };

    return {
      ...overallHealth,
      system: systemInfo,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check if system is ready to serve traffic
   */
  isReady(): boolean {
    // System ready after 10 seconds uptime
    return process.uptime() > 10;
  }
}
