import { logger } from './logger';
import { TradeSignal } from '../types';

export interface EnhancedRiskConfig {
  // Core Risk Parameters
  defaultRiskPercentage: number;           // Default risk per trade (%)
  maxRiskPercentage: number;               // Maximum allowed risk per trade (%)
  minRiskPercentage: number;               // Minimum risk per trade (%)
  
  // Position Sizing
  maxPositionSize: number;                 // Maximum lot size
  minPositionSize: number;                 // Minimum lot size
  maxDailyRisk: number;                    // Maximum daily risk in account currency
  
  // Account Safety
  minAccountBalance: number;               // Minimum balance to continue trading
  maxDrawdownPercentage: number;           // Maximum drawdown before emergency stop
  maxDailyTrades: number;                  // Maximum trades per day
  
  // Symbol-Specific Risk
  symbolRiskMultipliers: { [symbol: string]: number };
  
  // Market Condition Adjustments
  newsEventRiskReduction: number;          // Risk reduction during news (0.5 = 50% reduction)
  highVolatilityRiskReduction: number;     // Risk reduction during high volatility
  lowVolumeRiskReduction: number;          // Risk reduction during low volume
  
  // Emergency Controls
  emergencyStopLoss: boolean;              // Enable emergency stop on large losses
  circuitBreakerThreshold: number;         // Loss threshold for circuit breaker
  autoRecoveryEnabled: boolean;            // Auto-resume after emergency stop
}

export interface RiskAssessment {
  adjustedRiskPercentage: number;
  adjustedPositionSize: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  canTrade: boolean;
  reasonsForAdjustment: string[];
  emergencyStop: boolean;
  fallbacksUsed: string[];
}

export class EnhancedRiskManager {
  private static instance: EnhancedRiskManager;
  private config: EnhancedRiskConfig;
  private emergencyStopActive: boolean = false;
  private dailyStats = {
    trades: 0,
    totalRisk: 0,
    currentDrawdown: 0,
    lastReset: new Date().getDate()
  };

  private constructor() {
    this.config = this.loadRiskConfig();
    this.resetDailyStatsIfNeeded();
  }

  static getInstance(): EnhancedRiskManager {
    if (!EnhancedRiskManager.instance) {
      EnhancedRiskManager.instance = new EnhancedRiskManager();
    }
    return EnhancedRiskManager.instance;
  }

  private loadRiskConfig(): EnhancedRiskConfig {
    return {
      // Core risk parameters with fallbacks
      defaultRiskPercentage: parseFloat(process.env.DEFAULT_RISK_PERCENTAGE || '1.3'),
      maxRiskPercentage: parseFloat(process.env.MAX_RISK_PERCENTAGE || '2.0'),
      minRiskPercentage: parseFloat(process.env.MIN_RISK_PERCENTAGE || '0.5'),
      
      // Position sizing with fallbacks
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '1.0'),
      minPositionSize: parseFloat(process.env.MIN_POSITION_SIZE || '0.01'),
      maxDailyRisk: parseFloat(process.env.MAX_DAILY_RISK || '5.0'), // 5% of account per day
      
      // Account safety with fallbacks
      minAccountBalance: parseFloat(process.env.MIN_ACCOUNT_BALANCE || '5'), // 🚨 TEMPORARY: Lower for testing
      maxDrawdownPercentage: parseFloat(process.env.MAX_DRAWDOWN_PERCENTAGE || '10.0'),
      maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '10'),
      
      // Symbol-specific risk multipliers
      symbolRiskMultipliers: {
        'XAUUSD': 1.0,     // Gold - normal risk
        'XAGUSD': 1.2,     // Silver - slightly higher risk
        'EURUSD': 0.8,     // Major forex - lower risk
        'GBPUSD': 1.0,     // Cable - normal risk
        'USDJPY': 0.9,     // Yen - slightly lower risk
        'US30': 1.5,       // Dow - higher risk
        'NAS100': 1.8,     // Nasdaq - highest risk
        'BTCUSD': 2.0,     // Crypto - very high risk
        'DEFAULT': 1.0     // Fallback multiplier
      },
      
      // Market condition adjustments
      newsEventRiskReduction: parseFloat(process.env.NEWS_RISK_REDUCTION || '0.5'),
      highVolatilityRiskReduction: parseFloat(process.env.HIGH_VOL_RISK_REDUCTION || '0.7'),
      lowVolumeRiskReduction: parseFloat(process.env.LOW_VOL_RISK_REDUCTION || '0.8'),
      
      // Emergency controls
      emergencyStopLoss: process.env.EMERGENCY_STOP_ENABLED !== 'false',
      circuitBreakerThreshold: parseFloat(process.env.CIRCUIT_BREAKER_THRESHOLD || '3.0'), // 3% daily loss
      autoRecoveryEnabled: process.env.AUTO_RECOVERY_ENABLED !== 'false'
    };
  }

  /**
   * MAIN RISK ASSESSMENT FUNCTION
   * Analyzes all risk factors and returns adjusted parameters
   */
  assessTradeRisk(
    signal: TradeSignal,
    accountBalance: number,
    marketConditions?: {
      isNewsEvent?: boolean;
      volatilityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
      volumeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): RiskAssessment {
    const assessment: RiskAssessment = {
      adjustedRiskPercentage: this.config.defaultRiskPercentage,
      adjustedPositionSize: 0,
      riskLevel: 'MEDIUM',
      canTrade: true,
      reasonsForAdjustment: [],
      emergencyStop: this.emergencyStopActive,
      fallbacksUsed: []
    };

    this.resetDailyStatsIfNeeded();

    // 1. Emergency stop check
    if (this.emergencyStopActive) {
      assessment.canTrade = false;
      assessment.riskLevel = 'EXTREME';
      assessment.reasonsForAdjustment.push('Emergency stop is active');
      return assessment;
    }

    // 2. Account balance check
    if (accountBalance < this.config.minAccountBalance) {
      assessment.canTrade = false;
      assessment.riskLevel = 'EXTREME';
      assessment.reasonsForAdjustment.push(`Account balance too low: $${accountBalance} < $${this.config.minAccountBalance}`);
      return assessment;
    }

    // 3. Daily limits check
    if (this.dailyStats.trades >= this.config.maxDailyTrades) {
      assessment.canTrade = false;
      assessment.riskLevel = 'HIGH';
      assessment.reasonsForAdjustment.push(`Daily trade limit reached: ${this.dailyStats.trades}/${this.config.maxDailyTrades}`);
      return assessment;
    }

    if (this.dailyStats.totalRisk >= this.config.maxDailyRisk) {
      assessment.canTrade = false;
      assessment.riskLevel = 'HIGH';
      assessment.reasonsForAdjustment.push(`Daily risk limit reached: ${this.dailyStats.totalRisk.toFixed(2)}%`);
      return assessment;
    }

    // 4. Drawdown check
    const drawdownPercentage = (this.dailyStats.currentDrawdown / accountBalance) * 100;
    if (drawdownPercentage > this.config.maxDrawdownPercentage) {
      assessment.canTrade = false;
      assessment.riskLevel = 'EXTREME';
      assessment.reasonsForAdjustment.push(`Maximum drawdown exceeded: ${drawdownPercentage.toFixed(1)}% > ${this.config.maxDrawdownPercentage}%`);
      this.triggerEmergencyStop(`Drawdown limit exceeded: ${drawdownPercentage.toFixed(1)}%`);
      return assessment;
    }

    // 5. Symbol-specific risk adjustment
    const symbolMultiplier = this.config.symbolRiskMultipliers[signal.symbol] || this.config.symbolRiskMultipliers['DEFAULT'];
    if (symbolMultiplier !== 1.0) {
      assessment.adjustedRiskPercentage *= symbolMultiplier;
      assessment.reasonsForAdjustment.push(`Symbol risk adjustment: ${symbolMultiplier}x for ${signal.symbol}`);
      if (symbolMultiplier !== this.config.symbolRiskMultipliers['DEFAULT']) {
        assessment.fallbacksUsed.push(`Used specific multiplier for ${signal.symbol}`);
      } else {
        assessment.fallbacksUsed.push('Used default symbol multiplier (fallback)');
      }
    }

    // 6. Market condition adjustments
    if (marketConditions) {
      if (marketConditions.isNewsEvent) {
        assessment.adjustedRiskPercentage *= this.config.newsEventRiskReduction;
        assessment.reasonsForAdjustment.push(`News event risk reduction: ${this.config.newsEventRiskReduction}x`);
        assessment.riskLevel = 'HIGH';
      }

      if (marketConditions.volatilityLevel === 'HIGH') {
        assessment.adjustedRiskPercentage *= this.config.highVolatilityRiskReduction;
        assessment.reasonsForAdjustment.push(`High volatility risk reduction: ${this.config.highVolatilityRiskReduction}x`);
        assessment.riskLevel = 'HIGH';
      }

      if (marketConditions.volumeLevel === 'LOW') {
        assessment.adjustedRiskPercentage *= this.config.lowVolumeRiskReduction;
        assessment.reasonsForAdjustment.push(`Low volume risk reduction: ${this.config.lowVolumeRiskReduction}x`);
      }
    }

    // 7. Ensure risk is within bounds
    const originalRisk = assessment.adjustedRiskPercentage;
    assessment.adjustedRiskPercentage = Math.max(
      this.config.minRiskPercentage,
      Math.min(this.config.maxRiskPercentage, assessment.adjustedRiskPercentage)
    );

    if (assessment.adjustedRiskPercentage !== originalRisk) {
      assessment.reasonsForAdjustment.push(`Risk clamped to bounds: ${this.config.minRiskPercentage}% - ${this.config.maxRiskPercentage}%`);
      assessment.fallbacksUsed.push('Applied risk bounds fallback');
    }

    // 8. Calculate position size
    assessment.adjustedPositionSize = this.calculatePositionSize(
      signal,
      accountBalance,
      assessment.adjustedRiskPercentage
    );

    // 9. Determine final risk level
    if (assessment.adjustedRiskPercentage >= 2.0) {
      assessment.riskLevel = 'HIGH';
    } else if (assessment.adjustedRiskPercentage >= 1.0) {
      assessment.riskLevel = 'MEDIUM';
    } else {
      assessment.riskLevel = 'LOW';
    }

    // 10. Circuit breaker check
    if (this.dailyStats.currentDrawdown / accountBalance * 100 > this.config.circuitBreakerThreshold) {
      this.triggerCircuitBreaker();
      assessment.canTrade = false;
      assessment.emergencyStop = true;
      assessment.riskLevel = 'EXTREME';
      assessment.reasonsForAdjustment.push('Circuit breaker triggered');
    }

    logger.info('🛡️ Risk Assessment Complete', {
      symbol: signal.symbol,
      originalRisk: this.config.defaultRiskPercentage,
      adjustedRisk: assessment.adjustedRiskPercentage,
      positionSize: assessment.adjustedPositionSize,
      riskLevel: assessment.riskLevel,
      canTrade: assessment.canTrade,
      adjustments: assessment.reasonsForAdjustment.length,
      fallbacksUsed: assessment.fallbacksUsed.length
    });

    return assessment;
  }

  private calculatePositionSize(signal: TradeSignal, accountBalance: number, riskPercentage: number): number {
    try {
      const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
      const stopLoss = signal.stopLoss;
      
      if (!stopLoss) {
        logger.warn('No stop loss provided, using fallback position size');
        return this.config.minPositionSize;
      }

      const riskAmount = accountBalance * (riskPercentage / 100);
      const pipsAtRisk = Math.abs(entryPrice - stopLoss);
      
      // Fallback pip values by symbol
      const pipValues: { [symbol: string]: number } = {
        'XAUUSD': 1.0,    // $1 per pip per lot
        'XAGUSD': 0.5,    // $0.50 per pip per lot
        'EURUSD': 0.10,   // $0.10 per pip per mini lot
        'GBPUSD': 0.10,
        'USDJPY': 0.09,
        'US30': 0.10,
        'NAS100': 0.20,
        'DEFAULT': 0.10   // Fallback pip value
      };

      const pipValue = pipValues[signal.symbol] || pipValues['DEFAULT'];
      const lotSize = riskAmount / (pipsAtRisk * pipValue);
      
      // Apply position size limits
      const constrainedLotSize = Math.max(
        this.config.minPositionSize,
        Math.min(this.config.maxPositionSize, lotSize)
      );

      // Round to 2 decimal places
      return Math.round(constrainedLotSize * 100) / 100;

    } catch (error) {
      logger.error('Error calculating position size, using fallback', error);
      return this.config.minPositionSize; // Fallback to minimum
    }
  }

  private resetDailyStatsIfNeeded(): void {
    const currentDate = new Date().getDate();
    if (this.dailyStats.lastReset !== currentDate) {
      this.dailyStats = {
        trades: 0,
        totalRisk: 0,
        currentDrawdown: 0,
        lastReset: currentDate
      };
      
      // Auto-recovery from emergency stop at new day
      if (this.emergencyStopActive && this.config.autoRecoveryEnabled) {
        this.emergencyStopActive = false;
        logger.info('🔄 Auto-recovery: Emergency stop cleared for new trading day');
      }
    }
  }

  private triggerEmergencyStop(reason: string): void {
    this.emergencyStopActive = true;
    logger.error(`🚨 EMERGENCY STOP TRIGGERED: ${reason}`);
    
    // Could implement additional emergency actions here:
    // - Send alerts
    // - Close open positions
    // - Notify administrators
  }

  private triggerCircuitBreaker(): void {
    this.emergencyStopActive = true;
    logger.error('🔴 CIRCUIT BREAKER ACTIVATED - Trading halted due to excessive losses');
  }

  /**
   * Record trade execution for risk tracking
   */
  recordTrade(riskPercentage: number, pnl?: number): void {
    this.dailyStats.trades++;
    this.dailyStats.totalRisk += riskPercentage;
    
    if (pnl !== undefined && pnl < 0) {
      this.dailyStats.currentDrawdown += Math.abs(pnl);
    }

    logger.info('📊 Trade recorded', {
      dailyTrades: this.dailyStats.trades,
      totalDailyRisk: this.dailyStats.totalRisk.toFixed(2),
      currentDrawdown: this.dailyStats.currentDrawdown
    });
  }

  /**
   * Get current risk status for monitoring
   */
  getRiskStatus() {
    return {
      emergencyStopActive: this.emergencyStopActive,
      dailyStats: this.dailyStats,
      config: this.config,
      limitsStatus: {
        tradesRemaining: Math.max(0, this.config.maxDailyTrades - this.dailyStats.trades),
        riskRemaining: Math.max(0, this.config.maxDailyRisk - this.dailyStats.totalRisk)
      }
    };
  }

  /**
   * Manual emergency stop override
   */
  manualEmergencyStop(reason: string): void {
    this.triggerEmergencyStop(`Manual override: ${reason}`);
  }

  /**
   * Clear emergency stop (admin function)
   */
  clearEmergencyStop(): void {
    this.emergencyStopActive = false;
    logger.info('🟢 Emergency stop cleared manually');
  }
}
