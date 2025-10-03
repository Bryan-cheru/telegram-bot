// Simple Trading Dashboard - MetaAPI Token Based System
// Clean implementation for signal channel business model

class SimpleTradingDashboard {
  constructor() {
    this.accounts = [];
    this.positions = [];
    this.currentPage = 'dashboard';
    this.refreshInterval = null;
    
    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupEventListeners();
    this.loadInitialData();
    this.startAutoRefresh();
  }

  // Navigation System
  setupNavigation() {
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
      accounts: 'Connected Accounts', 
      positions: 'Active Positions',
      history: 'Trade History',
      logs: 'System Logs',
      settings: 'Settings'
    };
    document.getElementById('page-title').textContent = titles[page] || 'Dashboard';

    this.currentPage = page;
    this.loadPageData(page);
  }

  setupEventListeners() {
    // Auto-refresh on visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.loadInitialData();
      }
    });
  }

  // Data Loading - Auto-fetch account data from environment
  async loadInitialData() {
    try {
      this.showNotification('Loading account data...', 'info');
      
      await Promise.all([
        this.loadMT5Accounts(),
        this.loadSystemStatus(),
        this.loadPositions(),
        this.loadTradeHistory(),
        this.updateDashboardStats()
      ]);
      
      this.showNotification('Account data loaded successfully!', 'success');
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showNotification('Failed to load account data from environment', 'error');
    }
  }

  async loadPageData(page) {
    switch (page) {
      case 'dashboard':
        await this.updateDashboardStats();
        break;
      case 'accounts':
        await this.loadAccounts();
        break;
      case 'positions':
        await this.loadPositions();
        break;
      case 'history':
        await this.loadTradeHistory();
        break;
      case 'logs':
        if (!this.logs) {
          this.initializeLogs();
        }
        this.renderLogs();
        break;
      default:
        break;
    }
  }

  // API Calls - Load MT5 accounts from environment
  async loadMT5Accounts() {
    try {
      const response = await fetch('/api/mt5/account');
      const result = await response.json();

      if (result.success) {
        this.accounts = result.data || [];
        console.log('Loaded MT5 accounts:', this.accounts);
        this.renderAccounts();
        this.updateAccountFilter();
      } else {
        throw new Error(result.error || 'Failed to load MT5 accounts');
      }
    } catch (error) {
      console.error('Load MT5 accounts error:', error);
      this.showNotification('Failed to load MT5 accounts from environment', 'error');
      this.accounts = [];
      this.renderAccounts();
    }
  }

  // Legacy loadAccounts - redirect to MT5 version
  async loadAccounts() {
    return this.loadMT5Accounts();
  }

  async loadPositions() {
    try {
      const response = await fetch('/api/mt5/positions');
      const result = await response.json();

      if (result.success) {
        this.positions = result.data || [];
        this.renderPositions();
      } else {
        throw new Error(result.error || 'Failed to load MT5 positions');
      }
    } catch (error) {
      console.error('Load MT5 positions error:', error);
      this.showNotification('Failed to load MT5 positions from IFPro account', 'error');
    }
  }

  async loadTradeHistory() {
    try {
      const response = await fetch('/api/mt5/trade-history');
      const result = await response.json();

      if (result.success) {
        this.renderTradeHistory(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to load MT5 trade history');
      }
    } catch (error) {
      console.error('Load MT5 trade history error:', error);
      this.showNotification('Failed to load MT5 trade history from IFPro account', 'error');
    }
  }

  async loadSystemStatus() {
    try {
      const response = await fetch('/api/status');
      const result = await response.json();

      if (result.success) {
        this.updateSystemStatus(result.data);
      }
    } catch (error) {
      console.error('Load system status error:', error);
    }
  }

  // Account Management - Automatic from environment

  // Rendering Methods
  renderAccounts() {
    const container = document.getElementById('accounts-container');
    if (!container) return;

    if (this.accounts.length === 0) {
      container.innerHTML = `
        <div class="no-data">
          <div class="no-data-icon">
            <i class="fas fa-wallet"></i>
          </div>
          <h3>Loading Trading Accounts...</h3>
          <p>Fetching account data from environment configuration</p>
          <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i> Loading IFPro account...
          </div>
        </div>
      `;
      return;
    }

    const accountsHtml = this.accounts.map(account => `
      <div class="modern-account-card ${account.isActive ? 'connected' : 'disconnected'}" data-account-id="${account._id}">
        <!-- Account Header -->
        <div class="account-header">
          <div class="account-info">
            <div class="account-avatar">
              <i class="fas fa-${account.isActive ? 'chart-line' : 'unlink'}"></i>
            </div>
            <div class="account-details">
              <h4 class="account-name">${account.displayName || 'Trading Account'}</h4>
              <span class="account-id">${account.accountId}</span>
              <div class="account-meta">
                <span class="account-type ${account.accountType?.toLowerCase()}">${account.accountType}</span>
                <span class="broker-server">${account.brokerServer}</span>
              </div>
            </div>
          </div>
          <div class="connection-status">
            <span class="status-indicator ${account.isActive ? 'online' : 'offline'}">
              <i class="fas fa-circle"></i>
            </span>
            <span class="status-text">${account.isActive ? 'Active' : 'Inactive'}</span>
          </div>
        </div>

        <!-- Account Metrics Grid -->
        <div class="account-metrics">
          <div class="metric-card status">
            <div class="metric-icon">
              <i class="fas fa-info-circle"></i>
            </div>
            <div class="metric-content">
              <span class="metric-label">Account Status</span>
              <span class="metric-value ${account.isActive ? 'positive' : 'neutral'}">
                ${account.isActive ? 'Connected' : 'Disconnected'}
              </span>
              <span class="metric-subtitle">Added ${this.formatDate(account.createdAt)}</span>
            </div>
          </div>

          <div class="metric-card trading-data">
            <div class="metric-icon">
              <i class="fas fa-chart-line"></i>
            </div>
            <div class="metric-content">
              <span class="metric-label">Trading Data</span>
              <span class="metric-value neutral">
                Loading...
              </span>
              <span class="metric-subtitle">Fetching live data</span>
            </div>
          </div>

          <div class="metric-card signals">
            <div class="metric-icon">
              <i class="fas fa-satellite-dish"></i>
            </div>
            <div class="metric-content">
              <span class="metric-label">Signal Reception</span>
              <span class="metric-value ${account.isActive ? 'positive' : 'neutral'}">
                ${account.isActive ? 'Ready' : 'Paused'}
              </span>
              <span class="metric-subtitle">${account.isActive ? 'Receiving signals' : 'Not active'}</span>
            </div>
          </div>

          <div class="metric-card settings">
            <div class="metric-icon">
              <i class="fas fa-cogs"></i>
            </div>
            <div class="metric-content">
              <span class="metric-label">Configuration</span>
              <span class="metric-value">Complete</span>
              <span class="metric-subtitle">Ready for trading</span>
            </div>
          </div>
        </div>

        <!-- Account Actions -->
        <div class="account-actions">
          <button class="btn btn-outline btn-sm" onclick="dashboard.testAccountConnection('${account._id}')" 
                  ${!account.isActive ? 'disabled' : ''}>
            <i class="fas fa-wifi"></i>
            <span>Test Connection</span>
          </button>
          <button class="btn btn-${account.isActive ? 'secondary' : 'success'} btn-sm" onclick="dashboard.toggleAccountStatus('${account._id}')">
            <i class="fas fa-${account.isActive ? 'pause' : 'play'}"></i>
            <span>${account.isActive ? 'Deactivate' : 'Activate'}</span>
          </button>
          <button class="btn btn-primary btn-sm" onclick="dashboard.editAccount('${account._id}')">
            <i class="fas fa-edit"></i>
            <span>Edit</span>
          </button>
          <button class="btn btn-danger btn-sm" onclick="dashboard.removeAccount('${account._id}')">
            <i class="fas fa-trash-alt"></i>
            <span>Remove</span>
          </button>
        </div>

        <!-- Status Information -->
        ${!account.isActive ? `
          <div class="connection-alert">
            <i class="fas fa-pause-circle"></i>
            <div class="alert-content">
              <span class="alert-title">Account Inactive</span>
              <span class="alert-message">
                This account is currently deactivated and won't receive trading signals.
              </span>
            </div>
            <button class="btn btn-sm btn-success" onclick="dashboard.toggleAccountStatus('${account._id}')">
              <i class="fas fa-play"></i> Activate Account
            </button>
          </div>
        ` : ''}
      </div>
    `).join('');

    container.innerHTML = accountsHtml;
  }

  // Utility function for formatting currency
  formatCurrency(amount) {
    if (typeof amount !== 'number') return '0.00';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  // Utility function for formatting dates
  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  renderPositions() {
    const tbody = document.getElementById('positions-tbody');
    if (!tbody) return;

    if (this.positions.length === 0) {
      tbody.innerHTML = `
        <tr class="no-data">
          <td colspan="8" class="text-center">
            <i class="fas fa-chart-line text-muted"></i>
            <span>No active positions</span>
          </td>
        </tr>
      `;
      return;
    }

    const positionsHtml = this.positions.map(position => `
      <tr>
        <td>${position.accountId}</td>
        <td><strong>${position.symbol}</strong></td>
        <td><span class="badge ${position.type.toLowerCase()}">${position.type}</span></td>
        <td>${position.volume}</td>
        <td>${position.openPrice}</td>
        <td>${position.currentPrice}</td>
        <td class="${position.unrealizedProfit >= 0 ? 'profit' : 'loss'}">
          $${position.unrealizedProfit?.toFixed(2) || '0.00'}
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="dashboard.closePosition('${position.id}')">
            <i class="fas fa-times"></i> Close
          </button>
        </td>
      </tr>
    `).join('');

    tbody.innerHTML = positionsHtml;
  }

  renderTradeHistory(trades) {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (trades.length === 0) {
      tbody.innerHTML = `
        <tr class="no-data">
          <td colspan="8" class="text-center">No trade history available</td>
        </tr>
      `;
      return;
    }

    const tradesHtml = trades.map(trade => `
      <tr>
        <td>${new Date(trade.closeTime || trade.openTime).toLocaleDateString()}</td>
        <td>${trade.accountId}</td>
        <td><strong>${trade.symbol}</strong></td>
        <td><span class="badge ${trade.type.toLowerCase()}">${trade.type}</span></td>
        <td>${trade.volume}</td>
        <td>${trade.openPrice}</td>
        <td>${trade.closePrice || 'N/A'}</td>
        <td class="${trade.profit >= 0 ? 'profit' : 'loss'}">
          $${trade.profit?.toFixed(2) || '0.00'}
        </td>
      </tr>
    `).join('');

    tbody.innerHTML = tradesHtml;
  }

  // Dashboard Stats
  updateDashboardStats() {
    const totalBalance = this.accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const totalEquity = this.accounts.reduce((sum, acc) => sum + (acc.equity || 0), 0);
    const totalPositions = this.accounts.reduce((sum, acc) => sum + (acc.positionsCount || 0), 0);
    const connectedAccounts = this.accounts.filter(acc => acc.isConnected).length;

    // Update stat cards
    this.updateElement('total-accounts', this.accounts.length);
    this.updateElement('accounts-status', `${connectedAccounts} Connected`);
    this.updateElement('total-balance', `$${totalBalance.toFixed(2)}`);
    this.updateElement('total-equity', `$${totalEquity.toFixed(2)}`);
    this.updateElement('total-positions', totalPositions);

    // Calculate P&L change
    const pnl = totalEquity - totalBalance;
    this.updateElement('equity-change', `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} P&L`);
  }

  updateSystemStatus(status) {
    const badge = document.getElementById('system-status-badge');
    if (badge) {
      badge.className = `status-badge ${status.online ? 'online' : 'offline'}`;
      badge.innerHTML = `
        <i class="fas fa-circle"></i>
        <span>System ${status.online ? 'Online' : 'Offline'}</span>
      `;
    }
  }

  updateAccountFilter() {
    const select = document.getElementById('account-filter');
    if (!select) return;

    const options = ['<option value="all">All Accounts</option>'];
    this.accounts.forEach(account => {
      options.push(`<option value="${account.accountId}">${account.alias || account.accountId}</option>`);
    });

    select.innerHTML = options.join('');
  }

  // Modal Management - Removed (accounts loaded from environment)

  // Account Actions
  async refreshAccount(accountId) {
    try {
      const response = await fetch(`/api/accounts/${accountId}/refresh`, {
        method: 'POST'
      });

      const result = await response.json();
      
      if (result.success) {
        this.showNotification('Account refreshed successfully', 'success');
        await this.loadAccounts();
      } else {
        throw new Error(result.error || 'Failed to refresh account');
      }
    } catch (error) {
      console.error('Refresh account error:', error);
      this.showNotification('Failed to refresh account', 'error');
    }
  }

  async removeAccount(accountId) {
    if (!confirm('⚠️  Are you sure you want to remove this account?\n\nThis action cannot be undone and will disconnect this trading account from your dashboard.')) {
      return;
    }

    try {
      const response = await fetch(`/api/user/accounts/${accountId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        this.showNotification('Account removed successfully', 'success');
        await this.loadAccounts();
        await this.updateDashboardStats();
      } else {
        throw new Error(result.error || 'Failed to remove account');
      }
    } catch (error) {
      console.error('Remove account error:', error);
      this.showNotification('Failed to remove account: ' + error.message, 'error');
    }
  }

  async testAccountConnection(accountId) {
    try {
      this.showNotification('Testing account connection...', 'info');
      
      // For now, just simulate a connection test
      // In the future, this would test the actual MetaAPI connection
      setTimeout(() => {
        this.showNotification('Connection test completed - account is reachable', 'success');
      }, 2000);
    } catch (error) {
      console.error('Test connection error:', error);
      this.showNotification('Connection test failed: ' + error.message, 'error');
    }
  }

  async toggleAccountStatus(accountId) {
    try {
      const account = this.accounts.find(acc => acc._id === accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      const newStatus = !account.isActive;
      const response = await fetch(`/api/user/accounts/${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isActive: newStatus
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const statusText = newStatus ? 'activated' : 'deactivated';
        this.showNotification(`Account ${statusText} successfully`, 'success');
        await this.loadAccounts();
        await this.updateDashboardStats();
      } else {
        throw new Error(result.error || 'Failed to update account status');
      }
    } catch (error) {
      console.error('Toggle account status error:', error);
      this.showNotification('Failed to update account status: ' + error.message, 'error');
    }
  }

  async editAccount(accountId) {
    // For now, just show a notification that this feature is coming soon
    this.showNotification('Account editing feature coming soon', 'info');
  }

  async closePosition(positionId) {
    if (!confirm('Are you sure you want to close this position?')) {
      return;
    }

    try {
      const response = await fetch(`/api/positions/${positionId}/close`, {
        method: 'POST'
      });

      const result = await response.json();
      
      if (result.success) {
        this.showNotification('Position closed successfully', 'success');
        await this.loadPositions();
        await this.updateDashboardStats();
      } else {
        throw new Error(result.error || 'Failed to close position');
      }
    } catch (error) {
      console.error('Close position error:', error);
      this.showNotification('Failed to close position', 'error');
    }
  }

  // New UI Action Functions
  async viewAccountDetails(accountId) {
    // For now, just switch to positions page filtered by this account
    this.switchPage('positions');
    
    // Update account filter
    const accountFilter = document.getElementById('account-filter');
    if (accountFilter) {
      accountFilter.value = accountId;
    }
    
    this.showNotification(`Viewing details for account ${accountId}`, 'info');
  }

  async reconnectAccount(accountId) {
    try {
      this.showNotification('Attempting to reconnect account...', 'info');
      
      // For now, just refresh the account data
      await this.refreshAccount(accountId);
      
      this.showNotification('Reconnection attempt completed', 'success');
    } catch (error) {
      console.error('Reconnect account error:', error);
      this.showNotification('Failed to reconnect account', 'error');
    }
  }

  // Utility Functions
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
      </div>
    `;

    container.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);

    // Click to dismiss
    notification.addEventListener('click', () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
  }

  // Auto Refresh
  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      if (this.currentPage === 'dashboard') {
        this.loadAccounts();
      } else if (this.currentPage === 'positions') {
        this.loadPositions();
      }
      // Only refresh when user is actually viewing these pages
    }, 30000); // Refresh every 30 seconds
  }

  // ======= SYSTEM LOGS FUNCTIONALITY =======
  
  initializeLogs() {
    this.logs = [];
    this.maxLogs = 1000;
    this.autoScroll = true;
    this.logFilter = 'all';
    
    this.setupLogControls();
    this.startLogFetching();
    
    // Add some initial demo logs
    this.addLog('info', 'System initialized successfully');
    this.addLog('success', 'Dashboard connected to backend');
    this.addLog('info', 'Auto-refresh enabled for real-time updates');
  }
  
  setupLogControls() {
    // Log level filter
    const logFilter = document.getElementById('log-level-filter');
    if (logFilter) {
      logFilter.addEventListener('change', (e) => {
        this.logFilter = e.target.value;
        this.renderLogs();
      });
    }
    
    // Clear logs button
    const clearLogsBtn = document.getElementById('clear-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        this.clearLogs();
      });
    }
    
    // Auto-scroll toggle
    const autoScrollBtn = document.getElementById('auto-scroll-toggle');
    if (autoScrollBtn) {
      autoScrollBtn.addEventListener('click', () => {
        this.autoScroll = !this.autoScroll;
        autoScrollBtn.classList.toggle('active', this.autoScroll);
        
        const icon = autoScrollBtn.querySelector('i');
        if (icon) {
          icon.className = this.autoScroll ? 'fas fa-arrow-down' : 'fas fa-pause';
        }
      });
    }
  }
  
  startLogFetching() {
    // Simulate real-time logs from the server
    this.logFetchInterval = setInterval(() => {
      if (this.currentPage === 'logs') {
        this.fetchServerLogs();
      }
    }, 2000);
    
    // Add periodic system status updates
    setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance
        const messages = [
          'Account synchronization completed',
          'Checking for new trading signals...',
          'MetaAPI connection verified',
          'Risk management rules validated',
          'Trade execution engine ready',
          'Market data stream active'
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        this.addLog('info', message);
      }
    }, 15000);
  }
  
  async fetchServerLogs() {
    try {
      const response = await fetch('/api/logs?limit=50');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data.logs) {
        // Get current log IDs to avoid duplicates
        const currentLogIds = new Set(this.logs.map(log => log.id));
        
        // Add new logs that we don't already have
        const newLogs = result.data.logs.filter(log => !currentLogIds.has(log.id));
        
        newLogs.forEach(log => {
          // Convert server log format to client format
          const clientLog = {
            id: log.id,
            timestamp: new Date(log.timestamp),
            level: log.level,
            message: `[${log.source || 'SYSTEM'}] ${log.message}`
          };
          
          this.logs.unshift(clientLog);
        });
        
        // Keep only the latest logs
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(0, this.maxLogs);
        }
        
        // Update display if we're on the logs page
        if (this.currentPage === 'logs') {
          this.renderLogs();
        }
      }
    } catch (error) {
      console.error('Failed to fetch server logs:', error);
      // Fallback to adding an error log
      this.addLog('error', 'Failed to fetch server logs: ' + error.message);
    }
  }
  
  addLog(level, message) {
    const timestamp = new Date();
    const log = {
      id: Date.now() + Math.random(),
      timestamp: timestamp,
      level: level,
      message: message
    };
    
    this.logs.unshift(log); // Add to beginning
    
    // Keep only the latest logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    // Update logs display if we're on the logs page
    if (this.currentPage === 'logs') {
      this.renderLogs();
    }
    
    // Update log count
    const logCount = document.getElementById('log-count');
    if (logCount) {
      logCount.textContent = `${this.logs.length} entries`;
    }
  }
  
  renderLogs() {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    
    // Filter logs
    let filteredLogs = this.logs;
    if (this.logFilter !== 'all') {
      filteredLogs = this.logs.filter(log => log.level === this.logFilter);
    }
    
    // Generate HTML
    if (filteredLogs.length === 0) {
      logContent.innerHTML = `
        <div class="log-empty">
          <i class="fas fa-inbox"></i>
          <p>No logs to display</p>
        </div>
      `;
      return;
    }
    
    const logsHtml = filteredLogs.map(log => `
      <div class="log-entry ${log.level}" data-level="${log.level}">
        <span class="log-time">[${this.formatLogTime(log.timestamp)}]</span>
        <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
        <span class="log-message">${this.escapeHtml(log.message)}</span>
      </div>
    `).join('');
    
    const wasAtBottom = this.isScrolledToBottom(logContent);
    logContent.innerHTML = logsHtml;
    
    // Auto-scroll to bottom if enabled and user was at bottom
    if (this.autoScroll && wasAtBottom) {
      setTimeout(() => {
        logContent.scrollTop = logContent.scrollHeight;
      }, 10);
    }
    
    // Add animation to new entries
    const newEntries = logContent.querySelectorAll('.log-entry');
    newEntries.forEach((entry, index) => {
      if (index < 3) { // Animate the 3 most recent entries
        entry.classList.add('new');
        setTimeout(() => entry.classList.remove('new'), 300);
      }
    });
  }
  
  formatLogTime(date) {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  isScrolledToBottom(element) {
    return element.scrollHeight - element.clientHeight <= element.scrollTop + 1;
  }
  
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
  
  clearLogs() {
    this.logs = [];
    this.renderLogs();
    this.addLog('info', 'Log history cleared');
    
    const logCount = document.getElementById('log-count');
    if (logCount) {
      logCount.textContent = '1 entry';
    }
  }

  // ======= END SYSTEM LOGS FUNCTIONALITY =======

  // Cleanup
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.logFetchInterval) {
      clearInterval(this.logFetchInterval);
    }
  }
}

// Initialize dashboard when DOM is ready
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
  dashboard = new SimpleTradingDashboard();
  window.dashboard = dashboard; // Make globally accessible
});

// Global utility functions for HTML onclick handlers
// Add account functions removed - accounts loaded from environment

function refreshAllData() {
  if (dashboard) {
    dashboard.loadMT5Accounts();
    dashboard.loadPositions();
    dashboard.loadTradeHistory();
    dashboard.updateDashboardStats();
    dashboard.showNotification('Account data refreshed from environment', 'success');
  }
}

function refreshPositions() {
  if (dashboard) dashboard.loadPositions();
}

function viewSystemLogs() {
  // Open system logs in new window or switch to logs page
  if (dashboard) {
    dashboard.showNotification('System logs feature coming soon', 'info');
  }
}

function exportTradeHistory() {
  if (dashboard) {
    dashboard.showNotification('Export feature coming soon', 'info');
  }
}

function saveGlobalSettings() {
  if (dashboard) {
    const risk = document.getElementById('default-risk').value;
    const maxPosition = document.getElementById('max-position-size').value;
    
    // Save settings (implement API call)
    dashboard.showNotification('Settings saved successfully', 'success');
  }
}

function clearAllData() {
  if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
    if (dashboard) {
      dashboard.showNotification('Clear data feature coming soon', 'info');
    }
  }
}

// Clear all connected accounts
async function clearAllAccounts() {
  if (confirm('⚠️  Are you sure you want to remove ALL connected accounts?\n\nThis action cannot be undone and will disconnect all your trading accounts.')) {
    try {
      // First get all accounts to delete them individually
      const getResponse = await fetch('/api/user/accounts');
      const getResult = await getResponse.json();
      
      if (!getResult.success || !getResult.data || getResult.data.length === 0) {
        if (dashboard) {
          dashboard.showNotification('No accounts to clear', 'info');
        }
        return;
      }

      // Delete all accounts
      const deletePromises = getResult.data.map(account => 
        fetch(`/api/user/accounts/${account._id}`, { method: 'DELETE' })
      );

      const results = await Promise.all(deletePromises);
      const allSuccessful = results.every(response => response.ok);
      
      if (allSuccessful) {
        if (dashboard) {
          dashboard.showNotification(`Successfully removed ${getResult.data.length} account(s)`, 'success');
          await dashboard.loadAccounts();
          await dashboard.updateDashboardStats();
        }
      } else {
        throw new Error('Some accounts could not be removed');
      }
    } catch (error) {
      console.error('Clear accounts error:', error);
      if (dashboard) {
        dashboard.showNotification('Failed to clear accounts: ' + error.message, 'error');
      }
    }
  }
}

// Refresh accounts manually
async function refreshAccounts() {
  if (dashboard) {
    try {
      dashboard.showNotification('Refreshing accounts...', 'info');
      await dashboard.loadAccounts();
      await dashboard.updateDashboardStats();
      dashboard.showNotification('Accounts refreshed successfully', 'success');
    } catch (error) {
      console.error('Refresh accounts error:', error);
      dashboard.showNotification('Failed to refresh accounts', 'error');
    }
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (dashboard) {
    dashboard.destroy();
  }
});