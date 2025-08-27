// Electron API access
const electronAPI = window.electronAPI;

// State management
let botStatus = false;
let startTime = null;
let logs = [];
let uptime = 0;

// DOM elements
const elements = {
    botStatus: document.getElementById('bot-status'),
    statusText: document.getElementById('status-text'),
    detailedStatus: document.getElementById('detailed-status'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    restartBtn: document.getElementById('restart-btn'),
    uptime: document.getElementById('uptime'),
    lastActivity: document.getElementById('last-activity'),
    logContainer: document.getElementById('log-container'),
    clearLogsBtn: document.getElementById('clear-logs'),
    refreshLogsBtn: document.getElementById('refresh-logs'),
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),
    recentActivity: document.getElementById('recent-activity')
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    startUptimeTimer();
    loadConfiguration();
});

function initializeApp() {
    // Set initial status
    updateBotStatus(false);
    
    // Load initial logs
    loadLogs();
    
    // Check bot status
    checkBotStatus();
}

function setupEventListeners() {
    // Bot control buttons
    elements.startBtn.addEventListener('click', startBot);
    elements.stopBtn.addEventListener('click', stopBot);
    elements.restartBtn.addEventListener('click', restartBot);
    
    // Log controls
    elements.clearLogsBtn.addEventListener('click', clearLogs);
    elements.refreshLogsBtn.addEventListener('click', loadLogs);
    
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.dataset.tab;
            switchTab(tabId);
        });
    });
    
    // Electron IPC listeners
    electronAPI.onBotLog((event, logData) => {
        addLogEntry(logData);
        updateLastActivity();
    });
    
    electronAPI.onBotStatusChanged((event, status) => {
        updateBotStatus(status);
        if (status) {
            startTime = Date.now();
        } else {
            startTime = null;
        }
    });
    
    electronAPI.onShowSettings((event) => {
        switchTab('settings');
    });
}

// Bot control functions
async function startBot() {
    try {
        elements.startBtn.disabled = true;
        addLogEntry({ level: 'info', message: 'Starting bot...' });
        await electronAPI.startBot();
    } catch (error) {
        addLogEntry({ level: 'error', message: `Failed to start bot: ${error.message}` });
    } finally {
        elements.startBtn.disabled = false;
    }
}

async function stopBot() {
    try {
        elements.stopBtn.disabled = true;
        addLogEntry({ level: 'info', message: 'Stopping bot...' });
        await electronAPI.stopBot();
    } catch (error) {
        addLogEntry({ level: 'error', message: `Failed to stop bot: ${error.message}` });
    } finally {
        elements.stopBtn.disabled = false;
    }
}

async function restartBot() {
    try {
        elements.restartBtn.disabled = true;
        addLogEntry({ level: 'info', message: 'Restarting bot...' });
        await electronAPI.restartBot();
    } catch (error) {
        addLogEntry({ level: 'error', message: `Failed to restart bot: ${error.message}` });
    } finally {
        elements.restartBtn.disabled = false;
    }
}

async function checkBotStatus() {
    try {
        const status = await electronAPI.getBotStatus();
        updateBotStatus(status);
        if (status && !startTime) {
            startTime = Date.now();
        }
    } catch (error) {
        console.error('Failed to check bot status:', error);
    }
}

// UI update functions
function updateBotStatus(status) {
    botStatus = status;
    
    if (status) {
        elements.botStatus.className = 'status online';
        elements.statusText.textContent = 'Online';
        elements.detailedStatus.textContent = 'Running';
        elements.startBtn.disabled = true;
        elements.stopBtn.disabled = false;
        elements.restartBtn.disabled = false;
    } else {
        elements.botStatus.className = 'status offline';
        elements.statusText.textContent = 'Offline';
        elements.detailedStatus.textContent = 'Stopped';
        elements.startBtn.disabled = false;
        elements.stopBtn.disabled = true;
        elements.restartBtn.disabled = true;
        uptime = 0;
        elements.uptime.textContent = '00:00:00';
    }
}

function updateLastActivity() {
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 8);
    elements.lastActivity.textContent = timeString;
}

function startUptimeTimer() {
    setInterval(() => {
        if (botStatus && startTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
            const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            elements.uptime.textContent = `${hours}:${minutes}:${seconds}`;
        }
    }, 1000);
}

// Log management
function addLogEntry(logData) {
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 8);
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${logData.level}`;
    logEntry.innerHTML = `<span class="log-time">[${timeString}]</span><span class="log-level">[${logData.level.toUpperCase()}]</span><span class="log-message">${logData.message}</span>`;
    
    elements.logContainer.appendChild(logEntry);
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    
    // Add to recent activity
    addRecentActivity(logData.message);
    
    // Limit log entries
    const entries = elements.logContainer.children;
    if (entries.length > 1000) {
        elements.logContainer.removeChild(entries[0]);
    }
}

function addRecentActivity(message) {
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `<span class="activity-time">${timeString}</span><span class="activity-message">${message}</span>`;
    
    elements.recentActivity.insertBefore(activityItem, elements.recentActivity.firstChild);
    
    // Limit activity entries
    const items = elements.recentActivity.children;
    if (items.length > 10) {
        elements.recentActivity.removeChild(items[items.length - 1]);
    }
}

async function loadLogs() {
    try {
        const historicalLogs = await electronAPI.readLogs();
        
        // Clear current logs
        elements.logContainer.innerHTML = '';
        
        // Add historical logs
        historicalLogs.forEach(logLine => {
            if (logLine.trim()) {
                try {
                    const logData = JSON.parse(logLine);
                    const logEntry = document.createElement('div');
                    logEntry.className = `log-entry ${logData.level || 'info'}`;
                    
                    const timestamp = logData.timestamp ? 
                        new Date(logData.timestamp).toTimeString().slice(0, 8) : 
                        '--:--:--';
                    
                    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span><span class="log-level">[${(logData.level || 'INFO').toUpperCase()}]</span><span class="log-message">${logData.message || logLine}</span>`;
                    elements.logContainer.appendChild(logEntry);
                } catch (e) {
                    // Handle non-JSON log lines
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry info';
                    logEntry.innerHTML = `<span class="log-time">[--:--:--]</span><span class="log-level">[INFO]</span><span class="log-message">${logLine}</span>`;
                    elements.logContainer.appendChild(logEntry);
                }
            }
        });
        
        elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    } catch (error) {
        console.error('Failed to load logs:', error);
        addLogEntry({ level: 'error', message: 'Failed to load historical logs' });
    }
}

function clearLogs() {
    elements.logContainer.innerHTML = '<div class="log-entry info"><span class="log-time">[--:--:--]</span><span class="log-level">[INFO]</span><span class="log-message">Logs cleared</span></div>';
    elements.recentActivity.innerHTML = '<div class="activity-item"><span class="activity-time">--:--</span><span class="activity-message">Logs cleared</span></div>';
}

// Navigation
function switchTab(tabId) {
    // Update navigation
    elements.navItems.forEach(item => {
        if (item.dataset.tab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update content
    elements.tabContents.forEach(content => {
        if (content.id === tabId) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Load specific tab data
    if (tabId === 'logs') {
        loadLogs();
    } else if (tabId === 'settings') {
        loadConfiguration();
    }
}

// Configuration management
async function loadConfiguration() {
    try {
        const config = await electronAPI.getConfig();
        
        // Update dashboard config status
        updateConfigStatus('token-status', config.hasToken);
        updateConfigStatus('metaapi-status', config.hasMetaApiToken);
        updateConfigStatus('account-status', config.hasAccountId);
        updateConfigStatus('channel-status', !!config.channelId);
        
        // Update settings tab
        updateConfigStatus('env-token-status', config.hasToken);
        updateConfigStatus('env-metaapi-status', config.hasMetaApiToken);
        updateConfigStatus('env-account-status', config.hasAccountId);
        
        if (config.channelId) {
            document.getElementById('env-channel-status').textContent = config.channelId;
        } else {
            updateConfigStatus('env-channel-status', false);
        }
        
        // Update form fields
        if (config.maxTradeSize) {
            document.getElementById('max-trade-size').value = config.maxTradeSize;
        }
        if (config.riskPercentage) {
            document.getElementById('risk-percentage').value = config.riskPercentage;
        }
        if (config.logLevel) {
            document.getElementById('log-level').value = config.logLevel;
        }
        
    } catch (error) {
        console.error('Failed to load configuration:', error);
        addLogEntry({ level: 'error', message: 'Failed to load configuration' });
    }
}

function updateConfigStatus(elementId, hasValue) {
    const element = document.getElementById(elementId);
    if (element) {
        if (hasValue) {
            element.textContent = '✅ Configured';
            element.style.color = 'var(--success-color)';
        } else {
            element.textContent = '❌ Not Set';
            element.style.color = 'var(--danger-color)';
        }
    }
}

// Auto-refresh data every 30 seconds
setInterval(() => {
    checkBotStatus();
    if (document.querySelector('.tab-content.active').id === 'logs') {
        loadLogs();
    }
}, 30000);

// Handle window focus
window.addEventListener('focus', () => {
    checkBotStatus();
    loadConfiguration();
});

console.log('Telegram Trading Bot UI loaded successfully');
