/**
 * MetaAPI Connection Pool Service
 * Manages connection pooling and reuse to prevent repeated connections
 */

import MetaApi from 'metaapi.cloud-sdk';
import { logger } from '../utils/logger';
import { MetaApiRateLimiter } from './MetaApiRateLimiter';

interface PooledConnection {
  connection: any;
  accountId: string;
  lastUsed: Date;
  isConnected: boolean;
  isSynchronized: boolean;
  createdAt: Date;
  useCount: number;
}

interface ConnectionHealth {
  isHealthy: boolean;
  lastCheck: Date;
  errorCount: number;
}

export class MetaApiConnectionPool {
  private connections: Map<string, PooledConnection>;
  private healthStatus: Map<string, ConnectionHealth>;
  private api: MetaApi;
  private rateLimiter: MetaApiRateLimiter;
  private readonly maxConnections: number;
  private readonly connectionTimeout: number;
  private readonly healthCheckInterval: number;
  private cleanupInterval: NodeJS.Timeout | null;
  private healthCheckTimer: NodeJS.Timeout | null;

  constructor(maxConnections: number = 50, connectionTimeout: number = 30 * 60 * 1000) {
    this.connections = new Map();
    this.healthStatus = new Map();
    this.api = new MetaApi(process.env.METAAPI_TOKEN!);
    this.rateLimiter = new MetaApiRateLimiter();
    this.maxConnections = maxConnections;
    this.connectionTimeout = connectionTimeout; // 30 minutes default
    this.healthCheckInterval = 2 * 60 * 1000; // Reduced to 2 minutes for faster detection
    this.cleanupInterval = null;
    this.healthCheckTimer = null;

    this.startMaintenanceTasks();
  }

  /**
   * Get or create a connection for an account
   */
  async getConnection(accountId: string, forceReconnect: boolean = false): Promise<any> {
    try {
      // Check if we have a healthy existing connection
      if (!forceReconnect && this.connections.has(accountId)) {
        const pooled = this.connections.get(accountId)!;
        const health = this.healthStatus.get(accountId);
        
        if (health?.isHealthy && pooled.isConnected && pooled.isSynchronized) {
          pooled.lastUsed = new Date();
          pooled.useCount++;
          logger.debug(`Reusing existing connection for account ${accountId} (uses: ${pooled.useCount})`);
          return pooled.connection;
        }
      }

      // Create new connection with rate limiting
      return await this.rateLimiter.executeWithRateLimit(
        'connect',
        () => this.createConnection(accountId),
        accountId
      );

    } catch (error) {
      logger.error(`Failed to get connection for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new connection
   */
  private async createConnection(accountId: string): Promise<any> {
    try {
      // Remove old connection if exists
      await this.removeConnection(accountId);

      // Check connection pool limit
      if (this.connections.size >= this.maxConnections) {
        await this.evictOldestConnection();
      }

      logger.info(`Creating new connection for account ${accountId}`);

      // Get account and create RPC connection
      const account = await this.api.metatraderAccountApi.getAccount(accountId);
      const connection = account.getRPCConnection();

      // Set client-id header for load balancing
      const clientId = this.rateLimiter.getClientIdHeader();
      if ((connection as any).setClientIdHeader) {
        (connection as any).setClientIdHeader(clientId);
      }

      // Connect with timeout
      await this.connectWithTimeout(connection, 30000);

      // Try to synchronize (but don't fail if offline)
      let isSynchronized = false;
      try {
        await this.synchronizeWithTimeout(connection, 30000);
        isSynchronized = true;
        logger.info(`Account ${accountId} synchronized successfully`);
      } catch (syncError) {
        logger.warn(`Account ${accountId} synchronization failed (terminal may be offline):`, syncError);
        // Continue with unsynchronized connection for RPC calls
      }

      // Store in pool
      const pooledConnection: PooledConnection = {
        connection,
        accountId,
        lastUsed: new Date(),
        isConnected: true,
        isSynchronized,
        createdAt: new Date(),
        useCount: 1
      };

      this.connections.set(accountId, pooledConnection);
      this.healthStatus.set(accountId, {
        isHealthy: true,
        lastCheck: new Date(),
        errorCount: 0
      });

      logger.info(`Connection pool: ${this.connections.size}/${this.maxConnections} connections active`);
      
      return connection;

    } catch (error) {
      logger.error(`Failed to create connection for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(connection: any, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      connection.connect()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Synchronize with timeout
   */
  private async synchronizeWithTimeout(connection: any, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Synchronization timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      connection.waitSynchronized()
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Execute API call with connection from pool
   */
  async executeWithConnection<T>(
    accountId: string,
    operation: (connection: any) => Promise<T>,
    operationName: string = 'unknown'
  ): Promise<T> {
    let connection: any = null;
    
    try {
      connection = await this.getConnection(accountId);
      
      return await this.rateLimiter.executeWithRateLimit(
        operationName,
        () => operation(connection),
        accountId
      );

    } catch (error: any) {
      // Mark connection as unhealthy if error is connection-related
      if (this.isConnectionError(error)) {
        this.markConnectionUnhealthy(accountId, error);
      }
      
      throw error;
    }
  }

  /**
   * Remove a connection from the pool
   */
  async removeConnection(accountId: string): Promise<void> {
    const pooled = this.connections.get(accountId);
    if (pooled) {
      try {
        if (pooled.connection && pooled.isConnected) {
          // Don't explicitly close - MetaAPI manages connection lifecycle
          logger.debug(`Removing connection for account ${accountId}`);
        }
      } catch (error) {
        logger.warn(`Error closing connection for ${accountId}:`, error);
      }
      
      this.connections.delete(accountId);
      this.healthStatus.delete(accountId);
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    totalConnections: number;
    connectedAccounts: string[];
    synchronizedAccounts: string[];
    healthyConnections: number;
    avgUseCount: number;
    oldestConnection: Date | null;
    rateLimitStatus: any;
  } {
    const connectedAccounts: string[] = [];
    const synchronizedAccounts: string[] = [];
    let totalUseCount = 0;
    let oldestConnection: Date | null = null;
    let healthyConnections = 0;

    this.connections.forEach((pooled, accountId) => {
      if (pooled.isConnected) {
        connectedAccounts.push(accountId);
      }
      if (pooled.isSynchronized) {
        synchronizedAccounts.push(accountId);
      }
      
      totalUseCount += pooled.useCount;
      
      if (!oldestConnection || pooled.createdAt < oldestConnection) {
        oldestConnection = pooled.createdAt;
      }

      const health = this.healthStatus.get(accountId);
      if (health?.isHealthy) {
        healthyConnections++;
      }
    });

    return {
      totalConnections: this.connections.size,
      connectedAccounts,
      synchronizedAccounts,
      healthyConnections,
      avgUseCount: this.connections.size > 0 ? totalUseCount / this.connections.size : 0,
      oldestConnection,
      rateLimitStatus: this.rateLimiter.getRateLimitStatus()
    };
  }

  /**
   * Health check for connections
   */
  private async performHealthCheck(): Promise<void> {
    logger.debug(`Performing health check on ${this.connections.size} connections`);
    
    const healthPromises = Array.from(this.connections.entries()).map(
      async ([accountId, pooled]) => {
        try {
          // Simple health check - get account information
          if (pooled.connection && pooled.isConnected) {
            await this.rateLimiter.executeWithRateLimit(
              'getAccountInformation',
              () => pooled.connection.getAccountInformation(),
              accountId
            );
            
            // Mark as healthy
            const health = this.healthStatus.get(accountId);
            if (health) {
              health.isHealthy = true;
              health.lastCheck = new Date();
              health.errorCount = 0;
            }
          }
        } catch (error) {
          this.markConnectionUnhealthy(accountId, error);
        }
      }
    );

    await Promise.allSettled(healthPromises);
  }

  /**
   * Mark connection as unhealthy
   */
  private markConnectionUnhealthy(accountId: string, error: any): void {
    const health = this.healthStatus.get(accountId);
    if (health) {
      health.isHealthy = false;
      health.lastCheck = new Date();
      health.errorCount++;
      
      logger.warn(`Connection for ${accountId} marked unhealthy (errors: ${health.errorCount}):`, error.message);
      
      // Remove connection if too many errors
      if (health.errorCount >= 3) {
        logger.warn(`Removing unhealthy connection for ${accountId} after ${health.errorCount} errors`);
        this.removeConnection(accountId);
      }
    }
  }

  /**
   * Cleanup old connections
   */
  private async cleanupOldConnections(): Promise<void> {
    const now = Date.now();
    const connectionsToRemove: string[] = [];

    this.connections.forEach((pooled, accountId) => {
      const age = now - pooled.lastUsed.getTime();
      
      if (age > this.connectionTimeout) {
        connectionsToRemove.push(accountId);
      }
    });

    if (connectionsToRemove.length > 0) {
      logger.info(`Cleaning up ${connectionsToRemove.length} old connections`);
      
      for (const accountId of connectionsToRemove) {
        await this.removeConnection(accountId);
      }
    }
  }

  /**
   * Evict oldest connection when pool is full
   */
  private async evictOldestConnection(): Promise<void> {
    let oldestAccountId: string | null = null;
    let oldestTime: Date | null = null;

    this.connections.forEach((pooled, accountId) => {
      if (!oldestTime || pooled.lastUsed < oldestTime) {
        oldestTime = pooled.lastUsed;
        oldestAccountId = accountId;
      }
    });

    if (oldestAccountId) {
      logger.info(`Evicting oldest connection: ${oldestAccountId}`);
      await this.removeConnection(oldestAccountId);
    }
  }

  /**
   * Check if error is connection-related
   */
  private isConnectionError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return errorMessage.includes('connection') ||
           errorMessage.includes('timeout') ||
           errorMessage.includes('network') ||
           errorMessage.includes('disconnected') ||
           error?.code === 'ECONNRESET';
  }

  /**
   * Start maintenance tasks
   */
  private startMaintenanceTasks(): void {
    // Cleanup old connections every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldConnections();
    }, 10 * 60 * 1000);

    // Health check every 5 minutes
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Shutdown the connection pool
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down connection pool...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Remove all connections
    const accountIds = Array.from(this.connections.keys());
    for (const accountId of accountIds) {
      await this.removeConnection(accountId);
    }

    logger.info('Connection pool shutdown complete');
  }
}