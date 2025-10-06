import sharp from 'sharp';
import { logger } from '../utils/logger';
import { TextExtractor } from '../ocr/textExtractor';
import Tesseract from 'tesseract.js';

export interface ChartRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorZone {
  price: number;
  confidence: number;
  region: ChartRegion;
  colorType: 'grey' | 'green' | 'red';
}

export interface VisualAnalysisResult {
  greyEntryZones: ColorZone[];
  greenTargetZones: ColorZone[];
  redStopZones: ColorZone[];
  priceScale: {
    minPrice: number;
    maxPrice: number;
    pixelsPerPip: number;
    scaleRegion: ChartRegion;
  };
  symbol: string;
  direction: 'BUY' | 'SELL' | null;
  confidence: number;
}

export class VisualChartAnalysisML {
  private textExtractor = new TextExtractor();

  /**
   * Main method to analyze trading chart images
   * Detects grey entry zones, green targets, and red stops visually
   */
  async analyzeChartImage(imageBuffer: Buffer): Promise<VisualAnalysisResult> {
    logger.info('🔍 Starting visual chart analysis...');
    
    try {
      // Step 1: Extract metadata and get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      logger.info(`📊 Chart dimensions: ${metadata.width}x${metadata.height}`);

      // Step 2: Detect the price scale region (usually right side of chart)
      const priceScale = await this.detectPriceScaleRegion(imageBuffer, metadata);
      
      // Step 3: Extract OCR text for fallback price reading
      const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
      
      // Step 4: Detect highlighted color zones
      const colorZones = await this.detectColorHighlights(imageBuffer, priceScale);
      
      // Step 5: Map color zones to price levels
      const mappedZones = await this.mapColorZonesToPrices(colorZones, priceScale, ocrResult.text);
      
      // Step 6: Extract symbol and direction
      const symbol = this.extractSymbolFromOCR(ocrResult.text);
      const direction = this.detectTradeDirection(ocrResult.text, mappedZones);
      
      const result: VisualAnalysisResult = {
        greyEntryZones: mappedZones.filter(z => z.colorType === 'grey'),
        greenTargetZones: mappedZones.filter(z => z.colorType === 'green'),
        redStopZones: mappedZones.filter(z => z.colorType === 'red'),
        priceScale,
        symbol,
        direction,
        confidence: this.calculateOverallConfidence(mappedZones, ocrResult.confidence)
      };

      logger.info(`✅ Visual analysis complete: ${result.greyEntryZones.length} grey, ${result.greenTargetZones.length} green, ${result.redStopZones.length} red zones`);
      return result;

    } catch (error) {
      logger.error('❌ Visual chart analysis failed:', error);
      
      // Try OCR-only fallback when visual analysis completely fails
      try {
        logger.info('🔄 Attempting OCR-only fallback analysis...');
        const ocrResult = await this.textExtractor.extractTextFromImage(imageBuffer);
        const extractedPrices = this.extractPricesFromText(ocrResult.text);
        
        if (extractedPrices.length >= 2) {
          const symbol = this.extractSymbolFromOCR(ocrResult.text);
          const minPrice = Math.min(...extractedPrices);
          const maxPrice = Math.max(...extractedPrices);
          
          // Create basic zones from extracted prices
          const greyEntryZones: ColorZone[] = extractedPrices.map(price => ({
            price,
            confidence: 0.6, // Lower confidence for OCR-only
            region: { x: 0, y: 0, width: 10, height: 10 },
            colorType: 'grey'
          }));
          
          logger.info(`✅ OCR fallback successful: Found ${extractedPrices.length} price levels for ${symbol}`);
          
          return {
            greyEntryZones,
            greenTargetZones: [],
            redStopZones: [],
            priceScale: {
              minPrice,
              maxPrice,
              pixelsPerPip: 1,
              scaleRegion: { x: 0, y: 0, width: 100, height: 100 }
            },
            symbol: symbol || 'UNKNOWN',
            direction: 'BUY', // Default, will be overridden by ML
            confidence: Math.min(ocrResult.confidence / 100, 0.8) // Max 80% for OCR-only
          };
        }
      } catch (fallbackError) {
        logger.error('❌ OCR fallback also failed:', fallbackError);
      }
      
      throw error;
    }
  }

  /**
   * Detect the price scale region (usually right side of chart)
   */
  private async detectPriceScaleRegion(imageBuffer: Buffer, metadata: any): Promise<{
    minPrice: number;
    maxPrice: number;
    pixelsPerPip: number;
    scaleRegion: ChartRegion;
  }> {
    // Price scale is typically the rightmost 8% of the chart (narrower for better accuracy)
    const scaleWidth = Math.floor(metadata.width * 0.08);
    const scaleRegion: ChartRegion = {
      x: metadata.width - scaleWidth - 5, // 5px padding from edge
      y: Math.floor(metadata.height * 0.15), // Skip more of top (usually title/toolbar)
      width: scaleWidth,
      height: Math.floor(metadata.height * 0.7) // Use middle 70% only
    };

    logger.info(`🔍 Extracting price scale region: ${scaleRegion.x},${scaleRegion.y} (${scaleRegion.width}x${scaleRegion.height})`);

    // Extract just the price scale area for OCR analysis with upscaling
    const scaleImage = await sharp(imageBuffer)
      .extract({
        left: scaleRegion.x,
        top: scaleRegion.y,
        width: scaleRegion.width,
        height: scaleRegion.height
      })
      .resize(scaleRegion.width * 3, scaleRegion.height * 3, { // 3x upscale for better OCR
        kernel: sharp.kernel.lanczos3,
        fit: 'fill'
      })
      .sharpen() // Enhance text clarity
      .png()
      .toBuffer();

    // Use OCR to read price values from scale with optimized settings
    let prices: number[] = [];
    
    try {
      const worker = await Tesseract.createWorker('eng');
      
      // Configure for numbers only
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
      });
      
      const ocrResult = await worker.recognize(scaleImage);
      await worker.terminate();
      
      logger.info(`📖 Scale OCR confidence: ${(ocrResult.data.confidence || 0).toFixed(1)}%`);
      prices = this.extractPricesFromText(ocrResult.data.text);
      
    } catch (ocrError) {
      logger.error('OCR failed, falling back to default price extraction:', ocrError);
      const fallbackResult = await this.textExtractor.extractTextFromImage(scaleImage);
      prices = this.extractPricesFromText(fallbackResult.text);
    }
    
    if (prices.length < 2) {
      logger.warn('⚠️  Could not detect enough prices from scale, attempting fallback to main OCR extraction');
      
      // Try to extract prices from the full image OCR as fallback
      const fullImageOCR = await this.textExtractor.extractTextFromImage(imageBuffer);
      const fallbackPrices = this.extractPricesFromText(fullImageOCR.text);
      
      if (fallbackPrices.length >= 2) {
        const minPrice = Math.min(...fallbackPrices);
        const maxPrice = Math.max(...fallbackPrices);
        const pixelsPerPip = scaleRegion.height / (maxPrice - minPrice);
        
        logger.info(`📈 Using fallback prices from full OCR: ${minPrice} - ${maxPrice}`);
        return {
          minPrice,
          maxPrice,
          pixelsPerPip,
          scaleRegion
        };
      }
      
      logger.error('❌ Cannot determine price scale - insufficient price data from both scale OCR and full image OCR');
      throw new Error('Price scale detection failed - no valid prices found in image');
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const pixelsPerPip = scaleRegion.height / (maxPrice - minPrice);

    logger.info(`📏 Price scale detected: ${minPrice} - ${maxPrice} (${pixelsPerPip.toFixed(2)} pixels/pip)`);

    return {
      minPrice,
      maxPrice,
      pixelsPerPip,
      scaleRegion
    };
  }

  /**
   * Detect colored highlights in the chart using computer vision - ENHANCED FOR ALL SYMBOLS
   */
  private async detectColorHighlights(imageBuffer: Buffer, priceScale: any): Promise<ColorZone[]> {
    const zones: ColorZone[] = [];

    // Extract RGB data from the image
    const { data, info } = await sharp(imageBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Focus on the price scale region for highlight detection
    const scaleLeft = priceScale.scaleRegion.x;
    const scaleTop = priceScale.scaleRegion.y;
    const scaleRight = scaleLeft + priceScale.scaleRegion.width;
    const scaleBottom = scaleTop + priceScale.scaleRegion.height;

    logger.info(`🎨 Scanning for color highlights in scale region: ${scaleLeft}-${scaleRight}, ${scaleTop}-${scaleBottom}`);

    // ENHANCED color ranges for better detection across different chart themes
    const colorRanges = {
      // PRIORITY 1: Grey highlighted price scale (entry zones) - MOST IMPORTANT
      primaryGrey: {
        r: { min: 120, max: 160 },
        g: { min: 120, max: 160 },
        b: { min: 120, max: 160 }
      },
      // PRIORITY 2: Dark grey highlighted areas
      darkGrey: {
        r: { min: 80, max: 140 },
        g: { min: 80, max: 140 },
        b: { min: 80, max: 140 }
      },
      // PRIORITY 3: Very dark highlighted scale areas
      veryDarkGrey: {
        r: { min: 60, max: 110 },
        g: { min: 60, max: 110 },
        b: { min: 60, max: 110 }
      },
      // PRIORITY 4: Light grey highlights
      lightGrey: {
        r: { min: 160, max: 200 },
        g: { min: 160, max: 200 },
        b: { min: 160, max: 200 }
      },
      // PRIORITY 5: Medium grey range
      mediumGrey: {
        r: { min: 100, max: 180 },
        g: { min: 100, max: 180 },
        b: { min: 100, max: 180 }
      },
      
      // Green highlights (target zones) - enhanced for different shades
      green: {
        r: { min: 0, max: 120 },
        g: { min: 100, max: 255 },
        b: { min: 0, max: 120 }
      },
      lightGreen: {
        r: { min: 100, max: 200 },
        g: { min: 180, max: 255 },
        b: { min: 100, max: 200 }
      },
      darkGreen: {
        r: { min: 0, max: 80 },
        g: { min: 120, max: 200 },
        b: { min: 0, max: 80 }
      },
      
      // Red highlights (stop loss zones) - enhanced for different shades
      red: {
        r: { min: 150, max: 255 },
        g: { min: 0, max: 100 },
        b: { min: 0, max: 100 }
      },
      darkRed: {
        r: { min: 100, max: 180 },
        g: { min: 0, max: 60 },
        b: { min: 0, max: 60 }
      },
      orange: {
        r: { min: 200, max: 255 },
        g: { min: 80, max: 180 },
        b: { min: 0, max: 80 }
      },
      
      // Additional color variations for different chart themes
      yellow: {
        r: { min: 200, max: 255 },
        g: { min: 200, max: 255 },
        b: { min: 0, max: 100 }
      },
      blue: {
        r: { min: 0, max: 100 },
        g: { min: 100, max: 200 },
        b: { min: 150, max: 255 }
      }
    };

    // Scan for color highlights
    for (let y = scaleTop; y < scaleBottom; y += 5) { // Sample every 5 pixels for performance
      for (let x = scaleLeft; x < scaleRight; x += 5) {
        const pixelIndex = (y * width + x) * channels;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];

        // Check each color range
        for (const [colorType, range] of Object.entries(colorRanges)) {
          if (
            r >= range.r.min && r <= range.r.max &&
            g >= range.g.min && g <= range.g.max &&
            b >= range.b.min && b <= range.b.max
          ) {
            // Found a color match - calculate the price level
            const relativeY = y - scaleTop;
            const priceRatio = 1 - (relativeY / priceScale.scaleRegion.height); // Invert Y axis
            const price = priceScale.minPrice + (priceScale.maxPrice - priceScale.minPrice) * priceRatio;

            // Check if we already have a zone at this price level
            const existingZone = zones.find(z => 
              z.colorType === colorType && 
              Math.abs(z.price - price) < (priceScale.maxPrice - priceScale.minPrice) * 0.02 // Within 2% of price range
            );

            if (!existingZone) {
              // Map color variations to main categories
              const mainColorType = this.mapToMainColorType(colorType);
              
              zones.push({
                price: Math.round(price * 100) / 100, // Round to 2 decimal places
                confidence: this.calculateColorConfidence(colorType, r, g, b),
                region: { x, y, width: 10, height: 10 },
                colorType: mainColorType
              });
              
              // Log detection for debugging
              logger.debug(`🎨 Color detected: ${colorType} at price ${price.toFixed(5)} (RGB: ${r},${g},${b})`);
            } else {
              // Increase confidence for repeated detections
              existingZone.confidence = Math.min(1.0, existingZone.confidence + 0.1);
            }
          }
        }
      }
    }

    // Group nearby zones and improve confidence
    const groupedZones = this.groupNearbyZones(zones, priceScale);
    
    logger.info(`🎯 Detected ${groupedZones.length} color zones:`, 
      groupedZones.map(z => `${z.colorType}: ${z.price}`));

    return groupedZones;
  }

  /**
   * Map detected color zones to actual price levels
   */
  private async mapColorZonesToPrices(
    colorZones: ColorZone[], 
    priceScale: any, 
    ocrText: string
  ): Promise<ColorZone[]> {
    // If no color zones detected, try to extract from OCR text as fallback
    if (colorZones.length === 0) {
      logger.warn('⚠️  No color highlights detected, falling back to OCR text analysis');
      return this.extractZonesFromOCRText(ocrText, priceScale);
    }

    // Validate and refine detected zones using OCR text
    const refinedZones = colorZones.map(zone => {
      const ocrPrices = this.extractPricesFromText(ocrText);
      const closestOCRPrice = this.findClosestPrice(zone.price, ocrPrices);
      
      if (closestOCRPrice && Math.abs(zone.price - closestOCRPrice) < zone.price * 0.05) {
        // OCR confirms the detected price, increase confidence
        return {
          ...zone,
          price: closestOCRPrice,
          confidence: Math.min(zone.confidence + 0.2, 1.0)
        };
      }
      
      return zone;
    });

    return refinedZones;
  }

  /**
   * Fallback method: Extract zones from OCR text when visual detection fails
   */
  private extractZonesFromOCRText(ocrText: string, priceScale: any): ColorZone[] {
    logger.info('📝 Extracting zones from OCR text...');
    
    const zones: ColorZone[] = [];
    const prices = this.extractPricesFromText(ocrText);
    
    if (prices.length === 0) {
      logger.warn('❌ No prices found in OCR text');
      return zones;
    }
    
    logger.info(`📊 Found ${prices.length} prices: ${prices.join(', ')}`);
    
    // Create zones from all detected prices
    prices.forEach((price, index) => {
      // Determine zone type based on context around the price
      let colorType: 'grey' | 'green' | 'red' = 'grey'; // Default to entry zone
      
      // Look for keywords in the text near this price
      const textLower = ocrText.toLowerCase();
      if (textLower.includes('supply') || textLower.includes('resistance')) {
        colorType = 'grey'; // Supply/resistance = entry zone
      } else if (textLower.includes('target') || textLower.includes('tp') || textLower.includes('take profit')) {
        colorType = 'green';
      } else if (textLower.includes('stop') || textLower.includes('sl') || textLower.includes('stop loss')) {
        colorType = 'red';
      }
      
      zones.push({
        price,
        confidence: 0.7, // Good confidence for clearly extracted prices
        region: { x: 0, y: index * 30, width: 100, height: 20 },
        colorType
      });
      
      logger.info(`🎯 Created ${colorType} zone at price ${price}`);
    });

    return zones;
  }

  /**
   * Extract numerical price values from text
   */
  private extractPricesFromText(text: string): number[] {
    logger.info(`🔍 Extracting prices from text: "${text.substring(0, 200)}..."`);
    
    // Enhanced price patterns for different instruments
    const pricePatterns = [
      /\b[1-9]\d{3,4}\.?\d{0,2}\b/g,  // XAUUSD format: 3521, 3526.50 (1000-99999)
      /\b\d{1,3}\.\d{4,5}\b/g,        // EURUSD format: 1.08500
      /\b\d{2,4}\.\d{2,3}\b/g         // General format: 134.50
    ];

    const prices: number[] = [];
    
    pricePatterns.forEach((pattern, index) => {
      const matches = text.match(pattern) || [];
      logger.info(`Pattern ${index + 1}: Found ${matches.length} matches: [${matches.slice(0, 5).join(', ')}${matches.length > 5 ? '...' : ''}]`);
      
      matches.forEach(match => {
        let price = parseFloat(match);
        if (!isNaN(price) && price > 0) {
          
          // INTELLIGENT PRICE RECONSTRUCTION based on context and other extracted prices
          price = this.reconstructTruncatedPrice(price, prices, text);
          
          // Additional filtering based on instrument type
          if (this.isValidPriceForInstrument(price)) {
            prices.push(price);
          }
        }
      });
    });

    // Remove duplicates and sort
    const uniquePrices = [...new Set(prices)].sort((a, b) => b - a);
    logger.info(`📊 Valid prices extracted: [${uniquePrices.slice(0, 10).join(', ')}${uniquePrices.length > 10 ? '...' : ''}]`);
    
    return uniquePrices;
  }

  /**
   * Validate if a price is reasonable for the detected instrument
   */
  private isValidPriceForInstrument(price: number): boolean {
    // For XAUUSD (Gold), typical range is 1500-5000
    if (price >= 1500 && price <= 5000) return true;
    
    // For EURUSD, GBPUSD etc, typical range is 0.5-2.0
    if (price >= 0.5 && price <= 2.0) return true;
    
    // For USDJPY, EURJPY etc, typical range is 50-200
    if (price >= 50 && price <= 200) return true;
    
    // Reject obvious false positives
    if (price < 0.1 || price > 10000) return false;
    
    return true;
  }

  /**
   * Intelligently reconstruct truncated prices based on context and existing valid prices
   */
  private reconstructTruncatedPrice(price: number, existingPrices: number[], text: string): number {
    const originalPrice = price;
    
    // Get symbol context
    const isGoldContext = /gold|xau|au/i.test(text);
    const isSilverContext = /silver|xag|ag/i.test(text);
    const isBitcoinContext = /bitcoin|btc/i.test(text);
    const isForexContext = /eur|gbp|usd|jpy|cad|aud|nzd|chf/i.test(text);
    
    // Find existing valid prices to determine the expected range
    const validPrices = existingPrices.filter(p => this.isValidPriceForInstrument(p));
    
    if (validPrices.length > 0) {
      const avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      const priceRange = Math.max(...validPrices) - Math.min(...validPrices);
      
      // Context-based reconstruction
      if (isGoldContext && price >= 200 && price <= 999) {
        // Gold: 590 → 3590, 2450 → 2450 (already valid)
        const thousandsDigit = Math.floor(avgPrice / 1000);
        const reconstructed = thousandsDigit * 1000 + price;
        
        if (Math.abs(reconstructed - avgPrice) <= priceRange * 2) {
          logger.info(`🔧 Gold price reconstruction: ${originalPrice} → ${reconstructed} (context: avg=${avgPrice.toFixed(0)})`);
          return reconstructed;
        }
      }
      
      if (isSilverContext && price >= 10 && price <= 99) {
        // Silver: 45 → 25.45 or 2545 depending on context
        if (avgPrice > 1000) {
          // High Silver prices (2545.50 format)
          const reconstructed = 2000 + price;
          if (Math.abs(reconstructed - avgPrice) <= priceRange * 2) {
            logger.info(`🔧 Silver price reconstruction: ${originalPrice} → ${reconstructed}`);
            return reconstructed;
          }
        } else {
          // Normal Silver prices (25.45 format)
          const reconstructed = price / 10; // 250 → 25.0
          if (reconstructed >= 15 && reconstructed <= 60) {
            logger.info(`🔧 Silver price reconstruction: ${originalPrice} → ${reconstructed}`);
            return reconstructed;
          }
        }
      }
      
      // Generic approach: try adding missing leading digits
      if (price >= 100 && price <= 999) {
        // Try adding 1, 2, 3, 4 as leading digit
        for (let leadingDigit = 1; leadingDigit <= 4; leadingDigit++) {
          const reconstructed = leadingDigit * 1000 + price;
          if (Math.abs(reconstructed - avgPrice) <= priceRange * 2 && 
              this.isValidPriceForInstrument(reconstructed)) {
            logger.info(`🔧 Generic price reconstruction: ${originalPrice} → ${reconstructed} (leading digit: ${leadingDigit})`);
            return reconstructed;
          }
        }
      }
    }
    
    // Fallback: Symbol-specific hard-coded reconstruction for common cases
    if (isGoldContext && price >= 500 && price <= 700) {
      const reconstructed = 3000 + price;
      logger.info(`🔧 Gold fallback reconstruction: ${originalPrice} → ${reconstructed}`);
      return reconstructed;
    }
    
    return originalPrice; // Return unchanged if no reconstruction possible
  }

  /**
   * Extract trading symbol from OCR text with enhanced detection
   */
  private extractSymbolFromOCR(ocrText: string): string {
    logger.info(`🔍 Detecting instrument from text: "${ocrText.substring(0, 200)}..."`);
    
    const symbolPatterns = [
      // Direct symbol patterns
      /#?([A-Z]{6})\b/g,                    // #XAUUSD, #EURUSD
      /\b([A-Z]{3}USD)\b/gi,                // XAUUSD, EURUSD, GBPUSD
      /\b(XAU[A-Z]{3})\b/gi,                // XAUUSD variations
      
      // Chart title patterns
      /Gold\s+Spot\s*\/\s*U\.?S\.?\s*Dollar/gi,    // "Gold Spot / U.S. Dollar"
      /Silver\s+Spot\s*\/\s*U\.?S\.?\s*Dollar/gi,   // "Silver Spot / U.S. Dollar"
      /EUR\s*\/\s*USD/gi,                           // "EUR / USD"
      /GBP\s*\/\s*USD/gi,                           // "GBP / USD"
      
      // Common aliases
      /\b(GOLD|SILVER|EURUSD|GBPUSD|USDJPY|EURJPY)\b/gi,
      
      // Flexible 6-letter pairs
      /\b([A-Z]{3}[A-Z]{3})\b/g
    ];

    let detectedSymbol = 'UNKNOWN';
    let confidence = 0;

    for (const pattern of symbolPatterns) {
      const matches = ocrText.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          let symbol = match.replace('#', '').toUpperCase();
          
          // Enhanced symbol conversion with OCR error correction
          if (symbol.includes('GOLD') || symbol.includes('SPOT')) {
            symbol = 'XAUUSD';
            confidence = 95;
          } else if (symbol.includes('SILVER')) {
            symbol = 'XAGUSD'; 
            confidence = 95;
          } else if (symbol === 'GOLD') {
            symbol = 'XAUUSD';
            confidence = 90;
          } else if (symbol === 'SILVER') {
            symbol = 'XAGUSD';
            confidence = 90;
          } else if (symbol.match(/^XAU[A-Z]{3}$/)) {
            // Handle OCR errors in XAUUSD (like XAUUST)
            symbol = 'XAUUSD';
            confidence = 85;
          } else if (symbol.match(/^[A-Z]{6}$/)) {
            // Valid 6-letter pair
            confidence = 70;
          }
          
          if (confidence > 0) {
            detectedSymbol = symbol;
            logger.info(`💰 Detected instrument: ${symbol} (${confidence}% confidence)`);
            break;
          }
        }
        
        if (detectedSymbol !== 'UNKNOWN') break;
      }
    }

    if (detectedSymbol === 'UNKNOWN') {
      logger.warn('⚠️ Could not detect instrument, using XAUUSD as default');
      detectedSymbol = 'XAUUSD'; // Default to Gold for chart analysis
    }

    return detectedSymbol;
  }

  /**
   * Detect trade direction from context
   */
  private detectTradeDirection(ocrText: string, zones: ColorZone[]): 'BUY' | 'SELL' | null {
    const buyKeywords = ['buy', 'long', 'bullish', '🔼', '⬆️'];
    const sellKeywords = ['sell', 'short', 'bearish', '🔽', '⬇️'];

    const text = ocrText.toLowerCase();
    
    const buyScore = buyKeywords.reduce((score, keyword) => 
      score + (text.includes(keyword) ? 1 : 0), 0);
    const sellScore = sellKeywords.reduce((score, keyword) => 
      score + (text.includes(keyword) ? 1 : 0), 0);

    if (buyScore > sellScore) return 'BUY';
    if (sellScore > buyScore) return 'SELL';

    // Try to infer from zone positions
    const greyZones = zones.filter(z => z.colorType === 'grey');
    const greenZones = zones.filter(z => z.colorType === 'green');
    
    if (greyZones.length > 0 && greenZones.length > 0) {
      const avgGrey = greyZones.reduce((sum, z) => sum + z.price, 0) / greyZones.length;
      const avgGreen = greenZones.reduce((sum, z) => sum + z.price, 0) / greenZones.length;
      
      return avgGreen > avgGrey ? 'BUY' : 'SELL';
    }

    return null;
  }

  /**
   * Group nearby color zones to reduce noise
   */
  private groupNearbyZones(zones: ColorZone[], priceScale: any): ColorZone[] {
    const grouped: ColorZone[] = [];
    const priceThreshold = (priceScale.maxPrice - priceScale.minPrice) * 0.01; // 1% threshold

    zones.forEach(zone => {
      const existing = grouped.find(g => 
        g.colorType === zone.colorType && 
        Math.abs(g.price - zone.price) < priceThreshold
      );

      if (existing) {
        // Improve confidence and average the price
        existing.confidence = Math.max(existing.confidence, zone.confidence);
        existing.price = (existing.price + zone.price) / 2;
      } else {
        grouped.push({ ...zone });
      }
    });

    return grouped;
  }

  /**
   * Find the closest price from a list
   */
  private findClosestPrice(targetPrice: number, prices: number[]): number | null {
    if (prices.length === 0) return null;
    
    return prices.reduce((closest, price) => 
      Math.abs(price - targetPrice) < Math.abs(closest - targetPrice) ? price : closest
    );
  }

  /**
   * Calculate overall confidence based on zone detection and OCR quality
   */
  private calculateOverallConfidence(zones: ColorZone[], ocrConfidence: number): number {
    if (zones.length === 0) return 0;
    
    const avgZoneConfidence = zones.reduce((sum, z) => sum + z.confidence, 0) / zones.length;
    return (avgZoneConfidence + ocrConfidence) / 2;
  }

  /**
   * Convert visual analysis result to trading signal format
   */
  convertToTradingSignal(analysis: VisualAnalysisResult): {
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    entryZone: { min: number; max: number } | null;
    targets: number[];
    stopLoss: number | null;
    confidence: number;
    source: 'VISUAL_ML';
  } {
    // Determine entry zone from grey highlights
    let entryZone: { min: number; max: number } | null = null;
    if (analysis.greyEntryZones.length > 0) {
      const entryPrices = analysis.greyEntryZones.map(z => z.price);
      entryZone = {
        min: Math.min(...entryPrices),
        max: Math.max(...entryPrices)
      };
    }

    // Extract targets from green zones
    const targets = analysis.greenTargetZones.map(z => z.price).sort((a, b) => 
      analysis.direction === 'BUY' ? a - b : b - a
    );

    // Extract stop loss from red zones
    const stopLoss = analysis.redStopZones.length > 0 ? 
      analysis.redStopZones[0].price : null;

    return {
      symbol: analysis.symbol,
      action: analysis.direction || 'HOLD',
      entryZone,
      targets,
      stopLoss,
      confidence: analysis.confidence,
      source: 'VISUAL_ML'
    };
  }

  /**
   * Map color variations to main categories
   */
  private mapToMainColorType(colorType: string): 'grey' | 'green' | 'red' {
    const colorMapping: { [key: string]: 'grey' | 'green' | 'red' } = {
      // Enhanced grey detection for entry zones
      'grey': 'grey',
      'primaryGrey': 'grey',
      'darkGrey': 'grey',
      'veryDarkGrey': 'grey',
      'lightGrey': 'grey',
      'mediumGrey': 'grey',
      // Green zones for targets
      'green': 'green',
      'lightGreen': 'green',
      'darkGreen': 'green',
      'yellow': 'green', // Often used for targets
      'blue': 'grey',    // Often used for entry zones
      // Red zones for stops
      'red': 'red',
      'darkRed': 'red',
      'orange': 'red'    // Often used for stops
    };
    
    return colorMapping[colorType] || 'grey';
  }

  /**
   * Calculate confidence based on color intensity and type
   */
  private calculateColorConfidence(colorType: string, r: number, g: number, b: number): number {
    // Base confidence
    let confidence = 0.6;
    
    // Increase confidence for stronger colors
    const intensity = (r + g + b) / 3;
    const colorStrength = Math.max(r, g, b) - Math.min(r, g, b);
    
    // Strong colors get higher confidence
    if (colorStrength > 100) confidence += 0.2;
    if (colorStrength > 150) confidence += 0.1;
    
    // Specific color type bonuses - PRIORITIZE GREY ENTRY ZONES
    switch (colorType) {
      case 'primaryGrey':
        confidence += 0.25; // Highest priority for primary grey entry zones
        break;
      case 'darkGrey':
      case 'veryDarkGrey':
        confidence += 0.20; // High priority for dark grey zones
        break;
      case 'mediumGrey':
      case 'grey':
        confidence += 0.15; // Good priority for standard grey zones
        break;
      case 'lightGrey':
        confidence += 0.10; // Lower but still good for light grey
        break;
      case 'green':
      case 'red':
        confidence += 0.10; // Primary colors are reliable
        break;
      default:
        confidence += 0.05; // Other colors get small bonus
        break;
    }
    
    return Math.min(1.0, confidence);
  }


}
