/**
 * Comprehensive Input Validation Service
 * Provides secure validation for all user inputs and trading parameters
 */

import { securityConfig } from '../config/security';
import { ErrorManager, ErrorCategory, ErrorSeverity } from '../utils/errorManager';

export interface ValidationRule<T = any> {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: T[];
  custom?: (value: T) => string | null; // Return error message or null if valid
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedValue?: any;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

/**
 * Secure input validation service
 */
export class InputValidationService {
  private static instance: InputValidationService;

  private constructor() {}

  static getInstance(): InputValidationService {
    if (!InputValidationService.instance) {
      InputValidationService.instance = new InputValidationService();
    }
    return InputValidationService.instance;
  }

  /**
   * Validate object against schema
   */
  validateObject(data: any, schema: ValidationSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitized: any = {};

    try {
      for (const [field, rule] of Object.entries(schema)) {
        const value = data?.[field];
        const fieldResult = this.validateField(value, rule, field);

        if (!fieldResult.isValid) {
          errors.push(...fieldResult.errors);
        }
        if (fieldResult.warnings.length > 0) {
          warnings.push(...fieldResult.warnings);
        }
        
        // Only include valid values in sanitized output
        if (fieldResult.isValid && value !== undefined) {
          sanitized[field] = fieldResult.sanitizedValue ?? value;
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitizedValue: sanitized
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  /**
   * Validate single field
   */
  validateField(value: any, rule: ValidationRule, fieldName: string = 'field'): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitized = value;

    try {
      // Required check
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${fieldName} is required`);
        return { isValid: false, errors, warnings };
      }

      // Skip other validation if value is not provided and not required
      if (!rule.required && (value === undefined || value === null)) {
        return { isValid: true, errors, warnings, sanitizedValue: undefined };
      }

      // Type validation
      if (rule.type) {
        const typeResult = this.validateType(value, rule.type, fieldName);
        if (!typeResult.isValid) {
          errors.push(...typeResult.errors);
          return { isValid: false, errors, warnings };
        }
        sanitized = typeResult.sanitizedValue ?? sanitized;
      }

      // String validations
      if (typeof sanitized === 'string') {
        const stringResult = this.validateString(sanitized, rule, fieldName);
        errors.push(...stringResult.errors);
        warnings.push(...stringResult.warnings);
        sanitized = stringResult.sanitizedValue ?? sanitized;
      }

      // Number validations
      if (typeof sanitized === 'number') {
        const numberResult = this.validateNumber(sanitized, rule, fieldName);
        errors.push(...numberResult.errors);
        warnings.push(...numberResult.warnings);
      }

      // Enum validation
      if (rule.enum && !rule.enum.includes(sanitized)) {
        errors.push(`${fieldName} must be one of: ${rule.enum.join(', ')}`);
      }

      // Custom validation
      if (rule.custom) {
        const customError = rule.custom(sanitized);
        if (customError) {
          errors.push(customError);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitizedValue: sanitized
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`${fieldName} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  /**
   * Validate trading parameters
   */
  validateTradingParameters(params: {
    symbol?: string;
    action?: string;
    volume?: number;
    riskPercent?: number;
    stopLoss?: number;
    takeProfit?: number;
  }): ValidationResult {
    const schema: ValidationSchema = {
      symbol: {
        required: true,
        type: 'string',
        minLength: 3,
        maxLength: 12,
        pattern: /^[A-Z]{3,12}$/,
        custom: (value) => this.validateTradingSymbol(value)
      },
      action: {
        required: true,
        type: 'string',
        enum: ['BUY', 'SELL', 'AUTO_DETECT']
      },
      volume: {
        required: true,
        type: 'number',
        min: 0.01,
        max: 100.0,
        custom: (value) => this.validateTradeVolume(value)
      },
      riskPercent: {
        required: true,
        type: 'number',
        min: 0.1,
        max: 5.0,
        custom: (value) => this.validateRiskPercentage(value)
      },
      stopLoss: {
        type: 'number',
        custom: (value) => this.validatePrice(value, 'Stop Loss')
      },
      takeProfit: {
        type: 'number',
        custom: (value) => this.validatePrice(value, 'Take Profit')
      }
    };

    return this.validateObject(params, schema);
  }



  /**
   * Private validation helpers
   */
  private validateType(value: any, expectedType: string, fieldName: string): ValidationResult {
    let sanitized = value;

    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') {
          // Try to convert
          if (value !== null && value !== undefined) {
            sanitized = String(value);
          } else {
            return { isValid: false, errors: [`${fieldName} must be a string`], warnings: [] };
          }
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          const parsed = parseFloat(value);
          if (isNaN(parsed)) {
            return { isValid: false, errors: [`${fieldName} must be a number`], warnings: [] };
          }
          sanitized = parsed;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          if (value === 'true' || value === '1' || value === 1) {
            sanitized = true;
          } else if (value === 'false' || value === '0' || value === 0) {
            sanitized = false;
          } else {
            return { isValid: false, errors: [`${fieldName} must be a boolean`], warnings: [] };
          }
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return { isValid: false, errors: [`${fieldName} must be an array`], warnings: [] };
        }
        break;
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return { isValid: false, errors: [`${fieldName} must be an object`], warnings: [] };
        }
        break;
    }

    return { isValid: true, errors: [], warnings: [], sanitizedValue: sanitized };
  }

  private validateString(value: string, rule: ValidationRule, fieldName: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let sanitized = value.trim(); // Basic sanitization

    if (rule.minLength && sanitized.length < rule.minLength) {
      errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
    }

    if (rule.maxLength && sanitized.length > rule.maxLength) {
      errors.push(`${fieldName} must not exceed ${rule.maxLength} characters`);
    }

    if (rule.pattern && !rule.pattern.test(sanitized)) {
      errors.push(`${fieldName} format is invalid`);
    }

    return { isValid: errors.length === 0, errors, warnings, sanitizedValue: sanitized };
  }

  private validateNumber(value: number, rule: ValidationRule, fieldName: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${fieldName} must be at least ${rule.min}`);
    }

    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${fieldName} must not exceed ${rule.max}`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private validateTradingSymbol(symbol: string): string | null {
    const sanitized = symbol.toUpperCase().trim();
    
    // Common trading pairs validation
    const validPatterns = [
      /^[A-Z]{3}USD$/, // EURUSD, GBPUSD, etc.
      /^USD[A-Z]{3}$/, // USDCAD, USDCHF, etc.
      /^[A-Z]{6}$/,    // EURJPY, GBPJPY, etc.
      /^XAU[A-Z]{3}$/, // XAUUSD (Gold)
      /^XAG[A-Z]{3}$/, // XAGUSD (Silver)
    ];

    if (!validPatterns.some(pattern => pattern.test(sanitized))) {
      return 'Invalid trading symbol format';
    }

    return null;
  }

  private validateTradeVolume(volume: number): string | null {
    if (volume <= 0) {
      return 'Trade volume must be positive';
    }
    if (volume > 100) {
      return 'Trade volume exceeds maximum allowed (100 lots)';
    }
    return null;
  }

  private validateRiskPercentage(riskPercent: number): string | null {
    const config = securityConfig.getRiskConfig();
    
    if (riskPercent > config.maxRiskPercent) {
      return `Risk percentage cannot exceed ${config.maxRiskPercent}%`;
    }
    
    return null;
  }

  private validatePrice(price: number, priceType: string): string | null {
    if (price <= 0) {
      return `${priceType} must be positive`;
    }
    if (price > 1000000) {
      return `${priceType} exceeds reasonable limits`;
    }
    return null;
  }



  /**
   * Sanitize text input to prevent XSS and injection attacks
   */
  sanitizeText(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocols
      .replace(/on\w+=/gi, '') // Remove event handlers
      .substring(0, 1000); // Limit length
  }

  /**
   * Validate file upload
   */
  validateFileUpload(file: { name: string; size: number; type: string }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    if (file.size > maxSize) {
      errors.push(`File size ${Math.round(file.size / 1024 / 1024)}MB exceeds maximum ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    if (file.size > 5 * 1024 * 1024) {
      warnings.push('Large file size may slow down processing');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

export const inputValidator = InputValidationService.getInstance();