import { logger } from '../utils/logger';
import { TradeSignal } from '../types';

export interface OCRFallbackConfig {
  maxRetries: number;
  retryDelayMs: number;
  enableImagePreprocessing: boolean;
  enableTextEnhancement: boolean;
  enablePatternMatching: boolean;
  enableManualReview: boolean;
  confidenceThreshold: number;
  fallbackToBasicOCR: boolean;
}

export interface OCRResult {
  text: string;
  confidence: number;
  source: 'PRIMARY' | 'ENHANCED' | 'FALLBACK' | 'PATTERN' | 'MANUAL';
  preprocessingApplied: string[];
  retryCount: number;
  success: boolean;
  fallbacksUsed: string[];
}

export interface SignalExtractionResult {
  signal: TradeSignal | null;
  confidence: number;
  extractionMethod: string;
  fallbacksUsed: string[];
  manualReviewRequired: boolean;
  errors: string[];
}

export class OCRFallbackSystem {
  private static instance: OCRFallbackSystem;
  private config: OCRFallbackConfig;
  private manualReviewQueue: Array<{ imageBuffer: Buffer; timestamp: Date; id: string }> = [];

  private constructor() {
    this.config = {
      maxRetries: parseInt(process.env.OCR_MAX_RETRIES || '3'),
      retryDelayMs: parseInt(process.env.OCR_RETRY_DELAY || '1000'),
      enableImagePreprocessing: process.env.OCR_PREPROCESSING !== 'false',
      enableTextEnhancement: process.env.OCR_TEXT_ENHANCEMENT !== 'false',
      enablePatternMatching: process.env.OCR_PATTERN_MATCHING !== 'false',
      enableManualReview: process.env.OCR_MANUAL_REVIEW === 'true',
      confidenceThreshold: parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || '0.7'),
      fallbackToBasicOCR: process.env.OCR_BASIC_FALLBACK !== 'false'
    };
  }

  static getInstance(): OCRFallbackSystem {
    if (!OCRFallbackSystem.instance) {
      OCRFallbackSystem.instance = new OCRFallbackSystem();
    }
    return OCRFallbackSystem.instance;
  }

  /**
   * MAIN OCR EXTRACTION WITH COMPREHENSIVE FALLBACKS
   */
  async extractTextWithFallbacks(imageBuffer: Buffer): Promise<OCRResult> {
    const result: OCRResult = {
      text: '',
      confidence: 0,
      source: 'PRIMARY',
      preprocessingApplied: [],
      retryCount: 0,
      success: false,
      fallbacksUsed: []
    };

    let currentBuffer = imageBuffer;

    // Stage 1: Try primary OCR
    try {
      const primaryResult = await this.primaryOCRExtraction(currentBuffer);
      if (primaryResult.confidence && primaryResult.confidence >= this.config.confidenceThreshold) {
        return { 
          ...result,
          text: primaryResult.text || '',
          confidence: primaryResult.confidence,
          source: 'PRIMARY', 
          success: true 
        };
      } else {
        result.fallbacksUsed.push('Primary OCR confidence too low, trying fallbacks');
        logger.warn(`Primary OCR confidence low: ${primaryResult.confidence || 0}`);
      }
    } catch (error) {
      result.fallbacksUsed.push('Primary OCR failed, trying fallbacks');
      logger.error('Primary OCR failed:', error);
    }

    // Stage 2: Image preprocessing and retry
    if (this.config.enableImagePreprocessing) {
      try {
        currentBuffer = await this.enhanceImageForOCR(imageBuffer);
        result.preprocessingApplied.push('contrast_enhancement', 'noise_reduction', 'sharpening');
        
        const enhancedResult = await this.primaryOCRExtraction(currentBuffer);
        if (enhancedResult.confidence && enhancedResult.confidence >= this.config.confidenceThreshold) {
          result.fallbacksUsed.push('Image preprocessing successful');
          return { 
            ...result,
            text: enhancedResult.text || '',
            confidence: enhancedResult.confidence,
            source: 'ENHANCED', 
            success: true, 
            preprocessingApplied: result.preprocessingApplied 
          };
        }
        result.fallbacksUsed.push('Image preprocessing improved but not enough');
      } catch (error) {
        result.fallbacksUsed.push('Image preprocessing failed');
        logger.error('Image preprocessing failed:', error);
      }
    }

    // Stage 3: Multiple OCR engines with retries
    for (let retry = 0; retry < this.config.maxRetries; retry++) {
      result.retryCount = retry + 1;
      
      try {
        // Try different OCR configurations
        const fallbackMethods = [
          () => this.ocrWithDifferentPSM(currentBuffer, '6'), // Uniform block of text
          () => this.ocrWithDifferentPSM(currentBuffer, '8'), // Single word
          () => this.ocrWithDifferentPSM(currentBuffer, '13'), // Raw line
          () => this.basicOCRFallback(currentBuffer)
        ];

        for (const method of fallbackMethods) {
          try {
            const methodResult = await method();
            if (methodResult.confidence && methodResult.confidence >= this.config.confidenceThreshold * 0.8) { // Lower threshold for fallbacks
              result.fallbacksUsed.push(`OCR method ${method.name} successful on retry ${retry + 1}`);
              return { 
                ...result,
                text: methodResult.text || '',
                confidence: methodResult.confidence,
                source: 'FALLBACK', 
                success: true, 
                retryCount: result.retryCount 
              };
            }
          } catch (methodError) {
            result.fallbacksUsed.push(`OCR method ${method.name} failed on retry ${retry + 1}`);
          }
        }

        // Wait before next retry
        if (retry < this.config.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }

      } catch (error) {
        result.fallbacksUsed.push(`Retry ${retry + 1} failed`);
        logger.error(`OCR retry ${retry + 1} failed:`, error);
      }
    }

    // Stage 4: Pattern matching as last resort
    if (this.config.enablePatternMatching) {
      try {
        const patternResult = await this.patternBasedExtraction(imageBuffer);
        if (patternResult.text) {
          result.fallbacksUsed.push('Pattern matching successful');
          return { 
            ...result,
            text: patternResult.text,
            confidence: patternResult.confidence || 0.3,
            source: 'PATTERN', 
            success: true 
          };
        }
        result.fallbacksUsed.push('Pattern matching found no matches');
      } catch (error) {
        result.fallbacksUsed.push('Pattern matching failed');
        logger.error('Pattern matching failed:', error);
      }
    }

    // Stage 5: Queue for manual review
    if (this.config.enableManualReview) {
      const reviewId = this.queueForManualReview(imageBuffer);
      result.fallbacksUsed.push(`Queued for manual review: ${reviewId}`);
      logger.warn(`Image queued for manual review: ${reviewId}`);
    }

    // Complete failure
    result.success = false;
    logger.error('All OCR fallback methods failed');
    return result;
  }

  /**
   * COMPREHENSIVE SIGNAL EXTRACTION WITH FALLBACKS
   */
  async extractSignalWithFallbacks(imageBuffer: Buffer): Promise<SignalExtractionResult> {
    const result: SignalExtractionResult = {
      signal: null,
      confidence: 0,
      extractionMethod: 'UNKNOWN',
      fallbacksUsed: [],
      manualReviewRequired: false,
      errors: []
    };

    // Step 1: Extract text with fallbacks
    const ocrResult = await this.extractTextWithFallbacks(imageBuffer);
    result.fallbacksUsed.push(...ocrResult.fallbacksUsed);

    if (!ocrResult.success) {
      result.errors.push('OCR extraction failed completely');
      result.manualReviewRequired = true;
      return result;
    }

    // Step 2: Try multiple signal parsing methods
    const parsingMethods = [
      () => this.standardSignalParsing(ocrResult.text),
      () => this.fuzzySignalParsing(ocrResult.text),
      () => this.keywordBasedParsing(ocrResult.text),
      () => this.patternBasedSignalExtraction(ocrResult.text),
      () => this.emergencyFallbackParsing(ocrResult.text)
    ];

    for (const [index, method] of parsingMethods.entries()) {
      try {
        const signal = await method();
        if (signal && this.validateSignal(signal)) {
          result.signal = signal;
          result.confidence = ocrResult.confidence;
          result.extractionMethod = ['STANDARD', 'FUZZY', 'KEYWORD', 'PATTERN', 'EMERGENCY'][index];
          result.fallbacksUsed.push(`Signal extraction successful with ${result.extractionMethod} method`);
          return result;
        } else {
          result.fallbacksUsed.push(`${['STANDARD', 'FUZZY', 'KEYWORD', 'PATTERN', 'EMERGENCY'][index]} parsing failed validation`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`${['STANDARD', 'FUZZY', 'KEYWORD', 'PATTERN', 'EMERGENCY'][index]} parsing error: ${errorMessage}`);
        result.fallbacksUsed.push(`${['STANDARD', 'FUZZY', 'KEYWORD', 'PATTERN', 'EMERGENCY'][index]} parsing threw error`);
      }
    }

    // All parsing methods failed
    result.manualReviewRequired = true;
    result.errors.push('All signal parsing methods failed');
    
    return result;
  }

  private async primaryOCRExtraction(imageBuffer: Buffer): Promise<Partial<OCRResult>> {
    // This would call your existing textExtractor
    const Tesseract = require('tesseract.js');
    const { data: { text, confidence } } = await Tesseract.recognize(imageBuffer, 'eng', {
      logger: () => {} // Suppress Tesseract logs
    });
    
    return {
      text: text.trim(),
      confidence: confidence / 100 // Convert to 0-1 scale
    };
  }

  private async enhanceImageForOCR(imageBuffer: Buffer): Promise<Buffer> {
    const sharp = require('sharp');
    
    return await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen()
      .threshold(128)
      .png()
      .toBuffer();
  }

  private async ocrWithDifferentPSM(imageBuffer: Buffer, psm: string): Promise<Partial<OCRResult>> {
    const Tesseract = require('tesseract.js');
    const { data: { text, confidence } } = await Tesseract.recognize(imageBuffer, 'eng', {
      tessedit_pageseg_mode: psm,
      logger: () => {}
    });
    
    return {
      text: text.trim(),
      confidence: confidence / 100
    };
  }

  private async basicOCRFallback(imageBuffer: Buffer): Promise<Partial<OCRResult>> {
    // Most basic OCR settings - last resort
    const Tesseract = require('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:-+/() ',
      logger: () => {}
    });
    
    return {
      text: text.trim(),
      confidence: 0.5 // Lower confidence for basic extraction
    };
  }

  private async patternBasedExtraction(imageBuffer: Buffer): Promise<Partial<OCRResult>> {
    // Pattern-based extraction for when OCR completely fails
    // This is a simplified version - would analyze image pixels for known patterns
    
    // For now, return empty - this would be implemented with computer vision
    return {
      text: '',
      confidence: 0
    };
  }

  private queueForManualReview(imageBuffer: Buffer): string {
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.manualReviewQueue.push({
      imageBuffer,
      timestamp: new Date(),
      id: reviewId
    });
    
    // Keep queue manageable
    if (this.manualReviewQueue.length > 10) {
      this.manualReviewQueue.shift();
    }
    
    return reviewId;
  }

  // Signal parsing methods with different strategies
  private async standardSignalParsing(text: string): Promise<TradeSignal | null> {
    // Your existing realWorldTradeParser logic
    // This would call your existing parser
    return null; // Placeholder
  }

  private async fuzzySignalParsing(text: string): Promise<TradeSignal | null> {
    // More lenient parsing with typo tolerance
    const fuzzyText = text
      .replace(/[O0]/g, '0') // Fix O vs 0 confusion
      .replace(/[Il1]/g, '1') // Fix I vs l vs 1 confusion
      .replace(/[S5]/g, '5') // Fix S vs 5 confusion
      .toLowerCase();

    // Apply fuzzy matching logic here
    return null; // Placeholder
  }

  private async keywordBasedParsing(text: string): Promise<TradeSignal | null> {
    // Extract signal based on known keywords even if format is wrong
    const keywords = {
      symbols: ['XAUUSD', 'GOLD', 'US30', 'DOW', 'EURUSD', 'EUR', 'GBPUSD', 'GBP'],
      directions: ['BUY', 'SELL', 'LONG', 'SHORT', 'CALL', 'PUT'],
      priceTerms: ['ENTRY', 'ENTER', 'PRICE', 'LEVEL', 'ZONE'],
      stopTerms: ['STOP', 'SL', 'STOPLOSS', 'LOSS'],
      targetTerms: ['TARGET', 'TP', 'TAKE', 'PROFIT', 'TAKEPROFIT']
    };

    // Implement keyword-based extraction
    return null; // Placeholder
  }

  private async patternBasedSignalExtraction(text: string): Promise<TradeSignal | null> {
    // Use regex patterns to extract signals even from malformed text
    const patterns = {
      price: /\d+\.?\d*/g,
      symbol: /(XAUUSD|US30|EURUSD|GBPUSD|GOLD|DOW)/i,
      direction: /(BUY|SELL|LONG|SHORT)/i
    };

    // Implement pattern-based extraction
    return null; // Placeholder
  }

  private async emergencyFallbackParsing(text: string): Promise<TradeSignal | null> {
    // Last resort - extract whatever we can and make reasonable assumptions
    // This would implement very loose parsing rules
    
    // For trading signals, we need at minimum:
    // 1. A symbol (or assume XAUUSD if missing)
    // 2. A direction (or assume BUY if missing)
    // 3. Some kind of price level
    
    return null; // Placeholder - would implement emergency logic
  }

  private validateSignal(signal: TradeSignal): boolean {
    // Basic signal validation
    if (!signal.symbol || !signal.action) return false;
    if (!signal.entryZone?.min || !signal.entryZone?.max) return false;
    if (signal.entryZone.min <= 0 || signal.entryZone.max <= 0) return false;
    if (signal.entryZone.min > signal.entryZone.max) return false;
    
    return true;
  }

  /**
   * Get manual review queue for admin interface
   */
  getManualReviewQueue() {
    return this.manualReviewQueue;
  }

  /**
   * Process manual review result
   */
  processManualReview(reviewId: string, extractedText: string): boolean {
    const index = this.manualReviewQueue.findIndex(item => item.id === reviewId);
    if (index !== -1) {
      this.manualReviewQueue.splice(index, 1);
      logger.info(`Manual review processed for ${reviewId}`);
      return true;
    }
    return false;
  }

  /**
   * Get OCR system status
   */
  getSystemStatus() {
    return {
      config: this.config,
      manualReviewQueueSize: this.manualReviewQueue.length,
      systemHealth: 'OPERATIONAL' // Could add health checks
    };
  }
}
