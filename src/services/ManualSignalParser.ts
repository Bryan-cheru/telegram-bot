import { logger } from '../utils/logger';
import { calculateFixedDollarStopsAndTargets, formatPriceForInstrument } from '../trading/riskMath';
import { config } from '../utils/config';

export interface ManualSignalConfig {
  fixedLotSize: number;
  maxRiskPerTrade: number;
  riskRewardRatio: number;
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
  private cfg: ManualSignalConfig = {
    fixedLotSize: config.trading.fixedLotSize,
    maxRiskPerTrade: config.trading.fixedRiskAmount,
    riskRewardRatio: parseFloat(process.env.RISK_REWARD_RATIO || '1.5')
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
      
      const { stopLoss: rawSL, targets } = calculateFixedDollarStopsAndTargets({
        symbol,
        entryPrice,
        direction,
        config: {
          lotSize: this.cfg.fixedLotSize,
          riskAmount: this.cfg.maxRiskPerTrade,
          riskRewardRatio: this.cfg.riskRewardRatio
        }
      });
      const stopLoss = formatPriceForInstrument(rawSL, symbol);
      const takeProfit = formatPriceForInstrument(targets[0], symbol);
      const rewardAmount = this.cfg.maxRiskPerTrade * this.cfg.riskRewardRatio;

      const parsedSignal: ParsedManualSignal = {
        symbol,
        direction,
        entryPrice,
        stopLoss,
        takeProfit,
        lotSize: this.cfg.fixedLotSize,
        riskAmount: this.cfg.maxRiskPerTrade,
        rewardAmount,
        source: 'MANUAL'
      };

      logger.info(`✅ Manual signal parsed: ${direction} ${symbol} @ ${entryPrice} | SL ${stopLoss} | TP ${takeProfit} | lot ${this.cfg.fixedLotSize} | risk $${this.cfg.maxRiskPerTrade}`);
      
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
   * Generate a user-friendly confirmation message
   */
  generateConfirmationMessage(signal: ParsedManualSignal): string {
    const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
    const tpDistance = Math.abs(signal.takeProfit - signal.entryPrice);
    
    return `
📊 *Manual Signal Parsed*

🎯 *Trade Setup:*
Symbol: ${signal.symbol}
Direction: ${signal.direction}
Entry: ${signal.entryPrice}

📉 *Risk Management:*
Stop Loss: ${signal.stopLoss} (distance: ${slDistance.toFixed(4)})
Take Profit: ${signal.takeProfit} (distance: ${tpDistance.toFixed(4)})
Lot Size: ${signal.lotSize}

💰 *P&L Expectations:*
Risk: $${signal.riskAmount}  |  Reward: $${signal.rewardAmount.toFixed(0)}
Risk/Reward: 1:${this.cfg.riskRewardRatio}

Reply with:
✅ *CONFIRM* to execute
❌ *CANCEL* to abort
    `.trim();
  }

  updateConfig(updates: Partial<ManualSignalConfig>): void {
    this.cfg = { ...this.cfg, ...updates };
    logger.info('✅ Manual signal config updated:', updates);
  }

  getConfig(): ManualSignalConfig {
    return { ...this.cfg };
  }
}
