// Manual Trading Commands System
// File: src/utils/manualTradingCommands.ts

import { logger } from './logger';

export interface ManualTradeCommand {
  orderId?: string;
  action: 'BUY' | 'SELL';
  volume: number;
  symbol: string;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  isManual: true;
  source: 'MANUAL_COMMAND';
}

export class ManualTradingCommands {
  
  /**
   * Parse manual trading commands from chat messages
   * Format: "Open Order #34558496 Buy 0.1 #EURUSD @1.18079"
   * Format: "BUY 0.05 #SILVER @30.50 SL:30.00 TP:31.00"
   * Format: "SELL 0.1 XAUUSD @ 2650 sl 2660 tp 2640"
   */
  static parseManualCommand(message: string): ManualTradeCommand | null {
    try {
      const text = message.toUpperCase().trim();
      logger.info(`🔍 Parsing manual command: "${message}"`);
      
      // Pattern 1: "Open Order #ID BUY/SELL volume #SYMBOL @price"
      const pattern1 = /OPEN\s+ORDER\s+#(\d+)\s+(BUY|SELL)\s+([\d.]+)\s+#(\w+)(?:\s+@([\d.]+))?/i;
      const match1 = text.match(pattern1);
      
      if (match1) {
        const [, orderId, action, volume, symbol, price] = match1;
        
        return {
          orderId,
          action: action as 'BUY' | 'SELL',
          volume: parseFloat(volume),
          symbol: this.normalizeSymbol(symbol),
          price: price ? parseFloat(price) : undefined,
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern 2: "BUY/SELL volume #SYMBOL @price SL:price TP:price"
      const pattern2 = /(BUY|SELL)\s+([\d.]+)\s+#?(\w+)(?:\s+@([\d.]+))?(?:\s+SL:?([\d.]+))?(?:\s+TP:?([\d.]+))?/i;
      const match2 = text.match(pattern2);
      
      if (match2) {
        const [, action, volume, symbol, price, stopLoss, takeProfit] = match2;
        
        return {
          action: action as 'BUY' | 'SELL',
          volume: parseFloat(volume),
          symbol: this.normalizeSymbol(symbol),
          price: price ? parseFloat(price) : undefined,
          stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
          takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern 3: "SYMBOL BUY/SELL volume @ price"
      const pattern3 = /(\w+)\s+(BUY|SELL)\s+([\d.]+)(?:\s+@([\d.]+))?/i;
      const match3 = text.match(pattern3);
      
      if (match3) {
        const [, symbol, action, volume, price] = match3;
        
        return {
          action: action as 'BUY' | 'SELL',
          volume: parseFloat(volume),
          symbol: this.normalizeSymbol(symbol),
          price: price ? parseFloat(price) : undefined,
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      return null;
      
    } catch (error) {
      logger.error('❌ Error parsing manual command:', error);
      return null;
    }
  }
  
  /**
   * Normalize symbol names (apply SILVER->XAGUSD conversion)
   */
  private static normalizeSymbol(symbol: string): string {
    const clean = symbol.toUpperCase().replace(/[^A-Z]/g, '');
    
    // Apply manual symbol mappings like MT5 Copier
    const symbolMappings: Record<string, string> = {
      'SILVER': 'XAGUSD',
      'GOLD': 'XAUUSD',
      'SILVERUSD': 'XAGUSD',
      'GOLDUSD': 'XAUUSD'
    };
    
    return symbolMappings[clean] || clean;
  }
  
  /**
   * Validate manual command before execution
   */
  static validateCommand(command: ManualTradeCommand): { valid: boolean; error?: string } {
    if (!command.symbol || command.symbol.length < 3) {
      return { valid: false, error: 'Invalid symbol' };
    }
    
    if (command.volume <= 0 || command.volume > 100) {
      return { valid: false, error: 'Volume must be between 0.01 and 100' };
    }
    
    if (command.price && command.price <= 0) {
      return { valid: false, error: 'Price must be positive' };
    }
    
    if (command.stopLoss && command.takeProfit) {
      if (command.action === 'BUY' && command.stopLoss >= command.takeProfit) {
        return { valid: false, error: 'For BUY: Stop Loss must be below Take Profit' };
      }
      if (command.action === 'SELL' && command.stopLoss <= command.takeProfit) {
        return { valid: false, error: 'For SELL: Stop Loss must be above Take Profit' };
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Format command for logging
   */
  static formatCommand(command: ManualTradeCommand): string {
    let formatted = `${command.action} ${command.volume} ${command.symbol}`;
    
    if (command.price) formatted += ` @ ${command.price}`;
    if (command.stopLoss) formatted += ` SL:${command.stopLoss}`;
    if (command.takeProfit) formatted += ` TP:${command.takeProfit}`;
    if (command.orderId) formatted += ` (Order #${command.orderId})`;
    
    return formatted;
  }
  
  /**
   * Check if message contains manual trading command
   */
  static isManualCommand(message: string): boolean {
    const upperMessage = message.toUpperCase();
    
    const patterns = [
      /OPEN\s+ORDER\s+#\d+/,
      /(BUY|SELL)\s+[\d.]+\s+#?\w+/,
      /\w+\s+(BUY|SELL)\s+[\d.]+/
    ];
    
    return patterns.some(pattern => pattern.test(upperMessage));
  }
}
