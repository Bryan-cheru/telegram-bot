const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Keep a global reference of the window object
let mainWindow;
let tray = null;
let botProcess = null;
let isQuitting = false;

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    show: false, // Don't show until ready
    autoHideMenuBar: false
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Check for external bot after window is ready
    setTimeout(async () => {
      const isExternalBotRunning = await checkExistingBot();
      if (isExternalBotRunning) {
        mainWindow.webContents.send('bot-status', {
          status: 'running',
          source: 'external',
          pid: 'external'
        });
      }
    }, 1000);
    
    // Check for updates (only in production)
    if (process.env.NODE_ENV === 'production') {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle minimize to tray
  mainWindow.on('minimize', (event) => {
    if (process.platform === 'win32') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Handle close to tray (don't quit)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show tray notification
      if (tray) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'Telegram Trading Bot',
          content: 'App was minimized to tray. Click the tray icon to restore.'
        });
      }
    }
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    
    // Check if tray icon exists, if not, skip tray creation
    if (!fs.existsSync(iconPath)) {
      console.log('Tray icon not found, skipping tray creation');
      return;
    }
    
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      },
      {
        label: 'Start Bot',
        click: () => {
          startBot();
        }
      },
      {
        label: 'Stop Bot',
        click: () => {
          stopBot();
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          mainWindow.show();
          mainWindow.webContents.send('navigate-to', 'settings');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('Telegram Trading Bot');
    tray.setContextMenu(contextMenu);
    
    // Double click to show window
    tray.on('double-click', () => {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });
  } catch (error) {
    console.log('Failed to create tray:', error.message);
  }
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('navigate-to', 'settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            isQuitting = true;
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
          click: () => startBot()
        },
        {
          label: 'Stop Bot',
          accelerator: 'CmdOrCtrl+T',
          click: () => stopBot()
        },
        {
          label: 'Restart Bot',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            stopBot();
            setTimeout(() => startBot(), 2000);
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
              title: 'About',
              message: 'Telegram Trading Bot',
              detail: 'Version 1.0.0\nAutomated trading bot for Telegram signals'
            });
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Bot process management
function startBot() {
  if (botProcess) {
    stopBot();
  }

  // Check if bot is already running by checking the health endpoint
  checkExistingBot().then(isRunning => {
    if (isRunning) {
      mainWindow?.webContents.send('bot-status', {
        status: 'running',
        external: true
      });
      mainWindow?.webContents.send('bot-log', {
        type: 'info',
        message: 'Detected bot already running externally',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const botPath = path.join(__dirname, '..', 'dist', 'app.js');
    const nodePath = process.execPath.replace('electron.exe', 'node.exe');
    
    botProcess = spawn('node', [botPath], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' }
    });

    botProcess.stdout.on('data', (data) => {
      const logData = data.toString();
      mainWindow?.webContents.send('bot-log', {
        type: 'info',
        message: logData,
        timestamp: new Date().toISOString()
      });
    });

    botProcess.stderr.on('data', (data) => {
      const logData = data.toString();
      mainWindow?.webContents.send('bot-log', {
        type: 'error',
        message: logData,
        timestamp: new Date().toISOString()
      });
    });

    botProcess.on('close', (code) => {
      mainWindow?.webContents.send('bot-status', {
        status: 'stopped',
        code: code
      });
      botProcess = null;
    });

    mainWindow?.webContents.send('bot-status', {
      status: 'starting'
    });
  });
}

function stopBot() {
  if (botProcess) {
    botProcess.kill();
    botProcess = null;
    mainWindow?.webContents.send('bot-status', {
      status: 'stopped'
    });
  }
}

// Check if bot is already running externally
async function checkExistingBot() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/health', { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();
  createMenu();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBot();
});

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('start-bot', () => {
  startBot();
});

ipcMain.handle('stop-bot', () => {
  stopBot();
});

ipcMain.handle('get-bot-status', async () => {
  // Check if we have a local process running
  if (botProcess !== null) {
    return {
      running: true,
      pid: botProcess.pid,
      source: 'electron'
    };
  }
  
  // Check if bot is running externally by checking health endpoint
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/health', { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const healthData = JSON.parse(data);
            resolve({
              running: true,
              pid: 'external',
              source: 'external',
              health: healthData
            });
          } catch (e) {
            resolve({
              running: true,
              pid: 'external',
              source: 'external'
            });
          }
        } else {
          resolve({
            running: false,
            pid: null,
            source: null
          });
        }
      });
    });
    
    req.on('error', () => {
      resolve({
        running: false,
        pid: null,
        source: null
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        running: false,
        pid: null,
        source: null
      });
    });
  });
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    Object.keys(config).forEach(key => {
      envContent += `${key}=${config[key]}\n`;
    });
    
    fs.writeFileSync(envPath, envContent);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-config', async () => {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const config = {};
      
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          config[key.trim()] = valueParts.join('=').trim();
        }
      });
      
      return config;
    }
    return {};
  } catch (error) {
    return {};
  }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available.');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. It will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
