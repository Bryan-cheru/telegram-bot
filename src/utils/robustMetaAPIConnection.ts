// Robust MetaAPI Connection Manager
// File: src/utils/robustMetaAPIConnection.ts

import { logger } from './logger';

export class RobustMetaAPIConnection {
  private static readonly MAX_RETRIES = 3;
  private static readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
  private static readonly SYNC_TIMEOUT = 60000; // 60 seconds
  
  /**
   * Connect to MetaAPI account with retry logic
   */
  static async connectWithRetry(api: any, accountId: string, brokerName: string): Promise<any> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        logger.info(`🔗 Connecting to ${brokerName} (Attempt ${attempt}/${this.MAX_RETRIES})...`);
        
        const account = await api.metatraderAccountApi.getAccount(accountId);
        const connection = account.getRPCConnection();
        
        // Set shorter timeouts
        await Promise.race([
          connection.connect(),
          this.createTimeout(this.CONNECTION_TIMEOUT, `${brokerName} connection timeout`)
        ]);
        
        logger.info(`✅ ${brokerName} connected successfully!`);
        
        // Start synchronization with timeout
        const syncSuccess = await this.synchronizeWithTimeout(connection, brokerName);
        if (syncSuccess) {
          return { account, connection, status: 'CONNECTED' };
        } else {
          logger.warn(`⚠️ ${brokerName} synchronization failed, but keeping connection`);
          return { account, connection, status: 'CONNECTED_NO_SYNC' };
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`❌ ${brokerName} connection attempt ${attempt} failed: ${errorMessage}`);
        
        if (attempt < this.MAX_RETRIES) {
          const delay = attempt * 2000; // Exponential backoff
          logger.info(`⏳ Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }
    
    logger.error(`❌ ${brokerName} failed after ${this.MAX_RETRIES} attempts`);
    return { account: null, connection: null, status: 'FAILED' };
  }
  
  /**
   * Synchronize with timeout and graceful degradation
   */
  private static async synchronizeWithTimeout(connection: any, brokerName: string): Promise<boolean> {
    try {
      logger.info(`🔄 Synchronizing ${brokerName}...`);
      
      await Promise.race([
        connection.waitSynchronized(),
        this.createTimeout(this.SYNC_TIMEOUT, `${brokerName} synchronization timeout`)
      ]);
      
      logger.info(`✅ ${brokerName} synchronized successfully!`);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('timeout')) {
        logger.warn(`⚠️ ${brokerName} synchronization timeout - will use partial data`);
      } else {
        logger.warn(`⚠️ ${brokerName} synchronization failed: ${errorMessage}`);
      }
      return false;
    }
  }
  
  /**
   * Get symbols with fallback support
   */
  static async getSymbolsWithFallback(connection: any, brokerName: string): Promise<any[]> {
    try {
      if (!connection.terminalState || !connection.terminalState.specifications) {
        logger.warn(`⚠️ No terminal state for ${brokerName}, using fallback symbols`);
        return this.getFallbackSymbols();
      }
      
      const specs = connection.terminalState.specifications;
      logger.info(`📈 Found ${specs.length} symbols on ${brokerName}`);
      
      if (specs.length === 0) {
        logger.warn(`⚠️ No symbols from ${brokerName}, using fallback symbols`);
        return this.getFallbackSymbols();
      }
      
      return specs;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Error getting symbols from ${brokerName}: ${errorMessage}`);
      return this.getFallbackSymbols();
    }
  }
  
  /**
   * Get fallback symbols for immediate trading capability
   */
  private static getFallbackSymbols(): any[] {
    return [
      { symbol: 'EURUSD', description: 'Euro vs US Dollar', digits: 5 },
      { symbol: 'GBPUSD', description: 'British Pound vs US Dollar', digits: 5 },
      { symbol: 'USDJPY', description: 'US Dollar vs Japanese Yen', digits: 3 },
      { symbol: 'XAUUSD', description: 'Gold vs US Dollar', digits: 2 },
      { symbol: 'SILVER', description: 'Silver vs US Dollar', digits: 3 },
      { symbol: 'XAGUSD', description: 'Silver vs US Dollar (XAG)', digits: 3 },
      { symbol: 'US30', description: 'US30 Index', digits: 1 },
      { symbol: 'BTCUSD', description: 'Bitcoin vs US Dollar', digits: 2 }
    ];
  }
  
  /**
   * Create timeout promise
   */
  private static createTimeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
  
  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Health check for connection
   */
  static async healthCheck(connection: any, brokerName: string): Promise<boolean> {
    try {
      if (!connection || !connection.connected) {
        return false;
      }
      
      // Try to get account info as health check
      await connection.getAccountInformation();
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ ${brokerName} health check failed: ${errorMessage}`);
      return false;
    }
  }
}
