import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal, TradeResult, MetaTraderTradeResponse } from '../types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export class EnhancedMetaApiTradeExecutor implements ITradeExecutor {
  private metaApiExecutor: any; // Your existing MetaAPI executor
  private mt5CommunicationPath: string;
  private orderManagerEnabled: boolean;

  constructor() {
    this.mt5CommunicationPath = path.join(process.cwd(), 'MT5_Files', 'MQL5', 'Files', 'telegram_bot');
    this.orderManagerEnabled = process.env.ENABLE_MT5_ORDER_MANAGER === 'true';
    
    // Create communication directory if it doesn't exist
    if (!fs.existsSync(this.mt5CommunicationPath)) {
      fs.mkdirSync(this.mt5CommunicationPath, { recursive: true });
    }
    
    logger.info('🔗 Enhanced MetaAPI Executor initialized');
    logger.info(`📁 MT5 Communication Path: ${this.mt5CommunicationPath}`);
    logger.info(`🤖 Order Manager: ${this.orderManagerEnabled ? 'Enabled' : 'Disabled'}`);
  }

  async initialize(): Promise<void> {
    // Initialize MetaAPI connection (existing code)
    // ... your existing MetaAPI initialization
    
    if (this.orderManagerEnabled) {
      await this.setupMT5Communication();
    }
  }

  async executeTradeSignal(signal: TradeSignal): Promise<TradeResult> {
    try {
      logger.info('🚀 Executing enhanced trade with MT5 order management:', {
        symbol: signal.symbol,
        action: signal.action,
        targets: signal.targets.length,
        orderManager: this.orderManagerEnabled
      });

      // Execute via MetaAPI (your existing logic)
      const metaApiResult = await this.executeViaMetaAPI(signal);
      
      if (metaApiResult.success && this.orderManagerEnabled) {
        // Send trade info to MT5 EA for enhanced management
        await this.notifyMT5OrderManager(signal, metaApiResult);
      }

      return metaApiResult;

    } catch (error) {
      logger.error('❌ Enhanced trade execution failed:', error);
      throw error;
    }
  }

  private async executeViaMetaAPI(signal: TradeSignal): Promise<TradeResult> {
    // Your existing MetaAPI execution logic here
    // This would be the same code from your current MetaApiTradeExecutor
    
    // For now, return a mock result - replace with your actual MetaAPI code
    return {
      success: true,
      message: 'Trades executed via MetaAPI',
      details: {
        symbol: signal.symbol,
        action: signal.action,
        successfulTrades: signal.targets.length,
        totalTrades: signal.targets.length
      }
    };
  }

  private async setupMT5Communication(): Promise<void> {
    logger.info('🔧 Setting up MT5 communication bridge...');
    
    // Create communication files
    const configFile = path.join(this.mt5CommunicationPath, 'config.txt');
    const statusFile = path.join(this.mt5CommunicationPath, 'status.txt');
    
    // Write initial configuration
    const config = {
      magic_number: 123456,
      trailing_stop: true,
      break_even: true,
      partial_close: true,
      risk_percentage: parseFloat(process.env.RISK_PERCENTAGE || '2'),
      max_trade_size: parseFloat(process.env.MAX_TRADE_SIZE || '0.1'),
      last_updated: new Date().toISOString()
    };
    
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    fs.writeFileSync(statusFile, JSON.stringify({ status: 'initialized', timestamp: Date.now() }));
    
    logger.info('✅ MT5 communication bridge established');
  }

  private async notifyMT5OrderManager(signal: TradeSignal, result: TradeResult): Promise<void> {
    if (!this.orderManagerEnabled) return;

    try {
      const tradeInstruction = {
        timestamp: Date.now(),
        signal_id: `signal_${Date.now()}`,
        symbol: signal.symbol,
        action: signal.action,
        entry_zone: signal.entryZone,
        stop_loss: signal.stopLoss,
        targets: signal.targets,
        volume: result.details?.volume || 0,
        order_ids: result.details?.orderIds || [],
        management_rules: {
          trailing_stop: true,
          break_even: true,
          partial_close_at_targets: true,
          risk_reward_optimization: true
        }
      };

      const instructionFile = path.join(
        this.mt5CommunicationPath, 
        `trade_instruction_${tradeInstruction.signal_id}.json`
      );

      fs.writeFileSync(instructionFile, JSON.stringify(tradeInstruction, null, 2));
      
      logger.info('📨 Trade instruction sent to MT5 Order Manager:', {
        signal_id: tradeInstruction.signal_id,
        symbol: signal.symbol,
        targets: signal.targets.length
      });

    } catch (error) {
      logger.error('❌ Failed to notify MT5 Order Manager:', error);
    }
  }

  async getOrderManagerStatus(): Promise<any> {
    if (!this.orderManagerEnabled) {
      return { status: 'disabled' };
    }

    try {
      const statusFile = path.join(this.mt5CommunicationPath, 'status.txt');
      const logFile = path.join(this.mt5CommunicationPath, 'order_manager_log.txt');
      
      let status = { status: 'unknown' };
      let logs: string[] = [];

      if (fs.existsSync(statusFile)) {
        status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      }

      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf8');
        logs = logContent.split('\n').slice(-10); // Last 10 log entries
      }

      return {
        ...status,
        recent_logs: logs,
        communication_path: this.mt5CommunicationPath
      };

    } catch (error) {
      logger.error('❌ Failed to get order manager status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error: errorMessage };
    }
  }

  async getActiveOrders(): Promise<any[]> {
    try {
      const ordersFile = path.join(this.mt5CommunicationPath, 'active_orders.json');
      
      if (fs.existsSync(ordersFile)) {
        const ordersData = fs.readFileSync(ordersFile, 'utf8');
        return JSON.parse(ordersData);
      }

      return [];
    } catch (error) {
      logger.error('❌ Failed to get active orders:', error);
      return [];
    }
  }

  async closeConnection(): Promise<void> {
    // Close MetaAPI connection (existing code)
    // ... your existing cleanup code
    
    if (this.orderManagerEnabled) {
      // Notify MT5 EA that connection is closing
      const statusFile = path.join(this.mt5CommunicationPath, 'status.txt');
      fs.writeFileSync(statusFile, JSON.stringify({ 
        status: 'disconnected', 
        timestamp: Date.now() 
      }));
    }
    
    logger.info('🔌 Enhanced MetaAPI connection closed');
  }
}
