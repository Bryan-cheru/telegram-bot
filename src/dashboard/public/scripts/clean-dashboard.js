/**
 * Clean Trading Dashboard - Simplified Frontend for IFPro Account
 * Automatically fetches account data from environment on startup
 */

class CleanTradingDashboard {
  constructor() {
    this.accountData = null;
    this.positions = [];
    this.currentPage = 'dashboard';
    this.refreshInterval = null;
    this.isLoading = false;
    
    console.log('🚀 Initializing Clean Trading Dashboard...');
    this.init();
  }

  async init() {
    this.setupNavigation();
    this.setupEventListeners();
    this.showLoadingState();
    
    try {
      await this.loadAccountData();
      await this.loadPositions();
      this.updateDashboardStats();
      this.startAutoRefresh();
      this.showNotification('Dashboard loaded successfully!', 'success');
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
      this.showNotification('Failed to load dashboard data', 'error');
    }
  }

  setupNavigation() {
    // Handle page switching
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = e.currentTarget.dataset.page;
        this.switchPage(page);
      });
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('open');
      });
    }
  }

  setupEventListeners() {
    // Auto-refresh when window becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.loadAccountData();
      }
    });

    // Refresh button handlers
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-action="refresh"]') || e.target.closest('[data-action="refresh"]')) {
        this.refreshAllData();
      }
    });
  }

  switchPage(page) {
    console.log(`📄 Switching to page: ${page}`);
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

    // Update content
    document.querySelectorAll('.page').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById(page)?.classList.add('active');

    // Update page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
      pageTitle.textContent = this.getPageTitle(page);
    }

    this.currentPage = page;
    this.loadPageData(page);
  }

  getPageTitle(page) {
    const titles = {
      'dashboard': 'Dashboard',
      'accounts': 'Account Overview',
      'positions': 'Active Positions',
      'history': 'Trade History',
      'logs': 'System Logs',
      'settings': 'Settings'
    };
    return titles[page] || 'Dashboard';
  }

  async loadPageData(page) {
    switch (page) {
      case 'dashboard':
        this.updateDashboardStats();
        break;
      case 'accounts':
        this.renderAccountInfo();
        break;
      case 'positions':
        await this.loadPositions();
        this.renderPositions();
        break;
      case 'history':
        await this.loadTradeHistory();
        break;
      case 'logs':
        this.initializeLogs();
        break;
    }
  }

  // ===============================
  // DATA LOADING FUNCTIONS
  // ===============================

  async loadAccountData() {
    try {
      this.isLoading = true;
      console.log('📊 Loading account data from MT5...');

      const response = await fetch('/api/mt5/account');
      const result = await response.json();

      if (result.success) {
        this.accountData = result;
        console.log('✅ Account data loaded:', result.summary);
        this.renderAccountInfo();
        this.updateConnectionStatus(true);
      } else {
        throw new Error(result.error || 'Failed to load account data');
      }
    } catch (error) {
      console.error('❌ Error loading account data:', error);
      this.showNotification('Failed to connect to trading account', 'error');
      this.updateConnectionStatus(false);
    } finally {
      this.isLoading = false;
    }
  }

  async loadPositions() {
    try {
      console.log('📈 Loading positions...');

      const response = await fetch('/api/mt5/positions');
      const result = await response.json();

      if (result.success) {
        this.positions = result.positions || [];
        console.log(`✅ Loaded ${this.positions.length} positions`);
        this.renderPositions();
      } else {
        console.warn('⚠️ No positions data:', result.error);
        this.positions = [];
        this.renderPositions();
      }
    } catch (error) {
      console.error('❌ Error loading positions:', error);
      this.positions = [];
      this.renderPositions();
    }
  }

  async loadTradeHistory() {
    try {
      console.log('📋 Loading trade history...');

      const response = await fetch('/api/mt5/trade-summary?period=30d');
      const result = await response.json();

      if (result.success) {
        this.renderTradeHistory(result);
      } else {
        console.warn('⚠️ No trade history:', result.error);
        this.renderTradeHistory({ summary: { totalTrades: 0 }, recentDeals: [] });
      }
    } catch (error) {
      console.error('❌ Error loading trade history:', error);
      this.renderTradeHistory({ summary: { totalTrades: 0 }, recentDeals: [] });
    }
  }

  // ===============================
  // RENDERING FUNCTIONS
  // ===============================

  updateDashboardStats() {
    if (!this.accountData) {
      console.log('📊 No account data available for dashboard stats');
      return;
    }

    const summary = this.accountData.summary;
    
    // Update account stats
    this.updateStatCard('total-accounts', summary.accountCount || 1);
    this.updateStatCard('total-balance', this.formatCurrency(summary.totalBalance || 0));
    this.updateStatCard('total-equity', this.formatCurrency(summary.totalEquity || 0));
    this.updateStatCard('active-positions', this.positions.length);

    // Update status indicators
    const statusElement = document.getElementById('accounts-status');
    if (statusElement) {
      if (summary.connectedAccounts > 0) {
        statusElement.textContent = 'Connected';
        statusElement.className = 'stat-change positive';
      } else {
        statusElement.textContent = 'Disconnected';
        statusElement.className = 'stat-change negative';
      }
    }

    console.log('📊 Dashboard stats updated');
  }

  updateStatCard(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  renderAccountInfo() {
    const container = document.getElementById('accounts-container');
    if (!container) return;

    if (!this.accountData || !this.accountData.accounts) {
      container.innerHTML = `
        <div class="no-data">
          <i class="fas fa-wallet"></i>
          <h3>No Account Data</h3>
          <p>Unable to load account information</p>
          <button class="btn btn-primary" onclick="dashboard.refreshAllData()">
            <i class="fas fa-sync-alt"></i> Retry
          </button>
        </div>
      `;
      return;
    }

    const account = this.accountData.accounts[0]; // IFPro account
    const summary = this.accountData.summary;

    container.innerHTML = `
      <div class="account-card">
        <div class="account-header">
          <div class="account-info">
            <h3><i class="fas fa-building"></i> ${account.brokerName}</h3>
            <span class="account-type ${account.accountType.toLowerCase()}">${account.accountType}</span>
            <span class="status-badge ${account.status.toLowerCase()}">${account.status}</span>
          </div>
          <div class="account-actions">
            <button class="btn btn-outline" onclick="dashboard.refreshAllData()">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
        </div>
        
        <div class="account-details">
          <div class="detail-grid">
            <div class="detail-item">
              <label>Balance</label>
              <span class="value balance">${this.formatCurrency(account.balance)}</span>
            </div>
            <div class="detail-item">
              <label>Equity</label>
              <span class="value equity">${this.formatCurrency(account.equity)}</span>
            </div>
            <div class="detail-item">
              <label>Free Margin</label>
              <span class="value">${this.formatCurrency(account.freeMargin)}</span>
            </div>
            <div class="detail-item">
              <label>Margin Level</label>
              <span class="value">${account.marginLevel?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div class="detail-item">
              <label>Open Positions</label>
              <span class="value">${account.positions?.length || 0}</span>
            </div>
            <div class="detail-item">
              <label>Trading Ready</label>
              <span class="status-indicator ${account.tradingReady ? 'ready' : 'not-ready'}">
                ${account.tradingReady ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPositions() {
    const container = document.getElementById('positions-container');
    if (!container) return;

    if (this.positions.length === 0) {
      container.innerHTML = `
        <div class="no-data">
          <i class="fas fa-chart-line"></i>
          <h3>No Open Positions</h3>
          <p>No active trades found</p>
        </div>
      `;
      return;
    }

    const positionsHTML = this.positions.map(position => `
      <div class="position-card">
        <div class="position-header">
          <div class="position-symbol">
            <h4>${position.symbol}</h4>
            <span class="position-type ${position.type?.toLowerCase() || 'unknown'}">${position.type}</span>
          </div>
          <div class="position-profit ${(position.profit || 0) >= 0 ? 'positive' : 'negative'}">
            ${this.formatCurrency(position.profit || 0)}
          </div>
        </div>
        
        <div class="position-details">
          <div class="detail-row">
            <span>Volume:</span>
            <span>${position.volume} lots</span>
          </div>
          <div class="detail-row">
            <span>Open Price:</span>
            <span>${position.openPrice}</span>
          </div>
          <div class="detail-row">
            <span>Current Price:</span>
            <span>${position.currentPrice || position.openPrice}</span>
          </div>
          <div class="detail-row">
            <span>Open Time:</span>
            <span>${new Date(position.openTime).toLocaleString()}</span>
          </div>
        </div>
      </div>
    `).join('');

    container.innerHTML = positionsHTML;
  }

  renderTradeHistory(data) {
    const container = document.getElementById('history-container');
    if (!container) return;

    const summary = data.summary || {};
    const deals = data.recentDeals || [];

    container.innerHTML = `
      <div class="history-summary">
        <div class="summary-stats">
          <div class="stat-item">
            <label>Total Trades</label>
            <span>${summary.totalTrades || 0}</span>
          </div>
          <div class="stat-item">
            <label>Winning Trades</label>
            <span>${summary.winningTrades || 0}</span>
          </div>
          <div class="stat-item">
            <label>Win Rate</label>
            <span>${summary.winRate?.toFixed(1) || '0.0'}%</span>
          </div>
          <div class="stat-item">
            <label>Total Profit</label>
            <span class="${(summary.totalProfit || 0) >= 0 ? 'positive' : 'negative'}">
              ${this.formatCurrency(summary.totalProfit || 0)}
            </span>
          </div>
        </div>
      </div>
      
      <div class="recent-deals">
        <h3>Recent Trades</h3>
        ${deals.length === 0 ? 
          '<p class="no-data">No recent trades found</p>' :
          deals.map(deal => `
            <div class="deal-item">
              <div class="deal-info">
                <span class="symbol">${deal.symbol}</span>
                <span class="type">${deal.type}</span>
                <span class="volume">${deal.volume} lots</span>
              </div>
              <div class="deal-result ${deal.profit >= 0 ? 'positive' : 'negative'}">
                ${this.formatCurrency(deal.profit)}
              </div>
              <div class="deal-time">
                ${new Date(deal.time).toLocaleDateString()}
              </div>
            </div>
          `).join('')
        }
      </div>
    `;
  }

  // ===============================
  // UTILITY FUNCTIONS
  // ===============================

  formatCurrency(amount) {
    if (typeof amount !== 'number') return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  updateConnectionStatus(connected) {
    const badge = document.getElementById('system-status-badge');
    if (badge) {
      if (connected) {
        badge.className = 'status-badge online';
        badge.innerHTML = '<i class="fas fa-circle"></i><span>System Online</span>';
      } else {
        badge.className = 'status-badge offline';
        badge.innerHTML = '<i class="fas fa-circle"></i><span>Connection Issue</span>';
      }
    }
  }

  showLoadingState() {
    // Add loading indicators where needed
    const containers = ['accounts-container', 'positions-container', 'history-container'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = `
          <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading...</p>
          </div>
        `;
      }
    });
  }

  showNotification(message, type = 'info') {
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
    
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span>${message}</span>
        <button class="notification-close">&times;</button>
      </div>
    `;

    container.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);

    // Manual close
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.remove();
    });
  }

  // ===============================
  // AUTO-REFRESH & ACTIONS
  // ===============================

  startAutoRefresh() {
    // Refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      if (!this.isLoading && !document.hidden) {
        this.loadAccountData();
        if (this.currentPage === 'positions') {
          this.loadPositions();
        }
      }
    }, 30000);

    console.log('🔄 Auto-refresh started (30 seconds)');
  }

  async refreshAllData() {
    console.log('🔄 Manual refresh requested');
    this.showNotification('Refreshing data...', 'info');
    
    try {
      await this.loadAccountData();
      await this.loadPositions();
      this.updateDashboardStats();
      this.showNotification('Data refreshed successfully!', 'success');
    } catch (error) {
      console.error('Refresh failed:', error);
      this.showNotification('Failed to refresh data', 'error');
    }
  }

  // ===============================
  // LOGS SYSTEM
  // ===============================

  initializeLogs() {
    const container = document.getElementById('logs-container');
    if (!container) return;

    // Simple logs display
    container.innerHTML = `
      <div class="logs-header">
        <h3>System Logs</h3>
        <button class="btn btn-outline" onclick="dashboard.refreshLogs()">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
      </div>
      <div class="logs-content" id="logs-content">
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading logs...</p>
        </div>
      </div>
    `;

    this.loadLogs();
  }

  async loadLogs() {
    try {
      const response = await fetch('/api/logs?limit=50');
      const logs = await response.json();
      
      const container = document.getElementById('logs-content');
      if (!container) return;

      if (logs.length === 0) {
        container.innerHTML = '<p class="no-data">No logs available</p>';
        return;
      }

      const logsHTML = logs.map(log => `
        <div class="log-entry ${log.level}">
          <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
          <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
          <span class="log-message">${log.message}</span>
        </div>
      `).join('');

      container.innerHTML = logsHTML;
      
      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
      
    } catch (error) {
      console.error('Error loading logs:', error);
      const container = document.getElementById('logs-content');
      if (container) {
        container.innerHTML = '<p class="error">Failed to load logs</p>';
      }
    }
  }

  refreshLogs() {
    this.loadLogs();
  }
}

// ===============================
// GLOBAL FUNCTIONS & INITIALIZATION
// ===============================

// Global refresh function
function refreshAllData() {
  if (window.dashboard) {
    window.dashboard.refreshAllData();
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🌟 DOM loaded, initializing Clean Trading Dashboard...');
  window.dashboard = new CleanTradingDashboard();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.dashboard && window.dashboard.refreshInterval) {
    clearInterval(window.dashboard.refreshInterval);
  }
});