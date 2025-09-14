import MetaApi, { MetatraderAccount } from 'metaapi.cloud-sdk';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal, TradeResult, TradeAction, MetaTraderTradeResponse, OrderType } from '../types';
import { logger } from '../utils/logger';
import { OrderTypeDetector, OrderTypeDecision } from '../utils/orderTypeDetector';
import { config } from '../utils/config';
import { SmartMarketOverrideML, MarketOverrideDecision } from '../ml/tradingML';

export class MetaApiTradeExecutor implements ITradeExecutor {
  private api: MetaApi;
  private account: MetatraderAccount | null = null;
  private connection: any = null;
  private connectionAttempts = 0;
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds
  private lastLoggedAccountInfo: any = null;

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

      // IMPORTANT: Wait for synchronization as per MetaAPI docs
      logger.info('🔄 Waiting for terminal synchronization...');
      await this.connection.waitSynchronized();

      logger.info('✅ MetaAPI connected and synchronized successfully!');
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

  private hasSignificantAccountChange(newInfo: any): boolean {
    if (!this.lastLoggedAccountInfo) return true;
    if (!newInfo || !newInfo.balance || !newInfo.equity) return false;
    if (!this.lastLoggedAccountInfo.balance || !this.lastLoggedAccountInfo.equity) return true;
    
    const balanceChanged = Math.abs(newInfo.balance - this.lastLoggedAccountInfo.balance) > 10;
    const equityChanged = Math.abs(newInfo.equity - this.lastLoggedAccountInfo.equity) > 10;
    
    return balanceChanged || equityChanged;
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
        // Account info logging temporarily disabled to reduce log noise
        // Only log significant changes at debug level
        const shouldLogChange = this.hasSignificantAccountChange(accountInfo);
        
        if (shouldLogChange) {
          logger.debug('Account Info changed:', {
            balance: accountInfo.balance,
            equity: accountInfo.equity
          });
          this.lastLoggedAccountInfo = { ...accountInfo };
        }
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

      // Map parsed symbols to broker-specific CFD symbols
      const brokerSymbol = this.mapToBrokerSymbol(signal.symbol);
      if (brokerSymbol !== signal.symbol) {
        logger.info(`🔄 Symbol mapping: ${signal.symbol} → ${brokerSymbol}`);
        signal.symbol = brokerSymbol;
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

      // CRITICAL: Subscribe to market data for this symbol BEFORE trading (as per MetaAPI docs)
      try {
        logger.info(`📡 Subscribing to market data for ${signal.symbol}...`);
        await this.connection.subscribeToMarketData(signal.symbol);
        // Give MetaAPI time to sync market data
        await new Promise(resolve => setTimeout(resolve, 2000));
        logger.info(`✅ Market data subscription complete for ${signal.symbol}`);
      } catch (subscriptionError) {
        logger.warn(`⚠️ Market data subscription failed for ${signal.symbol}:`, subscriptionError);
        // Continue anyway - let FTMO handle it
      }

      // Check market status before trading
      const marketStatus = await this.checkMarketStatus(signal.symbol);
      logger.info('🕐 Market Status Check:', {
        symbol: signal.symbol,
        isOpen: marketStatus.isOpen,
        reason: marketStatus.reason
      });

      // FTMO Override: Since FTMO worked before and has XAUUSD, be very permissive
      const currentTime = new Date();
      const dayOfWeek = currentTime.getUTCDay(); // 0=Sunday, 6=Saturday
      const isActualWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Only block on actual weekends, let FTMO handle the rest
      if (!marketStatus.isOpen && isActualWeekend) {
        throw new Error(`Market is closed: ${marketStatus.reason}`);
      } else if (!marketStatus.isOpen) {
        // Weekday but market status unclear - let FTMO decide
        logger.warn(`⚠️ Market status unclear (${marketStatus.reason}), but it's a weekday - letting FTMO handle it`);
      }

      // Get account info for position sizing
      const accountInfo = await this.getAccountInfo();
      
      // Declare variables outside the conditional blocks
      let volume: number;
      let volumePerTarget: number;
      let riskAmount: number;
      
      // Safety check for account info
      if (!accountInfo || !accountInfo.balance) {
        logger.warn('⚠️ Account info not available, using fallback values');
        const fallbackBalance = 10000; // Default fallback balance
        
        // Calculate position size with fallback
        riskAmount = fallbackBalance * (parseFloat(process.env.RISK_PERCENTAGE || '1.3') / 100);
        const maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE || '0.1');
        
        // Calculate lot size with proper minimum volume
        volume = Math.min(maxTradeSize, riskAmount / 1000);
        volume = Math.max(0.01, Math.round(volume * 100) / 100);
        
        volumePerTarget = Math.max(0.01, Math.round((volume / signal.targets.length) * 100) / 100);
        
        logger.info('📊 Volume calculation (fallback):', {
          fallbackBalance,
          riskAmount: riskAmount,
          totalVolume: volume,
          volumePerTarget: volumePerTarget,
          targets: signal.targets.length
        });
        
      } else {
        // Calculate position size based on actual account balance
        riskAmount = accountInfo.balance * (parseFloat(process.env.RISK_PERCENTAGE || '1.3') / 100);
        const maxTradeSize = parseFloat(process.env.MAX_TRADE_SIZE || '0.1');
        
        // Calculate lot size with proper minimum volume
        volume = Math.min(maxTradeSize, riskAmount / 1000);
        volume = Math.max(0.01, Math.round(volume * 100) / 100); // Ensure minimum 0.01 lots

        // If multiple targets, split volume but ensure each is at least 0.01
        volumePerTarget = Math.max(0.01, Math.round((volume / signal.targets.length) * 100) / 100);
        
        logger.info('📊 Volume calculation:', {
          balance: accountInfo.balance,
          riskAmount: riskAmount,
          totalVolume: volume,
          volumePerTarget: volumePerTarget,
          targets: signal.targets.length
        });
      }

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
            logger.warn('🕐 Market Closed - Server Error Detected:', {
              symbol: signal.symbol,
              errorCode: stringCode,
              numericCode: error?.numericCode,
              localTime: new Date().toLocaleString(),
              utcTime: new Date().toISOString()
            });
            
            // Get current market status with our improved logic
            try {
              const currentMarketStatus = await this.checkMarketStatus(signal.symbol);
              logger.info('📊 Our Market Status Analysis:', {
                isOpen: currentMarketStatus.isOpen,
                reason: currentMarketStatus.reason,
                serverTime: currentMarketStatus.serverTime,
                lastPrice: currentMarketStatus.price
              });
              
              // SMART ML MARKET OVERRIDE: Use ML to analyze if we should override server error
              if (currentMarketStatus.isOpen) {
                const now = new Date();
                const symbolPrice = await this.connection.getSymbolPrice(signal.symbol).catch((error: any) => {
                  logger.error(`Failed to get symbol price for ${signal.symbol}:`, error);
                  return null;
                });
                const spread = symbolPrice ? Math.abs(symbolPrice.ask - symbolPrice.bid) : undefined;
                
                const overrideDecision: MarketOverrideDecision = SmartMarketOverrideML.analyzeMarketConflict(
                  'CLOSED', // Server says closed
                  now,
                  signal.symbol,
                  !!symbolPrice, // Price data available
                  spread
                );
                
                logger.info('🤖 Smart Market Override ML Analysis:', {
                  shouldOverride: overrideDecision.shouldOverride,
                  confidence: `${(overrideDecision.confidence * 100).toFixed(1)}%`,
                  reasoning: overrideDecision.reason,
                  suggestedAction: overrideDecision.suggestedAction
                });
                
                if (overrideDecision.shouldOverride && overrideDecision.confidence > 0.9) {
                  logger.warn('� ML OVERRIDE: Attempting to proceed despite server "Market Closed" error');
                  logger.warn(`📊 Confidence: ${(overrideDecision.confidence * 100).toFixed(1)}% - ${overrideDecision.reason}`);
                  
                  // In future versions, could attempt to retry the trade here
                  // For now, log the decision for analysis
                  logger.info('🔮 Future Enhancement: Could retry trade with ML override logic');
                } else {
                  logger.warn('⛔ ML Override declined - server error stands');
                }
              }
              
            } catch (statusError) {
              logger.warn('Could not check market status:', statusError);
            }
            
            // Provide helpful message based on current time
            const now = new Date();
            const dayOfWeek = now.getUTCDay(); // 0=Sunday, 6=Saturday
            const hour = now.getUTCHours();
            const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
            
            let helpfulMessage = '';
            if (dayOfWeek === 0 && hour < 21) {
              helpfulMessage = `Forex markets open Sunday 9 PM UTC. Current: ${dayName} ${hour}:${now.getUTCMinutes().toString().padStart(2,'0')} UTC.`;
            } else if (dayOfWeek === 6) {
              helpfulMessage = 'Markets closed on Saturday. Will reopen Sunday 9 PM UTC.';
            } else if (dayOfWeek === 5 && hour >= 21) {
              helpfulMessage = 'Markets closed Friday 9 PM UTC. Will reopen Sunday 9 PM UTC.';
            } else {
              // Should be trading hours!
              helpfulMessage = `🔥 UNEXPECTED: It's ${dayName} ${hour}:${now.getUTCMinutes().toString().padStart(2,'0')} UTC - markets should be OPEN! This is likely a demo account limitation.`;
            }
            
            logger.info('💡 Trading Schedule Analysis:', helpfulMessage);
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
      
      // First, ensure we're subscribed to market data for this symbol
      try {
        await this.connection.subscribeToMarketData(symbol);
        // Wait a bit for market data to arrive
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.log('Market data subscription attempt:', error);
      }
      
      // Check if we can get current price and specification
      let price = null;
      let specification = null;
      
      try {
        price = terminalState.price(symbol);
        specification = terminalState.specification(symbol);
      } catch (error) {
        // Price/spec not available - could be market closed or not subscribed
        console.log('Price/specification access error:', error);
      }

      // For Monday (market should be open), be more lenient
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const hourUTC = now.getUTCHours();
      const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];
      
      logger.info(`🕐 Current UTC time: ${dayName} ${hourUTC}:${now.getUTCMinutes().toString().padStart(2,'0')}`);
      
      // Forex markets:
      // Close: Friday 21:00 UTC (5:00 PM EST)
      // Open: Sunday 21:00 UTC (Monday 00:00 AEDT Sydney)
      // So Monday 20:58 UTC should definitely be open!
      
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
      
      // Market is definitely closed only during weekend gap:
      // Saturday all day, Sunday before 21:00 UTC
      const isActualWeekendClosure = (dayOfWeek === 6) || (dayOfWeek === 0 && hourUTC < 21);
      
      // If we have valid price data, market is definitely open
      const hasValidPrice = !!(price && price.bid && price.ask && price.bid > 0 && price.ask > 0);
      
      let isOpen: boolean;
      let reason: string;
      
      if (hasValidPrice) {
        isOpen = true;
        reason = 'Market open - valid price data available';
      } else if (isActualWeekendClosure) {
        isOpen = false;
        reason = `Market closed - weekend closure (${dayName} ${hourUTC}:${now.getUTCMinutes().toString().padStart(2,'0')} UTC)`;
      } else {
        // Weekday during trading hours but no price data - likely a connection/sync issue
        // Monday 20:58 UTC should definitely be OPEN!
        isOpen = true; // Assume open to allow trading attempt
        reason = `Market OPEN - ${dayName} during trading hours (price data may be delayed)`;
      }
      
      logger.info('🕐 Market Status Check:', {
        symbol: symbol,
        dayOfWeek: dayOfWeek,
        dayName: dayName,
        hourUTC: hourUTC,
        isOpen: isOpen,
        hasValidPrice: hasValidPrice,
        isActualWeekendClosure: isActualWeekendClosure,
        serverTime: serverTime instanceof Date ? serverTime.toISOString() : serverTime,
        priceAvailable: !!price,
        bidAsk: price ? `${price.bid}/${price.ask}` : 'N/A',
        reason: reason
      });

      return {
        isOpen: isOpen,
        serverTime: serverTime instanceof Date ? serverTime.toISOString() : serverTime,
        price: price,
        specification: specification,
        reason: reason
      };

    } catch (error: any) {
      logger.error('Error checking market status:', error);
      // On error during trading hours, assume market is open
      const now = new Date();
      const dayOfWeek = now.getDay();
      const isLikelyTradingHours = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
      
      return {
        isOpen: isLikelyTradingHours, // Assume open if it's a weekday
        serverTime: new Date().toISOString(),
        reason: `Error checking market: ${error.message} (assuming ${isLikelyTradingHours ? 'open' : 'closed'} based on day)`
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
   * Map parsed symbols to broker-specific CFD symbols
   * Based on common FTMO/broker symbol naming conventions
   */
  private mapToBrokerSymbol(parsedSymbol: string): string {
    const upperSymbol = parsedSymbol.toUpperCase();
    
    // Handle Silver CFDs - FTMO typically uses "SILVER" for Silver CFDs
    if (upperSymbol.includes('XAG') || upperSymbol === 'SILVER') {
      return 'SILVER'; // FTMO Silver CFD symbol
    }
    
    // Handle Gold CFDs - usually XAUUSD works as-is
    if (upperSymbol.includes('XAU') || upperSymbol === 'GOLD') {
      return 'XAUUSD';
    }
    
    // Handle other common CFD mappings
    if (upperSymbol === 'US30') {
      return 'US30'; // Dow Jones CFD
    }
    
    if (upperSymbol === 'NAS100') {
      return 'NAS100'; // NASDAQ CFD  
    }
    
    if (upperSymbol === 'SPX500') {
      return 'SPX500'; // S&P 500 CFD
    }
    
    // For Forex pairs, return as-is (they usually match)
    return parsedSymbol;
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
