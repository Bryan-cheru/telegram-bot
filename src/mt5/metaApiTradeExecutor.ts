import MetaApi, { MetatraderAccount } from 'metaapi.cloud-sdk';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal, TradeResult, TradeAction, MetaTraderTradeResponse } from '../types';
import { logger } from '../utils/logger';

export class MetaApiTradeExecutor implements ITradeExecutor {
  private api: MetaApi;
  private account: MetatraderAccount | null = null;
  private connection: any = null;

  constructor() {
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      throw new Error('METAAPI_TOKEN environment variable is required');
    }
    this.api = new MetaApi(token);
  }

  async initialize(): Promise<void> {
    const connected = await this.connect();
    if (!connected) {
      throw new Error('Failed to initialize MetaAPI connection');
    }
  }

  async closeConnection(): Promise<void> {
    await this.disconnect();
  }

  async executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: number;
    signalId?: string;
  }> {
    try {
      const result = await this.executeTrade(signal);
      
      return {
        success: result.success,
        message: result.message,
        error: result.success ? undefined : result.message,
        signalId: `metaapi-${Date.now()}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Trade execution failed'
      };
    }
  }

  async connect(): Promise<boolean> {
    try {
      const accountId = process.env.METAAPI_ACCOUNT_ID;
      if (!accountId) {
        throw new Error('METAAPI_ACCOUNT_ID environment variable is required');
      }

      logger.info('🌐 Connecting to MetaAPI...');
      
      // Get account
      this.account = await this.api.metatraderAccountApi.getAccount(accountId);
      
      // Check if account is deployed
      if (!this.account.state || this.account.state === 'UNDEPLOYED') {
        logger.info('📦 Deploying MetaTrader account...');
        await this.account.deploy();
      }

      // Wait for deployment
      logger.info('⏳ Waiting for account deployment...');
      await this.account.waitDeployed();

      // Wait for connection
      logger.info('🔗 Waiting for broker connection...');
      await this.account.waitConnected();

      // Get RPC connection
      this.connection = this.account.getRPCConnection();
      await this.connection.connect();

      // Wait for synchronization
      logger.info('🔄 Synchronizing with terminal...');
      await this.connection.waitSynchronized();

      logger.info('✅ MetaAPI connected successfully!');
      return true;

    } catch (error) {
      logger.error('❌ Failed to connect to MetaAPI:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      logger.info('🔌 Disconnected from MetaAPI');
    } catch (error) {
      logger.error('Error disconnecting from MetaAPI:', error);
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      if (!this.connection) return false;
      
      // Try to get account info to test connection
      await this.connection.getAccountInformation();
      return true;
    } catch (error) {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      if (!this.connection) {
        throw new Error('Not connected to MetaAPI');
      }

      const accountInfo = await this.connection.getAccountInformation();
      logger.info('💰 Account Info:', {
        balance: accountInfo.balance,
        equity: accountInfo.equity,
        margin: accountInfo.margin,
        freeMargin: accountInfo.freeMargin,
        currency: accountInfo.currency
      });

      return accountInfo;
    } catch (error) {
      logger.error('Error getting account info:', error);
      throw error;
    }
  }

  async executeTrade(signal: TradeSignal): Promise<TradeResult> {
    try {
      if (!this.connection) {
        throw new Error('Not connected to MetaAPI');
      }

      logger.info('🚀 Executing trade via MetaAPI:', {
        symbol: signal.symbol,
        action: signal.action,
        targets: signal.targets.length
      });

      // Get account info for position sizing
      const accountInfo = await this.getAccountInfo();
      
      // Calculate position size based on risk
      const riskAmount = accountInfo.balance * (parseFloat(process.env.RISK_PERCENTAGE || '2') / 100);
      const maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE || '0.1');
      
      // Calculate lot size (simplified calculation)
      let volume = Math.min(maxTradeSize, riskAmount / 1000);
      volume = Math.round(volume * 100) / 100; // Round to 2 decimal places

      // If multiple targets, split volume
      const volumePerTarget = Math.round((volume / signal.targets.length) * 100) / 100;

      const results: (MetaTraderTradeResponse & { error?: string })[] = [];
      
      // Execute trades for each target
      for (let i = 0; i < signal.targets.length; i++) {
        const target = signal.targets[i];
        
        try {
          let result;
          
          if (signal.action === 'BUY') {
            // Market Buy Order
            result = await this.connection.createMarketBuyOrder(
              signal.symbol,
              volumePerTarget,
              signal.stopLoss,
              target,
              {
                comment: `Bot-${Date.now()}-TP${i + 1}`,
                magic: 123456
              }
            );
          } else {
            // Market Sell Order
            result = await this.connection.createMarketSellOrder(
              signal.symbol,
              volumePerTarget,
              signal.stopLoss,
              target,
              {
                comment: `Bot-${Date.now()}-TP${i + 1}`,
                magic: 123456
              }
            );
          }

          results.push(result);
          
          logger.info(`✅ Trade ${i + 1}/${signal.targets.length} executed:`, {
            orderId: result.orderId,
            volume: volumePerTarget,
            target: target
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`❌ Failed to execute trade ${i + 1}:`, error);
          results.push({ 
            numericCode: -1,
            stringCode: 'ERROR',
            message: errorMessage,
            error: errorMessage
          });
        }
      }

      // Check if all trades succeeded
      const successfulTrades = results.filter(r => r.orderId && !r.error);
      const failedTrades = results.filter(r => r.error);

      if (successfulTrades.length > 0) {
        logger.info(`🎯 ${successfulTrades.length}/${signal.targets.length} trades executed successfully`);
        
        return {
          success: true,
          message: `${successfulTrades.length}/${signal.targets.length} trades executed successfully`,
          details: {
            symbol: signal.symbol,
            action: signal.action,
            volume: volume,
            volumePerTarget: volumePerTarget,
            successfulTrades: successfulTrades.length,
            totalTrades: signal.targets.length,
            orderIds: successfulTrades.map(r => r.orderId || '').filter(id => id),
            responses: results
          }
        };
      } else {
        throw new Error(`All trades failed. Errors: ${failedTrades.map(t => t.error).join(', ')}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Trade execution failed:', error);
      
      return {
        success: false,
        message: `Trade execution failed: ${errorMessage}`,
        details: {
          symbol: signal.symbol,
          action: signal.action,
          error: errorMessage
        }
      };
    }
  }

  async getOpenPositions(): Promise<any[]> {
    try {
      if (!this.connection) {
        throw new Error('Not connected to MetaAPI');
      }

      const positions = await this.connection.getPositions();
      return positions;
    } catch (error) {
      logger.error('Error getting open positions:', error);
      return [];
    }
  }

  async closePosition(positionId: string): Promise<boolean> {
    try {
      if (!this.connection) {
        throw new Error('Not connected to MetaAPI');
      }

      const result = await this.connection.closePosition(positionId);
      logger.info('✅ Position closed:', result);
      return true;
    } catch (error) {
      logger.error('❌ Error closing position:', error);
      return false;
    }
  }
}
