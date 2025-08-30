const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
ipcMain.handle('get-debug-info', async () => {
  const botAppPath = isDev ? appPath : path.join(appPath, 'app.asar.unpacked');
  const botScriptPath = path.join(botAppPath, 'dist', 'app.js');
  const envPath = path.join(botAppPath, '.env');
  
  // Check for Node.js executable options
  let nodeCommand = 'node';
  let nodeExists = false;
  if (!isDev) {
    const bundledNodePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist', 'node.exe');
    const electronNodePath = process.execPath.replace('electron.exe', 'node.exe');
    
    if (fs.existsSync(bundledNodePath)) {
      nodeCommand = bundledNodePath;
      nodeExists = true;
    } else if (fs.existsSync(electronNodePath)) {
      nodeCommand = electronNodePath;
      nodeExists = true;
    }
  } else {
    nodeExists = true; // Assume node is available in development
  }
  
  return {
    isDev,
    appPath,
    botAppPath,
    botScriptPath,
    envPath,
    botScriptExists: fs.existsSync(botScriptPath),
    envExists: fs.existsSync(envPath),
    isPackaged: app.isPackaged,
    nodeCommand,
    nodeExists,
    processExecPath: process.execPath,
    resourcesPath: process.resourcesPath
  };
});
let botProcess = null;

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
    if (botProcess) {
      botProcess.kill();
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

// IPC handlers for bot control
ipcMain.handle('start-bot', async () => {
  if (botProcess) {
    return { success: false, message: 'Bot is already running' };
  }

  try {
    // Determine the correct paths for production vs development
    const botAppPath = isDev ? appPath : path.join(appPath, 'app.asar.unpacked');
    const botScriptPath = path.join(botAppPath, 'dist', 'app.js');
    const envPath = path.join(botAppPath, '.env');
    
    // Check if required files exist
    if (!fs.existsSync(botScriptPath)) {
      return { success: false, message: `Bot script not found at: ${botScriptPath}` };
    }
    
    if (!fs.existsSync(envPath)) {
      return { success: false, message: `Environment file not found at: ${envPath}. Please ensure .env file is included.` };
    }

    // Set up environment for the bot process
    const env = { ...process.env };
    
    // For production, use the bundled Node.js executable
    let nodeCommand = 'node';
    if (!isDev) {
      // Try to find the bundled Node.js executable
      const bundledNodePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist', 'node.exe');
      if (fs.existsSync(bundledNodePath)) {
        nodeCommand = bundledNodePath;
      } else {
        // Fallback: use the Node.js that came with Electron
        nodeCommand = process.execPath.replace('electron.exe', 'node.exe');
        if (!fs.existsSync(nodeCommand)) {
          // Last resort: try to use system node
          nodeCommand = 'node';
        }
      }
    }
    
    // Start the bot process with proper working directory
    botProcess = spawn(nodeCommand, [botScriptPath], {
      cwd: botAppPath,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true // Hide console window on Windows
    });

    let output = '';
    
    botProcess.stdout.on('data', (data) => {
      output += data.toString();
      // Send output to renderer
      if (mainWindow) {
        mainWindow.webContents.send('bot-output', data.toString());
      }
    });

    botProcess.stderr.on('data', (data) => {
      output += data.toString();
      // Send error output to renderer
      if (mainWindow) {
        mainWindow.webContents.send('bot-output', data.toString());
      }
    });

    botProcess.on('close', (code) => {
      botProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('bot-status', 'stopped');
        mainWindow.webContents.send('bot-output', `Bot process exited with code: ${code}`);
      }
    });

    botProcess.on('error', (error) => {
      if (mainWindow) {
        mainWindow.webContents.send('bot-output', `Error starting bot: ${error.message}`);
      }
    });

    return { success: true, message: 'Bot started successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('stop-bot', async () => {
  if (!botProcess) {
    return { success: false, message: 'Bot is not running' };
  }

  try {
    botProcess.kill();
    botProcess = null;
    return { success: true, message: 'Bot stopped successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-bot-status', async () => {
  return { running: botProcess !== null };
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
    isPackaged: app.isPackaged
  };
});
