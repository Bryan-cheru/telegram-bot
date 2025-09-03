import MetaApi, { MetatraderAccount } from 'metaapi.cloud-sdk';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { TradeSignal, TradeResult } from '../types';
import { 
  TradeHistoryFilter, 
  TradeHistoryResponse, 
  HistoricalDeal, 
  HistoricalOrder, 
  PositionHistory, 
  AccountTransaction,
  TradePerformanceMetrics 
} from '../types/tradeHistory';
import { logger } from '../utils/logger';
import { SmartMarketOverrideML } from '../ml/tradingML';
import { TradingSafetyControls } from '../utils/tradingSafetyControls';
import { AdvancedStopTakeManager } from '../utils/advancedStopTakeManagement';
import { UniversalSymbolSupport } from '../utils/universalSymbolSupport';
import { EnhancedSymbolDetector } from '../utils/enhancedSymbolDetector';

interface AccountConfig {
  id: string;
  brokerName: string;
  accountType: 'DEMO' | 'LIVE';
  connection?: any;
  account?: MetatraderAccount;
  status: 'CONNECTING' | 'CONNECTED' | 'FAILED' | 'DISCONNECTED';
}

interface MultiAccountTradeResult {
  overallSuccess: boolean;
  totalAccounts: number;
  successfulAccounts: number;
  failedAccounts: number;
  results: Array<{
    accountId: string;
    brokerName: string;
    accountType: string;
    success: boolean;
    message: string;
    error?: string;
  }>;
}

export class MultiAccountMetaApiExecutor implements ITradeExecutor {
  private api: MetaApi;
  private accounts: Map<string, AccountConfig> = new Map();
  private initialized = false;
  private safetyControls: TradingSafetyControls;
  private connectionSemaphore = 0;
  private maxConcurrentConnections = 2; // Limit concurrent connections
  private connectionRetryDelay = 5000; // 5 second delay between retries

  constructor() {
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
      throw new Error('METAAPI_TOKEN environment variable is required');
    }
    
    // Configure MetaAPI options for better connection management
    this.api = new MetaApi(token, {
      application: 'TelegramTradingBot',
      requestTimeout: 60000, // 60 second timeout
      connectTimeout: 60000, // 60 second connect timeout
    });
    
    this.safetyControls = TradingSafetyControls.getInstance();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🌐 Initializing Multi-Account MetaAPI Executor...');
      
      // Parse accounts from environment variable
      const accountsConfig = process.env.METAAPI_ACCOUNTS;
      if (!accountsConfig) {
        throw new Error('METAAPI_ACCOUNTS environment variable is required. Format: accountId:brokerName:accountType,accountId:brokerName:accountType');
      }

      const accountStrings = accountsConfig.split(',');
      const seenAccountIds = new Set<string>(); // Prevent duplicate accounts

      for (const accountString of accountStrings) {
        const [id, brokerName, accountType] = accountString.trim().split(':');
        
        if (!id || !brokerName || !accountType) {
          logger.warn(`⚠️ Invalid account config: ${accountString}`);
          continue;
        }

        const cleanId = id.trim();
        
        // Skip duplicate account IDs
        if (seenAccountIds.has(cleanId)) {
          logger.warn(`⚠️ Duplicate account ID detected, skipping: ${cleanId}`);
          continue;
        }
        seenAccountIds.add(cleanId);

        const accountConfig: AccountConfig = {
          id: cleanId,
          brokerName: brokerName.trim(),
          accountType: accountType.trim() as 'DEMO' | 'LIVE',
          status: 'CONNECTING'
        };

        this.accounts.set(cleanId, accountConfig);
      }

      // Connect accounts with controlled concurrency
      await this.connectAccountsSequentially();

      const connectedAccounts = Array.from(this.accounts.values()).filter(acc => acc.status === 'CONNECTED');
      const failedAccounts = Array.from(this.accounts.values()).filter(acc => acc.status === 'FAILED');

      logger.info('🎯 Multi-Account Connection Results:', {
        totalAccounts: this.accounts.size,
        connectedAccounts: connectedAccounts.length,
        failedAccounts: failedAccounts.length,
        accounts: Array.from(this.accounts.values()).map(acc => ({
          brokerName: acc.brokerName,
          accountType: acc.accountType,
          status: acc.status
        }))
      });

      this.initialized = connectedAccounts.length > 0;
      
      if (!this.initialized) {
        throw new Error('Failed to connect to any accounts');
      }

      // Initialize universal symbol support after connections are established
      logger.info('🌍 Initializing universal symbol support...');
      
      // Wait for full synchronization before symbol discovery
      await this.waitForFullSynchronization();
      
      await UniversalSymbolSupport.discoverAllSymbols(this.accounts);
      
      // Generate and log symbol report
      const report = UniversalSymbolSupport.generateSymbolReport();
      logger.info(report);

    } catch (error) {
      logger.error('❌ Failed to initialize Multi-Account MetaAPI:', error);
      throw error;
    }
  }

  private async connectAccountsSequentially(): Promise<void> {
    const accountArray = Array.from(this.accounts.values());
    
    logger.info(`🔗 Connecting to ${accountArray.length} accounts sequentially to avoid timeouts...`);
    
    for (let i = 0; i < accountArray.length; i++) {
      const accountConfig = accountArray[i];
      
      // Add delay between connections to prevent overload
      if (i > 0) {
        logger.info(`⏳ Waiting ${this.connectionRetryDelay / 1000}s before next connection...`);
        await new Promise(resolve => setTimeout(resolve, this.connectionRetryDelay));
      }
      
      await this.connectAccountWithRetry(accountConfig, 3); // 3 retry attempts
    }
  }

  private async waitForFullSynchronization(): Promise<void> {
    logger.info('⏳ Waiting for all accounts to fully synchronize...');
    
    const maxWaitTime = 60000; // 60 seconds max wait
    const checkInterval = 2000; // Check every 2 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      let allSynchronized = true;
      
      for (const [accountId, accountConfig] of this.accounts) {
        if (accountConfig.status === 'CONNECTED' && accountConfig.connection) {
          const terminalState = accountConfig.connection.terminalState;
          if (!terminalState || !terminalState.synchronized) {
            allSynchronized = false;
            logger.info(`⏳ Waiting for ${accountConfig.brokerName} to synchronize...`);
            break;
          }
        }
      }
      
      if (allSynchronized) {
        logger.info('✅ All connected accounts are now fully synchronized!');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    logger.warn('⚠️ Full synchronization timeout - proceeding anyway');
  }

  private async connectAccountWithRetry(accountConfig: AccountConfig, maxRetries: number): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.connectAccount(accountConfig);
        return; // Success, exit retry loop
      } catch (error) {
        logger.warn(`🔄 Connection attempt ${attempt}/${maxRetries} failed for ${accountConfig.brokerName}:`, error);
        
        if (attempt === maxRetries) {
          accountConfig.status = 'FAILED';
          logger.error(`❌ All connection attempts failed for ${accountConfig.brokerName}`);
          return;
        }
        
        // Exponential backoff
        const delay = this.connectionRetryDelay * Math.pow(2, attempt - 1);
        logger.info(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private async connectAccount(accountConfig: AccountConfig): Promise<void> {
    logger.info(`🔗 Connecting to ${accountConfig.brokerName} ${accountConfig.accountType} account...`);
    
    try {
      // Get account with timeout
      accountConfig.account = await this.api.metatraderAccountApi.getAccount(accountConfig.id);
      
      // Check if account is deployed
      if (!accountConfig.account.state || accountConfig.account.state === 'UNDEPLOYED') {
        logger.info(`📦 Deploying ${accountConfig.brokerName} account...`);
        await accountConfig.account.deploy();
        
        // Wait for deployment with timeout
        await Promise.race([
          accountConfig.account.waitDeployed(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Deployment timeout')), 60000)
          )
        ]);
      }

      // Wait for connection with timeout
      await Promise.race([
        accountConfig.account.waitConnected(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 60000)
        )
      ]);

      // Get streaming connection - only one per account
      if (accountConfig.connection) {
        logger.info(`🔌 Closing existing connection for ${accountConfig.brokerName}...`);
        try {
          await accountConfig.connection.close();
        } catch (closeError) {
          logger.warn(`⚠️ Error closing existing connection:`, closeError);
        }
      }
      
      accountConfig.connection = accountConfig.account.getStreamingConnection();
      
      // Connect with timeout
      await Promise.race([
        accountConfig.connection.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Stream connection timeout')), 30000)
        )
      ]);
      
      // Wait for synchronization with timeout
      logger.info(`🔄 Synchronizing ${accountConfig.brokerName} account...`);
      await Promise.race([
        accountConfig.connection.waitSynchronized(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Synchronization timeout')), 120000) // 2 minutes
        )
      ]);

      accountConfig.status = 'CONNECTED';
      logger.info(`✅ ${accountConfig.brokerName} ${accountConfig.accountType} connected successfully!`);

    } catch (error) {
      // Clean up failed connection
      if (accountConfig.connection) {
        try {
          await accountConfig.connection.close();
        } catch (closeError) {
          // Ignore cleanup errors
        }
        accountConfig.connection = undefined;
      }
      
      accountConfig.status = 'FAILED';
      throw error; // Re-throw for retry logic
    }
  }

  async executeTrade(signal: TradeSignal): Promise<MultiAccountTradeResult> {
    if (!this.initialized) {
      throw new Error('Multi-Account executor not initialized');
    }

    logger.info('🚀 Executing trade across multiple accounts:', {
      symbol: signal.symbol,
      action: signal.action,
      totalAccounts: this.accounts.size
    });

    const results: MultiAccountTradeResult['results'] = [];
    const connectedAccounts = Array.from(this.accounts.entries())
      .filter(([_, config]) => config.status === 'CONNECTED');

    // Execute trades sequentially with delays to avoid frequency limits
    let accountIndex = 0;
    for (const [accountId, accountConfig] of this.accounts) {
      logger.info(`💼 Executing on ${accountConfig.brokerName} ${accountConfig.accountType}...`);
      
      if (accountConfig.status !== 'CONNECTED') {
        results.push({
          accountId,
          brokerName: accountConfig.brokerName,
          accountType: accountConfig.accountType,
          success: false,
          message: 'Account not connected',
          error: `Account status: ${accountConfig.status}`
        });
        continue;
      }

      try {
        await this.executeTradeOnAccount(signal, accountConfig, results);
        
        // Add delay between executions (except for the last connected account)
        if (accountIndex < connectedAccounts.length - 1) {
          logger.info('⏳ Waiting 6s before next account execution...');
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
        accountIndex++;
        
      } catch (error) {
        logger.error(`❌ Error executing on ${accountConfig.brokerName}:`, error);
        results.push({
          accountId,
          brokerName: accountConfig.brokerName,
          accountType: accountConfig.accountType,
          success: false,
          message: 'Execution error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successfulTrades = results.filter(r => r.success).length;
    const failedTrades = results.filter(r => !r.success).length;

    const overallResult: MultiAccountTradeResult = {
      overallSuccess: successfulTrades > 0,
      totalAccounts: this.accounts.size,
      successfulAccounts: successfulTrades,
      failedAccounts: failedTrades,
      results
    };

    logger.info('📊 Multi-Account Trade Results:', {
      overallSuccess: overallResult.overallSuccess,
      successfulTrades,
      failedTrades,
      totalAccounts: this.accounts.size
    });

    return overallResult;
  }

  private async executeTradeOnAccount(
    signal: TradeSignal,
    accountConfig: AccountConfig,
    results: MultiAccountTradeResult['results']
  ): Promise<void> {
    try {
      logger.info(`💼 Executing on ${accountConfig.brokerName} ${accountConfig.accountType}...`);

      // 🌍 Enhanced symbol validation with universal support
      await UniversalSymbolSupport.updateSymbolCacheIfNeeded(this.accounts);
      
      // Validate and potentially correct symbol
      const detectionResult = await EnhancedSymbolDetector.detectSymbol(signal.symbol, accountConfig.brokerName);
      
      let validatedSymbol = signal.symbol;
      if (detectionResult && detectionResult.confidence > 80) {
        validatedSymbol = detectionResult.symbol;
        if (validatedSymbol !== signal.symbol) {
          logger.info(`🔄 Symbol corrected: ${signal.symbol} → ${validatedSymbol} (${detectionResult.confidence}% confidence)`);
        }
      }
      
      // Get symbol-specific information from universal support
      const symbolInfo = UniversalSymbolSupport.getSymbolInfo(validatedSymbol, accountConfig.brokerName);
      if (!symbolInfo) {
        logger.warn(`⚠️ Symbol ${validatedSymbol} not found on ${accountConfig.brokerName}, trying anyway...`);
      } else {
        logger.info(`✅ Symbol ${validatedSymbol} validated on ${accountConfig.brokerName}: ${symbolInfo.description} (${symbolInfo.type})`);
      }
      
      // Update signal with validated symbol
      const validatedSignal = { ...signal, symbol: validatedSymbol };

      // Get account balance for safety validation
      const terminalState = accountConfig.connection.terminalState;
      const accountInfo = terminalState.accountInformation;
      const accountBalance = accountInfo?.balance || 10000; // Fallback to 10k if unavailable

      // Subscribe to market data
      await accountConfig.connection.subscribeToMarketData(validatedSignal.symbol);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for market data

      // Check market status with Smart ML Override - reuse terminalState
      const symbolPrice = terminalState.price(validatedSignal.symbol);
      
      if (!symbolPrice) {
        throw new Error(`Symbol price not available for ${validatedSignal.symbol}`);
      }

      // 🎯 SMART ORDER TYPE DECISION with current market price
      const currentPrice = (symbolPrice.bid + symbolPrice.ask) / 2;
      
      logger.info(`💰 Current market data for ${validatedSignal.symbol}:`, {
        bid: symbolPrice.bid,
        ask: symbolPrice.ask,
        midPrice: currentPrice,
        spread: Math.abs(symbolPrice.ask - symbolPrice.bid),
        entryZone: `${signal.entryZone.min} - ${signal.entryZone.max}`,
        stopLoss: signal.stopLoss
      });
      
      let finalOrderType = signal.orderType;
      let finalEntryPrice = signal.entryPrice;

      // 🚫 FORCE LIMIT ORDERS ONLY - Never execute market orders
      // All entries should be limit orders based on chart levels
      finalOrderType = 'LIMIT';
      
      // Determine optimal limit entry price based on signal direction and entry zone
      if (!finalEntryPrice) {
        if (signal.action === 'BUY') {
          // For BUY limit: Entry price must be BELOW current market price
          // Use the lower of entry zone max or current price - small buffer
          const maxBuyPrice = Math.min(signal.entryZone.max, currentPrice - 0.0001);
          finalEntryPrice = Math.max(signal.entryZone.min, maxBuyPrice);
        } else if (signal.action === 'SELL') {
          // For SELL limit: Entry price must be ABOVE current market price
          // Use the higher of entry zone min or current price + small buffer  
          const minSellPrice = Math.max(signal.entryZone.min, currentPrice + 0.0001);
          finalEntryPrice = Math.min(signal.entryZone.max, minSellPrice);
        } else {
          // Fallback: Use middle of entry zone
          finalEntryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
        }
      }
      
      // Validate limit order price logic
      const priceValidation = this.validateLimitOrderPrice(signal.action, finalEntryPrice!, currentPrice);
      if (!priceValidation.isValid) {
        // Adjust price to be valid
        finalEntryPrice = priceValidation.suggestedPrice;
        logger.warn(`⚠️ Adjusted invalid limit price: ${priceValidation.reason}`);
      }
      
      logger.info(`🎯 LIMIT ORDER ONLY - Entry Level: ${finalEntryPrice!}`, {
        action: signal.action,
        entryZone: signal.entryZone,
        currentPrice,
        priceDistance: Math.abs(currentPrice - finalEntryPrice!),
        reason: 'Chart-based limit entry enforced',
        validation: priceValidation.isValid ? 'VALID' : 'ADJUSTED'
      });

      // Calculate proposed volume (replace hardcoded 0.01)
      const riskAmount = accountBalance * 0.02; // 2% risk
      const entryPrice = (signal.entryZone.min + signal.entryZone.max) / 2;
      const stopDistance = Math.abs(entryPrice - signal.stopLoss);
      let proposedVolume = stopDistance > 0 ? riskAmount / (stopDistance * 10) : 0.01;
      proposedVolume = Math.max(0.01, Math.min(1.0, Math.round(proposedVolume * 100) / 100));

      // 🛡️ SAFETY VALIDATION
      const safetyCheck = this.safetyControls.validateTrade(signal, accountBalance, proposedVolume);
      
      if (!safetyCheck.canTrade) {
        throw new Error(`Safety check failed: ${safetyCheck.reason}`);
      }

      const finalVolume = safetyCheck.adjustedVolume || proposedVolume;
      logger.info(`📊 Volume calculation for ${accountConfig.brokerName}:`, {
        accountBalance,
        proposedVolume,
        finalVolume,
        riskAmount,
        stopDistance
      });

      // Execute the trade based on final order type decision
      let result;
      
      // Use simple comment only (no clientId to avoid validation issues)
      const tradeOptions = {
        comment: 'Bot Trade'
      };

      // 🎯 LIMIT ORDERS ONLY - All entries are chart-based levels
      // Use limit order with specific entry price from chart analysis
      const limitPrice = finalEntryPrice;
      
      // Use advanced stop/take management for optimal levels
      const optimalLevels = AdvancedStopTakeManager.calculateOptimalLevels(
        signal, 
        currentPrice, 
        0.001 // Base volatility - could be made dynamic
      );
      
      logger.info(`🎯 Advanced SL/TP calculated: SL=${optimalLevels.stopLoss}, TPs=[${optimalLevels.takeProfits.join(',')}], R:R=${optimalLevels.riskRewardRatio.toFixed(2)}, Confidence=${optimalLevels.confidence}%`);
      
      // Use the advanced levels with limit entry
      const validStopLoss = optimalLevels.stopLoss;
      const validTakeProfit = optimalLevels.takeProfits[0]; // Use first TP
      
      logger.info(`📊 LIMIT ORDER - Entry: ${limitPrice}, SL: ${validStopLoss}, TP: ${validTakeProfit}, Current: ${currentPrice}`);
      
      if (signal.action === 'BUY') {
        result = await accountConfig.connection.createLimitBuyOrder(
          signal.symbol,
          finalVolume,
          limitPrice,
          validStopLoss,
          validTakeProfit,
          tradeOptions
        );
      } else if (signal.action === 'SELL') {
        result = await accountConfig.connection.createLimitSellOrder(
          signal.symbol,
          finalVolume,
          limitPrice,
          validStopLoss,
          validTakeProfit,
          tradeOptions
        );
      }
      
      logger.info(`🎯 LIMIT ORDER PLACED: ${signal.action} ${signal.symbol} @ ${limitPrice!} (Current: ${currentPrice}, Distance: ${Math.abs(currentPrice - limitPrice!).toFixed(5)})`);

      // ❌ MARKET ORDERS DISABLED - All orders are now limit orders based on chart levels

      // Record the trade for safety tracking
      this.safetyControls.recordTrade(finalVolume);

      results.push({
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        accountType: accountConfig.accountType,
        success: true,
        message: `Trade executed successfully. Ticket: ${result.positionId || result.orderId}`
      });

      logger.info(`✅ Trade successful on ${accountConfig.brokerName}: ${result.positionId || result.orderId}`);

    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      
      // Immediate detailed error logging
      console.error(`\n🔥 DETAILED ERROR FOR ${accountConfig.brokerName}:`);
      console.error(`   Error Message: ${errorMessage}`);
      console.error(`   Error Name: ${error.name || 'Unknown'}`);
      console.error(`   Error Code: ${error.code || 'No code'}`);
      if (error.stack) {
        console.error(`   Stack Trace: ${error.stack.split('\n')[0]}`);
      }
      console.error(`   Full Error Object:`, JSON.stringify(error, null, 2));
      console.error(`   Error Type: ${typeof error}`);
      
      const errorDetails = {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack?.split('\n')[0], // First line of stack trace
        fullError: error
      };
      
      logger.error(`❌ Trade failed on ${accountConfig.brokerName}:`, {
        errorMessage,
        errorDetails,
        signal: {
          symbol: signal.symbol,
          action: signal.action,
          entryZone: signal.entryZone,
          stopLoss: signal.stopLoss,
          targets: signal.targets
        }
      });
      if (errorMessage.includes('Market is closed')) {
        const now = new Date();
        const overrideDecision = SmartMarketOverrideML.analyzeMarketConflict(
          'CLOSED',
          now,
          signal.symbol,
          true, // Assume price data available
          undefined
        );

        logger.info(`🤖 Smart Override ML (${accountConfig.brokerName}):`, {
          shouldOverride: overrideDecision.shouldOverride,
          confidence: `${(overrideDecision.confidence * 100).toFixed(1)}%`,
          reasoning: overrideDecision.reasoning
        });
      }

      results.push({
        accountId: accountConfig.id,
        brokerName: accountConfig.brokerName,
        accountType: accountConfig.accountType,
        success: false,
        message: 'Trade execution failed',
        error: errorMessage
      });

      logger.error(`❌ Trade failed on ${accountConfig.brokerName}:`, errorMessage);
    }
  }

  // Required interface method - delegates to executeTrade with proper return format
  async executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: number;
    signalId?: string;
  }> {
    logger.info('🚀 executeTradeSignal called with signal:', {
      symbol: signal.symbol,
      action: signal.action,
      entryZone: signal.entryZone,
      stopLoss: signal.stopLoss,
      targets: signal.targets,
      orderType: signal.orderType
    });
    
    // Check if initialized
    if (!this.initialized) {
      logger.error('❌ Multi-Account executor not initialized');
      return {
        success: false,
        error: 'Multi-Account executor not initialized',
        message: 'Trade executor not ready'
      };
    }
    
    // Check connection status
    const connectedAccounts = Array.from(this.accounts.values()).filter(acc => acc.status === 'CONNECTED');
    logger.info(`📊 Connected accounts: ${connectedAccounts.length}/${this.accounts.size}`);
    
    if (connectedAccounts.length === 0) {
      logger.error('❌ No accounts connected - cannot execute trade');
      return {
        success: false,
        error: 'No connected accounts',
        message: 'All MetaAPI accounts are disconnected'
      };
    }
    
    try {
      logger.info('🔄 Calling executeTrade...');
      const multiResult = await this.executeTrade(signal);
      
      logger.info('📋 executeTrade result:', {
        overallSuccess: multiResult.overallSuccess,
        successfulAccounts: multiResult.successfulAccounts,
        failedAccounts: multiResult.failedAccounts,
        totalAccounts: multiResult.totalAccounts
      });
      
      const result = {
        success: multiResult.overallSuccess,
        message: multiResult.overallSuccess 
          ? `Trade executed on ${multiResult.successfulAccounts}/${multiResult.totalAccounts} accounts`
          : `All trades failed (${multiResult.failedAccounts}/${multiResult.totalAccounts} failed)`,
        error: multiResult.overallSuccess ? undefined : 'Multi-account execution failed',
        signalId: `multi-${Date.now()}`
      };
      
      logger.info('✅ executeTradeSignal returning result:', result);
      return result;
      
    } catch (error: any) {
      logger.error('💥 executeTradeSignal caught exception:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        message: 'Trade execution threw an exception'
      };
    }
  }

  // Required interface method
  async closeConnection(): Promise<void> {
    await this.cleanup();
  }

  // Legacy single trade method for backward compatibility
  async trade(signal: TradeSignal): Promise<TradeResult> {
    const multiResult = await this.executeTrade(signal);
    
    return {
      success: multiResult.overallSuccess,
      message: multiResult.overallSuccess 
        ? `Trade executed on ${multiResult.successfulAccounts}/${multiResult.totalAccounts} accounts`
        : 'All trades failed',
      error: multiResult.overallSuccess ? undefined : 'Multi-account execution failed'
    };
  }

  async isConnected(): Promise<boolean> {
    const connectedAccounts = Array.from(this.accounts.values()).filter(acc => acc.status === 'CONNECTED');
    const isConnected = connectedAccounts.length > 0;
    
    // Enhanced logging for debugging
    logger.info('🔍 Connection status check:', {
      totalAccounts: this.accounts.size,
      connectedAccounts: connectedAccounts.length,
      isConnected,
      accountStatuses: this.getAccountStatuses()
    });
    
    return isConnected;
  }

  // Get account statuses
  getAccountStatuses() {
    return Array.from(this.accounts.values()).map(acc => ({
      id: acc.id,
      brokerName: acc.brokerName,
      accountType: acc.accountType,
      status: acc.status
    }));
  }

  // Get detailed account information for a specific account
  async getAccountInfo(accountId: string) {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig || accountConfig.status !== 'CONNECTED' || !accountConfig.connection) {
      throw new Error(`Account ${accountId} is not connected`);
    }

    try {
      const terminalState = accountConfig.connection.terminalState;
      const accountInfo = terminalState.accountInformation;
      
      return {
        id: accountId,
        brokerName: accountConfig.brokerName,
        accountType: accountConfig.accountType,
        balance: accountInfo.balance || 0,
        equity: accountInfo.equity || 0,
        freeMargin: accountInfo.freeMargin || 0,
        marginLevel: accountInfo.marginLevel || 0,
        currency: accountInfo.currency || 'USD',
        name: accountInfo.name || `${accountConfig.brokerName} ${accountConfig.accountType}`,
        server: accountInfo.server || 'Unknown',
        lastUpdate: Date.now()
      };
    } catch (error) {
      logger.error(`Error getting account info for ${accountId}:`, error);
      throw error;
    }
  }

  // Get positions for a specific account
  async getAccountPositions(accountId: string) {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig || accountConfig.status !== 'CONNECTED' || !accountConfig.connection) {
      return [];
    }

    try {
      const terminalState = accountConfig.connection.terminalState;
      const positions = terminalState.positions || [];
      
      return positions.map((pos: any) => ({
        id: pos.id,
        symbol: pos.symbol,
        type: pos.type,
        volume: pos.volume,
        openPrice: pos.openPrice,
        currentPrice: pos.currentPrice,
        unrealizedProfit: pos.unrealizedProfit || 0,
        commission: pos.commission || 0,
        swap: pos.swap || 0,
        openTime: pos.openTime,
        accountId,
        brokerName: accountConfig.brokerName
      }));
    } catch (error) {
      logger.error(`Error getting positions for account ${accountId}:`, error);
      return [];
    }
  }

  // Get all account information with positions
  async getAllAccountsData() {
    const accounts = [];
    
    for (const [accountId, accountConfig] of this.accounts) {
      try {
        if (accountConfig.status === 'CONNECTED') {
          const accountInfo = await this.getAccountInfo(accountId);
          const positions = await this.getAccountPositions(accountId);
          
          accounts.push({
            ...accountInfo,
            positions,
            status: accountConfig.status
          });
        } else {
          // Add basic info for non-connected accounts
          accounts.push({
            id: accountId,
            brokerName: accountConfig.brokerName,
            accountType: accountConfig.accountType,
            status: accountConfig.status,
            balance: 0,
            equity: 0,
            freeMargin: 0,
            marginLevel: 0,
            positions: [],
            lastUpdate: Date.now()
          });
        }
      } catch (error) {
        logger.error(`Error getting data for account ${accountId}:`, error);
        accounts.push({
          id: accountId,
          brokerName: accountConfig.brokerName,
          accountType: accountConfig.accountType,
          status: 'ERROR',
          balance: 0,
          equity: 0,
          freeMargin: 0,
          marginLevel: 0,
          positions: [],
          lastUpdate: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return accounts;
  }

  // Close a specific position on a specific account
  async closePosition(accountId: string, positionId: string) {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig || accountConfig.status !== 'CONNECTED' || !accountConfig.connection) {
      throw new Error(`Account ${accountId} is not connected`);
    }

    try {
      const result = await accountConfig.connection.closePosition(positionId);
      logger.info(`✅ Position ${positionId} closed on ${accountConfig.brokerName}`);
      return result;
    } catch (error) {
      logger.error(`❌ Failed to close position ${positionId} on ${accountConfig.brokerName}:`, error);
      throw error;
    }
  }

  // ========== COMPREHENSIVE TRADE HISTORY FUNCTIONALITY ==========

  /**
   * Get comprehensive trade history across all or specific accounts
   */
  async getTradeHistory(filter: TradeHistoryFilter = {}): Promise<TradeHistoryResponse> {
    const { 
      accountId, 
      symbol, 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: 30 days ago
      endDate = new Date(), 
      limit = 100,
      offset = 0 
    } = filter;

    logger.info('📊 Fetching comprehensive trade history...', {
      accountId: accountId || 'ALL',
      symbol: symbol || 'ALL',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit
    });

    const deals: HistoricalDeal[] = [];
    const orders: HistoricalOrder[] = [];
    const positions: PositionHistory[] = [];
    const transactions: AccountTransaction[] = [];

    const accountsToQuery = accountId 
      ? [this.accounts.get(accountId)].filter(Boolean)
      : Array.from(this.accounts.values()).filter(acc => acc.status === 'CONNECTED');

    const historyPromises = accountsToQuery.map(async (accountConfig) => {
      if (!accountConfig || !accountConfig.connection) return;

      try {
        // Fetch historical deals (completed trades)
        const accountDeals = await this.getAccountDeals(accountConfig, startDate, endDate, symbol);
        deals.push(...accountDeals);

        // Fetch historical orders
        const accountOrders = await this.getAccountOrders(accountConfig, startDate, endDate, symbol);
        orders.push(...accountOrders);

        // Fetch position history
        const accountPositions = await this.getAccountPositionHistory(accountConfig, startDate, endDate, symbol);
        positions.push(...accountPositions);

        // Fetch account transactions
        const accountTransactions = await this.getAccountTransactions(accountConfig, startDate, endDate);
        transactions.push(...accountTransactions);

      } catch (error) {
        logger.error(`❌ Error fetching history for ${accountConfig.brokerName}:`, error);
      }
    });

    await Promise.allSettled(historyPromises);

    // Sort all results by time (newest first)
    deals.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    orders.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    positions.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
    transactions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    // Apply pagination
    const paginatedDeals = deals.slice(offset, offset + limit);
    const paginatedOrders = orders.slice(offset, offset + limit);
    const paginatedPositions = positions.slice(offset, offset + limit);
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    // Calculate comprehensive summary
    const summary = this.calculateTradingSummary(deals, positions, accountsToQuery.map(acc => acc!.id));

    return {
      deals: paginatedDeals,
      orders: paginatedOrders,
      positions: paginatedPositions,
      transactions: paginatedTransactions,
      totalCount: deals.length + orders.length + positions.length + transactions.length,
      hasMore: (deals.length + orders.length + positions.length + transactions.length) > (offset + limit),
      summary
    };
  }

  /**
   * Get historical deals for a specific account
   */
  private async getAccountDeals(
    accountConfig: AccountConfig, 
    startDate: Date, 
    endDate: Date, 
    symbol?: string
  ): Promise<HistoricalDeal[]> {
    try {
      if (!accountConfig.connection) return [];

      const historyStorage = accountConfig.connection.historyStorage;
      const deals = await historyStorage.getDeals(startDate, endDate);

      return deals
        .filter((deal: any) => !symbol || deal.symbol === symbol)
        .map((deal: any): HistoricalDeal => ({
          id: deal.id || deal.positionId + '_' + deal.time,
          positionId: deal.positionId,
          orderId: deal.orderId,
          symbol: deal.symbol,
          type: deal.type,
          volume: deal.volume,
          price: deal.price,
          commission: deal.commission || 0,
          swap: deal.swap || 0,
          profit: deal.profit || 0,
          time: new Date(deal.time),
          comment: deal.comment,
          accountId: accountConfig.id,
          brokerName: accountConfig.brokerName,
          accountType: accountConfig.accountType
        }));

    } catch (error) {
      logger.warn(`⚠️ Could not fetch deals for ${accountConfig.brokerName}:`, error);
      return [];
    }
  }

  /**
   * Get historical orders for a specific account
   */
  private async getAccountOrders(
    accountConfig: AccountConfig, 
    startDate: Date, 
    endDate: Date, 
    symbol?: string
  ): Promise<HistoricalOrder[]> {
    try {
      if (!accountConfig.connection) return [];

      const historyStorage = accountConfig.connection.historyStorage;
      const orders = await historyStorage.getHistoryOrdersByTimeRange(startDate, endDate);

      return orders
        .filter((order: any) => !symbol || order.symbol === symbol)
        .map((order: any): HistoricalOrder => ({
          id: order.id,
          positionId: order.positionId,
          symbol: order.symbol,
          type: order.type,
          state: order.state,
          volume: order.volume,
          openPrice: order.openPrice,
          currentPrice: order.currentPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          time: new Date(order.time),
          doneTime: order.doneTime ? new Date(order.doneTime) : undefined,
          comment: order.comment,
          accountId: accountConfig.id,
          brokerName: accountConfig.brokerName,
          accountType: accountConfig.accountType
        }));

    } catch (error) {
      logger.warn(`⚠️ Could not fetch orders for ${accountConfig.brokerName}:`, error);
      return [];
    }
  }

  /**
   * Get position history for a specific account
   */
  private async getAccountPositionHistory(
    accountConfig: AccountConfig, 
    startDate: Date, 
    endDate: Date, 
    symbol?: string
  ): Promise<PositionHistory[]> {
    try {
      if (!accountConfig.connection) return [];

      const terminalState = accountConfig.connection.terminalState;
      const currentPositions = terminalState.positions || [];
      
      // Get historical positions from deals
      const historyStorage = accountConfig.connection.historyStorage;
      const deals = await historyStorage.getDeals(startDate, endDate);
      
      const positionMap = new Map<string, PositionHistory>();

      // Process deals to build position history
      deals
        .filter((deal: any) => !symbol || deal.symbol === symbol)
        .forEach((deal: any) => {
          const posId = deal.positionId;
          if (!positionMap.has(posId)) {
            positionMap.set(posId, {
              id: posId,
              symbol: deal.symbol,
              type: deal.type === 'DEAL_TYPE_BUY' ? 'POSITION_TYPE_BUY' : 'POSITION_TYPE_SELL',
              volume: deal.volume,
              openPrice: deal.price,
              currentPrice: deal.price,
              profit: 0,
              commission: 0,
              swap: 0,
              openTime: new Date(deal.time),
              comment: deal.comment,
              accountId: accountConfig.id,
              brokerName: accountConfig.brokerName,
              accountType: accountConfig.accountType,
              status: 'CLOSED'
            });
          }

          const position = positionMap.get(posId)!;
          position.profit += deal.profit || 0;
          position.commission += deal.commission || 0;
          position.swap += deal.swap || 0;
          
          // Update close information
          if (deal.type !== position.type) {
            position.closePrice = deal.price;
            position.closeTime = new Date(deal.time);
          }
        });

      // Add current open positions
      currentPositions
        .filter((pos: any) => !symbol || pos.symbol === symbol)
        .forEach((pos: any) => {
          positionMap.set(pos.id, {
            id: pos.id,
            symbol: pos.symbol,
            type: pos.type,
            volume: pos.volume,
            openPrice: pos.openPrice,
            currentPrice: pos.currentPrice,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            profit: pos.profit,
            unrealizedProfit: pos.unrealizedProfit,
            commission: pos.commission || 0,
            swap: pos.swap || 0,
            openTime: new Date(pos.time),
            comment: pos.comment,
            accountId: accountConfig.id,
            brokerName: accountConfig.brokerName,
            accountType: accountConfig.accountType,
            status: 'OPEN'
          });
        });

      return Array.from(positionMap.values());

    } catch (error) {
      logger.warn(`⚠️ Could not fetch position history for ${accountConfig.brokerName}:`, error);
      return [];
    }
  }

  /**
   * Get account transactions
   */
  private async getAccountTransactions(
    accountConfig: AccountConfig, 
    startDate: Date, 
    endDate: Date
  ): Promise<AccountTransaction[]> {
    try {
      if (!accountConfig.connection) return [];

      const historyStorage = accountConfig.connection.historyStorage;
      
      // Note: MetaAPI might not have direct transaction history API
      // This is a placeholder - actual implementation depends on MetaAPI version
      // For now, we'll extract transaction-like data from deals
      const deals = await historyStorage.getDeals(startDate, endDate);

      return deals
        .filter((deal: any) => deal.type === 'DEAL_TYPE_BALANCE' || deal.type === 'DEAL_TYPE_CREDIT')
        .map((deal: any): AccountTransaction => ({
          id: deal.id || `transaction_${deal.time}`,
          type: deal.type.includes('BALANCE') ? 'BALANCE' : 'CREDIT',
          amount: deal.profit || 0,
          balance: deal.balance || 0,
          time: new Date(deal.time),
          comment: deal.comment,
          accountId: accountConfig.id,
          brokerName: accountConfig.brokerName,
          accountType: accountConfig.accountType
        }));

    } catch (error) {
      logger.warn(`⚠️ Could not fetch transactions for ${accountConfig.brokerName}:`, error);
      return [];
    }
  }

  /**
   * Calculate comprehensive trading summary
   */
  private calculateTradingSummary(
    deals: HistoricalDeal[], 
    positions: PositionHistory[], 
    accountIds: string[]
  ) {
    const closedPositions = positions.filter(pos => pos.status === 'CLOSED');
    const winningTrades = closedPositions.filter(pos => (pos.profit || 0) > 0);
    const losingTrades = closedPositions.filter(pos => (pos.profit || 0) < 0);
    
    const totalProfit = closedPositions.reduce((sum, pos) => sum + (pos.profit || 0), 0);
    const totalCommission = deals.reduce((sum, deal) => sum + deal.commission, 0);
    const totalSwap = deals.reduce((sum, deal) => sum + deal.swap, 0);

    const profits = winningTrades.map(pos => pos.profit || 0);
    const losses = losingTrades.map(pos => Math.abs(pos.profit || 0));

    return {
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalProfit,
      totalCommission,
      totalSwap,
      winRate: closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0,
      averageProfit: profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0,
      averageLoss: losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
      profitFactor: losses.length > 0 ? 
        profits.reduce((a, b) => a + b, 0) / losses.reduce((a, b) => a + b, 0) : 
        profits.length > 0 ? Number.MAX_SAFE_INTEGER : 0,
      maxDrawdown: Math.min(...closedPositions.map(pos => pos.profit || 0)),
      maxProfit: Math.max(...profits, 0),
      maxLoss: Math.max(...losses, 0),
      accountsAnalyzed: accountIds
    };
  }

  /**
   * Get detailed performance metrics for a specific account
   */
  async getAccountPerformanceMetrics(
    accountId: string, 
    startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: Date = new Date()
  ): Promise<TradePerformanceMetrics | null> {
    const accountConfig = this.accounts.get(accountId);
    if (!accountConfig || accountConfig.status !== 'CONNECTED') {
      logger.warn(`Account ${accountId} not found or not connected`);
      return null;
    }

    try {
      const filter: TradeHistoryFilter = { accountId, startDate, endDate, limit: 1000 };
      const history = await this.getTradeHistory(filter);
      
      const closedPositions = history.positions.filter(pos => pos.status === 'CLOSED');
      const winningTrades = closedPositions.filter(pos => (pos.profit || 0) > 0);
      const losingTrades = closedPositions.filter(pos => (pos.profit || 0) <= 0);

      // Calculate advanced metrics
      const profits = winningTrades.map(pos => pos.profit || 0);
      const losses = losingTrades.map(pos => Math.abs(pos.profit || 0));
      const allPnL = closedPositions.map(pos => pos.profit || 0);

      // Calculate consecutive wins/losses
      let maxConsecutiveWins = 0, maxConsecutiveLosses = 0;
      let currentWins = 0, currentLosses = 0;
      
      closedPositions
        .sort((a, b) => new Date(a.closeTime || a.openTime).getTime() - new Date(b.closeTime || b.openTime).getTime())
        .forEach(pos => {
          if ((pos.profit || 0) > 0) {
            currentWins++;
            currentLosses = 0;
            maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
          } else {
            currentLosses++;
            currentWins = 0;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
          }
        });

      // Calculate drawdown
      let runningBalance = 0;
      let peak = 0;
      let maxDrawdown = 0;
      let maxDrawdownPercent = 0;

      allPnL.forEach(pnl => {
        runningBalance += pnl;
        if (runningBalance > peak) peak = runningBalance;
        const drawdown = peak - runningBalance;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        if (peak > 0) {
          const drawdownPercent = (drawdown / peak) * 100;
          if (drawdownPercent > maxDrawdownPercent) maxDrawdownPercent = drawdownPercent;
        }
      });

      // Symbol breakdown
      const symbolMap = new Map<string, { trades: number; profit: number; wins: number }>();
      closedPositions.forEach(pos => {
        const existing = symbolMap.get(pos.symbol) || { trades: 0, profit: 0, wins: 0 };
        existing.trades++;
        existing.profit += pos.profit || 0;
        if ((pos.profit || 0) > 0) existing.wins++;
        symbolMap.set(pos.symbol, existing);
      });

      const symbolBreakdown = Array.from(symbolMap.entries()).map(([symbol, data]) => ({
        symbol,
        trades: data.trades,
        profit: data.profit,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0
      }));

      // Monthly breakdown
      const monthMap = new Map<string, { trades: number; profit: number; wins: number }>();
      closedPositions.forEach(pos => {
        const month = new Date(pos.closeTime || pos.openTime).toISOString().substring(0, 7);
        const existing = monthMap.get(month) || { trades: 0, profit: 0, wins: 0 };
        existing.trades++;
        existing.profit += pos.profit || 0;
        if ((pos.profit || 0) > 0) existing.wins++;
        monthMap.set(month, existing);
      });

      const monthlyBreakdown = Array.from(monthMap.entries()).map(([month, data]) => ({
        month,
        trades: data.trades,
        profit: data.profit,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0
      }));

      const grossProfit = profits.reduce((sum, profit) => sum + profit, 0);
      const grossLoss = losses.reduce((sum, loss) => sum + loss, 0);
      const netProfit = grossProfit - grossLoss;
      const totalCommission = history.deals.reduce((sum, deal) => sum + deal.commission, 0);
      const totalSwap = history.deals.reduce((sum, deal) => sum + deal.swap, 0);

      return {
        accountId,
        brokerName: accountConfig.brokerName,
        accountType: accountConfig.accountType,
        period: { startDate, endDate },
        metrics: {
          totalTrades: closedPositions.length,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          winRate: closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0,
          totalProfit: netProfit,
          grossProfit,
          grossLoss,
          netProfit,
          profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Number.MAX_SAFE_INTEGER : 0),
          averageProfit: profits.length > 0 ? grossProfit / profits.length : 0,
          averageLoss: losses.length > 0 ? grossLoss / losses.length : 0,
          maxConsecutiveWins,
          maxConsecutiveLosses,
          maxDrawdown,
          maxDrawdownPercent,
          recoveryFactor: maxDrawdown > 0 ? netProfit / maxDrawdown : 0,
          sharpeRatio: this.calculateSharpeRatio(allPnL),
          calmarRatio: maxDrawdownPercent > 0 ? (netProfit / maxDrawdownPercent) * 100 : 0,
          totalCommission,
          totalSwap
        },
        symbolBreakdown,
        monthlyBreakdown
      };

    } catch (error) {
      logger.error(`❌ Error calculating performance metrics for ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Calculate Sharpe ratio (simplified version)
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? mean / stdDev : 0;
  }

  /**
   * Get combined performance metrics across all connected accounts
   */
  async getAllAccountsPerformanceMetrics(
    startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: Date = new Date()
  ): Promise<TradePerformanceMetrics[]> {
    const connectedAccounts = Array.from(this.accounts.values())
      .filter(acc => acc.status === 'CONNECTED');

    const metricsPromises = connectedAccounts.map(acc => 
      this.getAccountPerformanceMetrics(acc.id, startDate, endDate)
    );

    const results = await Promise.allSettled(metricsPromises);
    
    return results
      .filter((result): result is PromiseFulfilledResult<TradePerformanceMetrics> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }

  /**
   * Validate limit order price logic
   */
  private validateLimitOrderPrice(action: string, entryPrice: number, currentPrice: number): {
    isValid: boolean;
    reason?: string;
    suggestedPrice: number;
  } {
    const minBuffer = 0.0001; // Minimum price buffer
    
    if (action === 'BUY') {
      // BUY limit: Entry price must be BELOW current market price
      if (entryPrice >= currentPrice) {
        return {
          isValid: false,
          reason: `BUY limit price ${entryPrice} must be below current ${currentPrice}`,
          suggestedPrice: currentPrice - minBuffer
        };
      }
    } else if (action === 'SELL') {
      // SELL limit: Entry price must be ABOVE current market price
      if (entryPrice <= currentPrice) {
        return {
          isValid: false,
          reason: `SELL limit price ${entryPrice} must be above current ${currentPrice}`,
          suggestedPrice: currentPrice + minBuffer
        };
      }
    }
    
    return {
      isValid: true,
      suggestedPrice: entryPrice
    };
  }

  /**
   * Clean up all connections properly
   */
  async cleanup(): Promise<void> {
    logger.info('🔌 Disconnecting from all accounts...');
    
    const disconnectPromises: Promise<void>[] = [];
    
    for (const [accountId, accountConfig] of this.accounts) {
      if (accountConfig.connection) {
        disconnectPromises.push(
          accountConfig.connection.close()
            .then(() => {
              logger.info(`✅ Disconnected from ${accountConfig.brokerName} ${accountConfig.accountType}`);
              accountConfig.status = 'DISCONNECTED';
            })
            .catch((error: any) => {
              logger.warn(`⚠️ Error disconnecting from ${accountConfig.brokerName}:`, error);
            })
        );
      }
    }
    
    await Promise.allSettled(disconnectPromises);
    this.accounts.clear();
    this.initialized = false;
  }
}
