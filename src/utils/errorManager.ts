/**
 * Centralized Error Management System
 * Provides consistent error handling, logging, and recovery strategies
 */

import { logger } from '../utils/logger';

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  DATABASE = 'DATABASE',
  TRADING = 'TRADING',
  VALIDATION = 'VALIDATION',
  CONFIGURATION = 'CONFIGURATION',
  SYSTEM = 'SYSTEM'
}

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  operation: string;
  userId?: string;
  accountId?: string;
  symbol?: string;
  metadata?: Record<string, any>;
}

export class ApplicationError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly operation: string;
  public readonly isRecoverable: boolean;
  public readonly metadata: Record<string, any>;
  public readonly timestamp: Date;
  public readonly correlationId: string;

  constructor(
    message: string,
    context: ErrorContext,
    isRecoverable: boolean = true,
    cause?: Error
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.category = context.category;
    this.severity = context.severity;
    this.operation = context.operation;
    this.isRecoverable = isRecoverable;
    this.metadata = context.metadata || {};
    this.timestamp = new Date();
    this.correlationId = this.generateCorrelationId();

    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  private generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      operation: this.operation,
      isRecoverable: this.isRecoverable,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      stack: this.stack
    };
  }
}

/**
 * Result wrapper for operations that can fail
 */
export type Result<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: ApplicationError;
};

/**
 * Central error management service
 */
export class ErrorManager {
  private static instance: ErrorManager;
  private errorCounts = new Map<string, { count: number; lastOccurred: Date }>();
  private readonly MAX_ERROR_RATE = 10; // errors per minute
  private readonly ERROR_WINDOW_MS = 60000; // 1 minute

  private constructor() {}

  static getInstance(): ErrorManager {
    if (!ErrorManager.instance) {
      ErrorManager.instance = new ErrorManager();
    }
    return ErrorManager.instance;
  }

  /**
   * Handle an application error with proper logging and recovery
   */
  handleError(error: Error | ApplicationError, context?: Partial<ErrorContext>): ApplicationError {
    const appError = error instanceof ApplicationError 
      ? error 
      : this.wrapError(error, context);

    // Log the error
    this.logError(appError);

    // Track error frequency
    this.trackError(appError);

    // Check if we should trigger circuit breaker
    this.checkErrorRate(appError);

    return appError;
  }

  /**
   * Wrap a generic error into an ApplicationError
   */
  private wrapError(error: Error, context?: Partial<ErrorContext>): ApplicationError {
    const errorContext: ErrorContext = {
      category: this.categorizeError(error),
      severity: this.assessSeverity(error),
      operation: context?.operation || 'unknown',
      ...context
    };

    return new ApplicationError(
      error.message || 'Unknown error occurred',
      errorContext,
      this.isRecoverable(error),
      error
    );
  }

  /**
   * Categorize error based on message and type
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    // Order matters - more specific checks first
    if (message.includes('metaapi') || message.includes('broker') || message.includes('trade execution')) {
      return ErrorCategory.TRADING;
    }
    if (message.includes('mongodb') || message.includes('database') || message.includes('connection string') || message.includes('db timeout')) {
      return ErrorCategory.DATABASE;
    }
    if (message.includes('security') || message.includes('unauthorized') || message.includes('access denied')) {
      return ErrorCategory.SYSTEM;
    }
    if (message.includes('validation') || (message.includes('invalid') && !message.includes('connection string')) || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('config') || message.includes('environment') || message.includes('missing')) {
      return ErrorCategory.CONFIGURATION;
    }
    if (message.includes('network') || message.includes('econnrefused') || message.includes('timeout') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }

    return ErrorCategory.SYSTEM;
  }

  /**
   * Assess error severity
   */
  private assessSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();

    if (message.includes('critical') || message.includes('fatal') || message.includes('crash')) {
      return ErrorSeverity.CRITICAL;
    }
    if (message.includes('security') || message.includes('unauthorized')) {
      return ErrorSeverity.HIGH;
    }
    if (message.includes('timeout') || message.includes('connection') || message.includes('network')) {
      return ErrorSeverity.MEDIUM;
    }

    return ErrorSeverity.LOW;
  }

  /**
   * Determine if error is recoverable
   */
  private isRecoverable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Non-recoverable errors
    if (message.includes('out of memory') || 
        message.includes('stack overflow') ||
        message.includes('segmentation fault') ||
        message.includes('configuration error')) {
      return false;
    }

    // Recoverable errors
    return true;
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: ApplicationError): void {
    const logData = {
      correlationId: error.correlationId,
      category: error.category,
      operation: error.operation,
      recoverable: error.isRecoverable,
      metadata: error.metadata
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(`🚨 CRITICAL ERROR: ${error.message}`, logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error(`❌ HIGH SEVERITY: ${error.message}`, logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(`⚠️ MEDIUM SEVERITY: ${error.message}`, logData);
        break;
      case ErrorSeverity.LOW:
        logger.info(`ℹ️ LOW SEVERITY: ${error.message}`, logData);
        break;
    }
  }

  /**
   * Track error frequency for circuit breaker
   */
  private trackError(error: ApplicationError): void {
    const key = `${error.category}_${error.operation}`;
    const now = new Date();
    const existing = this.errorCounts.get(key);

    if (existing && (now.getTime() - existing.lastOccurred.getTime()) < this.ERROR_WINDOW_MS) {
      existing.count++;
      existing.lastOccurred = now;
    } else {
      this.errorCounts.set(key, { count: 1, lastOccurred: now });
    }
  }

  /**
   * Check if error rate is too high and should trigger circuit breaker
   */
  private checkErrorRate(error: ApplicationError): void {
    const key = `${error.category}_${error.operation}`;
    const errorData = this.errorCounts.get(key);

    if (errorData && errorData.count >= this.MAX_ERROR_RATE) {
      logger.error(`🚨 CIRCUIT BREAKER: High error rate detected for ${key}`, {
        errorCount: errorData.count,
        windowMs: this.ERROR_WINDOW_MS,
        correlationId: error.correlationId
      });
    }
  }

  /**
   * Create a safe wrapper for async operations
   */
  static async safeAsync<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<Result<T>> {
    const errorManager = ErrorManager.getInstance();
    
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const appError = errorManager.handleError(error as Error, context);
      return { success: false, error: appError };
    }
  }

  /**
   * Create a safe wrapper for sync operations
   */
  static safe<T>(
    operation: () => T,
    context: ErrorContext
  ): Result<T> {
    const errorManager = ErrorManager.getInstance();
    
    try {
      const data = operation();
      return { success: true, data };
    } catch (error) {
      const appError = errorManager.handleError(error as Error, context);
      return { success: false, error: appError };
    }
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): Record<string, { count: number; lastOccurred: string }> {
    const stats: Record<string, { count: number; lastOccurred: string }> = {};
    
    for (const [key, value] of this.errorCounts.entries()) {
      stats[key] = {
        count: value.count,
        lastOccurred: value.lastOccurred.toISOString()
      };
    }

    return stats;
  }

  /**
   * Clear error statistics (for testing/reset)
   */
  clearStatistics(): void {
    this.errorCounts.clear();
  }
}

export const errorManager = ErrorManager.getInstance();