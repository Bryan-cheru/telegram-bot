import winston from 'winston';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from './config';

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

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
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
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Export logs directory for other modules
export { logsDirectory };
