const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let botInstance = null;

// Determine if we're in development or production
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const appPath = isDev ? path.join(__dirname, '..') : process.resourcesPath;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional: add an icon
    show: false // Don't show until ready
  });

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
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

// Function to load and run the bot directly in Electron
async function runBotInElectron() {
  try {
    const botAppPath = isDev ? appPath : path.join(appPath, 'app.asar.unpacked');
    const envPath = path.join(botAppPath, '.env');
    
    // Load environment variables directly into process.env
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      console.log('Loading environment from:', envPath);
      console.log('Environment file content length:', envContent.length);
      
      const envLines = envContent.split('\n');
      let loadedCount = 0;
      
      for (const line of envLines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            process.env[key.trim()] = value;
            loadedCount++;
            console.log(`Loaded env var: ${key.trim()}=${value ? '[SET]' : '[EMPTY]'}`);
          }
        }
      }
      
      console.log(`Total environment variables loaded: ${loadedCount}`);
      console.log('BOT_TOKEN loaded:', process.env.BOT_TOKEN ? '[SET]' : '[NOT SET]');
      console.log('METAAPI_TOKEN loaded:', process.env.METAAPI_TOKEN ? '[SET]' : '[NOT SET]');
      
      // Set a flag so the bot knows it's running in Electron
      process.env.ELECTRON_IS_RUNNING = 'true';
      
      console.log('Environment variables loaded:', {
        BOT_TOKEN: process.env.BOT_TOKEN ? '***SET***' : 'NOT SET',
        METAAPI_TOKEN: process.env.METAAPI_TOKEN ? '***SET***' : 'NOT SET',
        ALLOWED_CHANNEL_ID: process.env.ALLOWED_CHANNEL_ID || 'NOT SET',
        METAAPI_ACCOUNT_ID: process.env.METAAPI_ACCOUNT_ID || 'NOT SET'
      });
    } else {
      throw new Error(`Environment file not found: ${envPath}`);
    }
    
    // Change working directory
    process.chdir(botAppPath);
    
    // Add the bot's node_modules to require paths
    const botNodeModules = path.join(botAppPath, 'node_modules');
    if (fs.existsSync(botNodeModules)) {
      require('module').globalPaths.unshift(botNodeModules);
    }
    
    // Import and start the bot
    const botPath = path.join(botAppPath, 'dist', 'app.js');
    if (!fs.existsSync(botPath)) {
      throw new Error(`Bot script not found: ${botPath}`);
    }
    
    // Clear require cache to ensure fresh load
    delete require.cache[require.resolve(botPath)];
    
    // Redirect console output to the renderer
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
    
    // Load and run the bot
    botInstance = require(botPath);
    
    if (mainWindow) {
      mainWindow.webContents.send('bot-output', 'Bot loaded successfully in Electron process');
      mainWindow.webContents.send('bot-status', 'running');
    }
    
    return { success: true, message: 'Bot started successfully in Electron' };
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('bot-output', `Failed to start bot: ${error.message}`);
    }
    throw error;
  }
}

// IPC handlers for bot control
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
    if (typeof botInstance.stop === 'function') {
      await botInstance.stop();
    }
    botInstance = null;
    if (mainWindow) {
      mainWindow.webContents.send('bot-status', 'stopped');
      mainWindow.webContents.send('bot-output', 'Bot stopped');
    }
    return { success: true, message: 'Bot stopped successfully' };
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
    processExecPath: process.execPath,
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node
  };
});
