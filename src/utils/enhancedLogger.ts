import { createLogger, format, transports } from 'winston';
import * as path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Enhanced logger with structured output and proper error handling
export const structuredLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      // Critical financial operations get special formatting
      const msgStr = String(message || '');
      const isCritical = level === 'error' || msgStr.includes('TRADE') || msgStr.includes('METAAPI');
      const prefix = isCritical ? '🚨 CRITICAL' : '';
      
      return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        message: `${prefix} ${msgStr}`,
        ...meta,
        pid: process.pid,
        memory: process.memoryUsage().heapUsed
      });
    })
  ),
  transports: [
    // Console output with colors for development
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),
    
    // File logging for production debugging
    new transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    
    // All logs file
    new transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    
    // Critical trading operations - separate file
    new transports.File({ 
      filename: path.join(logsDir, 'trading.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          // Only log trading-related messages
          const msgStr = String(message || '');
          if (msgStr.includes('TRADE') || msgStr.includes('ORDER') || msgStr.includes('POSITION')) {
            return JSON.stringify({
              timestamp,
              level,
              message: msgStr,
              ...meta
            });
          }
          return '';
        })
      )
    })
  ],
  
  // Handle logging errors gracefully
  exceptionHandlers: [
    new transports.File({ filename: path.join(logsDir, 'exceptions.log') })
  ],
  
  rejectionHandlers: [
    new transports.File({ filename: path.join(logsDir, 'rejections.log') })
  ]
});

// Export a wrapper that matches existing logger interface
export const enhancedLogger = {
  info: (message: string, meta?: any) => structuredLogger.info(message, meta),
  warn: (message: string, meta?: any) => structuredLogger.warn(message, meta),
  error: (message: string, meta?: any) => structuredLogger.error(message, meta),
  debug: (message: string, meta?: any) => structuredLogger.debug(message, meta),
  
  // Special methods for trading operations
  trade: (message: string, meta?: any) => structuredLogger.info(`TRADE: ${message}`, meta),
  order: (message: string, meta?: any) => structuredLogger.info(`ORDER: ${message}`, meta),
  position: (message: string, meta?: any) => structuredLogger.info(`POSITION: ${message}`, meta),
  
  // Circuit breaker logging
  circuitBreaker: (message: string, meta?: any) => structuredLogger.error(`CIRCUIT_BREAKER: ${message}`, meta),
  
  // Memory and performance monitoring
  performance: (message: string, meta?: any) => {
    const memUsage = process.memoryUsage();
    structuredLogger.info(`PERFORMANCE: ${message}`, {
      ...meta,
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      uptime: process.uptime()
    });
  }
};
