// Multi-Account Dashboard Extensions
// Extends the existing dashboard with multi-account functionality

class MultiAccountDashboard extends TradingDashboard {
  constructor() {
    super();
    this.accounts = new Map();
    this.allTrades = [];
    this.selectedAccountFilter = 'all';
    this.setupMultiAccountFeatures();
  }

  setupMultiAccountFeatures() {
    // Override the parent's loadInitialData to include multi-account data
    this.loadMultiAccountData();
    
    // Set up multi-account specific intervals
    setInterval(() => this.updateAllAccountsData(), 15000); // Update every 15 seconds
  }

  async loadMultiAccountData() {
    try {
      const response = await fetch('/api/multi-accounts');
      const data = await response.json();
      
      if (data.success) {
        this.updateAccountsDisplay(data.accounts);
        this.updateSummaryStats(data.summary);
        this.updateAllTradesTable(data.allTrades);
      }
    } catch (error) {
      console.error('Error loading multi-account data:', error);
      this.showAccountError('Failed to load account data');
    }
  }

  updateAccountsDisplay(accounts) {
    const grid = document.getElementById('accounts-grid');
    if (!grid) return;

    if (accounts.length === 0) {
      grid.innerHTML = `
        <div class="account-loading">
          <i class="fas fa-exclamation-triangle"></i>
          <span>No accounts configured</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = accounts.map(account => this.createAccountCard(account)).join('');

    // Update account filter dropdown
    this.updateAccountFilter(accounts);
  }

  createAccountCard(account) {
    const statusClass = account.status === 'CONNECTED' ? 'connected' : 
                       account.status === 'CONNECTING' ? 'connecting' : 'disconnected';
    
    const typeClass = account.accountType === 'DEMO' ? 'demo' : 'live';
    
    const positions = account.positions || [];
    const totalPnL = positions.reduce((sum, pos) => sum + (pos.unrealizedProfit || 0), 0);
    
    // Show error message if account has error
    const errorMessage = account.error ? 
      `<div class="account-error" style="color: var(--danger); font-size: var(--font-size-sm); margin-top: var(--space-sm);">
        <i class="fas fa-exclamation-triangle"></i> ${account.error}
      </div>` : '';
    
    return `
      <div class="account-card" data-account-id="${account.id}">
        <div class="account-header">
          <div class="account-title">
            <div>
              <div class="account-name">${account.brokerName}</div>
              <span class="account-type ${typeClass}">${account.accountType}</span>
            </div>
          </div>
          <div class="account-status">
            <span class="status-indicator ${statusClass}"></span>
            <span class="status-text">${account.status}</span>
          </div>
        </div>

        <div class="account-metrics">
          <div class="metric-item">
            <span class="metric-label">Balance</span>
            <span class="metric-value">$${this.formatNumber(account.balance || 0)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Equity</span>
            <span class="metric-value ${totalPnL >= 0 ? 'positive' : 'negative'}">
              $${this.formatNumber(account.equity || account.balance || 0)}
            </span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Free Margin</span>
            <span class="metric-value">$${this.formatNumber(account.freeMargin || 0)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Margin Level</span>
            <span class="metric-value">${this.formatNumber(account.marginLevel || 0)}%</span>
          </div>
        </div>

        <div class="account-positions">
          <div class="positions-header">
            <span><i class="fas fa-chart-line"></i> Active Positions</span>
            <span class="positions-count">${positions.length} open</span>
          </div>
          <div class="positions-list">
            ${positions.length > 0 ? 
              positions.slice(0, 3).map(pos => `
                <div class="position-item">
                  <div>
                    <span class="position-symbol">${pos.symbol}</span>
                    <span class="position-type ${pos.type.toLowerCase()}">${pos.type}</span>
                  </div>
                  <span class="position-pl ${(pos.unrealizedProfit || 0) >= 0 ? 'positive' : 'negative'}">
                    ${(pos.unrealizedProfit || 0) >= 0 ? '+' : ''}$${this.formatNumber(Math.abs(pos.unrealizedProfit || 0))}
                  </span>
                </div>
              `).join('') :
              '<div class="position-item" style="justify-content: center; color: var(--gray-400);">No open positions</div>'
            }
            ${positions.length > 3 ? 
              `<div class="position-item" style="justify-content: center; color: var(--primary);">
                <i class="fas fa-plus-circle"></i> ${positions.length - 3} more positions
              </div>` : ''
            }
          </div>
        </div>
        ${errorMessage}
      </div>
    `;
  }

  updateSummaryStats(summary) {
    // Update total balance
    const totalBalanceEl = document.getElementById('total-balance');
    if (totalBalanceEl) {
      totalBalanceEl.textContent = `$${this.formatNumber(summary.totalBalance || 0)}`;
    }

    const totalAccountsEl = document.getElementById('total-accounts');
    if (totalAccountsEl) {
      totalAccountsEl.textContent = `${summary.connectedAccounts}/${summary.totalAccounts} Connected`;
    }

    // Update total equity
    const totalEquityEl = document.getElementById('total-equity');
    if (totalEquityEl) {
      totalEquityEl.textContent = `$${this.formatNumber(summary.totalEquity || 0)}`;
    }

    const totalUnrealizedPL = summary.totalUnrealizedPL || 0;
    const totalUnrealizedPLEl = document.getElementById('total-unrealized-pl');
    if (totalUnrealizedPLEl) {
      totalUnrealizedPLEl.textContent = `${totalUnrealizedPL >= 0 ? '+' : ''}$${this.formatNumber(Math.abs(totalUnrealizedPL))} P&L`;
      totalUnrealizedPLEl.className = `stat-change ${totalUnrealizedPL >= 0 ? 'positive' : 'negative'}`;
    }

    // Update total positions
    const totalPositionsEl = document.getElementById('total-positions');
    if (totalPositionsEl) {
      totalPositionsEl.textContent = summary.totalPositions || 0;
    }

    const positionsBreakdownEl = document.getElementById('total-positions-breakdown');
    if (positionsBreakdownEl) {
      positionsBreakdownEl.textContent = `${summary.buyPositions || 0} Buy • ${summary.sellPositions || 0} Sell`;
    }
  }

  updateAllTradesTable(trades) {
    this.allTrades = trades || [];
    const tableBody = document.querySelector('#active-trades-table tbody');
    if (!tableBody) return;

    const filteredTrades = this.selectedAccountFilter === 'all' ? 
      this.allTrades : 
      this.allTrades.filter(trade => trade.accountId === this.selectedAccountFilter);

    if (filteredTrades.length === 0) {
      tableBody.innerHTML = `
        <tr class="no-trades">
          <td colspan="8">
            <i class="fas fa-chart-line"></i>
            <span>No active trades${this.selectedAccountFilter !== 'all' ? ' for selected account' : ''}</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredTrades.map(trade => `
      <tr data-trade-id="${trade.id}" data-account-id="${trade.accountId}">
        <td>
          <span class="account-badge">
            <i class="fas fa-building"></i>
            ${trade.brokerName}
          </span>
        </td>
        <td class="trade-symbol">${trade.symbol}</td>
        <td>
          <span class="trade-type ${trade.type.toLowerCase()}">${trade.type}</span>
        </td>
        <td>${this.formatNumber(trade.volume)}</td>
        <td>$${this.formatNumber(trade.openPrice)}</td>
        <td>$${this.formatNumber(trade.currentPrice)}</td>
        <td class="profit-loss ${(trade.unrealizedProfit || 0) >= 0 ? 'positive' : 'negative'}">
          ${(trade.unrealizedProfit || 0) >= 0 ? '+' : ''}$${this.formatNumber(Math.abs(trade.unrealizedProfit || 0))}
        </td>
        <td>
          <div class="trade-actions">
            <button class="btn btn-danger btn-xs" onclick="closeTrade('${trade.accountId}', '${trade.id}')">
              <i class="fas fa-times"></i> Close
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  updateAccountFilter(accounts) {
    const filterSelect = document.getElementById('account-filter');
    if (!filterSelect) return;

    // Keep the "All Accounts" option and add individual accounts
    const options = ['<option value="all">All Accounts</option>'];
    accounts.forEach(account => {
      options.push(`
        <option value="${account.id}">
          ${account.brokerName} ${account.accountType}
        </option>
      `);
    });

    filterSelect.innerHTML = options.join('');
    filterSelect.value = this.selectedAccountFilter;

    // Add change listener
    filterSelect.addEventListener('change', (e) => {
      this.selectedAccountFilter = e.target.value;
      this.updateAllTradesTable(this.allTrades);
    });
  }

  async updateAllAccountsData() {
    if (this.currentPage !== 'dashboard') return;
    
    try {
      const response = await fetch('/api/multi-accounts');
      const data = await response.json();
      
      if (data.success) {
        this.updateAccountsDisplay(data.accounts);
        this.updateSummaryStats(data.summary);
        this.updateAllTradesTable(data.allTrades);
      }
    } catch (error) {
      console.error('Error updating multi-account data:', error);
    }
  }

  showAccountError(message) {
    const grid = document.getElementById('accounts-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="account-loading">
          <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
          <span>${message}</span>
        </div>
      `;
    }
  }

  formatNumber(number) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number || 0);
  }
}

// Global functions for UI interactions
window.refreshAllAccountData = async function() {
  const btn = document.getElementById('refresh-all-accounts');
  if (btn) {
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    btn.disabled = true;
  }

  try {
    await window.dashboard.updateAllAccountsData();
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh All';
      btn.disabled = false;
    }
  }
};

window.refreshTradesData = async function() {
  await window.dashboard.updateAllAccountsData();
};

window.closeTrade = async function(accountId, tradeId) {
  if (!confirm('Are you sure you want to close this trade?')) {
    return;
  }

  try {
    const response = await fetch(`/api/close-trade/${accountId}/${tradeId}`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Refresh the trades data
      await window.dashboard.updateAllAccountsData();
      
      // Show success message
      const message = document.createElement('div');
      message.className = 'alert alert-success';
      message.textContent = 'Trade closed successfully';
      document.body.appendChild(message);
      
      setTimeout(() => message.remove(), 3000);
    } else {
      throw new Error(result.error || 'Failed to close trade');
    }
  } catch (error) {
    console.error('Error closing trade:', error);
    alert('Failed to close trade: ' + error.message);
  }
};

// Initialize the multi-account dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.dashboard = new MultiAccountDashboard();
});
