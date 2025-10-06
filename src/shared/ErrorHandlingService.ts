/**
 * Unified Error Handling Service
 * Provides robust error handling with retry mechanisms and graceful degradation
 */

import { logger } from '../utils/logger';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  retryCondition?: (error: any) => boolean;
}

export interface ErrorContext {
  service: string;
  operation: string;
  userId?: string;
  accountId?: string;
  metadata?: Record<string, any>;
}

export class ErrorHandlingService {
  private static retryAttempts = new Map<string, number>();
  private static errorCounts = new Map<string, number>();

  /**
   * Execute function with retry logic and error handling
   */
  public static async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: ErrorContext,
    options: RetryOptions = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    const {
      maxAttempts = 3,
      delayMs = 1000,
      backoffMultiplier = 2,
      maxDelayMs = 30000,
      retryCondition = this.defaultRetryCondition
    } = options;

    const operationKey = `${context.service}:${context.operation}`;
    let lastError: any;
    let currentDelay = delayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        
        // Reset retry count on success
        this.retryAttempts.delete(operationKey);
        
        logger.info(`✅ ${context.service}.${context.operation} succeeded`, {
          attempt,
          ...context.metadata
        });

        return { success: true, data: result };

      } catch (error) {
        lastError = error;
        
        logger.warn(`⚠️ ${context.service}.${context.operation} failed (attempt ${attempt}/${maxAttempts})`, {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          ...context.metadata
        });

        // Check if we should retry
        if (attempt < maxAttempts && retryCondition(error)) {
          // Update retry count
          this.retryAttempts.set(operationKey, attempt);
          
          // Wait before retry
          await this.delay(Math.min(currentDelay, maxDelayMs));
          currentDelay *= backoffMultiplier;
          
          continue;
        }

        // No more retries or non-retryable error
        break;
      }
    }

    // All retries failed
    const errorMessage = this.extractErrorMessage(lastError);
    const errorKey = `${context.service}:${errorMessage}`;
    
    // Track error frequency
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    logger.error(`❌ ${context.service}.${context.operation} failed after ${maxAttempts} attempts`, {
      error: errorMessage,
      errorCount: currentCount + 1,
      userId: context.userId,
      accountId: context.accountId,
      ...context.metadata
    });

    return { 
      success: false, 
      error: this.sanitizeErrorMessage(errorMessage)
    };
  }

  /**
   * Handle database connection failures gracefully
   */
  public static async handleDatabaseOperation<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    context: ErrorContext
  ): Promise<T> {
    const result = await this.executeWithRetry(
      operation,
      { ...context, service: 'database' },
      {
        maxAttempts: 3,
        delayMs: 2000,
        retryCondition: (error) => {
          // Retry on connection errors, not on auth/validation errors
          const errorMessage = String(error).toLowerCase();
          return errorMessage.includes('connection') || 
                 errorMessage.includes('timeout') ||
                 errorMessage.includes('network');
        }
      }
    );

    if (result.success) {
      return result.data!;
    } else {
      logger.warn(`🔄 Database operation failed, using fallback for ${context.operation}`, {
        error: result.error
      });
      return fallback();
    }
  }

  /**
   * Handle MetaAPI connection failures with circuit breaker pattern
   */
  public static async handleMetaApiOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    const circuitKey = `metaapi:${context.accountId || 'global'}`;
    
    // Check circuit breaker
    if (this.isCircuitOpen(circuitKey)) {
      return {
        success: false,
        error: 'MetaAPI service temporarily unavailable (circuit breaker open)'
      };
    }

    const result = await this.executeWithRetry(
      operation,
      { ...context, service: 'metaapi' },
      {
        maxAttempts: 2, // Fewer retries for trading operations
        delayMs: 3000,
        retryCondition: (error) => {
          const errorMessage = String(error).toLowerCase();
          
          // Don't retry on authentication or account errors
          if (errorMessage.includes('unauthorized') || 
              errorMessage.includes('invalid account') ||
              errorMessage.includes('insufficient funds')) {
            return false;
          }
          
          // Retry on network/connection issues
          return errorMessage.includes('connection') || 
                 errorMessage.includes('timeout') ||
                 errorMessage.includes('network') ||
                 errorMessage.includes('503') ||
                 errorMessage.includes('502');
        }
      }
    );

    // Update circuit breaker state
    if (!result.success) {
      this.recordCircuitFailure(circuitKey);
    } else {
      this.recordCircuitSuccess(circuitKey);
    }

    return result;
  }

  /**
   * Handle Telegram API operations
   */
  public static async handleTelegramOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    return this.executeWithRetry(
      operation,
      { ...context, service: 'telegram' },
      {
        maxAttempts: 3,
        delayMs: 1000,
        retryCondition: (error) => {
          const errorMessage = String(error).toLowerCase();
          
          // Don't retry on bot token or permission errors
          if (errorMessage.includes('unauthorized') || 
              errorMessage.includes('forbidden') ||
              errorMessage.includes('invalid token')) {
            return false;
          }
          
          // Retry on rate limits and network issues
          return errorMessage.includes('too many requests') ||
                 errorMessage.includes('connection') ||
                 errorMessage.includes('timeout');
        }
      }
    );
  }

  /**
   * Default retry condition
   */
  private static defaultRetryCondition(error: any): boolean {
    const errorMessage = String(error).toLowerCase();
    
    // Don't retry on validation errors
    if (errorMessage.includes('validation') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('bad request')) {
      return false;
    }
    
    // Don't retry on authentication errors
    if (errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden') ||
        errorMessage.includes('authentication')) {
      return false;
    }
    
    // Retry on network/connection issues
    return errorMessage.includes('connection') ||
           errorMessage.includes('timeout') ||
           errorMessage.includes('network') ||
           errorMessage.includes('503') ||
           errorMessage.includes('502') ||
           errorMessage.includes('500');
  }

  /**
   * Circuit breaker implementation
   */
  private static circuitStates = new Map<string, {
    failures: number;
    lastFailure: number;
    lastSuccess: number;
    isOpen: boolean;
  }>();

  private static isCircuitOpen(key: string): boolean {
    const state = this.circuitStates.get(key);
    if (!state) return false;

    const now = Date.now();
    const failureThreshold = 5;
    const timeoutMs = 60000; // 1 minute

    // If circuit is open and timeout has passed, allow one test request
    if (state.isOpen && (now - state.lastFailure) > timeoutMs) {
      return false;
    }

    return state.isOpen;
  }

  private static recordCircuitFailure(key: string): void {
    const now = Date.now();
    const state = this.circuitStates.get(key) || {
      failures: 0,
      lastFailure: 0,
      lastSuccess: 0,
      isOpen: false
    };

    state.failures++;
    state.lastFailure = now;

    // Open circuit if too many failures
    if (state.failures >= 5) {
      state.isOpen = true;
      logger.warn(`🔴 Circuit breaker opened for ${key}`, {
        failures: state.failures
      });
    }

    this.circuitStates.set(key, state);
  }

  private static recordCircuitSuccess(key: string): void {
    const now = Date.now();
    const state = this.circuitStates.get(key);

    if (state) {
      state.failures = 0;
      state.lastSuccess = now;
      
      if (state.isOpen) {
        state.isOpen = false;
        logger.info(`🟢 Circuit breaker closed for ${key}`);
      }
      
      this.circuitStates.set(key, state);
    }
  }

  /**
   * Extract readable error message
   */
  private static extractErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object') {
      return error.message || error.error || JSON.stringify(error);
    }
    
    return 'Unknown error occurred';
  }

  /**
   * Sanitize error message for user display
   */
  private static sanitizeErrorMessage(message: string): string {
    // Remove sensitive information
    return message
      .replace(/token[s]?[:\s]*[a-zA-Z0-9_-]+/gi, 'token: [REDACTED]')
      .replace(/password[s]?[:\s]*\S+/gi, 'password: [REDACTED]')
      .replace(/key[s]?[:\s]*[a-zA-Z0-9_-]+/gi, 'key: [REDACTED]')
      .substring(0, 200); // Limit length
  }

  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics for monitoring
   */
  public static getErrorStats(): Record<string, any> {
    return {
      retryAttempts: Object.fromEntries(this.retryAttempts),
      errorCounts: Object.fromEntries(this.errorCounts),
      circuitStates: Object.fromEntries(this.circuitStates),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset error statistics
   */
  public static resetStats(): void {
    this.retryAttempts.clear();
    this.errorCounts.clear();
    this.circuitStates.clear();
    logger.info('📊 Error handling statistics reset');
  }
}