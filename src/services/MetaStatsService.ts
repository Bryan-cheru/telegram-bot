/**
 * MetaStats Service - Trading Performance Analytics
 * Provides real-time trading metrics similar to Myfxbook
 */

import { logger } from '../utils/logger';
import https from 'https';

// MetaStats endpoint has an expired certificate — bypass SSL verification for this service only
const metaStatsAgent = new https.Agent({ rejectUnauthorized: false });

interface MetricsData {
  profitFactor?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  winRate?: number;
  totalTrades?: number;
  monthlyGrowth?: number;
  equity?: number;
  balance?: number;
  dailyGrowth?: any[];
  currencyMetrics?: any;
}

interface TradeMetrics {
  gain: number;
  pips: number;
  duration: number;
  symbol: string;
  type: string;
  openTime: Date;
  closeTime: Date;
}

export class MetaStatsService {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = 'https://metastats-api-v1.agiliumtrade.agiliumtrade.ai';
    this.token = process.env.METAAPI_TOKEN!;
  }

  /**
   * Get comprehensive trading metrics for an account
   */
  async getAccountMetrics(accountId: string, options?: {
    from?: Date;
    to?: Date;
    includeOpenPositions?: boolean;
  }): Promise<MetricsData> {
    try {
      const queryParams = new URLSearchParams();
      
      if (options?.from) {
        queryParams.append('from', options.from.toISOString());
      }
      if (options?.to) {
        queryParams.append('to', options.to.toISOString());
      }
      if (options?.includeOpenPositions) {
        queryParams.append('includeOpenPositions', 'true');
      }

      const response = await fetch(
        `${this.baseUrl}/users/current/accounts/${accountId}/metrics?${queryParams}`,
        {
          method: 'GET',
          headers: {
            'auth-token': this.token,
            'Content-Type': 'application/json'
          },
          // @ts-ignore — Node fetch accepts agent
          agent: metaStatsAgent
        }
      );

      if (!response.ok) {
        throw new Error(`MetaStats API error: ${response.status} ${response.statusText}`);
      }

      const metrics = await response.json() as any;
      
      return {
        profitFactor: metrics.profitFactor || 0,
        sharpeRatio: metrics.sharpeRatio || 0,
        maxDrawdown: (metrics.maxDrawdown || 0) * 100, // Convert to percentage
        winRate: metrics.winRate || 0,
        totalTrades: metrics.trades || 0,
        monthlyGrowth: metrics.monthlyGrowth || 0,
        equity: metrics.equity || 0,
        balance: metrics.balance || 0,
        dailyGrowth: metrics.dailyGrowthMetrics || [],
        currencyMetrics: metrics.currencyMetrics || null
      };

    } catch (error) {
      logger.error('MetaStats metrics retrieval failed:', error);
      return this.getFallbackMetrics();
    }
  }

  /**
   * Get historical trades with performance metrics
   */
  async getHistoricalTrades(accountId: string, options?: {
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<TradeMetrics[]> {
    try {
      const queryParams = new URLSearchParams();
      
      if (options?.from) queryParams.append('from', options.from.toISOString());
      if (options?.to) queryParams.append('to', options.to.toISOString());
      if (options?.limit) queryParams.append('limit', options.limit.toString());
      if (options?.offset) queryParams.append('offset', options.offset.toString());

      const response = await fetch(
        `${this.baseUrl}/users/current/accounts/${accountId}/historical-trades?${queryParams}`,
        {
          method: 'GET',
          headers: {
            'auth-token': this.token,
            'Content-Type': 'application/json'
          },
          // @ts-ignore — Node fetch accepts agent
          agent: metaStatsAgent
        }
      );

      if (!response.ok) {
        throw new Error(`MetaStats trades API error: ${response.status}`);
      }

      const trades = await response.json() as any[];
      
      return trades.map((trade: any) => ({
        gain: trade.gain || 0,
        pips: trade.pips || 0,
        duration: trade.durationInMinutes || 0,
        symbol: trade.symbol,
        type: trade.type,
        openTime: new Date(trade.openTime),
        closeTime: new Date(trade.closeTime)
      }));

    } catch (error) {
      logger.error('MetaStats historical trades retrieval failed:', error);
      return [];
    }
  }

  /**
   * Get open trades with current metrics
   */
  async getOpenTrades(accountId: string): Promise<TradeMetrics[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/users/current/accounts/${accountId}/open-trades`,
        {
          method: 'GET',
          headers: {
            'auth-token': this.token,
            'Content-Type': 'application/json'
          },
          // @ts-ignore — Node fetch accepts agent
          agent: metaStatsAgent
        }
      );

      if (!response.ok) {
        throw new Error(`MetaStats open trades API error: ${response.status}`);
      }

      const openTrades = await response.json() as any[];
      
      return openTrades.map((trade: any) => ({
        gain: trade.gain || 0,
        pips: trade.pips || 0,
        duration: trade.durationInMinutes || 0,
        symbol: trade.symbol,
        type: trade.type,
        openTime: new Date(trade.openTime),
        closeTime: new Date() // Current time for open trades
      }));

    } catch (error) {
      logger.error('MetaStats open trades retrieval failed:', error);
      return [];
    }
  }

  /**
   * Calculate performance summary for dashboard
   */
  async getPerformanceSummary(accountId: string): Promise<{
    summary: MetricsData;
    recentTrades: TradeMetrics[];
    openTrades: TradeMetrics[];
  }> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const [summary, recentTrades, openTrades] = await Promise.all([
        this.getAccountMetrics(accountId, { 
          from: thirtyDaysAgo, 
          includeOpenPositions: true 
        }),
        this.getHistoricalTrades(accountId, { 
          from: thirtyDaysAgo, 
          limit: 50 
        }),
        this.getOpenTrades(accountId)
      ]);

      return {
        summary,
        recentTrades,
        openTrades
      };

    } catch (error) {
      logger.error('MetaStats performance summary failed:', error);
      return {
        summary: this.getFallbackMetrics(),
        recentTrades: [],
        openTrades: []
      };
    }
  }

  /**
   * Reset metrics for an account (useful for testing)
   */
  async resetMetrics(accountId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/users/current/accounts/${accountId}/metrics`,
        {
          method: 'DELETE',
          headers: {
            'auth-token': this.token,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.ok;

    } catch (error) {
      logger.error('MetaStats reset metrics failed:', error);
      return false;
    }
  }

  /**
   * Fallback metrics when API is unavailable
   */
  private getFallbackMetrics(): MetricsData {
    return {
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      totalTrades: 0,
      monthlyGrowth: 0,
      equity: 0,
      balance: 0,
      dailyGrowth: [],
      currencyMetrics: null
    };
  }

  /**
   * Validate MetaStats API connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/users/current`, {
        method: 'GET',
        headers: {
          'auth-token': this.token,
          'Content-Type': 'application/json'
        },
        // @ts-ignore — Node fetch accepts agent
        agent: metaStatsAgent
      });

      return response.ok;

    } catch (error) {
      logger.error('MetaStats connection validation failed:', error);
      return false;
    }
  }
}