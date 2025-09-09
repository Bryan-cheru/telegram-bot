/**
 * Metrics Export System - Enterprise-grade monitoring
 * Placeholder for Prometheus/Grafana integration (requires prom-client package)
 */

// Note: Uncomment when prom-client is installed
// import { register, Counter, Histogram, Gauge } from 'prom-client';

// Placeholder interfaces for when prom-client is not installed
interface Counter {
  inc(labels?: any): void;
}
interface Histogram {
  observe(labels: any, value: number): void;
}
interface Gauge {
  set(labels: any, value: number): void;
}
interface Registry {
  metrics(): Promise<string>;
  clear(): void;
}

// Mock implementations
const mockCounter = (): Counter => ({ inc: () => {} });
const mockHistogram = (): Histogram => ({ observe: () => {} });
const mockGauge = (): Gauge => ({ set: () => {} });
const mockRegister: Registry = {
  metrics: async () => '# Metrics disabled - install prom-client to enable',
  clear: () => {}
};

export class MetricsExporter {
  private static instance: MetricsExporter;
  private metricsEnabled: boolean = false;

  // Trading Metrics (using mocks until prom-client is installed)
  private tradesExecuted = mockCounter();
  private tradeExecutionTime = mockHistogram();
  private accountBalance = mockGauge();
  private accountEquity = mockGauge();
  private openPositions = mockGauge();

  // System Metrics
  private signalsReceived = mockCounter();
  private ocrOperations = mockCounter();
  private connectionStatus = mockGauge();

  // Error Metrics  
  private errors = mockCounter();

  // In-memory metrics for basic monitoring
  private inMemoryMetrics = {
    trades: { total: 0, successful: 0, failed: 0 },
    signals: { total: 0 },
    errors: { total: 0 },
    lastUpdated: new Date()
  };

  static getInstance(): MetricsExporter {
    if (!MetricsExporter.instance) {
      MetricsExporter.instance = new MetricsExporter();
    }
    return MetricsExporter.instance;
  }

  /**
   * Record trade execution
   */
  recordTrade(account: string, symbol: string, action: string, success: boolean, executionTimeMs: number): void {
    // Update in-memory metrics
    this.inMemoryMetrics.trades.total++;
    if (success) {
      this.inMemoryMetrics.trades.successful++;
    } else {
      this.inMemoryMetrics.trades.failed++;
    }
    this.inMemoryMetrics.lastUpdated = new Date();

    // Update Prometheus metrics if enabled
    this.tradesExecuted.inc({
      account,
      symbol,
      action,
      status: success ? 'success' : 'failure'
    });

    this.tradeExecutionTime.observe(
      { account, symbol },
      executionTimeMs / 1000
    );
  }

  /**
   * Update account metrics
   */
  updateAccountMetrics(account: string, broker: string, balance: number, equity: number): void {
    this.accountBalance.set({ account, broker }, balance);
    this.accountEquity.set({ account, broker }, equity);
  }

  /**
   * Update position count
   */
  updatePositionCount(account: string, symbol: string, count: number): void {
    this.openPositions.set({ account, symbol }, count);
  }

  /**
   * Record signal received
   */
  recordSignal(channel: string, type: 'photo' | 'text' | 'document'): void {
    this.inMemoryMetrics.signals.total++;
    this.inMemoryMetrics.lastUpdated = new Date();
    this.signalsReceived.inc({ channel, type });
  }

  /**
   * Record OCR operation
   */
  recordOCR(method: string, success: boolean): void {
    this.ocrOperations.inc({ method, success: success.toString() });
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(service: string, account: string, connected: boolean): void {
    this.connectionStatus.set({ service, account }, connected ? 1 : 0);
  }

  /**
   * Record error
   */
  recordError(type: string, component: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    this.inMemoryMetrics.errors.total++;
    this.inMemoryMetrics.lastUpdated = new Date();
    this.errors.inc({ type, component, severity });
  }

  /**
   * Get metrics for Prometheus scraping
   */
  getMetrics(): Promise<string> {
    if (this.metricsEnabled) {
      return mockRegister.metrics();
    }
    
    // Return basic metrics in Prometheus format
    const timestamp = Date.now();
    return Promise.resolve(`
# HELP trading_bot_trades_total Total trades executed
# TYPE trading_bot_trades_total counter
trading_bot_trades_total{status="success"} ${this.inMemoryMetrics.trades.successful} ${timestamp}
trading_bot_trades_total{status="failure"} ${this.inMemoryMetrics.trades.failed} ${timestamp}

# HELP trading_bot_signals_total Total signals received
# TYPE trading_bot_signals_total counter  
trading_bot_signals_total ${this.inMemoryMetrics.signals.total} ${timestamp}

# HELP trading_bot_errors_total Total errors
# TYPE trading_bot_errors_total counter
trading_bot_errors_total ${this.inMemoryMetrics.errors.total} ${timestamp}
    `.trim());
  }

  /**
   * Clear all metrics (for testing)
   */
  clearMetrics(): void {
    this.inMemoryMetrics = {
      trades: { total: 0, successful: 0, failed: 0 },
      signals: { total: 0 },
      errors: { total: 0 },
      lastUpdated: new Date()
    };
    mockRegister.clear();
  }
}
