import mongoose, { Schema, Document, Connection } from 'mongoose';
import { logger } from '../utils/logger';
import { envConfig } from '../config/environment';

/**
 * Database connection service for MongoDB
 * Handles connection, reconnection, and error management
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private connection: Connection | null = null;
  private connectionPromise: Promise<Connection> | null = null;

  private constructor() {}

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  async connect(): Promise<Connection> {
    if (this.connection?.readyState === 1) {
      return this.connection;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.establishConnection();
    return this.connectionPromise;
  }

  private async establishConnection(): Promise<Connection> {
    try {
      const dbConfig = envConfig.getDatabaseConfig();
      const mongoUri = dbConfig.mongoUri;
      
      if (!mongoUri) {
        throw new Error('MongoDB URI is required in environment configuration');
      }

      logger.info('🔌 Connecting to MongoDB...');

      // MongoDB Atlas cloud connection configuration with improved timeouts
      const connection = await mongoose.createConnection(mongoUri, {
        // Connection pool settings for Atlas
        maxPoolSize: parseInt(process.env.CONNECTION_POOL_SIZE || '5'), // Reduced for stability
        minPoolSize: 1,
        maxIdleTimeMS: 300000, // 5 minutes
        
        // Reduced timeout settings for faster failure detection
        serverSelectionTimeoutMS: 15000, // 15 seconds (was 60)
        connectTimeoutMS: 15000, // 15 seconds (was 60)
        socketTimeoutMS: 30000, // 30 seconds instead of disabled
        
        // Atlas requires these settings
        retryWrites: true,
        w: 'majority',
        
        // Buffering settings
        bufferCommands: false, // Fail fast instead of buffering
        
        // Connection monitoring
        heartbeatFrequencyMS: 30000 // 30 seconds
      });

      this.connection = connection;
      
      // Connection event handlers
      connection.on('connected', () => {
        logger.info('✅ MongoDB connected successfully');
      });

      connection.on('error', (error) => {
        logger.error('❌ MongoDB connection error:', error);
        // Prevent unhandled rejections by properly handling connection errors
        if (error.message?.includes('authentication failed') || error.message?.includes('bad auth')) {
          logger.warn('⚠️ MongoDB authentication failure - database features will be unavailable');
        }
      });

      connection.on('disconnected', () => {
        logger.warn('⚠️ MongoDB disconnected');
      });

      // Graceful shutdown
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

      return connection;

    } catch (error) {
      logger.error('❌ Failed to connect to MongoDB:', error);
      this.connectionPromise = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.connectionPromise = null;
      logger.info('🔌 MongoDB connection closed');
    }
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.connection;
  }

  async testConnection(): Promise<boolean> {
    try {
      const connection = await this.connect();
      if (!connection.db) {
        return false;
      }
      const result = await connection.db.admin().ping();
      return !!result.ok;
    } catch (error) {
      logger.error('Database connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const dbConnection = DatabaseConnection.getInstance();