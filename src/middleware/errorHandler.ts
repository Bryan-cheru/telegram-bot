/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 */
export const globalErrorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const {
    statusCode = 500,
    message,
    isOperational = false,
    code,
    stack
  } = error;

  // Log error details
  if (statusCode >= 500) {
    logger.error('Server Error:', {
      message,
      statusCode,
      code,
      url: req.url,
      method: req.method,
      ip: req.ip,
      stack: process.env.NODE_ENV === 'development' ? stack : undefined
    });
  } else {
    logger.warn('Client Error:', {
      message,
      statusCode,
      code,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
  }

  // Prepare error response
  const errorResponse: any = {
    success: false,
    error: message || 'Internal Server Error',
    statusCode,
    timestamp: new Date().toISOString()
  };

  // Add error code if provided
  if (code) {
    errorResponse.code = code;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && stack) {
    errorResponse.stack = stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Handle async route errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new ApiError(`Route ${req.originalUrl} not found`, 404, true, 'ROUTE_NOT_FOUND');
  next(error);
};

/**
 * Validation error handler
 */
export const validationErrorHandler = (errors: string[]): ApiError => {
  const message = errors.join(', ');
  return new ApiError(`Validation Error: ${message}`, 400, true, 'VALIDATION_ERROR');
};

/**
 * Database error handler
 */
export const databaseErrorHandler = (error: any): ApiError => {
  if (error.code === 11000) {
    // Duplicate key error
    const field = Object.keys(error.keyValue)[0];
    return new ApiError(`${field} already exists`, 409, true, 'DUPLICATE_FIELD');
  }
  
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((e: any) => e.message);
    return new ApiError(`Validation Error: ${errors.join(', ')}`, 400, true, 'VALIDATION_ERROR');
  }
  
  if (error.name === 'CastError') {
    return new ApiError(`Invalid ${error.path}: ${error.value}`, 400, true, 'CAST_ERROR');
  }

  return new ApiError('Database operation failed', 500, false, 'DATABASE_ERROR');
};

/**
 * MetaAPI error handler
 */
export const metaApiErrorHandler = (error: any): ApiError => {
  if (error.status === 401) {
    return new ApiError('MetaAPI authentication failed', 401, true, 'METAAPI_AUTH_ERROR');
  }
  
  if (error.status === 403) {
    return new ApiError('MetaAPI access forbidden', 403, true, 'METAAPI_ACCESS_ERROR');
  }
  
  if (error.status === 429) {
    return new ApiError('MetaAPI rate limit exceeded', 429, true, 'METAAPI_RATE_LIMIT');
  }

  return new ApiError(`MetaAPI Error: ${error.message}`, 500, true, 'METAAPI_ERROR');
};

/**
 * Trading specific error handler
 */
export const tradingErrorHandler = (error: any): ApiError => {
  // Common trading errors
  if (error.message?.includes('insufficient funds')) {
    return new ApiError('Insufficient account balance', 400, true, 'INSUFFICIENT_FUNDS');
  }
  
  if (error.message?.includes('market closed')) {
    return new ApiError('Market is closed', 400, true, 'MARKET_CLOSED');
  }
  
  if (error.message?.includes('invalid symbol')) {
    return new ApiError('Invalid trading symbol', 400, true, 'INVALID_SYMBOL');
  }
  
  if (error.message?.includes('order rejected')) {
    return new ApiError('Trade order was rejected', 400, true, 'ORDER_REJECTED');
  }

  return new ApiError('Trading operation failed', 500, true, 'TRADING_ERROR');
};