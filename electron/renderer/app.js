// App State
let botStatus = 'stopped';
let currentTab = 'dashboard';
let logs = [];
let trades = [];
let accounts = [];
let startTime = null;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    initializeApp();
    setupEventListeners();
    await loadInitialData();
});

// Initialize app
async function initializeApp() {
    // Set app version
    try {
        const version = await window.electronAPI.getAppVersion();
        document.getElementById('app-version').textContent = `v${version}`;
    } catch (error) {
        console.error('Failed to get app version:', error);
    }

    // Setup tab navigation
    setupTabNavigation();
    
    // Setup bot event listeners
    setupBotEventListeners();
    
    // Start status updates
    startStatusUpdates();
    
    console.log('App initialized');
}

// Setup event listeners
function setupEventListeners() {
    // Bot control buttons
    document.getElementById('start-bot').addEventListener('click', startBot);
    document.getElementById('stop-bot').addEventListener('click', stopBot);
    document.getElementById('restart-bot').addEventListener('click', restartBot);
    
    // Settings
    document.getElementById('settings-form').addEventListener('submit', saveSettings);
    document.getElementById('load-config').addEventListener('click', loadConfig);
    document.getElementById('reset-config').addEventListener('click', resetConfig);
    
    // Logs
    document.getElementById('clear-logs').addEventListener('click', clearLogs);
    document.getElementById('export-logs').addEventListener('click', exportLogs);
    
    // Trades
    document.getElementById('refresh-trades').addEventListener('click', refreshTrades);
    
    // Accounts
    document.getElementById('refresh-accounts').addEventListener('click', refreshAccounts);
    
    console.log('Event listeners setup complete');
}

// Setup tab navigation
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            contents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });
            
            currentTab = targetTab;
            
            // Load tab-specific data
            if (targetTab === 'trades') {
                refreshTrades();
            } else if (targetTab === 'settings') {
                loadConfig();
            }
        });
    });
}

// Setup bot event listeners
function setupBotEventListeners() {
    // Listen for bot logs
    window.electronAPI.onBotLog((event, logData) => {
        addLogEntry(logData);
    });
    
    // Listen for bot status changes
    window.electronAPI.onBotStatus((event, statusData) => {
        updateBotStatus(statusData);
    });
    
    // Listen for navigation events
    window.electronAPI.onNavigate((event, tab) => {
        const tabButton = document.querySelector(`[data-tab="${tab}"]`);
        if (tabButton) {
            tabButton.click();
        }
    });
}

// Load initial data
async function loadInitialData() {
    try {
        // Get bot status
        const status = await window.electronAPI.getBotStatus();
        updateBotStatusDisplay(
            status.running ? 'running' : 'stopped', 
            status.pid, 
            status.source
        );
        
        // If bot is running externally, show connection status
        if (status.running && status.source === 'external') {
            updateConnectionStatus(true);
            if (status.health) {
                addActivityEntry(`External bot detected: ${status.health.status}`);
                if (status.health.uptime) {
                    startTime = new Date(Date.now() - (status.health.uptime * 1000));
                }
            }
        }
        
        // Load configuration
        await loadConfig();
        
        console.log('Initial data loaded');
    } catch (error) {
        console.error('Failed to load initial data:', error);
    }
}

// Bot control functions
async function startBot() {
    try {
        updateBotStatusDisplay('starting');
        await window.electronAPI.startBot();
        addActivityEntry('Bot start command sent');
        startTime = new Date();
    } catch (error) {
        console.error('Failed to start bot:', error);
        updateBotStatusDisplay('stopped');
        addLogEntry({
            type: 'error',
            message: `Failed to start bot: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
}

async function stopBot() {
    try {
        await window.electronAPI.stopBot();
        updateBotStatusDisplay('stopped');
        addActivityEntry('Bot stop command sent');
        startTime = null;
    } catch (error) {
        console.error('Failed to stop bot:', error);
        addLogEntry({
            type: 'error',
            message: `Failed to stop bot: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
}

async function restartBot() {
    try {
        addActivityEntry('Restarting bot...');
        await stopBot();
        setTimeout(async () => {
            await startBot();
        }, 2000);
    } catch (error) {
        console.error('Failed to restart bot:', error);
    }
}

// Update bot status display
function updateBotStatus(statusData) {
    if (statusData.status) {
        updateBotStatusDisplay(statusData.status, statusData.pid, statusData.source);
        addActivityEntry(`Bot status changed to: ${statusData.status}`);
    }
}

function updateBotStatusDisplay(status, pid = null, source = null) {
    botStatus = status;
    const statusElement = document.getElementById('bot-status');
    const pidElement = document.getElementById('bot-pid');
    
    // Update status indicator
    statusElement.className = `status-indicator ${status}`;
    statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    
    // Update PID with source info
    if (pid && pid !== 'external') {
        pidElement.textContent = `${pid}${source === 'external' ? ' (External)' : ''}`;
    } else if (pid === 'external') {
        pidElement.textContent = 'External Process';
    } else if (status === 'stopped') {
        pidElement.textContent = 'Not running';
    }
    
    // Update connection status indicators
    updateConnectionStatus(status === 'running');
}

// Update connection status
function updateConnectionStatus(connected) {
    const indicators = {
        'telegram-status': connected ? 'Connected' : 'Disconnected',
        'metaapi-status': connected ? 'Connected' : 'Disconnected',
        'health-status': connected ? 'Running' : 'Stopped'
    };
    
    Object.keys(indicators).forEach(id => {
        const element = document.getElementById(id);
        element.textContent = indicators[id];
        element.classList.toggle('connected', connected);
    });
    
    // Update status dots
    document.querySelectorAll('.status-dot').forEach(dot => {
        dot.classList.toggle('connected', connected);
    });
}

// Status updates
function startStatusUpdates() {
    setInterval(updateUptime, 1000);
    setInterval(updateStats, 5000);
    setInterval(checkBotStatus, 10000); // Check bot status every 10 seconds
}

// Periodic bot status check
async function checkBotStatus() {
    try {
        const status = await window.electronAPI.getBotStatus();
        const currentlyRunning = botStatus === 'running';
        const actuallyRunning = status.running;
        
        // Only update if status changed
        if (currentlyRunning !== actuallyRunning) {
            updateBotStatusDisplay(
                actuallyRunning ? 'running' : 'stopped',
                status.pid,
                status.source
            );
            
            if (actuallyRunning) {
                addActivityEntry(`Bot detected as running (${status.source})`);
                if (status.source === 'external' && status.health) {
                    if (status.health.uptime) {
                        startTime = new Date(Date.now() - (status.health.uptime * 1000));
                    }
                }
            } else {
                addActivityEntry('Bot stopped');
                startTime = null;
            }
        }
    } catch (error) {
        console.error('Failed to check bot status:', error);
    }
}

function updateUptime() {
    const uptimeElement = document.getElementById('bot-uptime');
    if (startTime && botStatus === 'running') {
        const elapsed = Date.now() - startTime.getTime();
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        uptimeElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        uptimeElement.textContent = '00:00:00';
    }
}

async function updateStats() {
    try {
        // Get real stats from the bot API
        const response = await fetch('http://localhost:3000/stats');
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('total-trades').textContent = stats.totalTrades || 0;
            document.getElementById('successful-trades').textContent = stats.executedTrades || 0;
            document.getElementById('failed-trades').textContent = stats.pendingTrades || 0;
            document.getElementById('success-rate').textContent = `${stats.executionRate || '0.0'}%`;
            addActivityEntry(`Stats updated: ${stats.totalTrades} total trades`);
        } else {
            console.error('Failed to fetch stats:', response.statusText);
            // Fallback to calculating from trades array
            const successfulTrades = trades.filter(t => t.status === 'executed').length;
            const failedTrades = trades.filter(t => t.status === 'pending').length;
            const totalTrades = trades.length;
            const successRate = totalTrades > 0 ? Math.round((successfulTrades / totalTrades) * 100) : 0;
            
            document.getElementById('total-trades').textContent = totalTrades;
            document.getElementById('successful-trades').textContent = successfulTrades;
            document.getElementById('failed-trades').textContent = failedTrades;
            document.getElementById('success-rate').textContent = `${successRate}%`;
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
        // Fallback to local calculation
        const successfulTrades = trades.filter(t => t.status === 'executed').length;
        const pendingTrades = trades.filter(t => t.status === 'pending').length;
        const totalTrades = trades.length;
        const executionRate = totalTrades > 0 ? Math.round((successfulTrades / totalTrades) * 100) : 0;
        
        document.getElementById('total-trades').textContent = totalTrades;
        document.getElementById('successful-trades').textContent = successfulTrades;
        document.getElementById('failed-trades').textContent = pendingTrades;
        document.getElementById('success-rate').textContent = `${executionRate}%`;
    }
}

// Logging functions
function addLogEntry(logData) {
    logs.push(logData);
    
    // Keep only last 1000 logs
    if (logs.length > 1000) {
        logs = logs.slice(-1000);
    }
    
    // Update logs display if on logs tab
    if (currentTab === 'logs') {
        updateLogsDisplay();
    }
    
    // Add to recent activity
    addActivityEntry(logData.message, logData.type);
}

function updateLogsDisplay() {
    const logsContent = document.getElementById('logs-content');
    logsContent.innerHTML = logs.map(log => `
        <div class="log-entry ${log.type}">
            <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
            <span class="log-message">${log.message}</span>
        </div>
    `).join('');
    
    // Scroll to bottom
    logsContent.scrollTop = logsContent.scrollHeight;
}

function clearLogs() {
    logs = [];
    updateLogsDisplay();
    addActivityEntry('Logs cleared');
}

function exportLogs() {
    const logText = logs.map(log => 
        `${log.timestamp} [${log.type.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addActivityEntry('Logs exported');
}

// Activity functions
function addActivityEntry(message, type = 'info') {
    const activityList = document.getElementById('recent-activity');
    const timestamp = new Date().toLocaleTimeString();
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `
        <span class="activity-time">${timestamp}</span>
        <span class="activity-message">${message}</span>
    `;
    
    // Add to top
    activityList.insertBefore(activityItem, activityList.firstChild);
    
    // Keep only last 10 items
    while (activityList.children.length > 10) {
        activityList.removeChild(activityList.lastChild);
    }
}

// Settings functions
async function saveSettings(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        const config = {};
        
        // Convert form data to config object
        for (const [key, value] of formData.entries()) {
            if (key.endsWith('_MODE')) {
                config[key] = value === 'on' ? 'true' : 'false';
            } else if (event.target.elements[key].type === 'checkbox') {
                config[key] = event.target.elements[key].checked ? 'true' : 'false';
            } else {
                config[key] = value;
            }
        }
        
        const result = await window.electronAPI.saveConfig(config);
        
        if (result.success) {
            addActivityEntry('Configuration saved successfully');
            
            // Show success message
            const saveBtn = event.target.querySelector('button[type="submit"]');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✅ Saved!';
            saveBtn.style.background = '#27ae60';
            
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = '';
            }, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        addLogEntry({
            type: 'error',
            message: `Failed to save settings: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
}

async function loadConfig() {
    try {
        const config = await window.electronAPI.loadConfig();
        
        // Populate form fields
        Object.keys(config).forEach(key => {
            const element = document.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = config[key] === 'true';
                } else {
                    element.value = config[key] || '';
                }
            }
        });
        
        console.log('Configuration loaded');
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

function resetConfig() {
    const form = document.getElementById('settings-form');
    form.reset();
    
    // Set default values
    const defaults = {
        'MAX_TRADE_SIZE': '0.1',
        'RISK_PERCENTAGE': '2',
        'LOG_LEVEL': 'info',
        'TEST_MODE': false,
        'DEMO_MODE': false,
        'ENABLE_MT5_ORDER_MANAGER': false
    };
    
    Object.keys(defaults).forEach(key => {
        const element = document.querySelector(`[name="${key}"]`);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = defaults[key];
            } else {
                element.value = defaults[key];
            }
        }
    });
    
    addActivityEntry('Configuration reset to defaults');
}

// Trades functions
async function refreshTrades() {
    try {
        // Get real trades data from the bot API
        const response = await fetch('http://localhost:3000/trades');
        if (response.ok) {
            const data = await response.json();
            trades = data.trades || [];
            addActivityEntry(`Loaded ${trades.length} real trades`);
        } else {
            console.error('Failed to fetch trades data:', response.statusText);
            trades = [];
            addActivityEntry('Failed to load trades data');
        }
    } catch (error) {
        console.error('Error fetching trades:', error);
        trades = [];
        addActivityEntry('Error loading trades - using empty list');
    }
    
    updateTradesDisplay();
}

function updateTradesDisplay() {
    const tradesTable = document.getElementById('trades-table');
    
    if (trades.length === 0) {
        tradesTable.innerHTML = '<div class="trade-item"><div class="trade-info">No trades found</div></div>';
        return;
    }
    
    tradesTable.innerHTML = trades.map(trade => `
        <div class="trade-item ${trade.status}">
            <div class="trade-info">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>${trade.symbol} ${trade.action}</strong>
                    <span class="trade-status status-${trade.status}">${trade.status.toUpperCase()}</span>
                </div>
                <div style="color: #888; font-size: 12px; margin-bottom: 8px;">
                    ID: ${trade.id} | Volume: ${trade.volume}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px;">
                    <div>
                        <div style="color: #888; font-size: 11px;">Entry Zone</div>
                        <div>${trade.entry ? trade.entry.toFixed(2) : 'N/A'}</div>
                    </div>
                    <div>
                        <div style="color: #888; font-size: 11px;">Stop Loss</div>
                        <div>${trade.stopLoss ? trade.stopLoss.toFixed(2) : 'N/A'}</div>
                    </div>
                </div>
                ${trade.targets && trade.targets.length > 0 ? `
                <div style="margin-bottom: 8px;">
                    <div style="color: #888; font-size: 11px;">Targets</div>
                    <div style="font-size: 12px;">${trade.targets.filter(t => typeof t === 'number').map(t => t.toFixed(2)).join(', ')}</div>
                </div>` : ''}
                ${trade.reason ? `
                <div style="margin-bottom: 8px;">
                    <div style="color: #888; font-size: 11px;">Reason</div>
                    <div style="font-size: 12px;">${trade.reason}</div>
                </div>` : ''}
                <div style="color: #888; font-size: 11px;">
                    Created: ${new Date(trade.timestamp).toLocaleString()}
                    ${trade.executedAt ? `<br>Executed: ${new Date(trade.executedAt).toLocaleString()}` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// Accounts functions
async function refreshAccounts() {
    try {
        // Get accounts data from the bot API
        const response = await fetch('http://localhost:3000/accounts');
        if (response.ok) {
            const data = await response.json();
            accounts = data.accounts || [];
            updateAccountsDisplay();
            updateAccountsSummary(data);
            addActivityEntry(`Loaded ${accounts.length} MetaAPI accounts`);
        } else {
            console.error('Failed to fetch accounts data:', response.statusText);
            accounts = [];
            addActivityEntry('Failed to load accounts data');
        }
    } catch (error) {
        console.error('Error fetching accounts:', error);
        accounts = [];
        addActivityEntry('Error loading accounts - using empty list');
    }
}

function updateAccountsDisplay() {
    const accountsGrid = document.getElementById('accounts-grid');
    
    if (accounts.length === 0) {
        accountsGrid.innerHTML = '<div class="account-card"><div class="account-info">No MetaAPI accounts configured</div></div>';
        return;
    }
    
    accountsGrid.innerHTML = accounts.map(account => `
        <div class="account-card ${account.connected ? 'connected' : 'disconnected'}">
            <div class="account-card-header">
                <div class="account-name">${account.name || 'Unnamed Account'}</div>
                <div class="account-connection-status ${account.connected ? 'connected' : 'disconnected'}">
                    ${account.connected ? '✅ Connected' : '❌ Disconnected'}
                </div>
            </div>
            <div class="account-details">
                <div class="account-detail">
                    <div class="account-detail-label">Risk Percentage</div>
                    <div class="account-detail-value">${account.riskPercentage}%</div>
                </div>
                <div class="account-detail">
                    <div class="account-detail-label">Max Trade Size</div>
                    <div class="account-detail-value">${account.maxTradeSize}</div>
                </div>
                ${account.balance ? `
                <div class="account-detail">
                    <div class="account-detail-label">Balance</div>
                    <div class="account-detail-value">$${account.balance.toFixed(2)}</div>
                </div>` : ''}
            </div>
            <div class="account-id">ID: ${account.accountId}</div>
        </div>
    `).join('');
}

function updateAccountsSummary(data) {
    const connectedCount = accounts.filter(acc => acc.connected).length;
    
    document.getElementById('total-accounts').textContent = data.total || accounts.length;
    document.getElementById('connected-accounts').textContent = connectedCount;
    document.getElementById('current-strategy').textContent = data.strategy || 'round_robin';
}

// Add accounts to tab loading logic
function loadTabContent(tabId) {
    switch (tabId) {
        case 'dashboard':
            updateStats();
            checkBotStatus();
            break;
        case 'trades':
            refreshTrades();
            break;
        case 'accounts':
            refreshAccounts();
            break;
        case 'logs':
            updateLogsDisplay();
            break;
    }
}
