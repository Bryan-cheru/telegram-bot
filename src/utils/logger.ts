import winston from 'winston';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from './config';

// Dashboard integration - store logs in memory for web display
export const dashboardLogs: Array<{
  timestamp: string;
  level: string;
  message: string;
  service: string;
  metadata?: any;
}> = [];

const MAX_DASHBOARD_LOGS = 1000; // Keep last 1000 logs for web dashboard

// Create logs directory in user data folder
const getLogsDirectory = (): string => {
  // For packaged apps, use user data directory
  let logsDir: string;
  
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // Portable version - use same directory as executable
    logsDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'logs');
  } else if (process.platform === 'win32') {
    // Windows - use AppData
    logsDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Telegram Trading Bot', 'logs');
  } else {
    // Other platforms
    logsDir = path.join(os.homedir(), '.telegram-trading-bot', 'logs');
  }
  
  // Create directory if it doesn't exist
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    // If we can't create in user data, fallback to temp
    console.warn('Could not create logs directory in user data, using temp:', error);
    logsDir = path.join(os.tmpdir(), 'telegram-trading-bot-logs');
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  return logsDir;
};

const logsDirectory = getLogsDirectory();

// Custom format for dashboard integration (clean, no ANSI codes)
const dashboardFormat = winston.format.printf(({ timestamp, level, message, service, ...metadata }) => {
  // Store in memory for dashboard - clean message without ANSI codes
  const logEntry = {
    timestamp: String(timestamp || new Date().toISOString()),
    level: String(level),
    message: String(message), // This will be clean since colorize hasn't been applied yet
    service: String(service || 'telegram-trading-bot'),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined
  };
  
  dashboardLogs.push(logEntry);
  
  // Keep only last MAX_DASHBOARD_LOGS entries
  if (dashboardLogs.length > MAX_DASHBOARD_LOGS) {
    dashboardLogs.shift();
  }
  
  // Return formatted string for console (will be colorized later)
  return `${timestamp} [${level.toUpperCase()}] ${message}`;
});

// Separate format for console output (with colors)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}] ${message}`;
  })
);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    dashboardFormat // Apply dashboard format first (before colorization)
  ),
  defaultMeta: { service: 'telegram-trading-bot' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDirectory, 'error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDirectory, 'combined.log')
    }),
    new winston.transports.Console({
      format: consoleFormat // Use separate colorized format for console
    })
  ]
});

// Export logs directory for other modules
export { logsDirectory };
