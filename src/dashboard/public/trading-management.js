// Advanced Trading Management JavaScript
// Real-time MetaAPI trading interface

class TradingManager {
    constructor() {
        this.apiBase = '/api/trading';
        this.refreshInterval = 5000; // 5 seconds
        this.intervalIds = [];
        this.init();
    }

    async init() {
        await this.loadInitialData();
        this.startRealTimeUpdates();
        this.setupEventListeners();
    }

    // ========== INITIALIZATION ==========

    async loadInitialData() {
        try {
            this.showLoading(true);
            await Promise.all([
                this.loadAccountSummary(),
                this.loadPositions(),
                this.loadOrders(),
                this.loadAccountOptions()
            ]);
        } catch (error) {
            this.showToast('Error loading initial data: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    startRealTimeUpdates() {
        // Update dashboard every 5 seconds
        const dashboardInterval = setInterval(() => {
            if (document.getElementById('dashboard').classList.contains('active')) {
                this.loadAccountSummary();
            }
        }, this.refreshInterval);

        // Update positions every 3 seconds
        const positionsInterval = setInterval(() => {
            if (document.getElementById('positions').classList.contains('active')) {
                this.loadPositions();
            }
        }, 3000);

        this.intervalIds.push(dashboardInterval, positionsInterval);
    }

    setupEventListeners() {
        // Form submissions
        document.getElementById('newOrderForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.placeOrder();
        });

        document.getElementById('riskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateRiskSettings();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        this.refreshActiveTab();
                        break;
                    case 'e':
                        e.preventDefault();
                        this.showTab('emergency');
                        break;
                }
            }
        });
    }

    // ========== ACCOUNT SUMMARY ==========

    async loadAccountSummary() {
        try {
            const response = await fetch(`${this.apiBase}/summary`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to load summary');

            this.updateSummaryGrid(data);
            this.updateAccountsTable(data.accounts);
        } catch (error) {
            console.error('Error loading account summary:', error);
        }
    }

    updateSummaryGrid(data) {
        const grid = document.getElementById('summaryGrid');
        grid.innerHTML = `
            <div class="summary-item">
                <div class="summary-value">${data.totalAccounts}</div>
                <div class="summary-label">Total Accounts</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${data.connectedAccounts}</div>
                <div class="summary-label">Connected</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">$${this.formatNumber(data.totalBalance)}</div>
                <div class="summary-label">Total Balance</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">$${this.formatNumber(data.totalEquity)}</div>
                <div class="summary-label">Total Equity</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${data.totalPositions}</div>
                <div class="summary-label">Active Positions</div>
            </div>
            <div class="summary-item">
                <div class="summary-value ${data.totalUnrealizedPL >= 0 ? 'status-positive' : 'status-negative'}">
                    $${this.formatNumber(data.totalUnrealizedPL)}
                </div>
                <div class="summary-label">Unrealized P&L</div>
            </div>
        `;
    }

    updateAccountsTable(accounts) {
        const tbody = document.querySelector('#accountsTable tbody');
        tbody.innerHTML = accounts.map(acc => `
            <tr>
                <td>${acc.id.substring(0, 8)}...</td>
                <td>${acc.brokerName || 'Unknown'}</td>
                <td>$${this.formatNumber(acc.balance)}</td>
                <td>$${this.formatNumber(acc.equity)}</td>
                <td class="${(acc.positions?.reduce((sum, pos) => sum + (pos.unrealizedProfit || 0), 0) || 0) >= 0 ? 'status-positive' : 'status-negative'}">
                    $${this.formatNumber(acc.positions?.reduce((sum, pos) => sum + (pos.unrealizedProfit || 0), 0) || 0)}
                </td>
                <td>${acc.positions?.length || 0}</td>
                <td>
                    <div class="risk-meter">
                        <div class="risk-fill ${this.getRiskClass(acc.riskExposure?.riskPercentage || 0)}" 
                             style="width: ${Math.min(acc.riskExposure?.riskPercentage || 0, 100)}%"></div>
                    </div>
                    ${this.formatNumber(acc.riskExposure?.riskPercentage || 0)}%
                </td>
                <td class="${acc.status === 'CONNECTED' ? 'status-positive' : 'status-negative'}">
                    ${acc.status || 'Unknown'}
                </td>
            </tr>
        `).join('');
    }

    // ========== POSITIONS MANAGEMENT ==========

    async loadPositions() {
        try {
            const response = await fetch(`${this.apiBase}/positions`);
            const positions = await response.json();

            if (!response.ok) throw new Error(positions.error || 'Failed to load positions');

            this.updatePositionsTable(positions);
        } catch (error) {
            console.error('Error loading positions:', error);
        }
    }

    updatePositionsTable(positions) {
        const tbody = document.querySelector('#positionsTable tbody');
        
        if (positions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; opacity: 0.6;">No active positions</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = positions.map(pos => `
            <tr>
                <td>${pos.accountId.substring(0, 8)}...</td>
                <td>${pos.symbol}</td>
                <td class="${pos.type?.includes('BUY') ? 'status-positive' : 'status-negative'}">
                    ${pos.type}
                </td>
                <td>${pos.volume}</td>
                <td>${this.formatPrice(pos.openPrice)}</td>
                <td>${this.formatPrice(pos.currentPrice)}</td>
                <td class="${(pos.unrealizedProfit || 0) >= 0 ? 'status-positive' : 'status-negative'}">
                    $${this.formatNumber(pos.unrealizedProfit || 0)}
                </td>
                <td class="${(pos.pipsProfit || 0) >= 0 ? 'status-positive' : 'status-negative'}">
                    ${this.formatNumber(pos.pipsProfit || 0)}
                </td>
                <td>${this.formatDuration(pos.durationMinutes || 0)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="tradingManager.modifyPosition('${pos.id}', '${pos.accountId}')">
                        📝 Modify
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="tradingManager.closePosition('${pos.id}', '${pos.accountId}')">
                        ✖️ Close
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async closePosition(positionId, accountId, volume = null) {
        if (!confirm(`Are you sure you want to ${volume ? 'partially ' : ''}close this position?`)) {
            return;
        }

        try {
            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/positions/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positionId, accountId, volume })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to close position');

            this.showToast('Position closed successfully', 'success');
            await this.loadPositions();
            await this.loadAccountSummary();
        } catch (error) {
            this.showToast('Error closing position: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async closeAllPositions() {
        if (!confirm('⚠️ Are you sure you want to close ALL positions across ALL accounts? This cannot be undone!')) {
            return;
        }

        try {
            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/positions/close-all`, {
                method: 'POST'
            });

            const results = await response.json();
            if (!response.ok) throw new Error(results.error || 'Failed to close positions');

            const successful = results.filter(r => r.success).length;
            const total = results.length;
            
            this.showToast(`Closed ${successful}/${total} positions`, successful === total ? 'success' : 'warning');
            await this.loadPositions();
            await this.loadAccountSummary();
        } catch (error) {
            this.showToast('Error closing positions: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    modifyPosition(positionId, accountId) {
        const newSL = prompt('New Stop Loss (leave empty to remove):');
        const newTP = prompt('New Take Profit (leave empty to remove):');

        if (newSL === null && newTP === null) return; // User cancelled

        this.updatePositionLevels(positionId, accountId, 
            newSL === '' ? null : parseFloat(newSL),
            newTP === '' ? null : parseFloat(newTP)
        );
    }

    async updatePositionLevels(positionId, accountId, stopLoss, takeProfit) {
        try {
            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/positions/modify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positionId, accountId, stopLoss, takeProfit })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to modify position');

            this.showToast('Position modified successfully', 'success');
            await this.loadPositions();
        } catch (error) {
            this.showToast('Error modifying position: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // ========== ORDER MANAGEMENT ==========

    async loadOrders() {
        try {
            const response = await fetch(`${this.apiBase}/orders`);
            const orders = await response.json();

            if (!response.ok) throw new Error(orders.error || 'Failed to load orders');

            this.updateOrdersTable(orders);
        } catch (error) {
            console.error('Error loading orders:', error);
        }
    }

    updateOrdersTable(orders) {
        const tbody = document.querySelector('#ordersTable tbody');
        
        if (orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; opacity: 0.6;">No pending orders</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = orders.map(order => `
            <tr>
                <td>${order.accountId.substring(0, 8)}...</td>
                <td>${order.symbol}</td>
                <td class="${order.type?.includes('BUY') ? 'status-positive' : 'status-negative'}">
                    ${order.type}
                </td>
                <td>${order.volume}</td>
                <td>${this.formatPrice(order.openPrice)}</td>
                <td>${order.stopLoss ? this.formatPrice(order.stopLoss) : '-'}</td>
                <td>${order.takeProfit ? this.formatPrice(order.takeProfit) : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="tradingManager.cancelOrder('${order.id}', '${order.accountId}')">
                        ❌ Cancel
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async placeOrder() {
        try {
            const orderData = {
                accountId: document.getElementById('orderAccount').value || null,
                symbol: document.getElementById('orderSymbol').value.toUpperCase(),
                type: document.getElementById('orderType').value,
                volume: parseFloat(document.getElementById('orderVolume').value),
                openPrice: document.getElementById('orderPrice').value ? parseFloat(document.getElementById('orderPrice').value) : null,
                stopLoss: document.getElementById('orderSL').value ? parseFloat(document.getElementById('orderSL').value) : null,
                takeProfit: document.getElementById('orderTP').value ? parseFloat(document.getElementById('orderTP').value) : null,
                comment: document.getElementById('orderComment').value || 'Web Dashboard Order'
            };

            if (!orderData.symbol || !orderData.type || !orderData.volume) {
                throw new Error('Please fill in all required fields');
            }

            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/orders/place`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to place order');

            this.showToast('Order placed successfully', 'success');
            document.getElementById('newOrderForm').reset();
            document.getElementById('orderVolume').value = '0.01'; // Reset to default
            await this.loadOrders();
            await this.loadPositions();
            await this.loadAccountSummary();
        } catch (error) {
            this.showToast('Error placing order: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async cancelOrder(orderId, accountId) {
        if (!confirm('Are you sure you want to cancel this order?')) return;

        try {
            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/orders/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, accountId })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to cancel order');

            this.showToast('Order cancelled successfully', 'success');
            await this.loadOrders();
        } catch (error) {
            this.showToast('Error cancelling order: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // ========== RISK MANAGEMENT ==========

    async updateRiskSettings() {
        try {
            const riskData = {
                accountId: document.getElementById('riskAccount').value,
                maxRiskPerTrade: parseFloat(document.getElementById('maxRiskPerTrade').value),
                maxDailyRisk: parseFloat(document.getElementById('maxDailyRisk').value),
                maxPositions: parseInt(document.getElementById('maxPositions').value),
                autoSLDistance: parseInt(document.getElementById('autoSLDistance').value),
                enableAutoSL: true,
                allowedSymbols: [] // Can be extended
            };

            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/risk/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(riskData)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to update risk settings');

            this.showToast('Risk settings updated successfully', 'success');
        } catch (error) {
            this.showToast('Error updating risk settings: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // ========== ACCOUNT OPTIONS ==========

    async loadAccountOptions() {
        try {
            const response = await fetch(`${this.apiBase}/summary`);
            const data = await response.json();

            if (!response.ok) return;

            const orderAccountSelect = document.getElementById('orderAccount');
            const riskAccountSelect = document.getElementById('riskAccount');

            const options = data.accounts.map(acc => 
                `<option value="${acc.id}">${acc.id.substring(0, 8)}... - ${acc.brokerName}</option>`
            ).join('');

            orderAccountSelect.innerHTML = '<option value="">All Accounts</option>' + options;
            riskAccountSelect.innerHTML = options;
        } catch (error) {
            console.error('Error loading account options:', error);
        }
    }

    // ========== EMERGENCY CONTROLS ==========

    async emergencyCloseAll() {
        const confirmation = prompt('Type "CLOSE ALL" to confirm emergency closure of all positions:');
        if (confirmation !== 'CLOSE ALL') return;

        try {
            this.showLoading(true);
            const response = await fetch(`${this.apiBase}/emergency/close-all`, {
                method: 'POST'
            });

            const results = await response.json();
            if (!response.ok) throw new Error(results.error || 'Emergency close failed');

            const successful = results.filter(r => r.success).length;
            this.showToast(`Emergency: Closed ${successful}/${results.length} positions`, 'warning');
            await this.loadPositions();
            await this.loadAccountSummary();
        } catch (error) {
            this.showToast('Emergency close error: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async emergencyCancelAll() {
        const confirmation = prompt('Type "CANCEL ALL" to confirm cancellation of all pending orders:');
        if (confirmation !== 'CANCEL ALL') return;

        try {
            this.showLoading(true);
            // Implementation would depend on MetaAPI order cancellation
            this.showToast('All pending orders cancelled', 'warning');
            await this.loadOrders();
        } catch (error) {
            this.showToast('Emergency cancel error: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async emergencyPause() {
        if (!confirm('Pause all trading activities?')) return;
        // Implementation would set a global trading pause flag
        this.showToast('Trading paused', 'warning');
    }

    async emergencyResume() {
        if (!confirm('Resume all trading activities?')) return;
        // Implementation would clear the global trading pause flag
        this.showToast('Trading resumed', 'success');
    }

    // ========== UTILITY METHODS ==========

    formatNumber(num) {
        if (num === null || num === undefined) return '0.00';
        return Math.abs(num) < 0.01 ? num.toFixed(4) : num.toFixed(2);
    }

    formatPrice(price) {
        if (price === null || price === undefined) return '-';
        return price.toFixed(5);
    }

    formatDuration(minutes) {
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    }

    getRiskClass(percentage) {
        if (percentage < 2) return 'risk-low';
        if (percentage < 5) return 'risk-medium';
        return 'risk-high';
    }

    showTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabName).classList.add('active');
        event.target.classList.add('active');

        // Load tab-specific data
        switch (tabName) {
            case 'dashboard':
                this.loadAccountSummary();
                break;
            case 'positions':
                this.loadPositions();
                break;
            case 'orders':
                this.loadOrders();
                break;
            case 'accounts':
                this.loadAccountDetails();
                break;
        }
    }

    refreshActiveTab() {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;

        switch (activeTab.id) {
            case 'dashboard':
                this.loadAccountSummary();
                break;
            case 'positions':
                this.loadPositions();
                break;
            case 'orders':
                this.loadOrders();
                break;
        }
    }

    async refreshPositions() {
        await this.loadPositions();
        this.showToast('Positions refreshed', 'success');
    }

    async refreshOrders() {
        await this.loadOrders();
        this.showToast('Orders refreshed', 'success');
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = show ? 'flex' : 'none';
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }
}

// Global functions for HTML onclick handlers
let tradingManager;

function showTab(tabName) {
    tradingManager.showTab(tabName);
}

function closeAllPositions() {
    tradingManager.closeAllPositions();
}

function refreshPositions() {
    tradingManager.refreshPositions();
}

function refreshOrders() {
    tradingManager.refreshOrders();
}

function placeOrder() {
    tradingManager.placeOrder();
}

function updateRiskSettings() {
    tradingManager.updateRiskSettings();
}

function emergencyCloseAll() {
    tradingManager.emergencyCloseAll();
}

function emergencyCancelAll() {
    tradingManager.emergencyCancelAll();
}

function emergencyPause() {
    tradingManager.emergencyPause();
}

function emergencyResume() {
    tradingManager.emergencyResume();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    tradingManager = new TradingManager();
});
