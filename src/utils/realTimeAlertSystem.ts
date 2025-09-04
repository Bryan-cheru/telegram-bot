import { logger } from './logger';
import { enhancedLogger } from './enhancedLogger';

interface Alert {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  category: 'TRADE' | 'SYSTEM' | 'CONNECTION' | 'VALIDATION' | 'PERFORMANCE';
  message: string;
  details?: any;
  timestamp: Date;
  accountId?: string;
  symbol?: string;
  acknowledged: boolean;
  resolved: boolean;
}

interface AlertRule {
  id: string;
  name: string;
  type: 'THRESHOLD' | 'PATTERN' | 'FREQUENCY';
  enabled: boolean;
  conditions: any;
  actions: AlertAction[];
}

interface AlertAction {
  type: 'TELEGRAM' | 'EMAIL' | 'WEBHOOK' | 'LOG' | 'STOP_TRADING';
  config: any;
  enabled: boolean;
}

interface AlertMetrics {
  totalAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  alertsByCategory: Record<string, number>;
  recentAlerts: Alert[];
}

/**
 * CRITICAL: Real-time alert system for production monitoring
 * Detects dangerous conditions and notifies operators immediately
 */
export class RealTimeAlertSystem {
  private static instance: RealTimeAlertSystem;
  private alerts = new Map<string, Alert>();
  private alertRules: AlertRule[] = [];
  private alertHistory: Alert[] = [];
  private telegramNotifier?: any; // Telegram bot instance for alerts
  private webhookUrls: string[] = [];
  private alertCounter = 0;
  private lastAlertTime = new Map<string, Date>();

  // Rate limiting to prevent alert spam
  private readonly RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ALERTS_PER_WINDOW = 10;

  private constructor() {
    this.initializeDefaultRules();
    this.setupWebhooks();
  }

  static getInstance(): RealTimeAlertSystem {
    if (!RealTimeAlertSystem.instance) {
      RealTimeAlertSystem.instance = new RealTimeAlertSystem();
    }
    return RealTimeAlertSystem.instance;
  }

  /**
   * CRITICAL: Send immediate alert for dangerous conditions
   */
  async sendCriticalAlert(
    category: Alert['category'],
    message: string,
    details?: any,
    accountId?: string,
    symbol?: string
  ): Promise<void> {
    const alert = this.createAlert('CRITICAL', category, message, details, accountId, symbol);
    
    enhancedLogger.error(`🚨 CRITICAL ALERT: ${message}`, {
      category,
      accountId,
      symbol,
      details,
      alertId: alert.id
    });

    // Execute all critical alert actions immediately
    await this.executeAlertActions(alert, this.getCriticalActions());
    
    // Store alert
    this.alerts.set(alert.id, alert);
    this.alertHistory.push(alert);
    
    // Trigger emergency actions for specific critical alerts
    this.handleCriticalAlertActions(alert);
  }

  /**
   * Send warning alert
   */
  async sendWarningAlert(
    category: Alert['category'],
    message: string,
    details?: any,
    accountId?: string,
    symbol?: string
  ): Promise<void> {
    // Check rate limiting for warnings
    if (this.isRateLimited(`WARNING_${category}`)) {
      return;
    }

    const alert = this.createAlert('WARNING', category, message, details, accountId, symbol);
    
    enhancedLogger.warn(`⚠️ WARNING ALERT: ${message}`, {
      category,
      accountId,
      symbol,
      details,
      alertId: alert.id
    });

    await this.executeAlertActions(alert, this.getWarningActions());
    
    this.alerts.set(alert.id, alert);
    this.alertHistory.push(alert);
  }

  /**
   * Send informational alert
   */
  async sendInfoAlert(
    category: Alert['category'],
    message: string,
    details?: any,
    accountId?: string,
    symbol?: string
  ): Promise<void> {
    // Info alerts are heavily rate limited
    if (this.isRateLimited(`INFO_${category}`, 10 * 60 * 1000)) { // 10 minutes
      return;
    }

    const alert = this.createAlert('INFO', category, message, details, accountId, symbol);
    
    enhancedLogger.info(`ℹ️ INFO ALERT: ${message}`, {
      category,
      accountId,
      symbol,
      alertId: alert.id
    });

    await this.executeAlertActions(alert, this.getInfoActions());
    
    this.alerts.set(alert.id, alert);
    this.alertHistory.push(alert);
  }

  /**
   * CRITICAL: Monitor trading metrics and trigger alerts
   */
  monitorTradingMetrics(metrics: {
    dailyTrades: number;
    dailyLoss: number;
    currentDrawdown: number;
    accountBalance: number;
    equity: number;
    margin: number;
    marginLevel: number;
    openPositions: number;
    failedTrades: number;
    successRate: number;
  }): void {
    // Critical: Margin level too low
    if (metrics.marginLevel < 100 && metrics.marginLevel > 0) {
      this.sendCriticalAlert(
        'TRADE',
        `Margin call risk: Margin level ${metrics.marginLevel}%`,
        { marginLevel: metrics.marginLevel, equity: metrics.equity, margin: metrics.margin }
      );
    }

    // Critical: Daily loss limit approaching
    const dailyLossLimit = parseFloat(process.env.MAX_DAILY_LOSS || '500');
    if (Math.abs(metrics.dailyLoss) > dailyLossLimit * 0.8) {
      this.sendWarningAlert(
        'TRADE',
        `Daily loss approaching limit: $${Math.abs(metrics.dailyLoss)} of $${dailyLossLimit}`,
        { dailyLoss: metrics.dailyLoss, limit: dailyLossLimit }
      );
    }

    // Critical: Drawdown exceeding limits
    const maxDrawdown = parseFloat(process.env.MAX_DRAWDOWN_PERCENTAGE || '10');
    const drawdownPercent = (metrics.currentDrawdown / metrics.accountBalance) * 100;
    if (drawdownPercent > maxDrawdown) {
      this.sendCriticalAlert(
        'TRADE',
        `Drawdown limit exceeded: ${drawdownPercent.toFixed(2)}% > ${maxDrawdown}%`,
        { currentDrawdown: metrics.currentDrawdown, accountBalance: metrics.accountBalance }
      );
    }

    // Warning: Low success rate
    if (metrics.successRate < 0.4 && metrics.dailyTrades > 5) {
      this.sendWarningAlert(
        'TRADE',
        `Low success rate: ${(metrics.successRate * 100).toFixed(1)}%`,
        { successRate: metrics.successRate, trades: metrics.dailyTrades, failed: metrics.failedTrades }
      );
    }

    // Warning: Too many open positions
    if (metrics.openPositions > 10) {
      this.sendWarningAlert(
        'TRADE',
        `High number of open positions: ${metrics.openPositions}`,
        { openPositions: metrics.openPositions }
      );
    }
  }

  /**
   * Monitor system health
   */
  monitorSystemHealth(health: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage?: NodeJS.CpuUsage;
    lastHeartbeat: Date;
    connectionStatus: Record<string, boolean>;
    errorRate: number;
  }): void {
    // Critical: High memory usage
    const heapUsedMB = health.memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 500) { // 500MB threshold
      this.sendCriticalAlert(
        'SYSTEM',
        `High memory usage: ${heapUsedMB.toFixed(1)}MB`,
        { memoryUsage: health.memoryUsage }
      );
    }

    // Critical: No recent heartbeat
    const timeSinceHeartbeat = Date.now() - health.lastHeartbeat.getTime();
    if (timeSinceHeartbeat > 5 * 60 * 1000) { // 5 minutes
      this.sendCriticalAlert(
        'SYSTEM',
        `System unresponsive: No heartbeat for ${Math.round(timeSinceHeartbeat / 60000)} minutes`,
        { timeSinceHeartbeat, lastHeartbeat: health.lastHeartbeat }
      );
    }

    // Critical: Connection failures
    for (const [service, isConnected] of Object.entries(health.connectionStatus)) {
      if (!isConnected) {
        this.sendCriticalAlert(
          'CONNECTION',
          `Service disconnected: ${service}`,
          { service, connectionStatus: health.connectionStatus }
        );
      }
    }

    // Warning: High error rate
    if (health.errorRate > 0.1) { // 10% error rate
      this.sendWarningAlert(
        'SYSTEM',
        `High error rate: ${(health.errorRate * 100).toFixed(1)}%`,
        { errorRate: health.errorRate }
      );
    }
  }

  /**
   * Set up Telegram notifications
   */
  setTelegramNotifier(bot: any, adminChatId: string): void {
    this.telegramNotifier = {
      bot,
      adminChatId
    };
    enhancedLogger.info('Telegram alert notifications enabled', { adminChatId });
  }

  /**
   * Add webhook URL for alerts
   */
  addWebhook(url: string): void {
    this.webhookUrls.push(url);
    enhancedLogger.info('Webhook added for alerts', { url });
  }

  /**
   * Get current alert metrics
   */
  getAlertMetrics(): AlertMetrics {
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAlerts = this.alertHistory.filter(alert => alert.timestamp > recentCutoff);
    
    const alertsByCategory: Record<string, number> = {};
    recentAlerts.forEach(alert => {
      alertsByCategory[alert.category] = (alertsByCategory[alert.category] || 0) + 1;
    });

    return {
      totalAlerts: recentAlerts.length,
      criticalAlerts: recentAlerts.filter(a => a.type === 'CRITICAL').length,
      warningAlerts: recentAlerts.filter(a => a.type === 'WARNING').length,
      alertsByCategory,
      recentAlerts: recentAlerts.slice(-10) // Last 10 alerts
    };
  }

  /**
   * Acknowledge alert (mark as seen)
   */
  acknowledgeAlert(alertId: string, userId?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      enhancedLogger.info('Alert acknowledged', { alertId, userId });
      return true;
    }
    return false;
  }

  /**
   * Resolve alert (mark as fixed)
   */
  resolveAlert(alertId: string, userId?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.acknowledged = true;
      enhancedLogger.info('Alert resolved', { alertId, userId });
      return true;
    }
    return false;
  }

  /**
   * Private helper methods
   */
  private createAlert(
    type: Alert['type'],
    category: Alert['category'],
    message: string,
    details?: any,
    accountId?: string,
    symbol?: string
  ): Alert {
    return {
      id: `alert_${++this.alertCounter}_${Date.now()}`,
      type,
      category,
      message,
      details,
      timestamp: new Date(),
      accountId,
      symbol,
      acknowledged: false,
      resolved: false
    };
  }

  private async executeAlertActions(alert: Alert, actions: AlertAction[]): Promise<void> {
    for (const action of actions) {
      if (!action.enabled) continue;

      try {
        switch (action.type) {
          case 'TELEGRAM':
            await this.sendTelegramAlert(alert);
            break;
          case 'WEBHOOK':
            await this.sendWebhookAlert(alert);
            break;
          case 'STOP_TRADING':
            await this.triggerTradingStop(alert);
            break;
          case 'LOG':
            // Already logged above
            break;
        }
      } catch (error) {
        enhancedLogger.error('Failed to execute alert action', { action: action.type, error });
      }
    }
  }

  private async sendTelegramAlert(alert: Alert): Promise<void> {
    if (!this.telegramNotifier) return;

    const emoji = alert.type === 'CRITICAL' ? '🚨' : alert.type === 'WARNING' ? '⚠️' : 'ℹ️';
    const message = `${emoji} *${alert.type} ALERT*\n\n` +
                   `*Category:* ${alert.category}\n` +
                   `*Message:* ${alert.message}\n` +
                   `*Time:* ${alert.timestamp.toISOString()}\n` +
                   (alert.accountId ? `*Account:* ${alert.accountId}\n` : '') +
                   (alert.symbol ? `*Symbol:* ${alert.symbol}\n` : '') +
                   `*Alert ID:* ${alert.id}`;

    await this.telegramNotifier.bot.sendMessage(
      this.telegramNotifier.adminChatId,
      message,
      { parse_mode: 'Markdown' }
    );
  }

  private async sendWebhookAlert(alert: Alert): Promise<void> {
    const payload = {
      alert,
      timestamp: new Date().toISOString(),
      source: 'telegram-trading-bot'
    };

    for (const url of this.webhookUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'telegram-trading-bot-alerts'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        enhancedLogger.error('Webhook alert failed', { url, error });
      }
    }
  }

  private async triggerTradingStop(alert: Alert): Promise<void> {
    // This would integrate with the trading system to stop all trading
    enhancedLogger.error('🚨 EMERGENCY TRADING STOP TRIGGERED', { alert: alert.id, reason: alert.message });
    
    // Set environment variable to stop trading
    process.env.EMERGENCY_STOP = 'true';
    process.env.EMERGENCY_STOP_REASON = alert.message;
    process.env.EMERGENCY_STOP_TIME = new Date().toISOString();
  }

  private isRateLimited(key: string, windowMs: number = this.RATE_LIMIT_WINDOW): boolean {
    const lastAlert = this.lastAlertTime.get(key);
    const now = new Date();
    
    if (lastAlert && (now.getTime() - lastAlert.getTime()) < windowMs) {
      return true;
    }
    
    this.lastAlertTime.set(key, now);
    return false;
  }

  private getCriticalActions(): AlertAction[] {
    return [
      { type: 'LOG', config: {}, enabled: true },
      { type: 'TELEGRAM', config: {}, enabled: !!this.telegramNotifier },
      { type: 'WEBHOOK', config: {}, enabled: this.webhookUrls.length > 0 }
    ];
  }

  private getWarningActions(): AlertAction[] {
    return [
      { type: 'LOG', config: {}, enabled: true },
      { type: 'TELEGRAM', config: {}, enabled: !!this.telegramNotifier }
    ];
  }

  private getInfoActions(): AlertAction[] {
    return [
      { type: 'LOG', config: {}, enabled: true }
    ];
  }

  private handleCriticalAlertActions(alert: Alert): void {
    // Additional critical alert handling
    if (alert.category === 'TRADE' && alert.message.includes('Margin call')) {
      this.triggerTradingStop(alert);
    }
  }

  private initializeDefaultRules(): void {
    // Default alert rules would be configured here
    enhancedLogger.info('Alert system initialized with default rules');
  }

  private setupWebhooks(): void {
    // Load webhook URLs from environment
    const webhookUrls = process.env.ALERT_WEBHOOKS;
    if (webhookUrls) {
      this.webhookUrls = webhookUrls.split(',').map(url => url.trim());
      enhancedLogger.info('Webhook URLs configured', { count: this.webhookUrls.length });
    }
  }

  /**
   * Cleanup old alerts
   */
  cleanup(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Remove old acknowledged/resolved alerts
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.timestamp < cutoff) {
        this.alerts.delete(id);
      }
    }

    // Trim alert history
    this.alertHistory = this.alertHistory
      .filter(alert => alert.timestamp > cutoff)
      .slice(-1000); // Keep last 1000 alerts
  }
}
