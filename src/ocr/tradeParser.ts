import { TradeSignal, TradeAction } from '../types';
import { logger } from '../utils/logger';
import { PositionSizeCalculator, PositionSizingConfig, PositionCalculation } from '../utils/positionSizing';

export class TradeParser {
  private readonly FOREX_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF', 'AUDNZD',
    'NZDJPY', 'GBPAUD', 'GBPCAD', 'EURNZD', 'AUDCAD', 'GBPCHF', 'AUDCHF'
  ];

  private readonly METAL_SYMBOLS = [
    'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER'
  ];

  private readonly INDEX_SYMBOLS = [
    'US30', 'NAS100', 'SPX500', 'UK100', 'GER30', 'FRA40', 'JPN225'
  ];

  /**
   * Main method to parse trade signals from extracted text
   */
  parseTradeSignal(text: string, caption?: string): TradeSignal | null {
    try {
      logger.info('🔍 Parsing trade signal from text');
      logger.debug('Raw text:', text);
      if (caption) logger.debug('Caption:', caption);

      // Combine text and caption for analysis
      const fullText = caption ? `${text}\n${caption}` : text;
      
      // Check if this is a result/update message that shouldn't be traded
      if (this.isResultOrUpdateMessage(fullText)) {
        logger.info('📊 Detected result/update message - skipping trade signal parsing');
        return null;
      }
      
      const cleanText = this.cleanText(fullText);

      // Try different parsing strategies
      const strategies = [
        () => this.parseVisualChartSignal(cleanText, caption),
        () => this.parseStandardSignal(cleanText),
        () => this.parseChartSetupSignal(cleanText),
        () => this.parseCombinedTextImageSignal(cleanText),
        () => this.parseFlexibleFormatSignal(cleanText),
        () => this.parsePriceActionSignal(cleanText)
      ];

      for (const strategy of strategies) {
        const signal = strategy();
        if (signal && this.validateSignal(signal)) {
          logger.info('✅ Successfully parsed trade signal:', {
            symbol: signal.symbol,
            action: signal.action,
            entryZone: signal.entryZone,
            stopLoss: signal.stopLoss,
            targets: signal.targets
          });
          return signal;
        }
      }

      logger.warn('❌ Could not parse trade signal from text');
      return null;
    } catch (error) {
      logger.error('Error parsing trade signal:', error);
      return null;
    }
  }

  /**
   * Check if the message is a result/update post that shouldn't trigger trades
   */
  public isResultOrUpdateMessage(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Keywords that indicate this is a result/update message
    const resultKeywords = [
      'result update',
      'results update', 
      'trade result',
      'trade closed',
      'position closed',
      'target hit',
      'target reached',
      'pips secured',
      'profit secured',
      'trade completed',
      'closed position',
      'perfect execution',
      'precision delivered',
      'no drawdown'
    ];
    
    // Phrases that indicate past tense trading results
    const pastTensePhrases = [
      'entry:',
      'target hit:',
      'secured!',
      'delivered',
      'executed',
      'hit:'
    ];
    
    // Check for result keywords
    const hasResultKeyword = resultKeywords.some(keyword => 
      lowerText.includes(keyword)
    );
    
    // Check for combination of past tense and trading terms
    const hasPastTenseTrading = pastTensePhrases.some(phrase => 
      lowerText.includes(phrase)
    ) && (lowerText.includes('entry:') || lowerText.includes('target hit:'));
    
    // Additional pattern: Messages with "→" indicating completed moves
    const hasCompletedMove = lowerText.includes('entry:') && lowerText.includes('→') && lowerText.includes('target hit:');
    
    if (hasResultKeyword || hasPastTenseTrading || hasCompletedMove) {
      logger.info('🚫 Identified result/update message - contains:', {
        resultKeyword: hasResultKeyword,
        pastTenseTrading: hasPastTenseTrading,
        completedMove: hasCompletedMove,
        preview: text.substring(0, 100) + '...'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Parse visual chart signals with highlighted zones and pip values
   * Handles charts with visual entry zones, targets, and caption-based setups
   */
  private parseVisualChartSignal(text: string, caption?: string): TradeSignal | null {
    try {
      logger.info('🎯 Attempting to parse visual chart signal (ALL CHARTS have highlighted zones)');
      
      // Enhanced symbol detection with # prefix support for multiple instruments
      const symbolPatterns = [
        // =================== CAPTION-BASED SYMBOLS (Priority Detection) ===================
        
        // Major Indices
        caption && caption.match(/#(NAS100|NASDAQ|US100|NDX)/i) ? ['NAS100', caption.match(/#(NAS100|NASDAQ|US100|NDX)/i)![1]] : null,
        caption && caption.match(/#(SPX500|SPY|S&P500|SP500)/i) ? ['SPX500', caption.match(/#(SPX500|SPY|S&P500|SP500)/i)![1]] : null,
        caption && caption.match(/#(DJ30|DJI|DOWJONES|DOW)/i) ? ['DJ30', caption.match(/#(DJ30|DJI|DOWJONES|DOW)/i)![1]] : null,
        caption && caption.match(/#(DAX40|DAX|GER40)/i) ? ['DAX40', caption.match(/#(DAX40|DAX|GER40)/i)![1]] : null,
        caption && caption.match(/#(FTSE100|UK100|UKX)/i) ? ['FTSE100', caption.match(/#(FTSE100|UK100|UKX)/i)![1]] : null,
        caption && caption.match(/#(AUS200|ASX200)/i) ? ['AUS200', caption.match(/#(AUS200|ASX200)/i)![1]] : null,
        caption && caption.match(/#(JPN225|NKY|NIKKEI)/i) ? ['JPN225', caption.match(/#(JPN225|NKY|NIKKEI)/i)![1]] : null,
        
        // Metals & Commodities
        caption && caption.match(/#(XAUUSD|Gold|XAU|GOLD)/i) ? ['XAUUSD', caption.match(/#(XAUUSD|Gold|XAU|GOLD)/i)![1]] : null,
        caption && caption.match(/#(XAGUSD|Silver|XAG|SILVER)/i) ? ['XAGUSD', caption.match(/#(XAGUSD|Silver|XAG|SILVER)/i)![1]] : null,
        caption && caption.match(/#(XPTUSD|Platinum|XPT)/i) ? ['XPTUSD', caption.match(/#(XPTUSD|Platinum|XPT)/i)![1]] : null,
        caption && caption.match(/#(XPDUSD|Palladium|XPD)/i) ? ['XPDUSD', caption.match(/#(XPDUSD|Palladium|XPD)/i)![1]] : null,
        caption && caption.match(/#(USOIL|WTI|CRUDE|CL)/i) ? ['USOIL', caption.match(/#(USOIL|WTI|CRUDE|CL)/i)![1]] : null,
        caption && caption.match(/#(UKOIL|BRENT|BRN)/i) ? ['UKOIL', caption.match(/#(UKOIL|BRENT|BRN)/i)![1]] : null,
        caption && caption.match(/#(NGAS|NATGAS|NG)/i) ? ['NGAS', caption.match(/#(NGAS|NATGAS|NG)/i)![1]] : null,
        
        // Cryptocurrencies (if supported by broker)
        caption && caption.match(/#(BTCUSD|Bitcoin|BTC)/i) ? ['BTCUSD', caption.match(/#(BTCUSD|Bitcoin|BTC)/i)![1]] : null,
        caption && caption.match(/#(ETHUSD|Ethereum|ETH)/i) ? ['ETHUSD', caption.match(/#(ETHUSD|Ethereum|ETH)/i)![1]] : null,
        caption && caption.match(/#(LTCUSD|Litecoin|LTC)/i) ? ['LTCUSD', caption.match(/#(LTCUSD|Litecoin|LTC)/i)![1]] : null,
        
        // Major Forex Pairs
        caption && caption.match(/#(EURUSD|EUR\/USD)/i) ? ['EURUSD', caption.match(/#(EURUSD|EUR\/USD)/i)![1]] : null,
        caption && caption.match(/#(GBPUSD|GBP\/USD|Cable)/i) ? ['GBPUSD', caption.match(/#(GBPUSD|GBP\/USD|Cable)/i)![1]] : null,
        caption && caption.match(/#(USDJPY|USD\/JPY)/i) ? ['USDJPY', caption.match(/#(USDJPY|USD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(USDCHF|USD\/CHF|Swissy)/i) ? ['USDCHF', caption.match(/#(USDCHF|USD\/CHF|Swissy)/i)![1]] : null,
        caption && caption.match(/#(AUDUSD|AUD\/USD|Aussie)/i) ? ['AUDUSD', caption.match(/#(AUDUSD|AUD\/USD|Aussie)/i)![1]] : null,
        caption && caption.match(/#(USDCAD|USD\/CAD|Loonie)/i) ? ['USDCAD', caption.match(/#(USDCAD|USD\/CAD|Loonie)/i)![1]] : null,
        caption && caption.match(/#(NZDUSD|NZD\/USD|Kiwi)/i) ? ['NZDUSD', caption.match(/#(NZDUSD|NZD\/USD|Kiwi)/i)![1]] : null,
        
        // Minor & Exotic Forex Pairs
        caption && caption.match(/#(EURGBP|EUR\/GBP)/i) ? ['EURGBP', caption.match(/#(EURGBP|EUR\/GBP)/i)![1]] : null,
        caption && caption.match(/#(EURJPY|EUR\/JPY)/i) ? ['EURJPY', caption.match(/#(EURJPY|EUR\/JPY)/i)![1]] : null,
        caption && caption.match(/#(GBPJPY|GBP\/JPY)/i) ? ['GBPJPY', caption.match(/#(GBPJPY|GBP\/JPY)/i)![1]] : null,
        caption && caption.match(/#(GBPCAD|GBP\/CAD)/i) ? ['GBPCAD', caption.match(/#(GBPCAD|GBP\/CAD)/i)![1]] : null,
        caption && caption.match(/#(AUDCAD|AUD\/CAD)/i) ? ['AUDCAD', caption.match(/#(AUDCAD|AUD\/CAD)/i)![1]] : null,
        caption && caption.match(/#(AUDJPY|AUD\/JPY)/i) ? ['AUDJPY', caption.match(/#(AUDJPY|AUD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(CADJPY|CAD\/JPY)/i) ? ['CADJPY', caption.match(/#(CADJPY|CAD\/JPY)/i)![1]] : null,
        caption && caption.match(/#(CHFJPY|CHF\/JPY)/i) ? ['CHFJPY', caption.match(/#(CHFJPY|CHF\/JPY)/i)![1]] : null,
        caption && caption.match(/#(EURNZD|EUR\/NZD)/i) ? ['EURNZD', caption.match(/#(EURNZD|EUR\/NZD)/i)![1]] : null,
        caption && caption.match(/#(NZDCAD|NZD\/CAD)/i) ? ['NZDCAD', caption.match(/#(NZDCAD|NZD\/CAD)/i)![1]] : null,
        caption && caption.match(/#(NZDJPY|NZD\/JPY)/i) ? ['NZDJPY', caption.match(/#(NZDJPY|NZD\/JPY)/i)![1]] : null,
        
        // Generic pattern for ANY trading symbol with # prefix (catches futures, exotic pairs, etc.)
        caption && caption.match(/#([A-Z]{3,8})/i) ? [caption.match(/#([A-Z]{3,8})/i)![1].toUpperCase(), caption.match(/#([A-Z]{3,8})/i)![1]] : null,
        
        // =================== TEXT-BASED FALLBACKS ===================
        text.match(/#?(XAUUSD|Gold|XAU\/USD)/i) ? ['XAUUSD', text.match(/#?(XAUUSD|Gold|XAU\/USD)/i)![1]] : null,
        text.match(/#?(NAS100|NASDAQ|US100)/i) ? ['NAS100', text.match(/#?(NAS100|NASDAQ|US100)/i)![1]] : null,
        text.match(/#?(SPX500|SPY|S&P500)/i) ? ['SPX500', text.match(/#?(SPX500|SPY|S&P500)/i)![1]] : null,
        text.match(/#?(BTCUSD|Bitcoin|BTC)/i) ? ['BTCUSD', text.match(/#?(BTCUSD|Bitcoin|BTC)/i)![1]] : null
      ].filter(Boolean);
      
      let symbol: string | null = null;
      
      if (symbolPatterns.length > 0) {
        symbol = symbolPatterns[0]![0]; // Get the standardized symbol
        logger.info(`📈 Symbol detected: ${symbol} from pattern: ${symbolPatterns[0]![1]}`);
      } else {
        // Smart fallback based on price ranges and patterns
        const hasBitcoinPrices = /\b[4-9]\d{4}\.\d{1,2}\b/.test(text);        // 40000-99999 range (Bitcoin)
        const hasNasPrices = /\b[1-2]\d{4}\.\d{1,2}\b/.test(text);            // 10000-29999 range (NAS100)  
        const hasSpxPrices = /\b[3-6]\d{3}\.\d{1,2}\b/.test(text);            // 3000-6999 range (SPX500)
        const hasGoldPrices = /\b[1-3]\d{3}\.\d{2,3}\b/.test(text);           // 1000-3999 range (Gold)
        const hasSilverPrices = /\b[1-5]\d\.\d{2,3}\b/.test(text);            // 10-59 range (Silver)
        const hasOilPrices = /\b[3-9]\d\.\d{2}\b/.test(text);                 // 30-99 range (Oil)
        const hasForexPrices = /\b[01]\.\d{4,5}\b/.test(text);                // 0.x or 1.x range (Forex)
        const hasJpyPrices = /\b1[0-5]\d\.\d{2,3}\b/.test(text);              // 100-159 range (JPY pairs)
        const hasEthPrices = /\b[1-4]\d{3}\.\d{1,2}\b/.test(text);            // 1000-4999 range (Ethereum)
        
        // Price-based symbol detection (most specific first)
        if (hasBitcoinPrices && text.toLowerCase().includes('btc')) symbol = 'BTCUSD';
        else if (hasEthPrices && text.toLowerCase().includes('eth')) symbol = 'ETHUSD';
        else if (hasNasPrices) symbol = 'NAS100';
        else if (hasSpxPrices) symbol = 'SPX500'; 
        else if (hasGoldPrices) symbol = 'XAUUSD';
        else if (hasSilverPrices) symbol = 'XAGUSD';
        else if (hasOilPrices) symbol = 'USOIL';
        else if (hasJpyPrices) symbol = 'USDJPY';
        else if (hasForexPrices) symbol = 'EURUSD'; // Default forex
      }
      
      if (!symbol) {
        logger.warn('❌ No supported symbol detected');
        return null;
      }
      
      // Extract visual chart data (OCR from chart zones) - PRIORITY since ALL charts use this
      const visualData = this.extractVisualChartData(text);
      
      // Extract caption-based setup information as secondary
      const captionData = caption ? this.extractCaptionSetupData(caption) : null;
      
      // ENHANCED: Since ALL charts have highlighted zones, prioritize visual data
      if (visualData && visualData.zones.length > 0) {
        logger.info('📊 Using visual chart data (highlighted zones detected)');
        
        // Find entry zones (grey highlights) - ONLY what we need for 1:1 RR
        const entryZones = visualData.zones.filter(z => 
          z.name.toLowerCase().includes('selling') || 
          z.name.toLowerCase().includes('buying') ||
          z.name.toLowerCase().includes('entry')
        );
        
        // Determine action based on entry zones or price context
        if (entryZones.length > 0) {
          const entryZone = entryZones[0];
          const action = entryZone.name.toLowerCase().includes('selling') ? 'SELL' : 'BUY';
          const slDistance = this.getStopLossDistance(symbol);
          
          // Calculate 1:1 risk-reward targets based on stop loss distance
          const entryMid = (entryZone.min + entryZone.max) / 2;
          const stopLoss = action === 'SELL' ? entryZone.max + slDistance : entryZone.min - slDistance;
          const target1 = action === 'SELL' ? entryMid - slDistance : entryMid + slDistance;
          const calculatedTargets = [target1];
          
          return {
            symbol: symbol || 'XAUUSD',
            action,
            entryZone: { min: entryZone.min, max: entryZone.max },
            stopLoss,
            targets: calculatedTargets,
            reason: 'VISUAL CHART HIGHLIGHTED ZONES (1:1 RATIO)',
            plan: `${action} SETUP FROM GREY ENTRY ZONE WITH 1:1 RISK-REWARD`
          };
        }
        
        // Fallback: Use any detected zones and infer direction from price levels
        if (visualData.zones.length > 0) {
          const allValues = visualData.zones.map(z => z.value).sort((a, b) => a - b);
          const entryValue = allValues[Math.floor(allValues.length / 2)]; // Use middle value as entry
          
          // Infer direction from caption keywords or default to BUY
          const action = caption && /sell|short|bearish|down/i.test(caption) ? 'SELL' : 'BUY';
          const slDistance = this.getStopLossDistance(symbol);
          const stopLoss = action === 'SELL' ? entryValue + slDistance : entryValue - slDistance;
          const target1 = action === 'SELL' ? entryValue - slDistance : entryValue + slDistance;
          
          return {
            symbol: symbol || 'XAUUSD',
            action,
            entryZone: { min: entryValue - 2, max: entryValue + 2 },
            stopLoss,
            targets: [target1],
            reason: 'VISUAL CHART AUTO-DETECTED (1:1 RATIO)',
            plan: `${action} SETUP FROM CHART ANALYSIS WITH 1:1 RISK-REWARD`
          };
        }
      }
      
      // Secondary: Use caption data if visual parsing didn't work  
      if (captionData && captionData.action && captionData.entryZone) {
        logger.info('📝 Falling back to caption-based setup data');
        const entryMid = (captionData.entryZone.min + captionData.entryZone.max) / 2;
        const slDistance = this.getStopLossDistance(symbol);
        const stopLoss = captionData.stopLoss || (captionData.action === 'BUY' ? 
          captionData.entryZone.min - slDistance : captionData.entryZone.max + slDistance);
        const target1 = captionData.action === 'BUY' ? entryMid + slDistance : entryMid - slDistance;
        
        return {
          symbol: symbol || 'XAUUSD',
          action: captionData.action,
          entryZone: captionData.entryZone,
          stopLoss,
          targets: [target1],
          reason: (caption?.substring(0, 100) || 'VISUAL CHART SIGNAL') + ' (1:1 RATIO)',
          plan: `${captionData.action} SETUP FROM CAPTION WITH 1:1 RISK-REWARD`
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing visual chart signal:', error);
      return null;
    }
  }

  /**
   * Get appropriate stop loss distance for different instruments
   */
  private getStopLossDistance(symbol: string): number {
    // =================== INDICES ===================
    if (['NAS100', 'NASDAQ', 'US100', 'NDX'].includes(symbol)) return 50;   // NAS100: 50 points
    if (['SPX500', 'SPY', 'S&P500', 'SP500'].includes(symbol)) return 20;   // S&P500: 20 points  
    if (['DJ30', 'DJI', 'DOWJONES', 'DOW'].includes(symbol)) return 100;    // Dow Jones: 100 points
    if (['DAX40', 'DAX', 'GER40'].includes(symbol)) return 50;              // DAX: 50 points
    if (['FTSE100', 'UK100', 'UKX'].includes(symbol)) return 30;            // FTSE: 30 points
    if (['AUS200', 'ASX200'].includes(symbol)) return 25;                   // ASX200: 25 points
    if (['JPN225', 'NKY', 'NIKKEI'].includes(symbol)) return 100;           // Nikkei: 100 points
    
    // =================== METALS & COMMODITIES ===================
    if (['XAUUSD', 'GOLD', 'XAU'].includes(symbol)) return 15;              // Gold: $15
    if (['XAGUSD', 'SILVER', 'XAG'].includes(symbol)) return 0.50;          // Silver: $0.50
    if (['XPTUSD', 'PLATINUM', 'XPT'].includes(symbol)) return 25;          // Platinum: $25
    if (['XPDUSD', 'PALLADIUM', 'XPD'].includes(symbol)) return 50;         // Palladium: $50
    if (['USOIL', 'WTI', 'CRUDE', 'CL'].includes(symbol)) return 1.0;       // Crude Oil: $1.00
    if (['UKOIL', 'BRENT', 'BRN'].includes(symbol)) return 1.0;             // Brent Oil: $1.00
    if (['NGAS', 'NATGAS', 'NG'].includes(symbol)) return 0.10;             // Natural Gas: $0.10
    
    // =================== CRYPTOCURRENCIES ===================
    if (['BTCUSD', 'BITCOIN', 'BTC'].includes(symbol)) return 500;          // Bitcoin: $500
    if (['ETHUSD', 'ETHEREUM', 'ETH'].includes(symbol)) return 50;          // Ethereum: $50  
    if (['LTCUSD', 'LITECOIN', 'LTC'].includes(symbol)) return 10;          // Litecoin: $10
    
    // =================== MAJOR FOREX PAIRS ===================
    if (['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'].includes(symbol)) return 0.0020;  // 20 pips
    if (['USDCHF', 'USDCAD', 'USDJPY'].includes(symbol)) return 0.0020;            // 20 pips (JPY adjusted automatically)
    
    // =================== MINOR & CROSS PAIRS ===================
    if (['EURGBP', 'EURCHF', 'EURAUD', 'EURNZD', 'EURCAD'].includes(symbol)) return 0.0025;  // 25 pips
    if (['GBPCHF', 'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPJPY'].includes(symbol)) return 0.0030;  // 30 pips
    if (['AUDCHF', 'AUDNZD', 'AUDCAD', 'AUDJPY'].includes(symbol)) return 0.0025;            // 25 pips
    if (['NZDCHF', 'NZDCAD', 'NZDJPY'].includes(symbol)) return 0.0025;                      // 25 pips
    if (['CADCHF', 'CADJPY'].includes(symbol)) return 0.0025;                                // 25 pips
    if (['CHFJPY'].includes(symbol)) return 0.0025;                                          // 25 pips
    
    // =================== JPY PAIRS (Special handling) ===================
    if (symbol.includes('JPY')) {
      return 0.20;  // 20 pips for JPY pairs (different decimal places)
    }
    
    // =================== SMART FALLBACKS ===================
    // Generic forex pair (6 letters)
    if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol)) {
      return 0.0020;  // 20 pips for any forex pair
    }
    
    // Generic futures/commodities (3-5 letters)
    if (symbol.length >= 3 && symbol.length <= 5 && /^[A-Z]+$/.test(symbol)) {
      return 10;  // 10 points for futures/commodities
    }
    
    // Generic crypto pattern (ends with USD)
    if (symbol.endsWith('USD') && symbol.length > 6) {
      return 50;  // $50 for crypto pairs
    }
    
    // Default fallback
    return 15;
  }

  /**
   * Extract visual data from chart OCR text (highlighted zones, pip values)
   * Enhanced for ALL charts that use grey entry zones and target markings
   */
  private extractVisualChartData(text: string): { zones: Array<{name: string, min: number, max: number, value: number}> } | null {
    const zones: Array<{name: string, min: number, max: number, value: number}> = [];
    
    // ENHANCED PATTERNS for highlighted zone detection (ALL CHARTS format)
    // Grey highlights = Entry zones, Red/colored highlights = Targets
    
    // 1. ENTRY ZONES (Grey highlights) - Multiple patterns
    const entryPatterns = [
      /(?:Selling|Buying|Entry)\s+(?:Area|Zone)\s*\((\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)\)/gi,
      /(?:Selling|Buying|Entry)\s+(?:Area|Zone)\s*:?\s*(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)/gi,
      /(?:Grey|Gray)\s+(?:Zone|Area|Highlight)\s*:?\s*(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)/gi,
      /Entry\s*:?\s*(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)/gi,
      /(\d{4}\.\d{2,3})\s*[-–—]\s*(\d{4}\.\d{2,3})\s*(?:Entry|Zone)/gi
    ];
    
    // 2. TARGET ZONES (Red/colored highlights) - Multiple patterns  
    const targetPatterns = [
      /Target\s*(\d+)?\s*:?\s*(\d+\.?\d*)/gi,
      /TP\s*(\d+)?\s*:?\s*(\d+\.?\d*)/gi,
      /Take\s*Profit\s*(\d+)?\s*:?\s*(\d+\.?\d*)/gi,
      /Final\s*Target\s*:?\s*(\d+\.?\d*)/gi,
      /Red\s*(?:Zone|Highlight)\s*:?\s*(\d+\.?\d*)/gi,
      /(\d{4}\.\d{2,3})\s*(?:Target|TP)/gi
    ];
    
    // Extract ENTRY ZONES (Grey highlights)
    entryPatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        if (match.length >= 3) {
          const min = parseFloat(match[match.length - 2]);
          const max = parseFloat(match[match.length - 1]);
          if (!isNaN(min) && !isNaN(max)) {
            const name = match[0].includes('Selling') ? 'Selling Area' : 
                        match[0].includes('Buying') ? 'Buying Area' : 'Entry Zone';
            zones.push({ name, min, max, value: (min + max) / 2 });
          }
        }
      });
    });
    
    // Extract TARGET ZONES (Red/colored highlights)
    targetPatterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach((match, index) => {
        const valueIndex = match.length - 1;
        const value = parseFloat(match[valueIndex]);
        if (!isNaN(value) && value > 0) {
          const targetNum = match[1] ? match[1] : (index + 1).toString();
          const name = match[0].includes('Final') ? 'Final Target' : `Target ${targetNum}`;
          zones.push({ name, min: value, max: value, value });
        }
      });
    });
    
    // ENHANCED FALLBACK: Extract price numbers for different instruments
    if (zones.length === 0) {
      // Multiple price patterns for different instruments
      const pricePatterns = [
        /\b\d{5}\.\d{1,2}\b/g,  // NAS100: 18543.45
        /\b\d{4}\.\d{2,3}\b/g,  // Gold: 2543.456
        /\b[01]\.\d{4,5}\b/g,   // Forex: 1.95848 or 0.85643
        /\b\d{1,3}\.\d{2,4}\b/g // General: 95.4567
      ];
      
      let allPrices: number[] = [];
      pricePatterns.forEach(pattern => {
        const matches = text.match(pattern) || [];
        matches.forEach(match => {
          const value = parseFloat(match);
          if (!isNaN(value) && value > 0) {
            allPrices.push(value);
          }
        });
      });
      
      // Remove duplicates and sort
      allPrices = [...new Set(allPrices)].sort((a, b) => b - a);
      
      allPrices.forEach((price, index) => {
        const name = index === 0 ? 'Entry Zone' : `Target ${index}`;
        zones.push({ name, min: price, max: price, value: price });
      });
    }
    
    return zones.length > 0 ? { zones } : null;
  }

  /**
   * Extract setup data from caption text - simplified for 1:1 RR (no targets needed)
   */
  private extractCaptionSetupData(caption: string): { action: TradeAction, entryZone: {min: number, max: number}, stopLoss?: number } | null {
    // Pattern for buying/selling setup in caption
    const setupMatch = caption.match(/(bullish|bearish|buying|selling)\s+(?:setup|zone)/i);
    if (!setupMatch) return null;
    
    const action: TradeAction = setupMatch[1].toLowerCase().includes('bull') || setupMatch[1].toLowerCase().includes('buy') ? 'BUY' : 'SELL';
    
    // Extract entry zone: "buying zone (3352 – 3345)" or "retrace into the buying zone (3352 – 3345)"
    const entryMatch = caption.match(/(?:zone|area)\s*\((\d+\.?\d*)\s*[–-]\s*(\d+\.?\d*)\)/i);
    if (!entryMatch) return null;
    
    const entryMin = Math.min(parseFloat(entryMatch[1]), parseFloat(entryMatch[2]));
    const entryMax = Math.max(parseFloat(entryMatch[1]), parseFloat(entryMatch[2]));
    
    // Extract stop loss: "stop loss placed below 3338" or "SL below 3338"
    let stopLoss: number | undefined;
    const slMatch = caption.match(/(?:stop\s+loss|SL)\s+(?:placed\s+)?(?:below|above)\s+(\d+\.?\d*)/i);
    if (slMatch) {
      stopLoss = parseFloat(slMatch[1]);
    }
    
    return { action, entryZone: { min: entryMin, max: entryMax }, stopLoss };
  }

  /**
   * Parse standard format: "XAUUSD SELL 2440-2445 SL:2450 TP:2430,2420"
   */
  private parseStandardSignal(text: string): TradeSignal | null {
    const patterns = [
      // Pattern 1: SYMBOL ACTION ENTRY SL TP format
      /(\w+)\s+(BUY|SELL)\s+(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s+(?:SL|STOPLOSS|STOP LOSS)[\s:]*(\d+\.?\d*)\s+(?:TP|TARGET|TAKE PROFIT|TAKEPROFIT)[\s:]*([\d.,\s]+)/gi,
      
      // Pattern 2: More flexible format
      /(\w+)\s+(BUY|SELL)[\s\n]+(?:ENTRY|ENTER)[\s:]*(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)[\s\n]+(?:SL|STOPLOSS|STOP LOSS)[\s:]*(\d+\.?\d*)[\s\n]+(?:TP|TARGET|TARGETS)[\s:]*([\d.,\s\n]+)/gi,
      
      // Pattern 3: Compact format
      /(\w+)\s+(BUY|SELL)\s+(\d+\.?\d*)-(\d+\.?\d*)\s+SL(\d+\.?\d*)\s+TP([\d.,\s]+)/gi,

      // Pattern 4: Caption format with trading setup text (NEW)
      /#?(\w+)[\s\S]*?(BUY|SELL|Buying|Selling)[\s\S]*?(?:zone|levels?|area)[\s\S]*?\(?(\d+\.?\d*)[\s–-]+(\d+\.?\d*)\)?[\s\S]*?(?:SL|Stop|stop)[\s:]?(\d+\.?\d*)[\s\S]*?(?:TP|Target|targets?)[\s:]?([\d.\s\/,]+)/gi,
      
      // Pattern 5: Gold/XAUUSD specific format with detailed description
      /(?:#?XAUUSD|Gold)[\s\S]*?(Selling|Buying|SELL|BUY)[\s\S]*?(?:zone|resistance|support)[\s\S]*?\(?(\d+)[\s–-]+(\d+)\)?[\s\S]*?(?:SL|❌\s*SL)[\s:]?(\d+)[\s\S]*?(?:TP|🏹\s*TP)[\s:]*(\d+(?:\s*\/\s*\d+)?)/gi,
      
      // Pattern 6: Extract explicit entry zone with parentheses
      /(?:#?XAUUSD|Gold|EURUSD|GBPUSD)[\s\S]*?(Selling|Buying|SELL|BUY)[\s\S]*?\((\d+)[\s–-]+(\d+)\)[\s\S]*?(?:SL|❌\s*SL)[\s:]?(\d+)[\s\S]*?(?:TP|🏹\s*TP)[\s:]*(\d+(?:\s*\/\s*\d+)?)/gi
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        let [, symbol, action, entryMin, entryMax, stopLoss, targetsStr] = match;
        
        // Handle Gold -> XAUUSD conversion
        if (symbol.toUpperCase() === 'GOLD') {
          symbol = 'XAUUSD';
        }
        
        // Normalize action
        if (action.toLowerCase().includes('sell')) {
          action = 'SELL';
        } else if (action.toLowerCase().includes('buy')) {
          action = 'BUY';
        }
        
        if (this.isValidSymbol(symbol)) {
          const targets = this.parseTargets(targetsStr);
          
          // Validate that we have reasonable price levels
          const entryMinNum = parseFloat(entryMin);
          const entryMaxNum = parseFloat(entryMax);
          const stopLossNum = parseFloat(stopLoss);
          
          if (entryMinNum > 0 && entryMaxNum > 0 && stopLossNum > 0 && targets.length > 0) {
            return {
              symbol: symbol.toUpperCase(),
              action: action.toUpperCase() as TradeAction,
              entryZone: {
                min: entryMinNum,
                max: entryMaxNum
              },
              stopLoss: stopLossNum,
              targets,
              reason: this.extractReason(text),
              plan: this.extractPlan(text)
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Parse chart setup format with price levels
   */
  private parseChartSetupSignal(text: string): TradeSignal | null {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Look for symbol and timeframe
    const symbolLine = lines.find(line => this.isValidSymbol(line.split(' ')[0]));
    if (!symbolLine) return null;

    const symbol = symbolLine.split(' ')[0].toUpperCase();
    
    // Extract price levels
    const prices: number[] = [];
    for (const line of lines) {
      const price = this.extractPrice(line);
      if (price && price > 0) {
        prices.push(price);
      }
    }

    if (prices.length < 3) return null;

    // Sort prices to identify levels
    prices.sort((a, b) => b - a); // Descending order

    // Determine bias based on text content or price positioning
    const action = this.determineBias(text, prices);
    
    if (action === 'BUY') {
      // For buy: entry around middle, calculate 1:1 risk-reward
      const entryZone = this.createEntryZone(prices[Math.floor(prices.length / 2)]);
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const stopLoss = prices[prices.length - 1] - 10; // Below lowest level
      const slDistance = Math.abs(entryMid - stopLoss);
      const target1 = entryMid + slDistance; // 1:1 risk-reward
      
      return {
        symbol,
        action,
        entryZone,
        stopLoss,
        targets: [target1],
      };
    } else {
      // For sell: entry around middle-high, calculate 1:1 risk-reward
      const entryZone = this.createEntryZone(prices[1] || prices[0]);
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const stopLoss = prices[0] + 10; // Above highest level
      const slDistance = Math.abs(stopLoss - entryMid);
      const target1 = entryMid - slDistance; // 1:1 risk-reward
      
      return {
        symbol,
        action,
        entryZone,
        stopLoss,
        targets: [target1],
      };
    }
  }

  /**
   * Parse combined text and image signals
   */
  private parseCombinedTextImageSignal(text: string): TradeSignal | null {
    // Look for context clues in the text
    const hasBullishWords = /(?:bullish|buy|long|support|bounce|uptrend)/gi.test(text);
    const hasBearishWords = /(?:bearish|sell|short|resistance|rejection|downtrend)/gi.test(text);
    
    // Extract symbol from text
    const symbolMatch = text.match(new RegExp(`\\b(${[...this.FOREX_PAIRS, ...this.METAL_SYMBOLS, ...this.INDEX_SYMBOLS].join('|')})\\b`, 'gi'));
    if (!symbolMatch) return null;

    const symbol = symbolMatch[0].toUpperCase();
    
    // Extract prices
    const prices = this.extractAllPrices(text);
    if (prices.length < 2) return null;

    // Determine action based on context
    let action: TradeAction;
    if (hasBullishWords && !hasBearishWords) {
      action = 'BUY';
    } else if (hasBearishWords && !hasBullishWords) {
      action = 'SELL';
    } else {
      // Default based on price positioning
      action = this.determineBias(text, prices);
    }

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const midPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
    const entryZone = this.createEntryZone(midPrice);
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const stopLoss = action === 'BUY' ? sortedPrices[0] - 5 : sortedPrices[sortedPrices.length - 1] + 5;
    const slDistance = Math.abs(entryMid - stopLoss);
    const target1 = action === 'BUY' ? entryMid + slDistance : entryMid - slDistance;
    
    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets: [target1],
      reason: this.extractReason(text),
      plan: this.extractPlan(text)
    };
  }

  /**
   * Parse flexible format signals
   */
  private parseFlexibleFormatSignal(text: string): TradeSignal | null {
    // Extract symbol first
    const symbol = this.extractSymbol(text);
    if (!symbol) return null;

    // Extract action
    const action = this.extractAction(text);
    if (!action) return null;

    // Extract all numerical values
    const prices = this.extractAllPrices(text);
    if (prices.length < 3) return null;

    // Sort prices
    const sortedPrices = [...prices].sort((a, b) => a - b);

    let entryZone: { min: number; max: number };
    let stopLoss: number;
    let targets: number[];

    if (action === 'BUY') {
      // For BUY: calculate 1:1 risk-reward
      const entryPrices = sortedPrices.slice(0, 2);
      entryZone = { min: entryPrices[0], max: entryPrices[1] || entryPrices[0] + 5 };
      stopLoss = Math.min(...sortedPrices) - 10;
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const slDistance = Math.abs(entryMid - stopLoss);
      targets = [entryMid + slDistance];
    } else {
      // For SELL: calculate 1:1 risk-reward
      const entryPrices = sortedPrices.slice(-2);
      entryZone = { min: entryPrices[0], max: entryPrices[1] || entryPrices[0] + 5 };
      stopLoss = Math.max(...sortedPrices) + 10;
      const entryMid = (entryZone.min + entryZone.max) / 2;
      const slDistance = Math.abs(stopLoss - entryMid);
      targets = [entryMid - slDistance];
    }

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets
    };
  }

  /**
   * Parse price action signals from charts
   */
  private parsePriceActionSignal(text: string): TradeSignal | null {
    const symbol = this.extractSymbol(text);
    if (!symbol) return null;

    const prices = this.extractAllPrices(text);
    if (prices.length < 2) return null;

    // Look for price action keywords
    const keywordMapping = {
      'BUY': /(?:support|bounce|bullish|long|buy|uptrend|reversal up)/gi,
      'SELL': /(?:resistance|rejection|bearish|short|sell|downtrend|reversal down)/gi
    };

    let action: TradeAction = 'BUY';
    for (const [actionType, pattern] of Object.entries(keywordMapping)) {
      if (pattern.test(text)) {
        action = actionType as TradeAction;
        break;
      }
    }

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const midIndex = Math.floor(sortedPrices.length / 2);
    const entryPrice = sortedPrices[midIndex];
    const entryZone = this.createEntryZone(entryPrice);
    const entryMid = (entryZone.min + entryZone.max) / 2;
    const stopLoss = action === 'BUY' 
      ? sortedPrices[0] - 20 
      : sortedPrices[sortedPrices.length - 1] + 20;
    const slDistance = Math.abs(entryMid - stopLoss);
    const target1 = action === 'BUY' ? entryMid + slDistance : entryMid - slDistance;

    return {
      symbol,
      action,
      entryZone,
      stopLoss,
      targets: [target1]
    };
  }

  // Helper methods
  private cleanText(text: string): string {
    return text
      .replace(/[^\w\s\d.,:\-–]/g, ' ') // Remove special chars except common ones
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toUpperCase();
  }

  private isValidSymbol(symbol: string): boolean {
    const normalizedSymbol = symbol.toUpperCase();
    return [...this.FOREX_PAIRS, ...this.METAL_SYMBOLS, ...this.INDEX_SYMBOLS]
      .includes(normalizedSymbol);
  }

  private extractSymbol(text: string): string | null {
    const allSymbols = [...this.FOREX_PAIRS, ...this.METAL_SYMBOLS, ...this.INDEX_SYMBOLS];
    for (const symbol of allSymbols) {
      if (text.toUpperCase().includes(symbol)) {
        return symbol;
      }
    }
    return null;
  }

  private extractAction(text: string): TradeAction | null {
    const upperText = text.toUpperCase();
    if (/\b(?:SELL|SHORT|BEAR)\b/.test(upperText)) return 'SELL';
    if (/\b(?:BUY|LONG|BULL)\b/.test(upperText)) return 'BUY';
    return null;
  }

  private extractPrice(line: string): number | null {
    const priceMatch = line.match(/\d+\.?\d*/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[0]);
      return price > 0.001 && price < 100000 ? price : null;
    }
    return null;
  }

  private extractAllPrices(text: string): number[] {
    const prices: number[] = [];
    const priceRegex = /\d+\.?\d*/g;
    let match;
    
    while ((match = priceRegex.exec(text)) !== null) {
      const price = parseFloat(match[0]);
      if (price > 0.001 && price < 100000 && !prices.includes(price)) {
        prices.push(price);
      }
    }
    
    return prices;
  }

  private parseTargets(targetsStr: string): number[] {
    // Handle various target formats: "3357 / 3344", "2430,2420", "2430 2420", etc.
    return targetsStr
      .replace(/\s*\/\s*/g, ',') // Convert "/" to comma
      .split(/[,\s\n]+/)
      .map(t => parseFloat(t.trim()))
      .filter(t => !isNaN(t) && t > 0);
  }

  private determineBias(text: string, prices: number[]): TradeAction {
    const upperText = text.toUpperCase();
    
    // Check for explicit directional words
    const bullishWords = (upperText.match(/(?:BUY|LONG|BULLISH|SUPPORT|BOUNCE|UP)/g) || []).length;
    const bearishWords = (upperText.match(/(?:SELL|SHORT|BEARISH|RESISTANCE|REJECTION|DOWN)/g) || []).length;
    
    if (bullishWords > bearishWords) return 'BUY';
    if (bearishWords > bullishWords) return 'SELL';
    
    // Default based on price spread (wider spread suggests sell from top)
    const priceRange = Math.max(...prices) - Math.min(...prices);
    return priceRange > 50 ? 'SELL' : 'BUY';
  }

  private createEntryZone(centerPrice: number): { min: number; max: number } {
    const spread = centerPrice * 0.001; // 0.1% spread
    return {
      min: centerPrice - spread,
      max: centerPrice + spread
    };
  }

  private extractReason(text: string): string | undefined {
    const reasonPatterns = [
      /(?:reason|because|due to|analysis)[\s:]+([^.\n]+)/gi,
      /([^.\n]*(?:valid|holding|channel|trend|support|resistance)[^.\n]*)/gi
    ];

    for (const pattern of reasonPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractPlan(text: string): string | undefined {
    const planPatterns = [
      /(?:plan|strategy|wait for)[\s:]+([^.\n]+)/gi,
      /([^.\n]*(?:wait|patience|entry|proper)[^.\n]*)/gi
    ];

    for (const pattern of planPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private validateSignal(signal: TradeSignal): boolean {
    // Basic validation
    if (!signal.symbol || !signal.action) return false;
    if (!signal.entryZone || signal.entryZone.min >= signal.entryZone.max) return false;
    if (signal.stopLoss <= 0) return false;
    if (!signal.targets || signal.targets.length === 0) return false;

    // Logical validation
    if (signal.action === 'BUY') {
      // For BUY: SL should be below entry, targets above
      if (signal.stopLoss >= signal.entryZone.min) return false;
      if (signal.targets.some(t => t <= signal.entryZone.max)) return false;
    } else {
      // For SELL: SL should be above entry, targets below
      if (signal.stopLoss <= signal.entryZone.max) return false;
      if (signal.targets.some(t => t >= signal.entryZone.min)) return false;
    }

    // Risk-reward validation (minimum 1:1.2 ratio)
    const entryMid = (signal.entryZone.min + signal.entryZone.max) / 2;
    const risk = Math.abs(entryMid - signal.stopLoss);
    const reward = Math.abs(signal.targets[0] - entryMid);
    
    if (reward < risk * 1.2) {
      logger.warn('⚠️ Poor risk-reward ratio detected', { risk, reward });
      // Don't reject, but warn
    }

    return true;
  }

  /**
   * Public method for external validation (maintains compatibility)
   */
  validateTradeSignal(signal: TradeSignal): boolean {
    return this.validateSignal(signal);
  }
}