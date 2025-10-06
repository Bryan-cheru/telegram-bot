  1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           /**
 * Enhanced Signal Parser
 * Handles diverse signal formats and natural language processing
 * Part of Phase 5: Advanced Features - Smart Signal Recognition
 */

import { logger } from '../utils/logger';
import { TradeSignal } from '../types/index';
import { SymbolParser, ValidationService, FormatService } from '../shared';

export interface ParsedSignalData {
  symbol: string;
  action: 'BUY' | 'SELL' | 'AUTO_DETECT';
  entryZone?: { min: number; max: number };
  targets: number[];
  stopLoss?: number;
  confidence: number;
  reasoning: string[];
  marketContext: string;
  timeframe?: string;
  originalText: string;
}

/**
 * Enhanced parser that understands various signal formats
 */
export class EnhancedSignalParser {
  
  // Keywords that indicate buy/sell actions
  private static readonly BUY_KEYWORDS = [
    'buy', 'buying', 'long', 'bullish', 'buy area', 'buying area', 'good buying area',
    'demand zone', 'support', 'entry buy', 'go long', 'buy signal'
  ];
  
  private static readonly SELL_KEYWORDS = [
    'sell', 'selling', 'short', 'bearish', 'sell area', 'selling area', 'good selling area',
    'supply zone', 'resistance', 'entry sell', 'go short', 'sell signal'
  ];

  // Keywords for entry zones
  private static readonly ENTRY_KEYWORDS = [
    'entry', 'buy area', 'buying area', 'sell area', 'selling area', 'good buying area',
    'good selling area', 'demand zone', 'supply zone', 'entry zone', 'zone'
  ];

  // Keywords for targets
  private static readonly TARGET_KEYWORDS = [
    'target', 'tp', 'take profit', 'final target', 'weak high', 'weak low',
    'resistance', 'support', 'objective', 'goal', 'profit target'
  ];

  // Keywords for stop loss
  private static readonly STOPLOSS_KEYWORDS = [
    'stop loss', 'sl', 'stop', 'invalidation', 'risk', 'below', 'above'
  ];

  /**
   * Parse enhanced signal format like the XAUUSD example
   */
  static parseEnhancedSignal(text: string): ParsedSignalData | null {
    try {
      logger.info('🔍 Parsing enhanced signal format...');

      // Extract symbol
      const symbol = SymbolParser.extractSymbol(text);
      if (!symbol) {
        logger.warn('❌ Could not extract symbol from signal');
        return null;
      }

      // Detect action (BUY/SELL)
      let action = this.detectAction(text);
      
      // Extract entry zone
      let entryZone = this.extractEntryZone(text);
      
      // Extract targets
      let targets = this.extractTargets(text);
      
      // Extract stop loss (if mentioned)
      let stopLoss = this.extractStopLoss(text);
      
      // 🚀 AGGRESSIVE PARSING MODE: If no complete signal found but we have a symbol
      if (!entryZone && !targets.length && !stopLoss) {
        logger.info('🚀 Activating aggressive parsing mode - creating signal from symbol only');
        
        // Create a minimal trading signal with auto-generated parameters
        const autoSignal = this.createAutoTradingSignal(symbol, text);
        if (autoSignal) {
          return autoSignal;
        }
      }
      
      // Generate automatic stop loss if not provided
      if (!stopLoss && entryZone) {
        stopLoss = this.generateAutoStopLoss(action, entryZone, targets);
        logger.info(`🤖 Auto-generated stop loss: ${stopLoss} (based on entry zone and risk management)`);
      }
      
      // Extract reasoning
      const reasoning = this.extractReasoning(text);
      
      // Extract market context
      const marketContext = this.extractMarketContext(text);
      
      // Extract timeframe
      const timeframe = this.extractTimeframe(text);
      
      // Calculate confidence based on completeness
      const confidence = this.calculateConfidence(text, entryZone, targets, reasoning);

      const parsedSignal: ParsedSignalData = {
        symbol,
        action,
        entryZone,
        targets,
        stopLoss,
        confidence,
        reasoning,
        marketContext,
        timeframe,
        originalText: text
      };

      logger.info(`✅ Enhanced signal parsed: ${symbol} ${action} | Entry: ${entryZone?.min}-${entryZone?.max} | Targets: ${targets.length} | Confidence: ${confidence}%`);
      return parsedSignal;

    } catch (error) {
      logger.error('❌ Enhanced signal parsing failed:', error);
      return null;
    }
  }

  /**
   * Detect BUY or SELL action from context
   */
  private static detectAction(text: string): 'BUY' | 'SELL' | 'AUTO_DETECT' {
    const lowerText = text.toLowerCase();

    // Check for explicit buy indicators
    for (const keyword of this.BUY_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return 'BUY';
      }
    }

    // Check for explicit sell indicators
    for (const keyword of this.SELL_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return 'SELL';
      }
    }

    // Check market structure context
    if (lowerText.includes('bullish') || lowerText.includes('uptrend')) {
      return 'BUY';
    }
    
    if (lowerText.includes('bearish') || lowerText.includes('downtrend')) {
      return 'SELL';
    }

    return 'AUTO_DETECT';
  }

  /**
   * Extract entry zone from various formats
   */
  private static extractEntryZone(text: string): { min: number; max: number } | undefined {
    // Pattern for ranges like (3864 – 3854) or (3864-3854)
    const rangePatterns = [
      /\((\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\)/,          // (3864 – 3854)
      /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/,              // 3864 – 3854
      /area[:\s]*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/i,   // area: 3864 – 3854
      /zone[:\s]*(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/i,   // zone: 3864 – 3854
      /between\s*(\d+(?:\.\d+)?)\s*and\s*(\d+(?:\.\d+)?)/i,    // between 3864 and 3854
      /from\s*(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)/i         // from 3864 to 3854
    ];

    for (const pattern of rangePatterns) {
      const match = text.match(pattern);
      if (match) {
        const value1 = parseFloat(match[1]);
        const value2 = parseFloat(match[2]);
        
        return {
          min: Math.min(value1, value2),
          max: Math.max(value1, value2)
        };
      }
    }

    // Look for single entry points
    const singleEntryPatterns = [
      /entry[:\s]*(\d+(?:\.\d+)?)/i,
      /at[:\s]*(\d+(?:\.\d+)?)/i,
      /level[:\s]*(\d+(?:\.\d+)?)/i
    ];

    for (const pattern of singleEntryPatterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        return { min: value, max: value };
      }
    }

    return undefined;
  }

  /**
   * Extract target levels
   */
  private static extractTargets(text: string): number[] {
    const targets: number[] = [];
    
    // Patterns for different target formats
    const targetPatterns = [
      /weak high[:\s]*\(?(\d+(?:\.\d+)?)\)?/gi,        // weak high (3905)
      /final target[:\s]*\(?(\d+(?:\.\d+)?)\)?/gi,     // Final Target (3924)
      /target[:\s]*(\d+(?:\.\d+)?)/gi,                 // target 3905
      /tp[:\s]*(\d+(?:\.\d+)?)/gi,                     // TP 3905
      /take profit[:\s]*(\d+(?:\.\d+)?)/gi,            // take profit 3905
      /resistance[:\s]*(\d+(?:\.\d+)?)/gi,             // resistance 3924
      /objective[:\s]*(\d+(?:\.\d+)?)/gi               // objective 3905
    ];

    for (const pattern of targetPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const target = parseFloat(match[1]);
        if (!isNaN(target) && !targets.includes(target)) {
          targets.push(target);
        }
      }
    }

    // Sort targets in ascending order
    return targets.sort((a, b) => a - b);
  }

  /**
   * Extract stop loss (often not explicitly mentioned)
   */
  private static extractStopLoss(text: string): number | undefined {
    const stopLossPatterns = [
      /stop loss[:\s]*(\d+(?:\.\d+)?)/gi,
      /sl[:\s]*(\d+(?:\.\d+)?)/gi,
      /stop[:\s]*(\d+(?:\.\d+)?)/gi,
      /invalidation[:\s]*(\d+(?:\.\d+)?)/gi,
      /below[:\s]*(\d+(?:\.\d+)?)/gi,
      /above[:\s]*(\d+(?:\.\d+)?)/gi
    ];

    for (const pattern of stopLossPatterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return undefined;
  }

  /**
   * Generate automatic stop loss based on entry zone and risk management principles
   */
  private static generateAutoStopLoss(
    action: 'BUY' | 'SELL' | 'AUTO_DETECT', 
    entryZone: { min: number; max: number }, 
    targets: number[]
  ): number {
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const zoneSize = Math.abs(entryZone.max - entryZone.min);
    
    // Conservative approach: Stop loss beyond the entry zone
    let stopLoss: number;
    
    if (action === 'BUY') {
      // For BUY: Stop loss below the lower boundary of entry zone
      // Use zone size as buffer or minimum 20 pips (for XAUUSD, this would be 2.0)
      const buffer = Math.max(zoneSize * 0.5, entryMid * 0.001); // 0.1% buffer minimum
      stopLoss = entryZone.min - buffer;
    } else {
      // For SELL: Stop loss above the upper boundary of entry zone
      const buffer = Math.max(zoneSize * 0.5, entryMid * 0.001); // 0.1% buffer minimum
      stopLoss = entryZone.max + buffer;
    }
    
    // Ensure stop loss gives reasonable risk-reward ratio (at least 1:1.5)
    if (targets.length > 0) {
      const firstTarget = targets[0];
      const entryToTarget = Math.abs(firstTarget - entryMid);
      const entryToStop = Math.abs(stopLoss - entryMid);
      
      // If risk-reward is poor, adjust stop loss
      if (entryToStop > entryToTarget * 0.8) {
        const maxRisk = entryToTarget * 0.6; // Allow max 0.6:1 risk-reward
        if (action === 'BUY') {
          stopLoss = entryMid - maxRisk;
        } else {
          stopLoss = entryMid + maxRisk;
        }
      }
    }
    
    // Round to appropriate decimal places based on the entry price magnitude
    const decimalPlaces = entryMid > 100 ? 1 : 4;
    return Number(stopLoss.toFixed(decimalPlaces));
  }

  /**
   * Extract reasoning/analysis points
   */
  private static extractReasoning(text: string): string[] {
    const reasoning: string[] = [];
    
    // Look for bullet points and structured reasoning
    const reasoningPatterns = [
      /[-•]\s*([^-•\n]+)/g,                    // Bullet points
      /reason[^:]*:\s*([^\n]+)/gi,             // Buying Reason:
      /analysis[^:]*:\s*([^\n]+)/gi,           // Analysis:
      /because[^:]*:\s*([^\n]+)/gi,            // Because:
      /why[^:]*:\s*([^\n]+)/gi                 // Why:
    ];

    for (const pattern of reasoningPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const reason = match[1].trim();
        if (reason && reason.length > 10) {
          reasoning.push(reason);
        }
      }
    }

    return reasoning;
  }

  /**
   * Extract market context and structure analysis
   */
  private static extractMarketContext(text: string): string {
    const contextKeywords = [
      'market structure', 'bullish', 'bearish', 'trend', 'uptrend', 'downtrend',
      'support', 'resistance', 'demand', 'supply', 'break of structure',
      'retracement', 'impulse', 'consolidation'
    ];

    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      for (const keyword of contextKeywords) {
        if (lowerSentence.includes(keyword)) {
          return sentence.trim();
        }
      }
    }

    return 'General market analysis';
  }

  /**
   * Extract timeframe information
   */
  private static extractTimeframe(text: string): string | undefined {
    const timeframePatterns = [
      /\((\d+[mhd])\)/,                        // (30m), (1h), (1d)
      /(\d+)\s*min/i,                          // 30 min
      /(\d+)\s*hour/i,                         // 1 hour
      /(\d+)\s*day/i,                          // 1 day
      /(m\d+|h\d+|d\d+)/i,                     // M30, H1, D1
      /(1m|5m|15m|30m|1h|4h|1d|1w)/i          // Standard timeframes
    ];

    for (const pattern of timeframePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return undefined;
  }

  /**
   * Calculate confidence based on signal completeness and quality
   */
  private static calculateConfidence(
    text: string, 
    entryZone?: { min: number; max: number }, 
    targets?: number[], 
    reasoning?: string[]
  ): number {
    let confidence = 50; // Base confidence

    // Entry zone quality
    if (entryZone) {
      confidence += 20;
      
      // Bonus for range entries (more professional)
      if (entryZone.min !== entryZone.max) {
        confidence += 5;
      }
    }

    // Target analysis
    if (targets && targets.length > 0) {
      confidence += 15;
      
      // Bonus for multiple targets
      if (targets.length > 1) {
        confidence += 5;
      }
    }

    // Reasoning quality
    if (reasoning && reasoning.length > 0) {
      confidence += 10;
      
      // Bonus for detailed analysis
      if (reasoning.length > 2) {
        confidence += 5;
      }
    }

    // Text quality indicators
    if (text.includes('market structure')) confidence += 3;
    if (text.includes('demand') || text.includes('supply')) confidence += 3;
    if (text.includes('high probability')) confidence += 5;
    if (text.includes('safe')) confidence += 3;

    // Deduct for missing elements
    if (!entryZone) confidence -= 15;
    if (!targets || targets.length === 0) confidence -= 10;

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Convert parsed signal to TradeSignal format with automatic level calculation
   */
  static toTradeSignal(parsed: ParsedSignalData, accountEquity?: number): TradeSignal {
    let stopLoss = parsed.stopLoss || 0;
    let targets = parsed.targets;

    // If no stop loss provided and we have entry zone, calculate risk-based levels
    if (!stopLoss && parsed.entryZone && parsed.entryZone.min > 0 && parsed.entryZone.max > 0) {
      const levels = this.calculateRiskBasedLevels(parsed, accountEquity || 10000);
      stopLoss = levels.stopLoss;
      
      // If no targets provided, use the calculated take profit
      if (!targets || targets.length === 0) {
        targets = [levels.takeProfit];
      }

      logger.info(`🎯 Auto-calculated levels for ${parsed.symbol}:`, {
        entry: `${parsed.entryZone.min}-${parsed.entryZone.max}`,
        stopLoss: stopLoss,
        takeProfit: levels.takeProfit,
        riskPercent: process.env.RISK_PERCENTAGE || '0.45%'
      });
    }

    return {
      symbol: parsed.symbol,
      action: parsed.action === 'AUTO_DETECT' ? 'BUY' : parsed.action,
      entryZone: parsed.entryZone || { min: 0, max: 0 },
      stopLoss: stopLoss,
      targets: targets,
      confidence: parsed.confidence / 100,
      reason: parsed.reasoning.join('; '),
      plan: parsed.marketContext
    };
  }

  /**
   * Calculate risk-based stop loss and take profit levels
   */
  private static calculateRiskBasedLevels(parsed: ParsedSignalData, accountEquity: number): {stopLoss: number, takeProfit: number} {
    if (!parsed.entryZone || parsed.entryZone.min === 0 || parsed.entryZone.max === 0) {
      return { stopLoss: 0, takeProfit: 0 };
    }

    // Use the middle of entry zone as entry price
    const entryPrice = (parsed.entryZone.min + parsed.entryZone.max) / 2;
    const direction = parsed.action?.toUpperCase();
    
    // Get risk percentage from environment (0.45% default)
    const riskPercent = parseFloat(process.env.RISK_PERCENTAGE || '0.45');
    const riskAmount = (accountEquity * riskPercent) / 100;
    
    // Get symbol information for accurate calculations
    const symbolInfo = this.getSymbolInfo(parsed.symbol);
    
    // Calculate position size that would risk the target amount
    // For XAUUSD: riskAmount / (stopLossDistance * contractSize * pipValue)
    // We need to work backwards from desired risk amount to stop loss distance
    
    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'BUY') {
      // For buy trades, stop loss below entry, take profit above
      // Use a reasonable stop loss distance (e.g., $20-30 for XAUUSD)
      const stopLossDistance = parsed.symbol === 'XAUUSD' ? 25 : (entryPrice * 0.005); // $25 for gold, 0.5% for others
      stopLoss = entryPrice - stopLossDistance;
      takeProfit = entryPrice + stopLossDistance; // 1:1 ratio
      
    } else if (direction === 'SELL') {
      const stopLossDistance = parsed.symbol === 'XAUUSD' ? 25 : (entryPrice * 0.005);
      stopLoss = entryPrice + stopLossDistance;
      takeProfit = entryPrice - stopLossDistance; // 1:1 ratio
      
    } else {
      return { stopLoss: 0, takeProfit: 0 };
    }

    return {
      stopLoss: parseFloat(stopLoss.toFixed(symbolInfo.digits)),
      takeProfit: parseFloat(takeProfit.toFixed(symbolInfo.digits))
    };
  }

  /**
   * Get symbol-specific information for calculations
   */
  private static getSymbolInfo(symbol: string) {
    const symbolMap: { [key: string]: any } = {
      'XAUUSD': { digits: 2, pipSize: 0.01 },
      'EURUSD': { digits: 5, pipSize: 0.00001 },
      'GBPUSD': { digits: 5, pipSize: 0.00001 },
      'USDJPY': { digits: 3, pipSize: 0.001 },
      'EURCHF': { digits: 5, pipSize: 0.00001 },
      'GBPJPY': { digits: 3, pipSize: 0.001 },
      'EURJPY': { digits: 3, pipSize: 0.001 }
    };

    return symbolMap[symbol] || symbolMap['EURUSD'];
  }

  /**
   * Create automatic trading signal from minimal information
   * Used when we have a symbol but no explicit trading parameters
   */
  private static createAutoTradingSignal(symbol: string, originalText: string): ParsedSignalData {
    logger.info(`🤖 Creating automatic trading signal for ${symbol}`);
    
    // ❌ REMOVED: Hardcoded market prices that become stale
    // Instead, signal auto-generation should use real-time market data
    // or be disabled when insufficient signal information is provided
    
    logger.warn(`⚠️ Insufficient signal data for ${symbol}. Auto-generation disabled to prevent stale price usage.`);
    throw new Error('Insufficient signal data - manual signal required');
  }
}