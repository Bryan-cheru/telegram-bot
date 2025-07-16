import { TradeSignal, MT5TradeRequest, MT5Response } from '../types';
import { MT5Connection } from './connection';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

export class TradeExecutor {
  private mt5Connection: MT5Connection;

  constructor() {
    this.mt5Connection = new MT5Connection();
  }

  async initialize(): Promise<void> {
    logger.info('🔧 Initializing TradeExecutor...');
    logger.info('📡 Connecting to MT5 server...');
    
    await this.mt5Connection.connect();
    
    // Test connection
    logger.info('🧪 Testing MT5 connection...');
    const isConnected = await this.mt5Connection.testConnection();
    if (!isConnected) {
      throw new Error('Failed to establish MT5 connection');
    }
    
    logger.info('✅ Trade executor initialized successfully');
  }

  async executeTradeSignal(signal: TradeSignal): Promise<MT5Response> {
    try {
      logger.info('Executing trade signal:', signal);

      // Calculate position size based on risk management
      const volume = this.calculatePositionSize(signal);
      
      // Prepare trade request
      const tradeRequest: MT5TradeRequest = {
        symbol: signal.symbol,
        action: signal.action,
        volume: volume,
        price: signal.action === 'BUY' ? signal.entryZone.max : signal.entryZone.min,
        sl: signal.stopLoss,
        tp: signal.targets[0], // Use first target as take profit
        comment: `Bot Trade - ${signal.reason || 'Auto trade'}`
      };

      // Send trade request to MT5
      const response = await this.mt5Connection.sendRequest({
        action: 'trade',
        request: tradeRequest
      });

      if (response.success) {
        logger.info(`Trade executed successfully. Ticket: ${response.ticket}`);
        
        // Set additional targets if multiple targets exist
        if (signal.targets.length > 1) {
          await this.setPartialTakeProfits(response.ticket!, signal.targets.slice(1), volume);
        }
      } else {
        logger.error('Trade execution failed:', response.error);
      }

      return response;
      
    } catch (error) {
      logger.error('Error executing trade:', error);
      throw error;
    }
  }

  private calculatePositionSize(signal: TradeSignal): number {
    // Simple risk management: fixed lot size for now
    // In production, this should calculate based on account balance and risk percentage
    const baseVolume = config.trading.maxTradeSize;
    
    // Calculate risk based on stop loss distance
    const entryPrice = signal.action === 'BUY' ? signal.entryZone.max : signal.entryZone.min;
    const stopLossDistance = Math.abs(entryPrice - signal.stopLoss);
    
    // Adjust volume based on stop loss distance (larger SL = smaller position)
    const adjustedVolume = Math.min(baseVolume, baseVolume * (50 / stopLossDistance));
    
    return Math.round(adjustedVolume * 100) / 100; // Round to 2 decimal places
  }

  private async setPartialTakeProfits(ticket: number, targets: number[], originalVolume: number): Promise<void> {
    try {
      const partialVolume = originalVolume / (targets.length + 1);
      
      for (let i = 0; i < targets.length; i++) {
        const response = await this.mt5Connection.sendRequest({
          action: 'modify_position',
          ticket: ticket,
          volume: partialVolume,
          tp: targets[i]
        });
        
        if (response.success) {
          logger.info(`Partial TP ${i + 2} set at ${targets[i]}`);
        } else {
          logger.warn(`Failed to set partial TP ${i + 2}:`, response.error);
        }
      }
    } catch (error) {
      logger.error('Error setting partial take profits:', error);
    }
  }

  async closeConnection(): Promise<void> {
    await this.mt5Connection.disconnect();
  }
}
