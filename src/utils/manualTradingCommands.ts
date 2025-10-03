// Manual Trading Commands System
// File: src/utils/manualTradingCommands.ts

import { logger } from './logger';

export interface ManualTradeCommand {
  orderId?: string;
  action: 'BUY' | 'SELL' | 'CLOSE' | 'CLOSE_ALL' | 'STATUS' | 'POSITIONS' | 'BALANCE';
  volume?: number;
  symbol?: string;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  targetTicket?: string; // For closing specific trades
  isManual: true;
  source: 'MANUAL_COMMAND';
}

export class ManualTradingCommands {
  
  /**
   * Parse manual trading commands from chat messages
   * 
   * OPENING TRADES:
   * Format: "Open Order #34558496 Buy 0.1 #EURUSD @1.18079"
   * Format: "BUY 0.05 #SILVER @30.50 SL:30.00 TP:31.00"
   * Format: "SELL 0.1 XAUUSD @ 2650 sl 2660 tp 2640"
   * 
   * CLOSING TRADES:
   * Format: "CLOSE #12345678" - Close specific ticket
   * Format: "CLOSE XAUUSD" - Close all XAUUSD positions
   * Format: "CLOSE ALL" - Close all positions
   * Format: "CLOSE BUY XAUUSD" - Close all buy positions for XAUUSD
   * Format: "CLOSE SELL" - Close all sell positions
   * 
   * STATUS COMMANDS:
   * Format: "STATUS" - Show account status
   * Format: "POSITIONS" - Show open positions
   * Format: "BALANCE" - Show account balance
   * Format: "ACCOUNT" - Show account info
   */
  static parseManualCommand(message: string): ManualTradeCommand | null {
    try {
      const text = message.toUpperCase().trim();
      logger.info(`🔍 Parsing manual command: "${message}"`);
      
      // CLOSING COMMANDS
      
      // Pattern: "CLOSE ALL" - Close all positions
      if (/^CLOSE\s+ALL$/i.test(text)) {
        return {
          action: 'CLOSE_ALL',
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern: "CLOSE #12345678" - Close specific ticket
      const closeTicketPattern = /^CLOSE\s+#(\d+)$/i;
      const closeTicketMatch = text.match(closeTicketPattern);
      if (closeTicketMatch) {
        return {
          action: 'CLOSE',
          targetTicket: closeTicketMatch[1],
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern: "CLOSE XAUUSD" - Close all positions for symbol
      const closeSymbolPattern = /^CLOSE\s+([A-Z]{3,10})$/i;
      const closeSymbolMatch = text.match(closeSymbolPattern);
      if (closeSymbolMatch) {
        return {
          action: 'CLOSE',
          symbol: this.normalizeSymbol(closeSymbolMatch[1]),
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern: "CLOSE BUY/SELL SYMBOL" - Close specific direction for symbol
      const closeDirectionPattern = /^CLOSE\s+(BUY|SELL)\s+([A-Z]{3,10})$/i;
      const closeDirectionMatch = text.match(closeDirectionPattern);
      if (closeDirectionMatch) {
        return {
          action: 'CLOSE',
          symbol: this.normalizeSymbol(closeDirectionMatch[2]),
          volume: closeDirectionMatch[1] === 'BUY' ? 1 : -1, // Use volume to indicate direction
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern: "CLOSE BUY" or "CLOSE SELL" - Close all buy/sell positions
      const closeAllDirectionPattern = /^CLOSE\s+(BUY|SELL)$/i;
      const closeAllDirectionMatch = text.match(closeAllDirectionPattern);
      if (closeAllDirectionMatch) {
        return {
          action: 'CLOSE',
          volume: closeAllDirectionMatch[1] === 'BUY' ? 1 : -1, // Use volume to indicate direction
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // STATUS COMMANDS
      
      // Pattern: "STATUS", "ACCOUNT", "INFO"
      if (/^(STATUS|ACCOUNT|INFO)$/i.test(text)) {
        return {
          action: 'STATUS',
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern: "POSITIONS", "TRADES", "OPEN"
      if (/^(POSITIONS|TRADES|OPEN)$/i.test(text)) {
        return {
          action: 'POSITIONS',
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // Pattern: "BALANCE", "EQUITY", "MONEY"
      if (/^(BALANCE|EQUITY|MONEY)$/i.test(text)) {
        return {
          action: 'BALANCE',
          isManual: true,
          source: 'MANUAL_COMMAND'
        };
      }
      
      // OPENING TRADE COMMANDS (existing patterns)
      
      // Pattern 1: "Open Order #ID BUY/SELL volume #SYMBOL @price"
      const pattern1 = /OPEN\s+ORDER\s+#(\d+)\s+(BUY|SELL)\s+([\d.]+)\s+#?(\w+)(?:\s+@([\d.]+))?/i;
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
   * Normalize symbol names using Universal Broker Service
   * Replaces hardcoded InstantFunding logic with dynamic broker detection
   */
  private static normalizeSymbol(symbol: string): string {
    // Basic symbol normalization - remove common prefixes/suffixes and standardize
    let normalized = symbol
      .toUpperCase()
      .replace(/^#/, '')           // Remove # prefix if present
      .replace(/\.(X|M)$/, '')     // Remove broker-specific suffixes
      .trim();
    
    // Common symbol aliases (broker-agnostic)
    const aliases: Record<string, string> = {
      'GOLD': 'XAUUSD',
      'SILVER': 'XAGUSD',
      'NASDAQ': 'NAS100',
      'DOW': 'US30',
      'SP500': 'SPX500',
      'DAX': 'GER30',
      'FTSE': 'UK100'
    };
    
    // Apply alias if found
    if (aliases[normalized]) {
      normalized = aliases[normalized];
    }
    
    return normalized;
  }
  
  /**
   * Validate manual command before execution
   */
  static validateCommand(command: ManualTradeCommand): { valid: boolean; error?: string } {
    // Status commands don't need validation
    if (['STATUS', 'POSITIONS', 'BALANCE', 'CLOSE_ALL'].includes(command.action)) {
      return { valid: true };
    }
    
    // Close specific ticket only needs ticket
    if (command.action === 'CLOSE' && command.targetTicket) {
      return { valid: true };
    }
    
    // Trading commands need symbol and volume validation
    if (command.action === 'BUY' || command.action === 'SELL') {
      if (!command.symbol || command.symbol.length < 3) {
        return { valid: false, error: 'Invalid symbol' };
      }
      
      if (!command.volume || command.volume <= 0 || command.volume > 100) {
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
    }
    
    return { valid: true };
  }
  
  /**
   * Format command for logging
   */
  static formatCommand(command: ManualTradeCommand): string {
    switch (command.action) {
      case 'STATUS':
        return 'STATUS - Show account information';
      case 'POSITIONS':
        return 'POSITIONS - Show open positions';
      case 'BALANCE':
        return 'BALANCE - Show account balance';
      case 'CLOSE_ALL':
        return 'CLOSE ALL - Close all positions';
      case 'CLOSE':
        if (command.targetTicket) {
          return `CLOSE #${command.targetTicket} - Close specific trade`;
        } else if (command.symbol && command.volume) {
          const direction = command.volume > 0 ? 'BUY' : 'SELL';
          return `CLOSE ${direction} ${command.symbol} - Close ${direction} positions`;
        } else if (command.symbol) {
          return `CLOSE ${command.symbol} - Close all ${command.symbol} positions`;
        } else if (command.volume) {
          const direction = command.volume > 0 ? 'BUY' : 'SELL';
          return `CLOSE ${direction} - Close all ${direction} positions`;
        }
        return 'CLOSE - Close positions';
      default:
        let formatted = `${command.action} ${command.volume || 0} ${command.symbol || ''}`;
        
        if (command.price) formatted += ` @ ${command.price}`;
        if (command.stopLoss) formatted += ` SL:${command.stopLoss}`;
        if (command.takeProfit) formatted += ` TP:${command.takeProfit}`;
        if (command.orderId) formatted += ` (Order #${command.orderId})`;
        
        return formatted;
    }
  }
  
  /**
   * Check if message contains manual trading command
   */
  static isManualCommand(message: string): boolean {
    const upperMessage = message.toUpperCase();
    
    const patterns = [
      // Opening trades
      /OPEN\s+ORDER\s+#\d+/,
      /(BUY|SELL)\s+[\d.]+\s+#?\w+/,
      /\w+\s+(BUY|SELL)\s+[\d.]+/,
      
      // Closing trades
      /^CLOSE\s+(ALL|#\d+|\w+|(BUY|SELL)(\s+\w+)?)$/,
      
      // Status commands
      /^(STATUS|ACCOUNT|INFO|POSITIONS|TRADES|OPEN|BALANCE|EQUITY|MONEY)$/
    ];
    
    return patterns.some(pattern => pattern.test(upperMessage));
  }
}
