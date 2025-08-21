import { TradeSignal, TradeResult } from '../types';
import { ITradeExecutor } from '../types/ITradeExecutor';
import { logger } from '../utils/logger';
import { config, MetaApiAccount } from '../utils/config';
import MetaApi, { MetatraderAccount } from 'metaapi.cloud-sdk';
import * as fs from 'fs';
import * as path from 'path';

export class MultiAccountMetaApiTradeExecutor implements ITradeExecutor {
  private metaApi: MetaApi;
  private accounts: Map<string, { account: MetatraderAccount; connection: any }> = new Map();
  private accountIndex = 0; // For round-robin strategy
  private isInitialized = false;

  constructor() {
    // Initialize with the first account's token (for MetaApi instance)
    this.metaApi = new MetaApi(config.metaApiAccounts[0]?.token || '');
  }

  async initialize(): Promise<void> {
    try {
      logger.info(`🌐 Initializing ${config.metaApiAccounts.length} MetaAPI account(s)...`);

      for (const [index, accountConfig] of config.metaApiAccounts.entries()) {
        await this.initializeAccount(accountConfig, index);
      }

      this.isInitialized = true;
      logger.info(`✅ All ${config.metaApiAccounts.length} MetaAPI accounts initialized successfully!`);
    } catch (error) {
      logger.error('❌ Failed to initialize MetaAPI accounts:', error);
      throw error;
    }
  }

  private async initializeAccount(accountConfig: MetaApiAccount, index: number): Promise<void> {
    try {
      logger.info(`🔄 Initializing account ${index + 1}: ${accountConfig.name || accountConfig.accountId}`);
      
      // Create MetaApi instance for this account if different token
      const metaApiInstance = accountConfig.token === config.metaApiAccounts[0].token 
        ? this.metaApi 
        : new MetaApi(accountConfig.token);

      // Get account
      const account = await metaApiInstance.metatraderAccountApi.getAccount(accountConfig.accountId);
      
      logger.info(`⏳ Waiting for account ${accountConfig.name} deployment...`);
      await account.waitDeployed();

      logger.info(`🔗 Connecting to account ${accountConfig.name}...`);
      const connection = account.getStreamingConnection();
      await connection.connect();

      logger.info(`🔄 Synchronizing account ${accountConfig.name}...`);
      await connection.waitSynchronized();

      this.accounts.set(accountConfig.accountId, { account, connection });
      
      logger.info(`✅ Account ${accountConfig.name} (${accountConfig.accountId}) connected successfully!`);
    } catch (error) {
      logger.error(`❌ Failed to initialize account ${accountConfig.name}:`, error);
      throw error;
    }
  }

  async executeTradeSignal(signal: TradeSignal): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    ticket?: number;
    signalId?: string;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Save signal to file first
      const signalId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const signalWithId = { ...signal, id: signalId, timestamp: new Date().toISOString(), status: 'pending' };
      
      await this.saveSignalToFile(signalWithId);

      // Determine which accounts to execute on
      const selectedAccounts = this.selectAccountsForTrade(signal);
      
      const results: Array<{ accountId: string; success: boolean; error?: string; ticket?: number }> = [];

      // Execute on selected accounts
      for (const accountConfig of selectedAccounts) {
        try {
          const result = await this.executeOnAccount(signal, accountConfig, signalId);
          results.push({ 
            accountId: accountConfig.accountId, 
            success: result.success,
            ticket: result.ticket
          });
          
          if (result.success) {
            logger.info(`✅ Trade executed successfully on account ${accountConfig.name} (${accountConfig.accountId})`);
          }
        } catch (error) {
          logger.error(`❌ Failed to execute trade on account ${accountConfig.name}:`, error);
          results.push({ 
            accountId: accountConfig.accountId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const success = successCount > 0;

      return {
        success,
        message: `Trade executed on ${successCount}/${results.length} accounts`,
        signalId,
        ticket: results.find(r => r.success)?.ticket
      };

    } catch (error) {
      logger.error('❌ Multi-account trade execution failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private selectAccountsForTrade(signal: TradeSignal): MetaApiAccount[] {
    const strategy = config.trading.accountSelectionStrategy;
    
    switch (strategy) {
      case 'all':
        // Execute on all accounts
        return [...config.metaApiAccounts];
        
      case 'weighted':
        // Execute on accounts based on their risk percentage (higher risk = more likely)
        return this.selectWeightedAccounts();
        
      case 'round_robin':
      default:
        // Execute on one account, rotating through them
        const selectedAccount = config.metaApiAccounts[this.accountIndex];
        this.accountIndex = (this.accountIndex + 1) % config.metaApiAccounts.length;
        return selectedAccount ? [selectedAccount] : [];
    }
  }

  private selectWeightedAccounts(): MetaApiAccount[] {
    // Simple weighted selection - accounts with higher risk percentage are more likely to be selected
    const totalRisk = config.metaApiAccounts.reduce((sum, acc) => sum + (acc.riskPercentage || 2), 0);
    const threshold = Math.random() * totalRisk;
    
    let runningSum = 0;
    for (const account of config.metaApiAccounts) {
      runningSum += account.riskPercentage || 2;
      if (runningSum >= threshold) {
        return [account];
      }
    }
    
    // Fallback to first account
    return config.metaApiAccounts.slice(0, 1);
  }

  private async executeOnAccount(signal: TradeSignal, accountConfig: MetaApiAccount, signalId: string): Promise<{
    success: boolean;
    message?: string;
    ticket?: number;
  }> {
    const accountData = this.accounts.get(accountConfig.accountId);
    if (!accountData) {
      throw new Error(`Account ${accountConfig.accountId} not initialized`);
    }

    const { connection } = accountData;

    // Calculate position size based on account-specific settings
    const volume = Math.min(
      accountConfig.maxTradeSize || config.trading.maxTradeSize,
      config.trading.maxTradeSize // Use default since TradeSignal doesn't have volume
    );

    // Create market order using the connection's createMarketOrder method
    logger.info(`📊 Executing ${signal.action} ${volume} ${signal.symbol} on account ${accountConfig.name}`);

    try {
      // Create the market order
      const result = await connection.createMarketBuyOrder(
        signal.symbol, 
        volume, 
        signal.stopLoss,
        signal.targets && signal.targets.length > 0 ? signal.targets[0] : undefined
      );
      
      // Mark signal as executed for this account
      await this.markSignalExecuted(signalId, accountConfig.accountId);

      return {
        success: true,
        message: `Trade executed on account ${accountConfig.name}`,
        ticket: result.orderId
      };
    } catch (error) {
      logger.error(`Failed to execute trade on account ${accountConfig.name}:`, error);
      throw error;
    }
  }

  private async saveSignalToFile(signal: any): Promise<void> {
    const signalsDir = path.join(process.cwd(), 'trade_signals');
    if (!fs.existsSync(signalsDir)) {
      fs.mkdirSync(signalsDir, { recursive: true });
    }

    const filePath = path.join(signalsDir, `${signal.id}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(signal, null, 2));
    logger.info(`💾 Signal saved to file: ${signal.id}`);
  }

  private async markSignalExecuted(signalId: string, accountId: string): Promise<void> {
    try {
      const executedDir = path.join(process.cwd(), 'MT5_Files', 'MQL5', 'Files', 'trade_signals', 'executed');
      if (!fs.existsSync(executedDir)) {
        fs.mkdirSync(executedDir, { recursive: true });
      }

      // Read original signal
      const originalPath = path.join(process.cwd(), 'trade_signals', `${signalId}.json`);
      if (fs.existsSync(originalPath)) {
        const signalData = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
        
        // Mark as executed for this account
        signalData.status = 'executed';
        signalData.executedAt = new Date().toISOString();
        signalData.executedOnAccount = accountId;

        // Save to executed folder
        const executedPath = path.join(executedDir, `${signalId}_${accountId}.json`);
        await fs.promises.writeFile(executedPath, JSON.stringify(signalData, null, 2));
        
        logger.info(`✅ Signal ${signalId} marked as executed on account ${accountId}`);
      }
    } catch (error) {
      logger.error(`Failed to mark signal as executed: ${error}`);
    }
  }

  async closeConnection(): Promise<void> {
    await this.disconnect();
  }

  async getAccountsStatus(): Promise<Array<{ accountId: string; name: string; connected: boolean; balance?: number }>> {
    const statusList = [];
    
    for (const accountConfig of config.metaApiAccounts) {
      const accountData = this.accounts.get(accountConfig.accountId);
      
      if (accountData) {
        try {
          const accountInfo = await accountData.connection.getAccountInformation();
          statusList.push({
            accountId: accountConfig.accountId,
            name: accountConfig.name || accountConfig.accountId,
            connected: accountData.connection.isSynchronized(),
            balance: accountInfo.balance
          });
        } catch (error) {
          statusList.push({
            accountId: accountConfig.accountId,
            name: accountConfig.name || accountConfig.accountId,
            connected: false
          });
        }
      } else {
        statusList.push({
          accountId: accountConfig.accountId,
          name: accountConfig.name || accountConfig.accountId,
          connected: false
        });
      }
    }
    
    return statusList;
  }

  async disconnect(): Promise<void> {
    logger.info('🔄 Disconnecting from all MetaAPI accounts...');
    
    for (const [accountId, { connection }] of this.accounts.entries()) {
      try {
        await connection.close();
        logger.info(`✅ Disconnected from account ${accountId}`);
      } catch (error) {
        logger.error(`❌ Error disconnecting from account ${accountId}:`, error);
      }
    }
    
    this.accounts.clear();
    this.isInitialized = false;
  }
}
