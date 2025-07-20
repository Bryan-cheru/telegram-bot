import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal, TradeResult, MetaTraderTradeResponse } from '../types';
import { logger } from '../utils/logger';

export class TestTradeExecutor implements ITradeExecutor {
  private isConnected = false;
  private ticketCounter = 2000;
  
  // Simulate realistic XAUUSD price
  private getCurrentPrice(symbol: string): number {
    const basePrices: { [key: string]: number } = {
      'XAUUSD': 2650.00,
      'EURUSD': 1.0850,
      'GBPUSD': 1.2750,
      'USDJPY': 150.00
    };
    
    // Add small random fluctuation
    const basePrice = basePrices[symbol] || 100.00;
    const fluctuation = (Math.random() - 0.5) * (basePrice * 0.001); // 0.1% fluctuation
    return Math.round((basePrice + fluctuation) * 100) / 100;
  }

  async initialize(): Promise<void> {
    logger.info('🧪 Initializing Test Trade Executor (MetaAPI Simulation)');
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.isConnected = true;
    logger.info('✅ Test MetaAPI connection established');
  }

  async closeConnection(): Promise<void> {
    this.isConnected = false;
    logger.info('🔌 Test MetaAPI connection closed');
  }

  async executeTradeSignal(signal: TradeSignal): Promise<TradeResult> {
    try {
      if (!this.isConnected) {
        throw new Error('Test MetaAPI not connected');
      }

      logger.info('🚀 Executing trade via Test MetaAPI:', {
        symbol: signal.symbol,
        action: signal.action,
        targets: signal.targets.length
      });

      // Simulate getting account info
      const accountInfo = {
        balance: 10000.00,
        currency: 'USD',
        leverage: 100
      };
      
      // Calculate position sizing
      const riskAmount = accountInfo.balance * (parseFloat(process.env.RISK_PERCENTAGE || '1') / 100);
      const maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE || '0.01');
      
      // Ensure minimum volume
      let volume = Math.max(0.01, Math.min(maxTradeSize, riskAmount / 1000));
      volume = Math.round(volume * 100) / 100;

      const volumePerTarget = Math.max(0.01, Math.round((volume / signal.targets.length) * 100) / 100);
      const currentPrice = this.getCurrentPrice(signal.symbol);

      const responses: MetaTraderTradeResponse[] = [];
      let successfulTrades = 0;

      // Execute trades for each target
      for (let i = 0; i < signal.targets.length; i++) {
        const target = signal.targets[i];
        
        // Simulate trade execution delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Simulate 95% success rate (occasionally fail to test error handling)
        const isSuccessful = Math.random() > 0.05;
        
        if (isSuccessful) {
          const orderId = (++this.ticketCounter).toString();
          
          const response: MetaTraderTradeResponse = {
            numericCode: 10009, // TRADE_RETCODE_DONE
            stringCode: 'TRADE_RETCODE_DONE',
            message: 'Request completed',
            orderId: orderId,
            positionId: this.ticketCounter
          };
          
          responses.push(response);
          successfulTrades++;
          
          logger.info(`✅ Test trade ${i + 1}/${signal.targets.length} executed:`, {
            orderId: orderId,
            volume: volumePerTarget,
            target: target,
            currentPrice: currentPrice
          });

          // Detailed trade log
          logger.info('📊 Simulated MetaAPI Order Details:', {
            ticket: orderId,
            symbol: signal.symbol,
            action: signal.action,
            volume: volumePerTarget,
            openPrice: currentPrice,
            stopLoss: signal.stopLoss,
            takeProfit: target,
            comment: `TestBot-${Date.now()}-TP${i + 1}`
          });

        } else {
          // Simulate occasional failures
          const response: MetaTraderTradeResponse & { error?: string } = {
            numericCode: 10006, // TRADE_RETCODE_REJECT
            stringCode: 'TRADE_RETCODE_REJECT',
            message: 'Request rejected (simulated)',
            error: 'Simulated rejection for testing'
          };
          
          responses.push(response);
          logger.warn(`⚠️ Test trade ${i + 1} rejected (simulated):`, response.message);
        }
      }

      // Calculate profit/loss potential
      const priceDiff = Math.abs(currentPrice - signal.targets[signal.targets.length - 1]);
      const potentialProfit = priceDiff * volumePerTarget * 100; // Simplified calculation
      const potentialLoss = Math.abs(currentPrice - signal.stopLoss) * volumePerTarget * 100;
      const riskReward = potentialLoss > 0 ? (potentialProfit / potentialLoss) : 0;

      logger.info('📈 Test Trade Analysis:', {
        currentPrice: currentPrice,
        potentialProfit: `$${potentialProfit.toFixed(2)}`,
        potentialLoss: `$${potentialLoss.toFixed(2)}`,
        riskReward: `1:${riskReward.toFixed(2)}`
      });

      if (successfulTrades > 0) {
        return {
          success: true,
          message: `${successfulTrades}/${signal.targets.length} test trades executed successfully`,
          details: {
            symbol: signal.symbol,
            action: signal.action,
            volume: volume,
            volumePerTarget: volumePerTarget,
            successfulTrades: successfulTrades,
            totalTrades: signal.targets.length,
            orderIds: responses.filter(r => r.orderId).map(r => r.orderId!),
            responses: responses
          }
        };
      } else {
        throw new Error(`All test trades failed (simulated)`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Test trade execution failed:', error);
      
      return {
        success: false,
        message: `Test trade execution failed: ${errorMessage}`,
        details: {
          symbol: signal.symbol,
          action: signal.action,
          error: errorMessage
        }
      };
    }
  }

  // Additional methods for testing
  async getAccountInfo(): Promise<any> {
    return {
      balance: 10000.00,
      equity: 10050.00,
      currency: 'USD',
      leverage: 100,
      server: 'TestServer-Demo',
      name: 'Test Account'
    };
  }

  async getOpenPositions(): Promise<any[]> {
    // Return some mock positions
    return [
      {
        id: '123456',
        symbol: 'XAUUSD',
        type: 'POSITION_TYPE_SELL',
        volume: 0.01,
        openPrice: 2650.00,
        currentPrice: this.getCurrentPrice('XAUUSD'),
        profit: Math.random() * 100 - 50 // Random profit/loss
      }
    ];
  }

  async closePosition(positionId: string): Promise<boolean> {
    logger.info('🔄 Closing test position:', positionId);
    await new Promise(resolve => setTimeout(resolve, 500));
    logger.info('✅ Test position closed successfully');
    return true;
  }
}
