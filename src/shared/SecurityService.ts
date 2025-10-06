/**
 * Security Service - Centralized Security Controls
 * Addresses API key security, input validation, and rate limiting
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface SecurityConfig {
  encryptionKey?: string;
  rateLimitWindow?: number;
  rateLimitMaxRequests?: number;
  sessionTimeout?: number;
  enableEncryption?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class SecurityService {
  private static config: SecurityConfig = {
    rateLimitWindow: 60000, // 1 minute
    rateLimitMaxRequests: 100,
    sessionTimeout: 3600000, // 1 hour
    enableEncryption: true
  };

  private static rateLimitStore = new Map<string, { requests: number[]; }>();
  private static encryptionKey: string;
  private static sessions = new Map<string, { userId: string; createdAt: number; lastAccess: number; }>();

  /**
   * Initialize security service
   */
  public static initialize(config: SecurityConfig): void {
    this.config = { ...this.config, ...config };
    
    // Generate or use provided encryption key
    this.encryptionKey = config.encryptionKey || crypto.randomBytes(32).toString('hex');
    
    logger.info('🔒 Security service initialized');
  }

  /**
   * Encrypt sensitive data (API keys, tokens)
   */
  public static encrypt(data: string): string {
    if (!this.config.enableEncryption) {
      return data;
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  public static decrypt(encryptedData: string): string {
    if (!this.config.enableEncryption) {
      return encryptedData;
    }

    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  /**
   * Hash password or sensitive data
   */
  public static hash(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
    return actualSalt + ':' + hash.toString('hex');
  }

  /**
   * Verify hashed data
   */
  public static verifyHash(data: string, hashedData: string): boolean {
    try {
      const parts = hashedData.split(':');
      if (parts.length !== 2) return false;

      const salt = parts[0];
      const hash = parts[1];
      const verifyHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
      
      return hash === verifyHash.toString('hex');
    } catch (error) {
      logger.error('Hash verification failed:', error);
      return false;
    }
  }

  /**
   * Rate limiting implementation
   */
  public static checkRateLimit(identifier: string, customLimits?: { 
    maxRequests?: number; 
    windowMs?: number 
  }): RateLimitResult {
    const now = Date.now();
    const maxRequests = customLimits?.maxRequests || this.config.rateLimitMaxRequests!;
    const windowMs = customLimits?.windowMs || this.config.rateLimitWindow!;

    // Get or create rate limit record
    let record = this.rateLimitStore.get(identifier);
    if (!record) {
      record = { requests: [] };
      this.rateLimitStore.set(identifier, record);
    }

    // Remove expired requests
    record.requests = record.requests.filter(timestamp => now - timestamp < windowMs);

    // Check if limit exceeded
    if (record.requests.length >= maxRequests) {
      const oldestRequest = Math.min(...record.requests);
      const resetTime = oldestRequest + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter
      };
    }

    // Add current request
    record.requests.push(now);

    return {
      allowed: true,
      remaining: maxRequests - record.requests.length,
      resetTime: now + windowMs
    };
  }

  /**
   * Validate and sanitize trading parameters
   */
  public static validateTradingParameters(params: any): { 
    isValid: boolean; 
    errors: string[]; 
    sanitized?: any 
  } {
    const errors: string[] = [];
    const sanitized: any = {};

    // Validate lot size
    if (params.lotSize !== undefined) {
      const lotSize = parseFloat(params.lotSize);
      if (isNaN(lotSize) || lotSize <= 0 || lotSize > 100) {
        errors.push('Invalid lot size: must be between 0.01 and 100');
      } else {
        sanitized.lotSize = Math.round(lotSize * 100) / 100; // Round to 2 decimals
      }
    }

    // Validate symbol
    if (params.symbol !== undefined) {
      const symbol = String(params.symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (symbol.length < 3 || symbol.length > 10) {
        errors.push('Invalid symbol format');
      } else {
        sanitized.symbol = symbol;
      }
    }

    // Validate action
    if (params.action !== undefined) {
      const action = String(params.action).toUpperCase();
      if (!['BUY', 'SELL'].includes(action)) {
        errors.push('Invalid action: must be BUY or SELL');
      } else {
        sanitized.action = action;
      }
    }

    // Validate prices
    ['entryPrice', 'stopLoss', 'takeProfit'].forEach(field => {
      if (params[field] !== undefined) {
        const price = parseFloat(params[field]);
        if (isNaN(price) || price <= 0) {
          errors.push(`Invalid ${field}: must be a positive number`);
        } else {
          sanitized[field] = price;
        }
      }
    });

    // Validate risk percentage
    if (params.riskPercent !== undefined) {
      const risk = parseFloat(params.riskPercent);
      if (isNaN(risk) || risk <= 0 || risk > 10) {
        errors.push('Invalid risk percentage: must be between 0.1 and 10');
      } else {
        sanitized.riskPercent = Math.round(risk * 10) / 10; // Round to 1 decimal
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined
    };
  }

  /**
   * Sanitize user input to prevent injection attacks
   */
  public static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/['";]/g, '') // Remove SQL injection characters
        .replace(/\\/g, '') // Remove backslashes
        .trim()
        .substring(0, 1000); // Limit length
    }

    if (typeof input === 'number') {
      return isFinite(input) ? input : 0;
    }

    if (Array.isArray(input)) {
      return input.slice(0, 100).map(item => this.sanitizeInput(item));
    }

    if (input && typeof input === 'object') {
      const sanitized: any = {};
      Object.keys(input).slice(0, 50).forEach(key => {
        const sanitizedKey = this.sanitizeInput(key);
        sanitized[sanitizedKey] = this.sanitizeInput(input[key]);
      });
      return sanitized;
    }

    return input;
  }

  /**
   * Generate secure session token
   */
  public static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create user session
   */
  public static createSession(userId: string): string {
    const token = this.generateSessionToken();
    const now = Date.now();

    this.sessions.set(token, {
      userId,
      createdAt: now,
      lastAccess: now
    });

    // Clean up expired sessions
    this.cleanupExpiredSessions();

    return token;
  }

  /**
   * Validate session token
   */
  public static validateSession(token: string): { valid: boolean; userId?: string } {
    const session = this.sessions.get(token);
    
    if (!session) {
      return { valid: false };
    }

    const now = Date.now();
    const isExpired = (now - session.lastAccess) > this.config.sessionTimeout!;

    if (isExpired) {
      this.sessions.delete(token);
      return { valid: false };
    }

    // Update last access time
    session.lastAccess = now;
    this.sessions.set(token, session);

    return { valid: true, userId: session.userId };
  }

  /**
   * Revoke session
   */
  public static revokeSession(token: string): void {
    this.sessions.delete(token);
  }

  /**
   * Clean up expired sessions
   */
  private static cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredTokens: string[] = [];

    this.sessions.forEach((session, token) => {
      if ((now - session.lastAccess) > this.config.sessionTimeout!) {
        expiredTokens.push(token);
      }
    });

    expiredTokens.forEach(token => this.sessions.delete(token));

    if (expiredTokens.length > 0) {
      logger.info(`🧹 Cleaned up ${expiredTokens.length} expired sessions`);
    }
  }

  /**
   * Validate MetaAPI token format
   */
  public static validateMetaApiToken(token: string): boolean {
    // MetaAPI tokens are typically JWT format
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    try {
      // Try to decode the header and payload
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Check if it looks like a MetaAPI token
      return header.typ === 'JWT' && payload.sub && payload.iat;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate account ID format (UUID)
   */
  public static validateAccountId(accountId: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(accountId);
  }

  /**
   * Log security event
   */
  public static logSecurityEvent(event: string, details: any): void {
    logger.warn(`🔒 Security Event: ${event}`, {
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Get security statistics
   */
  public static getSecurityStats(): any {
    return {
      rateLimitEntries: this.rateLimitStore.size,
      activeSessions: this.sessions.size,
      encryptionEnabled: this.config.enableEncryption,
      rateLimitConfig: {
        maxRequests: this.config.rateLimitMaxRequests,
        windowMs: this.config.rateLimitWindow
      }
    };
  }

  /**
   * Reset rate limits (for testing or emergency)
   */
  public static resetRateLimits(): void {
    this.rateLimitStore.clear();
    logger.info('🔒 Rate limits reset');
  }
}