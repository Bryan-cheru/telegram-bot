import MetaApi, { MetatraderAccount } from 'metaapi.cloud-sdk';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal, TradeResult, TradeAction, MetaTraderTradeResponse, OrderType } from '../types';
import { logger } from '../utils/logger';
import { OrderTypeDetector, OrderTypeDecision } from '../utils/orderTypeDetector';
import { config } from '../utils/config';

export class MetaApiTradeExecutor implements ITradeExecutor {
  private api: MetaApi;
  private account: MetatraderAccount | null = null;
  private connection: any = null;
  private connectionAttempts = 0;
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds

  constructor() {
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      throw new Error('METAAPI_TOKEN environment variable is required');
    }
    
    // Initialize MetaApi with minimal configuration - revert to original working version
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

      // Skip synchronization to avoid subscription timeout errors
      logger.info('🔄 MetaAPI connection established, skipping sync to avoid subscription errors...');

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
      
      // Check if streaming connection is established and terminal state is available
      const terminalState = this.connection.terminalState;
      if (!terminalState) return false;
      
      // Check if we're connected to broker and have basic terminal state
      if (terminalState.connected && terminalState.connectedToBroker) {
        return true;
      }
      
      // Fallback: try to get account info via terminal state
      const accountInfo = terminalState.accountInformation;
      return !!accountInfo;
      
    } catch (error) {
      logger.warn('Connection check failed:', error);
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

      // Check market status and server time
      const now = new Date();
      const serverTime = terminalState.accountInformation?.time || now;
      logger.info('🕐 Server Time Check:', {
        localTime: now.toISOString(),
        serverTime: serverTime instanceof Date ? serverTime.toISOString() : serverTime,
        terminalConnected: terminalState.connected,
        brokerConnected: terminalState.connectedToBroker
      });

      // Check if we can get current price for the symbol (indicates market is open)
      let symbolPrice = null;
      try {
        symbolPrice = terminalState.price(signal.symbol);
        logger.info('💹 Symbol Price Check:', {
          symbol: signal.symbol,
          price: symbolPrice,
          bid: symbolPrice?.bid,
          ask: symbolPrice?.ask
        });
      } catch (error) {
        logger.warn('⚠️ Could not get symbol price, market might be closed or symbol not available');
      }

      logger.info('🚀 Executing trade via MetaAPI:', {
        symbol: signal.symbol,
        action: signal.action,
        targets: signal.targets.length,
        synchronized: terminalState.connected && terminalState.connectedToBroker,
        symbolPriceAvailable: !!symbolPrice
      });

      // Check market status before trading
      const marketStatus = await this.checkMarketStatus(signal.symbol);
      logger.info('🕐 Market Status Check:', {
        symbol: signal.symbol,
        isOpen: marketStatus.isOpen,
        reason: marketStatus.reason
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

      // Get symbol specification from terminal state or use defaults
      let symbolSpec;
      try {
        const terminalState = this.connection.terminalState;
        symbolSpec = terminalState.specification(signal.symbol);
        
        if (!symbolSpec) {
          // Fallback to RPC connection for symbol specification
          const rpcConnection = this.account?.getRPCConnection();
          if (rpcConnection) {
            await rpcConnection.connect();
            await rpcConnection.waitSynchronized();
            symbolSpec = await rpcConnection.getSymbolSpecification(signal.symbol);
            await rpcConnection.close();
          }
        }
      } catch (error: any) {
        logger.warn('Could not get symbol specification, using defaults:', error.message);
        symbolSpec = null;
      }

      const minVolume = symbolSpec?.minVolume || 0.01;
      const volumeStep = symbolSpec?.volumeStep || 0.01;
      
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
        
        // Get symbol-specific minimum stop level requirements
        const getMinStopLevel = (symbol: string): number => {
          const symbolType = symbol.toUpperCase();
          
          // Gold and precious metals (larger minimum distances)
          if (symbolType.includes('XAU') || symbolType.includes('GOLD')) return 30.0;
          if (symbolType.includes('XAG') || symbolType.includes('SILVER')) return 20.0;
          
          // Major indices (moderate distances)  
          if (symbolType.includes('NAS100') || symbolType.includes('SPX500')) return 10.0;
          if (symbolType.includes('US30') || symbolType.includes('DJ30')) return 50.0;
          
          // Forex majors (small distances in pips)
          if (symbolType.includes('JPY')) return 0.10;   // 10 points for JPY pairs
          if (symbolType.includes('USD') || symbolType.includes('EUR') || symbolType.includes('GBP')) return 0.0015; // 15 pips
          
          // Default fallback
          return 1.0;
        };

        const minStopLevel = getMinStopLevel(signal.symbol);
        const distanceToTarget = Math.abs(signal.stopLoss - target);
        
        // Get current market price to validate stop levels
        let currentPrice = null;
        try {
          const priceData = terminalState.price(signal.symbol);
          currentPrice = signal.action === 'BUY' ? priceData?.ask : priceData?.bid;
          
          // Enhanced logging to debug price issues
          logger.info(`💱 Current ${signal.symbol} price for ${signal.action}:`);
          logger.info(`   📊 Raw price data:`, priceData);
          logger.info(`   📊 Bid: ${priceData?.bid}`);
          logger.info(`   📊 Ask: ${priceData?.ask}`);
          logger.info(`   📊 Using Price (${signal.action}): ${currentPrice}`);
          logger.info(`   📊 Price Available: ${!!priceData}`);
          
        } catch (error) {
          logger.warn('Could not get current market price for stop validation:', error);
        }
        
        // Validate stop levels against current market price if available
        if (currentPrice) {
          const slDistanceFromMarket = Math.abs(signal.stopLoss - currentPrice);
          const tpDistanceFromMarket = Math.abs(target - currentPrice);
          
          // Check if stops are too close to current market price
          let adjustmentNeeded = false;
          
          if (slDistanceFromMarket < minStopLevel) {
            logger.warn(`⚠️ Stop loss too close to current market price for ${signal.symbol}`, {
              stopLoss: signal.stopLoss,
              currentPrice: currentPrice,
              distance: slDistanceFromMarket,
              required: minStopLevel
            });
            adjustmentNeeded = true;
          }
          
          if (tpDistanceFromMarket < minStopLevel) {
            logger.warn(`⚠️ Take profit too close to current market price for ${signal.symbol}`, {
              target: target,
              currentPrice: currentPrice,
              distance: tpDistanceFromMarket,
              required: minStopLevel
            });
            adjustmentNeeded = true;
          }
          
          // If market has moved significantly, consider using LIMIT order instead
          const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
          const marketMovement = Math.abs(currentPrice - entryMid);
          
          if (adjustmentNeeded && marketMovement > minStopLevel * 0.5) {
            logger.info(`🎯 Market moved significantly (${marketMovement} points). Attempting LIMIT order instead of MARKET order.`);
            
            // Try LIMIT order at entry zone instead of market order
            try {
              let result;
              const limitPrice = signal.action === 'BUY' ? signal.entryZone.min : signal.entryZone.max;
              
              if (signal.action === 'BUY') {
                result = await this.connection.createLimitBuyOrder(
                  signal.symbol,
                  volumePerTarget,
                  limitPrice,
                  signal.stopLoss,
                  target,
                  {
                    comment: `TelegramBot-Limit-${Date.now()}`,
                    magic: 123456
                  }
                );
              } else {
                result = await this.connection.createLimitSellOrder(
                  signal.symbol,
                  volumePerTarget,
                  limitPrice,
                  signal.stopLoss,
                  target,
                  {
                    comment: `TelegramBot-Limit-${Date.now()}`,
                    magic: 123456
                  }
                );
              }
              
              results.push(result);
              logger.info(`✅ LIMIT order placed successfully for target ${i + 1}:`, {
                orderId: result.orderId,
                limitPrice: limitPrice,
                volume: volumePerTarget,
                target: target
              });
              continue;
              
            } catch (limitError: any) {
              logger.warn(`Failed to place LIMIT order, skipping target ${i + 1}:`, limitError.message);
              results.push({ 
                numericCode: 10016,
                stringCode: 'TRADE_RETCODE_INVALID_STOPS',
                message: `Market moved too far from entry zone. LIMIT order failed: ${limitError.message}`,
                error: 'Market conditions unsuitable for immediate execution'
              });
              continue;
            }
          } else if (adjustmentNeeded) {
            // If minor adjustment needed, skip this target
            results.push({ 
              numericCode: 10016,
              stringCode: 'TRADE_RETCODE_INVALID_STOPS',
              message: `Stops too close to current price (SL: ${slDistanceFromMarket}, TP: ${tpDistanceFromMarket} vs required: ${minStopLevel})`,
              error: 'Stops violate broker minimum distance requirements'
            });
            continue;
          }
        }
        
        // Secondary check: SL to TP distance (fallback validation)
        if (distanceToTarget < minStopLevel) {
          logger.warn(`⚠️ Skipping target ${i + 1}: Stop loss too close to target`, {
            target: target,
            stopLoss: signal.stopLoss,
            distance: distanceToTarget,
            required: minStopLevel,
            symbol: signal.symbol
          });
          results.push({ 
            numericCode: 10016,
            stringCode: 'TRADE_RETCODE_INVALID_STOPS',
            message: `SL-TP distance too small (${distanceToTarget} < ${minStopLevel})`,
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
            volume: volumePerTarget,
            numericCode: error?.numericCode
          });

          // Special handling for market closed error
          if (errorMessage.includes('Market is closed') || stringCode.includes('MARKET_CLOSED')) {
            logger.warn('🕐 Market Closed - Detailed Analysis:', {
              symbol: signal.symbol,
              errorCode: stringCode,
              numericCode: error?.numericCode,
              localTime: new Date().toLocaleString(),
              utcTime: new Date().toISOString()
            });
            
            // Get current market status
            try {
              const currentMarketStatus = await this.checkMarketStatus(signal.symbol);
              logger.info('📊 Current Market Status:', {
                isOpen: currentMarketStatus.isOpen,
                reason: currentMarketStatus.reason,
                serverTime: currentMarketStatus.serverTime,
                lastPrice: currentMarketStatus.price
              });
            } catch (statusError) {
              logger.warn('Could not check market status:', statusError);
            }
            
            // Provide helpful message based on current time
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
            const hour = now.getUTCHours();
            
            let helpfulMessage = 'Market is closed. ';
            if (dayOfWeek === 0 && hour < 22) {
              helpfulMessage += `Forex markets open Sunday 5 PM EST (22 UTC). Current time: ${hour} UTC.`;
            } else if (dayOfWeek === 6) {
              helpfulMessage += 'Markets closed on Saturday. Will reopen Sunday 5 PM EST.';
            } else if (dayOfWeek === 5 && hour >= 22) {
              helpfulMessage += 'Markets closed Friday 5 PM EST. Will reopen Sunday 5 PM EST.';
            } else {
              helpfulMessage += 'Check if there are holidays or broker-specific trading hours.';
            }
            
            logger.info('💡 Trading Schedule Info:', helpfulMessage);
          }
          
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

  async checkMarketStatus(symbol: string): Promise<{
    isOpen: boolean;
    serverTime: string;
    price?: any;
    specification?: any;
    reason?: string;
  }> {
    try {
      if (!this.connection) {
        return {
          isOpen: false,
          serverTime: new Date().toISOString(),
          reason: 'Not connected to MetaAPI'
        };
      }

      const terminalState = this.connection.terminalState;
      const serverTime = terminalState.accountInformation?.time || new Date();
      
      // Check if we can get current price (indicates market is open)
      let price = null;
      let specification = null;
      
      try {
        price = terminalState.price(symbol);
        specification = terminalState.specification(symbol);
      } catch (error) {
        // Price not available might mean market closed
      }

      const isOpen = !!(price && price.bid && price.ask);
      
      logger.info('🕐 Market Status Check:', {
        symbol: symbol,
        isOpen: isOpen,
        serverTime: serverTime instanceof Date ? serverTime.toISOString() : serverTime,
        priceAvailable: !!price,
        specificationAvailable: !!specification
      });

      return {
        isOpen: isOpen,
        serverTime: serverTime instanceof Date ? serverTime.toISOString() : serverTime,
        price: price,
        specification: specification,
        reason: isOpen ? 'Market open - price available' : 'Market closed - no price available'
      };

    } catch (error: any) {
      logger.error('Error checking market status:', error);
      return {
        isOpen: false,
        serverTime: new Date().toISOString(),
        reason: `Error checking market: ${error.message}`
      };
    }
  }

  /**
   * Execute market order (immediate execution)
   */
  private async executeMarketOrder(signal: TradeSignal, volume: number, target: number): Promise<any> {
    logger.info('📈 Executing MARKET order:', {
      symbol: signal.symbol,
      action: signal.action,
      volume,
      target
    });

    if (signal.action === 'BUY') {
      return await this.connection.createMarketBuyOrder(
        signal.symbol,
        volume,
        signal.stopLoss,
        target,
        {
          comment: `TelegramBot-MARKET-${Date.now()}`,
          magic: 123456
        }
      );
    } else {
      return await this.connection.createMarketSellOrder(
        signal.symbol,
        volume,
        signal.stopLoss,
        target,
        {
          comment: `TelegramBot-MARKET-${Date.now()}`,
          magic: 123456
        }
      );
    }
  }

  /**
   * Execute limit order (entry at specific price)
   */
  private async executeLimitOrder(signal: TradeSignal, volume: number, target: number): Promise<any> {
    if (!signal.entryPrice) {
      throw new Error('Entry price required for limit orders');
    }

    logger.info('🎯 Executing LIMIT order:', {
      symbol: signal.symbol,
      action: signal.action,
      volume,
      entryPrice: signal.entryPrice,
      target
    });

    if (signal.action === 'BUY') {
      return await this.connection.createLimitBuyOrder(
        signal.symbol,
        volume,
        signal.entryPrice,
        signal.stopLoss,
        target,
        {
          comment: `TelegramBot-LIMIT-${Date.now()}`,
          magic: 123456,
          expirationType: 'ORDER_TIME_SPECIFIED',
          expirationTime: signal.expirationTime
        }
      );
    } else {
      return await this.connection.createLimitSellOrder(
        signal.symbol,
        volume,
        signal.entryPrice,
        signal.stopLoss,
        target,
        {
          comment: `TelegramBot-LIMIT-${Date.now()}`,
          magic: 123456,
          expirationType: 'ORDER_TIME_SPECIFIED',
          expirationTime: signal.expirationTime
        }
      );
    }
  }

  /**
   * Execute pending order (stop/stop limit orders)
   */
  private async executePendingOrder(signal: TradeSignal, volume: number, target: number): Promise<any> {
    if (!signal.entryPrice) {
      throw new Error('Entry price required for pending orders');
    }

    logger.info('⏰ Executing PENDING order:', {
      symbol: signal.symbol,
      action: signal.action,
      volume,
      entryPrice: signal.entryPrice,
      target
    });

    // Determine if this should be a stop or limit order based on current market price
    try {
      const symbolPrice = this.connection.terminalState.price(signal.symbol);
      const currentPrice = signal.action === 'BUY' ? symbolPrice.ask : symbolPrice.bid;
      
      if (signal.action === 'BUY') {
        // Buy stop if entry price > current price, buy limit if entry price < current price
        if (signal.entryPrice > currentPrice) {
          return await this.connection.createStopBuyOrder(
            signal.symbol,
            volume,
            signal.entryPrice,
            signal.stopLoss,
            target,
            {
              comment: `TelegramBot-STOP-${Date.now()}`,
              magic: 123456,
              expirationType: 'ORDER_TIME_SPECIFIED',
              expirationTime: signal.expirationTime
            }
          );
        } else {
          return await this.executeLimitOrder(signal, volume, target);
        }
      } else {
        // Sell stop if entry price < current price, sell limit if entry price > current price
        if (signal.entryPrice < currentPrice) {
          return await this.connection.createStopSellOrder(
            signal.symbol,
            volume,
            signal.entryPrice,
            signal.stopLoss,
            target,
            {
              comment: `TelegramBot-STOP-${Date.now()}`,
              magic: 123456,
              expirationType: 'ORDER_TIME_SPECIFIED',
              expirationTime: signal.expirationTime
            }
          );
        } else {
          return await this.executeLimitOrder(signal, volume, target);
        }
      }
    } catch (error) {
      logger.warn('Could not get current price for pending order logic, using limit order');
      return await this.executeLimitOrder(signal, volume, target);
    }
  }

  /**
   * Get pip value for different symbol types
   */
  private getPipValue(symbol: string): number {
    if (symbol.includes('JPY')) {
      return 0.01; // JPY pairs have 2 decimal places
    } else if (symbol.includes('XAU') || symbol.includes('GOLD')) {
      return 0.1; // Gold typically trades with 1 decimal
    } else if (symbol.includes('XAG') || symbol.includes('SILVER')) {
      return 0.01; // Silver typically trades with 2 decimals
    } else {
      return 0.0001; // Standard forex pairs have 4 decimal places
    }
  }
}
