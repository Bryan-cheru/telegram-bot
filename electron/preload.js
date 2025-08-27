const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Bot control
  startBot: () => ipcRenderer.invoke('start-bot'),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  restartBot: () => ipcRenderer.invoke('restart-bot'),
  getBotStatus: () => ipcRenderer.invoke('get-bot-status'),
  
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Logs
  readLogs: () => ipcRenderer.invoke('read-logs'),
  
  // Event listeners
  onBotLog: (callback) => ipcRenderer.on('bot-log', callback),
  onBotStatusChanged: (callback) => ipcRenderer.on('bot-status-changed', callback),
  onShowSettings: (callback) => ipcRenderer.on('show-settings', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
