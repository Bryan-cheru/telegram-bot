// Professional Trading Dashboard JavaScript
// Following modern JavaScript best practices

class TradingDashboard {
  constructor() {
    this.currentPage = 'dashboard';
    this.isLoading = false;
    this.eventSource = null;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadInitialData();
    this.startRealTimeUpdates();
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

  // Cleanup method
  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
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

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.dashboard) {
    window.dashboard.destroy();
  }
});
