/**
 * Input Validation Middleware
 * Validates and sanitizes incoming requests
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'uuid' | 'symbol';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
}

export class InputValidator {
  static validate(rules: ValidationRule[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const errors: string[] = [];
      const data = { ...req.body, ...req.query, ...req.params };

      for (const rule of rules) {
        const value = data[rule.field];

        // Check required fields
        if (rule.required && (value === undefined || value === null || value === '')) {
          errors.push(`${rule.field} is required`);
          continue;
        }

        // Skip validation if field is not provided and not required
        if (!rule.required && (value === undefined || value === null || value === '')) {
          continue;
        }

        // Type validation
        switch (rule.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`${rule.field} must be a string`);
            } else {
              if (rule.min && value.length < rule.min) {
                errors.push(`${rule.field} must be at least ${rule.min} characters`);
              }
              if (rule.max && value.length > rule.max) {
                errors.push(`${rule.field} must be no more than ${rule.max} characters`);
              }
              if (rule.pattern && !rule.pattern.test(value)) {
                errors.push(`${rule.field} format is invalid`);
              }
            }
            break;

          case 'number':
            const num = parseFloat(value);
            if (isNaN(num)) {
              errors.push(`${rule.field} must be a valid number`);
            } else {
              if (rule.min !== undefined && num < rule.min) {
                errors.push(`${rule.field} must be at least ${rule.min}`);
              }
              if (rule.max !== undefined && num > rule.max) {
                errors.push(`${rule.field} must be no more than ${rule.max}`);
              }
            }
            break;

          case 'boolean':
            if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
              errors.push(`${rule.field} must be a boolean`);
            }
            break;

          case 'email':
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(value)) {
              errors.push(`${rule.field} must be a valid email`);
            }
            break;

          case 'uuid':
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidPattern.test(value)) {
              errors.push(`${rule.field} must be a valid UUID`);
            }
            break;

          case 'symbol':
            const symbolPattern = /^[A-Z]{3,10}$/;
            if (!symbolPattern.test(value)) {
              errors.push(`${rule.field} must be a valid trading symbol`);
            }
            break;
        }
      }

      if (errors.length > 0) {
        logger.warn('Validation failed:', { errors, data: this.sanitizeForLog(data) });
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
        return;
      }

      next();
    };
  }

  private static sanitizeForLog(data: any): any {
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    }
    
    return sanitized;
  }
}

// Common validation rules
export const ValidationRules = {
  accountId: {
    field: 'accountId',
    type: 'uuid' as const,
    required: true
  },
  
  symbol: {
    field: 'symbol',
    type: 'symbol' as const,
    required: true
  },
  
  riskPercentage: {
    field: 'riskPercentage',
    type: 'number' as const,
    min: 0.1,
    max: 10
  },
  
  lotSize: {
    field: 'lotSize',
    type: 'number' as const,
    min: 0.01,
    max: 100
  },
  
  username: {
    field: 'username',
    type: 'string' as const,
    required: true,
    min: 3,
    max: 50,
    pattern: /^[a-zA-Z0-9_]+$/
  },
  
  email: {
    field: 'email',
    type: 'email' as const,
    required: true
  },
  
  password: {
    field: 'password',
    type: 'string' as const,
    required: true,
    min: 8,
    max: 100
  }
};