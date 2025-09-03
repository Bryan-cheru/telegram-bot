// Enhanced Stop Loss & Take Profit Management System
// File: src/utils/advancedStopTakeManagement.ts

import { TradeSignal } from '../types';
import { logger } from './logger';

interface StopTakeLevels {
  stopLoss: number;
  takeProfits: number[];
  riskRewardRatio: number;
  confidence: number;
}

export class AdvancedStopTakeManager {
  
  /**
   * Calculate optimal stop loss and take profit levels
   */
  static calculateOptimalLevels(
    signal: TradeSignal, 
    currentPrice: number, 
    volatility: number = 0.001
  ): StopTakeLevels {
    
    // 1. Base levels from signal
    let baseStopLoss = signal.stopLoss;
    let baseTakeProfit = signal.targets?.[0];
    
    // 2. Symbol-specific adjustments
    const symbolRules = this.getSymbolRules(signal.symbol);
    const minDistance = symbolRules.minDistance;
    const maxRisk = symbolRules.maxRiskPips;
    
    // 3. Calculate dynamic stop loss using ATR-like volatility
    const dynamicStopDistance = Math.max(minDistance, volatility * 3);
    
    // 4. Validate and adjust stop loss
    const validatedStopLoss = this.validateStopLoss(
      baseStopLoss, 
      currentPrice, 
      signal.action, 
      dynamicStopDistance,
      maxRisk
    );
    
    // 5. Calculate multiple take profits with optimal R:R ratios
    const takeProfits = this.calculateMultipleTakeProfits(
      validatedStopLoss,
      baseTakeProfit,
      currentPrice,
      signal.action,
      minDistance
    );
    
    // 6. Calculate risk-reward ratio
    const riskDistance = Math.abs(currentPrice - validatedStopLoss);
    const rewardDistance = Math.abs(takeProfits[0] - currentPrice);
    const riskRewardRatio = rewardDistance / riskDistance;
    
    logger.info(`🎯 Optimal levels calculated: SL=${validatedStopLoss}, TPs=[${takeProfits.join(',')}], R:R=${riskRewardRatio.toFixed(2)}`);
    
    return {
      stopLoss: validatedStopLoss,
      takeProfits,
      riskRewardRatio,
      confidence: this.calculateConfidence(signal, riskRewardRatio)
    };
  }
  
  /**
   * Get symbol-specific trading rules
   */
  private static getSymbolRules(symbol: string) {
    const rules: Record<string, { minDistance: number; maxRiskPips: number; pipValue: number }> = {
      'XAUUSD': { minDistance: 5.0, maxRiskPips: 50.0, pipValue: 1.0 },
      'XAGUSD': { minDistance: 0.5, maxRiskPips: 2.0, pipValue: 0.1 },
      'EURUSD': { minDistance: 0.0015, maxRiskPips: 0.01, pipValue: 0.0001 },
      'GBPUSD': { minDistance: 0.0015, maxRiskPips: 0.01, pipValue: 0.0001 },
      'USDJPY': { minDistance: 0.15, maxRiskPips: 1.0, pipValue: 0.01 },
      'DEFAULT': { minDistance: 0.001, maxRiskPips: 0.005, pipValue: 0.0001 }
    };
    
    return rules[symbol] || rules['DEFAULT'];
  }
  
  /**
   * Validate stop loss placement
   */
  private static validateStopLoss(
    originalSL: number, 
    currentPrice: number, 
    action: string, 
    minDistance: number,
    maxRisk: number
  ): number {
    
    if (!originalSL) {
      // Create default stop loss
      return action === 'BUY' ? 
        currentPrice - minDistance * 2 : 
        currentPrice + minDistance * 2;
    }
    
    const distance = Math.abs(currentPrice - originalSL);
    
    // Check minimum distance
    if (distance < minDistance) {
      logger.warn(`⚠️ Stop too close: ${distance} < ${minDistance}`);
      return action === 'BUY' ? 
        currentPrice - minDistance : 
        currentPrice + minDistance;
    }
    
    // Check maximum risk
    if (distance > maxRisk) {
      logger.warn(`⚠️ Stop too far: ${distance} > ${maxRisk}`);
      return action === 'BUY' ? 
        currentPrice - maxRisk : 
        currentPrice + maxRisk;
    }
    
    // Validate direction
    if (action === 'BUY' && originalSL >= currentPrice) {
      return currentPrice - minDistance;
    }
    if (action === 'SELL' && originalSL <= currentPrice) {
      return currentPrice + minDistance;
    }
    
    return originalSL;
  }
  
  /**
   * Calculate multiple take profit levels
   */
  private static calculateMultipleTakeProfits(
    stopLoss: number,
    baseTP: number,
    currentPrice: number,
    action: string,
    minDistance: number
  ): number[] {
    
    const riskDistance = Math.abs(currentPrice - stopLoss);
    
    // Create 3 take profit levels with different R:R ratios
    const multipliers = [1.5, 2.0, 3.0]; // 1.5:1, 2:1, 3:1 ratios
    
    const takeProfits = multipliers.map(multiplier => {
      const rewardDistance = riskDistance * multiplier;
      return action === 'BUY' ? 
        currentPrice + rewardDistance : 
        currentPrice - rewardDistance;
    });
    
    // If base TP provided, use it as primary target
    if (baseTP) {
      takeProfits[0] = baseTP;
    }
    
    // Ensure minimum distance
    return takeProfits.map(tp => {
      const distance = Math.abs(tp - currentPrice);
      if (distance < minDistance) {
        return action === 'BUY' ? 
          currentPrice + minDistance : 
          currentPrice - minDistance;
      }
      return tp;
    });
  }
  
  /**
   * Calculate confidence score for SL/TP levels
   */
  private static calculateConfidence(signal: TradeSignal, riskRewardRatio: number): number {
    let confidence = 70; // Base confidence
    
    // Boost confidence for good R:R ratios
    if (riskRewardRatio >= 2.0) confidence += 20;
    if (riskRewardRatio >= 3.0) confidence += 10;
    
    // Boost for visual confirmation (check if signal has visual data)
    if ((signal as any).visualData) confidence += 15;
    
    // Boost for multiple targets
    if (signal.targets && signal.targets.length > 1) confidence += 10;
    
    return Math.min(confidence, 95);
  }
  
  /**
   * Dynamic trailing stop loss calculation
   */
  static calculateTrailingStop(
    currentPrice: number,
    entryPrice: number,
    originalStopLoss: number,
    action: string,
    trailDistance: number = 0.5
  ): number {
    
    const profitDistance = Math.abs(currentPrice - entryPrice);
    const originalRisk = Math.abs(entryPrice - originalStopLoss);
    
    // Only trail when in profit by at least 1:1
    if (profitDistance < originalRisk) {
      return originalStopLoss;
    }
    
    // Calculate trailing stop
    const trailingStop = action === 'BUY' ? 
      currentPrice - trailDistance : 
      currentPrice + trailDistance;
    
    // Only move stop in favorable direction
    if (action === 'BUY') {
      return Math.max(originalStopLoss, trailingStop);
    } else {
      return Math.min(originalStopLoss, trailingStop);
    }
  }
}
