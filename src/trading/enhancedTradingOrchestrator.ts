import { logger } from '../utils/logger';
import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { EnhancedRiskManager } from '../utils/enhancedRiskManager';
import { OCRFallbackSystem } from '../ocr/ocrFallbackSystem';

export interface TradingContext {
  accountBalance: number;
  currentDrawdown: number;
  openPositions: number;
  dailyTrades: number;
  marketConditions?: {
    isNewsEvent?: boolean;
    volatilityLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    volumeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

export interface EnhancedTradeResult extends TradeResult {
  riskAssessment: any;
  ocrResult?: any;
  fallbacksUsed: string[];
  warnings: string[];
  executionMethod: 'STANDARD' | 'ENHANCED_RISK' | 'EMERGENCY_FALLBACK';
}

export class EnhancedTradingOrchestrator {
  private static instance: EnhancedTradingOrchestrator;
  private riskManager: EnhancedRiskManager;
  private ocrFallbackSystem: OCRFallbackSystem;
  private tradeExecutor: ITradeExecutor;

  private constructor(tradeExecutor: ITradeExecutor) {
    this.riskManager = EnhancedRiskManager.getInstance();
    this.ocrFallbackSystem = OCRFallbackSystem.getInstance();
    this.tradeExecutor = tradeExecutor;
  }

  static getInstance(tradeExecutor?: ITradeExecutor): EnhancedTradingOrchestrator {
    if (!EnhancedTradingOrchestrator.instance) {
      if (!tradeExecutor) {
        throw new Error('TradeExecutor is required for first initialization');
      }
      EnhancedTradingOrchestrator.instance = new EnhancedTradingOrchestrator(tradeExecutor);
    }
    return EnhancedTradingOrchestrator.instance;
  }

  /**
   * MAIN ENTRY POINT: Process trading signal image with comprehensive fallbacks
   */
  async processSignalImage(
    imageBuffer: Buffer, 
    tradingContext: TradingContext
  ): Promise<EnhancedTradeResult> {
    
    const result: EnhancedTradeResult = {
      success: false,
      fallbacksUsed: [],
      warnings: [],
      executionMethod: 'STANDARD',
      riskAssessment: null
    };

    logger.info('🎯 Starting enhanced signal processing...', {
      imageSize: imageBuffer.length,
      accountBalance: tradingContext.accountBalance,
      openPositions: tradingContext.openPositions
    });

    try {
      // Step 1: Extract signal with OCR fallbacks
      const signalExtraction = await this.ocrFallbackSystem.extractSignalWithFallbacks(imageBuffer);
      result.ocrResult = signalExtraction;
      result.fallbacksUsed.push(...signalExtraction.fallbacksUsed);

      if (!signalExtraction.signal) {
        result.success = false;
        result.error = 'Failed to extract trading signal from image';
        result.warnings.push('OCR extraction failed - consider manual review');
        
        if (signalExtraction.manualReviewRequired) {
          result.warnings.push('Image has been queued for manual review');
        }
        
        return result;
      }

      const signal = signalExtraction.signal;
      result.warnings.push(`Signal extracted with ${signalExtraction.extractionMethod} method`);

      // Step 2: Comprehensive risk assessment
      const riskAssessment = this.riskManager.assessTradeRisk(
        signal,
        tradingContext.accountBalance,
        tradingContext.marketConditions
      );

      result.riskAssessment = riskAssessment;
      result.fallbacksUsed.push(...riskAssessment.fallbacksUsed);

      // Step 3: Check if trade can proceed
      if (!riskAssessment.canTrade) {
        result.success = false;
        result.error = 'Trade blocked by risk management';
        result.warnings.push(...riskAssessment.reasonsForAdjustment);
        
        if (riskAssessment.emergencyStop) {
          result.warnings.push('🚨 EMERGENCY STOP ACTIVE - No trading allowed');
          result.executionMethod = 'EMERGENCY_FALLBACK';
        }
        
        return result;
      }

      // Step 4: Apply risk adjustments to signal
      const adjustedSignal = this.applyRiskAdjustments(signal, riskAssessment);
      result.warnings.push(`Risk adjusted: ${riskAssessment.adjustedRiskPercentage.toFixed(2)}% (${riskAssessment.riskLevel} risk)`);

      // Step 5: Execute trade with enhanced monitoring
      logger.info('🚀 Executing trade with enhanced risk management', {
        symbol: adjustedSignal.symbol,
        action: adjustedSignal.action,
        adjustedRisk: riskAssessment.adjustedRiskPercentage,
        positionSize: riskAssessment.adjustedPositionSize,
        riskLevel: riskAssessment.riskLevel
      });

      const tradeResult = await this.executeTradeWithFallbacks(adjustedSignal, riskAssessment);
      
      // Merge trade result with our enhanced result
      Object.assign(result, tradeResult);
      
      // Step 6: Record trade for risk tracking
      if (result.success) {
        this.riskManager.recordTrade(riskAssessment.adjustedRiskPercentage);
        result.executionMethod = 'ENHANCED_RISK';
        result.warnings.push('Trade executed successfully with enhanced risk management');
        
        logger.info('✅ Trade executed successfully with enhanced risk management', {
          ticket: result.ticket,
          riskLevel: riskAssessment.riskLevel,
          fallbacksUsed: result.fallbacksUsed.length
        });
      } else {
        result.warnings.push('Trade execution failed despite risk approval');
        logger.error('❌ Trade execution failed', {
          error: result.error,
          signal: adjustedSignal.symbol,
          riskAssessment: riskAssessment.riskLevel
        });
      }

      return result;

    } catch (error) {
      logger.error('🚨 Critical error in enhanced trading orchestrator:', error);
      
      result.success = false;
      result.error = `Critical system error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.executionMethod = 'EMERGENCY_FALLBACK';
      result.warnings.push('System error occurred - review logs for details');
      
      return result;
    }
  }

  /**
   * Apply risk management adjustments to the trading signal
   */
  private applyRiskAdjustments(signal: TradeSignal, riskAssessment: any): TradeSignal {
    const adjustedSignal: TradeSignal = {
      ...signal,
      positionSizing: {
        lotSize: riskAssessment.adjustedPositionSize,
        riskAmount: riskAssessment.adjustedRiskPercentage,
        riskPercentage: riskAssessment.adjustedRiskPercentage,
        accountEquity: 0, // Will be filled by trade executor
        reasoning: `Enhanced risk management: ${riskAssessment.riskLevel} risk level`
      },
      confidence: (signal.confidence || 0.5) // Use OCR confidence or default
    };

    return adjustedSignal;
  }

  /**
   * Execute trade with multiple fallback strategies
   */
  private async executeTradeWithFallbacks(
    signal: TradeSignal, 
    riskAssessment: any
  ): Promise<Partial<EnhancedTradeResult>> {
    
    const fallbackStrategies = [
      () => this.executeStandardTrade(signal),
      () => this.executeConservativeTrade(signal, riskAssessment),
      () => this.executeMinimalRiskTrade(signal)
    ];

    for (const [index, strategy] of fallbackStrategies.entries()) {
      try {
        logger.info(`Attempting trade execution strategy ${index + 1}/3`);
        const result = await strategy();
        
        if (result.success) {
          return {
            ...result,
            fallbacksUsed: [`Trade executed with strategy ${index + 1}`]
          };
        } else {
          logger.warn(`Trade strategy ${index + 1} failed: ${result.error}`);
        }
      } catch (error) {
        logger.error(`Trade strategy ${index + 1} threw error:`, error);
      }
    }

    return {
      success: false,
      error: 'All trade execution strategies failed',
      fallbacksUsed: ['Standard execution failed', 'Conservative execution failed', 'Minimal risk execution failed']
    };
  }

  private async executeStandardTrade(signal: TradeSignal): Promise<TradeResult> {
    const result = await this.tradeExecutor.executeTradeSignal(signal);
    return {
      success: result.success,
      ticket: result.ticket,
      error: result.error,
      message: result.message
    };
  }

  private async executeConservativeTrade(signal: TradeSignal, riskAssessment: any): Promise<TradeResult> {
    // Reduce position size by 50% as conservative fallback
    const conservativeSignal: TradeSignal = {
      ...signal,
      positionSizing: {
        ...signal.positionSizing!,
        lotSize: (signal.positionSizing?.lotSize || 0.01) * 0.5,
        reasoning: 'Conservative fallback execution'
      }
    };
    
    const result = await this.tradeExecutor.executeTradeSignal(conservativeSignal);
    return {
      success: result.success,
      ticket: result.ticket,
      error: result.error,
      message: result.message
    };
  }

  private async executeMinimalRiskTrade(signal: TradeSignal): Promise<TradeResult> {
    // Use minimum position size as last resort
    const minimalSignal: TradeSignal = {
      ...signal,
      positionSizing: {
        lotSize: 0.01, // Minimum position size
        riskAmount: 0.5, // Minimal risk
        riskPercentage: 0.5,
        accountEquity: 0,
        reasoning: 'Minimal risk fallback execution'
      }
    };
    
    const result = await this.tradeExecutor.executeTradeSignal(minimalSignal);
    return {
      success: result.success,
      ticket: result.ticket,
      error: result.error,
      message: result.message
    };
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    return {
      riskManager: this.riskManager.getRiskStatus(),
      ocrSystem: this.ocrFallbackSystem.getSystemStatus(),
      lastUpdate: new Date().toISOString(),
      systemHealth: 'OPERATIONAL'
    };
  }

  /**
   * Emergency system shutdown
   */
  emergencyShutdown(reason: string) {
    logger.error(`🚨 EMERGENCY SHUTDOWN TRIGGERED: ${reason}`);
    this.riskManager.manualEmergencyStop(reason);
    
    // Could implement additional shutdown procedures:
    // - Close all positions
    // - Send emergency notifications
    // - Stop all trading activities
  }

  /**
   * Manual risk override (admin function)
   */
  overrideRiskManagement(override: { emergencyStop?: boolean; riskMultiplier?: number }) {
    if (override.emergencyStop === false) {
      this.riskManager.clearEmergencyStop();
      logger.info('🟢 Emergency stop cleared by admin override');
    }
    
    // Additional override logic could be implemented here
  }
}

export default EnhancedTradingOrchestrator;
