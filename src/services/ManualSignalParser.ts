import { logger } from '../utils/logger';

export interface ManualSignalConfig {
  fixedLotSize: number;
  maxRiskPerTrade: number;
  targetReward: number;
  riskRewardRatio: number;
  
  // Pip values per 0.01 move per lot for each instrument
  pipValues: {
    [symbol: string]: number;
  };
}

export interface ParsedManualSignal {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  riskAmount: number;
  rewardAmount: number;
  source: 'MANUAL';
}

export class ManualSignalParser {
  private config: ManualSignalConfig = {
    fixedLotSize: 0.65,
    maxRiskPerTrade: 1000,
    targetReward: 1500,
    riskRewardRatio: 1.5,
    
    pipValues: {
      // Metals
      'XAGUSD': 0.5,   // Silver: $0.50 per 0.01 move per lot
      'XAUUSD': 1.0,   // Gold: $1.00 per 0.01 move per lot
      
      // Forex majors
      'EURUSD': 10.0,  // $10 per 0.0001 (pip) per lot
      'GBPUSD': 10.0,
      'AUDUSD': 10.0,
      'NZDUSD': 10.0,
      'USDCAD': 10.0,
      'USDCHF': 10.0,
      
      // JPY pairs
      'USDJPY': 10.0,  // $10 per 0.01 (pip) per lot
      'EURJPY': 10.0,
      'GBPJPY': 10.0,
      
      // Crypto
      'BTCUSD': 1.0,   // Bitcoin: $1 per $1 move per lot
      
      // Default fallback
      'DEFAULT': 1.0
    }
  };

  /**
   * Parse manual signal from simple text format
   * Supports formats like:
   * - "XAGUSD BUY 50.9207"
   * - "Silver buy at 50.9207"
   * - "SELL GOLD 3590.50"
   * - "Buy EURUSD 1.0850"
   */
  parseSignal(text: string): ParsedManualSignal | null {
    try {
      logger.info(`📝 Parsing manual signal: "${text}"`);
      
      // Clean up the text
      const cleanText = text.trim().toUpperCase();
      
      // Extract symbol
      const symbol = this.extractSymbol(cleanText);
      if (!symbol) {
        logger.warn('❌ Could not extract symbol from manual signal');
        return null;
      }
      
      // Extract direction
      const direction = this.extractDirection(cleanText);
      if (!direction) {
        logger.warn('❌ Could not extract direction from manual signal');
        return null;
      }
      
      // Extract entry price
      const entryPrice = this.extractEntryPrice(cleanText);
      if (!entryPrice) {
        logger.warn('❌ Could not extract entry price from manual signal');
        return null;
      }
      
      // Calculate stop loss and take profit
      const { stopLoss, takeProfit } = this.calculateStopAndTarget(
        symbol,
        direction,
        entryPrice
      );
      
      const parsedSignal: ParsedManualSignal = {
        symbol,
        direction,
        entryPrice,
        stopLoss,
        takeProfit,
        lotSize: this.config.fixedLotSize,
        riskAmount: this.config.maxRiskPerTrade,
        rewardAmount: this.config.targetReward,
        source: 'MANUAL'
      };
      
      logger.info(`✅ Manual signal parsed successfully:`);
      logger.info(`   Symbol: ${symbol}`);
      logger.info(`   Direction: ${direction}`);
      logger.info(`   Entry: ${entryPrice}`);
      logger.info(`   Stop Loss: ${stopLoss} (Risk: $${this.config.maxRiskPerTrade})`);
      logger.info(`   Take Profit: ${takeProfit} (Reward: $${this.config.targetReward})`);
      logger.info(`   Lot Size: ${this.config.fixedLotSize}`);
      logger.info(`   Risk/Reward: 1:${this.config.riskRewardRatio}`);
      
      return parsedSignal;
      
    } catch (error) {
      logger.error('❌ Error parsing manual signal:', error);
      return null;
    }
  }

  /**
   * Extract trading symbol from text
   */
  private extractSymbol(text: string): string | null {
    // Common symbol patterns
    const symbolPatterns = [
      // Metals
      { pattern: /XAG(?:USD)?|SILVER/i, symbol: 'XAGUSD' },
      { pattern: /XAU(?:USD)?|GOLD/i, symbol: 'XAUUSD' },
      
      // Forex majors
      { pattern: /EUR\s*USD|EURUSD/i, symbol: 'EURUSD' },
      { pattern: /GBP\s*USD|GBPUSD/i, symbol: 'GBPUSD' },
      { pattern: /USD\s*JPY|USDJPY/i, symbol: 'USDJPY' },
      { pattern: /AUD\s*USD|AUDUSD/i, symbol: 'AUDUSD' },
      { pattern: /NZD\s*USD|NZDUSD/i, symbol: 'NZDUSD' },
      { pattern: /USD\s*CAD|USDCAD/i, symbol: 'USDCAD' },
      { pattern: /USD\s*CHF|USDCHF/i, symbol: 'USDCHF' },
      
      // JPY crosses
      { pattern: /EUR\s*JPY|EURJPY/i, symbol: 'EURJPY' },
      { pattern: /GBP\s*JPY|GBPJPY/i, symbol: 'GBPJPY' },
      
      // Crypto
      { pattern: /BTC(?:USD)?|BITCOIN/i, symbol: 'BTCUSD' },
      
      // Generic 6-letter format
      { pattern: /\b([A-Z]{6})\b/, symbol: null } // Use captured group
    ];
    
    for (const { pattern, symbol } of symbolPatterns) {
      const match = text.match(pattern);
      if (match) {
        return symbol || match[1]; // Use predefined symbol or captured group
      }
    }
    
    return null;
  }

  /**
   * Extract trade direction (BUY/SELL)
   */
  private extractDirection(text: string): 'BUY' | 'SELL' | null {
    if (/\bBUY\b|\bLONG\b/i.test(text)) {
      return 'BUY';
    }
    if (/\bSELL\b|\bSHORT\b/i.test(text)) {
      return 'SELL';
    }
    return null;
  }

  /**
   * Extract entry price from text
   */
  private extractEntryPrice(text: string): number | null {
    // Match various price formats:
    // - 50.9207 (Silver 4-decimal)
    // - 3590.50 (Gold 2-decimal)
    // - 1.0850 (Forex 4-decimal)
    // - 198.500 (JPY 3-decimal)
    
    const pricePatterns = [
      /\b\d{1,2}\.\d{4}\b/,      // Silver: 50.9207
      /\b\d{4}\.\d{1,2}\b/,      // Gold: 3590.50
      /\b\d{1,3}\.\d{3,5}\b/,    // Forex/JPY: 1.08500, 198.500
      /\b\d{5,6}\.\d{1,2}\b/     // Bitcoin: 108105.64
    ];
    
    for (const pattern of pricePatterns) {
      const match = text.match(pattern);
      if (match) {
        const price = parseFloat(match[0]);
        if (!isNaN(price) && price > 0) {
          return price;
        }
      }
    }
    
    return null;
  }

  /**
   * Calculate stop loss and take profit based on fixed risk/reward
   */
  private calculateStopAndTarget(
    symbol: string,
    direction: 'BUY' | 'SELL',
    entryPrice: number
  ): { stopLoss: number; takeProfit: number } {
    // Get pip value for this symbol
    const pipValue = this.config.pipValues[symbol] || this.config.pipValues['DEFAULT'];
    
    // Determine pip size based on symbol type
    let pipSize: number;
    if (symbol.includes('JPY')) {
      pipSize = 0.01;    // JPY pairs: 1 pip = 0.01
    } else if (symbol.includes('XAU') || symbol.includes('XAG')) {
      pipSize = 0.01;    // Metals: 1 pip = 0.01
    } else {
      pipSize = 0.0001;  // Forex majors: 1 pip = 0.0001
    }
    
    logger.info(`💰 Calculating SL/TP for ${symbol}:`);
    logger.info(`   Entry: ${entryPrice}`);
    logger.info(`   Pip Value: $${pipValue} per pip per lot`);
    logger.info(`   Pip Size: ${pipSize}`);
    logger.info(`   Lot Size: ${this.config.fixedLotSize}`);
    
    // Calculate the pip distance needed to risk $1000
    // Formula: Risk $ = Pip Value × Lots × Distance (in pips)
    // Rearranged: Distance (pips) = Risk $ / (Pip Value × Lots)
    const stopDistanceInPips = this.config.maxRiskPerTrade / (pipValue * this.config.fixedLotSize);
    
    // Convert pip distance to actual price distance
    const stopDistance = stopDistanceInPips * pipSize;
    
    logger.info(`   Stop Distance: ${stopDistanceInPips.toFixed(2)} pips (${stopDistance.toFixed(6)} price units)`);
    
    // Calculate target distance (1.5x the stop distance for 1:1.5 RR)
    const targetDistance = stopDistance * this.config.riskRewardRatio;
    
    logger.info(`   Target Distance: ${(stopDistanceInPips * this.config.riskRewardRatio).toFixed(2)} pips (${targetDistance.toFixed(6)} price units)`);
    
    let stopLoss: number;
    let takeProfit: number;
    
    if (direction === 'BUY') {
      stopLoss = entryPrice - stopDistance;
      takeProfit = entryPrice + targetDistance;
    } else {
      stopLoss = entryPrice + stopDistance;
      takeProfit = entryPrice - targetDistance;
    }
    
    // Round to appropriate decimal places based on symbol
    const decimals = this.getDecimalPlaces(symbol);
    stopLoss = parseFloat(stopLoss.toFixed(decimals));
    takeProfit = parseFloat(takeProfit.toFixed(decimals));
    
    logger.info(`   Final SL: ${stopLoss}`);
    logger.info(`   Final TP: ${takeProfit}`);
    
    return { stopLoss, takeProfit };
  }

  /**
   * Get appropriate decimal places for a symbol
   */
  private getDecimalPlaces(symbol: string): number {
    if (symbol.includes('JPY')) return 3;      // JPY pairs: 198.500
    if (symbol.includes('XAU')) return 2;      // Gold: 3590.50
    if (symbol.includes('XAG')) return 4;      // Silver: 50.9207
    if (symbol.includes('BTC')) return 2;      // Bitcoin: 108105.64
    return 5;                                   // Forex: 1.08500
  }

  /**
   * Generate a user-friendly confirmation message
   */
  generateConfirmationMessage(signal: ParsedManualSignal): string {
    const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
    const tpDistance = Math.abs(signal.takeProfit - signal.entryPrice);
    
    return `
📊 Manual Signal Parsed

🎯 **Trade Setup:**
Symbol: ${signal.symbol}
Direction: ${signal.direction}
Entry: ${signal.entryPrice}

📉 **Risk Management:**
Stop Loss: ${signal.stopLoss}
Take Profit: ${signal.takeProfit}
Lot Size: ${signal.lotSize}

💰 **P&L Expectations:**
Risk: $${signal.riskAmount} (SL distance: ${slDistance.toFixed(4)})
Reward: $${signal.rewardAmount} (TP distance: ${tpDistance.toFixed(4)})
Risk/Reward: 1:${this.config.riskRewardRatio}

Reply with:
✅ **CONFIRM** to execute
❌ **CANCEL** to abort
    `.trim();
  }

  /**
   * Update configuration (for admin commands)
   */
  updateConfig(updates: Partial<ManualSignalConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('✅ Manual signal config updated:', updates);
  }

  /**
   * Get current configuration
   */
  getConfig(): ManualSignalConfig {
    return { ...this.config };
  }
}
