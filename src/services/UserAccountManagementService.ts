/**
 * User Account Management Service
 * Allows users to manage their MetaAPI accounts dynamically through the dashboard
 */

import { DatabaseModels } from '../database/models';
import { logger } from '../utils/logger';
import MetaApi from 'metaapi.cloud-sdk';

export interface UserMetaApiAccount {
  id: string;
  userId: string;
  accountId: string;
  brokerServer: string;
  accountType: 'DEMO' | 'LIVE';
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddAccountRequest {
  userId: string;
  accountId: string;
  brokerServer: string;
  accountType: 'DEMO' | 'LIVE';
  displayName?: string;
}

export class UserAccountManagementService {
  private models: any;
  private metaApi: MetaApi;

  constructor() {
    this.metaApi = new MetaApi(process.env.METAAPI_TOKEN!);
  }

  async initialize(): Promise<void> {
    logger.info('🔧 Initializing User Account Management Service...');
    
    try {
      this.models = await DatabaseModels.getModels();
      logger.info('✅ User Account Management Service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize User Account Management Service:', error);
      throw error;
    }
  }

  /**
   * Add a new MetaAPI account for a user
   */
  async addUserAccount(request: AddAccountRequest): Promise<{
    success: boolean;
    account?: UserMetaApiAccount;
    error?: string;
  }> {
    try {
      const { userId, accountId, brokerServer, accountType, displayName } = request;

      // Validate account with MetaAPI
      const validation = await this.validateMetaApiAccount(accountId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error || 'Invalid MetaAPI account'
        };
      }

      // Check if account already exists for this user
      const existingAccount = await this.models.UserMetaApiAccount.findOne({
        userId,
        accountId
      });

      if (existingAccount) {
        return {
          success: false,
          error: 'Account already exists for this user'
        };
      }

      // Create new account record
      const newAccount = new this.models.UserMetaApiAccount({
        userId,
        accountId,
        brokerServer,
        accountType,
        displayName: displayName || `${brokerServer} ${accountType}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newAccount.save();

      logger.info(`✅ Added MetaAPI account for user ${userId}:`, {
        accountId: accountId.substring(0, 8) + '...',
        brokerServer,
        accountType
      });

      return {
        success: true,
        account: newAccount.toObject()
      };

    } catch (error) {
      logger.error('❌ Error adding user account:', error);
      return {
        success: false,
        error: 'Failed to add account'
      };
    }
  }

  /**
   * Get all accounts for a user
   */
  async getUserAccounts(userId: string): Promise<{
    success: boolean;
    accounts?: UserMetaApiAccount[];
    error?: string;
  }> {
    try {
      const accounts = await this.models.UserMetaApiAccount.find({
        userId
      }).sort({ createdAt: -1 });

      return {
        success: true,
        accounts: accounts.map((acc: any) => acc.toObject())
      };

    } catch (error) {
      logger.error('❌ Error getting user accounts:', error);
      return {
        success: false,
        error: 'Failed to retrieve accounts'
      };
    }
  }

  /**
   * Remove a user account
   */
  async removeUserAccount(userId: string, accountId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await this.models.UserMetaApiAccount.deleteOne({
        userId,
        accountId
      });

      if (result.deletedCount === 0) {
        return {
          success: false,
          error: 'Account not found'
        };
      }

      logger.info(`✅ Removed MetaAPI account for user ${userId}:`, {
        accountId: accountId.substring(0, 8) + '...'
      });

      return {
        success: true
      };

    } catch (error) {
      logger.error('❌ Error removing user account:', error);
      return {
        success: false,
        error: 'Failed to remove account'
      };
    }
  }

  /**
   * Update account status (active/inactive)
   */
  async updateAccountStatus(userId: string, accountId: string, isActive: boolean): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await this.models.UserMetaApiAccount.updateOne(
        { userId, accountId },
        { 
          isActive, 
          updatedAt: new Date() 
        }
      );

      if (result.matchedCount === 0) {
        return {
          success: false,
          error: 'Account not found'
        };
      }

      logger.info(`✅ Updated account status for user ${userId}:`, {
        accountId: accountId.substring(0, 8) + '...',
        isActive
      });

      return {
        success: true
      };

    } catch (error) {
      logger.error('❌ Error updating account status:', error);
      return {
        success: false,
        error: 'Failed to update account status'
      };
    }
  }

  /**
   * Validate MetaAPI account
   */
  private async validateMetaApiAccount(accountId: string): Promise<{
    valid: boolean;
    error?: string;
    accountInfo?: any;
  }> {
    try {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(accountId)) {
        return {
          valid: false,
          error: 'Invalid account ID format'
        };
      }

      // Test actual MetaAPI connection
      const account = await this.metaApi.metatraderAccountApi.getAccount(accountId);
      
      return {
        valid: true,
        accountInfo: {
          id: accountId,
          name: account.name,
          state: account.state,
          type: account.type,
          brokerServer: (account as any).server || 'MetaTrader Server'
        }
      };

    } catch (error: any) {
      logger.warn('MetaAPI account validation failed:', error.message);
      
      if (error.status === 404) {
        return {
          valid: false,
          error: 'Account not found'
        };
      }
      
      if (error.status === 401 || error.status === 403) {
        return {
          valid: false,
          error: 'Account access denied'
        };
      }

      return {
        valid: false,
        error: 'Account validation failed'
      };
    }
  }

  /**
   * Get active accounts for trading
   */
  async getActiveAccountsForTrading(userId: string): Promise<UserMetaApiAccount[]> {
    try {
      const accounts = await this.models.UserMetaApiAccount.find({
        userId,
        isActive: true
      });

      return accounts.map((acc: any) => acc.toObject());

    } catch (error) {
      logger.error('❌ Error getting active accounts:', error);
      return [];
    }
  }

  /**
   * Test account connection
   */
  async testAccountConnection(userId: string, accountId: string): Promise<{
    success: boolean;
    connectionInfo?: any;
    error?: string;
  }> {
    try {
      // Check if user owns this account
      const userAccount = await this.models.UserMetaApiAccount.findOne({
        userId,
        accountId
      });

      if (!userAccount) {
        return {
          success: false,
          error: 'Account not found for this user'
        };
      }

      // Test MetaAPI connection
      const account = await this.metaApi.metatraderAccountApi.getAccount(accountId);
      const connection = account.getRPCConnection();
      await connection.connect();

      const accountInfo = await connection.getAccountInformation();

      return {
        success: true,
        connectionInfo: {
          balance: accountInfo.balance,
          equity: accountInfo.equity,
          margin: accountInfo.margin,
          freeMargin: accountInfo.equity - accountInfo.margin,
          marginLevel: accountInfo.marginLevel,
          currency: accountInfo.currency,
          server: (account as any).server || 'MetaTrader Server',
          connected: true
        }
      };

    } catch (error: any) {
      logger.error('❌ Account connection test failed:', error);
      return {
        success: false,
        error: `Connection failed: ${error.message}`
      };
    }
  }
}