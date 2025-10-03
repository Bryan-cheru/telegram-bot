/**
 * Authentication Middleware
 * Express middleware for protecting routes with JWT authentication
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth/AuthService';
import { logger } from '../utils/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
      };
    }
  }
}

/**
 * Initialize authentication service instance
 */
let authService: AuthService;

export const initializeAuth = async (): Promise<void> => {
  try {
    authService = new AuthService();
    
    // Add timeout to prevent hanging on MongoDB connection
    const initPromise = authService.initialize();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Authentication middleware initialization timeout')), 10000);
    });
    
    await Promise.race([initPromise, timeoutPromise]);
    logger.info('🔐 Authentication middleware initialized');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('authentication failed') || errorMessage.includes('bad auth')) {
      logger.warn('⚠️ MongoDB authentication failed - authentication middleware disabled');
    } else if (errorMessage.includes('timeout')) {
      logger.warn('⚠️ Authentication middleware initialization timed out - disabled');
    } else {
      logger.error('❌ Failed to initialize authentication middleware:', error);
    }
    
    // Don't throw - allow app to continue without auth
    authService = null as any;
  }
};

/**
 * JWT Authentication middleware
 * Validates JWT token and adds user info to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
      return;
    }

    // Verify token
    const verification = await authService.verifyToken(token);

    if (!verification.isValid) {
      res.status(401).json({
        success: false,
        error: verification.error || 'Invalid token'
      });
      return;
    }

    // Add user to request
    req.user = verification.user;
    next();

  } catch (error) {
    logger.error('❌ Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info if token is valid, but doesn't block if missing
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (token) {
      const verification = await authService.verifyToken(token);
      if (verification.isValid) {
        req.user = verification.user;
      }
    }

    next();

  } catch (error) {
    logger.error('❌ Optional auth middleware error:', error);
    next(); // Continue even if auth fails
  }
};

/**
 * Role-based authorization middleware
 * Requires specific role(s) to access the route
 */
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Admin-only middleware
 */
export const requireAdmin = requireRole('admin');

/**
 * User-only middleware (excludes guests)
 */
export const requireUser = requireRole(['user', 'admin']);