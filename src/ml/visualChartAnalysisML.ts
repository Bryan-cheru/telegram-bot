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
      logger.warn('⚠️  Could not detect enough prices from scale, using XAUUSD defaults');
      return {
        minPrice: 3500,  // Default XAUUSD range
        maxPrice: 3600,
        pixelsPerPip: 1,
        scaleRegion
      };
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
   * Detect colored highlights in the chart using computer vision
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

    // Define color ranges for detection (RGB values)
    const colorRanges = {
      grey: {
        r: { min: 150, max: 200 },
        g: { min: 150, max: 200 },
        b: { min: 150, max: 200 }
      },
      green: {
        r: { min: 0, max: 100 },
        g: { min: 150, max: 255 },
        b: { min: 0, max: 100 }
      },
      red: {
        r: { min: 150, max: 255 },
        g: { min: 0, max: 100 },
        b: { min: 0, max: 100 }
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
              zones.push({
                price: Math.round(price * 100) / 100, // Round to 2 decimal places
                confidence: 0.8, // Base confidence for color detection
                region: { x, y, width: 10, height: 10 },
                colorType: colorType as 'grey' | 'green' | 'red'
              });
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
    
    // Look for zone indicators in text
    const lines = ocrText.split('\n');
    
    lines.forEach((line, index) => {
      const linePrice = this.extractPricesFromText(line);
      if (linePrice.length === 0) return;

      const price = linePrice[0];
      
      // Determine zone type based on context keywords
      let colorType: 'grey' | 'green' | 'red' = 'grey'; // Default
      
      if (line.toLowerCase().includes('entry') || line.toLowerCase().includes('zone')) {
        colorType = 'grey';
      } else if (line.toLowerCase().includes('target') || line.toLowerCase().includes('tp')) {
        colorType = 'green';
      } else if (line.toLowerCase().includes('stop') || line.toLowerCase().includes('sl')) {
        colorType = 'red';
      }

      zones.push({
        price,
        confidence: 0.6, // Lower confidence for OCR-based detection
        region: { x: 0, y: index * 20, width: 100, height: 20 },
        colorType
      });
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
        const price = parseFloat(match);
        if (!isNaN(price) && price > 0) {
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
}
