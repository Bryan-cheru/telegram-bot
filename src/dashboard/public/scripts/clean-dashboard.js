/**
 * Clean Trading Dashboard - Simplified Frontend for IFPro Account
 * Automatically fetches account data from environment on startup
 */

class CleanTradingDashboard {
  constructor() {
    this.accountData = null;
    this.positions = [];
    this.pendingOrders = [];
    this.currentPage = 'overview-section';
    this.refreshInterval = null;
    this.isLoading = false;
    this.metricsData = null;
    this.performanceSummary = null;
    this.rateLimitStatus = null;
    this.autoScroll = true;
    this.logStream = null;
    
    console.log('🚀 Initializing Clean Trading Dashboard...');
    this.init();
  }

  async init() {
    this.setupNavigation();
    this.setupEventListeners();
    
    // Skip loading state - load data directly
    try {
      await this.loadRuntimeSettingsForms();
      await this.loadAccountData();
      await this.loadPositions();
      await this.loadPendingOrders();
      this.updateDashboardStats(); // Update stats after loading positions
      await this.loadMetaStatsData();
      // Start live log streaming once on init so the Trades tab is always populated
      this.setupLogStreaming();
      this.startAutoRefresh();
      this.showNotification('Dashboard loaded successfully!', 'success');
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
      this.showNotification('Failed to load dashboard data', 'error');
      // Force render empty states
      this.renderAccountInfo();
      this.renderPositions();
      this.renderPendingOrders();
      // Even on init failure, still try to stream logs so users can see what's happening
      try { this.setupLogStreaming(); } catch (_) { /* noop */ }
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

    // Hamburger menu toggle for mobile
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const mobileDropdown = document.getElementById('mobile-dropdown-menu');
    const mobileOverlay = document.getElementById('mobile-nav-overlay');
    
    if (hamburgerMenu && mobileDropdown) {
      // Toggle hamburger menu and dropdown
      hamburgerMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburgerMenu.classList.toggle('active');
        mobileDropdown.classList.toggle('active');
        if (mobileOverlay) {
          mobileOverlay.classList.toggle('active');
        }
      });
      
      // Handle mobile menu link clicks
      const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');
      mobileMenuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const page = e.currentTarget.dataset.page;
          
          // Remove active class from all mobile menu links
          mobileMenuLinks.forEach(l => l.classList.remove('active'));
          // Add active class to clicked link
          e.currentTarget.classList.add('active');
          
          // Switch page
          this.switchPage(page);
          
          // Close mobile menu
          hamburgerMenu.classList.remove('active');
          mobileDropdown.classList.remove('active');
          if (mobileOverlay) {
            mobileOverlay.classList.remove('active');
          }
        });
      });
      
      // Close dropdown when clicking overlay
      if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
          hamburgerMenu.classList.remove('active');
          mobileDropdown.classList.remove('active');
          mobileOverlay.classList.remove('active');
        });
      }
      
      // Close dropdown when clicking outside (on mobile)
      document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            mobileDropdown.classList.contains('active') &&
            !mobileDropdown.contains(e.target) && 
            !hamburgerMenu.contains(e.target)) {
          hamburgerMenu.classList.remove('active');
          mobileDropdown.classList.remove('active');
          if (mobileOverlay) {
            mobileOverlay.classList.remove('active');
          }
        }
      });
      
      // Close dropdown on window resize to desktop
      window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
          hamburgerMenu.classList.remove('active');
          mobileDropdown.classList.remove('active');
          if (mobileOverlay) {
            mobileOverlay.classList.remove('active');
          }
        }
      });
    }
    
    // Keep legacy mobile menu toggle for backward compatibility
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    
    if (menuToggle && sidebar) {
      // Toggle sidebar and overlay
      menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
        if (mobileOverlay) {
          mobileOverlay.classList.toggle('active');
        }
      });
      
      // Close sidebar when clicking overlay
      if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
          sidebar.classList.remove('open');
          mobileOverlay.classList.remove('active');
        });
      }
      
      // Close sidebar when clicking outside (on mobile)
      document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) && 
            !menuToggle.contains(e.target)) {
          sidebar.classList.remove('open');
          if (mobileOverlay) {
            mobileOverlay.classList.remove('active');
          }
        }
      });
      
      // Close sidebar on window resize to desktop
      window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
          sidebar.classList.remove('open');
          if (mobileOverlay) {
            mobileOverlay.classList.remove('active');
          }
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

    this.currentPage = page;

    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
      pageTitle.textContent = this.getPageTitle(page);
    }

    if (page === 'settings-section') {
      this.loadRuntimeSettingsForms();
      if (typeof window.UnifiedSettingsPanel !== 'undefined' && window.UnifiedSettingsPanel.refresh) {
        window.UnifiedSettingsPanel.refresh();
      }
    } else {
      this.loadPageData(page);
    }
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

    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
      pageTitle.textContent = this.getPageTitle(this.currentPage);
    }
  }

  getPageTitle(page) {
    const titles = {
      'overview-section': 'Dashboard Overview',
      'accounts-section': 'Trading Accounts',
      'signals-section':  'Signal History',
      'trades-section':   'Active Trades',
      'analytics-section':'Analytics',
      'settings-section': 'Settings'
    };
    return titles[page] || 'Dashboard';
  }

  async loadPageData(page) {
    switch (page) {
      case 'overview-section':
        await this.loadAccountData();
        await this.loadPositions();
        this.updateDashboardStats();
        break;
      case 'accounts-section':
        await this.loadAccountData();
        this.renderAccountInfo();
        break;
      case 'signals-section':
        await this.loadSignalHistory();
        break;
      case 'trades-section':
        await this.loadPositions();
        await this.loadPendingOrders();
        await this.loadTradeHistory();
        break;
      case 'analytics-section':
        await this.loadMetaStatsData();
        break;
      case 'settings-section':
        await this.loadRuntimeSettingsForms();
        break;
      default:
        break;
    }
  }

  /**
   * Populate Settings from runtime env (requires API key in prod when DASHBOARD_API_KEY is set).
   */
  async loadRuntimeSettingsForms() {
    const el = (id) => document.getElementById(id);

    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (!res.ok) throw new Error(cfg.error || res.statusText);
      if (el('risk-per-trade') && cfg.riskPercentage != null) {
        el('risk-per-trade').value = cfg.riskPercentage;
      }
      if (el('max-daily-trades') && cfg.maxDailyTrades != null) {
        el('max-daily-trades').value = cfg.maxDailyTrades;
      }
      if (el('max-trade-size-cap') && cfg.maxTradeSize != null) {
        el('max-trade-size-cap').value = cfg.maxTradeSize;
      }
      if (el('bot-enabled')) {
        el('bot-enabled').checked = cfg.botEnabled !== false;
      }
    } catch (e) {
      console.warn('Could not load /api/config:', e);
    }

    try {
      const res = await fetch('/api/risk-config');
      const data = await res.json();
      if (!data.success || !data.config) return;
      const c = data.config;
      if (el('risk-reward-ratio')) el('risk-reward-ratio').value = c.riskRewardRatio;
      if (el('fixed-lot-size')) el('fixed-lot-size').value = c.fixedLotSize;
      if (el('fixed-risk-usd')) {
        el('fixed-risk-usd').value =
          c.fixedRiskAmount != null && c.fixedRiskAmount !== '' ? c.fixedRiskAmount : '';
      }
      if (el('use-signal-stops')) el('use-signal-stops').checked = !!c.useSignalStops;
      if (el('max-drawdown') && c.maxDrawdownPercent != null) {
        el('max-drawdown').value = c.maxDrawdownPercent;
      }
      if (el('max-daily-loss-pct') && c.maxDailyLossPercent != null) {
        el('max-daily-loss-pct').value = c.maxDailyLossPercent;
      }
    } catch (e) {
      console.warn('Could not load /api/risk-config:', e);
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

  async loadPendingOrders() {
    try {
      console.log('📑 Loading pending orders...');
      const response = await fetch('/api/mt5/orders');
      const result = await response.json();
      if (result.success) {
        this.pendingOrders = Array.isArray(result.orders) ? result.orders : [];
        console.log(`✅ Loaded ${this.pendingOrders.length} pending orders`);
      } else {
        console.warn('⚠️ No pending orders:', result.error);
        this.pendingOrders = [];
      }
      this.renderPendingOrders();
    } catch (error) {
      console.error('❌ Error loading pending orders:', error);
      this.pendingOrders = [];
      this.renderPendingOrders();
    }
  }

  async loadSignalHistory() {
    try {
      console.log('📡 Loading signal history...');
      const filter = document.getElementById('signal-filter')?.value || 'all';
      const response = await fetch('/api/signals?limit=500&status=' + encodeURIComponent(filter));
      const result = await response.json();
      const signals = Array.isArray(result.signals) ? result.signals : [];
      console.log(`✅ Loaded ${signals.length} signals`);
      this.renderSignalHistory(signals);
    } catch (error) {
      console.error('❌ Error loading signal history:', error);
      this.renderSignalHistory([]);
    }
  }

  renderSignalHistory(signals) {
    const list = document.getElementById('signals-list');
    if (!list) return;

    if (signals.length === 0) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-satellite-dish"></i><p>No signals received yet</p></div>';
      return;
    }

    const statusIcon = { executed: '✅', failed: '❌', pending: '⏳' };
    const statusClass = { executed: 'success', failed: 'danger', pending: 'warning' };

    list.innerHTML = signals.map(s => {
      const icon = statusIcon[s.status] || '📡';
      const cls = statusClass[s.status] || 'info';
      const entry = s.entryMin === s.entryMax
        ? (s.entryMin || '—')
        : `${s.entryMin || '?'} – ${s.entryMax || '?'}`;
      const targets = Array.isArray(s.targets) && s.targets.length ? s.targets.join(', ') : '—';
      const sl = s.stopLoss || '—';
      const time = s.timestamp ? new Date(s.timestamp).toLocaleString() : '';
      return `
        <div class="signal-item" style="border-left:3px solid var(--${cls === 'success' ? 'green' : cls === 'danger' ? 'red' : 'yellow'},#888);padding:10px 12px;margin-bottom:8px;background:var(--card-bg,#1a1a2e);border-radius:4px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <strong>${icon} ${s.symbol || '?'} ${s.action || ''}</strong>
            <span style="font-size:0.75rem;opacity:0.6">${time}</span>
          </div>
          <div style="font-size:0.82rem;opacity:0.85;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
            <span>Entry: ${entry}</span>
            <span>SL: ${sl}</span>
            <span>TP: ${targets}</span>
          </div>
          ${s.executionMessage ? `<div style="font-size:0.75rem;opacity:0.6;margin-top:2px">${s.executionMessage}</div>` : ''}
        </div>`;
    }).join('');
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

  renderPendingOrders() {
    const container = document.getElementById('pending-orders-container');
    if (!container) return;

    const headerRow = `
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Type</th>
          <th>Volume</th>
          <th>Entry Price</th>
          <th>SL</th>
          <th>TP</th>
          <th>Placed</th>
        </tr>
      </thead>`;

    if (!this.pendingOrders || this.pendingOrders.length === 0) {
      container.innerHTML = `
        <table class="trades-table enhanced-table">
          ${headerRow}
          <tbody>
            <tr class="empty-row">
              <td colspan="7">
                <div class="empty-state">
                  <i class="fas fa-hourglass-half"></i>
                  <p>No pending orders</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>`;
      return;
    }

    const rows = this.pendingOrders.map(order => {
      const side  = this.getOrderSide(order.type);
      const label = this.formatOrderType(order.type);
      const sl    = order.stopLoss != null && order.stopLoss !== '' ? order.stopLoss : '—';
      const tp    = order.takeProfit != null && order.takeProfit !== '' ? order.takeProfit : '—';
      const placed = order.time ? new Date(order.time).toLocaleString() : '—';
      return `
        <tr>
          <td><strong>${order.symbol || '—'}</strong></td>
          <td><span class="trade-type ${side}">${label}</span></td>
          <td>${order.volume ?? '—'}</td>
          <td>${order.openPrice ?? '—'}</td>
          <td>${sl}</td>
          <td>${tp}</td>
          <td>${placed}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="trades-table enhanced-table">
        ${headerRow}
        <tbody>${rows}</tbody>
      </table>`;
  }

  /**
   * MT5 order types look like ORDER_TYPE_BUY_LIMIT / ORDER_TYPE_SELL_STOP, etc.
   * Anything containing "SELL" is rendered as the sell variant; everything else as buy.
   */
  getOrderSide(type) {
    return typeof type === 'string' && type.toUpperCase().includes('SELL') ? 'sell' : 'buy';
  }

  formatOrderType(type) {
    if (!type) return 'UNKNOWN';
    return String(type).replace(/^ORDER_TYPE_/, '').replace(/_/g, ' ');
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
        if (this.currentPage === 'trades-section') {
          this.loadPositions();
          this.loadPendingOrders();
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

    const winRateText = this.metricsData.winRate != null
      ? `${(this.metricsData.winRate * 100).toFixed(1)}%`
      : 'N/A';
    const totalTradesText = this.metricsData.totalTrades != null
      ? String(this.metricsData.totalTrades)
      : '0';

    this.updateElementTextWithAnimation('profit-factor', this.metricsData.profitFactor?.toFixed(2) || 'N/A');
    this.updateElementTextWithAnimation('metastats-win-rate', winRateText);
    this.updateElementTextWithAnimation('metastats-max-drawdown', `${this.metricsData.maxDrawdown?.toFixed(2)}%` || 'N/A');
    this.updateElementTextWithAnimation('sharpe-ratio', this.metricsData.sharpeRatio?.toFixed(2) || 'N/A');
    this.updateElementTextWithAnimation('metastats-total-trades', totalTradesText);

    this.updateElementTextWithAnimation('analytics-win-rate', winRateText);
    this.updateElementTextWithAnimation('analytics-total-trades', totalTradesText);

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

    const streamUrl =
      typeof window.getLogsStreamUrl === 'function'
        ? window.getLogsStreamUrl()
        : '/api/logs/stream';
    this.logStream = new EventSource(streamUrl);
    
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

    // First real entry: clear any empty-state / placeholder content so it doesn't sit above the stream
    if (!container.querySelector('.log-entry') && container.querySelector('.empty-state, .no-data, .error-state')) {
      container.innerHTML = '';
    }

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

  if (typeof window.UnifiedSettingsPanel !== 'undefined' && window.UnifiedSettingsPanel.init) {
    window.UnifiedSettingsPanel.init({
      notify: function (message, type) {
        if (dashboardInstance) dashboardInstance.showNotification(message, type);
      }
    });
  }

  window.loadRuntimeSettingsFormsHook = function () {
    if (dashboardInstance && typeof dashboardInstance.loadRuntimeSettingsForms === 'function') {
      dashboardInstance.loadRuntimeSettingsForms();
    }
  };

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
  
  window.saveDashboardApiKey = function () {
    var input = document.getElementById('dashboard-api-key');
    var val = input ? input.value.trim() : '';
    if (typeof window.setDashboardApiKey === 'function') {
      window.setDashboardApiKey(val);
    }
    if (input) input.value = '';
    if (dashboardInstance) {
      dashboardInstance.showNotification(
        val ? 'API key saved in this browser. Reload if panels were failing.' : 'API key cleared.',
        'success'
      );
      dashboardInstance.loadRuntimeSettingsForms();
      if (typeof window.UnifiedSettingsPanel !== 'undefined' && window.UnifiedSettingsPanel.refresh) {
        window.UnifiedSettingsPanel.refresh();
      }
    }
  };

  window.saveSettings = async function () {
    if (!dashboardInstance) return;
    try {
      var body = {
        botEnabled: document.getElementById('bot-enabled').checked,
        maxDailyTrades: parseInt(document.getElementById('max-daily-trades').value, 10),
        maxTradeSize: parseFloat(document.getElementById('max-trade-size-cap').value),
        riskPercentage: parseFloat(document.getElementById('risk-per-trade').value)
      };
      var res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      dashboardInstance.showNotification('Bot settings saved.', 'success');
    } catch (e) {
      dashboardInstance.showNotification('Save failed: ' + (e.message || e), 'error');
    }
  };

  window.saveRiskSettings = async function () {
    if (!dashboardInstance) return;
    try {
      var fixedUsd = document.getElementById('fixed-risk-usd').value.trim();
      var body = {
        riskRewardRatio: parseFloat(document.getElementById('risk-reward-ratio').value),
        fixedLotSize: parseFloat(document.getElementById('fixed-lot-size').value),
        useSignalStops: document.getElementById('use-signal-stops').checked,
        maxDailyLossPercent: parseFloat(document.getElementById('max-daily-loss-pct').value),
        maxDrawdownPercent: parseFloat(document.getElementById('max-drawdown').value)
      };
      if (fixedUsd === '') {
        body.fixedRiskAmount = null;
      } else {
        body.fixedRiskAmount = parseFloat(fixedUsd);
      }
      var res = await fetch('/api/risk-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      dashboardInstance.showNotification('Risk settings saved.', 'success');
    } catch (e) {
      dashboardInstance.showNotification('Save failed: ' + (e.message || e), 'error');
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

    // Refresh positions
    document.querySelectorAll('[data-action="refresh-positions"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.loadPositions());
    });

    // Refresh pending orders
    document.querySelectorAll('[data-action="refresh-orders"]').forEach(btn => {
      btn.addEventListener('click', () => dashboardInstance.loadPendingOrders());
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