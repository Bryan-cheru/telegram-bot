// Professional Trading Dashboard JavaScript
// Following modern JavaScript best practices

class TradingDashboard {
  constructor() {
    this.currentPage = 'dashboard';
    this.isLoading = false;
    this.eventSource = null;
    this.mt5UpdateInterval = null;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadInitialData();
    this.startRealTimeUpdates();
    this.startMT5Updates();
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', this.handleNavigation.bind(this));
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', this.toggleSidebar.bind(this));
    }

    // Account form
    const accountForm = document.getElementById('account-form');
    if (accountForm) {
      accountForm.addEventListener('submit', this.handleAccountSave.bind(this));
    }

    // Test connection button
    const testBtn = document.getElementById('test-connection');
    if (testBtn) {
      testBtn.addEventListener('click', this.testConnection.bind(this));
    }

    // Clear logs button
    const clearLogsBtn = document.getElementById('clear-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', this.clearLogs.bind(this));
    }
  }

  handleNavigation(e) {
    e.preventDefault();
    const targetPage = e.currentTarget.dataset.page;
    this.switchPage(targetPage);
  }

  switchPage(page) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.page').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById(page).classList.add('active');

    // Update page title
    const titles = {
      dashboard: 'Dashboard',
      trading: 'Live Trading',
      accounts: 'Account Settings',
      trades: 'Trade History',
      logs: 'System Logs'
    };
    document.querySelector('.header-left h1').textContent = titles[page] || 'Dashboard';

    this.currentPage = page;

    // Load page-specific data
    this.loadPageData(page);
  }

  async loadPageData(page) {
    switch (page) {
      case 'dashboard':
        await this.updateMT5Dashboard();
        break;
      case 'trading':
        await this.updateTradingData();
        break;
      case 'accounts':
        await this.loadAccountSettings();
        break;
      case 'trades':
        await this.loadTradeHistory();
        break;
      case 'logs':
        await this.loadLogs();
        break;
      default:
        break;
    }
  }

  async loadInitialData() {
    try {
      // Load dashboard stats
      await this.updateStats();
      
      // Load MT5 account data
      await this.updateMT5Dashboard();
      
      // Load account settings if on accounts page
      if (this.currentPage === 'accounts') {
        await this.loadAccountSettings();
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showNotification('Failed to load dashboard data', 'error');
    }
  }

  async updateStats() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      // Update bot status
      const statusElement = document.querySelector('.stat-value');
      if (statusElement && data.isRunning) {
        statusElement.textContent = 'Online';
      }
      
      // Update other stats as needed
      this.lastSuccessfulUpdate = Date.now();
    } catch (error) {
      console.error('Error updating stats:', error);
      
      // Update status to show offline when API fails
      const statusElement = document.querySelector('.stat-value');
      if (statusElement) {
        statusElement.textContent = 'Offline';
      }
      
      // Update status badge
      const statusBadge = document.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.className = 'status-badge offline';
        statusBadge.innerHTML = '<i class="fas fa-circle"></i><span>System Offline</span>';
      }
    }
  }

  async loadAccountSettings() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      
      // Populate form fields
      const accountIdInput = document.getElementById('account-id');
      const riskPercentInput = document.getElementById('risk-percent');
      const maxPositionInput = document.getElementById('max-position');
      
      if (accountIdInput) accountIdInput.value = config.currentAccountId || '';
      if (riskPercentInput) riskPercentInput.value = config.riskPercentage || 2;
      if (maxPositionInput) maxPositionInput.value = config.maxTradeSize || 0.1;
      
    } catch (error) {
      console.error('Error loading account settings:', error);
      this.showNotification('Failed to load account settings', 'error');
    }
  }

  async handleAccountSave(e) {
    e.preventDefault();
    
    if (this.isLoading) return;
    
    const formData = new FormData(e.target);
    const accountId = document.getElementById('account-id').value;
    const riskPercent = parseFloat(document.getElementById('risk-percent').value);
    const maxPosition = parseFloat(document.getElementById('max-position').value);
    
    // Validation
    if (!accountId) {
      this.showNotification('Please enter a MetaAPI Account ID', 'error');
      return;
    }
    
    if (riskPercent < 0.1 || riskPercent > 10) {
      this.showNotification('Risk percentage must be between 0.1% and 10%', 'error');
      return;
    }
    
    this.isLoading = true;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
    try {
      // Save account ID
      const accountResponse = await fetch('/api/config/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      
      // Save other settings
      const configResponse = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskPercentage: riskPercent,
          maxTradeSize: maxPosition
        })
      });
      
      if (accountResponse.ok && configResponse.ok) {
        this.showNotification('Configuration saved successfully!', 'success');
      } else {
        throw new Error('Failed to save configuration');
      }
      
    } catch (error) {
      console.error('Error saving configuration:', error);
      this.showNotification('Failed to save configuration', 'error');
    } finally {
      this.isLoading = false;
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }

  async testConnection() {
    const accountId = document.getElementById('account-id').value;
    
    if (!accountId) {
      this.showNotification('Please enter an account ID first', 'error');
      return;
    }
    
    const testBtn = document.getElementById('test-connection');
    const originalText = testBtn.innerHTML;
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    testBtn.disabled = true;
    
    try {
      const response = await fetch(`/api/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        this.showNotification('Connection test successful!', 'success');
      } else {
        this.showNotification(result.error || 'Connection test failed', 'error');
      }
      
    } catch (error) {
      console.error('Error testing connection:', error);
      this.showNotification('Connection test failed', 'error');
    } finally {
      testBtn.innerHTML = originalText;
      testBtn.disabled = false;
    }
  }

  async loadTradeHistory() {
    try {
      const response = await fetch('/api/trades');
      const trades = await response.json();
      
      const tbody = document.getElementById('trades-table-body');
      if (!tbody) return;
      
      if (trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No trades executed yet</td></tr>';
        return;
      }
      
      tbody.innerHTML = trades.map(trade => `
        <tr>
          <td>${new Date(trade.timestamp).toLocaleString()}</td>
          <td>${trade.symbol}</td>
          <td><span class="badge ${trade.action.toLowerCase()}">${trade.action}</span></td>
          <td>${trade.entry}</td>
          <td>${trade.exit || '-'}</td>
          <td class="${trade.pnl >= 0 ? 'positive' : 'negative'}">${trade.pnl || '-'}</td>
          <td><span class="badge ${trade.status.toLowerCase()}">${trade.status}</span></td>
        </tr>
      `).join('');
      
    } catch (error) {
      console.error('Error loading trade history:', error);
      this.showNotification('Failed to load trade history', 'error');
    }
  }

  async loadLogs() {
    const container = document.getElementById('logs-container');
    if (!container) return;
    
    // Show loading state without flickering
    if (container.innerHTML === 'Loading logs...') {
      // Don't change if already loading
    } else {
      container.innerHTML = '<div class="log-entry">Loading logs...</div>';
    }
    
    try {
      const response = await fetch('/api/logs?limit=100');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const logs = await response.json();
      
      if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="log-entry">No logs available</div>';
        return;
      }
      
      container.innerHTML = logs.map(log => {
        // Clean ANSI color codes from log messages
        const cleanMessage = log.message.replace(/\x1b\[[0-9;]*m/g, '');
        
        return `
          <div class="log-entry ${log.level}">
            <span class="timestamp">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span class="level">${log.level.toUpperCase()}</span>
            <span class="message">${cleanMessage}</span>
          </div>
        `;
      }).join('');
      
      // Auto scroll to bottom
      container.scrollTop = container.scrollHeight;
      
    } catch (error) {
      console.error('Error loading logs:', error);
      container.innerHTML = 
        '<div class="log-entry error">Server offline - Unable to load logs</div>';
    }
  }

  async clearLogs() {
    if (!confirm('Are you sure you want to clear all logs?')) {
      return;
    }
    
    try {
      const response = await fetch('/api/logs', { method: 'DELETE' });
      
      if (response.ok) {
        this.showNotification('Logs cleared successfully', 'success');
        await this.loadLogs();
      } else {
        throw new Error('Failed to clear logs');
      }
      
    } catch (error) {
      console.error('Error clearing logs:', error);
      this.showNotification('Failed to clear logs', 'error');
    }
  }

  startRealTimeUpdates() {
    // Initial update
    this.updateStats();
    
    // Update stats every 30 seconds, but only if server is reachable
    this.statsInterval = setInterval(() => {
      // Skip update if last one failed and it's been less than 5 minutes
      if (!this.lastSuccessfulUpdate || (Date.now() - this.lastSuccessfulUpdate) > 300000) {
        this.updateStats();
      }
    }, 30000);
    
    // Setup EventSource for real-time logs (with proper error handling)
    this.setupEventSource();
  }

  setupEventSource() {
    if (typeof EventSource !== 'undefined') {
      try {
        this.eventSource = new EventSource('/api/logs/stream');
        
        this.eventSource.onopen = () => {
          console.log('EventSource connected');
        };
        
        this.eventSource.onmessage = (event) => {
          if (this.currentPage === 'logs') {
            try {
              const log = JSON.parse(event.data);
              this.appendLogEntry(log);
            } catch (error) {
              console.error('Error parsing log data:', error);
            }
          }
        };
        
        this.eventSource.onerror = (error) => {
          console.error('EventSource error:', error);
          this.eventSource.close();
          
          // Don't attempt to reconnect immediately to prevent flickering
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            this.setupEventSource();
          }, 10000); // Wait 10 seconds before reconnecting
        };
      } catch (error) {
        console.error('Failed to setup EventSource:', error);
      }
    }
  }

  appendLogEntry(log) {
    const container = document.getElementById('logs-container');
    if (!container) return;
    
    // Clean ANSI color codes from log message
    const cleanMessage = log.message.replace(/\x1b\[[0-9;]*m/g, '');
    
    const logElement = document.createElement('div');
    logElement.className = `log-entry ${log.level}`;
    logElement.innerHTML = `
      <span class="timestamp">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
      <span class="level">${log.level.toUpperCase()}</span>
      <span class="message">${cleanMessage}</span>
    `;
    
    container.appendChild(logElement);
    container.scrollTop = container.scrollHeight;
    
    // Keep only last 100 entries
    const entries = container.querySelectorAll('.log-entry');
    if (entries.length > 100) {
      entries[0].remove();
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
      <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Add styles if not already present
    if (!document.getElementById('notification-styles')) {
      const styles = document.createElement('style');
      styles.id = 'notification-styles';
      styles.textContent = `
        .notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 1rem 1.5rem;
          border-radius: 0.5rem;
          color: white;
          font-weight: 500;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          animation: slideIn 0.3s ease;
        }
        .notification.success { background: var(--success); }
        .notification.error { background: var(--danger); }
        .notification.info { background: var(--info); }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  // ========== MT5 TRADING DATA FUNCTIONS ==========
  
  startMT5Updates() {
    // Update MT5 data every 15 seconds
    this.mt5UpdateInterval = setInterval(() => {
      if (this.currentPage === 'dashboard' || this.currentPage === 'trading') {
        this.updateMT5Dashboard();
        if (this.currentPage === 'trading') {
          this.updateTradingData();
        }
      }
    }, 15000);
  }

  async updateMT5Dashboard() {
    try {
      // Get MT5 summary data
      const summaryResponse = await fetch('/api/mt5/summary');
      const summaryData = await summaryResponse.json();
      
      if (summaryData.success && summaryData.summary) {
        this.updateDashboardStats(summaryData.summary);
      }

      // Get MT5 status
      const statusResponse = await fetch('/api/mt5/status');
      const statusData = await statusResponse.json();
      
      this.updateConnectionStatus(statusData);
      
    } catch (error) {
      console.error('Error updating MT5 dashboard:', error);
      this.updateConnectionStatus({ connected: false, status: 'error' });
    }
  }

  updateDashboardStats(summary) {
    const { account, positions } = summary;
    
    // Update account balance
    const balanceElement = document.getElementById('account-balance');
    if (balanceElement && account) {
      balanceElement.textContent = this.formatCurrency(account.balance, account.currency);
    }
    
    // Update account equity
    const equityElement = document.getElementById('account-equity');
    if (equityElement && account) {
      equityElement.textContent = this.formatCurrency(account.equity, account.currency);
    }
    
    // Update unrealized P&L
    const plElement = document.getElementById('unrealized-pl');
    if (plElement && positions) {
      const plValue = positions.totalUnrealizedPL || 0;
      plElement.textContent = this.formatCurrency(plValue, account.currency);
      plElement.className = plValue >= 0 ? 'stat-change positive' : 'stat-change negative';
    }
    
    // Update open positions count
    const positionsElement = document.getElementById('open-positions');
    if (positionsElement && positions) {
      positionsElement.textContent = positions.total || 0;
    }
    
    // Update positions breakdown
    const breakdownElement = document.getElementById('positions-breakdown');
    if (breakdownElement && positions) {
      breakdownElement.textContent = `${positions.buy || 0} Buy • ${positions.sell || 0} Sell`;
    }
    
    // Update account summary section
    this.updateAccountSummary(summary);
  }

  updateAccountSummary(summary) {
    const { account, positions } = summary;
    
    // Update free margin
    const freeMarginElement = document.getElementById('free-margin');
    if (freeMarginElement && account) {
      freeMarginElement.textContent = this.formatCurrency(account.freeMargin, account.currency);
    }
    
    // Update margin level
    const marginLevelElement = document.getElementById('margin-level');
    if (marginLevelElement && account) {
      marginLevelElement.textContent = `${account.marginLevel?.toFixed(2) || 0}%`;
    }
    
    // Update total P&L
    const totalPlElement = document.getElementById('total-pl');
    if (totalPlElement && positions) {
      const plValue = positions.totalUnrealizedPL || 0;
      totalPlElement.textContent = this.formatCurrency(plValue, account.currency);
      totalPlElement.className = `value profit-loss ${plValue >= 0 ? 'positive' : 'negative'}`;
    }
  }

  updateConnectionStatus(statusData) {
    const statusElement = document.getElementById('mt5-connection-status');
    const botStatusElement = document.getElementById('bot-status');
    
    console.log('📊 MT5 Status Update:', statusData); // Debug log
    
    if (statusElement) {
      let statusHtml = '';
      let statusClass = '';
      
      if (statusData.connected) {
        statusHtml = '<span class="status connected">Connected</span>';
        statusClass = 'connected';
      } else if (statusData.initialization === 'failed') {
        statusHtml = '<span class="status error">Initialization Failed</span>';
        statusClass = 'error';
      } else if (statusData.initialization === 'not_initialized') {
        statusHtml = '<span class="status warning">Initializing...</span>';
        statusClass = 'warning';
      } else {
        statusHtml = '<span class="status disconnected">Disconnected</span>';
        statusClass = 'disconnected';
      }
      
      statusElement.innerHTML = statusHtml;
    }
    
    if (botStatusElement) {
      if (statusData.connected) {
        botStatusElement.textContent = 'MT5 Online';
        botStatusElement.parentElement.parentElement.querySelector('.stat-icon').className = 'stat-icon success';
      } else if (statusData.initialization === 'not_initialized') {
        botStatusElement.textContent = 'Starting up...';
        botStatusElement.parentElement.parentElement.querySelector('.stat-icon').className = 'stat-icon warning';
      } else if (statusData.initialization === 'failed') {
        botStatusElement.textContent = 'MT5 Failed';
        botStatusElement.parentElement.parentElement.querySelector('.stat-icon').className = 'stat-icon danger';
      } else {
        botStatusElement.textContent = 'MT5 Offline';
        botStatusElement.parentElement.parentElement.querySelector('.stat-icon').className = 'stat-icon danger';
      }
    }
  }

  async updateTradingData() {
    try {
      // Update positions table
      await this.updatePositionsTable();
      
      // Update performance stats
      await this.updatePerformanceStats();
      
    } catch (error) {
      console.error('Error updating trading data:', error);
    }
  }

  async updatePositionsTable() {
    try {
      const response = await fetch('/api/mt5/positions');
      const data = await response.json();
      
      const tableBody = document.getElementById('positions-table-body');
      const positionsCount = document.getElementById('positions-count');
      
      if (!tableBody) return;
      
      if (data.success && data.positions && data.positions.length > 0) {
        // Update positions count
        if (positionsCount) {
          positionsCount.textContent = `${data.positions.length} position${data.positions.length > 1 ? 's' : ''}`;
        }
        
        // Build table rows
        const rows = data.positions.map(position => {
          const profitClass = (position.unrealizedProfit || 0) >= 0 ? 'profit' : 'loss';
          const typeDisplay = position.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL';
          
          return `
            <tr>
              <td><strong>${position.symbol}</strong></td>
              <td><span class="badge badge-${position.type === 'POSITION_TYPE_BUY' ? 'success' : 'danger'}">${typeDisplay}</span></td>
              <td>${position.volume}</td>
              <td>${position.openPrice?.toFixed(5) || 'N/A'}</td>
              <td>${position.currentPrice?.toFixed(5) || 'N/A'}</td>
              <td class="${profitClass}">${this.formatCurrency(position.unrealizedProfit || 0)}</td>
              <td>
                <button class="btn btn-danger btn-sm" onclick="closePosition('${position.id}')" title="Close Position">
                  <i class="fas fa-times"></i>
                </button>
              </td>
            </tr>
          `;
        }).join('');
        
        tableBody.innerHTML = rows;
      } else {
        // No positions
        if (positionsCount) {
          positionsCount.textContent = '0 positions';
        }
        
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center no-data">
              <i class="fas fa-chart-line"></i>
              <p>No open positions</p>
            </td>
          </tr>
        `;
      }
    } catch (error) {
      console.error('Error updating positions table:', error);
    }
  }

  async updatePerformanceStats() {
    try {
      const response = await fetch('/api/mt5/summary');
      const data = await response.json();
      
      if (data.success && data.summary) {
        const { positions, performance } = data.summary;
        
        // Update performance stats
        const dailyPlElement = document.getElementById('daily-pl');
        const weeklyPlElement = document.getElementById('weekly-pl');
        const monthlyPlElement = document.getElementById('monthly-pl');
        const commissionElement = document.getElementById('total-commission');
        const swapElement = document.getElementById('total-swap');
        
        if (dailyPlElement && performance) {
          dailyPlElement.textContent = this.formatCurrency(performance.dailyPL || 0);
          dailyPlElement.className = `perf-value ${(performance.dailyPL || 0) >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (weeklyPlElement && performance) {
          weeklyPlElement.textContent = this.formatCurrency(performance.weeklyPL || 0);
          weeklyPlElement.className = `perf-value ${(performance.weeklyPL || 0) >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (monthlyPlElement && performance) {
          monthlyPlElement.textContent = this.formatCurrency(performance.monthlyPL || 0);
          monthlyPlElement.className = `perf-value ${(performance.monthlyPL || 0) >= 0 ? 'positive' : 'negative'}`;
        }
        
        if (commissionElement && positions) {
          commissionElement.textContent = this.formatCurrency(Math.abs(positions.totalCommission || 0));
        }
        
        if (swapElement && positions) {
          swapElement.textContent = this.formatCurrency(positions.totalSwap || 0);
          swapElement.className = `perf-value ${(positions.totalSwap || 0) >= 0 ? 'positive' : 'negative'}`;
        }
      }
    } catch (error) {
      console.error('Error updating performance stats:', error);
    }
  }

  formatCurrency(amount, currency = 'USD') {
    if (typeof amount !== 'number') return '$0.00';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  // ========== END MT5 FUNCTIONS ==========

  // Cleanup method
  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    if (this.mt5UpdateInterval) {
      clearInterval(this.mt5UpdateInterval);
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new TradingDashboard();
});

// Global functions accessible from HTML
window.refreshMT5Data = async function() {
  if (window.dashboard) {
    await window.dashboard.updateMT5Dashboard();
    if (window.dashboard.currentPage === 'trading') {
      await window.dashboard.updateTradingData();
    }
  }
};

window.refreshPositions = async function() {
  if (window.dashboard) {
    await window.dashboard.updatePositionsTable();
  }
};

window.closePosition = async function(positionId) {
  if (!confirm('Are you sure you want to close this position?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/mt5/positions/${positionId}/close`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Show success notification
      if (window.dashboard) {
        window.dashboard.showNotification('Position closed successfully', 'success');
        // Refresh positions after a short delay
        setTimeout(() => {
          window.dashboard.updatePositionsTable();
          window.dashboard.updateMT5Dashboard();
        }, 2000);
      }
    } else {
      throw new Error(result.error || 'Failed to close position');
    }
  } catch (error) {
    console.error('Error closing position:', error);
    if (window.dashboard) {
      window.dashboard.showNotification('Failed to close position: ' + error.message, 'error');
    }
  }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.dashboard) {
    window.dashboard.destroy();
  }
});
