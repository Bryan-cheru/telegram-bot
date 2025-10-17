/**
 * Simplified MetaAPI Service following official documentation
 * Based on official examples from metaapi-javascript-sdk
 */

import MetaApi, { MetatraderAccount, RpcMetaApiConnectionInstance } from 'metaapi.cloud-sdk';
import { TradeSignal } from '../types';
import { logger } from '../utils/logger';

export class SimpleMetaApiService {
  private api: MetaApi;
  private connections: Map<string, RpcMetaApiConnectionInstance> = new Map();

  constructor() {
    if (!process.env.METAAPI_TOKEN) {
      throw new Error('METAAPI_TOKEN environment variable is required');
    }
    this.api = new MetaApi(process.env.METAAPI_TOKEN);
  }

  /**
   * Get connection following official MetaAPI pattern
   */
  async getConnection(accountId: string): Promise<RpcMetaApiConnectionInstance> {
    // Reuse existing connection if available
    if (this.connections.has(accountId)) {
      const connection = this.connections.get(accountId)!;
      try {
        // For RPC connections, test if connection is alive by calling a method
        await connection.getAccountInformation();
        return connection;
      } catch (error) {
        // Remove stale connection
        this.connections.delete(accountId);
      }
    }

    try {
      logger.info(`🔗 Connecting to MetaAPI account ${accountId}`);
      
      // Get account (follows official examples)
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      
      // Wait for account to be connected to broker
      logger.info('⏳ Waiting for API server to connect to broker...');
      await account.waitConnected();
      
      // Get RPC connection (standard pattern)
      const connection = account.getRPCConnection();
      
      // Connect to terminal
      logger.info('🔌 Establishing connection...');
      await connection.connect();
      
      // Wait for synchronization
      logger.info('🔄 Waiting for synchronization...');
      await connection.waitSynchronized();
      
      logger.info('✅ MetaAPI connection established and synchronized');
      
      // Store connection for reuse
      this.connections.set(accountId, connection);
      
      return connection;
      
    } catch (error) {
      logger.error(`❌ Failed to connect to MetaAPI account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Execute trade using standard MetaAPI methods
   */
  async executeTrade(signal: TradeSignal, accountId: string): Promise<{
    success: boolean;
    ticket?: string;
    message: string;
  }> {
    try {
      const connection = await this.getConnection(accountId);
      
      // Get account information
      const accountInfo = await connection.getAccountInformation();
      logger.info(`💰 Account balance: $${accountInfo.balance}`);
      
      // Calculate margin requirement (official MetaAPI method)
      const marginInfo = await connection.calculateMargin({
        symbol: signal.symbol,
        type: signal.action === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
        volume: 0.45, // Your fixed lot size
        openPrice: signal.entryPrice || 0
      });
      
      logger.info(`📊 Margin required: $${marginInfo.margin}`);
      
      // Execute trade using standard MetaAPI methods
      let result;
      
      if (signal.orderType === 'MARKET') {
        // Market order
        if (signal.action === 'BUY') {
          result = await connection.createMarketBuyOrder(
            signal.symbol,
            0.45, // Fixed lot size
            signal.stopLoss,
            signal.targets[0],
            {
              comment: 'Telegram Bot Trade',
              clientId: `TB_${signal.symbol}_${Date.now()}`
            }
          );
        } else {
          result = await connection.createMarketSellOrder(
            signal.symbol,
            0.45,
            signal.stopLoss,
            signal.targets[0],
            {
              comment: 'Telegram Bot Trade',
              clientId: `TB_${signal.symbol}_${Date.now()}`
            }
          );
        }
      } else {
        // Limit order
        if (signal.action === 'BUY') {
          result = await connection.createLimitBuyOrder(
            signal.symbol,
            0.45,
            signal.entryPrice!,
            signal.stopLoss,
            signal.targets[0],
            {
              comment: 'Telegram Bot Trade',
              clientId: `TB_${signal.symbol}_${Date.now()}`
            }
          );
        } else {
          result = await connection.createLimitSellOrder(
            signal.symbol,
            0.45,
            signal.entryPrice!,
            signal.stopLoss,
            signal.targets[0],
            {
              comment: 'Telegram Bot Trade',
              clientId: `TB_${signal.symbol}_${Date.now()}`
            }
          );
        }
      }
      
      logger.info(`✅ Trade executed successfully: ${result.stringCode}`);
      
      return {
        success: true,
        ticket: result.orderId,
        message: `Trade executed: ${result.stringCode}`
      };
      
    } catch (error: any) {
      logger.error('❌ Trade execution failed:', error);
      
      return {
        success: false,
        message: `Trade failed: ${error.message || error.stringCode || 'Unknown error'}`
      };
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo(accountId: string) {
    try {
      const connection = await this.getConnection(accountId);
      return await connection.getAccountInformation();
    } catch (error) {
      logger.error('Failed to get account info:', error);
      throw error;
    }
  }

  /**
   * Get current positions
   */
  async getPositions(accountId: string) {
    try {
      const connection = await this.getConnection(accountId);
      return await connection.getPositions();
    } catch (error) {
      logger.error('Failed to get positions:', error);
      throw error;
    }
  }

  /**
   * Close connection
   */
  async closeConnection(accountId: string) {
    if (this.connections.has(accountId)) {
      const connection = this.connections.get(accountId)!;
      await connection.close();
      this.connections.delete(accountId);
      logger.info(`🔌 Connection closed for account ${accountId}`);
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    for (const [accountId, connection] of this.connections) {
      try {
        await connection.close();
        logger.info(`🔌 Connection closed for account ${accountId}`);
      } catch (error) {
        logger.warn(`Failed to close connection for ${accountId}:`, error);
      }
    }
    this.connections.clear();
  }
}