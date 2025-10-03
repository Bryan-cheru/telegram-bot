/**
 * Channel Subscription Service
 * Manages user subscriptions to trading signal channels
 * Part of Phase 4: Modern Trade Execution
 */

import { DatabaseModels } from '../database/models';
import { logger } from '../utils/logger';

export interface ChannelSubscription {
  _id?: string;
  userId: string;
  channelId: string;
  channelName?: string;
  isActive: boolean;
  riskSettings: {
    maxRiskPerTrade: number;      // % of account per trade
    enableAutoTrading: boolean;   // Enable automatic execution
    symbolFilter: string[];       // Allowed symbols only
    maxDailyTrades: number;      // Daily trade limit
    tradingHours?: {
      start: string;             // "09:00"
      end: string;              // "17:00"
      timezone: string;         // "UTC"
    };
  };
  subscriptionDate: Date;
  lastActivity?: Date;
}

export interface SubscriptionSettings {
  maxRiskPerTrade: number;
  enableAutoTrading: boolean;
  symbolFilter: string[];
  maxDailyTrades: number;
  tradingHours?: {
    start: string;
    end: string;
    timezone: string;
  };
}

/**
 * Service for managing channel subscriptions and user routing
 */
export class ChannelSubscriptionService {
  private static instance: ChannelSubscriptionService;
  private models: any;
  private initialized = false;

  private constructor() {}

  public static getInstance(): ChannelSubscriptionService {
    if (!ChannelSubscriptionService.instance) {
      ChannelSubscriptionService.instance = new ChannelSubscriptionService();
    }
    return ChannelSubscriptionService.instance;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.models = await DatabaseModels.getModels();
      this.initialized = true;
      logger.info('📢 Channel Subscription Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Channel Subscription Service:', error);
      throw error;
    }
  }

  /**
   * Subscribe user to a trading signal channel
   */
  async subscribeToChannel(
    userId: string,
    channelId: string,
    channelName: string,
    settings: SubscriptionSettings
  ): Promise<ChannelSubscription> {
    await this.initialize();

    try {
      // Check if subscription already exists
      const existing = await this.models.ChannelSubscription.findOne({
        userId,
        channelId
      });

      if (existing) {
        // Update existing subscription
        existing.isActive = true;
        existing.riskSettings = settings;
        existing.channelName = channelName;
        existing.lastActivity = new Date();
        await existing.save();

        logger.info(`📢 Updated channel subscription: ${userId} -> ${channelName}`);
        return existing.toObject();
      }

      // Create new subscription
      const subscription = new this.models.ChannelSubscription({
        userId,
        channelId,
        channelName,
        isActive: true,
        riskSettings: settings,
        subscriptionDate: new Date(),
        lastActivity: new Date()
      });

      await subscription.save();

      logger.info(`📢 New channel subscription: ${userId} -> ${channelName}`);
      return subscription.toObject();

    } catch (error) {
      logger.error(`❌ Failed to subscribe to channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe user from a trading signal channel
   */
  async unsubscribeFromChannel(userId: string, channelId: string): Promise<void> {
    await this.initialize();

    try {
      const subscription = await this.models.ChannelSubscription.findOne({
        userId,
        channelId
      });

      if (!subscription) {
        throw new Error(`No subscription found for channel ${channelId}`);
      }

      subscription.isActive = false;
      subscription.lastActivity = new Date();
      await subscription.save();

      logger.info(`📢 Unsubscribed from channel: ${userId} -> ${channelId}`);

    } catch (error) {
      logger.error(`❌ Failed to unsubscribe from channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get all active subscribers for a channel
   */
  async getChannelSubscribers(channelId: string): Promise<ChannelSubscription[]> {
    await this.initialize();

    try {
      const subscriptions = await this.models.ChannelSubscription.find({
        channelId,
        isActive: true
      }).lean();

      return subscriptions;

    } catch (error) {
      logger.error(`❌ Failed to get subscribers for channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's channel subscriptions
   */
  async getUserSubscriptions(userId: string): Promise<ChannelSubscription[]> {
    await this.initialize();

    try {
      const subscriptions = await this.models.ChannelSubscription.find({
        userId,
        isActive: true
      }).lean();

      return subscriptions;

    } catch (error) {
      logger.error(`❌ Failed to get subscriptions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update subscription settings
   */
  async updateSubscriptionSettings(
    userId: string,
    channelId: string,
    settings: Partial<SubscriptionSettings>
  ): Promise<ChannelSubscription> {
    await this.initialize();

    try {
      const subscription = await this.models.ChannelSubscription.findOne({
        userId,
        channelId,
        isActive: true
      });

      if (!subscription) {
        throw new Error(`No active subscription found for channel ${channelId}`);
      }

      // Update settings
      subscription.riskSettings = {
        ...subscription.riskSettings,
        ...settings
      };
      subscription.lastActivity = new Date();
      await subscription.save();

      logger.info(`📢 Updated subscription settings: ${userId} -> ${channelId}`);
      return subscription.toObject();

    } catch (error) {
      logger.error(`❌ Failed to update subscription settings:`, error);
      throw error;
    }
  }

  /**
   * Check if user is subscribed to a channel
   */
  async isUserSubscribed(userId: string, channelId: string): Promise<boolean> {
    await this.initialize();

    try {
      const subscription = await this.models.ChannelSubscription.findOne({
        userId,
        channelId,
        isActive: true
      });

      return !!subscription;

    } catch (error) {
      logger.error(`❌ Failed to check subscription status:`, error);
      return false;
    }
  }

  /**
   * Check if user can trade based on their subscription settings
   */
  canUserTrade(subscription: ChannelSubscription, symbol: string): boolean {
    // Check if auto trading is enabled
    if (!subscription.riskSettings.enableAutoTrading) {
      return false;
    }

    // Check symbol filter
    if (subscription.riskSettings.symbolFilter.length > 0) {
      const symbolAllowed = subscription.riskSettings.symbolFilter.some(allowedSymbol => 
        symbol.toUpperCase().includes(allowedSymbol.toUpperCase())
      );
      if (!symbolAllowed) {
        return false;
      }
    }

    // Check trading hours if specified
    if (subscription.riskSettings.tradingHours) {
      const now = new Date();
      const timezone = subscription.riskSettings.tradingHours.timezone || 'UTC';
      
      // For now, we'll do a simple time check
      // In production, you'd use a proper timezone library
      const currentHour = now.getUTCHours();
      const startHour = parseInt(subscription.riskSettings.tradingHours.start.split(':')[0]);
      const endHour = parseInt(subscription.riskSettings.tradingHours.end.split(':')[0]);
      
      if (currentHour < startHour || currentHour > endHour) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get subscription statistics
   */
  async getSubscriptionStats(): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    uniqueUsers: number;
    uniqueChannels: number;
  }> {
    await this.initialize();

    try {
      const [total, active, users, channels] = await Promise.all([
        this.models.ChannelSubscription.countDocuments({}),
        this.models.ChannelSubscription.countDocuments({ isActive: true }),
        this.models.ChannelSubscription.distinct('userId', { isActive: true }),
        this.models.ChannelSubscription.distinct('channelId', { isActive: true })
      ]);

      return {
        totalSubscriptions: total,
        activeSubscriptions: active,
        uniqueUsers: users.length,
        uniqueChannels: channels.length
      };

    } catch (error) {
      logger.error('❌ Failed to get subscription statistics:', error);
      throw error;
    }
  }

  /**
   * Update last activity for a subscription
   */
  async updateLastActivity(userId: string, channelId: string): Promise<void> {
    await this.initialize();

    try {
      await this.models.ChannelSubscription.updateOne(
        { userId, channelId, isActive: true },
        { lastActivity: new Date() }
      );
    } catch (error) {
      logger.error('❌ Failed to update last activity:', error);
      // Don't throw - this is not critical
    }
  }
}