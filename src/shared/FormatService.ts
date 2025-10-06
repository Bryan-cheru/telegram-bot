/**
 * Unified Currency & Number Formatting Service
 * Eliminates duplicate formatCurrency implementations
 */

export class FormatService {
  /**
   * Format currency with proper locale and symbols
   */
  public static formatCurrency(amount: number, currency: string = 'USD', options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSymbol?: boolean;
    compact?: boolean;
  }): string {
    if (typeof amount !== 'number' || isNaN(amount)) {
      return '$0.00';
    }

    const {
      minimumFractionDigits = 2,
      maximumFractionDigits = 2,
      showSymbol = true,
      compact = false
    } = options || {};

    try {
      // For compact notation (K, M, B)
      if (compact && Math.abs(amount) >= 1000) {
        return this.formatCompactCurrency(amount, currency, showSymbol);
      }

      const formatter = new Intl.NumberFormat('en-US', {
        style: showSymbol ? 'currency' : 'decimal',
        currency,
        minimumFractionDigits,
        maximumFractionDigits,
      });

      return formatter.format(amount);
    } catch (error) {
      // Fallback for unsupported currencies
      const symbol = this.getCurrencySymbol(currency);
      const formattedNumber = amount.toFixed(maximumFractionDigits);
      return showSymbol ? `${symbol}${formattedNumber}` : formattedNumber;
    }
  }

  /**
   * Format large numbers with K, M, B suffixes
   */
  private static formatCompactCurrency(amount: number, currency: string, showSymbol: boolean): string {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    const symbol = showSymbol ? this.getCurrencySymbol(currency) : '';

    if (absAmount >= 1e9) {
      return `${sign}${symbol}${(absAmount / 1e9).toFixed(1)}B`;
    } else if (absAmount >= 1e6) {
      return `${sign}${symbol}${(absAmount / 1e6).toFixed(1)}M`;
    } else if (absAmount >= 1e3) {
      return `${sign}${symbol}${(absAmount / 1e3).toFixed(1)}K`;
    } else {
      return `${sign}${symbol}${absAmount.toFixed(2)}`;
    }
  }

  /**
   * Get currency symbol
   */
  private static getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CHF': 'CHF ',
      'CAD': 'C$',
      'AUD': 'A$',
      'NZD': 'NZ$',
    };
    
    return symbols[currency] || currency + ' ';
  }

  /**
   * Format percentage with proper precision
   */
  public static formatPercentage(value: number, options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSign?: boolean;
  }): string {
    if (typeof value !== 'number' || isNaN(value)) {
      return '0%';
    }

    const {
      minimumFractionDigits = 1,
      maximumFractionDigits = 2,
      showSign = false
    } = options || {};

    const sign = showSign && value > 0 ? '+' : '';
    
    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits,
        maximumFractionDigits,
      });

      return `${sign}${formatter.format(value / 100)}`;
    } catch (error) {
      return `${sign}${value.toFixed(maximumFractionDigits)}%`;
    }
  }

  /**
   * Format lot size with proper precision
   */
  public static formatLotSize(lots: number): string {
    if (typeof lots !== 'number' || isNaN(lots)) {
      return '0.00';
    }

    // Round to 2 decimal places to avoid floating point issues
    const rounded = Math.round(lots * 100) / 100;
    return rounded.toFixed(2);
  }

  /**
   * Format price with symbol-appropriate decimal places
   */
  public static formatPrice(price: number, symbol?: string): string {
    if (typeof price !== 'number' || isNaN(price)) {
      return '0.00000';
    }

    let decimalPlaces = 5; // Default for forex

    if (symbol) {
      const upperSymbol = symbol.toUpperCase();
      
      if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD') || upperSymbol.includes('XAGUSD')) {
        decimalPlaces = 2; // Metals: 2526.50
      } else if (upperSymbol.includes('JPY')) {
        decimalPlaces = 3; // JPY pairs: 145.123
      } else if (upperSymbol.includes('US30') || upperSymbol.includes('NAS') || upperSymbol.includes('SPX')) {
        decimalPlaces = 1; // Indices: 35234.5
      }
    }

    return price.toFixed(decimalPlaces);
  }

  /**
   * Format pip distance for different symbol types
   */
  public static formatPips(pips: number, symbol?: string): string {
    if (typeof pips !== 'number' || isNaN(pips)) {
      return '0.0';
    }

    let decimalPlaces = 1;
    
    if (symbol) {
      const upperSymbol = symbol.toUpperCase();
      
      if (upperSymbol.includes('JPY')) {
        decimalPlaces = 0; // JPY pairs: whole numbers
      } else if (upperSymbol.includes('XAUUSD') || upperSymbol.includes('GOLD')) {
        decimalPlaces = 0; // Gold: whole dollar amounts
      }
    }

    return pips.toFixed(decimalPlaces);
  }

  /**
   * Format duration (milliseconds to human readable)
   */
  public static formatDuration(milliseconds: number): string {
    if (typeof milliseconds !== 'number' || isNaN(milliseconds) || milliseconds < 0) {
      return '0s';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format timestamp to readable date/time
   */
  public static formatTimestamp(timestamp: number | string | Date, options?: {
    includeTime?: boolean;
    includeSeconds?: boolean;
    includeDate?: boolean;
    relative?: boolean;
  }): string {
    const {
      includeTime = true,
      includeSeconds = false,
      includeDate = true,
      relative = false
    } = options || {};

    let date: Date;
    
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      return 'Invalid date';
    }

    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    // Relative time (e.g., "2 minutes ago")
    if (relative) {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
      } else if (diffHours > 0) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
      } else if (diffMinutes > 0) {
        return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
      } else {
        return 'Just now';
      }
    }

    // Absolute time formatting
    try {
      const dateOptions: Intl.DateTimeFormatOptions = {};
      
      if (includeDate) {
        dateOptions.year = 'numeric';
        dateOptions.month = 'short';
        dateOptions.day = 'numeric';
      }
      
      if (includeTime) {
        dateOptions.hour = '2-digit';
        dateOptions.minute = '2-digit';
        
        if (includeSeconds) {
          dateOptions.second = '2-digit';
        }
      }

      return new Intl.DateTimeFormat('en-US', dateOptions).format(date);
    } catch (error) {
      // Fallback formatting
      if (includeDate && includeTime) {
        return date.toLocaleString();
      } else if (includeDate) {
        return date.toLocaleDateString();
      } else if (includeTime) {
        return date.toLocaleTimeString();
      } else {
        return date.toString();
      }
    }
  }

  /**
   * Format file size in bytes to human readable
   */
  public static formatFileSize(bytes: number): string {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  /**
   * Format number with thousand separators
   */
  public static formatNumber(value: number, options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }): string {
    if (typeof value !== 'number' || isNaN(value)) {
      return '0';
    }

    const {
      minimumFractionDigits = 0,
      maximumFractionDigits = 2
    } = options || {};

    try {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(value);
    } catch (error) {
      return value.toFixed(maximumFractionDigits);
    }
  }
}