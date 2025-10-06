// Utility functions for the Trading Dashboard

class Utils {
  // Formatting functions
  static formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }

  static formatPercentage(value, decimals = 2) {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  static formatDateTime(date, options = {}) {
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return new Date(date).toLocaleDateString('en-US', {
      ...defaultOptions,
      ...options
    });
  }

  static formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  static formatLotSize(lots) {
    return parseFloat(lots).toFixed(2);
  }

  // Validation functions
  static validateAccountId(accountId) {
    if (!accountId) {
      return { valid: false, error: 'Account ID is required' };
    }
    
    if (accountId.length < 8) {
      return { valid: false, error: 'Account ID must be at least 8 characters' };
    }
    
    return { valid: true };
  }

  static validateRiskPercentage(risk) {
    const riskNum = parseFloat(risk);
    
    if (isNaN(riskNum)) {
      return { valid: false, error: 'Risk percentage must be a number' };
    }
    
    if (riskNum < 0.1 || riskNum > 10) {
      return { valid: false, error: 'Risk percentage must be between 0.1% and 10%' };
    }
    
    return { valid: true };
  }

  static validateLotSize(lots) {
    const lotsNum = parseFloat(lots);
    
    if (isNaN(lotsNum)) {
      return { valid: false, error: 'Lot size must be a number' };
    }
    
    if (lotsNum <= 0) {
      return { valid: false, error: 'Lot size must be greater than 0' };
    }
    
    if (lotsNum > 100) {
      return { valid: false, error: 'Lot size cannot exceed 100' };
    }
    
    return { valid: true };
  }

  // DOM helper functions
  static createElement(tag, className = '', textContent = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
  }

  static show(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    if (element) element.style.display = '';
  }

  static hide(element) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    if (element) element.style.display = 'none';
  }

  static toggle(element, show) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    if (element) {
      element.style.display = show ? '' : 'none';
    }
  }

  static addClass(element, className) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    if (element) element.classList.add(className);
  }

  static removeClass(element, className) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    if (element) element.classList.remove(className);
  }

  static toggleClass(element, className, force) {
    if (typeof element === 'string') {
      element = document.getElementById(element);
    }
    if (element) return element.classList.toggle(className, force);
  }

  // Data manipulation functions
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  static deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  static isEmpty(value) {
    return value == null || 
           (typeof value === 'string' && value.trim() === '') ||
           (Array.isArray(value) && value.length === 0) ||
           (typeof value === 'object' && Object.keys(value).length === 0);
  }

  // Mathematical functions
  static clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  static roundToDecimals(value, decimals) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  static calculatePips(symbol, entryPrice, exitPrice) {
    const priceDiff = Math.abs(exitPrice - entryPrice);
    
    // JPY pairs have different pip calculation
    const isJpyPair = symbol.includes('JPY');
    const pipValue = isJpyPair ? 0.01 : 0.0001;
    
    return priceDiff / pipValue;
  }

  static calculatePnL(symbol, action, entryPrice, exitPrice, lotSize) {
    const pips = this.calculatePips(symbol, entryPrice, exitPrice);
    const pipValue = 10; // Standard pip value for 0.1 lot
    
    let pnl = pips * pipValue * (lotSize / 0.1);
    
    // Reverse sign for sell orders
    if (action.toLowerCase() === 'sell') {
      pnl = (exitPrice > entryPrice) ? -pnl : pnl;
    } else {
      pnl = (exitPrice > entryPrice) ? pnl : -pnl;
    }
    
    return this.roundToDecimals(pnl, 2);
  }

  // Color functions
  static getTradeActionColor(action) {
    return action.toLowerCase() === 'buy' ? '#4CAF50' : '#f44336';
  }

  static getStatusColor(status) {
    const colors = {
      'open': '#2196F3',
      'closed': '#4CAF50',
      'pending': '#FF9800',
      'cancelled': '#9E9E9E',
      'error': '#f44336'
    };
    return colors[status.toLowerCase()] || '#9E9E9E';
  }

  static getPnLColor(pnl) {
    return pnl >= 0 ? '#4CAF50' : '#f44336';
  }

  // Storage functions
  static saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      return false;
    }
  }

  static loadFromStorage(key, defaultValue = null) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      return defaultValue;
    }
  }

  static removeFromStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error removing from localStorage:', error);
      return false;
    }
  }

  // Network functions
  static async retry(fn, retries = 3, delay = 1000) {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries) throw error;
        await this.sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static isOnline() {
    return navigator.onLine;
  }

  // Error handling
  static handleError(error, context = '') {
    console.error(`Error${context ? ` in ${context}` : ''}:`, error);
    
    // You can extend this to send errors to a logging service
    if (window.dashboard && window.dashboard.showNotification) {
      const message = error.message || 'An unexpected error occurred';
      window.dashboard.showNotification(message, 'error');
    }
  }

  // Theme functions
  static setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.saveToStorage('dashboard-theme', theme);
  }

  static getTheme() {
    return this.loadFromStorage('dashboard-theme', 'dark');
  }

  static initializeTheme() {
    const savedTheme = this.getTheme();
    this.setTheme(savedTheme);
  }
}

// Export for use in other modules
window.Utils = Utils;