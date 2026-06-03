import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { logger } from '../utils/logger';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number; };
  }>;
}

export class TextExtractor {
  async extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
    try {
      // Preprocess image for better OCR results
      const processedImage = await this.preprocessImage(imageBuffer);
      
      // Use Tesseract for OCR with confidence data
      const { data } = await Tesseract.recognize(processedImage, 'eng', {
        logger: m => logger.debug('OCR Progress:', m),
      });
      
      // data.confidence is the page-level confidence (0–100) — word-level data
      // was removed from the Page type in tesseract.js v6+ (moved into blocks).
      // Since words are not consumed downstream, use page confidence directly.
      const averageConfidence = (data.confidence || 0) / 100;

      logger.info(`OCR completed with ${data.confidence.toFixed(1)}% average confidence`);

      return {
        text: data.text.trim(),
        confidence: averageConfidence,
        words: []
      };
    } catch (error) {
      logger.error('Error extracting text from image:', error);
      throw error;
    }
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      // Try multiple preprocessing approaches for better OCR
      return await sharp(imageBuffer)
        .resize(3000, null, { 
          withoutEnlargement: false,
          fit: 'inside'
        })
        // Convert to grayscale first
        .greyscale()
        // Enhance brightness
        .modulate({
          brightness: 1.3
        })
        // Apply gamma correction
        .gamma(1.2)
        // Normalize the image
        .normalize()
        // Apply linear enhancement
        .linear(1.5, 0)
        // Apply sharpening
        .sharpen({
          sigma: 1.0,
          m1: 1.0,
          m2: 2.0,
          x1: 2.0,
          y2: 10.0
        })
        // Convert to PNG for better quality
        .png({
          quality: 100,
          compressionLevel: 0
        })
        .toBuffer();
    } catch (error) {
      logger.error('Error preprocessing image:', error);
      // Fallback to simpler preprocessing if advanced fails
      return sharp(imageBuffer)
        .resize(2000, null, { 
          withoutEnlargement: false,
          fit: 'inside'
        })
        .greyscale()
        .normalize()
        .png()
        .toBuffer();
    }
  }
}
