// API Service Module for Trading Dashboard
// Handles all backend communication

class APIService {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      }
    };
    this.requestCount = 0;
    this.errorCount = 0;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData =
      typeof FormData !== 'undefined' && options.body instanceof FormData;
    const mergedHeaders = Object.assign(
      {},
      !isFormData ? this.defaultOptions.headers : {},
      options.headers || {}
    );
    try {
      const key = typeof window !== 'undefined' && window.getDashboardApiKey && window.getDashboardApiKey();
      if (key && !mergedHeaders['x-api-key'] && !mergedHeaders['X-API-KEY']) {
        mergedHeaders['x-api-key'] = key;
      }
    } catch (_) {
      /* ignore */
    }
    const config = {
      ...this.defaultOptions,
      ...options,
      headers: mergedHeaders
    };

    this.requestCount++;

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        this.errorCount++;
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.endpoint = endpoint;
        throw error;
      }

      // Handle different response types
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      if (!error.status) {
        // Network or other non-HTTP error
        this.errorCount++;
        error.endpoint = endpoint;
      }
      console.error(`API Error for ${endpoint}:`, error);
      throw error;
    }
  }

  // Get API statistics
  getStats() {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(2) + '%' : '0%'
    };
  }

  // Reset statistics
  resetStats() {
    this.requestCount = 0;
    this.errorCount = 0;
  }

  // Bot status endpoints
  async getBotStatus() {
    return this.request('/api/status');
  }

  async restartBot() {
    return this.request('/api/restart', { method: 'POST' });
  }

  async stopBot() {
    return this.request('/api/stop', { method: 'POST' });
  }

  // Configuration endpoints
  async getConfig() {
    return this.request('/api/config');
  }

  async saveConfig(config) {
    return this.request('/api/config', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  async saveAccountId(accountId) {
    return this.request('/api/config/account', {
      method: 'POST',
      body: JSON.stringify({ accountId })
    });
  }

  async testConnection(accountId) {
    return this.request('/api/test-connection', {
      method: 'POST',
      body: JSON.stringify({ accountId })
    });
  }

  // Trade history endpoints
  async getTradeHistory(limit = 50) {
    return this.request(`/api/trades?limit=${limit}`);
  }

  async getTrade(tradeId) {
    return this.request(`/api/trades/${tradeId}`);
  }

  // Logs endpoints
  async clearLogs() {
    return this.request('/api/logs', { method: 'DELETE' });
  }

  // Statistics endpoints
  async getStatistics() {
    return this.request('/api/stats');
  }

  async getPerformanceMetrics() {
    return this.request('/api/metrics');
  }

  // MetaTrader 5 specific endpoints
  async getMT5Account() {
    return this.request('/api/mt5/account');
  }

  async getMT5Positions() {
    return this.request('/api/mt5/positions');
  }

  async getMT5TradeSummary(period = '30d') {
    return this.request(`/api/mt5/trade-summary?period=${period}`);
  }

  async closeMT5Position(accountId, positionId) {
    return this.request(`/api/mt5/positions/${accountId}/${positionId}/close`, {
      method: 'POST'
    });
  }

  async closeAllMT5Positions(accountId) {
    return this.request(`/api/mt5/positions/close-all/${accountId}`, {
      method: 'POST'
    });
  }

  // Logs endpoints (updated)
  async getLogs(limit = 100) {
    return this.request(`/api/logs?limit=${limit}`);
  }

  async getLogsStream() {
    // Note: EventSource must be handled separately in the calling code
    return '/api/logs/stream';
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }

  // File operations
  async uploadFile(file, endpoint = '/api/upload') {
    const formData = new FormData();
    formData.append('file', file);

    return this.request(endpoint, {
      method: 'POST',
      body: formData,
      headers: {} // Let browser set Content-Type for FormData
    });
  }
}

// Export for use in other modules
window.APIService = APIService;

// Create a global API instance for easy use
window.api = new APIService();
