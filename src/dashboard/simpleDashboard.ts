/**
 * Simplified Dashboard Server for Clean Multi-Account Executor
 * Removes complex features that don't exist in the clean system
 */

import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { CleanMultiAccountExecutor } from '../mt5/cleanMultiAccountExecutor';

// Simple global state
let sharedExecutor: CleanMultiAccountExecutor | null = null;
let botStatus = {
  isRunning: false,
  uptime: 0,
  connections: { telegram: false, metaapi: false }
};
let logs: Array<{ timestamp: number, level: string, message: string }> = [];

export function setSharedExecutor(executor: CleanMultiAccountExecutor) {
  sharedExecutor = executor;
}

export function updateBotStatus(status: any) {
  botStatus = { ...botStatus, ...status };
}

export function addLog(log: { level: string, message: string }) {
  logs.push({
    timestamp: Date.now(),
    level: log.level,
    message: log.message
  });
  
  // Keep only last 100 logs
  if (logs.length > 100) {
    logs = logs.slice(-100);
  }
}

/**
 * Simple HTTP server for dashboard
 */
export default function dashboardApp(req: http.IncomingMessage, res: http.ServerResponse) {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '/';

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname, parsedUrl.query);
    return;
  }

  // Serve static HTML dashboard
  if (pathname === '/' || pathname === '/index.html') {
    serveSimpleDashboard(res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

/**
 * Handle API requests
 */
async function handleApiRequest(
  req: http.IncomingMessage, 
  res: http.ServerResponse,
  pathname: string,
  query: any
) {
  try {
    // Bot status
    if (pathname === '/api/status') {
      const accountStatuses = sharedExecutor ? sharedExecutor.getAccountStatuses() : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        bot: botStatus,
        accounts: accountStatuses,
        executor: sharedExecutor ? 'CleanMultiAccountExecutor' : 'Not initialized'
      }));
      return;
    }

    // Recent logs
    if (pathname === '/api/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        logs: logs.slice(-50) // Last 50 logs
      }));
      return;
    }

    // Connection test
    if (pathname === '/api/connection-test') {
      const isConnected = sharedExecutor ? await sharedExecutor.isConnected() : false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connected: isConnected,
        message: isConnected ? 'Connected to MetaAPI' : 'Not connected to MetaAPI'
      }));
      return;
    }

    // 404 for unknown API routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));

  } catch (error) {
    logger.error('Dashboard API error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

/**
 * Serve simple HTML dashboard
 */
function serveSimpleDashboard(res: http.ServerResponse) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram Trading Bot - Clean Dashboard</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0; padding: 20px; background: #f5f5f5;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { 
            background: white; border-radius: 8px; padding: 20px; 
            margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status-badge { 
            padding: 4px 12px; border-radius: 20px; font-size: 12px; 
            font-weight: bold; color: white;
        }
        .status-connected { background: #4CAF50; }
        .status-disconnected { background: #f44336; }
        .status-connecting { background: #ff9800; }
        h1 { color: #333; }
        h2 { color: #555; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
        .log-entry { 
            padding: 8px; margin: 4px 0; border-radius: 4px; 
            font-family: monospace; font-size: 12px;
        }
        .log-info { background: #e3f2fd; }
        .log-error { background: #ffebee; }
        .log-success { background: #e8f5e8; }
        .accounts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
        .account-card { 
            border: 1px solid #ddd; border-radius: 6px; padding: 15px;
            background: #fafafa;
        }
        .refresh-btn {
            background: #2196F3; color: white; border: none; padding: 10px 20px;
            border-radius: 5px; cursor: pointer; font-size: 14px;
        }
        .refresh-btn:hover { background: #1976D2; }
        .timestamp { color: #666; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Telegram Trading Bot Dashboard</h1>
        <p>Clean Multi-Account Executor - Simplified & Reliable</p>
        
        <div class="card">
            <h2>System Status</h2>
            <div id="system-status">Loading...</div>
            <button class="refresh-btn" onclick="refreshStatus()">Refresh Status</button>
        </div>

        <div class="card">
            <h2>Account Status</h2>
            <div id="accounts-status">Loading...</div>
        </div>

        <div class="card">
            <h2>Recent Activity</h2>
            <div id="logs-container">Loading...</div>
        </div>
    </div>

    <script>
        async function refreshStatus() {
            try {
                // System status
                const statusResponse = await fetch('/api/status');
                const statusData = await statusResponse.json();
                
                document.getElementById('system-status').innerHTML = \`
                    <p><strong>Bot Running:</strong> <span class="status-badge \${statusData.bot.isRunning ? 'status-connected' : 'status-disconnected'}">\${statusData.bot.isRunning ? 'YES' : 'NO'}</span></p>
                    <p><strong>Telegram:</strong> <span class="status-badge \${statusData.bot.connections.telegram ? 'status-connected' : 'status-disconnected'}">\${statusData.bot.connections.telegram ? 'Connected' : 'Disconnected'}</span></p>
                    <p><strong>MetaAPI:</strong> <span class="status-badge \${statusData.bot.connections.metaapi ? 'status-connected' : 'status-disconnected'}">\${statusData.bot.connections.metaapi ? 'Connected' : 'Disconnected'}</span></p>
                    <p><strong>Executor:</strong> \${statusData.executor}</p>
                \`;

                // Accounts status
                const accountsHtml = statusData.accounts.map(acc => \`
                    <div class="account-card">
                        <h3>\${acc.brokerName} (\${acc.accountType})</h3>
                        <p><strong>Status:</strong> <span class="status-badge \${acc.status === 'CONNECTED' ? 'status-connected' : acc.status === 'CONNECTING' ? 'status-connecting' : 'status-disconnected'}">\${acc.status}</span></p>
                        <p><strong>Account ID:</strong> \${acc.id}</p>
                    </div>
                \`).join('');
                
                document.getElementById('accounts-status').innerHTML = \`
                    <div class="accounts-grid">\${accountsHtml}</div>
                \`;

                // Logs
                const logsResponse = await fetch('/api/logs');
                const logsData = await logsResponse.json();
                
                const logsHtml = logsData.logs.map(log => \`
                    <div class="log-entry log-\${log.level}">
                        <span class="timestamp">\${new Date(log.timestamp).toLocaleString()}</span>
                        [\${log.level.toUpperCase()}] \${log.message}
                    </div>
                \`).join('');
                
                document.getElementById('logs-container').innerHTML = logsHtml;

            } catch (error) {
                console.error('Error refreshing status:', error);
                document.getElementById('system-status').innerHTML = '<p style="color: red;">Error loading status</p>';
            }
        }

        // Auto-refresh every 30 seconds
        setInterval(refreshStatus, 30000);
        
        // Initial load
        refreshStatus();
    </script>
</body>
</html>
  `;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}
