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
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...this.defaultOptions,
      ...options
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle different response types
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`API Error for ${endpoint}:`, error);
      throw error;
    }
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
  async getLogs(limit = 100) {
    return this.request(`/api/logs?limit=${limit}`);
  }

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
