import { logger } from './logger';
import { RealTimeAlertSystem } from './realTimeAlertSystem';
import * as os from 'os';

interface PerformanceMetrics {
  timestamp: Date;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedMB: number;
    heapTotalMB: number;
  };
  cpu: {
    usage: NodeJS.CpuUsage;
    loadAverage: number[];
    percentUsage?: number;
  };
  system: {
    uptime: number;
    platform: string;
    arch: string;
    totalMemory: number;
    freeMemory: number;
    memoryUsagePercent: number;
  };
  trading: {
    tradesPerMinute: number;
    averageExecutionTime: number;
    failureRate: number;
    activeConnections: number;
    queuedTrades: number;
  };
  network: {
    connectionsActive: number;
    requestsPerMinute: number;
    errorRate: number;
  };
}

/**
 * CRITICAL: Performance monitoring to prevent system overload
 * Tracks memory, CPU, trading metrics to detect issues before they cause crashes
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private alertSystem: RealTimeAlertSystem;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastCpuUsage: NodeJS.CpuUsage;
  private tradingMetrics = {
    tradesExecuted: 0,
    tradesStartTime: Date.now(),
    executionTimes: [] as number[],
    failures: 0,
    activeConnections: 0,
    queuedTrades: 0
  };
  private networkMetrics = {
    connectionsActive: 0,
    requests: 0,
    requestsStartTime: Date.now(),
    errors: 0
  };

  // Performance thresholds
  private readonly MEMORY_WARNING_MB = 300;
  private readonly MEMORY_CRITICAL_MB = 500;
  private readonly CPU_WARNING_PERCENT = 80;
  private readonly CPU_CRITICAL_PERCENT = 95;
  private readonly EXECUTION_TIME_WARNING_MS = 5000;
  private readonly EXECUTION_TIME_CRITICAL_MS = 10000;

  private constructor() {
    this.alertSystem = RealTimeAlertSystem.getInstance();
    this.lastCpuUsage = process.cpuUsage();
    this.startMonitoring();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000);

    logger.info('Performance monitoring started');
  }

  /**
   * CRITICAL: Collect and analyze performance metrics
   */
  private collectMetrics(): void {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage(this.lastCpuUsage);
      const uptime = process.uptime();
      const loadAverage = os.loadavg();

      // Calculate CPU percentage
      const cpuPercent = this.calculateCpuPercent(cpuUsage);
      this.lastCpuUsage = process.cpuUsage();

      // Calculate trading metrics
      const now = Date.now();
      const tradingTimeWindow = now - this.tradingMetrics.tradesStartTime;
      const tradesPerMinute = (this.tradingMetrics.tradesExecuted / tradingTimeWindow) * 60000;
      const averageExecutionTime = this.tradingMetrics.executionTimes.length > 0 ?
        this.tradingMetrics.executionTimes.reduce((a, b) => a + b, 0) / this.tradingMetrics.executionTimes.length : 0;
      const failureRate = this.tradingMetrics.tradesExecuted > 0 ?
        this.tradingMetrics.failures / this.tradingMetrics.tradesExecuted : 0;

      // Calculate network metrics
      const networkTimeWindow = now - this.networkMetrics.requestsStartTime;
      const requestsPerMinute = (this.networkMetrics.requests / networkTimeWindow) * 60000;
      const networkErrorRate = this.networkMetrics.requests > 0 ?
        this.networkMetrics.errors / this.networkMetrics.requests : 0;

      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
          heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        },
        cpu: {
          usage: cpuUsage,
          loadAverage,
          percentUsage: cpuPercent
        },
        system: {
          uptime,
          platform: os.platform(),
          arch: os.arch(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        },
        trading: {
          tradesPerMinute: Math.round(tradesPerMinute * 100) / 100,
          averageExecutionTime: Math.round(averageExecutionTime),
          failureRate: Math.round(failureRate * 10000) / 100, // Percentage with 2 decimal places
          activeConnections: this.tradingMetrics.activeConnections,
          queuedTrades: this.tradingMetrics.queuedTrades
        },
        network: {
          connectionsActive: this.networkMetrics.connectionsActive,
          requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
          errorRate: Math.round(networkErrorRate * 10000) / 100
        }
      };

      // Store metrics (keep last 24 hours)
      this.metrics.push(metrics);
      if (this.metrics.length > 2880) { // 24 hours * 60 minutes * 2 (30-second intervals)
        this.metrics = this.metrics.slice(-2880);
      }

      // Log performance summary
      logger.performance('Performance metrics collected', {
        memoryMB: metrics.memory.heapUsedMB,
        cpuPercent: metrics.cpu.percentUsage,
        tradesPerMin: metrics.trading.tradesPerMinute,
        failureRate: metrics.trading.failureRate,
        uptime: Math.round(uptime / 3600 * 10) / 10 // Hours with 1 decimal
      });

      // Check for performance issues
      this.checkPerformanceThresholds(metrics);

      // Reset counters periodically
      this.resetCountersIfNeeded();

    } catch (error) {
      logger.error('Failed to collect performance metrics', error);
    }
  }

  /**
   * Check performance thresholds and trigger alerts
   */
  private checkPerformanceThresholds(metrics: PerformanceMetrics): void {
    // Memory alerts
    if (metrics.memory.heapUsedMB > this.MEMORY_CRITICAL_MB) {
      this.alertSystem.sendCriticalAlert(
        'PERFORMANCE',
        `Critical memory usage: ${metrics.memory.heapUsedMB}MB`,
        { memory: metrics.memory }
      );
    } else if (metrics.memory.heapUsedMB > this.MEMORY_WARNING_MB) {
      this.alertSystem.sendWarningAlert(
        'PERFORMANCE',
        `High memory usage: ${metrics.memory.heapUsedMB}MB`,
        { memory: metrics.memory }
      );
    }

    // CPU alerts
    if (metrics.cpu.percentUsage && metrics.cpu.percentUsage > this.CPU_CRITICAL_PERCENT) {
      this.alertSystem.sendCriticalAlert(
        'PERFORMANCE',
        `Critical CPU usage: ${metrics.cpu.percentUsage.toFixed(1)}%`,
        { cpu: metrics.cpu }
      );
    } else if (metrics.cpu.percentUsage && metrics.cpu.percentUsage > this.CPU_WARNING_PERCENT) {
      this.alertSystem.sendWarningAlert(
        'PERFORMANCE',
        `High CPU usage: ${metrics.cpu.percentUsage.toFixed(1)}%`,
        { cpu: metrics.cpu }
      );
    }

    // Trading performance alerts
    if (metrics.trading.averageExecutionTime > this.EXECUTION_TIME_CRITICAL_MS) {
      this.alertSystem.sendCriticalAlert(
        'PERFORMANCE',
        `Critical trade execution time: ${metrics.trading.averageExecutionTime}ms`,
        { trading: metrics.trading }
      );
    } else if (metrics.trading.averageExecutionTime > this.EXECUTION_TIME_WARNING_MS) {
      this.alertSystem.sendWarningAlert(
        'PERFORMANCE',
        `Slow trade execution: ${metrics.trading.averageExecutionTime}ms`,
        { trading: metrics.trading }
      );
    }

    // High failure rate alert
    if (metrics.trading.failureRate > 20) { // 20% failure rate
      this.alertSystem.sendWarningAlert(
        'PERFORMANCE',
        `High trade failure rate: ${metrics.trading.failureRate}%`,
        { trading: metrics.trading }
      );
    }

    // System memory alerts
    if (metrics.system.memoryUsagePercent > 90) {
      this.alertSystem.sendCriticalAlert(
        'SYSTEM',
        `Critical system memory usage: ${metrics.system.memoryUsagePercent.toFixed(1)}%`,
        { system: metrics.system }
      );
    }
  }

  /**
   * Record trade execution metrics
   */
  recordTradeExecution(executionTimeMs: number, success: boolean): void {
    this.tradingMetrics.tradesExecuted++;
    this.tradingMetrics.executionTimes.push(executionTimeMs);
    
    if (!success) {
      this.tradingMetrics.failures++;
    }

    // Keep only last 100 execution times
    if (this.tradingMetrics.executionTimes.length > 100) {
      this.tradingMetrics.executionTimes = this.tradingMetrics.executionTimes.slice(-100);
    }
  }

  /**
   * Update connection count
   */
  updateConnectionCount(activeConnections: number): void {
    this.tradingMetrics.activeConnections = activeConnections;
  }

  /**
   * Update queued trades count
   */
  updateQueuedTradesCount(queuedTrades: number): void {
    this.tradingMetrics.queuedTrades = queuedTrades;
  }

  /**
   * Record network request
   */
  recordNetworkRequest(success: boolean): void {
    this.networkMetrics.requests++;
    if (!success) {
      this.networkMetrics.errors++;
    }
  }

  /**
   * Update network connections
   */
  updateNetworkConnections(activeConnections: number): void {
    this.networkMetrics.connectionsActive = activeConnections;
  }

  /**
   * Get current performance snapshot
   */
  getCurrentMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * Get performance metrics for time range
   */
  getMetricsForTimeRange(hoursBack: number = 1): PerformanceMetrics[] {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(hoursBack: number = 24): {
    averageMemoryMB: number;
    peakMemoryMB: number;
    averageCpuPercent: number;
    peakCpuPercent: number;
    totalTrades: number;
    averageExecutionTimeMs: number;
    overallFailureRate: number;
    uptimeHours: number;
  } {
    const recentMetrics = this.getMetricsForTimeRange(hoursBack);
    
    if (recentMetrics.length === 0) {
      return {
        averageMemoryMB: 0,
        peakMemoryMB: 0,
        averageCpuPercent: 0,
        peakCpuPercent: 0,
        totalTrades: 0,
        averageExecutionTimeMs: 0,
        overallFailureRate: 0,
        uptimeHours: 0
      };
    }

    const memoryValues = recentMetrics.map(m => m.memory.heapUsedMB);
    const cpuValues = recentMetrics.map(m => m.cpu.percentUsage || 0);
    
    return {
      averageMemoryMB: Math.round(memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length),
      peakMemoryMB: Math.max(...memoryValues),
      averageCpuPercent: Math.round(cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length * 10) / 10,
      peakCpuPercent: Math.round(Math.max(...cpuValues) * 10) / 10,
      totalTrades: this.tradingMetrics.tradesExecuted,
      averageExecutionTimeMs: Math.round(this.tradingMetrics.executionTimes.reduce((a, b) => a + b, 0) / this.tradingMetrics.executionTimes.length || 0),
      overallFailureRate: Math.round((this.tradingMetrics.failures / this.tradingMetrics.tradesExecuted || 0) * 10000) / 100,
      uptimeHours: Math.round(process.uptime() / 3600 * 10) / 10
    };
  }

  /**
   * Private helper methods
   */
  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    // Convert microseconds to milliseconds and calculate percentage
    const totalCpuTime = (cpuUsage.user + cpuUsage.system) / 1000;
    const interval = 30000; // 30 seconds in milliseconds
    return Math.min(100, (totalCpuTime / interval) * 100);
  }

  private resetCountersIfNeeded(): void {
    const now = Date.now();
    
    // Reset trading metrics every hour
    if (now - this.tradingMetrics.tradesStartTime > 60 * 60 * 1000) {
      this.tradingMetrics = {
        ...this.tradingMetrics,
        tradesExecuted: 0,
        tradesStartTime: now,
        failures: 0
      };
    }

    // Reset network metrics every hour
    if (now - this.networkMetrics.requestsStartTime > 60 * 60 * 1000) {
      this.networkMetrics = {
        ...this.networkMetrics,
        requests: 0,
        requestsStartTime: now,
        errors: 0
      };
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Performance monitoring stopped');
    }
  }

  /**
   * Get health check status
   */
  getHealthStatus(): {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    issues: string[];
    metrics: PerformanceMetrics | null;
  } {
    const current = this.getCurrentMetrics();
    const issues: string[] = [];
    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

    if (!current) {
      return { status: 'CRITICAL', issues: ['No metrics available'], metrics: null };
    }

    // Check memory
    if (current.memory.heapUsedMB > this.MEMORY_CRITICAL_MB) {
      status = 'CRITICAL';
      issues.push(`Critical memory usage: ${current.memory.heapUsedMB}MB`);
    } else if (current.memory.heapUsedMB > this.MEMORY_WARNING_MB) {
      status = status === 'HEALTHY' ? 'WARNING' : status;
      issues.push(`High memory usage: ${current.memory.heapUsedMB}MB`);
    }

    // Check CPU
    if (current.cpu.percentUsage && current.cpu.percentUsage > this.CPU_CRITICAL_PERCENT) {
      status = 'CRITICAL';
      issues.push(`Critical CPU usage: ${current.cpu.percentUsage.toFixed(1)}%`);
    } else if (current.cpu.percentUsage && current.cpu.percentUsage > this.CPU_WARNING_PERCENT) {
      status = status === 'HEALTHY' ? 'WARNING' : status;
      issues.push(`High CPU usage: ${current.cpu.percentUsage.toFixed(1)}%`);
    }

    // Check trading performance
    if (current.trading.failureRate > 20) {
      status = status === 'HEALTHY' ? 'WARNING' : status;
      issues.push(`High failure rate: ${current.trading.failureRate}%`);
    }

    return { status, issues, metrics: current };
  }
}
