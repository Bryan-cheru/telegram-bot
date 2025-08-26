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

      // Get Streaming connection (recommended for trading)
      this.connection = this.account.getStreamingConnection();
      await this.connection.connect();

      // Wait for synchronization - CRITICAL for trading
      logger.info('🔄 Synchronizing with terminal...');
      await this.connection.waitSynchronized();

      logger.info('✅ MetaAPI connected successfully!');
      return true;

    } catch (error: any) {
      // Handle specific MetaAPI errors
      if (error?.details) {
        if (error.details.code === 'E_SRV_NOT_FOUND') {
          logger.error('❌ Server file not found. Check server name or use provisioning profile.');
        } else if (error.details === 'E_AUTH') {
          logger.error('❌ Authentication failed. Check login and password.');
        } else if (error.details === 'E_SERVER_TIMEZONE') {
          logger.error('❌ Server timezone detection failed. Try again later.');
        } else if (error.details.code === 'E_RESOURCE_SLOTS') {
          logger.error('❌ Insufficient resource slots for account.');
        }
      }
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

      // Use streaming connection's terminal state for account info
      const terminalState = this.connection.terminalState;
      
      // Wait for terminal state to be synchronized
      if (!terminalState.connected || !terminalState.connectedToBroker) {
        logger.warn('Terminal state not fully synchronized, getting account info via RPC...');
        // Fallback to RPC connection for account info
        const rpcConnection = this.account?.getRPCConnection();
        if (rpcConnection) {
          await rpcConnection.connect();
          await rpcConnection.waitSynchronized();
          const accountInfo = await rpcConnection.getAccountInformation();
          await rpcConnection.close();
          return accountInfo;
        }
      }

      const accountInfo = terminalState.accountInformation;
      
      if (accountInfo) {
        logger.info('💰 Account Info:', {
          balance: accountInfo.balance,
          equity: accountInfo.equity,
          margin: accountInfo.margin,
          freeMargin: accountInfo.freeMargin,
          currency: accountInfo.currency
        });
      }

      return accountInfo;
    } catch (error: any) {
      logger.error('Error getting account info:', error);
      throw error;
    }
  }

  async executeTrade(signal: TradeSignal): Promise<TradeResult> {
    try {
      if (!this.connection) {
        throw new Error('Not connected to MetaAPI');
      }

      // Ensure terminal state is synchronized before trading
      const terminalState = this.connection.terminalState;
      if (!terminalState.connected || !terminalState.connectedToBroker) {
        logger.warn('⚠️ Terminal not fully synchronized, waiting...');
        await this.connection.waitSynchronized();
      }

      logger.info('🚀 Executing trade via MetaAPI:', {
        symbol: signal.symbol,
        action: signal.action,
        targets: signal.targets.length,
        synchronized: terminalState.connected && terminalState.connectedToBroker
      });

      // Get account info for position sizing
      const accountInfo = await this.getAccountInfo();
      
      // Calculate position size based on risk
      const riskAmount = accountInfo.balance * (parseFloat(process.env.RISK_PERCENTAGE || '2') / 100);
      const maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE || '0.1');
      
      // Calculate lot size with proper minimum volume
      let volume = Math.min(maxTradeSize, riskAmount / 1000);
      volume = Math.max(0.01, Math.round(volume * 100) / 100); // Ensure minimum 0.01 lots

      // If multiple targets, split volume but ensure each is at least 0.01
      let volumePerTarget = Math.max(0.01, Math.round((volume / signal.targets.length) * 100) / 100);
      
      logger.info('📊 Volume calculation:', {
        balance: accountInfo.balance,
        riskAmount: riskAmount,
        totalVolume: volume,
        volumePerTarget: volumePerTarget,
        targets: signal.targets.length
      });

      // Get symbol specification to validate volume
      const symbolSpec = await this.connection.getSymbolSpecification(signal.symbol);
      const minVolume = symbolSpec.minVolume || 0.01;
      const volumeStep = symbolSpec.volumeStep || 0.01;
      
      // Adjust volume to meet symbol requirements
      volumePerTarget = Math.max(minVolume, volumePerTarget);
      volumePerTarget = Math.round(volumePerTarget / volumeStep) * volumeStep;
      
      logger.info('📋 Symbol specification:', {
        symbol: signal.symbol,
        minVolume: minVolume,
        volumeStep: volumeStep,
        adjustedVolumePerTarget: volumePerTarget
      });

      const results: (MetaTraderTradeResponse & { error?: string })[] = [];
      
      // Execute trades for each target
      for (let i = 0; i < signal.targets.length; i++) {
        const target = signal.targets[i];
        
        // Check if stop loss is too close to target (minimum 10 points for forex)
        const minDistance = 0.0010; // 10 points for EURUSD
        const distanceToTarget = Math.abs(signal.stopLoss - target);
        
        if (distanceToTarget < minDistance) {
          logger.warn(`⚠️ Skipping target ${i + 1}: Stop loss too close to target`, {
            target: target,
            stopLoss: signal.stopLoss,
            distance: distanceToTarget,
            required: minDistance
          });
          results.push({ 
            numericCode: 10016,
            stringCode: 'TRADE_RETCODE_INVALID_STOPS',
            message: `Stop loss too close to target ${i + 1}`,
            error: 'Stop loss too close to target'
          });
          continue;
        }
        
        try {
          let result;
          
          if (signal.action === 'BUY') {
            // Market Buy Order - MetaAPI standard format
            result = await this.connection.createMarketBuyOrder(
              signal.symbol,
              volumePerTarget,
              signal.stopLoss,
              target,
              {
                comment: `TelegramBot-${Date.now()}`,
                magic: 123456
              }
            );
          } else {
            // Market Sell Order - MetaAPI standard format
            result = await this.connection.createMarketSellOrder(
              signal.symbol,
              volumePerTarget,
              signal.stopLoss,
              target,
              {
                comment: `TelegramBot-${Date.now()}`,
                magic: 123456
              }
            );
          }

          results.push(result);
          
          logger.info(`✅ Trade ${i + 1}/${signal.targets.length} executed:`, {
            orderId: result.orderId,
            stringCode: result.stringCode,
            volume: volumePerTarget,
            target: target
          });

        } catch (error: any) {
          const errorMessage = error?.message || 'Unknown error';
          const stringCode = error?.stringCode || 'ERROR';
          
          logger.error(`❌ Failed to execute trade ${i + 1}:`, {
            error: errorMessage,
            stringCode: stringCode,
            symbol: signal.symbol,
            volume: volumePerTarget
          });
          
          results.push({ 
            numericCode: error?.numericCode || -1,
            stringCode: stringCode,
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

      // Use streaming connection's terminal state for positions
      const terminalState = this.connection.terminalState;
      
      if (terminalState.connected && terminalState.connectedToBroker) {
        return terminalState.positions || [];
      } else {
        // Fallback to RPC connection
        logger.warn('Using RPC fallback for positions...');
        const rpcConnection = this.account?.getRPCConnection();
        if (rpcConnection) {
          await rpcConnection.connect();
          await rpcConnection.waitSynchronized();
          const positions = await rpcConnection.getPositions();
          await rpcConnection.close();
          return positions;
        }
      }

      return [];
    } catch (error: any) {
      logger.error('Error getting open positions:', error);
      return [];
    }
  }

  async closePosition(positionId: string): Promise<boolean> {
    try {
      if (!this.connection) {
        throw new Error('Not connected to MetaAPI');
      }

      // Use streaming connection for position closing
      const result = await this.connection.closePosition(positionId);
      logger.info('✅ Position closed:', {
        positionId: positionId,
        resultCode: result.stringCode
      });
      return true;
    } catch (error: any) {
      logger.error('❌ Error closing position:', {
        positionId: positionId,
        error: error.message,
        stringCode: error.stringCode
      });
      return false;
    }
  }
}
