/**
 * Signal History Service
 * Manages signal processing history and execution results
 * Part of Phase 4: Modern Trade Execution
 */

import { DatabaseModels } from '../database/models';
import { logger } from '../utils/logger';

export interface SignalData {
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  lotSize?: number;
  confidence: number;
}

export interface ExecutionResult {
  success: boolean;
  tradeId?: string;
  error?: string;
  executedAt?: Date;
  actualLotSize?: number;
}

export interface RiskValidation {
  passed: boolean;
  violations?: string[];
}

export interface SignalHistory {
  _id?: string;
  userId: string;
  channelId: string;
  signalData: SignalData;
  executionResult: ExecutionResult;
  riskValidation: RiskValidation;
  processedAt: Date;
  originalMessageId: number;
}

/**
 * Service for managing signal processing history
 */
export class SignalHistoryService {
  private static instance: SignalHistoryService;
  private models: any;
  private initialized = false;

  private constructor() {}

  public static getInstance(): SignalHistoryService {
    if (!SignalHistoryService.instance) {
      SignalHistoryService.instance = new SignalHistoryService();
    }
    return SignalHistoryService.instance;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.models = await DatabaseModels.getModels();
      this.initialized = true;
      logger.info('📊 Signal History Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Signal History Service:', error);
      throw error;
    }
  }

  /**
   * Record a processed signal
   */
  async recordSignal(
    userId: string,
    channelId: string,
    signalData: SignalData,
    executionResult: ExecutionResult,
    riskValidation: RiskValidation,
    originalMessageId: number
  ): Promise<SignalHistory> {
    await this.initialize();

    try {
      const signalRecord = new this.models.SignalHistory({
        userId,
        channelId,
        signalData,
        executionResult,
        riskValidation,
        processedAt: new Date(),
        originalMessageId
      });

      await signalRecord.save();

      logger.info(`📊 Signal recorded: ${userId} -> ${signalData.symbol} ${signalData.action}`);
      return signalRecord.toObject();

    } catch (error) {
      logger.error('❌ Failed to record signal:', error);
      throw error;
    }
  }

  /**
   * Get user's signal history
   */
  async getUserSignalHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      channelId?: string;
      symbol?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    signals: SignalHistory[];
    total: number;
    stats: {
      totalSignals: number;
      successfulTrades: number;
      failedTrades: number;
      successRate: number;
    };
  }> {
    await this.initialize();

    try {
      const {
        limit = 50,
        offset = 0,
        channelId,
        symbol,
        startDate,
        endDate
      } = options;

      // Build query
      const query: any = { userId };
      
      if (channelId) query.channelId = channelId;
      if (symbol) query['signalData.symbol'] = symbol;
      if (startDate || endDate) {
        query.processedAt = {};
        if (startDate) query.processedAt.$gte = startDate;
        if (endDate) query.processedAt.$lte = endDate;
      }

      // Get signals with pagination
      const [signals, total] = await Promise.all([
        this.models.SignalHistory.find(query)
          .sort({ processedAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        this.models.SignalHistory.countDocuments(query)
      ]);

      // Calculate statistics
      const stats = await this.calculateUserStats(userId, query);

      return {
        signals,
        total,
        stats
      };

    } catch (error) {
      logger.error('❌ Failed to get user signal history:', error);
      throw error;
    }
  }

  /**
   * Get specific signal details
   */
  async getSignalById(signalId: string, userId?: string): Promise<SignalHistory | null> {
    await this.initialize();

    try {
      const query: any = { _id: signalId };
      if (userId) query.userId = userId;

      const signal = await this.models.SignalHistory.findOne(query).lean();
      return signal;

    } catch (error) {
      logger.error('❌ Failed to get signal by ID:', error);
      throw error;
    }
  }

  /**
   * Calculate user statistics
   */
  private async calculateUserStats(userId: string, baseQuery: any): Promise<{
    totalSignals: number;
    successfulTrades: number;
    failedTrades: number;
    successRate: number;
  }> {
    const pipeline = [
      { $match: { ...baseQuery, userId } },
      {
        $group: {
          _id: null,
          totalSignals: { $sum: 1 },
          successfulTrades: {
            $sum: {
              $cond: ['$executionResult.success', 1, 0]
            }
          },
          failedTrades: {
            $sum: {
              $cond: ['$executionResult.success', 0, 1]
            }
          }
        }
      }
    ];

    const result = await this.models.SignalHistory.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        totalSignals: 0,
        successfulTrades: 0,
        failedTrades: 0,
        successRate: 0
      };
    }

    const stats = result[0];
    const successRate = stats.totalSignals > 0 
      ? (stats.successfulTrades / stats.totalSignals) * 100 
      : 0;

    return {
      ...stats,
      successRate: Math.round(successRate * 100) / 100
    };
  }

  /**
   * Get channel signal statistics
   */
  async getChannelStats(channelId: string): Promise<{
    totalSignals: number;
    totalUsers: number;
    successRate: number;
    popularSymbols: Array<{ symbol: string; count: number }>;
  }> {
    await this.initialize();

    try {
      const pipeline = [
        { $match: { channelId } },
        {
          $group: {
            _id: null,
            totalSignals: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
            successfulTrades: {
              $sum: {
                $cond: ['$executionResult.success', 1, 0]
              }
            },
            symbols: { $push: '$signalData.symbol' }
          }
        }
      ];

      const result = await this.models.SignalHistory.aggregate(pipeline);
      
      if (result.length === 0) {
        return {
          totalSignals: 0,
          totalUsers: 0,
          successRate: 0,
          popularSymbols: []
        };
      }

      const stats = result[0];
      const successRate = stats.totalSignals > 0 
        ? (stats.successfulTrades / stats.totalSignals) * 100 
        : 0;

      // Count symbol frequency
      const symbolCounts = stats.symbols.reduce((acc: any, symbol: string) => {
        acc[symbol] = (acc[symbol] || 0) + 1;
        return acc;
      }, {});

      const popularSymbols = Object.entries(symbolCounts)
        .map(([symbol, count]) => ({ symbol, count: count as number }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalSignals: stats.totalSignals,
        totalUsers: stats.uniqueUsers.length,
        successRate: Math.round(successRate * 100) / 100,
        popularSymbols
      };

    } catch (error) {
      logger.error('❌ Failed to get channel statistics:', error);
      throw error;
    }
  }

  /**
   * Update execution result for a signal
   */
  async updateExecutionResult(
    signalId: string,
    executionResult: ExecutionResult
  ): Promise<void> {
    await this.initialize();

    try {
      await this.models.SignalHistory.updateOne(
        { _id: signalId },
        { executionResult }
      );

      logger.info(`📊 Updated execution result for signal ${signalId}`);

    } catch (error) {
      logger.error('❌ Failed to update execution result:', error);
      throw error;
    }
  }

  /**
   * Get recent signals across all users (admin view)
   */
  async getRecentSignals(limit: number = 100): Promise<SignalHistory[]> {
    await this.initialize();

    try {
      const signals = await this.models.SignalHistory.find({})
        .sort({ processedAt: -1 })
        .limit(limit)
        .lean();

      return signals;

    } catch (error) {
      logger.error('❌ Failed to get recent signals:', error);
      throw error;
    }
  }

  /**
   * Clean up old signal history (for maintenance)
   */
  async cleanupOldSignals(daysToKeep: number = 90): Promise<number> {
    await this.initialize();

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.models.SignalHistory.deleteMany({
        processedAt: { $lt: cutoffDate }
      });

      logger.info(`🧹 Cleaned up ${result.deletedCount} old signal records`);
      return result.deletedCount;

    } catch (error) {
      logger.error('❌ Failed to cleanup old signals:', error);
      throw error;
    }
  }
}