const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadConfigForElectron } = require('./config-loader');

let mainWindow;
let botInstance = null;

// Determine if we're in development or production
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const appPath = isDev ? path.join(__dirname, '..') : process.resourcesPath;

console.log('🚀 Electron starting...');
console.log('📁 App path:', appPath);
console.log('🔧 Development mode:', isDev);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (botInstance) {
      try {
        botInstance.stop();
      } catch (error) {
        console.error('Error stopping bot:', error);
      }
    }
  });
}

// Function to run bot directly in Electron
async function runBotInElectron() {
  try {
    console.log('🤖 Starting bot in Electron...');
    
    // Load configuration first
    const config = loadConfigForElectron(appPath);
    console.log('✅ Configuration loaded successfully');

    const botAppPath = isDev ? appPath : path.join(appPath, 'app.asar.unpacked');
    process.chdir(botAppPath);
    
    // Add node_modules to require paths
    const botNodeModules = path.join(botAppPath, 'node_modules');
    if (fs.existsSync(botNodeModules)) {
      require('module').globalPaths.unshift(botNodeModules);
    }

    // Set additional environment flags
    process.env.ELECTRON_IS_RUNNING = 'true';
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';

    // Import and run electron-specific bot runner
    const electronBotPath = path.join(botAppPath, 'dist', 'electron-bot-runner.js');
    if (!fs.existsSync(electronBotPath)) {
      throw new Error(`Electron bot runner not found: ${electronBotPath}`);
    }

    // Redirect console output
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
      if (mainWindow) {
        mainWindow.webContents.send('bot-output', message);
      }
      originalLog(...args);
    };
    
    console.error = (...args) => {
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
      if (mainWindow) {
        mainWindow.webContents.send('bot-output', `ERROR: ${message}`);
      }
      originalError(...args);
    };

    // Clear require cache and load electron bot runner
    delete require.cache[require.resolve(electronBotPath)];
    const { startBotForElectron } = require(electronBotPath);
    
    // Start the bot using the electron-specific runner
    const result = await startBotForElectron();
    
    if (result.success) {
      botInstance = { running: true }; // Simple status tracking
      if (mainWindow) {
        mainWindow.webContents.send('bot-output', '✅ Bot loaded and running in Electron');
        mainWindow.webContents.send('bot-status', 'running');
      }
      return { success: true, message: 'Bot started successfully' };
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    if (mainWindow) {
      mainWindow.webContents.send('bot-output', `❌ Failed to start bot: ${error.message}`);
    }
    throw error;
  }
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('start-bot', async () => {
  if (botInstance) {
    return { success: false, message: 'Bot is already running' };
  }

  try {
    const result = await runBotInElectron();
    return result;
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('stop-bot', async () => {
  if (!botInstance) {
    return { success: false, message: 'Bot is not running' };
  }

  try {
    // Use the electron-specific stop function
    const botAppPath = isDev ? appPath : path.join(appPath, 'app.asar.unpacked');
    const electronBotPath = path.join(botAppPath, 'dist', 'electron-bot-runner.js');
    
    if (fs.existsSync(electronBotPath)) {
      const { stopBotForElectron } = require(electronBotPath);
      const result = await stopBotForElectron();
      
      if (result.success) {
        botInstance = null;
        if (mainWindow) {
          mainWindow.webContents.send('bot-status', 'stopped');
        }
        return { success: true, message: 'Bot stopped successfully' };
      } else {
        return { success: false, message: result.message };
      }
    } else {
      botInstance = null;
      if (mainWindow) {
        mainWindow.webContents.send('bot-status', 'stopped');
      }
      return { success: true, message: 'Bot stopped successfully' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-bot-status', async () => {
  return { running: botInstance !== null };
});

ipcMain.handle('get-debug-info', async () => {
  const botAppPath = isDev ? appPath : path.join(appPath, 'app.asar.unpacked');
  const botScriptPath = path.join(botAppPath, 'dist', 'app.js');
  const envPath = path.join(botAppPath, '.env');
  
  return {
    isDev,
    appPath,
    botAppPath,
    botScriptPath,
    envPath,
    botScriptExists: fs.existsSync(botScriptPath),
    envExists: fs.existsSync(envPath),
    isPackaged: app.isPackaged,
    environmentVariables: {
      BOT_TOKEN: process.env.BOT_TOKEN ? 'SET' : 'NOT SET',
      ALLOWED_CHANNEL_ID: process.env.ALLOWED_CHANNEL_ID ? 'SET' : 'NOT SET',
      METAAPI_TOKEN: process.env.METAAPI_TOKEN ? 'SET' : 'NOT SET',
      METAAPI_ACCOUNT_ID: process.env.METAAPI_ACCOUNT_ID ? 'SET' : 'NOT SET'
    }
  };
});

// Auto-start the bot when the app loads
app.whenReady().then(async () => {
  setTimeout(async () => {
    try {
      console.log('🚀 Auto-starting bot...');
      await runBotInElectron();
    } catch (error) {
      console.error('❌ Auto-start failed:', error.message);
    }
  }, 2000); // Wait 2 seconds for the window to be ready
});
