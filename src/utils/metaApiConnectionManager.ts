import { MetatraderAccount } from 'metaapi.cloud-sdk';
import { logger } from '../utils/logger';

interface ConnectionHealth {
  isConnected: boolean;
  isSynchronized: boolean;
  lastHealthCheck: Date;
  consecutiveFailures: number;
  serverHealthStatus?: string;
}

export class MetaApiConnectionManager {
  private connections: Map<string, any> = new Map();
  private healthStatus: Map<string, ConnectionHealth> = new Map();
  private connectionQueue: string[] = [];
  private maxConcurrentConnections = 1; // MetaAPI limit: 10% of accounts
  private isProcessingQueue = false;
  private connectionDelay = 10000; // 10 seconds between connections (MetaAPI recommendation)
  
  constructor() {
    this.startHealthMonitoring();
  }

  async addAccountToQueue(accountId: string, account: MetatraderAccount): Promise<void> {
    if (!this.connectionQueue.includes(accountId)) {
      this.connectionQueue.push(accountId);
      this.initializeHealthStatus(accountId);
    }
    
    if (!this.isProcessingQueue) {
      this.processConnectionQueue();
    }
  }

  private initializeHealthStatus(accountId: string): void {
    this.healthStatus.set(accountId, {
      isConnected: false,
      isSynchronized: false,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0
    });
  }

  private async processConnectionQueue(): Promise<void> {
    this.isProcessingQueue = true;
    
    while (this.connectionQueue.length > 0) {
      const accountId = this.connectionQueue.shift();
      if (!accountId) continue;
      
      try {
        logger.info(`🔗 Processing connection for account: ${accountId}`);
        await this.connectAccountWithHealthCheck(accountId);
        
        // Respect MetaAPI rate limits - wait between connections
        if (this.connectionQueue.length > 0) {
          logger.info(`⏳ Waiting ${this.connectionDelay / 1000}s before next connection (rate limiting)`);
          await new Promise(resolve => setTimeout(resolve, this.connectionDelay));
        }
        
      } catch (error) {
        logger.error(`❌ Failed to connect account ${accountId}:`, error);
        this.updateHealthStatus(accountId, { consecutiveFailures: (this.healthStatus.get(accountId)?.consecutiveFailures || 0) + 1 });
      }
    }
    
    this.isProcessingQueue = false;
  }

  private async connectAccountWithHealthCheck(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Check deployment status
    if (!account.state || account.state === 'UNDEPLOYED') {
      logger.info(`📦 Deploying account: ${accountId}`);
      await account.deploy();
      await this.waitForDeployment(account, 60000); // 1 minute timeout
    }

    // Wait for connection
    logger.info(`🔌 Waiting for account connection: ${accountId}`);
    await this.waitForConnection(account, 45000); // 45 second timeout

    // Get streaming connection with health monitoring
    const connection = account.getStreamingConnection();
    
    // Set up health monitoring before connecting
    this.setupConnectionHealthMonitoring(accountId, connection);
    
    // Connect with timeout
    logger.info(`🔌 Establishing streaming connection: ${accountId}`);
    await Promise.race([
      connection.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 30000))
    ]);

    this.connections.set(accountId, connection);
    
    // Update health status
    this.updateHealthStatus(accountId, {
      isConnected: true,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0
    });

    // Start background synchronization (non-blocking)
    this.startBackgroundSync(accountId, connection);
  }

  private setupConnectionHealthMonitoring(accountId: string, connection: any): void {
    try {
      const healthMonitor = connection.healthMonitor;
      
      // Log initial health status
      logger.info(`📊 Health monitor setup for ${accountId}:`, {
        serverHealth: healthMonitor?.serverHealthStatus,
        uptime: healthMonitor?.uptime
      });
      
      this.updateHealthStatus(accountId, {
        serverHealthStatus: healthMonitor?.serverHealthStatus
      });
      
    } catch (error) {
      logger.warn(`⚠️ Could not setup health monitoring for ${accountId}:`, error);
    }
  }

  private startBackgroundSync(accountId: string, connection: any): void {
    // Don't block on synchronization - do it in background
    setTimeout(async () => {
      try {
        logger.info(`🔄 Starting background sync for ${accountId}`);
        
        // Try to sync with short timeout
        await Promise.race([
          connection.waitSynchronized(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 30000))
        ]);
        
        this.updateHealthStatus(accountId, {
          isSynchronized: true,
          lastHealthCheck: new Date()
        });
        
        logger.info(`✅ Background sync completed for ${accountId}`);
        
      } catch (error) {
        logger.warn(`⚠️ Background sync timeout for ${accountId} - connection still usable:`, error);
        // Don't mark as failed - connection might still work for trading
      }
    }, 5000); // Start sync 5 seconds after connection
  }

  private async waitForDeployment(account: MetatraderAccount, timeout: number): Promise<void> {
    await Promise.race([
      account.waitDeployed(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Deployment timeout')), timeout))
    ]);
  }

  private async waitForConnection(account: MetatraderAccount, timeout: number): Promise<void> {
    await Promise.race([
      account.waitConnected(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeout))
    ]);
  }

  private async getAccount(accountId: string): Promise<MetatraderAccount | null> {
    // This would be implemented to retrieve account from the API
    // For now, return null as placeholder
    return null;
  }

  private updateHealthStatus(accountId: string, updates: Partial<ConnectionHealth>): void {
    const currentStatus = this.healthStatus.get(accountId);
    if (currentStatus) {
      this.healthStatus.set(accountId, { ...currentStatus, ...updates });
    }
  }

  private startHealthMonitoring(): void {
    // Check connection health every 60 seconds
    setInterval(async () => {
      for (const [accountId, connection] of this.connections) {
        try {
          const health = this.healthStatus.get(accountId);
          if (!health) continue;

          // Check if connection is still active
          const isConnected = connection.state === 'CONNECTED';
          const healthMonitor = connection.healthMonitor;
          
          this.updateHealthStatus(accountId, {
            isConnected,
            lastHealthCheck: new Date(),
            serverHealthStatus: healthMonitor?.serverHealthStatus
          });

          if (!isConnected && health.consecutiveFailures < 3) {
            logger.warn(`🔄 Connection lost for ${accountId}, attempting reconnection`);
            this.connectionQueue.push(accountId);
            this.processConnectionQueue();
          }
          
        } catch (error) {
          logger.error(`❌ Health check failed for ${accountId}:`, error);
        }
      }
    }, 60000);
  }

  getConnectionHealth(): Map<string, ConnectionHealth> {
    return this.healthStatus;
  }

  getConnectedAccountsCount(): number {
    return Array.from(this.healthStatus.values()).filter(h => h.isConnected).length;
  }

  async closeAllConnections(): Promise<void> {
    logger.info('🔌 Closing all MetaAPI connections...');
    
    for (const [accountId, connection] of this.connections) {
      try {
        await connection.close();
        logger.info(`✅ Connection closed for ${accountId}`);
      } catch (error) {
        logger.error(`❌ Error closing connection for ${accountId}:`, error);
      }
    }
    
    this.connections.clear();
    this.healthStatus.clear();
    this.connectionQueue.length = 0;
  }
}
