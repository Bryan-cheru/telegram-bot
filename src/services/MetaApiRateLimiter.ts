/**
 * MetaAPI Rate Limiting System
 * Implements comprehensive rate limiting for MetaAPI calls
 */

import { logger } from '../utils/logger';

interface ApiCall {
  method: string;
  credits: number;
  timestamp: number;
  accountId?: string;
}

interface RateLimitConfig {
  totalCreditsPerSecond: number;
  totalCreditsPerMinute: number;
  totalCreditsPerHour: number;
  serverCreditsPerSecond: number;
  accountCreditsPerTenSeconds: number;
}

interface RateLimitState {
  credits: number;
  resetTime: number;
  calls: ApiCall[];
}

export class MetaApiRateLimiter {
  private config: RateLimitConfig;
  private globalState: RateLimitState;
  private serverStates: Map<string, RateLimitState>;
  private accountStates: Map<string, RateLimitState>;
  private currentServerId: string;
  private serverRotationIndex: number;
  private readonly serverIds: string[];

  // API method costs in CPU credits
  private readonly API_COSTS = {
    // Account information
    'getAccountInformation': 50,
    'getPositions': 50,
    'getPosition': 50,
    'getOrders': 50,
    'getOrder': 50,
    
    // Trading operations
    'trade': 10,
    'createMarketBuyOrder': 10,
    'createMarketSellOrder': 10,
    'createLimitBuyOrder': 10,
    'createLimitSellOrder': 10,
    
    // Market data
    'getSymbols': 500, // Very expensive!
    'getSymbolSpecification': 50,
    'getSymbolPrice': 50,
    'getCurrentCandles': 50,
    'getCurrentTick': 50,
    'getCurrentBook': 50,
    
    // History operations
    'getHistoryOrdersByTimeRange': 75, // + 0.65 per order
    'getDealsByTimeRange': 75, // + 0.65 per deal
    'getHistoryOrdersByTicket': 50,
    'getDealsByTicket': 50,
    
    // Synchronization
    'refreshTerminalState': 50,
    'refreshSymbolQuotes': 10,
    'waitSynchronized': 0, // No credits for waiting
    
    // Subscription management
    'subscribeToMarketData': 50,
    'unsubscribeFromMarketData': 50
  };

  constructor(accountMultiplier: number = 1) {
    this.config = {
      totalCreditsPerSecond: 1200 * accountMultiplier, // Increased from 1000
      totalCreditsPerMinute: 7500 * accountMultiplier, // Increased from 6000
      totalCreditsPerHour: 22000 * accountMultiplier, // Increased from 18000
      serverCreditsPerSecond: 2500, // Increased from 2000
      accountCreditsPerTenSeconds: 6000 // Increased from 5000
    };

    this.globalState = {
      credits: this.config.totalCreditsPerSecond,
      resetTime: Date.now() + 1000,
      calls: []
    };

    this.serverStates = new Map();
    this.accountStates = new Map();
    this.serverRotationIndex = 0;
    
    // Server IDs for load balancing
    this.serverIds = [
      'srv-1', 'srv-2', 'srv-3', 'srv-4', 'srv-5',
      'srv-6', 'srv-7', 'srv-8', 'srv-9', 'srv-10'
    ];
    this.currentServerId = this.serverIds[0];

    this.setupCleanupInterval();
  }

  /**
   * Check if API call is allowed and wait if necessary
   */
  async checkRateLimit(method: string, accountId?: string): Promise<{
    allowed: boolean;
    waitTime?: number;
    serverId?: string;
    credits: number;
  }> {
    const credits = this.getMethodCost(method);
    
    try {
      // Check all rate limit tiers
      const globalCheck = await this.checkGlobalLimit(credits);
      const serverCheck = await this.checkServerLimit(credits);
      const accountCheck = accountId ? await this.checkAccountLimit(credits, accountId) : { allowed: true, waitTime: 0 };

      if (!globalCheck.allowed) {
        logger.warn(`Global rate limit hit for ${method}. Wait: ${globalCheck.waitTime}ms`);
        return { allowed: false, waitTime: globalCheck.waitTime, credits };
      }

      if (!serverCheck.allowed) {
        // Try rotating to different server
        const newServerId = this.rotateServer();
        logger.info(`Server rate limit hit. Rotating to server: ${newServerId}`);
        
        const newServerCheck = await this.checkServerLimit(credits, newServerId);
        if (!newServerCheck.allowed) {
          return { allowed: false, waitTime: newServerCheck.waitTime, credits };
        }
      }

      if (!accountCheck.allowed && accountId) {
        logger.warn(`Account rate limit hit for ${accountId}. Wait: ${accountCheck.waitTime}ms`);
        return { allowed: false, waitTime: accountCheck.waitTime, credits };
      }

      // All checks passed - consume credits
      this.consumeCredits(method, credits, accountId);
      
      return {
        allowed: true,
        serverId: this.currentServerId,
        credits
      };

    } catch (error) {
      logger.error('Rate limit check failed:', error);
      return { allowed: false, credits };
    }
  }

  /**
   * Execute API call with rate limiting
   */
  async executeWithRateLimit<T>(
    method: string,
    apiCall: () => Promise<T>,
    accountId?: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const rateLimitResult = await this.checkRateLimit(method, accountId);
        
        if (!rateLimitResult.allowed) {
          if (rateLimitResult.waitTime && rateLimitResult.waitTime > 0) {
            logger.info(`Rate limited. Waiting ${rateLimitResult.waitTime}ms before retry ${attempt}/${maxRetries}`);
            await this.wait(rateLimitResult.waitTime);
            continue;
          } else {
            throw new Error(`Rate limit exceeded for ${method}`);
          }
        }

        // Execute the API call
        const result = await apiCall();
        
        logger.debug(`API call ${method} completed successfully. Credits used: ${rateLimitResult.credits}`);
        return result;

      } catch (error: any) {
        lastError = error;
        
        // Check if it's a MetaAPI rate limit error
        if (this.isRateLimitError(error)) {
          const waitTime = this.parseRecommendedRetryTime(error);
          if (waitTime > 0) {
            logger.warn(`MetaAPI rate limit error. Waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
            await this.wait(waitTime);
            continue;
          }
        }

        // If it's not a rate limit error, or we can't parse retry time, throw immediately
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff for other errors
        const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await this.wait(backoffTime);
      }
    }

    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    global: RateLimitState;
    server: RateLimitState;
    currentServer: string;
    accountCount: number;
  } {
    return {
      global: { ...this.globalState },
      server: this.serverStates.get(this.currentServerId) || this.createServerState(),
      currentServer: this.currentServerId,
      accountCount: this.accountStates.size
    };
  }

  private async checkGlobalLimit(credits: number): Promise<{ allowed: boolean; waitTime?: number }> {
    this.refreshGlobalCredits();
    
    if (this.globalState.credits >= credits) {
      return { allowed: true };
    }

    const waitTime = this.globalState.resetTime - Date.now();
    return { allowed: false, waitTime: Math.max(0, waitTime) };
  }

  private async checkServerLimit(credits: number, serverId?: string): Promise<{ allowed: boolean; waitTime?: number }> {
    const targetServerId = serverId || this.currentServerId;
    let serverState = this.serverStates.get(targetServerId);
    
    if (!serverState) {
      serverState = this.createServerState();
      this.serverStates.set(targetServerId, serverState);
    }

    this.refreshServerCredits(serverState);
    
    if (serverState.credits >= credits) {
      return { allowed: true };
    }

    const waitTime = serverState.resetTime - Date.now();
    return { allowed: false, waitTime: Math.max(0, waitTime) };
  }

  private async checkAccountLimit(credits: number, accountId: string): Promise<{ allowed: boolean; waitTime?: number }> {
    let accountState = this.accountStates.get(accountId);
    
    if (!accountState) {
      accountState = {
        credits: this.config.accountCreditsPerTenSeconds,
        resetTime: Date.now() + 10000,
        calls: []
      };
      this.accountStates.set(accountId, accountState);
    }

    this.refreshAccountCredits(accountState);
    
    if (accountState.credits >= credits) {
      return { allowed: true };
    }

    const waitTime = accountState.resetTime - Date.now();
    return { allowed: false, waitTime: Math.max(0, waitTime) };
  }

  private consumeCredits(method: string, credits: number, accountId?: string): void {
    const now = Date.now();
    
    // Global consumption
    this.globalState.credits -= credits;
    this.globalState.calls.push({ method, credits, timestamp: now, accountId });

    // Server consumption
    const serverState = this.serverStates.get(this.currentServerId) || this.createServerState();
    serverState.credits -= credits;
    serverState.calls.push({ method, credits, timestamp: now, accountId });
    this.serverStates.set(this.currentServerId, serverState);

    // Account consumption
    if (accountId) {
      const accountState = this.accountStates.get(accountId);
      if (accountState) {
        accountState.credits -= credits;
        accountState.calls.push({ method, credits, timestamp: now });
      }
    }
  }

  private refreshGlobalCredits(): void {
    const now = Date.now();
    if (now >= this.globalState.resetTime) {
      this.globalState.credits = this.config.totalCreditsPerSecond;
      this.globalState.resetTime = now + 1000;
      this.globalState.calls = [];
    }
  }

  private refreshServerCredits(serverState: RateLimitState): void {
    const now = Date.now();
    if (now >= serverState.resetTime) {
      serverState.credits = this.config.serverCreditsPerSecond;
      serverState.resetTime = now + 1000;
      serverState.calls = [];
    }
  }

  private refreshAccountCredits(accountState: RateLimitState): void {
    const now = Date.now();
    if (now >= accountState.resetTime) {
      accountState.credits = this.config.accountCreditsPerTenSeconds;
      accountState.resetTime = now + 10000;
      accountState.calls = [];
    }
  }

  private createServerState(): RateLimitState {
    return {
      credits: this.config.serverCreditsPerSecond,
      resetTime: Date.now() + 1000,
      calls: []
    };
  }

  private rotateServer(): string {
    this.serverRotationIndex = (this.serverRotationIndex + 1) % this.serverIds.length;
    this.currentServerId = this.serverIds[this.serverRotationIndex];
    return this.currentServerId;
  }

  private getMethodCost(method: string): number {
    return this.API_COSTS[method as keyof typeof this.API_COSTS] || 50; // Default cost
  }

  private isRateLimitError(error: any): boolean {
    return error?.message?.includes('TooManyRequestsError') ||
           error?.message?.includes('rate limit') ||
           error?.status === 429;
  }

  private parseRecommendedRetryTime(error: any): number {
    try {
      if (error?.metadata?.recommendedRetryTime) {
        const retryTime = new Date(error.metadata.recommendedRetryTime).getTime();
        return Math.max(0, retryTime - Date.now());
      }
    } catch (parseError) {
      logger.warn('Could not parse recommended retry time:', parseError);
    }
    return 1000; // Default 1 second wait
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupCleanupInterval(): void {
    // Clean up old call records every minute
    setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      
      this.globalState.calls = this.globalState.calls.filter(call => call.timestamp > oneHourAgo);
      
      this.serverStates.forEach(serverState => {
        serverState.calls = serverState.calls.filter(call => call.timestamp > oneHourAgo);
      });

      this.accountStates.forEach(accountState => {
        accountState.calls = accountState.calls.filter(call => call.timestamp > oneHourAgo);
      });
    }, 60000);
  }

  /**
   * Get client-id header for server load balancing
   */
  getClientIdHeader(): string {
    return `client-${this.currentServerId}`;
  }
}