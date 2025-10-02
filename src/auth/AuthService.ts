/**
 * Authentication Service
 * JWT-based authentication system for the trading bot
 * Handles user registration, login, and session management
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { DatabaseModels } from '../database/models';
import { logger } from '../utils/logger';

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  telegramId?: number;
  telegramUsername?: string;
}

interface AuthResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  error?: string;
}

interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Comprehensive authentication service for user management
 * Provides secure JWT-based authentication with bcrypt password hashing
 */
export class AuthService {
  private models: any;
  private jwtSecret: string;
  private saltRounds = 12;
  private tokenExpiration = '7d';

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-change-in-production';
    
    if (!process.env.JWT_SECRET) {
      logger.warn('⚠️ JWT_SECRET not set in environment variables, using default (not secure for production)');
    }
  }

  /**
   * Initialize authentication service
   */
  async initialize(): Promise<void> {
    logger.info('🔐 Initializing Authentication Service...');
    
    try {
      this.models = await DatabaseModels.getModels();
      logger.info('✅ Authentication Service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize Authentication Service:', error);
      throw error;
    }
  }

  /**
   * Register new user
   */
  async register(userData: RegisterData): Promise<AuthResult> {
    logger.info(`👤 Registering new user: ${userData.username}`);

    try {
      // Validate input
      const validation = this.validateRegistrationData(userData);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Check if user already exists
      const existingUser = await this.models.User.findOne({
        $or: [
          { username: userData.username.toLowerCase() },
          { email: userData.email.toLowerCase() }
        ]
      });

      if (existingUser) {
        return {
          success: false,
          error: 'Username or email already exists'
        };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, this.saltRounds);

      // Create user
      const newUser = new this.models.User({
        username: userData.username.toLowerCase(),
        email: userData.email.toLowerCase(),
        password: hashedPassword,
        telegramId: userData.telegramId,
        telegramUsername: userData.telegramUsername,
        role: 'user',
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date(),
        lastLogin: null,
        // Default risk settings
        riskSettings: {
          riskPercentage: 2.0,
          maxLotSize: 10.0,
          minLotSize: 0.01,
          enforce11RR: true,
          maxDailyLoss: 5.0,
          maxDrawdown: 10.0,
          allowedSymbols: []
        },
        preferences: {
          notifications: {
            email: true,
            telegram: true,
            push: false
          },
          timezone: 'UTC',
          language: 'en',
          theme: 'dark'
        }
      });

      await newUser.save();

      // Generate JWT token
      const token = this.generateToken({
        userId: newUser._id.toString(),
        username: newUser.username,
        role: newUser.role
      });

      logger.info(`✅ User ${userData.username} registered successfully`);

      return {
        success: true,
        token,
        user: {
          id: newUser._id.toString(),
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          isActive: newUser.isActive
        }
      };

    } catch (error) {
      logger.error(`❌ Registration failed for ${userData.username}:`, error);
      
      return {
        success: false,
        error: 'Registration failed due to server error'
      };
    }
  }

  /**
   * User login
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    logger.info(`🔑 Login attempt for user: ${credentials.username}`);

    try {
      // Find user
      const user = await this.models.User.findOne({
        username: credentials.username.toLowerCase()
      });

      if (!user) {
        logger.warn(`⚠️ Login failed: user ${credentials.username} not found`);
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Check if user is active
      if (!user.isActive) {
        logger.warn(`⚠️ Login failed: user ${credentials.username} is deactivated`);
        return {
          success: false,
          error: 'Account is deactivated. Please contact support.'
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
      
      if (!isPasswordValid) {
        logger.warn(`⚠️ Login failed: invalid password for ${credentials.username}`);
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Update last login
      await this.models.User.updateOne(
        { _id: user._id },
        { 
          lastLogin: new Date(),
          $inc: { loginCount: 1 }
        }
      );

      // Generate JWT token
      const token = this.generateToken({
        userId: user._id.toString(),
        username: user.username,
        role: user.role
      });

      logger.info(`✅ User ${credentials.username} logged in successfully`);

      return {
        success: true,
        token,
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive
        }
      };

    } catch (error) {
      logger.error(`❌ Login failed for ${credentials.username}:`, error);
      
      return {
        success: false,
        error: 'Login failed due to server error'
      };
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<{
    isValid: boolean;
    user?: {
      id: string;
      username: string;
      role: string;
    };
    error?: string;
  }> {
    try {
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      
      // Verify JWT
      const decoded = jwt.verify(cleanToken, this.jwtSecret) as TokenPayload;
      
      // Check if user still exists and is active
      const user = await this.models.User.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        return {
          isValid: false,
          error: 'User not found or inactive'
        };
      }

      return {
        isValid: true,
        user: {
          id: decoded.userId,
          username: decoded.username,
          role: decoded.role
        }
      };

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          isValid: false,
          error: 'Token expired'
        };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return {
          isValid: false,
          error: 'Invalid token'
        };
      }

      logger.error('❌ Token verification error:', error);
      return {
        isValid: false,
        error: 'Token verification failed'
      };
    }
  }

  /**
   * Refresh token (generate new token for authenticated user)
   */
  async refreshToken(currentToken: string): Promise<{
    success: boolean;
    token?: string;
    error?: string;
  }> {
    try {
      const verification = await this.verifyToken(currentToken);
      
      if (!verification.isValid || !verification.user) {
        return {
          success: false,
          error: verification.error || 'Invalid token'
        };
      }

      // Generate new token
      const newToken = this.generateToken({
        userId: verification.user.id,
        username: verification.user.username,
        role: verification.user.role
      });

      return {
        success: true,
        token: newToken
      };

    } catch (error) {
      logger.error('❌ Token refresh failed:', error);
      return {
        success: false,
        error: 'Token refresh failed'
      };
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const user = await this.models.User.findById(userId);
      
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      
      if (!isCurrentPasswordValid) {
        return {
          success: false,
          error: 'Current password is incorrect'
        };
      }

      // Validate new password
      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'New password must be at least 8 characters long'
        };
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

      // Update password
      await this.models.User.updateOne(
        { _id: userId },
        { 
          password: hashedNewPassword,
          updatedAt: new Date()
        }
      );

      logger.info(`✅ Password changed successfully for user ${user.username}`);

      return {
        success: true
      };

    } catch (error) {
      logger.error('❌ Password change failed:', error);
      return {
        success: false,
        error: 'Password change failed'
      };
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<{
    success: boolean;
    user?: any;
    error?: string;
  }> {
    try {
      const user = await this.models.User.findById(userId).select('-password');
      
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        user
      };

    } catch (error) {
      logger.error('❌ Get user profile failed:', error);
      return {
        success: false,
        error: 'Failed to retrieve user profile'
      };
    }
  }

  /**
   * Private helper methods
   */

  private generateToken(payload: {
    userId: string;
    username: string;
    role: string;
  }): string {
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }
    
    return jwt.sign(
      payload, 
      this.jwtSecret,
      { expiresIn: this.tokenExpiration } as jwt.SignOptions
    );
  }

  private validateRegistrationData(data: RegisterData): {
    isValid: boolean;
    error?: string;
  } {
    // Username validation
    if (!data.username || data.username.length < 3) {
      return {
        isValid: false,
        error: 'Username must be at least 3 characters long'
      };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
      return {
        isValid: false,
        error: 'Username can only contain letters, numbers, and underscores'
      };
    }

    // Email validation
    if (!data.email || !this.isValidEmail(data.email)) {
      return {
        isValid: false,
        error: 'Please provide a valid email address'
      };
    }

    // Password validation
    if (!data.password || data.password.length < 8) {
      return {
        isValid: false,
        error: 'Password must be at least 8 characters long'
      };
    }

    return {
      isValid: true
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}