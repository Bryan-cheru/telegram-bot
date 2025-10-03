import { Schema, Document, Model } from 'mongoose';
import { dbConnection } from './connection';

/**
 * Trading User Schema
 * Simplified model - MetaAPI token is the primary identifier
 * Users connect their MetaAPI accounts to execute channel signals
 */
export interface ITradingUser extends Document {
  _id: Schema.Types.ObjectId;
  metaApiToken: string;
  metaApiAccountId: string;
  alias?: string;
  isActive: boolean;
  joinedAt: Date;
  lastActiveAt?: Date;
  settings: {
    riskPercent: number;
    maxLotSize: number;
    enabledSymbols: string[];
    autoExecute: boolean;
  };
  stats: {
    totalSignalsExecuted: number;
    totalProfit: number;
    lastSignalAt?: Date;
  };
}

const TradingUserSchema = new Schema<ITradingUser>({
  metaApiToken: {
    type: String,
    required: true,
    trim: true
  },
  metaApiAccountId: {
    type: String,
    required: true
  },
  alias: {
    type: String,
    required: false,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  settings: {
    riskPercent: {
      type: Number,
      default: 1.0,
      min: 0.1,
      max: 10.0
    },
    maxLotSize: {
      type: Number,
      default: 0.1,
      min: 0.01,
      max: 100
    },
    enabledSymbols: [{
      type: String,
      trim: true,
      uppercase: true
    }],
    autoExecute: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    totalSignalsExecuted: {
      type: Number,
      default: 0
    },
    totalProfit: {
      type: Number,
      default: 0
    },
    lastSignalAt: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

// Indexes for performance - unique indexes for primary identifiers
TradingUserSchema.index({ metaApiToken: 1 }, { unique: true });
TradingUserSchema.index({ metaApiAccountId: 1 }, { unique: true });
TradingUserSchema.index({ isActive: 1 });
TradingUserSchema.index({ joinedAt: -1 });



/**
 * Signal History Schema
 * Tracks all signals processed and their execution results across all connected accounts
 */
export interface ISignalHistory extends Document {
  _id: Schema.Types.ObjectId;
  channelId: string;
  signal: {
    symbol: string;
    action: 'BUY' | 'SELL';
    entryZone: { min: number; max: number; };
    stopLoss: number;
    takeProfit: number;
    confidence: number;
  };
  processedAt: Date;
  connectedAccountsCount: number;
  executionResults: Array<{
    metaApiAccountId: string;
    success: boolean;
    error?: string;
    ticket?: number;
    executedAt: Date;
    profit?: number;
  }>;
}

const SignalHistorySchema = new Schema<ISignalHistory>({
  channelId: {
    type: String,
    required: true
  },
  signal: {
    symbol: {
      type: String,
      required: true,
      uppercase: true
    },
    action: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true
    },
    entryZone: {
      min: { type: Number, required: true },
      max: { type: Number, required: true }
    },
    stopLoss: {
      type: Number,
      required: true
    },
    takeProfit: {
      type: Number,
      required: true
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    }
  },
  processedAt: {
    type: Date,
    default: Date.now
  },
  connectedAccountsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  executionResults: [{
    metaApiAccountId: {
      type: String,
      required: true
    },
    success: {
      type: Boolean,
      required: true
    },
    error: {
      type: String,
      default: null
    },
    ticket: {
      type: Number,
      default: null
    },
    executedAt: {
      type: Date,
      default: Date.now
    },
    profit: {
      type: Number,
      default: null
    }
  }]
}, {
  timestamps: true
});

// Indexes for analytics and performance
SignalHistorySchema.index({ channelId: 1, processedAt: -1 });
SignalHistorySchema.index({ 'signal.symbol': 1 });
SignalHistorySchema.index({ processedAt: -1 });



/**
 * Model creation and export - Simplified for MetaAPI token-based system
 */
export class DatabaseModels {
  private static models: {
    TradingUser?: Model<ITradingUser>;
    SignalHistory?: Model<ISignalHistory>;
    UserMetaApiAccount?: Model<IUserMetaApiAccount>;
  } = {};

  static async getModels() {
    if (!this.models.TradingUser) {
      try {
        const connection = await dbConnection.connect();
        
        this.models.TradingUser = connection.model<ITradingUser>('TradingUser', TradingUserSchema);
        this.models.SignalHistory = connection.model<ISignalHistory>('SignalHistory', SignalHistorySchema);
        this.models.UserMetaApiAccount = connection.model<IUserMetaApiAccount>('UserMetaApiAccount', UserMetaApiAccountSchema);
      } catch (error) {
        // Log error but don't throw to prevent unhandled rejections
        console.error('Failed to initialize database models:', error);
        throw error; // Re-throw so callers can handle appropriately
      }
    }

    return this.models;
  }

  static async getTradingUser(): Promise<Model<ITradingUser>> {
    const models = await this.getModels();
    return models.TradingUser!;
  }

  static async getSignalHistory(): Promise<Model<ISignalHistory>> {
    const models = await this.getModels();
    return models.SignalHistory!;
  }
}

/**
 * User MetaAPI Account Schema
 * Stores user's configured MetaAPI accounts
 */
export interface IUserMetaApiAccount extends Document {
  _id: Schema.Types.ObjectId;
  userId: string;
  accountId: string;
  brokerServer: string;
  accountType: 'DEMO' | 'LIVE';
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserMetaApiAccountSchema = new Schema<IUserMetaApiAccount>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  accountId: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        // Validate UUID format
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'Invalid MetaAPI account ID format'
    }
  },
  brokerServer: {
    type: String,
    required: true
  },
  accountType: {
    type: String,
    enum: ['DEMO', 'LIVE'],
    required: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for user + account uniqueness
UserMetaApiAccountSchema.index({ userId: 1, accountId: 1 }, { unique: true });

// Export models for easy access
export const { getTradingUser, getSignalHistory } = DatabaseModels;