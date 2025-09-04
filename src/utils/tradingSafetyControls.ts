import { logger } from './logger';
import { TradeSignal } from '../types';

export interface SafetyLimits {
  maxPositionSize: number;        // Maximum lot size per trade
  maxDailyLoss: number;          // Maximum daily loss in account currency
  maxDailyTrades: number;        // Maximum number of trades per day
  maxRiskPercentage: number;     // Maximum risk per trade as percentage of account
  minAccountBalance: number;     // Minimum account balance required to trade
  maxDrawdownPercentage: number; // Maximum drawdown before stopping
}

export interface TradingState {
  dailyTrades: number;
  dailyLoss: number;
  currentDrawdown: number;
  lastTradeTime: Date;
}

export class TradingSafetyControls {
  private static instance: TradingSafetyControls;
  private limits: SafetyLimits;
  private state: TradingState;
  private tradeHistory: Array<{ timestamp: Date; pnl: number; volume: number }> = [];
  private resetTimeout: NodeJS.Timeout | null = null;
  private dailyResetInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Default safety limits - should be configurable
    this.limits = {
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '1.0'),
      maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '500'),
      maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '10'),
      maxRiskPercentage: parseFloat(process.env.MAX_RISK_PERCENTAGE || '2.0'),
      minAccountBalance: parseFloat(process.env.MIN_ACCOUNT_BALANCE || '1000'),
      maxDrawdownPercentage: parseFloat(process.env.MAX_DRAWDOWN_PERCENTAGE || '10.0')
    };

    this.state = {
      dailyTrades: 0,
      dailyLoss: 0,
      currentDrawdown: 0,
      lastTradeTime: new Date(0)
    };

    // Reset daily counters at midnight
    this.scheduleReset();
  }

  static getInstance(): TradingSafetyControls {
    if (!TradingSafetyControls.instance) {
      TradingSafetyControls.instance = new TradingSafetyControls();
    }
    return TradingSafetyControls.instance;
  }

  /**
   * Validate if a trade can be executed based on safety limits
   */
  validateTrade(signal: TradeSignal, accountBalance: number, proposedVolume: number): {
    canTrade: boolean;
    reason?: string;
    adjustedVolume?: number;
  } {
    try {
      // Check minimum account balance
      if (accountBalance < this.limits.minAccountBalance) {
        return {
          canTrade: false,
          reason: `Account balance ($${accountBalance}) below minimum required ($${this.limits.minAccountBalance})`
        };
      }

      // Check maximum drawdown
      const drawdownPercentage = (this.state.currentDrawdown / accountBalance) * 100;
      if (drawdownPercentage > this.limits.maxDrawdownPercentage) {
        return {
          canTrade: false,
          reason: `Maximum drawdown exceeded (${drawdownPercentage.toFixed(1)}% > ${this.limits.maxDrawdownPercentage}%)`
        };
      }

      // Check daily trade limit
      if (this.state.dailyTrades >= this.limits.maxDailyTrades) {
        return {
          canTrade: false,
          reason: `Daily trade limit exceeded (${this.state.dailyTrades}/${this.limits.maxDailyTrades})`
        };
      }

      // Check daily loss limit
      if (Math.abs(this.state.dailyLoss) >= this.limits.maxDailyLoss) {
        return {
          canTrade: false,
          reason: `Daily loss limit exceeded ($${Math.abs(this.state.dailyLoss)} >= $${this.limits.maxDailyLoss})`
        };
      }

      // Validate and adjust position size
      const maxAllowedVolume = Math.min(
        this.limits.maxPositionSize,
        (accountBalance * this.limits.maxRiskPercentage / 100) / this.calculateRiskAmount(signal, proposedVolume)
      );

      let adjustedVolume = Math.min(proposedVolume, maxAllowedVolume);
      adjustedVolume = Math.max(0.01, Math.round(adjustedVolume * 100) / 100); // Ensure minimum 0.01 and round to 2 decimals

      // Check if volume was significantly reduced
      if (adjustedVolume < proposedVolume * 0.5) {
        logger.warn(`Position size significantly reduced: ${proposedVolume} → ${adjustedVolume} due to safety limits`);
      }

      // Check trade frequency (prevent over-trading)
      const timeSinceLastTrade = Date.now() - this.state.lastTradeTime.getTime();
      const minTradeInterval = 2000; // 2 seconds minimum between trades (reduced for easier monitoring)
      
      if (timeSinceLastTrade < minTradeInterval) {
        return {
          canTrade: false,
          reason: `Trade frequency limit: ${Math.round((minTradeInterval - timeSinceLastTrade) / 1000)}s remaining`
        };
      }

      return {
        canTrade: true,
        adjustedVolume
      };

    } catch (error) {
      logger.error('Error in trade validation:', error);
      return {
        canTrade: false,
        reason: 'Trade validation error - refusing trade for safety'
      };
    }
  }

  /**
   * Record a trade execution for tracking
   */
  recordTrade(volume: number, pnl?: number): void {
    this.state.dailyTrades++;
    this.state.lastTradeTime = new Date();

    if (pnl !== undefined) {
      this.state.dailyLoss += pnl;
      if (pnl < 0) {
        this.state.currentDrawdown += Math.abs(pnl);
      } else {
        // Reduce drawdown on profitable trades
        this.state.currentDrawdown = Math.max(0, this.state.currentDrawdown - pnl);
      }
    }

    this.tradeHistory.push({
      timestamp: new Date(),
      pnl: pnl || 0,
      volume
    });

    // Keep only last 100 trades
    if (this.tradeHistory.length > 100) {
      this.tradeHistory = this.tradeHistory.slice(-100);
    }

    logger.info('Trade recorded:', {
      volume,
      pnl,
      dailyTrades: this.state.dailyTrades,
      dailyLoss: this.state.dailyLoss,
      currentDrawdown: this.state.currentDrawdown
    });
  }

  /**
   * Get current trading state for monitoring
   */
  getTradingState(): TradingState & SafetyLimits {
    return { ...this.state, ...this.limits };
  }

  /**
   * Reset the trading state (for testing purposes)
   */
  public resetState(): void {
    this.state = {
      dailyTrades: 0,
      dailyLoss: 0,
      currentDrawdown: 0,
      lastTradeTime: new Date(0)
    };
  }

  /**
   * Emergency stop all trading
   */
  emergencyStop(reason: string): void {
    logger.error(`🚨 EMERGENCY TRADING STOP: ${reason}`);
    this.state.dailyTrades = this.limits.maxDailyTrades; // Block further trades
    
    // Could also implement additional emergency actions here:
    // - Close all open positions
    // - Send alerts
    // - Disable auto-trading
  }

  /**
   * Reset daily counters
   */
  private resetDailyCounters(): void {
    this.state.dailyTrades = 0;
    this.state.dailyLoss = 0;
    logger.info('Daily trading counters reset');
  }

  /**
   * Schedule daily reset at midnight
   */
  private scheduleReset(): void {
    // Clear previous timers if any
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
      this.dailyResetInterval = null;
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    this.resetTimeout = setTimeout(() => {
      this.resetDailyCounters();
      // Schedule next reset
      this.dailyResetInterval = setInterval(() => this.resetDailyCounters(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  /**
   * Calculate risk amount for a trade
   */
  private calculateRiskAmount(signal: TradeSignal, volume: number): number {
    // Simplified risk calculation - should be enhanced based on symbol specifications
    const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
    const stopLoss = signal.stopLoss;
    const pipDifference = Math.abs(entryPrice - stopLoss);
    
    // This is a simplified calculation - actual implementation should consider:
    // - Symbol specifications (pip value, contract size)
    // - Currency conversion rates
    // - Broker-specific calculations
    return pipDifference * volume * 10; // Placeholder calculation
  }
}
