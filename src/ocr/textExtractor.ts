import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { logger } from '../utils/logger';

export class TextExtractor {
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      // Preprocess image for better OCR results
      const processedImage = await this.preprocessImage(imageBuffer);
      
      // Use Tesseract for OCR with optimized settings for trading signals
      const { data: { text } } = await Tesseract.recognize(processedImage, 'eng', {
        logger: m => logger.debug('OCR Progress:', m)
      });
      
      logger.info('Text extracted successfully');
      logger.debug('Raw extracted text:', text);
      return text.trim();
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
