import { TradeSignal } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface TradeSignalFile {
  timestamp: string;
  signal: TradeSignal;
  status: 'pending' | 'processing' | 'executed' | 'failed';
  id: string;
  volume?: number;
}

export class FileTradeExecutor implements ITradeExecutor {
  private signalsDir: string;
  private executedDir: string;

  constructor() {
    // Create directories for trade signals
    this.signalsDir = path.join(process.cwd(), 'trade_signals');
    this.executedDir = path.join(process.cwd(), 'trade_signals', 'executed');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.signalsDir)) {
      fs.mkdirSync(this.signalsDir, { recursive: true });
      logger.info(`Created trade signals directory: ${this.signalsDir}`);
    }
    if (!fs.existsSync(this.executedDir)) {
      fs.mkdirSync(this.executedDir, { recursive: true });
      logger.info(`Created executed trades directory: ${this.executedDir}`);
    }
  }

  async initialize(): Promise<void> {
    logger.info('🔧 Initializing File-based Trade Executor...');
    
    // Test file system access
    try {
      const testFile = path.join(this.signalsDir, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      logger.info('✅ File system access confirmed');
    } catch (error) {
      throw new Error(`File system access failed: ${error}`);
    }
    
    logger.info('✅ File-based Trade executor initialized successfully');
  }

  async executeTradeSignal(signal: TradeSignal): Promise<{ success: boolean; message?: string; error?: string; signalId?: string }> {
    try {
      logger.info('💾 Writing trade signal to file:', signal);

      // Calculate position size based on risk management
      const volume = this.calculatePositionSize(signal);
      
      // Create unique signal ID
      const signalId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare trade signal file
      const tradeSignalFile: TradeSignalFile = {
        timestamp: new Date().toISOString(),
        signal: signal,
        status: 'pending',
        id: signalId,
        volume: volume
      };

      // Write to pending signals file
      const fileName = `${signalId}.json`;
      const filePath = path.join(this.signalsDir, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(tradeSignalFile, null, 2));
      
      logger.info(`✅ Trade signal written successfully to: ${fileName}`);
      logger.info(`📁 Signal ID: ${signalId}`);
      logger.info(`💰 Calculated volume: ${volume}`);
      
      return {
        success: true,
        message: `Trade signal saved to file: ${fileName}`,
        signalId: signalId
      };
      
    } catch (error) {
      logger.error('❌ Error writing trade signal to file:', error);
      return {
        success: false,
        error: `Failed to write trade signal: ${error}`
      };
    }
  }

  private calculatePositionSize(signal: TradeSignal): number {
    // Simple risk management: fixed lot size for now
    const baseVolume = config.trading.maxTradeSize;
    
    // Calculate risk based on stop loss distance
    const entryPrice = signal.action === 'BUY' ? signal.entryZone.max : signal.entryZone.min;
    const stopLossDistance = Math.abs(entryPrice - signal.stopLoss);
    
    // Adjust volume based on stop loss distance (larger SL = smaller position)
    const adjustedVolume = Math.min(baseVolume, baseVolume * (50 / stopLossDistance));
    
    return Math.round(adjustedVolume * 100) / 100; // Round to 2 decimal places
  }

  async getTradeSignalStatus(signalId: string): Promise<TradeSignalFile | null> {
    try {
      const filePath = path.join(this.signalsDir, `${signalId}.json`);
      const executedPath = path.join(this.executedDir, `${signalId}.json`);
      
      // Check pending signals first
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
      
      // Check executed signals
      if (fs.existsSync(executedPath)) {
        const content = fs.readFileSync(executedPath, 'utf8');
        return JSON.parse(content);
      }
      
      return null;
    } catch (error) {
      logger.error(`Error reading signal status for ${signalId}:`, error);
      return null;
    }
  }

  async getPendingSignals(): Promise<TradeSignalFile[]> {
    try {
      const files = fs.readdirSync(this.signalsDir).filter(f => f.endsWith('.json'));
      const signals: TradeSignalFile[] = [];
      
      for (const file of files) {
        try {
          const filePath = path.join(this.signalsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const signal = JSON.parse(content);
          if (signal.status === 'pending') {
            signals.push(signal);
          }
        } catch (error) {
          logger.warn(`Error reading signal file ${file}:`, error);
        }
      }
      
      return signals;
    } catch (error) {
      logger.error('Error getting pending signals:', error);
      return [];
    }
  }

  async closeConnection(): Promise<void> {
    logger.info('📁 File-based trade executor - no connection to close');
  }
}
