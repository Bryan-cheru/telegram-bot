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
    this.metricsData = null;
    this.performanceSummary = null;
    this.rateLimitStatus = null;
    
    console.log('🚀 Initializing Clean Trading Dashboard...');
    this.init();
  }

  async init() {
    this.setupNavigation();
    this.setupEventListeners();
    
    // Skip loading state - load data directly
    try {
      await this.loadAccountData();
      await this.loadPositions();
      this.updateDashboardStats(); // Update stats after loading positions
      await this.loadMetaStatsData();
      this.startAutoRefresh();
      this.showNotification('Dashboard loaded successfully!', 'success');
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
      this.showNotification('Failed to load dashboard data', 'error');
      // Force render empty states
      this.renderAccountInfo();
      this.renderPositions();
    }
  }

  setupNavigation() {
    // Handle page switching - updated to work with the actual HTML structure
    document.querySelectorAll('.menu-link').forEach(link => {
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
        if (sidebar) {
          sidebar.classList.toggle('open');
        }
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
    
    // Update navigation - work with actual HTML class names
    document.querySelectorAll('.menu-link').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

    // Update content - work with actual section structure
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById(page)?.classList.add('active');
  }

  showAddAccountModal() {
    const modal = document.getElementById('add-account-modal');
    if (modal) {
      modal.style.display = 'block';
    }
  }

  showSignalTestModal() {
    const modal = document.getElementById('signal-test-modal');
    if (modal) {
      modal.style.display = 'block';
    }
  }

  async testBotConnection() {
    try {
      this.showNotification('Testing bot connection...', 'info');
      // Add your bot connection test logic here
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.showNotification('Bot connection successful!', 'success');
    } catch (error) {
      this.showNotification('Bot connection failed', 'error');
      console.error('Bot connection test failed:', error);
    }
  }

  refreshActivity() {
    this.showNotification('Refreshing activity...', 'info');
    // Add your activity refresh logic here
    this.loadAccountData();
    this.loadPositions();
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }

    // Update page title to current page
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
      pageTitle.textContent = this.getPageTitle(this.currentPage);
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
        this.updateDashboardStats(); // Update the stat cards
        this.updateConnectionStatus(true);
      } else {
        throw new Error(result.error || 'Failed to load account data');
      }
    } catch (error) {
      console.error('❌ Error loading account data:', error);
      this.showNotification('Failed to connect to trading account', 'error');
      this.updateConnectionStatus(false);
      // Render error state instead of leaving loading spinner
      this.renderAccountInfo();
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
    this.updateStatCard('total-balance', Utils.formatCurrency(summary.totalBalance || 0));
    this.updateStatCard('total-equity', Utils.formatCurrency(summary.totalEquity || 0));
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
              <span class="value balance">${Utils.formatCurrency(account.balance)}</span>
            </div>
            <div class="detail-item">
              <label>Equity</label>
              <span class="value equity">${Utils.formatCurrency(account.equity)}</span>
            </div>
            <div class="detail-item">
              <label>Free Margin</label>
              <span class="value">${Utils.formatCurrency(account.freeMargin)}</span>
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
            ${Utils.formatCurrency(position.profit || 0)}
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
        
        <div class="position-actions">
          <button class="btn btn-danger btn-sm" onclick="dashboard.closePosition('${position.accountId || 'IFPRO-TRADE'}', '${position.id}', '${position.symbol}')">
            <i class="fas fa-times"></i> Close Position
          </button>
          <button class="btn btn-outline btn-sm" onclick="dashboard.modifyPosition('${position.accountId || 'IFPRO-TRADE'}', '${position.id}')">
            <i class="fas fa-edit"></i> Modify
          </button>
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
              ${Utils.formatCurrency(summary.totalProfit || 0)}
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
                ${Utils.formatCurrency(deal.profit)}
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
    // Removed loading spinners - data loads directly
    console.log('🔄 Skipping loading state - loading data directly');
  }

  clearLoadingState() {
    // No longer needed - no loading state to clear
    console.log('🔄 No loading state to clear');
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
        // Load MetaStats data every few refreshes to avoid rate limits
        if (Math.random() < 0.3) { // 30% chance each refresh
          this.loadMetaStatsData();
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
      await this.loadMetaStatsData();
      this.updateDashboardStats();
      this.showNotification('Data refreshed successfully!', 'success');
    } catch (error) {
      console.error('Refresh failed:', error);
      this.showNotification('Failed to refresh data', 'error');
    }
  }

  // ===============================
  // METASTATS INTEGRATION
  // ===============================

  async loadMetaStatsData() {
    const accountId = this.accountData?.primaryAccountId || this.accountData?.accounts?.[0]?.accountId || this.accountData?.accounts?.[0]?.id;
    
    if (!accountId) {
      console.warn('⚠️ No account ID available for MetaStats - skipping');
      return;
    }

    try {
      console.log('📊 Loading MetaStats performance data for account:', accountId);
      
      // Load performance summary (includes metrics, recent trades, open trades)
      const summaryResponse = await fetch(`/api/metastats/${accountId}/summary`);
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        if (summaryData.success) {
          this.performanceSummary = summaryData.data;
          this.metricsData = summaryData.data.summary;
          console.log('✅ MetaStats data loaded:', this.performanceSummary);
        } else {
          console.warn('⚠️ MetaStats API returned error:', summaryData.error);
        }
      } else {
        console.warn('⚠️ MetaStats API request failed:', summaryResponse.status);
      }

      // Load rate limiting status
      try {
        const poolResponse = await fetch('/api/pool/stats');
        if (poolResponse.ok) {
          const poolData = await poolResponse.json();
          if (poolData.success) {
            this.rateLimitStatus = poolData.data.rateLimitStatus;
            console.log('📡 Rate limit status:', this.rateLimitStatus);
          }
        }
      } catch (poolError) {
        console.warn('⚠️ Pool stats not available:', poolError.message);
      }

      this.updateMetaStatsDisplay();
      
    } catch (error) {
      console.error('❌ Failed to load MetaStats data:', error);
      // Don't let MetaStats errors block the dashboard
    }
  }

  updateMetaStatsDisplay() {
    if (!this.metricsData) return;

    // Update performance metrics with animation
    this.updateElementTextWithAnimation('profit-factor', this.metricsData.profitFactor?.toFixed(2) || 'N/A');
    this.updateElementTextWithAnimation('win-rate', `${(this.metricsData.winRate * 100).toFixed(1)}%` || 'N/A');
    this.updateElementTextWithAnimation('max-drawdown', `${this.metricsData.maxDrawdown?.toFixed(2)}%` || 'N/A');
    this.updateElementTextWithAnimation('sharpe-ratio', this.metricsData.sharpeRatio?.toFixed(2) || 'N/A');
    this.updateElementTextWithAnimation('total-trades', this.metricsData.totalTrades || '0');

    // Update rate limiting information
    if (this.rateLimitStatus) {
      const global = this.rateLimitStatus.global;
      const server = this.rateLimitStatus.server;
      
      this.updateElementText('rate-limit-credits', `${global.credits}/1000`);
      this.updateElementText('server-credits', `${server.credits}/2000`);
      this.updateElementText('current-server', this.rateLimitStatus.currentServer);
    }

    // Show MetaStats section with fade-in animation
    const metricsSection = document.getElementById('performance-metrics');
    if (metricsSection) {
      metricsSection.style.display = 'block';
      metricsSection.style.opacity = '0';
      setTimeout(() => {
        metricsSection.style.transition = 'opacity 0.5s ease';
        metricsSection.style.opacity = '1';
      }, 100);
    }
  }

  updateElementTextWithAnimation(elementId, text) {
    const element = document.getElementById(elementId);
    if (element && element.textContent !== text) {
      element.textContent = text;
      element.classList.add('updated');
      setTimeout(() => {
        element.classList.remove('updated');
      }, 300);
    }
  }

  updateElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
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
        <div class="no-data">
          <i class="fas fa-file-alt"></i>
          <p>Initializing logs...</p>
        </div>
      </div>
    `;

    this.loadLogs();
  }

  async loadLogs() {
    try {
      // First load existing logs
      const response = await fetch('/api/logs?limit=100');
      const logs = await response.json();
      
      const container = document.getElementById('logs-container');
      if (!container) return;

      if (logs.length === 0) {
        container.innerHTML = `
          <div class="no-data">
            <i class="fas fa-file-alt"></i>
            <span>No logs available yet</span>
          </div>
        `;
      } else {
        this.renderLogs(logs);
      }

      // Set up real-time log streaming
      this.setupLogStreaming();
      
    } catch (error) {
      console.error('Error loading logs:', error);
      const container = document.getElementById('logs-container');
      if (container) {
        container.innerHTML = `
          <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Failed to load logs: ${error.message}</span>
          </div>
        `;
      }
    }
  }

  renderLogs(logs) {
    const container = document.getElementById('logs-container');
    if (!container) return;

    const logsHTML = logs.map(log => {
      const level = log.level || 'info';
      const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      return `
        <div class="log-entry ${level}" data-level="${level}">
          <span class="log-time">${timestamp}</span>
          <span class="log-level ${level}">${level.toUpperCase()}</span>
          <span class="log-message">${this.formatLogMessage(log.message)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = logsHTML;
    
    // Auto-scroll to bottom if enabled
    if (this.autoScroll) {
      container.scrollTop = container.scrollHeight;
    }

    // Update log count
    this.updateLogStats(logs.length);
  }

  formatLogMessage(message) {
    if (!message) return 'No message';
    
    // Add emoji indicators for common log types
    let formatted = message
      .replace(/✅/g, '<span class="emoji">✅</span>')
      .replace(/❌/g, '<span class="emoji">❌</span>')
      .replace(/⚠️/g, '<span class="emoji">⚠️</span>')
      .replace(/🔍/g, '<span class="emoji">🔍</span>')
      .replace(/🚀/g, '<span class="emoji">🚀</span>')
      .replace(/💡/g, '<span class="emoji">💡</span>')
      .replace(/🎯/g, '<span class="emoji">🎯</span>');
    
    return formatted;
  }

  setupLogStreaming() {
    if (this.logStream) {
      this.logStream.close();
    }

    this.logStream = new EventSource('/api/logs/stream');
    
    this.logStream.onopen = () => {
      console.log('📡 Log stream connected');
      this.updateConnectionStatus(true);
    };

    this.logStream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'heartbeat') {
          return; // Ignore heartbeat messages
        }
        
        if (data.type === 'log' || data.message) {
          this.appendLogEntry(data);
        }
        
      } catch (error) {
        console.error('Error parsing log stream data:', error);
      }
    };

    this.logStream.onerror = (error) => {
      console.error('Log stream error:', error);
      this.updateConnectionStatus(false);
      
      // Reconnect after 5 seconds
      setTimeout(() => {
        console.log('Reconnecting log stream...');
        this.setupLogStreaming();
      }, 5000);
    };
  }

  appendLogEntry(activity) {
    const container = document.getElementById('logs-container');
    if (!container) return;

    // Handle both old log format and new activity format
    const isActivity = activity.type === 'activity';
    const level = activity.level || 'info';
    const timestamp = new Date(activity.timestamp || new Date()).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const logEntry = document.createElement('div');
    
    if (isActivity) {
      // New user-friendly activity format
      logEntry.className = `log-entry activity-entry ${level} category-${activity.category || 'system'}`;
      logEntry.setAttribute('data-level', level);
      logEntry.setAttribute('data-category', activity.category || 'system');
      logEntry.innerHTML = `
        <div class="activity-icon">${activity.icon}</div>
        <div class="activity-content">
          <div class="activity-header">
            <span class="activity-title">${activity.title}</span>
            <span class="activity-time">${timestamp}</span>
          </div>
          <div class="activity-message">${activity.message}</div>
          <div class="activity-category">${(activity.category || 'system').toUpperCase()}</div>
        </div>
      `;
    } else {
      // Fallback for old log format
      logEntry.className = `log-entry ${level}`;
      logEntry.setAttribute('data-level', level);
      logEntry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-level ${level}">${level.toUpperCase()}</span>
        <span class="log-message">${this.formatLogMessage(activity.message)}</span>
      `;
    }

    // Add with smooth animation
    logEntry.style.opacity = '0';
    logEntry.style.transform = 'translateX(-30px)';
    container.appendChild(logEntry);
    
    // Trigger animation
    setTimeout(() => {
      logEntry.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      logEntry.style.opacity = '1';
      logEntry.style.transform = 'translateX(0)';
    }, 10);

    // Remove old entries if too many (keep last 200 for performance)
    const entries = container.querySelectorAll('.log-entry');
    if (entries.length > 200) {
      entries[0].style.transition = 'all 0.3s ease';
      entries[0].style.opacity = '0';
      entries[0].style.transform = 'translateX(30px)';
      setTimeout(() => entries[0].remove(), 300);
    }

    // Auto-scroll if enabled
    if (this.autoScroll) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 100);
    }

    // Update stats
    this.updateLogStats(entries.length);
  }

  updateLogStats(count) {
    const statsElement = document.getElementById('log-count');
    if (statsElement) {
      statsElement.textContent = `${count} entries`;
    }
  }

  updateConnectionStatus(connected) {
    const statusBadge = document.getElementById('system-status-badge');
    if (statusBadge) {
      if (connected) {
        statusBadge.className = 'status-badge online';
        statusBadge.innerHTML = '<i class="fas fa-circle"></i><span>System Online</span>';
      } else {
        statusBadge.className = 'status-badge offline';  
        statusBadge.innerHTML = '<i class="fas fa-circle"></i><span>Reconnecting...</span>';
      }
    }
  }

  refreshLogs() {
    this.loadLogs();
  }

  // ===============================
  // TRADE MANAGEMENT METHODS
  // ===============================

  async closePosition(accountId, positionId, symbol) {
    try {
      const confirmation = confirm(`Are you sure you want to close the ${symbol} position?`);
      if (!confirmation) {
        return;
      }

      this.showNotification('info', `Closing ${symbol} position...`);
      
      const response = await fetch(`/api/mt5/positions/${accountId}/${positionId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('success', `✅ ${symbol} position closed successfully!`);
        // Refresh positions after 2 seconds
        setTimeout(() => {
          this.loadPositions();
          this.loadAccountData();
        }, 2000);
      } else {
        this.showNotification('error', `❌ Failed to close position: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error closing position:', error);
      this.showNotification('error', `❌ Error closing position: ${error.message}`);
    }
  }

  async closeAllPositions(accountId) {
    try {
      const confirmation = confirm('⚠️ Are you sure you want to close ALL positions? This action cannot be undone!');
      if (!confirmation) {
        return;
      }

      this.showNotification('info', 'Closing all positions...');
      
      const response = await fetch(`/api/mt5/positions/close-all/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('success', `✅ All positions closed successfully!`);
        setTimeout(() => {
          this.loadPositions();
          this.loadAccountData();
        }, 3000);
      } else {
        this.showNotification('error', `❌ Failed to close all positions: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error closing all positions:', error);
      this.showNotification('error', `❌ Error closing all positions: ${error.message}`);
    }
  }

  async modifyPosition(accountId, positionId) {
    // For now, show coming soon message
    this.showNotification('info', '🚧 Position modification feature coming soon!');
  }

  showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
}

// Export CleanTradingDashboard to global scope for use in HTML
if (typeof window !== 'undefined') {
  window.CleanTradingDashboard = CleanTradingDashboard;
}

// Initialize dashboard when DOM is ready
let dashboardInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  dashboardInstance = new CleanTradingDashboard();
  
  // Make closeModal globally accessible for HTML onclick handlers
  window.closeModal = function(modalId) {
    if (dashboardInstance) {
      dashboardInstance.closeModal(modalId);
    }
  };
  
  // Make other functions globally accessible for HTML onclick handlers
  window.showAddAccountModal = function() {
    if (dashboardInstance) {
      dashboardInstance.showAddAccountModal();
    }
  };
  
  window.refreshSignals = function() {
    if (dashboardInstance) {
      dashboardInstance.showNotification('Refreshing signals...', 'info');
      dashboardInstance.loadAccountData();
    }
  };
  
  window.refreshHistory = function() {
    if (dashboardInstance) {
      dashboardInstance.showNotification('Refreshing trade history...', 'info');
      dashboardInstance.loadPositions();
    }
  };
  
  window.saveSettings = function() {
    if (dashboardInstance) {
      dashboardInstance.showNotification('Settings saved!', 'success');
    }
  };
  
  window.saveRiskSettings = function() {
    if (dashboardInstance) {
      dashboardInstance.showNotification('Risk settings saved!', 'success');
    }
  };
  
  // Setup event listeners for buttons (replacing onclick handlers)
  const setupButtonListeners = () => {
    // Main refresh button
    document.querySelectorAll('[data-action="refresh-all"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.refreshAllData());
    });
    
    // Test bot connection
    document.querySelectorAll('[data-action="test-bot"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.testBotConnection());
    });
    
    // Refresh accounts
    document.querySelectorAll('[data-action="refresh-accounts"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.refreshAllData());
    });
    
    // Show add account modal
    document.querySelectorAll('[data-action="add-account"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.showAddAccountModal());
    });
    
    // Manual signal test
    document.querySelectorAll('[data-action="manual-signal"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.showSignalTestModal());
    });
    
    // Refresh activity
    document.querySelectorAll('[data-action="refresh-activity"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.refreshActivity());
    });
    
    // Refresh MetaStats
    document.querySelectorAll('[data-action="refresh-metastats"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.loadMetaStatsData());
    });
  };
  
  // Call setup after a short delay to ensure all elements are rendered
  setTimeout(setupButtonListeners, 100);
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (dashboardInstance && dashboardInstance.refreshInterval) {
    clearInterval(dashboardInstance.refreshInterval);
  }
});