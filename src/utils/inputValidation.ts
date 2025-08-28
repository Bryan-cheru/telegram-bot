import { TradeSignal } from '../types';
import { logger } from './logger';

export interface ValidationRule {
  field: string;
  validate: (value: any) => boolean;
  errorMessage: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: any;
}

export class InputValidator {
  private static readonly FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
    'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF'
  ];

  private static readonly METAL_SYMBOLS = [
    'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER'
  ];

  private static readonly INDEX_SYMBOLS = [
    'US30', 'NAS100', 'SPX500', 'UK100', 'GER30', 'FRA40', 'JPN225', 'NASDAQ'
  ];

  private static readonly CRYPTO_SYMBOLS = [
    'BTCUSD', 'ETHUSD', 'BITCOIN', 'ETHEREUM'
  ];

  private static readonly ALL_SYMBOLS = [
    ...InputValidator.FOREX_PAIRS,
    ...InputValidator.METAL_SYMBOLS,
    ...InputValidator.INDEX_SYMBOLS,
    ...InputValidator.CRYPTO_SYMBOLS
  ];

  /**
   * Comprehensive validation for trade signals
   */
  static validateTradeSignal(signal: TradeSignal): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Basic null/undefined checks
      if (!signal) {
        return {
          isValid: false,
          errors: ['Trade signal is null or undefined'],
          warnings: []
        };
      }

      // Symbol validation
      const symbolResult = this.validateSymbol(signal.symbol);
      if (!symbolResult.isValid) {
        errors.push(...symbolResult.errors);
      }
      warnings.push(...symbolResult.warnings);

      // Action validation
      const actionResult = this.validateAction(signal.action);
      if (!actionResult.isValid) {
        errors.push(...actionResult.errors);
      }

      // Entry zone validation
      const entryZoneResult = this.validateEntryZone(signal.entryZone);
      if (!entryZoneResult.isValid) {
        errors.push(...entryZoneResult.errors);
      }
      warnings.push(...entryZoneResult.warnings);

      // Stop loss validation
      const stopLossResult = this.validateStopLoss(signal.stopLoss, signal.entryZone, signal.action);
      if (!stopLossResult.isValid) {
        errors.push(...stopLossResult.errors);
      }
      warnings.push(...stopLossResult.warnings);

      // Targets validation
      const targetsResult = this.validateTargets(signal.targets, signal.entryZone, signal.action);
      if (!targetsResult.isValid) {
        errors.push(...targetsResult.errors);
      }
      warnings.push(...targetsResult.warnings);

      // Risk-reward validation
      const riskRewardResult = this.validateRiskReward(signal);
      warnings.push(...riskRewardResult.warnings);

      // Position sizing validation (if present)
      if (signal.positionSizing) {
        const positionSizingResult = this.validatePositionSizing(signal.positionSizing);
        if (!positionSizingResult.isValid) {
          errors.push(...positionSizingResult.errors);
        }
        warnings.push(...positionSizingResult.warnings);
      }

      // Sanitize and return result
      const sanitizedSignal = this.sanitizeTradeSignal(signal);

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitizedData: sanitizedSignal
      };

      // Log validation results
      if (errors.length > 0) {
        logger.error('Trade signal validation failed:', { errors, warnings, signal });
      } else if (warnings.length > 0) {
        logger.warn('Trade signal has warnings:', { warnings, signal });
      } else {
        logger.info('✅ Trade signal validation passed');
      }

      return result;

    } catch (error) {
      logger.error('Validation process failed:', error);
      return {
        isValid: false,
        errors: [`Validation process failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  private static validateSymbol(symbol: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!symbol) {
      errors.push('Symbol is required');
    } else {
      const upperSymbol = symbol.toUpperCase().trim();
      
      if (upperSymbol.length < 2 || upperSymbol.length > 10) {
        errors.push('Symbol must be 2-10 characters long');
      }
      
      if (!/^[A-Z0-9]+$/.test(upperSymbol)) {
        errors.push('Symbol must contain only letters and numbers');
      }
      
      if (!this.ALL_SYMBOLS.includes(upperSymbol)) {
        warnings.push(`Symbol '${upperSymbol}' is not in known instruments list`);
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private static validateAction(action: string): ValidationResult {
    const errors: string[] = [];
    
    if (!action) {
      errors.push('Action is required');
    } else if (!['BUY', 'SELL'].includes(action.toUpperCase())) {
      errors.push('Action must be either BUY or SELL');
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }

  private static validateEntryZone(entryZone: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!entryZone) {
      errors.push('Entry zone is required');
      return { isValid: false, errors, warnings };
    }

    if (typeof entryZone.min !== 'number' || typeof entryZone.max !== 'number') {
      errors.push('Entry zone min and max must be numbers');
      return { isValid: false, errors, warnings };
    }

    if (entryZone.min <= 0 || entryZone.max <= 0) {
      errors.push('Entry zone prices must be positive');
    }

    if (entryZone.min >= entryZone.max) {
      errors.push('Entry zone minimum must be less than maximum');
    }

    // Check for extremely wide entry zones
    const zoneWidth = Math.abs(entryZone.max - entryZone.min);
    const zoneAverage = (entryZone.min + entryZone.max) / 2;
    const widthPercentage = (zoneWidth / zoneAverage) * 100;

    if (widthPercentage > 5) {
      warnings.push(`Entry zone is very wide (${widthPercentage.toFixed(2)}% of price)`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private static validateStopLoss(stopLoss: number, entryZone: any, action: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof stopLoss !== 'number') {
      errors.push('Stop loss must be a number');
      return { isValid: false, errors, warnings };
    }

    if (stopLoss <= 0) {
      errors.push('Stop loss must be positive');
      return { isValid: false, errors, warnings };
    }

    if (!entryZone || !action) {
      return { isValid: errors.length === 0, errors, warnings };
    }

    const entryMid = (entryZone.min + entryZone.max) / 2;
    const isLogicalPlacement = action === 'BUY' ? stopLoss < entryZone.min : stopLoss > entryZone.max;

    if (!isLogicalPlacement) {
      errors.push(`Stop loss placement is illogical for ${action} trade`);
    }

    // Check for extremely tight or wide stop losses
    const distance = Math.abs(entryMid - stopLoss);
    const distancePercentage = (distance / entryMid) * 100;

    if (distancePercentage < 0.1) {
      warnings.push('Stop loss is extremely tight (< 0.1% from entry)');
    } else if (distancePercentage > 10) {
      warnings.push('Stop loss is very wide (> 10% from entry)');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private static validateTargets(targets: number[], entryZone: any, action: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(targets) || targets.length === 0) {
      errors.push('At least one target is required');
      return { isValid: false, errors, warnings };
    }

    // Check each target
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      
      if (typeof target !== 'number') {
        errors.push(`Target ${i + 1} must be a number`);
        continue;
      }
      
      if (target <= 0) {
        errors.push(`Target ${i + 1} must be positive`);
        continue;
      }

      // Logical placement check
      if (entryZone && action) {
        const isLogicalPlacement = action === 'BUY' ? target > entryZone.max : target < entryZone.min;
        if (!isLogicalPlacement) {
          errors.push(`Target ${i + 1} placement is illogical for ${action} trade`);
        }
      }
    }

    // Check target ordering
    if (action === 'BUY') {
      for (let i = 1; i < targets.length; i++) {
        if (targets[i] <= targets[i - 1]) {
          warnings.push('BUY targets should be in ascending order');
          break;
        }
      }
    } else if (action === 'SELL') {
      for (let i = 1; i < targets.length; i++) {
        if (targets[i] >= targets[i - 1]) {
          warnings.push('SELL targets should be in descending order');
          break;
        }
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private static validateRiskReward(signal: TradeSignal): ValidationResult {
    const warnings: string[] = [];

    try {
      const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
      const risk = Math.abs(entryMid - signal.stopLoss);
      const reward = Math.abs(signal.targets[0] - entryMid);
      const riskRewardRatio = reward / risk;

      if (riskRewardRatio < 1) {
        warnings.push(`Poor risk-reward ratio: ${riskRewardRatio.toFixed(2)}:1 (should be >= 1:1)`);
      } else if (riskRewardRatio < 1.2) {
        warnings.push(`Low risk-reward ratio: ${riskRewardRatio.toFixed(2)}:1 (recommended >= 1.2:1)`);
      }
    } catch (error) {
      warnings.push('Could not calculate risk-reward ratio');
    }

    return { isValid: true, errors: [], warnings };
  }

  private static validatePositionSizing(positionSizing: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!positionSizing) {
      return { isValid: true, errors, warnings };
    }

    if (typeof positionSizing.lotSize !== 'number' || positionSizing.lotSize <= 0) {
      errors.push('Lot size must be a positive number');
    }

    if (typeof positionSizing.riskAmount !== 'number' || positionSizing.riskAmount < 0) {
      errors.push('Risk amount must be a non-negative number');
    }

    if (typeof positionSizing.riskPercentage !== 'number' || positionSizing.riskPercentage < 0) {
      errors.push('Risk percentage must be a non-negative number');
    }

    if (positionSizing.riskPercentage > 10) {
      warnings.push(`High risk percentage: ${positionSizing.riskPercentage.toFixed(2)}%`);
    }

    if (typeof positionSizing.accountEquity !== 'number' || positionSizing.accountEquity <= 0) {
      errors.push('Account equity must be a positive number');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Sanitize trade signal data
   */
  private static sanitizeTradeSignal(signal: TradeSignal): TradeSignal {
    const sanitized = { ...signal };

    // Sanitize symbol
    if (sanitized.symbol) {
      sanitized.symbol = sanitized.symbol.toUpperCase().trim();
    }

    // Sanitize action
    if (sanitized.action) {
      sanitized.action = sanitized.action.toUpperCase().trim() as 'BUY' | 'SELL';
    }

    // Round numerical values to reasonable precision
    if (sanitized.entryZone) {
      sanitized.entryZone.min = Number(sanitized.entryZone.min.toFixed(5));
      sanitized.entryZone.max = Number(sanitized.entryZone.max.toFixed(5));
    }

    if (typeof sanitized.stopLoss === 'number') {
      sanitized.stopLoss = Number(sanitized.stopLoss.toFixed(5));
    }

    if (Array.isArray(sanitized.targets)) {
      sanitized.targets = sanitized.targets.map(target => 
        typeof target === 'number' ? Number(target.toFixed(5)) : target
      );
    }

    // Sanitize position sizing if present
    if (sanitized.positionSizing) {
      sanitized.positionSizing.lotSize = Number(sanitized.positionSizing.lotSize.toFixed(2));
      sanitized.positionSizing.riskAmount = Number(sanitized.positionSizing.riskAmount.toFixed(2));
      sanitized.positionSizing.riskPercentage = Number(sanitized.positionSizing.riskPercentage.toFixed(2));
    }

    return sanitized;
  }

  /**
   * Validate extracted text quality and content
   */
  static validateExtractedText(text: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!text || typeof text !== 'string') {
      errors.push('Extracted text is empty or invalid');
      return { isValid: false, errors, warnings };
    }

    const cleanText = text.trim();
    
    if (cleanText.length < 5) {
      warnings.push('Extracted text is very short');
    }

    if (cleanText.length > 5000) {
      warnings.push('Extracted text is unusually long');
    }

    // Check for common OCR artifacts
    const artifactPattern = /[^\w\s\.\,\-\:\(\)\[\]\/\%\$\@\#\&\*\+\=\|\<\>\?\!]/g;
    const artifacts = cleanText.match(artifactPattern);
    
    if (artifacts && artifacts.length > cleanText.length * 0.1) {
      warnings.push('Text contains many OCR artifacts - image quality may be poor');
    }

    // Check for trading-related keywords
    const tradingKeywords = ['buy', 'sell', 'target', 'stop', 'loss', 'entry', 'price', 'tp', 'sl'];
    const hasKeywords = tradingKeywords.some(keyword => 
      cleanText.toLowerCase().includes(keyword)
    );
    
    if (!hasKeywords) {
      warnings.push('Text does not contain common trading keywords');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate account equity value
   */
  static validateAccountEquity(equity: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof equity !== 'number' || isNaN(equity)) {
      errors.push('Account equity must be a valid number');
      return { isValid: false, errors, warnings };
    }

    if (equity <= 0) {
      errors.push('Account equity must be positive');
      return { isValid: false, errors, warnings };
    }

    if (equity < 100) {
      warnings.push('Account equity is very low (< $100)');
    } else if (equity > 1000000) {
      warnings.push('Account equity is very high (> $1M) - verify this is correct');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}
