import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

interface TradingState {
  dailyTrades: number;
  dailyLoss: number;
  currentDrawdown: number;
  lastTradeTime: string; // ISO string
  circuitBreakerStates: Record<string, {
    failures: number;
    lastFailure: string;
    isOpen: boolean;
  }>;
  validatedSymbols: Record<string, {
    symbol: string;
    timestamp: string;
    broker: string;
  }>;
}

interface DatabaseEntry {
  timestamp: string;
  type: 'TRADE' | 'STATE' | 'ERROR' | 'POSITION';
  data: any;
  accountId?: string;
  symbol?: string;
}

/**
 * CRITICAL: File-based persistence for state recovery after crashes
 * Prevents loss of trading state, circuit breaker status, and position tracking
 */
export class CrashRecoveryDatabase {
  private static instance: CrashRecoveryDatabase;
  private dataDir: string;
  private stateFile: string;
  private tradesFile: string;
  private errorsFile: string;
  private backupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.stateFile = path.join(this.dataDir, 'trading-state.json');
    this.tradesFile = path.join(this.dataDir, 'trades.jsonl'); // JSON Lines format
    this.errorsFile = path.join(this.dataDir, 'errors.jsonl');
    
    this.ensureDataDirectory();
    this.startAutoBackup();
  }

  static getInstance(): CrashRecoveryDatabase {
    if (!CrashRecoveryDatabase.instance) {
      CrashRecoveryDatabase.instance = new CrashRecoveryDatabase();
    }
    return CrashRecoveryDatabase.instance;
  }

  /**
   * CRITICAL: Save current trading state to prevent data loss
   */
  saveTradingState(state: {
    dailyTrades: number;
    dailyLoss: number;
    currentDrawdown: number;
    lastTradeTime: Date;
    circuitBreakerStates?: Map<string, any>;
    validatedSymbols?: Map<string, any>;
  }): void {
    try {
      const stateToSave: TradingState = {
        dailyTrades: state.dailyTrades,
        dailyLoss: state.dailyLoss,
        currentDrawdown: state.currentDrawdown,
        lastTradeTime: state.lastTradeTime.toISOString(),
        circuitBreakerStates: this.mapToObject(state.circuitBreakerStates || new Map()),
        validatedSymbols: this.mapToObject(state.validatedSymbols || new Map())
      };

      const stateWithMetadata = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        state: stateToSave
      };

      fs.writeFileSync(this.stateFile, JSON.stringify(stateWithMetadata, null, 2));
      
      logger.performance('Trading state saved to disk', {
        dailyTrades: state.dailyTrades,
        currentDrawdown: state.currentDrawdown,
        file: this.stateFile
      });

    } catch (error) {
      logger.error('🚨 CRITICAL: Failed to save trading state', error);
    }
  }

  /**
   * CRITICAL: Recover trading state after crash/restart
   */
  recoverTradingState(): {
    success: boolean;
    state?: TradingState;
    lastBackup?: Date;
    warnings: string[];
  } {
    const warnings: string[] = [];
    
    try {
      if (!fs.existsSync(this.stateFile)) {
        return {
          success: false,
          warnings: ['No previous state file found - starting with clean state']
        };
      }

      const fileContent = fs.readFileSync(this.stateFile, 'utf8');
      const savedData = JSON.parse(fileContent);
      
      // Validate file format
      if (!savedData.state || !savedData.timestamp) {
        warnings.push('Invalid state file format - starting fresh');
        return { success: false, warnings };
      }

      // Check if state is recent (within 24 hours)
      const lastSave = new Date(savedData.timestamp);
      const ageHours = (Date.now() - lastSave.getTime()) / (1000 * 60 * 60);
      
      if (ageHours > 24) {
        warnings.push(`State file is ${ageHours.toFixed(1)} hours old - may be stale`);
      }

      // Check if daily counters should be reset (new day)
      const lastTradeTime = new Date(savedData.state.lastTradeTime);
      const isNewDay = this.isNewTradingDay(lastTradeTime);
      
      if (isNewDay) {
        savedData.state.dailyTrades = 0;
        savedData.state.dailyLoss = 0;
        warnings.push('New trading day detected - reset daily counters');
      }

      logger.info('✅ Trading state recovered from disk', {
        lastSave: lastSave.toISOString(),
        ageHours: ageHours.toFixed(2),
        dailyTrades: savedData.state.dailyTrades,
        currentDrawdown: savedData.state.currentDrawdown
      });

      return {
        success: true,
        state: savedData.state,
        lastBackup: lastSave,
        warnings
      };

    } catch (error) {
      logger.error('❌ Failed to recover trading state', error);
      return {
        success: false,
        warnings: [`State recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * CRITICAL: Log trade execution for audit trail
   */
  logTradeExecution(trade: {
    accountId: string;
    symbol: string;
    action: string;
    volume: number;
    entryPrice?: number;
    stopLoss?: number;
    targets?: number[];
    orderId?: string;
    positionId?: string;
    success: boolean;
    error?: string;
  }): void {
    try {
      const entry: DatabaseEntry = {
        timestamp: new Date().toISOString(),
        type: 'TRADE',
        accountId: trade.accountId,
        symbol: trade.symbol,
        data: trade
      };

      this.appendToFile(this.tradesFile, entry);
      logger.trade('Trade execution logged', trade);

    } catch (error) {
      logger.error('Failed to log trade execution', error);
    }
  }

  /**
   * CRITICAL: Log system errors for debugging
   */
  logSystemError(error: {
    type: 'CONNECTION' | 'VALIDATION' | 'EXECUTION' | 'OCR' | 'CIRCUIT_BREAKER';
    message: string;
    details?: any;
    accountId?: string;
    symbol?: string;
  }): void {
    try {
      const entry: DatabaseEntry = {
        timestamp: new Date().toISOString(),
        type: 'ERROR',
        accountId: error.accountId,
        symbol: error.symbol,
        data: {
          errorType: error.type,
          message: error.message,
          details: error.details,
          stack: error.details?.stack,
          pid: process.pid,
          memoryUsage: process.memoryUsage()
        }
      };

      this.appendToFile(this.errorsFile, entry);
      logger.circuitBreaker('System error logged', error);

    } catch (logError) {
      // Last resort - console log if file logging fails
      console.error('🚨 CRITICAL: Failed to log system error:', logError);
      console.error('Original error was:', error);
    }
  }

  /**
   * Get recent trades for analysis
   */
  getRecentTrades(hoursBack: number = 24): DatabaseEntry[] {
    try {
      if (!fs.existsSync(this.tradesFile)) {
        return [];
      }

      const content = fs.readFileSync(this.tradesFile, 'utf8');
      const lines = content.trim().split('\n');
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const recentTrades = lines
        .map(line => {
          try {
            return JSON.parse(line) as DatabaseEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is DatabaseEntry => 
          entry !== null && 
          entry.type === 'TRADE' &&
          new Date(entry.timestamp) > cutoffTime
        );

      return recentTrades;

    } catch (error) {
      logger.error('Failed to get recent trades', error);
      return [];
    }
  }

  /**
   * Get error patterns for analysis
   */
  getErrorPatterns(hoursBack: number = 24): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    errorsByAccount: Record<string, number>;
    errorsBySymbol: Record<string, number>;
    recentErrors: DatabaseEntry[];
  } {
    try {
      if (!fs.existsSync(this.errorsFile)) {
        return {
          totalErrors: 0,
          errorsByType: {},
          errorsByAccount: {},
          errorsBySymbol: {},
          recentErrors: []
        };
      }

      const content = fs.readFileSync(this.errorsFile, 'utf8');
      const lines = content.trim().split('\n');
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      const recentErrors = lines
        .map(line => {
          try {
            return JSON.parse(line) as DatabaseEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is DatabaseEntry => 
          entry !== null && 
          entry.type === 'ERROR' &&
          new Date(entry.timestamp) > cutoffTime
        );

      const errorsByType: Record<string, number> = {};
      const errorsByAccount: Record<string, number> = {};
      const errorsBySymbol: Record<string, number> = {};

      recentErrors.forEach(error => {
        const errorType = error.data.errorType || 'UNKNOWN';
        errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

        if (error.accountId) {
          errorsByAccount[error.accountId] = (errorsByAccount[error.accountId] || 0) + 1;
        }

        if (error.symbol) {
          errorsBySymbol[error.symbol] = (errorsBySymbol[error.symbol] || 0) + 1;
        }
      });

      return {
        totalErrors: recentErrors.length,
        errorsByType,
        errorsByAccount,
        errorsBySymbol,
        recentErrors
      };

    } catch (error) {
      logger.error('Failed to analyze error patterns', error);
      return {
        totalErrors: 0,
        errorsByType: {},
        errorsByAccount: {},
        errorsBySymbol: {},
        recentErrors: []
      };
    }
  }

  /**
   * Clean up old data files
   */
  cleanup(daysToKeep: number = 30): void {
    try {
      const cutoffTime = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      
      // Clean trades file
      this.cleanFile(this.tradesFile, cutoffTime);
      
      // Clean errors file  
      this.cleanFile(this.errorsFile, cutoffTime);
      
      logger.info('Database cleanup completed', { daysToKeep });

    } catch (error) {
      logger.error('Database cleanup failed', error);
    }
  }

  /**
   * Export data for analysis
   */
  exportData(outputDir: string): void {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Copy current files with timestamps
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      if (fs.existsSync(this.stateFile)) {
        fs.copyFileSync(this.stateFile, path.join(outputDir, `state-${timestamp}.json`));
      }
      
      if (fs.existsSync(this.tradesFile)) {
        fs.copyFileSync(this.tradesFile, path.join(outputDir, `trades-${timestamp}.jsonl`));
      }
      
      if (fs.existsSync(this.errorsFile)) {
        fs.copyFileSync(this.errorsFile, path.join(outputDir, `errors-${timestamp}.jsonl`));
      }

      logger.info('Data export completed', { outputDir, timestamp });

    } catch (error) {
      logger.error('Data export failed', error);
    }
  }

  /**
   * Private helper methods
   */
  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger.info('Created data directory', { path: this.dataDir });
    }
  }

  private startAutoBackup(): void {
    // Auto-save every 5 minutes
    this.backupInterval = setInterval(() => {
      // This will be called by the trading system to save current state
      logger.debug('Auto-backup interval triggered');
    }, 5 * 60 * 1000);
  }

  private appendToFile(filePath: string, entry: DatabaseEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(filePath, line);
  }

  private mapToObject(map: Map<string, any>): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  private isNewTradingDay(lastTradeTime: Date): boolean {
    const now = new Date();
    const lastTrade = new Date(lastTradeTime);
    
    // Consider it a new day if date is different (ignoring time)
    return (
      now.getFullYear() !== lastTrade.getFullYear() ||
      now.getMonth() !== lastTrade.getMonth() ||
      now.getDate() !== lastTrade.getDate()
    );
  }

  private cleanFile(filePath: string, cutoffTime: Date): void {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    
    const recentLines = lines.filter(line => {
      try {
        const entry = JSON.parse(line);
        return new Date(entry.timestamp) > cutoffTime;
      } catch {
        return false; // Remove corrupted lines
      }
    });

    fs.writeFileSync(filePath, recentLines.join('\n') + '\n');
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
    logger.info('Database shutdown completed');
  }
}
