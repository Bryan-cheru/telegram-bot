/**
 * Rate Limiting Middleware
 * Prevents API abuse and excessive requests
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private getKey(req: Request): string {
    // Use IP + User Agent as identifier
    return `${req.ip || req.connection.remoteAddress}_${req.get('User-Agent') || 'unknown'}`;
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime <= now) {
        delete this.store[key];
      }
    });
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.getKey(req);
      const now = Date.now();
      
      if (!this.store[key] || this.store[key].resetTime <= now) {
        // Reset window
        this.store[key] = {
          count: 1,
          resetTime: now + this.windowMs
        };
      } else {
        // Increment count
        this.store[key].count++;
      }

      const { count, resetTime } = this.store[key];

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      if (count > this.maxRequests) {
        logger.warn(`Rate limit exceeded for ${req.ip}: ${count} requests`);
        res.status(429).json({
          success: false,
          error: 'Too many requests',
          retryAfter: Math.ceil((resetTime - now) / 1000)
        });
        return;
      }

      next();
    };
  }
}

// Create rate limiters for different endpoints
export const generalRateLimit = new RateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes
export const tradingRateLimit = new RateLimiter(1 * 60 * 1000, 10);   // 10 trading requests per minute

export { RateLimiter };