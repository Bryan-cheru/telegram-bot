/**
 * User Settings Service
 * Manages user-specific trading preferences and risk management settings
 * Part of Phase 6: Code Cleanup & Optimization
 */

import { DatabaseModels } from '../database/models';
import { logger } from '../utils/logger';
import { envConfig } from '../config/environment';

export interface UserRiskSettings {
  userId: string;
  riskPercentage: number;        // Risk percentage per trade (e.g., 0.45 for 0.45%)
  riskRewardRatio: number;       // Risk-reward ratio (e.g., 1.0 for 1:1)
  maxDailyTrades: number;        // Maximum trades per day
  enableAutoTrading: boolean;    // Auto-trading enabled
  tradingHours?: {
    start: string;               // Trading start time "09:00"
    end: string;                 // Trading end time "17:00"  
    timezone: string;            // Timezone "UTC"
  };
  allowedSymbols: string[];      // Allowed trading symbols
  createdAt: Date;
  updatedAt: Date;
}

export interface DefaultSettings {
  riskPercentage: number;
  riskRewardRatio: number;
  maxDailyTrades: number;
  enableAutoTrading: boolean;
  allowedSymbols: string[];
}

/**
 * Service for managing user trading preferences and risk settings
 */
export class UserSettingsService {
  private static instance: UserSettingsService;
  private models: any;
  private initialized = false;

  // Default settings for new users (loaded from environment)
  private readonly defaultSettings: DefaultSettings = {
    riskPercentage: envConfig.get('defaultRiskPercentage'),
    riskRewardRatio: envConfig.get('defaultRiskRewardRatio'), 
    maxDailyTrades: envConfig.get('maxDailyTrades'),
    enableAutoTrading: true,     // Auto-trading enabled by default
    allowedSymbols: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD']
  };

  private constructor() {}

  public static getInstance(): UserSettingsService {
    if (!UserSettingsService.instance) {
      UserSettingsService.instance = new UserSettingsService();
    }
    return UserSettingsService.instance;
  }

  /**
   * Initialize the User Settings Service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.models = await DatabaseModels.getModels();
      this.initialized = true;
      logger.info('⚙️ User Settings Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize User Settings Service:', error);
      throw error;
    }
  }

  /**
   * Get user's risk settings, create default if not exists
   */
  async getUserRiskSettings(userId: string): Promise<UserRiskSettings> {
    await this.initialize();

    try {
      let settings = await this.models.UserSettings?.findOne({ userId });

      if (!settings) {
        // Create default settings for new user
        settings = new this.models.UserSettings({
          userId,
          ...this.defaultSettings,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await settings.save();
        logger.info(`⚙️ Created default settings for user ${userId}`);
      }

      return {
        userId: settings.userId,
        riskPercentage: settings.riskPercentage,
        riskRewardRatio: settings.riskRewardRatio,
        maxDailyTrades: settings.maxDailyTrades,
        enableAutoTrading: settings.enableAutoTrading,
        tradingHours: settings.tradingHours,
        allowedSymbols: settings.allowedSymbols || this.defaultSettings.allowedSymbols,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt
      };

    } catch (error) {
      logger.error(`❌ Failed to get user settings for ${userId}:`, error);
      
      // Return default settings on error
      return {
        userId,
        ...this.defaultSettings,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  /**
   * Update user's risk settings
   */
  async updateUserRiskSettings(
    userId: string, 
    updates: Partial<Omit<UserRiskSettings, 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<UserRiskSettings> {
    await this.initialize();

    try {
      const settings = await this.models.UserSettings?.findOneAndUpdate(
        { userId },
        {
          ...updates,
          updatedAt: new Date()
        },
        { 
          new: true, 
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      logger.info(`⚙️ Updated settings for user ${userId}: ${Object.keys(updates).join(', ')}`);

      return {
        userId: settings.userId,
        riskPercentage: settings.riskPercentage,
        riskRewardRatio: settings.riskRewardRatio,
        maxDailyTrades: settings.maxDailyTrades,
        enableAutoTrading: settings.enableAutoTrading,
        tradingHours: settings.tradingHours,
        allowedSymbols: settings.allowedSymbols || this.defaultSettings.allowedSymbols,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt
      };

    } catch (error) {
      logger.error(`❌ Failed to update user settings for ${userId}:`, error);
      throw new Error(`Failed to update user settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate stop loss and take profit based on user settings
   */
  calculateRiskLevels(
    entryPrice: number,
    action: 'BUY' | 'SELL',
    userSettings: UserRiskSettings
  ): { stopLoss: number; takeProfit: number; riskAmount: number } {
    
    // Calculate risk distance based on user's risk percentage
    const riskDistance = entryPrice * (userSettings.riskPercentage / 100);
    
    // Calculate stop loss
    const stopLoss = action === 'BUY' 
      ? entryPrice - riskDistance 
      : entryPrice + riskDistance;
    
    // Calculate take profit using user's risk-reward ratio
    const takeProfitDistance = riskDistance * userSettings.riskRewardRatio;
    const takeProfit = action === 'BUY'
      ? entryPrice + takeProfitDistance
      : entryPrice - takeProfitDistance;

    return {
      stopLoss: Number(stopLoss.toFixed(5)),
      takeProfit: Number(takeProfit.toFixed(5)),
      riskAmount: riskDistance
    };
  }

  /**
   * Check if user can trade based on daily limits and settings
   */
  async canUserTrade(userId: string, symbol: string): Promise<{ canTrade: boolean; reason?: string }> {
    await this.initialize();

    try {
      const settings = await this.getUserRiskSettings(userId);

      // Check if auto-trading is enabled
      if (!settings.enableAutoTrading) {
        return { canTrade: false, reason: 'Auto-trading is disabled' };
      }

      // Check if symbol is allowed
      if (settings.allowedSymbols.length > 0 && !settings.allowedSymbols.includes(symbol)) {
        return { canTrade: false, reason: `Symbol ${symbol} not in allowed list` };
      }

      // Check trading hours
      if (settings.tradingHours) {
        const now = new Date();
        const currentHour = now.getHours();
        const startHour = parseInt(settings.tradingHours.start.split(':')[0]);
        const endHour = parseInt(settings.tradingHours.end.split(':')[0]);

        if (currentHour < startHour || currentHour >= endHour) {
          return { canTrade: false, reason: 'Outside trading hours' };
        }
      }

      // Check daily trade limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayTrades = await this.getTodayTradeCount(userId);
      
      if (todayTrades >= settings.maxDailyTrades) {
        return { canTrade: false, reason: 'Daily trade limit reached' };
      }

      return { canTrade: true };

    } catch (error) {
      logger.error(`❌ Error checking trade permissions for ${userId}:`, error);
      return { canTrade: false, reason: 'Error checking trade permissions' };
    }
  }

  /**
   * Get today's trade count for user
   */
  private async getTodayTradeCount(userId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Count trades from SignalHistory for today
      const count = await this.models.SignalHistory?.countDocuments({
        userId,
        processedAt: {
          $gte: today,
          $lt: tomorrow
        },
        'executionResult.success': true
      }) || 0;

      return count;
    } catch (error) {
      logger.error(`❌ Error getting today's trade count for ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Get default settings (for new users or fallback)
   */
  getDefaultSettings(): DefaultSettings {
    return { ...this.defaultSettings };
  }

  /**
   * Reset user settings to defaults
   */
  async resetUserSettings(userId: string): Promise<UserRiskSettings> {
    await this.initialize();

    try {
      await this.models.UserSettings?.deleteOne({ userId });
      return await this.getUserRiskSettings(userId); // This will create new default settings
    } catch (error) {
      logger.error(`❌ Failed to reset user settings for ${userId}:`, error);
      throw new Error(`Failed to reset user settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all users with custom settings (for admin)
   */
  async getAllUsersWithSettings(): Promise<UserRiskSettings[]> {
    await this.initialize();

    try {
      const allSettings = await this.models.UserSettings?.find({}).lean() || [];
      
      return allSettings.map((settings: any) => ({
        userId: settings.userId,
        riskPercentage: settings.riskPercentage,
        riskRewardRatio: settings.riskRewardRatio,
        maxDailyTrades: settings.maxDailyTrades,
        enableAutoTrading: settings.enableAutoTrading,
        tradingHours: settings.tradingHours,
        allowedSymbols: settings.allowedSymbols || this.defaultSettings.allowedSymbols,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt
      }));

    } catch (error) {
      logger.error('❌ Failed to get all user settings:', error);
      return [];
    }
  }

  /**
   * Update default settings for the system
   */
  updateDefaultSettings(newDefaults: Partial<DefaultSettings>): void {
    Object.assign(this.defaultSettings, newDefaults);
    logger.info('⚙️ Default settings updated:', newDefaults);
  }
}