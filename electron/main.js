const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Keep a global reference of the window object
let mainWindow;
let botProcess = null;
let isQuitting = false;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Telegram Trading Bot',
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on window
    if (process.platform === 'darwin') {
      mainWindow.focus();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window close event
  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBot();
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('show-settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Bot',
      submenu: [
        {
          label: 'Start Bot',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            startBot();
          }
        },
        {
          label: 'Stop Bot',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            stopBot();
          }
        },
        {
          label: 'Restart Bot',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            restartBot();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Telegram Trading Bot',
              message: 'Telegram Trading Bot v1.0.0',
              detail: 'Professional Telegram bot for automated trading via MetaAPI.\n\nBuilt with Node.js, TypeScript, and Electron.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Bot control functions
function startBot() {
  if (botProcess) {
    mainWindow.webContents.send('bot-log', { 
      level: 'warn', 
      message: 'Bot is already running' 
    });
    return;
  }

  const botPath = path.join(__dirname, '..', 'dist', 'app.js');
  
  if (!fs.existsSync(botPath)) {
    mainWindow.webContents.send('bot-log', { 
      level: 'error', 
      message: 'Bot not built. Please run: npm run build' 
    });
    return;
  }

  botProcess = spawn('node', [botPath], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  botProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      mainWindow.webContents.send('bot-log', { 
        level: 'info', 
        message: message 
      });
    }
  });

  botProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      mainWindow.webContents.send('bot-log', { 
        level: 'error', 
        message: message 
      });
    }
  });

  botProcess.on('close', (code) => {
    botProcess = null;
    mainWindow.webContents.send('bot-log', { 
      level: code === 0 ? 'info' : 'error', 
      message: `Bot stopped with code ${code}` 
    });
    mainWindow.webContents.send('bot-status-changed', false);
  });

  mainWindow.webContents.send('bot-status-changed', true);
  mainWindow.webContents.send('bot-log', { 
    level: 'info', 
    message: 'Bot started successfully' 
  });
}

function stopBot() {
  if (botProcess) {
    botProcess.kill('SIGTERM');
    botProcess = null;
    mainWindow.webContents.send('bot-log', { 
      level: 'info', 
      message: 'Bot stop signal sent' 
    });
  }
}

function restartBot() {
  stopBot();
  setTimeout(() => {
    startBot();
  }, 2000);
}

// IPC handlers
ipcMain.handle('start-bot', () => {
  startBot();
});

ipcMain.handle('stop-bot', () => {
  stopBot();
});

ipcMain.handle('restart-bot', () => {
  restartBot();
});

ipcMain.handle('get-bot-status', () => {
  return botProcess !== null;
});

ipcMain.handle('read-logs', () => {
  const logsPath = path.join(__dirname, '..', 'logs', 'combined.log');
  try {
    if (fs.existsSync(logsPath)) {
      const logs = fs.readFileSync(logsPath, 'utf8');
      return logs.split('\n').filter(line => line.trim()).slice(-100); // Last 100 lines
    }
    return [];
  } catch (error) {
    return [];
  }
});

ipcMain.handle('get-config', () => {
  const configPath = path.join(__dirname, '..', '.env');
  try {
    if (fs.existsSync(configPath)) {
      const envContent = fs.readFileSync(configPath, 'utf8');
      const config = {};
      
      envContent.split('\n').forEach(line => {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      
      // Don't send sensitive tokens to renderer
      const safeConfig = {
        hasToken: !!config.BOT_TOKEN,
        hasMetaApiToken: !!config.METAAPI_TOKEN,
        hasAccountId: !!config.METAAPI_ACCOUNT_ID,
        channelId: config.ALLOWED_CHANNEL_ID,
        maxTradeSize: config.MAX_TRADE_SIZE,
        riskPercentage: config.RISK_PERCENTAGE,
        logLevel: config.LOG_LEVEL,
        nodeEnv: config.NODE_ENV
      };
      
      return safeConfig;
    }
    return {};
  } catch (error) {
    return {};
  }
});
